/**
 * Аналітика бухгалтерії та фінансів.
 *
 * Тут вперше зводиться реальна юніт-економіка заявки: раніше аналітика знала лише
 * «дохід» і «матеріали», а транспорт, добові, проживання, інші витрати й премія
 * інженерам не враховувались взагалі — тому маржа не рахувалась ніде.
 */
const mongoose = require('mongoose');
const { MONTH_NAMES } = require('./context');
const { buildBaseStages, buildLiveStages } = require('./taskQuery');
const { buildParseNumericFieldExpr, buildDaysBetweenExpr } = require('../taskAggregationExpr');

const round = (expr, d = 2) => ({ $round: [{ $ifNull: [expr, 0] }, d] });
const roundOrNull = (expr, d = 1) => ({ $cond: [{ $eq: [expr, null] }, null, { $round: [expr, d] }] });

/** Структура собівартості: кожен рядок — окреме поле заявки. */
const COST_STRUCTURE = [
  { id: 'oilTotal', label: 'Олива', group: 'materials' },
  { id: 'filterSum', label: 'Фільтри масляні', group: 'materials' },
  { id: 'fuelFilterSum', label: 'Фільтри паливні', group: 'materials' },
  { id: 'airFilterSum', label: 'Фільтри повітряні', group: 'materials' },
  { id: 'antifreezeSum', label: 'Антифриз', group: 'materials' },
  { id: 'otherSum', label: 'Інші матеріали', group: 'materials' },
  { id: 'transportSum', label: 'Транспорт', group: 'expenses' },
  { id: 'perDiem', label: 'Добові', group: 'expenses' },
  { id: 'living', label: 'Проживання', group: 'expenses' },
  { id: 'otherExp', label: 'Інші витрати', group: 'expenses' },
  { id: 'serviceBonus', label: 'Премія інженерам', group: 'expenses' },
];

const AGING_BUCKETS = [
  { id: 'd0_30', label: 'до 30 дн', from: 0, to: 30 },
  { id: 'd31_60', label: '31–60 дн', from: 30, to: 60 },
  { id: 'd61_90', label: '61–90 дн', from: 60, to: 90 },
  { id: 'd90_plus', label: 'понад 90 дн', from: 90, to: null },
];

function buildCostStructureFacet() {
  const group = { _id: null, revenue: { $sum: '$_revenue' } };
  for (const item of COST_STRUCTURE) {
    group[item.id] = { $sum: buildParseNumericFieldExpr(`$${item.id}`) };
  }
  return [{ $match: { _done: true } }, { $group: group }];
}

function buildApprovalSlaFacet() {
  return [{
    $match: { _done: true },
  }, {
    $group: {
      _id: null,
      warehouseAvg: { $avg: '$_whWaitDays' },
      warehouseMax: { $max: '$_whWaitDays' },
      warehouseN: { $sum: { $cond: [{ $ne: ['$_whWaitDays', null] }, 1, 0] } },
      warehouseOverSla: { $sum: { $cond: [{ $gt: ['$_whWaitDays', 7] }, 1, 0] } },
      accountantAvg: { $avg: '$_acWaitDays' },
      accountantMax: { $max: '$_acWaitDays' },
      accountantN: { $sum: { $cond: [{ $ne: ['$_acWaitDays', null] }, 1, 0] } },
      accountantOverSla: { $sum: { $cond: [{ $gt: ['$_acWaitDays', 7] }, 1, 0] } },
      regionalApproved: { $sum: { $cond: ['$_rmOk', 1, 0] } },
      cashAvg: { $avg: '$_cashDays' },
      cashN: { $sum: { $cond: [{ $ne: ['$_cashDays', null] }, 1, 0] } },
    },
  }];
}

