/** Регіональні префікси сервісних заявок (7 цифр). */
const SERVICE_PREFIXES_7 = new Set(['KV', 'DP', 'LV', 'HY', 'UA']);

/** Нормалізація номера заявки (KV-0000097, DP-0001740, SV-00001, VZ-00001). */
export function normalizeRequestNumber(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const m = raw.match(/^([A-ZА-ЯІЇЄ]{2})-?(\d+)$/u);
  if (!m) return raw;
  const prefix = m[1];
  const digits = m[2];
  if (SERVICE_PREFIXES_7.has(prefix)) return `${prefix}-${digits.padStart(7, '0')}`;
  if (prefix === 'SV' || prefix === 'VZ') return `${prefix}-${digits.padStart(5, '0')}`;
  return `${prefix}-${digits}`;
}

const REQUEST_PATTERNS = [
  /\b(KV-?\d{3,7})\b/iu,
  /\b(DP-?\d{3,7})\b/iu,
  /\b(LV-?\d{3,7})\b/iu,
  /\b(HY-?\d{3,7})\b/iu,
  /\b(UA-?\d{3,7})\b/iu,
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

export function getRequestKind(requestNumber) {
  const prefix = String(requestNumber || '').trim().toUpperCase().split('-')[0];
  if (prefix === 'SV') return 'shipment';
  if (prefix === 'VZ') return 'procurement';
  return 'task';
}
