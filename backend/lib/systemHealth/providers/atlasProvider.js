/**
 * MongoDB Atlas — стан кластера, використання диска, рахунки організації.
 *
 * Атлас підтримує два способи автентифікації:
 *   1) Service Account (рекомендований): MONGODB_ATLAS_CLIENT_ID + MONGODB_ATLAS_CLIENT_SECRET
 *   2) Legacy API keys з HTTP Digest: MONGODB_ATLAS_PUBLIC_KEY + MONGODB_ATLAS_PRIVATE_KEY
 *
 * Безкоштовні кластери (M0) не віддають measurements через Admin API, тому
 * реальні цифри по об'єму беремо з самого підключення (dbStats/collStats) —
 * це працює завжди, навіть якщо ключі Atlas не налаштовані.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const { cached } = require('../cache');

const ATLAS_BASE = 'https://cloud.mongodb.com';
const ATLAS_ACCEPT = 'application/vnd.atlas.2025-03-12+json';
const TTL_MS = Number(process.env.SYSTEM_HEALTH_ATLAS_TTL_MS || 300_000);

/** Ліміти сховища для shared-тарифів (GB). Dedicated читаємо з diskSizeGB кластера. */
const SHARED_TIER_LIMITS_GB = { M0: 0.5, M2: 2, M5: 5 };

let tokenCache = { token: null, expiresAt: 0 };

function hasServiceAccount() {
  return Boolean(process.env.MONGODB_ATLAS_CLIENT_ID && process.env.MONGODB_ATLAS_CLIENT_SECRET);
}

function hasApiKeys() {
  return Boolean(process.env.MONGODB_ATLAS_PUBLIC_KEY && process.env.MONGODB_ATLAS_PRIVATE_KEY);
}

function isConfigured() {
  return hasServiceAccount() || hasApiKeys();
}

