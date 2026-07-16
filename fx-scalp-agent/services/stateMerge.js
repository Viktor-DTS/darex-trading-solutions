function mapJournalEntry(e) {
  return {
    pair: e.pair,
    side: e.side || 'long',
    entry: e.entry,
    stopLoss: e.stopLoss,
    takeProfit: e.takeProfit,
    openedAt: e.openedAt,
    score: e.score,
    regime: e.regime,
  };
}

function buildLiveFromJournal(openTrades, liveByPair) {
  return openTrades.map((t) => {
    const live = liveByPair.get(t.pair);
    if (live) return live;
    return {
      pair: t.pair,
      side: t.side || 'long',
      entry: t.entry,
      mark: null,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      score: t.score,
    };
  });
}

function mergePreferRich(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const out = { ...next };

  const prevAnalyses = prev.lastAnalyses?.length || 0;
  const nextAnalyses = next.lastAnalyses?.length || 0;
  if (prevAnalyses > nextAnalyses) {
    out.lastAnalyses = prev.lastAnalyses;
    out.lastAnalysis = next.lastAnalysis || prev.lastAnalysis;
  }

  // Executor/worker is authoritative for live positions — never replace with journal
  if (next.openTrades != null || next.openPositionsLive != null) {
    out.openTrades = next.openTrades ?? [];
    out.openTrade = out.openTrades[0] ?? null;
    out.openPositionsLive = next.openPositionsLive ?? [];
    out.openPositionLive = out.openPositionsLive[0] ?? null;
  }

  if (next.journal || prev.journal) {
    out.journal = { ...(prev.journal || {}), ...(next.journal || {}) };
  }

  if (prev.risk && next.risk && prev.risk.dayKey === next.risk.dayKey) {
    out.risk = {
      ...next.risk,
      dailyPnlUsd: next.risk.dailyPnlUsd,
      tradesToday: Math.max(prev.risk.tradesToday ?? 0, next.risk.tradesToday ?? 0),
    };
  }

  return out;
}

/** Attach journal stats/history — does not overwrite executor open positions. */
function enrichWithJournal(state, journalSummary) {
  if (!state || !journalSummary) return state;
  return {
    ...state,
    journal: { ...(state.journal || {}), ...journalSummary },
  };
}

module.exports = { mergePreferRich, enrichWithJournal, mapJournalEntry, buildLiveFromJournal };
