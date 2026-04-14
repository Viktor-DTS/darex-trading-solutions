/**
 * Асистент для форми «нова карточка продукту»: Вікіпедія → опційно LLM (див. productCardAssistantLlm.js) → заглушка.
 * Імпорт зображень — лише з дозволених HTTPS-доменів (Wikimedia / Wikipedia).
 */

const cloudinary = require('cloudinary').v2;
const { extractHeuristicSpecs } = require('./heuristicProductSpecs');
const { llmSuggest } = require('./productCardAssistantLlm');
const { commonsSuggestImages } = require('./productCardAssistantCommons');

const USER_AGENT =
  process.env.PRODUCT_ASSISTANT_USER_AGENT ||
  'DarexTradingSolutions/1.0 (product-card-assistant; warehouse)';

function allowedImageHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h.endsWith('wikimedia.org') ||
    h.endsWith('wikipedia.org') ||
    h === 'upload.wikimedia.org' ||
    h.endsWith('.upload.wikimedia.org')
  );
}

function assertAllowedImageUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch (_) {
    throw new Error('Некоректний URL зображення');
  }
  if (u.protocol !== 'https:') throw new Error('Дозволені лише HTTPS-посилання на зображення');
  if (!allowedImageHostname(u.hostname)) {
    throw new Error('Дозволені лише зображення з Wikipedia / Wikimedia');
  }
  return u.href;
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Перше «слово з літер» без артикулів розмірів (напр. «Дюбель 120 - 8» → «Дюбель»). */
function extractHeadTerm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([\p{L}]+(?:\s+[\p{L}]+){0,2})/u);
  if (m && m[1].trim().length >= 2) return m[1].trim();
  return s;
}

/**
 * Якщо запит починається з літер — перше слово має бути в **назві** статті (інакше сніпет згадує слово випадково, як у ПГП про «дюбелі»).
 */
function primaryAnchorFromQueryStart(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([\p{L}]{2,})/u);
  return m ? m[1].toLowerCase() : '';
}

function tokenizeForRelevance(q) {
  const s = String(q || '').toLowerCase();
  const tokens = s.match(/[\p{L}\d]+/gu) || [];
  return tokens.filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

/** Оцінка hit відносно запиту: статті без ключового слова з запиту відсікаються. */
function scoreWikiHit(hit, queryTokens, headLower) {
  const title = (hit.title || '').toLowerCase();
  let snippet = '';
  if (hit.snippet) snippet = String(hit.snippet).replace(/<[^>]+>/g, ' ').toLowerCase();
  let score = 0;
  if (headLower.length >= 2) {
    if (title === headLower) score += 120;
    else if (title.startsWith(headLower)) score += 85;
    else if (title.includes(headLower)) score += 55;
    if (snippet.includes(headLower)) score += 25;
  }
  for (const t of queryTokens) {
    if (t.length < 3) continue;
    if (title.includes(t)) score += 18;
    if (snippet.includes(t)) score += 10;
  }
  return score;
}

function pickBestSearchHit(hits, contextQuery) {
  if (!Array.isArray(hits) || hits.length === 0) return { hit: null, score: -1 };
  const head = extractHeadTerm(contextQuery).toLowerCase();
  const tokens = tokenizeForRelevance(contextQuery);
  let best = null;
  let bestScore = -1;
  for (const hit of hits) {
    const sc = scoreWikiHit(hit, tokens, head);
    if (sc > bestScore) {
      bestScore = sc;
      best = hit;
    }
  }
  return { hit: best, score: bestScore };
}

const WIKI_MIN_ACCEPT_SCORE = 22;
const WIKI_SR_LIMIT = '12';

async function wikipediaSearchHits(lang, searchQuery) {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const sp = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: searchQuery,
    format: 'json',
    utf8: '1',
    srlimit: WIKI_SR_LIMIT,
  });
  const searchData = await fetchJson(`${api}?${sp.toString()}`);
  const hits = searchData?.query?.search;
  return Array.isArray(hits) ? hits : [];
}

async function wikipediaPageSummary(lang, title) {
  const encoded = encodeURIComponent(String(title).replace(/ /g, '_'));
  const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  return fetchJson(summaryUrl);
}

