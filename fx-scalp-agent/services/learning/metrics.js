function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round(n * 100) / 100;
}

function computeMetrics(trades) {
  if (!trades.length) {
    return {
      count: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnlUsd: 0,
      avgWinUsd: 0,
      avgLossUsd: 0,
      profitFactor: 0,
      expectancyUsd: 0,
      avgPipsWin: 0,
      avgPipsLoss: 0,
      maxConsecutiveLosses: 0,
      byScore: {},
      byExitReason: {},
    };
  }

  const wins = trades.filter((t) => (t.pnlUsd ?? 0) > 0);
  const losses = trades.filter((t) => (t.pnlUsd ?? 0) <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
  const totalPnl = trades.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);

  let maxStreak = 0;
  let streak = 0;
  for (const t of trades) {
    if ((t.pnlUsd ?? 0) <= 0) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  const byScore = {};
  for (const t of trades) {
    const bucket = t.score >= 80 ? '80+' : t.score >= 72 ? '72-79' : '<72';
    if (!byScore[bucket]) byScore[bucket] = { count: 0, pnl: 0, wins: 0 };
    byScore[bucket].count += 1;
    byScore[bucket].pnl += t.pnlUsd ?? 0;
    if ((t.pnlUsd ?? 0) > 0) byScore[bucket].wins += 1;
  }

  const byExitReason = {};
  for (const t of trades) {
    const r = t.exitReason || 'unknown';
    if (!byExitReason[r]) byExitReason[r] = { count: 0, pnl: 0 };
    byExitReason[r].count += 1;
    byExitReason[r].pnl += t.pnlUsd ?? 0;
  }

  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round((wins.length / trades.length) * 100, 1),
    totalPnlUsd: round(totalPnl),
    avgWinUsd: wins.length ? round(grossWin / wins.length) : 0,
    avgLossUsd: losses.length ? round(grossLoss / losses.length) : 0,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : grossWin > 0 ? 99 : 0,
    expectancyUsd: round(totalPnl / trades.length),
    avgPipsWin: wins.length ? round(wins.reduce((s, t) => s + (t.pips || 0), 0) / wins.length, 1) : 0,
    avgPipsLoss: losses.length ? round(losses.reduce((s, t) => s + (t.pips || 0), 0) / losses.length, 1) : 0,
    maxConsecutiveLosses: maxStreak,
    byScore,
    byExitReason,
  };
}

module.exports = { computeMetrics };
