@echo off
echo ========================================
echo Starting Backend Server
echo ========================================
cd backend
if not exist config.env (
    echo WARNING: config.env not found!
    echo Creating config.env from example...
    copy config.env.example config.env
    echo.
    echo Please edit backend\config.env and set your MongoDB URI
    echo.
    pause
)
echo Starting backend on http://localhost:3001
call npm start
