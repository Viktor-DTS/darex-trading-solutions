import {
  filterProcurementAllowedWarehouses,
  isProcurementHiddenWarehouse,
} from './procurementWarehouseFilter';

export function isNationalServiceRegion(region) {
  const r = String(region || '').trim().toLowerCase();
  return !r || r === 'україна' || r === 'ukraine';
}

function normalizeRegion(value) {
  return String(value || '').trim().toLowerCase();
}

/** Цільові склади сервісу: регіон користувача = регіон складу; «Україна» — усі дозволені склади закупівель */
export function filterTargetWarehousesForServiceUser(warehouses = [], userRegion = '') {
  const allowed = filterProcurementAllowedWarehouses(warehouses);
  if (isNationalServiceRegion(userRegion)) return allowed;
  const regionNorm = normalizeRegion(userRegion);
  return allowed.filter((w) => normalizeRegion(w.region) === regionNorm);
}

export function buildServiceWarehouseSelectOptions(warehouses = [], userRegion = '') {
  return filterTargetWarehousesForServiceUser(warehouses, userRegion).map((w) => ({
    value: String(w._id || w.name || ''),
    label: String(w.name || w._id || ''),
    region: w.region || '',
    warehouseId: String(w._id || ''),
    warehouseName: String(w.name || ''),
  }));
}

export { isProcurementHiddenWarehouse };
