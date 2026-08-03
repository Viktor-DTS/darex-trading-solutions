const { normPair } = require('../utils');

/**
 * PAIR_DAY_LOSS_CAP — after N losing closes on a pair today, skip new entries until next day.
 */
function dayKeyUtc(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function countPairLossesToday(closedTrades, pair, dayKey = dayKeyUtc()) {
  const p = normPair(pair);
  let n = 0;
  for (const t of closedTrades || []) {
    if (normPair(t.pair) !== p) continue;
    const closedAt = t.closedAt || t.ts || t.time;
    if (!closedAt) continue;
    const key = String(closedAt).slice(0, 10);
    if (key !== dayKey) continue;
    const pnl = t.pnlUsd ?? t.netPnlUsd ?? t.pnl;
    if (Number(pnl) < 0) n += 1;
  }
  return n;
}

function pairDayLossBlocked(closedTrades, pair, cfg = {}) {
  const cap = cfg.pairDayLossCap != null
    ? Number(cfg.pairDayLossCap)
    : Number(process.env.FX_PAIR_DAY_LOSS_CAP ?? 2);
  if (!Number.isFinite(cap) || cap <= 0) {
    return { blocked: false, losses: 0, cap: 0 };
  }
  const losses = countPairLossesToday(closedTrades, pair);
  return {
    blocked: losses >= cap,
    losses,
    cap,
    reason: losses >= cap ? `pair day loss cap ${losses}/${cap}` : null,
  };
}

module.exports = {
  dayKeyUtc,
  countPairLossesToday,
  pairDayLossBlocked,
};
