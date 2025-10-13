@echo off
echo 🚀 DTS AUTOMATIC MONITORING SYSTEM
echo ====================================

REM Переходимо в папку проекту
cd /d "%~dp0"

REM Запускаємо моніторинг
echo Starting system monitoring...
node auto-monitor.js

echo.
echo Monitoring complete. Press any key to exit...
pause > nul
