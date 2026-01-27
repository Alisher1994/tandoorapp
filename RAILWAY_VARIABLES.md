# 🔐 Переменные окружения для Railway

## Добавьте эти переменные в Railway

В проекте Railway → сервис "tandoorapp" → вкладка "Variables" → Add Variable

### Обязательные переменные:

```
JWT_SECRET=сгенерированный-ниже
JWT_EXPIRES_IN=7d
TELEGRAM_BOT_TOKEN=8307242308:AAFvUVjh2rYimBmd__nwRG8HjSX-Wlt-lsU
TELEGRAM_ADMIN_CHAT_ID=-1003811527870
TELEGRAM_WEB_APP_URL=https://tandoorapp-production.up.railway.app
FRONTEND_URL=https://tandoorapp-production.up.railway.app
ADMIN_USERNAME=Davron
ADMIN_PASSWORD=993025345
NODE_ENV=production
PORT=3000
```

### JWT_SECRET (сгенерирован автоматически):

Смотрите ниже - будет сгенерирован безопасный ключ.

---

**ВАЖНО:** 
- Railway автоматически добавит `DATABASE_URL` при создании PostgreSQL
- После добавления переменных Railway автоматически перезапустит сервис
- Убедитесь, что все переменные добавлены правильно



