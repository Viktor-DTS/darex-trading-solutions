const { normPair, round } = require('../utils');
const { enrichTradeSizing, tradePnlUsd } = require('./pricing');
const { buildTradeFromAnalysis } = require('./sim');
const { OandaClient } = require('./oandaClient');

function createOandaPaperExecutor(options = {}) {
  const config = require('../../config');
  const cfg = { ...config, ...options };
  const maxOpen = cfg.maxOpenPositions ?? 5;
  const client = new OandaClient(cfg);
  /** @type {Map<string, object>} */
  const openByPair = new Map();
  const closed = [];

  return {
    mode: 'oanda',
    client,
    isTradingEnabled: () => client.configured,

    getOpenTrades: () => [...openByPair.values()],
    getOpenTrade: () => openByPair.values().next().value ?? null,
    getOpenCount: () => openByPair.size,
    hasPair: (pair) => openByPair.has(normPair(pair)),
    getClosed: () => closed,

    async tryOpen(analysis) {
      if (analysis.action !== 'BUY' && analysis.action !== 'SELL') return null;
      const pair = normPair(analysis.pair);
      if (openByPair.has(pair)) return null;
      if (openByPair.size >= maxOpen) return null;
      if (!client.configured) {
        throw new Error('OANDA paper: FX_OANDA_TOKEN and FX_OANDA_ACCOUNT required');
      }

      const draft = buildTradeFromAnalysis(analysis, cfg);
      if (!draft.units) return null;

      const signedUnits = draft.side === 'short' ? -Math.abs(draft.units) : Math.abs(draft.units);
      const resp = await client.createMarketOrder({
        pair,
        units: signedUnits,
        stopLoss: draft.stopLoss,
        takeProfit: draft.takeProfit,
      });

      const fill = resp.orderFillTransaction || resp.orderCreateTransaction;
      const tradeId = fill?.tradeOpened?.tradeID
        || resp.orderFillTransaction?.tradeOpened?.tradeID;
      const fillPrice = Number(fill?.price || draft.entry);

      const trade = enrichTradeSizing({
        ...draft,
        entry: round(fillPrice, 5),
        oandaTradeId: tradeId ? String(tradeId) : null,
        oandaOrderId: fill?.id ? String(fill.id) : null,
        broker: 'oanda',
      }, cfg);

      openByPair.set(pair, trade);
      return trade;
    },

    onTick() {
      return null;
    },

    async syncFromBroker() {
      if (!client.configured || !openByPair.size) return [];

      const remote = await client.getOpenTrades();
      const remoteIds = new Set(remote.map((t) => String(t.id)));
      const closedTrades = [];

      for (const [pair, local] of [...openByPair.entries()]) {
        const id = local.oandaTradeId;
        if (id && remoteIds.has(String(id))) continue;

        let exitReason = 'manual';
        let exitPrice = local.lastMark ?? local.entry;
        try {
          const txs = await client.getTransactions(30);
          const closeTx = txs.find((tx) => {
            if (String(tx.tradeID || '') !== String(id || '')) return false;
            const r = String(tx.reason || '').toLowerCase();
            return r.includes('stop_loss') || r.includes('take_profit') || r.includes('market_order');
          });
          if (closeTx) {
            exitPrice = Number(closeTx.price || exitPrice);
            const r = String(closeTx.reason || '').toLowerCase();
            if (r.includes('stop_loss')) exitReason = 'stop';
            else if (r.includes('take_profit')) exitReason = 'take_profit';
          }
        } catch (_) { /* use defaults */ }

        const pnl = tradePnlUsd(local, exitPrice, cfg.simCommissionUsd ?? 0);
        const trade = {
          ...local,
          exit: round(exitPrice, 5),
          exitReason,
          closedAt: Date.now(),
          pips: pnl.pips,
          grossPnlUsd: pnl.grossUsd,
          commissionUsd: cfg.simCommissionUsd ?? 0,
          pnlUsd: pnl.pnlUsd,
        };
        closed.push(trade);
        closedTrades.push(trade);
        openByPair.delete(pair);
      }

      return closedTrades;
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

    async hydrateFromBroker() {
      if (!client.configured) return 0;
      const remote = await client.getOpenTrades();
      let n = 0;
      for (const rt of remote) {
        const mapped = client.mapOpenTrade(rt);
        if (openByPair.has(mapped.pair) || openByPair.size >= maxOpen) continue;
        openByPair.set(mapped.pair, enrichTradeSizing({ ...mapped, broker: 'oanda' }, cfg));
        n += 1;
      }
      return n;
    },
  };
}

module.exports = { createOandaPaperExecutor };
