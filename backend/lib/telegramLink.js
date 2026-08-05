const crypto = require('crypto');

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = `38${digits}`;
  } else if (!digits.startsWith('38') && digits.length === 9) {
    digits = `38${digits}`;
  }
  return digits;
}

function makeTelegramStartToken(login, secret) {
  const sig = crypto.createHmac('sha256', String(secret || '')).update(String(login)).digest('hex').slice(0, 16);
  return Buffer.from(JSON.stringify({ l: String(login), s: sig })).toString('base64url');
}

function parseTelegramStartToken(token, secret) {
  if (!token) return null;
  try {
    const { l, s } = JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'));
    if (!l || !s) return null;
    const expected = crypto.createHmac('sha256', String(secret || '')).update(String(l)).digest('hex').slice(0, 16);
    if (s !== expected) return null;
    return l;
  } catch {
    return null;
  }
}

function getBotUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || 'DTS_Service_Bot').replace(/^@/, '');
}

function buildTelegramInviteLink(login, secret) {
  const token = makeTelegramStartToken(login, secret);
  return `https://t.me/${getBotUsername()}?start=${token}`;
}

/**
 * Текст SMS для запрошення підключити Telegram-бота DTS / Гідра.
 * Детальний і зрозумілий — щоб людина не сприйняла посилання як фішинг.
 */
function buildTelegramInviteSmsText({ name, login, inviteLink }) {
  const displayName = (name || login || 'колега').trim();
  const botName = getBotUsername();
  const supportContact = process.env.TELEGRAM_SUPPORT_CONTACT || 'адміністратора системи DTS';

  return [
    'DTS / Darex Trading Solutions',
    '',
    `Вітаємо, ${displayName}!`,
    '',
    'Вас зареєстровано в робочій системі «Гідра» (облік сервісних заявок та сповіщень DTS).',
    '',
    'Щоб отримувати повідомлення про нові заявки та зміни їх статусу, підключіть офіційного Telegram-бота:',
    `@${botName}`,
    '',
    'Перейдіть за персональним посиланням і натисніть «Start» / «Запустити»:',
    inviteLink,
    '',
    'Це безпечно: бот НЕ запитує пароль, код доступу чи дані банківської картки — лише надсилає робочі сповіщення (як вашим колегам).',
    '',
    `Якщо сумніваєтесь — зверніться до ${supportContact}.`,
    '',
    'З повагою, команда DTS',
  ].join('\n');
}

function isValidTelegramChatId(chatId) {
  const v = String(chatId || '').trim();
  return v && v !== 'Chat ID' && /^\d+$/.test(v);
}

module.exports = {
  normalizePhone,
  makeTelegramStartToken,
  parseTelegramStartToken,
  getBotUsername,
  buildTelegramInviteLink,
  buildTelegramInviteSmsText,
  isValidTelegramChatId,
};
