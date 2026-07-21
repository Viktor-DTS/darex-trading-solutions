import { formatUkDateFromIso, roundMoney } from './estimatePrefill';

const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/estimate-template.xlsx`;

function setCell(row, col, value) {
  row.getCell(col).value = value;
}

function cloneRowStyle(ws, sourceRowNumber, targetRowNumber) {
  const source = ws.getRow(sourceRowNumber);
  const target = ws.getRow(targetRowNumber);
  target.height = source.height;
  for (let c = 1; c <= 8; c++) {
    const srcCell = source.getCell(c);
    const dstCell = target.getCell(c);
    dstCell.style = { ...srcCell.style };
    if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;
    if (srcCell.alignment) dstCell.alignment = { ...srcCell.alignment };
    if (srcCell.border) dstCell.border = { ...srcCell.border };
    if (srcCell.fill) dstCell.fill = { ...srcCell.fill };
    if (srcCell.font) dstCell.font = { ...srcCell.font };
  }
}

function fillLineRow(ws, rowNumber, index, line) {
  const row = ws.getRow(rowNumber);
  setCell(row, 2, index);
  setCell(row, 3, line.name);
  setCell(row, 4, line.quantity);
  setCell(row, 5, line.unit);
  setCell(row, 6, line.unitPrice);
  setCell(row, 7, roundMoney(line.total));
  row.commit?.();
}

export async function generateEstimateExcel({ task, workLines, lowerLines }) {
  const ExcelJS = (await import('exceljs')).default;
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('Не вдалося завантажити шаблон кошторису');
  const buffer = await response.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];

  const requestNumber = String(task.requestNumber || '').trim();
  const estimateDate = formatUkDateFromIso(task.date || task.requestDate || new Date().toISOString().slice(0, 10));
  const equipment = String(task.equipment || '').trim();
  const inv = String(task.customerEquipmentNumber || '').trim();
  const serial = String(task.equipmentSerial || task.engineSerial || '').trim();

  setCell(ws.getRow(7), 6, requestNumber);
  setCell(ws.getRow(8), 6, estimateDate);
  setCell(ws.getRow(9), 4, equipment);
  setCell(ws.getRow(10), 4, inv);
  setCell(ws.getRow(10), 6, serial);
  setCell(ws.getRow(11), 4, String(task.client || '').trim());
  setCell(ws.getRow(12), 4, String(task.address || '').trim());

  const defaultWorkRows = 7;
  const workStart = 15;
  const workFooterRowInitial = 22;
  const extraWorkRows = Math.max(0, workLines.length - defaultWorkRows);
  if (extraWorkRows > 0) {
    ws.spliceRows(workFooterRowInitial, 0, ...Array.from({ length: extraWorkRows }, () => []));
    for (let i = 0; i < extraWorkRows; i++) {
      cloneRowStyle(ws, workStart, workFooterRowInitial + i);
    }
  }

  const workFooterRow = workFooterRowInitial + extraWorkRows;
  const lowerHeaderRow = workFooterRow + 3;
  const lowerStart = lowerHeaderRow + 1;
  const defaultLowerRows = 4;
  const lowerFooterRowInitial = lowerStart + defaultLowerRows;
  const extraLowerRows = Math.max(0, lowerLines.length - defaultLowerRows);
  if (extraLowerRows > 0) {
    ws.spliceRows(lowerFooterRowInitial, 0, ...Array.from({ length: extraLowerRows }, () => []));
    for (let i = 0; i < extraLowerRows; i++) {
      cloneRowStyle(ws, lowerStart, lowerFooterRowInitial + i);
    }
  }

  workLines.forEach((line, idx) => fillLineRow(ws, workStart + idx, idx + 1, line));
  for (let i = workLines.length; i < defaultWorkRows + extraWorkRows; i++) {
    fillLineRow(ws, workStart + i, i + 1, {
      name: '',
      quantity: 1,
      unit: 'послуга',
      unitPrice: 0,
      total: 0,
    });
  }

  const worksTotal = roundMoney(workLines.reduce((s, l) => s + Number(l.total || 0), 0));
  const worksVat = roundMoney(worksTotal / 6);
  setCell(ws.getRow(workFooterRow), 7, worksVat);
  setCell(ws.getRow(workFooterRow + 1), 7, worksTotal);

  const lowerFooterRow = lowerFooterRowInitial + extraLowerRows;
  lowerLines.forEach((line, idx) => fillLineRow(ws, lowerStart + idx, idx + 1, line));
  for (let i = lowerLines.length; i < defaultLowerRows + extraLowerRows; i++) {
    fillLineRow(ws, lowerStart + i, i + 1, {
      name: '',
      quantity: '',
      unit: '',
      unitPrice: '',
      total: 0,
    });
  }

  const lowerTotal = roundMoney(lowerLines.reduce((s, l) => s + Number(l.total || 0), 0));
  const grandTotal = roundMoney(worksTotal + lowerTotal);
  const grandVat = roundMoney(grandTotal / 6);

  setCell(ws.getRow(lowerFooterRow), 7, lowerTotal);
  setCell(ws.getRow(lowerFooterRow + 1), 7, grandVat);
  setCell(ws.getRow(lowerFooterRow + 2), 7, grandTotal);

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
