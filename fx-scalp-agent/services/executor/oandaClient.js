const { normPair, round } = require('../utils');

function resolveBaseUrl(env) {
  if (env === 'live' || env === 'fxtrade') {
    return 'https://api-fxtrade.oanda.com';
  }
  return 'https://api-fxpractice.oanda.com';
}

class OandaClient {
  constructor(cfg) {
    this.token = cfg.oanda?.token || cfg.token;
    this.accountId = cfg.oanda?.accountId || cfg.accountId;
    this.baseUrl = resolveBaseUrl(cfg.oanda?.env || cfg.env || 'practice');
  }

  get configured() {
    return Boolean(this.token && this.accountId);
  }

  instrument(pair) {
    const p = normPair(pair);
    return `${p.slice(0, 3)}_${p.slice(3)}`;
  }

  async request(method, path, body) {
    if (!this.configured) {
      throw new Error('OANDA token/account not configured');
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OANDA ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : {};
  }

  async getAccountSummary() {
    return this.request('GET', `/v3/accounts/${this.accountId}/summary`);
  }

  async getOpenTrades() {
    const r = await this.request('GET', `/v3/accounts/${this.accountId}/openTrades`);
    return r.trades || [];
  }

  async getTransactions(count = 50) {
    const r = await this.request(
      'GET',
      `/v3/accounts/${this.accountId}/transactions?count=${count}`,
    );
    return r.transactions || [];
  }

  async createMarketOrder({ pair, units, stopLoss, takeProfit }) {
    const order = {
      type: 'MARKET',
      instrument: this.instrument(pair),
      units: String(Math.round(units)),
      timeInForce: 'FOK',
    };
    if (stopLoss != null) {
      order.stopLossOnFill = { price: String(stopLoss), timeInForce: 'GTC' };
    }
    if (takeProfit != null) {
      order.takeProfitOnFill = { price: String(takeProfit), timeInForce: 'GTC' };
    }
    return this.request('POST', `/v3/accounts/${this.accountId}/orders`, { order });
  }

  mapOpenTrade(trade) {
    const pair = String(trade.instrument || '').replace('_', '');
    const units = Number(trade.currentUnits ?? trade.initialUnits ?? 0);
    return {
      pair: normPair(pair),
      side: units < 0 ? 'short' : 'long',
      entry: Number(trade.price),
      stopLoss: trade.stopLossOrder?.price ? Number(trade.stopLossOrder.price) : null,
      takeProfit: trade.takeProfitOrder?.price ? Number(trade.takeProfitOrder.price) : null,
      units,
      oandaTradeId: String(trade.id),
      openedAt: Date.parse(trade.openTime) || Date.now(),
    };
  }

  mapCloseFromTransaction(tx, openTrade) {
    const exit = Number(tx.price);
    const reason = String(tx.reason || '').toLowerCase();
    let exitReason = 'manual';
    if (reason.includes('stop_loss')) exitReason = 'stop';
    else if (reason.includes('take_profit')) exitReason = 'take_profit';

    const { tradePnlUsd } = require('./pricing');
    const closed = {
      ...openTrade,
      exit: round(exit, 5),
      exitReason,
      closedAt: Date.parse(tx.time) || Date.now(),
    };
    const pnl = tradePnlUsd(closed, exit, 0);
    return {
      ...closed,
      pips: pnl.pips,
      grossPnlUsd: pnl.grossUsd,
      commissionUsd: 0,
      pnlUsd: pnl.pnlUsd,
    };
  }
}

module.exports = { OandaClient, resolveBaseUrl };
