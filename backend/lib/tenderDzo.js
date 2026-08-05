/**
 * Інтеграція з пошуковим API DZO (Держзакупівлі.Онлайн).
 * https://www.dzo.com.ua/ — API: https://search.dzo.com.ua
 */
const https = require('https');
const { DEFAULT_NICHE_KEYWORDS, CPV_DG_CODES } = require('./tenderProzorro');
const { resolveTenderRegion, passesTenderFilters } = require('./tenderSearchUtils');

const DZO_SEARCH_BASE = 'https://search.dzo.com.ua';
const DZO_SITE_BASE = 'https://www.dzo.com.ua';

/** Окремі запити — DZO погано шукає по рядку з кількох слів одразу. */
const DEFAULT_DZO_SEARCH_QUERIES = [
  'дизель-генератор',
  'технічного обслуговування дизель',
  'техобслуговування генератор',
  'генератор',
  'монтаж генератор',
  'пусконалагодження',
  'UPS',
  'ДБЖ',
];

const DEFAULT_DZO_CPV_PREFIXES = [
  '31120000',
  '50532300',
  '50532000',
  '45311200',
];

const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const ACTIVE_DZO_STATUSES = [
  'active.enquiries',
  'active.tendering',
  'active.auction',
  'active.qualification',
  'active.pre-qualification',
];

function dzoRequest(path, { timeoutMs = 30000 } = {}) {
  const url = `${DZO_SEARCH_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        agent: HTTPS_AGENT,
        headers: {
          Accept: 'application/ld+json, application/json',
          'User-Agent': 'DTS-TenderDepartment/1.0',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`DZO HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`DZO JSON parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(new Error(err.message || 'DZO request failed')));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('DZO request timeout')));
    req.end();
  });
}

function normalizeText(v) {
  return String(v || '').trim();
}

function statusLabelUk(status) {
  const map = {
    active: 'Активний',
    'active.enquiries': 'Період уточнень',
    'active.tendering': 'Прийом пропозицій',
    'active.auction': 'Аукціон',
    'active.qualification': 'Кваліфікація',
    'active.pre-qualification': 'Прекваліфікація',
    complete: 'Завершено',
    cancelled: 'Скасовано',
    unsuccessful: 'Неуспішний',
  };
  return map[status] || status || '—';
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
    .filter((d) => d && d.url)
    .map((d) => ({
      id: d.id || '',
      title: normalizeText(d.title || d.description || 'Документ'),
      url: d.url || '',
      format: d.format || '',
    }));
}

function buildDzoUrl(internalId, tenderNumber) {
  if (internalId) {
    return `${DZO_SITE_BASE}/tenders/${internalId}`;
  }
  if (tenderNumber && String(tenderNumber).startsWith('UA-')) {
    return `${DZO_SITE_BASE}/tender/${tenderNumber}`;
  }
  return DZO_SITE_BASE;
}

function buildProzorroUrl(tenderNumber) {
  if (tenderNumber && String(tenderNumber).startsWith('UA-')) {
    return `https://prozorro.gov.ua/tender/${tenderNumber}`;
  }
  return '';
}

function normalizeDzoTender(raw) {
  const t = raw || {};
  const delivery = pickDeliveryInfo(t.items || []);
  const procRegion = normalizeText(t.procuringEntity?.address?.region || t.procuringEntity?.address?.locality || '');
  const budget = t.value?.amount != null ? Number(t.value.amount) : null;
  const currency = t.value?.currency || 'UAH';
  const deadline = t.tenderPeriod?.endDate || t.enquiryPeriod?.endDate || null;
  const tenderNumber = t.tenderID || '';
  const internalId = t.id || '';
  const cpvCodes = (t.items || [])
    .flatMap((i) => (i.classification ? [i.classification.id] : []))
    .filter(Boolean);

  const title = normalizeText(t.title || '');
  const description = normalizeText(t.description || t.title || '');

  return {
    prozorroId: internalId || tenderNumber,
    tenderNumber,
    title,
    description,
    status: t.status || '',
    statusLabel: statusLabelUk(t.status),
    budget,
    currency,
    budgetFormatted: budget != null ? `${budget.toLocaleString('uk-UA')} ${currency}` : '—',
    deadline,
    deadlineFormatted: deadline ? new Date(deadline).toLocaleString('uk-UA') : '—',
    customer: normalizeText(t.procuringEntity?.name || t.procuringEntity?.identifier?.legalName || ''),
    region: resolveTenderRegion({
      deliveryRegion: delivery.region,
      procRegion,
      title,
      description,
    }),
    deliveryAddress: delivery.deliveryAddress || '',
    cpvCodes,
    documents: extractDocuments(t.documents),
    prozorroUrl: buildProzorroUrl(tenderNumber),
    platformUrl: buildDzoUrl(internalId, tenderNumber),
    source: 'dzo',
    sourceLabel: 'DZO',
    method: t.procurementMethodType || t.procurementMethod || '',
    numberOfTenderers: t.numberOfTenderers ?? null,
    datePublished: t.date || t.dateCreated || null,
  };
}

