/**
 * Meta Етап 2: Instagram/Facebook Direct (Messaging) + коментарі.
 * Webhook: той самий POST /api/marketing/webhooks/meta (object: page | instagram).
 */

const { createMarketingLeadFromInbound } = require('./marketingIntegrations');

function phase2Enabled(flag) {
  return String(process.env[flag] || '').trim() === '1';
}

function isMessagingEnabled() {
  return phase2Enabled('META_PHASE2_MESSAGING') && Boolean(process.env.META_PAGE_ACCESS_TOKEN);
}

function isCommentsEnabled() {
  return phase2Enabled('META_PHASE2_COMMENTS') && Boolean(process.env.META_PAGE_ACCESS_TOKEN);
}

async function sendMetaMessage(recipientId, text) {
  const token = process.env.META_PAGE_ACCESS_TOKEN || '';
  if (!token || !recipientId) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: String(recipientId) },
          message: { text: String(text).slice(0, 2000) },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!data.message_id && !data.recipient_id) {
      console.warn('[META MSG]', data.error?.message || res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[META MSG]', e.message);
    return false;
  }
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
  const d = String(value || '').replace(/\D/g, '');
  return d.length >= 10;
}

function detectInstagramMessaging(event) {
  if (event.messaging_product === 'instagram') return true;
  if (event.message?.is_instagram_echo) return true;
  return false;
}

async function finalizeMetaDmLead(deps, BotSession, platform, psid, data, metaExtra = {}) {
  const isIg = platform === 'meta_ig_dm';
  const result = await createMarketingLeadFromInbound(deps, {
    source: isIg ? 'instagram' : 'facebook',
    sourceDetail: isIg ? 'Instagram Direct' : 'Facebook Messenger',
    interactionType: 'direct_message',
    clientName: data.clientName,
    contactPhone: data.contactPhone,
    city: data.city,
    productInterest: data.productInterest,
    comment: data.comment || '',
    metaPsid: String(psid),
    metaIgUsername: metaExtra.username || '',
    trafficSource: isIg ? 'instagram.com' : 'facebook.com',
    utmSource: 'meta',
    utmMedium: 'direct_message',
    utmCampaign: metaExtra.campaignHint || '',
    ...metaExtra,
  }, {
    actorName: isIg ? 'Instagram Direct' : 'Facebook Messenger',
    historyNote: isIg ? 'Instagram DM' : 'Facebook DM',
  });

  await clearBotSession(BotSession, platform, psid);
  return result;
}

async function handleMetaMessagingEvent(deps, BotSession, event) {
  if (!isMessagingEnabled()) return { skipped: true, reason: 'messaging_disabled' };
  if (event.message?.is_echo) return { skipped: true, reason: 'echo' };

  const psid = event.sender?.id;
  const text = String(event.message?.text || '').trim();
  if (!psid || !text) return { skipped: true, reason: 'no_message' };

  const isInstagram = detectInstagramMessaging(event);
  const platform = isInstagram ? 'meta_ig_dm' : 'meta_fb_dm';
  const username = event.sender?.username || '';

  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'скасувати') {
    await clearBotSession(BotSession, platform, psid);
    await sendMetaMessage(psid, 'Скасовано. Напишіть «старт» або /start, щоб подати заявку знову.');
    return { handled: true, action: 'cancel' };
  }

  let session = await getBotSession(BotSession, platform, psid);
  const step = session?.step || null;
  const data = { ...(session?.data || {}) };

  const welcome = isInstagram
    ? '👋 Вітаємо в Instagram Direct DTS!\nПодайте заявку на обладнання — введіть /start'
    : '👋 Вітаємо! DTS — заявка на обладнання.\nВведіть /start';

  if (text === '/start' || text.toLowerCase() === 'старт' || !step) {
    await upsertBotSession(BotSession, platform, psid, { step: 'name', data: { username } });
    await sendMetaMessage(
      psid,
      `${welcome}\n\nВведіть ваше ім’я та прізвище (або назву компанії):`
    );
    return { handled: true, action: 'start' };
  }

  if (step === 'name') {
    if (text.length < 2) {
      await sendMetaMessage(psid, 'Будь ласка, введіть ім’я (мінімум 2 символи).');
      return { handled: true };
    }
    data.clientName = text;
    data.username = username;
    await upsertBotSession(BotSession, platform, psid, { step: 'phone', data });
    await sendMetaMessage(psid, '📞 Введіть номер телефону (+380...):');
    return { handled: true };
  }

  if (step === 'phone') {
    if (!isValidPhone(text)) {
      await sendMetaMessage(psid, 'Невірний формат. Введіть телефон, наприклад +380501234567');
      return { handled: true };
    }
    data.contactPhone = text;
    await upsertBotSession(BotSession, platform, psid, { step: 'city', data });
    await sendMetaMessage(psid, '🏙️ Введіть місто:');
    return { handled: true };
  }

  if (step === 'city') {
    data.city = text;
    await upsertBotSession(BotSession, platform, psid, { step: 'product', data });
    await sendMetaMessage(psid, '⚡ Який продукт вас цікавить?');
    return { handled: true };
  }

  if (step === 'product') {
    data.productInterest = text;
    const result = await finalizeMetaDmLead(deps, BotSession, platform, psid, data, { username });
    const msg = result.duplicate && result.mode === 'block'
      ? `Дякуємо! У нас уже є заявка ${result.requestNumber}. Менеджер зв’яжеться з вами.`
      : `✅ Заявку прийнято!\nНомер: ${result.requestNumber}\nМенеджер зв’яжеться найближчим часом.`;
    await sendMetaMessage(psid, msg);
    return { handled: true, result };
  }

  return { skipped: true, reason: 'unknown_step' };
}

