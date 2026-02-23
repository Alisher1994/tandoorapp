const TelegramBot = require('node-telegram-bot-api');
const pool = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { ensureOrderPaidForProcessing } = require('../services/orderBilling');

let bot = null;
let activeSuperadminBotToken = process.env.TELEGRAM_BOT_TOKEN || '';

// Generate login token for auto-login
function generateLoginToken(userId, username) {
  return jwt.sign(
    { userId, username, autoLogin: true },
    process.env.JWT_SECRET,
    { expiresIn: '30d' } // Token valid for 30 days
  );
}

function buildCatalogUrl(appUrl, token) {
  const trimmed = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return `${trimmed}/catalog?token=${token}`;
}

// Store for registration states
const registrationStates = new Map();
// Store for centralized onboarding states in superadmin bot
const onboardingStates = new Map();
const languagePreferences = new Map();
const pendingLanguageActions = new Map();

const BOT_LANGUAGES = ['ru', 'uz'];
const BOT_TEXTS = {
  ru: {
    chooseLanguage: '🌐 Выберите язык системы:',
    languageSaved: '✅ Язык сохранен.',
    welcomeBack: '👋 С возвращением, {name}!',
    roleLine: '🧑‍💼 Роль: <b>{role}</b>',
    roleSuperadmin: 'Суперадмин',
    roleOperator: 'Оператор',
    blockedText: '🚫 <b>Ваш аккаунт заблокирован</b>\n\nДля связи с поддержкой обратитесь к администратору.',
    supportButton: '📞 Связаться с поддержкой',
    loginButton: '🔐 Войти в систему',
    resetButton: '🔐 Восстановить логин и пароль',
    newOrderButton: '🛒 Новый заказ',
    myOrdersButton: '📋 Мои заказы',
    welcomeStart: '👋 Добро пожаловать!\n\nДоступен только сценарий регистрации магазина.',
    registerStoreButton: '🏪 Регистрация магазина',
    genericError: '❌ Произошла ошибка. Попробуйте позже.',
    thanksName: '✅ Спасибо!\n\n👤 Теперь введите ваше имя:',
    niceToMeet: '👋 Приятно познакомиться, {name}!\n\n📍 Теперь поделитесь вашей геолокацией, чтобы мы проверили зону доставки:',
    shareContact: '📱 Поделиться контактом',
    shareLocation: '📍 Поделиться локацией'
  },
  uz: {
    chooseLanguage: '🌐 Tizim tilini tanlang:',
    languageSaved: '✅ Til saqlandi.',
    welcomeBack: '👋 Qaytganingiz bilan, {name}!',
    roleLine: '🧑‍💼 Rol: <b>{role}</b>',
    roleSuperadmin: 'Superadmin',
    roleOperator: 'Operator',
    blockedText: '🚫 <b>Hisobingiz bloklangan</b>\n\nYordam uchun administratorga murojaat qiling.',
    supportButton: '📞 Yordam bilan bog‘lanish',
    loginButton: '🔐 Tizimga kirish',
    resetButton: '🔐 Login va parolni tiklash',
    newOrderButton: '🛒 Yangi buyurtma',
    myOrdersButton: '📋 Buyurtmalarim',
    welcomeStart: '👋 Xush kelibsiz!\n\nFaqat do‘kon ro‘yxatdan o‘tish ssenariysi mavjud.',
    registerStoreButton: '🏪 Do‘konni ro‘yxatdan o‘tkazish',
    genericError: '❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.',
    thanksName: '✅ Rahmat!\n\n👤 Endi ismingizni kiriting:',
    niceToMeet: '👋 Tanishganimdan xursandman, {name}!\n\n📍 Endi yetkazib berish hududini tekshirish uchun geolokatsiyangizni yuboring:',
    shareContact: '📱 Kontaktni yuborish',
    shareLocation: '📍 Lokatsiyani yuborish'
  }
};

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

function passwordFromPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '0000';
  return digits.slice(-4).padStart(4, '0');
}

function buildWebLoginUrl(params = {}) {
  const base = process.env.FRONTEND_URL || process.env.TELEGRAM_WEB_APP_URL;
  if (!base) return null;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return `${trimmed}/login${query ? `?${query}` : ''}`;
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

async function saveUserLanguage(userId, lang) {
  const normalized = normalizeBotLanguage(lang);
  languagePreferences.set(userId, normalized);
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
}

function resolveUploadsDir() {
  return process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '../../uploads');
}

function ensureUploadsDirExists() {
  const uploadsDir = resolveUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destinationPath);

    const cleanupWithError = (error) => {
      fileStream.close(() => {
        fs.unlink(destinationPath, () => reject(error));
      });
    };

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        cleanupWithError(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destinationPath));
      });
    }).on('error', cleanupWithError);

    fileStream.on('error', cleanupWithError);
  });
}

function getOnboardingStateKey(userId) {
  return `onboard_${userId}`;
}

async function resolveSuperadminBotToken() {
  try {
    const result = await pool.query(
      'SELECT superadmin_bot_token FROM billing_settings WHERE id = 1'
    );
    const tokenFromDb = result.rows[0]?.superadmin_bot_token;
    if (tokenFromDb && String(tokenFromDb).trim()) {
      return String(tokenFromDb).trim();
    }
  } catch (error) {
    console.warn('⚠️  Failed to load superadmin bot token from DB:', error.message);
  }

  return process.env.TELEGRAM_BOT_TOKEN || '';
}

// Check if point is inside polygon (ray casting algorithm)
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

