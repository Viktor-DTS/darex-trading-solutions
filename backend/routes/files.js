const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
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

// Простий роут для перевірки
router.get('/ping', (req, res) => {
  res.json({ 
    message: 'Файловий сервіс працює!',
    mongodb: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState
    }
  });
});

// Роут для отримання списку файлів завдання
router.get('/task/:taskId', async (req, res) => {
  try {
    const files = await File.find({ taskId: req.params.taskId });
    res.json(files);
  } catch (error) {
    console.error('Помилка отримання файлів:', error);
    res.status(500).json({ error: 'Помилка отримання файлів' });
  }
});

// Роут для видалення файлу
router.delete('/:fileId', async (req, res) => {
  try {
    const file = await File.findByIdAndDelete(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    res.json({ message: 'Файл видалено' });
  } catch (error) {
    console.error('Помилка видалення файлу:', error);
    res.status(500).json({ error: 'Помилка видалення файлу' });
  }
});

module.exports = router; 