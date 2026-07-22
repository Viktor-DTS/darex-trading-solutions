/**
 * Створення маркетингових лідів з inbound / webhook джерел + дедуплікація.
 */

const crypto = require('crypto');
const { sanitizeLeadPayload, normalizePhone, pushStatusHistory } = require('./marketingLeads');

const DEDUP_ACTIVE_STATUSES = ['new', 'in_review', 'assigned', 'transmitted', 'in_progress'];

function getDedupConfig() {
  const days = parseInt(process.env.MARKETING_DEDUP_DAYS || '30', 10);
  const mode = String(process.env.MARKETING_DEDUP_MODE || 'warn').toLowerCase();
  return {
    days: Number.isFinite(days) && days > 0 ? days : 30,
    mode: ['warn', 'block', 'merge'].includes(mode) ? mode : 'warn',
  };
}

function phoneNormalized(value) {
  const digits = normalizePhone(value);
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('380')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `38${digits}`;
  if (digits.length === 9) return `380${digits}`;
  return digits;
}

async function findDuplicateLead(MarketingLead, { phone, metaLeadId, email }) {
  if (metaLeadId) {
    const byMeta = await MarketingLead.findOne({ metaLeadId: String(metaLeadId) }).lean();
    if (byMeta) return { lead: byMeta, reason: 'meta_lead_id' };
  }

  const { days } = getDedupConfig();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const baseQ = {
    createdAt: { $gte: since },
    status: { $in: DEDUP_ACTIVE_STATUSES },
  };

  const norm = phoneNormalized(phone);
  if (norm.length >= 9) {
    const byPhone = await MarketingLead.findOne({
      ...baseQ,
      phoneNormalized: norm,
    })
      .sort({ createdAt: -1 })
      .lean();
    if (byPhone) return { lead: byPhone, reason: 'phone' };
  }

  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const byEmail = await MarketingLead.findOne({
      ...baseQ,
      contactEmail: new RegExp(`^${em.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .sort({ createdAt: -1 })
      .lean();
    if (byEmail) return { lead: byEmail, reason: 'email' };
  }

  return null;
}

async function createMarketingLeadFromInbound(deps, rawPayload, options = {}) {
  const { MarketingLead, getNextMarketingLeadNumber } = deps;
  const payload = sanitizeLeadPayload(rawPayload, { isInbound: true });

  if (!payload.contactPhone && !payload.contactEmail) {
    const err = new Error('contactPhone or contactEmail required');
    err.statusCode = 400;
    throw err;
  }

  payload.phoneNormalized = phoneNormalized(payload.contactPhone);

  const duplicate = await findDuplicateLead(MarketingLead, {
    phone: payload.contactPhone,
    metaLeadId: payload.metaLeadId,
    email: payload.contactEmail,
  });

  const { mode } = getDedupConfig();
  const actor = options.actor || { login: 'inbound', name: options.actorName || 'Зовнішнє джерело' };
  const historyNote = options.historyNote || payload.source || 'inbound';

  if (duplicate) {
    if (mode === 'block') {
      return {
        ok: false,
        duplicate: true,
        mode,
        reason: duplicate.reason,
        existingLead: duplicate.lead,
        requestNumber: duplicate.lead.requestNumber,
      };
    }

    if (mode === 'merge') {
      const lead = await MarketingLead.findById(duplicate.lead._id);
      if (!lead) {
        const err = new Error('Duplicate lead not found');
        err.statusCode = 404;
        throw err;
      }
      const parts = [
        payload.comment,
        payload.productInterest ? `Інтерес: ${payload.productInterest}` : '',
        payload.source ? `Джерело: ${payload.source}` : '',
      ].filter(Boolean);
      const addition = parts.join(' · ');
      if (addition) {
        lead.comment = [lead.comment, addition].filter(Boolean).join('\n---\n');
      }
      if (payload.utmCampaign && !lead.utmCampaign) lead.utmCampaign = payload.utmCampaign;
      lead.marketingNotes = [lead.marketingNotes, `Повторний лід (${duplicate.reason})`]
        .filter(Boolean)
        .join('\n');
      pushStatusHistory(lead, lead.status, actor, `Об’єднано повторний лід: ${duplicate.reason}`);
      await lead.save();
      return {
        ok: true,
        duplicate: true,
        mode,
        merged: true,
        reason: duplicate.reason,
        lead,
        requestNumber: lead.requestNumber,
        id: lead._id,
      };
    }
  }

  const lead = new MarketingLead({
    ...payload,
    requestNumber: await getNextMarketingLeadNumber(),
    status: 'new',
    ipAddress: options.ipAddress || '',
    userAgent: options.userAgent || '',
    statusHistory: [{
      from: null,
      to: 'new',
      date: new Date(),
      userLogin: actor.login,
      userName: actor.name,
      note: historyNote,
    }],
  });

  if (duplicate && mode === 'warn') {
    lead.marketingNotes = [
      lead.marketingNotes,
      `⚠️ Можливий дубль (${duplicate.reason}): ${duplicate.lead.requestNumber}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  await lead.save();

  return {
    ok: true,
    duplicate: Boolean(duplicate),
    mode,
    reason: duplicate?.reason,
    existingLead: duplicate?.lead,
    lead,
    requestNumber: lead.requestNumber,
    id: lead._id,
  };
}

function verifyMetaWebhookSignature(req) {
  const secret = process.env.META_APP_SECRET || '';
  if (!secret) return true;
  const signature = req.get('x-hub-signature-256') || '';
  if (!signature || !req.rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function mapMetaFieldData(fieldData) {
  const map = {};
  (fieldData || []).forEach((row) => {
    const key = String(row.name || '').toLowerCase();
    const val = Array.isArray(row.values) ? row.values[0] : row.values;
    if (key) map[key] = val != null ? String(val).trim() : '';
  });

  const pick = (...keys) => {
    for (const k of keys) {
      if (map[k]) return map[k];
    }
    return '';
  };

  const extras = Object.entries(map)
    .filter(([k]) => !['full_name', 'first_name', 'last_name', 'phone_number', 'email', 'city'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  return {
    clientName: pick('full_name') || [pick('first_name'), pick('last_name')].filter(Boolean).join(' '),
    contactPhone: pick('phone_number', 'phone'),
    contactEmail: pick('email'),
    city: pick('city'),
    productInterest: pick('product', 'product_interest', 'which_product_are_you_interested_in?'),
    comment: extras,
  };
}

async function fetchMetaLeadData(leadgenId) {
  const token = process.env.META_PAGE_ACCESS_TOKEN || '';
  if (!token) throw new Error('META_PAGE_ACCESS_TOKEN not configured');
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Meta Graph API HTTP ${res.status}`);
  }
  return data;
}

async function processMetaLeadgenWebhook(deps, changeValue) {
  const leadgenId = changeValue?.leadgen_id;
  if (!leadgenId) return { skipped: true, reason: 'no_leadgen_id' };

  const graph = await fetchMetaLeadData(leadgenId);
  const mapped = mapMetaFieldData(graph.field_data);

  return createMarketingLeadFromInbound(deps, {
    source: 'facebook',
    ...mapped,
    metaLeadId: String(leadgenId),
    metaFormId: changeValue.form_id ? String(changeValue.form_id) : '',
    metaAdId: changeValue.ad_id ? String(changeValue.ad_id) : '',
    metaAdsetId: changeValue.adset_id ? String(changeValue.adset_id) : '',
    metaCampaignId: changeValue.campaign_id ? String(changeValue.campaign_id) : '',
    rawPayload: { webhook: changeValue, graph },
  }, {
    actorName: 'Facebook Lead Ads',
    historyNote: 'Facebook Lead Ads',
  });
}

function mapGoogleLeadColumns(userColumnData) {
  const map = {};
  (userColumnData || []).forEach((col) => {
    const id = String(col.column_id || col.column_name || '').toUpperCase();
    const val = col.string_value != null ? String(col.string_value).trim() : '';
    if (id) map[id] = val;
  });

  const pick = (...keys) => {
    for (const k of keys) {
      if (map[k]) return map[k];
    }
    return '';
  };

  const extras = Object.entries(map)
    .filter(([k]) => !['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'PHONE_NUMBER', 'EMAIL', 'CITY'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  return {
    clientName: pick('FULL_NAME') || [pick('FIRST_NAME'), pick('LAST_NAME')].filter(Boolean).join(' '),
    contactPhone: pick('PHONE_NUMBER', 'PHONE'),
    contactEmail: pick('EMAIL'),
    city: pick('CITY'),
    productInterest: pick('PRODUCT', 'PRODUCT_INTEREST'),
    comment: extras,
  };
}

async function processGoogleLeadWebhook(deps, body) {
  const googleKey = String(body?.google_key || '').trim();
  const expected = process.env.GOOGLE_LEAD_WEBHOOK_KEY || '';
  if (!expected || googleKey !== expected) {
    const err = new Error('Invalid google_key');
    err.statusCode = 401;
    throw err;
  }

  const mapped = mapGoogleLeadColumns(body.user_column_data);

  return createMarketingLeadFromInbound(deps, {
    source: 'google',
    ...mapped,
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: body.campaign_id ? String(body.campaign_id) : '',
    utmTerm: body.gcl_id ? String(body.gcl_id) : '',
    sourceDetail: body.form_id ? `form:${body.form_id}` : '',
    comment: [mapped.comment, body.lead_id ? `lead_id:${body.lead_id}` : ''].filter(Boolean).join('; '),
    rawPayload: body,
  }, {
    actorName: 'Google Ads Lead Form',
    historyNote: 'Google Ads Lead Form',
  });
}

async function telegramApi(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram API ${method} failed`);
  return data;
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

async function getBotSession(BotSession, platform, chatId) {
  return BotSession.findOne({ platform, chatId: String(chatId) });
}

async function upsertBotSession(BotSession, platform, chatId, patch) {
  return BotSession.findOneAndUpdate(
    { platform, chatId: String(chatId) },
    { $set: { ...patch, updatedAt: new Date() }, $setOnInsert: { platform, chatId: String(chatId) } },
    { upsert: true, new: true }
  );
}

async function clearBotSession(BotSession, platform, chatId) {
  await BotSession.deleteOne({ platform, chatId: String(chatId) });
}

function isValidPhone(value) {
  const d = normalizePhone(value);
  return d.length >= 10;
}

async function finalizeBotLead(deps, BotSession, platform, chatId, data) {
  const result = await createMarketingLeadFromInbound(deps, {
    source: platform,
    sourceDetail: platform === 'telegram' ? process.env.TELEGRAM_BOT_USERNAME || '' : 'viber',
    clientName: data.clientName,
    contactPhone: data.contactPhone,
    city: data.city,
    productInterest: data.productInterest,
    comment: data.comment || '',
  }, {
    actorName: platform === 'telegram' ? 'Telegram Bot' : 'Viber Bot',
    historyNote: platform,
  });

  await clearBotSession(BotSession, platform, chatId);
  return result;
}

async function handleTelegramUpdate(deps, BotSession, update) {
  const message = update.message || update.edited_message;
  if (!message || message.chat?.type !== 'private') return { handled: false };

  const chatId = message.chat.id;
  const text = String(message.text || '').trim();

  if (text === '/cancel') {
    await clearBotSession(BotSession, 'telegram', chatId);
    await sendTelegramMessage(chatId, 'Скасовано. Натисніть /start щоб почати знову.');
    return { handled: true };
  }

  let session = await getBotSession(BotSession, 'telegram', chatId);
  const step = session?.step || null;
  const data = { ...(session?.data || {}) };

  if (text === '/start' || !step) {
    await upsertBotSession(BotSession, 'telegram', chatId, { step: 'name', data: {} });
    await sendTelegramMessage(
      chatId,
      '👋 <b>DTS — заявка на обладнання</b>\n\nВведіть ваше ім’я та прізвище (або назву компанії):'
    );
    return { handled: true };
  }

  if (step === 'name') {
    if (text.length < 2) {
      await sendTelegramMessage(chatId, 'Будь ласка, введіть ім’я (мінімум 2 символи).');
      return { handled: true };
    }
    data.clientName = text;
    await upsertBotSession(BotSession, 'telegram', chatId, { step: 'phone', data });
    await sendTelegramMessage(chatId, '📞 Введіть номер телефону (+380...):');
    return { handled: true };
  }

  if (step === 'phone') {
    if (!isValidPhone(text)) {
      await sendTelegramMessage(chatId, 'Невірний формат. Введіть телефон, наприклад +380501234567');
      return { handled: true };
    }
    data.contactPhone = text;
    await upsertBotSession(BotSession, 'telegram', chatId, { step: 'city', data });
    await sendTelegramMessage(chatId, '🏙️ Введіть місто:');
    return { handled: true };
  }

  if (step === 'city') {
    data.city = text;
    await upsertBotSession(BotSession, 'telegram', chatId, { step: 'product', data });
    await sendTelegramMessage(chatId, '⚡ Який продукт вас цікавить? (потужність, тип генератора тощо)');
    return { handled: true };
  }

  if (step === 'product') {
    data.productInterest = text;
    const result = await finalizeBotLead(deps, BotSession, 'telegram', chatId, data);
    if (result.duplicate && result.mode === 'block') {
      await sendTelegramMessage(
        chatId,
        `Дякуємо! Схоже, у нас уже є ваша заявка <b>${result.requestNumber}</b>. Менеджер зв’яжеться з вами.`
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `✅ Заявку прийнято!\nНомер: <b>${result.requestNumber}</b>\nМенеджер зв’яжеться з вами найближчим часом.`
      );
    }
    return { handled: true, result };
  }

  return { handled: false };
}

async function viberApi(method, payload) {
  const token = process.env.VIBER_BOT_TOKEN || '';
  if (!token) throw new Error('VIBER_BOT_TOKEN not configured');
  const res = await fetch(`https://chatapi.viber.com/pa/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': token,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (data.status !== 0) throw new Error(data.status_message || `Viber API ${method} failed`);
  return data;
}

async function sendViberMessage(receiver, text) {
  return viberApi('send_message', {
    receiver,
    type: 'text',
    text,
    min_api_version: 1,
  });
}

async function handleViberWebhook(deps, BotSession, body) {
  const event = body?.event;
  if (event === 'conversation_started') {
    const id = body.user?.id;
    if (!id) return { handled: false };
    await upsertBotSession(BotSession, 'viber', id, { step: 'name', data: {} });
    await sendViberMessage(
      id,
      'Вітаємо! DTS — заявка на обладнання.\nВведіть ваше ім’я та прізвище (або назву компанії):'
    );
    return { handled: true };
  }

  if (event !== 'message' || body.message?.type !== 'text') return { handled: false };

  const chatId = body.sender?.id;
  const text = String(body.message?.text || '').trim();
  if (!chatId) return { handled: false };

  if (text.toLowerCase() === 'скасувати') {
    await clearBotSession(BotSession, 'viber', chatId);
    await sendViberMessage(chatId, 'Скасовано. Напишіть «старт» щоб почати знову.');
    return { handled: true };
  }

  let session = await getBotSession(BotSession, 'viber', chatId);
  const step = session?.step || null;
  const data = { ...(session?.data || {}) };

  if (text.toLowerCase() === 'старт' || !step) {
    await upsertBotSession(BotSession, 'viber', chatId, { step: 'name', data: {} });
    await sendViberMessage(chatId, 'Введіть ваше ім’я та прізвище (або назву компанії):');
    return { handled: true };
  }

  if (step === 'name') {
    data.clientName = text;
    await upsertBotSession(BotSession, 'viber', chatId, { step: 'phone', data });
    await sendViberMessage(chatId, 'Введіть номер телефону (+380...):');
    return { handled: true };
  }

  if (step === 'phone') {
    if (!isValidPhone(text)) {
      await sendViberMessage(chatId, 'Невірний формат. Введіть телефон, наприклад +380501234567');
      return { handled: true };
    }
    data.contactPhone = text;
    await upsertBotSession(BotSession, 'viber', chatId, { step: 'city', data });
    await sendViberMessage(chatId, 'Введіть місто:');
    return { handled: true };
  }

  if (step === 'city') {
    data.city = text;
    await upsertBotSession(BotSession, 'viber', chatId, { step: 'product', data });
    await sendViberMessage(chatId, 'Який продукт вас цікавить?');
    return { handled: true };
  }

  if (step === 'product') {
    data.productInterest = text;
    const result = await finalizeBotLead(deps, BotSession, 'viber', chatId, data);
    await sendViberMessage(
      chatId,
      result.duplicate && result.mode === 'block'
        ? `Дякуємо! У нас уже є заявка ${result.requestNumber}. Менеджер зв’яжеться з вами.`
        : `Заявку прийнято! Номер: ${result.requestNumber}`
    );
    return { handled: true, result };
  }

  return { handled: false };
}

function getIntegrationStatus() {
  const baseUrl = process.env.MARKETING_PUBLIC_BASE_URL
    || process.env.RENDER_EXTERNAL_URL
    || 'https://darex-trading-solutions.onrender.com';

  return {
    baseUrl,
    inbound: Boolean(process.env.MARKETING_INBOUND_API_KEY),
    meta: Boolean(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_VERIFY_TOKEN),
    google: Boolean(process.env.GOOGLE_LEAD_WEBHOOK_KEY),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    viber: Boolean(process.env.VIBER_BOT_TOKEN),
    dedup: getDedupConfig(),
    webhooks: {
      meta: `${baseUrl}/api/marketing/webhooks/meta`,
      google: `${baseUrl}/api/marketing/webhooks/google`,
      telegram: `${baseUrl}/api/marketing/webhooks/telegram`,
      viber: `${baseUrl}/api/marketing/webhooks/viber`,
      inbound: `${baseUrl}/api/marketing/leads/inbound`,
    },
  };
}

module.exports = {
  getDedupConfig,
  phoneNormalized,
  createMarketingLeadFromInbound,
  verifyMetaWebhookSignature,
  processMetaLeadgenWebhook,
  processGoogleLeadWebhook,
  handleTelegramUpdate,
  handleViberWebhook,
  telegramApi,
  viberApi,
  getIntegrationStatus,
};
