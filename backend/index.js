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
const multer = require('multer');
const cloudinary = require('./config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const sharp = require('sharp');
const puppeteer = require('puppeteer');


// Додаємо імпорт роуту файлів
const filesRouter = require('./routes/files');

// Спрощена функція - повертаємо оригінальний PDF без конвертації
async function convertPdfToJpgServer(pdfBuffer, originalName) {
  try {
    console.log('[PDF-SERVER] ⚠️ PDF конвертація тимчасово відключена');
    console.log('[PDF-SERVER] Файл:', originalName, 'розмір:', pdfBuffer.length, 'байт');
    console.log('[PDF-SERVER] Повертаємо оригінальний PDF файл');
    
    // Повертаємо оригінальний PDF buffer
    return pdfBuffer;
    
  } catch (error) {
    console.error('[PDF-SERVER] Помилка обробки PDF:', error);
    throw error;
  }
}

// Налаштування multer для Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'darex-trading-solutions/invoices',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB ліміт
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


// Модель для запитів на рахунки
const invoiceRequestSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
  requestNumber: { type: String, required: true },
  requesterId: { type: String, required: true },
  requesterName: { type: String, required: true },
  companyDetails: {
    companyName: { type: String, required: true },
    edrpou: { type: String, required: true },
    address: { type: String, default: '' },
    bankDetails: { type: String, default: '' },
    comments: { type: String, default: '' }
  },
  needInvoice: { type: Boolean, default: true },
  needAct: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'rejected'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  completedAt: { type: Date },
  invoiceFile: { type: String, default: '' },
  invoiceFileName: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  actFile: { type: String, default: '' },
  actFileName: { type: String, default: '' },
  comments: { type: String, default: '' },
  rejectionReason: { type: String, default: '' }
});

