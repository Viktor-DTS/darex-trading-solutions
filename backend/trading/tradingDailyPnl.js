const { getEtDayBounds } = require('./tradingSession');

async function calcDailyPnlUsd(models) {
  if (!models?.TradingTrade) return 0;
  const { start, end } = getEtDayBounds();
  const trades = await models.TradingTrade.find({
    status: 'closed',
    closedAt: { $gte: start, $lt: end },
  })
    .select('pnlUsd')
    .lean();

  return round2(trades.reduce((sum, t) => sum + (Number(t.pnlUsd) || 0), 0));
}

async function countTradesOpenedToday(models) {
  if (!models?.TradingTrade) return 0;
  const { start, end } = getEtDayBounds();
  return models.TradingTrade.countDocuments({
    openedAt: { $gte: start, $lt: end },
    status: { $ne: 'cancelled' },
  });
}

function evaluateDailyLimits(settings, dailyPnlUsd, tradesToday) {
  const equity = Number(settings?.equityUsd) || 1700;
  const profitTarget = Number(settings?.dailyProfitTargetUsd) || 0;
  const lossLimitPct = Number(settings?.dailyLossLimitPct) || 2;
  const lossLimitUsd = settings?.dailyLossLimitUsd != null
    ? Number(settings.dailyLossLimitUsd)
    : round2(equity * (lossLimitPct / 100));
  const maxTrades = Number(settings?.maxTradesPerDay) || 0;

  let blockNewEntries = false;
  let blockReason = '';

  if (profitTarget > 0 && dailyPnlUsd >= profitTarget) {
    blockNewEntries = true;
    blockReason = `денна ціль +$${profitTarget} досягнута (P/L $${dailyPnlUsd})`;
  } else if (dailyPnlUsd <= -Math.abs(lossLimitUsd)) {
    blockNewEntries = true;
    blockReason = `денний ліміт збитку −$${Math.abs(lossLimitUsd)} (P/L $${dailyPnlUsd})`;
  } else if (maxTrades > 0 && tradesToday >= maxTrades) {
    blockNewEntries = true;
    blockReason = `ліміт угод на день (${maxTrades})`;
  }

  return {
    blockNewEntries,
    blockReason,
    dailyPnlUsd,
    tradesToday,
    profitTargetUsd: profitTarget,
    lossLimitUsd,
    maxTradesPerDay: maxTrades,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  calcDailyPnlUsd,
  countTradesOpenedToday,
  evaluateDailyLimits,
};
