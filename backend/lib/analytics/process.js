/**
 * Воронка процесу DTS: оператор → сервіс → склад → бухгалтерія → закрито.
 *
 * Тут дві різні речі, які раніше змішувались в одну:
 *  - cohort  — де зараз стоять заявки вибраного періоду (скільки з них дійшло до закриття);
 *  - queues  — фактичний стан черг на цю мить (без фільтра періоду), бо «зависло» —
 *              це завжди про сьогодні, а не про минулий рік.
 */
const mongoose = require('mongoose');
const { buildBaseStages, buildLiveQueueStages } = require('./taskQuery');
const { buildDaysBetweenExpr } = require('../taskAggregationExpr');

/** Порогові значення мають збігатися з frontend/src/utils/taskStuckRules.js. */
const STUCK_APPROVAL_DAYS = 7;
const STUCK_ACTIVE_DAYS = 14;
const STUCK_LIST_LIMIT = 100;

const not = (expr) => ({ $not: [expr] });

const STAGES = [
  {
    id: 'operator',
    label: 'Оператор',
    icon: '📞',
    panel: 'Оператор',
    color: '#3b82f6',
    description: 'Нові заявки, ще не взяті в роботу',
    stuckAfterDays: STUCK_ACTIVE_DAYS,
    tracksStuck: true,
  },
  {
    id: 'service',
    label: 'Сервіс',
    icon: '🔧',
    panel: 'Сервісна служба',
    color: '#f59e0b',
    description: 'Заявки в роботі в інженерів',
    stuckAfterDays: STUCK_ACTIVE_DAYS,
    tracksStuck: true,
  },
  {
    id: 'warehouse',
    label: 'Зав. склад',
    icon: '📦',
    panel: 'Зав. склад',
    color: '#a855f7',
    description: 'Виконано, очікує підтвердження складу',
    stuckAfterDays: STUCK_APPROVAL_DAYS,
    tracksStuck: true,
  },
  {
    id: 'accountant',
    label: 'Бухгалтерія',
    icon: '💰',
    panel: 'Бух на затвердженні',
    color: '#eab308',
    description: 'Склад підтвердив, очікує бухгалтерію',
    stuckAfterDays: STUCK_APPROVAL_DAYS,
    tracksStuck: true,
  },
  {
    id: 'closed',
    label: 'Закрито',
    icon: '✅',
    panel: '—',
    color: '#22c55e',
    description: 'Підтверджено складом і бухгалтерією',
    tracksStuck: false,
  },
];

const SIDE_STAGES = [
  { id: 'blocked', label: 'Заблоковано', icon: '🚫', color: '#ef4444' },
  { id: 'rejected', label: 'Відмова', icon: '❌', color: '#f97316' },
  { id: 'other', label: 'Інші статуси', icon: '❔', color: '#64748b' },
];

const ACTIVE_STAGE_IDS = ['operator', 'service', 'warehouse', 'accountant'];

/** Етап заявки + скільки днів вона на цьому етапі + чи перевищено поріг. */
function buildStageFields() {
  return {
    _stage: {
      $switch: {
        branches: [
          { case: '$_blocked', then: 'blocked' },
          { case: { $or: ['$_whNo', '$_acNo'] }, then: 'rejected' },
          { case: { $eq: ['$status', 'Заявка'] }, then: 'operator' },
          { case: { $eq: ['$status', 'В роботі'] }, then: 'service' },
          { case: { $and: ['$_done', not('$_whOk')] }, then: 'warehouse' },
          { case: { $and: ['$_done', '$_whOk', not('$_acOk')] }, then: 'accountant' },
          { case: { $and: ['$_done', '$_whOk', '$_acOk'] }, then: 'closed' },
        ],
        default: 'other',
      },
    },
    _stageStartedAt: {
      $switch: {
        branches: [
          { case: { $eq: ['$status', 'Заявка'] }, then: '$_created' },
          { case: { $eq: ['$status', 'В роботі'] }, then: { $ifNull: ['$_basisDate', '$_created'] } },
          { case: { $and: ['$_done', not('$_whOk')] }, then: '$_completed' },
          { case: { $and: ['$_done', '$_whOk', not('$_acOk')] }, then: '$_whApprovedAt' },
        ],
        default: null,
      },
    },
  };
}

function buildStageDaysField() {
  return {
    _stageDays: buildDaysBetweenExpr('$_stageStartedAt', '$$NOW'),
  };
}

