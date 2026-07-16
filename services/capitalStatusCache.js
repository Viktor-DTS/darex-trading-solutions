const config = require('../config');
const { getCapitalDataClient } = require('./market-data/capitalFx');
const { resolveExecutorMode } = require('./executor');
const {
  isCapitalRateLimited,
  capitalRateLimitSecondsLeft,
} = require('./executor/capitalRateLimit');

let cache = { at: 0, data: null };
const DEFAULT_TTL_MS = config.capitalStatusCacheMs ?? 180000;

function baseStatus(cfg) {
  const mode = resolveExecutorMode(cfg);
  const client = getCapitalDataClient(cfg);
  return {
    executorMode: mode,
    provider: cfg.dataProvider,
    env: cfg.capital?.env || 'demo',
    identifier: cfg.capital?.identifier
      ? `…${String(cfg.capital.identifier).slice(-6)}`
      : null,
    configured: client.configured,
    simulate: cfg.simulate,
    executorHint: mode === 'sim' && client.configured
      ? 'У Render: FX_EXECUTOR=capital'
      : null,
  };
}

/**
 * Cached Capital.com account status for the panel.
 * Avoids hammering the API (panel polls every 2–3s; demo limit ~1000 req/hour).
 */
async function getCapitalStatus(cfg, { force = false, ttlMs = DEFAULT_TTL_MS } = {}) {
  const base = baseStatus(cfg);
  const client = getCapitalDataClient(cfg);

  if (!client.configured) {
    return {
      ...base,
      connected: false,
      hint: 'Додайте FX_CAPITAL_API_KEY + IDENTIFIER + PASSWORD, FX_EXECUTOR=capital',
    };
  }

  const now = Date.now();
  if (!force && cache.data && now - cache.at < ttlMs) {
    return { ...cache.data, cached: true };
  }

  if (isCapitalRateLimited()) {
    if (cache.data) {
      return {
        ...cache.data,
        cached: true,
        stale: true,
        rateLimited: true,
        error: `API пауза ~${capitalRateLimitSecondsLeft()}s`,
      };
    }
    return {
      ...base,
      connected: false,
      rateLimited: true,
      error: `Capital API rate limit — пауза ~${capitalRateLimitSecondsLeft()}s`,
    };
  }

  try {
    const acct = await client.getAccountSummary();
    const data = {
      ...base,
      connected: true,
      account: acct.accountId || null,
      balance: acct.balance,
      available: acct.available,
      currency: acct.currency,
      profitLoss: acct.profitLoss,
      cached: false,
      stale: false,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: now, data };
    return data;
  } catch (e) {
    if (cache.data) {
      return {
        ...cache.data,
        cached: true,
        stale: true,
        error: e.message,
      };
    }
    return {
      ...base,
      connected: false,
      error: e.message,
    };
  }
}

function clearCapitalStatusCache() {
  cache = { at: 0, data: null };
}

module.exports = { getCapitalStatus, clearCapitalStatusCache };
