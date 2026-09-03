/**
 * Аналіз самого проєкту (а не зовнішніх ресурсів): де вузькі місця в API,
 * які маршрути «з'їдають» найбільше часу, чи вистачає індексів у Mongo,
 * чи не тисне процес у стелю по пам'яті та event loop.
 */
const { getRequestMetricsSnapshot } = require('./requestMetrics');

const HOT_ROUTE_LIMIT = 15;

function safePercent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

/** Маршрути, відсортовані за сумарним часом — саме вони визначають відчутну швидкість системи. */
function buildHotRoutes(routes) {
  return [...routes]
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, HOT_ROUTE_LIMIT)
    .map((route) => ({ ...route, share: 0 }));
}

/** Поодинокі виклики зазвичай шум, але якщо запит уже перевищив поріг повільності — його треба показати. */
function buildSlowRoutes(routes, minCount = 2) {
  return [...routes]
    .filter((route) => route.count >= minCount || route.slow > 0)
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, HOT_ROUTE_LIMIT);
}

function buildErrorRoutes(routes) {
  return [...routes]
    .filter((route) => route.errors5xx > 0 || route.errorRate >= 10)
    .sort((a, b) => b.errors5xx - a.errors5xx || b.errorRate - a.errorRate)
    .slice(0, HOT_ROUTE_LIMIT);
}

function buildChattyRoutes(routes) {
  return [...routes]
    .filter((route) => route.count >= 20)
    .sort((a, b) => b.count - a.count)
    .slice(0, HOT_ROUTE_LIMIT);
}

function buildHeavyPayloadRoutes(routes) {
  return [...routes]
    .filter((route) => route.avgPayloadKb >= 200 && route.count >= 3)
    .sort((a, b) => b.avgPayloadKb * b.count - a.avgPayloadKb * a.count)
    .slice(0, HOT_ROUTE_LIMIT);
}

/**
 * Колекції, де ймовірні повні сканування: багато документів, мало індексів
 * або індекси є, але жоден із них не використовувався.
 */
function analyzeCollections(localStats, indexUsage) {
  const usageByCollection = new Map();
  for (const row of indexUsage || []) {
    if (!usageByCollection.has(row.collection)) usageByCollection.set(row.collection, []);
    usageByCollection.get(row.collection).push(row);
  }

  const collections = (localStats?.collectionStats || []).map((collection) => {
    const indexes = usageByCollection.get(collection.name) || [];
    const unusedIndexes = indexes.filter((index) => index.index !== '_id_' && index.ops === 0);
    const usedIndexes = indexes.filter((index) => index.ops > 0);
    const indexRatio = collection.dataSizeBytes ? collection.indexSizeBytes / collection.dataSizeBytes : 0;

    const risks = [];
    if (collection.count > 5000 && collection.indexCount <= 1) {
      risks.push('Понад 5 тис. документів і лише службовий індекс _id — вибірки по фільтрах скануватимуть усю колекцію.');
    }
    if (unusedIndexes.length) {
      risks.push(`${unusedIndexes.length} індекс(и) без жодного звернення — займають місце й уповільнюють запис.`);
    }
    if (indexRatio > 1.5 && collection.indexSizeBytes > 20 * 1024 * 1024) {
      risks.push('Індекси важать більше за самі дані — ймовірно, є зайві складені індекси.');
    }
    if (collection.avgObjSizeBytes > 200 * 1024) {
      risks.push('Середній документ понад 200 КБ — великі вкладені масиви краще винести в окрему колекцію.');
    }

    return {
      ...collection,
      indexRatio: Number(indexRatio.toFixed(2)),
      unusedIndexes: unusedIndexes.map((index) => index.index),
      usedIndexCount: usedIndexes.length,
      risks,
    };
  });

  return collections;
}

function scoreFromThresholds(value, { good, warn, bad, inverted = false }) {
  if (value == null || Number.isNaN(value)) return null;
  const v = Number(value);
  if (inverted) {
    if (v >= good) return 100;
    if (v >= warn) return 70;
    if (v >= bad) return 40;
    return 15;
  }
  if (v <= good) return 100;
  if (v <= warn) return 70;
  if (v <= bad) return 40;
  return 15;
}