function buildStuckField() {
  return {
    _stuck: {
      $switch: {
        branches: [
          {
            case: { $in: ['$_stage', ['operator', 'service']] },
            then: { $gt: [{ $ifNull: ['$_stageDays', 0] }, STUCK_ACTIVE_DAYS] },
          },
          {
            case: { $in: ['$_stage', ['warehouse', 'accountant']] },
            then: { $gt: [{ $ifNull: ['$_stageDays', 0] }, STUCK_APPROVAL_DAYS] },
          },
        ],
        default: false,
      },
    },
    _stuckReason: {
      $switch: {
        branches: [
          { case: { $eq: ['$_stage', 'operator'] }, then: 'Не взято в роботу' },
          { case: { $eq: ['$_stage', 'service'] }, then: 'В роботі без виконання' },
          { case: { $eq: ['$_stage', 'warehouse'] }, then: 'Склад не підтвердив' },
          { case: { $eq: ['$_stage', 'accountant'] }, then: 'Бухгалтерія не затвердила' },
        ],
        default: null,
      },
    },
  };
}

const STAGE_GROUP = {
  $group: {
    _id: '$_stage',
    count: { $sum: 1 },
    revenue: { $sum: '$_revenue' },
    avgStageDays: { $avg: '$_stageDays' },
    maxStageDays: { $max: '$_stageDays' },
    stuck: { $sum: { $cond: ['$_stuck', 1, 0] } },
    stuckRevenue: { $sum: { $cond: ['$_stuck', '$_revenue', 0] } },
  },
};

const STUCK_PROJECTION = {
  $project: {
    _id: 0,
    id: { $toString: '$_id' },
    number: { $ifNull: ['$requestNumber', { $toString: '$_id' }] },
    client: '$_clientLabel',
    region: '$_regionLabel',
    status: '$_statusLabel',
    author: '$_authorLabel',
    stage: '$_stage',
    reason: '$_stuckReason',
    days: { $round: [{ $ifNull: ['$_stageDays', 0] }, 1] },
    revenue: { $round: ['$_revenue', 2] },
    engineers: '$_engineers',
  },
};

function normalizeStageRows(rows, total) {
  const byId = new Map(rows.map((r) => [r._id, r]));
  const build = (def) => {
    const r = byId.get(def.id) || {};
    return {
      ...def,
      count: r.count || 0,
      revenue: Math.round((r.revenue || 0) * 100) / 100,
      stuck: r.stuck || 0,
      stuckRevenue: Math.round((r.stuckRevenue || 0) * 100) / 100,
      avgStageDays: r.avgStageDays != null ? Math.round(r.avgStageDays * 10) / 10 : null,
      maxStageDays: r.maxStageDays != null ? Math.round(r.maxStageDays * 10) / 10 : null,
      percent: total > 0 ? ((r.count || 0) / total) * 100 : 0,
    };
  };
  return { stages: STAGES.map(build), sideStages: SIDE_STAGES.map(build) };
}

