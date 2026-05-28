/**
 * Захист від зациклених / надто довгих відповідей LLM.
 */

const DEFAULT_MAX_REPLY_CHARS = 4000;
const CASUAL_MAX_REPLY_CHARS = 900;

function maxReplyChars(casual) {
  const raw = parseInt(
    String(process.env.ASSISTANT_CHAT_MAX_REPLY_CHARS || String(DEFAULT_MAX_REPLY_CHARS)),
    10,
  );
  const base = Math.min(12000, Math.max(800, raw || DEFAULT_MAX_REPLY_CHARS));
  return casual ? Math.min(base, CASUAL_MAX_REPLY_CHARS) : base;
}

/** Жарт, анекдот, вірш тощо — коротка відповідь. */
function isCasualOffTopicUserMessage(text) {
  const s = String(text || '').toLowerCase();
  if (/розкаж(?:и|іть)\s+(?:мені\s+)?(?:жарт|анекдот|байк|анекдотик)/u.test(s)) return true;
  if (/розпов(?:і|и)(?:ть)?\s+(?:мені\s+)?(?:жарт|анекдот|байк|анекдотик)/u.test(s)) return true;
  if (/пожартуй/u.test(s)) return true;
  return /(?:^|[\s,.!?;:([«"'])(?:анекдот(?:ик)?|жарт(?:и|ів|ом|у)?|байк(?:у|и)?)(?:$|[\s,.!?;:)\]»"'])/u.test(
    s,
  );
}

function normalizeRepeatKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Обрізає текст на першому повторі абзаца або речення.
 * @param {string} text
 * @param {{ casual?: boolean }} [opts]
 */
function sanitizeAssistantReply(text, opts = {}) {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  if (!s) return s;

  const paragraphs = s.split(/\n\n+/);
  const seenPara = new Set();
  const keptPara = [];
  for (const p of paragraphs) {
    const key = normalizeRepeatKey(p);
    if (key.length >= 35 && seenPara.has(key)) break;
    if (key.length >= 35) seenPara.add(key);
    keptPara.push(p);
  }
  s = keptPara.join('\n\n').trim();

  const sentences = s.split(/(?<=[.!?…])\s+/u);
  const seenSent = new Set();
  const keptSent = [];
  for (const sent of sentences) {
    const key = normalizeRepeatKey(sent);
    if (key.length >= 28 && seenSent.has(key)) break;
    if (key.length >= 28) seenSent.add(key);
    keptSent.push(sent);
  }
  s = keptSent.join(' ').trim();

  const limit = maxReplyChars(Boolean(opts.casual));
  if (s.length > limit) {
    const slice = s.slice(0, limit);
    const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
    s = (lastBreak > limit * 0.55 ? slice.slice(0, lastBreak + 1) : slice).trim();
    if (!s.endsWith('…')) s += '…';
  }

  return s;
}

module.exports = {
  isCasualOffTopicUserMessage,
  sanitizeAssistantReply,
  maxReplyChars,
};
