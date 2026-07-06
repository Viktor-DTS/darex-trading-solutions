const config = require('../../config');
const { getClosedTrades } = require('../journal');
const { computeMetrics } = require('./metrics');
const { tuneParams } = require('./tuner');
const { readLearnedParams, writeLearnedParams } = require('./paramsStore');
const { buildReport } = require('./report');
const { sendLearningReport } = require('./telegram');

async function runLearningCycle(options = {}) {
  const dryRun = options.dryRun === true;
  const trades = getClosedTrades(500);
  const recentTrades = options.windowDays
    ? trades.filter((t) => {
      const cutoff = Date.now() - options.windowDays * 86400000;
      return (t.closedAt || 0) >= cutoff;
    })
    : trades.slice(-50);

  const metrics = computeMetrics(recentTrades);
  const previous = readLearnedParams();
  const tuneResult = tuneParams(
    {
      minBuyScore: previous.minBuyScore,
      minLayersAligned: previous.minLayersAligned,
      stopPips: previous.stopPips ?? config.stopPips,
      targetPips: previous.targetPips ?? config.targetPips,
    },
    metrics,
    recentTrades,
  );

  const nextParams = {
    ...previous,
    ...tuneResult.params,
    lastMetrics: metrics,
    lastReport: buildReport(metrics, tuneResult, previous, tuneResult.params),
  };

  if (!dryRun && (tuneResult.applied || tuneResult.recommendPause || metrics.count > 0)) {
    writeLearnedParams(nextParams);
  }

  const reportText = nextParams.lastReport;

  if (!dryRun && process.env.FX_LEARN_TELEGRAM !== '0') {
    await sendLearningReport(reportText).catch(() => {});
  }

  return {
    ok: true,
    dryRun,
    metrics,
    previous: {
      minBuyScore: previous.minBuyScore,
      stopPips: previous.stopPips,
      targetPips: previous.targetPips,
      tradingPaused: previous.tradingPaused,
    },
    next: tuneResult.params,
    notes: tuneResult.notes,
    applied: !dryRun && tuneResult.applied,
    report: reportText,
    tradesAnalyzed: recentTrades.length,
  };
}

module.exports = {
  runLearningCycle,
};
