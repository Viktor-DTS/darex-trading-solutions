import { formatUkDateFromIso, roundMoney, splitLowerLinesForExport } from './estimatePrefill';
import { formatSpecItemDisplayName } from './estimateSpecRegistry';

const KYIV_ROWS = {
  estimateNumber: { row: 7, col: 5 },
  estimateDate: { row: 8, col: 5 },
  equipment: { row: 9, col: 4 },
  siteId: { row: 10, col: 4 },
  client: { row: 11, col: 4 },
  address: { row: 12, col: 4 },
  workDataRow: 15,
  defaultWorkRows: 6,
  workVatRow: 21,
  materialsDataRow: 25,
  defaultMaterialRows: 7,
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
  for (let c = 1; c <= 8; c += 1) {
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

function trimWorksheetAfterRow(ws, lastRow) {
  while (ws.rowCount > lastRow) {
    ws.spliceRows(lastRow + 1, 1);
  }
}

function setKyivWorksTotals(ws, vatRow, totalRow, totalWithVat) {
  const total = roundMoney(totalWithVat);
  const vat = roundMoney(total / 6);
  setCell(ws.getRow(vatRow), 5, 'ПДВ 20%');
  setCell(ws.getRow(vatRow), 6, vat);
  setCell(ws.getRow(totalRow), 7, total);
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

  setCell(ws.getRow(KYIV_ROWS.estimateNumber.row), KYIV_ROWS.estimateNumber.col, String(task.requestNumber || '').trim());
  setCell(
    ws.getRow(KYIV_ROWS.estimateDate.row),
    KYIV_ROWS.estimateDate.col,
    formatUkDateFromIso(task.date || task.requestDate || new Date().toISOString().slice(0, 10))
  );
  setCell(ws.getRow(KYIV_ROWS.equipment.row), KYIV_ROWS.equipment.col, String(task.equipment || '').trim());
  setCell(
    ws.getRow(KYIV_ROWS.siteId.row),
    KYIV_ROWS.siteId.col,
    String(task.customerEquipmentNumber || task.siteId || '').trim()
  );
  setCell(ws.getRow(KYIV_ROWS.client.row), KYIV_ROWS.client.col, String(task.client || '').trim());
  setCell(ws.getRow(KYIV_ROWS.address.row), KYIV_ROWS.address.col, String(task.address || '').trim());

  const workFooterRow = adjustTableRows(ws, {
    startRow: KYIV_ROWS.workDataRow,
    defaultRows: KYIV_ROWS.defaultWorkRows,
    footerRowInitial: KYIV_ROWS.workVatRow,
    lines: validWorkLines,
  });

  validWorkLines.forEach((line, idx) => fillLineRow(ws, KYIV_ROWS.workDataRow + idx, idx + 1, line));

  const worksTotal = roundMoney(validWorkLines.reduce((s, l) => s + Number(l.total || 0), 0));
  setKyivWorksTotals(ws, workFooterRow, workFooterRow + 1, worksTotal);

  const materialsFooterRow = adjustTableRows(ws, {
    startRow: KYIV_ROWS.materialsDataRow,
    defaultRows: KYIV_ROWS.defaultMaterialRows,
    footerRowInitial: KYIV_ROWS.materialsSubtotalRow,
    lines: validMaterialLines,
  });

  validMaterialLines.forEach((line, idx) => {
    fillLineRow(ws, KYIV_ROWS.materialsDataRow + idx, idx + 1, line);
  });

  const materialsTotal = roundMoney(validMaterialLines.reduce((s, l) => s + Number(l.total || 0), 0));
  setCell(ws.getRow(materialsFooterRow), 7, materialsTotal);

  const combinedTotal = roundMoney(worksTotal + materialsTotal);
  const combinedVat = roundMoney(combinedTotal / 6);
  setCell(ws.getRow(materialsFooterRow + 1), 7, combinedVat);
  setCell(ws.getRow(materialsFooterRow + 2), 7, combinedTotal);

  trimWorksheetAfterRow(ws, KYIV_ROWS.signatureRow);

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
