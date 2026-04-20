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

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Readable } = require('stream');
const {
  suggest: productCardAssistantSuggest,
  importImageFromUrl: productCardAssistantImportImage,
} = require('./productCardAssistant');

// Cloudinary конфігурація
console.log('[CLOUDINARY] CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET');
console.log('[CLOUDINARY] API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('[CLOUDINARY] API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Firebase Admin для push-сповіщень (мобільний додаток)
let firebaseAdmin = null;
try {
  const admin = require('firebase-admin');
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
    firebaseAdmin = admin;
    console.log('[FCM] Firebase Admin ініціалізовано (з оточення)');
  } else {
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      firebaseAdmin = admin;
      console.log('[FCM] Firebase Admin ініціалізовано (з файлу)');
    }
  }
} catch (e) {
  console.warn('[FCM] Firebase Admin не налаштовано:', e.message);
}

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

// Multer Storage для фото обладнання (шильдиків)
const equipmentPhotoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'equipment/photos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    resource_type: 'image',
    transformation: [
      { width: 1920, height: 1080, crop: 'limit', quality: 'auto' }
    ]
  }
});

const uploadEquipmentPhoto = multer({
  storage: equipmentPhotoStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Multer для OCR - зберігає в пам'яті для обробки через Google Vision API
const uploadEquipmentPhotoForOCR = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const uploadStockXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const PROCUREMENT_FILE_RE = /\.(pdf|doc|docx|xls|xlsx)$/i;
function procurementFilesFilter(req, file, cb) {
  if (PROCUREMENT_FILE_RE.test(String(file.originalname || ''))) return cb(null, true);
  cb(new Error('Дозволені лише файли PDF, Word (.doc, .docx), Excel (.xls, .xlsx)'));
}
const uploadProcurementFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: procurementFilesFilter
});

// TTN для POST /api/sales/:saleId/shipment-request — має бути оголошено ДО реєстрації маршрутів (інакше TDZ)
const shipmentTtnStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    const originalName = file?.originalname || '';
    const mimetype = file?.mimetype || '';
    const dotIdx = originalName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? originalName.slice(dotIdx + 1).toLowerCase() : '';
    const isImage = mimetype.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isPdf = mimetype === 'application/pdf' || ext === 'pdf';
    const resourceType = isImage || isPdf ? 'image' : 'raw';
    const uid = `shipment_ttn_${req.params.saleId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const params = {
      folder: 'newservicegidra/shipment-request-ttn',
      resource_type: resourceType,
      overwrite: false,
      invalidate: true,
      public_id: uid
    };
    if (resourceType === 'image') {
      params.allowed_formats = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    } else {
      params.allowed_formats = ['doc', 'docx', 'xls', 'xlsx', 'txt', 'pdf'];
      if (ext) params.format = ext;
      if (originalName) params.filename_override = originalName;
    }
    return params;
  }
});
const uploadShipmentTtn = multer({ storage: shipmentTtnStorage, limits: { fileSize: 20 * 1024 * 1024 } });

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
    if (err) return res.status(401).json({ error: 'Невірний або прострочений токен' });
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
  fcmToken: { type: String, default: null },
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

/** Персональні системні сповіщення (менеджери: резерви; сервіс/регіон: заявки) */
const MANAGER_NOTIFICATION_KINDS = [
  'reservation_3d',
  'reservation_1d',
  'reservation_transferred',
  'reservation_released_auto',
  'reservation_released_admin',
  'task_invoice_uploaded',
  'task_wh_approved',
  'task_wh_rejected',
  'task_accountant_approved',
  'task_accountant_rejected',
  'task_new',
  'shipment_request_new',
  'procurement_incoming_to_warehouse',
  'procurement_receipt_partial',
  'procurement_request_new',
  'procurement_request_completed'
];

/** Лише для GET/POST manager-notifications з ?procurement=1 (вкладка «Відділ закупівель») */
const PROCUREMENT_ONLY_NOTIFICATION_KINDS = [
  'procurement_incoming_to_warehouse',
  'procurement_receipt_partial',
  'procurement_request_new',
  'procurement_request_completed'
];

const managerUserNotificationSchema = new mongoose.Schema({
  recipientLogin: { type: String, required: true, index: true },
  kind: {
    type: String,
    enum: MANAGER_NOTIFICATION_KINDS,
    required: true
  },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  procurementRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcurementRequest', default: null },
  requestNumber: { type: String, default: '' },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  read: { type: Boolean, default: false },
  /** Унікальний ключ, щоб не дублювати нагадування (3д/1д) та авто-зняття */
  dedupeKey: { type: String, sparse: true, unique: true },
  shipmentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentRequest' },
  createdAt: { type: Date, default: Date.now }
});
managerUserNotificationSchema.index({ recipientLogin: 1, createdAt: -1 });
managerUserNotificationSchema.index({ recipientLogin: 1, read: 1 });
const ManagerUserNotification = mongoose.model('ManagerUserNotification', managerUserNotificationSchema);

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

// Глобальні коефіцієнти: окремо для відділу продажів та сервісного (legacy поле rows → service)
const globalCalculationCoefficientsSchema = new mongoose.Schema({
  rows: [{ id: String, label: String, value: Number, note: String }],
  salesRows: [{ id: String, label: String, value: Number, note: String }],
  serviceRows: [{ id: String, label: String, value: Number, note: String }],
  salesUpdatedAt: Date,
  salesUpdatedByLogin: String,
  serviceUpdatedAt: Date,
  serviceUpdatedByLogin: String,
  updatedAt: Date,
  updatedByLogin: String
}, { strict: false });
const GlobalCalculationCoefficients = mongoose.model('GlobalCalculationCoefficients', globalCalculationCoefficientsSchema);

// Склад рядків задається лише тут; у Mongo зберігаються лише id + value
const PROGRAMMATIC_SALES_COEFFICIENTS = [
  {
    id: 'sales_bonus',
    label: 'Премія від продажів',
    defaultValue: 0,
    note:
      'Відсоток начислення премії менеджерам при успішно реалізованій угоді, начислення відбувається ціна продажу мінус витрати.'
  },
  {
    id: 'reservation_days_negotiation',
    label: 'Кількість днів статус резервування - "В процесі домовленості з клієнтом"',
    defaultValue: 14,
    integerOnly: true,
    note: 'В процесі домовленості з клієнтом'
  },
  {
    id: 'reservation_days_tender',
    label: 'Кількість днів статус резервування - "Під тендер"',
    defaultValue: 30,
    integerOnly: true,
    note: 'Під тендер'
  },
  {
    id: 'reservation_days_contract',
    label: 'Кількість днів статус резервування - "Зарезервовано за договором"',
    defaultValue: 60,
    integerOnly: true,
    note: 'Зарезервовано за договором'
  }
];

const RESERVATION_BASIS_ALLOWED = [
  'В процесі домовленості з клієнтом',
  'Під тендер',
  'Зарезервовано за договором'
];

const RESERVATION_BASIS_TO_COEFF_ID = {
  'В процесі домовленості з клієнтом': 'reservation_days_negotiation',
  'Під тендер': 'reservation_days_tender',
  'Зарезервовано за договором': 'reservation_days_contract'
};

function serverLocalTodayYmd() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Різниця в календарних днях між YYYY-MM-DD (b − a). */
function diffCalendarDaysYmd(ymdA, ymdB) {
  if (!ymdA || !ymdB || ymdA.length < 10 || ymdB.length < 10) return NaN;
  const pa = ymdA.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const pb = ymdB.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (pa.some((x) => Number.isNaN(x)) || pb.some((x) => Number.isNaN(x))) return NaN;
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

/** Додати календарні дні до дати YYYY-MM-DD (локальний календар сервера). */
function ymdAddCalendarDays(startYmd, days) {
  const parts = String(startYmd).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) return String(startYmd).slice(0, 10);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + Math.max(0, Math.round(Number(days) || 0)));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Підстава резерву при виборі обладнання в формі продажу CRM (коефіцієнти як у звичайному резерві). */
const RESERVATION_BASIS_FOR_SALE = 'В процесі домовленості з клієнтом';

async function getReservationMaxDaysForBasis(basisTrim) {
  const coeffId = RESERVATION_BASIS_TO_COEFF_ID[basisTrim];
  if (!coeffId) return 0;
  let doc = await GlobalCalculationCoefficients.findOne();
  if (!doc) return 0;
  const rows = buildCoefficientRowsForScope('sales', doc.salesRows || []);
  const row = rows.find((r) => r.id === coeffId);
  return row ? Math.max(0, Math.round(Number(row.value) || 0)) : 0;
}

const SERVICE_WORK_COMPLETION_PCT_ID = 'service_work_completion_pct';

/** Коефіцієнти та тарифи для тексту нарядів (підстановка в шаблон). group: 'template' — окремий підрозділ у UI. */
const PROGRAMMATIC_SERVICE_COEFFICIENTS = [
  {
    id: SERVICE_WORK_COMPLETION_PCT_ID,
    label: 'Відсоток за виконану роботу',
    defaultValue: 25,
    note:
      'Премія за виконані роботи згідно заявці в відсотковому значенні, в розрахунок іде тільки ціна робіт.'
  },
  {
    id: 'wo_template_travel_city_uah',
    group: 'template',
    label: 'Виїзд по місту (тариф, грн з ПДВ)',
    defaultValue: 650,
    note: 'Підставляється в наряд: «тариф: по місту … грн.»'
  },
  {
    id: 'wo_template_travel_per_km_uah',
    group: 'template',
    label: 'Виїзд за місто (грн/км)',
    defaultValue: 15,
    note: 'Підставляється в наряд: «… км * … грн/км»'
  },
  {
    id: 'wo_template_per_diem_uah',
    group: 'template',
    label: 'Добові у відрядженні (грн за добу)',
    defaultValue: 600,
    note: 'Підставляється в наряд у блоці добових'
  },
  {
    id: 'wo_template_cond_comfort',
    group: 'template',
    label: 'Множник: комфортні умови',
    defaultValue: 1.0,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_outdoor',
    group: 'template',
    label: 'Множник: відкрите повітря / екстремальна температура (сухо)',
    defaultValue: 1.1,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_precipitation',
    group: 'template',
    label: 'Множник: дощ, сніг, сильний вітер',
    defaultValue: 1.2,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_basement',
    group: 'template',
    label: 'Множник: підвали, дахи',
    defaultValue: 1.3,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_aggressive',
    group: 'template',
    label: 'Множник: агресивне середовище',
    defaultValue: 1.4,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_night',
    group: 'template',
    label: 'Множник: нічний час (22:00–06:00)',
    defaultValue: 1.5,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_weekend',
    group: 'template',
    label: 'Множник: вихідні та святкові дні',
    defaultValue: 1.6,
    note: 'У тексті наряду підставляється лише число після «-»'
  },
  {
    id: 'wo_template_cond_urgent',
    group: 'template',
    label: 'Множник: терміновий виклик',
    defaultValue: 2.0,
    note: 'У тексті наряду підставляється лише число після «-»'
  }
];

function getProgrammaticCoefficientDefs(scope) {
  return scope === 'sales' ? PROGRAMMATIC_SALES_COEFFICIENTS : PROGRAMMATIC_SERVICE_COEFFICIENTS;
}

function roundCoefficientValue(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function resolveCoefficientValue(def, rawFromMap) {
  const raw = rawFromMap !== undefined ? rawFromMap : def.defaultValue;
  if (def.integerOnly) {
    const x = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.')) || 0;
    if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
    return Math.max(0, Math.round(x));
  }
  return roundCoefficientValue(raw);
}

function valueMapFromSavedRows(savedRows) {
  const m = {};
  if (!Array.isArray(savedRows)) return m;
  for (const r of savedRows) {
    if (r && r.id != null) {
      const v = r.value;
      const raw =
        typeof v === 'number' && !Number.isNaN(v) ? v : parseFloat(String(v).replace(',', '.'));
      m[String(r.id)] = Number.isNaN(raw) ? 0 : raw;
    }
  }
  return m;
}

/** Повний набір для API/UI: назва та примітка з коду, значення з БД */
function buildCoefficientRowsForScope(scope, savedRows) {
  const defs = getProgrammaticCoefficientDefs(scope);
  const map = valueMapFromSavedRows(savedRows);
  return defs.map((d) => ({
    id: d.id,
    label: d.label,
    note: d.note || '',
    integerOnly: !!d.integerOnly,
    group: d.group || 'main',
    value: resolveCoefficientValue(d, map[d.id])
  }));
}

/** Зберігаємо компактно { id, value }; невідомі id ігноруємо */
function serializeCoefficientValuesForDb(scope, bodyRows) {
  const defs = getProgrammaticCoefficientDefs(scope);
  if (!defs.length) return [];
  const allowed = new Set(defs.map((d) => d.id));
  const byId = {};
  if (Array.isArray(bodyRows)) {
    for (const row of bodyRows) {
      if (!row || !allowed.has(row.id)) continue;
      const raw = row.value;
      const v =
        typeof raw === 'number' && !Number.isNaN(raw)
          ? raw
          : parseFloat(String(raw).replace(',', '.')) || 0;
      byId[row.id] = v;
    }
  }
  return defs.map((d) => ({
    id: d.id,
    value: resolveCoefficientValue(d, byId[d.id])
  }));
}

/** Головний керівник сервісу — доступ лише до коефіцієнтів сервісного відділу (роль у БД: GolovnKervServ). */
function isGolovnKervServRole(role) {
  return String(role || '').toLowerCase() === 'golovnkervserv';
}

/** scope: 'sales' | 'service' — для GolovnKervServ дозволено лише service */
function canEditGlobalCalculationCoefficients(role, scope) {
  const r = String(role || '').toLowerCase();
  if (['admin', 'administrator', 'finance', 'buhgalteria'].includes(r)) return true;
  if (isGolovnKervServRole(r)) return scope === 'service';
  return false;
}

function validateServiceTemplateCoefficientsFromCompact(compactRows) {
  const defs = PROGRAMMATIC_SERVICE_COEFFICIENTS.filter((d) => d.group === 'template');
  const byId = Object.fromEntries((compactRows || []).map((r) => [r.id, r.value]));
  for (const d of defs) {
    const v = resolveCoefficientValue(d, byId[d.id]);
    if (v < 0) {
      return { ok: false, error: `Значення «${d.label}» не може бути від\'ємним.` };
    }
    if (String(d.id).startsWith('wo_template_cond_') && v <= 0) {
      return { ok: false, error: `Множник «${d.label}» має бути більшим за 0.` };
    }
  }
  return { ok: true };
}

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
taskSchema.index({ serviceRegion: 1, requestDate: -1 }); // Для GET /api/tasks з фільтром по регіону

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
// МОДЕЛЬ ОБЛАДНАННЯ ДЛЯ СКЛАДСЬКОГО ОБЛІКУ
// ============================================

const equipmentSchema = new mongoose.Schema({
  // Дані з шильдика
  type: String,                    // DE-50BDS
  serialNumber: { type: String, sparse: true }, // 20241007015 (унікальність забезпечується через compound index type + serialNumber)
  manufacturer: String,            // DAREX ENERGY
  standbyPower: String,             // 50/40 KVA/KW
  primePower: String,               // 45/36 KVA/KW
  phase: Number,                    // 3
  voltage: String,                  // 400/230
  amperage: Number,                 // 72
  cosPhi: Number,                   // 0.8
  rpm: Number,                      // 1500
  frequency: Number,                // 50
  dimensions: String,               // 2280 x 950 x 1250
  weight: Number,                   // 940
  manufactureDate: String,          // 2024
  notes: String,                     // Примітки
  /** Довільні характеристики одиниці (конструктор; замість фіксованих полів на формі надходження) */
  technicalSpecs: [
    {
      name: { type: String, trim: true, default: '' },
      value: { type: String, trim: true, default: '' },
    },
  ],
  
  // Категорії матеріальних цінностей (вибір тільки однієї опції)
  materialValueType: { 
    type: String, 
    enum: ['', 'service', 'electroinstall', 'internal'], 
    default: '' 
  },  // 'service' - Комплектуючі ЗІП (Сервіс), 'electroinstall' - Комплектуючі для електромонтажних робіт, 'internal' - Обладнання для внутрішніх потреб
  
  // Дерево номенклатури (1С-стиль): товари vs деталі/комплектуючі
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  itemKind: { type: String, enum: ['equipment', 'parts'], default: 'equipment' }, // equipment - для продажу, parts - деталі/комплектуючі
  /** Довідник «карточка продукту» — канонічна номенклатура */
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCard', default: null },
  
  // Поля для партійного обладнання
  isBatch: { type: Boolean, default: false },  // Чи це партія
  quantity: { type: Number, default: 1, min: 1 },  // Кількість одиниць (для партій)
  batchId: { type: String, sparse: true },  // ID партії для групування
  batchIndex: { type: Number },  // Індекс одиниці в партії (1, 2, 3...)
  batchName: String,  // Назва для партійного обладнання
  batchUnit: String,  // Одиниця виміру (шт., л., комплект, упаковка, балон, м.п.)
  batchPriceWithVAT: Number,  // Ціна за одиницю з ПДВ
  currency: { type: String, default: 'грн.' },  // Тип валюти (грн., USD, EURO)
  
  // Складські дані
  currentWarehouse: String,         // ID складу
  currentWarehouseName: String,     // Назва складу
  region: String,                    // Регіон
  status: {                          // Статус
    type: String,
    enum: ['in_stock', 'reserved', 'pending_shipment', 'shipped', 'in_transit', 'deleted', 'written_off', 'sold'],
    default: 'in_stock'
  },
  /** Заявка на відвантаження (менеджер) — поки завсклад не відвантажить */
  pendingShipmentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentRequest' },
  statusBeforePendingShipment: { type: String },
  
  // Продаж (CRM)
  saleId: mongoose.Schema.Types.ObjectId,
  soldDate: Date,
  soldToClientId: mongoose.Schema.Types.ObjectId,
  saleAmount: Number,
  warrantyUntil: Date,
  warrantyMonths: Number,
  
  // Резервування
  reservedBy: String,               // ID користувача, який зарезервував
  reservedByName: String,            // ПІБ користувача, який зарезервував
  reservedByLogin: String,           // Логін менеджера (для фільтра при продажу)
  reservedAt: Date,                 // Дата резервування
  reservationClientName: String,    // Назва клієнта для резервування
  reservationNotes: String,         // Примітки до резервування
  reservationEndDate: Date,         // Дата закінчення резервування
  reservationBasis: String,         // Підстава резервування (текст з довідника)
  
  // Історія резервувань
  reservationHistory: [{
    action: { type: String, enum: ['reserved', 'cancelled', 'transferred'] }, // Тип дії
    date: Date,                       // Дата та час дії
    userId: String,                   // ID користувача
    userName: String,                 // ПІБ користувача
    clientName: String,               // Назва клієнта (при резервуванні)
    basis: String,                    // Підстава резервування (при резервуванні)
    endDate: Date,                    // Дата закінчення (при резервуванні)
    notes: String,                    // Примітки
    cancelReason: String,             // Причина скасування: 'manual', 'expired', 'admin'
    cancelledBy: String,              // Хто скасував (якщо інший користувач)
    cancelledByName: String           // ПІБ того, хто скасував
  }],
  
  // Історія переміщень
  movementHistory: [{
    fromWarehouse: String,
    toWarehouse: String,
    fromWarehouseName: String,
    toWarehouseName: String,
    date: Date,
    movedBy: String,
    movedByName: String,
    reason: String,
    notes: String,
    attachedFiles: [{
      cloudinaryUrl: String,
      cloudinaryId: String,
      originalName: String,
      mimetype: String,
      size: Number
    }]
  }],
  
  // Відвантаження
  shipmentHistory: [{
    shippedTo: String,               // Назва клієнта/замовника
    shippedDate: Date,
    shippedBy: String,
    shippedByName: String,
    orderNumber: String,
    invoiceNumber: String,
    clientEdrpou: String,
    clientAddress: String,
    invoiceRecipientDetails: String,
    totalPrice: Number,
    notes: String,
    attachedFiles: [{
      cloudinaryUrl: String,
      cloudinaryId: String,
      originalName: String,
      mimetype: String,
      size: Number
    }]
  }],
  
  // Історія видалень
  deletionHistory: [{
    deletedAt: Date,
    deletedBy: String,
    deletedByName: String,
    reason: String
  }],
  isDeleted: { type: Boolean, default: false },
  
  // Історія списань
  writeOffHistory: [{
    writtenOffAt: Date,
    writtenOffBy: String,
    writtenOffByName: String,
    quantity: Number,
    reason: String,
    notes: String,
    attachedFiles: [{
      cloudinaryUrl: String,
      cloudinaryId: String,
      originalName: String,
      mimetype: String,
      size: Number
    }]
  }],
  
  // Прикріплені файли (документи, фото при додаванні)
  attachedFiles: [{
    cloudinaryUrl: String,
    cloudinaryId: String,
    originalName: String,
    mimetype: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Тестування обладнання
  testingStatus: {
    type: String,
    enum: ['none', 'requested', 'in_progress', 'completed', 'failed'],
    default: 'none'
  },
  testingRequestedBy: String,        // ID користувача, який подав заявку на тест
  testingRequestedByName: String,    // ПІБ користувача
  testingRequestedAt: Date,          // Дата подачі заявки на тест
  testingTakenBy: String,            // ID тестувальника, який взяв в роботу
  testingTakenByName: String,        // ПІБ тестувальника
  testingTakenAt: Date,              // Дата взяття в роботу
  testingCompletedBy: String,        // ID тестувальника, який завершив тест
  testingCompletedByName: String,    // ПІБ тестувальника
  testingDate: Date,                 // Дата завершення тестування (встановлюється автоматично)
  testingNotes: String,              // Примітки по тестуванню
  testingResult: String,             // Детальний результат тестування
  // testingMaterials - ВИДАЛЕНО ЗІ СХЕМИ - старе поле залишається в базі завдяки strict: false, але Mongoose його не валідує
  testingMaterialsJson: String,      // Використані матеріали у форматі JSON [{type, quantity, unit}] (старе поле)
  testingMaterialsArray: mongoose.Schema.Types.Mixed, // Використані матеріали - Mixed тип, щоб уникнути валідації старих даних (може бути масив об'єктів або рядок JSON)
  testingProcedure: String,          // Процедура тестування
  testingConclusion: String,         // Висновок тестування: 'passed', 'failed', 'partial'
  testingEngineer1: String,          // Сервісний інженер №1
  testingEngineer2: String,          // Сервісний інженер №2
  testingEngineer3: String,          // Сервісний інженер №3
  testingFiles: [{                   // Файли тестування
    cloudinaryUrl: String,
    cloudinaryId: String,
    originalName: String,
    mimetype: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Метадані
  addedBy: String,                  // ID користувача
  addedByName: String,               // Ім'я користувача
  addedAt: { type: Date, default: Date.now },
  lastModified: { type: Date, default: Date.now },
  photoUrl: String,                 // URL фото шильдика
  ocrData: Object,                   // Сирі дані OCR
}, { 
  timestamps: true,
  strict: false // Дозволяє зберігати поля, яких немає в схемі (наприклад, старе поле testingMaterials залишається в базі, але Mongoose його не валідує)
});

// Compound unique index для type + serialNumber (тільки для одиничного обладнання)
// Простий індекс для serialNumber видалено - compound індекс покриває пошук по serialNumber
equipmentSchema.index({ type: 1, serialNumber: 1 }, { unique: true, sparse: true, partialFilterExpression: { serialNumber: { $ne: null } } });
equipmentSchema.index({ currentWarehouse: 1 });
equipmentSchema.index({ status: 1 });
equipmentSchema.index({ region: 1 });
equipmentSchema.index({ type: 1 });
equipmentSchema.index({ batchId: 1 });
equipmentSchema.index({ batchId: 1, currentWarehouse: 1 }); // Для швидкого пошуку партій на складі
equipmentSchema.index({ testingStatus: 1 }); // Для швидкого пошуку заявок на тестування
equipmentSchema.index({ categoryId: 1 });
equipmentSchema.index({ itemKind: 1 });
equipmentSchema.index({ productId: 1 });
// Compound-індекс для вартісного звіту, статистики та списку обладнання (isDeleted + status + currentWarehouse)
equipmentSchema.index({ isDeleted: 1, status: 1, currentWarehouse: 1 });
equipmentSchema.index({ isDeleted: 1, addedAt: -1 }); // Для сортування списку без видалених

const Equipment = mongoose.model('Equipment', equipmentSchema);

// --- Резервування: календарні дати, авто-зняття, сповіщення менеджерам ---
function reservationEndYmdFromEquipment(equipment) {
  if (!equipment || !equipment.reservationEndDate) return null;
  const d = equipment.reservationEndDate;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/** Термін резерву минув (календарно): сьогодні пізніше за дату закінчення. */
function isReservationCalendarExpired(equipment) {
  const endYmd = reservationEndYmdFromEquipment(equipment);
  if (!endYmd || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return false;
  const todayYmd = serverLocalTodayYmd();
  return diffCalendarDaysYmd(endYmd, todayYmd) >= 1;
}

/** Скільки календарних днів до кінця резерву (0 = сьогодні останній день). */
function daysUntilReservationEndCalendar(equipment) {
  const endYmd = reservationEndYmdFromEquipment(equipment);
  if (!endYmd || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return null;
  return diffCalendarDaysYmd(serverLocalTodayYmd(), endYmd);
}

async function createManagerNotificationDeduped(doc) {
  const payload = { ...doc };
  if (payload.dedupeKey == null || payload.dedupeKey === '') delete payload.dedupeKey;
  try {
    await ManagerUserNotification.create(payload);
  } catch (e) {
    if (e && e.code === 11000) return;
    throw e;
  }
}

async function getTaskNotificationRecipientLogins(task) {
  if (!task) return [];
  const region = String(task.serviceRegion || task.region || '').trim();
  if (!region) return [];
  const rows = await User.find({
    dismissed: { $ne: true },
    $or: [
      { role: 'service', region },
      { role: { $in: ['regional', 'regkerivn'] }, region }
    ]
  })
    .select('login')
    .lean();
  const set = new Set();
  for (const u of rows) {
    if (u.login) set.add(String(u.login).trim());
  }
  return [...set];
}

/**
 * Сповіщення сервісної служби та регіональних керівників регіону заявки.
 * dedupeKeyPrefix — префікс; до нього додається :login для унікальності.
 */
async function notifyServiceRegionalForTask(task, kind, { title, body, dedupeKeyPrefix }) {
  if (!task || !task._id) return;
  const logins = await getTaskNotificationRecipientLogins(task);
  const taskId = task._id;
  const requestNumber = task.requestNumber || '';
  for (const login of logins) {
    const row = {
      recipientLogin: login,
      kind,
      title,
      body: body || '',
      taskId,
      requestNumber,
      read: false
    };
    if (dedupeKeyPrefix) {
      row.dedupeKey = `${dedupeKeyPrefix}:${login}`;
    }
    await createManagerNotificationDeduped(row);
  }
}

function equipmentReserveSummaryLine(eq) {
  const sn = eq.serialNumber && String(eq.serialNumber).trim() ? eq.serialNumber : 'без номера';
  return `${eq.type || 'Обладнання'} (№ ${sn})`;
}

/**
 * Зняти резерв (історія + очищення полів). actingUser = null для фонового авто-зняття.
 * cancelReason: 'expired' | 'admin' | 'manual'
 */
async function performEquipmentReservationRelease(equipment, actingUser, cancelReason) {
  const uid = actingUser ? String(actingUser._id) : 'system';
  const uname = actingUser ? actingUser.name || actingUser.login : 'Система';

  const journalEquipmentId = equipment._id;
  const journalType = equipment.type;
  const journalSerial = equipment.serialNumber;
  const journalQty = equipment.quantity || 1;
  const journalClientName = equipment.reservationClientName;
  const journalReservedByLogin = equipment.reservedByLogin;

  if (!equipment.reservationHistory) equipment.reservationHistory = [];
  let histNotes = '';
  if (cancelReason === 'expired') histNotes = 'Автоматичне скасування: закінчився термін резервування';
  else if (cancelReason === 'admin' && actingUser) {
    histNotes = `Скасовано адміністратором: ${actingUser.name || actingUser.login}`;
  }

  const histCancelReason = cancelReason === 'expired' ? 'expired' : cancelReason === 'admin' ? 'admin' : 'manual';

  equipment.reservationHistory.push({
    action: 'cancelled',
    date: new Date(),
    userId: uid,
    userName: uname,
    clientName: equipment.reservationClientName,
    cancelReason: histCancelReason,
    cancelledBy: equipment.reservedBy,
    cancelledByName: equipment.reservedByName,
    notes: histNotes
  });

  equipment.status = 'in_stock';
  equipment.reservedBy = undefined;
  equipment.reservedByName = undefined;
  equipment.reservedByLogin = undefined;
  equipment.reservedAt = undefined;
  equipment.reservationClientName = undefined;
  equipment.reservationNotes = undefined;
  equipment.reservationEndDate = undefined;
  equipment.reservationBasis = undefined;
  equipment.lastModified = new Date();

  await equipment.save();

  try {
    await EventLog.create({
      userId: uid,
      userName: uname,
      userRole: actingUser ? actingUser.role : 'system',
      action: 'cancel_reserve',
      entityType: 'equipment',
      entityId: equipment._id.toString(),
      description: `Скасовано резервування обладнання ${equipment.type} (№${equipment.serialNumber || 'без номера'})`,
      details: { automatic: !actingUser, cancelReason }
    });
  } catch (logErr) {
    console.error('Помилка логування cancel_reserve:', logErr);
  }

  await logInventoryMovement({
    eventType: 'reservation_cancelled',
    performedByLogin: actingUser?.login || 'system',
    performedByName: uname,
    equipmentId: journalEquipmentId,
    equipmentType: journalType,
    serialNumber: journalSerial,
    quantity: journalQty,
    fromStatus: 'reserved',
    toStatus: 'in_stock',
    managerLogin: journalReservedByLogin,
    clientName: journalClientName,
    notes: histNotes || (cancelReason === 'expired' ? 'Автоматичне скасування резерву' : `Скасування резерву (${cancelReason})`)
  });
}

let reservationMaintenanceRunning = false;
async function runReservationMaintenanceJob() {
  if (reservationMaintenanceRunning) return;
  reservationMaintenanceRunning = true;
  try {
    const reservedList = await Equipment.find({ status: 'reserved' });
    for (const eq of reservedList) {
      try {
        if (isReservationCalendarExpired(eq)) {
          const endYmd = reservationEndYmdFromEquipment(eq);
          const ownerLogin = eq.reservedByLogin;
          await performEquipmentReservationRelease(eq, null, 'expired');
          if (ownerLogin) {
            await createManagerNotificationDeduped({
              recipientLogin: ownerLogin,
              kind: 'reservation_released_auto',
              equipmentId: eq._id,
              title: 'Резервування знято автоматично',
              body: `Термін резервування закінчився: ${equipmentReserveSummaryLine(eq)}.`,
              dedupeKey: endYmd ? `released_auto:${eq._id}:${endYmd}` : `released_auto:${eq._id}:${Date.now()}`,
              read: false
            });
          }
          continue;
        }
        const daysLeft = daysUntilReservationEndCalendar(eq);
        if (daysLeft !== 3 && daysLeft !== 1) continue;
        if (!eq.reservedByLogin) continue;
        const endYmd = reservationEndYmdFromEquipment(eq);
        if (!endYmd) continue;
        const kind = daysLeft === 3 ? 'reservation_3d' : 'reservation_1d';
        const title =
          daysLeft === 3
            ? 'Залишилось 3 дні до кінця резерву'
            : 'Завтра закінчується резерв обладнання';
        const body =
          daysLeft === 3
            ? `До завершення резерву ${equipmentReserveSummaryLine(eq)} залишилось 3 дні (до ${endYmd.split('-').reverse().join('.')}).`
            : `Завтра останній день резерву: ${equipmentReserveSummaryLine(eq)} (до ${endYmd.split('-').reverse().join('.')}).`;
        await createManagerNotificationDeduped({
          recipientLogin: eq.reservedByLogin,
          kind,
          equipmentId: eq._id,
          title,
          body,
          dedupeKey: `${kind}:${eq._id}:${endYmd}`,
          read: false
        });
      } catch (inner) {
        console.error('[reservation-maintenance] equipment', eq._id, inner);
      }
    }
  } catch (e) {
    console.error('[reservation-maintenance]', e);
  } finally {
    reservationMaintenanceRunning = false;
  }
}

setInterval(runReservationMaintenanceJob, 15 * 60 * 1000);
setTimeout(() => {
  runReservationMaintenanceJob().catch((e) => console.error('[reservation-maintenance] startup', e));
}, 15000);

// Схема груп номенклатури (дерево як в 1С: Товари / Деталі та комплектуючі)
const categorySchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  name: { type: String, required: true },
  itemKind: { type: String, enum: ['equipment', 'parts'], required: true },
  sortOrder: { type: Number, default: 0 },
  /** Якщо true — група видима менеджерам у дереві номенклатури та в залишках (разом із нащадками). За замовчуванням false. */
  visibleToManagers: { type: Boolean, default: false },
}, { timestamps: true });

categorySchema.index({ parentId: 1 });
categorySchema.index({ itemKind: 1 });
const Category = mongoose.model('Category', categorySchema);

/** Канонічна карточка продукту (номенклатура) — один запис на «тип товару» для довідника та прив’язки залишків */
const productCardSchema = new mongoose.Schema(
  {
    displayName: { type: String, trim: true, default: '' },
    type: { type: String, required: true, trim: true },
    manufacturer: { type: String, trim: true, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    itemKind: { type: String, enum: ['equipment', 'parts'], default: 'equipment' },
    defaultBatchUnit: { type: String, trim: true, default: 'шт.' },
    defaultCurrency: { type: String, default: 'грн.' },
    internalNotes: { type: String, default: '' },
    /** Довільні технічні характеристики (конструктор: назва поля + значення) */
    technicalSpecs: [
      {
        name: { type: String, trim: true, default: '' },
        value: { type: String, trim: true, default: '' },
      },
    ],
    /** За замовчуванням для надходження: одиничне / партія (підказка; фактичний режим обирають на формі прийому). */
    defaultReceiptMode: { type: String, enum: ['single', 'batch'], default: 'single' },
    /** Тип матеріальних цінностей за замовчуванням (як у Equipment.materialValueType) */
    materialValueType: {
      type: String,
      enum: ['', 'service', 'electroinstall', 'internal'],
      default: '',
    },
    attachedFiles: [{
      cloudinaryUrl: String,
      cloudinaryId: String,
      originalName: String,
      mimetype: String,
      size: Number,
      uploadedAt: { type: Date, default: Date.now },
    }],
    isActive: { type: Boolean, default: true },
    createdByLogin: String,
    createdByName: String,
  },
  { timestamps: true },
);
productCardSchema.index({ type: 1 });
productCardSchema.index({ categoryId: 1 });
productCardSchema.index({ isActive: 1 });
const ProductCard = mongoose.model('ProductCard', productCardSchema);

// Схема для складів
const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  region: String,
  address: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

warehouseSchema.index({ name: 1 }, { unique: true });
const Warehouse = mongoose.model('Warehouse', warehouseSchema);

// Заявки відділу закупівель (вкладення PDF/Word/Excel у MongoDB як Buffer)
const PROCUREMENT_EXECUTOR_DOC_KINDS = ['invoice', 'delivery_note', 'other'];

const procurementAttachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true },
    /** Для файлів виконавця: рахунок / видаткова накладна */
    docKind: { type: String, enum: PROCUREMENT_EXECUTOR_DOC_KINDS }
  },
  { _id: true }
);

const PROCUREMENT_PAYER_COMPANIES = ['dts', 'dareks_energo'];
const PROCUREMENT_APPLICATION_KINDS = ['purchase', 'price_determination'];

const procurementWarehouseReceiptEventSchema = new mongoose.Schema(
  {
    acceptedQuantity: { type: Number, required: true },
    acceptedAt: { type: Date, default: Date.now },
    confirmerLogin: { type: String, default: '' },
    confirmerName: { type: String, default: '' }
  },
  { _id: false }
);

const procurementMaterialLineSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  quantity: { type: Number, default: null },
  price: { type: Number, default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCard', default: null },
  /** Поля виконавця: аналог замість позиції заявника */
  analogName: { type: String, trim: true, default: '' },
  analogQuantity: { type: Number, default: null },
  analogShipped: { type: Boolean, default: false },
  rejected: { type: Boolean, default: false },
  /** Обовʼязково, якщо rejected === true */
  rejectionReason: { type: String, trim: true, default: '' },
  /** Фактично прийнята кількість завскладом */
  receivedQuantity: { type: Number, default: null },
  /** Історія часткових прийомів завскладом по цій позиції (дата, хто, скільки) */
  warehouseReceiptEvents: { type: [procurementWarehouseReceiptEventSchema], default: [] }
});

const procurementRequestSchema = new mongoose.Schema(
  {
    /** Унікальний номер для відображення, напр. VZ-00042 */
    requestNumber: { type: String, trim: true, sparse: true, unique: true },
    /** Повне / часткове надходження після завскладу */
    receiptOutcome: {
      type: String,
      enum: ['pending', 'full', 'partial'],
      default: 'pending'
    },
    /** @deprecated Раніше — довільний текст; лишається для старих заявок */
    description: { type: String, default: '' },
    /** Закупівля | Визначення ціни */
    applicationKind: {
      type: String,
      enum: PROCUREMENT_APPLICATION_KINDS
    },
    payerCompany: {
      type: String,
      enum: PROCUREMENT_PAYER_COMPANIES
    },
    priority: {
      type: String,
      enum: ['1_workday', '5_workdays', '7_workdays', 'more_than_7_workdays'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending_review', 'in_progress', 'awaiting_warehouse', 'partially_fulfilled', 'completed'],
      default: 'pending_review'
    },
    requesterLogin: { type: String, required: true },
    requesterName: { type: String, default: '' },
    desiredWarehouse: { type: String, default: '' },
    actualWarehouse: { type: String, default: '' },
    executorLogin: { type: String, default: '' },
    executorName: { type: String, default: '' },
    executorCompletedAt: { type: Date, default: null },
    warehouseReceivedAt: { type: Date, default: null },
    warehouseConfirmerLogin: { type: String, default: '' },
    warehouseConfirmerName: { type: String, default: '' },
    attachments: [procurementAttachmentSchema],
    /** Файли виконавця: рахунки, видаткові накладні, кошториси тощо */
    executorAttachments: [procurementAttachmentSchema],
    materials: { type: [procurementMaterialLineSchema], default: [] },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

procurementRequestSchema.index({ status: 1, createdAt: -1 });
procurementRequestSchema.index({ requesterLogin: 1 });
procurementRequestSchema.index({ actualWarehouse: 1, status: 1 });
const ProcurementRequest = mongoose.model('ProcurementRequest', procurementRequestSchema);

const procurementCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const ProcurementCounter = mongoose.model('ProcurementCounter', procurementCounterSchema);

async function getNextProcurementRequestNumber() {
  const doc = await ProcurementCounter.findOneAndUpdate(
    { _id: 'vz' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  const n = doc && typeof doc.seq === 'number' ? doc.seq : 1;
  return `VZ-${String(n).padStart(5, '0')}`;
}

function expectedQtyForProcurementMaterialLine(line) {
  if (!line || line.rejected) return 0;
  if (line.analogShipped && String(line.analogName || '').trim() && line.analogQuantity != null) {
    const q = Number(line.analogQuantity);
    if (Number.isFinite(q)) return q;
  }
  if (line.quantity != null) {
    const q = Number(line.quantity);
    if (Number.isFinite(q)) return q;
  }
  return null;
}

/** Перевірка PATCH виконавця: кількість не перевищує залишок до відвантаження (стан рядків у БД до зміни). */
function validateIncomingExecutorMaterialsAgainstRemainder(materials, incoming) {
  const n = materials.length;
  for (let i = 0; i < n; i++) {
    const inc = incoming[i] || {};
    const line = materials[i];
    const maxRemain = expectedQtyForProcurementMaterialLine(line);
    const newRejected = Boolean(inc.rejected);
    const newAnalogShipped = Boolean(inc.analogShipped);
    const newAnalogName = String(inc.analogName || '').trim();
    const aq = inc.analogQuantity;
    const newAnalogQty = aq === '' || aq === undefined || aq === null ? null : Number(aq);
    if (newRejected) continue;
    if (maxRemain === null) continue;
    if (newAnalogShipped && newAnalogName) {
      if (newAnalogQty != null && Number.isFinite(newAnalogQty)) {
        if (newAnalogQty < 0 || newAnalogQty > maxRemain) {
          return `Позиція ${i + 1}: кількість аналогу не більше ${maxRemain} шт. (залишок до відвантаження)`;
        }
      }
    } else {
      const q = line.quantity;
      if (q != null && Number.isFinite(Number(q)) && Number(q) > maxRemain) {
        return `Позиція ${i + 1}: кількість не більше ${maxRemain} шт.`;
      }
    }
  }
  return null;
}

/** Перед відправкою на склад: узгодженість кількостей з очікуваним залишком. */
function validateProcurementMaterialsForShipment(materials) {
  if (!materials || !materials.length) return null;
  for (let i = 0; i < materials.length; i++) {
    const line = materials[i];
    if (line.rejected) continue;
    const maxQ = expectedQtyForProcurementMaterialLine(line);
    if (maxQ === null) continue;
    if (line.analogShipped && String(line.analogName || '').trim()) {
      const aq = line.analogQuantity;
      if (aq != null && Number.isFinite(Number(aq))) {
        const v = Number(aq);
        if (v < 0 || v > maxQ) {
          return `Позиція ${i + 1}: кількість аналогу має бути від 0 до ${maxQ}`;
        }
      }
    } else {
      const q = line.quantity;
      if (q != null && Number.isFinite(Number(q))) {
        const v = Number(q);
        if (v < 0 || v > maxQ) {
          return `Позиція ${i + 1}: кількість має бути від 0 до ${maxQ}`;
        }
      }
    }
  }
  return null;
}

async function getWarehouseNamesForProcurementReceiptUser(reqUser, dbUser) {
  const r = String(reqUser.role || '').toLowerCase();
  if (['admin', 'administrator', 'mgradm'].includes(r)) {
    const all = await Warehouse.find({ isActive: true }).select('name').lean();
    return all.map((w) => String(w.name || '').trim()).filter(Boolean);
  }
  if (!isRegionalWarehouseStaffRole(reqUser.role)) return [];
  const allowedIds = await loadActiveWarehouseIdsForUserRegion(dbUser?.region);
  if (!allowedIds.size) return [];
  const oids = [...allowedIds]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!oids.length) return [];
  const whs = await Warehouse.find({ _id: { $in: oids }, isActive: true }).select('name').lean();
  return whs.map((w) => String(w.name || '').trim()).filter(Boolean);
}

async function notifyWarehouseStaffProcurementIncoming(pr) {
  try {
    const whName = String(pr.actualWarehouse || '').trim();
    if (!whName) return;
    const esc = escapeRegExpForRegion(whName);
    const wh =
      (await Warehouse.findOne({ isActive: true, name: whName }).lean()) ||
      (await Warehouse.findOne({ isActive: true, name: new RegExp(`^${esc}$`, 'i') }).lean());
    if (!wh || !String(wh.region || '').trim()) return;
    const pattern = new RegExp(escapeRegExpForRegion(String(wh.region).trim()), 'i');
    const users = await User.find({
      dismissed: { $ne: true },
      role: { $in: ['warehouse', 'zavsklad'] },
      region: pattern
    })
      .select('login')
      .lean();
    const rn = pr.requestNumber || String(pr._id);
    const title = `Надходження від закупівель: ${rn}`;
    const body = `До складу «${whName}» прямує товар за заявкою закупівель. Виконавець: ${pr.executorName || pr.executorLogin || '—'}. Підтвердіть отримання: Складський облік → Затвердження отримання товару.`;
    for (const u of users) {
      const login = u.login && String(u.login).trim();
      if (!login) continue;
      await createManagerNotificationDeduped({
        recipientLogin: login,
        kind: 'procurement_incoming_to_warehouse',
        procurementRequestId: pr._id,
        requestNumber: rn,
        title,
        body,
        read: false,
        dedupeKey: `proc_wh_in:${pr._id}:${login}`
      });
    }
  } catch (e) {
    console.error('[procurement] notifyWarehouseStaffProcurementIncoming:', e.message);
  }
}

/** Ролі, що отримують сповіщення закупівель (як isVidZakupokProcurementRole); у MongoDB роль часто з іншим регістром. */
function procurementNotifyRoleQuery() {
  return {
    dismissed: { $ne: true },
    $or: [
      { role: { $regex: /^vidzakupok$/i } },
      { role: { $regex: /^administrator$/i } },
      { role: { $regex: /^admin$/i } }
    ]
  };
}

function normalizeLoginCompare(login) {
  return String(login || '').trim().toLowerCase();
}

async function notifyProcurementExecutorReceiptPartial(pr) {
  try {
    const rn = pr.requestNumber || String(pr._id);
    const body =
      'Завсклад підтвердив частковий прийом або розбіжності по кількості. Заявка повернута виконавцю з оновленими залишками по позиціях (мінус прийняте на складі). Відкрийте заявку у відділі закупівель.';
    const buyers = await User.find(procurementNotifyRoleQuery()).select('login').lean();
    const logins = new Set(
      buyers.map((u) => String(u.login || '').trim()).filter(Boolean)
    );
    const execLogin = String(pr.executorLogin || '').trim();
    if (execLogin) logins.add(execLogin);
    for (const login of logins) {
      await createManagerNotificationDeduped({
        recipientLogin: login,
        kind: 'procurement_receipt_partial',
        procurementRequestId: pr._id,
        requestNumber: rn,
        title: `Часткове надходження: ${rn}`,
        body,
        read: false,
        dedupeKey: `proc_partial:${pr._id}:${login}:${Date.now()}`
      });
    }
  } catch (e) {
    console.error('[procurement] notifyProcurementExecutorReceiptPartial:', e.message);
  }
}

/**
 * Після часткового прийому: залишок по позиціях (очікуване мінус прийняте), повернення в роботу виконавцю.
 * Очікувана кількість береться з полів до зміни quantity/analogQuantity.
 */
function applyRemainingQuantitiesAfterPartialWarehouseReceipt(pr) {
  const at = pr.warehouseReceivedAt || new Date();
  const cl = String(pr.warehouseConfirmerLogin || '').trim();
  const cn = String(pr.warehouseConfirmerName || '').trim();
  for (let i = 0; i < pr.materials.length; i++) {
    const line = pr.materials[i];
    const exp = expectedQtyForProcurementMaterialLine(line);
    const recv = line.receivedQuantity;
    if (line.rejected) {
      line.receivedQuantity = null;
      continue;
    }
    if (exp === null) {
      line.receivedQuantity = null;
      continue;
    }
    const received = Number(recv);
    const r = Number.isFinite(received) ? received : 0;
    if (r > 0) {
      if (!Array.isArray(line.warehouseReceiptEvents)) line.warehouseReceiptEvents = [];
      line.warehouseReceiptEvents.push({
        acceptedQuantity: r,
        acceptedAt: at,
        confirmerLogin: cl,
        confirmerName: cn
      });
    }
    const remaining = Math.max(0, exp - r);
    if (line.analogShipped && String(line.analogName || '').trim()) {
      line.analogQuantity = remaining;
      if (remaining <= 0) {
        line.analogShipped = false;
      }
    } else {
      line.quantity = remaining > 0 ? remaining : 0;
    }
    line.receivedQuantity = null;
  }
  pr.status = 'partially_fulfilled';
  pr.receiptOutcome = 'pending';
  pr.actualWarehouse = '';
  pr.executorCompletedAt = null;
  pr.markModified('materials');
}

/** Нова заявка — для виконавців VidZakupok та адміністраторів (як у isVidZakupokProcurementRole), без дубля заявнику */
async function notifyVidZakupokNewProcurementRequest(pr) {
  try {
    const buyers = await User.find(procurementNotifyRoleQuery()).select('login').lean();
    const rn = pr.requestNumber || String(pr._id);
    const requesterLabel = pr.requesterName || pr.requesterLogin || '—';
    const reqLoginNorm = normalizeLoginCompare(pr.requesterLogin);
    for (const u of buyers) {
      const login = String(u.login || '').trim();
      if (!login || normalizeLoginCompare(login) === reqLoginNorm) continue;
      await createManagerNotificationDeduped({
        recipientLogin: login,
        kind: 'procurement_request_new',
        procurementRequestId: pr._id,
        requestNumber: rn,
        title: `Нова заявка на закупівлю: ${rn}`,
        body: `Подано нову заявку (${rn}). Заявник: ${requesterLabel}. Перегляньте у відділі закупівель.`,
        read: false,
        dedupeKey: `proc_new:${pr._id}:${login}`
      });
    }
  } catch (e) {
    console.error('[procurement] notifyVidZakupokNewProcurementRequest:', e.message);
  }
}

/** Повне завершення (склад підтвердив) — персонально заявнику */
async function notifyProcurementRequesterCompleted(pr) {
  try {
    const login = String(pr.requesterLogin || '').trim();
    if (!login) return;
    const rn = pr.requestNumber || String(pr._id);
    const greet = String(pr.requesterName || login).trim();
    await createManagerNotificationDeduped({
      recipientLogin: login,
      kind: 'procurement_request_completed',
      procurementRequestId: pr._id,
      requestNumber: rn,
      title: `Заявку виконано: ${rn}`,
      body: `${greet}, заявку ${rn} повністю виконано: прийом на складі підтверджено.`,
      read: false,
      dedupeKey: `proc_done:${pr._id}`
    });
  } catch (e) {
    console.error('[procurement] notifyProcurementRequesterCompleted:', e.message);
  }
}

async function userCanReadProcurementRequest(reqUser, dbUser, pr) {
  if (!pr) return false;
  if (isVidZakupokProcurementRole(reqUser.role)) return true;
  if (String(pr.requesterLogin || '').trim() === String(reqUser.login || '').trim()) return true;
  if (isWarehouseProcurementConfirmRole(reqUser.role)) {
    const names = await getWarehouseNamesForProcurementReceiptUser(reqUser, dbUser);
    const aw = String(pr.actualWarehouse || '').trim();
    return names.some((n) => n === aw);
  }
  return false;
}

function isVidZakupokProcurementRole(role) {
  return ['vidzakupok', 'admin', 'administrator'].includes(String(role || '').toLowerCase());
}

function isWarehouseProcurementConfirmRole(role) {
  return ['warehouse', 'zavsklad', 'admin', 'administrator'].includes(String(role || '').toLowerCase());
}

/** Ролі завсклада: мутації складу лише в межах регіону користувача (див. ensureWarehouseStaff*). */
function escapeRegExpForRegion(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRegionalWarehouseStaffRole(role) {
  return ['warehouse', 'zavsklad'].includes(String(role || '').toLowerCase());
}

function bypassesRegionalWarehouseInventoryLock(role) {
  return ['admin', 'administrator', 'mgradm'].includes(String(role || '').toLowerCase());
}

async function loadActiveWarehouseIdsForUserRegion(regionRaw) {
  const r = String(regionRaw || '').trim();
  if (!r) return new Set();
  const pattern = new RegExp(escapeRegExpForRegion(r), 'i');
  const whs = await Warehouse.find({ isActive: true, region: pattern }).select('_id').lean();
  return new Set(whs.map((w) => String(w._id)));
}

function warehouseIdInRegionalSet(warehouseId, allowedIds) {
  if (warehouseId === undefined || warehouseId === null || warehouseId === '') return false;
  return allowedIds.has(String(warehouseId));
}

/**
 * Завсклад / warehouse: дія лише якщо warehouseId — один із активних складів регіону користувача.
 * Інші ролі — без обмеження тут.
 */
async function ensureWarehouseStaffWarehouseIdAllowed(res, reqUser, dbUser, warehouseId, errorMessage) {
  if (bypassesRegionalWarehouseInventoryLock(reqUser.role)) return true;
  if (!isRegionalWarehouseStaffRole(reqUser.role)) return true;
  if (!dbUser) {
    res.status(401).json({ error: 'Користувач не знайдено' });
    return false;
  }
  const allowed = await loadActiveWarehouseIdsForUserRegion(dbUser.region);
  if (!allowed.size) {
    res.status(403).json({
      error:
        'Для вашого профілю не знайдено активних складів у вашому регіоні (поле «Регіон» у користувача або склади в БД). Зверніться до адміністратора.'
    });
    return false;
  }
  if (!warehouseIdInRegionalSet(warehouseId, allowed)) {
    res.status(403).json({
      error:
        errorMessage ||
        'Операція дозволена лише щодо складу вашого регіону.'
    });
    return false;
  }
  return true;
}

/** Товар має фізично перебувати на складі зі списку регіону користувача (завсклад / warehouse). */
async function ensureWarehouseStaffEquipmentAccess(res, reqUser, dbUser, equipment, errorMessage) {
  if (!equipment) {
    res.status(404).json({ error: 'Обладнання не знайдено' });
    return false;
  }
  return ensureWarehouseStaffWarehouseIdAllowed(
    res,
    reqUser,
    dbUser,
    equipment.currentWarehouse,
    errorMessage || 'Дія дозволена лише для товару на складі вашого регіону.'
  );
}

/** Міжрегіональне переміщення: склад призначення не в регіоні користувача (завсклад / warehouse). */
async function ensureWarehouseStaffMoveDestinationOutsideRegion(res, reqUser, dbUser, toWarehouseId) {
  if (bypassesRegionalWarehouseInventoryLock(reqUser.role)) return true;
  if (!isRegionalWarehouseStaffRole(reqUser.role)) return true;
  if (!dbUser) {
    res.status(401).json({ error: 'Користувач не знайдено' });
    return false;
  }
  const allowed = await loadActiveWarehouseIdsForUserRegion(dbUser.region);
  if (!allowed.size) {
    res.status(403).json({
      error:
        'Для вашого профілю не знайдено активних складів у вашому регіоні. Зверніться до адміністратора.'
    });
    return false;
  }
  if (warehouseIdInRegionalSet(toWarehouseId, allowed)) {
    res.status(403).json({
      error:
        'Склад призначення має бути в іншому регіоні (не на складах вашого регіону). Оберіть склад поза вашим регіоном.'
    });
    return false;
  }
  return true;
}

/**
 * Документ переміщення: хто може змінювати статус.
 * — Відправник: зі свого складу → на склад іншого регіону.
 * — Прийом після «в дорозі»: одержувач (toWarehouse у своєму регіоні).
 * — «Скасовано»: будь-яка зі сторін у регіоні.
 */
async function ensureWarehouseStaffMovementDocTransition(res, reqUser, dbUser, prevStatus, doc) {
  if (bypassesRegionalWarehouseInventoryLock(reqUser.role)) return true;
  if (!isRegionalWarehouseStaffRole(reqUser.role)) return true;
  if (!dbUser) {
    res.status(401).json({ error: 'Користувач не знайдено' });
    return false;
  }
  const allowed = await loadActiveWarehouseIdsForUserRegion(dbUser.region);
  if (!allowed.size) {
    res.status(403).json({
      error:
        'Для вашого профілю не знайдено активних складів у вашому регіоні. Зверніться до адміністратора.'
    });
    return false;
  }
  const fromW = doc.fromWarehouse;
  const toW = doc.toWarehouse;
  const nextSt = doc.status;
  const wasCancelled = prevStatus === 'cancelled';
  const wasCompleted = prevStatus === 'completed';
  const wasInTransit = prevStatus === 'in_transit';

  if (nextSt === 'cancelled' && !wasCancelled) {
    if (!warehouseIdInRegionalSet(fromW, allowed) && !warehouseIdInRegionalSet(toW, allowed)) {
      res.status(403).json({
        error:
          'Скасувати документ переміщення можна лише якщо відправник або одержувач належить до вашого регіону.'
      });
      return false;
    }
    return true;
  }
  if (nextSt === 'in_transit' && !wasInTransit) {
    if (!warehouseIdInRegionalSet(fromW, allowed)) {
      res.status(403).json({
        error: 'Перевести в «в дорозі» можна лише зі складу відправника вашого регіону.'
      });
      return false;
    }
    if (warehouseIdInRegionalSet(toW, allowed)) {
      res.status(403).json({
        error: 'Склад призначення має бути в іншому регіоні (поза вашим регіоном).'
      });
      return false;
    }
    return true;
  }
  if (nextSt === 'completed' && !wasCompleted) {
    if (wasInTransit) {
      if (!warehouseIdInRegionalSet(toW, allowed)) {
        res.status(403).json({
          error: 'Завершити документ переміщення (прийом) можна лише для складу одержувача вашого регіону.'
        });
        return false;
      }
    } else {
      if (!warehouseIdInRegionalSet(fromW, allowed)) {
        res.status(403).json({
          error: 'Оформити переміщення можна лише зі складу вашого регіону.'
        });
        return false;
      }
      if (warehouseIdInRegionalSet(toW, allowed)) {
        res.status(403).json({
          error: 'Склад призначення має бути поза вашим регіоном.'
        });
        return false;
      }
    }
    return true;
  }
  return true;
}

async function loadEquipmentWarehouseMapForIds(idStrings) {
  const map = new Map();
  const unique = [...new Set((idStrings || []).map((id) => String(id)).filter(Boolean))];
  const oids = unique.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (!oids.length) return map;
  const rows = await Equipment.find({ _id: { $in: oids } }).select('_id currentWarehouse').lean();
  for (const e of rows) {
    map.set(String(e._id), e.currentWarehouse != null ? String(e.currentWarehouse) : '');
  }
  return map;
}

/** Заявка на відвантаження: хоча б один рядок зі складу регіону (для списку / перегляду завсклад). */
function shipmentRequestTouchesRegionalWarehouses(sr, allowedWarehouseIds, equipmentWarehouseMap) {
  return (sr.equipmentIds || []).some((eid) =>
    warehouseIdInRegionalSet(equipmentWarehouseMap.get(String(eid)), allowedWarehouseIds)
  );
}

/** Усе обладнання заявки зараз на складах цього регіону (для «виконано»). */
function shipmentRequestAllEquipmentInRegionalWarehouses(sr, allowedWarehouseIds, equipmentWarehouseMap) {
  const ids = sr.equipmentIds || [];
  if (!ids.length) return false;
  return ids.every((eid) =>
    warehouseIdInRegionalSet(equipmentWarehouseMap.get(String(eid)), allowedWarehouseIds)
  );
}

/** Один документ: точні пари «назва з Excel → categoryId» для імпорту залишків (персистентно на Render тощо). */
const STOCK_IMPORT_NOMENCLATURE_DOC_ID = 'singleton';
const stockImportNomenclatureSchema = new mongoose.Schema({
  _id: { type: String, default: STOCK_IMPORT_NOMENCLATURE_DOC_ID },
  nomenclatureCategoryMap: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'stockimport_nomenclature_maps' });
const StockImportNomenclature = mongoose.model('StockImportNomenclature', stockImportNomenclatureSchema);

async function loadStockImportNomenclatureMap() {
  const doc = await StockImportNomenclature.findById(STOCK_IMPORT_NOMENCLATURE_DOC_ID).lean();
  const m = doc?.nomenclatureCategoryMap;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  return { ...m };
}

// ============================================
// МОДЕЛІ ДОКУМЕНТІВ СКЛАДСЬКОГО ОБЛІКУ
// ============================================

// Схема для документів надходження
const receiptDocumentSchema = new mongoose.Schema({
  documentNumber: { type: String, required: true }, // unique: true видалено - індекс створюється через schema.index()
  documentDate: { type: Date, default: Date.now },
  supplier: String, // Постачальник
  supplierEdrpou: String,
  warehouse: { type: String, required: true }, // ID складу
  warehouseName: String,
  items: [{
    equipmentId: String, // ID обладнання
    type: String,
    serialNumber: String,
    quantity: { type: Number, default: 1 },
    unitPrice: Number,
    totalPrice: Number,
    batchId: String,
    batchName: String,
    notes: String
  }],
  totalAmount: Number,
  currency: { type: String, default: 'грн.' },
  notes: String,
  attachedFiles: [{
    cloudinaryUrl: String,
    cloudinaryId: String,
    originalName: String,
    mimetype: String,
    size: Number
  }],
  createdBy: String,
  createdByName: String,
  status: { type: String, enum: ['draft', 'completed', 'cancelled'], default: 'draft' }
}, { timestamps: true });

receiptDocumentSchema.index({ documentNumber: 1 }, { unique: true });
receiptDocumentSchema.index({ documentDate: -1 });
receiptDocumentSchema.index({ warehouse: 1 });
const ReceiptDocument = mongoose.model('ReceiptDocument', receiptDocumentSchema);

// Схема для документів переміщення
const movementItemSchema = new mongoose.Schema({
  equipmentId: { type: String },
  type: { type: String },
  serialNumber: { type: String },
  quantity: { type: Number, default: 1 },
  batchId: { type: String },
  notes: { type: String },
  equipmentStatus: { type: String } // Статус обладнання на момент переміщення
}, { _id: false });

const movementDocumentSchema = new mongoose.Schema({
  documentNumber: { type: String, required: true }, // unique: true видалено - індекс створюється через schema.index()
  documentDate: { type: Date, default: Date.now },
  fromWarehouse: { type: String, required: true },
  fromWarehouseName: String,
  toWarehouse: { type: String, required: true },
  toWarehouseName: String,
  items: { type: [movementItemSchema], default: [] },
  reason: String,
  notes: String,
  attachedFiles: [{
    cloudinaryUrl: String,
    cloudinaryId: String,
    originalName: String,
    mimetype: String,
    size: Number
  }],
  createdBy: String,
  createdByName: String,
  receivedBy: String, // Хто прийняв товар
  receivedByName: String,
  status: { type: String, enum: ['draft', 'in_transit', 'completed', 'cancelled'], default: 'draft' }
}, { timestamps: true });

movementDocumentSchema.index({ documentNumber: 1 }, { unique: true });
movementDocumentSchema.index({ documentDate: -1 });
movementDocumentSchema.index({ fromWarehouse: 1, documentDate: -1 });
movementDocumentSchema.index({ toWarehouse: 1, documentDate: -1 }); // Для фільтра $or по складу
const MovementDocument = mongoose.model('MovementDocument', movementDocumentSchema);

// Схема для документів відвантаження
const shipmentDocumentSchema = new mongoose.Schema({
  documentNumber: { type: String, required: true }, // unique: true видалено - індекс створюється через schema.index()
  documentDate: { type: Date, default: Date.now },
  shippedTo: { type: String, required: true }, // Назва клієнта
  clientEdrpou: String,
  clientAddress: String,
  invoiceRecipientDetails: String,
  warehouse: String,
  warehouseName: String,
  items: [{
    equipmentId: String,
    type: String,
    serialNumber: String,
    quantity: { type: Number, default: 1 },
    unitPrice: Number,
    totalPrice: Number,
    batchId: String,
    notes: String
  }],
  orderNumber: String,
  invoiceNumber: String,
  totalAmount: Number,
  currency: { type: String, default: 'грн.' },
  notes: String,
  attachedFiles: [{
    cloudinaryUrl: String,
    cloudinaryId: String,
    originalName: String,
    mimetype: String,
    size: Number
  }],
  createdBy: String,
  createdByName: String,
  status: { type: String, enum: ['draft', 'shipped', 'delivered', 'cancelled'], default: 'draft' }
}, { timestamps: true });

shipmentDocumentSchema.index({ documentNumber: 1 }, { unique: true });
shipmentDocumentSchema.index({ documentDate: -1 });
shipmentDocumentSchema.index({ shippedTo: 1 });
const ShipmentDocument = mongoose.model('ShipmentDocument', shipmentDocumentSchema);

// Схема для документів інвентаризації
const inventoryDocumentSchema = new mongoose.Schema({
  documentNumber: { type: String, required: true }, // unique: true видалено - індекс створюється через schema.index()
  documentDate: { type: Date, default: Date.now },
  warehouse: { type: String, required: true },
  warehouseName: String,
  inventoryDate: Date,
  items: [{
    equipmentId: String,
    type: String,
    serialNumber: String,
    quantityInSystem: { type: Number, default: 0 }, // Кількість в системі
    quantityActual: { type: Number, default: 0 }, // Фактична кількість
    difference: { type: Number, default: 0 }, // Різниця
    notes: String
  }],
  status: { type: String, enum: ['draft', 'in_progress', 'completed', 'cancelled'], default: 'draft' },
  notes: String,
  attachedFiles: [{
    cloudinaryUrl: String,
    cloudinaryId: String,
    originalName: String,
    mimetype: String,
    size: Number
  }],
  createdBy: String,
  createdByName: String,
  completedBy: String,
  completedByName: String,
  completedAt: Date
}, { timestamps: true });

inventoryDocumentSchema.index({ documentNumber: 1 }, { unique: true });
inventoryDocumentSchema.index({ documentDate: -1 });
inventoryDocumentSchema.index({ warehouse: 1 });
const InventoryDocument = mongoose.model('InventoryDocument', inventoryDocumentSchema);

// Підсхема для позицій резервування
const reservationItemSchema = new mongoose.Schema({
  equipmentId: { type: String, required: true },
  type: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  warehouse: { type: String, default: '' },
  warehouseName: { type: String, default: '' },
  batchId: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { _id: false });

// Схема для резервування товарів
const reservationSchema = new mongoose.Schema({
  reservationNumber: { type: String, required: true }, // unique: true видалено - індекс створюється через schema.index()
  reservationDate: { type: Date, default: Date.now },
  clientName: String,
  clientEdrpou: String,
  orderNumber: String,
  items: { type: [reservationItemSchema], default: [] },
  reservedUntil: Date, // До якої дати зарезервовано
  status: { type: String, enum: ['active', 'completed', 'cancelled', 'expired'], default: 'active' },
  notes: String,
  createdBy: String,
  createdByName: String,
  cancelledBy: String,
  cancelledByName: String,
  cancelledAt: Date
}, { timestamps: true });

reservationSchema.index({ reservationNumber: 1 }, { unique: true });
reservationSchema.index({ reservationDate: -1 });
reservationSchema.index({ status: 1 });
reservationSchema.index({ reservedUntil: 1 });
const Reservation = mongoose.model('Reservation', reservationSchema);

// Лічильник номерів заявок на відвантаження (SV-#####)
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
}, { collection: 'counters' });
const Counter = mongoose.model('Counter', counterSchema);

/** Номер угоди NU-##### (лічильник saleNu у колекції counters) */
async function getNextSaleNuNumber() {
  const c = await Counter.findOneAndUpdate(
    { _id: 'saleNu' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const n = c.seq || 1;
  return `NU-${String(n).padStart(5, '0')}`;
}

/** Завжди повертає рядок, ніколи не кидає (прев’ю номера не має ламати UI). */
async function peekSaleNuPreviewNumber() {
  try {
    if (mongoose.connection?.readyState !== 1) {
      console.warn('[peekSaleNuPreviewNumber] MongoDB не готова, прев’ю NU-00001');
      return 'NU-00001';
    }
    const c = await Counter.findOne({ _id: 'saleNu' }).lean();
    const n = (c?.seq || 0) + 1;
    return `NU-${String(n).padStart(5, '0')}`;
  } catch (e) {
    console.error('[peekSaleNuPreviewNumber]', e);
    return 'NU-00001';
  }
}

/** Запит менеджера на відвантаження (складський облік) */
const shipmentRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, required: true, unique: true },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  clientName: String,
  managerLogin: String,
  managerName: String,
  plannedShipmentDate: { type: Date, required: true },
  shipmentAddress: { type: String, required: true },
  carrier: { type: String, required: true },
  driverPhone: { type: String, required: true },
  vehicleType: String,
  ttnFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
  lineIds: [{ type: String }],
  equipmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' }],
  warehouseRegions: [{ type: String }],
  status: { type: String, enum: ['pending', 'fulfilled', 'cancelled'], default: 'pending' }
}, { timestamps: true });
shipmentRequestSchema.index({ saleId: 1, createdAt: -1 });
shipmentRequestSchema.index({ status: 1, createdAt: -1 });
const ShipmentRequest = mongoose.model('ShipmentRequest', shipmentRequestSchema);

/** Журнал руху товару (складський облік): заявки, відвантаження, переміщення, зміна статусу */
const inventoryMovementLogSchema = new mongoose.Schema(
  {
    occurredAt: { type: Date, default: Date.now, index: true },
    eventType: { type: String, required: true },
    performedByLogin: String,
    performedByName: String,
    equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
    equipmentType: String,
    serialNumber: String,
    quantity: { type: Number, default: 1 },
    fromStatus: String,
    toStatus: String,
    managerLogin: String,
    managerName: String,
    clientName: String,
    clientEdrpou: String,
    shipmentAddress: String,
    destinationWarehouseName: String,
    sourceWarehouseName: String,
    shipmentRequestNumber: String,
    shipmentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentRequest' },
    saleNumber: String,
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    notes: String
  },
  { timestamps: true }
);
inventoryMovementLogSchema.index({ occurredAt: -1 });
const InventoryMovementLog = mongoose.model('InventoryMovementLog', inventoryMovementLogSchema);

async function logInventoryMovement(entry) {
  try {
    await InventoryMovementLog.create({
      occurredAt: entry.occurredAt || new Date(),
      ...entry
    });
  } catch (e) {
    console.error('[logInventoryMovement]', e);
  }
}

// ============================================
// CRM - Клієнти та продажі для менеджерів
// ============================================

const clientSchema = new mongoose.Schema({
  edrpou: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  address: String,
  contactPerson: String,
  contactPhone: String,
  contacts: [{ person: String, phone: String }], // Декілька контактів
  email: String,
  assignedManagerLogin: { type: String, required: true },
  assignedManagerLogin2: String,
  createdByLogin: String,
  createdByName: String,
  region: String,
  notes: String
}, { timestamps: true });

const Client = mongoose.model('Client', clientSchema);

const interactionSchema = new mongoose.Schema({
  entityType: { type: String, required: true, default: 'client' },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  date: { type: Date, default: Date.now },
  userLogin: { type: String, required: true },
  userName: String,
  notes: String
}, { timestamps: true });
interactionSchema.index({ entityType: 1, entityId: 1, date: -1 });
const Interaction = mongoose.model('Interaction', interactionSchema);

const additionalCostSchema = new mongoose.Schema({
  id: String,
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  notes: String
}, { _id: false });

const equipmentItemSchema = new mongoose.Schema({
  lineId: String,
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  type: String,
  serialNumber: String,
  amount: { type: Number, default: 0 },
  shipmentLocked: { type: Boolean, default: false },
  shipmentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShipmentRequest' }
}, { _id: false });

const paymentItemSchema = new mongoose.Schema({
  id: String,
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'UAH' },
  rate: { type: Number, default: 1 }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  edrpou: { type: String }, // Опціонально — приватнимні особи не мають ЄДРПОУ
  managerLogin: { type: String, required: true },
  managerLogin2: String,
  tenderEmployeeLogin: String,
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  mainProductName: String,
  mainProductSerial: String,
  mainProductAmount: { type: Number },
  equipmentItems: [equipmentItemSchema],
  additionalCosts: [additionalCostSchema],
  payments: [paymentItemSchema],
  saleDate: { type: Date, required: true },
  warrantyMonths: { type: Number, default: 12 },
  warrantyUntil: Date,
  totalAmount: Number,
  status: { type: String, enum: ['draft', 'primary_contact', 'quote_sent', 'in_negotiation', 'in_progress', 'in_realization', 'pnr', 'success', 'confirmed', 'cancelled'], default: 'in_negotiation' },
  statusHistory: [{ from: String, to: String, date: Date, userLogin: String }],
  notes: String,
  // Додаткові поля угоди (ТЗ документ «Соглашение»)
  addressMM: String,           // Адрес ММ (об'єкт)
  buyer: String,              // Покупатель — фактичний покупець
  invoiceNumber: String,      // Номер видаткової накладної
  paymentMethod: String,      // Способ оплаты
  engineer: String,           // Інженер
  warehouseName: String,      // Склад відвантаження
  transportCosts: { type: Number, default: 0 },
  pnrCosts: { type: Number, default: 0 },
  representativeCosts: { type: Number, default: 0 },
  otherCosts: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  managerPremium: { type: Number, default: 0 },
  // Затвердження премії бухгалтерією відділу продажів (після status success)
  premiumAccruedAt: Date,
  premiumAccruedByLogin: String,
  premiumAccrualPeriod: String, // MM-YYYY для обліку
  partner: String,           // Партнер
  partnerContactName: String, // ФІО контактної особи партнера
  /** Людськочитаний номер угоди для обліку, формат NU-##### (не редагується з клієнта) */
  saleNumber: { type: String, sparse: true, unique: true }
}, { timestamps: true });

saleSchema.pre('save', function(next) {
  let mainAmount = this.mainProductAmount || 0;
  if (this.equipmentItems && this.equipmentItems.length > 0) {
    mainAmount = this.equipmentItems.reduce((s, i) => s + (i.amount || 0), 0);
    this.mainProductAmount = mainAmount;
    const first = this.equipmentItems[0];
    if (!this.equipmentId && first) this.equipmentId = first.equipmentId;
    if (!this.mainProductName && first) this.mainProductName = first.type;
    if (!this.mainProductSerial && first) this.mainProductSerial = first.serialNumber;
  }
  const addSum = (this.additionalCosts || []).reduce(
    (s, c) => s + (c.amount || 0) * (c.quantity || 1),
    0
  );
  this.totalAmount = mainAmount + addSum;
  if (this.saleDate && this.warrantyMonths) {
    const d = new Date(this.saleDate);
    d.setMonth(d.getMonth() + this.warrantyMonths);
    this.warrantyUntil = d;
  }
  next();
});

const Sale = mongoose.model('Sale', saleSchema);

/** Статуси угоди, у яких позицію ще можна вести (як у SalesTab: переговори + реалізація). */
const ACTIVE_SALE_STATUSES_FOR_RESERVE_TRANSFER = [
  'draft',
  'primary_contact',
  'quote_sent',
  'in_negotiation',
  'in_progress',
  'in_realization',
  'pnr'
];

function saleManagedByLoginQuery(login) {
  return { $or: [{ managerLogin: login }, { managerLogin2: login }] };
}

/** Зняти обладнання з активних угод менеджера (після передачі резерву). */
async function removeEquipmentFromManagersActiveSales(managerLogin, equipmentObjectId) {
  const eid = String(equipmentObjectId);
  const sales = await Sale.find({
    $and: [
      saleManagedByLoginQuery(managerLogin),
      { status: { $in: ACTIVE_SALE_STATUSES_FOR_RESERVE_TRANSFER } },
      {
        $or: [{ equipmentId: equipmentObjectId }, { 'equipmentItems.equipmentId': equipmentObjectId }]
      }
    ]
  });
  for (const sale of sales) {
    const filtered = (sale.equipmentItems || []).filter(
      (i) => !i.equipmentId || String(i.equipmentId) !== eid
    );
    sale.equipmentItems = filtered;
    if (filtered.length > 0) {
      const first = filtered[0];
      sale.equipmentId = first.equipmentId;
      sale.mainProductName = first.type;
      sale.mainProductSerial = first.serialNumber;
    } else {
      sale.equipmentId = undefined;
      sale.mainProductName = undefined;
      sale.mainProductSerial = undefined;
    }
    const mainAmount = filtered.reduce((sum, i) => sum + (i.amount || 0), 0);
    sale.mainProductAmount = mainAmount;
    const addSum = (sale.additionalCosts || []).reduce((s, c) => s + (c.amount || 0) * (c.quantity || 1), 0);
    sale.totalAmount = mainAmount + addSum;
    await sale.save();
  }
}

/** Додати рядок обладнання в останню за часом оновлення активну угоду отримувача. */
async function addEquipmentToManagersLatestActiveSale(managerLogin, equipmentDoc) {
  const sale = await Sale.findOne({
    $and: [
      saleManagedByLoginQuery(managerLogin),
      { status: { $in: ACTIVE_SALE_STATUSES_FOR_RESERVE_TRANSFER } }
    ]
  }).sort({ updatedAt: -1 });

  if (!sale) return null;

  const eid = equipmentDoc._id.toString();
  const items = [...(sale.equipmentItems || [])];
  if (items.some((i) => i.equipmentId && String(i.equipmentId) === eid)) {
    return sale;
  }

  items.push({
    equipmentId: equipmentDoc._id,
    type: equipmentDoc.type || '',
    serialNumber: equipmentDoc.serialNumber || '',
    amount: 0
  });
  sale.equipmentItems = items;
  const first = items[0];
  sale.equipmentId = first.equipmentId;
  sale.mainProductName = first.type;
  sale.mainProductSerial = first.serialNumber;
  const mainAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  sale.mainProductAmount = mainAmount;
  const addSum = (sale.additionalCosts || []).reduce((s, c) => s + (c.amount || 0) * (c.quantity || 1), 0);
  sale.totalAmount = mainAmount + addSum;
  await sale.save();
  return sale;
}

// ============================================
// ОПТИМІЗОВАНІ API ENDPOINTS
// ============================================

// Публічні endpoints (без автентифікації)
// Ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Версія мобільного додатку — для перевірки оновлень при вході (дистаційний апдейт)
// Джерело правди: backend/app-version.json (при релізі оновіть його разом із pubspec.yaml у dts-mobile)
// Env-змінні на Render лишаються запасним варіантом, якщо файлу немає
function getAppVersionConfig() {
  const p = path.join(__dirname, 'app-version.json');
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        latest_version: data.latest_version ?? process.env.APP_VERSION ?? '0.1.0',
        min_version: data.min_version ?? process.env.APP_MIN_VERSION ?? '0.1.0',
        force_update: data.force_update === true || process.env.APP_FORCE_UPDATE === 'true',
        android_store_url: data.android_store_url ?? process.env.APP_ANDROID_STORE_URL ?? 'https://play.google.com/store/apps/details?id=com.example.dts_mobile',
        ios_store_url: data.ios_store_url ?? process.env.APP_IOS_STORE_URL ?? 'https://apps.apple.com/app/dts-mobile/id000000000',
      };
    }
  } catch (e) {
    console.warn('[app-version] Could not read app-version.json, using env:', e.message);
  }
  return {
    latest_version: process.env.APP_VERSION || '0.1.0',
    min_version: process.env.APP_MIN_VERSION || '0.1.0',
    force_update: process.env.APP_FORCE_UPDATE === 'true',
    android_store_url: process.env.APP_ANDROID_STORE_URL || 'https://play.google.com/store/apps/details?id=com.example.dts_mobile',
    ios_store_url: process.env.APP_IOS_STORE_URL || 'https://apps.apple.com/app/dts-mobile/id000000000',
  };
}
app.get('/api/app-version', (req, res) => {
  res.json(getAppVersionConfig());
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

// ============================================
// ВІДДІЛ ЗАКУПІВЕЛЬ — заявки на закупівлю
// ============================================

const PROCUREMENT_DOC_LIST_PROJECTION = '-attachments.data -executorAttachments.data';

/** Редагування матеріалів / відвантаження виконавцем після взяття в роботу або після часткового прийому на складі */
const PROCUREMENT_EXECUTOR_WORK_STATUSES = ['in_progress', 'partially_fulfilled'];

function procurementExecutorCanEditWork(status) {
  return PROCUREMENT_EXECUTOR_WORK_STATUSES.includes(status);
}

function canUploadProcurementExecutorFiles(reqUser, pr) {
  const r = String(reqUser.role || '').toLowerCase();
  if (['admin', 'administrator'].includes(r)) return true;
  if (!isVidZakupokProcurementRole(r)) return false;
  return String(pr.executorLogin || '') === String(reqUser.login || '');
}

function validateProcurementMaterialsRejectionReasons(materials) {
  if (!materials || !materials.length) return null;
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    if (m.rejected && !String(m.rejectionReason || '').trim()) {
      return `Позиція ${i + 1}: для відхиленого матеріалу обовʼязково вкажіть причину`;
    }
  }
  return null;
}

function escapeRegExpForProcurementHint(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.get('/api/procurement-requests/nomenclature-hints', async (req, res) => {
  const startTime = Date.now();
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      logPerformance('GET /api/procurement-requests/nomenclature-hints', startTime, 0);
      return res.json([]);
    }
    const rx = new RegExp(escapeRegExpForProcurementHint(q), 'i');
    const cards = await ProductCard.find({
      isActive: true,
      $or: [{ displayName: rx }, { type: rx }, { manufacturer: rx }]
    })
      .select('displayName type manufacturer')
      .sort({ displayName: 1 })
      .limit(30)
      .lean();
    const out = cards.map((c) => {
      const label = String(c.displayName || c.type || '').trim() || '—';
      const sub = [c.type, c.manufacturer].filter(Boolean).join(' · ');
      return { id: c._id, label, subtitle: sub };
    });
    logPerformance('GET /api/procurement-requests/nomenclature-hints', startTime, out.length);
    res.json(out);
  } catch (error) {
    logPerformance('GET /api/procurement-requests/nomenclature-hints', startTime);
    console.error('[ERROR] nomenclature-hints:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement-requests', async (req, res) => {
  const startTime = Date.now();
  try {
    const login = String(req.user.login || '').trim();
    const q = {};
    if (!isVidZakupokProcurementRole(req.user.role)) {
      q.requesterLogin = login;
    }
    const rows = await ProcurementRequest.find(q)
      .select(PROCUREMENT_DOC_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean();
    logPerformance('GET /api/procurement-requests', startTime, rows.length);
    res.json(rows);
  } catch (error) {
    logPerformance('GET /api/procurement-requests', startTime);
    console.error('[ERROR] GET /api/procurement-requests:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement-requests/:id/attachments/:attachmentId', async (req, res) => {
  const startTime = Date.now();
  try {
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) {
      logPerformance('GET /api/procurement-requests/.../attachments', startTime);
      return res.status(404).json({ error: 'Заявку не знайдено' });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    if (!(await userCanReadProcurementRequest(req.user, dbUser, pr))) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const att = pr.attachments.id(req.params.attachmentId);
    if (!att || !att.data) {
      logPerformance('GET /api/procurement-requests/.../attachments', startTime);
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    const name = String(att.originalName || 'file').replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(att.data);
    logPerformance('GET /api/procurement-requests/.../attachments', startTime);
  } catch (error) {
    logPerformance('GET /api/procurement-requests/.../attachments', startTime);
    console.error('[ERROR] GET procurement attachment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement-requests/:id/executor-attachments/:attachmentId', async (req, res) => {
  const startTime = Date.now();
  try {
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) {
      logPerformance('GET executor-attachment', startTime);
      return res.status(404).json({ error: 'Заявку не знайдено' });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    if (!(await userCanReadProcurementRequest(req.user, dbUser, pr))) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const att = pr.executorAttachments.id(req.params.attachmentId);
    if (!att || !att.data) {
      logPerformance('GET executor-attachment', startTime);
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    const name = String(att.originalName || 'file').replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(att.data);
    logPerformance('GET executor-attachment', startTime);
  } catch (error) {
    logPerformance('GET executor-attachment', startTime);
    console.error('[ERROR] GET executor attachment:', error);
    res.status(500).json({ error: error.message });
  }
});

function procurementUploadMiddleware(req, res, next) {
  uploadProcurementFiles.array('files', 12)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Помилка завантаження файлу' });
    }
    next();
  });
}

app.post(
  '/api/procurement-requests',
  procurementUploadMiddleware,
  async (req, res) => {
    const startTime = Date.now();
    try {
      const applicationKind = String(req.body.applicationKind || '').trim();
      const priority = String(req.body.priority || '').trim();
      const desiredWarehouse = String(req.body.desiredWarehouse || '').trim();
      const payerCompany = String(req.body.payerCompany || '').trim();
      const notes = String(req.body.notes || '').trim();
      if (!applicationKind || !PROCUREMENT_APPLICATION_KINDS.includes(applicationKind)) {
        return res.status(400).json({ error: 'Оберіть тип заявки: Закупівля або Визначення ціни' });
      }
      if (!payerCompany || !PROCUREMENT_PAYER_COMPANIES.includes(payerCompany)) {
        return res.status(400).json({ error: 'Оберіть компанію платника (ДТС або Дарекс Енерго)' });
      }
      if (!desiredWarehouse) {
        return res.status(400).json({ error: 'Оберіть бажаний склад відвантаження' });
      }
      const allowedP = ['1_workday', '5_workdays', '7_workdays', 'more_than_7_workdays'];
      if (!allowedP.includes(priority)) {
        return res.status(400).json({ error: 'Некоректний пріоритет' });
      }
      let materialsRaw = [];
      try {
        const mr = req.body.materials;
        if (typeof mr === 'string') {
          materialsRaw = JSON.parse(mr || '[]');
        } else if (Array.isArray(mr)) {
          materialsRaw = mr;
        }
      } catch {
        return res.status(400).json({ error: 'Некоректний формат списку матеріалів' });
      }
      if (!Array.isArray(materialsRaw)) {
        return res.status(400).json({ error: 'Матеріали мають бути масивом' });
      }
      const materials = materialsRaw
        .filter((m) => m && String(m.name || '').trim())
        .map((m) => {
          const qRaw = m.quantity;
          const pRaw = m.price;
          const qty =
            qRaw === '' || qRaw === undefined || qRaw === null
              ? null
              : Number(qRaw);
          const price =
            pRaw === '' || pRaw === undefined || pRaw === null
              ? null
              : Number(pRaw);
          let productId = null;
          if (m.productId && mongoose.isValidObjectId(String(m.productId))) {
            productId = new mongoose.Types.ObjectId(String(m.productId));
          }
          return {
            name: String(m.name).trim(),
            quantity: Number.isFinite(qty) ? qty : null,
            price: Number.isFinite(price) ? price : null,
            productId
          };
        });
      const dbUser = await User.findOne({ login: req.user.login }).lean();
      const attachments = (req.files || []).map((f) => ({
        originalName: f.originalname,
        mimeType: f.mimetype || '',
        size: f.size || 0,
        data: f.buffer
      }));
      const requestNumber = await getNextProcurementRequestNumber();
      const doc = await ProcurementRequest.create({
        requestNumber,
        receiptOutcome: 'pending',
        applicationKind,
        description: '',
        payerCompany,
        priority,
        desiredWarehouse,
        notes: notes.slice(0, 50000),
        materials,
        requesterLogin: req.user.login,
        requesterName: String(dbUser?.name || req.user.name || req.user.login).trim(),
        attachments
      });
      const out = await ProcurementRequest.findById(doc._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
      await notifyVidZakupokNewProcurementRequest(out);
      logPerformance('POST /api/procurement-requests', startTime);
      res.status(201).json(out);
    } catch (error) {
      logPerformance('POST /api/procurement-requests', startTime);
      console.error('[ERROR] POST /api/procurement-requests:', error);
      res.status(500).json({ error: error.message || 'Помилка збереження' });
    }
  }
);

app.post('/api/procurement-requests/:id/take-in-work', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!isVidZakupokProcurementRole(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Заявку не знайдено' });
    if (pr.status !== 'pending_review') {
      return res.status(400).json({ error: 'Можна взяти в роботу лише заявку зі статусом «Очікує розгляду»' });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    pr.status = 'in_progress';
    pr.executorLogin = req.user.login;
    pr.executorName = String(dbUser?.name || req.user.name || req.user.login).trim();
    await pr.save();
    const out = await ProcurementRequest.findById(pr._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
    logPerformance('POST /api/procurement-requests/take-in-work', startTime);
    res.json(out);
  } catch (error) {
    logPerformance('POST /api/procurement-requests/take-in-work', startTime);
    console.error('[ERROR] take-in-work:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/procurement-requests/:id/executor-materials', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!isVidZakupokProcurementRole(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Заявку не знайдено' });
    if (!procurementExecutorCanEditWork(pr.status)) {
      return res.status(400).json({
        error: 'Редагування матеріалів доступне для статусів «Взята в роботу» або «Частково виконана»'
      });
    }
    if (!canUploadProcurementExecutorFiles(req.user, pr)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const incoming = req.body.materials;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Очікується масив materials' });
    }
    const n = pr.materials.length;
    if (incoming.length !== n) {
      return res.status(400).json({ error: 'Кількість рядків матеріалів не збігається з заявкою' });
    }
    const qtyErr = validateIncomingExecutorMaterialsAgainstRemainder(pr.materials, incoming);
    if (qtyErr) {
      return res.status(400).json({ error: qtyErr });
    }
    for (let i = 0; i < n; i++) {
      const inc = incoming[i] || {};
      const line = pr.materials[i];
      line.analogName = String(inc.analogName || '').trim();
      const aq = inc.analogQuantity;
      line.analogQuantity =
        aq === '' || aq === undefined || aq === null ? null : Number(aq);
      if (line.analogQuantity !== null && !Number.isFinite(line.analogQuantity)) {
        return res.status(400).json({ error: `Позиція ${i + 1}: некоректна кількість аналогу` });
      }
      line.analogShipped = Boolean(inc.analogShipped);
      line.rejected = Boolean(inc.rejected);
      line.rejectionReason = String(inc.rejectionReason || '').trim();
      if (line.rejected && !line.rejectionReason) {
        return res.status(400).json({
          error: `Позиція ${i + 1}: для відхиленого матеріалу обовʼязково вкажіть причину`
        });
      }
      if (!line.rejected) {
        line.rejectionReason = '';
      }
    }
    await pr.save();
    const out = await ProcurementRequest.findById(pr._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
    logPerformance('PATCH /api/procurement-requests/executor-materials', startTime);
    res.json(out);
  } catch (error) {
    logPerformance('PATCH /api/procurement-requests/executor-materials', startTime);
    console.error('[ERROR] executor-materials:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/procurement-requests/:id/complete-executor', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!isVidZakupokProcurementRole(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const actualWarehouse = String(req.body.actualWarehouse || '').trim();
    if (!actualWarehouse) {
      return res.status(400).json({ error: 'Вкажіть фактичний склад відвантаження' });
    }
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Заявку не знайдено' });
    if (!procurementExecutorCanEditWork(pr.status)) {
      return res.status(400).json({
        error: 'Фактичний склад можна вказати для заявки «Взята в роботу» або «Частково виконана»'
      });
    }
    const matErr = validateProcurementMaterialsRejectionReasons(pr.materials);
    if (matErr) {
      return res.status(400).json({ error: matErr });
    }
    const shipErr = validateProcurementMaterialsForShipment(pr.materials);
    if (shipErr) {
      return res.status(400).json({ error: shipErr });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    pr.actualWarehouse = actualWarehouse;
    pr.executorCompletedAt = new Date();
    pr.executorLogin = req.user.login;
    pr.executorName = String(dbUser?.name || req.user.name || req.user.login).trim();
    pr.status = 'awaiting_warehouse';
    pr.receiptOutcome = 'pending';
    await pr.save();
    await notifyWarehouseStaffProcurementIncoming(pr);
    const out = await ProcurementRequest.findById(pr._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
    logPerformance('PATCH /api/procurement-requests/complete-executor', startTime);
    res.json(out);
  } catch (error) {
    logPerformance('PATCH /api/procurement-requests/complete-executor', startTime);
    console.error('[ERROR] complete-executor:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement-requests/pending-warehouse-receipt/count', async (req, res) => {
  const startTime = Date.now();
  try {
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    const names = await getWarehouseNamesForProcurementReceiptUser(req.user, dbUser);
    if (names.length === 0) {
      logPerformance('GET pending-warehouse-receipt/count', startTime, 0);
      return res.json({ count: 0 });
    }
    const count = await ProcurementRequest.countDocuments({
      status: 'awaiting_warehouse',
      actualWarehouse: { $in: names }
    });
    logPerformance('GET pending-warehouse-receipt/count', startTime, count);
    res.json({ count });
  } catch (error) {
    logPerformance('GET pending-warehouse-receipt/count', startTime);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement-requests/pending-warehouse-receipt', async (req, res) => {
  const startTime = Date.now();
  try {
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    const names = await getWarehouseNamesForProcurementReceiptUser(req.user, dbUser);
    if (names.length === 0) {
      logPerformance('GET pending-warehouse-receipt', startTime, 0);
      return res.json([]);
    }
    const rows = await ProcurementRequest.find({
      status: 'awaiting_warehouse',
      actualWarehouse: { $in: names }
    })
      .select(PROCUREMENT_DOC_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean();
    logPerformance('GET pending-warehouse-receipt', startTime, rows.length);
    res.json(rows);
  } catch (error) {
    logPerformance('GET pending-warehouse-receipt', startTime);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement-requests/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Некоректний ідентифікатор заявки' });
    }
    const pr = await ProcurementRequest.findById(req.params.id)
      .select(PROCUREMENT_DOC_LIST_PROJECTION)
      .lean();
    if (!pr) {
      logPerformance('GET /api/procurement-requests/:id', startTime);
      return res.status(404).json({ error: 'Заявку не знайдено' });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    if (!(await userCanReadProcurementRequest(req.user, dbUser, pr))) {
      logPerformance('GET /api/procurement-requests/:id', startTime);
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    logPerformance('GET /api/procurement-requests/:id', startTime);
    res.json(pr);
  } catch (error) {
    logPerformance('GET /api/procurement-requests/:id', startTime);
    console.error('[ERROR] GET procurement-request:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Видалення заявки — лише адміністратор (admin / administrator). */
app.delete('/api/procurement-requests/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    const r = String(req.user.role || '').toLowerCase();
    if (!['admin', 'administrator'].includes(r)) {
      return res.status(403).json({ error: 'Видалення заявки доступне лише адміністратору' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Некоректний ідентифікатор заявки' });
    }
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) {
      logPerformance('DELETE /api/procurement-requests/:id', startTime);
      return res.status(404).json({ error: 'Заявку не знайдено' });
    }
    const pid = pr._id;
    await ProcurementRequest.deleteOne({ _id: pid });
    await ManagerUserNotification.deleteMany({ procurementRequestId: pid });
    logPerformance('DELETE /api/procurement-requests/:id', startTime);
    res.json({ ok: true });
  } catch (error) {
    logPerformance('DELETE /api/procurement-requests/:id', startTime);
    console.error('[ERROR] DELETE procurement-request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/procurement-requests/:id/warehouse-receipt', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!isWarehouseProcurementConfirmRole(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Заявку не знайдено' });
    if (pr.status !== 'awaiting_warehouse') {
      return res.status(400).json({
        error: 'Прийом доступний лише для статусу «Чекає відвантаження на склад»'
      });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    const allowed = await getWarehouseNamesForProcurementReceiptUser(req.user, dbUser);
    const aw = String(pr.actualWarehouse || '').trim();
    if (!allowed.some((n) => n === aw)) {
      return res.status(403).json({ error: 'Ця заявка стосується іншого складу' });
    }

    const linesIn = req.body.lines;
    const n = pr.materials.length;
    if (!Array.isArray(linesIn) || linesIn.length !== n) {
      return res.status(400).json({
        error: 'Передайте масив lines з кількістю рядків, як у заявки'
      });
    }

    let partial = false;
    for (let i = 0; i < n; i++) {
      const line = pr.materials[i];
      const inc = linesIn[i] || {};
      const exp = expectedQtyForProcurementMaterialLine(line);
      const rq = inc.receivedQuantity;
      if (line.rejected) {
        line.receivedQuantity = rq === undefined || rq === null || rq === '' ? 0 : Number(rq);
        if (!Number.isFinite(line.receivedQuantity)) line.receivedQuantity = 0;
        if (line.receivedQuantity !== 0) partial = true;
        continue;
      }
      if (exp === null) {
        line.receivedQuantity =
          rq === undefined || rq === null || rq === '' ? null : Number(rq);
        if (line.receivedQuantity != null && !Number.isFinite(line.receivedQuantity)) {
          return res.status(400).json({ error: `Позиція ${i + 1}: некоректна прийнята кількість` });
        }
        continue;
      }
      const finalRq = rq === undefined || rq === null || rq === '' ? exp : Number(rq);
      if (!Number.isFinite(finalRq)) {
        return res.status(400).json({ error: `Позиція ${i + 1}: некоректна прийнята кількість` });
      }
      line.receivedQuantity = finalRq;
      if (line.receivedQuantity !== exp) {
        partial = true;
      }
    }

    pr.warehouseReceivedAt = new Date();
    pr.warehouseConfirmerLogin = req.user.login;
    pr.warehouseConfirmerName = String(dbUser?.name || req.user.name || req.user.login).trim();
    if (partial) {
      applyRemainingQuantitiesAfterPartialWarehouseReceipt(pr);
    } else {
      pr.receiptOutcome = 'full';
      pr.status = 'completed';
    }
    await pr.save();

    if (partial) {
      await notifyProcurementExecutorReceiptPartial(pr);
    } else {
      await notifyProcurementRequesterCompleted(pr);
    }

    const out = await ProcurementRequest.findById(pr._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
    logPerformance('POST /api/procurement-requests/warehouse-receipt', startTime);
    res.json(out);
  } catch (error) {
    logPerformance('POST /api/procurement-requests/warehouse-receipt', startTime);
    console.error('[ERROR] warehouse-receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

/** @deprecated Використовуйте POST .../warehouse-receipt з масивом lines */
app.post('/api/procurement-requests/:id/warehouse-confirm', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!isWarehouseProcurementConfirmRole(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const pr = await ProcurementRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Заявку не знайдено' });
    if (pr.status !== 'awaiting_warehouse') {
      return res.status(400).json({
        error: 'Підтвердження складу доступне лише для статусу «Чекає відвантаження на склад»'
      });
    }
    const dbUser = await User.findOne({ login: req.user.login }).lean();
    const allowed = await getWarehouseNamesForProcurementReceiptUser(req.user, dbUser);
    const aw = String(pr.actualWarehouse || '').trim();
    if (!allowed.some((n) => n === aw)) {
      return res.status(403).json({ error: 'Ця заявка стосується іншого складу' });
    }
    for (let i = 0; i < pr.materials.length; i++) {
      const line = pr.materials[i];
      const exp = expectedQtyForProcurementMaterialLine(line);
      if (line.rejected) {
        line.receivedQuantity = 0;
        continue;
      }
      if (exp === null) {
        line.receivedQuantity = null;
        continue;
      }
      line.receivedQuantity = exp;
    }
    pr.receiptOutcome = 'full';
    pr.warehouseReceivedAt = new Date();
    pr.warehouseConfirmerLogin = req.user.login;
    pr.warehouseConfirmerName = String(dbUser?.name || req.user.name || req.user.login).trim();
    pr.status = 'completed';
    await pr.save();
    await notifyProcurementRequesterCompleted(pr);
    const out = await ProcurementRequest.findById(pr._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
    logPerformance('POST /api/procurement-requests/warehouse-confirm', startTime);
    res.json(out);
  } catch (error) {
    logPerformance('POST /api/procurement-requests/warehouse-confirm', startTime);
    console.error('[ERROR] warehouse-confirm:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post(
  '/api/procurement-requests/:id/executor-attachments',
  procurementUploadMiddleware,
  async (req, res) => {
    const startTime = Date.now();
    try {
      const pr = await ProcurementRequest.findById(req.params.id);
      if (!pr) return res.status(404).json({ error: 'Заявку не знайдено' });
      if (!procurementExecutorCanEditWork(pr.status)) {
        return res.status(400).json({
          error: 'Завантаження файлів виконавця доступне для «Взята в роботу» або «Частково виконана»'
        });
      }
      if (!canUploadProcurementExecutorFiles(req.user, pr)) {
        return res.status(403).json({ error: 'Доступ заборонено' });
      }
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: 'Оберіть файли' });
      }
      const docKindRaw = String(req.body.docKind || 'other').trim();
      const docKind = PROCUREMENT_EXECUTOR_DOC_KINDS.includes(docKindRaw) ? docKindRaw : 'other';
      for (const f of files) {
        pr.executorAttachments.push({
          originalName: f.originalname,
          mimeType: f.mimetype || '',
          size: f.size || 0,
          data: f.buffer,
          docKind
        });
      }
      await pr.save();
      const out = await ProcurementRequest.findById(pr._id).select(PROCUREMENT_DOC_LIST_PROJECTION).lean();
      logPerformance('POST /api/procurement-requests/executor-attachments', startTime);
      res.json(out);
    } catch (error) {
      logPerformance('POST /api/procurement-requests/executor-attachments', startTime);
      console.error('[ERROR] executor-attachments:', error);
      res.status(500).json({ error: error.message || 'Помилка збереження' });
    }
  }
);

/** Task.contractFile у схемі strict:false — може бути рядок URL або об'єкт / масив (імпорт, Cloudinary тощо). */
function normalizeTaskContractFile(contractFile) {
  if (contractFile == null) return { url: '', fileName: 'contract.pdf' };
  if (typeof contractFile === 'string') {
    const url = contractFile.trim();
    if (!url) return { url: '', fileName: 'contract.pdf' };
    const tail = url.split('/').pop() || 'contract.pdf';
    const fileName = tail.includes('?') ? tail.split('?')[0] : tail;
    return { url, fileName: fileName || 'contract.pdf' };
  }
  if (Array.isArray(contractFile)) {
    for (const item of contractFile) {
      const n = normalizeTaskContractFile(item);
      if (n.url) return n;
    }
    return { url: '', fileName: 'contract.pdf' };
  }
  if (typeof contractFile === 'object') {
    const url = String(
      contractFile.url ||
        contractFile.href ||
        contractFile.path ||
        contractFile.secure_url ||
        contractFile.publicUrl ||
        ''
    ).trim();
    let fileName = String(
      contractFile.fileName ||
        contractFile.filename ||
        contractFile.name ||
        contractFile.originalname ||
        contractFile.originalName ||
        ''
    ).trim();
    if (!fileName && url) {
      const tail = url.split('/').pop() || '';
      fileName = tail.includes('?') ? tail.split('?')[0] : tail;
    }
    if (!fileName) fileName = 'contract.pdf';
    return { url, fileName };
  }
  const s = String(contractFile).trim();
  return { url: s, fileName: s ? (s.split('/').pop() || 'contract.pdf').split('?')[0] : 'contract.pdf' };
}

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
        const { url, fileName } = normalizeTaskContractFile(task.contractFile);
        if (!url) return null;
        return {
          url,
          client: task.client || 'Невідомий клієнт',
          edrpou: task.edrpou || '',
          createdAt: task.createdAt,
          fileName: fileName || 'contract.pdf'
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
// CRM - Клієнти та продажі для менеджерів
// ============================================

function getClientWithAccessControl(client, user) {
  if (!client) return null;
  if (['admin', 'administrator', 'mgradm', 'regional', 'regkerivn'].includes(user?.role)) return client;
  const isOwner = user?.role === 'manager' && (
    client.assignedManagerLogin === user.login ||
    client.assignedManagerLogin2 === user.login
  );
  if (isOwner) return client;
  return {
    _id: client._id,
    name: client.name,
    assignedManagerLogin: client.assignedManagerLogin,
    limited: true,
    message: 'Клієнт закріплений за іншим менеджером'
  };
}

app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const conditions = [];
    if (req.user?.role === 'manager') {
      conditions.push({
        $or: [
          { assignedManagerLogin: req.user.login },
          { assignedManagerLogin2: req.user.login }
        ]
      });
    }
    const search = (req.query.q || req.query.search || '').trim();
    if (search) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(esc(search), 'i');
      conditions.push({
        $or: [
          { name: searchRegex },
          { edrpou: searchRegex },
          { contactPhone: searchRegex },
          { contactPerson: searchRegex },
          { 'contacts.person': searchRegex },
          { 'contacts.phone': searchRegex }
        ]
      });
    }
    const regionFilter = (req.query.region || '').trim();
    if (regionFilter) {
      conditions.push({ region: new RegExp(regionFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    }
    const managerFilter = (req.query.manager || req.query.assignedManagerLogin || '').trim();
    if (managerFilter && ['admin', 'administrator', 'mgradm'].includes(req.user?.role)) {
      conditions.push({
        $or: [
          { assignedManagerLogin: managerFilter },
          { assignedManagerLogin2: managerFilter }
        ]
      });
    }
    const query = conditions.length > 0 ? { $and: conditions } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;
    let clients, total;
    if (usePagination) {
      total = await Client.countDocuments(query);
      clients = await Client.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean();
    } else {
      clients = await Client.find(query).sort({ name: 1 }).lean();
      total = clients.length;
    }
    if (clients.length > 0) {
      const logins = [...new Set([
        ...clients.map(c => c.assignedManagerLogin).filter(Boolean),
        ...clients.map(c => c.assignedManagerLogin2).filter(Boolean)
      ])];
      const users = await User.find({ login: { $in: logins } }).select('login name').lean();
      const loginToName = Object.fromEntries(users.map(u => [u.login, u.name || u.login]));
      clients.forEach(c => {
        if (c.assignedManagerLogin) c.assignedManagerName = loginToName[c.assignedManagerLogin] || c.assignedManagerLogin;
        if (c.assignedManagerLogin2) c.assignedManagerName2 = loginToName[c.assignedManagerLogin2] || c.assignedManagerLogin2;
      });
    }
    if (usePagination) res.json({ clients, total, page, limit });
    else res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/filters', authenticateToken, async (req, res) => {
  try {
    let baseQuery = {};
    if (req.user?.role === 'manager') {
      baseQuery.$or = [
        { assignedManagerLogin: req.user.login },
        { assignedManagerLogin2: req.user.login }
      ];
    }
    const regions = await Client.distinct('region', baseQuery);
    const managers = ['admin', 'administrator', 'mgradm'].includes(req.user?.role)
      ? await User.find({ role: 'manager', dismissed: { $ne: true } }).select('login name').sort({ name: 1 }).lean()
      : [];
    res.json({
      regions: regions.filter(Boolean).sort(),
      managers: managers.map(m => ({ login: m.login, name: m.name || m.login }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const searchRe = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const clients = await Client.find({
      $or: [
        { name: searchRe },
        { edrpou: searchRe },
        { contactPhone: searchRe },
        { contactPerson: searchRe },
        { 'contacts.person': searchRe },
        { 'contacts.phone': searchRe }
      ]
    }).limit(20).lean();
    const results = clients.map(c => getClientWithAccessControl(c, req.user));
    const limitedLogins = [...new Set(results.filter(r => r?.limited && r.assignedManagerLogin).map(r => r.assignedManagerLogin))];
    if (limitedLogins.length > 0) {
      const users = await User.find({ login: { $in: limitedLogins } }).select('login name').lean();
      const loginToName = Object.fromEntries(users.map(u => [u.login, u.name || u.login]));
      results.forEach(r => {
        if (r?.limited && r.assignedManagerLogin) {
          r.assignedManagerName = loginToName[r.assignedManagerLogin] || r.assignedManagerLogin;
        }
      });
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Перевірка ЄДРПОУ: чи не належить вже іншому менеджеру
app.get('/api/clients/check-edrpou/:edrpou', authenticateToken, async (req, res) => {
  try {
    const edrpou = (req.params.edrpou || '').trim();
    const excludeClientId = req.query.excludeClientId;
    if (!edrpou) return res.json({ exists: false });
    const query = { edrpou: new RegExp(`^${edrpou.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    if (excludeClientId) query._id = { $ne: excludeClientId };
    const existing = await Client.findOne(query).lean();
    if (!existing) return res.json({ exists: false });
    const currentLogin = req.user?.login;
    if (existing.assignedManagerLogin === currentLogin || existing.assignedManagerLogin2 === currentLogin) {
      return res.json({ exists: true, sameManager: true });
    }
    const manager = await User.findOne({ login: existing.assignedManagerLogin }).select('name login').lean();
    res.json({
      exists: true,
      sameManager: false,
      assignedManagerLogin: existing.assignedManagerLogin,
      assignedManagerName: manager?.name || existing.assignedManagerLogin,
      clientName: existing.name
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
    let result = getClientWithAccessControl(client, req.user);
    if (result?.limited && result.assignedManagerLogin) {
      const manager = await User.findOne({ login: result.assignedManagerLogin }).select('name login').lean();
      if (manager) result.assignedManagerName = manager.name || manager.login;
    } else if (result && !result.limited) {
      const logins = [client.assignedManagerLogin, client.assignedManagerLogin2].filter(Boolean);
      if (logins.length > 0) {
        const users = await User.find({ login: { $in: logins } }).select('login name').lean();
        const loginToName = Object.fromEntries(users.map(u => [u.login, u.name || u.login]));
        result.assignedManagerName = client.assignedManagerLogin ? (loginToName[client.assignedManagerLogin] || client.assignedManagerLogin) : undefined;
        result.assignedManagerName2 = client.assignedManagerLogin2 ? (loginToName[client.assignedManagerLogin2] || client.assignedManagerLogin2) : undefined;
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const canAssignManager = (user) => ['admin', 'administrator', 'mgradm'].includes(user?.role);

function syncClientPrimaryContact(body) {
  if (body.contacts && Array.isArray(body.contacts) && body.contacts.length > 0) {
    body.contactPerson = body.contacts[0].person || '';
    body.contactPhone = body.contacts[0].phone || '';
  }
}

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const body = { ...req.body };
    syncClientPrimaryContact(body);
    body.createdByLogin = req.user?.login;
    body.createdByName = req.user?.name || req.user?.login;
    if (req.user?.role === 'manager') body.assignedManagerLogin = req.user.login;
    else if (!canAssignManager(req.user)) body.assignedManagerLogin = body.assignedManagerLogin || req.user?.login;
    if (!canAssignManager(req.user)) {
      delete body.assignedManagerLogin2;
      if (body.assignedManagerLogin && req.user?.role !== 'manager') body.assignedManagerLogin = req.user.login;
    }
    const client = await Client.create(body);
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await Client.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: 'Клієнта не знайдено' });
    const accessResult = getClientWithAccessControl(existing, req.user);
    const hasAccess = accessResult && !accessResult.limited;
    if (!hasAccess) return res.status(403).json({ error: 'Немає доступу до редагування клієнта' });
    const body = { ...req.body };
    syncClientPrimaryContact(body);
    if (!canAssignManager(req.user)) {
      delete body.assignedManagerLogin;
      delete body.assignedManagerLogin2;
    }
    const client = await Client.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/clients/:id/interactions', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
    const accessResult = getClientWithAccessControl(client, req.user);
    if (!accessResult || accessResult.limited) return res.status(403).json({ error: 'Немає доступу' });
    const interactions = await Interaction.find({
      entityType: 'client',
      entityId: req.params.id
    }).sort({ date: -1 }).lean();
    res.json(interactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients/:id/interactions', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
    const accessResult = getClientWithAccessControl(client, req.user);
    if (!accessResult || accessResult.limited) return res.status(403).json({ error: 'Немає доступу' });
    const { type, date, notes } = req.body || {};
    const doc = await Interaction.create({
      entityType: 'client',
      entityId: req.params.id,
      type: type || 'note',
      date: date ? new Date(date) : new Date(),
      userLogin: req.user?.login,
      userName: req.user?.name || req.user?.login,
      notes: notes || ''
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Прев’ю номера угоди — окремий шлях ПЕРЕД /api/sales/:id, щоб «preview-deal-number» не потрапляв у findById як ObjectId. */
app.get('/api/sales/preview-deal-number', authenticateToken, async (req, res) => {
  try {
    res.json({ saleNumber: await peekSaleNuPreviewNumber() });
  } catch (err) {
    console.error('[GET /api/sales/preview-deal-number]', err);
    res.json({ saleNumber: 'NU-00001' });
  }
});

app.get('/api/sales', authenticateToken, async (req, res) => {
  try {
    let salesSort = { saleDate: -1 };
    const { clientId, managerLogin, forClientCheck, status, dateFrom, dateTo, region: regionQuery, premiumQueue } = req.query;
    const canPickSaleRegion = ['admin', 'administrator', 'mgradm'].includes(req.user?.role);
    const dbUser = await User.findOne({ login: req.user.login }).select('region').lean();
    let regionFilter = '';
    if (canPickSaleRegion) {
      regionFilter = (regionQuery || '').trim();
    } else {
      regionFilter = (dbUser?.region || '').trim();
    }
    const conditions = [];
    if (req.user?.role === 'manager' && forClientCheck !== 'true') {
      conditions.push({
        $or: [
          { managerLogin: req.user.login },
          { managerLogin2: req.user.login }
        ]
      });
    }
    if (managerLogin && ['admin', 'administrator', 'mgradm'].includes(req.user?.role)) {
      conditions.push({
        $or: [
          { managerLogin },
          { managerLogin2: managerLogin }
        ]
      });
    } else if (managerLogin && conditions.length === 0) {
      conditions.push({ managerLogin });
    }
    if (clientId) conditions.push({ clientId });
    const pq = String(premiumQueue || '').trim().toLowerCase();
    if (pq === 'pending' || pq === 'archived') {
      if (!canApproveSalePremium(req.user)) {
        return res.status(403).json({ error: 'Немає доступу до черги премій' });
      }
      if (pq === 'pending') {
        conditions.push({ status: 'success' });
        conditions.push({ $or: [{ premiumAccruedAt: null }, { premiumAccruedAt: { $exists: false } }] });
      } else {
        conditions.push({ premiumAccruedAt: { $ne: null } });
        salesSort = { premiumAccruedAt: -1 };
      }
    } else if (status) {
      conditions.push({ status });
    }
    if (dateFrom || dateTo) {
      const dateRange = {};
      if (dateFrom) dateRange.$gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        dateRange.$lte = d;
      }
      conditions.push({ saleDate: dateRange });
    }
    if (regionFilter && regionFilter !== 'Україна' && !regionFilter.includes('Загальний')) {
      const esc = regionFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const clientIds = await Client.find({ region: new RegExp(esc, 'i') }).distinct('_id');
      conditions.push({ clientId: { $in: clientIds } });
    }
    const query = conditions.length > 0 ? { $and: conditions } : {};
    const sales = await Sale.find(query)
      .populate('clientId', 'name edrpou contactPhone')
      .populate('equipmentId', 'type serialNumber')
      .sort(salesSort)
      .lean();
    if (sales.length > 0) {
      const logins = [...new Set([
        ...sales.map(s => s.managerLogin).filter(Boolean),
        ...sales.map(s => s.managerLogin2).filter(Boolean),
        ...sales.map(s => s.tenderEmployeeLogin).filter(Boolean)
      ])];
      const users = await User.find({ login: { $in: logins } }).select('login name').lean();
      const loginToName = Object.fromEntries(users.map(u => [u.login, u.name || u.login]));
      sales.forEach(s => {
        if (s.managerLogin) s.managerName = loginToName[s.managerLogin] || s.managerLogin;
        if (s.managerLogin2) s.managerName2 = loginToName[s.managerLogin2] || s.managerLogin2;
        if (s.tenderEmployeeLogin) s.tenderEmployeeName = loginToName[s.tenderEmployeeLogin] || s.tenderEmployeeLogin;
      });
    }
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/:id', authenticateToken, async (req, res) => {
  try {
    if (req.params.id === 'preview-deal-number') {
      try {
        return res.json({ saleNumber: await peekSaleNuPreviewNumber() });
      } catch (err) {
        console.error('[GET /api/sales/:id як preview-deal-number]', err);
        return res.json({ saleNumber: 'NU-00001' });
      }
    }
    const sale = await Sale.findById(req.params.id)
      .populate('clientId')
      .populate('equipmentId')
      .populate('equipmentItems.equipmentId');
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function markEquipmentAsSold(sale) {
  const ids = [];
  if (sale.equipmentItems && sale.equipmentItems.length > 0) {
    ids.push(...sale.equipmentItems.map(i => i.equipmentId).filter(Boolean));
  } else if (sale.equipmentId) {
    ids.push(sale.equipmentId);
  }
  for (const eqId of ids) {
    await Equipment.findByIdAndUpdate(eqId, {
      status: 'sold',
      saleId: sale._id,
      soldDate: sale.saleDate,
      soldToClientId: sale.clientId,
      saleAmount: sale.totalAmount,
      warrantyUntil: sale.warrantyUntil,
      warrantyMonths: sale.warrantyMonths
    });
  }
}

const canAssignSaleManager = (user) => ['admin', 'administrator', 'mgradm'].includes(user?.role);

function canApproveSalePremium(user) {
  const r = String(user?.role || '').toLowerCase();
  return ['admin', 'administrator', 'mgradm', 'accountant', 'buhgalteria'].includes(r);
}

function computeSuggestedManagerPremiumFromSale(sale, bonusPct) {
  const pct = typeof bonusPct === 'number' && !Number.isNaN(bonusPct) ? bonusPct : 0;
  let mainAmount = parseFloat(sale.mainProductAmount) || 0;
  if (sale.equipmentItems && sale.equipmentItems.length > 0) {
    mainAmount = sale.equipmentItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  }
  const addSum = (sale.additionalCosts || []).reduce(
    (s, c) => s + (parseFloat(c.amount) || 0) * (parseInt(c.quantity, 10) || 1),
    0
  );
  const transport = parseFloat(sale.transportCosts) || 0;
  const pnr = parseFloat(sale.pnrCosts) || 0;
  const representative = parseFloat(sale.representativeCosts) || 0;
  const totalWithAllExpenses = mainAmount - transport - pnr - representative - addSum;
  return roundCoefficientValue((pct / 100) * totalWithAllExpenses);
}

async function getSalesBonusPercentFromDb() {
  const doc = await GlobalCalculationCoefficients.findOne();
  if (!doc) return 0;
  const rows = buildCoefficientRowsForScope('sales', doc.salesRows || []);
  const row = rows.find((r) => r.id === 'sales_bonus');
  return row ? roundCoefficientValue(row.value) : 0;
}

async function getNextShipmentRequestNumber() {
  const c = await Counter.findOneAndUpdate(
    { _id: 'shipmentRequestSv' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const n = c.seq || 1;
  return `SV-${String(n).padStart(5, '0')}`;
}

async function peekShipmentRequestPreviewNumber() {
  const c = await Counter.findById('shipmentRequestSv').lean();
  const n = (c?.seq || 0) + 1;
  return `SV-${String(n).padStart(5, '0')}`;
}

function canAccessInventoryShipmentRequests(user) {
  const r = String(user?.role || '').toLowerCase();
  return ['warehouse', 'zavsklad', 'admin', 'administrator', 'mgradm'].includes(r);
}

async function notifyWarehouseUsersForShipmentRequest(sr) {
  const rows = await User.find({
    dismissed: { $ne: true },
    role: { $in: ['warehouse', 'zavsklad'] }
  })
    .select('login')
    .lean();
  const planned = sr.plannedShipmentDate
    ? new Date(sr.plannedShipmentDate).toLocaleDateString('uk-UA')
    : '—';
  const created = sr.createdAt ? new Date(sr.createdAt).toLocaleString('uk-UA') : '—';
  const body = [
    `Запланована дата відвантаження: ${planned}`,
    `Адреса відвантаження: ${sr.shipmentAddress || '—'}`,
    `Перевізник: ${sr.carrier || '—'}`,
    `Телефон водія: ${sr.driverPhone || '—'}`,
    `Тип/модель ТЗ: ${sr.vehicleType || '—'}`,
    `Номер заявки: ${sr.requestNumber}`,
    `Менеджер: ${sr.managerName || sr.managerLogin || '—'}`,
    `Дата та час заявки: ${created}`
  ].join('\n');
  for (const u of rows) {
    const login = u.login && String(u.login).trim();
    if (!login) continue;
    await createManagerNotificationDeduped({
      recipientLogin: login,
      kind: 'shipment_request_new',
      title: 'У вас є запит на відвантаження',
      body,
      requestNumber: sr.requestNumber,
      shipmentRequestId: sr._id,
      read: false,
      dedupeKey: `shipment_req:${String(sr._id)}:${login}`
    });
  }
}

app.post('/api/sales', authenticateToken, async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.saleNumber;
    if (!canAssignSaleManager(req.user)) {
      delete body.premiumAccruedAt;
      delete body.premiumAccruedByLogin;
      delete body.premiumAccrualPeriod;
    }
    if (req.user?.role === 'manager') {
      body.managerLogin = req.user.login;
      delete body.managerLogin2;
    } else if (!canAssignSaleManager(req.user)) {
      delete body.managerLogin2;
    }
    body.saleNumber = await getNextSaleNuNumber();
    const sale = await Sale.create(body);
    if (sale.status === 'confirmed' || sale.status === 'success') {
      await markEquipmentAsSold(sale);
    }
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/sales/:id', authenticateToken, async (req, res) => {
  try {
    const existing = await Sale.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: 'Продаж не знайдено' });
    if (req.user?.role === 'manager') {
      const isOwner = existing.managerLogin === req.user.login || existing.managerLogin2 === req.user.login;
      if (!isOwner) return res.status(403).json({ error: 'Немає доступу до редагування цього продажу' });
    } else if (!canAssignSaleManager(req.user)) {
      return res.status(403).json({ error: 'Немає доступу до редагування цього продажу' });
    }
    const body = { ...req.body };
    delete body.saleNumber;
    if (!existing.saleNumber) {
      body.saleNumber = await getNextSaleNuNumber();
    }
    if (!canAssignSaleManager(req.user)) {
      delete body.premiumAccruedAt;
      delete body.premiumAccruedByLogin;
      delete body.premiumAccrualPeriod;
    }
    if (req.user?.role === 'manager' && existing.premiumAccruedAt) {
      delete body.managerPremium;
      delete body.premiumAccruedAt;
      delete body.premiumAccruedByLogin;
      delete body.premiumAccrualPeriod;
      if (body.status && body.status !== 'confirmed') {
        delete body.status;
      }
    }
    if (!canAssignSaleManager(req.user)) {
      delete body.managerLogin;
      delete body.managerLogin2;
    }
    if (body.equipmentItems && Array.isArray(body.equipmentItems)) {
      const oldItems = existing.equipmentItems || [];
      const adminSale = canAssignSaleManager(req.user);
      if (!adminSale) {
        const lockedOld = oldItems.filter((o) => o.shipmentLocked);
        for (const o of lockedOld) {
          const found = body.equipmentItems.some((x) => {
            if (o.lineId && x.lineId === o.lineId) return true;
            if (!o.lineId && o.equipmentId && x.equipmentId && String(x.equipmentId) === String(o.equipmentId)) {
              return true;
            }
            return false;
          });
          if (!found) {
            return res.status(400).json({
              error:
                'Неможливо видалити позицію, подану на відвантаження. Зверніться до адміністратора.'
            });
          }
        }
        body.equipmentItems = body.equipmentItems.map((ni) => {
          const o = lockedOld.find((lo) => {
            if (lo.lineId && ni.lineId === lo.lineId) return true;
            if (
              !lo.lineId &&
              lo.equipmentId &&
              ni.equipmentId &&
              String(ni.equipmentId) === String(lo.equipmentId)
            ) {
              return true;
            }
            return false;
          });
          if (!o) return ni;
          return {
            ...ni,
            equipmentId: o.equipmentId,
            type: o.type,
            serialNumber: o.serialNumber,
            amount: o.amount,
            lineId: o.lineId || ni.lineId,
            shipmentLocked: true,
            shipmentRequestId: o.shipmentRequestId
          };
        });
      }
    }
    let mainAmount = parseFloat(body.mainProductAmount) || 0;
    if (body.equipmentItems && body.equipmentItems.length > 0) {
      mainAmount = body.equipmentItems.reduce((s, i) => s + (i.amount || 0), 0);
      body.mainProductAmount = mainAmount;
    }
    const addSum = (body.additionalCosts || []).reduce((s, c) => s + (c.amount || 0) * (c.quantity || 1), 0);
    body.totalAmount = mainAmount + addSum;
    if (body.saleDate && body.warrantyMonths) {
      const d = new Date(body.saleDate);
      d.setMonth(d.getMonth() + parseInt(body.warrantyMonths) || 12);
      body.warrantyUntil = d;
    }
    const prevStatus = existing.status;
    const newStatus = body.status;
    if (newStatus && newStatus !== prevStatus) {
      body.statusHistory = [...(existing.statusHistory || []), {
        from: prevStatus,
        to: newStatus,
        date: new Date(),
        userLogin: req.user?.login || ''
      }];
    }
    const sale = await Sale.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    if (sale.status === 'confirmed' || sale.status === 'success') {
      await markEquipmentAsSold(sale);
    }
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Затвердження премії по угоді (Відділ продаж — бухгалтерія): success → confirmed
app.post('/api/sales/:id/approve-premium', authenticateToken, async (req, res) => {
  try {
    if (!canApproveSalePremium(req.user)) {
      return res.status(403).json({ error: 'Немає прав на затвердження премії' });
    }
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    if (sale.status !== 'success') {
      return res.status(400).json({ error: 'Затверджувати можна лише угоди зі статусом «Успішно реалізовано»' });
    }
    if (sale.premiumAccruedAt) {
      return res.status(400).json({ error: 'Премію вже затверджено' });
    }
    const bonusPct = await getSalesBonusPercentFromDb();
    const suggested = computeSuggestedManagerPremiumFromSale(sale.toObject(), bonusPct);
    let managerPremium;
    if (req.body && req.body.managerPremium != null && req.body.managerPremium !== '') {
      managerPremium = roundCoefficientValue(parseFloat(req.body.managerPremium));
    } else {
      const existingPrem = parseFloat(sale.managerPremium) || 0;
      managerPremium = suggested > 0 ? suggested : existingPrem;
    }
    if (Number.isNaN(managerPremium) || managerPremium < 0) managerPremium = 0;

    let premiumAccrualPeriod = (req.body && req.body.premiumAccrualPeriod && String(req.body.premiumAccrualPeriod).trim()) || '';
    if (!premiumAccrualPeriod || !/^\d{2}-\d{4}$/.test(premiumAccrualPeriod)) {
      const d = new Date();
      premiumAccrualPeriod = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }

    sale.managerPremium = managerPremium;
    sale.premiumAccruedAt = new Date();
    sale.premiumAccruedByLogin = req.user?.login || '';
    sale.premiumAccrualPeriod = premiumAccrualPeriod;
    const prevStatus = sale.status;
    sale.status = 'confirmed';
    sale.statusHistory = [...(sale.statusHistory || []), {
      from: prevStatus,
      to: 'confirmed',
      date: new Date(),
      userLogin: req.user?.login || ''
    }];
    await sale.save();
    await markEquipmentAsSold(sale);
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/sales/:id', authenticateToken, async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    if (sale.status !== 'draft') return res.status(400).json({ error: 'Можна видалити тільки чернетку' });
    await Sale.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Скасування продажу — тільки адміністратор / mgradm
app.post('/api/sales/:id/cancel', authenticateToken, async (req, res) => {
  try {
    if (!canAssignSaleManager(req.user)) {
      return res.status(403).json({ error: 'Скасувати продаж може тільки адміністратор' });
    }
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    const canCancel = ['confirmed', 'success'].includes(sale.status);
    if (!canCancel) return res.status(400).json({ error: 'Можна скасувати тільки підтверджений або успішно реалізований продаж' });
    const ids = [];
    if (sale.equipmentItems && sale.equipmentItems.length > 0) {
      ids.push(...sale.equipmentItems.map(i => i.equipmentId).filter(Boolean));
    } else if (sale.equipmentId) {
      ids.push(sale.equipmentId);
    }
    for (const eqId of ids) {
      await Equipment.findByIdAndUpdate(eqId, {
        $unset: { saleId: 1, soldDate: 1, soldToClientId: 1, saleAmount: 1, warrantyUntil: 1, warrantyMonths: 1 },
        status: 'in_stock'
      });
    }
    sale.status = 'cancelled';
    await sale.save();
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Запити на відвантаження з угоди (менеджер → складський облік) ———
app.get('/api/shipment-requests/preview-number', authenticateToken, async (req, res) => {
  try {
    const previewNumber = await peekShipmentRequestPreviewNumber();
    res.json({ previewNumber });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/shipment-requests', authenticateToken, async (req, res) => {
  try {
    if (!canAccessInventoryShipmentRequests(req.user)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }
    const status = req.query.status || 'pending';
    let list = await ShipmentRequest.find({ status }).sort({ createdAt: -1 }).limit(200).lean();

    if (
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const u = await User.findOne({ login: req.user.login }).select('region').lean();
      const allowed = await loadActiveWarehouseIdsForUserRegion(u?.region);
      if (!allowed.size) {
        list = [];
      } else {
        const allEq = [];
        for (const sr of list) {
          for (const eid of sr.equipmentIds || []) allEq.push(String(eid));
        }
        const whMap = await loadEquipmentWarehouseMapForIds(allEq);
        list = list.filter((sr) => shipmentRequestTouchesRegionalWarehouses(sr, allowed, whMap));
      }
    }

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/shipment-requests/:id', authenticateToken, async (req, res) => {
  try {
    const sr = await ShipmentRequest.findById(req.params.id).lean();
    if (!sr) return res.status(404).json({ error: 'Заявку не знайдено' });
    const sale = await Sale.findById(sr.saleId).populate('clientId', 'name edrpou').lean();
    const whCan = canAccessInventoryShipmentRequests(req.user);
    const isMgr =
      req.user?.role === 'manager' &&
      sale &&
      (sale.managerLogin === req.user.login || sale.managerLogin2 === req.user.login);
    if (!whCan && !isMgr && !canAssignSaleManager(req.user)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }

    if (
      whCan &&
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const whUserSr = await User.findOne({ login: req.user.login }).select('region').lean();
      const allowedSr = await loadActiveWarehouseIdsForUserRegion(whUserSr?.region);
      const whMapSr = await loadEquipmentWarehouseMapForIds(sr.equipmentIds || []);
      if (!allowedSr.size || !shipmentRequestTouchesRegionalWarehouses(sr, allowedSr, whMapSr)) {
        return res.status(403).json({
          error: 'Ця заявка не стосується обладнання на складах вашого регіону.'
        });
      }
    }

    const equipment = await Equipment.find({ _id: { $in: sr.equipmentIds || [] } }).lean();
    let ttnFile = null;
    if (sr.ttnFileId) {
      ttnFile = await File.findById(sr.ttnFileId).lean();
    }
    res.json({ ...sr, equipment, ttnFile, sale });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/shipment-requests/:id/status', authenticateToken, async (req, res) => {
  try {
    if (!canAccessInventoryShipmentRequests(req.user)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }
    const { status } = req.body || {};
    if (!['fulfilled', 'cancelled', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Некоректний статус' });
    }
    const srPrev = await ShipmentRequest.findById(req.params.id).lean();
    if (!srPrev) return res.status(404).json({ error: 'Заявку не знайдено' });

    const whUser = await User.findOne({ login: req.user.login }).select('name region').lean();
    const whName = whUser?.name || req.user.login;

    if (status === 'fulfilled' && srPrev.status !== 'fulfilled') {
      if (
        isRegionalWarehouseStaffRole(req.user.role) &&
        !bypassesRegionalWarehouseInventoryLock(req.user.role)
      ) {
        const allowedFul = await loadActiveWarehouseIdsForUserRegion(whUser?.region);
        const whMapFul = await loadEquipmentWarehouseMapForIds(srPrev.equipmentIds || []);
        if (
          !allowedFul.size ||
          !shipmentRequestAllEquipmentInRegionalWarehouses(srPrev, allowedFul, whMapFul)
        ) {
          return res.status(403).json({
            error:
              'Підтвердити «Виконано» можна лише якщо все обладнання заявки на складах вашого регіону. Заявки з кількох регіонів оформлює адміністратор.'
          });
        }
      }
    }

    if (status === 'cancelled' && srPrev.status !== 'cancelled') {
      for (const eid of srPrev.equipmentIds || []) {
        const eq = await Equipment.findById(eid);
        if (
          !eq ||
          eq.status !== 'pending_shipment' ||
          String(eq.pendingShipmentRequestId || '') !== String(srPrev._id)
        ) {
          continue;
        }
        const okSr = await ensureWarehouseStaffEquipmentAccess(
          res,
          req.user,
          whUser,
          eq,
          'Скасувати заявку на відвантаження можна лише для товару на складі вашого регіону.'
        );
        if (!okSr) return;
        const restored = eq.statusBeforePendingShipment || 'in_stock';
        await logInventoryMovement({
          eventType: 'shipment_request_cancelled',
          performedByLogin: req.user.login,
          performedByName: whName,
          equipmentId: eq._id,
          equipmentType: eq.type,
          serialNumber: eq.serialNumber,
          quantity: eq.quantity || 1,
          fromStatus: 'pending_shipment',
          toStatus: restored,
          shipmentRequestNumber: srPrev.requestNumber,
          shipmentRequestId: srPrev._id,
          saleId: srPrev.saleId,
          notes: `Скасовано заявку ${srPrev.requestNumber}`
        });
        eq.status = restored;
        eq.pendingShipmentRequestId = undefined;
        eq.statusBeforePendingShipment = undefined;
        eq.lastModified = new Date();
        await eq.save();
      }
      const saleDoc = await Sale.findById(srPrev.saleId);
      if (saleDoc?.equipmentItems?.length) {
        for (const item of saleDoc.equipmentItems) {
          if (item.shipmentRequestId && String(item.shipmentRequestId) === String(srPrev._id)) {
            item.shipmentLocked = false;
            item.shipmentRequestId = undefined;
          }
        }
        await saleDoc.save();
      }
    }

    const sr = await ShipmentRequest.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).lean();
    if (!sr) return res.status(404).json({ error: 'Заявку не знайдено' });
    res.json(sr);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/inventory-movement-log', authenticateToken, async (req, res) => {
  try {
    if (!canAccessInventoryShipmentRequests(req.user)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 150, 1), 500);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const [rows, total] = await Promise.all([
      InventoryMovementLog.find({})
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InventoryMovementLog.countDocuments({})
    ]);
    const journalReadOnly =
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role);
    res.json({ rows, total, skip, limit, journalReadOnly });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post(
  '/api/sales/:saleId/shipment-request',
  authenticateToken,
  uploadShipmentTtn.single('ttn'),
  async (req, res) => {
    try {
      const sale = await Sale.findById(req.params.saleId).populate('clientId', 'name edrpou').lean();
      if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
      const isOwner =
        req.user?.role === 'manager' &&
        (sale.managerLogin === req.user.login || sale.managerLogin2 === req.user.login);
      const isAdm = canAssignSaleManager(req.user);
      if (!isOwner && !isAdm) {
        return res.status(403).json({ error: 'Немає доступу' });
      }

      let payload;
      try {
        payload =
          typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body.payload || {};
      } catch {
        return res.status(400).json({ error: 'Некоректний payload' });
      }
      const { lineIds, plannedShipmentDate, shipmentAddress, carrier, driverPhone, vehicleType } = payload;
      if (
        !plannedShipmentDate ||
        !String(shipmentAddress || '').trim() ||
        !String(carrier || '').trim() ||
        !String(driverPhone || '').trim()
      ) {
        return res.status(400).json({
          error:
            "Обов'язково: запланована дата відвантаження, адреса відвантаження, перевізник, контактний номер водія"
        });
      }
      const lineIdArr = Array.isArray(lineIds) ? lineIds.map((x) => String(x).trim()).filter(Boolean) : [];
      if (lineIdArr.length === 0) {
        return res.status(400).json({ error: 'Оберіть хоча б одну позицію обладнання' });
      }

      const equipmentItems = sale.equipmentItems || [];
      const selectedEqIds = [];
      const matchedLines = new Set();

      for (const lid of lineIdArr) {
        let row = equipmentItems.find((i) => i.lineId && i.lineId === lid);
        if (!row) {
          row = equipmentItems.find((i) => i.equipmentId && String(i.equipmentId) === lid);
        }
        if (!row || !row.equipmentId) {
          return res.status(400).json({ error: `Позицію «${lid}» не знайдено в угоді` });
        }
        if (row.shipmentLocked) {
          return res.status(400).json({ error: 'Одна з обраних позицій вже подана на відвантаження' });
        }
        const key = row.lineId || String(row.equipmentId);
        if (matchedLines.has(key)) continue;
        matchedLines.add(key);
        selectedEqIds.push(row.equipmentId);
      }

      const uniqEq = [...new Set(selectedEqIds.map((id) => String(id)))];
      const eqDocsFull = await Equipment.find({ _id: { $in: uniqEq } });
      if (eqDocsFull.length !== uniqEq.length) {
        return res.status(400).json({ error: 'Частину обладнання не знайдено в базі' });
      }
      for (const e of eqDocsFull) {
        if (!['in_stock', 'reserved'].includes(e.status)) {
          return res.status(400).json({
            error: `Позиція «${e.type || '—'}» недоступна для заявки (потрібен статус на складі; зараз: ${e.status || '—'})`
          });
        }
      }
      const whIds = [...new Set(eqDocsFull.map((e) => e.currentWarehouse).filter(Boolean))];
      const whs = whIds.length
        ? await Warehouse.find({ _id: { $in: whIds } }).select('region').lean()
        : [];
      const warehouseRegions = [...new Set(whs.map((w) => w.region).filter(Boolean))];

      const requestNumber = await getNextShipmentRequestNumber();
      const u = await User.findOne({ login: req.user.login }).select('name').lean();

      const doc = await ShipmentRequest.create({
        requestNumber,
        saleId: sale._id,
        clientName: sale.clientId?.name || '',
        managerLogin: sale.managerLogin,
        managerName: u?.name || req.user.login,
        plannedShipmentDate: new Date(plannedShipmentDate),
        shipmentAddress: String(shipmentAddress).trim(),
        carrier: String(carrier).trim(),
        driverPhone: String(driverPhone).trim(),
        vehicleType: String(vehicleType || '').trim(),
        lineIds: [...matchedLines],
        equipmentIds: uniqEq.map((id) => new mongoose.Types.ObjectId(id)),
        warehouseRegions,
        status: 'pending'
      });

      if (req.file) {
        const fileUrl = req.file.path || req.file.secure_url || '';
        let correctedName = req.file.originalname || '';
        try {
          const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
          if (decoded && decoded !== correctedName) correctedName = decoded;
        } catch (_) {}
        const fileRecord = await File.create({
          entityType: 'shipment_request',
          entityId: doc._id,
          originalName: correctedName,
          filename: req.file.public_id || '',
          cloudinaryId: req.file.public_id || '',
          cloudinaryUrl: fileUrl,
          mimetype: req.file.mimetype,
          size: req.file.size,
          description: 'ТТН'
        });
        doc.ttnFileId = fileRecord._id;
        await doc.save();
      }

      const saleDoc = await Sale.findById(sale._id);
      if (saleDoc && saleDoc.equipmentItems) {
        for (const item of saleDoc.equipmentItems) {
          const hit =
            (item.lineId && matchedLines.has(item.lineId)) ||
            (item.equipmentId && matchedLines.has(String(item.equipmentId)));
          if (hit) {
            item.shipmentLocked = true;
            item.shipmentRequestId = doc._id;
          }
        }
        await saleDoc.save();
      }

      const clientName = sale.clientId?.name || '';
      const clientEdrpou = sale.clientId?.edrpou || '';
      const mgrUser = await User.findOne({ login: sale.managerLogin }).select('name').lean();
      const mgrName = mgrUser?.name || sale.managerLogin || '';
      const submitterName = u?.name || req.user.login;
      for (const eq of eqDocsFull) {
        const prev = eq.status;
        eq.statusBeforePendingShipment = prev;
        eq.pendingShipmentRequestId = doc._id;
        eq.status = 'pending_shipment';
        eq.lastModified = new Date();
        await eq.save();
        await logInventoryMovement({
          eventType: 'shipment_request_submitted',
          performedByLogin: req.user.login,
          performedByName: submitterName,
          equipmentId: eq._id,
          equipmentType: eq.type,
          serialNumber: eq.serialNumber,
          quantity: eq.quantity || 1,
          fromStatus: prev,
          toStatus: 'pending_shipment',
          managerLogin: sale.managerLogin,
          managerName: mgrName,
          clientName,
          clientEdrpou,
          shipmentAddress: doc.shipmentAddress,
          sourceWarehouseName: eq.currentWarehouseName,
          shipmentRequestNumber: requestNumber,
          shipmentRequestId: doc._id,
          saleNumber: sale.saleNumber,
          saleId: sale._id,
          notes: `Заявка ${requestNumber}`
        });
      }

      const fresh = await ShipmentRequest.findById(doc._id).lean();
      await notifyWarehouseUsersForShipmentRequest(fresh);
      res.json(fresh);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

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
          invoiceRequesterName: { $ifNull: ['$invoiceRequest.requesterName', null] },
          // Явно додаємо invoiceRequestDate з Task (воно зберігається в Task, а не в InvoiceRequest)
          // Якщо invoiceRequestDate відсутнє, але є InvoiceRequest - використовуємо createdAt з InvoiceRequest
          invoiceRequestDate: {
            $cond: {
              if: { $ne: ['$invoiceRequestDate', null] },
              then: '$invoiceRequestDate',
              else: {
                $cond: {
                  if: { $ne: ['$invoiceRequest', null] },
                  then: '$invoiceRequest.createdAt',
                  else: null
                }
              }
            }
          },
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
    const { status, statuses, region, sort = '-requestDate', page, limit, filter, sortField, sortDirection, columnFilters } = req.query;
    const isPaginated = page !== undefined && limit !== undefined && !isNaN(parseInt(limit));
    // Універсальний пошук — всі текстопошукові поля Task (відповідно до колонок таблиці)
    const UNIVERSAL_SEARCH_FIELDS = [
      'requestNumber', 'client', 'address', 'requestDesc', 'equipment', 'equipmentSerial', 'work',
      'contactPerson', 'contactPhone', 'edrpou', 'company', 'serviceRegion', 'status',
      'engineModel', 'engineSerial', 'customerEquipmentNumber',
      'engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6',
      'invoice', 'invoiceRecipientDetails', 'paymentType',
      'filterName', 'oilFilterName', 'fuelFilterName', 'airFilterName',
      'antifreezeType', 'otherMaterials', 'carNumber',
      'warehouseComment', 'accountantComment', 'accountantComments', 'regionalManagerComment',
      'comments', 'blockDetail', 'debtStatus', 'debtStatusCheckbox',
      'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager',
      'needInvoice', 'needAct', 'reportMonthYear',
      'invoiceRequesterName'
    ];
    // Парсинг дати з фільтра: підтримка YYYY-MM-DD (input type="date") та DD.MM.YYYY
    const parseFilterDate = (val, endOfDay = false) => {
      if (!val || typeof val !== 'string') return null;
      const s = val.trim();
      let year, month, day;
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
      const dmyMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); // DD.MM.YYYY
      if (isoMatch) {
        [, year, month, day] = isoMatch.map(Number);
      } else if (dmyMatch) {
        [, day, month, year] = dmyMatch.map(Number);
      } else {
        const d = new Date(s);
        if (isNaN(d.getTime())) return null;
        const result = endOfDay ? new Date(d.setHours(23, 59, 59, 999)) : d;
        const y = result.getFullYear(), m = String(result.getMonth() + 1).padStart(2, '0'), dayStr = String(result.getDate()).padStart(2, '0');
        return { date: result, isoFrom: `${y}-${m}-${dayStr}`, isoTo: `${y}-${m}-${dayStr}T23:59:59.999` };
      }
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const date = new Date(year, month - 1, day);
      const result = endOfDay ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999) : date;
      const y = result.getFullYear(), m = String(result.getMonth() + 1).padStart(2, '0'), d = String(result.getDate()).padStart(2, '0');
      return { date: result, isoFrom: `${y}-${m}-${d}`, isoTo: `${y}-${m}-${d}T23:59:59.999` };
    };
    // Збірка $match для дати: підтримка і Date, і string (ISO) у MongoDB
    const buildDateMatch = (field, fromObj, toObj) => {
      const conditions = [];
      if (fromObj) {
        conditions.push({ $or: [{ [field]: { $gte: fromObj.date } }, { [field]: { $gte: fromObj.isoFrom } }] });
      }
      if (toObj) {
        conditions.push({ $or: [{ [field]: { $lte: toObj.date } }, { [field]: { $lte: toObj.isoTo } }] });
      }
      return conditions.length === 1 ? conditions[0] : { $and: conditions };
    };
    // Фільтри «Сервісний інженер №1…№6»: значення може бути в будь-якому з полів — кожен непорожній фільтр дає OR по всіх слотах, між фільтрами — AND
    const ENGINEER_COLUMN_KEYS = ['engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'];
    const pushEngineerColumnFilterConditions = (engineerPatterns, matchConditions) => {
      for (const val of engineerPatterns) {
        if (!val) continue;
        const rx = { $regex: String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        matchConditions.push({ $or: ENGINEER_COLUMN_KEYS.map((f) => ({ [f]: rx })) });
      }
    };
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const showAllInvoices = req.query.showAllInvoices === 'true';

    // ОПТИМІЗАЦІЯ: accountantInvoiceRequests — починаємо з InvoiceRequest (192 записів), не з Task (тисячі)
    if (status === 'accountantInvoiceRequests' && !statuses) {
      const irMatch = showAllInvoices ? {} : { status: { $in: ['pending', 'processing'] } };
      const taskLookupPipeline = [
        { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$irTaskId'] } } }
      ];
      if (region && region !== 'Україна' && !region.includes('Загальний')) {
        taskLookupPipeline.push({
          $match: region.includes(',')
            ? { serviceRegion: { $in: region.split(',').map(r => r.trim()) } }
            : { serviceRegion: region }
        });
      }
      if (showAllInvoices) {
        taskLookupPipeline.push({ $match: { status: { $in: ['Заявка', 'В роботі', 'Виконано'] } } });
      }
      const irPipeline = [
        { $match: irMatch },
        {
          $lookup: {
            from: 'tasks',
            let: { irTaskId: '$taskId' },
            pipeline: taskLookupPipeline,
            as: 'task'
          }
        },
        { $unwind: { path: '$task', preserveNullAndEmptyArrays: false } },
        { $addFields: {
          'task.invoiceFile': '$invoiceFile',
          'task.invoiceFileName': '$invoiceFileName',
          'task.invoice': '$invoiceNumber',
          'task.actFile': '$actFile',
          'task.actFileName': '$actFileName',
          'task.needInvoice': '$needInvoice',
          'task.needAct': '$needAct',
          'task.invoiceStatus': '$status',
          'task.invoiceRequestId': { $toString: '$_id' },
          'task.invoiceRequesterName': '$requesterName',
          'task.invoiceRequestDate': { $ifNull: ['$task.invoiceRequestDate', '$createdAt'] }
        }},
        { $replaceRoot: { newRoot: '$task' } },
        { $addFields: { id: { $toString: '$_id' } } }
      ];

      if (isPaginated) {
        // Глобальний пошук filter — по всіх полях
        if (filter && typeof filter === 'string' && filter.trim()) {
          const searchStr = filter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = { $regex: searchStr, $options: 'i' };
          irPipeline.push({
            $match: {
              $or: UNIVERSAL_SEARCH_FIELDS.map(f => ({ [f]: regex }))
            }
          });
        }
        // Фільтри по колонках
        if (columnFilters && typeof columnFilters === 'string') {
          try {
            const filters = JSON.parse(columnFilters);
            const colMatch = {};
            const dateFiltersByField = {};
            const engineerPatterns = [];
            for (const [key, value] of Object.entries(filters)) {
              if (!value || String(value).trim() === '') continue;
              const val = String(value).trim();
              if (key.endsWith('From')) {
                const field = key.replace('From', '');
                const parsed = parseFilterDate(val);
                if (parsed) {
                  dateFiltersByField[field] = dateFiltersByField[field] || {};
                  dateFiltersByField[field].from = parsed;
                }
              } else if (key.endsWith('To')) {
                const field = key.replace('To', '');
                const parsed = parseFilterDate(val, true);
                if (parsed) {
                  dateFiltersByField[field] = dateFiltersByField[field] || {};
                  dateFiltersByField[field].to = parsed;
                }
              } else {
                if (ENGINEER_COLUMN_KEYS.includes(key)) {
                  engineerPatterns.push(val);
                  continue;
                }
                const filterType = ['status', 'company', 'paymentType', 'serviceRegion', 'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager'].includes(key) ? 'select' : 'text';
                if (filterType === 'select') colMatch[key] = val;
                else colMatch[key] = { $regex: val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
              }
            }
            const matchConditions = [];
            for (const [field, { from, to }] of Object.entries(dateFiltersByField)) {
              matchConditions.push(buildDateMatch(field, from, to));
            }
            for (const [k, v] of Object.entries(colMatch)) matchConditions.push({ [k]: v });
            pushEngineerColumnFilterConditions(engineerPatterns, matchConditions);
            if (matchConditions.length > 0) {
              irPipeline.push({ $match: matchConditions.length === 1 ? matchConditions[0] : { $and: matchConditions } });
            }
          } catch (e) {
            console.warn('[tasks/filter] accountantInvoiceRequests: Invalid columnFilters JSON:', e.message);
          }
        }
        const facetSortField = (sortField || 'requestDate').replace(/^-/, '');
        const facetSortDir = (sortDirection === 'asc') ? 1 : -1;
        irPipeline.push({ $sort: { [facetSortField]: facetSortDir } });
        irPipeline.push({
          $facet: {
            total: [{ $count: 'count' }],
            data: [
              { $skip: (pageNum - 1) * limitNum },
              { $limit: limitNum }
            ]
          }
        });
        const aggResult = await InvoiceRequest.aggregate(irPipeline).allowDiskUse(true);
        const result = aggResult[0];
        const total = (result?.total?.[0]?.count) || 0;
        const tasks = result?.data || [];
        logPerformance('GET /api/tasks/filter (accountantInvoiceRequests optimized)', startTime, tasks.length);
        return res.json({ tasks, total, page: pageNum, limit: limitNum });
      }

      // Без пагінації: застосовуємо filter і columnFilters
      if (filter && typeof filter === 'string' && filter.trim()) {
        const searchStr = filter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: searchStr, $options: 'i' };
        irPipeline.push({ $match: { $or: UNIVERSAL_SEARCH_FIELDS.map(f => ({ [f]: regex })) } });
      }
      if (columnFilters && typeof columnFilters === 'string') {
        try {
          const filters = JSON.parse(columnFilters);
          const colMatch = {};
          const dateFiltersByField = {};
          const engineerPatterns = [];
          for (const [key, value] of Object.entries(filters)) {
            if (!value || String(value).trim() === '') continue;
            const val = String(value).trim();
            if (key.endsWith('From')) {
              const field = key.replace('From', '');
              const parsed = parseFilterDate(val);
              if (parsed) { dateFiltersByField[field] = dateFiltersByField[field] || {}; dateFiltersByField[field].from = parsed; }
            } else if (key.endsWith('To')) {
              const field = key.replace('To', '');
              const parsed = parseFilterDate(val, true);
              if (parsed) { dateFiltersByField[field] = dateFiltersByField[field] || {}; dateFiltersByField[field].to = parsed; }
            } else {
              if (ENGINEER_COLUMN_KEYS.includes(key)) {
                engineerPatterns.push(val);
                continue;
              }
              const filterType = ['status', 'company', 'paymentType', 'serviceRegion', 'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager'].includes(key) ? 'select' : 'text';
              if (filterType === 'select') colMatch[key] = val;
              else colMatch[key] = { $regex: val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
            }
          }
          const matchConditions = [];
          for (const [field, { from, to }] of Object.entries(dateFiltersByField)) {
            matchConditions.push(buildDateMatch(field, from, to));
          }
          for (const [k, v] of Object.entries(colMatch)) matchConditions.push({ [k]: v });
          pushEngineerColumnFilterConditions(engineerPatterns, matchConditions);
          if (matchConditions.length > 0) irPipeline.push({ $match: matchConditions.length === 1 ? matchConditions[0] : { $and: matchConditions } });
        } catch (e) {
          console.warn('[tasks/filter] accountantInvoiceRequests: Invalid columnFilters JSON:', e.message);
        }
      }
      const sortFieldExport = (sortField || 'requestDate').replace(/^-/, '');
      const sortDirExport = (sortDirection === 'asc') ? 1 : -1;
      irPipeline.push({ $sort: { [sortFieldExport]: sortDirExport } });

      const tasks = await InvoiceRequest.aggregate(irPipeline).allowDiskUse(true);
      logPerformance('GET /api/tasks/filter (accountantInvoiceRequests optimized)', startTime, tasks.length);
      return res.json(tasks);
    }

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
      } else if (statusArray.length > 0) {
        // Мобільний додаток: буквальні значення статусів (наприклад "Заявка,В роботі,Виконано")
        matchStage.status = { $in: statusArray.map(s => s.trim()) };
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
          // 2. paymentType не 'Готівка' і не 'Інше'
          // 3. debtStatus НЕ 'Документи в наявності' (виключаємо заявки з активованим чекбоксом)
          matchStage.status = 'Виконано';
          matchStage.paymentType = { $exists: true, $ne: '', $ne: 'не вибрано', $nin: ['Готівка', 'Інше'] };
          matchStage.debtStatus = { $ne: 'Документи в наявності' };
          break;
        case 'paymentDebt':
          // Заборгованість по оплаті: виконані заявки без дати оплати, не затверджені бухгалтером (не в архіві)
          // paymentType: Готівка, Безготівка, На карту, Інше; виключаємо Внутрішні роботи; виключаємо суму 0 або пусте
          matchStage.status = 'Виконано';
          matchStage.paymentType = { $in: ['Готівка', 'Безготівка', 'На карту', 'Інше'] };
          matchStage.approvedByAccountant = { $nin: ['Підтверджено', true] };
          matchStage.$and = [
            { $or: [ { paymentDate: null }, { paymentDate: '' }, { paymentDate: { $exists: false } } ] },
            { $or: [ { internalWork: { $ne: true } }, { internalWork: null }, { internalWork: false }, { internalWork: { $exists: false } } ] },
            { $expr: { $gt: [ { $convert: { input: { $ifNull: ['$serviceTotal', 0] }, to: 'double', onError: 0, onNull: 0 } }, 0 ] } }
          ];
          break;
        case 'allExceptApproved':
          // Всі заявки окрім затвердженні до оплати на премію:
          // Показуємо всі заявки, окрім тих, де Підтвердження бухгалтера = 'Підтверджено'
          matchStage.approvedByAccountant = { $ne: 'Підтверджено' };
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
    
    // $lookup потрібен тільки для accountantInvoiceRequests (панель "Бух рахунки")
    // Для accountantPending, done, archive тощо — пропускаємо, щоб не робити 1000+ lookups
    const needsInvoiceLookup = status === 'accountantInvoiceRequests';

    const pipeline = [
      { $match: matchStage },
      { $sort: sort === '-requestDate' ? { requestDate: -1 } : { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } }
    ];

    if (needsInvoiceLookup) {
      pipeline.push(
        {
          $lookup: {
            from: 'invoicerequests',
            let: { taskIdStr: { $toString: '$_id' } },
            pipeline: [
              { $match: { $expr: { $eq: [{ $toString: '$taskId' }, '$$taskIdStr'] } } }
            ],
            as: 'invoiceRequestByTaskId'
          }
        },
        { $addFields: { invoiceRequest: { $arrayElemAt: ['$invoiceRequestByTaskId', 0] } } },
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
            invoiceRequesterName: { $ifNull: ['$invoiceRequest.requesterName', null] },
            invoiceRequestId: {
              $cond: {
                if: { $ne: ['$invoiceRequest', null] },
                then: { $toString: '$invoiceRequest._id' },
                else: { $ifNull: ['$invoiceRequestId', null] }
              }
            }
          }
        },
        { $project: { invoiceRequestByTaskId: 0, invoiceRequest: 0 } }
      );
    } else {
      pipeline.push({
        $addFields: {
          invoiceRequestId: { $ifNull: ['$invoiceRequestId', null] },
          invoiceStatus: { $ifNull: ['$invoiceStatus', null] }
        }
      });
    }

    pipeline.push({
      $addFields: { id: { $toString: '$_id' } }
    });
    
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

    // Фільтри (filter, columnFilters) — застосовуємо коли передані, з пагінацією або без (експорт)
    const hasFilters = (filter && typeof filter === 'string' && filter.trim()) || (columnFilters && typeof columnFilters === 'string' && columnFilters.trim());
    if (hasFilters) {
      if (filter && typeof filter === 'string' && filter.trim()) {
        const searchStr = filter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: searchStr, $options: 'i' };
        pipeline.push({
          $match: {
            $or: UNIVERSAL_SEARCH_FIELDS.map(f => ({ [f]: regex }))
          }
        });
      }
      // Фільтри по колонках
      if (columnFilters && typeof columnFilters === 'string') {
        try {
          const filters = JSON.parse(columnFilters);
          const colMatch = {};
          const dateFiltersByField = {};
          const engineerPatterns = [];
          for (const [key, value] of Object.entries(filters)) {
            if (!value || String(value).trim() === '') continue;
            const val = String(value).trim();
            if (key.endsWith('From')) {
              const field = key.replace('From', '');
              const parsed = parseFilterDate(val);
              if (parsed) { dateFiltersByField[field] = dateFiltersByField[field] || {}; dateFiltersByField[field].from = parsed; }
            } else if (key.endsWith('To')) {
              const field = key.replace('To', '');
              const parsed = parseFilterDate(val, true);
              if (parsed) { dateFiltersByField[field] = dateFiltersByField[field] || {}; dateFiltersByField[field].to = parsed; }
            } else {
              if (ENGINEER_COLUMN_KEYS.includes(key)) {
                engineerPatterns.push(val);
                continue;
              }
              const filterType = ['status', 'company', 'paymentType', 'serviceRegion', 'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager'].includes(key) ? 'select' : 'text';
              if (filterType === 'select') colMatch[key] = val;
              else colMatch[key] = { $regex: val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
            }
          }
          const matchConditions = [];
          for (const [field, { from, to }] of Object.entries(dateFiltersByField)) {
            matchConditions.push(buildDateMatch(field, from, to));
          }
          for (const [k, v] of Object.entries(colMatch)) matchConditions.push({ [k]: v });
          pushEngineerColumnFilterConditions(engineerPatterns, matchConditions);
          if (matchConditions.length > 0) {
            pipeline.push({ $match: matchConditions.length === 1 ? matchConditions[0] : { $and: matchConditions } });
          }
        } catch (e) {
          console.warn('[tasks/filter] Invalid columnFilters JSON:', e.message);
        }
      }
    }

    // Пагінація (тільки коли передані page та limit) або сортування для експорту
    const facetSortField = sortField ? sortField.replace(/^-/, '') : 'requestDate';
    const facetSortDir = (sortDirection === 'asc') ? 1 : -1;
    const facetSort = { [facetSortField]: facetSortDir };

    if (isPaginated) {
      pipeline.push({
        $facet: {
          total: [{ $count: 'count' }],
          data: [
            { $sort: facetSort },
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum }
          ]
        }
      });
    } else if (sortField || sortDirection) {
      pipeline.push({ $sort: facetSort });
    }

    const aggResult = await Task.aggregate(pipeline).allowDiskUse(true);
    
    if (isPaginated) {
      const result = aggResult[0];
      const total = (result?.total?.[0]?.count) || 0;
      const tasks = result?.data || [];
      logPerformance('GET /api/tasks/filter (paginated)', startTime, tasks.length);
      return res.json({ tasks, total, page: pageNum, limit: limitNum });
    }

    const tasks = aggResult;
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
    
    // Автоматичне встановлення autoCompletedAt якщо заявка створюється одразу зі статусом "Виконано"
    if (taskData.status === 'Виконано' && !taskData.autoCompletedAt) {
      taskData.autoCompletedAt = new Date();
      console.log('[DEBUG] POST /api/tasks - автоматично встановлено autoCompletedAt при створенні зі статусом "Виконано":', taskData.autoCompletedAt);
    }
    
    const task = new Task(taskData);
    const savedTask = await task.save();
    
    // Відправляємо Telegram і push сповіщення про нову заявку
    try {
      const user = req.user || { login: 'system', name: 'Система' };
      await telegramService.sendTaskNotification('task_created', savedTask, user);
      await sendFcmTaskNotification('task_created', savedTask, user);
    } catch (notificationError) {
      console.error('[TELEGRAM] Помилка при створенні заявки:', notificationError);
    }

    try {
      const taskObj = savedTask.toObject ? savedTask.toObject() : savedTask;
      const actor = req.user || { login: 'system', name: 'Система' };
      const uname = actor.name || actor.login || 'Система';
      const reqNum = taskObj.requestNumber || String(taskObj._id);
      await notifyServiceRegionalForTask(taskObj, 'task_new', {
        title: 'Нова заявка',
        body: `Створено заявку ${reqNum}${taskObj.client ? `: ${taskObj.client}` : ''} (${uname}).`,
        dedupeKeyPrefix: `task_new:${taskObj._id}`
      });
    } catch (regionalNotifyErr) {
      console.error('[notify] task_new POST /api/tasks:', regionalNotifyErr);
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
    if (updateData.status === 'Виконано' && currentTask.status !== 'Виконано') {
      // Встановлюємо дату тільки якщо поле порожнє, щоб зберегти оригінальну дату виконання
      if (!currentTask.autoCompletedAt) {
        updateData.autoCompletedAt = new Date();
        console.log('[DEBUG] PUT /api/tasks/:id - автоматично встановлено autoCompletedAt:', updateData.autoCompletedAt);
      } else {
        console.log('[DEBUG] PUT /api/tasks/:id - autoCompletedAt вже встановлено, зберігаємо оригінальну дату:', currentTask.autoCompletedAt);
      }
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

    const user = req.user || { login: 'system', name: 'Система' };

    // Відправляємо Telegram сповіщення залежно від змін
    try {
      // Перевіряємо тип зміни і відправляємо відповідне сповіщення
      if (updateData.status === 'Виконано' && currentTask.status !== 'Виконано') {
        await telegramService.sendTaskNotification('task_completed', task, user);
        await sendFcmTaskNotification('task_completed', task, user);
      } else if (updateData.approvedByWarehouse === 'Підтверджено' && currentTask.approvedByWarehouse !== 'Підтверджено') {
        await telegramService.sendTaskNotification('accountant_approval', task, user);
        await sendFcmTaskNotification('accountant_approval', task, user);
      } else if (updateData.approvedByAccountant === 'Підтверджено' && currentTask.approvedByAccountant !== 'Підтверджено') {
        const allApproved = task.approvedByWarehouse === 'Підтверджено' && task.approvedByAccountant === 'Підтверджено';
        if (allApproved) {
          await telegramService.sendTaskNotification('task_approved', task, user);
          await sendFcmTaskNotification('task_approved', task, user);
        }
      } else if (updateData.approvedByWarehouse === 'Відмова' || updateData.approvedByAccountant === 'Відмова') {
        await telegramService.sendTaskNotification('task_rejected', task, user);
        await sendFcmTaskNotification('task_rejected', task, user);
      }
    } catch (notificationError) {
      console.error('[TELEGRAM] Помилка при оновленні заявки:', notificationError);
    }

    try {
      const uname = user.name || user.login || 'Користувач';
      const reqNum = task.requestNumber || String(task._id);
      if (currentTask.approvedByWarehouse !== 'Підтверджено' && task.approvedByWarehouse === 'Підтверджено') {
        await notifyServiceRegionalForTask(task, 'task_wh_approved', {
          title: 'Затверджено завскладом',
          body: `Заявка ${reqNum}: підтверджено завскладом (${uname}).`,
          dedupeKeyPrefix: `task_wh_approved:${task._id}:${task.autoWarehouseApprovedAt || ''}`
        });
      }
      if (currentTask.approvedByWarehouse !== 'Відмова' && task.approvedByWarehouse === 'Відмова') {
        const reason =
          updateData.warehouseComment != null ? updateData.warehouseComment : task.warehouseComment || '—';
        await notifyServiceRegionalForTask(task, 'task_wh_rejected', {
          title: 'Відхилено завскладом',
          body: `Заявка ${reqNum}: відмова завскладом (${uname}). Опис: ${reason}`,
          dedupeKeyPrefix: `task_wh_rejected:${task._id}:${Date.now()}`
        });
      }
      if (currentTask.approvedByAccountant !== 'Підтверджено' && task.approvedByAccountant === 'Підтверджено') {
        await notifyServiceRegionalForTask(task, 'task_accountant_approved', {
          title: 'Затверджено бухгалтером',
          body: `Заявка ${reqNum}: підтверджено бухгалтером (${uname}).`,
          dedupeKeyPrefix: `task_acc_ok:${task._id}:${task.autoAccountantApprovedAt || ''}`
        });
      }
      if (currentTask.approvedByAccountant !== 'Відмова' && task.approvedByAccountant === 'Відмова') {
        const reason =
          updateData.accountantComment != null ? updateData.accountantComment : task.accountantComment || '—';
        await notifyServiceRegionalForTask(task, 'task_accountant_rejected', {
          title: 'Відхилено бухгалтером',
          body: `Заявка ${reqNum}: відмова бухгалтера (${uname}). Опис: ${reason}`,
          dedupeKeyPrefix: `task_acc_rej:${task._id}:${Date.now()}`
        });
      }
    } catch (regionalNotifyErr) {
      console.error('[notifyServiceRegionalForTask] PUT /api/tasks/:id:', regionalNotifyErr);
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
// ОНОВЛЕННЯ КООРДИНАТ ЗАЯВКИ
// ============================================
app.put('/api/tasks/:id/coordinates', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { lat, lng, isApproximate } = req.body;
    
    if (!lat || !lng) {
      logPerformance('PUT /api/tasks/:id/coordinates', startTime);
      return res.status(400).json({ error: 'Lat та lng обов\'язкові' });
    }
    
    const updateData = {
      lat: parseFloat(lat), 
      lng: parseFloat(lng),
      geocodedAt: new Date() // Додаємо час геокодування
    };
    
    // Додаємо isApproximate, якщо вказано
    if (isApproximate !== undefined) {
      updateData.isApproximate = Boolean(isApproximate);
    }
    
    const task = await Task.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    if (!task) {
      logPerformance('PUT /api/tasks/:id/coordinates', startTime);
      return res.status(404).json({ error: 'Заявка не знайдена' });
    }
    
    logPerformance('PUT /api/tasks/:id/coordinates', startTime);
    res.json({ success: true, task });
  } catch (error) {
    logPerformance('PUT /api/tasks/:id/coordinates', startTime);
    console.error('[ERROR] PUT /api/tasks/:id/coordinates:', error);
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
    
    // Якщо є invoiceRequestId, але немає invoiceRequestDate - встановлюємо з InvoiceRequest.createdAt
    if (task.invoiceRequestId && !task.invoiceRequestDate) {
      try {
        const invoiceRequest = await InvoiceRequest.findById(task.invoiceRequestId).lean();
        if (invoiceRequest && invoiceRequest.createdAt) {
          // Оновлюємо Task з датою з InvoiceRequest
          await Task.findByIdAndUpdate(req.params.id, {
            invoiceRequestDate: invoiceRequest.createdAt
          });
          task.invoiceRequestDate = invoiceRequest.createdAt;
          console.log(`[INVOICE] Встановлено invoiceRequestDate з InvoiceRequest для завдання ${req.params.id}`);
        }
      } catch (invoiceError) {
        console.error('[INVOICE] Помилка при отриманні InvoiceRequest:', invoiceError);
      }
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
// ГЛОБАЛЬНИЙ ПОШУК ЗАЯВОК
// ============================================
app.post('/api/tasks/global-search', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { requestNumber, edrpou, engineSerial, customerEquipmentNumber, region } = req.body;
    
    // Будуємо умови пошуку
    const matchConditions = {};
    
    if (requestNumber && requestNumber.trim()) {
      matchConditions.requestNumber = { $regex: new RegExp(requestNumber.trim(), 'i') };
    }
    
    if (edrpou && edrpou.trim()) {
      matchConditions.edrpou = { $regex: new RegExp(edrpou.trim(), 'i') };
    }
    
    if (engineSerial && engineSerial.trim()) {
      matchConditions.engineSerial = { $regex: new RegExp(engineSerial.trim(), 'i') };
    }
    
    if (customerEquipmentNumber && customerEquipmentNumber.trim()) {
      matchConditions.customerEquipmentNumber = { $regex: new RegExp(customerEquipmentNumber.trim(), 'i') };
    }
    
    // Фільтрація по регіону (якщо вказано і не "Всі регіони")
    if (region && region.trim() && region !== 'Україна') {
      matchConditions.serviceRegion = region.trim();
    }
    
    // Якщо немає жодної умови пошуку, повертаємо порожній результат
    if (Object.keys(matchConditions).length === 0) {
      logPerformance('POST /api/tasks/global-search', startTime, 0);
      return res.json([]);
    }
    
    // Виконуємо пошук з агрегацією для отримання повної інформації
    const tasks = await Task.aggregate([
      { $match: matchConditions },
      { $sort: { requestDate: -1, date: -1 } },
      {
        $addFields: {
          id: { $toString: '$_id' }
        }
      }
    ]).allowDiskUse(true);
    
    console.log('[DEBUG] POST /api/tasks/global-search - знайдено заявок:', tasks.length);
    logPerformance('POST /api/tasks/global-search', startTime, tasks.length);
    res.json(tasks);
  } catch (error) {
    logPerformance('POST /api/tasks/global-search', startTime);
    console.error('[ERROR] POST /api/tasks/global-search:', error);
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
// Отримання активних користувачів (онлайн за останні 5 хвилин)
// Важливо: має бути ПЕРЕД /api/users/:login, щоб "online" не трактувався як :login
app.get('/api/users/online', async (req, res) => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const activeUsers = await User.find(
      { lastActivity: { $gte: fiveMinutesAgo } },
      'login'
    ).lean();
    res.json(activeUsers.map(u => u.login));
  } catch (error) {
    console.error('[ACTIVITY] Помилка /api/users/online:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Активні менеджери (і mgradm) для передачі резерву — без поточного користувача. Має бути перед /api/users/:login. */
app.get('/api/users/managers-for-transfer', authenticateToken, async (req, res) => {
  try {
    const selfLogin = (req.user?.login || '').trim();
    const rows = await User.find({
      role: { $in: ['manager', 'mgradm'] },
      dismissed: { $ne: true }
    })
      .select('login name')
      .sort({ name: 1, login: 1 })
      .lean();
    const managers = rows
      .filter((u) => u.login && String(u.login).trim() && String(u.login).trim() !== selfLogin)
      .map((u) => ({ login: u.login, name: (u.name && String(u.name).trim()) || u.login }));
    res.json(managers);
  } catch (err) {
    console.error('[ERROR] GET /api/users/managers-for-transfer:', err);
    res.status(500).json({ error: err.message });
  }
});

// Отримання користувача за логіном
app.get('/api/users/:login', async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.params.login })
      .select('-password') // Виключаємо пароль
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: 'Користувач не знайдено' });
    }
    
    logPerformance('GET /api/users/:login', startTime);
    res.json(user);
  } catch (error) {
    logPerformance('GET /api/users/:login', startTime);
    console.error('[ERROR] GET /api/users/:login:', error);
    res.status(500).json({ error: error.message });
  }
});

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

// FCM-токен для мобільного додатку (push-сповіщення)
app.post('/api/users/me/fcm-token', authenticateToken, async (req, res) => {
  try {
    const { fcmToken } = req.body || {};
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({ error: 'fcmToken required' });
    }
    await User.findOneAndUpdate(
      { login: req.user.login },
      { fcmToken: fcmToken.trim() }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[FCM] Помилка збереження токена:', err);
    res.status(500).json({ error: 'Failed to save token' });
  }
});
app.delete('/api/users/me/fcm-token', authenticateToken, async (req, res) => {
  try {
    await User.findOneAndUpdate(
      { login: req.user.login },
      { $unset: { fcmToken: 1 } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[FCM] Помилка очищення токена:', err);
    res.status(500).json({ error: 'Failed to clear token' });
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
// API ГЛОБАЛЬНИХ КОЕФІЦІЄНТІВ (фінансовий відділ: продажі / сервіс)
// ============================================
app.get('/api/global-calculation-coefficients', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    let doc = await GlobalCalculationCoefficients.findOne();
    if (!doc) {
      doc = await GlobalCalculationCoefficients.create({
        salesRows: [],
        serviceRows: []
      });
    }
    logPerformance('GET /api/global-calculation-coefficients', startTime);
    const roleLower = String(req.user?.role || '').toLowerCase();
    const payload = {
      /** Календарна дата на сервері (для резервування тощо), щоб UI не покладався на годинник клієнта */
      serverTodayYmd: serverLocalTodayYmd(),
      sales: {
        rows: buildCoefficientRowsForScope('sales', doc.salesRows),
        updatedAt: doc.salesUpdatedAt,
        updatedByLogin: doc.salesUpdatedByLogin
      },
      service: {
        rows: buildCoefficientRowsForScope('service', doc.serviceRows),
        updatedAt: doc.serviceUpdatedAt,
        updatedByLogin: doc.serviceUpdatedByLogin
      }
    };
    if (roleLower === 'golovnkervserv') {
      delete payload.sales;
    }
    res.json(payload);
  } catch (error) {
    logPerformance('GET /api/global-calculation-coefficients', startTime);
    console.error('[ERROR] GET /api/global-calculation-coefficients:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/global-calculation-coefficients', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const body = req.body;
    const scope = body.scope;
    if (scope !== 'sales' && scope !== 'service') {
      return res.status(400).json({ error: 'Очікується scope: "sales" або "service" та масив rows' });
    }
    if (!canEditGlobalCalculationCoefficients(req.user.role, scope)) {
      return res.status(403).json({ error: 'Немає прав на зміну коефіцієнтів' });
    }
    if (!body || !Array.isArray(body.rows)) {
      return res.status(400).json({ error: 'Очікується об\'єкт з масивом rows' });
    }
    const compactRows = serializeCoefficientValuesForDb(scope, body.rows);
    if (scope === 'service') {
      const svcPct = compactRows.find((r) => r.id === SERVICE_WORK_COMPLETION_PCT_ID);
      if (svcPct && svcPct.value <= 0) {
        return res.status(400).json({
          error:
            '«Відсоток за виконану роботу» має бути більшим за 0 (введіть відсоток, наприклад 25).'
        });
      }
      const tmplCheck = validateServiceTemplateCoefficientsFromCompact(compactRows);
      if (!tmplCheck.ok) {
        return res.status(400).json({ error: tmplCheck.error });
      }
    }
    let doc = await GlobalCalculationCoefficients.findOne();
    if (!doc) {
      doc = new GlobalCalculationCoefficients({ salesRows: [], serviceRows: [] });
    }
    const login = req.user.login || req.user.name || '';
    const now = new Date();
    if (scope === 'sales') {
      doc.salesRows = compactRows;
      doc.salesUpdatedAt = now;
      doc.salesUpdatedByLogin = login;
    } else {
      doc.serviceRows = compactRows;
      doc.serviceUpdatedAt = now;
      doc.serviceUpdatedByLogin = login;
    }
    await doc.save();
    logPerformance('POST /api/global-calculation-coefficients', startTime);
    const roleLower = String(req.user?.role || '').toLowerCase();
    const out = {
      success: true,
      sales: {
        rows: buildCoefficientRowsForScope('sales', doc.salesRows),
        updatedAt: doc.salesUpdatedAt,
        updatedByLogin: doc.salesUpdatedByLogin
      },
      service: {
        rows: buildCoefficientRowsForScope('service', doc.serviceRows),
        updatedAt: doc.serviceUpdatedAt,
        updatedByLogin: doc.serviceUpdatedByLogin
      }
    };
    if (roleLower === 'golovnkervserv') {
      delete out.sales;
    }
    res.json(out);
  } catch (error) {
    logPerformance('POST /api/global-calculation-coefficients', startTime);
    console.error('[ERROR] POST /api/global-calculation-coefficients:', error);
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

// Схема для файлів (taskId — для заявок, entityType+entityId — для взаємодій клієнта)
const fileSchema = new mongoose.Schema({
  taskId: String,
  entityType: String,
  entityId: String,
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

// ============================================
// ПУБЛІЧНЕ ВІДКРИТТЯ/ЗАВАНТАЖЕННЯ ФАЙЛІВ (ДЛЯ EXCEL ms-excel: без Authorization header)
// ============================================
// Видаємо короткий токен через авторизований /api ендпойнт, а сам файл віддаємо через public URL з token query.

// Отримати короткий токен для відкриття файла (2 хв)
app.get('/api/files/open-token/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findById(fileId).lean();
    if (!file) return res.status(404).json({ error: 'Файл не знайдено' });

    const token = jwt.sign(
      { type: 'file-open', fileId: String(fileId) },
      JWT_SECRET,
      { expiresIn: '2m' }
    );

    res.json({ token });
  } catch (error) {
    console.error('[FILES] Помилка генерації open-token:', error);
    res.status(500).json({ error: 'Помилка генерації токена' });
  }
});

// Публічний стрім файла (Excel/Office можуть тягнути без Bearer header)
app.get('/files/open/:fileId', async (req, res) => {
  const startTime = Date.now();
  try {
    const { fileId } = req.params;
    const token = req.query.token;

    if (!token) return res.status(401).send('Missing token');

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(403).send('Invalid token');
    }

    if (!payload || payload.type !== 'file-open' || String(payload.fileId) !== String(fileId)) {
      return res.status(403).send('Token mismatch');
    }

    const file = await File.findById(fileId).lean();
    if (!file) return res.status(404).send('Not found');

    if (!file.cloudinaryUrl) return res.status(404).send('Missing file url');

    const upstream = await fetch(file.cloudinaryUrl);
    if (!upstream.ok) {
      console.error('[FILES] Upstream fetch failed:', upstream.status, file.cloudinaryUrl);
      return res.status(502).send('Upstream error');
    }

    const contentType =
      file.mimetype ||
      upstream.headers.get('content-type') ||
      'application/octet-stream';

    const filename = file.originalName || 'file';
    const encoded = encodeURIComponent(filename);

    res.setHeader('Content-Type', contentType);
    // attachment працює і для скачування, і для відкриття через ms-excel:ofe|u|
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Стрімимо тіло відповіді
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    }

    logPerformance('GET /files/open/:fileId', startTime);
  } catch (error) {
    console.error('[FILES] Помилка public open:', error);
    logPerformance('GET /files/open/:fileId', startTime);
    res.status(500).send('Server error');
  }
});

// Multer Storage для файлів виконаних робіт (всі типи файлів)
// Важливо: Cloudinary може зберігати PDF як raw (Format=N/A) якщо лишити 'auto'.
// Щоб було як у "Договори" (PDF визначається як Image/PDF) — форсуємо PDF -> resource_type: 'image'.
// Excel/Word залишаємо raw (це нормальний тип для офісних документів в Cloudinary).
const workFilesStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    const originalName = file?.originalname || '';
    const mimetype = file?.mimetype || '';
    const dotIdx = originalName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? originalName.slice(dotIdx + 1).toLowerCase() : '';

    const isImage =
      mimetype.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isPdf = mimetype === 'application/pdf' || ext === 'pdf';

    // PDF -> image (щоб Format в Cloudinary був PDF, як у договорах)
    const resourceType = isImage || isPdf ? 'image' : 'raw';

    // Робимо стабільний public_id (без кирилиці/пробілів), але зберігаємо ориг. назву в MongoDB як originalName.
    const uid = `${req.params.taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const params = {
      folder: 'newservicegidra/work-files',
      resource_type: resourceType,
      overwrite: false,
      invalidate: true,
      public_id: uid
    };

    // allowed_formats залежно від типу
    if (resourceType === 'image') {
      params.allowed_formats = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    } else {
      params.allowed_formats = ['doc', 'docx', 'xls', 'xlsx', 'txt'];
      // Спроба допомогти Cloudinary проставити формат для raw
      if (ext) params.format = ext;
      if (originalName) params.filename_override = originalName;
    }

    return params;
  }
});

const uploadWorkFiles = multer({
  storage: workFilesStorage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

// Завантаження файлів для заявки (як для договорів - використовуємо CloudinaryStorage)
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
      
      try {
        // Cloudinary автоматично завантажив файл через CloudinaryStorage (як для договорів)
        // Отримуємо URL та інформацію про файл
        const fileUrl = file.path || file.secure_url || '';
        const cloudinaryId = file.public_id || '';
        // Виправляємо кодування назви файлу
        let correctedName = file.originalname;
        try {
          const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
          if (decoded && decoded !== correctedName && !decoded.includes('')) {
            correctedName = decoded;
          }
        } catch (error) {
          console.log('[FILES] Не вдалося декодувати назву файлу:', error);
        }
        
        console.log('[FILES] Файл завантажено в Cloudinary:', {
          originalname: correctedName,
          url: fileUrl,
          public_id: cloudinaryId,
          format: file.format,
          resource_type: file.resource_type,
          size: file.size
        });
        
        // Створюємо запис в MongoDB
        const fileRecord = new File({
          taskId: req.params.taskId,
          originalName: correctedName,
          filename: cloudinaryId,
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
      } catch (fileError) {
        console.error('[FILES] Помилка обробки файлу:', file.originalname, fileError);
        // Продовжуємо обробку інших файлів навіть якщо один не вдався
        continue;
      }
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

// Multer Storage для файлів взаємодій (JPEG, PDF, Word — як для файлів виконаних робіт)
const interactionFilesStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    const originalName = file?.originalname || '';
    const mimetype = file?.mimetype || '';
    const dotIdx = originalName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? originalName.slice(dotIdx + 1).toLowerCase() : '';
    const isImage = mimetype.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isPdf = mimetype === 'application/pdf' || ext === 'pdf';
    const resourceType = isImage || isPdf ? 'image' : 'raw';
    const uid = `interaction_${req.params.interactionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const params = {
      folder: 'newservicegidra/interaction-files',
      resource_type: resourceType,
      overwrite: false,
      invalidate: true,
      public_id: uid
    };
    if (resourceType === 'image') {
      params.allowed_formats = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    } else {
      params.allowed_formats = ['doc', 'docx', 'xls', 'xlsx', 'txt'];
      if (ext) params.format = ext;
      if (originalName) params.filename_override = originalName;
    }
    return params;
  }
});
const uploadInteractionFiles = multer({
  storage: interactionFilesStorage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Завантаження файлів для взаємодії клієнта (Подана комерційна пропозиція)
app.post('/api/clients/:clientId/interactions/:interactionId/files', authenticateToken, async (req, res, next) => {
  const client = await Client.findById(req.params.clientId).lean();
  if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
  const accessResult = getClientWithAccessControl(client, req.user);
  if (!accessResult || accessResult.limited) return res.status(403).json({ error: 'Немає доступу' });
  const interaction = await Interaction.findById(req.params.interactionId).lean();
  if (!interaction || interaction.entityId?.toString() !== req.params.clientId) return res.status(404).json({ error: 'Взаємодію не знайдено' });
  next();
}, uploadInteractionFiles.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Файли не були завантажені' });
    const uploadedFiles = [];
    for (const file of req.files) {
      const fileUrl = file.path || file.secure_url || '';
      let correctedName = file.originalname || '';
      try {
        const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedName) correctedName = decoded;
      } catch (_) {}
      const fileRecord = new File({
        entityType: 'interaction',
        entityId: req.params.interactionId,
        originalName: correctedName,
        filename: file.public_id || '',
        cloudinaryId: file.public_id || '',
        cloudinaryUrl: fileUrl,
        mimetype: file.mimetype,
        size: file.size,
        description: req.body.description || ''
      });
      const saved = await fileRecord.save();
      uploadedFiles.push({
        id: saved._id,
        originalName: saved.originalName,
        cloudinaryUrl: saved.cloudinaryUrl,
        size: saved.size,
        uploadDate: saved.uploadDate,
        mimetype: saved.mimetype
      });
    }
    res.json({ success: true, files: uploadedFiles });
  } catch (err) {
    console.error('[FILES] Помилка завантаження файлів взаємодії:', err);
    res.status(500).json({ error: err.message });
  }
});

// Список файлів взаємодії
app.get('/api/clients/:clientId/interactions/:interactionId/files', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId).lean();
    if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
    const accessResult = getClientWithAccessControl(client, req.user);
    if (!accessResult || accessResult.limited) return res.status(403).json({ error: 'Немає доступу' });
    const files = await File.find({ entityType: 'interaction', entityId: req.params.interactionId }).sort({ uploadDate: -1 }).lean();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Файли угод (продажів) ———
const saleFilesStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    const originalName = file?.originalname || '';
    const mimetype = file?.mimetype || '';
    const dotIdx = originalName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? originalName.slice(dotIdx + 1).toLowerCase() : '';
    const isImage = mimetype.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isPdf = mimetype === 'application/pdf' || ext === 'pdf';
    const resourceType = isImage || isPdf ? 'image' : 'raw';
    const uid = `sale_${req.params.saleId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const params = {
      folder: 'newservicegidra/sale-files',
      resource_type: resourceType,
      overwrite: false,
      invalidate: true,
      public_id: uid
    };
    if (resourceType === 'image') {
      params.allowed_formats = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    } else {
      params.allowed_formats = ['doc', 'docx', 'xls', 'xlsx', 'txt'];
      if (ext) params.format = ext;
      if (originalName) params.filename_override = originalName;
    }
    return params;
  }
});
const uploadSaleFiles = multer({ storage: saleFilesStorage, limits: { fileSize: 20 * 1024 * 1024 } });

const checkSaleAccess = async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.saleId).lean();
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    const isAdmin = canAssignSaleManager(req.user);
    const isManager = sale.managerLogin === req.user?.login || sale.managerLogin2 === req.user?.login;
    const isSalesAccounting = canApproveSalePremium(req.user);
    if (isAdmin || isManager) {
      next();
      return;
    }
    if (isSalesAccounting && req.method === 'GET') {
      next();
      return;
    }
    return res.status(403).json({ error: 'Немає доступу до цієї угоди' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/sales/:saleId/files', authenticateToken, checkSaleAccess, uploadSaleFiles.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Файли не були завантажені' });
    const uploadedFiles = [];
    for (const file of req.files) {
      const fileUrl = file.path || file.secure_url || '';
      let correctedName = file.originalname || '';
      try {
        const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedName) correctedName = decoded;
      } catch (_) {}
      const fileRecord = new File({
        entityType: 'sale',
        entityId: req.params.saleId,
        originalName: correctedName,
        filename: file.public_id || '',
        cloudinaryId: file.public_id || '',
        cloudinaryUrl: fileUrl,
        mimetype: file.mimetype,
        size: file.size,
        description: req.body.description || ''
      });
      const saved = await fileRecord.save();
      uploadedFiles.push({
        id: saved._id,
        originalName: saved.originalName,
        cloudinaryUrl: saved.cloudinaryUrl,
        size: saved.size,
        uploadDate: saved.uploadDate,
        mimetype: saved.mimetype
      });
    }
    res.json({ success: true, files: uploadedFiles });
  } catch (err) {
    console.error('[FILES] Помилка завантаження файлів угоди:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/:saleId/files', authenticateToken, checkSaleAccess, async (req, res) => {
  try {
    const files = await File.find({ entityType: 'sale', entityId: req.params.saleId }).sort({ uploadDate: -1 }).lean();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Файли видаткової накладної (окремо від файлів угоди)
app.post('/api/sales/:saleId/invoice-files', authenticateToken, checkSaleAccess, uploadSaleFiles.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Файли не були завантажені' });
    const uploadedFiles = [];
    for (const file of req.files) {
      const fileUrl = file.path || file.secure_url || '';
      let correctedName = file.originalname || '';
      try {
        const decoded = Buffer.from(correctedName, 'latin1').toString('utf8');
        if (decoded && decoded !== correctedName) correctedName = decoded;
      } catch (_) {}
      const fileRecord = new File({
        entityType: 'sale_invoice',
        entityId: req.params.saleId,
        originalName: correctedName,
        filename: file.public_id || '',
        cloudinaryId: file.public_id || '',
        cloudinaryUrl: fileUrl,
        mimetype: file.mimetype,
        size: file.size,
        description: req.body.description || ''
      });
      const saved = await fileRecord.save();
      uploadedFiles.push({
        id: saved._id,
        originalName: saved.originalName,
        cloudinaryUrl: saved.cloudinaryUrl,
        size: saved.size,
        uploadDate: saved.uploadDate,
        mimetype: saved.mimetype
      });
    }
    res.json({ success: true, files: uploadedFiles });
  } catch (err) {
    console.error('[FILES] Помилка завантаження файлів видаткової накладної:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/:saleId/invoice-files', authenticateToken, checkSaleAccess, async (req, res) => {
  try {
    const files = await File.find({ entityType: 'sale_invoice', entityId: req.params.saleId }).sort({ uploadDate: -1 }).lean();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Отримання списку файлів завдання
app.get('/api/files/task/:taskId', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[FILES] Отримання файлів для завдання:', req.params.taskId);
    
    const files = await File.find({ taskId: req.params.taskId }).sort({ uploadDate: -1 }).lean();
    
    logPerformance('GET /api/files/task/:taskId', startTime, files.length);
    
    res.json(files);
  } catch (error) {
    console.error('[FILES] Помилка отримання файлів:', error);
    logPerformance('GET /api/files/task/:taskId', startTime);
    res.status(500).json({ error: 'Помилка отримання файлів: ' + error.message });
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
    
    // Видаляємо файл з Cloudinary
    // У Cloudinary destroy вимагає коректний resource_type для raw.
    // Спробуємо image -> raw, щоб працювало для PDF/зображень і для Excel/Doc.
    if (file.cloudinaryId) {
      const destroyWithType = async (resource_type) =>
        cloudinary.uploader.destroy(file.cloudinaryId, { resource_type });

      try {
        await destroyWithType('image');
        console.log('[FILES] Файл видалено з Cloudinary (image):', file.cloudinaryId);
      } catch (errImage) {
        try {
          await destroyWithType('raw');
          console.log('[FILES] Файл видалено з Cloudinary (raw):', file.cloudinaryId);
        } catch (errRaw) {
          console.error('[FILES] Помилка видалення з Cloudinary (image/raw):', {
            image: errImage?.message || errImage,
            raw: errRaw?.message || errRaw
          });
          // Продовжуємо видалення з БД навіть якщо не вдалося видалити з Cloudinary
        }
      }
    }
    
    // Видаляємо запис з MongoDB
    await File.findByIdAndDelete(req.params.fileId);
    
    logPerformance('DELETE /api/files/:fileId', startTime);
    
    res.json({ success: true, message: 'Файл видалено успішно' });
  } catch (error) {
    console.error('[FILES] Помилка видалення файлу:', error);
    logPerformance('DELETE /api/files/:fileId', startTime);
    res.status(500).json({ error: 'Помилка видалення файлу: ' + error.message });
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

// Отримання унікальних типів матеріалів з тестувань (для автодоповнення)
app.get('/api/testing-materials-types', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[DEBUG] GET /api/testing-materials-types - запит отримано');
    
    // Знаходимо всі обладнання з завершеними тестуваннями
    const equipment = await Equipment.find({
      $or: [
        { testingMaterialsArray: { $exists: true, $ne: [] } },
        { testingMaterialsJson: { $exists: true, $ne: '' } }
      ]
    }).lean();
    
    const materialTypes = new Set();
    const materialUnits = new Set();
    
    // Збираємо унікальні типи матеріалів та одиниці виміру
    equipment.forEach(eq => {
      let materials = [];
      
      // Перевіряємо нове поле testingMaterialsArray
      if (Array.isArray(eq.testingMaterialsArray) && eq.testingMaterialsArray.length > 0) {
        materials = eq.testingMaterialsArray;
      } else if (eq.testingMaterialsArray && typeof eq.testingMaterialsArray === 'string') {
        // Якщо це рядок JSON
        try {
          materials = JSON.parse(eq.testingMaterialsArray);
        } catch (e) {
          // Ігноруємо помилки парсингу
        }
      } else if (eq.testingMaterialsJson) {
        // Старе поле
        try {
          materials = JSON.parse(eq.testingMaterialsJson);
        } catch (e) {
          // Ігноруємо помилки парсингу
        }
      }
      
      // Додаємо типи та одиниці виміру
      if (Array.isArray(materials)) {
        materials.forEach(mat => {
          if (mat && typeof mat === 'object') {
            if (mat.type && mat.type.trim()) {
              materialTypes.add(mat.type.trim());
            }
            if (mat.unit && mat.unit.trim()) {
              materialUnits.add(mat.unit.trim());
            }
          }
        });
      }
    });
    
    const result = {
      types: Array.from(materialTypes).sort(),
      units: Array.from(materialUnits).sort()
    };
    
    console.log('[DEBUG] GET /api/testing-materials-types - знайдено типів:', result.types.length, 'одиниць:', result.units.length);
    logPerformance('GET /api/testing-materials-types', startTime, result.types.length);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] GET /api/testing-materials-types - помилка:', error);
    logPerformance('GET /api/testing-materials-types', startTime);
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
    
    // Відправляємо Telegram і push сповіщення про запит на рахунок
    try {
      const user = { login: requesterId, name: requesterName };
      await telegramService.sendTaskNotification('invoice_request', task, user);
      await sendFcmTaskNotification('invoice_request', task, user);
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
      const taskUpdateData = {
        invoiceRequestId: request._id.toString(),
        invoiceFile: req.file.path,
        invoiceFileName: correctedFileName,
        invoice: invoiceNumber,
        invoiceUploadDate: new Date() // Це дата завантаження рахунку
      };
      // Встановлюємо invoiceRequestDate, якщо вона ще не встановлена
      // (якщо користувач завантажує рахунок без попереднього створення запиту, це фактично заявка на рахунок)
      const currentTask = await Task.findById(requestIdOrTaskId);
      if (currentTask && !currentTask.invoiceRequestDate) {
        taskUpdateData.invoiceRequestDate = new Date();
        console.log('[INVOICE] Автоматично встановлено invoiceRequestDate при завантаженні рахунку (без попереднього запиту)');
      }
      await Task.findByIdAndUpdate(requestIdOrTaskId, taskUpdateData);
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
        const taskUpdateData = {
          invoiceFile: req.file.path,
          invoiceFileName: correctedFileName,
          invoice: invoiceNumber,
          invoiceUploadDate: new Date() // Це дата завантаження рахунку
        };
        // Встановлюємо invoiceRequestDate, якщо вона ще не встановлена
        // (якщо користувач завантажує рахунок без попереднього створення запиту, це фактично заявка на рахунок)
        const currentTask = await Task.findById(request.taskId);
        if (currentTask && !currentTask.invoiceRequestDate) {
          taskUpdateData.invoiceRequestDate = new Date();
          console.log('[INVOICE] Автоматично встановлено invoiceRequestDate при оновленні рахунку (без попереднього запиту)');
        }
        await Task.findByIdAndUpdate(request.taskId, taskUpdateData);
      }
    }
    
    // Відправляємо Telegram і push сповіщення про завантажений рахунок
    try {
      const task = await Task.findById(request.taskId).lean();
      if (task) {
        const user = req.user || { login: 'system', name: 'Бухгалтер' };
        await telegramService.sendTaskNotification('invoice_completed', task, user);
        await sendFcmTaskNotification('invoice_completed', task, user);
        try {
          const uname = user.name || user.login || 'Бухгалтерія';
          const reqNum = task.requestNumber || String(task._id);
          await notifyServiceRegionalForTask(task, 'task_invoice_uploaded', {
            title: 'Завантажено рахунок по заявці',
            body: `Заявка ${reqNum}: завантажено рахунок${invoiceNumber ? ` № ${invoiceNumber}` : ''} (${uname}).`
          });
        } catch (regN) {
          console.error('[notify] invoice upload service/regional:', regN);
        }
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
      const taskUpdateData = {
        invoiceRequestId: request._id.toString(),
        actFile: req.file.path,
        actFileName: correctedActFileName
      };
      // Встановлюємо invoiceRequestDate, якщо вона ще не встановлена
      // (якщо користувач завантажує акт без попереднього створення запиту, це фактично заявка на рахунок)
      const currentTask = await Task.findById(requestIdOrTaskId);
      if (currentTask && !currentTask.invoiceRequestDate) {
        taskUpdateData.invoiceRequestDate = new Date();
        console.log('[INVOICE] Автоматично встановлено invoiceRequestDate при завантаженні акту (без попереднього запиту)');
      }
      await Task.findByIdAndUpdate(requestIdOrTaskId, taskUpdateData);
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
        const taskUpdateData = {
          actFile: req.file.path,
          actFileName: correctedActFileName
        };
        // Встановлюємо invoiceRequestDate, якщо вона ще не встановлена
        // (якщо користувач завантажує акт без попереднього створення запиту, це фактично заявка на рахунок)
        const currentTask = await Task.findById(request.taskId);
        if (currentTask && !currentTask.invoiceRequestDate) {
          taskUpdateData.invoiceRequestDate = new Date();
          console.log('[INVOICE] Автоматично встановлено invoiceRequestDate при оновленні акту (без попереднього запиту)');
        }
        await Task.findByIdAndUpdate(request.taskId, taskUpdateData);
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
// API ДЛЯ СКЛАДСЬКОГО ОБЛІКУ ОБЛАДНАННЯ
// ============================================

// Отримання списку складів
app.get('/api/warehouses', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const forMoveDest = ['1', 'true', 'yes'].includes(
      String(req.query.forMoveDestination || '').trim().toLowerCase()
    );
    let warehouses;
    if (
      forMoveDest &&
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const u = await User.findOne({ login: req.user.login }).select('region').lean();
      const allowedIds = await loadActiveWarehouseIdsForUserRegion(u?.region);
      const all = await Warehouse.find({ isActive: true }).sort({ name: 1 }).lean();
      warehouses = all.filter((w) => !allowedIds.has(String(w._id)));
    } else if (
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const u = await User.findOne({ login: req.user.login }).select('region').lean();
      const allowedIds = await loadActiveWarehouseIdsForUserRegion(u?.region);
      if (!allowedIds.size) {
        warehouses = [];
      } else {
        const oidList = [...allowedIds].filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
        warehouses = oidList.length
          ? await Warehouse.find({
              isActive: true,
              _id: { $in: oidList }
            })
              .sort({ name: 1 })
              .lean()
          : [];
      }
    } else {
      warehouses = await Warehouse.find({ isActive: true })
        .sort({ name: 1 })
        .lean();
    }
    logPerformance('GET /api/warehouses', startTime, warehouses.length);
    res.json(warehouses);
  } catch (error) {
    console.error('[ERROR] GET /api/warehouses:', error);
    logPerformance('GET /api/warehouses', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Створення складу
app.post('/api/warehouses', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    // Перевірка прав доступу
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    const { name, region, address } = req.body;
    if (
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const u = await User.findOne({ login: req.user.login }).select('region').lean();
      const bodyRegion = String(region || '').trim();
      const ur = String(u?.region || '').trim();
      if (!bodyRegion || !ur || !new RegExp(escapeRegExpForRegion(ur), 'i').test(bodyRegion)) {
        return res.status(403).json({ error: 'Створювати склад можна лише з регіоном, що відповідає вашому профілю.' });
      }
    }

    const warehouse = await Warehouse.create({ name, region, address });
    logPerformance('POST /api/warehouses', startTime);
    res.status(201).json(warehouse);
  } catch (error) {
    console.error('[ERROR] POST /api/warehouses:', error);
    logPerformance('POST /api/warehouses', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення складу
app.put('/api/warehouses/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    // Перевірка прав доступу
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    const uPut = await User.findOne({ login: req.user.login }).select('region').lean();
    if (
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const okWh = await ensureWarehouseStaffWarehouseIdAllowed(
        res,
        req.user,
        uPut,
        req.params.id,
        'Редагувати можна лише склади вашого регіону.'
      );
      if (!okWh) return;
    }

    const { name, region, address, isActive } = req.body;
    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      { name, region, address, isActive },
      { new: true, runValidators: true }
    );
    
    if (!warehouse) {
      return res.status(404).json({ error: 'Склад не знайдено' });
    }
    
    logPerformance('PUT /api/warehouses/:id', startTime);
    res.json(warehouse);
  } catch (error) {
    console.error('[ERROR] PUT /api/warehouses/:id:', error);
    logPerformance('PUT /api/warehouses/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Видалення складу
app.delete('/api/warehouses/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    // Перевірка прав доступу - тільки адміністратори можуть видаляти склади
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено. Тільки адміністратор може видаляти склади.' });
    }
    
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
    
    if (!warehouse) {
      return res.status(404).json({ error: 'Склад не знайдено' });
    }
    
    logPerformance('DELETE /api/warehouses/:id', startTime);
    res.json({ message: 'Склад видалено успішно' });
  } catch (error) {
    console.error('[ERROR] DELETE /api/warehouses/:id:', error);
    logPerformance('DELETE /api/warehouses/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЕРЕВА КАТЕГОРІЙ НОМЕНКЛАТУРИ (1С-стиль)
// ============================================

async function ensureRootCategories() {
  const count = await Category.countDocuments({ parentId: null });
  if (count >= 2) return;
  const roots = await Category.find({ parentId: null }).lean();
  const hasEquipment = roots.some(r => r.itemKind === 'equipment');
  const hasParts = roots.some(r => r.itemKind === 'parts');
  if (!hasEquipment) {
    await Category.create({ parentId: null, name: 'Товари', itemKind: 'equipment', sortOrder: 0 });
  }
  if (!hasParts) {
    await Category.create({ parentId: null, name: 'Деталі та комплектуючі', itemKind: 'parts', sortOrder: 1 });
  }
}

// Список категорій (плоский) або дерево
app.get('/api/categories', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    await ensureRootCategories();
    const { itemKind, tree } = req.query;
    const query = {};
    if (itemKind && ['equipment', 'parts'].includes(itemKind)) query.itemKind = itemKind;
    const list = await Category.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    if (tree === 'true') {
      const byParent = {};
      list.forEach(c => {
        const pid = c.parentId ? c.parentId.toString() : 'root';
        if (!byParent[pid]) byParent[pid] = [];
        byParent[pid].push({ ...c, children: [] });
      });
      const build = (pid) => (byParent[pid] || []).map(node => ({
        ...node,
        children: build(node._id.toString())
      }));
      const roots = build('root');
      logPerformance('GET /api/categories?tree=true', startTime, roots.length);
      return res.json(roots);
    }
    logPerformance('GET /api/categories', startTime, list.length);
    res.json(list);
  } catch (error) {
    console.error('[ERROR] GET /api/categories:', error);
    logPerformance('GET /api/categories', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Дерево категорій (зручний ендпоінт)
app.get('/api/categories/tree', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    await ensureRootCategories();
    const { itemKind } = req.query;
    const query = {};
    if (itemKind && ['equipment', 'parts'].includes(itemKind)) query.itemKind = itemKind;
    const list = await Category.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    const byParent = {};
    list.forEach(c => {
      const pid = c.parentId ? c.parentId.toString() : 'root';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push({ ...c, children: [] });
    });
    const build = (pid) => (byParent[pid] || []).map(node => ({
      ...node,
      children: build(node._id.toString())
    }));
    let tree = build('root');
    const roleLc = (req.user.role || '').toLowerCase();
    const isManagerRole = ['manager', 'mgradm'].includes(roleLc);
    const managerCtx = ['1', 'true'].includes(String(req.query.managerCategoryContext || '').toLowerCase());
    if (isManagerRole || managerCtx) {
      tree = filterCategoryTreeForManagers(tree);
    }
    logPerformance('GET /api/categories/tree', startTime, tree.length);
    res.json(tree);
  } catch (error) {
    console.error('[ERROR] GET /api/categories/tree:', error);
    logPerformance('GET /api/categories/tree', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Довідник назв/id категорій для імпорту залишків 1С (правила категорій у config + MongoDB)
app.get('/api/categories/for-stock-import', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const list = await Category.find({}).sort({ name: 1 }).select('name itemKind parentId').lean();
    const rows = list.map((c) => ({
      id: String(c._id),
      name: c.name,
      itemKind: c.itemKind,
      parentId: c.parentId ? String(c.parentId) : null,
    }));
    logPerformance('GET /api/categories/for-stock-import', startTime, rows.length);
    res.json({
      hint: 'Скопіюйте точне поле name у categoryAliases (ключ — з правила categoryName) або використайте categoryId у categoryRules.',
      categories: rows,
    });
  } catch (error) {
    console.error('[ERROR] GET /api/categories/for-stock-import:', error);
    logPerformance('GET /api/categories/for-stock-import', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Створення групи
app.post('/api/categories', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const { parentId, name, itemKind, sortOrder, visibleToManagers } = req.body;
    if (!name || !itemKind || !['equipment', 'parts'].includes(itemKind)) {
      return res.status(400).json({ error: 'Потрібні name та itemKind (equipment|parts)' });
    }
    const category = await Category.create({
      parentId: parentId || null,
      name: name.trim(),
      itemKind,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      visibleToManagers: visibleToManagers === true,
    });
    logPerformance('POST /api/categories', startTime);
    res.status(201).json(category);
  } catch (error) {
    console.error('[ERROR] POST /api/categories:', error);
    logPerformance('POST /api/categories', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення групи
app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const { name, parentId, itemKind, sortOrder, visibleToManagers } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (parentId !== undefined) update.parentId = parentId || null;
    if (itemKind !== undefined && ['equipment', 'parts'].includes(itemKind)) update.itemKind = itemKind;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);
    if (visibleToManagers !== undefined) update.visibleToManagers = !!visibleToManagers;
    const category = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });
    logPerformance('PUT /api/categories/:id', startTime);
    res.json(category);
  } catch (error) {
    console.error('[ERROR] PUT /api/categories/:id:', error);
    logPerformance('PUT /api/categories/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Видалення групи (тільки якщо немає дочірніх груп і немає обладнання в цій групі)
app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const id = req.params.id;
    const children = await Category.countDocuments({ parentId: id });
    if (children > 0) {
      return res.status(400).json({ error: 'Неможливо видалити: є дочірні групи. Спочатку видаліть або перемістіть їх.' });
    }
    const equipmentCount = await Equipment.countDocuments({ categoryId: id });
    if (equipmentCount > 0) {
      return res.status(400).json({ error: `Неможливо видалити: в цій групі є номенклатура (${equipmentCount} од.). Перепризначте їх в іншу групу.` });
    }
    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });
    logPerformance('DELETE /api/categories/:id', startTime);
    res.json({ message: 'Категорію видалено' });
  } catch (error) {
    console.error('[ERROR] DELETE /api/categories/:id:', error);
    logPerformance('DELETE /api/categories/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Міграція: прив'язати існуюче обладнання без categoryId до кореневих груп (за materialValueType)
app.post('/api/categories/migrate-equipment', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    await ensureRootCategories();
    const roots = await Category.find({ parentId: null }).lean();
    const rootEquipment = roots.find(r => r.itemKind === 'equipment');
    const rootParts = roots.find(r => r.itemKind === 'parts');
    if (!rootEquipment || !rootParts) {
      return res.status(500).json({ error: 'Кореневі категорії не знайдено' });
    }
    const withoutCategory = await Equipment.find({
      $or: [{ categoryId: null }, { categoryId: { $exists: false } }]
    }).select('_id materialValueType');
    let updated = 0;
    for (const eq of withoutCategory) {
      const isParts = ['service', 'electroinstall', 'internal'].includes(eq.materialValueType || '');
      const itemKind = isParts ? 'parts' : 'equipment';
      const categoryId = isParts ? rootParts._id : rootEquipment._id;
      await Equipment.updateOne(
        { _id: eq._id },
        { $set: { categoryId, itemKind } }
      );
      updated++;
    }
    logPerformance('POST /api/categories/migrate-equipment', startTime);
    res.json({ message: `Оновлено записів: ${updated}` });
  } catch (error) {
    console.error('[ERROR] POST /api/categories/migrate-equipment:', error);
    logPerformance('POST /api/categories/migrate-equipment', startTime);
    res.status(500).json({ error: error.message });
  }
});

/** Статуси залишку на складі — поки є такі одиниці, карточку продукту не видаляють */
const PRODUCT_CARD_STOCK_STATUSES = ['in_stock', 'reserved', 'pending_shipment', 'in_transit'];

function sanitizeProductCardTechnicalSpecs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      name: row?.name != null ? String(row.name).trim() : '',
      value: row?.value != null ? String(row.value).trim() : '',
    }))
    .filter((row) => row.name !== '' || row.value !== '');
}

function sanitizeProductCardAttachedFiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => ({
      cloudinaryUrl: f?.cloudinaryUrl != null ? String(f.cloudinaryUrl).trim() : '',
      cloudinaryId: f?.cloudinaryId != null ? String(f.cloudinaryId).trim() : '',
      originalName: f?.originalName != null ? String(f.originalName) : '',
      mimetype: f?.mimetype != null ? String(f.mimetype) : '',
      size: typeof f?.size === 'number' && !Number.isNaN(f.size) ? f.size : parseInt(f?.size, 10) || 0,
      uploadedAt: f?.uploadedAt ? new Date(f.uploadedAt) : new Date(),
    }))
    .filter((f) => f.cloudinaryUrl);
}

function sanitizeProductCardMaterialValueType(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  return ['service', 'electroinstall', 'internal'].includes(s) ? s : '';
}

function sanitizeProductCardDefaultReceiptMode(v) {
  return v === 'batch' ? 'batch' : 'single';
}

/** Об'єднує technicalSpecs з тіла запиту та з карточки продукту (унікальні пари назва+значення). */
function mergeEquipmentTechnicalSpecsPayload(equipmentData, card) {
  const fromBody = sanitizeProductCardTechnicalSpecs(equipmentData.technicalSpecs);
  const fromCard = card ? sanitizeProductCardTechnicalSpecs(card.technicalSpecs) : [];
  const seen = new Set();
  const out = [];
  for (const r of [...fromBody, ...fromCard]) {
    const k = `${String(r.name).toLowerCase()}|${String(r.value)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  equipmentData.technicalSpecs = out;
}

function mergeProductCardAttachedFilesIntoEquipmentPayload(equipmentData, card) {
  if (!card?.attachedFiles?.length) return;
  const fromCard = sanitizeProductCardAttachedFiles(card.attachedFiles);
  if (!fromCard.length) return;
  const existing = Array.isArray(equipmentData.attachedFiles) ? equipmentData.attachedFiles : [];
  const seen = new Set(
    existing.map((f) => (f.cloudinaryId && String(f.cloudinaryId)) || f.cloudinaryUrl).filter(Boolean),
  );
  const prefix = [];
  for (const f of fromCard) {
    const id = f.cloudinaryId || f.cloudinaryUrl;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    prefix.push(f);
  }
  equipmentData.attachedFiles = [...prefix, ...existing];
}

// Список карточок продукту (довідник номенклатури)
app.get('/api/product-cards', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const search = String(req.query.search || '').trim();
    const activeOnly = !['1', 'true'].includes(String(req.query.includeInactive || '').toLowerCase());
    const query = {};
    if (activeOnly) query.isActive = true;
    if (search) {
      const esc = escapeRegExpForRegion(search);
      query.$or = [
        { type: new RegExp(esc, 'i') },
        { manufacturer: new RegExp(esc, 'i') },
        { displayName: new RegExp(esc, 'i') },
        { 'technicalSpecs.name': new RegExp(esc, 'i') },
        { 'technicalSpecs.value': new RegExp(esc, 'i') },
      ];
    }
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const list = await ProductCard.find(query)
      .sort({ type: 1 })
      .limit(limit)
      .populate('categoryId', 'name itemKind')
      .lean();
    logPerformance('GET /api/product-cards', startTime, list.length);
    res.json(list);
  } catch (error) {
    console.error('[ERROR] GET /api/product-cards:', error);
    logPerformance('GET /api/product-cards', startTime);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-cards', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const {
      displayName,
      type,
      manufacturer,
      categoryId,
      itemKind,
      defaultBatchUnit,
      defaultCurrency,
      internalNotes,
      isActive,
      technicalSpecs,
      attachedFiles,
      materialValueType,
      defaultReceiptMode,
    } = req.body;
    if (!type || !String(type).trim()) {
      return res.status(400).json({ error: 'Поле «тип / найменування» обов\'язкове' });
    }
    const ik = ['equipment', 'parts'].includes(itemKind) ? itemKind : 'equipment';
    const doc = await ProductCard.create({
      displayName: displayName != null ? String(displayName).trim() : '',
      type: String(type).trim(),
      manufacturer: manufacturer != null ? String(manufacturer).trim() : '',
      categoryId: categoryId && mongoose.Types.ObjectId.isValid(String(categoryId)) ? categoryId : null,
      itemKind: ik,
      defaultBatchUnit: (defaultBatchUnit && String(defaultBatchUnit).trim()) || 'шт.',
      defaultCurrency: (defaultCurrency && String(defaultCurrency).trim()) || 'грн.',
      internalNotes: internalNotes != null ? String(internalNotes) : '',
      technicalSpecs: sanitizeProductCardTechnicalSpecs(technicalSpecs),
      attachedFiles: sanitizeProductCardAttachedFiles(attachedFiles),
      materialValueType: sanitizeProductCardMaterialValueType(materialValueType),
      defaultReceiptMode: sanitizeProductCardDefaultReceiptMode(defaultReceiptMode),
      isActive: isActive !== false,
      createdByLogin: req.user.login,
      createdByName: req.user.name || req.user.login,
    });
    const populated = await ProductCard.findById(doc._id).populate('categoryId', 'name itemKind').lean();
    logPerformance('POST /api/product-cards', startTime);
    res.status(201).json(populated);
  } catch (error) {
    console.error('[ERROR] POST /api/product-cards:', error);
    logPerformance('POST /api/product-cards', startTime);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/product-cards/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const b = req.body;
    const updates = {};
    if (b.displayName !== undefined) updates.displayName = String(b.displayName).trim();
    if (b.type !== undefined) {
      const t = String(b.type).trim();
      if (!t) return res.status(400).json({ error: 'Тип не може бути порожнім' });
      updates.type = t;
    }
    if (b.manufacturer !== undefined) updates.manufacturer = String(b.manufacturer).trim();
    if (b.categoryId !== undefined) {
      updates.categoryId = b.categoryId && mongoose.Types.ObjectId.isValid(String(b.categoryId)) ? b.categoryId : null;
    }
    if (b.itemKind !== undefined && ['equipment', 'parts'].includes(b.itemKind)) updates.itemKind = b.itemKind;
    if (b.defaultBatchUnit !== undefined) updates.defaultBatchUnit = String(b.defaultBatchUnit).trim() || 'шт.';
    if (b.defaultCurrency !== undefined) updates.defaultCurrency = String(b.defaultCurrency).trim() || 'грн.';
    if (b.internalNotes !== undefined) updates.internalNotes = String(b.internalNotes);
    if (b.isActive !== undefined) updates.isActive = !!b.isActive;
    if (b.technicalSpecs !== undefined) {
      updates.technicalSpecs = sanitizeProductCardTechnicalSpecs(b.technicalSpecs);
    }
    if (b.attachedFiles !== undefined) {
      updates.attachedFiles = sanitizeProductCardAttachedFiles(b.attachedFiles);
    }
    if (b.materialValueType !== undefined) {
      updates.materialValueType = sanitizeProductCardMaterialValueType(b.materialValueType);
    }
    if (b.defaultReceiptMode !== undefined) {
      updates.defaultReceiptMode = sanitizeProductCardDefaultReceiptMode(b.defaultReceiptMode);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Немає полів для оновлення' });
    }
    const doc = await ProductCard.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('categoryId', 'name itemKind')
      .lean();
    if (!doc) return res.status(404).json({ error: 'Карточку не знайдено' });
    logPerformance('PATCH /api/product-cards/:id', startTime);
    res.json(doc);
  } catch (error) {
    console.error('[ERROR] PATCH /api/product-cards/:id:', error);
    logPerformance('PATCH /api/product-cards/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/product-cards/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Некоректний id' });
    }
    const oid = new mongoose.Types.ObjectId(id);
    const agg = await Equipment.aggregate([
      {
        $match: {
          productId: oid,
          isDeleted: { $ne: true },
          status: { $in: PRODUCT_CARD_STOCK_STATUSES },
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$quantity', 1] } } } },
    ]);
    const total = agg[0]?.total || 0;
    if (total > 0) {
      return res.status(400).json({
        error: `Неможливо видалити: на складі є залишки за цією карточкою (${total} од. у статусах залишку).`,
      });
    }
    const del = await ProductCard.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ error: 'Карточку не знайдено' });
    logPerformance('DELETE /api/product-cards/:id', startTime);
    res.json({ message: 'Карточку видалено' });
  } catch (error) {
    console.error('[ERROR] DELETE /api/product-cards/:id:', error);
    logPerformance('DELETE /api/product-cards/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Асистент карточки продукту (Вікіпедія / заглушка) + імпорт зображення з Wikimedia у Cloudinary
app.post('/api/product-card-assistant/suggest', authenticateToken, async (req, res) => {
  try {
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const query = String(req.body?.query || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ error: 'Введіть мінімум 2 символи у «Тип / найменування»' });
    }
    const data = await productCardAssistantSuggest(query);
    res.json(data);
  } catch (error) {
    console.error('[ERROR] POST /api/product-card-assistant/suggest:', error);
    res.status(500).json({ error: error.message || 'Помилка асистента' });
  }
});

app.post('/api/product-card-assistant/import-image', authenticateToken, async (req, res) => {
  try {
    if (!['admin', 'administrator', 'warehouse', 'zavsklad'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const imageUrl = req.body?.imageUrl;
    const out = await productCardAssistantImportImage(imageUrl);
    res.json(out);
  } catch (error) {
    console.error('[ERROR] POST /api/product-card-assistant/import-image:', error);
    res.status(400).json({ error: error.message || 'Помилка імпорту зображення' });
  }
});

// Завантаження фото обладнання на Cloudinary
app.post('/api/equipment/upload-photo', authenticateToken, uploadEquipmentPhoto.single('photo'), async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Фото не було завантажено' });
    }

    const photoUrl = req.file.path || req.file.secure_url;
    const cloudinaryId = req.file.public_id;

    logPerformance('POST /api/equipment/upload-photo', startTime);
    res.json({
      photoUrl: photoUrl,
      cloudinaryId: cloudinaryId,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/upload-photo:', error);
    logPerformance('POST /api/equipment/upload-photo', startTime);
    res.status(500).json({ error: error.message });
  }
});

// OCR через Google Vision API
app.post('/api/equipment/ocr', authenticateToken, uploadEquipmentPhotoForOCR.single('image'), async (req, res) => {
  const startTime = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Зображення не було завантажено' });
    }

    // Використовуємо GOOGLE_GEOCODING_API_KEY (який вже налаштований) для Google Vision API
    // Fallback на ключ з фронтенду, якщо не встановлено в змінних середовища
    const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || 
                                   process.env.GOOGLE_GEOCODING_API_KEY ||
                                   'AIzaSyA7_dKy9VF9OsxsgmElpTTIYjTQ985IBxU'; // Fallback ключ (з фронтенду)
    
    // Детальне логування для діагностики
    console.log('[OCR] Перевірка Google API ключа:');
    console.log('[OCR] GOOGLE_VISION_API_KEY exists:', !!process.env.GOOGLE_VISION_API_KEY);
    console.log('[OCR] GOOGLE_GEOCODING_API_KEY exists:', !!process.env.GOOGLE_GEOCODING_API_KEY);
    console.log('[OCR] Використаний ключ exists:', !!GOOGLE_VISION_API_KEY);
    console.log('[OCR] Використаний ключ (перші 10 символів):', GOOGLE_VISION_API_KEY ? GOOGLE_VISION_API_KEY.substring(0, 10) + '...' : 'NOT SET');
    
    // Перевірка не потрібна, оскільки fallback ключ завжди встановлює значення
    const apiKeySource = process.env.GOOGLE_VISION_API_KEY ? 'GOOGLE_VISION_API_KEY' : 
                        (process.env.GOOGLE_GEOCODING_API_KEY ? 'GOOGLE_GEOCODING_API_KEY' : 'fallback (hardcoded)');
    console.log(`[OCR] Використовується Google Vision API для розпізнавання тексту (ключ з ${apiKeySource})`);

    // Отримуємо base64 зображення з buffer (multer.memoryStorage зберігає в req.file.buffer)
    if (!req.file || !req.file.buffer) {
      throw new Error('Зображення не було завантажено або не вдалося прочитати');
    }
    
    const base64Image = req.file.buffer.toString('base64');
    console.log(`[OCR] Розмір base64 зображення: ${base64Image.length} символів`);
    
    // Перевірка розміру (Google Vision API має обмеження ~20MB для base64)
    if (base64Image.length > 20 * 1024 * 1024) {
      console.warn('[OCR] Зображення занадто велике для Google Vision API, використовуємо Tesseract');
      return res.status(400).json({ error: 'Зображення занадто велике', useTesseract: true });
    }

    // Використовуємо Google Vision API через REST з base64
    try {
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  content: base64Image
                },
                features: [
                  {
                    type: 'TEXT_DETECTION',
                    maxResults: 10
                  }
                ],
                imageContext: {
                  languageHints: ['uk', 'en', 'ru'] // Підказки мов для кращого розпізнавання
                }
              }
            ]
          })
        }
      );

      if (!visionResponse.ok) {
        const errorData = await visionResponse.json().catch(() => ({ error: { message: 'Невідома помилка' } }));
        console.error('[OCR] Помилка Google Vision API:', visionResponse.status);
        console.error('[OCR] Деталі помилки:', JSON.stringify(errorData, null, 2));
        
        // Спеціальна обробка для різних типів помилок
        let errorMessage = errorData.error?.message || `Помилка Google Vision API: ${visionResponse.status}`;
        let detailedError = '';
        
        if (visionResponse.status === 403) {
          // Детальна інформація про помилку 403
          const errorReason = errorData.error?.message || 'Невідома причина';
          console.warn('[OCR] 403 Forbidden - Деталі:', errorReason);
          
          if (errorReason.includes('API key not valid') || errorReason.includes('API key not found')) {
            errorMessage = 'API ключ недійсний або не знайдено. Перевірте правильність ключа.';
            detailedError = 'Переконайтеся, що API ключ правильний і активний в Google Cloud Console.';
          } else if (errorReason.includes('API has not been used') || errorReason.includes('API not enabled')) {
            errorMessage = 'Cloud Vision API не увімкнено для цього проєкту або ключа.';
            detailedError = '1. Перевірте, що Cloud Vision API увімкнено в проєкті.\n2. Перевірте обмеження API ключа - він повинен дозволяти використання Vision API.\n3. Переконайтеся, що ключ створено в правильному проєкті.';
          } else if (errorReason.includes('permission denied') || errorReason.includes('forbidden')) {
            errorMessage = 'Доступ заборонено. API ключ не має дозволів для Vision API.';
            detailedError = 'Перевірте обмеження API ключа в Google Cloud Console:\n1. Відкрийте "APIs & Services" → "Credentials"\n2. Виберіть ваш API ключ\n3. В розділі "API restrictions" переконайтеся, що "Cloud Vision API" дозволено\n4. Або встановіть "Don\'t restrict key" для тестування';
          } else {
            errorMessage = `Google Vision API недоступний: ${errorReason}`;
            detailedError = 'Перевірте налаштування API ключа в Google Cloud Console.';
          }
          
          console.warn('[OCR] 403 Forbidden - Рекомендації:', detailedError);
        } else if (visionResponse.status === 400) {
          errorMessage = 'Невірний запит до Google Vision API. Використовується Tesseract OCR.';
        } else if (visionResponse.status === 500) {
          errorMessage = 'Тимчасова проблема з Google Vision API. Використовується Tesseract OCR.';
        }
        
        // В усіх випадках помилок повертаємо useTesseract: true для fallback
        return res.status(visionResponse.status).json({ 
          error: errorMessage,
          details: detailedError || undefined,
          useTesseract: true,
          status: visionResponse.status,
          googleError: errorData.error || undefined
        });
      }

      const result = await visionResponse.json();
      const text = result.responses?.[0]?.fullTextAnnotation?.text || 
                    result.responses?.[0]?.textAnnotations?.[0]?.description || '';
      
      console.log(`[OCR] Розпізнано текст довжиною: ${text.length} символів`);
      
      logPerformance('POST /api/equipment/ocr', startTime);
      res.json({ text });
    } catch (visionError) {
      // Якщо помилка мережі або інша помилка - повертаємо помилку для fallback на Tesseract
      console.error('[OCR] Помилка запиту до Google Vision API:', visionError);
      return res.status(500).json({ 
        error: visionError.message || 'Помилка з\'єднання з Google Vision API',
        useTesseract: true 
      });
    }
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/ocr:', error);
    logPerformance('POST /api/equipment/ocr', startTime);
    res.status(500).json({ error: error.message || 'Помилка розпізнавання тексту' });
  }
});

// Сканування та додавання обладнання
app.post('/api/equipment/scan', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    let equipmentData = { ...req.body };
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const targetWh = equipmentData.currentWarehouse;
      if (!targetWh || String(targetWh).trim() === '') {
        return res.status(400).json({
          error: 'Оберіть склад надходження вашого регіону (поле currentWarehouse).'
        });
      }
      const okWh = await ensureWarehouseStaffWarehouseIdAllowed(
        res,
        req.user,
        user,
        targetWh,
        'Надходження дозволене лише на склад вашого регіону.'
      );
      if (!okWh) return;
    }

    if (equipmentData.productId && mongoose.Types.ObjectId.isValid(String(equipmentData.productId))) {
      const card = await ProductCard.findById(equipmentData.productId).lean();
      if (!card) {
        return res.status(400).json({ error: 'Карточку продукту не знайдено' });
      }
      if (!card.isActive) {
        return res.status(400).json({ error: 'Карточка продукту неактивна' });
      }
      if (!equipmentData.type || !String(equipmentData.type).trim()) {
        equipmentData.type = card.type;
      }
      if (equipmentData.manufacturer == null || String(equipmentData.manufacturer).trim() === '') {
        equipmentData.manufacturer = card.manufacturer || '';
      }
      if (!equipmentData.categoryId && card.categoryId) {
        equipmentData.categoryId = card.categoryId.toString();
      }
      if (!equipmentData.itemKind || !['equipment', 'parts'].includes(equipmentData.itemKind)) {
        equipmentData.itemKind = card.itemKind;
      }
      if (equipmentData.isBatch === true && (!equipmentData.batchUnit || !String(equipmentData.batchUnit).trim())) {
        equipmentData.batchUnit = card.defaultBatchUnit || 'шт.';
      }
      if (!equipmentData.currency || !String(equipmentData.currency).trim()) {
        equipmentData.currency = card.defaultCurrency || 'грн.';
      }
      const mvt = sanitizeProductCardMaterialValueType(card.materialValueType);
      if (mvt && (equipmentData.materialValueType == null || equipmentData.materialValueType === '')) {
        equipmentData.materialValueType = mvt;
      }
      if (
        (card.defaultReceiptMode === 'batch' || card.defaultReceiptMode === 'single') &&
        !Object.prototype.hasOwnProperty.call(req.body, 'isBatch')
      ) {
        equipmentData.isBatch = card.defaultReceiptMode === 'batch';
      }
      mergeEquipmentTechnicalSpecsPayload(equipmentData, card);
      mergeProductCardAttachedFilesIntoEquipmentPayload(equipmentData, card);
    } else {
      equipmentData.technicalSpecs = sanitizeProductCardTechnicalSpecs(equipmentData.technicalSpecs);
    }

    const isBatch = equipmentData.isBatch === true;
    const quantity = isBatch ? (parseInt(equipmentData.quantity) || 1) : 1;
    const hasSerialNumber = equipmentData.serialNumber && equipmentData.serialNumber.trim() !== '';

    // Визначаємо склад та регіон
    const warehouse = equipmentData.currentWarehouse || user.region;
    const warehouseName = equipmentData.currentWarehouseName || user.region;
    const region = equipmentData.region || user.region;
    
    // Валідація для одиничного обладнання (з серійним номером)
    if (!isBatch) {
      if (!equipmentData.type || !hasSerialNumber) {
        return res.status(400).json({ 
          error: 'Тип обладнання та серійний номер обов\'язкові для одиничного обладнання'
        });
      }
      
      // Перевірка на дублікат
      const existing = await Equipment.findOne({ 
        type: equipmentData.type,
        serialNumber: equipmentData.serialNumber
      });
      if (existing) {
        return res.status(400).json({ 
          error: 'Обладнання з таким типом та серійним номером вже існує.',
          existing: {
            type: existing.type,
            serialNumber: existing.serialNumber,
            currentWarehouse: existing.currentWarehouseName,
            id: existing._id
          }
        });
      }
    } else {
      // Валідація для партії (без серійного номера)
      if (!equipmentData.type) {
        return res.status(400).json({ 
          error: 'Тип обладнання обов\'язковий для партії'
        });
      }
      if (!equipmentData.batchUnit) {
        return res.status(400).json({ 
          error: 'Одиниця виміру обов\'язкова'
        });
      }
      if (quantity < 1) {
        return res.status(400).json({ 
          error: 'Кількість повинна бути більше 0'
        });
      }
    }
    
    // Валідація одиниці виміру для одиничного обладнання
    if (!isBatch && !equipmentData.batchUnit) {
      return res.status(400).json({ 
        error: 'Одиниця виміру обов\'язкова'
      });
    }

    if (
      equipmentData.productId != null &&
      equipmentData.productId !== '' &&
      !mongoose.Types.ObjectId.isValid(String(equipmentData.productId))
    ) {
      return res.status(400).json({ error: 'Некоректний ідентифікатор карточки продукту' });
    }
    
    // Створення обладнання
    const createdEquipment = [];
    let updatedEquipment = null;
    
    if (isBatch) {
      // Для обладнання без серійного номера: перевіряємо чи існує ідентичне обладнання
      // Шукаємо обладнання з такими ж параметрами: type, manufacturer, currentWarehouse, region, без serialNumber
      const manufacturerValue = equipmentData.manufacturer && equipmentData.manufacturer.trim() !== '' 
        ? equipmentData.manufacturer.trim() 
        : null;
      
      // Будуємо запит для пошуку ідентичного обладнання
      const searchQuery = {
        currentWarehouse: warehouse,
        region: region,
        status: { $ne: 'deleted' },
        $and: [
          {
            $or: [
              { serialNumber: null },
              { serialNumber: { $exists: false } },
              { serialNumber: '' }
            ]
          }
        ]
      };

      const mergeByProductCard =
        equipmentData.productId && mongoose.Types.ObjectId.isValid(String(equipmentData.productId));
      if (mergeByProductCard) {
        searchQuery.productId = new mongoose.Types.ObjectId(String(equipmentData.productId));
      } else {
        searchQuery.type = equipmentData.type;
        if (manufacturerValue) {
          searchQuery.manufacturer = manufacturerValue;
        } else {
          searchQuery.$and.push({
            $or: [
              { manufacturer: null },
              { manufacturer: { $exists: false } },
              { manufacturer: '' }
            ]
          });
        }
      }
      
      const existingEquipment = await Equipment.findOne(searchQuery);
      
      if (existingEquipment) {
        // Знайдено ідентичне обладнання - збільшуємо кількість
        existingEquipment.quantity = (existingEquipment.quantity || 1) + quantity;
        existingEquipment.lastModified = new Date();
        await existingEquipment.save();
        updatedEquipment = existingEquipment;
        createdEquipment.push(existingEquipment);
      } else {
        // Не знайдено - створюємо новий запис з quantity (БЕЗ batchId та batchIndex)
        const { serialNumber, ...batchEquipmentData } = equipmentData;
        
        // Очищаємо null значення для числових полів (замість null не встановлюємо поле)
        const cleanedData = {};
        Object.keys(batchEquipmentData).forEach(key => {
          const value = batchEquipmentData[key];
          // Пропускаємо batchId та batchIndex - не встановлюємо їх
          if (['batchId', 'batchIndex'].includes(key)) {
            return;
          }
          // Для числових полів не встановлюємо null, пропускаємо поле
          if (['phase', 'amperage', 'rpm', 'frequency', 'weight', 'cosPhi'].includes(key)) {
            if (value !== null && value !== undefined && value !== '') {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                cleanedData[key] = numValue;
              }
            }
          } else if (value !== null && value !== undefined) {
            // Для інших полів пропускаємо null та undefined
            cleanedData[key] = value === '' ? undefined : value;
          }
        });
        
        const equipment = await Equipment.create({
          ...cleanedData,
          isBatch: false, // Не партія, просто обладнання без серійного номера
          quantity: quantity, // Вся кількість в одному записі
          categoryId: equipmentData.categoryId || null,
          itemKind: ['equipment', 'parts'].includes(equipmentData.itemKind) ? equipmentData.itemKind : 'equipment',
          addedBy: user._id.toString(),
          addedByName: user.name || user.login,
          currentWarehouse: warehouse,
          currentWarehouseName: warehouseName,
          region: region
        });
        createdEquipment.push(equipment);
      }
    } else {
      // Створюємо один запис для одиничного обладнання (з серійним номером)
      // Очищаємо null значення для числових полів
      const cleanedData = {};
      Object.keys(equipmentData).forEach(key => {
        const value = equipmentData[key];
        // Пропускаємо batchId та batchIndex - не встановлюємо їх
        if (['batchId', 'batchIndex'].includes(key)) {
          return;
        }
        // Для числових полів не встановлюємо null, пропускаємо поле
        if (['phase', 'amperage', 'rpm', 'frequency', 'weight', 'cosPhi'].includes(key)) {
          if (value !== null && value !== undefined && value !== '') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              cleanedData[key] = numValue;
            }
          }
        } else if (value !== null && value !== undefined) {
          // Для інших полів пропускаємо null та undefined
          cleanedData[key] = value === '' ? undefined : value;
        }
      });
      
      const equipment = await Equipment.create({
        ...cleanedData,
        isBatch: false,
        quantity: 1,
        categoryId: equipmentData.categoryId || null,
        itemKind: ['equipment', 'parts'].includes(equipmentData.itemKind) ? equipmentData.itemKind : 'equipment',
        addedBy: user._id.toString(),
        addedByName: user.name || user.login,
        currentWarehouse: warehouse,
        currentWarehouseName: warehouseName,
        region: region
      });
      createdEquipment.push(equipment);
    }
    
    // Логування події
    try {
      let description;
      let action = 'create';
      
      if (isBatch) {
        if (updatedEquipment) {
          // Обладнання оновлено (збільшено кількість)
          description = `Збільшено кількість обладнання ${equipmentData.type} на ${quantity} шт. (всього: ${updatedEquipment.quantity}) на складі ${warehouseName}`;
          action = 'update';
        } else {
          // Створено нове обладнання без серійного номера
          description = `Додано обладнання ${equipmentData.type} (${quantity} шт.) на склад ${warehouseName}`;
        }
      } else {
        description = `Додано обладнання ${equipmentData.type} (№${equipmentData.serialNumber}) на склад ${warehouseName}`;
      }
      
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: action,
        entityType: 'equipment',
        entityId: createdEquipment[0]._id.toString(),
        description: description,
        details: { ...equipmentData, quantity: isBatch ? quantity : 1, updated: !!updatedEquipment }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    try {
      if (updatedEquipment) {
        await logInventoryMovement({
          eventType: 'goods_receipt',
          performedByLogin: user.login,
          performedByName: user.name || user.login,
          equipmentId: updatedEquipment._id,
          equipmentType: updatedEquipment.type,
          serialNumber: updatedEquipment.serialNumber,
          quantity,
          fromStatus: updatedEquipment.status || 'in_stock',
          toStatus: updatedEquipment.status || 'in_stock',
          destinationWarehouseName: warehouseName,
          notes: `Надходження: +${quantity} од., загалом ${updatedEquipment.quantity}`
        });
      } else if (createdEquipment.length > 0) {
        const eq = createdEquipment[0];
        const q = isBatch ? quantity : 1;
        await logInventoryMovement({
          eventType: 'goods_receipt',
          performedByLogin: user.login,
          performedByName: user.name || user.login,
          equipmentId: eq._id,
          equipmentType: eq.type,
          serialNumber: eq.serialNumber,
          quantity: q,
          toStatus: eq.status || 'in_stock',
          destinationWarehouseName: warehouseName,
          notes: isBatch ? `Надходження на склад (${q} од.)` : 'Надходження на склад (скан)'
        });
      }
    } catch (journalErr) {
      console.error('Помилка журналу goods_receipt (scan):', journalErr);
    }
    
    logPerformance('POST /api/equipment/scan', startTime);
    
    // Формуємо відповідь
    if (isBatch) {
      if (updatedEquipment) {
        // Обладнання оновлено
        res.status(200).json({ 
          updated: true,
          equipment: updatedEquipment,
          addedQuantity: quantity,
          totalQuantity: updatedEquipment.quantity
        });
      } else {
        // Створено нове обладнання
        res.status(201).json({ 
          created: true,
          equipment: createdEquipment[0],
          quantity: quantity
        });
      }
    } else {
      res.status(201).json(createdEquipment[0]);
    }
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/scan:', error);
    logPerformance('POST /api/equipment/scan', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Імпорт залишків з Excel (звіт 1С «Анализ доступности товаров на складах»)
const { runStockImport } = require('./lib/stockXlsxImport');
app.post('/api/equipment/import-stock-xlsx', uploadStockXlsx.single('file'), async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено (потрібна роль admin)' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Файл не завантажено (поле file, формат .xlsx)' });
    }
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || req.body?.dryRun === true;
    const targetWarehouseId = req.body?.targetWarehouseId;
    const nomenclatureCategoryMapFromDb = await loadStockImportNomenclatureMap();
    const summary = await runStockImport({
      Equipment,
      Category,
      Warehouse,
      EventLog,
      buffer: req.file.buffer,
      adminUser: {
        _id: user._id,
        login: user.login,
        name: user.name,
        role: user.role,
      },
      dryRun,
      targetWarehouseId,
      nomenclatureCategoryMapFromDb,
    });

    // Після успішного імпорту: автоматично додати в БД точні пари «назва з Excel → categoryId»
    // лише для ключів, яких ще немає (ручні зіставлення не перезаписуються).
    if (!dryRun && summary.learnedNomenclatureFromImport && typeof summary.learnedNomenclatureFromImport === 'object') {
      const learned = summary.learnedNomenclatureFromImport;
      const keys = Object.keys(learned).filter((k) => k && learned[k]);
      if (keys.length > 0) {
        try {
          const current = await loadStockImportNomenclatureMap();
          const merged = { ...current };
          let added = 0;
          for (const nome of keys) {
            const id = String(learned[nome]).trim();
            if (!id) continue;
            if (Object.prototype.hasOwnProperty.call(merged, nome)) continue;
            merged[nome] = id;
            added++;
          }
          if (added > 0) {
            await StockImportNomenclature.updateOne(
              { _id: STOCK_IMPORT_NOMENCLATURE_DOC_ID },
              { $set: { nomenclatureCategoryMap: merged } },
              { upsert: true },
            );
            summary.nomenclatureAutoLearned = { added, totalKeysInDb: Object.keys(merged).length };
          } else {
            summary.nomenclatureAutoLearned = { added: 0, totalKeysInDb: Object.keys(current).length };
          }
        } catch (learnErr) {
          console.warn('[import-stock-xlsx] auto-learn nomenclature:', learnErr.message);
          summary.nomenclatureAutoLearned = { error: learnErr.message };
        }
      }
    }

    logPerformance('POST /api/equipment/import-stock-xlsx', startTime);
    res.json(summary);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/import-stock-xlsx:', error);
    logPerformance('POST /api/equipment/import-stock-xlsx', startTime);
    res.status(400).json({ error: error.message });
  }
});

// Зберегти точні відповідності «назва з Excel → categoryId» у MongoDB (персистентно; файл у repo лише дефолти)
app.post('/api/equipment/stock-import-nomenclature-map', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!['admin', 'administrator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    const map = req.body?.nomenclatureCategoryMap;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return res.status(400).json({
        error: 'Очікується JSON: { nomenclatureCategoryMap: { "рядок з Excel": "mongoCategoryId" } }',
      });
    }
    const cleaned = {};
    for (const [k, v] of Object.entries(map)) {
      const nome = String(k).trim();
      if (!nome) continue;
      const id = String(v).trim();
      if (!id) continue;
      cleaned[nome] = id;
    }
    if (Object.keys(cleaned).length === 0) {
      return res.status(400).json({ error: 'Немає жодної пари з непорожнім categoryId' });
    }
    const current = await loadStockImportNomenclatureMap();
    const merged = { ...current, ...cleaned };
    await StockImportNomenclature.updateOne(
      { _id: STOCK_IMPORT_NOMENCLATURE_DOC_ID },
      { $set: { nomenclatureCategoryMap: merged } },
      { upsert: true },
    );
    logPerformance('POST /api/equipment/stock-import-nomenclature-map', startTime);
    res.json({
      ok: true,
      savedCount: Object.keys(cleaned).length,
      storage: 'mongodb',
      collection: 'stockimport_nomenclature_maps',
      totalKeys: Object.keys(merged).length,
    });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/stock-import-nomenclature-map:', error);
    logPerformance('POST /api/equipment/stock-import-nomenclature-map', startTime);
    res.status(500).json({ error: error.message });
  }
});

/** Екранування для безпечного використання рядка користувача в MongoDB $regex */
function escapeRegexForMongo(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Допоміжна: зібрати id усіх нащадків категорії (включно з id)
async function getCategoryDescendantIds(categoryId) {
  const ids = [typeof categoryId === 'string' ? new mongoose.Types.ObjectId(categoryId) : categoryId];
  let level = [ids[0]];
  while (level.length) {
    const children = await Category.find({ parentId: { $in: level } }).select('_id').lean();
    const childIds = children.map(c => c._id);
    ids.push(...childIds);
    level = childIds;
  }
  return ids;
}

/** Дерево категорій лише з гілок, де є прапорець visibleToManagers (або він є у нащадка). */
function filterCategoryTreeForManagers(nodes) {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const node of nodes) {
    const children = filterCategoryTreeForManagers(node.children || []);
    const self = node.visibleToManagers === true;
    if (self || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}

/**
 * Якщо хоча б одна категорія з visibleToManagers — усі дозволені id (категорія + нащадки).
 * Якщо жодної — null (обмежень немає, поведінка як раніше).
 */
async function getManagerEquipmentCategoryFilterIds() {
  const seeds = await Category.find({ visibleToManagers: true }).select('_id').lean();
  if (!seeds.length) return null;
  const merged = new Map();
  for (const s of seeds) {
    const desc = await getCategoryDescendantIds(s._id);
    desc.forEach((id) => merged.set(id.toString(), id));
  }
  return Array.from(merged.values());
}

// Отримання списку обладнання
app.get('/api/equipment', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, status, region, search, categoryId, itemKind, includeSubtree, managerCategoryContext } = req.query;
    const query = { isDeleted: { $ne: true } }; // Виключаємо видалене обладнання (для ефективного індексу)
    
    if (warehouse) {
      query.currentWarehouse = warehouse;
    } else {
      const cwMulti = req.query.currentWarehouses;
      if (cwMulti != null && String(cwMulti).trim()) {
        const parts = String(cwMulti)
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const oids = parts
          .filter((id) => mongoose.isValidObjectId(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        if (oids.length) query.currentWarehouse = { $in: oids };
      }
    }
    if (status) query.status = status;
    if (region) query.region = region;
    if (itemKind && ['equipment', 'parts'].includes(itemKind)) query.itemKind = itemKind;

    let subtreeIds = null;
    if (categoryId) {
      if (includeSubtree === 'true') {
        subtreeIds = await getCategoryDescendantIds(categoryId);
      } else {
        subtreeIds = [typeof categoryId === 'string' ? new mongoose.Types.ObjectId(categoryId) : categoryId];
      }
    }

    const roleLc = (req.user.role || '').toLowerCase();
    const isManagerStockRole = ['manager', 'mgradm'].includes(roleLc);
    const managerCtx = ['1', 'true'].includes(String(managerCategoryContext || '').toLowerCase());
    const applyManagerCategoryFilter = isManagerStockRole || managerCtx;

    let managerAllowedIds = null;
    if (applyManagerCategoryFilter) {
      managerAllowedIds = await getManagerEquipmentCategoryFilterIds();
    }

    if (applyManagerCategoryFilter && managerAllowedIds && managerAllowedIds.length > 0) {
      const allowedSet = new Set(managerAllowedIds.map((id) => id.toString()));
      if (subtreeIds) {
        const filtered = subtreeIds.filter((id) => allowedSet.has(id.toString()));
        query.categoryId = filtered.length ? { $in: filtered } : { $in: [] };
      } else {
        query.categoryId = { $in: managerAllowedIds };
      }
    } else if (subtreeIds) {
      query.categoryId = subtreeIds.length === 1 && includeSubtree !== 'true'
        ? subtreeIds[0]
        : { $in: subtreeIds };
    }

    if (search && String(search).trim()) {
      const safe = escapeRegexForMongo(String(search).trim());
      query.$or = [
        { serialNumber: { $regex: safe, $options: 'i' } },
        { type: { $regex: safe, $options: 'i' } },
        { manufacturer: { $regex: safe, $options: 'i' } },
      ];
    }
    
    const equipment = await Equipment.find(query)
      .sort({ addedAt: -1 })
      .lean();
    
    logPerformance('GET /api/equipment', startTime, equipment.length);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment:', error);
    logPerformance('GET /api/equipment', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Статистика по складах (має бути ПЕРЕД /api/equipment/:id, щоб не конфліктувати)
app.get('/api/equipment/statistics', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, region } = req.query;
    
    const matchQuery = { isDeleted: { $ne: true } }; // Виключаємо видалені
    if (warehouse) matchQuery.currentWarehouse = warehouse;
    if (region) matchQuery.region = region;
    
    // Загальна статистика
    const total = await Equipment.countDocuments(matchQuery);
    
    // Статистика по статусах (з обробкою null)
    const byStatus = await Equipment.aggregate([
      { $match: matchQuery },
      { 
        $group: { 
          _id: { $ifNull: ['$status', 'in_stock'] }, // Якщо status null, використовуємо 'in_stock'
          count: { $sum: 1 } 
        } 
      }
    ]);
    
    // Статистика по складах (з обробкою null)
    const byWarehouse = await Equipment.aggregate([
      { $match: matchQuery },
      { 
        $group: { 
          _id: { $ifNull: ['$currentWarehouseName', 'Не вказано'] },
          count: { $sum: 1 },
          statuses: {
            $push: { $ifNull: ['$status', 'in_stock'] }
          }
        }
      },
      {
        $project: {
          warehouse: '$_id',
          total: '$count',
          inStock: {
            $size: {
              $filter: {
                input: '$statuses',
                as: 'status',
                cond: { $eq: ['$$status', 'in_stock'] }
              }
            }
          },
          inTransit: {
            $size: {
              $filter: {
                input: '$statuses',
                as: 'status',
                cond: { $eq: ['$$status', 'in_transit'] }
              }
            }
          },
          shipped: {
            $size: {
              $filter: {
                input: '$statuses',
                as: 'status',
                cond: { $eq: ['$$status', 'shipped'] }
              }
            }
          }
        }
      },
      { $sort: { total: -1 } }
    ]);
    
    // Статистика по типах обладнання (з обробкою null)
    const byType = await Equipment.aggregate([
      { $match: matchQuery },
      { 
        $group: { 
          _id: { $ifNull: ['$type', 'Не вказано'] },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Останні додані (з обробкою null для addedAt)
    const recentlyAdded = await Equipment.find(matchQuery)
      .sort({ addedAt: -1, _id: -1 }) // Сортуємо також по _id якщо addedAt однаковий
      .limit(10)
      .select('type serialNumber currentWarehouseName addedAt addedByName _id')
      .lean();
    
    // Обробляємо recentlyAdded для безпечного відображення
    const processedRecentlyAdded = recentlyAdded.map(item => ({
      ...item,
      type: item.type || 'Не вказано',
      serialNumber: item.serialNumber || '—',
      currentWarehouseName: item.currentWarehouseName || 'Не вказано',
      addedAt: item.addedAt || new Date(), // Якщо addedAt відсутнє, використовуємо поточну дату
      addedByName: item.addedByName || '—'
    }));
    
    const statistics = {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id || 'in_stock'] = item.count;
        return acc;
      }, {}),
      byWarehouse,
      byType,
      recentlyAdded: processedRecentlyAdded
    };
    
    logPerformance('GET /api/equipment/statistics', startTime);
    res.json(statistics);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/statistics:', error);
    logPerformance('GET /api/equipment/statistics', startTime);
    res.status(500).json({ error: error.message || 'Помилка завантаження статистики' });
  }
});

// ============================================
// ІСТОРІЯ РЕЗЕРВУВАНЬ - GET запит (має бути ПЕРЕД /:id)
// ============================================
// Обладнання для продажу: тільки вільне (in_stock) або зарезервоване цим користувачем
app.get('/api/equipment/for-sale', authenticateToken, async (req, res) => {
  try {
    const login = req.user?.login || '';
    const query = {
      isDeleted: { $ne: true },
      status: { $nin: ['deleted', 'shipped', 'sold'] },
      $or: [
        { status: 'in_stock' },
        { status: 'reserved', reservedByLogin: login }
      ]
    };
    const equipment = await Equipment.find(query).sort({ addedAt: -1 }).lean();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(equipment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/equipment/reservation-history', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    // Знаходимо все обладнання з історією резервувань
    const equipment = await Equipment.find({
      'reservationHistory.0': { $exists: true }
    })
    .select('type serialNumber manufacturer currentWarehouseName reservationHistory')
    .lean();
    
    // Збираємо всі записи історії в один масив
    const allHistory = [];
    
    for (const eq of equipment) {
      if (eq.reservationHistory && eq.reservationHistory.length > 0) {
        for (const record of eq.reservationHistory) {
          allHistory.push({
            ...record,
            equipmentId: eq._id,
            equipmentType: eq.type,
            equipmentSerial: eq.serialNumber,
            equipmentManufacturer: eq.manufacturer,
            equipmentWarehouse: eq.currentWarehouseName
          });
        }
      }
    }
    
    // Сортуємо за датою (найновіші спочатку)
    allHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    logPerformance('GET /api/equipment/reservation-history', startTime, allHistory.length);
    res.json(allHistory);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/reservation-history:', error);
    logPerformance('GET /api/equipment/reservation-history', startTime);
    res.status(500).json({ error: error.message });
  }
});

/** Активний тест не має «висіти», якщо позицію знято зі складу (видалено, списано, відвантажено повністю). */
function clearActiveEquipmentTesting(equipment) {
  if (equipment.testingStatus === 'requested' || equipment.testingStatus === 'in_progress') {
    equipment.testingStatus = 'none';
  }
}

// ============================================
// ТЕСТУВАННЯ ОБЛАДНАННЯ - GET запит (має бути ПЕРЕД /:id)
// ============================================
app.get('/api/equipment/testing-requests', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { status } = req.query;
    
    // Якщо status містить кому - це масив статусів
    let statusArray = ['requested', 'in_progress'];
    if (status) {
      statusArray = status.includes(',') ? status.split(',') : [status];
    }
    
    const filter = {
      testingStatus: { $in: statusArray },
      isDeleted: { $ne: true },
      status: { $nin: ['deleted', 'written_off'] }
    };
    
    const equipment = await Equipment.find(filter)
      .sort({ testingRequestedAt: -1 })
      .lean();
    
    console.log('[DEBUG] GET /api/equipment/testing-requests:', { status, statusArray, found: equipment.length });
    logPerformance('GET /api/equipment/testing-requests', startTime, equipment.length);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/testing-requests:', error);
    logPerformance('GET /api/equipment/testing-requests', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання деталей обладнання
app.get('/api/equipment/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const equipment = await Equipment.findById(req.params.id)
      .populate(
        'productId',
        'type manufacturer displayName itemKind isActive technicalSpecs attachedFiles materialValueType defaultReceiptMode categoryId',
      )
      .lean();
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }
    logPerformance('GET /api/equipment/:id', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/:id:', error);
    logPerformance('GET /api/equipment/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення обладнання
app.put('/api/equipment/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[PUT] /api/equipment/:id - Оновлення обладнання:', req.params.id);
  console.log('[PUT] Дані для оновлення:', req.body);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      console.log('[PUT] Обладнання не знайдено:', req.params.id);
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const okPut = await ensureWarehouseStaffEquipmentAccess(res, req.user, user, equipment);
    if (!okPut) return;

    // Оновлюємо поля
    const changes = [];
    
    // Основні поля
    const basicFields = [
      'manufacturer', 'type', 'serialNumber', 'currentWarehouse', 'currentWarehouseName',
      'region', 'standbyPower', 'primePower', 'voltage', 'dimensions', 'weight', 'manufactureDate'
    ];
    
    basicFields.forEach(field => {
      if (req.body[field] !== undefined) {
        const oldValue = equipment[field];
        equipment[field] = req.body[field] === null || req.body[field] === '' ? undefined : req.body[field];
        if (oldValue !== equipment[field]) {
          changes.push(`${field}: ${oldValue} -> ${equipment[field]}`);
        }
      }
    });
    
    // Спеціальна обробка для phases (в схемі phase)
    if (req.body.phases !== undefined) {
      const oldValue = equipment.phase;
      const newValue = req.body.phases === null || req.body.phases === '' ? undefined : req.body.phases;
      // Спробуємо конвертувати в число, якщо можливо
      if (newValue !== undefined && !isNaN(newValue)) {
        equipment.phase = Number(newValue);
      } else if (newValue !== undefined) {
        equipment.phase = newValue;
      } else {
        equipment.phase = undefined;
      }
      if (oldValue !== equipment.phase) {
        changes.push(`phase: ${oldValue} -> ${equipment.phase}`);
      }
    }
    
    // Спеціальна обробка для current (в схемі amperage)
    if (req.body.current !== undefined) {
      const oldValue = equipment.amperage;
      const newValue = req.body.current === null || req.body.current === '' ? undefined : req.body.current;
      // Спробуємо конвертувати в число, якщо можливо
      if (newValue !== undefined && !isNaN(newValue)) {
        equipment.amperage = Number(newValue);
      } else if (newValue !== undefined) {
        equipment.amperage = newValue;
      } else {
        equipment.amperage = undefined;
      }
      if (oldValue !== equipment.amperage) {
        changes.push(`amperage: ${oldValue} -> ${equipment.amperage}`);
      }
    }
    
    // Обробка rpm (число)
    if (req.body.rpm !== undefined) {
      const oldValue = equipment.rpm;
      const newValue = req.body.rpm === null || req.body.rpm === '' ? undefined : req.body.rpm;
      if (newValue !== undefined && !isNaN(newValue)) {
        equipment.rpm = Number(newValue);
      } else if (newValue !== undefined) {
        equipment.rpm = newValue;
      } else {
        equipment.rpm = undefined;
      }
      if (oldValue !== equipment.rpm) {
        changes.push(`rpm: ${oldValue} -> ${equipment.rpm}`);
      }
    }
    
    // Обробка weight (число)
    if (req.body.weight !== undefined) {
      const oldValue = equipment.weight;
      const newValue = req.body.weight === null || req.body.weight === '' ? undefined : req.body.weight;
      if (newValue !== undefined && !isNaN(newValue)) {
        equipment.weight = Number(newValue);
      } else if (newValue !== undefined) {
        equipment.weight = newValue;
      } else {
        equipment.weight = undefined;
      }
      if (oldValue !== equipment.weight) {
        changes.push(`weight: ${oldValue} -> ${equipment.weight}`);
      }
    }

    if (req.body.phase !== undefined) {
      const newValue = req.body.phase === null || req.body.phase === '' ? undefined : req.body.phase;
      if (newValue !== undefined && !isNaN(newValue)) {
        equipment.phase = Number(newValue);
      } else if (newValue !== undefined) {
        equipment.phase = newValue;
      } else {
        equipment.phase = undefined;
      }
    }
    if (req.body.amperage !== undefined) {
      const newValue = req.body.amperage === null || req.body.amperage === '' ? undefined : req.body.amperage;
      if (newValue !== undefined && !isNaN(newValue)) {
        equipment.amperage = Number(newValue);
      } else if (newValue !== undefined) {
        equipment.amperage = newValue;
      } else {
        equipment.amperage = undefined;
      }
    }
    if (req.body.cosPhi !== undefined) {
      const newValue = req.body.cosPhi === null || req.body.cosPhi === '' ? undefined : req.body.cosPhi;
      equipment.cosPhi =
        newValue !== undefined && !Number.isNaN(parseFloat(newValue)) ? Number(parseFloat(newValue)) : undefined;
    }
    if (req.body.frequency !== undefined) {
      const newValue = req.body.frequency === null || req.body.frequency === '' ? undefined : req.body.frequency;
      equipment.frequency =
        newValue !== undefined && !Number.isNaN(parseFloat(newValue)) ? Number(parseFloat(newValue)) : undefined;
    }

    // Обробка прикріплених файлів
    if (req.body.attachedFiles !== undefined) {
      const oldFilesCount = equipment.attachedFiles ? equipment.attachedFiles.length : 0;
      if (Array.isArray(req.body.attachedFiles)) {
        equipment.attachedFiles = req.body.attachedFiles.map(file => ({
          cloudinaryUrl: file.cloudinaryUrl,
          cloudinaryId: file.cloudinaryId,
          originalName: file.originalName,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: file.uploadedAt || new Date()
        }));
        if (oldFilesCount !== equipment.attachedFiles.length) {
          changes.push(`attachedFiles: ${oldFilesCount} -> ${equipment.attachedFiles.length} файлів`);
        }
      }
    }

    // Обробка notes
    if (req.body.notes !== undefined) {
      const oldValue = equipment.notes;
      equipment.notes = req.body.notes === null || req.body.notes === '' ? undefined : req.body.notes;
      if (oldValue !== equipment.notes) {
        changes.push(`notes: оновлено`);
      }
    }

    // Обробка batch полів
    if (req.body.batchName !== undefined) {
      equipment.batchName = req.body.batchName === null || req.body.batchName === '' ? undefined : req.body.batchName;
    }
    if (req.body.batchUnit !== undefined) {
      equipment.batchUnit = req.body.batchUnit === null || req.body.batchUnit === '' ? undefined : req.body.batchUnit;
    }
    if (req.body.batchPriceWithVAT !== undefined) {
      const priceValue = req.body.batchPriceWithVAT === null || req.body.batchPriceWithVAT === '' ? undefined : req.body.batchPriceWithVAT;
      equipment.batchPriceWithVAT = priceValue !== undefined && !isNaN(priceValue) ? Number(priceValue) : undefined;
    }
    if (req.body.currency !== undefined) {
      equipment.currency = req.body.currency || 'грн.';
    }
    if (req.body.materialValueType !== undefined) {
      equipment.materialValueType = req.body.materialValueType === null || req.body.materialValueType === '' ? undefined : req.body.materialValueType;
    }
    if (req.body.categoryId !== undefined) {
      equipment.categoryId = req.body.categoryId === null || req.body.categoryId === '' ? null : req.body.categoryId;
    }
    if (req.body.itemKind !== undefined && ['equipment', 'parts'].includes(req.body.itemKind)) {
      equipment.itemKind = req.body.itemKind;
    }
    if (req.body.productId !== undefined) {
      const rawPid = req.body.productId;
      if (rawPid === null || rawPid === '') {
        equipment.productId = null;
      } else if (mongoose.Types.ObjectId.isValid(String(rawPid))) {
        const card = await ProductCard.findById(rawPid).lean();
        if (!card || !card.isActive) {
          return res.status(400).json({ error: 'Некоректна або неактивна карточка продукту' });
        }
        equipment.productId = card._id;
      } else {
        return res.status(400).json({ error: 'Некоректний productId' });
      }
    }
    if (req.body.technicalSpecs !== undefined) {
      equipment.technicalSpecs = sanitizeProductCardTechnicalSpecs(req.body.technicalSpecs);
    }

    console.log('[PUT] Зміни:', changes);

    equipment.lastModified = new Date();
    const savedEquipment = await equipment.save();
    console.log('[PUT] Обладнання збережено успішно');
    
    // Отримуємо оновлене обладнання з бази
    const updatedEquipment = await Equipment.findById(req.params.id).lean();
    console.log('[PUT] Оновлене обладнання:', updatedEquipment);

    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Оновлено обладнання ${equipment.type} (№${equipment.serialNumber})`,
        details: req.body
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    logPerformance('PUT /api/equipment/:id', startTime);
    res.json(updatedEquipment);
  } catch (error) {
    console.error('[ERROR] PUT /api/equipment/:id:', error);
    logPerformance('PUT /api/equipment/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Резервування обладнання
app.post('/api/equipment/:id/reserve', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/reserve - Резервування обладнання:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (equipment.status === 'reserved') {
      return res.status(400).json({ error: 'Обладнання вже зарезервовано' });
    }

    const { clientName, notes, endDate, reservationBasis } = req.body;
    
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'Назва клієнта обов\'язкова' });
    }
    const basisTrim = (reservationBasis || '').trim();
    if (!basisTrim || !RESERVATION_BASIS_ALLOWED.includes(basisTrim)) {
      return res.status(400).json({ error: 'Оберіть підставу резервування' });
    }

    const maxDays = await getReservationMaxDaysForBasis(basisTrim);
    if (endDate) {
      const endRaw = typeof endDate === 'string' ? endDate : new Date(endDate).toISOString();
      const endYmd = String(endRaw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) {
        return res.status(400).json({ error: 'Невірний формат дати закінчення резервування' });
      }
      const todayYmd = serverLocalTodayYmd();
      if (diffCalendarDaysYmd(todayYmd, endYmd) < 0) {
        return res.status(400).json({ error: 'Дата закінчення резервування не може бути в минулому' });
      }
      const span = diffCalendarDaysYmd(todayYmd, endYmd);
      if (span > maxDays) {
        return res.status(400).json({
          error: `Дата закінчення не може перевищувати ${maxDays} дн. для обраної підстави (з коефіцієнтів фінвідділу)`
        });
      }
    }

    equipment.status = 'reserved';
    equipment.reservedBy = user._id.toString();
    equipment.reservedByName = user.name || user.login;
    equipment.reservedByLogin = user.login;
    equipment.reservedAt = new Date();
    equipment.reservationClientName = clientName.trim();
    equipment.reservationNotes = notes || '';
    equipment.reservationEndDate = endDate ? new Date(endDate) : null;
    equipment.reservationBasis = basisTrim;
    equipment.lastModified = new Date();
    
    // Додаємо до історії резервувань
    if (!equipment.reservationHistory) {
      equipment.reservationHistory = [];
    }
    equipment.reservationHistory.push({
      action: 'reserved',
      date: new Date(),
      userId: user._id.toString(),
      userName: user.name || user.login,
      clientName: clientName.trim(),
      basis: basisTrim,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || ''
    });

    await equipment.save();

    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'reserve',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Зарезервовано обладнання ${equipment.type} (№${equipment.serialNumber || 'без номера'}) для клієнта ${clientName}`,
        details: { reservedByName: equipment.reservedByName, clientName, reservationBasis: basisTrim }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    await logInventoryMovement({
      eventType: 'reservation_created',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: equipment.quantity || 1,
      fromStatus: 'in_stock',
      toStatus: 'reserved',
      managerLogin: user.login,
      clientName: clientName.trim(),
      notes: 'Резервування зі складу'
    });

    logPerformance('POST /api/equipment/:id/reserve', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/reserve:', error);
    logPerformance('POST /api/equipment/:id/reserve', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Резервування з форми продажу: клієнт з угоди, підстава «домовленість», термін з коефіцієнтів; якщо вже зарезервовано цим логіном — без змін
// Для позицій без серійного номера з quantity > 1: body.quantity — скільки одиниць зарезервувати (решта лишається «на складі» в тому ж рядку).
app.post('/api/equipment/:id/reserve-for-sale', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const clientName = (req.body?.clientName || '').trim();
    if (!clientName) {
      return res.status(400).json({ error: 'Назва клієнта обов\'язкова для резервування' });
    }

    if (equipment.status === 'reserved') {
      if (equipment.reservedByLogin === req.user.login) {
        const fresh = await Equipment.findById(req.params.id).lean();
        return res.json(fresh);
      }
      return res.status(400).json({ error: 'Обладнання вже зарезервовано іншим користувачем' });
    }

    if (equipment.status !== 'in_stock') {
      return res.status(400).json({ error: 'Доступне лише обладнання в статусі «на складі»' });
    }

    const availableQty = Math.max(1, Math.floor(Number(equipment.quantity) || 1));
    const hasSerial = !!(equipment.serialNumber && String(equipment.serialNumber).trim() !== '');
    const rawBodyQty = req.body?.quantity;
    const parsedBodyQty = parseInt(rawBodyQty, 10);

    let reqQty;
    if (hasSerial) {
      reqQty = availableQty;
    } else if (Number.isFinite(parsedBodyQty) && parsedBodyQty >= 1) {
      reqQty = Math.min(parsedBodyQty, availableQty);
    } else {
      reqQty = availableQty;
    }

    if (hasSerial && reqQty !== availableQty) {
      return res.status(400).json({
        error: 'Для позицій із серійним номером можна зарезервувати лише весь рядок цілком'
      });
    }

    const basisTrim = RESERVATION_BASIS_FOR_SALE;
    const maxDays = await getReservationMaxDaysForBasis(basisTrim);
    let endDateVal = null;
    if (maxDays > 0) {
      const endYmd = ymdAddCalendarDays(serverLocalTodayYmd(), maxDays);
      endDateVal = new Date(`${endYmd}T23:59:59.999`);
    }

    const reservationNotes = 'Резерв при формуванні продажу в CRM';
    const pushReservationHistory = (target) => {
      if (!target.reservationHistory) {
        target.reservationHistory = [];
      }
      target.reservationHistory.push({
        action: 'reserved',
        date: new Date(),
        userId: user._id.toString(),
        userName: user.name || user.login,
        clientName,
        basis: basisTrim,
        endDate: endDateVal,
        notes: reservationNotes
      });
    };

    // Частковий резерв: як при quantity/move — зменшуємо залишок у поточному документі, новий документ з резервом
    if (!hasSerial && availableQty > 1 && reqQty < availableQty) {
      const plainBefore = equipment.toObject();
      delete plainBefore._id;
      delete plainBefore.__v;

      const origQtyBefore = equipment.quantity;
      try {
        equipment.quantity = availableQty - reqQty;
        equipment.lastModified = new Date();
        await equipment.save();

        const newEquipment = await Equipment.create({
          ...plainBefore,
          quantity: reqQty,
          status: 'reserved',
          reservedBy: user._id.toString(),
          reservedByName: user.name || user.login,
          reservedByLogin: user.login,
          reservedAt: new Date(),
          reservationClientName: clientName,
          reservationNotes,
          reservationEndDate: endDateVal,
          reservationBasis: basisTrim,
          lastModified: new Date(),
          saleId: undefined,
          soldToClientId: undefined,
          soldDate: undefined,
          saleAmount: undefined,
          warrantyUntil: undefined,
          warrantyMonths: undefined,
          reservationHistory: [],
          addedBy: user._id.toString(),
          addedByName: user.name || user.login,
          addedAt: new Date()
        });
        pushReservationHistory(newEquipment);
        await newEquipment.save();

        try {
          await EventLog.create({
            userId: user._id.toString(),
            userName: user.name || user.login,
            userRole: user.role,
            action: 'reserve',
            entityType: 'equipment',
            entityId: newEquipment._id.toString(),
            description: `Зарезервовано для продажу (частково ${reqQty} з ${availableQty}): ${equipment.type} — ${clientName}; залишок у рядку ${equipment._id}: ${equipment.quantity}`,
            details: {
              reservedByName: newEquipment.reservedByName,
              clientName,
              reservationBasis: basisTrim,
              source: 'sale_form',
              reservedQuantity: reqQty,
              sourceEquipmentId: equipment._id.toString(),
              remainingQuantity: equipment.quantity
            }
          });
        } catch (logErr) {
          console.error('Помилка логування reserve-for-sale (partial):', logErr);
        }

        await logInventoryMovement({
          eventType: 'reservation_created',
          performedByLogin: user.login,
          performedByName: user.name || user.login,
          equipmentId: newEquipment._id,
          equipmentType: newEquipment.type,
          serialNumber: newEquipment.serialNumber,
          quantity: reqQty,
          fromStatus: 'in_stock',
          toStatus: 'reserved',
          managerLogin: user.login,
          clientName,
          notes: `Резерв із форми продажу (частково, з рядка ${equipment._id})`
        });

        logPerformance('POST /api/equipment/:id/reserve-for-sale', startTime);
        const out = await Equipment.findById(newEquipment._id).lean();
        return res.json(out);
      } catch (splitErr) {
        equipment.quantity = origQtyBefore;
        await equipment.save().catch(() => {});
        throw splitErr;
      }
    }

    equipment.status = 'reserved';
    equipment.reservedBy = user._id.toString();
    equipment.reservedByName = user.name || user.login;
    equipment.reservedByLogin = user.login;
    equipment.reservedAt = new Date();
    equipment.reservationClientName = clientName;
    equipment.reservationNotes = reservationNotes;
    equipment.reservationEndDate = endDateVal;
    equipment.reservationBasis = basisTrim;
    equipment.lastModified = new Date();

    if (!equipment.reservationHistory) {
      equipment.reservationHistory = [];
    }
    pushReservationHistory(equipment);

    await equipment.save();

    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'reserve',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Зарезервовано для продажу: ${equipment.type} (№${equipment.serialNumber || 'без номера'}) — ${clientName}`,
        details: { reservedByName: equipment.reservedByName, clientName, reservationBasis: basisTrim, source: 'sale_form' }
      });
    } catch (logErr) {
      console.error('Помилка логування reserve-for-sale:', logErr);
    }

    await logInventoryMovement({
      eventType: 'reservation_created',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: equipment.quantity || 1,
      fromStatus: 'in_stock',
      toStatus: 'reserved',
      managerLogin: user.login,
      clientName,
      notes: 'Резерв із форми продажу'
    });

    logPerformance('POST /api/equipment/:id/reserve-for-sale', startTime);
    const out = await Equipment.findById(req.params.id).lean();
    res.json(out);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/reserve-for-sale:', error);
    logPerformance('POST /api/equipment/:id/reserve-for-sale', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Скасування резервування обладнання
app.post('/api/equipment/:id/cancel-reserve', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/cancel-reserve - Скасування резервування:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (equipment.status !== 'reserved') {
      return res.status(400).json({ error: 'Обладнання не зарезервовано' });
    }

    const ownerLoginBefore = equipment.reservedByLogin;
    const isCalendarExpired = isReservationCalendarExpired(equipment);

    // Перевірка прав на скасування: адмін, той хто зарезервував, або закінчився термін (календарно)
    const isAdmin = ['admin', 'administrator'].includes(user.role);
    const isOwner = equipment.reservedBy === user._id.toString();

    if (!isAdmin && !isOwner && !isCalendarExpired) {
      return res.status(403).json({
        error: 'Скасувати резервування може тільки адміністратор або той, хто його створив'
      });
    }

    let cancelReason = 'manual';
    if (isCalendarExpired) {
      cancelReason = 'expired';
    } else if (isAdmin && !isOwner) {
      cancelReason = 'admin';
    }

    await performEquipmentReservationRelease(equipment, user, cancelReason);

    if (cancelReason === 'admin' && ownerLoginBefore && ownerLoginBefore !== user.login) {
      await createManagerNotificationDeduped({
        recipientLogin: ownerLoginBefore,
        kind: 'reservation_released_admin',
        equipmentId: equipment._id,
        title: 'Резервування знято адміністратором',
        body: `${user.name || user.login} зняв резерв з ${equipmentReserveSummaryLine(equipment)}.`,
        read: false
      });
    }

    logPerformance('POST /api/equipment/:id/cancel-reserve', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/cancel-reserve:', error);
    logPerformance('POST /api/equipment/:id/cancel-reserve', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Передача резерву іншому менеджеру (лише власник резерву)
app.post('/api/equipment/:id/transfer-reserve', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const targetLogin = (req.body?.targetLogin || '').trim();
    if (!targetLogin) {
      return res.status(400).json({ error: 'Оберіть менеджера (targetLogin)' });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (equipment.status !== 'reserved') {
      return res.status(400).json({ error: 'Обладнання не в статусі «зарезервовано»' });
    }

    const isOwner =
      equipment.reservedBy === user._id.toString() ||
      (equipment.reservedByLogin && equipment.reservedByLogin === user.login);
    if (!isOwner) {
      return res.status(403).json({ error: 'Передати резерв може лише той, хто його створив' });
    }

    if (targetLogin === user.login) {
      return res.status(400).json({ error: 'Оберіть іншого менеджера' });
    }

    const targetUser = await User.findOne({
      login: targetLogin,
      role: { $in: ['manager', 'mgradm'] },
      dismissed: { $ne: true }
    });
    if (!targetUser) {
      return res.status(400).json({ error: 'Менеджера не знайдено або обліковий запис неактивний' });
    }

    const fromName = user.name || user.login;
    const toName = targetUser.name || targetUser.login;
    const prevClient = equipment.reservationClientName;
    let transferNote = `Передано резерв від ${fromName} (${user.login}) → ${toName} (${targetUser.login})`;
    if (prevClient) {
      transferNote += ` (попередній клієнт у резерві: ${prevClient})`;
    }

    await removeEquipmentFromManagersActiveSales(user.login, equipment._id);

    if (!equipment.reservationHistory) {
      equipment.reservationHistory = [];
    }
    equipment.reservationHistory.push({
      action: 'transferred',
      date: new Date(),
      userId: user._id.toString(),
      userName: fromName,
      notes: transferNote
    });

    equipment.reservedBy = targetUser._id.toString();
    equipment.reservedByName = toName;
    equipment.reservedByLogin = targetUser.login;
    equipment.reservedAt = new Date();
    equipment.reservationClientName = undefined;
    equipment.reservationNotes = undefined;
    equipment.lastModified = new Date();

    await equipment.save();

    const linkedSale = await addEquipmentToManagersLatestActiveSale(targetUser.login, equipment);

    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: fromName,
        userRole: user.role,
        action: 'transfer_reserve',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Передано резерв: ${equipment.type} (№${equipment.serialNumber || 'без номера'}) → ${toName}`,
        details: {
          fromLogin: user.login,
          toLogin: targetUser.login,
          previousReservationClient: prevClient || null,
          linkedSaleId: linkedSale ? linkedSale._id.toString() : null
        }
      });
    } catch (logErr) {
      console.error('Помилка логування transfer-reserve:', logErr);
    }

    await logInventoryMovement({
      eventType: 'reserve_transferred',
      performedByLogin: user.login,
      performedByName: fromName,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: equipment.quantity || 1,
      fromStatus: 'reserved',
      toStatus: 'reserved',
      managerLogin: targetUser.login,
      clientName: prevClient,
      notes: `Передача резерву: ${user.login} → ${targetUser.login}`
    });

    const eqLine = equipmentReserveSummaryLine(equipment);
    let notifyBody = `Вам передали резерв: ${eqLine}. Передав: ${fromName}.`;
    if (linkedSale) {
      notifyBody += ' Позицію додано до вашої останньої активної угоди.';
    } else {
      notifyBody += ' Активної угоди не знайдено — додайте обладнання до угоди вручну.';
    }

    try {
      await createManagerNotificationDeduped({
        recipientLogin: targetUser.login,
        kind: 'reservation_transferred',
        equipmentId: equipment._id,
        title: 'Вам передали резерв обладнання',
        body: notifyBody,
        read: false
      });
    } catch (nErr) {
      console.error('Помилка сповіщення transfer-reserve:', nErr);
    }

    logPerformance('POST /api/equipment/:id/transfer-reserve', startTime);
    const out = await Equipment.findById(req.params.id).lean();
    res.json(out);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/transfer-reserve:', error);
    logPerformance('POST /api/equipment/:id/transfer-reserve', startTime);
    res.status(500).json({ error: error.message });
  }
});

/** Адміністратор у панелі сервісу: перегляд сповіщень лише для регіональних керівників (query serviceGlobal=1). */
function isServiceGlobalNotificationsAdmin(req) {
  const role = req.user?.role;
  return req.query.serviceGlobal === '1' && ['admin', 'administrator'].includes(role);
}

/** Логіни користувачів з роллю регіонального керівника (активні облікові записи). */
async function getRegionalManagerRecipientLogins() {
  const rows = await User.find({
    role: { $in: ['regional', 'regkerivn'] },
    dismissed: { $ne: true }
  })
    .select('login')
    .lean();
  const set = new Set();
  for (const u of rows) {
    const l = u.login && String(u.login).trim();
    if (l) set.add(l);
  }
  return [...set];
}

// Персональні сповіщення менеджерів (резерви)
app.get('/api/manager-notifications', authenticateToken, async (req, res) => {
  try {
    const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';
    const procurementOnly = req.query.procurement === '1' || req.query.procurement === 'true';
    if (isServiceGlobalNotificationsAdmin(req)) {
      const logins = await getRegionalManagerRecipientLogins();
      if (logins.length === 0) {
        return res.json([]);
      }
      const q = { recipientLogin: { $in: logins } };
      if (unreadOnly) q.read = false;
      if (procurementOnly) q.kind = { $in: PROCUREMENT_ONLY_NOTIFICATION_KINDS };
      const list = await ManagerUserNotification.find(q).sort({ createdAt: -1 }).limit(500).lean();
      return res.json(list);
    }
    const login = req.user.login;
    const q = { recipientLogin: login };
    if (unreadOnly) q.read = false;
    if (procurementOnly) q.kind = { $in: PROCUREMENT_ONLY_NOTIFICATION_KINDS };
    const list = await ManagerUserNotification.find(q).sort({ createdAt: -1 }).limit(200).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/manager-notifications/unread-count', authenticateToken, async (req, res) => {
  try {
    const procurementOnly = req.query.procurement === '1' || req.query.procurement === 'true';
    const kindFilter = procurementOnly ? { kind: { $in: PROCUREMENT_ONLY_NOTIFICATION_KINDS } } : {};
    if (isServiceGlobalNotificationsAdmin(req)) {
      const logins = await getRegionalManagerRecipientLogins();
      const count =
        logins.length === 0
          ? 0
          : await ManagerUserNotification.countDocuments({
              recipientLogin: { $in: logins },
              read: false,
              ...kindFilter
            });
      return res.json({ count });
    }
    const count = await ManagerUserNotification.countDocuments({
      recipientLogin: req.user.login,
      read: false,
      ...kindFilter
    });
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/manager-notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const globalAdmin = isServiceGlobalNotificationsAdmin(req);
    let filter;
    if (globalAdmin) {
      const logins = await getRegionalManagerRecipientLogins();
      if (logins.length === 0) {
        return res.status(404).json({ error: 'Не знайдено' });
      }
      filter = { _id: req.params.id, recipientLogin: { $in: logins } };
    } else {
      filter = { _id: req.params.id, recipientLogin: req.user.login };
    }
    const n = await ManagerUserNotification.findOneAndUpdate(
      filter,
      { $set: { read: true } },
      { new: true }
    );
    if (!n) return res.status(404).json({ error: 'Не знайдено' });
    res.json(n);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/manager-notifications/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const procurementOnly = req.query.procurement === '1' || req.query.procurement === 'true';
    const kindFilter = procurementOnly ? { kind: { $in: PROCUREMENT_ONLY_NOTIFICATION_KINDS } } : {};
    if (isServiceGlobalNotificationsAdmin(req)) {
      const logins = await getRegionalManagerRecipientLogins();
      if (logins.length > 0) {
        await ManagerUserNotification.updateMany(
          { recipientLogin: { $in: logins }, read: false, ...kindFilter },
          { $set: { read: true } }
        );
      }
    } else {
      await ManagerUserNotification.updateMany(
        { recipientLogin: req.user.login, read: false, ...kindFilter },
        { $set: { read: true } }
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Подати заявку на тестування
app.post('/api/equipment/:id/request-testing', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/request-testing - Заявка на тестування:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (equipment.testingStatus !== 'none' && equipment.testingStatus !== 'completed' && equipment.testingStatus !== 'failed') {
      return res.status(400).json({ error: 'Обладнання вже подано на тестування' });
    }

    equipment.testingStatus = 'requested';
    equipment.testingRequestedBy = user._id.toString();
    equipment.testingRequestedByName = user.name || user.login;
    equipment.testingRequestedAt = new Date();
    equipment.lastModified = new Date();

    await equipment.save();

    logPerformance('POST /api/equipment/:id/request-testing', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/request-testing:', error);
    logPerformance('POST /api/equipment/:id/request-testing', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Взяти заявку на тестування в роботу
app.post('/api/equipment/:id/take-testing', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/take-testing - Взяття в роботу:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (equipment.testingStatus !== 'requested') {
      return res.status(400).json({ error: 'Заявка не в статусі "Очікує"' });
    }

    equipment.testingStatus = 'in_progress';
    equipment.testingTakenBy = user._id.toString();
    equipment.testingTakenByName = user.name || user.login;
    equipment.testingTakenAt = new Date();
    equipment.lastModified = new Date();

    await equipment.save();

    logPerformance('POST /api/equipment/:id/take-testing', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/take-testing:', error);
    logPerformance('POST /api/equipment/:id/take-testing', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Завершити тестування
app.post('/api/equipment/:id/complete-testing', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/complete-testing - Завершення тестування:', req.params.id);
  
  try {
    // Оскільки поле testingMaterials видалено зі схеми, можна використати звичайний Mongoose метод
    // Валідація більше не спрацює, оскільки Mongoose не знає про це поле
    const equipment = await Equipment.findById(req.params.id).lean();
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    if (equipment.testingStatus !== 'in_progress') {
      return res.status(400).json({ error: 'Заявка не в статусі "В роботі"' });
    }

    const { status, notes, result, materials, procedure, conclusion, engineer1, engineer2, engineer3 } = req.body;
    
    // Фільтруємо матеріали - видаляємо порожні записи та зберігаємо як JSON
    let filteredMaterials = [];
    if (Array.isArray(materials)) {
      filteredMaterials = materials.filter(m => m && m.type && m.type.trim() !== '');
    }
    
    // Оскільки поле testingMaterials видалено зі схеми, можна використати звичайний Mongoose метод
    // Валідація більше не спрацює, оскільки Mongoose не знає про це поле
    const updated = await Equipment.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          testingStatus: status === 'failed' ? 'failed' : 'completed',
          testingCompletedBy: user._id.toString(),
          testingCompletedByName: user.name || user.login,
          testingDate: new Date(),
          testingNotes: notes || '',
          testingResult: result || '',
          testingMaterialsArray: filteredMaterials, // Нове поле - масив об'єктів (правильна структура)
          testingMaterialsJson: JSON.stringify(filteredMaterials), // Старе поле для сумісності
          testingProcedure: procedure || '',
          testingConclusion: conclusion || (status === 'failed' ? 'failed' : 'passed'),
          testingEngineer1: engineer1 || '',
          testingEngineer2: engineer2 || '',
          testingEngineer3: engineer3 || '',
          lastModified: new Date()
        },
        $unset: { 
          testingMaterials: "" // Видаляємо старе поле testingMaterials, щоб уникнути помилок валідації
        }
      },
      {
        new: true,
        runValidators: false, // Вимкнути валідацію (на всяк випадок)
        lean: true // Повертаємо простий об'єкт
      }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Обладнання не знайдено після оновлення' });
    }
    
    // Видаляємо поле testingMaterials з результату, якщо воно все ще є (для безпеки)
    if (updated.testingMaterials !== undefined) {
      delete updated.testingMaterials;
    }

    logPerformance('POST /api/equipment/:id/complete-testing', startTime);
    
    // Конвертуємо _id в рядок для сумісності з фронтендом
    const responseData = {
      ...updated,
      _id: updated._id.toString()
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/complete-testing:', error);
    console.error('[ERROR] Request body:', JSON.stringify(req.body, null, 2));
    console.error('[ERROR] Stack:', error.stack);
    logPerformance('POST /api/equipment/:id/complete-testing', startTime);
    
    // Детальна інформація про помилку
    const errorResponse = {
      error: error.message,
      details: error.errors ? Object.keys(error.errors) : null,
      name: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    res.status(500).json(errorResponse);
  }
});

// Оновлення даних завершеного тестування (редагування)
app.put('/api/equipment/:id/update-testing', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[PUT] /api/equipment/:id/update-testing - Оновлення даних тестування:', req.params.id);

  try {
    const equipment = await Equipment.findById(req.params.id).lean();

    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    // Перевіряємо чи тест завершений
    if (equipment.testingStatus !== 'completed' && equipment.testingStatus !== 'failed') {
      return res.status(400).json({ error: 'Можна редагувати тільки завершені тести' });
    }

    const { notes, result, materials, procedure, conclusion, engineer1, engineer2, engineer3 } = req.body;

    // Фільтруємо матеріали - видаляємо порожні записи
    let filteredMaterials = [];
    if (Array.isArray(materials)) {
      filteredMaterials = materials.filter(m => m && m.type && m.type.trim() !== '');
    }

    // Оновлюємо дані тестування
    const updated = await Equipment.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          testingNotes: notes || '',
          testingResult: result || '',
          testingMaterialsArray: filteredMaterials,
          testingMaterialsJson: JSON.stringify(filteredMaterials),
          testingProcedure: procedure || '',
          testingConclusion: conclusion || 'passed',
          testingEngineer1: engineer1 || '',
          testingEngineer2: engineer2 || '',
          testingEngineer3: engineer3 || '',
          testingEditedBy: user.name || user.login,
          testingEditedAt: new Date()
        }
      },
      { new: true }
    ).lean();

    console.log('[SUCCESS] Дані тестування оновлено для обладнання:', req.params.id);
    logPerformance('PUT /api/equipment/:id/update-testing', startTime);

    res.json({ 
      success: true, 
      equipment: {
        ...updated,
        _id: updated._id.toString()
      }
    });
  } catch (error) {
    console.error('[ERROR] PUT /api/equipment/:id/update-testing:', error);
    logPerformance('PUT /api/equipment/:id/update-testing', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Завантаження файлів тестування
app.post('/api/equipment/:id/testing-files', authenticateToken, uploadWorkFiles.array('files', 10), async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/testing-files - Завантаження файлів тестування:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файли не завантажено' });
    }

    const newFiles = req.files.map(file => ({
      cloudinaryUrl: file.path || file.secure_url,
      cloudinaryId: file.public_id || file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    }));

    equipment.testingFiles = [...(equipment.testingFiles || []), ...newFiles];
    equipment.lastModified = new Date();

    await equipment.save();

    logPerformance('POST /api/equipment/:id/testing-files', startTime);
    res.json({ files: newFiles, equipment });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/testing-files:', error);
    logPerformance('POST /api/equipment/:id/testing-files', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Видалення файлу тестування
app.delete('/api/equipment/:id/testing-files/:fileId', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[DELETE] /api/equipment/:id/testing-files/:fileId - Видалення файлу:', req.params.id, req.params.fileId);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const fileId = req.params.fileId;
    const fileIndex = equipment.testingFiles?.findIndex(f => 
      f.cloudinaryId === fileId || f._id?.toString() === fileId
    );

    if (fileIndex === -1 || fileIndex === undefined) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    const fileToDelete = equipment.testingFiles[fileIndex];

    // Видаляємо з Cloudinary
    if (fileToDelete.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(fileToDelete.cloudinaryId, { resource_type: 'raw' });
      } catch (cloudErr) {
        console.warn('[WARNING] Не вдалося видалити з Cloudinary:', cloudErr.message);
        // Продовжуємо видалення з бази навіть якщо Cloudinary помилка
      }
    }

    // Видаляємо з масиву
    equipment.testingFiles.splice(fileIndex, 1);
    equipment.lastModified = new Date();

    await equipment.save();

    logPerformance('DELETE /api/equipment/:id/testing-files/:fileId', startTime);
    res.json({ success: true, equipment });
  } catch (error) {
    console.error('[ERROR] DELETE /api/equipment/:id/testing-files/:fileId:', error);
    logPerformance('DELETE /api/equipment/:id/testing-files/:fileId', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Скасувати заявку на тестування
app.post('/api/equipment/:id/cancel-testing', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/cancel-testing - Скасування заявки:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const testingStatusBefore = equipment.testingStatus;
    equipment.testingStatus = 'none';
    equipment.testingRequestedBy = undefined;
    equipment.testingRequestedByName = undefined;
    equipment.testingRequestedAt = undefined;
    equipment.testingTakenBy = undefined;
    equipment.testingTakenByName = undefined;
    equipment.testingTakenAt = undefined;
    equipment.lastModified = new Date();

    await equipment.save();

    await logInventoryMovement({
      eventType: 'testing_request_cancelled',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: equipment.quantity || 1,
      fromStatus: equipment.status,
      toStatus: equipment.status,
      notes: `Скасування заявки/етапу тестування: ${testingStatusBefore || '—'} → none`
    });

    logPerformance('POST /api/equipment/:id/cancel-testing', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/cancel-testing:', error);
    logPerformance('POST /api/equipment/:id/cancel-testing', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Повернути завершене тестування на повторне тестування
app.post('/api/equipment/:id/return-testing', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[POST] /api/equipment/:id/return-testing - Повернення тестування:', req.params.id);
  
  try {
    const equipment = await Equipment.findById(req.params.id).lean();
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    if (equipment.testingStatus !== 'completed' && equipment.testingStatus !== 'failed') {
      return res.status(400).json({ error: 'Можна повернути тільки завершені або не пройдені тести' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    // Повертаємо статус на "in_progress" і зберігаємо інформацію про попереднє тестування
    const updated = await Equipment.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          testingStatus: 'in_progress',
          testingTakenBy: user._id.toString(),
          testingTakenByName: user.name || user.login,
          testingTakenAt: new Date(),
          lastModified: new Date()
        }
      },
      {
        new: true,
        runValidators: false,
        lean: true
      }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Обладнання не знайдено після оновлення' });
    }

    await logInventoryMovement({
      eventType: 'testing_returned_for_retest',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: updated._id,
      equipmentType: updated.type,
      serialNumber: updated.serialNumber,
      quantity: updated.quantity || 1,
      fromStatus: updated.status,
      toStatus: updated.status,
      notes: 'Повторне тестування після завершеного/непройденого тесту'
    });

    logPerformance('POST /api/equipment/:id/return-testing', startTime);
    
    // Конвертуємо _id в рядок для сумісності з фронтендом
    const responseData = {
      ...updated,
      _id: updated._id.toString()
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/return-testing:', error);
    logPerformance('POST /api/equipment/:id/return-testing', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Видалення обладнання (тільки для admin/administrator)
app.delete('/api/equipment/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[DELETE] /api/equipment/:id - Запит на видалення:', req.params.id);
  console.log('[DELETE] Користувач:', req.user?.login, 'Роль:', req.user?.role);
  try {
    // Перевірка прав доступу
    if (!['admin', 'administrator'].includes(req.user.role)) {
      console.log('[DELETE] Доступ заборонено для ролі:', req.user.role);
      return res.status(403).json({ error: 'Доступ заборонено. Тільки адміністратор може видаляти обладнання.' });
    }

    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Причина видалення обов\'язкова' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const statusBeforeDelete = equipment.status;
    const qtyBeforeDelete = equipment.quantity || 1;

    // Додаємо запис в історію видалення
    equipment.deletionHistory = equipment.deletionHistory || [];
    equipment.deletionHistory.push({
      deletedAt: new Date(),
      deletedBy: user.login,
      deletedByName: user.name || user.login,
      reason: reason.trim()
    });

    // Позначаємо як видалене (soft delete)
    equipment.isDeleted = true;
    equipment.status = 'deleted';
    clearActiveEquipmentTesting(equipment);
    equipment.lastModified = new Date();

    await equipment.save();

    await logInventoryMovement({
      eventType: 'equipment_deleted',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: qtyBeforeDelete,
      fromStatus: statusBeforeDelete,
      toStatus: 'deleted',
      notes: (reason || '').trim() ? `Видалення: ${String(reason).trim()}` : 'Видалення обладнання'
    });

    logPerformance('DELETE /api/equipment/:id', startTime);
    res.json({ message: 'Обладнання видалено успішно', equipment });
  } catch (error) {
    console.error('[ERROR] DELETE /api/equipment/:id:', error);
    logPerformance('DELETE /api/equipment/:id', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Списання обладнання без серійного номера за кількістю (quantity-based)
app.post('/api/equipment/quantity/write-off', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { equipmentId, quantity, reason, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    if (!equipmentId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'equipmentId та quantity обов\'язкові' });
    }
    
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Причина списання обов\'язкова' });
    }
    
    // Знаходимо обладнання
    const equipment = await Equipment.findById(equipmentId);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const okWoQ = await ensureWarehouseStaffEquipmentAccess(
      res,
      req.user,
      user,
      equipment,
      'Списання дозволене лише для товару на складі вашого регіону.'
    );
    if (!okWoQ) return;

    const statusBeforeWriteOff = equipment.status;
    
    // Перевірка, що це обладнання без серійного номера
    if (equipment.serialNumber && equipment.serialNumber.trim() !== '') {
      return res.status(400).json({ error: 'Це endpoint тільки для обладнання без серійного номера' });
    }
    
    // Перевірка кількості на складі
    const availableQuantity = equipment.quantity || 1;
    if (availableQuantity < quantity) {
      return res.status(400).json({ 
        error: `На складі доступно тільки ${availableQuantity} одиниць, а ви намагаєтесь списати ${quantity}`,
        availableQuantity: availableQuantity,
        requestedQuantity: quantity
      });
    }
    
    // Створюємо запис списання
    const writeOff = {
      writtenOffAt: new Date(),
      writtenOffBy: user._id.toString(),
      writtenOffByName: user.name || user.login,
      quantity: quantity,
      reason: reason.trim(),
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    if (!equipment.writeOffHistory) {
      equipment.writeOffHistory = [];
    }
    if (!Array.isArray(equipment.writeOffHistory)) {
      equipment.writeOffHistory = [];
    }
    equipment.writeOffHistory.push(writeOff);
    
    // Якщо списуємо всю кількість - змінюємо статус
    if (quantity >= availableQuantity) {
      equipment.quantity = 0;
      equipment.status = 'written_off';
      clearActiveEquipmentTesting(equipment);
    } else {
      // Якщо списуємо частину - зменшуємо кількість
      equipment.quantity = availableQuantity - quantity;
    }
    
    equipment.lastModified = new Date();
    await equipment.save();
    
    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Списано ${quantity} одиниць обладнання ${equipment.type}${quantity >= availableQuantity ? ' (всього)' : ` (залишилось: ${equipment.quantity})`}. Причина: ${reason.trim()}`,
        details: { equipmentId, quantity, availableQuantity, writeOff }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    await logInventoryMovement({
      eventType: 'write_off',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity,
      fromStatus: statusBeforeWriteOff,
      toStatus: equipment.status,
      notes: `Списання: ${reason.trim()}${quantity >= availableQuantity ? ' (повністю)' : ''}`
    });
    
    logPerformance('POST /api/equipment/quantity/write-off', startTime);
    return res.json({ equipment, writtenOffQuantity: quantity, remainingQuantity: equipment.quantity });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/quantity/write-off:', error);
    logPerformance('POST /api/equipment/quantity/write-off', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Списання одиничного обладнання (з серійним номером)
app.post('/api/equipment/:id/write-off', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { reason, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Причина списання обов\'язкова' });
    }
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const okWo1 = await ensureWarehouseStaffEquipmentAccess(
      res,
      req.user,
      user,
      equipment,
      'Списання дозволене лише для товару на складі вашого регіону.'
    );
    if (!okWo1) return;

    const statusBeforeWriteOffSingle = equipment.status;
    
    // Створюємо запис списання
    const writeOff = {
      writtenOffAt: new Date(),
      writtenOffBy: user._id.toString(),
      writtenOffByName: user.name || user.login,
      quantity: 1,
      reason: reason.trim(),
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    if (!equipment.writeOffHistory) {
      equipment.writeOffHistory = [];
    }
    if (!Array.isArray(equipment.writeOffHistory)) {
      equipment.writeOffHistory = [];
    }
    equipment.writeOffHistory.push(writeOff);
    
    equipment.status = 'written_off';
    clearActiveEquipmentTesting(equipment);
    equipment.lastModified = new Date();
    
    await equipment.save();
    
    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Списано обладнання ${equipment.type}${equipment.serialNumber ? ` (№${equipment.serialNumber})` : ''}. Причина: ${reason.trim()}`,
        details: { equipmentId: equipment._id.toString(), writeOff }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    await logInventoryMovement({
      eventType: 'write_off',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: 1,
      fromStatus: statusBeforeWriteOffSingle,
      toStatus: 'written_off',
      notes: `Списання: ${reason.trim()}`
    });
    
    logPerformance('POST /api/equipment/:id/write-off', startTime);
    res.json({ equipment, writtenOffQuantity: 1 });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/write-off:', error);
    logPerformance('POST /api/equipment/:id/write-off', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Масове переміщення обладнання (для партій) - ПОВИННО БУТИ ПЕРЕД /api/equipment/:id/move
app.post('/api/equipment/batch/move', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[DEBUG] POST /api/equipment/batch/move - отримано запит:', {
      batchId: req.body.batchId,
      quantity: req.body.quantity,
      fromWarehouse: req.body.fromWarehouse,
      toWarehouse: req.body.toWarehouse
    });
    
    const { batchId, quantity, fromWarehouse, fromWarehouseName, toWarehouse, toWarehouseName, reason, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    if (!batchId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'batchId та quantity обов\'язкові' });
    }
    
    if (!fromWarehouse || !toWarehouse) {
      return res.status(400).json({ error: 'fromWarehouse та toWarehouse обов\'язкові' });
    }

    const okBatchMove = await ensureWarehouseStaffWarehouseIdAllowed(
      res,
      req.user,
      user,
      fromWarehouse,
      'Переміщення дозволене лише зі складу вашого регіону.'
    );
    if (!okBatchMove) return;

    const okBatchDest = await ensureWarehouseStaffMoveDestinationOutsideRegion(res, req.user, user, toWarehouse);
    if (!okBatchDest) return;
    
    // Знаходимо всі одиниці партії на поточному складі
    const batchItems = await Equipment.find({
      batchId: batchId,
      currentWarehouse: fromWarehouse,
      status: 'in_stock'
    }).sort({ batchIndex: 1 }).limit(quantity);
    
    console.log('[DEBUG] Знайдено елементів партії:', batchItems.length, 'з запитуваних:', quantity);
    
    if (batchItems.length < quantity) {
      return res.status(400).json({ 
        error: `На складі доступно тільки ${batchItems.length} одиниць з партії` 
      });
    }
    
    const movement = {
      fromWarehouse: fromWarehouse,
      toWarehouse: toWarehouse,
      fromWarehouseName: fromWarehouseName,
      toWarehouseName: toWarehouseName,
      date: new Date(),
      movedBy: user._id.toString(),
      movedByName: user.name || user.login,
      reason: reason || '',
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    // Переміщуємо вибрану кількість
    const movedItems = [];
    for (const item of batchItems) {
      // Перевіряємо та ініціалізуємо movementHistory, якщо відсутня
      if (!item.movementHistory) {
        item.movementHistory = [];
      }
      if (!Array.isArray(item.movementHistory)) {
        item.movementHistory = [];
      }
      
      item.movementHistory.push(movement);
      item.currentWarehouse = toWarehouse;
      item.currentWarehouseName = toWarehouseName;
      item.status = 'in_transit';
      item.lastModified = new Date();
      
      try {
        await item.save();
        movedItems.push(item);
      } catch (saveError) {
        console.error(`[ERROR] Помилка збереження обладнання ${item._id}:`, saveError);
        // Продовжуємо з наступним елементом
      }
    }
    
    if (movedItems.length === 0) {
      return res.status(500).json({ error: 'Не вдалося перемістити жодного елемента' });
    }
    
    // Створюємо документ переміщення
    try {
      const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
      const movementDoc = await MovementDocument.create({
        documentNumber,
        documentDate: new Date(),
        fromWarehouse: fromWarehouse,
        fromWarehouseName: fromWarehouseName,
        toWarehouse: toWarehouse,
        toWarehouseName: toWarehouseName,
        items: movedItems.map(item => ({
          equipmentId: item._id.toString(),
          type: item.type,
          serialNumber: item.serialNumber || '',
          quantity: 1,
          batchId: item.batchId || '',
          notes: notes || '',
          equipmentStatus: item.status || 'in_stock'
        })),
        reason: reason || '',
        notes: notes || '',
        attachedFiles: attachedFiles || [],
        createdBy: user._id.toString(),
        createdByName: user.name || user.login,
        status: 'completed'
      });
      console.log('[DEBUG] Створено документ переміщення (batch):', movementDoc.documentNumber, movementDoc._id);
    } catch (docErr) {
      console.error('[ERROR] Помилка створення документа переміщення (batch):', docErr);
    }
    
    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: batchId,
        description: `Переміщено ${quantity} одиниць партії ${batchId} з ${fromWarehouseName} на ${toWarehouseName}`,
        details: { batchId, quantity, movement }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }
    
    logPerformance('POST /api/equipment/batch/move', startTime);
    res.json({ batchId, movedCount: movedItems.length, items: movedItems });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/batch/move:', error);
    res.status(500).json({ error: error.message });
  }
});

// Переміщення обладнання без серійного номера за кількістю (quantity-based)
app.post('/api/equipment/quantity/move', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[DEBUG] POST /api/equipment/quantity/move - отримано запит:', { equipmentId: req.body.equipmentId, quantity: req.body.quantity });
  try {
    const { equipmentId, quantity, fromWarehouse, fromWarehouseName, toWarehouse, toWarehouseName, reason, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    if (!equipmentId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'equipmentId та quantity обов\'язкові' });
    }
    
    if (!fromWarehouse || !toWarehouse) {
      return res.status(400).json({ error: 'fromWarehouse та toWarehouse обов\'язкові' });
    }
    
    // Знаходимо обладнання
    const equipment = await Equipment.findById(equipmentId);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const okQm = await ensureWarehouseStaffWarehouseIdAllowed(
      res,
      req.user,
      user,
      fromWarehouse,
      'Переміщення дозволене лише зі складу вашого регіону.'
    );
    if (!okQm) return;

    const okQmDest = await ensureWarehouseStaffMoveDestinationOutsideRegion(res, req.user, user, toWarehouse);
    if (!okQmDest) return;
    
    // Перевірка, що це обладнання без серійного номера
    if (equipment.serialNumber && equipment.serialNumber.trim() !== '') {
      return res.status(400).json({ error: 'Це endpoint тільки для обладнання без серійного номера' });
    }
    
    // Перевірка кількості на складі
    const availableQuantity = equipment.quantity || 1;
    if (availableQuantity < quantity) {
      return res.status(400).json({ 
        error: `На складі доступно тільки ${availableQuantity} одиниць, а ви намагаєтесь перемістити ${quantity}`,
        availableQuantity: availableQuantity,
        requestedQuantity: quantity
      });
    }
    
    // Перевірка складу
    if (equipment.currentWarehouse !== fromWarehouse) {
      return res.status(400).json({ 
        error: `Обладнання знаходиться на іншому складі: ${equipment.currentWarehouseName || equipment.currentWarehouse}` 
      });
    }
    
    // Перевіряємо, чи існує ідентичне обладнання на складі призначення
    const manufacturerValue = equipment.manufacturer && equipment.manufacturer.trim() !== '' 
      ? equipment.manufacturer.trim() 
      : null;
    
    // Будуємо запит для пошуку ідентичного обладнання на складі призначення
    const searchQuery = {
      type: equipment.type,
      currentWarehouse: toWarehouse,
      region: equipment.region || null,
      status: { $ne: 'deleted' },
      $and: [
        {
          $or: [
            { serialNumber: null },
            { serialNumber: { $exists: false } },
            { serialNumber: '' }
          ]
        }
      ]
    };
    
    // Додаємо manufacturer до пошуку
    if (manufacturerValue) {
      searchQuery.manufacturer = manufacturerValue;
    } else {
      searchQuery.$and.push({
        $or: [
          { manufacturer: null },
          { manufacturer: { $exists: false } },
          { manufacturer: '' }
        ]
      });
    }
    
    const existingEquipmentOnDestination = await Equipment.findOne(searchQuery);
    console.log('[DEBUG] POST /api/equipment/quantity/move - знайдено існуюче обладнання на складі призначення:', existingEquipmentOnDestination ? 'так' : 'ні');
    
    const movement = {
      fromWarehouse: fromWarehouse,
      toWarehouse: toWarehouse,
      fromWarehouseName: fromWarehouseName || equipment.currentWarehouseName,
      toWarehouseName: toWarehouseName,
      date: new Date(),
      movedBy: user._id.toString(),
      movedByName: user.name || user.login,
      reason: reason || '',
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    if (!equipment.movementHistory) {
      equipment.movementHistory = [];
    }
    if (!Array.isArray(equipment.movementHistory)) {
      equipment.movementHistory = [];
    }
    equipment.movementHistory.push(movement);
    
    // Якщо переміщуємо всю кількість
    if (quantity >= availableQuantity) {
      console.log('[DEBUG] POST /api/equipment/quantity/move - переміщуємо всю кількість');
      if (existingEquipmentOnDestination && existingEquipmentOnDestination._id.toString() !== equipment._id.toString()) {
        console.log('[DEBUG] POST /api/equipment/quantity/move - об\'єднуємо з існуючим обладнанням');
        // Знайдено ідентичне обладнання на складі призначення - збільшуємо кількість
        existingEquipmentOnDestination.quantity = (existingEquipmentOnDestination.quantity || 1) + quantity;
        existingEquipmentOnDestination.lastModified = new Date();
        
        // Додаємо історію переміщення до існуючого обладнання
        if (!existingEquipmentOnDestination.movementHistory) {
          existingEquipmentOnDestination.movementHistory = [];
        }
        if (!Array.isArray(existingEquipmentOnDestination.movementHistory)) {
          existingEquipmentOnDestination.movementHistory = [];
        }
        existingEquipmentOnDestination.movementHistory.push(movement);
        
        await existingEquipmentOnDestination.save();
        
        // Видаляємо поточне обладнання (вся кількість переміщена)
        equipment.status = 'deleted';
        equipment.isDeleted = true;
        clearActiveEquipmentTesting(equipment);
        equipment.lastModified = new Date();
        await equipment.save();
        
        // Створюємо документ переміщення
        try {
          console.log('[DEBUG] POST /api/equipment/quantity/move - починаємо створення документа переміщення (merged full)');
          const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
          const movementDoc = await MovementDocument.create({
            documentNumber,
            documentDate: new Date(),
            fromWarehouse: fromWarehouse,
            fromWarehouseName: fromWarehouseName || equipment.currentWarehouseName,
            toWarehouse: toWarehouse,
            toWarehouseName: toWarehouseName,
            items: [{
              equipmentId: existingEquipmentOnDestination._id.toString(),
              type: equipment.type,
              serialNumber: equipment.serialNumber || '',
              quantity: quantity,
              notes: notes || '',
              equipmentStatus: equipment.status || 'in_stock'
            }],
            reason: reason || '',
            notes: notes || '',
            attachedFiles: attachedFiles || [],
            createdBy: user._id.toString(),
            createdByName: user.name || user.login,
            status: 'completed'
          });
          console.log('[DEBUG] Створено документ переміщення (merged full):', movementDoc.documentNumber, movementDoc._id);
        } catch (docErr) {
          console.error('[ERROR] Помилка створення документа переміщення (merged full):', docErr);
        }
        
        // Логування
        try {
          await EventLog.create({
            userId: user._id.toString(),
            userName: user.name || user.login,
            userRole: user.role,
            action: 'update',
            entityType: 'equipment',
            entityId: existingEquipmentOnDestination._id.toString(),
            description: `Переміщено ${quantity} одиниць обладнання ${equipment.type} з ${fromWarehouseName || equipment.currentWarehouseName} на ${toWarehouseName} (об'єднано з існуючим, всього: ${existingEquipmentOnDestination.quantity})`,
            details: { equipmentId, quantity, availableQuantity, mergedWith: existingEquipmentOnDestination._id.toString(), movement }
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        logPerformance('POST /api/equipment/quantity/move', startTime);
        return res.json({ equipment: existingEquipmentOnDestination, movedQuantity: quantity, remainingQuantity: 0, merged: true });
      } else {
        // Не знайдено ідентичного обладнання - просто оновлюємо склад
        console.log('[DEBUG] POST /api/equipment/quantity/move - не знайдено ідентичного обладнання, оновлюємо склад');
        equipment.currentWarehouse = toWarehouse;
        equipment.currentWarehouseName = toWarehouseName;
        equipment.status = 'in_transit';
        equipment.lastModified = new Date();
        
        await equipment.save();
        
        // Створюємо документ переміщення
        try {
          console.log('[DEBUG] POST /api/equipment/quantity/move - починаємо створення документа переміщення (full)');
          const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
          const movementDoc = await MovementDocument.create({
            documentNumber,
            documentDate: new Date(),
            fromWarehouse: fromWarehouse,
            fromWarehouseName: fromWarehouseName || equipment.currentWarehouseName,
            toWarehouse: toWarehouse,
            toWarehouseName: toWarehouseName,
            items: [{
              equipmentId: equipment._id.toString(),
              type: equipment.type,
              serialNumber: equipment.serialNumber || '',
              quantity: quantity,
              notes: notes || ''
            }],
            reason: reason || '',
            notes: notes || '',
            attachedFiles: attachedFiles || [],
            createdBy: user._id.toString(),
            createdByName: user.name || user.login,
            status: 'completed'
          });
          console.log('[DEBUG] Створено документ переміщення (full):', movementDoc.documentNumber, movementDoc._id);
        } catch (docErr) {
          console.error('[ERROR] Помилка створення документа переміщення (full):', docErr);
        }
        
        // Логування
        try {
          await EventLog.create({
            userId: user._id.toString(),
            userName: user.name || user.login,
            userRole: user.role,
            action: 'update',
            entityType: 'equipment',
            entityId: equipment._id.toString(),
            description: `Переміщено ${quantity} одиниць обладнання ${equipment.type} (всього: ${availableQuantity}) з ${fromWarehouseName || equipment.currentWarehouseName} на ${toWarehouseName}`,
            details: { equipmentId, quantity, availableQuantity, movement }
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        logPerformance('POST /api/equipment/quantity/move', startTime);
        return res.json({ equipment, movedQuantity: quantity, remainingQuantity: 0 });
      }
    } else {
      // Якщо переміщуємо частину - зменшуємо кількість на поточному складі
      console.log('[DEBUG] POST /api/equipment/quantity/move - переміщуємо частину кількості');
      equipment.quantity = availableQuantity - quantity;
      equipment.lastModified = new Date();
      
      await equipment.save();
      
      // Перевіряємо, чи існує ідентичне обладнання на складі призначення
      if (existingEquipmentOnDestination) {
        console.log('[DEBUG] POST /api/equipment/quantity/move - об\'єднуємо частину з існуючим обладнанням');
        // Знайдено ідентичне обладнання - збільшуємо кількість
        existingEquipmentOnDestination.quantity = (existingEquipmentOnDestination.quantity || 1) + quantity;
        existingEquipmentOnDestination.lastModified = new Date();
        
        // Додаємо історію переміщення до існуючого обладнання
        if (!existingEquipmentOnDestination.movementHistory) {
          existingEquipmentOnDestination.movementHistory = [];
        }
        if (!Array.isArray(existingEquipmentOnDestination.movementHistory)) {
          existingEquipmentOnDestination.movementHistory = [];
        }
        existingEquipmentOnDestination.movementHistory.push(movement);
        
        await existingEquipmentOnDestination.save();
        
        // Створюємо документ переміщення
        try {
          console.log('[DEBUG] POST /api/equipment/quantity/move - починаємо створення документа переміщення (merged partial)');
          const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
          const movementDoc = await MovementDocument.create({
            documentNumber,
            documentDate: new Date(),
            fromWarehouse: fromWarehouse,
            fromWarehouseName: fromWarehouseName || equipment.currentWarehouseName,
            toWarehouse: toWarehouse,
            toWarehouseName: toWarehouseName,
            items: [{
              equipmentId: existingEquipmentOnDestination._id.toString(),
              type: equipment.type,
              serialNumber: equipment.serialNumber || '',
              quantity: quantity,
              notes: notes || '',
              equipmentStatus: equipment.status || 'in_stock'
            }],
            reason: reason || '',
            notes: notes || '',
            attachedFiles: attachedFiles || [],
            createdBy: user._id.toString(),
            createdByName: user.name || user.login,
            status: 'completed'
          });
          console.log('[DEBUG] Створено документ переміщення (merged partial):', movementDoc.documentNumber, movementDoc._id);
        } catch (docErr) {
          console.error('[ERROR] Помилка створення документа переміщення (merged partial):', docErr);
        }
        
        // Логування
        try {
          await EventLog.create({
            userId: user._id.toString(),
            userName: user.name || user.login,
            userRole: user.role,
            action: 'update',
            entityType: 'equipment',
            entityId: existingEquipmentOnDestination._id.toString(),
            description: `Переміщено ${quantity} одиниць обладнання ${equipment.type} з ${fromWarehouseName || equipment.currentWarehouseName} на ${toWarehouseName} (об'єднано з існуючим, всього: ${existingEquipmentOnDestination.quantity}, залишилось: ${equipment.quantity})`,
            details: { equipmentId, quantity, availableQuantity, mergedWith: existingEquipmentOnDestination._id.toString(), movement }
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        logPerformance('POST /api/equipment/quantity/move', startTime);
        return res.json({ equipment, mergedEquipment: existingEquipmentOnDestination, movedQuantity: quantity, remainingQuantity: equipment.quantity, merged: true });
      } else {
        // Не знайдено ідентичного обладнання - створюємо новий запис на складі призначення
        console.log('[DEBUG] POST /api/equipment/quantity/move - створюємо новий запис на складі призначення');
        const newEquipment = await Equipment.create({
          ...equipment.toObject(),
          _id: undefined, // Створюємо новий ID
          quantity: quantity,
          currentWarehouse: toWarehouse,
          currentWarehouseName: toWarehouseName,
          status: 'in_transit',
          movementHistory: [movement],
          addedBy: user._id.toString(),
          addedByName: user.name || user.login,
          addedAt: new Date()
        });
        
        // Створюємо документ переміщення
        try {
          console.log('[DEBUG] POST /api/equipment/quantity/move - починаємо створення документа переміщення (new partial)');
          const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
          const movementDoc = await MovementDocument.create({
            documentNumber,
            documentDate: new Date(),
            fromWarehouse: fromWarehouse,
            fromWarehouseName: fromWarehouseName || equipment.currentWarehouseName,
            toWarehouse: toWarehouse,
            toWarehouseName: toWarehouseName,
            items: [{
              equipmentId: newEquipment._id.toString(),
              type: equipment.type,
              serialNumber: equipment.serialNumber || '',
              quantity: quantity,
              notes: notes || '',
              equipmentStatus: 'in_transit'
            }],
            reason: reason || '',
            notes: notes || '',
            attachedFiles: attachedFiles || [],
            createdBy: user._id.toString(),
            createdByName: user.name || user.login,
            status: 'completed'
          });
          console.log('[DEBUG] Створено документ переміщення (new partial):', movementDoc.documentNumber, movementDoc._id);
        } catch (docErr) {
          console.error('[ERROR] Помилка створення документа переміщення (new partial):', docErr);
        }
        
        // Логування
        try {
          await EventLog.create({
            userId: user._id.toString(),
            userName: user.name || user.login,
            userRole: user.role,
            action: 'update',
            entityType: 'equipment',
            entityId: equipment._id.toString(),
            description: `Переміщено ${quantity} одиниць обладнання ${equipment.type} з ${fromWarehouseName || equipment.currentWarehouseName} на ${toWarehouseName} (залишилось: ${equipment.quantity})`,
            details: { equipmentId, quantity, availableQuantity, newEquipmentId: newEquipment._id.toString(), movement }
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        logPerformance('POST /api/equipment/quantity/move', startTime);
        return res.json({ equipment, newEquipment, movedQuantity: quantity, remainingQuantity: equipment.quantity });
      }
    }
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/quantity/move:', error);
    logPerformance('POST /api/equipment/quantity/move', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Масове відвантаження обладнання (для партій) - ПОВИННО БУТИ ПЕРЕД /api/equipment/:id/ship
app.post('/api/equipment/batch/ship', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { batchId, quantity, fromWarehouse, shippedTo, orderNumber, invoiceNumber, clientEdrpou, clientAddress, invoiceRecipientDetails, totalPrice, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    if (!batchId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'batchId та quantity обов\'язкові' });
    }

    if (!fromWarehouse) {
      return res.status(400).json({ error: 'fromWarehouse обов\'язковий' });
    }

    const okBSh = await ensureWarehouseStaffWarehouseIdAllowed(
      res,
      req.user,
      user,
      fromWarehouse,
      'Відвантаження дозволене лише зі складу вашого регіону.'
    );
    if (!okBSh) return;
    
    // Знаходимо всі одиниці партії на складі (у т.ч. «на відвантаженні» після заявки менеджера)
    const batchItems = await Equipment.find({
      batchId: batchId,
      currentWarehouse: fromWarehouse,
      status: { $in: ['in_stock', 'reserved', 'pending_shipment'] }
    }).sort({ batchIndex: 1 }).limit(quantity);
    
    if (batchItems.length < quantity) {
      return res.status(400).json({ 
        error: `На складі доступно тільки ${batchItems.length} одиниць з партії` 
      });
    }
    
    const shipment = {
      shippedTo: shippedTo,
      shippedDate: new Date(),
      shippedBy: user._id.toString(),
      shippedByName: user.name || user.login,
      orderNumber: orderNumber || '',
      invoiceNumber: invoiceNumber || '',
      clientEdrpou: clientEdrpou || '',
      clientAddress: clientAddress || '',
      invoiceRecipientDetails: invoiceRecipientDetails || '',
      totalPrice: totalPrice || null,
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    // Відвантажуємо вибрану кількість
    const shippedItems = [];
    for (const item of batchItems) {
      // Перевіряємо та ініціалізуємо shipmentHistory, якщо відсутня
      if (!item.shipmentHistory) {
        item.shipmentHistory = [];
      }
      if (!Array.isArray(item.shipmentHistory)) {
        item.shipmentHistory = [];
      }

      const fromSt = item.status;
      item.shipmentHistory.push(shipment);
      item.pendingShipmentRequestId = undefined;
      item.statusBeforePendingShipment = undefined;
      item.status = 'shipped';
      clearActiveEquipmentTesting(item);
      item.lastModified = new Date();
      
      try {
        await item.save();
        shippedItems.push(item);
        await logInventoryMovement({
          eventType: 'shipment_out',
          performedByLogin: user.login,
          performedByName: user.name || user.login,
          equipmentId: item._id,
          equipmentType: item.type,
          serialNumber: item.serialNumber,
          quantity: item.quantity || 1,
          fromStatus: fromSt,
          toStatus: 'shipped',
          clientName: shippedTo,
          clientEdrpou: clientEdrpou || '',
          shipmentAddress: clientAddress || '',
          notes: orderNumber ? `Замовлення ${orderNumber}` : 'Відвантаження партії'
        });
      } catch (saveError) {
        console.error(`[ERROR] Помилка збереження обладнання ${item._id}:`, saveError);
        // Продовжуємо з наступним елементом
      }
    }
    
    if (shippedItems.length === 0) {
      return res.status(500).json({ error: 'Не вдалося відвантажити жодного елемента' });
    }
    
    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: batchId,
        description: `Відвантажено ${quantity} одиниць партії ${batchId} замовнику ${shippedTo}`,
        details: { batchId, quantity, shipment }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }
    
    logPerformance('POST /api/equipment/batch/ship', startTime);
    res.json({ batchId, shippedCount: shippedItems.length, items: shippedItems });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/batch/ship:', error);
    res.status(500).json({ error: error.message });
  }
});

// Відвантаження обладнання без серійного номера за кількістю (quantity-based)
app.post('/api/equipment/quantity/ship', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { equipmentId, quantity, fromWarehouse, shippedTo, orderNumber, invoiceNumber, clientEdrpou, clientAddress, invoiceRecipientDetails, totalPrice, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    if (!equipmentId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'equipmentId та quantity обов\'язкові' });
    }
    
    if (!fromWarehouse) {
      return res.status(400).json({ error: 'fromWarehouse обов\'язковий' });
    }
    
    // Знаходимо обладнання
    const equipment = await Equipment.findById(equipmentId);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }
    
    // Перевірка, що це обладнання без серійного номера
    if (equipment.serialNumber && equipment.serialNumber.trim() !== '') {
      return res.status(400).json({ error: 'Це endpoint тільки для обладнання без серійного номера' });
    }
    
    // Перевірка кількості на складі
    const availableQuantity = equipment.quantity || 1;
    if (availableQuantity < quantity) {
      return res.status(400).json({ 
        error: `На складі доступно тільки ${availableQuantity} одиниць, а ви намагаєтесь відвантажити ${quantity}`,
        availableQuantity: availableQuantity,
        requestedQuantity: quantity
      });
    }
    
    // Перевірка складу
    if (equipment.currentWarehouse !== fromWarehouse) {
      return res.status(400).json({ 
        error: `Обладнання знаходиться на іншому складі: ${equipment.currentWarehouseName || equipment.currentWarehouse}` 
      });
    }

    const okQSh = await ensureWarehouseStaffWarehouseIdAllowed(
      res,
      req.user,
      user,
      fromWarehouse,
      'Відвантаження дозволене лише зі складу вашого регіону.'
    );
    if (!okQSh) return;

    if (!['in_stock', 'reserved', 'pending_shipment'].includes(equipment.status)) {
      return res.status(400).json({
        error: `Некоректний статус для відвантаження: ${equipment.status || '—'}`
      });
    }
    
    const shipment = {
      shippedTo: shippedTo,
      shippedDate: new Date(),
      shippedBy: user._id.toString(),
      shippedByName: user.name || user.login,
      orderNumber: orderNumber || '',
      invoiceNumber: invoiceNumber || '',
      clientEdrpou: clientEdrpou || '',
      clientAddress: clientAddress || '',
      invoiceRecipientDetails: invoiceRecipientDetails || '',
      totalPrice: totalPrice || null,
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    // Якщо відвантажуємо всю кількість - просто оновлюємо статус
    if (quantity >= availableQuantity) {
      if (!equipment.shipmentHistory) {
        equipment.shipmentHistory = [];
      }
      if (!Array.isArray(equipment.shipmentHistory)) {
        equipment.shipmentHistory = [];
      }

      const fromStQ = equipment.status;
      equipment.shipmentHistory.push(shipment);
      equipment.pendingShipmentRequestId = undefined;
      equipment.statusBeforePendingShipment = undefined;
      equipment.status = 'shipped';
      clearActiveEquipmentTesting(equipment);
      equipment.lastModified = new Date();
      
      await equipment.save();

      await logInventoryMovement({
        eventType: 'shipment_out',
        performedByLogin: user.login,
        performedByName: user.name || user.login,
        equipmentId: equipment._id,
        equipmentType: equipment.type,
        serialNumber: equipment.serialNumber,
        quantity,
        fromStatus: fromStQ,
        toStatus: 'shipped',
        clientName: shippedTo,
        clientEdrpou: clientEdrpou || '',
        shipmentAddress: clientAddress || '',
        notes: notes || `Відвантажено ${quantity} од.`
      });
      
      // Логування
      try {
        await EventLog.create({
          userId: user._id.toString(),
          userName: user.name || user.login,
          userRole: user.role,
          action: 'update',
          entityType: 'equipment',
          entityId: equipment._id.toString(),
          description: `Відвантажено ${quantity} одиниць обладнання ${equipment.type} (всього: ${availableQuantity}) замовнику ${shippedTo}`,
          details: { equipmentId, quantity, availableQuantity, shipment }
        });
      } catch (logErr) {
        console.error('Помилка логування:', logErr);
      }
      
      logPerformance('POST /api/equipment/quantity/ship', startTime);
      return res.json({ equipment, shippedQuantity: quantity, remainingQuantity: 0 });
    } else {
      // Якщо відвантажуємо частину - зменшуємо кількість
      if (!equipment.shipmentHistory) {
        equipment.shipmentHistory = [];
      }
      if (!Array.isArray(equipment.shipmentHistory)) {
        equipment.shipmentHistory = [];
      }
      
      const fromStPart = equipment.status;
      equipment.shipmentHistory.push(shipment);
      equipment.quantity = availableQuantity - quantity;
      equipment.lastModified = new Date();
      
      await equipment.save();

      await logInventoryMovement({
        eventType: 'shipment_out',
        performedByLogin: user.login,
        performedByName: user.name || user.login,
        equipmentId: equipment._id,
        equipmentType: equipment.type,
        serialNumber: equipment.serialNumber,
        quantity,
        fromStatus: fromStPart,
        toStatus: fromStPart,
        clientName: shippedTo,
        clientEdrpou: clientEdrpou || '',
        shipmentAddress: clientAddress || '',
        notes: `Часткове відвантаження ${quantity} од., залишок ${equipment.quantity}`
      });
      
      // Логування
      try {
        await EventLog.create({
          userId: user._id.toString(),
          userName: user.name || user.login,
          userRole: user.role,
          action: 'update',
          entityType: 'equipment',
          entityId: equipment._id.toString(),
          description: `Відвантажено ${quantity} одиниць обладнання ${equipment.type} замовнику ${shippedTo} (залишилось: ${equipment.quantity})`,
          details: { equipmentId, quantity, availableQuantity, shipment }
        });
      } catch (logErr) {
        console.error('Помилка логування:', logErr);
      }
      
      logPerformance('POST /api/equipment/quantity/ship', startTime);
      return res.json({ equipment, shippedQuantity: quantity, remainingQuantity: equipment.quantity });
    }
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/quantity/ship:', error);
    logPerformance('POST /api/equipment/quantity/ship', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Переміщення обладнання між складами
app.post('/api/equipment/:id/move', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[DEBUG] POST /api/equipment/:id/move - отримано запит:', { equipmentId: req.params.id });
  try {
    const { toWarehouse, toWarehouseName, reason, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const okMove = await ensureWarehouseStaffEquipmentAccess(res, req.user, user, equipment);
    if (!okMove) return;

    const okMoveDest = await ensureWarehouseStaffMoveDestinationOutsideRegion(res, req.user, user, toWarehouse);
    if (!okMoveDest) return;
    
    // Зберігаємо оригінальний склад ПЕРЕД зміною
    const fromWarehouse = equipment.currentWarehouse;
    const fromWarehouseName = equipment.currentWarehouseName;
    
    const movement = {
      fromWarehouse: fromWarehouse,
      toWarehouse: toWarehouse,
      fromWarehouseName: fromWarehouseName,
      toWarehouseName: toWarehouseName,
      date: new Date(),
      movedBy: user._id.toString(),
      movedByName: user.name || user.login,
      reason: reason || '',
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };

    const fromStMove = equipment.status;
    if (!equipment.movementHistory) equipment.movementHistory = [];
    equipment.movementHistory.push(movement);
    equipment.currentWarehouse = toWarehouse;
    equipment.currentWarehouseName = toWarehouseName;
    equipment.status = 'in_transit';
    equipment.lastModified = new Date();
    
    await equipment.save();

    await logInventoryMovement({
      eventType: 'warehouse_move',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: equipment.quantity || 1,
      fromStatus: fromStMove,
      toStatus: 'in_transit',
      sourceWarehouseName: fromWarehouseName || '',
      destinationWarehouseName: toWarehouseName || '',
      notes: [reason, notes].filter(Boolean).join(' · ') || 'Переміщення між складами'
    });
    
    // Створюємо документ переміщення
    try {
      console.log('[DEBUG] POST /api/equipment/:id/move - починаємо створення документа переміщення (single)');
      const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
      
      const documentData = {
        documentNumber,
        documentDate: new Date(),
        fromWarehouse: fromWarehouse,
        fromWarehouseName: fromWarehouseName,
        toWarehouse: toWarehouse,
        toWarehouseName: toWarehouseName,
        items: [{
          equipmentId: equipment._id.toString(),
          type: equipment.type || '',
          serialNumber: equipment.serialNumber || '',
          quantity: 1,
          notes: notes || '',
          equipmentStatus: equipment.status || 'in_stock'
        }],
        reason: reason || '',
        notes: notes || '',
        attachedFiles: attachedFiles || [],
        createdBy: user._id.toString(),
        createdByName: user.name || user.login,
        status: 'completed'
      };
      
      console.log('[DEBUG] Дані для створення документа:', JSON.stringify(documentData, null, 2));
      
      const movementDoc = await MovementDocument.create(documentData);
      console.log('[DEBUG] Створено документ переміщення (single):', movementDoc.documentNumber, movementDoc._id);
    } catch (docErr) {
      console.error('[ERROR] Помилка створення документа переміщення (single):', docErr);
      console.error('[ERROR] Деталі помилки:', JSON.stringify(docErr, null, 2));
      if (docErr.errors) {
        console.error('[ERROR] Помилки валідації:', JSON.stringify(docErr.errors, null, 2));
      }
    }
    
    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Переміщено обладнання ${equipment.type} (№${equipment.serialNumber}) з ${movement.fromWarehouseName} на ${toWarehouseName}`,
        details: movement
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }
    
    logPerformance('POST /api/equipment/:id/move', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/move:', error);
    logPerformance('POST /api/equipment/:id/move', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Відвантаження обладнання
app.post('/api/equipment/:id/ship', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { shippedTo, orderNumber, invoiceNumber, clientEdrpou, clientAddress, invoiceRecipientDetails, totalPrice, notes, attachedFiles } = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const okShip1 = await ensureWarehouseStaffEquipmentAccess(
      res,
      req.user,
      user,
      equipment,
      'Відвантаження дозволене лише зі складу вашого регіону.'
    );
    if (!okShip1) return;

    if (!['in_stock', 'reserved', 'pending_shipment'].includes(equipment.status)) {
      return res.status(400).json({
        error: `Некоректний статус для відвантаження: ${equipment.status || '—'}`
      });
    }
    
    const shipment = {
      shippedTo: shippedTo,
      shippedDate: new Date(),
      shippedBy: user._id.toString(),
      shippedByName: user.name || user.login,
      orderNumber: orderNumber || '',
      invoiceNumber: invoiceNumber || '',
      clientEdrpou: clientEdrpou || '',
      clientAddress: clientAddress || '',
      invoiceRecipientDetails: invoiceRecipientDetails || '',
      totalPrice: totalPrice || null,
      notes: notes || '',
      attachedFiles: attachedFiles || []
    };
    
    // Перевіряємо та ініціалізуємо shipmentHistory, якщо відсутня
    if (!equipment.shipmentHistory) {
      equipment.shipmentHistory = [];
    }
    if (!Array.isArray(equipment.shipmentHistory)) {
      equipment.shipmentHistory = [];
    }

    const fromStShip = equipment.status;
    equipment.shipmentHistory.push(shipment);
    equipment.pendingShipmentRequestId = undefined;
    equipment.statusBeforePendingShipment = undefined;
    equipment.status = 'shipped';
    clearActiveEquipmentTesting(equipment);
    equipment.lastModified = new Date();
    
    await equipment.save();

    await logInventoryMovement({
      eventType: 'shipment_out',
      performedByLogin: user.login,
      performedByName: user.name || user.login,
      equipmentId: equipment._id,
      equipmentType: equipment.type,
      serialNumber: equipment.serialNumber,
      quantity: equipment.quantity || 1,
      fromStatus: fromStShip,
      toStatus: 'shipped',
      clientName: shippedTo,
      clientEdrpou: clientEdrpou || '',
      shipmentAddress: clientAddress || '',
      notes: orderNumber ? `Замовлення ${orderNumber}` : 'Відвантаження'
    });
    
    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Відвантажено обладнання ${equipment.type} (№${equipment.serialNumber}) замовнику ${shippedTo}`,
        details: shipment
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }
    
    logPerformance('POST /api/equipment/:id/ship', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/ship:', error);
    logPerformance('POST /api/equipment/:id/ship', startTime);
    res.status(500).json({ error: error.message });
  }
});

// Отримання інформації про партію (кількість на складі)
app.get('/api/equipment/batch/:batchId/stock', authenticateToken, async (req, res) => {
  try {
    const { batchId } = req.params;
    const { warehouse } = req.query;
    
    const query = { batchId, status: 'in_stock' };
    if (warehouse) {
      query.currentWarehouse = warehouse;
    }
    
    const count = await Equipment.countDocuments(query);
    const items = await Equipment.find(query).select('_id currentWarehouse currentWarehouseName');
    
    res.json({ batchId, count, items });
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/batch/:batchId/stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// Затвердження отримання товару (масове оновлення статусу з in_transit на in_stock)
app.post('/api/equipment/approve-receipt', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const { equipmentIds } = req.body;

    if (!equipmentIds || !Array.isArray(equipmentIds) || equipmentIds.length === 0) {
      return res.status(400).json({ error: 'Вкажіть список ID обладнання для затвердження' });
    }

    // Знаходимо всі обладнання з вказаними ID та статусом in_transit
    const equipmentList = await Equipment.find({
      _id: { $in: equipmentIds },
      status: 'in_transit'
    });

    if (equipmentList.length === 0) {
      return res.status(404).json({ error: 'Не знайдено товарів в дорозі з вказаними ID' });
    }

    if (
      isRegionalWarehouseStaffRole(req.user.role) &&
      !bypassesRegionalWarehouseInventoryLock(req.user.role)
    ) {
      const allowedRecv = await loadActiveWarehouseIdsForUserRegion(user.region);
      if (!allowedRecv.size) {
        return res.status(403).json({
          error:
            'Для вашого профілю не знайдено активних складів у вашому регіоні. Зверніться до адміністратора.'
        });
      }
      for (const row of equipmentList) {
        if (!warehouseIdInRegionalSet(row.currentWarehouse, allowedRecv)) {
          return res.status(403).json({
            error:
              'Підтвердити прийом можна лише для товару, що адресований на склад вашого регіону (після переміщення).'
          });
        }
      }
    }

    // Оновлюємо статус на in_stock
    const updatedItems = [];
    for (const item of equipmentList) {
      item.status = 'in_stock';
      item.lastModified = new Date();
      await item.save();
      updatedItems.push(item);
      await logInventoryMovement({
        eventType: 'receipt_approved',
        performedByLogin: user.login,
        performedByName: user.name || user.login,
        equipmentId: item._id,
        equipmentType: item.type,
        serialNumber: item.serialNumber,
        quantity: item.quantity || 1,
        fromStatus: 'in_transit',
        toStatus: 'in_stock',
        destinationWarehouseName: item.currentWarehouseName,
        notes: 'Затверджено надходження на склад'
      });
    }

    // Оновлюємо документи переміщення - додаємо інформацію про того, хто прийняв
    const equipmentIdStrings = equipmentIds.map(id => id.toString());
    await MovementDocument.updateMany(
      {
        'items.equipmentId': { $in: equipmentIdStrings },
        status: 'in_transit'
      },
      {
        $set: {
          receivedBy: user._id.toString(),
          receivedByName: user.name || user.login,
          status: 'completed'
        }
      }
    );

    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'update',
        entityType: 'equipment',
        entityId: equipmentIds.join(','),
        description: `Затверджено отримання ${updatedItems.length} товарів на склад`,
        details: {
          equipmentIds: equipmentIds,
          updatedCount: updatedItems.length,
          warehouse: updatedItems[0]?.currentWarehouseName || updatedItems[0]?.currentWarehouse
        }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    logPerformance('POST /api/equipment/approve-receipt', startTime);
    res.json({
      success: true,
      approvedCount: updatedItems.length,
      items: updatedItems.map(item => ({
        _id: item._id,
        type: item.type,
        serialNumber: item.serialNumber,
        currentWarehouse: item.currentWarehouse,
        currentWarehouseName: item.currentWarehouseName,
        status: item.status
      }))
    });
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/approve-receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отримання кількості товарів в дорозі (для лічильника)
app.get('/api/equipment/in-transit/count', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const count = await Equipment.countDocuments({
      status: 'in_transit',
      isDeleted: { $ne: true }
    });
    
    logPerformance('GET /api/equipment/in-transit/count', startTime);
    res.json({ count });
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/in-transit/count:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення статусу обладнання (наприклад, після доставки)
app.put('/api/equipment/:id/status', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { status } = req.body;
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }

    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    const okSt = await ensureWarehouseStaffEquipmentAccess(
      res,
      req.user,
      user,
      equipment,
      'Зміна статусу дозволена лише для товару на складі вашого регіону.'
    );
    if (!okSt) return;

    const prevStPut = equipment.status;
    
    equipment.status = status;
    equipment.lastModified = new Date();
    await equipment.save();

    if (user && String(prevStPut) !== String(status)) {
      await logInventoryMovement({
        eventType: 'status_change',
        performedByLogin: user.login,
        performedByName: user.name || user.login,
        equipmentId: equipment._id,
        equipmentType: equipment.type,
        serialNumber: equipment.serialNumber,
        quantity: equipment.quantity || 1,
        fromStatus: prevStPut,
        toStatus: status,
        sourceWarehouseName: equipment.currentWarehouseName,
        notes: 'Зміна статусу обладнання'
      });
    }
    
    logPerformance('PUT /api/equipment/:id/status', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] PUT /api/equipment/:id/status', error);
    logPerformance('PUT /api/equipment/:id/status', startTime);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ДЛЯ ДОКУМЕНТІВ СКЛАДСЬКОГО ОБЛІКУ
// ============================================

// Генерація номера документа
const generateDocumentNumber = async (prefix, Model) => {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const prefixWithDate = `${prefix}-${year}${month}`;
  
  const lastDoc = await Model.findOne({
    documentNumber: new RegExp(`^${prefixWithDate}`)
  }).sort({ documentNumber: -1 });
  
  let sequence = 1;
  if (lastDoc) {
    const lastSeq = parseInt(lastDoc.documentNumber.split('-').pop() || '0');
    sequence = lastSeq + 1;
  }
  
  return `${prefixWithDate}-${String(sequence).padStart(4, '0')}`;
};

// ========== ДОКУМЕНТИ НАДХОДЖЕННЯ ==========

// Отримання списку документів надходження
app.get('/api/documents/receipt', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, status, dateFrom, dateTo } = req.query;
    const query = {};
    
    if (warehouse) query.warehouse = warehouse;
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.documentDate = {};
      if (dateFrom) query.documentDate.$gte = new Date(dateFrom);
      if (dateTo) query.documentDate.$lte = new Date(dateTo);
    }
    
    const documents = await ReceiptDocument.find(query)
      .sort({ documentDate: -1 })
      .lean();
    
    logPerformance('GET /api/documents/receipt', startTime, documents.length);
    res.json(documents);
  } catch (error) {
    console.error('[ERROR] GET /api/documents/receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створення документа надходження
app.post('/api/documents/receipt', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const bodyRec = req.body || {};
    if (bodyRec.status === 'completed' && Array.isArray(bodyRec.items) && bodyRec.items.length) {
      const okRecPost = await ensureWarehouseStaffWarehouseIdAllowed(
        res,
        req.user,
        user,
        bodyRec.warehouse,
        'Завершити надходження можна лише на склад вашого регіону.'
      );
      if (!okRecPost) return;
    }
    
    const documentNumber = await generateDocumentNumber('REC', ReceiptDocument);
    
    const document = await ReceiptDocument.create({
      ...req.body,
      documentNumber,
      createdBy: user._id.toString(),
      createdByName: user.name || user.login
    });
    
    // Оновлюємо статус обладнання та склад
    if (document.status === 'completed' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            const prevSt = equipment.status;
            equipment.currentWarehouse = document.warehouse;
            equipment.currentWarehouseName = document.warehouseName;
            equipment.status = 'in_stock';
            equipment.lastModified = new Date();
            await equipment.save();
            await logInventoryMovement({
              eventType: 'receipt_document_completed',
              performedByLogin: user.login,
              performedByName: user.name || user.login,
              equipmentId: equipment._id,
              equipmentType: equipment.type,
              serialNumber: equipment.serialNumber,
              quantity: equipment.quantity || 1,
              fromStatus: prevSt,
              toStatus: 'in_stock',
              destinationWarehouseName: document.warehouseName,
              notes: `Документ надходження ${document.documentNumber} (завершено)`
            });
          }
        }
      }
    }
    
    logPerformance('POST /api/documents/receipt', startTime);
    res.status(201).json(document);
  } catch (error) {
    console.error('[ERROR] POST /api/documents/receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення документа надходження
app.put('/api/documents/receipt/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const prevDoc = await ReceiptDocument.findById(req.params.id).lean();
    if (!prevDoc) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }

    const mergedRec = { ...prevDoc, ...req.body };
    const nextRecStatus = mergedRec.status !== undefined ? mergedRec.status : prevDoc.status;
    if (nextRecStatus === 'completed' && prevDoc.status !== 'completed' && mergedRec.items?.length) {
      const okRecPut = await ensureWarehouseStaffWarehouseIdAllowed(
        res,
        req.user,
        user,
        mergedRec.warehouse,
        'Завершити надходження можна лише на склад вашого регіону.'
      );
      if (!okRecPut) return;
    }
    if (nextRecStatus === 'cancelled' && prevDoc.status !== 'cancelled' && mergedRec.items?.length) {
      const okRecCan = await ensureWarehouseStaffWarehouseIdAllowed(
        res,
        req.user,
        user,
        mergedRec.warehouse,
        'Скасувати документ надходження можна лише для складу вашого регіону.'
      );
      if (!okRecCan) return;
    }

    const document = await ReceiptDocument.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }

    const prevStatus = prevDoc?.status;
    if (document.status === 'completed' && prevStatus !== 'completed' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            const prevSt = equipment.status;
            equipment.currentWarehouse = document.warehouse;
            equipment.currentWarehouseName = document.warehouseName;
            equipment.status = 'in_stock';
            equipment.lastModified = new Date();
            await equipment.save();
            await logInventoryMovement({
              eventType: 'receipt_document_completed',
              performedByLogin: user.login,
              performedByName: user.name || user.login,
              equipmentId: equipment._id,
              equipmentType: equipment.type,
              serialNumber: equipment.serialNumber,
              quantity: equipment.quantity || 1,
              fromStatus: prevSt,
              toStatus: 'in_stock',
              destinationWarehouseName: document.warehouseName,
              notes: `Документ надходження ${document.documentNumber} (завершено, оновлення)`
            });
          }
        }
      }
    }

    if (document.status === 'cancelled' && prevStatus !== 'cancelled' && document.items) {
      for (const item of document.items) {
        if (!item.equipmentId) continue;
        const eq = await Equipment.findById(item.equipmentId).lean();
        await logInventoryMovement({
          eventType: 'receipt_document_cancelled',
          performedByLogin: user.login,
          performedByName: user.name || user.login,
          equipmentId: item.equipmentId,
          equipmentType: eq?.type,
          serialNumber: eq?.serialNumber,
          quantity: eq?.quantity || 1,
          fromStatus: eq?.status,
          toStatus: eq?.status,
          notes: `Скасовано документ надходження ${document.documentNumber}`
        });
      }
    }
    
    logPerformance('PUT /api/documents/receipt/:id', startTime);
    res.json(document);
  } catch (error) {
    console.error('[ERROR] PUT /api/documents/receipt/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ДОКУМЕНТИ ПЕРЕМІЩЕННЯ ==========

// Отримання списку документів переміщення
app.get('/api/documents/movement', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, status, dateFrom, dateTo } = req.query;
    const query = {};
    
    if (warehouse) {
      query.$or = [
        { fromWarehouse: warehouse },
        { toWarehouse: warehouse }
      ];
    }
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.documentDate = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        query.documentDate.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        query.documentDate.$lte = toDate;
      }
    }
    
    const documents = await MovementDocument.find(query)
      .sort({ documentDate: -1 })
      .lean();
    
    logPerformance('GET /api/documents/movement', startTime, documents.length);
    res.json(documents);
  } catch (error) {
    console.error('[ERROR] GET /api/documents/movement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення документа переміщення
app.put('/api/documents/movement/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const prevMovementDoc = await MovementDocument.findById(req.params.id).lean();
    if (!prevMovementDoc) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }

    const mergedMov = { ...prevMovementDoc, ...req.body };
    const docForAccess = {
      status: mergedMov.status !== undefined ? mergedMov.status : prevMovementDoc.status,
      fromWarehouse: mergedMov.fromWarehouse !== undefined ? mergedMov.fromWarehouse : prevMovementDoc.fromWarehouse,
      toWarehouse: mergedMov.toWarehouse !== undefined ? mergedMov.toWarehouse : prevMovementDoc.toWarehouse,
      items: mergedMov.items !== undefined ? mergedMov.items : prevMovementDoc.items,
      documentNumber: mergedMov.documentNumber || prevMovementDoc.documentNumber
    };
    const okMovPut = await ensureWarehouseStaffMovementDocTransition(
      res,
      req.user,
      user,
      prevMovementDoc.status,
      docForAccess
    );
    if (!okMovPut) return;
    
    const document = await MovementDocument.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }

    if (document.status === 'cancelled' && prevMovementDoc?.status !== 'cancelled' && document.items) {
      for (const item of document.items) {
        if (!item.equipmentId) continue;
        const eq = await Equipment.findById(item.equipmentId).lean();
        await logInventoryMovement({
          eventType: 'movement_document_cancelled',
          performedByLogin: user.login,
          performedByName: user.name || user.login,
          equipmentId: item.equipmentId,
          equipmentType: eq?.type,
          serialNumber: eq?.serialNumber,
          quantity: eq?.quantity || 1,
          fromStatus: eq?.status,
          toStatus: eq?.status,
          sourceWarehouseName: document.fromWarehouseName,
          destinationWarehouseName: document.toWarehouseName,
          notes: `Скасовано документ переміщення ${document.documentNumber}`
        });
      }
    }
    
    // Оновлюємо обладнання при завершенні переміщення
    const movementJustCompleted =
      document.status === 'completed' && prevMovementDoc?.status !== 'completed';
    if (document.status === 'completed' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            const prevStMovement = equipment.status;
            // Перевіряємо, чи вже є запис про це переміщення в історії
            const existingMovement = equipment.movementHistory?.find(
              m => m.fromWarehouse === document.fromWarehouse && 
                   m.toWarehouse === document.toWarehouse &&
                   new Date(m.date).getTime() === new Date(document.documentDate).getTime()
            );
            
            if (!existingMovement) {
              // Додаємо запис до історії переміщень
              if (!equipment.movementHistory) {
                equipment.movementHistory = [];
              }
              equipment.movementHistory.push({
                fromWarehouse: document.fromWarehouse,
                toWarehouse: document.toWarehouse,
                fromWarehouseName: document.fromWarehouseName,
                toWarehouseName: document.toWarehouseName,
                date: document.documentDate,
                movedBy: user._id.toString(),
                movedByName: user.name || user.login,
                reason: document.reason || '',
                notes: document.notes || ''
              });
            }
            
            // Оновлюємо склад та статус
            equipment.currentWarehouse = document.toWarehouse;
            equipment.currentWarehouseName = document.toWarehouseName;
            equipment.status = 'in_stock'; // При завершенні переміщення статус = "на складі"
            equipment.lastModified = new Date();
            await equipment.save();

            if (movementJustCompleted) {
              await logInventoryMovement({
                eventType: 'movement_document_completed',
                performedByLogin: user.login,
                performedByName: user.name || user.login,
                equipmentId: equipment._id,
                equipmentType: equipment.type,
                serialNumber: equipment.serialNumber,
                quantity: equipment.quantity || 1,
                fromStatus: prevStMovement,
                toStatus: 'in_stock',
                sourceWarehouseName: document.fromWarehouseName,
                destinationWarehouseName: document.toWarehouseName,
                notes: `Документ переміщення ${document.documentNumber} (завершено)`
              });
            }
          }
        }
      }
    } else if (document.status === 'in_transit' && document.items) {
      // Якщо статус змінився на "в дорозі", оновлюємо статус обладнання
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            equipment.status = 'in_transit';
            equipment.lastModified = new Date();
            await equipment.save();
          }
        }
      }
    }
    
    logPerformance('PUT /api/documents/movement/:id', startTime);
    res.json(document);
  } catch (error) {
    console.error('[ERROR] PUT /api/documents/movement/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створення документа переміщення
app.post('/api/documents/movement', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    const documentNumber = await generateDocumentNumber('MOV', MovementDocument);
    
    const document = await MovementDocument.create({
      ...req.body,
      documentNumber,
      createdBy: user._id.toString(),
      createdByName: user.name || user.login
    });

    const okMovPost = await ensureWarehouseStaffMovementDocTransition(
      res,
      req.user,
      user,
      undefined,
      document.toObject()
    );
    if (!okMovPost) {
      await MovementDocument.findByIdAndDelete(document._id);
      return;
    }
    
    // Оновлюємо обладнання при завершенні переміщення
    if (document.status === 'completed' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            const prevStMovementPost = equipment.status;
            if (!equipment.movementHistory) {
              equipment.movementHistory = [];
            }
            equipment.movementHistory.push({
              fromWarehouse: document.fromWarehouse,
              toWarehouse: document.toWarehouse,
              fromWarehouseName: document.fromWarehouseName,
              toWarehouseName: document.toWarehouseName,
              date: document.documentDate,
              movedBy: user._id.toString(),
              movedByName: user.name || user.login,
              reason: document.reason || '',
              notes: document.notes || ''
            });
            equipment.currentWarehouse = document.toWarehouse;
            equipment.currentWarehouseName = document.toWarehouseName;
            equipment.status = document.status === 'completed' ? 'in_stock' : 'in_transit';
            equipment.lastModified = new Date();
            await equipment.save();
            await logInventoryMovement({
              eventType: 'movement_document_completed',
              performedByLogin: user.login,
              performedByName: user.name || user.login,
              equipmentId: equipment._id,
              equipmentType: equipment.type,
              serialNumber: equipment.serialNumber,
              quantity: equipment.quantity || 1,
              fromStatus: prevStMovementPost,
              toStatus: 'in_stock',
              sourceWarehouseName: document.fromWarehouseName,
              destinationWarehouseName: document.toWarehouseName,
              notes: `Документ переміщення ${document.documentNumber} (створено завершеним)`
            });
          }
        }
      }
    }
    
    logPerformance('POST /api/documents/movement', startTime);
    res.status(201).json(document);
  } catch (error) {
    console.error('[ERROR] POST /api/documents/movement:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ДОКУМЕНТИ ВІДВАНТАЖЕННЯ ==========

// Отримання списку документів відвантаження
app.get('/api/documents/shipment', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, status, dateFrom, dateTo, client } = req.query;
    const query = {};
    
    if (warehouse) query.warehouse = warehouse;
    if (status) query.status = status;
    if (client) query.shippedTo = { $regex: client, $options: 'i' };
    if (dateFrom || dateTo) {
      query.documentDate = {};
      if (dateFrom) query.documentDate.$gte = new Date(dateFrom);
      if (dateTo) query.documentDate.$lte = new Date(dateTo);
    }
    
    const documents = await ShipmentDocument.find(query)
      .sort({ documentDate: -1 })
      .lean();
    
    logPerformance('GET /api/documents/shipment', startTime, documents.length);
    res.json(documents);
  } catch (error) {
    console.error('[ERROR] GET /api/documents/shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення документа відвантаження
app.put('/api/documents/shipment/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const document = await ShipmentDocument.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    
    logPerformance('PUT /api/documents/shipment/:id', startTime);
    res.json(document);
  } catch (error) {
    console.error('[ERROR] PUT /api/documents/shipment/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створення документа відвантаження
app.post('/api/documents/shipment', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }

    const bodyShip = req.body || {};
    if (bodyShip.status === 'shipped' && Array.isArray(bodyShip.items)) {
      for (const item of bodyShip.items) {
        if (!item.equipmentId) continue;
        const eq = await Equipment.findById(item.equipmentId);
        const okShipDocPre = await ensureWarehouseStaffEquipmentAccess(
          res,
          req.user,
          user,
          eq,
          'Оформити відвантаження за документом можна лише для товару на складі вашого регіону.'
        );
        if (!okShipDocPre) return;
      }
    }
    
    const documentNumber = await generateDocumentNumber('SHIP', ShipmentDocument);
    
    const document = await ShipmentDocument.create({
      ...req.body,
      documentNumber,
      createdBy: user._id.toString(),
      createdByName: user.name || user.login
    });
    
    // Оновлюємо обладнання при відвантаженні
    if (document.status === 'shipped' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            // Перевіряємо та ініціалізуємо shipmentHistory, якщо відсутня
            if (!equipment.shipmentHistory) {
              equipment.shipmentHistory = [];
            }
            if (!Array.isArray(equipment.shipmentHistory)) {
              equipment.shipmentHistory = [];
            }
            
            equipment.shipmentHistory.push({
              shippedTo: document.shippedTo,
              shippedDate: document.documentDate,
              shippedBy: user._id.toString(),
              shippedByName: user.name || user.login,
              orderNumber: document.orderNumber || '',
              invoiceNumber: document.invoiceNumber || '',
              clientEdrpou: document.clientEdrpou || '',
              clientAddress: document.clientAddress || '',
              invoiceRecipientDetails: document.invoiceRecipientDetails || '',
              totalPrice: item.totalPrice || document.totalAmount || null,
              notes: document.notes || ''
            });
            equipment.status = 'shipped';
            equipment.lastModified = new Date();
            await equipment.save();
          }
        }
      }
    }
    
    logPerformance('POST /api/documents/shipment', startTime);
    res.status(201).json(document);
  } catch (error) {
    console.error('[ERROR] POST /api/documents/shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ДОКУМЕНТИ ІНВЕНТАРИЗАЦІЇ ==========

// Отримання списку документів інвентаризації
app.get('/api/documents/inventory', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, status, dateFrom, dateTo } = req.query;
    const query = {};
    
    if (warehouse) query.warehouse = warehouse;
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.documentDate = {};
      if (dateFrom) query.documentDate.$gte = new Date(dateFrom);
      if (dateTo) query.documentDate.$lte = new Date(dateTo);
    }
    
    const documents = await InventoryDocument.find(query)
      .sort({ documentDate: -1 })
      .lean();
    
    logPerformance('GET /api/documents/inventory', startTime, documents.length);
    res.json(documents);
  } catch (error) {
    console.error('[ERROR] GET /api/documents/inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Оновлення документа інвентаризації
app.put('/api/documents/inventory/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const document = await InventoryDocument.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    
    logPerformance('PUT /api/documents/inventory/:id', startTime);
    res.json(document);
  } catch (error) {
    console.error('[ERROR] PUT /api/documents/inventory/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створення документа інвентаризації
app.post('/api/documents/inventory', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    const documentNumber = await generateDocumentNumber('INV', InventoryDocument);
    
    const document = await InventoryDocument.create({
      ...req.body,
      documentNumber,
      createdBy: user._id.toString(),
      createdByName: user.name || user.login
    });
    
    logPerformance('POST /api/documents/inventory', startTime);
    res.status(201).json(document);
  } catch (error) {
    console.error('[ERROR] POST /api/documents/inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Завершення інвентаризації
app.post('/api/documents/inventory/:id/complete', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    const document = await InventoryDocument.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    
    document.status = 'completed';
    document.completedBy = user._id.toString();
    document.completedByName = user.name || user.login;
    document.completedAt = new Date();
    
    // Обчислюємо різниці
    for (const item of document.items) {
      item.difference = item.quantityActual - item.quantityInSystem;
    }
    
    await document.save();
    
    logPerformance('POST /api/documents/inventory/:id/complete', startTime);
    res.json(document);
  } catch (error) {
    console.error('[ERROR] POST /api/documents/inventory/:id/complete:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== РЕЗЕРВУВАННЯ ==========

// Отримання списку резервувань
app.get('/api/reservations', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { status, client } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (client) query.clientName = { $regex: client, $options: 'i' };
    
    const reservations = await Reservation.find(query)
      .sort({ reservationDate: -1 })
      .lean();
    
    logPerformance('GET /api/reservations', startTime, reservations.length);
    res.json(reservations);
  } catch (error) {
    console.error('[ERROR] GET /api/reservations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Створення резервування
app.post('/api/reservations', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    // Конвертуємо дати з рядків в Date об'єкти та валідуємо дані
    const reservationData = { ...req.body };
    
    // Валідація обов'язкових полів
    if (!reservationData.clientName) {
      return res.status(400).json({ error: 'Назва клієнта обов\'язкова' });
    }
    
    if (!reservationData.items || !Array.isArray(reservationData.items) || reservationData.items.length === 0) {
      return res.status(400).json({ error: 'Додайте хоча б одну позицію обладнання' });
    }
    
    if (!reservationData.reservedUntil) {
      return res.status(400).json({ error: 'Термін резервування обов\'язковий' });
    }
    
    // Конвертуємо дати
    if (reservationData.reservationDate) {
      reservationData.reservationDate = new Date(reservationData.reservationDate);
      if (isNaN(reservationData.reservationDate.getTime())) {
        return res.status(400).json({ error: 'Невірний формат дати резервування' });
      }
    } else {
      reservationData.reservationDate = new Date();
    }
    
    if (reservationData.reservedUntil) {
      reservationData.reservedUntil = new Date(reservationData.reservedUntil);
      if (isNaN(reservationData.reservedUntil.getTime())) {
        return res.status(400).json({ error: 'Невірний формат терміну резервування' });
      }
    }
    
    // Валідація items
    for (const item of reservationData.items) {
      if (!item.equipmentId) {
        return res.status(400).json({ error: 'Всі позиції повинні мати ID обладнання' });
      }
      if (item.quantity && isNaN(parseInt(item.quantity))) {
        item.quantity = 1;
      }
    }
    
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `RES-${year}${month}`;
    
    const lastRes = await Reservation.findOne({
      reservationNumber: new RegExp(`^${prefix}`)
    }).sort({ reservationNumber: -1 });
    
    let sequence = 1;
    if (lastRes) {
      const lastSeq = parseInt(lastRes.reservationNumber.split('-').pop() || '0');
      sequence = lastSeq + 1;
    }
    
    const reservationNumber = `${prefix}-${String(sequence).padStart(4, '0')}`;
    
    // Нормалізуємо items - переконуємося, що це масив об'єктів
    const normalizedItems = (reservationData.items || []).map(item => {
      const normalized = {
        equipmentId: String(item.equipmentId || ''),
        type: String(item.type || ''),
        serialNumber: String(item.serialNumber || ''),
        quantity: parseInt(item.quantity) || 1,
        warehouse: String(item.warehouse || ''),
        warehouseName: String(item.warehouseName || ''),
        batchId: String(item.batchId || ''),
        notes: String(item.notes || '')
      };
      return normalized;
    });
    
    console.log('[DEBUG] POST /api/reservations - normalizedItems:', JSON.stringify(normalizedItems, null, 2));
    console.log('[DEBUG] POST /api/reservations - normalizedItems type:', Array.isArray(normalizedItems) ? 'array' : typeof normalizedItems);
    console.log('[DEBUG] POST /api/reservations - normalizedItems[0] type:', normalizedItems[0] ? typeof normalizedItems[0] : 'undefined');
    
    // Створюємо резервування з явною структурою
    const reservationDataToSave = {
      reservationNumber,
      reservationDate: reservationData.reservationDate,
      clientName: reservationData.clientName,
      clientEdrpou: reservationData.clientEdrpou || '',
      orderNumber: reservationData.orderNumber || '',
      reservedUntil: reservationData.reservedUntil,
      status: reservationData.status || 'active',
      notes: reservationData.notes || '',
      items: normalizedItems,
      createdBy: user._id.toString(),
      createdByName: user.name || user.login
    };
    
    console.log('[DEBUG] POST /api/reservations - reservationDataToSave.items:', JSON.stringify(reservationDataToSave.items, null, 2));
    
    const reservation = new Reservation(reservationDataToSave);
    
    await reservation.save();
    
    // Резервуємо обладнання
    if (reservation.items && reservation.items.length > 0) {
      for (const item of reservation.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
            // Перевіряємо, чи обладнання не вже зарезервоване
            if (equipment.status === 'reserved') {
              console.warn(`[WARNING] Обладнання ${equipment._id} вже зарезервоване`);
            }
            equipment.status = 'reserved';
            equipment.reservedBy = user._id.toString();
            equipment.reservedByName = user.name || user.login;
            equipment.reservedByLogin = user.login;
            equipment.reservedAt = new Date();
            equipment.lastModified = new Date();
            await equipment.save();
          } else {
            console.warn(`[WARNING] Обладнання ${item.equipmentId} не знайдено`);
          }
        }
      }
    }
    
    logPerformance('POST /api/reservations', startTime);
    res.status(201).json(reservation);
  } catch (error) {
    console.error('[ERROR] POST /api/reservations:', error);
    console.error('[ERROR] Stack:', error.stack);
    console.error('[ERROR] Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ error: error.message });
  }
});

// Скасування резервування
app.post('/api/reservations/:id/cancel', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const user = await User.findOne({ login: req.user.login });
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
    }
    
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Резервування не знайдено' });
    }
    
    reservation.status = 'cancelled';
    reservation.cancelledBy = user._id.toString();
    reservation.cancelledByName = user.name || user.login;
    reservation.cancelledAt = new Date();
    
    // Знімаємо резервування з обладнання
    if (reservation.items) {
      for (const item of reservation.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment && equipment.status === 'reserved') {
            equipment.status = 'in_stock';
            equipment.reservedBy = undefined;
            equipment.reservedByName = undefined;
            equipment.reservedByLogin = undefined;
            equipment.reservedAt = undefined;
            equipment.lastModified = new Date();
            await equipment.save();
          }
        }
      }
    }
    
    await reservation.save();
    
    logPerformance('POST /api/reservations/:id/cancel', startTime);
    res.json(reservation);
  } catch (error) {
    console.error('[ERROR] POST /api/reservations/:id/cancel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ВАРТІСНИЙ ОБЛІК ==========

// Звіт по вартісному обліку
app.get('/api/equipment/cost-report', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, method = 'average' } = req.query;
    const query = { isDeleted: false, status: { $in: ['in_stock', 'reserved'] } };
    
    if (warehouse) query.currentWarehouse = warehouse;
    
    const equipment = await Equipment.find(query).lean();
    
    // Групуємо по типах обладнання
    const grouped = {};
    equipment.forEach(item => {
      const key = item.type || 'Без типу';
      if (!grouped[key]) {
        grouped[key] = {
          type: key,
          items: [],
          totalQuantity: 0,
          totalCost: 0
        };
      }
      grouped[key].items.push(item);
      grouped[key].totalQuantity += item.quantity || 1;
    });
    
    // Обчислюємо собівартість за вибраним методом
    Object.keys(grouped).forEach(key => {
      const group = grouped[key];
      
      if (method === 'average') {
        // Середня собівартість
        let totalCost = 0;
        let totalQty = 0;
        group.items.forEach(item => {
          const price = item.batchPriceWithVAT || 0;
          const qty = item.quantity || 1;
          totalCost += price * qty;
          totalQty += qty;
        });
        group.averageCost = totalQty > 0 ? totalCost / totalQty : 0;
        group.totalCost = totalCost;
      } else if (method === 'fifo') {
        // FIFO - перший прийшов, перший пішов (сортуємо по даті надходження)
        const sorted = [...group.items].sort((a, b) => 
          new Date(a.addedAt || 0) - new Date(b.addedAt || 0)
        );
        let totalCost = 0;
        sorted.forEach(item => {
          const price = item.batchPriceWithVAT || 0;
          const qty = item.quantity || 1;
          totalCost += price * qty;
        });
        group.totalCost = totalCost;
        group.fifoCost = totalCost;
      } else if (method === 'lifo') {
        // LIFO - останній прийшов, перший пішов (сортуємо по даті надходження в зворотному порядку)
        const sorted = [...group.items].sort((a, b) => 
          new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
        );
        let totalCost = 0;
        sorted.forEach(item => {
          const price = item.batchPriceWithVAT || 0;
          const qty = item.quantity || 1;
          totalCost += price * qty;
        });
        group.totalCost = totalCost;
        group.lifoCost = totalCost;
      }
    });
    
    const result = {
      method,
      warehouse: warehouse || 'Всі склади',
      reportDate: new Date().toISOString(),
      groups: Object.values(grouped),
      summary: {
        totalTypes: Object.keys(grouped).length,
        totalItems: equipment.length,
        totalQuantity: equipment.reduce((sum, item) => sum + (item.quantity || 1), 0),
        totalCost: Object.values(grouped).reduce((sum, group) => sum + (group.totalCost || 0), 0)
      }
    };
    
    logPerformance('GET /api/equipment/cost-report', startTime);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] GET /api/equipment/cost-report:', error);
    res.status(500).json({ error: error.message });
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
    
    // "Створив" — завжди автор заявки (requestAuthor), не інженер. Для task_created — user як fallback
    const createdBy = (task.requestAuthor && task.requestAuthor.trim())
      || (type === 'task_created' ? (user?.name || user?.login) : null)
      || task.createdByName
      || task.createdBy
      || task.engineer1
      || user?.name
      || 'Система';

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

  /**
   * Той самий зміст, що formatTaskMessage, але без HTML — для FCM (push) і data.expandedBody.
   */
  formatTaskMessagePlain(type, task, user) {
    const displayStatus = type === 'task_completed' ? 'Виконано' : (task.status || 'Н/Д');

    let commentsInfo = '';
    if (task.warehouseComment) commentsInfo += `\n📦 Коментар складу: ${task.warehouseComment}`;
    if (task.accountantComment) commentsInfo += `\n💰 Коментар бухгалтера: ${task.accountantComment}`;

    const createdBy = (task.requestAuthor && task.requestAuthor.trim())
      || (type === 'task_created' ? (user?.name || user?.login) : null)
      || task.createdByName
      || task.createdBy
      || task.engineer1
      || user?.name
      || 'Система';

    const typeNames = {
      task_created: '🆕 Нова заявка',
      task_completed: '✅ Заявка виконана',
      task_approval: '⏳ Потребує підтвердження Завсклада',
      accountant_approval: '💰 Потребує затвердження Бухгалтера',
      task_approved: '✅ Заявка затверджена',
      task_rejected: '❌ Заявка відхилена',
      invoice_request: '📄 Запит на рахунок',
      invoice_completed: '📄 Рахунок завантажено'
    };

    const header = `🔔 ${typeNames[type] || 'Оновлення'}`;
    const baseMessage = `${header}

📋 Номер: ${task.requestNumber || 'Н/Д'}
👤 Створив: ${createdBy}
📊 Статус: ${displayStatus}
📅 Дата: ${task.date || 'Н/Д'}
📍 Регіон: ${task.serviceRegion || 'Н/Д'}
👥 Замовник: ${task.client || 'Н/Д'}
🏠 Адреса: ${task.address || 'Н/Д'}
⚙️ Обладнання: ${task.equipment || 'Н/Д'}${commentsInfo}`;

    const actions = {
      task_created: '\n\n💡 Дія: Розглянути та призначити виконавця',
      task_completed: '\n\n⏳ Очікує підтвердження від:\n• Зав. склад\n• Бухгалтер',
      task_approval: '\n\n📋 Необхідно перевірити',
      accountant_approval: '\n\n💰 Завсклад підтвердив. Очікує затвердження бухгалтера.',
      task_approved: '\n\n🎉 Заявка готова!',
      task_rejected: '\n\n⚠️ Необхідно виправити зауваження',
      invoice_request: '\n\n📄 Подано запит на рахунок',
      invoice_completed: '\n\n✅ Рахунок готовий до завантаження'
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

  // Користувачі для push (мобільний додаток) — та сама логіка notificationSettings + регіон
  async getUsersForFcmNotification(type, task) {
    try {
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
      if (!settingField) return [];

      const query = {
        fcmToken: { $exists: true, $ne: null, $ne: '' },
        [`notificationSettings.${settingField}`]: true
      };
      const users = await User.find(query).lean();
      const filtered = users.filter(u => {
        if (u.region === 'Україна') return true;
        return task.serviceRegion === u.region;
      });
      return filtered;
    } catch (error) {
      console.error('[FCM] Помилка getUsersForFcmNotification:', error);
      return [];
    }
  }
}

const telegramService = new TelegramService();

// Відправка push на мобільні пристрої
async function sendPushToUsers(users, { title, body, data = {} }) {
  if (!firebaseAdmin) return;
  const tokens = users.map(u => u.fcmToken).filter(Boolean);
  if (tokens.length === 0) return;

  const dataStrings = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [String(k), v == null ? '' : String(v)])
  );

  const msg = {
    notification: { title, body },
    data: dataStrings,
    tokens,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } }
  };
  try {
    const res = await firebaseAdmin.messaging().sendEachForMulticast(msg);
    const failed = res.responses.map((r, i) => (!r.success ? tokens[i] : null)).filter(Boolean);
    if (failed.length) {
      await User.updateMany({ fcmToken: { $in: failed } }, { $unset: { fcmToken: 1 } });
    }
  } catch (err) {
    console.error('[FCM] Помилка відправки:', err);
  }
}

async function sendFcmTaskNotification(type, task, user) {
  try {
    const users = await telegramService.getUsersForFcmNotification(type, task);
    if (users.length === 0) return;

    const fullPlain = telegramService.formatTaskMessagePlain(type, task, user);
    const maxData = 3500;
    const expandedBody = fullPlain.length > maxData ? `${fullPlain.slice(0, maxData)}…` : fullPlain;

    const nl = expandedBody.indexOf('\n');
    let title = nl >= 0 ? expandedBody.slice(0, nl).trim() : 'DTS';
    let body = nl >= 0 ? expandedBody.slice(nl + 1).trim() : expandedBody;
    if (!body) body = expandedBody;

    const displayStatus = type === 'task_completed' ? 'Виконано' : (task.status || '');
    const createdBy = (task.requestAuthor && task.requestAuthor.trim())
      || (type === 'task_created' ? (user?.name || user?.login) : null)
      || task.createdByName
      || task.createdBy
      || task.engineer1
      || user?.name
      || '';

    await sendPushToUsers(users, {
      title,
      body,
      data: {
        type,
        taskId: (task._id || task.id) ? String(task._id || task.id) : '',
        expandedBody,
        taskNumber: task.requestNumber != null ? String(task.requestNumber) : '',
        createdBy: createdBy ? String(createdBy) : '',
        status: displayStatus ? String(displayStatus) : '',
        taskDate: task.date != null ? String(task.date) : '',
        region: task.serviceRegion != null ? String(task.serviceRegion) : '',
        customer: task.client != null ? String(task.client) : '',
        address: task.address != null ? String(task.address) : '',
        equipment: task.equipment != null ? String(task.equipment) : ''
      }
    });
  } catch (err) {
    console.error('[FCM] Помилка sendFcmTaskNotification:', err);
  }
}

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
