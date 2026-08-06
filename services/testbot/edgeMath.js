/**
 * Edge math for Testbot — top-player principle:
 * E = p*W - (1-p)*L ; Kelly f* = p - (1-p)/b ; trade only if E>0 and f*>0.
 */

function round4(x) {
  return Math.round(Number(x) * 10000) / 10000;
}

function expectancy(p, avgWin, avgLossAbs) {
  const W = Number(avgWin) || 0;
  const L = Math.abs(Number(avgLossAbs) || 0);
  const pp = Number(p) || 0;
  return round4(pp * W - (1 - pp) * L);
}

/** Binary Kelly fraction of bank. b = W/L. */
function kellyFraction(p, avgWin, avgLossAbs) {
  const W = Number(avgWin) || 0;
  const L = Math.abs(Number(avgLossAbs) || 0);
  const pp = Number(p) || 0;
  if (W <= 0 || L <= 0) return 0;
  const b = W / L;
  if (b <= 0) return 0;
  return round4(pp - (1 - pp) / b);
}

function breakEvenWinRate(avgWin, avgLossAbs) {
  const W = Number(avgWin) || 0;
  const L = Math.abs(Number(avgLossAbs) || 0);
  if (W + L <= 0) return 1;
  return round4(L / (W + L));
}

/**
 * @param {Array<{pnlUsd?: number}>} closedTrades
 */
function computeEdgeStats(closedTrades, opts = {}) {
  const window = Math.max(5, Number(opts.window) || 80);
  const list = (closedTrades || [])
    .filter((t) => t && Number.isFinite(Number(t.pnlUsd)))
    .slice(-window);

  const n = list.length;
  if (n === 0) {
    return {
      n: 0,
      wins: 0,
      losses: 0,
      p: 0,
      avgWin: 0,
      avgLoss: 0,
      E: 0,
      kelly: 0,
      beWr: 1,
      totalPnl: 0,
      ok: false,
      reason: 'no closed trades',
    };
  }

  const wins = list.filter((t) => Number(t.pnlUsd) > 0);
  const losses = list.filter((t) => Number(t.pnlUsd) < 0);
  const flats = list.filter((t) => Number(t.pnlUsd) === 0);
  const p = wins.length / n;
  const avgWin = wins.length
    ? wins.reduce((s, t) => s + Number(t.pnlUsd), 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((s, t) => s + Number(t.pnlUsd), 0) / losses.length)
    : 0;
  const totalPnl = round4(list.reduce((s, t) => s + Number(t.pnlUsd), 0));
  const E = expectancy(p, avgWin, avgLoss);
  const kelly = kellyFraction(p, avgWin, avgLoss);
  const beWr = breakEvenWinRate(avgWin, avgLoss);

  return {
    n,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    p: round4(p),
    avgWin: round4(avgWin),
    avgLoss: round4(avgLoss),
    E,
    kelly,
    beWr,
    totalPnl,
    ok: true,
    reason: 'ok',
  };
}

function computePairEdgeStats(closedTrades, pair, opts = {}) {
  const p = String(pair || '').toUpperCase();
  const filtered = (closedTrades || []).filter((t) => String(t.pair || '').toUpperCase() === p);
  return computeEdgeStats(filtered, opts);
}

module.exports = {
  expectancy,
  kellyFraction,
  breakEvenWinRate,
  computeEdgeStats,
  computePairEdgeStats,
};
