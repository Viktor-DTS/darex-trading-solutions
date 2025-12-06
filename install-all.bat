@echo off
echo ========================================
echo Installing All Dependencies
echo ========================================
echo.

echo Installing Backend...
cd backend
call npm install
if errorlevel 1 (
    echo ERROR: Backend installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo Installing Frontend...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Frontend installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================
echo All dependencies installed successfully!
echo ========================================
echo.
echo Next steps:
echo 1. Create backend\config.env file
echo 2. Run start-backend.bat
echo 3. Run start-frontend.bat
echo.
pause
