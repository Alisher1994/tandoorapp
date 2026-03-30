require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const pool = require('../server/database/connection');

const CLI_ARGS = process.argv.slice(2);
const CLI_FORCE_VERSION = CLI_ARGS.find((arg) => !String(arg || '').startsWith('--'));
const FORCE_VERSION = String(
  CLI_FORCE_VERSION
  || process.env.WEB_APP_FORCE_VERSION
  || process.env.WEB_APP_CACHE_VERSION
  || Date.now()
).trim();
const OPERATORS_ONLY = CLI_ARGS.includes('--operators-only') || String(process.env.OPERATORS_ONLY || '').trim() === '1';
const INCLUDE_SUPERADMINS_IN_OPERATORS_MODE = String(
  process.env.OPERATORS_ONLY_INCLUDE_SUPERADMINS ?? '0'
).trim() === '1';
const BASE_WEBAPP_URL = String(process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL || '').trim();
const PER_CHAT_DELAY_MS = Math.max(0, Number.parseInt(process.env.TELEGRAM_MENU_BUTTON_BACKFILL_DELAY_MS, 10) || 35);

function appendVersion(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (FORCE_VERSION) {
      parsed.searchParams.set('app_v', FORCE_VERSION);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function buildCatalogPublicUrl(restaurantId) {
  if (!BASE_WEBAPP_URL || !restaurantId) return null;
  const trimmed = BASE_WEBAPP_URL.endsWith('/') ? BASE_WEBAPP_URL.slice(0, -1) : BASE_WEBAPP_URL;
  return appendVersion(`${trimmed}/catalog?restaurant_id=${encodeURIComponent(String(restaurantId))}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getKnownPrivateChatIdsForRestaurant(restaurantId) {
  if (OPERATORS_ONLY) {
    const roles = INCLUDE_SUPERADMINS_IN_OPERATORS_MODE
      ? ['operator', 'superadmin']
      : ['operator'];
    const result = await pool.query(
      `
      SELECT DISTINCT CAST(COALESCE(tal.telegram_id, u.telegram_id) AS TEXT) AS chat_id
      FROM operator_restaurants opr
      INNER JOIN users u ON u.id = opr.user_id
      LEFT JOIN telegram_admin_links tal ON tal.user_id = u.id
      WHERE opr.restaurant_id = $1
        AND u.role = ANY($2::text[])
        AND COALESCE(tal.telegram_id, u.telegram_id) IS NOT NULL
      ORDER BY chat_id DESC
      `,
      [restaurantId, roles]
    );
    return result.rows
      .map((row) => String(row.chat_id || '').trim())
      .filter(Boolean);
  }

  const result = await pool.query(
    `
    SELECT DISTINCT chat_id
    FROM (
      SELECT CAST(u.telegram_id AS TEXT) AS chat_id
      FROM users u
      INNER JOIN user_restaurants ur ON ur.user_id = u.id
      WHERE ur.restaurant_id = $1
        AND u.telegram_id IS NOT NULL

      UNION

      SELECT CAST(u.telegram_id AS TEXT) AS chat_id
      FROM users u
      INNER JOIN orders o ON o.user_id = u.id
      WHERE o.restaurant_id = $1
        AND u.telegram_id IS NOT NULL

      UNION

      SELECT CAST(COALESCE(tal.telegram_id, u.telegram_id) AS TEXT) AS chat_id
      FROM operator_restaurants opr
      INNER JOIN users u ON u.id = opr.user_id
      LEFT JOIN telegram_admin_links tal ON tal.user_id = u.id
      WHERE opr.restaurant_id = $1
        AND COALESCE(tal.telegram_id, u.telegram_id) IS NOT NULL
    ) AS known_chats
    WHERE chat_id <> ''
    ORDER BY chat_id DESC
    `,
    [restaurantId]
  );
  return result.rows
    .map((row) => String(row.chat_id || '').trim())
    .filter(Boolean);
}

async function setMenuButton(bot, webAppUrl, chatId = null) {
  const payload = {
    menu_button: JSON.stringify({
      type: 'web_app',
      text: 'Open',
      web_app: { url: webAppUrl }
    })
  };
  if (chatId) payload.chat_id = chatId;
  await bot.setChatMenuButton(payload);
}

async function run() {
  if (!BASE_WEBAPP_URL) {
    throw new Error('TELEGRAM_WEB_APP_URL or FRONTEND_URL is not configured');
  }
  if (!FORCE_VERSION) {
    throw new Error('FORCE_VERSION is empty');
  }

  console.log(`[force-webapp-hard-refresh] FORCE_VERSION=${FORCE_VERSION}`);
  console.log(`[force-webapp-hard-refresh] OPERATORS_ONLY=${OPERATORS_ONLY}`);
  if (OPERATORS_ONLY) {
    console.log(
      `[force-webapp-hard-refresh] OPERATORS_ONLY_INCLUDE_SUPERADMINS=${INCLUDE_SUPERADMINS_IN_OPERATORS_MODE}`
    );
  }
  console.log(`[force-webapp-hard-refresh] BASE_WEBAPP_URL=${BASE_WEBAPP_URL}`);

  const restaurantsResult = await pool.query(
    `
    SELECT id, name, telegram_bot_token
    FROM restaurants
    WHERE is_active = true
      AND telegram_bot_token IS NOT NULL
      AND BTRIM(telegram_bot_token) <> ''
    ORDER BY id
    `
  );
  const restaurants = restaurantsResult.rows;
  console.log(`[force-webapp-hard-refresh] restaurants=${restaurants.length}`);

  let totalGlobalUpdated = 0;
  let totalChats = 0;
  let totalChatUpdated = 0;
  let totalChatFailed = 0;

  for (const restaurant of restaurants) {
    const restaurantId = Number(restaurant.id);
    const token = String(restaurant.telegram_bot_token || '').trim();
    const restaurantName = String(restaurant.name || '').trim() || `restaurant_${restaurantId}`;
    if (!restaurantId || !token) continue;

    const webAppUrl = buildCatalogPublicUrl(restaurantId);
    if (!webAppUrl) {
      console.log(`[${restaurantName}] skip: no webAppUrl`);
      continue;
    }

    const bot = new TelegramBot(token);

    try {
      await setMenuButton(bot, webAppUrl);
      totalGlobalUpdated += 1;
    } catch (error) {
      console.log(`[${restaurantName}] global menu update failed: ${error.message}`);
    }

    const chatIds = await getKnownPrivateChatIdsForRestaurant(restaurantId);
    totalChats += chatIds.length;
    let restaurantUpdated = 0;
    let restaurantFailed = 0;

    for (const chatId of chatIds) {
      try {
        await setMenuButton(bot, webAppUrl, chatId);
        restaurantUpdated += 1;
      } catch (error) {
        restaurantFailed += 1;
        const code = error?.response?.body?.error_code;
        if (code !== 400 && code !== 403) {
          console.log(`[${restaurantName}] chat=${chatId} failed: ${error.message}`);
        }
      }
      if (PER_CHAT_DELAY_MS > 0) {
        await delay(PER_CHAT_DELAY_MS);
      }
    }

    totalChatUpdated += restaurantUpdated;
    totalChatFailed += restaurantFailed;
    console.log(`[${restaurantName}] chats updated=${restaurantUpdated}/${chatIds.length}, failed=${restaurantFailed}`);
  }

  console.log(
    `[force-webapp-hard-refresh] done: global_updated=${totalGlobalUpdated}, chats=${totalChats}, ` +
    `chat_updated=${totalChatUpdated}, chat_failed=${totalChatFailed}`
  );
}

run()
  .catch((error) => {
    console.error('[force-webapp-hard-refresh] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
