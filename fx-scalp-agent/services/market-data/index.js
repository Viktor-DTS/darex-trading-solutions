const config = require('../../config');
const { fetchYahooBars } = require('./yahooFx');
const { OandaPriceStream } = require('./oandaStream');
const EventEmitter = require('events');

/**
 * Unified market data — swap provider without changing worker.
 * yahoo: poll bars every tick
 * oanda: WebSocket quotes (sub-second)
 */
class MarketDataHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pair = options.pair || config.pair;
    this.provider = options.provider || config.dataProvider;
    this.stream = null;
    this.lastSnapshot = null;
    this.lastBars = null;
  }

  async start() {
    if (this.provider === 'oanda') {
      this.stream = new OandaPriceStream({
        token: config.oanda.token,
        accountId: config.oanda.accountId,
        pair: this.pair,
        env: config.oanda.env,
      });
      this.stream.on('quote', (q) => {
        this.lastSnapshot = { ...q, bars: this.lastBars?.bars || [] };
        this.emit('tick', this.lastSnapshot);
      });
      this.stream.on('error', (e) => this.emit('error', e));
      this.stream.connect();
      return;
    }

    await this.refreshBars();
  }

  async refreshBars() {
    const [m1, m5] = await Promise.all([
      fetchYahooBars(this.pair, '1m', '1d', 30),
      fetchYahooBars(this.pair, '5m', '5d', 30),
    ]);
    this.lastBars = { m1, m5 };
    this.lastSnapshot = {
      ...m1,
      bars1m: m1.bars,
      bars5m: m5.bars,
    };
    this.emit('tick', this.lastSnapshot);
    return this.lastSnapshot;
  }

  getSnapshot() {
    return this.lastSnapshot;
  }

  stop() {
    if (this.stream) this.stream.disconnect();
  }
}

async function fetchAnalysisBars(pair) {
  const [m1, m5, m15] = await Promise.all([
    fetchYahooBars(pair, '1m', '1d', 30),
    fetchYahooBars(pair, '5m', '5d', 30),
    fetchYahooBars(pair, '15m', '5d', 20),
  ]);
  return { m1, m5, m15 };
}

module.exports = {
  MarketDataHub,
  fetchAnalysisBars,
  fetchYahooBars,
};
