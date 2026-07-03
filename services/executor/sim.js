const config = require('../../config');
const { round, pipsToPrice, priceToPips } = require('../utils');

function createSimExecutor(options = {}) {
  const cfg = { ...config, ...options };
  let openTrade = null;
  const closed = [];

  return {
    getOpenTrade: () => openTrade,
    getClosed: () => closed,

    tryOpen(analysis) {
      if (openTrade || analysis.action !== 'BUY') return null;
      const entry = analysis.entry;
      const spread = pipsToPrice(cfg.simSpreadPips, analysis.pair);
      openTrade = {
        pair: analysis.pair,
        side: 'long',
        entry: round(entry + spread / 2, 5),
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        openedAt: Date.now(),
        score: analysis.score,
      };
      return openTrade;
    },

    onTick(quote) {
      if (!openTrade) return null;
      const bid = quote.bid ?? quote.mid;
      if (bid == null) return null;

      openTrade.lastBid = bid;
      openTrade.lastMarkAt = Date.now();

      if (bid <= openTrade.stopLoss) {
        return this._close(bid, 'stop');
      }
      if (bid >= openTrade.takeProfit) {
        return this._close(openTrade.takeProfit, 'take_profit');
      }
      return null;
    },

    _close(exitPrice, reason) {
      const t = openTrade;
      const pips = priceToPips(exitPrice - t.entry, t.pair);
      const pnlUsdApprox = pips * 10 * (config.equityUsd / 1000);
      const trade = {
        ...t,
        exit: round(exitPrice, 5),
        exitReason: reason,
        closedAt: Date.now(),
        pips: round(pips, 1),
        pnlUsd: round(pnlUsdApprox - cfg.simCommissionUsd, 2),
      };
      closed.push(trade);
      openTrade = null;
      return trade;
    },

    forceClose(reason = 'manual') {
      if (!openTrade) return null;
      const bid = openTrade.lastBid ?? openTrade.entry;
      return this._close(bid, reason);
    },
  };
}

module.exports = { createSimExecutor };
