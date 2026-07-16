const { normPair, round } = require('../utils');
const { enrichTradeSizing, tradePnlUsd } = require('./pricing');
const { buildTradeFromAnalysis } = require('./sim');
const { CapitalClient } = require('./capitalClient');

/** Don't mark closed until Capital has time to list a fresh position. */
const SYNC_GRACE_MS = 5000;

/**
 * Convert our base-currency `units` into a Capital.com position `size`.
 * Capital FX markets express size in "contracts"; contract size (units per 1
 * size) comes from the market's instrument.lotSize. Clamp to min/step.
 */
function computeCapitalSize(units, marketDetails, cfg) {
  const rules = marketDetails?.dealingRules || {};
  const contractSize = Number(marketDetails?.instrument?.lotSize)
    || cfg.capitalContractSize
    || 100000;
  const min = Number(rules.minDealSize?.value)
    || cfg.capitalMinSize
    || 0.001;
  const step = Number(rules.minStepDistance?.value) || 0;

  let size = units / contractSize;
  if (size < min) size = min;
  if (step > 0) size = Math.round(size / step) * step;
  return round(size, 3);
}

function inferExitReason(trade, exitPrice) {
  if (trade.stopLoss != null && trade.takeProfit != null && exitPrice != null) {
    const dSl = Math.abs(exitPrice - trade.stopLoss);
    const dTp = Math.abs(exitPrice - trade.takeProfit);
    return dSl <= dTp ? 'stop' : 'take_profit';
  }
  return 'manual';
}

