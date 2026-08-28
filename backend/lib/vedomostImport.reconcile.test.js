/**
 * Звірка залишків з «Ведомости»: нульовий кінцевий залишок / відсутній серійник,
 * дублікати партії з виробником.
 * Запуск: node lib/vedomostImport.reconcile.test.js
 */
const assert = require('assert');
const {
  parseVedomostRows,
  runVedomostImport,
} = require('./vedomostImport');
const {
  batchSearchQuery,
  pickPreferredBatchDoc,
} = require('./stockXlsxImport');

const HEADER = [
  'Дата оплаты',
  'Контрагент',
  'Ответственный',
  'Подразделение',
  'Проведен',
  'Склад',
  'Документ движения (регистратор)',
  'Базовая единица измерения',
  'Склад отправитель',
  'Склад получатель',
  'Комментарий',
  'Ответственный менеджер',
  'Сумма документа',
  'Валюта документа',
  'Начальный остаток',
  'Приход',
  'Расход',
  'Конечный остаток',
];

function emptyPad(n) {
  return Array.from({ length: n }, () => '');
}

function nomeRow(name, unit, opening, incoming, outgoing, closing) {
  return ['', '', '', '', '', '', name, unit, '', '', '', '', '', '', opening, incoming, outgoing, closing];
}

function serialRow(serial, opening, incoming, outgoing, closing) {
  return ['', '', '', '', '', '', serial, serial, '', '', '', '', '', '', opening, incoming, outgoing, closing];
}

function warehouseRow(name) {
  return ['', '', '', '', '', '', name, ...emptyPad(11)];
}

function matchQuery(doc, q) {
  if (!q) return true;
  if (q.type != null && doc.type !== q.type) return false;
  if (typeof q.serialNumber === 'string' && doc.serialNumber !== q.serialNumber) return false;
  if (typeof q.currentWarehouse === 'string' && String(doc.currentWarehouse) !== String(q.currentWarehouse)) {
    return false;
  }
  if (q.currentWarehouse && q.currentWarehouse.$in && !q.currentWarehouse.$in.map(String).includes(String(doc.currentWarehouse))) {
    return false;
  }
  if (q.region != null && doc.region !== q.region) return false;
  if (q.status && q.status.$ne && doc.status === q.status.$ne) return false;
  if (q.status && q.status.$in && !q.status.$in.includes(doc.status || 'in_stock')) return false;
  if (q.isDeleted && q.isDeleted.$ne === true && doc.isDeleted === true) return false;
  if (q.$or) {
    const ok = q.$or.some((clause) => {
      if (Object.prototype.hasOwnProperty.call(clause, 'serialNumber') && clause.serialNumber === null) {
        return !doc.serialNumber;
      }
      if (clause.serialNumber && clause.serialNumber.$exists === false) {
        return doc.serialNumber == null;
      }
      if (clause.serialNumber === '') return !doc.serialNumber;
      return false;
    });
    if (!ok) return false;
  }
  if (q.serialNumber && q.serialNumber.$exists && q.serialNumber.$nin) {
    if (!doc.serialNumber) return false;
  }
  return true;
}

function makeDoc(raw) {
  const doc = { ...raw };
  doc.save = async function save() {
    return this;
  };
  return doc;
}

function leanable(list) {
  const arr = list;
  const p = Promise.resolve(arr);
  p.lean = async () => arr.map((d) => ({ ...d }));
  return p;
}

function makeMocks({ warehouses, equipment }) {
  const eqDocs = equipment.map(makeDoc);
  const Equipment = {
    findOne: async (q) => eqDocs.find((d) => matchQuery(d, q)) || null,
    find: async (q) => eqDocs.filter((d) => matchQuery(d, q)),
    create: async (payload) => {
      const doc = makeDoc({ _id: `new-${eqDocs.length + 1}`, ...payload });
      eqDocs.push(doc);
      return doc;
    },
    _docs: eqDocs,
  };
  const Warehouse = {
    find: () => leanable(warehouses),
  };
  const Category = {
    find: () => leanable([]),
  };
  const OneCWarehouseAlias = {
    findOne: async () => null,
    find: () => leanable([]),
    create: async () => ({}),
  };
  const OneCMovement = {
    bulkWrite: async () => ({ upsertedCount: 0, modifiedCount: 0, matchedCount: 0 }),
  };
  return { Equipment, Warehouse, Category, OneCWarehouseAlias, OneCMovement, eqDocs };
}

