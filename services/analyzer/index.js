const config = require('../../config');
const { fetchAnalysisBars } = require('../market-data');
const { scorePullbackLong, scorePullbackShort } = require('./regime');
const { classifyMarketRegime } = require('./regimeEngine');
const { evaluateLayers } = require('./layerScore');
const { normPair, pipsToPrice, round, isInUtcSession } = require('../utils');
const { isNewsBlackout } = require('../calendar');
const { fetchMacroSnapshot } = require('../macro/snapshot');
const { getEffectiveConfig } = require('../learning/paramsStore');
const { getSessionProfile, applySessionToConfig } = require('../learning/sessionAdapt');
const { getPairDayStats } = require('../learning/pairStats');
const { getMinScoreForPair } = require('../risk/pairTier');
const { getSpreadPips, resolveTargetPips } = require('../executor/pricing');
const { checkRegimeGreenLight, computeSmartScore } = require('./smartScore');
const {
  getEligibleSides,
  regimeContextForSide,
  checkSideGreenLight,
} = require('./bidirectional');

function resolveSide(marketRegime, cfg) {
  if (!marketRegime.tradeAllowed || !marketRegime.direction) return null;
  if (marketRegime.direction === 'short' && cfg.allowShort === false) return null;
  return marketRegime.direction;
}

