/**
 * Єдина обробка закінчення / недійсності сесії (HTTP 401 та сумісність зі старим 403 для JWT).
 */

export const AUTH_SESSION_EXPIRED_MESSAGE =
  'Час авторизації закінчився. Просимо перезайти в систему під своїм логіном та паролем.';

let expiredHandled = false;

/** Після успішного входу — знову дозволити показати сповіщення про закінчення сесії. */
export function resetAuthSessionExpiredState() {
  expiredHandled = false;
}

function notifySessionExpiredOnce() {
  if (expiredHandled) return;
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
}

/**
 * Якщо відповідь 401 — очищає сесію, показує alert (один раз).
 * @returns {boolean} true для будь-якої відповіді зі статусом 401
 */
export function tryHandleUnauthorizedResponse(response) {
  if (!response || response.status !== 401) return false;
  notifySessionExpiredOnce();
  return true;
}

/**
 * Сумісність зі старим бекендом: невірний/прострочений JWT повертався як 403 і { error: 'Невірний токен' }.
 * @returns {Promise<boolean>} true якщо це саме така відповідь і сесію скинуто
 */
export async function tryHandleForbiddenInvalidTokenResponse(response) {
  if (!response || response.status !== 403) return false;
  if (expiredHandled) return false;
  const data = await response.clone().json().catch(() => null);
  if (!data || data.error !== 'Невірний токен') return false;
  notifySessionExpiredOnce();
  return true;
}
