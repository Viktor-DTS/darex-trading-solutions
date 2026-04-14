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

/** Стаціонарний дизель-генератор / генсет (не залізничний транспорт). */
function looksLikeStationaryGenerator(text) {
  const s = String(text || '');
  if (/генератор|genset|генсет|електроагрегат|generating\s*set|power\s*generator/i.test(s)) return true;
  if (/\b(kva|ква)\b/i.test(s) && /(дизель|diesel|генератор|generator)/i.test(s)) return true;
  if (/\b(kw|квт)\b/i.test(s) && /(генератор|generator|дизель|diesel)/i.test(s)) return true;
  if (/(AVR|АВР)/i.test(s) && /(генератор|generator|дизель|diesel)/i.test(s)) return true;
  return false;
}

function dieselGensetCommonsQueries() {
  return ['stationary diesel generator', 'diesel electric generator set', 'industrial diesel genset'];
}

/** Охолоджувальна рідина / антифриз (G11–G13), не плутати з побутовою хімією — англ. запити для Commons. */
function looksLikeEngineCoolant(text) {
  const s = String(text || '');
  if (/\bG[- ]?1[0123]\+?\b/i.test(s)) return true;
  if (/охолоджуюч|антифриз|coolant|antifreeze|тосол|тосолу|ethylene\s+glycol\s+coolant/i.test(s)) return true;
  return false;
}

function engineCoolantCommonsQueries(combined) {
  const q = [];
  const g = String(combined).match(/\bG[- ]?1[0123]\+?\b/i);
  if (g) {
    const tag = g[0].replace(/\s+/g, '');
    q.push(`${tag} engine coolant automotive`);
    q.push(`${tag} antifreeze coolant bottle`);
  }
  q.push('automotive engine coolant plastic container');
  q.push('ethylene glycol antifreeze automotive');
  return q;
}

/** Залізничний кадр без генераторної установки — відсікаємо при контексті генсету. */
function fileTitleLooksLikeRailwayNotGenerator(title) {
  const t = String(title || '').toLowerCase();
  if (/generator|genset|generating|alternator|power\s*plant|diesel\s*engine\s*generator|gen\s*set/i.test(t)) return false;
  if (
    /\b(locomotive|multiple\s+unit|\bdmu\b|railway\s+station|railroad|subway\s+train|metro\s+train|трамвай|залізнич|електропоїзд|поїзд\s|вагон|track\s+ballast)/i.test(
      t,
    )
  )
    return true;
  if (/\brailway\b.*\b(station|depot|museum)\b/i.test(t) && !/generator/i.test(t)) return true;
  return false;
}

/** Коксові / географічні кадри без генераторної тематики — при контексті генсету. */
function fileTitleLooksLikeIrrelevantIndustrial(title) {
  const t = String(title || '').toLowerCase();
  if (/generator|genset|alternator|caterpillar|diesel\s+engine|power\s*unit|kva|\bkW\b|enclosure/i.test(t)) return false;
  if (/\bcoke\s+works\b|booster\s+drive\b/i.test(t)) return true;
  if (/geograph\.org\.uk/i.test(t) && !/generator|genset/i.test(t)) return true;
  return false;
}

/** Трейлери таборів / міграційні — не стаціонарний генсет для складу. */
function fileTitleLooksLikeLaborCampTrailer(title) {
  const t = String(title || '').toLowerCase();
  return /\blabor\s+camp\b|migratory\s+labor|migratory-labor|trailer\s*site|tsa[-_]migratory/i.test(t);
}

function titleAlnumFold(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9а-яіїєґ]/gi, '');
}

