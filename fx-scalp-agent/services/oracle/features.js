/**
 * Feature extraction for ORACLE-5m (~3h window).
 */

const {
  logReturns,
  hurstExponent,
  jumpShare,
  parkinsonVol,
  ewmaMoments,
  kalmanDrift,
  medianBarRange,
  mean,
  std,
} = require('../analyzer/math/stats');
const { estimateDriftVol } = require('../analyzer/math/barrier');
const { fitOU } = require('../analyzer/math/ou');

function windowCloses(bars, n) {
  const closes = (bars || []).map((b) => b.close).filter((x) => Number.isFinite(x));
  if (!closes.length) return [];
  return closes.slice(-Math.min(n, closes.length));
}

function extractFeatures({ barsM5, barsM1, winBars = 36 }) {
  const closes = windowCloses(barsM5, Math.max(winBars, 64));
  if (closes.length < 30) {
    return { ok: false, reason: 'oracle: need ≥30 M5 bars' };
  }

  const rets = logReturns(closes);
  const H = hurstExponent(closes);
  const J = jumpShare(rets);
  const park = parkinsonVol((barsM5 || []).slice(-winBars));
  const ewma = ewmaMoments(rets, 0.94);
  const kalman = kalmanDrift(rets);
  const dv = estimateDriftVol(closes, winBars);
  const ou = fitOU(closes);
  const medRangeM5 = medianBarRange(barsM5, 24);
  const medRangeM1 = barsM1?.length >= 20 ? medianBarRange(barsM1, 30) : null;
  const spotMid = closes[closes.length - 1];

  return {
    ok: true,
    closes,
    rets,
    spotMid,
    H,
    J,
    park,
    ewma,
    kalman,
    dv,
    ou,
    medRangeM5,
    medRangeM1,
    sigma5m: dv?.sigma ?? (spotMid && std(rets) != null ? spotMid * std(rets) : null),
    mu5m: dv?.mu ?? 0,
  };
}

module.exports = {
  windowCloses,
  extractFeatures,
};
