/**
 * Θ — ensemble path probability from ~3h chart dynamics.
 * Outputs (pNet, M, kappa) for ENTER/SKIP — not a price forecast.
 *
 * Models: GBM analytic, bootstrap MC, OU (when mean-reverting), jump discount.
 */

const {
  logReturns,
  hurstExponent,
  jumpShare,
  parkinsonVol,
  ewmaMoments,
  kalmanDrift,
  medianBarRange,
  mean,
  std,
} = require('./stats');
const { barrierHitProb, estimateDriftVol, monteCarloReach } = require('./barrier');
const { fitOU, monteCarloOUReach, ouPriorFromReturns } = require('./ou');

function clamp01(x) {
  return Math.max(0.01, Math.min(0.99, x));
}

function windowCloses(bars, n) {
  const closes = (bars || []).map((b) => b.close).filter((x) => Number.isFinite(x));
  if (!closes.length) return [];
  return closes.slice(-Math.min(n, closes.length));
}

/**
 * Core Θ evaluator.
 */
function evaluateTheta({
  side,
  entry,
  stopLoss,
  takeProfit,
  barsM5,
  barsM1 = null,
  spreadPips = null,
  pipSize = null,
  cfg = {},
}) {
  const winBars = cfg.mathWindowBars ?? 36; // ~3h on M5
  const closes = windowCloses(barsM5, Math.max(winBars, cfg.mathLookback ?? 64));
  if (closes.length < 30) {
    return {
      ok: false,
      reason: 'theta: need ≥30 M5 bars',
      pReach: 0,
      expectancyR: 0,
      kappa: 0,
      scoreAdj: -20,
    };
  }

  if (!entry || !stopLoss || !takeProfit || !side) {
    return { ok: false, reason: 'theta: missing levels', pReach: 0, kappa: 0, scoreAdj: -20 };
  }

  const distSl = Math.abs(entry - stopLoss);
  const distTp = Math.abs(takeProfit - entry);
  if (!(distSl > 0) || !(distTp > 0)) {
    return { ok: false, reason: 'theta: invalid SL/TP', pReach: 0, kappa: 0, scoreAdj: -20 };
  }

  const rets = logReturns(closes);
  const H = hurstExponent(closes);
  const J = jumpShare(rets);
  const park = parkinsonVol((barsM5 || []).slice(-winBars));
  const ewma = ewmaMoments(rets, cfg.mathEwmaAlpha ?? 0.94);
  const kalman = kalmanDrift(rets);
  const dv = estimateDriftVol(closes, winBars);

  // --- Microstructure: stop must cover ≥ N typical bar ranges ---
  const medRange = medianBarRange(barsM5, 24);
  const microMin = cfg.mathMicroMinBarsInStop ?? 1.5;
  let microOk = true;
  let microReason = null;
  if (medRange != null && medRange > 0) {
    const barsInStop = distSl / medRange;
    if (barsInStop < microMin) {
      microOk = false;
      microReason = `micro stop ${barsInStop.toFixed(2)} bars < ${microMin}`;
    }
  }
  // M1 tick noise if available
  if (microOk && barsM1?.length >= 20 && (cfg.mathMicroMinM1 ?? 3) > 0) {
    const m1Range = medianBarRange(barsM1, 30);
    if (m1Range != null && distSl < m1Range * (cfg.mathMicroMinM1 ?? 3)) {
      microOk = false;
      microReason = `micro SL < ${cfg.mathMicroMinM1 ?? 3}×M1 range`;
    }
  }

  // --- Model votes ---
  const votes = [];

  // 1) GBM analytic (Kalman/EWMA drift preferred)
  let muPrice = dv?.mu ?? 0;
  let sigmaPrice = dv?.sigma ?? 0;
  if (kalman?.mu != null && closes.length) {
    const px = closes[closes.length - 1];
    muPrice = px * kalman.mu;
  } else if (ewma?.mu != null && closes.length) {
    muPrice = closes[closes.length - 1] * ewma.mu;
  }
  if (park != null && closes.length) {
    const px = closes[closes.length - 1];
    const parkPrice = px * park;
    if (parkPrice > 0) sigmaPrice = sigmaPrice > 0 ? 0.5 * sigmaPrice + 0.5 * parkPrice : parkPrice;
  }
  // Jump inflate σ
  if (J != null && J > 0.15 && sigmaPrice > 0) {
    sigmaPrice *= 1 + (cfg.mathJumpSigmaK ?? 1.2) * J;
  }

  const muSide = side === 'long' ? muPrice : -muPrice;
  const pGbm = barrierHitProb(distSl, distTp, muSide, sigmaPrice);
  if (pGbm != null && Number.isFinite(pGbm)) {
    votes.push({ name: 'gbm', p: clamp01(pGbm), w: 1 });
  }

  // 2) Bootstrap MC
  const mc = monteCarloReach({
    entry,
    stopLoss,
    takeProfit,
    side,
    closes,
    paths: cfg.mathMcPaths ?? 400,
    maxBars: cfg.mathMcMaxBars ?? 36,
    lookback: Math.min(closes.length, cfg.mathLookback ?? 80),
  });
  if (mc && Number.isFinite(mc.pTp)) {
    votes.push({ name: 'mc', p: clamp01(mc.pTp), w: 1 });
  }

  // 3) OU when mean-reverting
  const ou = fitOU(closes);
  let pOu = null;
  if (ou?.meanReverting && (H == null || H < (cfg.mathOuHurstMax ?? 0.52))) {
    const ouMc = monteCarloOUReach({
      entry,
      stopLoss,
      takeProfit,
      side,
      ou,
      paths: cfg.mathOuPaths ?? 280,
      maxBars: cfg.mathMcMaxBars ?? 36,
    });
    if (ouMc && Number.isFinite(ouMc.pTp)) {
      pOu = clamp01(ouMc.pTp);
      votes.push({ name: 'ou', p: pOu, w: H != null && H < 0.45 ? 1.35 : 1 });
    }
  } else if (H != null && H < 0.48) {
    const prior = ouPriorFromReturns(closes, side);
    if (prior != null) {
      pOu = prior;
      votes.push({ name: 'ou_prior', p: prior, w: 0.6 });
    }
  }

  if (!votes.length) {
    return {
      ok: false,
      reason: 'theta: no model votes',
      pReach: 0,
      expectancyR: 0,
      kappa: 0,
      scoreAdj: -15,
      hurst: H,
      jumpShare: J,
    };
  }

  const wSum = votes.reduce((s, v) => s + v.w, 0);
  let pGross = votes.reduce((s, v) => s + v.p * v.w, 0) / wSum;

  // Drift significance: if Kalman says insignificant, shrink toward 0.5
  if (kalman && !kalman.significant) {
    pGross = 0.65 * pGross + 0.35 * 0.5;
  }

  // Jump hard penalty
  if (J != null && J > (cfg.mathMaxJumpShare ?? 0.35)) {
    return {
      ok: false,
      reason: `theta: jump share ${(J * 100).toFixed(0)}% > ${((cfg.mathMaxJumpShare ?? 0.35) * 100).toFixed(0)}%`,
      pReach: pGross,
      expectancyR: 0,
      kappa: 0,
      scoreAdj: -18,
      hurst: H,
      jumpShare: J,
      votes,
      microOk,
    };
  }
  if (J != null && J > 0.2) {
    pGross *= 1 - (cfg.mathJumpPDiscount ?? 0.25) * (J - 0.2);
  }

  // Friction from spread vs stop distance
  let friction = 0;
  if (spreadPips != null && pipSize != null && pipSize > 0 && distSl > 0) {
    const spreadPrice = spreadPips * pipSize;
    friction = Math.min(0.45, (cfg.mathFrictionK ?? 0.55) * (spreadPrice / distSl));
  } else if (spreadPips != null && distSl > 0 && entry > 0) {
    // approximate pip for non-JPY as 1e-4
    const approxPip = String(entry).includes('.') && entry < 50 ? 0.0001 : 0.01;
    const spreadPrice = spreadPips * approxPip;
    friction = Math.min(0.45, (cfg.mathFrictionK ?? 0.55) * (spreadPrice / distSl));
  }
  const pNet = clamp01(pGross * (1 - friction));

  // Kappa = model agreement
  const ps = votes.map((v) => v.p);
  const pMean = mean(ps);
  const pStd = std(ps) || 0;
  const kappa = clamp01(1 - pStd * (cfg.mathKappaScale ?? 2.2));

  const rr = distTp / distSl;
  const expectancyR = pNet * rr - (1 - pNet) * 1;

  const minP = cfg.mathMinPReach ?? 0.52;
  const minM = cfg.mathMinExpectancyR ?? 0.05;
  const minK = cfg.mathMinKappa ?? 0.55;

  let scoreAdj = 0;
  const notes = [];
  if (H != null) notes.push(`H=${H.toFixed(2)}`);
  if (J != null) notes.push(`J=${(J * 100).toFixed(0)}%`);
  if (kalman) notes.push(kalman.significant ? `μz=${kalman.z.toFixed(1)}` : 'μ~0');
  notes.push(`κ=${kappa.toFixed(2)}`);
  if (friction > 0.02) notes.push(`fric=${(friction * 100).toFixed(0)}%`);

  if (H != null) {
    if (H < 0.45) scoreAdj += 3;
    else if (H > 0.6 && kalman?.significant) {
      const aligned = (side === 'long' && kalman.mu > 0) || (side === 'short' && kalman.mu < 0);
      scoreAdj += aligned ? 2 : -5;
    }
  }
  if (kappa >= 0.7) scoreAdj += 3;
  else if (kappa < minK) scoreAdj -= 6;
  if (!microOk) scoreAdj -= 12;

  const strict = cfg.mathGate !== false;
  const ok = !strict
    ? true
    : (
      microOk
      && pNet >= minP
      && expectancyR >= minM
      && kappa >= minK
      && scoreAdj > -14
    );

  const failBits = [];
  if (!microOk) failBits.push(microReason || 'micro');
  if (!(pNet >= minP)) failBits.push(`P=${(pNet * 100).toFixed(1)}%`);
  if (!(expectancyR >= minM)) failBits.push(`M=${expectancyR.toFixed(2)}R`);
  if (!(kappa >= minK)) failBits.push(`κ=${kappa.toFixed(2)}`);

  return {
    ok,
    pReach: pNet,
    pGross,
    expectancyR,
    kappa,
    rr,
    friction,
    hurst: H,
    jumpShare: J,
    scoreAdj,
    votes,
    ou: ou ? { meanReverting: ou.meanReverting, halfLifeBars: ou.halfLifeBars, theta: ou.theta } : null,
    kalman,
    ewma,
    microOk,
    microReason,
    medRange,
    notes,
    reason: ok
      ? `Θ OK P=${(pNet * 100).toFixed(1)}% M=${expectancyR.toFixed(2)}R κ=${kappa.toFixed(2)} ${notes.join(' ')}`
      : `Θ BLOCK ${failBits.join(' · ') || 'fail'} ${notes.join(' ')}`,
  };
}

module.exports = {
  evaluateTheta,
};