function isActiveDzoStatus(status) {
  const s = String(status || '').toLowerCase();
  return ACTIVE_DZO_STATUSES.includes(s) || s === 'active' || s.startsWith('active.');
}

function buildSearchParams({ keyword = '', classification = '', region = '', minBudget = null, maxBudget = null, itemsPerPage = 20 } = {}) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('itemsPerPage', String(Math.min(Math.max(itemsPerPage, 10), 30)));
  params.set('order[dateModified]', 'desc');

  for (const st of ACTIVE_DZO_STATUSES) {
    params.append('status[]', st);
  }

  if (keyword) params.set('keyword', keyword);
  if (classification) params.append('classification[]', classification);
  if (region) params.append('items.deliveryAddress.region[]', region);
  if (minBudget != null) params.set('value.from', String(minBudget));
  if (maxBudget != null) params.set('value.to', String(maxBudget));

  return params;
}

async function fetchDzoMembers(searchOpts) {
  const params = buildSearchParams(searchOpts);
  const data = await dzoRequest(`/api/tenders?${params.toString()}`);
  return Array.isArray(data.member) ? data.member : [];
}

async function searchTendersDzo(options = {}) {
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

  const rawById = new Map();
  const baseOpts = { region, minBudget, maxBudget, itemsPerPage: 20 };

  const addMembers = (members, fromCpvSearch = false) => {
    for (const m of members) {
      if (!m?.id) continue;
      const existing = rawById.get(m.id);
      rawById.set(m.id, { raw: m, fromCpvSearch: fromCpvSearch || existing?.fromCpvSearch });
    }
  };

  if (query) {
    for (const kw of keywords) {
      const members = await fetchDzoMembers({ ...baseOpts, keyword: kw });
      addMembers(members, false);
      if (rawById.size >= limit * 2) break;
    }
  } else {
    for (const kw of DEFAULT_DZO_SEARCH_QUERIES) {
      try {
        const members = await fetchDzoMembers({ ...baseOpts, keyword: kw });
        addMembers(members, false);
      } catch (err) {
        console.warn('[tenderDzo] search failed for', kw, err.message);
      }
      if (rawById.size >= limit * 2) break;
    }

    for (const cpv of DEFAULT_DZO_CPV_PREFIXES) {
      try {
        const members = await fetchDzoMembers({ ...baseOpts, classification: `${cpv}-` });
        addMembers(members, true);
      } catch (err) {
        console.warn('[tenderDzo] CPV search failed for', cpv, err.message);
      }
    }
  }

  const normalized = [];
  for (const { raw, fromCpvSearch } of rawById.values()) {
    if (normalized.length >= limit) break;
    const summary = normalizeDzoTender(raw);
    if (passesTenderFilters(raw, summary, {
      query,
      keywords,
      category,
      region,
      minBudget,
      maxBudget,
      nicheOnly,
      defaultKeywords: DEFAULT_NICHE_KEYWORDS,
      cpvPrefixes: CPV_DG_CODES,
      isActive: isActiveDzoStatus,
      fromCpvSearch,
    })) {
      normalized.push(summary);
    }
  }

  normalized.sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return da - db;
  });

  return normalized;
}

async function getTenderDzoDetails(id) {
  const data = await dzoRequest(`/api/tenders/${encodeURIComponent(id)}`);
  if (!data || !data.id) throw new Error('Тендер DZO не знайдено');
  return normalizeDzoTender(data);
}

module.exports = {
  DZO_SEARCH_BASE,
  DZO_SITE_BASE,
  searchTendersDzo,
  getTenderDzoDetails,
  normalizeDzoTender,
};
