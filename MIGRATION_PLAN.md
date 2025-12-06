# 🚀 План безпечного переходу на нову версію

## ✅ Що вже готово:
- ✅ Резервна гілка: `original-backup`
- ✅ Тег: `v1.0-original`
- ✅ Виправлення MongoDB connection додано в `C:\NewServiceGidra\backend\index.js`

---

## 📋 Покрокова інструкція:

### Крок 1: Перевірка резервних копій

```powershell
cd "c:\dts-service\darex-trading-solutions"
git checkout main
git branch -a  # Має бути original-backup
git tag -l     # Має бути v1.0-original
```

---

### Крок 2: Створення тестової гілки

```powershell
# Створи тестову гілку
git checkout -b v2-test

# Скопіюй виправлений backend/index.js
Copy-Item -Path "C:\NewServiceGidra\backend\index.js" -Destination "c:\dts-service\darex-trading-solutions\backend\index.js" -Force

# Перевір зміни
git diff backend/index.js

# Якщо все ОК - закоміть
git add backend/index.js
git commit -m "🔧 Fix MongoDB connection for Render production"
git push origin v2-test
```

---

### Крок 3: Тест на Render (тестова гілка)

1. Зайди на **Render Dashboard**
2. Відкрий сервіс **darex-trading-solutions** (Web Service)
3. Перейди в **Settings**
4. Знайди **Branch** → зміни на `v2-test`
5. Натисни **Save Changes**
6. Render автоматично задеплоїть
7. Перевір **Logs** - має бути:
   ```
   [ENV] Setting MongoDB URI for production/Render
   ✅ MongoDB connected successfully
   ```

**Якщо працює** → переходи до Кроку 4  
**Якщо НЕ працює** → повернись на `main` (Крок 5)

---

### Крок 4: Деплой на main (якщо тест успішний)

```powershell
cd "c:\dts-service\darex-trading-solutions"

# Переключись на main
git checkout main

# Змерж зміни з тестової гілки
git merge v2-test

# Або просто скопіюй файл (якщо merge не потрібен)
# Copy-Item -Path "C:\NewServiceGidra\backend\index.js" -Destination "backend\index.js" -Force
# git add backend/index.js
# git commit -m "🚀 Fix MongoDB connection for Render - production ready"

# Push на GitHub
git push origin main
```

Render автоматично задеплоїть нову версію.

---

### Крок 5: Відкат (якщо щось пішло не так)

#### Варіант A: Швидкий відкат через тег

```powershell
cd "c:\dts-service\darex-trading-solutions"
git checkout main
git reset --hard v1.0-original
git push -f origin main
```

#### Варіант B: Відкат через гілку

```powershell
cd "c:\dts-service\darex-trading-solutions"
git checkout main
git reset --hard original-backup
git push -f origin main
```

#### Варіант C: Відкат через commit

```powershell
# Знайди commit оригіналу
git log --oneline | grep "f93fc6c"

# Відкотись
git reset --hard f93fc6c
git push -f origin main
```

**Після відкату:**
- На Render натисни **Manual Deploy** → **Deploy latest commit**
- Або просто зміни Branch назад на `main` в Settings

---

## 🔍 Що саме виправлено:

1. ✅ Додано форсування MongoDB URI для production/Render
2. ✅ Додано debug-логування для діагностики
3. ✅ Використання `process.env.MONGODB_URI` напряму в `connectToMongoDB()`
4. ✅ Додано `heartbeatFrequencyMS` для кращої підтримки з'єднання

---

## ⚠️ Важливо:

- **НЕ видаляй** гілку `original-backup` та тег `v1.0-original`
- **Зберігай** команди для відкату
- **Моніторь** логи на Render після деплою
- **Тестуй** на тестовій гілці перед деплоєм на main

---

## 📞 Швидкі команди:

| Дія | Команда |
|-----|---------|
| Відкат до оригіналу | `git reset --hard v1.0-original && git push -f origin main` |
| Повернути нову версію | `git reset --hard v2-test && git push -f origin main` |
| Перевірити статус | `git status && git log --oneline -5` |

---

**Успіхів! 🚀**
