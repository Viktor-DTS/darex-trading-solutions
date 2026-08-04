/**
 * Імпорт заявок на закупівлю з Google Sheets (таблиця «Замовлення Рудковському»).
 * Читає через публічний gviz endpoint (потрібен доступ «за посиланням»).
 */

const DEFAULT_SPREADSHEET_ID = '1tSZ4_HNBOKTiQ_6XiUTjTlhuiTDv2XihLfHfpMaQxHM';

/** Назви вкладок Google Sheets для всіх місяців 2026 (серпень — скорочено «Серп», як у таблиці). */
const DEFAULT_SHEET_NAMES_2026 = [
  '2026 Січень',
  '2026 Лютий',
  '2026 Березень',
  '2026 Квітень',
  '2026 Травень',
  '2026 Червень',
  '2026 Липень',
  '2026 Серп',
  '2026 Вересень',
  '2026 Жовтень',
  '2026 Листопад',
  '2026 Грудень',
];

function cellValue(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object' && 'v' in cell) {
    const v = cell.v;
    if (v == null) return '';
    if (typeof v === 'string' && v.startsWith('Date(')) {
      const m = /^Date\((\d+),(\d+),(\d+)\)$/.exec(v.trim());
      if (m) return new Date(Number(m[1]), Number(m[2]), Number(m[3]));
    }
    return v;
  }
  return cell;
}

