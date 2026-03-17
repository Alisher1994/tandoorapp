export const MAP_PROVIDER_STORAGE_KEY = 'talablar_leaflet_map_provider_v1';
export const MAP_PROVIDER_VALUES = Object.freeze({
  OSM: 'osm',
  YANDEX: 'yandex'
});

const DEFAULT_MAP_PROVIDER = MAP_PROVIDER_VALUES.OSM;
const YANDEX_TILE_BASE_URL = 'https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU';

export const normalizeMapProvider = (value, fallback = DEFAULT_MAP_PROVIDER) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MAP_PROVIDER_VALUES.YANDEX) return MAP_PROVIDER_VALUES.YANDEX;
  if (normalized === MAP_PROVIDER_VALUES.OSM) return MAP_PROVIDER_VALUES.OSM;
  return fallback;
};

export const getSavedMapProvider = () => {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_MAP_PROVIDER;
  try {
    return normalizeMapProvider(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY), DEFAULT_MAP_PROVIDER);
  } catch (_) {
    return DEFAULT_MAP_PROVIDER;
  }
};

export const saveMapProvider = (provider) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, normalizeMapProvider(provider));
  } catch (_) {
    // Ignore storage errors.
  }
};

export const getLeafletTileLayerConfig = (provider, options = {}) => {
  const normalizedProvider = normalizeMapProvider(provider, DEFAULT_MAP_PROVIDER);
  const yandexApiKey = String(options?.yandexApiKey || '').trim();

  if (normalizedProvider === MAP_PROVIDER_VALUES.YANDEX) {
    const url = yandexApiKey
      ? `${YANDEX_TILE_BASE_URL}&apikey=${encodeURIComponent(yandexApiKey)}`
      : YANDEX_TILE_BASE_URL;
    return {
      provider: MAP_PROVIDER_VALUES.YANDEX,
      url,
      maxZoom: 19,
      attribution: '&copy; <a href="https://yandex.com/legal/maps_termsofuse/" target="_blank" rel="noreferrer">Yandex</a>'
    };
  }

  return {
    provider: MAP_PROVIDER_VALUES.OSM,
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
  };
};
