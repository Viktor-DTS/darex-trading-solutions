/**
 * Парсер звіту 1С «Ведомость по товарам на складах» (УТП 1.2).
 *
 * На відміну від «Анализ доступности» (stockXlsxImport.js), цей звіт містить ОДРАЗУ:
 *   1) поточні залишки (колонка «Конечный остаток» на рядку номенклатури);
 *   2) реальний рух по документах (регістратор + контрагент/відповідальний/склади/сума…).
 *
 * Структура аркуша (TDSheet): багаторівневий заголовок, далі дані з групуванням
 *   Склад → Номенклатура → СерияНоменклатуры → Документ движения (регистратор).
 * Усі рівні групування друкуються в одній колонці («Документ движения (регистратор)»),
 * тому рівень визначаємо за супутніми ознаками (наявність од.виміру, дати документа, метаданих).
 *
 * Модуль лише ПАРСИТЬ файл у структуру. Запис у БД (Equipment/OneCMovement) — у роуті імпорту.
 */
const XLSX = require('xlsx');

/** Заголовки метаданих рядка руху (як у дод.полях звіту). */
const HEADER_LABELS = {
  paymentDate: 'Дата оплаты',
  contractor: 'Контрагент',
  responsible: 'Ответственный',
  department: 'Подразделение',
  posted: 'Проведен',
  warehouse: 'Склад',
  registrar: 'Документ движения (регистратор)',
  fromWarehouse: 'Склад отправитель',
  toWarehouse: 'Склад получатель',
  comment: 'Комментарий',
  manager: 'Ответственный менеджер',
  docSum: 'Сумма документа',
  currency: 'Валюта документа',
};

/** Назва схожа на фізичний склад (а не серійний номер / підзвітну особу). */
const WAREHOUSE_NAME_RE = /(склад|солюшн|дарекс|главн)/i;
const DATE_RE = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/;