async function runImport(buffer, mocks) {
  return runVedomostImport({
    ...mocks,
    buffer,
    adminUser: { _id: 'u1', login: 'admin', name: 'Admin', role: 'admin' },
    dryRun: false,
    fileName: 'test.xlsx',
    trigger: 'test',
  });
}

function xlsxFromRows(rows) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'TDSheet');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function testParseZeroSerialStaysInBalances() {
  const rows = [
    ['Период: 24.08.2026 - 28.08.2026'],
    [],
    HEADER,
    warehouseRow('СКЛАД КИЕВ СОЛЮШН'),
    nomeRow('Дизель-генератор DE-35BDS', 'шт', 1, 0, 1, 0),
    serialRow('20251203003', 1, 0, 1, 0),
  ];
  const parsed = parseVedomostRows(rows);
  const serials = parsed.balances.filter((b) => b.serial === '20251203003');
  assert.strictEqual(serials.length, 1, 'серійний рядок з closing=0 має потрапити в balances');
  assert.strictEqual(serials[0].closing, 0);
  console.log('OK: parse keeps serial with closing 0');
}

function testPickPreferredKeepsManufacturer() {
  const preferred = pickPreferredBatchDoc([
    { _id: 'a', manufacturer: '', type: 'Дизель-генератор GDG7000EC' },
    { _id: 'b', manufacturer: 'Genpower', type: 'Дизель-генератор GDG7000EC' },
  ]);
  assert.strictEqual(preferred._id, 'b');
  const q = batchSearchQuery('Дизель-генератор GDG7000EC', 'wh1', 'Київ');
  assert.ok(!JSON.stringify(q).includes('"region"'), 'batchSearchQuery не фільтрує region');
  console.log('OK: preferred batch keeps manufacturer; search ignores manufacturer');
}

async function testWriteOffZeroSerial() {
  const rows = [
    ['Период: 24.08.2026 - 28.08.2026'],
    [],
    HEADER,
    warehouseRow('СКЛАД КИЕВ СОЛЮШН'),
    nomeRow('Дизель-генератор DE-35BDS', 'шт', 1, 0, 1, 0),
    serialRow('20251203003', 1, 0, 1, 0),
  ];
  const mocks = makeMocks({
    warehouses: [
      {
        _id: 'wh-kyiv-dts',
        name: 'Склад Київ ДТС',
        region: 'Київ',
        oneCNames: ['СКЛАД КИЕВ СОЛЮШН'],
        isStockSource: true,
      },
    ],
    equipment: [
      {
        _id: 'ghost',
        type: 'Дизель-генератор DE-35BDS',
        serialNumber: '20251203003',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-dts',
        currentWarehouseName: 'Склад Київ ДТС',
        region: 'Київ',
      },
    ],
  });
  const summary = await runImport(xlsxFromRows(rows), mocks);
  const ghost = mocks.eqDocs.find((d) => d._id === 'ghost');
  assert.strictEqual(ghost.status, 'written_off', 'серійник з closing=0 має бути списаний');
  assert.strictEqual(ghost.quantity, 0);
  assert.ok(summary.stock.removed >= 1, `removed=${summary.stock.removed}`);
  console.log('OK: zero closing serial is written off');
}

