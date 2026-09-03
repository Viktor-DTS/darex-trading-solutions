/**
 * Збір метрик роботи самого бекенду (in-process, без зовнішніх залежностей).
 *
 * Дані живуть у пам'яті процесу: після рестарту/деплою лічильники обнуляються,
 * а на Render free-плані інстанс ще й засинає — тому вікна навмисно короткі
 * (2 години поштучно і 48 годин погодинно), а не «за весь час».
 */
const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');

const MAX_TRACKED_ROUTES = 400;
const MINUTE_BUCKETS = 120;
const HOUR_BUCKETS = 48;
const SLOW_REQUEST_MS = 1000;
const SLOW_QUERY_MS = 200;
const RECENT_SLOW_LIMIT = 40;
const RECENT_ERROR_LIMIT = 40;

/** Межі гістограми латентності (мс). Дають перцентилі без зберігання всіх вимірів. */
const LATENCY_EDGES = [5, 10, 25, 50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000, 8000, 15000, Infinity];

const startedAt = new Date();

const state = {
  routes: new Map(),
  minuteBuckets: new Map(),
  hourBuckets: new Map(),
  statusCodes: new Map(),
  recentSlow: [],
  recentErrors: [],
  totals: {
    requests: 0,
    errors4xx: 0,
    errors5xx: 0,
    durationMs: 0,
    bytesOut: 0,
  },
  concurrency: {
    current: 0,
    peak: 0,
    peakAt: null,
  },
  mongo: {
    commands: new Map(),
    totals: { count: 0, durationMs: 0, failed: 0, slow: 0 },
    recentSlow: [],
    monitoring: false,
  },
  lastCpuSample: { at: Date.now(), usage: process.cpuUsage() },
  cpuPercent: 0,
};

let eventLoopHistogram = null;
try {
  eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();
} catch {
  eventLoopHistogram = null;
}

function emptyHistogram() {
  return new Array(LATENCY_EDGES.length).fill(0);
}

function addToHistogram(histogram, valueMs) {
  for (let i = 0; i < LATENCY_EDGES.length; i += 1) {
    if (valueMs <= LATENCY_EDGES[i]) {
      histogram[i] += 1;
      return;
    }
  }
}

/**
 * Перцентиль по гістограмі: повертає верхню межу кошика, у який потрапляє ранг.
 * Останній кошик безмежний, тому для нього віддаємо максимум спостережень.
 */
function percentileFromHistogram(histogram, total, percentile, maxMs) {
  if (!total) return 0;
  const target = Math.ceil((percentile / 100) * total);
  let cumulative = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    cumulative += histogram[i];
    if (cumulative >= target) {
      const edge = LATENCY_EDGES[i];
      // Перцентиль не може перевищувати фактичний максимум, навіть якщо межа кошика вища.
      return Number.isFinite(edge) ? Math.min(edge, Math.round(maxMs)) : Math.round(maxMs);
    }
  }
  return Math.round(maxMs);
}

/** Прибирає з шляху змінні частини, щоб /api/tasks/665f… і /api/tasks/667a… були одним рядком. */
function normalizePath(rawPath) {
  const path = String(rawPath || '').split('?')[0];
  const segments = path.split('/');
  const normalized = segments.map((segment) => {
    if (!segment) return segment;
    if (/^[0-9a-fA-F]{24}$/.test(segment)) return ':id';
    if (/^\d+$/.test(segment)) return ':num';
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(segment)) return ':uuid';
    if (segment.length > 3 && /\d{4,}/.test(segment) && /[A-Za-zА-Яа-яЇїІіЄєҐґ]/.test(segment)) return ':code';
    return segment;
  });
  return normalized.join('/') || '/';
}

function bucketKey(date, unitMs) {
  return Math.floor(date.getTime() / unitMs) * unitMs;
}

function trimBuckets(map, limit) {
  if (map.size <= limit) return;
  const keys = [...map.keys()].sort((a, b) => a - b);
  for (let i = 0; i < keys.length - limit; i += 1) {
    map.delete(keys[i]);
  }
}

function touchBucket(map, key) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { ts: key, count: 0, errors: 0, durationMs: 0, maxMs: 0, bytesOut: 0 };
    map.set(key, bucket);
  }
  return bucket;
}

function pushCapped(list, item, limit) {
  list.unshift(item);
  if (list.length > limit) list.length = limit;
}

