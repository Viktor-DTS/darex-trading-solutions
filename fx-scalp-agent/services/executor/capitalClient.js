const { normPair, round } = require('../utils');
const {
  isCapitalRateLimited,
  capitalRateLimitSecondsLeft,
  markCapitalRateLimited,
  parseRetryAfterSeconds,
  isRateLimitError,
} = require('./capitalRateLimit');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveBaseUrl(env) {
  if (env === 'live' || env === 'real') {
    return 'https://api-capital.backend-capital.com';
  }
  return 'https://demo-api-capital.backend-capital.com';
}

function resolveStreamUrl(env) {
  if (env === 'live' || env === 'real') {
    return 'wss://api-streaming-capital.backend-capital.com/connect';
  }
  return 'wss://demo-streaming-capital.backend-capital.com/connect';
}

/**
 * Capital.com public REST API client.
 * Auth: POST /session with X-CAP-API-KEY -> returns CST + X-SECURITY-TOKEN
 * headers (valid ~10 min of inactivity). We re-auth automatically on 401.
 */
class CapitalClient {
  constructor(cfg) {
    this.apiKey = cfg.capital?.apiKey || cfg.apiKey || '';
    this.identifier = cfg.capital?.identifier || cfg.identifier || '';
    this.password = cfg.capital?.password || cfg.password || '';
    this.baseUrl = resolveBaseUrl(cfg.capital?.env || cfg.env || 'demo');
    this.cst = null;
    this.securityToken = null;
    this.authAt = 0;
    this._epicCache = new Map();
    this._lastReqAt = 0;
    this._minRequestMs = Number(cfg.capitalMinRequestMs) || 700;
    this.streamingHost = null;
  }

  getStreamUrl() {
    if (this.streamingHost) {
      const base = String(this.streamingHost).replace(/\/+$/, '');
      return `${base}/connect`;
    }
    const env = this.baseUrl.includes('demo') ? 'demo' : 'live';
    return resolveStreamUrl(env);
  }

  _rateLimitError() {
    const sec = capitalRateLimitSecondsLeft();
    return new Error(`Capital API rate limit — пауза ~${sec}s (demo ~1000 req/год)`);
  }

  async _throttle() {
    if (isCapitalRateLimited()) throw this._rateLimitError();
    const gap = this._minRequestMs - (Date.now() - this._lastReqAt);
    if (gap > 0) await sleep(gap);
    this._lastReqAt = Date.now();
  }

  get configured() {
    return Boolean(this.apiKey && this.identifier && this.password);
  }

