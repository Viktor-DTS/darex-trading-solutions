/**
 * Аналітика забезпечення: склад (Equipment), закупівлі (ProcurementRequest),
 * ВЕД (VedImportRequest), переміщення між складами та тестування обладнання.
 */
const mongoose = require('mongoose');
const { buildDaysBetweenExpr } = require('../taskAggregationExpr');

const round = (expr, d = 2) => ({ $round: [{ $ifNull: [expr, 0] }, d] });
const roundOrNull = (expr, d = 1) => ({ $cond: [{ $eq: [expr, null] }, null, { $round: [expr, d] }] });

/** Модель може бути не зареєстрована, якщо відповідний модуль маршрутів не підключено. */
function optionalModel(name) {
  try {
    return mongoose.model(name);
  } catch {
    return null;
  }
}

const EQUIPMENT_STATUS_LABELS = {
  in_stock: 'На складі',
  reserved: 'Зарезервовано',
  pending_shipment: 'Очікує відвантаження',
  shipped: 'Відвантажено',
  in_transit: 'В дорозі',
  written_off: 'Списано',
  sold: 'Продано',
  deleted: 'Видалено',
};

const PROCUREMENT_STATUS_LABELS = {
  pending_review: 'На розгляді',
  in_progress: 'В роботі',
  awaiting_warehouse: 'Очікує склад',
  awaiting_documents: 'Очікує документи',
  partially_fulfilled: 'Частково виконано',
  completed: 'Виконано',
  blocked: 'Заблоковано',
};

const PROCUREMENT_PRIORITY_LABELS = {
  '1_workday': '1 робочий день',
  '5_workdays': '5 робочих днів',
  '7_workdays': '7 робочих днів',
  more_than_7_workdays: 'Понад 7 днів',
};

const VED_STATUS_LABELS = {
  pending_review: 'На розгляді',
  in_progress: 'В роботі',
  supplier_selection: 'Підбір постачальника',
  proposals_ready: 'Пропозиції готові',
  supplier_chosen: 'Постачальника обрано',
  rejected: 'Відмова',
  completed: 'Завершено',
};

const TESTING_STATUS_LABELS = {
  none: 'Без тестування',
  requested: 'Заявка на тест',
  in_progress: 'Тестується',
  completed: 'Протестовано',
  failed: 'Не пройшло',
};

