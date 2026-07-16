require('dotenv').config();
const path = require('path');
const express = require('express');
const config = require('../config');
const idealAnalyzer = require('../services/analyzer');
const charlieAnalyzer = require('../services/analyzer/charlie');
const analyzePair = config.charlieMode
  ? charlieAnalyzer.analyzePairCharlie
  : idealAnalyzer.analyzePair;
const { readRecent, summarize, getOpenEntries, clearJournal } = require('../services/journal');
const { getWorkerState } = require('../services/stateCache');
const { enrichWithJournal } = require('../services/stateMerge');
const { getActiveBlackouts, getCalendarStatus } = require('../services/calendar');
const supervisor = require('../services/supervisor');
const panelAuth = require('../services/auth/panelAuth');
const { OandaClient } = require('../services/executor/oandaClient');
const { CapitalClient } = require('../services/executor/capitalClient');
const { getCapitalStatus } = require('../services/capitalStatusCache');
const { resolveExecutorMode } = require('../services/executor');

const app = express();
app.use(express.json());

const PUBLIC_PATHS = new Set(['/health', '/auth/login', '/auth/status']);

function apiSecretGuard(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();

  const machineSecret = req.get('X-Fx-Scalp-Secret');
  if (config.apiSecret && machineSecret === config.apiSecret) return next();

  const bearer = req.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  if (bearer && panelAuth.verifyToken(config, bearer)) return next();

  if (!panelAuth.authEnabled(config)) return next();

  res.status(401).json({
    error: 'Unauthorized',
    hint: panelAuth.loginRequired(config) ? 'Увійдіть через panel login' : 'Bearer token або X-Fx-Scalp-Secret',
  });
}

app.use((req, res, next) => {
  const origin = req.get('Origin');
  const allowed = String(config.corsOrigins || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      if (entry === '*') return ['*'];
      if (/^https?:\/\//i.test(entry)) return [entry.replace(/\/+$/, '')];
      return [`https://${entry.replace(/\/+$/, '')}`];
    });
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Fx-Scalp-Secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(apiSecretGuard);

const dashboardDir = path.join(__dirname, '../dashboard');
app.use('/dashboard', express.static(dashboardDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(dashboardDir, 'index.html'));
});

app.get('/health', (_req, res) => {
  let charlie = null;
  if (config.charlieMode) {
    try {
      const { getCharlieWindow } = require('../services/analyzer/charlie');
      const w = getCharlieWindow(new Date(), config);
      charlie = {
        engine: config.signalEngine,
        alwaysOn: config.charlieAlwaysOn !== false,
        marketHunt: config.charlieMarketHunt !== false,
        universeMax: config.charlieUniverseMax,
        universeRotate: config.charlieUniverseRotate,
        window: w.name,
        active: w.active,
        label: w.label,
        minScore: config.charlieMinScore,
        maxPairs: config.charlieMaxPairs,
        scanPairs: config.charlieScanPairs,
        london: config.charlieAlwaysOn !== false
          ? 'off (activity)'
          : `${config.charlieSessionStart}-${config.charlieSessionEnd}`,
        ny: config.charlieAlwaysOn !== false
          ? 'off (activity)'
          : (config.charlieNyFallback !== false
            ? `${config.charlieNyStart}-${config.charlieNyEnd}`
            : 'off'),
        close: config.charlieAlwaysOn !== false
          ? 'off (activity)'
          : (config.charlieLondonClose !== false
            ? `${config.charlieCloseStart}-${config.charlieCloseEnd}`
            : 'off'),
        requireMss: config.charlieRequireMss !== false,
        strictMss: config.charlieStrictMss !== false,
      };
    } catch (_) {
      charlie = { engine: config.signalEngine, error: true };
    }
  }
  res.json({
    ok: true,
    pair: config.pair,
    pairs: config.pairs,
    mode: config.mode,
    signalEngine: config.signalEngine,
    provider: config.dataProvider,
    tickMs: config.tickMs,
    simulate: config.simulate,
    newsBlackout: config.newsBlackout,
    dxyFilter: config.dxyFilter,
    charlie,
    panel: true,
    auth: {
      enabled: panelAuth.authEnabled(config),
      loginRequired: panelAuth.loginRequired(config),
    },
  });
});

app.get('/auth/status', (_req, res) => {
  res.json({
    loginRequired: panelAuth.loginRequired(config),
    authEnabled: panelAuth.authEnabled(config),
    user: config.panelUser,
  });
});

app.post('/auth/login', (req, res) => {
  const user = req.body?.user || req.body?.login;
  const password = req.body?.password;
  const result = panelAuth.checkCredentials(config, user, password);
  if (!result.ok) return res.status(401).json(result);
  res.json(result);
});

app.get('/control/status', (_req, res) => {
  res.json(supervisor.getControlStatus());
});

app.post('/control/worker/start', (req, res) => {
  const force = req.query.force === '1' || req.body?.force === true;
  const result = supervisor.startWorker({ force });
  if (!result.ok) {
    return res.status(409).json({
      ...result,
      hint: result.externalPid ? 'npm run panel:stop або Start з підтвердженням' : undefined,
    });
  }
  res.json(result);
});

app.post('/control/worker/stop', (_req, res) => {
  const result = supervisor.stopWorker();
  if (!result.ok) return res.status(409).json(result);
  res.json(result);
});

app.get('/control/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 150, 500);
  res.json({ lines: supervisor.getLogs(limit) });
});

