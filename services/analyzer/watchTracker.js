const { normPair } = require('../utils');

/** @type {Map<string, { count: number, direction: string, analysis: object }>} */
const watchState = new Map();

function trackWatchCycle(analysis, config) {
  if (config.watchAutoEntry === false) return;
  const pair = normPair(analysis.pair);
  const smart = analysis.smart;
  const threshold = smart?.threshold;
  const conv = smart?.conviction ?? analysis.score ?? 0;
  const drop = config.watchAutoEntryConvDrop ?? 1;
  const direction = analysis.direction || analysis.side;

  const nearWatch = analysis.action === 'WATCH'
    && threshold != null
    && conv >= threshold - drop
    && direction;

  if (nearWatch) {
    const prev = watchState.get(pair);
    const count = prev?.direction === direction ? (prev.count + 1) : 1;
    watchState.set(pair, { count, direction, analysis: { ...analysis } });
    return;
  }

  if (analysis.action !== 'BUY' && analysis.action !== 'SELL') {
    watchState.delete(pair);
  }
}

function getWatchPromotions(config) {
  if (config.watchAutoEntry === false) return [];
  const minCycles = config.watchAutoEntryCycles ?? 2;
  const out = [];

  for (const [, st] of watchState) {
    if (st.count < minCycles || !st.analysis) continue;
    const smart = st.analysis.smart;
    const threshold = smart?.threshold;
    const conv = smart?.conviction ?? st.analysis.score ?? 0;
    if (smart && threshold != null && conv < threshold) continue;
    const action = st.direction === 'short' ? 'SELL' : 'BUY';
    out.push({
      ...st.analysis,
      action,
      side: st.direction,
      promotedFromWatch: true,
      reason: `${st.analysis.reason || ''}; watch auto-entry (${st.count} cycles)`.trim(),
    });
  }

  return out.sort(
    (a, b) => (b.smart?.conviction ?? b.score ?? 0) - (a.smart?.conviction ?? a.score ?? 0),
  );
}

function clearWatch(pair) {
  watchState.delete(normPair(pair));
}

module.exports = {
  trackWatchCycle,
  getWatchPromotions,
  clearWatch,
};
