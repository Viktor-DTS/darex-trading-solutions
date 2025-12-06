@echo off
echo ========================================
echo    ЗАПУСК НОВОГО ПРОЕКТУ (NewServiceGidra)
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
echo ========================================

:: Запуск Backend
start "NewServiceGidra Backend" cmd /k "cd /d C:\NewServiceGidra\backend && npm start"

:: Невелика затримка
timeout /t 3 /nobreak > nul

:: Запуск Frontend
start "NewServiceGidra Frontend" cmd /k "cd /d C:\NewServiceGidra\frontend && npm run dev"

echo.
echo Проект запущено! Відкрийте http://localhost:5173
echo.
pause

