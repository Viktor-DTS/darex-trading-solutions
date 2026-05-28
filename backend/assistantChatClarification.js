/**
 * Цикл уточнень: GPT питає → користувач відповідає → фінальна відповідь → база знань.
 * Маркер [DTS-clarify] у відповіді моделі — питання користувачу (після unmask).
 */
const { recordPositiveKnowledge } = require('./assistantChatLearning');

const MAX_CLARIFY_ROUNDS = parseInt(String(process.env.ASSISTANT_CHAT_MAX_CLARIFY_ROUNDS || '5'), 10) || 5;

function clarificationEnabled() {
  const raw = process.env.ASSISTANT_CHAT_CLARIFICATION;
  if (raw === undefined || raw === null || String(raw).trim() === '') return true;
  const v = String(raw).trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

function buildClarifyFollowUpBlock(convDoc, userReply) {
  const root = String(convDoc?.clarifyRootQuestion || '').trim();
  const round = (convDoc?.clarifyRound || 0) + 1;
  return (
    '[DTS-clarify-follow-up]\n' +
    `Початкове питання користувача: ${root}\n` +
    `Раунд уточнення ${round} з ${MAX_CLARIFY_ROUNDS}.\n` +
    `Відповідь користувача на ваші питання: ${String(userReply || '').trim()}\n` +
    'Дай **фінальну** відповідь по системі DTS на основі наявних даних і відповідей.\n' +
    'Якщо критично не вистачає одного-двох фактів — знову додай блок [DTS-clarify] з 1–3 короткими питаннями українською.\n' +
    'Не вигадуй факти з бази; не повторюй уже задані питання.'
  );
}

/**
 * @param {string} content — уже unmasked текст для користувача/БД
 */
function parseClarifyResponse(content) {
  const raw = String(content || '').trim();
  const markerRe = /\[DTS-clarify\]/i;
  const idx = raw.search(markerRe);
  if (idx < 0) {
    return {
      needsClarification: false,
      userReply: raw.replace(/\[DTS-clarify-follow-up\]/gi, '').trim(),
    };
  }
  const before = raw.slice(0, idx).trim();
  const questions = raw.slice(idx).replace(markerRe, '').trim();
  const userReply =
    [before, questions].filter(Boolean).join('\n\n').trim() || questions;
  return { needsClarification: true, userReply, questionsText: questions };
}

/**
 * Додати блок follow-up до payload LLM (маскується разом із рештою).
 */
function appendClarifyFollowUpToPrompt(contentForChat, convDoc, userMsg) {
  if (!convDoc?.clarifyAwaitingUser) return contentForChat;
  return `${contentForChat}\n\n${buildClarifyFollowUpBlock(convDoc, userMsg)}`;
}

/**
 * Після відповіді LLM: оновити стан діалогу, зберегти знання, підготувати reply для клієнта.
 * @param {object} params
 */
async function applyClarificationTurn({
  getAssistantConnection,
  Conv,
  convDoc,
  conversationId,
  userMsg,
  rawAssistantReply,
  panelId,
  assistantMessageId,
}) {
  const parsed = parseClarifyResponse(rawAssistantReply);
  const reply = parsed.userReply;
  /** @type {Record<string, unknown>} */
  const convUpdate = { updatedAt: new Date() };
  /** @type {Record<string, unknown> | null} */
  let clarifyMeta = null;

  if (parsed.needsClarification) {
    const starting = !convDoc?.clarifyAwaitingUser;
    const nextRound = starting ? 1 : (convDoc?.clarifyRound || 0) + 1;

    if (nextRound > MAX_CLARIFY_ROUNDS) {
      Object.assign(convUpdate, {
        clarifyAwaitingUser: false,
        clarifyRound: 0,
        clarifyRootQuestion: '',
      });
      return {
        reply:
          `${reply}\n\n` +
          '_(Досягнуто ліміт уточнень — відповідаю на основі наявної інформації. За потреби уточніть деталі окремим повідомленням.)_',
        clarifyMeta: { maxRoundsReached: true },
        convUpdate,
        learned: null,
      };
    }

    Object.assign(convUpdate, {
      clarifyAwaitingUser: true,
      clarifyRootQuestion: String(convDoc?.clarifyRootQuestion || userMsg || '').trim().slice(0, 4000),
      clarifyRound: nextRound,
    });

    clarifyMeta = {
      awaitingClarification: true,
      round: nextRound,
      rootQuestionPreview: String(convDoc?.clarifyRootQuestion || userMsg || '')
        .trim()
        .slice(0, 200),
    };

    return { reply, clarifyMeta, convUpdate, learned: null };
  }

  const hadClarificationLoop =
    Boolean(convDoc?.clarifyAwaitingUser) || (convDoc?.clarifyRound || 0) > 0;
  const rootQuestion = String(convDoc?.clarifyRootQuestion || userMsg || '').trim();

  Object.assign(convUpdate, {
    clarifyAwaitingUser: false,
    clarifyRound: 0,
    clarifyRootQuestion: '',
  });

  let learned = null;
  if (hadClarificationLoop && rootQuestion.length >= 6 && reply.length >= 12) {
    learned = await recordPositiveKnowledge(getAssistantConnection, {
      questionRaw: rootQuestion,
      answerRaw: reply,
      panelId,
      sourceMessageId: assistantMessageId,
      sourceConversationId: conversationId,
    });
    if (learned) {
      clarifyMeta = {
        learnedSaved: true,
        knowledgeId: learned.id,
        viaClarification: true,
      };
    }
  }

  return { reply, clarifyMeta, convUpdate, learned };
}

module.exports = {
  clarificationEnabled,
  MAX_CLARIFY_ROUNDS,
  appendClarifyFollowUpToPrompt,
  parseClarifyResponse,
  applyClarificationTurn,
};
