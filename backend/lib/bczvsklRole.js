/**
 * Роль bczvskl: перегляд залишків і журналів лише по складах Білої Церкви
 * (Дарекс Енерго + ДТС), без підтверджень у панелі завсклада.
 */

const BCZVSKL_ROLE = 'bczvskl';

const BCZVSKL_WAREHOUSE_NAMES = [
  'Склад Біла Церква Дарекс Енерго',
  'Склад Біла Церква ДТС',
];

/** Назви DTS + типові назви 1С (Белая Церковь / СОЛЮШН). */
const BCZVSKL_WAREHOUSE_RX_SOURCE =
  'біла\\s+церква\\s+(дтс|дарекс)|белая\\s+церковь.*(солюшн|solution|дтс|dts|дарекс|энерго|енерго)';

function isBczvsklRole(role) {
  return String(role || '').trim().toLowerCase() === BCZVSKL_ROLE;
}

function normalizeWarehouseName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const BCZVSKL_WAREHOUSE_NAME_SET = new Set(BCZVSKL_WAREHOUSE_NAMES.map(normalizeWarehouseName));

function isBczvsklAllowedWarehouseName(name) {
  const n = normalizeWarehouseName(name);
  if (!n) return false;
  if (BCZVSKL_WAREHOUSE_NAME_SET.has(n)) return true;
  if (n === 'біла церква дарекс енерго' || n === 'біла церква дтс') return true;
  return new RegExp(BCZVSKL_WAREHOUSE_RX_SOURCE, 'i').test(n);
}

function buildBczvsklDefaultAccessRow() {
  return {
    warehouse: 'read',
    procurement: 'full',
    inventory: 'none',
  };
}

function applyBczvsklAccessDefaults(rules) {
  const out = { ...(rules && typeof rules === 'object' ? rules : {}) };
  const current = out[BCZVSKL_ROLE] && typeof out[BCZVSKL_ROLE] === 'object' ? { ...out[BCZVSKL_ROLE] } : {};
  const hasAny = Object.values(current).some((v) => v === 'full' || v === 'read');
  if (!hasAny) {
    Object.assign(current, buildBczvsklDefaultAccessRow());
  } else {
    if (!current.warehouse || current.warehouse === 'none') current.warehouse = 'read';
    if (!current.procurement || current.procurement === 'none') current.procurement = 'full';
    if (!current.inventory) current.inventory = 'none';
  }
  current.warehouse = 'read';
  out[BCZVSKL_ROLE] = current;
  return out;
}

function warehouseDocMatchesBczvskl(wh) {
  if (!wh) return false;
  if (isBczvsklAllowedWarehouseName(wh.name)) return true;
  return (wh.oneCNames || []).some((n) => isBczvsklAllowedWarehouseName(n));
}

async function loadBczvsklAllowedWarehouses(Warehouse, lookup = null) {
  const all = await Warehouse.find({ isActive: true }).select('_id name oneCNames region').lean();
  const matched = all.filter(warehouseDocMatchesBczvskl);
  if (lookup && lookup.warehouseMap) {
    const extraIds = new Set();
    for (const [oneCName, entry] of lookup.warehouseMap) {
      if (!entry?.id) continue;
      if (isBczvsklAllowedWarehouseName(oneCName) || isBczvsklAllowedWarehouseName(entry.name)) {
        extraIds.add(String(entry.id));
      }
    }
    if (extraIds.size) {
      const have = new Set(matched.map((w) => String(w._id)));
      for (const w of all) {
        if (extraIds.has(String(w._id)) && !have.has(String(w._id))) matched.push(w);
      }
    }
  }
  return matched;
}

async function loadBczvsklAllowedWarehouseIds(Warehouse) {
  const whs = await loadBczvsklAllowedWarehouses(Warehouse);
  return new Set(whs.map((w) => String(w._id)));
}

/**
 * Імена складів DTS + 1С-аліаси, щоб журнали ловили і warehouseId, і warehouse1c / from / to.
 */
