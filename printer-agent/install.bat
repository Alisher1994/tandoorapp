@echo off
chcp 65001 >nul 2>&1
title Talablar Printer Agent - Установка
color 0A

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   TALABLAR PRINTER AGENT - УСТАНОВЩИК v2.0   ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Эта программа установит Printer Agent на ваш
echo  компьютер для автоматической печати чеков.
echo.
echo  ─────────────────────────────────────────────
echo.

:: Check if running as admin for auto-start feature
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Рекомендуется запустить от имени администратора
    echo      для установки автозапуска.
    echo.
)

:: Set install directory
set "INSTALL_DIR=%APPDATA%\TalablarAgent"
echo  Папка установки: %INSTALL_DIR%
echo.

:: Ask for server URL
set "DEFAULT_URL=https://talablar.up.railway.app"
set /p SERVER_URL="  Адрес сервера [%DEFAULT_URL%]: "
if "%SERVER_URL%"=="" set "SERVER_URL=%DEFAULT_URL%"

echo.

:: Ask for token
set /p AGENT_TOKEN="  Вставьте ТОКЕН агента (из админки): "
if "%AGENT_TOKEN%"=="" (
    echo.
    echo  [ОШИБКА] Токен обязателен! Получите его в админке:
    echo           Принтеры - Добавить агента - Скопировать токен
    echo.
    pause
    exit /b 1
)

echo.
echo  ─────────────────────────────────────────────
echo.
echo  Сервер:  %SERVER_URL%
echo  Токен:   %AGENT_TOKEN:~0,8%...
echo.
set /p CONFIRM="  Всё верно? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo  Установка отменена.
    pause
    exit /b 0
)

echo.
echo  [1/4] Создание папки установки...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo  [2/4] Копирование файлов...
:: Copy the EXE
if exist "%~dp0dist\TalablarAgent.exe" (
    copy /Y "%~dp0dist\TalablarAgent.exe" "%INSTALL_DIR%\TalablarAgent.exe" >nul
) else if exist "%~dp0TalablarAgent.exe" (
    copy /Y "%~dp0TalablarAgent.exe" "%INSTALL_DIR%\TalablarAgent.exe" >nul
) else (
    echo  [ОШИБКА] Не найден TalablarAgent.exe!
    echo  Убедитесь, что файл находится рядом с установщиком.
    pause
    exit /b 1
)
if exist "%~dp0run-agent-tray.ps1" (
    copy /Y "%~dp0run-agent-tray.ps1" "%INSTALL_DIR%\run-agent-tray.ps1" >nul
)

echo  [3/4] Создание конфигурации...
:: Create .env file
(
    echo SERVER_URL=%SERVER_URL%
    echo AGENT_TOKEN=%AGENT_TOKEN%
    echo # По умолчанию: TALABLAR_CODEPAGE=17 и TALABLAR_ICONV_ENCODING=cp866
    echo # Если русские буквы всё равно кракозябры, раскомментируйте или поменяйте:
    echo # TALABLAR_CODEPAGE=46
    echo # TALABLAR_ICONV_ENCODING=windows-1251
    echo # TALABLAR_LOGO_MAX_WIDTH=384
) > "%INSTALL_DIR%\.env"

:: Create single launcher script (tray + settings in one place)
(
    echo @echo off
    echo chcp 65001 ^>nul 2^>^&1
    echo cd /d "%%~dp0"
    echo powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%%~dp0run-agent-tray.ps1" -WorkDir "%%~dp0"
) > "%INSTALL_DIR%\Talablar Printer.bat"

echo  [4/4] Создание ярлыков...

:: Create desktop shortcut via PowerShell
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Talablar Printer.lnk')); $s.TargetPath = '%INSTALL_DIR%\Talablar Printer.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.IconLocation = 'shell32.dll,16'; $s.Description = 'Talablar Printer Agent'; $s.Save()" >nul 2>&1

if %errorlevel% equ 0 (
    echo  [OK] Ярлык создан на рабочем столе
) else (
    echo  [!] Не удалось создать ярлык
)

:: Ask about auto-start
echo.
set /p AUTOSTART="  Запускать автоматически при включении ПК? (Y/N): "
if /i "%AUTOSTART%"=="Y" (
    :: Add to Startup folder
    powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $startup = $ws.SpecialFolders('Startup'); $s = $ws.CreateShortcut([IO.Path]::Combine($startup, 'Talablar Printer.lnk')); $s.TargetPath = '%INSTALL_DIR%\Talablar Printer.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.WindowStyle = 7; $s.Description = 'Talablar Printer Agent'; $s.Save()" >nul 2>&1
    echo  [OK] Автозапуск настроен
)

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║          УСТАНОВКА ЗАВЕРШЕНА!                ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Файлы установлены: %INSTALL_DIR%
echo  Ярлык на рабочем столе: "Talablar Printer"
echo.
echo  Не забудьте:
echo  1. Подключить принтер к компьютеру
echo  2. Настроить общий доступ к принтеру в Windows
echo  3. Добавить принтер в админке (Принтеры - Добавить принтер)
echo.

set /p RUNNOW="  Запустить агент сейчас? (Y/N): "
if /i "%RUNNOW%"=="Y" (
    start "" "%INSTALL_DIR%\Talablar Printer.bat"
)

echo.
echo  Готово! Можете закрыть это окно.
echo.
pause
