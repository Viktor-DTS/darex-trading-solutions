async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TRADING_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.log('[trading-telegram] skip: token or chat id missing');
    return false;
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
    return json.ok === true;
  } catch (e) {
    console.error('[trading-telegram]', e.message);
    return false;
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyTradingScan({ scanId, regime, vix, signals, mode, autoEnabled }) {
  const buys = signals.filter((s) => s.action === 'BUY');
  const lines = [
    `<b>📊 Trading scan</b> <code>${escapeHtml(scanId)}</code>`,
    `Mode: <b>${escapeHtml(mode)}</b> | Auto: <b>${autoEnabled ? 'ON' : 'OFF'}</b>`,
    `Regime: <b>${escapeHtml(regime)}</b> | VIX: <b>${vix ?? '—'}</b>`,
    '',
  ];

  if (!buys.length) {
    lines.push('Нових BUY сигналів немає.');
    const top = signals
      .filter((s) => !s.error)
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, 3);
    for (const s of top) {
      lines.push(`${escapeHtml(s.symbol)}: ${s.action} (${s.finalScore}) — ${escapeHtml(s.reason)}`);
    }
  } else {
    lines.push(`<b>BUY сигнали (${buys.length}):</b>`);
    for (const s of buys) {
      lines.push(
        `• <b>${escapeHtml(s.symbol)}</b> @ ${s.entryPrice} | SL ${s.stopLoss} | TP ${s.takeProfit}`,
      );
      lines.push(`  score ${s.finalScore} | size ~$${s.positionSizeUsd ?? '?'}`);
    }
  }

  return sendTelegramMessage(lines.join('\n'));
}

async function notifyTradingAlert(message) {
  return sendTelegramMessage(`<b>⚠️ Trading</b>\n${escapeHtml(message)}`);
}

module.exports = {
  sendTelegramMessage,
  notifyTradingScan,
  notifyTradingAlert,
};
