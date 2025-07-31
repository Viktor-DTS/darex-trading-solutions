# Вирішення проблеми з завантаженням та переглядом файлів

## Проблема
Файли завантажуються та відображаються в списку, але через деякий час при спробі їх переглянути виникає помилка "Файл не знайдено на сервері". Це пов'язано з проблемами підключення до MongoDB та ініціалізації GridFS.

## Рішення

### 1. Використання існуючого підключення mongoose

Замість створення окремого підключення до MongoDB, використовуємо існуюче підключення mongoose:

```javascript
// Використовуємо існуюче підключення mongoose
const connection = mongoose.connection;
let gfs;

// Ініціалізація GridFS після підключення mongoose
connection.once('open', () => {
  gfs = Grid(connection.db, mongoose.mongo);
  gfs.collection('uploads');
  console.log('GridFS ініціалізовано');
});
```

### 2. Створення mongoose схеми для файлів

```javascript
const fileSchema = new mongoose.Schema({
  taskId: String,
  originalName: String,
  filename: String,
  gridfsId: mongoose.Schema.Types.ObjectId,
  mimetype: String,
  size: Number,
  uploadDate: { type: Date, default: Date.now },
  description: String
});

const File = mongoose.model('File', fileSchema);
```

### 3. Функція для перевірки та ініціалізації GridFS

```javascript
function ensureGridFS() {
  if (!gfs && mongoose.connection.readyState === 1) {
    console.log('Ініціалізація GridFS...');
    gfs = Grid(mongoose.connection.db, mongoose.mongo);
    gfs.collection('uploads');
    console.log('GridFS ініціалізовано');
  }
  return gfs;
}
```

### 4. Використання executeWithRetry для надійності

```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.log(`Спроба ${attempt}: MongoDB не підключена, перепідключення...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return await operation();
    } catch (error) {
      console.error(`Помилка спроби ${attempt}:`, error.message);
      if (attempt === maxRetries) throw error;
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}
```

### 5. Покращена обробка помилок

Додано детальне логування для відстеження проблем:

```javascript
router.get('/view/:fileId', async (req, res) => {
  try {
    const file = await executeWithRetry(() => File.findById(req.params.fileId));
    if (!file) {
      return res.status(404).json({ error: 'Файл не знайдено на сервері' });
    }
    
    const gfsInstance = ensureGridFS();
    if (!gfsInstance) {
      return res.status(500).json({ error: 'GridFS не ініціалізовано' });
    }
    
    console.log('Спроба перегляду файлу:', file._id, 'GridFS ID:', file.gridfsId);
    
    const readstream = gfsInstance.createReadStream({ _id: file.gridfsId, root: 'uploads' });
    readstream.on('error', err => {
      console.error('Помилка читання з GridFS:', err);
      res.status(404).json({ error: 'Файл не знайдено у GridFS' });
    });
    readstream.pipe(res);
  } catch (error) {
    console.error('Помилка перегляду файлу:', error);
    res.status(500).json({ error: 'Помилка перегляду файлу' });
  }
});
```

### 6. Middleware для перевірки стану MongoDB

```javascript
router.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error('MongoDB не підключена для файлового роуту!');
    return res.status(503).json({ 
      error: 'База даних недоступна для файлових операцій'
    });
  }
  next();
});
```

## Результат

Після впровадження цих змін:

1. **Надійне підключення**: Використовується існуюче підключення mongoose
2. **Автоматична ініціалізація GridFS**: GridFS ініціалізується при підключенні
3. **Retry механізм**: Всі операції виконуються з автоматичним повторенням
4. **Детальне логування**: Додано логи для відстеження проблем
5. **Перевірка стану**: Middleware перевіряє стан підключення перед обробкою

## Тестування

Для перевірки роботи:

1. Завантажте файл
2. Перевірте, що він відображається в списку
3. Зачекайте 1-2 хвилини
4. Спробуйте переглянути файл - він повинен відкритися без помилок

## Логування

У консолі сервера можна побачити логи:
- "GridFS ініціалізовано"
- "Файл збережено: [ID] GridFS ID: [GridFS_ID]"
- "Спроба перегляду файлу: [ID] GridFS ID: [GridFS_ID]"
- "Помилка читання з GridFS: [error]" (якщо є проблеми) 