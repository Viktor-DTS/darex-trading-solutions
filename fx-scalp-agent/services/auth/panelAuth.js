const crypto = require('crypto');

function hashPassword(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function verifyPassword(input, expected) {
  if (!expected) return false;
  try {
    return crypto.timingSafeEqual(hashPassword(input), hashPassword(expected));
  } catch (_) {
    return false;
  }
}

function signingKey(config) {
  return config.apiSecret || config.panelPassword || '';
}

function issueToken(config, user) {
  const key = signingKey(config);
  if (!key) return null;
  const exp = Date.now() + (config.panelTokenTtlMs || 86400000);
  const payload = JSON.stringify({ u: user, exp });
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

function verifyToken(config, token) {
  const key = signingKey(config);
  if (!key || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  try {
    const payload = Buffer.from(parts[0], 'base64url').toString('utf8');
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    if (sig !== parts[1]) return null;
    const data = JSON.parse(payload);
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function authEnabled(config) {
  return Boolean(config.panelPassword || config.apiSecret);
}

function loginRequired(config) {
  return Boolean(config.panelPassword);
}

function checkCredentials(config, user, password) {
  if (!config.panelPassword) {
    return { ok: false, error: 'FX_PANEL_PASSWORD не налаштовано на сервері' };
  }
  const expectedUser = config.panelUser || 'admin';
  if (String(user || '').trim() !== expectedUser) {
    return { ok: false, error: 'Невірний логін або пароль' };
  }
  if (!verifyPassword(password, config.panelPassword)) {
    return { ok: false, error: 'Невірний логін або пароль' };
  }
  const token = issueToken(config, expectedUser);
  if (!token) return { ok: false, error: 'Auth не налаштовано' };
  return {
    ok: true,
    token,
    user: expectedUser,
    expiresAt: new Date(Date.now() + (config.panelTokenTtlMs || 86400000)).toISOString(),
  };
}

module.exports = {
  authEnabled,
  loginRequired,
  checkCredentials,
  verifyToken,
  issueToken,
};
