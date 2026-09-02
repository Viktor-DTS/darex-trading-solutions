/**
 * Перевірка підключення Meta Graph API (сторінка, token, lead forms).
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const {
  getMetaVerifyToken,
  getMetaAppSecret,
  getMetaPageAccessToken,
  getMetaAppId,
  getMetaPageId,
} = require('./metaEnvProfiles');

async function graphGet(path, accessToken) {
  const url = `${GRAPH_BASE}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function hasScope(scopes, name) {
  const list = Array.isArray(scopes) ? scopes : [];
  return list.some((s) => String(s).toLowerCase() === name.toLowerCase());
}

function collectScopes(debugData) {
  const out = new Set();
  const root = debugData?.data || debugData || {};
  (root.scopes || []).forEach((s) => out.add(String(s)));
  (root.granular_scopes || []).forEach((g) => {
    if (g.scope) out.add(String(g.scope));
  });
  return [...out];
}

/**
 * @param {object} [opts]
 * @param {string} [opts.pageId] — опційно; інакше META_PAGE_ID або id з /me
 * @param {string} [opts.profile] — 'prod' | 'star' (sandbox *_STAR env)
 */
async function runMetaConnectionTest(opts = {}) {
  const profile = opts.profile === 'star' ? 'star' : 'prod';
  const suffix = profile === 'star' ? '_STAR' : '';
  const pageToken = getMetaPageAccessToken(profile);
  const appId = getMetaAppId(profile);
  const appSecret = getMetaAppSecret(profile);
  const verifyToken = getMetaVerifyToken(profile);
  const pageIdEnv = String(opts.pageId || getMetaPageId(profile) || '').trim();

  const checks = [];

  checks.push({
    id: 'env_verify_token',
    ok: Boolean(verifyToken),
    label: `META_VERIFY_TOKEN${suffix}`,
    message: verifyToken ? 'Задано (webhook verify)' : 'Не задано',
  });

  checks.push({
    id: 'env_page_token',
    ok: Boolean(pageToken),
    label: `META_PAGE_ACCESS_TOKEN${suffix}`,
    message: pageToken ? 'Задано' : 'Не задано — Lead Ads не працюватимуть',
  });

  checks.push({
    id: 'env_app_secret',
    ok: Boolean(appSecret),
    label: `META_APP_SECRET${suffix}`,
    message: appSecret ? 'Задано (підпис webhook)' : 'Не задано — POST webhook без перевірки підпису',
  });

  checks.push({
    id: 'env_app_id',
    ok: Boolean(appId),
    label: `META_APP_ID${suffix}`,
    message: appId ? 'Задано (debug_token scopes)' : 'Не задано — не перевіримо leads_retrieval у тесті',
  });

  if (!pageToken) {
    return {
      ok: false,
      checks,
      summary: `Додайте META_PAGE_ACCESS_TOKEN${suffix} на Render і повторіть перевірку.`,
    };
  }

  // Page token → /me = Facebook Page (без category — для Page object поле може бути недоступне)
  const me = await graphGet('/me?fields=id,name,link', pageToken);
  let pageId = pageIdEnv;
  let pageName = '';
  if (me.ok && me.data?.id) {
    pageId = pageId || String(me.data.id);
    pageName = me.data.name || '';
    checks.push({
      id: 'page',
      ok: true,
      label: 'Сторінка (Graph API /me)',
      message: `${me.data.name || '—'} (ID ${me.data.id})`,
      pageId: String(me.data.id),
      pageName: me.data.name || '',
      link: me.data.link || '',
    });
  } else {
    checks.push({
      id: 'page',
      ok: false,
      label: 'Сторінка (Graph API /me)',
      message: me.data?.error?.message || `HTTP ${me.status}`,
      error: me.data?.error || null,
    });
  }

  // Token scopes via debug_token
  let scopes = [];
  let hasLeadsRetrieval = false;
  if (appId && appSecret) {
    const appToken = `${appId}|${appSecret}`;
    const dbg = await graphGet(
      `/debug_token?input_token=${encodeURIComponent(pageToken)}`,
      appToken
    );
    if (dbg.ok && dbg.data?.data) {
      scopes = collectScopes(dbg.data);
      hasLeadsRetrieval = hasScope(scopes, 'leads_retrieval');
      checks.push({
        id: 'token_scopes',
        ok: hasLeadsRetrieval,
        label: 'Права токена (leads_retrieval)',
        message: hasLeadsRetrieval
          ? 'leads_retrieval є у токені'
          : `leads_retrieval відсутній. Scopes: ${scopes.join(', ') || '—'}`,
        scopes,
        hasLeadsRetrieval,
        isValid: dbg.data.data.is_valid,
        expiresAt: dbg.data.data.expires_at || null,
      });
    } else {
      checks.push({
        id: 'token_scopes',
        ok: false,
        label: 'Права токена (debug_token)',
        message: dbg.data?.error?.message || 'Потрібні META_APP_ID + META_APP_SECRET для перевірки scopes',
        error: dbg.data?.error || null,
      });
    }
  } else {
    checks.push({
      id: 'token_scopes',
      ok: null,
      label: 'Права токена',
      message: 'Додайте META_APP_ID та META_APP_SECRET для перевірки leads_retrieval',
      skipped: true,
    });
  }

  // Lead forms on page
  if (pageId) {
    const forms = await graphGet(
      `/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status,leads_count&limit=25`,
      pageToken
    );
    if (forms.ok && Array.isArray(forms.data?.data)) {
      const list = forms.data.data.map((f) => ({
        id: String(f.id),
        name: f.name || '',
        status: f.status || '',
        leadsCount: f.leads_count,
      }));
      checks.push({
        id: 'leadgen_forms',
        ok: list.length > 0,
        label: 'Lead Forms на сторінці',
        message: list.length
          ? `Знайдено форм: ${list.length}`
          : 'Форм не знайдено (перевірте Leads Access Manager)',
        forms: list,
        count: list.length,
      });
    } else {
      const errMsg = forms.data?.error?.message || `HTTP ${forms.status}`;
      const needsManageAds = /pages_manage_ads/i.test(errMsg);
      checks.push({
        id: 'leadgen_forms',
        ok: needsManageAds ? null : false,
        label: 'Lead Forms на сторінці',
        message: errMsg,
        hint: needsManageAds
          ? 'Для списку форм потрібен pages_manage_ads; для прийому лідів у CRM достатньо leads_retrieval + webhook leadgen'
          : 'Перевірте Leads Access Manager або leads_retrieval',
        error: forms.data?.error || null,
      });
    }
  }

  if (pageIdEnv && pageId && pageIdEnv !== pageId) {
    checks.push({
      id: 'page_id_match',
      ok: false,
      label: 'META_PAGE_ID',
      message: `У env: ${pageIdEnv}, токен для сторінки: ${pageId}`,
    });
  }

  const criticalOk = checks
    .filter((c) => ['env_page_token', 'page', 'token_scopes'].includes(c.id))
    .every((c) => c.ok !== false);

  const allOk = checks.every((c) => c.ok !== false && c.ok !== null);

  let summary;
  if (me.ok && hasLeadsRetrieval) {
    summary = 'Сторінка і leads_retrieval OK. Якщо ліди не в CRM — Leads Access Manager для DTS App + webhook leadgen (не Creatio).';
  } else if (me.ok && appId && appSecret && !hasLeadsRetrieval) {
    summary = 'Сторінка доступна, але leads_retrieval відсутній — попросіть Meta перевипустити Page Token.';
  } else if (me.ok && (!appId || !appSecret)) {
    summary = 'Сторінка доступна. Додайте META_APP_ID + META_APP_SECRET на Render для перевірки leads_retrieval.';
  } else if (me.ok && formsFail(checks)) {
    summary = 'Сторінка доступна. Список форм недоступний — не блокер, якщо webhook leadgen і leads_retrieval налаштовані.';
  } else {
    summary = 'Є проблеми з Meta — див. деталі нижче.';
  }

  return {
    ok: criticalOk,
    checks,
    summary,
    pageId: pageId || pageIdEnv || null,
    pageName,
  };
}

function formsFail(checks) {
  const f = checks.find((c) => c.id === 'leadgen_forms');
  return f && f.ok === false;
}

module.exports = {
  runMetaConnectionTest,
};
