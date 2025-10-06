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
    
    console.log('DEBUG PDF Converter: PDF має сторінок:', pdf.numPages);
    
    // Отримуємо всі сторінки
    const numPages = pdf.numPages;
    const pages = [];
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      pages.push(page);
    }
    
    // Налаштовуємо viewport для рендерингу (використовуємо першу сторінку для розмірів)
    const scale = 2.0; // Збільшуємо роздільність
    const firstPageViewport = pages[0].getViewport({ scale });
    
    // Створюємо canvas для всіх сторінок
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Розраховуємо загальну висоту для всіх сторінок
    const pageHeight = firstPageViewport.height;
    const totalHeight = pageHeight * numPages;
    
    canvas.height = totalHeight;
    canvas.width = firstPageViewport.width;
    
    // Рендеримо всі сторінки на canvas
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const viewport = page.getViewport({ scale });
      
      // Позиціонуємо сторінку
      const yOffset = i * pageHeight;
      context.save();
      context.translate(0, yOffset);
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      context.restore();
    }
    
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
          
          console.log('DEBUG PDF Converter: Створено JPG файл:', jpgFileName, 'розмір:', jpgFile.size);
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
    console.log('DEBUG PDF Converter: Розмір оригінального файлу:', file.size);
    try {
      const jpgFile = await convertPdfToJpg(file);
      console.log('DEBUG PDF Converter: PDF успішно конвертовано в JPG');
      console.log('DEBUG PDF Converter: Нова назва файлу:', jpgFile.name);
      console.log('DEBUG PDF Converter: Розмір JPG файлу:', jpgFile.size);
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
