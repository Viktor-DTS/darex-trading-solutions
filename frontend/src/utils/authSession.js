/**
 * Єдина обробка закінчення / недійсності сесії (HTTP 401).
 * Показує сповіщення один раз до наступного успішного входу.
 */

export const AUTH_SESSION_EXPIRED_MESSAGE =
  'Час авторизації закінчився. Просимо перезайти в систему під своїм логіном та паролем.';

let expiredHandled = false;

/** Після успішного входу — знову дозволити показати сповіщення про закінчення сесії. */
export function resetAuthSessionExpiredState() {
  expiredHandled = false;
}

/**
 * Якщо відповідь 401 — очищає сесію, надсилає подію для React, показує alert (один раз).
 * @returns {boolean} true, якщо це 401 (у т.ч. повторні 401 після першого сповіщення)
 */
export function tryHandleUnauthorizedResponse(response) {
  if (!response || response.status !== 401) return false;
  if (expiredHandled) return true;
  expiredHandled = true;

  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentPanel');
  } catch (_) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dts-auth-expired'));
    window.alert(AUTH_SESSION_EXPIRED_MESSAGE);
  }

  return true;
}
