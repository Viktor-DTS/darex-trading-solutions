// Завантаження змінних середовища
require('dotenv').config({ path: './config.env' });

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
const Task = mongoose.model('Task', taskSchema);

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Додаткові CORS заголовки для всіх запитів
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Додатковий middleware для OPTIONS запитів
app.options('*', cors());

// Логування CORS запитів
app.use((req, res, next) => {
  console.log(`[CORS] ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});
app.use(express.json());

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
  if (req.path === '/api/ping') {
    return next(); // Пропускаємо ping запити
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
    let user = await User.findOne({ login: userData.login });
    if (user) {
      Object.assign(user, userData);
      await user.save();
    } else {
      user = new User({ ...userData, id: Date.now() });
      await user.save();
    }
    res.json({ success: true, message: 'Користувача збережено' });
  } catch (error) {
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
    const regions = await Region.find();
    res.json(regions);
  } catch (error) {
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
    const tasks = await executeWithRetry(() => Task.find());
    
    console.log('[DEBUG] GET /api/tasks - знайдено завдань:', tasks.length);
    
    // Додаємо числовий id для сумісності з фронтендом
    const tasksWithId = tasks.map(task => ({
      ...task.toObject(),
      id: task._id.toString()
    }));
    
    console.log('[DEBUG] GET /api/tasks - повертаємо завдань:', tasksWithId.length);
    res.json(tasksWithId);
  } catch (error) {
    console.error('[ERROR] GET /api/tasks - помилка:', error);
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
      
      if (updateData.status === 'Виконано') {
        await telegramService.sendTaskNotification('task_completed', updatedTask, user);
      } else if (updateData.approvedByWarehouse === 'Підтверджено' || 
                 updateData.approvedByAccountant === 'Підтверджено' || 
                 updateData.approvedByRegionalManager === 'Підтверджено') {
        await telegramService.sendTaskNotification('task_approved', updatedTask, user);
      } else if (updateData.approvedByWarehouse === 'Відхилено' || 
                 updateData.approvedByAccountant === 'Відхилено' || 
                 updateData.approvedByRegionalManager === 'Відхилено') {
        await telegramService.sendTaskNotification('task_rejected', updatedTask, user);
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
  res.json({ 
    message: 'Сервер працює!',
    timestamp: new Date().toISOString(),
    mongodb: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState
    }
  });
});

app.get('/api/reports', (req, res) => {
  res.json(reports);
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
    const user = await User.findOne({ login: req.params.login });
    if (!user || !user.columnsSettings || !user.columnsSettings[req.params.area]) {
      return res.status(404).json({ error: 'Налаштування не знайдено' });
    }
    res.json(user.columnsSettings[req.params.area]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Зберегти налаштування колонок для користувача і області
app.post('/api/users/:login/columns-settings', async (req, res) => {
  try {
    const { area, visible, order } = req.body;
    let user = await User.findOne({ login: req.params.login });
    if (!user) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    if (!user.columnsSettings) user.columnsSettings = {};
    user.columnsSettings[area] = { visible, order };
    await user.save();
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
    
    const analytics = await Analytics.find(filter).sort({ year: 1, month: 1 });
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
          
          // Додаємо премію за виконання сервісних робіт: (workPrice / 4) * 3
          const workPrice = parseFloat(task.workPrice) || 0;
          const bonusAmount = (workPrice / 4) * 3; // workPrice поділено на 4 та помножено на 3
          revenueByMonth[key] += bonusAmount;
          
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
          
          console.log(`[DEBUG] Додано дохід для ${key}: workPrice=${workPrice}, bonusAmount=${bonusAmount} грн, materialsRevenue=${materialsRevenue} грн`);
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
    const { region, company, startYear, endYear, startMonth, endMonth } = req.query;
    
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
    
    tasks.forEach(task => {
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
            regionsByMonth[key] = new Set();
            companiesByMonth[key] = new Set();
          }
          
          // Додаємо премію за виконання сервісних робіт: (workPrice / 4) * 3
          const workPrice = parseFloat(task.workPrice) || 0;
          const bonusAmount = (workPrice / 4) * 3; // workPrice поділено на 4 та помножено на 3
          revenueByMonth[key] += bonusAmount;
          
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
          
          // Збираємо регіони та компанії для цього місяця
          if (task.serviceRegion) {
            regionsByMonth[key].add(task.serviceRegion);
          }
          if (task.company) {
            companiesByMonth[key].add(task.company);
          }
        }
      }
    });
    
    // Об'єднуємо дані та створюємо записи для місяців з доходами
    const fullAnalytics = [];
    
    // Додаємо існуючі записи аналітики
    analytics.forEach(item => {
      const revenueKey = `${item.year}-${item.month}`;
      const workRevenue = revenueByMonth[revenueKey] || 0;
      const materialsRevenue = materialsRevenueByMonth[revenueKey] || 0;
      const totalRevenue = workRevenue + materialsRevenue;
      const profit = totalRevenue - item.totalExpenses;
      const profitability = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      
      fullAnalytics.push({
        ...item.toObject(),
        workRevenue: Number(workRevenue.toFixed(2)),
        materialsRevenue: Number(materialsRevenue.toFixed(2)),
        revenue: Number(totalRevenue.toFixed(2)),
        profit: Number(profit.toFixed(2)),
        profitability: Number(profitability.toFixed(2))
      });
    });
    
    // Додаємо записи для місяців з доходами, але без витрат
    Object.keys(revenueByMonth).forEach(key => {
      const [year, month] = key.split('-').map(Number);
      
      // Перевіряємо, чи вже є запис для цього місяця
      const existingRecord = fullAnalytics.find(item => item.year === year && item.month === month);
      
      if (!existingRecord && revenueByMonth[key] > 0) {
        // Створюємо новий запис з витратами = 0
        const revenue = revenueByMonth[key];
        const regions = Array.from(regionsByMonth[key] || []);
        const companies = Array.from(companiesByMonth[key] || []);
        
        // Створюємо запис для кожної комбінації регіон-компанія
        if (regions.length > 0 && companies.length > 0) {
          regions.forEach(region => {
            companies.forEach(company => {
              const workRevenue = revenueByMonth[key] || 0;
              const materialsRevenue = materialsRevenueByMonth[key] || 0;
              const totalRevenue = workRevenue + materialsRevenue;
              
              fullAnalytics.push({
                _id: `auto-${key}-${region}-${company}`,
                region: region,
                company: company,
                year: year,
                month: month,
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
                totalExpenses: 0,
                workRevenue: Number(workRevenue.toFixed(2)),
                materialsRevenue: Number(materialsRevenue.toFixed(2)),
                revenue: Number(totalRevenue.toFixed(2)),
                profit: Number(totalRevenue.toFixed(2)), // profit = revenue - 0
                profitability: 100, // 100% рентабельність коли немає витрат
                createdAt: new Date(),
                updatedAt: new Date()
              });
            });
          });
        }
      }
    });
    
    // Сортуємо за роком та місяцем
    fullAnalytics.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    
    res.json(fullAnalytics);
  } catch (error) {
    console.error('Помилка отримання повної аналітики:', error);
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

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
}); 

// Telegram Notification Service
class TelegramNotificationService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
  }

  async sendMessage(chatId, message, parseMode = 'HTML') {
    if (!this.botToken) {
      console.log('[TELEGRAM] Bot token not configured, skipping message');
      return false;
    }
    
    if (!this.baseUrl) {
      console.log('[TELEGRAM] Base URL not configured, skipping message');
      return false;
    }

    try {
      console.log(`[TELEGRAM] Sending message to ${chatId}:`, message.substring(0, 100) + '...');
      
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
        console.log(`[TELEGRAM] Message sent successfully to ${chatId}`);
        return true;
      } else {
        console.error(`[TELEGRAM] Failed to send message:`, result);
        return false;
      }
    } catch (error) {
      console.error('[TELEGRAM] Send error:', error);
      return false;
    }
  }

  async sendTaskNotification(type, task, user) {
    const message = this.formatTaskMessage(type, task, user);
    const chatIds = await this.getChatIdsForNotification(type, user.role);
    
    console.log(`[TELEGRAM] Sending ${type} notification to ${chatIds.length} chats`);
    
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
    const baseMessage = `
<b>🔔 Сповіщення про заявку</b>

📋 <b>Заявка:</b> ${task.requestNumber || 'Н/Д'}
👤 <b>Користувач:</b> ${user.name || user.login || 'Н/Д'}
📍 <b>Регіон:</b> ${task.serviceRegion || 'Н/Д'}
🏢 <b>Компанія:</b> ${task.company || 'Н/Д'}
📅 <b>Дата:</b> ${task.date || 'Н/Д'}
📝 <b>Опис:</b> ${task.requestDesc || 'Н/Д'}
    `;

    switch (type) {
      case 'task_created':
        return baseMessage + '\n✅ <b>Нова заявка створена</b>';
      case 'task_completed':
        return baseMessage + '\n✅ <b>Заявка виконана</b>\n⏳ <b>Очікує підтвердження</b>';
      case 'task_approval':
        return baseMessage + '\n🔔 <b>Потребує підтвердження</b>';
      case 'task_approved':
        return baseMessage + '\n✅ <b>Підтверджено</b>';
      case 'task_rejected':
        return baseMessage + '\n❌ <b>Відхилено</b>';
      default:
        return baseMessage + '\n📢 <b>Оновлення статусу</b>';
    }
  }

  async getChatIdsForNotification(type, userRole) {
    try {
      // Отримуємо налаштування сповіщень для цього типу
      const settings = await NotificationSettings.find({
        isActive: true,
        enabledNotifications: type
      });

      const chatIds = settings.map(s => s.telegramChatId);
      
      // Додаємо загальні канали залежно від ролі
      if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_ADMIN_CHAT_ID);
      }
      
      if (userRole === 'warehouse' && process.env.TELEGRAM_WAREHOUSE_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_WAREHOUSE_CHAT_ID);
      }
      
      if (userRole === 'service' && process.env.TELEGRAM_SERVICE_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_SERVICE_CHAT_ID);
      }

      return [...new Set(chatIds)]; // Видаляємо дублікати
    } catch (error) {
      console.error('[TELEGRAM] Error getting chat IDs:', error);
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