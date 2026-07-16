#!/usr/bin/env node
/**
 * CHARLIE structural sweep backtest — event replay on Yahoo M5/H1.
 * Usage: npm run backtest:charlie
 *        npm run backtest:charlie -- EURUSD GBPUSD
 */
require('dotenv').config();
process.env.FX_SIGNAL_ENGINE = process.env.FX_SIGNAL_ENGINE || 'charlie';

const config = require('../config');
const { fetchYahooBars } = require('../services/market-data/yahooFx');
const { detectLiquiditySweep } = require('../services/analyzer/charlie/sweep');
const { computeDailyBias } = require('../services/analyzer/charlie/bias');
const { fetchDxySnapshot } = require('../services/macro/dxy');
const { normPair, priceToPips, round } = require('../services/utils');
const { getSpreadPips } = require('../services/executor/pricing');

const pairs = process.argv.slice(2).filter((a) => !a.startsWith('-')).length
  ? process.argv.slice(2).filter((a) => !a.startsWith('-')).map(normPair)
  : (config.pairs || ['EURUSD']).slice(0, 6);

function simulateTrade(signal, bars, fromIdx, pair) {
  const entry = signal.entry;
  const sl = signal.stopLoss;
  const tp = signal.takeProfit;
  const side = signal.side;
  if (entry == null || sl == null || tp == null) return null;

  for (let i = fromIdx; i < bars.length; i += 1) {
    const b = bars[i];
    if (side === 'long') {
      if (b.low <= sl) {
        return {
          exitReason: 'stop',
          exit: sl,
          pips: round(priceToPips(sl - entry, pair), 2),
          barsHeld: i - fromIdx + 1,
        };
      }
      if (b.high >= tp) {
        return {
          exitReason: 'take_profit',
          exit: tp,
          pips: round(priceToPips(tp - entry, pair), 2),
          barsHeld: i - fromIdx + 1,
        };
      }
    } else {
      if (b.high >= sl) {
        return {
          exitReason: 'stop',
          exit: sl,
          pips: round(priceToPips(entry - sl, pair), 2),
          barsHeld: i - fromIdx + 1,
        };
      }
      if (b.low <= tp) {
        return {
          exitReason: 'take_profit',
          exit: tp,
          pips: round(priceToPips(entry - tp, pair), 2),
          barsHeld: i - fromIdx + 1,
        };
      }
    }
  }
  return { exitReason: 'eod', exit: bars[bars.length - 1].close, pips: 0, barsHeld: bars.length - fromIdx };
}

function hourUtc(ts) {
  return new Date(ts).getUTCHours();
}

function inCharlieHours(ts, cfg) {
  const h = hourUtc(ts);
  const start = Number(String(cfg.charlieSessionStart || '07:00').split(':')[0]);
  const end = Number(String(cfg.charlieSessionEnd || '10:00').split(':')[0]);
  return h >= start && h < end;
}

async function backtestPair(pair, dxy) {
  const cfg = { ...config, charlieMode: true };
  const [m5, h1] = await Promise.all([
    fetchYahooBars(pair, '5m', '1mo', 200),
    fetchYahooBars(pair, '1h', '3mo', 100),
  ]);
  const bars = m5.bars || [];
  const h1bars = h1.bars || [];
  if (bars.length < 50) {
    return { pair, error: 'insufficient bars', trades: [] };
  }

  const spread = getSpreadPips(pair, cfg);
  const trades = [];
  const cooldownUntil = new Map();
  const minScore = cfg.charlieMinScore ?? 60;

  // Slide window: analyze on closed bars every 3 bars (~15 min)
  for (let i = 40; i < bars.length - 5; i += 3) {
    const ts = bars[i].ts;
    if (!inCharlieHours(ts, cfg)) continue;
    if ((cooldownUntil.get(pair) || 0) > ts) continue;

    const windowM5 = bars.slice(0, i + 1);
    const windowH1 = h1bars.filter((b) => b.ts <= ts);
    const mid = bars[i].close;
    const quote = {
      mid,
      bid: mid - (spread * 0.0001) / 2,
      ask: mid + (spread * 0.0001) / 2,
      spreadPips: spread,
    };
    // JPY pip size adjustment for quote - rough ok for sim
    if (pair.includes('JPY')) {
      quote.bid = mid - (spread * 0.01) / 2;
      quote.ask = mid + (spread * 0.01) / 2;
    }

    const dailyBias = computeDailyBias(pair, windowH1, windowM5, mid, dxy, cfg);
    const signal = detectLiquiditySweep(windowM5, windowH1, quote, pair, cfg, { dailyBias });

    if (signal.action !== 'BUY' && signal.action !== 'SELL') continue;
    if ((signal.score ?? 0) < minScore) continue;

    const result = simulateTrade(signal, bars, i + 1, pair);
    if (!result) continue;

    const pipVal = 1; // abstract $1/pip for relative PF
    const pnl = round(result.pips * pipVal, 2);
    trades.push({
      pair,
      side: signal.side,
      score: signal.score,
      level: signal.level?.label,
      bias: dailyBias.bias,
      entry: signal.entry,
      ...result,
      pnlUsd: pnl,
      ts: new Date(ts).toISOString(),
    });
    cooldownUntil.set(pair, ts + 4 * 3600000);
  }

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
  const pf = grossLoss > 0 ? round(grossWin / grossLoss, 2) : (grossWin > 0 ? 99 : 0);

  return {
    pair,
    total: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    totalPnlUsd: round(trades.reduce((s, t) => s + t.pnlUsd, 0), 2),
    pf,
    trades,
  };
}

(async () => {
  console.log('CHARLIE Backtest — liquidity sweep + bias + MSS');
  console.log(`pairs=${pairs.join(',')} session=${config.charlieSessionStart}-${config.charlieSessionEnd}UTC minScore=${config.charlieMinScore}\n`);

  let dxy = { bias: 'neutral' };
  try {
    dxy = await fetchDxySnapshot();
    console.log(`DXY bias (live proxy)=${dxy.bias} — note: historical DXY not replayed\n`);
  } catch (_) { /* ignore */ }

  const summaries = [];
  for (const pair of pairs) {
    try {
      const r = await backtestPair(pair, dxy);
      summaries.push(r);
      if (r.error) {
        console.log(`${pair}: ERROR ${r.error}`);
      } else {
        console.log(`${pair}: ${r.total} trades | W/L ${r.wins}/${r.losses} | WR ${r.winRate}% | PF ${r.pf} | P/L $${r.totalPnlUsd}`);
        for (const t of r.trades.slice(-3)) {
          console.log(`  ${t.ts?.slice(0, 16)} ${t.side} ${t.exitReason} score=${t.score} ${t.level || ''} bias=${t.bias} pips=${t.pips}`);
        }
      }
      console.log('');
    } catch (e) {
      console.error(`${pair}:`, e.message);
    }
  }

  const all = summaries.filter((s) => !s.error);
  const totalTrades = all.reduce((s, r) => s + r.total, 0);
  const totalPnl = round(all.reduce((s, r) => s + r.totalPnlUsd, 0), 2);
  const totalWins = all.reduce((s, r) => s + r.wins, 0);
  console.log(`TOTAL: ${totalTrades} trades | wins ${totalWins} | net $${totalPnl}`);
})().catch((e) => {
  console.error('[backtest:charlie]', e.message);
  process.exit(1);
});
