/** Роль перегляду залишків Біла Церква + замовлення в відділі закупівель. */
export const BCZVSKL_ROLE = 'bczvskl';

export const BCZVSKL_WAREHOUSE_NAMES = [
  'Склад Біла Церква Дарекс Енерго',
  'Склад Біла Церква ДТС',
];

export function isBczvsklRole(role) {
  return String(role || '').trim().toLowerCase() === BCZVSKL_ROLE;
}

export function buildBczvsklDefaultAccessRow() {
  return {
    warehouse: 'read',
    procurement: 'full',
    inventory: 'none',
  };
}

export function applyBczvsklAccessDefaults(rules) {
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
