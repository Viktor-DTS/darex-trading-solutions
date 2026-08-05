/**
 * Інтеграція з пошуковим API DZO (Держзакупівлі.Онлайн).
 * https://www.dzo.com.ua/ — API: https://search.dzo.com.ua
 */
const https = require('https');
const { detectCategory } = require('./tenderAnalysis');
const { DEFAULT_NICHE_KEYWORDS, CPV_DG_CODES } = require('./tenderProzorro');

const DZO_SEARCH_BASE = 'https://search.dzo.com.ua';
const DZO_SITE_BASE = 'https://www.dzo.com.ua';

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

function buildDzoUrl(tenderNumber) {
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
  const cpvCodes = (t.items || [])
    .flatMap((i) => (i.classification ? [i.classification.id] : []))
    .filter(Boolean);

  return {
    prozorroId: t.id || tenderNumber,
    tenderNumber,
    title: normalizeText(t.title || ''),
    description: normalizeText(t.description || t.title || ''),
    status: t.status || '',
    statusLabel: statusLabelUk(t.status),
    budget,
    currency,
    budgetFormatted: budget != null ? `${budget.toLocaleString('uk-UA')} ${currency}` : '—',
    deadline,
    deadlineFormatted: deadline ? new Date(deadline).toLocaleString('uk-UA') : '—',
    customer: normalizeText(t.procuringEntity?.name || t.procuringEntity?.identifier?.legalName || ''),
    region: delivery.region || procRegion || '',
    deliveryAddress: delivery.deliveryAddress || '',
    cpvCodes,
    documents: extractDocuments(t.documents),
    prozorroUrl: buildProzorroUrl(tenderNumber),
    platformUrl: buildDzoUrl(tenderNumber),
    source: 'dzo',
    sourceLabel: 'DZO',
    method: t.procurementMethodType || t.procurementMethod || '',
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

function isActiveDzoStatus(status) {
  const s = String(status || '').toLowerCase();
  return ACTIVE_DZO_STATUSES.includes(s) || s === 'active' || s.startsWith('active.');
}

function buildSearchParams(options = {}) {
  const {
    query = '',
    region = '',
    minBudget = null,
    maxBudget = null,
    limit = 25,
  } = options;

  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('itemsPerPage', String(Math.min(Math.max(limit, 10), 30)));
  params.set('order[dateModified]', 'desc');

  for (const st of ACTIVE_DZO_STATUSES) {
    params.append('status[]', st);
  }

  const keywords = query
    ? query.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
    : DEFAULT_NICHE_KEYWORDS.slice(0, 3);
  params.set('keyword', query || keywords.join(' '));

  if (region) params.append('items.deliveryAddress.region[]', region);
  if (minBudget != null) params.set('value.from', String(minBudget));
  if (maxBudget != null) params.set('value.to', String(maxBudget));

  return params;
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

  const params = buildSearchParams({ query, region, minBudget, maxBudget, limit: limit * 2 });
  const data = await dzoRequest(`/api/tenders?${params.toString()}`);
  const members = Array.isArray(data.member) ? data.member : [];

  const normalized = [];
  for (const raw of members) {
    if (normalized.length >= limit) break;
    if (!isActiveDzoStatus(raw.status)) continue;

    const summary = normalizeDzoTender(raw);

    if (nicheOnly) {
      const kw = query ? keywords : DEFAULT_NICHE_KEYWORDS;
      const hay = `${summary.title} ${summary.description}`;
      if (!textMatchesNiche(hay, kw) && !cpvMatchesNiche(summary.cpvCodes)) continue;
    }

    if (category) {
      const cat = detectCategory(`${summary.title} ${summary.description}`);
      if (cat !== category && cat !== 'mixed') continue;
    }

    normalized.push(summary);
  }

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
