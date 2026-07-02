function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function tradeStatusLabel(status) {
  const map = {
    open: 'Відкрита',
    closed: 'Закрита',
    pending_ibkr: 'Очікує IBKR',
    pending_sim: 'Очікує LMT',
    cancelled: 'Скасована',
  };
  return map[status] || status || '—';
}

/**
 * Обчислює суми покупки/продажу, комісію та P/L для відображення в журналі угод.
 */
function enrichTrade(trade) {
  const t = trade?.toObject ? trade.toObject() : { ...trade };
  const qty = Math.max(0, Number(t.quantity) || 0);
  const entry = Number(t.entryPrice) || 0;
  const exit = Number(t.exitPrice) || 0;
  const commission = round2((Number(t.commissionUsd) || 0) + (Number(t.feesUsd) || 0)) || 0;

  const buyTotalUsd = qty > 0 && entry > 0 ? round2(entry * qty) : null;
  const sellTotalUsd =
    t.status === 'closed' && qty > 0 && exit > 0 ? round2(exit * qty) : null;

  let pnlUsd = t.pnlUsd != null ? round2(t.pnlUsd) : null;
  if (pnlUsd == null && sellTotalUsd != null && buyTotalUsd != null) {
    pnlUsd = round2(sellTotalUsd - buyTotalUsd - commission);
  }

  let pnlPct = t.pnlPct != null ? round2(t.pnlPct) : null;
  if (pnlPct == null && pnlUsd != null && buyTotalUsd > 0) {
    pnlPct = round2((pnlUsd / buyTotalUsd) * 100);
  }

  const openedAt = t.openedAt || t.createdAt || null;
  const closedAt = t.closedAt || null;

  const markPrice = t.lastMarkPrice != null ? round2(t.lastMarkPrice) : null;
  let markVsEntryPct = null;
  if (['open', 'pending_sim', 'pending_ibkr'].includes(t.status) && entry > 0 && markPrice != null) {
    markVsEntryPct = round2(((markPrice - entry) / entry) * 100);
  }

  return {
    ...t,
    statusLabel: tradeStatusLabel(t.status),
    openedAt,
    closedAt,
    stopLoss: t.stopLoss != null ? round2(t.stopLoss) : null,
    takeProfit: t.takeProfit != null ? round2(t.takeProfit) : null,
    lastMarkPrice: markPrice,
    lastMarkPriceAt: t.lastMarkPriceAt || null,
    markVsEntryPct,
    buyTotalUsd,
    sellTotalUsd,
    totalFeesUsd: commission,
    pnlUsd,
    pnlPct,
  };
}

function summarizeTrades(enriched) {
  const closed = enriched.filter((t) => t.status === 'closed');
  const open = enriched.filter((t) => t.status === 'open');
  const pendingIbkr = enriched.filter((t) => t.status === 'pending_ibkr');
  const pendingSim = enriched.filter((t) => t.status === 'pending_sim');
  const simulation = enriched.filter((t) => t.source === 'simulation');

  const totalPnlUsd = round2(closed.reduce((s, t) => s + (t.pnlUsd || 0), 0));
  const totalFeesUsd = round2(enriched.reduce((s, t) => s + (t.totalFeesUsd || 0), 0));
  const winners = closed.filter((t) => (t.pnlUsd || 0) > 0).length;
  const losers = closed.filter((t) => (t.pnlUsd || 0) < 0).length;

  return {
    total: enriched.length,
    closed: closed.length,
    open: open.length,
    pending: pendingIbkr.length + pendingSim.length,
    pendingIbkr: pendingIbkr.length,
    pendingSim: pendingSim.length,
    simulation: simulation.length,
    totalPnlUsd,
    totalFeesUsd,
    winners,
    losers,
  };
}

module.exports = {
  enrichTrade,
  summarizeTrades,
  tradeStatusLabel,
};
