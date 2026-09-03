/**
 * Маршрути аналітики.
 *
 * Раніше панель «Аналітика» вантажила всю колекцію Task у браузер
 * (GET /api/tasks/filter без пагінації) і рахувала всі 11 вкладок у JS.
 * Тут кожен відділ має свій агрегаційний ендпоінт: у клієнт іде вже готовий
 * компактний зріз, а не сирі документи.
 */
const mongoose = require('mongoose');
const { buildContext, describeContext, DATE_BASES, MONTH_NAMES } = require('./context');
const { loadServiceAnalytics } = require('./service');
const { loadProcessAnalytics } = require('./process');
const { loadFinanceAnalytics } = require('./finance');
const { loadSalesAnalytics } = require('./sales');
const { loadSupplyAnalytics } = require('./supply');
const { buildInsights } = require('./insights');

const TTL_MS = 90_000;
const META_TTL_MS = 10 * 60_000;

const store = new Map();

/**
 * TTL-кеш із дедуплікацією паралельних запитів: під час перезавантаження панелі
 * усі вкладки просять свої дані одночасно, і кожна з них інакше запускала б
 * власну агрегацію по тій самій вибірці.
 */
async function cachedLoad(key, ttlMs, loader, { force = false } = {}) {
  const now = Date.now();
  const hit = store.get(key);
  if (!force && hit?.expiresAt > now) {
    return { data: hit.data, cached: true, fetchedAt: hit.fetchedAt };
  }
  if (hit?.inFlight) return hit.inFlight;

  const inFlight = (async () => {
    const data = await loader();
    const fetchedAt = new Date().toISOString();
    store.set(key, { data, fetchedAt, expiresAt: Date.now() + ttlMs });
    return { data, cached: false, fetchedAt };
  })();

  store.set(key, { ...(hit || {}), inFlight });
  try {
    return await inFlight;
  } catch (error) {
    const current = store.get(key);
    if (current?.inFlight === inFlight) store.delete(key);
    throw error;
  } finally {
    const current = store.get(key);
    if (current?.inFlight === inFlight) delete current.inFlight;
  }
}

const LOADERS = {
  service: loadServiceAnalytics,
  process: loadProcessAnalytics,
  finance: loadFinanceAnalytics,
  sales: loadSalesAnalytics,
  supply: loadSupplyAnalytics,
};

function loadSection(ctx, section, { light = false } = {}) {
  const loader = LOADERS[section];
  if (!loader) throw new Error(`Unknown analytics section: ${section}`);
  const key = `analytics:${section}:${light ? 'L' : 'F'}:${ctx.cacheKey}`;
  return cachedLoad(key, TTL_MS, () => loader(ctx, { light }), { force: ctx.force });
}

function meta(ctx) {
  return {
    period: {
      year: ctx.period.year,
      period: ctx.period.period,
      month: ctx.period.month,
      quarter: ctx.period.quarter,
      label: ctx.period.label,
      prevLabel: ctx.period.prevLabel,
      from: ctx.period.from,
      to: ctx.period.to,
      isCurrentPeriod: ctx.period.isCurrentPeriod,
      elapsedMonths: Math.round(ctx.period.elapsedMonths * 10) / 10,
    },
    basis: { id: ctx.basis.id, label: ctx.basis.label, hint: ctx.basis.hint },
    region: ctx.region,
    company: ctx.company,
    scope: {
      role: ctx.scope.role,
      region: ctx.scope.region,
      canChooseRegion: ctx.scope.canChooseRegion,
    },
    contextLabel: describeContext(ctx),
  };
}

/** Довідники для фільтрів: тільки ті значення, що реально є в даних. */
async function loadFilterOptions() {
  const Task = mongoose.model('Task');
  const User = mongoose.model('User');

  const [taskFacets, userRegions] = await Promise.all([
    Task.aggregate([
      {
        $facet: {
          years: [
            {
              $addFields: {
                _y: {
                  $year: {
                    $ifNull: [
                      { $convert: { input: '$requestDate', to: 'date', onError: null, onNull: null } },
                      { $convert: { input: '$date', to: 'date', onError: null, onNull: null } },
                    ],
                  },
                },
              },
            },
            { $match: { _y: { $ne: null } } },
            { $group: { _id: '$_y', tasks: { $sum: 1 } } },
            { $sort: { _id: -1 } },
          ],
          companies: [
            {
              $group: {
                _id: { $trim: { input: { $toString: { $ifNull: ['$company', ''] } } } },
                tasks: { $sum: 1 },
              },
            },
            { $match: { _id: { $ne: '' } } },
            { $sort: { tasks: -1 } },
          ],
          regions: [
            {
              $group: {
                _id: { $trim: { input: { $toString: { $ifNull: ['$serviceRegion', ''] } } } },
                tasks: { $sum: 1 },
              },
            },
            { $match: { _id: { $ne: '' } } },
            { $sort: { tasks: -1 } },
          ],
        },
      },
    ]).allowDiskUse(true),
    User.distinct('region', { region: { $exists: true, $nin: [null, ''] } }),
  ]);

  const facet = taskFacets[0] || {};
  const taskRegions = (facet.regions || []).map((r) => r._id);
  const regions = [...new Set([...taskRegions, ...userRegions.map((r) => String(r).trim())])]
    .filter((r) => r && r !== 'Україна')
    .sort((a, b) => a.localeCompare(b, 'uk'));

  return {
    years: (facet.years || []).map((r) => ({ year: r._id, tasks: r.tasks })),
    companies: (facet.companies || []).map((r) => ({ name: r._id, tasks: r.tasks })),
    regions,
    months: MONTH_NAMES.map((label, idx) => ({ value: idx + 1, label })),
    quarters: [1, 2, 3, 4].map((q) => ({ value: q, label: `${q} квартал` })),
    bases: Object.values(DATE_BASES).map((b) => ({ id: b.id, label: b.label, hint: b.hint })),
  };
}

