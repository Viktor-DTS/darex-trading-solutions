/**
 * Аналітика відділу продажів: угоди (Sale), клієнти (Client) та ліди (MarketingLead).
 * Раніше ці дані в аналітику не потрапляли зовсім — панель бачила лише сервісні заявки.
 */
const mongoose = require('mongoose');
const { MONTH_NAMES } = require('./context');
const { escapeRegex } = require('./taskQuery');
const { buildDaysBetweenExpr } = require('../taskAggregationExpr');

const round = (expr, d = 2) => ({ $round: [{ $ifNull: [expr, 0] }, d] });
const roundOrNull = (expr, d = 1) => ({ $cond: [{ $eq: [expr, null] }, null, { $round: [expr, d] }] });

const SALE_STATUS_LABELS = {
  draft: 'Чернетка',
  primary_contact: 'Первинний контакт',
  quote_sent: 'КП надіслано',
  in_negotiation: 'Переговори',
  in_progress: 'В роботі',
  in_realization: 'Реалізація',
  pnr: 'ПНР',
  success: 'Успіх',
  confirmed: 'Підтверджено',
  cancelled: 'Скасовано',
};

/** Порядок етапів воронки продажів для послідовного відображення. */
const SALE_PIPELINE_ORDER = [
  'draft', 'primary_contact', 'quote_sent', 'in_negotiation',
  'in_progress', 'in_realization', 'pnr', 'success', 'confirmed', 'cancelled',
];

const WON_STATUSES = ['success', 'confirmed'];
const LOST_STATUSES = ['cancelled'];

const LEAD_STATUS_LABELS = {
  new: 'Новий',
  in_review: 'На розгляді',
  assigned: 'Призначений',
  transmitted: 'Передано менеджеру',
  in_progress: 'В роботі',
  converted: 'Конвертований',
  rejected: 'Відмова',
  spam: 'Спам',
};

const LEAD_SOURCE_LABELS = {
  manual: 'Вручну', website: 'Сайт', facebook: 'Facebook', instagram: 'Instagram',
  google: 'Google', telegram: 'Telegram', viber: 'Viber', email: 'Email',
  referral: 'Рекомендація', other: 'Інше',
};

