const { yahooFxSymbol, round } = require('../utils');

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function fetchYahooBars(pair, interval = '1m', range = '1d', minBars = 20) {
  const raw = String(pair || '');
  const symbol = raw.includes('-') || raw.startsWith('^') ? raw : yahooFxSymbol(raw);
  const url = `${YAHOO}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const fetchOpts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fx-scalp-agent/0.1)',
      Accept: 'application/json',
    },
  };
  if (process.env.FX_TLS_INSECURE === '1') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    throw new Error(`Yahoo FX ${pair}: HTTP ${res.status}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo FX ${pair}: empty`);

  const q = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const bars = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = q.close?.[i];
    if (close == null || Number.isNaN(close)) continue;
    bars.push({
      ts: timestamps[i] * 1000,
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  if (bars.length < minBars) {
    throw new Error(`Yahoo FX ${pair}: only ${bars.length} bars`);
  }

  const bid = result.meta?.regularMarketPrice ?? bars[bars.length - 1].close;
  return {
    pair,
    source: 'yahoo',
    bid: round(bid, 5),
    ask: round(bid, 5),
    mid: round(bid, 5),
    spreadPips: 0,
    bars,
    updatedAt: Date.now(),
  };
}

module.exports = { fetchYahooBars };
