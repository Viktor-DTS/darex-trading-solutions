/**
 * Підтвердження прийому переміщень з 1С на складі-отримувачі.
 * Запам'ятовує підтвердження на OneCMovement, щоб повторний імпорт не показував знову.
 */

const { buildOneCWarehouseLookup, isNationalWarehouseRegion, collectOneCNamesForWarehouseIds } = require('./onecWarehouseMap');

function moveGroupKey(row) {
  const from = row.fromWarehouse1c || '';
  const to = row.toWarehouse1c || '';
  const t = row.docDate ? new Date(row.docDate).getTime() : 0;
  return `${row.docNumber}|${t}|${row.nomenclature}|${row.qty}|${from}|${to}|${row.serial || ''}`;
}

function parseMoveGroupKey(key) {
  const parts = String(key || '').split('|');
  if (parts.length < 7) return null;
  const [docNumber, t, nomenclature, qtyStr, from, to, serial] = parts;
  const docDate = t ? new Date(Number(t)) : null;
  if (!docNumber || !docDate || Number.isNaN(docDate.getTime())) return null;
  const qty = Number(qtyStr);
  return {
    docNumber,
    docDate,
    nomenclature,
    qty: Number.isFinite(qty) ? qty : 0,
    fromWarehouse1c: from,
    toWarehouse1c: to,
    serial: serial || null,
  };
}

function groupMoveRows(rows) {
  const groups = new Map();
  const order = [];
  for (const row of rows) {
    const key = moveGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, { out: null, in: null, rows: [] });
      order.push(key);
    }
    const g = groups.get(key);
    g.rows.push(row);
    if (row.direction === 'out') g.out = row;
    else if (row.direction === 'in') g.in = row;
  }
  return order.map((key) => ({ key, ...groups.get(key) }));
}

function resolveMoveRegions(anchor, group, lookup) {
  const fromName = anchor.fromWarehouse1c || group.out?.warehouse1c || '';
  const toName = anchor.toWarehouse1c || group.in?.warehouse1c || '';
  const fromResolved = lookup.resolve(fromName);
  const toResolved = lookup.resolve(toName);
  return {
    fromName,
    toName,
    fromRegion: fromResolved?.region || '',
    toRegion: toResolved?.region || '',
    fromResolved,
    toResolved,
  };
}

/** Підтвердження потрібне лише для переміщень між різними регіональними складами. */
function isCrossRegionalMove(anchor, group, lookup) {
  const { fromRegion, toRegion } = resolveMoveRegions(anchor, group, lookup);
  if (!fromRegion || !toRegion) return false;
  return fromRegion !== toRegion;
}

function resolveDestinationWarehouseId(row, lookup) {
  const toName = row.toWarehouse1c || (row.direction === 'in' ? row.warehouse1c : '') || '';
  const resolved = lookup.resolve(toName);
  if (resolved) return resolved.id;
  if (row.direction === 'in' && row.warehouseId) return String(row.warehouseId);
  return null;
}