/** Компактний зріз кожного відділу для головної вкладки. */
function buildOverview(sections) {
  const { service, process: proc, finance, sales, supply } = sections;
  const kpi = service?.kpi || {};

  return {
    headline: {
      tasks: kpi.tasks || 0,
      completed: kpi.completed || 0,
      approvedFull: kpi.approvedFull || 0,
      revenue: kpi.revenue || 0,
      margin: kpi.margin || 0,
      marginRate: kpi.marginRate || 0,
      conversionRate: kpi.conversionRate || 0,
      avgTicket: kpi.avgTicket || 0,
      avgLeadDays: kpi.avgLeadDays,
      runRateRevenue: kpi.runRateRevenue,
      deltas: service?.deltas || null,
    },
    departments: [
      {
        id: 'service',
        label: 'Сервісна служба',
        icon: '🔧',
        tab: 'service',
        primary: { label: 'Заявок', value: kpi.tasks || 0, format: 'int' },
        metrics: [
          { label: 'Виконано', value: kpi.completed || 0, format: 'int' },
          { label: 'Конверсія', value: kpi.conversionRate || 0, format: 'pct' },
          { label: 'Сер. час', value: kpi.avgLeadDays, format: 'days' },
          { label: 'Сер. чек', value: kpi.avgTicket || 0, format: 'money' },
        ],
        alert: (kpi.active || 0) > 0 ? `${kpi.active} у процесі` : null,
      },
      {
        id: 'process',
        label: 'Черги відділів',
        icon: '🔄',
        tab: 'process',
        primary: { label: 'У чергах зараз', value: proc?.live?.active || 0, format: 'int' },
        metrics: [
          { label: 'Зависло', value: proc?.live?.stuckTotal || 0, format: 'int', danger: (proc?.live?.stuckTotal || 0) > 0 },
          { label: 'Заморожено', value: proc?.live?.stuckRevenue || 0, format: 'money' },
          { label: 'Закрито періоду', value: proc?.cohort?.closeRate || 0, format: 'pct' },
          { label: 'Очікують рахунок', value: proc?.invoices?.pending || 0, format: 'int' },
        ],
        alert: proc?.live?.bottleneck?.stuck
          ? `Вузьке місце: ${proc.live.bottleneck.label}`
          : null,
      },
      {
        id: 'finance',
        label: 'Бухгалтерія',
        icon: '💰',
        tab: 'finance',
        primary: { label: 'Маржа', value: finance?.costSummary?.margin || 0, format: 'money' },
        metrics: [
          { label: 'Маржинальність', value: finance?.costSummary?.marginRate || 0, format: 'pct' },
          { label: 'Дебіторка', value: finance?.receivables?.total?.amount || 0, format: 'money', danger: (finance?.receivables?.total?.amount || 0) > 0 },
          { label: 'Собівартість', value: finance?.costSummary?.total || 0, format: 'money' },
          { label: 'Рахунки в черзі', value: finance?.invoices?.open || 0, format: 'int' },
        ],
        alert: finance?.losses?.tasks
          ? `${finance.losses.tasks} збиткових заявок`
          : finance?.unbilled?.tasks
            ? `${finance.unbilled.tasks} виконаних заявок без суми`
            : null,
      },
      {
        id: 'sales',
        label: 'Відділ продажів',
        icon: '🤝',
        tab: 'sales',
        primary: { label: 'Угод закрито', value: sales?.kpi?.won || 0, format: 'int' },
        metrics: [
          { label: 'Сума успішних', value: sales?.kpi?.wonAmount || 0, format: 'money' },
          { label: 'Win rate', value: sales?.kpi?.winRate || 0, format: 'pct' },
          { label: 'У воронці', value: sales?.kpi?.openAmount || 0, format: 'money' },
          { label: 'Ліди', value: sales?.leads?.total || 0, format: 'int' },
        ],
        alert: (sales?.leads?.unassigned || 0) > 0
          ? `${sales.leads.unassigned} лідів без менеджера`
          : null,
      },
      {
        id: 'supply',
        label: 'Склад, ЗЕД, закупівлі',
        icon: '📦',
        tab: 'supply',
        primary: { label: 'Вартість складу', value: supply?.equipment?.totals?.value || 0, format: 'money' },
        metrics: [
          { label: 'Позицій', value: supply?.equipment?.totals?.positions || 0, format: 'int' },
          { label: 'Зарезервовано', value: supply?.equipment?.totals?.reserved || 0, format: 'int' },
          { label: 'Заявок на закупівлю', value: supply?.procurement?.totals?.requests || 0, format: 'int' },
          { label: 'Відкритих ВЕД', value: supply?.ved?.totals?.open || 0, format: 'int' },
        ],
        alert: (supply?.procurement?.totals?.staleOpen || 0) > 0
          ? `${supply.procurement.totals.staleOpen} закупівель прострочено`
          : null,
      },
    ],
    queues: (proc?.live?.stages || [])
      .filter((s) => ['operator', 'service', 'warehouse', 'accountant'].includes(s.id))
      .map((s) => ({
        id: s.id,
        label: s.label,
        icon: s.icon,
        color: s.color,
        count: s.count,
        stuck: s.stuck,
        tab: 'process',
        stage: s.id,
      })),
    monthly: service?.monthly || [],
    monthlyPrevious: service?.monthlyPrevious || [],
    byRegion: service?.byRegion || [],
    byStatus: service?.byStatus || [],
    byPaymentType: service?.byPaymentType || [],
    dataQuality: service?.dataQuality
      ? {
        total: service.dataQuality.total || 0,
        completed: service.dataQuality.completed || 0,
        missingCompletedAt: service.dataQuality.missingCompletedAt || 0,
        zeroRevenueCompleted: service.dataQuality.zeroRevenueCompleted || 0,
      }
      : null,
  };
}

