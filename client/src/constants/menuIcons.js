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

const clampIconValue = (value, fallback = '') => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return fallback;
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