function cellStr(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function hasNum(v) {
  return cellStr(v) !== '' && Number.isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.')));
}

/**
 * Класифікація типу операції за назвою документа-регістратора.
 */
function classifyOperation(registrar) {
  const t = cellStr(registrar);
  if (/^Реализац/i.test(t)) return 'sale';
  if (/^Поступл/i.test(t)) return 'receipt';
  if (/^Перемещ/i.test(t)) return 'move';
  if (/^Комплектац/i.test(t)) return 'assembly';
  if (/^(Списан)/i.test(t)) return 'writeoff';
  if (/^Возврат/i.test(t)) return 'return';
  if (/^(Инвентар|Оприход|Пересорт)/i.test(t)) return 'inventory';
  if (/^Заказ/i.test(t)) return 'order';
  if (/^(Авансов|Корректир|Счет)/i.test(t)) return 'finance';
  return 'other';
}

/**
 * Розбір рядка-регістратора: "Реализация товаров и услуг 99,, от 29.05.2026 14:21:32"
 * → { docType, docNumber, docDateRaw, docDate }
 */
function parseRegistrar(registrar) {
  const raw = cellStr(registrar);
  const m = raw.match(/\sот\s+(\d{2}\.\d{2}\.\d{4}(?:\s+\d{1,2}:\d{2}:\d{2})?)/i);
  let docDateRaw = '';
  let left = raw;
  if (m) {
    docDateRaw = m[1].trim();
    left = raw.slice(0, m.index).trim();
  }
  // приберемо хвостові коми/пробіли ("99 ,," → "99")
  left = left.replace(/[\s,]+$/g, '');
  const tokens = left.split(/\s+/);
  let docNumber = '';
  let typePhrase = left;
  if (tokens.length > 1) {
    docNumber = tokens[tokens.length - 1].replace(/[,]+$/g, '');
    typePhrase = tokens.slice(0, -1).join(' ');
  }
  return {
    docType: classifyOperation(raw),
    docTypeName: typePhrase,
    docNumber,
    docDateRaw,
    docDate: parseDate(docDateRaw),
  };
}

function parseDate(s) {
  const m = cellStr(s).match(DATE_RE);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Пошук рядка заголовка таблиці (де є «Начальный остаток»/«Конечный остаток»)
 * та визначення індексів колонок.
 */
function detectColumns(rows) {
  let hdrRow = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || [];
    const joined = r.map(cellStr);
    if (joined.includes('Начальный остаток') && joined.includes('Конечный остаток')) {
      hdrRow = i;
      break;
    }
  }
  if (hdrRow < 0) {
    throw new Error('Не знайдено заголовок «Ведомости» (рядок з «Начальный остаток»/«Конечный остаток»).');
  }

  const header = (rows[hdrRow] || []).map(cellStr);
  const idx = {};
  for (const [key, label] of Object.entries(HEADER_LABELS)) {
    idx[key] = header.indexOf(label);
  }

  // Колонки балансу: беремо ПРАВИЙ блок (Итог) — стійко і для дубльованих колонок
  // (групування «Регистратор.Стоимость»), і для майбутнього звіту з одним блоком.
  const openingCols = header.map((h, i) => (h === 'Начальный остаток' ? i : -1)).filter((i) => i >= 0);
  const closingCols = header.map((h, i) => (h === 'Конечный остаток' ? i : -1)).filter((i) => i >= 0);
  const openingIdx = openingCols[openingCols.length - 1];
  const closingIdx = closingCols[closingCols.length - 1];
  idx.opening = openingIdx;
  idx.incoming = openingIdx + 1;
  idx.outgoing = openingIdx + 2;
  idx.closing = closingIdx;

  // Одиниця виміру («Базовая единица измерения») — у верхньому рівні заголовка, над колонкою регістратора.
  let unitIdx = -1;
  for (let i = Math.max(0, hdrRow - 4); i <= hdrRow; i++) {
    const r = (rows[i] || []).map(cellStr);
    const ci = r.findIndex((c) => /Базовая единица/i.test(c));
    if (ci >= 0) unitIdx = ci;
  }
  if (unitIdx < 0 && idx.registrar >= 0) unitIdx = idx.registrar + 1;
  idx.unit = unitIdx;

  return { hdrRow, idx };
}

function readMeta(row, idx) {
  return {
    paymentDate: parseDate(row[idx.paymentDate]),
    contractor: cellStr(row[idx.contractor]),
    responsible: cellStr(row[idx.responsible]),
    department: cellStr(row[idx.department]),
    posted: cellStr(row[idx.posted]),
    warehouse: cellStr(row[idx.warehouse]),
    fromWarehouse: cellStr(row[idx.fromWarehouse]),
    toWarehouse: cellStr(row[idx.toWarehouse]),
    comment: cellStr(row[idx.comment]),
    manager: cellStr(row[idx.manager]),
    docSum: hasNum(row[idx.docSum]) ? num(row[idx.docSum]) : null,
    currency: cellStr(row[idx.currency]),
  };
}

function hasAnyMeta(meta) {
  return !!(
    meta.contractor ||
    meta.responsible ||
    meta.department ||
    meta.posted ||
    meta.warehouse ||
    meta.fromWarehouse ||
    meta.toWarehouse ||
    meta.comment ||
    meta.manager ||
    meta.docSum !== null ||
    meta.currency ||
    meta.paymentDate
  );
}

function extractPeriod(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || [];
    for (const c of r) {
      const s = cellStr(c);
      const m = s.match(/Период:\s*(.+)$/i);
      if (m) return m[1].trim();
    }
  }
  return '';
}

/**
 * Головний розбір. Повертає { period, columns, warehouses, balances, movements }.
 */
