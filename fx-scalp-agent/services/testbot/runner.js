const { round, normPair, pipsToPrice } = require('../utils');

const { tradePnlUsd, pipValueUsd, calcUnitsForRisk } = require('../executor/pricing');

const { buildTradeFromAnalysis } = require('../executor/sim');



function convictionOf(a) {

  return a?.smart?.conviction ?? a?.score ?? 0;

}



/** Resolve entry from live BUY/SELL only (no math-blocked setupDraft by default). */
function resolveTestbotCandidate(a, minScore, cfg = {}) {
  const conv = convictionOf(a);
  if (conv < minScore) return null;

  if (a.action === 'BUY' || a.action === 'SELL') {
    return { ...a, _testbotAction: a.action, _testbotConv: conv };
  }

  // Live already rejected (MATH BLOCK / score) → setupDraft. Skip unless explicitly allowed.
  if (cfg.allowSetupDraft === true) {
    const draft = a.setupDraft;
    const reason = String(a.reason || '');
    if (/MATH\s*BLOCK/i.test(reason)) return null;
    if (draft?.action === 'BUY' || draft.action === 'SELL') {
      return {
        ...a,
        action: draft.action,
        side: draft.side,
        entry: draft.entry,
        stopLoss: draft.stopLoss,
        takeProfit: draft.takeProfit,
        stopPips: draft.stopPips ?? a.stopPips,
        _testbotAction: draft.action,
        _testbotConv: conv,
        _fromDraft: true,
      };
    }
  }

  return null;
}



function filterTestbotSignals(analyses, cfg) {
  const minScore = cfg.minScore ?? 70;
  const out = [];
  const seen = new Set();
  for (const a of analyses || []) {
    const c = resolveTestbotCandidate(a, minScore, cfg);
    if (!c) continue;
    const pair = normPair(c.pair);
    if (seen.has(pair)) continue;
    seen.add(pair);
    out.push(c);
  }
  return out.sort((x, y) => (y._testbotConv ?? 0) - (x._testbotConv ?? 0));
}



function flipAction(action) {

  if (action === 'BUY') return 'SELL';

  if (action === 'SELL') return 'BUY';

  return action;

}



function maxNetStopLossUsd(cfg) {

  const comm = cfg.simCommissionUsd ?? 0.05;

  const cap = cfg.maxStopLossUsd ?? 10;

  return round(cap + comm, 2);

}



/** SL price so gross loss ≈ maxStopLossUsd (net ≈ -(maxStopLossUsd + commission)). */

function stopLossFromUsdCap(entry, side, pair, units, cfg) {

  const digits = pair.includes('JPY') ? 3 : 5;

  const maxStopUsd = cfg.maxStopLossUsd ?? 10;

  const pipVal = pipValueUsd(units, pair, entry) || 0.001;

  const lossPips = maxStopUsd / pipVal;

  const isShort = side === 'short' || side === 'SELL';

  if (isShort) {

    return round(entry + pipsToPrice(lossPips, pair), digits);

  }

  return round(entry - pipsToPrice(lossPips, pair), digits);

}



function tightenStopLoss(entry, side, stopA, stopB, pair) {

  const isShort = side === 'short';

  if (stopA == null) return stopB;

  if (stopB == null) return stopA;

  if (isShort) return Math.min(stopA, stopB);

  return Math.max(stopA, stopB);

}



function prepareTestbotAnalysis(source, cfg) {

  const signalAction = source._testbotAction || source.action;

  if (signalAction !== 'BUY' && signalAction !== 'SELL') return null;



  const invert = cfg.invertDirection === true;

  const action = invert ? flipAction(signalAction) : signalAction;



  const pair = normPair(source.pair);

  const digits = pair.includes('JPY') ? 3 : 5;

  const quote = source.quote || {};

  const stopPips = cfg.stopPips ?? 3;

  const wideTpPips = cfg.wideTpPips ?? 40;

  const isShort = action === 'SELL';



  let entry = source.entry;

  if (entry == null || invert) {

    entry = isShort

      ? round(quote.bid ?? quote.mid, digits)

      : round(quote.ask ?? quote.mid, digits);

  }



  const stopFromPips = isShort

    ? round(entry + pipsToPrice(stopPips, pair), digits)

    : round(entry - pipsToPrice(stopPips, pair), digits);



  const side = isShort ? 'short' : 'long';

  const units = calcUnitsForRisk(

    cfg.equityUsd ?? 1000,

    cfg.riskPerTradePct ?? 0.35,

    stopPips,

    pair,

    entry,

  );

  const stopFromUsd = stopLossFromUsdCap(entry, side, pair, units, cfg);

  const stopLoss = tightenStopLoss(entry, side, stopFromPips, stopFromUsd, pair);



  const takeProfit = isShort

    ? round(entry - pipsToPrice(wideTpPips, pair), digits)

    : round(entry + pipsToPrice(wideTpPips, pair), digits);



  return {

    ...source,

    pair,

    action,

    side,

    entry,

    stopLoss,

    takeProfit,

    stopPips,

    targetPips: wideTpPips,

    units,

    quote,

    signalEngine: 'testbot',

    score: source._testbotConv ?? convictionOf(source),

    testbotSignalAction: signalAction,

    testbotInverted: invert,

    testbotMaxStopUsd: maxNetStopLossUsd(cfg),

  };

}



