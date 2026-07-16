/**
 * Full path / chart math context for a candidate trade.
 * Combines: barrier reachability, Hurst, RSI, Bollinger, autocorr, regression.
 */

const { atr, rsi, sma, ema } = require('../indicators');
const {
  hurstExponent,
  autocorrLag1,
  logReturns,
  linreg,
  mean,
  std,
} = require('./stats');
const { evaluateReachability } = require('./barrier');
const { evaluateTheta } = require('./theta');
const { pipSize } = require('../../utils');

function bollinger(closes, period = 20, k = 2) {
  if (!closes?.length || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = mean(slice);
  const s = std(slice);
  if (mid == null || s == null) return null;
  return {
    mid,
    upper: mid + k * s,
    lower: mid - k * s,
    width: (2 * k * s) / mid,
    pctB: s > 0 ? (closes[closes.length - 1] - (mid - k * s)) / (2 * k * s) : 0.5,
  };
}

/**
 * Decompose: P(t) ≈ T(t) + S(t) + E(t)
 * T = linear trend, S residual seasonality proxy (demeaned cycle via MA residual), E = noise std.
 */
function trendDecompose(closes) {
  if (!closes?.length || closes.length < 20) return null;
  const reg = linreg(closes);
  if (!reg) return null;
  const ma = sma(closes, Math.min(20, closes.length));
  const last = closes[closes.length - 1];
  const T = reg.m * (closes.length - 1) + reg.c;
  const residuals = closes.map((y, i) => y - (reg.m * i + reg.c));
  const noise = std(residuals);
  return {
    trendSlope: reg.m,
    trendR2: reg.r2,
    T,
    priceVsTrend: last - T,
    ma,
    noise,
  };
}

/**
 * Evaluate whether a proposed BUY/SELL plan is mathematically justified.
 * When mathTheta enabled (default): ensemble Θ from ~3h dynamics.
 */
function evaluateTradeMath({
  side,
  entry,
  stopLoss,
  takeProfit,
  barsM5,
  barsM1 = null,
  spreadPips = null,
  pair = null,
  cfg = {},
}) {
  const closes = (barsM5 || []).map((b) => b.close).filter((x) => Number.isFinite(x));
  if (closes.length < 30) {
    return {
      ok: false,
      reason: 'need ≥30 M5 bars for math gate',
      pReach: 0,
      scoreAdj: -20,
    };
  }

  const useTheta = cfg.mathTheta !== false;
  let reach;
  let theta = null;

  if (useTheta) {
    theta = evaluateTheta({
      side,
      entry,
      stopLoss,
      takeProfit,
      barsM5,
      barsM1,
      spreadPips,
      pipSize: pair ? pipSize(pair) : null,
      cfg,
    });
    reach = {
      ok: theta.ok,
      pReach: theta.pReach,
      expectancyR: theta.expectancyR,
      rr: theta.rr,
      reason: theta.reason,
      analytic: theta.votes?.find((v) => v.name === 'gbm')?.p ?? null,
      monteCarlo: { pTp: theta.votes?.find((v) => v.name === 'mc')?.p },
      drift: theta.kalman
        ? { mu: theta.kalman.mu, z: theta.kalman.z }
        : null,
    };
  } else {
    reach = evaluateReachability({
      side,
      entry,
      stopLoss,
      takeProfit,
      closes,
      cfg,
    });
  }

  const H = theta?.hurst ?? hurstExponent(closes);
  const rets = logReturns(closes.slice(-60));
  const ac1 = autocorrLag1(rets);
  const rsi14 = rsi(closes, 14);
  const bb = bollinger(closes, 20, 2);
  const atr14 = atr(barsM5, 14);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const decomp = trendDecompose(closes);

  let scoreAdj = theta?.scoreAdj ?? 0;
  const notes = [...(theta?.notes || [])];

  // CHARLIE is often a fade/sweep → mild mean-reversion (H<0.5) is friendly
  if (!useTheta && H != null) {
    if (H < 0.45) {
      scoreAdj += 4;
      notes.push(`H=${H.toFixed(2)} mean-rev`);
    } else if (H > 0.6) {
      if (reach.drift && ((side === 'long' && reach.drift.slope > 0)
        || (side === 'short' && reach.drift.slope < 0))) {
        scoreAdj += 3;
        notes.push(`H=${H.toFixed(2)} trend-aligned`);
      } else {
        scoreAdj -= 6;
        notes.push(`H=${H.toFixed(2)} trend-against`);
      }
    } else {
      notes.push(`H=${H.toFixed(2)} RW`);
    }
  }

  if (rsi14 != null) {
    if (side === 'long' && rsi14 < 35) {
      scoreAdj += 3;
      notes.push(`RSI ${rsi14.toFixed(0)} OS`);
    } else if (side === 'short' && rsi14 > 65) {
      scoreAdj += 3;
      notes.push(`RSI ${rsi14.toFixed(0)} OB`);
    } else if (side === 'long' && rsi14 > 70) {
      scoreAdj -= 5;
      notes.push(`RSI ${rsi14.toFixed(0)} OB-long`);
    } else if (side === 'short' && rsi14 < 30) {
      scoreAdj -= 5;
      notes.push(`RSI ${rsi14.toFixed(0)} OS-short`);
    }
  }

  if (bb) {
    if (side === 'long' && bb.pctB < 0.2) {
      scoreAdj += 2;
      notes.push('BB low');
    }
    if (side === 'short' && bb.pctB > 0.8) {
      scoreAdj += 2;
      notes.push('BB high');
    }
  }

  if (e20 != null && e50 != null) {
    const bullStack = e20 > e50;
    if (side === 'long' && bullStack) scoreAdj += 2;
    if (side === 'short' && !bullStack) scoreAdj += 2;
    if (side === 'long' && !bullStack) scoreAdj -= 2;
    if (side === 'short' && bullStack) scoreAdj -= 2;
  }

  if (ac1 != null) {
    if (Math.abs(ac1) > 0.25) notes.push(`AC1=${ac1.toFixed(2)}`);
  }

  if (atr14 && entry) {
    const distTp = Math.abs(takeProfit - entry);
    const atrMultiple = distTp / atr14;
    if (atrMultiple > 5) {
      scoreAdj -= 8;
      notes.push(`TP ${atrMultiple.toFixed(1)}×ATR too far`);
    } else if (atrMultiple < 0.4) {
      scoreAdj -= 3;
      notes.push('TP too close vs ATR');
    }
  }

  const minP = cfg.mathMinPReach ?? 0.52;
  const minM = cfg.mathMinExpectancyR ?? 0.05;
  const minK = cfg.mathMinKappa ?? 0.55;
  const strict = cfg.mathGate !== false;

  let ok;
  if (useTheta) {
    ok = !strict
      ? true
      : (theta.ok && scoreAdj > -14);
  } else {
    ok = !strict
      ? true
      : (reach.ok && reach.pReach >= minP && reach.expectancyR >= minM && scoreAdj > -12);
  }

  return {
    ok,
    pReach: reach.pReach,
    expectancyR: reach.expectancyR,
    kappa: theta?.kappa ?? null,
    jumpShare: theta?.jumpShare ?? null,
    friction: theta?.friction ?? null,
    scoreAdj,
    hurst: H,
    rsi: rsi14,
    bollinger: bb,
    atr: atr14,
    autocorr: ac1,
    ema: { e20, e50 },
    decomp,
    reach,
    theta: theta
      ? {
        pGross: theta.pGross,
        kappa: theta.kappa,
        votes: theta.votes,
        microOk: theta.microOk,
        ou: theta.ou,
      }
      : null,
    notes,
    reason: ok
      ? `MATH OK ${reach.reason || ''} ${notes.join(', ')}`.trim()
      : `MATH BLOCK ${reach.reason || ''} adj=${scoreAdj} ${notes.join(', ')}`.trim(),
  };
}

module.exports = {
  evaluateTradeMath,
  bollinger,
  trendDecompose,
};
