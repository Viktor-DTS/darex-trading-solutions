const fs = require('fs');
const path = require('path');
const { normPair, round, pipsToPrice } = require('../utils');
const { calcUnitsForRisk } = require('../executor/pricing');

const DEFAULT_CHAMPION = {
  id: 'BREAK-GBPUSD-R20m2',
  theory: 'BREAK',
  pair: 'GBPUSD',
  entry: { type: 'BREAK', lookback: 24, bufferPips: 2.5 },
  filters: { hourUtcMin: 12, hourUtcMax: 15, longOnly: true },
  exit: { stopPips: 3, tpPips: 24, maxHoldBars: 16 },
  costs: { spreadPips: 1.4, commissionUsd: 0.05 },
  size: { pipValueUsd: 1 },
};

function championsDir() {
  return path.join(__dirname, 'champions');
}

function loadChampionModel(cfg = {}) {
  const id = cfg.championId || process.env.FX_TESTBOT_CHAMPION_ID || DEFAULT_CHAMPION.id;
  const file = path.join(championsDir(), `${id}.json`);
  try {
    if (fs.existsSync(file)) {
      return { ...DEFAULT_CHAMPION, ...JSON.parse(fs.readFileSync(file, 'utf8')), id };
    }
  } catch (_) { /* fall through */ }
  // sandbox path fallback
  const sandbox = path.join(
    __dirname,
    '../../experiments/multi-agent-sandbox/rounds/R20/proposals',
    `${id}.json`,
  );
  try {
    if (fs.existsSync(sandbox)) {
      return { ...DEFAULT_CHAMPION, ...JSON.parse(fs.readFileSync(sandbox, 'utf8')) };
    }
  } catch (_) { /* fall through */ }
  return { ...DEFAULT_CHAMPION, id };
}

function pipSize(pair) {
  return String(pair).includes('JPY') ? 0.01 : 0.0001;
}

function hourUtc(ts = Date.now()) {
  return new Date(ts).getUTCHours();
}

/**
 * BREAK long signal on M5 (sandbox champion logic).
 * @returns {{ ok: boolean, side?: string, reason: string, meta?: object }}
 */
function evaluateChampionSignal(bars5m, model, now = Date.now()) {
  const pair = normPair(model.pair || 'GBPUSD');
  const hourMin = model.filters?.hourUtcMin ?? 12;
  const hourMax = model.filters?.hourUtcMax ?? 15;
  const h = hourUtc(now);
  if (h < hourMin || h >= hourMax) {
    return { ok: false, reason: `champion outside session ${hourMin}–${hourMax} UTC (now ${h})` };
  }
  const look = model.entry?.lookback ?? 24;
  const bufferPips = model.entry?.bufferPips ?? 2.5;
  if (!Array.isArray(bars5m) || bars5m.length < look + 2) {
    return { ok: false, reason: `champion need ≥${look + 2} M5 bars (have ${bars5m?.length || 0})` };
  }
  const closes = bars5m.map((b) => b.close).filter((c) => c != null);
  if (closes.length < look + 2) {
    return { ok: false, reason: 'champion insufficient closes' };
  }
  const close = closes[closes.length - 1];
  const window = closes.slice(-look - 1, -1);
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  const ps = pipSize(pair);
  const buf = bufferPips * ps;
  const longOnly = model.filters?.longOnly !== false;

  if (close > hi + buf) {
    return {
      ok: true,
      side: 'long',
      reason: `BREAK long close>${hi.toFixed(5)}+${bufferPips}p`,
      meta: { hi, lo, close, look, bufferPips },
    };
  }
  if (!longOnly && close < lo - buf) {
    return {
      ok: true,
      side: 'short',
      reason: `BREAK short close<${lo.toFixed(5)}-${bufferPips}p`,
      meta: { hi, lo, close, look, bufferPips },
    };
  }
  return {
    ok: false,
    reason: `no break (close=${close} hi=${hi} lo=${lo} buf=${bufferPips}p)`,
    meta: { hi, lo, close },
  };
}

/**
 * Build testbot-compatible analysis from champion signal + live quote.
 */
function buildChampionAnalysis(signal, quote, model, cfg = {}) {
  const pair = normPair(model.pair || 'GBPUSD');
  const digits = pair.includes('JPY') ? 3 : 5;
  const isShort = signal.side === 'short';
  const action = isShort ? 'SELL' : 'BUY';
  const stopPips = model.exit?.stopPips ?? 3;
  const tpPips = model.exit?.tpPips ?? 24;
  const entry = isShort
    ? round(quote.bid ?? quote.mid, digits)
    : round(quote.ask ?? quote.mid, digits);

  const units = calcUnitsForRisk(
    cfg.equityUsd ?? 1000,
    cfg.riskPerTradePct ?? 0.35,
    stopPips,
    pair,
    entry,
  );

  const stopLoss = isShort
    ? round(entry + pipsToPrice(stopPips, pair), digits)
    : round(entry - pipsToPrice(stopPips, pair), digits);
  const takeProfit = isShort
    ? round(entry - pipsToPrice(tpPips, pair), digits)
    : round(entry + pipsToPrice(tpPips, pair), digits);

  const maxHoldBars = model.exit?.maxHoldBars ?? 16;
  const maxHoldMs = maxHoldBars * 5 * 60 * 1000;

  return {
    pair,
    action,
    side: isShort ? 'short' : 'long',
    entry,
    stopLoss,
    takeProfit,
    stopPips,
    targetPips: tpPips,
    units,
    quote,
    signalEngine: 'champion',
    championId: model.id,
    score: 90,
    _testbotConv: 90,
    _testbotAction: action,
    testbotSignalAction: action,
    testbotInverted: false,
    maxHoldMs,
    reason: signal.reason,
    championMeta: signal.meta,
  };
}

function championMaxHoldMs(model) {
  const bars = model?.exit?.maxHoldBars ?? 16;
  return bars * 5 * 60 * 1000;
}

module.exports = {
  DEFAULT_CHAMPION,
  loadChampionModel,
  evaluateChampionSignal,
  buildChampionAnalysis,
  championMaxHoldMs,
};
