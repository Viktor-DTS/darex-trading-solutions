const config = require('../../../config');
const { fetchAnalysisBars } = require('../../market-data');
const { normPair, round, isInUtcSession, pipsToPrice } = require('../../utils');
const { isNewsBlackout } = require('../../calendar');
const { getSpreadPips } = require('../../executor/pricing');
const { getSessionProfile } = require('../../learning/sessionAdapt');
const { detectLiquiditySweep } = require('./sweep');
const { computeDailyBias, loadDxyCached } = require('./bias');
const { evaluateTradeMath } = require('../math/pathExpectancy');
const {
  appendCharlieSetup,
  charlieSetupId,
  isDuplicateSetup,
  sweepKeyFromSignal,
} = require('./setupJournal');

const dxyCache = { at: 0, data: null };

function isFxWeekend(now = new Date()) {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Soft close: Fri 21:00 UTC → Sun 22:00 UTC
  if (day === 6) return true;
  if (day === 5 && mins >= 21 * 60) return true;
  if (day === 0 && mins < 22 * 60) return true;
  return false;
}

/**
 * Activity-driven mode (default): always trade when pairs move — no London/NY clock gate.
 * Optional legacy kill-zones if FX_CHARLIE_ALWAYS_ON=0.
 */
function getCharlieWindow(now = new Date(), cfg = {}) {
  const alwaysOn = cfg.charlieAlwaysOn !== false;

  if (alwaysOn) {
    if (isFxWeekend(now)) {
      return {
        name: 'weekend',
        active: false,
        scoreBoost: 0,
        riskMult: 1,
        label: 'weekend (FX closed)',
      };
    }
    return {
      name: 'activity',
      active: true,
      scoreBoost: 0,
      riskMult: 1,
      label: '24/5 activity hunt',
    };
  }

  const londonStart = cfg.charlieSessionStart ?? '07:00';
  const londonEnd = cfg.charlieSessionEnd ?? '09:00';
  const nyOn = cfg.charlieNyFallback !== false;
  const nyStart = cfg.charlieNyStart ?? '12:00';
  const nyEnd = cfg.charlieNyEnd ?? '15:00';
  const closeOn = cfg.charlieLondonClose !== false;
  const closeStart = cfg.charlieCloseStart ?? '15:00';
  const closeEnd = cfg.charlieCloseEnd ?? '17:00';

  if (isInUtcSession(now, londonStart, londonEnd)) {
    return {
      name: 'london',
      active: true,
      scoreBoost: 0,
      riskMult: 1,
      label: `${londonStart}–${londonEnd} UTC`,
    };
  }
  if (nyOn && isInUtcSession(now, nyStart, nyEnd)) {
    return {
      name: 'ny',
      active: true,
      scoreBoost: cfg.charlieNyScoreBoost ?? 0,
      riskMult: cfg.charlieNyRiskMult ?? 0.85,
      label: `${nyStart}–${nyEnd} UTC`,
    };
  }
  if (closeOn && isInUtcSession(now, closeStart, closeEnd)) {
    return {
      name: 'london_close',
      active: true,
      scoreBoost: cfg.charlieCloseScoreBoost ?? 5,
      riskMult: cfg.charlieCloseRiskMult ?? 0.5,
      label: `${closeStart}–${closeEnd} UTC`,
    };
  }
  const windows = [`London ${londonStart}–${londonEnd}`];
  if (nyOn) windows.push(`NY ${nyStart}–${nyEnd}`);
  if (closeOn) windows.push(`Close ${closeStart}–${closeEnd}`);
  return {
    name: 'closed',
    active: false,
    scoreBoost: 0,
    riskMult: 1,
    label: windows.join(' + '),
  };
}

function isCharlieSession(now, cfg) {
  return getCharlieWindow(now, cfg).active;
}

/** Skip static london_open / ny_open blackouts that kill Judas; keep calendar/NFP. */
function charlieNewsCheck(now, cfg) {
  if (cfg.newsBlackout === false) return { blocked: false };
  const news = isNewsBlackout(now, cfg.newsBlackoutBufferMin ?? 0);
  if (!news.blocked) return news;
  if (cfg.charlieSkipStaticBlackout !== false) {
    const skipIds = new Set(['london_open', 'ny_open']);
    if (news.source === 'static' && skipIds.has(news.event)) {
      return { blocked: false, reason: '', skippedStatic: news.event };
    }
  }
  return news;
}

