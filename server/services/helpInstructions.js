const pool = require('../database/connection');

let helpInstructionsSchemaReady = false;
let helpInstructionsSchemaPromise = null;

const DEFAULT_HELP_INSTRUCTIONS = [
  {
    code: 'store_registration',
    title_ru: 'Регистрация магазина в суперадмин-боте',
    title_uz: "Superadmin botida do'konni ro'yxatdan o'tkazish",
    sort_order: 1
  },
  {
    code: 'bot_token',
    title_ru: 'Получение токена бота',
    title_uz: 'Bot tokenini olish',
    sort_order: 2
  },
  {
    code: 'add_own_bot',
    title_ru: 'Добавляем своего бота',
    title_uz: "Shaxsiy botni qo'shish",
    sort_order: 3
  },
  {
    code: 'group_and_assign_bot',
    title_ru: 'Формирование группы и назначение своего бота',
    title_uz: 'Guruh shakllantirish va botni tayinlash',
    sort_order: 4
  },
  {
    code: 'system_login',
    title_ru: 'Вход в систему',
    title_uz: 'Tizimga kirish',
    sort_order: 5
  },
  {
    code: 'add_product',
    title_ru: 'Добавление товара',
    title_uz: "Mahsulot qo'shish",
    sort_order: 6
  },
  {
    code: 'order_processing',
    title_ru: 'Прием и обработка заказов',
    title_uz: 'Buyurtmalarni qabul qilish va qayta ishlash',
    sort_order: 7
  },
  {
    code: 'store_settings',
    title_ru: 'Настройки магазина',
    title_uz: "Do'kon sozlamalari",
    sort_order: 8
  },
  {
    code: 'balance_topup',
    title_ru: 'Пополнение баланса',
    title_uz: "Balansni to'ldirish",
    sort_order: 9
  },
  {
    code: 'restore_login_password',
    title_ru: 'Восстановление логина и пароля',
    title_uz: 'Login va parolni tiklash',
    sort_order: 10
  }
];

const normalizeInstructionText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeInstructionUrl = (value) => String(value || '').trim();

const normalizeSortOrder = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const isValidYouTubeUrl = (value) => {
  const raw = normalizeInstructionUrl(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return host === 'youtu.be' ||
      host.endsWith('youtube.com') ||
      host.endsWith('youtube-nocookie.com');
  } catch (error) {
    return false;
  }
};

const ensureHelpInstructionsSchema = async () => {
  if (helpInstructionsSchemaReady) return;
  if (helpInstructionsSchemaPromise) {
    await helpInstructionsSchemaPromise;
    return;
  }

  helpInstructionsSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS help_instructions (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64),
        title_ru VARCHAR(255) NOT NULL,
        title_uz VARCHAR(255) NOT NULL,
        youtube_url TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS code VARCHAR(64)`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS title_ru VARCHAR(255) NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS title_uz VARCHAR(255) NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS youtube_url TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_help_instructions_code ON help_instructions (code) WHERE code IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_help_instructions_sort ON help_instructions (sort_order, id)`);

    for (const item of DEFAULT_HELP_INSTRUCTIONS) {
      await pool.query(
        `INSERT INTO help_instructions (code, title_ru, title_uz, youtube_url, sort_order, is_default)
         VALUES ($1, $2, $3, '', $4, true)
         ON CONFLICT (code) DO UPDATE SET
           title_ru = EXCLUDED.title_ru,
           title_uz = EXCLUDED.title_uz,
           sort_order = EXCLUDED.sort_order,
           is_default = true,
           updated_at = CURRENT_TIMESTAMP`,
        [item.code, item.title_ru, item.title_uz, item.sort_order]
      );
    }

    helpInstructionsSchemaReady = true;
  })();

  try {
    await helpInstructionsSchemaPromise;
  } finally {
    helpInstructionsSchemaPromise = null;
  }
};

const listHelpInstructions = async () => {
  await ensureHelpInstructionsSchema();
  const result = await pool.query(`
    SELECT id, code, title_ru, title_uz, youtube_url, sort_order, is_default, created_at, updated_at
    FROM help_instructions
    ORDER BY sort_order ASC, id ASC
  `);
  return result.rows;
};

const getHelpInstructionByCode = async (code) => {
  await ensureHelpInstructionsSchema();
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) return null;

  const result = await pool.query(
    `SELECT id, code, title_ru, title_uz, youtube_url, sort_order, is_default, created_at, updated_at
     FROM help_instructions
     WHERE code = $1
     LIMIT 1`,
    [normalizedCode]
  );
  return result.rows[0] || null;
};

const resolveNextSortOrder = async () => {
  await ensureHelpInstructionsSchema();
  const result = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
     FROM help_instructions`
  );
  return Number(result.rows[0]?.max_sort_order || 0) + 1;
};

const createHelpInstruction = async (payload = {}) => {
  await ensureHelpInstructionsSchema();

  const titleRu = normalizeInstructionText(payload.title_ru);
  const titleUz = normalizeInstructionText(payload.title_uz);
  const youtubeUrl = normalizeInstructionUrl(payload.youtube_url);
  const sortOrder = payload.sort_order === undefined || payload.sort_order === null || payload.sort_order === ''
    ? await resolveNextSortOrder()
    : normalizeSortOrder(payload.sort_order, await resolveNextSortOrder());

  const result = await pool.query(
    `INSERT INTO help_instructions (title_ru, title_uz, youtube_url, sort_order, is_default)
     VALUES ($1, $2, $3, $4, false)
     RETURNING id, code, title_ru, title_uz, youtube_url, sort_order, is_default, created_at, updated_at`,
    [titleRu, titleUz, youtubeUrl, sortOrder]
  );
  return result.rows[0];
};

const updateHelpInstruction = async (id, payload = {}) => {
  await ensureHelpInstructionsSchema();

  const titleRu = normalizeInstructionText(payload.title_ru);
  const titleUz = normalizeInstructionText(payload.title_uz);
  const youtubeUrl = normalizeInstructionUrl(payload.youtube_url);
  const sortOrder = normalizeSortOrder(payload.sort_order, 0);

  const result = await pool.query(
    `UPDATE help_instructions
     SET title_ru = $1,
         title_uz = $2,
         youtube_url = $3,
         sort_order = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING id, code, title_ru, title_uz, youtube_url, sort_order, is_default, created_at, updated_at`,
    [titleRu, titleUz, youtubeUrl, sortOrder, id]
  );
  return result.rows[0] || null;
};

const deleteHelpInstruction = async (id) => {
  await ensureHelpInstructionsSchema();
  const result = await pool.query(
    `DELETE FROM help_instructions
     WHERE id = $1
     RETURNING id, code, title_ru, title_uz, youtube_url, sort_order, is_default`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  DEFAULT_HELP_INSTRUCTIONS,
  ensureHelpInstructionsSchema,
  isValidYouTubeUrl,
  listHelpInstructions,
  getHelpInstructionByCode,
  createHelpInstruction,
  updateHelpInstruction,
  deleteHelpInstruction
};
