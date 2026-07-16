const { normPair } = require('../utils');
const { parsePairList } = require('./pairFilter');

/** Tier 1 — majors + tight crosses (always in session). */
const DEFAULT_TIER1 = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'EURCAD',
];

function getTier1Pairs(cfg = {}) {
  const custom = parsePairList(process.env.FX_PAIR_TIER1 || cfg.pairTier1Raw || '');
  return custom.length ? custom : DEFAULT_TIER1.map(normPair);
}

function getPairTier(pairInput, cfg = {}) {
  const pair = normPair(pairInput);
  const tier1 = getTier1Pairs(cfg);
  return tier1.includes(pair) ? 1 : 2;
}

/**
 * Tier 1: active all session hours (spread cap from session).
 * Tier 2: overlap 12–16 UTC only, wider spread cap.
 */
function checkPairTierLiquidity(pairInput, spreadPips, cfg = {}, session = {}) {
  const pair = normPair(pairInput);
  const tier = getPairTier(pair, cfg);
  const spread = Number(spreadPips) || 0;
  const sessionMax = session.maxSpreadPips ?? cfg.maxSpreadPips ?? 2;

  if (tier === 1) {
    if (spread > sessionMax) {
      return {
        ok: false,
        tier,
        reason: `tier1 spread ${spread} > ${sessionMax}`,
      };
    }
    return { ok: true, tier };
  }

  if (session.tier2Allowed !== true) {
    return {
      ok: false,
      tier,
      reason: `tier2 ${pair} — лише overlap 12–16 UTC`,
    };
  }

  const tier2Max = cfg.pairTier2MaxSpreadPips ?? 3;
  if (spread > tier2Max) {
    return {
      ok: false,
      tier,
      reason: `tier2 spread ${spread} > ${tier2Max}`,
    };
  }

  return { ok: true, tier };
}

/** Tier2 requires higher conviction than tier1 (defaults from env). */
function getMinScoreForPair(pairInput, cfg = {}, session = {}) {
  const tier = getPairTier(pairInput, cfg);
  const baseBuy = cfg.minBuyScore ?? 80;
  const baseSell = cfg.minSellScore ?? 80;
  if (tier === 1) {
    return { tier, minBuyScore: baseBuy, minSellScore: baseSell };
  }
  const tier2Min = session.tier2MinBuyScore
    ?? cfg.pairTier2MinBuyScore
    ?? 78;
  return {
    tier,
    minBuyScore: Math.max(baseBuy, tier2Min),
    minSellScore: Math.max(baseSell, tier2Min),
  };
}

module.exports = {
  DEFAULT_TIER1,
  getTier1Pairs,
  getPairTier,
  checkPairTierLiquidity,
  getMinScoreForPair,
};
