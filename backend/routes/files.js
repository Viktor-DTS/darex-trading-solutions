const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const router = express.Router();

// Підключення до MongoDB
const uri = process.env.MONGODB_URI || "mongodb+srv://darex:darex123@cluster0.mongodb.net/test?retryWrites=true&w=majority";
const client = new MongoClient(uri);

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Генеруємо унікальне ім'я файлу
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB ліміт
  },
  fileFilter: function (req, file, cb) {
    // Дозволяємо тільки PDF та JPEG файли
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволені тільки PDF, JPEG, JPG та PNG.'), false);
    }
  }
});

// Завантаження файлу
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не був завантажений' });
    }

    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');

    const fileData = {
      taskId: req.body.taskId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadDate: new Date(),
      description: req.body.description || ''
    };

    const result = await filesCollection.insertOne(fileData);
    
    res.json({
      success: true,
      fileId: result.insertedId,
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
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');

    const files = await filesCollection.find({ taskId: req.params.taskId }).toArray();
    
    res.json(files);

  } catch (error) {
    console.error('Помилка отримання файлів:', error);
    res.status(500).json({ error: 'Помилка отримання файлів' });
  }
});

// Перегляд файлу
router.get('/view/:fileId', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');

    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.fileId) });
    
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ error: 'Файл не знайдено на сервері' });
    }

    // Встановлюємо заголовки для відображення файлу
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    
    // Відправляємо файл
    const fileStream = fs.createReadStream(file.path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Помилка перегляду файлу:', error);
    res.status(500).json({ error: 'Помилка перегляду файлу' });
  }
});

// Завантаження файлу
router.get('/download/:fileId', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');

    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.fileId) });
    
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ error: 'Файл не знайдено на сервері' });
    }

    // Встановлюємо заголовки для завантаження
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    
    // Відправляємо файл
    const fileStream = fs.createReadStream(file.path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Помилка завантаження файлу:', error);
    res.status(500).json({ error: 'Помилка завантаження файлу' });
  }
});

// Видалення файлу
router.delete('/:fileId', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');

    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.fileId) });
    
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    // Видаляємо файл з файлової системи
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Видаляємо запис з бази даних
    await filesCollection.deleteOne({ _id: new ObjectId(req.params.fileId) });
    
    res.json({ success: true });

  } catch (error) {
    console.error('Помилка видалення файлу:', error);
    res.status(500).json({ error: 'Помилка видалення файлу' });
  }
});

module.exports = router; 