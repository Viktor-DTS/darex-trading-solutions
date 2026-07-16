const { pipSize, round, priceToPips } = require('../../utils');

function dayKeyUtc(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function parseHmToMinutes(hm, fallback) {
  if (hm == null || String(hm).trim() === '') return fallback;
  const [h, m] = String(hm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Previous UTC calendar day high/low from H1 bars. */
function prevDayHighLow(barsH1) {
  if (!barsH1?.length) return null;
  const byDay = new Map();
  for (const b of barsH1) {
    const k = dayKeyUtc(b.ts);
    const cur = byDay.get(k) || { high: -Infinity, low: Infinity, ts: b.ts };
    cur.high = Math.max(cur.high, b.high);
    cur.low = Math.min(cur.low, b.low);
    cur.ts = Math.min(cur.ts, b.ts);
    byDay.set(k, cur);
  }
  const days = [...byDay.entries()].sort((a, b) => a[1].ts - b[1].ts);
  if (days.length < 2) return null;
  const prev = days[days.length - 2][1];
  return {
    pdh: prev.high,
    pdl: prev.low,
    dayKey: days[days.length - 2][0],
  };
}

/**
 * Asian session H/L.
 * Default UTC 00:00–07:00; override via cfg.charlieAsianStart / charlieAsianEnd (HH:MM UTC).
 * ICT-style: set FX_CHARLIE_ASIAN_START=00:00 FX_CHARLIE_ASIAN_END=05:00 (approx 19:00–00:00 ET + DST).
 */
function asianSessionHighLow(bars, now = new Date(), cfg = {}) {
  if (!bars?.length) return null;
  const startMin = parseHmToMinutes(cfg.charlieAsianStart, 0);
  const endMin = parseHmToMinutes(cfg.charlieAsianEnd, 7 * 60);
  const todayKey = dayKeyUtc(now.getTime());

  let high = -Infinity;
  let low = Infinity;
  let count = 0;
  for (const b of bars) {
    if (dayKeyUtc(b.ts) !== todayKey) continue;
    const d = new Date(b.ts);
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (mins < startMin || mins >= endMin) continue;
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
    count += 1;
  }
  if (!count || !Number.isFinite(high) || !Number.isFinite(low)) return null;
  return { asianHigh: high, asianLow: low };
}

function roundStep(pair) {
  const p = String(pair || '').toUpperCase();
  if (p.includes('JPY')) return 0.05; // 5 pips for JPY (was 0.5 = too coarse)
  return 0.005;
}

/** Nearest psychological round levels. */
function roundNumberLevels(mid, pair, count = 3) {
  if (!Number.isFinite(mid)) return [];
  const step = roundStep(pair);
  const base = Math.round(mid / step) * step;
  const digits = pair.includes('JPY') ? 3 : 5;
  const levels = [];
  for (let i = -count; i <= count; i += 1) {
    levels.push(round(base + i * step, digits));
  }
  return [...new Set(levels)].sort((a, b) => a - b);
}

/** Equal highs / equal lows from H1 (2+ touches within tolerance). */
function equalHighsLows(barsH1, pair, cfg = {}) {
  if (!barsH1?.length || barsH1.length < 10) return [];
  const tolPips = cfg.charlieEqlTolPips ?? 2;
  const ps = pipSize(pair);
  const tol = tolPips * ps;
  const recent = barsH1.slice(-48);
  const out = [];

  const highs = recent.map((b) => b.high).sort((a, b) => b - a);
  const lows = recent.map((b) => b.low).sort((a, b) => a - b);

  function cluster(sorted, kind) {
    const clusters = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
      if (Math.abs(sorted[i] - group[0]) <= tol) group.push(sorted[i]);
      else {
        if (group.length >= 2) {
          const avg = group.reduce((s, x) => s + x, 0) / group.length;
          clusters.push({
            price: avg,
            kind: kind === 'high' ? 'eqh' : 'eql',
            label: kind === 'high' ? 'EQH' : 'EQL',
            touches: group.length,
          });
        }
        group = [sorted[i]];
      }
    }
    if (group.length >= 2) {
      const avg = group.reduce((s, x) => s + x, 0) / group.length;
      clusters.push({
        price: avg,
        kind: kind === 'high' ? 'eqh' : 'eql',
        label: kind === 'high' ? 'EQH' : 'EQL',
        touches: group.length,
      });
    }
    return clusters.slice(0, 3);
  }

  out.push(...cluster(highs, 'high'));
  out.push(...cluster(lows, 'low'));
  return out;
}

/**
 * Build liquidity pool levels for sweep detection.
 * @returns {{ price: number, kind: string, label: string }[]}
 */
function buildLiquidityLevels(barsH1, barsM5, mid, pair, now = new Date(), cfg = {}) {
  const out = [];
  const pd = prevDayHighLow(barsH1);
  if (pd) {
    out.push({ price: pd.pdh, kind: 'pdh', label: 'PDH' });
    out.push({ price: pd.pdl, kind: 'pdl', label: 'PDL' });
  }
  const asian = asianSessionHighLow(barsM5?.length ? barsM5 : barsH1, now, cfg);
  if (asian) {
    out.push({ price: asian.asianHigh, kind: 'asian_high', label: 'AsianH' });
    out.push({ price: asian.asianLow, kind: 'asian_low', label: 'AsianL' });
  }
  if (cfg.charlieEql !== false) {
    out.push(...equalHighsLows(barsH1, pair, cfg));
  }
  for (const price of roundNumberLevels(mid, pair, 2)) {
    out.push({ price, kind: 'round', label: 'RN' });
  }
  const ps = pipSize(pair);
  const dedup = new Map();
  for (const lv of out) {
    if (!Number.isFinite(lv.price)) continue;
    const key = Math.round(lv.price / ps);
    const existing = dedup.get(key);
    // Prefer higher-priority kinds
    const pri = { pdh: 5, pdl: 5, asian_high: 4, asian_low: 4, eqh: 3, eql: 3, round: 1 };
    if (!existing || (pri[lv.kind] || 0) > (pri[existing.kind] || 0)) {
      dedup.set(key, lv);
    }
  }
  return [...dedup.values()];
}

function nearestLevel(levels, price) {
  if (!levels.length || !Number.isFinite(price)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const lv of levels) {
    const dist = Math.abs(lv.price - price);
    if (dist < bestDist) {
      bestDist = dist;
      best = { ...lv, distance: dist };
    }
  }
  return best;
}

module.exports = {
  prevDayHighLow,
  asianSessionHighLow,
  roundNumberLevels,
  equalHighsLows,
  buildLiquidityLevels,
  nearestLevel,
  dayKeyUtc,
};
