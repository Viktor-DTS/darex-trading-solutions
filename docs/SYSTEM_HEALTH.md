# Аналіз роботи системи (Адміністратор → 🩺)

Вкладка показує дві незалежні картини:

- **Зовнішні ресурси** — Render, MongoDB Atlas, Cloudinary: скільки використано, скільки лишилось, коли пора змінювати тариф.
- **Проєкт** — власні метрики бекенду DTS: які маршрути гальмують, де помилки, чи вистачає індексів у базі.

Плюс **Рахунки та оплати** (журнал витрат по кожному ресурсу) і **Рекомендації** (згенеровані дії з пріоритетом).

Доступ мають лише ролі `admin` / `administrator`.

## Що працює одразу, без налаштувань

| Блок | Джерело | Умова |
| --- | --- | --- |
| Аналіз проєкту | метрики в памʼяті процесу | завжди |
| Обʼєм бази, колекції, індекси | пряме підключення MongoDB | є `MONGODB_URI` |
| Cloudinary | вже наявні `CLOUDINARY_*` | ключі вже налаштовані для завантаження файлів |
| Журнал оплат | колекція `resourcepayments` | є `MONGODB_URI` |

Render і рахунки Atlas потребують додаткових ключів (нижче).

## Налаштування ключів

Усі змінні додаються в **Render → сервіс `darex-trading-solutions` → Environment**, локально — у `backend/config.env`.

### Render

1. https://dashboard.render.com/u/settings#api-keys → **Create API Key**.
2. Додати `RENDER_API_KEY=rnd_...`

Дає: CPU, памʼять, кількість запитів, латентність, трафік, статуси й історію деплоїв по кожному сервісу, оцінку місячної вартості.

> Render не віддає рахунки через API — суми в журнал оплат вносяться вручну з https://dashboard.render.com/billing.

### MongoDB Atlas

Спосіб 1 — Service Account (рекомендований). Вхід: https://cloud.mongodb.com/

1. Обрати організацію в меню **Organizations** у верхній панелі.
2. У бічному меню, розділ **Identity & Access** → **Applications**.
3. **Add new Service Account** → у *Organization Permissions* роль `Organization Read Only`
   (для рахунків додатково `Organization Billing Viewer`).
4. Скопіювати `MONGODB_ATLAS_CLIENT_ID` і `MONGODB_ATLAS_CLIENT_SECRET` — секрет показується лише один раз.
5. Впустити акаунт у проєкт: **Project → Security → Project Identity & Access → Users → Invite to Project**,
   ввести Client ID, роль `Project Read Only`.

Спосіб 2 — legacy API keys (HTTP Digest): `MONGODB_ATLAS_PUBLIC_KEY` + `MONGODB_ATLAS_PRIVATE_KEY`
(там же, **Applications → Add new API Key**).

Додатково:

- `MONGODB_ATLAS_GROUP_ID` — ID проєкту, потрібен для даних кластера. Видно в адресному рядку
  всередині проєкту: `https://cloud.mongodb.com/v2/<GROUP_ID>#/clusters`, а також у *Project Settings → General*.
- `MONGODB_ATLAS_ORG_ID` — ID організації, потрібен для рахунків. Видно на сторінці *Organization Settings*:
  `https://cloud.mongodb.com/v2#/org/<ORG_ID>/settings/general`.
- `MONGODB_STORAGE_LIMIT_MB` — ліміт сховища, якщо Admin API недоступний (для M0 — `512`).

Знаючи ці ID, прямі посилання: білінг — `https://cloud.mongodb.com/v2#/org/<ORG_ID>/billing/overview`,
сервісні акаунти — `https://cloud.mongodb.com/v2#/org/<ORG_ID>/access/applications`.

> Безкоштовні кластери (M0/M2/M5) не віддають метрики продуктивності через Admin API. Обʼєм сховища панель бере напряму з підключення, тому цифри коректні в будь-якому разі.

### Cloudinary

Використовуються вже наявні `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
Окремих ключів не потрібно. Перевірити їх: https://console.cloudinary.com/settings/api-keys

> Cloudinary не віддає рахунки через API — вносяться вручну з https://console.cloudinary.com/settings/billing.

### Кешування

Відповіді зовнішніх API кешуються, щоб не впертись у їхні ліміти:

- `SYSTEM_HEALTH_RENDER_TTL_MS` (типово 120000)
- `SYSTEM_HEALTH_ATLAS_TTL_MS` (типово 300000)
- `SYSTEM_HEALTH_CLOUDINARY_TTL_MS` (типово 300000)

Кнопка «Оновити» в інтерфейсі обходить кеш.

## Як читати аналіз проєкту

Метрики збираються **в памʼяті процесу** і обнуляються після кожного деплою або пробудження інстансу зі сну. Тому:

- одразу після релізу цифри нерепрезентативні, індекс здоровʼя показує «—» до 10 запитів;
- вікна навмисно короткі: 2 години похвилинно і 48 годин погодинно.

Ключові показники:

- **Індекс здоровʼя** — зважена оцінка p95, середньої відповіді, частки 5xx, event loop, памʼяті, швидкості запитів до Mongo та стану індексів.
- **Найдорожчі маршрути** — сортування за сумарним часом. Саме верхні рядки визначають відчутну швидкість системи, а не найповільніший поодинокий запит.
- **Event loop p99** — якщо понад 100 мс, у коді є синхронні блокування (розбір великих XLSX/PDF, важкий `JSON.parse`), через які всі інші запити стоять у черзі.
- **Запитів до Mongo на один HTTP-запит** — понад 8 зазвичай означає N+1: запит у циклі замість `$in` / `$lookup`.

## Технічні деталі

Бекенд:

- `backend/lib/systemHealth/requestMetrics.js` — express-middleware зі збором латентності (гістограма для перцентилів) і command monitoring драйвера MongoDB.
- `backend/lib/systemHealth/providers/` — клієнти Render, Atlas, Cloudinary з TTL-кешем.
- `backend/lib/systemHealth/projectAnalyzer.js` — зведення метрик у вузькі місця.
- `backend/lib/systemHealth/advisor.js` — генерація рекомендацій.
- `backend/lib/systemHealth/billingJournal.js` — модель і зведення журналу оплат.

Маршрути (усі під `authenticateToken` + перевірку ролі адміністратора):

```
GET    /api/system-health/overview?hours=24[&refresh=1]
GET    /api/system-health/project
GET    /api/system-health/config
GET    /api/system-health/metrics/raw
POST   /api/system-health/metrics/reset
POST   /api/system-health/cache/invalidate
GET    /api/system-health/payments
POST   /api/system-health/payments
PUT    /api/system-health/payments/:id
DELETE /api/system-health/payments/:id
POST   /api/system-health/payments/sync
```

Фронтенд: `frontend/src/components/systemHealth/`. Графіки — на чистому SVG, без додаткових залежностей.
