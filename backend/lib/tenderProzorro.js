/**
 * Інтеграція з публічним API Prozorro (Україна).
 * Документація: https://prozorro-api-docs.readthedocs.io/
 */
const https = require('https');

const { detectCategory } = require('./tenderAnalysis');
const {
  resolveTenderRegion,
  textMatchesNiche,
  cpvMatchesNiche,
  passesTenderFilters,
} = require('./tenderSearchUtils');

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
  'технічного обслуговування дизель',
  'ремонт генератор',
  'автозапуск',
];

/** Окремі запити — як у DZO, не склеювати в один рядок. */
const DEFAULT_PROZORRO_SEARCH_QUERIES = [
  'дизель-генератор',
  'технічного обслуговування дизель',
  'техобслуговування генератор',
  'генератор',
  'монтаж генератор',
  'пусконалагодження',
  'UPS',
  'ДБЖ',
];

/** Префікси CPV для post-filter (items[].classification). */
const CPV_DG_CODES = [
  '31120000',
  '31100000',
  '45311200',
  '50532000',
  '50532300',
];

/** Повні коди CPV з контрольною цифрою для web search API. */
const PROZORRO_CPV_SEARCH_CODES = [
  '31121100-1',
  '50532300-6',
];

const ACTIVE_STATUSES = new Set([
  'active.enquiries',
  'active.tendering',
  'active.auction',
  'active.qualification',
  'active.pre-qualification',
  'active',
]);

const PROZORRO_SEARCH_STATUSES = [
  'active.enquiries',
  'active.tendering',
  'active.auction',
  'active.qualification',
  'active.pre-qualification',
];

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
  const title = normalizeText(t.title || raw?.title || '');
  const description = normalizeText(t.description || raw?.description || t.title || raw?.title || '');

  return {
    prozorroId: internalId || tenderNumber,
    tenderNumber,
    title,
    description,
    status: t.status || raw?.status || '',
    statusLabel: statusLabelUk(t.status || raw?.status),
    budget,
    currency,
    budgetFormatted: budget != null ? `${budget.toLocaleString('uk-UA')} ${currency}` : '—',
    deadline,
    deadlineFormatted: deadline ? new Date(deadline).toLocaleString('uk-UA') : '—',
    customer: normalizeText(t.procuringEntity?.name || t.procuringEntity?.identifier?.legalName || raw?.procuringEntity?.name || ''),
    region: resolveTenderRegion({
      deliveryRegion: delivery.region,
      procRegion: procRegion || pickRegion(raw?.procuringEntity),
      title,
      description,
    }),
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

function isActiveTender(status) {
  const s = String(status || '').toLowerCase();
  return ACTIVE_STATUSES.has(s) || s.startsWith('active');
}

/**
 * Офіційний web-пошук Prozorro — POST з параметром `text` (не query_text).
 */
async function searchProzorroWeb({ text, cpv, page = 1 } = {}) {
  const body = {
    page,
    tender_status: PROZORRO_SEARCH_STATUSES,
  };
  if (text) body.text = text;
  if (cpv && cpv.length) body.cpv = cpv;

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

/**
 * Fallback: feed + keyword filter (повільно, лише останні закупівлі).
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
        if (textMatchesNiche(hay, keywords) || cpvMatchesNiche(cpv, CPV_DG_CODES)) {
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

function tenderKey(raw) {
  return raw?.tenderID || raw?.id || '';
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

  const rawByKey = new Map();

  const addItems = (items, fromCpvSearch = false) => {
    for (const raw of items) {
      const key = tenderKey(raw);
      if (!key) continue;
      const existing = rawByKey.get(key);
      if (!existing || fromCpvSearch) {
        rawByKey.set(key, { raw, fromCpvSearch: fromCpvSearch || existing?.fromCpvSearch });
      }
    }
  };

  try {
    if (query) {
      for (const kw of keywords) {
        try {
          const items = await searchProzorroWeb({ text: kw });
          addItems(items, false);
        } catch (err) {
          console.warn('[tenderProzorro] search failed for', kw, err.message);
        }
        if (rawByKey.size >= limit * 2) break;
      }
    } else {
      for (const kw of DEFAULT_PROZORRO_SEARCH_QUERIES) {
        try {
          const items = await searchProzorroWeb({ text: kw });
          addItems(items, false);
        } catch (err) {
          console.warn('[tenderProzorro] search failed for', kw, err.message);
        }
        if (rawByKey.size >= limit * 2) break;
      }

      for (const cpv of PROZORRO_CPV_SEARCH_CODES) {
        try {
          const items = await searchProzorroWeb({ cpv: [cpv] });
          addItems(items, true);
        } catch (err) {
          console.warn('[tenderProzorro] CPV search failed for', cpv, err.message);
        }
      }
    }
  } catch (err) {
    console.warn('[tenderProzorro] search failed, using feed fallback:', err.message);
    return searchProzorroFeed(keywords, { limit, maxPages: 2 });
  }

  if (rawByKey.size === 0) {
    return searchProzorroFeed(keywords, { limit, maxPages: 2 });
  }

  const normalized = [];
  for (const { raw, fromCpvSearch } of rawByKey.values()) {
    if (normalized.length >= limit) break;

    const summary = normalizeTenderSummary(raw, raw);
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
      isActive: isActiveTender,
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
