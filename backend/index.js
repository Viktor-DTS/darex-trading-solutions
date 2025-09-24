// Завантаження змінних середовища
require('dotenv').config({ path: './config.env' });

// Додаткова перевірка для Render
if (process.env.NODE_ENV === 'production') {
  console.log('[ENV] Production mode detected');
  console.log('[ENV] MONGODB_URI exists:', !!process.env.MONGODB_URI);
  console.log('[ENV] PORT:', process.env.PORT);
  console.log('[ENV] MONGODB_URI preview:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'NOT SET');
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');


// Додаємо імпорт роуту файлів
const filesRouter = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3001;

const MONGODB_URI = process.env.MONGODB_URI;

console.log('[STARTUP] Server starting...');
console.log('[STARTUP] PORT:', PORT);
console.log('[STARTUP] MONGODB_URI exists:', !!MONGODB_URI);
console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV);



// Модель для збережених звітів
const savedReportSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // login користувача
  name: { type: String, required: true },
  date: { type: String, required: true },
  filters: { type: Object, required: true },
  approvalFilter: { type: String, required: true },
  dateRangeFilter: { type: Object, required: true },
  paymentDateRangeFilter: { type: Object, required: true },
  requestDateRangeFilter: { type: Object, required: true },
  selectedFields: { type: [String], required: true },
  groupBy: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const SavedReport = mongoose.model('SavedReport', savedReportSchema);

// Модель для журналу подій
const eventLogSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // login користувача
  userName: { type: String, required: true }, // ім'я користувача
  userRole: { type: String, required: true }, // роль користувача
  action: { type: String, required: true }, // тип дії
  entityType: { type: String, required: true }, // тип сутності (task, user, report, etc.)
  entityId: { type: String }, // ID сутності
  description: { type: String, required: true }, // опис дії
  details: { type: Object }, // детальна інформація
  ipAddress: { type: String }, // IP адреса
  userAgent: { type: String }, // User-Agent браузера
  timestamp: { type: Date, default: Date.now }
});

const EventLog = mongoose.model('EventLog', eventLogSchema);

// Модель для аналітики витрат та доходів
const analyticsSchema = new mongoose.Schema({
  region: { type: String, required: true }, // Регіон
  company: { type: String, required: true }, // Компанія
  year: { type: Number, required: true }, // Рік
  month: { type: Number, required: true }, // Місяць (1-12)
  
  // Статті витрат
  expenses: {
    salary: { type: Number, default: 0 }, // Зарплата
    fuel: { type: Number, default: 0 }, // Паливо
    transport: { type: Number, default: 0 }, // Транспорт
    materials: { type: Number, default: 0 }, // Матеріали
    equipment: { type: Number, default: 0 }, // Обладнання
    office: { type: Number, default: 0 }, // Офісні витрати
    marketing: { type: Number, default: 0 }, // Маркетинг
    other: { type: Number, default: 0 } // Інші витрати
  },
  
  // Фінансові показники
  revenue: { type: Number, default: 0 }, // Дохід (75% від вартості робіт)
  totalExpenses: { type: Number, default: 0 }, // Загальні витрати
  profit: { type: Number, default: 0 }, // Прибуток
  profitability: { type: Number, default: 0 }, // Рентабельність (%)
  
  // Метадані
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: String }, // Користувач, який створив
  updatedBy: { type: String } // Користувач, який оновив
});

// Індекс для швидкого пошуку
analyticsSchema.index({ region: 1, company: 1, year: 1, month: 1 });

const Analytics = mongoose.model('Analytics', analyticsSchema);

// Модель для категорій витрат
const expenseCategoriesSchema = new mongoose.Schema({
  categories: {
    type: Map,
    of: {
      label: String,
      color: String
    },
    default: {}
  },
  createdBy: String,
  updatedAt: { type: Date, default: Date.now }
});

const ExpenseCategories = mongoose.model('ExpenseCategories', expenseCategoriesSchema);

// Модель для налаштувань Telegram сповіщень
const notificationSettingsSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  role: { type: String, required: true },
  telegramChatId: { type: String, required: true },
  enabledNotifications: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const NotificationSettings = mongoose.model('NotificationSettings', notificationSettingsSchema);

// Модель для логу сповіщень
const notificationLogSchema = new mongoose.Schema({
  type: { type: String, required: true },
  taskId: String,
  userId: String,
  message: { type: String, required: true },
  telegramChatId: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['sent', 'failed', 'pending'], default: 'pending' },
  error: String
});

const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

// Модель для глобальних налаштувань сповіщень
const globalNotificationSettingsSchema = new mongoose.Schema({
  settings: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const GlobalNotificationSettings = mongoose.model('GlobalNotificationSettings', globalNotificationSettingsSchema);

// Змінна для режиму fallback
let FALLBACK_MODE = false;

// Функція для підключення до MongoDB
async function connectToMongoDB() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI не встановлено!');
    return false;
  }
  
  try {
    await mongoose.connect(MONGODB_URI, {
      // Сучасні опції підключення
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
    });
    console.log('MongoDB connected successfully');
    return true;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    return false;
  }
}

// Підключаємося до MongoDB
connectToMongoDB().then(async (connected) => {
  if (connected) {
    // --- Додаємо дефолтного адміністратора, якщо його немає ---
    const adminLogin = 'bugai';
    const adminUser = await User.findOne({ login: adminLogin });
    if (!adminUser) {
      await User.create({
        login: adminLogin,
        password: 'admin', // Змініть пароль після першого входу!
        role: 'admin',
        name: 'Бугай В.',
        region: 'Україна',
        id: Date.now(),
      });
      console.log('Дефолтного адміністратора створено!');
    }
  }
});

// Обробники подій для моніторингу з'єднання MongoDB
mongoose.connection.on('connected', () => {
  console.log('MongoDB підключено');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB помилка з\'єднання:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB відключено');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB перепідключено');
});

// Функція для перевірки та відновлення з'єднання
async function ensureConnection() {
  if (mongoose.connection.readyState !== 1) {
    console.log('Спроба перепідключення до MongoDB...');
    try {
      await connectToMongoDB();
    } catch (error) {
      console.error('Помилка перепідключення:', error);
    }
  }
}

// Періодична перевірка з'єднання кожні 30 секунд
setInterval(ensureConnection, 30000);

// Допоміжна функція для виконання MongoDB операцій з автоматичним перепідключенням
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Перевіряємо з'єднання перед операцією
      if (mongoose.connection.readyState !== 1) {
        console.log(`Спроба ${attempt}: MongoDB не підключена, перепідключення...`);
        await ensureConnection();
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
        await ensureConnection();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

// --- Схеми ---
const userSchema = new mongoose.Schema({
  login: String,
  password: String,
  role: String,
  name: String,
  region: String,
  columnsSettings: Object,
  id: Number,
  telegramChatId: String,
  lastActivity: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: Object,
});
const Role = mongoose.model('Role', roleSchema);

const regionSchema = new mongoose.Schema({
  name: String,
});
const Region = mongoose.model('Region', regionSchema);

const taskSchema = new mongoose.Schema({
  // Додайте потрібні поля для задачі
}, { strict: false });

// Додаємо індекси для оптимізації запитів
taskSchema.index({ requestDate: -1 }); // Для сортування по даті заявки
taskSchema.index({ status: 1 }); // Для фільтрації по статусу
taskSchema.index({ serviceRegion: 1 }); // Для фільтрації по регіону
taskSchema.index({ client: 1 }); // Для пошуку по клієнту
taskSchema.index({ engineer1: 1 }); // Для пошуку по інженеру
taskSchema.index({ engineer2: 1 }); // Для пошуку по інженеру
taskSchema.index({ approvedByWarehouse: 1 }); // Для фільтрації по підтвердженню складу
taskSchema.index({ approvedByAccountant: 1 }); // Для фільтрації по підтвердженню бухгалтера
taskSchema.index({ approvedByRegionalManager: 1 }); // Для фільтрації по підтвердженню регіонального керівника
taskSchema.index({ date: -1 }); // Для сортування по даті виконання
taskSchema.index({ requestNumber: 1 }); // Для пошуку по номеру заявки

const Task = mongoose.model('Task', taskSchema);

// Схема для бекапів
const backupSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // login користувача
  name: { type: String, required: true }, // назва бекапу
  description: { type: String }, // опис бекапу
  data: { type: String, required: true }, // JSON рядок з даними
  size: { type: Number, required: true }, // розмір в байтах
  taskCount: { type: Number, required: true }, // кількість завдань
  createdAt: { type: Date, default: Date.now },
  isAuto: { type: Boolean, default: false } // чи це автоматичний бекап
});
const Backup = mongoose.model('Backup', backupSchema);

const accessRulesSchema = new mongoose.Schema({
  rules: Object,
}, { strict: false });
const AccessRules = mongoose.model('AccessRules', accessRulesSchema);

