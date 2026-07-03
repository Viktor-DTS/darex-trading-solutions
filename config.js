require('dotenv').config();

function num(key, fallback) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

function str(key, fallback) {
  const v = process.env[key];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

module.exports = {
  mode: str('FX_MODE', 'intraday'),
  pair: str('FX_PAIR', 'EURUSD').toUpperCase(),
  tickMs: num('FX_TICK_MS', 1000),
  dataProvider: str('FX_DATA_PROVIDER', 'yahoo'),
  oanda: {
    token: process.env.FX_OANDA_TOKEN || '',
    accountId: process.env.FX_OANDA_ACCOUNT || '',
    env: str('FX_OANDA_ENV', 'practice'),
  },
  equityUsd: num('FX_EQUITY_USD', 1000),
  riskPerTradePct: num('FX_RISK_PER_TRADE_PCT', 0.25),
  dailyLossLimitPct: num('FX_DAILY_LOSS_LIMIT_PCT', 1.5),
  maxTradesPerDay: num('FX_MAX_TRADES_PER_DAY', 15),
  maxSpreadPips: num('FX_MAX_SPREAD_PIPS', 1.5),
  targetPips: num('FX_TARGET_PIPS', 8),
  stopPips: num('FX_STOP_PIPS', 5),
  sessionStartUtc: str('FX_SESSION_START_UTC', '07:00'),
  sessionEndUtc: str('FX_SESSION_END_UTC', '20:00'),
  apiPort: num('FX_API_PORT', 8787),
  simulate: process.env.FX_SIMULATE !== '0',
  simSpreadPips: num('FX_SIM_SPREAD_PIPS', 0.8),
  simCommissionUsd: num('FX_SIM_COMMISSION_USD', 0),
  newsBlackout: process.env.FX_NEWS_BLACKOUT !== '0',
  newsBlackoutBufferMin: num('FX_NEWS_BLACKOUT_BUFFER_MIN', 0),
  dxyFilter: process.env.FX_DXY_FILTER !== '0',
  stateFileEnabled: process.env.FX_STATE_FILE !== '0',
};
