/**
 * Локальний стенд аналітики: in-memory Mongo із згенерованими даними плюс
 * реальні маршрути /api/analytics. Потрібен, щоб дивитись і правити панель,
 * не маючи доступу до продакшн-бази.
 *
 * Запуск: node lib/analytics/__tests__/devServer.js [порт]
 */
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { registerAnalyticsRoutes } = require('../index');

const PORT = Number(process.argv[2]) || 3001;
const YEAR = new Date().getFullYear();

const loose = () => new mongoose.Schema({}, { strict: false });

const MODELS = [
  'Task', 'User', 'InvoiceRequest', 'Sale', 'Client', 'MarketingLead',
  'Equipment', 'ProcurementRequest', 'VedImportRequest', 'WarehouseTransferRequest',
];

const REGIONS = ['Київський', 'Львівський', 'Одеський', 'Харківський'];
const COMPANIES = ['ДАРЕКС', 'ДТС'];
const CLIENTS = ['ТОВ Агросвіт', 'ПрАТ Метал', 'ТОВ Лідер', 'ФГ Колос', 'ТОВ Будмаш', 'ПП Схід'];
const WORKS = ['ТО', 'Ремонт', 'Діагностика', 'Пусконалагодження', 'Гарантійний ремонт'];
const EQUIPMENT = ['DE-50BDS', 'DE-100', 'DE-150', 'DE-250'];
const ENGINEERS = ['Іванов І.', 'Петров П.', 'Сидоренко С.', 'Коваль К.', 'Мельник М.'];
const OPERATORS = ['operator1', 'operator2', 'operator3'];
const PAYMENTS = ['Безготівка', 'Готівка', 'На карту'];

// Детермінований генератор — щоб стенд щоразу показував ті самі числа.
let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);
const dt = (m, d) => new Date(Date.UTC(YEAR, m - 1, Math.min(d, 28), 9, 0, 0));
const iso = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

/** Суми частково рядками з пробілами й комою — так вони й лежать у продакшені. */
const asMoney = (value) => {
  if (rnd() < 0.4) return value;
  const fixed = value.toFixed(2).replace('.', ',');
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
};

