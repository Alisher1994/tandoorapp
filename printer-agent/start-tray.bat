@echo off
chcp 65001 >nul 2>&1
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT_DIR%run-agent-tray.ps1" -WorkDir "%SCRIPT_DIR%"
