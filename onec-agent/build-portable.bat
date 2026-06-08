@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Portable-збірка (рекомендовано для Windows) ===
echo Не потрібен pkg / patch. Потрібен лише Node.js на ЦЬОМУ ПК для збірки.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-portable.ps1"
if errorlevel 1 (
  echo Збірка не вдалась.
  pause
  exit /b 1
)
echo.
echo Скопіюйте папку dist-portable\ на сервер 1С.
pause