function parseVedomostRows(rows) {
  const { hdrRow, idx } = detectColumns(rows);
  if (idx.registrar < 0) {
    throw new Error('Не знайдено колонку «Документ движения (регистратор)».');
  }
  const REG = idx.registrar;
  const period = extractPeriod(rows);

  const balances = [];
  const movements = [];
  const warehouseGrouping = new Set();
  const warehouseInCol6 = new Set();
  const senders = new Set();
  const receivers = new Set();

  let currentWarehouse = null;
  let currentNome = null;
  let currentUnit = '';
  let currentSerial = '';

  for (let i = hdrRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const c7 = cellStr(row[REG]);
    const unit = idx.unit >= 0 ? cellStr(row[idx.unit]) : '';
    const meta = readMeta(row, idx);

    if (/^Итог$/i.test(c7) || /^Итог$/i.test(cellStr(row[idx.paymentDate]))) {
      break; // фінальний підсумок
    }
    if (meta.warehouse) warehouseInCol6.add(meta.warehouse);
    if (meta.fromWarehouse) senders.add(meta.fromWarehouse);
    if (meta.toWarehouse) receivers.add(meta.toWarehouse);

    const isDocRow = DATE_RE.test(c7) || (hasAnyMeta(meta) && !unit);

    if (unit) {
      // Рядок НОМЕНКЛАТУРИ → поточний залишок = Конечный остаток
      currentNome = c7;
      currentUnit = unit;
      currentSerial = '';
      balances.push({
        warehouse: currentWarehouse,
        nomenclature: c7,
        unit,
        opening: num(row[idx.opening]),
        incoming: num(row[idx.incoming]),
        outgoing: num(row[idx.outgoing]),
        closing: num(row[idx.closing]),
      });
      continue;
    }

    if (isDocRow) {
      // Рядок РУХУ по документу
      const reg = parseRegistrar(c7);
      const incoming = num(row[idx.incoming]);
      const outgoing = num(row[idx.outgoing]);
      const direction = outgoing > 0 ? 'out' : incoming > 0 ? 'in' : 'none';
      const qty = outgoing > 0 ? outgoing : incoming;
      movements.push({
        warehouse: meta.warehouse || currentWarehouse,
        nomenclature: currentNome,
        unit: currentUnit,
        serial: currentSerial || null,
        ...reg,
        registrarRaw: c7,
        posted: meta.posted,
        contractor: meta.contractor,
        responsible: meta.responsible,
        department: meta.department,
        fromWarehouse: meta.fromWarehouse || null,
        toWarehouse: meta.toWarehouse || null,
        comment: meta.comment,
        manager: meta.manager,
        docSum: meta.docSum,
        currency: meta.currency,
        paymentDate: meta.paymentDate,
        incoming,
        outgoing,
        direction,
        qty,
      });
      continue;
    }

    if (c7) {
      // Рядок з текстом, без од.виміру, без дати, без метаданих:
      // або заголовок СКЛАДУ (верхній рівень), або СЕРІЙНИЙ НОМЕР (під номенклатурою).
      const looksWarehouse =
        currentNome === null || WAREHOUSE_NAME_RE.test(c7) || warehouseInCol6.has(c7);
      if (looksWarehouse) {
        currentWarehouse = c7;
        currentNome = null;
        currentUnit = '';
        currentSerial = '';
        warehouseGrouping.add(c7);
      } else {
        currentSerial = c7;
      }
      continue;
    }
    // порожній col7 без од.виміру — це підсумковий підрядок серії/документа без деталізації, пропускаємо
  }

  // Класифікація знайдених назв складів
  const physical = new Set([...warehouseGrouping, ...warehouseInCol6]);
  const movementParties = new Set([...senders, ...receivers]);
  const onlyParties = [...movementParties].filter((n) => !physical.has(n));

  return {
    period,
    columns: idx,
    warehouses: {
      grouping: [...warehouseGrouping].sort(),
      inCol6: [...warehouseInCol6].sort(),
      senders: [...senders].sort(),
      receivers: [...receivers].sort(),
      physical: [...physical].sort(),
      movementOnly: onlyParties.sort(), // ймовірно МОЛ/підзвіт
      all: [...new Set([...physical, ...movementParties])].sort(),
    },
    balances,
    movements,
  };
}

function parseXlsxBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('У файлі немає аркушів');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  return { sheetName, rows };
}

function parseVedomostBuffer(buffer) {
  const { sheetName, rows } = parseXlsxBuffer(buffer);
  const parsed = parseVedomostRows(rows);
  return { sheetName, ...parsed };
}

