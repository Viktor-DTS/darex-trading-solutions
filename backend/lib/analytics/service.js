/**
 * Аналітика сервісної служби: усе, що вважається по колекції Task.
 * Один агрегаційний запит із $facet замість вивантаження колекції в браузер.
 */
const mongoose = require('mongoose');
const { MONTH_NAMES } = require('./context');
const { buildBaseStages, groupByLabel, escapeRegex } = require('./taskQuery');
const { buildFlexibleDateExpr } = require('../taskAggregationExpr');

const WEEKDAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const not = (expr) => ({ $not: [expr] });
const round = (expr, digits = 2) => ({ $round: [{ $ifNull: [expr, 0] }, digits] });
const roundOrNull = (expr, digits = 1) => ({
  $cond: [{ $eq: [expr, null] }, null, { $round: [expr, digits] }],
});

function buildKpiFacet() {
  return [{
    $group: {
      _id: null,
      tasks: { $sum: 1 },
      completed: { $sum: { $cond: ['$_done', 1, 0] } },
      active: { $sum: { $cond: ['$_active', 1, 0] } },
      blocked: { $sum: { $cond: ['$_blocked', 1, 0] } },
      rejected: { $sum: { $cond: [{ $or: ['$_whNo', '$_acNo'] }, 1, 0] } },
      revenue: { $sum: { $cond: ['$_done', '$_revenue', 0] } },
      workPrice: { $sum: { $cond: ['$_done', '$_workPrice', 0] } },
      materials: { $sum: { $cond: ['$_done', '$_materials', 0] } },
      expenses: { $sum: { $cond: ['$_done', '$_expenses', 0] } },
      margin: { $sum: { $cond: ['$_done', '$_margin', 0] } },
      approvedFull: { $sum: { $cond: [{ $and: ['$_done', '$_whOk', '$_acOk'] }, 1, 0] } },
      awaitingWarehouse: {
        $sum: { $cond: [{ $and: ['$_done', not('$_whOk'), not('$_whNo')] }, 1, 0] },
      },
      awaitingAccountant: {
        $sum: { $cond: [{ $and: ['$_done', '$_whOk', not('$_acOk'), not('$_acNo')] }, 1, 0] },
      },
      paidRevenue: {
        $sum: { $cond: [{ $and: ['$_done', { $ne: ['$_paidAt', null] }] }, '$_revenue', 0] },
      },
      unpaidRevenue: {
        $sum: { $cond: [{ $and: ['$_done', { $eq: ['$_paidAt', null] }] }, '$_revenue', 0] },
      },
      avgLeadDays: { $avg: '$_leadDays' },
      maxLeadDays: { $max: '$_leadDays' },
      avgWarehouseWaitDays: { $avg: '$_whWaitDays' },
      avgAccountantWaitDays: { $avg: '$_acWaitDays' },
      avgCashDays: { $avg: '$_cashDays' },
      avgCycleDays: { $avg: '$_totalCycleDays' },
      leadSamples: { $sum: { $cond: [{ $ne: ['$_leadDays', null] }, 1, 0] } },
      zeroRevenueCompleted: {
        $sum: { $cond: [{ $and: ['$_done', { $lte: ['$_revenue', 0] }] }, 1, 0] },
      },
      negativeMarginTasks: {
        $sum: { $cond: [{ $and: ['$_done', { $lt: ['$_margin', 0] }] }, 1, 0] },
      },
    },
  }, {
    $project: {
      _id: 0,
      tasks: 1,
      completed: 1,
      active: 1,
      blocked: 1,
      rejected: 1,
      approvedFull: 1,
      awaitingWarehouse: 1,
      awaitingAccountant: 1,
      leadSamples: 1,
      zeroRevenueCompleted: 1,
      negativeMarginTasks: 1,
      revenue: round('$revenue'),
      workPrice: round('$workPrice'),
      materials: round('$materials'),
      expenses: round('$expenses'),
      margin: round('$margin'),
      paidRevenue: round('$paidRevenue'),
      unpaidRevenue: round('$unpaidRevenue'),
      avgLeadDays: roundOrNull('$avgLeadDays'),
      maxLeadDays: roundOrNull('$maxLeadDays'),
      avgWarehouseWaitDays: roundOrNull('$avgWarehouseWaitDays'),
      avgAccountantWaitDays: roundOrNull('$avgAccountantWaitDays'),
      avgCashDays: roundOrNull('$avgCashDays'),
      avgCycleDays: roundOrNull('$avgCycleDays'),
    },
  }];
}

