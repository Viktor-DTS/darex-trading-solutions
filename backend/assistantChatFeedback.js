/**
 * Зворотний зв’язок на відповіді асистента (👍/👎) — зберігання в асистентській MongoDB.
 */
const mongoose = require('mongoose');

const MAX_FEEDBACK_COMMENT = 500;

function isAssistantAdminRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'administrator' || r === 'mgradm';
}

function validObjectId(id) {
  return Boolean(id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24);
}

function mapMessageForClient(m) {
  const fb = m.feedback;
  const hasFeedback = fb && fb.ratedAt;
  return {
    id: String(m._id),
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    feedback: hasFeedback
      ? {
          helpful: Boolean(fb.helpful),
          comment: String(fb.comment || '').slice(0, MAX_FEEDBACK_COMMENT),
          ratedAt: fb.ratedAt,
        }
      : null,
  };
}

/**
 * @param {import('mongoose').Model} Msg
 * @param {import('mongoose').Model} Conv
 * @param {string} login
 * @param {string} messageId
 * @param {{ helpful: boolean, comment?: string }} payload
 */
async function submitAssistantMessageFeedback(Msg, Conv, login, messageId, payload) {
  if (!validObjectId(messageId)) {
    const err = new Error('Невірний ідентифікатор повідомлення');
    err.status = 400;
    throw err;
  }

  if (typeof payload.helpful !== 'boolean') {
    const err = new Error('Поле helpful має бути true (корисно) або false (не те)');
    err.status = 400;
    throw err;
  }

  const msg = await Msg.findById(messageId).lean();
  if (!msg) {
    const err = new Error('Повідомлення не знайдено');
    err.status = 404;
    throw err;
  }
  if (msg.role !== 'assistant') {
    const err = new Error('Оцінити можна лише відповіді асистента');
    err.status = 400;
    throw err;
  }

  const conv = await Conv.findOne({
    _id: msg.conversationId,
    userLogin: login,
  })
    .select('_id')
    .lean();

  if (!conv) {
    const err = new Error('Діалог не знайдено або немає доступу');
    err.status = 404;
    throw err;
  }

  const comment = String(payload.comment || '')
    .trim()
    .slice(0, MAX_FEEDBACK_COMMENT);

  const feedback = {
    helpful: payload.helpful,
    comment,
    ratedAt: new Date(),
    userLogin: login,
  };

  await Msg.updateOne({ _id: messageId }, { $set: { feedback } });

  return {
    messageId: String(messageId),
    feedback: {
      helpful: feedback.helpful,
      comment: feedback.comment,
      ratedAt: feedback.ratedAt,
    },
  };
}

/**
 * Звіт для адмінів: негативні оцінки та загальна статистика.
 * @param {import('mongoose').Model} Msg
 * @param {import('mongoose').Model} Conv
 * @param {{ days?: number, limit?: number }} opts
 */
async function buildAssistantFeedbackReport(Msg, Conv, opts = {}) {
  const days = Math.min(90, Math.max(1, parseInt(String(opts.days ?? 7), 10) || 7));
  const limit = Math.min(100, Math.max(1, parseInt(String(opts.limit ?? 40), 10) || 40));
  const since = new Date(Date.now() - days * 86400000);

  const rated = await Msg.find({
    role: 'assistant',
    'feedback.ratedAt': { $gte: since },
  })
    .select('feedback conversationId content createdAt')
    .lean();

  let positive = 0;
  let negative = 0;
  for (const m of rated) {
    if (m.feedback?.helpful === true) positive += 1;
    else if (m.feedback?.helpful === false) negative += 1;
  }

  const negativeRows = rated
    .filter((m) => m.feedback?.helpful === false)
    .sort((a, b) => new Date(b.feedback.ratedAt) - new Date(a.feedback.ratedAt))
    .slice(0, limit);

  const convIds = [...new Set(negativeRows.map((m) => String(m.conversationId)).filter(Boolean))];
  const convMap = new Map();
  if (convIds.length) {
    const convs = await Conv.find({ _id: { $in: convIds } })
      .select('_id userLogin title')
      .lean();
    for (const c of convs) {
      convMap.set(String(c._id), c);
    }
  }

  const items = [];
  for (const m of negativeRows) {
    const convId = String(m.conversationId);
    const conv = convMap.get(convId);
    const priorUser = await Msg.findOne({
      conversationId: m.conversationId,
      role: 'user',
      createdAt: { $lt: m.createdAt },
    })
      .sort({ createdAt: -1 })
      .select('content createdAt')
      .lean();

    items.push({
      messageId: String(m._id),
      conversationId: convId,
      userLogin: conv?.userLogin || m.feedback?.userLogin || '',
      conversationTitle: conv?.title || '',
      ratedAt: m.feedback.ratedAt,
      comment: m.feedback.comment || '',
      assistantPreview: String(m.content || '').slice(0, 280),
      userQuestionPreview: priorUser ? String(priorUser.content || '').slice(0, 280) : '',
    });
  }

  const totalRated = positive + negative;
  return {
    periodDays: days,
    since,
    summary: {
      totalRated,
      positive,
      negative,
      positiveRate: totalRated > 0 ? Math.round((positive / totalRated) * 1000) / 10 : null,
    },
    negativeItems: items,
  };
}

module.exports = {
  MAX_FEEDBACK_COMMENT,
  isAssistantAdminRole,
  mapMessageForClient,
  submitAssistantMessageFeedback,
  buildAssistantFeedbackReport,
};
