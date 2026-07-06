const { detectRegime } = require('./regime');
const { classifyMarketRegime } = require('./regimeEngine');

/**
 * Which sides to score for this pair (5m trend + optional 1h-led when 5m is chop).
 */
function getEligibleSides(marketRegime, bars1h, cfg) {
  const out = [];
  const allowShort = cfg.allowShort !== false;

  if (marketRegime?.tradeAllowed && marketRegime.direction === 'long') {
    out.push({ side: 'long', mode: '5m', scoreBoost: 0 });
  }
  if (allowShort && marketRegime?.tradeAllowed && marketRegime.direction === 'short') {
    out.push({ side: 'short', mode: '5m', scoreBoost: 0 });
  }

  if (cfg.bidirectionalHtf === false || !bars1h || bars1h.length < 50) {
    return out;
  }

  const h1Trend = detectRegime(bars1h);
  const adx = h1Trend.adx ?? 0;
  const boost = cfg.bidirectionalHtfScoreBoost ?? 5;

  if (adx >= (cfg.bidirectionalHtfMinAdx ?? 22)) {
    if (h1Trend.regime === 'trend_up' && !out.some((s) => s.side === 'long')) {
      out.push({ side: 'long', mode: 'htf', scoreBoost: boost });
    }
    if (h1Trend.regime === 'trend_down' && !out.some((s) => s.side === 'short')) {
      out.push({ side: 'short', mode: 'htf', scoreBoost: boost });
    }
  }

  return out;
}

/** Synthetic regime context when entering on 1h while 5m is range. */
function regimeContextForSide(side, marketRegime, bars1h, entryMode) {
  if (entryMode === '5m') {
    return marketRegime;
  }
  const h1Trend = detectRegime(bars1h || []);
  return {
    ...marketRegime,
    marketRegime: 'trend',
    tradeAllowed: true,
    direction: side,
    reason: `1h ${h1Trend.regime} ADX ${h1Trend.adx ?? '—'} (HTF-led, 5m ${marketRegime?.marketRegime || '—'})`,
    adx: h1Trend.adx ?? marketRegime?.adx,
    h1Trend: side === 'long' ? 'up' : 'down',
    trend5: marketRegime?.trend5,
    htfLed: true,
  };
}

function checkSideGreenLight(side, layers, marketRegime, entryMode) {
  if (entryMode === '5m') {
    const { checkRegimeGreenLight } = require('./regimeGate');
    return checkRegimeGreenLight(marketRegime, layers, side);
  }
  const macroOk = layers.macro?.aligned;
  const localOk = layers.h1?.aligned && layers.m5?.aligned;
  if (!macroOk && !localOk) {
    return { ok: false, reason: 'HTF-led: macro/h1/m5 слабкі' };
  }
  return { ok: true, reason: 'HTF-led trend' };
}

/**
 * Rank cycle entries: prefer mix of long + short when balanceDirections enabled.
 */
function rankEntriesBalanced(entries, cfg) {
  const maxPerCycle = cfg.smartMaxEntriesPerCycle ?? 2;
  if (cfg.balanceDirections === false) {
    return entries.slice(0, maxPerCycle);
  }

  const buys = entries.filter((e) => e.action === 'BUY');
  const sells = entries.filter((e) => e.action === 'SELL');

  if (!buys.length || !sells.length) {
    return entries.slice(0, maxPerCycle);
  }

  const out = [buys[0], sells[0]];
  const rest = entries.filter((e) => e !== buys[0] && e !== sells[0]);
  for (const e of rest) {
    if (out.length >= maxPerCycle) break;
    out.push(e);
  }
  return out.slice(0, maxPerCycle);
}

module.exports = {
  getEligibleSides,
  regimeContextForSide,
  checkSideGreenLight,
  rankEntriesBalanced,
};
