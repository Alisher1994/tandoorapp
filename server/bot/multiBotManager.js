const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  sendOrderUpdateToUser,
  buildGroupOrderNotificationPayload,
  buildGroupOrderActionKeyboard,
  buildOrderPreviewUrl
} = require('./notifications');

// Store all bots: Map<botToken, { bot, restaurantId, restaurantName }>
const restaurantBots = new Map();

// Store for registration states: Map<`${botToken}_${telegramUserId}`, state>
const registrationStates = new Map();
const passwordResetCooldown = new Map();
const languageSelectionStates = new Map();
const languagePreferences = new Map();

const BOT_LANGUAGES = ['ru', 'uz'];
const BOT_TEXTS = {
  ru: {
    chooseLanguage: '🌐 Выберите язык системы:',
    languageSaved: '✅ Язык сохранен.',
    openMenu: '🍽️ Открыть меню',
    myOrders: '📋 Мои заказы',
    welcomeBack: '👋 С возвращением, {name}!',
    roleLine: '🧑‍💼 Роль: <b>{role}</b>',
    roleSuperadmin: 'Суперадмин',
    roleOperator: 'Оператор',
    restaurantLine: '🏪 Ресторан: <b>{name}</b>',
    loginHint: 'Используйте кнопку ниже для входа в систему.',
    loginWarn: '⚠️ URL входа не настроен. Обратитесь к администратору.',
    loginButton: '🔐 Войти в систему',
    resetButton: '♻️ Восстановить доступ',
    editProfile: '⚙️ Изменить данные',
    feedback: '💬 Жалобы и предложения',
    welcomeNew: '👋 Добро пожаловать в <b>{name}</b>!\n\n📱 Для регистрации, пожалуйста, поделитесь своим номером телефона:',
    shareContact: '📱 Поделиться контактом',
    thanksName: '✅ Спасибо!\n\n👤 Теперь введите ваше имя:',
    niceToMeet: '👋 Приятно познакомиться, {name}!\n\n📍 Теперь поделитесь вашей геолокацией:',
    shareLocation: '📍 Поделиться локацией',
    genericError: '❌ Произошла ошибка. Попробуйте позже.'
  },
  uz: {
    chooseLanguage: '🌐 Tizim tilini tanlang:',
    languageSaved: '✅ Til saqlandi.',
    openMenu: '🍽️ Menyuni ochish',
    myOrders: '📋 Buyurtmalarim',
    welcomeBack: '👋 Qaytganingiz bilan, {name}!',
    roleLine: '🧑‍💼 Rol: <b>{role}</b>',
    roleSuperadmin: 'Superadmin',
    roleOperator: 'Operator',
    restaurantLine: '🏪 Restoran: <b>{name}</b>',
    loginHint: 'Tizimga kirish uchun quyidagi tugmani bosing.',
    loginWarn: '⚠️ Kirish havolasi sozlanmagan. Administratorga murojaat qiling.',
    loginButton: '🔐 Tizimga kirish',
    resetButton: '♻️ Kirishni tiklash',
    editProfile: '⚙️ Ma’lumotlarni o‘zgartirish',
    feedback: '💬 Shikoyat va takliflar',
    welcomeNew: '👋 <b>{name}</b> ga xush kelibsiz!\n\n📱 Ro‘yxatdan o‘tish uchun telefon raqamingizni yuboring:',
    shareContact: '📱 Kontaktni yuborish',
    thanksName: '✅ Rahmat!\n\n👤 Endi ismingizni kiriting:',
    niceToMeet: '👋 Tanishganimdan xursandman, {name}!\n\n📍 Endi geolokatsiyangizni yuboring:',
    shareLocation: '📍 Lokatsiyani yuborish',
    genericError: '❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.'
  }
};

