const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../state');
const { normPair } = require('../../utils');
const { rankCharliePairs, realizedRangePips } = require('./pairRank');
const { readCharlieSetups, setupsPath } = require('./setupJournal');
const { getClosedTrades, getOpenEntries } = require('../../journal');

/**
 * Dynamic focus pool: hunt active movers + signal heat, with currency diversity.
 */

function focusStatePath() {
  return path.join(DATA_DIR, 'charlie_focus.json');
}

function loadFocusState() {
  try {
    return JSON.parse(fs.readFileSync(focusStatePath(), 'utf8'));
  } catch (_) {
    return { pairs: [], updatedAt: null, demoted: [] };
  }
}

function saveFocusState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(focusStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

/** Recent journal activity score per pair (setups + trades) = signal heat prior. */
function journalActivityScores(cfg = {}) {
  const lookbackMs = cfg.charlieActivityLookbackMs ?? 6 * 3600000;
  const cutoff = Date.now() - lookbackMs;
  const scores = new Map();

  function bump(pair, w) {
    const p = normPair(pair);
    if (!p) return;
    scores.set(p, (scores.get(p) || 0) + w);
  }

  for (const s of readCharlieSetups(400)) {
    const ts = Date.parse(s.ts || 0);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    bump(s.pair, s.action === 'BUY' || s.action === 'SELL' ? 5 : s.action === 'WATCH' ? 2 : 0.5);
  }

  for (const t of getClosedTrades(80)) {
    const ts = Number(t.closedAt || t.openedAt || 0);
    if (ts < cutoff) continue;
    bump(t.pair, 4);
  }
  for (const t of getOpenEntries()) {
    bump(t.pair, 8);
  }

  return scores;
}

function pairCurrencies(pair) {
  const p = normPair(pair);
  return [p.slice(0, 3), p.slice(3)];
}

/**
 * Pick top focus with max-per-currency cap (anti AUD/JPY cluster).
 */
function pickDiverseFocus(ranked, maxFocus, maxPerCcy = 2) {
  const picked = [];
  const ccyCount = new Map();

  function canTake(pair) {
    const [base, quote] = pairCurrencies(pair);
    // Hard cap on base (stops AUDUSD+AUDJPY+AUDCAD); softer on quote (USD is common)
    if ((ccyCount.get(base) || 0) >= maxPerCcy) return false;
    if ((ccyCount.get(quote) || 0) >= maxPerCcy + 1) return false;
    return true;
  }

  function take(r) {
    picked.push(r);
    const [base, quote] = pairCurrencies(r.pair);
    ccyCount.set(base, (ccyCount.get(base) || 0) + 1);
    ccyCount.set(quote, (ccyCount.get(quote) || 0) + 1);
  }

  const alive = ranked.filter((r) => r.alive !== false);
  const quiet = ranked.filter((r) => r.alive === false);

  for (const r of alive) {
    if (picked.length >= maxFocus) break;
    if (canTake(r.pair)) take(r);
  }
  // Soft fill: still prefer diversity
  if (picked.length < maxFocus) {
    for (const r of alive) {
      if (picked.length >= maxFocus) break;
      if (picked.some((x) => x.pair === r.pair)) continue;
      if (canTake(r.pair)) take(r);
    }
  }
  // Last resort if currency cap blocked everything
  if (picked.length < maxFocus) {
    for (const r of [...alive, ...quiet]) {
      if (picked.length >= maxFocus) break;
      if (picked.some((x) => x.pair === r.pair)) continue;
      take(r);
    }
  }
  return picked;
}

/**
 * Build focus list for analysis panel + trading.
 * @returns {{ top: string[], ranked: object[], demoted: string[], promoted: string[], scanPool: string[] }}
 */
function buildActivePairPool(universe, snapshots, cfg = {}) {
  const maxFocus = cfg.charlieMaxPairs ?? 4;
  const maxUniverseScan = cfg.charlieScanPairs ?? Math.min(universe.length, 24);
  const stickiness = cfg.charlieFocusStickiness ?? 2;
  const maxPerCcy = cfg.charlieFocusMaxPerCurrency ?? 2;
  const marketW = Math.min(1, Math.max(0, cfg.charlieMarketSignalBlend ?? 0.4));
  const signalW = 1 - marketW;
  const activity = journalActivityScores(cfg);
  const prev = loadFocusState();

  const volRanked = rankCharliePairs(universe, snapshots, cfg);

  const enriched = volRanked.map((r) => {
    const snap = snapshots.get ? snapshots.get(r.pair) : snapshots[r.pair];
    const barsM5 = snap?.bars5m || snap?.barsM5 || [];
    const barsM1 = snap?.bars1m || snap?.barsM1 || [];
    const microM5 = realizedRangePips(barsM5, r.pair, 6) || 0;
    const microM1 = realizedRangePips(barsM1, r.pair, 12) || 0;
    const microHeat = Math.min(30, microM5 * 1.4 + microM1 * 0.8);

    const act = activity.get(r.pair) || 0;
    const signalHeat = Math.min(40, act * 4);

    // pairRank already embeds market+micro; blend in signal journal heat
    let score = (r.rankScore || 0) * marketW + signalHeat * (1 + signalW);
    score += Math.min(20, act * 2.5);
    if ((prev.pairs || []).includes(r.pair) && r.alive) score += stickiness;

    return {
      ...r,
      rankScore: Math.round(score),
      activity: act,
      microHeat: Math.round(microHeat * 10) / 10,
      signalHeat: Math.round(signalHeat * 10) / 10,
    };
  });

  enriched.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.rankScore - a.rankScore;
  });

  const scanPool = enriched.slice(0, maxUniverseScan);
  const focusRows = pickDiverseFocus(scanPool, maxFocus, maxPerCcy);
  const top = focusRows.map((r) => r.pair);

  const demoted = (prev.pairs || []).filter((p) => !top.includes(p));
  const promoted = top.filter((p) => !(prev.pairs || []).includes(p));

  saveFocusState({
    pairs: top,
    updatedAt: new Date().toISOString(),
    demoted,
    promoted,
    ranked: enriched.slice(0, 16).map((r) => ({
      pair: r.pair,
      rankScore: r.rankScore,
      atrPips: r.atrPips,
      rangePips: r.rangePips,
      alive: r.alive,
      activity: r.activity,
      microHeat: r.microHeat,
      signalHeat: r.signalHeat,
    })),
  });

  return {
    top,
    ranked: enriched,
    demoted,
    promoted,
    scanPool: scanPool.map((r) => r.pair),
  };
}

