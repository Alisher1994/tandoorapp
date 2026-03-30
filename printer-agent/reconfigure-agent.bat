@echo off
chcp 65001 >nul 2>&1
title Talablar Agent - Reconfigure
cd /d "%~dp0"

if exist "TalablarAgent.exe" (
  TalablarAgent.exe --setup
) else (
  node agent.js --setup
)

echo.
echo Configuration updated.
pause
