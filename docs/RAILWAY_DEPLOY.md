# 🚀 Деплой на Railway через GitHub

## 📋 Что нужно сделать

### Шаг 1: Добавить Telegram бота (5 минут)

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Введите имя бота (например: "Мой магазин")
4. Введите username (должен заканчиваться на `bot`, например: `my_shop_bot`)
5. **СОХРАНИТЕ ТОКЕН** - он понадобится для Railway

### Шаг 2: Добавить группу для админов (2 минуты)

1. Создайте новую группу в Telegram
2. Добавьте вашего бота в группу (как администратора)
3. Отправьте любое сообщение в группу
4. Откройте в браузере: `https://api.telegram.org/bot<ВАШ_ТОКЕН>/getUpdates`
5. Найдите `"chat":{"id":-1001234567890}` - это ID группы (отрицательное число)
6. **СОХРАНИТЕ ЭТОТ ID**

### Шаг 3: Добавить GitHub репозиторий (3 минуты)

```bash
# В папке проекта
git init
git add .
git commit -m "Initial commit: Order management system"

# Создайте репозиторий на GitHub.com (через веб-интерфейс)
# Затем подключите:
git remote add origin https://github.com/ваш-username/ваш-репозиторий.git
git branch -M main
git push -u origin main
```

### Шаг 4: Деплой на Railway (10 минут)

1. Зарегистрируйтесь на https://railway.app
2. Нажмите "New Project"
3. Выберите "Deploy from GitHub repo"
4. Подключите GitHub аккаунт
5. Выберите ваш репозиторий
6. Railway автоматически начнет деплой

### Шаг 5: Добавить PostgreSQL на Railway (2 минуты)

1. В проекте Railway нажмите "+ New"
2. Выберите "Database" → "Add PostgreSQL"
3. Railway автоматически создаст базу данных
4. Скопируйте `DATABASE_URL` из переменных окружения (Railway покажет его автоматически)

### Шаг 6: Настроить переменные окружения на Railway (5 минут)

В настройках проекта Railway (Settings → Variables) добавьте:

```env
# Server (Railway установит автоматически)
PORT=3000
NODE_ENV=production

# Database (Railway добавит автоматически при создании PostgreSQL)
# DATABASE_URL - уже добавлен Railway

# JWT - придумайте сложный ключ (минимум 32 символа)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long-change-this
JWT_EXPIRES_IN=7d

# Telegram Bot - вставьте токен из шага 1
TELEGRAM_BOT_TOKEN=ваш-токен-из-botfather

# Telegram Admin Chat ID - вставьте ID из шага 2
TELEGRAM_ADMIN_CHAT_ID=-1001234567890

# Frontend URL - получите после деплоя (Railway даст вам URL)
TELEGRAM_WEB_APP_URL=https://ваш-проект.railway.app
FRONTEND_URL=https://ваш-проект.railway.app

# Admin credentials (для первого админа)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=придумайте-сложный-пароль
```

### Шаг 7: Запустить миграции на Railway (2 минуты)

1. В Railway откройте ваш сервис
2. Перейдите в "Deployments"
3. Откройте последний деплой
4. Нажмите на три точки → "Open in Terminal"
5. Выполните:
```bash
npm run migrate
```

### Шаг 8: Настроить Telegram Web App (3 минуты)

1. Откройте [@BotFather](https://t.me/BotFather)
2. Отправьте `/mybots`
3. Выберите вашего бота
4. Выберите "Bot Settings" → "Menu Button"
5. Выберите "Configure Menu Button"
6. Введите URL: `https://ваш-проект.railway.app` (URL из Railway)
7. Введите текст кнопки: "Открыть магазин"

### Шаг 9: Проверка работы (5 минут)

1. Откройте вашего бота в Telegram
2. Отправьте `/start`
3. Введите имя и телефон
4. Получите логин и пароль
5. Нажмите кнопку "Открыть магазин" (или откройте URL в браузере)
6. Войдите с полученными данными
7. Должен открыться каталог

## ✅ Готово!

После выполнения всех шагов у вас будет:
- ✅ Работающая система на Railway
- ✅ PostgreSQL база данных
- ✅ Telegram бот для регистрации
- ✅ Веб-приложение доступное по URL
- ✅ Админ-панель

## 🔗 Полезные ссылки

- Railway: https://railway.app
- GitHub: https://github.com
- BotFather: https://t.me/BotFather

## 📝 Чек-лист

- [ ] Telegram бот создан
- [ ] Группа для админов создана
- [ ] GitHub репозиторий создан и код загружен
- [ ] Проект создан на Railway
- [ ] PostgreSQL добавлен на Railway
- [ ] Переменные окружения настроены
- [ ] Миграции выполнены
- [ ] Telegram Web App настроен
- [ ] Система протестирована

---

**Начните с Шага 1 и двигайтесь последовательно!**




