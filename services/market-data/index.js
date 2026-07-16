const config = require('../../config');
const { fetchYahooBars } = require('./yahooFx');
const { OandaPriceStream } = require('./oandaStream');
const { CapitalPriceStream, upsertBar } = require('./capitalStream');
const {
  fetchCapitalQuote,
  fetchCapitalBars,
  fetchCapitalSnapshot,
  getCapitalDataClient,
} = require('./capitalFx');
const { normPair } = require('../utils');
const {
  isCapitalRateLimited,
  capitalRateLimitSecondsLeft,
} = require('../executor/capitalRateLimit');
const EventEmitter = require('events');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Unified market data — single or multi pair.
 * yahoo: poll bars on interval
 * capital: Capital.com bid/ask + OHLC (rate-limit aware rotation)
 * oanda: WebSocket quotes (first pair only for stream MVP)
 */
class MarketDataHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pairs = (options.pairs || config.pairs || [config.pair]).map(normPair);
    this.pair = this.pairs[0];
    this.provider = (options.provider || config.dataProvider || 'yahoo').toLowerCase();
    this.stream = null;
    this.snapshots = new Map();
    this._refreshing = false;
    this._capitalClient = null;
    this._epics = new Map();
    this._quoteIdx = 0;
    this._barIdx = 0;
    this._capitalReady = false;
    this._barTimer = null;
    this._quoteTimer = null;
    this._wsReady = false;
    this._deferredBootstrapTimer = null;
    this._yahooFallbackActive = false;
    this._yahooFallbackTimer = null;
    this._capitalResuming = false;
  }

  /** Capital FX epics match the 6-letter symbol — no REST search needed. */
  _seedCapitalEpics() {
    for (const pair of this.pairs) {
      const p = normPair(pair);
      if (!this._epics.has(p)) this._epics.set(p, p);
    }
  }

  _scheduleCapitalDeferredStartup() {
    if (this._deferredBootstrapTimer || this._wsReady) return;
    const pollMs = config.capitalRateLimitPollMs ?? 60000;
    const sec = capitalRateLimitSecondsLeft();
    const waitMs = sec > 0 ? Math.min(sec * 1000, pollMs) : 5000;
    console.warn(`[capital-data] Capital retry in ~${Math.ceil(waitMs / 1000)}s (backoff ~${sec}s)`);
    this._deferredBootstrapTimer = setTimeout(() => {
      this._deferredBootstrapTimer = null;
      this._resumeCapitalAfterRateLimit()
        .catch((e) => console.warn('[capital-data] deferred startup', e.message));
    }, waitMs);
  }

  async _yahooRefreshPair(pair) {
    const p = normPair(pair);
    const [m1, m5, h1] = await Promise.all([
      fetchYahooBars(p, '1m', '1d', 30),
      fetchYahooBars(p, '5m', '5d', 30),
      fetchYahooBars(p, '1h', '3mo', 50),
    ]);
    const prev = this.snapshots.get(p) || {};
    this.snapshots.set(p, {
      ...prev,
      pair: p,
      epic: prev.epic || p,
      source: 'yahoo-fallback',
      bid: m1.bid,
      ask: m1.ask,
      mid: m1.mid,
      spreadPips: m1.spreadPips,
      bars1m: m1.bars,
      bars5m: m5.bars,
      bars1h: h1.bars,
      updatedAt: Date.now(),
    });
    return this.snapshots.get(p);
  }

  async _loadYahooFallback() {
    const conc = Math.min(config.pairRefreshConcurrency || 5, 8);
    for (let i = 0; i < this.pairs.length; i += conc) {
      const batch = this.pairs.slice(i, i + conc);
      await Promise.all(batch.map(async (pair) => {
        try {
          await this._yahooRefreshPair(pair);
        } catch (e) {
          console.warn(`[yahoo-fallback] ${pair}`, e.message);
        }
      }));
      if (i + conc < this.pairs.length) await sleep(150);
    }
    const minBars = config.capitalMinBars ?? 15;
    this._capitalReady = [...this.snapshots.values()]
      .some((s) => (s.bars1m || []).length >= minBars);
    this.emit('tick', this.getMultiSnapshot());
  }

  async _startYahooFallback() {
    if (this._yahooFallbackActive || config.capitalYahooFallback === false) return;
    this._yahooFallbackActive = true;
    console.log('[capital-data] Yahoo fallback — analysis continues while Capital API recovers');
    try {
      await this._loadYahooFallback();
    } catch (e) {
      console.warn('[yahoo-fallback] initial load', e.message);
    }
    const ms = config.capitalYahooFallbackMs ?? 120000;
    this._yahooFallbackTimer = setInterval(() => {
      if (this._wsReady) {
        this._stopYahooFallback();
        return;
      }
      this._loadYahooFallback().catch((e) => console.warn('[yahoo-fallback]', e.message));
    }, ms);
  }

  _stopYahooFallback() {
    if (!this._yahooFallbackActive) return;
    this._yahooFallbackActive = false;
    if (this._yahooFallbackTimer) {
      clearInterval(this._yahooFallbackTimer);
      this._yahooFallbackTimer = null;
    }
    console.log('[capital-data] Yahoo fallback stopped — Capital WebSocket active');
  }

  async _probeCapitalSession() {
    if (isCapitalRateLimited()) {
      await this._startYahooFallback();
      this._scheduleCapitalDeferredStartup();
      return false;
    }
    try {
      const client = await this._ensureCapitalClient();
      await client.ensureSession();
      return true;
    } catch (e) {
      if (String(e.message).includes('rate limit')) {
        await this._startYahooFallback();
        this._scheduleCapitalDeferredStartup();
        return false;
      }
      throw e;
    }
  }

  async _resumeCapitalAfterRateLimit() {
    if (this._capitalResuming) return;
    this._capitalResuming = true;
    try {
      if (isCapitalRateLimited()) return;

      console.log('[capital-data] rate limit cleared — resuming…');
      const wsMode = config.capitalUseWebSocket !== false;

      if (wsMode && !this._wsReady) {
        await this._startCapitalWebSocket();
        if (this._wsReady) return;
        if (!this._yahooFallbackActive) await this._startYahooFallback();
        return;
      }

      if (!wsMode) {
        const bootstrap = this.pairs.length;
        if (bootstrap > 0) await this._bootstrapCapitalBars(bootstrap);
        if (!this._quoteTimer) this._startCapitalRestPolling();
      }
    } finally {
      this._capitalResuming = false;
      if (!this._wsReady) this._scheduleCapitalDeferredStartup();
    }
  }

  _startCapitalRestPolling() {
    if (this._quoteTimer || isCapitalRateLimited()) return;
    const quoteMs = config.capitalQuoteRefreshMs > 0
      ? config.capitalQuoteRefreshMs
      : Math.max(config.tickMs * 3, 8000);
    this._quoteTimer = setInterval(() => {
      this.refreshAllPairs().catch((e) => console.warn('[capital-data] quotes', e.message));
    }, quoteMs);
    if (!this._barTimer) {
      const barMs = config.capitalBarRefreshMs ?? 300000;
      this._barTimer = setInterval(() => {
        this._rotateCapitalBars().catch((e) => console.warn('[capital-data] bars', e.message));
      }, barMs);
    }
    console.log(`[capital-data] REST polling quotes every ${quoteMs}ms`);
  }

  _applyStreamQuote(q) {
    const p = normPair(q.pair);
    const prev = this.snapshots.get(p) || { pair: p, bars1m: [], bars5m: [], bars1h: [] };
    this.snapshots.set(p, {
      ...prev,
      ...q,
      epic: q.epic || prev.epic,
      source: 'capital-ws',
      bars1m: prev.bars1m || [],
      bars5m: prev.bars5m || [],
      bars1h: prev.bars1h || [],
      updatedAt: Date.now(),
    });
    // WS quotes are high-frequency — analysis runs on interval, not per quote.
    if (!this._wsReady) this.emit('tick', this.getMultiSnapshot());
  }

  getHubStatus() {
    return {
      source: this._wsReady ? 'capital-ws'
        : (this._yahooFallbackActive ? 'yahoo-fallback'
          : (this.provider === 'capital' ? 'capital' : 'multi')),
      provider: this.provider,
      capitalReady: this.provider === 'capital' ? this._capitalReady : undefined,
      capitalWs: this._wsReady,
      yahooFallback: this._yahooFallbackActive,
    };
  }

  _applyStreamOhlc(o) {
    const p = normPair(o.pair);
    const prev = this.snapshots.get(p) || {
      pair: p,
      epic: o.epic,
      source: 'capital-ws',
      bars1m: [],
      bars5m: [],
      bars1h: [],
    };
    const key = o.resolution === 'MINUTE_5' ? 'bars5m'
      : o.resolution === 'HOUR' ? 'bars1h' : 'bars1m';
    const maxLen = key === 'bars1h'
      ? (config.capitalH1Max ?? 80)
      : key === 'bars5m' ? (config.capitalM5Max ?? 60) : (config.capitalM1Max ?? 60);
    const bars = upsertBar([...(prev[key] || [])], o.bar, maxLen);
    this.snapshots.set(p, {
      ...prev,
      epic: o.epic || prev.epic,
      [key]: bars,
      updatedAt: Date.now(),
    });
    if (!this._capitalReady && bars.length >= (config.capitalMinBars ?? 15)) {
      this._capitalReady = true;
    }
  }

  async _startCapitalWebSocket() {
    const client = await this._ensureCapitalClient();
    const epicToPair = new Map();
    const epics = [];
    for (const pair of this.pairs.slice(0, 40)) {
      const p = normPair(pair);
      const epic = this._epics.get(p) || p;
      epicToPair.set(epic, p);
      epics.push(epic);
    }
    if (!epics.length) {
      console.warn('[capital-ws] no epics — WebSocket skipped');
      return;
    }

    this.stream = new CapitalPriceStream({
      client,
      epics,
      epicToPair,
      pingMs: config.capitalStreamPingMs ?? 300000,
    });
    this.stream.on('quote', (q) => this._applyStreamQuote(q));
    this.stream.on('ohlc', (o) => this._applyStreamOhlc(o));
    this.stream.on('error', (e) => console.warn('[capital-ws]', e.message));
    this.stream.on('connect', () => {
      this._wsReady = true;
      this._stopYahooFallback();
      console.log('[capital-ws] streaming quotes + OHLC active');
    });
    this.stream.on('close', () => { this._wsReady = false; });

    try {
      await this.stream.connect();
    } catch (e) {
      console.warn('[capital-ws] connect failed:', e.message);
      if (isCapitalRateLimited()) {
        await this._startYahooFallback();
        this._scheduleCapitalDeferredStartup();
      } else {
        this._startCapitalRestPolling();
      }
    }
  }

  _capitalCfg() {
    return {
      capitalMinBars: config.capitalMinBars,
      capitalM1Max: config.capitalM1Max,
      capitalM5Max: config.capitalM5Max,
      capitalH1Max: config.capitalH1Max,
    };
  }

  async _ensureCapitalClient() {
    if (!this._capitalClient) {
      this._capitalClient = getCapitalDataClient(config);
    }
    if (!this._capitalClient.configured) {
      throw new Error('Capital data: FX_CAPITAL_API_KEY/IDENTIFIER/PASSWORD required');
    }
    return this._capitalClient;
  }

  async _capitalEpic(pair) {
    const p = normPair(pair);
    if (this._epics.has(p)) return this._epics.get(p);
    this._epics.set(p, p);
    return p;
  }

  async _bootstrapCapitalBars(maxPairs) {
    if (isCapitalRateLimited()) return;
    const client = await this._ensureCapitalClient();
    const pairDelay = config.capitalHydrateDelayMs ?? 8000;
    let loaded = 0;
    for (const pair of this.pairs) {
      if (loaded >= maxPairs) break;
      if (isCapitalRateLimited()) {
        console.warn('[capital-data] rate limit — stop bar bootstrap');
        break;
      }
      const p = normPair(pair);
      const epic = this._epics.get(p) || p;
      try {
        const snap = await fetchCapitalSnapshot(client, p, epic, this._capitalCfg());
        this.snapshots.set(p, snap);
        console.log(`[capital-data] ${p} epic=${epic} spread=${snap.spreadPips}p`);
        loaded += 1;
      } catch (e) {
        console.warn(`[capital-data] hydrate ${p}`, e.message);
        if (String(e.message).includes('rate limit')) break;
      }
      if (pairDelay > 0) await sleep(pairDelay);
    }
    if (this.snapshots.size > 0) this._capitalReady = true;
    if (loaded === 0 && isCapitalRateLimited()) {
      await this._startYahooFallback();
    }
  }

  async _hydrateCapitalAll() {
    this._seedCapitalEpics();
    const wsMode = config.capitalUseWebSocket !== false;

    if (isCapitalRateLimited()) {
      console.warn(
        `[capital-data] rate limit — ${this._epics.size} epics seeded locally, REST deferred ~${capitalRateLimitSecondsLeft()}s`,
      );
      await this._startYahooFallback();
      this._scheduleCapitalDeferredStartup();
      return;
    }

    if (wsMode) {
      const bootstrap = config.capitalWsBootstrapPairs ?? 0;
      if (bootstrap > 0) {
        if (!(await this._probeCapitalSession())) return;
        console.log(`[capital-data] WS mode — bootstrap bars for ${bootstrap} pairs…`);
        await this._bootstrapCapitalBars(bootstrap);
      } else {
        console.log(`[capital-data] WS mode — skip REST bootstrap (${this._epics.size} epics, connect WebSocket)`);
      }
      return;
    }

    console.log(`[capital-data] REST mode — loading bars for ${this.pairs.length} pairs…`);
    await this._bootstrapCapitalBars(this.pairs.length);
  }

  async _refreshCapitalQuote(pair) {
    const p = normPair(pair);
    const epic = await this._capitalEpic(p);
    if (!epic) throw new Error(`no epic for ${p}`);
    const client = await this._ensureCapitalClient();
    const quote = await fetchCapitalQuote(client, p, epic);
    const prev = this.snapshots.get(p) || {};
    this.snapshots.set(p, {
      ...prev,
      ...quote,
      epic,
      bars1m: prev.bars1m || [],
      bars5m: prev.bars5m || [],
      bars1h: prev.bars1h || [],
      updatedAt: Date.now(),
    });
    return this.snapshots.get(p);
  }

  async _refreshCapitalBars(pair) {
    const p = normPair(pair);
    const epic = await this._capitalEpic(p);
    if (!epic) return null;
    const client = await this._ensureCapitalClient();
    const cfg = this._capitalCfg();
    const minBars = cfg.capitalMinBars ?? 20;
    const [bars1m, bars5m, bars1h] = await Promise.all([
      fetchCapitalBars(client, epic, { resolution: 'MINUTE', max: cfg.capitalM1Max ?? 60, hoursBack: 2, minBars: Math.min(minBars, 10) }),
      fetchCapitalBars(client, epic, { resolution: 'MINUTE_5', max: cfg.capitalM5Max ?? 60, hoursBack: 12, minBars: Math.min(minBars, 10) }),
      fetchCapitalBars(client, epic, { resolution: 'HOUR', max: cfg.capitalH1Max ?? 80, hoursBack: 120, minBars: Math.min(minBars, 15) }),
    ]);
    const prev = this.snapshots.get(p) || {};
    this.snapshots.set(p, {
      ...prev,
      pair: p,
      epic,
      source: 'capital',
      bars1m,
      bars5m,
      bars1h,
      updatedAt: Date.now(),
    });
    return this.snapshots.get(p);
  }

  async start() {
    if (this.provider === 'capital') {
      this._seedCapitalEpics();
      await this._hydrateCapitalAll();
      if (config.capitalUseWebSocket !== false) {
        if (isCapitalRateLimited()) {
          console.warn('[capital-ws] session deferred — rate limit active');
          await this._startYahooFallback();
          this._scheduleCapitalDeferredStartup();
        } else {
          await this._startCapitalWebSocket();
        }
      } else {
        this._startCapitalRestPolling();
      }
      return;
    }

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

  async _rotateCapitalBars() {
    if (this._wsReady) return;
    if (!this.pairs.length) return;
    const pair = this.pairs[this._barIdx % this.pairs.length];
    this._barIdx += 1;
    await this._refreshCapitalBars(pair);
  }

  async refreshPair(pair) {
    const p = normPair(pair);
    if (this.provider === 'capital') {
      if (this._wsReady && this.stream?.isConnected) {
        return this.snapshots.get(p) || null;
      }
      return this._refreshCapitalQuote(p);
    }

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
      if (this.provider === 'capital') {
        if (this._wsReady && this.stream?.isConnected) {
          const multi = this.getMultiSnapshot();
          this.emit('tick', multi);
          return multi;
        }
        if (isCapitalRateLimited()) {
          return this.getMultiSnapshot();
        }
        const batch = config.capitalQuoteBatch ?? 3;
        const selected = [];
        for (let i = 0; i < batch && i < this.pairs.length; i += 1) {
          selected.push(this.pairs[(this._quoteIdx + i) % this.pairs.length]);
        }
        this._quoteIdx = (this._quoteIdx + batch) % this.pairs.length;
        for (const pair of selected) {
          try {
            await this._refreshCapitalQuote(pair);
          } catch (e) {
            console.warn(`[capital-data] quote ${pair}`, e.message);
          }
          await sleep(config.capitalQuoteDelayMs ?? 200);
        }
        const multi = this.getMultiSnapshot();
        this.emit('tick', multi);
        return multi;
      }

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

  /**
   * Expand watched pairs (Capital universe hunt). Cap 40 for WebSocket.
   * Restarts stream when new epics appear.
   */
  async expandWatchPairs(nextPairs) {
    const merged = [];
    const seen = new Set();
    for (const x of [...(nextPairs || []), ...this.pairs]) {
      const p = normPair(x);
      if (!p || p.length !== 6 || seen.has(p)) continue;
      seen.add(p);
      merged.push(p);
      if (merged.length >= 40) break;
    }
    const prev = new Set(this.pairs);
    const added = merged.filter((p) => !prev.has(p));
    const removed = this.pairs.filter((p) => !seen.has(p) && merged.length >= 40);
    if (!added.length && merged.length === this.pairs.length) {
      return { added: [], removed: [], pairs: this.pairs };
    }
    this.pairs = merged;
    this.pair = this.pairs[0];
    this._seedCapitalEpics();

    if (this.provider === 'capital' && this.stream && added.length) {
      try {
        this.stream.disconnect();
      } catch (_) { /* ignore */ }
      this.stream = null;
      this._wsReady = false;
      try {
        await this._startCapitalWebSocket();
      } catch (e) {
        console.warn('[capital-data] re-subscribe after hunt', e.message);
      }
    }

    if (added.length) {
      console.log(`[capital-data] hunt watch +${added.length}: ${added.join(',')}`);
    }
    return { added, removed, pairs: this.pairs };
  }

  getPairSnapshot(pair) {
    return this.snapshots.get(normPair(pair)) || null;
  }

  getMultiSnapshot() {
    const primary = this.getPairSnapshot(this.pair);
    return {
      ...this.getHubStatus(),
      pairs: Object.fromEntries(this.snapshots),
      pair: primary?.pair,
      bid: primary?.bid,
      ask: primary?.ask,
      mid: primary?.mid,
      spreadPips: primary?.spreadPips,
      bars1m: primary?.bars1m,
      bars5m: primary?.bars5m,
    };
  }

  getSnapshot() {
    return this.getMultiSnapshot();
  }

  stop() {
    if (this._barTimer) clearInterval(this._barTimer);
    if (this._quoteTimer) clearInterval(this._quoteTimer);
    if (this._deferredBootstrapTimer) clearTimeout(this._deferredBootstrapTimer);
    if (this._yahooFallbackTimer) clearInterval(this._yahooFallbackTimer);
    if (this.stream) {
      if (typeof this.stream.disconnect === 'function') this.stream.disconnect();
    }
  }
}

async function fetchAnalysisBars(pair) {
  // Live Capital data comes from MarketDataHub/WebSocket — never Capital REST here.
  const p = normPair(pair);
  const hit = yahooBarCache.get(p);
  const cacheMs = config.capitalYahooBarCacheMs ?? 180000;
  if (hit && Date.now() - hit.at < cacheMs) return hit.data;

  const [m1, m5, m15, h1] = await Promise.all([
    fetchYahooBars(p, '1m', '1d', 30),
    fetchYahooBars(p, '5m', '5d', 30),
    fetchYahooBars(p, '15m', '5d', 20),
    fetchYahooBars(p, '1h', '3mo', 50),
  ]);
  const data = { m1, m5, m15, h1 };
  yahooBarCache.set(p, { at: Date.now(), data });
  return data;
}

const yahooBarCache = new Map();

module.exports = {
  MarketDataHub,
  fetchAnalysisBars,
  fetchYahooBars,
};
