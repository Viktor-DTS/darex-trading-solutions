/**
 * Barrier / reachability mathematics.
 * P(hit take-profit before stop-loss) under GBM-like diffusion + Monte Carlo bootstrap.
 */

const { logReturns, mean, std, linreg } = require('./stats');

/**
 * Analytic probability of hitting upper barrier b before lower barrier -a
 * for Brownian motion with drift μ and diffusion σ (same units as a,b).
 * Classic gambler's ruin with drift.
 */
function barrierHitProb(a, b, mu, sigma) {
  if (!(a > 0) || !(b > 0)) return null;
  if (!(sigma > 0)) {
    // Pure drift
    if (mu > 0) return 1;
    if (mu < 0) return 0;
    return a / (a + b);
  }
  const theta = (2 * mu) / (sigma * sigma);
  if (Math.abs(theta) < 1e-10) {
    return a / (a + b);
  }
  // P(hit +b before -a) starting at 0
  const eA = Math.exp(-theta * a);
  const eAB = Math.exp(-theta * (a + b));
  return (1 - eA) / (1 - eAB);
}

/**
 * Estimate μ (drift per bar) and σ (vol per bar) from M5 closes in price units.
 */
function estimateDriftVol(closes, lookback = 48) {
  if (!closes?.length || closes.length < 10) return null;
  const slice = closes.slice(-Math.min(lookback, closes.length));
  const rets = logReturns(slice);
  if (rets.length < 8) return null;
  const muLog = mean(rets);
  const sigLog = std(rets);
  const px = slice[slice.length - 1];
  if (!px || muLog == null || sigLog == null || sigLog <= 0) return null;

  // Convert log to approximate price increments per bar
  const mu = px * muLog;
  const sigma = px * sigLog;

  // Also regression slope of prices (trend T(t))
  const reg = linreg(slice);
  const slope = reg?.m ?? 0;

  return {
    mu,
    sigma,
    muLog,
    sigLog,
    slope,
    r2: reg?.r2 ?? 0,
    price: px,
    n: rets.length,
  };
}

/**
 * Monte Carlo: bootstrap empirical log-returns until TP or SL.
 * @param {'long'|'short'} side
 */
function monteCarloReach({
  entry,
  stopLoss,
  takeProfit,
  side,
  closes,
  paths = 400,
  maxBars = 36,
  lookback = 80,
}) {
  if (!entry || !stopLoss || !takeProfit || !closes?.length) {
    return null;
  }
  const rets = logReturns(closes.slice(-Math.min(lookback, closes.length)));
  if (rets.length < 20) return null;

  let hitsTp = 0;
  let hitsSl = 0;
  let timeout = 0;

  for (let p = 0; p < paths; p += 1) {
    let price = entry;
    let done = false;
    for (let t = 0; t < maxBars; t += 1) {
      const r = rets[Math.floor(Math.random() * rets.length)];
      price *= Math.exp(r);
      if (side === 'long') {
        if (price <= stopLoss) {
          hitsSl += 1;
          done = true;
          break;
        }
        if (price >= takeProfit) {
          hitsTp += 1;
          done = true;
          break;
        }
      } else {
        if (price >= stopLoss) {
          hitsSl += 1;
          done = true;
          break;
        }
        if (price <= takeProfit) {
          hitsTp += 1;
          done = true;
          break;
        }
      }
    }
    if (!done) timeout += 1;
  }

  const decided = hitsTp + hitsSl;
  const pTp = decided > 0 ? hitsTp / decided : hitsTp / paths;
  const pTimeout = timeout / paths;
  return {
    pTp,
    pSl: decided > 0 ? hitsSl / decided : 0,
    pTimeout,
    paths,
    maxBars,
    decided,
  };
}

/**
 * Combined analytical + MC reachability for a trade plan.
 */
function evaluateReachability({
  side,
  entry,
  stopLoss,
  takeProfit,
  closes,
  cfg = {},
}) {
  if (!entry || !stopLoss || !takeProfit || !side) {
    return { ok: false, reason: 'missing levels', pReach: 0 };
  }

  const distSl = Math.abs(entry - stopLoss);
  const distTp = Math.abs(takeProfit - entry);
  if (distSl <= 0 || distTp <= 0) {
    return { ok: false, reason: 'invalid SL/TP distance', pReach: 0 };
  }

  const dv = estimateDriftVol(closes, cfg.mathLookback ?? 48);
  if (!dv) {
    return { ok: false, reason: 'insufficient history for μ/σ', pReach: 0 };
  }

  // Align drift with trade side: for short, flip
  const mu = side === 'long' ? dv.mu : -dv.mu;
  const slope = side === 'long' ? dv.slope : -dv.slope;

  // If short-term regression slope conflicts strongly with side → lower confidence
  const analytic = barrierHitProb(distSl, distTp, mu, dv.sigma);

  const mc = monteCarloReach({
    entry,
    stopLoss,
    takeProfit,
    side,
    closes,
    paths: cfg.mathMcPaths ?? 400,
    maxBars: cfg.mathMcMaxBars ?? 36,
    lookback: cfg.mathLookback ?? 80,
  });

  // Blend: 55% analytic, 45% Monte Carlo (MC captures fat tails from data)
  let pReach = analytic;
  if (mc && Number.isFinite(mc.pTp)) {
    pReach = analytic != null
      ? 0.55 * analytic + 0.45 * mc.pTp
      : mc.pTp;
  }
  if (pReach == null || !Number.isFinite(pReach)) {
    return { ok: false, reason: 'reachability undefined', pReach: 0 };
  }

  // Slope alignment bonus/penalty (±0.06 max)
  const slopeScale = Math.abs(dv.price) > 0 ? Math.abs(slope) / (Math.abs(dv.sigma) * 0.5 || 1e-9) : 0;
  const slopeAdj = Math.max(-0.06, Math.min(0.06, Math.tanh(slopeScale) * 0.06 * Math.sign(slope || 0)));
  pReach = Math.max(0.01, Math.min(0.99, pReach + slopeAdj));

  const rr = distTp / distSl;
  // Expectancy in R-multiples: M = P*R - (1-P)*1
  const expectancyR = pReach * rr - (1 - pReach) * 1;
  // Rough pip expectancy if we know distances in same units — return as relative

  const minP = cfg.mathMinPReach ?? 0.52;
  const minM = cfg.mathMinExpectancyR ?? 0.05;
  const ok = pReach >= minP && expectancyR >= minM;

  return {
    ok,
    pReach,
    expectancyR,
    rr,
    analytic,
    monteCarlo: mc,
    drift: {
      mu: dv.mu,
      sigma: dv.sigma,
      muLog: dv.muLog,
      sigLog: dv.sigLog,
      slope: dv.slope,
      r2: dv.r2,
    },
    distSl,
    distTp,
    reason: ok
      ? `P(TP)=${(pReach * 100).toFixed(1)}% M=${expectancyR.toFixed(2)}R`
      : `path fail P=${(pReach * 100).toFixed(1)}% < ${(minP * 100).toFixed(0)}% or M=${expectancyR.toFixed(2)}R`,
  };
}

module.exports = {
  barrierHitProb,
  estimateDriftVol,
  monteCarloReach,
  evaluateReachability,
};
