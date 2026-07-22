import { formatUkDateFromIso, roundMoney, splitLowerLinesForExport } from './estimatePrefill';
import { formatSpecItemDisplayName } from './estimateSpecRegistry';

const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/estimate-template.xlsx`;

const TEMPLATE_ROWS = {
  sectionTitle: 13,
  dataRow: 15,
  workVatRow: 22,
  workTotalRow: 23,
  lowerTableHeader: 25,
  lowerDataRow: 26,
  signature: 33,
};

const SECTION_TOTAL_LABEL = 'Разом з ПДВ, загальна сума, грн. :';
const VAT_LABEL = 'ПДВ 20%';

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

function filterNamedLines(lines) {
  return (lines || []).filter((line) => String(line?.name || '').trim());
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

function setMergedLabelRow(ws, rowNumber, colStart, colEnd, label) {
  unmergeOverlappingRow(ws, rowNumber, colStart, colEnd);
  const row = ws.getRow(rowNumber);
  for (let col = colStart; col <= colEnd; col += 1) {
    row.getCell(col).value = null;
  }
  row.getCell(colStart).value = label;
  if (colEnd > colStart) ws.mergeCells(rowNumber, colStart, rowNumber, colEnd);
}

function setMergedSectionTotalLabelRow(ws, rowNumber, label) {
  unmergeOverlappingRow(ws, rowNumber, 4, 6);
  const row = ws.getRow(rowNumber);
  for (let col = 4; col <= 6; col += 1) {
    row.getCell(col).value = null;
  }
  const cell = row.getCell(4);
  cell.value = label;
  ws.mergeCells(rowNumber, 4, rowNumber, 6);
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  cell.font = { bold: true, size: 11, name: 'Calibri', family: 2 };
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

function fillInventoryRow(ws, inventoryNumber) {
  const row = ws.getRow(10);
  row.getCell(2).value = 'Інвентарний №';
  unmergeOverlappingRow(ws, 10, 4, 7);
  for (let col = 4; col <= 7; col += 1) row.getCell(col).value = null;
  row.getCell(4).value = String(inventoryNumber || '').trim();
  ws.mergeCells(10, 4, 10, 7);
}

function estimateWrappedLines(text, charsPerLine = 58) {
  return String(text || '')
    .split('\n')
    .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
}

function autoFitRowHeight(ws, rowNumber, { textCol = 3, minHeight = 15, lineHeight = 15 } = {}) {
  const row = ws.getRow(rowNumber);
  const cell = row.getCell(textCol);
  const text = cell.value == null ? '' : String(cell.value);
  cell.alignment = {
    ...(cell.alignment || {}),
    wrapText: true,
    vertical: 'top',
  };
  const lines = estimateWrappedLines(text);
  row.height = Math.max(minHeight, lines * lineHeight);
  row.commit?.();
}

function autoFitTableRows(ws, rowNumbers) {
  rowNumbers.forEach((rowNumber) => autoFitRowHeight(ws, rowNumber));
}

function trimWorksheetAfterRow(ws, lastRow) {
  const merges = [...(ws.model.merges || [])];
  for (const mergeRef of merges) {
    const range = parseMergeRef(mergeRef);
    if (range && range.top > lastRow) {
      ws.unMergeCells(mergeRef);
    }
  }
  while (ws.rowCount > lastRow) {
    ws.spliceRows(lastRow + 1, 1);
  }
}

function removeRowsFrom(ws, startRow) {
  while (ws.rowCount >= startRow) {
    ws.spliceRows(startRow, 1);
  }
}

function setSectionSubtotalRows(ws, templates, { vatRow, totalRow, totalWithVat }) {
  const total = roundMoney(totalWithVat);
  const vat = roundMoney(total / 6);
  applyRowTemplate(ws, vatRow, templates.sectionVat);
  setCell(ws.getRow(vatRow), 6, VAT_LABEL);
  setCell(ws.getRow(vatRow), 7, vat);
  applyRowTemplate(ws, totalRow, templates.sectionTotal);
  setMergedSectionTotalLabelRow(ws, totalRow, SECTION_TOTAL_LABEL);
  setCell(ws.getRow(totalRow), 7, total);
  ws.getRow(totalRow).getCell(7).font = { bold: true, size: 11, name: 'Calibri', family: 2 };
}

function buildSectionBlock({
  ws,
  startRow,
  templates,
  sectionTitle,
  lines,
}) {
  let row = startRow;

  applyRowTemplate(ws, row, templates.sectionTitle);
  setMergedLabelRow(ws, row, 3, 6, sectionTitle);
  row += 1;

  applyRowTemplate(ws, row, templates.tableHeader);
  row += 1;

  const dataRows = [];
  for (let i = 0; i < lines.length; i += 1) {
    applyRowTemplate(ws, row, templates.dataRow);
    fillLineRow(ws, row, i + 1, lines[i]);
    dataRows.push(row);
    row += 1;
  }

  const vatRow = row;
  row += 1;
  const totalRow = row;
  row += 1;

  return { nextRow: row, vatRow, totalRow, dataRows };
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

export async function generateEstimateExcel({ task, workLines, lowerLines, spec }) {
  const ExcelJS = (await import('exceljs')).default;
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('Не вдалося завантажити шаблон кошторису');
  const buffer = await response.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];

  const validWorkLines = filterNamedLines(enrichWorkLinesFromSpec(workLines, spec));
  const { materialLines, transportLines } = splitLowerLinesForExport(lowerLines);

  const requestNumber = String(task.requestNumber || '').trim();
  const estimateDate = formatUkDateFromIso(task.date || task.requestDate || new Date().toISOString().slice(0, 10));
  const equipment = String(task.equipment || '').trim();
  const inv = String(task.customerEquipmentNumber || '').trim();

  setCell(ws.getRow(7), 6, requestNumber);
  setCell(ws.getRow(8), 6, estimateDate);
  setCell(ws.getRow(9), 4, equipment);
  fillInventoryRow(ws, inv);
  setCell(ws.getRow(11), 4, String(task.client || '').trim());
  setCell(ws.getRow(12), 4, String(task.address || '').trim());

  const defaultWorkRows = 7;
  const workStart = TEMPLATE_ROWS.dataRow;
  const workFooterRowInitial = TEMPLATE_ROWS.workVatRow;
  const workFooterRow = adjustTableRows(ws, {
    startRow: workStart,
    defaultRows: defaultWorkRows,
    footerRowInitial: workFooterRowInitial,
    lines: validWorkLines,
  });

  const sectionVatTemplate = captureRowTemplate(ws, workFooterRow);
  const sectionTotalTemplate = captureRowTemplate(ws, workFooterRow + 1);

  validWorkLines.forEach((line, idx) => fillLineRow(ws, workStart + idx, idx + 1, line));

  const worksTotal = roundMoney(validWorkLines.reduce((s, l) => s + Number(l.total || 0), 0));
  const worksVat = roundMoney(worksTotal / 6);
  applyRowTemplate(ws, workFooterRow, sectionVatTemplate);
  setCell(ws.getRow(workFooterRow), 6, VAT_LABEL);
  setCell(ws.getRow(workFooterRow), 7, worksVat);
  applyRowTemplate(ws, workFooterRow + 1, sectionTotalTemplate);
  setMergedSectionTotalLabelRow(ws, workFooterRow + 1, SECTION_TOTAL_LABEL);
  setCell(ws.getRow(workFooterRow + 1), 7, worksTotal);
  ws.getRow(workFooterRow + 1).getCell(7).font = { bold: true, size: 11, name: 'Calibri', family: 2 };

  const lowerBlockStart = workFooterRow + 3;

  const templates = {
    sectionTitle: captureRowTemplate(ws, TEMPLATE_ROWS.sectionTitle),
    tableHeader: captureRowTemplate(ws, lowerBlockStart),
    dataRow: captureRowTemplate(ws, lowerBlockStart + 1),
    sectionVat: sectionVatTemplate,
    sectionTotal: sectionTotalTemplate,
    summaryRow: sectionTotalTemplate,
    signature: captureRowTemplate(ws, lowerBlockStart + 8),
  };

  removeRowsFrom(ws, lowerBlockStart);

  const sectionOverhead = 4;
  const grandSummaryRows = 7;
  const newRowCount = sectionOverhead + materialLines.length
    + sectionOverhead + transportLines.length
    + grandSummaryRows;
  ws.spliceRows(lowerBlockStart, 0, ...Array.from({ length: newRowCount }, () => []));

  let cursor = lowerBlockStart;
  const materialsBlock = buildSectionBlock({
    ws,
    startRow: cursor,
    templates,
    sectionTitle: '2. Матеріали та запасні частини',
    lines: materialLines,
  });
  cursor = materialsBlock.nextRow;

  const transportBlock = buildSectionBlock({
    ws,
    startRow: cursor,
    templates,
    sectionTitle: '3. Транспортні послуги',
    lines: transportLines,
  });
  cursor = transportBlock.nextRow;

  const summaryTopGapRow = cursor;
  cursor += 1;
  const worksMaterialsRow = cursor;
  cursor += 1;
  const worksMaterialsVatRow = cursor;
  cursor += 1;
  const summaryGapRow = cursor;
  cursor += 1;
  const grandTotalRow = cursor;
  cursor += 1;
  const grandVatRow = cursor;
  cursor += 1;
  const signatureRow = cursor;

  ws.getRow(summaryTopGapRow).height = 8;

  applyRowTemplate(ws, worksMaterialsRow, templates.sectionTotal);
  setMergedSectionTotalLabelRow(
    ws,
    worksMaterialsRow,
    'Разом Виконані роботи та Матеріали та запасні частини з ПДВ, грн.:'
  );

  applyRowTemplate(ws, worksMaterialsVatRow, templates.summaryRow);
  setMergedLabelRow(ws, worksMaterialsVatRow, 4, 6, 'ПДВ 20% за кошторисом:');

  ws.getRow(summaryGapRow).height = 8;

  applyRowTemplate(ws, grandTotalRow, templates.sectionTotal);
  setMergedSectionTotalLabelRow(
    ws,
    grandTotalRow,
    'Разом по кошторису, роботи, матеріали та транспорт з ПДВ, грн.:'
  );

  applyRowTemplate(ws, grandVatRow, templates.summaryRow);
  setMergedLabelRow(ws, grandVatRow, 4, 6, 'ПДВ 20% за кошторисом:');

  applyRowTemplate(ws, signatureRow, templates.signature);

  const materialsTotal = roundMoney(materialLines.reduce((s, l) => s + Number(l.total || 0), 0));
  const transportTotal = roundMoney(transportLines.reduce((s, l) => s + Number(l.total || 0), 0));
  const worksAndMaterialsTotal = roundMoney(worksTotal + materialsTotal);
  const worksAndMaterialsVat = roundMoney(worksAndMaterialsTotal / 6);
  const grandTotal = roundMoney(worksTotal + materialsTotal + transportTotal);
  const grandVat = roundMoney(grandTotal / 6);

  setSectionSubtotalRows(ws, templates, {
    vatRow: materialsBlock.vatRow,
    totalRow: materialsBlock.totalRow,
    totalWithVat: materialsTotal,
  });
  setSectionSubtotalRows(ws, templates, {
    vatRow: transportBlock.vatRow,
    totalRow: transportBlock.totalRow,
    totalWithVat: transportTotal,
  });

  setCell(ws.getRow(worksMaterialsRow), 7, worksAndMaterialsTotal);
  ws.getRow(worksMaterialsRow).getCell(7).font = { bold: true, size: 11, name: 'Calibri', family: 2 };
  setCell(ws.getRow(worksMaterialsVatRow), 7, worksAndMaterialsVat);
  setCell(ws.getRow(grandTotalRow), 7, grandTotal);
  ws.getRow(grandTotalRow).getCell(7).font = { bold: true, size: 11, name: 'Calibri', family: 2 };
  setCell(ws.getRow(grandVatRow), 7, grandVat);

  const fitRows = [
    ...validWorkLines.map((_, idx) => workStart + idx),
    ...materialsBlock.dataRows,
    ...transportBlock.dataRows,
  ];
  autoFitTableRows(ws, fitRows);
  trimWorksheetAfterRow(ws, signatureRow);

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
