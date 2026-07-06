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

  const nextJournalOpen = next.journal?.openCount;
  const prevTrades = prev.openTrades?.length ?? 0;
  const nextTrades = next.openTrades?.length ?? 0;
  const nextLive = next.openPositionsLive?.length ?? 0;

  // Journal embedded in worker state is authoritative for open/closed
  if (next.journal?.openTrades != null && nextJournalOpen != null) {
    out.openTrades = nextJournalOpen > 0
      ? next.journal.openTrades.map(mapJournalEntry)
      : [];
    out.openTrade = out.openTrades[0] ?? null;

    const liveByPair = new Map((next.openPositionsLive || prev.openPositionsLive || []).map((l) => [l.pair, l]));
    out.openPositionsLive = out.openTrades.length
      ? buildLiveFromJournal(out.openTrades, liveByPair)
      : [];
    out.openPositionLive = out.openPositionsLive[0] ?? null;
  } else if (nextTrades === 0 && prevTrades > 0) {
    // Incomplete write — keep previous until journal arrives
    out.openTrades = prev.openTrades;
    out.openTrade = prev.openTrades[0] ?? null;
    out.openPositionsLive = prev.openPositionsLive ?? [];
    out.openPositionLive = prev.openPositionsLive?.[0] ?? null;
  } else {
    out.openTrades = next.openTrades ?? [];
    out.openTrade = next.openTrades?.[0] ?? null;
    out.openPositionsLive = next.openPositionsLive ?? [];
    out.openPositionLive = next.openPositionsLive?.[0] ?? null;
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

function enrichWithJournal(state, journalSummary) {
  if (!state || !journalSummary) return state;
  const out = { ...state };
  const openTrades = (journalSummary.openTrades || []).map(mapJournalEntry);

  out.openTrades = openTrades;
  out.openTrade = openTrades[0] ?? null;

  const liveByPair = new Map((state.openPositionsLive || []).map((l) => [l.pair, l]));
  out.openPositionsLive = buildLiveFromJournal(openTrades, liveByPair);
  out.openPositionLive = out.openPositionsLive[0] ?? null;
  out.journal = { ...(state.journal || {}), ...journalSummary };

  return out;
}

module.exports = { mergePreferRich, enrichWithJournal, mapJournalEntry, buildLiveFromJournal };
