/**
 * Ornstein–Uhlenbeck mean-reversion fit + Monte Carlo barrier reachability.
 * Used when Hurst < ~0.5 (fade / post-sweep regimes).
 */

const { mean, std, logReturns } = require('./stats');

/**
 * Fit discrete OU / AR(1) on prices:
 * X_t - μ = φ (X_{t-1} - μ) + ε
 * θ ≈ -ln(φ) (per bar), σ from residual.
 */
function fitOU(closes) {
  if (!closes?.length || closes.length < 24) return null;
  const x = closes.filter((v) => Number.isFinite(v));
  if (x.length < 24) return null;
  const muBar = mean(x);
  let num = 0;
  let den = 0;
  for (let i = 1; i < x.length; i += 1) {
    const a = x[i - 1] - muBar;
    const b = x[i] - muBar;
    num += a * b;
    den += a * a;
  }
  if (!(den > 0)) return null;
  let phi = num / den;
  phi = Math.max(-0.98, Math.min(0.98, phi));
  // Mean-reverting requires 0 < phi < 1
  if (!(phi > 0 && phi < 0.995)) {
    return {
      muBar,
      phi,
      theta: null,
      sigma: null,
      meanReverting: false,
    };
  }
  const theta = -Math.log(phi);
  const resid = [];
  for (let i = 1; i < x.length; i += 1) {
    const pred = muBar + phi * (x[i - 1] - muBar);
    resid.push(x[i] - pred);
  }
  const sig = std(resid);
  if (!(sig > 0)) return null;
  return {
    muBar,
    phi,
    theta,
    sigma: sig,
    meanReverting: true,
    halfLifeBars: Math.log(2) / theta,
  };
}

/**
 * MC under OU dynamics until TP/SL.
 */
function monteCarloOUReach({
  entry,
  stopLoss,
  takeProfit,
  side,
  ou,
  paths = 300,
  maxBars = 36,
}) {
  if (!ou?.meanReverting || !(ou.theta > 0) || !(ou.sigma > 0)) return null;
  if (!entry || !stopLoss || !takeProfit) return null;

  const { theta, muBar, sigma } = ou;
  let hitsTp = 0;
  let hitsSl = 0;
  let timeout = 0;

  for (let p = 0; p < paths; p += 1) {
    let price = entry;
    let done = false;
    for (let t = 0; t < maxBars; t += 1) {
      const z = Math.sqrt(-2 * Math.log(Math.random() + 1e-12))
        * Math.cos(2 * Math.PI * Math.random());
      price += theta * (muBar - price) + sigma * z;
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
      } else if (price >= stopLoss) {
        hitsSl += 1;
        done = true;
        break;
      } else if (price <= takeProfit) {
        hitsTp += 1;
        done = true;
        break;
      }
    }
    if (!done) timeout += 1;
  }

  const decided = hitsTp + hitsSl;
  return {
    pTp: decided > 0 ? hitsTp / decided : hitsTp / paths,
    pSl: decided > 0 ? hitsSl / decided : 0,
    pTimeout: timeout / paths,
    paths,
    halfLifeBars: ou.halfLifeBars,
  };
}

/**
 * Quick OU-friendly prior from returns mean-reversion strength (no full MC).
 * Falls back when fit is weak.
 */
function ouPriorFromReturns(closes, side) {
  const rets = logReturns(closes?.slice(-48) || []);
  if (rets.length < 15) return null;
  const ac = (() => {
    const m = mean(rets);
    let num = 0;
    let den = 0;
    for (let i = 1; i < rets.length; i += 1) {
      num += (rets[i - 1] - m) * (rets[i] - m);
      den += (rets[i] - m) ** 2;
    }
    return den > 0 ? num / den : 0;
  })();
  // Negative AC1 → mean-reversion → slight boost to fade setups is handled upstream;
  // here return a soft p prior near 0.5 tilted by distance to mean
  const last = closes[closes.length - 1];
  const mu = mean(closes.slice(-36));
  if (!Number.isFinite(last) || !Number.isFinite(mu) || mu === 0) return null;
  const z = (last - mu) / (std(closes.slice(-36)) || 1e-9);
  // For long, prefer below mean; for short, above mean
  let tilt = side === 'long' ? -z : z;
  tilt = Math.max(-1.5, Math.min(1.5, tilt));
  const p = 0.5 + 0.08 * tilt - 0.05 * Math.max(0, ac);
  return Math.max(0.15, Math.min(0.85, p));
}

module.exports = {
  fitOU,
  monteCarloOUReach,
  ouPriorFromReturns,
};