function buildCashflowFacet() {
  return [
    { $match: { _done: true } },
    {
      $group: {
        _id: { $month: '$_basisDate' },
        revenue: { $sum: '$_revenue' },
        paid: { $sum: { $cond: [{ $ne: ['$_paidAt', null] }, '$_revenue', 0] } },
        unpaid: { $sum: { $cond: [{ $eq: ['$_paidAt', null] }, '$_revenue', 0] } },
        materials: { $sum: '$_materials' },
        expenses: { $sum: '$_expenses' },
        margin: { $sum: '$_margin' },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

/** Дебіторка — стан на сьогодні, тому без фільтра періоду. */
async function loadReceivables(ctx, { light = false } = {}) {
  const Task = mongoose.model('Task');
  const oldestFacet = light ? {} : {
    oldest: [
      { $sort: { _ageDays: -1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          number: { $ifNull: ['$requestNumber', { $toString: '$_id' }] },
          client: '$_clientLabel',
          region: '$_regionLabel',
          amount: round('$_revenue'),
          days: roundOrNull('$_ageDays'),
          paymentType: '$_paymentLabel',
          approved: { $and: ['$_whOk', '$_acOk'] },
        },
      },
    ],
  };
  const rows = await Task.aggregate([
    ...buildLiveStages(ctx, { status: 'Виконано' }),
    { $match: { _done: true, _paidAt: null, _revenue: { $gt: 0 } } },
    { $addFields: { _ageDays: buildDaysBetweenExpr('$_completed', '$$NOW') } },
    {
      $facet: {
        buckets: [
          {
            $bucket: {
              groupBy: { $ifNull: ['$_ageDays', 0] },
              boundaries: [0, 31, 61, 91, 100000],
              default: 'unknown',
              output: { count: { $sum: 1 }, amount: { $sum: '$_revenue' } },
            },
          },
        ],
        totals: [{
          $group: {
            _id: null,
            count: { $sum: 1 },
            amount: { $sum: '$_revenue' },
            avgAgeDays: { $avg: '$_ageDays' },
            maxAgeDays: { $max: '$_ageDays' },
            approvedAmount: { $sum: { $cond: [{ $and: ['$_whOk', '$_acOk'] }, '$_revenue', 0] } },
          },
        }],
        topDebtors: [
          {
            $group: {
              _id: '$_clientLabel',
              amount: { $sum: '$_revenue' },
              tasks: { $sum: 1 },
              oldestDays: { $max: '$_ageDays' },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: light ? 8 : 15 },
          {
            $project: {
              _id: 0,
              name: '$_id',
              amount: round('$amount'),
              tasks: 1,
              oldestDays: roundOrNull('$oldestDays'),
            },
          },
        ],
        ...oldestFacet,
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] || {};
  const bucketRows = facet.buckets || [];
  const buckets = AGING_BUCKETS.map((def, idx) => {
    const boundary = [0, 31, 61, 91][idx];
    const r = bucketRows.find((b) => b._id === boundary) || {};
    return {
      ...def,
      count: r.count || 0,
      amount: Math.round((r.amount || 0) * 100) / 100,
    };
  });
  const totals = facet.totals?.[0] || {};

  return {
    buckets,
    total: {
      count: totals.count || 0,
      amount: Math.round((totals.amount || 0) * 100) / 100,
      approvedAmount: Math.round((totals.approvedAmount || 0) * 100) / 100,
      avgAgeDays: totals.avgAgeDays != null ? Math.round(totals.avgAgeDays * 10) / 10 : null,
      maxAgeDays: totals.maxAgeDays != null ? Math.round(totals.maxAgeDays * 10) / 10 : null,
    },
    topDebtors: facet.topDebtors || [],
    oldest: facet.oldest || [],
  };
}

/** Заявки на рахунки — окрема колекція, свій життєвий цикл. */
async function loadInvoiceRequests(ctx) {
  const InvoiceRequest = mongoose.model('InvoiceRequest');
  const rows = await InvoiceRequest.aggregate([
    {
      $addFields: {
        _created: { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
        _uploaded: {
          $ifNull: [
            { $convert: { input: '$invoiceUploadDate', to: 'date', onError: null, onNull: null } },
            { $convert: { input: '$updatedAt', to: 'date', onError: null, onNull: null } },
          ],
        },
      },
    },
    {
      $addFields: {
        _turnaroundDays: {
          $cond: [
            { $in: ['$status', ['completed', 'rejected']] },
            buildDaysBetweenExpr('$_created', '$_uploaded'),
            null,
          ],
        },
        _openAgeDays: {
          $cond: [
            { $in: ['$status', ['pending', 'processing']] },
            buildDaysBetweenExpr('$_created', '$$NOW'),
            null,
          ],
        },
      },
    },
    {
      $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
        ],
        totals: [{
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
            needInvoice: { $sum: { $cond: [{ $eq: ['$needInvoice', true] }, 1, 0] } },
            needAct: { $sum: { $cond: [{ $eq: ['$needAct', true] }, 1, 0] } },
            avgTurnaroundDays: { $avg: '$_turnaroundDays' },
            avgOpenAgeDays: { $avg: '$_openAgeDays' },
            maxOpenAgeDays: { $max: '$_openAgeDays' },
            staleOpen: { $sum: { $cond: [{ $gt: ['$_openAgeDays', 7] }, 1, 0] } },
          },
        }],
        oldestOpen: [
          { $match: { _openAgeDays: { $ne: null } } },
          { $sort: { _openAgeDays: -1 } },
          { $limit: 30 },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              number: '$requestNumber',
              requester: '$requesterName',
              status: 1,
              needInvoice: 1,
              needAct: 1,
              days: roundOrNull('$_openAgeDays'),
            },
          },
        ],
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] || {};
  const totals = facet.totals?.[0] || {};
  const statusLabels = {
    pending: 'Очікує', processing: 'В обробці', completed: 'Виконано', rejected: 'Відмова',
  };
  return {
    byStatus: (facet.byStatus || []).map((r) => ({
      ...r,
      label: statusLabels[r.status] || r.status || 'Невідомо',
    })),
    total: totals.total || 0,
    open: totals.open || 0,
    needInvoice: totals.needInvoice || 0,
    needAct: totals.needAct || 0,
    staleOpen: totals.staleOpen || 0,
    avgTurnaroundDays: totals.avgTurnaroundDays != null ? Math.round(totals.avgTurnaroundDays * 10) / 10 : null,
    avgOpenAgeDays: totals.avgOpenAgeDays != null ? Math.round(totals.avgOpenAgeDays * 10) / 10 : null,
    maxOpenAgeDays: totals.maxOpenAgeDays != null ? Math.round(totals.maxOpenAgeDays * 10) / 10 : null,
    oldestOpen: facet.oldestOpen || [],
  };
}

async function loadFinanceAnalytics(ctx, { light = false } = {}) {
  const Task = mongoose.model('Task');

  const [periodRows, receivables, invoices] = await Promise.all([
    Task.aggregate([
      ...buildBaseStages(ctx),
      {
        $facet: {
          costStructure: buildCostStructureFacet(),
          approvalSla: buildApprovalSlaFacet(),
          cashflow: buildCashflowFacet(),
          marginByRegion: [
            { $match: { _done: true } },
            {
              $group: {
                _id: '$_regionLabel',
                revenue: { $sum: '$_revenue' },
                margin: { $sum: '$_margin' },
                materials: { $sum: '$_materials' },
                expenses: { $sum: '$_expenses' },
                tasks: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                name: '$_id',
                tasks: 1,
                revenue: round('$revenue'),
                margin: round('$margin'),
                materials: round('$materials'),
                expenses: round('$expenses'),
                marginRate: {
                  $cond: [{ $gt: ['$revenue', 0] }, round({ $multiply: [{ $divide: ['$margin', '$revenue'] }, 100] }, 1), 0],
                },
              },
            },
            { $sort: { revenue: -1 } },
          ],
          marginByWorkType: [
            { $match: { _done: true } },
            {
              $group: {
                _id: '$_workLabel',
                revenue: { $sum: '$_revenue' },
                margin: { $sum: '$_margin' },
                tasks: { $sum: 1 },
              },
            },
            { $match: { tasks: { $gte: 3 } } },
            {
              $project: {
                _id: 0,
                name: '$_id',
                tasks: 1,
                revenue: round('$revenue'),
                margin: round('$margin'),
                avgTicket: round({ $divide: ['$revenue', '$tasks'] }),
                marginRate: {
                  $cond: [{ $gt: ['$revenue', 0] }, round({ $multiply: [{ $divide: ['$margin', '$revenue'] }, 100] }, 1), 0],
                },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 20 },
          ],
          /**
           * Збиткова заявка — та, де є виручка, але витрати її перекрили.
           * Заявки з нульовою виручкою тут не рахуються: у них не заповнена
           * оплата, і в списку збитків вони давали б фіктивний мінус на всю
           * собівартість. Такі заявки йдуть окремо, як «закрито без суми».
           */
          lossMakers: [
            { $match: { _done: true, _revenue: { $gt: 0 }, _margin: { $lt: 0 } } },
            { $sort: { _margin: 1 } },
            { $limit: 30 },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                number: { $ifNull: ['$requestNumber', { $toString: '$_id' }] },
                client: '$_clientLabel',
                region: '$_regionLabel',
                work: '$_workLabel',
                revenue: round('$_revenue'),
                materials: round('$_materials'),
                expenses: round('$_expenses'),
                margin: round('$_margin'),
              },
            },
          ],
          lossTotals: [
            { $match: { _done: true, _revenue: { $gt: 0 }, _margin: { $lt: 0 } } },
            { $group: { _id: null, tasks: { $sum: 1 }, margin: { $sum: '$_margin' } } },
          ],
          unbilledClosed: [
            { $match: { _done: true, _revenue: { $lte: 0 } } },
            {
              $group: {
                _id: null,
                tasks: { $sum: 1 },
                cost: { $sum: { $add: ['$_materials', '$_expenses'] } },
                withCost: { $sum: { $cond: [{ $gt: [{ $add: ['$_materials', '$_expenses'] }, 0] }, 1, 0] } },
              },
            },
          ],
          unbilledList: [
            { $match: { _done: true, _revenue: { $lte: 0 } } },
            { $addFields: { _cost: { $add: ['$_materials', '$_expenses'] } } },
            { $sort: { _cost: -1 } },
            { $limit: 30 },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                number: { $ifNull: ['$requestNumber', { $toString: '$_id' }] },
                client: '$_clientLabel',
                region: '$_regionLabel',
                work: '$_workLabel',
                materials: round('$_materials'),
                expenses: round('$_expenses'),
                cost: round('$_cost'),
              },
            },
          ],
          debtStatus: [
            {
              $group: {
                _id: {
                  $let: {
                    vars: { v: { $trim: { input: { $toString: { $ifNull: ['$debtStatus', ''] } } } } },
                    in: { $cond: [{ $eq: ['$$v', ''] }, 'Без позначки', '$$v'] },
                  },
                },
                tasks: { $sum: 1 },
                amount: { $sum: '$_revenue' },
              },
            },
            { $project: { _id: 0, name: '$_id', tasks: 1, amount: round('$amount') } },
            { $sort: { tasks: -1 } },
            { $limit: 12 },
          ],
        },
      },
    ]).allowDiskUse(true),
    loadReceivables(ctx, { light }),
    loadInvoiceRequests(ctx),
  ]);

  const facet = periodRows[0] || {};
  const costRaw = facet.costStructure?.[0] || {};
  const revenue = costRaw.revenue || 0;
  const costStructure = COST_STRUCTURE.map((item) => ({
    ...item,
    amount: Math.round((costRaw[item.id] || 0) * 100) / 100,
    share: revenue > 0 ? ((costRaw[item.id] || 0) / revenue) * 100 : 0,
  })).filter((item) => item.amount !== 0);

  const materialsTotal = costStructure.filter((c) => c.group === 'materials').reduce((s, c) => s + c.amount, 0);
  const expensesTotal = costStructure.filter((c) => c.group === 'expenses').reduce((s, c) => s + c.amount, 0);

  const sla = facet.approvalSla?.[0] || {};

  return {
    revenue: Math.round(revenue * 100) / 100,
    costStructure,
    costSummary: {
      materials: Math.round(materialsTotal * 100) / 100,
      expenses: Math.round(expensesTotal * 100) / 100,
      total: Math.round((materialsTotal + expensesTotal) * 100) / 100,
      margin: Math.round((revenue - materialsTotal - expensesTotal) * 100) / 100,
      marginRate: revenue > 0 ? ((revenue - materialsTotal - expensesTotal) / revenue) * 100 : 0,
    },
    approvalSla: {
      warehouse: {
        avgDays: sla.warehouseAvg != null ? Math.round(sla.warehouseAvg * 10) / 10 : null,
        maxDays: sla.warehouseMax != null ? Math.round(sla.warehouseMax * 10) / 10 : null,
        samples: sla.warehouseN || 0,
        overSla: sla.warehouseOverSla || 0,
        slaDays: 7,
      },
      accountant: {
        avgDays: sla.accountantAvg != null ? Math.round(sla.accountantAvg * 10) / 10 : null,
        maxDays: sla.accountantMax != null ? Math.round(sla.accountantMax * 10) / 10 : null,
        samples: sla.accountantN || 0,
        overSla: sla.accountantOverSla || 0,
        slaDays: 7,
      },
      cash: {
        avgDays: sla.cashAvg != null ? Math.round(sla.cashAvg * 10) / 10 : null,
        samples: sla.cashN || 0,
        slaDays: 30,
      },
      regionalApproved: sla.regionalApproved || 0,
    },
    cashflow: (facet.cashflow || []).map((r) => ({
      month: r._id,
      label: MONTH_NAMES[(r._id || 1) - 1]?.slice(0, 3) || '—',
      revenue: Math.round((r.revenue || 0) * 100) / 100,
      paid: Math.round((r.paid || 0) * 100) / 100,
      unpaid: Math.round((r.unpaid || 0) * 100) / 100,
      materials: Math.round((r.materials || 0) * 100) / 100,
      expenses: Math.round((r.expenses || 0) * 100) / 100,
      margin: Math.round((r.margin || 0) * 100) / 100,
    })),
    marginByRegion: facet.marginByRegion || [],
    marginByWorkType: facet.marginByWorkType || [],
    losses: {
      tasks: facet.lossTotals?.[0]?.tasks || 0,
      margin: Math.round((facet.lossTotals?.[0]?.margin || 0) * 100) / 100,
      list: facet.lossMakers || [],
    },
    unbilled: {
      tasks: facet.unbilledClosed?.[0]?.tasks || 0,
      withCost: facet.unbilledClosed?.[0]?.withCost || 0,
      cost: Math.round((facet.unbilledClosed?.[0]?.cost || 0) * 100) / 100,
      list: facet.unbilledList || [],
    },
    debtStatus: facet.debtStatus || [],
    receivables,
    invoices,
  };
}

module.exports = { loadFinanceAnalytics, COST_STRUCTURE, AGING_BUCKETS };
