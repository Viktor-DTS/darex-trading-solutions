@echo off
echo ========================================
echo Перевірка підключення до MongoDB
echo ========================================
echo.
cd /d %~dp0backend
node check-db.js
echo.
pause
