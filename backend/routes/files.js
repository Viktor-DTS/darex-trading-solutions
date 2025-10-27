const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const sharp = require('sharp');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

module.exports = (upload) => {
  const router = express.Router();

// Спрощена функція - повертаємо оригінальний PDF без конвертації
async function convertPdfToJpgServer(pdfBuffer, originalName) {
  try {
    console.log('[PDF-SERVER] ⚠️ PDF конвертація тимчасово відключена');
    console.log('[PDF-SERVER] Файл:', originalName, 'розмір:', pdfBuffer.length, 'байт');
    console.log('[PDF-SERVER] Повертаємо оригінальний PDF файл');
    
    // Повертаємо оригінальний PDF buffer
    return pdfBuffer;
    
  } catch (error) {
    console.error('[PDF-SERVER] Помилка обробки PDF:', error);
    throw error;
  }
}

// CORS middleware для файлових роутів
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://darex-trading-solutions-f.onrender.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Логування всіх запитів до файлового API
router.use((req, res, next) => {
  console.log('[FILES] Запит:', req.method, req.path, req.url);
  console.log('[FILES] Headers:', req.headers);
  console.log('[FILES] Body keys:', Object.keys(req.body || {}));
  next();
});

// Тимчасово вимикаємо Cloudinary для тестування
let cloudinary = null;
let CloudinaryStorage = null;

try {
  cloudinary = require('../config/cloudinary');
  const { CloudinaryStorage: CS } = require('multer-storage-cloudinary');
  CloudinaryStorage = CS;
  console.log('[FILES] Cloudinary підключено успішно');
} catch (error) {
  console.log('[FILES] Cloudinary не підключено, використовуємо локальне збереження');
}

// Middleware для перевірки стану MongoDB
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error('MongoDB не підключена для файлового роуту! ReadyState:', mongoose.connection.readyState);
    return res.status(503).json({ 
      error: 'База даних недоступна для файлових операцій', 
      readyState: mongoose.connection.readyState 
    });
  }
  next();
});

// Використовуємо multer, переданий з index.js

// Схема для файлів
const fileSchema = new mongoose.Schema({
  taskId: String,
  originalName: String,
  filename: String,
  cloudinaryId: String,
  cloudinaryUrl: String,
  mimetype: String,
  size: Number,
  uploadDate: { type: Date, default: Date.now },
  description: String
});

const File = mongoose.model('File', fileSchema);

// Роут для перевірки
router.get('/ping', (req, res) => {
  res.json({ 
    message: 'Файловий сервіс працює!',
    mongodb: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState
    },
    cloudinary: {
      configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО',
      apiKey: process.env.CLOUDINARY_API_KEY ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО',
      apiSecret: process.env.CLOUDINARY_API_SECRET ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО'
    }
  });
});

// Тестовий роут для перевірки Cloudinary підключення
router.get('/test-cloudinary', async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({
        error: 'Cloudinary не налаштовано',
        cloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: !!process.env.CLOUDINARY_API_KEY,
        apiSecret: !!process.env.CLOUDINARY_API_SECRET
      });
    }

    // Тестуємо підключення до Cloudinary
    const result = await cloudinary.api.ping();
    res.json({
      success: true,
      message: 'Cloudinary підключення успішне',
      result: result
    });
  } catch (error) {
    console.error('[FILES] Помилка тесту Cloudinary:', error);
    res.status(500).json({
      error: 'Помилка підключення до Cloudinary',
      details: error.message
    });
  }
});

// Тестовий роут для завантаження файлу договору
router.post('/test-upload-contract', upload.single('file'), async (req, res) => {
  try {
    console.log('[FILES] Тестовий завантаження файлу договору');
    console.log('[FILES] Request body:', req.body);
    console.log('[FILES] Request file:', req.file);
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'Файл не був завантажений' 
      });
    }

    console.log('[FILES] Файл отримано:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      filename: req.file.filename
    });

    res.json({ 
      success: true,
      message: 'Тестовий файл отримано успішно',
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        filename: req.file.filename
      }
    });

  } catch (error) {
    console.error('[FILES] Помилка тестового завантаження:', error);
    res.status(500).json({ 
      success: false,
      error: 'Помилка тестового завантаження: ' + error.message 
    });
  }
});

