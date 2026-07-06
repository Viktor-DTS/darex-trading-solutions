const { getClosedTrades } = require('../journal');
const { normPair } = require('../utils');

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function getPairDayStats(pairInput, options = {}) {
  const pair = normPair(pairInput);
  const day = options.day || todayKey();
  const pauseAfterSl = options.pauseAfterSl ?? 3;

  const closed = getClosedTrades(200).filter((t) => {
    if (t.pair !== pair) return false;
    const closedDay = t.closedAt
      ? new Date(t.closedAt).toISOString().slice(0, 10)
      : null;
    return closedDay === day;
  });

  let consecutiveLosses = 0;
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    if ((closed[i].pnlUsd ?? 0) <= 0) consecutiveLosses += 1;
    else break;
  }

  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const todayPnlUsd = closed.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);

  return {
    pair,
    day,
    todayCount: closed.length,
    todayWins: wins,
    todayLosses: closed.length - wins,
    todayWinRate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
    todayPnlUsd: Math.round(todayPnlUsd * 100) / 100,
    consecutiveLosses,
    paused: consecutiveLosses >= pauseAfterSl,
    pauseReason: consecutiveLosses >= pauseAfterSl
      ? `${consecutiveLosses} SL підряд сьогодні`
      : '',
  };
}

function getAllPairStats(pairs, options = {}) {
  const out = {};
  for (const p of pairs) {
    out[normPair(p)] = getPairDayStats(p, options);
  }
  return out;
}

module.exports = {
  getPairDayStats,
  getAllPairStats,
  todayKey,
};
