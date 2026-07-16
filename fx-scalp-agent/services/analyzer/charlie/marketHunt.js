const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../state');
const { normPair } = require('../../utils');
const { isCapitalRateLimited } = require('../../executor/capitalRateLimit');
const { reconcileUniverseJournal, loadUniverseJournal } = require('./universeJournal');

const G10 = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD']);

/** Full G10 cross matrix — Capital usually lists these as epic=pair. */
function g10Crosses() {
  const ccy = [...G10];
  const out = [];
  for (const a of ccy) {
    for (const b of ccy) {
      if (a === b) continue;
      const pair = `${a}${b}`;
      if (isConventionalFx(pair)) out.push(pair);
    }
  }
  return out;
}

/** Drop inverted garbage (USDEUR, JPYUSD) — keep Capital-style quoting. */
function isConventionalFx(pair) {
  const p = normPair(pair);
  if (p.length !== 6) return false;
  const base = p.slice(0, 3);
  const quote = p.slice(3);
  if (quote === 'USD') return ['EUR', 'GBP', 'AUD', 'NZD'].includes(base);
  if (base === 'USD') return ['JPY', 'CAD', 'CHF'].includes(quote);
  const pri = { EUR: 6, GBP: 5, AUD: 4, NZD: 3, CAD: 2, CHF: 2, JPY: 1 };
  return (pri[base] || 0) >= (pri[quote] || 0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function catalogPath() {
  return path.join(DATA_DIR, 'charlie_fx_catalog.json');
}

function isFxMarket(m) {
  const type = String(m.instrumentType || m.type || '').toUpperCase();
  return type === 'CURRENCIES' || type === 'FX' || type === 'CURRENCY' || type === '';
}

function marketToPair(m) {
  const epic = String(m.epic || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const sym = String(m.symbol || '').replace(/[\/\s]/g, '').toUpperCase();
  const name = String(m.instrumentName || m.name || '').replace(/[\/\s]/g, '').toUpperCase();
  for (const cand of [epic, sym, name]) {
    if (/^[A-Z]{6}$/.test(cand)) return cand;
  }
  return null;
}

function isG10Pair(pair) {
  const p = normPair(pair);
  return p.length === 6 && G10.has(p.slice(0, 3)) && G10.has(p.slice(3));
}

function activityFromMarket(m, pair) {
  const pct = Math.abs(Number(m.percentageChange) || 0);
  const bid = Number(m.bid);
  const offer = Number(m.offer);
  const high = Number(m.high);
  const low = Number(m.low);
  const mid = Number.isFinite(bid) && Number.isFinite(offer)
    ? (bid + offer) / 2
    : (Number.isFinite(high) && Number.isFinite(low) ? (high + low) / 2 : null);
  let rangePct = 0;
  if (Number.isFinite(high) && Number.isFinite(low) && mid > 0) {
    rangePct = ((high - low) / mid) * 100;
  }
  const spreadPenalty = (Number.isFinite(bid) && Number.isFinite(offer) && mid > 0)
    ? ((offer - bid) / mid) * 1000
    : 0;
  const score = Math.round((pct * 12 + rangePct * 40 - spreadPenalty * 5) * 10) / 10;
  return {
    pair,
    epic: m.epic || pair,
    activityScore: score,
    pct,
    rangePct: Math.round(rangePct * 1000) / 1000,
    status: m.marketStatus || null,
    bid: Number.isFinite(bid) ? bid : null,
    offer: Number.isFinite(offer) ? offer : null,
  };
}

function loadCatalogCache(maxAgeMs) {
  try {
    const raw = JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
    const age = Date.now() - Date.parse(raw.updatedAt || 0);
    if (!Number.isFinite(age) || age > maxAgeMs) return null;
    const pairs = Array.isArray(raw.pairs) ? raw.pairs : null;
    const snapshots = Array.isArray(raw.snapshots) ? raw.snapshots : [];
    return pairs?.length ? { pairs, snapshots } : null;
  } catch (_) {
    return null;
  }
}

function saveCatalogCache(pairs, snapshots = []) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(catalogPath(), `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    pairs,
    snapshots: snapshots.slice(0, 120),
  }, null, 2)}\n`);
}

function nodeLooksFx(name) {
  return /currenc|forex|fx|major|minor|cross|usd|eur|gbp|jpy|aud|cad|chf|nzd|volatil|riser|faller|most.?trad/i
    .test(String(name || ''));
}

/**
 * Discover FX epics via Capital market navigation + currency searches.
 * @returns {{ pairs: string[], snapshots: object[] }}
 */
async function discoverFxCatalog(client, cfg = {}) {
  const cacheMs = cfg.charlieCatalogCacheMs ?? 6 * 3600000;
  const cached = loadCatalogCache(cacheMs);
  if (cached?.pairs?.length) return cached;

  const allowExotic = cfg.charlieHuntAllowExotic === true;
  const found = new Map(); // pair → activity snapshot (may be partial)

  function accept(m) {
    if (!m) return;
    const type = String(m.instrumentType || '').toUpperCase();
    if (type === 'SHARES' || type === 'COMMODITIES' || type === 'CRYPTOCURRENCIES' || type === 'INDICES') return;
    if (!isFxMarket(m) && !/^[A-Z]{6}$/.test(String(m.epic || '').replace(/[^A-Za-z]/g, ''))) return;
    const pair = marketToPair(m);
    if (!pair) return;
    if (!allowExotic && !isG10Pair(pair)) return;
    const status = String(m.marketStatus || '').toUpperCase();
    if (status === 'CLOSED' || status === 'SUSPENDED') return;
    const snap = activityFromMarket(m, pair);
    const prev = found.get(pair);
    if (!prev || snap.activityScore >= prev.activityScore) found.set(pair, snap);
  }

  try {
    if (!isCapitalRateLimited()) {
      const root = await client.getMarketNavigation();
      const roots = root.nodes || [];
      for (const n of roots) {
        if (!nodeLooksFx(n.name) && !/hierarchy_v1\.commons\.(most_volatile|top_gainers|top_losers|most_traded)/i.test(n.id || '')) {
          continue;
        }
        await walkNav(client, n.id, 0, accept, cfg);
        if (found.size >= (cfg.charlieHuntCatalogMax ?? 80)) break;
        if (isCapitalRateLimited()) break;
      }
    }
  } catch (e) {
    console.warn('[fx-hunt] navigation', e.message);
  }

  const terms = cfg.charlieHuntSearchTerms || [
    'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'GBPAUD', 'EURCHF',
    'CADJPY', 'NZDJPY', 'AUDNZD', 'EURNZD',
  ];
  for (const term of terms) {
    if (isCapitalRateLimited()) break;
    try {
      const markets = await client.searchMarkets(term);
      for (const m of markets) accept(m);
      await sleep(cfg.capitalMinRequestMs || 700);
    } catch (e) {
      console.warn(`[fx-hunt] search ${term}`, e.message);
      break;
    }
  }

  // Always include full G10 matrix as hunt candidates (epic≈symbol on Capital)
  for (const p of g10Crosses()) {
    if (!found.has(p)) {
      found.set(p, {
        pair: p,
        epic: p,
        activityScore: 0,
        pct: 0,
        rangePct: 0,
        status: null,
      });
    }
  }

  const snapshots = [...found.values()];
  const pairs = snapshots.map((s) => s.pair).sort();
  if (pairs.length) saveCatalogCache(pairs, snapshots);
  return { pairs, snapshots };
}

async function walkNav(client, nodeId, depth, accept, cfg) {
  if (!nodeId || depth > 3 || isCapitalRateLimited()) return;
  try {
    const node = await client.getMarketNavigationNode(nodeId, cfg.charlieHuntNavLimit ?? 500);
    for (const m of node.markets || []) accept(m);
    for (const n of node.nodes || []) {
      if (depth >= 2 && !nodeLooksFx(n.name)) continue;
      await sleep(cfg.capitalMinRequestMs || 700);
      if (isCapitalRateLimited()) return;
      await walkNav(client, n.id, depth + 1, accept, cfg);
    }
  } catch (e) {
    console.warn(`[fx-hunt] nav ${nodeId}`, e.message);
  }
}

/**
 * Rank Capital FX movers by percentageChange / day range (batched epics API).
 * Merges with optional discover snapshots so hunt still works if epics call is thin.
 */
async function rankCapitalMovers(client, pairs, cfg = {}, seedSnapshots = []) {
  const allowExotic = cfg.charlieHuntAllowExotic === true;
  const filtered = (pairs || [])
    .map(normPair)
    .filter((p) => p.length === 6 && (allowExotic || isG10Pair(p)));

  const byPair = new Map();
  for (const s of seedSnapshots || []) {
    const p = normPair(s.pair);
    if (!p || (!allowExotic && !isG10Pair(p))) continue;
    byPair.set(p, s);
  }

  for (let i = 0; i < filtered.length; i += 50) {
    if (isCapitalRateLimited()) break;
    const chunk = filtered.slice(i, i + 50);
    try {
      const markets = await client.getMarketsByEpics(chunk);
      for (const m of markets) {
        const pair = marketToPair(m);
        if (!pair) continue;
        if (!allowExotic && !isG10Pair(pair)) continue;
        const status = String(m.marketStatus || '').toUpperCase();
        if (status === 'CLOSED' || status === 'SUSPENDED') continue;
        const snap = activityFromMarket(m, pair);
        const prev = byPair.get(pair);
        if (!prev || snap.activityScore >= prev.activityScore) byPair.set(pair, snap);
      }
    } catch (e) {
      console.warn('[fx-hunt] epics batch', e.message);
      break;
    }
    if (i + 50 < filtered.length) await sleep(cfg.capitalMinRequestMs || 700);
  }

  // Ensure every candidate pair exists (even score 0) so rotate slots can fill
  for (const p of filtered) {
    if (!byPair.has(p)) {
      byPair.set(p, {
        pair: p,
        epic: p,
        activityScore: 0,
        pct: 0,
        rangePct: 0,
        status: null,
      });
    }
  }

  const ranked = [...byPair.values()].sort((a, b) => b.activityScore - a.activityScore);
  return ranked;
}

/**
 * Full hunt cycle → update universe journal (max 24, rotate last 8).
 */
async function runCapitalMarketHunt(client, seedPairs, cfg = {}) {
  if (cfg.charlieMarketHunt === false) {
    return { skipped: true, universe: loadUniverseJournal() };
  }
  if (!client?.configured) {
    return { skipped: true, reason: 'no capital client', universe: loadUniverseJournal() };
  }
  if (isCapitalRateLimited()) {
    return { skipped: true, reason: 'rate_limit', universe: loadUniverseJournal() };
  }

  const discovered = await discoverFxCatalog(client, cfg);
  const catalog = discovered.pairs || [];
  const seed = (seedPairs || []).map(normPair);
  const union = [...new Set([...catalog, ...seed, ...g10Crosses()])];
  const ranked = await rankCapitalMovers(client, union, cfg, discovered.snapshots || []);
  const universe = reconcileUniverseJournal(seed, ranked, cfg);

  const seedSet = new Set(seed);
  const outside = ranked.filter((r) => !seedSet.has(r.pair)).slice(0, 8);

  return {
    skipped: false,
    catalogSize: catalog.length,
    ranked: ranked.slice(0, 12),
    outsideSeed: outside,
    universe,
  };
}

module.exports = {
  discoverFxCatalog,
  rankCapitalMovers,
  runCapitalMarketHunt,
  isG10Pair,
  g10Crosses,
  activityFromMarket,
  loadCatalogCache,
};
