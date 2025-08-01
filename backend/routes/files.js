const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFsStorage } = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
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

// Використовуємо існуюче підключення mongoose
const connection = mongoose.connection;
let gfs;

// Ініціалізація GridFS після підключення mongoose
connection.once('open', () => {
  gfs = Grid(connection.db, mongoose.mongo);
  gfs.collection('uploads');
  console.log('GridFS ініціалізовано');
});

// Multer GridFS Storage
const storage = new GridFsStorage({
  url: process.env.MONGODB_URI,
  file: (req, file) => {
    return {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: 'uploads',
      metadata: {
        taskId: req.body.taskId,
        description: req.body.description || ''
      }
    };
  },
  options: { useUnifiedTopology: true }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволені тільки PDF, JPEG, JPG та PNG.'), false);
    }
  }
});

// Схема для файлів
const fileSchema = new mongoose.Schema({
  taskId: String,
  originalName: String,
  filename: String,
  gridfsId: mongoose.Schema.Types.ObjectId,
  mimetype: String,
  size: Number,
  uploadDate: { type: Date, default: Date.now },
  description: String
});

const File = mongoose.model('File', fileSchema);

// Допоміжна функція для виконання операцій з автоматичним перепідключенням
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Перевіряємо з'єднання перед операцією
      if (mongoose.connection.readyState !== 1) {
        console.log(`Спроба ${attempt}: MongoDB не підключена, перепідключення...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return await operation();
    } catch (error) {
      console.error(`Помилка спроби ${attempt}:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Якщо помилка пов'язана з з'єднанням, намагаємося перепідключитися
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        console.log('Помилка мережі, спроба перепідключення...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

// Функція для перевірки та ініціалізації GridFS
function ensureGridFS() {
  if (!gfs && mongoose.connection.readyState === 1) {
    console.log('Ініціалізація GridFS...');
    gfs = Grid(mongoose.connection.db, mongoose.mongo);
    gfs.collection('uploads');
    console.log('GridFS ініціалізовано');
  }
  
  // Додаткова перевірка стану з'єднання
  if (mongoose.connection.readyState !== 1) {
    console.error('GridFS: MongoDB не підключена! ReadyState:', mongoose.connection.readyState);
    return null;
  }
  
  if (!gfs) {
    console.error('GridFS: Об\'єкт gfs не ініціалізовано');
    return null;
  }
  
  return gfs;
}

// Функція для перевірки існування файлу в GridFS
async function checkFileExists(gridfsId) {
  try {
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      return false;
    }
    
    return new Promise((resolve) => {
      gfsInstance.files.findOne({ _id: gridfsId }, (err, file) => {
        if (err) {
          console.error('Помилка перевірки файлу в GridFS:', err);
          resolve(false);
        } else {
          resolve(!!file);
        }
      });
    });
  } catch (error) {
    console.error('Помилка перевірки існування файлу:', error);
    return false;
  }
}

// Завантаження файлу
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не був завантажений' });
    }
    
    // Зберігаємо метадані у окремій колекції
    const newFile = new File({
      taskId: req.body.taskId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      gridfsId: req.file.id, // Важливо: зберігаємо правильний ID
      mimetype: req.file.mimetype,
      size: req.file.size,
      description: req.body.description || ''
    });
    
    const result = await executeWithRetry(() => newFile.save());
    console.log('Файл збережено:', result._id, 'GridFS ID:', req.file.id);
    
    res.json({
      success: true,
      fileId: result._id,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('Помилка завантаження файлу:', error);
    res.status(500).json({ error: 'Помилка завантаження файлу' });
  }
});

// Отримання списку файлів для завдання
router.get('/task/:taskId', async (req, res) => {
  try {
    const files = await executeWithRetry(() => File.find({ taskId: req.params.taskId }));
    res.json(files);
  } catch (error) {
    console.error('Помилка отримання файлів:', error);
    res.status(500).json({ error: 'Помилка отримання файлів' });
  }
});

// Перегляд файлу (inline)
router.get('/view/:fileId', async (req, res) => {
  try {
    console.log('[DEBUG] Спроба перегляду файлу ID:', req.params.fileId);
    
    const file = await executeWithRetry(() => File.findById(req.params.fileId));
    if (!file) {
      console.log('[DEBUG] Файл не знайдено в метаданих для ID:', req.params.fileId);
      return res.status(404).json({ error: 'Файл не знайдено на сервері' });
    }
    
    console.log('[DEBUG] Знайдено метадані файлу:', {
      id: file._id,
      originalName: file.originalName,
      gridfsId: file.gridfsId,
      taskId: file.taskId
    });
    
    // Перевіряємо існування файлу в GridFS
    const fileExists = await checkFileExists(file.gridfsId);
    if (!fileExists) {
      console.error('[ERROR] Файл не знайдено в GridFS для ID:', file.gridfsId);
      return res.status(404).json({ error: 'Файл не знайдено в GridFS' });
    }
    
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      console.error('[ERROR] GridFS не може бути ініціалізовано');
      return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    }
    
    console.log('[DEBUG] Спроба створення readstream для GridFS ID:', file.gridfsId);
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    
    const readstream = gfsInstance.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    
    readstream.on('error', err => {
      console.error('[ERROR] Помилка читання з GridFS:', err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'Файл не знайдено у GridFS' });
      }
    });
    
    readstream.on('end', () => {
      console.log('[DEBUG] Файл успішно відправлено:', file.originalName);
    });
    
    readstream.pipe(res);
  } catch (error) {
    console.error('[ERROR] Помилка перегляду файлу:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Помилка перегляду файлу' });
    }
  }
});

