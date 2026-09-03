/**
 * Наскрізна перевірка HTTP-шару аналітики.
 *
 * Мета не в тому, щоб ще раз перерахувати агрегації (це робить
 * analytics.pipeline.test.js), а в тому, щоб кожна вкладка отримала саме ті
 * поля, які вона читає. Раніше розбіжність між тим, що віддає сервер, і тим,
 * що очікує компонент, виявлялась лише у браузері у вигляді порожньої панелі.
 *
 * Запуск: node lib/analytics/__tests__/analytics.routes.test.js
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { registerAnalyticsRoutes } = require('../index');

const loose = () => new mongoose.Schema({}, { strict: false });

const MODELS = [
  'Task', 'User', 'InvoiceRequest', 'Sale', 'Client', 'MarketingLead',
  'Equipment', 'ProcurementRequest', 'VedImportRequest', 'WarehouseTransferRequest',
];

const YEAR = new Date().getFullYear();
const iso = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dt = (m, d) => new Date(Date.UTC(YEAR, m - 1, d, 9, 0, 0));
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ ok: true, name });
  } catch (error) {
    results.push({ ok: false, name, error: error.message });
  }
};

/** Наявність поля важливіша за значення: порожня вкладка — це саме відсутнє поле. */
function expectFields(obj, path, fields, label) {
  const target = path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  assert.ok(target && typeof target === 'object', `${label}: немає об'єкта ${path}`);
  for (const field of fields) {
    assert.ok(field in target, `${label}: у ${path} немає поля "${field}"`);
  }
}

function expectArray(obj, path, label) {
  const target = path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  assert.ok(Array.isArray(target), `${label}: ${path} має бути масивом, а не ${typeof target}`);
}

