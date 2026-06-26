async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TRADING_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.log('[trading-telegram] skip: token or chat id missing');
    return { ok: false, reason: 'missing token or chat id' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json();
    return { ok: json.ok === true, reason: json.description };
  } catch (e) {
    console.error('[trading-telegram]', e.message);
    return { ok: false, reason: e.message };
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isBuyOnlyTelegram() {
  return process.env.TRADING_TELEGRAM_BUY_ONLY !== '0';
}

function isTelegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
      (process.env.TRADING_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID),
  );
}

/** Алерт лише при BUY (основний канал сповіщень). */
async function notifyBuySignals({ scanId, regime, vix, buys, mode, autoEnabled, triggeredBy }) {
  if (!buys.length) return { ok: false, skipped: true };

  const lines = [
    `<b>🟢 BUY SIGNAL</b> · scan <code>${escapeHtml(scanId)}</code>`,
    `Regime: <b>${escapeHtml(regime)}</b> | VIX: <b>${vix ?? '—'}</b>`,
    `Mode: <b>${escapeHtml(mode)}</b> | Auto: <b>${autoEnabled ? 'ON' : 'OFF'}</b>`,
    triggeredBy ? `Trigger: ${escapeHtml(triggeredBy)}` : '',
    '',
  ].filter(Boolean);

  for (const s of buys) {
    lines.push(`<b>${escapeHtml(s.symbol)}</b> @ ${s.entryPrice}`);
    lines.push(`SL ${s.stopLoss} | TP ${s.takeProfit}`);
    lines.push(`Score ${s.finalScore} | ~$${s.positionSizeUsd ?? '?'} | qty ${s.quantity ?? '?'}`);
    lines.push(`<i>${escapeHtml(s.reason)}</i>`);
    lines.push('');
  }

  return sendTelegramMessage(lines.join('\n'));
}

/** Короткий звіт scan (cron / manual) — опційно. */
async function notifyTradingScan({ scanId, regime, vix, signals, mode, autoEnabled, triggeredBy }) {
  if (isBuyOnlyTelegram()) {
    const buys = signals.filter((s) => s.action === 'BUY');
    return notifyBuySignals({ scanId, regime, vix, buys, mode, autoEnabled, triggeredBy });
  }

  const buys = signals.filter((s) => s.action === 'BUY');
  const lines = [
    `<b>📊 Trading scan</b> <code>${escapeHtml(scanId)}</code>`,
    `Mode: <b>${escapeHtml(mode)}</b> | Auto: <b>${autoEnabled ? 'ON' : 'OFF'}</b>`,
    `Regime: <b>${escapeHtml(regime)}</b> | VIX: <b>${vix ?? '—'}</b>`,
    triggeredBy ? `Via: <b>${escapeHtml(triggeredBy)}</b>` : '',
    '',
  ].filter(Boolean);

  if (!buys.length) {
    lines.push('BUY сигналів немає.');
    const top = signals
      .filter((s) => !s.error)
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, 3);
    for (const s of top) {
      lines.push(`${escapeHtml(s.symbol)}: ${s.action} (${s.finalScore})`);
    }
  } else {
    lines.push(`<b>BUY (${buys.length}):</b>`);
    for (const s of buys) {
      lines.push(`• ${escapeHtml(s.symbol)} @ ${s.entryPrice} | SL ${s.stopLoss} | TP ${s.takeProfit}`);
    }
  }

  return sendTelegramMessage(lines.join('\n'));
}

async function notifyTradingAlert(message) {
  return sendTelegramMessage(`<b>⚠️ Trading</b>\n${escapeHtml(message)}`);
}

async function sendTelegramTest() {
  return sendTelegramMessage(
    '<b>✅ Trading Telegram test</b>\nЗв\'язок працює. BUY-алерти будуть приходити сюди.',
  );
}

module.exports = {
  sendTelegramMessage,
  isTelegramConfigured,
  isBuyOnlyTelegram,
  notifyBuySignals,
  notifyTradingScan,
  notifyTradingAlert,
  sendTelegramTest,
};
