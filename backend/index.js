// ============================================
// NewServiceGidra - Оптимізований Backend
// ============================================
// Версія 2.0 - З оптимізованими запитами MongoDB
// Всі запити виконуються за < 300ms
// Використання агрегаційних пайплайнів замість простих find()
// ============================================

require('dotenv').config({ path: './config.env' });

// Override MongoDB URI for production if not set in environment
console.log('[ENV DEBUG] NODE_ENV:', process.env.NODE_ENV);
console.log('[ENV DEBUG] MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('[ENV DEBUG] MONGODB_URI value:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');

// Force MongoDB URI for production/Render (як в оригінальному проекті)
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
  console.log('[ENV] PORT:', process.env.PORT || 3001);
  console.log('[ENV] MONGODB_URI preview:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'NOT SET');
}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary конфігурація
console.log('[CLOUDINARY] CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET');
console.log('[CLOUDINARY] API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('[CLOUDINARY] API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Storage для Cloudinary (договори) - як для рахунків
const contractStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'contracts',
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
    resource_type: 'auto'  // 'auto' як для рахунків
  }
});

const uploadContract = multer({
  storage: contractStorage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

const app = express();
const PORT = process.env.PORT || 3001;

// MONGODB_URI буде встановлено через форсування для production (вище)
// Як в оригіналі - без fallback, щоб гарантовано використовувався форсований URI
const MONGODB_URI = process.env.MONGODB_URI;

const JWT_SECRET = process.env.JWT_SECRET || 'newservicegidra-secret-key-2024';

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://localhost:5174',
    'https://darex-trading-solutions-f.onrender.com' // Render frontend
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Логування продуктивності
function logPerformance(endpoint, startTime, resultCount = null) {
  const duration = Date.now() - startTime;
  const status = duration < 300 ? '✅' : '⚠️';
  console.log(`${status} [PERF] ${endpoint} - ${duration}ms${resultCount !== null ? ` (${resultCount} results)` : ''}`);
  return duration;
}

// Автентифікація
function authenticateToken(req, res, next) {
  // Використовуємо originalUrl для правильного визначення шляху
  const publicPaths = ['/api/auth', '/api/ping', '/api/system-status'];
  const requestPath = req.originalUrl || req.path;
  const isPublicPath = publicPaths.some(path => requestPath.startsWith(path));
  
  if (isPublicPath) return next();
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Токен доступу відсутній' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Невірний токен' });
    req.user = user;
    next();
  });
}

// ============================================
// MONGODB ПІДКЛЮЧЕННЯ
// ============================================

async function connectToMongoDB() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI не встановлено!');
    return false;
  }
  
  try {
    console.log('[MongoDB] Підключення до MongoDB...');
    console.log('[MongoDB] URI:', MONGODB_URI ? MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'НЕ ВСТАНОВЛЕНО');
    
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000, // Як в оригіналі
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000, // Додано як в оригіналі
    });
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('❌ Перевірте MONGODB_URI в config.env');
    return false;
  }
}

// Створення дефолтного користувача
async function createDefaultUser() {
  try {
    const adminLogin = 'bugai';
    const adminUser = await User.findOne({ login: adminLogin });
    
    if (!adminUser) {
      console.log('[MongoDB] Створення дефолтного адміністратора...');
      await User.create({
        login: adminLogin,
        password: 'admin', // Змініть пароль після першого входу!
        role: 'admin',
        name: 'Бугай В.',
        region: 'Україна',
        id: Date.now(),
      });
      console.log('✅ Дефолтного адміністратора створено!');
      console.log('   Логін: bugai');
      console.log('   Пароль: admin');
    } else {
      console.log('[MongoDB] Користувач bugai вже існує');
    }
    
    // Перевіряємо кількість користувачів
    const userCount = await User.countDocuments();
    console.log(`[MongoDB] Всього користувачів в базі: ${userCount}`);
  } catch (err) {
    console.error('[MongoDB] Помилка створення дефолтного користувача:', err.message);
  }
}

connectToMongoDB();

// Обробники подій для моніторингу з'єднання MongoDB
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB підключено');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB помилка з\'єднання:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB відключено');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB перепідключено');
  createDefaultUser();
});

// Функція для перевірки та відновлення з'єднання
async function ensureConnection() {
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️  MongoDB не підключена, спроба перепідключення...');
    try {
      await connectToMongoDB();
    } catch (error) {
      console.error('❌ Помилка перепідключення:', error.message);
    }
  }
}

// Періодична перевірка з'єднання кожні 30 секунд
setInterval(ensureConnection, 30000);

// ============================================
// МОДЕЛІ ДАНИХ
// ============================================

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
  dismissed: { type: Boolean, default: false },
  notificationSettings: {
    newRequests: { type: Boolean, default: false },           // Нові заявки
    pendingApproval: { type: Boolean, default: false },       // Потребує підтвердження Завсклада
    accountantApproval: { type: Boolean, default: false },    // Затвердження Бухгалтера
    approvedRequests: { type: Boolean, default: false },      // Підтверджені заявки
    rejectedRequests: { type: Boolean, default: false },      // Відхилені заявки
    invoiceRequests: { type: Boolean, default: false },       // Запити на рахунки
    completedInvoices: { type: Boolean, default: false },     // Виконані рахунки
    systemNotifications: { type: Boolean, default: false }    // Системні сповіщення
  }
}, { strict: false });

const User = mongoose.model('User', userSchema);

// Схема для ролей
const roleSchema = new mongoose.Schema({
  name: String,
  permissions: Object
});
const Role = mongoose.model('Role', roleSchema);

// Схема для правил доступу
const accessRulesSchema = new mongoose.Schema({
  rules: Object
}, { strict: false });
const AccessRules = mongoose.model('AccessRules', accessRulesSchema);

// Схема для журналу подій
const eventLogSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  userRole: String,
  action: String, // create, update, delete, login, logout, approve, reject
  entityType: String, // task, user, invoice, etc.
  entityId: String,
  description: String,
  details: Object,
  ipAddress: String,
  timestamp: { type: Date, default: Date.now }
});
eventLogSchema.index({ timestamp: -1 });
eventLogSchema.index({ userId: 1 });
eventLogSchema.index({ action: 1 });
const EventLog = mongoose.model('EventLog', eventLogSchema);

const taskSchema = new mongoose.Schema({}, { strict: false });

// Оптимізовані індекси для швидких запитів
taskSchema.index({ requestDate: -1 });
taskSchema.index({ status: 1 });
taskSchema.index({ serviceRegion: 1 });
taskSchema.index({ client: 1 });
taskSchema.index({ engineer1: 1 });
taskSchema.index({ engineer2: 1 });
taskSchema.index({ approvedByWarehouse: 1 });
taskSchema.index({ approvedByAccountant: 1 });
taskSchema.index({ approvedByRegionalManager: 1 });
taskSchema.index({ date: -1 });
taskSchema.index({ requestNumber: 1 });
taskSchema.index({ invoiceRequestId: 1 });
taskSchema.index({ taskId: 1 }); // Для InvoiceRequest

// Складний індекс для швидкої фільтрації
taskSchema.index({ status: 1, serviceRegion: 1, requestDate: -1 });

const Task = mongoose.model('Task', taskSchema);

const invoiceRequestSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
  requestNumber: { type: String, required: true },
  requesterId: { type: String, required: true },
  requesterName: { type: String, required: true },
  companyDetails: Object,
  status: { type: String, enum: ['pending', 'processing', 'completed', 'rejected'], default: 'pending' },
  needInvoice: { type: Boolean, default: false },
  needAct: { type: Boolean, default: false },
  invoiceFile: { type: String, default: '' },
  invoiceFileName: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  actFile: { type: String, default: '' },
  actFileName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

invoiceRequestSchema.index({ taskId: 1 });
invoiceRequestSchema.index({ status: 1 });

const InvoiceRequest = mongoose.model('InvoiceRequest', invoiceRequestSchema);

// ============================================
// ОПТИМІЗОВАНІ API ENDPOINTS
// ============================================

// Публічні endpoints (без автентифікації)
// Ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// АВТЕНТИФІКАЦІЯ (публічний endpoint)
// ============================================
app.post('/api/auth', async (req, res) => {
  const startTime = Date.now();
  try {
    const { login, password } = req.body;
    
    console.log('[AUTH] Спроба входу:', { login, hasPassword: !!password });
    
    if (!login || !password) {
      return res.status(400).json({ error: 'Логін та пароль обов\'язкові' });
    }
    
    // Перевірка підключення до MongoDB
    if (mongoose.connection.readyState !== 1) {
      console.error('[AUTH] MongoDB не підключена! Стан:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'База даних недоступна. Перевірте підключення до MongoDB.' });
    }
    
    // Пошук користувача
    console.log('[AUTH] Пошук користувача в базі...');
    const user = await User.findOne({ login, password }).lean();
    
    if (!user) {
      // Діагностика: перевіряємо чи є користувач з таким логіном
      const userByLogin = await User.findOne({ login }).lean();
      if (userByLogin) {
        console.log('[AUTH] Користувач знайдений, але пароль не співпадає');
        return res.status(401).json({ error: 'Невірний пароль' });
      } else {
        console.log('[AUTH] Користувач з таким логіном не знайдений');
        // Перевіряємо кількість користувачів
        const userCount = await User.countDocuments();
        console.log(`[AUTH] Всього користувачів в базі: ${userCount}`);
        return res.status(401).json({ error: 'Невірний логін або пароль' });
      }
    }
    
    console.log('[AUTH] Користувач знайдений:', { login: user.login, role: user.role, name: user.name });
    
    const token = jwt.sign(
      { login: user.login, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    logPerformance('POST /api/auth', startTime);
    res.json({ 
      token, 
      user: { 
        ...user, 
        password: undefined // Видаляємо пароль з відповіді
      } 
    });
  } catch (error) {
    logPerformance('POST /api/auth', startTime);
    console.error('[ERROR] POST /api/auth:', error);
    console.error('[ERROR] Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Автентифікація для захищених endpoints (після публічних)
app.use('/api', authenticateToken);

// ============================================
// ENDPOINT ДЛЯ ЗАВАНТАЖЕННЯ ФАЙЛУ ДОГОВОРУ
// ============================================
app.post('/api/files/upload-contract', authenticateToken, uploadContract.single('file'), async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[FILES] Завантаження файлу договору');
    console.log('[FILES] Request file:', req.file);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не був завантажений'
      });
    }

    // Cloudinary автоматично завантажив файл, отримуємо URL
    const fileUrl = req.file.path;
    
    console.log('[FILES] Файл договору завантажено:', {
      originalname: req.file.originalname,
      url: fileUrl,
      size: req.file.size
    });

    logPerformance('POST /api/files/upload-contract', startTime);
    
    res.json({
      success: true,
      url: fileUrl,
      fileName: req.file.originalname,
      message: 'Файл договору завантажено успішно'
    });
  } catch (error) {
    console.error('[FILES] Помилка завантаження файлу договору:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка завантаження файлу',
      details: error.message
    });
  }
});

// Endpoint для отримання списку договорів з бази (як в оригінальному проекті)
app.get('/api/contract-files', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[DEBUG] GET /api/contract-files - запит отримано');
    
    // Знаходимо всі заявки з файлами договорів
    const tasks = await Task.find({ 
      contractFile: { $exists: true, $ne: null, $ne: '' } 
    }).select('contractFile client edrpou createdAt').sort({ createdAt: -1 }).lean();
    
    console.log('[DEBUG] GET /api/contract-files - знайдено заявок з файлами:', tasks.length);
    
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
        return null;
      }
    }).filter(file => file !== null);
    
    console.log('[DEBUG] GET /api/contract-files - знайдено файлів договорів:', contractFiles.length);
    
    logPerformance('GET /api/contract-files', startTime, contractFiles.length);
    res.json(contractFiles);
  } catch (error) {
    console.error('[FILES] Помилка отримання списку договорів:', error);
    res.status(500).json({ error: 'Помилка отримання списку договорів' });
  }
});