function parseReceivedQuantity(raw, expectedQty) {
  if (raw === undefined || raw === null || raw === '') {
    return expectedQty;
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (v < 0) return null;
  return v;
}

async function notifySourceWarehousePartialMoveReceipt(helpers, fromRegion, info) {
  const { User, createManagerNotificationDeduped, escapeRegExpForRegion } = helpers;
  if (!fromRegion || !User || !createManagerNotificationDeduped || !escapeRegExpForRegion) return;
  try {
    const pattern = new RegExp(escapeRegExpForRegion(String(fromRegion).trim()), 'i');
    const users = await User.find({
      dismissed: { $ne: true },
      role: { $in: ['warehouse', 'zavsklad'] },
      region: pattern,
    })
      .select('login')
      .lean();
    if (!users.length) return;

    const unit = info.unit ? ` ${info.unit}` : '';
    const title = `Частковий прийом переміщення: ${info.docNumber || '—'}`;
    const body =
      `Склад «${info.toWarehouseName || info.toWarehouse1c || '—'}» прийняв не всю кількість по переміщенню 1С ${info.docNumber || '—'}. ` +
      `${info.nomenclature || '—'}: очікувалось ${info.expectedQty}${unit}, фактично ${info.receivedQty}${unit}. ` +
      `Відправлено зі складу «${info.fromWarehouse1c || '—'}». Перевірте відвантаження та доставку.`;

    for (const u of users) {
      const login = u.login && String(u.login).trim();
      if (!login) continue;
      await createManagerNotificationDeduped({
        recipientLogin: login,
        kind: 'onec_move_receipt_partial',
        title,
        body,
        read: false,
        dedupeKey: `onec_move_partial:${info.moveKey}:${login}:${Date.now()}`,
      });
    }
  } catch (e) {
    console.error('[onecMoveReceipt] notifySourceWarehousePartialMoveReceipt:', e.message);
  }
}

async function buildReceiptScope(Warehouse, OneCWarehouseAlias, user, dbUser, helpers) {
  const { loadActiveWarehouseIdsForUserRegion, bypassesRegionalWarehouseInventoryLock, isRegionalWarehouseStaffRole } =
    helpers;
  const lookup = await buildOneCWarehouseLookup(Warehouse, OneCWarehouseAlias);
  let allowedDestIds = null;
  let scopeToRegion = false;

  if (
    isRegionalWarehouseStaffRole(user.role) &&
    !bypassesRegionalWarehouseInventoryLock(user.role) &&
    dbUser &&
    !isNationalWarehouseRegion(dbUser.region)
  ) {
    scopeToRegion = true;
    allowedDestIds = await loadActiveWarehouseIdsForUserRegion(dbUser.region);
  }

  const allowedDestOneCNames = allowedDestIds
    ? collectOneCNamesForWarehouseIds(lookup, allowedDestIds)
    : null;

  return { lookup, allowedDestIds, allowedDestOneCNames, scopeToRegion };
}

function destinationInScope(row, lookup, allowedDestIds, allowedDestOneCNames) {
  if (!allowedDestIds) return true;
  const destId = resolveDestinationWarehouseId(row, lookup);
  if (destId && allowedDestIds.has(destId)) return true;
  const toName = row.toWarehouse1c || (row.direction === 'in' ? row.warehouse1c : '') || '';
  if (toName && allowedDestOneCNames && allowedDestOneCNames.includes(toName)) return true;
  return false;
}

async function listPendingMoveReceipts(OneCMovement, scope) {
  const { lookup, allowedDestIds, allowedDestOneCNames } = scope;
  const rows = await OneCMovement.find({
    docType: 'move',
    $or: [{ receiptConfirmedAt: { $exists: false } }, { receiptConfirmedAt: null }],
  })
    .sort({ docDate: -1, _id: -1 })
    .limit(5000)
    .lean();

  const grouped = groupMoveRows(rows.filter((r) => !r.receiptConfirmedAt));
  const pending = [];

  for (const g of grouped) {
    const anchor = g.in || g.out;
    if (!anchor) continue;
    if (!isCrossRegionalMove(anchor, g, lookup)) continue;
    if (!destinationInScope(anchor, lookup, allowedDestIds, allowedDestOneCNames)) continue;

    const regions = resolveMoveRegions(anchor, g, lookup);
    const destResolved = regions.toResolved;
    pending.push({
      moveKey: g.key,
      docNumber: anchor.docNumber,
      docDate: anchor.docDate,
      docTypeName: anchor.docTypeName,
      nomenclature: anchor.nomenclature,
      qty: anchor.qty,
      unit: anchor.unit,
      serial: anchor.serial || null,
      fromWarehouse1c: regions.fromName,
      toWarehouse1c: regions.toName,
      fromWarehouseRegion: regions.fromRegion,
      toWarehouseId: destResolved?.id || null,
      toWarehouseName: destResolved?.name || anchor.toWarehouse1c || '',
      toWarehouseRegion: regions.toRegion,
      responsible: anchor.responsible || '',
      comment: anchor.comment || '',
      movementIds: g.rows.map((r) => String(r._id)),
      hasInOutPair: !!(g.in && g.out),
    });
  }

  pending.sort((a, b) => new Date(b.docDate || 0) - new Date(a.docDate || 0));
  return pending;
}

async function countPendingMoveReceipts(OneCMovement, scope) {
  const list = await listPendingMoveReceipts(OneCMovement, scope);
  return list.length;
}

function buildGroupMongoFilter(parsed) {
  const filter = {
    docType: 'move',
    docNumber: parsed.docNumber,
    docDate: parsed.docDate,
    nomenclature: parsed.nomenclature,
    qty: parsed.qty,
    fromWarehouse1c: parsed.fromWarehouse1c || '',
    toWarehouse1c: parsed.toWarehouse1c || '',
  };
  if (parsed.serial) filter.serial = parsed.serial;
  return filter;
}

async function confirmMoveReceipts(OneCMovement, items, user, scope, helpers) {
  const {
    logInventoryMovement,
    isRegionalWarehouseStaffRole,
    bypassesRegionalWarehouseInventoryLock,
    warehouseIdInRegionalSet,
  } = helpers;
  const { lookup, allowedDestIds } = scope;
  const now = new Date();
  const confirmed = [];
  const errors = [];
  let partialCount = 0;

  for (const item of items) {
    const key = String(item?.moveKey || '').trim();
    if (!key) continue;

    const parsed = parseMoveGroupKey(key);
    if (!parsed) {
      errors.push({ moveKey: key, error: 'Некоректний ключ переміщення' });
      continue;
    }

    const rows = await OneCMovement.find(buildGroupMongoFilter(parsed)).lean();
    if (!rows.length) {
      errors.push({ moveKey: key, error: 'Переміщення не знайдено' });
      continue;
    }
    if (rows.some((r) => r.receiptConfirmedAt)) {
      errors.push({ moveKey: key, error: 'Вже підтверджено раніше' });
      continue;
    }

    const anchor = rows.find((r) => r.direction === 'in') || rows[0];
    const groupShape = {
      out: rows.find((r) => r.direction === 'out') || null,
      in: rows.find((r) => r.direction === 'in') || null,
    };
    if (!isCrossRegionalMove(anchor, groupShape, lookup)) {
      errors.push({ moveKey: key, error: 'Підтвердження не потрібне для переміщень в межах одного регіону' });
      continue;
    }
    if (!destinationInScope(anchor, lookup, allowedDestIds, scope.allowedDestOneCNames)) {
      errors.push({ moveKey: key, error: 'Склад призначення не у вашому регіоні' });
      continue;
    }

    if (
      isRegionalWarehouseStaffRole(user.role) &&
      !bypassesRegionalWarehouseInventoryLock(user.role) &&
      allowedDestIds
    ) {
      const destId = resolveDestinationWarehouseId(anchor, lookup);
      if (destId && !warehouseIdInRegionalSet(destId, allowedDestIds)) {
        errors.push({ moveKey: key, error: 'Немає доступу до складу призначення' });
        continue;
      }
    }

    const expectedQty = anchor.qty != null && Number.isFinite(Number(anchor.qty)) ? Number(anchor.qty) : 0;
    const receivedQty = parseReceivedQuantity(item.receivedQuantity, expectedQty);
    if (receivedQty === null) {
      errors.push({ moveKey: key, error: 'Некоректна фактична кількість' });
      continue;
    }

    const isPartial = receivedQty < expectedQty;
    if (isPartial) partialCount += 1;

    const regions = resolveMoveRegions(anchor, groupShape, lookup);

    await OneCMovement.updateMany(buildGroupMongoFilter(parsed), {
      $set: {
        receiptConfirmedAt: now,
        receiptConfirmedByLogin: user.login,
        receiptConfirmedByName: user.name || user.login,
        receiptReceivedQty: receivedQty,
        receiptPartial: isPartial,
      },
    });

    const logNotes = [
      `1С ${anchor.docNumber}`,
      isPartial ? `частково: ${receivedQty}/${expectedQty}` : null,
      anchor.docTypeName,
      anchor.comment,
    ]
      .filter(Boolean)
      .join(' · ');

    await logInventoryMovement({
      eventType: 'onec_move_receipt_confirmed',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentType: anchor.nomenclature || '',
      serialNumber: anchor.serial || '',
      quantity: receivedQty,
      sourceWarehouseName: anchor.fromWarehouse1c || '',
      destinationWarehouseName: anchor.toWarehouse1c || anchor.warehouse1c || '',
      notes: logNotes,
      occurredAt: now,
    });

    if (isPartial) {
      await notifySourceWarehousePartialMoveReceipt(helpers, regions.fromRegion, {
        moveKey: key,
        docNumber: anchor.docNumber,
        nomenclature: anchor.nomenclature,
        expectedQty,
        receivedQty,
        unit: anchor.unit || '',
        fromWarehouse1c: regions.fromName,
        toWarehouse1c: regions.toName,
        toWarehouseName: regions.toResolved?.name || regions.toName,
      });
    }

    confirmed.push({
      moveKey: key,
      docNumber: anchor.docNumber,
      nomenclature: anchor.nomenclature,
      qty: expectedQty,
      receivedQty,
      partial: isPartial,
    });
  }

  return { confirmed, errors, confirmedCount: confirmed.length, partialCount };
}

module.exports = {
  moveGroupKey,
  parseMoveGroupKey,
  groupMoveRows,
  buildReceiptScope,
  resolveMoveRegions,
  isCrossRegionalMove,
  listPendingMoveReceipts,
  countPendingMoveReceipts,
  confirmMoveReceipts,
};
