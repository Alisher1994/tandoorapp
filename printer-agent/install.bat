@echo off
chcp 65001 >nul 2>&1
title Tandoor Printer Agent - Установка
color 0A

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   TANDOOR PRINTER AGENT - УСТАНОВЩИК v1.0   ║
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
set "INSTALL_DIR=%LOCALAPPDATA%\TandoorPrinter"
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
if exist "%~dp0dist\TandoorPrinterAgent.exe" (
    copy /Y "%~dp0dist\TandoorPrinterAgent.exe" "%INSTALL_DIR%\TandoorPrinterAgent.exe" >nul
) else if exist "%~dp0TandoorPrinterAgent.exe" (
    copy /Y "%~dp0TandoorPrinterAgent.exe" "%INSTALL_DIR%\TandoorPrinterAgent.exe" >nul
) else (
    echo  [ОШИБКА] Не найден TandoorPrinterAgent.exe!
    echo  Убедитесь, что файл находится рядом с установщиком.
    pause
    exit /b 1
)

echo  [3/4] Создание конфигурации...
:: Create .env file
(
    echo SERVER_URL=%SERVER_URL%
    echo AGENT_TOKEN=%AGENT_TOKEN%
) > "%INSTALL_DIR%\.env"

:: Create start script
(
    echo @echo off
    echo chcp 65001 ^>nul 2^>^&1
    echo title Tandoor Printer Agent
    echo cd /d "%%~dp0"
    echo echo.
    echo echo  Tandoor Printer Agent запущен...
    echo echo  Для остановки закройте это окно.
    echo echo.
    echo TandoorPrinterAgent.exe
    echo if errorlevel 1 ^(
    echo     echo.
    echo     echo  [ОШИБКА] Агент завершился с ошибкой.
    echo     echo  Проверьте токен и адрес сервера.
    echo     pause
    echo ^)
) > "%INSTALL_DIR%\Запустить Принтер.bat"

echo  [4/4] Создание ярлыков...

:: Create desktop shortcut via PowerShell
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Tandoor Printer.lnk')); $s.TargetPath = '%INSTALL_DIR%\Запустить Принтер.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.IconLocation = 'shell32.dll,16'; $s.Description = 'Tandoor Printer Agent'; $s.Save()" >nul 2>&1

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
    powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $startup = $ws.SpecialFolders('Startup'); $s = $ws.CreateShortcut([IO.Path]::Combine($startup, 'Tandoor Printer.lnk')); $s.TargetPath = '%INSTALL_DIR%\Запустить Принтер.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.WindowStyle = 7; $s.Description = 'Tandoor Printer Agent'; $s.Save()" >nul 2>&1
    echo  [OK] Автозапуск настроен
)

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║          УСТАНОВКА ЗАВЕРШЕНА!                ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Файлы установлены: %INSTALL_DIR%
echo  Ярлык на рабочем столе: "Tandoor Printer"
echo.
echo  Не забудьте:
echo  1. Подключить принтер к компьютеру
echo  2. Настроить общий доступ к принтеру в Windows
echo  3. Добавить принтер в админке (Принтеры - Добавить принтер)
echo.

set /p RUNNOW="  Запустить агент сейчас? (Y/N): "
if /i "%RUNNOW%"=="Y" (
    start "" "%INSTALL_DIR%\Запустить Принтер.bat"
)

echo.
echo  Готово! Можете закрыть это окно.
echo.
pause
