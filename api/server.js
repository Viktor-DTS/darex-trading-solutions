require('dotenv').config();
const path = require('path');
const express = require('express');
const config = require('../config');
const { analyzePair } = require('../services/analyzer');
const { readRecent, summarize } = require('../services/journal');
const { getWorkerState } = require('../services/stateCache');
const { enrichWithJournal } = require('../services/stateMerge');
const { getActiveBlackouts, getCalendarStatus } = require('../services/calendar');
const supervisor = require('../services/supervisor');

const app = express();
app.use(express.json());

function apiSecretGuard(req, res, next) {
  const secret = config.apiSecret;
  if (!secret) return next();
  if (req.path === '/health') return next();
  const hdr = req.get('X-Fx-Scalp-Secret')
    || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (hdr === secret) return next();
  res.status(401).json({ error: 'Unauthorized', hint: 'X-Fx-Scalp-Secret або Bearer token' });
}

app.use((req, res, next) => {
  const origin = req.get('Origin');
  const allowed = String(config.corsOrigins || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
  res.json({
    ok: true,
    pair: config.pair,
    pairs: config.pairs,
    mode: config.mode,
    provider: config.dataProvider,
    tickMs: config.tickMs,
    simulate: config.simulate,
    newsBlackout: config.newsBlackout,
    dxyFilter: config.dxyFilter,
    panel: true,
  });
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
  let state = getWorkerState();
  if (!state) {
    return res.json({ worker: 'offline', hint: 'Запустіть worker через панель або npm start' });
  }
  state = enrichWithJournal(state, summarize());
  res.json(state);
});

app.get('/journal', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ summary: summarize(), events: readRecent(limit) });
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
  res.json(readLearnedParams());
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
  if (config.autoStartWorker) {
    setTimeout(() => {
      const st = supervisor.getControlStatus();
      if (!st.managed && !st.externalWorkerLikely) {
        const r = supervisor.startWorker({ force: false });
        console.log('[fx-panel] auto-start worker:', r.ok ? 'started' : r.reason || r.error || 'skipped');
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
