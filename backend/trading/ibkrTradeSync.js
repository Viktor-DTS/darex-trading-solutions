const {
  getIbkrConfig,
  isIbkrFullyConfigured,
  selectIbkrAccount,
  fetchIbkrTrades,
  fetchIbkrPositions,
} = require('./ibkrApi');

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function normSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function isBuyFill(fill) {
  const side = String(fill?.side || '').toUpperCase();
  return side === 'B' || side === 'BUY' || side === 'BOT';
}

function isSellFill(fill) {
  const side = String(fill?.side || '').toUpperCase();
  return side === 'S' || side === 'SELL' || side === 'SLD';
}

function fillQty(fill) {
  return Math.abs(Number(fill?.size ?? fill?.position ?? 0)) || 0;
}

function fillPrice(fill) {
  const p = Number(fill?.price);
  return Number.isFinite(p) && p > 0 ? round2(p) : null;
}

function fillCommission(fill) {
  const c = fill?.comission ?? fill?.commission ?? 0;
  const n = Number(c);
  return Number.isFinite(n) ? round2(Math.abs(n)) : 0;
}

function fillTimeMs(fill) {
  if (fill?.trade_time_r) return Number(fill.trade_time_r) * 1000;
  if (fill?.trade_time) {
    const t = Date.parse(fill.trade_time);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function fillExecId(fill) {
  return String(fill?.execution_id || fill?.exec_id || '').trim();
}

function inferExitReason(trade, exitPrice) {
  if (exitPrice == null || trade.stopLoss == null || trade.takeProfit == null) return 'unknown';
  const distSl = Math.abs(exitPrice - trade.stopLoss);
  const distTp = Math.abs(exitPrice - trade.takeProfit);
  if (distTp <= distSl) return 'take_profit';
  if (distSl < distTp) return 'stop';
  return 'unknown';
}

function buildPositionMap(positions) {
  const map = new Map();
  for (const row of positions || []) {
    const sym = normSymbol(row?.ticker || row?.contractDesc?.split(' ')?.[0]);
    if (!sym) continue;
    map.set(sym, {
      quantity: Number(row?.position) || 0,
      avgPrice: round2(row?.avgPrice ?? row?.avgCost),
      mktPrice: round2(row?.mktPrice),
    });
  }
  return map;
}

function matchBuyFill(trade, buys, usedBuyIds) {
  const orderRef = String(trade.ibkrOrderId || '').trim();
  const qty = Number(trade.quantity) || 0;
  const createdMs = new Date(trade.createdAt || trade.openedAt || 0).getTime() - 3600000;

  const candidates = buys
    .filter((f) => {
      const id = fillExecId(f);
      if (id && usedBuyIds.has(id)) return false;
      if (normSymbol(f.symbol) !== normSymbol(trade.symbol)) return false;
      if (orderRef && f.order_ref && String(f.order_ref) === orderRef) return true;
      if (fillTimeMs(f) < createdMs) return false;
      if (qty > 0 && fillQty(f) > 0 && fillQty(f) !== qty) return false;
      return true;
    })
    .sort((a, b) => fillTimeMs(a) - fillTimeMs(b));

  if (orderRef) {
    const byRef = candidates.find((f) => f.order_ref && String(f.order_ref) === orderRef);
    if (byRef) return byRef;
  }

  return candidates[0] || null;
}

function matchSellFill(trade, sells, usedSellIds, openedMs) {
  const qty = Number(trade.quantity) || 0;

  const candidates = sells
    .filter((f) => {
      const id = fillExecId(f);
      if (id && usedSellIds.has(id)) return false;
      if (normSymbol(f.symbol) !== normSymbol(trade.symbol)) return false;
      if (fillTimeMs(f) <= openedMs) return false;
      if (qty > 0 && fillQty(f) > 0 && fillQty(f) !== qty) return false;
      return true;
    })
    .sort((a, b) => fillTimeMs(a) - fillTimeMs(b));

  return candidates[0] || null;
}

function calcClosedPnl(entryPrice, exitPrice, quantity, commissionUsd) {
  const qty = Number(quantity) || 0;
  const entry = Number(entryPrice) || 0;
  const exit = Number(exitPrice) || 0;
  if (qty <= 0 || entry <= 0 || exit <= 0) return { pnlUsd: null, pnlPct: null };

  const buyTotal = entry * qty;
  const sellTotal = exit * qty;
  const pnlUsd = round2(sellTotal - buyTotal - (commissionUsd || 0));
  const pnlPct = buyTotal > 0 ? round2((pnlUsd / buyTotal) * 100) : null;
  return { pnlUsd, pnlPct };
}

/**
 * Синхронізує open/pending угоди з IBKR fills та позиціями (7 днів trades API).
 */
async function syncTradesFromIbkr(models, options = {}) {
  if (!isIbkrFullyConfigured()) {
    return { ok: false, skipped: true, reason: 'IBKR OAuth not configured' };
  }

  const cfg = getIbkrConfig();
  const accountId = cfg.accountId;
  if (!accountId) {
    return { ok: false, skipped: true, reason: 'IBKR_ACCOUNT_ID not set' };
  }

  if (!models?.TradingTrade) {
    return { ok: false, skipped: true, reason: 'Trading models unavailable' };
  }

  const stats = { opened: 0, closed: 0, updated: 0, examined: 0 };

  try {
    await selectIbkrAccount(accountId);
    const [ibkrTrades, positions] = await Promise.all([
      fetchIbkrTrades(),
      fetchIbkrPositions(accountId),
    ]);

    const positionMap = buildPositionMap(positions);
    const buys = ibkrTrades.filter(isBuyFill);
    const sells = ibkrTrades.filter(isSellFill);

    const usedBuyIds = new Set(
      (await models.TradingTrade.distinct('ibkrBuyExecId')).filter(Boolean),
    );
    const usedSellIds = new Set(
      (await models.TradingTrade.distinct('ibkrSellExecId')).filter(Boolean),
    );

    const activeTrades = await models.TradingTrade.find({
      status: { $in: ['open', 'pending_ibkr'] },
    }).sort({ openedAt: 1, createdAt: 1 });

    for (const trade of activeTrades) {
      stats.examined += 1;
      const buyFill = matchBuyFill(trade, buys, usedBuyIds);
      const patch = { ibkrSyncedAt: new Date() };
      let openedMs = new Date(trade.openedAt || trade.createdAt || 0).getTime();

      if (trade.status === 'pending_ibkr' && buyFill) {
        const entryPrice = fillPrice(buyFill) ?? trade.entryPrice;
        const quantity = fillQty(buyFill) || trade.quantity;
        const buyExecId = fillExecId(buyFill);
        const openedAt = new Date(fillTimeMs(buyFill) || Date.now());

        patch.status = 'open';
        patch.entryPrice = entryPrice;
        patch.quantity = quantity;
        patch.openedAt = openedAt;
        patch.commissionUsd = fillCommission(buyFill);
        patch.ibkrBuyExecId = buyExecId || undefined;
        patch.notes = appendNote(
          trade.notes,
          `IBKR buy fill @ ${entryPrice} · exec ${buyExecId || '—'}`,
        );

        if (buyExecId) usedBuyIds.add(buyExecId);
        openedMs = openedAt.getTime();
        stats.opened += 1;
        stats.updated += 1;
      } else if (trade.status === 'open' && buyFill && !trade.ibkrBuyExecId) {
        const buyExecId = fillExecId(buyFill);
        patch.entryPrice = fillPrice(buyFill) ?? trade.entryPrice;
        patch.quantity = fillQty(buyFill) || trade.quantity;
        patch.commissionUsd = round2((trade.commissionUsd || 0) + fillCommission(buyFill));
        patch.ibkrBuyExecId = buyExecId || undefined;
        if (buyFill && fillTimeMs(buyFill)) patch.openedAt = new Date(fillTimeMs(buyFill));
        if (buyExecId) usedBuyIds.add(buyExecId);
        openedMs = new Date(patch.openedAt || trade.openedAt || trade.createdAt).getTime();
        stats.updated += 1;
      }

      const effectiveStatus = patch.status || trade.status;
      const effectiveQty = patch.quantity ?? trade.quantity;
      const effectiveEntry = patch.entryPrice ?? trade.entryPrice;
      const pos = positionMap.get(normSymbol(trade.symbol));
      const posQty = pos?.quantity ?? null;

      if (effectiveStatus === 'open') {
        if (pos?.avgPrice && !buyFill) {
          patch.entryPrice = pos.avgPrice;
        }

        const sellFill = matchSellFill(
          { ...trade.toObject(), quantity: effectiveQty, openedAt: patch.openedAt || trade.openedAt },
          sells,
          usedSellIds,
          openedMs,
        );

        if (sellFill) {
          const exitPrice = fillPrice(sellFill);
          const sellExecId = fillExecId(sellFill);
          const sellCommission = fillCommission(sellFill);
          const buyCommission = patch.commissionUsd ?? trade.commissionUsd ?? 0;
          const totalCommission = round2(Number(buyCommission) + sellCommission);
          const closedAt = new Date(fillTimeMs(sellFill) || Date.now());

          const { pnlUsd, pnlPct } = calcClosedPnl(
            effectiveEntry,
            exitPrice,
            effectiveQty,
            totalCommission,
          );

          patch.status = 'closed';
          patch.exitPrice = exitPrice;
          patch.closedAt = closedAt;
          patch.commissionUsd = totalCommission;
          patch.pnlUsd = pnlUsd;
          patch.pnlPct = pnlPct;
          patch.exitReason = inferExitReason(
            { stopLoss: trade.stopLoss, takeProfit: trade.takeProfit },
            exitPrice,
          );
          patch.ibkrSellExecId = sellExecId || undefined;
          patch.notes = appendNote(
            trade.notes,
            `IBKR close @ ${exitPrice ?? '—'} · P/L ${pnlUsd ?? '—'} · ${patch.exitReason}`,
          );

          if (sellExecId) usedSellIds.add(sellExecId);
          stats.closed += 1;
          stats.updated += 1;
        } else if (Object.keys(patch).length > 1) {
          stats.updated += 1;
        }
      }

      if (Object.keys(patch).length > 1) {
        await models.TradingTrade.updateOne({ _id: trade._id }, { $set: patch });
      }
    }

    const statusMsg = `sync ok · examined=${stats.examined} opened=${stats.opened} closed=${stats.closed}`;
    if (models.TradingRiskState) {
      await models.TradingRiskState.updateOne(
        { key: 'global' },
        { $set: { lastIbkrSyncAt: new Date(), lastIbkrSyncStatus: statusMsg } },
        { upsert: true },
      );
    }

    return {
      ok: true,
      accountId,
      ibkrTradeCount: ibkrTrades.length,
      positionCount: positions.length,
      ...stats,
      message: statusMsg,
    };
  } catch (err) {
    const statusMsg = `sync error: ${err.message || String(err)}`;
    if (models?.TradingRiskState) {
      await models.TradingRiskState.updateOne(
        { key: 'global' },
        { $set: { lastIbkrSyncAt: new Date(), lastIbkrSyncStatus: statusMsg } },
        { upsert: true },
      );
    }
    return {
      ok: false,
      error: err.message || String(err),
      ...stats,
    };
  }
}

function appendNote(existing, line) {
  const base = String(existing || '').trim();
  if (!base) return line;
  if (base.includes(line)) return base;
  return `${base} | ${line}`;
}

module.exports = { syncTradesFromIbkr };
