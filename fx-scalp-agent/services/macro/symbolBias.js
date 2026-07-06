const { fetchYahooBars } = require('../market-data/yahooFx');
const { ema } = require('../analyzer/indicators');
const { round } = require('../utils');

async function fetchSymbolBias(symbol, label, interval = '1h', range = '1mo') {
  try {
    const chart = await fetchYahooBars(symbol, interval, range, 30);
    const closes = chart.bars.map((b) => b.close);
    const price = closes[closes.length - 1];
    const ema20 = ema(closes, 20);
    const prev = closes.length > 2 ? closes[closes.length - 2] : price;
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;

    let bias = 'neutral';
    if (ema20 != null) {
      if (price >= ema20) bias = 'up';
      else bias = 'down';
    } else if (changePct > 0.05) bias = 'up';
    else if (changePct < -0.05) bias = 'down';

    return {
      symbol: label || symbol,
      price: round(price, 4),
      ema20: ema20 != null ? round(ema20, 4) : null,
      changePct: round(changePct, 3),
      bias,
      source: chart.source,
    };
  } catch (e) {
    return { symbol: label || symbol, error: e.message, bias: 'neutral' };
  }
}

module.exports = { fetchSymbolBias };
