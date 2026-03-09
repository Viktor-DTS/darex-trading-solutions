# Backend CRM — референс

**CRM вже додано до основного backend** (`backend/index.js`).
Ця папка — референс коду та стенд-алон для локальної перевірки.

## Стенд-алон для локальної перевірки

```bash
cd backend-crm
npm install
# Створіть .env з MONGODB_URI=mongodb://...
npm start
```

Сервер запуститься на порту 3002. Для тестування фронту змініть `VITE_API_URL=http://localhost:3002/api` — увага: інші API (tasks, equipment) не будуть доступні.

## Варіант B: Інтеграція в основний backend (рекомендовано)

## Кроки інтеграції

### 1. Скопіювати моделі

- `models/Client.js` → у ваш проект (наприклад `models/Client.js`)
- `models/Sale.js` → у ваш проект (наприклад `models/Sale.js`)

### 2. Модель Equipment

У папці `backend-crm/models/` є мінімальна схема `Equipment.js` (stub). Якщо у вашому backend вже є модель Equipment — видаліть її й оновіть шлях у `routes/sales.js`, і додайте поля:

```javascript
// У схему Equipment додати:
saleId: { type: Schema.Types.ObjectId, ref: 'Sale' },
soldDate: Date,
soldToClientId: { type: Schema.Types.ObjectId, ref: 'Client' },
saleAmount: Number,
warrantyUntil: Date,
warrantyMonths: Number,
// status: додати 'sold' до enum
```

### 3. Додати роути

У головному файлі (server.js / app.js):

```javascript
const clientsRouter = require('./routes/clients');
const salesRouter = require('./routes/sales');

app.use('/api/clients', authMiddleware, clientsRouter);
app.use('/api/sales', authMiddleware, salesRouter);
```

Переконайтеся, що `req.user` встановлюється після автентифікації (JWT middleware).

### 4. Перевірити шляхи

У `routes/sales.js` змініть `require('../models/Equipment')` на правильний шлях до вашої моделі обладнання.

### 5. Endpoints

| Method | Path | Опис |
|--------|------|------|
| GET | /api/clients | Список клієнтів |
| GET | /api/clients/search?q= | Пошук клієнтів |
| GET | /api/clients/:id | Один клієнт |
| POST | /api/clients | Створити клієнта |
| PUT | /api/clients/:id | Оновити клієнта |
| GET | /api/sales | Список продажів (?clientId=, ?managerLogin=) |
| GET | /api/sales/:id | Один продаж |
| POST | /api/sales | Створити продаж |
| PUT | /api/sales/:id | Оновити продаж |
| DELETE | /api/sales/:id | Видалити (тільки draft) |
