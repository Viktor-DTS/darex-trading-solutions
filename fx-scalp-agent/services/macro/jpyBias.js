const { fetchYahooBars } = require('../market-data/yahooFx');
const { ema } = require('../analyzer/indicators');
const { normPair, round } = require('../utils');

async function fetchJpyBiasSnapshot() {
  try {
    const chart = await fetchYahooBars('USDJPY', '1h', '3mo', 50);
    const closes = chart.bars.map((b) => b.close);
    const price = closes[closes.length - 1];
    const ema50 = ema(closes, 50);
    let bias = 'neutral';
    if (ema50 != null) {
      if (price > ema50) bias = 'jpy_weak';
      else if (price < ema50) bias = 'jpy_strong';
    }
    return {
      pair: 'USDJPY',
      price: round(price, 3),
      ema50: ema50 != null ? round(ema50, 3) : null,
      bias,
      source: chart.source,
    };
  } catch (e) {
    return { pair: 'USDJPY', error: e.message, bias: 'neutral' };
  }
}

function isJpyCross(pair) {
  const p = normPair(pair);
  return p.endsWith('JPY') && p.length === 6;
}

/** Long XXXJPY = bet on JPY strength. */
function jpyBlocksLong(jpy, pair) {
  if (!jpy || jpy.bias === 'neutral' || !isJpyCross(pair)) {
    return { blocked: false, reason: '' };
  }
  if (jpy.bias === 'jpy_weak') {
    return {
      blocked: true,
      reason: `USDJPY↑ (JPY слабкий) — long ${normPair(pair)} проти JPY-trend`,
    };
  }
  return { blocked: false, reason: '' };
}

/** Short XXXJPY = bet on JPY weakness. */
function jpyBlocksShort(jpy, pair) {
  if (!jpy || jpy.bias === 'neutral' || !isJpyCross(pair)) {
    return { blocked: false, reason: '' };
  }
  if (jpy.bias === 'jpy_strong') {
    return {
      blocked: true,
      reason: `USDJPY↓ (JPY сильний) — short ${normPair(pair)} проти JPY-trend`,
    };
  }
  return { blocked: false, reason: '' };
}

module.exports = {
  fetchJpyBiasSnapshot,
  jpyBlocksLong,
  jpyBlocksShort,
  isJpyCross,
};