// Роут для завантаження файлів
router.post('/upload/:taskId', upload.array('files', 10), async (req, res) => {
  try {
    console.log('[FILES] Завантаження файлів для завдання:', req.params.taskId);
    console.log('[FILES] Кількість файлів:', req.files ? req.files.length : 0);
    
    // Діагностика Cloudinary налаштувань
    console.log('[FILES] Cloudinary налаштування:');
    console.log('[FILES] CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО');
    console.log('[FILES] CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО');
    console.log('[FILES] CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО');
    console.log('[FILES] Cloudinary доступний:', !!cloudinary);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файли не були завантажені' });
    }

    const uploadedFiles = [];
    const description = req.body.description || '';

    for (const file of req.files) {
      console.log('[FILES] Обробка файлу:', file.originalname);
      console.log('[FILES] Файл об\'єкт:', file);
      console.log('[FILES] Оригінальна назва (hex):', Buffer.from(file.originalname, 'utf8').toString('hex'));
      
      let finalFile = file;
      let finalFileName = file.originalname;
      
      // Перевіряємо чи це PDF файл і конвертуємо його
      console.log('[FILES] 🔍 ДІАГНОСТИКА ФАЙЛУ:');
      console.log('[FILES] - Назва файлу:', file.originalname);
      console.log('[FILES] - MIME тип:', file.mimetype);
      console.log('[FILES] - Розмір файлу:', file.size);
      console.log('[FILES] - Шлях до файлу:', file.path);
      console.log('[FILES] - Перевірка на PDF:', file.mimetype === 'application/pdf');
      
      // Перевіряємо PDF за MIME типом або розширенням
      const isPdfByMime = file.mimetype === 'application/pdf';
      const isPdfByExtension = file.originalname.toLowerCase().endsWith('.pdf');
      const isPdf = isPdfByMime || isPdfByExtension;
      
      console.log('[FILES] - PDF за MIME:', isPdfByMime);
      console.log('[FILES] - PDF за розширенням:', isPdfByExtension);
      console.log('[FILES] - Загальна перевірка PDF:', isPdf);
      
      if (isPdf) {
        try {
          console.log('[FILES] ✅ Виявлено PDF файл, конвертуємо на сервері:', file.originalname);
          
          // Читаємо PDF файл
          const pdfBuffer = fs.readFileSync(file.path);
          
          // Конвертуємо PDF в JPG на сервері
          const jpgBuffer = await convertPdfToJpgServer(pdfBuffer, file.originalname);
          
          // Створюємо новий файл з JPG даними
          const jpgFileName = file.originalname.replace(/\.pdf$/i, '.jpg');
          const tempJpgPath = path.join(__dirname, '..', 'temp', `converted_${Date.now()}.jpg`);
          
          // Записуємо JPG в тимчасовий файл
          fs.writeFileSync(tempJpgPath, jpgBuffer);
          
          // Створюємо новий об'єкт файлу для JPG
          finalFile = {
            ...file,
            path: tempJpgPath,
            mimetype: 'image/jpeg',
            originalname: jpgFileName,
            size: jpgBuffer.length
          };
          
          finalFileName = jpgFileName;
          
          console.log('[FILES] PDF конвертовано в JPG:', jpgFileName, 'розмір:', jpgBuffer.length);
          
        } catch (error) {
          console.error('[FILES] Помилка конвертації PDF:', error);
          // Якщо конвертація не вдалася, використовуємо оригінальний файл
          console.log('[FILES] Використовуємо оригінальний PDF файл');
        }
      }
      
      // Визначаємо URL файлу
      let fileUrl = '';
      let cloudinaryId = '';
      
      if (cloudinary && finalFile.path) {
        // Cloudinary
        fileUrl = finalFile.path;
        cloudinaryId = finalFile.public_id;
      } else {
        // Локальне збереження
        fileUrl = `/tmp/${finalFile.filename}`;
        cloudinaryId = '';
      }
      
      // Виправляємо кодування назви файлу (переносимо працюючу логіку з "Запит на рахунок")
      let correctedName = finalFileName;
      try {
        // Спробуємо декодувати як UTF-8 з latin1
        const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
        // Перевіряємо чи декодування дало зміст
        if (decoded && decoded !== correctedName && !decoded.includes('')) {
          correctedName = decoded;
        } else {
          // Спробуємо інший метод
          correctedName = decodeURIComponent(escape(correctedName));
        }
      } catch (error) {
        // Якщо не вдалося, залишаємо оригінальну назву
        console.log('[FILES] Не вдалося декодувати назву файлу:', error);
      }
      
      // Створюємо запис в MongoDB
      const fileRecord = new File({
        taskId: req.params.taskId,
        originalName: correctedName,
        filename: file.filename,
        cloudinaryId: cloudinaryId,
        cloudinaryUrl: fileUrl,
        mimetype: file.mimetype,
        size: file.size,
        description: description
      });

      const savedFile = await fileRecord.save();
      console.log('[FILES] Файл збережено в БД:', savedFile._id);
      
      uploadedFiles.push({
        id: savedFile._id,
        originalName: savedFile.originalName,
        cloudinaryUrl: savedFile.cloudinaryUrl,
        size: savedFile.size,
        uploadDate: savedFile.uploadDate,
        description: savedFile.description
      });
    }

    console.log('[FILES] Успішно завантажено файлів:', uploadedFiles.length);
    res.json({ 
      success: true, 
      message: `Завантажено ${uploadedFiles.length} файлів`,
      files: uploadedFiles 
    });

  } catch (error) {
    console.error('[FILES] Помилка завантаження файлів:', error);
    res.status(500).json({ error: 'Помилка завантаження файлів: ' + error.message });
  }
});

