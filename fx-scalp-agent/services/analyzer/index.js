const config = require('../../config');
const { fetchAnalysisBars } = require('../market-data');
const { scorePullbackLong } = require('./regime');
const { normPair, pipsToPrice, round, isInUtcSession } = require('../utils');

async function analyzePair(pairInput, options = {}) {
  const pair = normPair(pairInput || config.pair);
  const cfg = { ...config, ...options.config };

  const inSession = isInUtcSession(new Date(), cfg.sessionStartUtc, cfg.sessionEndUtc);
  const { m1, m5, m15 } = await fetchAnalysisBars(pair);

  const quote = {
    mid: m1.mid,
    bid: m1.bid,
    ask: m1.ask,
    spreadPips: m1.spreadPips || cfg.simSpreadPips,
  };

  const signal = scorePullbackLong(m1.bars, m5.bars, quote);
  const spreadOk = quote.spreadPips <= cfg.maxSpreadPips;

  let action = signal.action;
  let blockReason = '';

  if (!inSession) {
    action = 'SKIP';
    blockReason = 'outside session (UTC)';
  } else if (!spreadOk) {
    action = 'SKIP';
    blockReason = `spread ${quote.spreadPips} > max ${cfg.maxSpreadPips} pips`;
  }

  const entry = quote.ask ?? quote.mid;
  const stopPips = cfg.stopPips;
  const targetPips = cfg.targetPips;
  const stopLoss = round(entry - pipsToPrice(stopPips, pair), 5);
  const takeProfit = round(entry + pipsToPrice(targetPips, pair), 5);

  if (blockReason && action === 'BUY') {
    action = 'SKIP';
  }

  return {
    pair,
    mode: cfg.mode,
    timestamp: new Date().toISOString(),
    inSession,
    spreadPips: quote.spreadPips,
    quote: { bid: quote.bid, ask: quote.ask, mid: quote.mid },
    regime: signal.regime,
    action,
    score: signal.score,
    reason: blockReason ? `${signal.reason}; ${blockReason}` : signal.reason,
    entry: action === 'BUY' ? entry : null,
    stopLoss: action === 'BUY' ? stopLoss : null,
    takeProfit: action === 'BUY' ? takeProfit : null,
    stopPips,
    targetPips,
    indicators: signal.indicators,
    regimeInfo: signal.regimeInfo,
    dataSource: m1.source,
  };
}

module.exports = { analyzePair };
