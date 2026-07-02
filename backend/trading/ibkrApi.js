/**
 * IBKR Web API — OAuth 1.0a через @quentinadam/ibkr.
 * First-party OAuth: ключі з Self-Service Portal.
 */

function installUint8ArrayPolyfill() {
  if (typeof Uint8Array.fromHex === 'function') return;
  Uint8Array.fromHex = (hex) => new Uint8Array(
    Buffer.from(String(hex).replace(/^0x/i, ''), 'hex'),
  );
  Uint8Array.fromBase64 = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
  if (!Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function toHex() {
      return Buffer.from(this).toString('hex');
    };
  }
  if (!Uint8Array.prototype.toBase64) {
    Uint8Array.prototype.toBase64 = function toBase64() {
      return Buffer.from(this).toString('base64');
    };
  }
}

installUint8ArrayPolyfill();

let apiClientPromise = null;
let brokerageReady = false;
let brokerageReadyAt = 0;
const BROKERAGE_TTL_MS = 4 * 60 * 1000;

function readPemFromEnv() {
  const b64 = process.env.IBKR_SIGNATURE_PRIVATE_KEY_B64;
  if (b64) {
    const raw = Buffer.from(b64, 'base64').toString('utf8');
    if (raw.includes('BEGIN')) return raw;
    return `-----BEGIN PRIVATE KEY-----\n${raw.match(/.{1,64}/g)?.join('\n') || raw}\n-----END PRIVATE KEY-----`;
  }
  const pem = process.env.IBKR_SIGNATURE_PRIVATE_KEY;
  if (!pem) return null;
  return pem.replace(/\\n/g, '\n');
}

function getAccessTokenSecretHex() {
  const hex = process.env.IBKR_ACCESS_SECRET_HEX || process.env.IBKR_ACCESS_SECRET;
  if (!hex) return null;
  const trimmed = String(hex).trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 32) {
    return trimmed.toLowerCase();
  }
  return null;
}

function getIbkrConfig() {
  const consumerKey = process.env.IBKR_CONSUMER_KEY?.trim();
  const accessToken = process.env.IBKR_ACCESS_TOKEN?.trim();
  const accessTokenSecret = getAccessTokenSecretHex();
  const signaturePrivateKey = readPemFromEnv();
  const dhPrime = process.env.IBKR_DH_PRIME_HEX?.trim().replace(/^0x/i, '');
  const realm = process.env.IBKR_REALM?.trim()
    || (consumerKey === 'TESTCONS' ? 'test_realm' : 'limited_poa');

  const missing = [];
  if (!consumerKey) missing.push('IBKR_CONSUMER_KEY');
  if (!accessToken) missing.push('IBKR_ACCESS_TOKEN');
  if (!accessTokenSecret) missing.push('IBKR_ACCESS_SECRET_HEX (decrypted hex)');
  if (!signaturePrivateKey) missing.push('IBKR_SIGNATURE_PRIVATE_KEY or _B64');
  if (!dhPrime) missing.push('IBKR_DH_PRIME_HEX');

  return {
    ok: missing.length === 0,
    missing,
    consumerKey,
    accessToken,
    accessTokenSecret,
    signaturePrivateKey,
    diffieHellmanPrime: dhPrime,
    realm,
    accountId: process.env.IBKR_ACCOUNT_ID?.trim() || null,
    apiBase: process.env.IBKR_API_BASE || 'https://api.ibkr.com/v1/api',
  };
}

function isIbkrFullyConfigured() {
  return getIbkrConfig().ok;
}

async function getApiClient() {
  const cfg = getIbkrConfig();
  if (!cfg.ok) {
    const err = new Error(`IBKR OAuth incomplete: ${cfg.missing.join(', ')}`);
    err.code = 'IBKR_CONFIG';
    throw err;
  }

  if (!apiClientPromise) {
    apiClientPromise = import('@quentinadam/ibkr').then(({ ApiClient }) => new ApiClient({
      baseUrl: cfg.apiBase,
      consumerKey: cfg.consumerKey,
      accessToken: cfg.accessToken,
      accessTokenSecret: cfg.accessTokenSecret,
      signaturePrivateKey: cfg.signaturePrivateKey,
      diffieHellmanPrime: cfg.diffieHellmanPrime,
      realm: cfg.realm,
    }));
  }
  return apiClientPromise;
}

async function ibkrRequest(path, options = {}) {
  const client = await getApiClient();
  const {
    method = 'GET',
    headers,
    body,
    parseFn = (x) => x,
  } = options;

  return client.request(path, {
    method,
    headers,
    body,
    parseFn,
  });
}

async function ensureBrokerageSession(force = false) {
  const now = Date.now();
  if (!force && brokerageReady && now - brokerageReadyAt < BROKERAGE_TTL_MS) {
    return { ok: true, cached: true };
  }

  await ibkrRequest('/tickle', { parseFn: (b) => b });

  const init = await ibkrRequest('/iserver/auth/ssodh/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publish: true, compete: true }),
    parseFn: (b) => b,
  });

  brokerageReady = true;
  brokerageReadyAt = Date.now();
  return { ok: true, init, cached: false };
}

async function fetchAccounts() {
  await ensureBrokerageSession();
  return ibkrRequest('/iserver/accounts', { parseFn: (b) => b });
}

async function selectIbkrAccount(accountId) {
  if (!accountId) throw new Error('IBKR account id required');
  await ensureBrokerageSession();
  return ibkrRequest('/iserver/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acctId: accountId }),
    parseFn: (b) => b,
  });
}

async function warmupPortfolioSession() {
  await ensureBrokerageSession();
  try {
    await ibkrRequest('/portfolio/accounts', { parseFn: (b) => b });
  } catch (_) {
    /* optional prefetch */
  }
}

