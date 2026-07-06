const { readAllEvents } = require('../journal');
const { dayKeyFromTs } = require('../journal');
const { normPair } = require('../utils');

function getPairEntriesToday(pairInput, dayKey = new Date().toISOString().slice(0, 10)) {
  const pair = normPair(pairInput);
  return readAllEvents().filter((ev) => {
    if (ev.type !== 'entry') return false;
    if (normPair(ev.pair) !== pair) return false;
    return dayKeyFromTs(ev.ts || ev.openedAt) === dayKey;
  });
}

function isPairDailyLimitReached(pairInput, maxPerDay, dayKey = new Date().toISOString().slice(0, 10)) {
  const max = Number(maxPerDay);
  if (!Number.isFinite(max) || max <= 0) {
    return { blocked: false, count: 0, reason: '' };
  }
  const count = getPairEntriesToday(pairInput, dayKey).length;
  if (count >= max) {
    return {
      blocked: true,
      count,
      reason: `pair daily limit ${count}/${max}`,
    };
  }
  return { blocked: false, count, reason: '' };
}

module.exports = {
  getPairEntriesToday,
  isPairDailyLimitReached,
};
