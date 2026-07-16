/**
 * Core statistical helpers for FX path analysis.
 */

function mean(arr) {
  if (!arr?.length) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function variance(arr, mu = null) {
  if (!arr?.length || arr.length < 2) return null;
  const m = mu ?? mean(arr);
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
}

function std(arr) {
  const v = variance(arr);
  return v == null ? null : Math.sqrt(v);
}

/** Log returns from close series. */
function logReturns(closes) {
  const out = [];
  for (let i = 1; i < (closes?.length || 0); i += 1) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

/**
 * OLS linear regression y = mx + c on equally spaced x=0..n-1.
 * @returns {{ m:number, c:number, r2:number }|null}
 */
function linreg(values) {
  if (!values?.length || values.length < 5) return null;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXX += i * i;
    sumXY += i * values[i];
  }
  const den = n * sumXX - sumX * sumX;
  if (Math.abs(den) < 1e-12) return null;
  const m = (n * sumXY - sumX * sumY) / den;
  const c = (sumY - m * sumX) / n;
  const yBar = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const yHat = m * i + c;
    ssTot += (values[i] - yBar) ** 2;
    ssRes += (values[i] - yHat) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { m, c, r2 };
}

/**
 * Lag-1 autocorrelation of returns (trend persistence proxy).
 */
function autocorrLag1(returns) {
  if (!returns?.length || returns.length < 10) return null;
  const m = mean(returns);
  let num = 0;
  let den = 0;
  for (let i = 0; i < returns.length; i += 1) {
    const d = returns[i] - m;
    den += d * d;
    if (i > 0) num += (returns[i - 1] - m) * d;
  }
  if (den <= 0) return null;
  return num / den;
}

/**
 * Hurst exponent via rescaled range (R/S) on log returns.
 * H > 0.5 trending, H < 0.5 mean-reverting, ≈0.5 random walk.
 */
function hurstExponent(closes, minWindow = 8) {
  const rets = logReturns(closes);
  if (rets.length < minWindow * 2) return null;

  const sizes = [];
  for (let w = minWindow; w <= Math.floor(rets.length / 2); w *= 2) {
    sizes.push(w);
  }
  if (sizes.length < 2) return null;

  const logN = [];
  const logRS = [];
  for (const n of sizes) {
    const chunks = Math.floor(rets.length / n);
    if (chunks < 1) continue;
    let rsSum = 0;
    let used = 0;
    for (let c = 0; c < chunks; c += 1) {
      const slice = rets.slice(c * n, (c + 1) * n);
      const m = mean(slice);
      let cum = 0;
      let maxC = -Infinity;
      let minC = Infinity;
      for (const r of slice) {
        cum += r - m;
        maxC = Math.max(maxC, cum);
        minC = Math.min(minC, cum);
      }
      const s = std(slice);
      if (!s || s <= 0) continue;
      rsSum += (maxC - minC) / s;
      used += 1;
    }
    if (used < 1) continue;
    logN.push(Math.log(n));
    logRS.push(Math.log(rsSum / used));
  }
  if (logN.length < 2) return null;
  // Slope of log(R/S) vs log(n) = Hurst
  const n = logN.length;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += logN[i];
    sumY += logRS[i];
    sumXX += logN[i] * logN[i];
    sumXY += logN[i] * logRS[i];
  }
  const den = n * sumXX - sumX * sumX;
  if (Math.abs(den) < 1e-12) return null;
  const H = (n * sumXY - sumX * sumY) / den;
  return Math.max(0, Math.min(1, H));
}

/** Pearson correlation of two equal-length series. */
function pearson(a, b) {
  if (!a?.length || a.length !== b?.length || a.length < 5) return null;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da <= 0 || db <= 0) return null;
  return num / Math.sqrt(da * db);
}

/** Realized variance of log-returns. */
function realizedVariance(returns) {
  if (!returns?.length) return null;
  return returns.reduce((s, r) => s + r * r, 0);
}

/**
 * Bipower variation ≈ continuous vol component (Barndorff-Nielsen).
 * BV = (π/2) * sum |r_i| |r_{i-1}|
 */
function bipowerVariation(returns) {
  if (!returns?.length || returns.length < 3) return null;
  let s = 0;
  for (let i = 1; i < returns.length; i += 1) {
    s += Math.abs(returns[i]) * Math.abs(returns[i - 1]);
  }
  return (Math.PI / 2) * s;
}

/** Jump share J = max(RV - BV, 0) / RV ∈ [0,1]. */
function jumpShare(returns) {
  const rv = realizedVariance(returns);
  const bv = bipowerVariation(returns);
  if (rv == null || bv == null || !(rv > 0)) return null;
  return Math.max(0, Math.min(1, (rv - bv) / rv));
}

/**
 * Parkinson OHLC volatility (per-bar, log).
 * More efficient than close-close on the same window.
 */
function parkinsonVol(bars) {
  if (!bars?.length || bars.length < 5) return null;
  let s = 0;
  let n = 0;
  for (const b of bars) {
    const h = Number(b.high);
    const l = Number(b.low);
    if (!(h > 0) || !(l > 0) || h <= l) continue;
    const x = Math.log(h / l);
    s += x * x;
    n += 1;
  }
  if (n < 5) return null;
  return Math.sqrt(s / (4 * n * Math.log(2)));
}

/** EWMA mean & std of returns (alpha closer to 1 = longer memory). */
function ewmaMoments(returns, alpha = 0.94) {
  if (!returns?.length || returns.length < 5) return null;
  const a = Math.min(0.99, Math.max(0.5, alpha));
  let mu = returns[0];
  let v = 0;
  for (let i = 1; i < returns.length; i += 1) {
    const r = returns[i];
    const d = r - mu;
    mu = a * mu + (1 - a) * r;
    v = a * v + (1 - a) * d * d;
  }
  return { mu, sigma: Math.sqrt(Math.max(v, 1e-16)), alpha: a };
}

/**
 * Lightweight 1D Kalman on returns → online drift estimate + SE proxy.
 * State = μ, observation = r_t.
 */
function kalmanDrift(returns, { q = 1e-6, r = null } = {}) {
  if (!returns?.length || returns.length < 8) return null;
  const obsVar = r != null ? r : Math.max(variance(returns) || 1e-8, 1e-10);
  let x = mean(returns.slice(0, 5)) || 0;
  let p = obsVar;
  for (let i = 0; i < returns.length; i += 1) {
    // predict
    p += q;
    // update
    const k = p / (p + obsVar);
    x += k * (returns[i] - x);
    p *= (1 - k);
  }
  const se = Math.sqrt(Math.max(p, 1e-16));
  const z = se > 0 ? x / se : 0;
  return { mu: x, se, z, significant: Math.abs(z) >= 1.2 };
}

/** Median absolute bar range (high-low) in price units. */
function medianBarRange(bars, lookback = 20) {
  if (!bars?.length) return null;
  const slice = bars.slice(-Math.min(lookback, bars.length));
  const ranges = slice
    .map((b) => Number(b.high) - Number(b.low))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (!ranges.length) return null;
  const mid = Math.floor(ranges.length / 2);
  return ranges.length % 2 ? ranges[mid] : (ranges[mid - 1] + ranges[mid]) / 2;
}

module.exports = {
  mean,
  variance,
  std,
  logReturns,
  linreg,
  autocorrLag1,
  hurstExponent,
  pearson,
  realizedVariance,
  bipowerVariation,
  jumpShare,
  parkinsonVol,
  ewmaMoments,
  kalmanDrift,
  medianBarRange,
};