function buildTestbotTrade(analysis, cfg) {

  const simCfg = {

    ...cfg,

    equityUsd: cfg.equityUsd ?? 1000,

    riskPerTradePct: cfg.riskPerTradePct ?? 0.35,

    stopPips: cfg.stopPips ?? 3,

    simCommissionUsd: cfg.simCommissionUsd ?? 0.05,

    breakevenEnabled: false,

  };

  const trade = buildTradeFromAnalysis(analysis, simCfg);

  if (analysis.stopLoss != null) {

    trade.stopLoss = analysis.stopLoss;

  }

  if (analysis.units > 0) {

    trade.units = analysis.units;

  }

  return {

    ...trade,

    botKind: 'testbot',

    targetUsd: cfg.targetUsd ?? 1,

    partialUsd: cfg.partialUsd ?? 0.5,

    partialAfterMs: cfg.partialAfterMs ?? 600000,

    maxHoldMs: cfg.maxHoldMs ?? 900000,

    maxStopLossUsd: cfg.maxStopLossUsd ?? 10,

    maxNetStopUsd: analysis.testbotMaxStopUsd ?? maxNetStopLossUsd(cfg),

    entryConviction: analysis.score ?? 0,

  };

}



function unrealizedPnlUsd(trade, quote, commissionUsd = 0) {

  const bid = quote.bid ?? quote.mid;

  const ask = quote.ask ?? quote.mid;

  if (bid == null || ask == null) return null;

  const exit = trade.side === 'short' ? ask : bid;

  const { pnlUsd } = tradePnlUsd(trade, exit, commissionUsd);

  return pnlUsd;

}



/**

 * USD scalp exits: $1 target, partial after timeout, SL pip + USD cap (comm + $1).

 * @returns {{ action: 'hold'|'close', reason?: string, exitPrice?: number }}

 */

