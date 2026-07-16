const { adx, atr } = require('../indicators');
const { getSpreadPips } = require('../../executor/pricing');
const { priceToPips } = require('../../utils');

/**
 * Rank pairs for CHARLIE scalp: prefer WIDELY moving instruments.
 * Score ↑ with ATR/range (pips), ↓ with spread drag, mild ADX bonus.
 * Dead quiet pairs are pushed down / filtered.
 */
function realizedRangePips(bars, pair, lookback = 24) {
  if (!bars?.length) return null;
  const slice = bars.slice(-Math.min(lookback, bars.length));
  let high = -Infinity;
  let low = Infinity;
  for (const b of slice) {
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return null;
  return priceToPips(high - low, pair);
}

function atrPips(bars, pair, period = 14) {
  const a = atr(bars, period);
  if (a == null) return null;
  return priceToPips(a, pair);
}

function rankCharliePairs(pairs, snapshots, cfg) {
  const minAdx = cfg.charlieMinAdx ?? 14;
  const maxSpread = cfg.maxSpreadPips ?? 2.5;
  const minAtr = cfg.charlieMinAtrPips ?? 6;
  const minRange = cfg.charlieMinRangePips ?? 12;
  const minAtrSpread = cfg.charlieMinAtrSpreadRatio ?? 3;
  const preferVol = cfg.charliePreferVolatility !== false;

  const ranked = pairs.map((pair) => {
    const snap = snapshots.get ? snapshots.get(pair) : snapshots[pair];
    const spreadPips = snap?.spreadPips > 0
      ? snap.spreadPips
      : getSpreadPips(pair, cfg);
    const barsM5 = snap?.bars5m || snap?.barsM5 || [];
    const adxVal = barsM5.length >= 30 ? adx(barsM5, 14) : null;
    const atrP = barsM5.length >= 20 ? atrPips(barsM5, pair, 14) : null;
    const rangeP = barsM5.length >= 12 ? realizedRangePips(barsM5, pair, 24) : null;
    const atrSpread = atrP != null && spreadPips > 0 ? atrP / spreadPips : null;

    let rankScore = preferVol ? 40 : 100;
    // Volatility is the main scalp fuel
    if (atrP != null) {
      rankScore += Math.min(50, atrP * 2.2);
      if (atrP < minAtr) rankScore -= (minAtr - atrP) * 6;
    } else {
      rankScore -= 25;
    }
    if (rangeP != null) {
      rankScore += Math.min(35, rangeP * 0.9);
      if (rangeP < minRange) rankScore -= (minRange - rangeP) * 2;
    }
    // Short-horizon micro-heat (recent M5 / M1 range) — chase live movers between REST hunts
    const microM5 = barsM5.length >= 6 ? realizedRangePips(barsM5, pair, 6) : null;
    const barsM1 = snap?.bars1m || snap?.barsM1 || [];
    const microM1 = barsM1.length >= 8 ? realizedRangePips(barsM1, pair, 12) : null;
    if (microM5 != null) rankScore += Math.min(22, microM5 * 1.5);
    if (microM1 != null) rankScore += Math.min(12, microM1 * 0.7);
    // Cost gate: need ATR >> spread or scalp dies to commission
    rankScore -= spreadPips * 10;
    if (atrSpread != null) {
      if (atrSpread >= minAtrSpread) rankScore += Math.min(20, (atrSpread - minAtrSpread) * 3);
      else rankScore -= (minAtrSpread - atrSpread) * 8;
    }
    if (adxVal != null) {
      if (adxVal >= minAdx) rankScore += Math.min(15, (adxVal - minAdx) * 0.8);
      else rankScore -= (minAdx - adxVal) * 1.2;
    }
    if (spreadPips > maxSpread) rankScore -= 40;

    const alive = (atrP == null || atrP >= minAtr * 0.7)
      && (rangeP == null || rangeP >= minRange * 0.6)
      && (atrSpread == null || atrSpread >= minAtrSpread * 0.6)
      && spreadPips <= maxSpread * 1.25;

    return {
      pair,
      rankScore: Math.round(rankScore),
      spreadPips: roundSpread(spreadPips),
      adx: adxVal != null ? Math.round(adxVal * 10) / 10 : null,
      atrPips: atrP != null ? Math.round(atrP * 10) / 10 : null,
      rangePips: rangeP != null ? Math.round(rangeP * 10) / 10 : null,
      atrSpreadRatio: atrSpread != null ? Math.round(atrSpread * 100) / 100 : null,
      alive,
    };
  });

  ranked.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.rankScore - a.rankScore;
  });
  return ranked;
}

function roundSpread(v) {
  return Math.round(v * 100) / 100;
}

function selectTopCharliePairs(pairs, snapshots, cfg) {
  const maxPairs = cfg.charlieMaxPairs ?? 4;
  const ranked = rankCharliePairs(pairs, snapshots, cfg);
  const alive = ranked.filter((r) => r.alive);
  const pool = alive.length ? alive : ranked;
  const top = pool.slice(0, maxPairs).map((r) => r.pair);
  return { top, ranked };
}

/**
 * ATR-scaled SL/TP for volatile scalp (pips).
 * Wide movers → wider geometry; quiet → reject upstream via alive filter.
 */
function atrScaledLevels(atrPipsVal, cfg = {}) {
  if (atrPipsVal == null || !(atrPipsVal > 0)) {
    return {
      stopPips: cfg.charlieStopPips ?? 4.5,
      targetPips: cfg.charlieTargetMinPips ?? 10,
      mode: 'fixed',
    };
  }
  const stopMult = cfg.charlieAtrStopMult ?? 0.35;
  const tpMult = cfg.charlieAtrTpMult ?? 0.85;
  const minStop = cfg.charlieStopPips ?? 4.5;
  const minTp = cfg.charlieTargetMinPips ?? 10;
  const maxStop = cfg.charlieMaxStopPips ?? 12;
  const maxTp = cfg.charlieTargetMaxPips ?? 28;
  const minRr = cfg.charlieMinRR ?? 2.0;

  let stopPips = Math.min(maxStop, Math.max(minStop, atrPipsVal * stopMult));
  let targetPips = Math.min(maxTp, Math.max(minTp, atrPipsVal * tpMult));
  if (targetPips / stopPips < minRr) {
    targetPips = Math.min(maxTp, stopPips * minRr);
  }
  return {
    stopPips: Math.round(stopPips * 10) / 10,
    targetPips: Math.round(targetPips * 10) / 10,
    mode: 'atr',
    atrPips: Math.round(atrPipsVal * 10) / 10,
  };
}

module.exports = {
  rankCharliePairs,
  selectTopCharliePairs,
  atrScaledLevels,
  atrPips,
  realizedRangePips,
};
