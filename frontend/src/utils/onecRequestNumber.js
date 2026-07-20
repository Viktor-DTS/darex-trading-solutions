/** Нормалізація номера заявки (KV-0000097, SV-00001, VZ-00001). */
export function normalizeRequestNumber(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const m = raw.match(/^([A-ZА-ЯІЇЄ]{2})-?(\d+)$/u);
  if (!m) return raw;
  const prefix = m[1];
  const digits = m[2];
  if (prefix === 'KV') return `${prefix}-${digits.padStart(7, '0')}`;
  if (prefix === 'SV' || prefix === 'VZ') return `${prefix}-${digits.padStart(5, '0')}`;
  return `${prefix}-${digits}`;
}

const REQUEST_PATTERNS = [
  /\b(KV-?\d{3,7})\b/iu,
  /\b(SV-?\d{3,7})\b/iu,
  /\b(VZ-?\d{3,7})\b/iu,
  /\b([A-ZА-ЯІЇЄ]{2}-\d{4,7})\b/iu,
];

/** Витягнути номер заявки з полів руху 1С (коментар, документ, контрагент). */
export function extractRequestNumberFromOneC(row) {
  const texts = [row?.comment, row?.docNumber, row?.contractor].filter(Boolean);
  for (const text of texts) {
    const hay = String(text);
    for (const re of REQUEST_PATTERNS) {
      const m = hay.match(re);
      if (m?.[1]) return normalizeRequestNumber(m[1]);
    }
  }
  return '';
}
