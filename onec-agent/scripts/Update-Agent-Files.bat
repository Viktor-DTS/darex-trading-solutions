@echo off
chcp 65001 >nul
echo Оновлення файлів агента (скопіюйте з нової dist-portable поверх старої).
echo.
echo Обов'язково:
echo   app\src\index.js
echo   app\src\spawnOnce.js
echo   app\src\agentWindow.js
echo   app\src\automation.js
echo   app\src\keyboardLayout.js
echo   app\src\paths.js
echo   app\src\pipeline.js
echo   scripts\window-needles.json
echo   scripts\prepare-desktop.ps1
echo   scripts\set-keyboard-layout.ps1
echo.
echo Після оновлення у Start-Agent.bat має бути:
echo   Збірка: 2026-06-19-ps1-encoding-fix
echo   Temp: ...\dist-portable\temp
echo   Розклад: ... — запуск як Test-Once (--once)
echo.
pause
