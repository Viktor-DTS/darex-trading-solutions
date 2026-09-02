/**
 * Meta credentials: prod (DTS / Darex) + sandbox Starenergy (*_STAR on Render).
 * One webhook URL — verify token and App Secret matched per incoming request.
 */

const crypto = require('crypto');

const PROFILES = [
  { id: 'prod', suffix: '', label: 'DTS / prod' },
  { id: 'star', suffix: '_STAR', label: 'Starenergy sandbox' },
];

const ENV_KEYS = {
  verifyToken: 'META_VERIFY_TOKEN',
  appSecret: 'META_APP_SECRET',
  pageToken: 'META_PAGE_ACCESS_TOKEN',
  appId: 'META_APP_ID',
  pageId: 'META_PAGE_ID',
};

function readEnv(name) {
  return String(process.env[name] || '').trim();
}

function profileEnvKey(base, profileId) {
  const p = PROFILES.find((x) => x.id === profileId) || PROFILES[0];
  return `${base}${p.suffix}`;
}

function getMetaProfileVar(base, profileId = 'prod') {
  return readEnv(profileEnvKey(base, profileId));
}

function getMetaVerifyToken(profileId = 'prod') {
  return getMetaProfileVar(ENV_KEYS.verifyToken, profileId);
}

function getMetaAppSecret(profileId = 'prod') {
  return getMetaProfileVar(ENV_KEYS.appSecret, profileId);
}

function getMetaPageAccessToken(profileId = 'prod') {
  return getMetaProfileVar(ENV_KEYS.pageToken, profileId);
}

function getMetaAppId(profileId = 'prod') {
  return getMetaProfileVar(ENV_KEYS.appId, profileId);
}

function getMetaPageId(profileId = 'prod') {
  return getMetaProfileVar(ENV_KEYS.pageId, profileId);
}

/** GET webhook: hub.verify_token matches prod and/or STAR token. */
function matchMetaVerifyToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  for (const p of PROFILES) {
    const expected = getMetaVerifyToken(p.id);
    if (expected && t === expected) return p.id;
  }
  return null;
}

/** POST webhook: signature → profile id or null. */
function verifyMetaWebhookProfile(req) {
  const signature = req.get('x-hub-signature-256') || '';
  if (!signature || !req.rawBody) {
    const anySecret = PROFILES.some((p) => getMetaAppSecret(p.id));
    return anySecret ? null : 'prod';
  }

  for (const p of PROFILES) {
    const secret = getMetaAppSecret(p.id);
    if (!secret) continue;
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
    try {
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return p.id;
      }
    } catch {
      /* length mismatch */
    }
  }
  return null;
}

function getMetaProfileStatus() {
  const out = {};
  for (const p of PROFILES) {
    out[p.id] = {
      label: p.label,
      verifyToken: Boolean(getMetaVerifyToken(p.id)),
      appSecret: Boolean(getMetaAppSecret(p.id)),
      pageToken: Boolean(getMetaPageAccessToken(p.id)),
      appId: Boolean(getMetaAppId(p.id)),
      ready: Boolean(
        getMetaVerifyToken(p.id)
        && getMetaAppSecret(p.id)
        && getMetaPageAccessToken(p.id)
      ),
    };
  }
  return out;
}

module.exports = {
  PROFILES,
  getMetaProfileVar,
  getMetaVerifyToken,
  getMetaAppSecret,
  getMetaPageAccessToken,
  getMetaAppId,
  getMetaPageId,
  matchMetaVerifyToken,
  verifyMetaWebhookProfile,
  getMetaProfileStatus,
};