app.get('/oanda/status', async (_req, res) => {
  const mode = resolveExecutorMode(config);
  const client = new OandaClient(config);
  const base = {
    executorMode: mode,
    provider: config.dataProvider,
    env: config.oanda?.env || 'practice',
    account: config.oanda?.accountId ? `…${String(config.oanda.accountId).slice(-4)}` : null,
    configured: client.configured,
    simulate: config.simulate,
  };

  if (!client.configured) {
    return res.json({
      ...base,
      connected: false,
      hint: 'Додайте FX_OANDA_TOKEN + FX_OANDA_ACCOUNT, FX_EXECUTOR=oanda',
    });
  }

  try {
    const summary = await client.getAccountSummary();
    const acct = summary.account || {};
    res.json({
      ...base,
      connected: true,
      balance: acct.balance != null ? Number(acct.balance) : null,
      currency: acct.currency || null,
      openTradeCount: acct.openTradeCount != null ? Number(acct.openTradeCount) : null,
      unrealizedPL: acct.unrealizedPL != null ? Number(acct.unrealizedPL) : null,
      marginAvailable: acct.marginAvailable != null ? Number(acct.marginAvailable) : null,
    });
  } catch (e) {
    res.status(502).json({ ...base, connected: false, error: e.message });
  }
});

app.get('/capital/status', async (_req, res) => {
  try {
    const data = await getCapitalStatus(config);
    res.json(data);
  } catch (e) {
    res.status(500).json({ connected: false, error: e.message });
  }
});

app.get('/analyze', async (req, res) => {
  try {
    const pair = req.query.pair || config.pair;
    const result = await analyzePair(pair);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/state', (_req, res) => {
  const control = supervisor.getControlStatus();
  let state = getWorkerState();
  if (!state) {
    if (control.managed || control.externalWorkerLikely) {
      return res.json({
        worker: 'online',
        hint: control.stateFresh ? null : 'Worker online — синхронізація state…',
        tickCount: control.tickCount,
        pid: control.pid,
        pairs: config.pairs,
        pair: config.pair,
        maxOpenPositions: config.maxOpenPositions,
      });
    }
    return res.json({ worker: 'offline', hint: 'Запустіть worker через панель або npm start' });
  }
  state = enrichWithJournal(state, summarize());
  res.json(state);
});

app.get('/journal', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ summary: summarize(), events: readRecent(limit) });
});

