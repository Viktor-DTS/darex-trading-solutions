const { adx, atr, ema } = require('./indicators');
const { detectRegime, regimeMinAdx } = require('./regime');
const { round } = require('../utils');

/**
 * Market regime: trend | range | volatile
 * - trend: pullback strategy allowed
 * - range: no new entries (chop)
 * - volatile: ATR spike — no entries
 */
function classifyMarketRegime(bars5m, bars1h = null) {
  const trend5 = detectRegime(bars5m);
  const adxVal = trend5.adx ?? 0;
  const atrNow = atr(bars5m, 14);
  let volRatio = 1;

  if (atrNow != null && bars5m.length >= 34) {
    const atrs = [];
    for (let i = bars5m.length - 20; i < bars5m.length; i += 1) {
      const slice = bars5m.slice(0, i + 1);
      const a = atr(slice, 14);
      if (a != null) atrs.push(a);
    }
    const atrAvg = atrs.length ? atrs.reduce((s, v) => s + v, 0) / atrs.length : atrNow;
    volRatio = atrAvg > 0 ? atrNow / atrAvg : 1;
  }

  let h1Trend = null;
  if (bars1h?.length >= 50) {
    const closes = bars1h.map((b) => b.close);
    const price = closes[closes.length - 1];
    const ema50 = ema(closes, 50);
    if (ema50 != null) {
      h1Trend = price >= ema50 ? 'up' : 'down';
    }
  }

  const volatileThreshold = Number(process.env.FX_VOLATILITY_RATIO) || 1.45;

  if (volRatio >= volatileThreshold) {
    return {
      marketRegime: 'volatile',
      tradeAllowed: false,
      direction: null,
      reason: `ATR spike ${round(volRatio, 2)}x — не торгуємо`,
      adx: adxVal,
      volRatio: round(volRatio, 2),
      trend5,
      h1Trend,
    };
  }

  if ((trend5.regime === 'trend_up' || trend5.regime === 'trend_down') && adxVal >= regimeMinAdx()) {
    return {
      marketRegime: 'trend',
      tradeAllowed: true,
      direction: trend5.regime === 'trend_up' ? 'long' : 'short',
      reason: `5m ${trend5.regime} ADX ${adxVal}`,
      adx: adxVal,
      volRatio: round(volRatio, 2),
      trend5,
      h1Trend,
    };
  }

  return {
    marketRegime: 'range',
    tradeAllowed: false,
    direction: null,
    reason: `range/chop ADX ${adxVal || '—'} — чекаємо trend`,
    adx: adxVal,
    volRatio: round(volRatio, 2),
    trend5,
    h1Trend,
  };
}

module.exports = { classifyMarketRegime };
