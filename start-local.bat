@echo off
echo 🚀 Запуск локального сервера розробки...
echo.

echo 📁 Перехід в папку backend...
cd backend

echo 🔧 Завантаження конфігурації...
copy config.local.env .env

echo 📦 Встановлення залежностей...
call npm install

echo 🌐 Запуск backend сервера на порту 3001...
echo.
echo ✅ Backend буде доступний на: http://localhost:3001
echo ✅ API endpoints: http://localhost:3001/api/*
echo.
echo ⚠️  НЕ ЗАКРИВАЙТЕ ЦЕ ВІКНО!
echo.

call npm start
