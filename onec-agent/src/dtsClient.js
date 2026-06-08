/**
 * Клієнт до DTS API: логін сервісного користувача + завантаження файлу «Ведомости».
 * Використовує вбудовані fetch/FormData/Blob (Node >= 20).
 */
const fs = require('fs');
const path = require('path');

let cachedToken = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000; // 20 годин (токен живе 24h)

async function login(dts) {
  const now = Date.now();
  if (cachedToken && now - cachedAt < TOKEN_TTL_MS) return cachedToken;
  const r = await fetch(`${dts.apiBaseUrl}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: dts.login, password: dts.password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.token) {
    throw new Error(`Логін у DTS не вдався: ${data.error || r.status}`);
  }
  cachedToken = data.token;
  cachedAt = now;
  return cachedToken;
}

/**
 * Завантажити збережений файл у DTS та запустити імпорт «Ведомости».
 * @returns {object} summary з бекенду
 */
async function uploadVedomost(dts, filePath, trigger = 'schedule') {
  const token = await login(dts);
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), path.basename(filePath));
  const q = dts.dryRun ? '?dryRun=1' : '';
  const r = await fetch(`${dts.apiBaseUrl}/onec/import-vedomost${q}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-OneC-Trigger': trigger,
    },
    body: fd,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // якщо токен протух — скинути кеш і спробувати раз
    if (r.status === 401 || r.status === 403) {
      cachedToken = null;
    }
    throw new Error(`Імпорт у DTS не вдався: ${data.error || r.status}`);
  }
  return data;
}

module.exports = { login, uploadVedomost };
