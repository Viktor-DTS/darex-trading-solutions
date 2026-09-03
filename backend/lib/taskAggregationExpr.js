/**
 * Спільні агрегаційні вирази для колекції Task.
 *
 * Task має { strict: false }, тому історичні записи зберігають:
 *  - гроші: number (12524.4), "12524" або "12 524,40" (пробіл-розділювач тисяч, кома-десяткова);
 *  - дати: Date або ISO-рядок ("2026-09-03", "2026-09-03T10:00:00.000Z");
 *  - підтвердження: "Підтверджено" / true / "Відмова" / "" / відсутнє поле.
 *
 * Будь-яка аналітика, що читає ці поля напряму (parseFloat, new Date, === 'Підтверджено'),
 * дає занижені або нульові показники. Усі модулі мають користуватись виразами звідси.
 */

/** Значення, що означають підтвердження (історично і рядок, і boolean). */
const APPROVAL_CONFIRMED_VALUES = ['Підтверджено', true];
/** Значення, що означають відмову. */
const APPROVAL_REJECTED_VALUES = ['Відмова'];

/** Грошові/кількісні поля заявки, які можуть бути рядками. */
const TASK_NUMERIC_FIELDS = [
  'serviceTotal', 'workPrice', 'oilUsed', 'oilPrice', 'oilTotal',
  'filterCount', 'filterPrice', 'filterSum',
  'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum',
  'airFilterCount', 'airFilterPrice', 'airFilterSum',
  'antifreezeL', 'antifreezePrice', 'antifreezeSum',
  'otherSum', 'transportKm', 'transportSum',
  'perDiem', 'living', 'otherExp', 'serviceBonus',
];

/** Матеріали, витрачені на заявку (собівартість матеріалів). */
const TASK_MATERIAL_FIELDS = [
  'oilTotal', 'filterSum', 'fuelFilterSum', 'airFilterSum', 'antifreezeSum', 'otherSum',
];

/** Супутні витрати на виконання заявки (окремо від матеріалів). */
const TASK_EXPENSE_FIELDS = [
  'transportSum', 'perDiem', 'living', 'otherExp', 'serviceBonus',
];

/** Слоти сервісних інженерів. */
const TASK_ENGINEER_FIELDS = ['engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'];

/**
 * Рядок → нормалізований числовий рядок: прибирає звичайні та non-breaking пробіли,
 * апострофи-розділювачі, кому замінює на точку.
 */
function buildNormalizedNumericStringExpr(fieldRef) {
  const stripped = ['\u0020', '\u00A0', '\u202F', '\u2009', '\u0027', '\u2019'].reduce(
    (input, ch) => ({ $replaceAll: { input, find: ch, replacement: '' } }),
    { $trim: { input: { $toString: { $ifNull: [fieldRef, ''] } } } },
  );
  return { $replaceAll: { input: stripped, find: ',', replacement: '.' } };
}

