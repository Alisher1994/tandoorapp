const RESTAURANT_CURRENCY_CODES = new Set(['uz', 'kz', 'tm', 'tj', 'kg', 'af', 'ru']);

const CURRENCY_LABELS = {
  uz: { ru: 'сум', uz: "so'm" },
  kz: { ru: 'тенге', uz: 'tenge' },
  tm: { ru: 'манат', uz: 'manat' },
  tj: { ru: 'сомони', uz: 'somoni' },
  kg: { ru: 'сом', uz: 'som' },
  af: { ru: 'афгани', uz: "afg'oni" },
  ru: { ru: 'руб', uz: 'rubl' }
};

const DEFAULT_CURRENCY_CODE = 'uz';
const CURRENCY_CACHE_TTL_MS = 5 * 60 * 1000;
const restaurantCurrencyCache = new Map();

function normalizeRestaurantCurrencyCode(value, fallback = DEFAULT_CURRENCY_CODE) {
  const normalized = String(value || '').trim().toLowerCase();
  if (RESTAURANT_CURRENCY_CODES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return RESTAURANT_CURRENCY_CODES.has(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_CURRENCY_CODE;
}

function getCurrencyLabelByCode(code, language = 'ru') {
  const normalizedCode = normalizeRestaurantCurrencyCode(code, DEFAULT_CURRENCY_CODE);
  const labels = CURRENCY_LABELS[normalizedCode] || CURRENCY_LABELS[DEFAULT_CURRENCY_CODE];
  return String(language || '').trim().toLowerCase() === 'uz'
    ? (labels.uz || labels.ru || CURRENCY_LABELS[DEFAULT_CURRENCY_CODE].ru)
    : (labels.ru || labels.uz || CURRENCY_LABELS[DEFAULT_CURRENCY_CODE].ru);
}

function getKnownCurrencyCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return RESTAURANT_CURRENCY_CODES.has(normalized) ? normalized : null;
}

async function resolveRestaurantCurrencyCode(db, restaurantId, fallback = DEFAULT_CURRENCY_CODE) {
  const normalizedRestaurantId = Number.parseInt(restaurantId, 10);
  if (!Number.isFinite(normalizedRestaurantId) || normalizedRestaurantId <= 0) {
    return normalizeRestaurantCurrencyCode(fallback, DEFAULT_CURRENCY_CODE);
  }

  const cached = restaurantCurrencyCache.get(normalizedRestaurantId);
  if (cached && (Date.now() - cached.updatedAt) < CURRENCY_CACHE_TTL_MS) {
    return cached.code;
  }

  try {
    const result = await db.query(
      'SELECT currency_code FROM restaurants WHERE id = $1 LIMIT 1',
      [normalizedRestaurantId]
    );
    const resolved = normalizeRestaurantCurrencyCode(result.rows[0]?.currency_code, fallback);
    restaurantCurrencyCache.set(normalizedRestaurantId, {
      code: resolved,
      updatedAt: Date.now()
    });
    return resolved;
  } catch (_) {
    return normalizeRestaurantCurrencyCode(fallback, DEFAULT_CURRENCY_CODE);
  }
}

module.exports = {
  getCurrencyLabelByCode,
  getKnownCurrencyCode,
  normalizeRestaurantCurrencyCode,
  resolveRestaurantCurrencyCode
};
