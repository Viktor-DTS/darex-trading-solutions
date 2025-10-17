@echo off
echo 🔧 Запуск дебагу системи сповіщень...
echo.

cd /d "%~dp0"

echo 📋 Перевірка наявності Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js не знайдено! Будь ласка, встановіть Node.js
    pause
    exit /b 1
)

echo ✅ Node.js знайдено
echo.

echo 🚀 Запуск тестування системи сповіщень...
echo.

node test-notifications.js

echo.
echo ✅ Тестування завершено!
echo.
echo 💡 Для детального аналізу використовуйте веб-інтерфейс:
echo    - Увійдіть як адміністратор
echo    - Перейдіть в "Адміністратор" → "🔧 Дебаг сповіщень"
echo.

pause