function getRouteEntry(key, method, path) {
  let entry = state.routes.get(key);
  if (entry) return entry;
  if (state.routes.size >= MAX_TRACKED_ROUTES) {
    // Витісняємо найменш навантажений маршрут, щоб мапа не росла нескінченно.
    let leastKey = null;
    let leastCount = Infinity;
    for (const [candidateKey, candidate] of state.routes) {
      if (candidate.count < leastCount) {
        leastCount = candidate.count;
        leastKey = candidateKey;
      }
    }
    if (leastKey) state.routes.delete(leastKey);
  }
  entry = {
    key,
    method,
    path,
    count: 0,
    durationMs: 0,
    maxMs: 0,
    errors4xx: 0,
    errors5xx: 0,
    slow: 0,
    bytesOut: 0,
    histogram: emptyHistogram(),
    lastAt: null,
    lastStatus: 0,
  };
  state.routes.set(key, entry);
  return entry;
}

function refreshCpuPercent() {
  const now = Date.now();
  const elapsedMs = now - state.lastCpuSample.at;
  if (elapsedMs < 1000) return state.cpuPercent;
  const usage = process.cpuUsage(state.lastCpuSample.usage);
  const usedMs = (usage.user + usage.system) / 1000;
  const cores = Math.max(1, os.cpus()?.length || 1);
  state.cpuPercent = Math.min(100, (usedMs / (elapsedMs * cores)) * 100);
  state.lastCpuSample = { at: now, usage: process.cpuUsage() };
  return state.cpuPercent;
}

/** Express middleware: рахує кожен API-запит. Ставиться одразу після body-парсерів. */
function createRequestMetricsMiddleware(options = {}) {
  const ignorePatterns = options.ignorePatterns || [/^\/api\/ping/, /^\/api\/system-health\/(?!config)/];

  return function requestMetricsMiddleware(req, res, next) {
    const originalUrl = req.originalUrl || req.url || '';
    if (!originalUrl.startsWith('/api')) return next();
    if (ignorePatterns.some((pattern) => pattern.test(originalUrl))) return next();

    const startedHr = process.hrtime.bigint();
    state.concurrency.current += 1;
    if (state.concurrency.current > state.concurrency.peak) {
      state.concurrency.peak = state.concurrency.current;
      state.concurrency.peakAt = new Date().toISOString();
    }

    let finished = false;
    const finalize = () => {
      if (finished) return;
      finished = true;
      state.concurrency.current = Math.max(0, state.concurrency.current - 1);

      const durationMs = Number(process.hrtime.bigint() - startedHr) / 1e6;
      const status = res.statusCode || 0;
      const method = String(req.method || 'GET').toUpperCase();
      const path = normalizePath(originalUrl);
      const key = `${method} ${path}`;
      const bytesOut = Number(res.getHeader('content-length')) || 0;
      const at = new Date();

      const entry = getRouteEntry(key, method, path);
      entry.count += 1;
      entry.durationMs += durationMs;
      entry.maxMs = Math.max(entry.maxMs, durationMs);
      entry.bytesOut += bytesOut;
      entry.lastAt = at.toISOString();
      entry.lastStatus = status;
      addToHistogram(entry.histogram, durationMs);

      state.totals.requests += 1;
      state.totals.durationMs += durationMs;
      state.totals.bytesOut += bytesOut;

      const statusKey = String(status);
      state.statusCodes.set(statusKey, (state.statusCodes.get(statusKey) || 0) + 1);

      const isError = status >= 400;
      if (status >= 500) {
        entry.errors5xx += 1;
        state.totals.errors5xx += 1;
      } else if (status >= 400) {
        entry.errors4xx += 1;
        state.totals.errors4xx += 1;
      }

      const minuteBucket = touchBucket(state.minuteBuckets, bucketKey(at, 60_000));
      const hourBucket = touchBucket(state.hourBuckets, bucketKey(at, 3_600_000));
      for (const bucket of [minuteBucket, hourBucket]) {
        bucket.count += 1;
        bucket.durationMs += durationMs;
        bucket.bytesOut += bytesOut;
        bucket.maxMs = Math.max(bucket.maxMs, durationMs);
        if (isError) bucket.errors += 1;
      }
      trimBuckets(state.minuteBuckets, MINUTE_BUCKETS);
      trimBuckets(state.hourBuckets, HOUR_BUCKETS);

      if (durationMs >= SLOW_REQUEST_MS) {
        entry.slow += 1;
        pushCapped(
          state.recentSlow,
          { at: at.toISOString(), method, path, status, durationMs: Math.round(durationMs), user: req.user?.login || '' },
          RECENT_SLOW_LIMIT,
        );
      }
      if (status >= 500) {
        pushCapped(
          state.recentErrors,
          { at: at.toISOString(), method, path, status, durationMs: Math.round(durationMs), user: req.user?.login || '' },
          RECENT_ERROR_LIMIT,
        );
      }

      refreshCpuPercent();
    };

    res.on('finish', finalize);
    res.on('close', finalize);
    next();
  };
}

