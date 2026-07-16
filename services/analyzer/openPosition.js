const config = require('../../config');
const { normPair } = require('../utils');
const { getEffectiveConfig } = require('../learning/paramsStore');
const { getSessionProfile, applySessionToConfig } = require('../learning/sessionAdapt');
const { classifyMarketRegime } = require('./regimeEngine');
const { getSpreadPips } = require('../executor/pricing');

/**
 * Re-score conviction for an open trade's side (position management).
 */
async function analyzeOpenPosition(trade, options = {}) {
  const { scorePairForSide } = require('./index');
  const pair = normPair(trade.pair);
  const side = trade.side === 'short' ? 'short' : 'long';
  let cfg = getEffectiveConfig({ ...config, ...options.config });

  const session = getSessionProfile(new Date());
  cfg = applySessionToConfig(cfg, session);

  const liveQuote = options.liveQuote || null;
  const bars = options.bars || null;
  const macro = options.macro !== undefined ? options.macro : null;

  const minBars = config.capitalMinBars ?? 15;
  let m1;
  let m5;
  let h1;

  if (bars?.m1?.bars?.length >= minBars && bars?.m5?.bars?.length >= minBars) {
    m1 = bars.m1;
    m5 = bars.m5;
    h1 = bars.h1;
  } else {
    return {
      pair,
      side,
      conviction: trade.entryConviction ?? trade.score ?? 0,
      stillValid: true,
      error: 'insufficient_bars',
    };
  }

  const pairSpread = getSpreadPips(pair, cfg);
  const quote = liveQuote ? {
    mid: liveQuote.mid,
    bid: liveQuote.bid,
    ask: liveQuote.ask,
    spreadPips: liveQuote.spreadPips ?? pairSpread,
  } : {
    mid: m1.mid,
    bid: m1.bid,
    ask: m1.ask,
    spreadPips: m1.spreadPips || pairSpread,
  };

  const marketRegime = classifyMarketRegime(m5.bars, h1?.bars);
  const signal = scorePairForSide(m1.bars, m5.bars, quote, cfg, {
    pair,
    macro,
    bars1h: h1?.bars,
    marketRegime,
    effectiveSpreadPips: quote.spreadPips > 0 ? quote.spreadPips : pairSpread,
  }, side, { mode: '5m' });

  const conviction = signal.smart?.conviction ?? signal.score ?? 0;

  return {
    pair,
    side,
    conviction,
    stillValid: signal.action === 'BUY' || signal.action === 'SELL',
    smart: signal.smart,
    layerEval: signal.layerEval,
    marketRegime: signal.marketRegime,
    reason: signal.reason,
  };
}

module.exports = { analyzeOpenPosition };
