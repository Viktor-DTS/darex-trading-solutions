/**
 * IBKR Web API — підготовка OAuth (фаза 2).
 * Повна підпис OAuth 1.0a + DH — коли ключі задані в Render env.
 * Документація: https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/
 */

function isIbkrConfigured() {
  return Boolean(
    process.env.IBKR_CONSUMER_KEY &&
      process.env.IBKR_ACCESS_TOKEN &&
      process.env.IBKR_ACCESS_SECRET,
  );
}

function isIbkrLiveOrdersEnabled() {
  return process.env.IBKR_LIVE_ORDERS === '1';
}

function getIbkrStatus() {
  const configured = isIbkrConfigured();
  return {
    configured,
    liveOrders: isIbkrLiveOrdersEnabled(),
    accountId: process.env.IBKR_ACCOUNT_ID || null,
    apiBase: process.env.IBKR_API_BASE || 'https://api.ibkr.com/v1/api',
    ready: configured && isIbkrLiveOrdersEnabled(),
    message: !configured
      ? 'Додайте IBKR OAuth ключі в Render Environment'
      : !isIbkrLiveOrdersEnabled()
        ? 'Ключі є. Увімкніть IBKR_LIVE_ORDERS=1 для відправки ордерів'
        : 'Готово до відправки ордерів (paper/live за IBKR_ACCOUNT_ID)',
  };
}

/**
 * Bracket order через IBKR API (stub → pending_ibkr у БД до повної OAuth-реалізації).
 */
async function submitBracketOrder(signal, settings) {
  const status = getIbkrStatus();

  if (!status.configured) {
    return {
      ok: false,
      mode: 'pending_manual',
      message: status.message,
    };
  }

  if (!status.liveOrders) {
    return {
      ok: false,
      mode: 'dry_run',
      message: 'IBKR_LIVE_ORDERS=0 — ордер лише в черзі pending',
      orderPreview: buildOrderPreview(signal, settings),
    };
  }

  // TODO: OAuth 1.0a signed request to /iserver/account/{id}/orders
  return {
    ok: false,
    mode: 'oauth_pending',
    message: 'OAuth signing — наступний реліз; ордер збережено в pending_ibkr',
    orderPreview: buildOrderPreview(signal, settings),
  };
}

function buildOrderPreview(signal, settings) {
  const qty = signal.quantity || Math.max(1, Math.floor((signal.positionSizeUsd || 0) / (signal.entryPrice || 1)));
  return {
    symbol: signal.symbol,
    side: 'BUY',
    quantity: qty,
    orderType: 'LMT',
    price: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    tif: 'GTC',
    mode: settings.mode || 'paper',
  };
}

module.exports = {
  isIbkrConfigured,
  isIbkrLiveOrdersEnabled,
  getIbkrStatus,
  submitBracketOrder,
  buildOrderPreview,
};
