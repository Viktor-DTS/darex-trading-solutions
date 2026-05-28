/**
 * Тестовий режим асистента, політика конфіденційності та самонавчання.
 */

function isAssistantTestMode() {
  const raw = process.env.ASSISTANT_CHAT_TEST_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true;
  }
  const v = String(raw).trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

const RATING_PROMPT =
  'Чим більше корисних відповідей ви позначите 👍, тим краще асистент навчається для всієї команди DTS. Будь ласка, оцінюйте відповіді.';

/** Текст для API / UI (укр.) */
function getAssistantDisclosureForClient() {
  const testMode = isAssistantTestMode();
  return {
    testMode,
    badge: testMode ? 'Тестовий режим' : null,
    title: testMode ? 'Асистент DTS — beta, тестовий режим' : 'Асистент DTS',
    ratingPrompt: RATING_PROMPT,
    lines: testMode
      ? [
          'Асистент ще в розробці — можливі помилки.',
          RATING_PROMPT,
          'Асистент бачить ваші інші збережені чати (без змішування тем без вашого «Так/Ні»).',
          '👍 зберігає відповідь у базі знань; 👎 допомагає знайти помилки.',
          'Якщо питання незрозуміле — асистент уточнить; успішна відповідь після уточнень теж потрапляє в базу знань.',
        ]
      : [
          RATING_PROMPT,
          'Контекст: поточний чат + інші ваші діалоги + база знань (👍).',
        ],
    memory: {
      persistsAcrossNewChat: true,
      crossDialogContext: true,
      topicClarification: true,
      clarifyLoopLearning: true,
      selfLearningFromThumbsUp: true,
      privacyMaskingForLlm: true,
      edrpouIsPublic: true,
      maxMessagesInThread: parseInt(String(process.env.ASSISTANT_CHAT_MAX_CONTEXT || '24'), 10) || 24,
    },
  };
}

/** Блок для LLM у кожному запиті. */
function getAssistantDisclosureLlmBlockUk() {
  return (
    '[DTS-assistant-disclosure]\n' +
    (isAssistantTestMode() ? 'Асистент DTS у **тестовому режимі**.\n' : '') +
    'Маскуються фінанси, склад, логіни/ПІБ; **ЄДРПОУ відкрито**.\n' +
    '[DTS-user-history] — інші чати цього користувача; [DTS-learned] — відповіді після 👍; рішення Так/Ні про тему теж накопичуються для навчання.\n' +
    'Заохочуй користувача ставити 👍 на корисні відповіді — це покращує асистента для всіх (коротко, не нав’язливо).\n' +
    'Якщо тема неясна — сервер уже міг запитати «Так/Ні»; поважай цей контекст.'
  );
}

module.exports = {
  isAssistantTestMode,
  getAssistantDisclosureForClient,
  getAssistantDisclosureLlmBlockUk,
  RATING_PROMPT,
};
