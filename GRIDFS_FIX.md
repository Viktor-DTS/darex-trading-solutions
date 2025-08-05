# Виправлення проблеми з GridFS - файли не знаходяться з часом

## Проблема
Файли завантажуються та відображаються в списку, але через деякий час при спробі їх переглянути виникає помилка "Файл не знайдено на сервері". Це пов'язано з проблемами ініціалізації GridFS при перепідключенні до MongoDB.

## Причина проблеми
1. **GridFS ініціалізується тільки один раз** через `connection.once('open')`
2. **При перепідключенні MongoDB** GridFS не переініціалізується автоматично
3. **Функція `ensureGridFS()`** не викликається при кожному перепідключенні
4. **Відсутня синхронізація** між станом MongoDB та GridFS

## Виправлення

### 1. Додано обробники подій для MongoDB
```javascript
// Додаємо обробник для перепідключення
connection.on('connected', () => {
  console.log('MongoDB перепідключено, ініціалізація GridFS...');
  gfs = Grid(connection.db, mongoose.mongo);
  gfs.collection('uploads');
  console.log('GridFS переініціалізовано після перепідключення');
});

// Обробник для відключення
connection.on('disconnected', () => {
  console.log('MongoDB відключено, скидаємо GridFS...');
  gfs = null;
});
```

### 2. Покращена функція `ensureGridFS()`
```javascript
function ensureGridFS() {
  // Додаткова перевірка стану з'єднання
  if (mongoose.connection.readyState !== 1) {
    console.error('GridFS: MongoDB не підключена! ReadyState:', mongoose.connection.readyState);
    return null;
  }
  
  // Якщо GridFS не ініціалізовано, ініціалізуємо його
  if (!gfs) {
    console.log('GridFS не ініціалізовано, ініціалізація...');
    try {
      gfs = Grid(mongoose.connection.db, mongoose.mongo);
      gfs.collection('uploads');
      console.log('GridFS успішно ініціалізовано');
    } catch (error) {
      console.error('Помилка ініціалізації GridFS:', error);
      return null;
    }
  }
  
  // Додаткова перевірка, що GridFS працює
  if (!gfs || !gfs.files) {
    console.error('GridFS: Об\'єкт gfs не ініціалізовано або не має files');
    return null;
  }
  
  return gfs;
}
```

### 3. Покращена функція `checkFileExists()`
```javascript
async function checkFileExists(gridfsId) {
  try {
    console.log('[DEBUG] Перевірка існування файлу в GridFS, ID:', gridfsId);
    
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      console.error('[ERROR] GridFS не може бути ініціалізовано для перевірки файлу');
      return false;
    }
    
    return new Promise((resolve) => {
      gfsInstance.files.findOne({ _id: gridfsId }, (err, file) => {
        if (err) {
          console.error('[ERROR] Помилка перевірки файлу в GridFS:', err);
          resolve(false);
        } else {
          const exists = !!file;
          console.log('[DEBUG] Файл в GridFS:', exists ? 'знайдено' : 'не знайдено', 'ID:', gridfsId);
          resolve(exists);
        }
      });
    });
  } catch (error) {
    console.error('[ERROR] Помилка перевірки існування файлу:', error);
    return false;
  }
}
```

### 4. Додаткова перевірка стану MongoDB в роутах
```javascript
// Додаткова перевірка стану MongoDB
if (mongoose.connection.readyState !== 1) {
  console.error('[ERROR] MongoDB не підключена при спробі перегляду файлу. ReadyState:', mongoose.connection.readyState);
  return res.status(503).json({ error: 'База даних недоступна' });
}
```

### 5. Ініціалізація GridFS при перепідключенні в `index.js`
```javascript
mongoose.connection.on('reconnected', () => {
  console.log('MongoDB перепідключено');
  
  // Ініціалізуємо GridFS після перепідключення
  try {
    const filesModule = require('./routes/files');
    if (filesModule.initializeGridFS) {
      filesModule.initializeGridFS();
      console.log('GridFS переініціалізовано після перепідключення MongoDB');
    }
  } catch (error) {
    console.error('Помилка ініціалізації GridFS після перепідключення:', error);
  }
});
```

### 6. Функція `initializeGridFS()` для зовнішнього використання
```javascript
function initializeGridFS() {
  if (mongoose.connection.readyState === 1) {
    console.log('Ініціалізація GridFS з index.js...');
    gfs = Grid(mongoose.connection.db, mongoose.mongo);
    gfs.collection('uploads');
    console.log('GridFS ініціалізовано з index.js');
    return true;
  } else {
    console.error('GridFS: MongoDB не підключена для ініціалізації');
    return false;
  }
}

module.exports.initializeGridFS = initializeGridFS;
```

## Результат
Тепер GridFS буде автоматично переініціалізуватися при:
- Першому підключенні до MongoDB
- Перепідключенні після втрати з'єднання
- Відновленні з'єднання після помилок

Це забезпечить стабільну роботу з файлами навіть при нестабільному з'єднанні з MongoDB.

## Тестування
Для перевірки роботи створено тестовий скрипт `test-file-access.js`, який можна запустити для перевірки доступу до конкретного файлу.

## Безпека
Всі зміни зроблені акуратно, щоб не втратити існуючі дані. Додано детальне логування для відстеження проблем. 