app.use(cors({
  origin: [
    'https://darex-trading-solutions-f.onrender.com', 
    'https://darex-trading-solutions.onrender.com',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Додатковий middleware для обробки preflight запитів
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(200).end();
    return;
  }
  next();
});

// Логування CORS запитів
app.use((req, res, next) => {
  console.log(`[CORS] ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Додаємо роут файлів
app.use('/api/files', filesRouter);

// Логування запитів
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Обробка помилок
app.use((err, req, res, next) => {
  console.error('Помилка сервера:', err);
  res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

// Middleware для перевірки стану MongoDB
app.use(async (req, res, next) => {
  if (req.path === '/api/ping' || req.path === '/api/regions') {
    return next(); // Пропускаємо ping та regions запити
  }
  
  if (mongoose.connection.readyState !== 1) {
    console.log('MongoDB не підключена, спроба перепідключення...');
    try {
      await ensureConnection();
      // Даємо час на перепідключення
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (mongoose.connection.readyState === 1) {
        console.log('MongoDB успішно перепідключена');
        return next();
      }
    } catch (error) {
      console.error('Помилка перепідключення:', error);
    }
    
    console.error('MongoDB не підключена! ReadyState:', mongoose.connection.readyState);
    return res.status(503).json({ 
      error: 'База даних недоступна', 
      readyState: mongoose.connection.readyState 
    });
  }
  next();
});

const reports = [];

// --- USERS через MongoDB ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await executeWithRetry(() => User.find());
    res.json(users);
  } catch (error) {
    console.error('Помилка отримання користувачів:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:login', async (req, res) => {
  try {
    const user = await User.findOne({ login: req.params.login });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'Користувача не знайдено' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    console.log('[DEBUG] POST /api/users - отримано дані:', JSON.stringify(userData, null, 2));
    
    let user = await User.findOne({ login: userData.login });
    if (user) {
      console.log('[DEBUG] Оновлюємо існуючого користувача:', userData.login);
      Object.assign(user, userData);
      await user.save();
      console.log('[DEBUG] Користувача оновлено:', userData.login, 'telegramChatId:', user.telegramChatId);
    } else {
      console.log('[DEBUG] Створюємо нового користувача:', userData.login);
      user = new User({ ...userData, id: Date.now() });
      await user.save();
      console.log('[DEBUG] Користувача створено:', userData.login, 'telegramChatId:', user.telegramChatId);
    }
    res.json({ success: true, message: 'Користувача збережено' });
  } catch (error) {
    console.error('[ERROR] POST /api/users - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:login', async (req, res) => {
  try {
    const result = await User.deleteOne({ login: req.params.login });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    res.json({ success: true, message: 'Користувача видалено' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROLES через MongoDB ---
app.get('/api/roles', async (req, res) => {
  try {
    const roles = await Role.find();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/roles', async (req, res) => {
  try {
    await Role.deleteMany({});
    await Role.insertMany(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- REGIONS через MongoDB ---
app.get('/api/regions', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/regions - запит на отримання регіонів');
    const regions = await Region.find();
    console.log('[DEBUG] GET /api/regions - знайдено регіонів:', regions.length);
    res.json(regions);
  } catch (error) {
    console.error('[ERROR] GET /api/regions - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/regions', async (req, res) => {
  try {
    let regions = req.body;
    if (!Array.isArray(regions)) regions = [regions];
    // Валідація: всі елементи мають бути об'єктами з полем name
    if (!regions.length || !regions.every(r => typeof r === 'object' && r.name && typeof r.name === 'string')) {
      return res.status(400).json({ error: 'Дані мають бути масивом обʼєктів з полем name (рядок)' });
    }
    await Region.deleteMany({});
    await Region.insertMany(regions);
    res.json({ success: true });
  } catch (error) {
    console.error('Помилка при збереженні регіонів:', error, 'Дані:', req.body);
    res.status(500).json({ error: error.message, details: error, data: req.body });
  }
});

// --- TASKS через MongoDB ---
app.get('/api/tasks', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/tasks - запит на отримання завдань');
    
    // Отримуємо параметри запиту
    const { limit = 1000, skip = 0, sort = '-requestDate' } = req.query;
    
    // Оптимізований запит з обмеженнями та сортуванням
    const tasks = await executeWithRetry(() => 
      Task.find()
        .sort(sort)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean() // Використовуємо lean() для кращої продуктивності
    );
    
    console.log('[DEBUG] GET /api/tasks - знайдено завдань:', tasks.length);
    
    // Додаємо числовий id для сумісності з фронтендом
    const tasksWithId = tasks.map(task => ({
      ...task,
      id: task._id.toString()
    }));
    
    console.log('[DEBUG] GET /api/tasks - повертаємо завдань:', tasksWithId.length);
    res.json(tasksWithId);
  } catch (error) {
    console.error('[ERROR] GET /api/tasks - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Маршрут для отримання конкретного завдання за ID
app.get('/api/tasks/:id', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/tasks/:id - запит на отримання завдання з ID:', req.params.id);
    
    // Шукаємо завдання за _id (якщо id виглядає як ObjectId) або за числовим id
    let task;
    if (/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      // Якщо id виглядає як ObjectId
      console.log('[DEBUG] GET /api/tasks/:id - шукаємо за ObjectId:', req.params.id);
      task = await executeWithRetry(() => Task.findById(req.params.id));
    } else {
      // Якщо id числовий або рядковий
      console.log('[DEBUG] GET /api/tasks/:id - шукаємо за id:', req.params.id);
      task = await executeWithRetry(() => Task.findOne({ 
        $or: [
          { id: Number(req.params.id) },
          { id: req.params.id },
          { taskNumber: req.params.id }
        ]
      }));
    }
    
    if (!task) {
      console.error('[ERROR] GET /api/tasks/:id - завдання не знайдено для ID:', req.params.id);
      return res.status(404).json({ error: 'Task not found' });
    }
    
    console.log('[DEBUG] GET /api/tasks/:id - знайдено завдання:', task._id);
    
    // Додаємо числовий id для сумісності з фронтендом
    const taskWithId = {
      ...task.toObject(),
      id: task._id.toString()
    };
    
    res.json(taskWithId);
  } catch (error) {
    console.error('[ERROR] GET /api/tasks/:id - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/tasks', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/tasks - отримано дані:', JSON.stringify(req.body, null, 2));
    
    // Перевіряємо, чи є необхідні поля
    if (!req.body) {
      console.error('[ERROR] POST /api/tasks - відсутні дані');
      return res.status(400).json({ error: 'Відсутні дані заявки' });
    }
    
    // Видаляємо поле id, якщо воно є, оскільки MongoDB автоматично генерує _id
    const { id, ...taskData } = req.body;
    console.log('[DEBUG] POST /api/tasks - дані для збереження (без id):', JSON.stringify(taskData, null, 2));
    
    const newTask = new Task(taskData);
    console.log('[DEBUG] POST /api/tasks - створено новий Task об\'єкт');
    
    const savedTask = await executeWithRetry(() => newTask.save());
    console.log('[DEBUG] POST /api/tasks - заявка збережена успішно, _id:', savedTask._id);
    
    // Відправляємо Telegram сповіщення про нову заявку
    try {
      const user = req.user || { login: 'system', name: 'Система', role: 'system' };
      await telegramService.sendTaskNotification('task_created', savedTask, user);
    } catch (notificationError) {
      console.error('[ERROR] POST /api/tasks - помилка відправки сповіщення:', notificationError);
    }
    
    // Повертаємо заявку з числовим id для сумісності з фронтендом
    const responseTask = {
      ...savedTask.toObject(),
      id: savedTask._id.toString() // Використовуємо _id як числовий id
    };
    
    res.json({ success: true, task: responseTask });
  } catch (error) {
    console.error('[ERROR] POST /api/tasks - помилка:', error);
    console.error('[ERROR] POST /api/tasks - стек помилки:', error.stack);
    res.status(500).json({ error: error.message });
  }
});
app.put('/api/tasks/:id', async (req, res) => {
  try {
    console.log('[DEBUG] PUT /api/tasks/:id - отримано запит для ID:', req.params.id);
    console.log('[DEBUG] PUT /api/tasks/:id - дані для оновлення:', JSON.stringify(req.body, null, 2));
    
    // Шукаємо завдання за _id (якщо id виглядає як ObjectId) або за числовим id
    let task;
    if (/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      // Якщо id виглядає як ObjectId
      console.log('[DEBUG] PUT /api/tasks/:id - шукаємо за ObjectId:', req.params.id);
      task = await executeWithRetry(() => Task.findById(req.params.id));
    } else {
      // Якщо id числовий
      console.log('[DEBUG] PUT /api/tasks/:id - шукаємо за числовим id:', Number(req.params.id));
      task = await executeWithRetry(() => Task.findOne({ id: Number(req.params.id) }));
    }
    
    if (!task) {
      console.error('[ERROR] PUT /api/tasks/:id - завдання не знайдено для ID:', req.params.id);
      return res.status(404).json({ error: 'Task not found' });
    }
    
    console.log('[DEBUG] PUT /api/tasks/:id - знайдено завдання:', task._id);
    
    // Видаляємо поля id та _id з оновлення, якщо вони є
    const { id, _id, ...updateData } = req.body;
    console.log('[DEBUG] PUT /api/tasks/:id - дані для оновлення (без id та _id):', JSON.stringify(updateData, null, 2));
    
    // Оновлюємо поля через set
    task.set(updateData);
    console.log('[DEBUG] PUT /api/tasks/:id - застосовано зміни через set()');
    
    const updatedTask = await executeWithRetry(() => task.save());
    console.log('[DEBUG] PUT /api/tasks/:id - завдання збережено успішно:', updatedTask);
    
    // Відправляємо Telegram сповіщення про зміну статусу
    try {
      const user = req.user || { login: 'system', name: 'Система', role: 'system' };
      
      console.log('[DEBUG] PUT /api/tasks/:id - перевірка статусу для сповіщення');
      console.log('[DEBUG] PUT /api/tasks/:id - updateData.status:', updateData.status);
      console.log('[DEBUG] PUT /api/tasks/:id - updatedTask.status:', updatedTask.status);
      console.log('[DEBUG] PUT /api/tasks/:id - user:', user);
      
      // Перевіряємо різні варіанти статусу "Виконано" через проблеми з кодуванням
      const isCompleted = updateData.status === 'Виконано' || 
                         updatedTask.status === 'Виконано' ||
                         updateData.status === '????????' ||
                         updatedTask.status === '????????';
      
      if (isCompleted) {
        console.log('[DEBUG] PUT /api/tasks/:id - відправляємо task_completed сповіщення');
        console.log('[DEBUG] PUT /api/tasks/:id - updateData.status:', updateData.status);
        console.log('[DEBUG] PUT /api/tasks/:id - updatedTask.status:', updatedTask.status);
        await telegramService.sendTaskNotification('task_completed', updatedTask, user);
      } else if (updateData.approvedByWarehouse === 'Підтверджено' || 
                 updateData.approvedByAccountant === 'Підтверджено' || 
                 updateData.approvedByRegionalManager === 'Підтверджено') {
        console.log('[DEBUG] PUT /api/tasks/:id - відправляємо task_approved сповіщення');
        await telegramService.sendTaskNotification('task_approved', updatedTask, user);
      } else if (updateData.approvedByWarehouse === 'Відхилено' || 
                 updateData.approvedByAccountant === 'Відхилено' || 
                 updateData.approvedByRegionalManager === 'Відхилено') {
        console.log('[DEBUG] PUT /api/tasks/:id - відправляємо task_rejected сповіщення');
        await telegramService.sendTaskNotification('task_rejected', updatedTask, user);
      } else {
        console.log('[DEBUG] PUT /api/tasks/:id - статус не підходить для сповіщення');
      }
    } catch (notificationError) {
      console.error('[ERROR] PUT /api/tasks/:id - помилка відправки сповіщення:', notificationError);
    }
    
    // Повертаємо заявку з числовим id для сумісності
    const responseTask = {
      ...updatedTask.toObject(),
      id: updatedTask._id.toString()
    };
    
    console.log('[DEBUG] PUT /api/tasks/:id - повертаємо оновлене завдання з ID:', responseTask.id, 'Дані:', responseTask);
    res.json({ success: true, task: responseTask });
  } catch (error) {
    console.error('[ERROR] PUT /api/tasks/:id - помилка:', error);
    console.error('[ERROR] PUT /api/tasks/:id - стек помилки:', error.stack);
    res.status(500).json({ error: error.message });
  }
});
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    let result;
    if (/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      // Якщо id виглядає як ObjectId
      result = await executeWithRetry(() => Task.findByIdAndDelete(req.params.id));
    } else {
      // Якщо id числовий
      result = await executeWithRetry(() => Task.deleteOne({ id: Number(req.params.id) }));
    }
    
    res.json({ success: true, removed: result ? 1 : 0 });
  } catch (error) {
    console.error('[ERROR] DELETE /api/tasks/:id - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoints для імпортованих заявок
app.get('/api/tasks/imported', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/tasks/imported - отримано запит');
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] GET /api/tasks/imported - FALLBACK_MODE активний, повертаємо порожній масив');
      return res.json([]);
    }
    
    const importedTasks = await executeWithRetry(() => 
      Task.find({ isImported: true }).sort({ requestDate: -1 })
    );
    
    console.log(`[DEBUG] GET /api/tasks/imported - знайдено ${importedTasks.length} імпортованих заявок`);
    res.json(importedTasks);
  } catch (error) {
    console.error('[ERROR] GET /api/tasks/imported - помилка:', error);
    res.status(500).json({ error: 'Помилка отримання імпортованих заявок' });
  }
});

app.post('/api/tasks/imported', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/tasks/imported - отримано запит');
    console.log('[DEBUG] POST /api/tasks/imported - body:', req.body);
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] POST /api/tasks/imported - FALLBACK_MODE активний, повертаємо помилку');
      return res.status(503).json({ error: 'Сервер в режимі fallback, імпорт недоступний' });
    }
    
    const { tasks } = req.body;
    
    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Необхідно передати масив заявок' });
    }
    
    // Додаємо поле isImported: true до кожної заявки
    const importedTasks = tasks.map(task => ({
      ...task,
      isImported: true,
      status: 'Імпортовано' // Спеціальний статус для імпортованих заявок
    }));
    
    const savedTasks = await executeWithRetry(() => 
      Task.insertMany(importedTasks)
    );
    
    console.log(`[DEBUG] POST /api/tasks/imported - збережено ${savedTasks.length} імпортованих заявок`);
    res.json(savedTasks);
  } catch (error) {
    console.error('[ERROR] POST /api/tasks/imported - помилка:', error);
    res.status(500).json({ error: 'Помилка збереження імпортованих заявок' });
  }
});

app.delete('/api/tasks/imported/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[DEBUG] DELETE /api/tasks/imported/${id} - отримано запит`);
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] DELETE /api/tasks/imported - FALLBACK_MODE активний, повертаємо помилку');
      return res.status(503).json({ error: 'Сервер в режимі fallback, видалення недоступне' });
    }
    
    const deletedTask = await executeWithRetry(() => 
      Task.findOneAndDelete({ _id: id, isImported: true })
    );
    
    if (!deletedTask) {
      return res.status(404).json({ error: 'Імпортована заявка не знайдена' });
    }
    
    console.log(`[DEBUG] DELETE /api/tasks/imported/${id} - імпортована заявка видалена`);
    res.json({ message: 'Імпортована заявка видалена' });
  } catch (error) {
    console.error('[ERROR] DELETE /api/tasks/imported - помилка:', error);
    res.status(500).json({ error: 'Помилка видалення імпортованої заявки' });
  }
});

