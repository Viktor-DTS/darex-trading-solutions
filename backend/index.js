// Завантаження змінних середовища
require('dotenv').config({ path: './config.env' });

// Override MongoDB URI for production if not set in environment
console.log('[ENV DEBUG] NODE_ENV:', process.env.NODE_ENV);
console.log('[ENV DEBUG] MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('[ENV DEBUG] MONGODB_URI value:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');

// Cloudinary налаштування діагностика
console.log('[ENV DEBUG] CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET');
console.log('[ENV DEBUG] CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('[ENV DEBUG] CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');

// Force MongoDB URI for production
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  console.log('[ENV] Setting MongoDB URI for production/Render');
  process.env.MONGODB_URI = 'mongodb+srv://darexuser:viktor22@cluster0.yaec2av.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
  console.log('[ENV] MongoDB URI set successfully');
}

// Додаткова перевірка для Render
if (process.env.NODE_ENV === 'production') {
  console.log('[ENV] Production mode detected');
  console.log('[ENV] MONGODB_URI exists:', !!process.env.MONGODB_URI);
  if (process.env.MONGODB_URI) {
    const uriWithoutPassword = process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log('[ENV] MONGODB_URI (masked):', uriWithoutPassword);
  }
  console.log('[ENV] PORT:', process.env.PORT);
  console.log('[ENV] MONGODB_URI preview:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'NOT SET');
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cloudinary = require('./config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// === АВТОМАТИЧНИЙ ЛОГІНГ СИСТЕМА ===
const logs = [];
const endpointStats = {};

function addLog(message, type = 'info') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    type
  };
  logs.push(logEntry);
  
  // Зберігати тільки останні 100 логів
  if (logs.length > 100) {
    logs.shift();
  }
  
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Глобальна функція для логування з фронтенду
global.addLog = addLog;

// Middleware для відстеження endpoint'ів
function trackEndpoint(req, res, next) {
  const key = `${req.method} ${req.path}`;
  if (!endpointStats[key]) {
    endpointStats[key] = { calls: 0, errors: 0, lastCall: null };
  }
  
  endpointStats[key].calls++;
  endpointStats[key].lastCall = new Date().toISOString();
  
  next();
}

// === СИСТЕМА АВТЕНТИФІКАЦІЇ ===
const JWT_SECRET = process.env.JWT_SECRET || 'darex-trading-solutions-secret-key-change-in-production-2024';
const JWT_EXPIRES_IN = '24h';

// Middleware для перевірки JWT токена
function authenticateToken(req, res, next) {
  // Оскільки middleware застосовується до '/api', req.path не містить '/api' префікс
  // Тому перевіряємо без префіксу
  const publicPaths = [
    '/auth', 
    '/ping', 
    '/system-status'
  ];
  
  // Дозволяємо GET запити до /users/:login для перевірки користувача при вході
  const isPublicUserCheck = req.method === 'GET' && req.path.match(/^\/users\/[^\/]+$/);
  
  // Перевіряємо чи це публічний шлях
  const isPublicPath = publicPaths.some(path => {
    return req.path === path || req.path.startsWith(path + '/') || req.path.startsWith(path + '?');
  });
  
  if (isPublicPath || isPublicUserCheck) {
    console.log(`[AUTH] Публічний endpoint, пропускаємо автентифікацію: ${req.method} ${req.originalUrl || req.path}`);
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.log(`[AUTH] Запит без токена: ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Токен доступу відсутній. Потрібна авторизація.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log(`[AUTH] Помилка верифікації токена для ${req.method} ${req.path}:`, err.message);
      return res.status(403).json({ error: 'Невірний або прострочений токен доступу.' });
    }
    req.user = user;
    next();
  });
}

// Middleware для перевірки ролі користувача
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Користувач не авторизований' });
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole) && userRole !== 'admin') {
      console.log(`[AUTH] Доступ заборонено. Роль користувача: ${userRole}, потрібні ролі: ${allowedRoles.join(', ')}`);
      return res.status(403).json({ error: 'Недостатньо прав доступу' });
    }

    next();
  };
}

// Middleware для перевірки адмін прав
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Користувач не авторизований' });
  }

  const adminRoles = ['admin', 'Адміністратор', 'administrator'];
  if (!adminRoles.includes(req.user.role)) {
    console.log(`[AUTH] Адмін доступ заборонено. Роль користувача: ${req.user.role}`);
    return res.status(403).json({ error: 'Потрібні права адміністратора' });
  }

  next();
}


const app = express();

// Налаштування multer для Cloudinary
console.log('[CLOUDINARY DEBUG] Ініціалізація Cloudinary...');
console.log('[CLOUDINARY DEBUG] cloudinary object:', !!cloudinary);
console.log('[CLOUDINARY DEBUG] CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('[CLOUDINARY DEBUG] CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('[CLOUDINARY DEBUG] CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'darex-trading-solutions/invoices',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

console.log('[CLOUDINARY DEBUG] CloudinaryStorage створено:', !!storage);

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB ліміт
  },
  fileFilter: (req, file, cb) => {
    // Дозволяємо тільки PDF та зображення для рахунків
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/jpg',
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволені тільки PDF, JPEG, PNG'), false);
    }
  }
});

// Додаємо імпорт роуту файлів
const filesRouter = require('./routes/files')(upload);

// Підключаємо роут файлів
app.use('/api/files', filesRouter);
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
  groupBy: { type: [String], default: [] }, // Масив полів для групування
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
  company: { type: String, default: '' }, // Компанія (не обов'язкове)
  year: { type: Number, required: true }, // Рік
  month: { type: Number, required: true }, // Місяць (1-12)
  
  // Статті витрат (використовуємо Mixed для підтримки динамічних категорій)
  expenses: {
    type: Map,
    of: Number,
    default: {}
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

// Модель для запитів на рахунки
const invoiceRequestSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
  requestNumber: { type: String, required: true },
  requesterId: { type: String, required: true },
  requesterName: { type: String, required: true },
  companyDetails: {
    companyName: { type: String, required: true },
    edrpou: { type: String, required: true },
    address: { type: String, required: false },
    bankDetails: { type: String, required: true },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    comments: { type: String, default: '' }
  },
  invoiceRecipientDetails: { type: String, default: '' },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'rejected'], 
    default: 'pending' 
  },
  needInvoice: { type: Boolean, default: false },
  needAct: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  completedAt: { type: Date },
  invoiceFile: { type: String, default: '' },
  invoiceFileName: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  actFile: { type: String, default: '' },
  actFileName: { type: String, default: '' },
  comments: { type: String, default: '' },
  rejectionReason: { type: String, default: '' }
});

const InvoiceRequest = mongoose.model('InvoiceRequest', invoiceRequestSchema);

// Модель для timesheet даних (табель часу)
const timesheetSchema = new mongoose.Schema({
  region: { type: String, required: true }, // Регіон для якого зберігаються дані
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  type: { type: String, enum: ['regular', 'service'], default: 'regular' },
  data: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }, // Дані по користувачам: { userId: { 1: 8, 2: 8, ..., total: 176 } }
  payData: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }, // Дані про зарплату: { userId: { salary: 25000, bonus: 0 } }
  summary: { type: mongoose.Schema.Types.Mixed, default: {} }, // Підсумкові дані: { workDays: 22, workHours: 176 }
  createdBy: { type: String }, // Хто створив/оновив (для логування)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Індекс для швидкого пошуку - тепер по регіону, а не по userId
timesheetSchema.index({ region: 1, year: 1, month: 1, type: 1 }, { unique: true });

const Timesheet = mongoose.model('Timesheet', timesheetSchema);

// Видаляємо старий індекс userId після підключення до бази
mongoose.connection.once('open', async () => {
  try {
    // Видаляємо старий індекс userId_1_year_1_month_1_type_1 якщо він існує
    const indexes = await Timesheet.collection.getIndexes();
    if (indexes['userId_1_year_1_month_1_type_1']) {
      console.log('[TIMESHEET] Видаляємо старий індекс userId_1_year_1_month_1_type_1');
      await Timesheet.collection.dropIndex('userId_1_year_1_month_1_type_1');
      console.log('[TIMESHEET] Старий індекс видалено');
    }
    
    // Видаляємо старі записи без region (якщо такі є)
    const deletedOld = await Timesheet.deleteMany({ region: { $exists: false } });
    if (deletedOld.deletedCount > 0) {
      console.log(`[TIMESHEET] Видалено ${deletedOld.deletedCount} старих записів без region`);
    }
  } catch (error) {
    // Ігноруємо помилку, якщо індекс не існує
    if (error.code !== 27 && error.code !== 85) { // 27 = IndexNotFound, 85 = IndexOptionsConflict
      console.error('[TIMESHEET] Помилка при міграції індексів:', error.message);
    }
  }
});

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
    console.log('MongoDB підключена успішно');
    FALLBACK_MODE = false;
    
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
  } else {
    console.error('MongoDB не підключена, активуємо FALLBACK_MODE');
    FALLBACK_MODE = true;
  }
}).catch(err => {
  console.error('MongoDB connection error:', err);
  FALLBACK_MODE = true;
});

// Обробники подій для моніторингу з'єднання MongoDB
mongoose.connection.on('connected', () => {
  console.log('MongoDB підключено');
  FALLBACK_MODE = false;
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB помилка з\'єднання:', err);
  FALLBACK_MODE = true;
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB відключено');
  FALLBACK_MODE = true;
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB перепідключено');
  FALLBACK_MODE = false;
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
  lastActivity: { type: Date, default: Date.now },
  notificationSettings: {
    newRequests: { type: Boolean, default: false },
    pendingApproval: { type: Boolean, default: false },
    accountantApproval: { type: Boolean, default: false },
    approvedRequests: { type: Boolean, default: false },
    rejectedRequests: { type: Boolean, default: false },
    invoiceRequests: { type: Boolean, default: false },
    completedInvoices: { type: Boolean, default: false },
    systemNotifications: { type: Boolean, default: false }
  }
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
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'null', // Дозволяємо локальні файли
    'file://' // Дозволяємо file:// протокол
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

// API endpoint для виправлення bonusApprovalDate
app.post('/api/fix-bonus-approval-dates', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/fix-bonus-approval-dates - отримано запит');

    if (FALLBACK_MODE) {
      console.log('[DEBUG] POST /api/fix-bonus-approval-dates - FALLBACK_MODE активний');
      return res.status(503).json({ error: 'Сервер в режимі fallback, операція недоступна' });
    }

    // Знаходимо всі заявки без bonusApprovalDate
    const tasksWithoutBonusDate = await executeWithRetry(() =>
      Task.find({
        $or: [
          { bonusApprovalDate: { $exists: false } },
          { bonusApprovalDate: null },
          { bonusApprovalDate: '' }
        ]
      })
    );

    console.log(`[DEBUG] Знайдено ${tasksWithoutBonusDate.length} заявок без bonusApprovalDate`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const task of tasksWithoutBonusDate) {
      // Перевіряємо чи заявка підтверджена всіма ролями
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;

      // Якщо заявка підтверджена всіма ролями, встановлюємо bonusApprovalDate
      if (isWarehouseApproved && isAccountantApproved && isRegionalManagerApproved && task.workPrice) {
        // Встановлюємо bonusApprovalDate на поточний місяць
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();
        const bonusApprovalDate = `${currentMonth}-${currentYear}`;

        await executeWithRetry(() =>
          Task.updateOne(
            { _id: task._id },
            { $set: { bonusApprovalDate: bonusApprovalDate } }
          )
        );

        console.log(`[DEBUG] Оновлено заявку ${task._id}: bonusApprovalDate = ${bonusApprovalDate}`);
        updatedCount++;
      } else {
        console.log(`[DEBUG] Пропущено заявку ${task._id}: не підтверджена всіма ролями або немає workPrice`);
        skippedCount++;
      }
    }

    console.log(`[DEBUG] Результати: оновлено ${updatedCount}, пропущено ${skippedCount}`);

    res.json({
      message: 'Виправлення bonusApprovalDate завершено',
      totalFound: tasksWithoutBonusDate.length,
      updated: updatedCount,
      skipped: skippedCount
    });

  } catch (error) {
    console.error('[ERROR] POST /api/fix-bonus-approval-dates - помилка:', error);
    res.status(500).json({ error: 'Помилка виправлення bonusApprovalDate' });
  }
});

// API endpoint для синхронізації bonusApprovalDate у всіх заявках
app.post('/api/sync-bonus-approval-dates', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/sync-bonus-approval-dates - отримано запит');

    if (FALLBACK_MODE) {
      console.log('[DEBUG] POST /api/sync-bonus-approval-dates - FALLBACK_MODE активний');
      return res.status(503).json({ error: 'Сервер в режимі fallback, операція недоступна' });
    }

    // Знаходимо всі заявки, які підтверджені всіма ролями, але не мають bonusApprovalDate
    const tasksToSync = await executeWithRetry(() =>
      Task.find({
        approvedByWarehouse: 'Підтверджено',
        approvedByAccountant: 'Підтверджено', 
        approvedByRegionalManager: 'Підтверджено',
        workPrice: { $exists: true, $ne: null, $ne: '' },
        $or: [
          { bonusApprovalDate: { $exists: false } },
          { bonusApprovalDate: null },
          { bonusApprovalDate: '' }
        ]
      })
    );

    console.log(`[DEBUG] Знайдено ${tasksToSync.length} заявок для синхронізації bonusApprovalDate`);

    let updatedCount = 0;

    for (const task of tasksToSync) {
      // Встановлюємо bonusApprovalDate на поточний місяць
      const now = new Date();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentYear = now.getFullYear();
      const bonusApprovalDate = `${currentMonth}-${currentYear}`;

      await executeWithRetry(() =>
        Task.updateOne(
          { _id: task._id },
          { $set: { bonusApprovalDate: bonusApprovalDate } }
        )
      );

      console.log(`[DEBUG] Синхронізовано заявку ${task._id}: bonusApprovalDate = ${bonusApprovalDate}`);
      updatedCount++;
    }

    console.log(`[DEBUG] Синхронізація завершена: оновлено ${updatedCount} заявок`);

    res.json({
      message: 'Синхронізація bonusApprovalDate завершена',
      totalFound: tasksToSync.length,
      updated: updatedCount
    });

  } catch (error) {
    console.error('[ERROR] POST /api/sync-bonus-approval-dates - помилка:', error);
    res.status(500).json({ error: 'Помилка синхронізації bonusApprovalDate' });
  }
});

// API endpoint для виправлення неправильного формату bonusApprovalDate
app.post('/api/fix-bonus-date-format', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/fix-bonus-date-format - отримано запит');

    if (FALLBACK_MODE) {
      console.log('[DEBUG] POST /api/fix-bonus-date-format - FALLBACK_MODE активний');
      return res.status(503).json({ error: 'Сервер в режимі fallback, операція недоступна' });
    }

    // Знаходимо всі заявки з неправильним форматом дати (YYYY-MM-DD)
    const tasksWithInvalidFormat = await executeWithRetry(() =>
      Task.find({
        bonusApprovalDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ }
      })
    );

    console.log(`[DEBUG] Знайдено ${tasksWithInvalidFormat.length} заявок з неправильним форматом bonusApprovalDate`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const task of tasksWithInvalidFormat) {
      try {
        // Конвертуємо з YYYY-MM-DD в MM-YYYY
        const [year, month] = task.bonusApprovalDate.split('-');
        const correctFormat = `${month}-${year}`;

        await executeWithRetry(() =>
          Task.updateOne(
            { _id: task._id },
            { $set: { bonusApprovalDate: correctFormat } }
          )
        );

        console.log(`[DEBUG] Виправлено формат заявки ${task._id}: ${task.bonusApprovalDate} -> ${correctFormat}`);
        updatedCount++;
      } catch (error) {
        console.error(`[ERROR] Помилка виправлення формату заявки ${task._id}:`, error);
        skippedCount++;
      }
    }

    console.log(`[DEBUG] Виправлення формату завершено: оновлено ${updatedCount}, пропущено ${skippedCount}`);

    res.json({
      message: 'Виправлення формату bonusApprovalDate завершено',
      totalFound: tasksWithInvalidFormat.length,
      updated: updatedCount,
      skipped: skippedCount
    });

  } catch (error) {
    console.error('[ERROR] POST /api/fix-bonus-date-format - помилка:', error);
    res.status(500).json({ error: 'Помилка виправлення формату bonusApprovalDate' });
  }
});

// Глобальна обробка помилок
app.use((err, req, res, next) => {
  console.error('[ERROR] Global error handler:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Автоматичне відстеження всіх endpoint'ів
app.use(trackEndpoint);

// Застосовуємо автентифікацію до всіх API endpoints (крім публічних)
app.use('/api', authenticateToken);

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

// --- SYSTEM STATUS ---
app.get('/api/system-status', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState;
    const isConnected = mongoStatus === 1;
    
    res.json({
      mongoStatus,
      isConnected,
      fallbackMode: FALLBACK_MODE,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      mongoStatus: mongoose.connection.readyState,
      fallbackMode: FALLBACK_MODE
    });
  }
});

// --- USERS через MongoDB ---
// Цей endpoint видалено, використовується endpoint нижче

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

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const userData = req.body;
    addLog(`📝 Updating user: ${userData.login}`, 'info');
    console.log('[DEBUG] POST /api/users - отримано дані:', JSON.stringify(userData, null, 2));
    
    let user = await User.findOne({ login: userData.login });
    if (user) {
      console.log('[DEBUG] Оновлюємо існуючого користувача:', userData.login);
      Object.assign(user, userData);
      await user.save();
      addLog(`✅ User updated: ${userData.login}`, 'success');
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

app.delete('/api/users/:login', requireAdmin, async (req, res) => {
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
app.post('/api/roles', requireAdmin, async (req, res) => {
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
// API endpoints для імпортованих заявок (мають бути перед /api/tasks)
app.get('/api/tasks/imported', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/tasks/imported - отримано запит');
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] GET /api/tasks/imported - FALLBACK_MODE активний, повертаємо порожній масив');
      return res.json([]);
    }
    
    console.log(`[DEBUG] GET /api/tasks/imported - шукаємо заявки з isImported: true`);
    
    const importedTasks = await executeWithRetry(() => 
      Task.find({ isImported: true }).sort({ requestDate: -1 })
    );
    
    console.log(`[DEBUG] GET /api/tasks/imported - знайдено ${importedTasks.length} імпортованих заявок`);
    console.log(`[DEBUG] GET /api/tasks/imported - приклад заявки:`, importedTasks[0]);
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
      console.log('[DEBUG] POST /api/tasks/imported - FALLBACK_MODE активний, повертаємо порожній масив');
      return res.json([]);
    }
    
    const { tasks } = req.body;
    
    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Необхідно передати масив завдань' });
    }
    
    console.log(`[DEBUG] POST /api/tasks/imported - отримано ${tasks.length} завдань для імпорту`);
    
    // Додаємо поле isImported: true до кожної заявки та видаляємо поле id
    const importedTasks = tasks.map(task => {
      const { id, ...taskWithoutId } = task; // Remove 'id' field
      return {
        ...taskWithoutId,
        isImported: true,
        status: 'Імпортовано' // Спеціальний статус для імпортованих заявок
      };
    });
    
    console.log(`[DEBUG] POST /api/tasks/imported - приклад заявки перед збереженням:`, importedTasks[0]);
    
    const savedTasks = await executeWithRetry(() => 
      Task.insertMany(importedTasks)
    );
    
    console.log(`[DEBUG] POST /api/tasks/imported - збережено ${savedTasks.length} імпортованих заявок`);
    console.log(`[DEBUG] POST /api/tasks/imported - приклад збереженої заявки:`, savedTasks[0]);
    
    res.json(savedTasks);
  } catch (error) {
    console.error('[ERROR] POST /api/tasks/imported - помилка:', error);
    res.status(500).json({ error: 'Помилка збереження імпортованих заявок' });
  }
});

app.get('/api/tasks', async (req, res) => {
  const startTime = Date.now();
  try {
    addLog('📋 Loading tasks', 'info');
    
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
    
    // ОПТИМІЗАЦІЯ: Отримуємо всі InvoiceRequest за один запит
    const taskIds = tasks.map(task => task._id.toString());
    const invoiceRequestIds = tasks
      .map(task => task.invoiceRequestId)
      .filter(id => id); // Фільтруємо тільки існуючі ID
    
    console.log(`[OPTIMIZATION] Fetching InvoiceRequest data for ${taskIds.length} tasks and ${invoiceRequestIds.length} invoiceRequestIds`);
    
    // Один запит для отримання всіх InvoiceRequest
    const invoiceDbStart = Date.now();
    const invoiceRequests = await InvoiceRequest.find({
      $or: [
        { taskId: { $in: taskIds } },
        { _id: { $in: invoiceRequestIds } }
      ]
    });
    const invoiceDbTime = Date.now() - invoiceDbStart;
    console.log(`[DB] InvoiceRequest.find() (OPTIMIZED) - takes ${invoiceDbTime}ms (${invoiceRequests.length} results)`);
    
    // Створюємо мапи для швидкого пошуку
    const invoiceRequestByTaskId = new Map();
    const invoiceRequestById = new Map();
    
    invoiceRequests.forEach(invoice => {
      // Мапа по taskId
      if (invoice.taskId) {
        invoiceRequestByTaskId.set(invoice.taskId, invoice);
      }
      // Мапа по _id
      invoiceRequestById.set(invoice._id.toString(), invoice);
    });
    
    // Додаємо інформацію про файл рахунку для заявок (оптимізовано)
    const tasksWithInvoiceInfo = tasks.map(task => {
      let invoiceRequest = null;
      
      // Спочатку шукаємо по invoiceRequestId (для старих заявок)
      if (task.invoiceRequestId) {
        invoiceRequest = invoiceRequestById.get(task.invoiceRequestId);
      }
      
      // Якщо не знайшли по invoiceRequestId, шукаємо по taskId (для нових заявок)
      if (!invoiceRequest) {
        invoiceRequest = invoiceRequestByTaskId.get(task._id.toString());
      }
      
      // Оновлюємо дані заявки якщо знайшли InvoiceRequest з файлами
      if (invoiceRequest) {
        // Оновлюємо дані про файл рахунку
        if (invoiceRequest.invoiceFile) {
          task.invoiceFile = invoiceRequest.invoiceFile;
          task.invoiceFileName = invoiceRequest.invoiceFileName;
          task.invoice = invoiceRequest.invoiceNumber;
        }
        
        // Оновлюємо дані про файл акту
        if (invoiceRequest.actFile) {
          task.actFile = invoiceRequest.actFile;
          task.actFileName = invoiceRequest.actFileName;
        }
        
        task.invoiceRequestId = invoiceRequest._id.toString();
        
        // Додаємо поля needInvoice та needAct з InvoiceRequest
        task.needInvoice = invoiceRequest.needInvoice;
        task.needAct = invoiceRequest.needAct;
        
        // Додаємо статус заявки на рахунок (потрібно для фільтрації в панелі)
        task.invoiceStatus = invoiceRequest.status;
      }
      
      return task;
    });
    
    // Додаємо числовий id для сумісності з фронтендом
    const tasksWithId = tasksWithInvoiceInfo.map(task => ({
      ...task,
      id: task._id.toString()
    }));
    
    // Логуємо загальну продуктивність
    const totalTime = Date.now() - startTime;
    console.log(`[PERFORMANCE] GET /api/tasks (OPTIMIZED) - takes ${totalTime}ms (${tasksWithId.length} results)`);
    
    console.log('[DEBUG] GET /api/tasks - повертаємо завдань:', tasksWithId.length);
    res.json(tasksWithId);
  } catch (error) {
    console.error('[ERROR] GET /api/tasks - помилка:', error);
    
    // Логуємо час виконання навіть при помилці
    const totalTime = Date.now() - startTime;
    console.log(`[PERFORMANCE] GET /api/tasks (OPTIMIZED) - takes ${totalTime}ms (ERROR)`);
    
    res.status(500).json({ error: error.message });
  }
});

// НОВИЙ ENDPOINT ДЛЯ ОПТИМІЗАЦІЇ - фільтрація заявок по статусу
app.get('/api/tasks/filter', async (req, res) => {
  const startTime = Date.now();
  try {
    addLog('📋 Loading filtered tasks', 'info');
    
    // Отримуємо параметри фільтрації
    const { status, region, limit = 1000, skip = 0, sort = '-requestDate' } = req.query;
    
    console.log('[DEBUG] GET /api/tasks/filter - параметри:', { status, region, limit, skip, sort });
    
    // Будуємо запит для фільтрації
    let query = {};
    
    // Фільтрація по статусу
    if (status) {
      switch (status) {
        case 'notDone':
          query.status = { $in: ['Заявка', 'В роботі'] };
          break;
        case 'pending':
          query.status = 'Виконано';
          query.$or = [
            { approvedByWarehouse: { $ne: 'Підтверджено' } },
            { approvedByAccountant: { $ne: 'Підтверджено' } },
            { approvedByRegionalManager: { $ne: 'Підтверджено' } }
          ];
          break;
        case 'done':
          query.status = 'Виконано';
          query.approvedByWarehouse = 'Підтверджено';
          query.approvedByAccountant = 'Підтверджено';
          query.approvedByRegionalManager = 'Підтверджено';
          break;
        case 'blocked':
          query.status = 'Заблоковано';
          break;
        case 'inProgress':
          query.status = { $in: ['Заявка', 'В роботі'] };
          break;
        case 'archive':
          query.status = { $nin: ['Заявка', 'В роботі'] };
          break;
        case 'debt':
          // Заборгованість по документам - заявки з неповними документами
          query.status = 'Виконано';
          query.$or = [
            { invoice: { $in: [null, '', undefined] } },
            { paymentDate: { $in: [null, '', undefined] } }
          ];
          break;
        case 'invoices':
          // Запити на рахунки - заявки з запитами на рахунки
          query.invoiceRequestId = { $exists: true, $ne: null };
          break;
        default:
          query.status = status;
      }
    }
    
    // Фільтрація по регіону
    if (region && region !== 'Україна') {
      // Якщо регіон містить кому (мультирегіональний користувач)
      if (region.includes(',')) {
        const regions = region.split(',').map(r => r.trim());
        query.serviceRegion = { $in: regions };
        console.log('[DEBUG] GET /api/tasks/filter - мультирегіональний користувач, регіони:', regions);
      } else if (region === 'Загальний') {
        // Для "Загальний" регіону не додаємо фільтр - показуємо всі заявки
        console.log('[DEBUG] GET /api/tasks/filter - регіон "Загальний", не фільтруємо по регіону');
      } else {
        query.serviceRegion = region;
        console.log('[DEBUG] GET /api/tasks/filter - одинарний регіон:', region);
      }
    }
    
    console.log('[DEBUG] GET /api/tasks/filter - запит:', JSON.stringify(query, null, 2));
    
    // Виконуємо запит
    const tasks = await executeWithRetry(() => 
      Task.find(query)
        .sort(sort)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean()
    );
    
    console.log('[DEBUG] GET /api/tasks/filter - знайдено завдань:', tasks.length);
    
    // ОПТИМІЗАЦІЯ: Отримуємо всі InvoiceRequest за один запит
    const taskIds = tasks.map(task => task._id.toString());
    const invoiceRequestIds = tasks
      .map(task => task.invoiceRequestId)
      .filter(id => id); // Фільтруємо тільки існуючі ID
    
    console.log(`[OPTIMIZATION] Fetching InvoiceRequest data for ${taskIds.length} tasks and ${invoiceRequestIds.length} invoiceRequestIds`);
    
    // Один запит для отримання всіх InvoiceRequest
    const invoiceDbStart = Date.now();
    const invoiceRequests = await InvoiceRequest.find({
      $or: [
        { taskId: { $in: taskIds } },
        { _id: { $in: invoiceRequestIds } }
      ]
    });
    const invoiceDbTime = Date.now() - invoiceDbStart;
    console.log(`[DB] InvoiceRequest.find() (OPTIMIZED) - takes ${invoiceDbTime}ms (${invoiceRequests.length} results)`);
    
    // Створюємо мапи для швидкого пошуку
    const invoiceRequestByTaskId = new Map();
    const invoiceRequestById = new Map();
    
    invoiceRequests.forEach(invoice => {
      // Мапа по taskId
      if (invoice.taskId) {
        invoiceRequestByTaskId.set(invoice.taskId, invoice);
      }
      // Мапа по _id
      invoiceRequestById.set(invoice._id.toString(), invoice);
    });
    
    // Додаємо інформацію про файл рахунку для заявок (оптимізовано)
    const tasksWithInvoiceInfo = tasks.map(task => {
      let invoiceRequest = null;
      
      // Спочатку шукаємо по invoiceRequestId (для старих заявок)
      if (task.invoiceRequestId) {
        invoiceRequest = invoiceRequestById.get(task.invoiceRequestId);
      }
      
      // Якщо не знайшли по invoiceRequestId, шукаємо по taskId (для нових заявок)
      if (!invoiceRequest) {
        invoiceRequest = invoiceRequestByTaskId.get(task._id.toString());
      }
      
      // Оновлюємо дані заявки якщо знайшли InvoiceRequest з файлами
      if (invoiceRequest) {
        // Оновлюємо дані про файл рахунку
        if (invoiceRequest.invoiceFile) {
          task.invoiceFile = invoiceRequest.invoiceFile;
          task.invoiceFileName = invoiceRequest.invoiceFileName;
          task.invoice = invoiceRequest.invoiceNumber;
        }
        
        // Оновлюємо дані про файл акту
        if (invoiceRequest.actFile) {
          task.actFile = invoiceRequest.actFile;
          task.actFileName = invoiceRequest.actFileName;
        }
        
        task.invoiceRequestId = invoiceRequest._id.toString();
        
        // Додаємо поля needInvoice та needAct з InvoiceRequest
        task.needInvoice = invoiceRequest.needInvoice;
        task.needAct = invoiceRequest.needAct;
        
        // Додаємо статус заявки на рахунок (потрібно для фільтрації в панелі)
        task.invoiceStatus = invoiceRequest.status;
      }
      
      return task;
    });
    
    // Додаємо числовий id для сумісності з фронтендом
    const tasksWithId = tasksWithInvoiceInfo.map(task => ({
      ...task,
      id: task._id.toString()
    }));
    
    // Логуємо загальну продуктивність
    const totalTime = Date.now() - startTime;
    console.log(`[PERFORMANCE] GET /api/tasks/filter (OPTIMIZED) - takes ${totalTime}ms (${tasksWithId.length} results)`);
    
    res.json(tasksWithId);
  } catch (error) {
    console.error('[ERROR] GET /api/tasks/filter - помилка:', error);
    
    // Логуємо час виконання навіть при помилці
    const totalTime = Date.now() - startTime;
    console.log(`[PERFORMANCE] GET /api/tasks/filter (OPTIMIZED) - takes ${totalTime}ms (ERROR)`);
    
    res.status(500).json({ error: error.message });
  }
});

// === ОПТИМІЗОВАНИЙ ENDPOINT ДЛЯ ПАНЕЛІ БУХГАЛТЕРА ===
// Завантажує всі необхідні дані одним запитом для оптимізації продуктивності
app.post('/api/accountant/data', async (req, res) => {
  const startTime = Date.now();
  console.log('[PERFORMANCE] POST /api/accountant/data - початок оптимізованого завантаження...');
  
  try {
    const { userLogin, region } = req.body;
    
    if (!userLogin) {
      return res.status(400).json({ error: 'userLogin обов\'язковий параметр' });
    }

    console.log(`[PERFORMANCE] POST /api/accountant/data - завантаження для користувача: ${userLogin}, регіон: ${region}`);

    // Паралельно завантажуємо всі необхідні дані
    const [
      notDoneTasks,
      pendingTasks, 
      doneTasks,
      blockedTasks,
      user,
      columnSettings,
      invoiceColumnSettings,
      accessRules,
      roles
    ] = await Promise.all([
      // Завантажуємо завдання для всіх вкладок (використовуємо правильні статуси)
      Task.find({ 
        status: { $in: ['Заявка', 'В роботі'] },
        ...(region && region !== 'Україна' ? { region } : {})
      }).lean(),
      Task.find({ 
        status: 'Виконано',
        $or: [
          { approvedByWarehouse: { $ne: 'Підтверджено' } },
          { approvedByAccountant: { $ne: 'Підтверджено' } },
          { approvedByRegionalManager: { $ne: 'Підтверджено' } }
        ],
        ...(region && region !== 'Україна' ? { region } : {})
      }).lean(),
      Task.find({ 
        status: 'Виконано',
        approvedByWarehouse: 'Підтверджено',
        approvedByAccountant: 'Підтверджено',
        approvedByRegionalManager: 'Підтверджено',
        ...(region && region !== 'Україна' ? { region } : {})
      }).lean(),
      Task.find({ 
        status: 'Заблоковано',
        ...(region && region !== 'Україна' ? { region } : {})
      }).lean(),
      
      // Завантажуємо дані користувача
      User.findOne({ login: userLogin }).lean(),
      
      // Завантажуємо налаштування колонок
      User.findOne({ login: userLogin }).select('columnsSettings.accountant').lean(),
      User.findOne({ login: userLogin }).select('columnsSettings.accountant-invoice').lean(),
      
      // Завантажуємо правила доступу та ролі
      AccessRules.findOne().lean(),
      Role.find().lean()
    ]);

    // Обробляємо завдання (додаємо ID якщо потрібно)
    const processTasks = (tasks) => {
      return tasks.map(task => ({
        ...task,
        id: task._id ? task._id.toString() : task.id
      }));
    };

    // Обробляємо налаштування колонок
    const processedColumnSettings = columnSettings?.columnsSettings?.accountant || { visible: [], order: [], widths: {} };
    const processedInvoiceColumnSettings = invoiceColumnSettings?.columnsSettings?.['accountant-invoice'] || { visible: [], order: [], widths: {} };

    // Обробляємо правила доступу та ролі
    const processedAccessRules = accessRules?.rules || {};
    const processedRoles = roles || [];

    const result = {
      tasks: {
        notDone: processTasks(notDoneTasks),
        pending: processTasks(pendingTasks),
        done: processTasks(doneTasks),
        blocked: processTasks(blockedTasks)
      },
      columnSettings: processedColumnSettings,
      invoiceColumnSettings: processedInvoiceColumnSettings,
      accessRules: processedAccessRules,
      roles: processedRoles,
      user: user ? {
        ...user,
        password: undefined // Видаляємо пароль з відповіді
      } : null
    };

    const totalTime = Date.now() - startTime;
    const totalTasks = Object.values(result.tasks).reduce((sum, tasks) => sum + tasks.length, 0);
    
    console.log(`[PERFORMANCE] POST /api/accountant/data - завершено за ${totalTime}ms`);
    console.log(`[PERFORMANCE] POST /api/accountant/data - завантажено: ${totalTasks} завдань, налаштування колонок, правила доступу, ${processedRoles.length} ролей`);
    console.log(`[PERFORMANCE] POST /api/accountant/data - деталі: notDone: ${result.tasks.notDone.length}, pending: ${result.tasks.pending.length}, done: ${result.tasks.done.length}, blocked: ${result.tasks.blocked.length}`);

    res.json(result);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[ERROR] POST /api/accountant/data - помилка за ${totalTime}ms:`, error);
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
    console.log('[DEBUG] POST /api/tasks - contractFile:', taskData.contractFile);
    
    // Автоматично встановлюємо дату створення заявки
    if (!taskData.autoCreatedAt) {
      taskData.autoCreatedAt = new Date();
      console.log('[DEBUG] POST /api/tasks - автоматично встановлено autoCreatedAt:', taskData.autoCreatedAt);
    }
    
    // Зберігаємо інформацію про автора заявки
    const user = req.user || { login: 'system', name: 'Система', role: 'system' };
    if (!taskData.createdBy && user.name) {
      taskData.createdBy = user.name;
    }
    if (!taskData.authorName && user.name) {
      taskData.authorName = user.name;
    }
    if (!taskData.authorLogin && user.login) {
      taskData.authorLogin = user.login;
    }
    
    const newTask = new Task(taskData);
    console.log('[DEBUG] POST /api/tasks - створено новий Task об\'єкт');
    
    const savedTask = await executeWithRetry(() => newTask.save());
    console.log('[DEBUG] POST /api/tasks - заявка збережена успішно, _id:', savedTask._id);
    
    // Відправляємо Telegram сповіщення про нову заявку
    try {
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
    
    // Автоматично встановлюємо дату створення заявки, якщо її ще немає
    if (!updateData.autoCreatedAt && !task.autoCreatedAt) {
      updateData.autoCreatedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoCreatedAt:', updateData.autoCreatedAt);
    }
    
    // Автоматично встановлюємо дату виконання, якщо статус змінився на "Виконано"
    const isCompleted = (updateData.status === 'Виконано' || updateData.status === '????????') && 
                        task.status !== 'Виконано' && task.status !== '????????';
    if (isCompleted && !updateData.autoCompletedAt && !task.autoCompletedAt) {
      updateData.autoCompletedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoCompletedAt:', updateData.autoCompletedAt);
    }
    
    // Автоматично встановлюємо дату затвердження завскладом
    const isWarehouseApproved = updateData.approvedByWarehouse === 'Підтверджено' && 
                                 task.approvedByWarehouse !== 'Підтверджено';
    if (isWarehouseApproved && !updateData.autoWarehouseApprovedAt && !task.autoWarehouseApprovedAt) {
      updateData.autoWarehouseApprovedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoWarehouseApprovedAt:', updateData.autoWarehouseApprovedAt);
    }
    
    // Автоматично встановлюємо дату затвердження бухгалтером
    const isAccountantApproved = updateData.approvedByAccountant === 'Підтверджено' && 
                                  task.approvedByAccountant !== 'Підтверджено';
    if (isAccountantApproved && !updateData.autoAccountantApprovedAt && !task.autoAccountantApprovedAt) {
      updateData.autoAccountantApprovedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoAccountantApprovedAt:', updateData.autoAccountantApprovedAt);
    }
    
    // Автоматично встановлюємо bonusApprovalDate, якщо заявка підтверджена всіма ролями
    const isWarehouseApprovedFinal = updateData.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === 'Підтверджено';
    const isAccountantApprovedFinal = updateData.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === 'Підтверджено';
    const isRegionalManagerApproved = updateData.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === 'Підтверджено';
    
    if (isWarehouseApprovedFinal && isAccountantApprovedFinal && isRegionalManagerApproved && (updateData.workPrice || task.workPrice)) {
      // Встановлюємо bonusApprovalDate на поточний місяць, якщо його ще немає
      if (!updateData.bonusApprovalDate && !task.bonusApprovalDate) {
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();
        updateData.bonusApprovalDate = `${currentMonth}-${currentYear}`;
        console.log(`[DEBUG] PUT /api/tasks/:id - автоматично встановлено bonusApprovalDate: ${updateData.bonusApprovalDate}`);
      }
    }
    
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
app.post('/api/accessRules', requireAdmin, async (req, res) => {
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

// === АВТОМАТИЧНИЙ DASHBOARD ===
app.get('/api/dashboard', (req, res) => {
  res.json({
    system: {
      status: 'online',
      timestamp: new Date().toISOString(),
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      uptime: process.uptime()
    },
    recentLogs: logs.slice(-20),
    endpointStats,
    health: {
      totalLogs: logs.length,
      errorCount: logs.filter(log => log.type === 'error').length,
      lastError: logs.filter(log => log.type === 'error').slice(-1)[0] || null
    }
  });
});

app.get('/api/recent-logs', (req, res) => {
  res.json({ logs: logs.slice(-50) });
});

app.get('/api/endpoint-stats', (req, res) => {
  res.json(endpointStats);
});

// Endpoint для логування з фронтенду
app.post('/api/log', (req, res) => {
  try {
    const { message, type = 'info' } = req.body;
    addLog(`[FRONTEND] ${message}`, type);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Screenshot endpoint для візуального моніторингу
app.get('/api/screenshot', async (req, res) => {
  try {
    addLog('📸 Taking screenshot', 'info');
    
    // Простий HTML для тестування
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>DTS System Status</title>
      <style>
        body { font-family: Arial; margin: 20px; background: #f5f5f5; }
        .status { background: white; padding: 20px; border-radius: 8px; margin: 10px 0; }
        .success { border-left: 4px solid #28a745; }
        .error { border-left: 4px solid #dc3545; }
        .warning { border-left: 4px solid #ffc107; }
        .timestamp { color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>🚀 DTS System Dashboard</h1>
      <div class="status success">
        <h3>✅ System Online</h3>
        <p>MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}</p>
        <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
        <p class="timestamp">${new Date().toISOString()}</p>
      </div>
      <div class="status ${logs.filter(log => log.type === 'error').length > 0 ? 'error' : 'success'}">
        <h3>📊 Recent Activity</h3>
        <p>Total Logs: ${logs.length}</p>
        <p>Errors: ${logs.filter(log => log.type === 'error').length}</p>
        <p>Last Error: ${logs.filter(log => log.type === 'error').slice(-1)[0]?.message || 'None'}</p>
      </div>
      <div class="status warning">
        <h3>🔧 Endpoint Stats</h3>
        <p>Total Endpoints: ${Object.keys(endpointStats).length}</p>
        <p>Most Used: ${Object.entries(endpointStats).sort((a,b) => b[1].calls - a[1].calls)[0]?.[0] || 'None'}</p>
      </div>
    </body>
    </html>
    `;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error) {
    addLog(`❌ Screenshot failed: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
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
app.post('/api/backups', requireAdmin, async (req, res) => {
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
app.delete('/api/backups/:id', requireAdmin, async (req, res) => {
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
      
      // Генеруємо JWT токен
      const token = jwt.sign(
        { 
          id: user._id || user.id,
          login: user.login,
          role: user.role,
          name: user.name
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      console.log(`[AUTH] Успішна авторизація: ${user.login}, роль: ${user.role}`);
      
      // Оновлюємо активність користувача при вході
      try {
        const now = new Date();
        await User.updateOne(
          { login: user.login },
          { lastActivity: now }
        );
        console.log(`[AUTH] Активність користувача ${user.login} оновлено при вході:`, now);
      } catch (activityError) {
        console.error(`[AUTH] Помилка оновлення активності для ${user.login}:`, activityError);
      }
      
      res.json({ 
        success: true, 
        user: userWithoutPassword,
        token: token
      });
    } else {
      console.log(`[AUTH] Невдала спроба входу: ${login}`);
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
      // Повертаємо 200 з порожніми налаштуваннями замість 404 (це нормальна ситуація)
      return res.json({ visible: [], order: [], widths: {} });
    }
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
    
    // Перетворюємо groupBy в масив, якщо він рядок (для сумісності зі старими звітами)
    const groupByArray = Array.isArray(groupBy) ? groupBy : (groupBy ? [groupBy] : []);
    
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
      groupBy: groupByArray
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
    console.log('[DEBUG] GET /api/event-log - отримано запит');
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] GET /api/event-log - FALLBACK_MODE активний, повертаємо порожній масив');
      return res.json({
        events: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0
        }
      });
    }
    
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
    
    console.log('[DEBUG] GET /api/event-log - параметри:', { page, limit, userId, action, entityType, startDate, endDate, search });
    
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
    
    console.log('[DEBUG] GET /api/event-log - фільтр:', filter);
    
    const events = await executeWithRetry(() => 
      EventLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
    );
    
    const total = await executeWithRetry(() => 
      EventLog.countDocuments(filter)
    );
    
    console.log(`[DEBUG] GET /api/event-log - знайдено ${events.length} подій з ${total} загальних`);
    
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
    console.error('[ERROR] GET /api/event-log - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Очистити старий журнал подій (старше 30 днів)
app.delete('/api/event-log/cleanup', async (req, res) => {
  try {
    console.log('[DEBUG] DELETE /api/event-log/cleanup - отримано запит');
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] DELETE /api/event-log/cleanup - FALLBACK_MODE активний, повертаємо помилку');
      return res.status(503).json({ 
        success: false, 
        message: 'База даних недоступна',
        deletedCount: 0
      });
    }
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await executeWithRetry(() => 
      EventLog.deleteMany({
        timestamp: { $lt: thirtyDaysAgo }
      })
    );
    
    console.log(`[DEBUG] DELETE /api/event-log/cleanup - видалено ${result.deletedCount} старих записів`);
    
    res.json({ 
      success: true, 
      message: `Видалено ${result.deletedCount} старих записів`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[ERROR] DELETE /api/event-log/cleanup - помилка:', error);
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
    
    // Конвертуємо Map expenses в об'єкт для кожного запису
    const analyticsWithObjectExpenses = analytics.map(item => {
      if (item.expenses && item.expenses instanceof Map) {
        const expensesObj = {};
        item.expenses.forEach((value, key) => {
          expensesObj[key] = value;
        });
        item.expenses = expensesObj;
      } else if (item.expenses && typeof item.expenses === 'object' && !Array.isArray(item.expenses)) {
        // Якщо expenses вже об'єкт (з aggregate), залишаємо як є
        // Але перевіряємо, чи це не Map
        if (item.expenses.constructor && item.expenses.constructor.name === 'Map') {
          const expensesObj = {};
          item.expenses.forEach((value, key) => {
            expensesObj[key] = value;
          });
          item.expenses = expensesObj;
        }
      }
      return item;
    });
    
    res.json(analyticsWithObjectExpenses);
  } catch (error) {
    console.error('Помилка отримання аналітики:', error);
    res.status(500).json({ error: error.message });
  }
});

// Зберегти аналітику
app.post('/api/analytics', requireAdmin, async (req, res) => {
  try {
    const { region, company, year, month, expenses, createdBy } = req.body;
    
    // Валідація обов'язкових полів (company більше не обов'язкове)
    if (!region || !year || !month) {
      return res.status(400).json({ 
        error: 'Відсутні обов\'язкові поля: region, year, month',
        received: { region, year, month }
      });
    }
    
    // Встановлюємо company в порожній рядок, якщо не передано
    const companyValue = company || '';
    
    if (!expenses || typeof expenses !== 'object') {
      return res.status(400).json({ 
        error: 'Відсутні або неправильні дані витрат',
        received: { expenses }
      });
    }
    
    console.log('Збереження аналітики:', { region, company: companyValue, year, month, expenses, createdBy });
    
    // Перевіряємо чи існує запис для цього періоду (без урахування company)
    let analytics = await Analytics.findOne({ region, company: companyValue, year: parseInt(year), month: parseInt(month) });
    
    // Конвертуємо expenses об'єкт в Map для збереження
    const expensesMap = new Map();
    Object.keys(expenses).forEach(key => {
      expensesMap.set(key, parseFloat(expenses[key]) || 0);
    });
    
    if (analytics) {
      // Оновлюємо існуючий запис
      analytics.expenses = expensesMap;
      analytics.updatedAt = new Date();
      analytics.updatedBy = createdBy;
    } else {
      // Створюємо новий запис
      analytics = new Analytics({
        region,
        company: companyValue,
        year: parseInt(year),
        month: parseInt(month),
        expenses: expensesMap,
        createdBy,
        updatedBy: createdBy
      });
    }
    
    // Розраховуємо загальні витрати
    analytics.totalExpenses = Array.from(expensesMap.values()).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
    
    await analytics.save();
    
    // Конвертуємо Map expenses в об'єкт для повернення
    const expensesObj = {};
    analytics.expenses.forEach((value, key) => {
      expensesObj[key] = value;
    });
    const analyticsResponse = analytics.toObject();
    analyticsResponse.expenses = expensesObj;
    
    res.json({ success: true, analytics: analyticsResponse });
  } catch (error) {
    console.error('Помилка збереження аналітики:', error);
    res.status(500).json({ error: error.message });
  }
});

// Видалити аналітику
app.delete('/api/analytics', requireAdmin, async (req, res) => {
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
    
    // НЕ фільтруємо tasks по даті виконання, оскільки використовуємо creditMonth логіку
    // Фільтр по періоду буде застосований після розрахунку creditMonth
    
    // Отримуємо виконані заявки (архів виконаних заявок)
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
      // Перевіряємо чи заявка підтверджена (без перевірки RegionalManager, як у детальній звітності)
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      
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
      
      // Дохід по роботах - використовуємо логіку creditMonth (як у детальній звітності)
        if (task.workPrice && isWarehouseApproved && isAccountantApproved) {
          let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
          let approvalDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
            const [y, m] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
            const [m, y] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else {
            approvalDate = new Date(approvalDateStr);
          }
        if (!isNaN(approvalDate.getTime())) {
          // Логіка: премію за місяць X затверджують у місяці X+1
          // creditMonth = попередній місяць від затвердження
          let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
          let creditYear = approvalDate.getFullYear();
          let creditMonth;
          if (approvalMonth === 0) {
            creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
            creditYear -= 1;
          } else {
            creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
          }
          // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
          if (creditMonth !== 12) creditMonth += 1;
          
          // Фільтр по періоду
          if (startYear && creditYear < parseInt(startYear)) return;
          if (endYear && creditYear > parseInt(endYear)) return;
          if (startYear && creditYear === parseInt(startYear) && startMonth && creditMonth < parseInt(startMonth)) return;
          if (endYear && creditYear === parseInt(endYear) && endMonth && creditMonth > parseInt(endMonth)) return;
          
          const key = `${creditYear}-${String(creditMonth).padStart(2, '0')}`;
          
          if (!revenueByMonth[key]) {
            revenueByMonth[key] = 0;
            materialsRevenueByMonth[key] = 0;
            regionsByMonth[key] = new Set();
            companiesByMonth[key] = new Set();
          }
          
          // Додаємо дохід по виконаним роботам
          revenueByMonth[key] += workRevenue;
          
          // Збираємо регіони та компанії для цього місяця
          if (task.serviceRegion) {
            regionsByMonth[key].add(task.serviceRegion);
          }
          if (task.company) {
            companiesByMonth[key].add(task.company);
          }
        }
      }
      
      // Дохід по матеріалам - використовуємо логіку creditMonth (як у детальній звітності)
        if (isWarehouseApproved && isAccountantApproved) {
          let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
          let approvalDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
            const [y, m] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
            const [m, y] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else {
            approvalDate = new Date(approvalDateStr);
          }
        if (!isNaN(approvalDate.getTime())) {
          // Логіка: премію за місяць X затверджують у місяці X+1
          // creditMonth = попередній місяць від затвердження
          let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
          let creditYear = approvalDate.getFullYear();
          let creditMonth;
          if (approvalMonth === 0) {
            creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
            creditYear -= 1;
          } else {
            creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
          }
          // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
          if (creditMonth !== 12) creditMonth += 1;
          
          // Фільтр по періоду
          if (startYear && creditYear < parseInt(startYear)) return;
          if (endYear && creditYear > parseInt(endYear)) return;
          if (startYear && creditYear === parseInt(startYear) && startMonth && creditMonth < parseInt(startMonth)) return;
          if (endYear && creditYear === parseInt(endYear) && endMonth && creditMonth > parseInt(endMonth)) return;
          
          const key = `${creditYear}-${String(creditMonth).padStart(2, '0')}`;
          
          if (!revenueByMonth[key]) {
            revenueByMonth[key] = 0;
            materialsRevenueByMonth[key] = 0;
            regionsByMonth[key] = new Set();
            companiesByMonth[key] = new Set();
          }
          
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
          const key = `${taskYear}-${String(taskMonth).padStart(2, '0')}`;
          
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
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      
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
      
      // Обробляємо expenses (може бути Map або об'єкт)
      let expensesObj = {};
      if (item.expenses instanceof Map) {
        item.expenses.forEach((value, key) => {
          expensesObj[key] = value;
        });
      } else if (item.expenses && typeof item.expenses === 'object') {
        expensesObj = item.expenses;
      }
      
      Object.keys(expensesObj).forEach(category => {
        monthlyData[key].expenses[category] = (monthlyData[key].expenses[category] || 0) + (expensesObj[category] || 0);
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
        _id: `monthly-${data.year}-${String(data.month).padStart(2, '0')}`,
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

      // Обробляємо заявки для доходу по роботах та матеріалам - використовуємо логіку creditMonth (як у /api/analytics/full)
      tasks.forEach(task => {
        const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
        const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;

        // Дохід по роботах - використовуємо логіку creditMonth
        if (task.workPrice && isWarehouseApproved && isAccountantApproved) {
          let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
          let approvalDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
            const [y, m] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
            const [m, y] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else {
            approvalDate = new Date(approvalDateStr);
          }
          if (!isNaN(approvalDate.getTime())) {
            // Логіка: премію за місяць X затверджують у місяці X+1
            // creditMonth = попередній місяць від затвердження
            let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
            let creditYear = approvalDate.getFullYear();
            let creditMonth;
            if (approvalMonth === 0) {
              creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
              creditYear -= 1;
            } else {
              creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
            }
            // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
            if (creditMonth !== 12) creditMonth += 1;

            // Перевіряємо чи це потрібний місяць
            if (creditMonth === parseInt(month) && creditYear === parseInt(year)) {
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
                approvalDate: task.bonusApprovalDate || task.approvedByAccountantDate || task.date,
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
        }

        // Дохід по матеріалам - використовуємо логіку creditMonth
        if (isWarehouseApproved && isAccountantApproved) {
          let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
          let approvalDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
            const [y, m] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
            const [m, y] = approvalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else {
            approvalDate = new Date(approvalDateStr);
          }
          if (!isNaN(approvalDate.getTime())) {
            // Логіка: премію за місяць X затверджують у місяці X+1
            // creditMonth = попередній місяць від затвердження
            let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
            let creditYear = approvalDate.getFullYear();
            let creditMonth;
            if (approvalMonth === 0) {
              creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
              creditYear -= 1;
            } else {
              creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
            }
            // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
            if (creditMonth !== 12) creditMonth += 1;

            // Перевіряємо чи це потрібний місяць
            if (creditMonth === parseInt(month) && creditYear === parseInt(year)) {
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

    // Обробляємо заявки для доходу по роботах та матеріалам - використовуємо логіку creditMonth (як у /api/analytics/full)
    tasks.forEach(task => {
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;

      // Дохід по роботах - використовуємо логіку creditMonth
      if (task.workPrice && isWarehouseApproved && isAccountantApproved) {
        let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
        let approvalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
          const [y, m] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
          const [m, y] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else {
          approvalDate = new Date(approvalDateStr);
        }
        if (!isNaN(approvalDate.getTime())) {
        // Логіка: премію за місяць X затверджують у місяці X+1
        // creditMonth = попередній місяць від затвердження
        let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
        let creditYear = approvalDate.getFullYear();
        let creditMonth;
        if (approvalMonth === 0) {
          creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
          creditYear -= 1;
        } else {
          creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
        }
          // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
        if (creditMonth !== 12) creditMonth += 1;

          // Перевіряємо чи це потрібний місяць
        if (creditMonth === parseInt(month) && creditYear === parseInt(year)) {
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
              approvalDate: task.bonusApprovalDate || task.approvedByAccountantDate || task.date,
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
      }

      // Дохід по матеріалам - використовуємо логіку creditMonth
      if (isWarehouseApproved && isAccountantApproved) {
        let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
        let approvalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
          const [y, m] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
          const [m, y] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else {
          approvalDate = new Date(approvalDateStr);
        }
        if (!isNaN(approvalDate.getTime())) {
        // Логіка: премію за місяць X затверджують у місяці X+1
        // creditMonth = попередній місяць від затвердження
        let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
        let creditYear = approvalDate.getFullYear();
        let creditMonth;
        if (approvalMonth === 0) {
          creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
          creditYear -= 1;
          } else {
          creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
        }
          // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
        if (creditMonth !== 12) creditMonth += 1;

          // Перевіряємо чи це потрібний місяць
        if (creditMonth === parseInt(month) && creditYear === parseInt(year)) {
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

// Endpoint для деталей запланованого доходу
app.get('/api/analytics/planned-details', async (req, res) => {
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

    // Обробляємо заявки для запланованого доходу (непідтверджені заявки)
    tasks.forEach(task => {
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;

      // Запланований дохід - це заявки, які НЕ підтверджені, але мають workPrice
      if (task.workPrice && (!isWarehouseApproved || !isAccountantApproved)) {
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
        
        // Перевіряємо чи це потрібний місяць
        if (taskMonth === parseInt(month) && taskYear === parseInt(year)) {
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
            engineer1: task.engineer1,
            engineer2: task.engineer2,
            client: task.client,
            workPrice: workPrice,
            baseBonus: baseBonus,
            actualBonus: actualBonus,
            revenue: revenue,
            warehouseApproved: task.approvedByWarehouse,
            accountantApproved: task.approvedByAccountant
          });
        }
      }

      // Запланований дохід по матеріалам - непідтверджені заявки
      if ((!isWarehouseApproved || !isAccountantApproved)) {
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
        
        // Перевіряємо чи це потрібний місяць
        if (taskMonth === parseInt(month) && taskYear === parseInt(year)) {
          const oilTotal = parseFloat(task.oilTotal) || 0;
          const filterSum = parseFloat(task.filterSum) || 0;
          const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
          const airFilterSum = parseFloat(task.airFilterSum) || 0;
          const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
          const otherSum = parseFloat(task.otherSum) || 0;
          
          const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
          
          if (totalMaterials > 0) {
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
              materialsRevenue: materialsRevenue,
              warehouseApproved: task.approvedByWarehouse,
              accountantApproved: task.approvedByAccountant
            });
          }
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
    console.error('Помилка отримання деталей запланованого доходу:', error);
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

// API для отримання типів обладнання по ЄДРПОУ
app.get('/api/edrpou-equipment-types/:edrpou', async (req, res) => {
  try {
    const { edrpou } = req.params;
    console.log('[DEBUG] GET /api/edrpou-equipment-types/:edrpou - запит для ЄДРПОУ:', edrpou);
    
    // Знаходимо всі завдання з цим ЄДРПОУ
    const tasks = await Task.find({ 
      edrpou: { $regex: new RegExp(edrpou, 'i') } 
    });
    
    // Збираємо унікальні типи обладнання
    const equipmentTypes = [...new Set(tasks.map(t => t.equipment).filter(e => e && e.trim()))].sort();
    
    console.log('[DEBUG] GET /api/edrpou-equipment-types/:edrpou - знайдено типів обладнання:', equipmentTypes.length);
    res.json(equipmentTypes);
  } catch (error) {
    console.error('[ERROR] GET /api/edrpou-equipment-types/:edrpou - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання матеріалів по ЄДРПОУ та типу обладнання
app.get('/api/edrpou-equipment-materials/:edrpou/:equipmentType', async (req, res) => {
  try {
    const { edrpou, equipmentType } = req.params;
    console.log('[DEBUG] GET /api/edrpou-equipment-materials/:edrpou/:equipmentType - запит для ЄДРПОУ:', edrpou, 'обладнання:', equipmentType);
    
    // Знаходимо всі завдання з цим ЄДРПОУ та типом обладнання
    const tasks = await Task.find({ 
      edrpou: { $regex: new RegExp(edrpou, 'i') },
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
    
    console.log('[DEBUG] GET /api/edrpou-equipment-materials/:edrpou/:equipmentType - знайдено матеріалів:', {
      oil: materials.oil.types.length,
      oilFilter: materials.oilFilter.names.length,
      fuelFilter: materials.fuelFilter.names.length,
      airFilter: materials.airFilter.names.length,
      antifreeze: materials.antifreeze.types.length,
      otherMaterials: materials.otherMaterials.length
    });
    
    res.json(materials);
  } catch (error) {
    console.error('[ERROR] GET /api/edrpou-equipment-materials/:edrpou/:equipmentType - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для рейтингу працівників по преміях
app.get('/api/analytics/employee-rating', async (req, res) => {
  try {
    const { startDate, endDate, region, startYear, endYear, startMonth, endMonth } = req.query;
    
    const taskFilter = {};
    
    // Фільтр по регіону
    if (region && region !== '') {
      const regionSingle = region.split(',')[0]?.trim() || region;
      taskFilter.serviceRegion = regionSingle;
    }
    
    // Беремо тільки затверджені заявки з преміями
    // Спочатку отримуємо всі заявки, потім фільтруємо по даті та затвердженнях
    taskFilter.status = 'Виконано';
    taskFilter.workPrice = { $exists: true, $ne: null, $ne: '' };
    
    let tasks = await Task.find(taskFilter);
    console.log(`[DEBUG employee-rating] Знайдено ${tasks.length} заявок зі статусом "Виконано" та workPrice`);
    
    // Фільтруємо по затвердженнях
    const isApproved = (value) => {
      return value === true || value === 'Підтверджено';
    };
    
    tasks = tasks.filter(task => {
      return isApproved(task.approvedByWarehouse) && isApproved(task.approvedByAccountant);
    });
    console.log(`[DEBUG employee-rating] Після фільтрації по затвердженнях: ${tasks.length} заявок`);
    
    // Фільтр по даті затвердження (використовуємо логіку як у таблиці "Таблиця нарахування по персоналу")
    // Для періоду [targetMonth, endMonthVal] потрібно шукати заявки з creditMonth в цьому діапазоні
    // creditMonth обчислюється так: якщо workMonth === approvalMonth, то creditMonth = workMonth
    // Інакше creditMonth = approvalMonth - 1 (попередній місяць від затвердження)
    if (startYear && startMonth) {
      const targetYear = parseInt(startYear);
      const targetMonth = parseInt(startMonth);
      const endYearVal = parseInt(endYear || startYear);
      const endMonthVal = parseInt(endMonth || startMonth);
      
      console.log(`[DEBUG employee-rating] Фільтр по періоду: ${targetYear}-${targetMonth} до ${endYearVal}-${endMonthVal}`);
      
      tasks = tasks.filter(task => {
        // Отримуємо дату затвердження премії (пріоритет: bonusApprovalDate > approvedByAccountantDate > date)
        let bonusApprovalDateStr = task.bonusApprovalDate || '';
        if (!bonusApprovalDateStr && task.approvedByAccountantDate) {
          const accDate = new Date(task.approvedByAccountantDate);
          if (!isNaN(accDate.getTime())) {
            const month = (accDate.getMonth() + 1).toString().padStart(2, '0');
            const year = accDate.getFullYear();
            bonusApprovalDateStr = `${month}-${year}`;
          }
        }
        
        // Конвертуємо bonusApprovalDate з YYYY-MM-DD у MM-YYYY
        if (bonusApprovalDateStr && /^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDateStr)) {
          const [year, month] = bonusApprovalDateStr.split('-');
          bonusApprovalDateStr = `${month}-${year}`;
        }
        
        // Парсимо дату затвердження
        let approvalDate;
        if (bonusApprovalDateStr) {
          if (/^\d{2}-\d{4}$/.test(bonusApprovalDateStr)) {
            // Формат "MM-YYYY" (наприклад "10-2025")
            const [m, y] = bonusApprovalDateStr.split('-');
            approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
          } else {
            // Спробуємо парсити як звичайну дату
            approvalDate = new Date(bonusApprovalDateStr);
          }
        }
        
        // Якщо не вдалося розпарсити дату затвердження, використовуємо дату виконання робіт
        if (!bonusApprovalDateStr || isNaN(approvalDate.getTime())) {
          if (task.date) {
            approvalDate = new Date(task.date);
          } else {
            // Якщо немає ні дати затвердження, ні дати робіт, пропускаємо заявку
            return false;
          }
        }
        
        // Отримуємо місяць затвердження та місяць виконання робіт
        const approvalMonth = approvalDate.getMonth() + 1; // 1-12
        const approvalYear = approvalDate.getFullYear();
        
        let workDate;
        if (task.date) {
          workDate = new Date(task.date);
        } else {
          workDate = approvalDate; // Якщо немає дати робіт, використовуємо дату затвердження
        }
        const workMonth = workDate.getMonth() + 1; // 1-12
        const workYear = workDate.getFullYear();
        
        // Логіка як у таблиці: якщо workMonth === approvalMonth && workYear === approvalYear, то creditMonth = workMonth
        // Інакше creditMonth = approvalMonth - 1 (попередній місяць від затвердження)
        let creditMonth, creditYear;
        if (workMonth === approvalMonth && workYear === approvalYear) {
          // Якщо місяць/рік виконання співпадає з місяцем/роком затвердження
          creditMonth = workMonth;
          creditYear = workYear;
        } else {
          // Якщо не співпадає - нараховуємо на попередній місяць від дати затвердження
          if (approvalMonth === 1) {
            creditMonth = 12;
            creditYear = approvalYear - 1;
          } else {
            creditMonth = approvalMonth - 1;
            creditYear = approvalYear;
          }
        }
        
        // Перевіряємо чи потрапляє creditMonth в цільовий період
        if (creditYear < targetYear || creditYear > endYearVal) {
          return false;
        }
        if (creditYear === targetYear && creditMonth < targetMonth) {
          return false;
        }
        if (creditYear === endYearVal && creditMonth > endMonthVal) {
          return false;
        }
        
        return true;
      });
    } else {
      console.log(`[DEBUG employee-rating] Період не вказано, показуємо всі заявки`);
    }
    
    console.log(`[DEBUG employee-rating] Знайдено ${tasks.length} заявок після фільтрації`);
    console.log(`[DEBUG employee-rating] Фільтр по періоду: ${startYear}-${startMonth} до ${endYear || startYear}-${endMonth || startMonth}`);
    
    // Підрахунок заявок по місяцях для діагностики
    const tasksByMonth = {};
    tasks.forEach(task => {
      let bonusApprovalDateStr = task.bonusApprovalDate || '';
      if (bonusApprovalDateStr) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDateStr)) {
          const [year, month] = bonusApprovalDateStr.split('-');
          bonusApprovalDateStr = `${month}-${year}`;
        }
        
        let approvalDate;
        if (/^\d{2}-\d{4}$/.test(bonusApprovalDateStr)) {
          const [m, y] = bonusApprovalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else {
          approvalDate = new Date(bonusApprovalDateStr);
        }
        
        if (!isNaN(approvalDate.getTime())) {
          const approvalMonth = approvalDate.getMonth() + 1;
          const approvalYear = approvalDate.getFullYear();
          let workDate = task.date ? new Date(task.date) : approvalDate;
          const workMonth = workDate.getMonth() + 1;
          const workYear = workDate.getFullYear();
          
          let creditMonth, creditYear;
          if (workMonth === approvalMonth && workYear === approvalYear) {
            creditMonth = workMonth;
            creditYear = workYear;
          } else {
            if (approvalMonth === 1) {
              creditMonth = 12;
              creditYear = approvalYear - 1;
            } else {
              creditMonth = approvalMonth - 1;
              creditYear = approvalYear;
            }
          }
          
          const monthKey = `${creditYear}-${creditMonth}`;
          if (!tasksByMonth[monthKey]) {
            tasksByMonth[monthKey] = 0;
          }
          tasksByMonth[monthKey]++;
        }
      }
    });
    console.log(`[DEBUG employee-rating] Розподіл заявок по місяцях:`, tasksByMonth);
    
    console.log(`[DEBUG employee-rating] Перші 5 заявок:`, tasks.slice(0, 5).map(t => ({
      id: t._id,
      status: t.status,
      workPrice: t.workPrice,
      engineer1: t.engineer1,
      engineer2: t.engineer2,
      bonusApprovalDate: t.bonusApprovalDate,
      approvedByWarehouse: t.approvedByWarehouse,
      approvedByAccountant: t.approvedByAccountant
    })));
    
    // Групуємо по інженерах
    const employeeStats = {};
    const processedTaskIds = new Set(); // Для відстеження вже оброблених заявок
    
    // Додаємо підрахунок премій по місяцях для діагностики (тільки для Михайлішина В.)
    const mikhailishinByMonth = {};
    
    // Спочатку проходимо по всіх завданнях та збираємо інформацію про них
    const taskData = [];
    
    tasks.forEach(task => {
      // Перевіряємо, чи не обробляли цю заявку вже
      if (processedTaskIds.has(task._id.toString())) {
        console.log(`[DEBUG employee-rating] ПРОПУСКАЄМО дублікат заявки: ${task._id}`);
        return;
      }
      processedTaskIds.add(task._id.toString());
      
      let workPrice = parseFloat(task.workPrice) || 0;
      if (workPrice === 0) return;
      
      // Отримуємо всіх інженерів (може бути до 6), перевіряючи, що вони не пусті та унікальні
      const engineersRaw = [
        (task.engineer1 || '').trim(),
        (task.engineer2 || '').trim(),
        (task.engineer3 || '').trim(),
        (task.engineer4 || '').trim(),
        (task.engineer5 || '').trim(),
        (task.engineer6 || '').trim()
      ];
      
      // Фільтруємо пусті значення та дублікати
      const engineers = [];
      const seenEngineers = new Set();
      
      for (const engineer of engineersRaw) {
        if (engineer && engineer.length > 0 && !seenEngineers.has(engineer)) {
          engineers.push(engineer);
          seenEngineers.add(engineer);
        }
      }
      
      if (engineers.length === 0) return;
      
      // Розраховуємо премію: workPrice - це вартість робіт для завдання
      // Премія = 25% від workPrice, ділиться порівну між інженерами
      // Якщо 1 інженер: bonus = workPrice * 0.25
      // Якщо 2 інженери: bonus = workPrice * 0.25 / 2 (кожен отримує половину)
      const workPricePerEngineer = workPrice / engineers.length;
      const bonusPerEngineer = (workPrice * 0.25) / engineers.length;
      
      // Зберігаємо дані завдання
      taskData.push({
        taskId: task._id.toString(),
        workPrice,
        workPricePerEngineer,
        bonusPerEngineer,
        engineers,
        task
      });
    });
    
    // Тепер для кожного унікального працівника рахуємо його завдання
    // Спочатку збираємо всіх унікальних працівників (нормалізуємо імена)
    const allEngineers = new Set();
    taskData.forEach(data => {
      data.engineers.forEach(engineer => {
        if (engineer && engineer.trim()) {
          allEngineers.add(engineer.trim());
        }
      });
    });
    
    console.log(`[DEBUG employee-rating] Знайдено ${allEngineers.size} унікальних інженерів:`, Array.from(allEngineers).slice(0, 10));
    console.log(`[DEBUG employee-rating] Всього завдань для обробки: ${taskData.length}`);
    
    // Для кожного працівника окремо перевіряємо всі завдання
    allEngineers.forEach(engineer => {
      // Інженери в allEngineers вже нормалізовані (trim)
      const normalizedEngineer = engineer;
      
      // Ініціалізуємо статистику працівника
      if (!employeeStats[normalizedEngineer]) {
        employeeStats[normalizedEngineer] = {
          name: normalizedEngineer,
          totalBonus: 0,
          tasksCount: 0,
          totalWorkPrice: 0
        };
      }
      
      // Проходимо по всіх завданнях і перевіряємо, чи працівник є в полях Інженер 1-6
      taskData.forEach(data => {
        const task = data.task;
        
        // Перевіряємо всі поля Інженер 1-6 окремо, нормалізуючи кожне значення
        const engineerFields = [
          (task.engineer1 || '').trim(),
          (task.engineer2 || '').trim(),
          (task.engineer3 || '').trim(),
          (task.engineer4 || '').trim(),
          (task.engineer5 || '').trim(),
          (task.engineer6 || '').trim()
        ];
        
        // Якщо працівник знайдений в будь-якому з полів - додаємо завдання
        if (engineerFields.includes(normalizedEngineer)) {
          employeeStats[normalizedEngineer].tasksCount += 1;
          employeeStats[normalizedEngineer].totalBonus += data.bonusPerEngineer;
          employeeStats[normalizedEngineer].totalWorkPrice += data.workPricePerEngineer;
          
          // Додаткове логування для Михайлішина В.
          if (normalizedEngineer === 'Михайлішин В.' || normalizedEngineer.includes('Михайлішин')) {
            console.log(`[DEBUG employee-rating] Михайлішин В. - Заявка ${task._id}: engineer1="${task.engineer1}", engineer2="${task.engineer2}", normalizedEngineer="${normalizedEngineer}", engineerFields=[${engineerFields.map(f => `"${f}"`).join(', ')}], знайдено=${engineerFields.includes(normalizedEngineer)}, tasksCount=${employeeStats[normalizedEngineer].tasksCount}`);
            
            // Визначаємо creditMonth для цієї заявки
            let bonusApprovalDateStr = task.bonusApprovalDate || '';
            if (!bonusApprovalDateStr && task.approvedByAccountantDate) {
              const accDate = new Date(task.approvedByAccountantDate);
              if (!isNaN(accDate.getTime())) {
                const month = (accDate.getMonth() + 1).toString().padStart(2, '0');
                const year = accDate.getFullYear();
                bonusApprovalDateStr = `${month}-${year}`;
              }
            }
            if (bonusApprovalDateStr) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDateStr)) {
                const [year, month] = bonusApprovalDateStr.split('-');
                bonusApprovalDateStr = `${month}-${year}`;
              }
              let approvalDate;
              if (/^\d{2}-\d{4}$/.test(bonusApprovalDateStr)) {
                const [m, y] = bonusApprovalDateStr.split('-');
                approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
              } else {
                approvalDate = new Date(bonusApprovalDateStr);
              }
              if (!isNaN(approvalDate.getTime())) {
                const approvalMonth = approvalDate.getMonth() + 1;
                const approvalYear = approvalDate.getFullYear();
                let workDate = task.date ? new Date(task.date) : approvalDate;
                const workMonth = workDate.getMonth() + 1;
                const workYear = workDate.getFullYear();
                let creditMonth, creditYear;
                if (workMonth === approvalMonth && workYear === approvalYear) {
                  creditMonth = workMonth;
                  creditYear = workYear;
                } else {
                  if (approvalMonth === 1) {
                    creditMonth = 12;
                    creditYear = approvalYear - 1;
                  } else {
                    creditMonth = approvalMonth - 1;
                    creditYear = approvalYear;
                  }
                }
                const monthKey = `${creditYear}-${creditMonth}`;
                if (!mikhailishinByMonth[monthKey]) {
                  mikhailishinByMonth[monthKey] = 0;
                }
                mikhailishinByMonth[monthKey] += data.bonusPerEngineer;
              }
            }
          }
        }
      });
    });
    
    console.log(`[DEBUG employee-rating] Знайдено ${Object.keys(employeeStats).length} унікальних працівників`);
    console.log(`[DEBUG employee-rating] Оброблено ${processedTaskIds.size} унікальних заявок`);
    
    // Виводимо розподіл премій Михайлішина В. по місяцях
    if (Object.keys(mikhailishinByMonth).length > 0) {
      console.log(`[DEBUG employee-rating] Премії Михайлішина В. по місяцях:`, mikhailishinByMonth);
      const totalByMonth = Object.values(mikhailishinByMonth).reduce((sum, val) => sum + val, 0);
      console.log(`[DEBUG employee-rating] Сума премій Михайлішина В. по місяцях: ${totalByMonth.toFixed(2)}`);
    }
    
    // Сортуємо по загальній сумі премії
    const rating = Object.values(employeeStats)
      .map(emp => ({
        ...emp,
        tasksCount: Math.round(emp.tasksCount), // Кількість завдань - це ціле число
        totalWorkPrice: Math.round(emp.totalWorkPrice * 100) / 100,
        totalBonus: Math.round(emp.totalBonus * 100) / 100
      }))
      .sort((a, b) => b.totalBonus - a.totalBonus);
    
    console.log(`[DEBUG employee-rating] Повертаємо рейтинг з ${rating.length} працівниками`);
    if (rating.length > 0) {
      console.log(`[DEBUG employee-rating] Всі працівники:`, rating.map(e => ({ 
        name: e.name, 
        bonus: e.totalBonus.toFixed(2), 
        tasks: e.tasksCount.toFixed(2), 
        workPrice: e.totalWorkPrice.toFixed(2) 
      })));
      
      // Додаткова інформація для Михайлішина В.
      const mikhailishin = rating.find(e => e.name === 'Михайлішин В.' || e.name.includes('Михайлішин'));
      if (mikhailishin) {
        console.log(`[DEBUG employee-rating] Детальна інформація про Михайлішина В.:`, {
          name: mikhailishin.name,
          totalBonus: mikhailishin.totalBonus.toFixed(2),
          tasksCount: mikhailishin.tasksCount,
          totalWorkPrice: mikhailishin.totalWorkPrice.toFixed(2)
        });
      }
      
      // Підрахунок завдань для Михайлішина В. вручну для перевірки
      const mikhailishinTasksCount = taskData.filter(data => {
        const task = data.task;
        const engineerFields = [
          (task.engineer1 || '').trim(),
          (task.engineer2 || '').trim(),
          (task.engineer3 || '').trim(),
          (task.engineer4 || '').trim(),
          (task.engineer5 || '').trim(),
          (task.engineer6 || '').trim()
        ];
        return engineerFields.some(field => field === 'Михайлішин В.' || field.includes('Михайлішин'));
      }).length;
      console.log(`[DEBUG employee-rating] Підрахунок завдань для Михайлішина В. (вручну): ${mikhailishinTasksCount} завдань`);
      
      // Додатковий підрахунок для кожного інженера
      const engineerTasksCounts = {};
      taskData.forEach(data => {
        const task = data.task;
        const engineerFields = [
          (task.engineer1 || '').trim(),
          (task.engineer2 || '').trim(),
          (task.engineer3 || '').trim(),
          (task.engineer4 || '').trim(),
          (task.engineer5 || '').trim(),
          (task.engineer6 || '').trim()
        ];
        engineerFields.forEach(eng => {
          if (eng && eng.trim()) {
            if (!engineerTasksCounts[eng]) engineerTasksCounts[eng] = 0;
            engineerTasksCounts[eng]++;
          }
        });
      });
      console.log(`[DEBUG employee-rating] Підрахунок завдань по інженерах (вручну):`, Object.entries(engineerTasksCounts).slice(0, 5));
    }
    
    res.json(rating);
  } catch (error) {
    console.error('Помилка отримання рейтингу працівників:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для статистики заявок в роботі (на сьогоднішній день)
app.get('/api/analytics/tasks-statistics', async (req, res) => {
  try {
    const { region } = req.query;
    
    const taskFilter = {};
    
    // Фільтр по регіону (як в інших місцях - обробляємо "Україна" та множинні регіони)
    if (region && region !== '' && region !== 'Україна') {
      // Якщо регіон містить кому (мультирегіональний користувач)
      if (region.includes(',')) {
        const regions = region.split(',').map(r => r.trim());
        taskFilter.serviceRegion = { $in: regions };
        console.log('[DEBUG tasks-statistics] Мультирегіональний користувач, регіони:', regions);
      } else if (region === 'Загальний') {
        // Для "Загальний" регіону не додаємо фільтр - показуємо всі заявки
        console.log('[DEBUG tasks-statistics] Регіон "Загальний", не фільтруємо по регіону');
      } else {
        taskFilter.serviceRegion = region;
        console.log('[DEBUG tasks-statistics] Одинарний регіон:', region);
      }
    } else {
      console.log('[DEBUG tasks-statistics] Регіон "Україна" або порожній - показуємо всі заявки');
    }
    
    const tasks = await Task.find(taskFilter).lean();
    console.log(`[DEBUG tasks-statistics] Знайдено ${tasks.length} завдань для статистики (відфільтровано по регіону)`);
    
    // ДЛЯ ПІДРАХУНКУ ЗАЯВОК НА РАХУНКИ: використовуємо ВСІ tasks (як у панелі "Бух рахунки")
    // Панель використовує allTasksFromAPI, який завантажується через tasksAPI.getAll() - без фільтрації по регіону
    const allTasksForInvoiceRequests = await Task.find({}).lean();
    console.log(`[DEBUG tasks-statistics] Знайдено ${allTasksForInvoiceRequests.length} ВСІХ завдань для підрахунку заявок на рахунки`);
    
    // ОПТИМІЗАЦІЯ: Завантажуємо дані InvoiceRequest для ВСІХ tasks (для заявок на рахунки)
    const allTaskIds = allTasksForInvoiceRequests.map(task => task._id.toString());
    const allInvoiceRequestIds = allTasksForInvoiceRequests
      .map(task => task.invoiceRequestId)
      .filter(id => id);
    
    const invoiceRequests = await InvoiceRequest.find({
      $or: [
        { taskId: { $in: allTaskIds } },
        { _id: { $in: allInvoiceRequestIds } }
      ]
    });
    
    // Створюємо мапи для швидкого пошуку
    const invoiceRequestByTaskId = new Map();
    const invoiceRequestById = new Map();
    
    invoiceRequests.forEach(invoice => {
      if (invoice.taskId) {
        invoiceRequestByTaskId.set(invoice.taskId, invoice);
      }
      invoiceRequestById.set(invoice._id.toString(), invoice);
    });
    
    // Додаємо дані InvoiceRequest до ВСІХ tasks (для заявок на рахунки)
    const allTasksWithInvoiceInfo = allTasksForInvoiceRequests.map(task => {
      let invoiceRequest = null;
      
      if (task.invoiceRequestId) {
        invoiceRequest = invoiceRequestById.get(task.invoiceRequestId);
      }
      
      if (!invoiceRequest) {
        invoiceRequest = invoiceRequestByTaskId.get(task._id.toString());
      }
      
      // Використовуємо task напряму, оскільки використовується .lean()
      const taskCopy = { ...task };
      
      if (invoiceRequest) {
        taskCopy.invoiceRequestId = invoiceRequest._id.toString();
        taskCopy.needInvoice = invoiceRequest.needInvoice;
        taskCopy.needAct = invoiceRequest.needAct;
        taskCopy.invoiceStatus = invoiceRequest.status;
      }
      
      return taskCopy;
    });
    
    // Додаємо дані InvoiceRequest до відфільтрованих tasks (для решти статистики)
    const tasksWithInvoiceInfo = tasks.map(task => {
      let invoiceRequest = null;
      
      if (task.invoiceRequestId) {
        invoiceRequest = invoiceRequestById.get(task.invoiceRequestId);
      }
      
      if (!invoiceRequest) {
        invoiceRequest = invoiceRequestByTaskId.get(task._id.toString());
      }
      
      // Використовуємо task напряму, оскільки використовується .lean()
      const taskCopy = { ...task };
      
      if (invoiceRequest) {
        taskCopy.invoiceRequestId = invoiceRequest._id.toString();
        taskCopy.needInvoice = invoiceRequest.needInvoice;
        taskCopy.needAct = invoiceRequest.needAct;
        taskCopy.invoiceStatus = invoiceRequest.status;
      }
      
      return taskCopy;
    });
    
    // Допоміжні функції для перевірки статусів
    const isApproved = (value) => {
      return value === true || value === 'Підтверджено';
    };
    
    const isRejected = (value) => {
      return value === false || value === 'Відмова';
    };
    
    const statistics = {
      notInWork: 0,           // Заявки зі статусом "Заявка"
      inWork: 0,              // Заявки зі статусом "В роботі"
      pendingWarehouse: 0,    // Заявки "Виконано" але не підтверджено завскладом
      pendingAccountant: 0,   // Заявки "Виконано", підтверджено завскладом, але не підтверджено бухгалтером
      pendingInvoiceRequests: 0  // Не виконані заявки на рахунки
    };
    
    // Підрахунок невиконаних заявок на рахунки
    // Використовуємо ТАКУ Ж логіку як у панелі "Бух рахунки - Заявка на рахунок":
    // Фільтруємо ВСІ завдання (незалежно від регіону), які мають invoiceRequestId || needInvoice || needAct
    // і виключаємо ті, де invoiceStatus === 'completed'
    // Панель використовує allTasksFromAPI (всі tasks без фільтрації по регіону)
    // УВАГА: showCompletedRequests за замовчуванням false в панелі, тому виключаємо completed
    const tasksWithInvoiceRequests = allTasksWithInvoiceInfo.filter(task => {
      // Показуємо завдання з запитами на рахунки
      const hasInvoiceRequest = task.invoiceRequestId || task.needInvoice || task.needAct;
      
      if (!hasInvoiceRequest) return false;
      
      // Виключаємо виконані заявки (invoiceStatus === 'completed')
      // Це відповідає логіці панелі з showCompletedRequests === false
      if (task.invoiceStatus === 'completed') {
        return false;
      }
      
      return true;
    });
    
    statistics.pendingInvoiceRequests = tasksWithInvoiceRequests.length;
    
    // Детальне логування для діагностики
    const tasksWithInvoiceRequestId = allTasksWithInvoiceInfo.filter(t => t.invoiceRequestId).length;
    const tasksWithNeedInvoice = allTasksWithInvoiceInfo.filter(t => t.needInvoice).length;
    const tasksWithNeedAct = allTasksWithInvoiceInfo.filter(t => t.needAct).length;
    const tasksCompleted = allTasksWithInvoiceInfo.filter(t => t.invoiceStatus === 'completed').length;
    const tasksWithAnyInvoiceRequest = allTasksWithInvoiceInfo.filter(t => t.invoiceRequestId || t.needInvoice || t.needAct).length;
    
    console.log(`[DEBUG tasks-statistics] Детальна статистика заявок на рахунки:`);
    console.log(`  - Всього tasks: ${allTasksForInvoiceRequests.length}`);
    console.log(`  - Tasks з invoiceRequestId: ${tasksWithInvoiceRequestId}`);
    console.log(`  - Tasks з needInvoice: ${tasksWithNeedInvoice}`);
    console.log(`  - Tasks з needAct: ${tasksWithNeedAct}`);
    console.log(`  - Tasks з будь-яким invoice request: ${tasksWithAnyInvoiceRequest}`);
    console.log(`  - Tasks з invoiceStatus='completed': ${tasksCompleted}`);
    console.log(`  - Результат (виключено completed): ${statistics.pendingInvoiceRequests}`);
    
    tasksWithInvoiceInfo.forEach(task => {
      // 1. Не взято в роботу (статус "Заявка")
      if (task.status === 'Заявка') {
        statistics.notInWork++;
      }
      
      // 2. Виконується сервісними інжнерами (статус "В роботі")
      if (task.status === 'В роботі') {
        statistics.inWork++;
      }
      
      // 3. Не підтверджено завскладом (статус "Виконано" і завсклад не підтвердив)
      // Включаємо всі tasks, де approvedByWarehouse !== 'Підтверджено' (включаючи "Відмова", "На розгляді" та інші)
      if (task.status === 'Виконано' && !isApproved(task.approvedByWarehouse)) {
        statistics.pendingWarehouse++;
      }
      
      // 4. Не підтверджено бухгалтером (статус "Виконано", підтверджено завскладом, але не підтверджено бухгалтером)
      if (task.status === 'Виконано' && 
          isApproved(task.approvedByWarehouse) &&
          !isApproved(task.approvedByAccountant) && 
          !isRejected(task.approvedByAccountant)) {
        statistics.pendingAccountant++;
      }
    });
    
    console.log(`[DEBUG tasks-statistics] Статистика для регіону "${region}":`, statistics);
    
    res.json(statistics);
  } catch (error) {
    console.error('Помилка отримання статистики заявок:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для динаміки економічних показників за період (для графіків)
app.get('/api/analytics/dynamic-chart-data', async (req, res) => {
  try {
    const { startYear, endYear, startMonth, endMonth, region, company, periodicity = 'month' } = req.query;
    
    // Отримуємо дані з analytics та tasks
    const analyticsFilter = {};
    if (region && region !== '') {
      const regionSingle = region.split(',')[0]?.trim() || region;
      analyticsFilter.region = regionSingle;
    }
    if (startYear) analyticsFilter.year = { $gte: parseInt(startYear) };
    if (endYear) {
      if (!analyticsFilter.year) analyticsFilter.year = {};
      analyticsFilter.year.$lte = parseInt(endYear);
    }
    if (startMonth) {
      if (!analyticsFilter.month) analyticsFilter.month = {};
      analyticsFilter.month.$gte = parseInt(startMonth);
    }
    if (endMonth) {
      if (!analyticsFilter.month) analyticsFilter.month = {};
      analyticsFilter.month.$lte = parseInt(endMonth);
    }
    
    const analytics = await Analytics.find(analyticsFilter);
    
    // Отримуємо доходи з tasks
    const taskFilter = {};
    if (region && region !== '') {
      const regionSingle = region.split(',')[0]?.trim() || region;
      taskFilter.serviceRegion = regionSingle;
    }
    if (company && company !== '') {
      taskFilter.company = company;
    }
    
    taskFilter.status = 'Виконано';
    taskFilter.approvedByWarehouse = 'Підтверджено';
    taskFilter.approvedByAccountant = 'Підтверджено';
    
    const tasks = await Task.find(taskFilter);
    
    // Групуємо дані по періодах
    const chartData = {};
    
    // Додаємо дані з analytics
    analytics.forEach(item => {
      const key = periodicity === 'month' 
        ? `${item.year}-${String(item.month).padStart(2, '0')}`
        : `${item.year}-${String(item.month).padStart(2, '0')}-01`;
      
      if (!chartData[key]) {
        chartData[key] = {
          period: key,
          year: item.year,
          month: item.month,
          revenue: 0,
          expenses: 0,
          profit: 0,
          profitability: 0,
          workRevenue: 0,
          materialsRevenue: 0,
          plannedRevenue: 0
        };
      }
      
      chartData[key].expenses += item.totalExpenses || 0;
    });
    
    // Додаємо доходи з tasks - використовуємо ТАКУ САМУ логіку як у /api/analytics/full
    tasks.forEach(task => {
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      
      // Дохід по роботах - використовуємо логіку creditMonth
      if (task.workPrice && isWarehouseApproved && isAccountantApproved) {
        let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
        let approvalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
          const [y, m] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
          const [m, y] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else {
          approvalDate = new Date(approvalDateStr);
        }
        if (isNaN(approvalDate.getTime())) return;
        
        // Логіка: премію за місяць X затверджують у місяці X+1
        // creditMonth = попередній місяць від затвердження
        let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
        let creditYear = approvalDate.getFullYear();
        let creditMonth;
        if (approvalMonth === 0) {
          creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
          creditYear -= 1;
        } else {
          creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
        }
        // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
        if (creditMonth !== 12) creditMonth += 1;
        
        // Фільтр по періоду
        if (startYear && creditYear < parseInt(startYear)) return;
        if (endYear && creditYear > parseInt(endYear)) return;
        if (startYear && creditYear === parseInt(startYear) && startMonth && creditMonth < parseInt(startMonth)) return;
        if (endYear && creditYear === parseInt(endYear) && endMonth && creditMonth > parseInt(endMonth)) return;
        
        const key = periodicity === 'month'
          ? `${creditYear}-${String(creditMonth).padStart(2, '0')}`
          : `${creditYear}-${String(creditMonth).padStart(2, '0')}-01`;
        
        if (!chartData[key]) {
          chartData[key] = {
            period: key,
            year: creditYear,
            month: creditMonth,
            revenue: 0,
            expenses: 0,
            profit: 0,
            profitability: 0,
            workRevenue: 0,
            materialsRevenue: 0,
            plannedRevenue: 0
          };
        }
        
        const workPrice = parseFloat(task.workPrice) || 0;
        const baseBonus = workPrice * 0.25;
        let actualBonus = 0;
        const engineer1 = (task.engineer1 || '').trim();
        const engineer2 = (task.engineer2 || '').trim();
        if (engineer1 && engineer2) {
          actualBonus = baseBonus;
        } else if (engineer1 || engineer2) {
          actualBonus = baseBonus;
        }
        const workRevenue = actualBonus * 3;
        chartData[key].workRevenue += workRevenue;
      }
      
      // Дохід по матеріалам - використовуємо логіку creditMonth
      if (isWarehouseApproved && isAccountantApproved) {
        let approvalDateStr = task.bonusApprovalDate || task.approvedByAccountantDate || task.date || '';
        let approvalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(approvalDateStr)) {
          const [y, m] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else if (/^\d{2}-\d{4}$/.test(approvalDateStr)) {
          const [m, y] = approvalDateStr.split('-');
          approvalDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        } else {
          approvalDate = new Date(approvalDateStr);
        }
        if (isNaN(approvalDate.getTime())) return;
        
        // Логіка: премію за місяць X затверджують у місяці X+1
        // creditMonth = попередній місяць від затвердження
        let approvalMonth = approvalDate.getMonth(); // 0-11 (місяць затвердження)
        let creditYear = approvalDate.getFullYear();
        let creditMonth;
        if (approvalMonth === 0) {
          creditMonth = 12; // Якщо затверджено в січні, премія за грудень попереднього року
          creditYear -= 1;
        } else {
          creditMonth = approvalMonth - 1; // Попередній місяць в 0-11
        }
        // creditMonth тепер в 0-11 (окрім 12), конвертуємо в 1-12
        if (creditMonth !== 12) creditMonth += 1;
        
        // Фільтр по періоду
        if (startYear && creditYear < parseInt(startYear)) return;
        if (endYear && creditYear > parseInt(endYear)) return;
        if (startYear && creditYear === parseInt(startYear) && startMonth && creditMonth < parseInt(startMonth)) return;
        if (endYear && creditYear === parseInt(endYear) && endMonth && creditMonth > parseInt(endMonth)) return;
        
        const key = periodicity === 'month'
          ? `${creditYear}-${String(creditMonth).padStart(2, '0')}`
          : `${creditYear}-${String(creditMonth).padStart(2, '0')}-01`;
        
        if (!chartData[key]) {
          chartData[key] = {
            period: key,
            year: creditYear,
            month: creditMonth,
            revenue: 0,
            expenses: 0,
            profit: 0,
            profitability: 0,
            workRevenue: 0,
            materialsRevenue: 0,
            plannedRevenue: 0
          };
        }
        
        const oilTotal = parseFloat(task.oilTotal) || 0;
        const filterSum = parseFloat(task.filterSum) || 0;
        const fuelFilterSum = parseFloat(task.fuelFilterSum) || 0;
        const airFilterSum = parseFloat(task.airFilterSum) || 0;
        const antifreezeSum = parseFloat(task.antifreezeSum) || 0;
        const otherSum = parseFloat(task.otherSum) || 0;
        const totalMaterials = oilTotal + filterSum + fuelFilterSum + airFilterSum + antifreezeSum + otherSum;
        const materialsRevenue = totalMaterials / 4;
        chartData[key].materialsRevenue += materialsRevenue;
      }
    });
    
    // Розраховуємо загальні показники
    const result = Object.values(chartData).map(item => {
      item.revenue = item.workRevenue + item.materialsRevenue;
      item.profit = item.revenue - item.expenses;
      item.profitability = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;
      return item;
    }).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    
    res.json(result);
  } catch (error) {
    console.error('Помилка отримання динаміки:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання унікальних ЄДРПОУ
app.get('/api/edrpou-list', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/edrpou-list - запит отримано');
    
    const edrpouList = await Task.distinct('edrpou');
    const filteredEdrpou = edrpouList
      .filter(edrpou => edrpou && edrpou.trim() !== '')
      .sort();
    
    console.log('[DEBUG] GET /api/edrpou-list - знайдено ЄДРПОУ:', filteredEdrpou.length);
    res.json(filteredEdrpou);
  } catch (error) {
    console.error('[ERROR] GET /api/edrpou-list - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання даних клієнта по ЄДРПОУ
app.get('/api/client-data/:edrpou', async (req, res) => {
  try {
    const { edrpou } = req.params;
    console.log('[DEBUG] GET /api/client-data/:edrpou - запит для ЄДРПОУ:', edrpou);
    
    // Знаходимо останню заявку з цим ЄДРПОУ
    const task = await Task.findOne({ 
      edrpou: { $regex: new RegExp(edrpou, 'i') } 
    }).sort({ createdAt: -1 });
    
    if (!task) {
      return res.json({
        client: '',
        address: '',
        contractFile: null,
        invoiceRecipientDetails: ''
      });
    }
    
    const clientData = {
      client: task.client || '',
      address: task.address || '',
      contractFile: task.contractFile || null,
      invoiceRecipientDetails: task.invoiceRecipientDetails || ''
    };
    
    console.log('[DEBUG] GET /api/client-data/:edrpou - знайдено дані клієнта:', {
      client: clientData.client,
      hasAddress: !!clientData.address,
      hasContractFile: !!clientData.contractFile,
      hasInvoiceDetails: !!clientData.invoiceRecipientDetails
    });
    
    res.json(clientData);
  } catch (error) {
    console.error('[ERROR] GET /api/client-data/:edrpou - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання списку файлів договорів
app.get('/api/contract-files', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/contract-files - запит отримано');
    
    // Знаходимо всі заявки з файлами договорів
    console.log('[DEBUG] GET /api/contract-files - виконуємо MongoDB запит...');
    const tasks = await Task.find({ 
      contractFile: { $exists: true, $ne: null, $ne: '' } 
    }).select('contractFile client edrpou createdAt').sort({ createdAt: -1 });
    
    console.log('[DEBUG] GET /api/contract-files - знайдено заявок з файлами:', tasks.length);
    console.log('[DEBUG] GET /api/contract-files - приклад заявки:', tasks[0]);
    
    const contractFiles = tasks.map(task => {
      try {
        return {
          url: task.contractFile,
          client: task.client || 'Невідомий клієнт',
          edrpou: task.edrpou || '',
          createdAt: task.createdAt,
          fileName: task.contractFile ? task.contractFile.split('/').pop() : 'contract.pdf'
        };
      } catch (mapError) {
        console.error('[ERROR] GET /api/contract-files - помилка при обробці заявки:', mapError);
        console.error('[ERROR] GET /api/contract-files - проблемна заявка:', task);
        return null;
      }
    }).filter(file => file !== null);
    
    console.log('[DEBUG] GET /api/contract-files - знайдено файлів договорів:', contractFiles.length);
    console.log('[DEBUG] GET /api/contract-files - деталі файлів:', contractFiles);
    res.json(contractFiles);
  } catch (error) {
    console.error('[ERROR] GET /api/contract-files - помилка:', error);
    console.error('[ERROR] GET /api/contract-files - стек помилки:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// API для синхронізації статусів рахунків
app.post('/api/sync-invoice-statuses', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/sync-invoice-statuses - синхронізація статусів рахунків');
    
    // Знаходимо всі заявки з запитами на рахунки
    const tasksWithInvoiceRequests = await Task.find({
      invoiceRequestId: { $exists: true, $ne: null }
    });
    
    console.log('[DEBUG] POST /api/sync-invoice-statuses - знайдено заявок з запитами на рахунки:', tasksWithInvoiceRequests.length);
    
    let updatedCount = 0;
    
    for (const task of tasksWithInvoiceRequests) {
      try {
        // Знаходимо відповідний запит на рахунок
        const invoiceRequest = await InvoiceRequest.findById(task.invoiceRequestId);
        
        if (invoiceRequest && invoiceRequest.status !== task.invoiceStatus) {
          // Оновлюємо статус в заявці
          await Task.findByIdAndUpdate(task._id, {
            invoiceStatus: invoiceRequest.status
          });
          
          console.log('[DEBUG] POST /api/sync-invoice-statuses - оновлено заявку:', task._id, 'статус:', invoiceRequest.status);
          updatedCount++;
        }
      } catch (taskError) {
        console.error('[ERROR] POST /api/sync-invoice-statuses - помилка оновлення заявки:', task._id, taskError);
      }
    }
    
    console.log('[DEBUG] POST /api/sync-invoice-statuses - оновлено заявок:', updatedCount);
    
    res.json({
      success: true,
      message: `Синхронізовано статуси для ${updatedCount} заявок`,
      updatedCount
    });
  } catch (error) {
    console.error('[ERROR] POST /api/sync-invoice-statuses - помилка:', error);
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
      if (record.expenses) {
        // Конвертуємо Map в об'єкт для роботи
        let expensesObj = {};
        if (record.expenses instanceof Map) {
          record.expenses.forEach((value, key) => {
            expensesObj[key] = value;
          });
        } else if (typeof record.expenses === 'object') {
          expensesObj = { ...record.expenses };
        } else {
          continue;
        }
        
        let hasChanges = false;
        const newExpensesMap = new Map();
        
        // Зберігаємо тільки категорії, які є в поточних налаштуваннях
        Object.keys(expensesObj).forEach(categoryKey => {
          if (validCategoryKeys.includes(categoryKey)) {
            newExpensesMap.set(categoryKey, expensesObj[categoryKey] || 0);
          } else {
            hasChanges = true;
            console.log(`[DEBUG] Видалено стару категорію: ${categoryKey} з запису ${record._id}`);
          }
        });
        
        // Зберігаємо зміни
        if (hasChanges) {
          record.expenses = newExpensesMap;
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
    // Збільшуємо період активності до 5 хвилин (300 секунд)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    console.log('[DEBUG] GET /api/active-users - поточний час:', now);
    console.log('[DEBUG] GET /api/active-users - шукаємо активних користувачів з:', fiveMinutesAgo);
    
    const activeUsers = await User.find(
      { lastActivity: { $gte: fiveMinutesAgo } },
      'login name lastActivity'
    );
    
    console.log('[DEBUG] GET /api/active-users - знайдено активних користувачів:', activeUsers.length);
    if (activeUsers.length > 0) {
      console.log('[DEBUG] GET /api/active-users - активні користувачі:', activeUsers.map(u => ({
        login: u.login,
        lastActivity: u.lastActivity
      })));
    }
    
    const logins = activeUsers.map(user => user.login);
    console.log('[DEBUG] GET /api/active-users - повертаємо логіни:', logins);
    
    res.json(logins);
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
    // Збільшуємо період активності до 5 хвилин (300 секунд)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    console.log('[DEBUG] GET /api/users/active - searching for active users since:', fiveMinutesAgo);
    
    const activeUsers = await User.find(
      { lastActivity: { $gte: fiveMinutesAgo } },
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
    addLog('📨 System message request received', 'info');
    addLog(`📝 Message: ${req.body.message}`, 'info');
    addLog(`🔔 Type: ${req.body.notificationType}`, 'info');
    
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
    addLog(`🔍 Searching for users with ${notificationType} enabled`, 'info');
    
    const users = await User.find({});
    const chatIds = users
      .filter(user => {
        // Перевіряємо чи у користувача увімкнені системні сповіщення
        const hasSystemNotifications = user.notificationSettings?.systemNotifications === true;
        const hasTelegramChatId = user.telegramChatId && user.telegramChatId.trim() && user.telegramChatId !== 'Chat ID';
        
        if (hasSystemNotifications && hasTelegramChatId) {
          addLog(`✅ User ${user.login} has system notifications enabled`, 'info');
          return true;
        }
        return false;
      })
      .map(user => user.telegramChatId);
    
    addLog(`📋 Found ${chatIds.length} users with system notifications enabled`, 'info');
    
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
    addLog(`📤 Sending system message to ${chatIds.length} users`, 'info');
    const results = [];
    for (const chatId of chatIds) {
      const success = await telegramService.sendMessage(chatId, systemMessage);
      results.push({ chatId, success });
      if (success) {
        addLog(`✅ Message sent to chatId: ${chatId}`, 'success');
      } else {
        addLog(`❌ Failed to send message to chatId: ${chatId}`, 'error');
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    addLog(`📊 System message sent: ${successCount}/${chatIds.length} users`, 'info');
    
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

// ===== API ENDPOINTS ДЛЯ ЗАПИТІВ НА РАХУНКИ =====

// Тестовий endpoint для перевірки
app.get('/api/test-invoice', (req, res) => {
  console.log('[DEBUG] GET /api/test-invoice - тестовий endpoint працює');
  res.json({ 
    success: true, 
    message: 'Тестовий endpoint працює',
    timestamp: new Date().toISOString()
  });
});

// Створення запиту на рахунок
app.post('/api/invoice-requests', async (req, res) => {
  addLog('🔥 INVOICE REQUEST STARTED', 'info');
  
  try {
    const { taskId, requesterId, requesterName, companyDetails, invoiceRecipientDetails, needInvoice, needAct } = req.body;
    addLog(`Invoice request for task: ${taskId}, needInvoice: ${needInvoice}, needAct: ${needAct}`, 'info');
    
    if (!taskId || !requesterId || !requesterName || !companyDetails) {
      addLog('❌ Missing required fields', 'error');
      return res.status(400).json({ 
        success: false, 
        message: 'Відсутні обов\'язкові поля' 
      });
    }
    
    // Отримуємо заявку для отримання requestNumber
    const task = await Task.findById(taskId);
    if (!task) {
      addLog(`❌ Task not found: ${taskId}`, 'error');
      return res.status(404).json({ 
        success: false, 
        message: 'Заявка не знайдена' 
      });
    }
    addLog(`✅ Task found: ${task._id}`, 'info');
    
    // Перевіряємо чи не існує вже запит для цієї заявки
    const existingRequest = await InvoiceRequest.findOne({ taskId });
    if (existingRequest) {
      addLog(`❌ Invoice request already exists for task: ${taskId}`, 'error');
      return res.status(400).json({ 
        success: false, 
        message: 'Запит на рахунок для цієї заявки вже існує' 
      });
    }
    
    // Створюємо новий запит на рахунок
    const invoiceRequest = new InvoiceRequest({
      taskId,
      requestNumber: task.requestNumber || 'Н/Д',
      requesterId,
      requesterName,
      companyDetails,
      invoiceRecipientDetails,
      needInvoice: needInvoice || false,
      needAct: needAct || false,
      status: 'pending'
    });
    
    await invoiceRequest.save();
    addLog(`✅ Invoice request created: ${invoiceRequest._id}`, 'success');
    
    // Автоматично встановлюємо дату заявки на рахунок в заявці
    try {
      await Task.findByIdAndUpdate(
        taskId,
        { 
          invoiceRequestDate: new Date(),
          invoiceRequestId: invoiceRequest._id.toString()
        },
        { new: true }
      );
      console.log('[DEBUG] POST /api/invoice-requests - автоматично встановлено invoiceRequestDate');
    } catch (taskUpdateError) {
      console.error('[ERROR] POST /api/invoice-requests - помилка оновлення заявки:', taskUpdateError);
    }
    
    // Відправляємо сповіщення бухгалтерам
    try {
      const telegramService = new TelegramNotificationService();
      await telegramService.sendNotification('invoice_requested', {
        taskId,
        requesterName,
        companyName: companyDetails.companyName,
        edrpou: companyDetails.edrpou
      });
      addLog('✅ Telegram notification sent', 'info');
    } catch (notificationError) {
      addLog(`⚠️ Telegram notification failed: ${notificationError.message}`, 'warning');
    }
    
    res.json({ 
      success: true, 
      message: 'Запит на рахунок створено успішно',
      data: invoiceRequest 
    });
    addLog('✅ INVOICE REQUEST COMPLETED', 'success');
    
  } catch (error) {
    addLog(`❌ INVOICE REQUEST FAILED: ${error.message}`, 'error');
    res.status(500).json({ 
      success: false, 
      message: 'Помилка створення запиту на рахунок',
      error: error.message 
    });
  }
});

// Отримання списку запитів на рахунки
app.get('/api/invoice-requests', async (req, res) => {
  try {
    const { status, requesterId, taskId, showAll } = req.query;
    
    addLog(`📋 Loading invoice requests - showAll: ${showAll}`, 'info');
    
    let filter = {};
    if (status) filter.status = status;
    if (requesterId) filter.requesterId = requesterId;
    if (taskId) filter.taskId = taskId;
    
    // Якщо showAll не встановлено або false, показуємо тільки pending запити
    if (!showAll || showAll === 'false') {
      filter.status = 'pending';
      addLog('🔍 Filtering to pending requests only', 'info');
    } else {
      addLog('📋 Showing all requests (pending, completed, rejected)', 'info');
    }
    
    const requests = await InvoiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);
    
    addLog(`✅ Found ${requests.length} invoice requests`, 'success');
    
    res.json({ 
      success: true, 
      data: requests 
    });
    
  } catch (error) {
    addLog(`❌ Error loading invoice requests: ${error.message}`, 'error');
    res.status(500).json({ 
      success: false, 
      message: 'Помилка отримання запитів на рахунки',
      error: error.message 
    });
  }
});

// Отримання конкретного запиту на рахунок
app.get('/api/invoice-requests/:id', async (req, res) => {
  try {
    const request = await InvoiceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    res.json({ 
      success: true, 
      data: request 
    });
    
  } catch (error) {
    console.error('Помилка отримання запиту на рахунок:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка отримання запиту на рахунок',
      error: error.message 
    });
  }
});

// Оновлення статусу запиту на рахунок
app.put('/api/invoice-requests/:id', async (req, res) => {
  try {
    const { status, comments, rejectionReason } = req.body;
    
    const updateData = { status };
    
    if (status === 'processing') {
      updateData.processedAt = new Date();
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
    } else if (status === 'rejected') {
      updateData.rejectionReason = rejectionReason;
    }
    
    if (comments) {
      updateData.comments = comments;
    }
    
    const request = await InvoiceRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    // Оновлюємо статус рахунку в основній заявці
    try {
      const taskUpdateData = { invoiceStatus: status };
      
      // Автоматично встановлюємо дату завантаження рахунку, якщо статус змінився на 'completed' і дати ще немає
      if (status === 'completed') {
        const existingTask = await Task.findOne({ invoiceRequestId: req.params.id });
        if (existingTask && !existingTask.invoiceUploadDate) {
          taskUpdateData.invoiceUploadDate = new Date();
          console.log('[DEBUG] PUT /api/invoice-requests/:id - автоматично встановлено invoiceUploadDate');
        }
      }
      
      await Task.findOneAndUpdate(
        { invoiceRequestId: req.params.id },
        taskUpdateData,
        { new: true }
      );
      console.log('[DEBUG] PUT /api/invoice-requests/:id - оновлено invoiceStatus в заявці:', status);
    } catch (taskUpdateError) {
      console.error('[ERROR] PUT /api/invoice-requests/:id - помилка оновлення заявки:', taskUpdateError);
    }
    
    // Відправляємо сповіщення користувачу про зміну статусу
    if (status === 'completed') {
      try {
        const telegramService = new TelegramNotificationService();
        await telegramService.sendNotification('invoice_completed', {
          taskId: request.taskId,
          requesterId: request.requesterId,
          companyName: request.companyDetails.companyName
        });
      } catch (notificationError) {
        console.error('Помилка відправки сповіщення:', notificationError);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Статус запиту на рахунок оновлено',
      data: request 
    });
    
  } catch (error) {
    console.error('Помилка оновлення запиту на рахунок:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка оновлення запиту на рахунок',
      error: error.message 
    });
  }
});

// Завантаження файлу рахунку
app.post('/api/invoice-requests/:id/upload', upload.single('invoiceFile'), async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload - запит отримано для ID:', req.params.id);
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload - req.file:', req.file);
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload - req.body:', req.body);
    
    const request = await InvoiceRequest.findById(req.params.id);
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload - знайдено запит:', request ? 'YES' : 'NO');
    
    if (!request) {
      console.log('[ERROR] POST /api/invoice-requests/:id/upload - запит не знайдено:', req.params.id);
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload - знайдено запит:', {
      id: request._id,
      taskId: request.taskId,
      status: request.status,
      needInvoice: request.needInvoice
    });
    
    // Перевіряємо чи є файл в запиті
    if (!req.file) {
      console.log('[ERROR] POST /api/invoice-requests/:id/upload - файл не надано');
      return res.status(400).json({ 
        success: false, 
        message: 'Файл не був завантажений' 
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload - файл отримано:', {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });
    
    // Діагностика Cloudinary URL
    console.log('[CLOUDINARY DEBUG] req.file.path (Cloudinary URL):', req.file.path);
    console.log('[CLOUDINARY DEBUG] req.file.secure_url:', req.file.secure_url);
    console.log('[CLOUDINARY DEBUG] req.file.public_id:', req.file.public_id);
    
    // Оновлюємо запит з інформацією про файл
    // Виправляємо кодування назви файлу
    let fileName = req.file.originalname;
    try {
      // Спробуємо декодувати як UTF-8 з latin1
      const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
      // Перевіряємо чи декодування дало зміст
      if (decoded && decoded !== fileName && !decoded.includes('')) {
        fileName = decoded;
      } else {
        // Спробуємо інший метод
        fileName = decodeURIComponent(escape(fileName));
      }
    } catch (error) {
      // Якщо не вдалося, залишаємо оригінальну назву
      console.log('Не вдалося декодувати назву файлу:', error);
    }
    
    const updatedRequest = await InvoiceRequest.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'completed',
        completedAt: new Date(),
        invoiceFile: req.file.path, // Cloudinary URL
        invoiceFileName: fileName,
        invoiceNumber: req.body.invoiceNumber || ''
      },
      { new: true }
    );
    
    // Оновлюємо статус рахунку в основній заявці
    try {
      // Спочатку шукаємо по invoiceRequestId
      const taskUpdateData = { 
        invoiceFile: updatedRequest.invoiceFile,
        invoiceFileName: updatedRequest.invoiceFileName,
        invoiceNumber: updatedRequest.invoiceNumber
      };
      
      // Автоматично встановлюємо дату завантаження рахунку, якщо її ще немає
      const existingTask = await Task.findOne({ invoiceRequestId: req.params.id });
      if (existingTask && !existingTask.invoiceUploadDate) {
        taskUpdateData.invoiceUploadDate = new Date();
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload - автоматично встановлено invoiceUploadDate');
      }
      
      let updatedTask = await Task.findOneAndUpdate(
        { invoiceRequestId: req.params.id },
        taskUpdateData,
        { new: true }
      );
      
      // Якщо не знайшли по invoiceRequestId, шукаємо по taskId
      if (!updatedTask) {
        const taskUpdateDataByTaskId = { 
          invoiceFile: updatedRequest.invoiceFile,
          invoiceFileName: updatedRequest.invoiceFileName,
          invoiceNumber: updatedRequest.invoiceNumber,
          invoiceRequestId: req.params.id // Додаємо invoiceRequestId для майбутніх запитів
        };
        
        // Автоматично встановлюємо дату завантаження рахунку, якщо її ще немає
        const existingTaskByTaskId = await Task.findById(updatedRequest.taskId);
        if (existingTaskByTaskId && !existingTaskByTaskId.invoiceUploadDate) {
          taskUpdateDataByTaskId.invoiceUploadDate = new Date();
          console.log('[DEBUG] POST /api/invoice-requests/:id/upload - автоматично встановлено invoiceUploadDate (по taskId)');
        }
        
        updatedTask = await Task.findOneAndUpdate(
          { _id: updatedRequest.taskId },
          taskUpdateDataByTaskId,
          { new: true }
        );
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload - оновлено заявку по taskId:', updatedRequest.taskId);
      } else {
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload - оновлено заявку по invoiceRequestId:', req.params.id);
      }
      
      if (updatedTask) {
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload - оновлено заявку:', {
          taskId: updatedTask._id,
          invoiceStatus: updatedTask.invoiceStatus,
          invoiceFile: updatedTask.invoiceFile,
          invoiceFileName: updatedTask.invoiceFileName,
          invoiceRequestId: updatedTask.invoiceRequestId
        });
      } else {
        console.log('[WARNING] POST /api/invoice-requests/:id/upload - заявка не знайдена для оновлення');
      }
    } catch (taskUpdateError) {
      console.error('[ERROR] POST /api/invoice-requests/:id/upload - помилка оновлення заявки:', taskUpdateError);
    }
    
    res.json({ 
      success: true, 
      message: 'Файл рахунку завантажено успішно',
      data: {
        invoiceFile: updatedRequest.invoiceFile,
        invoiceFileName: updatedRequest.invoiceFileName,
        invoiceNumber: updatedRequest.invoiceNumber
      }
    });
    
  } catch (error) {
    console.error('Помилка завантаження файлу рахунку:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка завантаження файлу рахунку',
      error: error.message 
    });
  }
});

// Завантаження файлу акту виконаних робіт
app.post('/api/invoice-requests/:id/upload-act', upload.single('actFile'), async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - запит отримано для ID:', req.params.id);
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - req.file:', req.file);
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - req.body:', req.body);
    
    const request = await InvoiceRequest.findById(req.params.id);
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - знайдено запит:', request ? 'YES' : 'NO');
    
    if (!request) {
      console.log('[ERROR] POST /api/invoice-requests/:id/upload-act - запит не знайдено:', req.params.id);
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено'
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - знайдено запит:', {
      id: request._id,
      taskId: request.taskId,
      status: request.status,
      needAct: request.needAct
    });
    
    // Перевіряємо чи є файл в запиті
    if (!req.file) {
      console.log('[ERROR] POST /api/invoice-requests/:id/upload-act - файл не надано');
      return res.status(400).json({ 
        success: false, 
        message: 'Файл не був завантажений' 
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - файл отримано:', {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });
    
    // Діагностика Cloudinary URL для акту
    console.log('[CLOUDINARY DEBUG] req.file.path (Cloudinary URL) для акту:', req.file.path);
    console.log('[CLOUDINARY DEBUG] req.file.secure_url для акту:', req.file.secure_url);
    console.log('[CLOUDINARY DEBUG] req.file.public_id для акту:', req.file.public_id);
    
    // Виправляємо кодування назви файлу
    let fileName = req.file.originalname;
    try {
      // Спробуємо декодувати як UTF-8 з latin1
      const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
      // Перевіряємо чи декодування дало зміст
      if (decoded && decoded !== fileName && !decoded.includes('')) {
        fileName = decoded;
      } else {
        // Спробуємо інший метод
        fileName = decodeURIComponent(escape(fileName));
      }
    } catch (error) {
      // Якщо не вдалося, залишаємо оригінальну назву
      console.log('Не вдалося декодувати назву файлу акту:', error);
    }
    
    const updatedRequest = await InvoiceRequest.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'completed',
        completedAt: new Date(),
        actFile: req.file.path, // Cloudinary URL
        actFileName: fileName
      },
      { new: true }
    );
    
    // Оновлюємо статус акту в основній заявці
    try {
      // Спочатку шукаємо по invoiceRequestId
      let updatedTask = await Task.findOneAndUpdate(
        { invoiceRequestId: req.params.id },
        { 
          actFile: updatedRequest.actFile,
          actFileName: updatedRequest.actFileName
        },
        { new: true }
      );
      
      // Якщо не знайшли по invoiceRequestId, шукаємо по taskId
      if (!updatedTask) {
        updatedTask = await Task.findOneAndUpdate(
          { _id: updatedRequest.taskId },
          { 
            actFile: updatedRequest.actFile,
            actFileName: updatedRequest.actFileName,
            invoiceRequestId: req.params.id // Додаємо invoiceRequestId для майбутніх запитів
          },
          { new: true }
        );
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - оновлено заявку по taskId:', updatedRequest.taskId);
      } else {
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - оновлено заявку по invoiceRequestId:', req.params.id);
      }
      
      if (updatedTask) {
        console.log('[DEBUG] POST /api/invoice-requests/:id/upload-act - оновлено заявку:', {
          taskId: updatedTask._id,
          actStatus: updatedTask.actStatus,
          actFile: updatedTask.actFile,
          actFileName: updatedTask.actFileName,
          invoiceRequestId: updatedTask.invoiceRequestId
        });
      } else {
        console.log('[WARNING] POST /api/invoice-requests/:id/upload-act - заявка не знайдена для оновлення');
      }
    } catch (taskUpdateError) {
      console.error('[ERROR] POST /api/invoice-requests/:id/upload-act - помилка оновлення заявки:', taskUpdateError);
    }
    
    res.json({ 
      success: true, 
      message: 'Файл акту виконаних робіт завантажено успішно',
      data: {
        actFile: updatedRequest.actFile,
        actFileName: updatedRequest.actFileName
      }
    });
  } catch (error) {
    console.error('Помилка завантаження файлу акту:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка завантаження файлу акту',
      error: error.message 
    });
  }
}, (error, req, res, next) => {
  // Обробка помилок multer
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Файл занадто великий. Максимальний розмір: 20MB'
      });
    }
  }
  
  if (error.message.includes('Непідтримуваний тип файлу')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  console.error('Помилка multer:', error);
  res.status(500).json({
    success: false,
    message: 'Помилка завантаження файлу',
    error: error.message
  });
});

// Завантаження файлу рахунку
app.get('/api/invoice-requests/:id/download', async (req, res) => {
  try {
    const request = await InvoiceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    if (!request.invoiceFile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Файл рахунку не знайдено' 
      });
    }
    
    // Тут буде логіка завантаження файлу з Cloudinary
    // Поки що просто повертаємо URL
    res.json({ 
      success: true, 
      data: {
        fileUrl: request.invoiceFile,
        fileName: request.invoiceFileName
      }
    });
    
  } catch (error) {
    console.error('Помилка завантаження файлу рахунку:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка завантаження файлу рахунку',
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

    // Визначаємо, хто створив заявку
    // Для task_created використовуємо user (той, хто створює)
    // Для інших типів використовуємо поля з заявки
    let createdBy = 'Н/Д';
    if (type === 'task_created') {
      createdBy = user.name || user.login || 'Система';
    } else {
      // Шукаємо інформацію про автора в заявці
      createdBy = task.createdBy || task.authorName || task.engineer1 || task.author || user.name || user.login || 'Система';
    }

    const baseMessage = `
<b>🔔 Сповіщення про заявку</b>

📋 <b>Номер заявки:</b> ${task.requestNumber || 'Н/Д'}
👤 <b>Хто створив:</b> ${createdBy}
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
        return baseMessage + '\n✅ <b>✅ ВАША ЗАЯВКА ЗАТВЕРДЖЕНА ТА НАЧИСЛЕНА ПРЕМІЯ ЗА ВИКОНАНУ ЗАЯВКУ</b>\n\n🎉 <b>Заявка готова до оплати</b>';
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

  // Метод для відправки сповіщень про запити на рахунки
  async sendNotification(type, data) {
    try {
      let message = '';
      
      switch (type) {
        case 'invoice_requested':
          message = `📄 <b>Новий запит на рахунок</b>\n\n` +
                   `🏢 <b>Компанія:</b> ${data.companyName}\n` +
                   `🏛️ <b>ЄДРПОУ:</b> ${data.edrpou}\n` +
                   `👤 <b>Запитувач:</b> ${data.requesterName}\n` +
                   `📋 <b>ID заявки:</b> ${data.taskId}\n\n` +
                   `⏳ <b>Очікує обробки бухгалтером</b>`;
          break;
          
        case 'invoice_completed':
          message = `✅ <b>Рахунок готовий</b>\n\n` +
                   `🏢 <b>Компанія:</b> ${data.companyName}\n` +
                   `📋 <b>ID заявки:</b> ${data.taskId}\n` +
                   `👤 <b>Для користувача:</b> ${data.requesterId}\n\n` +
                   `📥 <b>Файл рахунку завантажено</b>\n` +
                   `💡 <b>Можете завантажити файл в системі</b>`;
          break;
          
        default:
          console.log(`[DEBUG] Unknown notification type: ${type}`);
          return false;
      }
      
      // Отримуємо chat IDs для бухгалтерів
      const globalSettings = await GlobalNotificationSettings.findOne();
      const chatIds = [];
      
      if (globalSettings?.settings?.[type]) {
        const userIds = globalSettings.settings[type];
        if (userIds && userIds.length > 0) {
          const users = await User.find({ login: { $in: userIds } });
          const userChatIds = users
            .filter(user => user.telegramChatId && user.telegramChatId.trim())
            .map(user => user.telegramChatId);
          chatIds.push(...userChatIds);
        }
      }
      
      // Відправляємо повідомлення
      for (const chatId of chatIds) {
        await this.sendMessage(chatId, message);
      }
      
      return true;
    } catch (error) {
      console.error('Помилка відправки сповіщення:', error);
      return false;
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

// API для ініціалізації налаштувань сповіщень
app.post('/api/notification-settings/init', async (req, res) => {
  try {
    addLog('🔧 Initializing notification settings for all users', 'info');
    
    // Отримуємо всіх користувачів
    const users = await User.find({});
    let initializedCount = 0;
    
    for (const user of users) {
      // Ініціалізуємо налаштування сповіщень для користувача, якщо їх немає
      if (!user.notificationSettings) {
        user.notificationSettings = {
          newRequests: false,
          pendingApproval: false,
          accountantApproval: false,
          approvedRequests: false,
          rejectedRequests: false,
          invoiceRequests: false,
          completedInvoices: false,
          systemNotifications: false
        };
        
        await user.save();
        initializedCount++;
        addLog(`✅ Initialized notification settings for user: ${user.login}`, 'info');
      }
    }
    
    addLog(`🎯 Initialized notification settings for ${initializedCount} users`, 'success');
    
    res.json({
      success: true,
      message: `Ініціалізовано налаштувань для ${initializedCount} користувачів`,
      initializedCount
    });
  } catch (error) {
    addLog(`❌ Error initializing notification settings: ${error.message}`, 'error');
    console.error('[ERROR] POST /api/notification-settings/init - помилка:', error);
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

// Тестовий endpoint для перевірки
app.get('/api/test-telegram', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/test-telegram - тестовий endpoint');
    console.log('[DEBUG] Request headers:', req.headers);
    res.json({ 
      message: 'Test endpoint працює', 
      timestamp: new Date().toISOString(),
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']
    });
  } catch (error) {
    console.error('[ERROR] GET /api/test-telegram - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання користувачів з Telegram Chat ID для сповіщень
app.get('/api/users/with-telegram', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/users/with-telegram - отримано запит');
    console.log('[DEBUG] FALLBACK_MODE:', FALLBACK_MODE);
    
    if (FALLBACK_MODE) {
      console.log('[DEBUG] GET /api/users/with-telegram - FALLBACK_MODE активний, повертаємо порожній масив');
      return res.json([]);
    }
    
    const users = await executeWithRetry(() => 
      User.find(
        { 
          telegramChatId: { $exists: true, $ne: null, $ne: '' },
          telegramChatId: { $ne: 'Chat ID' }
        },
        'login name role region telegramChatId'
      )
    );
    
    console.log(`[DEBUG] GET /api/users/with-telegram - знайдено ${users.length} користувачів з Telegram Chat ID`);
    console.log('[DEBUG] Користувачі:', users.map(u => ({ login: u.login, telegramChatId: u.telegramChatId })));
    
    res.json(users);
  } catch (error) {
    console.error('[ERROR] GET /api/users/with-telegram - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для отримання списку користувачів
app.get('/api/users', async (req, res) => {
  try {
    addLog('📋 Loading users list', 'info');
    const users = await executeWithRetry(() => User.find({}, 'login password name role region telegramChatId notificationSettings'));
    addLog(`✅ Found ${users.length} users`, 'success');
    res.json(users);
  } catch (error) {
    addLog(`❌ Error loading users: ${error.message}`, 'error');
    console.error('[ERROR] GET /api/users - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// API для оновлення активності користувача
app.post('/api/users/activity', async (req, res) => {
  try {
    const { login } = req.body;
    if (!login) {
      console.log('[DEBUG] POST /api/users/activity - login відсутній');
      return res.status(400).json({ error: 'Login is required' });
    }

    const now = new Date();
    console.log('[DEBUG] POST /api/users/activity - оновлюємо активність для:', login, 'час:', now);

    // Оновлюємо час останньої активності в базі даних
    const result = await User.updateOne(
      { login: login },
      { lastActivity: now }
    );

    console.log('[DEBUG] POST /api/users/activity - результат оновлення:', result);

    res.json({ success: true, lastActivity: now });
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

// ===== API ENDPOINTS ДЛЯ ДЕБАГУ СПОВІЩЕНЬ =====

// Підключаємо дебагер сповіщень
const NotificationDebugger = require('./notification-debugger');
const notificationDebugger = new NotificationDebugger();

// GET /api/notifications/debug/analyze-users - аналіз налаштувань користувачів
app.get('/api/notifications/debug/analyze-users', async (req, res) => {
  try {
    addLog('🔍 Аналіз налаштувань користувачів для сповіщень', 'info');
    
    const analysis = await notificationDebugger.analyzeUserSettings();
    
    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    addLog(`❌ Помилка аналізу користувачів: ${error.message}`, 'error');
    console.error('[ERROR] GET /api/notifications/debug/analyze-users - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/notifications/debug/simulate - симуляція відправки сповіщення
app.post('/api/notifications/debug/simulate', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (!type) {
      return res.status(400).json({ 
        success: false, 
        error: 'type is required' 
      });
    }
    
    addLog(`🧪 Симуляція сповіщення типу: ${type}`, 'info');
    
    const result = await notificationDebugger.simulateNotification(type, data || {});
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    addLog(`❌ Помилка симуляції сповіщення: ${error.message}`, 'error');
    console.error('[ERROR] POST /api/notifications/debug/simulate - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/notifications/debug/logs - аналіз логів сповіщень
app.get('/api/notifications/debug/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    addLog(`📊 Аналіз логів сповіщень (останні ${limit})`, 'info');
    
    const analysis = await notificationDebugger.analyzeNotificationLogs(limit);
    
    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    addLog(`❌ Помилка аналізу логів: ${error.message}`, 'error');
    console.error('[ERROR] GET /api/notifications/debug/logs - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/notifications/debug/test-user - тест сповіщення для конкретного користувача
app.post('/api/notifications/debug/test-user', async (req, res) => {
  try {
    const { userLogin, message } = req.body;
    
    if (!userLogin) {
      return res.status(400).json({ 
        success: false, 
        error: 'userLogin is required' 
      });
    }
    
    addLog(`🧪 Тест сповіщення для користувача: ${userLogin}`, 'info');
    
    const result = await notificationDebugger.testUserNotification(userLogin, message);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    addLog(`❌ Помилка тестування користувача: ${error.message}`, 'error');
    console.error('[ERROR] POST /api/notifications/debug/test-user - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/notifications/debug/report - генерація повного звіту
app.get('/api/notifications/debug/report', async (req, res) => {
  try {
    addLog('📊 Генерація звіту про стан системи сповіщень', 'info');
    
    const report = await notificationDebugger.generateSystemReport();
    
    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    addLog(`❌ Помилка генерації звіту: ${error.message}`, 'error');
    console.error('[ERROR] GET /api/notifications/debug/report - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE /api/invoice-requests/:id - видалити запит на рахунок
app.delete('/api/invoice-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    addLog(`🗑️ Deleting invoice request: ${id}`, 'info');
    
    const request = await InvoiceRequest.findById(id);
    if (!request) {
      addLog(`❌ Invoice request not found: ${id}`, 'error');
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    // Видаляємо файли з Cloudinary, якщо вони є
    if (request.invoiceFile) {
      try {
        const publicId = request.invoiceFile.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
        addLog(`✅ Invoice file deleted from Cloudinary: ${publicId}`, 'info');
      } catch (cloudinaryError) {
        addLog(`⚠️ Failed to delete invoice file from Cloudinary: ${cloudinaryError.message}`, 'warning');
      }
    }
    
    if (request.actFile) {
      try {
        const publicId = request.actFile.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
        addLog(`✅ Act file deleted from Cloudinary: ${publicId}`, 'info');
      } catch (cloudinaryError) {
        addLog(`⚠️ Failed to delete act file from Cloudinary: ${cloudinaryError.message}`, 'warning');
      }
    }
    
    // Видаляємо запит з бази даних
    await InvoiceRequest.findByIdAndDelete(id);
    
    addLog(`✅ Invoice request deleted: ${id}`, 'success');
    
    res.json({ 
      success: true, 
      message: 'Запит на рахунок успішно видалено' 
    });
    
  } catch (error) {
    addLog(`❌ Error deleting invoice request: ${error.message}`, 'error');
    res.status(500).json({ 
      success: false, 
      message: 'Помилка видалення запиту на рахунок',
      error: error.message 
    });
  }
});

// DELETE /api/invoice-requests/:id/file - видалити файл рахунку
app.delete('/api/invoice-requests/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    
    const request = await InvoiceRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит не знайдено' });
    }
    
    if (!request.invoiceFile) {
      return res.status(400).json({ success: false, message: 'Файл не знайдено' });
    }
    
    // Видаляємо файл з Cloudinary
    if (request.invoiceFile) {
      try {
        console.log('[DEBUG] Видаляємо файл рахунку з Cloudinary:', request.invoiceFile);
        
        // Витягуємо public_id з Cloudinary URL
        const urlParts = request.invoiceFile.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const publicId = fileName.split('.')[0];
        
        console.log('[DEBUG] Витягнуто public_id для видалення:', publicId);
        
        // Видаляємо файл з Cloudinary
        const result = await cloudinary.uploader.destroy(`darex-trading-solutions/invoices/${publicId}`);
        console.log('[DEBUG] Результат видалення з Cloudinary:', result);
        
      } catch (cloudinaryError) {
        console.error('Помилка видалення файлу з Cloudinary:', cloudinaryError);
        // Продовжуємо навіть якщо не вдалося видалити з Cloudinary
      }
    }
    
    // Оновлюємо запит - видаляємо посилання на файл
    await InvoiceRequest.findByIdAndUpdate(id, {
      $unset: { invoiceFile: 1, invoiceFileName: 1, invoiceNumber: 1 }
    });
    
    // Також оновлюємо Task документ
    try {
      await Task.findOneAndUpdate(
        { invoiceRequestId: id },
        { 
          $unset: { invoiceFile: 1, invoiceFileName: 1, invoiceNumber: 1 },
          invoiceStatus: 'pending'
        }
      );
      
      // Якщо не знайдено по invoiceRequestId, шукаємо по taskId
      if (!request.taskId) {
        await Task.findOneAndUpdate(
          { _id: request.taskId },
          { 
            $unset: { invoiceFile: 1, invoiceFileName: 1, invoiceNumber: 1 },
            invoiceStatus: 'pending'
          }
        );
      }
    } catch (taskUpdateError) {
      console.error('Помилка оновлення Task при видаленні файлу рахунку:', taskUpdateError);
    }
    
    res.json({ success: true, message: 'Файл успішно видалено' });
    
  } catch (error) {
    console.error('Помилка видалення файлу рахунку:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка при видаленні файлу', 
      error: error.message 
    });
  }
});

// DELETE /api/invoice-requests/:id/act-file - видалити файл акту виконаних робіт
app.delete('/api/invoice-requests/:id/act-file', async (req, res) => {
  try {
    const { id } = req.params;
    
    const request = await InvoiceRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит не знайдено' });
    }
    
    if (!request.actFile) {
      return res.status(400).json({ success: false, message: 'Файл акту не знайдено' });
    }
    
    // Видаляємо файл з Cloudinary
    if (request.actFile) {
      try {
        console.log('[DEBUG] Видаляємо файл акту з Cloudinary:', request.actFile);
        
        // Витягуємо public_id з Cloudinary URL
        const urlParts = request.actFile.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const publicId = fileName.split('.')[0];
        
        console.log('[DEBUG] Витягнуто public_id для видалення акту:', publicId);
        
        // Видаляємо файл з Cloudinary
        const result = await cloudinary.uploader.destroy(`darex-trading-solutions/acts/${publicId}`);
        console.log('[DEBUG] Результат видалення акту з Cloudinary:', result);
        
      } catch (cloudinaryError) {
        console.error('Помилка видалення файлу акту з Cloudinary:', cloudinaryError);
        // Продовжуємо навіть якщо не вдалося видалити з Cloudinary
      }
    }
    
    // Оновлюємо запит - видаляємо посилання на файл акту
    await InvoiceRequest.findByIdAndUpdate(id, {
      $unset: { actFile: 1, actFileName: 1 }
    });
    
    // Також оновлюємо Task документ
    try {
      await Task.findOneAndUpdate(
        { invoiceRequestId: id },
        { 
          $unset: { actFile: 1, actFileName: 1 },
          actStatus: 'pending'
        }
      );
      
      // Якщо не знайдено по invoiceRequestId, шукаємо по taskId
      if (!request.taskId) {
        await Task.findOneAndUpdate(
          { _id: request.taskId },
          { 
            $unset: { actFile: 1, actFileName: 1 },
            actStatus: 'pending'
          }
        );
      }
    } catch (taskUpdateError) {
      console.error('Помилка оновлення Task при видаленні файлу акту:', taskUpdateError);
    }
    
    res.json({ success: true, message: 'Файл акту успішно видалено' });
    
  } catch (error) {
    console.error('Помилка видалення файлу акту:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка при видаленні файлу акту', 
      error: error.message 
    });
  }
});

// API endpoint для бухгалтерських звітів
app.get('/api/reports/financial', async (req, res) => {
  try {
    const { dateFrom, dateTo, region, detailed, format } = req.query;
    
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Відсутні обов\'язкові параметри: dateFrom, dateTo' 
      });
    }
    
    // Фільтруємо заявки
    let filter = {
      status: 'Виконано',
      date: { $gte: dateFrom, $lte: dateTo }
    };
    
    if (region && region !== 'all') {
      filter.serviceRegion = region;
    }
    
    const tasks = await Task.find(filter);
    
    // Групуємо по регіонах
    const regionGroups = {};
    tasks.forEach(task => {
      const region = task.serviceRegion || 'Невідомо';
      if (!regionGroups[region]) {
        regionGroups[region] = [];
      }
      regionGroups[region].push(task);
    });
    
    // Обчислюємо суми для кожного регіону
    const reportData = Object.keys(regionGroups).map(region => {
      const regionTasks = regionGroups[region];
      
      const totalServiceSum = regionTasks.reduce((sum, task) => {
        return sum + (parseFloat(task.serviceTotal) || 0);
      }, 0);
      
      const totalWorkCost = regionTasks.reduce((sum, task) => {
        return sum + (parseFloat(task.workPrice) || 0);
      }, 0);
      
      const invoicedSum = regionTasks
        .filter(task => task.invoice && task.invoice.trim())
        .reduce((sum, task) => {
          return sum + (parseFloat(task.serviceTotal) || 0);
        }, 0);
      
      const paidSum = regionTasks
        .filter(task => task.paymentDate && task.paymentDate.trim())
        .reduce((sum, task) => {
          return sum + (parseFloat(task.serviceTotal) || 0);
        }, 0);
      
      return {
        region,
        totalServiceSum,
        totalWorkCost,
        invoicedSum,
        paidSum,
        tasks: detailed ? regionTasks : []
      };
    });
    
    // Загальні підсумки
    const totalServiceSum = reportData.reduce((sum, item) => sum + item.totalServiceSum, 0);
    const totalWorkCost = reportData.reduce((sum, item) => sum + item.totalWorkCost, 0);
    const totalInvoicedSum = reportData.reduce((sum, item) => sum + item.invoicedSum, 0);
    const totalPaidSum = reportData.reduce((sum, item) => sum + item.paidSum, 0);
    
    // Заявки без рахунків
    const tasksWithoutInvoice = tasks.filter(task => !task.invoice || !task.invoice.trim());
    
    // Заявки без оплати
    const tasksWithoutPayment = tasks.filter(task => !task.paymentDate || !task.paymentDate.trim());
    
    if (format === 'excel') {
      try {
        // Генеруємо Excel файл
        const XLSX = require('xlsx-js-style');
        
        const workbook = XLSX.utils.book_new();
      
      // Основний звіт
      const mainData = [
        ['Регіон', 'Загальна сума послуги', 'Вартість робіт, грн', 'Сума виставлених рахунків', 'Сума оплат'],
        ...reportData.map(item => [
          item.region,
          item.totalServiceSum,
          item.totalWorkCost,
          item.invoicedSum,
          item.paidSum
        ]),
        ['ПІДСУМОК', totalServiceSum, totalWorkCost, totalInvoicedSum, totalPaidSum]
      ];
      
      const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
      XLSX.utils.book_append_sheet(workbook, mainSheet, 'Звіт по фінансах');
      
      // Деталізація якщо потрібна
      if (detailed === 'true') {
        const detailData = [
          ['Регіон', 'Номер заявки', 'Дата проведення робіт', 'Замовник', 'Вид оплати', 'Номер рахунку', 'Вартість робіт, грн', 'Загальна сума послуги', 'Дата оплати']
        ];
        
        tasks.forEach(task => {
          detailData.push([
            task.serviceRegion || 'Невідомо',
            task.requestNumber || 'Н/Д',
            task.date || '',
            task.client || '',
            task.paymentType || '',
            task.invoice || '',
            task.workPrice || 0,
            task.serviceTotal || 0,
            task.paymentDate || ''
          ]);
        });
        
        const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
        XLSX.utils.book_append_sheet(workbook, detailSheet, 'Деталізація');
      }
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="financial_report_${dateFrom}_${dateTo}.xlsx"`);
        res.send(buffer);
      } catch (excelError) {
        console.error('Помилка генерації Excel файлу:', excelError);
        res.status(500).json({ 
          success: false, 
          message: 'Помилка генерації Excel файлу',
          error: excelError.message 
        });
        return;
      }
      
    } else {
      // HTML звіт
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Звіт по руху фінансів</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .filters { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .summary { background-color: #e9ecef; font-weight: bold; }
            .section { margin-bottom: 30px; }
            .section h3 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Звіт по руху фінансів</h1>
            <p>Період: ${dateFrom} - ${dateTo}</p>
            <p>Дата створення: ${new Date().toLocaleDateString('uk-UA')}</p>
            <p>Регіони: ${region === 'all' ? 'Всі регіони' : region}</p>
          </div>
          
          <div class="section">
            <h3>Основні показники по регіонах</h3>
            <table>
              <thead>
                <tr>
                  <th>Регіон</th>
                  <th>Загальна сума послуги</th>
                  <th>Вартість робіт, грн</th>
                  <th>Сума виставлених рахунків</th>
                  <th>Сума оплат</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.map(item => `
                  <tr>
                    <td>${item.region}</td>
                    <td>${item.totalServiceSum.toFixed(2)}</td>
                    <td>${item.totalWorkCost.toFixed(2)}</td>
                    <td>${item.invoicedSum.toFixed(2)}</td>
                    <td>${item.paidSum.toFixed(2)}</td>
                  </tr>
                `).join('')}
                <tr class="summary">
                  <td><strong>ПІДСУМОК</strong></td>
                  <td><strong>${totalServiceSum.toFixed(2)}</strong></td>
                  <td><strong>${totalWorkCost.toFixed(2)}</strong></td>
                  <td><strong>${totalInvoicedSum.toFixed(2)}</strong></td>
                  <td><strong>${totalPaidSum.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          
          ${detailed === 'true' ? `
            <div class="section">
              <h3>Деталізація по заявках</h3>
              ${Object.keys(regionGroups).map(region => `
                <h4 style="color: #007bff; margin-top: 20px; margin-bottom: 10px;">Регіон: ${region}</h4>
                <table style="margin-bottom: 20px;">
                  <thead>
                    <tr>
                      <th>Номер заявки</th>
                      <th>Дата проведення робіт</th>
                      <th>Замовник</th>
                      <th>Вид оплати</th>
                      <th>Номер рахунку</th>
                      <th>Вартість робіт, грн</th>
                      <th>Загальна сума послуги</th>
                      <th>Дата оплати</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${regionGroups[region].map(task => `
                      <tr>
                        <td>${task.requestNumber || 'Н/Д'}</td>
                        <td>${task.date || ''}</td>
                        <td>${task.client || ''}</td>
                        <td>${task.paymentType || ''}</td>
                        <td>${task.invoice || ''}</td>
                        <td>${(parseFloat(task.workPrice) || 0).toFixed(2)}</td>
                        <td>${(parseFloat(task.serviceTotal) || 0).toFixed(2)}</td>
                        <td>${task.paymentDate || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `).join('')}
            </div>
          ` : ''}
          
          <div class="section">
            <h3>Підсумкова інформація</h3>
            <p><strong>Кількість заявок які були виконані за період:</strong> ${tasks.length} шт. на загальну суму ${totalServiceSum.toFixed(2)} грн.</p>
            <p><strong>Кількість виставлених рахунків:</strong> ${tasks.filter(t => t.invoice && t.invoice.trim()).length} шт. на загальну суму ${totalInvoicedSum.toFixed(2)} грн.</p>
            <p><strong>Кількість оплат:</strong> ${tasks.filter(t => t.paymentDate && t.paymentDate.trim()).length} шт. на загальну суму ${totalPaidSum.toFixed(2)} грн.</p>
          </div>
          
          ${detailed === 'true' && tasksWithoutInvoice.length > 0 ? `
            <div class="section">
              <h3>Список заявок за які не виставили рахунки</h3>
              <table>
                <thead>
                  <tr>
                    <th>Номер заявки</th>
                    <th>Дата проведення робіт</th>
                    <th>Замовник</th>
                    <th>Вид оплати</th>
                    <th>Номер рахунку</th>
                    <th>Вартість робіт, грн</th>
                    <th>Загальна сума послуги</th>
                    <th>Дата оплати</th>
                  </tr>
                </thead>
                <tbody>
                  ${tasksWithoutInvoice.map(task => `
                    <tr>
                      <td>${task.requestNumber || 'Н/Д'}</td>
                      <td>${task.date || ''}</td>
                      <td>${task.client || ''}</td>
                      <td>${task.paymentType || ''}</td>
                      <td>${task.invoice || ''}</td>
                      <td>${(parseFloat(task.workPrice) || 0).toFixed(2)}</td>
                      <td>${(parseFloat(task.serviceTotal) || 0).toFixed(2)}</td>
                      <td>${task.paymentDate || ''}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
          
          ${detailed === 'true' && tasksWithoutPayment.length > 0 ? `
            <div class="section">
              <h3>Список заявок за які не оплачені</h3>
              <table>
                <thead>
                  <tr>
                    <th>Номер заявки</th>
                    <th>Дата проведення робіт</th>
                    <th>Замовник</th>
                    <th>Вид оплати</th>
                    <th>Номер рахунку</th>
                    <th>Вартість робіт, грн</th>
                    <th>Загальна сума послуги</th>
                    <th>Дата оплати</th>
                  </tr>
                </thead>
                <tbody>
                  ${tasksWithoutPayment.map(task => `
                    <tr>
                      <td>${task.requestNumber || 'Н/Д'}</td>
                      <td>${task.date || ''}</td>
                      <td>${task.client || ''}</td>
                      <td>${task.paymentType || ''}</td>
                      <td>${task.invoice || ''}</td>
                      <td>${(parseFloat(task.workPrice) || 0).toFixed(2)}</td>
                      <td>${(parseFloat(task.serviceTotal) || 0).toFixed(2)}</td>
                      <td>${task.paymentDate || ''}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }
    
  } catch (error) {
    console.error('Помилка генерації звіту:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка генерації звіту',
      error: error.message 
    });
  }
});

// Backend endpoint для звіту по персоналу видалено - використовуємо тільки frontend логіку

// === TIMESHEET API ENDPOINTS ===
// Зберегти timesheet дані
app.post('/api/timesheet', async (req, res) => {
  try {
    const { region, year, month, type = 'regular', data, payData, summary, createdBy } = req.body;
    
    if (!region || !year || !month) {
      return res.status(400).json({ 
        success: false, 
        error: 'Відсутні обов\'язкові поля: region, year, month' 
      });
    }
    
    // Перевіряємо чи існує запис (тепер по регіону, а не по userId)
    let timesheet = await Timesheet.findOne({ region, year: parseInt(year), month: parseInt(month), type });
    
    console.log('[TIMESHEET POST] Знайдено запис:', timesheet ? 'так' : 'ні', 'для регіону:', region, 'year:', year, 'month:', month);
    console.log('[TIMESHEET POST] Дані для збереження - data keys:', data ? Object.keys(data).length : 0, 'payData keys:', payData ? Object.keys(payData).length : 0);
    
    if (timesheet) {
      // Оновлюємо існуючий запис
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        // Конвертуємо об'єкт в Map
        const dataMap = new Map();
        Object.keys(data).forEach(key => {
          dataMap.set(key, data[key]);
        });
        timesheet.data = dataMap;
        console.log('[TIMESHEET POST] Оновлено data, ключів:', dataMap.size);
      }
      if (payData && typeof payData === 'object' && Object.keys(payData).length > 0) {
        const payDataMap = new Map();
        Object.keys(payData).forEach(key => {
          payDataMap.set(key, payData[key]);
        });
        timesheet.payData = payDataMap;
        console.log('[TIMESHEET POST] Оновлено payData, ключів:', payDataMap.size);
      }
      if (summary && typeof summary === 'object') {
        timesheet.summary = summary;
      }
      timesheet.updatedAt = new Date();
      if (createdBy) {
        timesheet.createdBy = createdBy;
      }
    } else {
      // Створюємо новий запис
      const dataMap = new Map();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        Object.keys(data).forEach(key => {
          dataMap.set(key, data[key]);
        });
      }
      
      const payDataMap = new Map();
      if (payData && typeof payData === 'object' && Object.keys(payData).length > 0) {
        Object.keys(payData).forEach(key => {
          payDataMap.set(key, payData[key]);
        });
      }
      
      timesheet = new Timesheet({
        region,
        year: parseInt(year),
        month: parseInt(month),
        type,
        data: dataMap,
        payData: payDataMap,
        summary: (summary && typeof summary === 'object') ? summary : {},
        createdBy: createdBy || 'unknown'
      });
      console.log('[TIMESHEET POST] Створено новий запис для регіону:', region);
    }
    
    const savedTimesheet = await timesheet.save();
    console.log('[TIMESHEET POST] Запис збережено, ID:', savedTimesheet._id, 'data keys:', savedTimesheet.data ? savedTimesheet.data.size : 0);
    
    // Конвертуємо Map назад в об'єкт для відповіді
    const responseData = {};
    if (timesheet.data) {
      timesheet.data.forEach((value, key) => {
        responseData[key] = value;
      });
    }
    
    const responsePayData = {};
    if (timesheet.payData) {
      timesheet.payData.forEach((value, key) => {
        responsePayData[key] = value;
      });
    }
    
    res.json({ 
      success: true, 
      timesheet: {
        region: timesheet.region,
        year: timesheet.year,
        month: timesheet.month,
        type: timesheet.type,
        data: responseData,
        payData: responsePayData,
        summary: timesheet.summary,
        createdBy: timesheet.createdBy,
        updatedAt: timesheet.updatedAt
      }
    });
  } catch (error) {
    console.error('[ERROR] POST /api/timesheet - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Отримати timesheet дані
app.get('/api/timesheet', async (req, res) => {
  try {
    const { region, year, month, type = 'regular' } = req.query;
    
    if (!region || !year || !month) {
      return res.status(400).json({ 
        success: false, 
        error: 'Відсутні обов\'язкові параметри: region, year, month' 
      });
    }
    
    const timesheet = await Timesheet.findOne({ 
      region, 
      year: parseInt(year), 
      month: parseInt(month), 
      type 
    });
    
    console.log('[TIMESHEET GET] Запит для регіону:', region, 'year:', year, 'month:', month);
    console.log('[TIMESHEET GET] Знайдено запис:', timesheet ? 'так' : 'ні');
    
    if (!timesheet) {
      console.log('[TIMESHEET GET] Запис не знайдено, повертаємо null');
      return res.json({ 
        success: true, 
        timesheet: null 
      });
    }
    
    console.log('[TIMESHEET GET] Запис знайдено, data keys:', timesheet.data ? timesheet.data.size : 0, 'payData keys:', timesheet.payData ? timesheet.payData.size : 0);
    
    // Конвертуємо Map назад в об'єкт
    const responseData = {};
    if (timesheet.data) {
      timesheet.data.forEach((value, key) => {
        responseData[key] = value;
      });
    }
    
    const responsePayData = {};
    if (timesheet.payData) {
      timesheet.payData.forEach((value, key) => {
        responsePayData[key] = value;
      });
    }
    
    res.json({ 
      success: true, 
      timesheet: {
        region: timesheet.region,
        year: timesheet.year,
        month: timesheet.month,
        type: timesheet.type,
        data: responseData,
        payData: responsePayData,
        summary: timesheet.summary,
        createdBy: timesheet.createdBy,
        updatedAt: timesheet.updatedAt
      }
    });
  } catch (error) {
    console.error('[ERROR] GET /api/timesheet - помилка:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});