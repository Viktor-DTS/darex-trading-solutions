/** Склади, приховані у відділі закупівель (ЗІП / особисті) — той самий список для сервісу */
export const PROCUREMENT_HIDDEN_WAREHOUSE_KEYWORDS = [
  'аршулик',
  'громак',
  'запчаст',
  'кушнир',
  'сервис зип',
  'сервіс зип',
  'сядро',
  'шамуратов',
];

export function isProcurementHiddenWarehouse(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  return PROCUREMENT_HIDDEN_WAREHOUSE_KEYWORDS.some((kw) => n.includes(kw));
}

export function filterProcurementAllowedWarehouses(warehouses = []) {
  return (warehouses || []).filter(
    (w) => w.isActive !== false && !isProcurementHiddenWarehouse(w.name),
  );
}

export function buildProcurementAllowedWarehouseNameSet(warehouses = []) {
  return new Set(
    filterProcurementAllowedWarehouses(warehouses)
      .map((w) => String(w.name || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

export function filterStockWarehousesForProcurement(warehouses = [], allowedNameSet) {
  if (!allowedNameSet || allowedNameSet.size === 0) return warehouses || [];
  return (warehouses || []).filter((w) =>
    allowedNameSet.has(String(w.warehouseName || '').trim().toLowerCase()),
  );
}
