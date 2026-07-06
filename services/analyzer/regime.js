const { ema, rsi, atr, adx } = require('./indicators');
const { round } = require('../utils');

/** Last N-1 moves among last N closes must align with direction. */
function hasBarMomentum(closes, direction, lookback = 3) {
  if (!closes || closes.length < lookback + 1) return true;
  const slice = closes.slice(-(lookback + 1));
  let ups = 0;
  let downs = 0;
  for (let i = 1; i < slice.length; i += 1) {
    if (slice[i] > slice[i - 1]) ups += 1;
    else if (slice[i] < slice[i - 1]) downs += 1;
  }
  const need = lookback >= 4 ? 3 : 2;
  if (direction === 'long') return ups >= need;
  if (direction === 'short') return downs >= need;
  return false;
}

/** Last completed bar on timeframe must align (skip forming bar). */
function lastCompletedBarBias(bars) {
  if (!bars || bars.length < 2) return null;
  const b = bars[bars.length - 2];
  if (b.close > b.open) return 'bull';
  if (b.close < b.open) return 'bear';
  return 'neutral';
}

function detectRegime(bars5m) {
  const closes = bars5m.map((b) => b.close);
  const price = closes[closes.length - 1];
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const adx14 = adx(bars5m, 14);

  if (adx14 != null && adx14 >= 20 && ema20 != null && ema50 != null) {
    if (ema20 > ema50 && price > ema20) {
      return { regime: 'trend_up', adx: round(adx14, 1), ema20: round(ema20, 5), ema50: round(ema50, 5) };
    }
    if (ema20 < ema50 && price < ema20) {
      return { regime: 'trend_down', adx: round(adx14, 1), ema20: round(ema20, 5), ema50: round(ema50, 5) };
    }
  }

  return { regime: 'range', adx: adx14 != null ? round(adx14, 1) : null, ema20, ema50 };
}

function scorePullbackLong(bars1m, bars5m, quote, options = {}) {
  const minBuyScore = Number(options.minBuyScore) || 72;
  const watchScore = minBuyScore - 12;
  const requireMomentum = options.requireMomentum !== false;
  const closes1 = bars1m.map((b) => b.close);
  const closes5 = bars5m.map((b) => b.close);
  const price = quote.mid ?? quote.bid ?? closes1[closes1.length - 1];
  const ema9 = ema(closes1, 9);
  const ema21 = ema(closes1, 21);
  const rsi14 = rsi(closes1, 14);
  const atr14 = atr(bars1m, 14);
  const regimeInfo = detectRegime(bars5m);

  let score = 50;
  const reasons = [];

  if (regimeInfo.regime !== 'trend_up') {
    return {
      action: 'SKIP',
      side: null,
      score: 0,
      regime: regimeInfo.regime,
      reason: `regime ${regimeInfo.regime} — long pullback лише в trend_up`,
      regimeInfo,
    };
  }

  score += 15;
  reasons.push('5m trend_up');

  if (ema9 != null && ema21 != null && ema9 > ema21) {
    score += 12;
    reasons.push('1m EMA9 > EMA21');
  } else {
    score -= 15;
    return {
      action: 'SKIP',
      side: null,
      score: Math.max(0, score),
      regime: regimeInfo.regime,
      reason: '1m EMA не підтверджує long',
      regimeInfo,
    };
  }

  if (ema9 != null) {
    const dist = (price - ema9) / price;
    if (dist >= 0 && dist <= 0.0008) {
      score += 15;
      reasons.push('відкат до EMA9');
    } else if (dist > 0.002) {
      score -= 8;
      reasons.push('далеко від EMA9');
    }
  }

  if (rsi14 != null) {
    if (rsi14 >= 40 && rsi14 <= 58) score += 10;
    else if (rsi14 > 68) {
      score -= 12;
      reasons.push('RSI перегрів');
    }
  }

  if (requireMomentum) {
    const m1Mom = hasBarMomentum(closes1, 'long');
    const m5Bias = lastCompletedBarBias(bars5m);
    if (!m1Mom) {
      score -= 20;
      reasons.push('1m немає імпульсу вгору');
    } else {
      score += 5;
      reasons.push('1m імпульс ↑');
    }
    if (m5Bias === 'bear') {
      score -= 15;
      reasons.push('5m остання свічка вниз');
    } else if (m5Bias === 'bull') {
      score += 5;
      reasons.push('5m остання свічка вгору');
    }
  }

  let action = 'SKIP';
  if (score >= minBuyScore) action = 'BUY';
  else if (score >= watchScore) action = 'WATCH';

  return {
    action,
    side: action === 'BUY' ? 'long' : null,
    score: Math.round(score),
    regime: regimeInfo.regime,
    reason: reasons.join('; ') || 'pullback rules',
    regimeInfo,
    indicators: {
      price: round(price, 5),
      ema9: ema9 != null ? round(ema9, 5) : null,
      ema21: ema21 != null ? round(ema21, 5) : null,
      rsi14: rsi14 != null ? round(rsi14, 1) : null,
      atr14: atr14 != null ? round(atr14, 5) : null,
    },
  };
}

