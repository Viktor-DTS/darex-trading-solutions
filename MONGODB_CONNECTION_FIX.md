# Вирішення проблеми з відключенням MongoDB

## Проблема
Після періоду неактивності програма відключалася від бази даних MongoDB Atlas, що призводило до втрати даних та необхідності перезавантаження сторінки.

## Рішення

### 1. Оновлення налаштувань підключення MongoDB (Backend)

У файлі `backend/index.js` додано наступні параметри для підключення:

```javascript
await mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Параметри для підтримки постійного з'єднання
  maxPoolSize: 10, // Максимальна кількість з'єднань в пулі
  minPoolSize: 2,  // Мінімальна кількість з'єднань в пулі
  maxIdleTimeMS: 30000, // Час неактивності перед закриттям з'єднання (30 секунд)
  serverSelectionTimeoutMS: 5000, // Таймаут вибору сервера
  socketTimeoutMS: 45000, // Таймаут сокета
  heartbeatFrequencyMS: 10000, // Частота heartbeat (10 секунд)
  // Автоматичне перепідключення
  autoReconnect: true,
  reconnectTries: Number.MAX_VALUE,
  reconnectInterval: 1000,
  // Keep-alive налаштування
  keepAlive: true,
  keepAliveInitialDelay: 300000, // 5 хвилин
});
```

### 2. Додано обробники подій для моніторингу з'єднання

```javascript
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
```

### 3. Автоматичне перепідключення

Додано функцію `ensureConnection()` для автоматичного перепідключення:

```javascript
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
```

### 4. Функція retry для MongoDB операцій

Додано функцію `executeWithRetry()` для надійного виконання операцій з базою даних:

```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (mongoose.connection.readyState !== 1) {
        await ensureConnection();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        await ensureConnection();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}
```

### 5. Keep-Alive сервіс на Frontend

Створено KeepAlive сервіс (`frontend/src/utils/keepAlive.js`) для відправки періодичних запитів:

```javascript
class KeepAliveService {
  constructor() {
    this.interval = null;
    this.isActive = false;
    this.intervalMs = 25000; // 25 секунд
  }

  start() {
    // Відправляє ping запити кожні 25 секунд
  }

  stop() {
    // Зупиняє відправку запитів
  }
}
```

### 6. Інтеграція KeepAlive в App.jsx

Додано автоматичний запуск KeepAlive після входу користувача:

```javascript
useEffect(() => {
  if (user) {
    keepAliveService.start();
    
    // Обробка подій видимості сторінки
    const handleVisibilityChange = () => {
      if (document.hidden) {
        keepAliveService.stop();
      } else {
        keepAliveService.start();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      keepAliveService.stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }
}, [user]);
```

## Результат

Після впровадження цих змін:

1. **Постійне з'єднання**: MongoDB з'єднання підтримується активним навіть під час неактивності
2. **Автоматичне перепідключення**: При втраті з'єднання система автоматично відновлює його
3. **Keep-Alive запити**: Frontend відправляє періодичні запити для підтримки з'єднання
4. **Оптимізація ресурсів**: KeepAlive зупиняється коли користувач переходить на іншу вкладку
5. **Надійність**: Всі операції з базою даних виконуються з retry механізмом

## Тестування

Для перевірки роботи:

1. Запустіть сервер та клієнт
2. Увійдіть в систему
3. Перейдіть на іншу вкладку на 1-2 хвилини
4. Поверніться назад - дані повинні завантажуватися без перезавантаження сторінки

## Логування

У консолі браузера та сервера можна побачити логи:
- "KeepAlive успішний: MongoDB підключена"
- "MongoDB перепідключено"
- "Сторінка прихована/видима, зупинка/запуск KeepAlive" 