async function loadEquipmentAnalytics(ctx, { light = false } = {}) {
  const Equipment = mongoose.model('Equipment');
  const regionMatch = ctx.region ? { region: ctx.region } : {};

  const rows = await Equipment.aggregate([
    { $match: { isDeleted: { $ne: true }, ...regionMatch } },
    {
      $addFields: {
        _qty: { $ifNull: ['$quantity', 1] },
        _unitPrice: { $ifNull: ['$batchPriceWithVAT', 0] },
      },
    },
    { $addFields: { _value: { $multiply: ['$_qty', '$_unitPrice'] } } },
    {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            positions: { $sum: 1 },
            units: { $sum: '$_qty' },
            value: { $sum: '$_value' },
            inStock: { $sum: { $cond: [{ $eq: ['$status', 'in_stock'] }, 1, 0] } },
            reserved: { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, 1, 0] } },
            inTransit: { $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] } },
            valueInStock: { $sum: { $cond: [{ $eq: ['$status', 'in_stock'] }, '$_value', 0] } },
            noPrice: { $sum: { $cond: [{ $lte: ['$_unitPrice', 0] }, 1, 0] } },
          },
        }],
        byStatus: [
          {
            $group: {
              _id: '$status',
              positions: { $sum: 1 },
              units: { $sum: '$_qty' },
              value: { $sum: '$_value' },
            },
          },
          { $project: { _id: 0, status: '$_id', positions: 1, units: round('$units', 2), value: round('$value') } },
          { $sort: { positions: -1 } },
        ],
        byWarehouse: [
          {
            $group: {
              _id: {
                $let: {
                  vars: { w: { $trim: { input: { $toString: { $ifNull: ['$currentWarehouseName', ''] } } } } },
                  in: { $cond: [{ $eq: ['$$w', ''] }, 'Не вказано', '$$w'] },
                },
              },
              positions: { $sum: 1 },
              units: { $sum: '$_qty' },
              value: { $sum: '$_value' },
            },
          },
          { $project: { _id: 0, name: '$_id', positions: 1, units: round('$units', 2), value: round('$value') } },
          { $sort: { value: -1 } },
          { $limit: 20 },
        ],
        byKind: [
          {
            $group: {
              _id: { $ifNull: ['$itemKind', 'equipment'] },
              positions: { $sum: 1 },
              value: { $sum: '$_value' },
            },
          },
          { $project: { _id: 0, kind: '$_id', positions: 1, value: round('$value') } },
        ],
        testing: [
          { $match: { testingStatus: { $nin: [null, 'none'] } } },
          {
            $addFields: {
              _testDays: buildDaysBetweenExpr(
                { $convert: { input: '$testingRequestedAt', to: 'date', onError: null, onNull: null } },
                { $convert: { input: '$testingDate', to: 'date', onError: null, onNull: null } },
              ),
              _openTestDays: {
                $cond: [
                  { $in: ['$testingStatus', ['requested', 'in_progress']] },
                  buildDaysBetweenExpr(
                    { $convert: { input: '$testingRequestedAt', to: 'date', onError: null, onNull: null } },
                    '$$NOW',
                  ),
                  null,
                ],
              },
            },
          },
          {
            $group: {
              _id: '$testingStatus',
              count: { $sum: 1 },
              avgDays: { $avg: '$_testDays' },
              maxOpenDays: { $max: '$_openTestDays' },
            },
          },
          {
            $project: {
              _id: 0,
              status: '$_id',
              count: 1,
              avgDays: roundOrNull('$avgDays'),
              maxOpenDays: roundOrNull('$maxOpenDays'),
            },
          },
        ],
        expiringReservations: [
          {
            $match: {
              status: 'reserved',
              reservationEndDate: { $ne: null },
            },
          },
          {
            $addFields: {
              _daysLeft: buildDaysBetweenExpr(
                '$$NOW',
                { $convert: { input: '$reservationEndDate', to: 'date', onError: null, onNull: null } },
                { allowNegative: true },
              ),
            },
          },
          { $match: { _daysLeft: { $ne: null, $lte: 14 } } },
          { $sort: { _daysLeft: 1 } },
          { $limit: 30 },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              name: { $ifNull: ['$batchName', '$type'] },
              serialNumber: 1,
              warehouse: '$currentWarehouseName',
              client: '$reservationClientName',
              manager: '$reservedByName',
              daysLeft: roundOrNull('$_daysLeft'),
              expired: { $lt: ['$_daysLeft', 0] },
            },
          },
        ],
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    totals: {
      positions: totals.positions || 0,
      units: Math.round((totals.units || 0) * 100) / 100,
      value: Math.round((totals.value || 0) * 100) / 100,
      valueInStock: Math.round((totals.valueInStock || 0) * 100) / 100,
      inStock: totals.inStock || 0,
      reserved: totals.reserved || 0,
      inTransit: totals.inTransit || 0,
      noPrice: totals.noPrice || 0,
    },
    byStatus: (facet.byStatus || []).map((r) => ({
      ...r,
      label: EQUIPMENT_STATUS_LABELS[r.status] || r.status || 'Невідомо',
    })),
    byWarehouse: facet.byWarehouse || [],
    byKind: (facet.byKind || []).map((r) => ({
      ...r,
      label: r.kind === 'parts' ? 'Деталі / комплектуючі' : 'Обладнання',
    })),
    testing: (facet.testing || []).map((r) => ({
      ...r,
      label: TESTING_STATUS_LABELS[r.status] || r.status || 'Невідомо',
    })),
    expiringReservations: facet.expiringReservations || [],
  };
}

