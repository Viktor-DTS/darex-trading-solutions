/**
 * Інтеграція з публічним API Prozorro (Україна).
 * Документація: https://prozorro-api-docs.readthedocs.io/
 */
const https = require('https');

const { detectCategory } = require('./tenderAnalysis');

const PROZORRO_API_BASE = 'https://public-api.prozorro.gov.ua/api/2.5';
const PROZORRO_SEARCH_URL = 'https://prozorro.gov.ua/api/search/tenders';

/** Prozorro використовує проміжний SSL-сертифікат — без цього Node fetch падає на Render. */
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

/** Ключові слова за замовчуванням — дизель-генератори, сервіс, монтаж, ДБЖ */
const DEFAULT_NICHE_KEYWORDS = [
  'дизель-генератор',
  'дизельний генератор',
  'дизель генератор',
  'генератор',
  'дес',
  'дг',
  'електростанція',
  'резервне живлення',
  'ups',
  'дбж',
  'ібп',
  'джерело безперебійного',
  'монтаж генератор',
  'пусконалагодження',
  'техобслуговування генератор',
  'ремонт генератор',
  'автозапуск',
];

const CPV_DG_CODES = [
  '31120000',
  '31100000',
  '45311200',
  '50532000',
];

const ACTIVE_STATUSES = new Set([
  'active.enquiries',
  'active.tendering',
  'active.auction',
  'active.qualification',
  'active.pre-qualification',
  'active',
]);

