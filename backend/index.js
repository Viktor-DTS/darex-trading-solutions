const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const reports = [];
const USERS_FILE = path.join(__dirname, 'users.json');
const INITIAL_USERS_FILE = path.join(__dirname, 'initial-users.json');

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

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
}); 