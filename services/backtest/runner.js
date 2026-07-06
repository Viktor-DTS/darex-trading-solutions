const { classifyMarketRegime } = require('../analyzer/regimeEngine');
const { evaluateLayers } = require('../analyzer/layerScore');
const { getSpreadPips, resolveTargetPips, tradePnlUsd } = require('../executor/pricing');
const { pipsToPrice, round, normPair, pipSize } = require('../utils');

function sliceBarsAt(bars, index) {
  return bars.slice(0, index + 1);
}

function simulateExit(trade, bar, spreadPips) {
  const ps = pipSize(trade.pair);
  const spread = spreadPips * ps;
  const bid = bar.close - spread / 2;
  const ask = bar.close + spread / 2;

  if (trade.side === 'long') {
    if (bid <= trade.stopLoss) {
      return { exit: trade.stopLoss, reason: 'stop' };
    }
    if (bid >= trade.takeProfit) {
      return { exit: trade.takeProfit, reason: 'take_profit' };
    }
  } else {
    if (ask >= trade.stopLoss) {
      return { exit: trade.stopLoss, reason: 'stop' };
    }
    if (ask <= trade.takeProfit) {
      return { exit: trade.takeProfit, reason: 'take_profit' };
    }
  }
  return null;
}

/**
 * Walk-forward backtest on 5m bars (uses same layer logic as live).
 */
function runBacktest(pairInput, bars5m, bars1h, bars1m, cfg, macro = null) {
  const pair = normPair(pairInput);
  const spreadPips = getSpreadPips(pair, cfg);
  const trades = [];
  let open = null;
  const startIdx = Math.max(50, 20);

  for (let i = startIdx; i < bars5m.length; i += 1) {
    const bar = bars5m[i];

    if (open) {
      const ex = simulateExit(open, bar, spreadPips);
      if (ex) {
        const { pips, pnlUsd } = tradePnlUsd(open, ex.exit, cfg.simCommissionUsd ?? 0.05);
        trades.push({
          ...open,
          exit: ex.exit,
          exitReason: ex.reason,
          closedAt: bar.ts,
          pips,
          pnlUsd,
        });
        open = null;
      }
      continue;
    }

    const m5Slice = sliceBarsAt(bars5m, i);
    const h1Slice = bars1h ? sliceBarsAt(bars1h, Math.min(bars1h.length - 1, Math.floor(i / 12))) : null;
    const m1Idx = Math.min(bars1m.length - 1, i * 5);
    const m1Slice = sliceBarsAt(bars1m, m1Idx);

    const marketRegime = classifyMarketRegime(m5Slice, h1Slice);
    const side = marketRegime.tradeAllowed ? marketRegime.direction : null;
    if (!side || (side === 'short' && cfg.allowShort === false)) continue;

    const mid = bar.close;
    const quote = { mid, bid: mid - spreadPips * pipSize(pair) / 2, ask: mid + spreadPips * pipSize(pair) / 2, spreadPips };

    const layerEval = evaluateLayers({
      pair,
      side,
      macro,
      bars1h: h1Slice,
      bars5m: m5Slice,
      bars1m: m1Slice,
      quote,
      marketRegime,
      cfg,
    });

    if (!layerEval.pass || layerEval.compositeScore < (cfg.minBuyScore ?? 85)) continue;

    const stopPips = cfg.stopPips ?? 5;
    const tpInfo = resolveTargetPips(pair, cfg, mid);
    const entry = mid;
    const stopLoss = side === 'long'
      ? round(entry - pipsToPrice(stopPips, pair), 5)
      : round(entry + pipsToPrice(stopPips, pair), 5);
    const takeProfit = side === 'long'
      ? round(entry + pipsToPrice(tpInfo.targetPips, pair), 5)
      : round(entry - pipsToPrice(tpInfo.targetPips, pair), 5);

    open = {
      pair,
      side,
      entry,
      stopLoss,
      takeProfit,
      openedAt: bar.ts,
      score: layerEval.compositeScore,
      layers: layerEval.alignedCount,
    };
  }

  if (open) {
    const last = bars5m[bars5m.length - 1];
    const { pips, pnlUsd } = tradePnlUsd(open, last.close, cfg.simCommissionUsd ?? 0.05);
    trades.push({
      ...open,
      exit: last.close,
      exitReason: 'end',
      closedAt: last.ts,
      pips,
      pnlUsd,
    });
  }

  const wins = trades.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const pnl = trades.reduce((s, t) => s + (t.pnlUsd || 0), 0);

  return {
    pair,
    trades,
    total: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? round((wins / trades.length) * 100, 1) : 0,
    totalPnlUsd: round(pnl, 2),
  };
}

module.exports = { runBacktest };
