const { fetchYahooBars } = require('../market-data/yahooFx');
const { round } = require('../utils');

async function fetchDxySnapshot() {
  try {
    const chart = await fetchYahooBars('DX-Y.NYB', '5d', '1h', 1);
    const closes = chart.bars.map((b) => b.close);
    const price = chart.mid ?? chart.bars[closes.length - 1]?.close;
    const prev = closes.length > 2 ? closes[closes.length - 2] : price;
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    let bias = 'neutral';
    if (changePct > 0.05) bias = 'usd_strong';
    if (changePct < -0.05) bias = 'usd_weak';
    return {
      symbol: 'DXY',
      price: round(price, 3),
      changePct: round(changePct, 3),
      bias,
      source: chart.source,
    };
  } catch (e) {
    return { symbol: 'DXY', error: e.message, bias: 'neutral' };
  }
}

/** EUR/USD long headwind when DXY ripping higher. */
function dxyBlocksLong(dxy, pair) {
  if (!dxy || pair !== 'EURUSD') return { blocked: false, reason: '' };
  if (dxy.bias === 'usd_strong') {
    return { blocked: true, reason: `DXY strong (+${dxy.changePct}%) — EUR/USD long headwind` };
  }
  return { blocked: false, reason: '' };
}

module.exports = {
  fetchDxySnapshot,
  dxyBlocksLong,
};
