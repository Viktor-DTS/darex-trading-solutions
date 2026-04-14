/**
 * Підбір зображень з Wikimedia Commons за текстом запиту (той самий хостинг, що й для імпорту в Cloudinary).
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

const USER_AGENT =
  process.env.PRODUCT_ASSISTANT_USER_AGENT ||
  'DarexTradingSolutions/1.0 (product-card-assistant; warehouse)';

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function extractHeadTerm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([\p{L}]+(?:\s+[\p{L}]+){0,2})/u);
  if (m && m[1].trim().length >= 2) return m[1].trim();
  return s;
}

/** Варіанти пошуку: повна назва, «голова», без хвоста розмірів, латинські синоніми для типових категорій. */
function commonsSearchVariants(userQuery) {
  const trimmed = String(userQuery || '').trim();
  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  push(trimmed);
  const head = extractHeadTerm(trimmed);
  if (head && head !== trimmed) push(head);
  const noTrail = trimmed.replace(/\s+\d{1,4}\s*[-–]\s*\d{1,4}\s*$/i, '').trim();
  if (noTrail.length >= 2 && noTrail !== trimmed) push(noTrail);
  if (/[а-яіїєґ]/i.test(trimmed)) {
    if (/хомут/i.test(trimmed)) {
      push('hose clamp');
      push('worm drive hose clamp');
    }
    if (/дюбел|анкер/i.test(trimmed)) {
      push('wall plug dowel');
    }
    if (/генератор|дизел/i.test(trimmed)) {
      push('diesel generator');
    }
  }
  return out.slice(0, 5);
}

async function commonsSearchFileTitles(searchQuery, limit) {
  const sp = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: searchQuery,
    srnamespace: '6',
    srlimit: String(Math.min(Math.max(limit, 1), 24)),
    format: 'json',
    utf8: '1',
  });
  const data = await fetchJson(`${COMMONS_API}?${sp}`);
  const hits = data?.query?.search;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => h.title).filter(Boolean);
}

async function commonsImageInfoForTitles(titles) {
  if (!titles.length) return [];
  const sp = new URLSearchParams({
    action: 'query',
    titles: titles.slice(0, 12).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|thumburl|mime',
    iiurlwidth: '320',
    format: 'json',
    utf8: '1',
  });
  const data = await fetchJson(`${COMMONS_API}?${sp}`);
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== 'object') return [];
  return Object.values(pages);
}

function allowedThumbHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h.endsWith('wikimedia.org') || h.endsWith('wikipedia.org');
}

function pickImageUrl(ii) {
  if (!ii || typeof ii !== 'object') return null;
  const mime = String(ii.mime || '');
  if (!mime.startsWith('image/')) return null;
  const raw = ii.thumburl || ii.url;
  if (!raw) return null;
  let hostname;
  try {
    hostname = new URL(String(raw)).hostname;
  } catch (_) {
    return null;
  }
  if (!allowedThumbHost(hostname)) return null;
  return String(raw);
}

/**
 * @param {string} userQuery
 * @param {{ maxImages?: number }} [opts]
 * @returns {Promise<Array<{ id: string, url: string, title: string }>>}
 */
async function commonsSuggestImages(userQuery, opts = {}) {
  const maxImages = Math.min(16, Math.max(1, opts.maxImages || 10));
  const variants = commonsSearchVariants(userQuery);
  const seenTitles = new Set();
  const titles = [];

  for (const v of variants) {
    let batch;
    try {
      batch = await commonsSearchFileTitles(v, 18);
    } catch (e) {
      console.warn('[product-card-assistant] Commons search:', e.message);
      continue;
    }
    for (const t of batch) {
      if (seenTitles.has(t)) continue;
      seenTitles.add(t);
      titles.push(t);
      if (titles.length >= 14) break;
    }
    if (titles.length >= 8) break;
  }

  if (!titles.length) return [];

  let pageList;
  try {
    pageList = await commonsImageInfoForTitles(titles);
  } catch (e) {
    console.warn('[product-card-assistant] Commons imageinfo:', e.message);
    return [];
  }

  const images = [];
  const seenUrl = new Set();
  for (const page of pageList) {
    const title = page.title || '';
    const ii = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    const url = pickImageUrl(ii);
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);
    images.push({
      id: `commons-${images.length + 1}`,
      url,
      title: title.replace(/^File:/i, '') || title,
    });
    if (images.length >= maxImages) break;
  }
  return images;
}

module.exports = { commonsSuggestImages, commonsSearchVariants };