// Generate login token for auto-login
function generateLoginToken(userId, username) {
  return jwt.sign(
    { userId, username, autoLogin: true },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function buildCatalogUrl(appUrl, token) {
  if (!appUrl) return null;
  const trimmed = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return `${trimmed}/catalog?token=${token}`;
}

function generateTemporaryPassword(length = 12) {
  const raw = crypto.randomBytes(24).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
  return raw.slice(0, length);
}

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return trimmed.replace(/\D/g, '');
}

async function resolveUniqueCustomerUsername(preferredUsername, telegramUserId) {
  const ownerId = String(telegramUserId);
  let candidate = String(preferredUsername || '').trim() || `user_${ownerId}`;

  const existing = await pool.query(
    'SELECT telegram_id FROM users WHERE username = $1 LIMIT 1',
    [candidate]
  );

  if (existing.rows.length === 0 || String(existing.rows[0].telegram_id || '') === ownerId) {
    return candidate;
  }

  const base = `user_${ownerId}`;
  candidate = base;
  let suffix = 1;

  while (true) {
    const conflict = await pool.query('SELECT 1 FROM users WHERE username = $1 LIMIT 1', [candidate]);
    if (conflict.rows.length === 0) return candidate;
    candidate = `${base}_${suffix++}`;
  }
}

function buildWebLoginUrl() {
  const base = process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
  if (!base) return null;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/login`;
}

function normalizeBotLanguage(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return BOT_LANGUAGES.includes(candidate) ? candidate : 'ru';
}

function getTelegramPreferredLanguage(telegramCode) {
  const code = String(telegramCode || '').toLowerCase();
  if (code.startsWith('uz')) return 'uz';
  return 'ru';
}

function t(lang, key, vars = {}) {
  const language = normalizeBotLanguage(lang);
  const dictionary = BOT_TEXTS[language] || BOT_TEXTS.ru;
  const template = dictionary[key] || BOT_TEXTS.ru[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, varName) => String(vars[varName] ?? ''));
}

function resolveLoginValue(user) {
  const phoneLogin = normalizePhone(user?.phone);
  if (phoneLogin) return phoneLogin;
  return user?.username || '';
}

async function generateUniqueOperatorUsername(restaurantId, telegramUserId) {
  for (let i = 0; i < 10; i++) {
    const suffix = crypto.randomBytes(2).toString('hex');
    const username = `op_${restaurantId}_${telegramUserId}_${suffix}`;
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length === 0) {
      return username;
    }
  }
  return `op_${restaurantId}_${Date.now()}`;
}

// Check if point is inside polygon
function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;

  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat_i, lng_i] = polygon[i];
    const [lat_j, lng_j] = polygon[j];

    if (((lng_i > lng) !== (lng_j > lng)) &&
      (lat < (lat_j - lat_i) * (lng - lng_i) / (lng_j - lng_i) + lat_i)) {
      inside = !inside;
    }
  }

  return inside;
}

// Check restaurant working hours
function getTimeInTimeZone(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const hh = parts.find(p => p.type === 'hour')?.value || '00';
  const mm = parts.find(p => p.type === 'minute')?.value || '00';
  return { hh: parseInt(hh, 10), mm: parseInt(mm, 10) };
}

function isRestaurantOpen(openTime, closeTime) {
  if (!openTime || !closeTime) return true;
  const timeZone = process.env.RESTAURANT_TIMEZONE || 'Asia/Tashkent';
  const { hh, mm } = getTimeInTimeZone(timeZone);
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const nowMinutes = hh * 60 + mm;

  if (openMinutes === closeMinutes) return true;
  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

// Check if location is in restaurant's delivery zone
async function isLocationInRestaurantZone(restaurantId, lat, lng) {
  try {
    const result = await pool.query(
      'SELECT delivery_zone FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (result.rows.length === 0) return true; // No zone = deliver everywhere

    let zone = result.rows[0].delivery_zone;
    if (!zone) return true; // No zone = deliver everywhere

    if (typeof zone === 'string') {
      zone = JSON.parse(zone);
    }

    if (!zone || zone.length < 3) return true;

    return isPointInPolygon([lat, lng], zone);
  } catch (error) {
    console.error('Zone check error:', error);
    return true; // On error, allow delivery
  }
}

// Check if user is blocked (globally or for specific restaurant)
async function checkBlockedUser(bot, chatId, userId, restaurantId) {
  try {
    let userResult;
    try {
      userResult = await pool.query(
        'SELECT u.is_active, ur.is_blocked FROM users u LEFT JOIN user_restaurants ur ON u.id = ur.user_id AND ur.restaurant_id = $2 WHERE u.telegram_id = $1',
        [userId, restaurantId]
      );
    } catch (queryError) {
      // Backward compatibility: DB may not yet have user_restaurants.is_blocked column
      if (queryError.code === '42703') {
        userResult = await pool.query(
          'SELECT u.is_active, false as is_blocked FROM users u WHERE u.telegram_id = $1',
          [userId]
        );
      } else {
        throw queryError;
      }
    }

    if (userResult.rows.length > 0) {
      const { is_active, is_blocked } = userResult.rows[0];

      if (!is_active || is_blocked) {
        // Get support username from restaurant
        const restaurantResult = await pool.query(
          'SELECT support_username FROM restaurants WHERE id = $1',
          [restaurantId]
        );

        const supportUsername = restaurantResult.rows[0]?.support_username || process.env.ADMIN_USERNAME || 'admin';

        await bot.sendMessage(chatId,
          `🚫 <b>Ваш аккаунт заблокирован</b>\n\n` +
          `Для связи с администратором обратитесь: @${supportUsername}`,
          { parse_mode: 'HTML' }
        );
        return true; // User is blocked
      }
    }
    return false; // User is not blocked
  } catch (error) {
    console.error('Check blocked user error:', error);
    return false;
  }
}

// Setup handlers for a specific bot
function setupBotHandlers(bot, restaurantId, restaurantName, botToken) {
  const appUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;

  console.log(`🤖 Setting up handlers for restaurant: ${restaurantName} (ID: ${restaurantId})`);

  // Helper to get state key - includes chatId for group handling
  const getStateKey = (userId, chatId) => `${botToken}_${chatId || ''}_${userId}`;
  const getLangStateKey = (userId, chatId) => `lang_${getStateKey(userId, chatId)}`;
  const getLangCacheKey = (userId) => `${botToken}_${userId}`;

  const saveUserLanguage = async (userId, lang) => {
    const normalized = normalizeBotLanguage(lang);
    languagePreferences.set(getLangCacheKey(userId), normalized);
    try {
      await pool.query(
        'UPDATE users SET bot_language = $1 WHERE telegram_id = $2',
        [normalized, userId]
      );
    } catch (error) {
      if (error.code !== '42703') {
        console.error('Save user language warning:', error.message);
      }
    }
    return normalized;
  };

  const resolveUserLanguage = (user, fallback = 'ru') => {
    return normalizeBotLanguage(
      user?.bot_language ||
      languagePreferences.get(getLangCacheKey(user?.telegram_id)) ||
      fallback
    );
  };

  const buildMainMenuButtons = (loginUrl, lang) => {
    const menuButtons = [];
    if (loginUrl) {
      menuButtons.push([{ text: t(lang, 'openMenu'), web_app: { url: loginUrl } }]);
    }
    menuButtons.push([{ text: t(lang, 'myOrders'), callback_data: 'my_orders' }]);
    return menuButtons;
  };

  const sendLanguagePicker = async (chatId, userId, lang = 'ru') => {
    const normalized = normalizeBotLanguage(lang);
    languageSelectionStates.set(getLangStateKey(userId, chatId), { next: 'start' });
    await bot.sendMessage(chatId, t(normalized, 'chooseLanguage'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇷🇺 Русский', callback_data: 'set_lang_ru' },
            { text: '🇺🇿 O`zbekcha', callback_data: 'set_lang_uz' }
          ]
        ]
      }
    });
  };

  const showStartMenu = async (msg, lang) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const language = normalizeBotLanguage(lang);

    // Check if user is blocked
    if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [userId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      languagePreferences.set(getLangCacheKey(userId), language);

      const telegramUsername = msg.from.username;
      if (telegramUsername && !user.username.startsWith('@')) {
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1, username = $2 WHERE id = $3',
          [restaurantId, `@${telegramUsername}`, user.id]
        );
      } else {
        await pool.query(
          'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
          [restaurantId, user.id]
        );
      }

      await pool.query(`
        INSERT INTO user_restaurants (user_id, restaurant_id, last_interaction)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, restaurant_id)
        DO UPDATE SET last_interaction = CURRENT_TIMESTAMP
      `, [user.id, restaurantId]);

      if (user.role === 'operator' || user.role === 'superadmin') {
        const loginBaseUrl = process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
        const loginUrl = loginBaseUrl
          ? `${loginBaseUrl.endsWith('/') ? loginBaseUrl.slice(0, -1) : loginBaseUrl}/login`
          : null;

        await bot.sendMessage(
          chatId,
          `${t(language, 'welcomeBack', { name: user.full_name || user.username })}\n\n` +
          `${t(language, 'roleLine', { role: user.role === 'superadmin' ? t(language, 'roleSuperadmin') : t(language, 'roleOperator') })}\n` +
          `${t(language, 'restaurantLine', { name: restaurantName })}\n\n` +
          `${loginUrl ? t(language, 'loginHint') : t(language, 'loginWarn')}`,
          {
            parse_mode: 'HTML',
            reply_markup: loginUrl
              ? {
                inline_keyboard: [
                  [{ text: t(language, 'loginButton'), url: loginUrl }],
                  [{ text: t(language, 'resetButton'), callback_data: 'reset_password' }]
                ]
              }
              : undefined
          }
        );
      } else {
        const token = generateLoginToken(user.id, user.username);
        const loginUrl = buildCatalogUrl(appUrl, token);

        await bot.sendMessage(
          chatId,
          `${t(language, 'welcomeBack', { name: user.full_name })}\n\n` +
          `${t(language, 'restaurantLine', { name: restaurantName })}` +
          `${loginUrl ? '' : `\n\n${t(language, 'loginWarn')}`}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                ...buildMainMenuButtons(loginUrl, language),
                [{ text: t(language, 'editProfile'), callback_data: 'edit_profile' }],
                [{ text: t(language, 'feedback'), callback_data: 'feedback' }]
              ]
            }
          }
        );
      }
      return;
    }

    registrationStates.set(getStateKey(userId, chatId), { step: 'waiting_contact', restaurantId, lang: language });
    await bot.sendMessage(
      chatId,
      t(language, 'welcomeNew', { name: restaurantName }),
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: t(language, 'shareContact'), request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  };

  // /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    console.log(`📱 /start from user ${userId} for restaurant ${restaurantName}`);

    try {
      const fallbackLang = getTelegramPreferredLanguage(msg.from?.language_code);
      await sendLanguagePicker(chatId, userId, fallbackLang);
    } catch (error) {
      console.error('Start command error:', error);
      bot.sendMessage(chatId, t('ru', 'genericError'));
    }
  });

  // /id command
  bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `Your Telegram ID: <code>${msg.from.id}</code>`, { parse_mode: 'HTML' });
  });

  // /lang command
  bot.onText(/\/lang/, async (msg) => {
    const fallbackLang = getTelegramPreferredLanguage(msg.from?.language_code);
    await sendLanguagePicker(msg.chat.id, msg.from.id, fallbackLang);
  });

  // /menu command
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }

      const user = userResult.rows[0];
      const userLang = resolveUserLanguage(user, getTelegramPreferredLanguage(msg.from?.language_code));

      // Update active restaurant
      await pool.query(
        'UPDATE users SET active_restaurant_id = $1 WHERE id = $2',
        [restaurantId, user.id]
      );

      const token = generateLoginToken(user.id, user.username);
      const loginUrl = buildCatalogUrl(appUrl, token);

      bot.sendMessage(chatId,
        `🍽️ <b>${restaurantName}</b>\n\n` +
        (loginUrl
          ? (userLang === 'uz' ? 'Menyuni ochish uchun quyidagi tugmani bosing:' : 'Нажмите кнопку ниже, чтобы открыть меню:')
          : t(userLang, 'loginWarn')),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: buildMainMenuButtons(loginUrl, userLang)
          }
        }
      );
    } catch (error) {
      console.error('Menu command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
  });

  // /reset_password command
  bot.onText(/\/reset_password/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      if (msg.chat.type !== 'private') {
        await bot.sendMessage(chatId, '⚠️ Восстановление пароля доступно только в личном чате с ботом.');
        return;
      }

      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

      const userResult = await pool.query(
        'SELECT id, username, phone, role FROM users WHERE telegram_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }

      if (userResult.rows[0].role === 'customer') {
        await bot.sendMessage(chatId, 'ℹ️ Для клиентов восстановление через бот отключено.');
        return;
      }

      const stateKey = getStateKey(userId, chatId);
      registrationStates.set(stateKey, {
        step: 'waiting_password_reset_confirm',
        dbUserId: userResult.rows[0].id,
        username: userResult.rows[0].username,
        phone: userResult.rows[0].phone,
        restaurantId
      });

      await bot.sendMessage(
        chatId,
        '🔐 <b>Восстановление пароля</b>\n\nПодтвердите действие. Мы сгенерируем новый временный пароль.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Подтвердить', callback_data: 'reset_password_confirm' }],
              [{ text: '❌ Отмена', callback_data: 'reset_password_cancel' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Reset password command error:', error);
      bot.sendMessage(chatId, '❌ Ошибка восстановления пароля. Попробуйте позже.');
    }
  });

  const processOperatorRegistration = async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(
      chatId,
      'ℹ️ Саморегистрация операторов через код отключена.\n' +
      'Добавляйте сотрудников через веб-панель ресторана в разделе "Операторы".'
    );
  };

  // /operator command - disabled
  bot.onText(/\/operator(?:\s+(.+))?/, async (msg) => {
    await processOperatorRegistration(msg);
  });

  // Handle contact sharing
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;

    let state = registrationStates.get(getStateKey(userId, chatId));
    let stateKey = getStateKey(userId, chatId);

    // Registration contact flow
    if (state && state.step === 'waiting_contact') {
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru');
      state.phone = normalizePhone(contact.phone_number);
      state.step = 'waiting_name';
      state.lang = userLang;
      registrationStates.set(stateKey, state);

      bot.sendMessage(chatId,
        t(userLang, 'thanksName'),
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // Phone update flow
    if (state && state.step === 'waiting_new_phone') {
      try {
        // Get current user data
        const userResult = await pool.query(
          'SELECT id, phone FROM users WHERE telegram_id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start', { reply_markup: { remove_keyboard: true } });
          registrationStates.delete(stateKey);
          return;
        }

        const user = userResult.rows[0];
        const oldPhone = user.phone;
        const newPhone = normalizePhone(contact.phone_number);

        // Update user phone first
        await pool.query(
          `UPDATE users
           SET phone = $1,
               username = CASE WHEN $2 <> '' THEN $2 ELSE username END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newPhone, newPhone, user.id]
        );

        // Try to log the change (table may not exist yet)
        try {
          await pool.query(`
            INSERT INTO user_profile_logs (user_id, field_name, old_value, new_value, changed_via)
            VALUES ($1, 'phone', $2, $3, 'bot')
          `, [user.id, oldPhone, newPhone]);
        } catch (logError) {
          console.log('Profile log table may not exist:', logError.message);
        }

        bot.sendMessage(chatId,
          `✅ <b>Телефон успешно изменен!</b>\n\n` +
          `Было: ${oldPhone}\n` +
          `Стало: ${newPhone}`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Update phone error:', error);
        bot.sendMessage(chatId, '❌ Ошибка при обновлении. Попробуйте позже.', { reply_markup: { remove_keyboard: true } });
        registrationStates.delete(stateKey);
      }
    }
  });

  // Handle text messages
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text.startsWith('/')) return;

    // Check state first with chatId (for groups), then without (for private)
    let state = registrationStates.get(getStateKey(userId, chatId));
    let stateKey = getStateKey(userId, chatId);

    if (!state) {
      // Also try without chatId for backwards compatibility
      state = registrationStates.get(getStateKey(userId, ''));
      stateKey = getStateKey(userId, '');
    }

    if (!state) return;

    if (state.step === 'waiting_name') {
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru');
      state.name = text;
      state.step = 'waiting_location';
      state.lang = userLang;
      registrationStates.set(stateKey, state);

      bot.sendMessage(chatId,
        t(userLang, 'niceToMeet', { name: text }),
        {
          reply_markup: {
            keyboard: [[
              { text: t(userLang, 'shareLocation'), request_location: true }
            ]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    }

    if (state.step === 'waiting_operator_invite_code') {
      registrationStates.delete(stateKey);
      await processOperatorRegistration(msg);
      return;
    }

    // Handle rejection reason
    if (state.step === 'waiting_rejection_reason') {
      const { orderId, messageId, operatorName, groupChatId, originalMessage, operatorTelegramId } = state;

      try {
        // Find operator user by telegram_id to save processed_by
        let processedByUserId = null;
        if (operatorTelegramId) {
          try {
            const operatorResult = await pool.query(
              'SELECT id FROM users WHERE telegram_id = $1',
              [operatorTelegramId]
            );
            if (operatorResult.rows.length > 0) {
              processedByUserId = operatorResult.rows[0].id;
            }
          } catch (e) { }
        }

        // Update order status with processed_by
        await pool.query(
          `UPDATE orders SET status = 'cancelled', admin_comment = $1, processed_at = CURRENT_TIMESTAMP, processed_by = $3 WHERE id = $2`,
          [text, orderId, processedByUserId]
        );

        // Get order details for customer notification
        const orderResult = await pool.query(
          `SELECT o.*, u.telegram_id 
           FROM orders o 
           LEFT JOIN users u ON o.user_id = u.id 
           WHERE o.id = $1`,
          [orderId]
        );

        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];

          // Notify customer
          if (order.telegram_id) {
            try {
              bot.sendMessage(order.telegram_id,
                `❌ <b>Заказ #${order.order_number} отменен</b>\n\n` +
                `Причина: ${text}\n\n` +
                `Приносим извинения за неудобства.`,
                { parse_mode: 'HTML' }
              );
            } catch (e) {
              console.error('Error notifying customer:', e);
            }
          }

          // Update the original message in the group to show cancelled status
          if (groupChatId && messageId && originalMessage) {
            try {
              const updatedMessage = originalMessage + `\n\n❌ <b>ОТМЕНЕН</b>\nОператор: ${operatorName}\nПричина: ${text}`;
              await bot.editMessageText(updatedMessage, {
                chat_id: groupChatId,
                message_id: messageId,
                parse_mode: 'HTML'
              });
            } catch (e) {
              console.error('Error updating group message:', e);
            }
          }
        }

        bot.sendMessage(chatId,
          `❌ <b>Заказ #${orderId} отменен</b>\n\nПричина: ${text}\nОператор: ${operatorName}`,
          { parse_mode: 'HTML' }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Reject order error:', error);
        bot.sendMessage(chatId, '❌ Ошибка при отмене заказа');
      }
    }

    // Handle feedback message
    if (state.step === 'waiting_feedback_message') {
      try {
        // Get user info
        const userResult = await pool.query(
          'SELECT id, full_name, phone FROM users WHERE telegram_id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          registrationStates.delete(stateKey);
          return;
        }

        const user = userResult.rows[0];

        // Save feedback to database
        await pool.query(`
          INSERT INTO feedback (restaurant_id, user_id, customer_name, customer_phone, type, message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [state.restaurantId || restaurantId, user.id, user.full_name, user.phone, state.feedbackType, text]);

        bot.sendMessage(chatId,
          `✅ <b>Спасибо за ваше обращение!</b>\n\n` +
          `Мы получили ваше сообщение и рассмотрим его в ближайшее время.`,
          { parse_mode: 'HTML' }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Save feedback error:', error);
        bot.sendMessage(chatId, '❌ Ошибка при отправке. Попробуйте позже.');
        registrationStates.delete(stateKey);
      }
    }

    // Handle new name input
    if (state.step === 'waiting_new_name') {
      try {
        // Get current user data
        const userResult = await pool.query(
          'SELECT id, full_name FROM users WHERE telegram_id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          registrationStates.delete(stateKey);
          return;
        }

        const user = userResult.rows[0];
        const oldName = user.full_name;
        const newName = text.trim();

        // Update user name first
        await pool.query(
          'UPDATE users SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newName, user.id]
        );

        // Try to log the change (table may not exist yet)
        try {
          await pool.query(`
            INSERT INTO user_profile_logs (user_id, field_name, old_value, new_value, changed_via)
            VALUES ($1, 'full_name', $2, $3, 'bot')
          `, [user.id, oldName, newName]);
        } catch (logError) {
          console.log('Profile log table may not exist:', logError.message);
        }

        bot.sendMessage(chatId,
          `✅ <b>Имя успешно изменено!</b>\n\n` +
          `Было: ${oldName}\n` +
          `Стало: ${newName}`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );

        registrationStates.delete(stateKey);
      } catch (error) {
        console.error('Update name error:', error);
        bot.sendMessage(chatId, '❌ Ошибка при обновлении. Попробуйте позже.');
        registrationStates.delete(stateKey);
      }
    }
  });

  // Handle location sharing
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const location = msg.location;

    // Check if user is blocked
    if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

    let state = registrationStates.get(getStateKey(userId, chatId));

    // If no state but user exists, treat as checking delivery
    if (!state) {
      const userCheck = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
      if (userCheck.rows.length > 0) {
        state = { step: 'checking_delivery', isExistingUser: true, user: userCheck.rows[0] };
      } else {
        bot.sendMessage(chatId, '❌ Пожалуйста, сначала нажмите /start');
        return;
      }
    }

    try {
      // Get restaurant info
      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE id = $1',
        [restaurantId]
      );

      if (restaurantResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Ресторан не найден', { reply_markup: { remove_keyboard: true } });
        return;
      }

      const restaurant = restaurantResult.rows[0];

      // Check delivery zone
      const inZone = await isLocationInRestaurantZone(restaurantId, location.latitude, location.longitude);

      if (!inZone) {
        bot.sendMessage(chatId,
          `😔 К сожалению, ваш адрес находится за пределами зоны доставки ресторана <b>${restaurantName}</b>.`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
        registrationStates.delete(getStateKey(userId, chatId));
        return;
      }

      // Check working hours
      const startTime = restaurant.start_time ? restaurant.start_time.substring(0, 5) : null;
      const endTime = restaurant.end_time ? restaurant.end_time.substring(0, 5) : null;

      if (!isRestaurantOpen(startTime, endTime)) {
        bot.sendMessage(chatId,
          `😔 Извините, ресторан <b>${restaurantName}</b> работает с ${startTime || '??:??'} до ${endTime || '??:??'}.\n\nПопробуйте позже!`,
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
        registrationStates.delete(getStateKey(userId, chatId));
        return;
      }

      // Existing user - update location and show menu
      if (state.isExistingUser || state.step === 'checking_delivery') {
        const user = state.user || (await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId])).rows[0];

        await pool.query(
          `UPDATE users SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3 WHERE id = $4`,
          [location.latitude, location.longitude, restaurantId, user.id]
        );

        const token = generateLoginToken(user.id, user.username);
        const loginUrl = buildCatalogUrl(appUrl, token);

        registrationStates.delete(getStateKey(userId, chatId));

        bot.sendMessage(chatId,
          `✅ Отлично! Доставка доступна!\n\n🏪 Ресторан: <b>${restaurantName}</b>` +
          `${loginUrl ? '' : '\n\n⚠️ Web App URL не настроен. Обратитесь к администратору.'}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: buildMainMenuButtons(
                loginUrl,
                normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru')
              )
            }
          }
        );
        return;
      }

      // New user registration - complete it
      const phoneLogin = normalizePhone(state.phone);
      const username = await resolveUniqueCustomerUsername(phoneLogin || `user_${userId}`, userId);
      const password = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(password, 10);

      const userResult = await pool.query(`
        INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, last_latitude, last_longitude, active_restaurant_id, bot_language)
        VALUES ($1, $2, $3, $4, $5, 'customer', true, $6, $7, $8, $9)
        ON CONFLICT (telegram_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          last_latitude = EXCLUDED.last_latitude,
          last_longitude = EXCLUDED.last_longitude,
          active_restaurant_id = EXCLUDED.active_restaurant_id,
          bot_language = EXCLUDED.bot_language,
          username = CASE
            WHEN EXCLUDED.username <> '' THEN EXCLUDED.username
            ELSE users.username
          END
        RETURNING id
      `, [userId, username, hashedPassword, state.name, state.phone, location.latitude, location.longitude, restaurantId, normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru')]);

      const newUserId = userResult.rows[0].id;
      registrationStates.delete(getStateKey(userId, chatId));

      // Track user-restaurant relationship for broadcast
      await pool.query(`
        INSERT INTO user_restaurants (user_id, restaurant_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, restaurant_id) DO NOTHING
      `, [newUserId, restaurantId]);

      const token = generateLoginToken(newUserId, username);
      const loginUrl = buildCatalogUrl(appUrl, token);

      bot.sendMessage(chatId,
        `✅ Регистрация успешна!\n\n` +
        `🏪 Ресторан: <b>${restaurantName}</b>\n` +
        `📍 Доставка по вашему адресу доступна!` +
        `${loginUrl ? '' : '\n\n⚠️ Web App URL не настроен. Обратитесь к администратору.'}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            remove_keyboard: true,
            inline_keyboard: buildMainMenuButtons(
              loginUrl,
              normalizeBotLanguage(state.lang || languagePreferences.get(getLangCacheKey(userId)) || 'ru')
            )
          }
        }
      );
    } catch (error) {
      console.error('Location handler error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });

  // Handle callback queries
  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    if (!chatId) {
      return;
    }
    const userId = query.from.id;
    const data = query.data;

    try {
      const safeAnswerCallback = async (options) => {
        try {
          await bot.answerCallbackQuery(query.id, options);
        } catch (_) { }
      };
      safeAnswerCallback();

      if (data.startsWith('set_lang_')) {
        const selectedLang = normalizeBotLanguage(data.replace('set_lang_', ''));
        await saveUserLanguage(userId, selectedLang);

        const langStateKey = getLangStateKey(userId, chatId);
        const pending = languageSelectionStates.get(langStateKey);
        languageSelectionStates.delete(langStateKey);

        if (pending?.next === 'start') {
          await showStartMenu(
            {
              chat: query.message.chat,
              from: query.from
            },
            selectedLang
          );
        } else {
          await bot.sendMessage(chatId, t(selectedLang, 'languageSaved'));
        }
        return;
      }

      // Check if user is blocked
      if (await checkBlockedUser(bot, chatId, userId, restaurantId)) return;

      if (data === 'new_order' || data === 'check_delivery') {
        // Ask for location
        bot.sendMessage(chatId,
          '📍 Поделитесь геолокацией для проверки доставки:',
          {
            reply_markup: {
              keyboard: [[{ text: '📍 Поделиться локацией', request_location: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }

      if (data === 'my_orders') {
        const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          return;
        }

        // Показываем только заказы этого ресторана
        const ordersResult = await pool.query(`
          SELECT order_number, status, total_amount, created_at
          FROM orders WHERE user_id = $1 AND restaurant_id = $2
          ORDER BY created_at DESC LIMIT 5
        `, [userResult.rows[0].id, restaurantId]);

        if (ordersResult.rows.length === 0) {
          bot.sendMessage(chatId, '📦 У вас пока нет заказов.', {
            reply_markup: {
              inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
            }
          });
          return;
        }

        const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
        let message = '📦 <b>Ваши заказы:</b>\n\n';

        ordersResult.rows.forEach((order) => {
          message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
        });

        bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
          }
        });
      }

      // Handle feedback
      if (data === 'feedback') {
        registrationStates.set(getStateKey(userId, chatId), {
          step: 'waiting_feedback_type',
          restaurantId
        });

        bot.sendMessage(chatId,
          `📬 <b>Жалобы и предложения</b>\n\n` +
          `Выберите тип обращения:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '😤 Жалоба', callback_data: 'feedback_type_complaint' }],
                [{ text: '💡 Предложение', callback_data: 'feedback_type_suggestion' }],
                [{ text: '❓ Вопрос', callback_data: 'feedback_type_question' }],
                [{ text: '📝 Другое', callback_data: 'feedback_type_other' }],
                [{ text: '❌ Отмена', callback_data: 'feedback_cancel' }]
              ]
            }
          }
        );
      }

      // Start reset password flow from inline menu
      if (data === 'reset_password') {
        const userResult = await pool.query(
          'SELECT id, username, phone, role FROM users WHERE telegram_id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          return;
        }

        if (userResult.rows[0].role === 'customer') {
          bot.sendMessage(chatId, 'ℹ️ Для клиентов восстановление через бот отключено.');
          return;
        }

        registrationStates.set(getStateKey(userId, chatId), {
          step: 'waiting_password_reset_confirm',
          dbUserId: userResult.rows[0].id,
          username: userResult.rows[0].username,
          phone: userResult.rows[0].phone,
          restaurantId
        });

        bot.sendMessage(
          chatId,
          '🔐 <b>Восстановление пароля</b>\n\nПодтвердите действие. Мы сгенерируем новый временный пароль.',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Подтвердить', callback_data: 'reset_password_confirm' }],
                [{ text: '❌ Отмена', callback_data: 'reset_password_cancel' }]
              ]
            }
          }
        );
      }

      // Confirm password reset
      if (data === 'reset_password_confirm') {
        const stateKey = getStateKey(userId, chatId);
        const state = registrationStates.get(stateKey);

        if (!state || state.step !== 'waiting_password_reset_confirm') {
          bot.sendMessage(chatId, 'ℹ️ Запрос восстановления устарел. Отправьте /reset_password снова.');
          return;
        }

        const cooldownKey = `${botToken}_${userId}_password_reset`;
        const now = Date.now();
        const lastResetAt = passwordResetCooldown.get(cooldownKey);
        const cooldownMs = 5 * 60 * 1000;

        if (lastResetAt && now - lastResetAt < cooldownMs) {
          const leftSec = Math.ceil((cooldownMs - (now - lastResetAt)) / 1000);
          bot.sendMessage(chatId, `⏳ Подождите ${leftSec} сек. перед повторным восстановлением.`);
          return;
        }

        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        const normalizedLogin = normalizePhone(state.phone);

        const updateResult = await pool.query(
          `UPDATE users
           SET password = $1,
               username = CASE WHEN $4 <> '' THEN $4 ELSE username END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND telegram_id = $3
           RETURNING username, phone`,
          [hashedPassword, state.dbUserId, userId, normalizedLogin]
        );

        if (updateResult.rows.length === 0) {
          registrationStates.delete(stateKey);
          bot.sendMessage(chatId, '❌ Не удалось обновить пароль. Попробуйте позже.');
          return;
        }

        passwordResetCooldown.set(cooldownKey, now);
        registrationStates.delete(stateKey);
        const effectiveLogin = normalizedLogin || resolveLoginValue(updateResult.rows[0]);
        const loginUrl = buildWebLoginUrl();

        bot.sendMessage(
          chatId,
          `✅ <b>Доступ восстановлен</b>\n\n` +
          `Логин: <code>${effectiveLogin}</code>\n` +
          `Временный пароль: <code>${temporaryPassword}</code>\n\n` +
          `${loginUrl ? `Ссылка для входа: ${loginUrl}\n\n` : ''}` +
          `Рекомендуется войти в систему и сменить пароль.`,
          {
            parse_mode: 'HTML',
            reply_markup: loginUrl
              ? { inline_keyboard: [[{ text: '🔐 Войти в систему', url: loginUrl }]] }
              : undefined
          }
        );
      }

      // Cancel password reset
      if (data === 'reset_password_cancel') {
        registrationStates.delete(getStateKey(userId, chatId));
        bot.sendMessage(chatId, '❌ Восстановление пароля отменено.');
      }

      // Handle feedback type selection
      if (data.startsWith('feedback_type_')) {
        const feedbackType = data.replace('feedback_type_', '');
        const state = registrationStates.get(getStateKey(userId, chatId)) || {};
        state.step = 'waiting_feedback_message';
        state.feedbackType = feedbackType;
        state.restaurantId = restaurantId;
        registrationStates.set(getStateKey(userId, chatId), state);

        const typeNames = {
          complaint: 'жалоба',
          suggestion: 'предложение',
          question: 'вопрос',
          other: 'обращение'
        };

        bot.sendMessage(chatId,
          `📝 Тип: <b>${typeNames[feedbackType]}</b>\n\n` +
          `Напишите ваше сообщение:`,
          { parse_mode: 'HTML' }
        );
      }

      // Cancel feedback
      if (data === 'feedback_cancel') {
        registrationStates.delete(getStateKey(userId, chatId));
        bot.sendMessage(chatId, '❌ Отменено');
      }

      // Handle edit profile
      if (data === 'edit_profile') {
        const userResult = await pool.query('SELECT full_name, phone FROM users WHERE telegram_id = $1', [userId]);
        if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
          return;
        }
        const user = userResult.rows[0];

        bot.sendMessage(chatId,
          `⚙️ <b>Ваши данные:</b>\n\n` +
          `👤 Имя: ${user.full_name}\n` +
          `📱 Телефон: ${user.phone}\n\n` +
          `Выберите, что хотите изменить:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✏️ Изменить имя', callback_data: 'edit_name' }],
                [{ text: '📱 Изменить телефон', callback_data: 'edit_phone' }],
                [{ text: '❌ Отмена', callback_data: 'edit_cancel' }]
              ]
            }
          }
        );
      }

      // Handle edit name
      if (data === 'edit_name') {
        registrationStates.set(getStateKey(userId, chatId), {
          step: 'waiting_new_name',
          restaurantId
        });

        bot.sendMessage(chatId,
          `✏️ Введите новое имя:`,
          { parse_mode: 'HTML' }
        );
      }

      // Handle edit phone
      if (data === 'edit_phone') {
        registrationStates.set(getStateKey(userId, chatId), {
          step: 'waiting_new_phone',
          restaurantId
        });

        bot.sendMessage(chatId,
          `📱 Поделитесь новым номером телефона:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [[
                { text: '📱 Поделиться контактом', request_contact: true }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }

      // Handle cancel edit
      if (data === 'edit_cancel') {
        registrationStates.delete(getStateKey(userId, chatId));
        bot.sendMessage(chatId, '❌ Отменено', { reply_markup: { remove_keyboard: true } });
      }

      const getOperatorDbUserId = async () => {
        try {
          const operatorResult = await pool.query(
            'SELECT id FROM users WHERE telegram_id = $1 LIMIT 1',
            [userId]
          );
          return operatorResult.rows[0]?.id || null;
        } catch {
          return null;
        }
      };

      const getOrderWithItems = async (orderId) => {
        const orderResult = await pool.query(`
          SELECT o.*, u.telegram_id, r.telegram_bot_token, r.click_url, r.payme_url
          FROM orders o
          LEFT JOIN users u ON o.user_id = u.id
          LEFT JOIN restaurants r ON o.restaurant_id = r.id
          WHERE o.id = $1
          LIMIT 1
        `, [orderId]);

        if (orderResult.rows.length === 0) return null;

        const itemsResult = await pool.query(`
          SELECT
            oi.*,
            COALESCE(p.image_url, '') AS image_url
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = $1
          ORDER BY oi.id
        `, [orderId]);

        return {
          order: orderResult.rows[0],
          items: itemsResult.rows
        };
      };

      const editGroupOrderMessage = async ({ order, items, statusKey, operatorName, keyboardStage, revealSensitive = true }) => {
        const previewUrl = buildOrderPreviewUrl(order.id);
        const text = buildGroupOrderNotificationPayload(order, items, {
          revealSensitive,
          statusKey,
          operatorName,
          includePreviewLink: revealSensitive,
          previewUrl
        });

        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: buildGroupOrderActionKeyboard(order.id, keyboardStage, operatorName)
        });
      };

      // Handle order confirmation
      if (data.startsWith('confirm_order_')) {
        const orderId = Number(data.split('_')[2]);
        const operatorName = query.from.first_name || 'Оператор';
        const processedByUserId = await getOperatorDbUserId();

        const current = await getOrderWithItems(orderId);
        if (!current) {
          await safeAnswerCallback({ text: '❌ Заказ не найден', show_alert: true });
          return;
        }
        if (current.order.status !== 'new' || current.order.processed_at) {
          await safeAnswerCallback({ text: '⚠️ Заказ уже подтвержден', show_alert: false });
          return;
        }

        await pool.query(
          `UPDATE orders
           SET processed_at = CURRENT_TIMESTAMP,
               processed_by = COALESCE($2, processed_by),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [orderId, processedByUserId]
        );

        const refreshed = await getOrderWithItems(orderId);

        if (refreshed?.order?.telegram_id) {
          try {
            await bot.sendMessage(
              refreshed.order.telegram_id,
              `✅ <b>Заказ #${refreshed.order.order_number} принят!</b>\n\nОператор подтвердил заказ. Следующий статус появится по мере обработки.`,
              { parse_mode: 'HTML' }
            );
          } catch (e) { }
        }

        try {
          await editGroupOrderMessage({
            order: refreshed.order,
            items: refreshed.items,
            statusKey: 'accepted',
            operatorName,
            keyboardStage: 'accepted',
            revealSensitive: true
          });
        } catch (e) {
          console.error('Confirm order message update error:', e.message);
        }
        await safeAnswerCallback({ text: '✅ Заказ принят' });
        return;
      }

      if (data.startsWith('order_step_')) {
        const parts = data.split('_');
        const orderId = Number(parts[2]);
        const nextStatus = parts[3];
        const operatorName = query.from.first_name || 'Оператор';
        const processedByUserId = await getOperatorDbUserId();
        const allowed = ['preparing', 'delivering', 'delivered'];
        if (!allowed.includes(nextStatus)) {
          await safeAnswerCallback({ text: '⚠️ Неизвестный шаг', show_alert: false });
          return;
        }

        const current = await getOrderWithItems(orderId);
        if (!current) {
          await safeAnswerCallback({ text: '❌ Заказ не найден', show_alert: true });
          return;
        }

        const currentStatus = current.order.status;
        const transitionAllowed =
          (nextStatus === 'preparing' && currentStatus === 'new') ||
          (nextStatus === 'delivering' && currentStatus === 'preparing') ||
          (nextStatus === 'delivered' && currentStatus === 'delivering');

        if (!transitionAllowed) {
          await safeAnswerCallback({ text: '⚠️ Этот шаг уже выполнен или недоступен', show_alert: false });
          return;
        }

        await pool.query(
          `UPDATE orders
           SET status = $2,
               processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
               processed_by = COALESCE(processed_by, $3),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [orderId, nextStatus, processedByUserId]
        );

        try {
          await pool.query(
            'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
            [orderId, nextStatus, processedByUserId, `Из Telegram-группы: ${operatorName}`]
          );
        } catch (e) { }

        const refreshed = await getOrderWithItems(orderId);
        if (!refreshed) {
          await safeAnswerCallback({ text: '❌ Заказ не найден', show_alert: true });
          return;
        }

        if (refreshed.order.telegram_id) {
          try {
            await sendOrderUpdateToUser(
              refreshed.order.telegram_id,
              refreshed.order,
              nextStatus,
              refreshed.order.telegram_bot_token,
              {
                click_url: refreshed.order.click_url,
                payme_url: refreshed.order.payme_url
              }
            );
          } catch (e) {
            console.error('Customer status notify error:', e.message);
          }
        }

        const keyboardStage =
          nextStatus === 'preparing' ? 'preparing' :
          nextStatus === 'delivering' ? 'delivering' :
          'done';

        try {
          await editGroupOrderMessage({
            order: refreshed.order,
            items: refreshed.items,
            statusKey: nextStatus,
            operatorName,
            keyboardStage,
            revealSensitive: true
          });
        } catch (e) {
          console.error('Order step message update error:', e.message);
        }

        const callbackTextMap = {
          preparing: '👨‍🍳 Статус: Готовится',
          delivering: '🚚 Статус: Доставляется',
          delivered: '✅ Статус: Доставлен'
        };
        await safeAnswerCallback({ text: callbackTextMap[nextStatus] || '✅ Обновлено' });
        return;
      }

      // Handle order rejection
      if (data.startsWith('reject_order_')) {
        const orderId = data.split('_')[2];
        const operatorName = query.from.first_name || 'Оператор';
        const operatorTelegramId = query.from.id;
        const originalMessage = query.message.text || '';

        // Use chatId (group chat) in state key so we can find it when operator types
        registrationStates.set(getStateKey(userId, chatId), {
          step: 'waiting_rejection_reason',
          orderId,
          operatorName,
          operatorTelegramId,
          messageId: query.message.message_id,
          groupChatId: chatId,
          originalMessage
        });

        bot.sendMessage(chatId, `📝 Укажите причину отмены заказа #${orderId}:`);
        return;
      }

    } catch (error) {
      console.error('Callback query error:', error);
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    if (error.response?.body?.error_code === 409) {
      console.warn(`⚠️  Bot conflict for ${restaurantName}: Another instance running`);
    } else {
      console.error(`Telegram polling error for ${restaurantName}:`, error.message);
    }
  });
}

