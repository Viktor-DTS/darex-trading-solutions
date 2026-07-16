require('dotenv').config();
const { sendTelegram, isTelegramConfigured, getTelegramConfig } = require('../services/notify/telegram');

async function main() {
  const { chatId } = getTelegramConfig();
  console.log('[telegram:test] configured:', isTelegramConfigured());
  console.log('[telegram:test] chatId:', chatId || '(missing)');

  if (!isTelegramConfigured()) {
    console.error('Додайте FX_TELEGRAM_BOT_TOKEN та FX_TELEGRAM_CHAT_ID у .env або Render Environment');
    process.exit(1);
  }

  const r = await sendTelegram(
    '🤖 FX Scalp Agent — тест Telegram\n'
    + `chat: ${chatId}\n`
    + `час: ${new Date().toLocaleString('uk-UA')}`,
  );

  if (r.ok) {
    console.log('[telegram:test] OK — перевірте Telegram');
    process.exit(0);
  }

  console.error('[telegram:test] FAIL', r.response || r.reason);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