function prozorroRequest(url, { method = 'GET', body = null, timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body != null ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        agent: HTTPS_AGENT,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DTS-TenderDepartment/1.0',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Prozorro HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Prozorro JSON parse error: ${e.message}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(new Error(err.message || 'Prozorro request failed')));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Prozorro request timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function normalizeText(v) {
  return String(v || '').trim();
}

function pickRegion(entity) {
  if (!entity) return '';
  const addr = entity.address || entity.deliveryAddress || entity;
  return normalizeText(addr.region || addr.locality || '');
}

function pickDeliveryInfo(items = []) {
  const regions = new Set();
  const addresses = [];
  for (const item of items) {
    const da = item.deliveryAddress || item.deliveryLocation?.address;
    if (da) {
      const region = normalizeText(da.region || da.locality);
      if (region) regions.add(region);
      const full = [da.postalCode, da.region, da.locality, da.streetAddress].filter(Boolean).join(', ');
      if (full) addresses.push(full);
    }
  }
  return {
    region: [...regions].join('; ') || '',
    deliveryAddress: addresses.join(' | ') || '',
  };
}

function extractDocuments(documents = []) {
  return (documents || [])
    .filter((d) => d && (d.url || d.uri))
    .map((d) => ({
      id: d.id || d.documentOf || '',
      title: normalizeText(d.title || d.description || 'Документ'),
      url: d.url || d.uri || '',
      format: d.format || '',
    }));
}

function buildProzorroUrl(tender) {
  const tenderID = tender.tenderID || tender.id;
  if (tenderID && String(tenderID).startsWith('UA-')) {
    return `https://prozorro.gov.ua/tender/${tenderID}`;
  }
  if (tender.id && String(tender.id).startsWith('UA-')) {
    return `https://prozorro.gov.ua/tender/${tender.id}`;
  }
  if (tender.id) {
    return `https://prozorro.gov.ua/tender/${tender.id}`;
  }
  return '';
}

function statusLabelUk(status) {
  const map = {
    active: 'Активний',
    'active.enquiries': 'Період уточнень',
    'active.tendering': 'Прийом пропозицій',
    'active.auction': 'Аукціон',
    'active.qualification': 'Кваліфікація',
    'active.pre-qualification': 'Прекваліфікація',
    'active.awarded': 'Укладення договору',
    complete: 'Завершено',
    cancelled: 'Скасовано',
    unsuccessful: 'Неуспішний',
  };
  return map[status] || status || '—';
}

function normalizeTenderSummary(raw, detail) {
  const t = detail || raw || {};
  const delivery = pickDeliveryInfo(t.items || []);
  const procRegion = pickRegion(t.procuringEntity);
  const budget = t.value?.amount != null ? Number(t.value.amount) : null;
  const currency = t.value?.currency || 'UAH';
  const deadline = t.tenderPeriod?.endDate || t.enquiryPeriod?.endDate || t.dateEnd || null;
  const cpvCodes = (t.items || [])
    .flatMap((i) => (i.classification ? [i.classification.id] : []))
    .filter(Boolean);

  const tenderNumber = t.tenderID || (String(t.id || '').startsWith('UA-') ? t.id : '') || raw?.tenderID || '';
  const internalId = t.id && !String(t.id).startsWith('UA-') ? t.id : raw?.id || tenderNumber;

  return {
    prozorroId: internalId || tenderNumber,
    tenderNumber,
    title: normalizeText(t.title || raw?.title || ''),
    description: normalizeText(t.description || raw?.description || t.title || raw?.title || ''),
    status: t.status || raw?.status || '',
    statusLabel: statusLabelUk(t.status || raw?.status),
    budget,
    currency,
    budgetFormatted: budget != null ? `${budget.toLocaleString('uk-UA')} ${currency}` : '—',
    deadline,
    deadlineFormatted: deadline ? new Date(deadline).toLocaleString('uk-UA') : '—',
    customer: normalizeText(t.procuringEntity?.name || t.procuringEntity?.identifier?.legalName || raw?.procuringEntity?.name || ''),
    region: delivery.region || procRegion || pickRegion(raw?.procuringEntity) || '',
    deliveryAddress: delivery.deliveryAddress || '',
    cpvCodes,
    documents: extractDocuments(t.documents),
    prozorroUrl: buildProzorroUrl({ ...t, tenderID: tenderNumber || t.tenderID }),
    platformUrl: buildProzorroUrl({ ...t, tenderID: tenderNumber || t.tenderID }),
    source: 'prozorro',
    sourceLabel: 'Prozorro',
    method: t.procurementMethodType || '',
    numberOfTenderers: t.numberOfTenderers ?? null,
    datePublished: t.date || t.dateCreated || null,
  };
}

function textMatchesNiche(text, keywords) {
  const hay = String(text || '').toLowerCase();
  return keywords.some((kw) => hay.includes(String(kw).toLowerCase()));
}

function cpvMatchesNiche(cpvCodes) {
  return (cpvCodes || []).some((code) =>
    CPV_DG_CODES.some((prefix) => String(code).startsWith(prefix))
  );
}

function isActiveTender(status) {
  const s = String(status || '').toLowerCase();
  return ACTIVE_STATUSES.has(s) || s.startsWith('active');
}

/**
 * Офіційний пошук Prozorro — POST (GET не підтримується).
 */
async function searchProzorroWeb(query, { limit = 20 } = {}) {
  const body = {
    query_text: query || DEFAULT_NICHE_KEYWORDS.slice(0, 3).join(' '),
    limit: Math.min(limit, 50),
    page: 1,
  };
  const data = await prozorroRequest(PROZORRO_SEARCH_URL, { method: 'POST', body });
  const items = data?.data || [];
  return Array.isArray(items) ? items : [];
}

async function fetchTenderDetail(prozorroId) {
  const url = `${PROZORRO_API_BASE}/tenders/${encodeURIComponent(prozorroId)}`;
  const data = await prozorroRequest(url);
  return data?.data || data;
}

async function resolveInternalId(tenderIdOrUa) {
  const key = String(tenderIdOrUa || '').trim();
  if (!key) throw new Error('ID тендера не вказано');
  if (!key.startsWith('UA-')) return key;

  let path = `${PROZORRO_API_BASE.replace('https://public-api.prozorro.gov.ua', '')}/tenders?descending=1&limit=100&opt_fields=id,tenderID`;
  for (let page = 0; page < 8; page += 1) {
    const feed = await prozorroRequest(`https://public-api.prozorro.gov.ua${path}`);
    const found = (feed?.data || []).find((t) => t.tenderID === key);
    if (found?.id) return found.id;
    const next = feed?.next_page?.path;
    if (!next) break;
    path = next;
  }
  throw new Error(`Не вдалося знайти внутрішній ID для ${key}`);
}

async function enrichSearchItem(raw) {
  const summary = normalizeTenderSummary(raw, raw);
  if (summary.deadline && summary.description !== summary.title) {
    return summary;
  }
  try {
    const internalId = await resolveInternalId(raw.tenderID || raw.id);
    const detail = await fetchTenderDetail(internalId);
    return normalizeTenderSummary(raw, detail);
  } catch {
    return summary;
  }
}

/**
 * Fallback: feed + keyword filter.
 */
async function searchProzorroFeed(keywords, { limit = 30, maxPages = 3 } = {}) {
  let path = '/api/2.5/tenders?descending=1&limit=100&mode=_all_';
  const results = [];
  const seen = new Set();

  for (let page = 0; page < maxPages && results.length < limit; page += 1) {
    const feed = await prozorroRequest(`https://public-api.prozorro.gov.ua${path}`);
    const ids = (feed?.data || []).map((x) => x.id).filter(Boolean);

    for (const id of ids) {
      if (results.length >= limit || seen.has(id)) continue;
      seen.add(id);
      try {
        const detail = await fetchTenderDetail(id);
        if (!detail || !isActiveTender(detail.status)) continue;
        const hay = `${detail.title || ''} ${detail.description || ''}`;
        const cpv = (detail.items || []).map((i) => i.classification?.id).filter(Boolean);
        if (textMatchesNiche(hay, keywords) || cpvMatchesNiche(cpv)) {
          results.push(normalizeTenderSummary(detail, detail));
        }
      } catch {
        /* skip */
      }
    }

    const next = feed?.next_page?.path;
    if (!next) break;
    path = next;
  }
  return results;
}

async function searchTenders(options = {}) {
  const {
    query = '',
    category = '',
    region = '',
    minBudget = null,
    maxBudget = null,
    limit = 25,
    nicheOnly = true,
  } = options;

  const keywords = query
    ? query.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
    : DEFAULT_NICHE_KEYWORDS;

  const searchQuery = query || keywords.slice(0, 3).join(' ');
  let rawItems = [];

  try {
    rawItems = await searchProzorroWeb(searchQuery, { limit: limit * 2 });
  } catch (err) {
    console.warn('[tenderProzorro] search POST failed, using feed fallback:', err.message);
    return searchProzorroFeed(keywords, { limit, maxPages: 2 });
  }

  if (rawItems.length === 0) {
    return searchProzorroFeed(keywords, { limit, maxPages: 2 });
  }

  const normalized = [];
  const seen = new Set();

  for (const raw of rawItems) {
    if (normalized.length >= limit) break;
    const key = raw.tenderID || raw.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    try {
      if (!isActiveTender(raw.status)) continue;

      let summary = normalizeTenderSummary(raw, raw);

      if (nicheOnly) {
        const kw = query ? keywords : DEFAULT_NICHE_KEYWORDS;
        const hay = `${summary.title} ${summary.description}`;
        if (!textMatchesNiche(hay, kw) && !cpvMatchesNiche(summary.cpvCodes)) continue;
      }

      if (region && !summary.region.toLowerCase().includes(region.toLowerCase())) continue;
      if (minBudget != null && summary.budget != null && summary.budget < minBudget) continue;
      if (maxBudget != null && summary.budget != null && summary.budget > maxBudget) continue;

      if (category) {
        const cat = detectCategory(`${summary.title} ${summary.description}`);
        if (cat !== category && cat !== 'mixed') continue;
      }

      summary = normalizeTenderSummary(raw, raw);
      normalized.push(summary);
    } catch (err) {
      console.warn('[tenderProzorro] skip item', key, err.message);
    }
  }

  return normalized;
}

async function getTenderWithDetails(prozorroId) {
  const key = String(prozorroId || '').trim();
  const internalId = await resolveInternalId(key);
  const detail = await fetchTenderDetail(internalId);
  if (!detail) throw new Error('Тендер не знайдено');
  return normalizeTenderSummary(detail, detail);
}

module.exports = {
  DEFAULT_NICHE_KEYWORDS,
  CPV_DG_CODES,
  searchTenders,
  getTenderWithDetails,
  fetchTenderDetail,
  normalizeTenderSummary,
  statusLabelUk,
};
