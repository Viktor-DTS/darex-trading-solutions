const { checkRegimeGreenLight, buildLamps } = require('./regimeGate');
const { computeIdealConviction } = require('./idealFormula');

/**
 * Smart conviction via Ideal Formula v3 (fundamentals + technical layers).
 */
function computeSmartScore(ctx) {
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

  const layers = layerEval?.layers || {};
  const lamps = buildLamps(layers);

  const ideal = computeIdealConviction({
    layerEval,
    fundamental,
    marketRegime,
    spreadPips,
    pairStats,
    cfg,
    side,
    pair,
    macro,
  });

  return {
    conviction: ideal.conviction,
    threshold: ideal.threshold,
    pass: ideal.pass,
    lamps,
    spreadPenalty: ideal.components.spreadPenalty,
    adxBonus: ideal.components.adxBonus,
    pairPenalty: ideal.components.pairPenalty,
    weights: ideal.weights,
    components: ideal.components,
    formula: ideal.formula,
    fundamental,
  };
}

module.exports = {
  checkRegimeGreenLight,
  buildLamps,
  computeSmartScore,
};
