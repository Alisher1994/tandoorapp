const MAX_RESTAURANT_SLUG_LENGTH = 32;
const MIN_RESTAURANT_SLUG_LENGTH = 3;

// Slug = публичный адрес витрины: talablar.up.railway.app/<slug>
// Разрешены строчные латинские буквы, цифры и дефис; не в начале/конце; без повторяющихся дефисов.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Пути, которые уже заняты роутером/системой — их нельзя занять под slug.
const RESERVED_SLUGS = new Set([
  'login', 'logout', 'register', 'cart', 'orders', 'order', 'feedback',
  'favorites', 'reservations', 'reservation', 'catalog', 'showcase',
  'admin', 'superadmin', 'operator', 'moderator', 'webapp', 'api',
  'shop', 'shops', 'store', 'stores', 'assets', 'static', 'public',
  'images', 'img', 'css', 'js', 'fonts', 'media', 'uploads', 'files',
  'about', 'help', 'support', 'contact', 'terms', 'privacy', 'auth',
  'me', 'profile', 'settings', 'home', 'index', 'app', 'dashboard',
  'health', 'healthz', 'status', 'robots.txt', 'favicon.ico', 'sitemap.xml'
]);

const normalizeRestaurantSlug = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')   // пробелы/подчёркивания -> дефис
    .replace(/[^a-z0-9-]/g, '') // убрать всё лишнее
    .replace(/-+/g, '-')        // схлопнуть повторяющиеся дефисы
    .replace(/^-+|-+$/g, '');   // обрезать дефисы по краям
};

const validateRestaurantSlug = (value) => {
  const raw = String(value || '');
  const normalized = normalizeRestaurantSlug(raw);

  if (!normalized) {
    return { ok: false, code: 'SLUG_REQUIRED', message: 'Адрес витрины обязателен', normalized };
  }
  if (normalized.length < MIN_RESTAURANT_SLUG_LENGTH) {
    return { ok: false, code: 'SLUG_TOO_SHORT', message: `Слишком короткий адрес (минимум ${MIN_RESTAURANT_SLUG_LENGTH} символа)`, normalized };
  }
  if (normalized.length > MAX_RESTAURANT_SLUG_LENGTH) {
    return { ok: false, code: 'SLUG_TOO_LONG', message: `Слишком длинный адрес (максимум ${MAX_RESTAURANT_SLUG_LENGTH} символов)`, normalized };
  }
  if (!SLUG_RE.test(normalized)) {
    return { ok: false, code: 'SLUG_INVALID', message: 'Только латинские буквы, цифры и дефис', normalized };
  }
  if (RESERVED_SLUGS.has(normalized)) {
    return { ok: false, code: 'SLUG_RESERVED', message: 'Этот адрес зарезервирован системой', normalized };
  }
  return { ok: true, code: 'OK', message: '', normalized };
};

const isReservedSlug = (value) => RESERVED_SLUGS.has(normalizeRestaurantSlug(value));

module.exports = {
  MAX_RESTAURANT_SLUG_LENGTH,
  MIN_RESTAURANT_SLUG_LENGTH,
  RESERVED_SLUGS,
  normalizeRestaurantSlug,
  validateRestaurantSlug,
  isReservedSlug
};
