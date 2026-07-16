const { priceToPips } = require('../../utils');

/** 5-bar fractal swing highs/lows on M5. */
function findSwingPoints(bars, lookback = 2) {
  const highs = [];
  const lows = [];
  if (!bars?.length || bars.length < lookback * 2 + 1) return { highs, lows };

  for (let i = lookback; i < bars.length - lookback; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (bars[i].high <= bars[i - j].high || bars[i].high <= bars[i + j].high) isHigh = false;
      if (bars[i].low >= bars[i - j].low || bars[i].low >= bars[i + j].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: bars[i].high, ts: bars[i].ts });
    if (isLow) lows.push({ index: i, price: bars[i].low, ts: bars[i].ts });
  }
  return { highs, lows };
}

/**
 * Market Structure Shift after a sweep.
 * Bullish MSS: after SSL sweep, price closes above last swing high.
 * Bearish MSS: after BSL sweep, price closes above last swing low.
 * @param {'long'|'short'} side
 */
function detectMss(barsM5, side, sweepBarIndex, cfg = {}) {
  const maxBars = cfg.charlieMssMaxBars ?? 5;
  if (!barsM5?.length || sweepBarIndex == null || sweepBarIndex < 0) {
    return { ok: false, reason: 'no sweep bar for MSS' };
  }

  const start = Math.max(0, sweepBarIndex - 20);
  const end = Math.min(barsM5.length, sweepBarIndex + maxBars + 1);
  const window = barsM5.slice(start, end);
  if (window.length < 5) return { ok: false, reason: 'insufficient bars for MSS' };

  const localSweepIdx = sweepBarIndex - start;
  if (localSweepIdx < 0 || localSweepIdx >= window.length) {
    return { ok: false, reason: 'sweep index out of window' };
  }
  const preSweep = window.slice(0, localSweepIdx + 1);
  const postSweep = window.slice(localSweepIdx + 1);
  if (!postSweep.length) return { ok: false, reason: 'waiting for MSS bars' };

  const { highs, lows } = findSwingPoints(preSweep, 2);

  if (side === 'long') {
    const lastSwingHigh = highs.length ? highs[highs.length - 1] : null;
    if (!lastSwingHigh) {
      // Fallback: break of sweep bar high
      const ref = preSweep[preSweep.length - 1]?.high;
      const broken = postSweep.find((b) => b.close > ref);
      if (!broken) return { ok: false, reason: 'no bullish MSS (no swing high)' };
      return {
        ok: true,
        side: 'long',
        breakPrice: ref,
        displacementBar: broken,
        reason: `bullish MSS close > sweep high ${ref}`,
      };
    }
    const broken = postSweep.find((b) => b.close > lastSwingHigh.price);
    if (!broken) return { ok: false, reason: 'no bullish MSS yet' };
    return {
      ok: true,
      side: 'long',
      breakPrice: lastSwingHigh.price,
      displacementBar: broken,
      reason: `bullish MSS close > swing ${lastSwingHigh.price}`,
    };
  }

  // short
  const lastSwingLow = lows.length ? lows[lows.length - 1] : null;
  if (!lastSwingLow) {
    const ref = preSweep[preSweep.length - 1]?.low;
    const broken = postSweep.find((b) => b.close < ref);
    if (!broken) return { ok: false, reason: 'no bearish MSS (no swing low)' };
    return {
      ok: true,
      side: 'short',
      breakPrice: ref,
      displacementBar: broken,
      reason: `bearish MSS close < sweep low ${ref}`,
    };
  }
  const broken = postSweep.find((b) => b.close < lastSwingLow.price);
  if (!broken) return { ok: false, reason: 'no bearish MSS yet' };
  return {
    ok: true,
    side: 'short',
    breakPrice: lastSwingLow.price,
    displacementBar: broken,
    reason: `bearish MSS close < swing ${lastSwingLow.price}`,
  };
}

/** Displacement = strong body candle (body/range >= minRatio, body >= minPips). */
function isDisplacement(bar, pair, cfg = {}) {
  if (!bar) return false;
  const range = bar.high - bar.low;
  if (range <= 0) return false;
  const body = Math.abs(bar.close - bar.open);
  const minRatio = cfg.charlieDisplacementRatio ?? 0.6;
  const minBody = cfg.charlieDisplacementMinPips ?? 1.2;
  const bodyPips = priceToPips(body, pair);
  return body / range >= minRatio && bodyPips >= minBody;
}

module.exports = {
  findSwingPoints,
  detectMss,
  isDisplacement,
};
