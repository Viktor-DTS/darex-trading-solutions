require('dotenv').config();
const express = require('express');
const config = require('../config');
const { analyzePair } = require('../services/analyzer');
const { readState } = require('../services/state');
const { readRecent, summarize } = require('../services/journal');
const { getActiveBlackouts, isNewsBlackout } = require('../services/calendar/newsBlackout');

const app = express();
app.use(express.json());

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
  });
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
    return res.json({ worker: 'offline', hint: 'npm start' });
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

app.listen(config.apiPort, () => {
  console.log(`[fx-api] http://0.0.0.0:${config.apiPort}`);
});
