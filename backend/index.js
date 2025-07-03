const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3001;

const MONGODB_URI = process.env.MONGODB_URI;

// Функція для підключення до MongoDB
async function connectToMongoDB() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI не встановлено!');
    return false;
  }
  
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

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
app.use((req, res, next) => {
  if (req.path === '/api/ping') {
    return next(); // Пропускаємо ping запити
  }
  
  if (mongoose.connection.readyState !== 1) {
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
    const users = await User.find();
    res.json(users);
  } catch (error) {
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
    const tasks = await Task.find();
    
    // Додаємо числовий id для сумісності з фронтендом
    const tasksWithId = tasks.map(task => ({
      ...task.toObject(),
      id: task._id.toString()
    }));
    
    res.json(tasksWithId);
  } catch (error) {
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
    
    await newTask.save();
    console.log('[DEBUG] POST /api/tasks - заявка збережена успішно, _id:', newTask._id);
    
    // Повертаємо заявку з числовим id для сумісності з фронтендом
    const responseTask = {
      ...newTask.toObject(),
      id: newTask._id.toString() // Використовуємо _id як числовий id
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
    // Шукаємо завдання за _id (якщо id виглядає як ObjectId) або за числовим id
    let task;
    if (/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      // Якщо id виглядає як ObjectId
      task = await Task.findById(req.params.id);
    } else {
      // Якщо id числовий
      task = await Task.findOne({ id: Number(req.params.id) });
    }
    
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    // Видаляємо поле id з оновлення, якщо воно є
    const { id, ...updateData } = req.body;
    Object.assign(task, updateData);
    await task.save();
    
    // Повертаємо заявку з числовим id для сумісності
    const responseTask = {
      ...task.toObject(),
      id: task._id.toString()
    };
    
    res.json({ success: true, task: responseTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    let result;
    if (/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      // Якщо id виглядає як ObjectId
      result = await Task.findByIdAndDelete(req.params.id);
    } else {
      // Якщо id числовий
      result = await Task.deleteOne({ id: Number(req.params.id) });
    }
    
    res.json({ success: true, removed: result ? 1 : 0 });
  } catch (error) {
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
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Некоректний обʼєкт accessRules' });
    }
    let doc = await AccessRules.findOne();
    if (!doc) doc = new AccessRules({ rules: req.body });
    else doc.rules = req.body;
    await doc.save();
    console.log('[ACCESS RULES] Збережено:', JSON.stringify(doc.rules, null, 2));
    res.json({ success: true });
  } catch (error) {
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
    const user = await User.findOne({ login, password });
    if (user) {
      const { password: _, ...userWithoutPassword } = user.toObject();
      res.json({ success: true, user: userWithoutPassword });
    } else {
      res.status(401).json({ error: 'Невірний логін або пароль' });
    }
  } catch (error) {
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

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
}); 