async function analyzePairCharlie(pairInput, options = {}) {
  const pair = normPair(pairInput || config.pair);
  const cfg = { ...config, ...options.config };
  const now = new Date();
  const session = getSessionProfile(now);
  const charlieWindow = getCharlieWindow(now, cfg);
  const inCharlieWindow = charlieWindow.active;
  // Activity mode: ignore sessionAdapt tradeAllowed; only weekend / news / setup matter
  const inSession = cfg.charlieAlwaysOn !== false
    ? inCharlieWindow
    : (inCharlieWindow && session.tradeAllowed);

  const news = charlieNewsCheck(now, cfg);

  const liveQuote = options.liveQuote || null;
  const minBars = cfg.capitalMinBars ?? 15;

  let m1;
  let m5;
  let h1;
  if (options.bars?.m1?.bars?.length >= minBars && options.bars?.m5?.bars?.length >= minBars) {
    m1 = options.bars.m1;
    m5 = options.bars.m5;
    h1 = options.bars.h1;
  } else {
    ({ m1, m5, h1 } = await fetchAnalysisBars(pair));
  }

  const pairSpread = getSpreadPips(pair, cfg);
  const quote = liveQuote ? {
    mid: liveQuote.mid,
    bid: liveQuote.bid,
    ask: liveQuote.ask,
    spreadPips: liveQuote.spreadPips ?? pairSpread,
  } : {
    mid: m1.mid,
    bid: m1.bid,
    ask: m1.ask,
    spreadPips: m1.spreadPips || pairSpread,
  };
  const effectiveSpreadPips = quote.spreadPips > 0 ? quote.spreadPips : pairSpread;

  let dxy = options.dxy || null;
  if (!dxy && cfg.charlieDxyBias !== false) {
    try {
      dxy = await loadDxyCached(dxyCache, cfg.charlieDxyCacheMs ?? 300000);
    } catch (_) {
      dxy = { bias: 'neutral' };
    }
  }

  const dailyBias = computeDailyBias(
    pair,
    h1?.bars,
    m5?.bars,
    quote.mid,
    dxy,
    cfg,
  );

  const blocks = [];
  if (!inCharlieWindow) {
    blocks.push(`CHARLIE: ${charlieWindow.label}`);
  } else if (cfg.charlieAlwaysOn === false && !session.tradeAllowed) {
    blocks.push(`session ${session.name} — не торгуємо`);
  }
  // NY: keep calendar blackouts (CPI/NFP); still skip only static ny_open if configured
  if (charlieWindow.name === 'ny' && cfg.charlieNyStrictNews !== false) {
    // force calendar check already in charlieNewsCheck — no extra
  }
  if (quote.spreadPips > cfg.maxSpreadPips) {
    blocks.push(`spread ${quote.spreadPips} > max ${cfg.maxSpreadPips} pips`);
  }
  if (news.blocked) blocks.push(`news blackout: ${news.reason}`);

  let signal = { action: 'SKIP', reason: 'pending', score: 0, side: null };
  if (!blocks.length) {
    signal = detectLiquiditySweep(
      m5.bars,
      h1?.bars,
      { ...quote, spreadPips: effectiveSpreadPips },
      pair,
      cfg,
      { dailyBias },
    );
  }

  let action = signal.action || 'SKIP';
  const baseMinScore = (cfg.charlieMinScore ?? 70) + (charlieWindow.scoreBoost || 0);
  let minScore = baseMinScore;

  // Dedup this concrete sweep — mark only after executor opens (worker)
  let setupId = null;
  if ((action === 'BUY' || action === 'SELL') && signal.level?.price != null) {
    const dayKey = new Date().toISOString().slice(0, 10);
    setupId = charlieSetupId(pair, signal.level.price, dayKey, sweepKeyFromSignal(signal));
    if (isDuplicateSetup(setupId, cfg.charlieSetupDedupMs ?? 45 * 60 * 1000)) {
      blocks.push(`duplicate setup ${setupId}`);
      action = 'SKIP';
      setupId = null;
    } else {
      signal.setupId = setupId;
    }
  }

  const stopPips = signal.stopPips ?? cfg.charlieStopPips ?? cfg.stopPips ?? 4.5;
  const targetPips = signal.targetPips ?? cfg.charlieTargetMinPips ?? cfg.targetPips ?? 12;

  let entry = signal.entry ?? null;
  let stopLoss = signal.stopLoss ?? null;
  let takeProfit = signal.takeProfit ?? null;
  let side = signal.side ?? null;

  const digits = pair.includes('JPY') ? 3 : 5;
  if ((action === 'BUY' || action === 'SELL') && !entry) {
    if (action === 'BUY') {
      entry = round(quote.ask ?? quote.mid, digits);
      stopLoss = round(entry - pipsToPrice(stopPips, pair), digits);
      takeProfit = round(entry + pipsToPrice(targetPips, pair), digits);
      side = 'long';
    } else {
      entry = round(quote.bid ?? quote.mid, digits);
      stopLoss = round(entry + pipsToPrice(stopPips, pair), digits);
      takeProfit = round(entry - pipsToPrice(targetPips, pair), digits);
      side = 'short';
    }
  }

  /** @type {object|null} */
  let mathEval = null;
  if ((action === 'BUY' || action === 'SELL') && entry != null && stopLoss != null && takeProfit != null) {
    mathEval = evaluateTradeMath({
      side: side || (action === 'BUY' ? 'long' : 'short'),
      entry,
      stopLoss,
      takeProfit,
      barsM5: m5.bars,
      barsM1: m1?.bars || null,
      spreadPips: effectiveSpreadPips,
      pair,
      cfg,
    });
    // Strong math can slightly lower structural score floor
    if (mathEval.pReach >= (cfg.mathStrongPReach ?? 0.58)) {
      minScore = Math.min(minScore, cfg.mathScoreFloor ?? 68);
    }
    if ((signal.score ?? 0) < minScore) {
      action = 'SKIP';
      blocks.push(`setup score ${signal.score} < ${minScore}`);
    } else if (cfg.mathGate !== false && !mathEval.ok) {
      action = 'SKIP';
      blocks.push(mathEval.reason || 'math path gate');
    } else if (mathEval.ok) {
      signal.score = Math.max(0, Math.min(100, (signal.score ?? 0) + (mathEval.scoreAdj || 0)));
    }
  } else if ((action === 'BUY' || action === 'SELL') && (signal.score ?? 0) < minScore) {
    action = 'SKIP';
    blocks.push(`setup score ${signal.score} < ${minScore}`);
  }

  if (blocks.length && (action === 'BUY' || action === 'SELL' || action === 'WATCH')) {
    if (action !== 'WATCH') {
      action = 'SKIP';
    } else if (blocks.length) {
      action = 'SKIP';
    }
  }

  const rr = stopPips > 0 ? round(targetPips / stopPips, 2) : null;
  let reason = blocks.length
    ? `${signal.reason || 'blocked'}; ${blocks.join('; ')}`
    : (signal.reason || 'no setup');

  const hadSetup = signal.action === 'BUY' || signal.action === 'SELL';
  const setupDraft = hadSetup && action === 'SKIP'
    ? {
      action: signal.action,
      side: side || (signal.action === 'BUY' ? 'long' : 'short'),
      entry,
      stopLoss,
      takeProfit,
      stopPips,
      targetPips,
      score: signal.score ?? 0,
    }
    : null;

  if (action === 'BUY' || action === 'SELL') {
    reason += `; R:R≈${rr}:1 SL=${stopPips}p TP=${targetPips}p bias=${dailyBias.bias}`;
    if (mathEval) {
      reason += `; P(TP)=${((mathEval.pReach || 0) * 100).toFixed(0)}% M=${(mathEval.expectancyR ?? 0).toFixed(2)}R`;
      if (mathEval.kappa != null) reason += ` κ=${mathEval.kappa.toFixed(2)}`;
    }
  }

  const features = {
    ...(signal.features || {}),
    level_kind: signal.level?.kind ?? signal.features?.level_kind,
    sweep_depth: signal.sweepDepthPips ?? signal.features?.sweep_depth,
    bias: dailyBias.bias,
    bias_score: dailyBias.score,
    dxy_bias: dailyBias.dxyBias,
    adx: options.adx ?? null,
    spread: effectiveSpreadPips,
    pair_rank: options.pairRank ?? null,
    hour_utc: now.getUTCHours(),
    p_reach: mathEval?.pReach ?? null,
    expectancy_r: mathEval?.expectancyR ?? null,
    kappa: mathEval?.kappa ?? null,
    jump_share: mathEval?.jumpShare ?? null,
    hurst: mathEval?.hurst ?? null,
    rsi: mathEval?.rsi ?? null,
  };

  const result = {
    pair,
    mode: 'charlie',
    signalEngine: 'charlie',
    timestamp: now.toISOString(),
    inSession,
    session: charlieWindow.name !== 'closed' ? charlieWindow.name : session.name,
    charlieWindow: charlieWindow.name,
    riskPerTradePct: (cfg.riskPerTradePct ?? 0.5) * (charlieWindow.riskMult || 1),
    spreadPips: quote.spreadPips,
    effectiveSpreadPips,
    quote: { bid: quote.bid, ask: quote.ask, mid: quote.mid },
    marketRegime: mathEval?.hurst != null && mathEval.hurst > 0.55 ? 'trend' : 'structure',
    regime: 'liquidity_sweep',
    action,
    side: (action === 'BUY' || action === 'SELL') ? side : null,
    score: signal.score ?? 0,
    reason,
    entry: (action === 'BUY' || action === 'SELL') ? entry : null,
    stopLoss: (action === 'BUY' || action === 'SELL') ? stopLoss : null,
    takeProfit: (action === 'BUY' || action === 'SELL') ? takeProfit : null,
    stopPips,
    targetPips,
    minTargetPips: cfg.charlieTargetMinPips ?? 10,
    breakEvenPips: cfg.breakevenAfterPips ?? 4,
    smart: {
      conviction: signal.score ?? 0,
      threshold: minScore,
      pass: (signal.score ?? 0) >= minScore && (mathEval ? mathEval.ok : true),
    },
    math: mathEval
      ? {
        pReach: mathEval.pReach,
        expectancyR: mathEval.expectancyR,
        hurst: mathEval.hurst,
        rsi: mathEval.rsi,
        ok: mathEval.ok,
        reason: mathEval.reason,
        notes: mathEval.notes,
      }
      : null,
    setupDraft,
    charlie: {
      level: signal.level ?? null,
      nearLevel: signal.nearLevel ?? (signal.level?.label
        ? {
          label: signal.level.label,
          pips: signal.sweepDepthPips != null ? round(signal.sweepDepthPips, 1) : 0,
        }
        : null),
      sweepDepthPips: signal.sweepDepthPips ?? null,
      rr,
      levels: signal.levels ?? [],
      bias: dailyBias,
      mss: signal.mss ?? null,
      fvg: signal.fvg ?? null,
      entryMode: signal.entryMode ?? null,
      setupId: signal.setupId ?? null,
      window: charlieWindow.name,
      riskMult: charlieWindow.riskMult,
      math: mathEval?.ok != null ? {
        pReach: mathEval.pReach,
        expectancyR: mathEval.expectancyR,
        hurst: mathEval.hurst,
      } : null,
      features,
    },
    features,
    newsBlackout: news.blocked ? news.reason : null,
    dataSource: liveQuote?.source || m1.source,
  };

  // Shadow journal — every analysis
  if (cfg.charlieShadowLog !== false) {
    try {
      appendCharlieSetup({
        pair,
        action: result.action,
        side: result.side,
        score: result.score,
        reason: result.reason,
        session: result.session,
        inSession: result.inSession,
        features,
        bias: dailyBias.bias,
        level: signal.level ?? null,
        stopPips: result.stopPips,
        targetPips: result.targetPips,
        math: result.math,
        theoretical: (action === 'BUY' || action === 'SELL' || action === 'WATCH')
          ? { entry, stopLoss, takeProfit, rr }
          : null,
        mathTheta: mathEval?.theta || null,
        kappa: mathEval?.kappa ?? null,
        jumpShare: mathEval?.jumpShare ?? null,
        spreadPips: effectiveSpreadPips,
        dataSource: result.dataSource,
      });
    } catch (_) { /* ignore disk errors */ }
  }

  return result;
}

module.exports = {
  analyzePairCharlie,
  isCharlieSession,
  getCharlieWindow,
  charlieNewsCheck,
  isFxWeekend,
};
