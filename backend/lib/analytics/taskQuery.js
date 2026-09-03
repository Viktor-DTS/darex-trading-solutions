/**
 * Побудова пайплайнів по колекції Task для аналітики.
 *
 * Схема фільтрації періоду двоступенева:
 *  1) $match по сирих полях дати через $or (працює по індексах, дає надмножину);
 *  2) $match по обчисленому _basisDate (точна семантика «перше валідне поле»).
 * Один лише $expr був би точним, але сканував би всю колекцію; один лише $or —
 * швидким, але захоплював би заявки, у яких у період потрапляє не та дата, що обрана базою.
 */
const {
  TASK_MATERIAL_FIELDS,
  TASK_EXPENSE_FIELDS,
  TASK_ENGINEER_FIELDS,
  buildParseNumericFieldExpr,
  buildSumNumericFieldsExpr,
  buildFlexibleDateExpr,
  buildAnyDateRangeMatch,
  buildApprovalConfirmedExpr,
  buildApprovalRejectedExpr,
  buildLabelExpr,
  buildDaysBetweenExpr,
} = require('../taskAggregationExpr');

const STATUS_DONE = 'Виконано';
const STATUS_NEW = 'Заявка';
const STATUS_IN_WORK = 'В роботі';
const STATUS_BLOCKED = 'Заблоковано';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Толерантне до пробілів порівняння текстового поля (історичні записи мають хвостові пробіли). */
function looseEquals(field, value) {
  return { [field]: { $regex: `^\\s*${escapeRegex(value)}\\s*$`, $options: 'i' } };
}