async function testReconcileMissingSerialNotInFile() {
  const rows = [
    ['Период: 24.08.2026 - 28.08.2026'],
    [],
    HEADER,
    warehouseRow('СКЛАД КИЕВ СОЛЮШН'),
    nomeRow('Дизель-генератор DE-35BDS', 'шт', 1, 0, 0, 1),
    serialRow('20251203002', 1, 0, 0, 1),
  ];
  const mocks = makeMocks({
    warehouses: [
      {
        _id: 'wh-kyiv-dts',
        name: 'Склад Київ ДТС',
        region: 'Київ',
        oneCNames: ['СКЛАД КИЕВ СОЛЮШН'],
        isStockSource: true,
      },
    ],
    equipment: [
      {
        _id: 'keep',
        type: 'Дизель-генератор DE-35BDS',
        serialNumber: '20251203002',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-dts',
        region: 'Київ',
      },
      {
        _id: 'ghost',
        type: 'Дизель-генератор DE-35BDS',
        serialNumber: '20251203003',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-dts',
        region: 'Київ',
      },
    ],
  });
  const summary = await runImport(xlsxFromRows(rows), mocks);
  const keep = mocks.eqDocs.find((d) => d._id === 'keep');
  const ghost = mocks.eqDocs.find((d) => d._id === 'ghost');
  assert.strictEqual(keep.status, 'in_stock');
  assert.strictEqual(ghost.status, 'written_off', 'серійник, якого немає у файлі, знімається');
  assert.ok(summary.stock.removed >= 1);
  console.log('OK: serial absent from snapshot is written off; present serial stays');
}

async function testBatchDuplicateManufacturer() {
  const rows = [
    ['Период: 24.08.2026 - 28.08.2026'],
    [],
    HEADER,
    warehouseRow('СКЛАД КИЕВ'),
    nomeRow('Дизель-генератор GDG7000EC', 'шт', 1, 0, 0, 1),
    nomeRow('Дизель-генератор TMG DG11000TE', 'шт', 1, 0, 0, 1),
  ];
  const mocks = makeMocks({
    warehouses: [
      {
        _id: 'wh-kyiv-energy',
        name: 'Склад Київ Дарекс Енерго',
        region: 'Київ',
        oneCNames: ['СКЛАД КИЕВ'],
        isStockSource: true,
      },
    ],
    equipment: [
      {
        _id: 'gdg-brand',
        type: 'Дизель-генератор GDG7000EC',
        manufacturer: 'Genpower',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-energy',
        region: 'Київ',
      },
      {
        _id: 'gdg-empty',
        type: 'Дизель-генератор GDG7000EC',
        manufacturer: '',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-energy',
        region: 'Київ',
      },
      {
        _id: 'tmg-brand',
        type: 'Дизель-генератор TMG DG11000TE',
        manufacturer: 'TMG Power',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-energy',
        region: 'Київ',
      },
      {
        _id: 'tmg-empty',
        type: 'Дизель-генератор TMG DG11000TE',
        manufacturer: '',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-energy',
        region: 'Київ',
      },
    ],
  });
  const summary = await runImport(xlsxFromRows(rows), mocks);
  const gdgBrand = mocks.eqDocs.find((d) => d._id === 'gdg-brand');
  const gdgEmpty = mocks.eqDocs.find((d) => d._id === 'gdg-empty');
  const tmgBrand = mocks.eqDocs.find((d) => d._id === 'tmg-brand');
  const tmgEmpty = mocks.eqDocs.find((d) => d._id === 'tmg-empty');
  const createdDup = mocks.eqDocs.filter((d) => String(d._id).startsWith('new-'));
  assert.strictEqual(gdgBrand.status, 'in_stock');
  assert.strictEqual(gdgBrand.manufacturer, 'Genpower');
  assert.strictEqual(gdgEmpty.status, 'written_off');
  assert.strictEqual(tmgBrand.status, 'in_stock');
  assert.strictEqual(tmgEmpty.status, 'written_off');
  assert.strictEqual(createdDup.length, 0, 'новий рядок без виробника не створюється');
  assert.ok(summary.stock.duplicatesCleared >= 2, `duplicatesCleared=${summary.stock.duplicatesCleared}`);
  console.log('OK: batch duplicates with manufacturer are merged, empty copies written off');
}