function buildMonthlyFacet() {
  return [
    {
      $group: {
        _id: { $month: '$_basisDate' },
        tasks: { $sum: 1 },
        completed: { $sum: { $cond: ['$_done', 1, 0] } },
        revenue: { $sum: { $cond: ['$_done', '$_revenue', 0] } },
        workPrice: { $sum: { $cond: ['$_done', '$_workPrice', 0] } },
        materials: { $sum: { $cond: ['$_done', '$_materials', 0] } },
        expenses: { $sum: { $cond: ['$_done', '$_expenses', 0] } },
        margin: { $sum: { $cond: ['$_done', '$_margin', 0] } },
        avgLeadDays: { $avg: '$_leadDays' },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

function buildEngineerFacet() {
  return [
    { $match: { _engineerCount: { $gt: 0 } } },
    { $unwind: '$_engineers' },
    {
      $group: {
        _id: '$_engineers',
        // Участь у заявках: одна заявка з двома інженерами дає +1 кожному.
        participations: { $sum: 1 },
        completed: { $sum: { $cond: ['$_done', 1, 0] } },
        // Частка заявки: та ж заявка дає по 0.5 — сума по всіх інженерах = кількості заявок.
        taskShare: { $sum: { $divide: [1, '$_engineerCount'] } },
        revenueShare: {
          $sum: { $cond: ['$_done', { $divide: ['$_revenue', '$_engineerCount'] }, 0] },
        },
        marginShare: {
          $sum: { $cond: ['$_done', { $divide: ['$_margin', '$_engineerCount'] }, 0] },
        },
        avgLeadDays: { $avg: '$_leadDays' },
        regions: { $addToSet: '$_regionLabel' },
      },
    },
    {
      $project: {
        _id: 0,
        name: '$_id',
        participations: 1,
        completed: 1,
        taskShare: round('$taskShare', 2),
        revenue: round('$revenueShare'),
        margin: round('$marginShare'),
        avgLeadDays: roundOrNull('$avgLeadDays'),
        regions: 1,
        avgTicket: {
          $cond: [{ $gt: ['$completed', 0] }, round({ $divide: ['$revenueShare', '$completed'] }), 0],
        },
      },
    },
    { $sort: { completed: -1, revenue: -1 } },
  ];
}

function buildDataQualityFacet() {
  const missing = (expr) => ({ $sum: { $cond: [expr, 1, 0] } });
  const isBlank = (field) => ({
    $eq: [{ $trim: { input: { $toString: { $ifNull: [field, ''] } } } }, ''],
  });
  return [{
    $group: {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: ['$_done', 1, 0] } },
      missingWork: missing({ $and: ['$_done', isBlank('$work')] }),
      missingAuthor: missing(isBlank('$requestAuthor')),
      missingEquipment: missing({ $and: ['$_done', isBlank('$equipment')] }),
      missingClient: missing(isBlank('$client')),
      missingRegion: missing(isBlank('$serviceRegion')),
      missingPaymentType: missing({ $and: ['$_done', isBlank('$paymentType')] }),
      missingEngineer: missing({ $and: ['$_done', { $eq: ['$_engineerCount', 0] }] }),
      missingCompletedAt: missing({ $and: ['$_done', { $eq: ['$_completed', null] }] }),
      missingCreatedAt: missing({ $eq: ['$_created', null] }),
      zeroRevenueCompleted: missing({ $and: ['$_done', { $lte: ['$_revenue', 0] }] }),
      revenueAsString: missing({ $eq: [{ $type: '$serviceTotal' }, 'string'] }),
    },
  }, { $project: { _id: 0 } }];
}

/**
 * Дві аномалії дат, які інакше не видно ніде:
 *  - undated  — жодне поле дати не парситься, заявка не належить жодному періоду;
 *  - nonIso   — дата збережена рядком не в ISO («15.01.2026»); вона обробляється
 *               коректно, але формат крихкий і його варто вирівняти.
 */
async function countDateAnomalies(ctx) {
  const Task = mongoose.model('Task');
  const match = {};
  if (ctx.region) match.serviceRegion = { $regex: `^\\s*${escapeRegex(ctx.region)}\\s*$`, $options: 'i' };
  const rows = await Task.aggregate([
    { $match: match },
    {
      $addFields: {
        _anyDate: buildFlexibleDateExpr(['requestDate', 'date', 'autoCreatedAt']),
        _nonIso: {
          $anyElementTrue: [['requestDate', 'date'].map((f) => ({
            $and: [
              { $eq: [{ $type: `$${f}` }, 'string'] },
              { $not: [{ $regexMatch: { input: { $toString: { $ifNull: [`$${f}`, ''] } }, regex: '^\\d{4}-' } }] },
            ],
          }))],
        },
      },
    },
    {
      $group: {
        _id: null,
        undated: { $sum: { $cond: [{ $eq: ['$_anyDate', null] }, 1, 0] } },
        nonIso: { $sum: { $cond: ['$_nonIso', 1, 0] } },
      },
    },
  ]).allowDiskUse(true);
  return { undated: rows[0]?.undated || 0, nonIso: rows[0]?.nonIso || 0 };
}

function fillMonths(rows, year) {
  const byMonth = new Map(rows.map((r) => [r._id, r]));
  return MONTH_NAMES.map((label, idx) => {
    const r = byMonth.get(idx + 1) || {};
    return {
      month: idx + 1,
      label: label.slice(0, 3),
      fullLabel: `${label} ${year}`,
      tasks: r.tasks || 0,
      completed: r.completed || 0,
      revenue: Math.round((r.revenue || 0) * 100) / 100,
      workPrice: Math.round((r.workPrice || 0) * 100) / 100,
      materials: Math.round((r.materials || 0) * 100) / 100,
      expenses: Math.round((r.expenses || 0) * 100) / 100,
      margin: Math.round((r.margin || 0) * 100) / 100,
      avgLeadDays: r.avgLeadDays != null ? Math.round(r.avgLeadDays * 10) / 10 : null,
    };
  });
}

const EMPTY_KPI = {
  tasks: 0, completed: 0, active: 0, blocked: 0, rejected: 0, approvedFull: 0,
  awaitingWarehouse: 0, awaitingAccountant: 0, leadSamples: 0, zeroRevenueCompleted: 0,
  negativeMarginTasks: 0, revenue: 0, workPrice: 0, materials: 0, expenses: 0, margin: 0,
  paidRevenue: 0, unpaidRevenue: 0, avgLeadDays: null, maxLeadDays: null,
  avgWarehouseWaitDays: null, avgAccountantWaitDays: null, avgCashDays: null, avgCycleDays: null,
};

function deriveKpi(raw, period) {
  const kpi = { ...EMPTY_KPI, ...(raw || {}) };
  kpi.conversionRate = kpi.tasks > 0 ? (kpi.completed / kpi.tasks) * 100 : 0;
  kpi.avgTicket = kpi.completed > 0 ? kpi.revenue / kpi.completed : 0;
  kpi.closeRate = kpi.completed > 0 ? (kpi.approvedFull / kpi.completed) * 100 : 0;
  kpi.rejectionRate = kpi.tasks > 0 ? (kpi.rejected / kpi.tasks) * 100 : 0;
  kpi.marginRate = kpi.revenue > 0 ? (kpi.margin / kpi.revenue) * 100 : 0;
  kpi.materialsRate = kpi.revenue > 0 ? (kpi.materials / kpi.revenue) * 100 : 0;
  kpi.expensesRate = kpi.revenue > 0 ? (kpi.expenses / kpi.revenue) * 100 : 0;
  kpi.collectedRate = kpi.revenue > 0 ? (kpi.paidRevenue / kpi.revenue) * 100 : 0;
  // Run-rate: екстраполяція лише за фактично минулими місяцями періоду.
  const elapsed = Math.max(period.elapsedMonths, 0);
  kpi.runRateRevenue = elapsed > 0.3
    ? (kpi.revenue / elapsed) * period.monthsInPeriod
    : null;
  return kpi;
}

function withDelta(current, previous) {
  const pick = (obj, key) => Number(obj?.[key] ?? 0);
  const delta = (key) => {
    const cur = pick(current, key);
    const prev = pick(previous, key);
    if (!prev) return { current: cur, previous: prev, changePct: null, direction: cur > 0 ? 'up' : 'flat' };
    const changePct = ((cur - prev) / Math.abs(prev)) * 100;
    return {
      current: cur,
      previous: prev,
      changePct,
      direction: changePct > 0.5 ? 'up' : changePct < -0.5 ? 'down' : 'flat',
    };
  };
  return {
    tasks: delta('tasks'),
    completed: delta('completed'),
    revenue: delta('revenue'),
    margin: delta('margin'),
    avgTicket: delta('avgTicket'),
    conversionRate: delta('conversionRate'),
    avgLeadDays: delta('avgLeadDays'),
  };
}

function paymentTypeFacet() {
  return [
    { $match: { _done: true } },
    { $group: { _id: '$_paymentLabel', tasks: { $sum: 1 }, revenue: { $sum: '$_revenue' } } },
    { $project: { _id: 0, name: '$_id', tasks: 1, revenue: round('$revenue') } },
    { $sort: { revenue: -1 } },
  ];
}

function operatorFacet() {
  return [
    {
      $group: {
        _id: '$_authorLabel',
        tasks: { $sum: 1 },
        completed: { $sum: { $cond: ['$_done', 1, 0] } },
        revenue: { $sum: { $cond: ['$_done', '$_revenue', 0] } },
        clients: { $addToSet: '$_clientLabel' },
      },
    },
    {
      $project: {
        _id: 0,
        name: '$_id',
        tasks: 1,
        completed: 1,
        revenue: round('$revenue'),
        uniqueClients: { $size: '$clients' },
      },
    },
    { $sort: { tasks: -1 } },
  ];
}

function weekdayFacet() {
  return [
    {
      $group: {
        _id: { $dayOfWeek: '$_basisDate' },
        tasks: { $sum: 1 },
        revenue: { $sum: { $cond: ['$_done', '$_revenue', 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

function statusFacet() {
  return [
    { $group: { _id: '$_statusLabel', tasks: { $sum: 1 }, revenue: { $sum: '$_revenue' } } },
    { $project: { _id: 0, name: '$_id', tasks: 1, revenue: round('$revenue') } },
    { $sort: { tasks: -1 } },
  ];
}

/** Легкий зріз для огляду: KPI, динаміка, статуси, регіони. Важкі розрізи — лише на вкладці «Сервіс». */
function buildServiceFacets(light) {
  const facets = {
    kpi: buildKpiFacet(),
    monthly: buildMonthlyFacet(),
    byStatus: statusFacet(),
    byRegion: groupByLabel('_regionLabel'),
    byPaymentType: paymentTypeFacet(),
    dataQuality: buildDataQualityFacet(),
  };
  if (light) return facets;
  return {
    ...facets,
    byCompany: groupByLabel('_companyLabel'),
    byClient: groupByLabel('_clientLabel', { limit: 20 }),
    byWorkType: groupByLabel('_workLabel', { limit: 20, sortBy: 'tasks' }),
    byEquipment: groupByLabel('_equipmentLabel', { limit: 20, sortBy: 'tasks' }),
    byEngineer: buildEngineerFacet(),
    byOperator: operatorFacet(),
    byWeekday: weekdayFacet(),
  };
}

async function loadServiceAnalytics(ctx, { light = false } = {}) {
  const Task = mongoose.model('Task');
  const facetStages = buildServiceFacets(light);

  const jobs = [
    Task.aggregate([...buildBaseStages(ctx), { $facet: facetStages }]).allowDiskUse(true),
    Task.aggregate([
      ...buildBaseStages(ctx, { from: ctx.period.prevFrom, to: ctx.period.prevTo }),
      { $facet: { kpi: buildKpiFacet(), monthly: buildMonthlyFacet() } },
    ]).allowDiskUse(true),
  ];
  if (!light) jobs.push(countDateAnomalies(ctx));

  const [current, prevRows, dateAnomalies] = await Promise.all(jobs);

  const facets = current[0] || {};
  const prevFacets = prevRows[0] || {};

  const kpi = deriveKpi(facets.kpi?.[0], ctx.period);
  const prevKpi = deriveKpi(prevFacets.kpi?.[0], ctx.period);
  const dataQuality = facets.dataQuality?.[0] || {};

  return {
    kpi,
    previous: prevKpi,
    deltas: withDelta(kpi, prevKpi),
    monthly: fillMonths(facets.monthly || [], ctx.period.year),
    monthlyPrevious: fillMonths(prevFacets.monthly || [], ctx.period.year - 1),
    byStatus: facets.byStatus || [],
    byRegion: facets.byRegion || [],
    byCompany: facets.byCompany || [],
    byPaymentType: facets.byPaymentType || [],
    byClient: facets.byClient || [],
    byWorkType: facets.byWorkType || [],
    byEquipment: facets.byEquipment || [],
    byEngineer: facets.byEngineer || [],
    byOperator: facets.byOperator || [],
    byWeekday: (facets.byWeekday || []).map((r) => ({
      name: WEEKDAY_NAMES[(r._id || 1) - 1],
      tasks: r.tasks,
      revenue: Math.round((r.revenue || 0) * 100) / 100,
    })),
    dataQuality: {
      ...dataQuality,
      undatedTasks: dateAnomalies?.undated || 0,
      nonIsoDateTasks: dateAnomalies?.nonIso || 0,
    },
  };
}

module.exports = { loadServiceAnalytics, buildKpiFacet, deriveKpi, WEEKDAY_NAMES };
