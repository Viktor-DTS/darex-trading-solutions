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
const { Readable } = require('stream');

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
  
  // Категорії матеріальних цінностей (вибір тільки однієї опції)
  materialValueType: { 
    type: String, 
    enum: ['', 'service', 'electroinstall', 'internal'], 
    default: '' 
  },  // 'service' - Комплектуючі ЗІП (Сервіс), 'electroinstall' - Комплектуючі для електромонтажних робіт, 'internal' - Обладнання для внутрішніх потреб
  
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
    enum: ['in_stock', 'reserved', 'shipped', 'in_transit', 'deleted', 'written_off'],
    default: 'in_stock'
  },
  
  // Резервування
  reservedBy: String,               // ID користувача, який зарезервував
  reservedByName: String,            // ПІБ користувача, який зарезервував
  reservedAt: Date,                 // Дата резервування
  reservationClientName: String,    // Назва клієнта для резервування
  reservationNotes: String,         // Примітки до резервування
  reservationEndDate: Date,         // Дата закінчення резервування
  
  // Історія резервувань
  reservationHistory: [{
    action: { type: String, enum: ['reserved', 'cancelled'] }, // Тип дії
    date: Date,                       // Дата та час дії
    userId: String,                   // ID користувача
    userName: String,                 // ПІБ користувача
    clientName: String,               // Назва клієнта (при резервуванні)
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
  testingMaterialsArray: [{         // Використані матеріали у форматі масиву об'єктів (нове поле)
    type: String,                    // Тип матеріалу (наприклад: "Олива SAE10W40")
    quantity: String,                // Кількість (наприклад: "14")
    unit: String                     // Одиниця виміру (наприклад: "л.")
  }],
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

const Equipment = mongoose.model('Equipment', equipmentSchema);

// Схема для складів
const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  region: String,
  address: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

warehouseSchema.index({ name: 1 }, { unique: true });
const Warehouse = mongoose.model('Warehouse', warehouseSchema);

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
movementDocumentSchema.index({ fromWarehouse: 1, toWarehouse: 1 });
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
          // 2. paymentType не 'Готівка' і не 'Інше'
          // 3. debtStatus НЕ 'Документи в наявності' (виключаємо заявки з активованим чекбоксом)
          matchStage.status = 'Виконано';
          matchStage.paymentType = { $exists: true, $ne: '', $ne: 'не вибрано', $nin: ['Готівка', 'Інше'] };
          matchStage.debtStatus = { $ne: 'Документи в наявності' };
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
    
    // Автоматичне встановлення autoCompletedAt якщо заявка створюється одразу зі статусом "Виконано"
    if (taskData.status === 'Виконано' && !taskData.autoCompletedAt) {
      taskData.autoCompletedAt = new Date();
      console.log('[DEBUG] POST /api/tasks - автоматично встановлено autoCompletedAt при створенні зі статусом "Виконано":', taskData.autoCompletedAt);
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
// API ДЛЯ СКЛАДСЬКОГО ОБЛІКУ ОБЛАДНАННЯ
// ============================================

// Отримання списку складів
app.get('/api/warehouses', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const warehouses = await Warehouse.find({ isActive: true })
      .sort({ name: 1 })
      .lean();
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
    const equipmentData = req.body;
    const user = await User.findOne({ login: req.user.login });
    
    if (!user) {
      return res.status(401).json({ error: 'Користувач не знайдено' });
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
        type: equipmentData.type,
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
      
      // Додаємо manufacturer до пошуку
      if (manufacturerValue) {
        // Якщо manufacturer вказаний, шукаємо з таким же manufacturer
        searchQuery.manufacturer = manufacturerValue;
      } else {
        // Якщо manufacturer не вказаний, шукаємо записи де manufacturer також null/undefined/порожній
        searchQuery.$and.push({
          $or: [
            { manufacturer: null },
            { manufacturer: { $exists: false } },
            { manufacturer: '' }
          ]
        });
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
          // batchId та batchIndex не встановлюємо взагалі (не передаємо поле)
          // serialNumber не встановлюємо (не передаємо поле взагалі)
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
        // batchId та batchIndex не встановлюємо взагалі (не передаємо поле)
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

// Отримання списку обладнання
app.get('/api/equipment', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { warehouse, status, region, search } = req.query;
    const query = {};
    
    if (warehouse) query.currentWarehouse = warehouse;
    if (status) query.status = status;
    if (region) query.region = region;
    if (search) {
      query.$or = [
        { serialNumber: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } }
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
      testingStatus: { $in: statusArray }
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
    const equipment = await Equipment.findById(req.params.id).lean();
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

    const { clientName, notes, endDate } = req.body;
    
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'Назва клієнта обов\'язкова' });
    }

    equipment.status = 'reserved';
    equipment.reservedBy = user._id.toString();
    equipment.reservedByName = user.name || user.login;
    equipment.reservedAt = new Date();
    equipment.reservationClientName = clientName.trim();
    equipment.reservationNotes = notes || '';
    equipment.reservationEndDate = endDate ? new Date(endDate) : null;
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
        details: { reservedByName: equipment.reservedByName, clientName }
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    logPerformance('POST /api/equipment/:id/reserve', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/reserve:', error);
    logPerformance('POST /api/equipment/:id/reserve', startTime);
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

    // Перевірка прав на скасування: адмін, той хто зарезервував, або закінчився термін
    const isAdmin = ['admin', 'administrator'].includes(user.role);
    const isOwner = equipment.reservedBy === user._id.toString();
    const isExpired = equipment.reservationEndDate && new Date(equipment.reservationEndDate) < new Date();
    
    if (!isAdmin && !isOwner && !isExpired) {
      return res.status(403).json({ 
        error: 'Скасувати резервування може тільки адміністратор або той, хто його створив' 
      });
    }

    // Визначаємо причину скасування
    let cancelReason = 'manual';
    if (isExpired) {
      cancelReason = 'expired';
    } else if (isAdmin && !isOwner) {
      cancelReason = 'admin';
    }

    // Додаємо до історії резервувань
    if (!equipment.reservationHistory) {
      equipment.reservationHistory = [];
    }
    equipment.reservationHistory.push({
      action: 'cancelled',
      date: new Date(),
      userId: user._id.toString(),
      userName: user.name || user.login,
      clientName: equipment.reservationClientName,
      cancelReason: cancelReason,
      cancelledBy: equipment.reservedBy,
      cancelledByName: equipment.reservedByName,
      notes: cancelReason === 'expired' ? 'Автоматичне скасування: закінчився термін резервування' : 
             cancelReason === 'admin' ? `Скасовано адміністратором: ${user.name || user.login}` : ''
    });

    equipment.status = 'in_stock';
    equipment.reservedBy = undefined;
    equipment.reservedByName = undefined;
    equipment.reservedAt = undefined;
    equipment.reservationClientName = undefined;
    equipment.reservationNotes = undefined;
    equipment.reservationEndDate = undefined;
    equipment.lastModified = new Date();

    await equipment.save();

    // Логування
    try {
      await EventLog.create({
        userId: user._id.toString(),
        userName: user.name || user.login,
        userRole: user.role,
        action: 'cancel_reserve',
        entityType: 'equipment',
        entityId: equipment._id.toString(),
        description: `Скасовано резервування обладнання ${equipment.type} (№${equipment.serialNumber || 'без номера'})`,
        details: {}
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }

    logPerformance('POST /api/equipment/:id/cancel-reserve', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/cancel-reserve:', error);
    logPerformance('POST /api/equipment/:id/cancel-reserve', startTime);
    res.status(500).json({ error: error.message });
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
    // Використовуємо прямий MongoDB запит для завантаження, щоб повністю обійти валідацію Mongoose
    // Це необхідно, оскільки в базі є старе поле testingMaterials з неправильним типом
    const equipmentDoc = await mongoose.connection.db.collection('equipment').findOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) }
    );
    
    if (!equipmentDoc) {
      return res.status(404).json({ error: 'Обладнання не знайдено' });
    }
    
    // Конвертуємо MongoDB документ в простий об'єкт
    const equipment = equipmentDoc;

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
    
    // Використовуємо прямий MongoDB запит через колекцію, щоб повністю обійти валідацію Mongoose
    // Це необхідно, оскільки в базі є старе поле testingMaterials з неправильним типом
    // Зберігаємо матеріали в нове поле testingMaterialsArray (масив об'єктів)
    // Старе поле testingMaterialsJson залишаємо для сумісності
    // Видаляємо старе поле testingMaterials, щоб уникнути помилок валідації
    const updateData = {
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
    };
    
    // Використовуємо прямий MongoDB запит - це повністю обходить валідацію Mongoose
    // Використовуємо updateOne замість findOneAndUpdate, щоб не повертати документ і уникнути валідації
    const updateResult = await mongoose.connection.db.collection('equipment').updateOne(
      { _id: new mongoose.Types.ObjectId(equipment._id) },
      updateData,
      { 
        bypassDocumentValidation: true // Обходимо валідацію MongoDB
      }
    );
    
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: 'Обладнання не знайдено після оновлення' });
    }
    
    // Завантажуємо оновлений документ через прямий MongoDB запит (не через Mongoose)
    const updatedDoc = await mongoose.connection.db.collection('equipment').findOne(
      { _id: new mongoose.Types.ObjectId(equipment._id) }
    );
    
    if (!updatedDoc) {
      return res.status(404).json({ error: 'Обладнання не знайдено після оновлення' });
    }
    
    // Видаляємо поле testingMaterials з результату, якщо воно все ще є (для безпеки)
    if (updatedDoc.testingMaterials !== undefined) {
      delete updatedDoc.testingMaterials;
    }

    logPerformance('POST /api/equipment/:id/complete-testing', startTime);
    
    // Повертаємо результат безпосередньо з MongoDB, обходячи будь-яку валідацію
    // Конвертуємо _id в рядок для сумісності з фронтендом
    const responseData = {
      ...updatedDoc,
      _id: updatedDoc._id.toString()
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

    equipment.testingStatus = 'none';
    equipment.testingRequestedBy = undefined;
    equipment.testingRequestedByName = undefined;
    equipment.testingRequestedAt = undefined;
    equipment.testingTakenBy = undefined;
    equipment.testingTakenByName = undefined;
    equipment.testingTakenAt = undefined;
    equipment.lastModified = new Date();

    await equipment.save();

    logPerformance('POST /api/equipment/:id/cancel-testing', startTime);
    res.json(equipment);
  } catch (error) {
    console.error('[ERROR] POST /api/equipment/:id/cancel-testing:', error);
    logPerformance('POST /api/equipment/:id/cancel-testing', startTime);
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
    equipment.lastModified = new Date();

    await equipment.save();

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
    
    // Знаходимо всі одиниці партії на складі
    const batchItems = await Equipment.find({
      batchId: batchId,
      currentWarehouse: fromWarehouse,
      status: 'in_stock'
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
      
      item.shipmentHistory.push(shipment);
      item.status = 'shipped';
      item.lastModified = new Date();
      
      try {
        await item.save();
        shippedItems.push(item);
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
      
      equipment.shipmentHistory.push(shipment);
      equipment.status = 'shipped';
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
      
      equipment.shipmentHistory.push(shipment);
      equipment.quantity = availableQuantity - quantity;
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
    
    equipment.movementHistory.push(movement);
    equipment.currentWarehouse = toWarehouse;
    equipment.currentWarehouseName = toWarehouseName;
    equipment.status = 'in_transit';
    equipment.lastModified = new Date();
    
    await equipment.save();
    
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
    
    equipment.shipmentHistory.push(shipment);
    equipment.status = 'shipped';
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

    // Оновлюємо статус на in_stock
    const updatedItems = [];
    for (const item of equipmentList) {
      item.status = 'in_stock';
      item.lastModified = new Date();
      await item.save();
      updatedItems.push(item);
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
    
    equipment.status = status;
    equipment.lastModified = new Date();
    await equipment.save();
    
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
            equipment.currentWarehouse = document.warehouse;
            equipment.currentWarehouseName = document.warehouseName;
            equipment.status = 'in_stock';
            equipment.lastModified = new Date();
            await equipment.save();
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
    const document = await ReceiptDocument.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
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
    
    console.log('[DEBUG] GET /api/documents/movement - параметри:', { warehouse, status, dateFrom, dateTo });
    
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
    
    console.log('[DEBUG] GET /api/documents/movement - запит:', JSON.stringify(query, null, 2));
    
    // Перевіряємо загальну кількість документів
    const totalCount = await MovementDocument.countDocuments({});
    console.log('[DEBUG] GET /api/documents/movement - всього документів в БД:', totalCount);
    
    const documents = await MovementDocument.find(query)
      .sort({ documentDate: -1 })
      .lean();
    
    console.log('[DEBUG] GET /api/documents/movement - знайдено документів:', documents.length);
    if (documents.length > 0) {
      console.log('[DEBUG] Перший документ:', {
        documentNumber: documents[0].documentNumber,
        documentDate: documents[0].documentDate,
        fromWarehouse: documents[0].fromWarehouseName,
        toWarehouse: documents[0].toWarehouseName,
        status: documents[0].status
      });
    }
    
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
    
    const document = await MovementDocument.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    
    // Оновлюємо обладнання при завершенні переміщення
    if (document.status === 'completed' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
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
    
    // Оновлюємо обладнання при завершенні переміщення
    if (document.status === 'completed' && document.items) {
      for (const item of document.items) {
        if (item.equipmentId) {
          const equipment = await Equipment.findById(item.equipmentId);
          if (equipment) {
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
