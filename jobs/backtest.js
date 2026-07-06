#!/usr/bin/env node
require('dotenv').config();
const config = require('../config');
const { fetchYahooBars } = require('../services/market-data/yahooFx');
const { fetchMacroSnapshot } = require('../services/macro/snapshot');
const { runBacktest } = require('../services/backtest/runner');
const { getEffectiveConfig } = require('../services/learning/paramsStore');
const { normPair } = require('../services/utils');

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2).map(normPair)
  : [config.pair];

(async () => {
  const cfg = getEffectiveConfig(config);
  const macro = await fetchMacroSnapshot(true).catch(() => null);

  console.log('FX Backtest — layer engine v2');
  console.log(`minScore=${cfg.minBuyScore} minLayers=${cfg.minLayersAligned ?? 3}\n`);

  for (const pair of pairs) {
    const [m5, h1, m1] = await Promise.all([
      fetchYahooBars(pair, '5m', '5d', 50),
      fetchYahooBars(pair, '1h', '1mo', 50),
      fetchYahooBars(pair, '1m', '5d', 100),
    ]);

    const result = runBacktest(pair, m5.bars, h1.bars, m1.bars, cfg, macro);
    console.log(`${pair}: ${result.total} trades | W/L ${result.wins}/${result.losses} | WR ${result.winRate}% | P/L $${result.totalPnlUsd}`);
    for (const t of result.trades.slice(-5)) {
      console.log(`  ${t.side} ${t.exitReason} score=${t.score} layers=${t.layers} pnl=$${t.pnlUsd}`);
    }
    console.log('');
  }
})().catch((e) => {
  console.error('[backtest]', e.message);
  process.exit(1);
});
