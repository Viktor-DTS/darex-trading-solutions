window.FxAuth = {
  TOKEN_KEY: 'fx_panel_token',

  apiBase() {
    return String(window.FX_API_BASE || '').replace(/\/+$/, '');
  },

  url(path) {
    const base = this.apiBase();
    const p = path.startsWith('/') ? path : `/${path}`;
    return base ? `${base}${p}` : p;
  },

  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY) || '';
  },

  setToken(token) {
    if (token) sessionStorage.setItem(this.TOKEN_KEY, token);
    else sessionStorage.removeItem(this.TOKEN_KEY);
  },

  authHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  isLoginPage() {
    return /login\.html$/i.test(window.location.pathname);
  },

  redirectLogin() {
    const next = encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');
    window.location.href = `./login.html?next=${next}`;
  },

  async requireLogin() {
    if (this.isLoginPage()) return true;
    try {
      const r = await fetch(this.url('/auth/status'));
      const st = await r.json().catch(() => ({}));
      if (!st.loginRequired) return true;
      if (this.getToken()) return true;
      this.redirectLogin();
      return false;
    } catch (_) {
      if (this.getToken()) return true;
      this.redirectLogin();
      return false;
    }
  },

  logout() {
    this.setToken('');
    this.redirectLogin();
  },

  async login(user, password) {
    const r = await fetch(this.url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ user, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Помилка входу');
    this.setToken(data.token);
    return data;
  },
};