  /** Establish (or refresh) a session and cache CST + X-SECURITY-TOKEN. */
  async authenticate() {
    if (!this.configured) {
      throw new Error('Capital.com apiKey/identifier/password not configured');
    }
    if (isCapitalRateLimited()) throw this._rateLimitError();
    await this._throttle();
    const res = await fetch(`${this.baseUrl}/api/v1/session`, {
      method: 'POST',
      headers: {
        'X-CAP-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: this.identifier,
        password: this.password,
        encryptedPassword: false,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (isRateLimitError(res.status, text)) {
        markCapitalRateLimited(parseRetryAfterSeconds(text, res.status));
        throw this._rateLimitError();
      }
      throw new Error(`Capital session ${res.status}: ${text.slice(0, 300)}`);
    }
    this.cst = res.headers.get('CST');
    this.securityToken = res.headers.get('X-SECURITY-TOKEN');
    this.authAt = Date.now();
    if (!this.cst || !this.securityToken) {
      throw new Error('Capital session: missing CST / X-SECURITY-TOKEN in response');
    }
    const data = text ? JSON.parse(text) : {};
    if (data.streamingHost) this.streamingHost = data.streamingHost;
    return data;
  }

  async ensureSession() {
    // Session expires after ~10 min inactivity; re-auth if stale (>8 min) or absent.
    const stale = Date.now() - this.authAt > 8 * 60 * 1000;
    if (!this.cst || !this.securityToken || stale) {
      await this.authenticate();
    }
  }

  async request(method, path, body, _retry = false) {
    if (!this.configured) {
      throw new Error('Capital.com credentials not configured');
    }
    await this.ensureSession();
    await this._throttle();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'X-CAP-API-KEY': this.apiKey,
        CST: this.cst,
        'X-SECURITY-TOKEN': this.securityToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if ((res.status === 401 || res.status === 403) && !_retry) {
      this.cst = null;
      this.securityToken = null;
      await this.authenticate();
      return this.request(method, path, body, true);
    }
    if (!res.ok) {
      if (isRateLimitError(res.status, text)) {
        markCapitalRateLimited(parseRetryAfterSeconds(text, res.status));
        throw this._rateLimitError();
      }
      throw new Error(`Capital ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : {};
  }

  async ping() {
    return this.request('GET', '/api/v1/ping');
  }

  async getAccounts() {
    const r = await this.request('GET', '/api/v1/accounts');
    return r.accounts || [];
  }

  /** Normalized summary similar to OANDA's for the /status endpoint. */
  async getAccountSummary() {
    const accounts = await this.getAccounts();
    const active = accounts.find((a) => a.preferred) || accounts[0] || {};
    const bal = active.balance || {};
    return {
      raw: active,
      accountId: active.accountId || null,
      currency: active.currency || null,
      balance: bal.balance != null ? Number(bal.balance) : null,
      available: bal.available != null ? Number(bal.available) : null,
      profitLoss: bal.profitLoss != null ? Number(bal.profitLoss) : null,
      deposit: bal.deposit != null ? Number(bal.deposit) : null,
    };
  }

  /** Search markets by term (used to resolve a pair -> epic). */
  async searchMarkets(term) {
    const r = await this.request('GET', `/api/v1/markets?searchTerm=${encodeURIComponent(term)}`);
    return r.markets || [];
  }

  /**
   * Markets by epic list (max 50) — includes percentageChange / high / low.
   * @param {string[]} epics
   */
  async getMarketsByEpics(epics) {
    const list = [...new Set((epics || []).map((e) => String(e || '').trim()).filter(Boolean))].slice(0, 50);
    if (!list.length) return [];
    const r = await this.request('GET', `/api/v1/markets?epics=${encodeURIComponent(list.join(','))}`);
    return r.markets || [];
  }

  /** Top-level Capital market navigation categories. */
  async getMarketNavigation() {
    return this.request('GET', '/api/v1/marketnavigation');
  }

  /** Sub-nodes / markets under a navigation node. */
  async getMarketNavigationNode(nodeId, limit = 500) {
    const id = encodeURIComponent(nodeId);
    const q = limit != null ? `?limit=${Number(limit)}` : '';
    return this.request('GET', `/api/v1/marketnavigation/${id}${q}`);
  }

  async getMarketDetails(epic) {
    return this.request('GET', `/api/v1/markets/${encodeURIComponent(epic)}`);
  }

  /**
   * Historical OHLC from Capital (bid/ask per candle).
   * @param {string} epic
   * @param {{resolution?:string,max?:number,from?:string,to?:string}} opts
   */
  async getHistoricalPrices(epic, opts = {}) {
    const qs = new URLSearchParams();
    if (opts.resolution) qs.set('resolution', opts.resolution);
    if (opts.max != null) qs.set('max', String(opts.max));
    if (opts.from) qs.set('from', opts.from);
    if (opts.to) qs.set('to', opts.to);
    const q = qs.toString();
    const path = `/api/v1/prices/${encodeURIComponent(epic)}${q ? `?${q}` : ''}`;
    const r = await this.request('GET', path);
    return r.prices || [];
  }

  /** Preload epic cache for a list of pairs (sequential to respect rate limits). */
  async preloadEpics(pairs, delayMs = 350) {
    const out = {};
    for (const pair of pairs) {
      if (isCapitalRateLimited()) break;
      const p = normPair(pair);
      try {
        out[p] = await this.resolveEpic(p);
      } catch (e) {
        console.warn(`[capital-data] epic ${p}`, e.message);
        out[p] = p;
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    return out;
  }

  /**
   * Resolve a 6-letter FX pair to a Capital.com epic.
   * Standard FX epics equal the symbol (EURUSD). Search API only for exotic cases.
   */
  async resolveEpic(pairInput) {
    const p = normPair(pairInput);
    if (this._epicCache.has(p)) return this._epicCache.get(p);

    if (/^[A-Z]{6}$/.test(p)) {
      this._epicCache.set(p, p);
      return p;
    }

    if (isCapitalRateLimited()) {
      this._epicCache.set(p, p);
      return p;
    }

    const markets = await this.searchMarkets(p);
    const wanted = `${p.slice(0, 3)}/${p.slice(3)}`;
    const isFx = (m) => (m.instrumentType || '').toUpperCase() === 'CURRENCIES';

    let match = markets.find((m) => m.epic === p && isFx(m))
      || markets.find((m) => (m.symbol || '').replace('/', '') === p && isFx(m))
      || markets.find((m) => (m.instrumentName || '').replace(/\s/g, '').toUpperCase() === wanted.replace('/', '') && isFx(m))
      || markets.find((m) => isFx(m) && (m.instrumentName || '').toUpperCase().includes(wanted))
      || markets.find((m) => m.epic === p)
      || markets[0];

    const epic = match?.epic || null;
    if (epic) this._epicCache.set(p, epic);
    return epic;
  }

  async getOpenPositions() {
    const r = await this.request('GET', '/api/v1/positions');
    return r.positions || [];
  }

  async getDealConfirmation(dealReference) {
    return this.request('GET', `/api/v1/confirms/${encodeURIComponent(dealReference)}`);
  }

  /**
   * Position dealId from confirm — use affectedDeals OPENED, not order-level dealId.
   */
  static parsePositionDealId(confirm) {
    if (!confirm) return null;
    const deals = confirm.affectedDeals || [];
    const opened = deals.find((d) => /OPEN/i.test(String(d.status || '')));
    if (opened?.dealId) return String(opened.dealId);
    const ref = String(confirm.dealReference || '');
    if (confirm.dealId && ref.startsWith('p_')) return String(confirm.dealId);
    if (confirm.dealId) return String(confirm.dealId);
    return null;
  }

  async findOpenPositionByPair(pairInput) {
    const pair = normPair(pairInput);
    const remote = await this.getOpenPositions();
    for (const rp of remote) {
      const mapped = this.mapOpenPosition(rp);
      if (mapped.pair === pair) return mapped;
    }
    return null;
  }

  /**
   * Open a market position.
   * @param {{epic:string, direction:'BUY'|'SELL', size:number, stopLevel?:number, profitLevel?:number}} p
   * @returns {Promise<{dealReference:string}>}
   */
  async createPosition({ epic, direction, size, stopLevel, profitLevel }) {
    const body = {
      epic,
      direction,
      size,
      guaranteedStop: false,
    };
    if (stopLevel != null) body.stopLevel = stopLevel;
    if (profitLevel != null) body.profitLevel = profitLevel;
    return this.request('POST', '/api/v1/positions', body);
  }

  async closePosition(dealId) {
    return this.request('DELETE', `/api/v1/positions/${encodeURIComponent(dealId)}`);
  }

  /**
   * Update stop / take-profit on an open position.
   * @param {string} dealId
   * @param {{stopLevel?:number, profitLevel?:number}} levels
   */
  async updatePosition(dealId, levels = {}) {
    const body = {};
    if (levels.stopLevel != null) body.stopLevel = levels.stopLevel;
    if (levels.profitLevel != null) body.profitLevel = levels.profitLevel;
    if (!Object.keys(body).length) return null;
    return this.request('PUT', `/api/v1/positions/${encodeURIComponent(dealId)}`, body);
  }

  /** Map a Capital.com open position into our internal trade shape. */
  mapOpenPosition(item) {
    const pos = item.position || item;
    const mkt = item.market || {};
    const epic = pos.epic || mkt.epic || '';
    const symbol = (mkt.symbol || mkt.instrumentName || epic).replace(/[\/\s]/g, '');
    const dir = String(pos.direction || '').toUpperCase();
    return {
      pair: normPair(symbol.length >= 6 ? symbol.slice(0, 6) : symbol),
      side: dir === 'SELL' ? 'short' : 'long',
      entry: pos.level != null ? Number(pos.level) : null,
      stopLoss: pos.stopLevel != null ? Number(pos.stopLevel) : null,
      takeProfit: pos.profitLevel != null ? Number(pos.profitLevel) : null,
      size: pos.size != null ? Number(pos.size) : null,
      capitalDealId: pos.dealId ? String(pos.dealId) : null,
      capitalDealReference: pos.dealReference ? String(pos.dealReference) : null,
      capitalEpic: epic || null,
      openedAt: pos.createdDateUTC ? Date.parse(pos.createdDateUTC) || Date.now() : Date.now(),
    };
  }
}

module.exports = { CapitalClient, resolveBaseUrl, resolveStreamUrl };
