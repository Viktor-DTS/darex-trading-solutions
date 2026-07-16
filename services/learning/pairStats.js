const { getClosedTrades } = require('../journal');
const { normPair } = require('../utils');

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function summarizeSideTrades(trades) {
  let consecutiveLosses = 0;
  for (let i = trades.length - 1; i >= 0; i -= 1) {
    if ((trades[i].pnlUsd ?? 0) <= 0) consecutiveLosses += 1;
    else break;
  }

  const wins = trades.filter((t) => (t.pnlUsd ?? 0) > 0).length;
  const pnlUsd = trades.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);

  return {
    count: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    pnlUsd: Math.round(pnlUsd * 100) / 100,
    consecutiveLosses,
  };
}

/**
 * Rolling per-side profile: preferred direction, weak-side penalties, hard blocks.
 */
function computePairSideProfile(pairInput, options = {}) {
  const pair = normPair(pairInput);
  const minTrades = options.minSideTrades ?? options.sideProfileMinTrades ?? 5;
  const lookback = options.sideLookback ?? options.sideProfileLookback ?? 30;
  const badWr = options.badSideWinRate ?? options.sideProfileBadWr ?? 30;
  const goodWr = options.goodSideWinRate ?? options.sideProfileGoodWr ?? 55;
  const thresholdPenalty = options.sideThresholdPenalty ?? options.sideProfileThresholdPenalty ?? 8;
  const convictionBonus = options.sideConvictionBonus ?? options.sideProfileConvictionBonus ?? 4;
  const minWrGap = options.sideProfileMinWrGap ?? 20;

  const closed = getClosedTrades(500).filter((t) => t.pair === pair);
  const recent = closed.slice(-lookback);
  const longTrades = recent.filter((t) => t.side === 'long');
  const shortTrades = recent.filter((t) => t.side === 'short');
  const long = summarizeSideTrades(longTrades);
  const short = summarizeSideTrades(shortTrades);

  const blockedSides = { long: false, short: false };
  const blockReasons = { long: '', short: '' };
  const thresholdAdjust = { long: 0, short: 0 };
  const convictionAdjust = { long: 0, short: 0 };
  let preferredSide = null;
  let weakSide = null;

  const longWeak = long.count >= minTrades && long.winRate < badWr;
  const shortWeak = short.count >= minTrades && short.winRate < badWr;
  const longStrong = long.count >= minTrades && long.winRate >= goodWr;
  const shortStrong = short.count >= minTrades && short.winRate >= goodWr;

  if (longWeak && shortStrong && (short.winRate - long.winRate) >= minWrGap) {
    preferredSide = 'short';
    weakSide = 'long';
    blockedSides.long = true;
    blockReasons.long = `long WR ${long.winRate}% (${long.count} угод) vs short ${short.winRate}%`;
    thresholdAdjust.long = thresholdPenalty;
    convictionAdjust.short = convictionBonus;
  } else if (shortWeak && longStrong && (long.winRate - short.winRate) >= minWrGap) {
    preferredSide = 'long';
    weakSide = 'short';
    blockedSides.short = true;
    blockReasons.short = `short WR ${short.winRate}% (${short.count} угод) vs long ${long.winRate}%`;
    thresholdAdjust.short = thresholdPenalty;
    convictionAdjust.long = convictionBonus;
  } else {
    if (longWeak) {
      weakSide = 'long';
      thresholdAdjust.long = thresholdPenalty;
      if (short.count >= 3 && short.winRate >= 45) {
        preferredSide = 'short';
        convictionAdjust.short = convictionBonus;
      }
    }
    if (shortWeak) {
      if (!weakSide || short.winRate < long.winRate) weakSide = 'short';
      thresholdAdjust.short = Math.max(thresholdAdjust.short, thresholdPenalty);
      if (long.count >= 3 && long.winRate >= 45) {
        preferredSide = 'long';
        convictionAdjust.long = convictionBonus;
      }
    }
    if (longStrong && (!shortStrong || long.winRate >= short.winRate)) {
      preferredSide = 'long';
      convictionAdjust.long = convictionBonus;
    } else if (shortStrong && (!longStrong || short.winRate > long.winRate)) {
      preferredSide = 'short';
      convictionAdjust.short = convictionBonus;
    }
  }

  return {
    lookback,
    minTrades,
    long,
    short,
    preferredSide,
    weakSide,
    blockedSides,
    blockReasons,
    thresholdAdjust,
    convictionAdjust,
    thresholdPenalty,
    convictionBonus,
  };
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
  const sideProfile = computePairSideProfile(pair, options);

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
    sideProfile,
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
  computePairSideProfile,
  summarizeSideTrades,
  todayKey,
};
