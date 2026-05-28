/**
 * Теми в чаті: межі потоку (Так/Ні), історія з інших діалогів користувача, навчання на рішеннях.
 */
const mongoose = require('mongoose');
const { extractRequestNumbers } = require('./assistantTaskLookup');
const { normalizeQuestionText, extractKeywords } = require('./assistantChatLearning');

const TOPIC_SUMMARY_MAX = 500;
const PENDING_MAX = 4000;
const CROSS_DIALOG_MAX_CHARS = 1800;
const MIN_PRIOR_MSGS_TO_ASK = 4;

function isAffirmative(text) {
  const s = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.!…]+$/g, '');
  return /^(так|yes|y|ок|ok|okay|згоден|згодна|підтверджую|\+|да)$/i.test(s);
}

function isNegative(text) {
  const s = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.!…]+$/g, '');
  return /^(ні|no|n|не\s*потрібно|скасувати|cancel|не)$/i.test(s);
}

let AssistantTopicMemory = null;

function getTopicMemoryModel(getAssistantConnection) {
  const conn = getAssistantConnection();
  if (!conn || conn.readyState !== 1) return null;
  if (!AssistantTopicMemory) {
    const schema = new mongoose.Schema(
      {
        userLogin: { type: String, required: true, index: true },
        conversationId: { type: mongoose.Schema.Types.ObjectId, index: true },
        newMessagePreview: { type: String, maxlength: 600 },
        priorTopicSummary: { type: String, maxlength: TOPIC_SUMMARY_MAX },
        userSaidRelated: { type: Boolean, required: true },
        keywordsNew: { type: [String], default: [] },
        keywordsPrior: { type: [String], default: [] },
      },
      { timestamps: true },
    );
    schema.index({ userLogin: 1, createdAt: -1 });
    AssistantTopicMemory =
      conn.models.AssistantTopicMemory || conn.model('AssistantTopicMemory', schema);
  }
  return AssistantTopicMemory;
}

function buildPriorTopicSummary(priorMessages) {
  const users = priorMessages.filter((m) => m.role === 'user').slice(-3);
  const parts = users.map((m) => String(m.content || '').trim().slice(0, 160)).filter(Boolean);
  return parts.join(' → ').slice(0, TOPIC_SUMMARY_MAX);
}

function keywordOverlapScore(textA, textB) {
  const ka = extractKeywords(normalizeQuestionText(textA));
  const kb = extractKeywords(normalizeQuestionText(textB));
  if (!ka.length || !kb.length) return 0;
  let match = 0;
  for (const t of kb) {
    if (ka.includes(t)) match += 1;
  }
  return match / Math.max(ka.length, kb.length);
}

function isExplicitNewTopic(text) {
  const s = String(text || '').trim().toLowerCase();
  return /^(інше|нова\s+тема|забудь|тепер\s+інш|окреме\s+пит|іншле\s+пит|нове\s+пит|перейдемо|інша\s+заяв)/iu.test(s);
}

function isExplicitContinuation(text) {
  const s = String(text || '').trim().toLowerCase();
  return /^(і\s+ще|також|продовж|стосує|про\s+те\s+ж|як\s+щодо|а\s+щодо|те\s+саме|цей\s+же|та\s+сам)/iu.test(s);
}

/**
 * @param {{ priorMessages: { role: string, content: string }[], userMessage: string }} opts
 * @returns {{ action: 'continue'|'new_topic'|'ask', priorSummary: string, reason: string }}
 */
function evaluateTopicShift(opts) {
  const prior = opts.priorMessages || [];
  const userMessage = String(opts.userMessage || '').trim();
  const priorSummary = buildPriorTopicSummary(prior);

  if (prior.length < MIN_PRIOR_MSGS_TO_ASK) {
    return { action: 'continue', priorSummary, reason: 'short_thread' };
  }

  if (isExplicitNewTopic(userMessage)) {
    return { action: 'new_topic', priorSummary, reason: 'explicit_new' };
  }
  if (isExplicitContinuation(userMessage)) {
    return { action: 'continue', priorSummary, reason: 'explicit_continue' };
  }

  const overlap = keywordOverlapScore(priorSummary, userMessage);
  const numsPrior = new Set();
  for (const m of prior.slice(-6)) {
    for (const n of extractRequestNumbers(m.content)) numsPrior.add(n.toLowerCase());
  }
  const numsCurrent = extractRequestNumbers(userMessage).map((n) => n.toLowerCase());
  const differentRequest =
    numsCurrent.length > 0 &&
    numsPrior.size > 0 &&
    numsCurrent.some((n) => !numsPrior.has(n));

  if (differentRequest && overlap < 0.25) {
    return { action: 'ask', priorSummary, reason: 'different_request_number' };
  }

  if (userMessage.length >= 12 && overlap < 0.12) {
    return { action: 'ask', priorSummary, reason: 'low_keyword_overlap' };
  }

  if (overlap >= 0.2) {
    return { action: 'continue', priorSummary, reason: 'overlap_ok' };
  }

  if (userMessage.length >= 20) {
    return { action: 'ask', priorSummary, reason: 'ambiguous' };
  }

  return { action: 'continue', priorSummary, reason: 'default_continue' };
}

