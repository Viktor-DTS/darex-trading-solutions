/**
 * Імпорт «ЗАКАЗ ТОВАРОВ !!!.xlsx» — вкладки ДГУ та ЗИП для панелі ВЕД.
 * Джерело на сервері 1С: \\srv1c\Общая\Общие документы\03. ТОВАР\ЗАКАЗ ТОВАРОВ !!!.xlsx
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const SHEET_DGU = 'ДГУ';
const SHEET_ZIP = 'ЗИП';

const SHEET_TYPES = {
  [SHEET_DGU]: 'dgu',
  [SHEET_ZIP]: 'zip',
};

/** Колонки вкладки ДГУ: ключ поля → українська назва для UI */
const DGU_COLUMNS = {
  orderStatus: 'Статус замовлення',
  supplierOrderDate: 'Дата відправки замовлення постачальнику',
  deliveryNumber: 'Номер поставки',
  supplier: 'Постачальник',
  productName: 'Найменування товару',
  arrivalWarehouse: 'Надходження на ДЕ/ДТС/ДГ',
  productCharacteristics: 'Характеристика товару (обладнання)',
  quantity: 'Кількість',
  minSalePrice: 'Мінімальна ціна продажу',
  priceList: 'Прайс',
  productStatus: 'Статус товару',
  destination: 'Призначення (склад або резерв за оплатою)',
  reservedByUntil: 'Ким зарезервовано і до якої дати',
  supplierReadyDate: 'Дата готовності відвантаження від постачальника',
  expectedArrivalDate: 'Дата очікуваного надходження на склад',
  customerShipDeadline: 'Крайній термін відвантаження покупцю',
  arrivalCity: 'Місто надходження замовлення',
  deliveryCity: 'Місто поставки ДГУ',
  customerName: 'Найменування замовника',
  customerPrepayment: 'Наявність передоплати за резерв від замовника',
  notes: 'Примітки',
};

/** Колонки вкладки ЗИП */
const ZIP_COLUMNS = {
  orderStatus: 'Статус замовлення',
  supplierOrderDate: 'Дата відправки замовлення постачальнику',
  deliveryCode: 'Код поставки',
  supplier: 'Постачальник',
  productName: 'Найменування товару',
  quantity: 'Кількість',
  destination: 'Призначення (склад або чий резерв)',
  unitPrice: 'Ціна за шт.',
  productStatus: 'Статус товару',
  expectedArrivalDate: 'Дата очікуваного надходження на склад',
  notes: 'Примітки',
};

const COLUMN_MAP_BY_SHEET = {
  dgu: DGU_COLUMNS,
  zip: ZIP_COLUMNS,
};

const DATE_FIELDS = new Set([
  'supplierOrderDate',
  'supplierReadyDate',
  'expectedArrivalDate',
  'customerShipDeadline',
]);

const DGU_HEADER_MAP = {
  'статус заказа': 'orderStatus',
  'дата отправки заказа поставщику': 'supplierOrderDate',
  'номер поставки': 'deliveryNumber',
  'поставщик': 'supplier',
  'наименование товара': 'productName',
  'приход на де/дтс/дг': 'arrivalWarehouse',
  'характеристика товара (оборудования)': 'productCharacteristics',
  'кол-во': 'quantity',
  'минимальная цена продажи': 'minSalePrice',
  'прайс': 'priceList',
  'статус товара': 'productStatus',
  'назначение (склад или резерв по оплате)': 'destination',
  'кем зарезирвирован и до какой даты': 'reservedByUntil',
  'кем зарезервирован и до какой даты': 'reservedByUntil',
  ' дата готовности  отгрузки от поставщика ': 'supplierReadyDate',
  'дата готовности  отгрузки от поставщика': 'supplierReadyDate',
  'дата готовности отгрузки от поставщика': 'supplierReadyDate',
  'дата ожидаемого прихода на склад': 'expectedArrivalDate',
  'крайняя дата отгрузки покупателю': 'customerShipDeadline',
  'город прихода  заказа ': 'arrivalCity',
  'город прихода заказа': 'arrivalCity',
  'город куда будет поставляться  дгу': 'deliveryCity',
  'город куда будет поставляться дгу': 'deliveryCity',
  'наименование заказчика': 'customerName',
  'наличие предоплаты по резерву от заказчика  ': 'customerPrepayment',
  'наличие предоплаты по резерву от заказчика': 'customerPrepayment',
  'примечания': 'notes',
};

