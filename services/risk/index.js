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

const { calcUnitsForRisk } = require('../executor/pricing');

function calcUnits(equityUsd, riskPct, stopPips, pair, midPrice = null) {
  return calcUnitsForRisk(equityUsd, riskPct, stopPips, pair, midPrice);
}

module.exports = {
  createRiskState,
  checkEntryAllowed,
  calcUnits,
};