async function loadProcessAnalytics(ctx, { light = false } = {}) {
  const Task = mongoose.model('Task');

  const stageStages = [
    { $addFields: buildStageFields() },
    { $addFields: buildStageDaysField() },
    { $addFields: buildStuckField() },
  ];

  const transitionsFacet = [{
    $group: {
      _id: null,
      createdToDone: { $avg: '$_leadDays' },
      createdToDoneN: { $sum: { $cond: [{ $ne: ['$_leadDays', null] }, 1, 0] } },
      doneToWarehouse: { $avg: '$_whWaitDays' },
      doneToWarehouseN: { $sum: { $cond: [{ $ne: ['$_whWaitDays', null] }, 1, 0] } },
      warehouseToAccountant: { $avg: '$_acWaitDays' },
      warehouseToAccountantN: { $sum: { $cond: [{ $ne: ['$_acWaitDays', null] }, 1, 0] } },
      doneToPaid: { $avg: '$_cashDays' },
      doneToPaidN: { $sum: { $cond: [{ $ne: ['$_cashDays', null] }, 1, 0] } },
      fullCycle: { $avg: '$_totalCycleDays' },
      fullCycleN: { $sum: { $cond: [{ $ne: ['$_totalCycleDays', null] }, 1, 0] } },
    },
  }];

  const invoiceFacet = [{
    $group: {
      _id: null,
      needInvoice: {
        $sum: {
          $cond: [{ $in: ['$needInvoice', [true, 'Так', 'так']] }, 1, 0],
        },
      },
      invoicePending: {
        $sum: {
          $cond: [
            {
              $and: [
                {
                  $or: [
                    { $eq: ['$invoiceRequested', true] },
                    { $ne: [{ $ifNull: ['$invoiceRequestId', null] }, null] },
                    { $in: ['$needInvoice', [true, 'Так', 'так']] },
                  ],
                },
                { $ne: ['$invoiceStatus', 'completed'] },
                { $eq: [{ $trim: { input: { $toString: { $ifNull: ['$invoiceFile', ''] } } } }, ''] },
              ],
            },
            1,
            0,
          ],
        },
      },
      invoiceRejected: { $sum: { $cond: [{ $eq: ['$invoiceStatus', 'rejected'] }, 1, 0] } },
    },
  }];

  const jobs = [
    Task.aggregate([
      ...buildBaseStages(ctx),
      ...stageStages,
      {
        $facet: {
          stages: [STAGE_GROUP],
          total: [{ $count: 'n' }],
          transitions: transitionsFacet,
          invoices: invoiceFacet,
        },
      },
    ]).allowDiskUse(true),
    Task.aggregate([
      ...buildLiveQueueStages(ctx),
      ...stageStages,
      { $facet: { stages: [STAGE_GROUP], total: [{ $count: 'n' }] } },
    ]).allowDiskUse(true),
  ];
  if (!light) {
    jobs.push(Task.aggregate([
      ...buildLiveQueueStages(ctx),
      ...stageStages,
      { $match: { _stuck: true } },
      { $sort: { _stageDays: -1 } },
      { $limit: STUCK_LIST_LIMIT * ACTIVE_STAGE_IDS.length },
      STUCK_PROJECTION,
    ]).allowDiskUse(true));
  }

  const [cohortRows, liveRows, stuckLists] = await Promise.all(jobs);

  const cohort = cohortRows[0] || {};
  const live = liveRows[0] || {};
  const cohortTotal = cohort.total?.[0]?.n || 0;
  const liveTotal = live.total?.[0]?.n || 0;

  const cohortStages = normalizeStageRows(cohort.stages || [], cohortTotal);
  const liveStages = normalizeStageRows(live.stages || [], liveTotal);

  const stuckByStage = {};
  for (const stageId of ACTIVE_STAGE_IDS) stuckByStage[stageId] = [];
  for (const row of stuckLists || []) {
    if (stuckByStage[row.stage] && stuckByStage[row.stage].length < STUCK_LIST_LIMIT) {
      stuckByStage[row.stage].push(row);
    }
  }

  const t = cohort.transitions?.[0] || {};
  const transitions = [
    { id: 'createdToDone', label: 'Створення → виконання', days: t.createdToDone, samples: t.createdToDoneN || 0, target: 5 },
    { id: 'doneToWarehouse', label: 'Виконання → склад', days: t.doneToWarehouse, samples: t.doneToWarehouseN || 0, target: 2 },
    { id: 'warehouseToAccountant', label: 'Склад → бухгалтерія', days: t.warehouseToAccountant, samples: t.warehouseToAccountantN || 0, target: 2 },
    { id: 'doneToPaid', label: 'Виконання → оплата', days: t.doneToPaid, samples: t.doneToPaidN || 0, target: 30 },
    { id: 'fullCycle', label: 'Повний цикл (створення → затвердження)', days: t.fullCycle, samples: t.fullCycleN || 0, target: 10 },
  ].map((row) => ({
    ...row,
    days: row.days != null ? Math.round(row.days * 10) / 10 : null,
    overTarget: row.days != null && row.days > row.target,
  }));

  const closedCohort = cohortStages.stages.find((s) => s.id === 'closed')?.count || 0;
  const liveActive = liveStages.stages
    .filter((s) => ACTIVE_STAGE_IDS.includes(s.id))
    .reduce((sum, s) => sum + s.count, 0);
  const liveStuckTotal = liveStages.stages.reduce((sum, s) => sum + s.stuck, 0);
  const liveStuckRevenue = liveStages.stages.reduce((sum, s) => sum + s.stuckRevenue, 0);
  const bottleneck = [...liveStages.stages]
    .filter((s) => ACTIVE_STAGE_IDS.includes(s.id))
    .sort((a, b) => b.stuck - a.stuck || b.count - a.count)[0] || null;

  return {
    thresholds: { stuckActiveDays: STUCK_ACTIVE_DAYS, stuckApprovalDays: STUCK_APPROVAL_DAYS, listLimit: STUCK_LIST_LIMIT },
    cohort: {
      total: cohortTotal,
      stages: cohortStages.stages,
      sideStages: cohortStages.sideStages,
      closed: closedCohort,
      closeRate: cohortTotal > 0 ? (closedCohort / cohortTotal) * 100 : 0,
    },
    live: {
      total: liveTotal,
      stages: liveStages.stages,
      sideStages: liveStages.sideStages,
      active: liveActive,
      stuckTotal: liveStuckTotal,
      stuckRevenue: Math.round(liveStuckRevenue * 100) / 100,
      bottleneck,
    },
    stuckByStage,
    transitions,
    invoices: cohort.invoices?.[0]
      ? {
        needInvoice: cohort.invoices[0].needInvoice || 0,
        pending: cohort.invoices[0].invoicePending || 0,
        rejected: cohort.invoices[0].invoiceRejected || 0,
      }
      : { needInvoice: 0, pending: 0, rejected: 0 },
  };
}

module.exports = {
  loadProcessAnalytics,
  STAGES,
  ACTIVE_STAGE_IDS,
  STUCK_APPROVAL_DAYS,
  STUCK_ACTIVE_DAYS,
};
