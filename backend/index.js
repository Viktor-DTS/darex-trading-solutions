const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { getFile, createOrUpdateFile } = require('./githubStorage');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const reports = [];
const USERS_FILE = path.join(__dirname, 'users.json');
const INITIAL_USERS_FILE = path.join(__dirname, 'initial-users.json');
const tasksFile = path.join(__dirname, 'data', 'tasks.json');
const accessRulesFile = path.join(__dirname, 'data', 'accessRules.json');
const rolesFile = path.join(__dirname, 'data', 'roles.json');
const regionsFile = path.join(__dirname, 'data', 'regions.json');

// Функція для створення директорії data якщо вона не існує
const ensureDataDirectory = () => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Створено директорію data');
  }
};

// Викликаємо функцію при запуску сервера
ensureDataDirectory();

// Функція для завантаження користувачів
const loadUsers = () => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Помилка завантаження користувачів:', error);
  }
  return [];
};

// Функція для збереження користувачів
const saveUsers = (users) => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Помилка збереження користувачів:', error);
    return false;
  }
};

// Функція для ініціалізації користувачів
const initializeUsers = () => {
  try {
    if (!fs.existsSync(USERS_FILE) && fs.existsSync(INITIAL_USERS_FILE)) {
      const initialUsers = JSON.parse(fs.readFileSync(INITIAL_USERS_FILE, 'utf8'));
      saveUsers(initialUsers);
      console.log('Користувачів ініціалізовано');
      return true;
    }
  } catch (error) {
    console.error('Помилка ініціалізації користувачів:', error);
  }
  return false;
};

// Ініціалізуємо користувачів при запуску сервера
initializeUsers();

// API для ініціалізації користувачів
app.post('/api/initialize-users', (req, res) => {
  const success = initializeUsers();
  if (success) {
    res.json({ success: true, message: 'Користувачів ініціалізовано' });
  } else {
    res.status(500).json({ error: 'Помилка ініціалізації користувачів' });
  }
});

// API для авторизації користувача
app.post('/api/auth', (req, res) => {
  const { login, password } = req.body;
  
  if (!login || !password) {
    return res.status(400).json({ error: 'Відсутні логін або пароль' });
  }
  
  const users = loadUsers();
  const user = users.find(u => u.login === login && u.password === password);
  
  if (user) {
    // Повертаємо користувача без пароля
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
  } else {
    res.status(401).json({ error: 'Невірний логін або пароль' });
  }
});

// API для отримання всіх користувачів
app.get('/api/users', (req, res) => {
  const users = loadUsers();
  res.json(users);
});

// API для отримання конкретного користувача
app.get('/api/users/:login', (req, res) => {
  const { login } = req.params;
  const users = loadUsers();
  const user = users.find(u => u.login === login);
  
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'Користувача не знайдено' });
  }
});

// API для оновлення налаштувань колонок користувача
app.post('/api/users/:login/columns-settings', (req, res) => {
  const { login } = req.params;
  const { area, visible, order } = req.body;
  
  if (!area || !visible || !order) {
    return res.status(400).json({ error: 'Відсутні обов\'язкові поля: area, visible, order' });
  }
  
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.login === login);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Користувача не знайдено' });
  }
  
  // Ініціалізуємо columnsSettings якщо його немає
  if (!users[userIndex].columnsSettings) {
    users[userIndex].columnsSettings = {};
  }
  
  // Оновлюємо налаштування для конкретної області
  users[userIndex].columnsSettings[area] = {
    visible: visible,
    order: order
  };
  
  if (saveUsers(users)) {
    res.json({ success: true, message: 'Налаштування збережено' });
  } else {
    res.status(500).json({ error: 'Помилка збереження налаштувань' });
  }
});

// API для отримання налаштувань колонок користувача
app.get('/api/users/:login/columns-settings/:area', (req, res) => {
  const { login, area } = req.params;
  const users = loadUsers();
  const user = users.find(u => u.login === login);
  
  if (!user) {
    return res.status(404).json({ error: 'Користувача не знайдено' });
  }
  
  const settings = user.columnsSettings?.[area];
  if (settings) {
    res.json(settings);
  } else {
    res.json({ visible: [], order: [] });
  }
});

