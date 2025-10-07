/**
 * Утиліта для конвертації PDF файлів в JPG зображення на клієнті
 * Використовує PDF.js для рендерингу PDF з fallback логікою
 * Включає OCR функціональність для розпізнавання тексту з зображень
 */

// Динамічно завантажуємо PDF.js
let pdfjsLib = null;
let pdfJsSupported = null;

/**
 * Розпізнає номер рахунку та дату з тексту
 * @param {string} text - розпізнаний текст
 * @returns {Object} - об'єкт з номером рахунку та датою
 */
function parseInvoiceData(text) {
  console.log('[OCR] Розпізнаний текст:', text);
  
  // Патерни для пошуку номера рахунку
  const invoiceNumberPatterns = [
    /Рахунок на оплату №\s*(\d+)/i,
    /Рахунок на оплату Ne\s*(\d+)/i,
    /№\s*(\d+)/i,
    /Ne\s*(\d+)/i,
    /Invoice\s*#?\s*(\d+)/i,
    /Invoice\s*No\.?\s*(\d+)/i,
    /(\d{3,})/ // Простий патерн для 3+ цифр
  ];
  
  // Патерни для пошуку дати
  const datePatterns = [
    /від\s+(\d{1,2}\s+\w+\s+\d{4}\s+р\.)/i,
    /від\s+(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /(\d{1,2}\s+\w+\s+\d{4}\s+р\.)/i,
    /(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /Date:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i
  ];
  
  let invoiceNumber = null;
  let invoiceDate = null;
  
  // Шукаємо номер рахунку
  for (const pattern of invoiceNumberPatterns) {
    const match = text.match(pattern);
    if (match) {
      invoiceNumber = match[1];
      console.log('[OCR] Знайдено номер рахунку:', invoiceNumber);
      break;
    }
  }
  
  // Якщо не знайшли номер рахунку, спробуємо знайти будь-які 3+ цифри після "Ne" або "№"
  if (!invoiceNumber) {
    const simplePattern = /(?:Ne|№|No\.?)\s*(\d{3,})/i;
    const match = text.match(simplePattern);
    if (match) {
      invoiceNumber = match[1];
      console.log('[OCR] Знайдено номер рахунку (простий патерн):', invoiceNumber);
    }
  }
  
  // Шукаємо дату
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      invoiceDate = match[1];
      console.log('[OCR] Знайдено дату рахунку:', invoiceDate);
      break;
    }
  }
  
  return {
    invoiceNumber,
    invoiceDate,
    success: !!(invoiceNumber || invoiceDate)
  };
}

/**
 * Виконує OCR розпізнавання тексту з зображення
 * @param {HTMLCanvasElement} canvas - canvas з зображенням
 * @returns {Promise<Object>} - об'єкт з розпізнаними даними
 */
async function performOCR(canvas) {
  try {
    console.log('[OCR] Починаємо OCR розпізнавання...');
    
    // Динамічно завантажуємо Tesseract.js
    const { createWorker } = await import('tesseract.js');
    
    const worker = await createWorker('ukr+eng', 1, {
      logger: m => console.log('[OCR]', m)
    });
    
    // Розпізнаємо текст з canvas
    const { data: { text } } = await worker.recognize(canvas);
    
    // Зупиняємо worker
    await worker.terminate();
    
    console.log('[OCR] Розпізнавання завершено');
    
    // Парсимо дані з тексту
    const parsedData = parseInvoiceData(text);
    
    return parsedData;
  } catch (error) {
    console.error('[OCR] Помилка розпізнавання:', error);
    return {
      invoiceNumber: null,
      invoiceDate: null,
      success: false,
      error: error.message
    };
  }
}

/**
 * Перевіряє підтримку PDF.js в браузері
 */
