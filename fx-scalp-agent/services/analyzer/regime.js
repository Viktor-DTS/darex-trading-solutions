const { ema, rsi, atr, adx } = require('./indicators');
const { round } = require('../utils');

function detectRegime(bars5m) {
  const closes = bars5m.map((b) => b.close);
  const price = closes[closes.length - 1];
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const adx14 = adx(bars5m, 14);

  if (adx14 != null && adx14 >= 22 && ema20 != null && ema50 != null) {
    if (ema20 > ema50 && price > ema20) {
      return { regime: 'trend_up', adx: round(adx14, 1), ema20: round(ema20, 5), ema50: round(ema50, 5) };
    }
    if (ema20 < ema50 && price < ema20) {
      return { regime: 'trend_down', adx: round(adx14, 1), ema20: round(ema20, 5), ema50: round(ema50, 5) };
    }
  }

  return { regime: 'range', adx: adx14 != null ? round(adx14, 1) : null, ema20, ema50 };
}

function scorePullbackLong(bars1m, bars5m, quote) {
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

  let action = 'SKIP';
  if (score >= 72) action = 'BUY';
  else if (score >= 60) action = 'WATCH';

  return {
    action,
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

module.exports = {
  detectRegime,
  scorePullbackLong,
};