// Initialize all restaurant bots
async function initMultiBots() {
  console.log('🤖 Initializing multi-bot system...');

  try {
    // Get all restaurants with bot tokens from database
    const result = await pool.query(`
      SELECT id, name, telegram_bot_token, telegram_group_id 
      FROM restaurants 
      WHERE is_active = true AND telegram_bot_token IS NOT NULL AND telegram_bot_token != ''
    `);

    console.log(`📋 Found ${result.rows.length} restaurants with bot tokens`);

    const isProduction = process.env.NODE_ENV === 'production';
    const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;

    for (const restaurant of result.rows) {
      try {
        console.log(`🔄 Initializing bot for: ${restaurant.name}`);

        let bot;

        if (isProduction && webhookBaseUrl) {
          // Use webhook in production - unique path per restaurant
          const webhookPath = `/api/telegram/webhook/${restaurant.id}`;
          const webhookUrl = `${webhookBaseUrl}${webhookPath}`;

          bot = new TelegramBot(restaurant.telegram_bot_token);

          try {
            await bot.setWebHook(webhookUrl);
            console.log(`✅ ${restaurant.name}: Webhook set to ${webhookUrl}`);
          } catch (webhookError) {
            console.error(`❌ Webhook error for ${restaurant.name}:`, webhookError.message);
            // Fallback to polling
            bot = new TelegramBot(restaurant.telegram_bot_token, { polling: true });
            console.log(`⚠️  ${restaurant.name}: Falling back to polling`);
          }
        } else {
          // Use polling in development
          bot = new TelegramBot(restaurant.telegram_bot_token, { polling: true });
          console.log(`✅ ${restaurant.name}: Using polling mode`);
        }

        // Store bot reference
        restaurantBots.set(restaurant.telegram_bot_token, {
          bot,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          groupId: restaurant.telegram_group_id
        });

        // Setup handlers
        setupBotHandlers(bot, restaurant.id, restaurant.name, restaurant.telegram_bot_token);

      } catch (error) {
        console.error(`❌ Failed to initialize bot for ${restaurant.name}:`, error.message);
      }
    }

    console.log(`✅ Multi-bot system initialized: ${restaurantBots.size} bots active`);

  } catch (error) {
    console.error('❌ Multi-bot initialization error:', error);
  }
}

