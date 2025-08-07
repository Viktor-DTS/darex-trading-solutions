# Налаштування Cloudinary для завантаження файлів

## Крок 1: Отримання ключів Cloudinary

1. Перейдіть на [Cloudinary Console](https://console.cloudinary.com/app/c-be29703a8a0e87e1d88cc8731a5b92/settings/billing/plans)
2. У вашому акаунті знайдіть:
   - **Cloud Name** (наприклад: `c-be29703a8a0e87e1d88cc8731a5b92`)
   - **API Key** (наприклад: `123456789012345`)
   - **API Secret** (наприклад: `abcdefghijklmnopqrstuvwxyz123456`)

## Крок 2: Додавання змінних середовища на Render.com

### Для Backend сервісу (darex-trading-solutions):

1. Перейдіть на [Render Dashboard](https://dashboard.render.com/web/srv-d19rv5mmcj7s73erbbi0/env)
2. У розділі "Environment Variables" додайте:

```
CLOUDINARY_CLOUD_NAME = c-be29703a8a0e87e1d88cc8731a5b92
CLOUDINARY_API_KEY = 123456789012345
CLOUDINARY_API_SECRET = abcdefghijklmnopqrstuvwxyz123456
```

### Для Frontend сервісу (darex-trading-solutions-f):

```
REACT_APP_API_URL = https://darex-trading-solutions.onrender.com
```

## Крок 3: Перезапуск сервісів

1. Натисніть **"Save, rebuild, and deploy"** для backend сервісу
2. Натисніть **"Save, rebuild, and deploy"** для frontend сервісу
3. Дочекайтеся завершення деплою

## Крок 4: Перевірка роботи

1. Відкрийте форму редагування завдання
2. У розділі "Файли виконаних робіт" спробуйте завантажити файл
3. Перевірте, що файл з'являється в списку та доступний для перегляду

## Структура збереження файлів

- **Cloudinary**: Файли зберігаються в папці `darex-trading-solutions/`
- **MongoDB**: Метадані файлів (назва, розмір, опис, посилання)
- **Підтримувані формати**: JPG, PNG, GIF, PDF, DOC, DOCX, XLS, XLSX, TXT
- **Максимальний розмір**: 10MB на файл
- **Ліміт файлів**: 10 файлів за раз

## API Endpoints

- `POST /api/files/upload/:taskId` - Завантаження файлів
- `GET /api/files/task/:taskId` - Отримання списку файлів завдання
- `DELETE /api/files/:fileId` - Видалення файлу
- `GET /api/files/info/:fileId` - Інформація про файл
- `GET /api/files/ping` - Перевірка стану сервісу 