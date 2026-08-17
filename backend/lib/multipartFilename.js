/**
 * Multer/busboy часто зберігає originalname як latin1 — кирилиця стає «Ð—Ð°Ð»Ð¸ÑˆÐºÐ¸».
 * Інколи браузер/ОС віддає вже percent-encoded назву (%D0%BD…).
 */
function decodePercentEncodedFilename(name) {
  let s = String(name || '');
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s.replace(/\+/g, '%20'));
      if (!next || next === s) break;
      s = next;
    } catch (_) {
      break;
    }
  }
  return s;
}

function decodeMultipartFilename(name) {
  let raw = String(name || '').trim();
  if (!raw) return raw;
  raw = decodePercentEncodedFilename(raw).trim() || raw;
  if (/[а-яіїєґА-ЯІЇЄҐ]/.test(raw)) return raw;
  if (!/[ÐÑÂÃĐ]/.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (decoded && /[а-яіїєґА-ЯІЇЄҐ]/.test(decoded)) return decoded;
  } catch (_) {
    /* ignore */
  }
  return raw;
}

module.exports = { decodeMultipartFilename };