function parseGvizResponse(text) {
  const raw = String(text || '').trim();
  const jsonText = raw.replace(/^[^(]*google\.visualization\.Query\.setResponse\(/, '').replace(/\);\s*$/, '');
  const data = JSON.parse(jsonText);
  const rows = data?.table?.rows || [];
  return rows.map((row) => {
    const cells = row.c || [];
    return {
      description: String(cellValue(cells[0]) || '').trim(),
      priorityLabel: String(cellValue(cells[1]) || '').trim(),
      requesterName: String(cellValue(cells[2]) || '').trim(),
      statusLabel: String(cellValue(cells[3]) || '').trim(),
      startDate: cellValue(cells[4]) instanceof Date ? cellValue(cells[4]) : null,
      endDate: cellValue(cells[5]) instanceof Date ? cellValue(cells[5]) : null,
      objectLabel: String(cellValue(cells[6]) || '').trim(),
      results: String(cellValue(cells[7]) || '').trim(),
      notes: String(cellValue(cells[8]) || '').trim(),
    };
  });
}

async function fetchGoogleSheetRows(spreadsheetId, sheetName) {
  const id = String(spreadsheetId || DEFAULT_SPREADSHEET_ID).trim();
  const sheet = encodeURIComponent(String(sheetName || '').trim());
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DTS-Procurement-Import/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Google Sheets: HTTP ${res.status} для вкладки «${sheetName}»`);
  }
  const text = await res.text();
  return parseGvizResponse(text);
}

function mapPriority(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('1 доб')) return '1_workday';
  if (s.includes('7 діб') || s.includes('7 дib')) return '7_workdays';
  if (s.includes('більше 7')) return 'more_than_7_workdays';
  if (s.includes('3 діб') || s.includes('3 дib')) return '5_workdays';
  if (s.includes('5 діб') || s.includes('5 дib')) return '5_workdays';
  return '5_workdays';
}

function inferPayerCompany(...texts) {
  const blob = texts.join(' ').toLowerCase();
  if (/дарекс|dareks|енерго|энерго|dar.?ex/.test(blob)) return 'dareks_energo';
  return 'dts';
}

function inferApplicationKind(...texts) {
  const blob = texts.join(' ').toLowerCase();
  if (/проставити цін|кошторис|визначення цін|price/.test(blob)) return 'price_determination';
  return 'purchase';
}

function mapStatus(label) {
  const s = String(label || '').trim().toLowerCase();
  if (s.includes('заверш')) return 'completed';
  if (s.includes('заблок')) return 'blocked';
  if (s.includes('в робот') || s.includes('робот')) return 'in_progress';
  if (s.includes('склад') || s.includes('відвантаж') || s.includes('очіку')) return 'awaiting_warehouse';
  return 'pending_review';
}

function parseQuantityFromText(text) {
  const s = String(text || '');
  const m =
    s.match(/(\d+(?:[.,]\d+)?)\s*шт/i) ||
    s.match(/(\d+(?:[.,]\d+)?)\s*л\b/i) ||
    s.match(/[-—]\s*(\d+(?:[.,]\d+)?)\s*шт/i);
  if (!m) return null;
  const n = parseFloat(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function buildImportNotes(row, sheetName, rowIndex, status) {
  const parts = [];
  const statusLabel = String(row.statusLabel || '').trim();
  if (status === 'blocked' && statusLabel) {
    parts.push(`Статус у Google Sheets: ${statusLabel}`);
  }
  if (row.results && !/^file$/i.test(row.results)) parts.push(`Результат: ${row.results}`);
  if (row.notes) parts.push(row.notes);
  parts.push(`[Імпорт Google Sheets: ${sheetName}, рядок ${rowIndex + 2}]`);
  return parts.join('\n').slice(0, 50000);
}

function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function resolveRequesterUser(User, requesterName, fallbackLogin) {
  const name = String(requesterName || '').trim();
  if (name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byName = await User.findOne({ name: new RegExp(`^${esc}$`, 'i') }).lean();
    if (byName) return { login: byName.login, name: byName.name || name };
    const partial = await User.findOne({ name: new RegExp(esc.split(/\s+/)[0], 'i') }).lean();
    if (partial) return { login: partial.login, name: partial.name || name };
  }
  const fb = String(fallbackLogin || 'admin').trim();
  const fbUser = await User.findOne({ login: fb }).lean();
  return {
    login: fbUser?.login || fb,
    name: name || fbUser?.name || fb,
  };
}

function mapRowToProcurementDoc(row, ctx) {
  const {
    sheetName,
    rowIndex,
    spreadsheetId,
    requester,
    executorLogin,
    executorName,
    uomDefault,
  } = ctx;

  const description = row.description;
  if (!description) return null;

  const status = mapStatus(row.statusLabel);
  const qty = parseQuantityFromText(`${description} ${row.notes}`);
  const importSourceKey = `gsheet:${spreadsheetId}:${sheetName}:${rowIndex + 2}:${normalizeNameKey(description).slice(0, 120)}`;

  const notes = buildImportNotes(row, sheetName, rowIndex, status);
  const payerCompany = inferPayerCompany(row.notes, row.results, description);
  const applicationKind = inferApplicationKind(row.notes, description);

  const doc = {
    importSourceKey,
    receiptOutcome: status === 'completed' ? 'full' : 'pending',
    applicationKind,
    payerCompany,
    priority: mapPriority(row.priorityLabel),
    status,
    requesterLogin: requester.login,
    requesterName: requester.name,
    desiredWarehouse: row.objectLabel || '—',
    actualWarehouse: row.objectLabel || '',
    notes,
    materials: [
      {
        name: description,
        unitOfMeasure: uomDefault || 'шт.',
        quantity: qty,
        initialQuantity: qty,
        price: null,
        productId: null,
        actualWarehouse: row.objectLabel || '',
        receivedQuantity: status === 'completed' ? qty : null,
      },
    ],
    attachments: [],
    executorAttachments: [],
  };

  if (status === 'completed') {
    doc.executorLogin = executorLogin || '';
    doc.executorName = executorName || 'Міграція Google Sheets';
    doc.executorCompletedAt = row.endDate || row.startDate || new Date();
    doc.warehouseReceivedAt = row.endDate || null;
  }

  const createdAt = row.startDate || row.endDate || new Date();
  doc.createdAt = createdAt;
  doc.updatedAt = row.endDate || createdAt;

  return doc;
}

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.ProcurementRequest
 * @param {import('mongoose').Model} deps.User
 * @param {import('mongoose').Model} deps.ProcurementCounter
 * @param {function} deps.getNextProcurementRequestNumber
 * @param {function} [deps.getUnitsOfMeasureList]
 */
async function importProcurementFromGoogleSheet(deps, options = {}) {
  const {
    spreadsheetId = DEFAULT_SPREADSHEET_ID,
    sheetNames = [],
    dryRun = false,
    fallbackRequesterLogin = 'admin',
    executorLogin = '',
    executorName = 'Міграція Google Sheets',
    skipExisting = true,
  } = options;

  let sheets = Array.isArray(sheetNames) ? sheetNames.filter(Boolean) : [];
  if (!sheets.length) {
    sheets = [...DEFAULT_SHEET_NAMES_2026];
  }

  const uomList = deps.getUnitsOfMeasureList ? await deps.getUnitsOfMeasureList() : ['шт.'];
  const uomDefault = uomList[0] || 'шт.';

  const summary = {
    spreadsheetId,
    sheets: [],
    totalRows: 0,
    imported: 0,
    skipped: 0,
    skippedExisting: 0,
    byStatus: {
      completed: 0,
      blocked: 0,
      pending_review: 0,
      in_progress: 0,
      awaiting_warehouse: 0,
      partially_fulfilled: 0,
    },
    errors: [],
  };

  for (const sheetName of sheets) {
    const sheetStat = { sheetName, rows: 0, imported: 0, skipped: 0, skippedExisting: 0 };
    let rows;
    try {
      rows = await fetchGoogleSheetRows(spreadsheetId, sheetName);
    } catch (e) {
      summary.errors.push({ sheetName, error: e.message });
      summary.sheets.push(sheetStat);
      continue;
    }

    sheetStat.rows = rows.length;
    summary.totalRows += rows.length;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.description) {
        sheetStat.skipped += 1;
        summary.skipped += 1;
        continue;
      }

      const requester = await resolveRequesterUser(deps.User, row.requesterName, fallbackRequesterLogin);
      const mapped = mapRowToProcurementDoc(row, {
        sheetName,
        rowIndex: i,
        spreadsheetId,
        requester,
        executorLogin,
        executorName,
        uomDefault,
      });
      if (!mapped) {
        sheetStat.skipped += 1;
        summary.skipped += 1;
        continue;
      }

      if (skipExisting && mapped.importSourceKey) {
        const exists = await deps.ProcurementRequest.findOne({ importSourceKey: mapped.importSourceKey })
          .select('_id requestNumber')
          .lean();
        if (exists) {
          sheetStat.skippedExisting += 1;
          summary.skippedExisting += 1;
          continue;
        }
      }

      if (mapped.status && summary.byStatus[mapped.status] != null) {
        summary.byStatus[mapped.status] += 1;
      }

      if (dryRun) {
        sheetStat.imported += 1;
        summary.imported += 1;
        continue;
      }

      try {
        const requestNumber = await deps.getNextProcurementRequestNumber();
        const { createdAt, updatedAt, importSourceKey, ...rest } = mapped;
        await deps.ProcurementRequest.create({
          ...rest,
          requestNumber,
          importSourceKey,
          createdAt,
          updatedAt,
        });
        sheetStat.imported += 1;
        summary.imported += 1;
      } catch (e) {
        summary.errors.push({
          sheetName,
          row: i + 2,
          description: row.description.slice(0, 80),
          error: e.message,
        });
      }
    }

    summary.sheets.push(sheetStat);
  }

  return summary;
}

module.exports = {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_SHEET_NAMES_2026,
  fetchGoogleSheetRows,
  parseGvizResponse,
  importProcurementFromGoogleSheet,
};
