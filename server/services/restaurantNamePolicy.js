const MAX_RESTAURANT_NAME_LENGTH = 60;
const MIN_RESTAURANT_NAME_LENGTH = 3;

const ALLOWED_CHAR_RE = /^[A-Za-zА-Яа-яЁё0-9\s\-_.`'’ʻ‘ʼ]$/u;
const APOSTROPHE_VARIANTS_RE = /[’ʻ‘ʼ`]/g;
const MULTISPACE_RE = /\s+/g;
const LONG_DIGIT_RUN_RE = /\d{7,}/g;

const normalizeRestaurantNameForStorage = (value) => {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(APOSTROPHE_VARIANTS_RE, "'")
    .replace(MULTISPACE_RE, ' ')
    .trim()
    .toUpperCase();
};

const getFirstInvalidRestaurantNameChar = (value) => {
  const text = String(value || '');
  for (const ch of text) {
    if (!ALLOWED_CHAR_RE.test(ch)) return ch;
  }
  return '';
};

const validateRestaurantName = (value) => {
  const raw = String(value || '');
  const normalized = normalizeRestaurantNameForStorage(raw);
  if (!normalized) {
    return { ok: false, code: 'NAME_REQUIRED', message: 'Название магазина обязательно', normalized };
  }
  if (normalized.length < MIN_RESTAURANT_NAME_LENGTH) {
    return { ok: false, code: 'NAME_TOO_SHORT', message: `Название слишком короткое (минимум ${MIN_RESTAURANT_NAME_LENGTH} символа)`, normalized };
  }
  if (normalized.length > MAX_RESTAURANT_NAME_LENGTH) {
    return { ok: false, code: 'NAME_TOO_LONG', message: `Название слишком длинное (максимум ${MAX_RESTAURANT_NAME_LENGTH} символов)`, normalized };
  }
  const invalidChar = getFirstInvalidRestaurantNameChar(normalized);
  if (invalidChar) {
    return {
      ok: false,
      code: 'NAME_INVALID_CHAR',
      invalidChar,
      message: `Недопустимый символ в названии: "${invalidChar}"`,
      normalized
    };
  }
  if (LONG_DIGIT_RUN_RE.test(normalized)) {
    return {
      ok: false,
      code: 'NAME_PHONE_DETECTED',
      message: 'В названии не допускаются номера телефонов (7+ цифр подряд)',
      normalized
    };
  }
  return { ok: true, code: 'OK', message: '', normalized };
};

const sanitizeExistingRestaurantName = (value, fallback = 'SHOP') => {
  let normalized = normalizeRestaurantNameForStorage(value)
    .split('')
    .filter((ch) => ALLOWED_CHAR_RE.test(ch))
    .join('')
    .replace(LONG_DIGIT_RUN_RE, '')
    .replace(MULTISPACE_RE, ' ')
    .trim();
  if (!normalized) normalized = fallback;
  if (normalized.length > MAX_RESTAURANT_NAME_LENGTH) {
    normalized = normalized.slice(0, MAX_RESTAURANT_NAME_LENGTH).trim();
  }
  return normalized;
};

const normalizeRestaurantNameForCompare = (value) => {
  return normalizeRestaurantNameForStorage(value)
    .replace(/['._-]/g, '')
    .replace(MULTISPACE_RE, ' ')
    .trim()
    .toLowerCase();
};

module.exports = {
  MAX_RESTAURANT_NAME_LENGTH,
  MIN_RESTAURANT_NAME_LENGTH,
  normalizeRestaurantNameForStorage,
  normalizeRestaurantNameForCompare,
  validateRestaurantName,
  sanitizeExistingRestaurantName
};

