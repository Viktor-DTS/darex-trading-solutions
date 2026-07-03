@echo off
cd /d "%~dp0.."
echo FX Scalp Agent Panel — http://127.0.0.1:8787
echo Закрийте це вікно, щоб зупинити панель (worker теж зупиниться).
npm run panel
