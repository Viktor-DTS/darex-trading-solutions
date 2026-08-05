/**
 * Інтеграція з публічним API Prozorro (Україна).
 * Документація: https://prozorro-api-docs.readthedocs.io/
 */

const { detectCategory } = require('./tenderAnalysis');

const PROZORRO_API_BASE = 'https://public-api-prozorro.gov.ua/api/2.5';
const PROZORRO_SEARCH_BASE = 'https://prozorro.gov.ua/api/search/tenders';

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
  '31120000', // Generators
  '31100000', // Electrical machinery
  '45311200', // Electrical installation
  '50532000', // Repair and maintenance of generators
];

const ACTIVE_STATUSES = new Set([
  'active.enquiries',
  'active.tendering',
  'active.auction',
  'active.qualification',
  'active.pre-qualification',
]);

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DTS-TenderDepartment/1.0',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Prozorro HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
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
  if (tender.id) {
    return `https://prozorro.gov.ua/tender/${tender.id}`;
  }
  return '';
}

function normalizeTenderSummary(raw, detail) {
  const t = detail || raw || {};
  const delivery = pickDeliveryInfo(t.items || []);
  const procRegion = pickRegion(t.procuringEntity);
  const budget = t.value?.amount != null ? Number(t.value.amount) : null;
  const currency = t.value?.currency || 'UAH';
  const deadline = t.tenderPeriod?.endDate || t.enquiryPeriod?.endDate || null;
  const cpvCodes = (t.items || [])
    .flatMap((i) => (i.classification ? [i.classification.id] : []))
    .filter(Boolean);

  return {
    prozorroId: t.id || raw?.id || '',
    tenderNumber: t.tenderID || t.id || '',
    title: normalizeText(t.title || raw?.title || ''),
    description: normalizeText(t.description || raw?.description || ''),
    status: t.status || raw?.status || '',
    statusLabel: statusLabelUk(t.status || raw?.status),
    budget,
    currency,
    budgetFormatted: budget != null ? `${budget.toLocaleString('uk-UA')} ${currency}` : '—',
    deadline,
    deadlineFormatted: deadline ? new Date(deadline).toLocaleString('uk-UA') : '—',
    customer: normalizeText(t.procuringEntity?.name || raw?.procuringEntity?.name || ''),
    region: delivery.region || procRegion || '',
    deliveryAddress: delivery.deliveryAddress || '',
    cpvCodes,
    documents: extractDocuments(t.documents),
    prozorroUrl: buildProzorroUrl(t),
    method: t.procurementMethodType || '',
    numberOfTenderers: t.numberOfTenderers ?? null,
    datePublished: t.date || t.dateCreated || null,
  };
}

function statusLabelUk(status) {
  const map = {
    'active.enquiries': 'Період уточнень',
    'active.tendering': 'Прийом пропозицій',
    'active.auction': 'Аукціон',
    'active.qualification': 'Кваліфікація',
    'active.pre-qualification': 'Прекваліфікація',
    'active.awarded': 'Укладення договору',
    'complete': 'Завершено',
    'cancelled': 'Скасовано',
    'unsuccessful': 'Неуспішний',
  };
  return map[status] || status || '—';
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
  return ACTIVE_STATUSES.has(status);
}

/**
 * Пошук через офіційний search API Prozorro.
 */
async function searchProzorroWeb(query, { limit = 20, status = 'active.tendering' } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('query_text', query);
  if (status) params.set('status', status);
  params.set('limit', String(Math.min(limit, 50)));
  params.set('descending', '1');

  const url = `${PROZORRO_SEARCH_BASE}?${params.toString()}`;
  const data = await fetchJson(url);
  const items = data?.data || data?.items || data?.tenders || [];
  return Array.isArray(items) ? items : [];
}

/**
 * Отримати деталі тендера з public API.
 */
async function fetchTenderDetail(prozorroId) {
  const url = `${PROZORRO_API_BASE}/tenders/${encodeURIComponent(prozorroId)}`;
  const data = await fetchJson(url);
  return data?.data || data;
}

/**
 * Fallback: останні тендери з feed + фільтр за ключовими словами.
 */
async function searchProzorroFeed(keywords, { limit = 30 } = {}) {
  const url = `${PROZORRO_API_BASE}/tenders?descending=1&limit=${Math.min(limit * 3, 100)}&mode=_all_`;
  const feed = await fetchJson(url);
  const ids = (feed?.data || []).map((x) => x.id).filter(Boolean);
  const results = [];

  for (const id of ids) {
    if (results.length >= limit) break;
    try {
      const detail = await fetchTenderDetail(id);
      if (!detail || !isActiveTender(detail.status)) continue;
      const hay = `${detail.title || ''} ${detail.description || ''}`;
      const cpv = (detail.items || []).map((i) => i.classification?.id).filter(Boolean);
      if (textMatchesNiche(hay, keywords) || cpvMatchesNiche(cpv)) {
        results.push(normalizeTenderSummary(detail, detail));
      }
    } catch {
      /* skip broken tender */
    }
  }
  return results;
}

/**
 * Головний пошук: web search → деталі → нормалізація.
 */
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
    console.warn('[tenderProzorro] search API failed, using feed fallback:', err.message);
    return searchProzorroFeed(keywords, { limit });
  }

  const normalized = [];
  const seen = new Set();

  for (const raw of rawItems) {
    if (normalized.length >= limit) break;
    const id = raw.id || raw.tenderID;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    try {
      let detail = raw;
      if (!raw.title && !raw.description) {
        detail = await fetchTenderDetail(id);
      }
      if (!detail) continue;
      if (!isActiveTender(detail.status)) continue;

      const summary = normalizeTenderSummary(raw, detail);

      if (nicheOnly && query) {
        const hay = `${summary.title} ${summary.description}`;
        if (!textMatchesNiche(hay, keywords) && !cpvMatchesNiche(summary.cpvCodes)) continue;
      } else if (nicheOnly && !query) {
        const hay = `${summary.title} ${summary.description}`;
        if (!textMatchesNiche(hay, DEFAULT_NICHE_KEYWORDS) && !cpvMatchesNiche(summary.cpvCodes)) continue;
      }

      if (region && !summary.region.toLowerCase().includes(region.toLowerCase())) continue;
      if (minBudget != null && summary.budget != null && summary.budget < minBudget) continue;
      if (maxBudget != null && summary.budget != null && summary.budget > maxBudget) continue;

      if (category) {
        const cat = detectCategory(`${summary.title} ${summary.description}`);
        if (cat !== category && cat !== 'mixed') continue;
      }

      normalized.push(summary);
    } catch {
      /* skip */
    }
  }

  if (normalized.length === 0 && !query) {
    return searchProzorroFeed(keywords, { limit });
  }

  return normalized;
}

async function getTenderWithDetails(prozorroId) {
  const detail = await fetchTenderDetail(prozorroId);
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
