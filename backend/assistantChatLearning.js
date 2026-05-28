/**
 * База знань асистента: успішні відповіді (👍) зберігаються в асистентській MongoDB.
 * У GPT передаються лише після маскування конфіденційних полів.
 */
const mongoose = require('mongoose');

const MAX_QUESTION = 2000;
const MAX_ANSWER = 8000;
const MAX_LEARNED_IN_PROMPT = 3;

let AssistantKnowledge = null;

function getKnowledgeModel(getAssistantConnection) {
  const conn = getAssistantConnection();
  if (!conn || conn.readyState !== 1) return null;
  if (!AssistantKnowledge) {
    const schema = new mongoose.Schema(
      {
        questionRaw: { type: String, required: true, maxlength: MAX_QUESTION },
        questionNorm: { type: String, required: true, index: true },
        answerRaw: { type: String, required: true, maxlength: MAX_ANSWER },
        panelId: { type: String, default: '', index: true },
        keywords: { type: [String], default: [] },
        helpfulCount: { type: Number, default: 1 },
        sourceMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
        sourceConversationId: { type: mongoose.Schema.Types.ObjectId, default: null },
        active: { type: Boolean, default: true },
      },
      { timestamps: true },
    );
    schema.index({ active: 1, helpfulCount: -1, updatedAt: -1 });
    AssistantKnowledge =
      conn.models.AssistantKnowledge || conn.model('AssistantKnowledge', schema);
  }
  return AssistantKnowledge;
}

const STOP_WORDS = new Set([
  'і',
  'в',
  'на',
  'що',
  'як',
  'до',
  'за',
  'у',
  'з',
  'не',
  'або',
  'для',
  'це',
  'та',
  'the',
  'a',
  'an',
  'is',
  'are',
  'про',
  'де',
  'чи',
  'від',
  'при',
  'без',
  'dts',
]);

function normalizeQuestionText(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUESTION);
}

function extractKeywords(norm) {
  return [...new Set(norm.split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w)))].slice(0, 24);
}

function scoreQuestionMatch(queryNorm, queryKeywords, entry) {
  const eq = String(entry.questionNorm || '');
  if (!eq) return 0;
  if (eq === queryNorm) return 100;
  if (queryNorm.length >= 8 && (eq.includes(queryNorm) || queryNorm.includes(eq))) return 80;

  let score = 0;
  for (const t of queryKeywords) {
    if (eq.includes(t)) score += 1;
  }
  return score;
}

/**
 * @param {() => import('mongoose').Connection | null} getAssistantConnection
 */
async function recordPositiveKnowledge(getAssistantConnection, payload) {
  const Knowledge = getKnowledgeModel(getAssistantConnection);
  if (!Knowledge) return null;

  const questionRaw = String(payload.questionRaw || '').trim().slice(0, MAX_QUESTION);
  const answerRaw = String(payload.answerRaw || '').trim().slice(0, MAX_ANSWER);
  if (questionRaw.length < 6 || answerRaw.length < 12) return null;

  const questionNorm = normalizeQuestionText(questionRaw);
  const keywords = extractKeywords(questionNorm);
  const panelId = String(payload.panelId || '').trim().slice(0, 80);

  const existing = await Knowledge.findOne({ active: true, questionNorm }).lean();
  if (existing) {
    await Knowledge.updateOne(
      { _id: existing._id },
      { $set: { answerRaw, panelId: panelId || existing.panelId, keywords }, $inc: { helpfulCount: 1 } },
    );
    return { id: String(existing._id), updated: true };
  }

  const similar = await Knowledge.find({ active: true })
    .sort({ helpfulCount: -1 })
    .limit(80)
    .lean();

  for (const row of similar) {
    const sc = scoreQuestionMatch(questionNorm, keywords, row);
    if (sc >= 80 || (keywords.length >= 2 && sc >= keywords.length - 1)) {
      await Knowledge.updateOne(
        { _id: row._id },
        { $set: { answerRaw, keywords }, $inc: { helpfulCount: 1 } },
      );
      return { id: String(row._id), merged: true };
    }
  }

  const doc = await Knowledge.create({
    questionRaw,
    questionNorm,
    answerRaw,
    panelId,
    keywords,
    sourceMessageId: payload.sourceMessageId || null,
    sourceConversationId: payload.sourceConversationId || null,
    helpfulCount: 1,
    active: true,
  });
  return { id: String(doc._id), created: true };
}

/**
 * @param {() => import('mongoose').Connection | null} getAssistantConnection
 * @param {import('./assistantChatPrivacy').PrivacyMaskSession} maskSession
 */
async function buildLearnedContextForLlm(getAssistantConnection, userMessage, panelId, maskSession) {
  const Knowledge = getKnowledgeModel(getAssistantConnection);
  if (!Knowledge) return '';

  const queryNorm = normalizeQuestionText(userMessage);
  const keywords = extractKeywords(queryNorm);
  if (!keywords.length && queryNorm.length < 6) return '';

  const rows = await Knowledge.find({ active: true }).sort({ helpfulCount: -1, updatedAt: -1 }).limit(120).lean();

  const scored = rows
    .map((e) => ({ e, score: scoreQuestionMatch(queryNorm, keywords, e) }))
    .filter((x) => x.score >= 2 || (keywords.length === 1 && x.score >= 1))
    .sort((a, b) => b.score - a.score || (b.e.helpfulCount || 0) - (a.e.helpfulCount || 0))
    .slice(0, MAX_LEARNED_IN_PROMPT);

  if (!scored.length) return '';

  const parts = scored.map(({ e }, i) => {
    const q = maskSession.mask(String(e.questionRaw || ''));
    const a = maskSession.mask(String(e.answerRaw || ''));
    return `[${i + 1}] Питання: ${q}\nВідповідь (перевірена користувачами, 👍×${e.helpfulCount || 1}): ${a}`;
  });

  return (
    '[DTS-learned] Приклади успішних відповідей з внутрішньої бази DTS (конфіденційні поля замінені). ' +
    'Якщо релевантно — узгодь стиль і структуру, але перевір актуальність із [DTS] / [DTS/UI] у поточному повідомленні:\n' +
    parts.join('\n\n')
  );
}

async function getKnowledgeStats(getAssistantConnection) {
  const Knowledge = getKnowledgeModel(getAssistantConnection);
  if (!Knowledge) return { total: 0, top: [] };
  const total = await Knowledge.countDocuments({ active: true });
  const top = await Knowledge.find({ active: true })
    .sort({ helpfulCount: -1 })
    .limit(5)
    .select('questionRaw helpfulCount panelId updatedAt')
    .lean();
  return {
    total,
    top: top.map((r) => ({
      questionPreview: String(r.questionRaw || '').slice(0, 120),
      helpfulCount: r.helpfulCount,
      panelId: r.panelId || '',
      updatedAt: r.updatedAt,
    })),
  };
}

module.exports = {
  getKnowledgeModel,
  normalizeQuestionText,
  extractKeywords,
  recordPositiveKnowledge,
  buildLearnedContextForLlm,
  getKnowledgeStats,
};