async function createCommentLead(deps, payload) {
  if (!isCommentsEnabled()) return { skipped: true, reason: 'comments_disabled' };

  const commentId = payload.metaCommentId;
  if (commentId) {
    const { MarketingLead } = deps;
    const existing = await MarketingLead.findOne({ metaCommentId: String(commentId) }).lean();
    if (existing) {
      return { ok: true, duplicate: true, requestNumber: existing.requestNumber, id: existing._id };
    }
  }

  return createMarketingLeadFromInbound(deps, payload, {
    actorName: payload.source === 'instagram' ? 'Instagram Comment' : 'Facebook Comment',
    historyNote: 'comment',
  });
}

async function handlePageFeedComment(deps, value) {
  if (value.item !== 'comment' || value.verb !== 'add') {
    return { skipped: true, reason: 'not_new_comment' };
  }

  const text = String(value.message || value.comment || '').trim();
  const from = value.from || {};
  const postId = value.post_id || value.parent_id || '';

  return createCommentLead(deps, {
    source: 'facebook',
    sourceDetail: 'Facebook Comment',
    interactionType: 'comment',
    clientName: from.name || from.id || 'Facebook user',
    metaPsid: from.id ? String(from.id) : '',
    metaCommentId: value.comment_id ? String(value.comment_id) : '',
    metaPostId: postId ? String(postId) : '',
    comment: text,
    productInterest: '',
    contactPhone: '',
    trafficSource: 'facebook.com',
    utmSource: 'meta',
    utmMedium: 'comment',
    utmContent: postId ? `post_${postId}` : '',
    utmTerm: value.comment_id ? String(value.comment_id) : '',
    priority: 'high',
    marketingNotes: 'Лід з коментаря Facebook — потрібен контакт (телефон) від маркетингу',
    rawPayload: value,
  });
}

async function handleInstagramComment(deps, value) {
  const text = String(value.text || value.message || '').trim();
  const from = value.from || {};
  const media = value.media || value.media_id || {};
  const mediaId = typeof media === 'object' ? media.id : media;
  const commentId = value.id || value.comment_id || '';

  const username = from.username || '';

  const result = await createCommentLead(deps, {
    source: 'instagram',
    sourceDetail: username ? `@${username}` : 'Instagram Comment',
    interactionType: 'comment',
    clientName: from.name || username || 'Instagram user',
    metaIgUsername: username,
    metaPsid: from.id ? String(from.id) : '',
    metaCommentId: commentId ? String(commentId) : '',
    metaMediaId: mediaId ? String(mediaId) : '',
    metaPostId: mediaId ? String(mediaId) : '',
    comment: text,
    trafficSource: 'instagram.com',
    utmSource: 'meta',
    utmMedium: 'comment',
    utmContent: mediaId ? `media_${mediaId}` : '',
    utmTerm: commentId ? String(commentId) : '',
    priority: 'high',
    marketingNotes: username
      ? `Коментар Instagram @${username} — уточнити телефон у Direct`
      : 'Коментар Instagram — уточнити телефон у Direct',
    rawPayload: value,
  });

  if (
    phase2Enabled('META_COMMENT_AUTO_REPLY')
    && username
    && result.ok
    && !result.duplicate
    && commentId
  ) {
    const replyText = process.env.META_COMMENT_REPLY_TEXT
      || `@${username} Дякуємо! Напишіть нам у Direct — оформимо заявку на обладнання DTS 🙌`;
    try {
      await replyInstagramComment(commentId, replyText);
    } catch (e) {
      console.warn('[META IG COMMENT REPLY]', e.message);
    }
  }

  return result;
}