const ZIP_HEADER_MAP = {
  'статус заказа': 'orderStatus',
  'дата отправки заказа поставщику': 'supplierOrderDate',
  'код поставки': 'deliveryCode',
  'поставщик': 'supplier',
  'наименование товара': 'productName',
  'кол-во': 'quantity',
  'назначение (склад или чей резерв )': 'destination',
  'назначение (склад или чей резерв)': 'destination',
  'цена за шт. ': 'unitPrice',
  'цена за шт.': 'unitPrice',
  'статус товара': 'productStatus',
  'дата ожидаемого прихода на склад': 'expectedArrivalDate',
  'примечания ': 'notes',
  'примечания': 'notes',
};

const HEADER_MAP_BY_SHEET = {
  dgu: DGU_HEADER_MAP,
  zip: ZIP_HEADER_MAP,
};

const vedProductOrderSchema = new mongoose.Schema(
  {
    sheetType: { type: String, enum: ['dgu', 'zip'], required: true, index: true },
    rowIndex: { type: Number, required: true },
    importBatchId: { type: String, index: true },
    sourceFile: { type: String, default: '' },
    syncedAt: { type: Date, default: Date.now, index: true },
    orderStatus: { type: String, default: '' },
    supplierOrderDate: { type: Date, default: null },
    deliveryNumber: { type: String, default: '' },
    deliveryCode: { type: String, default: '' },
    supplier: { type: String, default: '' },
    productName: { type: String, default: '', index: true },
    arrivalWarehouse: { type: String, default: '' },
    productCharacteristics: { type: String, default: '' },
    quantity: { type: Number, default: null },
    minSalePrice: { type: String, default: '' },
    priceList: { type: String, default: '' },
    unitPrice: { type: String, default: '' },
    productStatus: { type: String, default: '' },
    destination: { type: String, default: '' },
    reservedByUntil: { type: String, default: '' },
    supplierReadyDate: { type: Date, default: null },
    expectedArrivalDate: { type: Date, default: null },
    customerShipDeadline: { type: Date, default: null },
    arrivalCity: { type: String, default: '' },
    deliveryCity: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerPrepayment: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

vedProductOrderSchema.index({ sheetType: 1, rowIndex: 1 });
vedProductOrderSchema.index({ sheetType: 1, supplier: 1 });
vedProductOrderSchema.index({ sheetType: 1, orderStatus: 1 });

const vedProductOrderImportLogSchema = new mongoose.Schema(
  {
    importedByLogin: String,
    importedByName: String,
    fileName: String,
    fileHash: String,
    trigger: { type: String, default: 'upload' },
    dryRun: { type: Boolean, default: false },
    status: { type: String, enum: ['success', 'error'], default: 'success' },
    error: String,
    dguRows: { type: Number, default: 0 },
    zipRows: { type: Number, default: 0 },
    totalRows: { type: Number, default: 0 },
    importBatchId: String,
    warnings: { type: [String], default: [] },
  },
  { timestamps: true }
);

vedProductOrderImportLogSchema.index({ createdAt: -1 });

let VedProductOrder;
let VedProductOrderImportLog;
try {
  VedProductOrder = mongoose.model('VedProductOrder');
} catch {
  VedProductOrder = mongoose.model('VedProductOrder', vedProductOrderSchema);
}
try {
  VedProductOrderImportLog = mongoose.model('VedProductOrderImportLog');
} catch {
  VedProductOrderImportLog = mongoose.model('VedProductOrderImportLog', vedProductOrderImportLogSchema);
}

function cellStr(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseExcelDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1000 && n < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + Math.round(n) * 86400000);
  }
  const s = cellStr(v);
  if (!s) return null;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseQuantity(v) {
  const s = cellStr(v).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isEmptyDataRow(values) {
  return values.every((v) => cellStr(v) === '');
}

function buildHeaderIndex(headerRow, sheetType) {
  const map = HEADER_MAP_BY_SHEET[sheetType] || {};
  const index = {};
  headerRow.forEach((h, colIdx) => {
    const key = map[normalizeHeader(h)];
    if (key) index[colIdx] = key;
  });
  return index;
}

function rowToDoc(values, headerIndex, sheetType, rowIndex, meta) {
  if (isEmptyDataRow(values)) return null;

  const doc = {
    sheetType,
    rowIndex,
    importBatchId: meta.importBatchId,
    sourceFile: meta.sourceFile,
    syncedAt: meta.syncedAt,
  };

  let hasData = false;
  for (const [colIdx, field] of Object.entries(headerIndex)) {
    const raw = values[Number(colIdx)];
    if (raw === undefined || raw === null || cellStr(raw) === '') continue;
    hasData = true;
    if (DATE_FIELDS.has(field)) {
      doc[field] = parseExcelDate(raw);
    } else if (field === 'quantity') {
      doc[field] = parseQuantity(raw);
    } else {
      doc[field] = cellStr(raw);
    }
  }

  return hasData ? doc : null;
}

function parseSheet(wb, sheetName, sheetType) {
  const sh = wb.Sheets[sheetName];
  if (!sh) return { rows: [], warnings: [`Вкладку «${sheetName}» не знайдено`] };
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
  if (!rows.length) return { rows: [], warnings: [`Вкладка «${sheetName}» порожня`] };

  const headerIndex = buildHeaderIndex(rows[0], sheetType);
  const mappedFields = Object.values(headerIndex);
  const warnings = [];
  if (!mappedFields.length) {
    warnings.push(`На вкладці «${sheetName}» не розпізнано заголовки колонок`);
    return { rows: [], warnings };
  }

  const docs = [];
  for (let i = 1; i < rows.length; i++) {
    const doc = rowToDoc(rows[i], headerIndex, sheetType, i, {
      importBatchId: '',
      sourceFile: '',
      syncedAt: new Date(),
    });
    if (doc) docs.push(doc);
  }
  return { rows: docs, warnings, headerFields: mappedFields };
}

function formatDocForApi(doc) {
  const out = { ...doc };
  for (const field of DATE_FIELDS) {
    if (out[field] instanceof Date) {
      out[`${field}Display`] = out[field].toLocaleDateString('uk-UA');
    }
  }
  if (out.syncedAt instanceof Date) {
    out.syncedAtDisplay = out.syncedAt.toLocaleString('uk-UA');
  }
  return out;
}

async function getProductOrderMeta() {
  const [lastLog, dguCount, zipCount, lastSynced] = await Promise.all([
    VedProductOrderImportLog.findOne({ status: 'success', dryRun: false })
      .sort({ createdAt: -1 })
      .lean(),
    VedProductOrder.countDocuments({ sheetType: 'dgu' }),
    VedProductOrder.countDocuments({ sheetType: 'zip' }),
    VedProductOrder.findOne().sort({ syncedAt: -1 }).select('syncedAt sourceFile').lean(),
  ]);

  return {
    sheets: {
      dgu: { label: 'ДГУ (дизель-генератори)', columns: DGU_COLUMNS, rowCount: dguCount },
      zip: { label: 'ЗИП (запчастини)', columns: ZIP_COLUMNS, rowCount: zipCount },
    },
    lastImport: lastLog
      ? {
          at: lastLog.createdAt,
          fileName: lastLog.fileName,
          dguRows: lastLog.dguRows,
          zipRows: lastLog.zipRows,
          trigger: lastLog.trigger,
          importedByName: lastLog.importedByName,
        }
      : null,
    lastSyncedAt: lastSynced?.syncedAt || null,
    sourceFile: lastSynced?.sourceFile || null,
  };
}

async function queryProductOrders({ sheetType, search, status, supplier, limit = 500, skip = 0 }) {
  const q = { sheetType };
  if (status) q.orderStatus = new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (supplier) q.supplier = new RegExp(supplier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ productName: re }, { supplier: re }, { customerName: re }, { notes: re }, { destination: re }];
  }

  const lim = Math.min(2000, Math.max(1, Number(limit) || 500));
  const sk = Math.max(0, Number(skip) || 0);

  const [rows, total] = await Promise.all([
    VedProductOrder.find(q).sort({ rowIndex: 1 }).skip(sk).limit(lim).lean(),
    VedProductOrder.countDocuments(q),
  ]);

  return {
    rows: rows.map(formatDocForApi),
    total,
    limit: lim,
    skip: sk,
    columns: COLUMN_MAP_BY_SHEET[sheetType] || {},
  };
}

