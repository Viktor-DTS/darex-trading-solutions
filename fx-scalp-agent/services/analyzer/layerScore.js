const { detectRegime, hasBarMomentum, lastCompletedBarBias } = require('./regime');
const { checkH1Trend } = require('./htfTrend');
const { checkMacroAlignment } = require('../macro/pairMacro');
const { ema, rsi } = require('./indicators');
const { round } = require('../utils');

function scoreH1Layer(bars1h, side) {
  const check = checkH1Trend(bars1h, side);
  if (check.blocked) {
    return { aligned: false, score: 0, reason: check.reason };
  }
  return {
    aligned: true,
    score: 75,
    reason: `1h ok (EMA50 ${check.ema50}, regime ${check.h1Regime || '—'})`,
  };
}

function scoreM5Layer(bars5m, side, marketRegime) {
  const trend5 = detectRegime(bars5m);
  const bias = lastCompletedBarBias(bars5m);

  if (marketRegime?.htfLed) {
    if (side === 'long' && bias === 'bear') {
      return { aligned: false, score: 0, reason: '5m остання свічка вниз (HTF)' };
    }
    if (side === 'short' && bias === 'bull') {
      return { aligned: false, score: 0, reason: '5m остання свічка вгору (HTF)' };
    }
    return { aligned: true, score: 65, reason: `5m HTF-led (${trend5.regime})` };
  }

  if (marketRegime?.marketRegime === 'range' || marketRegime?.marketRegime === 'volatile') {
    return { aligned: false, score: 0, reason: marketRegime.reason };
  }

  if (side === 'long') {
    if (trend5.regime !== 'trend_up') {
      return { aligned: false, score: 0, reason: `5m ${trend5.regime} ≠ long` };
    }
    if (bias === 'bear') {
      return { aligned: false, score: 0, reason: '5m остання свічка вниз' };
    }
    return { aligned: true, score: 80, reason: `5m trend_up ADX ${trend5.adx}` };
  }

  if (side === 'short') {
    if (trend5.regime !== 'trend_down') {
      return { aligned: false, score: 0, reason: `5m ${trend5.regime} ≠ short` };
    }
    if (bias === 'bull') {
      return { aligned: false, score: 0, reason: '5m остання свічка вгору' };
    }
    return { aligned: true, score: 80, reason: `5m trend_down ADX ${trend5.adx}` };
  }

  return { aligned: false, score: 0, reason: 'no side' };
}

function scoreM1Layer(bars1m, quote, side) {
  const closes = bars1m.map((b) => b.close);
  const price = quote.mid ?? quote.bid ?? closes[closes.length - 1];
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);

  if (side === 'long') {
    if (ema9 == null || ema21 == null || ema9 <= ema21) {
      return { aligned: false, score: 0, reason: '1m EMA9 ≤ EMA21' };
    }
    if (!hasBarMomentum(closes, 'long')) {
      return { aligned: false, score: 0, reason: '1m немає імпульсу ↑' };
    }
    if (rsi14 != null && rsi14 > 68) {
      return { aligned: false, score: 0, reason: `RSI ${round(rsi14, 1)} перегрів` };
    }
    const dist = ema9 != null ? (price - ema9) / price : 0;
    if (dist > 0.002) {
      return { aligned: false, score: 0, reason: 'далеко від EMA9' };
    }
    return { aligned: true, score: 85, reason: '1m pullback + імпульс ↑' };
  }

  if (side === 'short') {
    if (ema9 == null || ema21 == null || ema9 >= ema21) {
      return { aligned: false, score: 0, reason: '1m EMA9 ≥ EMA21' };
    }
    if (!hasBarMomentum(closes, 'short')) {
      return { aligned: false, score: 0, reason: '1m немає імпульсу ↓' };
    }
    if (rsi14 != null && rsi14 < 32) {
      return { aligned: false, score: 0, reason: `RSI ${round(rsi14, 1)} перепродано` };
    }
    return { aligned: true, score: 85, reason: '1m pullback + імпульс ↓' };
  }

  return { aligned: false, score: 0, reason: 'no side' };
}

/**
 * Evaluate 4 layers: macro, h1, m5, m1.
 * Entry allowed when alignedCount >= minRequired.
 */
function evaluateLayers(ctx) {
  const {
    pair, side, macro, bars1h, bars5m, bars1m, quote, marketRegime, cfg,
  } = ctx;

  const minRequired = cfg.minLayersAligned ?? 3;

  const layers = {
    macro: cfg.macroFilter !== false
      ? checkMacroAlignment(pair, side, macro)
      : { aligned: true, score: 50, reason: 'macro filter off' },
    h1: cfg.htfFilter !== false
      ? scoreH1Layer(bars1h, side)
      : { aligned: true, score: 50, reason: 'htf off' },
    m5: scoreM5Layer(bars5m, side, marketRegime),
    m1: scoreM1Layer(bars1m, quote, side),
  };

  const alignedCount = Object.values(layers).filter((l) => l.aligned).length;
  const pass = alignedCount >= minRequired;
  const totalScore = Object.values(layers).reduce((s, l) => s + (l.score || 0), 0);
  const compositeScore = Math.round(totalScore / 4);

  const failed = Object.entries(layers)
    .filter(([, l]) => !l.aligned)
    .map(([k, l]) => `${k}: ${l.reason}`);

  return {
    layers,
    alignedCount,
    minRequired,
    pass,
    compositeScore,
    reason: pass
      ? `layers ${alignedCount}/4 OK (${Object.keys(layers).filter((k) => layers[k].aligned).join('+')})`
      : `layers ${alignedCount}/${minRequired} — ${failed.slice(0, 2).join('; ')}`,
  };
}

module.exports = {
  evaluateLayers,
  scoreH1Layer,
  scoreM5Layer,
  scoreM1Layer,
};