/**
 * Оркестрація імпорту «Ведомости»:
 *  - реєструє виявлені назви складів 1С у OneCWarehouseAlias (черга мапінгу);
 *  - будує мапінг назва 1С → наш склад (з Warehouse.oneCNames та з аліасів action=map);
 *  - оновлює Equipment по «Конечный остаток» для прив'язаних фізичних складів;
 *  - пише журнал руху OneCMovement (ідемпотентно за унікальним індексом).
 *
 * @param {object} p
 * @param {import('mongoose').Model} p.Equipment
 * @param {import('mongoose').Model} p.Category
 * @param {import('mongoose').Model} p.Warehouse
 * @param {import('mongoose').Model} p.OneCWarehouseAlias
 * @param {import('mongoose').Model} p.OneCMovement
 * @param {import('mongoose').Model} [p.EventLog]
 * @param {Buffer} p.buffer
 * @param {object} p.adminUser
 * @param {boolean} p.dryRun
 * @param {Record<string,string>} [p.nomenclatureCategoryMapFromDb]
 */
async function runVedomostImport({
  Equipment,
  Category,
  Warehouse,
  OneCWarehouseAlias,
  OneCMovement,
  EventLog,
  buffer,
  adminUser,
  dryRun,
  nomenclatureCategoryMapFromDb,
}) {
  const crypto = require('crypto');
  const stock = require('./stockXlsxImport');

  const parsed = parseVedomostBuffer(buffer);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const now = new Date();

  const rules = stock.loadRules();
  rules.nomenclatureCategoryMap = {
    ...(rules.nomenclatureCategoryMap || {}),
    ...(nomenclatureCategoryMapFromDb || {}),
  };

  const summary = {
    sheetName: parsed.sheetName,
    period: parsed.period,
    fileHash,
    dryRun: !!dryRun,
    warehouses: parsed.warehouses,
    balancesParsed: parsed.balances.length,
    movementsParsed: parsed.movements.length,
    movementsByType: {},
    stock: { created: 0, updated: 0, skipped: 0, unmappedWarehouse: 0 },
    movements: { inserted: 0, duplicates: 0, unmappedWarehouse: 0 },
    aliases: { created: 0, updated: 0 },
    unmappedWarehouses: [],
    warnings: [],
  };
  for (const m of parsed.movements) {
    summary.movementsByType[m.docType] = (summary.movementsByType[m.docType] || 0) + 1;
  }

  // 1) Реєстрація/оновлення аліасів складів
  const physicalSet = new Set(parsed.warehouses.physical);
  for (const name of parsed.warehouses.all) {
    if (!name) continue;
    const kindGuess = physicalSet.has(name) ? 'physical' : 'unknown';
    if (dryRun) {
      const existing = await OneCWarehouseAlias.findOne({ oneCName: name }).lean();
      if (existing) summary.aliases.updated++;
      else summary.aliases.created++;
      continue;
    }
    const existing = await OneCWarehouseAlias.findOne({ oneCName: name });
    if (existing) {
      existing.lastSeenAt = now;
      existing.seenCount = (existing.seenCount || 0) + 1;
      if (existing.kind === 'unknown' && kindGuess === 'physical') existing.kind = 'physical';
      await existing.save();
      summary.aliases.updated++;
    } else {
      await OneCWarehouseAlias.create({
        oneCName: name,
        kind: kindGuess,
        action: 'ignore',
        firstSeenAt: now,
        lastSeenAt: now,
        seenCount: 1,
      });
      summary.aliases.created++;
    }
  }

  // 2) Мапінг назва 1С → наш склад
  //    Джерела: Warehouse.oneCNames (неявно map) + OneCWarehouseAlias(action=map, mappedWarehouseId)
  const warehouseMap = new Map(); // oneCName → { id, name, isStockSource }
  const allWarehouses = await Warehouse.find({}).lean();
  const whById = new Map(allWarehouses.map((w) => [String(w._id), w]));
  for (const w of allWarehouses) {
    for (const nm of w.oneCNames || []) {
      if (nm) warehouseMap.set(nm, { id: String(w._id), name: w.name, isStockSource: w.isStockSource !== false });
    }
  }
  const mappedAliases = await OneCWarehouseAlias.find({ action: 'map', mappedWarehouseId: { $ne: null } }).lean();
  for (const a of mappedAliases) {
    const w = whById.get(String(a.mappedWarehouseId));
    if (w) warehouseMap.set(a.oneCName, { id: String(w._id), name: w.name, isStockSource: w.isStockSource !== false });
  }

  const resolveWh = (name) => (name ? warehouseMap.get(name) || null : null);
  const unmappedSeen = new Set();

  // 3) Оновлення залишків (Equipment) по «Конечный остаток» для прив'язаних фізичних складів
  const categories = await Category.find({}).lean();
  const categoryIndex = stock.buildCategoryIndex(categories);

  for (const b of parsed.balances) {
    const wh = resolveWh(b.warehouse);
    if (!wh) {
      summary.stock.unmappedWarehouse++;
      if (b.warehouse && !unmappedSeen.has(b.warehouse)) unmappedSeen.add(b.warehouse);
      continue;
    }
    if (!wh.isStockSource) {
      summary.stock.skipped++;
      continue;
    }
    const nome = b.nomenclature;
    const qty = Math.max(0, Math.round((b.closing || 0) * 1000) / 1000);
    if (!nome) {
      summary.stock.skipped++;
      continue;
    }
    const batchUnit = b.unit || stock.resolveBatchUnit(nome, rules);
    const { categoryId, itemKind } = stock.resolveCategory(nome, rules, categoryIndex);
    const region = whById.get(wh.id)?.region || '';

    if (dryRun) {
      const existing = await Equipment.findOne(stock.batchSearchQuery(nome, wh.id, region)).lean();
      if (existing) summary.stock.updated++;
      else summary.stock.created++;
      continue;
    }

    const existing = await Equipment.findOne(stock.batchSearchQuery(nome, wh.id, region));
    if (existing) {
      existing.quantity = qty;
      existing.batchUnit = batchUnit;
      if (categoryId) existing.categoryId = categoryId;
      if (itemKind) existing.itemKind = itemKind;
      existing.currentWarehouse = wh.id;
      existing.currentWarehouseName = wh.name;
      existing.region = region;
      existing.status = 'in_stock';
      existing.lastModified = now;
      if (!existing.batchName) existing.batchName = nome;
      await existing.save();
      summary.stock.updated++;
    } else {
      if (qty <= 0) {
        summary.stock.skipped++;
        continue;
      }
      await Equipment.create({
        type: nome,
        isBatch: false,
        quantity: qty,
        batchUnit,
        batchName: nome,
        categoryId: categoryId || null,
        itemKind: itemKind || 'parts',
        addedBy: String(adminUser._id),
        addedByName: adminUser.name || adminUser.login,
        currentWarehouse: wh.id,
        currentWarehouseName: wh.name,
        region,
        status: 'in_stock',
        notes: `Імпорт «Ведомости» 1С (${parsed.sheetName})`,
      });
      summary.stock.created++;
    }
  }

  // 4) Журнал руху OneCMovement (ідемпотентно)
  const movementDocs = [];
  for (const m of parsed.movements) {
    if (m.qty <= 0 || m.direction === 'none') continue;
    const wh = resolveWh(m.warehouse);
    if (!wh) {
      summary.movements.unmappedWarehouse++;
      if (m.warehouse && !unmappedSeen.has(m.warehouse)) unmappedSeen.add(m.warehouse);
    }
    movementDocs.push({
      fileHash,
      importedAt: now,
      importedByLogin: adminUser.login,
      docType: m.docType,
      docTypeName: m.docTypeName,
      docNumber: m.docNumber || '',
      docDate: m.docDate,
      registrarRaw: m.registrarRaw,
      posted: m.posted,
      nomenclature: m.nomenclature,
      unit: m.unit,
      serial: m.serial,
      incoming: m.incoming,
      outgoing: m.outgoing,
      direction: m.direction,
      qty: m.qty,
      warehouse1c: m.warehouse || '',
      warehouseId: wh ? wh.id : null,
      fromWarehouse1c: m.fromWarehouse,
      toWarehouse1c: m.toWarehouse,
      warehouseMapped: !!wh,
      contractor: m.contractor,
      responsible: m.responsible,
      department: m.department,
      manager: m.manager,
      comment: m.comment,
      docSum: m.docSum,
      currency: m.currency,
      paymentDate: m.paymentDate,
    });
  }

  if (!dryRun && movementDocs.length) {
    try {
      const res = await OneCMovement.insertMany(movementDocs, { ordered: false });
      summary.movements.inserted += res.length;
    } catch (err) {
      // дублікати (унікальний індекс) — очікувані при перекритті періодів
      if (err && err.writeErrors) {
        summary.movements.inserted += err.result?.nInserted ?? (movementDocs.length - err.writeErrors.length);
        summary.movements.duplicates += err.writeErrors.length;
      } else if (err && err.code === 11000) {
        summary.movements.duplicates += movementDocs.length;
      } else {
        summary.warnings.push(`OneCMovement insert: ${err.message}`);
      }
    }
  } else if (dryRun) {
    summary.movements.inserted = movementDocs.length;
  }

  summary.unmappedWarehouses = [...unmappedSeen].sort();

  if (!dryRun && EventLog) {
    try {
      await EventLog.create({
        userId: String(adminUser._id),
        userName: adminUser.name || adminUser.login,
        userRole: adminUser.role,
        action: 'import',
        entityType: 'onec-vedomost',
        entityId: 'bulk',
        description: `Імпорт «Ведомости» 1С: залишки +${summary.stock.created}/~${summary.stock.updated}, рух +${summary.movements.inserted} (дублі ${summary.movements.duplicates})`,
        details: {
          period: parsed.period,
          fileHash,
          movementsByType: summary.movementsByType,
          unmappedWarehouses: summary.unmappedWarehouses.slice(0, 50),
        },
      });
    } catch (e) {
      summary.warnings.push(`EventLog: ${e.message}`);
    }
  }

  return summary;
}

