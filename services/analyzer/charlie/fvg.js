const { round, pipsToPrice, priceToPips } = require('../../utils');

/**
 * Fair Value Gap from 3-candle displacement.
 * Bullish FVG: candle[i-2].high < candle[i].low
 * Bearish FVG: candle[i-2].low > candle[i].high
 */
function findFvg(bars, side, fromIndex = null) {
  if (!bars?.length || bars.length < 3) return null;
  const end = fromIndex != null ? fromIndex : bars.length - 1;
  const start = Math.max(2, end - 8);

  for (let i = end; i >= start; i -= 1) {
    const c0 = bars[i - 2];
    const c2 = bars[i];
    if (!c0 || !c2) continue;

    if (side === 'long') {
      if (c2.low > c0.high) {
        const top = c2.low;
        const bottom = c0.high;
        const mid = (top + bottom) / 2;
        return {
          side: 'long',
          top,
          bottom,
          mid,
          index: i,
          sizePips: null, // filled by caller with pair
        };
      }
    } else if (c2.high < c0.low) {
      const top = c0.low;
      const bottom = c2.high;
      const mid = (top + bottom) / 2;
      return {
        side: 'short',
        top,
        bottom,
        mid,
        index: i,
      };
    }
  }
  return null;
}

/**
 * Entry price: 50% CE of FVG, or confirm bar 50% retrace fallback.
 */
function resolveFvgEntry(fvg, quote, side, pair, cfg = {}) {
  const digits = pair.includes('JPY') ? 3 : 5;
  const useFvg = cfg.charlieFvgEntry !== false && fvg?.mid != null;

  if (useFvg) {
    return {
      entry: round(fvg.mid, digits),
      mode: 'fvg_50',
      fvg,
    };
  }

  // Fallback: market (ask/bid) — used when FVG missing
  if (side === 'long') {
    return { entry: round(quote.ask ?? quote.mid, digits), mode: 'market', fvg: null };
  }
  return { entry: round(quote.bid ?? quote.mid, digits), mode: 'market', fvg: null };
}

/** Opposite Asian extreme as dynamic TP1. */
function asianOppositeTp(side, asian, entry, pair, cfg = {}) {
  if (!asian) return null;
  const digits = pair.includes('JPY') ? 3 : 5;
  const minPips = cfg.charlieTargetMinPips ?? 10;
  const maxPips = cfg.charlieTargetMaxPips ?? 15;

  if (side === 'long' && asian.asianHigh != null) {
    const tp = asian.asianHigh;
    const dist = priceToPips(tp - entry, pair);
    if (dist >= minPips * 0.7) {
      return {
        takeProfit: round(tp, digits),
        targetPips: round(Math.min(maxPips, Math.max(minPips, dist)), 2),
        mode: 'asian_opposite',
      };
    }
  }
  if (side === 'short' && asian.asianLow != null) {
    const tp = asian.asianLow;
    const dist = priceToPips(entry - tp, pair);
    if (dist >= minPips * 0.7) {
      return {
        takeProfit: round(tp, digits),
        targetPips: round(Math.min(maxPips, Math.max(minPips, dist)), 2),
        mode: 'asian_opposite',
      };
    }
  }
  return null;
}

module.exports = {
  findFvg,
  resolveFvgEntry,
  asianOppositeTp,
};
