const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const sharp = require('sharp');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Функція для конвертації PDF в JPG через Cloudinary Transformations
async function convertPdfToJpgServer(pdfBuffer, originalName) {
  try {
    console.log('[PDF-SERVER] Початок конвертації PDF через Cloudinary:', originalName);
    
    // Завантажуємо PDF в Cloudinary з трансформацією в JPG
    const cloudinary = require('cloudinary').v2;
    
    // Створюємо тимчасовий файл для PDF
    const tempPdfPath = path.join(__dirname, '..', 'temp', `temp_${Date.now()}.pdf`);
    const tempDir = path.dirname(tempPdfPath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempPdfPath, pdfBuffer);
    
    console.log('[PDF-SERVER] Завантажуємо PDF в Cloudinary з трансформацією...');
    
    // Завантажуємо PDF в Cloudinary з автоматичною конвертацією в JPG
    const result = await cloudinary.uploader.upload(tempPdfPath, {
      folder: 'darex-trading-solutions/temp-pdf-conversion',
      resource_type: 'image', // Це змусить Cloudinary конвертувати PDF в зображення
      format: 'jpg',
      quality: 'auto:good',
      transformation: [
        { format: 'jpg' },
        { quality: 'auto:good' },
        { flags: 'attachment' } // Додаємо флаг для кращої обробки PDF
      ]
    });
    
    console.log('[PDF-SERVER] PDF конвертовано в Cloudinary:', result.secure_url);
    
    // Отримуємо конвертоване зображення
    const response = await fetch(result.secure_url);
    const jpgBuffer = await response.buffer();
    
    // Очищаємо тимчасовий файл
    fs.unlinkSync(tempPdfPath);
    
    // Видаляємо тимчасовий файл з Cloudinary
    try {
      await cloudinary.uploader.destroy(result.public_id);
      console.log('[PDF-SERVER] Тимчасовий файл видалено з Cloudinary');
    } catch (deleteError) {
      console.log('[PDF-SERVER] Не вдалося видалити тимчасовий файл з Cloudinary:', deleteError.message);
    }
    
    console.log('[PDF-SERVER] Конвертація завершена, розмір JPG:', jpgBuffer.length);
    return jpgBuffer;
    
  } catch (error) {
    console.error('[PDF-SERVER] Помилка конвертації PDF через Cloudinary:', error);
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

// Налаштування Storage для multer
let storage;
if (CloudinaryStorage && cloudinary) {
  // Cloudinary Storage
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'darex-trading-solutions',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
  });
} else {
  // Локальне збереження (тимчасово)
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, '/tmp/') // Тимчасова папка
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname)
    }
  });
}

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB ліміт
  },
  fileFilter: (req, file, cb) => {
    // Дозволяємо тільки певні типи файлів
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу'), false);
    }
  }
});

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

module.exports = router; 