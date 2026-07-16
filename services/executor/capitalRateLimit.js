/** Shared Capital.com API rate-limit backoff (all clients share this). */
let blockedUntil = 0;

function isCapitalRateLimited() {
  return Date.now() < blockedUntil;
}

function capitalRateLimitSecondsLeft() {
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

function markCapitalRateLimited(seconds = 300) {
  const until = Date.now() + Math.max(30, seconds) * 1000;
  blockedUntil = Math.max(blockedUntil, until);
}

function parseRetryAfterSeconds(text, status) {
  if (status === 429) return 300;
  try {
    const j = JSON.parse(text);
    if (j.retryAfterSeconds) return Number(j.retryAfterSeconds);
  } catch (_) { /* ignore */ }
  return 120;
}

function isRateLimitError(status, text = '') {
  return status === 429 || String(text).includes('too-many.requests') || String(text).includes('too.many');
}

module.exports = {
  isCapitalRateLimited,
  capitalRateLimitSecondsLeft,
  markCapitalRateLimited,
  parseRetryAfterSeconds,
  isRateLimitError,
};