function summaryToAssistantPayload(lang, title, summary) {
  const specs = [];
  const sid = `wiki-${lang}`;
  if (summary.extract) {
    const ex = String(summary.extract).trim().slice(0, 800);
    if (ex) specs.push({ id: `${sid}-extract`, name: 'Опис (Вікіпедія)', value: ex });
  }
  if (summary.description) {
    specs.push({
      id: `${sid}-desc`,
      name: 'Категорія (Вікіпедія)',
      value: String(summary.description).trim(),
    });
  }
  const images = [];
  if (summary.thumbnail?.source) {
    images.push({
      id: `${sid}-thumb`,
      url: summary.thumbnail.source,
      title: summary.title || title,
    });
  }
  return {
    source: 'wikipedia',
    lang,
    suggestedName: (summary.title || title || '').trim(),
    manufacturerHint: '',
    specs,
    images,
    disclaimer:
      'Дані з Вікіпедії носять довідковий характер. Перевірте точність перед збереженням карточки.',
  };
}

/**
 * Шукає статтю з релевантністю до запиту (не беремо сліпо перший hit — він часто промахується на «Дюбель 120 - 8» тощо).
 */
async function wikipediaSuggestForLang(lang, userQuery) {
  const q = String(userQuery || '').trim();
  if (q.length < 2) return null;
  const head = extractHeadTerm(q);

  async function tryQueries(searchStrings, contextForScoring) {
    const titleMustInclude = primaryAnchorFromQueryStart(contextForScoring);
    for (const sq of searchStrings) {
      const s = String(sq || '').trim();
      if (s.length < 2) continue;
      const hits = await wikipediaSearchHits(lang, s);
      const { hit, score } = pickBestSearchHit(hits, contextForScoring);
      if (!hit || score < WIKI_MIN_ACCEPT_SCORE) continue;
      if (titleMustInclude && !(hit.title || '').toLowerCase().includes(titleMustInclude)) continue;
      let summary;
      try {
        summary = await wikipediaPageSummary(lang, hit.title);
      } catch (_) {
        continue;
      }
      if (!summary || summary.type === 'disambiguation') continue;
      return summaryToAssistantPayload(lang, hit.title, summary);
    }
    return null;
  }

  const variants = [q];
  if (head !== q) variants.push(head);

  return tryQueries(variants, q);
}

