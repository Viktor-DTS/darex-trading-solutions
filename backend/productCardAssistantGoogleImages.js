/**
 * Підбір прев’ю зображень через Google Custom Search JSON API (searchType=image).
 *
 * Змінні оточення:
 *   GOOGLE_CUSTOM_SEARCH_CX — ID пошукової системи (Programmable Search Engine)
 *   GOOGLE_CUSTOM_SEARCH_CX_UA — опційно: окремий PSE лише з українськими сайтами; спочатку шукаємо там, потім у CX.
 *   GOOGLE_CUSTOM_SEARCH_API_KEY — ключ (або fallback GOOGLE_GEOCODING_API_KEY / GOOGLE_VISION_API_KEY)
 *
 * У Google Cloud Console увімкніть «Custom Search API» для того самого проєкту, що й ключ.
 */

const CSE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

function resolveApiKey() {
  return String(
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY ||
      process.env.GOOGLE_GEOCODING_API_KEY ||
      process.env.GOOGLE_VISION_API_KEY ||
      '',
  ).trim();
}

function resolveCx() {
  return String(process.env.GOOGLE_CUSTOM_SEARCH_CX || '').trim();
}

/** Окремий Programmable Search Engine з обмеженням на .ua / локальні сайти (опційно). */
function resolveCxUa() {
  return String(process.env.GOOGLE_CUSTOM_SEARCH_CX_UA || process.env.GOOGLE_CUSTOM_SEARCH_UA_CX || '').trim();
}

/**
 * Прев’ю з домену .ua / .укр — вище за інші (для одного CX без окремого «UA»-двиґуна).
 * @param {Array<{ url: string }>} images
 */
function sortImagesUaHostFirst(images) {
  const rank = (url) => {
    try {
      const h = new URL(String(url || '').trim()).hostname.toLowerCase();
      if (h.endsWith('.ua') || h.endsWith('.укр')) return 0;
      return 1;
    } catch (_) {
      return 2;
    }
  };
  return [...(images || [])].sort((a, b) => rank(a.url) - rank(b.url));
}

/**
 * @param {string[]} queries — спробувати по черзі, поки не набереться max
 * @param {number} max
 * @param {{ cx?: string }} [options] — якщо cx: передано, використовується замість GOOGLE_CUSTOM_SEARCH_CX
 * @returns {Promise<Array<{ id: string, url: string, title: string, source: string }>>}
 */
async function googleCustomSearchImages(queries, max, options = {}) {
  const key = resolveApiKey();
  const cx = String(options.cx || '').trim() || resolveCx();
  const cap = Math.min(10, Math.max(1, max || 8));
  if (!key || !cx) return [];

  const out = [];
  const seenUrl = new Set();
  const list = Array.isArray(queries) ? queries.map((q) => String(q || '').trim()).filter((q) => q.length >= 2) : [];

  for (const q of list) {
    if (out.length >= cap) break;
    const need = cap - out.length;
    const num = Math.min(10, Math.max(1, need));
    const sp = new URLSearchParams({
      key,
      cx,
      q,
      searchType: 'image',
      num: String(num),
      safe: 'active',
      imgSize: 'medium',
      imgType: 'photo',
    });
    let data;
    try {
      const r = await fetch(`${CSE_ENDPOINT}?${sp.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.warn('[product-card-assistant] Google CSE image:', r.status, err.slice(0, 200));
        continue;
      }
      data = await r.json();
    } catch (e) {
      console.warn('[product-card-assistant] Google CSE image fetch:', e.message);
      continue;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const it of items) {
      if (out.length >= cap) break;
      const link = String(it.link || '').trim();
      const thumb = String(it.image?.thumbnailLink || '').trim();
      const url = link || thumb;
      if (!url || seenUrl.has(url)) continue;
      seenUrl.add(url);
      const title = String(it.title || it.snippet || it.displayLink || 'Зображення (Google)').trim().slice(0, 200);
      out.push({
        id: `gimg-${out.length + 1}`,
        url,
        title,
        source: 'google-image',
      });
    }
  }
  return out;
}

module.exports = {
  googleCustomSearchImages,
  resolveApiKey,
  resolveCx,
  resolveCxUa,
  sortImagesUaHostFirst,
};
