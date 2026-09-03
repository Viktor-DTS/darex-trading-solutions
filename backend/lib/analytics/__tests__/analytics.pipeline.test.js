/**
 * Перевірка агрегацій аналітики на даних тієї ж «неохайної» форми, що в продакшені:
 * гроші рядками з пробілами й комами, дати ISO-рядками, підтвердження boolean,
 * інженери в слотах 3–6, заявки без жодної читабельної дати.
 *
 * Запуск: node lib/analytics/__tests__/analytics.pipeline.test.js
 */
const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const loose = () => new mongoose.Schema({}, { strict: false });

function registerModels() {
  const names = [
    'Task', 'User', 'InvoiceRequest', 'Sale', 'Client', 'MarketingLead',
    'Equipment', 'ProcurementRequest', 'VedImportRequest', 'WarehouseTransferRequest',
  ];
  for (const name of names) {
    if (!mongoose.models[name]) mongoose.model(name, loose());
  }
}

const YEAR = 2026;
const iso = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dt = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 9, 0, 0));
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

/** Заявки з відомими наперед сумами — щоб перевірити саме розбір значень. */
function seedTasks() {
  const R = 'Київський';
  const C = 'ДАРЕКС';
  return [
    // 1. Гроші числом. Дохід 10000, матеріали 1000, витрати 500 → маржа 8500.
    {
      requestNumber: 'T-001', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: iso(1, 15), date: iso(1, 18),
      autoCreatedAt: dt(YEAR, 1, 15), autoCompletedAt: dt(YEAR, 1, 18),
      autoWarehouseApprovedAt: dt(YEAR, 1, 20), autoAccountantApprovedAt: dt(YEAR, 1, 22),
      serviceTotal: 10000, workPrice: 8500, oilTotal: 1000, transportSum: 500,
      approvedByWarehouse: 'Підтверджено', approvedByAccountant: 'Підтверджено',
      client: 'ТОВ Альфа', work: 'ТО', equipment: 'DE-50BDS', paymentType: 'Безготівка',
      requestAuthor: 'operator1', engineer1: 'Іванов І.', paymentDate: iso(2, 1),
    },
    // 2. Гроші рядком із нерозривним пробілом і комою; підтвердження boolean true.
    {
      requestNumber: 'T-002', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: iso(2, 10), date: iso(2, 12),
      autoCreatedAt: dt(YEAR, 2, 10), autoCompletedAt: dt(YEAR, 2, 12),
      autoWarehouseApprovedAt: dt(YEAR, 2, 13), autoAccountantApprovedAt: dt(YEAR, 2, 14),
      serviceTotal: '12\u00A0524,40', workPrice: '10 000,00', filterSum: '1 200,50',
      approvedByWarehouse: true, approvedByAccountant: true,
      client: 'ТОВ Бета', work: 'Ремонт', equipment: 'DE-100', paymentType: 'Безготівка',
      requestAuthor: 'operator1', engineer1: 'Іванов І.', engineer2: 'Петров П.',
    },
    // 3. Березень — має потрапити у Q1, а не Q2.
    {
      requestNumber: 'T-003', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: iso(3, 5), date: iso(3, 6),
      autoCreatedAt: dt(YEAR, 3, 5), autoCompletedAt: dt(YEAR, 3, 6),
      serviceTotal: '5 000', workPrice: 5000,
      approvedByWarehouse: 'Підтверджено',
      client: 'ТОВ Гама', work: 'ТО', equipment: 'DE-50BDS', paymentType: 'Готівка',
      requestAuthor: 'operator2', engineer5: 'Сидоров С.',
    },
    // 4. Збиткова заявка: витрати більші за дохід.
    {
      requestNumber: 'T-004', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: iso(4, 2), date: iso(4, 3),
      autoCreatedAt: dt(YEAR, 4, 2), autoCompletedAt: dt(YEAR, 4, 3),
      serviceTotal: '1 000', oilTotal: '900', transportSum: '600', perDiem: 200,
      approvedByWarehouse: 'Підтверджено', approvedByAccountant: 'Підтверджено',
      client: 'ТОВ Альфа', work: 'Ремонт', equipment: 'DE-100', paymentType: 'Готівка',
      requestAuthor: 'operator1', engineer1: 'Іванов І.',
    },
    // 4b. Виконано, витрати списані, а суму послуги не вписали. Це не збиток,
    // а незаповнені дані — має піти в окремий зріз, а не в список збиткових.
    {
      requestNumber: 'T-004b', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: iso(4, 10), date: iso(4, 11),
      autoCreatedAt: dt(YEAR, 4, 10), autoCompletedAt: dt(YEAR, 4, 11),
      autoWarehouseApprovedAt: dt(YEAR, 4, 12), autoAccountantApprovedAt: dt(YEAR, 4, 13),
      approvedByWarehouse: 'Підтверджено', approvedByAccountant: 'Підтверджено',
      oilTotal: '400', transportSum: '300',
      client: 'ТОВ Альфа', work: 'ТО', equipment: 'DE-100', paymentType: 'Готівка',
      requestAuthor: 'operator1', engineer1: 'Іванов І.',
    },
    // 5. Зависли в «Заявка» — понад 14 днів без руху. Чотири штуки, щоб перевірити
    // і сам факт виявлення, і поріг «менше 3 не вартує рекомендації».
    {
      requestNumber: 'T-005', status: 'Заявка', serviceRegion: R, company: C,
      requestDate: daysAgo(40), autoCreatedAt: daysAgo(40),
      serviceTotal: '3 000', client: 'ТОВ Дельта', requestAuthor: 'operator1',
    },
    {
      requestNumber: 'T-005b', status: 'Заявка', serviceRegion: R, company: C,
      requestDate: daysAgo(35), autoCreatedAt: daysAgo(35),
      serviceTotal: '1 100', client: 'ТОВ Дельта', requestAuthor: 'operator1',
    },
    {
      requestNumber: 'T-005c', status: 'Заявка', serviceRegion: R, company: C,
      requestDate: daysAgo(22), autoCreatedAt: daysAgo(22),
      serviceTotal: '1 200', client: 'ТОВ Каппа', requestAuthor: 'operator2',
    },
    {
      requestNumber: 'T-005d', status: 'Заявка', serviceRegion: R, company: C,
      requestDate: daysAgo(18), autoCreatedAt: daysAgo(18),
      serviceTotal: '1 300', client: 'ТОВ Каппа', requestAuthor: 'operator2',
    },
    // 5e. Свіжа заявка — 3 дні, зависати не має.
    {
      requestNumber: 'T-005e', status: 'Заявка', serviceRegion: R, company: C,
      requestDate: daysAgo(3), autoCreatedAt: daysAgo(3),
      serviceTotal: '900', client: 'ТОВ Ламбда', requestAuthor: 'operator2',
    },
    // 6. Виконана, склад не підтвердив 20 днів — зависла на складі.
    {
      requestNumber: 'T-006', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: daysAgo(30), date: daysAgo(21),
      autoCreatedAt: daysAgo(30), autoCompletedAt: daysAgo(20),
      serviceTotal: '7 500,25', client: 'ТОВ Епсілон', work: 'ТО',
      requestAuthor: 'operator2', engineer1: 'Петров П.',
    },
    // 7. Інший регіон — не має потрапити у вибірку з фільтром по регіону.
    {
      requestNumber: 'T-007', status: 'Виконано', serviceRegion: 'Львівський', company: C,
      requestDate: iso(5, 5), date: iso(5, 6),
      autoCreatedAt: dt(YEAR, 5, 5), autoCompletedAt: dt(YEAR, 5, 6),
      serviceTotal: '99 999', approvedByWarehouse: 'Підтверджено',
      client: 'ТОВ Захід', work: 'ТО', requestAuthor: 'operator3', engineer1: 'Коваль К.',
    },
    // 8. Попередній рік, той самий регіон — база для YoY.
    {
      requestNumber: 'T-008', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: `${YEAR - 1}-02-10`, date: `${YEAR - 1}-02-12`,
      autoCreatedAt: dt(YEAR - 1, 2, 10), autoCompletedAt: dt(YEAR - 1, 2, 12),
      serviceTotal: '8 000', approvedByWarehouse: 'Підтверджено', approvedByAccountant: 'Підтверджено',
      client: 'ТОВ Альфа', work: 'ТО', requestAuthor: 'operator1', engineer1: 'Іванов І.',
    },
    // 9. Попередній рік, інший регіон — не має впливати на YoY київського регіону.
    {
      requestNumber: 'T-009', status: 'Виконано', serviceRegion: 'Львівський', company: C,
      requestDate: `${YEAR - 1}-03-10`, autoCreatedAt: dt(YEAR - 1, 3, 10),
      serviceTotal: '500 000', approvedByWarehouse: 'Підтверджено',
      client: 'ТОВ Захід', work: 'ТО',
    },
    // 10. Дата зовсім не парситься — заявка не належить жодному періоду.
    {
      requestNumber: 'T-010', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: 'без дати', date: 'н/д',
      serviceTotal: '4 000', client: 'ТОВ Зета',
    },
    // 10b. Дата рядком у форматі DD.MM.YYYY — Mongo її розпізнає, але
    // лексикографічний фільтр по ISO-межах її не ловить. Має бути в періоді.
    // Заявка повністю закрита, щоб не впливати на черги зависань.
    {
      requestNumber: `T-010b`, status: 'Виконано', serviceRegion: R, company: C,
      requestDate: `25.07.${YEAR}`, date: `25.07.${YEAR}`,
      autoCreatedAt: dt(YEAR, 7, 25), autoCompletedAt: dt(YEAR, 7, 25),
      autoWarehouseApprovedAt: dt(YEAR, 7, 26), autoAccountantApprovedAt: dt(YEAR, 7, 27),
      approvedByWarehouse: 'Підтверджено', approvedByAccountant: 'Підтверджено',
      serviceTotal: '2 500', client: 'ТОВ Йота', work: 'ТО', requestAuthor: 'operator2',
      engineer1: 'Петров П.', paymentType: 'Безготівка', paymentDate: iso(7, 28),
    },
    // 11. Заблокована.
    {
      requestNumber: 'T-011', status: 'Заблоковано', serviceRegion: R, company: C,
      requestDate: iso(6, 1), autoCreatedAt: dt(YEAR, 6, 1),
      serviceTotal: '2 000', client: 'ТОВ Ета', blockDetail: 'Немає доступу',
    },
    // 12. Відмова складу.
    {
      requestNumber: 'T-012', status: 'Виконано', serviceRegion: R, company: C,
      requestDate: iso(6, 10), date: iso(6, 11),
      autoCreatedAt: dt(YEAR, 6, 10), autoCompletedAt: dt(YEAR, 6, 11),
      serviceTotal: '1 500', approvedByWarehouse: 'Відмова',
      client: 'ТОВ Тета', work: 'Ремонт', requestAuthor: 'operator1', engineer1: 'Іванов І.',
    },
  ];
}

