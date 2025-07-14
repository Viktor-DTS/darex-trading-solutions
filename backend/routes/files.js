const express = require('express');
const multer = require('multer');
const { MongoClient, ObjectId } = require('mongodb');
const { GridFsStorage } = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const router = express.Router();

// Підключення до MongoDB
const uri = process.env.MONGODB_URI || "mongodb+srv://darex:darex123@cluster0.mongodb.net/test?retryWrites=true&w=majority";
const client = new MongoClient(uri);
let gfs;

// Ініціалізація GridFS
client.connect().then(() => {
  const db = client.db('test');
  gfs = Grid(db, require('mongodb'));
  gfs.collection('uploads');
});

// Multer GridFS Storage
const storage = new GridFsStorage({
  url: uri,
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

// Завантаження файлу
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не був завантажений' });
    }
    // Зберігаємо метадані у окремій колекції (опціонально)
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');
    const fileData = {
      taskId: req.body.taskId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      gridfsId: req.file.id,
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

// Перегляд файлу (inline)
router.get('/view/:fileId', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');
    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.fileId) });
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    if (!gfs) return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    const readstream = gfs.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    readstream.on('error', err => {
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
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');
    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.fileId) });
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    if (!gfs) return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    const readstream = gfs.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    readstream.on('error', err => {
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
    await client.connect();
    const db = client.db('test');
    const filesCollection = db.collection('files');
    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.fileId) });
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    if (!gfs) return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    // Видаляємо файл з GridFS
    gfs.remove({ _id: file.gridfsId, root: 'uploads' }, async (err) => {
      if (err) {
        return res.status(500).json({ error: 'Помилка видалення з GridFS' });
      }
      // Видаляємо запис з бази даних
      await filesCollection.deleteOne({ _id: new ObjectId(req.params.fileId) });
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Помилка видалення файлу:', error);
    res.status(500).json({ error: 'Помилка видалення файлу' });
  }
});

module.exports = router; 