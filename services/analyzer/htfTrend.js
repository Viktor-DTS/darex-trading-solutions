const { ema } = require('./indicators');
const { detectRegime } = require('./regime');
const { round } = require('../utils');

/**
 * 1h higher-timeframe trend filter.
 * Long only above EMA50 and not in 1h trend_down; short the mirror.
 */
function checkH1Trend(bars1h, side) {
  if (!bars1h || bars1h.length < 50) {
    return { blocked: false, reason: '', ema50: null, price: null, h1Regime: null };
  }
  const closes = bars1h.map((b) => b.close);
  const price = closes[closes.length - 1];
  const ema50 = ema(closes, 50);
  const h1Regime = detectRegime(bars1h);

  if (side === 'long' && h1Regime.regime === 'trend_down') {
    return {
      blocked: true,
      reason: `1h regime trend_down — long заборонено`,
      ema50: ema50 != null ? round(ema50, 5) : null,
      price: round(price, 5),
      h1Regime: h1Regime.regime,
    };
  }
  if (side === 'short' && h1Regime.regime === 'trend_up') {
    return {
      blocked: true,
      reason: `1h regime trend_up — short заборонено`,
      ema50: ema50 != null ? round(ema50, 5) : null,
      price: round(price, 5),
      h1Regime: h1Regime.regime,
    };
  }

  if (ema50 == null) {
    return { blocked: false, reason: '', ema50: null, price: round(price, 5), h1Regime: h1Regime.regime };
  }

  if (side === 'long' && price < ema50) {
    return {
      blocked: true,
      reason: `1h нижче EMA50 (${round(price, 5)} < ${round(ema50, 5)})`,
      ema50: round(ema50, 5),
      price: round(price, 5),
      h1Regime: h1Regime.regime,
    };
  }
  if (side === 'short' && price > ema50) {
    return {
      blocked: true,
      reason: `1h вище EMA50 (${round(price, 5)} > ${round(ema50, 5)})`,
      ema50: round(ema50, 5),
      price: round(price, 5),
      h1Regime: h1Regime.regime,
    };
  }

  return {
    blocked: false,
    reason: '',
    ema50: round(ema50, 5),
    price: round(price, 5),
    h1Regime: h1Regime.regime,
  };
}

module.exports = { checkH1Trend };