/**
 * If setups jsonl overflows — drop inactive / SKIP noise first; keep focus + entries.
 */
function pruneSetupJournalIfNeeded(cfg = {}) {
  const maxLines = cfg.charlieSetupsMaxLines ?? 2000;
  const p = setupsPath();
  try {
    if (!fs.existsSync(p)) return { pruned: false };
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.trim().split(/\n/).filter(Boolean);
    if (lines.length <= maxLines) return { pruned: false, lines: lines.length };

    const focus = new Set((loadFocusState().pairs || []).map(normPair));
    const scored = lines.map((line, idx) => {
      let score = idx;
      try {
        const o = JSON.parse(line);
        const pair = normPair(o.pair);
        if (focus.has(pair)) score += 1e9;
        if (o.action === 'BUY' || o.action === 'SELL') score += 5e8;
        else if (o.action === 'WATCH') score += 1e8;
      } catch (_) { /* keep raw */ }
      return { line, score, idx };
    });
    scored.sort((a, b) => b.score - a.score);
    const kept = scored
      .slice(0, maxLines)
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.line);
    fs.writeFileSync(p, `${kept.join('\n')}\n`);
    return { pruned: true, removed: lines.length - kept.length, lines: kept.length };
  } catch (e) {
    return { pruned: false, error: e.message };
  }
}

function inactivePairsFromFocus(cfg = {}) {
  const state = loadFocusState();
  const activity = journalActivityScores(cfg);
  return (state.ranked || [])
    .filter((r) => !r.alive || (activity.get(r.pair) || 0) === 0)
    .map((r) => r.pair);
}

module.exports = {
  buildActivePairPool,
  pruneSetupJournalIfNeeded,
  inactivePairsFromFocus,
  loadFocusState,
  journalActivityScores,
  pickDiverseFocus,
};
