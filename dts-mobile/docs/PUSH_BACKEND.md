# Інтеграція Push-сповіщень на бекенді (darex-trading-solutions)

Мобільний додаток надсилає FCM-токен на бекенд після логіну та очікує push-сповіщення при тих самих подіях, що й Telegram.

## Що потрібно зробити на бекенді

### 1. Схема користувача

Додати поле `fcmToken` (можливо масив для кількох пристроїв):

```js
fcmToken: { type: String, default: null }
// або для багатьох пристроїв:
fcmTokens: [{ type: String }]
```

### 2. API-ендпоінти

| Метод | Шлях | Опис |
|-------|------|------|
| POST | `/api/users/me/fcm-token` | Зберегти FCM-токен поточного користувача. Body: `{ "fcmToken": "..." }` |
| DELETE | `/api/users/me/fcm-token` | Очистити токен при логауті |

Приклад (Express):

```js
// POST /api/users/me/fcm-token
app.post('/api/users/me/fcm-token', authMiddleware, async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken) return res.status(400).json({ error: 'fcmToken required' });
  await User.findByIdAndUpdate(req.user.id, { fcmToken });
  res.json({ ok: true });
});

// DELETE /api/users/me/fcm-token
app.delete('/api/users/me/fcm-token', authMiddleware, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { $unset: { fcmToken: 1 } });
  res.json({ ok: true });
});
```

### 3. Firebase Admin SDK

```bash
npm install firebase-admin
```

Ініціалізація (з сервісного ключа з Firebase Console):

```js
const admin = require('firebase-admin');
// Варіант 1: файл
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
// Варіант 2: змінна оточення (для Render)
// admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
```

### 4. Відправка push при подіях

Поруч із викликом `telegramService.sendTaskNotification(...)` додати відправку FCM тим самим користувачам, що й для Telegram (з урахуванням `notificationSettings`, регіону тощо).

Приклад функції:

```js
async function sendPushToUsers(userIds, { title, body, data = {} }) {
  const users = await User.find({ _id: { $in: userIds }, fcmToken: { $ne: null } });
  const tokens = users.map(u => u.fcmToken).filter(Boolean);
  if (tokens.length === 0) return;

  const message = {
    notification: { title, body },
    data: { ...data },
    tokens,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    // опційно: видалити токени, що повернули unregistered
    const failed = res.responses
      .map((r, i) => (r.success ? null : tokens[i]))
      .filter(Boolean);
    if (failed.length) {
      await User.updateMany({ fcmToken: { $in: failed } }, { $unset: { fcmToken: 1 } });
    }
  } catch (err) {
    console.error('FCM send error:', err);
  }
}
```

Типи подій (відповідно до Telegram):

| type | title (приклад) | body |
|------|-----------------|------|
| task_created | Нова заявка | №{taskId} — {client} |
| task_completed | Заявка виконана | №{taskId} |
| accountant_approval | Підтвердження завсклада | №{taskId} |
| task_approved | Заявка підтверджена | №{taskId} |
| task_rejected | Заявка відхилена | №{taskId} |

`data` для deep link:

```js
data: { type: 'task_created', taskId: task._id.toString() }
```

### 5. Інтеграція в існуючі хуки

У місцях виклику `telegramService.sendTaskNotification(type, task, user)`:

1. Отримати список `chatIds` / userIds через `getChatIdsForNotification` (або аналог).
2. Для FCM: отримати userIds з тим самим фільтром і викликати `sendPushToUsers(userIds, { title, body, data })`.

Потрібно використовувати ті самі `notificationSettings` і логіку по регіону, що й для Telegram.
