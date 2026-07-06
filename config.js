require('dotenv').config();

function num(key, fallback) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

function str(key, fallback) {
  const v = process.env[key];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

function parsePairs() {
  const raw = process.env.FX_PAIRS || process.env.FX_PAIR || 'EURUSD';
  const seen = new Set();
  const out = [];
  for (const part of String(raw).split(/[,;\s]+/)) {
    const p = part.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (p.length === 6 && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out.length ? out : ['EURUSD'];
}

const pairs = parsePairs();

const profitBoost = process.env.FX_PROFIT_BOOST !== '0';

module.exports = {
  mode: str('FX_MODE', 'intraday'),
  pair: pairs[0],
  pairs,
  tickMs: num('FX_TICK_MS', 1000),
  dataProvider: str('FX_DATA_PROVIDER', 'yahoo'),
  oanda: {
    token: process.env.FX_OANDA_TOKEN || '',
    accountId: process.env.FX_OANDA_ACCOUNT || '',
    env: str('FX_OANDA_ENV', 'practice'),
  },
  executor: str('FX_EXECUTOR', 'auto'),
  equityUsd: num('FX_EQUITY_USD', 1000),
  riskPerTradePct: num('FX_RISK_PER_TRADE_PCT', 0.25),
  dailyLossLimitPct: num('FX_DAILY_LOSS_LIMIT_PCT', 1.5),
  maxTradesPerDay: num('FX_MAX_TRADES_PER_DAY', 50),
  maxOpenPositions: num('FX_MAX_OPEN_POSITIONS', 5),
  pairRefreshConcurrency: num('FX_PAIR_REFRESH_CONCURRENCY', 5),
  analyzeGapMs: num('FX_ANALYZE_GAP_MS', 0),
  maxSpreadPips: num('FX_MAX_SPREAD_PIPS', 1.5),
  targetPips: num('FX_TARGET_PIPS', profitBoost ? 5 : 4),
  stopPips: num('FX_STOP_PIPS', profitBoost ? 4 : 5),
  profitBoost,
  minProfitSlPct: num('FX_MIN_PROFIT_SL_PCT', 25),
  sessionStartUtc: str('FX_SESSION_START_UTC', '07:00'),
  sessionEndUtc: str('FX_SESSION_END_UTC', '20:00'),
  apiPort: num('PORT', num('FX_API_PORT', 8787)),
  apiSecret: str('FX_API_SECRET', ''),
  corsOrigins: str('FX_CORS_ORIGINS', ''),
  autoStartWorker: process.env.FX_AUTO_START_WORKER === '1' || Boolean(process.env.RENDER),
  simulate: process.env.FX_SIMULATE !== '0',
  simSpreadPips: num('FX_SIM_SPREAD_PIPS', 1.2),
  simCommissionUsd: num('FX_SIM_COMMISSION_USD', 0.05),
  simUseRiskSizing: process.env.FX_SIM_RISK_SIZING !== '0',
  simSpreads: (() => {
    const { parseSpreadMap } = require('./services/executor/pricing');
    return parseSpreadMap(process.env.FX_SIM_SPREADS);
  })(),
  newsBlackout: process.env.FX_NEWS_BLACKOUT !== '0',
  newsBlackoutBufferMin: num('FX_NEWS_BLACKOUT_BUFFER_MIN', 0),
  dxyFilter: process.env.FX_DXY_FILTER !== '0',
  htfFilter: process.env.FX_HTF_FILTER !== '0',
  jpyFilter: process.env.FX_JPY_FILTER !== '0',
  maxJpyCrossPositions: num('FX_MAX_JPY_CROSS', 1),
  maxExposurePerCurrency: num('FX_MAX_EXPOSURE_PER_CURRENCY', 2),
  allowShort: process.env.FX_ALLOW_SHORT !== '0',
  bidirectional: process.env.FX_BIDIRECTIONAL !== '0',
  bidirectionalHtf: process.env.FX_BIDIRECTIONAL_HTF !== '0',
  bidirectionalHtfScoreBoost: num('FX_BIDIRECTIONAL_HTF_BOOST', 5),
  bidirectionalHtfMinAdx: num('FX_BIDIRECTIONAL_HTF_ADX', 22),
  balanceDirections: process.env.FX_BALANCE_DIRECTIONS !== '0',
  pairCooldownMs: num('FX_PAIR_COOLDOWN_MS', 900000),
  pairCooldownSlMs: num('FX_PAIR_COOLDOWN_SL_MS', 1800000),
  pairCooldownTpMs: num('FX_PAIR_COOLDOWN_TP_MS', 300000),
  pairMaxTradesPerDay: num('FX_PAIR_MAX_TRADES_DAY', 2),
  requireMomentum: process.env.FX_REQUIRE_MOMENTUM !== '0',
  minBuyScore: num('FX_MIN_BUY_SCORE', 78),
  minSellScore: num('FX_MIN_SELL_SCORE', 75),
  postNewsBoost: process.env.FX_POST_NEWS_BOOST !== '0',
  postNewsBoostConviction: num('FX_POST_NEWS_BOOST_CONV', 8),
  postNewsBoostThresholdDrop: num('FX_POST_NEWS_BOOST_THRESHOLD', 3),
  postNewsBoostWindowMs: num('FX_POST_NEWS_BOOST_WINDOW_MS', 5400000),
  minLayersAligned: num('FX_MIN_LAYERS_ALIGNED', 3),
  macroFilter: process.env.FX_MACRO_FILTER !== '0',
  layerEngine: process.env.FX_LAYER_ENGINE !== '0',
  smartMode: process.env.FX_SMART_MODE !== '0',
  fundamentalEngine: process.env.FX_FUNDAMENTAL_ENGINE !== '0',
  calendarEnabled: process.env.FX_CALENDAR !== '0',
  calendarProvider: str('FX_CALENDAR_PROVIDER', 'forexfactory'),
  calendarSurprise: process.env.FX_CALENDAR_SURPRISE !== '0',
  finnhubApiKey: process.env.FX_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || '',
  smartMaxEntriesPerCycle: num('FX_SMART_MAX_ENTRIES_CYCLE', 2),
  smartPairPauseAfterSl: num('FX_SMART_PAIR_PAUSE_SL', 3),
  stateFileEnabled: process.env.FX_STATE_FILE !== '0',
};