module.exports = {
  parseVedomostBuffer,
  parseVedomostRows,
  parseXlsxBuffer,
  classifyOperation,
  parseRegistrar,
  parseDate,
  runVedomostImport,
};

// CLI: node lib/vedomostImport.js "<шлях до .xls>"
if (require.main === module) {
  const fs = require('fs');
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node lib/vedomostImport.js "<path to report .xls/.xlsx>"');
    process.exit(1);
  }
  const buf = fs.readFileSync(file);
  const res = parseVedomostBuffer(buf);
  const opSummary = {};
  for (const m of res.movements) opSummary[m.docType] = (opSummary[m.docType] || 0) + 1;
  console.log('Аркуш:', res.sheetName);
  console.log('Період:', res.period);
  console.log('Колонки (idx):', JSON.stringify(res.columns));
  console.log('Складів (grouping):', res.warehouses.grouping.length, res.warehouses.grouping);
  console.log('Складів (physical):', res.warehouses.physical);
  console.log('Тільки в русі (МОЛ?):', res.warehouses.movementOnly);
  console.log('Залишків (рядків номенклатури):', res.balances.length);
  console.log('Рухів (документів-рядків):', res.movements.length, 'по типах:', opSummary);
  console.log('--- Приклади залишків ---');
  console.log(res.balances.slice(0, 5));
  console.log('--- Приклади рухів ---');
  console.log(
    res.movements.slice(0, 8).map((m) => ({
      type: m.docType,
      num: m.docNumber,
      date: m.docDate,
      nome: m.nomenclature,
      qty: m.qty,
      dir: m.direction,
      from: m.fromWarehouse,
      to: m.toWarehouse,
      contractor: m.contractor,
      sum: m.docSum,
    }))
  );
}
