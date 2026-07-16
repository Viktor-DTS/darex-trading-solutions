const { readActuals } = require('./journal');

function mean(arr) {
  if (!arr?.length) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function summarizeOracleStats(cfg = {}, windowSize = 200) {
  const actuals = readActuals(windowSize * 2, cfg).slice(-windowSize);
  const withDir = actuals.filter((a) => a.directionHit != null);
  const withErr = actuals.filter((a) => Number.isFinite(a.errorPips));

  const directionHits = withDir.filter((a) => a.directionHit === true).length;
  const directionHitRate = withDir.length
    ? directionHits / withDir.length
    : null;

  const brierSamples = actuals.filter((a) => Number.isFinite(a.pUp) && a.actualUp != null);
  let brier = null;
  if (brierSamples.length >= 10) {
    brier = brierSamples.reduce((s, a) => {
      const y = a.actualUp ? 1 : 0;
      return s + (a.pUp - y) ** 2;
    }, 0) / brierSamples.length;
  }

  const avgErrorPips = withErr.length ? mean(withErr.map((a) => a.errorPips)) : null;

  const byPair = {};
  for (const a of withDir) {
    const p = a.pair || '?';
    if (!byPair[p]) byPair[p] = { hits: 0, total: 0 };
    byPair[p].total += 1;
    if (a.directionHit) byPair[p].hits += 1;
  }
  for (const p of Object.keys(byPair)) {
    const row = byPair[p];
    row.hitRate = row.total ? row.hits / row.total : null;
  }

  const minHit = cfg.minDirectionHitRate ?? 0.52;
  const minSamples = cfg.minStatsSamples ?? 30;
  const calibrationOk = withDir.length < minSamples
    || (directionHitRate != null && directionHitRate >= minHit);

  return {
    samples: withDir.length,
    directionHits,
    directionHitRate,
    directionHitPct: directionHitRate != null ? Math.round(directionHitRate * 1000) / 10 : null,
    brier,
    avgErrorPips: avgErrorPips != null ? Math.round(avgErrorPips * 100) / 100 : null,
    byPair,
    calibrationOk,
    tradeAllowed: calibrationOk,
    lastActuals: actuals.slice(-12).reverse(),
  };
}

module.exports = {
  summarizeOracleStats,
};
