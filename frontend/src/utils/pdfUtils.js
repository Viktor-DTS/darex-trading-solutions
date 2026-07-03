/**
 * Утиліта для роботи з PDF та Word файлами договорів
 * PDF — PDF.js; Word (.docx) — Mammoth
 */

let pdfjsLib = null;
let mammothLib = null;

const CONTRACT_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CONTRACT_DOC_MIME = 'application/msword';

export function getContractFileKind(nameOrUrl = '', mime = '') {
  const lower = String(nameOrUrl || '').toLowerCase().split('?')[0];
  const mt = String(mime || '').toLowerCase();
  if (mt === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (mt === CONTRACT_DOCX_MIME || lower.endsWith('.docx')) return 'docx';
  if (mt === CONTRACT_DOC_MIME || lower.endsWith('.doc')) return 'doc';
  return 'unknown';
}

export function isContractFileSupported(nameOrUrl = '', mime = '') {
  const kind = getContractFileKind(nameOrUrl, mime);
  return kind === 'pdf' || kind === 'docx' || kind === 'doc';
}

/** URL для перегляду в браузері: PDF напряму, Word — через Office Online. */
export function getContractFilePreviewUrl(url) {
  const fileUrl = String(url || '').trim();
  if (!fileUrl) return '';
  const kind = getContractFileKind(fileUrl);
  if (kind === 'docx' || kind === 'doc') {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
  }
  return fileUrl;
}

export function openContractFilePreview(url) {
  const previewUrl = getContractFilePreviewUrl(url);
  if (previewUrl) {
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Завантажує PDF.js бібліотеку
 */
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  try {
    // Завантажуємо PDF.js з CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Таймаут завантаження PDF.js'));
      }, 15000);
      
      script.onload = () => {
        clearTimeout(timeout);
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          pdfjsLib = window.pdfjsLib;
          console.log('[PDF] PDF.js успішно завантажено');
          resolve(pdfjsLib);
        } catch (error) {
          reject(new Error('Помилка ініціалізації PDF.js: ' + error.message));
        }
      };
      
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Не вдалося завантажити PDF.js'));
      };
      
      document.head.appendChild(script);
    });
  } catch (error) {
    throw new Error('Помилка завантаження PDF.js: ' + error.message);
  }
}

/**
 * Завантажує Mammoth для читання .docx
 */
async function loadMammoth() {
  if (mammothLib) return mammothLib;

  if (window.mammoth) {
    mammothLib = window.mammoth;
    return mammothLib;
  }

  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
  script.async = true;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Таймаут завантаження Mammoth'));
    }, 15000);

    script.onload = () => {
      clearTimeout(timeout);
      if (window.mammoth) {
        mammothLib = window.mammoth;
        resolve(mammothLib);
      } else {
        reject(new Error('Mammoth не ініціалізовано'));
      }
    };

    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Не вдалося завантажити Mammoth'));
    };

    document.head.appendChild(script);
  });
}

async function extractTextFromDocxArrayBuffer(arrayBuffer) {
  const mammoth = await loadMammoth();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return String(result?.value || '');
}

async function extractTextFromDocxFile(file) {
  const data = await file.arrayBuffer();
  return extractTextFromDocxArrayBuffer(data);
}

