/**
 * Нормалізація людського тексту перед lookup/statistics/discovery.
 * Толерантність до опечаток, скорочень, розмовних форм українською.
 *
 * Важливо: у Node.js `\w` часто НЕ матчить кирилицю — використовуємо `\p{L}`.
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
  s = s.replace(/^мене\s+цікав\p{L}*\s+/iu, '');
  s = s
    .replace(/zayav/g, 'заяв')
    .replace(/skilky|skilki|skilko/g, 'скільки')
    .replace(/kilky|kilki|kilko/g, 'кільки')
    .replace(/kontragent/g, 'контрагент')
    .replace(/klient/g, 'клієнт')
    .replace(/privat/g, 'приват')
    .replace(/romashka/g, 'ромашка');
  return s.trim();
}

/** Прибирає з назви клієнта хвост «в роботі», «виконано» тощо. */
function sanitizeClientSearchTerm(name) {
  let s = normalizeQueryText(name);
  s = s.replace(/\s+(?:в|у)\s+робот\p{L}*.*$/iu, '');
  s = s.replace(/\s+(?:статус|не\s+в\s+робот\p{L}*|виконан\p{L}*).*$/iu, '');
  return s.trim().replace(/[,.?]$/, '');
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

/** @param {string} raw */
function cleanClientCandidate(raw) {
  const name = sanitizeClientSearchTerm(raw);
  if (name.length < 2) return null;
  if (/^(?:регіон|київ|львів|одес|дніпр|хмельниц|україн)$/iu.test(name)) return null;
  if (/^(?:в\s+)?робот|статус|заявк\p{L}*$/iu.test(name)) return null;
  return name;
}

/** @param {string} text */
function extractClientNameCandidate(text) {
  const s = normalizeQueryText(text);
  const patterns = [
    /(?:контрагент\p{L}*|клієнт\p{L}*|компан\p{L}*|у\s+клієнта|у\s+контрагента|для\s+клієнта|для\s+контрагента)\s+["']?([^"'\n.?]{2,80})/iu,
    /(?:скільк\p{L}*|кільк\p{L}*)\s+заяв\p{L}*\s+по\s+([^?\n.]{2,60})/iu,
    /(?:скільк\p{L}*|кільк\p{L}*)\s+заяв\p{L}*(?:\s+(?:у|в|для|по))?\s+([^?\n.]{2,60})/iu,
    /заяв\p{L}*\s+(?:у|в|для|по)\s+([^?\n.]{2,60})/iu,
    /заяв\p{L}*\s+по\s+([^?\n.]{2,60})/iu,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m?.[1]) continue;
    const cleaned = cleanClientCandidate(m[1]);
    if (cleaned) return cleaned;
  }
  return null;
}

/** @param {string} text */
function looksLikeCountQuestion(text) {
  const s = softenForMatching(text);
  return /(?:скільк\p{L}*|кільк\p{L}*|число|підрахун\p{L}*|count|how\s+many)/iu.test(s);
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
    /заявк\p{L}*\s+\d{2,8}/iu.test(s)
  );
}

module.exports = {
  normalizeQueryText,
  softenForMatching,
  sanitizeClientSearchTerm,
  resolveEffectiveQuery,
  extractEdrpouDigits,
  extractClientNameCandidate,
  looksLikeCountQuestion,
  looksLikeNavigationQuestion,
  looksLikeTaskDetailQuestion,
};
