/**
 * Нормалізація людського тексту перед lookup/statistics/discovery.
 * Толерантність до опечаток, скорочень, розмовних форм українською.
 */

const FILLER_PREFIX =
  /^(?:підкаж(?:и|іть)|скаж(?:и|іть)|поясн(?:и|іть)|покаж(?:и|іть)|знайд(?:и|іть)|де\s+(?:тут\s+)?|як\s+(?:тут\s+)?|ну\s+|будь\s+ласка\s+|pls\s+|please\s+)/iu;

/** @param {string} text */
function normalizeQueryText(text) {
  return String(text || '')
    .replace(/\u2019/g, "'")
    .replace(/[«»""„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} text */
function softenForMatching(text) {
  let s = normalizeQueryText(text).toLowerCase();
  s = s.replace(FILLER_PREFIX, '');
  // типові опечатки / трансліт (не повна transliteration — лише часті)
  s = s
    .replace(/zayav/g, 'заяв')
    .replace(/skilky|skilki|skilko/g, 'скільки')
    .replace(/kilky|kilki|kilko/g, 'кільки')
    .replace(/kontragent/g, 'контрагент')
    .replace(/klient/g, 'клієнт')
    .replace(/romashka/g, 'ромашка');
  return s.trim();
}

/** @param {{ role: string, content: string }[]} priorMessages @param {string} currentMsg */
function resolveEffectiveQuery(currentMsg, priorMessages) {
  const current = normalizeQueryText(currentMsg);
  if (!current) return current;

  const isFollowUp =
    current.length <= 120 &&
    /^(?:а|і|теж|також|ще|ок|добре|тоді|ну)\b[,\s]/iu.test(current);

  if (!isFollowUp || !Array.isArray(priorMessages) || !priorMessages.length) {
    return current;
  }

  const lastUser = [...priorMessages].reverse().find((m) => m.role === 'user' && String(m.content || '').trim());
  if (!lastUser) return current;

  const prev = normalizeQueryText(lastUser.content);
  if (!prev) return current;

  return `${prev} (уточнення користувача: ${current})`;
}

/** @param {string} text */
function extractEdrpouDigits(text) {
  const s = String(text || '');
  const m = s.match(/\b(\d{8,10})\b/);
  return m ? m[1] : null;
}

/** @param {string} text */
function extractClientNameCandidate(text) {
  const s = normalizeQueryText(text);
  const patterns = [
    /(?:контрагент\w*|клієнт\w*|компан\w*|у\s+клієнта|у\s+контрагента|для\s+клієнта|для\s+контрагента)\s+["']?([^"'\n.?]{2,80})/iu,
    /(?:скільк\w*|кільк\w*)\s+заяв\w*(?:\s+(?:у|в|для|по))?\s+([^?\n.]{2,60})/iu,
    /заяв\w*\s+(?:у|в|для|по)\s+([^?\n.]{2,60})/iu,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m?.[1]) continue;
    const name = m[1].trim().replace(/[,.?]$/, '');
    if (name.length < 2) continue;
    if (/^(?:регіон|київ|львів|одес|дніпр|хмельниц|україн|в\s+робот|статус)/iu.test(name)) continue;
    return name;
  }
  return null;
}

/** @param {string} text */
function looksLikeCountQuestion(text) {
  const s = softenForMatching(text);
  return /(?:скільк\w*|кільк\w*|число|підрахун\w*|count|how\s+many)/iu.test(s);
}

/** @param {string} text */
function looksLikeNavigationQuestion(text) {
  const s = softenForMatching(text);
  return (
    /(?:де\s+(?:знайти|кнопка|вкладка|розділ|форма|створити|подати|відкрити)|як\s+(?:створити|подати|знайти|відкрити|зробити)|куди\s+(?:натиснути|йти)|де\s+тут)/iu.test(
      s,
    ) || /(?:покаж(?:и|іть)\s+де|де\s+знаходиться)/iu.test(s)
  );
}

/** @param {string} text */
function looksLikeTaskDetailQuestion(text) {
  const s = softenForMatching(text);
  return (
    /(?:покаж(?:и|іть)|відкри(?:й|йте)|детал(?:і|и)|що\s+в\s+заяв|інфо\s+по\s+заяв|статус\s+заяв)/iu.test(s) ||
    /\b(?:kv|nu|dp|lv)[-\s]?\d{2,}/iu.test(s) ||
    /заявк\w*\s+\d{2,8}/iu.test(s)
  );
}

module.exports = {
  normalizeQueryText,
  softenForMatching,
  resolveEffectiveQuery,
  extractEdrpouDigits,
  extractClientNameCandidate,
  looksLikeCountQuestion,
  looksLikeNavigationQuestion,
  looksLikeTaskDetailQuestion,
};
