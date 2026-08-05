/**
 * Проксі для перегляду документів тендерів (Prozorro / DZO).
 */
const https = require('https');
const http = require('http');

const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const ALLOWED_HOSTS = new Set([
  'public-docs.prozorro.gov.ua',
  'prozorro.gov.ua',
  'docs.prozorro.gov.ua',
  'www.dzo.com.ua',
  'dzo.com.ua',
  'search.dzo.com.ua',
]);

function isAllowedDocumentUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function fetchDocumentStream(rawUrl, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        agent: parsed.protocol === 'https:' ? HTTPS_AGENT : undefined,
        headers: {
          'User-Agent': 'DTS-TenderDepartment/1.0',
          Accept: '*/*',
        },
      },
      (res) => {
        if (res.statusCode >= 400) {
          res.resume();
          reject(new Error(`Документ недоступний (HTTP ${res.statusCode})`));
          return;
        }
        resolve(res);
      }
    );
    req.on('error', (err) => reject(new Error(err.message || 'Помилка завантаження документа')));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout завантаження документа')));
    req.end();
  });
}

function guessContentType(url, upstreamType, title) {
  if (upstreamType && upstreamType !== 'application/octet-stream') return upstreamType;
  const name = `${title || ''} ${url}`.toLowerCase();
  if (name.includes('.pdf')) return 'application/pdf';
  if (name.includes('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.includes('.doc')) return 'application/msword';
  if (/\.(png|jpe?g|gif|webp)/.test(name)) {
    const ext = name.match(/\.(png|jpe?g|gif|webp)/)?.[1]?.replace('jpg', 'jpeg');
    return `image/${ext || 'jpeg'}`;
  }
  return upstreamType || 'application/octet-stream';
}

module.exports = {
  ALLOWED_HOSTS,
  isAllowedDocumentUrl,
  fetchDocumentStream,
  guessContentType,
};
