async function sendLearningReport(text) {
  const token = process.env.FX_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.FX_TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: 'telegram not configured' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
    }),
  });
  const json = await res.json();
  return { ok: json.ok === true, response: json };
}

module.exports = { sendLearningReport };
