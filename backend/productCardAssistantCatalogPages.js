/**
 * Завантаження тексту та og:image з довірених каталогів (promaplus, darex тощо)
 * для LLM-контексту та фото карточки.
 *
 * PRODUCT_ASSISTANT_CATALOG_FETCH=0 — вимкнути
 * PRODUCT_ASSISTANT_CATALOG_HOST_SUFFIXES — додаткові домени через кому
 */

const USER_AGENT =
  process.env.PRODUCT_ASSISTANT_USER_AGENT ||
  'DarexTradingSolutions/1.0 (product-card-assistant; warehouse)';

const DEFAULT_HOST_SUFFIXES = ['promaplus.com.ua', 'darex.energy', 'darex.com.ua'];

function catalogFetchEnabled() {
  const v = String(process.env.PRODUCT_ASSISTANT_CATALOG_FETCH || '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

function trustedHostSuffixes() {
  const extra = String(process.env.PRODUCT_ASSISTANT_CATALOG_HOST_SUFFIXES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\.+/, ''))
    .filter(Boolean);
  return [...DEFAULT_HOST_SUFFIXES, ...extra];
}

function isTrustedCatalogUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch (_) {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return trustedHostSuffixes().some((suf) => host === suf || host.endsWith(`.${suf}`));
}

function stripHtmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extractOgImage(html, pageUrl) {
  const m =
    html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
  if (!m) return null;
  let url = String(m[1] || '').trim();
  if (!url) return null;
  try {
    url = new URL(url, pageUrl).href;
  } catch (_) {
    return null;
  }
  if (!/^https:\/\//i.test(url)) return null;
  return url;
}

/**
 * @param {string} url
 * @returns {Promise<{ text: string, imageUrl: string | null } | null>}
 */
async function fetchTrustedCatalogPage(url) {
  if (!catalogFetchEnabled() || !isTrustedCatalogUrl(url)) return null;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!r.ok) {
      console.warn('[product-card-assistant] catalog page HTTP', r.status, url);
      return null;
    }
    const html = await r.text();
    const text = stripHtmlToText(html).slice(0, 5500);
    const imageUrl = extractOgImage(html, url);
    if (text.length < 120 && !imageUrl) return null;
    return { text, imageUrl };
  } catch (e) {
    console.warn('[product-card-assistant] catalog page fetch:', url, e.message);
    return null;
  }
}

/**
 * @param {string[]} urls — посилання з organic-пошуку (SerpApi)
 * @param {number} [maxPages]
 * @returns {Promise<{ textBlocks: string[], images: Array<{ id: string, url: string, title: string }> }>}
 */
async function enrichFromTrustedCatalogPages(urls, maxPages = 1) {
  const out = { textBlocks: [], images: [] };
  if (!catalogFetchEnabled() || !Array.isArray(urls) || !urls.length) return out;

  const limit = Math.min(2, Math.max(1, Number(maxPages) || 1));
  let fetched = 0;

  for (const raw of urls) {
    if (fetched >= limit) break;
    const link = String(raw || '').trim();
    if (!isTrustedCatalogUrl(link)) continue;
    const page = await fetchTrustedCatalogPage(link);
    if (!page) continue;
    fetched += 1;
    if (page.text.length >= 120) {
      out.textBlocks.push(`--- Текст сторінки каталогу (${link}) ---\n${page.text}`);
    }
    if (page.imageUrl) {
      out.images.push({
        id: `catalog-${fetched}`,
        url: page.imageUrl,
        title: link,
      });
    }
  }

  return out;
}

function extractCatalogSearchTerms(userQuery) {
  const text = String(userQuery || '').trim();
  const terms = [];
  const ark = text.match(/\bARK[-\s]?B\s*(\d{2,3})\b/i);
  if (ark) terms.push(`ARK-B ${ark[1]}`);
  const de = text.match(/\bDE[-\s]?(\d{2,3})\s*BDS\b/i);
  if (de) terms.push(`DE-${de[1]}BDS`);
  const codes = text.match(/\b[A-Z]{2,}[-\s]?\d{2,4}[A-Z0-9/-]*\b/g);
  if (codes) {
    for (const c of codes.slice(0, 2)) {
      const t = String(c).trim();
      if (t.length >= 4 && !terms.some((x) => x.toLowerCase().includes(t.toLowerCase()))) terms.push(t);
    }
  }
  if (/генератор|generator|genset|дизел/i.test(text) && !terms.length) {
    terms.push(text.slice(0, 80).trim());
  }
  return [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))].slice(0, 2);
}

function extractFirstProductLinksFromSearchHtml(html, baseOrigin) {
  const links = [];
  const re = /href=["']([^"']*\/product\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && links.length < 3) {
    try {
      const href = new URL(m[1], baseOrigin).href;
      if (isTrustedCatalogUrl(href)) links.push(href);
    } catch (_) {}
  }
  return links;
}

/**
 * Без SerpApi: пошук на promaplus.com.ua за кодом моделі з назви.
 * @param {string} userQuery
 * @returns {Promise<{ context: string, catalogImages: Array<{ id: string, url: string, title: string }> }>}
 */
async function fetchDirectCatalogContext(userQuery) {
  const empty = { context: '', catalogImages: [] };
  if (!catalogFetchEnabled()) return empty;
  const terms = extractCatalogSearchTerms(userQuery);
  if (!terms.length) return empty;

  for (const term of terms) {
    const searchUrl = `https://www.promaplus.com.ua/?s=${encodeURIComponent(term)}`;
    try {
      const r = await fetch(searchUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const html = await r.text();
      const productLinks = extractFirstProductLinksFromSearchHtml(html, 'https://www.promaplus.com.ua');
      if (!productLinks.length) continue;
      const catalog = await enrichFromTrustedCatalogPages(productLinks, 1);
      if (catalog.textBlocks.length || catalog.images.length) {
        return {
          context: catalog.textBlocks.join('\n\n').slice(0, 5500),
          catalogImages: catalog.images,
        };
      }
    } catch (e) {
      console.warn('[product-card-assistant] direct catalog search:', term, e.message);
    }
  }
  return empty;
}

module.exports = {
  catalogFetchEnabled,
  isTrustedCatalogUrl,
  fetchTrustedCatalogPage,
  enrichFromTrustedCatalogPages,
  fetchDirectCatalogContext,
};