function evaluateTestbotExit(trade, quote, cfg) {
  const bid = quote.bid ?? quote.mid;
  const ask = quote.ask ?? quote.mid;
  if (bid == null || ask == null) return { action: 'hold' };

  const exitPrice = trade.side === 'short' ? ask : bid;
  const ageMs = Date.now() - (trade.openedAt || 0);
  const comm = cfg.simCommissionUsd ?? 0.05;
  const pnl = unrealizedPnlUsd(trade, quote, 0);
  const netPnl = pnl != null ? pnl - comm : null;
  const maxNetStop = trade.maxNetStopUsd ?? maxNetStopLossUsd(cfg);

  if (netPnl != null) {
    trade.peakNetPnlUsd = Math.max(trade.peakNetPnlUsd ?? netPnl, netPnl);
  }

  if (netPnl != null && netPnl <= -maxNetStop) {
    // Не різати на 1-му тіку: short entry=bid, mark=ask → одразу −spread ≥ SL
    const rawGrace = cfg.stopGraceMs != null ? Number(cfg.stopGraceMs) : Number(process.env.FX_TESTBOT_STOP_GRACE_MS);
    const graceMs = Number.isFinite(rawGrace) ? rawGrace : 30000;
    if (ageMs < graceMs) {
      return { action: 'hold' };
    }
    return { action: 'close', reason: 'stop_usd', exitPrice };
  }

  if (trade.side === 'short') {
    if (ask >= trade.stopLoss) {
      return { action: 'close', reason: 'stop', exitPrice: trade.stopLoss };
    }
  } else if (bid <= trade.stopLoss) {
    return { action: 'close', reason: 'stop', exitPrice: trade.stopLoss };
  }

  const targetUsd = trade.targetUsd ?? cfg.targetUsd ?? 5;
  const partialUsd = trade.partialUsd ?? cfg.partialUsd ?? 2.5;
  const partialAfterMs = trade.partialAfterMs ?? cfg.partialAfterMs ?? 600000;
  const earlyPartialUsd = Number.isFinite(cfg.earlyPartialUsd)
    ? cfg.earlyPartialUsd
    : (Number(process.env.FX_TESTBOT_EARLY_PARTIAL_USD) || 1.5);
  const earlyPartialMs = Number.isFinite(cfg.earlyPartialMs)
    ? cfg.earlyPartialMs
    : (Number(process.env.FX_TESTBOT_EARLY_PARTIAL_MS) || 180000);
  const protectPeakUsd = Number.isFinite(cfg.protectPeakUsd)
    ? cfg.protectPeakUsd
    : (Number(process.env.FX_TESTBOT_PROTECT_PEAK_USD) || 1.5);
  const protectFloorUsd = Number.isFinite(cfg.protectFloorUsd)
    ? cfg.protectFloorUsd
    : (Number(process.env.FX_TESTBOT_PROTECT_FLOOR_USD) || 0.5);
  const maxHoldMs = trade.maxHoldMs ?? cfg.maxHoldMs ?? 900000;
  const extendMs = Number.isFinite(cfg.holdExtendMs)
    ? cfg.holdExtendMs
    : (Number(process.env.FX_TESTBOT_HOLD_EXTEND_MS) || 300000);

  if (netPnl != null && netPnl >= targetUsd) {
    return { action: 'close', reason: 'target_usd', exitPrice };
  }

  // Early bank: small green after 3m (debate: don't wait 10m for full partial)
  if (
    ageMs >= earlyPartialMs
    && netPnl != null
    && netPnl >= earlyPartialUsd
    && netPnl < targetUsd
  ) {
    return { action: 'close', reason: 'partial_usd', exitPrice };
  }

  if (ageMs >= partialAfterMs && netPnl != null && netPnl >= partialUsd) {
    return { action: 'close', reason: 'partial_usd', exitPrice };
  }

  // Protect green: був peak ≥ $1.5, відкат, але ще ≥ $0.5 → банк
  const peak = trade.peakNetPnlUsd;
  if (
    peak != null
    && peak >= protectPeakUsd
    && netPnl != null
    && netPnl >= protectFloorUsd
    && netPnl <= peak - protectFloorUsd
  ) {
    return { action: 'close', reason: 'protect_green', exitPrice };
  }

  // CUT_STALE: довго в мінусі без early-bank peak → ріжемо до повного −$5 / time_exit −$4
  const cutStaleMs = Number.isFinite(cfg.cutStaleMs)
    ? cfg.cutStaleMs
    : (Number(process.env.FX_TESTBOT_CUT_STALE_MS) || 480000);
  const cutStaleUsd = Number.isFinite(cfg.cutStaleUsd)
    ? cfg.cutStaleUsd
    : (Number(process.env.FX_TESTBOT_CUT_STALE_USD) || 1.5);
  if (
    cutStaleMs > 0
    && ageMs >= cutStaleMs
    && netPnl != null
    && netPnl <= -cutStaleUsd
    && (peak == null || peak < earlyPartialUsd)
  ) {
    return { action: 'close', reason: 'cut_stale', exitPrice };
  }

  const holdLimit = maxHoldMs + (trade.holdExtended ? extendMs : 0);
  if (ageMs >= holdLimit) {
    if (netPnl != null && netPnl >= protectFloorUsd) {
      return { action: 'close', reason: 'time_flat', exitPrice };
    }
    // Один раз продовжити, якщо майже flat (не глибокий мінус)
    if (!trade.holdExtended && netPnl != null && netPnl > -1) {
      trade.holdExtended = true;
      return { action: 'hold' };
    }
    return { action: 'close', reason: netPnl != null && netPnl >= 0 ? 'time_flat' : 'time_exit', exitPrice };
  }

  return { action: 'hold' };
}



function closeTestbotTrade(executor, trade, exitPrice, reason, cfg) {

  trade.lastBid = trade.lastBid ?? exitPrice;

  trade.lastAsk = trade.lastAsk ?? exitPrice;

  if (reason === 'stop' || reason === 'stop_usd') {

    return executor._close(trade.pair, exitPrice, reason);

  }

  return executor._close(trade.pair, exitPrice, reason);

}



module.exports = {

  filterTestbotSignals,

  prepareTestbotAnalysis,

  buildTestbotTrade,

  evaluateTestbotExit,

  unrealizedPnlUsd,

  closeTestbotTrade,

  convictionOf,

  maxNetStopLossUsd,

  resolveTestbotCandidate,

};


