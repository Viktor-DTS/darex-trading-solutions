@echo off
echo ========================================
echo Fixing Installation Issues
echo ========================================
echo.

echo Step 1: Cleaning npm cache...
call npm cache clean --force
echo.

echo Step 2: Installing Backend dependencies...
cd /d %~dp0backend
if exist node_modules (
    echo Removing old node_modules...
    rmdir /s /q node_modules
)
if exist package-lock.json (
    echo Removing old package-lock.json...
    del package-lock.json
)
echo Installing...
call npm install
if errorlevel 1 (
    echo ERROR: Backend installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo Step 3: Installing Frontend dependencies...
cd /d %~dp0frontend
if exist node_modules (
    echo Removing old node_modules...
    rmdir /s /q node_modules
)
if exist package-lock.json (
    echo Removing old package-lock.json...
    del package-lock.json
)
echo Installing...
call npm install
if errorlevel 1 (
    echo ERROR: Frontend installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================
echo Installation completed successfully!
echo ========================================
echo.
echo You can now run:
echo   start-all.bat
echo.
pause
