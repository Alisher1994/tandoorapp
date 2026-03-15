require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const pool = require('../server/database/connection');

const BOT_TEXTS = {
  ru: {
    menuUpdated: '🔄 Меню обновлено.',
    openMenu: 'Заказать',
    myOrders: '📋 Мои заказы',
    contactButton: '☎️ Связь',
    editProfile: '⚙️ Изменить данные'
  },
  uz: {
    menuUpdated: '🔄 Menyu yangilandi.',
    openMenu: 'Buyurtma berish',
    myOrders: '📋 Buyurtmalarim',
    contactButton: "☎️ Bog'lanish",
    editProfile: '⚙️ Ma’lumotlarni o‘zgartirish'
  }
};

const normalizeLang = (value) => (String(value || '').trim().toLowerCase() === 'uz' ? 'uz' : 'ru');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildCustomerReplyKeyboard(lang) {
  const text = BOT_TEXTS[lang];
  return {
    keyboard: [
      [{ text: text.openMenu }],
      [
        { text: text.myOrders },
        { text: text.contactButton },
        { text: text.editProfile }
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

async function sendMenuUpdate(bot, telegramId, lang) {
  const text = BOT_TEXTS[lang];
  const options = { reply_markup: buildCustomerReplyKeyboard(lang) };

  try {
    await bot.sendMessage(String(telegramId), text.menuUpdated, options);
    return { ok: true };
  } catch (error) {
    const retryAfter = Number(error?.response?.body?.parameters?.retry_after || 0);
    if (retryAfter > 0 && retryAfter < 120) {
      await delay((retryAfter + 1) * 1000);
      try {
        await bot.sendMessage(String(telegramId), text.menuUpdated, options);
        return { ok: true, retried: true };
      } catch (retryError) {
        return { ok: false, error: retryError };
      }
    }
    return { ok: false, error };
  }
}

async function run() {
  const restaurantsResult = await pool.query(
    `SELECT id, name, telegram_bot_token
     FROM restaurants
     WHERE is_active = true
       AND telegram_bot_token IS NOT NULL
       AND BTRIM(telegram_bot_token) <> ''`
  );

  const restaurants = restaurantsResult.rows;
  if (!restaurants.length) {
    console.log('No active restaurants with bot token found.');
    return;
  }

  let totalSent = 0;
  let totalFailed = 0;
  let totalCustomers = 0;

  for (const restaurant of restaurants) {
    const restaurantId = Number(restaurant.id);
    const token = String(restaurant.telegram_bot_token || '').trim();
    if (!token) continue;

    const customersResult = await pool.query(
      `SELECT DISTINCT u.telegram_id, COALESCE(NULLIF(BTRIM(u.bot_language), ''), 'ru') AS bot_language
       FROM users u
       WHERE u.role = 'customer'
         AND u.is_active = true
         AND u.telegram_id IS NOT NULL
         AND (
           u.active_restaurant_id = $1
           OR EXISTS (
             SELECT 1
             FROM user_restaurants ur
             WHERE ur.user_id = u.id
               AND ur.restaurant_id = $1
           )
           OR EXISTS (
             SELECT 1
             FROM orders o
             WHERE o.user_id = u.id
               AND o.restaurant_id = $1
           )
         )`,
      [restaurantId]
    );

    const customers = customersResult.rows;
    totalCustomers += customers.length;
    if (!customers.length) {
      console.log(`Restaurant ${restaurantId} (${restaurant.name}): no customers to update.`);
      continue;
    }

    const bot = new TelegramBot(token);
    let sent = 0;
    let failed = 0;

    for (const customer of customers) {
      const lang = normalizeLang(customer.bot_language);
      const result = await sendMenuUpdate(bot, customer.telegram_id, lang);
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        console.log(
          `Failed [restaurant=${restaurantId}] [telegram_id=${customer.telegram_id}]: ${result.error?.message || 'unknown error'}`
        );
      }
      await delay(35);
    }

    totalSent += sent;
    totalFailed += failed;
    console.log(`Restaurant ${restaurantId} (${restaurant.name}): sent=${sent}, failed=${failed}, total=${customers.length}`);
  }

  console.log(`Done. customers=${totalCustomers}, sent=${totalSent}, failed=${totalFailed}`);
}

run()
  .catch((error) => {
    console.error('Keyboard refresh failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
