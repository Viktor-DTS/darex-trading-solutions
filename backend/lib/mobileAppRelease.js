const path = require('path');
const fs = require('fs');

const ADMIN_ROLES = new Set(['admin', 'administrator']);

function isMobileAppAdmin(user) {
  return ADMIN_ROLES.has(String(user?.role || '').toLowerCase());
}

function publicApiOrigin(req) {
  const fromEnv = String(process.env.PUBLIC_API_ORIGIN || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = req.get('x-forwarded-host') || req.get('host') || 'darex-trading-solutions.onrender.com';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${host}`;
}

function stableInstallUrls(req) {
  const origin = publicApiOrigin(req);
  return {
    installPageUrl: `${origin}/mobile`,
    downloadUrl: `${origin}/api/app-version/download`,
  };
}

function publicPayloadFromRelease(release, req) {
  const stable = stableInstallUrls(req);
  const apkUrl = release?.downloadUrl || '';
  return {
    latest_version: release?.version || '0.1.0',
    min_version: release?.minVersion || release?.version || '0.1.0',
    force_update: !!release?.forceUpdate,
    android_store_url: stable.downloadUrl,
    ios_store_url: '',
    download_url: apkUrl,
    install_page_url: stable.installPageUrl,
    changelog: release?.changelog || '',
    file_name: release?.fileName || '',
    file_size: release?.fileSize || 0,
    published_at: release?.publishedAt || release?.createdAt || null,
  };
}

function fileFallbackConfig() {
  const p = path.join(__dirname, '..', 'app-version.json');
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        latest_version: data.latest_version ?? process.env.APP_VERSION ?? '0.1.0',
        min_version: data.min_version ?? process.env.APP_MIN_VERSION ?? '0.1.0',
        force_update: data.force_update === true || process.env.APP_FORCE_UPDATE === 'true',
        android_store_url: data.android_store_url ?? process.env.APP_ANDROID_STORE_URL ?? '',
        ios_store_url: data.ios_store_url ?? process.env.APP_IOS_STORE_URL ?? '',
        download_url: data.android_store_url ?? process.env.APP_ANDROID_STORE_URL ?? '',
        install_page_url: '',
        changelog: data.changelog || '',
        file_name: '',
        file_size: 0,
        published_at: null,
      };
    }
  } catch (e) {
    console.warn('[app-version] Could not read app-version.json:', e.message);
  }
  return {
    latest_version: process.env.APP_VERSION || '0.1.0',
    min_version: process.env.APP_MIN_VERSION || '0.1.0',
    force_update: process.env.APP_FORCE_UPDATE === 'true',
    android_store_url: process.env.APP_ANDROID_STORE_URL || '',
    ios_store_url: process.env.APP_IOS_STORE_URL || '',
    download_url: process.env.APP_ANDROID_STORE_URL || '',
    install_page_url: '',
    changelog: '',
    file_name: '',
    file_size: 0,
    published_at: null,
  };
}

async function getAppVersionPayload(MobileAppRelease, req) {
  const latest = await MobileAppRelease.findOne({ active: true })
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();
  if (latest?.downloadUrl) {
    return publicPayloadFromRelease(latest, req);
  }
  const fallback = fileFallbackConfig();
  const stable = stableInstallUrls(req);
  if (!fallback.install_page_url) fallback.install_page_url = stable.installPageUrl;
  if (!fallback.android_store_url) fallback.android_store_url = stable.downloadUrl;
  return fallback;
}

function uploadApkBuffer(cloudinary, buffer, version) {
  const safeVersion = String(version || 'build').replace(/[^0-9A-Za-z._-]/g, '-');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'dts-mobile/releases',
        public_id: `dts-mobile-${safeVersion}-${Date.now()}.apk`,
        overwrite: false,
        use_filename: true,
        unique_filename: true,
        type: 'upload',
        access_mode: 'public',
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

function firstInstallHtml({ version, changelog, downloadUrl, fileSize }) {
  const sizeMb = fileSize ? `${(fileSize / (1024 * 1024)).toFixed(1)} МБ` : '';
  const notes = String(changelog || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DTS Mobile — завантаження</title>
  <style>
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f1724; color: #e7eef9; }
    .wrap { max-width: 480px; margin: 0 auto; padding: 48px 20px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    p { color: #97a8c0; line-height: 1.45; }
    .card { background: #16202f; border: 1px solid #2a3a52; border-radius: 14px; padding: 20px; margin-top: 24px; }
    .ver { font-size: 18px; font-weight: 700; }
    a.btn { display: block; text-align: center; margin-top: 18px; background: #1976d2; color: #fff; text-decoration: none; padding: 14px 16px; border-radius: 10px; font-weight: 650; }
    a.btn[aria-disabled="true"] { background: #2a3a52; color: #6b7f9a; pointer-events: none; }
    small { display: block; margin-top: 16px; color: #6b7f9a; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>DTS Mobile</h1>
    <p>Перша установка робочого додатку. Після цього оновлення приходитимуть у самому додатку.</p>
    <div class="card">
      <div class="ver">${version ? `Версія ${version}` : 'Збірку ще не завантажено'}${sizeMb ? ` · ${sizeMb}` : ''}</div>
      ${notes ? `<p>${notes}</p>` : ''}
      <a class="btn" ${downloadUrl ? `href="${downloadUrl}"` : 'aria-disabled="true"'}>Завантажити APK</a>
    </div>
    <small>Android запитає дозвіл на установку з цього джерела — це нормально для внутрішнього додатка.</small>
  </div>
</body>
</html>`;
}

module.exports = {
  isMobileAppAdmin,
  publicApiOrigin,
  stableInstallUrls,
  publicPayloadFromRelease,
  getAppVersionPayload,
  uploadApkBuffer,
  firstInstallHtml,
};