function checkBrowserSupport() {
  if (pdfJsSupported !== null) return pdfJsSupported;
  
  try {
    // Перевіряємо базові можливості браузера
    const hasCanvas = !!document.createElement('canvas').getContext;
    const hasFileAPI = !!(window.File && window.FileReader && window.FileList && window.Blob);
    const hasArrayBuffer = !!window.ArrayBuffer;
    const hasPromise = !!window.Promise;
    
    // Перевіряємо версію браузера (базові вимоги)
    const userAgent = navigator.userAgent;
    const isOldIE = /MSIE [1-9]\./.test(userAgent);
    const isOldSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent) && /Version\/[1-9]\./.test(userAgent);
    
    pdfJsSupported = hasCanvas && hasFileAPI && hasArrayBuffer && hasPromise && !isOldIE && !isOldSafari;
    
    console.log('DEBUG PDF Converter: Підтримка браузера:', {
      canvas: hasCanvas,
      fileAPI: hasFileAPI,
      arrayBuffer: hasArrayBuffer,
      promise: hasPromise,
      notOldIE: !isOldIE,
      notOldSafari: !isOldSafari,
      supported: pdfJsSupported
    });
    
    return pdfJsSupported;
  } catch (error) {
    console.warn('DEBUG PDF Converter: Помилка перевірки підтримки браузера:', error);
    pdfJsSupported = false;
    return false;
  }
}

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  // Перевіряємо підтримку браузера
  if (!checkBrowserSupport()) {
    throw new Error('Браузер не підтримує PDF конвертацію. Використовуйте сучасний браузер (Chrome, Firefox, Safari, Edge).');
  }
  
  try {
    // Завантажуємо PDF.js з CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Таймаут завантаження PDF.js'));
      }, 10000); // 10 секунд таймаут
      
      script.onload = () => {
        clearTimeout(timeout);
        try {
          // Налаштовуємо PDF.js
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          pdfjsLib = window.pdfjsLib;
          console.log('DEBUG PDF Converter: PDF.js успішно завантажено');
          resolve(pdfjsLib);
        } catch (error) {
          clearTimeout(timeout);
          reject(new Error('Помилка ініціалізації PDF.js: ' + error.message));
        }
      };
      
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Не вдалося завантажити PDF.js з CDN'));
      };
      
      document.head.appendChild(script);
    });
  } catch (error) {
    throw new Error('Помилка завантаження PDF.js: ' + error.message);
  }
}

/**
 * Конвертує PDF файл в JPG зображення (тільки перша сторінка)
 * @param {File} pdfFile - PDF файл для конвертації
 * @returns {Promise<File>} - JPG файл
 */
export async function convertPdfToJpg(pdfFile) {
  try {
    // Завантажуємо PDF.js
    const pdfjs = await loadPdfJs();
    
    // Читаємо PDF файл як ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    // Завантажуємо PDF документ
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    console.log('DEBUG PDF Converter: PDF має сторінок:', pdf.numPages);
    console.log('DEBUG PDF Converter: Конвертуємо тільки ПЕРШУ сторінку');
    
    // Отримуємо тільки першу сторінку
    const firstPage = await pdf.getPage(1);
    
    // Налаштовуємо viewport для рендерингу з високою роздільністю
    const scale = 3.0; // Збільшуємо роздільність для кращої якості
    const viewport = firstPage.getViewport({ scale });
    
    // Створюємо canvas для першої сторінки
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Встановлюємо розміри canvas
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Покращуємо якість рендерингу
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    
    // Рендеримо тільки першу сторінку з покращеними налаштуваннями
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      // Додаткові налаштування для кращої якості
      intent: 'display', // Оптимізуємо для відображення
      renderInteractiveForms: false // Відключаємо інтерактивні форми для кращої якості
    };
    
    await firstPage.render(renderContext).promise;
    
    console.log('DEBUG PDF Converter: Перша сторінка відрендерена, розміри:', viewport.width, 'x', viewport.height);
    
    // OCR розпізнавання тимчасово відключено
    console.log('DEBUG PDF Converter: OCR розпізнавання тимчасово відключено');
    const ocrData = { invoiceNumber: null, invoiceDate: null, success: false };
    console.log('DEBUG PDF Converter: OCR результати (відключено):', ocrData);
    
    // Конвертуємо canvas в JPG
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          console.log('DEBUG PDF Converter: Canvas конвертовано в blob, розмір:', blob.size);
          
          // Зберігаємо оригінальну назву файлу, замінюючи тільки розширення
          const originalName = pdfFile.name;
          const nameWithoutExt = originalName.replace(/\.pdf$/i, '');
          const jpgFileName = `${nameWithoutExt}.jpg`;
          
          const jpgFile = new File([blob], jpgFileName, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          
          console.log('DEBUG PDF Converter: Створено JPG файл (тільки перша сторінка):', jpgFileName, 'розмір:', jpgFile.size);
          
          // Додаємо OCR дані до файлу як метадані
          jpgFile.ocrData = ocrData;
          
          resolve(jpgFile);
        } else {
          reject(new Error('Не вдалося конвертувати canvas в JPG'));
        }
      }, 'image/jpeg', 0.95); // Підвищуємо якість JPG до 95%
    });
    
  } catch (error) {
    throw new Error('Помилка конвертації PDF: ' + error.message);
  }
}

