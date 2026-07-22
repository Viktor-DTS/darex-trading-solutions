const config = require('../../config');
const { DEFAULTS } = require('./paramsStore');
const { computeMetrics } = require('./metrics');

/**
 * Rule-based tuner from closed trades (no ML yet).
 * Adjusts minBuyScore, stopPips, targetPips within safe bounds.
 */
function tuneParams(current, metrics, trades, options = {}) {
  const next = {
    minBuyScore: current.minBuyScore ?? DEFAULTS.minBuyScore,
    minLayersAligned: current.minLayersAligned ?? DEFAULTS.minLayersAligned,
    stopPips: current.stopPips ?? config.stopPips,
    targetPips: current.targetPips ?? config.targetPips,
    tradingPaused: false,
    pauseReason: '',
  };
  const notes = [];

  const minTrades = Number(process.env.FX_LEARN_MIN_TRADES) || 8;
  const manualResumeAt = options.manualResumeAt || null;
  const pauseTrades = manualResumeAt
    ? trades.filter((t) => (t.closedAt || 0) >= new Date(manualResumeAt).getTime())
    : trades;
  const pauseMetrics = pauseTrades.length
    ? computeMetrics(pauseTrades)
    : { maxConsecutiveLosses: 0, profitFactor: metrics.profitFactor, count: 0 };

  const pauseEval = manualResumeAt ? pauseMetrics : metrics;
  const pauseCount = manualResumeAt ? pauseTrades.length : metrics.count;

  if (metrics.count < minTrades) {
    return {
      params: next,
      applied: false,
      notes: [`Недостатньо угод для навчання (${metrics.count}/${minTrades})`],
      recommendPause: false,
    };
  }

  if (pauseEval.profitFactor < 0.85 && pauseCount >= 10) {
    next.tradingPaused = true;
    next.pauseReason = `learning: profit factor ${pauseEval.profitFactor} < 0.85`;
    notes.push('AUTO PAUSE — edge слабкий, потрібен review');
  }

  const maxConsecLoss = Number(process.env.FX_LEARN_MAX_CONSEC_LOSSES) || 8;
  if (pauseEval.maxConsecutiveLosses >= maxConsecLoss) {
    next.tradingPaused = true;
    next.pauseReason = `learning: ${pauseEval.maxConsecutiveLosses} losses in row`;
    notes.push('AUTO PAUSE — серія збиткових угод');
  }

  if (metrics.winRate < 40 && metrics.count >= minTrades) {
    next.minBuyScore = Math.min(92, next.minBuyScore + 2);
    next.minLayersAligned = Math.min(4, (next.minLayersAligned ?? 3) + 1);
    notes.push(`↑ minBuyScore → ${next.minBuyScore}, layers → ${next.minLayersAligned} (WR ${metrics.winRate}%)`);
  } else if (metrics.winRate > 55 && metrics.profitFactor > 1.2 && metrics.count >= minTrades) {
    next.minBuyScore = Math.max(80, next.minBuyScore - 1);
    notes.push(`↓ minBuyScore → ${next.minBuyScore} (стабільний edge)`);
  }

  if (metrics.profitFactor < 0.9 && metrics.count >= 10) {
    next.minLayersAligned = Math.min(4, (next.minLayersAligned ?? 3) + 1);
    notes.push(`↑ minLayersAligned → ${next.minLayersAligned} (PF ${metrics.profitFactor})`);
  }

  const stopHits = metrics.byExitReason?.stop?.count || 0;
  const tpHits = metrics.byExitReason?.take_profit?.count || 0;
  const stopRatio = metrics.count > 0 ? stopHits / metrics.count : 0;

  if (stopRatio > 0.65 && metrics.avgPipsLoss < -3) {
    next.stopPips = Math.min(10, next.stopPips + 1);
    notes.push(`↑ stopPips → ${next.stopPips} (багато stop)`);
  } else if (stopRatio < 0.35 && metrics.profitFactor > 1) {
    next.stopPips = Math.max(4, next.stopPips - 1);
    notes.push(`↓ stopPips → ${next.stopPips} (stops рідкі)`);
  }

  if (tpHits === 0 && metrics.count >= 10 && metrics.avgPipsWin < 5) {
    next.targetPips = Math.max(3, next.targetPips - 1);
    notes.push(`↓ targetPips → ${next.targetPips} (TP не досягається)`);
  } else if (tpHits / Math.max(metrics.count, 1) > 0.4 && metrics.profitFactor > 1.1) {
    next.targetPips = Math.min(12, next.targetPips + 1);
    notes.push(`↑ targetPips → ${next.targetPips} (TP часто)`);
  }

  const bucket72 = metrics.byScore?.['72-79'];
  if (bucket72 && bucket72.count >= 3 && bucket72.pnl < 0) {
    next.minBuyScore = Math.max(next.minBuyScore, 80);
    notes.push('↑ minBuyScore ≥80 — bucket 72-79 збитковий');
  }

  return {
    params: next,
    applied: notes.some((n) => n.startsWith('↑') || n.startsWith('↓') || n.startsWith('AUTO')),
    notes,
    recommendPause: next.tradingPaused,
  };
}

module.exports = { tuneParams };
