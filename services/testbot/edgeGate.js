const { normPair } = require('../utils');
const { computeEdgeStats, computePairEdgeStats } = require('./edgeMath');

/**
 * Master gate: no entry unless empirical E>0 and Kelly f*>0.
 * Insufficient samples → block (do not invent edge).
 */
function evaluateTestbotEdgeGate(closedTrades, cfg = {}, pair = null) {
  const minTrades = Number.isFinite(cfg.edgeMinTrades)
    ? cfg.edgeMinTrades
    : (Number(process.env.FX_TESTBOT_EDGE_MIN_TRADES) || 30);
  const minE = Number.isFinite(cfg.edgeMinE)
    ? cfg.edgeMinE
    : (Number(process.env.FX_TESTBOT_EDGE_MIN_E) || 0);
  const requireKelly = cfg.edgeRequireKelly !== false
    && process.env.FX_TESTBOT_EDGE_REQUIRE_KELLY !== '0';
  const window = Number.isFinite(cfg.edgeWindow)
    ? cfg.edgeWindow
    : (Number(process.env.FX_TESTBOT_EDGE_WINDOW) || 80);
  const pairMin = Number.isFinite(cfg.edgePairMinTrades)
    ? cfg.edgePairMinTrades
    : (Number(process.env.FX_TESTBOT_EDGE_PAIR_MIN_TRADES) || 8);

  const global = computeEdgeStats(closedTrades, { window });

  if (global.n < minTrades) {
    return {
      ok: false,
      reason: `edge: need ≥${minTrades} closed (have ${global.n})`,
      global,
      pair: null,
      sizeMult: 0,
    };
  }

  if (!(global.E > minE)) {
    return {
      ok: false,
      reason: `edge: E=${global.E}≤${minE} (p=${(global.p * 100).toFixed(1)}% W=${global.avgWin} L=${global.avgLoss})`,
      global,
      pair: null,
      sizeMult: 0,
    };
  }

  if (requireKelly && !(global.kelly > 0)) {
    return {
      ok: false,
      reason: `edge: Kelly f*=${global.kelly}≤0 (BE WR≥${(global.beWr * 100).toFixed(0)}%)`,
      global,
      pair: null,
      sizeMult: 0,
    };
  }

  let pairStats = null;
  if (pair) {
    pairStats = computePairEdgeStats(closedTrades, normPair(pair), { window });
    if (pairStats.n >= pairMin) {
      if (!(pairStats.E > minE) || (requireKelly && !(pairStats.kelly > 0))) {
        return {
          ok: false,
          reason: `edge pair ${normPair(pair)}: E=${pairStats.E} kelly=${pairStats.kelly} (n=${pairStats.n})`,
          global,
          pair: pairStats,
          sizeMult: 0,
        };
      }
    }
  }

  const kellyFrac = Number.isFinite(cfg.kellyFraction)
    ? cfg.kellyFraction
    : (Number(process.env.FX_TESTBOT_KELLY_FRACTION) || 0.25);
  // Map positive kelly to size multiplier in (0.15 .. 1]
  const raw = Math.max(0, global.kelly) * kellyFrac;
  const sizeMult = Math.max(0.15, Math.min(1, raw > 0 ? Math.min(1, raw * 4) : 0));

  return {
    ok: true,
    reason: `edge OK E=${global.E} f*=${global.kelly} → size×${sizeMult.toFixed(2)}`,
    global,
    pair: pairStats,
    sizeMult,
  };
}

module.exports = {
  evaluateTestbotEdgeGate,
};
