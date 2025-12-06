# ⚠️ ВИПРАВЛЕННЯ ПОМИЛКИ - Встановлення залежностей

## Проблема
Модулі не встановлені, тому виникають помилки:
- `Cannot find module 'dotenv'` (backend)
- `'vite' is not recognized` (frontend)

## Рішення - Встановити залежності

### Варіант 1: Автоматично (рекомендовано)

Подвійний клік на файл:
```
install-all.bat
```

### Варіант 2: Вручну через командний рядок

**Відкрийте PowerShell або CMD в папці C:\NewServiceGidra**

#### Backend:
```powershell
cd backend
npm install
```

#### Frontend:
```powershell
cd frontend
npm install
```

### Варіант 3: Окремі скрипти

**Backend:**
```bash
install-backend.bat
```

**Frontend:**
```bash
install-frontend.bat
```

## Після встановлення

Після успішного встановлення залежностей:

1. **Запустіть backend:**
   ```bash
   start-backend.bat
   ```
   або
   ```bash
   cd backend
   npm start
   ```

2. **Запустіть frontend (в новому вікні):**
   ```bash
   start-frontend.bat
   ```
   або
   ```bash
   cd frontend
   npm run dev
   ```

3. **Відкрийте браузер:**
   ```
   http://localhost:5173
   ```

## Перевірка встановлення

Після `npm install` в папках повинні з'явитися:
- `backend/node_modules/` - папка з залежностями backend
- `frontend/node_modules/` - папка з залежностями frontend

Якщо папки `node_modules` не з'явилися - встановлення не виконалось успішно.

## Якщо помилки продовжуються

1. Перевірте, чи встановлений Node.js:
   ```bash
   node --version
   ```
   Має бути версія 16 або вище.

2. Перевірте, чи встановлений npm:
   ```bash
   npm --version
   ```

3. Спробуйте очистити кеш:
   ```bash
   npm cache clean --force
   ```

4. Видаліть `node_modules` та `package-lock.json` і встановіть знову:
   ```bash
   cd backend
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   ```