async function fetchIbkrTrades() {
  await ensureBrokerageSession();
  const data = await ibkrRequest('/iserver/account/trades', { parseFn: (b) => b });
  return Array.isArray(data) ? data : [];
}

async function fetchIbkrPositions(accountId) {
  await warmupPortfolioSession();
  const data = await ibkrRequest(
    `/portfolio/${encodeURIComponent(accountId)}/positions/0`,
    { parseFn: (b) => b },
  );
  return Array.isArray(data) ? data : [];
}

async function resolveUsStockConid(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw new Error('Symbol required');

  const data = await ibkrRequest(`/trsrv/stocks?symbols=${encodeURIComponent(sym)}`, {
    parseFn: (b) => b,
  });

  const rows = data?.[sym];
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`IBKR: symbol ${sym} not found`);
  }

  for (const entry of rows) {
    const contracts = entry?.contracts;
    if (!Array.isArray(contracts)) continue;
    const us = contracts.find((c) => c.isUS && /NASDAQ|NYSE|ARCA|BATS|AMEX|SMART/i.test(String(c.exchange || '')));
    if (us?.conid) return { conid: us.conid, exchange: us.exchange, name: entry.name };
    const anyUs = contracts.find((c) => c.isUS);
    if (anyUs?.conid) return { conid: anyUs.conid, exchange: anyUs.exchange, name: entry.name };
  }

  const fallback = rows[0]?.contracts?.[0];
  if (fallback?.conid) {
    return { conid: fallback.conid, exchange: fallback.exchange, name: rows[0]?.name };
  }

  throw new Error(`IBKR: no US conid for ${sym}`);
}

function roundPrice(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.round(x * 100) / 100;
}

async function submitBracketOrderToIbkr({ symbol, quantity, entryPrice, stopLoss, takeProfit, accountId }) {
  const cfg = getIbkrConfig();
  const acct = accountId || cfg.accountId;
  if (!acct) {
    throw new Error('IBKR_ACCOUNT_ID not set');
  }

  await ensureBrokerageSession();
  const { conid, exchange } = await resolveUsStockConid(symbol);

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const entry = roundPrice(entryPrice);
  const sl = roundPrice(stopLoss);
  const tp = roundPrice(takeProfit);

  if (!entry || !sl || !tp) {
    throw new Error('Invalid entry / stop / take profit prices');
  }

  const parentId = `dts-${symbol}-${Date.now()}`.slice(0, 64);

  const orders = [
    {
      acctId: acct,
      conid,
      cOID: parentId,
      orderType: 'LMT',
      listingExchange: 'SMART',
      outsideRTH: false,
      side: 'BUY',
      tif: 'GTC',
      quantity: qty,
      price: entry,
    },
    {
      acctId: acct,
      conid,
      parentId,
      orderType: 'STP',
      listingExchange: 'SMART',
      outsideRTH: false,
      side: 'SELL',
      tif: 'GTC',
      quantity: qty,
      price: sl,
    },
    {
      acctId: acct,
      conid,
      parentId,
      orderType: 'LMT',
      listingExchange: 'SMART',
      outsideRTH: false,
      side: 'SELL',
      tif: 'GTC',
      quantity: qty,
      price: tp,
    },
  ];

  const path = `/iserver/account/${encodeURIComponent(acct)}/orders`;
  let result = await ibkrRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orders),
    parseFn: (b) => b,
  });

  // IBKR інколи повертає "reply message" — підтверджуємо один раз
  if (Array.isArray(result) && result[0]?.id) {
    const replyId = result[0].id;
    result = await ibkrRequest(`/iserver/reply/${replyId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
      parseFn: (b) => b,
    });
  }

  return {
    ok: true,
    accountId: acct,
    conid,
    exchange,
    parentId,
    quantity: qty,
    response: result,
  };
}

async function testIbkrConnection() {
  const cfg = getIbkrConfig();
  if (!cfg.ok) {
    return { ok: false, step: 'config', message: `Missing: ${cfg.missing.join(', ')}` };
  }

  try {
    await ibkrRequest('/tickle', { parseFn: (b) => b });
    const session = await ensureBrokerageSession(true);
    const accounts = await fetchAccounts();

    const accountIds = [];
    if (accounts?.accounts && Array.isArray(accounts.accounts)) {
      accountIds.push(...accounts.accounts);
    } else if (Array.isArray(accounts)) {
      accountIds.push(...accounts.map((a) => a.id || a.accountId || a).filter(Boolean));
    }

    const configured = cfg.accountId;
    const accountOk = !configured || accountIds.some((id) => String(id) === configured);

    return {
      ok: true,
      step: 'connected',
      message: accountOk
        ? 'IBKR OAuth + brokerage session OK'
        : `Connected, but IBKR_ACCOUNT_ID=${configured} not in ${accountIds.join(', ') || '—'}`,
      accountIds,
      configuredAccountId: configured,
      session,
    };
  } catch (err) {
    return {
      ok: false,
      step: 'api',
      message: err.message || String(err),
      status: err.status,
    };
  }
}

function resetIbkrSessionCache() {
  brokerageReady = false;
  brokerageReadyAt = 0;
  apiClientPromise = null;
}

module.exports = {
  getIbkrConfig,
  isIbkrFullyConfigured,
  testIbkrConnection,
  ensureBrokerageSession,
  fetchAccounts,
  selectIbkrAccount,
  fetchIbkrTrades,
  fetchIbkrPositions,
  resolveUsStockConid,
  submitBracketOrderToIbkr,
  resetIbkrSessionCache,
};