// API для створення/оновлення користувача
app.post('/api/users', (req, res) => {
  const userData = req.body;
  const users = loadUsers();
  
  const existingUserIndex = users.findIndex(u => u.login === userData.login);
  
  if (existingUserIndex !== -1) {
    // Оновлюємо існуючого користувача
    users[existingUserIndex] = { ...users[existingUserIndex], ...userData };
  } else {
    // Додаємо нового користувача
    users.push({ ...userData, id: Date.now() });
  }
  
  if (saveUsers(users)) {
    res.json({ success: true, message: 'Користувача збережено' });
  } else {
    res.status(500).json({ error: 'Помилка збереження користувача' });
  }
});

// API для видалення користувача
app.delete('/api/users/:login', (req, res) => {
  const { login } = req.params;
  const users = loadUsers();
  const filteredUsers = users.filter(u => u.login !== login);
  
  if (filteredUsers.length === users.length) {
    return res.status(404).json({ error: 'Користувача не знайдено' });
  }
  
  if (saveUsers(filteredUsers)) {
    res.json({ success: true, message: 'Користувача видалено' });
  } else {
    res.status(500).json({ error: 'Помилка видалення користувача' });
  }
});

app.post('/api/report', (req, res) => {
  const report = req.body;
  reports.push({ ...report, createdAt: new Date() });
  res.json({ success: true, message: 'Звіт збережено!' });
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'Сервер працює!' });
});

app.get('/api/reports', (req, res) => {
  res.json(reports);
});

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  ensureDataDirectory();
  fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
}

// --- API для заявок ---
app.get('/api/tasks', async (req, res) => {
  try {
    const { content } = await getFile('backend/data/tasks.json');
    if (content) {
      res.json(JSON.parse(content));
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: 'GitHub read error: ' + error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { content } = await getFile('backend/data/tasks.json');
    const tasks = content ? JSON.parse(content) : [];
    const newTask = { ...req.body, id: Date.now() };
    tasks.push(newTask);
    await createOrUpdateFile(
      'backend/data/tasks.json',
      JSON.stringify(tasks, null, 2),
      'Add task via API'
    );
    res.json({ success: true, task: newTask });
  } catch (error) {
    res.status(500).json({ error: 'GitHub write error: ' + error.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { content } = await getFile('backend/data/tasks.json');
    let tasks = content ? JSON.parse(content) : [];
    const idx = tasks.findIndex(t => String(t.id) === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    tasks[idx] = { ...tasks[idx], ...req.body };
    await createOrUpdateFile(
      'backend/data/tasks.json',
      JSON.stringify(tasks, null, 2),
      'Update task via API'
    );
    res.json({ success: true, task: tasks[idx] });
  } catch (error) {
    res.status(500).json({ error: 'GitHub write error: ' + error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { content } = await getFile('backend/data/tasks.json');
    let tasks = content ? JSON.parse(content) : [];
    const before = tasks.length;
    tasks = tasks.filter(t => String(t.id) !== req.params.id);
    await createOrUpdateFile(
      'backend/data/tasks.json',
      JSON.stringify(tasks, null, 2),
      'Delete task via API'
    );
    res.json({ success: true, removed: before - tasks.length });
  } catch (error) {
    res.status(500).json({ error: 'GitHub write error: ' + error.message });
  }
});

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function writeJson(file, data) {
  ensureDataDirectory();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- API для accessRules ---
app.get('/api/accessRules', async (req, res) => {
  try {
    const { content } = await getFile('backend/data/accessRules.json');
    if (content) {
      res.json(JSON.parse(content));
    } else {
      res.json({});
    }
  } catch (error) {
    res.status(500).json({ error: 'GitHub read error: ' + error.message });
  }
});
app.post('/api/accessRules', async (req, res) => {
  try {
    await createOrUpdateFile(
      'backend/data/accessRules.json',
      JSON.stringify(req.body, null, 2),
      'Update accessRules.json via API'
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'GitHub write error: ' + error.message });
  }
});

// --- API для roles ---
app.get('/api/roles', (req, res) => {
  res.json(readJson(rolesFile) || []);
});
app.post('/api/roles', (req, res) => {
  writeJson(rolesFile, req.body);
  res.json({ success: true });
});

// --- API для regions ---
app.get('/api/regions', (req, res) => {
  res.json(readJson(regionsFile) || []);
});
app.post('/api/regions', (req, res) => {
  writeJson(regionsFile, req.body);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
}); 