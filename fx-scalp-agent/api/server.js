require('dotenv').config();
const path = require('path');
const express = require('express');
const config = require('../config');
const { analyzePair } = require('../services/analyzer');
const { readState } = require('../services/state');
const { readRecent, summarize } = require('../services/journal');
const { getActiveBlackouts, isNewsBlackout } = require('../services/calendar/newsBlackout');
const supervisor = require('../services/supervisor');

const app = express();
app.use(express.json());

const dashboardDir = path.join(__dirname, '../dashboard');
app.use('/dashboard', express.static(dashboardDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(dashboardDir, 'index.html'));
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    pair: config.pair,
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

app.post('/control/worker/start', (_req, res) => {
  const result = supervisor.startWorker();
  if (!result.ok) return res.status(409).json(result);
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
  const state = readState();
  if (!state) {
    return res.json({ worker: 'offline', hint: 'Запустіть worker через панель або npm start' });
  }
  res.json(state);
});

app.get('/journal', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ summary: summarize(), events: readRecent(limit) });
});

app.get('/calendar', (_req, res) => {
  const now = new Date();
  res.json({
    blackouts: getActiveBlackouts(now),
    active: isNewsBlackout(now),
  });
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

app.listen(config.apiPort, () => {
  console.log(`[fx-panel] http://127.0.0.1:${config.apiPort}`);
  console.log('[fx-panel] dashboard + API + worker control');
});
