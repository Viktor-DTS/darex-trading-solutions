const { priceToPips, pipsToPrice, round } = require('../../utils');
const { buildLiquidityLevels, nearestLevel, asianSessionHighLow, dayKeyUtc } = require('./levels');
const { detectMss, isDisplacement } = require('./mss');
const { findFvg, resolveFvgEntry, asianOppositeTp } = require('./fvg');
const { biasAllowsSide } = require('./bias');
const { atrScaledLevels, atrPips } = require('./pairRank');

function isBullishBar(b) {
  return b.close > b.open;
}

function isBearishBar(b) {
  return b.close < b.open;
}

function bodyPips(bar, pair) {
  return Math.abs(priceToPips(bar.close - bar.open, pair));
}

function rangePips(bar, pair) {
  return priceToPips(bar.high - bar.low, pair);
}

/**
 * Detect London liquidity sweep + MSS + optional FVG.
 */
function detectLiquiditySweep(barsM5, barsH1, quote, pair, cfg, extras = {}) {
  const minBars = cfg.charlieMinM5Bars ?? 20;
  if (!barsM5?.length || barsM5.length < minBars) {
    return { action: 'SKIP', reason: 'insufficient M5 bars', score: 0 };
  }

  // Prefer closed bars: drop forming bar if younger than 4 min
  let bars = barsM5;
  const last = barsM5[barsM5.length - 1];
  const ageMs = last?.ts != null ? Date.now() - last.ts : Infinity;
  if (ageMs < 4 * 60 * 1000 && barsM5.length > minBars) {
    bars = barsM5.slice(0, -1);
  }

  const mid = quote.mid ?? bars[bars.length - 1].close;
  const levels = buildLiquidityLevels(barsH1, bars, mid, pair, new Date(), cfg);
  if (!levels.length) {
    return { action: 'SKIP', reason: 'no structure levels', score: 0 };
  }

  const sweepMax = cfg.charlieSweepMaxPips ?? 2.5;
  const confirmMinBody = cfg.charlieConfirmMinBodyPips ?? 0.8;
  const proximityPips = cfg.charlieLevelProximityPips ?? 8;
  const requireMss = cfg.charlieRequireMss !== false;
  const strictMss = cfg.charlieStrictMss !== false; // BUY only after real MSS
  const dailyBias = extras.dailyBias;

  const recent = bars.slice(-8);
  if (recent.length < 3) {
    return { action: 'SKIP', reason: 'need 3+ recent M5 bars', score: 0 };
  }

  let best = null;

  for (let ri = recent.length - 2; ri >= Math.max(0, recent.length - 5); ri -= 1) {
    const sweepBar = recent[ri];
    const confirmBar = recent[ri + 1];
    const preBar = recent[ri - 1];
    if (!sweepBar || !confirmBar) continue;

    const absoluteSweepIdx = bars.length - recent.length + ri;

    for (const lv of levels) {
      // Bullish SSL sweep
      const sweptLow = sweepBar.low < lv.price - pipsToPrice(0.3, pair);
      const sweepDepthLong = priceToPips(lv.price - sweepBar.low, pair);
      const reclaimed = sweepBar.close > lv.price || confirmBar.close > lv.price;

      if (
        sweptLow
        && sweepDepthLong >= 0.5
        && sweepDepthLong <= sweepMax
        && reclaimed
      ) {
        const biasGate = biasAllowsSide(dailyBias, 'long', cfg);
        if (!biasGate.ok) continue;

        let mss = { ok: true, reason: 'mss optional' };
        if (requireMss) {
          mss = detectMss(bars, 'long', absoluteSweepIdx, cfg);
          if (!mss.ok) {
            // Strict: never BUY without MSS — only WATCH if confirm visible
            if (isBullishBar(confirmBar) && bodyPips(confirmBar, pair) >= confirmMinBody) {
              const watchScore = scoreSetup({
                side: 'long',
                sweepDepth: sweepDepthLong,
                confirmBody: bodyPips(confirmBar, pair),
                levelKind: lv.kind,
                spreadPips: quote.spreadPips ?? 0,
                cfg,
                mss: false,
              });
              if (!best || (best.action === 'WATCH' && watchScore > best.score)) {
                best = {
                  side: 'long',
                  action: 'WATCH',
                  level: lv,
                  sweepBar,
                  confirmBar,
                  sweepDepthPips: sweepDepthLong,
                  score: watchScore,
                  reason: `${lv.label} SSL sweep — waiting MSS (${mss.reason})`,
                  mss: null,
                };
              }
            }
            continue;
          }
        }

        const dispBar = mss.displacementBar || confirmBar;
        if (cfg.charlieRequireDisplacement !== false && !isDisplacement(dispBar, pair, cfg)) {
          continue;
        }
        if (strictMss && requireMss && !mss.ok) continue;

        const fvg = findFvg(bars, 'long', bars.length - 1);
        if (fvg) fvg.sizePips = priceToPips(fvg.top - fvg.bottom, pair);

        const score = scoreSetup({
          side: 'long',
          sweepDepth: sweepDepthLong,
          confirmBody: bodyPips(dispBar, pair),
          levelKind: lv.kind,
          spreadPips: quote.spreadPips ?? 0,
          cfg,
          mss: mss.ok,
          hasFvg: Boolean(fvg),
        });

        if (!best || score > best.score || (best.action === 'WATCH' && score >= best.score)) {
          best = {
            side: 'long',
            action: 'BUY',
            level: lv,
            sweepBar,
            confirmBar: dispBar,
            sweepDepthPips: sweepDepthLong,
            score,
            reason: `${lv.label} SSL sweep ${round(sweepDepthLong, 1)}p → ${requireMss ? 'MSS' : 'confirm'}`,
            mss,
            fvg,
            biasGate,
            preBar,
            absoluteSweepIdx,
          };
        }
      }

      // Bearish BSL sweep
      const sweptHigh = sweepBar.high > lv.price + pipsToPrice(0.3, pair);
      const sweepDepthShort = priceToPips(sweepBar.high - lv.price, pair);
      const reclaimedShort = sweepBar.close < lv.price || confirmBar.close < lv.price;

      if (
        sweptHigh
        && sweepDepthShort >= 0.5
        && sweepDepthShort <= sweepMax
        && reclaimedShort
      ) {
        const biasGate = biasAllowsSide(dailyBias, 'short', cfg);
        if (!biasGate.ok) continue;

        let mss = { ok: true, reason: 'mss optional' };
        if (requireMss) {
          mss = detectMss(bars, 'short', absoluteSweepIdx, cfg);
          if (!mss.ok) {
            if (isBearishBar(confirmBar) && bodyPips(confirmBar, pair) >= confirmMinBody) {
              const watchScore = scoreSetup({
                side: 'short',
                sweepDepth: sweepDepthShort,
                confirmBody: bodyPips(confirmBar, pair),
                levelKind: lv.kind,
                spreadPips: quote.spreadPips ?? 0,
                cfg,
                mss: false,
              });
              if (!best || (best.action === 'WATCH' && watchScore > best.score)) {
                best = {
                  side: 'short',
                  action: 'WATCH',
                  level: lv,
                  sweepBar,
                  confirmBar,
                  sweepDepthPips: sweepDepthShort,
                  score: watchScore,
                  reason: `${lv.label} BSL sweep — waiting MSS (${mss.reason})`,
                  mss: null,
                };
              }
            }
            continue;
          }
        }

        const dispBar = mss.displacementBar || confirmBar;
        if (cfg.charlieRequireDisplacement !== false && !isDisplacement(dispBar, pair, cfg)) {
          continue;
        }
        if (strictMss && requireMss && !mss.ok) continue;

        const fvg = findFvg(bars, 'short', bars.length - 1);
        if (fvg) fvg.sizePips = priceToPips(fvg.top - fvg.bottom, pair);

        const score = scoreSetup({
          side: 'short',
          sweepDepth: sweepDepthShort,
          confirmBody: bodyPips(dispBar, pair),
          levelKind: lv.kind,
          spreadPips: quote.spreadPips ?? 0,
          cfg,
          mss: mss.ok,
          hasFvg: Boolean(fvg),
        });

        if (!best || score > best.score || (best.action === 'WATCH' && score >= best.score)) {
          best = {
            side: 'short',
            action: 'SELL',
            level: lv,
            sweepBar,
            confirmBar: dispBar,
            sweepDepthPips: sweepDepthShort,
            score,
            reason: `${lv.label} BSL sweep ${round(sweepDepthShort, 1)}p → ${requireMss ? 'MSS' : 'confirm'}`,
            mss,
            fvg,
            biasGate,
            preBar,
            absoluteSweepIdx,
          };
        }
      }
    }
  }

  if (!best) {
    const near = nearestLevel(levels, mid);
    const nearPips = near ? priceToPips(near.distance, pair) : null;
    return {
      action: 'SKIP',
      score: 0,
      reason: nearPips != null
        ? `no sweep setup (nearest ${near.label} ${round(nearPips, 1)}p)`
        : 'no sweep setup',
      nearLevel: near && nearPips != null
        ? { label: near.label, pips: round(nearPips, 1) }
        : null,
      levels: levels.slice(0, 8),
    };
  }

  if (best.action === 'WATCH') {
    return {
      ...best,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      stopPips: cfg.charlieStopPips ?? 4.5,
      targetPips: cfg.charlieTargetMinPips ?? 10,
      levels: levels.slice(0, 8),
    };
  }

  // SL / TP geometry — ATR-scaled on volatile pairs (true scalp range)
  const atrP = atrPips(bars, pair, 14);
  const scaled = cfg.charlieAtrLevels !== false
    ? atrScaledLevels(atrP, cfg)
    : {
      stopPips: cfg.charlieStopPips ?? cfg.stopPips ?? 4.5,
      targetPips: cfg.charlieTargetMinPips ?? 10,
      mode: 'fixed',
      atrPips: atrP,
    };
  const stopPipsCfg = scaled.stopPips;
  const targetMin = scaled.targetPips;
  const targetMax = cfg.charlieTargetMaxPips ?? Math.max(scaled.targetPips, 28);
  const digits = pair.includes('JPY') ? 3 : 5;

  const sweepExtreme = best.side === 'long'
    ? Math.min(best.sweepBar.low, best.preBar?.low ?? best.sweepBar.low)
    : Math.max(best.sweepBar.high, best.preBar?.high ?? best.sweepBar.high);

  const entryInfo = resolveFvgEntry(best.fvg, quote, best.side, pair, cfg);
  let entry = entryInfo.entry;

  // If FVG mid is worse than market in direction (already past FVG), fall back to market
  if (entryInfo.mode === 'fvg_50') {
    if (best.side === 'long' && quote.ask != null && entry > quote.ask + pipsToPrice(1, pair)) {
      entry = round(quote.ask, digits);
      entryInfo.mode = 'market_past_fvg';
    }
    if (best.side === 'short' && quote.bid != null && entry < quote.bid - pipsToPrice(1, pair)) {
      entry = round(quote.bid, digits);
      entryInfo.mode = 'market_past_fvg';
    }
  }

  let stopLoss;
  let takeProfit;
  let targetPips;

  if (best.side === 'long') {
    const slBeyond = sweepExtreme - pipsToPrice(0.5, pair);
    stopLoss = round(Math.min(slBeyond, entry - pipsToPrice(stopPipsCfg, pair)), digits);
    targetPips = Math.min(targetMax, Math.max(targetMin, stopPipsCfg * (cfg.charlieMinRR ?? 2.0)));
    takeProfit = round(entry + pipsToPrice(targetPips, pair), digits);
    const asian = asianSessionHighLow(bars, new Date(), cfg);
    const asianTp = asianOppositeTp('long', asian, entry, pair, cfg);
    if (asianTp && cfg.charlieDynamicTp !== false
      && asianTp.targetPips > targetPips
      && asianTp.targetPips <= targetMax) {
      takeProfit = asianTp.takeProfit;
      targetPips = asianTp.targetPips;
    }
  } else {
    const slBeyond = sweepExtreme + pipsToPrice(0.5, pair);
    stopLoss = round(Math.max(slBeyond, entry + pipsToPrice(stopPipsCfg, pair)), digits);
    targetPips = Math.min(targetMax, Math.max(targetMin, stopPipsCfg * (cfg.charlieMinRR ?? 2.0)));
    takeProfit = round(entry - pipsToPrice(targetPips, pair), digits);
    const asian = asianSessionHighLow(bars, new Date(), cfg);
    const asianTp = asianOppositeTp('short', asian, entry, pair, cfg);
    if (asianTp && cfg.charlieDynamicTp !== false
      && asianTp.targetPips > targetPips
      && asianTp.targetPips <= targetMax) {
      takeProfit = asianTp.takeProfit;
      targetPips = asianTp.targetPips;
    }
  }

  const actualStopPips = Math.abs(priceToPips(
    best.side === 'long' ? entry - stopLoss : stopLoss - entry,
    pair,
  ));
  const actualTargetPips = Math.abs(priceToPips(
    best.side === 'long' ? takeProfit - entry : entry - takeProfit,
    pair,
  ));

  // Kill-zone time boost — no late soft entries (session end gates hard cut)
  const hour = new Date().getUTCHours();
  let score = best.score;
  if (hour >= 7 && hour < 8) score += 5;
  else if (hour >= 8 && hour < 9) score += 2;

  return {
    ...best,
    score: Math.round(Math.max(0, Math.min(100, score))),
    entry,
    stopLoss,
    takeProfit,
    stopPips: round(actualStopPips, 2),
    targetPips: round(actualTargetPips, 2),
    entryMode: entryInfo.mode,
    atrLevels: scaled,
    levels: levels.slice(0, 8),
    features: {
      level_kind: best.level?.kind,
      sweep_depth: best.sweepDepthPips,
      confirm_body: bodyPips(best.confirmBar, pair),
      hour_utc: hour,
      has_mss: Boolean(best.mss?.ok),
      has_fvg: Boolean(best.fvg),
      entry_mode: entryInfo.mode,
      atr_pips: scaled.atrPips ?? atrP,
      level_mode: scaled.mode,
      day_key: dayKeyUtc(Date.now()),
    },
  };
}

function scoreSetup({
  side, sweepDepth, confirmBody, levelKind, spreadPips, cfg, mss, hasFvg,
}) {
  let score = 50;
  if (sweepDepth >= 1 && sweepDepth <= 2) score += 12;
  else if (sweepDepth > 0.5) score += 6;
  if (confirmBody >= 1.5) score += 10;
  else if (confirmBody >= 0.8) score += 5;
  if (levelKind === 'pdh' || levelKind === 'pdl') score += 10;
  else if (levelKind === 'asian_high' || levelKind === 'asian_low') score += 8;
  else if (levelKind === 'eqh' || levelKind === 'eql') score += 7;
  else if (levelKind === 'round') score += 2;
  if (mss) score += 8;
  if (hasFvg) score += 5;
  score -= Math.min(15, (spreadPips || 0) * 4);
  return Math.round(Math.max(0, Math.min(100, score)));
}

module.exports = {
  detectLiquiditySweep,
  scoreSetup,
};