/**
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {string} opts.fileName
 * @param {object} opts.adminUser
 * @param {boolean} [opts.dryRun]
 * @param {string} [opts.trigger]
 */
async function runProductOrderImport(opts) {
  const { buffer, fileName, adminUser, dryRun = false, trigger = 'upload' } = opts;
  if (!buffer || !buffer.length) throw new Error('Порожній файл');

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const importBatchId = crypto.randomUUID();
  const syncedAt = new Date();
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const dguParsed = parseSheet(wb, SHEET_DGU, 'dgu');
  const zipParsed = parseSheet(wb, SHEET_ZIP, 'zip');
  const warnings = [...(dguParsed.warnings || []), ...(zipParsed.warnings || [])];

  const allDocs = [...dguParsed.rows, ...zipParsed.rows].map((doc) => ({
    ...doc,
    importBatchId,
    sourceFile: fileName,
    syncedAt,
  }));

  if (!allDocs.length) {
    throw new Error('У файлі не знайдено жодного рядка даних (вкладки ДГУ та ЗИП)');
  }

  const summary = {
    dryRun: !!dryRun,
    fileName,
    fileHash,
    trigger,
    importBatchId,
    dguRows: dguParsed.rows.length,
    zipRows: zipParsed.rows.length,
    totalRows: allDocs.length,
    warnings,
  };

  if (dryRun) {
    summary.preview = allDocs.slice(0, 5).map(formatDocForApi);
    return summary;
  }

  await VedProductOrder.deleteMany({ sheetType: { $in: ['dgu', 'zip'] } });
  const BATCH = 500;
  for (let i = 0; i < allDocs.length; i += BATCH) {
    await VedProductOrder.insertMany(allDocs.slice(i, i + BATCH), { ordered: false });
  }

  await VedProductOrderImportLog.create({
    importedByLogin: adminUser?.login || 'unknown',
    importedByName: adminUser?.name || adminUser?.login || 'unknown',
    fileName,
    fileHash,
    trigger,
    dryRun: false,
    status: 'success',
    dguRows: dguParsed.rows.length,
    zipRows: zipParsed.rows.length,
    totalRows: allDocs.length,
    importBatchId,
    warnings,
  });

  return summary;
}

module.exports = {
  runProductOrderImport,
  getProductOrderMeta,
  queryProductOrders,
  VedProductOrder,
  VedProductOrderImportLog,
  DGU_COLUMNS,
  ZIP_COLUMNS,
  COLUMN_MAP_BY_SHEET,
  SHEET_DGU,
  SHEET_ZIP,
};
