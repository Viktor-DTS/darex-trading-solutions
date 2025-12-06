@echo off
echo ========================================
echo Installing Frontend Dependencies
echo ========================================
cd /d %~dp0frontend
if not exist package.json (
    echo ERROR: package.json not found in frontend folder!
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
echo Frontend dependencies installed successfully!
echo ========================================
echo.
pause
