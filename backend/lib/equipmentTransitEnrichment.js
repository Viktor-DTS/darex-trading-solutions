/**
 * Статус «в дорозі» для обладнання: внутрішні переміщення + очікувані прийоми 1С (до підтвердження завскладом).
 */

const { buildOneCWarehouseLookup } = require('./onecWarehouseMap');
const { listPendingMoveReceipts, parseMoveGroupKey } = require('./onecMoveReceipt');

function normalizeNome(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeSerial(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s || s === 'не визначено' || s === '—') return '';
  return s;
}

function warehouseNamesMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function equipmentAtWarehouse(item, move) {
  const whId = item.currentWarehouse ? String(item.currentWarehouse) : '';
  const fromId = move.fromWarehouseId ? String(move.fromWarehouseId) : '';
  const toId = move.toWarehouseId ? String(move.toWarehouseId) : '';
  if (fromId && whId === fromId) return true;
  if (toId && whId === toId) return true;
  const whName = item.currentWarehouseName || '';
  if (warehouseNamesMatch(whName, move.fromWarehouseName || move.fromWarehouse1c)) return true;
  if (warehouseNamesMatch(whName, move.toWarehouseName || move.toWarehouse1c)) return true;
  return false;
}

function equipmentMatchesPendingMove(item, move) {
  if (!item || !move || move.isConfirmed) return false;
  if (normalizeNome(item.type) !== normalizeNome(move.nomenclature)) return false;

  const moveSerial = normalizeSerial(move.serial);
  const itemSerial = normalizeSerial(item.serialNumber);
  if (moveSerial) {
    if (itemSerial !== moveSerial) return false;
  }

  return equipmentAtWarehouse(item, move);
}

async function loadPendingCrossRegionalMoves(OneCMovement, Warehouse, OneCWarehouseAlias) {
  const lookup = await buildOneCWarehouseLookup(Warehouse, OneCWarehouseAlias);
  const scope = {
    lookup,
    allowedDestIds: null,
    allowedDestOneCNames: null,
    scopeToRegion: false,
  };
  const items = await listPendingMoveReceipts(OneCMovement, scope, { includeHistory: false });
  return items.filter((m) => !m.isConfirmed);
}

function applyTransitFieldsToItem(item, fromName, toName) {
  item.transitFromWarehouseName = fromName || '';
  item.transitToWarehouseName = toName || item.currentWarehouseName || '';
  item.status = item.status === 'reserved' ? 'reserved' : 'in_transit';
  if (item.status === 'reserved') {
    item.warehouseDisplayStatus = 'in_transit';
  }
}

function transitFromMovementHistory(item) {
  const history = Array.isArray(item.movementHistory) ? item.movementHistory : [];
  if (!history.length) return null;
  const last = history[history.length - 1];
  const fromName = last.fromWarehouseName || last.fromWarehouse || '';
  const toName = last.toWarehouseName || last.toWarehouse || item.currentWarehouseName || '';
  if (!fromName || !toName) return null;
  return { fromName, toName };
}

/**
 * Збагачує рядки таблиці залишків (лише відповідь API, без запису в БД).
 */
async function enrichEquipmentListTransitStatus(items, deps) {
  const { OneCMovement, Warehouse, OneCWarehouseAlias, Equipment } = deps;
  if (!Array.isArray(items) || !items.length) return items;

  let pendingMoves = [];
  try {
    pendingMoves = await loadPendingCrossRegionalMoves(OneCMovement, Warehouse, OneCWarehouseAlias);
  } catch (e) {
    console.error('[equipmentTransitEnrichment] pending moves:', e.message);
  }

  const inTransitIds = items
    .filter((i) => i.status === 'in_transit' && !i.transitFromWarehouseName)
    .map((i) => i._id)
    .filter(Boolean);

  const historyById = new Map();
  if (Equipment && inTransitIds.length) {
    const rows = await Equipment.find({ _id: { $in: inTransitIds } })
      .select('movementHistory')
      .lean();
    for (const row of rows) {
      historyById.set(String(row._id), row.movementHistory || []);
    }
  }

  for (const item of items) {
    const pending = pendingMoves.find((m) => equipmentMatchesPendingMove(item, m));
    if (pending) {
      applyTransitFieldsToItem(
        item,
        pending.fromWarehouseName || pending.fromWarehouse1c,
        pending.toWarehouseName || pending.toWarehouse1c
      );
      continue;
    }

    if (item.status === 'in_transit') {
      const hist = historyById.get(String(item._id));
      const transit = transitFromMovementHistory({ ...item, movementHistory: hist });
      if (transit) {
        item.transitFromWarehouseName = transit.fromName;
        item.transitToWarehouseName = transit.toName;
      }
    }
  }

  return items;
}

