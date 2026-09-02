/**
 * Розв'язання Page Access Token для Meta Graph API.
 * META_PAGE_ACCESS_TOKEN може бути токеном System User (prod DTS CRM LEADS),
 * а сторінкові edge-и (leadgen_forms, leads, subscribed_apps) вимагають Page-токен.
 */

const { getMetaPageAccessToken, getMetaPageId } = require('./metaEnvProfiles');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCOUNTS_PAGE_SIZE = 100;

function buildUrl(path, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  return `${GRAPH_BASE}/${path}?${qs.toString()}`;
}

async function graphGet(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Meta Graph API HTTP ${res.status}`);
    err.statusCode = 502;
    throw err;
  }
  return data;
}

async function graphGetSafe(url) {
  try {
    return { ok: true, data: await graphGet(url) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * @param {'prod'|'star'} profile
 * @param {string} [pageIdHint] — інакше META_PAGE_ID відповідного профілю
 * @returns {Promise<{pageToken: string, pageId: string, pageName: string, tokenKind: string}>}
 */
async function resolvePageContext(profile, pageIdHint) {
  const token = getMetaPageAccessToken(profile);
  if (!token) {
    const err = new Error(`META_PAGE_ACCESS_TOKEN${profile === 'star' ? '_STAR' : ''} не задано`);
    err.statusCode = 400;
    throw err;
  }

  const wantedPageId = String(pageIdHint || getMetaPageId(profile) || '').trim();

  const accounts = await graphGetSafe(
    buildUrl('me/accounts', { fields: 'id,name,access_token', limit: ACCOUNTS_PAGE_SIZE }, token)
  );
  const pages = accounts.ok ? (accounts.data.data || []) : [];
  const match = wantedPageId
    ? pages.find((p) => String(p.id) === wantedPageId)
    : pages[0];

  if (match?.access_token) {
    return {
      pageToken: match.access_token,
      pageId: String(match.id),
      pageName: match.name || '',
      tokenKind: 'page_from_system_user',
    };
  }

  const me = await graphGet(buildUrl('me', { fields: 'id,name' }, token));
  return {
    pageToken: token,
    pageId: wantedPageId || String(me.id || ''),
    pageName: me.name || '',
    tokenKind: 'env_token',
  };
}

module.exports = {
  GRAPH_VERSION,
  GRAPH_BASE,
  buildUrl,
  graphGet,
  graphGetSafe,
  resolvePageContext,
};
