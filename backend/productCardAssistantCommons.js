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

/** Чи йдеться про моторну/технічну оливу (не їжу): SAE, моторна олива, engine oil тощо. */
function looksLikeMotorLubricant(text) {
  const s = String(text || '');
  if (/\b\d{1,2}W-?\d{2,3}\b/i.test(s)) return true;
  if (
    /моторн(а|ої|е|у|и)?\s+(олив|масл)|олив[аи]\s+моторн|трансмісійн|гідравлічн|engine\s+oil|motor\s+oil|lubricating\s+oil|gear\s+oil|SAE\s*\d/i.test(
      s,
    )
  )
    return true;
  if (/масло.*\d{1,2}W|\d{1,2}W.*масло/i.test(s)) return true;
  return false;
}

function extractSaeGrade(text) {
  const m = String(text).match(/\b(\d{1,2})W-?(\d{2,3})\b/i);
  if (!m) return '';
  return `${m[1]}W${m[2]}`;
}

/** Підказки Commons для технічної оливи — англ. запити дають менше плутанини з «butter». */
function motorOilCommonsQueries(combinedText) {
  const sae = extractSaeGrade(combinedText);
  const q = [];
  if (sae) {
    q.push(`${sae} motor oil`);
    q.push(`SAE ${sae.replace(/w/i, 'W')} engine oil`);
  }
  q.push('motor oil lubricant automotive');
  return q;
}

/**
 * Назва файлу на Commons схожа на їстівне масло (butter), а контекст — моторна олива.
 */
function fileTitleLooksLikeEdibleButter(title) {
  const t = String(title || '').toLowerCase();
  if (/\b(motor|engine|lubricant|sae|automotive|vehicle|diesel|gasoline|quart|canister)\b/.test(t)) return false;
  if (
    /\bbutter\b|beurre|вершков|spreadable|dairy|baking|culinary|kitchen|bread\s+and\s+butter|stick\s+of\s+butter|mound\s+of\s+butter|churn/i.test(
      t,
    )
  )
    return true;
  if (/antique\s+vollon|vollon.*butter/i.test(t)) return true;
  return false;
}

/**
 * Варіанти пошуку: спочатку уточнений рядок з LLM, потім SAE+motor oil, далі — як раніше.
 * @param {string} userQuery
 * @param {{ suggestedName?: string, manufacturerHint?: string, enrichedLine?: string }} [ctx]
 */
function commonsSearchVariants(userQuery, ctx = {}) {
  const trimmed = String(userQuery || '').trim();
  const sn = String(ctx.suggestedName || '').trim();
  const mh = String(ctx.manufacturerHint || '').trim();
  const enriched = String(ctx.enrichedLine || '').trim() || [sn, mh].filter(Boolean).join(' ').trim();
  const combined = [trimmed, sn, mh, enriched].filter(Boolean).join(' ').trim();
  const motor = looksLikeMotorLubricant(combined);

  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  if (enriched.length >= 2) push(enriched);
  if (sn.length >= 2 && sn !== enriched && sn !== trimmed) push(sn);
  if (mh.length >= 2 && !enriched.toLowerCase().includes(mh.toLowerCase())) push(`${mh} ${trimmed}`.trim());

  if (motor) {
    for (const mq of motorOilCommonsQueries(combined)) push(mq);
  }

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
    if (/автовимикач|вимикач\s*модульн|модульний\s*вимикач|difavtomat|дифавтомат|узо|узі|rcbo|mcb\b/i.test(trimmed)) {
      push('modular circuit breaker MCB');
      push('miniature circuit breaker');
    }
  }
  return out.slice(0, 10);
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
 * @param {{
 *   maxImages?: number,
 *   suggestedName?: string,
 *   manufacturerHint?: string,
 *   enrichedLine?: string,
 * }} [opts]
 * @returns {Promise<Array<{ id: string, url: string, title: string }>>}
 */
async function commonsSuggestImages(userQuery, opts = {}) {
  const maxImages = Math.min(16, Math.max(1, opts.maxImages || 10));
  const ctx = {
    suggestedName: opts.suggestedName,
    manufacturerHint: opts.manufacturerHint,
    enrichedLine: opts.enrichedLine,
  };
  const combined = [userQuery, ctx.suggestedName, ctx.manufacturerHint].filter(Boolean).join(' ').trim();
  const motorMode = looksLikeMotorLubricant(combined);

  const variants = commonsSearchVariants(userQuery, ctx);
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
    if (motorMode && fileTitleLooksLikeEdibleButter(title)) continue;
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

module.exports = {
  commonsSuggestImages,
  commonsSearchVariants,
  looksLikeMotorLubricant,
};