function buildTasks() {
  const tasks = [];
  const monthNow = new Date().getMonth() + 1;

  for (let i = 0; i < 900; i += 1) {
    const month = 1 + Math.floor(rnd() * monthNow);
    const day = 1 + Math.floor(rnd() * 28);
    const region = pick(REGIONS);
    const revenue = Math.round(between(2000, 45000) * 100) / 100;
    const materials = Math.round(revenue * between(0.05, 0.35) * 100) / 100;
    const roll = rnd();

    const base = {
      requestNumber: `${YEAR}-${String(i + 1).padStart(4, '0')}`,
      serviceRegion: region,
      company: pick(COMPANIES),
      client: pick(CLIENTS),
      work: rnd() < 0.9 ? pick(WORKS) : '',
      equipment: rnd() < 0.88 ? pick(EQUIPMENT) : '',
      requestAuthor: rnd() < 0.93 ? pick(OPERATORS) : '',
      requestDate: iso(month, day),
      autoCreatedAt: dt(month, day),
      engineer1: pick(ENGINEERS),
      engineer2: rnd() < 0.3 ? pick(ENGINEERS) : undefined,
      serviceTotal: asMoney(revenue),
      workPrice: asMoney(Math.round((revenue - materials) * 100) / 100),
      oilTotal: asMoney(materials * 0.6),
      filterSum: asMoney(materials * 0.4),
      transportSum: asMoney(between(200, 2500)),
      perDiem: rnd() < 0.5 ? asMoney(between(300, 900)) : 0,
      living: rnd() < 0.2 ? asMoney(between(500, 1800)) : 0,
      serviceBonus: rnd() < 0.4 ? asMoney(between(300, 1500)) : 0,
      paymentType: rnd() < 0.94 ? pick(PAYMENTS) : '',
    };

    if (roll < 0.76) {
      // Виконані заявки: різні комбінації узгоджень, частина неоплачена.
      const workDay = Math.min(day + Math.floor(between(1, 8)), 28);
      const completedAt = dt(month, workDay);
      const whOk = rnd() < 0.88;
      const acOk = whOk && rnd() < 0.85;
      Object.assign(base, {
        status: 'Виконано',
        date: iso(month, workDay),
        autoCompletedAt: rnd() < 0.92 ? completedAt : undefined,
        approvedByWarehouse: whOk ? (rnd() < 0.5 ? 'Підтверджено' : true) : (rnd() < 0.1 ? 'Відмова' : ''),
        autoWarehouseApprovedAt: whOk ? new Date(completedAt.getTime() + between(1, 12) * 86400000) : undefined,
        approvedByAccountant: acOk ? 'Підтверджено' : '',
        autoAccountantApprovedAt: acOk ? new Date(completedAt.getTime() + between(3, 20) * 86400000) : undefined,
        paymentDate: acOk && rnd() < 0.7 ? iso(Math.min(month + 1, 12), day) : undefined,
      });
      if (rnd() < 0.03) base.serviceTotal = 0;
    } else if (roll < 0.87) {
      Object.assign(base, { status: 'Заявка' });
      if (rnd() < 0.35) base.autoCreatedAt = daysAgo(between(15, 60));
    } else if (roll < 0.96) {
      Object.assign(base, { status: 'В роботі', date: iso(month, day) });
      if (rnd() < 0.3) base.autoCreatedAt = daysAgo(between(16, 50));
    } else {
      Object.assign(base, { status: 'Заблоковано' });
    }

    tasks.push(base);
  }

  // Заявки, що зависли на узгодженні саме зараз — інакше черги будуть порожні.
  for (let i = 0; i < 18; i += 1) {
    const completedAt = daysAgo(between(9, 40));
    tasks.push({
      requestNumber: `${YEAR}-W${String(i + 1).padStart(3, '0')}`,
      status: 'Виконано',
      serviceRegion: pick(REGIONS),
      company: pick(COMPANIES),
      client: pick(CLIENTS),
      work: pick(WORKS),
      equipment: pick(EQUIPMENT),
      requestAuthor: pick(OPERATORS),
      engineer1: pick(ENGINEERS),
      requestDate: completedAt.toISOString().slice(0, 10),
      autoCreatedAt: new Date(completedAt.getTime() - 3 * 86400000),
      autoCompletedAt: completedAt,
      date: completedAt.toISOString().slice(0, 10),
      serviceTotal: asMoney(between(8000, 60000)),
      workPrice: asMoney(between(6000, 40000)),
      oilTotal: asMoney(between(500, 4000)),
      transportSum: asMoney(between(400, 2200)),
      approvedByWarehouse: i % 2 === 0 ? '' : 'Підтверджено',
      autoWarehouseApprovedAt: i % 2 === 0 ? undefined : new Date(completedAt.getTime() + 86400000),
      approvedByAccountant: '',
      paymentType: pick(PAYMENTS),
    });
  }

  // Кілька заявок зі збитком і кілька з нечитабельною датою — щоб правила
  // якості даних і збитковості мали на чому спрацювати.
  for (let i = 0; i < 5; i += 1) {
    tasks.push({
      requestNumber: `${YEAR}-L${i + 1}`,
      status: 'Виконано',
      serviceRegion: pick(REGIONS),
      company: pick(COMPANIES),
      client: pick(CLIENTS),
      work: pick(WORKS),
      requestDate: iso(2 + i, 10),
      date: iso(2 + i, 11),
      autoCreatedAt: dt(2 + i, 10),
      autoCompletedAt: dt(2 + i, 11),
      serviceTotal: asMoney(between(1000, 3000)),
      oilTotal: asMoney(between(4000, 9000)),
      transportSum: asMoney(between(1000, 3000)),
      engineer1: pick(ENGINEERS),
      requestAuthor: pick(OPERATORS),
      paymentType: pick(PAYMENTS),
    });
  }
  for (let i = 0; i < 3; i += 1) {
    tasks.push({
      requestNumber: `${YEAR}-X${i + 1}`,
      status: 'Виконано',
      serviceRegion: pick(REGIONS),
      company: pick(COMPANIES),
      client: pick(CLIENTS),
      requestDate: 'без дати',
      date: 'н/д',
      serviceTotal: asMoney(between(3000, 7000)),
    });
  }
  for (let i = 0; i < 4; i += 1) {
    tasks.push({
      requestNumber: `${YEAR}-D${i + 1}`,
      status: 'Виконано',
      serviceRegion: pick(REGIONS),
      company: pick(COMPANIES),
      client: pick(CLIENTS),
      work: pick(WORKS),
      requestDate: `1${i}.03.${YEAR}`,
      date: `1${i}.03.${YEAR}`,
      autoCreatedAt: dt(3, 10 + i),
      autoCompletedAt: dt(3, 11 + i),
      serviceTotal: asMoney(between(5000, 15000)),
      engineer1: pick(ENGINEERS),
      requestAuthor: pick(OPERATORS),
      paymentType: pick(PAYMENTS),
    });
  }

  return tasks;
}

