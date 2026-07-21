import regionBasesFallback from '../../data/regionServiceBases.json';
import { formatSpecItemDisplayName, getSpecItemPrice } from './estimateSpecRegistry';
import { resolveRegionBaseAddress as resolveFromWarehouses } from './regionBaseAddress';

export function parseNumber(value) {
  if (value == null || value === '') return 0;
  const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function getRegionBaseAddress(serviceRegion, warehouses = []) {
  if (warehouses?.length) {
    return resolveFromWarehouses(serviceRegion, warehouses);
  }
  const key = String(serviceRegion || '').trim();
  return regionBasesFallback[key] || regionBasesFallback['Україна'] || '';
}

export function buildDefaultTransportLabel(task, warehouses = []) {
  const address = String(task.address || '').trim();
  const base = getRegionBaseAddress(task.serviceRegion, warehouses);
  return buildTransportLabelFromAddresses(address, base);
}

export function buildTransportLabelFromAddresses(destination, origin) {
  const address = String(destination || '').trim();
  const base = String(origin || '').trim();
  if (address && base) return `Транспортні витрати (${address} - ${base})`;
  if (address) return `Транспортні витрати (${address})`;
  return 'Транспортні витрати';
}

export function createEstimateLine({ id, name, quantity = 1, unit = 'послуга', unitPrice = 0, source = 'manual' }) {
  const qty = parseNumber(quantity) || 0;
  const price = parseNumber(unitPrice) || 0;
  return {
    id: id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(name || '').trim(),
    quantity: qty,
    unit: unit || 'послуга',
    unitPrice: price,
    total: roundMoney(qty * price),
    source,
  };
}

export function buildWorkLineFromSpec(category, item, powerTierId) {
  const price = getSpecItemPrice(item, powerTierId);
  if (price == null) return null;
  return createEstimateLine({
    id: item.id,
    name: formatSpecItemDisplayName(category.title, item),
    quantity: 1,
    unit: item.unit || 'послуга',
    unitPrice: price,
    source: 'spec',
    specItemId: item.id,
    categoryId: category.id,
  });
}

export function buildLowerTableLinesFromTask(task, spec, warehouses = []) {
  const lines = [];
  const pushIfPositive = (name, quantity, unit, unitPrice, source) => {
    const qty = parseNumber(quantity);
    const price = parseNumber(unitPrice);
    const total = roundMoney(qty * price);
    if (total <= 0 && !name) return;
    if (total <= 0 && qty <= 0) return;
    lines.push(createEstimateLine({
      name,
      quantity: qty || 1,
      unit,
      unitPrice: qty ? roundMoney(total / qty) : price,
      source,
    }));
  };

  const transportKm = parseNumber(task.transportKm);
  const transportSum = parseNumber(task.transportSum);
  if (transportSum > 0 || transportKm > 0) {
    const unitPrice = transportKm > 0 ? roundMoney(transportSum / transportKm) : parseNumber(spec?.transportRatePerKm || 35);
    lines.push(createEstimateLine({
      id: 'transport',
      name: buildDefaultTransportLabel(task, warehouses),
      quantity: transportKm || 1,
      unit: 'км',
      unitPrice,
      source: 'task-transport',
    }));
  }

  pushIfPositive(task.oilType ? `Олива ${task.oilType}`.trim() : 'Олива', task.oilUsed, 'л', task.oilPrice, 'task-oil');
  pushIfPositive(task.filterName || 'Масляний фільтр', task.filterCount, 'шт', task.filterPrice, 'task-filter');
  pushIfPositive(task.fuelFilterName || 'Паливний фільтр', task.fuelFilterCount, 'шт', task.fuelFilterPrice, 'task-fuel-filter');
  pushIfPositive(task.airFilterName || 'Повітряний фільтр', task.airFilterCount, 'шт', task.airFilterPrice, 'task-air-filter');
  pushIfPositive(task.antifreezeType ? `Антифриз ${task.antifreezeType}`.trim() : 'Антифриз', task.antifreezeL, 'л', task.antifreezePrice, 'task-antifreeze');

  const materialLines = Array.isArray(task.otherMaterialLines) ? task.otherMaterialLines : [];
  materialLines.forEach((row, idx) => {
    const name = String(row?.name || '').trim();
    if (!name) return;
    pushIfPositive(name, row.count, row.unit || 'шт', row.price, `task-other-${idx}`);
  });

  if (parseNumber(task.otherSum) > 0 || String(task.otherMaterials || '').trim()) {
    pushIfPositive(String(task.otherMaterials || '').trim() || 'Інші матеріали', 1, 'послуга', task.otherSum, 'task-other-legacy');
  }

  pushIfPositive('Добові, грн', 1, 'послуга', task.perDiem, 'task-per-diem');
  pushIfPositive('Проживання, грн', 1, 'послуга', task.living, 'task-living');
  pushIfPositive('Інші витрати, грн', 1, 'послуга', task.otherExp, 'task-other-exp');

  return lines;
}

export function sumLines(lines) {
  return roundMoney((lines || []).reduce((acc, line) => acc + parseNumber(line.total), 0));
}

export function recalcLine(line) {
  const qty = parseNumber(line.quantity);
  const price = parseNumber(line.unitPrice);
  return { ...line, quantity: qty, unitPrice: price, total: roundMoney(qty * price) };
}

export function formatUkDateFromIso(iso) {
  if (!iso) return '';
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}.${m[2]}.${m[1]}р.`;
}

export function getEstimateFileName(requestNumber) {
  const num = String(requestNumber || 'без-номера').trim() || 'без-номера';
  return `Сформований кошторис ${num}.xlsx`;
}