async function getServiceAccountToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const basic = Buffer.from(
    `${process.env.MONGODB_ATLAS_CLIENT_ID}:${process.env.MONGODB_ATLAS_CLIENT_SECRET}`,
  ).toString('base64');
  const response = await fetch(`${ATLAS_BASE}/api/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Atlas OAuth ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

/** Мінімальна реалізація RFC 2617 digest — Atlas використовує qop=auth з MD5. */
function buildDigestHeader(challenge, { method, uri, username, password }) {
  const params = {};
  const raw = challenge.replace(/^Digest\s+/i, '');
  for (const part of raw.match(/(\w+)=("[^"]*"|[^,]*)/g) || []) {
    const [key, ...rest] = part.split('=');
    params[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const qop = (params.qop || '').split(',')[0].trim() || 'auth';
  const ha1 = md5(`${username}:${params.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  const fields = [
    `username="${username}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${params.algorithm || 'MD5'}`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    `response="${response}"`,
  ];
  if (params.opaque) fields.push(`opaque="${params.opaque}"`);
  return `Digest ${fields.join(', ')}`;
}

async function atlasFetch(path) {
  const url = `${ATLAS_BASE}${path}`;

  if (hasServiceAccount()) {
    const token = await getServiceAccountToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ATLAS_ACCEPT } });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Atlas API ${response.status}: ${body.slice(0, 300)}`);
    }
    return response.json();
  }

  if (!hasApiKeys()) throw new Error('Ключі Atlas не налаштовані');

  const first = await fetch(url, { headers: { Accept: ATLAS_ACCEPT } });
  if (first.status !== 401) {
    if (!first.ok) throw new Error(`Atlas API ${first.status}`);
    return first.json();
  }
  const challenge = first.headers.get('www-authenticate');
  if (!challenge) throw new Error('Atlas не повернув digest-challenge');
  const authorization = buildDigestHeader(challenge, {
    method: 'GET',
    uri: path,
    username: process.env.MONGODB_ATLAS_PUBLIC_KEY,
    password: process.env.MONGODB_ATLAS_PRIVATE_KEY,
  });
  const second = await fetch(url, { headers: { Accept: ATLAS_ACCEPT, Authorization: authorization } });
  if (!second.ok) {
    const body = await second.text().catch(() => '');
    throw new Error(`Atlas API ${second.status}: ${body.slice(0, 300)}`);
  }
  return second.json();
}

/** Локальна статистика бази — джерело правди по об'єму, працює і без ключів Atlas. */
async function readLocalDatabaseStats(connection) {
  const conn = connection || mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    return { available: false, reason: 'Немає активного підключення до MongoDB' };
  }
  const db = conn.db;
  const result = { available: true, name: db.databaseName };

  try {
    const stats = await db.stats({ scale: 1 });
    result.dataSizeBytes = stats.dataSize || 0;
    result.storageSizeBytes = stats.storageSize || 0;
    result.indexSizeBytes = stats.indexSize || 0;
    result.totalSizeBytes = (stats.storageSize || 0) + (stats.indexSize || 0);
    result.objects = stats.objects || 0;
    result.collections = stats.collections || 0;
    result.indexes = stats.indexes || 0;
    result.avgObjSizeBytes = Math.round(stats.avgObjSize || 0);
  } catch (error) {
    result.available = false;
    result.reason = error.message;
    return result;
  }

  try {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const perCollection = await Promise.all(
      collections.slice(0, 120).map(async (item) => {
        try {
          const [collStats] = await db
            .collection(item.name)
            .aggregate([{ $collStats: { storageStats: {} } }], { maxTimeMS: 8000 })
            .toArray();
          const storage = collStats?.storageStats || {};
          const indexSizes = storage.indexSizes || {};
          return {
            name: item.name,
            count: storage.count || 0,
            dataSizeBytes: storage.size || 0,
            storageSizeBytes: storage.storageSize || 0,
            indexSizeBytes: storage.totalIndexSize || 0,
            avgObjSizeBytes: Math.round(storage.avgObjSize || 0),
            indexCount: Object.keys(indexSizes).length,
            indexSizes,
          };
        } catch {
          return null;
        }
      }),
    );
    result.collectionStats = perCollection.filter(Boolean).sort((a, b) => b.storageSizeBytes - a.storageSizeBytes);
  } catch {
    result.collectionStats = [];
  }

  try {
    const serverStatus = await db.admin().serverStatus();
    result.server = {
      version: serverStatus.version,
      uptimeSec: Math.round(serverStatus.uptime || 0),
      connectionsCurrent: serverStatus.connections?.current || 0,
      connectionsAvailable: serverStatus.connections?.available || 0,
      opcounters: serverStatus.opcounters || null,
      networkInBytes: serverStatus.network?.bytesIn || 0,
      networkOutBytes: serverStatus.network?.bytesOut || 0,
    };
  } catch {
    // M0/Flex забороняють serverStatus — це очікувано, не помилка.
    result.server = null;
  }

  const poolOptions = conn.client?.options || {};
  result.driverPool = {
    maxPoolSize: poolOptions.maxPoolSize ?? null,
    minPoolSize: poolOptions.minPoolSize ?? null,
    readyState: conn.readyState,
    host: conn.host || '',
  };

  return result;
}

/** Індекси, які ніколи не використовувались — кандидати на видалення (займають місце і сповільнюють запис). */
async function readIndexUsage(connection) {
  const conn = connection || mongoose.connection;
  if (!conn || conn.readyState !== 1) return [];
  try {
    const collections = await conn.db.listCollections({}, { nameOnly: true }).toArray();
    const rows = await Promise.all(
      collections.slice(0, 60).map(async (item) => {
        try {
          const stats = await conn.db.collection(item.name).aggregate([{ $indexStats: {} }], { maxTimeMS: 8000 }).toArray();
          return stats.map((index) => ({
            collection: item.name,
            index: index.name,
            ops: index.accesses?.ops ?? 0,
            since: index.accesses?.since || null,
          }));
        } catch {
          return [];
        }
      }),
    );
    return rows.flat();
  } catch {
    return [];
  }
}

function normalizeCluster(cluster) {
  const instanceSize =
    cluster?.replicationSpecs?.[0]?.regionConfigs?.[0]?.electableSpecs?.instanceSize ||
    cluster?.providerSettings?.instanceSizeName ||
    '';
  const diskSizeGb =
    cluster?.replicationSpecs?.[0]?.regionConfigs?.[0]?.electableSpecs?.diskSizeGB ||
    cluster?.diskSizeGB ||
    SHARED_TIER_LIMITS_GB[instanceSize] ||
    null;
  return {
    id: cluster?.id,
    name: cluster?.name,
    stateName: cluster?.stateName,
    mongoDBVersion: cluster?.mongoDBVersion,
    instanceSize,
    diskSizeGb,
    paused: Boolean(cluster?.paused),
    backupEnabled: Boolean(cluster?.backupEnabled ?? cluster?.pitEnabled),
    createDate: cluster?.createDate || null,
    provider:
      cluster?.replicationSpecs?.[0]?.regionConfigs?.[0]?.providerName || cluster?.providerSettings?.providerName || '',
    region: cluster?.replicationSpecs?.[0]?.regionConfigs?.[0]?.regionName || cluster?.providerSettings?.regionName || '',
    isShared: ['M0', 'M2', 'M5'].includes(instanceSize),
  };
}

async function fetchAtlasApiState() {
  const groupId = process.env.MONGODB_ATLAS_GROUP_ID || process.env.MONGODB_ATLAS_PROJECT_ID || '';
  const orgId = process.env.MONGODB_ATLAS_ORG_ID || '';
  const out = { clusters: [], invoices: [], pendingInvoice: null, groupId, orgId, errors: [] };

  if (!groupId) {
    const groups = await atlasFetch('/api/atlas/v2/groups?itemsPerPage=20').catch((e) => {
      out.errors.push(`groups: ${e.message}`);
      return null;
    });
    out.groups = (groups?.results || []).map((g) => ({ id: g.id, name: g.name, orgId: g.orgId }));
    if (out.groups?.length === 1) out.groupId = out.groups[0].id;
  }

  const effectiveGroupId = out.groupId || groupId;
  if (effectiveGroupId) {
    const clusters = await atlasFetch(`/api/atlas/v2/groups/${effectiveGroupId}/clusters?itemsPerPage=20`).catch((e) => {
      out.errors.push(`clusters: ${e.message}`);
      return null;
    });
    out.clusters = (clusters?.results || []).map(normalizeCluster);
  }

  const effectiveOrgId = orgId || out.groups?.[0]?.orgId || '';
  if (effectiveOrgId) {
    out.orgId = effectiveOrgId;
    const invoices = await atlasFetch(`/api/atlas/v2/orgs/${effectiveOrgId}/invoices?itemsPerPage=12`).catch((e) => {
      out.errors.push(`invoices: ${e.message}`);
      return null;
    });
    out.invoices = (invoices?.results || []).map((invoice) => ({
      id: invoice.id,
      status: invoice.statusName,
      amountCents: invoice.amountBilledCents ?? invoice.amountPaidCents ?? 0,
      amountUsd: (invoice.amountBilledCents ?? invoice.amountPaidCents ?? 0) / 100,
      startDate: invoice.startDate,
      endDate: invoice.endDate,
      created: invoice.created,
      salesTaxCents: invoice.salesTaxCents || 0,
      creditsCents: invoice.startingBalanceCents || 0,
    }));
    const pending = await atlasFetch(`/api/atlas/v2/orgs/${effectiveOrgId}/invoices/pending`).catch(() => null);
    if (pending) {
      out.pendingInvoice = {
        amountUsd: (pending.amountBilledCents ?? 0) / 100,
        startDate: pending.startDate,
        endDate: pending.endDate,
        status: pending.statusName,
      };
    }
  }

  return out;
}

async function fetchMongoState({ connection, force = false } = {}) {
  return cached(
    'atlas:state',
    TTL_MS,
    async () => {
      const [local, indexUsage] = await Promise.all([
        readLocalDatabaseStats(connection),
        readIndexUsage(connection),
      ]);

      let api = null;
      if (isConfigured()) {
        api = await fetchAtlasApiState().catch((error) => ({ errors: [error.message], clusters: [], invoices: [] }));
      }

      const cluster = api?.clusters?.[0] || null;
      const envLimitMb = Number(process.env.MONGODB_STORAGE_LIMIT_MB || 0);
      const limitBytes = envLimitMb
        ? envLimitMb * 1024 * 1024
        : cluster?.diskSizeGb
          ? cluster.diskSizeGb * 1024 ** 3
          : 512 * 1024 * 1024;

      // Без активного підключення розмір невідомий — саме null, а не 0, щоб борд не показував хибне «0%».
      const usedBytes = local.available ? local.totalSizeBytes || 0 : null;

      return {
        configured: isConfigured(),
        authMode: hasServiceAccount() ? 'service-account' : hasApiKeys() ? 'api-key' : 'none',
        local,
        indexUsage,
        cluster,
        clusters: api?.clusters || [],
        groups: api?.groups || [],
        invoices: api?.invoices || [],
        pendingInvoice: api?.pendingInvoice || null,
        apiErrors: api?.errors || [],
        storage: {
          usedBytes,
          limitBytes,
          percent: usedBytes != null && limitBytes ? (usedBytes / limitBytes) * 100 : null,
          limitSource: envLimitMb ? 'env' : cluster?.diskSizeGb ? 'atlas' : 'default-M0',
        },
        billingUrl: api?.orgId
          ? `https://cloud.mongodb.com/v2#/org/${api.orgId}/billing/overview`
          : 'https://cloud.mongodb.com/v2#/billing',
      };
    },
    { force },
  );
}

module.exports = { fetchMongoState, isConfigured, readLocalDatabaseStats };
