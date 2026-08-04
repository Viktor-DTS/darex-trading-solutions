import { formatUkDateFromIso, roundMoney, splitLowerLinesForExport } from './estimatePrefill';

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

const TABLE_BORDER_SIDE = { style: 'medium' };
const FULL_BORDER = {
  top: TABLE_BORDER_SIDE,
  left: TABLE_BORDER_SIDE,
  bottom: TABLE_BORDER_SIDE,
  right: TABLE_BORDER_SIDE,
};
const KYIV_TABLE_FONT = { name: 'Calibri', size: 11, bold: false };
const KYIV_BOLD_FONT = { ...KYIV_TABLE_FONT, bold: true };
const LABEL_BORDER_TOP_RIGHT = { top: TABLE_BORDER_SIDE, right: TABLE_BORDER_SIDE };
const WORK_SECTION_TITLE = { row: 13, colStart: 2, colEnd: 5 };
const WORK_TABLE_HEADER_ROW = 14;
const DAREX_HEADER_IMAGE_URL = `${import.meta.env.BASE_URL}images/header-darex.png`;

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

function applyFullBorder(cell) {
  cell.border = { ...FULL_BORDER };
}

function applyAmountCellBorder(ws, rowNumber, col = 6) {
  applyFullBorder(ws.getRow(rowNumber).getCell(col));
}

async function applyDarexHeader(workbook, ws) {
  try {
    const response = await fetch(DAREX_HEADER_IMAGE_URL);
    if (!response.ok) return;
    const buffer = await response.arrayBuffer();
    for (let rowNumber = 1; rowNumber <= 5; rowNumber += 1) {
      const row = ws.getRow(rowNumber);
      for (let col = 1; col <= 7; col += 1) {
        row.getCell(col).value = null;
      }
      row.height = rowNumber === 1 ? 74 : 10;
      row.commit?.();
    }
    const imageId = workbook.addImage({ buffer, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0.1, row: 0.02 },
      ext: { width: 650, height: 90 },
    });
  } catch (e) {
    console.warn('[generateKyivRepairEstimateExcel] Darex header image:', e.message);
  }
}

