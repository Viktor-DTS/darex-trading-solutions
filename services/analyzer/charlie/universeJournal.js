const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../state');
const { normPair } = require('../../utils');
const { getOpenEntries } = require('../../journal');

const G10 = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD']);

function isG10Pair(pair) {
  const p = normPair(pair);
  return p.length === 6 && G10.has(p.slice(0, 3)) && G10.has(p.slice(3));
}

function isConventionalFx(pair) {
  const p = normPair(pair);
  if (!isG10Pair(p)) return false;
  const base = p.slice(0, 3);
  const quote = p.slice(3);
  if (quote === 'USD') return ['EUR', 'GBP', 'AUD', 'NZD'].includes(base);
  if (base === 'USD') return ['JPY', 'CAD', 'CHF'].includes(quote);
  const pri = { EUR: 6, GBP: 5, AUD: 4, NZD: 3, CAD: 2, CHF: 2, JPY: 1 };
  return (pri[base] || 0) >= (pri[quote] || 0);
}

function universePath() {
  return path.join(DATA_DIR, 'charlie_universe.json');
}

function loadUniverseJournal() {
  try {
    const raw = JSON.parse(fs.readFileSync(universePath(), 'utf8'));
    const pairs = (raw.pairs || []).map(normPair).filter((p) => p.length === 6);
    return {
      pairs,
      core: (raw.core || pairs).map(normPair).filter((p) => p.length === 6),
      rotating: (raw.rotating || []).map(normPair).filter((p) => p.length === 6),
      updatedAt: raw.updatedAt || null,
      replaced: raw.replaced || [],
      ranked: raw.ranked || [],
    };
  } catch (_) {
    return { pairs: [], core: [], rotating: [], updatedAt: null, replaced: [], ranked: [] };
  }
}

function saveUniverseJournal(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(universePath(), JSON.stringify(state, null, 2) + '\n');
}

function uniquePairs(list) {
  const seen = new Set();
  const out = [];
  for (const x of list || []) {
    const p = normPair(x);
    if (p.length !== 6 || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function reconcileUniverseJournal(seedPairs, marketRanked, cfg = {}) {
  const max = cfg.charlieUniverseMax ?? 24;
  const rotateN = Math.min(cfg.charlieUniverseRotate ?? 16, max);
  const coreN = Math.max(0, max - rotateN);
  const seedCoreMax = Math.min(
    cfg.charlieUniverseCoreSeedMax ?? Math.min(4, coreN),
    coreN,
  );
  const prev = loadUniverseJournal();
  const open = new Set(getOpenEntries().map((t) => normPair(t.pair)).filter(Boolean));
  const allowExotic = cfg.charlieHuntAllowExotic === true;
  const okPair = (p) => {
    const n = normPair(p);
    if (n.length !== 6) return false;
    if (open.has(n)) return true;
    return allowExotic ? true : isConventionalFx(n);
  };
  const scoreMap = new Map(
    (marketRanked || [])
      .filter((r) => okPair(r.pair))
      .map((r) => [normPair(r.pair), Number(r.activityScore) || 0]),
  );

  // Sticky core: open positions first, then previous core, then limited seed majors
  const seedForCore = uniquePairs(seedPairs || []).filter(okPair).slice(0, seedCoreMax);
  let core = uniquePairs([
    ...[...open],
    ...(prev.core || []).filter(okPair),
    ...seedForCore,
  ]).slice(0, coreN);

  for (const p of open) {
    if (!core.includes(p) && core.length < coreN) core.push(p);
  }
  core = uniquePairs(core).slice(0, coreN);
  const coreSet = new Set(core);

  let rotating = uniquePairs(
    (prev.rotating && prev.rotating.length ? prev.rotating : (prev.pairs || []).slice(coreN))
      .filter((p) => okPair(p) && !coreSet.has(p)),
  );

  // Leftover seeds compete in rotating pool (not locked into core)
  for (const p of uniquePairs(seedPairs || []).filter(okPair)) {
    if (!coreSet.has(p) && !rotating.includes(p)) rotating.push(p);
  }

  for (const p of open) {
    if (!coreSet.has(p) && !rotating.includes(p)) rotating.unshift(p);
  }

  const candidates = (marketRanked || [])
    .map((r) => ({ pair: normPair(r.pair), score: Number(r.activityScore) || 0 }))
    .filter((r) => okPair(r.pair) && !coreSet.has(r.pair));

  const poolMap = new Map();
  for (const p of rotating) {
    if (!okPair(p)) continue;
    poolMap.set(p, { pair: p, score: scoreMap.get(p) || 0, protected: open.has(p) });
  }
  for (const c of candidates) {
    const prevSlot = poolMap.get(c.pair);
    if (prevSlot) prevSlot.score = Math.max(prevSlot.score, c.score);
    else poolMap.set(c.pair, { pair: c.pair, score: c.score, protected: open.has(c.pair) });
  }

  const rankedPool = [...poolMap.values()].sort((a, b) => {
    if (a.protected !== b.protected) return a.protected ? -1 : 1;
    return b.score - a.score;
  });

  let nextRotating = rankedPool.slice(0, rotateN).map((x) => x.pair);
  const prevRotSet = new Set(rotating);
  const replaced = nextRotating
    .filter((p) => !prevRotSet.has(p))
    .map((p) => ({ in: p, score: scoreMap.get(p) || 0 }));
  let demoted = rotating.filter((p) => !nextRotating.includes(p) && !open.has(p));

  let pairs = uniquePairs([...core, ...nextRotating]);
  for (const p of seedPairs || []) {
    if (pairs.length >= max) break;
    const n = normPair(p);
    if (okPair(n) && !pairs.includes(n)) pairs.push(n);
  }
  for (const r of marketRanked || []) {
    if (pairs.length >= max) break;
    const p = normPair(r.pair);
    if (okPair(p) && !pairs.includes(p)) pairs.push(p);
  }
  pairs = pairs.slice(0, max);

  if (nextRotating.length < rotateN) {
    const extra = pairs.filter((p) => okPair(p) && !coreSet.has(p) && !nextRotating.includes(p));
    nextRotating = [...nextRotating, ...extra.slice(0, rotateN - nextRotating.length)];
    pairs = uniquePairs([...core, ...nextRotating, ...pairs.filter(okPair)]).slice(0, max);
    demoted = rotating.filter((p) => !nextRotating.includes(p) && !open.has(p));
  }

  const state = {
    pairs: pairs.filter(okPair),
    core,
    rotating: nextRotating,
    updatedAt: new Date().toISOString(),
    replaced,
    demoted,
    ranked: (marketRanked || []).slice(0, 30).map((r) => ({
      pair: r.pair,
      activityScore: r.activityScore,
      pct: r.pct,
      rangePct: r.rangePct,
      status: r.status,
    })),
  };
  saveUniverseJournal(state);
  return state;
}

module.exports = {
  loadUniverseJournal,
  saveUniverseJournal,
  reconcileUniverseJournal,
  universePath,
};
