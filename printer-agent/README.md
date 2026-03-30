# Talablar Printer Agent (Windows)

Локальный агент для автоматической печати чеков.  
Для оператора теперь один понятный путь: `install.bat` + запуск через ярлык `Talablar Printer`.

## Быстрый запуск (для оператора)

1. Откройте папку `dist`.
2. Запустите `install.bat`.
3. Введите `SERVER_URL` и `AGENT_TOKEN`.
4. После установки запускайте агент через ярлык `Talablar Printer` (он работает в системном трее).

## Смена магазина/токена на этом же ПК

1. Нажмите правой кнопкой на иконку `Talablar Agent` в трее.
2. Выберите `Настройки (сервер/токен)`.
3. Вставьте новый `SERVER_URL` и `AGENT_TOKEN`.
4. Нажмите `Сохранить` — агент перезапустится автоматически.

## Что в релизе

- `TalablarAgent.exe`
- `install.bat`
- `TalablarPrinter.bat`
- `run-agent-tray.ps1`
- `README.md`
- `READ_ME_FIRST.txt`

## Для разработчика

```bash
npm install
npm run build:release
```

`build:release` создаёт чистую папку `dist` и один архив `TalablarAgent-release.zip`.
