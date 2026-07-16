const { pipSize, round, priceToPips } = require('../utils');
const { appendActual } = require('./journal');

/** In-memory pending forecasts awaiting +5m reconcile. */
const pendingForecasts = new Map();

function registerPendingForecast(oracle) {
  if (!oracle?.oracleId) return;
  pendingForecasts.set(oracle.oracleId, oracle);
}

function loadPendingFromDisk(cfg) {
  const { loadPendingForecasts } = require('./journal');
  const loaded = loadPendingForecasts(cfg);
  for (const [id, row] of loaded) {
    if (!pendingForecasts.has(id)) pendingForecasts.set(id, row);
  }
}

/**
 * Reconcile forecasts whose horizon has elapsed.
 * @param {object} hub - MarketDataHub
 * @param {object} cfg - oracle config
 */
async function reconcileOracleActuals(hub, cfg = {}) {
  if (!pendingForecasts.size) return { reconciled: 0 };

  const now = Date.now();
  const horizonMs = (cfg.horizonSec ?? 300) * 1000;
  let reconciled = 0;

  for (const [oracleId, forecast] of [...pendingForecasts.entries()]) {
    const t0Ms = forecast.t0Ms || Date.parse(forecast.t0);
    if (!Number.isFinite(t0Ms) || now < t0Ms + horizonMs) continue;

    const pair = forecast.pair;
    let snap = hub?.getPairSnapshot?.(pair);
    if (!snap?.mid && hub?.refreshPair) {
      try {
        snap = await hub.refreshPair(pair);
      } catch (_) {
        snap = null;
      }
    }

    const actualMid = snap?.mid ?? snap?.bid ?? snap?.ask;
    if (actualMid == null) continue;

    const pip = pipSize(pair);
    const digits = pair.includes('JPY') ? 3 : 5;
    const errorPips = priceToPips(Math.abs(actualMid - forecast.spotMid), pair);
    const forecastErrorPips = priceToPips(Math.abs(actualMid - forecast.forecastMid_5m), pair);
    const actualUp = actualMid > forecast.spotMid;
    const directionHit = (forecast.pUp >= 0.5 && actualUp) || (forecast.pUp < 0.5 && !actualUp);

    appendActual({
      oracleId,
      pair,
      t0: forecast.t0,
      reconciledAt: new Date().toISOString(),
      spotMid: forecast.spotMid,
      forecastMid_5m: forecast.forecastMid_5m,
      actualMid_5m: round(actualMid, digits),
      errorPips: round(errorPips, 2),
      forecastErrorPips: round(forecastErrorPips, 2),
      directionHit,
      actualUp,
      pUp: forecast.pUp,
      direction: forecast.direction,
      linkedEntry: forecast.linkedEntry ?? false,
    }, cfg);

    pendingForecasts.delete(oracleId);
    reconciled += 1;
  }

  return { reconciled, pending: pendingForecasts.size };
}

function getPendingCount() {
  return pendingForecasts.size;
}

module.exports = {
  registerPendingForecast,
  loadPendingFromDisk,
  reconcileOracleActuals,
  getPendingCount,
  pendingForecasts,
};