app.post('/journal/clear', (req, res) => {
  try {
    const force = req.query.force === '1' || req.body?.force === true;
    const open = getOpenEntries();
    if (open.length && !force) {
      return res.status(409).json({
        error: 'Є відкриті угоди в журналі',
        openCount: open.length,
        hint: 'Закрийте позиції або передайте force=1',
      });
    }

    const cleared = clearJournal({ backup: true });
    const { resetStatsBaseline } = require('../services/learning');
    const learned = resetStatsBaseline();

    let workerRestart = null;
    if (supervisor.isManagedRunning()) {
      supervisor.stopWorker();
      workerRestart = { stopped: true };
      setTimeout(() => {
        const r = supervisor.startWorker({ force: false });
        workerRestart.started = r.ok;
        workerRestart.reason = r.reason || r.error;
      }, 1500);
    }

    res.json({
      ok: true,
      cleared,
      learned,
      summary: summarize(),
      workerRestart,
      message: 'Журнал очищено — статистика з нуля',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/testbot/journal', (req, res) => {
  if (!config.testbot?.enabled) {
    return res.json({ enabled: false, summary: null, events: [] });
  }
  const fileName = config.testbot.journalFile || 'testbot-trades.jsonl';
  const { readAllEvents, summarize: summarizeTb } = require('../services/testbot/journal');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = readAllEvents(fileName).slice(-limit);
  res.json({ enabled: true, summary: summarizeTb(fileName), events });
});

app.get('/oracle/stats', (_req, res) => {
  if (!config.oracle?.enabled) {
    return res.json({ enabled: false, stats: null });
  }
  const { summarizeOracleStats } = require('../services/oracle');
  const { getPendingCount } = require('../services/oracle/reconcile');
  res.json({
    enabled: true,
    stats: summarizeOracleStats(config.oracle),
    pending: getPendingCount(),
    config: {
      horizonSec: config.oracle.horizonSec,
      minPUp: config.oracle.minPUp,
      tradeEnabled: config.oracle.tradeEnabled,
    },
  });
});

app.get('/oracle/forecasts', (req, res) => {
  if (!config.oracle?.enabled) {
    return res.json({ enabled: false, forecasts: [], actuals: [] });
  }
  const { readForecasts, readActuals } = require('../services/oracle/journal');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({
    enabled: true,
    forecasts: readForecasts(limit, config.oracle),
    actuals: readActuals(limit, config.oracle),
  });
});

app.post('/testbot/clear', (req, res) => {
  try {
    if (!config.testbot?.enabled) {
      return res.status(400).json({ error: 'Testbot вимкнено (FX_TESTBOT_ENABLED=1)' });
    }
    const fileName = config.testbot.journalFile || 'testbot-trades.jsonl';
    const { getOpenEntries, clearTestbotJournal, summarize: summarizeTb } = require('../services/testbot/journal');
    const { requestTestbotClear } = require('../services/testbot/clearRequest');

    const force = req.query.force === '1' || req.body?.force === true;
    const openJournal = getOpenEntries(fileName);
    const state = getWorkerState();
    const openLive = state?.testbot?.openTrades?.length ?? openJournal.length;

    if (openLive > 0 && !force) {
      return res.status(409).json({
        error: 'Є відкриті testbot sim-позиції',
        openCount: openLive,
        hint: 'Передайте force=1 щоб скинути все',
      });
    }

    const cleared = clearTestbotJournal(fileName, { backup: true });
    requestTestbotClear({ force: Boolean(force) });

    res.json({
      ok: true,
      cleared,
      summary: summarizeTb(fileName),
      message: 'Testbot журнал очищено — статистика з нуля (sim-позиції скинуться протягом ~1с)',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Runtime overrides (disk) — invert / $TP / $SL without changing stake sizing. */
app.get('/testbot/settings', (_req, res) => {
  const { readRuntimeSettings, mergeTestbotConfig } = require('../services/testbot/runtimeSettings');
  const effective = mergeTestbotConfig(config.testbot || {});
  res.json({
    enabled: Boolean(config.testbot?.enabled),
    runtime: readRuntimeSettings(),
    effective: {
      invertDirection: effective.invertDirection === true,
      targetUsd: effective.targetUsd,
      partialUsd: effective.partialUsd,
      maxStopLossUsd: effective.maxStopLossUsd,
      minScore: effective.minScore,
      riskPerTradePct: effective.riskPerTradePct,
    },
    envDefaults: {
      invertDirection: config.testbot?.invertDirection === true,
      targetUsd: config.testbot?.targetUsd,
      partialUsd: config.testbot?.partialUsd,
      maxStopLossUsd: config.testbot?.maxStopLossUsd,
    },
  });
});

app.post('/testbot/settings', (req, res) => {
  try {
    if (!config.testbot?.enabled) {
      return res.status(400).json({ error: 'Testbot вимкнено (FX_TESTBOT_ENABLED=1)' });
    }
    const {
      writeRuntimeSettings,
      clearRuntimeSettings,
      mergeTestbotConfig,
    } = require('../services/testbot/runtimeSettings');
    const body = req.body || {};

    if (body.clear === true || body.reset === true) {
      clearRuntimeSettings();
      return res.json({
        ok: true,
        runtime: {},
        effective: mergeTestbotConfig(config.testbot || {}),
        message: 'Runtime overrides скинуто → знову env',
      });
    }

    // Preset from debate: invert + symmetric $3 / $3 (stakes unchanged)
    if (body.preset === 'flip' || body.preset === 'invert_symmetric') {
      const runtime = writeRuntimeSettings({
        invertDirection: true,
        targetUsd: 3,
        partialUsd: 1.5,
        maxStopLossUsd: 6,
      });
      return res.json({
        ok: true,
        runtime,
        effective: mergeTestbotConfig(config.testbot || {}),
        message: 'FLIP preset: invert ON, TP=$3, SL=$6, partial=$1.5 (risk% без змін)',
      });
    }

    if (body.preset === 'flip_off' || body.preset === 'normal') {
      const runtime = writeRuntimeSettings({
        invertDirection: false,
        targetUsd: 3,
        partialUsd: 1.5,
        maxStopLossUsd: 6,
      });
      return res.json({
        ok: true,
        runtime,
        effective: mergeTestbotConfig(config.testbot || {}),
        message: 'Flip OFF: invert вимкнено, TP=$3, SL=$6',
      });
    }

    const patch = {};
    if (body.invertDirection != null) patch.invertDirection = Boolean(body.invertDirection);
    if (body.targetUsd != null) patch.targetUsd = Number(body.targetUsd);
    if (body.partialUsd != null) patch.partialUsd = Number(body.partialUsd);
    if (body.maxStopLossUsd != null) patch.maxStopLossUsd = Number(body.maxStopLossUsd);
    if (body.minScore != null) patch.minScore = Number(body.minScore);

    if (!Object.keys(patch).length) {
      return res.status(400).json({
        error: 'Порожній body',
        hint: 'Передайте preset:"flip" або invertDirection/targetUsd/maxStopLossUsd',
      });
    }

    const runtime = writeRuntimeSettings(patch);
    res.json({
      ok: true,
      runtime,
      effective: mergeTestbotConfig(config.testbot || {}),
      message: 'Runtime settings оновлено (наступні sim-входи)',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/calendar', async (_req, res) => {
  try {
    const { fetchCalendar } = require('../services/calendar/calendarService');
    await fetchCalendar().catch(() => null);
    res.json(getCalendarStatus(new Date()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/calendar/refresh', async (_req, res) => {
  try {
    const { fetchCalendar } = require('../services/calendar/calendarService');
    const cal = await fetchCalendar({ force: true });
    res.json({ ok: true, ...getCalendarStatus(new Date()), events: cal.events?.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/learning', (_req, res) => {
  const { readLearnedParams } = require('../services/learning/paramsStore');
  const { getClosedTrades } = require('../services/journal');
  const { computeMetrics } = require('../services/learning/metrics');
  const learned = readLearnedParams();
  const recent = getClosedTrades(500).slice(-50);
  res.json({ ...learned, metrics: computeMetrics(recent) });
});

app.post('/learning/run', async (req, res) => {
  try {
    const { runLearningCycle } = require('../services/learning');
    const dryRun = req.query.dryRun === '1' || req.body?.dryRun === true;
    const result = await runLearningCycle({ dryRun });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/learning/resume', (_req, res) => {
  try {
    const { resumeLearning } = require('../services/learning');
    const learned = resumeLearning();
    res.json({ ok: true, learned });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/learning/pause', (req, res) => {
  try {
    const { pauseLearning } = require('../services/learning');
    const reason = req.body?.reason || 'вручну з панелі';
    const learned = pauseLearning(reason);
    res.json({ ok: true, learned });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function shutdown() {
  if (supervisor.isManagedRunning()) {
    supervisor.stopWorker();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const host = process.env.FX_API_HOST || '0.0.0.0';
const server = app.listen(config.apiPort, host, () => {
  const local = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`[fx-panel] http://${local}:${config.apiPort} (bind ${host})`);
  console.log('[fx-panel] dashboard + API + worker control');
  if (config.apiSecret) console.log('[fx-panel] API secret: enabled');
  if (config.panelPassword) console.log('[fx-panel] Panel login: enabled');
  if (config.autoStartWorker) {
    setTimeout(() => {
      const st = supervisor.getControlStatus();
      if (!st.managed && !st.externalWorkerLikely) {
        const r = supervisor.startWorker({ force: false });
        if (r.ok) {
          console.log('[fx-panel] auto-start worker: started');
        } else if (r.externalPid) {
          console.log('[fx-panel] auto-start worker: already running PID', r.externalPid);
        } else {
          console.log('[fx-panel] auto-start worker:', r.reason || r.error || 'skipped');
        }
      }
    }, 2500);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[fx-panel] Порт ${config.apiPort} вже зайнятий.`);
    console.error(`  → Можливо панель вже працює: http://127.0.0.1:${config.apiPort}`);
    console.error('  → Або звільни порт: npm run panel:stop');
    process.exit(1);
  }
  throw err;
});