/**
 * Слухає command monitoring драйвера MongoDB, щоб бачити тривалість запитів
 * у розрізі колекцій. Вимагає monitorCommands: true в опціях підключення.
 */
function attachMongoMonitoring(mongooseInstance) {
  if (state.mongo.monitoring) return true;
  let client = null;
  try {
    client = mongooseInstance?.connection?.getClient?.();
  } catch {
    client = null;
  }
  if (!client || typeof client.on !== 'function') return false;

  const ignoredCommands = new Set(['ismaster', 'hello', 'ping', 'endSessions', 'buildInfo', 'saslStart', 'saslContinue']);
  // Назва колекції є лише в commandStarted, тому переносимо її до succeeded/failed через requestId.
  const inFlight = new Map();

  const record = (event, failed) => {
    const commandName = String(event?.commandName || '');
    if (!commandName || ignoredCommands.has(commandName)) return;
    const pending = inFlight.get(event?.requestId);
    inFlight.delete(event?.requestId);
    const collection = pending?.collection || '—';
    const key = `${collection}.${commandName}`;
    let entry = state.mongo.commands.get(key);
    if (!entry) {
      if (state.mongo.commands.size >= MAX_TRACKED_ROUTES) return;
      entry = { key, collection, command: commandName, count: 0, durationMs: 0, maxMs: 0, failed: 0, slow: 0 };
      state.mongo.commands.set(key, entry);
    }
    const durationMs = Number(event?.duration) || 0;
    entry.count += 1;
    entry.durationMs += durationMs;
    entry.maxMs = Math.max(entry.maxMs, durationMs);
    if (failed) entry.failed += 1;

    state.mongo.totals.count += 1;
    state.mongo.totals.durationMs += durationMs;
    if (failed) state.mongo.totals.failed += 1;
    if (durationMs >= SLOW_QUERY_MS) {
      entry.slow += 1;
      state.mongo.totals.slow += 1;
      pushCapped(
        state.mongo.recentSlow,
        { at: new Date().toISOString(), collection, command: commandName, durationMs: Math.round(durationMs) },
        RECENT_SLOW_LIMIT,
      );
    }
  };

  client.on('commandStarted', (event) => {
    const commandName = String(event?.commandName || '');
    if (!commandName || ignoredCommands.has(commandName)) return;
    const target = event?.command?.[commandName];
    if (inFlight.size > 5000) inFlight.clear();
    inFlight.set(event.requestId, {
      collection: typeof target === 'string' && target ? target : event?.databaseName || '—',
    });
  });
  client.on('commandSucceeded', (event) => record(event, false));
  client.on('commandFailed', (event) => record(event, true));
  state.mongo.monitoring = true;
  return true;
}

function summarizeRoutes() {
  return [...state.routes.values()].map((entry) => ({
    key: entry.key,
    method: entry.method,
    path: entry.path,
    count: entry.count,
    avgMs: entry.count ? Math.round(entry.durationMs / entry.count) : 0,
    p95Ms: percentileFromHistogram(entry.histogram, entry.count, 95, entry.maxMs),
    p99Ms: percentileFromHistogram(entry.histogram, entry.count, 99, entry.maxMs),
    maxMs: Math.round(entry.maxMs),
    slow: entry.slow,
    errors4xx: entry.errors4xx,
    errors5xx: entry.errors5xx,
    errorRate: entry.count ? ((entry.errors4xx + entry.errors5xx) / entry.count) * 100 : 0,
    avgPayloadKb: entry.count ? Math.round(entry.bytesOut / entry.count / 1024) : 0,
    totalTimeMs: Math.round(entry.durationMs),
    lastAt: entry.lastAt,
    lastStatus: entry.lastStatus,
  }));
}

function summarizeBuckets(map, limit) {
  return [...map.values()]
    .sort((a, b) => a.ts - b.ts)
    .slice(-limit)
    .map((bucket) => ({
      ts: bucket.ts,
      count: bucket.count,
      errors: bucket.errors,
      avgMs: bucket.count ? Math.round(bucket.durationMs / bucket.count) : 0,
      maxMs: Math.round(bucket.maxMs),
      bytesOut: bucket.bytesOut,
    }));
}

function eventLoopStats() {
  if (!eventLoopHistogram) return { meanMs: 0, p99Ms: 0, maxMs: 0, available: false };
  return {
    meanMs: Number((eventLoopHistogram.mean / 1e6).toFixed(2)),
    p99Ms: Number((eventLoopHistogram.percentile(99) / 1e6).toFixed(2)),
    maxMs: Number((eventLoopHistogram.max / 1e6).toFixed(2)),
    available: true,
  };
}