function createCapitalPaperExecutor(options = {}) {
  const config = require('../../config');
  const cfg = { ...config, ...options };
  const maxOpen = cfg.maxOpenPositions ?? 5;
  const client = new CapitalClient(cfg);
  /** @type {Map<string, object>} */
  const openByPair = new Map();
  const closed = [];
  const marketCache = new Map();

  async function marketFor(epic) {
    if (marketCache.has(epic)) return marketCache.get(epic);
    const details = await client.getMarketDetails(epic);
    marketCache.set(epic, details);
    return details;
  }

  return {
    mode: 'capital',
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
        throw new Error('Capital paper: FX_CAPITAL_API_KEY/IDENTIFIER/PASSWORD required');
      }

      const draft = buildTradeFromAnalysis(analysis, cfg);
      if (!draft.units) return null;

      const epic = await client.resolveEpic(pair);
      if (!epic) throw new Error(`Capital: epic not found for ${pair}`);

      const details = await marketFor(epic);
      const size = computeCapitalSize(draft.units, details, cfg);

      const { dealReference } = await client.createPosition({
        epic,
        direction: draft.side === 'short' ? 'SELL' : 'BUY',
        size,
        stopLevel: draft.stopLoss,
        profitLevel: draft.takeProfit,
      });

      let dealId = null;
      let fillPrice = draft.entry;
      try {
        const confirm = await client.getDealConfirmation(dealReference);
        if (String(confirm.dealStatus || '').toUpperCase() === 'REJECTED') {
          throw new Error(`Capital order rejected: ${confirm.reason || 'unknown'}`);
        }
        dealId = CapitalClient.parsePositionDealId(confirm);
        if (confirm.level != null) fillPrice = Number(confirm.level);
      } catch (e) {
        if (String(e.message || '').includes('rejected')) throw e;
        // confirmation fetch failed — resolve dealId from open positions on next sync
      }

      if (!dealId) {
        try {
          const remote = await client.findOpenPositionByPair(pair);
          if (remote?.capitalDealId) {
            dealId = remote.capitalDealId;
            if (remote.entry != null) fillPrice = remote.entry;
          }
        } catch (e) {
          console.warn(`[capital-entry] ${pair} dealId lookup`, e.message);
        }
      }

      const trade = enrichTradeSizing({
        ...draft,
        entry: round(fillPrice, 5),
        entryConviction: analysis.smart?.conviction ?? analysis.score ?? 0,
        capitalDealId: dealId,
        capitalEpic: epic,
        capitalSize: size,
        broker: 'capital',
      }, cfg);

      openByPair.set(pair, trade);
      return trade;
    },

    onTick(pairInput, quote) {
      const pair = normPair(pairInput);
      const t = openByPair.get(pair);
      if (!t || !quote) return null;
      const bid = quote.bid ?? quote.mid;
      const ask = quote.ask ?? quote.mid;
      t.lastMark = t.side === 'short' ? (ask ?? bid) : (bid ?? ask);
      t.lastMarkAt = Date.now();
      return null;
    },

    async syncFromBroker() {
      if (!client.configured || !openByPair.size) return [];

      let remote;
      try {
        remote = await client.getOpenPositions();
      } catch (e) {
        console.warn('[capital-sync] getOpenPositions failed:', e.message);
        return [];
      }

      const remoteMapped = remote.map((rp) => client.mapOpenPosition(rp));
      const remoteByDealId = new Map();
      const remoteByPair = new Map();
      for (const m of remoteMapped) {
        if (m.capitalDealId) remoteByDealId.set(String(m.capitalDealId), m);
        if (m.pair) remoteByPair.set(m.pair, m);
      }

      const closedTrades = [];

      for (const [pair, local] of [...openByPair.entries()]) {
        const id = local.capitalDealId ? String(local.capitalDealId) : null;

        if (id && remoteByDealId.has(id)) continue;

        const onBroker = remoteByPair.get(pair);
        if (onBroker) {
          if (!local.capitalDealId && onBroker.capitalDealId) {
            local.capitalDealId = onBroker.capitalDealId;
            console.log(`[capital-sync] ${pair} repaired dealId=${onBroker.capitalDealId}`);
          } else if (id && onBroker.capitalDealId && id !== onBroker.capitalDealId) {
            console.log(`[capital-sync] ${pair} dealId ${id} → ${onBroker.capitalDealId}`);
            local.capitalDealId = onBroker.capitalDealId;
          }
          if (onBroker.stopLoss != null) local.stopLoss = onBroker.stopLoss;
          if (onBroker.takeProfit != null) local.takeProfit = onBroker.takeProfit;
          continue;
        }

        const ageMs = Date.now() - (local.openedAt || 0);
        if (ageMs < SYNC_GRACE_MS) {
          console.log(`[capital-sync] ${pair} skip close check (${Math.round(ageMs / 1000)}s < grace)`);
          continue;
        }

        const exitPrice = local.lastMark ?? local.entry;
        const exitReason = 'broker_sync';
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
        console.log(`[capital-sync] ${pair} closed on broker (${exitReason}) pnl=$${trade.pnlUsd}`);
      }

      return closedTrades;
    },

    async updateBrokerLevels(trade, { stopLoss, takeProfit } = {}) {
      if (!client.configured || !trade?.capitalDealId) return false;
      const levels = {};
      if (stopLoss != null) levels.stopLevel = stopLoss;
      if (takeProfit != null) levels.profitLevel = takeProfit;
      if (!Object.keys(levels).length) return false;
      try {
        await client.updatePosition(trade.capitalDealId, levels);
        if (stopLoss != null) trade.stopLoss = stopLoss;
        if (takeProfit != null) trade.takeProfit = takeProfit;
        return true;
      } catch (e) {
        console.warn(`[capital-mgmt] ${trade.pair} update levels`, e.message);
        return false;
      }
    },

    async closeMarket(trade, exitReason = 'manual') {
      if (!trade?.pair) return null;
      const pair = normPair(trade.pair);
      const local = openByPair.get(pair);
      if (!local) return null;

      if (client.configured && local.capitalDealId) {
        try {
          await client.closePosition(local.capitalDealId);
        } catch (e) {
          console.warn(`[capital-mgmt] ${pair} close`, e.message);
          return null;
        }
      }

      const exitPrice = local.lastMark ?? local.entry;
      const pnl = tradePnlUsd(local, exitPrice, cfg.simCommissionUsd ?? 0);
      const closedTrade = {
        ...local,
        exit: round(exitPrice, 5),
        exitReason,
        closedAt: Date.now(),
        pips: pnl.pips,
        grossPnlUsd: pnl.grossUsd,
        commissionUsd: cfg.simCommissionUsd ?? 0,
        pnlUsd: pnl.pnlUsd,
      };
      closed.push(closedTrade);
      openByPair.delete(pair);
      console.log(`[capital-mgmt] ${pair} closed (${exitReason}) pnl=$${closedTrade.pnlUsd}`);
      return closedTrade;
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
      const remote = await client.getOpenPositions();
      let n = 0;
      for (const rp of remote) {
        const mapped = client.mapOpenPosition(rp);
        if (!mapped.pair || mapped.pair.length !== 6) continue;
        const existing = openByPair.get(mapped.pair);
        if (existing) {
          if (!existing.capitalDealId && mapped.capitalDealId) {
            existing.capitalDealId = mapped.capitalDealId;
            console.log(`[capital-hydrate] ${mapped.pair} dealId=${mapped.capitalDealId}`);
          }
          continue;
        }
        if (openByPair.size >= maxOpen) continue;
        openByPair.set(mapped.pair, enrichTradeSizing({ ...mapped, broker: 'capital' }, cfg));
        n += 1;
      }
      return n;
    },
  };
}

module.exports = { createCapitalPaperExecutor, computeCapitalSize };
