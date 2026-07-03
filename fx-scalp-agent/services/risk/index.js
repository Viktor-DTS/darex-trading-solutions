const config = require('../../config');
const { round } = require('../utils');

function createRiskState() {
  return {
    tradingPaused: false,
    pauseReason: '',
    dailyPnlUsd: 0,
    tradesToday: 0,
    dayKey: new Date().toISOString().slice(0, 10),
  };
}

function checkEntryAllowed(state, settings = config) {
  const equity = settings.equityUsd;
  const dailyLimit = equity * (settings.dailyLossLimitPct / 100);

  if (state.tradingPaused) {
    return { allowed: false, reason: state.pauseReason || 'paused' };
  }
  if (state.dailyPnlUsd <= -dailyLimit) {
    return { allowed: false, reason: `daily loss limit −$${round(dailyLimit, 2)}` };
  }
  if (state.tradesToday >= settings.maxTradesPerDay) {
    return { allowed: false, reason: `max trades/day ${settings.maxTradesPerDay}` };
  }
  return { allowed: true, reason: '' };
}

function calcUnits(equityUsd, riskPct, stopPips, pair) {
  const riskUsd = equityUsd * (riskPct / 100);
  const pipValuePerUnit = pair.includes('JPY') ? 0.01 / 100 : 0.0001;
  if (stopPips <= 0 || pipValuePerUnit <= 0) return 0;
  const units = Math.floor(riskUsd / (stopPips * pipValuePerUnit));
  return Math.max(0, units);
}

module.exports = {
  createRiskState,
  checkEntryAllowed,
  calcUnits,
};