// Роут для отримання списку файлів завдання
router.get('/task/:taskId', async (req, res) => {
  try {
    console.log('[FILES] Отримання файлів для завдання:', req.params.taskId);
    
    const files = await File.find({ taskId: req.params.taskId }).sort({ uploadDate: -1 });
    
    console.log('[FILES] Знайдено файлів:', files.length);
    
    const fileList = files.map(file => ({
      id: file._id,
      originalName: file.originalName,
      cloudinaryUrl: file.cloudinaryUrl,
      size: file.size,
      uploadDate: file.uploadDate,
      description: file.description,
      mimetype: file.mimetype
    }));
    
    res.json(fileList);
  } catch (error) {
    console.error('[FILES] Помилка отримання файлів:', error);
    res.status(500).json({ error: 'Помилка отримання файлів' });
  }
});

// Роут для видалення файлу
router.delete('/:fileId', async (req, res) => {
  try {
    console.log('[FILES] Видалення файлу:', req.params.fileId);
    
    const file = await File.findById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    // Видаляємо з Cloudinary
    if (file.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(file.cloudinaryId);
        console.log('[FILES] Файл видалено з Cloudinary:', file.cloudinaryId);
      } catch (cloudinaryError) {
        console.error('[FILES] Помилка видалення з Cloudinary:', cloudinaryError);
        // Продовжуємо видалення з БД навіть якщо помилка в Cloudinary
      }
    }

    // Видаляємо з MongoDB
    await File.findByIdAndDelete(req.params.fileId);
    console.log('[FILES] Файл видалено з БД:', req.params.fileId);
    
    res.json({ 
      success: true,
      message: 'Файл видалено' 
    });
  } catch (error) {
    console.error('[FILES] Помилка видалення файлу:', error);
    res.status(500).json({ error: 'Помилка видалення файлу' });
  }
});

// Роут для отримання інформації про файл
router.get('/info/:fileId', async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    
    res.json({
      id: file._id,
      originalName: file.originalName,
      cloudinaryUrl: file.cloudinaryUrl,
      size: file.size,
      uploadDate: file.uploadDate,
      description: file.description,
      mimetype: file.mimetype
    });
  } catch (error) {
    console.error('[FILES] Помилка отримання інформації про файл:', error);
    res.status(500).json({ error: 'Помилка отримання інформації про файл' });
  }
});

// Роут для завантаження файлу договору
router.post('/upload-contract', (req, res, next) => {
  console.log('[FILES] upload-contract: Початок обробки запиту');
  console.log('[FILES] upload-contract: Content-Type:', req.headers['content-type']);
  console.log('[FILES] upload-contract: Content-Length:', req.headers['content-length']);
  
  upload.single('file')(req, res, (err) => {
    console.log('[FILES] upload-contract: Multer callback викликано');
    console.log('[FILES] upload-contract: Error:', err);
    console.log('[FILES] upload-contract: File:', req.file);
    console.log('[FILES] upload-contract: Body:', req.body);
    
    if (err) {
      console.error('[FILES] Multer error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'Файл занадто великий. Максимальний розмір: 20MB'
          });
        }
      }
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('[FILES] Завантаження файлу договору');
    console.log('[FILES] Request body:', req.body);
    console.log('[FILES] Request file:', req.file);
    console.log('[FILES] Request files:', req.files);
    console.log('[FILES] Файл:', req.file ? req.file.originalname : 'НЕ ЗНАЙДЕНО');
    
    if (!req.file) {
      console.log('[FILES] Помилка: файл не знайдено в запиті');
      return res.status(400).json({ 
        success: false,
        error: 'Файл не був завантажений' 
      });
    }

    // Виправляємо кодування назви файлу
    let fileName = req.file.originalname;
    try {
      const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
      if (decoded && decoded !== fileName && !decoded.includes('')) {
        fileName = decoded;
      } else {
        fileName = decodeURIComponent(escape(fileName));
      }
    } catch (error) {
      console.log('[FILES] Не вдалося декодувати назву файлу:', error);
    }

    // Визначаємо URL файлу
    let fileUrl = '';
    if (cloudinary && req.file.path) {
      // Cloudinary
      fileUrl = req.file.path;
    } else {
      // Локальне збереження
      fileUrl = `/tmp/${req.file.filename}`;
    }

    console.log('[FILES] Файл договору завантажено:', fileUrl);
    console.log('[FILES] Cloudinary налаштування:', {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО',
      apiKey: process.env.CLOUDINARY_API_KEY ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО',
      apiSecret: process.env.CLOUDINARY_API_SECRET ? 'НАЛАШТОВАНО' : 'НЕ НАЛАШТОВАНО',
      cloudinaryAvailable: !!cloudinary
    });
    
    const response = { 
      success: true,
      message: 'Файл договору завантажено успішно',
      url: fileUrl,
      name: fileName,
      size: req.file.size,
      cloudinary: {
        configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
        available: !!cloudinary
      }
    };
    
    console.log('[FILES] Відправляємо відповідь:', response);
    res.json(response);

  } catch (error) {
    console.error('[FILES] Помилка завантаження файлу договору:', error);
    
    // Обробка помилок multer
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'Файл занадто великий. Максимальний розмір: 10MB'
        });
      }
    }
    
    if (error.message.includes('Непідтримуваний тип файлу')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Помилка завантаження файлу договору: ' + error.message 
    });
  }
});

  return router;
}; 