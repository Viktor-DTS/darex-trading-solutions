/**
 * Multer/busboy часто зберігає originalname як latin1 — кирилиця стає «Ð—Ð°Ð»Ð¸ÑˆÐºÐ¸».
 */
function decodeMultipartFilename(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
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
