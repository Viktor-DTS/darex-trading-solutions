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
const { parsePairList, filterPairs } = require('./services/risk/pairFilter');
const pairBlacklist = parsePairList(process.env.FX_PAIR_BLACKLIST);
const pairWhitelist = parsePairList(process.env.FX_PAIR_WHITELIST);
const filteredPairs = filterPairs(pairs, pairBlacklist, pairWhitelist);

const profitBoost = process.env.FX_PROFIT_BOOST !== '0';
const scalpMode = process.env.FX_SCALP_MODE !== '0';
const signalEngine = str('FX_SIGNAL_ENGINE', 'ideal').toLowerCase();
const charlieMode = signalEngine === 'charlie';

function scalpDefault(key, scalpVal, normalVal) {
  const v = process.env[key];
  if (v != null && String(v).trim() !== '') return num(key, normalVal);
  return scalpMode ? scalpVal : normalVal;
}

module.exports = {
  mode: charlieMode ? 'charlie' : str('FX_MODE', 'intraday'),
  signalEngine,
  charlieMode,
  pair: filteredPairs[0],
  pairs: filteredPairs,
  pairBlacklist,
  pairWhitelist,
  scalpMode,
  tickMs: num('FX_TICK_MS', 1000),
  /** Fast mark/BE/TP loop for open trades (ms). Defaults to tickMs. */
  openMonitorMs: num('FX_OPEN_MONITOR_MS', 0),
  /** Broker position sync during open monitor (ms). */
  openBrokerSyncMs: num('FX_OPEN_BROKER_SYNC_MS', 5000),
  dataProvider: str('FX_DATA_PROVIDER', 'yahoo'),
  oanda: {
    token: process.env.FX_OANDA_TOKEN || '',
    accountId: process.env.FX_OANDA_ACCOUNT || '',
    env: str('FX_OANDA_ENV', 'practice'),
  },
  capital: {
    apiKey: process.env.FX_CAPITAL_API_KEY || '',
    identifier: process.env.FX_CAPITAL_IDENTIFIER || '',
    password: process.env.FX_CAPITAL_PASSWORD || '',
    env: str('FX_CAPITAL_ENV', 'demo'),
  },
  capitalContractSize: num('FX_CAPITAL_CONTRACT_SIZE', 0),
  capitalMinSize: num('FX_CAPITAL_MIN_SIZE', 0),
  // Capital.com market data (FX_DATA_PROVIDER=capital) — rate-limit aware
  capitalMinBars: num('FX_CAPITAL_MIN_BARS', 15),
  capitalM1Max: num('FX_CAPITAL_M1_MAX', 60),
  capitalM5Max: num('FX_CAPITAL_M5_MAX', 60),
  capitalH1Max: num('FX_CAPITAL_H1_MAX', 80),
  capitalQuoteBatch: num('FX_CAPITAL_QUOTE_BATCH', 1),
  capitalQuoteDelayMs: num('FX_CAPITAL_QUOTE_DELAY_MS', 400),
  capitalBarRefreshMs: num('FX_CAPITAL_BAR_REFRESH_MS', 300000),
  capitalEpicDelayMs: num('FX_CAPITAL_EPIC_DELAY_MS', 800),
  capitalHydrateDelayMs: num('FX_CAPITAL_HYDRATE_DELAY_MS', 8000),
  capitalMinRequestMs: num('FX_CAPITAL_MIN_REQUEST_MS', 700),
  capitalStatusCacheMs: num('FX_CAPITAL_STATUS_CACHE_MS', 180000),
  capitalUseWebSocket: process.env.FX_CAPITAL_USE_WEBSOCKET !== '0',
  capitalStreamPingMs: num('FX_CAPITAL_STREAM_PING_MS', 300000),
  capitalQuoteRefreshMs: num('FX_CAPITAL_QUOTE_REFRESH_MS', 120000),
  capitalWsBootstrapPairs: num('FX_CAPITAL_WS_BOOTSTRAP_PAIRS', 0),
  capitalYahooFallback: process.env.FX_CAPITAL_YAHOO_FALLBACK !== '0',
  capitalRateLimitPollMs: num('FX_CAPITAL_RATE_LIMIT_POLL_MS', 60000),
  capitalYahooFallbackMs: num('FX_CAPITAL_YAHOO_FALLBACK_MS', 120000),
  capitalYahooBarCacheMs: num('FX_CAPITAL_YAHOO_BAR_CACHE_MS', 180000),
  executor: str('FX_EXECUTOR', 'auto'),
  equityUsd: num('FX_EQUITY_USD', 1000),
  riskPerTradePct: num('FX_RISK_PER_TRADE_PCT', 0.5),
  regimeMinAdx: num('FX_REGIME_MIN_ADX', 18),
  dailyLossLimitPct: num('FX_DAILY_LOSS_LIMIT_PCT', 1.5),
  maxTradesPerDay: num('FX_MAX_TRADES_PER_DAY', 50),
  maxOpenPositions: num('FX_MAX_OPEN_POSITIONS', 5),
  pairRefreshConcurrency: num('FX_PAIR_REFRESH_CONCURRENCY', 5),
  analyzeGapMs: num('FX_ANALYZE_GAP_MS', 0),
  maxSpreadPips: num('FX_MAX_SPREAD_PIPS', charlieMode ? 2.5 : 1.5),
  targetPips: charlieMode
    ? num('FX_CHARLIE_TARGET_MIN', 10)
    : scalpDefault('FX_TARGET_PIPS', 3, profitBoost ? 5 : 4),
  stopPips: charlieMode
    ? num('FX_CHARLIE_STOP_PIPS', 4.5)
    : scalpDefault('FX_STOP_PIPS', 3, profitBoost ? 4 : 5),
  profitBoost,
  minProfitSlPct: num('FX_MIN_PROFIT_SL_PCT', 25),
  sessionStartUtc: str('FX_SESSION_START_UTC', '07:00'),
  sessionEndUtc: str('FX_SESSION_END_UTC', '17:00'),
  apiPort: num('PORT', num('FX_API_PORT', 8787)),
  apiSecret: str('FX_API_SECRET', ''),
  panelUser: str('FX_PANEL_USER', 'admin'),
  panelPassword: process.env.FX_PANEL_PASSWORD || '',
  panelTokenTtlMs: num('FX_PANEL_TOKEN_TTL_MS', 86400000),
  corsOrigins: str('FX_CORS_ORIGINS', ''),
  autoStartWorker: process.env.FX_AUTO_START_WORKER === '1' || Boolean(process.env.RENDER),
  simulate: process.env.FX_SIMULATE !== '0',
  simSpreadPips: num('FX_SIM_SPREAD_PIPS', 1.2),
  simCommissionUsd: num('FX_SIM_COMMISSION_USD', 0.05),
  simUseRiskSizing: process.env.FX_SIM_RISK_SIZING !== '0',
  // Realism: market-order entry slippage + adverse stop-loss slippage + off-peak spread widening
  simSlippagePips: num('FX_SIM_SLIPPAGE_PIPS', 0.2),
  simStopSlippagePips: num('FX_SIM_STOP_SLIPPAGE_PIPS', 0.5),
  simSpreadSessionMult: num('FX_SIM_SPREAD_SESSION_MULT', 1.4),
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
  pairCooldownTpMs: num('FX_PAIR_COOLDOWN_TP_MS', scalpMode ? 1800000 : 300000),
  pairCooldownProfitDecayMs: num('FX_PAIR_COOLDOWN_PROFIT_DECAY_MS', 3600000),
  pairMaxTradesPerDay: num('FX_PAIR_MAX_TRADES_DAY', 3),
  requireMomentum: process.env.FX_REQUIRE_MOMENTUM !== '0',
  minBuyScore: scalpDefault('FX_MIN_BUY_SCORE', 72, 68),
  minSellScore: scalpDefault('FX_MIN_SELL_SCORE', 74, 72),
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
  smartMaxEntriesPerCycle: num('FX_SMART_MAX_ENTRIES_CYCLE', 3),
  smartPairPauseAfterSl: num('FX_SMART_PAIR_PAUSE_SL', 3),
  pairTier1Raw: str('FX_PAIR_TIER1', ''),
  pairTier2MaxSpreadPips: num('FX_PAIR_TIER2_MAX_SPREAD', 3),
  pairTier2MinBuyScore: scalpDefault('FX_PAIR_TIER2_MIN_BUY_SCORE', 72, 68),
  sideProfileMinTrades: num('FX_SIDE_PROFILE_MIN_TRADES', 5),
  sideProfileLookback: num('FX_SIDE_PROFILE_LOOKBACK', 30),
  sideProfileBadWr: num('FX_SIDE_PROFILE_BAD_WR', 30),
  sideProfileGoodWr: num('FX_SIDE_PROFILE_GOOD_WR', 55),
  sideProfileThresholdPenalty: num('FX_SIDE_PROFILE_THRESHOLD_PEN', 8),
  sideProfileConvictionBonus: num('FX_SIDE_PROFILE_CONV_BONUS', 4),
  sideProfileMinWrGap: num('FX_SIDE_PROFILE_MIN_WR_GAP', 20),
  stateFileEnabled: process.env.FX_STATE_FILE !== '0',
  breakevenEnabled: process.env.FX_BREAKEVEN !== '0',
  breakevenAfterPips: num('FX_BREAKEVEN_PIPS', charlieMode ? 2 : 2),
  breakevenBufferPips: num('FX_BREAKEVEN_BUFFER_PIPS', 0.2),
  breakevenBrokerSync: process.env.FX_BREAKEVEN_BROKER !== '0',
  // Active position management (conv decay, pull TP when setup dies, early scratch)
  positionMgmt: process.env.FX_POSITION_MGMT !== '0',
  posConvDecay: num('FX_POS_CONV_DECAY', charlieMode ? 20 : 15),
  posConvDecayLoss: num('FX_POS_CONV_DECAY_LOSS', charlieMode ? 12 : 8),
  posProfitDecayConv: num('FX_POS_PROFIT_DECAY_CONV', charlieMode ? 12 : 10),
  posTpDecayConv: num('FX_POS_TP_DECAY_CONV', charlieMode ? 10 : 8),
  posMinProfitPips: num('FX_POS_MIN_PROFIT_PIPS', 0.5),
  posGoodEnoughTpPips: num('FX_POS_GOOD_ENOUGH_TP_PIPS', 0.5),
  posPullbackPips: num('FX_POS_PULLBACK_PIPS', 0.3),
  posTimeScratchMs: num('FX_POS_TIME_SCRATCH_MS', charlieMode ? 720000 : 300000),
  posTimeScratchLossMs: num('FX_POS_TIME_SCRATCH_LOSS_MS', charlieMode ? 480000 : 180000),
  posScratchMaxLossPips: num('FX_POS_SCRATCH_MAX_LOSS_PIPS', charlieMode ? -1.5 : -0.5),
  posScratchPeakGuard: process.env.FX_POS_SCRATCH_PEAK_GUARD !== '0',
  posTimeMaxMs: num('FX_POS_TIME_MAX_MS', charlieMode ? 900000 : 600000),
  posProgressPips: num('FX_POS_PROGRESS_PIPS', 0.4),
  posDynamicTp: process.env.FX_POS_DYNAMIC_TP !== '0',
  posDynamicTpBufferPips: num('FX_POS_DYNAMIC_TP_BUFFER_PIPS', 0.3),
  posDynamicTpMinFavPips: num('FX_POS_DYNAMIC_TP_MIN_FAV', 0),
  scalpTier1Only: scalpMode && process.env.FX_SCALP_TIER1_ONLY !== '0',
  scalpSessions: (process.env.FX_SCALP_SESSIONS || 'london,overlap,overlap_late')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean),
  scalpMaxTradesPerHour: num('FX_SCALP_MAX_TRADES_HOUR', 4),
  watchAutoEntry: process.env.FX_WATCH_AUTO_ENTRY !== '0',
  watchAutoEntryCycles: num('FX_WATCH_AUTO_ENTRY_CYCLES', 2),
  watchAutoEntryConvDrop: num('FX_WATCH_AUTO_ENTRY_CONV', 1),
  tradeTelegram: process.env.FX_TRADE_TELEGRAM !== '0',
  // PROJECT CHARLIE — structural liquidity sweep (London)
  charlieStopPips: num('FX_CHARLIE_STOP_PIPS', 4.5),
  charlieTargetMinPips: num('FX_CHARLIE_TARGET_MIN', 10),
  charlieTargetMaxPips: num('FX_CHARLIE_TARGET_MAX', 28),
  charlieMinRR: num('FX_CHARLIE_MIN_RR', 2.2),
  charlieMaxPairs: num('FX_CHARLIE_MAX_PAIRS', 4),
  charlieScanPairs: num('FX_CHARLIE_SCAN_PAIRS', 24),
  charlieMinScore: num('FX_CHARLIE_MIN_SCORE', charlieMode ? 70 : 60),
  charlieMinAdx: num('FX_CHARLIE_MIN_ADX', 14),
  charliePreferVolatility: process.env.FX_CHARLIE_PREFER_VOL !== '0',
  charlieMinAtrPips: num('FX_CHARLIE_MIN_ATR_PIPS', 6),
  charlieMinRangePips: num('FX_CHARLIE_MIN_RANGE_PIPS', 12),
  charlieMinAtrSpreadRatio: num('FX_CHARLIE_MIN_ATR_SPREAD', 3),
  charlieAtrLevels: process.env.FX_CHARLIE_ATR_LEVELS !== '0',
  charlieAtrStopMult: num('FX_CHARLIE_ATR_STOP_MULT', 0.35),
  charlieAtrTpMult: num('FX_CHARLIE_ATR_TP_MULT', 0.85),
  charlieMaxStopPips: num('FX_CHARLIE_MAX_STOP_PIPS', 12),
  charlieSweepMaxPips: num('FX_CHARLIE_SWEEP_MAX', 2.5),
  charlieLevelProximityPips: num('FX_CHARLIE_LEVEL_PROX', 8),
  charlieConfirmMinBodyPips: num('FX_CHARLIE_CONFIRM_BODY', 0.8),
  charlieMinM5Bars: num('FX_CHARLIE_MIN_M5_BARS', 20),
  // Activity hunt (default): no London/NY clock gate — only weekend soft-close
  charlieAlwaysOn: process.env.FX_CHARLIE_ALWAYS_ON !== '0',
  charlieActivityLookbackMs: num('FX_CHARLIE_ACTIVITY_LOOKBACK_MS', 6 * 3600000),
  charlieSetupsMaxLines: num('FX_CHARLIE_SETUPS_MAX_LINES', 2000),
  // Capital market hunt → dynamic universe journal (≤24, rotate last 16)
  charlieMarketHunt: process.env.FX_CHARLIE_MARKET_HUNT !== '0',
  charlieUniverseMax: num('FX_CHARLIE_UNIVERSE_MAX', 24),
  charlieUniverseRotate: num('FX_CHARLIE_UNIVERSE_ROTATE', 16),
  /** Max seed pairs allowed into sticky core (rest compete in rotating slots). */
  charlieUniverseCoreSeedMax: num('FX_CHARLIE_UNIVERSE_CORE_SEED', 4),
  charlieHuntIntervalMs: num('FX_CHARLIE_HUNT_INTERVAL_MS', 30 * 60 * 1000),
  /** Local WS micro-heat reshuffle of rotating slots (no REST). */
  charlieSoftRotateMs: num('FX_CHARLIE_SOFT_ROTATE_MS', 2 * 60 * 1000),
  charlieCatalogCacheMs: num('FX_CHARLIE_CATALOG_CACHE_MS', 6 * 3600000),
  charlieHuntAllowExotic: process.env.FX_CHARLIE_HUNT_ALLOW_EXOTIC === '1',
  charlieHuntCatalogMax: num('FX_CHARLIE_HUNT_CATALOG_MAX', 80),
  /** Stickiness bonus for previous focus pair (was hard-coded 8). */
  charlieFocusStickiness: num('FX_CHARLIE_FOCUS_STICKINESS', 2),
  /** Max focus pairs sharing same currency (base or quote). */
  charlieFocusMaxPerCurrency: num('FX_CHARLIE_FOCUS_MAX_CCY', 2),
  /** Append pair_pulse.jsonl each analyze cycle for panel dynamics. */
  charliePulseLog: process.env.FX_CHARLIE_PULSE_LOG !== '0',
  charlieMarketSignalBlend: num('FX_CHARLIE_MARKET_SIGNAL_BLEND', 0.4),
  charlieSessionStart: str('FX_CHARLIE_SESSION_START', '07:00'),
  charlieSessionEnd: str('FX_CHARLIE_SESSION_END', charlieMode ? '09:00' : '11:00'),
  charlieMaxEntriesPerCycle: num('FX_CHARLIE_MAX_ENTRIES_CYCLE', 2),
  charlieMaxTradesPerDay: num('FX_CHARLIE_MAX_TRADES_DAY', 6), // global cap (all pairs)
  charlieAsianStart: str('FX_CHARLIE_ASIAN_START', '00:00'),
  charlieAsianEnd: str('FX_CHARLIE_ASIAN_END', '07:00'),
  charlieSkipStaticBlackout: process.env.FX_CHARLIE_SKIP_STATIC_BLACKOUT !== '0',
  charlieDxyBias: process.env.FX_CHARLIE_DXY_BIAS !== '0',
  charlieDxyCacheMs: num('FX_CHARLIE_DXY_CACHE_MS', 300000),
  charlieRequireMss: process.env.FX_CHARLIE_REQUIRE_MSS !== '0',
  charlieStrictMss: process.env.FX_CHARLIE_STRICT_MSS !== '0',
  charlieRequireDisplacement: process.env.FX_CHARLIE_REQUIRE_DISP !== '0',
  charlieFvgEntry: process.env.FX_CHARLIE_FVG_ENTRY !== '0',
  charlieDynamicTp: process.env.FX_CHARLIE_DYNAMIC_TP !== '0',
  charlieShadowLog: process.env.FX_CHARLIE_SHADOW_LOG !== '0',
  charlieNeutralSkip: process.env.FX_CHARLIE_NEUTRAL_SKIP === '1',
  charlieEql: process.env.FX_CHARLIE_EQL !== '0',
  charlieEqlTolPips: num('FX_CHARLIE_EQL_TOL', 2),
  charlieMssMaxBars: num('FX_CHARLIE_MSS_MAX_BARS', 5),
  charlieDisplacementRatio: num('FX_CHARLIE_DISP_RATIO', 0.6),
  charlieDisplacementMinPips: num('FX_CHARLIE_DISP_MIN_PIPS', 1.2),
  charlieSetupDedupMs: num('FX_CHARLIE_SETUP_DEDUP_MS', 45 * 60 * 1000),
  charlieMaxClusterEur: num('FX_CHARLIE_MAX_CLUSTER_EUR', 1),
  charlieMaxClusterGbp: num('FX_CHARLIE_MAX_CLUSTER_GBP', 1),
  charlieMaxClusterJpy: num('FX_CHARLIE_MAX_CLUSTER_JPY', 1),
  charlieMaxClusterUsd: num('FX_CHARLIE_MAX_CLUSTER_USD', 2),
  charlieSessionStopSl: num('FX_CHARLIE_SESSION_STOP_SL', 3),
  // Legacy timed windows (only if FX_CHARLIE_ALWAYS_ON=0)
  charlieNyFallback: process.env.FX_CHARLIE_NY_FALLBACK !== '0',
  charlieNyStart: str('FX_CHARLIE_NY_START', '12:00'),
  charlieNyEnd: str('FX_CHARLIE_NY_END', '15:00'),
  charlieNyScoreBoost: num('FX_CHARLIE_NY_SCORE_BOOST', 0),
  charlieNyRiskMult: num('FX_CHARLIE_NY_RISK_MULT', 0.85),
  charlieNyStrictNews: process.env.FX_CHARLIE_NY_STRICT_NEWS !== '0',
  charlieLondonClose: process.env.FX_CHARLIE_LONDON_CLOSE !== '0',
  charlieCloseStart: str('FX_CHARLIE_CLOSE_START', '15:00'),
  charlieCloseEnd: str('FX_CHARLIE_CLOSE_END', '17:00'),
  charlieCloseScoreBoost: num('FX_CHARLIE_CLOSE_SCORE_BOOST', 5),
  charlieCloseRiskMult: num('FX_CHARLIE_CLOSE_RISK_MULT', 0.5),
  // Math path gate — P(hit TP before SL)
  mathGate: process.env.FX_MATH_GATE !== '0',
  mathTheta: process.env.FX_MATH_THETA !== '0',
  mathMinPReach: num('FX_MATH_MIN_PREACH', 0.52),
  mathMinExpectancyR: num('FX_MATH_MIN_EXPECTANCY_R', 0.05),
  mathMinKappa: num('FX_MATH_MIN_KAPPA', 0.55),
  mathMaxJumpShare: num('FX_MATH_MAX_JUMP', 0.35),
  mathFrictionK: num('FX_MATH_FRICTION_K', 0.55),
  mathMicroMinBarsInStop: num('FX_MATH_MICRO_BARS', 1.5),
  mathMicroMinM1: num('FX_MATH_MICRO_M1', 1),
  mathWindowBars: num('FX_MATH_WINDOW_BARS', 36),
  mathKappaScale: num('FX_MATH_KAPPA_SCALE', 2.2),
  mathJumpSigmaK: num('FX_MATH_JUMP_SIGMA_K', 1.2),
  mathJumpPDiscount: num('FX_MATH_JUMP_P_DISC', 0.25),
  mathOuHurstMax: num('FX_MATH_OU_HURST_MAX', 0.52),
  mathOuPaths: num('FX_MATH_OU_PATHS', 280),
  mathEwmaAlpha: num('FX_MATH_EWMA_ALPHA', 0.94),
  mathStrongPReach: num('FX_MATH_STRONG_PREACH', 0.58),
  mathScoreFloor: num('FX_MATH_SCORE_FLOOR', 68),
  mathLookback: num('FX_MATH_LOOKBACK', 64),
  mathMcPaths: num('FX_MATH_MC_PATHS', 400),
  mathMcMaxBars: num('FX_MATH_MC_MAX_BARS', 36),
  // Testbot — sim scalp on shared worker data (no Capital executor)
  testbot: {
    enabled: process.env.FX_TESTBOT_ENABLED === '1',
    minScore: num('FX_TESTBOT_MIN_SCORE', 70),
    targetUsd: num('FX_TESTBOT_TARGET_USD', 5),
    partialUsd: num('FX_TESTBOT_PARTIAL_USD', 2.5),
    partialAfterMs: num('FX_TESTBOT_PARTIAL_MS', 600000),
    maxHoldMs: num('FX_TESTBOT_MAX_HOLD_MS', 900000),
    maxOpenPositions: num('FX_TESTBOT_MAX_OPEN', 20),
    maxTradesPerDay: num('FX_TESTBOT_MAX_TRADES_DAY', 0),
    maxEntriesPerCycle: num('FX_TESTBOT_MAX_ENTRIES_CYCLE', 12),
    equityUsd: num('FX_TESTBOT_EQUITY_USD', 1000),
    riskPerTradePct: num('FX_TESTBOT_RISK_PCT', 0.35),
    stopPips: num('FX_TESTBOT_STOP_PIPS', 5),
    wideTpPips: num('FX_TESTBOT_WIDE_TP_PIPS', 40),
    simCommissionUsd: num('FX_TESTBOT_COMMISSION_USD', 0.05),
    /** Max net loss at SL = maxStopLossUsd + commission. Keep = targetUsd for 1:1 R:R. */
    maxStopLossUsd: num('FX_TESTBOT_MAX_STOP_USD', 5),
    /** Не різати stop_usd на перших N мс (спред bid/ask). */
    stopGraceMs: num('FX_TESTBOT_STOP_GRACE_MS', 30000),
    /** Early bank small green (debate DUAL_BOT_IMPROVE). */
    earlyPartialUsd: num('FX_TESTBOT_EARLY_PARTIAL_USD', 1.5),
    earlyPartialMs: num('FX_TESTBOT_EARLY_PARTIAL_MS', 180000),
    protectPeakUsd: num('FX_TESTBOT_PROTECT_PEAK_USD', 1.5),
    protectFloorUsd: num('FX_TESTBOT_PROTECT_FLOOR_USD', 0.5),
    holdExtendMs: num('FX_TESTBOT_HOLD_EXTEND_MS', 300000),
    /** CUT_STALE: mid-hold underwater without early peak → cut before full SL. */
    cutStaleMs: num('FX_TESTBOT_CUT_STALE_MS', 480000),
    cutStaleUsd: num('FX_TESTBOT_CUT_STALE_USD', 1.5),
    entryIntervalMs: num('FX_TESTBOT_ENTRY_INTERVAL_MS', 2000),
    /** Min wait before re-entry on same pair after exit; then fresh re-analyze. */
    pairCooldownMs: num('FX_TESTBOT_PAIR_COOLDOWN_MS', 300000),
    reanalyzeAfterCooldown: process.env.FX_TESTBOT_REANALYZE_AFTER_COOLDOWN !== '0',
    journalFile: str('FX_TESTBOT_JOURNAL_FILE', 'testbot-trades.jsonl'),
    /** Flip execution vs analysis (off by default). */
    invertDirection: process.env.FX_TESTBOT_INVERT_DIRECTION === '1',
    /** Allow sim entry on CHARLIE setupDraft (MATH BLOCK etc). Off = only live BUY/SELL. */
    allowSetupDraft: process.env.FX_TESTBOT_ALLOW_DRAFT === '1',
    /** Allow sim entry when CHARLIE already has the same pair on Capital. */
    allowCharlieOverlap: process.env.FX_TESTBOT_ALLOW_CHARLIE_OVERLAP !== '0',
  },
  // ORACLE-5m — mandatory 5-minute forecast before testbot entry
  oracle: {
    enabled: process.env.FX_ORACLE_5M !== '0',
    horizonSec: num('FX_ORACLE_HORIZON_SEC', 300),
    minPUp: num('FX_ORACLE_MIN_P_UP', 0.55),
    minKappa: num('FX_ORACLE_MIN_KAPPA', 0.55),
    minPTp: num('FX_ORACLE_MIN_P_TP', 0.52),
    tradeEnabled: process.env.FX_ORACLE_TRADE !== '0',
    respectInvert: process.env.FX_ORACLE_RESPECT_INVERT !== '0',
    forecastLog: str('FX_ORACLE_LOG', 'oracle-forecasts.jsonl'),
    actualLog: str('FX_ORACLE_ACTUAL_LOG', 'oracle-actual.jsonl'),
    toxicWr: num('FX_ORACLE_TOXIC_WR', 0.4),
    toxicMinTrades: num('FX_ORACLE_TOXIC_MIN_TRADES', 10),
    minStatsSamples: num('FX_ORACLE_MIN_STATS_SAMPLES', 30),
    minDirectionHitRate: num('FX_ORACLE_MIN_DIRECTION_HIT', 0.52),
    minPairHitRate: num('FX_ORACLE_MIN_PAIR_HIT', 0.5),
    statsWindow: num('FX_ORACLE_STATS_WINDOW', 200),
    windowBars: num('FX_ORACLE_WINDOW_BARS', 36),
    lookback: num('FX_ORACLE_LOOKBACK', 64),
    mcPaths: num('FX_ORACLE_MC_PATHS', 500),
    mcMaxBars: num('FX_ORACLE_MC_MAX_BARS', 6),
    microMinBarsInStop: num('FX_ORACLE_MICRO_BARS', 1.5),
    microMinM1: num('FX_ORACLE_MICRO_M1', 3),
    kappaScale: num('FX_ORACLE_KAPPA_SCALE', 2.2),
    logForecasts: process.env.FX_ORACLE_LOG_FORECASTS !== '0',
  },
};