function getRequestMetricsSnapshot() {
  refreshCpuPercent();
  const memory = process.memoryUsage();
  const routes = summarizeRoutes();
  const totalRequests = state.totals.requests;
  const globalHistogram = emptyHistogram();
  let globalMax = 0;
  for (const entry of state.routes.values()) {
    for (let i = 0; i < globalHistogram.length; i += 1) globalHistogram[i] += entry.histogram[i];
    globalMax = Math.max(globalMax, entry.maxMs);
  }

  const mongoCommands = [...state.mongo.commands.values()].map((entry) => ({
    ...entry,
    avgMs: entry.count ? Math.round(entry.durationMs / entry.count) : 0,
    maxMs: Math.round(entry.maxMs),
    durationMs: Math.round(entry.durationMs),
  }));

  return {
    collectedAt: new Date().toISOString(),
    processStartedAt: startedAt.toISOString(),
    uptimeSec: Math.round(process.uptime()),
    windows: { minutes: MINUTE_BUCKETS, hours: HOUR_BUCKETS },
    thresholds: { slowRequestMs: SLOW_REQUEST_MS, slowQueryMs: SLOW_QUERY_MS },
    totals: {
      requests: totalRequests,
      errors4xx: state.totals.errors4xx,
      errors5xx: state.totals.errors5xx,
      errorRate: totalRequests ? ((state.totals.errors4xx + state.totals.errors5xx) / totalRequests) * 100 : 0,
      serverErrorRate: totalRequests ? (state.totals.errors5xx / totalRequests) * 100 : 0,
      avgMs: totalRequests ? Math.round(state.totals.durationMs / totalRequests) : 0,
      p95Ms: percentileFromHistogram(globalHistogram, totalRequests, 95, globalMax),
      p99Ms: percentileFromHistogram(globalHistogram, totalRequests, 99, globalMax),
      maxMs: Math.round(globalMax),
      bytesOut: state.totals.bytesOut,
      requestsPerMin: process.uptime() > 0 ? totalRequests / (process.uptime() / 60) : 0,
    },
    concurrency: { ...state.concurrency },
    statusCodes: Object.fromEntries([...state.statusCodes.entries()].sort((a, b) => b[1] - a[1])),
    routes,
    minuteSeries: summarizeBuckets(state.minuteBuckets, MINUTE_BUCKETS),
    hourSeries: summarizeBuckets(state.hourBuckets, HOUR_BUCKETS),
    recentSlow: state.recentSlow.slice(0, RECENT_SLOW_LIMIT),
    recentErrors: state.recentErrors.slice(0, RECENT_ERROR_LIMIT),
    mongo: {
      monitoring: state.mongo.monitoring,
      totals: {
        ...state.mongo.totals,
        durationMs: Math.round(state.mongo.totals.durationMs),
        avgMs: state.mongo.totals.count ? Math.round(state.mongo.totals.durationMs / state.mongo.totals.count) : 0,
      },
      commands: mongoCommands,
      recentSlow: state.mongo.recentSlow.slice(0, RECENT_SLOW_LIMIT),
    },
    runtime: {
      nodeVersion: process.version,
      pid: process.pid,
      cpuPercent: Number(state.cpuPercent.toFixed(1)),
      cpuCores: os.cpus()?.length || 0,
      loadAvg1: Number((os.loadavg()?.[0] || 0).toFixed(2)),
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      externalMb: Math.round(memory.external / 1024 / 1024),
      systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
      systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
      eventLoop: eventLoopStats(),
    },
  };
}

function resetRequestMetrics() {
  state.routes.clear();
  state.minuteBuckets.clear();
  state.hourBuckets.clear();
  state.statusCodes.clear();
  state.recentSlow.length = 0;
  state.recentErrors.length = 0;
  state.totals = { requests: 0, errors4xx: 0, errors5xx: 0, durationMs: 0, bytesOut: 0 };
  state.concurrency = { current: state.concurrency.current, peak: state.concurrency.current, peakAt: null };
  state.mongo.commands.clear();
  state.mongo.totals = { count: 0, durationMs: 0, failed: 0, slow: 0 };
  state.mongo.recentSlow.length = 0;
  eventLoopHistogram?.reset?.();
}

module.exports = {
  createRequestMetricsMiddleware,
  attachMongoMonitoring,
  getRequestMetricsSnapshot,
  resetRequestMetrics,
  normalizePath,
  SLOW_REQUEST_MS,
  SLOW_QUERY_MS,
};