const InvoiceRequest = mongoose.model('InvoiceRequest', invoiceRequestSchema);

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
taskSchema.index({ engineer3: 1 }); // Для пошуку по інженеру
taskSchema.index({ engineer4: 1 }); // Для пошуку по інженеру
taskSchema.index({ engineer5: 1 }); // Для пошуку по інженеру
taskSchema.index({ engineer6: 1 }); // Для пошуку по інженеру
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
  console.log(`[CORS] Headers:`, req.headers);
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
      // Перевіряємо чи заявка підтверджена складом та бухгалтером
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;

      // Якщо заявка підтверджена складом та бухгалтером, встановлюємо bonusApprovalDate
      if (isWarehouseApproved && isAccountantApproved && task.workPrice) {
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
        console.log(`[DEBUG] Пропущено заявку ${task._id}: не підтверджена складом та бухгалтером або немає workPrice`);
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

    // Знаходимо всі заявки, які підтверджені складом та бухгалтером, але не мають bonusApprovalDate
    const tasksToSync = await executeWithRetry(() =>
      Task.find({
        approvedByWarehouse: 'Підтверджено',
        approvedByAccountant: 'Підтверджено', 
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
      console.log('[DEBUG] POST /api/tasks - відправляємо сповіщення про нову заявку');
      console.log('[DEBUG] POST /api/tasks - savedTask.serviceRegion:', savedTask.serviceRegion);
      console.log('[DEBUG] POST /api/tasks - user:', user);
      await telegramService.sendNotification('new_requests', { 
        task: savedTask, 
        authorLogin: user.login 
      });
      console.log('[DEBUG] POST /api/tasks - сповіщення про нову заявку відправлено успішно');
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
    
    // Автоматично встановлюємо bonusApprovalDate, якщо заявка підтверджена складом та бухгалтером
    const isWarehouseApproved = updateData.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === 'Підтверджено';
    const isAccountantApproved = updateData.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === 'Підтверджено';
    
    if (isWarehouseApproved && isAccountantApproved && (updateData.workPrice || task.workPrice)) {
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
      
      // Зберігаємо старі значення для порівняння
      const oldStatus = task.status;
      const oldApprovedByWarehouse = task.approvedByWarehouse;
      const oldApprovedByAccountant = task.approvedByAccountant;
      const oldApprovedByRegionalManager = task.approvedByRegionalManager;
      
      console.log('[DEBUG] PUT /api/tasks/:id - старі значення:');
      console.log('[DEBUG] PUT /api/tasks/:id - oldStatus:', oldStatus);
      console.log('[DEBUG] PUT /api/tasks/:id - oldApprovedByWarehouse:', oldApprovedByWarehouse);
      console.log('[DEBUG] PUT /api/tasks/:id - oldApprovedByAccountant:', oldApprovedByAccountant);
      console.log('[DEBUG] PUT /api/tasks/:id - oldApprovedByRegionalManager:', oldApprovedByRegionalManager);
      
      // Перевіряємо зміну статусу на "Виконано" (тільки якщо статус реально змінився)
      const newStatus = updateData.status || updatedTask.status;
      const statusChangedToCompleted = (newStatus === 'Виконано') && 
                                      (oldStatus !== 'Виконано');
      
      console.log('[DEBUG] PUT /api/tasks/:id - перевірка зміни статусу на "Виконано":');
      console.log('[DEBUG] PUT /api/tasks/:id - newStatus:', newStatus);
      console.log('[DEBUG] PUT /api/tasks/:id - oldStatus:', oldStatus);
      console.log('[DEBUG] PUT /api/tasks/:id - statusChangedToCompleted:', statusChangedToCompleted);
      console.log('[DEBUG] PUT /api/tasks/:id - updateData.status:', updateData.status);
      console.log('[DEBUG] PUT /api/tasks/:id - updatedTask.status:', updatedTask.status);
      
      if (statusChangedToCompleted) {
        console.log('[DEBUG] PUT /api/tasks/:id - статус змінився на "Виконано", відправляємо pending_approval сповіщення');
        await telegramService.sendNotification('pending_approval', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      } 
      // Перевіряємо зміну підтвердження складом (тільки якщо реально змінилося)
      else if (updateData.approvedByWarehouse === 'Підтверджено' && oldApprovedByWarehouse !== 'Підтверджено') {
        console.log('[DEBUG] PUT /api/tasks/:id - склад підтвердив, відправляємо accountant_approval сповіщення');
        await telegramService.sendNotification('accountant_approval', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      }
      // Перевіряємо зміну підтвердження бухгалтером (тільки якщо реально змінилося)
      else if (updateData.approvedByAccountant === 'Підтверджено' && oldApprovedByAccountant !== 'Підтверджено') {
        console.log('[DEBUG] PUT /api/tasks/:id - бухгалтер підтвердив, відправляємо approved_requests сповіщення');
        await telegramService.sendNotification('approved_requests', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      }
      // Перевіряємо зміну підтвердження регіональним керівником (тільки якщо реально змінилося)
      else if (updateData.approvedByRegionalManager === 'Підтверджено' && oldApprovedByRegionalManager !== 'Підтверджено') {
        console.log('[DEBUG] PUT /api/tasks/:id - регіональний керівник підтвердив, відправляємо approved_requests сповіщення');
        await telegramService.sendNotification('approved_requests', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      }
      // Перевіряємо відхилення складом (тільки якщо реально змінилося)
      else if (updateData.approvedByWarehouse === 'Відхилено' && oldApprovedByWarehouse !== 'Відхилено') {
        console.log('[DEBUG] PUT /api/tasks/:id - склад відхилив, відправляємо rejected_requests сповіщення');
        await telegramService.sendNotification('rejected_requests', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      }
      // Перевіряємо відхилення бухгалтером (тільки якщо реально змінилося)
      else if (updateData.approvedByAccountant === 'Відхилено' && oldApprovedByAccountant !== 'Відхилено') {
        console.log('[DEBUG] PUT /api/tasks/:id - бухгалтер відхилив, відправляємо rejected_requests сповіщення');
        await telegramService.sendNotification('rejected_requests', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      }
      // Перевіряємо відхилення регіональним керівником (тільки якщо реально змінилося)
      else if (updateData.approvedByRegionalManager === 'Відхилено' && oldApprovedByRegionalManager !== 'Відхилено') {
        console.log('[DEBUG] PUT /api/tasks/:id - регіональний керівник відхилив, відправляємо rejected_requests сповіщення');
        await telegramService.sendNotification('rejected_requests', { 
          task: updatedTask, 
          authorLogin: user.login 
        });
      } else {
        console.log('[DEBUG] PUT /api/tasks/:id - немає змін, що потребують сповіщення');
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

// --- PDF CONVERSION TEST API ---
app.get('/api/test-pdf-conversion', async (req, res) => {
  try {
    console.log('[PDF-TEST] Тестуємо PDF конвертацію...');
    
    // Перевіряємо чи Puppeteer доступний
    const puppeteer = require('puppeteer');
    console.log('[PDF-TEST] Puppeteer завантажено:', !!puppeteer);
    
    // Створюємо простий PDF для тесту
    const testPdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Test PDF) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
297
%%EOF`;

    const tempPdfPath = path.join(__dirname, 'temp', `test_${Date.now()}.pdf`);
    const tempDir = path.dirname(tempPdfPath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempPdfPath, testPdfContent);
    console.log('[PDF-TEST] Тестовий PDF створено:', tempPdfPath);
    
    // Тестуємо Puppeteer
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      console.log('[PDF-TEST] Puppeteer запущено успішно');
      
      const page = await browser.newPage();
      console.log('[PDF-TEST] Нова сторінка створена');
      
      const pdfUrl = `file://${tempPdfPath}`;
      await page.goto(pdfUrl, { waitUntil: 'networkidle0' });
      console.log('[PDF-TEST] PDF відкрито в браузері');
      
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: true
      });
      console.log('[PDF-TEST] Скріншот створено, розмір:', screenshot.length);
      
      await browser.close();
      
      // Очищаємо тестовий файл
      fs.unlinkSync(tempPdfPath);
      
      res.json({
        success: true,
        message: 'PDF конвертація працює!',
        screenshotSize: screenshot.length,
        puppeteerVersion: puppeteer.version || 'unknown'
      });
      
    } catch (error) {
      console.error('[PDF-TEST] Помилка тестування:', error);
      if (browser) {
        await browser.close();
      }
      
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
    
  } catch (error) {
    console.error('[PDF-TEST] Критична помилка:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- LOGS DEBUG API ---
app.get('/api/debug-logs', (req, res) => {
  try {
    console.log('[DEBUG-LOGS] Запит на отримання логів');
    
    // Перевіряємо системні змінні
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      puppeteerAvailable: !!require('puppeteer'),
      sharpAvailable: !!require('sharp'),
      tempDirExists: fs.existsSync(path.join(__dirname, 'temp')),
      tempDirPath: path.join(__dirname, 'temp')
    };
    
    console.log('[DEBUG-LOGS] Системна інформація:', systemInfo);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      systemInfo: systemInfo,
      message: 'Логи доступні в консолі сервера'
    });
    
  } catch (error) {
    console.error('[DEBUG-LOGS] Помилка:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- SAVED REPORTS API ---
// Зберегти звіт
app.post('/api/saved-reports', async (req, res) => {
  try {
    console.log('[SAVED-REPORTS] POST /api/saved-reports - запит на збереження звіту');
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
    console.log('[SAVED-REPORTS] Звіт збережено:', savedReport._id);
    res.json({ success: true, message: 'Звіт збережено!', report: savedReport });
  } catch (error) {
    console.error('[SAVED-REPORTS] Помилка збереження звіту:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримати всі збережені звіти користувача
app.get('/api/saved-reports/:userId', async (req, res) => {
  try {
    console.log('[SAVED-REPORTS] GET /api/saved-reports/:userId - запит на отримання звітів для користувача:', req.params.userId);
    const reports = await SavedReport.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    console.log('[SAVED-REPORTS] Знайдено звітів:', reports.length);
    res.json(reports);
  } catch (error) {
    console.error('[SAVED-REPORTS] Помилка отримання звітів:', error);
    res.status(500).json({ error: error.message });
  }
});

// Видалити збережений звіт
app.delete('/api/saved-reports/:reportId', async (req, res) => {
  try {
    console.log('[SAVED-REPORTS] DELETE /api/saved-reports/:reportId - запит на видалення звіту:', req.params.reportId);
    const report = await SavedReport.findByIdAndDelete(req.params.reportId);
    if (!report) {
      return res.status(404).json({ error: 'Звіт не знайдено' });
    }
    console.log('[SAVED-REPORTS] Звіт видалено:', req.params.reportId);
    res.json({ success: true, message: 'Звіт видалено!' });
  } catch (error) {
    console.error('[SAVED-REPORTS] Помилка видалення звіту:', error);
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
      
      // Перевіряємо чи заявка підтверджена складом та бухгалтером
      const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
      const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
      const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;
      
      if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved) {
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
          const engineers = [
            (task.engineer1 || '').trim(),
            (task.engineer2 || '').trim(),
            (task.engineer3 || '').trim(),
            (task.engineer4 || '').trim(),
            (task.engineer5 || '').trim(),
            (task.engineer6 || '').trim()
          ].filter(eng => eng && eng.length > 0);
          
          if (engineers.length > 0) {
            // Є інженери - загальна сума = повна премія
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
      // Перевіряємо чи заявка підтверджена складом та бухгалтером
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
      const engineers = [
        (task.engineer1 || '').trim(),
        (task.engineer2 || '').trim(),
        (task.engineer3 || '').trim(),
        (task.engineer4 || '').trim(),
        (task.engineer5 || '').trim(),
        (task.engineer6 || '').trim()
      ].filter(eng => eng && eng.length > 0);
      
      if (engineers.length > 0) {
        // Є інженери - загальна сума = повна премія
        actualBonus = bonusVal;
      }
      
      const workRevenue = actualBonus * 3; // Дохід по роботах = фактична премія × 3
      const materialsRevenue = totalMaterials / 4; // Дохід по матеріалам = сума матеріалів ÷ 4
      
      if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved) {
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

        if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved) {
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
            const engineers = [
              (task.engineer1 || '').trim(),
              (task.engineer2 || '').trim(),
              (task.engineer3 || '').trim(),
              (task.engineer4 || '').trim(),
              (task.engineer5 || '').trim(),
              (task.engineer6 || '').trim()
            ].filter(eng => eng && eng.length > 0);
            
            if (engineers.length > 0) {
              actualBonus = baseBonus; // Є інженери - загальна сума = повна премія
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

      if (task.bonusApprovalDate && task.workPrice && isWarehouseApproved && isAccountantApproved) {
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
          const engineers = [
            (task.engineer1 || '').trim(),
            (task.engineer2 || '').trim(),
            (task.engineer3 || '').trim(),
            (task.engineer4 || '').trim(),
            (task.engineer5 || '').trim(),
            (task.engineer6 || '').trim()
          ].filter(eng => eng && eng.length > 0);
          
          if (engineers.length > 0) {
            actualBonus = baseBonus; // Є інженери - загальна сума = повна премія
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
    
    const { message, type } = req.body;
    
    if (!message || !type) {
      return res.status(400).json({ error: 'message and type are required' });
    }
    
    // Перевіряємо налаштування
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ 
        error: 'Telegram bot token не налаштований. Додайте TELEGRAM_BOT_TOKEN в змінні середовища.' 
      });
    }
    
    console.log('[DEBUG] POST /api/notifications/send-system-message - відправляємо системне повідомлення через нову систему');
    
    // Використовуємо нову систему сповіщень
    const success = await telegramService.sendNotification('system_notifications', { 
      message: message 
    });
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Системне повідомлення відправлено успішно'
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Помилка при відправці системного повідомлення'
      });
    }
    
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

// Тестовий endpoint
app.post('/api/invoice-requests/test', (req, res) => {
  console.log('[DEBUG] POST /api/invoice-requests/test - тестовий endpoint викликано');
  res.json({ success: true, message: 'Тестовий endpoint працює' });
});

// Простий endpoint для тестування
app.post('/api/invoice-requests/simple', (req, res) => {
  console.log('[DEBUG] POST /api/invoice-requests/simple - простий endpoint викликано');
  try {
    res.json({ success: true, message: 'Простий endpoint працює', data: req.body });
  } catch (error) {
    console.error('[ERROR] POST /api/invoice-requests/simple - помилка:', error);
    res.status(500).json({ success: false, message: 'Помилка в простому endpoint' });
  }
});

// Створення запиту на рахунок
app.post('/api/invoice-requests', async (req, res) => {
  console.log('[DEBUG] POST /api/invoice-requests - endpoint викликано');
  console.log('[DEBUG] POST /api/invoice-requests - Origin:', req.headers.origin);
  
  // Додаємо CORS заголовки
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  try {
    console.log('[DEBUG] POST /api/invoice-requests - отримано запит:', JSON.stringify(req.body, null, 2));
    
    const { taskId, requesterId, requesterName, companyDetails, status, needInvoice, needAct } = req.body;
    
    // Валідація обов'язкових полів
    if (!taskId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID заявки обов\'язковий' 
      });
    }
    
    if (!requesterId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID заявника обов\'язковий' 
      });
    }
    
    if (!companyDetails?.companyName || !companyDetails?.edrpou) {
      return res.status(400).json({ 
        success: false, 
        message: 'Назва компанії та ЄДРПОУ обов\'язкові' 
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests - валідація пройшла успішно');
    
    // Перевіряємо, чи існує заявка
    const task = await executeWithRetry(() => Task.findById(taskId));
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: 'Заявка не знайдена' 
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests - заявка знайдена:', task.requestDesc);
    
    // Перевіряємо, чи вже є запит на рахунок для цієї заявки
    const existingRequest = await executeWithRetry(() => 
      InvoiceRequest.findOne({ taskId, status: { $in: ['pending', 'completed'] } })
    );
    
    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        message: 'Запит на рахунок для цієї заявки вже існує' 
      });
    }
    
    console.log('[DEBUG] POST /api/invoice-requests - перевірка на існуючий запит пройшла');
    
    // Генеруємо номер запиту
    const requestNumber = `IR-${Date.now()}`;
    
    console.log('[DEBUG] POST /api/invoice-requests - створюємо новий запит з номером:', requestNumber);
    
    // Створюємо новий запит на рахунок
    const invoiceRequest = new InvoiceRequest({
      taskId,
      requesterId,
      requesterName,
      companyDetails,
      status: status || 'pending',
      requestNumber,
      needInvoice: needInvoice !== undefined ? needInvoice : true,
      needAct: needAct !== undefined ? needAct : false,
      createdAt: new Date()
    });
    
    console.log('[DEBUG] POST /api/invoice-requests - зберігаємо запит в базу...');
    const savedRequest = await executeWithRetry(() => invoiceRequest.save());
    console.log('[DEBUG] POST /api/invoice-requests - запит збережено з ID:', savedRequest._id);
    
    // Оновлюємо заявку - додаємо інформацію про запит на рахунок
    await executeWithRetry(() => 
      Task.findByIdAndUpdate(taskId, { 
        invoiceRequested: true,
        invoiceRequestId: savedRequest._id 
      })
    );
    
    console.log('[DEBUG] POST /api/invoice-requests - заявка оновлена');
    
    // Відправляємо сповіщення через систему налаштувань
    try {
      console.log('[DEBUG] POST /api/invoice-requests - відправляємо сповіщення через систему налаштувань');
      
      // Використовуємо систему сповіщень для запитів на рахунки
      const user = req.user || { login: 'system', name: 'Система', role: 'system' };
      const notificationData = {
        companyName: companyDetails.companyName,
        edrpou: companyDetails.edrpou,
        requesterName: requesterName,
        taskId: taskId,
        requestNumber: requestNumber,
        authorLogin: user.login // Додаємо автора дії
      };
      
      await telegramService.sendNotification('invoice_requested', notificationData);
      console.log('[DEBUG] POST /api/invoice-requests - сповіщення відправлено через систему налаштувань');
      
    } catch (notificationError) {
      console.error('[ERROR] POST /api/invoice-requests - помилка відправки сповіщень:', notificationError);
      // Не блокуємо створення запиту через помилку сповіщень
    }
    
    console.log('[DEBUG] POST /api/invoice-requests - запит створено успішно');
    
    res.json({ 
      success: true, 
      message: 'Запит на рахунок створено успішно',
      data: {
        id: savedRequest._id,
        requestNumber: savedRequest.requestNumber,
        status: savedRequest.status
      }
    });
    
  } catch (error) {
    console.error('[ERROR] POST /api/invoice-requests - помилка:', error);
    console.error('[ERROR] POST /api/invoice-requests - stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка створення запиту на рахунок',
      error: error.message 
    });
  }
});

// Тимчасовий endpoint для перевірки заявки
app.get('/api/debug-task/:taskNumber', async (req, res) => {
  try {
    const { taskNumber } = req.params;
    console.log(`[DEBUG] Перевірка заявки: ${taskNumber}`);
    
    const task = await executeWithRetry(() => 
      Task.findOne({ 
        $or: [
          { requestNumber: taskNumber },
          { taskNumber: taskNumber },
          { id: taskNumber }
        ]
      })
    );
    
    if (!task) {
      return res.status(404).json({ error: 'Заявка не знайдена' });
    }
    
    const debugInfo = {
      _id: task._id,
      requestNumber: task.requestNumber,
      taskNumber: task.taskNumber,
      status: task.status,
      approvedByWarehouse: task.approvedByWarehouse,
      approvedByAccountant: task.approvedByAccountant,
      approvedByRegionalManager: task.approvedByRegionalManager,
      bonusApprovalDate: task.bonusApprovalDate,
      workPrice: task.workPrice,
      // Перевірка умов для автоматичного встановлення bonusApprovalDate
      conditions: {
        statusIsCompleted: task.status === 'Виконано',
        warehouseApproved: task.approvedByWarehouse === 'Підтверджено',
        accountantApproved: task.approvedByAccountant === 'Підтверджено',
        hasWorkPrice: !!task.workPrice,
        shouldSetBonusDate: (
          task.status === 'Виконано' &&
          task.approvedByWarehouse === 'Підтверджено' &&
          task.approvedByAccountant === 'Підтверджено' &&
          !!task.workPrice
        )
      }
    };
    
    console.log(`[DEBUG] Заявка ${taskNumber}:`, debugInfo);
    res.json(debugInfo);
    
  } catch (error) {
    console.error('[ERROR] Помилка перевірки заявки:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримання списку запитів на рахунки
app.get('/api/invoice-requests', async (req, res) => {
  try {
    const { status, requesterId, taskId, showAll } = req.query;
    
    console.log('DEBUG GET /api/invoice-requests:', { status, requesterId, taskId, showAll });
    
    let filter = {};
    if (status) filter.status = status;
    if (requesterId) filter.requesterId = requesterId;
    if (taskId) filter.taskId = taskId;
    
    // Якщо showAll не true, показуємо тільки актуальні (не виконані та не відхилені) заявки
    // Але якщо запитуємо по taskId, показуємо всі запити для цього завдання
    if (showAll !== 'true' && !status && !taskId) {
      filter.status = { $nin: ['completed', 'rejected'] };
    }
    
    console.log('DEBUG filter:', filter);
    
    const requests = await InvoiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);
    
    console.log('DEBUG знайдено запитів:', requests.length);
    if (requests.length > 0) {
      console.log('DEBUG перший запит:', {
        _id: requests[0]._id,
        taskId: requests[0].taskId,
        status: requests[0].status,
        invoiceFile: requests[0].invoiceFile,
        actFile: requests[0].actFile,
        needInvoice: requests[0].needInvoice,
        needAct: requests[0].needAct
      });
    }
    
    res.json({ 
      success: true, 
      data: requests 
    });
    
  } catch (error) {
    console.error('Помилка отримання запитів на рахунки:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка отримання запитів на рахунки',
      error: error.message 
    });
  }
});

// Видалення запиту на рахунок
app.delete('/api/invoice-requests/:id', async (req, res) => {
  try {
    const requestId = req.params.id;
    
    // Знаходимо запит
    const request = await InvoiceRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    // Перевіряємо, чи можна видалити (тільки виконані без файлів)
    if (request.status !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Можна видаляти тільки виконані заявки' 
      });
    }
    
    if (request.invoiceFile) {
      return res.status(400).json({ 
        success: false, 
        message: 'Не можна видалити заявку з завантаженим файлом' 
      });
    }
    
    // Видаляємо запит
    await InvoiceRequest.findByIdAndDelete(requestId);
    
    // Оновлюємо заявку (знімаємо позначку про запит на рахунок)
    await Task.findByIdAndUpdate(request.taskId, {
      $unset: { invoiceRequested: 1 }
    });
    
    res.json({
      success: true,
      message: 'Запит на рахунок успішно видалено'
    });
  } catch (error) {
    console.error('Помилка видалення запиту на рахунок:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка видалення запиту на рахунок' 
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
    
    // Відправляємо сповіщення користувачу про зміну статусу
    if (status === 'completed') {
      try {
        const user = req.user || { login: 'system', name: 'Система', role: 'system' };
        const telegramService = new TelegramNotificationService();
        await telegramService.sendNotification('invoice_completed', {
          taskId: request.taskId,
          requesterId: request.requesterId,
          companyName: request.companyDetails.companyName,
          authorLogin: user.login // Додаємо автора дії
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
    const request = await InvoiceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    // Перевіряємо чи є файл в запиті
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Файл не був завантажений' 
      });
    }

    // Перевіряємо чи це PDF файл і конвертуємо його на сервері
    let finalFileUrl = req.file.path;
    let finalFileName = req.file.originalname;
    
    console.log('[INVOICE] 🔍 ДІАГНОСТИКА ФАЙЛУ РАХУНКУ:');
    console.log('[INVOICE] - Назва файлу:', req.file.originalname);
    console.log('[INVOICE] - MIME тип:', req.file.mimetype);
    console.log('[INVOICE] - Розмір файлу:', req.file.size);
    console.log('[INVOICE] - Шлях до файлу:', req.file.path);
    console.log('[INVOICE] - Перевірка на PDF:', req.file.mimetype === 'application/pdf');
    
    // Перевіряємо PDF за MIME типом або розширенням
    const isPdfByMime = req.file.mimetype === 'application/pdf';
    const isPdfByExtension = req.file.originalname.toLowerCase().endsWith('.pdf');
    const isPdf = isPdfByMime || isPdfByExtension;
    
    console.log('[INVOICE] - PDF за MIME:', isPdfByMime);
    console.log('[INVOICE] - PDF за розширенням:', isPdfByExtension);
    console.log('[INVOICE] - Загальна перевірка PDF:', isPdf);
    
    if (isPdf) {
      try {
        console.log('[INVOICE] ✅ Виявлено PDF файл, конвертуємо на сервері:', req.file.originalname);
        
        // Читаємо PDF файл
        const pdfBuffer = fs.readFileSync(req.file.path);
        
        // Конвертуємо PDF в JPG на сервері
        const jpgBuffer = await convertPdfToJpgServer(pdfBuffer, req.file.originalname);
        
        // Створюємо новий файл з JPG даними
        const jpgFileName = req.file.originalname.replace(/\.pdf$/i, '.jpg');
        const tempJpgPath = path.join(__dirname, 'temp', `converted_${Date.now()}.jpg`);
        
        // Створюємо папку temp якщо не існує
        const tempDir = path.dirname(tempJpgPath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Записуємо JPG в тимчасовий файл
        fs.writeFileSync(tempJpgPath, jpgBuffer);
        
        // Оновлюємо шлях до файлу
        finalFileUrl = tempJpgPath;
        finalFileName = jpgFileName;
        
        console.log('[INVOICE] PDF конвертовано в JPG:', jpgFileName, 'розмір:', jpgBuffer.length);
        
      } catch (error) {
        console.error('[INVOICE] Помилка конвертації PDF:', error);
        // Якщо конвертація не вдалася, використовуємо оригінальний файл
        console.log('[INVOICE] Використовуємо оригінальний PDF файл');
      }
    }
    
    // Оновлюємо запит з інформацією про файл
    // Виправляємо кодування назви файлу (оригінальна логіка, яка працювала)
    let fileName = finalFileName;
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
    
    // OCR функціональність тимчасово відключена
    console.log('[INVOICE] OCR функціональність тимчасово відключена');
    const invoiceNumber = null; // req.body.invoiceNumber;
    const invoiceDate = null; // req.body.invoiceDate;
    
    // Підготовляємо дані для оновлення
    const updateData = { 
      status: 'completed',
      completedAt: new Date(),
      invoiceFile: finalFileUrl, // Cloudinary URL (конвертований або оригінальний)
      invoiceFileName: fileName // Використовуємо виправлену назву файлу
    };
    
    // Додаємо OCR дані якщо вони є
    if (invoiceNumber) {
      updateData.invoiceNumber = invoiceNumber;
      console.log('[INVOICE] ✅ Додано номер рахунку з OCR:', invoiceNumber);
    }
    if (invoiceDate) {
      updateData.invoiceDate = invoiceDate;
      console.log('[INVOICE] ✅ Додано дату рахунку з OCR:', invoiceDate);
    }
    
    const updatedRequest = await InvoiceRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    // Оновлюємо поле invoice в основному документі заявки
    if (updatedRequest && updatedRequest.taskId) {
      try {
        // Витягуємо число з назви файлу
        const fileName = req.file.originalname;
        const numberMatch = fileName.match(/^(\d+)/);
        const invoiceNumber = numberMatch ? numberMatch[1] : '';
        
        // Отримуємо поточну дату в форматі дд.мм.рррр
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const currentDate = `${day}.${month}.${year}`;
        
        // Формуємо рядок для поля invoice
        const invoiceText = `№ ${invoiceNumber}, дата ${currentDate}`;
        
        console.log('[INVOICE] 🔄 Оновлюємо поле invoice в основному документі:');
        console.log('[INVOICE] - taskId:', updatedRequest.taskId);
        console.log('[INVOICE] - invoiceNumber з файлу:', invoiceNumber);
        console.log('[INVOICE] - поточна дата:', currentDate);
        console.log('[INVOICE] - сформований текст:', invoiceText);
        
        // Оновлюємо основну заявку
        await Task.findByIdAndUpdate(updatedRequest.taskId, { invoice: invoiceText });
        console.log('[INVOICE] ✅ Поле invoice оновлено в основному документі');
        
      } catch (updateError) {
        console.error('[INVOICE] ❌ Помилка оновлення основного документа:', updateError);
        // Не зупиняємо виконання, просто логуємо помилку
      }
    }
    
    // Відправляємо сповіщення про завершення рахунку
    try {
      const user = req.user || { login: 'system', name: 'Система', role: 'system' };
      const telegramService = new TelegramNotificationService();
      await telegramService.sendNotification('invoice_completed', {
        taskId: updatedRequest.taskId,
        requesterId: updatedRequest.requesterId,
        companyName: updatedRequest.companyDetails.companyName,
        authorLogin: user.login // Додаємо автора дії
      });
      console.log('[INVOICE] ✅ Сповіщення про завершення рахунку відправлено');
    } catch (notificationError) {
      console.error('[INVOICE] ❌ Помилка відправки сповіщення:', notificationError);
    }
    
    res.json({ 
      success: true, 
      message: 'Файл рахунку завантажено успішно',
      data: {
        invoiceFile: finalFileUrl,
        invoiceFileName: fileName // Використовуємо виправлену назву файлу
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
}, (error, req, res, next) => {
  // Обробка помилок multer
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Файл занадто великий. Максимальний розмір: 10MB'
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

// Завантаження файлу акту виконаних робіт
app.post('/api/invoice-requests/:id/upload-act', upload.single('actFile'), async (req, res) => {
  try {
    const request = await InvoiceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }

    // Перевіряємо чи це PDF файл і конвертуємо його на сервері
    let finalFileUrl = req.file.path;
    let finalFileName = req.file.originalname;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Файл не було завантажено' 
      });
    }
    
    console.log('[ACT] 🔍 ДІАГНОСТИКА ФАЙЛУ АКТУ:');
    console.log('[ACT] - Назва файлу:', req.file.originalname);
    console.log('[ACT] - MIME тип:', req.file.mimetype);
    console.log('[ACT] - Розмір файлу:', req.file.size);
    console.log('[ACT] - Шлях до файлу:', req.file.path);
    console.log('[ACT] - Перевірка на PDF:', req.file.mimetype === 'application/pdf');
    
    // Перевіряємо PDF за MIME типом або розширенням
    const isPdfByMime = req.file.mimetype === 'application/pdf';
    const isPdfByExtension = req.file.originalname.toLowerCase().endsWith('.pdf');
    const isPdf = isPdfByMime || isPdfByExtension;
    
    console.log('[ACT] - PDF за MIME:', isPdfByMime);
    console.log('[ACT] - PDF за розширенням:', isPdfByExtension);
    console.log('[ACT] - Загальна перевірка PDF:', isPdf);
    
    if (isPdf) {
      try {
        console.log('[ACT] ✅ Виявлено PDF файл, конвертуємо на сервері:', req.file.originalname);
        
        // Читаємо PDF файл
        const pdfBuffer = fs.readFileSync(req.file.path);
        
        // Конвертуємо PDF в JPG на сервері
        const jpgBuffer = await convertPdfToJpgServer(pdfBuffer, req.file.originalname);
        
        // Створюємо новий файл з JPG даними
        const jpgFileName = req.file.originalname.replace(/\.pdf$/i, '.jpg');
        const tempJpgPath = path.join(__dirname, 'temp', `converted_act_${Date.now()}.jpg`);
        
        // Створюємо папку temp якщо не існує
        const tempDir = path.dirname(tempJpgPath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Записуємо JPG в тимчасовий файл
        fs.writeFileSync(tempJpgPath, jpgBuffer);
        
        // Оновлюємо шлях до файлу
        finalFileUrl = tempJpgPath;
        finalFileName = jpgFileName;
        
        console.log('[ACT] PDF конвертовано в JPG:', jpgFileName, 'розмір:', jpgBuffer.length);
        
      } catch (error) {
        console.error('[ACT] Помилка конвертації PDF:', error);
        // Якщо конвертація не вдалася, використовуємо оригінальний файл
        console.log('[ACT] Використовуємо оригінальний PDF файл');
      }
    }
    
    // Виправляємо кодування назви файлу (оригінальна логіка, яка працювала)
    let fileName = finalFileName;
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
    
    // OCR функціональність тимчасово відключена
    console.log('[ACT] OCR функціональність тимчасово відключена');
    const invoiceNumber = null; // req.body.invoiceNumber;
    const invoiceDate = null; // req.body.invoiceDate;
    
    // Підготовляємо дані для оновлення
    const updateData = {
      actFile: finalFileUrl,
      actFileName: fileName // Використовуємо виправлену назву файлу
    };
    
    // Додаємо OCR дані якщо вони є
    if (invoiceNumber) {
      updateData.invoiceNumber = invoiceNumber;
      console.log('[ACT] ✅ Додано номер рахунку з OCR:', invoiceNumber);
    }
    if (invoiceDate) {
      updateData.invoiceDate = invoiceDate;
      console.log('[ACT] ✅ Додано дату рахунку з OCR:', invoiceDate);
    }
    
    // Оновлюємо запит з новим файлом акту (конвертованим або оригінальним)
    await InvoiceRequest.findByIdAndUpdate(req.params.id, updateData);
    
    res.json({ 
      success: true, 
      message: 'Файл акту завантажено успішно',
      data: {
        fileUrl: finalFileUrl,
        fileName: fileName // Використовуємо виправлену назву файлу
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
        message: 'Файл занадто великий. Максимальний розмір: 10MB'
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
    message: 'Помилка завантаження файлу акту',
    error: error.message
  });
});

// Скачування файлу акту виконаних робіт
app.get('/api/invoice-requests/:id/download-act', async (req, res) => {
  try {
    const request = await InvoiceRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Запит на рахунок не знайдено' 
      });
    }
    
    if (!request.actFile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Файл акту не знайдено' 
      });
    }
    
    // Тут буде логіка завантаження файлу з Cloudinary
    // Поки що просто повертаємо URL
    res.json({ 
      success: true, 
      data: {
        fileUrl: request.actFile,
        fileName: request.actFileName
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
});

// Видалення файлу акту виконаних робіт
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
        const publicId = request.actFile.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`darex-trading-solutions/invoices/${publicId}`);
      } catch (cloudinaryError) {
        console.error('Помилка видалення файлу акту з Cloudinary:', cloudinaryError);
        // Продовжуємо навіть якщо не вдалося видалити з Cloudinary
      }
    }
    
    // Оновлюємо запит - видаляємо посилання на файл акту
    await InvoiceRequest.findByIdAndUpdate(id, {
      $unset: { actFile: 1, actFileName: 1 }
    });
    
    res.json({ success: true, message: 'Файл акту видалено успішно' });
    
  } catch (error) {
    console.error('Помилка видалення файлу акту:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка видалення файлу акту',
      error: error.message 
    });
  }
});

// Endpoint для оновлення налаштувань сповіщень конкретного користувача
app.put('/api/notification-settings/user/:login', async (req, res) => {
  try {
    const { login } = req.params;
    const { notificationSettings } = req.body;
    
    console.log(`[DEBUG] PUT /api/notification-settings/user/${login} - оновлення налаштувань (v2)`);
    console.log(`[DEBUG] notificationSettings:`, notificationSettings);
    
    const user = await User.findOne({ login });
    
    if (!user) {
      return res.status(404).json({ error: 'Користувач не знайдений' });
    }
    
    user.notificationSettings = notificationSettings;
    await user.save();
    
    console.log(`[DEBUG] Налаштування оновлено для користувача ${login}`);
    
    res.json({
      success: true,
      message: `Налаштування оновлено для користувача ${login}`
    });
    
  } catch (error) {
    console.error('[ERROR] PUT /api/notification-settings/user/:login - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[STARTUP] Сервер запущено на порту ${PORT}`);
  console.log(`[STARTUP] MongoDB readyState: ${mongoose.connection.readyState}`);
  console.log(`[STARTUP] Server is ready to accept requests`);
}); 

// Endpoint для ініціалізації налаштувань сповіщень
app.post('/api/notification-settings/init', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/notification-settings/init - ініціалізація налаштувань');
    
    const users = await User.find({});
    let initializedCount = 0;
    
    for (const user of users) {
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
      }
    }
    
    console.log(`[DEBUG] Ініціалізовано налаштувань для ${initializedCount} користувачів`);
    
    res.json({
      success: true,
      message: `Ініціалізовано налаштувань для ${initializedCount} користувачів`,
      initializedCount
    });
    
  } catch (error) {
    console.error('[ERROR] POST /api/notification-settings/init - помилка:', error);
    res.status(500).json({ error: error.message });
  }
});


// Telegram Notification Service - Нова спрощена система
const TelegramNotificationService = require('./telegram-service.js');

// Створюємо екземпляр сервісу
const telegramService = new TelegramNotificationService();