function scorePullbackShort(bars1m, bars5m, quote, options = {}) {
  const minBuyScore = Number(options.minBuyScore) || 72;
  const watchScore = minBuyScore - 12;
  const requireMomentum = options.requireMomentum !== false;
  const closes1 = bars1m.map((b) => b.close);
  const price = quote.mid ?? quote.ask ?? closes1[closes1.length - 1];
  const ema9 = ema(closes1, 9);
  const ema21 = ema(closes1, 21);
  const rsi14 = rsi(closes1, 14);
  const atr14 = atr(bars1m, 14);
  const regimeInfo = detectRegime(bars5m);

  let score = 50;
  const reasons = [];

  if (regimeInfo.regime !== 'trend_down') {
    return {
      action: 'SKIP',
      side: null,
      score: 0,
      regime: regimeInfo.regime,
      reason: `regime ${regimeInfo.regime} — short pullback лише в trend_down`,
      regimeInfo,
    };
  }

  score += 15;
  reasons.push('5m trend_down');

  if (ema9 != null && ema21 != null && ema9 < ema21) {
    score += 12;
    reasons.push('1m EMA9 < EMA21');
  } else {
    score -= 15;
    return {
      action: 'SKIP',
      side: null,
      score: Math.max(0, score),
      regime: regimeInfo.regime,
      reason: '1m EMA не підтверджує short',
      regimeInfo,
    };
  }

  if (ema9 != null) {
    const dist = (ema9 - price) / price;
    if (dist >= 0 && dist <= 0.0008) {
      score += 15;
      reasons.push('відкат до EMA9 (short)');
    } else if (dist > 0.002) {
      score -= 8;
      reasons.push('далеко від EMA9');
    }
  }

  if (rsi14 != null) {
    if (rsi14 >= 42 && rsi14 <= 60) score += 10;
    else if (rsi14 < 32) {
      score -= 12;
      reasons.push('RSI перепроданий');
    }
  }

  if (requireMomentum) {
    const m1Mom = hasBarMomentum(closes1, 'short');
    const m5Bias = lastCompletedBarBias(bars5m);
    if (!m1Mom) {
      score -= 20;
      reasons.push('1m немає імпульсу вниз');
    } else {
      score += 5;
      reasons.push('1m імпульс ↓');
    }
    if (m5Bias === 'bull') {
      score -= 15;
      reasons.push('5m остання свічка вгору');
    } else if (m5Bias === 'bear') {
      score += 5;
      reasons.push('5m остання свічка вниз');
    }
  }

  let action = 'SKIP';
  if (score >= minBuyScore) action = 'SELL';
  else if (score >= watchScore) action = 'WATCH';

  return {
    action,
    side: action === 'SELL' ? 'short' : null,
    score: Math.round(score),
    regime: regimeInfo.regime,
    reason: reasons.join('; ') || 'pullback short rules',
    regimeInfo,
    indicators: {
      price: round(price, 5),
      ema9: ema9 != null ? round(ema9, 5) : null,
      ema21: ema21 != null ? round(ema21, 5) : null,
      rsi14: rsi14 != null ? round(rsi14, 1) : null,
      atr14: atr14 != null ? round(atr14, 5) : null,
    },
  };
}

module.exports = {
  detectRegime,
  scorePullbackLong,
  scorePullbackShort,
  hasBarMomentum,
  lastCompletedBarBias,
};
