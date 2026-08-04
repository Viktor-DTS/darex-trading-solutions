import { formatUkDateFromIso, roundMoney, splitLowerLinesForExport } from './estimatePrefill';
import { formatSpecItemDisplayName } from './estimateSpecRegistry';

const KYIV_LAYOUT = {
  estimateNumber: { row: 7, col: 5 },
  estimateDate: { row: 8, col: 5 },
  equipment: { row: 9, col: 3, mergeEnd: 6 },
  siteId: { row: 10, col: 3, mergeEnd: 6 },
  client: { row: 11, col: 3, mergeEnd: 6 },
  address: { row: 12, col: 3, mergeEnd: 6 },
  workDataStart: 15,
  workDefaultRows: 6,
  workVatRow: 21,
  materialsDataStart: 25,
  materialsDefaultRows: 7,
  materialsSubtotalRow: 32,
};

const KYIV_LABELS = {
  workTotal: 'Разом з ПДВ, загальна сума, грн. :',
  materialsTitle: '2. Матеріали та запасні частини',
  materialsSubtotal: 'Разом матеріали та запасні частини  з ПДВ.:',
  grandVat: 'Загальна сума ПДВ, грн. :',
  grandTotal: 'Разом,  роботи та матеріали з ПДВ,грн. :',
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

function parseMergeRef(mergeRef) {
  const match = String(mergeRef || '').match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  const colToNum = (letters) =>
    letters.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
  return {
    top: Number(match[2]),
    left: colToNum(match[1]),
    bottom: Number(match[4]),
    right: colToNum(match[3]),
  };
}

function unmergeOverlappingRow(ws, rowNumber, colStart, colEnd) {
  for (const mergeRef of [...(ws.model.merges || [])]) {
    const range = parseMergeRef(mergeRef);
    if (!range) continue;
    const overlapsRow = rowNumber >= range.top && rowNumber <= range.bottom;
    const overlapsCol = !(colEnd < range.left || colStart > range.right);
    if (overlapsRow && overlapsCol) ws.unMergeCells(mergeRef);
  }
}

function setMergedCell(ws, rowNumber, colStart, colEnd, value, alignment = {}) {
  unmergeOverlappingRow(ws, rowNumber, colStart, colEnd);
  const row = ws.getRow(rowNumber);
  for (let col = colStart; col <= colEnd; col += 1) {
    row.getCell(col).value = null;
  }
  const cell = row.getCell(colStart);
  cell.value = value;
  if (colEnd > colStart) ws.mergeCells(rowNumber, colStart, rowNumber, colEnd);
  cell.alignment = {
    vertical: 'middle',
    wrapText: true,
    ...alignment,
  };
  row.commit?.();
}

function estimateWrappedLines(text, charsPerLine = 58) {
  return String(text || '')
    .split('\n')
    .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
}

function autoFitRowHeight(ws, rowNumber, { textCol = 2, minHeight = 15, lineHeight = 15, charsPerLine = 58 } = {}) {
  const row = ws.getRow(rowNumber);
  const cell = row.getCell(textCol);
  const text = cell.value == null ? '' : String(cell.value);
  cell.alignment = {
    ...(cell.alignment || {}),
    wrapText: true,
    vertical: 'top',
  };
  const lines = estimateWrappedLines(text, charsPerLine);
  row.height = Math.max(minHeight, lines * lineHeight);
  row.commit?.();
}

function autoFitTableRows(ws, rowNumbers, options = {}) {
  rowNumbers.forEach((rowNumber) => autoFitRowHeight(ws, rowNumber, options));
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
  const nameCell = row.getCell(2);
  nameCell.value = line.name;
  nameCell.alignment = { ...(nameCell.alignment || {}), wrapText: true, vertical: 'top' };
  setCell(row, 3, line.quantity);
  setCell(row, 4, line.unit);
  setCell(row, 5, line.unitPrice);
  setCell(row, 6, roundMoney(line.total));
  row.commit?.();
}

function setMergedHeaderField(ws, rowNumber, colStart, colEnd, value) {
  setMergedCell(ws, rowNumber, colStart, colEnd, String(value || '').trim(), {
    horizontal: 'left',
    vertical: 'top',
    wrapText: true,
  });
  autoFitRowHeight(ws, rowNumber, { textCol: colStart, charsPerLine: 42, minHeight: 15, lineHeight: 15 });
}

function fixKyivSectionLabels(ws, {
  workTotalRow,
  materialsTitleRow,
  materialsSubtotalRow,
  grandVatRow,
  grandTotalRow,
}) {
  setMergedCell(ws, workTotalRow, 3, 5, KYIV_LABELS.workTotal, { horizontal: 'right' });
  setMergedCell(ws, materialsTitleRow, 1, 6, KYIV_LABELS.materialsTitle, { horizontal: 'center' });
  setMergedCell(ws, materialsSubtotalRow, 3, 5, KYIV_LABELS.materialsSubtotal, { horizontal: 'right' });
  setMergedCell(ws, grandVatRow, 3, 5, KYIV_LABELS.grandVat, { horizontal: 'right' });
  setMergedCell(ws, grandTotalRow, 2, 5, KYIV_LABELS.grandTotal, { horizontal: 'right' });
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
  setMergedHeaderField(ws, KYIV_LAYOUT.equipment.row, KYIV_LAYOUT.equipment.col, KYIV_LAYOUT.equipment.mergeEnd, task.equipment);
  setMergedHeaderField(ws, KYIV_LAYOUT.siteId.row, KYIV_LAYOUT.siteId.col, KYIV_LAYOUT.siteId.mergeEnd, task.customerEquipmentNumber || task.siteId);
  setMergedHeaderField(ws, KYIV_LAYOUT.client.row, KYIV_LAYOUT.client.col, KYIV_LAYOUT.client.mergeEnd, task.client);
  setMergedHeaderField(ws, KYIV_LAYOUT.address.row, KYIV_LAYOUT.address.col, KYIV_LAYOUT.address.mergeEnd, task.address);

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

  const materialsTitleRow = workTotalRow + 1;
  const grandVatRow = materialsSubtotalRow + 1;
  const grandTotalRow = materialsSubtotalRow + 2;
  const signatureRow = materialsSubtotalRow + 3;

  setGrandTotals(ws, {
    grandVatRow,
    grandTotalRow,
    combinedTotal: roundMoney(worksTotal + materialsTotal),
  });

  fixKyivSectionLabels(ws, {
    workTotalRow,
    materialsTitleRow,
    materialsSubtotalRow,
    grandVatRow,
    grandTotalRow,
  });

  autoFitTableRows(
    ws,
    [
      ...validWorkLines.map((_, idx) => KYIV_LAYOUT.workDataStart + idx),
      ...validMaterialLines.map((_, idx) => materialsDataStart + idx),
    ],
    { textCol: 2, charsPerLine: 36, minHeight: 15, lineHeight: 15 }
  );

  while (ws.rowCount > signatureRow) {
    ws.spliceRows(signatureRow + 1, 1);
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
