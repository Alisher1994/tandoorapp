@echo off
setlocal enabledelayedexpansion

echo ======================================================
echo    Talablar Agent Agent - Fast Setup (Installer)
echo ======================================================

:: 1. Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node-v20+ from: https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Create .env if not exists
if not exist .env (
    echo [CONFIG] Creating configuration...
    set /p SERVER_URL="Enter Server URL (e.g. https://your-app.railway.app): "
    set /p AGENT_TOKEN="Enter Operator Agent Token: "
    
    echo SERVER_URL=!SERVER_URL! > .env
    echo AGENT_TOKEN=!AGENT_TOKEN! >> .env
    echo [OK] .env file created.
) else (
    echo [OK] .env file already exists.
)

:: 3. Install Dependencies
echo [INSTALL] Installing dependencies... This may take a minute.
call npm install

if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    echo Common reasons:
    echo 1. Missing C++ Build Tools (for USB printers)
    echo 2. Python not installed
    echo Try: npm install --foreground-scripts
    pause
    exit /b 1
)

:: 4. Create Start.bat for easy access
if not exist ..\StartAgent.bat (
    echo cd printer-agent > ..\StartAgent.bat
    echo npm start >> ..\StartAgent.bat
    echo pause >> ..\StartAgent.bat
    echo [OK] Created 'StartAgent.bat' in the root directory.
)

echo ======================================================
echo [SUCCESS] setup complete!
echo You can now use 'StartAgent.bat' to launch the printer.
echo ======================================================
pause
