/**
 * Контекст для LLM асистента карточки товару: уривки з Google organic через SerpApi.
 *
 *   SERPAPI_API_KEY — той самий ключ, що й для зображень
 *   PRODUCT_ASSISTANT_SERPAPI_SPEC_SEARCH=1 — увімкнути (лише коли Вікі не дала результату і далі йде LLM)
 *
 *   PRODUCT_ASSISTANT_SERPAPI_SPEC_MAX_QUERIES — скільки запитів до SerpApi за один виклик асистента (1–3, типово 2)
 *   SERPAPI_SPEC_ORGANIC_PER_QUERY — скільки organic-результатів зчитувати з кожної відповіді (типово 6)
 */

const { resolveSerpApiKey } = require('./productCardAssistantSerpApiImages');
const { sanitizeForImageSearch, extractProminentProductCodes } = require('./productCardAssistantImageQueries');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const MAX_CONTEXT_CHARS = 9000;

function serpApiSpecSearchEnabled() {
  const v = String(process.env.PRODUCT_ASSISTANT_SERPAPI_SPEC_SEARCH || '0').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/**
 * @param {string} userQuery
 * @returns {string[]}
 */
function buildSerpSpecSearchQueries(userQuery) {
  const raw = String(userQuery || '').trim();
  if (raw.length < 2) return [];
  const maxQ = Math.min(3, Math.max(1, parseInt(String(process.env.PRODUCT_ASSISTANT_SERPAPI_SPEC_MAX_QUERIES || '2'), 10) || 2));
  const s = sanitizeForImageSearch(raw).slice(0, 160);
  const codes = extractProminentProductCodes(raw);
  const seen = new Set();
  const out = [];
  const push = (q) => {
    const t = String(q || '').trim().slice(0, 200);
    if (t.length < 4) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  if (s.length >= 4) push(`${s} technical specifications datasheet`);
  const c0 = codes[0];
  if (c0 && out.length < maxQ) push(`${c0} datasheet specifications`);
  if (out.length < maxQ && raw.length >= 4) push(`${raw.slice(0, 140).trim()} характеристики OR specifications`);
  return out.slice(0, maxQ);
}

/**
 * @param {string} userQuery
 * @returns {Promise<string>}
 */
async function fetchSerpSpecWebContext(userQuery) {
  const apiKey = resolveSerpApiKey();
  if (!apiKey || !serpApiSpecSearchEnabled()) return '';

  const queries = buildSerpSpecSearchQueries(userQuery);
  if (!queries.length) return '';

  const google_domain = String(process.env.SERPAPI_GOOGLE_DOMAIN || 'google.com.ua').trim() || 'google.com.ua';
  const gl = String(process.env.SERPAPI_GL || 'ua').trim() || 'ua';
  const hl = String(process.env.SERPAPI_HL || 'uk').trim() || 'uk';
  const perQuery = Math.min(10, Math.max(3, parseInt(String(process.env.SERPAPI_SPEC_ORGANIC_PER_QUERY || '6'), 10) || 6));

  const blocks = [];
  const seenLinks = new Set();
  let n = 0;

  for (const q of queries) {
    const sp = new URLSearchParams({
      engine: 'google',
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
        signal: AbortSignal.timeout(18000),
      });
      if (!r.ok) {
        const err = await r.text().catch(() => '');
        console.warn('[product-card-assistant] SerpApi web search:', r.status, err.slice(0, 160));
        continue;
      }
      data = await r.json();
    } catch (e) {
      console.warn('[product-card-assistant] SerpApi web search fetch:', e.message);
      continue;
    }

    const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
    for (const row of organic.slice(0, perQuery)) {
      const link = String(row?.link || '').trim();
      const title = String(row?.title || '').trim().slice(0, 220);
      const snippet = String(row?.snippet || '').trim().slice(0, 700);
      if (!snippet && !title) continue;
      if (link && seenLinks.has(link)) continue;
      if (link) seenLinks.add(link);
      n += 1;
      const lines = [`[${n}] ${title || '(без заголовка)'}`];
      if (link) lines.push(link);
      if (snippet) lines.push(snippet);
      blocks.push(lines.join('\n'));
      const joined = blocks.join('\n\n');
      if (joined.length >= MAX_CONTEXT_CHARS) return joined.slice(0, MAX_CONTEXT_CHARS);
    }
  }

  return blocks.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

module.exports = {
  serpApiSpecSearchEnabled,
  buildSerpSpecSearchQueries,
  fetchSerpSpecWebContext,
};