// Значення відповідають статусам зі схеми Sale, інакше «успішні» угоди
// не розпізнаються і всі показники продажів виглядають нульовими.
const SALE_STATUSES = [
  'primary_contact', 'quote_sent', 'in_negotiation', 'in_progress',
  'success', 'success', 'confirmed', 'confirmed', 'confirmed', 'cancelled',
];
const WON = ['success', 'confirmed'];

function buildSales() {
  const rows = [];
  const monthNow = new Date().getMonth() + 1;
  for (let i = 0; i < 120; i += 1) {
    const month = 1 + Math.floor(rnd() * monthNow);
    const status = pick(SALE_STATUSES);
    const amount = Math.round(between(60000, 900000));
    const won = WON.includes(status);
    const saleDate = dt(month, 1 + Math.floor(rnd() * 28));
    rows.push({
      saleNumber: `S-${YEAR}-${String(i + 1).padStart(3, '0')}`,
      status,
      saleDate,
      createdAt: dt(month, 1),
      updatedAt: rnd() < 0.2 ? daysAgo(between(35, 120)) : dt(month, 20),
      clientName: pick(CLIENTS),
      managerLogin: pick(['sales1', 'sales2', 'sales3']),
      totalAmount: amount,
      payments: won && rnd() < 0.8
        ? [{ amount: Math.round(amount * (rnd() < 0.75 ? 1 : 0.5)), date: saleDate }]
        : [],
      managerPremium: won ? Math.round(amount * 0.02) : 0,
      premiumAccruedAt: won && rnd() < 0.55 ? new Date(saleDate.getTime() + 10 * 86400000) : undefined,
      equipmentItems: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({
        type: pick(EQUIPMENT),
        amount: Math.round(amount / 2),
      })),
    });
  }
  return rows;
}

