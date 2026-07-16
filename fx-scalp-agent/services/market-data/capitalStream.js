const EventEmitter = require('events');
const WebSocket = require('ws');
const { normPair, round, priceToPips } = require('../utils');
const { resolveStreamUrl } = require('../executor/capitalClient');
const { isCapitalRateLimited } = require('../executor/capitalRateLimit');

function upsertBar(bars, bar, maxLen = 120) {
  if (!bars || !bar) return bars || [];
  const last = bars[bars.length - 1];
  if (last && last.ts === bar.ts) {
    last.high = Math.max(last.high, bar.high);
    last.low = Math.min(last.low, bar.low);
    last.close = bar.close;
    return bars;
  }
  if (!last || bar.ts > last.ts) {
    bars.push(bar);
    if (bars.length > maxLen) bars.shift();
  }
  return bars;
}

/**
 * Capital.com WebSocket — real-time quotes + OHLC (max 40 epics).
 * Docs: wss://…/connect → marketData.subscribe + OHLCMarketData.subscribe
 */
class CapitalPriceStream extends EventEmitter {
  constructor(options = {}) {
    super();
    this.client = options.client;
    /** @type {Map<string,string>} epic -> pair */
    this.epicToPair = options.epicToPair || new Map();
    this.epics = [...(options.epics || [])].slice(0, 40);
    this.streamUrl = options.streamUrl || null;
    this.pingMs = options.pingMs ?? 300000;
    this.ws = null;
    this._corr = 0;
    this._pingTimer = null;
    this._connected = false;
    this._connecting = false;
    this._reconnectMs = 5000;
    this._stopped = false;
  }

  get isConnected() {
    return this._connected;
  }

  nextCorr() {
    this._corr += 1;
    return String(this._corr);
  }

  pairForEpic(epic) {
    return this.epicToPair.get(epic) || normPair(String(epic || '').replace(/[^A-Z]/gi, ''));
  }

  async connect() {
    if (this._connecting || this._connected) return;
    if (!this.client?.configured) {
      throw new Error('Capital stream: client not configured');
    }
    if (isCapitalRateLimited()) {
      throw new Error('Capital stream: rate limited');
    }
    this._connecting = true;
    try {
      await this.client.ensureSession();
      const url = this.streamUrl
        || this.client.getStreamUrl?.()
        || resolveStreamUrl(this.client.baseUrl?.includes('demo') ? 'demo' : 'live');
      this.ws = new WebSocket(url);

      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Capital WS connect timeout')), 15000);
        this.ws.once('open', () => { clearTimeout(t); resolve(); });
        this.ws.once('error', (e) => { clearTimeout(t); reject(e); });
      });

      this.ws.on('message', (raw) => this._onMessage(raw));
      this.ws.on('close', () => this._onClose());
      this.ws.on('error', (err) => this.emit('error', err));

      this._connected = true;
      this._reconnectMs = 5000;
      this._subscribeAll();
      this._startPing();
      this.emit('connect');
      console.log(`[capital-ws] connected, ${this.epics.length} epics`);
    } finally {
      this._connecting = false;
    }
  }

  _authFields() {
    return {
      cst: this.client.cst,
      securityToken: this.client.securityToken,
    };
  }

  _send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  _subscribeAll() {
    if (!this.epics.length) return;
    this._send({
      destination: 'marketData.subscribe',
      correlationId: this.nextCorr(),
      ...this._authFields(),
      payload: { epics: this.epics },
    });
    this._send({
      destination: 'OHLCMarketData.subscribe',
      correlationId: this.nextCorr(),
      ...this._authFields(),
      payload: {
        epics: this.epics,
        resolutions: ['MINUTE', 'MINUTE_5', 'HOUR'],
        type: 'classic',
      },
    });
  }

  _startPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      if (!this._connected) return;
      this._send({
        destination: 'ping',
        correlationId: this.nextCorr(),
        ...this._authFields(),
      });
    }, this.pingMs);
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch (e) {
      this.emit('error', e);
      return;
    }
    const dest = msg.destination;
    const payload = msg.payload || {};

    if (dest === 'quote' && payload.epic) {
      const bid = Number(payload.bid);
      const ask = Number(payload.ofr ?? payload.offer ?? payload.ask);
      if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;
      const pair = this.pairForEpic(payload.epic);
      const mid = (bid + ask) / 2;
      this.emit('quote', {
        epic: payload.epic,
        pair,
        source: 'capital-ws',
        bid: round(bid, 5),
        ask: round(ask, 5),
        mid: round(mid, 5),
        spreadPips: round(priceToPips(ask - bid, pair), 2),
        updatedAt: Date.now(),
      });
      return;
    }

    if (dest === 'ohlc.event' && payload.epic) {
      const pair = this.pairForEpic(payload.epic);
      const ts = Number(payload.t);
      const close = Number(payload.c);
      if (!Number.isFinite(ts) || !Number.isFinite(close)) return;
      const bar = {
        ts,
        open: Number(payload.o) || close,
        high: Number(payload.h) || close,
        low: Number(payload.l) || close,
        close,
        volume: 0,
      };
      let resolution = payload.resolution || 'MINUTE';
      this.emit('ohlc', { epic: payload.epic, pair, resolution, bar });
    }
  }

  _onClose() {
    this._connected = false;
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    this.emit('close');
    if (this._stopped) return;
    const delay = this._reconnectMs;
    this._reconnectMs = Math.min(this._reconnectMs * 1.5, 60000);
    setTimeout(() => {
      this.connect().catch((e) => console.warn('[capital-ws] reconnect', e.message));
    }, delay);
  }

  disconnect() {
    this._stopped = true;
    this._connected = false;
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { CapitalPriceStream, upsertBar };