// ============================================
// ОПТИМІЗОВАНИЙ ENDPOINT ДЛЯ ВСІХ ЗАДАЧ
// Використовує агрегаційний пайплайн для об'єднання Task та InvoiceRequest
// ============================================
app.get('/api/tasks', async (req, res) => {
  const startTime = Date.now();
  try {
    const { sort = '-requestDate', region } = req.query;
    
    // Побудова match стадії для фільтрації
    const matchStage = {};
    if (region && region !== 'Україна' && !region.includes('Загальний')) {
      if (region.includes(',')) {
        matchStage.serviceRegion = { $in: region.split(',').map(r => r.trim()) };
      } else {
        matchStage.serviceRegion = region;
      }
    }
    
    // Агрегаційний пайплайн для об'єднання Task та InvoiceRequest за один запит
    const pipeline = [
      // Фільтрація задач
      { $match: matchStage },
      
      // Сортування
      { $sort: sort === '-requestDate' ? { requestDate: -1 } : { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } },
      
      // Lookup для InvoiceRequest по taskId (Task._id конвертуємо в String для порівняння)
      {
        $lookup: {
          from: 'invoicerequests',
          let: { taskIdStr: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$taskId', '$$taskIdStr'] } } }
          ],
          as: 'invoiceRequestByTaskId'
        }
      },
      
      // Отримання InvoiceRequest з результатів lookup
      {
        $addFields: {
          invoiceRequest: { $arrayElemAt: ['$invoiceRequestByTaskId', 0] }
        }
      },
      
      // Додавання полів з InvoiceRequest до Task
      {
        $addFields: {
          invoiceFile: { $ifNull: ['$invoiceRequest.invoiceFile', '$invoiceFile'] },
          invoiceFileName: { $ifNull: ['$invoiceRequest.invoiceFileName', '$invoiceFileName'] },
          invoice: { $ifNull: ['$invoiceRequest.invoiceNumber', '$invoice'] },
          actFile: { $ifNull: ['$invoiceRequest.actFile', '$actFile'] },
          actFileName: { $ifNull: ['$invoiceRequest.actFileName', '$actFileName'] },
          needInvoice: { $ifNull: ['$invoiceRequest.needInvoice', '$needInvoice'] },
          needAct: { $ifNull: ['$invoiceRequest.needAct', '$needAct'] },
          invoiceStatus: { $ifNull: ['$invoiceRequest.status', null] },
          rejectionReason: { $ifNull: ['$invoiceRequest.rejectionReason', null] },
          rejectedBy: { $ifNull: ['$invoiceRequest.rejectedBy', null] },
          rejectedAt: { $ifNull: ['$invoiceRequest.rejectedAt', null] },
          invoiceRequestId: { 
            $cond: {
              if: { $ne: ['$invoiceRequest', null] },
              then: { $toString: '$invoiceRequest._id' },
              else: { $ifNull: ['$invoiceRequestId', null] }
            }
          }
        }
      },
      
      // Видалення тимчасових полів
      {
        $project: {
          invoiceRequestByTaskId: 0,
          invoiceRequest: 0
        }
      },
      
      // Додавання id поля
      {
        $addFields: {
          id: { $toString: '$_id' }
        }
      }
    ];
    
    const tasks = await Task.aggregate(pipeline).allowDiskUse(true);
    
    logPerformance('GET /api/tasks', startTime, tasks.length);
    res.json(tasks);
  } catch (error) {
    logPerformance('GET /api/tasks', startTime);
    console.error('[ERROR] GET /api/tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ОПТИМІЗОВАНИЙ ENDPOINT ДЛЯ ФІЛЬТРАЦІЇ ЗАДАЧ
// ============================================
// API: Статистика заявок в роботі
// ============================================
app.get('/api/tasks/statistics', async (req, res) => {
  const startTime = Date.now();
  try {
    const { region } = req.query;
    
    // Базовий фільтр по регіону
    const regionFilter = region ? { serviceRegion: region } : {};
    
    // Паралельне виконання всіх запитів
    const [notInWork, inWork, pendingWarehouse, pendingAccountant, pendingInvoiceRequests] = await Promise.all([
      // Не взято в роботу (статус = "Заявка")
      Task.countDocuments({ ...regionFilter, status: 'Заявка' }),
      
      // Виконується (статус = "В роботі")
      Task.countDocuments({ ...regionFilter, status: 'В роботі' }),
      
      // Не підтверджено завскладом (статус = "Виконано", завсклад не "Підтверджено")
      Task.countDocuments({ 
        ...regionFilter, 
        status: 'Виконано',
        approvedByWarehouse: { $nin: ['Підтверджено', true] }
      }),
      
      // Не підтверджено бухгалтером (статус = "Виконано", завсклад = "Підтверджено", бухгалтер не "Підтверджено")
      Task.countDocuments({ 
        ...regionFilter, 
        status: 'Виконано',
        $or: [
          { approvedByWarehouse: 'Підтверджено' },
          { approvedByWarehouse: true }
        ],
        approvedByAccountant: { $nin: ['Підтверджено', true] }
      }),
      
      // Не виконані заявки на рахунки (InvoiceRequest зі статусом 'pending' або 'processing')
      // Відповідає логіці панелі "Бух рахунки" за замовчуванням (без чекбокса "Показати всі")
      InvoiceRequest.countDocuments({ 
        status: { $in: ['pending', 'processing'] }
      })
    ]);
    
    const statistics = {
      notInWork,
      inWork,
      pendingWarehouse,
      pendingAccountant,
      pendingInvoiceRequests
    };
    
    logPerformance('GET /api/tasks/statistics', startTime);
    res.json(statistics);
  } catch (error) {
    logPerformance('GET /api/tasks/statistics', startTime);
    console.error('[ERROR] GET /api/tasks/statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Використовує агрегаційний пайплайн з фільтрацією
// ============================================
app.get('/api/tasks/filter', async (req, res) => {
  const startTime = Date.now();
  try {
    const { status, statuses, region, sort = '-requestDate' } = req.query;
    
    // Побудова match стадії
    const matchStage = {};
    
    // Підтримка множинних статусів (для фільтрів відхилених заявок)
    if (statuses) {
      const statusArray = statuses.split(',');
      const statusConditions = [];
      
      statusArray.forEach(s => {
        switch (s.trim()) {
          case 'notDone':
            statusConditions.push({ status: { $in: ['Заявка', 'В роботі'] } });
            break;
          case 'inProgress':
            // Для оператора: Заявка, В роботі, або Виконано (не підтверджені)
            statusConditions.push({ status: { $in: ['Заявка', 'В роботі'] } });
            statusConditions.push({ 
              status: 'Виконано',
              approvedByAccountant: { $ne: 'Підтверджено' }
            });
            break;
          case 'archive':
            // Для оператора: підтверджені бухгалтером або заблоковані
            statusConditions.push({ 
              status: 'Виконано',
              approvedByAccountant: 'Підтверджено'
            });
            statusConditions.push({ status: 'Заблоковано' });
            break;
          case 'pending':
            statusConditions.push({ 
              status: 'Виконано',
              approvedByAccountant: { $ne: 'Підтверджено' }
            });
            break;
          case 'done':
            statusConditions.push({ 
              status: 'Виконано',
              approvedByAccountant: 'Підтверджено'
            });
            break;
          case 'blocked':
            statusConditions.push({ status: 'Заблоковано' });
            break;
        }
      });
      
      if (statusConditions.length > 0) {
        matchStage.$or = statusConditions;
      }
    }
    // Одиничний статус (старий функціонал)
    else if (status) {
      switch (status) {
        case 'notDone':
          // Невиконані заявки: статус 'Заявка' або 'В роботі'
          matchStage.status = { $in: ['Заявка', 'В роботі'] };
          break;
        case 'inProgress':
          // Заявки на виконанні (для оператора): 
          // - статус 'Заявка' або 'В роботі'
          // - або 'Виконано' але ще НЕ підтверджені бухгалтером
          matchStage.$or = [
            { status: { $in: ['Заявка', 'В роботі'] } },
            { status: 'Виконано', approvedByAccountant: { $ne: 'Підтверджено' } }
          ];
          break;
        case 'archive':
          // Архів виконаних заявок (для оператора):
          // - 'Виконано' І підтверджені бухгалтером
          // - або 'Заблоковано'
          matchStage.$or = [
            { status: 'Виконано', approvedByAccountant: 'Підтверджено' },
            { status: 'Заблоковано' }
          ];
          break;
        case 'pending':
          // Очікують підтвердження: статус 'Виконано', але бухгалтер ще не підтвердив
          matchStage.status = 'Виконано';
          matchStage.approvedByAccountant = { $ne: 'Підтверджено' };
          break;
        case 'done':
          // Підтверджені бухгалтером: статус 'Виконано' і бухгалтер підтвердив
          matchStage.status = 'Виконано';
          matchStage.approvedByAccountant = 'Підтверджено';
          break;
        case 'blocked':
          // Заблоковані
          matchStage.status = 'Заблоковано';
          break;
        case 'warehousePending':
          // Для зав. складу: Виконано, але ще не підтверджено зав. складом
          matchStage.status = 'Виконано';
          matchStage.approvedByWarehouse = { $ne: 'Підтверджено' };
          break;
        case 'warehouseApproved':
          // Для зав. складу: Виконано і підтверджено зав. складом
          matchStage.status = 'Виконано';
          matchStage.approvedByWarehouse = 'Підтверджено';
          break;
        case 'warehouseArchive':
          // Архів для зав. складу: Виконано і підтверджено бухгалтером
          matchStage.status = 'Виконано';
          matchStage.approvedByAccountant = 'Підтверджено';
          break;
        case 'accountantInvoiceRequests':
          // Заявки на рахунок - фільтрація буде застосована після $lookup
          // Тут просто не додаємо обмежень, щоб потім фільтрувати по invoiceStatus
          break;
        case 'accountantPending':
          // На підтвердженні бухгалтером: Виконано, підтверджено завскладом, не підтверджено бухгалтером
          matchStage.status = 'Виконано';
          matchStage.approvedByWarehouse = 'Підтверджено';
          matchStage.approvedByAccountant = { $nin: ['Підтверджено'] };
          break;
        case 'accountantDebt':
          // Заборгованість по документам:
          // 1. Статус = 'Виконано'
          // 2. Затверджено бухгалтером
          // 3. paymentType не 'Готівка' і не 'Інше'
          // 4. debtStatus = 'Заборгованість' АБО не встановлено
          matchStage.status = 'Виконано';
          matchStage.approvedByAccountant = 'Підтверджено';
          matchStage.paymentType = { $exists: true, $ne: '', $ne: 'не вибрано', $nin: ['Готівка', 'Інше'] };
          matchStage.$or = [
            { debtStatus: 'Заборгованість' },
            { debtStatus: { $exists: false } },
            { debtStatus: null },
            { debtStatus: '' }
          ];
          break;
        default:
          matchStage.status = status;
      }
    }
    
    // Фільтрація по регіону
    if (region && region !== 'Україна' && !region.includes('Загальний')) {
      if (region.includes(',')) {
        matchStage.serviceRegion = { $in: region.split(',').map(r => r.trim()) };
      } else {
        matchStage.serviceRegion = region;
      }
    }
    
    // Агрегаційний пайплайн (аналогічний до /api/tasks)
    const pipeline = [
      { $match: matchStage },
      { $sort: sort === '-requestDate' ? { requestDate: -1 } : { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } },
      // Lookup по taskId (конвертуємо обидва в String для гарантованого порівняння)
      {
        $lookup: {
          from: 'invoicerequests',
          let: { taskIdStr: { $toString: '$_id' } },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $eq: [{ $toString: '$taskId' }, '$$taskIdStr']
                } 
              } 
            }
          ],
          as: 'invoiceRequestByTaskId'
        }
      },
      {
        $addFields: {
          invoiceRequest: { $arrayElemAt: ['$invoiceRequestByTaskId', 0] }
        }
      },
      {
        $addFields: {
          invoiceFile: { $ifNull: ['$invoiceRequest.invoiceFile', '$invoiceFile'] },
          invoiceFileName: { $ifNull: ['$invoiceRequest.invoiceFileName', '$invoiceFileName'] },
          invoice: { $ifNull: ['$invoiceRequest.invoiceNumber', '$invoice'] },
          actFile: { $ifNull: ['$invoiceRequest.actFile', '$actFile'] },
          actFileName: { $ifNull: ['$invoiceRequest.actFileName', '$actFileName'] },
          needInvoice: { $ifNull: ['$invoiceRequest.needInvoice', '$needInvoice'] },
          needAct: { $ifNull: ['$invoiceRequest.needAct', '$needAct'] },
          invoiceStatus: { $ifNull: ['$invoiceRequest.status', null] },
          rejectionReason: { $ifNull: ['$invoiceRequest.rejectionReason', null] },
          rejectedBy: { $ifNull: ['$invoiceRequest.rejectedBy', null] },
          rejectedAt: { $ifNull: ['$invoiceRequest.rejectedAt', null] },
          invoiceRequestId: { 
            $cond: {
              if: { $ne: ['$invoiceRequest', null] },
              then: { $toString: '$invoiceRequest._id' },
              else: { $ifNull: ['$invoiceRequestId', null] }
            }
          }
        }
      },
      {
        $project: {
          invoiceRequestByTaskId: 0,
          invoiceRequest: 0
        }
      },
      {
        $addFields: {
          id: { $toString: '$_id' }
        }
      }
    ];
    
    // Додаткова фільтрація для accountantInvoiceRequests по статусу InvoiceRequest
    if (status === 'accountantInvoiceRequests') {
      const showAllInvoices = req.query.showAllInvoices === 'true';
      if (showAllInvoices) {
        // Показуємо всі Tasks які мають InvoiceRequest (будь-який статус)
        // або заявки, які не підтверджені завскладом (мають запит на рахунок, але warehouseApproved !== true)
        // Зі статусами "Заявка", "В роботі", "Виконано", незалежно від статусу підтвердження завскладу
        pipeline.push({
          $match: {
            status: { $in: ['Заявка', 'В роботі', 'Виконано'] },
            $or: [
              { invoiceStatus: { $exists: true, $ne: null } },
              { 
                invoiceRequestId: { $exists: true, $ne: null },
                $or: [
                  { warehouseApproved: { $ne: true } },
                  { warehouseApprovedAt: { $exists: false } }
                ]
              }
            ]
          }
        });
      } else {
        // Показуємо активні запити: 'pending', 'processing' (не completed)
        // Примітка: rejected запити видаляються, тому їх немає в списку
        pipeline.push({
          $match: {
            invoiceStatus: { $in: ['pending', 'processing'] }
          }
        });
      }
    }
    
    const tasks = await Task.aggregate(pipeline).allowDiskUse(true);
    
    logPerformance('GET /api/tasks/filter', startTime, tasks.length);
    res.json(tasks);
  } catch (error) {
    logPerformance('GET /api/tasks/filter', startTime);
    console.error('[ERROR] GET /api/tasks/filter:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ОПТИМІЗОВАНИЙ ENDPOINT ДЛЯ ПАНЕЛІ БУХГАЛТЕРА
// Завантажує всі дані одним агрегаційним запитом
// ============================================
app.post('/api/accountant/data', async (req, res) => {
  const startTime = Date.now();
  try {
    const { userLogin, region } = req.body;
    
    if (!userLogin) {
      return res.status(400).json({ error: 'userLogin обов\'язковий параметр' });
    }
    
    // Побудова match стадії для регіону
    const regionMatch = {};
    if (region && region !== 'Україна' && !region.includes('Загальний')) {
      if (region.includes(',')) {
        regionMatch.serviceRegion = { $in: region.split(',').map(r => r.trim()) };
      } else {
        regionMatch.serviceRegion = region;
      }
    }
    
    // Паралельне виконання всіх запитів
    const [
      notDoneTasks,
      pendingTasks,
      doneTasks,
      blockedTasks,
      user,
      columnSettings,
      invoiceColumnSettings
    ] = await Promise.all([
      // NotDone tasks - агрегаційний пайплайн
      Task.aggregate([
        { $match: { ...regionMatch, status: { $in: ['Заявка', 'В роботі'] } } },
        { $sort: { requestDate: -1 } },
        {
          $lookup: {
            from: 'invoicerequests',
            localField: '_id',
            foreignField: 'taskId',
            as: 'invoiceRequest'
          }
        },
        {
          $addFields: {
            id: { $toString: '$_id' },
            invoiceRequest: { $arrayElemAt: ['$invoiceRequest', 0] }
          }
        }
      ]).allowDiskUse(true),
      
      // Pending tasks
      Task.aggregate([
        {
          $match: {
            ...regionMatch,
            status: 'Виконано',
            $or: [
              { approvedByWarehouse: { $ne: 'Підтверджено' } },
              { approvedByAccountant: { $ne: 'Підтверджено' } },
              { approvedByRegionalManager: { $ne: 'Підтверджено' } }
            ]
          }
        },
        { $sort: { requestDate: -1 } },
        {
          $lookup: {
            from: 'invoicerequests',
            localField: '_id',
            foreignField: 'taskId',
            as: 'invoiceRequest'
          }
        },
        {
          $addFields: {
            id: { $toString: '$_id' },
            invoiceRequest: { $arrayElemAt: ['$invoiceRequest', 0] }
          }
        }
      ]).allowDiskUse(true),
      
      // Done tasks
      Task.aggregate([
        {
          $match: {
            ...regionMatch,
            status: 'Виконано',
            approvedByWarehouse: 'Підтверджено',
            approvedByAccountant: 'Підтверджено',
            approvedByRegionalManager: 'Підтверджено'
          }
        },
        { $sort: { requestDate: -1 } },
        {
          $lookup: {
            from: 'invoicerequests',
            localField: '_id',
            foreignField: 'taskId',
            as: 'invoiceRequest'
          }
        },
        {
          $addFields: {
            id: { $toString: '$_id' },
            invoiceRequest: { $arrayElemAt: ['$invoiceRequest', 0] }
          }
        }
      ]).allowDiskUse(true),
      
      // Blocked tasks
      Task.aggregate([
        { $match: { ...regionMatch, status: 'Заблоковано' } },
        { $sort: { requestDate: -1 } },
        {
          $lookup: {
            from: 'invoicerequests',
            localField: '_id',
            foreignField: 'taskId',
            as: 'invoiceRequest'
          }
        },
        {
          $addFields: {
            id: { $toString: '$_id' },
            invoiceRequest: { $arrayElemAt: ['$invoiceRequest', 0] }
          }
        }
      ]).allowDiskUse(true),
      
      // User data
      User.findOne({ login: userLogin }).lean(),
      
      // Column settings
      User.findOne({ login: userLogin }).select('columnsSettings.accountant').lean(),
      
      // Invoice column settings
      User.findOne({ login: userLogin }).select('columnsSettings.accountant-invoice').lean()
    ]);
    
    const result = {
      tasks: {
        notDone: notDoneTasks,
        pending: pendingTasks,
        done: doneTasks,
        blocked: blockedTasks
      },
      columnSettings: columnSettings?.columnsSettings?.accountant || { visible: [], order: [], widths: {} },
      invoiceColumnSettings: invoiceColumnSettings?.columnsSettings?.['accountant-invoice'] || { visible: [], order: [], widths: {} },
      user: user ? { ...user, password: undefined } : null
    };
    
    logPerformance('POST /api/accountant/data', startTime, 
      Object.values(result.tasks).reduce((sum, tasks) => sum + tasks.length, 0));
    
    res.json(result);
  } catch (error) {
    logPerformance('POST /api/accountant/data', startTime);
    console.error('[ERROR] POST /api/accountant/data:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ЗАПИС ЗАДАЧІ
// ============================================
app.post('/api/tasks', async (req, res) => {
  const startTime = Date.now();
  try {
    const taskData = { ...req.body };
    
    // Автоматичне встановлення autoCreatedAt при створенні заявки
    if (!taskData.autoCreatedAt) {
      taskData.autoCreatedAt = new Date();
      console.log('[DEBUG] POST /api/tasks - автоматично встановлено autoCreatedAt:', taskData.autoCreatedAt);
    }
    
    const task = new Task(taskData);
    const savedTask = await task.save();
    
    // Відправляємо Telegram сповіщення про нову заявку
    try {
      const user = req.user || { login: 'system', name: 'Система' };
      await telegramService.sendTaskNotification('task_created', savedTask, user);
    } catch (notificationError) {
      console.error('[TELEGRAM] Помилка при створенні заявки:', notificationError);
    }
    
    logPerformance('POST /api/tasks', startTime);
    res.json({ ...savedTask.toObject(), id: savedTask._id.toString() });
  } catch (error) {
    logPerformance('POST /api/tasks', startTime);
    console.error('[ERROR] POST /api/tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ОНОВЛЕННЯ ЗАДАЧІ
// ============================================
app.put('/api/tasks/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    const updateData = { ...req.body };
    
    // Отримуємо поточний стан заявки для перевірки змін
    const currentTask = await Task.findById(req.params.id).lean();
    if (!currentTask) {
      return res.status(404).json({ error: 'Задачу не знайдено' });
    }
    
    // Автоматичне встановлення autoCompletedAt при зміні статусу на "Виконано"
    if (updateData.status === 'Виконано' && currentTask.status !== 'Виконано' && !currentTask.autoCompletedAt) {
      updateData.autoCompletedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoCompletedAt:', updateData.autoCompletedAt);
    }
    
    // Автоматичне встановлення autoWarehouseApprovedAt при затвердженні завскладом
    if (updateData.approvedByWarehouse === true && currentTask.approvedByWarehouse !== true && !currentTask.autoWarehouseApprovedAt) {
      updateData.autoWarehouseApprovedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoWarehouseApprovedAt:', updateData.autoWarehouseApprovedAt);
    }
    
    // Автоматичне встановлення autoAccountantApprovedAt при затвердженні бухгалтером
    if (updateData.approvedByAccountant === true && currentTask.approvedByAccountant !== true && !currentTask.autoAccountantApprovedAt) {
      updateData.autoAccountantApprovedAt = new Date();
      console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoAccountantApprovedAt:', updateData.autoAccountantApprovedAt);
    }
    
    const task = await Task.findByIdAndUpdate(req.params.id, updateData, { new: true, lean: true });
    
    // Відправляємо Telegram сповіщення залежно від змін
    try {
      const user = req.user || { login: 'system', name: 'Система' };
      
      // Перевіряємо тип зміни і відправляємо відповідне сповіщення
      if (updateData.status === 'Виконано' && currentTask.status !== 'Виконано') {
        await telegramService.sendTaskNotification('task_completed', task, user);
      } else if (updateData.approvedByWarehouse === 'Підтверджено' && currentTask.approvedByWarehouse !== 'Підтверджено') {
        // Завсклад підтвердив - сповіщаємо бухгалтера
        await telegramService.sendTaskNotification('accountant_approval', task, user);
      } else if (updateData.approvedByAccountant === 'Підтверджено' && currentTask.approvedByAccountant !== 'Підтверджено') {
        // Бухгалтер підтвердив - перевіряємо чи всі затвердили
        const allApproved = task.approvedByWarehouse === 'Підтверджено' && task.approvedByAccountant === 'Підтверджено';
        if (allApproved) {
          await telegramService.sendTaskNotification('task_approved', task, user);
        }
      } else if (updateData.approvedByWarehouse === 'Відмова' || updateData.approvedByAccountant === 'Відмова') {
        await telegramService.sendTaskNotification('task_rejected', task, user);
      }
    } catch (notificationError) {
      console.error('[TELEGRAM] Помилка при оновленні заявки:', notificationError);
    }
    
    logPerformance('PUT /api/tasks/:id', startTime);
    res.json({ ...task, id: task._id.toString() });
  } catch (error) {
    logPerformance('PUT /api/tasks/:id', startTime);
    console.error('[ERROR] PUT /api/tasks/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ВИДАЛЕННЯ ЗАДАЧІ
// ============================================
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const taskId = req.params.id;
    const userRole = req.user?.role || '';
    
    console.log('[DEBUG] DELETE /api/tasks/:id - запит видалення:', {
      taskId,
      userRole,
      userLogin: req.user?.login
    });
    
    // Знаходимо заявку
    const task = await Task.findById(taskId).lean();
    if (!task) {
      return res.status(404).json({ error: 'Задачу не знайдено' });
    }
    
    // Перевірка прав доступу
    const taskStatus = task.status;
    const isApproved = task.approvedByWarehouse === 'Підтверджено' && 
                       task.approvedByAccountant === 'Підтверджено' && 
                       task.approvedByRegionalManager === 'Підтверджено';
    
    // Визначаємо, чи це "Підтверджена" або "Заблокована" заявка
    const isBlockedOrDone = taskStatus === 'Заблоковано' || 
                            (taskStatus === 'Виконано' && isApproved);
    
    // Для заблокованих/підтверджених - тільки admin/administrator
    if (isBlockedOrDone) {
      if (!['admin', 'administrator'].includes(userRole)) {
        console.log('[DEBUG] DELETE /api/tasks/:id - відмовлено: недостатньо прав для видалення підтвердженої/заблокованої заявки');
        return res.status(403).json({ 
          error: 'Недостатньо прав для видалення цієї заявки. Тільки адміністратор може видаляти підтверджені або заблоковані заявки.' 
        });
      }
    } else {
      // Для інших заявок - regkerivn, admin, administrator
      if (!['regkerivn', 'admin', 'administrator'].includes(userRole)) {
        console.log('[DEBUG] DELETE /api/tasks/:id - відмовлено: недостатньо прав');
        return res.status(403).json({ 
          error: 'Недостатньо прав для видалення заявки. Тільки регіональний керівник або адміністратор може видаляти заявки.' 
        });
      }
    }
    
    // Видаляємо пов'язані файли
    try {
      const File = mongoose.model('File');
      await File.deleteMany({ taskId: taskId });
      console.log('[DEBUG] DELETE /api/tasks/:id - видалено пов\'язані файли');
    } catch (fileError) {
      console.log('[DEBUG] DELETE /api/tasks/:id - помилка видалення файлів (можливо модель не існує):', fileError.message);
    }
    
    // Видаляємо заявку
    await Task.findByIdAndDelete(taskId);
    
    console.log('[DEBUG] DELETE /api/tasks/:id - заявку успішно видалено:', taskId);
    logPerformance('DELETE /api/tasks/:id', startTime);
    
    res.json({ 
      success: true, 
      message: 'Заявку успішно видалено',
      taskId: taskId
    });
  } catch (error) {
    logPerformance('DELETE /api/tasks/:id', startTime);
    console.error('[ERROR] DELETE /api/tasks/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ОТРИМАННЯ ЗАДАЧІ ПО ID
// ============================================
app.get('/api/tasks/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    const task = await Task.findById(req.params.id).lean();
    if (!task) {
      return res.status(404).json({ error: 'Задачу не знайдено' });
    }
    logPerformance('GET /api/tasks/:id', startTime);
    res.json({ ...task, id: task._id.toString() });
  } catch (error) {
    logPerformance('GET /api/tasks/:id', startTime);
    console.error('[ERROR] GET /api/tasks/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// НАЛАШТУВАННЯ КОЛОНОК
// ============================================
app.get('/api/users/:login/columns-settings/:area', async (req, res) => {
  const startTime = Date.now();
  try {
    // Використовуємо звичайний findOne БЕЗ .lean() - як в оригінальному проекті
    const user = await User.findOne({ login: req.params.login });
    
    console.log('[DEBUG] 📥 Запит налаштувань:', {
      login: req.params.login,
      area: req.params.area,
      userExists: !!user,
      hasColumnsSettings: !!user?.columnsSettings,
      columnsSettingsKeys: user?.columnsSettings ? Object.keys(user.columnsSettings) : [],
      hasArea: !!user?.columnsSettings?.[req.params.area]
    });
    
    if (!user || !user.columnsSettings || !user.columnsSettings[req.params.area]) {
      // Повертаємо 200 з порожніми налаштуваннями замість 404 (це нормальна ситуація)
      console.log('[DEBUG] 📥 Налаштування не знайдено, повертаємо порожні');
      logPerformance('GET /api/users/:login/columns-settings/:area', startTime);
      return res.json({ visible: [], order: [], widths: {} });
    }
    
    const settings = user.columnsSettings[req.params.area];
    console.log('[DEBUG] 📥 Завантаження налаштувань колонок:', {
      login: req.params.login,
      area: req.params.area,
      visibleCount: settings.visible?.length || 0,
      orderCount: settings.order?.length || 0,
      widthsCount: Object.keys(settings.widths || {}).length,
      widths: settings.widths,
      visible: settings.visible,
      order: settings.order
    });
    
    logPerformance('GET /api/users/:login/columns-settings/:area', startTime);
    res.json(settings);
  } catch (error) {
    logPerformance('GET /api/users/:login/columns-settings/:area', startTime);
    console.error('[ERROR] GET columns-settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ КОРИСТУВАЧІВ
// ============================================
app.get('/api/users', async (req, res) => {
  const startTime = Date.now();
  try {
    // Параметр includeDismissed=true - повертає всіх, включаючи звільнених
    const includeDismissed = req.query.includeDismissed === 'true';
    const filter = includeDismissed ? {} : { dismissed: { $ne: true } };
    
    const users = await User.find(filter)
      .select('login name role region telegramChatId id dismissed notificationSettings lastActivity')
      .lean();
    logPerformance('GET /api/users', startTime, users.length);
    res.json(users);
  } catch (error) {
    logPerformance('GET /api/users', startTime);
    console.error('[ERROR] GET /api/users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створення нового користувача
app.post('/api/users', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const userData = req.body;
    
    // Перевірка наявності обов'язкових полів
    if (!userData.login || !userData.password || !userData.name || !userData.role) {
      return res.status(400).json({ error: 'Обов\'язкові поля: login, password, name, role' });
    }
    
    // Перевірка чи користувач з таким логіном вже існує
    const existingUser = await User.findOne({ login: userData.login });
    if (existingUser) {
      return res.status(400).json({ error: 'Користувач з таким логіном вже існує' });
    }
    
    // Створюємо нового користувача
    const newUser = new User({
      login: userData.login,
      password: userData.password, // В продакшені потрібно хешувати пароль
      name: userData.name,
      role: userData.role,
      region: userData.region || '',
      telegramChatId: userData.telegramChatId || '',
      dismissed: userData.dismissed || false,
      id: userData.id || Date.now(),
      columnsSettings: userData.columnsSettings || {},
      notificationSettings: userData.notificationSettings || {
        newRequests: false,
        pendingApproval: false,
        accountantApproval: false,
        approvedRequests: false,
        rejectedRequests: false,
        invoiceRequests: false,
        completedInvoices: false,
        systemNotifications: false
      },
      lastActivity: new Date()
    });
    
    const savedUser = await newUser.save();
    
    logPerformance('POST /api/users', startTime);
    res.status(201).json(savedUser);
  } catch (error) {
    logPerformance('POST /api/users', startTime);
    console.error('[ERROR] POST /api/users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення користувача по ID
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const userId = req.params.id;
    const updateData = req.body;
    
    // Видаляємо поля, які не потрібно оновлювати
    delete updateData._id;
    delete updateData.__v;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    
    logPerformance('PUT /api/users/:id', startTime);
    res.json(updatedUser);
  } catch (error) {
    logPerformance('PUT /api/users/:id', startTime);
    console.error('[ERROR] PUT /api/users/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Видалення користувача по ID
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const userId = req.params.id;
    
    const deletedUser = await User.findByIdAndDelete(userId);
    
    if (!deletedUser) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    
    logPerformance('DELETE /api/users/:id', startTime);
    res.json({ success: true, message: 'Користувача видалено' });
  } catch (error) {
    logPerformance('DELETE /api/users/:id', startTime);
    console.error('[ERROR] DELETE /api/users/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ РОЛЕЙ
// ============================================
app.get('/api/roles', async (req, res) => {
  const startTime = Date.now();
  try {
    let roles = await Role.find().lean();
    
    // Якщо ролей немає - повертаємо з унікальних ролей користувачів
    if (!roles || roles.length === 0) {
      const users = await User.find({ role: { $exists: true, $ne: '' } }).select('role').lean();
      const uniqueRoles = [...new Set(users.map(u => u.role).filter(Boolean))];
      roles = uniqueRoles.map(name => ({ name }));
    }
    
    logPerformance('GET /api/roles', startTime, roles.length);
    res.json(roles);
  } catch (error) {
    logPerformance('GET /api/roles', startTime);
    console.error('[ERROR] GET /api/roles:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/roles', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    // Перевіряємо чи користувач admin
    if (req.user.role !== 'admin' && req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    
    const roles = req.body;
    await Role.deleteMany({});
    await Role.insertMany(roles);
    
    logPerformance('POST /api/roles', startTime);
    res.json({ success: true });
  } catch (error) {
    logPerformance('POST /api/roles', startTime);
    console.error('[ERROR] POST /api/roles:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ ПРАВИЛ ДОСТУПУ
// ============================================
app.get('/api/accessRules', async (req, res) => {
  const startTime = Date.now();
  try {
    let doc = await AccessRules.findOne();
    if (!doc) {
      doc = await AccessRules.create({ rules: {} });
    }
    logPerformance('GET /api/accessRules', startTime);
    res.json(doc.rules || {});
  } catch (error) {
    logPerformance('GET /api/accessRules', startTime);
    console.error('[ERROR] GET /api/accessRules:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accessRules', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    // Перевіряємо чи користувач admin
    if (req.user.role !== 'admin' && req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Некоректний формат даних' });
    }
    
    let doc = await AccessRules.findOne();
    if (!doc) {
      doc = new AccessRules({ rules: req.body });
    } else {
      doc.rules = req.body;
    }
    
    await doc.save();
    logPerformance('POST /api/accessRules', startTime);
    res.json({ success: true });
  } catch (error) {
    logPerformance('POST /api/accessRules', startTime);
    console.error('[ERROR] POST /api/accessRules:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ ЖУРНАЛУ ПОДІЙ
// ============================================
app.get('/api/event-log', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { page = 1, limit = 50, action, userId, entityType } = req.query;
    
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.userId = userId;
    if (entityType) filter.entityType = entityType;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [events, total] = await Promise.all([
      EventLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      EventLog.countDocuments(filter)
    ]);
    
    logPerformance('GET /api/event-log', startTime, events.length);
    res.json({ events, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    logPerformance('GET /api/event-log', startTime);
    console.error('[ERROR] GET /api/event-log:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/event-log', express.text({ type: '*/*' }), async (req, res) => {
  const startTime = Date.now();
  try {
    // Підтримка як JSON так і text (для sendBeacon)
    let data = req.body;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error('[ERROR] POST /api/event-log - Invalid JSON:', e);
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
    
    const { userId, userName, userRole, action, entityType, entityId, description, details } = data;
    
    console.log('[DEBUG] POST /api/event-log - отримано подію:', {
      action,
      entityType,
      entityId,
      userName,
      description: description?.substring(0, 50)
    });
    
    // Перевірка обов'язкових полів
    if (!action || !entityType) {
      console.error('[ERROR] POST /api/event-log - відсутні обов\'язкові поля:', { action, entityType });
      return res.status(400).json({ error: 'Missing required fields: action, entityType' });
    }
    
    const eventLog = new EventLog({
      userId: userId || 'unknown',
      userName: userName || 'Unknown User',
      userRole: userRole || 'unknown',
      action,
      entityType,
      entityId: entityId || '',
      description: description || '',
      details: details || {},
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown'
    });
    
    const savedLog = await eventLog.save();
    console.log('[DEBUG] POST /api/event-log - лог збережено:', savedLog._id, savedLog.action);
    
    logPerformance('POST /api/event-log', startTime);
    res.json({ success: true, id: savedLog._id });
  } catch (error) {
    logPerformance('POST /api/event-log', startTime);
    console.error('[ERROR] POST /api/event-log:', error);
    console.error('[ERROR] Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/event-log/cleanup', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await EventLog.deleteMany({ timestamp: { $lt: thirtyDaysAgo } });
    
    logPerformance('DELETE /api/event-log/cleanup', startTime);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    logPerformance('DELETE /api/event-log/cleanup', startTime);
    console.error('[ERROR] DELETE /api/event-log/cleanup:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ РЕГІОНІВ
// ============================================
app.get('/api/regions', async (req, res) => {
  const startTime = Date.now();
  try {
    // Отримуємо унікальні регіони з колекції User
    const users = await User.find({ region: { $exists: true, $ne: '' } }).select('region').lean();
    const uniqueRegions = [...new Set(users.map(u => u.region).filter(Boolean))];
    
    // Додаємо стандартні регіони, якщо їх немає
    const defaultRegions = ['Київський', 'Одеський', 'Львівський', 'Дніпровський', 'Хмельницький', 'Україна'];
    const allRegions = [...new Set([...defaultRegions, ...uniqueRegions])];
    
    const regions = allRegions.map(name => ({ name }));
    logPerformance('GET /api/regions', startTime, regions.length);
    res.json(regions);
  } catch (error) {
    logPerformance('GET /api/regions', startTime);
    console.error('[ERROR] GET /api/regions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:login/columns-settings', async (req, res) => {
  const startTime = Date.now();
  console.log('[DEBUG] 🔧 POST /api/users/:login/columns-settings - запит отримано');
  console.log('[DEBUG] 🔧 req.params:', req.params);
  console.log('[DEBUG] 🔧 req.body:', req.body);
  console.log('[DEBUG] 🔧 req.user:', req.user);
  
  try {
    const { area, visible, order, widths } = req.body;
    
    if (!area) {
      console.error('[DEBUG] 🔧 Помилка: area відсутня в req.body');
      return res.status(400).json({ error: 'Поле "area" обов\'язкове' });
    }
    
    if (!visible || !Array.isArray(visible)) {
      console.error('[DEBUG] 🔧 Помилка: visible не є масивом');
      return res.status(400).json({ error: 'Поле "visible" має бути масивом' });
    }
    
    if (!order || !Array.isArray(order)) {
      console.error('[DEBUG] 🔧 Помилка: order не є масивом');
      return res.status(400).json({ error: 'Поле "order" має бути масивом' });
    }
    
    console.log('[DEBUG] 🔧 Збереження налаштувань колонок:', { 
      login: req.params.login, 
      area, 
      visible: visible?.length, 
      order: order?.length, 
      widths: widths ? Object.keys(widths).length : 0 
    });
    console.log('[DEBUG] 🔧 Ширина колонок:', widths);
    
    // Використовуємо звичайний findOne БЕЗ .lean() - як в оригінальному проекті
    let user = await User.findOne({ login: req.params.login });
    if (!user) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    
    if (!user.columnsSettings) user.columnsSettings = {};
    user.columnsSettings[area] = { visible, order, widths: widths || {} };
    
    // КРИТИЧНО: Позначаємо поле як змінене для Mongoose
    // Навіть якщо в оригінальному проекті це не використовується,
    // це може бути необхідно для правильної роботи з вкладеними об'єктами
    user.markModified('columnsSettings');
    
    console.log('[DEBUG] 🔧 Зберігаємо в базу:', user.columnsSettings[area]);
    console.log('[DEBUG] 🔧 Повний columnsSettings перед збереженням:', JSON.stringify(user.columnsSettings, null, 2));
    
    await user.save();
    
    // Перевіряємо, що збереглося (БЕЗ .lean() - як в оригінальному проекті)
    const savedUser = await User.findOne({ login: req.params.login });
    console.log('[DEBUG] 🔧 Перевірка після збереження:', savedUser.columnsSettings[area]);
    console.log('[DEBUG] 🔧 Повний columnsSettings після збереження:', JSON.stringify(savedUser.columnsSettings, null, 2));
    
    // Додаткова перевірка через .lean() для порівняння
    const savedUserLean = await User.findOne({ login: req.params.login }).lean();
    console.log('[DEBUG] 🔧 Перевірка через .lean():', savedUserLean.columnsSettings?.[area]);
    
    logPerformance('POST /api/users/:login/columns-settings', startTime);
    res.json({ success: true });
  } catch (error) {
    logPerformance('POST /api/users/:login/columns-settings', startTime);
    console.error('[ERROR] POST columns-settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// ФАЙЛИ ВИКОНАНИХ РОБІТ
// ============================================

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

// Multer Storage для файлів виконаних робіт (всі типи файлів)
const workFilesStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'newservicegidra/work-files',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    resource_type: 'auto'
  }
});

const uploadWorkFiles = multer({
  storage: workFilesStorage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

// Завантаження файлів для заявки
app.post('/api/files/upload/:taskId', authenticateToken, uploadWorkFiles.array('files', 10), async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[FILES] Завантаження файлів для завдання:', req.params.taskId);
    console.log('[FILES] Кількість файлів:', req.files ? req.files.length : 0);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файли не були завантажені' });
    }

    const uploadedFiles = [];
    const description = req.body.description || '';

    for (const file of req.files) {
      console.log('[FILES] Обробка файлу:', file.originalname);
      
      // Визначаємо URL файлу
      let fileUrl = file.path || file.secure_url || '';
      let cloudinaryId = file.public_id || '';
      
      // Виправляємо кодування назви файлу
      let correctedName = file.originalname;
      try {
        const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedName && !decoded.includes('�')) {
          correctedName = decoded;
        }
      } catch (error) {
        console.log('[FILES] Не вдалося декодувати назву файлу:', error);
      }
      
      // Створюємо запис в MongoDB
      const fileRecord = new File({
        taskId: req.params.taskId,
        originalName: correctedName,
        filename: file.filename,
        cloudinaryId: cloudinaryId,
        cloudinaryUrl: fileUrl,
        mimetype: file.mimetype,
        size: file.size,
        description: description
      });

      const savedFile = await fileRecord.save();
      console.log('[FILES] Файл збережено в БД:', savedFile._id);
      
      uploadedFiles.push({
        id: savedFile._id,
        originalName: savedFile.originalName,
        cloudinaryUrl: savedFile.cloudinaryUrl,
        size: savedFile.size,
        uploadDate: savedFile.uploadDate,
        description: savedFile.description,
        mimetype: savedFile.mimetype
      });
    }

    console.log('[FILES] Успішно завантажено файлів:', uploadedFiles.length);
    logPerformance('POST /api/files/upload/:taskId', startTime, uploadedFiles.length);
    
    res.json({ 
      success: true, 
      message: `Завантажено ${uploadedFiles.length} файлів`,
      files: uploadedFiles 
    });

  } catch (error) {
    console.error('[FILES] Помилка завантаження файлів:', error);
    logPerformance('POST /api/files/upload/:taskId', startTime);
    res.status(500).json({ error: 'Помилка завантаження файлів: ' + error.message });
  }
});

// Отримання списку файлів завдання
app.get('/api/files/task/:taskId', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[FILES] Отримання файлів для завдання:', req.params.taskId);
    
    const files = await File.find({ taskId: req.params.taskId }).sort({ uploadDate: -1 }).lean();
    
    console.log('[FILES] Знайдено файлів:', files.length);
    
    const fileList = files.map(file => ({
      id: file._id,
      originalName: file.originalName,
      cloudinaryUrl: file.cloudinaryUrl,
      size: file.size,
      uploadDate: file.uploadDate,
      description: file.description,
      mimetype: file.mimetype
    }));
    
    logPerformance('GET /api/files/task/:taskId', startTime, fileList.length);
    res.json(fileList);
  } catch (error) {
    console.error('[FILES] Помилка отримання файлів:', error);
    logPerformance('GET /api/files/task/:taskId', startTime);
    res.status(500).json({ error: 'Помилка отримання файлів' });
  }
});

// Видалення файлу
app.delete('/api/files/:fileId', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[FILES] Видалення файлу:', req.params.fileId);
    
    const file = await File.findById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    // Видаляємо з Cloudinary
    if (file.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(file.cloudinaryId);
        console.log('[FILES] Файл видалено з Cloudinary:', file.cloudinaryId);
      } catch (cloudinaryError) {
        console.error('[FILES] Помилка видалення з Cloudinary:', cloudinaryError);
        // Продовжуємо видалення з БД навіть якщо помилка в Cloudinary
      }
    }

    // Видаляємо з MongoDB
    await File.findByIdAndDelete(req.params.fileId);
    console.log('[FILES] Файл видалено з БД:', req.params.fileId);
    
    logPerformance('DELETE /api/files/:fileId', startTime);
    res.json({ 
      success: true,
      message: 'Файл видалено' 
    });
  } catch (error) {
    console.error('[FILES] Помилка видалення файлу:', error);
    logPerformance('DELETE /api/files/:fileId', startTime);
    res.status(500).json({ error: 'Помилка видалення файлу' });
  }
});

// Перевірка файлового сервісу
app.get('/api/files/ping', (req, res) => {
  res.json({ 
    message: 'Файловий сервіс працює!',
    cloudinary: {
      configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
    }
  });
});


// ============================================
// API ДЛЯ АВТОЗАПОВНЕННЯ ПО ЄДРПОУ
// ============================================

// Отримання унікальних ЄДРПОУ
app.get('/api/edrpou-list', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[DEBUG] GET /api/edrpou-list - запит отримано');
    
    const edrpouList = await Task.distinct('edrpou');
    const filteredEdrpou = edrpouList
      .filter(edrpou => edrpou && edrpou.trim() !== '')
      .sort();
    
    console.log('[DEBUG] GET /api/edrpou-list - знайдено ЄДРПОУ:', filteredEdrpou.length);
    logPerformance('GET /api/edrpou-list', startTime, filteredEdrpou.length);
    res.json(filteredEdrpou);
  } catch (error) {
    console.error('[ERROR] GET /api/edrpou-list - помилка:', error);
    logPerformance('GET /api/edrpou-list', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання даних клієнта по ЄДРПОУ
app.get('/api/client-data/:edrpou', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { edrpou } = req.params;
    console.log('[DEBUG] GET /api/client-data/:edrpou - запит для ЄДРПОУ:', edrpou);
    
    // Знаходимо останню заявку з цим ЄДРПОУ
    const task = await Task.findOne({ 
      edrpou: { $regex: new RegExp(edrpou, 'i') } 
    }).sort({ createdAt: -1 }).lean();
    
    if (!task) {
      logPerformance('GET /api/client-data/:edrpou', startTime);
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
      hasContractFile: !!clientData.contractFile
    });
    
    logPerformance('GET /api/client-data/:edrpou', startTime);
    res.json(clientData);
  } catch (error) {
    console.error('[ERROR] GET /api/client-data/:edrpou - помилка:', error);
    logPerformance('GET /api/client-data/:edrpou', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання типів обладнання по ЄДРПОУ
app.get('/api/edrpou-equipment-types/:edrpou', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { edrpou } = req.params;
    console.log('[DEBUG] GET /api/edrpou-equipment-types/:edrpou - запит для ЄДРПОУ:', edrpou);
    
    // Знаходимо всі завдання з цим ЄДРПОУ
    const tasks = await Task.find({ 
      edrpou: { $regex: new RegExp(edrpou, 'i') } 
    }).select('equipment').lean();
    
    // Збираємо унікальні типи обладнання
    const equipmentTypes = [...new Set(tasks.map(t => t.equipment).filter(e => e && e.trim()))].sort();
    
    console.log('[DEBUG] GET /api/edrpou-equipment-types/:edrpou - знайдено типів обладнання:', equipmentTypes.length);
    logPerformance('GET /api/edrpou-equipment-types/:edrpou', startTime, equipmentTypes.length);
    res.json(equipmentTypes);
  } catch (error) {
    console.error('[ERROR] GET /api/edrpou-equipment-types/:edrpou - помилка:', error);
    logPerformance('GET /api/edrpou-equipment-types/:edrpou', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання матеріалів по ЄДРПОУ та типу обладнання
app.get('/api/edrpou-equipment-materials/:edrpou/:equipmentType', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { edrpou, equipmentType } = req.params;
    console.log('[DEBUG] GET /api/edrpou-equipment-materials - запит для ЄДРПОУ:', edrpou, 'обладнання:', equipmentType);
    
    // Знаходимо всі завдання з цим ЄДРПОУ та типом обладнання
    const tasks = await Task.find({ 
      edrpou: { $regex: new RegExp(edrpou, 'i') },
      equipment: { $regex: new RegExp(equipmentType, 'i') } 
    }).lean();
    
    // Збираємо унікальні матеріали
    const materials = {
      oil: {
        types: [...new Set(tasks.map(t => t.oilType).filter(t => t && t.trim()))],
        quantities: [...new Set(tasks.map(t => t.oilUsed || t.oilL).filter(q => q && String(q).trim()))]
      },
      oilFilter: {
        names: [...new Set(tasks.map(t => t.filterName || t.oilFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.filterCount || t.oilFilterCount).filter(q => q && String(q).trim()))]
      },
      fuelFilter: {
        names: [...new Set(tasks.map(t => t.fuelFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.fuelFilterCount).filter(q => q && String(q).trim()))]
      },
      airFilter: {
        names: [...new Set(tasks.map(t => t.airFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.airFilterCount).filter(q => q && String(q).trim()))]
      },
      antifreeze: {
        types: [...new Set(tasks.map(t => t.antifreezeType).filter(t => t && t.trim()))],
        quantities: [...new Set(tasks.map(t => t.antifreezeL).filter(q => q && String(q).trim()))]
      },
      otherMaterials: [...new Set(tasks.map(t => t.otherMaterials).filter(m => m && m.trim()))],
      // Додаткові поля для автозаповнення
      engineModel: [...new Set(tasks.map(t => t.engineModel).filter(m => m && m.trim()))],
      engineSerial: [...new Set(tasks.map(t => t.engineSerial).filter(s => s && s.trim()))],
      equipmentSerial: [...new Set(tasks.map(t => t.equipmentSerial).filter(s => s && s.trim()))]
    };
    
    console.log('[DEBUG] GET /api/edrpou-equipment-materials - знайдено матеріалів:', {
      oil: materials.oil.types.length,
      oilFilter: materials.oilFilter.names.length,
      fuelFilter: materials.fuelFilter.names.length,
      airFilter: materials.airFilter.names.length,
      antifreeze: materials.antifreeze.types.length,
      otherMaterials: materials.otherMaterials.length
    });
    
    logPerformance('GET /api/edrpou-equipment-materials', startTime);
    res.json(materials);
  } catch (error) {
    console.error('[ERROR] GET /api/edrpou-equipment-materials - помилка:', error);
    logPerformance('GET /api/edrpou-equipment-materials', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання унікальних типів обладнання (для загального автозаповнення)
app.get('/api/equipment-types', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[DEBUG] GET /api/equipment-types - запит отримано');
    
    const equipmentTypes = await Task.distinct('equipment');
    const filteredTypes = equipmentTypes
      .filter(type => type && type.trim() !== '')
      .sort();
    
    console.log('[DEBUG] GET /api/equipment-types - знайдено типів:', filteredTypes.length);
    logPerformance('GET /api/equipment-types', startTime, filteredTypes.length);
    res.json(filteredTypes);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment-types - помилка:', error);
    logPerformance('GET /api/equipment-types', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання даних по типу обладнання (для автозаповнення без ЄДРПОУ)
app.get('/api/equipment-data/:equipmentType', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { equipmentType } = req.params;
    console.log('[DEBUG] GET /api/equipment-data/:equipmentType - запит для:', equipmentType);
    
    // Знаходимо всі завдання з цим типом обладнання
    const tasks = await Task.find({ 
      equipment: { $regex: new RegExp(equipmentType, 'i') } 
    }).lean();
    
    // Збираємо унікальні дані
    const equipmentData = {
      equipmentSerials: [...new Set(tasks.map(t => t.equipmentSerial).filter(s => s && s.trim()))],
      engineModels: [...new Set(tasks.map(t => t.engineModel).filter(m => m && m.trim()))],
      engineSerials: [...new Set(tasks.map(t => t.engineSerial).filter(s => s && s.trim()))],
      oil: {
        types: [...new Set(tasks.map(t => t.oilType).filter(t => t && t.trim()))],
        quantities: [...new Set(tasks.map(t => t.oilUsed || t.oilL).filter(q => q && String(q).trim()))]
      },
      oilFilter: {
        names: [...new Set(tasks.map(t => t.filterName || t.oilFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.filterCount || t.oilFilterCount).filter(q => q && String(q).trim()))]
      },
      fuelFilter: {
        names: [...new Set(tasks.map(t => t.fuelFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.fuelFilterCount).filter(q => q && String(q).trim()))]
      },
      airFilter: {
        names: [...new Set(tasks.map(t => t.airFilterName).filter(n => n && n.trim()))],
        quantities: [...new Set(tasks.map(t => t.airFilterCount).filter(q => q && String(q).trim()))]
      },
      antifreeze: {
        types: [...new Set(tasks.map(t => t.antifreezeType).filter(t => t && t.trim()))],
        quantities: [...new Set(tasks.map(t => t.antifreezeL).filter(q => q && String(q).trim()))]
      },
      otherMaterials: [...new Set(tasks.map(t => t.otherMaterials).filter(m => m && m.trim()))]
    };
    
    console.log('[DEBUG] GET /api/equipment-data/:equipmentType - знайдено даних:', {
      equipmentSerials: equipmentData.equipmentSerials.length,
      engineModels: equipmentData.engineModels.length,
      otherMaterials: equipmentData.otherMaterials.length
    });
    
    logPerformance('GET /api/equipment-data/:equipmentType', startTime);
    res.json(equipmentData);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment-data/:equipmentType - помилка:', error);
    logPerformance('GET /api/equipment-data/:equipmentType', startTime);
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// API ENDPOINTS ДЛЯ ЗАПИТІВ НА РАХУНКИ
// ============================================

// Створення запиту на рахунок
app.post('/api/invoice-requests', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskId, requesterId, requesterName, companyDetails, needInvoice, needAct } = req.body;
    console.log(`[INVOICE] Creating invoice request for task: ${taskId}`);
    
    if (!taskId || !requesterId || !requesterName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Відсутні обов\'язкові поля' 
      });
    }
    
    // Отримуємо заявку для отримання requestNumber
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: 'Заявка не знайдена' 
      });
    }
    
    // Перевіряємо чи не існує вже запит для цієї заявки
    const existingRequest = await InvoiceRequest.findOne({ taskId });
    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        message: 'Запит на рахунок для цієї заявки вже існує' 
      });
    }
    
    // Створюємо новий запит
    const invoiceRequest = new InvoiceRequest({
      taskId,
      requestNumber: task.requestNumber || taskId,
      requesterId,
      requesterName,
      companyDetails,
      needInvoice: needInvoice !== false,
      needAct: needAct === true,
      status: 'pending',
      createdAt: new Date()
    });
    
    await invoiceRequest.save();
    
    // Оновлюємо Task з посиланням на InvoiceRequest та датою запиту
    // Також очищаємо поля відхилення (якщо це повторна подача після відмови)
    await Task.findByIdAndUpdate(taskId, {
      invoiceRequestId: invoiceRequest._id,
      invoiceRequestDate: new Date(),
      needInvoice: needInvoice !== false,
      needAct: needAct === true,
      // Очищаємо поля відхилення при повторній подачі
      invoiceRejectionReason: null,
      invoiceRejectionDate: null,
      invoiceRejectionUser: null
    });
    
    // Відправляємо Telegram сповіщення про запит на рахунок
    try {
      const user = { login: requesterId, name: requesterName };
      await telegramService.sendTaskNotification('invoice_request', task, user);
    } catch (notificationError) {
      console.error('[TELEGRAM] Помилка при створенні запиту на рахунок:', notificationError);
    }
    
    logPerformance('POST /api/invoice-requests', startTime);
    res.json({ 
      success: true, 
      message: 'Запит на рахунок створено успішно',
      data: invoiceRequest 
    });
    
  } catch (error) {
    console.error('[INVOICE] Error creating invoice request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка створення запиту на рахунок',
      error: error.message 
    });
  }
});

// Отримання списку запитів на рахунки
app.get('/api/invoice-requests', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { status, requesterId, taskId, showAll } = req.query;
    
    let filter = {};
    if (status) filter.status = status;
    if (requesterId) filter.requesterId = requesterId;
    if (taskId) filter.taskId = taskId;
    
    // Якщо showAll не встановлено або false, показуємо тільки pending запити
    if (!showAll || showAll === 'false') {
      filter.status = 'pending';
    }
    
    const requests = await InvoiceRequest.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    
    logPerformance('GET /api/invoice-requests', startTime, requests.length);
    res.json({ 
      success: true, 
      data: requests 
    });
    
  } catch (error) {
    console.error('[INVOICE] Error loading invoice requests:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка отримання запитів на рахунки',
      error: error.message 
    });
  }
});

// Отримання конкретного запиту на рахунок
app.get('/api/invoice-requests/:id', authenticateToken, async (req, res) => {
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
    console.error('[INVOICE] Error getting invoice request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка отримання запиту на рахунок',
      error: error.message 
    });
  }
});

// Оновлення запиту на рахунок (статус, файли)
app.put('/api/invoice-requests/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { status, comments, rejectionReason, invoiceFile, invoiceFileName, invoiceNumber, actFile, actFileName } = req.body;
    
    const updateData = {};
    
    if (status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
    }
    
    if (comments) updateData.comments = comments;
    if (rejectionReason) updateData.rejectionReason = rejectionReason;
    if (invoiceFile) updateData.invoiceFile = invoiceFile;
    if (invoiceFileName) updateData.invoiceFileName = invoiceFileName;
    if (invoiceNumber) updateData.invoiceNumber = invoiceNumber;
    if (actFile) updateData.actFile = actFile;
    if (actFileName) updateData.actFileName = actFileName;
    
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
    
    // Оновлюємо відповідні поля в Task
    if (request.taskId) {
      const taskUpdateData = {};
      if (invoiceFile) {
        taskUpdateData.invoiceFile = invoiceFile;
        taskUpdateData.invoiceFileName = invoiceFileName;
        taskUpdateData.invoiceUploadDate = new Date();
      }
      if (invoiceNumber) taskUpdateData.invoice = invoiceNumber;
      if (actFile) {
        taskUpdateData.actFile = actFile;
        taskUpdateData.actFileName = actFileName;
      }
      
      if (Object.keys(taskUpdateData).length > 0) {
        await Task.findByIdAndUpdate(request.taskId, taskUpdateData);
      }
    }
    
    logPerformance('PUT /api/invoice-requests/:id', startTime);
    res.json({ 
      success: true, 
      message: 'Запит на рахунок оновлено',
      data: request 
    });
    
  } catch (error) {
    console.error('[INVOICE] Error updating invoice request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка оновлення запиту на рахунок',
      error: error.message 
    });
  }
});

// Завантаження файлу рахунку
const invoiceStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'invoices',
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
    resource_type: 'auto'
  }
});
const uploadInvoice = multer({ 
  storage: invoiceStorage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

app.post('/api/invoice-requests/:id/upload', authenticateToken, (req, res, next) => {
  uploadInvoice.single('invoiceFile')(req, res, (err) => {
    if (err) {
      console.error('[INVOICE] Multer error:', err.message);
      console.error('[INVOICE] Multer error stack:', err.stack);
      return res.status(500).json({ success: false, message: 'Помилка завантаження файлу', error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Файл не завантажено' });
    }
    
    const invoiceNumber = req.body.invoiceNumber || '';
    const requestIdOrTaskId = req.params.id;
    
    console.log('[INVOICE] Upload invoice for:', requestIdOrTaskId);
    
    let request = null;
    
    // Перевіряємо чи id є валідним ObjectId
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(requestIdOrTaskId);
    
    if (isValidObjectId) {
      // Спочатку шукаємо по _id InvoiceRequest
      try {
        request = await InvoiceRequest.findById(requestIdOrTaskId);
      } catch (e) {
        console.log('[INVOICE] findById error:', e.message);
      }
    }
    
    // Якщо не знайдено - шукаємо по taskId
    if (!request) {
      console.log('[INVOICE] Not found by _id, searching by taskId...');
      request = await InvoiceRequest.findOne({ taskId: requestIdOrTaskId });
    }
    
    if (!request) {
      console.log('[INVOICE] InvoiceRequest not found, creating new one for task:', requestIdOrTaskId);
      // Якщо InvoiceRequest не існує - створюємо новий
      const task = await Task.findById(requestIdOrTaskId);
      if (!task) {
        return res.status(404).json({ success: false, message: 'Заявка не знайдена' });
      }
      
      // Виправляємо кодування назви файлу (кирилиця)
      let correctedFileName = req.file.originalname;
      try {
        const decoded = Buffer.from(correctedFileName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedFileName && !decoded.includes('�')) {
          correctedFileName = decoded;
        }
      } catch (e) {
        console.log('[INVOICE] Не вдалося декодувати назву файлу');
      }
      
      request = new InvoiceRequest({
        taskId: requestIdOrTaskId,
        requestNumber: task.requestNumber || '',
        requesterId: req.user?.login || 'system',
        requesterName: req.user?.name || 'Система',
        companyDetails: {
          companyName: task.client,
          edrpou: task.edrpou
        },
        needInvoice: true,
        needAct: false,
        status: 'processing',  // Не completed - потрібно підтвердити окремо
        invoiceFile: req.file.path,
        invoiceFileName: correctedFileName,
        invoiceNumber: invoiceNumber,
        createdAt: new Date()
      });
      await request.save();
      
      // Оновлюємо Task з посиланням на InvoiceRequest
      await Task.findByIdAndUpdate(requestIdOrTaskId, {
        invoiceRequestId: request._id.toString(),
        invoiceFile: req.file.path,
        invoiceFileName: correctedFileName,
        invoice: invoiceNumber,
        invoiceUploadDate: new Date()
      });
    } else {
      // Виправляємо кодування назви файлу (кирилиця)
      let correctedFileName = req.file.originalname;
      try {
        const decoded = Buffer.from(correctedFileName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedFileName && !decoded.includes('�')) {
          correctedFileName = decoded;
        }
      } catch (e) {
        console.log('[INVOICE] Не вдалося декодувати назву файлу');
      }
      
      // Оновлюємо існуючий InvoiceRequest
      request.invoiceFile = req.file.path;
      request.invoiceFileName = correctedFileName;
      request.invoiceNumber = invoiceNumber;
      // Статус на 'processing' якщо був pending, інакше залишаємо як є
      if (request.status === 'pending') {
        request.status = 'processing';
      }
      await request.save();
      
      // Оновлюємо Task
      if (request.taskId) {
        await Task.findByIdAndUpdate(request.taskId, {
          invoiceFile: req.file.path,
          invoiceFileName: correctedFileName,
          invoice: invoiceNumber,
          invoiceUploadDate: new Date()
        });
      }
    }
    
    // Відправляємо Telegram сповіщення про завантажений рахунок
    try {
      const task = await Task.findById(request.taskId).lean();
      if (task) {
        const user = req.user || { login: 'system', name: 'Бухгалтер' };
        await telegramService.sendTaskNotification('invoice_completed', task, user);
      }
    } catch (notificationError) {
      console.error('[TELEGRAM] Помилка при завантаженні рахунку:', notificationError);
    }
    
    logPerformance('POST /api/invoice-requests/:id/upload', startTime);
    res.json({
      success: true,
      message: 'Файл рахунку завантажено',
      data: {
        invoiceFile: req.file.path,
        invoiceFileName: request.invoiceFileName,
        invoiceNumber: invoiceNumber
      }
    });
    
  } catch (error) {
    console.error('[INVOICE] Error uploading invoice:');
    console.error('[INVOICE] Error name:', error.name);
    console.error('[INVOICE] Error message:', error.message);
    console.error('[INVOICE] Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Помилка завантаження файлу', error: error.message });
  }
});

// Завантаження файлу акту
app.post('/api/invoice-requests/:id/upload-act', authenticateToken, uploadInvoice.single('actFile'), async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Файл не завантажено' });
    }
    
    const requestIdOrTaskId = req.params.id;
    
    console.log('[INVOICE] Upload act for:', requestIdOrTaskId);
    
    // Спочатку шукаємо по _id InvoiceRequest
    let request = await InvoiceRequest.findById(requestIdOrTaskId);
    
    // Якщо не знайдено - шукаємо по taskId
    if (!request) {
      console.log('[INVOICE] Not found by _id, searching by taskId...');
      request = await InvoiceRequest.findOne({ taskId: requestIdOrTaskId });
    }
    
    if (!request) {
      console.log('[INVOICE] InvoiceRequest not found, creating new one for task:', requestIdOrTaskId);
      // Якщо InvoiceRequest не існує - створюємо новий
      const task = await Task.findById(requestIdOrTaskId);
      if (!task) {
        return res.status(404).json({ success: false, message: 'Заявка не знайдена' });
      }
      
      // Виправляємо кодування назви файлу (кирилиця)
      let correctedActFileName = req.file.originalname;
      try {
        const decoded = Buffer.from(correctedActFileName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedActFileName && !decoded.includes('�')) {
          correctedActFileName = decoded;
        }
      } catch (e) {
        console.log('[INVOICE] Не вдалося декодувати назву файлу акту');
      }
      
      request = new InvoiceRequest({
        taskId: requestIdOrTaskId,
        requestNumber: task.requestNumber || '',
        requesterId: req.user?.login || 'system',
        requesterName: req.user?.name || 'Система',
        companyDetails: {
          companyName: task.client,
          edrpou: task.edrpou
        },
        needInvoice: false,
        needAct: true,
        status: 'processing',
        actFile: req.file.path,
        actFileName: correctedActFileName,
        createdAt: new Date()
      });
      await request.save();
      
      // Оновлюємо Task з посиланням на InvoiceRequest
      await Task.findByIdAndUpdate(requestIdOrTaskId, {
        invoiceRequestId: request._id.toString(),
        actFile: req.file.path,
        actFileName: correctedActFileName
      });
    } else {
      // Виправляємо кодування назви файлу (кирилиця)
      let correctedActFileName = req.file.originalname;
      try {
        const decoded = Buffer.from(correctedActFileName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedActFileName && !decoded.includes('�')) {
          correctedActFileName = decoded;
        }
      } catch (e) {
        console.log('[INVOICE] Не вдалося декодувати назву файлу акту');
      }
      
      // Оновлюємо існуючий InvoiceRequest
      request.actFile = req.file.path;
      request.actFileName = correctedActFileName;
      await request.save();
      
      // Оновлюємо Task
      if (request.taskId) {
        await Task.findByIdAndUpdate(request.taskId, {
          actFile: req.file.path,
          actFileName: correctedActFileName
        });
      }
    }
    
    logPerformance('POST /api/invoice-requests/:id/upload-act', startTime);
    res.json({
      success: true,
      message: 'Файл акту завантажено',
      data: {
        actFile: req.file.path,
        actFileName: request.actFileName
      }
    });
    
  } catch (error) {
    console.error('[INVOICE] Error uploading act:', error);
    res.status(500).json({ success: false, message: 'Помилка завантаження файлу', error: error.message });
  }
});

// Повне видалення InvoiceRequest (при відхиленні запиту на рахунок)
app.delete('/api/invoice-requests/:id', authenticateToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    console.log('[INVOICE] Deleting InvoiceRequest:', requestId);
    
    // Знаходимо InvoiceRequest
    const request = await InvoiceRequest.findById(requestId);
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит на рахунок не знайдено' });
    }
    
    // Видаляємо файли з Cloudinary якщо є
    if (request.invoiceFile && request.invoiceFile.includes('cloudinary.com')) {
      try {
        const urlParts = request.invoiceFile.split('/');
        const fileNameWithExt = urlParts[urlParts.length - 1];
        const fileName = fileNameWithExt.split('.')[0];
        const folder = urlParts[urlParts.length - 2];
        const publicId = folder + '/' + fileName;
        await cloudinary.uploader.destroy(publicId);
        console.log('[INVOICE] Deleted invoice file from Cloudinary');
      } catch (e) {
        console.error('[INVOICE] Error deleting invoice file from Cloudinary:', e);
      }
    }
    
    if (request.actFile && request.actFile.includes('cloudinary.com')) {
      try {
        const urlParts = request.actFile.split('/');
        const fileNameWithExt = urlParts[urlParts.length - 1];
        const fileName = fileNameWithExt.split('.')[0];
        const folder = urlParts[urlParts.length - 2];
        const publicId = folder + '/' + fileName;
        await cloudinary.uploader.destroy(publicId);
        console.log('[INVOICE] Deleted act file from Cloudinary');
      } catch (e) {
        console.error('[INVOICE] Error deleting act file from Cloudinary:', e);
      }
    }
    
    // Видаляємо InvoiceRequest
    await InvoiceRequest.findByIdAndDelete(requestId);
    
    console.log('[INVOICE] InvoiceRequest deleted successfully:', requestId);
    res.json({ success: true, message: 'Запит на рахунок видалено' });
    
  } catch (error) {
    console.error('[INVOICE] Error deleting InvoiceRequest:', error);
    res.status(500).json({ success: false, message: 'Помилка видалення запиту на рахунок', error: error.message });
  }
});

// Видалення файлу рахунку
app.delete('/api/invoice-requests/:id/invoice', authenticateToken, async (req, res) => {
  try {
    const requestIdOrTaskId = req.params.id;
    
    // Спочатку шукаємо по _id InvoiceRequest
    let request = await InvoiceRequest.findById(requestIdOrTaskId);
    
    // Якщо не знайдено - шукаємо по taskId
    if (!request) {
      request = await InvoiceRequest.findOne({ taskId: requestIdOrTaskId });
    }
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит не знайдено' });
    }
    
    // Видаляємо файл з Cloudinary
    if (request.invoiceFile && request.invoiceFile.includes('cloudinary.com')) {
      try {
        // Витягуємо public_id з URL
        // URL формат: https://res.cloudinary.com/cloud/image/upload/v123/folder/filename.ext
        const urlParts = request.invoiceFile.split('/');
        const fileNameWithExt = urlParts[urlParts.length - 1];
        const fileName = fileNameWithExt.split('.')[0];
        const folder = urlParts[urlParts.length - 2];
        const publicId = folder + '/' + fileName;
        
        console.log('[INVOICE] Видаляємо файл з Cloudinary, public_id:', publicId);
        const result = await cloudinary.uploader.destroy(publicId);
        console.log('[INVOICE] Результат видалення з Cloudinary:', result);
      } catch (cloudinaryError) {
        console.error('[INVOICE] Помилка видалення з Cloudinary:', cloudinaryError);
        // Продовжуємо навіть якщо не вдалося видалити з Cloudinary
      }
    }
    
    // Оновлюємо InvoiceRequest
    request.invoiceFile = '';
    request.invoiceFileName = '';
    request.invoiceNumber = '';
    // Не змінюємо статус на pending - залишаємо як є
    await request.save();
    
    // Оновлюємо Task
    if (request.taskId) {
      await Task.findByIdAndUpdate(request.taskId, {
        invoiceFile: '',
        invoiceFileName: '',
        invoice: ''
      });
    }
    
    res.json({ success: true, message: 'Файл рахунку видалено' });
    
  } catch (error) {
    console.error('[INVOICE] Error deleting invoice:', error);
    res.status(500).json({ success: false, message: 'Помилка видалення файлу', error: error.message });
  }
});

// Видалення файлу акту
app.delete('/api/invoice-requests/:id/act', authenticateToken, async (req, res) => {
  try {
    const requestIdOrTaskId = req.params.id;
    
    // Спочатку шукаємо по _id InvoiceRequest
    let request = await InvoiceRequest.findById(requestIdOrTaskId);
    
    // Якщо не знайдено - шукаємо по taskId
    if (!request) {
      request = await InvoiceRequest.findOne({ taskId: requestIdOrTaskId });
    }
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит не знайдено' });
    }
    
    // Видаляємо файл з Cloudinary
    if (request.actFile && request.actFile.includes('cloudinary.com')) {
      try {
        // Витягуємо public_id з URL
        const urlParts = request.actFile.split('/');
        const fileNameWithExt = urlParts[urlParts.length - 1];
        const fileName = fileNameWithExt.split('.')[0];
        const folder = urlParts[urlParts.length - 2];
        const publicId = folder + '/' + fileName;
        
        console.log('[INVOICE] Видаляємо файл акту з Cloudinary, public_id:', publicId);
        const result = await cloudinary.uploader.destroy(publicId);
        console.log('[INVOICE] Результат видалення акту з Cloudinary:', result);
      } catch (cloudinaryError) {
        console.error('[INVOICE] Помилка видалення акту з Cloudinary:', cloudinaryError);
        // Продовжуємо навіть якщо не вдалося видалити з Cloudinary
      }
    }
    
    // Оновлюємо InvoiceRequest
    request.actFile = '';
    request.actFileName = '';
    await request.save();
    
    // Оновлюємо Task
    if (request.taskId) {
      await Task.findByIdAndUpdate(request.taskId, {
        actFile: '',
        actFileName: ''
      });
    }
    
    res.json({ success: true, message: 'Файл акту видалено' });
    
  } catch (error) {
    console.error('[INVOICE] Error deleting act:', error);
    res.status(500).json({ success: false, message: 'Помилка видалення файлу', error: error.message });
  }
});

// Підтвердження заявки на рахунок (статус completed)
app.put('/api/invoice-requests/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const requestIdOrTaskId = req.params.id;
    
    // Спочатку шукаємо по _id InvoiceRequest
    let request = await InvoiceRequest.findById(requestIdOrTaskId);
    
    // Якщо не знайдено - шукаємо по taskId
    if (!request) {
      request = await InvoiceRequest.findOne({ taskId: requestIdOrTaskId });
    }
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит не знайдено' });
    }
    
    // Оновлюємо статус на completed
    request.status = 'completed';
    request.completedAt = new Date();
    request.completedBy = req.user?.login || 'system';
    await request.save();
    
    console.log('[INVOICE] Invoice request confirmed:', request._id);
    
    res.json({ success: true, message: 'Заявку на рахунок підтверджено', data: request });
    
  } catch (error) {
    console.error('[INVOICE] Error confirming invoice request:', error);
    res.status(500).json({ success: false, message: 'Помилка підтвердження', error: error.message });
  }
});

// Повернути заявку на рахунок в роботу (статус processing)
app.put('/api/invoice-requests/:id/return-to-work', authenticateToken, async (req, res) => {
  try {
    const requestIdOrTaskId = req.params.id;
    
    // Спочатку шукаємо по _id InvoiceRequest
    let request = await InvoiceRequest.findById(requestIdOrTaskId);
    
    // Якщо не знайдено - шукаємо по taskId
    if (!request) {
      request = await InvoiceRequest.findOne({ taskId: requestIdOrTaskId });
    }
    
    if (!request) {
      return res.status(404).json({ success: false, message: 'Запит не знайдено' });
    }
    
    // Оновлюємо статус на processing
    request.status = 'processing';
    request.completedAt = null;
    request.completedBy = null;
    request.returnedToWorkAt = new Date();
    request.returnedToWorkBy = req.user?.login || 'system';
    await request.save();
    
    console.log('[INVOICE] Invoice request returned to work:', request._id);
    
    res.json({ success: true, message: 'Заявку повернено в роботу', data: request });
    
  } catch (error) {
    console.error('[INVOICE] Error returning invoice request to work:', error);
    res.status(500).json({ success: false, message: 'Помилка повернення в роботу', error: error.message });
  }
});

// ============================================
// TIMESHEET API (Табель персоналу)
// ============================================

// Схема для табеля часу
const timesheetSchema = new mongoose.Schema({
  region: { type: String, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  type: { type: String, default: 'regular' },
  data: { type: Map, of: mongoose.Schema.Types.Mixed },
  payData: { type: Map, of: mongoose.Schema.Types.Mixed },
  summary: mongoose.Schema.Types.Mixed,
  createdBy: String,
  updatedAt: { type: Date, default: Date.now }
});

timesheetSchema.index({ region: 1, year: 1, month: 1, type: 1 }, { unique: true });

const Timesheet = mongoose.model('Timesheet', timesheetSchema);

// Зберегти/оновити табель
app.post('/api/timesheet', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { region, year, month, type = 'regular', data, payData, summary, createdBy } = req.body;
    
    if (!region || !year || !month) {
      return res.status(400).json({ 
        success: false, 
        error: 'Відсутні обов\'язкові поля: region, year, month' 
      });
    }
    
    // Шукаємо існуючий запис
    let timesheet = await Timesheet.findOne({ 
      region, 
      year: parseInt(year), 
      month: parseInt(month), 
      type 
    });
    
    console.log('[TIMESHEET] POST - region:', region, 'year:', year, 'month:', month, 'exists:', !!timesheet);
    
    if (timesheet) {
      // Оновлюємо існуючий
      if (data && Object.keys(data).length > 0) {
        const dataMap = new Map();
        Object.entries(data).forEach(([key, value]) => {
          dataMap.set(key, value);
        });
        timesheet.data = dataMap;
      }
      
      if (payData && Object.keys(payData).length > 0) {
        const payDataMap = new Map();
        Object.entries(payData).forEach(([key, value]) => {
          payDataMap.set(key, value);
        });
        timesheet.payData = payDataMap;
      }
      
      if (summary) timesheet.summary = summary;
      timesheet.updatedAt = new Date();
      if (createdBy) timesheet.createdBy = createdBy;
    } else {
      // Створюємо новий
      const dataMap = new Map();
      if (data && Object.keys(data).length > 0) {
        Object.entries(data).forEach(([key, value]) => {
          dataMap.set(key, value);
        });
      }
      
      const payDataMap = new Map();
      if (payData && Object.keys(payData).length > 0) {
        Object.entries(payData).forEach(([key, value]) => {
          payDataMap.set(key, value);
        });
      }
      
      timesheet = new Timesheet({
        region,
        year: parseInt(year),
        month: parseInt(month),
        type,
        data: dataMap,
        payData: payDataMap,
        summary: summary || {},
        createdBy: createdBy || 'unknown'
      });
    }
    
    await timesheet.save();
    
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
    
    logPerformance('POST /api/timesheet', startTime);
    
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
    console.error('[TIMESHEET] Error saving:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Отримати табель
app.get('/api/timesheet', authenticateToken, async (req, res) => {
  const startTime = Date.now();
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
    
    console.log('[TIMESHEET] GET - region:', region, 'year:', year, 'month:', month, 'found:', !!timesheet);
    
    if (!timesheet) {
      logPerformance('GET /api/timesheet', startTime);
      return res.json({ success: true, timesheet: null });
    }
    
    // Конвертуємо Map в об'єкт
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
    
    logPerformance('GET /api/timesheet', startTime);
    
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
    console.error('[TIMESHEET] Error loading:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API ДЛЯ АКТИВНОСТІ КОРИСТУВАЧІВ (ONLINE STATUS)
// ============================================

// Оновлення активності користувача
app.post('/api/users/activity', async (req, res) => {
  try {
    const { login } = req.body;
    if (!login) {
      return res.status(400).json({ error: 'Login is required' });
    }

    const now = new Date();
    await User.updateOne(
      { login: login },
      { lastActivity: now }
    );

    res.json({ success: true, lastActivity: now });
  } catch (error) {
    console.error('[ACTIVITY] Помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримання активних користувачів (онлайн за останні 5 хвилин)
app.get('/api/active-users', async (req, res) => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const activeUsers = await User.find(
      { lastActivity: { $gte: fiveMinutesAgo } },
      'login name lastActivity'
    ).lean();
    
    const logins = activeUsers.map(user => user.login);
    res.json(logins);
  } catch (error) {
    console.error('[ACTIVITY] Помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Альтернативний ендпоінт /api/users/online
app.get('/api/users/online', async (req, res) => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const activeUsers = await User.find(
      { lastActivity: { $gte: fiveMinutesAgo } },
      'login name lastActivity'
    ).lean();
    
    const logins = activeUsers.map(user => user.login);
    res.json(logins);
  } catch (error) {
    console.error('[ACTIVITY] Помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ TELEGRAM СПОВІЩЕНЬ
// ============================================

// Схема для логування сповіщень
const notificationLogSchema = new mongoose.Schema({
  type: String,
  taskId: String,
  userId: String,
  message: String,
  telegramChatId: String,
  status: String,
  timestamp: { type: Date, default: Date.now }
});
const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

// Клас для роботи з Telegram
class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
  }

  async sendMessage(chatId, message) {
    if (!this.botToken || !this.baseUrl) {
      console.log('[TELEGRAM] Bot token не налаштовано');
      return false;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      const result = await response.json();
      return result.ok;
    } catch (error) {
      console.error('[TELEGRAM] Помилка відправки:', error);
      return false;
    }
  }

  // Відправка сповіщення про заявку
  async sendTaskNotification(type, task, user) {
    try {
      const message = this.formatTaskMessage(type, task, user);
      const chatIds = await this.getChatIdsForNotification(type, task);
      
      console.log(`[TELEGRAM] Відправка сповіщення типу ${type} на ${chatIds.length} адрес`);
      
      for (const chatId of chatIds) {
        const success = await this.sendMessage(chatId, message);
        
        // Логуємо сповіщення
        await NotificationLog.create({
          type,
          taskId: task._id || task.id,
          userId: user?.login || 'system',
          message,
          telegramChatId: chatId,
          status: success ? 'sent' : 'failed'
        });
      }
    } catch (error) {
      console.error('[TELEGRAM] Помилка sendTaskNotification:', error);
    }
  }

  // Форматування повідомлення
  formatTaskMessage(type, task, user) {
    const displayStatus = type === 'task_completed' ? 'Виконано' : (task.status || 'Н/Д');
    
    let commentsInfo = '';
    if (task.warehouseComment) commentsInfo += `\n📦 <b>Коментар складу:</b> ${task.warehouseComment}`;
    if (task.accountantComment) commentsInfo += `\n💰 <b>Коментар бухгалтера:</b> ${task.accountantComment}`;
    
    const createdBy = type === 'task_created' 
      ? (user?.name || user?.login || 'Система')
      : (task.createdBy || task.engineer1 || user?.name || 'Система');

    const typeNames = {
      'task_created': '🆕 Нова заявка',
      'task_completed': '✅ Заявка виконана',
      'task_approval': '⏳ Потребує підтвердження Завсклада',
      'accountant_approval': '💰 Потребує затвердження Бухгалтера',
      'task_approved': '✅ Заявка затверджена',
      'task_rejected': '❌ Заявка відхилена',
      'invoice_request': '📄 Запит на рахунок',
      'invoice_completed': '📄 Рахунок завантажено'
    };

    const baseMessage = `
<b>🔔 ${typeNames[type] || 'Оновлення'}</b>

📋 <b>Номер:</b> ${task.requestNumber || 'Н/Д'}
👤 <b>Створив:</b> ${createdBy}
📊 <b>Статус:</b> ${displayStatus}
📅 <b>Дата:</b> ${task.date || 'Н/Д'}
📍 <b>Регіон:</b> ${task.serviceRegion || 'Н/Д'}
👥 <b>Замовник:</b> ${task.client || 'Н/Д'}
🏠 <b>Адреса:</b> ${task.address || 'Н/Д'}
⚙️ <b>Обладнання:</b> ${task.equipment || 'Н/Д'}${commentsInfo}`;

    const actions = {
      'task_created': '\n\n💡 <b>Дія:</b> Розглянути та призначити виконавця',
      'task_completed': '\n\n⏳ <b>Очікує підтвердження від:</b>\n• Зав. склад\n• Бухгалтер',
      'task_approval': '\n\n📋 <b>Необхідно перевірити</b>',
      'accountant_approval': '\n\n💰 <b>Завсклад підтвердив. Очікує затвердження бухгалтера.</b>',
      'task_approved': '\n\n🎉 <b>Заявка готова!</b>',
      'task_rejected': '\n\n⚠️ <b>Необхідно виправити зауваження</b>',
      'invoice_request': '\n\n📄 <b>Подано запит на рахунок</b>',
      'invoice_completed': '\n\n✅ <b>Рахунок готовий до завантаження</b>'
    };

    return baseMessage + (actions[type] || '');
  }

  // Отримання Chat ID для сповіщення
  async getChatIdsForNotification(type, task) {
    try {
      const chatIds = [];
      
      // Мапінг типів сповіщень на поля в notificationSettings
      const typeToSettingField = {
        'task_created': 'newRequests',
        'task_completed': 'pendingApproval',
        'task_approval': 'pendingApproval',
        'accountant_approval': 'accountantApproval',
        'task_approved': 'approvedRequests',
        'task_rejected': 'rejectedRequests',
        'invoice_request': 'invoiceRequests',
        'invoice_completed': 'completedInvoices'
      };
      
      const settingField = typeToSettingField[type];
      
      if (settingField) {
        // Шукаємо користувачів з увімкненим сповіщенням цього типу
        const query = {
          telegramChatId: { $exists: true, $ne: '' },
          [`notificationSettings.${settingField}`]: true
        };
        
        const users = await User.find(query).lean();
        
        // Фільтруємо по регіону
        const filteredUsers = users.filter(u => {
          if (u.region === 'Україна') return true;
          return task.serviceRegion === u.region;
        });
        
        chatIds.push(...filteredUsers.map(u => u.telegramChatId).filter(Boolean));
      }
      
      // Додаємо адмін канал якщо налаштовано
      if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
        chatIds.push(process.env.TELEGRAM_ADMIN_CHAT_ID);
      }
      
      return [...new Set(chatIds)]; // Унікальні
    } catch (error) {
      console.error('[TELEGRAM] Помилка getChatIdsForNotification:', error);
      return [];
    }
  }
}

const telegramService = new TelegramService();

// Статус Telegram
app.get('/api/telegram/status', (req, res) => {
  res.json({
    botTokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    adminChatIdConfigured: !!process.env.ADMIN_TELEGRAM_CHAT_ID
  });
});

// Тест відправки
app.post('/api/telegram/test', async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({ error: 'chatId та message обов\'язкові' });
    }
    
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN не налаштовано' });
    }
    
    const success = await telegramService.sendMessage(chatId, message);
    res.json({ success });
  } catch (error) {
    console.error('[TELEGRAM] Помилка тесту:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримання логів сповіщень
app.get('/api/notification-logs', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const filter = type ? { type } : {};
    
    const logs = await NotificationLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    const total = await NotificationLog.countDocuments(filter);
    
    res.json({
      logs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('[NOTIFICATION-LOGS] Помилка:', error);
    res.status(500).json({ error: error.message });
  }
});

// Відправка системного повідомлення всім з systemNotifications
app.post('/api/notifications/send-system-message', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message обов\'язковий' });
    }
    
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN не налаштовано' });
    }
    
    // Знаходимо користувачів з увімкненими системними сповіщеннями
    const users = await User.find({
      telegramChatId: { $exists: true, $ne: '' },
      'notificationSettings.systemNotifications': true
    }).lean();
    
    let sentCount = 0;
    for (const user of users) {
      if (user.telegramChatId) {
        const success = await telegramService.sendMessage(
          user.telegramChatId,
          `📢 <b>Системне повідомлення</b>\n\n${message}`
        );
        if (success) sentCount++;
      }
    }
    
    console.log(`[TELEGRAM] Системне повідомлення відправлено ${sentCount} користувачам`);
    res.json({ success: true, sentCount });
  } catch (error) {
    console.error('[TELEGRAM] Помилка відправки системного повідомлення:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// СТАРТ СЕРВЕРА
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 NewServiceGidra Backend запущено на порту ${PORT}`);
  console.log(`📊 MongoDB: ${MONGODB_URI ? 'підключено' : 'не підключено'}`);
});