function filterPriorByBoundary(prior, boundaryMessageId) {
  if (!boundaryMessageId) return prior;
  const bid = String(boundaryMessageId);
  const idx = prior.findIndex((m) => String(m._id) === bid);
  if (idx < 0) return prior;
  return prior.slice(idx + 1);
}

const TOPIC_CLARIFY_REPLY =
  'Не зовсім зрозуміло, чи ваше повідомлення **продовжує попередню тему** в цьому чаті.\n\n' +
  '**Це стосується попереднього діалогу?** Відповідайте **Так** або **Ні** (можна кнопками нижче).\n\n' +
  '• **Так** — врахую контекст цього чату.\n' +
  '• **Ні** — почну з вашого питання як з нової теми (історія інших ваших чатів у системі лишається доступною).';

/**
 * @param {() => import('mongoose').Connection | null} getAssistantConnection
 */
async function recordTopicDecisionLearning(getAssistantConnection, payload) {
  const TopicMem = getTopicMemoryModel(getAssistantConnection);
  if (!TopicMem) return null;
  const newMessagePreview = String(payload.newMessagePreview || '').slice(0, 600);
  const priorTopicSummary = String(payload.priorTopicSummary || '').slice(0, TOPIC_SUMMARY_MAX);
  return TopicMem.create({
    userLogin: String(payload.userLogin || ''),
    conversationId: payload.conversationId || null,
    newMessagePreview,
    priorTopicSummary,
    userSaidRelated: Boolean(payload.userSaidRelated),
    keywordsNew: extractKeywords(normalizeQuestionText(newMessagePreview)),
    keywordsPrior: extractKeywords(normalizeQuestionText(priorTopicSummary)),
  });
}

/**
 * Обробка відповіді Так/Ні або постановки питання про тему.
 * @returns {Promise<{
 *   shortCircuit?: boolean,
 *   reply?: string,
 *   topicMeta?: object,
 *   assistantMessageId?: string,
 *   effectiveUserMsg?: string,
 *   topicBoundaryAfterMessageId?: import('mongoose').Types.ObjectId | null,
 *   clearTopicAwaiting?: boolean,
 * }>}
 */
