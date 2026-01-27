# Инструкция по развертыванию на Railway

## Подготовка

1. **Создайте Telegram бота:**
   - Откройте [@BotFather](https://t.me/BotFather) в Telegram
   - Отправьте `/newbot` и следуйте инструкциям
   - Сохраните полученный токен

2. **Создайте группу для админов:**
   - Создайте группу в Telegram
   - Добавьте вашего бота в группу
   - Отправьте любое сообщение в группу
   - Перейдите по ссылке: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Найдите `chat.id` группы (будет отрицательным числом, например: `-1001234567890`)

3. **Подготовьте PostgreSQL базу данных:**
   - Railway автоматически создаст PostgreSQL при добавлении плагина
   - Или используйте внешнюю базу данных (например, Supabase, Neon)

## Развертывание на Railway

### Шаг 1: Подключение репозитория

1. Зарегистрируйтесь на [Railway](https://railway.app)
2. Нажмите "New Project"
3. Выберите "Deploy from GitHub repo"
4. Подключите ваш репозиторий

### Шаг 2: Добавление PostgreSQL

1. В проекте Railway нажмите "+ New"
2. Выберите "Database" → "Add PostgreSQL"
3. Railway автоматически создаст базу данных
4. Скопируйте `DATABASE_URL` из переменных окружения

### Шаг 3: Настройка переменных окружения

В настройках проекта Railway добавьте следующие переменные:

```env
# Server
PORT=3000
NODE_ENV=production

# Database (Railway автоматически добавит DATABASE_URL)

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long
JWT_EXPIRES_IN=7d

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-from-botfather
TELEGRAM_ADMIN_CHAT_ID=your-admin-group-chat-id-negative-number
TELEGRAM_WEB_APP_URL=https://your-app-name.railway.app

# Frontend URL
FRONTEND_URL=https://your-app-name.railway.app

# Admin credentials (для первого админа)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-strong-password
```

### Шаг 4: Настройка Telegram Web App

1. Откройте [@BotFather](https://t.me/BotFather)
2. Отправьте `/mybots`
3. Выберите вашего бота
4. Выберите "Bot Settings" → "Menu Button"
5. Выберите "Configure Menu Button"
6. Введите URL: `https://your-app-name.railway.app`
7. Введите текст кнопки: "Открыть магазин"

### Шаг 5: Запуск миграций

После первого деплоя, выполните миграции базы данных:

1. В Railway откройте ваш сервис
2. Перейдите в "Deployments"
3. Откройте последний деплой
4. В консоли выполните:
```bash
npm run migrate
```

Или добавьте команду в `railway.json` для автоматического запуска миграций.

### Шаг 6: Проверка

1. Откройте ваш бот в Telegram
2. Отправьте `/start` для регистрации
3. Получите логин и пароль
4. Откройте веб-приложение через кнопку меню бота
5. Войдите с полученными данными

## Локальная разработка

1. Клонируйте репозиторий
2. Установите зависимости:
```bash
npm install
cd client && npm install
```

3. Создайте `.env` файл на основе `.env.example`
4. Запустите PostgreSQL локально или используйте Docker:
```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres
```

5. Запустите миграции:
```bash
npm run migrate
```

6. Запустите в режиме разработки:
```bash
npm run dev
```

## Структура проекта

```
├── server/              # Backend
│   ├── index.js        # Главный файл сервера
│   ├── routes/         # API маршруты
│   ├── bot/            # Telegram бот
│   ├── database/        # База данных
│   └── middleware/     # Middleware
├── client/             # Frontend React
│   ├── src/
│   │   ├── pages/      # Страницы
│   │   ├── components/ # Компоненты
│   │   └── context/    # Context API
│   └── package.json
└── package.json        # Root package.json
```

## Полезные команды

- `npm run dev` - Запуск в режиме разработки
- `npm run build` - Сборка production версии
- `npm start` - Запуск production сервера
- `npm run migrate` - Запуск миграций базы данных

## Решение проблем

### Бот не отвечает
- Проверьте `TELEGRAM_BOT_TOKEN` в переменных окружения
- Убедитесь, что бот запущен (Railway должен показать логи)

### Ошибки базы данных
- Проверьте `DATABASE_URL` в переменных окружения
- Убедитесь, что миграции выполнены: `npm run migrate`

### Frontend не загружается
- Проверьте `FRONTEND_URL` в переменных окружения
- Убедитесь, что сборка прошла успешно: `npm run build`

### Уведомления не приходят
- Проверьте `TELEGRAM_ADMIN_CHAT_ID` (должен быть отрицательным числом)
- Убедитесь, что бот добавлен в группу админов



