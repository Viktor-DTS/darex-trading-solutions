/**
 * ORACLE-5m — 5-minute price forecast + path probability gate.
 */

const { randomUUID } = require('crypto');
const { evaluateTheta } = require('../analyzer/math/theta');
const { pipSize, round } = require('../utils');
const { extractFeatures } = require('./features');
const { ensembleForecast5m } = require('./ensemble');
const { appendForecast } = require('./journal');

function sessionLabel() {
  const h = new Date().getUTCHours();
  if (h >= 7 && h < 12) return 'london';
  if (h >= 12 && h < 17) return 'ny_overlap';
  if (h >= 0 && h < 7) return 'asia';
  return 'off_hours';
}

function applySpreadForecast(forecastMid, quote, pair, spreadHalfPips = null) {
  const pip = pipSize(pair);
  const spreadPips = quote?.spreadPips ?? spreadHalfPips;
  const half = spreadPips != null ? (spreadPips * pip) / 2 : pip * 0.5;
  return {
    forecastBid_5m: round(forecastMid - half, pair.includes('JPY') ? 3 : 5),
    forecastAsk_5m: round(forecastMid + half, pair.includes('JPY') ? 3 : 5),
  };
}

/**
 * @param {object} params
 * @param {string} params.pair
 * @param {object} params.quote - bid/ask/mid/spreadPips
 * @param {object[]} params.barsM5
 * @param {object[]} [params.barsM1]
 * @param {object} params.analysis - prepared testbot analysis (entry, sl, tp, side)
 * @param {object} params.cfg - oracle config
 */
function forecastOracle5m({
  pair,
  quote,
  barsM5,
  barsM1 = null,
  analysis = null,
  cfg = {},
}) {
  const horizonSec = cfg.horizonSec ?? 300;
  const spotMid = quote?.mid ?? quote?.bid ?? quote?.ask;
  if (spotMid == null) {
    return { ok: false, reason: 'oracle: no spot mid' };
  }

  const features = extractFeatures({
    barsM5,
    barsM1,
    winBars: cfg.windowBars ?? 36,
  });
  if (!features.ok) {
    return { ok: false, reason: features.reason };
  }

  const ensemble = ensembleForecast5m(features, cfg);
  if (!ensemble.ok) {
    return { ok: false, reason: ensemble.reason };
  }

  const spread = applySpreadForecast(ensemble.forecastMid, quote, pair);
  const t0 = new Date().toISOString();
  const oracleId = `oracle-${Date.now()}-${pair}-${randomUUID().slice(0, 8)}`;

  let theta = null;
  let pHitTpBeforeSl = null;
  let microOk = true;
  let microReason = null;

  if (analysis?.entry && analysis?.stopLoss && analysis?.takeProfit && analysis?.side) {
    const pip = pipSize(pair);
    theta = evaluateTheta({
      side: analysis.side,
      entry: analysis.entry,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      barsM5,
      barsM1,
      spreadPips: quote?.spreadPips,
      pipSize: pip,
      cfg: {
        mathGate: false,
        mathWindowBars: cfg.windowBars ?? 36,
        mathLookback: cfg.lookback ?? 64,
        mathMcPaths: cfg.mcPaths ?? 400,
        mathMcMaxBars: cfg.mcMaxBars ?? 6,
        mathMicroMinBarsInStop: cfg.microMinBarsInStop ?? 1.5,
        mathMicroMinM1: cfg.microMinM1 ?? 3,
        mathMinKappa: cfg.minKappa ?? 0.55,
        mathMinPReach: cfg.minPTp ?? 0.52,
      },
    });
    pHitTpBeforeSl = theta?.pReach ?? null;
    microOk = theta?.microOk !== false;
    microReason = theta?.microReason || null;
  }

  const oracle = {
    oracleId,
    pair,
    t0,
    t0Ms: Date.now(),
    horizonSec,
    spotMid: round(spotMid, pair.includes('JPY') ? 3 : 5),
    forecastMid_5m: ensemble.forecastMid,
    forecastBid_5m: spread.forecastBid_5m,
    forecastAsk_5m: spread.forecastAsk_5m,
    band_p10: ensemble.band_p10,
    band_p90: ensemble.band_p90,
    pUp: ensemble.pUp,
    pDown: ensemble.pDown,
    pHitTpBeforeSl,
    direction: ensemble.direction,
    confidence: ensemble.confidence,
    models: ensemble.models,
    kappa: ensemble.kappa,
    microOk,
    microReason,
    session: sessionLabel(),
    features: {
      H: features.H != null ? Math.round(features.H * 100) / 100 : null,
      sigma_5m: features.sigma5m != null ? Math.round(features.sigma5m * 1e6) / 1e6 : null,
      spreadPips: quote?.spreadPips ?? null,
      jumpShare: features.J != null ? Math.round(features.J * 100) / 100 : null,
    },
    execSide: analysis?.side ?? null,
    execAction: analysis?.action ?? null,
    thetaNotes: theta?.notes ?? null,
    ok: true,
    reason: `ORACLE ${ensemble.direction} pUp=${(ensemble.pUp * 100).toFixed(1)}% κ=${ensemble.kappa.toFixed(2)}${pHitTpBeforeSl != null ? ` P(TP)=${(pHitTpBeforeSl * 100).toFixed(1)}%` : ''}`,
  };

  if (cfg.logForecasts !== false) {
    appendForecast(oracle, cfg);
  }

  return oracle;
}

module.exports = {
  forecastOracle5m,
  sessionLabel,
};
