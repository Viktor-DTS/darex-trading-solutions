import { tryHandleUnauthorizedResponse } from './authSession.js';

/**
 * fetch + автоматична обробка 401 (сповіщення та вихід із сесії).
 */
export async function authFetch(input, init) {
  const response = await fetch(input, init);
  tryHandleUnauthorizedResponse(response);
  return response;
}
