/**
 * IBKR Web API — публічний фасад для trading-модуля.
 */

const {
  getIbkrConfig,
  isIbkrFullyConfigured,
  testIbkrConnection,
  submitBracketOrderToIbkr,
} = require('./ibkrApi');

function isIbkrConfigured() {
  return isIbkrFullyConfigured();
}

function isIbkrLiveOrdersEnabled() {
  return process.env.IBKR_LIVE_ORDERS === '1';
}

function getIbkrStatus() {
  const cfg = getIbkrConfig();
  const configured = cfg.ok;
  const liveOrders = isIbkrLiveOrdersEnabled();

  let message;
  if (!configured) {
    message = `Додайте IBKR OAuth ключі в Render: ${cfg.missing.join(', ')}`;
  } else if (!cfg.accountId) {
    message = 'OAuth ключі є. Додайте IBKR_ACCOUNT_ID (paper DU… або live U…)';
  } else if (!liveOrders) {
    message = 'Ключі є. Увімкніть IBKR_LIVE_ORDERS=1 для відправки ордерів';
  } else {
    message = 'Готово до відправки ордерів (paper/live за IBKR_ACCOUNT_ID)';
  }

  return {
    configured,
    oauthComplete: configured,
    liveOrders,
    accountId: cfg.accountId,
    apiBase: cfg.apiBase,
    realm: cfg.realm,
    ready: configured && Boolean(cfg.accountId) && liveOrders,
    missingEnv: cfg.missing,
    message,
  };
}

async function submitBracketOrder(signal, settings) {
  const status = getIbkrStatus();
  const preview = buildOrderPreview(signal, settings);

  if (!status.configured) {
    return {
      ok: false,
      mode: 'pending_manual',
      message: status.message,
      orderPreview: preview,
    };
  }

  if (!status.accountId) {
    return {
      ok: false,
      mode: 'pending_config',
      message: status.message,
      orderPreview: preview,
    };
  }

  if (!status.liveOrders) {
    return {
      ok: false,
      mode: 'dry_run',
      message: 'IBKR_LIVE_ORDERS=0 — ордер лише в черзі pending_ibkr',
      orderPreview: preview,
    };
  }

  if (settings?.mode === 'paper' && !String(status.accountId).startsWith('DU')) {
    return {
      ok: false,
      mode: 'paper_guard',
      message: 'mode=paper, але IBKR_ACCOUNT_ID не paper (DU…). Перевірте налаштування.',
      orderPreview: preview,
    };
  }

  try {
    const result = await submitBracketOrderToIbkr({
      symbol: signal.symbol,
      quantity: preview.quantity,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      accountId: status.accountId,
    });

    return {
      ok: true,
      mode: 'submitted',
      message: `IBKR bracket submitted · conid ${result.conid} · ${result.parentId}`,
      orderPreview: preview,
      ibkr: result,
    };
  } catch (err) {
    return {
      ok: false,
      mode: 'ibkr_error',
      message: err.message || String(err),
      orderPreview: preview,
    };
  }
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
    mode: settings?.mode || 'paper',
  };
}

module.exports = {
  isIbkrConfigured,
  isIbkrLiveOrdersEnabled,
  getIbkrStatus,
  submitBracketOrder,
  buildOrderPreview,
  testIbkrConnection,
};