async function loadProcurementAnalytics(ctx) {
  const ProcurementRequest = optionalModel('ProcurementRequest');
  if (!ProcurementRequest) return null;

  const rows = await ProcurementRequest.aggregate([
    { $match: { createdAt: { $gte: ctx.period.from, $lt: ctx.period.to } } },
    {
      $addFields: {
        _lines: { $size: { $ifNull: ['$materials', []] } },
        _cycleDays: buildDaysBetweenExpr(
          { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
          { $convert: { input: '$warehouseReceivedAt', to: 'date', onError: null, onNull: null } },
        ),
        _executorDays: buildDaysBetweenExpr(
          { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
          { $convert: { input: '$executorCompletedAt', to: 'date', onError: null, onNull: null } },
        ),
        _openDays: {
          $cond: [
            { $in: ['$status', ['pending_review', 'in_progress', 'awaiting_warehouse', 'awaiting_documents', 'blocked']] },
            buildDaysBetweenExpr(
              { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
              '$$NOW',
            ),
            null,
          ],
        },
      },
    },
    {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            requests: { $sum: 1 },
            lines: { $sum: '$_lines' },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
            partial: { $sum: { $cond: [{ $eq: ['$receiptOutcome', 'partial'] }, 1, 0] } },
            open: { $sum: { $cond: [{ $ne: ['$_openDays', null] }, 1, 0] } },
            avgCycleDays: { $avg: '$_cycleDays' },
            avgExecutorDays: { $avg: '$_executorDays' },
            maxOpenDays: { $max: '$_openDays' },
            staleOpen: { $sum: { $cond: [{ $gt: ['$_openDays', 14] }, 1, 0] } },
          },
        }],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
          { $sort: { count: -1 } },
        ],
        byPriority: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
              avgCycleDays: { $avg: '$_cycleDays' },
            },
          },
          { $project: { _id: 0, priority: '$_id', count: 1, avgCycleDays: roundOrNull('$avgCycleDays') } },
        ],
        byRequester: [
          {
            $group: {
              _id: { $ifNull: ['$requesterName', '$requesterLogin'] },
              count: { $sum: 1 },
              lines: { $sum: '$_lines' },
            },
          },
          { $project: { _id: 0, name: '$_id', count: 1, lines: 1 } },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ],
        oldestOpen: [
          { $match: { _openDays: { $ne: null } } },
          { $sort: { _openDays: -1 } },
          { $limit: 30 },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              number: '$requestNumber',
              status: 1,
              priority: 1,
              requester: { $ifNull: ['$requesterName', '$requesterLogin'] },
              warehouse: { $ifNull: ['$actualWarehouse', '$desiredWarehouse'] },
              lines: '$_lines',
              days: roundOrNull('$_openDays'),
            },
          },
        ],
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    totals: {
      requests: totals.requests || 0,
      lines: totals.lines || 0,
      completed: totals.completed || 0,
      blocked: totals.blocked || 0,
      partial: totals.partial || 0,
      open: totals.open || 0,
      staleOpen: totals.staleOpen || 0,
      completionRate: (totals.requests || 0) > 0 ? ((totals.completed || 0) / totals.requests) * 100 : 0,
      avgCycleDays: totals.avgCycleDays != null ? Math.round(totals.avgCycleDays * 10) / 10 : null,
      avgExecutorDays: totals.avgExecutorDays != null ? Math.round(totals.avgExecutorDays * 10) / 10 : null,
      maxOpenDays: totals.maxOpenDays != null ? Math.round(totals.maxOpenDays * 10) / 10 : null,
    },
    byStatus: (facet.byStatus || []).map((r) => ({
      ...r,
      label: PROCUREMENT_STATUS_LABELS[r.status] || r.status || 'Невідомо',
    })),
    byPriority: (facet.byPriority || []).map((r) => ({
      ...r,
      label: PROCUREMENT_PRIORITY_LABELS[r.priority] || r.priority || 'Невідомо',
    })),
    byRequester: facet.byRequester || [],
    oldestOpen: (facet.oldestOpen || []).map((r) => ({
      ...r,
      statusLabel: PROCUREMENT_STATUS_LABELS[r.status] || r.status,
      priorityLabel: PROCUREMENT_PRIORITY_LABELS[r.priority] || r.priority,
    })),
  };
}

