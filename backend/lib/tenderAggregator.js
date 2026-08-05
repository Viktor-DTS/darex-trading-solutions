/**
 * Агрегатор пошуку тендерів з кількох майданчиків.
 */
const { searchTenders: searchProzorro, getTenderWithDetails, DEFAULT_NICHE_KEYWORDS } = require('./tenderProzorro');
const { searchTendersDzo, getTenderDzoDetails } = require('./tenderDzo');
const { parseTenderQuery } = require('./tenderSearchUtils');

const SOURCES = {
  prozorro: { id: 'prozorro', label: 'Prozorro', url: 'https://prozorro.gov.ua' },
  dzo: { id: 'dzo', label: 'DZO', url: 'https://www.dzo.com.ua' },
};

function dedupeKey(t) {
  if (t.tenderNumber && String(t.tenderNumber).startsWith('UA-')) {
    return `ua:${t.tenderNumber}`;
  }
  const src = t.source || 'unknown';
  return `${src}:${t.prozorroId || t.tenderNumber || ''}`;
}

function dedupeTenders(items) {
  const seen = new Set();
  const out = [];
  for (const t of items) {
    const key = dedupeKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function sortByDeadline(items) {
  return [...items].sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return da - db;
  });
}

async function lookupTenderByQuery(query) {
  const parsed = parseTenderQuery(query);
  if (!parsed) return null;

  if (parsed.type === 'dzo_id') {
    return getTenderDzoDetails(parsed.id);
  }

  if (parsed.type === 'ua') {
    try {
      return await getTenderWithDetails(parsed.id);
    } catch (prozorroErr) {
      const dzoItems = await searchTendersDzo({
        query: parsed.id,
        limit: 5,
        nicheOnly: false,
      });
      const found = dzoItems.find((t) => t.tenderNumber === parsed.id);
      if (found) return getTenderDzoDetails(found.prozorroId);
      throw prozorroErr;
    }
  }

  return null;
}

async function searchTendersAll(options = {}) {
  const source = String(options.source || 'all').toLowerCase();
  const limit = options.limit || 25;
  const warnings = [];
  const tasks = [];

  if (source === 'all' || source === 'prozorro') {
    tasks.push(
      searchProzorro({ ...options, limit })
        .then((items) => items.map((t) => ({
          ...t,
          source: t.source || 'prozorro',
          sourceLabel: t.sourceLabel || 'Prozorro',
          platformUrl: t.platformUrl || t.prozorroUrl,
        })))
        .catch((e) => {
          warnings.push(`Prozorro: ${e.message}`);
          return [];
        })
    );
  }

  if (source === 'all' || source === 'dzo') {
    tasks.push(
      searchTendersDzo({ ...options, limit })
        .catch((e) => {
          warnings.push(`DZO: ${e.message}`);
          return [];
        })
    );
  }

  const batches = await Promise.all(tasks);
  let items = dedupeTenders(batches.flat());
  items = sortByDeadline(items).slice(0, limit);

  return {
    items,
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
  lookupTenderByQuery,
  getTenderDetails,
  dedupeTenders,
};
