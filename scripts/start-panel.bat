@echo off
title FX Scalp Agent
cd /d "%~dp0.."

echo ========================================
echo   FX Scalp Agent — Panel + Worker
echo ========================================
echo.
echo   URL: http://127.0.0.1:8788
echo   (port from .env FX_API_PORT)
echo.
echo   Do NOT close this window while running.
echo   Stop panel: npm run panel:stop
echo.
echo ========================================
echo.

call npm run panel

if errorlevel 1 (
  echo.
  echo [ERROR] Panel failed to start.
  pause
)