async function loadAllSections(ctx, { light = false } = {}) {
  const names = Object.keys(LOADERS);
  const results = await Promise.all(names.map(async (name) => {
    try {
      const { data } = await loadSection(ctx, name, { light });
      return [name, data];
    } catch (error) {
      console.error(`[analytics] section "${name}" failed:`, error.message);
      return [name, null];
    }
  }));
  return Object.fromEntries(results);
}

function registerAnalyticsRoutes(app, { authenticateToken } = {}) {
  const guard = authenticateToken || ((req, res, next) => next());

  const handle = (name, handler) => async (req, res) => {
    const startedAt = Date.now();
    try {
      const ctx = await buildContext(req);
      const payload = await handler(ctx, req);
      res.json({
        ...payload,
        meta: { ...meta(ctx), ...(payload.meta || {}), tookMs: Date.now() - startedAt },
      });
    } catch (error) {
      console.error(`[analytics] GET /api/analytics/${name}:`, error);
      res.status(500).json({ error: error.message || 'Помилка аналітики' });
    }
  };

  app.get('/api/analytics/options', guard, handle('options', async (ctx) => {
    const { data, cached, fetchedAt } = await cachedLoad(
      'analytics:options',
      META_TTL_MS,
      loadFilterOptions,
      { force: ctx.force },
    );
    return { options: data, meta: { cached, fetchedAt } };
  }));

  for (const section of Object.keys(LOADERS)) {
    app.get(`/api/analytics/${section}`, guard, handle(section, async (ctx) => {
      const { data, cached, fetchedAt } = await loadSection(ctx, section);
      return { [section]: data, meta: { cached, fetchedAt } };
    }));
  }

  app.get('/api/analytics/overview', guard, handle('overview', async (ctx) => {
    const sections = await loadAllSections(ctx, { light: true });
    const insights = buildInsights(sections, ctx);
    return {
      overview: buildOverview(sections),
      insights: {
        healthScore: insights.healthScore,
        summary: insights.summary,
        departments: insights.departments,
        top: insights.recommendations.slice(0, 5),
        todayActions: (insights.todayActions || []).slice(0, 4),
        briefing: insights.briefing || null,
        strengths: insights.strengths,
      },
    };
  }));

  app.get('/api/analytics/insights', guard, handle('insights', async (ctx) => {
    const sections = await loadAllSections(ctx);
    return { insights: buildInsights(sections, ctx) };
  }));

  console.log('[analytics] routes registered: options, overview, insights, ' + Object.keys(LOADERS).join(', '));
}

module.exports = { registerAnalyticsRoutes };
