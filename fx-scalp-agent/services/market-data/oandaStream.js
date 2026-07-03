const EventEmitter = require('events');
const WebSocket = require('ws');
const { normPair, round } = require('../utils');

/**
 * OANDA pricing stream — для phase 2 (demo token).
 * https://developer.oanda.com/rest-live-v20/pricing-websocket/
 */
class OandaPriceStream extends EventEmitter {
  constructor(options = {}) {
    super();
    this.token = options.token;
    this.accountId = options.accountId;
    this.pair = normPair(options.pair || 'EURUSD');
    this.env = options.env === 'live' ? 'stream-fxtrade' : 'stream-fxpractice';
    this.ws = null;
    this.lastQuote = null;
  }

  instrument() {
    return `${this.pair.slice(0, 3)}_${this.pair.slice(3)}`;
  }

  connect() {
    if (!this.token) {
      throw new Error('FX_OANDA_TOKEN required for OANDA stream');
    }
    if (!this.accountId) {
      throw new Error('FX_OANDA_ACCOUNT required for OANDA stream');
    }

    const host = this.env === 'stream-fxtrade' ? 'stream-fxtrade.oanda.com' : 'stream-fxpractice.oanda.com';
    const wsUrl = `wss://${host}/v3/accounts/${this.accountId}/pricing/stream?instruments=${encodeURIComponent(this.instrument())}`;
    this.ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'PRICE') return;
        const bid = Number(msg.bids?.[0]?.price);
        const ask = Number(msg.asks?.[0]?.price);
        if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;
        const mid = (bid + ask) / 2;
        const spreadPips = (ask - bid) / (this.pair.includes('JPY') ? 0.01 : 0.0001);
        this.lastQuote = {
          pair: this.pair,
          source: 'oanda',
          bid: round(bid, 5),
          ask: round(ask, 5),
          mid: round(mid, 5),
          spreadPips: round(spreadPips, 2),
          updatedAt: Date.now(),
        };
        this.emit('quote', this.lastQuote);
      } catch (e) {
        this.emit('error', e);
      }
    });

    this.ws.on('close', () => {
      this.emit('close');
      setTimeout(() => this.connect().catch(() => {}), 3000);
    });

    this.ws.on('error', (err) => this.emit('error', err));
  }

  disconnect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { OandaPriceStream };