async function replyInstagramComment(commentId, message) {
  const token = process.env.META_PAGE_ACCESS_TOKEN || '';
  if (!token) return;
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/replies?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

async function processMetaWebhookBody(deps, BotSession, body) {
  const results = [];
  const object = body.object;

  if (object === 'page') {
    for (const entry of body.entry || []) {
      for (const messaging of entry.messaging || []) {
        try {
          results.push({
            type: 'messaging',
            ...(await handleMetaMessagingEvent(deps, BotSession, messaging)),
          });
        } catch (e) {
          console.error('[META DM]', e.message);
          results.push({ type: 'messaging', error: e.message });
        }
      }

      for (const change of entry.changes || []) {
        try {
          if (change.field === 'leadgen') {
            const { processMetaLeadgenWebhook } = require('./marketingIntegrations');
            results.push({
              type: 'leadgen',
              ...(await processMetaLeadgenWebhook(deps, change.value || {})),
            });
          } else if (change.field === 'feed') {
            results.push({
              type: 'feed_comment',
              ...(await handlePageFeedComment(deps, change.value || {})),
            });
          } else {
            results.push({ type: change.field, skipped: true });
          }
        } catch (e) {
          console.error('[META CHANGE]', change.field, e.message);
          results.push({ type: change.field, error: e.message });
        }
      }
    }
  }

  if (object === 'instagram') {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        try {
          if (change.field === 'comments') {
            results.push({
              type: 'instagram_comment',
              ...(await handleInstagramComment(deps, change.value || {})),
            });
          } else if (change.field === 'messages') {
            results.push({
              type: 'instagram_message',
              ...(await handleMetaMessagingEvent(deps, BotSession, {
                ...change.value,
                messaging_product: 'instagram',
                sender: change.value?.sender || { id: change.value?.from?.id },
                message: change.value?.message || { text: change.value?.text },
              })),
            });
          } else {
            results.push({ type: change.field, skipped: true });
          }
        } catch (e) {
          console.error('[META IG]', change.field, e.message);
          results.push({ type: change.field, error: e.message });
        }
      }

      for (const messaging of entry.messaging || []) {
        try {
          results.push({
            type: 'instagram_messaging',
            ...(await handleMetaMessagingEvent(deps, BotSession, {
              ...messaging,
              messaging_product: 'instagram',
            })),
          });
        } catch (e) {
          results.push({ type: 'instagram_messaging', error: e.message });
        }
      }
    }
  }

  if (object !== 'page' && object !== 'instagram') {
    results.push({ skipped: true, reason: `unknown_object_${object}` });
  }

  return results;
}

function getMetaPhase2Status() {
  return {
    messagingEnabled: isMessagingEnabled(),
    commentsEnabled: isCommentsEnabled(),
    commentAutoReply: phase2Enabled('META_COMMENT_AUTO_REPLY'),
    envFlags: {
      META_PHASE2_MESSAGING: '1 — Instagram/Facebook Direct',
      META_PHASE2_COMMENTS: '1 — коментарі IG/FB',
      META_COMMENT_AUTO_REPLY: '1 — авто-відповідь на коментарі (опційно)',
    },
    webhookSubscriptions: {
      page: ['leadgen', 'messages', 'feed'],
      instagram: ['comments', 'messages'],
    },
    requiredPermissions: [
      'pages_messaging',
      'instagram_manage_messages',
      'instagram_manage_comments',
      'pages_manage_engagement',
      'pages_read_engagement',
      'leads_retrieval',
    ],
  };
}

module.exports = {
  processMetaWebhookBody,
  sendMetaMessage,
  getMetaPhase2Status,
  isMessagingEnabled,
  isCommentsEnabled,
};
