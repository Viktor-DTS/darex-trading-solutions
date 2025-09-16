@echo off
echo Initializing Git repository...
git init
echo Adding all files...
git add .
echo Committing changes...
git commit -m "Fix cache refresh and navigation issues in frontend"
echo Git repository initialized and changes committed!
echo.
echo To push to remote repository, run:
echo git remote add origin [YOUR_REPOSITORY_URL]
echo git push -u origin main
pause
