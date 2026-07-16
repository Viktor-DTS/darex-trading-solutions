/**
 * ORACLE ensemble: GBM + bootstrap MC + Kalman → forecast mid +5m (1 M5 bar).
 */

const { mean, std } = require('../analyzer/math/stats');
const { fitOU } = require('../analyzer/math/ou');

function clamp01(x) {
  return Math.max(0.01, Math.min(0.99, x));
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

/**
 * Bootstrap 1-step forward (5 min = 1 M5 bar).
 */
function mcForwardOneBar({ spotMid, rets, paths = 500 }) {
  if (!rets?.length || !spotMid) return null;
  const prices = [];
  for (let i = 0; i < paths; i += 1) {
    const r = rets[Math.floor(Math.random() * rets.length)];
    prices.push(spotMid * Math.exp(r));
  }
  prices.sort((a, b) => a - b);
  const up = prices.filter((p) => p > spotMid).length / paths;
  return {
    forecastMid: quantile(prices, 0.5),
    band_p10: quantile(prices, 0.1),
    band_p90: quantile(prices, 0.9),
    pUp: clamp01(up),
    model: 'mc',
  };
}

function gbmForwardOneBar({ spotMid, mu, sigma }) {
  if (!spotMid) return null;
  const dt = 1;
  const drift = mu != null ? mu * dt : 0;
  const vol = sigma != null && sigma > 0 ? sigma * Math.sqrt(dt) : 0;
  const forecastMid = spotMid + drift;
  const band = vol > 0 ? 1.28 * vol : spotMid * 0.0001;
  const pUp = clamp01(0.5 + (drift / (2 * (vol || spotMid * 0.00005))));
  return {
    forecastMid,
    band_p10: forecastMid - band,
    band_p90: forecastMid + band,
    pUp,
    model: 'gbm',
  };
}

function kalmanForwardOneBar({ spotMid, kalman }) {
  if (!spotMid || !kalman?.mu) return null;
  const delta = spotMid * kalman.mu;
  const forecastMid = spotMid + delta;
  const band = Math.abs(delta) * 2 + spotMid * 0.00005;
  const pUp = clamp01(kalman.mu > 0 ? 0.5 + Math.min(0.35, Math.abs(kalman.z || 0) * 0.08) : 0.5 - Math.min(0.35, Math.abs(kalman.z || 0) * 0.08));
  return {
    forecastMid,
    band_p10: forecastMid - band,
    band_p90: forecastMid + band,
    pUp: kalman.mu >= 0 ? pUp : 1 - pUp,
    model: 'kalman',
  };
}

function ouForwardOneBar({ spotMid, closes, ou }) {
  if (!spotMid || !ou?.meanReverting || ou.theta == null) return null;
  const muLevel = ou.mu ?? mean(closes);
  if (muLevel == null) return null;
  const phi = Math.exp(-(ou.theta || 0));
  const forecastMid = muLevel + (spotMid - muLevel) * phi;
  const band = Math.abs(spotMid - muLevel) * (1 - phi) + spotMid * 0.00005;
  const pUp = clamp01(forecastMid > spotMid ? 0.5 + 0.15 : 0.5 - 0.15);
  return {
    forecastMid,
    band_p10: Math.min(forecastMid, spotMid) - band * 0.5,
    band_p90: Math.max(forecastMid, spotMid) + band * 0.5,
    pUp,
    model: 'ou',
  };
}

/**
 * Weighted ensemble for +5m mid forecast.
 */
function ensembleForecast5m(features, cfg = {}) {
  const { spotMid, rets, closes, dv, kalman, ou, H } = features;
  const paths = cfg.oracleMcPaths ?? 500;
  const votes = [];

  const gbm = gbmForwardOneBar({
    spotMid,
    mu: kalman?.significant ? spotMid * (kalman.mu || 0) : dv?.mu,
    sigma: dv?.sigma,
  });
  if (gbm) votes.push({ ...gbm, w: 1 });

  const mc = mcForwardOneBar({ spotMid, rets, paths });
  if (mc) votes.push({ ...mc, w: 1.2 });

  const kal = kalmanForwardOneBar({ spotMid, kalman });
  if (kal) votes.push({ ...kal, w: kalman?.significant ? 1.15 : 0.7 });

  if (H != null && H < 0.52) {
    const ouF = ouForwardOneBar({ spotMid, closes, ou });
    if (ouF) votes.push({ ...ouF, w: H < 0.45 ? 1.25 : 0.9 });
  }

  if (!votes.length) {
    return { ok: false, reason: 'oracle: no ensemble votes' };
  }

  const wSum = votes.reduce((s, v) => s + v.w, 0);
  const forecastMid = votes.reduce((s, v) => s + v.forecastMid * v.w, 0) / wSum;
  const band_p10 = votes.reduce((s, v) => s + v.band_p10 * v.w, 0) / wSum;
  const band_p90 = votes.reduce((s, v) => s + v.band_p90 * v.w, 0) / wSum;
  const pUp = clamp01(votes.reduce((s, v) => s + v.pUp * v.w, 0) / wSum);

  const ps = votes.map((v) => v.pUp);
  const pMean = mean(ps);
  const pStd = std(ps) || 0;
  const kappa = clamp01(1 - pStd * (cfg.oracleKappaScale ?? 2.2));

  const models = {};
  for (const v of votes) {
    models[v.model] = round6(v.pUp);
  }

  return {
    ok: true,
    forecastMid: round6(forecastMid),
    band_p10: round6(band_p10),
    band_p90: round6(band_p90),
    pUp,
    pDown: clamp01(1 - pUp),
    kappa,
    models,
    direction: pUp >= 0.5 ? 'up' : 'down',
    confidence: clamp01(Math.abs(pUp - 0.5) * 2 * kappa),
  };
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

module.exports = {
  ensembleForecast5m,
  mcForwardOneBar,
  gbmForwardOneBar,
};
