# Реалізація Push на бекенді — покрокова інструкція

**✅ Інтеграція вже додана в index.js.** Залишилось лише налаштувати Firebase service account.

**Важливо:** Ці зміни не впливають на веб-додаток і активних користувачів:
- Додаємо лише нові ендпоінти та опційне поле
- Веб не викликає ці ендпоінти
- Telegram-сповіщення працюють як раніше
- Сесії, логін, tasks API — без змін

---

## Крок 1: Поле fcmToken у User

У моделі User (Mongoose schema) додай:

```js
fcmToken: { type: String, default: null }
```

---

## Крок 2: Ендпоінти для FCM-токена

Десь після auth middleware (наприклад, поруч з іншими `/api/users`):

```js
// POST /api/users/me/fcm-token — зберегти токен (мобільний додаток викликає після логіну)
app.post('/api/users/me/fcm-token', authMiddleware, async (req, res) => {
  try {
    const { fcmToken } = req.body || {};
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({ error: 'fcmToken required' });
    }
    await User.findByIdAndUpdate(req.user.id, { fcmToken: fcmToken.trim() });
    res.json({ ok: true });
  } catch (err) {
    console.error('FCM token save error:', err);
    res.status(500).json({ error: 'Failed to save token' });
  }
});

// DELETE /api/users/me/fcm-token — очистити токен (при логауті)
app.delete('/api/users/me/fcm-token', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $unset: { fcmToken: 1 } });
    res.json({ ok: true });
  } catch (err) {
    console.error('FCM token clear error:', err);
    res.status(500).json({ error: 'Failed to clear token' });
  }
});
```

---

## Крок 3: Firebase Admin SDK

```bash
npm install firebase-admin
```

У Firebase Console → Project settings → Service accounts → Generate new private key — завантаж JSON.

На Render: додай змінну `FIREBASE_SERVICE_ACCOUNT` = вміст JSON (в один рядок).

Ініціалізація (на початку index.js, після require):

```js
let admin;
try {
  admin = require('firebase-admin');
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } else {
    const serviceAccount = require('./firebase-service-account.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (e) {
  console.warn('Firebase Admin not initialized:', e.message);
}
```

---

## Крок 4: Функція відправки push

```js
async function sendPushToUsers(userIds, { title, body, data = {} }) {
  if (!admin) return;
  const users = await User.find({ _id: { $in: userIds }, fcmToken: { $ne: null, $exists: true } });
  const tokens = users.map(u => u.fcmToken).filter(Boolean);
  if (tokens.length === 0) return;

  const message = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    tokens,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    const failed = res.responses
      .map((r, i) => (!r.success ? tokens[i] : null))
      .filter(Boolean);
    if (failed.length) {
      await User.updateMany(
        { fcmToken: { $in: failed } },
        { $unset: { fcmToken: 1 } }
      );
    }
  } catch (err) {
    console.error('FCM send error:', err);
  }
}
```

---

## Крок 5: Інтеграція в місця Telegram-сповіщень

Там, де викликається `telegramService.sendTaskNotification(type, task, user)` або аналогічно отримуються `chatIds` / `userIds`:

1. Отримай той самий список `userIds`, що й для Telegram (за notificationSettings, регіоном).
2. Додай виклик:

```js
const titleMap = {
  task_created: 'Нова заявка',
  task_completed: 'Заявка виконана',
  accountant_approval: 'Підтвердження завсклада',
  task_approved: 'Заявка підтверджена',
  task_rejected: 'Заявка відхилена',
};
const taskLabel = task.taskId || task._id?.toString() || '';
const title = titleMap[type] || 'DTS';
const body = taskLabel ? `№${taskLabel}` : 'Нове сповіщення';
await sendPushToUsers(userIds, {
  title,
  body,
  data: { type, taskId: (task._id || task.id)?.toString() },
});
```

Важливо використовувати **той самий список userIds**, що й для Telegram (getChatIdsForNotification → map до userId, або як у тебе зараз реалізовано).

---

## Чекліст

- [x] Додати `fcmToken` у User schema
- [x] Додати POST та DELETE `/api/users/me/fcm-token`
- [x] Встановити `firebase-admin`
- [x] Ініціалізувати Firebase Admin
- [x] Додати `sendPushToUsers` і викликати її поруч із Telegram
- [ ] **Залишилось:** Завантажити service account з Firebase Console → Service accounts → Generate new private key
- [ ] Додати змінну **FIREBASE_SERVICE_ACCOUNT** на Render = вміст JSON (в один рядок)
