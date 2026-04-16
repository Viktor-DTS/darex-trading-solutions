import API_BASE_URL from '../config.js';
import {
  tryHandleUnauthorizedResponse,
  tryHandleForbiddenInvalidTokenResponse,
} from './authSession.js';

const nativeFetch = globalThis.fetch.bind(globalThis);

function getRequestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function getRequestMethod(input, init) {
  if (init && init.method) return String(init.method).toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return String(input.method || 'GET').toUpperCase();
  return 'GET';
}

function isProtectedApiUrl(url) {
  if (!url) return false;
  const base = API_BASE_URL.replace(/\/$/, '');
  if (url.startsWith(base)) return true;
  if (url.startsWith('/api/') || url === '/api') return true;
  return false;
}

/** POST /api/auth — 401 при невірному паролі; не плутати з закінченням сесії. */
function isAuthLoginPost(url, input, init) {
  if (getRequestMethod(input, init) !== 'POST') return false;
  try {
    const pathname = new URL(url, globalThis.location?.origin || 'http://localhost').pathname;
    return /\/auth\/?$/.test(pathname);
  } catch {
    return /\/auth\/?$/.test(url);
  }
}

function installFetchAuthInterceptor() {
  if (globalThis.__DTS_FETCH_AUTH_PATCH__) return;
  globalThis.__DTS_FETCH_AUTH_PATCH__ = true;

  globalThis.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const url = getRequestUrl(input);
    if (!isProtectedApiUrl(url) || isAuthLoginPost(url, input, init)) {
      return response;
    }
    if (response.status === 401) {
      tryHandleUnauthorizedResponse(response);
      return response;
    }
    await tryHandleForbiddenInvalidTokenResponse(response);
    return response;
  };
}

installFetchAuthInterceptor();

/**
 * Запит до API з тією ж обробкою сесії, що й у глобального fetch (перехоплювач уже встановлено).
 */
export function authFetch(input, init) {
  return globalThis.fetch(input, init);
}