// Find restaurant by delivery zone
async function findRestaurantByLocation(lat, lng) {
  try {
    console.log(`🔍 Searching restaurant for location: ${lat}, ${lng}`);
    
    const result = await pool.query(`
      SELECT id, name, delivery_zone, logo_url, start_time, end_time
      FROM restaurants 
      WHERE is_active = true
    `);
    
    console.log(`📍 Found ${result.rows.length} active restaurants`);
    
    for (const restaurant of result.rows) {
      let zone = restaurant.delivery_zone;
      
      console.log(`🏪 Restaurant: ${restaurant.name}, zone type: ${typeof zone}, zone: ${zone ? 'exists' : 'null'}`);
      
      if (!zone) {
        console.log(`   ⚠️ No delivery zone for ${restaurant.name}`);
        continue;
      }
      
      // Parse if string
      if (typeof zone === 'string') {
        try {
          zone = JSON.parse(zone);
        } catch (e) {
          console.log(`   ❌ Failed to parse zone: ${e.message}`);
          continue;
        }
      }
      
      console.log(`   📐 Zone has ${zone?.length || 0} points`);
      if (zone && zone.length > 0) {
        console.log(`   📐 First point: ${JSON.stringify(zone[0])}`);
      }
      
      if (zone && zone.length >= 3) {
        const isInside = isPointInPolygon([lat, lng], zone);
        console.log(`   🎯 Point [${lat}, ${lng}] inside zone: ${isInside}`);
        
        if (isInside) {
          return restaurant;
        }
      }
    }
    
    console.log('❌ No matching restaurant found');
    return null;
  } catch (error) {
    console.error('Find restaurant error:', error);
    return null;
  }
}

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