async function testBatchAbsentFromSnapshot() {
  const rows = [
    ['Период: 24.08.2026 - 28.08.2026'],
    [],
    HEADER,
    warehouseRow('СКЛАД КИЕВ'),
    nomeRow('Дизель-генератор GDG7000EC', 'шт', 1, 0, 0, 1),
  ];
  const mocks = makeMocks({
    warehouses: [
      {
        _id: 'wh-kyiv-energy',
        name: 'Склад Київ Дарекс Енерго',
        region: 'Київ',
        oneCNames: ['СКЛАД КИЕВ'],
        isStockSource: true,
      },
    ],
    equipment: [
      {
        _id: 'ghost-batch',
        type: 'Дизель-генератор TMG DG11000TE',
        status: 'in_stock',
        quantity: 2,
        currentWarehouse: 'wh-kyiv-energy',
        region: 'Київ',
        notes: 'Імпорт «Ведомости» 1С (TDSheet)',
      },
      {
        _id: 'keep-batch',
        type: 'Дизель-генератор GDG7000EC',
        status: 'in_stock',
        quantity: 1,
        currentWarehouse: 'wh-kyiv-energy',
        region: 'Київ',
      },
    ],
  });
  const summary = await runImport(xlsxFromRows(rows), mocks);
  const ghost = mocks.eqDocs.find((d) => d._id === 'ghost-batch');
  const keep = mocks.eqDocs.find((d) => d._id === 'keep-batch');
  assert.strictEqual(keep.status, 'in_stock');
  assert.strictEqual(ghost.status, 'written_off', 'партія без рядка у знімку має бути списана');
  assert.ok(summary.stock.removed >= 1);
  console.log('OK: batch absent from snapshot is written off');
}

async function testBatchDuplicateWithRegionMismatch() {
  const rows = [
    ['Период: 24.08.2026 - 28.08.2026'],
    [],
    HEADER,
    warehouseRow('СКЛАД КИЕВ СОЛЮШН'),
    nomeRow('Фильтр топл CX 0708', 'шт', 23, 0, 0, 23),
  ];
  const mocks = makeMocks({
    warehouses: [
      {
        _id: 'wh-kyiv-dts',
        name: 'Склад Київ ДТС',
        region: 'Київ',
        oneCNames: ['СКЛАД КИЕВ СОЛЮШН'],
        isStockSource: true,
      },
    ],
    equipment: [
      { _id: 'd1', type: 'Фильтр топл CX 0708', status: 'in_stock', quantity: 40, currentWarehouse: 'wh-kyiv-dts', region: '' },
      { _id: 'd2', type: 'Фильтр топл CX 0708', status: 'in_stock', quantity: 35, currentWarehouse: 'wh-kyiv-dts', region: 'Київський' },
      { _id: 'd3', type: 'Фильтр топл CX 0708', status: 'in_stock', quantity: 38, currentWarehouse: 'wh-kyiv-dts', region: 'Київ' },
      { _id: 'd4', type: 'Фильтр топл CX 0708', status: 'in_stock', quantity: 37, currentWarehouse: 'wh-kyiv-dts', region: '' },
      { _id: 'd5', type: 'Фильтр топл CX 0708', status: 'in_stock', quantity: 36, currentWarehouse: 'wh-kyiv-dts', region: 'Україна' },
      { _id: 'd6', type: 'Фильтр топл CX 0708', status: 'in_stock', quantity: 37, currentWarehouse: 'wh-kyiv-dts', region: '' },
    ],
  });
  const summary = await runImport(xlsxFromRows(rows), mocks);
  const active = mocks.eqDocs.filter((d) => d.status === 'in_stock');
  const written = mocks.eqDocs.filter((d) => d.status === 'written_off');
  assert.strictEqual(active.length, 1, `лишився 1 in_stock, отримано ${active.length}`);
  assert.strictEqual(active[0].quantity, 23);
  assert.strictEqual(active[0].region, 'Київ');
  assert.ok(written.length >= 5, `списано ≥5 дублікатів, от ${written.length}`);
  assert.ok(summary.stock.duplicatesCleared >= 5);
  console.log('OK: region-mismatch batch duplicates deduped to qty from 1C');
}

async function run() {
  testParseZeroSerialStaysInBalances();
  testPickPreferredKeepsManufacturer();
  await testWriteOffZeroSerial();
  await testReconcileMissingSerialNotInFile();
  await testBatchDuplicateManufacturer();
  await testBatchAbsentFromSnapshot();
  await testBatchDuplicateWithRegionMismatch();
  console.log('All reconcile tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
