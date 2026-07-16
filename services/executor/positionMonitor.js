const { pipSize, round } = require('../utils');
const { favorablePips } = require('./breakeven');

/**
 * Active trade management — conv decay, time scratch, good-enough exit, dynamic TP.
 */
function trackPositionPeaks(trade, quote) {
  const bid = quote.bid ?? quote.mid;
  const ask = quote.ask ?? quote.mid;
  const fav = favorablePips(trade, bid, ask);
  const prevPeak = trade.peakFavPips ?? fav;
  if (fav > prevPeak) trade.peakFavPips = round(fav, 2);
  return fav;
}

function computeLiveMetrics(trade, quote) {
  const bid = quote.bid ?? quote.mid;
  const ask = quote.ask ?? quote.mid;
  const fav = favorablePips(trade, bid, ask);
  const ps = pipSize(trade.pair);
  const mark = trade.side === 'short' ? (ask ?? bid) : (bid ?? ask);
  const pipsToTp = trade.takeProfit != null && mark != null
    ? round((trade.side === 'short' ? mark - trade.takeProfit : trade.takeProfit - mark) / ps, 2)
    : null;
  const pipsToSl = trade.stopLoss != null && mark != null
    ? round((trade.side === 'short' ? trade.stopLoss - mark : mark - trade.stopLoss) / ps, 2)
    : null;
  return { fav, mark, pipsToTp, pipsToSl };
}

/**
 * Pull TP toward market to bank a small profit when conviction dies.
 * Long: new TP below old TP but still above mark (and preferably ≥ entry).
 * Short: new TP above old TP but still below mark.
 */
function tryTightenTakeProfit(trade, metrics, cfg, detail) {
  const mark = metrics.mark;
  if (mark == null || trade.takeProfit == null) return null;
  const ps = pipSize(trade.pair);
  if (!ps) return null;

  const bufferPips = cfg.posDynamicTpBufferPips ?? 0.3;
  const buffer = bufferPips * ps;
  const digits = trade.pair.includes('JPY') ? 3 : 5;

  let newTp;
  let tightens;
  if (trade.side === 'short') {
    newTp = round(mark - buffer, digits);
    tightens = newTp > trade.takeProfit && newTp < mark;
  } else {
    newTp = round(mark + buffer, digits);
    tightens = newTp < trade.takeProfit && newTp > mark;
  }

  if (!tightens) return null;

  // Only lock profit (or breakeven+buffer) — never set a worse-than-entry TP unless already underwater
  const locksProfit = trade.side === 'short'
    ? newTp <= trade.entry
    : newTp >= trade.entry;

  if (!locksProfit) return null;

  return {
    action: 'lower_tp',
    reason: 'dynamic_tp',
    detail,
    newTakeProfit: newTp,
    metrics,
  };
}

function evaluatePositionAction(trade, liveAnalysis, quote, cfg = {}) {
  if (cfg.positionMgmt === false) return { action: 'hold' };

  const metrics = computeLiveMetrics(trade, quote);
  const fav = trackPositionPeaks(trade, quote);
  const entryConv = trade.entryConviction ?? trade.score ?? 0;
  const liveConv = liveAnalysis?.conviction ?? entryConv;
  const ageMs = Date.now() - (trade.openedAt || 0);

  const convDecay = cfg.posConvDecay ?? 15;
  const convDecayLoss = cfg.posConvDecayLoss ?? 8;
  const profitDecayConv = cfg.posProfitDecayConv ?? 10;
  const minProfit = cfg.posMinProfitPips ?? 0.5;
  const goodEnoughTp = cfg.posGoodEnoughTpPips ?? 0.5;
  const pullbackPips = cfg.posPullbackPips ?? 0.3;
  const scratchMs = cfg.posTimeScratchMs ?? 300000;
  const scratchLossMs = cfg.posTimeScratchLossMs ?? 180000;
  const scratchMaxLossPips = cfg.posScratchMaxLossPips ?? -0.5;
  const maxMs = cfg.posTimeMaxMs ?? 600000;
  const progressPips = cfg.posProgressPips ?? 0.5;
  const tpDecayConv = cfg.posTpDecayConv ?? 8;
  const dynamicMinFav = cfg.posDynamicTpMinFavPips ?? 0;

  const convDrop = entryConv - liveConv;

  // In profit (or flat+) and setup decayed → pull TP in first (bank green), don't wait for far TP
  if (
    cfg.posDynamicTp !== false
    && fav >= dynamicMinFav
    && convDrop >= tpDecayConv
  ) {
    const tightened = tryTightenTakeProfit(
      trade,
      metrics,
      cfg,
      `conv ${entryConv}→${liveConv}, fav ${fav}p → tighten TP`,
    );
    if (tightened) return tightened;
  }

  // Was green, now still slightly green but setup dead → close to bank
  if (fav >= minProfit && convDrop >= profitDecayConv) {
    return {
      action: 'close',
      reason: 'profit_decay',
      detail: `+${fav}p conv ${entryConv}→${liveConv}`,
      metrics,
    };
  }

  // Underwater + live setup gone → cut before full SL
  if (fav < 0 && convDrop >= convDecayLoss) {
    return {
      action: 'close',
      reason: 'conv_decay',
      detail: `в мінусі ${fav}p, conv ${entryConv}→${liveConv} (−${convDrop})`,
      metrics,
    };
  }

  if (ageMs >= scratchLossMs && fav <= scratchMaxLossPips) {
    return {
      action: 'close',
      reason: 'time_scratch',
      detail: `${Math.round(ageMs / 60000)}хв, ${fav}p — ранній scratch`,
      metrics,
    };
  }

  if (liveConv < entryConv - convDecay) {
    // Last chance: if green enough, tighten TP instead of hard close
    if (cfg.posDynamicTp !== false && fav >= dynamicMinFav) {
      const tightened = tryTightenTakeProfit(
        trade,
        metrics,
        cfg,
        `conv decay ${entryConv}→${liveConv}, tighten TP`,
      );
      if (tightened) return tightened;
    }
    return {
      action: 'close',
      reason: 'conv_decay',
      detail: `conv ${liveConv} < entry ${entryConv}−${convDecay}`,
      metrics,
    };
  }

  if (metrics.pipsToTp != null && metrics.pipsToTp <= goodEnoughTp) {
    trade.nearTpSeen = true;
    trade.nearTpFavPips = Math.max(trade.nearTpFavPips ?? 0, fav);
  }

  if (trade.nearTpSeen && fav >= minProfit && fav < (trade.nearTpFavPips ?? fav) - pullbackPips) {
    return {
      action: 'close',
      reason: 'good_enough',
      detail: `був біля TP (+${trade.nearTpFavPips}p), відкат → +${fav}p`,
      metrics,
    };
  }

  if (ageMs >= scratchMs && (trade.peakFavPips ?? 0) < progressPips) {
    return {
      action: 'close',
      reason: 'time_scratch',
      detail: `${Math.round(ageMs / 60000)}хв без прогресу (peak ${trade.peakFavPips ?? 0}p)`,
      metrics,
    };
  }

  if (ageMs >= maxMs) {
    return {
      action: 'close',
      reason: fav >= minProfit ? 'time_profit' : 'time_exit',
      detail: `${Math.round(ageMs / 60000)}хв max hold, ${fav >= 0 ? '+' : ''}${fav}p`,
      metrics,
    };
  }

  return { action: 'hold', metrics, liveConv, entryConv };
}

module.exports = {
  trackPositionPeaks,
  computeLiveMetrics,
  evaluatePositionAction,
  tryTightenTakeProfit,
};
