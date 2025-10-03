/**
 * Утиліта для конвертації PDF файлів в JPG зображення на клієнті
 */

/**
 * Конвертує PDF файл в JPG зображення
 * @param {File} pdfFile - PDF файл для конвертації
 * @returns {Promise<File>} - JPG файл
 */
export async function convertPdfToJpg(pdfFile) {
  return new Promise((resolve, reject) => {
    // Створюємо URL для PDF файлу
  const pdfUrl = URL.createObjectURL(pdfFile);
  
  // Створюємо canvas для рендерингу
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Створюємо iframe для завантаження PDF
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = pdfUrl;
  document.body.appendChild(iframe);
  
  iframe.onload = () => {
    try {
      // Отримуємо PDF документ
      const pdfDoc = iframe.contentDocument || iframe.contentWindow.document;
      
      // Створюємо img елемент для рендерингу першої сторінки
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // Встановлюємо розміри canvas
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Малюємо зображення на canvas
        ctx.drawImage(img, 0, 0);
        
        // Конвертуємо canvas в JPG
        canvas.toBlob((blob) => {
          if (blob) {
            // Створюємо новий файл з JPG
            const jpgFile = new File([blob], pdfFile.name.replace('.pdf', '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            // Очищуємо ресурси
            URL.revokeObjectURL(pdfUrl);
            document.body.removeChild(iframe);
            
            resolve(jpgFile);
          } else {
            reject(new Error('Не вдалося конвертувати PDF в JPG'));
          }
        }, 'image/jpeg', 0.9);
      };
      
      img.onerror = () => {
        reject(new Error('Не вдалося завантажити PDF для конвертації'));
      };
      
      // Намагаємося отримати зображення з PDF
      img.src = pdfUrl;
      
    } catch (error) {
      reject(new Error('Помилка при конвертації PDF: ' + error.message));
    }
  };
  
  iframe.onerror = () => {
    reject(new Error('Не вдалося завантажити PDF файл'));
  };
  });
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
    try {
      const jpgFile = await convertPdfToJpg(file);
      console.log('DEBUG PDF Converter: PDF успішно конвертовано в JPG');
      return jpgFile;
    } catch (error) {
      console.error('DEBUG PDF Converter: Помилка конвертації:', error);
      // Якщо конвертація не вдалася, повертаємо оригінальний файл
      return file;
    }
  }
  
  return file;
}
