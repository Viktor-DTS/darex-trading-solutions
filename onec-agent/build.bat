@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Збірка DTS 1C Agent (.exe) ===
echo Потрібен Node.js 20+ на ЦЬОМУ комп'ютері (не на сервері 1С).
echo Перша збірка може зайняти 5-40 хв (завантаження Node для pkg).
echo Не закривайте вікно, поки не з'явиться "Готово" і папка dist\
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ПОМИЛКА: node не знайдено. Встановіть Node.js LTS з https://nodejs.org
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto fail

echo Крок 1/2: завантаження Node для pkg (може 5-30 хв при першому запуску)...
call npm run prefetch
if errorlevel 1 goto fail

echo Крок 2/2: збірка dts-onec-agent.exe ...
call npx pkg src/index.js --targets node20-win-x64 --output dist/dts-onec-agent.exe --compress GZip
if errorlevel 1 goto fail
call node scripts/prepare-dist.js
if errorlevel 1 goto fail

echo.
echo Готово. Скопіюйте ВСЮ папку dist\ на сервер 1С:
echo   dts-onec-agent.exe
echo   config.json
echo   Запуск агента.bat
echo.
pause
exit /b 0

:fail
echo Збірка не вдалась.
pause
exit /b 1