/** Сума, яку дав би старий клієнтський код через parseFloat. */
function naiveSum(tasks) {
  return tasks
    .filter((t) => t.status === 'Виконано')
    .reduce((s, t) => s + (parseFloat(t.serviceTotal) || 0), 0);
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('analytics_test'));
  registerModels();

  const tasks = seedTasks();
  await mongoose.model('Task').insertMany(tasks);
  await mongoose.model('User').insertMany([
    { login: 'kyiv_head', name: 'Київський керівник', role: 'regional', region: 'Київський' },
    { login: 'boss', name: 'Директор', role: 'admin', region: 'Україна' },
    { login: 'operator1', name: 'Оператор Один', role: 'operator', region: 'Київський' },
    { login: 'operator2', name: 'Оператор Два', role: 'operator', region: 'Київський' },
  ]);
  await mongoose.model('InvoiceRequest').insertMany([
    { requestNumber: 'T-001', status: 'completed', needInvoice: true, createdAt: dt(YEAR, 1, 19), invoiceUploadDate: dt(YEAR, 1, 21) },
    { requestNumber: 'T-006', status: 'pending', needInvoice: true, createdAt: daysAgo(25) },
    { requestNumber: 'T-012', status: 'pending', needAct: true, createdAt: daysAgo(19) },
    { requestNumber: 'T-005', status: 'processing', needInvoice: true, createdAt: daysAgo(12) },
  ]);

  const clientA = new mongoose.Types.ObjectId();
  await mongoose.model('Client').insertMany([
    { _id: clientA, name: 'ТОВ Альфа', region: 'Київський', createdAt: dt(YEAR, 1, 2) },
  ]);
  await mongoose.model('Sale').insertMany([
    {
      clientId: clientA, managerLogin: 'manager1', saleDate: dt(YEAR, 3, 1), status: 'success',
      totalAmount: 250000, managerPremium: 5000, createdAt: dt(YEAR, 2, 1),
      payments: [{ amount: 100000 }], equipmentItems: [{ amount: 250000 }],
    },
    {
      clientId: clientA, managerLogin: 'manager1', saleDate: dt(YEAR, 4, 1), status: 'in_negotiation',
      totalAmount: 90000, createdAt: dt(YEAR, 3, 20), updatedAt: daysAgo(60), payments: [],
    },
    {
      clientId: clientA, managerLogin: 'manager2', saleDate: dt(YEAR, 5, 1), status: 'cancelled',
      totalAmount: 40000, createdAt: dt(YEAR, 4, 25), payments: [],
    },
  ]);
  await mongoose.model('MarketingLead').insertMany([
    { status: 'converted', source: 'website', createdAt: dt(YEAR, 2, 5), assignedManagerLogin: 'manager1', assignedAt: dt(YEAR, 2, 6) },
    { status: 'new', source: 'facebook', createdAt: dt(YEAR, 3, 5) },
    { status: 'rejected', source: 'facebook', createdAt: dt(YEAR, 3, 6) },
  ]);
  await mongoose.model('Equipment').insertMany([
    { type: 'DE-50BDS', status: 'in_stock', region: 'Київський', quantity: 1, batchPriceWithVAT: 500000, currentWarehouseName: 'Київ' },
    { type: 'DE-100', status: 'reserved', region: 'Київський', quantity: 1, batchPriceWithVAT: 0, currentWarehouseName: 'Київ', reservationEndDate: daysAgo(5), reservationClientName: 'ТОВ Альфа' },
    { type: 'Фільтр', status: 'in_stock', region: 'Київський', quantity: 12, batchPriceWithVAT: 250, currentWarehouseName: 'Київ', itemKind: 'parts' },
  ]);
  await mongoose.model('ProcurementRequest').insertMany([
    { requestNumber: 'VZ-001', status: 'completed', priority: '5_workdays', createdAt: dt(YEAR, 2, 1), warehouseReceivedAt: dt(YEAR, 2, 6), materials: [{}, {}], requesterLogin: 'kyiv_head' },
    { requestNumber: 'VZ-002', status: 'blocked', priority: '1_workday', createdAt: daysAgo(30), materials: [{}], requesterLogin: 'kyiv_head' },
  ]);

  const { buildContext } = require('../context');
  const { loadServiceAnalytics } = require('../service');
  const { loadProcessAnalytics } = require('../process');
  const { loadFinanceAnalytics } = require('../finance');
  const { loadSalesAnalytics } = require('../sales');
  const { loadSupplyAnalytics } = require('../supply');
  const { buildInsights } = require('../insights');

  const makeReq = (login, query = {}) => ({ user: { login }, query });

  // ── Область видимості: адміністратор бачить усі регіони ──
  const adminCtx = await buildContext(makeReq('boss', { year: YEAR }));
  const regionalCtx = await buildContext(makeReq('kyiv_head', { year: YEAR }));

  check('регіональний користувач обмежений своїм регіоном', () => {
    assert.strictEqual(regionalCtx.region, 'Київський');
    assert.strictEqual(regionalCtx.scope.canChooseRegion, false);
  });
  check('адміністратор не обмежений регіоном', () => {
    assert.strictEqual(adminCtx.region, null);
    assert.strictEqual(adminCtx.scope.canChooseRegion, true);
  });
  check('регіон з query не може розширити область регіонального користувача', async () => {
    assert.strictEqual(regionalCtx.region, 'Київський');
  });
  const spoofCtx = await buildContext(makeReq('kyiv_head', { year: YEAR, region: 'Львівський' }));
  check('підміна region у query ігнорується для регіонального користувача', () => {
    assert.strictEqual(spoofCtx.region, 'Київський');
  });

  // ── Сервісна аналітика ──
  const service = await loadServiceAnalytics(regionalCtx);
  const kyivDone = tasks.filter((t) => t.serviceRegion === 'Київський' && t.status === 'Виконано');
  const expectedRevenue = 10000 + 12524.40 + 5000 + 1000 + 7500.25 + 1500 + 2500;

  check('дохід розбирає рядки з пробілами та комами', () => {
    assert.ok(
      Math.abs(service.kpi.revenue - expectedRevenue) < 0.01,
      `очікували ${expectedRevenue}, отримали ${service.kpi.revenue}`,
    );
  });
  check('новий розбір відрізняється від наївного parseFloat', () => {
    const naive = naiveSum(kyivDone.filter((t) => t.requestNumber !== 'T-010'));
    assert.ok(
      Math.abs(service.kpi.revenue - naive) > 1000,
      `наївна сума ${naive} не мала б збігатися з ${service.kpi.revenue}`,
    );
  });
  check('заявка іншого регіону не потрапила у вибірку', () => {
    assert.ok(service.kpi.revenue < 99999, 'львівська заявка просочилась у київський зріз');
  });
  check('заявка без читабельної дати не потрапила в період', () => {
    const clients = (service.byClient || []).map((c) => c.name);
    assert.ok(!clients.includes('ТОВ Зета'), 'заявка без дати врахована в періоді');
  });
  check('заявка без читабельної дати підрахована окремо', () => {
    assert.strictEqual(service.dataQuality.undatedTasks, 1);
  });
  check('дата у форматі DD.MM.YYYY все одно потрапляє в період', () => {
    const clients = (service.byClient || []).map((c) => c.name);
    assert.ok(clients.includes('ТОВ Йота'), 'заявка з датою «25.07.2026» втрачена');
  });
  check('нестандартний формат дати підрахований для якості даних', () => {
    assert.ok(
      service.dataQuality.nonIsoDateTasks >= 1,
      `nonIsoDateTasks=${service.dataQuality.nonIsoDateTasks}`,
    );
  });
  check('boolean-підтвердження вважається підтвердженням', () => {
    // T-001, T-004, T-004b (рядок «Підтверджено») + T-002 (boolean true) + T-010b = 5
    assert.strictEqual(service.kpi.approvedFull, 5, `approvedFull=${service.kpi.approvedFull}`);
  });
  check('відмова складу враховується як відмова', () => {
    assert.strictEqual(service.kpi.rejected, 1);
  });
  check('маржа враховує і матеріали, і супутні витрати', () => {
    // T-001: 10000-1000-500=8500; T-004: 1000-900-600-200=-700; T-004b: 0-400-300=-700
    const alfa = service.byClient.find((c) => c.name === 'ТОВ Альфа');
    assert.ok(alfa, 'клієнта ТОВ Альфа немає у зрізі');
    assert.ok(Math.abs(alfa.margin - 7100) < 0.01, `маржа ТОВ Альфа = ${alfa.margin}, очікували 7100`);
  });
  check('інженер у слоті 5 враховується у команді', () => {
    const names = service.byEngineer.map((e) => e.name);
    assert.ok(names.includes('Сидоров С.'), `у команді лише: ${names.join(', ')}`);
  });
  check('частки заявки між двома інженерами дають разом одну заявку', () => {
    const ivanov = service.byEngineer.find((e) => e.name === 'Іванов І.');
    const petrov = service.byEngineer.find((e) => e.name === 'Петров П.');
    assert.ok(ivanov && petrov);
    // T-002 має двох інженерів → по 0.5 кожному. T-004b теж на Іванова.
    assert.ok(Math.abs(ivanov.taskShare - (1 + 0.5 + 1 + 1 + 1)) < 0.01, `taskShare Іванова = ${ivanov.taskShare}`);
  });
  check('YoY-порівняння бере попередній рік того ж регіону', () => {
    assert.ok(
      Math.abs(service.previous.revenue - 8000) < 0.01,
      `минулий рік = ${service.previous.revenue}, очікували 8000 (без львівських 500 000)`,
    );
  });
  check('місячний розріз розкладає дохід по правильних місяцях', () => {
    const jan = service.monthly.find((m) => m.month === 1);
    const feb = service.monthly.find((m) => m.month === 2);
    assert.ok(Math.abs(jan.revenue - 10000) < 0.01, `січень = ${jan.revenue}`);
    assert.ok(Math.abs(feb.revenue - 12524.40) < 0.01, `лютий = ${feb.revenue}`);
  });

  // ── Квартали ──
  const q1Ctx = await buildContext(makeReq('kyiv_head', { year: YEAR, period: 'quarter', quarter: 1 }));
  const q1 = await loadServiceAnalytics(q1Ctx);
  check('березень належить першому кварталу', () => {
    assert.ok(
      Math.abs(q1.kpi.revenue - (10000 + 12524.40 + 5000)) < 0.01,
      `Q1 = ${q1.kpi.revenue}, очікували 27524.40`,
    );
  });

  // ── База дати ──
  const workBasisCtx = await buildContext(makeReq('kyiv_head', { year: YEAR, basis: 'work' }));
  const workBasis = await loadServiceAnalytics(workBasisCtx);
  check('база «дата робіт» дає власну вибірку', () => {
    assert.strictEqual(workBasisCtx.basis.id, 'work');
    assert.ok(workBasis.kpi.tasks > 0);
  });

  // ── Процеси ──
  const processData = await loadProcessAnalytics(regionalCtx);
  check('завислі заявки в статусі «Заявка» знайдені', () => {
    const operator = processData.live.stages.find((s) => s.id === 'operator');
    assert.strictEqual(operator.stuck, 4, `stuck=${operator.stuck}`);
    assert.strictEqual(operator.count, 5, 'свіжа заявка має бути в етапі, але не зависла');
    // Список відсортований за спаданням днів — найстаріша перша.
    assert.strictEqual(processData.stuckByStage.operator[0].number, 'T-005');
  });
  check('свіжа заявка не позначена як зависла', () => {
    const numbers = processData.stuckByStage.operator.map((t) => t.number);
    assert.ok(!numbers.includes('T-005e'), 'заявка віком 3 дні позначена зависшою');
  });
  check('зависла заявка на складі знайдена', () => {
    const wh = processData.live.stages.find((s) => s.id === 'warehouse');
    assert.strictEqual(wh.stuck, 1, `stuck=${wh.stuck}`);
    assert.strictEqual(processData.stuckByStage.warehouse[0].number, 'T-006');
  });
  check('заявка з відмовою не рахується як зависла', () => {
    const all = Object.values(processData.stuckByStage).flat().map((t) => t.number);
    assert.ok(!all.includes('T-012'));
  });
  check('заморожена сума на етапі складу порахована', () => {
    const wh = processData.live.stages.find((s) => s.id === 'warehouse');
    assert.ok(Math.abs(wh.stuckRevenue - 7500.25) < 0.01, `stuckRevenue=${wh.stuckRevenue}`);
  });
  check('воронка періоду і живі черги — різні числа', () => {
    assert.ok(processData.cohort.total > 0, 'когорта порожня');
    assert.ok(processData.live.active > 0, 'живі черги порожні');
    const liveClosed = processData.live.stages.find((s) => s.id === 'closed');
    assert.ok(!liveClosed || liveClosed.count === 0, 'закриті заявки не повинні потрапляти в живі черги');
  });

  // ── Фінанси ──
  const finance = await loadFinanceAnalytics(regionalCtx);
  check('структура собівартості включає транспорт і добові', () => {
    const ids = finance.costStructure.map((c) => c.id);
    assert.ok(ids.includes('transportSum'), 'транспорт відсутній у структурі витрат');
    assert.ok(ids.includes('perDiem'), 'добові відсутні у структурі витрат');
  });
  check('збиткова заявка знайдена', () => {
    assert.ok(finance.losses.list.length >= 1);
    assert.strictEqual(finance.losses.list[0].number, 'T-004');
  });
  check('заявка без суми не рахується збитковою', () => {
    const lossNumbers = finance.losses.list.map((r) => r.number);
    assert.ok(!lossNumbers.includes('T-004b'), 'заявка без суми потрапила у збитки');
    const unbilled = finance.unbilled.list.map((r) => r.number);
    assert.ok(unbilled.includes('T-004b'), 'заявка без суми відсутня в окремому зрізі');
    assert.ok(finance.unbilled.withCost >= 1, 'не порахована заявка без суми, але з витратами');
    assert.ok(finance.unbilled.cost >= 700, `витрати без доходу = ${finance.unbilled.cost}`);
  });
  check('дебіторка рахує лише неоплачені виконані заявки', () => {
    const numbers = finance.receivables.oldest.map((r) => r.number);
    assert.ok(!numbers.includes('T-001'), 'оплачена заявка потрапила в дебіторку');
    assert.ok(numbers.includes('T-006'), 'неоплачена заявка відсутня в дебіторці');
  });
  check('вікові кошики дебіторки заповнені', () => {
    const sum = finance.receivables.buckets.reduce((s, b) => s + b.count, 0);
    assert.strictEqual(sum, finance.receivables.total.count);
  });
  check('прострочені запити на рахунок знайдені', () => {
    assert.ok(finance.invoices.staleOpen >= 2, `staleOpen=${finance.invoices.staleOpen}`);
    assert.ok(finance.invoices.avgTurnaroundDays != null);
  });

  // ── Продажі ──
  const sales = await loadSalesAnalytics(regionalCtx);
  check('успішні угоди та win rate', () => {
    assert.strictEqual(sales.kpi.won, 1);
    assert.ok(Math.abs(sales.kpi.wonAmount - 250000) < 0.01);
    assert.ok(Math.abs(sales.kpi.winRate - 33.33) < 0.5, `winRate=${sales.kpi.winRate}`);
  });
  check('угода без руху понад 30 днів знайдена', () => {
    assert.ok(sales.stalled.length >= 1, 'застигла угода не знайдена');
  });
  check('премія в черзі на нарахування знайдена', () => {
    assert.ok(sales.premiumQueue.length >= 1);
    assert.ok(Math.abs(sales.premiumQueue[0].premium - 5000) < 0.01);
  });
  check('конверсія лідів порахована', () => {
    assert.strictEqual(sales.leads.total, 3);
    assert.strictEqual(sales.leads.converted, 1);
  });

  // ── Склад і закупівлі ──
  const supply = await loadSupplyAnalytics(regionalCtx);
  check('вартість складу враховує кількість партії', () => {
    // 1×500000 + 1×0 + 12×250 = 503000
    assert.ok(Math.abs(supply.equipment.totals.value - 503000) < 0.01, `value=${supply.equipment.totals.value}`);
  });
  check('позиція без ціни підрахована', () => {
    assert.strictEqual(supply.equipment.totals.noPrice, 1);
  });
  check('прострочений резерв знайдений', () => {
    const expired = supply.equipment.expiringReservations.filter((r) => r.expired);
    assert.ok(expired.length >= 1, 'прострочений резерв не знайдено');
  });
  check('заблокована закупівля видна як прострочена', () => {
    assert.ok(supply.procurement.totals.blocked >= 1);
    assert.ok(supply.procurement.totals.staleOpen >= 1);
  });

  // ── Рекомендації ──
  const insights = buildInsights({ service, process: processData, finance, sales, supply }, regionalCtx);
  check('рекомендації сформовані та відсортовані за оцінкою', () => {
    assert.ok(insights.recommendations.length > 0, 'жодної рекомендації');
    const scores = insights.recommendations.map((r) => r.score);
    assert.deepStrictEqual(scores, [...scores].sort((a, b) => b - a), 'рекомендації не відсортовані');
  });
  check('кожна рекомендація має висновок, причину, дії та вибірку', () => {
    for (const r of insights.recommendations) {
      assert.ok(r.title, `${r.id}: немає title`);
      assert.ok(r.finding, `${r.id}: немає finding`);
      assert.ok(r.rootCause, `${r.id}: немає rootCause`);
      assert.ok(Array.isArray(r.actions) && r.actions.length > 0, `${r.id}: немає actions`);
      assert.ok(r.actions.every((a) => a.text && a.owner), `${r.id}: дія без відповідального`);
      assert.ok(r.metric && r.metric.current != null, `${r.id}: немає metric`);
      assert.ok(r.impact && r.impact.text, `${r.id}: немає impact`);
      assert.ok(['critical', 'high', 'medium', 'low'].includes(r.severity), `${r.id}: severity=${r.severity}`);
      assert.ok(['high', 'medium', 'low'].includes(r.confidence), `${r.id}: confidence=${r.confidence}`);
      assert.ok(Number.isFinite(r.sampleSize), `${r.id}: sampleSize=${r.sampleSize}`);
    }
  });
  check('рекомендація про збиткові заявки містить конкретні номери', () => {
    const loss = insights.recommendations.find((r) => r.id === 'finance.loss_makers');
    if (loss) assert.ok(loss.evidence?.items?.length > 0, 'немає доказів');
  });
  check('рекомендація про зависання посилається на етап', () => {
    const stuck = insights.recommendations.filter((r) => r.id.startsWith('process.stuck.'));
    assert.ok(stuck.length >= 1, 'немає рекомендацій про зависання');
    assert.ok(stuck.every((r) => r.link?.stage), 'немає посилання на етап');
  });
  check('оцінка здоров\'я в межах 0..100', () => {
    assert.ok(insights.healthScore >= 0 && insights.healthScore <= 100, `healthScore=${insights.healthScore}`);
  });
  check('немає рекомендацій з мізерної вибірки', () => {
    const tiny = insights.recommendations.filter((r) => r.sampleSize < 3 && r.confidence === 'high');
    assert.strictEqual(tiny.length, 0, `висока впевненість на вибірці < 3: ${tiny.map((r) => r.id).join(', ')}`);
  });

  // ── Адміністратор бачить усі регіони ──
  const adminService = await loadServiceAnalytics(adminCtx);
  check('адміністратор бачить заявки всіх регіонів', () => {
    assert.ok(
      adminService.kpi.revenue > service.kpi.revenue,
      `admin=${adminService.kpi.revenue}, regional=${service.kpi.revenue}`,
    );
  });

  await mongoose.disconnect();
  await mongod.stop();

  const failed = results.filter((r) => !r.ok);
  console.log('');
  for (const r of results) {
    console.log(`${r.ok ? '  PASS' : '  FAIL'}  ${r.name}${r.ok ? '' : `\n        → ${r.error}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} перевірок пройдено\n`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
