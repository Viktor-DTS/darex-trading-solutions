@echo off
echo ========================================
echo Git Commit and Push Script
echo ========================================
echo.

cd /d c:\dts-service

echo Step 1: Checking for changes...
git status --short
if %errorlevel% neq 0 (
    echo Error checking git status
    pause
    exit /b 1
)

echo.
echo Step 2: Adding all changes...
git add -A
if %errorlevel% neq 0 (
    echo Error adding files
    pause
    exit /b 1
)

echo.
echo Step 3: Checking staged changes...
git diff --cached --name-only
if %errorlevel% neq 0 (
    echo No staged changes found
    pause
    exit /b 1
)

echo.
echo Step 4: Creating commit...
git commit -m "Update backend changes - %date% %time%"
if %errorlevel% neq 0 (
    echo Error creating commit - maybe nothing to commit?
    pause
    exit /b 1
)

echo.
echo Step 5: Showing last commit...
git log -1 --oneline

echo.
echo Step 6: Pushing to remote...
git push origin master
if %errorlevel% neq 0 (
    echo Error pushing to remote
    pause
    exit /b 1
)

echo.
echo ========================================
echo Success! Changes committed and pushed.
echo ========================================
pause
