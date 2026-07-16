const { normPair } = require('../utils');

/** @type {Map<string, number>} last exit ts per pair */
const lastExitByPair = new Map();

function hydrateFromClosedTrades(closedTrades) {
  for (const t of closedTrades || []) {
    const pair = normPair(t.pair);
    const at = Number(t.closedAt) || 0;
    if (!at) continue;
    const prev = lastExitByPair.get(pair) ?? 0;
    if (at > prev) lastExitByPair.set(pair, at);
  }
}

function markPairExit(pair, at = Date.now()) {
  lastExitByPair.set(normPair(pair), at);
}

function cooldownRemainingMs(pair, cfg) {
  const ms = cfg.pairCooldownMs ?? 300000;
  const last = lastExitByPair.get(normPair(pair));
  if (!last) return 0;
  return Math.max(0, ms - (Date.now() - last));
}

function hadPriorExit(pair) {
  return lastExitByPair.has(normPair(pair));
}

function isCooldownActive(pair, cfg) {
  return cooldownRemainingMs(pair, cfg) > 0;
}

module.exports = {
  hydrateFromClosedTrades,
  markPairExit,
  cooldownRemainingMs,
  hadPriorExit,
  isCooldownActive,
};
