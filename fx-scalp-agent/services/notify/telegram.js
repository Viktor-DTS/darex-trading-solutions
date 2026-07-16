function getTelegramConfig() {
  return {
    token: process.env.FX_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.FX_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  };
}

function isTelegramConfigured() {
  const { token, chatId } = getTelegramConfig();
  return Boolean(token && chatId);
}

async function sendTelegram(text, { kind = 'info' } = {}) {
  if (kind === 'trade' && process.env.FX_TRADE_TELEGRAM === '0') {
    return { ok: false, skipped: true, reason: 'FX_TRADE_TELEGRAM=0' };
  }
  if (kind === 'learn' && process.env.FX_LEARN_TELEGRAM === '0') {
    return { ok: false, skipped: true, reason: 'FX_LEARN_TELEGRAM=0' };
  }

  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: 'telegram not configured' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4000),
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json();
  return { ok: json.ok === true, response: json };
}

async function sendTradeAlert(text) {
  return sendTelegram(text, { kind: 'trade' });
}

async function sendLearningReport(text) {
  return sendTelegram(text, { kind: 'learn' });
}

module.exports = {
  getTelegramConfig,
  isTelegramConfigured,
  sendTelegram,
  sendTradeAlert,
  sendLearningReport,
};