function scorePairForSide(bars1m, bars5m, quote, cfg, ctx, side, entryMeta = {}) {
  const entryMode = entryMeta.mode || '5m';
  const scoreBoost = entryMeta.scoreBoost ?? 0;
  const marketRegime = entryMeta.regimeCtx
    || regimeContextForSide(side, ctx.marketRegime, ctx.bars1h, entryMode);

  const pairStats = ctx.pairStats || (ctx.pair
    ? getPairDayStats(ctx.pair, {
      pauseAfterSl: cfg.smartPairPauseAfterSl ?? 3,
      minSideTrades: cfg.sideProfileMinTrades,
      sideLookback: cfg.sideProfileLookback,
      badSideWinRate: cfg.sideProfileBadWr,
      goodSideWinRate: cfg.sideProfileGoodWr,
      sideThresholdPenalty: cfg.sideProfileThresholdPenalty,
      sideConvictionBonus: cfg.sideProfileConvictionBonus,
      sideProfileMinWrGap: cfg.sideProfileMinWrGap,
    })
    : null);
  const sideProfile = pairStats?.sideProfile;

  if (sideProfile?.blockedSides?.[side]) {
    return {
      action: 'SKIP',
      side: null,
      score: 0,
      regime: marketRegime.trend5?.regime || marketRegime.marketRegime,
      reason: `side profile: ${sideProfile.blockReasons[side] || `${side} заблоковано`}`,
      regimeInfo: marketRegime.trend5,
      marketRegime,
      layers: null,
      layerEval: null,
      smart: null,
      pairStats,
      fundamental: null,
      entryMode,
      direction: side,
    };
  }

  const opts = {
    minBuyScore: cfg.minBuyScore,
    requireMomentum: cfg.requireMomentum !== false,
  };

  const pullback = side === 'long'
    ? scorePullbackLong(bars1m, bars5m, quote, opts)
    : scorePullbackShort(bars1m, bars5m, quote, opts);

  const layerEval = evaluateLayers({
    pair: ctx.pair,
    side,
    macro: ctx.macro,
    bars1h: ctx.bars1h,
    bars5m,
    bars1m,
    quote,
    marketRegime,
    cfg,
  });

  const smartMode = cfg.smartMode !== false;
  let action = 'SKIP';
  let score = Math.max(layerEval.compositeScore, pullback.score || 0);
  const reasons = [marketRegime.reason, layerEval.reason, pullback.reason];
  if (entryMode === 'htf') reasons.unshift('HTF-led entry');

  const effectiveSpread = quote.spreadPips > 0 ? quote.spreadPips : (ctx.effectiveSpreadPips ?? 0);
  const macroFund = layerEval.layers?.macro?.fundamental ?? null;

  let smart = null;
  if (smartMode && layerEval.layers) {
    smart = computeSmartScore({
      layerEval,
      fundamental: macroFund,
      marketRegime,
      spreadPips: effectiveSpread,
      pairStats,
      cfg,
      side,
      pair: ctx.pair,
      macro: ctx.macro,
    });
    if (scoreBoost > 0) {
      smart.conviction = Math.max(0, smart.conviction - scoreBoost);
      smart.threshold = smart.threshold + scoreBoost;
      smart.pass = smart.conviction >= smart.threshold;
    }
    score = smart.conviction;

    const green = checkSideGreenLight(side, layerEval.layers, marketRegime, entryMode);
    if (pairStats?.paused) {
      reasons.unshift(`pair pause: ${pairStats.pauseReason}`);
    } else if (!green.ok) {
      reasons.unshift(`regime gate: ${green.reason}`);
    } else if (!layerEval.pass) {
      reasons.unshift(`layers ${layerEval.alignedCount}/${layerEval.minRequired}`);
    } else if (!smart.pass) {
      const sideHint = sideProfile?.weakSide === side && sideProfile.thresholdAdjust?.[side]
        ? ` (+${sideProfile.thresholdAdjust[side]} weak side)`
        : '';
      reasons.unshift(`conviction ${smart.conviction} < ${smart.threshold}${sideHint}`);
    } else if (pullback.action === 'BUY' || pullback.action === 'SELL' || layerEval.alignedCount >= (cfg.minLayersAligned ?? 3)) {
      action = side === 'long' ? 'BUY' : 'SELL';
      if (pullback.action === 'SKIP') reasons.push('entry via layers (pullback soft)');
    } else if (smart.conviction >= smart.threshold - 6) {
      action = 'WATCH';
    }

    if (action === 'BUY' || action === 'SELL') {
      if (!green.ok || pairStats?.paused || !layerEval.pass || !smart.pass) {
        action = smart.conviction >= smart.threshold - 6 ? 'WATCH' : 'SKIP';
      }
    }
  } else if (layerEval.pass && (pullback.action === 'BUY' || pullback.action === 'SELL')) {
    const entryScore = Math.max(layerEval.compositeScore, pullback.score || 0);
    if (entryScore >= cfg.minBuyScore + scoreBoost) {
      action = side === 'long' ? 'BUY' : 'SELL';
    } else if (entryScore >= cfg.minBuyScore - 8) {
      action = 'WATCH';
    }
  } else if (layerEval.pass && pullback.action === 'SKIP') {
    const entryScore = Math.max(layerEval.compositeScore, pullback.score || 0);
    if (entryScore >= cfg.minBuyScore + scoreBoost
      && layerEval.alignedCount >= (cfg.minLayersAligned ?? 3)) {
      action = side === 'long' ? 'BUY' : 'SELL';
      reasons.push('entry via layers (pullback soft)');
    } else if (entryScore >= cfg.minBuyScore - 8) {
      action = 'WATCH';
    }
  } else if (!layerEval.pass) {
    reasons.unshift(`layers ${layerEval.alignedCount}/${layerEval.minRequired}`);
  }

  return {
    action,
    side: action === 'BUY' || action === 'SELL' ? side : null,
    score,
    regime: marketRegime.trend5?.regime || marketRegime.marketRegime,
    reason: reasons.filter(Boolean).join('; '),
    regimeInfo: marketRegime.trend5,
    marketRegime,
    layers: layerEval.layers,
    layerEval,
    smart,
    pairStats,
    fundamental: macroFund,
    idealFormula: smart?.formula,
    indicators: pullback.indicators,
    entryMode,
    direction: side,
  };
}