/** Коди на кшталт DE-44BDS, NB1-63 зі змішаного тексту. */
function extractModelHints(text) {
  const s = String(text || '');
  const hints = new Set();
  const re1 = /\b([A-Z]{2,6}[-]?\d{2,4}[A-Z0-9]{0,8})\b/gi;
  let m;
  while ((m = re1.exec(s)) !== null) {
    const a = m[1].replace(/\s+/g, '');
    const compact = a.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (compact.length >= 4) {
      hints.add(a.toLowerCase());
      hints.add(compact);
    }
  }
  const re2 = /\b([A-Z]{2})\s+(\d{2,3})\s+([A-Z]{2,8})\b/g;
  const m2 = re2.exec(s.replace(/\s+/g, ' '));
  if (m2) {
    hints.add(`${m2[1]}${m2[2]}${m2[3]}`.toLowerCase());
    hints.add(`${m2[1]}-${m2[2]}${m2[3]}`.toLowerCase());
  }
  return [...hints];
}

function extractBrandHints(manufacturerHint, suggestedName, userQuery) {
  const m = String(manufacturerHint || '').trim().toLowerCase();
  const out = m.length >= 2 ? [m] : [];
  const STOP = new Set(['bds', 'avr', 'mcb', 'sae', 'kva', 'dna', 'pdf', 'jpg', 'png', 'tiff']);
  const blob = `${suggestedName || ''} ${userQuery || ''}`;
  const caps = blob.match(/\b([A-Z]{3,})\b/g) || [];
  for (const c of caps) {
    const x = c.toLowerCase();
    if (!STOP.has(x) && x.length <= 24) out.push(x);
  }
  return [...new Set(out)].filter((b) => b.length >= 2);
}

/**
 * Релевантність назви файлу Commons до товару (більше = краще).
 */
function scoreCommonsImageTitle(title, modelHints, brands, gensetMode) {
  const tl = String(title || '').toLowerCase();
  const tf = titleAlnumFold(title);
  let sc = 0;
  for (const h of modelHints) {
    const hn = String(h).toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (hn.length < 4) continue;
    if (tl.includes(String(h).toLowerCase()) || tf.includes(hn)) sc += 52;
  }
  for (const b of brands) {
    const bn = String(b).toLowerCase();
    if (bn.length >= 3 && tl.includes(bn)) sc += 34;
  }
  if (gensetMode) {
    if (/\bdiesel\s+generator|diesel\s+genset|\bgenset\b|generator\s+set/i.test(tl)) sc += 16;
    if (/caterpillar|perkins|cummins|atlas\s*copco|fg\s*wilson/i.test(tl)) sc += 8;
    if (/\b(moscow|exhibition|fair|belagro|mvz)\b/i.test(tl) && sc < 35) sc -= 12;
  }
  return sc;
}

/**
 * Варіанти пошуку: точна назва користувача → enriched → запити з LLM → евристики.
 * @param {string} userQuery
 * @param {{
 *   suggestedName?: string,
 *   manufacturerHint?: string,
 *   enrichedLine?: string,
 *   imageSearchQueries?: string[],
 * }} [ctx]
 */
