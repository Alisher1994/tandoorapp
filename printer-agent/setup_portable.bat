@echo off
setlocal enabledelayedexpansion

echo ======================================================
echo    Tandoor Printer Agent - Fast Configuration
echo ======================================================

:: 1. Create .env if not exists
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

echo ======================================================
echo [SUCCESS] configuration complete!
echo You can now run TandoorPrinterAgent.exe
echo ======================================================
pause
