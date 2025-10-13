@echo off
echo 🎨 Запуск локального frontend...
echo.

echo 📁 Переход в папку frontend...
cd frontend

echo 📦 Встановлення залежностей...
call npm install

echo 🌐 Запуск frontend на порту 3000...
echo.
echo ✅ Frontend буде доступний на: http://localhost:3000
echo ✅ Підключено до локального backend: http://localhost:3001
echo.
echo ⚠️  НЕ ЗАКРИВАЙТЕ ЦЕ ВІКНО!
echo.

call npm run dev