async function loadSalesAnalytics(ctx, { light = false } = {}) {
  const Sale = mongoose.model('Sale');
  const Client = mongoose.model('Client');
  const MarketingLead = mongoose.model('MarketingLead');

  const periodMatch = { saleDate: { $gte: ctx.period.from, $lt: ctx.period.to } };
  const prevMatch = { saleDate: { $gte: ctx.period.prevFrom, $lt: ctx.period.prevTo } };
  const regionMatch = ctx.region
    ? { $match: { _clientRegion: { $regex: `^\\s*${escapeRegex(ctx.region)}\\s*$`, $options: 'i' } } }
    : null;

  // Регіон угоди живе на клієнті, тому без $lookup регіональне обмеження неможливе.
  const clientLookup = [
    {
      $lookup: {
        from: Client.collection.name,
        localField: 'clientId',
        foreignField: '_id',
        as: '_client',
      },
    },
    {
      $addFields: {
        _clientDoc: { $arrayElemAt: ['$_client', 0] },
      },
    },
    {
      $addFields: {
        _clientName: {
          $let: {
            vars: { n: { $trim: { input: { $toString: { $ifNull: ['$_clientDoc.name', ''] } } } } },
            in: { $cond: [{ $eq: ['$$n', ''] }, 'Без клієнта', '$$n'] },
          },
        },
        _clientRegion: {
          $let: {
            vars: { r: { $trim: { input: { $toString: { $ifNull: ['$_clientDoc.region', ''] } } } } },
            in: { $cond: [{ $eq: ['$$r', ''] }, 'Не вказано', '$$r'] },
          },
        },
      },
    },
    { $project: { _client: 0, _clientDoc: 0 } },
  ];

  const commonFields = {
    $addFields: {
      _amount: { $ifNull: ['$totalAmount', 0] },
      _won: { $in: ['$status', WON_STATUSES] },
      _lost: { $in: ['$status', LOST_STATUSES] },
      _extraCosts: {
        $add: [
          { $ifNull: ['$transportCosts', 0] },
          { $ifNull: ['$pnrCosts', 0] },
          { $ifNull: ['$representativeCosts', 0] },
          { $ifNull: ['$otherCosts', 0] },
        ],
      },
      _paid: {
        $sum: {
          $map: { input: { $ifNull: ['$payments', []] }, as: 'p', in: { $ifNull: ['$$p.amount', 0] } },
        },
      },
      _premium: { $ifNull: ['$managerPremium', 0] },
      _premiumAccrued: { $ne: [{ $ifNull: ['$premiumAccruedAt', null] }, null] },
      _cycleDays: buildDaysBetweenExpr(
        { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
        { $convert: { input: '$saleDate', to: 'date', onError: null, onNull: null } },
      ),
      _equipmentCount: { $size: { $ifNull: ['$equipmentItems', []] } },
    },
  };

  const salesPipeline = (match) => [
    { $match: match },
    ...clientLookup,
    ...(regionMatch ? [regionMatch] : []),
    commonFields,
  ];

  const kpiFacet = [{
    $group: {
      _id: null,
      deals: { $sum: 1 },
      won: { $sum: { $cond: ['$_won', 1, 0] } },
      lost: { $sum: { $cond: ['$_lost', 1, 0] } },
      amount: { $sum: '$_amount' },
      wonAmount: { $sum: { $cond: ['$_won', '$_amount', 0] } },
      openAmount: {
        $sum: { $cond: [{ $and: [{ $not: ['$_won'] }, { $not: ['$_lost'] }] }, '$_amount', 0] },
      },
      paid: { $sum: '$_paid' },
      extraCosts: { $sum: '$_extraCosts' },
      premium: { $sum: '$_premium' },
      premiumPending: { $sum: { $cond: [{ $and: ['$_won', { $not: ['$_premiumAccrued'] }] }, '$_premium', 0] } },
      premiumAccrued: { $sum: { $cond: ['$_premiumAccrued', '$_premium', 0] } },
      avgCycleDays: { $avg: '$_cycleDays' },
      equipmentUnits: { $sum: '$_equipmentCount' },
    },
  }, {
    $project: {
      _id: 0,
      deals: 1,
      won: 1,
      lost: 1,
      equipmentUnits: 1,
      amount: round('$amount'),
      wonAmount: round('$wonAmount'),
      openAmount: round('$openAmount'),
      paid: round('$paid'),
      extraCosts: round('$extraCosts'),
      premium: round('$premium'),
      premiumPending: round('$premiumPending'),
      premiumAccrued: round('$premiumAccrued'),
      avgCycleDays: roundOrNull('$avgCycleDays'),
    },
  }];

  const [saleRows, prevRows, leadRows, clientRows] = await Promise.all([
    Sale.aggregate([
      ...salesPipeline(periodMatch),
      {
        $facet: {
          kpi: kpiFacet,
          byStatus: [
            { $group: { _id: '$status', deals: { $sum: 1 }, amount: { $sum: '$_amount' } } },
            { $project: { _id: 0, status: '$_id', deals: 1, amount: round('$amount') } },
          ],
          byManager: [
            {
              $group: {
                _id: { $ifNull: ['$managerLogin', '—'] },
                deals: { $sum: 1 },
                won: { $sum: { $cond: ['$_won', 1, 0] } },
                lost: { $sum: { $cond: ['$_lost', 1, 0] } },
                amount: { $sum: '$_amount' },
                wonAmount: { $sum: { $cond: ['$_won', '$_amount', 0] } },
                premium: { $sum: '$_premium' },
                avgCycleDays: { $avg: '$_cycleDays' },
              },
            },
            {
              $project: {
                _id: 0,
                login: '$_id',
                deals: 1,
                won: 1,
                lost: 1,
                amount: round('$amount'),
                wonAmount: round('$wonAmount'),
                premium: round('$premium'),
                avgCycleDays: roundOrNull('$avgCycleDays'),
                winRate: {
                  $cond: [{ $gt: ['$deals', 0] }, round({ $multiply: [{ $divide: ['$won', '$deals'] }, 100] }, 1), 0],
                },
              },
            },
            { $sort: { wonAmount: -1 } },
          ],
          byRegion: [
            {
              $group: {
                _id: '$_clientRegion',
                deals: { $sum: 1 },
                won: { $sum: { $cond: ['$_won', 1, 0] } },
                amount: { $sum: '$_amount' },
                wonAmount: { $sum: { $cond: ['$_won', '$_amount', 0] } },
              },
            },
            { $project: { _id: 0, name: '$_id', deals: 1, won: 1, amount: round('$amount'), wonAmount: round('$wonAmount') } },
            { $sort: { wonAmount: -1 } },
          ],
          monthly: [
            {
              $group: {
                _id: { $month: '$saleDate' },
                deals: { $sum: 1 },
                won: { $sum: { $cond: ['$_won', 1, 0] } },
                amount: { $sum: '$_amount' },
                wonAmount: { $sum: { $cond: ['$_won', '$_amount', 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ],
          topClients: [
            {
              $group: {
                _id: '$_clientName',
                deals: { $sum: 1 },
                amount: { $sum: '$_amount' },
                wonAmount: { $sum: { $cond: ['$_won', '$_amount', 0] } },
              },
            },
            { $sort: { amount: -1 } },
            { $limit: 15 },
            { $project: { _id: 0, name: '$_id', deals: 1, amount: round('$amount'), wonAmount: round('$wonAmount') } },
          ],
          premiumQueue: [
            { $match: { _won: true, _premiumAccrued: false, _premium: { $gt: 0 } } },
            { $sort: { saleDate: 1 } },
            { $limit: 30 },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                number: { $ifNull: ['$saleNumber', { $toString: '$_id' }] },
                client: '$_clientName',
                manager: '$managerLogin',
                amount: round('$_amount'),
                premium: round('$_premium'),
                saleDate: '$saleDate',
              },
            },
          ],
          stalled: [
            {
              $match: {
                status: { $in: ['primary_contact', 'quote_sent', 'in_negotiation'] },
              },
            },
            { $addFields: { _ageDays: buildDaysBetweenExpr({ $convert: { input: '$updatedAt', to: 'date', onError: null, onNull: null } }, '$$NOW') } },
            { $match: { _ageDays: { $gt: 30 } } },
            { $sort: { _ageDays: -1 } },
            { $limit: 30 },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                number: { $ifNull: ['$saleNumber', { $toString: '$_id' }] },
                client: '$_clientName',
                manager: '$managerLogin',
                status: 1,
                amount: round('$_amount'),
                days: roundOrNull('$_ageDays'),
              },
            },
          ],
        },
      },
    ]).allowDiskUse(true),
    light
      ? Promise.resolve([{ kpi: [] }])
      : Sale.aggregate([...salesPipeline(prevMatch), { $facet: { kpi: kpiFacet } }]).allowDiskUse(true),
    MarketingLead.aggregate([
      { $match: { createdAt: { $gte: ctx.period.from, $lt: ctx.period.to } } },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              leads: { $sum: 1 },
              converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $in: ['$status', ['rejected', 'spam']] }, 1, 0] } },
              assigned: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$assignedManagerLogin', null] }, null] }, 1, 0] } },
              unassigned: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$assignedManagerLogin', null] }, null] }, 1, 0] } },
              archived: { $sum: { $cond: [{ $eq: ['$archived', true] }, 1, 0] } },
              avgAssignDays: {
                $avg: buildDaysBetweenExpr(
                  { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
                  { $convert: { input: '$assignedAt', to: 'date', onError: null, onNull: null } },
                ),
              },
            },
          }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } },
            { $sort: { count: -1 } },
          ],
          bySource: [
            {
              $group: {
                _id: '$source',
                count: { $sum: 1 },
                converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
              },
            },
            { $project: { _id: 0, source: '$_id', count: 1, converted: 1 } },
            { $sort: { count: -1 } },
          ],
          byCampaign: [
            {
              $match: {
                $or: [
                  { utmCampaign: { $nin: [null, ''] } },
                  { metaCampaignName: { $nin: [null, ''] } },
                ],
              },
            },
            {
              $group: {
                _id: { $ifNull: ['$metaCampaignName', '$utmCampaign'] },
                count: { $sum: 1 },
                converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
              },
            },
            { $project: { _id: 0, name: '$_id', count: 1, converted: 1 } },
            { $sort: { count: -1 } },
            { $limit: 15 },
          ],
        },
      },
    ]).allowDiskUse(true),
    light
      ? Promise.resolve([{}])
      : Client.aggregate([
        {
          $facet: {
            totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
            newInPeriod: [
              { $match: { createdAt: { $gte: ctx.period.from, $lt: ctx.period.to } } },
              { $count: 'n' },
            ],
            byRegion: [
              {
                $group: {
                  _id: {
                    $let: {
                      vars: { r: { $trim: { input: { $toString: { $ifNull: ['$region', ''] } } } } },
                      in: { $cond: [{ $eq: ['$$r', ''] }, 'Не вказано', '$$r'] },
                    },
                  },
                  clients: { $sum: 1 },
                },
              },
              { $project: { _id: 0, name: '$_id', clients: 1 } },
              { $sort: { clients: -1 } },
            ],
          },
        },
      ]).allowDiskUse(true),
  ]);

  const facet = saleRows[0] || {};
  const kpi = facet.kpi?.[0] || {};
  const prevKpi = prevRows[0]?.kpi?.[0] || {};
  const leadFacet = leadRows[0] || {};
  const leadTotals = leadFacet.totals?.[0] || {};
  const clientFacet = clientRows[0] || {};

  const byStatusMap = new Map((facet.byStatus || []).map((r) => [r.status, r]));
  const pipeline = SALE_PIPELINE_ORDER.map((status) => {
    const r = byStatusMap.get(status) || {};
    return {
      status,
      label: SALE_STATUS_LABELS[status] || status,
      deals: r.deals || 0,
      amount: r.amount || 0,
      isWon: WON_STATUSES.includes(status),
      isLost: LOST_STATUSES.includes(status),
    };
  });

  const deals = kpi.deals || 0;
  const won = kpi.won || 0;

  return {
    kpi: {
      ...kpi,
      deals,
      won,
      winRate: deals > 0 ? (won / deals) * 100 : 0,
      avgDeal: won > 0 ? (kpi.wonAmount || 0) / won : 0,
      collectedRate: (kpi.wonAmount || 0) > 0 ? ((kpi.paid || 0) / kpi.wonAmount) * 100 : 0,
    },
    previous: {
      deals: prevKpi.deals || 0,
      won: prevKpi.won || 0,
      wonAmount: prevKpi.wonAmount || 0,
      amount: prevKpi.amount || 0,
    },
    pipeline,
    byManager: facet.byManager || [],
    byRegion: facet.byRegion || [],
    monthly: MONTH_NAMES.map((label, idx) => {
      const r = (facet.monthly || []).find((m) => m._id === idx + 1) || {};
      return {
        month: idx + 1,
        label: label.slice(0, 3),
        deals: r.deals || 0,
        won: r.won || 0,
        amount: Math.round((r.amount || 0) * 100) / 100,
        wonAmount: Math.round((r.wonAmount || 0) * 100) / 100,
      };
    }),
    topClients: facet.topClients || [],
    premiumQueue: facet.premiumQueue || [],
    stalled: facet.stalled || [],
    leads: {
      total: leadTotals.leads || 0,
      converted: leadTotals.converted || 0,
      rejected: leadTotals.rejected || 0,
      assigned: leadTotals.assigned || 0,
      unassigned: leadTotals.unassigned || 0,
      archived: leadTotals.archived || 0,
      conversionRate: (leadTotals.leads || 0) > 0 ? ((leadTotals.converted || 0) / leadTotals.leads) * 100 : 0,
      avgAssignDays: leadTotals.avgAssignDays != null ? Math.round(leadTotals.avgAssignDays * 10) / 10 : null,
      byStatus: (leadFacet.byStatus || []).map((r) => ({
        ...r,
        label: LEAD_STATUS_LABELS[r.status] || r.status || 'Невідомо',
      })),
      bySource: (leadFacet.bySource || []).map((r) => ({
        ...r,
        label: LEAD_SOURCE_LABELS[r.source] || r.source || 'Невідомо',
        conversionRate: r.count > 0 ? (r.converted / r.count) * 100 : 0,
      })),
      byCampaign: (leadFacet.byCampaign || []).map((r) => ({
        ...r,
        conversionRate: r.count > 0 ? (r.converted / r.count) * 100 : 0,
      })),
    },
    clients: {
      total: clientFacet.totals?.[0]?.total || 0,
      newInPeriod: clientFacet.newInPeriod?.[0]?.n || 0,
      byRegion: clientFacet.byRegion || [],
    },
  };
}

module.exports = { loadSalesAnalytics, SALE_STATUS_LABELS, LEAD_STATUS_LABELS };
