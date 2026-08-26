/**
 * Telegram-сповіщення про нові маркетингові ліди з реклами / зовнішніх джерел.
 */

const { SOURCE_LABELS, INTERACTION_TYPE_LABELS } = require('./marketingLeads');

const SETTING_FIELD = 'newMarketingLeads';

/** Джерела, для яких шлемо сповіщення (без ручного вводу в CRM). */
const NOTIFY_SOURCES = new Set([
  'website',
  'facebook',
  'instagram',
  'google',
  'telegram',
  'viber',
  'email',
  'referral',
  'other',
]);

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isValidTelegramChatId(chatId) {
  const s = String(chatId || '').trim();
  if (!s) return false;
  return /^-?\d+$/.test(s);
}

function shouldNotifyMarketingLead(lead) {
  if (!lead) return false;
  const source = String(lead.source || '').toLowerCase();
  if (source === 'manual') return false;
  return NOTIFY_SOURCES.has(source);
}

function formatMarketingLeadTelegramMessage(lead) {
  const source = SOURCE_LABELS[lead.source] || lead.source || '—';
  const interaction = INTERACTION_TYPE_LABELS[lead.interactionType]
    || lead.interactionType
    || '';
  const lines = [
    '📣 <b>Новий лід з реклами</b>',
    '',
    `<b>№</b> ${escapeHtml(lead.requestNumber || '—')}`,
    `<b>Джерело:</b> ${escapeHtml(source)}`,
  ];
  if (interaction) {
    lines.push(`<b>Тип:</b> ${escapeHtml(interaction)}`);
  }
  if (lead.clientName) {
    lines.push(`<b>Клієнт:</b> ${escapeHtml(lead.clientName)}`);
  }
  if (lead.contactPhone) {
    lines.push(`<b>Телефон:</b> ${escapeHtml(lead.contactPhone)}`);
  }
  if (lead.contactEmail) {
    lines.push(`<b>Email:</b> ${escapeHtml(lead.contactEmail)}`);
  }
  if (lead.city) {
    lines.push(`<b>Місто:</b> ${escapeHtml(lead.city)}`);
  }
  if (lead.productInterest) {
    lines.push(`<b>Інтерес:</b> ${escapeHtml(lead.productInterest)}`);
  }
  if (lead.utmCampaign) {
    lines.push(`<b>Кампанія:</b> ${escapeHtml(lead.utmCampaign)}`);
  }
  if (lead.metaCampaignName) {
    lines.push(`<b>Meta campaign:</b> ${escapeHtml(lead.metaCampaignName)}`);
  }
  const comment = String(lead.comment || '').trim();
  if (comment) {
    const short = comment.length > 280 ? `${comment.slice(0, 277)}…` : comment;
    lines.push(`<b>Коментар:</b> ${escapeHtml(short)}`);
  }
  lines.push('', '→ Маркетинговий віділ → Ліди');
  return lines.join('\n');
}

async function sendNewMarketingLeadTelegram(deps, lead) {
  const { telegramService, User, NotificationLog } = deps || {};
  if (!telegramService || !User || !shouldNotifyMarketingLead(lead)) {
    return { sent: 0, skipped: true };
  }

  try {
    const users = await User.find({
      dismissed: { $ne: true },
      telegramChatId: { $exists: true, $ne: '' },
      [`notificationSettings.${SETTING_FIELD}`]: true,
    })
      .select('login telegramChatId')
      .lean();

    const chatIds = [
      ...new Set(
        users.map((u) => String(u.telegramChatId || '').trim()).filter(isValidTelegramChatId)
      ),
    ];

    if (!chatIds.length) return { sent: 0 };

    const message = formatMarketingLeadTelegramMessage(lead);
    let sent = 0;

    for (const chatId of chatIds) {
      const success = await telegramService.sendMessage(chatId, message);
      if (success) sent += 1;
      if (NotificationLog) {
        try {
          await NotificationLog.create({
            type: 'marketing_lead_new',
            taskId: lead._id,
            userId: 'marketing',
            message,
            telegramChatId: chatId,
            status: success ? 'sent' : 'failed',
          });
        } catch {
          /* ignore log errors */
        }
      }
    }

    return { sent };
  } catch (e) {
    console.error('[MARKETING TELEGRAM] notify failed:', e.message || e);
    return { sent: 0, error: e.message };
  }
}

module.exports = {
  SETTING_FIELD,
  NOTIFY_SOURCES,
  shouldNotifyMarketingLead,
  formatMarketingLeadTelegramMessage,
  sendNewMarketingLeadTelegram,
};
