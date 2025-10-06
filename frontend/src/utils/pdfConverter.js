/**
 * Утиліта для конвертації PDF файлів в JPG зображення на клієнті
 * Використовує PDF.js для рендерингу PDF
 */

// Динамічно завантажуємо PDF.js
let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  try {
    // Завантажуємо PDF.js з CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    
    return new Promise((resolve, reject) => {
      script.onload = () => {
        // Налаштовуємо PDF.js
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib = window.pdfjsLib;
        resolve(pdfjsLib);
      };
      script.onerror = () => reject(new Error('Не вдалося завантажити PDF.js'));
      document.head.appendChild(script);
    });
  } catch (error) {
    throw new Error('Помилка завантаження PDF.js: ' + error.message);
  }
}

/**
 * Конвертує PDF файл в JPG зображення
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
    
    // Отримуємо першу сторінку
    const page = await pdf.getPage(1);
    
    // Налаштовуємо viewport для рендерингу
    const scale = 2.0; // Збільшуємо роздільність
    const viewport = page.getViewport({ scale });
    
    // Створюємо canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Рендеримо сторінку на canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Конвертуємо canvas в JPG
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          // Зберігаємо оригінальну назву файлу, замінюючи тільки розширення
          const originalName = pdfFile.name;
          const nameWithoutExt = originalName.replace(/\.pdf$/i, '');
          const jpgFileName = `${nameWithoutExt}.jpg`;
          
          const jpgFile = new File([blob], jpgFileName, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(jpgFile);
        } else {
          reject(new Error('Не вдалося конвертувати canvas в JPG'));
        }
      }, 'image/jpeg', 0.9);
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
 * @returns {Promise<File>} - Оброблений файл
 */
export async function processFileForUpload(file) {
  if (needsPdfConversion(file)) {
    console.log('DEBUG PDF Converter: Конвертуємо PDF в JPG на клієнті');
    console.log('DEBUG PDF Converter: Оригінальна назва файлу:', file.name);
    try {
      const jpgFile = await convertPdfToJpg(file);
      console.log('DEBUG PDF Converter: PDF успішно конвертовано в JPG');
      console.log('DEBUG PDF Converter: Нова назва файлу:', jpgFile.name);
      return jpgFile;
    } catch (error) {
      console.error('DEBUG PDF Converter: Помилка конвертації:', error);
      console.log('DEBUG PDF Converter: Використовуємо оригінальний PDF файл');
      // Якщо конвертація не вдалася, повертаємо оригінальний файл
      return file;
    }
  }
  
  return file;
}
