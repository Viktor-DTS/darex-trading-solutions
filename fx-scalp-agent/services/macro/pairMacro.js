const { evaluatePairFundamentals } = require('./fundamentalEngine');

/** Macro alignment via full fundamental engine (all factors). */
function checkMacroAlignment(pairInput, side, macro) {
  if (!macro) {
    return { aligned: true, score: 50, reason: 'macro n/a', fundamental: null };
  }

  const fund = evaluatePairFundamentals(pairInput, side, macro);

  return {
    aligned: fund.aligned,
    score: fund.score,
    reason: fund.blocked ? fund.reason : `fund ${fund.edgeScore} (${fund.reason})`,
    fundamental: fund,
    edge: fund.edge,
    baseStrength: fund.baseStrength,
    quoteStrength: fund.quoteStrength,
    factors: fund.factors,
  };
}

module.exports = { checkMacroAlignment, evaluatePairFundamentals };
