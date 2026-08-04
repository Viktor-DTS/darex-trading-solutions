import { formatUkDateFromIso, roundMoney, splitLowerLinesForExport } from './estimatePrefill';
import { formatSpecItemDisplayName } from './estimateSpecRegistry';

const KYIV_LAYOUT = {
  estimateNumber: { row: 7, col: 5 },
  estimateDate: { row: 8, col: 5 },
  equipment: { row: 9, col: 3 },
  siteId: { row: 10, col: 3 },
  client: { row: 11, col: 3 },
  address: { row: 12, col: 3 },
  workDataStart: 15,
  workDefaultRows: 6,
  workVatRow: 21,
  materialsDataStart: 25,
  materialsDefaultRows: 7,
  materialsSubtotalRow: 32,
  signatureRow: 35,
};

function resolveTemplateUrl(spec) {
  const custom = String(spec?.estimateTemplateUrl || '').trim();
  if (custom) return custom;
  const staticPath = String(spec?.templateStaticPath || '').trim();
  if (staticPath) return `${import.meta.env.BASE_URL}${staticPath.replace(/^\//, '')}`;
  return `${import.meta.env.BASE_URL}templates/estimate-template-lifecell-kyiv.xlsx`;
}

function setCell(row, col, value) {
  row.getCell(col).value = value;
}

function captureRowTemplate(ws, rowNumber) {
  const row = ws.getRow(rowNumber);
  const cells = [];
  for (let c = 1; c <= 7; c += 1) {
    const cell = row.getCell(c);
    cells.push({
      value: cell.value,
      style: cell.style ? { ...cell.style } : undefined,
      numFmt: cell.numFmt,
      alignment: cell.alignment ? { ...cell.alignment } : undefined,
      border: cell.border ? { ...cell.border } : undefined,
      fill: cell.fill ? { ...cell.fill } : undefined,
      font: cell.font ? { ...cell.font } : undefined,
    });
  }
  return { height: row.height, cells };
}

function applyRowTemplate(ws, rowNumber, template, valueOverrides = {}) {
  const row = ws.getRow(rowNumber);
  if (template.height != null) row.height = template.height;
  template.cells.forEach((tpl, idx) => {
    const col = idx + 1;
    const cell = row.getCell(col);
    if (tpl.style) cell.style = { ...tpl.style };
    if (tpl.numFmt) cell.numFmt = tpl.numFmt;
    if (tpl.alignment) cell.alignment = { ...tpl.alignment };
    if (tpl.border) cell.border = { ...tpl.border };
    if (tpl.fill) cell.fill = { ...tpl.fill };
    if (tpl.font) cell.font = { ...tpl.font };
    if (Object.prototype.hasOwnProperty.call(valueOverrides, col)) {
      cell.value = valueOverrides[col];
    } else if (typeof tpl.value === 'string' || typeof tpl.value === 'number' || tpl.value == null) {
      cell.value = tpl.value;
    } else {
      cell.value = null;
    }
  });
  row.commit?.();
}

function cloneRowStyle(ws, sourceRowNumber, targetRowNumber) {
  applyRowTemplate(ws, targetRowNumber, captureRowTemplate(ws, sourceRowNumber));
}

function adjustTableRows(ws, { startRow, defaultRows, footerRowInitial, lines }) {
  const rowDelta = lines.length - defaultRows;
  if (rowDelta > 0) {
    ws.spliceRows(footerRowInitial, 0, ...Array.from({ length: rowDelta }, () => []));
    for (let i = 0; i < rowDelta; i += 1) {
      cloneRowStyle(ws, startRow, footerRowInitial + i);
    }
  } else if (rowDelta < 0) {
    ws.spliceRows(startRow + lines.length, -rowDelta);
  }
  return footerRowInitial + rowDelta;
}

function fillLineRow(ws, rowNumber, index, line) {
  const row = ws.getRow(rowNumber);
  setCell(row, 1, index);
  setCell(row, 2, line.name);
  setCell(row, 3, line.quantity);
  setCell(row, 4, line.unit);
  setCell(row, 5, line.unitPrice);
  setCell(row, 6, roundMoney(line.total));
  row.commit?.();
}

function filterNamedLines(lines) {
  return (lines || []).filter((line) => String(line?.name || '').trim());
}

function enrichWorkLinesFromSpec(workLines, spec) {
  if (!spec?.categories?.length) return workLines || [];
  const byItemId = new Map();
  for (const category of spec.categories) {
    for (const item of category.items || []) {
      byItemId.set(item.id, { category, item });
    }
  }
  return (workLines || []).map((line) => {
    const key = line.specItemId || line.id;
    const found = key ? byItemId.get(key) : null;
    if (!found) return line;
    return {
      ...line,
      name: formatSpecItemDisplayName(found.category.title, found.item),
    };
  });
}

