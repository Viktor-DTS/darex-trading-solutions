/**
 * Розбір параметрів запиту аналітики: період, база дати, область видимості (регіон/роль).
 *
 * Область видимості визначається на сервері за логіном з JWT, а не приходить із клієнта —
 * інакше регіональний користувач може побачити чужі регіони, підмінивши query-параметр.
 */
const mongoose = require('mongoose');

const PERIODS = ['year', 'quarter', 'month', 'custom'];
/** База, за якою заявка відноситься до періоду. */
const DATE_BASES = {
  request: {
    id: 'request',
    label: 'Дата заявки',
    matchFields: ['requestDate', 'date'],
    exprFields: ['requestDate', 'autoCreatedAt', 'date'],
    hint: 'Заявка потрапляє в період за датою реєстрації — когорта для конверсії',
  },
  work: {
    id: 'work',
    label: 'Дата проведення робіт',
    matchFields: ['date', 'requestDate'],
    exprFields: ['date', 'autoCompletedAt', 'requestDate'],
    hint: 'Заявка потрапляє в період за датою виконання робіт — для фінансових звітів',
  },
};

const NATIONAL_REGION_ALIASES = new Set(['', 'україна', 'ukraine', 'всі регіони', 'all']);

function isNationalRegion(region) {
  return NATIONAL_REGION_ALIASES.has(String(region || '').trim().toLowerCase());
}

function toInt(value, fallback = null) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const MONTH_NAMES = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

/**
 * Період аналізу + такий самий період попереднього року для YoY-порівняння.
 * Квартал рахується як ceil(month / 3) — тобто Q1 = січень–березень.
 */
function parsePeriod(query = {}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const year = Math.min(Math.max(toInt(query.year, currentYear), 2000), currentYear + 1);
  const period = PERIODS.includes(query.period) ? query.period : 'year';

  let from;
  let to;
  let label;
  let month = toInt(query.month, null);
  let quarter = toInt(query.quarter, null);

  if (period === 'month' && month >= 1 && month <= 12) {
    from = new Date(year, month - 1, 1);
    to = new Date(year, month, 1);
    label = `${MONTH_NAMES[month - 1]} ${year}`;
  } else if (period === 'quarter' && quarter >= 1 && quarter <= 4) {
    from = new Date(year, (quarter - 1) * 3, 1);
    to = new Date(year, quarter * 3, 1);
    label = `${quarter} квартал ${year}`;
  } else {
    month = null;
    quarter = null;
    from = new Date(year, 0, 1);
    to = new Date(year + 1, 0, 1);
    label = `${year} рік`;
  }

  const prevFrom = new Date(from.getFullYear() - 1, from.getMonth(), from.getDate());
  const prevTo = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());

  return {
    year,
    period: period === 'custom' ? 'year' : period,
    month,
    quarter,
    from,
    to,
    prevFrom,
    prevTo,
    label,
    prevLabel: label.replace(String(year), String(year - 1)),
    /** Скільки місяців періоду вже минуло — для коректного run-rate прогнозу. */
    elapsedMonths: computeElapsedMonths(from, to, now),
    monthsInPeriod: Math.max(1, Math.round((to - from) / (30.44 * 86400000))),
    isCurrentPeriod: now >= from && now < to,
  };
}

function computeElapsedMonths(from, to, now) {
  if (now >= to) return Math.max(1, Math.round((to - from) / (30.44 * 86400000)));
  if (now <= from) return 0;
  const months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  const dayFraction = now.getDate() / 30.44;
  return Math.max(0, months + dayFraction);
}

function parseDateBasis(query = {}) {
  return DATE_BASES[query.basis] || DATE_BASES.request;
}

const scopeCache = new Map();
const SCOPE_TTL_MS = 60_000;

/**
 * Область видимості користувача. Регіон береться з БД (авторитетне джерело),
 * бо в JWT його немає, а клієнтському значенню довіряти не можна.
 */
async function resolveScope(req) {
  const login = String(req.user?.login || '').trim();
  const role = String(req.user?.role || '').trim();
  const cacheKey = login || `anon:${role}`;
  const hit = scopeCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let dbUser = null;
  if (login) {
    try {
      dbUser = await mongoose.model('User')
        .findOne({ login })
        .select('login name role region')
        .lean();
    } catch {
      dbUser = null;
    }
  }

  const region = String(dbUser?.region || '').trim();
  const national = isNationalRegion(region);
  const value = {
    login,
    name: dbUser?.name || req.user?.name || login,
    role: dbUser?.role || role,
    /** null → бачить усі регіони. */
    region: national ? null : region,
    canChooseRegion: national,
  };
  scopeCache.set(cacheKey, { value, expiresAt: Date.now() + SCOPE_TTL_MS });
  return value;
}

/** Регіон, застосований до запиту: власний регіон користувача переважає query. */
function effectiveRegion(scope, query = {}) {
  if (scope.region) return scope.region;
  const requested = String(query.region || '').trim();
  return isNationalRegion(requested) ? null : requested;
}

function effectiveCompany(query = {}) {
  const c = String(query.company || '').trim();
  return c && c.toLowerCase() !== 'all' ? c : null;
}

/** Повний контекст запиту + ключ кешу, що враховує область видимості. */
async function buildContext(req) {
  const scope = await resolveScope(req);
  const period = parsePeriod(req.query);
  const basis = parseDateBasis(req.query);
  const region = effectiveRegion(scope, req.query);
  const company = effectiveCompany(req.query);
  const cacheKey = [
    region || 'all', company || 'all', period.year, period.period,
    period.month || 0, period.quarter || 0, basis.id,
  ].join('|');
  const force = req.query.force === '1' || req.query.refresh === '1';
  return { scope, period, basis, region, company, cacheKey, force };
}

/** Опис фільтра для UI, щоб на кожній панелі було видно, що саме порахували. */
function describeContext(ctx) {
  const parts = [ctx.period.label];
  parts.push(ctx.region ? `Регіон: ${ctx.region}` : 'Регіон: всі');
  if (ctx.company) parts.push(`Компанія: ${ctx.company}`);
  parts.push(`База: ${ctx.basis.label}`);
  return parts.join(' · ');
}

module.exports = {
  PERIODS,
  DATE_BASES,
  MONTH_NAMES,
  isNationalRegion,
  parsePeriod,
  parseDateBasis,
  resolveScope,
  effectiveRegion,
  effectiveCompany,
  buildContext,
  describeContext,
};
