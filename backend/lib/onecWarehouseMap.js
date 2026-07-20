/**
 * Мапінг назв складів 1С → наші склади (Warehouse + OneCWarehouseAlias).
 * Використовується при імпорті ведомості та збагаченні журналу OneCMovement.
 */

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

module.exports = {
  buildOneCWarehouseLookup,
  enrichOneCMovementsWithRegions,
  regionFromMovement,
};
