@echo off
echo ========================================
echo Setting up Git repository for DTS Service
echo ========================================

echo.
echo Step 1: Initializing Git repository...
git init

echo.
echo Step 2: Adding all files to Git...
git add .

echo.
echo Step 3: Committing changes...
git commit -m "Fix cache refresh and navigation issues in frontend

- Fixed cache not updating after task editing
- Fixed automatic navigation redirect after saving
- Added automatic data refresh on browser tab focus
- Updated handleSave function in all area components
- Removed automatic tab switching after task save"

echo.
echo ========================================
echo Git repository setup complete!
echo ========================================
echo.
echo To push to remote repository:
echo 1. git remote add origin [YOUR_REPOSITORY_URL]
echo 2. git push -u origin main
echo.
pause


