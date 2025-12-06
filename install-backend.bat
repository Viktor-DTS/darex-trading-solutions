@echo off
echo ========================================
echo Installing Backend Dependencies
echo ========================================
cd /d %~dp0backend
if not exist package.json (
    echo ERROR: package.json not found in backend folder!
    pause
    exit /b 1
)
echo.
echo Running: npm install
echo.
call npm install
if errorlevel 1 (
    echo.
    echo ERROR: Installation failed!
    pause
    exit /b 1
)
echo.
echo ========================================
echo Backend dependencies installed successfully!
echo ========================================
echo.
pause
