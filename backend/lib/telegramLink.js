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
  return String(process.env.TELEGRAM_BOT_USERNAME || 'DarexServiceBot').replace(/^@/, '');
}

function buildTelegramInviteLink(login, secret, botUsername) {
  const token = makeTelegramStartToken(login, secret);
  const user = String(botUsername || getBotUsername()).replace(/^@/, '');
  return `https://t.me/${user}?start=${token}`;
}

/**
 * Текст SMS для запрошення підключити Telegram-бота DTS / Гідра.
 * Детальний і зрозумілий — щоб людина не сприйняла посилання як фішинг.
 */
function buildTelegramInviteSmsText({ name, login, inviteLink, botUsername }) {
  const displayName = (name || login || 'колега').trim();
  const botName = String(botUsername || getBotUsername()).replace(/^@/, '');
  const supportContact = process.env.TELEGRAM_SUPPORT_CONTACT || 'адміністратора системи DTS';

  return [
    'DTS / Darex Trading Solutions',
    '',
    `Вітаємо, ${displayName}!`,
    '',
    'Вас зареєстровано в робочій системі «Гідра» (облік сервісних заявок та сповіщень DTS).',
    '',
    'Щоб отримувати повідомлення про нові заявки та зміни їх статусу, підключіть офіційного Telegram-бота DTS-Service:',
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

/**
 * Текст in-app сповіщення в «Гідрі» для користувачів без Telegram Chat ID.
 */
function buildTelegramConnectNotificationBody({ name, login, inviteLink, botUsername }) {
  const displayName = (name || login || 'колего').trim();
  const botName = String(botUsername || getBotUsername()).replace(/^@/, '');
  const supportContact = process.env.TELEGRAM_SUPPORT_CONTACT || 'адміністратора системи DTS';

  return [
    `Вітаємо, ${displayName}!`,
    '',
    'Ви працюєте в системі «Гідра» (DTS / Darex Trading Solutions) — внутрішній системі обліку сервісних заявок Darex.',
    '',
    '🔔 Навіщо підключати Telegram?',
    `Колеги вашого відділу вже отримують робочі сповіщення через офіційного бота DTS-Service (@${botName}) — той самий, де ви бачите «Заявка виконана», «Нова заявка» тощо:`,
    '• нові заявки у вашому регіоні;',
    '• зміни статусу (затвердження, відхилення, виконання);',
    '• запити на рахунки та важливі системні повідомлення.',
    '',
    '🔐 Це безпечно і це не фішинг',
    'Бот НЕ запитує пароль від «Гідри», код з SMS, дані банківської картки чи повний доступ до вашого Telegram. Він лише надсилає робочі повідомлення — так само, як уже працює для інших співробітників DTS.',
    '',
    '👉 Що зробити:',
    '1. Натисніть кнопку «Підключити Telegram» нижче;',
    '2. У Telegram натисніть «Start» / «Запустити»;',
    '3. Готово — підключення збережеться автоматично.',
    '',
    `Якщо сумніваєтесь — зверніться до ${supportContact}.`,
    '',
    inviteLink,
  ].join('\n');
}

function extractTelegramInviteLink(text) {
  const match = String(text || '').match(/https:\/\/t\.me\/[^\s]+/);
  return match ? match[0] : null;
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
  buildTelegramConnectNotificationBody,
  extractTelegramInviteLink,
  isValidTelegramChatId,
};
