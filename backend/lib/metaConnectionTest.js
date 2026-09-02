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
const { resolvePageContext } = require('./metaPageToken');

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
 * @param {string} [opts.pageId] — опційно; інакше META_PAGE_ID профілю
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

  // META_PAGE_ACCESS_TOKEN може бути токеном System User — сторінкові edge-и
  // вимагають Page-токена, тому він розв'язується через me/accounts
  let ctx = null;
  let ctxError = '';
  try {
    ctx = await resolvePageContext(profile, pageIdEnv);
  } catch (e) {
    ctxError = e.message;
  }

  let pageId = ctx?.pageId || pageIdEnv;
  let pageName = ctx?.pageName || '';
  const pageInfo = ctx && pageId
    ? await graphGet(`/${encodeURIComponent(pageId)}?fields=id,name,link`, ctx.pageToken)
    : null;

  if (pageInfo?.ok && pageInfo.data?.id) {
    pageId = String(pageInfo.data.id);
    pageName = pageInfo.data.name || pageName;
    checks.push({
      id: 'page',
      ok: true,
      label: 'Сторінка (Graph API)',
      message: `${pageName || '—'} (ID ${pageId})`,
      pageId,
      pageName,
      link: pageInfo.data.link || '',
      tokenKind: ctx.tokenKind,
    });
  } else {
    checks.push({
      id: 'page',
      ok: false,
      label: 'Сторінка (Graph API)',
      message: ctxError || pageInfo?.data?.error?.message || 'Не вдалося визначити сторінку',
      hint: ctx?.tokenKind === 'env_token'
        ? 'Токен не дає Page-токена через me/accounts — перевірте pages_show_list і META_PAGE_ID'
        : '',
      error: pageInfo?.data?.error || null,
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
  if (ctx && pageId) {
    const forms = await graphGet(
      `/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status,leads_count&limit=25`,
      ctx.pageToken
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
      label: `META_PAGE_ID${suffix}`,
      message: `У env: ${pageIdEnv}, доступна сторінка: ${pageId}`,
    });
  }

  const criticalOk = checks
    .filter((c) => ['env_page_token', 'page', 'token_scopes'].includes(c.id))
    .every((c) => c.ok !== false);

  const allOk = checks.every((c) => c.ok !== false && c.ok !== null);

  const pageOk = checks.find((c) => c.id === 'page')?.ok === true;

  let summary;
  if (pageOk && hasLeadsRetrieval) {
    summary = 'Сторінка і leads_retrieval OK. Якщо ліди не в CRM — перевірте підписку сторінки на App (subscribed_apps) і webhook leadgen.';
  } else if (pageOk && appId && appSecret && !hasLeadsRetrieval) {
    summary = 'Сторінка доступна, але leads_retrieval відсутній — попросіть Meta перевипустити токен.';
  } else if (pageOk && (!appId || !appSecret)) {
    summary = `Сторінка доступна. Додайте META_APP_ID${suffix} + META_APP_SECRET${suffix} на Render для перевірки leads_retrieval.`;
  } else if (pageOk && formsFail(checks)) {
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
