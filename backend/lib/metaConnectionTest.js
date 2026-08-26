/**
 * Перевірка підключення Meta Graph API (сторінка, token, lead forms).
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
 */
async function runMetaConnectionTest(opts = {}) {
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN || '';
  const appId = process.env.META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const verifyToken = process.env.META_VERIFY_TOKEN || '';
  const pageIdEnv = String(opts.pageId || process.env.META_PAGE_ID || '').trim();

  const checks = [];

  checks.push({
    id: 'env_verify_token',
    ok: Boolean(verifyToken),
    label: 'META_VERIFY_TOKEN',
    message: verifyToken ? 'Задано (webhook verify)' : 'Не задано',
  });

  checks.push({
    id: 'env_page_token',
    ok: Boolean(pageToken),
    label: 'META_PAGE_ACCESS_TOKEN',
    message: pageToken ? 'Задано' : 'Не задано — Lead Ads не працюватимуть',
  });

  checks.push({
    id: 'env_app_secret',
    ok: Boolean(appSecret),
    label: 'META_APP_SECRET',
    message: appSecret ? 'Задано (підпис webhook)' : 'Не задано — POST webhook без перевірки підпису',
  });

  if (!pageToken) {
    return {
      ok: false,
      checks,
      summary: 'Додайте META_PAGE_ACCESS_TOKEN на Render і повторіть перевірку.',
    };
  }

  // Page token → /me = Facebook Page
  const me = await graphGet('/me?fields=id,name,link,category', pageToken);
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
      checks.push({
        id: 'leadgen_forms',
        ok: false,
        label: 'Lead Forms на сторінці',
        message: forms.data?.error?.message || `HTTP ${forms.status}`,
        hint: 'Часто через Leads Access Manager або відсутній leads_retrieval',
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
    .filter((c) => ['env_page_token', 'page', 'leadgen_forms', 'token_scopes'].includes(c.id))
    .every((c) => c.ok !== false);

  const allOk = checks.every((c) => c.ok !== false);

  let summary;
  if (allOk && hasLeadsRetrieval) {
    summary = 'Meta Graph API доступний. Lead Forms читаються. Якщо ліди не приходять — перевірте webhook leadgen і Leads Access Manager для App.';
  } else if (me.ok && !hasLeadsRetrieval) {
    summary = 'Сторінка доступна, але у токені немає leads_retrieval — Lead Ads у CRM не підтягнуться.';
  } else if (me.ok && formsFail(checks)) {
    summary = 'Сторінка доступна, але Lead Forms недоступні — ймовірно Leads Access Manager або права App.';
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
