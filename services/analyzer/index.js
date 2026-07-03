const config = require('../../config');
const { fetchAnalysisBars } = require('../market-data');
const { scorePullbackLong } = require('./regime');
const { normPair, pipsToPrice, round, isInUtcSession } = require('../utils');
const { isNewsBlackout } = require('../calendar/newsBlackout');
const { fetchDxySnapshot, dxyBlocksLong } = require('../macro/dxy');

async function analyzePair(pairInput, options = {}) {
  const pair = normPair(pairInput || config.pair);
  const cfg = { ...config, ...options.config };
  const liveQuote = options.liveQuote || null;

  const inSession = isInUtcSession(new Date(), cfg.sessionStartUtc, cfg.sessionEndUtc);
  const news = cfg.newsBlackout !== false ? isNewsBlackout(new Date(), cfg.newsBlackoutBufferMin ?? 0) : { blocked: false };
  const dxy = cfg.dxyFilter !== false ? await fetchDxySnapshot() : null;
  const dxyBlock = dxyBlocksLong(dxy, pair);

  const { m1, m5 } = await fetchAnalysisBars(pair);

  const quote = liveQuote ? {
    mid: liveQuote.mid,
    bid: liveQuote.bid,
    ask: liveQuote.ask,
    spreadPips: liveQuote.spreadPips ?? cfg.simSpreadPips,
  } : {
    mid: m1.mid,
    bid: m1.bid,
    ask: m1.ask,
    spreadPips: m1.spreadPips || cfg.simSpreadPips,
  };

  const signal = scorePullbackLong(m1.bars, m5.bars, quote);
  const spreadOk = quote.spreadPips <= cfg.maxSpreadPips;

  let action = signal.action;
  const blocks = [];

  if (!inSession) blocks.push('outside session (UTC)');
  if (!spreadOk) blocks.push(`spread ${quote.spreadPips} > max ${cfg.maxSpreadPips} pips`);
  if (news.blocked) blocks.push(`news blackout: ${news.reason}`);
  if (dxyBlock.blocked) blocks.push(dxyBlock.reason);

  if (blocks.length && (action === 'BUY' || action === 'WATCH')) {
    action = 'SKIP';
  }

  const entry = quote.ask ?? quote.mid;
  const stopPips = cfg.stopPips;
  const targetPips = cfg.targetPips;
  const stopLoss = round(entry - pipsToPrice(stopPips, pair), 5);
  const takeProfit = round(entry + pipsToPrice(targetPips, pair), 5);

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
    reason: blocks.length ? `${signal.reason}; ${blocks.join('; ')}` : signal.reason,
    entry: action === 'BUY' ? entry : null,
    stopLoss: action === 'BUY' ? stopLoss : null,
    takeProfit: action === 'BUY' ? takeProfit : null,
    stopPips,
    targetPips,
    indicators: signal.indicators,
    regimeInfo: signal.regimeInfo,
    macro: { dxy },
    newsBlackout: news.blocked ? news.reason : null,
    dataSource: liveQuote?.source || m1.source,
  };
}

module.exports = { analyzePair };
