const { round } = require('../utils');
const { IDEAL_FORMULA_WEIGHTS } = require('../macro/factorWeights');

/**
 * Ideal Formula v3 — unified conviction from fundamentals + technical layers.
 *
 * conviction =
 *   Wf × fundamentalScore +
 *   Wh × h1Score +
 *   Wm5 × m5Score +
 *   Wm1 × m1Score +
 *   adxBonus − spreadPenalty − pairPenalty
 */
function layerPoints(layer) {
  if (!layer?.aligned) return 0;
  return layer.score ?? 50;
}

const { findPostNewsBoost } = require('./postNewsBoost');

function computeIdealConviction(ctx) {
  const {
    layerEval,
    fundamental = null,
    marketRegime,
    spreadPips = 0,
    pairStats = null,
    cfg = {},
    side = null,
    pair = null,
    macro = null,
  } = ctx;

  const W = { ...IDEAL_FORMULA_WEIGHTS, ...(cfg.idealWeights || {}) };
  const layers = layerEval?.layers || {};

  const fundScore = fundamental?.score ?? layers.macro?.score ?? 50;
  const h1Score = layerPoints(layers.h1);
  const m5Score = layerPoints(layers.m5);
  const m1Score = layerPoints(layers.m1);

  let conviction = 0;
  conviction += (fundScore || 0) * W.fundamental;
  conviction += h1Score * W.h1;
  conviction += m5Score * W.m5;
  conviction += m1Score * W.m1;

  const adx = marketRegime?.adx ?? 0;
  let adxBonus = 0;
  if (adx >= 32) adxBonus = 6;
  else if (adx >= 26) adxBonus = 3;
  else if (adx >= 22) adxBonus = 1;
  conviction += adxBonus;

  const effectiveSpread = spreadPips > 0 ? spreadPips : 0;
  const spreadPenalty = Math.max(0, (effectiveSpread - 1.0) * 7);
  conviction -= spreadPenalty;

  let pairPenalty = 0;
  let sideProfileAdj = 0;
  const sideKey = side === 'short' ? 'short' : side === 'long' ? 'long' : null;
  const sideProfile = pairStats?.sideProfile;

  if (pairStats?.paused) pairPenalty = 20;
  else if ((pairStats?.consecutiveLosses ?? 0) >= 2) pairPenalty = 10;
  else if ((pairStats?.todayPnlUsd ?? 0) < -3) pairPenalty = 8;
  else if ((pairStats?.todayWinRate ?? 0) >= 55 && (pairStats?.todayCount ?? 0) >= 2) {
    conviction += 4;
  }
  conviction -= pairPenalty;

  if (sideKey && sideProfile) {
    sideProfileAdj = sideProfile.convictionAdjust?.[sideKey] ?? 0;
    conviction += sideProfileAdj;
  }

  const newsBoost = findPostNewsBoost({ cfg, side, pair, macro });
  if (newsBoost) {
    conviction += newsBoost.convictionBoost;
  }

  const baseMin = side === 'short' && (cfg.minSellScore ?? 0) > 0
    ? cfg.minSellScore
    : (cfg.minBuyScore ?? 78);
  let threshold = baseMin;
  const aligned = layerEval?.alignedCount ?? 0;
  const fundStrong = (fundamental?.edge ?? 0) >= 0.12;

  if (aligned === 4) threshold -= 4;
  else if (aligned === 3 && !layers.macro?.aligned) threshold += 5;
  if (fundStrong) threshold -= 2;
  if (marketRegime?.marketRegime === 'trend' && adx >= 28) threshold -= 2;
  if (effectiveSpread > 1.8) threshold += 3;
  if ((fundamental?.edge ?? 0) < 0) threshold += 4;
  if (newsBoost) threshold -= newsBoost.thresholdDrop;

  if (sideKey && sideProfile?.thresholdAdjust?.[sideKey]) {
    threshold += sideProfile.thresholdAdjust[sideKey];
  }

  threshold = Math.max(65, Math.min(92, Math.round(threshold)));
  const floorMin = cfg.minBuyScore ?? cfg.learned?.minBuyScore ?? 70;
  if (floorMin >= 78) {
    const floor = Math.max(65, floorMin - 8);
    threshold = Math.max(floor, threshold);
  }
  conviction = Math.round(conviction);

  return {
    conviction,
    threshold,
    pass: conviction >= threshold,
    postNewsBoost: newsBoost,
    components: {
      fundamental: { score: fundScore, weight: W.fundamental, points: round(fundScore * W.fundamental, 1) },
      h1: { score: h1Score, weight: W.h1, points: round(h1Score * W.h1, 1) },
      m5: { score: m5Score, weight: W.m5, points: round(m5Score * W.m5, 1) },
      m1: { score: m1Score, weight: W.m1, points: round(m1Score * W.m1, 1) },
      adxBonus,
      spreadPenalty: round(spreadPenalty, 1),
      pairPenalty,
      sideProfileAdj,
      sideProfile: sideProfile && sideKey ? {
        preferredSide: sideProfile.preferredSide,
        weakSide: sideProfile.weakSide,
        thresholdAdjust: sideProfile.thresholdAdjust?.[sideKey] ?? 0,
        convictionAdjust: sideProfileAdj,
      } : null,
    },
    weights: W,
    formula: 'Ideal v3: 0.30×Fund + 0.28×H1 + 0.18×M5 + 0.14×M1 + bonuses − penalties',
  };
}

module.exports = {
  IDEAL_FORMULA_WEIGHTS,
  computeIdealConviction,
};
