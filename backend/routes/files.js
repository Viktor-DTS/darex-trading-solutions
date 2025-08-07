const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const router = express.Router();

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

// Налаштування Cloudinary Storage для multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'darex-trading-solutions',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

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
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файли не були завантажені' });
    }

    const uploadedFiles = [];
    const description = req.body.description || '';

    for (const file of req.files) {
      console.log('[FILES] Обробка файлу:', file.originalname);
      console.log('[FILES] Cloudinary відповідь:', file);
      
      // Створюємо запис в MongoDB
      const fileRecord = new File({
        taskId: req.params.taskId,
        originalName: file.originalname,
        filename: file.filename,
        cloudinaryId: file.public_id,
        cloudinaryUrl: file.path,
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