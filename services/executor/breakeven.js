const { pipSize, round } = require('../utils');

function favorablePips(trade, bid, ask) {
  const ps = pipSize(trade.pair);
  if (!ps || bid == null || ask == null) return 0;
  if (trade.side === 'short') {
    return round((trade.entry - ask) / ps, 2);
  }
  return round((bid - trade.entry) / ps, 2);
}

function applyBreakevenIfNeeded(trade, quote, cfg) {
  if (cfg.breakevenEnabled === false || trade.breakevenApplied) return false;
  const trigger = cfg.breakevenAfterPips ?? 2;
  const bid = quote.bid ?? quote.mid;
  const ask = quote.ask ?? quote.mid;
  const fav = favorablePips(trade, bid, ask);
  if (fav < trigger) return false;

  const ps = pipSize(trade.pair);
  const buffer = (cfg.breakevenBufferPips ?? 0.2) * ps;
  if (trade.side === 'short') {
    trade.stopLoss = round(trade.entry + buffer, 5);
  } else {
    trade.stopLoss = round(trade.entry - buffer, 5);
  }
  trade.breakevenApplied = true;
  trade.breakevenAtPips = fav;
  return true;
}

module.exports = {
  favorablePips,
  applyBreakevenIfNeeded,
};