function commonsSearchVariants(userQuery, ctx = {}) {
  const trimmed = String(userQuery || '').trim();
  const sn = String(ctx.suggestedName || '').trim();
  const mh = String(ctx.manufacturerHint || '').trim();
  const enriched = String(ctx.enrichedLine || '').trim() || [sn, mh].filter(Boolean).join(' ').trim();
  const llmImg = Array.isArray(ctx.imageSearchQueries) ? ctx.imageSearchQueries : [];
  const combined = [trimmed, sn, mh, enriched, ...llmImg].filter(Boolean).join(' ').trim();
  const motor = looksLikeMotorLubricant(combined);
  const genset = looksLikeStationaryGenerator(combined);
  const coolant = looksLikeEngineCoolant(combined);

  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  // Запити з LLM — першими (англ. торгові терміни), інакше кириличний «дизель» тягне зайве з Commons.
  for (const q of llmImg) push(String(q || '').trim());
  push(trimmed);
  if (enriched.length >= 2 && enriched !== trimmed) push(enriched);

  if (sn.length >= 2 && sn !== enriched && sn !== trimmed) push(sn);
  if (mh.length >= 2 && !enriched.toLowerCase().includes(mh.toLowerCase())) push(`${mh} ${trimmed}`.trim());

  if (motor) {
    for (const mq of motorOilCommonsQueries(combined)) push(mq);
  }

  if (genset) {
    for (const dq of dieselGensetCommonsQueries()) push(dq);
  }

  if (coolant && !motor) {
    for (const cq of engineCoolantCommonsQueries(combined)) push(cq);
  }

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
    if (/генератор|електроагрегат|genset/i.test(trimmed) && !genset) {
      push('electric power generator');
    }
    if (/автовимикач|вимикач\s*модульн|модульний\s*вимикач|difavtomat|дифавтомат|узо|узі|rcbo|mcb\b/i.test(trimmed)) {
      push('modular circuit breaker MCB');
      push('miniature circuit breaker');
    }
  }
  return out.slice(0, 18);
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
    titles: titles.slice(0, 40).join('|'),
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
 *   imageSearchQueries?: string[],
 * }} [opts]
 * @returns {Promise<Array<{ id: string, url: string, title: string }>>}
 */
async function commonsSuggestImages(userQuery, opts = {}) {
  const maxImages = Math.min(16, Math.max(1, opts.maxImages || 10));
  const imgQ = Array.isArray(opts.imageSearchQueries)
    ? opts.imageSearchQueries.map((x) => String(x || '').trim()).filter((x) => x.length >= 2).slice(0, 10)
    : [];
  const ctx = {
    suggestedName: opts.suggestedName,
    manufacturerHint: opts.manufacturerHint,
    enrichedLine: opts.enrichedLine,
    imageSearchQueries: imgQ,
  };
  const combined = [userQuery, ctx.suggestedName, ctx.manufacturerHint, ...imgQ].filter(Boolean).join(' ').trim();
  const motorMode = looksLikeMotorLubricant(combined);
  const gensetMode = looksLikeStationaryGenerator(combined);
  const coolantMode = looksLikeEngineCoolant(combined) && !motorMode;

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
      if (titles.length >= 22) break;
    }
    if (titles.length >= 12) break;
  }

  if (!titles.length) return [];

  let pageList;
  try {
    pageList = await commonsImageInfoForTitles(titles);
  } catch (e) {
    console.warn('[product-card-assistant] Commons imageinfo:', e.message);
    return [];
  }

  const hintBlob = [combined, userQuery, ...imgQ].join(' ');
  const modelHints = extractModelHints(hintBlob);
  const brands = extractBrandHints(ctx.manufacturerHint, ctx.suggestedName, userQuery);

  const candidates = [];
  const seenUrl = new Set();
  for (const page of pageList) {
    const title = page.title || '';
    if (motorMode && fileTitleLooksLikeEdibleButter(title)) continue;
    if (coolantMode && fileTitleLooksLikeEdibleButter(title)) continue;
    if (gensetMode && fileTitleLooksLikeRailwayNotGenerator(title)) continue;
    if (gensetMode && fileTitleLooksLikeIrrelevantIndustrial(title)) continue;
    if (gensetMode && fileTitleLooksLikeLaborCampTrailer(title)) continue;
    const ii = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    const url = pickImageUrl(ii);
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);
    const capTitle = title.replace(/^File:/i, '') || title;
    const score = scoreCommonsImageTitle(capTitle, modelHints, brands, gensetMode);
    candidates.push({ url, title: capTitle, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const images = [];
  for (let i = 0; i < candidates.length && images.length < maxImages; i += 1) {
    images.push({
      id: `commons-${images.length + 1}`,
      url: candidates[i].url,
      title: candidates[i].title,
    });
  }
  return images;
}

module.exports = {
  commonsSuggestImages,
  commonsSearchVariants,
  looksLikeMotorLubricant,
  looksLikeStationaryGenerator,
  looksLikeEngineCoolant,
};
