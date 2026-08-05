/**
 * Інтеграція з пошуковим API DZO (Держзакупівлі.Онлайн).
 * https://www.dzo.com.ua/ — API: https://search.dzo.com.ua
 */
const https = require('https');
const { detectCategory } = require('./tenderAnalysis');
const { DEFAULT_NICHE_KEYWORDS, CPV_DG_CODES } = require('./tenderProzorro');

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

function isVagueRegion(region) {
  const r = String(region || '').toLowerCase();
  return !r || r.includes('відповідно') || r.includes('документац') || r.includes('згідно');
}

function regionFromTitleText(titleHay) {
  const oblastMatch = String(titleHay || '').match(
    /[А-ЯІЇЄ][а-яіїє'-]+(?:ська|ський)(?:\s*(?:та|і)\s*[А-ЯІЇЄ][а-яіїє'-]+(?:ська|ський))*\s*обл/
  );
  return oblastMatch ? oblastMatch[0] : '';
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

  const titleHay = `${t.title || ''} ${t.description || ''}`;
  const regionFromTitle = regionFromTitleText(titleHay);
  const deliveryRegion = isVagueRegion(delivery.region) ? '' : delivery.region;

  return {
    prozorroId: internalId || tenderNumber,
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
    region: deliveryRegion || regionFromTitle || procRegion || '',
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

function passesFilters(raw, summary, { query, keywords, category, region, minBudget, maxBudget, nicheOnly }) {
  if (!isActiveDzoStatus(raw.status)) return false;

  if (region && !summary.region.toLowerCase().includes(region.toLowerCase())) {
    const hay = `${summary.title} ${summary.description}`.toLowerCase();
    if (!hay.includes(region.toLowerCase())) return false;
  }
  if (minBudget != null && summary.budget != null && summary.budget < minBudget) return false;
  if (maxBudget != null && summary.budget != null && summary.budget > maxBudget) return false;

  if (nicheOnly) {
    const kw = query ? keywords : DEFAULT_NICHE_KEYWORDS;
    const hay = `${summary.title} ${summary.description}`;
    if (!textMatchesNiche(hay, kw) && !cpvMatchesNiche(summary.cpvCodes)) return false;
  }

  if (category) {
    const cat = detectCategory(`${summary.title} ${summary.description}`);
    if (cat !== category && cat !== 'mixed') return false;
  }

  return true;
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

  if (query) {
    for (const kw of keywords) {
      const members = await fetchDzoMembers({ ...baseOpts, keyword: kw });
      for (const m of members) {
        if (m?.id) rawById.set(m.id, m);
      }
      if (rawById.size >= limit * 2) break;
    }
  } else {
    for (const kw of DEFAULT_DZO_SEARCH_QUERIES) {
      try {
        const members = await fetchDzoMembers({ ...baseOpts, keyword: kw });
        for (const m of members) {
          if (m?.id) rawById.set(m.id, m);
        }
      } catch (err) {
        console.warn('[tenderDzo] search failed for', kw, err.message);
      }
      if (rawById.size >= limit * 2) break;
    }

    if (rawById.size < limit) {
      for (const cpv of DEFAULT_DZO_CPV_PREFIXES) {
        try {
          const members = await fetchDzoMembers({ ...baseOpts, classification: `${cpv}-` });
          for (const m of members) {
            if (m?.id) rawById.set(m.id, m);
          }
        } catch (err) {
          console.warn('[tenderDzo] CPV search failed for', cpv, err.message);
        }
        if (rawById.size >= limit * 2) break;
      }
    }
  }

  const normalized = [];
  for (const raw of rawById.values()) {
    if (normalized.length >= limit) break;
    const summary = normalizeDzoTender(raw);
    if (passesFilters(raw, summary, { query, keywords, category, region, minBudget, maxBudget, nicheOnly })) {
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
