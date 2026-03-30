@echo off
chcp 65001 >nul 2>&1
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT_DIR%\run-agent-tray.ps1" -WorkDir "%SCRIPT_DIR%"