/**
 * Після підтвердження прийому 1С — повертаємо «На складі» для позицій на складі одержувача.
 */
async function markEquipmentInStockAfterOneCMoveConfirm(confirmedMoves, deps) {
  const { Equipment, OneCMovement, Warehouse, OneCWarehouseAlias } = deps;
  if (!Equipment || !Array.isArray(confirmedMoves) || !confirmedMoves.length) return { updated: 0 };

  let lookup = null;
  if (OneCMovement && Warehouse && OneCWarehouseAlias) {
    lookup = await buildOneCWarehouseLookup(Warehouse, OneCWarehouseAlias);
  }

  let updated = 0;
  for (const move of confirmedMoves) {
    let nome = move.nomenclature;
    let serial = normalizeSerial(move.serial);
    let toWarehouseName = move.toWarehouseName || move.toWarehouse1c || '';

    if ((!nome || !toWarehouseName) && move.moveKey && OneCMovement) {
      const parsed = parseMoveGroupKey(move.moveKey);
      if (parsed) {
        nome = nome || parsed.nomenclature;
        serial = serial || normalizeSerial(parsed.serial);
        toWarehouseName = toWarehouseName || parsed.toWarehouse1c || '';
        if (lookup && parsed.toWarehouse1c) {
          const resolved = lookup.resolve(parsed.toWarehouse1c);
          if (resolved?.name) toWarehouseName = resolved.name;
        }
      }
    }

    if (!nome) continue;
    const query = {
      type: nome,
      isDeleted: { $ne: true },
    };
    if (serial) {
      query.serialNumber = new RegExp(`^${serial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }
    const candidates = await Equipment.find(query).lean();
    for (const eq of candidates) {
      const atDestination =
        !toWarehouseName ||
        warehouseNamesMatch(eq.currentWarehouseName, toWarehouseName);
      if (!atDestination && serial) continue;
      if (!atDestination && !serial) continue;
      await Equipment.updateOne(
        { _id: eq._id },
        {
          $set: {
            status: eq.status === 'reserved' ? 'reserved' : 'in_stock',
            lastModified: new Date(),
          },
        }
      );
      updated += 1;
    }
  }
  return { updated };
}

/**
 * Після імпорту 1С — позначити позиції з непідтвердженим міжрегіональним переміщенням як in_transit.
 */
async function syncEquipmentTransitFromPendingOneCMoves(deps) {
  const { Equipment, OneCMovement, Warehouse, OneCWarehouseAlias } = deps;
  const pendingMoves = await loadPendingCrossRegionalMoves(OneCMovement, Warehouse, OneCWarehouseAlias);
  let updated = 0;

  for (const move of pendingMoves) {
    const query = {
      type: move.nomenclature,
      isDeleted: { $ne: true },
      status: { $nin: ['deleted', 'written_off', 'shipped', 'sold'] },
    };
    const serial = normalizeSerial(move.serial);
    if (serial) {
      query.serialNumber = new RegExp(`^${serial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }

    const items = await Equipment.find(query).lean();
    for (const item of items) {
      if (!equipmentMatchesPendingMove(item, move)) continue;
      if (item.status === 'in_transit') continue;

      const fromName = move.fromWarehouseName || move.fromWarehouse1c || '';
      const toName = move.toWarehouseName || move.toWarehouse1c || item.currentWarehouseName || '';
      const update = {
        status: item.status === 'reserved' ? 'reserved' : 'in_transit',
        lastModified: new Date(),
      };
      if (move.toWarehouseId) {
        update.currentWarehouse = move.toWarehouseId;
      }
      if (toName) update.currentWarehouseName = toName;

      await Equipment.updateOne({ _id: item._id }, { $set: update });
      if (fromName && toName) {
        await Equipment.updateOne(
          { _id: item._id },
          {
            $push: {
              movementHistory: {
                fromWarehouse: move.fromWarehouseId || null,
                fromWarehouseName: fromName,
                toWarehouse: move.toWarehouseId || item.currentWarehouse,
                toWarehouseName: toName,
                date: move.docDate || new Date(),
                movedBy: '1С',
                movedByName: 'Переміщення 1С (очікує підтвердження)',
                notes: `Документ ${move.docNumber || '—'}`,
              },
            },
          }
        );
      }
      updated += 1;
    }
  }

  return { updated, pendingCount: pendingMoves.length };
}

module.exports = {
  enrichEquipmentListTransitStatus,
  markEquipmentInStockAfterOneCMoveConfirm,
  syncEquipmentTransitFromPendingOneCMoves,
  equipmentMatchesPendingMove,
};
