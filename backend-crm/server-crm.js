/**
 * Стенд-алон CRM сервер
 * Запуск: node server-crm.js
 * Потрібно: MONGODB_URI в .env або змінні оточення
 *
 * Для інтеграції в основний backend — використовуйте routes з цієї папки
 * та підключіть їх у вашому app.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const Client = require('./models/Client');
const Sale = require('./models/Sale');

const app = express();
app.use(cors());
app.use(express.json());

// JWT middleware — для інтеграції використовуйте той самий що в основному backend
const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Не авторизовано' });
  }
  const token = auth.slice(7);
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    req.user = { login: payload.login || payload.sub, role: payload.role || 'manager' };
  } catch {
    req.user = { login: 'dev', role: 'admin' };
  }
  next();
};

// Routes
const clientsRouter = require('./routes/clients');
const salesRouter = require('./routes/sales');

app.use('/api/clients', authMiddleware, clientsRouter);
app.use('/api/sales', authMiddleware, salesRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3002;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/darex';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`CRM server :${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  });
