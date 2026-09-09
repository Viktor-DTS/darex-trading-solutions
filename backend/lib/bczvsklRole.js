/**
 * Роль bczvskl: перегляд залишків лише по складах Білої Церкви (Дарекс Енерго + ДТС),
 * без підтверджень і змін у панелі завсклада; замовлення товару — через відділ закупівель.
 */

const BCZVSKL_ROLE = 'bczvskl';

const BCZVSKL_WAREHOUSE_NAMES = [
  'Склад Біла Церква Дарекс Енерго',
  'Склад Біла Церква ДТС',
];

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
  if (/^склад\s+біла\s+церква\s+дарекс\s+енерго$/.test(n)) return true;
  if (/^склад\s+біла\s+церква\s+дтс$/.test(n)) return true;
  return false;
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
  // Панель завсклада для цієї ролі завжди лише перегляд — навіть якщо в матриці випадково стоїть full.
  current.warehouse = 'read';
  out[BCZVSKL_ROLE] = current;
  return out;
}

function warehouseDocMatchesBczvskl(wh) {
  if (!wh) return false;
  if (isBczvsklAllowedWarehouseName(wh.name)) return true;
  return (wh.oneCNames || []).some((n) => isBczvsklAllowedWarehouseName(n));
}

async function loadBczvsklAllowedWarehouses(Warehouse) {
  const all = await Warehouse.find({ isActive: true }).select('_id name oneCNames region').lean();
  return all.filter(warehouseDocMatchesBczvskl);
}

async function loadBczvsklAllowedWarehouseIds(Warehouse) {
  const whs = await loadBczvsklAllowedWarehouses(Warehouse);
  return new Set(whs.map((w) => String(w._id)));
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
  isBczvsklRole,
  normalizeWarehouseName,
  isBczvsklAllowedWarehouseName,
  applyBczvsklAccessDefaults,
  buildBczvsklDefaultAccessRow,
  warehouseDocMatchesBczvskl,
  loadBczvsklAllowedWarehouses,
  loadBczvsklAllowedWarehouseIds,
  isBczvsklAllowedApiWrite,
};
