/**
 * Форматування чисел для аналітики.
 *
 * Уся арифметика тепер на боці сервера, тут лише відображення. Головне правило:
 * ніколи не показувати «0», коли значення насправді невідоме — для цього
 * повертається тире, щоб порожні дані не читались як нульовий результат.
 */

const DASH = '—';

const isMissing = (value) => value === null || value === undefined || value === '' || Number.isNaN(value);

const nf = (min, max) => new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: min,
  maximumFractionDigits: max,
});

const INT = nf(0, 0);
const MONEY = nf(0, 0);
const MONEY_PRECISE = nf(2, 2);
const ONE = nf(1, 1);

export function int(value) {
  if (isMissing(value)) return DASH;
  return INT.format(Math.round(Number(value)));
}

/** Гроші. Великі суми скорочуються, щоб KPI-плитка не розповзалась. */
export function money(value, { precise = false, compact = 'auto' } = {}) {
  if (isMissing(value)) return DASH;
  const n = Number(value);
  const abs = Math.abs(n);

  if (compact === true || (compact === 'auto' && abs >= 1_000_000)) {
    if (abs >= 1_000_000_000) return `${ONE.format(n / 1_000_000_000)} млрд ₴`;
    if (abs >= 1_000_000) return `${ONE.format(n / 1_000_000)} млн ₴`;
  }
  return `${(precise ? MONEY_PRECISE : MONEY).format(n)} ₴`;
}

/** Повна сума без скорочення — для таблиць і підказок, де важлива копійка. */
export const moneyFull = (value) => (isMissing(value) ? DASH : `${MONEY_PRECISE.format(Number(value))} ₴`);

export function pct(value, { digits = 1 } = {}) {
  if (isMissing(value)) return DASH;
  return `${nf(0, digits).format(Number(value))}%`;
}

export function days(value) {
  if (isMissing(value)) return DASH;
  const n = Number(value);
  if (n < 1) return `${ONE.format(n * 24)} год`;
  return `${ONE.format(n)} дн`;
}

export function num(value, digits = 1) {
  if (isMissing(value)) return DASH;
  return nf(0, digits).format(Number(value));
}

const FORMATTERS = { int, money, pct, days, num, moneyFull };

/** Формат за назвою — сервер сам вказує, як подати кожну метрику. */
export function formatBy(kind, value) {
  const fn = FORMATTERS[kind];
  return fn ? fn(value) : (isMissing(value) ? DASH : String(value));
}

/** Знак і клас для зміни рік-до-року. */
export function delta(value, { invert = false } = {}) {
  if (isMissing(value)) return null;
  const n = Number(value);
  const positive = invert ? n < 0 : n > 0;
  const neutral = Math.abs(n) < 0.05;
  return {
    value: n,
    text: `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf(0, 1).format(Math.abs(n))}%`,
    tone: neutral ? 'flat' : positive ? 'up' : 'down',
  };
}

export function dateShort(value) {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function timeShort(value) {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/** «2 заявки», «5 заявок» — без цього підписи виглядають машинними. */
export function plural(n, one, few, many) {
  const abs = Math.abs(Math.round(Number(n) || 0));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const DASH_TEXT = DASH;
