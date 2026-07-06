const FX_ADMIN_ROLES = new Set(['admin', 'administrator']);

function isFxScalpAdmin(role) {
  return FX_ADMIN_ROLES.has(String(role || '').toLowerCase());
}

function agentBaseUrl() {
  return String(process.env.FX_SCALP_AGENT_URL || '').replace(/\/+$/, '');
}

function agentConfigured() {
  return Boolean(agentBaseUrl());
}

function agentHeaders(extra = {}) {
  const secret = process.env.FX_SCALP_AGENT_SECRET || '';
  const headers = { Accept: 'application/json', ...extra };
  if (secret) headers['X-Fx-Scalp-Secret'] = secret;
  return headers;
}

async function proxyAgent(path, options = {}) {
  const base = agentBaseUrl();
  if (!base) {
    const err = new Error('FX_SCALP_AGENT_URL не налаштовано на backend');
    err.status = 503;
    throw err;
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const timeoutMs = Number(process.env.FX_SCALP_PROXY_TIMEOUT_MS) || 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: agentHeaders(options.headers || {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_) {
      body = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const err = new Error(body?.error || body?.hint || `Agent HTTP ${res.status}`);
      err.status = res.status >= 500 ? 502 : res.status;
      err.body = body;
      throw err;
    }
    return body;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('FX Scalp agent timeout');
      err.status = 504;
      throw err;
    }
    if (e.status) throw e;
    const err = new Error(`FX Scalp agent недоступний: ${e.message}`);
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sendProxyError(res, e) {
  res.status(e.status || 502).json({
    error: e.message,
    details: e.body || null,
    agentUrl: agentConfigured() ? agentBaseUrl() : null,
  });
}

function registerFxScalpRoutes(app) {
  app.get('/api/fx-scalp/status', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ лише для admin / administrator' });
    }
    if (!agentConfigured()) {
      return res.json({
        configured: false,
        agentUrl: null,
        hint: 'Додайте FX_SCALP_AGENT_URL на Render backend (напр. https://fx-scalp-agent.onrender.com)',
      });
    }
    try {
      const [health, control] = await Promise.all([
        proxyAgent('/health'),
        proxyAgent('/control/status').catch(() => null),
      ]);
      res.json({
        configured: true,
        agentUrl: agentBaseUrl(),
        health,
        control,
      });
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.get('/api/fx-scalp/dashboard', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    try {
      const [state, journal, control, health] = await Promise.all([
        proxyAgent('/state'),
        proxyAgent('/journal?limit=40'),
        proxyAgent('/control/status'),
        proxyAgent('/health'),
      ]);
      res.json({ state, journal, control, health });
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.get('/api/fx-scalp/state', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) return res.status(403).json({ error: 'Доступ заборонено' });
    try {
      res.json(await proxyAgent('/state'));
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.get('/api/fx-scalp/journal', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) return res.status(403).json({ error: 'Доступ заборонено' });
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    try {
      res.json(await proxyAgent(`/journal?limit=${limit}`));
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.get('/api/fx-scalp/logs', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) return res.status(403).json({ error: 'Доступ заборонено' });
    const limit = Math.min(Number(req.query.limit) || 150, 500);
    try {
      res.json(await proxyAgent(`/control/logs?limit=${limit}`));
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.post('/api/fx-scalp/worker/start', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) return res.status(403).json({ error: 'Доступ заборонено' });
    const force = req.query.force === '1' || req.body?.force === true;
    try {
      const path = force ? '/control/worker/start?force=1' : '/control/worker/start';
      res.json(await proxyAgent(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.post('/api/fx-scalp/worker/stop', async (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) return res.status(403).json({ error: 'Доступ заборонено' });
    try {
      res.json(await proxyAgent('/control/worker/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    } catch (e) {
      sendProxyError(res, e);
    }
  });

  app.get('/api/fx-scalp/panel-url', (req, res) => {
    if (!isFxScalpAdmin(req.user?.role)) return res.status(403).json({ error: 'Доступ заборонено' });
    res.json({
      url: agentConfigured() ? agentBaseUrl() : null,
      embedded: true,
    });
  });
}

module.exports = { registerFxScalpRoutes, isFxScalpAdmin };
