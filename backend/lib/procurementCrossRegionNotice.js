/**
 * Попередження завскладу: товар прибув не на бажаний склад, інший регіон — потрібне переміщення.
 */

function normalizeWarehouseName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function formatRequestDateUk(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function lineExpectedQty(line) {
  if (!line || line.rejected) return null;
  let main = 0;
  if (line.quantity != null && Number.isFinite(Number(line.quantity))) {
    main = Math.max(0, Number(line.quantity));
  }
  let analog = 0;
  if (
    line.analogShipped &&
    String(line.analogName || '').trim() &&
    line.analogQuantity != null &&
    Number.isFinite(Number(line.analogQuantity))
  ) {
    analog = Math.max(0, Number(line.analogQuantity));
  }
  const sum = main + analog;
  return sum > 0 ? sum : null;
}

function lineProductLabel(line) {
  if (!line) return '—';
  if (line.rejected) return String(line.name || '—');
  if (line.analogShipped && String(line.analogName || '').trim()) {
    return String(line.analogName).trim();
  }
  return String(line.name || '—').trim() || '—';
}

function lineQtyLabel(line) {
  const qty = lineExpectedQty(line);
  if (qty == null) return '—';
  const uom = String(line.unitOfMeasure || 'шт.').trim() || 'шт.';
  return `${qty} ${uom}`;
}

function buildWarehouseRegionMap(warehouseDocs) {
  const map = new Map();
  for (const wh of warehouseDocs || []) {
    const name = String(wh?.name || '').trim();
    const region = String(wh?.region || '').trim();
    if (!name || !region) continue;
    map.set(normalizeWarehouseName(name), region);
  }
  return map;
}

function regionForWarehouseName(name, regionMap) {
  const key = normalizeWarehouseName(name);
  if (!key) return '';
  return regionMap.get(key) || '';
}

function buildCrossRegionTransferNoticeText(pr, line, actualWarehouse) {
  const rn = String(pr.requestNumber || pr._id || '—').trim();
  const requester = String(pr.requesterName || pr.requesterLogin || '—').trim();
  const desired = String(pr.desiredWarehouse || '—').trim();
  const actual = String(actualWarehouse || '—').trim();
  const product = lineProductLabel(line);
  const quantity = lineQtyLabel(line);
  const requestDate = formatRequestDateUk(pr.createdAt);

  return (
    `Вам відвантажений товар згідно заявки № ${rn} (замовник: ${requester}). ` +
    `Бажаний склад відвантаження: ${desired}. Фактичний склад отримання: ${actual}. ` +
    `Товар: ${product}, кількість: ${quantity}, дата заявки: ${requestDate}. ` +
    `Просимо здійснити переміщення згідно заявки.`
  );
}

/**
 * @returns {{ lineIndex: number, desiredWarehouse: string, actualWarehouse: string, text: string }[]}
 */
function computeProcurementCrossRegionNotices(pr, warehouseDocs) {
  const desired = String(pr?.desiredWarehouse || '').trim();
  if (!desired) return [];

  const regionMap = buildWarehouseRegionMap(warehouseDocs);
  const desiredRegion = regionForWarehouseName(desired, regionMap);
  if (!desiredRegion) return [];

  const notices = [];
  const materials = pr.materials || [];

  materials.forEach((line, lineIndex) => {
    if (line.receiptLineEditable === false) return;
    if (line.rejected) return;
    const actual = String(line.actualWarehouse || pr.actualWarehouse || '').trim();
    if (!actual) return;
    if (normalizeWarehouseName(desired) === normalizeWarehouseName(actual)) return;

    const actualRegion = regionForWarehouseName(actual, regionMap);
    if (!actualRegion || actualRegion === desiredRegion) return;

    notices.push({
      lineIndex,
      desiredWarehouse: desired,
      actualWarehouse: actual,
      text: buildCrossRegionTransferNoticeText(pr, line, actual),
    });
  });

  return notices;
}

module.exports = {
  normalizeWarehouseName,
  buildWarehouseRegionMap,
  computeProcurementCrossRegionNotices,
  buildCrossRegionTransferNoticeText,
};
