const config = require('../../config');
const { fetchYahooBars } = require('./yahooFx');
const { OandaPriceStream } = require('./oandaStream');
const { normPair } = require('../utils');
const EventEmitter = require('events');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Unified market data — single or multi pair.
 * yahoo: poll bars on interval
 * oanda: WebSocket quotes (first pair only for stream MVP)
 */
class MarketDataHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pairs = (options.pairs || config.pairs || [config.pair]).map(normPair);
    this.pair = this.pairs[0];
    this.provider = options.provider || config.dataProvider;
    this.stream = null;
    this.snapshots = new Map();
    this._refreshing = false;
  }

  async start() {
    if (this.provider === 'oanda') {
      await this.refreshAllPairs().catch((e) => console.warn('[fx] oanda bar refresh', e.message));
      this._barTimer = setInterval(() => {
        this.refreshAllPairs().catch((e) => console.warn('[fx] oanda bar refresh', e.message));
      }, 60000);

      this.stream = new OandaPriceStream({
        token: config.oanda.token,
        accountId: config.oanda.accountId,
        pair: this.pair,
        env: config.oanda.env,
      });
      this.stream.on('quote', (q) => {
        const snap = this.snapshots.get(this.pair) || {};
        const merged = {
          ...snap,
          ...q,
          pair: this.pair,
          bars1m: snap.bars1m || [],
          bars5m: snap.bars5m || [],
        };
        this.snapshots.set(this.pair, merged);
        this.emit('tick', this.getMultiSnapshot());
      });
      this.stream.on('error', (e) => this.emit('error', e));
      this.stream.connect();
      return;
    }

    await this.refreshAllPairs();
  }

  async refreshPair(pair) {
    const p = normPair(pair);
    const [m1, m5, h1] = await Promise.all([
      fetchYahooBars(p, '1m', '1d', 30),
      fetchYahooBars(p, '5m', '5d', 30),
      fetchYahooBars(p, '1h', '3mo', 50),
    ]);
    const snap = {
      pair: p,
      source: 'yahoo',
      bid: m1.bid,
      ask: m1.ask,
      mid: m1.mid,
      spreadPips: m1.spreadPips,
      bars1m: m1.bars,
      bars5m: m5.bars,
      bars1h: h1.bars,
      updatedAt: Date.now(),
    };
    this.snapshots.set(p, snap);
    return snap;
  }

  async refreshAllPairs() {
    if (this._refreshing) return this.getMultiSnapshot();
    this._refreshing = true;
    try {
      const conc = config.pairRefreshConcurrency || 5;
      for (let i = 0; i < this.pairs.length; i += conc) {
        const batch = this.pairs.slice(i, i + conc);
        await Promise.all(batch.map(async (pair) => {
          try {
            await this.refreshPair(pair);
          } catch (e) {
            console.warn(`[fx-refresh] ${pair}`, e.message);
          }
        }));
        if (i + conc < this.pairs.length) await sleep(150);
      }
      const multi = this.getMultiSnapshot();
      this.emit('tick', multi);
      return multi;
    } finally {
      this._refreshing = false;
    }
  }

  /** @deprecated use refreshAllPairs */
  async refreshBars() {
    return this.refreshAllPairs();
  }

  getPairSnapshot(pair) {
    return this.snapshots.get(normPair(pair)) || null;
  }

  getMultiSnapshot() {
    const pairsObj = Object.fromEntries(this.snapshots);
    const primary = this.getPairSnapshot(this.pair);
    return {
      source: 'multi',
      pairs: pairsObj,
      pair: primary?.pair,
      bid: primary?.bid,
      ask: primary?.ask,
      mid: primary?.mid,
      bars1m: primary?.bars1m,
      bars5m: primary?.bars5m,
    };
  }

  getSnapshot() {
    return this.getMultiSnapshot();
  }

  stop() {
    if (this._barTimer) clearInterval(this._barTimer);
    if (this.stream) this.stream.disconnect();
  }
}

async function fetchAnalysisBars(pair) {
  const [m1, m5, m15, h1] = await Promise.all([
    fetchYahooBars(pair, '1m', '1d', 30),
    fetchYahooBars(pair, '5m', '5d', 30),
    fetchYahooBars(pair, '15m', '5d', 20),
    fetchYahooBars(pair, '1h', '3mo', 50),
  ]);
  return { m1, m5, m15, h1 };
}

module.exports = {
  MarketDataHub,
  fetchAnalysisBars,
  fetchYahooBars,
};
