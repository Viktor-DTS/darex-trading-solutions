/**
 * Підбір прев’ю зображень через SerpApi (engine=google_images).
 *
 * Для нових проєктів Google Cloud Custom Search JSON API часто недоступний — це окремий шлях без CX.
 *
 *   SERPAPI_API_KEY — ключ (https://serpapi.com/manage-api-key)
 *   PRODUCT_ASSISTANT_SERPAPI_IMAGE_SEARCH=1 — увімкнути на бекенді асистента
 *
 * Локалізація (опційно): SERPAPI_GOOGLE_DOMAIN (типово google.com.ua), SERPAPI_GL (ua), SERPAPI_HL (uk)
 */

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

function resolveSerpApiKey() {
  return String(process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || '').trim();
}

function serpApiImageSearchEnabled() {
  const v = String(process.env.PRODUCT_ASSISTANT_SERPAPI_IMAGE_SEARCH || '0').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/**
 * @param {string[]} queries
 * @param {number} max
 * @returns {Promise<Array<{ id: string, url: string, title: string, source: string }>>}
 */
async function serpApiGoogleImages(queries, max) {
  const apiKey = resolveSerpApiKey();
  const cap = Math.min(10, Math.max(1, max || 8));
  if (!apiKey) return [];

  const google_domain = String(process.env.SERPAPI_GOOGLE_DOMAIN || 'google.com.ua').trim() || 'google.com.ua';
  const gl = String(process.env.SERPAPI_GL || 'ua').trim() || 'ua';
  const hl = String(process.env.SERPAPI_HL || 'uk').trim() || 'uk';

  const out = [];
  const seenUrl = new Set();
  const list = Array.isArray(queries) ? queries.map((q) => String(q || '').trim()).filter((q) => q.length >= 2) : [];

  for (const q of list) {
    if (out.length >= cap) break;
    const sp = new URLSearchParams({
      engine: 'google_images',
      api_key: apiKey,
      q,
      google_domain,
      gl,
      hl,
      safe: 'active',
    });
    let data;
    try {
      const r = await fetch(`${SERPAPI_ENDPOINT}?${sp.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.warn('[product-card-assistant] SerpApi Google Images:', r.status, err.slice(0, 200));
        continue;
      }
      data = await r.json();
    } catch (e) {
      console.warn('[product-card-assistant] SerpApi Google Images fetch:', e.message);
      continue;
    }
    const rawItems = data?.images_results || data?.image_results;
    const items = Array.isArray(rawItems) ? rawItems : [];
    for (const it of items) {
      if (out.length >= cap) break;
      const original = String(it.original || '').trim();
      const link = String(it.link || '').trim();
      const thumb = String(it.thumbnail || '').trim();
      const url = original || link || thumb;
      if (!url || seenUrl.has(url)) continue;
      seenUrl.add(url);
      const title = String(it.title || it.source || 'Зображення (SerpApi)').trim().slice(0, 200);
      out.push({
        id: `simg-${out.length + 1}`,
        url,
        title,
        source: 'serpapi-google-image',
      });
    }
  }
  return out;
}

module.exports = {
  serpApiGoogleImages,
  resolveSerpApiKey,
  serpApiImageSearchEnabled,
};