// Завантаження файлу (download)
router.get('/download/:fileId', async (req, res) => {
  try {
    console.log('[DEBUG] Спроба завантаження файлу ID:', req.params.fileId);
    
    const file = await executeWithRetry(() => File.findById(req.params.fileId));
    if (!file) {
      console.log('[DEBUG] Файл не знайдено в метаданих для ID:', req.params.fileId);
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    
    console.log('[DEBUG] Знайдено метадані файлу для завантаження:', {
      id: file._id,
      originalName: file.originalName,
      gridfsId: file.gridfsId,
      taskId: file.taskId
    });
    
    // Перевіряємо існування файлу в GridFS
    const fileExists = await checkFileExists(file.gridfsId);
    if (!fileExists) {
      console.error('[ERROR] Файл не знайдено в GridFS для завантаження ID:', file.gridfsId);
      return res.status(404).json({ error: 'Файл не знайдено в GridFS' });
    }
    
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      console.error('[ERROR] GridFS не може бути ініціалізовано для завантаження');
      return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    }
    
    console.log('[DEBUG] Спроба створення readstream для завантаження GridFS ID:', file.gridfsId);
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    
    const readstream = gfsInstance.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    
    readstream.on('error', err => {
      console.error('[ERROR] Помилка завантаження з GridFS:', err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'Файл не знайдено у GridFS' });
      }
    });
    
    readstream.on('end', () => {
      console.log('[DEBUG] Файл успішно завантажено:', file.originalName);
    });
    
    readstream.pipe(res);
  } catch (error) {
    console.error('[ERROR] Помилка завантаження файлу:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Помилка завантаження файлу' });
    }
  }
});

// Видалення файлу
router.delete('/:fileId', async (req, res) => {
  try {
    const file = await executeWithRetry(() => File.findById(req.params.fileId));
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      console.error('GridFS не може бути ініціалізовано');
      return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    }
    
    // Видаляємо файл з GridFS
    gfsInstance.remove({ _id: file.gridfsId, root: 'uploads' }, async (err) => {
      if (err) {
        console.error('Помилка видалення з GridFS:', err);
        return res.status(500).json({ error: 'Помилка видалення з GridFS' });
      }
      
      // Видаляємо запис з бази даних
      await executeWithRetry(() => File.findByIdAndDelete(req.params.fileId));
      console.log('Файл видалено:', req.params.fileId);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Помилка видалення файлу:', error);
    res.status(500).json({ error: 'Помилка видалення файлу' });
  }
});

// Функція для очищення сиротських записів файлів
async function cleanupOrphanedFiles() {
  try {
    console.log('[DEBUG] Початок очищення сиротських файлів...');
    
    const allFiles = await executeWithRetry(() => File.find({}));
    console.log('[DEBUG] Знайдено файлів в метаданих:', allFiles.length);
    
    let orphanedCount = 0;
    
    for (const file of allFiles) {
      const exists = await checkFileExists(file.gridfsId);
      if (!exists) {
        console.log('[DEBUG] Знайдено сиротський файл:', {
          id: file._id,
          originalName: file.originalName,
          gridfsId: file.gridfsId
        });
        
        // Видаляємо запис з метаданих
        await executeWithRetry(() => File.findByIdAndDelete(file._id));
        orphanedCount++;
      }
    }
    
    console.log('[DEBUG] Очищено сиротських файлів:', orphanedCount);
    return orphanedCount;
  } catch (error) {
    console.error('[ERROR] Помилка очищення сиротських файлів:', error);
    return 0;
  }
}

// API endpoint для очищення сиротських файлів
router.post('/cleanup', async (req, res) => {
  try {
    const orphanedCount = await cleanupOrphanedFiles();
    res.json({ 
      success: true, 
      message: `Очищено ${orphanedCount} сиротських файлів`,
      orphanedCount 
    });
  } catch (error) {
    console.error('[ERROR] Помилка API очищення:', error);
    res.status(500).json({ error: 'Помилка очищення файлів' });
  }
});

module.exports = router;
module.exports.cleanupOrphanedFiles = cleanupOrphanedFiles; 