/** Будь-яке представлення числа в заявці → double (0 при помилці). */
function buildParseNumericFieldExpr(fieldRef) {
  return {
    $let: {
      vars: { raw: { $ifNull: [fieldRef, 0] } },
      in: {
        $switch: {
          branches: [
            {
              case: { $in: [{ $type: '$$raw' }, ['double', 'int', 'long', 'decimal']] },
              then: { $toDouble: '$$raw' },
            },
          ],
          default: {
            $convert: {
              input: buildNormalizedNumericStringExpr('$$raw'),
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
    },
  };
}

/** Сума кількох числових полів заявки. */
function buildSumNumericFieldsExpr(fields) {
  return { $add: fields.map((f) => buildParseNumericFieldExpr(`$${f}`)) };
}

/**
 * Date | ISO-рядок → Date, інакше null.
 * Приймає список полів і бере перше, що успішно конвертується (аналог `a || b` у JS,
 * але з відсіюванням порожніх рядків і сміттєвих значень).
 */
function buildFlexibleDateExpr(fields) {
  const list = Array.isArray(fields) ? fields : [fields];
  const candidates = list.map((f) => ({
    $convert: { input: `$${f}`, to: 'date', onError: null, onNull: null },
  }));
  // Вкладені двоаргументні $ifNull, а не один багатоаргументний: варіант зі списком
  // аргументів доступний лише з MongoDB 5.0.
  return candidates.reduceRight((fallback, candidate) => ({ $ifNull: [candidate, fallback] }), null);
}

function toIsoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Рядки з датою не в ISO-формі («15.01.2026»). MongoDB такі значення все одно
 * конвертує в дату, але лексикографічне порівняння з «2026-01-01» їх не ловить,
 * тому без цієї гілки вони тихо зникали б з будь-якого періоду.
 * Гілка обчислюється сканом індексу по полю, а не колекції, і в базі з
 * коректними ISO-рядками не дає жодного збігу.
 */
function buildNonIsoStringDateMatch(field) {
  return { [field]: { $type: 'string', $not: { $regex: '^\\d{4}-' } } };
}

/**
 * $match для діапазону [from, to) по полю, що може бути Date або рядком.
 * Гілок кілька, бо BSON не порівнює рядки з датами: кожна відсікає свій тип
 * і може використати індекс по полю. Результат — надмножина; точну межу
 * періоду ставить наступний $match по обчисленій даті.
 */
function buildDateRangeMatch(field, from, to) {
  if (!from && !to) return null;
  const dateCond = {};
  const strCond = {};
  if (from) {
    dateCond.$gte = from;
    strCond.$gte = toIsoDay(from);
  }
  if (to) {
    dateCond.$lt = to;
    strCond.$lt = toIsoDay(to);
  }
  return {
    $or: [
      { [field]: dateCond },
      { [field]: strCond },
      buildNonIsoStringDateMatch(field),
    ],
  };
}

/** $match для діапазону по першому непорожньому з кількох полів дати. */
function buildAnyDateRangeMatch(fields, from, to) {
  const list = Array.isArray(fields) ? fields : [fields];
  const parts = list.map((f) => buildDateRangeMatch(f, from, to)).filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { $or: parts.flatMap((p) => p.$or) };
}

/** true, якщо поле підтвердження містить підтвердження (рядок або boolean). */
function buildApprovalConfirmedExpr(fieldRef) {
  return { $in: [fieldRef, APPROVAL_CONFIRMED_VALUES] };
}

/** true, якщо поле підтвердження містить відмову. */
function buildApprovalRejectedExpr(fieldRef) {
  return { $in: [fieldRef, APPROVAL_REJECTED_VALUES] };
}

/** Нормалізований непорожній текст поля або значення-заповнювач. */
function buildLabelExpr(fieldRef, fallback = 'Не вказано') {
  return {
    $let: {
      vars: { v: { $trim: { input: { $toString: { $ifNull: [fieldRef, ''] } } } } },
      in: { $cond: [{ $eq: ['$$v', ''] }, fallback, '$$v'] },
    },
  };
}

/** Різниця між двома датами у днях (null, якщо будь-яка не парситься або результат негативний). */
function buildDaysBetweenExpr(startExpr, endExpr, { allowNegative = false } = {}) {
  return {
    $let: {
      vars: { s: startExpr, e: endExpr },
      in: {
        $cond: [
          { $or: [{ $eq: ['$$s', null] }, { $eq: ['$$e', null] }] },
          null,
          {
            $let: {
              vars: { d: { $divide: [{ $subtract: ['$$e', '$$s'] }, 86400000] } },
              in: allowNegative ? '$$d' : { $cond: [{ $lt: ['$$d', 0] }, null, '$$d'] },
            },
          },
        ],
      },
    },
  };
}

module.exports = {
  APPROVAL_CONFIRMED_VALUES,
  APPROVAL_REJECTED_VALUES,
  TASK_NUMERIC_FIELDS,
  TASK_MATERIAL_FIELDS,
  TASK_EXPENSE_FIELDS,
  TASK_ENGINEER_FIELDS,
  buildNormalizedNumericStringExpr,
  buildParseNumericFieldExpr,
  buildSumNumericFieldsExpr,
  buildFlexibleDateExpr,
  buildNonIsoStringDateMatch,
  buildDateRangeMatch,
  buildAnyDateRangeMatch,
  buildApprovalConfirmedExpr,
  buildApprovalRejectedExpr,
  buildLabelExpr,
  buildDaysBetweenExpr,
  toIsoDay,
};
