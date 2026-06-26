const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function fetchYahooChart(symbol, range = '1y', interval = '1d') {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DarexTradingBot/1.0)',
    },
  });
  if (!res.ok) {
    throw new Error(`Yahoo chart ${symbol}: HTTP ${res.status}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo chart ${symbol}: empty result`);
  }
  const quotes = result.indicators?.quote?.[0];
  const closes = quotes?.close || [];
  const highs = quotes?.high || [];
  const lows = quotes?.low || [];
  const volumes = quotes?.volume || [];
  const timestamps = result.timestamp || [];

  const bars = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (close == null || Number.isNaN(close)) continue;
    bars.push({
      date: new Date(timestamps[i] * 1000),
      open: quotes.open?.[i] ?? close,
      high: highs[i] ?? close,
      low: lows[i] ?? close,
      close,
      volume: volumes[i] ?? 0,
    });
  }
  if (bars.length < 30) {
    throw new Error(`Yahoo chart ${symbol}: insufficient bars (${bars.length})`);
  }
  return {
    symbol,
    currency: result.meta?.currency || 'USD',
    exchange: result.meta?.exchangeName || '',
    lastPrice: result.meta?.regularMarketPrice ?? bars[bars.length - 1].close,
    bars,
  };
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function atr(bars, period = 14) {
  if (bars.length <= period) return null;
  const trs = [];
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const cur = bars[i];
    const prevClose = bars[i - 1]?.close ?? cur.close;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose));
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

module.exports = {
  fetchYahooChart,
  sma,
  ema,
  rsi,
  atr,
};