async function seedAll() {
  await mongoose.model('Task').insertMany(buildTasks());
  await mongoose.model('Sale').insertMany(buildSales());

  await mongoose.model('User').insertMany([
    { login: 'admin', role: 'admin', region: 'Україна', name: 'Адміністратор' },
    ...REGIONS.map((r, i) => ({ login: `rm${i}`, role: 'regionalManager', region: r, name: `Керівник ${r}` })),
  ]);

  await mongoose.model('Client').insertMany(CLIENTS.map((name, i) => ({
    name, region: REGIONS[i % REGIONS.length], createdAt: dt(1 + (i % 6), 5),
  })));

  await mongoose.model('MarketingLead').insertMany(Array.from({ length: 80 }, (_, i) => ({
    status: pick(['new', 'assigned', 'in_progress', 'converted', 'rejected']),
    source: pick(['website', 'phone', 'referral', 'exhibition', 'social']),
    campaign: pick(['Весна', 'Літо', 'Осінь', null]),
    assignedTo: rnd() < 0.8 ? pick(['sales1', 'sales2', 'sales3']) : null,
    assignedAt: rnd() < 0.8 ? dt(1 + (i % 6), 10) : null,
    createdAt: dt(1 + (i % 6), 3),
  })));

  await mongoose.model('Equipment').insertMany(Array.from({ length: 140 }, (_, i) => {
    const status = pick(['in_stock', 'in_stock', 'reserved', 'in_transit', 'sold']);
    return {
      type: pick(EQUIPMENT),
      batchName: `Партія ${i + 1}`,
      serialNumber: `SN${1000 + i}`,
      status,
      itemKind: rnd() < 0.7 ? 'equipment' : 'parts',
      quantity: 1 + Math.floor(rnd() * 6),
      batchPriceWithVAT: rnd() < 0.92 ? Math.round(between(15000, 400000)) : undefined,
      currentWarehouseName: pick(['Київ', 'Львів', 'Одеса']),
      region: pick(REGIONS),
      reservationEndDate: status === 'reserved' ? daysAgo(between(-12, 6)) : undefined,
      reservationClientName: status === 'reserved' ? pick(CLIENTS) : undefined,
      reservedByName: status === 'reserved' ? pick(['sales1', 'sales2']) : undefined,
      testingStatus: rnd() < 0.25 ? pick(['requested', 'in_progress', 'completed']) : 'none',
      testingRequestedAt: daysAgo(between(2, 40)),
      testingDate: rnd() < 0.5 ? daysAgo(between(1, 20)) : undefined,
    };
  }));

  await mongoose.model('InvoiceRequest').insertMany(Array.from({ length: 45 }, () => ({
    status: pick(['pending', 'processing', 'completed', 'completed', 'rejected']),
    needInvoice: rnd() < 0.8,
    needAct: rnd() < 0.5,
    createdAt: daysAgo(between(1, 60)),
    invoiceUploadDate: rnd() < 0.6 ? daysAgo(between(0, 30)) : undefined,
  })));

  await mongoose.model('ProcurementRequest').insertMany(Array.from({ length: 55 }, (_, i) => ({
    requestNumber: `P-${i + 1}`,
    status: pick(['pending_review', 'in_progress', 'awaiting_warehouse', 'completed', 'completed', 'blocked']),
    priority: pick(['low', 'normal', 'high', 'urgent']),
    materials: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ name: 'Позиція' })),
    requesterName: pick(['Сидоров', 'Ткаченко', 'Бондар']),
    receiptOutcome: rnd() < 0.15 ? 'partial' : 'full',
    createdAt: daysAgo(between(1, 70)),
    warehouseReceivedAt: rnd() < 0.6 ? daysAgo(between(0, 30)) : undefined,
    executorCompletedAt: rnd() < 0.7 ? daysAgo(between(0, 40)) : undefined,
    desiredWarehouse: pick(['Київ', 'Львів']),
  })));

  await mongoose.model('VedImportRequest').insertMany(Array.from({ length: 30 }, () => ({
    status: pick(['pending_review', 'in_progress', 'supplier_selection', 'completed', 'rejected']),
    equipmentType: pick(EQUIPMENT),
    quantity: 1 + Math.floor(rnd() * 4),
    proposals: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ supplier: 'Постачальник' })),
    createdAt: daysAgo(between(1, 80)),
    completedAt: rnd() < 0.5 ? daysAgo(between(0, 40)) : undefined,
  })));

  await mongoose.model('WarehouseTransferRequest').insertMany(Array.from({ length: 25 }, () => ({
    status: pick(['pending', 'approved', 'approved', 'rejected']),
    requesterRegion: pick(REGIONS),
    fromWarehouseName: pick(['Київ', 'Львів', 'Одеса']),
    toWarehouseName: pick(['Київ', 'Львів', 'Одеса']),
    createdAt: daysAgo(between(1, 50)),
    sourceApprovedAt: rnd() < 0.7 ? daysAgo(between(0, 20)) : undefined,
  })));
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'analytics_dev' });
  for (const name of MODELS) {
    if (!mongoose.models[name]) mongoose.model(name, loose());
  }

  console.log('[dev] генерація даних…');
  await seedAll();
  console.log('[dev] дані готові');

  const app = express();
  app.use(cors());
  registerAnalyticsRoutes(app, {
    authenticateToken: (req, res, next) => {
      req.user = { login: 'admin', role: 'admin', region: 'Україна' };
      next();
    },
  });

  app.listen(PORT, () => console.log(`[dev] стенд аналітики: http://localhost:${PORT}/api/analytics/overview`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