app.post('/api/tasks/imported/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { taskData } = req.body;
    console.log(`[DEBUG] POST /api/tasks/imported/${id}/approve - отримано запит`);
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] POST /api/tasks/imported/approve - FALLBACK_MODE активний, повертаємо помилку');
      return res.status(503).json({ error: 'Сервер в режимі fallback, схвалення недоступне' });
    }
    
    // Видаляємо імпортовану заявку
    await executeWithRetry(() => 
      Task.findOneAndDelete({ _id: id, isImported: true })
    );
    
    // Створюємо нову заявку в основній базі
    const newTask = await executeWithRetry(() => {
      const taskToCreate = {
        ...taskData,
        isImported: false, // Видаляємо позначку імпорту
        status: 'Виконано' // Встановлюємо нормальний статус
      };
      return Task.create(taskToCreate);
    });
    
    console.log(`[DEBUG] POST /api/tasks/imported/${id}/approve - заявка схвалена та переміщена в основну базу`);
    res.json(newTask);
  } catch (error) {
    console.error('[ERROR] POST /api/tasks/imported/approve - помилка:', error);
    res.status(500).json({ error: 'Помилка схвалення імпортованої заявки' });
  }
});

// --- ACCESS RULES через MongoDB ---
app.get('/api/accessRules', async (req, res) => {
  try {
    let doc = await AccessRules.findOne();
    if (!doc) doc = await AccessRules.create({ rules: {} });
    res.json(doc.rules || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/accessRules', async (req, res) => {
  try {
    console.log('[ACCESS RULES] Отримано для збереження:', JSON.stringify(req.body, null, 2));
    console.log('[ACCESS RULES] Тип даних:', typeof req.body);
    console.log('[ACCESS RULES] Чи є масивом:', Array.isArray(req.body));
    console.log('[ACCESS RULES] Кількість ключів:', Object.keys(req.body).length);
    
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
      console.log('[ACCESS RULES] Помилка валідації даних');
      return res.status(400).json({ error: 'Некоректний обʼєкт accessRules' });
    }
    
    let doc = await AccessRules.findOne();
    console.log('[ACCESS RULES] Поточний документ в БД:', doc ? 'знайдено' : 'не знайдено');
    
    if (!doc) {
      doc = new AccessRules({ rules: req.body });
      console.log('[ACCESS RULES] Створюємо новий документ');
    } else {
      console.log('[ACCESS RULES] Оновлюємо існуючий документ');
      console.log('[ACCESS RULES] Старі правила:', JSON.stringify(doc.rules, null, 2));
      doc.rules = req.body;
    }
    
    await doc.save();
    console.log('[ACCESS RULES] Збережено в БД:', JSON.stringify(doc.rules, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('[ACCESS RULES] Помилка збереження:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/report', (req, res) => {
  const report = req.body;
  reports.push({ ...report, createdAt: new Date() });
  res.json({ success: true, message: 'Звіт збережено!' });
});

app.get('/api/ping', (req, res) => {
  console.log('[DEBUG] GET /api/ping - запит на перевірку стану сервера');
  res.json({ 
    message: 'Сервер працює!',
    timestamp: new Date().toISOString(),
    mongodb: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState
    },
    env: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      mongoUriExists: !!process.env.MONGODB_URI
    }
  });
});

// Тестовий ендпоінт для перевірки MongoDB
app.get('/api/test-mongo', async (req, res) => {
  try {
    console.log('[TEST] Testing MongoDB connection...');
    const testDoc = { test: true, timestamp: new Date() };
    const result = await executeWithRetry(() => 
      mongoose.connection.db.collection('test').insertOne(testDoc)
    );
    console.log('[TEST] MongoDB test successful:', result.insertedId);
    res.json({ 
      success: true, 
      message: 'MongoDB connection test successful',
      insertedId: result.insertedId 
    });
  } catch (error) {
    console.error('[TEST] MongoDB test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      mongodb: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState
      }
    });
  }
});

app.get('/api/reports', (req, res) => {
  res.json(reports);
});

// --- BACKUP API ---
// Отримати всі бекапи користувача
app.get('/api/backups', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const backups = await executeWithRetry(() => 
      Backup.find({ userId }).sort({ createdAt: -1 }).limit(50)
    );
    
    res.json(backups);
  } catch (error) {
    console.error('[ERROR] GET /api/backups - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створити новий бекап
app.post('/api/backups', async (req, res) => {
  try {
    console.log('[BACKUP] POST /api/backups - початок створення бекапу');
    const { userId, name, description, data, taskCount, isAuto = false } = req.body;
    
    console.log('[BACKUP] Дані запиту:', { 
      userId, 
      name, 
      description: description?.substring(0, 50) + '...', 
      dataLength: data?.length, 
      taskCount, 
      isAuto 
    });
    
    if (!userId || !name || !data) {
      console.log('[BACKUP] Відсутні обов\'язкові поля:', { userId: !!userId, name: !!name, data: !!data });
      return res.status(400).json({ error: 'userId, name, and data are required' });
    }
    
    const size = Buffer.byteLength(data, 'utf8');
    console.log('[BACKUP] Розмір даних:', size, 'байт');
    
    // Перевіряємо розмір даних
    if (size > 16 * 1024 * 1024) { // 16MB ліміт
      console.log('[BACKUP] Дані занадто великі, обмежуємо до 16MB');
      const limitedData = data.substring(0, 16 * 1024 * 1024);
      backup.data = limitedData;
      backup.size = Buffer.byteLength(limitedData, 'utf8');
      console.log('[BACKUP] Новий розмір даних:', backup.size, 'байт');
    }
    
    let backup;
    try {
      backup = new Backup({
        userId,
        name,
        description,
        data,
        size,
        taskCount,
        isAuto
      });
      console.log('[BACKUP] Backup object created successfully');
    } catch (createError) {
      console.error('[BACKUP] Error creating Backup object:', createError);
      throw new Error(`Failed to create Backup object: ${createError.message}`);
    }
    
    console.log('[BACKUP] Збереження бекапу в MongoDB...');
    console.log('[BACKUP] Backup object before save:', {
      userId: backup.userId,
      name: backup.name,
      dataLength: backup.data.length,
      size: backup.size,
      taskCount: backup.taskCount
    });
    
    // Перевіряємо, чи існує колекція backups
    const collections = await mongoose.connection.db.listCollections().toArray();
    const backupCollectionExists = collections.some(col => col.name === 'backups');
    console.log('[BACKUP] Collections in database:', collections.map(c => c.name));
    console.log('[BACKUP] Backup collection exists:', backupCollectionExists);
    
    const savedBackup = await executeWithRetry(() => backup.save());
    console.log('[BACKUP] Бекап збережено з ID:', savedBackup._id);
    console.log('[BACKUP] Saved backup details:', {
      _id: savedBackup._id,
      userId: savedBackup.userId,
      name: savedBackup.name,
      createdAt: savedBackup.createdAt
    });
    
    res.json({ success: true, backup: savedBackup });
  } catch (error) {
    console.error('[ERROR] POST /api/backups - помилка:', error);
    console.error('[ERROR] Stack trace:', error.stack);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// Видалити бекап
app.delete('/api/backups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const result = await executeWithRetry(() => 
      Backup.findOneAndDelete({ _id: id, userId })
    );
    
    if (!result) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] DELETE /api/backups/:id - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати конкретний бекап
app.get('/api/backups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const backup = await executeWithRetry(() => 
      Backup.findOne({ _id: id, userId })
    );
    
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    
    res.json(backup);
  } catch (error) {
    console.error('[ERROR] GET /api/backups/:id - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для авторизації користувача
app.post('/api/auth', async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Відсутні логін або пароль' });
  }

  try {
    const user = await executeWithRetry(() => User.findOne({ login, password }));
    if (user) {
      const { password: _, ...userWithoutPassword } = user.toObject();
      res.json({ success: true, user: userWithoutPassword });
    } else {
      res.status(401).json({ error: 'Невірний логін або пароль' });
    }
  } catch (error) {
    console.error('Помилка авторизації:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- COLUMNS SETTINGS через MongoDB ---
// Отримати налаштування колонок для користувача і області
app.get('/api/users/:login/columns-settings/:area', async (req, res) => {
  try {
    console.log('[DEBUG] 📥 Завантаження налаштувань для:', req.params.login, req.params.area);
    const user = await User.findOne({ login: req.params.login });
    if (!user || !user.columnsSettings || !user.columnsSettings[req.params.area]) {
      console.log('[DEBUG] 📥 Налаштування не знайдено для:', req.params.login, req.params.area);
      return res.status(404).json({ error: 'Налаштування не знайдено' });
    }
    console.log('[DEBUG] 📥 Знайдені налаштування:', user.columnsSettings[req.params.area]);
    console.log('[DEBUG] 📥 Ширина колонок:', user.columnsSettings[req.params.area].widths);
    res.json(user.columnsSettings[req.params.area]);
  } catch (error) {
    console.error('[DEBUG] 📥 Помилка завантаження налаштувань:', error);
    res.status(500).json({ error: error.message });
  }
});
// Зберегти налаштування колонок для користувача і області
app.post('/api/users/:login/columns-settings', async (req, res) => {
  try {
    const { area, visible, order, widths } = req.body;
    console.log('[DEBUG] 🔧 Збереження налаштувань колонок:', { 
      login: req.params.login, 
      area, 
      visible: visible?.length, 
      order: order?.length, 
      widths: widths ? Object.keys(widths).length : 0 
    });
    console.log('[DEBUG] 🔧 Ширина колонок:', widths);
    
    let user = await User.findOne({ login: req.params.login });
    if (!user) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    if (!user.columnsSettings) user.columnsSettings = {};
    user.columnsSettings[area] = { visible, order, widths: widths || {} };
    
    console.log('[DEBUG] 🔧 Зберігаємо в базу:', user.columnsSettings[area]);
    await user.save();
    
    // Перевіряємо, що збереглося
    const savedUser = await User.findOne({ login: req.params.login });
    console.log('[DEBUG] 🔧 Перевірка після збереження:', savedUser.columnsSettings[area]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SAVED REPORTS API ---
// Зберегти звіт
app.post('/api/saved-reports', async (req, res) => {
  try {
    const { userId, name, date, filters, approvalFilter, dateRangeFilter, paymentDateRangeFilter, requestDateRangeFilter, selectedFields, groupBy } = req.body;
    
    const savedReport = new SavedReport({
      userId,
      name,
      date,
      filters,
      approvalFilter,
      dateRangeFilter,
      paymentDateRangeFilter,
      requestDateRangeFilter,
      selectedFields,
      groupBy
    });
    
    await savedReport.save();
    res.json({ success: true, message: 'Звіт збережено!', report: savedReport });
  } catch (error) {
    console.error('Помилка збереження звіту:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати всі збережені звіти користувача
app.get('/api/saved-reports/:userId', async (req, res) => {
  try {
    const reports = await SavedReport.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    console.error('Помилка отримання звітів:', error);
    res.status(500).json({ error: error.message });
  }
});

// Видалити збережений звіт
app.delete('/api/saved-reports/:reportId', async (req, res) => {
  try {
    const report = await SavedReport.findByIdAndDelete(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Звіт не знайдено' });
    }
    res.json({ success: true, message: 'Звіт видалено!' });
  } catch (error) {
    console.error('Помилка видалення звіту:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- EVENT LOG API ---
// Додати запис до журналу подій
app.post('/api/event-log', async (req, res) => {
  try {
    const { userId, userName, userRole, action, entityType, entityId, description, details } = req.body;
    
    const eventLog = new EventLog({
      userId,
      userName,
      userRole,
      action,
      entityType,
      entityId,
      description,
      details,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    
    await eventLog.save();
    res.json({ success: true, message: 'Подію збережено!' });
  } catch (error) {
    console.error('Помилка збереження події:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати журнал подій з фільтрами
app.get('/api/event-log', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      userId, 
      action, 
      entityType, 
      startDate, 
      endDate,
      search 
    } = req.query;
    
    const filter = {};
    
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { userId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const events = await EventLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await EventLog.countDocuments(filter);
    
    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Помилка отримання журналу подій:', error);
    res.status(500).json({ error: error.message });
  }
});

// Очистити старий журнал подій (старше 30 днів)
app.delete('/api/event-log/cleanup', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await EventLog.deleteMany({
      timestamp: { $lt: thirtyDaysAgo }
    });
    
    res.json({ 
      success: true, 
      message: `Видалено ${result.deletedCount} старих записів`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Помилка очищення журналу:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- ANALYTICS API ---
// Отримати аналітику за період
app.get('/api/analytics', async (req, res) => {
  try {
    const { 
      region, 
      company, 
      startYear, 
      endYear, 
      startMonth, 
      endMonth 
    } = req.query;
    
    const filter = {};
    
    if (region) filter.region = region;
    if (company) filter.company = company;
    
    // Фільтр по періоду
    if (startYear || endYear || startMonth || endMonth) {
      filter.$and = [];
      
      if (startYear && endYear) {
        filter.$and.push({ year: { $gte: parseInt(startYear), $lte: parseInt(endYear) } });
      } else if (startYear) {
        filter.$and.push({ year: { $gte: parseInt(startYear) } });
      } else if (endYear) {
        filter.$and.push({ year: { $lte: parseInt(endYear) } });
      }
      
      if (startMonth && endMonth) {
        filter.$and.push({ month: { $gte: parseInt(startMonth), $lte: parseInt(endMonth) } });
      } else if (startMonth) {
        filter.$and.push({ month: { $gte: parseInt(startMonth) } });
      } else if (endMonth) {
        filter.$and.push({ month: { $lte: parseInt(endMonth) } });
      }
    }
    
    // Використовуємо агрегацію для оптимізації
    const analytics = await executeWithRetry(() => 
      Analytics.aggregate([
        { $match: filter },
        { $sort: { year: 1, month: 1 } },
        { $limit: 1000 } // Обмежуємо кількість результатів
      ])
    );
    res.json(analytics);
  } catch (error) {
    console.error('Помилка отримання аналітики:', error);
    res.status(500).json({ error: error.message });
  }
});

// Зберегти аналітику
app.post('/api/analytics', async (req, res) => {
  try {
    const { region, company, year, month, expenses, createdBy } = req.body;
    
    // Валідація обов'язкових полів
    if (!region || !company || !year || !month) {
      return res.status(400).json({ 
        error: 'Відсутні обов\'язкові поля: region, company, year, month',
        received: { region, company, year, month }
      });
    }
    
    if (!expenses || typeof expenses !== 'object') {
      return res.status(400).json({ 
        error: 'Відсутні або неправильні дані витрат',
        received: { expenses }
      });
    }
    
    console.log('Збереження аналітики:', { region, company, year, month, expenses, createdBy });
    
    // Перевіряємо чи існує запис для цього періоду
    let analytics = await Analytics.findOne({ region, company, year: parseInt(year), month: parseInt(month) });
    
    if (analytics) {
      // Оновлюємо існуючий запис
      analytics.expenses = expenses;
      analytics.updatedAt = new Date();
      analytics.updatedBy = createdBy;
    } else {
      // Створюємо новий запис
      analytics = new Analytics({
        region,
        company,
        year: parseInt(year),
        month: parseInt(month),
        expenses,
        createdBy,
        updatedBy: createdBy
      });
    }
    
    // Розраховуємо загальні витрати
    analytics.totalExpenses = Object.values(expenses).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
    
    await analytics.save();
    res.json({ success: true, analytics });
  } catch (error) {
    console.error('Помилка збереження аналітики:', error);
    res.status(500).json({ error: error.message });
  }
});

// Видалити аналітику
app.delete('/api/analytics', async (req, res) => {
  try {
    const { region, company, year, month, user } = req.body;
    
    // Перевіряємо права доступу (спрощена перевірка)
    const allowedRoles = ['admin', 'administrator', 'regionalManager', 'regkerivn'];
    if (!user || !user.role || !allowedRoles.includes(user.role)) {
      console.log('Помилка прав доступу:', { user, allowedRoles });
      return res.status(403).json({ error: 'Недостатньо прав для видалення аналітики' });
    }
    
    if (!region || !company || !year || !month) {
      return res.status(400).json({ error: 'Відсутні обов\'язкові поля: region, company, year, month' });
    }
    
    console.log('Видалення аналітики:', { region, company, year, month, userRole: user.role });
    
    const result = await Analytics.deleteOne({ region, company, year: parseInt(year), month: parseInt(month) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Аналітика не знайдена' });
    }
    
    res.json({ success: true, message: 'Аналітика видалена успішно' });
  } catch (error) {
    console.error('Помилка видалення аналітики:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати дохід за період (розрахунок на основі заявок)
app.get('/api/analytics/revenue', async (req, res) => {
  try {
    const { region, company, startYear, endYear, startMonth, endMonth } = req.query;
    
    // Створюємо фільтр для заявок
    const taskFilter = {};
    
    if (region) taskFilter.serviceRegion = region;
    if (company) taskFilter.company = company;
    
    // Фільтр по даті виконання робіт
    if (startYear || endYear || startMonth || endMonth) {
      taskFilter.date = {};
      
      if (startYear && startMonth) {
        const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, 1);
        taskFilter.date.$gte = startDate.toISOString().split('T')[0];
      }
      
      if (endYear && endMonth) {
        const endDate = new Date(parseInt(endYear), parseInt(endMonth), 0);
        taskFilter.date.$lte = endDate.toISOString().split('T')[0];
      }
    }
    
    // Отримуємо виконані заявки за період (архів виконаних заявок)
    taskFilter.status = 'Виконано';
    const tasks = await Task.find(taskFilter);
    
    // Розраховуємо дохід по роботах та матеріалам
    const revenueByMonth = {};
    const materialsRevenueByMonth = {};
    
    console.log(`[DEBUG] Знайдено ${tasks.length} заявок`);
    let processedTasks = 0;
    
    tasks.forEach(task => {
      console.log(`[DEBUG] Заявка ${task._id}: bonusApprovalDate=${task.bonusApprovalDate}, workPrice=${task.workPrice}, approvedByWarehouse=${task.approvedByWarehouse}, approvedByAccountant=${task.approvedByAccountant}, approvedByRegionalManager=${task.approvedByRegionalManager}`);
      
      // Перевіряємо чи заявка підтверджена всіма
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;
      
      if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved && isRegionalManagerApproved) {
        let approvalYear, approvalMonth;
        
        // Парсимо bonusApprovalDate з двох можливих форматів
        if (task.bonusApprovalDate.includes('-')) {
          const parts = task.bonusApprovalDate.split('-');
          if (parts.length === 2) {
            // Формат "08-2025"
            approvalMonth = parseInt(parts[0]);
            approvalYear = parseInt(parts[1]);
          } else if (parts.length === 3) {
            // Формат "2025-07-04"
            approvalYear = parseInt(parts[0]);
            approvalMonth = parseInt(parts[1]);
          }
        }
        
        if (approvalYear && approvalMonth) {
          const key = `${approvalYear}-${approvalMonth}`;
          
          if (!revenueByMonth[key]) {
            revenueByMonth[key] = 0;
            materialsRevenueByMonth[key] = 0;
          }
          
          // Додаємо дохід по виконаним роботам з правильною логікою розподілу між інженерами
          const workPrice = parseFloat(task.workPrice) || 0;
          const bonusVal = workPrice * 0.25; // Базова премія (25% від workPrice)
          
          // Розраховуємо фактичну премію з урахуванням розподілу між інженерами
          let actualBonus = 0;
          const engineer1 = (task.engineer1 || '').trim();
          const engineer2 = (task.engineer2 || '').trim();
          
          if (engineer1 && engineer2) {
            // Два інженери - кожен отримує половину, загальна сума = повна премія
            actualBonus = bonusVal;
          } else if (engineer1 || engineer2) {
            // Один інженер - отримує повну суму
            actualBonus = bonusVal;
          }
          
          const workRevenue = actualBonus * 3; // Дохід по роботах = фактична премія × 3
          revenueByMonth[key] += workRevenue;
          
          // Додаємо дохід по матеріалам: сума всіх матеріальних витрат / 4
          const oilTotal = parseFloat(task.oilTotal) || 0;
          const filterSum = parseFloat(task.filterSum) || 0;
          const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
          const airFilterSum = parseFloat(task.airFilterSum) || 0;
          const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
          const otherSum = parseFloat(task.otherSum) || 0;
          
          const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
          const materialsRevenue = totalMaterials / 4; // сума матеріалів поділена на 4
          materialsRevenueByMonth[key] += materialsRevenue;
          
          processedTasks++;
          
          console.log(`[DEBUG] Додано дохід для ${key}: workPrice=${workPrice}, bonusVal=${bonusVal} грн, actualBonus=${actualBonus} грн, workRevenue=${workRevenue} грн, materialsRevenue=${materialsRevenue} грн`);
        }
      }
    });
    
    console.log(`[DEBUG] Оброблено ${processedTasks} заявок з преміями`);
    console.log(`[DEBUG] Підсумковий дохід по роботах:`, revenueByMonth);
    console.log(`[DEBUG] Підсумковий дохід по матеріалам:`, materialsRevenueByMonth);
    
    res.json({ revenueByMonth, materialsRevenueByMonth });
  } catch (error) {
    console.error('Помилка розрахунку доходу:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати повну аналітику з доходами та прибутком
app.get('/api/analytics/full', async (req, res) => {
  try {
    const { region, company, startYear, endYear, startMonth, endMonth, details, year, month } = req.query;
    
    // Отримуємо аналітику витрат
    const analyticsFilter = {};
    if (region) analyticsFilter.region = region;
    if (company) analyticsFilter.company = company;
    
    if (startYear || endYear || startMonth || endMonth) {
      analyticsFilter.$and = [];
      
      if (startYear && endYear) {
        analyticsFilter.$and.push({ year: { $gte: parseInt(startYear), $lte: parseInt(endYear) } });
      } else if (startYear) {
        analyticsFilter.$and.push({ year: { $gte: parseInt(startYear) } });
      } else if (endYear) {
        analyticsFilter.$and.push({ year: { $lte: parseInt(endYear) } });
      }
      
      if (startMonth && endMonth) {
        analyticsFilter.$and.push({ month: { $gte: parseInt(startMonth), $lte: parseInt(endMonth) } });
      } else if (startMonth) {
        analyticsFilter.$and.push({ month: { $gte: parseInt(startMonth) } });
      } else if (endMonth) {
        analyticsFilter.$and.push({ month: { $lte: parseInt(endMonth) } });
      }
    }
    
    const analytics = await Analytics.find(analyticsFilter).sort({ year: 1, month: 1 });
    
    // Отримуємо доходи
    const taskFilter = {};
    if (region) taskFilter.serviceRegion = region;
    if (company) taskFilter.company = company;
    
    if (startYear || endYear || startMonth || endMonth) {
      taskFilter.date = {};
      
      if (startYear && startMonth) {
        const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, 1);
        taskFilter.date.$gte = startDate.toISOString().split('T')[0];
      }
      
      if (endYear && endMonth) {
        const endDate = new Date(parseInt(endYear), parseInt(endMonth), 0);
        taskFilter.date.$lte = endDate.toISOString().split('T')[0];
      }
    }
    
    // Отримуємо виконані заявки за період (архів виконаних заявок)
    taskFilter.status = 'Виконано';
    const tasks = await Task.find(taskFilter);
    
    console.log(`[DEBUG] Знайдено ${tasks.length} заявок для аналітики`);
    
    // Розраховуємо доходи по місяцях (сума премій за виконання сервісних робіт та матеріалів)
    const revenueByMonth = {};
    const materialsRevenueByMonth = {};
    const regionsByMonth = {};
    const companiesByMonth = {};
    
    // Розраховуємо запланований дохід по місяцях
    const plannedRevenueByMonth = {};
    const plannedMaterialsRevenueByMonth = {};
    
    tasks.forEach(task => {
      // Перевіряємо чи заявка підтверджена всіма
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;
      
      // Розраховуємо дохід по роботах та матеріалам
      const workPrice = parseFloat(task.workPrice) || 0;
      const oilTotal = parseFloat(task.oilTotal) || 0;
      const filterSum = parseFloat(task.filterSum) || 0;
      const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
      const airFilterSum = parseFloat(task.airFilterSum) || 0;
      const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
      const otherSum = parseFloat(task.otherSum) || 0;
      const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
      
      // Розраховуємо дохід по роботах та матеріалам з правильною логікою розподілу між інженерами
      const bonusVal = workPrice * 0.25; // Базова премія (25% від workPrice)
      
      // Розраховуємо фактичну премію з урахуванням розподілу між інженерами
      let actualBonus = 0;
      const engineer1 = (task.engineer1 || '').trim();
      const engineer2 = (task.engineer2 || '').trim();
      
      if (engineer1 && engineer2) {
        // Два інженери - кожен отримує половину, загальна сума = повна премія
        actualBonus = bonusVal;
      } else if (engineer1 || engineer2) {
        // Один інженер - отримує повну суму
        actualBonus = bonusVal;
      }
      
      const workRevenue = actualBonus * 3; // Дохід по роботах = фактична премія × 3
      const materialsRevenue = totalMaterials / 4; // Дохід по матеріалам = сума матеріалів ÷ 4
      
      if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved && isRegionalManagerApproved) {
        // Підтверджена заявка - додаємо до підтверджених доходів
        let approvalYear, approvalMonth;
        
        // Парсимо bonusApprovalDate з двох можливих форматів
        if (task.bonusApprovalDate.includes('-')) {
          const parts = task.bonusApprovalDate.split('-');
          if (parts.length === 2) {
            // Формат "08-2025"
            approvalMonth = parseInt(parts[0]);
            approvalYear = parseInt(parts[1]);
          } else if (parts.length === 3) {
            // Формат "2025-07-04"
            approvalYear = parseInt(parts[0]);
            approvalMonth = parseInt(parts[1]);
          }
        }
        
        if (approvalYear && approvalMonth) {
          const key = `${approvalYear}-${approvalMonth}`;
          
          if (!revenueByMonth[key]) {
            revenueByMonth[key] = 0;
            materialsRevenueByMonth[key] = 0;
            regionsByMonth[key] = new Set();
            companiesByMonth[key] = new Set();
          }
          
          // Додаємо дохід по виконаним роботам
          revenueByMonth[key] += workRevenue;
          
          // Додаємо дохід по матеріалам
          materialsRevenueByMonth[key] += materialsRevenue;
          
          // Збираємо регіони та компанії для цього місяця
          if (task.serviceRegion) {
            regionsByMonth[key].add(task.serviceRegion);
          }
          if (task.company) {
            companiesByMonth[key].add(task.company);
          }
        }
      } else if (task.workPrice) {
        // Непідтверджена заявка - додаємо до запланованих доходів
        let taskYear, taskMonth;
        
        // Парсимо дату заявки
        if (task.date && task.date.includes('-')) {
          const parts = task.date.split('-');
          if (parts.length === 3) {
            // Формат "2025-07-04"
            taskYear = parseInt(parts[0]);
            taskMonth = parseInt(parts[1]);
          }
        }
        
        if (taskYear && taskMonth) {
          const key = `${taskYear}-${taskMonth}`;
          
          if (!plannedRevenueByMonth[key]) {
            plannedRevenueByMonth[key] = 0;
            plannedMaterialsRevenueByMonth[key] = 0;
          }
          
          // Додаємо запланований дохід по роботах
          plannedRevenueByMonth[key] += workRevenue;
          
          // Додаємо запланований дохід по матеріалам
          plannedMaterialsRevenueByMonth[key] += materialsRevenue;
        }
      }
    });
    
    // Групуємо дані по місяцях (загальні суми для кожного місяця)
    const monthlyData = {};
    
    // Додаємо існуючі записи аналітики, групуємо по місяцях
    analytics.forEach(item => {
      const key = `${item.year}-${item.month}`;
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          year: item.year,
          month: item.month,
          workRevenue: 0,
          materialsRevenue: 0,
          plannedWorkRevenue: 0,
          plannedMaterialsRevenue: 0,
          totalExpenses: 0,
          expenses: {
            salary: 0,
            fuel: 0,
            transport: 0,
            materials: 0,
            equipment: 0,
            office: 0,
            marketing: 0,
            other: 0
          },
          regions: new Set(),
          companies: new Set()
        };
      }
      
      // Додаємо витрати
      monthlyData[key].totalExpenses += item.totalExpenses || 0;
      Object.keys(item.expenses || {}).forEach(category => {
        monthlyData[key].expenses[category] = (monthlyData[key].expenses[category] || 0) + (item.expenses[category] || 0);
      });
      
      // Додаємо регіони та компанії
      if (item.region) monthlyData[key].regions.add(item.region);
      if (item.company) monthlyData[key].companies.add(item.company);
    });
    
    // Додаємо доходи для кожного місяця
    Object.keys(revenueByMonth).forEach(key => {
      if (!monthlyData[key]) {
        monthlyData[key] = {
          year: parseInt(key.split('-')[0]),
          month: parseInt(key.split('-')[1]),
          workRevenue: 0,
          materialsRevenue: 0,
          plannedWorkRevenue: 0,
          plannedMaterialsRevenue: 0,
          totalExpenses: 0,
          expenses: {
            salary: 0,
            fuel: 0,
            transport: 0,
            materials: 0,
            equipment: 0,
            office: 0,
            marketing: 0,
            other: 0
          },
          regions: new Set(),
          companies: new Set()
        };
      }
      
      // Додаємо доходи
      monthlyData[key].workRevenue += revenueByMonth[key] || 0;
      monthlyData[key].materialsRevenue += materialsRevenueByMonth[key] || 0;
      monthlyData[key].plannedWorkRevenue += plannedRevenueByMonth[key] || 0;
      monthlyData[key].plannedMaterialsRevenue += plannedMaterialsRevenueByMonth[key] || 0;
      
      // Додаємо регіони та компанії з доходів
      if (regionsByMonth[key]) {
        regionsByMonth[key].forEach(region => monthlyData[key].regions.add(region));
      }
      if (companiesByMonth[key]) {
        companiesByMonth[key].forEach(company => monthlyData[key].companies.add(company));
      }
    });
    
    // Створюємо фінальний масив з згрупованими даними
    const fullAnalytics = Object.values(monthlyData).map(data => {
      const totalRevenue = data.workRevenue + data.materialsRevenue;
      const totalPlannedRevenue = data.plannedWorkRevenue + data.plannedMaterialsRevenue;
      const profit = totalRevenue - data.totalExpenses;
      const profitability = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      
      return {
        _id: `monthly-${data.year}-${data.month}`,
        region: Array.from(data.regions).join(', '),
        company: Array.from(data.companies).join(', '),
        year: data.year,
        month: data.month,
        workRevenue: Number(data.workRevenue.toFixed(2)),
        materialsRevenue: Number(data.materialsRevenue.toFixed(2)),
        plannedWorkRevenue: Number(data.plannedWorkRevenue.toFixed(2)),
        plannedMaterialsRevenue: Number(data.plannedMaterialsRevenue.toFixed(2)),
        plannedRevenue: Number(totalPlannedRevenue.toFixed(2)),
        revenue: Number(totalRevenue.toFixed(2)),
        totalExpenses: Number(data.totalExpenses.toFixed(2)),
        expenses: data.expenses,
        profit: Number(profit.toFixed(2)),
        profitability: Number(profitability.toFixed(2)),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    // Сортуємо за роком та місяцем
    fullAnalytics.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    
    // Якщо запитується деталізація для конкретного місяця
    if (details === 'true' && year && month) {
      const monthNames = [
        'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
        'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
      ];

      // Отримуємо заявки з фільтрами
      const taskFilter = {};
      if (region) taskFilter.serviceRegion = region;
      if (company) taskFilter.company = company;
      taskFilter.status = 'Виконано';

      const tasks = await Task.find(taskFilter);
      
      const workTasks = [];
      const materialsTasks = [];
      let totalWorkRevenue = 0;
      let totalMaterialsRevenue = 0;

      // Обробляємо заявки для доходу по роботах
      tasks.forEach(task => {
        const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
        const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
        const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;

        if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved && isRegionalManagerApproved) {
          // Розраховуємо місяць для нарахування премії
          let bonusApprovalDate = task.bonusApprovalDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
            const [year, month] = bonusApprovalDate.split('-');
            bonusApprovalDate = `${month}-${year}`;
          }

          const workDate = new Date(task.date);
          const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
          const approvalMonth = parseInt(approvalMonthStr);
          const approvalYear = parseInt(approvalYearStr);
          const workMonth = workDate.getMonth() + 1;
          const workYear = workDate.getFullYear();

          let bonusMonth, bonusYear;
          if (workMonth === approvalMonth && workYear === approvalYear) {
            bonusMonth = workMonth;
            bonusYear = workYear;
          } else {
            if (approvalMonth === 1) {
              bonusMonth = 12;
              bonusYear = approvalYear - 1;
            } else {
              bonusMonth = approvalMonth - 1;
              bonusYear = approvalYear;
            }
          }

          // Перевіряємо чи це потрібний місяць
          if (bonusMonth === parseInt(month) && bonusYear === parseInt(year)) {
            const workPrice = parseFloat(task.workPrice) || 0;
            const baseBonus = workPrice * 0.25;
            
            // Розраховуємо фактичну премію з урахуванням розподілу між інженерами
            let actualBonus = 0;
            const engineer1 = (task.engineer1 || '').trim();
            const engineer2 = (task.engineer2 || '').trim();
            
            if (engineer1 && engineer2) {
              actualBonus = baseBonus; // Два інженери - загальна сума = повна премія
            } else if (engineer1 || engineer2) {
              actualBonus = baseBonus; // Один інженер - повна сума
            }

            const revenue = actualBonus * 3;
            totalWorkRevenue += revenue;

            workTasks.push({
              workDate: task.date,
              approvalDate: task.bonusApprovalDate,
              engineer1: task.engineer1,
              engineer2: task.engineer2,
              client: task.client,
              workPrice: workPrice,
              baseBonus: baseBonus,
              actualBonus: actualBonus,
              revenue: revenue
            });
          }
        }

        // Обробляємо заявки для доходу по матеріалам
        if (task.date) {
          const workDate = new Date(task.date);
          const workMonth = workDate.getMonth() + 1;
          const workYear = workDate.getFullYear();

          if (workMonth === parseInt(month) && workYear === parseInt(year)) {
            const oilTotal = parseFloat(task.oilTotal) || 0;
            const filterSum = parseFloat(task.filterSum) || 0;
            const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
            const airFilterSum = parseFloat(task.airFilterSum) || 0;
            const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
            const otherSum = parseFloat(task.otherSum) || 0;
            
            const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
            const materialsRevenue = totalMaterials / 4;
            totalMaterialsRevenue += materialsRevenue;

            materialsTasks.push({
              workDate: task.date,
              client: task.client,
              oilTotal: oilTotal,
              filtersTotal: filterSum + fuelFilterSum + airFilterSum,
              antifreezeSum: antifreezeSum,
              otherSum: otherSum,
              totalMaterials: totalMaterials,
              materialsRevenue: materialsRevenue
            });
          }
        }
      });

      return res.json({
        year: parseInt(year),
        month: parseInt(month),
        monthName: monthNames[parseInt(month) - 1],
        region: region || 'Всі регіони',
        company: company || 'Всі компанії',
        workRevenue: totalWorkRevenue,
        materialsRevenue: totalMaterialsRevenue,
        totalRevenue: totalWorkRevenue + totalMaterialsRevenue,
        workTasks: workTasks,
        materialsTasks: materialsTasks
      });
    }
    
    res.json(fullAnalytics);
  } catch (error) {
    console.error('Помилка отримання повної аналітики:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати деталі розрахунку доходу для конкретного місяця
app.get('/api/analytics/details', async (req, res) => {
  try {
    const { year, month, region, company } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Потрібно вказати рік та місяць' });
    }

    // Отримуємо заявки з фільтрами
    const taskFilter = {};
    if (region) taskFilter.serviceRegion = region;
    if (company) taskFilter.company = company;
    taskFilter.status = 'Виконано';

    const tasks = await Task.find(taskFilter);
    
    const monthNames = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ];

    const workTasks = [];
    const materialsTasks = [];
    let totalWorkRevenue = 0;
    let totalMaterialsRevenue = 0;

    // Обробляємо заявки для доходу по роботах
    tasks.forEach(task => {
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;

      if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved && isRegionalManagerApproved) {
        // Розраховуємо місяць для нарахування премії
        let bonusApprovalDate = task.bonusApprovalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
          const [year, month] = bonusApprovalDate.split('-');
          bonusApprovalDate = `${month}-${year}`;
        }

        const workDate = new Date(task.date);
        const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
        const approvalMonth = parseInt(approvalMonthStr);
        const approvalYear = parseInt(approvalYearStr);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();

        let bonusMonth, bonusYear;
        if (workMonth === approvalMonth && workYear === approvalYear) {
          bonusMonth = workMonth;
          bonusYear = workYear;
        } else {
          if (approvalMonth === 1) {
            bonusMonth = 12;
            bonusYear = approvalYear - 1;
          } else {
            bonusMonth = approvalMonth - 1;
            bonusYear = approvalYear;
          }
        }

        // Перевіряємо чи це потрібний місяць
        if (bonusMonth === parseInt(month) && bonusYear === parseInt(year)) {
          const workPrice = parseFloat(task.workPrice) || 0;
          const baseBonus = workPrice * 0.25;
          
          // Розраховуємо фактичну премію з урахуванням розподілу між інженерами
          let actualBonus = 0;
          const engineer1 = (task.engineer1 || '').trim();
          const engineer2 = (task.engineer2 || '').trim();
          
          if (engineer1 && engineer2) {
            actualBonus = baseBonus; // Два інженери - загальна сума = повна премія
          } else if (engineer1 || engineer2) {
            actualBonus = baseBonus; // Один інженер - повна сума
          }

          const revenue = actualBonus * 3;
          totalWorkRevenue += revenue;

          workTasks.push({
            workDate: task.date,
            approvalDate: task.bonusApprovalDate,
            engineer1: task.engineer1,
            engineer2: task.engineer2,
            client: task.client,
            workPrice: workPrice,
            baseBonus: baseBonus,
            actualBonus: actualBonus,
            revenue: revenue
          });
        }
      }

      // Обробляємо заявки для доходу по матеріалам
      if (task.date) {
        const workDate = new Date(task.date);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();

        if (workMonth === parseInt(month) && workYear === parseInt(year)) {
          const oilTotal = parseFloat(task.oilTotal) || 0;
          const filterSum = parseFloat(task.filterSum) || 0;
          const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
          const airFilterSum = parseFloat(task.airFilterSum) || 0;
          const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
          const otherSum = parseFloat(task.otherSum) || 0;
          
          const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
          const materialsRevenue = totalMaterials / 4;
          totalMaterialsRevenue += materialsRevenue;

          materialsTasks.push({
            workDate: task.date,
            client: task.client,
            oilTotal: oilTotal,
            filtersTotal: filterSum + fuelFilterSum + airFilterSum,
            antifreezeSum: antifreezeSum,
            otherSum: otherSum,
            totalMaterials: totalMaterials,
            materialsRevenue: materialsRevenue
          });
        }
      }
    });

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      monthName: monthNames[parseInt(month) - 1],
      region: region || 'Всі регіони',
      company: company || 'Всі компанії',
      workRevenue: totalWorkRevenue,
      materialsRevenue: totalMaterialsRevenue,
      totalRevenue: totalWorkRevenue + totalMaterialsRevenue,
      workTasks: workTasks,
      materialsTasks: materialsTasks
    });

  } catch (error) {
    console.error('Помилка отримання деталей:', error);
    res.status(500).json({ error: error.message });
  }
});

// Копіювати витрати з попереднього місяця
app.post('/api/analytics/copy-previous', async (req, res) => {
  try {
    const { region, company, year, month, createdBy } = req.body;
    
    // Знаходимо попередній місяць
    let prevYear = year;
    let prevMonth = month - 1;
    
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    // Шукаємо дані попереднього місяця
    const previousAnalytics = await Analytics.findOne({
      region,
      company,
      year: prevYear,
      month: prevMonth
    });
    
    if (!previousAnalytics) {
      return res.status(404).json({ error: 'Дані попереднього місяця не знайдено' });
    }
    
    // Створюємо новий запис з копією витрат
    const newAnalytics = new Analytics({
      region,
      company,
      year,
      month,
      expenses: previousAnalytics.expenses,
      totalExpenses: previousAnalytics.totalExpenses,
      createdBy,
      updatedBy: createdBy
    });
    
    await newAnalytics.save();
    res.json({ success: true, analytics: newAnalytics });
  } catch (error) {
    console.error('Помилка копіювання витрат:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання унікальних регіонів з заявок
app.get('/api/unique-regions', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/unique-regions - запит отримано');
    
    const regions = await Task.distinct('serviceRegion');
    const filteredRegions = regions
      .filter(region => region && region.trim() !== '')
      .sort();
    
    console.log('[DEBUG] GET /api/unique-regions - знайдено регіонів:', filteredRegions.length);
    res.json(filteredRegions);
  } catch (error) {
    console.error('[ERROR] GET /api/unique-regions - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання унікальних компаній з заявок
app.get('/api/unique-companies', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/unique-companies - запит отримано');
    
    const companies = await Task.distinct('company');
    const filteredCompanies = companies
      .filter(company => company && company.trim() !== '')
      .sort();
    
    console.log('[DEBUG] GET /api/unique-companies - знайдено компаній:', filteredCompanies.length);
    res.json(filteredCompanies);
  } catch (error) {
    console.error('[ERROR] GET /api/unique-companies - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання запланованого доходу (заявки зі статусом "виконанні" але не підтверджені)
app.get('/api/analytics/planned-revenue', async (req, res) => {
  try {
    const { region, company, startYear, endYear, startMonth, endMonth } = req.query;
    
    // Створюємо фільтр для заявок
    const taskFilter = {};
    
    if (region) taskFilter.serviceRegion = region;
    if (company) taskFilter.company = company;
    
    // Фільтр по даті виконання робіт
    if (startYear || endYear || startMonth || endMonth) {
      taskFilter.date = {};
      
      if (startYear && startMonth) {
        const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, 1);
        taskFilter.date.$gte = startDate.toISOString().split('T')[0];
      }
      
      if (endYear && endMonth) {
        const endDate = new Date(parseInt(endYear), parseInt(endMonth), 0);
        taskFilter.date.$lte = endDate.toISOString().split('T')[0];
      }
    }
    
    // Отримуємо заявки зі статусом "Виконано" але не підтверджені усіма учасниками
    taskFilter.status = 'Виконано';
    const tasks = await Task.find(taskFilter);
    
    console.log(`[DEBUG] Знайдено ${tasks.length} заявок для запланованого доходу`);
    
    // Розраховуємо запланований дохід по місяцях
    const plannedRevenueByMonth = {};
    const plannedMaterialsRevenueByMonth = {};
    
    tasks.forEach(task => {
      // Перевіряємо чи заявка НЕ підтверджена всіма (це запланований дохід)
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;
      
      // Якщо хоча б один не підтвердив - це запланований дохід
      if (task.workPrice && (!isWarehouseApproved || !isAccountantApproved || !isRegionalManagerApproved)) {
        let taskYear, taskMonth;
        
        // Парсимо дату заявки
        if (task.date && task.date.includes('-')) {
          const parts = task.date.split('-');
          if (parts.length === 3) {
            // Формат "2025-07-04"
            taskYear = parseInt(parts[0]);
            taskMonth = parseInt(parts[1]);
          }
        }
        
        if (taskYear && taskMonth) {
          const key = `${taskYear}-${taskMonth}`;
          
          if (!plannedRevenueByMonth[key]) {
            plannedRevenueByMonth[key] = 0;
            plannedMaterialsRevenueByMonth[key] = 0;
          }
          
          // Додаємо заплановану премію за виконання сервісних робіт: (workPrice / 4) * 3
          const workPrice = parseFloat(task.workPrice) || 0;
          const plannedBonusAmount = (workPrice / 4) * 3;
          plannedRevenueByMonth[key] += plannedBonusAmount;
          
          // Додаємо запланований дохід по матеріалам: сума всіх матеріальних витрат / 4
          const oilTotal = parseFloat(task.oilTotal) || 0;
          const filterSum = parseFloat(task.filterSum) || 0;
          const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
          const airFilterSum = parseFloat(task.airFilterSum) || 0;
          const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
          const otherSum = parseFloat(task.otherSum) || 0;
          
          const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
          const plannedMaterialsRevenue = totalMaterials / 4;
          plannedMaterialsRevenueByMonth[key] += plannedMaterialsRevenue;
          
          console.log(`[DEBUG] Додано запланований дохід для ${key}: workPrice=${workPrice}, plannedBonusAmount=${plannedBonusAmount} грн, plannedMaterialsRevenue=${plannedMaterialsRevenue} грн`);
        }
      }
    });
    
    console.log(`[DEBUG] Підсумковий запланований дохід по роботах:`, plannedRevenueByMonth);
    console.log(`[DEBUG] Підсумковий запланований дохід по матеріалам:`, plannedMaterialsRevenueByMonth);
    
    res.json({ plannedRevenueByMonth, plannedMaterialsRevenueByMonth });
  } catch (error) {
    console.error('Помилка розрахунку запланованого доходу:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання унікальних типів обладнання
app.get('/api/equipment-types', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/equipment-types - запит отримано');
    
    const equipmentTypes = await Task.distinct('equipment');
    const filteredTypes = equipmentTypes
      .filter(type => type && type.trim() !== '')
      .sort();
    
    console.log('[DEBUG] GET /api/equipment-types - знайдено типів обладнання:', filteredTypes.length);
    res.json(filteredTypes);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment-types - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання матеріалів по типу обладнання
app.get('/api/equipment-materials/:equipmentType', async (req, res) => {
  try {
    const { equipmentType } = req.params;
    console.log('[DEBUG] GET /api/equipment-materials/:equipmentType - запит для обладнання:', equipmentType);
    
    // Знаходимо всі завдання з цим типом обладнання
    const tasks = await Task.find({ 
      equipment: { $regex: new RegExp(equipmentType, 'i') } 
    });
    
    // Збираємо унікальні матеріали
    const materials = {
      oil: {
        types: [...new Set(tasks.map(t => t.oilType).filter(t => t && t.trim()))],
        quantities: [...new Set(tasks.map(t => t.oilUsed).filter(q => q && q.trim()))]
      },
      oilFilter: {
        names: [...new Set(tasks.map(t => t.filterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.filterCount).filter(q => q && q.trim()))]
      },
      fuelFilter: {
        names: [...new Set(tasks.map(t => t.fuelFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.fuelFilterCount).filter(q => q && q.trim()))]
      },
      airFilter: {
        names: [...new Set(tasks.map(t => t.airFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.airFilterCount).filter(q => q && q.trim()))]
      },
      antifreeze: {
        types: [...new Set(tasks.map(t => t.antifreezeType).filter(t => t && t.trim()))],
        quantities: [...new Set(tasks.map(t => t.antifreezeL).filter(q => q && q.trim()))]
      },
      otherMaterials: [...new Set(tasks.map(t => t.otherMaterials).filter(m => m && m.trim()))]
    };
    
    console.log('[DEBUG] GET /api/equipment-materials/:equipmentType - знайдено матеріалів:', {
      oil: materials.oil.types.length,
      oilFilter: materials.oilFilter.names.length,
      fuelFilter: materials.fuelFilter.names.length,
      airFilter: materials.airFilter.names.length,
      antifreeze: materials.antifreeze.types.length,
      otherMaterials: materials.otherMaterials.length
    });
    
    res.json(materials);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment-materials/:equipmentType - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для управління категоріями витрат
app.get('/api/expense-categories', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/expense-categories - запит отримано');
    
    // Знаходимо останні налаштування категорій
    let categoriesDoc = await ExpenseCategories.findOne().sort({ updatedAt: -1 });
    
    if (!categoriesDoc) {
      // Якщо немає збережених категорій, повертаємо стандартні
      const defaultCategories = {
        salary: { label: 'Зарплата', color: '#FF6384' },
        fuel: { label: 'Паливо', color: '#36A2EB' },
        transport: { label: 'Транспорт', color: '#FFCE56' },
        materials: { label: 'Матеріали', color: '#4BC0C0' },
        equipment: { label: 'Обладнання', color: '#9966FF' },
        office: { label: 'Офісні витрати', color: '#FF9F40' },
        marketing: { label: 'Маркетинг', color: '#FF6384' },
        other: { label: 'Інші витрати', color: '#C9CBCF' }
      };
      
      res.json(defaultCategories);
    } else {
      // Конвертуємо Map в об'єкт
      const categories = {};
      categoriesDoc.categories.forEach((value, key) => {
        categories[key] = value;
      });
      
      res.json(categories);
    }
  } catch (error) {
    console.error('[ERROR] GET /api/expense-categories - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expense-categories', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/expense-categories - запит отримано');
    const { categories, createdBy } = req.body;
    
    if (!categories || typeof categories !== 'object') {
      return res.status(400).json({ error: 'Неправильний формат категорій' });
    }
    
    // Створюємо новий документ з категоріями
    const categoriesDoc = new ExpenseCategories({
      categories: new Map(Object.entries(categories)),
      createdBy: createdBy || 'system',
      updatedAt: new Date()
    });
    
    await categoriesDoc.save();
    
    console.log('[DEBUG] POST /api/expense-categories - категорії збережено');
    res.json({ success: true, message: 'Категорії збережено' });
  } catch (error) {
    console.error('[ERROR] POST /api/expense-categories - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Очистити старі категорії витрат
app.post('/api/expense-categories/cleanup', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/expense-categories/cleanup - запит отримано');
    const { categories, createdBy } = req.body;
    
    if (!categories || typeof categories !== 'object') {
      return res.status(400).json({ error: 'Неправильний формат категорій' });
    }
    
    // Отримуємо всі записи аналітики
    const analyticsRecords = await Analytics.find({});
    const validCategoryKeys = Object.keys(categories);
    
    let updatedCount = 0;
    
    // Проходимо по всіх записах та очищаємо старі категорії
    for (const record of analyticsRecords) {
      if (record.expenses && typeof record.expenses === 'object') {
        const originalExpenses = { ...record.expenses };
        let hasChanges = false;
        
        // Видаляємо категорії, яких немає в поточних налаштуваннях
        Object.keys(record.expenses).forEach(categoryKey => {
          if (!validCategoryKeys.includes(categoryKey)) {
            delete record.expenses[categoryKey];
            hasChanges = true;
            console.log(`[DEBUG] Видалено стару категорію: ${categoryKey} з запису ${record._id}`);
          }
        });
        
        // Зберігаємо зміни
        if (hasChanges) {
          await record.save();
          updatedCount++;
        }
      }
    }
    
    console.log(`[DEBUG] POST /api/expense-categories/cleanup - очищено ${updatedCount} записів`);
    res.json({ 
      success: true, 
      message: `Очищено ${updatedCount} записів від старих категорій`,
      updatedCount 
    });
  } catch (error) {
    console.error('[ERROR] POST /api/expense-categories/cleanup - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Тестовий endpoint для перевірки
app.get('/api/test-active', (req, res) => {
  console.log('[DEBUG] GET /api/test-active - test endpoint called');
  res.json({ message: 'Test endpoint works', timestamp: new Date().toISOString() });
});

// Альтернативний endpoint для активних користувачів
app.get('/api/active-users', async (req, res) => {
  console.log('[DEBUG] GET /api/active-users - alternative endpoint called');
  console.log('[DEBUG] GET /api/active-users - MongoDB readyState:', mongoose.connection.readyState);
  
  try {
    // Перевіряємо підключення до MongoDB
    if (mongoose.connection.readyState !== 1) {
      console.log('[DEBUG] GET /api/active-users - MongoDB not connected, readyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    
    console.log('[DEBUG] GET /api/active-users - searching for active users since:', thirtySecondsAgo);
    
    const activeUsers = await User.find(
      { lastActivity: { $gte: thirtySecondsAgo } },
      'login name'
    );
    
    console.log('[DEBUG] GET /api/active-users - found active users:', activeUsers.length);
    
    res.json(activeUsers.map(user => user.login));
  } catch (error) {
    console.error('[ERROR] GET /api/active-users - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання активних користувачів
app.get('/api/users/active', async (req, res) => {
  console.log('[DEBUG] GET /api/users/active - endpoint called');
  console.log('[DEBUG] GET /api/users/active - MongoDB readyState:', mongoose.connection.readyState);
  
  try {
    // Перевіряємо підключення до MongoDB
    if (mongoose.connection.readyState !== 1) {
      console.log('[DEBUG] GET /api/users/active - MongoDB not connected, readyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    
    console.log('[DEBUG] GET /api/users/active - searching for active users since:', thirtySecondsAgo);
    
    const activeUsers = await User.find(
      { lastActivity: { $gte: thirtySecondsAgo } },
      'login name'
    );
    
    console.log('[DEBUG] GET /api/users/active - found active users:', activeUsers.length);
    
    res.json(activeUsers.map(user => user.login));
  } catch (error) {
    console.error('[ERROR] GET /api/users/active - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint для відправки системних повідомлень
app.post('/api/notifications/send-system-message', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/notifications/send-system-message - отримано запит');
    console.log('[DEBUG] POST /api/notifications/send-system-message - body:', req.body);
    
    const { message, notificationType } = req.body;
    
    if (!message || !notificationType) {
      return res.status(400).json({ error: 'message and notificationType are required' });
    }
    
    // Перевіряємо налаштування
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ 
        error: 'Telegram bot token не налаштований. Додайте TELEGRAM_BOT_TOKEN в змінні середовища.' 
      });
    }
    
    // Отримуємо користувачів, які підписані на системні сповіщення
    const globalSettings = await GlobalNotificationSettings.findOne();
    let chatIds = [];
    
    if (globalSettings?.settings?.[notificationType]) {
      const userIds = globalSettings.settings[notificationType];
      if (userIds && userIds.length > 0) {
        const users = await User.find({ login: { $in: userIds } });
        const userChatIds = users
          .filter(user => user.telegramChatId && user.telegramChatId.trim())
          .map(user => user.telegramChatId);
        chatIds.push(...userChatIds);
      }
    }
    
    if (chatIds.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Не знайдено користувачів з увімкненими системними сповіщеннями',
        chatIds: []
      });
    }
    
    // Формуємо повідомлення
    const systemMessage = `🔔 <b>Системне повідомлення</b>

📝 <b>Повідомлення від адміністратора:</b>
${message}

📅 <b>Час відправки:</b> ${new Date().toLocaleString('uk-UA')}`;
    
    // Відправляємо повідомлення всім підписаним користувачам
    const results = [];
    for (const chatId of chatIds) {
      const success = await telegramService.sendMessage(chatId, systemMessage);
      results.push({ chatId, success });
    }
    
    const successCount = results.filter(r => r.success).length;
    
    console.log(`[DEBUG] POST /api/notifications/send-system-message - відправлено ${successCount}/${chatIds.length} повідомлень`);
    
    res.json({ 
      success: true, 
      message: `Системне повідомлення відправлено ${successCount} з ${chatIds.length} користувачів`,
      results,
      chatIds,
      successCount,
      totalCount: chatIds.length
    });
    
  } catch (error) {
    console.error('[ERROR] POST /api/notifications/send-system-message - помилка:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка при відправці системного повідомлення',
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`[STARTUP] Сервер запущено на порту ${PORT}`);
  console.log(`[STARTUP] MongoDB readyState: ${mongoose.connection.readyState}`);
  console.log(`[STARTUP] Server is ready to accept requests`);
}); 

// Telegram Notification Service
class TelegramNotificationService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
  }

  async sendMessage(chatId, message, parseMode = 'HTML') {
    if (!this.botToken) {
      return false;
    }
    
    if (!this.baseUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: parseMode
        })
      });
      
      const result = await response.json();
      
      if (result.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }



  async sendTaskNotification(type, task, user) {
    const message = this.formatTaskMessage(type, task, user);
    const chatIds = await this.getChatIdsForNotification(type, user.role, task);
    
    for (const chatId of chatIds) {
      const success = await this.sendMessage(chatId, message);
      
      // Логуємо сповіщення
      await NotificationLog.create({
        type,
        taskId: task._id || task.id,
        userId: user.login || user.id,
        message,
        telegramChatId: chatId,
        status: success ? 'sent' : 'failed'
      });
    }
  }

  formatTaskMessage(type, task, user) {
    // Визначаємо правильний статус для відображення
    let displayStatus = task.status || 'Н/Д';
    
    // Якщо це сповіщення про виконану заявку, показуємо "Виконано"
    if (type === 'task_completed') {
      displayStatus = 'Виконано';
    }
    
    // Формуємо додаткову інформацію про коментарі
    let commentsInfo = '';
    if (task.comments && task.comments.trim()) {
      commentsInfo = `\n💬 <b>Коментарі:</b> ${task.comments}`;
    }
    if (task.warehouseComment && task.warehouseComment.trim()) {
      commentsInfo += `\n📦 <b>Коментар складу:</b> ${task.warehouseComment}`;
    }
    if (task.accountantComment && task.accountantComment.trim()) {
      commentsInfo += `\n💰 <b>Коментар бухгалтера:</b> ${task.accountantComment}`;
    }
    if (task.regionalManagerComment && task.regionalManagerComment.trim()) {
      commentsInfo += `\n👨‍💼 <b>Коментар керівника:</b> ${task.regionalManagerComment}`;
    }

    const baseMessage = `
<b>🔔 Сповіщення про заявку</b>

📋 <b>Номер заявки:</b> ${task.requestNumber || 'Н/Д'}
👤 <b>Хто створив:</b> ${user.name || user.login || 'Н/Д'}
📊 <b>Статус заявки:</b> ${displayStatus}
📅 <b>Дата заявки:</b> ${task.requestDate || task.date || 'Н/Д'}
🏢 <b>Компанія виконавець:</b> ${task.company || 'Н/Д'}
📍 <b>Регіон сервісного відділу:</b> ${task.serviceRegion || 'Н/Д'}
📝 <b>Опис заявки:</b> ${task.requestDesc || 'Н/Д'}
🏛️ <b>ЄДРПОУ:</b> ${task.edrpou || 'Н/Д'}
👥 <b>Замовник:</b> ${task.client || 'Н/Д'}
🧾 <b>Номер рахунку:</b> ${task.invoice || 'Н/Д'}
🏠 <b>Адреса:</b> ${task.address || 'Н/Д'}
⚙️ <b>Тип обладнання:</b> ${task.equipment || 'Н/Д'}${commentsInfo}
    `;

    switch (type) {
      case 'task_created':
        return baseMessage + '\n✅ <b>🆕 НОВА ЗАЯВКА СТВОРЕНА</b>\n\n💡 <b>Дія:</b> Необхідно розглянути та призначити виконавця';
      case 'task_completed':
        return baseMessage + '\n✅ <b>🏁 ЗАЯВКА ВИКОНАНА</b>\n⏳ <b>Очікує підтвердження від:</b>\n• Зав. склад\n• Бухгалтер\n• Регіональний керівник';
      case 'task_approval':
        return baseMessage + '\n🔔 <b>⚠️ ПОТРЕБУЄ ПІДТВЕРДЖЕННЯ</b>\n\n📋 <b>Необхідно перевірити:</b>\n• Правильність виконаних робіт\n• Використані матеріали\n• Вартість послуг';
      case 'task_approved':
        return baseMessage + '\n✅ <b>✅ ПІДТВЕРДЖЕНО</b>\n\n🎉 <b>Заявка готова до оплати</b>';
      case 'task_rejected':
        return baseMessage + '\n❌ <b>❌ ВІДХИЛЕНО</b>\n\n⚠️ <b>Необхідно виправити зауваження</b>';
      default:
        return baseMessage + '\n📢 <b>📝 ОНОВЛЕННЯ СТАТУСУ</b>';
    }
  }

  async getChatIdsForNotification(type, userRole, task) {
    try {
      const chatIds = [];
      
      // Отримуємо глобальні налаштування сповіщень
      const globalSettings = await GlobalNotificationSettings.findOne();
      
      if (globalSettings?.settings?.[type]) {
        // Отримуємо користувачів, які підписані на цей тип сповіщень
        const userIds = globalSettings.settings[type];
        
        if (userIds && userIds.length > 0) {
          const users = await User.find({ login: { $in: userIds } });
          
          // Фільтруємо користувачів по регіону заявки
          const filteredUsers = users.filter(user => {
            // Якщо користувач має регіон "Україна", показуємо всі заявки
            if (user.region === 'Україна') return true;
            
            // Інакше показуємо тільки заявки свого регіону
            return task.serviceRegion === user.region;
          });
          
          console.log(`[DEBUG] Telegram notification filtering - Task region: ${task.serviceRegion}, Users before filter: ${users.length}, After filter: ${filteredUsers.length}`);
          
          const userChatIds = filteredUsers
            .filter(user => user.telegramChatId && user.telegramChatId.trim())
            .map(user => user.telegramChatId);
          chatIds.push(...userChatIds);
        }
      }
      
      // Додаємо загальні канали залежно від ролі (для зворотної сумісності)
      if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_ADMIN_CHAT_ID);
      }
      
      if (userRole === 'warehouse' && process.env.TELEGRAM_WAREHOUSE_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_WAREHOUSE_CHAT_ID);
      }
      
      if (userRole === 'service' && process.env.TELEGRAM_SERVICE_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_SERVICE_CHAT_ID);
      }

      const uniqueChatIds = [...new Set(chatIds)]; // Видаляємо дублікати
      return uniqueChatIds;
    } catch (error) {
      return [];
    }
  }
}

// Створюємо екземпляр сервісу
const telegramService = new TelegramNotificationService();

// API для налаштувань Telegram сповіщень
app.get('/api/notification-settings', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const settings = await NotificationSettings.findOne({ userId });
    res.json(settings || { userId, enabledNotifications: [] });
  } catch (error) {
    console.error('[ERROR] GET /api/notification-settings - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notification-settings', async (req, res) => {
  try {
    const { userId, role, telegramChatId, enabledNotifications } = req.body;
    
    if (!userId || !telegramChatId) {
      return res.status(400).json({ error: 'userId and telegramChatId are required' });
    }
    
    const settings = await NotificationSettings.findOneAndUpdate(
      { userId },
      {
        userId,
        role,
        telegramChatId,
        enabledNotifications: enabledNotifications || [],
        isActive: true,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json(settings);
  } catch (error) {
    console.error('[ERROR] POST /api/notification-settings - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notification-logs', async (req, res) => {
  try {
    const { userId, type, limit = 50 } = req.query;
    
    const filter = {};
    if (userId) filter.userId = userId;
    if (type) filter.type = type;
    
    const logs = await NotificationLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit));
    
    res.json(logs);
  } catch (error) {
    console.error('[ERROR] GET /api/notification-logs - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для глобальних налаштувань сповіщень
app.get('/api/notification-settings/global', async (req, res) => {
  try {
    // Завантажуємо глобальні налаштування з бази даних
    const globalSettings = await GlobalNotificationSettings.findOne();
    res.json(globalSettings?.settings || {});
  } catch (error) {
    console.error('[ERROR] GET /api/notification-settings/global - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notification-settings/global', async (req, res) => {
  try {
    const settings = req.body;
    
    // Зберігаємо глобальні налаштування
    await GlobalNotificationSettings.findOneAndUpdate(
      {},
      { settings, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, message: 'Глобальні налаштування сповіщень збережено' });
  } catch (error) {
    console.error('[ERROR] POST /api/notification-settings/global - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання списку користувачів
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'login name role region telegramChatId');
    res.json(users);
  } catch (error) {
    console.error('[ERROR] GET /api/users - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для оновлення активності користувача
app.post('/api/users/activity', async (req, res) => {
  try {
    const { login } = req.body;
    if (!login) {
      return res.status(400).json({ error: 'Login is required' });
    }

    // Оновлюємо час останньої активності в базі даних
    await User.updateOne(
      { login: login },
      { lastActivity: new Date() }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] POST /api/users/activity - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/telegram/status', async (req, res) => {
  try {
    const status = {
      botTokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
      adminChatIdConfigured: !!process.env.TELEGRAM_ADMIN_CHAT_ID,
      serviceChatIdConfigured: !!process.env.TELEGRAM_SERVICE_CHAT_ID,
      warehouseChatIdConfigured: !!process.env.TELEGRAM_WAREHOUSE_CHAT_ID
    };
    
    res.json(status);
  } catch (error) {
    console.error('[ERROR] GET /api/telegram/status - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/telegram/test', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/telegram/test - отримано запит');
    console.log('[DEBUG] POST /api/telegram/test - body:', req.body);
    
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      console.log('[DEBUG] POST /api/telegram/test - відсутні обов\'язкові поля');
      return res.status(400).json({ error: 'chatId and message are required' });
    }
    
    // Перевіряємо налаштування
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.log('[DEBUG] POST /api/telegram/test - Bot token не налаштований');
      return res.status(400).json({ 
        error: 'Telegram bot token не налаштований. Додайте TELEGRAM_BOT_TOKEN в змінні середовища.' 
      });
    }
    
    console.log('[DEBUG] POST /api/telegram/test - відправляємо повідомлення');
    const success = await telegramService.sendMessage(chatId, message);
    
    const response = { 
      success, 
      message: success ? 'Test message sent successfully' : 'Failed to send test message' 
    };
    
    console.log('[DEBUG] POST /api/telegram/test - відповідь:', response);
    res.json(response);
  } catch (error) {
    console.error('[ERROR] POST /api/telegram/test - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint для отримання Chat ID через бота
app.post('/api/telegram/get-chat-id', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/telegram/get-chat-id - отримано запит');
    
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    // Перевіряємо налаштування
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(200).json({
        success: true,
        message: `Для отримання Chat ID:

1. Використайте бота @userinfobot:
   • Знайдіть @userinfobot в Telegram
   • Надішліть йому будь-яке повідомлення
   • Він поверне ваш Chat ID

2. Або створіть власного бота:
   • Напишіть @BotFather в Telegram
   • Створіть нового бота командою /newbot
   • Отримайте токен бота
   • Налаштуйте токен в змінних середовища сервера

3. Після налаштування бота:
   • Введіть Chat ID у поле вище
   • Виберіть типи сповіщень
   • Протестуйте відправку`,
        botConfigured: false
      });
    }
    
    // Отримуємо інформацію про бота
    const botInfoResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    const botInfo = await botInfoResponse.json();
    
    if (!botInfo.ok) {
      return res.status(400).json({ 
        error: 'Не вдалося отримати інформацію про бота. Перевірте токен.' 
      });
    }
    
    const botUsername = botInfo.result.username;
    
    res.json({
      success: true,
      message: `Для отримання Chat ID:

1. Знайдіть бота @${botUsername} в Telegram
2. Надішліть йому повідомлення: "${message}"
3. Бот поверне ваш Chat ID

Або використайте бота @userinfobot:
1. Знайдіть @userinfobot в Telegram
2. Надішліть йому будь-яке повідомлення
3. Він поверне ваш Chat ID

💡 Після отримання Chat ID:
• Введіть його у поле вище
• Виберіть типи сповіщень
• Протестуйте відправку`,
      botUsername: botUsername,
      botConfigured: true
    });
    
  } catch (error) {
    console.error('[ERROR] POST /api/telegram/get-chat-id - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint для налаштування webhook
app.post('/api/telegram/setup-webhook', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/telegram/setup-webhook - налаштування webhook');
    
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ 
        error: 'TELEGRAM_BOT_TOKEN не налаштований' 
      });
    }
    
    const webhookUrl = `https://darex-trading-solutions.onrender.com/api/telegram/webhook`;
    
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message']
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      res.json({ 
        success: true, 
        message: 'Webhook налаштовано успішно',
        webhookUrl: webhookUrl
      });
    } else {
      res.status(400).json({ 
        error: 'Помилка налаштування webhook',
        details: result
      });
    }
  } catch (error) {
    console.error('[ERROR] POST /api/telegram/setup-webhook - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint для отримання повідомлень від Telegram бота
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/telegram/webhook - отримано повідомлення від бота');
    console.log('[DEBUG] Webhook body:', JSON.stringify(req.body, null, 2));
    
    const { message } = req.body;
    
    if (!message) {
      console.log('[DEBUG] Webhook - немає повідомлення');
      return res.json({ ok: true });
    }
    
    const { chat, text, from } = message;
    
    if (!chat || !text) {
      console.log('[DEBUG] Webhook - відсутні chat або text');
      return res.json({ ok: true });
    }
    
    const chatId = chat.id;
    const chatType = chat.type; // 'private', 'group', 'supergroup', 'channel'
    const userName = from ? (from.first_name + (from.last_name ? ' ' + from.last_name : '')) : 'Невідомий';
    
    console.log(`[DEBUG] Webhook - повідомлення від ${userName} (${chatId}) в чаті ${chatType}: "${text}"`);
    
    // Якщо це команда /start або запит на Chat ID
    if (text.toLowerCase().includes('chat id') || text.toLowerCase().includes('чат id') || text === '/start') {
      const responseMessage = `🔔 <b>Darex Trading Solutions</b>

👋 Привіт, ${userName}!

📋 <b>Ваш Chat ID:</b> <code>${chatId}</code>

💡 <b>Як використовувати:</b>
1. Скопіюйте Chat ID вище
2. Вставте його в налаштування сповіщень
3. Отримуйте сповіщення про заявки

📱 <b>Типи сповіщень:</b>
• Нові заявки
• Виконані заявки  
• Потребують підтвердження
• Підтверджені заявки
• Відхилені заявки

🔧 <b>Для налаштування:</b>
Зверніться до адміністратора системи.`;
      
      await telegramService.sendMessage(chatId, responseMessage);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[ERROR] POST /api/telegram/webhook - помилка:', error);
    res.json({ ok: true }); // Завжди повертаємо ok для Telegram
  }
});



// Тестовий endpoint для перевірки Telegram бота
app.get('/api/telegram/test-send', async (req, res) => {
  try {
    const testMessage = '🧪 Тестове повідомлення від системи\n\n✅ Бот працює коректно\n📅 Час: ' + new Date().toLocaleString('uk-UA');
    
    // Отримуємо Chat ID з глобальних налаштувань
    const globalSettings = await GlobalNotificationSettings.findOne();
    let chatIds = [];
    
    if (globalSettings?.settings?.task_completed) {
      const userIds = globalSettings.settings.task_completed;
      if (userIds && userIds.length > 0) {
        const users = await User.find({ login: { $in: userIds } });
        const userChatIds = users
          .filter(user => user.telegramChatId && user.telegramChatId.trim())
          .map(user => user.telegramChatId);
        chatIds.push(...userChatIds);
      }
    }
    
    if (chatIds.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Не знайдено Chat ID для відправки',
        chatIds: [],
        globalSettings: globalSettings?.settings || {}
      });
    }
    
    const results = [];
    for (const chatId of chatIds) {
      const success = await telegramService.sendMessage(chatId, testMessage);
      results.push({ chatId, success });
    }
    
    res.json({ 
      success: true, 
      message: 'Тестове повідомлення відправлено',
      results,
      chatIds,
      globalSettings: globalSettings?.settings || {}
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Помилка при відправці тестового повідомлення',
      error: error.message 
    });
  }
});