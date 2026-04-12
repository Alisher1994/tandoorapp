export const MENU_ICON_KEYS = Object.freeze([
  'showcase',
  'catalog',
  'favorites',
  'cart',
  'reservations'
]);

export const DEFAULT_MENU_ICON_SETTINGS = Object.freeze({
  showcase: '🛍️',
  catalog: '📋',
  favorites: '❤️',
  cart: '🛒',
  reservations: '🪑'
});

const isHttpUrl = (value) => /^https?:\/\//i.test(value);
const isUploadsPath = (value) => value.startsWith('/uploads/');
const isDataImageUri = (value) => value.startsWith('data:image/');

export const isImageIconValue = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return false;
  return isHttpUrl(normalized) || isUploadsPath(normalized) || isDataImageUri(normalized);
};

const clampIconValue = (value, fallback = '') => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return fallback;
  if (isImageIconValue(normalized)) return normalized.slice(0, 2048);
  return Array.from(normalized).slice(0, 4).join('');
};

export const normalizeMenuIconSettings = (rawSettings, fallback = DEFAULT_MENU_ICON_SETTINGS) => {
  const source = rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
    ? rawSettings
    : {};

  return MENU_ICON_KEYS.reduce((acc, key) => {
    acc[key] = clampIconValue(source[key], fallback?.[key] || DEFAULT_MENU_ICON_SETTINGS[key]);
    return acc;
  }, {});
};