/** Індексований $match-надмножина: регіон, компанія та діапазон дат. */
function buildIndexMatch(ctx, { from, to } = {}) {
  const conditions = [];
  if (ctx.region) conditions.push(looseEquals('serviceRegion', ctx.region));
  if (ctx.company) conditions.push(looseEquals('company', ctx.company));
  const dateMatch = buildAnyDateRangeMatch(
    ctx.basis.exprFields,
    from || ctx.period.from,
    to || ctx.period.to,
  );
  if (dateMatch) conditions.push(dateMatch);
  if (!conditions.length) return {};
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

/** Обчислені поля, на які спираються всі гілки $facet. */
function buildComputedFields(ctx) {
  const created = buildFlexibleDateExpr(['autoCreatedAt', 'requestDate', 'date']);
  const completed = buildFlexibleDateExpr(['autoCompletedAt', 'date']);
  const warehouseApproved = buildFlexibleDateExpr(['autoWarehouseApprovedAt', 'warehouseApprovalDate']);
  const accountantApproved = buildFlexibleDateExpr(['autoAccountantApprovedAt', 'approvalDate']);

  return {
    _basisDate: buildFlexibleDateExpr(ctx.basis.exprFields),
    _created: created,
    _completed: completed,
    _whApprovedAt: warehouseApproved,
    _acApprovedAt: accountantApproved,
    _paidAt: buildFlexibleDateExpr(['paymentDate']),
    _revenue: buildParseNumericFieldExpr('$serviceTotal'),
    _workPrice: buildParseNumericFieldExpr('$workPrice'),
    _materials: buildSumNumericFieldsExpr(TASK_MATERIAL_FIELDS),
    _expenses: buildSumNumericFieldsExpr(TASK_EXPENSE_FIELDS),
    _done: { $eq: ['$status', STATUS_DONE] },
    _blocked: { $eq: ['$status', STATUS_BLOCKED] },
    _active: { $in: ['$status', [STATUS_NEW, STATUS_IN_WORK]] },
    _whOk: buildApprovalConfirmedExpr('$approvedByWarehouse'),
    _whNo: buildApprovalRejectedExpr('$approvedByWarehouse'),
    _acOk: buildApprovalConfirmedExpr('$approvedByAccountant'),
    _acNo: buildApprovalRejectedExpr('$approvedByAccountant'),
    _rmOk: buildApprovalConfirmedExpr('$approvedByRegionalManager'),
    _statusLabel: buildLabelExpr('$status', 'Невідомо'),
    _regionLabel: buildLabelExpr('$serviceRegion'),
    _companyLabel: buildLabelExpr('$company'),
    _clientLabel: buildLabelExpr('$client', 'Без замовника'),
    _workLabel: buildLabelExpr('$work'),
    _equipmentLabel: buildLabelExpr('$equipment'),
    _paymentLabel: buildLabelExpr('$paymentType'),
    _authorLabel: buildLabelExpr('$requestAuthor', 'Без автора'),
    _engineers: {
      $filter: {
        input: TASK_ENGINEER_FIELDS.map((f) => ({ $trim: { input: { $toString: { $ifNull: [`$${f}`, ''] } } } })),
        as: 'e',
        cond: { $ne: ['$$e', ''] },
      },
    },
  };
}

/** Похідні поля другого рівня (залежать від buildComputedFields). */
function buildDerivedFields() {
  return {
    _margin: { $subtract: ['$_revenue', { $add: ['$_materials', '$_expenses'] }] },
    _engineerCount: { $size: '$_engineers' },
    _leadDays: buildDaysBetweenExpr('$_created', '$_completed'),
    _whWaitDays: buildDaysBetweenExpr('$_completed', '$_whApprovedAt'),
    _acWaitDays: buildDaysBetweenExpr('$_whApprovedAt', '$_acApprovedAt'),
    _cashDays: buildDaysBetweenExpr('$_completed', '$_paidAt'),
    _totalCycleDays: buildDaysBetweenExpr('$_created', '$_acApprovedAt'),
  };
}

/** Стандартний префікс пайплайну: індексований match → обчислення → точний match періоду. */
function buildBaseStages(ctx, { from, to } = {}) {
  const periodFrom = from || ctx.period.from;
  const periodTo = to || ctx.period.to;
  return [
    { $match: buildIndexMatch(ctx, { from: periodFrom, to: periodTo }) },
    { $addFields: buildComputedFields(ctx) },
    { $match: { _basisDate: { $gte: periodFrom, $lt: periodTo } } },
    { $addFields: buildDerivedFields() },
  ];
}

function buildScopeConditions(ctx) {
  const conditions = [];
  if (ctx.region) conditions.push(looseEquals('serviceRegion', ctx.region));
  if (ctx.company) conditions.push(looseEquals('company', ctx.company));
  return conditions;
}

/** Пайплайн без фільтра періоду. extraMatch звужує вибірку (напр. лише «Виконано»). */
function buildLiveStages(ctx, extraMatch = {}) {
  const conditions = [...buildScopeConditions(ctx)];
  const extra = extraMatch && Object.keys(extraMatch).length ? extraMatch : null;
  if (extra) conditions.push(extra);
  return [
    { $match: conditions.length ? (conditions.length === 1 ? conditions[0] : { $and: conditions }) : {} },
    { $addFields: buildComputedFields(ctx) },
    { $addFields: buildDerivedFields() },
  ];
}

/**
 * Живі черги: не чіпаємо заявки, які вже закриті складом і бухгалтерією.
 * Інакше воронка «зараз» сканувала б усю історію виконаних заявок.
 */
function buildLiveQueueMatch(ctx) {
  const openOrRejected = {
    $or: [
      { status: { $in: [STATUS_NEW, STATUS_IN_WORK, STATUS_BLOCKED] } },
      { status: STATUS_DONE, approvedByAccountant: { $nin: ['Підтверджено', true] } },
      { approvedByWarehouse: 'Відмова' },
      { approvedByAccountant: 'Відмова' },
    ],
  };
  const scope = buildScopeConditions(ctx);
  return scope.length ? { $and: [...scope, openOrRejected] } : openOrRejected;
}

function buildLiveQueueStages(ctx) {
  return [
    { $match: buildLiveQueueMatch(ctx) },
    { $addFields: buildComputedFields(ctx) },
    { $addFields: buildDerivedFields() },
  ];
}

/** Гілка $facet: топ-N за метрикою з підрахунком показників. */
function groupByLabel(labelField, { limit = 0, sortBy = 'revenue', onlyDone = false } = {}) {
  const stages = [];
  if (onlyDone) stages.push({ $match: { _done: true } });
  stages.push({
    $group: {
      _id: `$${labelField}`,
      tasks: { $sum: 1 },
      completed: { $sum: { $cond: ['$_done', 1, 0] } },
      revenue: { $sum: { $cond: ['$_done', '$_revenue', 0] } },
      workPrice: { $sum: { $cond: ['$_done', '$_workPrice', 0] } },
      materials: { $sum: { $cond: ['$_done', '$_materials', 0] } },
      expenses: { $sum: { $cond: ['$_done', '$_expenses', 0] } },
      margin: { $sum: { $cond: ['$_done', '$_margin', 0] } },
      avgLeadDays: { $avg: '$_leadDays' },
    },
  });
  stages.push({
    $project: {
      _id: 0,
      name: '$_id',
      tasks: 1,
      completed: 1,
      revenue: { $round: ['$revenue', 2] },
      workPrice: { $round: ['$workPrice', 2] },
      materials: { $round: ['$materials', 2] },
      expenses: { $round: ['$expenses', 2] },
      margin: { $round: ['$margin', 2] },
      avgLeadDays: { $round: [{ $ifNull: ['$avgLeadDays', null] }, 1] },
      avgTicket: {
        $cond: [{ $gt: ['$completed', 0] }, { $round: [{ $divide: ['$revenue', '$completed'] }, 2] }, 0],
      },
    },
  });
  stages.push({ $sort: { [sortBy]: -1, tasks: -1 } });
  if (limit > 0) stages.push({ $limit: limit });
  return stages;
}

module.exports = {
  STATUS_DONE,
  STATUS_NEW,
  STATUS_IN_WORK,
  STATUS_BLOCKED,
  escapeRegex,
  looseEquals,
  buildIndexMatch,
  buildComputedFields,
  buildDerivedFields,
  buildBaseStages,
  buildLiveStages,
  buildLiveQueueMatch,
  buildLiveQueueStages,
  groupByLabel,
};
