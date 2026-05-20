/**
 * Утиліта для роботи з PDF файлами
 * Використовує PDF.js для читання вмісту PDF
 */

let pdfjsLib = null;

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
 * Об'єднує текст першої сторінки PDF (порядок елементів — як видає PDF.js).
 * @param {*} pdfDoc
 * @returns {Promise<string>}
 */
async function getPdfFirstPagePlainText(pdfDoc) {
  const firstPage = await pdfDoc.getPage(1);
  const textContent = await firstPage.getTextContent();
  const chunks = [];
  for (const item of textContent.items || []) {
    const s = item.str != null ? String(item.str) : '';
    const t = s.trim();
    if (t !== '') chunks.push(t);
  }
  return chunks.join(' ');
}

/**
 * Визначення номера та дати договору з уже зчитаного тексту першої сторінки.
 * Стійко до пробілів/перенесень; орієнтир — шапка «ДОГОВІР … № …» та ISO-дата або дд.мм.рррр.
 * @param {string} plainText
 * @returns {{ contractNumber: string, contractDate: string }}
 */
export function parseContractMetaFromPdfPlainText(plainText) {
  let contractNumber = '';
  let contractDate = '';

  const text = String(plainText || '').replace(/\s+/g, ' ').trim();
  const headSlice = text.length > 4000 ? text.slice(0, 4000) : text;
  const nbsp = /\u00A0/g;

  const afterDogovir = headSlice.match(
    /(?:ДОГОВІР|Договор|договор|ДОГОВОР|договору)[\s\S]*?([\u2116]|№|N[oо°])\s*[:\.]?\s*([^\s;:]{1,64})/iu
  );
  const genericNo =
    !afterDogovir &&
    headSlice.match(
      /([\u2116]|№|N[oо°])\s*[:\.]?\s*([A-Za-zА-ЯІЇЄҐа-іяїєґ]{0,3}[\-./]?[A-Za-zА-ЯІЇЄҐа-іяїєґ0-9\-/_]+(?:\.[A-Za-zА-ЯІЇЄҐа-іяїєґ0-9\-/_]+)?)/u
    );

  const noMatch = afterDogovir || genericNo;
  if (noMatch) {
    contractNumber = String(noMatch[2] || '')
      .replace(nbsp, ' ')
      .replace(/^[,.;:]+/, '')
      .replace(/[,;:]+$/, '')
      .trim();
  }

  const isoM = headSlice.match(/\b(19\d{2}|20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoM) {
    contractDate = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
  }

  if (!contractDate) {
    const dm = headSlice.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/u);
    if (dm) {
      const [, dd, mm, yyyy] = dm;
      contractDate = `${yyyy}-${mm}-${dd}`;
    }
  }

  return {
    contractNumber: contractNumber || '',
    contractDate: contractDate || ''
  };
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
    const plainText = await getPdfFirstPagePlainText(pdf);
    return parseContractMetaFromPdfPlainText(plainText);
  } catch (e) {
    console.warn('[PDF] extractContractMetaFromPdf:', e?.message || e);
    return { contractNumber: '', contractDate: '' };
  }
}