async function loadVedAnalytics(ctx) {
  const VedImportRequest = optionalModel('VedImportRequest');
  if (!VedImportRequest) return null;

  const rows = await VedImportRequest.aggregate([
    { $match: { createdAt: { $gte: ctx.period.from, $lt: ctx.period.to } } },
    {
      $addFields: {
        _proposals: { $size: { $ifNull: ['$proposals', []] } },
        _cycleDays: buildDaysBetweenExpr(
          { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
          { $convert: { input: '$completedAt', to: 'date', onError: null, onNull: null } },
        ),
        _openDays: {
          $cond: [
            { $in: ['$status', ['pending_review', 'in_progress', 'supplier_selection', 'proposals_ready', 'supplier_chosen']] },
            buildDaysBetweenExpr(
              { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
              '$$NOW',
            ),
            null,
          ],
        },
      },
    },
    {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            requests: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            proposals: { $sum: '$_proposals' },
            withoutProposals: { $sum: { $cond: [{ $eq: ['$_proposals', 0] }, 1, 0] } },
            open: { $sum: { $cond: [{ $ne: ['$_openDays', null] }, 1, 0] } },
            avgCycleDays: { $avg: '$_cycleDays' },
            maxOpenDays: { $max: '$_openDays' },
          },
        }],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
          { $sort: { count: -1 } },
        ],
        byEquipmentType: [
          { $group: { _id: '$equipmentType', count: { $sum: 1 }, quantity: { $sum: { $ifNull: ['$quantity', 1] } } } },
          { $project: { _id: 0, name: '$_id', count: 1, quantity: 1 } },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ],
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    totals: {
      requests: totals.requests || 0,
      completed: totals.completed || 0,
      rejected: totals.rejected || 0,
      proposals: totals.proposals || 0,
      withoutProposals: totals.withoutProposals || 0,
      open: totals.open || 0,
      avgProposals: (totals.requests || 0) > 0 ? (totals.proposals || 0) / totals.requests : 0,
      avgCycleDays: totals.avgCycleDays != null ? Math.round(totals.avgCycleDays * 10) / 10 : null,
      maxOpenDays: totals.maxOpenDays != null ? Math.round(totals.maxOpenDays * 10) / 10 : null,
    },
    byStatus: (facet.byStatus || []).map((r) => ({
      ...r,
      label: VED_STATUS_LABELS[r.status] || r.status || 'Невідомо',
    })),
    byEquipmentType: facet.byEquipmentType || [],
  };
}

async function loadTransferAnalytics(ctx) {
  const WarehouseTransferRequest = optionalModel('WarehouseTransferRequest');
  if (!WarehouseTransferRequest) return null;

  const match = { createdAt: { $gte: ctx.period.from, $lt: ctx.period.to } };
  if (ctx.region) match.requesterRegion = ctx.region;

  const rows = await WarehouseTransferRequest.aggregate([
    { $match: match },
    {
      $addFields: {
        _decisionDays: buildDaysBetweenExpr(
          { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
          {
            $ifNull: [
              { $convert: { input: '$sourceApprovedAt', to: 'date', onError: null, onNull: null } },
              { $convert: { input: '$rejectedAt', to: 'date', onError: null, onNull: null } },
            ],
          },
        ),
      },
    },
    {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            requests: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            avgDecisionDays: { $avg: '$_decisionDays' },
          },
        }],
        byRoute: [
          {
            $group: {
              _id: { from: '$fromWarehouseName', to: '$toWarehouseName' },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, from: '$_id.from', to: '$_id.to', count: 1 } },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ],
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    totals: {
      requests: totals.requests || 0,
      approved: totals.approved || 0,
      rejected: totals.rejected || 0,
      pending: totals.pending || 0,
      avgDecisionDays: totals.avgDecisionDays != null ? Math.round(totals.avgDecisionDays * 10) / 10 : null,
    },
    byRoute: facet.byRoute || [],
  };
}

async function loadSupplyAnalytics(ctx, { light = false } = {}) {
  const [equipment, procurement, ved, transfers] = await Promise.all([
    loadEquipmentAnalytics(ctx, { light }),
    loadProcurementAnalytics(ctx, { light }),
    loadVedAnalytics(ctx),
    light ? Promise.resolve(null) : loadTransferAnalytics(ctx),
  ]);
  return { equipment, procurement, ved, transfers };
}

module.exports = {
  loadSupplyAnalytics,
  loadEquipmentAnalytics,
  loadProcurementAnalytics,
  EQUIPMENT_STATUS_LABELS,
  PROCUREMENT_STATUS_LABELS,
};
