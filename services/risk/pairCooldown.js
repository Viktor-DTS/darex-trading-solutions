const { normPair } = require('../utils');
const { readAllEvents } = require('../journal');

function createPairCooldown(cfg) {
  const stopMs = cfg.pairCooldownSlMs ?? cfg.pairCooldownMs ?? 900000;
  const tpMs = cfg.pairCooldownTpMs ?? 300000;
  /** @type {Map<string, number>} pair -> until timestamp */
  const untilByPair = new Map();

  function cooldownForReason(reason) {
    const profitDecayMs = cfg.pairCooldownProfitDecayMs ?? 3600000;
    if (reason === 'profit_decay' || reason === 'good_enough') return profitDecayMs;
    if (reason === 'take_profit') return tpMs;
    return stopMs;
  }

  function hydrateFromJournal() {
    const events = readAllEvents();
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (ev.type !== 'exit' && ev.exitReason == null) continue;
      const pair = normPair(ev.pair);
      if (untilByPair.has(pair)) continue;
      const closedAt = ev.closedAt || Date.parse(ev.ts);
      if (!Number.isFinite(closedAt)) continue;
      const until = closedAt + cooldownForReason(ev.exitReason);
      if (until > Date.now()) untilByPair.set(pair, until);
    }
  }

  function markExit(pairInput, reason = 'stop') {
    untilByPair.set(normPair(pairInput), Date.now() + cooldownForReason(reason));
  }

  function isBlocked(pairInput) {
    const pair = normPair(pairInput);
    const until = untilByPair.get(pair);
    if (!until) return { blocked: false, reason: '' };
    if (until <= Date.now()) {
      untilByPair.delete(pair);
      return { blocked: false, reason: '' };
    }
    const minLeft = Math.ceil((until - Date.now()) / 60000);
    return { blocked: true, reason: `cooldown на парі (${minLeft} хв)` };
  }

  return { hydrateFromJournal, markExit, isBlocked, untilByPair };
}

module.exports = { createPairCooldown };
