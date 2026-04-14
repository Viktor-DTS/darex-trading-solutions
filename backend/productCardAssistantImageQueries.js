/**
 * Розширений список рядків для пошуку прев’ю (Google CSE, узгоджено з Commons):
 * LLM-запити, очищена назва, коди з артикулу — без URL і без «торгового шуму» для фото.
 */

/** Прості підрядки без \\b на кирилиці (у Node \\b перед «без» часто не спрацьовує). */
const NON_VISUAL_PATTERNS = [
  /без\s+АВР/giu,
  /без\s+авр/giu,
  /without\s+ATS/giu,
  /without\s+AVR/giu,
  /без\s+упаковк\w*/giu,
  /без\s+ндс/giu,
  /\bоптом?\b/giu,
  /\bзнижк\w*\b/giu,
  /\bакці\w*\b/giu,
  /під\s+замовленн\w*/giu,
];

/**
 * Коди на кшталт DE-44BDS, NB1-63, G-12 — як у назві (для англ. пошуку).
 * @param {string} text
 * @returns {string[]}
 */
function extractProminentProductCodes(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  const re = /\b([A-ZА-ЯІЇЄҐ]{1,6}[-]?\d{1,4}[A-ZА-ЯІЇЄҐ0-9]{0,10})\b/giu;
  let m;
  while ((m = re.exec(s)) !== null && out.length < 6) {
    const a = m[1].replace(/\s+/g, '');
    const compact = a.replace(/[^a-zA-Zа-яіїєґА-ЯІЇЄҐ0-9]/gi, '');
    if (compact.length < 4) continue;
    const k = compact.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  const gM = /\b(G[- ]?1[0123]\+?)\b/giu.exec(s);
  if (gM) {
    const g = gM[1].replace(/\s+/g, '');
    const gk = g.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (gk.length >= 2 && !seen.has(gk)) {
      seen.add(gk);
      out.push(g);
    }
  }
  return out.slice(0, 6);
}

function sanitizeForImageSearch(raw) {
  let t = String(raw || '').trim();
  for (const re of NON_VISUAL_PATTERNS) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} userQuery
 * @param {{
 *   suggestedName?: string,
 *   manufacturerHint?: string,
 *   imageSearchQueries?: string[],
 * }} payload
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
function buildExpandedImageSearchQueries(userQuery, payload, opts = {}) {
  const max = Math.min(16, Math.max(6, opts.max || 12));
  const raw = String(userQuery || '').trim();
  const suggestedName = String(payload?.suggestedName || '').trim();
  const manufacturerHint = String(payload?.manufacturerHint || '').trim();
  const enrichedLine = [suggestedName, manufacturerHint].filter(Boolean).join(' ').trim();
  const llmImg = Array.isArray(payload?.imageSearchQueries)
    ? payload.imageSearchQueries.map((x) => String(x || '').trim()).filter((x) => x.length >= 2)
    : [];

  const sanitizedRaw = sanitizeForImageSearch(raw);
  const sanitizedName = sanitizeForImageSearch(suggestedName);
  const blob = [raw, suggestedName, manufacturerHint, enrichedLine, ...llmImg].join(' ');
  const codes = extractProminentProductCodes(blob);

  const list = [];
  const push = (s) => {
    const t = String(s || '').trim().slice(0, 200);
    if (t.length < 2) return;
    list.push(t);
  };

  for (const q of llmImg) push(q);
  if (sanitizedRaw.length >= 2) push(sanitizedRaw);
  if (sanitizedName.length >= 2 && sanitizedName.toLowerCase() !== sanitizedRaw.toLowerCase()) push(sanitizedName);
  if (enrichedLine.length >= 2) push(enrichedLine);
  if (suggestedName.length >= 2 && suggestedName !== raw) push(suggestedName);
  push(raw);

  const looksGenset = /генератор|genset|генсет|дизель|diesel|електроагрегат|kva|ква|квт|kw\b/i.test(blob);
  const looksCoolant = /охолоджуюч|антифриз|coolant|antifreeze|\bg[- ]?1[0123]\b/i.test(blob);
  for (const c of codes) {
    push(`${c} product`);
    if (looksGenset) push(`${c} diesel generator`);
    if (looksCoolant) push(`${c} coolant antifreeze`);
  }

  const seen = new Set();
  const out = [];
  for (const t of list) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = {
  buildExpandedImageSearchQueries,
  sanitizeForImageSearch,
  extractProminentProductCodes,
};
