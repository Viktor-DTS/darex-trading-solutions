const { CapitalClient } = require('../executor/capitalClient');
const { normPair, round, priceToPips } = require('../utils');

function capitalTs(d = new Date()) {
  return d.toISOString().slice(0, 19);
}

function midLevel(level) {
  if (level == null) return null;
  if (typeof level === 'number') return level;
  const bid = level.bid != null ? Number(level.bid) : null;
  const ask = level.ask != null ? Number(level.ask) : (level.offer != null ? Number(level.offer) : null);
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask;
}

function mapCapitalCandles(prices, minBars = 20) {
  const bars = [];
  for (const p of prices || []) {
    const close = midLevel(p.closePrice);
    if (close == null || Number.isNaN(close)) continue;
    const ts = Date.parse(p.snapshotTimeUTC || p.snapshotTime);
    if (!Number.isFinite(ts)) continue;
    bars.push({
      ts,
      open: midLevel(p.openPrice) ?? close,
      high: midLevel(p.highPrice) ?? close,
      low: midLevel(p.lowPrice) ?? close,
      close,
      volume: Number(p.lastTradedVolume) || 0,
    });
  }
  bars.sort((a, b) => a.ts - b.ts);
  if (bars.length < minBars) {
    throw new Error(`only ${bars.length} bars`);
  }
  return bars;
}

function extractQuoteFromMarket(pair, details) {
  const p = normPair(pair);
  const snap = details?.snapshot || details?.market || details || {};
  const bid = Number(snap.bid ?? details?.bid ?? details?.instrument?.bid);
  const offer = Number(snap.offer ?? snap.ask ?? details?.offer ?? details?.instrument?.offer);
  if (!Number.isFinite(bid) || !Number.isFinite(offer)) {
    throw new Error('missing bid/offer');
  }
  const mid = (bid + offer) / 2;
  const spreadPips = round(priceToPips(offer - bid, p), 2);
  return {
    pair: p,
    source: 'capital',
    bid: round(bid, 5),
    ask: round(offer, 5),
    mid: round(mid, 5),
    spreadPips,
    epic: details?.instrument?.epic || details?.epic || null,
    updatedAt: Date.now(),
  };
}

async function fetchCapitalQuote(client, pair, epic) {
  try {
    const details = await client.getMarketDetails(epic);
    return extractQuoteFromMarket(pair, details);
  } catch (_) { /* fall through */ }
  const prices = await client.getHistoricalPrices(epic, { resolution: 'MINUTE', max: 1 });
  const last = prices[prices.length - 1];
  const bid = Number(last?.closePrice?.bid);
  const ask = Number(last?.closePrice?.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    throw new Error('missing bid/offer');
  }
  const mid = (bid + ask) / 2;
  return {
    pair: normPair(pair),
    source: 'capital',
    bid: round(bid, 5),
    ask: round(ask, 5),
    mid: round(mid, 5),
    spreadPips: round(priceToPips(ask - bid, pair), 2),
    epic,
    updatedAt: Date.now(),
  };
}

async function fetchCapitalBars(client, epic, {
  resolution,
  max,
  hoursBack,
  minBars = 20,
}) {
  const to = new Date();
  const from = new Date(to.getTime() - hoursBack * 60 * 60 * 1000);
  const prices = await client.getHistoricalPrices(epic, {
    resolution,
    max,
    from: capitalTs(from),
    to: capitalTs(to),
  });
  return mapCapitalCandles(prices, minBars);
}

/**
 * Build a full pair snapshot (quote + M1/M5/H1 bars) from Capital.com.
 */
async function fetchCapitalSnapshot(client, pair, epic, cfg = {}) {
  const p = normPair(pair);
  const minBars = cfg.capitalMinBars ?? 20;
  const [quote, bars1m, bars5m, bars1h] = await Promise.all([
    fetchCapitalQuote(client, p, epic),
    fetchCapitalBars(client, epic, {
      resolution: 'MINUTE',
      max: cfg.capitalM1Max ?? 60,
      hoursBack: 2,
      minBars: Math.min(minBars, 10),
    }).catch(() => null),
    fetchCapitalBars(client, epic, {
      resolution: 'MINUTE_5',
      max: cfg.capitalM5Max ?? 60,
      hoursBack: 12,
      minBars: Math.min(minBars, 10),
    }).catch(() => null),
    fetchCapitalBars(client, epic, {
      resolution: 'HOUR',
      max: cfg.capitalH1Max ?? 80,
      hoursBack: 120,
      minBars: Math.min(minBars, 15),
    }).catch(() => null),
  ]);

  if (!bars1m?.length || !bars5m?.length || !bars1h?.length) {
    throw new Error(`${p}: incomplete bar history from Capital`);
  }

  return {
    pair: p,
    source: 'capital',
    bid: quote.bid,
    ask: quote.ask,
    mid: quote.mid,
    spreadPips: quote.spreadPips,
    epic,
    bars1m,
    bars5m,
    bars1h,
    updatedAt: Date.now(),
  };
}

/** Shared Capital client for market data (reuses session). */
let sharedClient = null;

function getCapitalDataClient(cfg) {
  if (!sharedClient) sharedClient = new CapitalClient(cfg);
  return sharedClient;
}

module.exports = {
  capitalTs,
  mapCapitalCandles,
  extractQuoteFromMarket,
  fetchCapitalQuote,
  fetchCapitalBars,
  fetchCapitalSnapshot,
  getCapitalDataClient,
};