async function processTopicTurn({
  getAssistantConnection,
  Conv,
  convDoc,
  userMsg,
  priorMessages,
  login,
  conversationId,
}) {
  const conv = convDoc || {};

  if (conv.topicAwaitingClarification) {
    if (!isAffirmative(userMsg) && !isNegative(userMsg)) {
      return {
        shortCircuit: true,
        reply:
          'Будь ласка, відповідайте **Так** або **Ні**: чи стосується ваше попереднє повідомлення теми, про яку ми говорили?',
        topicMeta: {
          awaitingTopicConfirm: true,
          pendingMessagePreview: String(conv.topicPendingMessage || '').slice(0, 200),
          priorTopicSummary: conv.topicPriorSummary || '',
        },
      };
    }

    const related = isAffirmative(userMsg);
    const pending = String(conv.topicPendingMessage || '').trim();
    await recordTopicDecisionLearning(getAssistantConnection, {
      userLogin: login,
      conversationId,
      newMessagePreview: pending,
      priorTopicSummary: conv.topicPriorSummary || '',
      userSaidRelated: related,
    });

    let boundaryId = conv.topicBoundaryAfterMessageId || null;
    if (!related) {
      boundaryId = conv.topicClarifyAssistantMessageId || boundaryId;
    }

    await Conv.updateOne(
      { _id: conversationId },
      {
        $set: {
          topicAwaitingClarification: false,
          topicPendingMessage: '',
          topicPriorSummary: related ? conv.topicPriorSummary || '' : pending.slice(0, TOPIC_SUMMARY_MAX),
          topicBoundaryAfterMessageId: related ? conv.topicBoundaryAfterMessageId || null : boundaryId,
          topicClarifyAssistantMessageId: null,
        },
      },
    ).catch(() => {});

    return {
      effectiveUserMsg: pending || userMsg,
      topicBoundaryAfterMessageId: related ? conv.topicBoundaryAfterMessageId || null : boundaryId,
      clearTopicAwaiting: true,
      topicMeta: { completed: true, userSaidRelated: related },
    };
  }

  const evaluation = evaluateTopicShift({
    priorMessages: priorMessages,
    userMessage: userMsg,
  });

  if (evaluation.action === 'new_topic') {
    const lastId = priorMessages.length ? priorMessages[priorMessages.length - 1]._id : null;
    await Conv.updateOne(
      { _id: conversationId },
      {
        $set: {
          topicBoundaryAfterMessageId: lastId,
          topicPriorSummary: userMsg.slice(0, TOPIC_SUMMARY_MAX),
        },
      },
    ).catch(() => {});
    return {
      effectiveUserMsg: userMsg,
      topicBoundaryAfterMessageId: lastId,
    };
  }

  if (evaluation.action === 'ask') {
    return {
      shortCircuit: true,
      reply: TOPIC_CLARIFY_REPLY,
      topicMeta: {
        awaitingTopicConfirm: true,
        priorTopicSummary: evaluation.priorSummary,
        pendingMessagePreview: userMsg.slice(0, 200),
        reason: evaluation.reason,
      },
      setAwaiting: {
        topicPendingMessage: userMsg.slice(0, PENDING_MAX),
        topicPriorSummary: evaluation.priorSummary,
      },
    };
  }

  return {
    effectiveUserMsg: userMsg,
    topicBoundaryAfterMessageId: conv.topicBoundaryAfterMessageId || null,
  };
}

/**
 * @param {import('./assistantChatPrivacy').PrivacyMaskSession} maskSession
 */
async function buildCrossDialogContextForLlm({
  Msg,
  Conv,
  login,
  currentConversationId,
  userMessage,
  maskSession,
}) {
  const otherConvs = await Conv.find({
    userLogin: login,
    _id: { $ne: currentConversationId },
  })
    .sort({ updatedAt: -1 })
    .limit(5)
    .select('_id title updatedAt')
    .lean();

  if (!otherConvs.length) return '';

  const queryNorm = normalizeQuestionText(userMessage);
  const queryKw = extractKeywords(queryNorm);
  const lines = [];

  for (const c of otherConvs) {
    const msgs = await Msg.find({ conversationId: c._id })
      .sort({ createdAt: -1 })
      .limit(6)
      .select('role content createdAt')
      .lean();
    const chron = [...msgs].reverse();
    const userMsgs = chron.filter((m) => m.role === 'user');
    for (const um of userMsgs.slice(-2)) {
      const text = String(um.content || '').trim();
      if (!text) continue;
      const score =
        queryKw.length === 0
          ? 0
          : extractKeywords(normalizeQuestionText(text)).filter((k) => queryKw.includes(k)).length;
      if (queryKw.length && score === 0 && lines.length >= 2) continue;
      const title = String(c.title || 'Чат').slice(0, 60);
      lines.push(`• «${title}»: ${maskSession.mask(text.slice(0, 220))}`);
      if (lines.join('\n').length > CROSS_DIALOG_MAX_CHARS) break;
    }
    if (lines.length >= 6 || lines.join('\n').length > CROSS_DIALOG_MAX_CHARS) break;
  }

  if (!lines.length) return '';

  return (
    '[DTS-user-history] Фрагменти з **інших збережених чатів** цього користувача в DTS (масковано для моделі). ' +
    'Використовуй лише якщо релевантно поточному питанню; не змішуй теми без підтвердження:\n' +
    lines.join('\n')
  );
}

module.exports = {
  isAffirmative,
  isNegative,
  evaluateTopicShift,
  filterPriorByBoundary,
  processTopicTurn,
  buildCrossDialogContextForLlm,
  recordTopicDecisionLearning,
  getTopicMemoryModel,
  TOPIC_CLARIFY_REPLY,
};
