/**
 * Ideal Formula v3 — documented weights for fundamental + technical conviction.
 *
 * CONVICTION =
 *   0.30 × Fundamental(pair, side)
 * + 0.28 × H1_layer
 * + 0.18 × M5_layer
 * + 0.14 × M1_layer
 * + ADX_bonus + session_bonus
 * − spread_penalty − pair_penalty
 *
 * Fundamental(pair, side) = f(currency_strength_base − currency_strength_quote, side)
 * Each currency strength ∈ [0, 100] from weighted macro factors.
 */

const IDEAL_FORMULA_WEIGHTS = {
  fundamental: 0.30,
  h1: 0.28,
  m5: 0.18,
  m1: 0.14,
};

/** Per-currency factor weights (must sum ~1.0 per currency). */
const CURRENCY_FACTOR_WEIGHTS = {
  USD: { dxy: 0.35, yields: 0.30, risk: 0.15, gold: 0.10, spy: 0.10 },
  EUR: { dxyInverse: 0.45, yieldsInverse: 0.25, risk: 0.15, spy: 0.15 },
  GBP: { risk: 0.30, spy: 0.30, dxyInverse: 0.20, yields: 0.20 },
  JPY: { usdjpy: 0.55, riskOff: 0.30, gold: 0.15 },
  CHF: { riskOff: 0.35, gold: 0.35, vix: 0.15, dxyInverse: 0.15 },
  AUD: { risk: 0.30, china: 0.35, audnzd: 0.20, oil: 0.15 },
  NZD: { risk: 0.30, china: 0.25, audnzdInverse: 0.30, spy: 0.15 },
  CAD: { oil: 0.45, dxy: 0.25, risk: 0.15, yields: 0.15 },
  SEK: { risk: 0.35, dxyInverse: 0.30, yieldsInverse: 0.20, riskOff: 0.15 },
  NOK: { oil: 0.35, risk: 0.25, dxyInverse: 0.25, riskOff: 0.15 },
  SGD: { risk: 0.35, china: 0.30, dxy: 0.20, spy: 0.15 },
  HKD: { dxy: 0.50, risk: 0.25, china: 0.25 },
  PLN: { risk: 0.30, dxyInverse: 0.35, yieldsInverse: 0.20, riskOff: 0.15 },
  MXN: { oil: 0.30, risk: 0.30, dxy: 0.25, yields: 0.15 },
  ZAR: { risk: 0.35, gold: 0.25, dxy: 0.25, oil: 0.15 },
};

const FACTOR_LABELS = {
  dxy: 'DXY / USD',
  dxyInverse: 'Anti-USD',
  yields: 'US10Y yields',
  yieldsInverse: 'Yield pressure on EUR',
  risk: 'Risk-on appetite',
  riskOff: 'Safe-haven flow',
  gold: 'Gold',
  spy: 'Equities (SPY)',
  vix: 'VIX stress',
  usdjpy: 'USDJPY / JPY',
  china: 'China (FXI)',
  audnzd: 'AUD vs NZD',
  audnzdInverse: 'NZD vs AUD',
  oil: 'Oil',
};

module.exports = {
  IDEAL_FORMULA_WEIGHTS,
  CURRENCY_FACTOR_WEIGHTS,
  FACTOR_LABELS,
};