/**
 * Перевіряє, чи потрібна конвертація PDF
 * @param {File} file - Файл для перевірки
 * @returns {boolean} - true якщо потрібна конвертація
 */
export function needsPdfConversion(file) {
  return file && file.type === 'application/pdf';
}

/**
 * Конвертує PDF в JPG якщо потрібно, інакше повертає оригінальний файл
 * @param {File} file - Файл для обробки
 * @returns {Promise<{file: File, ocrData?: Object}>} - Оброблений файл та OCR дані
 */
export async function processFileForUpload(file) {
  if (needsPdfConversion(file)) {
    console.log('DEBUG PDF Converter: Конвертуємо PDF в JPG на клієнті (тільки перша сторінка)');
    console.log('DEBUG PDF Converter: Оригінальна назва файлу:', file.name);
    console.log('DEBUG PDF Converter: Розмір оригінального файлу:', file.size);
    console.log('DEBUG PDF Converter: User Agent:', navigator.userAgent);
    
    try {
      // Перевіряємо підтримку браузера перед спробою конвертації
      if (!checkBrowserSupport()) {
        console.warn('DEBUG PDF Converter: Браузер не підтримує PDF конвертацію');
        console.warn('DEBUG PDF Converter: Використовуємо оригінальний PDF файл');
        return { file: file, ocrData: null };
      }
      
      const jpgFile = await convertPdfToJpg(file);
      console.log('DEBUG PDF Converter: PDF успішно конвертовано в JPG (перша сторінка)');
      console.log('DEBUG PDF Converter: Нова назва файлу:', jpgFile.name);
      console.log('DEBUG PDF Converter: Розмір JPG файлу:', jpgFile.size);
      console.log('DEBUG PDF Converter: OCR дані:', jpgFile.ocrData);
      return { file: jpgFile, ocrData: jpgFile.ocrData };
    } catch (error) {
      console.error('DEBUG PDF Converter: Помилка конвертації:', error);
      console.log('DEBUG PDF Converter: Тип помилки:', error.constructor.name);
      console.log('DEBUG PDF Converter: Повідомлення:', error.message);
      
      // Показуємо користувачу зрозуміле повідомлення
      if (error.message.includes('Браузер не підтримує')) {
        console.warn('DEBUG PDF Converter: Браузер не підтримує PDF конвертацію');
      } else if (error.message.includes('Таймаут')) {
        console.warn('DEBUG PDF Converter: Таймаут завантаження PDF.js');
      } else if (error.message.includes('CDN')) {
        console.warn('DEBUG PDF Converter: Проблема з завантаженням PDF.js з CDN');
      }
      
      console.log('DEBUG PDF Converter: Використовуємо оригінальний PDF файл');
      // Якщо конвертація не вдалася, повертаємо оригінальний файл
      return { file: file, ocrData: null };
    }
  }
  
  return { file: file, ocrData: null };
}
