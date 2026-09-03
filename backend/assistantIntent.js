/**
 * Розуміння наміру користувача перед lookup/LLM (опечатки, follow-up, сутність).
 */
const {
  normalizeQueryText,
  softenForMatching,
  resolveEffectiveQuery,
  extractEdrpouDigits,
  extractClientNameCandidate,
  looksLikeCountQuestion,
  looksLikeNavigationQuestion,
  looksLikeTaskDetailQuestion,
} = require('./assistantQueryNormalize');
const { isCounterpartyStatisticsQuery } = require('./assistantTaskStatistics');

/**
 * @param {{ message: string, priorMessages?: { role: string, content: string }[], currentPanelId?: string }} input
 */
function analyzeAssistantQuery(input) {
  const raw = normalizeQueryText(input.message);
  const prior = input.priorMessages || [];
  const effectiveText = resolveEffectiveQuery(raw, prior);
  const normalized = softenForMatching(effectiveText);

  /** @type {Record<string, string | null>} */
  const entities = {
    client: extractClientNameCandidate(effectiveText),
    edrpou: extractEdrpouDigits(effectiveText),
    region: null,
  };

  const regionMatch = normalized.match(
    /(?:регіон\s+|по\s+)(?:київ|львів|одес|дніпр|хмельниц|україн)/iu,
  );
  if (regionMatch) {
    entities.region = regionMatch[0].replace(/^(?:регіон\s+|по\s+)/iu, '').trim();
  }

  /** @type {string} */
  let intent = 'general';
  if (looksLikeNavigationQuestion(effectiveText)) intent = 'navigation';
  else if (isCounterpartyStatisticsQuery(effectiveText)) intent = 'counterparty_stats';
  else if (looksLikeCountQuestion(effectiveText) && /заяв\p{L}*/iu.test(normalized)) intent = 'statistics';
  else if (looksLikeTaskDetailQuestion(effectiveText)) intent = 'task_lookup';
  else if (extractEdrpouDigits(effectiveText) || /(?:телефон|серійн|заводськ)/iu.test(normalized)) {
    intent = 'discovery';
  }

  const llmBlock = buildIntentLlmBlock({
    intent,
    effectiveText,
    raw,
    entities,
    normalized,
    isFollowUp: effectiveText !== raw,
  });

  return {
    raw,
    effectiveText,
    normalizedText: normalized,
    intent,
    entities,
    llmBlock,
    isFollowUp: effectiveText !== raw,
  };
}

/** @param {object} p */
function buildIntentLlmBlock(p) {
  const parts = [
    '[DTS-intent]',
    `Інтерпретація запиту (для моделі; не цитуй дослівно користувачу):`,
    `- Намір: ${p.intent}`,
  ];
  if (p.isFollowUp) {
    parts.push('- Це уточнення до попереднього питання в треді — врахуй контекст діалогу.');
  }
  if (p.entities.client) parts.push(`- Можливий контрагент/клієнт: ${p.entities.client}`);
  if (p.entities.edrpou) parts.push(`- ЄДРПОУ в тексті: ${p.entities.edrpou}`);
  if (p.entities.region) parts.push(`- Регіон у тексті: ${p.entities.region}`);
  parts.push(
    '- Користувачі пишуть з опечатками, скороченнями, розмовно — відповідай по змісту, не проси перефразувати без потреби.',
  );
  if (p.intent === 'general' && p.raw.length < 25) {
    parts.push('- Коротке повідомлення: якщо неясно — одне уточнююче питання, не кілька раундів.');
  }
  return parts.join('\n');
}

module.exports = {
  analyzeAssistantQuery,
  buildIntentLlmBlock,
};