function applyTableHeaderRowBorders(ws, rowNumber) {
  const row = ws.getRow(rowNumber);
  for (let col = 1; col <= 6; col += 1) {
    const cell = row.getCell(col);
    applyFullBorder(cell);
    cell.font = { ...KYIV_TABLE_FONT, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  row.commit?.();
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

function setMergedCell(ws, rowNumber, colStart, colEnd, value, alignment = {}, options = {}) {
  unmergeOverlappingRow(ws, rowNumber, colStart, colEnd);
  const row = ws.getRow(rowNumber);
  for (let col = colStart; col <= colEnd; col += 1) {
    const cell = row.getCell(col);
    cell.value = null;
    if (options.border) cell.border = {};
  }
  const cell = row.getCell(colStart);
  cell.value = value;
  if (colEnd > colStart) ws.mergeCells(rowNumber, colStart, rowNumber, colEnd);
  cell.alignment = {
    vertical: 'middle',
    wrapText: true,
    ...alignment,
  };
  cell.font = options.font || { ...KYIV_TABLE_FONT };
  if (options.border) cell.border = options.border;
  if (options.applyAmountBorder !== false) applyAmountCellBorder(ws, rowNumber, 6);
  row.commit?.();
}

function estimateWrappedLines(text, charsPerLine = 58) {
  return String(text || '')
    .split('\n')
    .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
}

function autoFitRowHeight(ws, rowNumber, { textCol = 2, minHeight = 15, lineHeight = 16, charsPerLine = 58, padding = 6 } = {}) {
  const row = ws.getRow(rowNumber);
  const cell = row.getCell(textCol);
  const text = cell.value == null ? '' : String(cell.value);
  cell.alignment = {
    ...(cell.alignment || {}),
    wrapText: true,
    vertical: 'top',
  };
  const lines = estimateWrappedLines(text, charsPerLine);
  row.height = Math.max(minHeight, lines * lineHeight + padding);
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

function formatKyivWorkLineName(item) {
  return String(item?.label || '').trim();
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
    const kyivName = formatKyivWorkLineName(found.item);
    return kyivName ? { ...line, name: kyivName } : line;
  });
}

function fillLineRow(ws, rowNumber, index, line) {
  unmergeOverlappingRow(ws, rowNumber, 1, 6);
  const row = ws.getRow(rowNumber);
  for (let col = 1; col <= 6; col += 1) {
    const cell = row.getCell(col);
    cell.style = {};
    applyFullBorder(cell);
    cell.font = { ...KYIV_TABLE_FONT };
  }

  setCell(row, 1, index);
  row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const nameCell = row.getCell(2);
  nameCell.value = line.name;
  nameCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  setCell(row, 3, line.quantity);
  row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

  const unitCell = row.getCell(4);
  unitCell.value = String(line.unit || '').replace(/\s+/g, ' ').trim();
  unitCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  setCell(row, 5, line.unitPrice);
  row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  setCell(row, 6, roundMoney(line.total));
  row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

  row.commit?.();
}

function clearRowRange(ws, rowNumber, colStart = 1, colEnd = 6) {
  unmergeOverlappingRow(ws, rowNumber, colStart, colEnd);
  const row = ws.getRow(rowNumber);
  for (let col = colStart; col <= colEnd; col += 1) {
    row.getCell(col).value = null;
  }
  row.commit?.();
}

function applySectionTitleStyle(ws, rowNumber, title) {
  clearRowRange(ws, rowNumber, 1, 6);
  setMergedCell(ws, rowNumber, WORK_SECTION_TITLE.colStart, WORK_SECTION_TITLE.colEnd, title, {
    horizontal: 'center',
    vertical: 'middle',
  }, {
    font: KYIV_BOLD_FONT,
    border: {},
    applyAmountBorder: false,
  });
  ws.getRow(rowNumber).height = 16.2;
}

function setMergedHeaderField(ws, rowNumber, colStart, colEnd, value) {
  setMergedCell(ws, rowNumber, colStart, colEnd, String(value || '').trim(), {
    horizontal: 'left',
    vertical: 'top',
    wrapText: true,
  });
  autoFitRowHeight(ws, rowNumber, { textCol: colStart, charsPerLine: 42, minHeight: 15, lineHeight: 16, padding: 6 });
}

function fixKyivSectionLabels(ws, {
  workTotalRow,
  materialsTitleRow,
  materialsSubtotalRow,
  grandVatRow,
  grandTotalRow,
}) {
  setMergedCell(ws, workTotalRow, 3, 5, KYIV_LABELS.workTotal, { horizontal: 'right' });
  applySectionTitleStyle(ws, materialsTitleRow, KYIV_LABELS.materialsTitle);
  setMergedCell(ws, materialsSubtotalRow, 3, 5, KYIV_LABELS.materialsSubtotal, { horizontal: 'right' }, {
    font: KYIV_BOLD_FONT,
    border: LABEL_BORDER_TOP_RIGHT,
  });
  setMergedCell(ws, grandVatRow, 3, 5, KYIV_LABELS.grandVat, { horizontal: 'right' }, {
    font: KYIV_BOLD_FONT,
  });
  setMergedCell(ws, grandTotalRow, 2, 5, KYIV_LABELS.grandTotal, { horizontal: 'right' }, {
    font: KYIV_BOLD_FONT,
  });

  [workTotalRow, materialsSubtotalRow, grandVatRow, grandTotalRow].forEach((rowNumber) => {
    applyAmountCellBorder(ws, rowNumber, 6);
  });
}

function filterNamedLines(lines) {
  return (lines || []).filter((line) => String(line?.name || '').trim());
}

function setKyivSectionTotals(ws, { vatRow, totalRow, totalWithVat }) {
  const total = roundMoney(totalWithVat);
  const vat = roundMoney(total / 6);
  const vatRowObj = ws.getRow(vatRow);
  const totalRowObj = ws.getRow(totalRow);
  const vatLabelCell = vatRowObj.getCell(5);
  vatLabelCell.value = 'ПДВ 20%';
  vatLabelCell.font = KYIV_BOLD_FONT;
  vatLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
  vatLabelCell.border = { ...LABEL_BORDER_TOP_RIGHT };
  setCell(vatRowObj, 6, vat);
  setCell(totalRowObj, 6, total);
  applyAmountCellBorder(ws, vatRow, 6);
  applyAmountCellBorder(ws, totalRow, 6);
  vatRowObj.commit?.();
  totalRowObj.commit?.();
}

function setMaterialsFooterTotals(ws, { grandVatRow, grandTotalRow, materialsTotal, combinedTotal }) {
  const materialsVat = roundMoney(materialsTotal / 6);
  const grandVatCell = ws.getRow(grandVatRow).getCell(6);
  const grandTotalCell = ws.getRow(grandTotalRow).getCell(6);
  grandVatCell.value = materialsVat;
  grandTotalCell.value = roundMoney(combinedTotal);
  grandVatCell.font = KYIV_TABLE_FONT;
  grandTotalCell.font = KYIV_TABLE_FONT;
  applyAmountCellBorder(ws, grandVatRow, 6);
  applyAmountCellBorder(ws, grandTotalRow, 6);
}

export async function generateKyivRepairEstimateExcel({ task, workLines, lowerLines, spec }) {
  const ExcelJS = (await import('exceljs')).default;
  const response = await fetch(resolveTemplateUrl(spec));
  if (!response.ok) throw new Error('Не вдалося завантажити шаблон кошторису');
  const buffer = await response.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];

  await applyDarexHeader(workbook, ws);

  const validWorkLines = filterNamedLines(enrichWorkLinesFromSpec(workLines, spec));
  const { materialLines } = splitLowerLinesForExport(lowerLines || []);
  const validMaterialLines = filterNamedLines(materialLines);

  applySectionTitleStyle(ws, WORK_SECTION_TITLE.row, '1. Виконані роботи');
  applyTableHeaderRowBorders(ws, WORK_TABLE_HEADER_ROW);

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
  const materialsSubtotalCell = ws.getRow(materialsSubtotalRow).getCell(6);
  materialsSubtotalCell.value = materialsTotal;
  materialsSubtotalCell.font = KYIV_TABLE_FONT;
  applyAmountCellBorder(ws, materialsSubtotalRow, 6);

  const materialsTitleRow = workTotalRow + 1;
  const grandVatRow = materialsSubtotalRow + 1;
  const grandTotalRow = materialsSubtotalRow + 2;
  const signatureRow = materialsSubtotalRow + 3;

  setMaterialsFooterTotals(ws, {
    grandVatRow,
    grandTotalRow,
    materialsTotal,
    combinedTotal: roundMoney(worksTotal + materialsTotal),
  });

  fixKyivSectionLabels(ws, {
    workTotalRow,
    materialsTitleRow,
    materialsSubtotalRow,
    grandVatRow,
    grandTotalRow,
  });

  applyTableHeaderRowBorders(ws, materialsTitleRow + 1);

  const tableDataRows = [
    ...validWorkLines.map((_, idx) => KYIV_LAYOUT.workDataStart + idx),
    ...validMaterialLines.map((_, idx) => materialsDataStart + idx),
  ];
  autoFitTableRows(ws, tableDataRows, { textCol: 2, charsPerLine: 32, minHeight: 18, lineHeight: 16, padding: 8 });

  while (ws.rowCount > signatureRow) {
    ws.spliceRows(signatureRow + 1, 1);
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