/** Score long + short; pick strongest actionable signal. */
function scorePairBidirectional(bars1m, bars5m, quote, cfg, ctx) {
  const marketRegime = ctx.marketRegime || classifyMarketRegime(bars5m, ctx.bars1h);
  const sides = cfg.bidirectional !== false
    ? getEligibleSides(marketRegime, ctx.bars1h, cfg)
    : [];

  if (!sides.length) {
    const legacySide = resolveSide(marketRegime, cfg);
    if (!legacySide) {
      return {
        action: 'SKIP',
        side: null,
        score: 0,
        regime: marketRegime.trend5?.regime || marketRegime.marketRegime,
        reason: marketRegime.reason,
        regimeInfo: marketRegime.trend5,
        marketRegime,
        layers: null,
        altSignal: null,
      };
    }
    return scorePairForSide(bars1m, bars5m, quote, cfg, ctx, legacySide, { mode: '5m' });
  }

  const scored = sides.map((meta) => {
    const regimeCtx = regimeContextForSide(meta.side, marketRegime, ctx.bars1h, meta.mode);
    return scorePairForSide(bars1m, bars5m, quote, cfg, ctx, meta.side, {
      mode: meta.mode,
      scoreBoost: meta.scoreBoost,
      regimeCtx,
    });
  });

  const actionable = scored.filter((s) => s.action === 'BUY' || s.action === 'SELL');
  const watch = scored.filter((s) => s.action === 'WATCH');
  const pool = actionable.length ? actionable : watch.length ? watch : scored;

  pool.sort((a, b) => (b.smart?.conviction ?? b.score) - (a.smart?.conviction ?? a.score));
  const best = pool[0] || scored[0];
  const alt = scored.find((s) => s !== best && s.direction !== best.direction);

  if (alt && (alt.action === 'BUY' || alt.action === 'SELL' || alt.action === 'WATCH')) {
    best.altSignal = {
      action: alt.action,
      side: alt.direction,
      score: alt.smart?.conviction ?? alt.score,
      reason: alt.reason,
      entryMode: alt.entryMode,
    };
  }

  return best;
}

function scorePairSignal(bars1m, bars5m, quote, cfg, ctx = {}) {
  if (cfg.bidirectional !== false) {
    return scorePairBidirectional(bars1m, bars5m, quote, cfg, ctx);
  }
  const marketRegime = ctx.marketRegime || classifyMarketRegime(bars5m, ctx.bars1h);
  const side = resolveSide(marketRegime, cfg);
  if (!side) {
    return {
      action: 'SKIP',
      side: null,
      score: 0,
      regime: marketRegime.trend5?.regime || marketRegime.marketRegime,
      reason: marketRegime.reason,
      regimeInfo: marketRegime.trend5,
      marketRegime,
      layers: null,
    };
  }
  return scorePairForSide(bars1m, bars5m, quote, cfg, ctx, side, { mode: '5m' });
}

