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
  return gfs;
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
    const file = await executeWithRetry(() => File.findById(req.params.fileId));
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено на сервері' });
    }
    
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      console.error('GridFS не може бути ініціалізовано');
      return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    }
    
    console.log('Спроба перегляду файлу:', file._id, 'GridFS ID:', file.gridfsId);
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    
    const readstream = gfsInstance.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    
    readstream.on('error', err => {
      console.error('Помилка читання з GridFS:', err);
      res.status(404).json({ error: 'Файл не знайдено у GridFS' });
    });
    
    readstream.pipe(res);
  } catch (error) {
    console.error('Помилка перегляду файлу:', error);
    res.status(500).json({ error: 'Помилка перегляду файлу' });
  }
});

// Завантаження файлу (download)
router.get('/download/:fileId', async (req, res) => {
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
    
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    
    const readstream = gfsInstance.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    
    readstream.on('error', err => {
      console.error('Помилка завантаження з GridFS:', err);
      res.status(404).json({ error: 'Файл не знайдено у GridFS' });
    });
    
    readstream.pipe(res);
  } catch (error) {
    console.error('Помилка завантаження файлу:', error);
    res.status(500).json({ error: 'Помилка завантаження файлу' });
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

module.exports = router; 