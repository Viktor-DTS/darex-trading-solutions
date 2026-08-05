/**
 * Агрегатор пошуку тендерів з кількох майданчиків.
 */
const { searchTenders: searchProzorro, getTenderWithDetails, DEFAULT_NICHE_KEYWORDS } = require('./tenderProzorro');
const { searchTendersDzo, getTenderDzoDetails } = require('./tenderDzo');

const SOURCES = {
  prozorro: { id: 'prozorro', label: 'Prozorro', url: 'https://prozorro.gov.ua' },
  dzo: { id: 'dzo', label: 'DZO', url: 'https://www.dzo.com.ua' },
};

function dedupeTenders(items) {
  const seen = new Set();
  const out = [];
  for (const t of items) {
    const key = t.tenderNumber || t.prozorroId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function searchTendersAll(options = {}) {
  const source = String(options.source || 'all').toLowerCase();
  const limit = options.limit || 25;
  const warnings = [];
  let items = [];

  if (source === 'all' || source === 'prozorro') {
    try {
      const prozorroItems = await searchProzorro({ ...options, limit });
      items.push(...prozorroItems.map((t) => ({
        ...t,
        source: t.source || 'prozorro',
        sourceLabel: t.sourceLabel || 'Prozorro',
        platformUrl: t.platformUrl || t.prozorroUrl,
      })));
    } catch (e) {
      warnings.push(`Prozorro: ${e.message}`);
    }
  }

  if (source === 'all' || source === 'dzo') {
    try {
      const dzoItems = await searchTendersDzo({ ...options, limit });
      items.push(...dzoItems);
    } catch (e) {
      warnings.push(`DZO: ${e.message}`);
    }
  }

  items = dedupeTenders(items);

  if (source === 'all') {
    items.sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });
  }

  return {
    items: items.slice(0, limit),
    warnings,
    query: options.query || DEFAULT_NICHE_KEYWORDS.slice(0, 3).join(' '),
  };
}

async function getTenderDetails(id, source = 'prozorro') {
  const src = String(source || 'prozorro').toLowerCase();
  if (src === 'dzo') return getTenderDzoDetails(id);
  return getTenderWithDetails(id);
}

module.exports = {
  SOURCES,
  searchTendersAll,
  getTenderDetails,
  dedupeTenders,
};
