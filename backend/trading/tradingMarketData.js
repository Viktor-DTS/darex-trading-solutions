const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const STOOQ_DAILY = 'https://stooq.com/q/d/l/';

const CACHE_TTL_MS = parseInt(process.env.TRADING_CHART_CACHE_MS || String(45 * 60 * 1000), 10);
const FETCH_GAP_MS = parseInt(process.env.TRADING_FETCH_GAP_MS || '1500', 10);

/** @type {Map<string, { expires: number, data: object }>} */
const memoryCache = new Map();
let lastFetchAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStooqSymbol(symbol) {
  const s = String(symbol || '').trim();
  if (s === '^VIX') return 'vix.us';
  if (s === '^TNX') return '10usy.b';
  return `${s.replace(/^\^/, '').toLowerCase()}.us`;
}

function cacheGet(symbol) {
  const hit = memoryCache.get(symbol);
  if (!hit || hit.expires < Date.now()) {
    memoryCache.delete(symbol);
    return null;
  }
  return hit.data;
}

function cacheSet(symbol, data) {
  memoryCache.set(symbol, { expires: Date.now() + CACHE_TTL_MS, data });
}

async function throttle() {
  const wait = FETCH_GAP_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

async function fetchYahooChartOnce(symbol, range = '1y', interval = '1d', minBars = 30) {
  await throttle();
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
    },
  });
  if (!res.ok) {
    const err = new Error(`Yahoo chart ${symbol}: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
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
  if (bars.length < minBars) {
    throw new Error(`Yahoo chart ${symbol}: insufficient bars (${bars.length})`);
  }
  return {
    symbol,
    source: 'yahoo',
    currency: result.meta?.currency || 'USD',
    exchange: result.meta?.exchangeName || '',
    lastPrice: result.meta?.regularMarketPrice ?? bars[bars.length - 1].close,
    bars,
  };
}

async function fetchYahooChart(symbol, range = '1y', interval = '1d', minBars = 30) {
  const retries = [0, 2500, 6000, 12000];
  let lastErr;
  for (let i = 0; i < retries.length; i += 1) {
    if (retries[i] > 0) await sleep(retries[i]);
    try {
      return await fetchYahooChartOnce(symbol, range, interval, minBars);
    } catch (e) {
      lastErr = e;
      const status = e.status || 0;
      if (status !== 429 && status !== 503 && status !== 502) break;
    }
  }
  throw lastErr;
}

async function fetchStooqChart(symbol, minBars = 30) {
  await throttle();
  const stooqSym = toStooqSymbol(symbol);
  const url = `${STOOQ_DAILY}?s=${encodeURIComponent(stooqSym)}&i=d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`Stooq ${symbol}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`Stooq ${symbol}: empty CSV`);
  }

  const bars = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;
    const [dateStr, open, high, low, close, volume] = parts;
    const closeNum = parseFloat(close);
    if (!dateStr || Number.isNaN(closeNum)) continue;
    bars.push({
      date: new Date(dateStr),
      open: parseFloat(open) || closeNum,
      high: parseFloat(high) || closeNum,
      low: parseFloat(low) || closeNum,
      close: closeNum,
      volume: parseFloat(volume) || 0,
    });
  }

  if (bars.length < minBars) {
    throw new Error(`Stooq ${symbol}: insufficient bars (${bars.length})`);
  }

  const last = bars[bars.length - 1];
  return {
    symbol,
    source: 'stooq',
    currency: 'USD',
    exchange: 'stooq',
    lastPrice: last.close,
    bars,
  };
}

/**
 * Unified chart fetch: memory cache → Yahoo (retry) → Stooq fallback.
 */
async function fetchChart(symbol, range = '1y', interval = '1d', options = {}) {
  const minBars = options.minBars ?? 30;
  const key = `${symbol}:${range}:${interval}:${minBars}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  let chart;
  try {
    chart = await fetchYahooChart(symbol, range, interval, minBars);
  } catch (yahooErr) {
    try {
      chart = await fetchStooqChart(symbol, minBars);
      chart.fallbackFrom = yahooErr.message;
    } catch (stooqErr) {
      throw new Error(`${yahooErr.message}; Stooq: ${stooqErr.message}`);
    }
  }

  cacheSet(key, chart);
  return chart;
}

/** Остання ціна мacro-індикатора (VIX, TNX) — достатньо 1 бару. */
async function fetchMacroQuote(symbol) {
  return fetchChart(symbol, '6mo', '1d', { minBars: 1 });
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
  fetchChart,
  fetchMacroQuote,
  fetchYahooChart,
  sma,
  ema,
  rsi,
  atr,
};
