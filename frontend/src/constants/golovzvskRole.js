/** Головний завсклад: моніторинг черг усіх регіонів, затвердження лише свого. */
export const GOLOVZVSK_ROLE = 'golovzvsk';

export function isGolovzvskRole(role) {
  return String(role || '').trim().toLowerCase() === GOLOVZVSK_ROLE;
}

export function isRegionalWarehouseStaffRole(role) {
  return ['warehouse', 'zavsklad', GOLOVZVSK_ROLE].includes(String(role || '').trim().toLowerCase());
}

export function isWarehouseInventoryMutatorRole(role) {
  return ['admin', 'administrator', 'warehouse', 'zavsklad', GOLOVZVSK_ROLE].includes(
    String(role || '').trim().toLowerCase()
  );
}