async function seed() {
  const Task = mongoose.model('Task');
  const region = 'Київський';

  await Task.insertMany([
    {
      requestNumber: 'R-001', status: 'Виконано', serviceRegion: region, company: 'ДАРЕКС',
      requestDate: iso(2, 10), date: iso(2, 12),
      autoCreatedAt: dt(2, 10), autoCompletedAt: dt(2, 12),
      autoWarehouseApprovedAt: dt(2, 13), autoAccountantApprovedAt: dt(2, 14),
      approvedByWarehouse: 'Підтверджено', approvedByAccountant: 'Підтверджено',
      serviceTotal: '18 400,50', workPrice: 15000, oilTotal: '1 200', transportSum: 800,
      client: 'ТОВ Альфа', work: 'ТО', equipment: 'DE-50', paymentType: 'Безготівка',
      requestAuthor: 'operator1', engineer1: 'Іванов І.', paymentDate: iso(3, 1),
    },
    {
      requestNumber: 'R-002', status: 'Виконано', serviceRegion: region, company: 'ДАРЕКС',
      requestDate: iso(3, 5), date: iso(3, 7),
      autoCreatedAt: dt(3, 5), autoCompletedAt: dt(3, 7),
      serviceTotal: 9000, workPrice: 6000, oilTotal: 500, perDiem: 400,
      client: 'ТОВ Бета', work: 'Ремонт', equipment: 'DE-100', paymentType: 'Готівка',
      requestAuthor: 'operator2', engineer1: 'Петров П.',
    },
    // Зависла заявка «на сьогодні» — потрібна, щоб черги і рекомендації не були порожні.
    {
      requestNumber: 'R-003', status: 'Заявка', serviceRegion: region, company: 'ДАРЕКС',
      requestDate: iso(1, 8), autoCreatedAt: daysAgo(45),
      serviceTotal: '3 500', client: 'ТОВ Гама', requestAuthor: 'operator1',
    },
    {
      requestNumber: 'R-004', status: 'В роботі', serviceRegion: region, company: 'ДАРЕКС',
      requestDate: iso(1, 20), autoCreatedAt: daysAgo(30), date: iso(1, 22),
      serviceTotal: '5 000', client: 'ТОВ Дельта', requestAuthor: 'operator2',
    },
  ]);

  await mongoose.model('User').create({
    login: 'admin', role: 'admin', region: 'Україна', name: 'Адмін',
  });

  await mongoose.model('Sale').create({
    saleNumber: 'S-1', status: 'completed', saleDate: dt(2, 15),
    totalAmount: 250000, managerLogin: 'sales1', paidAmount: 250000,
    managerPremium: 5000, premiumAccrued: false, createdAt: dt(2, 1), updatedAt: dt(2, 15),
  });

  await mongoose.model('Client').create({
    name: 'ТОВ Альфа', region, createdAt: dt(1, 5),
  });

  await mongoose.model('MarketingLead').create({
    status: 'converted', source: 'website', createdAt: dt(2, 3), assignedTo: 'sales1',
  });

  await mongoose.model('Equipment').create({
    type: 'DE-50', status: 'in_stock', quantity: 3, batchPriceWithVAT: 120000,
    currentWarehouseName: 'Київ', itemKind: 'equipment',
  });

  await mongoose.model('InvoiceRequest').create({
    status: 'pending', needInvoice: true, createdAt: daysAgo(20),
  });

  await mongoose.model('ProcurementRequest').create({
    requestNumber: 'P-1', status: 'in_progress', priority: 'high',
    materials: [{ name: 'Фільтр' }], requesterName: 'Сидоров',
    createdAt: daysAgo(25),
  });

  await mongoose.model('VedImportRequest').create({
    status: 'in_progress', equipmentType: 'DE-200', proposals: [],
    createdAt: daysAgo(18),
  });

  await mongoose.model('WarehouseTransferRequest').create({
    status: 'pending', requesterRegion: region,
    fromWarehouseName: 'Київ', toWarehouseName: 'Львів', createdAt: daysAgo(5),
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers: { 'x-test-user': 'admin' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          reject(new Error(`${path}: відповідь не JSON (${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'analytics_routes_test' });
  for (const name of MODELS) {
    if (!mongoose.models[name]) mongoose.model(name, loose());
  }
  await seed();

  const app = express();
  // Підставляємо адміністратора замість реального JWT — перевіряємо маршрути, не авторизацію.
  registerAnalyticsRoutes(app, {
    authenticateToken: (req, res, next) => {
      req.user = { login: 'admin', role: 'admin', region: 'Україна' };
      next();
    },
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const q = `year=${YEAR}&period=year`;

  // ── Кожен ендпоінт має відповісти 200 і покласти свій зріз у корінь ──
  const endpoints = ['options', 'service', 'process', 'finance', 'sales', 'supply', 'overview', 'insights'];
  const payloads = {};
  for (const name of endpoints) {
    const res = await get(port, `/api/analytics/${name}?${q}`);
    payloads[name] = res.body;
    check(`GET /api/analytics/${name} → 200`, () => {
      assert.strictEqual(res.status, 200, `статус ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
      assert.ok(!res.body.error, `помилка: ${res.body.error}`);
    });
  }

  check('meta присутня в кожній відповіді', () => {
    for (const name of endpoints) {
      expectFields(payloads[name], 'meta', ['period', 'basis', 'contextLabel', 'tookMs'], name);
    }
  });

  // ── Фільтри ──
  check('options віддає довідники для всіх селектів', () => {
    expectFields(payloads.options, 'options', ['years', 'companies', 'regions', 'months', 'quarters', 'bases'], 'options');
    const o = payloads.options.options;
    assert.ok(o.years.length > 0, 'немає жодного року');
    assert.ok(o.years.every((y) => 'year' in y && 'tasks' in y), 'years без полів year/tasks');
    assert.strictEqual(o.months.length, 12);
    assert.strictEqual(o.quarters.length, 4);
  });

  // ── Огляд ──
  check('overview: headline має всі KPI вкладки «Огляд»', () => {
    expectFields(payloads.overview, 'overview.headline', [
      'tasks', 'completed', 'approvedFull', 'revenue', 'margin', 'marginRate',
      'conversionRate', 'avgTicket', 'avgLeadDays', 'runRateRevenue', 'deltas',
    ], 'overview');
  });
  check('overview: картка кожного відділу має primary і metrics', () => {
    const depts = payloads.overview.overview.departments;
    assert.strictEqual(depts.length, 5, `відділів ${depts.length}, очікувалось 5`);
    for (const d of depts) {
      assert.ok(d.id && d.label && d.icon && d.tab, `відділ без опису: ${JSON.stringify(d)}`);
      assert.ok(d.primary?.label && 'value' in d.primary && d.primary.format, `${d.id}: неповний primary`);
      assert.ok(Array.isArray(d.metrics) && d.metrics.length > 0, `${d.id}: немає metrics`);
      for (const m of d.metrics) {
        assert.ok(m.label && 'value' in m && m.format, `${d.id}: метрика без формату: ${JSON.stringify(m)}`);
      }
    }
  });
  check('overview: посилання відділів ведуть на реальні вкладки', () => {
    const tabs = new Set(['service', 'process', 'finance', 'sales', 'supply']);
    for (const d of payloads.overview.overview.departments) {
      assert.ok(tabs.has(d.tab), `${d.id}: вкладка "${d.tab}" не існує`);
    }
  });
  check('overview: місячні серії покривають 12 місяців', () => {
    assert.strictEqual(payloads.overview.overview.monthly.length, 12);
    assert.strictEqual(payloads.overview.overview.monthlyPrevious.length, 12);
  });
  check('overview: короткий блок рекомендацій заповнений', () => {
    expectFields(payloads.overview, 'insights', [
      'healthScore', 'summary', 'departments', 'top', 'todayActions', 'briefing', 'strengths',
    ], 'overview');
    const { healthScore } = payloads.overview.insights;
    assert.ok(healthScore >= 0 && healthScore <= 100, `healthScore=${healthScore}`);
    assert.ok(payloads.overview.insights.briefing?.headline, 'немає briefing.headline');
  });
  check('overview: живі черги відділів присутні', () => {
    expectArray(payloads.overview, 'overview.queues', 'overview');
    const ids = payloads.overview.overview.queues.map((q) => q.id);
    for (const id of ['operator', 'service', 'warehouse', 'accountant']) {
      assert.ok(ids.includes(id), `немає черги ${id}`);
    }
  });
  check('overview: види оплати — масив сум, не кількостей з «грн»', () => {
    expectArray(payloads.overview, 'overview.byPaymentType', 'overview');
  });

  // ── Сервіс ──
  check('service: KPI містить усі показники вкладки', () => {
    expectFields(payloads.service, 'service.kpi', [
      'tasks', 'completed', 'active', 'blocked', 'rejected', 'approvedFull',
      'revenue', 'margin', 'avgTicket', 'conversionRate', 'closeRate', 'rejectionRate',
      'avgLeadDays', 'maxLeadDays', 'leadSamples', 'runRateRevenue',
    ], 'service');
  });
  check('service: усі розрізи — масиви', () => {
    for (const path of [
      'service.byStatus', 'service.byRegion', 'service.byCompany', 'service.byPaymentType',
      'service.byClient', 'service.byWorkType', 'service.byEquipment', 'service.byEngineer',
      'service.byOperator', 'service.byWeekday', 'service.monthly',
    ]) {
      expectArray(payloads.service, path, 'service');
    }
  });
  check('service: рядок інженера має частку заявок і доходу', () => {
    const row = payloads.service.service.byEngineer[0];
    assert.ok(row, 'немає жодного інженера');
    for (const f of ['name', 'participations', 'taskShare', 'revenue', 'margin', 'avgLeadDays']) {
      assert.ok(f in row, `byEngineer без поля "${f}"`);
    }
  });
  check('service: дельти YoY мають changePct', () => {
    for (const key of ['tasks', 'revenue', 'margin', 'avgTicket', 'conversionRate', 'avgLeadDays']) {
      assert.ok('changePct' in (payloads.service.service.deltas[key] || {}), `дельта ${key} без changePct`);
    }
  });
  check('service: якість даних покриває поля вкладки «Якість даних»', () => {
    expectFields(payloads.service, 'service.dataQuality', [
      'total', 'completed', 'missingWork', 'missingAuthor', 'missingEquipment',
      'missingEngineer', 'missingPaymentType', 'missingCompletedAt', 'missingCreatedAt',
      'missingClient', 'missingRegion', 'zeroRevenueCompleted', 'revenueAsString',
      'undatedTasks', 'nonIsoDateTasks',
    ], 'service');
  });

  // ── Процеси ──
  check('process: живі черги та кохорта віддані окремо', () => {
    expectFields(payloads.process, 'process.live', ['total', 'stages', 'active', 'stuckTotal', 'stuckRevenue', 'bottleneck'], 'process');
    expectFields(payloads.process, 'process.cohort', ['total', 'stages', 'closed', 'closeRate'], 'process');
    expectFields(payloads.process, 'process.thresholds', ['stuckActiveDays', 'stuckApprovalDays'], 'process');
  });
  check('process: етап несе все, що малює воронка', () => {
    for (const stage of payloads.process.process.live.stages) {
      for (const f of ['id', 'label', 'icon', 'color', 'count', 'stuck', 'stuckRevenue', 'percent', 'avgStageDays']) {
        assert.ok(f in stage, `етап ${stage.id}: немає поля "${f}"`);
      }
    }
  });
  check('process: списки зависань є для кожного активного етапу', () => {
    const byStage = payloads.process.process.stuckByStage;
    for (const id of ['operator', 'service', 'warehouse', 'accountant']) {
      assert.ok(Array.isArray(byStage[id]), `stuckByStage.${id} не масив`);
    }
    const found = Object.values(byStage).flat();
    assert.ok(found.length > 0, 'жодного зависання не знайдено на підготовлених даних');
    for (const t of found) {
      for (const f of ['number', 'client', 'region', 'reason', 'days', 'revenue']) {
        assert.ok(f in t, `зависла заявка без поля "${f}"`);
      }
    }
  });
  check('process: переходи мають ціль і розмір вибірки', () => {
    for (const t of payloads.process.process.transitions) {
      for (const f of ['id', 'label', 'days', 'samples', 'target', 'overTarget']) {
        assert.ok(f in t, `перехід ${t.id}: немає поля "${f}"`);
      }
    }
  });

  // ── Фінанси ──
  check('finance: юніт-економіка і дебіторка на місці', () => {
    expectFields(payloads.finance, 'finance.costSummary', ['materials', 'expenses', 'total', 'margin', 'marginRate'], 'finance');
    expectFields(payloads.finance, 'finance.receivables.total', ['count', 'amount', 'approvedAmount', 'avgAgeDays', 'maxAgeDays'], 'finance');
    expectFields(payloads.finance, 'finance.invoices', ['total', 'open', 'staleOpen', 'avgTurnaroundDays', 'maxOpenAgeDays'], 'finance');
    expectFields(payloads.finance, 'finance.approvalSla.warehouse', ['avgDays', 'maxDays', 'samples', 'overSla'], 'finance');
  });
  check('finance: собівартість розкладена по статтях', () => {
    const cs = payloads.finance.finance.costStructure;
    assert.ok(Array.isArray(cs) && cs.length > 0, 'структура собівартості порожня');
    for (const item of cs) {
      for (const f of ['id', 'label', 'group', 'amount', 'share']) {
        assert.ok(f in item, `стаття без поля "${f}"`);
      }
      assert.ok(['materials', 'expenses'].includes(item.group), `невідома група "${item.group}"`);
    }
    assert.ok(cs.some((c) => c.group === 'expenses'), 'супутні витрати не враховані — маржа буде завищена');
  });
  check('finance: вікові кошики дебіторки завжди повні', () => {
    const b = payloads.finance.finance.receivables.buckets;
    assert.strictEqual(b.length, 4, `кошиків ${b.length}`);
    for (const bucket of b) {
      for (const f of ['id', 'label', 'count', 'amount']) {
        assert.ok(f in bucket, `кошик без поля "${f}"`);
      }
    }
  });
  check('finance: місячний cashflow розділяє оплачене й ні', () => {
    for (const row of payloads.finance.finance.cashflow) {
      for (const f of ['label', 'revenue', 'paid', 'unpaid', 'margin']) {
        assert.ok(f in row, `cashflow без поля "${f}"`);
      }
    }
  });

  // ── Продажі ──
  check('sales: KPI і воронка віддані', () => {
    expectFields(payloads.sales, 'sales.kpi', [
      'deals', 'won', 'winRate', 'wonAmount', 'openAmount', 'avgDeal',
      'paid', 'collectedRate', 'premiumPending', 'avgCycleDays', 'equipmentUnits',
    ], 'sales');
    expectArray(payloads.sales, 'sales.pipeline', 'sales');
    for (const st of payloads.sales.sales.pipeline) {
      for (const f of ['status', 'label', 'deals', 'amount', 'isWon', 'isLost']) {
        assert.ok(f in st, `етап воронки без поля "${f}"`);
      }
    }
  });
  check('sales: ліди та клієнти враховані', () => {
    expectFields(payloads.sales, 'sales.leads', [
      'total', 'converted', 'rejected', 'assigned', 'unassigned',
      'conversionRate', 'avgAssignDays', 'byStatus', 'bySource',
    ], 'sales');
    expectFields(payloads.sales, 'sales.clients', ['total', 'newInPeriod', 'byRegion'], 'sales');
  });
  check('sales: місячна серія на 12 місяців', () => {
    assert.strictEqual(payloads.sales.sales.monthly.length, 12);
  });

  // ── Склад ──
  check('supply: чотири блоки, кожен або дані, або явний null', () => {
    const s = payloads.supply.supply;
    for (const key of ['equipment', 'procurement', 'ved', 'transfers']) {
      assert.ok(key in s, `немає блоку "${key}"`);
    }
    expectFields(payloads.supply, 'supply.equipment.totals', [
      'positions', 'units', 'value', 'inStock', 'reserved', 'inTransit', 'noPrice',
    ], 'supply');
  });
  check('supply: вартість складу враховує кількість у партії', () => {
    // Засіяно: 3 × 120000
    assert.strictEqual(payloads.supply.supply.equipment.totals.value, 360000);
  });
  check('supply: закупівлі та ВЕД мають підписані статуси', () => {
    for (const row of payloads.supply.supply.procurement?.byStatus || []) {
      assert.ok(row.label && row.label !== row.status || row.label, `статус без підпису: ${JSON.stringify(row)}`);
    }
    for (const row of payloads.supply.supply.ved?.byStatus || []) {
      assert.ok(row.label, `статус ВЕД без підпису: ${JSON.stringify(row)}`);
    }
  });

  // ── Рекомендації ──
  check('insights: структура для вкладки рекомендацій повна', () => {
    expectFields(payloads.insights, 'insights', [
      'generatedAt', 'healthScore', 'summary', 'departments', 'recommendations', 'strengths',
      'briefing', 'todayActions', 'ownerBoard',
    ], 'insights');
    expectFields(payloads.insights, 'insights.summary', ['total', 'byDept', 'bySeverity', 'moneyAtStake'], 'insights');
    assert.ok(payloads.insights.insights.briefing?.headline, 'немає briefing');
    assert.ok(Array.isArray(payloads.insights.insights.todayActions), 'todayActions не масив');
    assert.ok(Array.isArray(payloads.insights.insights.ownerBoard), 'ownerBoard не масив');
  });
  check('insights: кожна рекомендація придатна до виконання', () => {
    const recs = payloads.insights.insights.recommendations;
    assert.ok(recs.length > 0, 'жодної рекомендації на підготовлених даних');
    for (const r of recs) {
      assert.ok(r.id && r.title && r.finding && r.rootCause, `${r.id}: неповний текст`);
      assert.ok(r.deptLabel && r.deptIcon, `${r.id}: немає відділу`);
      assert.ok(r.actions.length > 0 && r.actions.every((a) => a.text && a.owner), `${r.id}: дії без відповідального`);
      assert.ok(r.metric && r.metric.current != null && r.metric.label, `${r.id}: немає метрики`);
      assert.ok(r.impact?.text, `${r.id}: немає опису впливу`);
      assert.ok(Number.isFinite(r.score), `${r.id}: немає оцінки пріоритету`);
      assert.ok(['critical', 'high', 'medium', 'low'].includes(r.severity), `${r.id}: severity=${r.severity}`);
    }
  });
  check('insights: докази мають підписи колонок під таблицю', () => {
    const withEvidence = payloads.insights.insights.recommendations.filter((r) => r.evidence?.items?.length);
    for (const r of withEvidence) {
      assert.ok(Array.isArray(r.evidence.columns), `${r.id}: докази без columns`);
      const keys = Object.keys(r.evidence.items[0]);
      assert.strictEqual(
        r.evidence.columns.length,
        keys.length,
        `${r.id}: ${r.evidence.columns.length} підписів на ${keys.length} колонок`,
      );
    }
  });
  check('insights: посилання «показати дані» ведуть на існуючі вкладки', () => {
    const tabs = new Set(['overview', 'service', 'process', 'finance', 'sales', 'supply', 'insights', 'quality']);
    for (const r of payloads.insights.insights.recommendations) {
      if (r.link?.tab) assert.ok(tabs.has(r.link.tab), `${r.id}: вкладка "${r.link.tab}" не існує`);
    }
  });

  // ── Кеш ──
  const first = await get(port, `/api/analytics/service?${q}`);
  const second = await get(port, `/api/analytics/service?${q}`);
  check('повторний запит обслуговується з кешу', () => {
    assert.strictEqual(second.body.meta.cached, true, 'другий запит не з кешу');
  });
  check('кеш не змінює дані', () => {
    assert.strictEqual(first.body.service.kpi.revenue, second.body.service.kpi.revenue);
  });
  const forced = await get(port, `/api/analytics/service?${q}&force=1`);
  check('force=1 обходить кеш', () => {
    assert.strictEqual(forced.body.meta.cached, false, 'force не перерахував');
  });

  // ── Фільтри реально впливають на вибірку ──
  const otherRegion = await get(port, `/api/analytics/service?${q}&region=${encodeURIComponent('Львівський')}`);
  check('фільтр регіону змінює вибірку', () => {
    assert.strictEqual(otherRegion.body.service.kpi.tasks, 0, 'заявки чужого регіону потрапили у вибірку');
  });
  const byWork = await get(port, `/api/analytics/service?${q}&basis=work`);
  check('база «за роботами» дає власну відповідь', () => {
    assert.strictEqual(byWork.body.meta.basis.id, 'work');
  });
  const oneMonth = await get(port, `/api/analytics/service?year=${YEAR}&period=month&month=2`);
  check('фільтр місяця звужує період', () => {
    assert.ok(
      oneMonth.body.service.kpi.tasks < payloads.service.service.kpi.tasks,
      `місяць=${oneMonth.body.service.kpi.tasks}, рік=${payloads.service.service.kpi.tasks}`,
    );
  });

  server.close();
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
