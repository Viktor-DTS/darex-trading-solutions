const config = require('../../config');
const { round, normPair } = require('../utils');
const {
  getSpreadPips,
  fillLongEntry,
  fillShortEntry,
  tradePnlUsd,
  enrichTradeSizing,
  calcUnitsForRisk,
  pipValueUsd,
} = require('./pricing');

function buildTradeFromAnalysis(analysis, cfg) {
  const pair = normPair(analysis.pair);
  const spreadPips = getSpreadPips(pair, cfg);
  const mid = analysis.quote?.mid ?? analysis.entry;
  const isShort = analysis.action === 'SELL' || analysis.side === 'short';
  const stopPips = analysis.stopPips ?? cfg.stopPips;
  const useRiskSizing = cfg.simUseRiskSizing !== false;

  let entry;
  if (isShort) {
    const hasRealBid = analysis.quote?.bid != null && analysis.quote?.mid != null
      && analysis.quote.bid !== analysis.quote.mid;
    entry = hasRealBid
      ? round(analysis.quote.bid, 5)
      : fillShortEntry(analysis.entry ?? mid, pair, spreadPips);
  } else {
    const hasRealAsk = analysis.quote?.ask != null && analysis.quote?.mid != null
      && analysis.quote.ask !== analysis.quote.mid;
    entry = hasRealAsk
      ? round(analysis.quote.ask, 5)
      : fillLongEntry(analysis.entry ?? mid, pair, spreadPips);
  }

  const units = useRiskSizing
    ? calcUnitsForRisk(cfg.equityUsd, cfg.riskPerTradePct, stopPips, pair, mid)
    : Math.floor(100000 * (cfg.equityUsd / 1000));
  const pipVal = pipValueUsd(units, pair, mid);

  return {
    pair,
    side: isShort ? 'short' : 'long',
    entry,
    stopLoss: analysis.stopLoss,
    takeProfit: analysis.takeProfit,
    openedAt: Date.now(),
    score: analysis.score,
    regime: analysis.regime,
    stopPips,
    targetPips: analysis.targetPips,
    units,
    spreadPips,
    pipValueUsd: round(pipVal, 4),
    lots: round(units / 100000, 4),
    riskUsd: round(cfg.equityUsd * cfg.riskPerTradePct / 100, 2),
  };
}

function createSimExecutor(options = {}) {
  const cfg = { ...config, ...options };
  const maxOpen = cfg.maxOpenPositions ?? 5;
  const useRiskSizing = cfg.simUseRiskSizing !== false;
  /** @type {Map<string, object>} */
  const openByPair = new Map();
  const closed = [];

  function buildTrade(analysis) {
    return buildTradeFromAnalysis(analysis, cfg);
  }

  return {
    isTradingEnabled: () => true,

    getOpenTrades: () => [...openByPair.values()],
    getOpenTrade: () => openByPair.values().next().value ?? null,
    getOpenCount: () => openByPair.size,
    hasPair: (pair) => openByPair.has(normPair(pair)),
    getClosed: () => closed,

    tryOpen(analysis) {
      if (analysis.action !== 'BUY' && analysis.action !== 'SELL') return null;
      const pair = normPair(analysis.pair);
      if (openByPair.has(pair)) return null;
      if (openByPair.size >= maxOpen) return null;

      const trade = buildTrade(analysis);
      if (trade.units <= 0) return null;

      openByPair.set(pair, trade);
      return trade;
    },

    onTick(pairInput, quote) {
      const pair = normPair(pairInput);
      const openTrade = openByPair.get(pair);
      if (!openTrade) return null;

      const bid = quote.bid ?? quote.mid;
      const ask = quote.ask ?? quote.mid;
      if (bid == null || ask == null) return null;

      openTrade.lastBid = bid;
      openTrade.lastAsk = ask;
      openTrade.lastMarkAt = Date.now();

      if (openTrade.side === 'short') {
        openTrade.lastMark = ask;
        if (ask >= openTrade.stopLoss) {
          return this._close(pair, openTrade.stopLoss, 'stop');
        }
        if (ask <= openTrade.takeProfit) {
          return this._close(pair, openTrade.takeProfit, 'take_profit');
        }
        return null;
      }

      openTrade.lastMark = bid;
      if (bid <= openTrade.stopLoss) {
        return this._close(pair, openTrade.stopLoss, 'stop');
      }
      if (bid >= openTrade.takeProfit) {
        return this._close(pair, openTrade.takeProfit, 'take_profit');
      }
      return null;
    },

    _close(pair, exitPrice, reason) {
      const t = openByPair.get(pair);
      if (!t) return null;
      const { pips, grossUsd, pnlUsd } = tradePnlUsd(t, exitPrice, cfg.simCommissionUsd);
      const trade = {
        ...t,
        exit: round(exitPrice, 5),
        exitReason: reason,
        closedAt: Date.now(),
        pips,
        grossPnlUsd: grossUsd,
        commissionUsd: cfg.simCommissionUsd,
        pnlUsd,
      };
      closed.push(trade);
      openByPair.delete(pair);
      return trade;
    },

    forceClose(pairInput, reason = 'manual') {
      const pair = normPair(pairInput);
      const t = openByPair.get(pair);
      if (!t) return null;
      const exit = t.side === 'short' ? (t.lastAsk ?? t.entry) : (t.lastBid ?? t.entry);
      return this._close(pair, exit, reason);
    },

    restoreOpen(entry) {
      if (!entry?.pair) return false;
      const pair = normPair(entry.pair);
      if (openByPair.has(pair) || openByPair.size >= maxOpen) return false;
      const { type: _t, ts: _ts, exit: _e, exitReason: _r, closedAt: _c, ...clean } = entry;
      openByPair.set(pair, enrichTradeSizing(clean, cfg));
      return true;
    },

    restoreAll(entries) {
      let n = 0;
      for (const entry of entries) {
        if (this.restoreOpen(entry)) n += 1;
      }
      return n;
    },
  };
}

module.exports = { createSimExecutor, buildTradeFromAnalysis };