function computeProjectScore(metrics, collections) {
  // На щойно піднятому інстансі вибірка нерепрезентативна — краще показати «—», ніж фальшиві 100.
  if (metrics.totals.requests < 10) return { score: null, parts: [] };
  const parts = [];
  const push = (label, weight, score) => {
    if (score == null) return;
    parts.push({ label, weight, score });
  };

  push('Затримка p95', 3, scoreFromThresholds(metrics.totals.p95Ms, { good: 400, warn: 1000, bad: 2500 }));
  push('Середня відповідь', 2, scoreFromThresholds(metrics.totals.avgMs, { good: 150, warn: 400, bad: 900 }));
  push('Серверні помилки', 3, scoreFromThresholds(metrics.totals.serverErrorRate, { good: 0.2, warn: 1, bad: 3 }));
  push('Event loop', 2, scoreFromThresholds(metrics.runtime.eventLoop.p99Ms, { good: 30, warn: 100, bad: 250 }));
  push(
    'Пам\'ять процесу',
    2,
    scoreFromThresholds(safePercent(metrics.runtime.rssMb, metrics.runtime.systemTotalMb), {
      good: 55,
      warn: 75,
      bad: 88,
    }),
  );
  push(
    'Запити до Mongo',
    2,
    scoreFromThresholds(metrics.mongo.totals.avgMs, { good: 40, warn: 120, bad: 300 }),
  );

  const risky = collections.filter((collection) => collection.risks.length).length;
  push('Схема та індекси', 2, scoreFromThresholds(risky, { good: 0, warn: 2, bad: 5 }));

  if (!parts.length) return { score: null, parts: [] };
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return { score: Math.round(score), parts };
}

function analyzeProject({ mongoState } = {}) {
  const metrics = getRequestMetricsSnapshot();
  const routes = metrics.routes;
  const totalTime = routes.reduce((sum, route) => sum + route.totalTimeMs, 0);

  const hotRoutes = buildHotRoutes(routes).map((route) => ({
    ...route,
    share: Number(safePercent(route.totalTimeMs, totalTime).toFixed(1)),
  }));

  const collections = analyzeCollections(mongoState?.local, mongoState?.indexUsage);
  const { score, parts } = computeProjectScore(metrics, collections);

  const queriesPerRequest = metrics.totals.requests
    ? metrics.mongo.totals.count / metrics.totals.requests
    : 0;

  const slowMongo = [...(metrics.mongo.commands || [])]
    .filter((command) => command.count >= 3)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, HOT_ROUTE_LIMIT);

  return {
    collectedAt: metrics.collectedAt,
    sampleWindow: {
      since: metrics.processStartedAt,
      uptimeSec: metrics.uptimeSec,
      requests: metrics.totals.requests,
      note: 'Метрики збираються в пам\'яті процесу і обнуляються після кожного деплою або сну інстансу.',
    },
    score,
    scoreParts: parts,
    totals: metrics.totals,
    concurrency: metrics.concurrency,
    statusCodes: metrics.statusCodes,
    runtime: metrics.runtime,
    minuteSeries: metrics.minuteSeries,
    hourSeries: metrics.hourSeries,
    routes: {
      tracked: routes.length,
      hot: hotRoutes,
      slow: buildSlowRoutes(routes),
      errors: buildErrorRoutes(routes),
      chatty: buildChattyRoutes(routes),
      heavyPayload: buildHeavyPayloadRoutes(routes),
    },
    recentSlow: metrics.recentSlow,
    recentErrors: metrics.recentErrors,
    database: {
      monitoring: metrics.mongo.monitoring,
      totals: metrics.mongo.totals,
      queriesPerRequest: Number(queriesPerRequest.toFixed(2)),
      slowCommands: slowMongo,
      recentSlow: metrics.mongo.recentSlow,
      collections,
      riskyCollections: collections.filter((collection) => collection.risks.length),
    },
    thresholds: metrics.thresholds,
  };
}

module.exports = { analyzeProject };