async function initBot() {
  const token = await resolveSuperadminBotToken();
  activeSuperadminBotToken = token || '';
  
  if (!token) {
    console.warn('⚠️  Superadmin bot token not set, bot will not be initialized');
    return;
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL || process.env.FRONTEND_URL;
  const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || webAppUrl;
  
  if (isProduction && webhookBaseUrl) {
    const webhookPath = '/api/telegram/webhook';
    const webhookUrl = `${webhookBaseUrl}${webhookPath}`;
    
    bot = new TelegramBot(token);
    
    bot.setWebHook(webhookUrl).then(() => {
      console.log(`🤖 Telegram bot initialized with webhook: ${webhookUrl}`);
    }).catch((error) => {
      console.error('❌ Error setting webhook:', error);
      console.log('⚠️  Falling back to polling mode');
      bot = new TelegramBot(token, { polling: true });
    });
  } else {
    bot = new TelegramBot(token, { polling: true });
    console.log('🤖 Telegram bot initialized with polling');
  }

  async function saveTelegramPhotoAsUpload(fileId) {
    const fileData = await bot.getFile(fileId);
    const filePath = fileData?.file_path;
    if (!filePath) {
      throw new Error('Telegram file path not found');
    }

    const ext = path.extname(filePath) || '.jpg';
    const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const uploadsDir = ensureUploadsDirExists();
    const destinationPath = path.join(uploadsDir, filename);
    const telegramFileUrl = `https://api.telegram.org/file/bot${activeSuperadminBotToken}/${filePath}`;

    await downloadFile(telegramFileUrl, destinationPath);
    return `/uploads/${filename}`;
  }

  async function sendLanguagePicker(chatId, userId, nextAction = 'start', defaultLang = 'ru') {
    pendingLanguageActions.set(userId, nextAction);
    const activeLang = normalizeBotLanguage(defaultLang);
    await bot.sendMessage(chatId, t(activeLang, 'chooseLanguage'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇷🇺 Русский', callback_data: 'set_lang_ru' },
            { text: '🇺🇿 O`zbekcha', callback_data: 'set_lang_uz' }
          ]
        ]
      }
    });
  }

  async function sendStartMenu(chatId, userId, lang) {
    const language = normalizeBotLanguage(lang);
    const userResult = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [userId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];

      if (!user.is_active) {
        await bot.sendMessage(
          chatId,
          t(language, 'blockedText'),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: t(language, 'supportButton'), url: 'https://t.me/budavron' }]
              ]
            }
          }
        );
        return;
      }

      if (user.role === 'operator' || user.role === 'superadmin') {
        const loginUrl = buildWebLoginUrl({ portal: 'admin', source: 'superadmin_bot' });
        await bot.sendMessage(
          chatId,
          `${t(language, 'welcomeBack', { name: user.full_name || user.username })}\n\n` +
          `${t(language, 'roleLine', { role: user.role === 'superadmin' ? t(language, 'roleSuperadmin') : t(language, 'roleOperator') })}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [
                ...(loginUrl ? [[{ text: t(language, 'loginButton'), url: loginUrl }]] : []),
                [{ text: t(language, 'resetButton'), callback_data: 'reset_password' }]
              ]
            }
          }
        );
      } else {
        await bot.sendMessage(
          chatId,
          t(language, 'welcomeBack', { name: user.full_name || user.username }),
          {
            parse_mode: 'HTML',
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [
                [{ text: t(language, 'newOrderButton'), callback_data: 'new_order' }],
                [{ text: t(language, 'myOrdersButton'), callback_data: 'my_orders' }]
              ]
            }
          }
        );
      }
      return;
    }

    await bot.sendMessage(
      chatId,
      t(language, 'welcomeStart'),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(language, 'registerStoreButton'), callback_data: 'onboard_start' }]
          ]
        }
      }
    );
  }

  async function askOnboardingField(chatId, field) {
    const userLang = normalizeBotLanguage(languagePreferences.get(chatId) || 'ru');
    const prompts = {
      store_name: '🏪 Введите <b>название магазина</b>:',
      full_name: '👤 Введите <b>ФИО оператора</b>:',
      phone: '📱 Отправьте <b>номер телефона</b>:',
      location: '📍 Отправьте <b>локацию магазина</b>:',
      logo_url: '🖼️ Отправьте <b>фото логотипа</b> или ссылку (URL):',
      bot_token: '🤖 Отправьте <b>Bot Token</b> вашего магазина:',
      group_id: '👥 Нажмите кнопку ниже и <b>поделитесь группой</b> для заказов:'
    };

    if (field === 'phone') {
      await bot.sendMessage(chatId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: t(userLang, 'shareContact'), request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    if (field === 'location') {
      await bot.sendMessage(chatId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: t(userLang, 'shareLocation'), request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    if (field === 'group_id') {
      await bot.sendMessage(chatId, prompts[field], {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{
              text: '👥 Поделиться группой',
              request_chat: {
                request_id: Number(Date.now() % 1000000000),
                chat_is_channel: false,
                bot_is_member: true
              }
            }],
            [{ text: '⏭️ Пропустить' }],
            [{ text: '❌ Отмена' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
      return;
    }

    await bot.sendMessage(chatId, prompts[field], {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'onboard_cancel' }]]
      }
    });
  }

  async function showOptionalStep(chatId, userId, stepName) {
    const stateKey = getOnboardingStateKey(userId);
    const state = onboardingStates.get(stateKey);
    if (!state) return;

    if (stepName === 'logo_url') {
      state.step = 'await_logo_choice';
      onboardingStates.set(stateKey, state);
      await bot.sendMessage(chatId,
        '🖼️ Логотип магазина (необязательно):',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Добавить логотип', callback_data: 'onboard_add_logo' }],
              [{ text: '⏭️ Пропустить', callback_data: 'onboard_skip_logo' }]
            ]
          }
        }
      );
      return;
    }

    if (stepName === 'bot_token') {
      state.step = 'await_token_choice';
      onboardingStates.set(stateKey, state);
      await bot.sendMessage(chatId,
        '🤖 Bot Token магазина (необязательно на этом шаге):',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Добавить токен', callback_data: 'onboard_add_token' }],
              [{ text: '⏭️ Пропустить', callback_data: 'onboard_skip_token' }]
            ]
          }
        }
      );
      return;
    }

    if (stepName === 'group_id') {
      state.step = 'await_group_choice';
      onboardingStates.set(stateKey, state);
      await bot.sendMessage(chatId,
        '👥 Группа для заказов (необязательно на этом шаге):',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Поделиться группой', callback_data: 'onboard_add_group' }],
              [{ text: '⏭️ Пропустить', callback_data: 'onboard_skip_group' }]
            ]
          }
        }
      );
      return;
    }
  }

  async function finalizeOnboarding(chatId, userId) {
    const stateKey = getOnboardingStateKey(userId);
    const state = onboardingStates.get(stateKey);
    if (!state) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const normalizedPhone = normalizePhone(state.phone);
      const username = normalizedPhone;
      const plainPassword = passwordFromPhone(normalizedPhone);
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Prevent conflict with existing username owned by another user
      const usernameOwner = await client.query(
        'SELECT id, role, telegram_id FROM users WHERE username = $1',
        [username]
      );
      if (usernameOwner.rows.length > 0 && usernameOwner.rows[0].telegram_id !== userId) {
        await client.query('ROLLBACK');
        await bot.sendMessage(chatId,
          '❌ Такой логин (номер телефона) уже используется. Укажите другой номер телефона.'
        );
        return;
      }

      const settingsResult = await client.query('SELECT default_starting_balance, default_order_cost FROM billing_settings WHERE id = 1');
      const settings = settingsResult.rows[0] || { default_starting_balance: 100000, default_order_cost: 1000 };

      const restaurantResult = await client.query(`
        INSERT INTO restaurants (
          name, phone, logo_url, telegram_bot_token, telegram_group_id,
          latitude, longitude, delivery_base_radius, is_delivery_enabled,
          balance, order_cost, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 3, true, $8, $9, true)
        RETURNING id, name
      `, [
        state.store_name,
        normalizedPhone || null,
        state.logo_url || null,
        state.bot_token || null,
        state.group_id || null,
        state.location?.latitude || null,
        state.location?.longitude || null,
        settings.default_starting_balance,
        settings.default_order_cost
      ]);

      const restaurant = restaurantResult.rows[0];
      const preferredLang = normalizeBotLanguage(languagePreferences.get(userId) || 'ru');

      let userIdDb;
      const userByTg = await client.query('SELECT id, role FROM users WHERE telegram_id = $1', [userId]);
      if (userByTg.rows.length > 0) {
        userIdDb = userByTg.rows[0].id;
        if (userByTg.rows[0].role === 'customer') {
          await client.query('ROLLBACK');
          await bot.sendMessage(chatId,
            '❌ Этот Telegram-аккаунт уже зарегистрирован как клиент. Используйте отдельный Telegram для оператора.'
          );
          return;
        }

        await client.query(`
          UPDATE users
          SET username = $1,
              password = $2,
              full_name = $3,
              phone = $4,
              role = 'operator',
              is_active = true,
              active_restaurant_id = $5,
              bot_language = $6,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $7
        `, [username, hashedPassword, state.full_name, normalizedPhone, restaurant.id, preferredLang, userIdDb]);
      } else {
        const insertedUser = await client.query(`
          INSERT INTO users (telegram_id, username, password, full_name, phone, role, is_active, active_restaurant_id, bot_language)
          VALUES ($1, $2, $3, $4, $5, 'operator', true, $6, $7)
          RETURNING id
        `, [userId, username, hashedPassword, state.full_name, normalizedPhone, restaurant.id, preferredLang]);
        userIdDb = insertedUser.rows[0].id;
      }

      await client.query(`
        INSERT INTO operator_restaurants (user_id, restaurant_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, restaurant_id) DO NOTHING
      `, [userIdDb, restaurant.id]);

      await client.query('COMMIT');
      onboardingStates.delete(stateKey);

      const loginUrl = buildWebLoginUrl({ portal: 'admin', source: 'superadmin_bot' });
      const locationText = state.location
        ? `${state.location.latitude.toFixed(6)}, ${state.location.longitude.toFixed(6)}`
        : 'не указана';

      await bot.sendMessage(
        chatId,
        `✅ <b>Регистрация завершена</b>\n\n` +
        `🏪 Магазин: <b>${restaurant.name}</b>\n` +
        `👤 ФИО: ${state.full_name}\n` +
        `📱 Логин: <code>${username}</code>\n` +
        `🔐 Пароль: <code>${plainPassword}</code>\n` +
        `📍 Локация: ${locationText}\n` +
        `🚚 Радиус доставки: 3 км (по умолчанию)\n\n` +
        `${loginUrl ? `Вход: ${loginUrl}` : '⚠️ URL входа не настроен в переменных окружения.'}`,
        {
          parse_mode: 'HTML',
          reply_markup: loginUrl
            ? {
              remove_keyboard: true,
              inline_keyboard: [[{ text: '🔐 Войти в систему', url: loginUrl }]]
            }
            : { remove_keyboard: true }
        }
      );
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Finalize onboarding error:', error);
      await bot.sendMessage(chatId, '❌ Ошибка создания доступа. Попробуйте позже.');
    } finally {
      client.release();
    }
  }

  async function startOnboarding(chatId, userId) {
    onboardingStates.set(getOnboardingStateKey(userId), {
      step: 'await_store_name'
    });
    await bot.sendMessage(
      chatId,
      '🧭 <b>Онбординг магазина</b>\n\nОбязательные поля:\n• Название магазина\n• ФИО\n• Номер телефона\n• Локация\n\nНеобязательные поля можно пропустить.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '▶️ Начать', callback_data: 'onboard_begin_required' }],
            [{ text: '❌ Отмена', callback_data: 'onboard_cancel' }]
          ]
        }
      }
    );
  }

  async function resetAccessByTelegram(chatId, telegramUserId) {
    const userResult = await pool.query(
      'SELECT id, username, phone, role FROM users WHERE telegram_id = $1',
      [telegramUserId]
    );

    if (userResult.rows.length === 0) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
      return;
    }

    const user = userResult.rows[0];
    if (user.role === 'customer') {
      await bot.sendMessage(
        chatId,
        'ℹ️ Для клиентов восстановление через бот отключено. Обратитесь в поддержку магазина.'
      );
      return;
    }

    const phoneLogin = normalizePhone(user.phone);
    if (!phoneLogin) {
      await bot.sendMessage(chatId, '❌ Для восстановления нужен номер телефона в профиле.');
      return;
    }

    const temporaryPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await pool.query(
      `UPDATE users
       SET password = $1,
           username = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [hashedPassword, phoneLogin, user.id]
    );

    const loginUrl = buildWebLoginUrl({ portal: 'admin', source: 'superadmin_bot' });
    await bot.sendMessage(
      chatId,
      `✅ <b>Доступ восстановлен</b>\n\n` +
      `Логин: <code>${phoneLogin}</code>\n` +
      `Временный пароль: <code>${temporaryPassword}</code>\n\n` +
      `${loginUrl ? `Ссылка для входа: ${loginUrl}\n\n` : ''}` +
      `Рекомендуется войти и сменить пароль.`,
      {
        parse_mode: 'HTML',
        reply_markup: loginUrl
          ? { inline_keyboard: [[{ text: '🔐 Войти в систему', url: loginUrl }]] }
          : undefined
      }
    );
  }

  bot.onText(/\/onboard/, async (msg) => {
    await startOnboarding(msg.chat.id, msg.from.id);
  });

  bot.onText(/\/reset_password/, async (msg) => {
    try {
      await resetAccessByTelegram(msg.chat.id, msg.from.id);
    } catch (error) {
      console.error('Reset access error:', error);
      bot.sendMessage(msg.chat.id, '❌ Ошибка восстановления доступа.');
    }
  });
  
  // =====================================================
  // /start command
  // =====================================================
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const preferred = getTelegramPreferredLanguage(msg.from?.language_code);
      await sendLanguagePicker(chatId, userId, 'start', preferred);
    } catch (error) {
      console.error('Start command error:', error);
      bot.sendMessage(chatId, t('ru', 'genericError'));
    }
  });

  bot.onText(/\/lang/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const preferred = getTelegramPreferredLanguage(msg.from?.language_code);
    await sendLanguagePicker(chatId, userId, 'language_only', preferred);
  });
  
  // =====================================================
  // Handle contact sharing
  // =====================================================
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (onboardingState && onboardingState.step === 'await_phone') {
      onboardingState.phone = normalizePhone(contact.phone_number);
      onboardingState.step = 'await_location';
      onboardingStates.set(onboardingKey, onboardingState);
      await askOnboardingField(chatId, 'location');
      return;
    }
    
    const state = registrationStates.get(userId);
    if (!state || state.step !== 'waiting_contact') return;
    
    // Save contact and ask for name
    const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
    state.phone = normalizePhone(contact.phone_number);
    state.step = 'waiting_name';
    state.lang = userLang;
    registrationStates.set(userId, state);
    
    bot.sendMessage(chatId, 
      t(userLang, 'thanksName'),
      {
        reply_markup: { remove_keyboard: true }
      }
    );
  });

  // =====================================================
  // Handle photo messages (onboarding logo upload)
  // =====================================================
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (!onboardingState || onboardingState.step !== 'await_logo_url') {
      return;
    }

    try {
      const photos = Array.isArray(msg.photo) ? msg.photo : [];
      const bestPhoto = photos[photos.length - 1];
      if (!bestPhoto?.file_id) {
        await bot.sendMessage(chatId, '❌ Не удалось прочитать фото. Отправьте изображение еще раз.');
        return;
      }

      const logoPath = await saveTelegramPhotoAsUpload(bestPhoto.file_id);
      onboardingState.logo_url = logoPath;
      onboardingStates.set(onboardingKey, onboardingState);

      await bot.sendMessage(chatId, '✅ Логотип получен и сохранен.');
      await showOptionalStep(chatId, userId, 'bot_token');
    } catch (error) {
      console.error('Onboarding logo photo save error:', error);
      await bot.sendMessage(chatId, '❌ Не удалось сохранить фото. Попробуйте снова или отправьте URL.');
    }
  });

  // =====================================================
  // Handle shared chat (onboarding group link)
  // =====================================================
  bot.on('message', async (msg) => {
    const chatId = msg.chat?.id;
    const userId = msg.from?.id;
    const sharedChatId = msg.chat_shared?.chat_id;
    if (!chatId || !userId || !sharedChatId) {
      return;
    }

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (!onboardingState || onboardingState.step !== 'await_group_share') {
      return;
    }

    onboardingState.group_id = String(sharedChatId);
    onboardingStates.set(onboardingKey, onboardingState);

    await bot.sendMessage(
      chatId,
      `✅ Группа подключена.\n\nID группы: <code>${onboardingState.group_id}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true }
      }
    );
    await finalizeOnboarding(chatId, userId);
  });
  
  // =====================================================
  // Handle text messages (for name input and menu buttons)
  // =====================================================
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Skip commands
    if (text.startsWith('/')) return;

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (onboardingState) {
      if (onboardingState.step === 'await_store_name') {
        const storeName = text.trim();
        if (!storeName) {
          await bot.sendMessage(chatId, '❌ Название магазина обязательно. Введите название.');
          return;
        }
        onboardingState.store_name = storeName;
        onboardingState.step = 'await_full_name';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, 'full_name');
        return;
      }

      if (onboardingState.step === 'await_full_name') {
        const fullName = text.trim();
        if (!fullName) {
          await bot.sendMessage(chatId, '❌ ФИО обязательно. Введите ФИО.');
          return;
        }
        onboardingState.full_name = fullName;
        onboardingState.step = 'await_phone';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, 'phone');
        return;
      }

      if (onboardingState.step === 'await_phone') {
        const normalized = normalizePhone(text);
        if (!normalized || normalized.length < 7) {
          await bot.sendMessage(chatId, '❌ Некорректный номер телефона. Введите номер еще раз.');
          return;
        }
        onboardingState.phone = normalized;
        onboardingState.step = 'await_location';
        onboardingStates.set(onboardingKey, onboardingState);
        await askOnboardingField(chatId, 'location');
        return;
      }

      if (onboardingState.step === 'await_logo_url') {
        onboardingState.logo_url = text.trim();
        onboardingStates.set(onboardingKey, onboardingState);
        await showOptionalStep(chatId, userId, 'bot_token');
        return;
      }

      if (onboardingState.step === 'await_bot_token') {
        onboardingState.bot_token = text.trim();
        onboardingStates.set(onboardingKey, onboardingState);
        await showOptionalStep(chatId, userId, 'group_id');
        return;
      }

      if (onboardingState.step === 'await_group_share') {
        const normalizedText = text.trim();
        if (normalizedText === '⏭️ Пропустить') {
          onboardingState.group_id = null;
          onboardingStates.set(onboardingKey, onboardingState);
          await bot.sendMessage(chatId, '⏭️ Шаг с группой пропущен.', {
            reply_markup: { remove_keyboard: true }
          });
          await finalizeOnboarding(chatId, userId);
          return;
        }

        if (normalizedText === '❌ Отмена') {
          onboardingStates.delete(onboardingKey);
          await bot.sendMessage(chatId, '❌ Онбординг отменен.', {
            reply_markup: { remove_keyboard: true }
          });
          return;
        }

        await bot.sendMessage(
          chatId,
          'ℹ️ Используйте кнопку "👥 Поделиться группой" или нажмите "⏭️ Пропустить".'
        );
        return;
      }
    }
    
    // Handle menu buttons
    if (text === '📋 Мои заказы') {
      // Trigger /orders command
      const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }
      
      const ordersResult = await pool.query(`
        SELECT o.order_number, o.status, o.total_amount, o.created_at
        FROM orders o WHERE o.user_id = $1
        ORDER BY o.created_at DESC LIMIT 5
      `, [userResult.rows[0].id]);
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, '📦 У вас пока нет заказов.', {
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
          }
        });
        return;
      }
      
      let message = '📦 <b>Ваши заказы:</b>\n\n';
      const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
      
      ordersResult.rows.forEach((order) => {
        message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
      });
      
      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
        }
      });
      return;
    }
    
    if (text === '❓ Помощь') {
      bot.sendMessage(chatId,
        '📖 <b>Помощь</b>\n\n' +
        '📍 <b>Отправить локацию</b> — начать заказ\n' +
        '📋 <b>Мои заказы</b> — история заказов\n\n' +
        'Команды:\n' +
        '/start — начать\n' +
        '/menu — открыть меню\n' +
        '/orders — мои заказы',
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    const state = registrationStates.get(userId);
    if (!state) return;
    
    if (state.step === 'waiting_name') {
      // Save name and ask for location
      const userLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
      state.name = text;
      state.step = 'waiting_location';
      state.lang = userLang;
      registrationStates.set(userId, state);
      
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
  });
  
  // =====================================================
  // Handle location sharing
  // =====================================================
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const location = msg.location;

    const onboardingKey = getOnboardingStateKey(userId);
    const onboardingState = onboardingStates.get(onboardingKey);
    if (onboardingState && onboardingState.step === 'await_location') {
      onboardingState.location = {
        latitude: location.latitude,
        longitude: location.longitude
      };
      onboardingStates.set(onboardingKey, onboardingState);
      await bot.sendMessage(chatId,
        '✅ Обязательные поля заполнены.\n\nДалее можно добавить необязательные данные или пропустить:',
        { reply_markup: { remove_keyboard: true } }
      );
      await showOptionalStep(chatId, userId, 'logo_url');
      return;
    }
    
    let state = registrationStates.get(userId);
    
    // If no state but user exists, treat as order location
    if (!state) {
      const userCheck = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      if (userCheck.rows.length > 0) {
        // Existing user sending location - treat as new order
        state = { step: 'waiting_location_for_order', isExistingUser: true };
        registrationStates.set(userId, state);
        console.log(`📍 Auto-set state for existing user ${userId}`);
      } else {
        // Unknown user - tell them to /start
        bot.sendMessage(chatId, '❌ Пожалуйста, сначала нажмите /start для регистрации');
        return;
      }
    }
    
    if (state.step !== 'waiting_location' && state.step !== 'waiting_location_for_order') {
      // Wrong state - reset and treat as order
      state = { step: 'waiting_location_for_order', isExistingUser: true };
      registrationStates.set(userId, state);
    }
    
    try {
      // Check if location is in any delivery zone
      const restaurant = await findRestaurantByLocation(location.latitude, location.longitude);
      
      if (restaurant) {
        // Check working hours
        const startTime = restaurant.start_time ? restaurant.start_time.substring(0, 5) : null;
        const endTime = restaurant.end_time ? restaurant.end_time.substring(0, 5) : null;
        const isOpenNow = isRestaurantOpen(startTime, endTime);
        
        if (!isOpenNow && state.isExistingUser) {
          bot.sendMessage(chatId,
            `😔 Извините, данный магазин работает с ${startTime || '??:??'} по ${endTime || '??:??'}.\n\nПопробуйте позже!`,
            { reply_markup: { remove_keyboard: true } }
          );
          registrationStates.delete(userId);
          return;
        }
        const appUrl = process.env.TELEGRAM_WEB_APP_URL || 'https://tandoorapp-production.up.railway.app';
        
        // Check if this is existing user checking location for new order
        if (state.isExistingUser) {
          // Get existing user
          const userResult = await pool.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [userId]
          );
          
          if (userResult.rows.length === 0) {
            registrationStates.delete(userId);
            bot.sendMessage(chatId, '❌ Профиль не найден. Нажмите /start для регистрации.');
            return;
          }

          const user = userResult.rows[0];
          
          // Save location to database
          await pool.query(`
            UPDATE users 
            SET last_latitude = $1, last_longitude = $2, active_restaurant_id = $3
            WHERE id = $4
          `, [location.latitude, location.longitude, restaurant.id, user.id]);
          
          let loginUrl = null;
          try {
            const token = generateLoginToken(user.id, user.username);
            loginUrl = buildCatalogUrl(appUrl, token);
          } catch (tokenError) {
            console.error('Login token error:', tokenError);
          }
          
          // Clear state
          registrationStates.delete(userId);
          
          if (!loginUrl) {
            bot.sendMessage(chatId,
              `✅ Отлично! Доставка доступна!\n\n` +
              `🏪 Магазин: <b>${restaurant.name}</b>\n\n` +
              `⚠️ Ошибка выдачи ссылки. Попробуйте команду /menu.`,
              { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
            );
            return;
          }
          
          bot.sendMessage(chatId,
            `✅ Отлично! Доставка доступна!\n\n` +
            `🏪 Магазин: <b>${restaurant.name}</b>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [
                  [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }],
                  [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
                ]
              }
            }
          );
          return;
        }
        
        // New user registration - complete registration
        // Login should be phone number
        const username = await resolveUniqueCustomerUsername(normalizePhone(state.phone) || `user_${userId}`, userId);
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save user with location and get ID
        const preferredLang = normalizeBotLanguage(state.lang || languagePreferences.get(userId) || 'ru');
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
            username = CASE WHEN $2 <> '' THEN $2 ELSE users.username END
          RETURNING id
        `, [userId, username, hashedPassword, state.name, state.phone, location.latitude, location.longitude, restaurant.id, preferredLang]);
        
        const newUserId = userResult.rows[0].id;
        
        // Clear registration state
        registrationStates.delete(userId);
        
        // Generate auto-login token
        const token = generateLoginToken(newUserId, username);
        const loginUrl = buildCatalogUrl(appUrl, token);
        
        bot.sendMessage(chatId,
          `✅ Регистрация успешна!\n\n` +
          `🏪 Магазин: <b>${restaurant.name}</b>\n` +
          `📍 Доставка по вашему адресу доступна!` +
          (!isOpenNow ? `\n\nℹ️ Сейчас магазин закрыт и работает с ${startTime || '??:??'} по ${endTime || '??:??'}. Заказ можно оформить в рабочее время.` : ''),
          {
            parse_mode: 'HTML',
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [
                [{ text: '🍽️ Открыть меню', web_app: { url: loginUrl } }],
                [{ text: '📋 Мои заказы', callback_data: 'my_orders' }]
              ]
            }
          }
        );
      } else {
        // Location is NOT in any delivery zone
        bot.sendMessage(chatId,
          '😔 Извините!\n\n' +
          'К сожалению, доставка по вашему адресу пока не осуществляется.\n\n' +
          '📍 Попробуйте отправить другую локацию или свяжитесь с нами для уточнения.',
          {
            reply_markup: {
              keyboard: [[
                { text: '📍 Отправить другую локацию', request_location: true }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
      }
    } catch (error) {
      console.error('Location handling error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // =====================================================
  // /help command
  // =====================================================
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '📖 Справка:\n\n' +
      '/onboard - Регистрация магазина и оператора\n' +
      '/start - Начать регистрацию\n' +
      '/menu - Открыть меню\n' +
      '/orders - Мои заказы\n' +
      '/reset_password - Восстановить логин и пароль (оператор/владелец)\n' +
      '/help - Показать справку'
    );
  });
  
  // =====================================================
  // /menu command - same as /start for registered users
  // =====================================================
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id;
    
    try {
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramUserId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Используйте /start');
        return;
      }
      
      // Always ask for location first
      registrationStates.set(telegramUserId, { 
        step: 'waiting_location_for_order',
        isExistingUser: true 
      });
      
      bot.sendMessage(chatId,
        '📍 Укажите адрес доставки:',
        {
          reply_markup: {
            keyboard: [[
              { text: '📍 Отправить локацию', request_location: true }
            ]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    } catch (error) {
      console.error('Menu command error:', error);
      bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
    }
  });
  
  // =====================================================
  // /orders command
  // =====================================================
  bot.onText(/\/orders/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Используйте /start');
        return;
      }
      
      const ordersResult = await pool.query(
        `SELECT o.*, r.name as restaurant_name,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'product_name', oi.product_name,
                      'quantity', oi.quantity,
                      'price', oi.price
                    )
                  ) FILTER (WHERE oi.id IS NOT NULL),
                  '[]'
                ) as items
         FROM orders o
         LEFT JOIN restaurants r ON o.restaurant_id = r.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1
         GROUP BY o.id, r.name
         ORDER BY o.created_at DESC
         LIMIT 5`,
        [userResult.rows[0].id]
      );
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, 
          '📦 У вас пока нет заказов.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
              ]
            }
          }
        );
        return;
      }
      
      let message = '📦 <b>Ваши последние заказы:</b>\n\n';
      
      ordersResult.rows.forEach((order) => {
        const statusEmoji = {
          'new': '🆕',
          'preparing': '👨‍🍳',
          'delivering': '🚚',
          'delivered': '✅',
          'cancelled': '❌'
        };
        
        message += `${statusEmoji[order.status] || '📦'} <b>Заказ #${order.order_number}</b>\n`;
        if (order.restaurant_name) message += `🏪 ${order.restaurant_name}\n`;
        message += `💰 ${order.total_amount} сум\n`;
        message += `📅 ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n`;
        message += `Статус: ${getStatusText(order.status)}\n\n`;
      });
      
      bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
          ]
        }
      });
    } catch (error) {
      console.error('Orders command error:', error);
      bot.sendMessage(chatId, '❌ Ошибка получения заказов');
    }
  });
  
  // =====================================================
  // Callback query handler (inline buttons)
  // =====================================================
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const operatorName = callbackQuery.from.first_name || 'Оператор';
    
    // Answer callback to remove loading state
    bot.answerCallbackQuery(callbackQuery.id);

    if (data.startsWith('set_lang_')) {
      const selectedLang = normalizeBotLanguage(data.replace('set_lang_', ''));
      await saveUserLanguage(userId, selectedLang);
      const pendingAction = pendingLanguageActions.get(userId);
      pendingLanguageActions.delete(userId);

      if (pendingAction === 'start') {
        await sendStartMenu(chatId, userId, selectedLang);
      } else {
        await bot.sendMessage(chatId, t(selectedLang, 'languageSaved'));
      }
      return;
    }

    // =====================================================
    // Central onboarding flow
    // =====================================================
    if (data === 'legacy_customer_start') {
      await bot.sendMessage(
        chatId,
        'ℹ️ Клиентская регистрация в этом боте отключена. Используйте Telegram-бот магазина.'
      );
      return;
    }

    if (data === 'onboard_start') {
      await startOnboarding(chatId, userId);
      return;
    }

    if (data === 'onboard_cancel') {
      onboardingStates.delete(getOnboardingStateKey(userId));
      await bot.sendMessage(chatId, '❌ Онбординг отменен.', { reply_markup: { remove_keyboard: true } });
      return;
    }

    if (data === 'onboard_begin_required') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey) || {};
      state.step = 'await_store_name';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, 'store_name');
      return;
    }

    if (data === 'onboard_add_logo') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_logo_url';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, 'logo_url');
      return;
    }

    if (data === 'onboard_skip_logo') {
      await showOptionalStep(chatId, userId, 'bot_token');
      return;
    }

    if (data === 'onboard_add_token') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_bot_token';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, 'bot_token');
      return;
    }

    if (data === 'onboard_skip_token') {
      await showOptionalStep(chatId, userId, 'group_id');
      return;
    }

    if (data === 'onboard_add_group') {
      const stateKey = getOnboardingStateKey(userId);
      const state = onboardingStates.get(stateKey);
      if (!state) return;
      state.step = 'await_group_share';
      onboardingStates.set(stateKey, state);
      await askOnboardingField(chatId, 'group_id');
      return;
    }

    if (data === 'onboard_skip_group') {
      await finalizeOnboarding(chatId, userId);
      return;
    }

    if (data === 'reset_password') {
      await resetAccessByTelegram(chatId, userId);
      return;
    }
    
    if (data === 'new_order') {
      const userLang = normalizeBotLanguage(languagePreferences.get(userId) || 'ru');
      // Start new order flow - ask for location
      registrationStates.set(userId, { 
        step: 'waiting_location_for_order',
        isExistingUser: true 
      });
      
      // Send message with location request keyboard
      await bot.sendMessage(chatId,
        userLang === 'uz'
          ? '📍 Yetkazib berish uchun geolokatsiyani yuboring:'
          : '📍 Отправьте геолокацию для доставки:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: [
              [{
                text: userLang === 'uz' ? '📍 Geolokatsiyani yuborish' : '📍 Отправить геолокацию',
                request_location: true
              }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return;
    }
    
    // My orders inline button
    if (data === 'my_orders') {
      const userResult = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [userId]);
      
      if (userResult.rows.length === 0) {
        bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Нажмите /start');
        return;
      }
      
      const ordersResult = await pool.query(`
        SELECT o.order_number, o.status, o.total_amount, o.created_at
        FROM orders o WHERE o.user_id = $1
        ORDER BY o.created_at DESC LIMIT 5
      `, [userResult.rows[0].id]);
      
      if (ordersResult.rows.length === 0) {
        bot.sendMessage(chatId, '📦 У вас пока нет заказов.', {
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
          }
        });
        return;
      }
      
      let message = '📦 <b>Ваши заказы:</b>\n\n';
      const statusEmoji = { 'new': '🆕', 'preparing': '👨‍🍳', 'delivering': '🚚', 'delivered': '✅', 'cancelled': '❌' };
      
      ordersResult.rows.forEach((order) => {
        message += `${statusEmoji[order.status] || '📦'} #${order.order_number} — ${parseFloat(order.total_amount).toLocaleString()} сум\n`;
      });
      
      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Новый заказ', callback_data: 'new_order' }]]
        }
      });
      return;
    }
    
    // Confirm order
    else if (data.startsWith('confirm_order_')) {
      const orderId = data.replace('confirm_order_', '');
      console.log(`📋 Confirm order ${orderId} by ${operatorName}`);
      
      try {
        // Check if this order belongs to a restaurant with its own bot token
        // If so, skip processing here (multi-bot system will handle it)
        const orderCheck = await pool.query(`
          SELECT o.status, r.telegram_bot_token 
          FROM orders o 
          LEFT JOIN restaurants r ON o.restaurant_id = r.id 
          WHERE o.id = $1
        `, [orderId]);
        
        if (orderCheck.rows.length === 0) {
          bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Заказ не найден', show_alert: true });
          return;
        }
        
        const orderData = orderCheck.rows[0];
        
        // If restaurant has its own bot token (different from env), skip - multi-bot handles it
        if (orderData.telegram_bot_token && orderData.telegram_bot_token !== activeSuperadminBotToken) {
          console.log(`⏭️ Skipping confirm for order ${orderId} - handled by multi-bot system`);
          return;
        }
        
        if (orderData.status !== 'new') {
          bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Заказ уже обработан', show_alert: true });
          return;
        }

        const billingResult = await ensureOrderPaidForProcessing({ orderId });
        if (!billingResult.ok) {
          const text = billingResult.code === 'INSUFFICIENT_BALANCE'
            ? '❌ Недостаточно средств на балансе магазина'
            : (billingResult.error || '❌ Не удалось принять заказ');
          bot.answerCallbackQuery(callbackQuery.id, { text, show_alert: true });
          return;
        }
        
        // Update order status in database
        await pool.query(
          `UPDATE orders SET status = 'preparing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [orderId]
        );
        
        // Add to status history
        await pool.query(
          'INSERT INTO order_status_history (order_id, status, comment) VALUES ($1, $2, $3)',
          [orderId, 'preparing', `Подтверждено: ${operatorName}`]
        );
        
        // Get order details for notification with restaurant bot token
        const orderResult = await pool.query(
          `SELECT o.*, u.telegram_id, r.telegram_bot_token 
           FROM orders o 
           LEFT JOIN users u ON o.user_id = u.id 
           LEFT JOIN restaurants r ON o.restaurant_id = r.id
           WHERE o.id = $1`,
          [orderId]
        );
        
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          
          // Notify customer using restaurant's bot
          if (order.telegram_id) {
            const { sendOrderUpdateToUser } = require('./notifications');
            await sendOrderUpdateToUser(order.telegram_id, order, 'preparing', order.telegram_bot_token);
          }
          
          // Update message in group - remove buttons
          const newText = callbackQuery.message.text.replace(
            'Статус: 🆕 Новый',
            `Статус: 👨‍🍳 Готовится\n✅ Подтвердил: ${operatorName}`
          );
          
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [] } // Remove buttons
          });
        }
        
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Заказ подтвержден!' });
      } catch (error) {
        console.error('Confirm order error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ошибка: ' + error.message, show_alert: true });
      }
    }
    
    // Reject order - ask for reason
    else if (data.startsWith('reject_order_')) {
      const orderId = data.replace('reject_order_', '');
      
      // Check if this order belongs to a restaurant with its own bot token
      const orderCheck = await pool.query(`
        SELECT r.telegram_bot_token 
        FROM orders o 
        LEFT JOIN restaurants r ON o.restaurant_id = r.id 
        WHERE o.id = $1
      `, [orderId]);
      
      // If restaurant has its own bot token (different from env), skip - multi-bot handles it
      if (orderCheck.rows.length > 0 && 
          orderCheck.rows[0].telegram_bot_token && 
          orderCheck.rows[0].telegram_bot_token !== activeSuperadminBotToken) {
        console.log(`⏭️ Skipping reject for order ${orderId} - handled by multi-bot system`);
        return;
      }
      
      // Store state to wait for rejection reason
      registrationStates.set(`reject_${chatId}_${messageId}`, {
        step: 'waiting_reject_reason',
        orderId: orderId,
        operatorName: operatorName,
        originalMessageId: messageId
      });
      
      bot.sendMessage(chatId,
        `❌ <b>Отмена заказа #${orderId}</b>\n\n` +
        `Напишите причину отказа:`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      );
    }
  });
  
  // =====================================================
  // Handle rejection reason (reply)
  // =====================================================
  bot.on('message', async (msg) => {
    if (!msg.reply_to_message) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Find rejection state
    for (const [key, state] of registrationStates.entries()) {
      if (key.startsWith(`reject_${chatId}_`) && state.step === 'waiting_reject_reason') {
        const { orderId, operatorName, originalMessageId } = state;
        
        try {
          // Update order status
          await pool.query(
            `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [orderId]
          );
          
          // Add to status history with reason
          await pool.query(
            'INSERT INTO order_status_history (order_id, status, comment) VALUES ($1, $2, $3)',
            [orderId, 'cancelled', `Отказано: ${text} (${operatorName})`]
          );
          
          // Get order details with restaurant bot token
          const orderResult = await pool.query(
            `SELECT o.*, u.telegram_id, r.telegram_bot_token 
             FROM orders o 
             LEFT JOIN users u ON o.user_id = u.id 
             LEFT JOIN restaurants r ON o.restaurant_id = r.id
             WHERE o.id = $1`,
            [orderId]
          );
          
          if (orderResult.rows.length > 0) {
            const order = orderResult.rows[0];
            
            // Notify customer with reason using restaurant's bot
            if (order.telegram_id) {
              const { getRestaurantBot } = require('./notifications');
              const customerBot = order.telegram_bot_token 
                ? getRestaurantBot(order.telegram_bot_token) 
                : getDefaultBot();
              if (customerBot) {
                customerBot.sendMessage(order.telegram_id,
                  `❌ <b>Заказ #${order.order_number} отменен</b>\n\n` +
                  `Причина: ${text}\n\n` +
                  `Приносим извинения за неудобства.`,
                  {
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '🛒 Новый заказ', callback_data: 'new_order' }]
                      ]
                    }
                  }
                );
              }
            }
          }
          
          // Update original message
          bot.sendMessage(chatId,
            `❌ <b>Заказ #${orderId} отменен</b>\n\n` +
            `Причина: ${text}\n` +
            `Оператор: ${operatorName}`,
            { parse_mode: 'HTML' }
          );
          
          // Clear state
          registrationStates.delete(key);
        } catch (error) {
          console.error('Reject order error:', error);
          bot.sendMessage(chatId, '❌ Ошибка при отмене заказа');
        }
        
        break;
      }
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    if (error.response?.body?.error_code === 409) {
      console.warn('⚠️  Telegram bot conflict: Another instance is running');
    } else {
      console.error('Telegram polling error:', error.message);
    }
  });
  
  bot.on('webhook_error', (error) => {
    console.error('Telegram webhook error:', error);
  });
}

function getStatusText(status) {
  const statusMap = {
    'new': 'Новый',
    'preparing': 'Готовится',
    'delivering': 'Доставляется',
    'delivered': 'Доставлен',
    'cancelled': 'Отменен'
  };
  return statusMap[status] || status;
}

function getBot() {
  return bot;
}

function getActiveSuperadminBotToken() {
  return activeSuperadminBotToken;
}

async function stopBot() {
  if (!bot) return;

  try {
    bot.removeAllListeners();
  } catch (e) {
    console.warn('Bot listener cleanup warning:', e.message);
  }

  try {
    await bot.stopPolling();
  } catch (e) {
    // no-op: bot may be in webhook mode
  }

  try {
    await bot.deleteWebHook();
  } catch (e) {
    // no-op
  }

  bot = null;
}

async function reloadBot() {
  await stopBot();
  await initBot();
}

module.exports = { initBot, getBot, reloadBot, getActiveSuperadminBotToken };
