@echo off
echo ========================================
echo Starting NewServiceGidra
echo ========================================
echo.

REM Check if config.env exists
if not exist backend\config.env (
    echo Creating config.env from example...
    copy backend\config.env.example backend\config.env
    echo.
    echo WARNING: Please edit backend\config.env and set your MongoDB URI
    echo.
)

REM Start backend in new window
echo Starting Backend...
start "NewServiceGidra Backend" cmd /k "cd /d %~dp0backend && npm start"

REM Wait a bit for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo Starting Frontend...
start "NewServiceGidra Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo Servers starting...
echo ========================================
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Press any key to close this window...
pause >nul
