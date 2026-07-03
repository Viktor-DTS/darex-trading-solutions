require('dotenv').config();
const express = require('express');
const config = require('../config');
const { analyzePair } = require('../services/analyzer');

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
  res.json({
    note: 'Run worker separately: npm start. Future: Redis shared state.',
  });
});

app.listen(config.apiPort, () => {
  console.log(`[fx-api] http://0.0.0.0:${config.apiPort}`);
});
