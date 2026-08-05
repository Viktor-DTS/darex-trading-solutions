/**
 * Проксі для перегляду документів тендерів (Prozorro / DZO).
 */
const https = require('https');
const http = require('http');

const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxRedirects: 0 });

const ALLOWED_HOST_SUFFIXES = [
  'prozorro.gov.ua',
  'dzo.com.ua',
];

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isAllowedDocumentUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return isAllowedHost(u.hostname);
  } catch {
    return false;
  }
}

function requestOnce(rawUrl, { timeoutMs = 60000 } = {}) {
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
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', (err) => reject(new Error(err.message || 'Помилка завантаження документа')));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout завантаження документа')));
    req.end();
  });
}

/**
 * Prozorro public-docs повертає 302 на swift-prod.prozorro.gov.ua — слідуємо редиректам.
 */
async function fetchDocumentBuffer(rawUrl, { timeoutMs = 60000, maxRedirects = 5 } = {}) {
  let url = String(rawUrl || '').trim();
  if (!url) throw new Error('URL документа не вказано');

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = new URL(url);
    if (!isAllowedHost(parsed.hostname)) {
      throw new Error('Недозволене джерело документа');
    }

    const res = await requestOnce(url, { timeoutMs });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      if (!location) throw new Error('Невірне перенаправлення документа');
      url = new URL(location, url).href;
      continue;
    }

    if (res.status >= 400) {
      throw new Error(`Документ недоступний (HTTP ${res.status})`);
    }

    return {
      buffer: res.buffer,
      contentType: res.headers['content-type'] || '',
      finalUrl: url,
    };
  }

  throw new Error('Забагато перенаправлень при завантаженні документа');
}

function guessContentType(url, upstreamType, title) {
  if (upstreamType && upstreamType !== 'application/octet-stream' && !upstreamType.includes('text/plain')) {
    return upstreamType;
  }
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

function isZipBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.slice(0, 5).toString() === '%PDF-';
}

/** @deprecated use fetchDocumentBuffer */
function fetchDocumentStream(rawUrl, opts) {
  return fetchDocumentBuffer(rawUrl, opts).then(({ buffer, contentType }) => {
    const { Readable } = require('stream');
    const stream = Readable.from(buffer);
    stream.headers = { 'content-type': contentType };
    return stream;
  });
}

module.exports = {
  ALLOWED_HOST_SUFFIXES,
  isAllowedHost,
  isAllowedDocumentUrl,
  fetchDocumentBuffer,
  fetchDocumentStream,
  guessContentType,
  isZipBuffer,
  isPdfBuffer,
};