async function collectBczvsklWarehouseScope(Warehouse, lookup) {
  const whs = await loadBczvsklAllowedWarehouses(Warehouse, lookup);
  const allowedIds = new Set(whs.map((w) => String(w._id)));
  const names = new Set(BCZVSKL_WAREHOUSE_NAMES);
  for (const w of whs) {
    const n = String(w.name || '').trim();
    if (n) names.add(n);
    for (const nm of w.oneCNames || []) {
      const s = String(nm || '').trim();
      if (s) names.add(s);
    }
  }
  if (lookup && lookup.warehouseMap) {
    for (const [oneCName, entry] of lookup.warehouseMap) {
      if (entry && allowedIds.has(String(entry.id))) {
        const s = String(oneCName || '').trim();
        if (s) names.add(s);
      }
      if (entry && isBczvsklAllowedWarehouseName(entry.name)) {
        const s = String(oneCName || '').trim();
        if (s) names.add(s);
        if (entry.id) allowedIds.add(String(entry.id));
      }
    }
  }
  return { allowedIds, names: [...names].filter(Boolean), warehouses: whs };
}

function mongoBczvsklNameMatch(field) {
  return { [field]: { $regex: BCZVSKL_WAREHOUSE_RX_SOURCE, $options: 'i' } };
}

/** Фільтр OneCMovement: склади Біла Церква ДТС / Дарекс Енерго, включно з переміщеннями з/на них. */
function buildBczvsklOneCMovementFilter(scope, mongoose) {
  const or = [];
  const ids = scope?.allowedIds || new Set();
  const oids = [...ids]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (oids.length) or.push({ warehouseId: { $in: oids } });

  const names = (scope?.names || []).filter(Boolean);
  const nameFields = ['warehouse1c', 'fromWarehouse1c', 'toWarehouse1c'];
  if (names.length) {
    for (const field of nameFields) {
      or.push({ [field]: { $in: names } });
    }
  }
  for (const field of nameFields) {
    or.push(mongoBczvsklNameMatch(field));
  }
  return or.length ? { $or: or } : { _id: { $in: [] } };
}

/** Внутрішній журнал руху — лише події, де фігурують склади Білої Церкви. */
function buildBczvsklInternalLogFilter(scope) {
  const names = (scope?.names || []).filter(Boolean);
  const or = [];
  if (names.length) {
    or.push({ sourceWarehouseName: { $in: names } });
    or.push({ destinationWarehouseName: { $in: names } });
  }
  or.push(mongoBczvsklNameMatch('sourceWarehouseName'));
  or.push(mongoBczvsklNameMatch('destinationWarehouseName'));
  return { $or: or };
}

function isBczvsklAllowedApiWrite(req) {
  const method = String(req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const raw = String(req.originalUrl || req.url || '').split('?')[0];
  const path = raw.replace(/\/+$/, '') || '/';

  if (method === 'POST' && (path === '/api/users/activity' || path === '/api/event-log')) return true;
  if (method === 'POST' && path === '/api/procurement-requests') return true;
  if (method === 'PATCH' && /^\/api\/procurement-requests\/[^/]+\/requester$/.test(path)) return true;
  if (method === 'POST' && /^\/api\/procurement-requests\/[^/]+\/attachments$/.test(path)) return true;
  if (method === 'PATCH' && /^\/api\/manager-notifications\/[^/]+\/read$/.test(path)) return true;
  if (method === 'POST' && path === '/api/manager-notifications/mark-all-read') return true;
  return false;
}

module.exports = {
  BCZVSKL_ROLE,
  BCZVSKL_WAREHOUSE_NAMES,
  BCZVSKL_WAREHOUSE_RX_SOURCE,
  isBczvsklRole,
  normalizeWarehouseName,
  isBczvsklAllowedWarehouseName,
  applyBczvsklAccessDefaults,
  buildBczvsklDefaultAccessRow,
  warehouseDocMatchesBczvskl,
  loadBczvsklAllowedWarehouses,
  loadBczvsklAllowedWarehouseIds,
  collectBczvsklWarehouseScope,
  buildBczvsklOneCMovementFilter,
  buildBczvsklInternalLogFilter,
  isBczvsklAllowedApiWrite,
};
