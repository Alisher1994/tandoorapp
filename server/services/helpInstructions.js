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
  },
  {
    code: 'store_logo',
    title_ru: 'Добавление логотипа магазина',
    title_uz: "Do'kon logotipini qo'shish",
    sort_order: 11
  }
];

const normalizeInstructionText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeInstructionUrl = (value) => String(value || '').trim();

const normalizeSortOrder = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const toSortOrder = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
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
        view_count INTEGER DEFAULT 0,
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
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE help_instructions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`UPDATE help_instructions SET view_count = 0 WHERE view_count IS NULL`);

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_help_instructions_code ON help_instructions (code) WHERE code IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_help_instructions_sort ON help_instructions (sort_order, id)`);

    for (const item of DEFAULT_HELP_INSTRUCTIONS) {
      const existing = await pool.query(
        `SELECT id
         FROM help_instructions
         WHERE code = $1
         ORDER BY id ASC
         LIMIT 1`,
        [item.code]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE help_instructions
           SET title_ru = $1,
               title_uz = $2,
               sort_order = $3,
               is_default = true,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [item.title_ru, item.title_uz, item.sort_order, existing.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO help_instructions (code, title_ru, title_uz, youtube_url, sort_order, is_default)
           VALUES ($1, $2, $3, '', $4, true)`,
          [item.code, item.title_ru, item.title_uz, item.sort_order]
        );
      }
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
    SELECT id, code, title_ru, title_uz, youtube_url, view_count, sort_order, is_default, created_at, updated_at
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
    `SELECT id, code, title_ru, title_uz, youtube_url, view_count, sort_order, is_default, created_at, updated_at
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
    `SELECT sort_order
     FROM help_instructions
     WHERE sort_order IS NOT NULL AND sort_order > 0
     ORDER BY sort_order ASC, id ASC`
  );
  const taken = new Set(
    result.rows
      .map((row) => toSortOrder(row.sort_order))
      .filter((value) => Number.isFinite(value))
  );
  let candidate = 1;
  while (taken.has(candidate)) {
    candidate += 1;
  }
  return candidate;
};

const createHelpInstruction = async (payload = {}) => {
  await ensureHelpInstructionsSchema();

  const titleRu = normalizeInstructionText(payload.title_ru);
  const titleUz = normalizeInstructionText(payload.title_uz);
  const youtubeUrl = normalizeInstructionUrl(payload.youtube_url);
  const sortOrder = payload.sort_order === undefined || payload.sort_order === null || payload.sort_order === ''
    ? await resolveNextSortOrder()
    : normalizeSortOrder(payload.sort_order, await resolveNextSortOrder());

  const sortConflict = await pool.query(
    `SELECT id FROM help_instructions WHERE sort_order = $1 LIMIT 1`,
    [sortOrder]
  );
  if (sortConflict.rows.length > 0) {
    const error = new Error('DUPLICATE_SORT_ORDER');
    error.code = 'DUPLICATE_SORT_ORDER';
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO help_instructions (title_ru, title_uz, youtube_url, sort_order, is_default)
     VALUES ($1, $2, $3, $4, false)
     RETURNING id, code, title_ru, title_uz, youtube_url, view_count, sort_order, is_default, created_at, updated_at`,
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

  const sortConflict = await pool.query(
    `SELECT id
     FROM help_instructions
     WHERE sort_order = $1
       AND id <> $2
     LIMIT 1`,
    [sortOrder, id]
  );
  if (sortConflict.rows.length > 0) {
    const error = new Error('DUPLICATE_SORT_ORDER');
    error.code = 'DUPLICATE_SORT_ORDER';
    throw error;
  }

  const result = await pool.query(
    `UPDATE help_instructions
     SET title_ru = $1,
         title_uz = $2,
         youtube_url = $3,
         sort_order = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING id, code, title_ru, title_uz, youtube_url, view_count, sort_order, is_default, created_at, updated_at`,
    [titleRu, titleUz, youtubeUrl, sortOrder, id]
  );
  return result.rows[0] || null;
};

const incrementHelpInstructionViewCount = async (id) => {
  await ensureHelpInstructionsSchema();
  const result = await pool.query(
    `UPDATE help_instructions
     SET view_count = COALESCE(view_count, 0) + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, code, title_ru, title_uz, youtube_url, view_count, sort_order, is_default, created_at, updated_at`,
    [id]
  );
  return result.rows[0] || null;
};

const deleteHelpInstruction = async (id) => {
  await ensureHelpInstructionsSchema();
  const instruction = await pool.query(
    `SELECT id, is_default
     FROM help_instructions
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  if (instruction.rows.length === 0) {
    return null;
  }
  if (instruction.rows[0].is_default === true) {
    const error = new Error('DEFAULT_DELETE_FORBIDDEN');
    error.code = 'DEFAULT_DELETE_FORBIDDEN';
    throw error;
  }

  const result = await pool.query(
    `DELETE FROM help_instructions
     WHERE id = $1
     RETURNING id, code, title_ru, title_uz, youtube_url, view_count, sort_order, is_default`,
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
  resolveNextSortOrder,
  createHelpInstruction,
  updateHelpInstruction,
  incrementHelpInstructionViewCount,
  deleteHelpInstruction
};