function setKyivSectionTotals(ws, { vatRow, totalRow, totalWithVat }) {
  const total = roundMoney(totalWithVat);
  const vat = roundMoney(total / 6);
  const vatRowObj = ws.getRow(vatRow);
  const totalRowObj = ws.getRow(totalRow);
  setCell(vatRowObj, 5, 'ПДВ 20%');
  setCell(vatRowObj, 6, vat);
  setCell(totalRowObj, 6, total);
  vatRowObj.commit?.();
  totalRowObj.commit?.();
}

function setGrandTotals(ws, { grandVatRow, grandTotalRow, combinedTotal }) {
  const total = roundMoney(combinedTotal);
  const vat = roundMoney(total / 6);
  setCell(ws.getRow(grandVatRow), 6, vat);
  setCell(ws.getRow(grandTotalRow), 6, total);
}

export async function generateKyivRepairEstimateExcel({ task, workLines, lowerLines, spec }) {
  const ExcelJS = (await import('exceljs')).default;
  const response = await fetch(resolveTemplateUrl(spec));
  if (!response.ok) throw new Error('Не вдалося завантажити шаблон кошторису');
  const buffer = await response.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];

  const validWorkLines = filterNamedLines(enrichWorkLinesFromSpec(workLines, spec));
  const { materialLines } = splitLowerLinesForExport(lowerLines || []);
  const validMaterialLines = filterNamedLines(materialLines);

  setCell(ws.getRow(KYIV_LAYOUT.estimateNumber.row), KYIV_LAYOUT.estimateNumber.col, String(task.requestNumber || '').trim());
  setCell(
    ws.getRow(KYIV_LAYOUT.estimateDate.row),
    KYIV_LAYOUT.estimateDate.col,
    formatUkDateFromIso(task.date || task.requestDate || new Date().toISOString().slice(0, 10))
  );
  setCell(ws.getRow(KYIV_LAYOUT.equipment.row), KYIV_LAYOUT.equipment.col, String(task.equipment || '').trim());
  setCell(
    ws.getRow(KYIV_LAYOUT.siteId.row),
    KYIV_LAYOUT.siteId.col,
    String(task.customerEquipmentNumber || task.siteId || '').trim()
  );
  setCell(ws.getRow(KYIV_LAYOUT.client.row), KYIV_LAYOUT.client.col, String(task.client || '').trim());
  setCell(ws.getRow(KYIV_LAYOUT.address.row), KYIV_LAYOUT.address.col, String(task.address || '').trim());

  const workRowDelta = validWorkLines.length - KYIV_LAYOUT.workDefaultRows;

  const workVatRow = adjustTableRows(ws, {
    startRow: KYIV_LAYOUT.workDataStart,
    defaultRows: KYIV_LAYOUT.workDefaultRows,
    footerRowInitial: KYIV_LAYOUT.workVatRow,
    lines: validWorkLines,
  });
  const workTotalRow = workVatRow + 1;

  validWorkLines.forEach((line, idx) => {
    fillLineRow(ws, KYIV_LAYOUT.workDataStart + idx, idx + 1, line);
  });

  const worksTotal = roundMoney(validWorkLines.reduce((s, l) => s + Number(l.total || 0), 0));
  setKyivSectionTotals(ws, { vatRow: workVatRow, totalRow: workTotalRow, totalWithVat: worksTotal });

  const materialsDataStart = KYIV_LAYOUT.materialsDataStart + workRowDelta;
  const materialsSubtotalInitial = KYIV_LAYOUT.materialsSubtotalRow + workRowDelta;

  const materialsSubtotalRow = adjustTableRows(ws, {
    startRow: materialsDataStart,
    defaultRows: KYIV_LAYOUT.materialsDefaultRows,
    footerRowInitial: materialsSubtotalInitial,
    lines: validMaterialLines,
  });

  validMaterialLines.forEach((line, idx) => {
    fillLineRow(ws, materialsDataStart + idx, idx + 1, line);
  });

  const materialsTotal = roundMoney(validMaterialLines.reduce((s, l) => s + Number(l.total || 0), 0));
  setCell(ws.getRow(materialsSubtotalRow), 6, materialsTotal);

  const grandVatRow = materialsSubtotalRow + 1;
  const grandTotalRow = materialsSubtotalRow + 2;
  const signatureRow = materialsSubtotalRow + 3;

  setGrandTotals(ws, {
    grandVatRow,
    grandTotalRow,
    combinedTotal: roundMoney(worksTotal + materialsTotal),
  });

  while (ws.rowCount > signatureRow) {
    ws.spliceRows(signatureRow + 1, 1);
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
