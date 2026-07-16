document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('loginForm');
  const errEl = document.getElementById('loginError');
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || 'index.html';

  try {
    const r = await fetch(FxAuth.url('/auth/status'));
    const st = await r.json().catch(() => ({}));
    if (!st.loginRequired) {
      window.location.href = './index.html';
      return;
    }
    if (st.user) document.getElementById('loginUser').value = st.user;
  } catch (_) {
    /* ignore */
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const user = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
      await FxAuth.login(user, password);
      window.location.href = `./${next.replace(/^\.\//, '')}`;
    } catch (err) {
      errEl.textContent = err.message || 'Помилка входу';
      errEl.classList.remove('hidden');
    }
  });
});