async function wikipediaSuggest(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  try {
    const uk = await wikipediaSuggestForLang('uk', q);
    if (uk && (uk.specs.length > 0 || uk.images.length > 0)) return uk;
    const mostlyLatin = /^[\s\w\-.,/+()№#"'«»0-9]+$/i.test(q) && /[a-z]/i.test(q);
    if (mostlyLatin) {
      const en = await wikipediaSuggestForLang('en', q);
      if (en && (en.specs.length > 0 || en.images.length > 0)) return en;
    }
    return null;
  } catch (e) {
    console.warn('[product-card-assistant] Wikipedia:', e.message);
    return null;
  }
}

function mockSuggest(query) {
  const q = String(query || '').trim();
  const specs = [
    {
      id: 'mock-note',
      name: 'Підказка асистента',
      value:
        'Вікіпедія не дала результату, а LLM на сервері вимкнено або не відповів. У Render додайте змінну PRODUCT_ASSISTANT_LLM_API_KEY або OPENAI_API_KEY (OpenAI-сумісний API), перезапустіть сервіс — тоді з’являться структуровані підказки для складних назв (автомати, кабелі тощо).',
    },
  ];
  if (/генератор|genset|diesel|ква|kva|квт|kwt|de-|дизел/i.test(q)) {
    specs.push(
      {
        id: 'mock-gen-1',
        name: 'Типові характеристики (перевірте за паспортом)',
        value: 'Номінальна / резервна потужність (кВт або кВА), напруга (В), частота (Гц), клас двигуна',
      },
      {
        id: 'mock-gen-2',
        name: 'Рекомендовано уточнити',
        value: 'Виробник двигуна та альтернатора, витрата палива, рівень шуму, маса / габарити',
      },
    );
  }
  if (/дюбел|dowel|wall\s*plug|анкер|plug|шуруп/i.test(q)) {
    specs.push(
      {
        id: 'mock-anchor-1',
        name: 'Типові поля для кріплення (перевірте за каталогом)',
        value:
          'Діаметр × довжина (мм), матеріал (нейлон / метал), тип (распірний, ударний, рамний), з гвинтом чи без',
      },
      {
        id: 'mock-anchor-2',
        name: 'Примітка',
        value:
          'Вікіпедія дає загальні статті; для артикулу на кшталт «8×120» краще дивитися сайти виробників або маркетплейси.',
      },
    );
  }
  return {
    source: 'mock',
    suggestedName: q,
    manufacturerHint: '',
    specs,
    images: [],
    disclaimer: 'Заглушка асистента без зовнішнього джерела. Дані потрібно перевірити вручну.',
  };
}

function mergeHeuristicSpecs(q, payload) {
  const heur = extractHeuristicSpecs(q);
  if (!heur.length || !payload) return payload;
  const extra =
    ' Окремі характеристики розшифровані з назви евристикою (типові позначення з каталогів); перевірте перед збереженням.';
  return {
    ...payload,
    specs: [...heur, ...payload.specs],
    disclaimer: String(payload.disclaimer || '').trim() + extra,
  };
}

function llmPayloadHasUsefulContent(payload) {
  if (!payload) return false;
  if ((payload.specs || []).length > 0) return true;
  if (String(payload.manufacturerHint || '').trim()) return true;
  const sn = String(payload.suggestedName || '').trim();
  return sn.length > 0;
}

const MAX_ASSISTANT_IMAGES = 12;
const COMMONS_NOTE =
  '\n\nЗображення з Wikimedia Commons: перевірте відповідність саме вашому товару та умови ліцензії файлу перед використанням.';

/**
 * Додає до payload зображення з Commons (дедуп по URL), щоб у панелі був перелік для «Фото / файли».
 */
async function enrichWithCommonsImages(query, payload) {
  if (!payload || payload.source === 'empty') return payload;
  const existing = Array.isArray(payload.images) ? payload.images : [];
  if (existing.length >= MAX_ASSISTANT_IMAGES) return { ...payload, commonsImagesAdded: 0 };
  let added = 0;
  try {
    const want = MAX_ASSISTANT_IMAGES - existing.length;
    const suggestedName = String(payload.suggestedName || '').trim();
    const manufacturerHint = String(payload.manufacturerHint || '').trim();
    const enrichedLine = [suggestedName, manufacturerHint].filter(Boolean).join(' ').trim();
    const commons = await commonsSuggestImages(query, {
      maxImages: want,
      suggestedName,
      manufacturerHint,
      enrichedLine,
    });
    const seen = new Set(existing.map((i) => i.url).filter(Boolean));
    const merged = [...existing];
    for (const im of commons) {
      if (!im?.url || seen.has(im.url)) continue;
      seen.add(im.url);
      merged.push(im);
      added += 1;
      if (merged.length >= MAX_ASSISTANT_IMAGES) break;
    }
    if (added === 0) return { ...payload, commonsImagesAdded: 0 };
    const disclaimer = String(payload.disclaimer || '').trim();
    const hasCommonsNote = disclaimer.includes('Wikimedia Commons');
    return {
      ...payload,
      images: merged,
      commonsImagesAdded: added,
      disclaimer: hasCommonsNote ? disclaimer : disclaimer + COMMONS_NOTE,
    };
  } catch (e) {
    console.warn('[product-card-assistant] Commons enrich:', e.message);
    return { ...payload, commonsImagesAdded: 0 };
  }
}

async function suggest(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return { source: 'empty', suggestedName: '', manufacturerHint: '', specs: [], images: [], disclaimer: '' };
  }
  const wiki = await wikipediaSuggest(q);
  if (wiki && (wiki.specs.length > 0 || wiki.images.length > 0)) {
    return enrichWithCommonsImages(q, mergeHeuristicSpecs(q, wiki));
  }
  try {
    const llm = await llmSuggest(q);
    if (llmPayloadHasUsefulContent(llm)) {
      return enrichWithCommonsImages(q, mergeHeuristicSpecs(q, llm));
    }
  } catch (e) {
    console.warn('[product-card-assistant] LLM:', e.message);
  }
  return enrichWithCommonsImages(q, mergeHeuristicSpecs(q, mockSuggest(q)));
}

async function importImageFromUrl(imageUrl) {
  const url = assertAllowedImageUrl(imageUrl);
  const result = await cloudinary.uploader.upload(url, {
    folder: 'product-card-assistant',
    resource_type: 'image',
  });
  return {
    photoUrl: result.secure_url,
    cloudinaryId: result.public_id,
    filename: 'assistant-wiki-image.jpg',
  };
}

module.exports = {
  suggest,
  importImageFromUrl,
  allowedImageHostname,
  extractHeuristicSpecs,
};
