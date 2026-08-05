/**
 * Конвертація legacy Word (.doc) у HTML для перегляду.
 */
const WordExtractor = require('word-extractor');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isOleDocBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 8
    && buffer[0] === 0xd0
    && buffer[1] === 0xcf
    && buffer[2] === 0x11
    && buffer[3] === 0xe0;
}

function plainTextToHtml(text) {
  const parts = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (parts.length === 0) return '<p>Документ порожній</p>';

  return parts
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function convertLegacyDocToHtml(buffer) {
  const extracted = await new WordExtractor().extract(buffer);
  const body = await extracted.getBody();
  const html = plainTextToHtml(body);
  return html;
}

module.exports = {
  isOleDocBuffer,
  convertLegacyDocToHtml,
  plainTextToHtml,
};
