/**
 * Мапінг назв складів 1С → наші склади (Warehouse + OneCWarehouseAlias).
 * Використовується при імпорті ведомості та збагаченні журналу OneCMovement.
 */

function isNationalWarehouseRegion(regionRaw) {
  return String(regionRaw || '').trim() === 'Україна';
}

async function buildOneCWarehouseLookup(Warehouse, OneCWarehouseAlias) {
  const warehouseMap = new Map();
  const whById = new Map();

  const allWarehouses = await Warehouse.find({}).select('name region oneCNames').lean();
  for (const w of allWarehouses) {
    whById.set(String(w._id), w);
    const entry = { id: String(w._id), name: w.name, region: String(w.region || '').trim() };
    for (const nm of w.oneCNames || []) {
      if (nm) warehouseMap.set(nm, entry);
    }
  }

  const mappedAliases = await OneCWarehouseAlias.find({
    action: 'map',
    mappedWarehouseId: { $ne: null },
  })
    .select('oneCName mappedWarehouseId')
    .lean();

  for (const a of mappedAliases) {
    const w = whById.get(String(a.mappedWarehouseId));
    if (w) {
      warehouseMap.set(a.oneCName, {
        id: String(w._id),
        name: w.name,
        region: String(w.region || '').trim(),
      });
    }
  }

  const resolve = (name) => {
    const key = String(name || '').trim();
    return key ? warehouseMap.get(key) || null : null;
  };

  return { warehouseMap, whById, resolve };
}

function regionFromMovement(m, lookup) {
  const { resolve, whById } = lookup;
  const byId = m.warehouseId ? whById.get(String(m.warehouseId)) : null;
  const byName = resolve(m.warehouse1c);
  const wh = byId || byName;
  return {
    warehouseRegion: wh?.region || '',
    fromWarehouseRegion: resolve(m.fromWarehouse1c)?.region || '',
    toWarehouseRegion: resolve(m.toWarehouse1c)?.region || '',
  };
}

function enrichOneCMovementsWithRegions(items, lookup) {
  return items.map((m) => ({
    ...m,
    ...regionFromMovement(m, lookup),
  }));
}

/** Назви складів 1С, прив'язані до дозволених складів DTS. */
function collectOneCNamesForWarehouseIds(lookup, allowedIds) {
  const names = new Set();
  for (const [oneCName, entry] of lookup.warehouseMap) {
    if (allowedIds.has(entry.id)) names.add(oneCName);
  }
  return [...names];
}

/** MongoDB-фільтр рухів лише по складах регіону (warehouseId або warehouse1c). */
function buildRegionalMovementMongoFilter(allowedIds, allowedOneCNames, mongoose) {
  const or = [];
  const oids = [...allowedIds]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (oids.length) or.push({ warehouseId: { $in: oids } });
  if (allowedOneCNames.length) or.push({ warehouse1c: { $in: allowedOneCNames } });
  if (!or.length) return { _id: { $in: [] } };
  return or.length === 1 ? or[0] : { $or: or };
}

function mergeMongoFilters(base, extra) {
  if (!extra) return base;
  if (!base || !Object.keys(base).length) return extra;
  return { $and: [base, extra] };
}

module.exports = {
  isNationalWarehouseRegion,
  buildOneCWarehouseLookup,
  enrichOneCMovementsWithRegions,
  regionFromMovement,
  collectOneCNamesForWarehouseIds,
  buildRegionalMovementMongoFilter,
  mergeMongoFilters,
};