async function stopMultiBots() {
  for (const [, data] of restaurantBots) {
    const currentBot = data?.bot;
    if (!currentBot) continue;

    try {
      currentBot.removeAllListeners();
    } catch (e) {
      console.warn('Multi-bot listener cleanup warning:', e.message);
    }

    try {
      await currentBot.stopPolling();
    } catch (e) {
      // ignore: bot can be in webhook mode
    }

    try {
      await currentBot.deleteWebHook();
    } catch (e) {
      // ignore
    }
  }

  restaurantBots.clear();
}

async function reloadMultiBots() {
  await stopMultiBots();
  await initMultiBots();
}

// Get bot by token
function getBotByToken(token) {
  const botData = restaurantBots.get(token);
  return botData ? botData.bot : null;
}

// Get bot by restaurant ID
function getBotByRestaurantId(restaurantId) {
  for (const [token, data] of restaurantBots) {
    if (data.restaurantId === restaurantId) {
      return data.bot;
    }
  }
  return null;
}

// Get all bots
function getAllBots() {
  return restaurantBots;
}

// Process webhook for specific restaurant
function processWebhook(restaurantId, update) {
  for (const [token, data] of restaurantBots) {
    if (data.restaurantId === parseInt(restaurantId)) {
      data.bot.processUpdate(update);
      return true;
    }
  }
  return false;
}

module.exports = {
  initMultiBots,
  reloadMultiBots,
  getBotByToken,
  getBotByRestaurantId,
  getAllBots,
  processWebhook,
  registrationStates
};