async function analyzePair(pairInput, options = {}) {
  const pair = normPair(pairInput || config.pair);
  let cfg = getEffectiveConfig({ ...config, ...options.config });

  const session = getSessionProfile(new Date());
  cfg = applySessionToConfig(cfg, session);
  const scoreFloor = getMinScoreForPair(pair, cfg, session);
  if (scoreFloor.tier === 2) {
    cfg = {
      ...cfg,
      minBuyScore: scoreFloor.minBuyScore,
      minSellScore: scoreFloor.minSellScore,
    };
  }

  const liveQuote = options.liveQuote || null;
  const inSession = isInUtcSession(new Date(), cfg.sessionStartUtc, cfg.sessionEndUtc);
  const news = cfg.newsBlackout !== false
    ? isNewsBlackout(new Date(), cfg.newsBlackoutBufferMin ?? 0)
    : { blocked: false };

  const macro = options.macro !== undefined
    ? options.macro
    : (cfg.macroFilter !== false ? await fetchMacroSnapshot() : null);

  let m1;
  let m5;
  let h1;
  const minBars = config.capitalMinBars ?? 15;
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

  const marketRegime = classifyMarketRegime(m5.bars, h1?.bars);
  const signal = scorePairSignal(m1.bars, m5.bars, quote, cfg, {
    pair,
    macro,
    bars1h: h1?.bars,
    marketRegime,
    effectiveSpreadPips,
  });

  const spreadOk = quote.spreadPips <= cfg.maxSpreadPips;
  let action = signal.action;
  const blocks = [];

  if (!inSession || !session.tradeAllowed) {
    blocks.push(session.tradeAllowed ? 'outside session (UTC)' : `session ${session.name} — не торгуємо`);
  }
  if (!spreadOk) blocks.push(`spread ${quote.spreadPips} > max ${cfg.maxSpreadPips} pips`);
  if (news.blocked) blocks.push(`news blackout: ${news.reason}`);
  if (cfg.learned?.tradingPaused) {
    blocks.push(`learning pause: ${cfg.learned.pauseReason || 'edge weak'}`);
  }

  if (blocks.length && (action === 'BUY' || action === 'SELL' || action === 'WATCH')) {
    action = 'SKIP';
  }

  const stopPips = cfg.stopPips;
  const mid = quote.mid ?? m1.mid;
  const tpInfo = resolveTargetPips(pair, cfg, mid);
  const targetPips = tpInfo.targetPips;

  let entry = null;
  let stopLoss = null;
  let takeProfit = null;
  let side = signal.side ?? null;

  if (action === 'BUY') {
    entry = round(quote.ask ?? quote.mid, 5);
    stopLoss = round(entry - pipsToPrice(stopPips, pair), 5);
    takeProfit = round(entry + pipsToPrice(targetPips, pair), 5);
    side = 'long';
  } else if (action === 'SELL') {
    entry = round(quote.bid ?? quote.mid, 5);
    stopLoss = round(entry + pipsToPrice(stopPips, pair), 5);
    takeProfit = round(entry - pipsToPrice(targetPips, pair), 5);
    side = 'short';
  } else {
    side = null;
  }

  let reason = blocks.length
    ? `${signal.reason}; ${blocks.join('; ')}`
    : signal.reason;

  if ((action === 'BUY' || action === 'SELL') && targetPips > tpInfo.baseTargetPips) {
    reason += `; TP=${targetPips}p (min ${tpInfo.minTargetPips}p)`;
  }

  return {
    pair,
    mode: cfg.mode,
    timestamp: new Date().toISOString(),
    inSession,
    session: session.name,
    spreadPips: quote.spreadPips,
    effectiveSpreadPips,
    quote: { bid: quote.bid, ask: quote.ask, mid: quote.mid },
    marketRegime: signal.marketRegime?.marketRegime,
    regime: signal.regime,
    action,
    side,
    score: signal.score,
    reason,
    entry,
    stopLoss,
    takeProfit,
    stopPips,
    targetPips,
    minTargetPips: tpInfo.minTargetPips,
    breakEvenPips: tpInfo.breakEvenPips,
    minBuyScore: cfg.minBuyScore,
    minLayersAligned: cfg.minLayersAligned,
    layers: signal.layers,
    layerEval: signal.layerEval,
    smart: signal.smart,
    pairStats: signal.pairStats,
    fundamental: signal.fundamental,
    idealFormula: signal.idealFormula,
    altSignal: signal.altSignal,
    entryMode: signal.entryMode,
    learnedVersion: cfg.learned?.version ?? 0,
    indicators: signal.indicators,
    regimeInfo: signal.regimeInfo,
    macro,
    newsBlackout: news.blocked ? news.reason : null,
    dataSource: liveQuote?.source || m1.source,
  };
}

module.exports = {
  analyzePair,
  scorePairSignal,
  scorePairForSide,
  classifyMarketRegime,
};
