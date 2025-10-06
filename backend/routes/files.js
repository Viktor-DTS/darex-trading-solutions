const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const router = express.Router();

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
      
      // Визначаємо URL файлу
      let fileUrl = '';
      let cloudinaryId = '';
      
      if (cloudinary && file.path) {
        // Cloudinary
        fileUrl = file.path;
        cloudinaryId = file.public_id;
      } else {
        // Локальне збереження
        fileUrl = `/tmp/${file.filename}`;
        cloudinaryId = '';
      }
      
      // Спробуємо виправити кодування назви файлу
      let correctedName = file.originalname;
      console.log('[FILES] Оригінальна назва файлу:', file.originalname);
      
      try {
        // Перевіряємо, чи назва файлу містить неправильно закодовані символи
        if (file.originalname.includes('Ð') || file.originalname.includes('Ð') || file.originalname.includes('Р') || file.originalname.includes('Р')) {
          console.log('[FILES] Виявлено проблему з кодуванням, спробуємо виправити');
          
          // Спробуємо декодувати з windows-1251 в utf-8
          try {
            const iconv = require('iconv-lite');
            correctedName = iconv.decode(Buffer.from(file.originalname, 'binary'), 'windows-1251');
            console.log('[FILES] Виправлена назва (iconv):', correctedName);
          } catch (iconvError) {
            // Спробуємо альтернативний метод декодування
            try {
              correctedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
              console.log('[FILES] Виправлена назва (latin1->utf8):', correctedName);
            } catch (latinError) {
              console.log('[FILES] latin1->utf8 не спрацював, спробуємо ручне виправлення');
            
            // Ручне виправлення найпоширеніших проблем з кодуванням
            correctedName = file.originalname
              // Великі літери
              .replace(/Ð/g, 'А').replace(/Ð/g, 'Б').replace(/Ð/g, 'В').replace(/Ð/g, 'Г').replace(/Ð/g, 'Д')
              .replace(/Ð/g, 'Е').replace(/Ð/g, 'Ж').replace(/Ð/g, 'З').replace(/Ð/g, 'И').replace(/Ð/g, 'Й')
              .replace(/Ð/g, 'К').replace(/Ð/g, 'Л').replace(/Ð/g, 'М').replace(/Ð/g, 'Н').replace(/Ð/g, 'О')
              .replace(/Ð/g, 'П').replace(/Ð/g, 'Р').replace(/Ð/g, 'С').replace(/Ð/g, 'Т').replace(/Ð/g, 'У')
              .replace(/Ð/g, 'Ф').replace(/Ð/g, 'Х').replace(/Ð/g, 'Ц').replace(/Ð/g, 'Ч').replace(/Ð/g, 'Ш')
              .replace(/Ð/g, 'Щ').replace(/Ð/g, 'Ъ').replace(/Ð/g, 'Ы').replace(/Ð/g, 'Ь').replace(/Ð/g, 'Э')
              .replace(/Ð/g, 'Ю').replace(/Ð/g, 'Я')
              // Малі літери
              .replace(/Ð/g, 'а').replace(/Ð/g, 'б').replace(/Ð/g, 'в').replace(/Ð/g, 'г').replace(/Ð/g, 'д')
              .replace(/Ð/g, 'е').replace(/Ð/g, 'ж').replace(/Ð/g, 'з').replace(/Ð/g, 'и').replace(/Ð/g, 'й')
              .replace(/Ð/g, 'к').replace(/Ð/g, 'л').replace(/Ð/g, 'м').replace(/Ð/g, 'н').replace(/Ð/g, 'о')
              .replace(/Ð/g, 'п').replace(/Ð/g, 'р').replace(/Ð/g, 'с').replace(/Ð/g, 'т').replace(/Ð/g, 'у')
              .replace(/Ð/g, 'ф').replace(/Ð/g, 'х').replace(/Ð/g, 'ц').replace(/Ð/g, 'ч').replace(/Ð/g, 'ш')
              .replace(/Ð/g, 'щ').replace(/Ð/g, 'ъ').replace(/Ð/g, 'ы').replace(/Ð/g, 'ь').replace(/Ð/g, 'э')
              .replace(/Ð/g, 'ю').replace(/Ð/g, 'я')
              // Додаткові варіанти кодування
              .replace(/Р/g, 'А').replace(/Р/g, 'Б').replace(/Р/g, 'В').replace(/Р/g, 'Г').replace(/Р/g, 'Д')
              .replace(/Р/g, 'Е').replace(/Р/g, 'Ж').replace(/Р/g, 'З').replace(/Р/g, 'И').replace(/Р/g, 'Й')
              .replace(/Р/g, 'К').replace(/Р/g, 'Л').replace(/Р/g, 'М').replace(/Р/g, 'Н').replace(/Р/g, 'О')
              .replace(/Р/g, 'П').replace(/Р/g, 'Р').replace(/Р/g, 'С').replace(/Р/g, 'Т').replace(/Р/g, 'У')
              .replace(/Р/g, 'Ф').replace(/Р/g, 'Х').replace(/Р/g, 'Ц').replace(/Р/g, 'Ч').replace(/Р/g, 'Ш')
              .replace(/Р/g, 'Щ').replace(/Р/g, 'Ъ').replace(/Р/g, 'Ы').replace(/Р/g, 'Ь').replace(/Р/g, 'Э')
              .replace(/Р/g, 'Ю').replace(/Р/g, 'Я')
              .replace(/Р/g, 'а').replace(/Р/g, 'б').replace(/Р/g, 'в').replace(/Р/g, 'г').replace(/Р/g, 'д')
              .replace(/Р/g, 'е').replace(/Р/g, 'ж').replace(/Р/g, 'з').replace(/Р/g, 'и').replace(/Р/g, 'й')
              .replace(/Р/g, 'к').replace(/Р/g, 'л').replace(/Р/g, 'м').replace(/Р/g, 'н').replace(/Р/g, 'о')
              .replace(/Р/g, 'п').replace(/Р/g, 'р').replace(/Р/g, 'с').replace(/Р/g, 'т').replace(/Р/g, 'у')
              .replace(/Р/g, 'ф').replace(/Р/g, 'х').replace(/Р/g, 'ц').replace(/Р/g, 'ч').replace(/Р/g, 'ш')
              .replace(/Р/g, 'щ').replace(/Р/g, 'ъ').replace(/Р/g, 'ы').replace(/Р/g, 'ь').replace(/Р/g, 'э')
              .replace(/Р/g, 'ю').replace(/Р/g, 'я');
            
            console.log('[FILES] Виправлена назва (ручне):', correctedName);
            }
          }
        }
      } catch (error) {
        console.log('[FILES] Не вдалося виправити кодування:', error.message);
      }
      
      console.log('[FILES] Фінальна назва файлу для збереження:', correctedName);
      
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