async function extractTextFromDocxUrl(url) {
  const response = await fetch(url.trim());
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити Word файл: ${response.status}`);
  }
  const data = await response.arrayBuffer();
  return extractTextFromDocxArrayBuffer(data);
}

function buildContractUniqueKeyFromPlainText(text, fallbackUrl = '') {
  const lines = String(text || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const key = lines.slice(0, 3).join('|').toLowerCase().trim();
  return key || fallbackUrl;
}

/**
 * Читає перші три рядки тексту з PDF файлу для унікальної ідентифікації
 * @param {string} pdfUrl - URL PDF файлу
 * @returns {Promise<string>} - Унікальний ключ (перші три рядки, об'єднані символом "|")
 */
export async function getPdfUniqueKey(pdfUrl) {
  try {
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      console.warn('[PDF] Невалідний URL:', pdfUrl);
      return pdfUrl || '';
    }

    // Завантажуємо PDF.js
    const pdfjs = await loadPdfJs();
    
    // Завантажуємо PDF файл з URL
    const loadingTask = pdfjs.getDocument({
      url: pdfUrl,
      httpHeaders: {},
      withCredentials: false
    });
    
    const pdf = await loadingTask.promise;
    
    // Отримуємо першу сторінку
    const firstPage = await pdf.getPage(1);
    
    // Отримуємо текст з першої сторінки
    const textContent = await firstPage.getTextContent();
    
    // Витягуємо текст з текстових елементів
    const textItems = textContent.items.map(item => item.str).filter(str => str.trim() !== '');
    
    // Беремо перші три рядки (не порожні)
    const firstThreeLines = textItems.slice(0, 3);
    
    // Об'єднуємо рядки символом "|" для порівняння
    const key = firstThreeLines.join('|').toLowerCase().trim();
    
    console.log('[PDF] Унікальний ключ з PDF:', {
      url: pdfUrl.substring(0, 50) + '...',
      lines: firstThreeLines,
      key: key.substring(0, 80) + '...'
    });
    
    return key || pdfUrl; // Якщо ключ порожній, використовуємо URL
  } catch (error) {
    console.error('[PDF] Помилка читання PDF:', error.message);
    // У разі помилки повертаємо URL як ключ
    return pdfUrl;
  }
}

/**
 * Завантажує унікальні ключі для масиву URL файлів
 * @param {string[]} urls - Масив URL файлів
 * @param {Function} onProgress - Callback для прогресу (опціонально)
 * @returns {Promise<Map<string, string>>} - Map: url -> uniqueKey
 */
export async function loadPdfKeys(urls, onProgress = null) {
  const keysMap = new Map();
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const key = await getPdfUniqueKey(url);
      keysMap.set(url, key);
      
      if (onProgress) {
        onProgress(i + 1, urls.length);
      }
    } catch (error) {
      console.error('[PDF] Помилка для URL:', url, error);
      keysMap.set(url, url); // Використовуємо URL як fallback
    }
  }
  
  return keysMap;
}

/**
 * Групує текстові елементи PDF.js у рядки за Y-координатою (зверху вниз).
 * @param {{ items?: Array<{ str?: string, transform?: number[] }> }} textContent
 * @returns {string[]}
 */
function getPdfPageLinesFromTextContent(textContent) {
  const items = (textContent?.items || [])
    .map((item) => ({
      str: item.str != null ? String(item.str).trim() : '',
      y: Array.isArray(item.transform) ? item.transform[5] : 0,
      x: Array.isArray(item.transform) ? item.transform[4] : 0,
    }))
    .filter((item) => item.str !== '');

  items.sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 3) return dy > 0 ? -1 : 1;
    return a.x - b.x;
  });

  const lines = [];
  let bucket = [];
  let lastY = null;
  const Y_TOLERANCE = 5;

  for (const item of items) {
    if (lastY !== null && Math.abs(item.y - lastY) > Y_TOLERANCE) {
      if (bucket.length) lines.push(bucket.map((i) => i.str).join(' '));
      bucket = [];
    }
    bucket.push(item);
    lastY = item.y;
  }
  if (bucket.length) lines.push(bucket.map((i) => i.str).join(' '));

  return lines;
}

/** Збирає текст першої сторінки: рядки + плоский варіант */
function buildPdfPageTextVariants(textContent) {
  const lines = getPdfPageLinesFromTextContent(textContent);
  const lineJoined = lines.join('\n');
  const flatJoined = (textContent?.items || [])
    .map((item) => (item.str != null ? String(item.str).trim() : ''))
    .filter(Boolean)
    .join(' ');
  return { lines, lineJoined, flatJoined };
}

const UK_MONTH_TO_MM = {
  січня: '01',
  січень: '01',
  лютого: '02',
  лютий: '02',
  березня: '03',
  березень: '03',
  квітня: '04',
  квітень: '04',
  травня: '05',
  травень: '05',
  червня: '06',
  червень: '06',
  липня: '07',
  липень: '07',
  серпня: '08',
  серпень: '08',
  вересня: '09',
  вересень: '09',
  жовтня: '10',
  жовтень: '10',
  листопада: '11',
  листопад: '11',
  грудня: '12',
  грудень: '12',
};

function normalizeContractNumberToken(raw) {
  let s = String(raw || '').replace(/\u00A0/g, ' ').trim();

  const stops = [
    /\s+м\.?\s*[А-ЯІЇЄҐA-Za-z]/iu,
    /\s+місто\s+/iu,
    /\s+(?:19|20)\d{2}(?:-\d{2}-\d{2})?/u,
    /\s+про\s+/iu,
    /\s+на\s+(?:дання|виконання)/iu,
    /\s+«/u,
    /\s+\d{1,2}\s*[»"']?\s+(?:січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/iu,
  ];
  for (const re of stops) {
    const idx = s.search(re);
    if (idx > 0) s = s.slice(0, idx);
  }

  s = s.replace(/((?:19|20)\d{2})-(\d{2})-(\d{2}).*$/u, '');
  s = s.replace(/((?:19|20)\d{2})$/u, '');

  s = s.replace(/^[«"'(\[\s]+/, '').replace(/[»"')\]\s,;:]+$/, '');
  s = s.replace(/\s+/g, '');
  return s.trim();
}

function parseUkrainianTextDate(text) {
  const t = String(text || '');
  const m = t.match(
    /[«"']?\s*(\d{1,2})\s*[»"']?\s+(січня|січень|лютого|лютий|березня|березень|квітня|квітень|травня|травень|червня|червень|липня|липень|серпня|серпень|вересня|вересень|жовтня|жовтень|листопада|листопад|грудня|грудень)\s+(\d{4})\s*(?:р\.?)?/iu,
  );
  if (!m) return '';
  const mm = UK_MONTH_TO_MM[m[2].toLowerCase()];
  if (!mm) return '';
  const dd = m[1].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function extractContractNumberFromText(headSlice) {
  const patterns = [
    /(?:ДОГОВІР|Договор|договор|ДОГОВОР|договору)\s*[:\-]?\s*([\u2116]|№|N[oо°#])\s*([0-9A-Za-zА-ЯІЇЄҐа-яёїєґ\-_/\.]+(?:\s+[0-9A-Za-zА-ЯІЇЄҐа-яёїєґ\-_/\.]+){0,4})/iu,
    /(?:ДОГОВІР|Договор|договор|ДОГОВОР|договору)[\s\S]{0,120}?([\u2116]|№|N[oо°#])\s*([0-9A-Za-zА-ЯІЇЄҐа-яёїєґ\-_/\.]+(?:\s+[0-9A-Za-zА-ЯІЇЄҐа-яёїєґ\-_/\.]+){0,4})/iu,
    /([\u2116]|№|N[oо°#])\s*([A-Za-zА-ЯІЇЄҐа-яёїєґ]{0,4}[\-./]?[0-9A-Za-zА-ЯІЇЄҐа-яёїєґ\-_/\.]+(?:\s+[0-9A-Za-zА-ЯІЇЄҐа-яёїєґ\-_/\.]+){0,3})/u,
  ];

  for (const re of patterns) {
    const m = headSlice.match(re);
    if (!m) continue;
    const candidate = normalizeContractNumberToken(m[2] || '');
    if (candidate.length >= 2 && candidate.length <= 32) {
      return candidate;
    }
  }
  return '';
}

function extractContractDateFromText(headSlice) {
  const isoM = headSlice.match(/\b(19\d{2}|20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;

  const dm = headSlice.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/u);
  if (dm) {
    const [, ddRaw, mmRaw, yyyy] = dm;
    return `${yyyy}-${mmRaw.padStart(2, '0')}-${ddRaw.padStart(2, '0')}`;
  }

  const uk = parseUkrainianTextDate(headSlice);
  if (uk) return uk;

  return '';
}

/**
 * Об'єднує текст першої сторінки PDF (порядок елементів — як видає PDF.js).
 * @param {*} pdfDoc
 * @returns {Promise<string>}
 */
async function getPdfFirstPagePlainText(pdfDoc) {
  const firstPage = await pdfDoc.getPage(1);
  const textContent = await firstPage.getTextContent();
  const { lineJoined } = buildPdfPageTextVariants(textContent);
  return lineJoined;
}

/**
 * Визначення номера та дати договору з уже зчитаного тексту першої сторінки.
 * Підтримує: «ДОГОВІР № 15ТО25», «№ П-0156625», ISO / дд.мм.рррр, ««18» липня 2025 р.».
 * @param {string} plainText
 * @returns {{ contractNumber: string, contractDate: string }}
 */
export function parseContractMetaFromPdfPlainText(plainText) {
  const raw = String(plainText || '');
  const flat = raw.replace(/\s+/g, ' ').trim();
  const headFlat = flat.length > 5000 ? flat.slice(0, 5000) : flat;
  const headMultiline = raw.length > 5000 ? raw.slice(0, 5000) : raw;

  let contractNumber = extractContractNumberFromText(headMultiline);
  if (!contractNumber) contractNumber = extractContractNumberFromText(headFlat);

  let contractDate = extractContractDateFromText(headMultiline);
  if (!contractDate) contractDate = extractContractDateFromText(headFlat);

  return {
    contractNumber: contractNumber || '',
    contractDate: contractDate || '',
  };
}

function parseContractMetaFromTextContent(textContent) {
  const { lines, lineJoined, flatJoined } = buildPdfPageTextVariants(textContent);

  let contractNumber = '';
  let contractDate = '';

  for (const line of lines.slice(0, 40)) {
    if (!contractNumber && /(?:ДОГОВІР|договор|[\u2116]|№)/iu.test(line)) {
      contractNumber = extractContractNumberFromText(line);
    }
    if (!contractDate) {
      contractDate = extractContractDateFromText(line);
    }
    if (contractNumber && contractDate) break;
  }

  const merged = parseContractMetaFromPdfPlainText(`${lineJoined}\n${flatJoined}`);
  return {
    contractNumber: contractNumber || merged.contractNumber,
    contractDate: contractDate || merged.contractDate,
  };
}

/**
 * За один прохід PDF по URL будує ключ дедуплікації (як перші три «рядки» у getPdfUniqueKey) і метадані з першої сторінки.
 * @param {string} pdfUrl
 * @returns {Promise<{ pdfKey: string, meta: { contractNumber: string, contractDate: string } }>}
 */
export async function analyzeContractPdfByUrl(pdfUrl) {
  return analyzeContractFileByUrl(pdfUrl);
}

/**
 * Аналіз договору (PDF або Word) за URL: ключ дедуплікації + номер/дата.
 * @param {string} fileUrl
 * @returns {Promise<{ pdfKey: string, meta: { contractNumber: string, contractDate: string } }>}
 */
export async function analyzeContractFileByUrl(fileUrl) {
  const emptyMeta = { contractNumber: '', contractDate: '' };
  try {
    if (!fileUrl || typeof fileUrl !== 'string') {
      return { pdfKey: fileUrl || '', meta: emptyMeta };
    }

    const kind = getContractFileKind(fileUrl);
    if (kind === 'docx') {
      const text = await extractTextFromDocxUrl(fileUrl);
      return {
        pdfKey: buildContractUniqueKeyFromPlainText(text, fileUrl),
        meta: parseContractMetaFromPdfPlainText(text),
      };
    }
    if (kind === 'doc') {
      return { pdfKey: fileUrl, meta: emptyMeta };
    }

    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({
      url: fileUrl.trim(),
      httpHeaders: {},
      withCredentials: false
    });

    const pdf = await loadingTask.promise;
    const firstPage = await pdf.getPage(1);
    const textContent = await firstPage.getTextContent();

    const textItems = textContent.items
      .map((item) => item.str)
      .filter((str) => String(str).trim() !== '');
    const firstThreeLines = textItems.slice(0, 3);
    const pdfKey = firstThreeLines.join('|').toLowerCase().trim() || fileUrl;
    const meta = parseContractMetaFromTextContent(textContent);

    return { pdfKey, meta };
  } catch (e) {
    console.error('[CONTRACT] analyzeContractFileByUrl:', e?.message || e);
    return { pdfKey: fileUrl, meta: emptyMeta };
  }
}

/**
 * Перша сторінка PDF або Word (.docx) → номер і дата договору.
 * @param {{ url?: string, file?: File | Blob }} source
 * @returns {Promise<{ contractNumber: string, contractDate: string }>}
 */
export async function extractContractMetaFromFile(source = {}) {
  const { url, file } = source;
  const name = file?.name || url || '';
  const kind = getContractFileKind(name, file?.type || '');

  try {
    if (kind === 'docx') {
      const text = file ? await extractTextFromDocxFile(file) : await extractTextFromDocxUrl(url);
      return parseContractMetaFromPdfPlainText(text);
    }
    if (kind === 'doc') {
      return { contractNumber: '', contractDate: '' };
    }
    return extractContractMetaFromPdf(source);
  } catch (e) {
    console.warn('[CONTRACT] extractContractMetaFromFile:', e?.message || e);
    return { contractNumber: '', contractDate: '' };
  }
}

/**
 * Перша сторінка PDF → номер і дата договору.
 * Передано локальний `File` (після вибору) або віддалений `url` (Cloudinary тощо).
 * @param {{ url?: string, file?: File | Blob }} source
 * @returns {Promise<{ contractNumber: string, contractDate: string }>}
 */
export async function extractContractMetaFromPdf(source = {}) {
  const { url, file } = source;
  try {
    if (!url && !file) return { contractNumber: '', contractDate: '' };

    const pdfjs = await loadPdfJs();

    let loadingTask;
    if (file) {
      const data = await file.arrayBuffer();
      loadingTask = pdfjs.getDocument({ data });
    } else if (typeof url === 'string' && url.trim()) {
      loadingTask = pdfjs.getDocument({
        url: url.trim(),
        httpHeaders: {},
        withCredentials: false
      });
    } else {
      return { contractNumber: '', contractDate: '' };
    }

    const pdf = await loadingTask.promise;
    const firstPage = await pdf.getPage(1);
    const textContent = await firstPage.getTextContent();
    return parseContractMetaFromTextContent(textContent);
  } catch (e) {
    console.warn('[PDF] extractContractMetaFromPdf:', e?.message || e);
    return { contractNumber: '', contractDate: '' };
  }
}
