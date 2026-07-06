const { normPair } = require('../utils');

/** Does trade side align with post-release surprise bias for this pair? */
function surpriseAligns(pairInput, side, event) {
  if (!event || !side) return false;
  const pair = normPair(pairInput);
  const base = pair.slice(0, 3);
  const quote = pair.slice(3);
  const ccy = event.currency;
  let bias = Number(event.bias ?? event.surpriseBias ?? 0);
  if (!Number.isFinite(bias) || Math.abs(bias) < 0.05) {
    const surprise = Number(event.surprise);
    if (!Number.isFinite(surprise) || surprise === 0) return false;
    bias = Math.sign(surprise) * (event.direction ?? 1);
  }
  if (!ccy) return false;

  const baseStrong = ccy === base && bias > 0;
  const baseWeak = ccy === base && bias < 0;
  const quoteStrong = ccy === quote && bias < 0;
  const quoteWeak = ccy === quote && bias > 0;

  const wantLong = baseStrong || quoteWeak;
  const wantShort = baseWeak || quoteStrong;
  if (!wantLong && !wantShort) return false;
  return side === 'long' ? wantLong : wantShort;
}

function findPostNewsBoost(ctx) {
  const cfg = ctx.cfg || {};
  if (cfg.postNewsBoost === false) return null;

  const calendar = ctx.macro?.calendar;
  if (!calendar?.recent?.length || !ctx.side || !ctx.pair) return null;

  const windowMs = cfg.postNewsBoostWindowMs ?? 5400000;
  const now = Date.now();

  for (const ev of calendar.recent) {
    if (!ev.released) continue;
    if (!ev.strong && !ev.surpriseStrong) continue;
    if (now - ev.ts > windowMs) continue;
    if (!surpriseAligns(ctx.pair, ctx.side, ev)) continue;
    return {
      event: ev.title || ev.event || ev.kind || 'news',
      currency: ev.currency,
      convictionBoost: cfg.postNewsBoostConviction ?? 8,
      thresholdDrop: cfg.postNewsBoostThresholdDrop ?? 3,
    };
  }
  return null;
}

module.exports = {
  surpriseAligns,
  findPostNewsBoost,
};
