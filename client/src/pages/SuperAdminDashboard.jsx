import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminStyles.css';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  LabelList
} from 'recharts';
import {
  Container, Row, Col, Card, Table, Button, Form, Modal,
  Tabs, Tab, Badge, Navbar, Nav, Alert, Pagination, Spinner,
  Toast, ToastContainer, Dropdown
} from 'react-bootstrap';
import {
  Bot,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderTree,
  Globe,
  Megaphone,
  Package,
  Pencil,
  PieChart,
  Puzzle,
  Receipt,
  Shield,
  Store,
  Trash2,
  UserCog,
  Users,
  Wallet
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTimedActionButtonsVisibility } from '../hooks/useTimedActionButtonsVisibility';
import YandexLocationPicker from '../components/YandexLocationPicker';
import YandexAnalyticsMap from '../components/YandexAnalyticsMap';
import { ListSkeleton, TableSkeleton } from '../components/SkeletonUI';
import CountryCurrencyDropdown from '../components/CountryCurrencyDropdown';
import HeaderGlowBackground from '../components/HeaderGlowBackground';
import {
  getLeafletTileLayerConfig,
  getSavedMapProvider,
  normalizeMapProvider,
  saveMapProvider
} from '../utils/mapTileProviders';

// Lazy load map components (heavy)
const DeliveryZoneMap = lazy(() => import('../components/DeliveryZoneMap'));

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SUPERADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY = 'sa_sidebar_collapsed_v1';
const CATEGORY_LEVEL_COUNT = 3;
const MAX_UPLOAD_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const MAX_SPREADSHEET_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SPREADSHEET_IMPORT_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
const SPREADSHEET_IMPORT_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain'
]);
const MAX_RESTAURANT_ADMIN_COMMENT_LENGTH = 2000;
const RESTAURANT_COMMENT_CHECKLIST_OPTIONS = [
  {
    code: 'call_completed',
    ru: 'Созвон проведен',
    uz: "Qo'ng'iroq qilindi"
  },
  {
    code: 'meeting_completed',
    ru: 'Личная встреча проведена',
    uz: 'Shaxsiy uchrashuv bo‘ldi'
  },
  {
    code: 'products_added',
    ru: 'Товары добавлены',
    uz: "Mahsulotlar qo'shildi"
  },
  {
    code: 'has_improvement_suggestions',
    ru: 'Есть предложения по улучшению',
    uz: 'Yaxshilash bo‘yicha takliflar bor'
  },
  {
    code: 'telegram_token_issue',
    ru: 'Не получается добавить Telegram-токен',
    uz: "Telegram tokenini qo'shib bo'lmayapti"
  },
  {
    code: 'customers_not_adding',
    ru: 'Клиенты не добавляются',
    uz: "Mijozlar qo'shilmayapti"
  }
];
const RESTAURANT_COMMENT_CHECKLIST_CODE_SET = new Set(RESTAURANT_COMMENT_CHECKLIST_OPTIONS.map((item) => item.code));
const MAX_ORDER_RATING = 5;
const DAVRON_SCAM_PRANK_SESSION_KEY = 'sa_davron_scam_prank_v1_shown';
const CATALOG_ANIMATION_SEASON_OPTIONS = [
  { value: 'spring', label: 'Весна' },
  { value: 'summer', label: 'Лето' },
  { value: 'autumn', label: 'Осень' },
  { value: 'winter', label: 'Зима' }
];
const AI_PROVIDER_TYPE_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'replicate', label: 'Replicate' },
  { value: 'cloudflare', label: 'Cloudflare AI' },
  { value: 'pollinations', label: 'Pollinations' },
  { value: 'custom', label: 'Custom' }
];
const AI_PROVIDER_TYPE_META = {
  gemini: { label: 'Gemini', icon: '/ai-providers/gemini.svg', badge: 'primary' },
  openai: { label: 'OpenAI', icon: '/ai-providers/openai.svg', badge: 'dark' },
  openrouter: { label: 'OpenRouter', icon: '/ai-providers/openrouter.svg', badge: 'secondary' },
  replicate: { label: 'Replicate', icon: '/ai-providers/replicate.svg', badge: 'info' },
  cloudflare: { label: 'Cloudflare AI', icon: '/ai-providers/cloudflare.svg', badge: 'warning' },
  pollinations: { label: 'Pollinations', icon: '/ai-providers/pollinations.svg', badge: 'success' },
  custom: { label: 'Custom', icon: '/ai-providers/custom.svg', badge: 'secondary' }
};
const OPENROUTER_FREE_TEXT_MODEL = 'stepfun/step-3.5-flash:free';
const OPENROUTER_FREE_IMAGE_MODEL = 'minimax/minimax-m2.5:free';
const getAiModelPlaceholdersByProviderType = (providerType) => {
  const normalizedType = String(providerType || '').trim().toLowerCase();
  if (normalizedType === 'openrouter') {
    return {
      image: OPENROUTER_FREE_IMAGE_MODEL,
      text: OPENROUTER_FREE_TEXT_MODEL
    };
  }
  if (normalizedType === 'openai') {
    return {
      image: 'gpt-image-1',
      text: 'gpt-4.1-mini'
    };
  }
  if (normalizedType === 'pollinations') {
    return {
      image: 'flux',
      text: 'openai'
    };
  }
  return {
    image: 'gemini-2.5-flash-image',
    text: 'gemini-2.5-flash'
  };
};
const getAiProviderTypeMeta = (providerType) => {
  const normalized = String(providerType || '').trim().toLowerCase();
  if (normalized && AI_PROVIDER_TYPE_META[normalized]) {
    return AI_PROVIDER_TYPE_META[normalized];
  }
  if (normalized) {
    return {
      ...AI_PROVIDER_TYPE_META.custom,
      label: normalized
    };
  }
  return AI_PROVIDER_TYPE_META.custom;
};
const createEmptyAiProviderDraft = () => ({
  local_key: `draft-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  id: null,
  name: '',
  provider_type: 'gemini',
  api_key: '',
  clear_api_key: false,
  api_key_masked: '',
  has_api_key: false,
  image_model: '',
  text_model: '',
  priority: 100,
  is_enabled: true,
  is_active: false,
  config_json: {}
});
const normalizeCatalogAnimationSeason = (value, fallback = 'off') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['off', 'spring', 'summer', 'autumn', 'winter'].includes(normalized) ? normalized : fallback;
};
const createEmptyHelpInstructionForm = () => ({
  id: null,
  title_ru: '',
  title_uz: '',
  youtube_url: '',
  sort_order: ''
});
const extractYouTubeVideoId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const idLikeRaw = raw.match(/^[a-zA-Z0-9_-]{11}$/);
  if (idLikeRaw) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = parsed.pathname.replace(/\//g, '');
    } else if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/watch')) {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1] || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/shorts/')[1] || '';
      } else if (parsed.pathname.startsWith('/live/')) {
        videoId = parsed.pathname.split('/live/')[1] || '';
      }
    }

    return String(videoId).split(/[?&/]/)[0];
  } catch (error) {
    return '';
  }
};
const getYouTubeThumbnailUrl = (value, quality = 'mqdefault') => {
  const videoId = extractYouTubeVideoId(value);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : '';
};
const getRussianViewsLabel = (count) => {
  const absCount = Math.abs(Number.parseInt(count, 10) || 0) % 100;
  const lastDigit = absCount % 10;
  if (absCount > 10 && absCount < 20) return 'просмотров';
  if (lastDigit === 1) return 'просмотр';
  if (lastDigit >= 2 && lastDigit <= 4) return 'просмотра';
  return 'просмотров';
};
const formatHelpInstructionViews = (value, language = 'ru') => {
  const views = Math.max(0, Number.parseInt(value, 10) || 0);
  const locale = language === 'uz' ? 'uz-UZ' : 'ru-RU';
  const formattedNumber = views >= 1000
    ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(views)
    : new Intl.NumberFormat(locale).format(views);

  if (language === 'uz') {
    return `${formattedNumber} ko'rish`;
  }

  return `${formattedNumber} ${getRussianViewsLabel(views)}`;
};
const RESERVATION_TEMPLATE_SHAPE_OPTIONS = [
  { value: 'round', ru: 'Круглый', uz: 'Dumaloq' },
  { value: 'square', ru: 'Квадратный', uz: 'Kvadrat' },
  { value: 'rect', ru: 'Прямоугольный', uz: "To'g'ri to'rtburchak" },
  { value: 'sofa', ru: 'Диванный', uz: 'Divanli' },
  { value: 'custom', ru: 'Произвольный', uz: 'Maxsus' }
];
const RESERVATION_TEMPLATE_CATEGORY_OPTIONS = [
  { value: 'tables_chairs', ru: 'Столы и стулья', uz: 'Stol va stullar' },
  { value: 'bed', ru: 'Кровати', uz: 'Krovatlar' },
  { value: 'garage_box', ru: 'Гараж / бокс', uz: 'Garaj / boks' },
  { value: 'work_desk', ru: 'Рабочий стол', uz: 'Ish stoli' },
  { value: 'bunk', ru: 'Койки', uz: 'Koykalar' }
];
const createEmptyReservationTemplateForm = () => ({
  id: null,
  name: '',
  shape: 'custom',
  furniture_category: 'tables_chairs',
  activity_type_id: '',
  seats_count: 2,
  width: 1,
  height: 1,
  image_url: ''
});
const createEmptyGlobalProductForm = () => ({
  id: null,
  name_ru: '',
  name_uz: '',
  description_ru: '',
  description_uz: '',
  barcode: '',
  ikpu: '',
  image_url: '',
  recommended_category_id: '',
  unit: 'шт',
  order_step: '',
  is_active: true
});
const createInitialSuperadminBroadcastForm = () => ({
  message: '',
  image_url: '',
  video_url: '',
  roles: ['customer']
});
const createInitialFoundersAnalyticsState = () => ({
  period: {
    start_date: null,
    end_date: null
  },
  modules_config: [],
  available_currencies: [],
  shares_config: [],
  totals_by_currency: [],
  module_totals: [],
  module_monthly_totals: [],
  expense_totals_by_currency: [],
  expense_category_totals: [],
  expense_monthly_totals: [],
  founder_module_totals: [],
  founder_expense_totals: [],
  founder_totals: [],
  founder_monthly_totals: [],
  founder_monthly_module_totals: [],
  generated_at: null
});
const getTodayDateInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const parseMonthStartFromValue = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const monthMatch = normalized.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (monthMatch) {
    const year = Number.parseInt(monthMatch[1], 10);
    const monthIndex = Number.parseInt(monthMatch[2], 10) - 1;
    if (Number.isFinite(year) && monthIndex >= 0 && monthIndex <= 11) {
      return new Date(year, monthIndex, 1);
    }
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
};
const formatMonthKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const formatMonthLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};
const buildTrailingMonthsWindow = (endMonthDate, monthsCount = 12) => {
  const safeMonthsCount = Number.isFinite(Number(monthsCount)) && Number(monthsCount) > 0
    ? Number(monthsCount)
    : 12;
  const endDate = endMonthDate instanceof Date && !Number.isNaN(endMonthDate.getTime())
    ? new Date(endMonthDate.getFullYear(), endMonthDate.getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const result = [];
  for (let idx = safeMonthsCount - 1; idx >= 0; idx -= 1) {
    const date = new Date(endDate.getFullYear(), endDate.getMonth() - idx, 1);
    result.push({
      month_key: formatMonthKey(date),
      month_label: formatMonthLabel(date)
    });
  }
  return result;
};
const resolvePreferredFoundersCurrencyCode = (availableCurrencies = [], fallbackCurrencyCode = '') => {
  const normalizedList = Array.from(new Set(
    (Array.isArray(availableCurrencies) ? availableCurrencies : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  if (!normalizedList.length) return '';
  const preferredCodes = [
    'uz',
    String(fallbackCurrencyCode || '').trim().toLowerCase()
  ].filter(Boolean);
  for (const code of preferredCodes) {
    if (normalizedList.includes(code)) return code;
  }
  return normalizedList[0];
};
const formatCompactDateTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}.${dateOnlyMatch[2]}.${dateOnlyMatch[1]} 00:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};
const resolveFounderActorDisplayName = (actorName, actorUsername = '', actorPhone = '') => {
  const haystack = [
    actorName,
    actorUsername,
    actorPhone
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (!haystack) return '—';
  if (haystack.includes('mirza') || haystack.includes('мирза') || haystack.includes('998900922261') || haystack.includes('0922261')) return 'Mirzaolim';
  if (haystack.includes('davron') || haystack.includes('даврон') || haystack.includes('998770304477')) return 'Davron';
  if (haystack.includes('alisher') || haystack.includes('алишер') || haystack.includes('admin')) return 'Alisher';
  return String(actorName || actorUsername || '—').trim() || '—';
};
const formatCompactMoneyForMapLabel = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
};
const createInitialOrganizationExpenseForm = () => ({
  id: null,
  category_id: '',
  amount: '',
  currency_code: 'uz',
  expense_date: getTodayDateInputValue(),
  description: ''
});
const createInitialExpenseCategoryForm = () => ({
  id: null,
  name_ru: '',
  name_uz: '',
  is_active: true
});
const FOUNDERS_MODULE_UI_ORDER = [
  { key: 'orders', labelRu: 'Заказы', labelUz: 'Buyurtmalar' },
  { key: 'reservations', labelRu: 'Бронирования', labelUz: 'Bronlar' },
  { key: 'delivery', labelRu: 'Доставки', labelUz: 'Yetkazib berish' },
  { key: 'ads', labelRu: 'Рекламы', labelUz: 'Reklamalar' },
  { key: 'superapp', labelRu: 'Superapp', labelUz: 'Superapp' }
];
const FOUNDERS_CHART_COLORS = {
  admin: '#4f46e5',
  davron: '#0ea5e9',
  mirzaolim: '#22c55e'
};
const FOUNDERS_MODULE_CHART_COLORS = {
  orders: '#fb923c',
  reservations: '#ef4444',
  delivery: '#14b8a6',
  ads: '#8b5cf6',
  superapp: '#f59e0b'
};
const CURRENCY_FLAG_CODE_MAP = {
  uz: 'uz',
  ru: 'ru',
  kz: 'kz',
  tm: 'tm',
  tj: 'tj',
  kg: 'kg',
  af: 'af'
};
const resolveCurrencyFlagSvgUrl = (currencyCode) => {
  const normalized = String(currencyCode || '').trim().toLowerCase();
  const countryCode = CURRENCY_FLAG_CODE_MAP[normalized];
  return countryCode ? `https://flagcdn.com/${countryCode}.svg` : '';
};
const getNextFreeSortOrderClient = (items = [], excludeId = null) => {
  const taken = new Set(
    (Array.isArray(items) ? items : [])
      .filter((item) => excludeId === null || Number(item?.id) !== Number(excludeId))
      .map((item) => Number.parseInt(item?.sort_order, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  let candidate = 1;
  while (taken.has(candidate)) candidate += 1;
  return candidate;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const normalizeOrderRatingValue = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > MAX_ORDER_RATING) return MAX_ORDER_RATING;
  return parsed;
};
const getFileExtensionLower = (filename) => {
  const value = String(filename || '');
  const idx = value.lastIndexOf('.');
  return idx >= 0 ? value.slice(idx).toLowerCase() : '';
};
const validateSpreadsheetImportFile = (file) => {
  if (!file) return 'Файл не выбран';
  const ext = getFileExtensionLower(file.name);
  const mime = String(file.type || '').toLowerCase();
  const size = Number(file.size || 0);
  if (!SPREADSHEET_IMPORT_EXTENSIONS.has(ext) && !SPREADSHEET_IMPORT_MIME_TYPES.has(mime)) {
    return 'Разрешены только .xlsx, .xls или .csv';
  }
  if (size <= 0) {
    return 'Файл пустой';
  }
  if (size > MAX_SPREADSHEET_IMPORT_FILE_SIZE_BYTES) {
    return 'Файл слишком большой (максимум 5 МБ)';
  }
  return '';
};
const normalizeGlobalProductImportNameKey = (value) => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
);
const normalizeSpreadsheetCellText = (value, maxLength = 3000) => (
  String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
);
const toSpreadsheetRowNumber = (index) => (Number(index) + 2);
const parseClipboardTableMatrix = (rawText) => {
  const normalizedText = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = normalizedText
    .split('\n')
    .map((line) => String(line || '').replace(/\u0000/g, ''))
    .filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const delimiters = ['\t', ';', ','];
  let selectedDelimiter = '\t';
  let bestScore = -1;
  for (const delimiter of delimiters) {
    const score = lines.reduce((acc, line) => acc + (line.split(delimiter).length - 1), 0);
    if (score > bestScore) {
      bestScore = score;
      selectedDelimiter = delimiter;
    }
  }

  return lines.map((line) => line.split(selectedDelimiter).map((cell) => String(cell || '').trim()));
};
const isGlobalProductsPasteHeaderRow = (cells = []) => {
  const joined = String((cells || []).join(' ') || '').toLowerCase();
  if (!joined) return false;
  return (
    joined.includes('название')
    || joined.includes('name')
    || joined.includes('описание')
    || joined.includes('description')
    || joined.includes('штрих')
    || joined.includes('barcode')
    || joined.includes('икпу')
    || joined.includes('ikpu')
    || joined.includes('единиц')
    || joined.includes('unit')
    || joined.includes('категор')
    || joined.includes('category')
  );
};
const mapGlobalProductsPasteMatrixRows = (matrix = []) => {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const sourceRows = isGlobalProductsPasteHeaderRow(matrix[0]) ? matrix.slice(1) : matrix;
  const rows = [];

  sourceRows.forEach((cells = [], index) => {
    const normalizedCells = Array.from({ length: 10 }, (_, colIndex) => String(cells[colIndex] || '').trim());
    const hasAnyValue = normalizedCells.some((value) => value !== '');
    if (!hasAnyValue) return;

    rows.push({
      row_no: index + 1,
      name_ru: normalizeSpreadsheetCellText(normalizedCells[0], 255),
      name_uz: normalizeSpreadsheetCellText(normalizedCells[1], 255),
      description_ru: normalizeSpreadsheetCellText(normalizedCells[2], 3000),
      description_uz: normalizeSpreadsheetCellText(normalizedCells[3], 3000),
      barcode: normalizeSpreadsheetCellText(normalizedCells[4], 120).replace(/\s+/g, ''),
      ikpu: normalizeSpreadsheetCellText(normalizedCells[5], 64),
      unit: normalizeSpreadsheetCellText(normalizedCells[6], 32) || 'шт',
      category_id_raw: normalizeSpreadsheetCellText(normalizedCells[7], 50),
      category_path_raw: normalizeSpreadsheetCellText(normalizedCells[8], 255),
      category_name_raw: normalizeSpreadsheetCellText(normalizedCells[9], 255)
    });
  });

  return rows;
};
const buildRatingStarsText = (value) => {
  const normalized = normalizeOrderRatingValue(value);
  return `${'★'.repeat(normalized)}${'☆'.repeat(Math.max(0, MAX_ORDER_RATING - normalized))}`;
};
const createEmptyProductReviewAnalytics = () => ({
  period: 'daily',
  date: '',
  startDate: '',
  endDateExclusive: '',
  year: null,
  month: null,
  restaurantId: null,
  summary: {
    totalReviews: 0,
    commentsCount: 0,
    lowRatingCount: 0,
    averageRating: 0,
    ratingBreakdown: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    }
  },
  latestComments: [],
  topProducts: []
});
const ANALYTICS_DEFAULT_MAP_CENTER = [41.311081, 69.240562];
const ANALYTICS_DEFAULT_MAP_ZOOM = 11;
const normalizeOverviewOrderLocation = (point) => {
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    ...point,
    lat,
    lng
  };
};
const getOverviewOrderLocationKey = (point) => (
  String(point?.orderId ?? point?.orderNumber ?? `${point?.lat}:${point?.lng}`)
);
const getOverviewAnalyticsPointIcon = (isActive = false) => L.divIcon({
  className: `analytics-map-point${isActive ? ' is-active' : ''}`,
  html: `<span class="analytics-map-point-badge"><span class="analytics-map-point-emoji">🙋🏻</span></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});
const SuperAdminAnalyticsMapAutoBounds = ({ points = [], selectedPoint = null }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (selectedPoint && Number.isFinite(selectedPoint.lat) && Number.isFinite(selectedPoint.lng)) {
      map.setView([selectedPoint.lat, selectedPoint.lng], Math.max(map.getZoom(), 14), { animate: true, duration: 0.3 });
      return;
    }
    if (!Array.isArray(points) || !points.length) {
      map.setView(ANALYTICS_DEFAULT_MAP_CENTER, ANALYTICS_DEFAULT_MAP_ZOOM, { animate: false });
      return;
    }
    const bounds = points.map((point) => [point.lat, point.lng]);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  }, [map, points, selectedPoint]);

  return null;
};
const SuperAdminAnalyticsMapResizeFix = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    let rafId = null;
    let resizeObserver = null;
    const container = map.getContainer?.();

    const invalidate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try {
          map.invalidateSize({ pan: false, debounceMoveend: true });
        } catch (_) {
          // ignore
        }
      });
    };

    // Initial passes after mount/tab activation animation.
    invalidate();
    const t1 = setTimeout(invalidate, 80);
    const t2 = setTimeout(invalidate, 260);

    const onWindowResize = () => invalidate();
    window.addEventListener('resize', onWindowResize);

    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => invalidate());
      resizeObserver.observe(container);
      if (container.parentElement) resizeObserver.observe(container.parentElement);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', onWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [map]);

  return null;
};
const createShopsClusterPointIcon = (count = 0) => L.divIcon({
  className: 'sa-shops-cluster-icon',
  html: `
    <span class="sa-shops-cluster-badge">
      <span class="sa-shops-cluster-store" aria-hidden="true">🏪</span>
      <span class="sa-shops-cluster-count">${Number(count || 0)}</span>
    </span>
  `,
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});
const getShopsClusterCellSizeByZoom = (zoom) => {
  if (zoom <= 6) return 148;
  if (zoom <= 8) return 126;
  if (zoom <= 10) return 102;
  if (zoom <= 12) return 84;
  return 70;
};
const getMedianValue = (values = []) => {
  const source = Array.isArray(values)
    ? values.filter((item) => Number.isFinite(Number(item))).map((item) => Number(item))
    : [];
  if (!source.length) return 0;
  const sorted = [...source].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};
const SuperAdminShopsClusteredMarkers = ({ points = [], markerIcons = new Map() }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(() => (
    Number.isFinite(map?.getZoom?.()) ? Number(map.getZoom()) : ANALYTICS_DEFAULT_MAP_ZOOM
  ));
  const clusterIconCacheRef = useRef(new Map());

  useMapEvents({
    zoomend: (event) => {
      const nextZoom = Number(event?.target?.getZoom?.());
      if (Number.isFinite(nextZoom)) setZoom(nextZoom);
    }
  });

  useEffect(() => {
    if (!map) return;
    const initialZoom = Number(map.getZoom());
    if (Number.isFinite(initialZoom)) setZoom(initialZoom);
  }, [map]);

  const clusteredItems = useMemo(() => {
    if (!map || !Array.isArray(points) || points.length === 0) return [];
    const safeZoom = Number.isFinite(zoom) ? zoom : Number(map.getZoom()) || ANALYTICS_DEFAULT_MAP_ZOOM;
    const shouldCluster = safeZoom <= 11;
    if (!shouldCluster) {
      return points.map((point) => ({
        type: 'point',
        id: point.id,
        point
      }));
    }
    const cellSize = getShopsClusterCellSizeByZoom(safeZoom);
    const grouped = new Map();

    points.forEach((point) => {
      const projected = map.project([Number(point.lat), Number(point.lng)], safeZoom);
      const cellX = Math.floor(projected.x / cellSize);
      const cellY = Math.floor(projected.y / cellSize);
      const key = `${cellX}:${cellY}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          points: [],
          latSum: 0,
          lngSum: 0
        });
      }
      const bucket = grouped.get(key);
      bucket.points.push(point);
      bucket.latSum += Number(point.lat);
      bucket.lngSum += Number(point.lng);
    });

    return Array.from(grouped.values()).map((bucket) => {
      if (bucket.points.length <= 1) {
        const point = bucket.points[0];
        return {
          type: 'point',
          id: point.id,
          point
        };
      }
      return {
        type: 'cluster',
        id: `cluster:${bucket.key}`,
        count: bucket.points.length,
        lat: bucket.latSum / bucket.points.length,
        lng: bucket.lngSum / bucket.points.length
      };
    });
  }, [map, points, zoom]);

  const resolveClusterIcon = (count) => {
    const normalizedCount = Math.max(2, Number(count || 0));
    if (!clusterIconCacheRef.current.has(normalizedCount)) {
      clusterIconCacheRef.current.set(normalizedCount, createShopsClusterPointIcon(normalizedCount));
    }
    return clusterIconCacheRef.current.get(normalizedCount);
  };

  return (
    <>
      {clusteredItems.map((item) => {
        if (item.type === 'cluster') {
          return (
            <Marker
              key={`shops-map-${item.id}`}
              position={[item.lat, item.lng]}
              icon={resolveClusterIcon(item.count)}
            />
          );
        }
        const point = item.point;
        return (
          <Marker
            key={`shops-map-point-${item.id}`}
            position={[point.lat, point.lng]}
            icon={markerIcons.get(point.id) || getOverviewAnalyticsPointIcon(false)}
          />
        );
      })}
    </>
  );
};

const DataPagination = ({ current, total, limit, onPageChange, limitOptions, onLimitChange }) => {
  const { t } = useLanguage();
  const totalPages = Math.ceil(total / limit);
  if (total === 0) return null;

  let items = [];
  const maxPages = 5;
  let startPage = Math.max(1, current - Math.floor(maxPages / 2));
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  if (endPage - startPage + 1 < maxPages) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }

  if (startPage > 1) {
    items.push(<Pagination.Item key={1} onClick={() => onPageChange(1)}>1</Pagination.Item>);
    if (startPage > 2) items.push(<Pagination.Ellipsis key="ell-1" disabled />);
  }

  for (let number = startPage; number <= endPage; number++) {
    items.push(
      <Pagination.Item
        key={number}
        active={number === current}
        onClick={() => onPageChange(number)}
      >
        {number}
      </Pagination.Item>
    );
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) items.push(<Pagination.Ellipsis key="ell-2" disabled />);
    items.push(<Pagination.Item key={totalPages} onClick={() => onPageChange(totalPages)}>{totalPages}</Pagination.Item>);
  }

  const shownCount = total === 0 ? 0 : Math.min(limit, total - (current - 1) * limit);

  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mt-4 px-2 gap-3" style={{ width: '100%' }}>
      <div className="d-flex align-items-center gap-3">
        {onLimitChange && (
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted font-weight-bold text-primary">{t('saShow')}</span>
            <Form.Select
              size="sm"
              style={{ width: '75px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
              value={limit}
              onChange={(e) => onLimitChange(parseInt(e.target.value))}
            >
              {(limitOptions || [15, 20, 30, 50]).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Form.Select>
          </div>
        )}
        <div className="small text-muted text-nowrap">
          {t('saShown')} {shownCount} {t('saOf')} {total} {t('saRecords')}
        </div>
      </div>
      <Pagination size="sm" className="mb-0 flex-wrap justify-content-center">
        <Pagination.First disabled={current === 1} onClick={() => onPageChange(1)} />
        <Pagination.Prev disabled={current === 1} onClick={() => onPageChange(current - 1)} />
        {items}
        <Pagination.Next disabled={current === totalPages || totalPages === 0} onClick={() => onPageChange(current + 1)} />
        <Pagination.Last disabled={current === totalPages || totalPages === 0} onClick={() => onPageChange(totalPages)} />
      </Pagination>
    </div>
  );
};

const FilterIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DiagnosticsOkIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="m6.5 10.2 2.2 2.3 4.8-5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DiagnosticsErrorIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M7.2 7.2 12.8 12.8M12.8 7.2 7.2 12.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const DiagnosticsWarningIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M9.2 3.3a1 1 0 0 1 1.6 0l6.1 9.1c.45.67-.03 1.58-.84 1.58H3.95c-.81 0-1.29-.91-.84-1.58l6.1-9.1Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 7.2v3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="10" cy="12.9" r=".7" fill="currentColor" />
  </svg>
);

const SearchableRestaurantFilter = ({
  t,
  value,
  onChange,
  restaurants,
  searchValue,
  onSearchChange,
  width = '220px'
}) => {
  const [show, setShow] = useState(false);
  const selectedRestaurant = restaurants.find((restaurant) => String(restaurant.id) === String(value));

  return (
    <Dropdown
      show={show}
      onToggle={(nextShow) => {
        setShow(nextShow);
        if (nextShow) onSearchChange('');
      }}
      autoClose="outside"
      popperConfig={{ strategy: 'fixed' }}
      style={{ width, position: 'relative', zIndex: show ? 1200 : 1 }}
    >
      <Dropdown.Toggle
        variant="light"
        className="form-control-custom w-100 d-flex align-items-center justify-content-between text-start"
        style={{ minHeight: '40px' }}
      >
        <span className="text-truncate">{selectedRestaurant?.name || t('saAllShops')}</span>
      </Dropdown.Toggle>

      <Dropdown.Menu style={{ width, maxHeight: '320px', overflowY: 'auto', zIndex: 1210 }}>
        <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder={t('saSearchShop')}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
        </div>
        <Dropdown.Divider className="my-1" />
        <Dropdown.Item
          active={!value}
          onClick={() => {
            onChange('');
            setShow(false);
          }}
        >
          {t('saAllShops')}
        </Dropdown.Item>
        {restaurants.length === 0 ? (
          <Dropdown.Item disabled>{t('noData')}</Dropdown.Item>
        ) : (
          restaurants.map((restaurant) => (
            <Dropdown.Item
              key={restaurant.id}
              active={String(value) === String(restaurant.id)}
              onClick={() => {
                onChange(String(restaurant.id));
                setShow(false);
              }}
            >
              {restaurant.name}
            </Dropdown.Item>
          ))
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};

const CustomSelectDropdown = ({
  value,
  onChange,
  options = [],
  placeholder = 'Выберите',
  disabled = false,
  searchable = false,
  searchValue = '',
  onSearchChange = () => {},
  searchPlaceholder = 'Поиск...',
  clearLabel = '',
  noDataLabel = 'Нет данных',
  menuClassName = '',
  toggleClassName = 'form-control-custom',
  toggleStyle = { minHeight: '40px' }
}) => {
  const [show, setShow] = useState(false);
  const selectedOption = options.find((item) => String(item.value) === String(value));

  return (
    <Dropdown
      show={show && !disabled}
      onToggle={(nextShow) => setShow(disabled ? false : nextShow)}
      autoClose="outside"
      className="w-100"
      popperConfig={{ strategy: 'fixed' }}
    >
      <Dropdown.Toggle
        variant="light"
        className={`${toggleClassName} w-100 d-flex align-items-center justify-content-between text-start`}
        style={toggleStyle}
        disabled={disabled}
      >
        <span className="text-truncate">{selectedOption?.label || placeholder}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className={menuClassName} style={{ width: '100%', maxHeight: '320px', overflowY: 'auto', zIndex: 2100 }}>
        {searchable && (
          <>
            <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <Form.Control
                className="form-control-custom"
                type="search"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                autoFocus
              />
            </div>
            <Dropdown.Divider className="my-1" />
          </>
        )}
        {clearLabel ? (
          <Dropdown.Item
            active={String(value || '') === ''}
            onClick={() => {
              onChange('');
              setShow(false);
            }}
          >
            {clearLabel}
          </Dropdown.Item>
        ) : null}
        {options.length ? (
          options.map((item) => (
            <Dropdown.Item
              key={`custom-select-option-${item.value}`}
              active={String(item.value) === String(value)}
              onClick={() => {
                onChange(item.value);
                setShow(false);
              }}
            >
              {item.label}
            </Dropdown.Item>
          ))
        ) : (
          <Dropdown.Item disabled>{noDataLabel}</Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};

const MiniBarChart = ({
  title,
  rows = [],
  getLabel,
  getValue,
  secondaryValue,
  color = 'linear-gradient(90deg, #475569 0%, #93c5fd 100%)',
  maxItems = 8,
  emptyText = 'Нет данных'
}) => {
  const items = (Array.isArray(rows) ? rows : []).slice(0, maxItems);
  const maxValue = Math.max(1, ...items.map((row) => Number(getValue?.(row) || 0)));

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body>
        <h6 className="mb-3">{title}</h6>
        {items.length === 0 ? (
          <div className="text-muted small py-4 text-center">{emptyText}</div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {items.map((row, idx) => {
              const label = String(getLabel?.(row) || '—');
              const value = Number(getValue?.(row) || 0);
              const percent = Math.max(0, Math.min(100, (value / maxValue) * 100));
              const extra = secondaryValue ? secondaryValue(row) : null;
              return (
                <div key={`${label}-${idx}`}>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                    <div className="small fw-medium text-truncate" title={label}>{label}</div>
                    <div className="small text-muted text-nowrap">
                      {value}
                      {extra ? ` · ${extra}` : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: 'rgba(0,0,0,0.06)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(percent, value > 0 ? 6 : 0)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: color,
                        transition: 'width 200ms ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

const MiniLineChart = ({
  title,
  rows = [],
  xKey = 'day',
  lines = [],
  emptyText = 'Нет данных'
}) => {
  const source = [...(Array.isArray(rows) ? rows : [])].slice(0, 30).reverse();
  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 30, left: 36 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  const values = source.flatMap((row) => lines.map((line) => Number(row?.[line.key] || 0)));
  const maxValue = Math.max(1, ...values);

  const toPoint = (index, value) => {
    const x = pad.left + (source.length <= 1 ? chartWidth / 2 : (index / (source.length - 1)) * chartWidth);
    const y = pad.top + chartHeight - (Number(value || 0) / maxValue) * chartHeight;
    return { x, y };
  };

  const paths = lines.map((line) => {
    const points = source.map((row, idx) => toPoint(idx, row?.[line.key]));
    const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return { ...line, points, d };
  });

  const gridLines = 4;

  return (
    <Card className="border-0 shadow-sm">
      <Card.Body>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-2">
          <h6 className="mb-0">{title}</h6>
          <div className="d-flex flex-wrap gap-2">
            {lines.map((line) => (
              <span key={line.key} className="small text-muted d-inline-flex align-items-center gap-1">
                <span style={{ width: 10, height: 10, borderRadius: 999, background: line.color, display: 'inline-block' }} />
                {line.label}
              </span>
            ))}
          </div>
        </div>
        {source.length === 0 ? (
          <div className="text-muted small py-4 text-center">{emptyText}</div>
        ) : (
          <div>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="220" role="img" aria-label={title}>
              <rect x="0" y="0" width={width} height={height} fill="white" rx="12" />
              {Array.from({ length: gridLines + 1 }).map((_, i) => {
                const y = pad.top + (i / gridLines) * chartHeight;
                const value = Math.round(maxValue - (i / gridLines) * maxValue);
                return (
                  <g key={`g-${i}`}>
                    <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(0,0,0,0.08)" strokeDasharray="4 4" />
                    <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#8a8a8a">{value}</text>
                  </g>
                );
              })}

              {paths.map((path) => (
                <path key={path.key} d={path.d} fill="none" stroke={path.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {paths.map((path) => (
                <g key={`${path.key}-pts`}>
                  {path.points.map((point, idx) => (
                    <circle key={`${path.key}-${idx}`} cx={point.x} cy={point.y} r="2.8" fill={path.color} />
                  ))}
                </g>
              ))}

              {source.map((row, idx) => {
                const { x } = toPoint(idx, 0);
                const raw = row?.[xKey];
                let label = '';
                try {
                  label = raw ? new Date(raw).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '';
                } catch {
                  label = String(raw || '');
                }
                return (
                  <text key={`x-${idx}`} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#8a8a8a">
                    {label}
                  </text>
                );
              })}
            </svg>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const {
    language,
    setLanguage,
    t,
    countryCurrency,
    countryCurrencyOptions
  } = useLanguage();
  const {
    actionButtonsVisible,
    actionButtonsRemainingLabel,
    setActionButtonsVisible
  } = useTimedActionButtonsVisibility();
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState('restaurants');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SUPERADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showMobileAccountSheet, setShowMobileAccountSheet] = useState(false);
  const [showMobileFiltersSheet, setShowMobileFiltersSheet] = useState(false);
  const [showAnalyticsFilterPanel, setShowAnalyticsFilterPanel] = useState(false);
  const [showRestaurantsFilterPanel, setShowRestaurantsFilterPanel] = useState(false);
  const [showActivityTypesFilterPanel, setShowActivityTypesFilterPanel] = useState(false);
  const [showOperatorsFilterPanel, setShowOperatorsFilterPanel] = useState(false);
  const [showCustomersFilterPanel, setShowCustomersFilterPanel] = useState(false);
  const [showAdsFilterPanel, setShowAdsFilterPanel] = useState(false);
  const [showLogsFilterPanel, setShowLogsFilterPanel] = useState(false);
  const [showSecurityFilterPanel, setShowSecurityFilterPanel] = useState(false);
  const superAdminHotkeyTabOrder = useMemo(() => ([
    'analytics',
    'restaurants',
    'global_products',
    'activity_types',
    'reservation_templates',
    'help_instructions',
    'broadcast',
    'operators',
    'customers',
    'categories',
    'ads',
    'billing_transactions',
    'founders',
    'billing',
    'ai_settings',
    'security',
    'logs'
  ]), []);

  // Data
  const [stats, setStats] = useState({});
  const [restaurants, setRestaurants] = useState({ restaurants: [], total: 0 });
  const [allRestaurants, setAllRestaurants] = useState([]); // For filters
  const [operators, setOperators] = useState({ operators: [], total: 0 });
  const [allOperators, setAllOperators] = useState([]); // For filters
  const [isHiddenOpsTelemetryEnabled, setIsHiddenOpsTelemetryEnabled] = useState(false);
  const [hiddenOpsTelemetryExpiresAt, setHiddenOpsTelemetryExpiresAt] = useState(null);
  const [hiddenOpsTelemetrySecondsLeft, setHiddenOpsTelemetrySecondsLeft] = useState(0);
  const [showHiddenOpsConsole, setShowHiddenOpsConsole] = useState(false);
  const [hiddenOpsConsoleStage, setHiddenOpsConsoleStage] = useState(0);
  const [hiddenOpsConsoleInput, setHiddenOpsConsoleInput] = useState('');
  const [hiddenOpsConsoleHistory, setHiddenOpsConsoleHistory] = useState([
    'Console initialized. Type "help" for commands.'
  ]);
  const [operatorTelemetryFilter, setOperatorTelemetryFilter] = useState({
    ip: '',
    browser: '',
    os: '',
    device: ''
  });
  const [customerTelemetryFilter, setCustomerTelemetryFilter] = useState({
    ip: '',
    browser: '',
    os: '',
    device: ''
  });
  const [customers, setCustomers] = useState({ customers: [], total: 0 });
  const [superadminBroadcastForm, setSuperadminBroadcastForm] = useState(createInitialSuperadminBroadcastForm);
  const [showSuperadminBroadcastModal, setShowSuperadminBroadcastModal] = useState(false);
  const [superadminBroadcastUploading, setSuperadminBroadcastUploading] = useState(false);
  const [superadminBroadcastSending, setSuperadminBroadcastSending] = useState(false);
  const [superadminBroadcastResult, setSuperadminBroadcastResult] = useState(null);
  const [superadminBroadcastHistory, setSuperadminBroadcastHistory] = useState([]);
  const [superadminBroadcastHistoryLoading, setSuperadminBroadcastHistoryLoading] = useState(false);
  const [logs, setLogs] = useState({ logs: [], total: 0 });
  const [securityEventsData, setSecurityEventsData] = useState({ events: [], total: 0, page: 1, limit: 20 });
  const [securityStats, setSecurityStats] = useState({
    overview: {
      total: 0,
      open_total: 0,
      high_total: 0,
      total_24h: 0,
      open_24h: 0,
      high_24h: 0,
      total_7d: 0
    },
    top_sources_24h: [],
    by_type_24h: [],
    by_risk_24h: []
  });
  const [securityEventsLoading, setSecurityEventsLoading] = useState(false);
  const [securityStatsLoading, setSecurityStatsLoading] = useState(false);
  const [securityEventStatusUpdatingId, setSecurityEventStatusUpdatingId] = useState(null);
  const [securityDetailsRevealMap, setSecurityDetailsRevealMap] = useState({});
  const [activityTypes, setActivityTypes] = useState([]);
  const [activityTypesLoading, setActivityTypesLoading] = useState(false);
  const [showActivityTypeModal, setShowActivityTypeModal] = useState(false);
  const [activityTypeForm, setActivityTypeForm] = useState({ name: '', sort_order: '', is_visible: true });
  const [activityTypeSearchFilter, setActivityTypeSearchFilter] = useState('');
  const [activityTypeVisibilityFilter, setActivityTypeVisibilityFilter] = useState('all');
  const [editingActivityType, setEditingActivityType] = useState(null);
  const [savingActivityType, setSavingActivityType] = useState(false);
  const [helpInstructions, setHelpInstructions] = useState([]);
  const [helpInstructionsLoading, setHelpInstructionsLoading] = useState(false);
  const [helpInstructionForm, setHelpInstructionForm] = useState(createEmptyHelpInstructionForm);
  const [showHelpInstructionModal, setShowHelpInstructionModal] = useState(false);
  const [savingHelpInstruction, setSavingHelpInstruction] = useState(false);
  const [deletingHelpInstructionId, setDeletingHelpInstructionId] = useState(null);
  const [reservationTemplates, setReservationTemplates] = useState([]);
  const [reservationTemplatesLoading, setReservationTemplatesLoading] = useState(false);
  const [showReservationTemplateModal, setShowReservationTemplateModal] = useState(false);
  const [reservationTemplateForm, setReservationTemplateForm] = useState(createEmptyReservationTemplateForm);
  const [savingReservationTemplate, setSavingReservationTemplate] = useState(false);
  const [deletingReservationTemplateId, setDeletingReservationTemplateId] = useState(null);

  // Categories
  const [categories, setCategories] = useState([]);
  const [categoryLevels, setCategoryLevels] = useState(() => Array(CATEGORY_LEVEL_COUNT).fill(null));
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: null, name_ru: '', name_uz: '', image_url: '', sort_order: 0, parent_id: null });
  const [editingLevel, setEditingLevel] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [categoryAiMode, setCategoryAiMode] = useState('');
  const [categoryAiLoading, setCategoryAiLoading] = useState(false);
  const [categoryAiError, setCategoryAiError] = useState('');
  const [isImportingCategories, setIsImportingCategories] = useState(false);
  const [globalProducts, setGlobalProducts] = useState({ items: [], total: 0, page: 1, limit: 15 });
  const [globalProductsLoading, setGlobalProductsLoading] = useState(false);
  const [isImportingGlobalProductsExcel, setIsImportingGlobalProductsExcel] = useState(false);
  const [isApplyingGlobalProductsExcelImport, setIsApplyingGlobalProductsExcelImport] = useState(false);
  const [isGlobalImportReviewScrolling, setIsGlobalImportReviewScrolling] = useState(false);
  const [showGlobalProductsPasteModal, setShowGlobalProductsPasteModal] = useState(false);
  const [globalProductsPasteRows, setGlobalProductsPasteRows] = useState([]);
  const [globalProductsPasteError, setGlobalProductsPasteError] = useState('');
  const [showGlobalProductsImportReviewModal, setShowGlobalProductsImportReviewModal] = useState(false);
  const [showGlobalProductsImportTemplateModal, setShowGlobalProductsImportTemplateModal] = useState(false);
  const [globalProductsImportRows, setGlobalProductsImportRows] = useState([]);
  const [globalProductsImportSourceFileName, setGlobalProductsImportSourceFileName] = useState('');
  const [globalProductsPage, setGlobalProductsPage] = useState(1);
  const [globalProductsLimit, setGlobalProductsLimit] = useState(15);
  const [globalProductsSearch, setGlobalProductsSearch] = useState('');
  const [globalProductsBarcodeFilter, setGlobalProductsBarcodeFilter] = useState('');
  const [globalProductsStatusFilter, setGlobalProductsStatusFilter] = useState('active');
  const [globalProductsCategoryLevel1Filter, setGlobalProductsCategoryLevel1Filter] = useState('all');
  const [globalProductsCategoryLevel2Filter, setGlobalProductsCategoryLevel2Filter] = useState('all');
  const [globalProductsCategoryLevel3Filter, setGlobalProductsCategoryLevel3Filter] = useState('all');
  const [showGlobalProductsFilterPanel, setShowGlobalProductsFilterPanel] = useState(false);
  const [showGlobalProductModal, setShowGlobalProductModal] = useState(false);
  const [globalProductForm, setGlobalProductForm] = useState(createEmptyGlobalProductForm);
  const [globalProductCategorySearch, setGlobalProductCategorySearch] = useState({
    level1: '',
    level2: '',
    level3: ''
  });
  const [editingGlobalProduct, setEditingGlobalProduct] = useState(null);
  const [savingGlobalProduct, setSavingGlobalProduct] = useState(false);
  const [globalProductAiPreviewUrl, setGlobalProductAiPreviewUrl] = useState('');
  const [globalProductAiMode, setGlobalProductAiMode] = useState('');
  const [globalProductAiLoading, setGlobalProductAiLoading] = useState(false);
  const [globalProductAiError, setGlobalProductAiError] = useState('');
  const [globalProductTextLoading, setGlobalProductTextLoading] = useState(false);
  const categoryImportInputRef = useRef(null);
  const globalProductsImportInputRef = useRef(null);
  const globalProductsPasteInputRef = useRef(null);
  const globalImportReviewScrollHideTimeoutRef = useRef(null);
  const globalProductImageInputRef = useRef(null);
  const categoryAiRequestIdRef = useRef(0);
  const globalProductAiRequestIdRef = useRef(0);
  const hiddenOpsConsoleInputRef = useRef(null);
  const hiddenOpsHotkeyLastPressedRef = useRef(0);
  const superadminBroadcastFileInputRef = useRef(null);
  const foundersPasswordInputRef = useRef(null);

  // Modals
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [editingOperator, setEditingOperator] = useState(null);

  // Forms
  const [restaurantForm, setRestaurantForm] = useState({
    name: '',
    address: '',
    phone: '',
    activity_type_id: '',
    logo_url: '',
    logo_display_mode: 'square',
    delivery_zone: null,
    telegram_bot_token: '',
    telegram_group_id: '',
    operator_registration_code: '',
    start_time: '',
    end_time: '',
    click_url: '',
    payme_url: '',
    payme_enabled: false,
    payme_merchant_id: '',
    payme_api_login: '',
    payme_api_password: '',
    payme_account_key: 'order_id',
    payme_test_mode: false,
    payme_callback_timeout_ms: 2000,
    currency_code: 'uz',
    support_username: '',
    service_fee: 1000,
    reservation_cost: 0,
    reservation_enabled: false,
    size_variants_enabled: false,
    latitude: '',
    longitude: '',
    delivery_base_radius: 3,
    delivery_base_price: 5000,
    delivery_price_per_km: 1000,
    is_delivery_enabled: true
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [operatorForm, setOperatorForm] = useState({
    username: '', password: '', full_name: '', phone: '', restaurant_ids: []
  });
  const [showOperatorStoresModal, setShowOperatorStoresModal] = useState(false);
  const [operatorStoresModalPayload, setOperatorStoresModalPayload] = useState({ operatorName: '', restaurants: [] });

  // Filters
  const [restaurantsPage, setRestaurantsPage] = useState(1);
  const [restaurantsLimit, setRestaurantsLimit] = useState(15);
  const [restaurantsNameFilter, setRestaurantsNameFilter] = useState('');
  const [restaurantsStatusFilter, setRestaurantsStatusFilter] = useState('');
  const [restaurantsSelectFilter, setRestaurantsSelectFilter] = useState('');
  const [restaurantsSelectSearch, setRestaurantsSelectSearch] = useState('');
  const [restaurantsActivityTypeFilter, setRestaurantsActivityTypeFilter] = useState('');
  const [restaurantsCreatedFromFilter, setRestaurantsCreatedFromFilter] = useState('');
  const [restaurantsCreatedToFilter, setRestaurantsCreatedToFilter] = useState('');
  const [restaurantsTariffFilter, setRestaurantsTariffFilter] = useState('');
  const [restaurantsProblemsFilter, setRestaurantsProblemsFilter] = useState('');
  const [restaurantsProductsFilter, setRestaurantsProductsFilter] = useState('');
  const [operatorsPage, setOperatorsPage] = useState(1);
  const [operatorsLimit, setOperatorsLimit] = useState(15);
  const [operatorSearch, setOperatorSearch] = useState('');
  const [operatorRoleFilter, setOperatorRoleFilter] = useState('');
  const [operatorStatusFilter, setOperatorStatusFilter] = useState('');
  const [operatorRestaurantFilter, setOperatorRestaurantFilter] = useState('');
  const [operatorRestaurantSearch, setOperatorRestaurantSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerLimit, setCustomerLimit] = useState(15);
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [customerRestaurantFilter, setCustomerRestaurantFilter] = useState('');
  const [customerRestaurantSearch, setCustomerRestaurantSearch] = useState('');
  const [logsFilter, setLogsFilter] = useState({
    action_type: '', entity_type: '', restaurant_id: '', user_id: '', user_role: '', start_date: '', end_date: '', page: 1, limit: 15
  });
  const [securityFilter, setSecurityFilter] = useState({
    event_type: '',
    risk_level: '',
    status: 'open',
    source_ip: '',
    search: '',
    start_date: '',
    end_date: '',
    page: 1,
    limit: 20
  });
  const [billingOpsFilter, setBillingOpsFilter] = useState({
    restaurant_id: '',
    type: '',
    search: '',
    start_date: '',
    end_date: '',
    page: 1,
    limit: 20
  });
  const [billingOpsData, setBillingOpsData] = useState({ transactions: [], total: 0 });
  const [billingOpsLoading, setBillingOpsLoading] = useState(false);
  const [showBillingOpsFilterPanel, setShowBillingOpsFilterPanel] = useState(false);
  const [billingOpsRestaurantSearch, setBillingOpsRestaurantSearch] = useState('');
  const [hiddenOpsInsights, setHiddenOpsInsights] = useState(null);
  const [hiddenOpsInsightsLoading, setHiddenOpsInsightsLoading] = useState(false);
  const [hiddenOpsInsightsError, setHiddenOpsInsightsError] = useState('');
  const [hiddenOpsInsightsHours, setHiddenOpsInsightsHours] = useState(24);
  const [foundersAnalyticsFilter, setFoundersAnalyticsFilter] = useState({
    start_date: '',
    end_date: ''
  });
  const [foundersAnalyticsData, setFoundersAnalyticsData] = useState(createInitialFoundersAnalyticsState);
  const [foundersAnalyticsLoading, setFoundersAnalyticsLoading] = useState(false);
  const [foundersAccessPassword, setFoundersAccessPassword] = useState('');
  const [foundersPasswordInput, setFoundersPasswordInput] = useState('');
  const [showFoundersAccessModal, setShowFoundersAccessModal] = useState(false);
  const [foundersAccessGranted, setFoundersAccessGranted] = useState(false);
  const [foundersAccessError, setFoundersAccessError] = useState('');
  const [foundersChartsCurrency, setFoundersChartsCurrency] = useState('');
  const [foundersExpandedModulesMap, setFoundersExpandedModulesMap] = useState({});
  const [foundersInnerTab, setFoundersInnerTab] = useState('analytics');
  const [organizationExpenseCategories, setOrganizationExpenseCategories] = useState([]);
  const [organizationExpenseCategoriesLoading, setOrganizationExpenseCategoriesLoading] = useState(false);
  const [organizationExpensesData, setOrganizationExpensesData] = useState({
    items: [],
    totals_by_currency: [],
    total: 0,
    page: 1,
    limit: 200
  });
  const [organizationExpensesFilter, setOrganizationExpensesFilter] = useState({
    category_id: '',
    currency_code: '',
    search: '',
    page: 1,
    limit: 200
  });
  const [organizationExpensesLoading, setOrganizationExpensesLoading] = useState(false);
  const [showOrganizationExpenseModal, setShowOrganizationExpenseModal] = useState(false);
  const [organizationExpenseForm, setOrganizationExpenseForm] = useState(createInitialOrganizationExpenseForm);
  const [organizationExpenseCategorySearch, setOrganizationExpenseCategorySearch] = useState('');
  const [organizationExpenseSubmitting, setOrganizationExpenseSubmitting] = useState(false);
  const [showExpenseCategoryModal, setShowExpenseCategoryModal] = useState(false);
  const [expenseCategoryForm, setExpenseCategoryForm] = useState(createInitialExpenseCategoryForm);
  const [expenseCategorySubmitting, setExpenseCategorySubmitting] = useState(false);

  // Customer order history modal
  const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState({ orders: [], total: 0 });
  const [orderHistoryPage, setOrderHistoryPage] = useState(1);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Order detail modal
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Message templates modal
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [messagesRestaurant, setMessagesRestaurant] = useState(null);
  const [messagesForm, setMessagesForm] = useState({
    msg_new: '',
    msg_preparing: '',
    msg_delivering: '',
    msg_delivered: '',
    msg_cancelled: ''
  });
  const [savingMessages, setSavingMessages] = useState(false);
  const [showRestaurantCommentModal, setShowRestaurantCommentModal] = useState(false);
  const [commentRestaurant, setCommentRestaurant] = useState(null);
  const [restaurantCommentDraft, setRestaurantCommentDraft] = useState('');
  const [restaurantCommentChecklist, setRestaurantCommentChecklist] = useState([]);
  const [savingRestaurantComment, setSavingRestaurantComment] = useState(false);
  const [showRestaurantIssuesModal, setShowRestaurantIssuesModal] = useState(false);
  const [restaurantIssuesTarget, setRestaurantIssuesTarget] = useState(null);
  const [restaurantIssuesData, setRestaurantIssuesData] = useState(null);
  const [restaurantIssuesLoading, setRestaurantIssuesLoading] = useState(false);
  const [restaurantIssueCountMap, setRestaurantIssueCountMap] = useState({});

  // Billing settings
  const [billingSettings, setBillingSettings] = useState({
    superadmin_bot_token: '',
    superadmin_bot_name: '',
    superadmin_bot_username: '',
    superadmin_telegram_id: '',
    card_number: '',
    card_holder: '',
    phone_number: '',
    telegram_username: '',
    click_link: '',
    payme_link: '',
    catalog_animation_season: 'off',
    ai_enabled: true,
    default_starting_balance: 100000,
    default_order_cost: 1000
  });
  const [aiProviders, setAiProviders] = useState([]);
  const [aiProvidersLoading, setAiProvidersLoading] = useState(false);
  const [aiProviderSavingId, setAiProviderSavingId] = useState(null);
  const [aiProviderDeletingId, setAiProviderDeletingId] = useState(null);
  const [aiProviderTestingId, setAiProviderTestingId] = useState(null);
  const [aiUsageDays, setAiUsageDays] = useState(30);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [aiUsageSummary, setAiUsageSummary] = useState({
    days: 30,
    totals: {
      total_requests: 0,
      success_requests: 0,
      failed_requests: 0,
      text_requests: 0,
      text_success_requests: 0,
      text_failed_requests: 0,
      image_requests: 0,
      image_success_requests: 0,
      image_failed_requests: 0,
      quota_related_errors: 0,
      estimated_cost_usd: 0,
      text_estimated_cost_usd: 0,
      image_estimated_cost_usd: 0
    },
    by_provider: [],
    recent_errors: []
  });
  const [isCentralTokenVisible, setIsCentralTokenVisible] = useState(false);
  const centralTokenHideTimeoutRef = useRef(null);
  const [isTestingCentralBot, setIsTestingCentralBot] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupRestaurant, setTopupRestaurant] = useState(null);
  const [topupRestaurantSearch, setTopupRestaurantSearch] = useState('');
  const [topupForm, setTopupForm] = useState({ amount: '', description: '' });
  const [topupMode, setTopupMode] = useState('deposit');
  const [topupTransactions, setTopupTransactions] = useState([]);
  const [topupTransactionsLoading, setTopupTransactionsLoading] = useState(false);
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [adBanners, setAdBanners] = useState([]);
  const [adBannersMeta, setAdBannersMeta] = useState({ max_slots: 10, active_now_count: 0 });
  const [adBannersLoading, setAdBannersLoading] = useState(false);
  const [adBannersPage, setAdBannersPage] = useState(1);
  const [adBannersLimit, setAdBannersLimit] = useState(15);
  const [adBannerImageMeta, setAdBannerImageMeta] = useState(null);
  const [adBannerStatusFilter, setAdBannerStatusFilter] = useState('all');
  const [adBannerActivityTypeFilter, setAdBannerActivityTypeFilter] = useState('all');
  const [showAdBannerModal, setShowAdBannerModal] = useState(false);
  const [showAdAnalyticsModal, setShowAdAnalyticsModal] = useState(false);
  const [editingAdBanner, setEditingAdBanner] = useState(null);
  const [analyticsAdBanner, setAnalyticsAdBanner] = useState(null);
  const [adBannerAnalytics, setAdBannerAnalytics] = useState(null);
  const [adBannerAnalyticsLoading, setAdBannerAnalyticsLoading] = useState(false);
  const [adBannerAnalyticsDays, setAdBannerAnalyticsDays] = useState(30);
  const [uploadingAdBannerImage, setUploadingAdBannerImage] = useState(false);
  const [adBannerForm, setAdBannerForm] = useState({
    title: '',
    image_url: '',
    button_text: 'Открыть',
    target_url: '',
    ad_type: 'banner',
    target_activity_type_ids: [],
    slot_order: 1,
    display_seconds: 5,
    transition_effect: 'fade',
    start_at: '',
    end_at: '',
    repeat_days: [],
    is_enabled: true
  });
  const [adPreviewRestaurantId, setAdPreviewRestaurantId] = useState('');
  const [overviewAnalyticsPeriod, setOverviewAnalyticsPeriod] = useState('monthly');
  const [overviewAnalyticsRestaurantId, setOverviewAnalyticsRestaurantId] = useState('');
  const [showOverviewRestaurantPickerModal, setShowOverviewRestaurantPickerModal] = useState(false);
  const [overviewRestaurantSearch, setOverviewRestaurantSearch] = useState('');
  const [overviewAnalyticsTopLimit, setOverviewAnalyticsTopLimit] = useState(10);
  const [showOverviewCompareModal, setShowOverviewCompareModal] = useState(false);
  const [overviewCompareRestaurantSearch, setOverviewCompareRestaurantSearch] = useState('');
  const [overviewComparisonRestaurantIds, setOverviewComparisonRestaurantIds] = useState([]);
  const [overviewComparisonPdfLoading, setOverviewComparisonPdfLoading] = useState(false);
  const [overviewAnalyticsYear, setOverviewAnalyticsYear] = useState(() => new Date().getFullYear());
  const [overviewAnalyticsMonth, setOverviewAnalyticsMonth] = useState(() => new Date().getMonth() + 1);
  const [overviewAnalyticsDate, setOverviewAnalyticsDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [overviewMapProvider, setOverviewMapProvider] = useState(() => getSavedMapProvider());
  const [selectedOverviewOrderLocation, setSelectedOverviewOrderLocation] = useState(null);
  const [overviewMapSelectionLocked, setOverviewMapSelectionLocked] = useState(false);
  const [overviewAnalyticsLoading, setOverviewAnalyticsLoading] = useState(false);
  const [overviewAnalyticsData, setOverviewAnalyticsData] = useState(null);
  const [overviewProductReviewAnalytics, setOverviewProductReviewAnalytics] = useState(() => createEmptyProductReviewAnalytics());
  const [overviewProductReviewAnalyticsLoading, setOverviewProductReviewAnalyticsLoading] = useState(false);
  const [showScamPrankModal, setShowScamPrankModal] = useState(false);
  const [scamPrankSecondsLeft, setScamPrankSecondsLeft] = useState(60);
  const [scamPrankButtonsOrder, setScamPrankButtonsOrder] = useState(['ha', 'yoq']);
  const isDavronSuperadmin = useMemo(() => (
    user?.role === 'superadmin' && String(user?.username || '').trim().toLowerCase() === 'davron'
  ), [user?.role, user?.username]);
  const categoryLookupById = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((item) => {
      map.set(Number(item.id), item);
    });
    return map;
  }, [categories]);
  const getGlobalProductCategoryPathIds = React.useCallback((categoryId) => {
    const normalizedId = Number.parseInt(categoryId, 10);
    if (!Number.isFinite(normalizedId)) return [];

    const path = [];
    const visited = new Set();
    let current = categoryLookupById.get(normalizedId);
    while (current && !visited.has(current.id)) {
      path.unshift(Number(current.id));
      visited.add(current.id);
      if (!current.parent_id) break;
      current = categoryLookupById.get(Number(current.parent_id));
    }
    return path;
  }, [categoryLookupById]);

  const sortCategoryOptions = React.useCallback((source = []) => (
    [...source].sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left?.sort_order))
        ? Number(left.sort_order)
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(right?.sort_order))
        ? Number(right.sort_order)
        : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left?.name_ru || '').localeCompare(String(right?.name_ru || ''), 'ru');
    })
  ), []);
  const globalProductsRootCategoryOptions = useMemo(() => (
    sortCategoryOptions((categories || []).filter((cat) => !cat.parent_id))
  ), [categories, sortCategoryOptions]);
  const globalProductsSubcategoryOptions = useMemo(() => {
    const level1Id = Number.parseInt(globalProductsCategoryLevel1Filter, 10);
    if (!Number.isInteger(level1Id) || level1Id <= 0) return [];
    return sortCategoryOptions((categories || []).filter((cat) => Number(cat.parent_id) === level1Id));
  }, [categories, globalProductsCategoryLevel1Filter, sortCategoryOptions]);
  const globalProductsThirdCategoryOptions = useMemo(() => {
    const level2Id = Number.parseInt(globalProductsCategoryLevel2Filter, 10);
    if (!Number.isInteger(level2Id) || level2Id <= 0) return [];
    return sortCategoryOptions((categories || []).filter((cat) => Number(cat.parent_id) === level2Id));
  }, [categories, globalProductsCategoryLevel2Filter, sortCategoryOptions]);
  const globalImportCategoryPathById = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((category) => {
      const pathIds = getGlobalProductCategoryPathIds(category?.id);
      const pathRu = pathIds
        .map((pathId) => categoryLookupById.get(Number(pathId)))
        .filter(Boolean)
        .map((node) => String(node?.name_ru || node?.name_uz || '').trim())
        .filter(Boolean)
        .join(' > ');
      if (pathRu) {
        map.set(String(category.id), pathRu);
      }
    });
    return map;
  }, [categories, categoryLookupById, getGlobalProductCategoryPathIds]);
  const globalImportCategoryByPath = useMemo(() => {
    const map = new Map();
    for (const category of (categories || [])) {
      const pathRu = String(globalImportCategoryPathById.get(String(category.id)) || '').trim();
      if (!pathRu) continue;
      map.set(pathRu.toLowerCase(), category);
    }
    return map;
  }, [categories, globalImportCategoryPathById]);
  const globalImportCategoryByUniqueName = useMemo(() => {
    const collisions = new Map();
    for (const category of (categories || [])) {
      const key = String(category?.name_ru || category?.name_uz || '').trim().toLowerCase();
      if (!key) continue;
      if (!collisions.has(key)) {
        collisions.set(key, category);
        continue;
      }
      collisions.set(key, null);
    }
    return collisions;
  }, [categories]);

  const resetGlobalProductsFilters = () => {
    setGlobalProductsSearch('');
    setGlobalProductsBarcodeFilter('');
    setGlobalProductsStatusFilter('active');
    setGlobalProductsCategoryLevel1Filter('all');
    setGlobalProductsCategoryLevel2Filter('all');
    setGlobalProductsCategoryLevel3Filter('all');
  };

  const hasActiveGlobalProductsFilters = (
    String(globalProductsSearch || '').trim() !== '' ||
    String(globalProductsBarcodeFilter || '').trim() !== '' ||
    globalProductsStatusFilter !== 'active' ||
    globalProductsCategoryLevel1Filter !== 'all' ||
    globalProductsCategoryLevel2Filter !== 'all' ||
    globalProductsCategoryLevel3Filter !== 'all'
  );
  const globalProductsImportTemplateColumns = useMemo(() => ([
    {
      index: 1,
      header: 'Название (RU)',
      required: true,
      description: language === 'uz' ? 'Mahsulot nomi rus tilida' : 'Название товара на русском',
      sample: 'Шахматы'
    },
    {
      index: 2,
      header: 'Название (UZ)',
      required: false,
      description: language === 'uz' ? 'Mahsulot nomi o‘zbek tilida' : 'Название товара на узбекском',
      sample: 'Shaxmat'
    },
    {
      index: 3,
      header: 'Описание (RU)',
      required: false,
      description: language === 'uz' ? 'Rus tilidagi tavsif' : 'Описание на русском',
      sample: 'Настольная игра'
    },
    {
      index: 4,
      header: 'Описание (UZ)',
      required: false,
      description: language === 'uz' ? 'O‘zbek tilidagi tavsif' : 'Описание на узбекском',
      sample: "Stol o'yini"
    },
    {
      index: 5,
      header: 'Штрихкод',
      required: false,
      description: language === 'uz' ? 'Shtrixkod (raqamlar)' : 'Штрихкод (цифры)',
      sample: '1234567890123'
    },
    {
      index: 6,
      header: 'ИКПУ',
      required: false,
      description: language === 'uz' ? 'IKPU kodi' : 'Код ИКПУ',
      sample: '12345678901234'
    },
    {
      index: 7,
      header: 'Единица',
      required: false,
      description: language === 'uz' ? "O'lchov birligi (bo'sh bo'lsa: шт)" : 'Единица измерения (если пусто: шт)',
      sample: 'шт'
    },
    {
      index: 8,
      header: 'Рекомендуемая категория ID',
      required: false,
      description: language === 'uz' ? 'Kategoriya ID (eng aniq usul)' : 'ID категории (приоритетный способ)',
      sample: '125'
    },
    {
      index: 9,
      header: 'Рекомендуемая категория путь',
      required: false,
      description: language === 'uz' ? 'Kategoriya to‘liq yo‘li (aniq mos kelishi kerak)' : 'Полный путь категории (строгое совпадение)',
      sample: 'Продукты > Бакалея > Шахматы'
    },
    {
      index: 10,
      header: 'Рекомендуемая категория',
      required: false,
      description: language === 'uz' ? 'Kategoriya nomi (faqat noyob nom bo‘lsa)' : 'Название категории (если имя уникальное)',
      sample: 'Шахматы'
    }
  ]), [language]);
  useEffect(() => {
    if (!showGlobalProductsPasteModal) return;
    const timer = setTimeout(() => {
      globalProductsPasteInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [showGlobalProductsPasteModal]);
  const handleGlobalImportReviewScroll = React.useCallback(() => {
    setIsGlobalImportReviewScrolling((prev) => (prev ? prev : true));
    if (globalImportReviewScrollHideTimeoutRef.current) {
      clearTimeout(globalImportReviewScrollHideTimeoutRef.current);
    }
    globalImportReviewScrollHideTimeoutRef.current = setTimeout(() => {
      setIsGlobalImportReviewScrolling(false);
      globalImportReviewScrollHideTimeoutRef.current = null;
    }, 700);
  }, []);

  useEffect(() => () => {
    if (globalImportReviewScrollHideTimeoutRef.current) {
      clearTimeout(globalImportReviewScrollHideTimeoutRef.current);
      globalImportReviewScrollHideTimeoutRef.current = null;
    }
  }, []);
  const dismissScamPrankModal = () => setShowScamPrankModal(false);
  const handleScamPrankButtonsShuffle = () => {
    setScamPrankButtonsOrder((prev) => (prev[0] === 'ha' ? ['yoq', 'ha'] : ['ha', 'yoq']));
  };
  const handleScamPrankChoice = (choice) => {
    const answer = String(choice || '').toLowerCase();
    setShowScamPrankModal(false);
    if (answer === 'ha') {
      setSuccess(language === 'uz' ? 'Davron, Tesla keyinroq :)' : 'Davron, Tesla потом :)');
      return;
    }
    setSuccess(language === 'uz' ? 'Yo‘q ham qabul qilinmadi :)' : 'Даже "нет" не сработало :)');
  };

  // Load data on tab change
  // Auto-hide notifications
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  useEffect(() => {
    if (!isDavronSuperadmin) return;
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(DAVRON_SCAM_PRANK_SESSION_KEY) === '1';
    } catch (error) {
      alreadyShown = false;
    }
    if (alreadyShown) return;

    try {
      sessionStorage.setItem(DAVRON_SCAM_PRANK_SESSION_KEY, '1');
    } catch (error) {
      // ignore session storage errors
    }

    setScamPrankSecondsLeft(60);
    setScamPrankButtonsOrder(Math.random() > 0.5 ? ['ha', 'yoq'] : ['yoq', 'ha']);
    setShowScamPrankModal(true);
  }, [isDavronSuperadmin]);

  useEffect(() => {
    if (!showScamPrankModal) return;
    const timer = setInterval(() => {
      setScamPrankSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [showScamPrankModal]);

  useEffect(() => {
    if (!showScamPrankModal || scamPrankSecondsLeft > 0) return;
    setShowScamPrankModal(false);
    setSuccess(language === 'uz' ? 'Anti-scam prank yakunlandi :)' : 'Анти-скам пранк завершён :)');
  }, [showScamPrankModal, scamPrankSecondsLeft, language]);

  useEffect(() => {
    loadStats();
    loadInternalRestaurants();
    loadActivityTypes();
    loadBillingSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'restaurants') loadRestaurants();
    if (activeTab === 'operators') loadOperators();
    if (activeTab === 'customers') loadCustomers();
    if (activeTab === 'logs') loadLogs();
    if (activeTab === 'security') {
      loadSecurityStats();
    }
    if (activeTab === 'categories') loadCategories();
    if (activeTab === 'activity_types') loadActivityTypes();
    if (activeTab === 'reservation_templates') loadReservationTemplates();
    if (activeTab === 'help_instructions') loadHelpInstructions();
    if (activeTab === 'broadcast') loadSuperadminBroadcastHistory();
    if (activeTab === 'ads') loadAdBanners();
    if (activeTab === 'billing') {
      loadBillingSettings();
    }
    if (activeTab === 'ai_settings') {
      loadBillingSettings();
      loadAiProviders();
      loadAiUsageSummary(aiUsageDays);
    }
    if (activeTab === 'global_products') {
      if (!categories.length) loadCategories();
    }
    if (activeTab === 'founders' && (!foundersAccessGranted || !foundersAccessPassword)) {
      setShowFoundersAccessModal(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    loadOverviewAnalytics();
    loadOverviewProductReviewAnalytics();
  }, [
    activeTab,
    overviewAnalyticsPeriod,
    overviewAnalyticsRestaurantId,
    overviewAnalyticsTopLimit,
    overviewAnalyticsDate,
    overviewAnalyticsYear,
    overviewAnalyticsMonth
  ]);

  useEffect(() => {
    if (activeTab === 'restaurants') loadRestaurants();
  }, [restaurantsPage, restaurantsLimit]);

  useEffect(() => {
    return () => {
      if (centralTokenHideTimeoutRef.current) {
        clearTimeout(centralTokenHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'operators') loadOperators();
  }, [operatorsPage, operatorsLimit, operatorSearch, operatorRoleFilter, operatorStatusFilter, operatorRestaurantFilter]);

  useEffect(() => {
    if (activeTab === 'customers') loadCustomers();
  }, [customerPage, customerLimit, customerSearch, customerStatusFilter, customerRestaurantFilter]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [logsFilter]);

  useEffect(() => {
    if (activeTab === 'security') loadSecurityEvents();
  }, [securityFilter, activeTab]);

  useEffect(() => {
    if (activeTab === 'billing_transactions') loadBillingTransactions();
  }, [activeTab, billingOpsFilter]);

  useEffect(() => {
    if (activeTab !== 'founders') return;
    if (!foundersAccessGranted || !foundersAccessPassword) return;
    loadFoundersAnalytics();
  }, [
    activeTab,
    foundersAccessGranted,
    foundersAccessPassword,
    foundersAnalyticsFilter.start_date,
    foundersAnalyticsFilter.end_date
  ]);
  useEffect(() => {
    if (activeTab !== 'founders') return;
    if (!foundersAccessGranted || !foundersAccessPassword) return;
    loadOrganizationExpenseCategories();
  }, [activeTab, foundersAccessGranted, foundersAccessPassword]);
  useEffect(() => {
    if (activeTab !== 'founders') return;
    if (!foundersAccessGranted || !foundersAccessPassword) return;
    loadOrganizationExpenses();
  }, [
    activeTab,
    foundersAccessGranted,
    foundersAccessPassword,
    foundersAnalyticsFilter.start_date,
    foundersAnalyticsFilter.end_date,
    organizationExpensesFilter.category_id,
    organizationExpensesFilter.currency_code,
    organizationExpensesFilter.search,
    organizationExpensesFilter.page,
    organizationExpensesFilter.limit
  ]);

  useEffect(() => {
    if (!isHiddenOpsTelemetryEnabled) return;
    if (activeTab !== 'logs') return;
    loadHiddenOpsInsights();
  }, [isHiddenOpsTelemetryEnabled, activeTab, hiddenOpsInsightsHours]);

  useEffect(() => {
    if (activeTab === 'ads') loadAdBanners();
  }, [activeTab, adBannerStatusFilter]);

  useEffect(() => {
    if (activeTab !== 'ai_settings') return;
    loadAiUsageSummary(aiUsageDays);
  }, [activeTab, aiUsageDays]);

  useEffect(() => {
    if (activeTab !== 'global_products') return;
    const timer = setTimeout(() => {
      loadGlobalProducts();
    }, 220);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    globalProductsPage,
    globalProductsLimit,
    globalProductsSearch,
    globalProductsBarcodeFilter,
    globalProductsStatusFilter,
    globalProductsCategoryLevel1Filter,
    globalProductsCategoryLevel2Filter,
    globalProductsCategoryLevel3Filter
  ]);

  useEffect(() => {
    setGlobalProductsPage(1);
  }, [
    globalProductsSearch,
    globalProductsBarcodeFilter,
    globalProductsStatusFilter,
    globalProductsCategoryLevel1Filter,
    globalProductsCategoryLevel2Filter,
    globalProductsCategoryLevel3Filter
  ]);

  useEffect(() => {
    if (!showAdAnalyticsModal || !analyticsAdBanner?.id) return;
    loadAdBannerAnalytics(analyticsAdBanner.id, adBannerAnalyticsDays);
  }, [showAdAnalyticsModal, analyticsAdBanner?.id, adBannerAnalyticsDays]);

  useEffect(() => {
    if (!showAdBannerModal) return;
    if (adPreviewRestaurantId) return;
    const sortedRestaurants = [...(Array.isArray(allRestaurants) ? allRestaurants : [])]
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'));
    if (!sortedRestaurants.length) return;
    setAdPreviewRestaurantId(String(sortedRestaurants[0].id));
  }, [showAdBannerModal, adPreviewRestaurantId, allRestaurants]);

  useEffect(() => {
    if (!showHiddenOpsConsole) return;
    const timer = setTimeout(() => {
      hiddenOpsConsoleInputRef.current?.focus();
    }, 40);
    return () => clearTimeout(timer);
  }, [showHiddenOpsConsole]);

  useEffect(() => {
    if (!showFoundersAccessModal) return;
    const timer = setTimeout(() => {
      foundersPasswordInputRef.current?.focus();
    }, 40);
    return () => clearTimeout(timer);
  }, [showFoundersAccessModal]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tagName = String(target?.tagName || '').toLowerCase();
      const isTypingField = target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
      const isCtrlArrowHotkey = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey
        && (event.key === 'ArrowRight' || event.key === 'ArrowLeft');
      if (isCtrlArrowHotkey && !isTypingField) {
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        setActiveTab((prevTab) => {
          if (!superAdminHotkeyTabOrder.length) return prevTab;
          const currentIndex = superAdminHotkeyTabOrder.indexOf(prevTab);
          if (currentIndex === -1) return superAdminHotkeyTabOrder[0];
          const nextIndex = (currentIndex + direction + superAdminHotkeyTabOrder.length) % superAdminHotkeyTabOrder.length;
          return superAdminHotkeyTabOrder[nextIndex];
        });
        return;
      }

      const isCtrlSpaceHotkey = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey
        && (event.code === 'Space' || event.key === ' ');
      if (isCtrlSpaceHotkey && !isTypingField) {
        event.preventDefault();
        navigate('/admin');
        return;
      }

      const isHotkey = event.ctrlKey && event.key === '`';
      if (!isHotkey && !(showHiddenOpsConsole && event.key === 'Escape')) return;

      event.preventDefault();

      if (showHiddenOpsConsole && event.key === 'Escape') {
        setShowHiddenOpsConsole(false);
        return;
      }

      const now = Date.now();
      const elapsed = now - hiddenOpsHotkeyLastPressedRef.current;
      hiddenOpsHotkeyLastPressedRef.current = now;

      if (showHiddenOpsConsole && elapsed < 350) {
        setShowHiddenOpsConsole(false);
        return;
      }

      setShowHiddenOpsConsole((prev) => !prev);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showHiddenOpsConsole, navigate, superAdminHotkeyTabOrder]);

  useEffect(() => {
    if (!isHiddenOpsTelemetryEnabled || !hiddenOpsTelemetryExpiresAt) return;

    const tick = () => {
      const now = Date.now();
      const secondsLeft = Math.max(0, Math.ceil((hiddenOpsTelemetryExpiresAt - now) / 1000));
      setHiddenOpsTelemetrySecondsLeft(secondsLeft);
      if (secondsLeft <= 0) {
        setIsHiddenOpsTelemetryEnabled(false);
        setHiddenOpsTelemetryExpiresAt(null);
        setHiddenOpsConsoleStage(0);
        setHiddenOpsConsoleHistory((prev) => [...prev, 'Timer ended. Hidden telemetry switched OFF.'].slice(-14));
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isHiddenOpsTelemetryEnabled, hiddenOpsTelemetryExpiresAt]);

  useEffect(() => {
    if (isHiddenOpsTelemetryEnabled) return;
    setOperatorTelemetryFilter({ ip: '', browser: '', os: '', device: '' });
    setCustomerTelemetryFilter({ ip: '', browser: '', os: '', device: '' });
    setHiddenOpsInsights(null);
    setHiddenOpsInsightsError('');
  }, [isHiddenOpsTelemetryEnabled]);

  // API calls
  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Load stats error:', err);
    }
  };

  const buildOverviewAnalyticsParams = (restaurantId = overviewAnalyticsRestaurantId) => {
    const params = {
      period: overviewAnalyticsPeriod,
      year: overviewAnalyticsYear,
      top_limit: overviewAnalyticsTopLimit
    };

    if (overviewAnalyticsPeriod === 'daily') {
      params.date = overviewAnalyticsDate;
    } else if (overviewAnalyticsPeriod === 'monthly') {
      params.month = overviewAnalyticsMonth;
    }

    if (restaurantId) {
      params.restaurant_id = restaurantId;
    }

    return params;
  };

  const loadOverviewAnalytics = async () => {
    setOverviewAnalyticsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/analytics/overview`, {
        params: buildOverviewAnalyticsParams()
      });
      setOverviewAnalyticsData(response.data || null);
    } catch (err) {
      console.error('Load overview analytics error:', err);
      setOverviewAnalyticsData(null);
      setError(err.response?.data?.error || 'Ошибка загрузки аналитики');
    } finally {
      setOverviewAnalyticsLoading(false);
    }
  };

  const loadOverviewProductReviewAnalytics = async () => {
    setOverviewProductReviewAnalyticsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/analytics/product-reviews`, {
        params: buildOverviewAnalyticsParams()
      });
      const payload = response.data || {};
      setOverviewProductReviewAnalytics({
        ...createEmptyProductReviewAnalytics(),
        ...payload,
        summary: {
          ...createEmptyProductReviewAnalytics().summary,
          ...(payload.summary || {})
        },
        latestComments: Array.isArray(payload.latestComments) ? payload.latestComments : [],
        topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : []
      });
    } catch (err) {
      console.error('Load product review analytics error:', err);
      setOverviewProductReviewAnalytics(createEmptyProductReviewAnalytics());
    } finally {
      setOverviewProductReviewAnalyticsLoading(false);
    }
  };

  const getOverviewAnalyticsPeriodCaption = () => {
    if (overviewAnalyticsPeriod === 'daily') {
      return overviewAnalyticsDate || '—';
    }
    if (overviewAnalyticsPeriod === 'monthly') {
      return `${monthLongLabels[Math.max(0, Math.min(11, overviewAnalyticsMonth - 1))]} ${overviewAnalyticsYear}`;
    }
    return String(overviewAnalyticsYear || '');
  };

  const toggleOverviewComparisonRestaurant = (restaurantId) => {
    const normalizedId = String(restaurantId);
    setOverviewComparisonRestaurantIds((prev) => {
      if (prev.includes(normalizedId)) {
        return prev.filter((id) => id !== normalizedId);
      }
      if (prev.length >= 3) {
        setError(language === 'uz'
          ? "Taqqoslash uchun ko'pi bilan 3 ta do'kon tanlash mumkin"
          : 'Для сравнения можно выбрать не более 3 магазинов');
        return prev;
      }
      return [...prev, normalizedId];
    });
  };

  const buildComparisonReportHtml = (reports, generatedAtLabel) => {
    const periodCaption = escapeHtml(getOverviewAnalyticsPeriodCaption());
    const cards = reports.map((payload) => {
      const kpis = payload?.kpis || {};
      const status = payload?.statusSummary || {};
      const funnel = payload?.funnel || {};
      const restaurantName = payload?.restaurant?.name || '—';
      const startCount = Number(funnel.startedUsers || 0);
      const orderCount = Number(funnel.registeredWithOrderUsers || 0);
      const startToOrder = startCount > 0 ? ((orderCount / startCount) * 100).toFixed(1) : '0.0';

      return `
        <section class="cmp-store-card">
          <div class="cmp-store-head">
            <h2>${escapeHtml(restaurantName)}</h2>
            <span>Период: ${periodCaption}</span>
          </div>
          <div class="cmp-kpi-grid">
            <div class="cmp-kpi"><b>${Math.round(Number(kpis.revenue || 0)).toLocaleString('ru-RU')}</b><small>Выручка, ${t('sum')}</small></div>
            <div class="cmp-kpi"><b>${Number(kpis.ordersCount || 0).toLocaleString('ru-RU')}</b><small>Заказы (доставлено)</small></div>
            <div class="cmp-kpi"><b>${Math.round(Number(kpis.averageCheck || 0)).toLocaleString('ru-RU')}</b><small>Средний чек, ${t('sum')}</small></div>
            <div class="cmp-kpi"><b>${Math.round(Number(kpis.serviceRevenue || 0)).toLocaleString('ru-RU')}</b><small>Сервис, ${t('sum')}</small></div>
            <div class="cmp-kpi"><b>${Math.round(Number(kpis.containersRevenue || 0)).toLocaleString('ru-RU')}</b><small>Фасовка, ${t('sum')}</small></div>
            <div class="cmp-kpi"><b>${startToOrder}%</b><small>Start -> Заказ</small></div>
          </div>
          <div class="cmp-row">
            <div class="cmp-block">
              <h3>Статусы заказов</h3>
              <table>
                <tbody>
                  <tr><td>Новые</td><td>${Number(status.new || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Принятые</td><td>${Number(status.accepted || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Готовится</td><td>${Number(status.preparing || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Доставляется</td><td>${Number(status.delivering || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Доставлено</td><td>${Number(status.delivered || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Отказано</td><td>${Number(status.cancelled || 0).toLocaleString('ru-RU')}</td></tr>
                </tbody>
              </table>
            </div>
            <div class="cmp-block">
              <h3>Воронка Telegram</h3>
              <table>
                <tbody>
                  <tr><td>/start</td><td>${Number(funnel.startedUsers || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Язык</td><td>${Number(funnel.languageSelectedUsers || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Телефон</td><td>${Number(funnel.contactSharedUsers || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>Регистрация (/start)</td><td>${Number(funnel.registrationCompletedUsers || 0).toLocaleString('ru-RU')}</td></tr>
                  <tr><td>С заказом (/start)</td><td>${Number(funnel.registeredWithOrderUsers || 0).toLocaleString('ru-RU')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      `;
    }).join('');

    return `
      <div class="cmp-report-root">
        <style>
          .cmp-report-root { width: 1040px; padding: 28px; background: linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%); color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
          .cmp-title { margin: 0 0 14px 0; font-size: 30px; font-weight: 800; letter-spacing: .2px; }
          .cmp-subtitle { margin: 0 0 24px 0; font-size: 14px; color:#475569; }
          .cmp-store-card { background: #fff; border:1px solid #dbe4ef; border-radius: 16px; padding: 16px; margin-bottom: 18px; box-shadow: 0 12px 28px rgba(15,23,42,.06); }
          .cmp-store-head { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; margin-bottom:12px; }
          .cmp-store-head h2 { margin:0; font-size: 21px; font-weight: 800; }
          .cmp-store-head span { font-size: 12px; color:#64748b; }
          .cmp-kpi-grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; margin-bottom:12px; }
          .cmp-kpi { border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc; padding:10px 12px; }
          .cmp-kpi b { font-size: 18px; display:block; line-height:1.2; }
          .cmp-kpi small { display:block; margin-top:3px; color:#64748b; font-size:11px; }
          .cmp-row { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
          .cmp-block { border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px; }
          .cmp-block h3 { margin:0 0 8px 0; font-size:13px; font-weight:700; color:#1e293b; text-transform: uppercase; letter-spacing: .4px; }
          .cmp-block table { width:100%; border-collapse: collapse; }
          .cmp-block td { padding:4px 0; border-bottom:1px dashed #e2e8f0; font-size:12px; }
          .cmp-block td:last-child { text-align:right; font-weight:700; }
          .cmp-block tr:last-child td { border-bottom:0; }
        </style>
        <h1 class="cmp-title">Сравнение магазинов</h1>
        <p class="cmp-subtitle">Сформировано: ${escapeHtml(generatedAtLabel)} | Период: ${periodCaption}</p>
        ${cards}
      </div>
    `;
  };

  const handleExportOverviewComparisonPdf = async () => {
    if (overviewComparisonRestaurantIds.length < 2) {
      setError(language === 'uz'
        ? "PDF uchun kamida 2 ta do'kon tanlang"
        : 'Для PDF-сравнения выберите минимум 2 магазина');
      return;
    }
    setOverviewComparisonPdfLoading(true);
    try {
      const [{ default: html2canvasLib }, { jsPDF: JsPdfCtor }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const baseParams = buildOverviewAnalyticsParams('');
      const requests = overviewComparisonRestaurantIds.slice(0, 3).map((restaurantId) => (
        axios.get(`${API_URL}/superadmin/analytics/overview`, {
          params: { ...baseParams, restaurant_id: restaurantId }
        })
      ));
      const responses = await Promise.all(requests);
      const reports = responses.map((response) => response?.data).filter(Boolean);
      if (!reports.length) {
        throw new Error('Нет данных для отчёта');
      }

      const reportHost = document.createElement('div');
      reportHost.style.position = 'fixed';
      reportHost.style.left = '-10000px';
      reportHost.style.top = '0';
      reportHost.style.zIndex = '-1';
      reportHost.innerHTML = buildComparisonReportHtml(
        reports,
        new Date().toLocaleString('ru-RU')
      );
      document.body.appendChild(reportHost);

      const canvas = await html2canvasLib(reportHost, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc'
      });
      document.body.removeChild(reportHost);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new JsPdfCtor('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let renderedHeight = 0;
      let pageIndex = 0;

      while (renderedHeight < imgHeight) {
        if (pageIndex > 0) pdf.addPage();
        const yOffset = margin - renderedHeight;
        pdf.addImage(imgData, 'PNG', margin, yOffset, imgWidth, imgHeight);
        renderedHeight += (pageHeight - margin * 2);
        pageIndex += 1;
      }

      const filenameDate = new Date().toISOString().slice(0, 10);
      pdf.save(`shops-comparison-${filenameDate}.pdf`);
      setSuccess(language === 'uz'
        ? 'PDF hisobot yuklab olindi'
        : 'PDF-отчёт успешно сформирован');
    } catch (err) {
      console.error('Comparison PDF export error:', err);
      setError(err.response?.data?.error || err.message || 'Ошибка формирования PDF');
    } finally {
      setOverviewComparisonPdfLoading(false);
    }
  };

  const loadRestaurants = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants`, {
        params: { page: restaurantsPage, limit: restaurantsLimit }
      });
      const data = Array.isArray(response.data)
        ? { restaurants: response.data, total: response.data.length }
        : response.data;
      setRestaurants(data);
    } catch (err) {
      setError('Ошибка загрузки магазинов');
    } finally {
      setLoading(false);
    }
  };

  const loadInternalRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants`, {
        params: { limit: 1000 } // Load all for filters
      });
      // Handle both formats: [r1, r2] or { restaurants: [r1, r2] }
      const restaurantData = Array.isArray(response.data) ? response.data : (response.data?.restaurants || []);
      setAllRestaurants(restaurantData);

      const opResponse = await axios.get(`${API_URL}/superadmin/operators`, {
        params: { limit: 1000 }
      });
      const operatorData = Array.isArray(opResponse.data) ? opResponse.data : (opResponse.data?.operators || []);
      setAllOperators(operatorData);
    } catch (err) {
      console.error('Load filter data error:', err);
    }
  };

  const loadActivityTypes = async () => {
    setActivityTypesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/activity-types`, {
        params: { include_hidden: true }
      });
      setActivityTypes(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Load activity types error:', err);
      if (activeTab === 'activity_types') {
        setError('Ошибка загрузки видов деятельности');
      }
    } finally {
      setActivityTypesLoading(false);
    }
  };

  const loadReservationTemplates = async () => {
    setReservationTemplatesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/reservation-table-templates`);
      setReservationTemplates(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Load reservation templates error:', err);
      if (activeTab === 'reservation_templates') {
        setError(language === 'uz' ? "Element shablonlarini yuklab bo'lmadi" : 'Ошибка загрузки шаблонов элементов');
      }
    } finally {
      setReservationTemplatesLoading(false);
    }
  };

  const openReservationTemplateModal = (template = null) => {
    if (!template) {
      setReservationTemplateForm(createEmptyReservationTemplateForm());
      setShowReservationTemplateModal(true);
      return;
    }
    setReservationTemplateForm({
      id: template.id,
      name: String(template.name || '').trim(),
      shape: String(template.shape || 'custom').trim().toLowerCase() || 'custom',
      furniture_category: String(template.furniture_category || 'tables_chairs').trim().toLowerCase() || 'tables_chairs',
      activity_type_id: template.activity_type_id ? String(template.activity_type_id) : '',
      seats_count: Number.parseInt(template.seats_count, 10) || 2,
      width: Number.parseFloat(template.width) || 1,
      height: Number.parseFloat(template.height) || 1,
      image_url: String(template.image_url || '').trim()
    });
    setShowReservationTemplateModal(true);
  };

  const closeReservationTemplateModal = () => {
    setShowReservationTemplateModal(false);
    setReservationTemplateForm(createEmptyReservationTemplateForm());
  };

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });

  const handleReservationTemplateImageSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const mime = String(file.type || '').toLowerCase();
    const filename = String(file.name || '').toLowerCase();
    const isAllowed = mime.startsWith('image/')
      || filename.endsWith('.png')
      || filename.endsWith('.svg')
      || filename.endsWith('.webp');
    if (!isAllowed) {
      setError(language === 'uz' ? 'PNG/SVG rasm yuklang' : 'Загрузите PNG/SVG изображение');
      return;
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      setError(language === 'uz' ? 'Rasm hajmi 12MB dan oshmasligi kerak' : 'Размер изображения не должен превышать 12MB');
      return;
    }
    setError('');
    setUploadingImage(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!/^data:image\//i.test(dataUrl)) {
        throw new Error('invalid-data-url');
      }
      setReservationTemplateForm((prev) => ({ ...prev, image_url: dataUrl }));
    } catch (_) {
      setError(language === 'uz' ? "Rasmni o'qib bo'lmadi" : 'Не удалось прочитать изображение');
    } finally {
      setUploadingImage(false);
    }
  };

  const saveReservationTemplate = async () => {
    const payload = {
      name: String(reservationTemplateForm.name || '').trim(),
      shape: String(reservationTemplateForm.shape || 'custom').trim().toLowerCase(),
      furniture_category: String(reservationTemplateForm.furniture_category || 'tables_chairs').trim().toLowerCase() || 'tables_chairs',
      activity_type_id: reservationTemplateForm.activity_type_id ? (Number.parseInt(reservationTemplateForm.activity_type_id, 10) || null) : null,
      seats_count: Math.max(1, Number.parseInt(reservationTemplateForm.seats_count, 10) || 1),
      width: Math.max(0.2, Number.parseFloat(String(reservationTemplateForm.width).replace(',', '.')) || 1),
      height: Math.max(0.2, Number.parseFloat(String(reservationTemplateForm.height).replace(',', '.')) || 1),
      image_url: String(reservationTemplateForm.image_url || '').trim()
    };
    if (!payload.name) {
      setError(language === 'uz' ? 'Element nomini kiriting' : 'Введите название элемента');
      return;
    }
    if (!payload.image_url) {
      setError(language === 'uz' ? 'PNG/SVG rasmni fayldan yuklang' : 'Загрузите PNG/SVG изображение из файла');
      return;
    }

    setSavingReservationTemplate(true);
    try {
      if (reservationTemplateForm.id) {
        await axios.put(`${API_URL}/superadmin/reservation-table-templates/${reservationTemplateForm.id}`, payload);
      } else {
        await axios.post(`${API_URL}/superadmin/reservation-table-templates`, payload);
      }
      setSuccess(language === 'uz' ? "Element shabloni saqlandi" : 'Шаблон элемента сохранен');
      closeReservationTemplateModal();
      await loadReservationTemplates();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? "Shablonni saqlab bo'lmadi" : 'Ошибка сохранения шаблона'));
    } finally {
      setSavingReservationTemplate(false);
    }
  };

  const deleteReservationTemplate = async (template) => {
    if (!template || !template.id) return;
    const confirmText = language === 'uz'
      ? `"${template.name}" shablonini o'chirasizmi?`
      : `Удалить шаблон "${template.name}"?`;
    if (!window.confirm(confirmText)) return;

    setDeletingReservationTemplateId(template.id);
    try {
      await axios.delete(`${API_URL}/superadmin/reservation-table-templates/${template.id}`);
      setSuccess(language === 'uz' ? "Shablon o'chirildi" : 'Шаблон удален');
      await loadReservationTemplates();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? "Shablonni o'chirib bo'lmadi" : 'Ошибка удаления шаблона'));
    } finally {
      setDeletingReservationTemplateId(null);
    }
  };

  const loadHelpInstructions = async () => {
    setHelpInstructionsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/help-instructions`);
      setHelpInstructions(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Load help instructions error:', err);
      if (activeTab === 'help_instructions') {
        setError(language === 'uz' ? "Yo'riqnomalarni yuklab bo'lmadi" : 'Ошибка загрузки инструкций');
      }
    } finally {
      setHelpInstructionsLoading(false);
    }
  };

  const applyHelpInstructionUpdate = (updatedInstruction) => {
    if (!updatedInstruction?.id) return;
    setHelpInstructions((prev) => prev.map((item) => (
      Number(item.id) === Number(updatedInstruction.id)
        ? { ...item, ...updatedInstruction }
        : item
    )));
  };

  const incrementHelpInstructionViews = async (instructionId) => {
    try {
      const response = await axios.post(`${API_URL}/superadmin/help-instructions/${instructionId}/view`);
      applyHelpInstructionUpdate(response.data);
    } catch (error) {
      console.error('Increment help instruction views error:', error);
    }
  };

  const normalizeHelpInstructionPayload = (payload) => ({
    title_ru: String(payload?.title_ru || '').trim(),
    title_uz: String(payload?.title_uz || '').trim(),
    youtube_url: String(payload?.youtube_url || '').trim(),
    sort_order: String(payload?.sort_order || '').trim() === ''
      ? ''
      : Number.parseInt(payload.sort_order, 10)
  });

  const validateHelpInstructionPayload = (payload) => {
    if (!payload.title_ru) {
      return language === 'uz' ? 'RU tugma nomini kiriting' : 'Введите название кнопки RU';
    }
    if (!payload.title_uz) {
      return language === 'uz' ? 'UZ tugma nomini kiriting' : 'Введите название кнопки UZ';
    }
    if (!payload.youtube_url) {
      return language === 'uz' ? 'YouTube havolasini kiriting' : 'Введите ссылку YouTube';
    }
    return '';
  };

  const saveHelpInstruction = async (rawPayload) => {
    const payload = normalizeHelpInstructionPayload(rawPayload);
    const validationError = validateHelpInstructionPayload(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingHelpInstruction(true);
    try {
      if (rawPayload?.id) {
        await axios.put(`${API_URL}/superadmin/help-instructions/${rawPayload.id}`, payload);
      } else {
        await axios.post(`${API_URL}/superadmin/help-instructions`, payload);
      }
      setSuccess(language === 'uz' ? "Yo'riqnoma saqlandi" : 'Инструкция сохранена');
      setShowHelpInstructionModal(false);
      setHelpInstructionForm(createEmptyHelpInstructionForm());
      await loadHelpInstructions();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? 'Yo‘riqnomani saqlab bo‘lmadi' : 'Ошибка сохранения инструкции'));
    } finally {
      setSavingHelpInstruction(false);
    }
  };

  const openCreateHelpInstructionModal = () => {
    setHelpInstructionForm({
      ...createEmptyHelpInstructionForm(),
      sort_order: String(getNextFreeSortOrderClient(helpInstructions))
    });
    setShowHelpInstructionModal(true);
  };

  const handleEditHelpInstruction = (item) => {
    const parsedSort = Number.parseInt(item?.sort_order, 10);
    const normalizedSort = Number.isFinite(parsedSort) && parsedSort > 0
      ? parsedSort
      : getNextFreeSortOrderClient(helpInstructions, item?.id);
    setHelpInstructionForm({
      id: item.id,
      title_ru: item.title_ru || '',
      title_uz: item.title_uz || '',
      youtube_url: item.youtube_url || '',
      sort_order: String(normalizedSort)
    });
    setShowHelpInstructionModal(true);
  };

  const handleDeleteHelpInstruction = async (item) => {
    if (item?.is_default) {
      setError(language === 'uz' ? 'Sistem yo‘riqnomalarni o‘chirib bo‘lmaydi' : 'Системные инструкции удалять нельзя');
      return;
    }
    const confirmMessage = language === 'uz'
      ? `Yo‘riqnomani o‘chirishni xohlaysizmi?\n\n${item.title_uz || item.title_ru || ''}`
      : `Удалить инструкцию?\n\n${item.title_ru || item.title_uz || ''}`;
    if (!window.confirm(confirmMessage)) return;

    setDeletingHelpInstructionId(item.id);
    try {
      await axios.delete(`${API_URL}/superadmin/help-instructions/${item.id}`);
      setSuccess(language === 'uz' ? "Yo'riqnoma o'chirildi" : 'Инструкция удалена');
      if (Number(helpInstructionForm.id) === Number(item.id)) {
        setHelpInstructionForm(createEmptyHelpInstructionForm());
        setShowHelpInstructionModal(false);
      }
      await loadHelpInstructions();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? "Yo'riqnomani o'chirib bo'lmadi" : 'Ошибка удаления инструкции'));
    } finally {
      setDeletingHelpInstructionId(null);
    }
  };

  const loadOperators = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/operators`, {
        params: {
          page: operatorsPage,
          limit: operatorsLimit,
          search: operatorSearch.trim(),
          role: operatorRoleFilter,
          status: operatorStatusFilter,
          restaurant_id: operatorRestaurantFilter
        }
      });
      const data = Array.isArray(response.data)
        ? { operators: response.data, total: response.data.length }
        : response.data;
      setOperators(data);
    } catch (err) {
      setError('Ошибка загрузки операторов');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/customers`, {
        params: { page: customerPage, search: customerSearch.trim(), status: customerStatusFilter, restaurant_id: customerRestaurantFilter, limit: customerLimit }
      });
      setCustomers(response.data);
    } catch (err) {
      setError('Ошибка загрузки клиентов');
    } finally {
      setLoading(false);
    }
  };

  const loadSuperadminBroadcastHistory = async () => {
    setSuperadminBroadcastHistoryLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/broadcast/history`, {
        params: { limit: 100, page: 1 }
      });
      setSuperadminBroadcastHistory(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка загрузки истории рассылок');
    } finally {
      setSuperadminBroadcastHistoryLoading(false);
    }
  };

  const handleSuperadminBroadcastMediaUpload = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/') && !file.type?.startsWith('video/')) {
      setError('Поддерживаются только фото и видео');
      return;
    }

    const formData = new FormData();
    const isVideo = file.type.startsWith('video/');
    formData.append(isVideo ? 'video' : 'image', file);
    setSuperadminBroadcastUploading(true);
    try {
      const endpoint = isVideo ? 'video' : 'image';
      const response = await axios.post(`${API_URL}/upload/${endpoint}`, formData);
      const sourceUrl = String(response?.data?.url || response?.data?.imageUrl || response?.data?.videoUrl || '').trim();
      if (!sourceUrl) throw new Error('upload url missing');
      const fullUrl = sourceUrl.startsWith('http') ? sourceUrl : `${window.location.origin}${sourceUrl}`;
      setSuperadminBroadcastForm((prev) => ({
        ...prev,
        image_url: isVideo ? '' : fullUrl,
        video_url: isVideo ? fullUrl : ''
      }));
    } catch (error) {
      setError(error.response?.data?.error || 'Ошибка загрузки медиа');
    } finally {
      setSuperadminBroadcastUploading(false);
    }
  };

  const handleSuperadminBroadcastFileInputChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    handleSuperadminBroadcastMediaUpload(file);
  };

  const handleClearSuperadminBroadcastMedia = () => {
    setSuperadminBroadcastForm((prev) => ({
      ...prev,
      image_url: '',
      video_url: ''
    }));
  };

  const handleSuperadminBroadcastRoleToggle = (role) => {
    setSuperadminBroadcastForm((prev) => {
      const hasRole = prev.roles.includes(role);
      const nextRoles = hasRole ? prev.roles.filter((item) => item !== role) : [...prev.roles, role];
      return { ...prev, roles: nextRoles };
    });
  };

  const getSuperadminBroadcastRoleLabel = (role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'operator') return language === 'uz' ? 'Operatorlar' : 'Операторы';
    if (normalized === 'customer') return language === 'uz' ? 'Mijozlar' : 'Клиенты';
    return normalized || '-';
  };

  const sendSuperadminBroadcast = async () => {
    const message = String(superadminBroadcastForm.message || '').trim();
    if (!message) {
      setError('Введите текст сообщения');
      return;
    }
    if (!superadminBroadcastForm.roles.length) {
      setError('Выберите хотя бы одну роль');
      return;
    }
    if (!window.confirm('Отправить рассылку выбранным ролям?')) return;

    setSuperadminBroadcastSending(true);
    setSuperadminBroadcastResult(null);
    try {
      const response = await axios.post(`${API_URL}/superadmin/broadcast`, {
        message,
        image_url: superadminBroadcastForm.image_url || null,
        video_url: superadminBroadcastForm.video_url || null,
        roles: superadminBroadcastForm.roles
      });
      const payload = response.data || {};
      setSuperadminBroadcastResult(payload);
      setSuccess(`Рассылка завершена: отправлено ${payload.sent || 0}, ошибок ${payload.failed || 0}`);
      setSuperadminBroadcastForm(createInitialSuperadminBroadcastForm());
      setShowSuperadminBroadcastModal(false);
      await loadSuperadminBroadcastHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка отправки рассылки');
    } finally {
      setSuperadminBroadcastSending(false);
    }
  };

  // Load customer order history
  const loadCustomerOrders = async (customerId, page = 1) => {
    setLoadingOrders(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/customers/${customerId}/orders`, {
        params: { page, limit: 10 }
      });
      setCustomerOrders(response.data);
      setSelectedCustomer(response.data.customer);
    } catch (err) {
      setError('Ошибка загрузки заказов клиента');
    } finally {
      setLoadingOrders(false);
    }
  };

  // Open order history modal
  const openOrderHistory = (customer) => {
    setSelectedCustomer(customer);
    setOrderHistoryPage(1);
    loadCustomerOrders(customer.id, 1);
    setShowOrderHistoryModal(true);
  };

  // Toggle customer block status
  const handleToggleCustomerBlock = async (customer) => {
    // Now customer object contains restaurant_id and is_blocked for specific shop
    const currentIsBlocked = customer.is_blocked || !customer.user_is_active;
    const action = currentIsBlocked ? 'разблокировать' : 'заблокировать';
    const scopeName = `в магазине "${customer.restaurant_name}"`;

    if (!window.confirm(`Вы уверены, что хотите ${action} клиента ${customer.full_name || customer.username} ${scopeName}?`)) {
      return;
    }

    try {
      const response = await axios.put(`${API_URL}/superadmin/customers/${customer.user_id}/toggle-block`, {
        restaurant_id: customer.restaurant_id
      });
      setSuccess(response.data.message);
      loadCustomers();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка изменения статуса клиента');
    }
  };

  // Delete customer
  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`Удалить клиента ${customer.full_name || customer.username}? Это действие нельзя отменить.`)) {
      return;
    }

    try {
      const response = await axios.delete(`${API_URL}/superadmin/customers/${customer.id}`);
      setSuccess(response.data.message);
      loadCustomers();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления клиента');
    }
  };

  // View order detail
  const openOrderDetail = (order) => {
    setSelectedOrder(order);
    setShowOrderDetailModal(true);
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/logs`, {
        params: logsFilter
      });
      setLogs(response.data);
    } catch (err) {
      setError('Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  };

  const loadSecurityEvents = async () => {
    setSecurityEventsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/security/events`, {
        params: securityFilter
      });
      const payload = response.data || {};
      setSecurityDetailsRevealMap({});
      setSecurityEventsData({
        events: Array.isArray(payload.events) ? payload.events : [],
        total: Number(payload.total || 0),
        page: Number(payload.page || securityFilter.page || 1),
        limit: Number(payload.limit || securityFilter.limit || 20)
      });
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "Xavfsizlik hodisalarini yuklab bo'lmadi"
        : 'Ошибка загрузки событий безопасности'));
    } finally {
      setSecurityEventsLoading(false);
    }
  };

  const loadSecurityStats = async () => {
    setSecurityStatsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/security/events/stats`);
      const payload = response.data || {};
      setSecurityStats({
        overview: payload.overview || {
          total: 0,
          open_total: 0,
          high_total: 0,
          total_24h: 0,
          open_24h: 0,
          high_24h: 0,
          total_7d: 0
        },
        top_sources_24h: Array.isArray(payload.top_sources_24h) ? payload.top_sources_24h : [],
        by_type_24h: Array.isArray(payload.by_type_24h) ? payload.by_type_24h : [],
        by_risk_24h: Array.isArray(payload.by_risk_24h) ? payload.by_risk_24h : []
      });
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "Xavfsizlik statistikasi yuklanmadi"
        : 'Ошибка загрузки статистики безопасности'));
    } finally {
      setSecurityStatsLoading(false);
    }
  };

  const handleSecurityEventStatusToggle = async (eventItem) => {
    const eventId = Number(eventItem?.id);
    if (!Number.isFinite(eventId) || eventId <= 0) return;
    const currentStatus = String(eventItem?.status || '').toLowerCase();
    const nextStatus = currentStatus === 'resolved' ? 'open' : 'resolved';
    const confirmationText = nextStatus === 'resolved'
      ? (language === 'uz'
        ? 'Hodisani hal qilindi deb belgilaysizmi?'
        : 'Отметить событие как решённое?')
      : (language === 'uz'
        ? 'Hodisani qayta ochasizmi?'
        : 'Переоткрыть событие?');
    if (!window.confirm(confirmationText)) return;

    setSecurityEventStatusUpdatingId(eventId);
    try {
      const resolutionNote = nextStatus === 'resolved'
        ? (language === 'uz' ? 'Superadmin panelidan yopildi' : 'Закрыто из панели супер-админа')
        : '';
      await axios.patch(`${API_URL}/superadmin/security/events/${eventId}/status`, {
        status: nextStatus,
        resolution_note: resolutionNote
      });
      setSuccess(nextStatus === 'resolved'
        ? (language === 'uz' ? 'Hodisa hal qilindi deb belgilandi' : 'Событие отмечено как решённое')
        : (language === 'uz' ? 'Hodisa qayta ochildi' : 'Событие переоткрыто'));
      await Promise.all([loadSecurityEvents(), loadSecurityStats()]);
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "Hodisa statusini o'zgartirib bo'lmadi"
        : 'Не удалось изменить статус события'));
    } finally {
      setSecurityEventStatusUpdatingId(null);
    }
  };

  const loadBillingTransactions = async () => {
    setBillingOpsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/billing/transactions`, {
        params: billingOpsFilter
      });
      const payload = response.data || {};
      setBillingOpsData({
        transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
        total: Number(payload.total || 0)
      });
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "To'lovlar jurnalini yuklab bo'lmadi"
        : 'Ошибка загрузки журнала оплат'));
    } finally {
      setBillingOpsLoading(false);
    }
  };

  const exportBillingTransactionsXls = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/billing/transactions`, {
        params: {
          ...billingOpsFilter,
          page: 1,
          limit: 5000
        }
      });
      const rows = Array.isArray(response.data?.transactions) ? response.data.transactions : [];
      if (!rows.length) {
        setError(language === 'uz' ? "Eksport uchun ma'lumot yo'q" : 'Нет данных для экспорта');
        return;
      }

      const localizedType = (rawType) => {
        const normalized = String(rawType || '').toLowerCase();
        if (normalized === 'deposit') return language === 'uz' ? "To'ldirish" : 'Пополнение';
        if (normalized === 'refund') return language === 'uz' ? 'Qaytarish' : 'Возврат';
        return normalized || '—';
      };

      const sheetRows = rows.map((item) => ({
        ID: item.id,
        Дата: formatBalanceOperationDate(item.created_at),
        Магазин: item.restaurant_name || '—',
        'Тип операции': localizedType(item.type),
        Сумма: formatBalanceAmount(item.amount || 0),
        Валюта: getCurrencyLabelByCode(item.restaurant_currency_code || countryCurrency?.code),
        Описание: item.description || '',
        Оператор: item.actor_name || item.actor_username || 'Система'
      }));

      const sheet = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Оплаты');
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      XLSX.writeFile(wb, `billing_transactions_${stamp}.xls`, { bookType: 'biff8' });
      setSuccess(language === 'uz'
        ? `Eksport bajarildi: ${sheetRows.length} ta yozuv`
        : `Экспорт выполнен: ${sheetRows.length} записей`);
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? "Eksportda xatolik" : 'Ошибка экспорта'));
    }
  };

  const loadFoundersAnalytics = async (passwordOverride = null) => {
    const resolvedPassword = String(passwordOverride ?? foundersAccessPassword ?? '').trim();
    if (!resolvedPassword) return false;

    setFoundersAnalyticsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/founders/analytics`, {
        params: foundersAnalyticsFilter,
        headers: {
          'x-founders-password': resolvedPassword
        }
      });
      const payload = response.data || {};
      const currencies = Array.isArray(payload.available_currencies) ? payload.available_currencies : [];
      const preferredCurrency = resolvePreferredFoundersCurrencyCode(currencies, countryCurrency?.code);
      setFoundersAnalyticsData({
        period: payload.period || { start_date: null, end_date: null },
        modules_config: Array.isArray(payload.modules_config) ? payload.modules_config : [],
        available_currencies: currencies,
        shares_config: Array.isArray(payload.shares_config) ? payload.shares_config : [],
        totals_by_currency: Array.isArray(payload.totals_by_currency) ? payload.totals_by_currency : [],
        module_totals: Array.isArray(payload.module_totals) ? payload.module_totals : [],
        module_monthly_totals: Array.isArray(payload.module_monthly_totals) ? payload.module_monthly_totals : [],
        expense_totals_by_currency: Array.isArray(payload.expense_totals_by_currency) ? payload.expense_totals_by_currency : [],
        expense_category_totals: Array.isArray(payload.expense_category_totals) ? payload.expense_category_totals : [],
        expense_monthly_totals: Array.isArray(payload.expense_monthly_totals) ? payload.expense_monthly_totals : [],
        founder_module_totals: Array.isArray(payload.founder_module_totals) ? payload.founder_module_totals : [],
        founder_expense_totals: Array.isArray(payload.founder_expense_totals) ? payload.founder_expense_totals : [],
        founder_totals: Array.isArray(payload.founder_totals) ? payload.founder_totals : [],
        founder_monthly_totals: Array.isArray(payload.founder_monthly_totals) ? payload.founder_monthly_totals : [],
        founder_monthly_module_totals: Array.isArray(payload.founder_monthly_module_totals) ? payload.founder_monthly_module_totals : [],
        generated_at: payload.generated_at || null
      });
      setFoundersChartsCurrency((prev) => {
        const normalizedPrev = String(prev || '').trim().toLowerCase();
        if (normalizedPrev && currencies.map((item) => String(item || '').trim().toLowerCase()).includes(normalizedPrev)) {
          return normalizedPrev;
        }
        return preferredCurrency;
      });
      setFoundersAccessPassword(resolvedPassword);
      setFoundersAccessGranted(true);
      setFoundersAccessError('');
      return true;
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        setFoundersAccessGranted(false);
        setFoundersAccessPassword('');
        setFoundersChartsCurrency('');
        setFoundersExpandedModulesMap({});
        setFoundersAnalyticsData(createInitialFoundersAnalyticsState());
        setFoundersInnerTab('analytics');
        setOrganizationExpenseCategories([]);
        setOrganizationExpensesData({
          items: [],
          totals_by_currency: [],
          total: 0,
          page: 1,
          limit: organizationExpensesFilter.limit
        });
        setFoundersAccessError(language === 'uz'
          ? "Parol noto'g'ri. Qayta urinib ko'ring."
          : 'Неверный пароль. Попробуйте снова.');
        if (activeTab === 'founders') {
          setShowFoundersAccessModal(true);
        }
        return false;
      }
      setError(err.response?.data?.error || (language === 'uz'
        ? "Ta'sischilar analitikasini yuklab bo'lmadi"
        : 'Ошибка загрузки аналитики учредителей'));
      return false;
    } finally {
      setFoundersAnalyticsLoading(false);
    }
  };

  const handleFoundersAccessSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const trimmedPassword = String(foundersPasswordInput || '').trim();
    if (!trimmedPassword) {
      setFoundersAccessError(language === 'uz'
        ? 'Parolni kiriting'
        : 'Введите пароль');
      return;
    }
    const isSuccess = await loadFoundersAnalytics(trimmedPassword);
    if (!isSuccess) return;
    setShowFoundersAccessModal(false);
    setFoundersPasswordInput('');
    setFoundersAccessError('');
  };

  const requestFoundersReauth = () => {
    setFoundersAccessGranted(false);
    setFoundersAccessPassword('');
    setFoundersChartsCurrency('');
    setFoundersExpandedModulesMap({});
    setFoundersPasswordInput('');
    setFoundersAccessError('');
    setFoundersAnalyticsData(createInitialFoundersAnalyticsState());
    setFoundersInnerTab('analytics');
    setOrganizationExpenseCategories([]);
    setOrganizationExpensesData({
      items: [],
      totals_by_currency: [],
      total: 0,
      page: 1,
      limit: organizationExpensesFilter.limit
    });
    setShowFoundersAccessModal(true);
  };
  const getFoundersAuthHeaders = (passwordOverride = null) => {
    const resolvedPassword = String(passwordOverride ?? foundersAccessPassword ?? '').trim();
    if (!resolvedPassword) return null;
    return {
      'x-founders-password': resolvedPassword
    };
  };
  const loadOrganizationExpenseCategories = async () => {
    const headers = getFoundersAuthHeaders();
    if (!headers) return;
    setOrganizationExpenseCategoriesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/founders/expense-categories`, { headers });
      setOrganizationExpenseCategories(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        requestFoundersReauth();
        return;
      }
      setError(err.response?.data?.error || (language === 'uz'
        ? "Xarajat maqolalarini yuklab bo'lmadi"
        : 'Ошибка загрузки статей расходов'));
    } finally {
      setOrganizationExpenseCategoriesLoading(false);
    }
  };
  const loadOrganizationExpenses = async () => {
    const headers = getFoundersAuthHeaders();
    if (!headers) return;
    setOrganizationExpensesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/founders/expenses`, {
        headers,
        params: {
          start_date: foundersAnalyticsFilter.start_date || undefined,
          end_date: foundersAnalyticsFilter.end_date || undefined,
          category_id: organizationExpensesFilter.category_id || undefined,
          currency_code: organizationExpensesFilter.currency_code || undefined,
          search: String(organizationExpensesFilter.search || '').trim() || undefined,
          page: organizationExpensesFilter.page,
          limit: organizationExpensesFilter.limit
        }
      });
      const payload = response.data || {};
      setOrganizationExpensesData({
        items: Array.isArray(payload.items) ? payload.items : [],
        totals_by_currency: Array.isArray(payload.totals_by_currency) ? payload.totals_by_currency : [],
        total: Number(payload.total || 0),
        page: Number(payload.page || organizationExpensesFilter.page || 1),
        limit: Number(payload.limit || organizationExpensesFilter.limit || 200)
      });
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        requestFoundersReauth();
        return;
      }
      setError(err.response?.data?.error || (language === 'uz'
        ? "Tashkilot xarajatlarini yuklab bo'lmadi"
        : 'Ошибка загрузки расходов организации'));
    } finally {
      setOrganizationExpensesLoading(false);
    }
  };
  const openCreateOrganizationExpenseModal = () => {
    setOrganizationExpenseForm({
      ...createInitialOrganizationExpenseForm(),
      currency_code: String(countryCurrency?.code || 'uz').trim().toLowerCase() || 'uz'
    });
    setOrganizationExpenseCategorySearch('');
    setShowOrganizationExpenseModal(true);
  };
  const openEditOrganizationExpenseModal = (item) => {
    if (!item) return;
    setOrganizationExpenseForm({
      id: item.id,
      category_id: String(item.category_id || ''),
      amount: String(item.amount ?? ''),
      currency_code: String(item.currency_code || countryCurrency?.code || 'uz').trim().toLowerCase(),
      expense_date: String(item.expense_date || getTodayDateInputValue()),
      description: String(item.description || '')
    });
    setOrganizationExpenseCategorySearch('');
    setShowOrganizationExpenseModal(true);
  };
  const submitOrganizationExpense = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const headers = getFoundersAuthHeaders();
    if (!headers) return;
    const categoryId = Number.parseInt(organizationExpenseForm.category_id, 10);
    const amountValue = parseDecimalInputOrZero(organizationExpenseForm.amount);
    const currencyCode = String(organizationExpenseForm.currency_code || '').trim().toLowerCase();
    const expenseDate = String(organizationExpenseForm.expense_date || '').trim();
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setError(language === 'uz' ? 'Xarajat maqolasini tanlang' : 'Выберите статью расходов');
      return;
    }
    if (!(amountValue > 0)) {
      setError(language === 'uz' ? "Xarajat summasini to'g'ri kiriting" : 'Введите корректную сумму расхода');
      return;
    }
    if (!expenseDate) {
      setError(language === 'uz' ? 'Xarajat sanasini tanlang' : 'Выберите дату расхода');
      return;
    }

    setOrganizationExpenseSubmitting(true);
    try {
      const payload = {
        category_id: categoryId,
        amount: amountValue,
        currency_code: currencyCode || 'uz',
        expense_date: expenseDate,
        description: String(organizationExpenseForm.description || '').trim()
      };
      if (organizationExpenseForm.id) {
        await axios.put(`${API_URL}/superadmin/founders/expenses/${organizationExpenseForm.id}`, payload, { headers });
      } else {
        await axios.post(`${API_URL}/superadmin/founders/expenses`, payload, { headers });
      }
      setShowOrganizationExpenseModal(false);
      setOrganizationExpenseForm(createInitialOrganizationExpenseForm());
      setOrganizationExpenseCategorySearch('');
      await Promise.all([
        loadOrganizationExpenses(),
        loadOrganizationExpenseCategories(),
        loadFoundersAnalytics()
      ]);
      setSuccess(language === 'uz' ? "Xarajat muvaffaqiyatli saqlandi" : 'Расход успешно сохранён');
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        requestFoundersReauth();
        return;
      }
      setError(err.response?.data?.error || (language === 'uz' ? "Xarajatni saqlab bo'lmadi" : 'Ошибка сохранения расхода'));
    } finally {
      setOrganizationExpenseSubmitting(false);
    }
  };
  const deleteOrganizationExpense = async (item) => {
    if (!item?.id) return;
    const confirmed = window.confirm(language === 'uz'
      ? 'Ushbu xarajat yozuvini o‘chirasizmi?'
      : 'Удалить эту запись расхода?');
    if (!confirmed) return;

    const headers = getFoundersAuthHeaders();
    if (!headers) return;
    try {
      await axios.delete(`${API_URL}/superadmin/founders/expenses/${item.id}`, { headers });
      await Promise.all([
        loadOrganizationExpenses(),
        loadOrganizationExpenseCategories(),
        loadFoundersAnalytics()
      ]);
      setSuccess(language === 'uz' ? "Xarajat o'chirildi" : 'Расход удалён');
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        requestFoundersReauth();
        return;
      }
      setError(err.response?.data?.error || (language === 'uz' ? "Xarajatni o'chirib bo'lmadi" : 'Ошибка удаления расхода'));
    }
  };
  const openCreateExpenseCategoryModal = () => {
    setExpenseCategoryForm(createInitialExpenseCategoryForm());
    setShowExpenseCategoryModal(true);
  };
  const openEditExpenseCategoryModal = (item) => {
    if (!item) return;
    setExpenseCategoryForm({
      id: item.id,
      name_ru: String(item.name_ru || ''),
      name_uz: String(item.name_uz || ''),
      is_active: item.is_active !== false
    });
    setShowExpenseCategoryModal(true);
  };
  const submitExpenseCategory = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const headers = getFoundersAuthHeaders();
    if (!headers) return;

    const nameRu = String(expenseCategoryForm.name_ru || '').trim();
    const nameUz = String(expenseCategoryForm.name_uz || '').trim();
    if (!nameRu && !nameUz) {
      setError(language === 'uz'
        ? 'Maqola nomini RU yoki UZ da kiriting'
        : 'Введите название статьи на RU или UZ');
      return;
    }

    setExpenseCategorySubmitting(true);
    try {
      const payload = {
        name_ru: nameRu,
        name_uz: nameUz,
        is_active: expenseCategoryForm.is_active !== false
      };
      if (expenseCategoryForm.id) {
        await axios.put(`${API_URL}/superadmin/founders/expense-categories/${expenseCategoryForm.id}`, payload, { headers });
      } else {
        await axios.post(`${API_URL}/superadmin/founders/expense-categories`, payload, { headers });
      }
      setShowExpenseCategoryModal(false);
      setExpenseCategoryForm(createInitialExpenseCategoryForm());
      await Promise.all([
        loadOrganizationExpenseCategories(),
        loadOrganizationExpenses(),
        loadFoundersAnalytics()
      ]);
      setSuccess(language === 'uz' ? "Maqola saqlandi" : 'Статья расходов сохранена');
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        requestFoundersReauth();
        return;
      }
      setError(err.response?.data?.error || (language === 'uz'
        ? "Maqolani saqlab bo'lmadi"
        : 'Ошибка сохранения статьи расходов'));
    } finally {
      setExpenseCategorySubmitting(false);
    }
  };
  const deleteExpenseCategory = async (item) => {
    if (!item?.id) return;
    const confirmed = window.confirm(language === 'uz'
      ? 'Ushbu xarajat maqolasini o‘chirasizmi?'
      : 'Удалить эту статью расходов?');
    if (!confirmed) return;

    const headers = getFoundersAuthHeaders();
    if (!headers) return;
    try {
      await axios.delete(`${API_URL}/superadmin/founders/expense-categories/${item.id}`, { headers });
      await Promise.all([
        loadOrganizationExpenseCategories(),
        loadOrganizationExpenses(),
        loadFoundersAnalytics()
      ]);
      setSuccess(language === 'uz' ? "Maqola o'chirildi" : 'Статья расходов удалена');
    } catch (err) {
      if (Number(err?.response?.status) === 403) {
        requestFoundersReauth();
        return;
      }
      setError(err.response?.data?.error || (language === 'uz'
        ? "Maqolani o'chirib bo'lmadi"
        : 'Ошибка удаления статьи расходов'));
    }
  };

  const loadHiddenOpsInsights = async (hoursOverride = null) => {
    const requestedHours = Number.parseInt(hoursOverride ?? hiddenOpsInsightsHours, 10);
    const normalizedHours = Number.isFinite(requestedHours) ? Math.min(168, Math.max(1, requestedHours)) : 24;
    setHiddenOpsInsightsLoading(true);
    setHiddenOpsInsightsError('');
    try {
      const response = await axios.get(`${API_URL}/superadmin/telemetry/analytics`, {
        params: { hours: normalizedHours }
      });
      setHiddenOpsInsights(response.data || null);
    } catch (err) {
      setHiddenOpsInsightsError(err?.response?.data?.error || 'Ошибка загрузки скрытой аналитики');
    } finally {
      setHiddenOpsInsightsLoading(false);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/categories`);
      setCategories(response.data);
    } catch (err) {
      setError('Ошибка загрузки категорий');
    } finally {
      setLoading(false);
    }
  };

  const loadGlobalProducts = async () => {
    setGlobalProductsLoading(true);
    try {
      const includeInactive = globalProductsStatusFilter === 'all';
      const level1CategoryId = Number.parseInt(globalProductsCategoryLevel1Filter, 10);
      const level2CategoryId = Number.parseInt(globalProductsCategoryLevel2Filter, 10);
      const level3CategoryId = Number.parseInt(globalProductsCategoryLevel3Filter, 10);
      const response = await axios.get(`${API_URL}/superadmin/global-products`, {
        params: {
          page: globalProductsPage,
          limit: globalProductsLimit,
          search: String(globalProductsSearch || '').trim(),
          barcode: String(globalProductsBarcodeFilter || '').replace(/\D/g, ''),
          include_inactive: includeInactive ? 'true' : 'false',
          category_level1_id: Number.isInteger(level1CategoryId) && level1CategoryId > 0 ? level1CategoryId : undefined,
          category_level2_id: Number.isInteger(level2CategoryId) && level2CategoryId > 0 ? level2CategoryId : undefined,
          category_level3_id: Number.isInteger(level3CategoryId) && level3CategoryId > 0 ? level3CategoryId : undefined
        }
      });

      const payload = response.data || {};
      setGlobalProducts({
        items: Array.isArray(payload.items) ? payload.items : [],
        total: Number(payload.total || 0),
        page: Number(payload.page || globalProductsPage),
        limit: Number(payload.limit || globalProductsLimit)
      });
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "Global mahsulotlar ro'yxatini yuklashda xato"
        : 'Ошибка загрузки глобальных товаров'));
    } finally {
      setGlobalProductsLoading(false);
    }
  };

  const closeGlobalProductModal = () => {
    if (savingGlobalProduct) return;
    globalProductAiRequestIdRef.current += 1;
    setShowGlobalProductModal(false);
    setEditingGlobalProduct(null);
    setGlobalProductCategorySearch({ level1: '', level2: '', level3: '' });
    setGlobalProductForm(createEmptyGlobalProductForm());
    setGlobalProductAiPreviewUrl('');
    setGlobalProductAiMode('');
    setGlobalProductAiLoading(false);
    setGlobalProductAiError('');
    setGlobalProductTextLoading(false);
  };

  const openGlobalProductModal = (product = null) => {
    if (!categories.length) {
      loadCategories();
    }
    globalProductAiRequestIdRef.current += 1;
    setGlobalProductCategorySearch({ level1: '', level2: '', level3: '' });
    setGlobalProductAiPreviewUrl('');
    setGlobalProductAiMode('');
    setGlobalProductAiLoading(false);
    setGlobalProductAiError('');
    setGlobalProductTextLoading(false);

    if (product) {
      setEditingGlobalProduct(product);
      setGlobalProductForm({
        id: product.id,
        name_ru: product.name_ru || '',
        name_uz: product.name_uz || '',
        description_ru: product.description_ru || '',
        description_uz: product.description_uz || '',
        barcode: product.barcode || '',
        ikpu: product.ikpu || '',
        image_url: product.image_url || '',
        recommended_category_id: product.recommended_category_id ? String(product.recommended_category_id) : '',
        unit: product.unit || 'шт',
        order_step: Number.parseFloat(product.order_step) > 0 ? String(product.order_step) : '',
        is_active: product.is_active !== false
      });
    } else {
      setEditingGlobalProduct(null);
      setGlobalProductForm(createEmptyGlobalProductForm());
    }

    setShowGlobalProductModal(true);
  };

  const resolveGlobalProductImagePreviewUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(raw)) return raw;
    return `${API_URL.replace('/api', '')}${raw.startsWith('/') ? '' : '/'}${raw}`;
  };
  const isAiFeatureEnabled = billingSettings.ai_enabled !== false;
  const aiDisabledMessage = language === 'uz'
    ? 'AI funksiyalari superadmin sozlamalarida ochirilgan'
    : 'AI функции отключены в настройках супер-админки';

  const runCategoryAiPreview = async (mode) => {
    if (!isAiFeatureEnabled) {
      setCategoryAiError(aiDisabledMessage);
      return;
    }
    const normalizedMode = mode === 'process' ? 'process' : 'generate';
    const categoryName = String(categoryForm.name_ru || categoryForm.name_uz || '').trim();
    const sourceImageUrl = String(categoryForm.image_url || '').trim();

    if (normalizedMode === 'generate' && !categoryName) {
      setCategoryAiError(language === 'uz'
        ? "Avval kategoriya nomini kiriting"
        : 'Сначала укажите название категории');
      return;
    }
    if (normalizedMode === 'process' && !sourceImageUrl) {
      setCategoryAiError(language === 'uz'
        ? "Avval kategoriya rasmini tanlang"
        : 'Сначала выберите фото категории');
      return;
    }

    const requestId = categoryAiRequestIdRef.current + 1;
    categoryAiRequestIdRef.current = requestId;
    setCategoryAiError('');
    setCategoryAiMode(normalizedMode);
    setCategoryAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/superadmin/categories/image-preview`, {
        mode: normalizedMode,
        name: categoryName,
        image_url: sourceImageUrl,
        category_id: categoryForm.id || null,
        parent_id: categoryForm.parent_id || null
      });
      if (categoryAiRequestIdRef.current !== requestId) return;

      const previewUrl = String(response.data?.preview_url || '').trim();
      if (!previewUrl) {
        setCategoryAiError(language === 'uz'
          ? "Preview tayyor bo'lmadi"
          : 'Preview не был получен');
        return;
      }
      setCategoryForm((prev) => ({ ...prev, image_url: previewUrl }));
      setCategoryAiMode(String(response.data?.mode || normalizedMode));
    } catch (err) {
      if (categoryAiRequestIdRef.current !== requestId) return;
      const serverError = String(err.response?.data?.error || '').trim();
      const serverDetails = String(err.response?.data?.details || '').trim();
      const fallbackError = language === 'uz'
        ? 'Preview tayyorlashda xatolik'
        : 'Ошибка подготовки preview';
      setCategoryAiError(serverDetails ? `${serverError || fallbackError}: ${serverDetails}` : (serverError || fallbackError));
    } finally {
      if (categoryAiRequestIdRef.current === requestId) {
        setCategoryAiLoading(false);
      }
    }
  };

  const handleRegenerateCategoryAiPreview = () => {
    const hasSourceImage = Boolean(String(categoryForm.image_url || '').trim());
    const hasCategoryName = Boolean(String(categoryForm.name_ru || categoryForm.name_uz || '').trim());
    let mode = 'generate';
    if (categoryAiMode === 'process' && hasSourceImage) {
      mode = 'process';
    } else if (!hasCategoryName && hasSourceImage) {
      mode = 'process';
    } else if (hasCategoryName) {
      mode = 'generate';
    } else if (hasSourceImage) {
      mode = 'process';
    } else {
      setCategoryAiError(language === 'uz'
        ? 'Qayta yaratish uchun nom yoki rasm kerak'
        : 'Для перегенерации нужно название или исходное фото');
      return;
    }
    runCategoryAiPreview(mode);
  };

  const handleGenerateGlobalProductText = async () => {
    if (!isAiFeatureEnabled) {
      setError(aiDisabledMessage);
      return;
    }
    const nameRu = String(globalProductForm.name_ru || '').trim();
    const nameUz = String(globalProductForm.name_uz || '').trim();
    if (!nameRu && !nameUz) {
      setError(language === 'uz'
        ? "Avval mahsulot nomini kamida bitta tilda kiriting"
        : 'Сначала укажите название товара хотя бы на одном языке');
      return;
    }

    setGlobalProductTextLoading(true);
    try {
      const response = await axios.post(`${API_URL}/superadmin/global-products/description-preview`, {
        name_ru: nameRu,
        name_uz: nameUz
      });
      const nextNameRu = String(response.data?.name_ru || nameRu || nameUz || '').trim();
      const nextNameUz = String(response.data?.name_uz || nameUz || nameRu || '').trim();
      const nextDescriptionRu = String(response.data?.description_ru || '').trim();
      const nextDescriptionUz = String(response.data?.description_uz || '').trim();

      setGlobalProductForm((prev) => ({
        ...prev,
        name_ru: nextNameRu,
        name_uz: nextNameUz,
        description_ru: nextDescriptionRu,
        description_uz: nextDescriptionUz
      }));
      setSuccess(language === 'uz'
        ? 'RU/UZ matnlari yaratildi'
        : 'Тексты RU/UZ сгенерированы');
    } catch (err) {
      setError(
        String(err.response?.data?.error || '').trim()
        || (language === 'uz' ? 'Matn yaratishda xatolik' : 'Ошибка генерации текста')
      );
    } finally {
      setGlobalProductTextLoading(false);
    }
  };

  const runGlobalProductAiPreview = async (mode) => {
    if (!isAiFeatureEnabled) {
      setGlobalProductAiError(aiDisabledMessage);
      return;
    }
    const normalizedMode = mode === 'process' ? 'process' : 'generate';
    const productName = String(globalProductForm.name_ru || globalProductForm.name_uz || '').trim();
    const sourceImageUrl = String(globalProductForm.image_url || '').trim();

    if (normalizedMode === 'generate' && !productName) {
      setGlobalProductAiError(language === 'uz'
        ? "Avval mahsulot nomini kiriting"
        : 'Сначала укажите название товара');
      return;
    }
    if (normalizedMode === 'process' && !sourceImageUrl) {
      setGlobalProductAiError(language === 'uz'
        ? "Avval mahsulot rasmini tanlang"
        : 'Сначала выберите фото товара');
      return;
    }

    const requestId = globalProductAiRequestIdRef.current + 1;
    globalProductAiRequestIdRef.current = requestId;
    setGlobalProductAiError('');
    setGlobalProductAiMode(normalizedMode);
    setGlobalProductAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/superadmin/global-products/image-preview`, {
        mode: normalizedMode,
        name: productName,
        image_url: sourceImageUrl,
        recommended_category_id: globalProductForm.recommended_category_id || null
      });
      if (globalProductAiRequestIdRef.current !== requestId) return;

      const previewUrl = String(response.data?.preview_url || '').trim();
      if (!previewUrl) {
        setGlobalProductAiError(language === 'uz'
          ? "Preview tayyor bo'lmadi"
          : 'Preview не был получен');
        return;
      }
      setGlobalProductAiPreviewUrl(previewUrl);
      setGlobalProductAiMode(String(response.data?.mode || normalizedMode));
    } catch (err) {
      if (globalProductAiRequestIdRef.current !== requestId) return;
      const serverError = String(err.response?.data?.error || '').trim();
      const serverDetails = String(err.response?.data?.details || '').trim();
      const fallbackError = language === 'uz'
        ? 'Preview tayyorlashda xatolik'
        : 'Ошибка подготовки preview';
      setGlobalProductAiError(serverDetails ? `${serverError || fallbackError}: ${serverDetails}` : (serverError || fallbackError));
    } finally {
      if (globalProductAiRequestIdRef.current === requestId) {
        setGlobalProductAiLoading(false);
      }
    }
  };

  const handleRegenerateGlobalProductAiPreview = () => {
    const hasSourceImage = Boolean(String(globalProductForm.image_url || '').trim());
    const hasProductName = Boolean(String(globalProductForm.name_ru || globalProductForm.name_uz || '').trim());
    let mode = 'generate';
    if (globalProductAiMode === 'process' && hasSourceImage) {
      mode = 'process';
    } else if (!hasProductName && hasSourceImage) {
      mode = 'process';
    } else if (hasProductName) {
      mode = 'generate';
    } else if (hasSourceImage) {
      mode = 'process';
    } else {
      setGlobalProductAiError(language === 'uz'
        ? 'Qayta yaratish uchun nom yoki rasm kerak'
        : 'Для перегенерации нужно название или исходное фото');
      return;
    }
    runGlobalProductAiPreview(mode);
  };

  const handleSaveGlobalProduct = async () => {
    const nameRu = String(globalProductForm.name_ru || '').trim();
    if (!nameRu) {
      setError(language === 'uz' ? 'RU nomini kiriting' : 'Введите название (RU)');
      return;
    }

    const recommendedCategoryIdRaw = Number.parseInt(globalProductForm.recommended_category_id, 10);
    const recommendedCategoryId = Number.isFinite(recommendedCategoryIdRaw) && recommendedCategoryIdRaw > 0
      ? recommendedCategoryIdRaw
      : null;
    const parsedStep = Number.parseFloat(String(globalProductForm.order_step || '').replace(',', '.'));
    const normalizedOrderStep = Number.isFinite(parsedStep) && parsedStep > 0
      ? Math.round((parsedStep + Number.EPSILON) * 100) / 100
      : null;
    const imageUrl = String(globalProductAiPreviewUrl || globalProductForm.image_url || '').trim();

    const payload = {
      name_ru: nameRu,
      name_uz: String(globalProductForm.name_uz || '').trim(),
      description_ru: String(globalProductForm.description_ru || '').trim(),
      description_uz: String(globalProductForm.description_uz || '').trim(),
      barcode: String(globalProductForm.barcode || '').trim(),
      ikpu: String(globalProductForm.ikpu || '').trim(),
      image_url: imageUrl || null,
      thumb_url: null,
      product_images: imageUrl ? [{ url: imageUrl }] : [],
      recommended_category_id: recommendedCategoryId,
      unit: String(globalProductForm.unit || '').trim() || 'шт',
      order_step: normalizedOrderStep,
      size_enabled: false,
      size_options: [],
      is_active: globalProductForm.is_active !== false
    };

    setSavingGlobalProduct(true);
    try {
      if (editingGlobalProduct?.id) {
        await axios.put(`${API_URL}/superadmin/global-products/${editingGlobalProduct.id}`, payload);
        setSuccess(language === 'uz'
          ? 'Global mahsulot yangilandi'
          : 'Глобальный товар обновлен');
      } else {
        await axios.post(`${API_URL}/superadmin/global-products`, payload);
        setSuccess(language === 'uz'
          ? "Global mahsulot qo'shildi"
          : 'Глобальный товар добавлен');
      }

      closeGlobalProductModal();
      loadGlobalProducts();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "Global mahsulotni saqlashda xato"
        : 'Ошибка сохранения глобального товара'));
    } finally {
      setSavingGlobalProduct(false);
    }
  };

  const handleToggleGlobalProductActive = async (item) => {
    const productId = Number.parseInt(item?.id, 10);
    if (!Number.isFinite(productId) || productId <= 0) return;

    const normalizedImageUrl = String(item?.image_url || '').trim();
    const payload = {
      name_ru: String(item?.name_ru || '').trim(),
      name_uz: String(item?.name_uz || '').trim(),
      description_ru: String(item?.description_ru || '').trim(),
      description_uz: String(item?.description_uz || '').trim(),
      barcode: String(item?.barcode || '').trim(),
      ikpu: String(item?.ikpu || '').trim(),
      image_url: normalizedImageUrl || null,
      thumb_url: null,
      product_images: normalizedImageUrl ? [{ url: normalizedImageUrl }] : [],
      recommended_category_id: item?.recommended_category_id || null,
      unit: String(item?.unit || '').trim() || 'шт',
      order_step: Number.parseFloat(item?.order_step) > 0 ? Number.parseFloat(item.order_step) : null,
      size_enabled: item?.size_enabled === true,
      size_options: Array.isArray(item?.size_options) ? item.size_options : [],
      is_active: item?.is_active === false
    };

    try {
      await axios.put(`${API_URL}/superadmin/global-products/${productId}`, payload);
      setSuccess(item?.is_active === false
        ? (language === 'uz' ? 'Global mahsulot yoqildi' : 'Глобальный товар включен')
        : (language === 'uz' ? 'Global mahsulot o‘chirildi' : 'Глобальный товар отключен'));
      loadGlobalProducts();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? 'Holatni o‘zgartirib bo‘lmadi'
        : 'Не удалось изменить статус'));
    }
  };

  const handleGlobalProductImageUpload = (event) => {
    const file = event.target?.files?.[0];
    event.target.value = '';
    if (!file) return;
    setGlobalProductAiError('');
    setGlobalProductAiPreviewUrl('');
    setGlobalProductAiMode('');
    handleImageUpload(file, (url) => {
      setGlobalProductForm((prev) => ({ ...prev, image_url: url }));
    });
  };

  const handleCategoryImageUpload = (event) => {
    const file = event.target?.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCategoryAiError('');
    setCategoryAiMode('');
    handleImageUpload(file, (url) => {
      setCategoryForm((prev) => ({ ...prev, image_url: url }));
    });
  };

  const handleCategorySelect = (levelIndex, category) => {
    const newLevels = [...categoryLevels];
    newLevels[levelIndex] = category;
    for (let i = levelIndex + 1; i < CATEGORY_LEVEL_COUNT; i++) {
      newLevels[i] = null;
    }
    setCategoryLevels(newLevels);
  };

  const getCategoryProductsCount = (category) => Number(category?.products_count || 0);
  const getCategorySubcategoriesCount = (category) => Number(category?.subcategories_count || 0);
  const canDeleteCategory = (category) => (
    getCategoryProductsCount(category) === 0 &&
    getCategorySubcategoriesCount(category) === 0
  );

  const normalizeCategoryName = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const getCategoryKey = (parentId, name) => `${parentId ?? 'root'}::${normalizeCategoryName(name).toLowerCase()}`;
  const getSiblingNameConflict = ({ parentId, nameRu, nameUz, excludeId = null }) => {
    const targetRu = normalizeCategoryName(nameRu).toLowerCase();
    const targetUz = normalizeCategoryName(nameUz).toLowerCase();

    return (categories || []).find((category) => {
      if ((category.parent_id ?? null) !== (parentId ?? null)) return false;
      if (excludeId && category.id === excludeId) return false;

      const categoryRu = normalizeCategoryName(category.name_ru).toLowerCase();
      const categoryUz = normalizeCategoryName(category.name_uz).toLowerCase();

      if (targetRu && categoryRu === targetRu) return true;
      if (targetUz && categoryUz && categoryUz === targetUz) return true;
      return false;
    });
  };

  const getNextAvailableSortOrder = (parentId) => {
    const existingOrders = (categories || [])
      .filter((c) => c.parent_id === parentId && c.sort_order != null)
      .map((c) => c?.sort_order)
      .sort((a, b) => a - b);

    let nextAvailable = 1;
    for (const order of existingOrders) {
      if (order === nextAvailable) {
        nextAvailable++;
      } else if (order > nextAvailable) {
        break;
      }
    }
    return nextAvailable;
  };

  // Billing functions
  const loadBillingSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/billing/settings`);
      if (response.data) {
        setBillingSettings((prev) => ({
          ...prev,
          ...response.data,
          card_number: String(response.data.card_number || '').replace(/\D/g, ''),
          catalog_animation_season: normalizeCatalogAnimationSeason(response.data.catalog_animation_season, 'off'),
          ai_enabled: response.data.ai_enabled !== false,
          default_starting_balance: normalizeMoneyFieldValue(response.data.default_starting_balance)
        }));
      }
    } catch (err) {
      console.error('Load billing settings error:', err);
    }
  };

  const saveBillingSettings = async () => {
    try {
      const payload = {
        ...billingSettings,
        card_number: String(billingSettings.card_number || '').replace(/\D/g, ''),
        catalog_animation_season: normalizeCatalogAnimationSeason(billingSettings.catalog_animation_season, 'off'),
        ai_enabled: billingSettings.ai_enabled !== false,
        default_starting_balance: String(billingSettings.default_starting_balance || '').replace(/\D/g, '')
      };
      const response = await axios.put(`${API_URL}/superadmin/billing/settings`, payload);
      if (response.data) {
        setBillingSettings((prev) => ({
          ...prev,
          ...response.data,
          card_number: String(response.data.card_number || '').replace(/\D/g, ''),
          catalog_animation_season: normalizeCatalogAnimationSeason(response.data.catalog_animation_season, 'off'),
          ai_enabled: response.data.ai_enabled !== false,
          default_starting_balance: normalizeMoneyFieldValue(response.data.default_starting_balance)
        }));
      }
      setSuccess('Настройки биллинга сохранены');
    } catch (err) {
      setError('Ошибка сохранения настроек');
    }
  };

  const saveAiFeatureFlag = async (nextEnabled) => {
    setBillingSettings((prev) => ({
      ...prev,
      ai_enabled: !!nextEnabled
    }));
    try {
      const payload = {
        ...billingSettings,
        card_number: String(billingSettings.card_number || '').replace(/\D/g, ''),
        catalog_animation_season: normalizeCatalogAnimationSeason(billingSettings.catalog_animation_season, 'off'),
        ai_enabled: !!nextEnabled,
        default_starting_balance: String(billingSettings.default_starting_balance || '').replace(/\D/g, '')
      };
      const response = await axios.put(`${API_URL}/superadmin/billing/settings`, payload);
      if (response.data) {
        setBillingSettings((prev) => ({
          ...prev,
          ...response.data,
          card_number: String(response.data.card_number || '').replace(/\D/g, ''),
          catalog_animation_season: normalizeCatalogAnimationSeason(response.data.catalog_animation_season, 'off'),
          ai_enabled: response.data.ai_enabled !== false,
          default_starting_balance: normalizeMoneyFieldValue(response.data.default_starting_balance)
        }));
      }
      setSuccess(nextEnabled ? 'AI функционал включен' : 'AI функционал выключен');
    } catch (err) {
      setBillingSettings((prev) => ({
        ...prev,
        ai_enabled: !nextEnabled
      }));
      setError('Ошибка сохранения переключателя AI');
    }
  };

  const normalizeAiProviderDraft = (item = {}) => {
    const base = createEmptyAiProviderDraft();
    return {
      ...base,
      ...item,
      local_key: item.local_key || (item.id ? `provider-${item.id}` : base.local_key),
      id: Number(item.id) || null,
      provider_type: String(item.provider_type || 'gemini').trim().toLowerCase() || 'gemini',
      api_key: '',
      clear_api_key: false,
      api_key_masked: String(item.api_key_masked || '').trim(),
      has_api_key: Boolean(item.has_api_key),
      image_model: String(item.image_model || '').trim(),
      text_model: String(item.text_model || '').trim(),
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 100,
      is_enabled: item.is_enabled !== false,
      is_active: item.is_active === true,
      config_json: (item.config_json && typeof item.config_json === 'object' && !Array.isArray(item.config_json))
        ? item.config_json
        : {}
    };
  };
  const getAiProviderKey = (item) => (item?.id ? `id-${item.id}` : String(item?.local_key || ''));

  const loadAiProviders = async () => {
    try {
      setAiProvidersLoading(true);
      const response = await axios.get(`${API_URL}/superadmin/ai/providers`);
      const providers = Array.isArray(response.data?.providers)
        ? response.data.providers.map((item) => normalizeAiProviderDraft(item))
        : [];
      setAiProviders(providers);
    } catch (err) {
      console.error('Load AI providers error:', err);
    } finally {
      setAiProvidersLoading(false);
    }
  };

  const loadAiUsageSummary = async (days = aiUsageDays) => {
    try {
      setAiUsageLoading(true);
      const normalizedDays = Number.isFinite(Number(days)) ? Number(days) : 30;
      const response = await axios.get(`${API_URL}/superadmin/ai/usage/summary`, {
        params: { days: normalizedDays }
      });
      const payload = response.data || {};
      setAiUsageSummary({
        days: Number(payload.days) || normalizedDays,
        totals: {
          total_requests: Number(payload?.totals?.total_requests || 0),
          success_requests: Number(payload?.totals?.success_requests || 0),
          failed_requests: Number(payload?.totals?.failed_requests || 0),
          text_requests: Number(payload?.totals?.text_requests || 0),
          text_success_requests: Number(payload?.totals?.text_success_requests || 0),
          text_failed_requests: Number(payload?.totals?.text_failed_requests || 0),
          image_requests: Number(payload?.totals?.image_requests || 0),
          image_success_requests: Number(payload?.totals?.image_success_requests || 0),
          image_failed_requests: Number(payload?.totals?.image_failed_requests || 0),
          quota_related_errors: Number(payload?.totals?.quota_related_errors || 0),
          estimated_cost_usd: Number(payload?.totals?.estimated_cost_usd || 0),
          text_estimated_cost_usd: Number(payload?.totals?.text_estimated_cost_usd || 0),
          image_estimated_cost_usd: Number(payload?.totals?.image_estimated_cost_usd || 0)
        },
        by_provider: Array.isArray(payload.by_provider)
          ? payload.by_provider.map((row) => ({
            ...row,
            requests: Number(row?.requests || 0),
            text_requests: Number(row?.text_requests || 0),
            image_requests: Number(row?.image_requests || 0),
            success_requests: Number(row?.success_requests || 0),
            failed_requests: Number(row?.failed_requests || 0),
            estimated_cost_usd: Number(row?.estimated_cost_usd || 0),
            text_estimated_cost_usd: Number(row?.text_estimated_cost_usd || 0),
            image_estimated_cost_usd: Number(row?.image_estimated_cost_usd || 0)
          }))
          : [],
        recent_errors: Array.isArray(payload.recent_errors) ? payload.recent_errors : []
      });
    } catch (err) {
      console.error('Load AI usage summary error:', err);
    } finally {
      setAiUsageLoading(false);
    }
  };

  const addAiProviderDraft = () => {
    setAiProviders((prev) => [...prev, createEmptyAiProviderDraft()]);
  };

  const updateAiProviderDraft = (providerKey, patch) => {
    const nextPatch = { ...patch };
    if (nextPatch.is_enabled === false) {
      nextPatch.is_active = false;
    }
    const shouldSetExclusiveActive = Object.prototype.hasOwnProperty.call(nextPatch, 'is_active')
      && nextPatch.is_active === true;

    setAiProviders((prev) => prev.map((item) => {
      const key = getAiProviderKey(item);
      if (key === providerKey) {
        return { ...item, ...nextPatch };
      }
      if (shouldSetExclusiveActive) {
        return { ...item, is_active: false };
      }
      return item;
    }));
  };
  const applyOpenRouterFreePreset = (providerKey, provider) => {
    const currentName = String(provider?.name || '').trim();
    updateAiProviderDraft(providerKey, {
      provider_type: 'openrouter',
      text_model: OPENROUTER_FREE_TEXT_MODEL,
      image_model: OPENROUTER_FREE_IMAGE_MODEL,
      name: currentName || 'OpenRouter Free'
    });
  };

  const buildAiProviderPayload = (provider = {}) => ({
    name: String(provider.name || '').trim(),
    provider_type: String(provider.provider_type || 'gemini').trim().toLowerCase(),
    api_key: String(provider.api_key || '').trim(),
    clear_api_key: provider.clear_api_key === true,
    image_model: String(provider.image_model || '').trim(),
    text_model: String(provider.text_model || '').trim(),
    priority: Number.isFinite(Number(provider.priority)) ? Number(provider.priority) : 100,
    is_enabled: provider.is_enabled !== false,
    is_active: provider.is_active === true,
    config_json: provider.config_json && typeof provider.config_json === 'object' && !Array.isArray(provider.config_json)
      ? provider.config_json
      : {}
  });

  const saveAiProvider = async (provider) => {
    const providerKey = getAiProviderKey(provider);
    const hasName = Boolean(String(provider?.name || '').trim());
    if (!hasName) {
      setError('Укажите название AI-провайдера');
      return;
    }
    try {
      setAiProviderSavingId(providerKey);
      const payload = buildAiProviderPayload(provider);

      let savedProviderId = Number(provider?.id || 0) || null;
      if (provider.id) {
        const response = await axios.put(`${API_URL}/superadmin/ai/providers/${provider.id}`, payload);
        savedProviderId = Number(response?.data?.provider?.id || provider.id) || savedProviderId;
      } else {
        const response = await axios.post(`${API_URL}/superadmin/ai/providers`, payload);
        savedProviderId = Number(response?.data?.provider?.id || 0) || null;
      }

      if (payload.is_active && savedProviderId) {
        await axios.patch(`${API_URL}/superadmin/ai/providers/${savedProviderId}/activate`);
      }

      setSuccess('AI-провайдер сохранён');
      await loadAiProviders();
      await loadAiUsageSummary(aiUsageDays);
    } catch (err) {
      setError(String(err?.response?.data?.error || 'Ошибка сохранения AI-провайдера'));
    } finally {
      setAiProviderSavingId(null);
    }
  };

  const removeAiProvider = async (provider) => {
    if (!provider?.id) {
      setAiProviders((prev) => prev.filter((item) => getAiProviderKey(item) !== getAiProviderKey(provider)));
      return;
    }
    try {
      setAiProviderDeletingId(provider.id);
      await axios.delete(`${API_URL}/superadmin/ai/providers/${provider.id}`);
      setSuccess('AI-провайдер удалён');
      await loadAiProviders();
      await loadAiUsageSummary(aiUsageDays);
    } catch (err) {
      setError(String(err?.response?.data?.error || 'Ошибка удаления AI-провайдера'));
    } finally {
      setAiProviderDeletingId(null);
    }
  };
  const testAiProvider = async (provider) => {
    if (!provider?.id) {
      setError('Сначала сохраните провайдера');
      return;
    }
    try {
      setAiProviderTestingId(provider.id);
      const testPayload = buildAiProviderPayload(provider);
      if (!String(testPayload.api_key || '').trim()) {
        delete testPayload.api_key;
      }
      const response = await axios.post(`${API_URL}/superadmin/ai/providers/${provider.id}/test`, testPayload);
      const textPreview = String(response?.data?.text_test?.preview || '').trim();
      const imageModel = String(response?.data?.image_test?.model || '').trim();
      const textModel = String(response?.data?.text_test?.model || '').trim();
      setSuccess(
        `Проверка пройдена: текст (${textModel || 'auto'}) и изображение (${imageModel || 'auto'}) получены.${textPreview ? ` Текст: ${textPreview}` : ''}`
      );
      await loadAiUsageSummary(aiUsageDays);
    } catch (err) {
      const responseData = err?.response?.data;
      const detailedErrorMessage = (() => {
        if (typeof responseData?.error === 'string') return responseData.error;
        if (typeof responseData?.error?.message === 'string') return responseData.error.message;
        if (typeof responseData?.message === 'string') return responseData.message;
        if (Array.isArray(responseData?.errors) && responseData.errors.length > 0) {
          const firstError = responseData.errors[0];
          if (typeof firstError === 'string') return firstError;
          if (typeof firstError?.message === 'string') return firstError.message;
        }
        if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
        return 'Проверка не пройдена: токен/модель не работают';
      })();
      setError(String(detailedErrorMessage));
    } finally {
      setAiProviderTestingId(null);
    }
  };

  const testCentralBot = async () => {
    if (!billingSettings.superadmin_bot_token) {
      setError('Введите токен центрального Telegram-бота');
      return;
    }

    if (!billingSettings.superadmin_telegram_id) {
      setError('Введите Telegram ID владельца суперадминки');
      return;
    }

    try {
      setIsTestingCentralBot(true);
      const response = await axios.post(`${API_URL}/superadmin/billing/settings/test-bot`, {
        superadmin_bot_token: billingSettings.superadmin_bot_token,
        superadmin_telegram_id: billingSettings.superadmin_telegram_id
      });

      setBillingSettings((prev) => ({
        ...prev,
        superadmin_bot_name: response.data?.superadmin_bot_name || '',
        superadmin_bot_username: response.data?.superadmin_bot_username || ''
      }));

      setSuccess(response.data?.message || 'Тестовое сообщение отправлено');
    } catch (err) {
      setError(err?.response?.data?.error || 'Ошибка проверки бота');
    } finally {
      setIsTestingCentralBot(false);
    }
  };

  const handleCentralTokenPreview = () => {
    if (!billingSettings.superadmin_bot_token) return;

    if (centralTokenHideTimeoutRef.current) {
      clearTimeout(centralTokenHideTimeoutRef.current);
      centralTokenHideTimeoutRef.current = null;
    }

    if (isCentralTokenVisible) {
      setIsCentralTokenVisible(false);
      return;
    }

    setIsCentralTokenVisible(true);
    centralTokenHideTimeoutRef.current = setTimeout(() => {
      setIsCentralTokenVisible(false);
      centralTokenHideTimeoutRef.current = null;
    }, 2000);
  };

  const adWeekdayOptions = useMemo(() => ([
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
    { value: 0, label: 'Вс' }
  ]), []);

  const toDatetimeLocalValue = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatAdDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU');
    } catch (e) {
      return value;
    }
  };

  const truncateAdLinkText = (value, limit = 12) => {
    const text = String(value || '');
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
  };

  const truncateAdTitleText = (value, limit = 10) => {
    const text = String(value || '').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
  };

  const getAdTypeLabel = (type) => {
    const normalized = String(type || '').trim().toLowerCase();
    if (language === 'uz') {
      return normalized === 'entry_popup' ? 'Kirish popup' : 'Banner';
    }
    return normalized === 'entry_popup' ? 'Popup при входе' : 'Баннер';
  };

  const resolveAdPreviewImageUrl = (url) => {
    const normalized = String(url || '').trim();
    if (!normalized) return '';
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(normalized)) return normalized;
    return `${API_URL.replace('/api', '')}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
  };

  const adPreviewRestaurantOptions = useMemo(() => (
    [...(Array.isArray(allRestaurants) ? allRestaurants : [])]
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'))
  ), [allRestaurants]);
  const overviewAnalyticsRestaurantOptions = useMemo(() => (
    [...(Array.isArray(allRestaurants) ? allRestaurants : [])]
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'))
  ), [allRestaurants]);
  const selectedOverviewAnalyticsRestaurant = useMemo(() => (
    overviewAnalyticsRestaurantOptions.find((restaurant) => String(restaurant.id) === String(overviewAnalyticsRestaurantId)) || null
  ), [overviewAnalyticsRestaurantOptions, overviewAnalyticsRestaurantId]);
  const overviewAnalyticsRestaurantButtonLabel = selectedOverviewAnalyticsRestaurant?.name
    || (language === 'uz' ? "Barcha do'konlar" : 'Все магазины');
  const filteredOverviewAnalyticsRestaurants = useMemo(() => {
    const query = String(overviewRestaurantSearch || '').trim().toLowerCase();
    if (!query) return overviewAnalyticsRestaurantOptions;
    return overviewAnalyticsRestaurantOptions.filter((restaurant) => (
      String(restaurant?.name || '').toLowerCase().includes(query)
    ));
  }, [overviewAnalyticsRestaurantOptions, overviewRestaurantSearch]);
  const filteredOverviewCompareRestaurants = useMemo(() => {
    const query = String(overviewCompareRestaurantSearch || '').trim().toLowerCase();
    if (!query) return overviewAnalyticsRestaurantOptions;
    return overviewAnalyticsRestaurantOptions.filter((restaurant) => (
      String(restaurant?.name || '').toLowerCase().includes(query)
    ));
  }, [overviewAnalyticsRestaurantOptions, overviewCompareRestaurantSearch]);
  const overviewComparisonRestaurantNames = useMemo(() => (
    overviewComparisonRestaurantIds.map((id) => (
      overviewAnalyticsRestaurantOptions.find((restaurant) => String(restaurant.id) === String(id))?.name || String(id)
    ))
  ), [overviewComparisonRestaurantIds, overviewAnalyticsRestaurantOptions]);

  const selectedAdPreviewRestaurant = useMemo(() => {
    if (!adPreviewRestaurantOptions.length) return null;
    const selectedId = Number.parseInt(adPreviewRestaurantId, 10);
    if (Number.isInteger(selectedId) && selectedId > 0) {
      const exact = adPreviewRestaurantOptions.find((restaurant) => Number(restaurant.id) === selectedId);
      if (exact) return exact;
    }
    return adPreviewRestaurantOptions[0] || null;
  }, [adPreviewRestaurantOptions, adPreviewRestaurantId]);

  const adPreviewRestaurantLogoUrl = resolveAdPreviewImageUrl(selectedAdPreviewRestaurant?.logo_url || '');

  const getAdStatusLabel = (status) => {
    const map = {
      active: 'Активна',
      scheduled: 'Запланирована',
      finished: 'Завершена',
      disabled: 'Выключена',
      paused_by_days: 'По расписанию (сейчас скрыта)',
      deleted: 'Архивирована'
    };
    return map[status] || status;
  };

  const getAdStatusBadgeClass = (status) => {
    if (status === 'active') return 'bg-success bg-opacity-10 text-success';
    if (status === 'scheduled') return 'bg-info bg-opacity-10 text-info';
    if (status === 'finished' || status === 'deleted') return 'bg-secondary bg-opacity-10 text-muted';
    if (status === 'disabled' || status === 'paused_by_days') return 'bg-warning bg-opacity-10 text-warning';
    return 'bg-secondary bg-opacity-10 text-muted';
  };

  const formatAdAnalyticsDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
    } catch {
      return String(value);
    }
  };

  const formatAdAnalyticsDay = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
    } catch {
      return String(value);
    }
  };

  const formatAnalyticsPercent = (value) => {
    const num = Number(value || 0);
    return `${num.toFixed(2)}%`;
  };
  const renderAnalyticsPaymentMethodIcon = (methodKey, fallbackLabel = '') => {
    const label = fallbackLabel || methodKey || 'payment';
    if (methodKey === 'click' || methodKey === 'payme' || methodKey === 'xazna' || methodKey === 'uzum') {
      return (
        <img
          src={`/${methodKey}.png`}
          alt={label}
          title={label}
          style={{ height: 18, width: 'auto', objectFit: 'contain', borderRadius: 4 }}
        />
      );
    }
    if (methodKey === 'cash') return <span title={label} aria-label={label}>💵</span>;
    if (methodKey === 'card') return <span title={label} aria-label={label}>💳</span>;
    return <span title={label}>{label}</span>;
  };
  const shouldRenderAnalyticsPaymentMethodText = (methodKey) => !['payme', 'click', 'uzum', 'xazna'].includes(String(methodKey || '').trim().toLowerCase());

  const formatDeviceTypeLabel = (type) => {
    const map = language === 'uz'
      ? { mobile: 'Telefon', tablet: 'Planshet', desktop: 'Kompyuter', smarttv: 'TV' }
      : { mobile: 'Телефон', tablet: 'Планшет', desktop: 'ПК', smarttv: 'TV' };
    return map[type] || type || (language === 'uz' ? "Noma'lum" : 'Неизвестно');
  };

  const buildBrowserAnalyticsLabel = (item) => {
    const base = item?.browser_name || 'Unknown';
    if (item?.app_container) return `${item.app_container} / ${base}`;
    return base;
  };

  const buildDeviceAnalyticsLabel = (item) => {
    const parts = [
      item?.device_brand,
      item?.device_model && item.device_model !== item?.device_brand ? item.device_model : null
    ].filter(Boolean);
    const primary = parts.join(' ') || (item?.device_model || formatDeviceTypeLabel(item?.device_type));
    const os = [item?.os_name, item?.os_version].filter(Boolean).join(' ');
    return os ? `${primary} · ${os}` : primary;
  };

  const aggregateAdAnalyticsRows = (rows, getKey) => {
    const map = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const key = String(getKey(row) || '').trim() || 'Unknown';
      const current = map.get(key) || { key, views: 0, clicks: 0, unique_views: 0 };
      current.views += Number(row?.views || 0);
      current.clicks += Number(row?.clicks || 0);
      current.unique_views += Number(row?.unique_views || 0);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => (b.views - a.views) || (b.clicks - a.clicks) || a.key.localeCompare(b.key));
  };

  const resetAdBannerForm = () => {
    setEditingAdBanner(null);
    setAdBannerImageMeta(null);
    setAdBannerForm({
      title: '',
      image_url: '',
      button_text: 'Открыть',
      target_url: '',
      ad_type: 'banner',
      target_activity_type_ids: [],
      slot_order: 1,
      display_seconds: 5,
      transition_effect: 'fade',
      start_at: '',
      end_at: '',
      repeat_days: [],
      is_enabled: true
    });
  };

  const openAdBannerModal = (banner = null) => {
    if (!activityTypes.length) {
      loadActivityTypes();
    }
    if (!allRestaurants.length) {
      loadInternalRestaurants();
    }
    if (!banner) {
      resetAdBannerForm();
      setShowAdBannerModal(true);
      return;
    }

    setEditingAdBanner(banner);
    setAdBannerImageMeta(null);
    setAdBannerForm({
      title: banner.title || '',
      image_url: banner.image_url || '',
      button_text: banner.button_text || 'Открыть',
      target_url: banner.target_url || '',
      ad_type: banner.ad_type || 'banner',
      target_activity_type_ids: Array.isArray(banner.target_activity_type_ids) ? banner.target_activity_type_ids.map(Number) : [],
      slot_order: banner.slot_order || 1,
      display_seconds: banner.display_seconds || 5,
      transition_effect: banner.transition_effect || 'fade',
      start_at: toDatetimeLocalValue(banner.start_at),
      end_at: toDatetimeLocalValue(banner.end_at),
      repeat_days: Array.isArray(banner.repeat_days) ? banner.repeat_days.map(Number) : [],
      is_enabled: !!banner.is_enabled
    });
    setShowAdBannerModal(true);
  };

  const loadAdBanners = async () => {
    try {
      setAdBannersLoading(true);
      const response = await axios.get(`${API_URL}/superadmin/ads/banners`, {
        params: { status: adBannerStatusFilter }
      });
      setAdBanners(response.data?.items || []);
      setAdBannersPage(1);
      setAdBannersMeta({
        max_slots: response.data?.max_slots || 10,
        active_now_count: response.data?.active_now_count || 0
      });
    } catch (err) {
      console.error('Load ad banners error:', err);
      setError(err.response?.data?.error || 'Ошибка загрузки рекламы');
    } finally {
      setAdBannersLoading(false);
    }
  };

  const loadAdBannerAnalytics = async (bannerId, days = adBannerAnalyticsDays) => {
    try {
      setAdBannerAnalyticsLoading(true);
      const params = {};
      if (days === 'all' || days === null) params.days = 'all';
      else params.days = Number(days) || 30;
      const response = await axios.get(`${API_URL}/superadmin/ads/banners/${bannerId}/analytics`, { params });
      setAdBannerAnalytics(response.data || null);
    } catch (err) {
      console.error('Load ad analytics error:', err);
      setError(err.response?.data?.error || 'Ошибка загрузки аналитики рекламы');
    } finally {
      setAdBannerAnalyticsLoading(false);
    }
  };

  const openAdAnalyticsModal = (banner) => {
    if (!banner?.id) return;
    setAnalyticsAdBanner(banner);
    setAdBannerAnalytics(null);
    setShowAdAnalyticsModal(true);
  };

  const handleAdBannerImageUpload = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Файл рекламы слишком большой (макс. 8MB)');
      return;
    }
    setUploadingAdBannerImage(true);
    try {
      const imageDimensions = await new Promise((resolve) => {
        try {
          const objectUrl = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            const result = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
            URL.revokeObjectURL(objectUrl);
            resolve(result);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
          };
          img.src = objectUrl;
        } catch {
          resolve(null);
        }
      });

      const formData = new FormData();
      formData.append('image', file);
      formData.append('preset', 'ad');
      const response = await axios.post(`${API_URL}/upload/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fullUrl = response.data?.url
        ? `${window.location.origin}${response.data.url}`
        : (response.data?.imageUrl ? `${window.location.origin}${response.data.imageUrl}` : '');
      setAdBannerForm((prev) => ({ ...prev, image_url: fullUrl }));
      setAdBannerImageMeta(imageDimensions);
      setSuccess('Изображение рекламы загружено');
    } catch (err) {
      console.error('Ad banner image upload error:', err);
      setError('Ошибка загрузки изображения рекламы');
    } finally {
      setUploadingAdBannerImage(false);
    }
  };

  const saveAdBanner = async () => {
    try {
      const payload = {
        ...adBannerForm,
        target_activity_type_ids: (adBannerForm.target_activity_type_ids || [])
          .map(Number)
          .filter((v) => Number.isInteger(v) && v > 0)
          .sort((a, b) => a - b),
        slot_order: Number(adBannerForm.slot_order),
        display_seconds: Number(adBannerForm.display_seconds),
        repeat_days: (adBannerForm.repeat_days || []).map(Number).sort((a, b) => a - b),
        start_at: adBannerForm.start_at ? new Date(adBannerForm.start_at).toISOString() : null,
        end_at: adBannerForm.end_at ? new Date(adBannerForm.end_at).toISOString() : null
      };

      if (editingAdBanner?.id) {
        await axios.put(`${API_URL}/superadmin/ads/banners/${editingAdBanner.id}`, payload);
        setSuccess('Рекламный слот обновлен');
      } else {
        await axios.post(`${API_URL}/superadmin/ads/banners`, payload);
        setSuccess('Рекламный слот создан');
      }
      setShowAdBannerModal(false);
      resetAdBannerForm();
      loadAdBanners();
    } catch (err) {
      console.error('Save ad banner error:', err);
      const serverError = err.response?.data?.error;
      const serverDetails = err.response?.data?.details;
      const isPopupType = String(adBannerForm.ad_type || 'banner') === 'entry_popup';
      const fallbackHint = adBannerImageMeta
        ? ` Размер вашего баннера: ${adBannerImageMeta.width}x${adBannerImageMeta.height}px. Рекомендуемый размер: ${isPopupType ? '1080x1350px (вертикальный popup)' : '1200x500px (широкий баннер)'}.`
        : ` Рекомендуемый размер: ${isPopupType ? '1080x1350px (вертикальный popup)' : '1200x500px (широкий баннер)'}.`;
      const baseMessage = serverError || 'Ошибка сохранения рекламного слота';
      const detailsText = serverDetails ? ` Причина: ${serverDetails}.` : '';
      setError(`${baseMessage}.${detailsText}${fallbackHint}`.replace(/\.\./g, '.'));
    }
  };

  const toggleAdBanner = async (banner) => {
    try {
      await axios.patch(`${API_URL}/superadmin/ads/banners/${banner.id}/toggle`);
      setSuccess(`Реклама ${banner.is_enabled ? 'выключена' : 'включена'}`);
      loadAdBanners();
    } catch (err) {
      console.error('Toggle ad banner error:', err);
      setError(err.response?.data?.error || 'Ошибка переключения рекламы');
    }
  };

  const deleteAdBanner = async (banner) => {
    const ok = window.confirm(`Архивировать рекламу "${banner.title}"?`);
    if (!ok) return;
    try {
      await axios.delete(`${API_URL}/superadmin/ads/banners/${banner.id}`);
      setSuccess('Реклама отправлена в архив');
      loadAdBanners();
    } catch (err) {
      console.error('Delete ad banner error:', err);
      setError(err.response?.data?.error || 'Ошибка архивирования рекламы');
    }
  };

  const toggleAdBannerWeekday = (weekday) => {
    setAdBannerForm((prev) => {
      const current = new Set((prev.repeat_days || []).map(Number));
      if (current.has(weekday)) current.delete(weekday);
      else current.add(weekday);
      return { ...prev, repeat_days: [...current].sort((a, b) => a - b) };
    });
  };

  const toggleAdBannerActivityType = (activityTypeId) => {
    const id = Number(activityTypeId);
    if (!Number.isInteger(id) || id <= 0) return;

    setAdBannerForm((prev) => {
      const current = new Set((prev.target_activity_type_ids || []).map(Number));
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, target_activity_type_ids: [...current].sort((a, b) => a - b) };
    });
  };

  const customerRestaurantOptions = useMemo(() => {
    const term = customerRestaurantSearch.trim().toLowerCase();
    const filtered = allRestaurants.filter((restaurant) => (
      !term || restaurant.name?.toLowerCase().includes(term)
    ));

    if (!customerRestaurantFilter) return filtered;

    const selected = allRestaurants.find((restaurant) => String(restaurant.id) === String(customerRestaurantFilter));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [allRestaurants, customerRestaurantSearch, customerRestaurantFilter]);

  const adBannerActivityTypeFilterOptions = useMemo(() => {
    return [...(activityTypes || [])].sort((a, b) => {
      const orderDiff = Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'ru');
    });
  }, [activityTypes]);

  const filteredAdBanners = useMemo(() => {
    if (adBannerActivityTypeFilter === 'all') return adBanners;
    if (adBannerActivityTypeFilter === 'untargeted') {
      return (adBanners || []).filter((banner) => !Array.isArray(banner?.target_activity_type_ids) || banner.target_activity_type_ids.length === 0);
    }

    const targetId = Number(adBannerActivityTypeFilter);
    if (!Number.isInteger(targetId) || targetId <= 0) return adBanners;

    return (adBanners || []).filter((banner) => (
      Array.isArray(banner?.target_activity_type_ids) &&
      banner.target_activity_type_ids.map(Number).includes(targetId)
    ));
  }, [adBanners, adBannerActivityTypeFilter]);

  const pagedAdBanners = useMemo(() => {
    const start = (adBannersPage - 1) * adBannersLimit;
    return filteredAdBanners.slice(start, start + adBannersLimit);
  }, [filteredAdBanners, adBannersPage, adBannersLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((filteredAdBanners.length || 0) / adBannersLimit));
    if (adBannersPage > totalPages) setAdBannersPage(totalPages);
  }, [filteredAdBanners.length, adBannersLimit, adBannersPage]);

  const operatorRestaurantOptions = useMemo(() => {
    const term = operatorRestaurantSearch.trim().toLowerCase();
    const filtered = allRestaurants.filter((restaurant) => (
      !term || restaurant.name?.toLowerCase().includes(term)
    ));

    if (!operatorRestaurantFilter) return filtered;

    const selected = allRestaurants.find((restaurant) => String(restaurant.id) === String(operatorRestaurantFilter));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [allRestaurants, operatorRestaurantSearch, operatorRestaurantFilter]);

  const billingOpsRestaurantOptions = useMemo(() => {
    const term = billingOpsRestaurantSearch.trim().toLowerCase();
    const filtered = allRestaurants.filter((restaurant) => (
      !term || String(restaurant.name || '').toLowerCase().includes(term)
    ));

    if (!billingOpsFilter.restaurant_id) return filtered;

    const selected = allRestaurants.find((restaurant) => String(restaurant.id) === String(billingOpsFilter.restaurant_id));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [allRestaurants, billingOpsRestaurantSearch, billingOpsFilter.restaurant_id]);
  const foundersTotalsByCurrency = useMemo(() => (
    Array.isArray(foundersAnalyticsData?.totals_by_currency)
      ? foundersAnalyticsData.totals_by_currency
      : []
  ), [foundersAnalyticsData]);
  const foundersFounderModuleTotals = useMemo(() => (
    Array.isArray(foundersAnalyticsData?.founder_module_totals)
      ? foundersAnalyticsData.founder_module_totals
      : []
  ), [foundersAnalyticsData]);
  const foundersMonthlyTotals = useMemo(() => (
    Array.isArray(foundersAnalyticsData?.founder_monthly_totals)
      ? foundersAnalyticsData.founder_monthly_totals
      : []
  ), [foundersAnalyticsData]);
  const foundersSharesConfig = useMemo(() => (
    Array.isArray(foundersAnalyticsData?.shares_config)
      ? foundersAnalyticsData.shares_config
      : []
  ), [foundersAnalyticsData]);
  const foundersExpenseCategoryTotals = useMemo(() => (
    Array.isArray(foundersAnalyticsData?.expense_category_totals)
      ? foundersAnalyticsData.expense_category_totals
      : []
  ), [foundersAnalyticsData]);
  const foundersAvailableCurrencies = useMemo(() => {
    const fromApi = Array.isArray(foundersAnalyticsData?.available_currencies)
      ? foundersAnalyticsData.available_currencies
      : [];
    const set = new Set(
      fromApi
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
    );
    if (!set.size) {
      foundersTotalsByCurrency.forEach((row) => {
        const code = String(row?.currency_code || '').trim().toLowerCase();
        if (code) set.add(code);
      });
      foundersFounderModuleTotals.forEach((row) => {
        const code = String(row?.currency_code || '').trim().toLowerCase();
        if (code) set.add(code);
      });
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right, 'ru'));
  }, [foundersAnalyticsData?.available_currencies, foundersTotalsByCurrency, foundersFounderModuleTotals]);
  const foundersModulesConfig = useMemo(() => {
    const fallbackMap = new Map(
      FOUNDERS_MODULE_UI_ORDER.map((item) => ([
        item.key,
        {
          key: item.key,
          label: language === 'uz' ? item.labelUz : item.labelRu
        }
      ]))
    );
    const apiItems = Array.isArray(foundersAnalyticsData?.modules_config)
      ? foundersAnalyticsData.modules_config
      : [];

    const ordered = [];
    for (const fallbackItem of FOUNDERS_MODULE_UI_ORDER) {
      const fromApi = apiItems.find((item) => String(item?.key || '').trim().toLowerCase() === fallbackItem.key);
      if (fromApi) {
        ordered.push({
          key: fallbackItem.key,
          label: String(fromApi?.label || '').trim() || fallbackMap.get(fallbackItem.key)?.label || fallbackItem.labelRu
        });
      } else {
        ordered.push(fallbackMap.get(fallbackItem.key));
      }
    }

    for (const apiItem of apiItems) {
      const key = String(apiItem?.key || '').trim().toLowerCase();
      if (!key || ordered.some((item) => item.key === key)) continue;
      ordered.push({
        key,
        label: String(apiItem?.label || key).trim()
      });
    }
    return ordered.filter(Boolean);
  }, [foundersAnalyticsData?.modules_config, language]);
  const foundersCardsData = useMemo(() => {
    const foundersSource = foundersSharesConfig.length
      ? foundersSharesConfig
      : Array.from(
        new Map(
          (Array.isArray(foundersAnalyticsData?.founder_totals) ? foundersAnalyticsData.founder_totals : [])
            .map((row) => [String(row?.founder_key || '').trim().toLowerCase(), row])
            .filter(([key]) => key)
        ).values()
      );
    const moduleMap = new Map(
      foundersFounderModuleTotals.map((row) => {
        const founderKey = String(row?.founder_key || '').trim().toLowerCase();
        const moduleKey = String(row?.module_key || '').trim().toLowerCase();
        const currencyCode = String(row?.currency_code || '').trim().toLowerCase();
        return [`${founderKey}__${moduleKey}__${currencyCode}`, row];
      })
    );
    const founderTotalsMap = new Map(
      (Array.isArray(foundersAnalyticsData?.founder_totals) ? foundersAnalyticsData.founder_totals : []).map((row) => {
        const founderKey = String(row?.founder_key || '').trim().toLowerCase();
        const currencyCode = String(row?.currency_code || '').trim().toLowerCase();
        return [`${founderKey}__${currencyCode}`, row];
      })
    );

    return foundersSource.map((founder, founderIndex) => {
      const founderKey = String(founder?.key || founder?.founder_key || '').trim().toLowerCase();
      const founderName = String(founder?.name || founder?.founder_name || `Founder ${founderIndex + 1}`).trim();

      const modules = foundersModulesConfig.map((moduleItem) => {
        const amountsByCurrency = foundersAvailableCurrencies.map((currencyCode) => {
          const item = moduleMap.get(`${founderKey}__${moduleItem.key}__${currencyCode}`);
          return {
            currency_code: currencyCode,
            founder_amount: Number(item?.founder_amount || 0),
            founder_percent: Number(item?.founder_percent || 0)
          };
        });
        const moduleTotal = amountsByCurrency.reduce((acc, item) => acc + Number(item.founder_amount || 0), 0);
        return {
          module_key: moduleItem.key,
          module_label: moduleItem.label,
          amounts_by_currency: amountsByCurrency,
          total_amount: Math.round((moduleTotal + Number.EPSILON) * 100) / 100
        };
      });

      const totalByCurrency = foundersAvailableCurrencies.map((currencyCode) => {
        const summaryRow = founderTotalsMap.get(`${founderKey}__${currencyCode}`);
        const grossAmount = Number(summaryRow?.gross_amount || 0);
        const expenseAmount = Number(summaryRow?.expense_amount || 0);
        const netAmount = Number(summaryRow?.total_amount || 0);
        return {
          currency_code: currencyCode,
          gross_amount: Math.round((grossAmount + Number.EPSILON) * 100) / 100,
          expense_amount: Math.round((expenseAmount + Number.EPSILON) * 100) / 100,
          amount: Math.round((netAmount + Number.EPSILON) * 100) / 100
        };
      });
      const founderTotal = totalByCurrency.reduce((acc, row) => acc + Number(row.amount || 0), 0);

      return {
        founder_key: founderKey,
        founder_name: founderName,
        order_percent: Number(founder?.order_percent || founder?.orderPercent || 0),
        reservation_percent: Number(founder?.reservation_percent || founder?.reservationPercent || 0),
        modules,
        total_by_currency: totalByCurrency,
        total_amount: Math.round((founderTotal + Number.EPSILON) * 100) / 100
      };
    });
  }, [
    foundersSharesConfig,
    foundersAnalyticsData?.founder_totals,
    foundersFounderModuleTotals,
    foundersModulesConfig,
    foundersAvailableCurrencies
  ]);
  const foundersChartCurrencyResolved = useMemo(() => {
    const normalized = String(foundersChartsCurrency || '').trim().toLowerCase();
    if (normalized && foundersAvailableCurrencies.includes(normalized)) return normalized;
    return resolvePreferredFoundersCurrencyCode(foundersAvailableCurrencies, countryCurrency?.code);
  }, [foundersChartsCurrency, foundersAvailableCurrencies, countryCurrency?.code]);
  useEffect(() => {
    const normalized = String(foundersChartsCurrency || '').trim().toLowerCase();
    const resolved = String(foundersChartCurrencyResolved || '').trim().toLowerCase();
    if (normalized === resolved) return;
    setFoundersChartsCurrency(resolved);
  }, [foundersChartsCurrency, foundersChartCurrencyResolved]);
  const foundersTrailingMonthsWindow = useMemo(() => {
    const currencyCode = String(foundersChartCurrencyResolved || '').trim().toLowerCase();
    const selectedCurrencyRows = [
      ...(Array.isArray(foundersMonthlyTotals) ? foundersMonthlyTotals : []),
      ...(Array.isArray(foundersAnalyticsData?.module_monthly_totals) ? foundersAnalyticsData.module_monthly_totals : [])
    ].filter((row) => (
      String(row?.currency_code || '').trim().toLowerCase() === currencyCode
    ));
    const latestMonthFromRows = selectedCurrencyRows.reduce((latest, row) => {
      const parsed = parseMonthStartFromValue(row?.month_key);
      if (!parsed) return latest;
      if (!latest) return parsed;
      return parsed > latest ? parsed : latest;
    }, null);
    const periodEndMonth = parseMonthStartFromValue(foundersAnalyticsData?.period?.end_date);
    const filterEndMonth = parseMonthStartFromValue(foundersAnalyticsFilter.end_date);
    const fallbackCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const resolvedEndMonth = filterEndMonth || periodEndMonth || latestMonthFromRows || fallbackCurrentMonth;
    return buildTrailingMonthsWindow(resolvedEndMonth, 12);
  }, [
    foundersChartCurrencyResolved,
    foundersMonthlyTotals,
    foundersAnalyticsData?.module_monthly_totals,
    foundersAnalyticsData?.period?.end_date,
    foundersAnalyticsFilter.end_date
  ]);
  const foundersMonthlyAreaChartData = useMemo(() => {
    const currencyCode = foundersChartCurrencyResolved;
    if (!currencyCode) return [];
    const foundersOrder = foundersCardsData.map((item) => item.founder_key);
    const grouped = new Map(
      foundersTrailingMonthsWindow.map((monthItem) => ([
        monthItem.month_key,
        {
          month_key: monthItem.month_key,
          month_label: monthItem.month_label
        }
      ]))
    );
    foundersMonthlyTotals
      .filter((row) => String(row?.currency_code || '').trim().toLowerCase() === currencyCode)
      .forEach((row) => {
        const monthKey = String(row?.month_key || '').trim();
        if (!monthKey || !grouped.has(monthKey)) return;
        const target = grouped.get(monthKey);
        const founderKey = String(row?.founder_key || '').trim().toLowerCase();
        if (!founderKey) return;
        target[founderKey] = Number(target[founderKey] || 0) + Number(row?.total_amount || 0);
      });
    return foundersTrailingMonthsWindow.map((monthItem) => {
      const source = grouped.get(monthItem.month_key) || {
        month_key: monthItem.month_key,
        month_label: monthItem.month_label
      };
      const target = {
        month_key: monthItem.month_key,
        month_label: monthItem.month_label
      };
      foundersOrder.forEach((founderKey) => {
        target[founderKey] = Number(source?.[founderKey] || 0);
      });
      return target;
    });
  }, [foundersMonthlyTotals, foundersChartCurrencyResolved, foundersCardsData, foundersTrailingMonthsWindow]);
  const foundersMonthlyModulesChartData = useMemo(() => {
    const currencyCode = foundersChartCurrencyResolved;
    if (!currencyCode) return [];
    const rows = Array.isArray(foundersAnalyticsData?.module_monthly_totals)
      ? foundersAnalyticsData.module_monthly_totals
      : [];
    const grouped = new Map(
      foundersTrailingMonthsWindow.map((monthItem) => ([
        monthItem.month_key,
        {
          month_key: monthItem.month_key,
          month_label: monthItem.month_label
        }
      ]))
    );
    rows
      .filter((row) => String(row?.currency_code || '').trim().toLowerCase() === currencyCode)
      .forEach((row) => {
        const monthKey = String(row?.month_key || '').trim();
        if (!monthKey || !grouped.has(monthKey)) return;
        const moduleKey = String(row?.module_key || '').trim().toLowerCase();
        if (!moduleKey) return;
        const target = grouped.get(monthKey);
        target[moduleKey] = Number(target[moduleKey] || 0) + Number(row?.amount || 0);
      });
    return foundersTrailingMonthsWindow.map((monthItem) => {
      const source = grouped.get(monthItem.month_key) || {
        month_key: monthItem.month_key,
        month_label: monthItem.month_label
      };
      const target = {
        month_key: monthItem.month_key,
        month_label: monthItem.month_label
      };
      foundersModulesConfig.forEach((moduleItem) => {
        target[moduleItem.key] = Number(source?.[moduleItem.key] || 0);
      });
      return target;
    });
  }, [foundersAnalyticsData?.module_monthly_totals, foundersChartCurrencyResolved, foundersModulesConfig, foundersTrailingMonthsWindow]);
  const foundersFoundersBarChartData = useMemo(() => {
    const currencyCode = foundersChartCurrencyResolved;
    if (!currencyCode) return [];
    return foundersCardsData.map((founderItem, index) => {
      const currencyTotal = founderItem.total_by_currency.find((item) => item.currency_code === currencyCode);
      return {
        founder_key: founderItem.founder_key,
        founder_name: founderItem.founder_name,
        founder_percent_label: `${Number(founderItem.order_percent || 0)}% / ${Number(founderItem.reservation_percent || 0)}%`,
        amount: Number(currencyTotal?.amount || 0),
        fill: FOUNDERS_CHART_COLORS[founderItem.founder_key] || ['#4f46e5', '#0ea5e9', '#22c55e'][index % 3]
      };
    });
  }, [foundersCardsData, foundersChartCurrencyResolved]);
  const foundersGeneratedAtLabel = useMemo(() => {
    const raw = foundersAnalyticsData?.generated_at;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
  }, [foundersAnalyticsData?.generated_at, language]);
  const foundersExpenseCategoryRows = useMemo(() => {
    const grouped = new Map();
    foundersExpenseCategoryTotals.forEach((row) => {
      const categoryId = Number(row?.category_id || 0);
      const key = categoryId > 0 ? `id:${categoryId}` : `name:${String(row?.category_name_ru || row?.category_name_uz || '').trim().toLowerCase()}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          category_id: categoryId > 0 ? categoryId : null,
          category_name_ru: String(row?.category_name_ru || '').trim() || '—',
          category_name_uz: String(row?.category_name_uz || '').trim() || '',
          currencies: []
        });
      }
      const target = grouped.get(key);
      const amount = Number(row?.amount || 0);
      const recordsCount = Number(row?.records_count || 0);
      const currencyCode = String(row?.currency_code || '').trim().toLowerCase();
      if (!currencyCode) return;
      target.currencies.push({
        currency_code: currencyCode,
        amount,
        records_count: recordsCount
      });
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        currencies: [...item.currencies].sort((left, right) => String(left.currency_code || '').localeCompare(String(right.currency_code || ''), 'ru'))
      }))
      .sort((left, right) => String(left.category_name_ru || '').localeCompare(String(right.category_name_ru || ''), 'ru'));
  }, [foundersExpenseCategoryTotals]);
  const organizationExpenseCategoryOptions = useMemo(() => (
    [...(Array.isArray(organizationExpenseCategories) ? organizationExpenseCategories : [])]
      .sort((left, right) => String(left?.name_ru || '').localeCompare(String(right?.name_ru || ''), 'ru'))
  ), [organizationExpenseCategories]);
  const organizationExpenseCategoryFilteredOptions = useMemo(() => {
    const source = Array.isArray(organizationExpenseCategoryOptions) ? organizationExpenseCategoryOptions : [];
    const query = String(organizationExpenseCategorySearch || '').trim().toLowerCase();
    if (!query) return source;
    return source.filter((item) => {
      const ru = String(item?.name_ru || '').trim().toLowerCase();
      const uz = String(item?.name_uz || '').trim().toLowerCase();
      const code = String(item?.code || '').trim().toLowerCase();
      return ru.includes(query) || uz.includes(query) || code.includes(query) || String(item?.id || '').includes(query);
    });
  }, [organizationExpenseCategoryOptions, organizationExpenseCategorySearch]);
  const organizationExpenseCategoryRowsById = useMemo(() => (
    [...(Array.isArray(organizationExpenseCategories) ? organizationExpenseCategories : [])]
      .sort((left, right) => {
        const leftId = Number(left?.id || 0);
        const rightId = Number(right?.id || 0);
        return leftId - rightId;
      })
  ), [organizationExpenseCategories]);
  const foundersRestaurantOperatorMap = useMemo(() => {
    const map = new Map();
    const source = Array.isArray(allOperators) ? allOperators : [];
    source.forEach((operator) => {
      const operatorName = String(operator?.full_name || operator?.username || '').trim();
      if (!operatorName) return;
      const restaurantsList = Array.isArray(operator?.restaurants) ? operator.restaurants : [];
      restaurantsList.forEach((restaurantItem) => {
        const restaurantId = Number(restaurantItem?.id || 0);
        if (!Number.isFinite(restaurantId) || restaurantId <= 0) return;
        if (!map.has(restaurantId)) map.set(restaurantId, []);
        const names = map.get(restaurantId);
        if (!names.includes(operatorName)) names.push(operatorName);
      });
      const activeRestaurantId = Number(operator?.active_restaurant_id || 0);
      if (Number.isFinite(activeRestaurantId) && activeRestaurantId > 0) {
        if (!map.has(activeRestaurantId)) map.set(activeRestaurantId, []);
        const names = map.get(activeRestaurantId);
        if (!names.includes(operatorName)) names.push(operatorName);
      }
    });
    return map;
  }, [allOperators]);
  const shopsMapPoints = useMemo(() => {
    const rawPoints = (Array.isArray(allRestaurants) ? allRestaurants : [])
      .map((restaurant) => {
        const lat = Number(restaurant?.latitude);
        const lng = Number(restaurant?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        // Guard against accidental out-of-region coordinates that break map fit and clustering.
        if (lat < 30 || lat > 50 || lng < 45 || lng > 90) return null;
        const restaurantId = Number(restaurant?.id || 0);
        const operatorNames = foundersRestaurantOperatorMap.get(restaurantId) || [];
        const mappedIssueCount = Number(restaurantIssueCountMap?.[restaurantId]);
        const token = String(restaurant?.telegram_bot_token || '').trim();
        const botMetaError = String(restaurant?.telegram_bot_meta_error || '').trim();
        const botUsername = String(restaurant?.telegram_bot_username || '').trim();
        const quickIssueCount = (!token || botMetaError || !botUsername) ? 1 : 0;
        const issuesCount = Number.isFinite(mappedIssueCount)
          ? Math.max(0, mappedIssueCount)
          : quickIssueCount;
        const currencyCode = String(restaurant?.currency_code || countryCurrency?.code || 'uz').trim().toLowerCase();
        const currencyLabel = currencyCode === 'uz'
          ? (language === 'uz' ? "so'm" : 'сум')
          : (currencyCode === 'tj'
            ? (language === 'uz' ? 'somoni' : 'сомони')
            : (currencyCode === 'kz'
              ? (language === 'uz' ? 'tenge' : 'тенге')
              : String(currencyCode || '').toUpperCase()));
        return {
          id: restaurantId > 0 ? restaurantId : `${lat}:${lng}`,
          lat,
          lng,
          name: String(restaurant?.name || '').trim() || '—',
          activityType: String(restaurant?.activity_type_name || '').trim() || (language === 'uz' ? "Faoliyat turi tanlanmagan" : 'Вид деятельности не выбран'),
          phone: String(restaurant?.phone || '').trim() || '—',
          balance: Number(restaurant?.balance || 0),
          currencyCode,
          currencyLabel,
          operatorLabel: operatorNames.length
            ? operatorNames.join(', ')
            : (language === 'uz' ? "Operator biriktirilmagan" : 'Оператор не назначен'),
          productsCount: Math.max(0, Number(restaurant?.products_count || 0)),
          ordersCount: Math.max(0, Number(restaurant?.orders_count || 0)),
          issuesCount
        };
      })
      .filter(Boolean);

    if (rawPoints.length < 6) return rawPoints;

    const medianLat = getMedianValue(rawPoints.map((item) => item.lat));
    const medianLng = getMedianValue(rawPoints.map((item) => item.lng));
    const softLatDelta = 4.6;
    const softLngDelta = 7.2;
    const filteredOutliers = rawPoints.filter((point) => {
      const latDelta = Math.abs(Number(point.lat) - medianLat);
      const lngDelta = Math.abs(Number(point.lng) - medianLng);
      const isInSoftBounds = latDelta <= softLatDelta && lngDelta <= softLngDelta;
      if (isInSoftBounds) return true;
      // Keep remote points only when they have real activity, otherwise they distort map bounds.
      return Number(point.ordersCount || 0) > 0 || Number(point.productsCount || 0) > 3;
    });

    return filteredOutliers.length >= Math.max(4, Math.floor(rawPoints.length * 0.68))
      ? filteredOutliers
      : rawPoints;
  }, [allRestaurants, foundersRestaurantOperatorMap, restaurantIssueCountMap, countryCurrency?.code, language]);
  const shopsMapMarkerIcons = useMemo(() => {
    const map = new Map();
    const labels = {
      activity: language === 'uz' ? 'Faoliyat' : 'Вид деятельности',
      phone: language === 'uz' ? 'Telefon' : 'Телефон',
      balance: language === 'uz' ? 'Balans' : 'Баланс',
      operator: language === 'uz' ? 'Operator' : 'Оператор',
      products: language === 'uz' ? 'Tovarlar' : 'Товары',
      errors: language === 'uz' ? 'Xatolar' : 'Ошибки'
    };

    shopsMapPoints.forEach((point) => {
      const html = `
        <div class="sa-founders-store-marker">
          <div class="sa-founders-store-marker-line is-title"><strong>🏪 ${escapeHtml(point.name)}</strong></div>
          <div class="sa-founders-store-marker-line">${labels.activity}: ${escapeHtml(point.activityType)}</div>
          <div class="sa-founders-store-marker-line">${labels.phone}: ${escapeHtml(point.phone)}</div>
          <div class="sa-founders-store-marker-line">${labels.balance}: ${escapeHtml(formatCompactMoneyForMapLabel(point.balance))} ${escapeHtml(point.currencyLabel)}</div>
          <div class="sa-founders-store-marker-line">${labels.operator}: ${escapeHtml(point.operatorLabel)}</div>
          <div class="sa-founders-store-marker-line is-meta">${labels.products}: <strong>${Number(point.productsCount || 0)}</strong> · ${labels.errors}: <strong>${Number(point.issuesCount || 0)}</strong></div>
        </div>
        <span class="sa-founders-store-marker-pin" aria-hidden="true"></span>
      `;
      map.set(point.id, L.divIcon({
        className: 'sa-founders-store-marker-icon',
        html,
        iconSize: [220, 124],
        iconAnchor: [110, 124]
      }));
    });
    return map;
  }, [shopsMapPoints, language]);
  const organizationExpensesCurrencyOptions = useMemo(() => {
    const set = new Set();
    foundersAvailableCurrencies.forEach((item) => set.add(String(item || '').trim().toLowerCase()));
    (organizationExpensesData?.totals_by_currency || []).forEach((item) => {
      const code = String(item?.currency_code || '').trim().toLowerCase();
      if (code) set.add(code);
    });
    (organizationExpensesData?.items || []).forEach((item) => {
      const code = String(item?.currency_code || '').trim().toLowerCase();
      if (code) set.add(code);
    });
    return Array.from(set).filter(Boolean).sort((left, right) => left.localeCompare(right, 'ru'));
  }, [foundersAvailableCurrencies, organizationExpensesData?.totals_by_currency, organizationExpensesData?.items]);

  const securityEventTypeOptions = useMemo(() => {
    const uniqueTypes = new Set();
    (securityEventsData.events || []).forEach((item) => {
      const eventType = String(item?.event_type || '').trim();
      if (eventType) uniqueTypes.add(eventType);
    });
    (securityStats.by_type_24h || []).forEach((item) => {
      const eventType = String(item?.event_type || '').trim();
      if (eventType) uniqueTypes.add(eventType);
    });
    return Array.from(uniqueTypes).sort((left, right) => left.localeCompare(right, 'ru'));
  }, [securityEventsData.events, securityStats.by_type_24h]);
  const topSecuritySource24h = useMemo(() => (
    Array.isArray(securityStats.top_sources_24h) && securityStats.top_sources_24h.length > 0
      ? securityStats.top_sources_24h[0]
      : null
  ), [securityStats.top_sources_24h]);

  const topupRestaurantOptions = useMemo(() => {
    const term = topupRestaurantSearch.trim().toLowerCase();
    const filtered = allRestaurants.filter((restaurant) => (
      !term || String(restaurant.name || '').toLowerCase().includes(term)
    ));

    if (!topupRestaurant?.id) return filtered;

    const selected = allRestaurants.find((restaurant) => String(restaurant.id) === String(topupRestaurant.id));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [allRestaurants, topupRestaurantSearch, topupRestaurant?.id]);

  const restaurantsFilterOptions = useMemo(() => {
    const term = restaurantsSelectSearch.trim().toLowerCase();
    const source = restaurants?.restaurants || [];
    const filtered = source.filter((restaurant) => (
      !term || restaurant.name?.toLowerCase().includes(term)
    ));

    if (!restaurantsSelectFilter) return filtered;

    const selected = source.find((restaurant) => String(restaurant.id) === String(restaurantsSelectFilter));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [restaurants, restaurantsSelectSearch, restaurantsSelectFilter]);
  const restaurantsActivityTypeFilterOptions = useMemo(() => {
    const source = restaurants?.restaurants || [];
    const unique = new Map();
    source.forEach((restaurant) => {
      const activityId = Number.parseInt(restaurant?.activity_type_id, 10);
      if (!Number.isInteger(activityId) || activityId <= 0) return;
      const name = String(restaurant?.activity_type_name || '').trim();
      if (!name) return;
      if (!unique.has(activityId)) {
        unique.set(activityId, {
          id: activityId,
          name
        });
      }
    });
    return Array.from(unique.values()).sort((left, right) => (
      String(left.name || '').localeCompare(String(right.name || ''), 'ru', { sensitivity: 'base' })
    ));
  }, [restaurants]);
  const getRestaurantIssueCountForFilters = (restaurant) => {
    const mappedIssueCount = Number(restaurantIssueCountMap?.[restaurant?.id]);
    if (Number.isFinite(mappedIssueCount)) return Math.max(0, mappedIssueCount);
    const token = String(restaurant?.telegram_bot_token || '').trim();
    const botMetaError = String(restaurant?.telegram_bot_meta_error || '').trim();
    const botUsername = String(restaurant?.telegram_bot_username || '').trim();
    if (!token) return 1;
    if (botMetaError) return 1;
    if (!botUsername) return 1;
    return 0;
  };

  const restaurantActivityTypeOptions = useMemo(() => {
    const visibleItems = activityTypes.filter((item) => item.is_visible !== false);
    if (!restaurantForm.activity_type_id) return visibleItems;

    const selected = activityTypes.find((item) => String(item.id) === String(restaurantForm.activity_type_id));
    if (!selected) return visibleItems;
    if (visibleItems.some((item) => item.id === selected.id)) return visibleItems;

    return [selected, ...visibleItems];
  }, [activityTypes, restaurantForm.activity_type_id]);

  const adBannerActivityTypeOptions = useMemo(() => {
    const visibleItems = activityTypes.filter((item) => item.is_visible !== false);
    const selectedIds = new Set((adBannerForm.target_activity_type_ids || []).map((id) => Number(id)));
    const hiddenSelected = activityTypes.filter((item) => selectedIds.has(Number(item.id)) && item.is_visible === false);
    return [...hiddenSelected, ...visibleItems.filter((item) => !selectedIds.has(Number(item.id)) || item.is_visible !== false)];
  }, [activityTypes, adBannerForm.target_activity_type_ids]);

  const filteredActivityTypes = useMemo(() => {
    const normalizedSearch = String(activityTypeSearchFilter || '').trim().toLowerCase();
    return (activityTypes || []).filter((item) => {
      const nameMatch = !normalizedSearch || String(item?.name || '').toLowerCase().includes(normalizedSearch);
      if (!nameMatch) return false;
      if (activityTypeVisibilityFilter === 'visible') return item?.is_visible !== false;
      if (activityTypeVisibilityFilter === 'hidden') return item?.is_visible === false;
      return true;
    });
  }, [activityTypes, activityTypeSearchFilter, activityTypeVisibilityFilter]);

  const resetActivityTypeFilters = () => {
    setActivityTypeSearchFilter('');
    setActivityTypeVisibilityFilter('all');
  };

  const hasActiveActivityTypeFilters = (
    String(activityTypeSearchFilter || '').trim() !== '' ||
    activityTypeVisibilityFilter !== 'all'
  );

  const getActivityTypeNamesByIds = (ids = []) => {
    const mapById = new Map(activityTypes.map((item) => [Number(item.id), item]));
    const normalizedIds = (Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    return normalizedIds.map((id) => mapById.get(id)?.name || `#${id}`);
  };

  const filteredRestaurants = useMemo(() => {
    const source = restaurants?.restaurants || [];
    const normalizedNameFilter = String(restaurantsNameFilter || '').trim().toLowerCase();
    return source.filter((restaurant) => {
      const nameMatch = !normalizedNameFilter ||
        String(restaurant.name || '').toLowerCase().includes(normalizedNameFilter);
      const selectedMatch = !restaurantsSelectFilter || String(restaurant.id) === String(restaurantsSelectFilter);
      const statusMatch = !restaurantsStatusFilter ||
        (restaurantsStatusFilter === 'active' ? !!restaurant.is_active : !restaurant.is_active);
      const restaurantActivityId = Number.parseInt(restaurant?.activity_type_id, 10);
      const activityTypeMatch = !restaurantsActivityTypeFilter || (
        restaurantsActivityTypeFilter === 'none'
          ? (!Number.isInteger(restaurantActivityId) || restaurantActivityId <= 0)
          : String(restaurantActivityId) === String(restaurantsActivityTypeFilter)
      );
      const createdAtDate = restaurant?.created_at ? new Date(restaurant.created_at) : null;
      const createdAtIso = createdAtDate && !Number.isNaN(createdAtDate.getTime())
        ? `${createdAtDate.getFullYear()}-${String(createdAtDate.getMonth() + 1).padStart(2, '0')}-${String(createdAtDate.getDate()).padStart(2, '0')}`
        : '';
      const createdFromMatch = !restaurantsCreatedFromFilter || (createdAtIso && createdAtIso >= restaurantsCreatedFromFilter);
      const createdToMatch = !restaurantsCreatedToFilter || (createdAtIso && createdAtIso <= restaurantsCreatedToFilter);
      const tariffMatch = !restaurantsTariffFilter || (
        restaurantsTariffFilter === 'free'
          ? restaurant?.is_free_tier === true
          : restaurant?.is_free_tier !== true
      );
      const issuesCount = getRestaurantIssueCountForFilters(restaurant);
      const problemsMatch = !restaurantsProblemsFilter || (
        restaurantsProblemsFilter === 'with_problems'
          ? issuesCount > 0
          : issuesCount <= 0
      );
      const productsCount = Number(restaurant?.products_count || 0);
      const productsMatch = !restaurantsProductsFilter || (
        restaurantsProductsFilter === 'with_products'
          ? productsCount > 0
          : productsCount <= 0
      );
      return (
        nameMatch &&
        selectedMatch &&
        statusMatch &&
        activityTypeMatch &&
        createdFromMatch &&
        createdToMatch &&
        tariffMatch &&
        problemsMatch &&
        productsMatch
      );
    });
  }, [
    restaurants,
    restaurantsNameFilter,
    restaurantsSelectFilter,
    restaurantsStatusFilter,
    restaurantsActivityTypeFilter,
    restaurantsCreatedFromFilter,
    restaurantsCreatedToFilter,
    restaurantsTariffFilter,
    restaurantsProblemsFilter,
    restaurantsProductsFilter,
    restaurantIssueCountMap
  ]);

  const paginatedRestaurants = useMemo(() => {
    const start = (restaurantsPage - 1) * restaurantsLimit;
    return filteredRestaurants.slice(start, start + restaurantsLimit);
  }, [filteredRestaurants, restaurantsPage, restaurantsLimit]);

  const helpInstructionSortOptions = useMemo(() => {
    const currentId = helpInstructionForm?.id ? Number(helpInstructionForm.id) : null;
    const currentSort = Number.parseInt(helpInstructionForm?.sort_order, 10);
    const taken = new Set(
      helpInstructions
        .filter((item) => currentId === null || Number(item.id) !== currentId)
        .map((item) => Number.parseInt(item.sort_order, 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    const maxBound = Math.max((helpInstructions?.length || 0) + 20, currentSort || 0, 20);
    const options = [];
    for (let value = 1; value <= maxBound; value += 1) {
      if (!taken.has(value) || value === currentSort) {
        options.push(value);
      }
    }
    return options;
  }, [helpInstructions, helpInstructionForm?.id, helpInstructionForm?.sort_order]);

  const formatThousands = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
  };

  const formatCardNumberMasked = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 19);
    if (!digits) return '';
    return digits.match(/.{1,4}/g)?.join(' ') || digits;
  };

  const copyToClipboard = async (value, successMessage = 'Скопировано') => {
    const text = String(value || '').trim();
    if (!text || text === '—') return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setSuccess(successMessage);
      setError('');
    } catch (e) {
      setError('Не удалось скопировать');
    }
  };

  const normalizeMoneyFieldValue = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(numeric)) {
      return String(Math.round(numeric));
    }
    return String(value).replace(/\D/g, '');
  };

  const handleTopupAmountChange = (event) => {
    const digitsOnly = String(event.target.value || '').replace(/\D/g, '');
    setTopupForm((prev) => ({ ...prev, amount: digitsOnly }));
  };
  const parseDecimalInputOrZero = (value) => {
    const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return 0;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const getCurrencyLabelByCode = (code) => {
    const normalizedCode = String(code || '').trim().toLowerCase();
    const fallback = countryCurrencyOptions?.[0];
    const matched = countryCurrencyOptions?.find((option) => (
      String(option?.code || '').trim().toLowerCase() === normalizedCode
    )) || fallback;
    if (!matched) return t('sum');
    if (language === 'uz') return matched.currencyUz || matched.currencyRu || t('sum');
    return matched.currencyRu || matched.currencyUz || t('sum');
  };

  const formatBalanceAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    const locale = language === 'uz' ? 'uz-UZ' : 'ru-RU';
    const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
    const hasFraction = Math.abs(rounded % 1) > 0.0000001;
    return rounded.toLocaleString(locale, {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2
    });
  };
  const formatChecksCount = (balanceValue, orderCostValue, isFreeTier) => {
    if (isFreeTier) return '∞';
    const balance = Number(balanceValue);
    const orderCost = Number(orderCostValue);
    if (!Number.isFinite(balance) || balance <= 0) return '0';
    if (!Number.isFinite(orderCost)) return '0';
    if (orderCost <= 0) return '∞';
    const checks = Math.max(0, Math.floor(balance / orderCost));
    return checks.toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
  };

  const formatBalanceOperationDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
  };
  const formatSecurityEventType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    const labels = {
      webhook_rate_limit: language === 'uz' ? 'Webhook rate-limit' : 'Лимит запросов webhook',
      cors_blocked_origin: language === 'uz' ? 'CORS bloklangan origin' : 'Заблокированный CORS origin',
      webhook_invalid_secret: language === 'uz' ? 'Webhook secret xato' : 'Неверный webhook secret',
      webhook_unknown_restaurant: language === 'uz' ? "Noma'lum do'kon webhook" : 'Webhook неизвестного магазина',
      api_probe_404: language === 'uz' ? 'API probing (404)' : 'Сканирование API (404)',
      auth_rate_limit: language === 'uz' ? 'Kirish urinish limiti' : 'Лимит попыток входа',
      auth_account_not_found: language === 'uz' ? 'Kirish: akkaunt topilmadi' : 'Вход: аккаунт не найден',
      auth_inactive_account: language === 'uz' ? 'Kirish: nofaol akkaunt' : 'Вход: неактивный аккаунт',
      auth_invalid_password: language === 'uz' ? "Kirish: noto'g'ri parol" : 'Вход: неверный пароль',
      auth_invalid_account_choice: language === 'uz' ? "Kirish: noto'g'ri akkaunt tanlovi" : 'Вход: неверный выбор аккаунта'
    };
    return labels[normalized] || String(value || 'unknown');
  };
  const getSecurityRiskMeta = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'critical') {
      return {
        label: 'Critical',
        style: { backgroundColor: '#7f1d1d', color: '#fee2e2' }
      };
    }
    if (normalized === 'high') {
      return {
        label: language === 'uz' ? 'Yuqori' : 'Высокий',
        style: { backgroundColor: '#fee2e2', color: '#991b1b' }
      };
    }
    if (normalized === 'medium') {
      return {
        label: language === 'uz' ? "O'rtacha" : 'Средний',
        style: { backgroundColor: '#fef3c7', color: '#92400e' }
      };
    }
    return {
      label: language === 'uz' ? 'Past' : 'Низкий',
      style: { backgroundColor: '#dcfce7', color: '#166534' }
    };
  };
  const getSecurityStatusMeta = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'resolved') {
      return {
        label: language === 'uz' ? 'Yechilgan' : 'Решено',
        style: { backgroundColor: '#dcfce7', color: '#166534' }
      };
    }
    return {
      label: language === 'uz' ? 'Ochiq' : 'Открыто',
      style: { backgroundColor: '#fee2e2', color: '#991b1b' }
    };
  };
  const formatSecuritySourceLabel = (eventItem) => {
    const parts = [
      String(eventItem?.source_city || '').trim(),
      String(eventItem?.source_region || '').trim(),
      String(eventItem?.source_country || '').trim()
    ].filter(Boolean);
    if (!parts.length) return language === 'uz' ? "Geoma'lumot yo'q" : 'Гео не определено';
    return parts.join(', ');
  };
  const formatSecurityDetailsSummary = (details, options = {}) => {
    if (!details || typeof details !== 'object') return '-';
    const revealSensitive = Boolean(options?.revealSensitive);
    const normalizedDetails = { ...details };
    if (revealSensitive && String(details?.identifier_full || '').trim()) {
      normalizedDetails.identifier = String(details.identifier_full || '').trim();
    }
    delete normalizedDetails.identifier_full;

    const preferredKeys = ['reason', 'origin', 'message', 'error', 'hint'];
    for (const key of preferredKeys) {
      const value = normalizedDetails?.[key];
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text.slice(0, 160);
    }
    const entries = Object.entries(normalizedDetails)
      .filter(([key, value]) => key && value !== undefined && value !== null && String(value).trim() !== '')
      .slice(0, 2)
      .map(([key, value]) => `${key}: ${String(value)}`);
    if (!entries.length) return '-';
    return entries.join(' | ').slice(0, 180);
  };
  const formatSecurityPortalLabel = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (language === 'uz') {
      if (normalized === 'superadmin') return 'superadmin paneliga';
      if (normalized === 'admin') return 'admin paneliga';
      if (normalized === 'operator') return 'operator paneliga';
      if (normalized === 'customer') return 'mijoz kirishiga';
      return 'tizimga';
    }
    if (normalized === 'superadmin') return 'в супер-админку';
    if (normalized === 'admin') return 'в админку';
    if (normalized === 'operator') return 'в панель оператора';
    if (normalized === 'customer') return 'в клиентский вход';
    return 'в систему';
  };
  const formatSecurityHumanSummary = (eventItem, options = {}) => {
    const type = String(eventItem?.event_type || '').trim().toLowerCase();
    const details = (eventItem?.details && typeof eventItem.details === 'object') ? eventItem.details : {};
    const revealSensitive = Boolean(options?.revealSensitive);
    const identifier = revealSensitive
      ? String(details?.identifier_full || details?.identifier || '').trim()
      : String(details?.identifier || '').trim();
    const portalLabel = formatSecurityPortalLabel(details?.portal || '');
    const targetPath = String(eventItem?.request_path || eventItem?.target || '').trim();

    if (type === 'auth_invalid_password') {
      return language === 'uz'
        ? `${portalLabel} kirish urinishida parol noto'g'ri bo'lgan${identifier ? ` (login: ${identifier})` : ''}.`
        : `Попытка входа ${portalLabel}: неверный пароль${identifier ? ` (логин: ${identifier})` : ''}.`;
    }
    if (type === 'auth_account_not_found') {
      return language === 'uz'
        ? `${portalLabel} kirishda bunday akkaunt topilmadi${identifier ? ` (login: ${identifier})` : ''}.`
        : `Попытка входа ${portalLabel}: такой аккаунт не найден${identifier ? ` (логин: ${identifier})` : ''}.`;
    }
    if (type === 'auth_inactive_account') {
      return language === 'uz'
        ? `Akkaunt topilgan, lekin u o‘chirilgan yoki faol emas${identifier ? ` (login: ${identifier})` : ''}.`
        : `Аккаунт найден, но отключен или неактивен${identifier ? ` (логин: ${identifier})` : ''}.`;
    }
    if (type === 'auth_rate_limit') {
      return language === 'uz'
        ? 'Qisqa vaqt ichida juda ko‘p kirish urinishlari bo‘lgani uchun himoya cheklovi ishga tushdi.'
        : 'За короткое время было слишком много попыток входа, сработало ограничение защиты.';
    }
    if (type === 'auth_invalid_account_choice') {
      return language === 'uz'
        ? 'Kirishda noto‘g‘ri akkaunt tanlangan.'
        : 'При входе был выбран недоступный аккаунт.';
    }
    if (type === 'webhook_invalid_secret') {
      return language === 'uz'
        ? 'Webhook maxfiy kaliti noto‘g‘ri yuborilgan.'
        : 'Webhook пришёл с неверным секретным ключом.';
    }
    if (type === 'cors_blocked_origin') {
      return language === 'uz'
        ? 'So‘rov ruxsat etilmagan domen/origin dan kelgan va bloklangan.'
        : 'Запрос пришёл с неразрешённого origin и был заблокирован.';
    }
    if (type === 'api_probe_404') {
      return language === 'uz'
        ? 'Kimdir mavjud bo‘lmagan API manzillarini tekshirgan (сканирование).'
        : 'Кто-то проверял несуществующие API-адреса (сканирование).';
    }

    if (targetPath) {
      return language === 'uz'
        ? `Shubhali hodisa qayd etildi: ${targetPath}.`
        : `Зафиксировано подозрительное событие: ${targetPath}.`;
    }
    return language === 'uz'
      ? 'Shubhali hodisa qayd etildi.'
      : 'Зафиксировано подозрительное событие.';
  };
  const hasSecurityRevealableIdentifier = (eventItem) => {
    const details = (eventItem?.details && typeof eventItem.details === 'object') ? eventItem.details : {};
    const full = String(details?.identifier_full || '').trim();
    const masked = String(details?.identifier || '').trim();
    return Boolean(full) && full !== masked;
  };
  const toggleSecurityDetailsReveal = (eventId) => {
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;
    setSecurityDetailsRevealMap((prev) => ({
      ...prev,
      [numericId]: !prev?.[numericId]
    }));
  };
  const getPhoneTelHref = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let cleaned = raw.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('++')) {
      cleaned = `+${cleaned.replace(/\+/g, '')}`;
    }
    return `tel:${cleaned}`;
  };
  const buildTelegramProfileLink = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        const host = String(parsed.hostname || '').toLowerCase();
        const usernameFromPath = String(parsed.pathname || '').replace(/\//g, '').trim();
        if (host === 't.me' || host === 'telegram.me' || host.endsWith('.t.me')) {
          const normalizedUsername = usernameFromPath.replace(/^@+/, '');
          return {
            href: raw,
            label: normalizedUsername ? `@${normalizedUsername}` : raw
          };
        }
      } catch (_) {
        return {
          href: raw,
          label: raw
        };
      }
      return {
        href: raw,
        label: raw
      };
    }

    const normalizedUsername = raw.replace(/^@+/, '').replace(/\s+/g, '');
    if (!normalizedUsername) return null;
    return {
      href: `https://t.me/${encodeURIComponent(normalizedUsername)}`,
      label: `@${normalizedUsername}`
    };
  };
  const getQuickRestaurantIssueCount = (restaurant) => {
    const token = String(restaurant?.telegram_bot_token || '').trim();
    const botMetaError = String(restaurant?.telegram_bot_meta_error || '').trim();
    const botUsername = String(restaurant?.telegram_bot_username || '').trim();

    if (!token) return 1;
    if (botMetaError) return 1;
    if (!botUsername) return 1;
    return 0;
  };
  const getBillingOperationMeta = (type) => {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'deposit') {
      return {
        label: language === 'uz' ? "To'ldirish" : 'Пополнение',
        className: 'text-success',
        sign: '+',
        badgeStyle: {
          backgroundColor: '#dcfce7',
          color: '#166534'
        }
      };
    }
    if (normalized === 'refund') {
      return {
        label: language === 'uz' ? 'Qaytarish' : 'Возврат',
        className: 'text-danger',
        sign: '-',
        badgeStyle: {
          backgroundColor: '#fee2e2',
          color: '#991b1b'
        }
      };
    }
    return {
      label: normalized || '—',
      className: 'text-muted',
      sign: '',
      badgeStyle: {
        backgroundColor: '#e2e8f0',
        color: '#475569'
      }
    };
  };

  const loadTopupTransactions = async (restaurantId) => {
    if (!restaurantId) {
      setTopupTransactions([]);
      return;
    }
    setTopupTransactionsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants/${restaurantId}/billing-transactions`, {
        params: { limit: 40 }
      });
      const historyRows = Array.isArray(response.data?.transactions) ? response.data.transactions : [];
      setTopupTransactions(historyRows);
      if (response.data?.restaurant) {
        setTopupRestaurant((prev) => (
          prev && String(prev.id) === String(restaurantId)
            ? { ...prev, ...response.data.restaurant }
            : prev
        ));
      }
    } catch (err) {
      console.error('Load topup transactions error:', err);
      setTopupTransactions([]);
      setError(err.response?.data?.error || (language === 'uz' ? "Operatsiyalar tarixi yuklanmadi" : 'Ошибка загрузки истории операций'));
    } finally {
      setTopupTransactionsLoading(false);
    }
  };

  const openTopupModal = (restaurant = null) => {
    setTopupRestaurant(restaurant || null);
    setTopupRestaurantSearch('');
    setTopupForm({ amount: '', description: '' });
    setTopupMode('deposit');
    setTopupTransactions([]);
    setShowTopupModal(true);
    if (restaurant?.id) {
      loadTopupTransactions(restaurant.id);
    }
  };

  const closeTopupModal = () => {
    setShowTopupModal(false);
    setTopupForm({ amount: '', description: '' });
    setTopupMode('deposit');
    setTopupTransactions([]);
    setTopupTransactionsLoading(false);
    setTopupSubmitting(false);
    setTopupRestaurantSearch('');
    setTopupRestaurant(null);
  };

  const handleTopup = async () => {
    if (!topupRestaurant?.id) {
      setError(language === 'uz' ? "Do'konni tanlang" : 'Выберите магазин');
      return;
    }
    const amountValue = Number(String(topupForm.amount || '').replace(/\D/g, ''));
    if (!amountValue || Number.isNaN(amountValue) || amountValue <= 0) {
      setError(language === 'uz' ? "Noto'g'ri summa" : 'Некорректная сумма');
      return;
    }
    const isRefundMode = topupMode === 'withdrawal';
    const endpoint = isRefundMode ? 'refund' : 'topup';
    const successMessage = isRefundMode
      ? (language === 'uz'
        ? `"${topupRestaurant.name || 'Do‘kon'}" do'koni uchun qaytarish bajarildi`
        : `Для магазина "${topupRestaurant.name || 'Магазин'}" выполнен возврат`)
      : `Баланс магазина "${topupRestaurant.name || 'Магазин'}" пополнен`;
    try {
      setTopupSubmitting(true);
      const response = await axios.post(`${API_URL}/superadmin/restaurants/${topupRestaurant.id}/${endpoint}`, {
        amount: amountValue,
        description: topupForm.description
      });
      const updatedRestaurant = response.data?.restaurant || response.data;
      if (updatedRestaurant && updatedRestaurant.id) {
        setTopupRestaurant((prev) => (prev ? { ...prev, ...updatedRestaurant } : prev));
      }
      setSuccess(successMessage);
      setTopupForm({ amount: '', description: '' });
      await Promise.all([
        loadRestaurants(),
        loadTopupTransactions(topupRestaurant.id)
      ]);
      if (activeTab === 'billing_transactions') {
        await loadBillingTransactions();
      }
    } catch (err) {
      setError(err.response?.data?.error || (isRefundMode
        ? (language === 'uz' ? "Qaytarishda xatolik" : 'Ошибка возврата средств')
        : 'Ошибка пополнения баланса'));
    } finally {
      setTopupSubmitting(false);
    }
  };

  const toggleFreeTier = async (restaurantId, isFree) => {
    try {
      await axios.patch(`${API_URL}/superadmin/restaurants/${restaurantId}/free-tier`, { is_free_tier: isFree });
      setSuccess('Статус бесплатного тарифа изменен');
      loadRestaurants();
    } catch (err) {
      setError('Ошибка изменения статуса тарифа');
    }
  };

  // Container functions
  const closeCategoryModal = () => {
    categoryAiRequestIdRef.current += 1;
    setShowCategoryModal(false);
    setCategoryAiMode('');
    setCategoryAiLoading(false);
    setCategoryAiError('');
  };

  const openCategoryModal = (levelIndex, parentCategory = null, categoryToEdit = null) => {
    categoryAiRequestIdRef.current += 1;
    setCategoryAiMode('');
    setCategoryAiLoading(false);
    setCategoryAiError('');
    setEditingLevel(levelIndex);
    const pId = parentCategory ? parentCategory.id : null;

    if (categoryToEdit) {
      setCategoryForm({
        id: categoryToEdit.id,
        name_ru: categoryToEdit.name_ru || '',
        name_uz: categoryToEdit.name_uz || '',
        image_url: categoryToEdit.image_url || '',
        sort_order: categoryToEdit.sort_order !== null && categoryToEdit.sort_order !== undefined ? categoryToEdit.sort_order : getNextAvailableSortOrder(pId),
        parent_id: categoryToEdit.parent_id
      });
    } else {
      setCategoryForm({
        id: null,
        name_ru: '',
        name_uz: '',
        image_url: '',
        sort_order: getNextAvailableSortOrder(pId),
        parent_id: pId
      });
    }
    setShowCategoryModal(true);
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    if (!normalizeCategoryName(categoryForm.name_ru)) {
      setError('Название категории обязательно');
      return;
    }

    const duplicateName = getSiblingNameConflict({
      parentId: categoryForm.parent_id ?? null,
      nameRu: categoryForm.name_ru,
      nameUz: categoryForm.name_uz,
      excludeId: categoryForm.id || null
    });
    if (duplicateName) {
      setError('На этом уровне уже есть категория с таким названием RU или UZ');
      return;
    }

    // Check for duplicate sort_order at the same level
    const isDuplicateSortOrder = categories.some(
      (c) =>
        c.parent_id === categoryForm.parent_id &&
        c.sort_order === categoryForm.sort_order &&
        c.id !== categoryForm.id
    );

    if (isDuplicateSortOrder) {
      setError('Порядок сортировки с таким номером уже существует на этом уровне. Пожалуйста, выберите другой номер.');
      return;
    }

    try {
      const normalizedImageUrl = String(categoryForm.image_url || '').trim();
      const payload = {
        ...categoryForm,
        image_url: normalizedImageUrl
      };
      if (categoryForm.id) {
        await axios.put(`${API_URL}/superadmin/categories/${categoryForm.id}`, payload);
        setSuccess('Категория обновлена');
      } else {
        await axios.post(`${API_URL}/superadmin/categories`, payload);
        setSuccess('Категория добавлена');
      }
      closeCategoryModal();
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения категории');
    }
  };

  const deleteCategory = async (categoryId) => {
    const categoryToDelete = categories.find((c) => c.id === categoryId);
    if (categoryToDelete && !canDeleteCategory(categoryToDelete)) {
      setError('Категорию нельзя удалить: в ней есть товары или подкатегории');
      return;
    }

    if (!window.confirm('Вы уверены, что хотите удалить эту категорию?')) return;
    try {
      await axios.delete(`${API_URL}/superadmin/categories/${categoryId}`);
      setSuccess('Категория удалена');
      loadCategories();
      setCategoryLevels((prev) => {
        const idx = prev.findIndex((cat) => cat?.id === categoryId);
        if (idx === -1) return prev;
        const next = [...prev];
        for (let i = idx; i < CATEGORY_LEVEL_COUNT; i++) {
          next[i] = null;
        }
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления категории');
    }
  };

  const handleExportCategories = () => {
    if (!categories?.length) {
      setError('Нет категорий для экспорта');
      return;
    }

    const sortCategories = (list) => [...list].sort((a, b) => {
      const aSort = a.sort_order ?? 9999;
      const bSort = b.sort_order ?? 9999;
      if (aSort !== bSort) return aSort - bSort;
      return String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru');
    });

    const childrenMap = new Map();
    categories.forEach((cat) => {
      const parentKey = cat.parent_id ?? 'root';
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey).push(cat);
    });
    for (const [key, value] of childrenMap.entries()) {
      childrenMap.set(key, sortCategories(value));
    }

    const rows = [];
    const walk = (node, path = []) => {
      const currentPath = [...path, {
        ru: node.name_ru || '',
        uz: node.name_uz || ''
      }];
      const children = childrenMap.get(node.id) || [];

      if (currentPath.length >= CATEGORY_LEVEL_COUNT || children.length === 0) {
        rows.push({
          'Уровень 1 (RU)': currentPath[0]?.ru || '',
          'Уровень 1 (UZ)': currentPath[0]?.uz || '',
          'Уровень 2 (RU)': currentPath[1]?.ru || '',
          'Уровень 2 (UZ)': currentPath[1]?.uz || '',
          'Уровень 3 (RU)': currentPath[2]?.ru || '',
          'Уровень 3 (UZ)': currentPath[2]?.uz || '',
          'Путь (RU)': currentPath.map((p) => p.ru).filter(Boolean).join(' > '),
          'Путь (UZ)': currentPath.map((p) => p.uz).filter(Boolean).join(' > ')
        });
        return;
      }

      children.forEach((child) => walk(child, currentPath));
    };

    (childrenMap.get('root') || []).forEach((root) => walk(root, []));

    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        'Уровень 1 (RU)', 'Уровень 1 (UZ)',
        'Уровень 2 (RU)', 'Уровень 2 (UZ)',
        'Уровень 3 (RU)', 'Уровень 3 (UZ)',
        'Путь (RU)', 'Путь (UZ)'
      ]
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Категории');

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `categories_export_${stamp}.xlsx`);
    setSuccess(`Экспортировано категорий: ${rows.length}`);
  };

  const parseCategoryImportLevels = (row, index) => {
    const cleaned = (row || []).map((cell) => normalizeCategoryName(cell));
    if (!cleaned.some(Boolean)) return null;

    const firstCell = cleaned[0] || '';
    const secondCell = cleaned[1] || '';
    const thirdCell = cleaned[2] || '';
    const fourthCell = cleaned[3] || '';
    const fifthCell = cleaned[4] || '';
    const sixthCell = cleaned[5] || '';
    const seventhCell = cleaned[6] || '';
    const eighthCell = cleaned[7] || '';

    const isHeaderRow = index === 0 && cleaned
      .join(' ')
      .toLowerCase()
      .match(/уров|катег|path|путь|ru|uz|level/);
    if (isHeaderRow) return null;

    let levels = [];
    const hasRuUzColumns = [fifthCell, sixthCell, seventhCell, eighthCell].some(Boolean) ||
      (cleaned.length >= 6 && [secondCell, fourthCell, sixthCell].some(Boolean));

    if (hasRuUzColumns) {
      const levelCandidates = [
        { ru: firstCell, uz: secondCell },
        { ru: thirdCell, uz: fourthCell },
        { ru: fifthCell, uz: sixthCell }
      ];
      levels = levelCandidates.filter((l) => l.ru || l.uz);

      const pathRu = seventhCell;
      const pathUz = eighthCell;
      if (!levels.length && pathRu.includes('>')) {
        const ruParts = pathRu.split('>').map((part) => normalizeCategoryName(part)).filter(Boolean);
        const uzParts = pathUz.includes('>')
          ? pathUz.split('>').map((part) => normalizeCategoryName(part)).filter(Boolean)
          : [];
        levels = ruParts.map((ru, i) => ({ ru, uz: uzParts[i] || '' }));
      }
    } else {
      const inlinePath = [firstCell, secondCell, thirdCell].filter(Boolean).length <= 1 && firstCell.includes('>');
      const pathColumn = fourthCell && fourthCell.includes('>');

      if (inlinePath) {
        levels = firstCell
          .split('>')
          .map((part) => normalizeCategoryName(part))
          .filter(Boolean)
          .map((ru) => ({ ru, uz: '' }));
      } else if (pathColumn) {
        levels = fourthCell
          .split('>')
          .map((part) => normalizeCategoryName(part))
          .filter(Boolean)
          .map((ru) => ({ ru, uz: '' }));
      } else {
        levels = [firstCell, secondCell, thirdCell]
          .filter(Boolean)
          .map((ru) => ({ ru, uz: '' }));
      }
    }

    if (!levels.length) return null;
    if (levels.length > CATEGORY_LEVEL_COUNT) {
      return { error: `Строка ${index + 1}: больше ${CATEGORY_LEVEL_COUNT} уровней` };
    }

    for (let i = 0; i < levels.length; i++) {
      if (!levels[i].ru) {
        return { error: `Строка ${index + 1}: отсутствует название RU на уровне ${i + 1}` };
      }
    }

    return { levels };
  };

  const handleImportCategoriesFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const fileValidationError = validateSpreadsheetImportFile(file);
    if (fileValidationError) {
      setError(fileValidationError);
      return;
    }

    setIsImportingCategories(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      if (!rows.length) {
        setError('Файл пустой');
        return;
      }

      const parsedRows = [];
      const parseErrors = [];
      rows.forEach((row, idx) => {
        const parsed = parseCategoryImportLevels(row, idx);
        if (!parsed) return;
        if (parsed.error) {
          parseErrors.push(parsed.error);
          return;
        }
        parsedRows.push(parsed.levels);
      });

      if (!parsedRows.length) {
        setError(parseErrors[0] || 'Не найдено строк для импорта');
        return;
      }

      const categoryMap = new Map();
      const categoryUzMap = new Map();
      const siblingMaxSort = new Map();
      categories.forEach((cat) => {
        const ruName = normalizeCategoryName(cat.name_ru);
        const uzName = normalizeCategoryName(cat.name_uz);
        const parentId = cat.parent_id ?? null;

        if (ruName) {
          const ruKey = getCategoryKey(parentId, ruName);
          categoryMap.set(ruKey, cat);
        }
        if (uzName) {
          const uzKey = getCategoryKey(parentId, uzName);
          categoryUzMap.set(uzKey, cat);
        }

        const parentKey = parentId;
        const sortVal = Number.isFinite(Number(cat.sort_order)) ? Number(cat.sort_order) : 0;
        siblingMaxSort.set(parentKey, Math.max(siblingMaxSort.get(parentKey) || 0, sortVal));
      });

      const getNextSortOrder = (parentId) => {
        const next = (siblingMaxSort.get(parentId) || 0) + 1;
        siblingMaxSort.set(parentId, next);
        return next;
      };

      let createdCount = 0;
      let skippedDuplicates = 0;
      let updatedUzCount = 0;
      let skippedNameConflicts = 0;

      for (const levels of parsedRows) {
        let parentId = null;
        let skipRow = false;

        for (const levelItem of levels) {
          const levelNameRu = normalizeCategoryName(levelItem.ru);
          const levelNameUz = normalizeCategoryName(levelItem.uz);
          if (!levelNameRu) continue;

          const ruKey = getCategoryKey(parentId, levelNameRu);
          const uzKey = levelNameUz ? getCategoryKey(parentId, levelNameUz) : null;
          const existingByRu = categoryMap.get(ruKey);
          const existingByUz = uzKey ? categoryUzMap.get(uzKey) : null;

          if (existingByUz && (!existingByRu || existingByUz.id !== existingByRu.id)) {
            skippedNameConflicts += 1;
            skipRow = true;
            break;
          }

          if (existingByRu) {
            const existingUz = normalizeCategoryName(existingByRu.name_uz);
            if (levelNameUz && existingUz !== levelNameUz) {
              if (!existingUz) {
                const updatedResp = await axios.put(`${API_URL}/superadmin/categories/${existingByRu.id}`, {
                  ...existingByRu,
                  name_uz: levelNameUz
                });
                const updatedCategory = updatedResp.data;
                categoryMap.set(ruKey, updatedCategory);
                categoryUzMap.set(uzKey, updatedCategory);
                updatedUzCount += 1;
                parentId = updatedCategory.id;
                continue;
              }

              skippedNameConflicts += 1;
              skipRow = true;
              break;
            }

            parentId = existingByRu.id;
            skippedDuplicates += 1;
            continue;
          }

          const payload = {
            name_ru: levelNameRu,
            name_uz: levelNameUz || '',
            image_url: '',
            sort_order: getNextSortOrder(parentId),
            parent_id: parentId
          };

          const created = await axios.post(`${API_URL}/superadmin/categories`, payload);
          const createdCategory = created.data;
          categoryMap.set(ruKey, createdCategory);
          if (levelNameUz) {
            categoryUzMap.set(uzKey, createdCategory);
          }
          parentId = createdCategory.id;
          createdCount += 1;
        }

        if (skipRow) continue;
      }

      await loadCategories();
      setCategoryLevels(Array(CATEGORY_LEVEL_COUNT).fill(null));
      const issues = parseErrors.length ? ` Ошибок строк: ${parseErrors.length}.` : '';
      setSuccess(`Импорт завершен. Создано: ${createdCount}. Обновлено UZ: ${updatedUzCount}. Совпадений: ${skippedDuplicates}. Пропущено конфликтов RU/UZ: ${skippedNameConflicts}.${issues}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка импорта категорий');
    } finally {
      setIsImportingCategories(false);
    }
  };

  const closeGlobalProductsImportReviewModal = (force = false) => {
    if (isApplyingGlobalProductsExcelImport && !force) return;
    setShowGlobalProductsImportReviewModal(false);
    setGlobalProductsImportRows([]);
    setGlobalProductsImportSourceFileName('');
    setIsGlobalImportReviewScrolling(false);
    if (globalImportReviewScrollHideTimeoutRef.current) {
      clearTimeout(globalImportReviewScrollHideTimeoutRef.current);
      globalImportReviewScrollHideTimeoutRef.current = null;
    }
  };

  const handleDownloadGlobalProductsImportTemplate = () => {
    try {
      const headers = globalProductsImportTemplateColumns.map((item) => item.header);
      const exampleRow = globalProductsImportTemplateColumns.map((item) => item.sample || '');
      const templateSheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
      const templateSheetRange = XLSX.utils.decode_range(templateSheet['!ref'] || 'A1');
      templateSheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: templateSheetRange.s.c },
          e: { r: 0, c: templateSheetRange.e.c }
        })
      };
      templateSheet['!cols'] = globalProductsImportTemplateColumns.map((item) => ({
        wch: Math.max(18, String(item.header || '').length + 6)
      }));

      const guideRows = globalProductsImportTemplateColumns.map((item) => ({
        '№': item.index,
        'Заголовок столбца': item.header,
        'Что заполнять': item.description,
        'Обязательно': item.required ? 'Да' : 'Нет',
        'Пример': item.sample || ''
      }));
      guideRows.push({
        '№': '',
        'Заголовок столбца': 'Категория: приоритет',
        'Что заполнять': 'Сначала ID, если его нет — путь, если и его нет — название',
        'Обязательно': '',
        'Пример': 'ID > Путь > Название'
      });
      const guideSheet = XLSX.utils.json_to_sheet(guideRows);
      guideSheet['!cols'] = [
        { wch: 6 },
        { wch: 30 },
        { wch: 70 },
        { wch: 14 },
        { wch: 28 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, templateSheet, 'Шаблон');
      XLSX.utils.book_append_sheet(workbook, guideSheet, 'Памятка');

      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      XLSX.writeFile(workbook, `global_products_import_template_${stamp}.xlsx`);
      setSuccess(language === 'uz'
        ? 'Global mahsulotlar uchun шаблон yuklab olindi'
        : 'Шаблон импорта глобальных товаров скачан');
    } catch (error) {
      setError(language === 'uz'
        ? "Shablonni yaratishda xatolik"
        : 'Ошибка генерации шаблона');
    }
  };

  const resolveCategoryForGlobalProductImport = ({ categoryIdRaw, categoryPathRaw, categoryNameRaw }, lookups = {}) => {
    const categoryByIdLookup = lookups.byId || categoryLookupById;
    const categoryByPathLookup = lookups.byPath || globalImportCategoryByPath;
    const categoryByUniqueNameLookup = lookups.byUniqueName || globalImportCategoryByUniqueName;
    const categoryIdStr = String(categoryIdRaw ?? '').trim();
    if (categoryIdStr) {
      const byId = categoryByIdLookup.get(Number.parseInt(categoryIdStr, 10));
      if (byId) {
        return {
          category: byId,
          message: ''
        };
      }
      return {
        category: null,
        message: language === 'uz'
          ? 'Kategoriya ID topilmadi'
          : 'Категория ID не найдена'
      };
    }

    const categoryPathStr = String(categoryPathRaw ?? '').trim().toLowerCase();
    if (categoryPathStr) {
      const byPath = categoryByPathLookup.get(categoryPathStr);
      if (byPath) {
        return {
          category: byPath,
          message: ''
        };
      }
      return {
        category: null,
        message: language === 'uz'
          ? 'Kategoriya yo‘li topilmadi'
          : 'Путь категории не найден'
      };
    }

    const categoryNameStr = String(categoryNameRaw ?? '').trim().toLowerCase();
    if (categoryNameStr) {
      const byUniqueName = categoryByUniqueNameLookup.get(categoryNameStr);
      if (byUniqueName) {
        return {
          category: byUniqueName,
          message: ''
        };
      }
      if (byUniqueName === null) {
        return {
          category: null,
          message: language === 'uz'
            ? 'Kategoriya nomi bir nechta, aniqlang'
            : 'Название категории неоднозначно, выберите точнее'
        };
      }
      return {
        category: null,
        message: language === 'uz'
          ? 'Kategoriya nomi topilmadi'
          : 'Название категории не найдено'
      };
    }

    return {
      category: null,
      message: ''
    };
  };

  const prepareGlobalProductsImportFromJsonRows = async (jsonRows, sourceLabel = '') => {
    setIsImportingGlobalProductsExcel(true);
    try {
      let categoriesForImport = Array.isArray(categories) ? categories : [];
      if (!categoriesForImport.length) {
        const categoriesResponse = await axios.get(`${API_URL}/superadmin/categories`);
        categoriesForImport = Array.isArray(categoriesResponse.data) ? categoriesResponse.data : [];
        if (categoriesForImport.length > 0) {
          setCategories(categoriesForImport);
        }
      }

      const categoryByIdLookup = new Map();
      (categoriesForImport || []).forEach((category) => {
        const categoryId = Number(category?.id);
        if (Number.isFinite(categoryId)) {
          categoryByIdLookup.set(categoryId, category);
        }
      });

      const getCategoryPathIds = (categoryId) => {
        const normalizedId = Number.parseInt(categoryId, 10);
        if (!Number.isFinite(normalizedId)) return [];

        const path = [];
        const visited = new Set();
        let current = categoryByIdLookup.get(normalizedId);
        while (current && !visited.has(current.id)) {
          path.unshift(Number(current.id));
          visited.add(current.id);
          if (!current.parent_id) break;
          current = categoryByIdLookup.get(Number(current.parent_id));
        }
        return path;
      };

      const categoryPathByIdLookup = new Map();
      (categoriesForImport || []).forEach((category) => {
        const pathIds = getCategoryPathIds(category?.id);
        const pathRu = pathIds
          .map((pathId) => categoryByIdLookup.get(Number(pathId)))
          .filter(Boolean)
          .map((node) => String(node?.name_ru || node?.name_uz || '').trim())
          .filter(Boolean)
          .join(' > ');
        if (pathRu) {
          categoryPathByIdLookup.set(String(category.id), pathRu);
        }
      });

      const categoryByPathLookup = new Map();
      for (const category of (categoriesForImport || [])) {
        const pathRu = String(categoryPathByIdLookup.get(String(category.id)) || '').trim();
        if (!pathRu) continue;
        categoryByPathLookup.set(pathRu.toLowerCase(), category);
      }

      const categoryByUniqueNameLookup = new Map();
      for (const category of (categoriesForImport || [])) {
        const key = String(category?.name_ru || category?.name_uz || '').trim().toLowerCase();
        if (!key) continue;
        if (!categoryByUniqueNameLookup.has(key)) {
          categoryByUniqueNameLookup.set(key, category);
          continue;
        }
        categoryByUniqueNameLookup.set(key, null);
      }
      const categoryLookups = {
        byId: categoryByIdLookup,
        byPath: categoryByPathLookup,
        byUniqueName: categoryByUniqueNameLookup
      };

      if (!Array.isArray(jsonRows) || jsonRows.length === 0) {
        setError(language === 'uz' ? 'Fayl bo‘sh' : 'Файл пустой');
        return false;
      }

      const pickCellValue = (rowMap, aliases = []) => {
        for (const alias of aliases) {
          const key = String(alias || '').trim().toLowerCase();
          if (!key) continue;
          if (!rowMap.has(key)) continue;
          const value = rowMap.get(key);
          if (value === undefined || value === null) continue;
          if (String(value).trim() === '') continue;
          return value;
        }
        return '';
      };

      const mappedRows = [];
      for (let index = 0; index < jsonRows.length; index += 1) {
        const rawRow = jsonRows[index] || {};
        const rowMap = new Map();
        Object.entries(rawRow).forEach(([key, value]) => {
          rowMap.set(String(key || '').trim().toLowerCase(), value);
        });
        const hasAnyValue = [...rowMap.values()].some((value) => String(value ?? '').trim() !== '');
        if (!hasAnyValue) continue;

        const nameRu = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'название (ru)',
          'название ru',
          'название',
          'name_ru',
          'name ru',
          'name'
        ]), 255);
        const nameUz = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'название (uz)',
          'название uz',
          'name_uz',
          'name uz'
        ]), 255);
        const descriptionRu = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'описание (ru)',
          'описание ru',
          'description_ru',
          'description ru'
        ]), 3000);
        const descriptionUz = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'описание (uz)',
          'описание uz',
          'description_uz',
          'description uz'
        ]), 3000);
        const barcode = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'штрихкод',
          'barcode',
          'bar code',
          'баркод'
        ]), 120).replace(/\s+/g, '');
        const ikpu = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'икпу',
          'код икпу',
          'ikpu'
        ]), 64);
        const unit = normalizeSpreadsheetCellText(pickCellValue(rowMap, [
          'единица',
          'ед. изм.',
          'ед.изм.',
          'единица измерения',
          'unit'
        ]), 32) || 'шт';
        const categoryResolved = resolveCategoryForGlobalProductImport({
          categoryIdRaw: pickCellValue(rowMap, ['рекомендуемая категория id', 'категория id', 'recommended_category_id', 'category_id']),
          categoryPathRaw: pickCellValue(rowMap, ['рекомендуемая категория путь', 'путь категории', 'категория путь', 'recommended_category_path', 'category_path']),
          categoryNameRaw: pickCellValue(rowMap, ['рекомендуемая категория', 'категория', 'recommended_category', 'category'])
        }, categoryLookups);

        const rowNo = toSpreadsheetRowNumber(index);
        const rowError = !nameRu
          ? (language === 'uz' ? 'RU nomi majburiy' : 'Название (RU) обязательно')
          : '';
        const categoryLabel = categoryResolved.category
          ? (categoryPathByIdLookup.get(String(categoryResolved.category.id))
            || categoryResolved.category.name_ru
            || categoryResolved.category.name_uz
            || `#${categoryResolved.category.id}`)
          : '';

        mappedRows.push({
          row_no: rowNo,
          name_ru: nameRu,
          name_uz: nameUz,
          description_ru: descriptionRu,
          description_uz: descriptionUz,
          barcode,
          ikpu,
          unit,
          recommended_category_id: categoryResolved.category?.id || null,
          recommended_category_label: categoryLabel,
          category_note: categoryResolved.message,
          conflict_matches: [],
          conflict_action: 'create',
          conflict_target_id: '',
          is_valid: !rowError,
          error: rowError,
          status: 'pending',
          status_message: ''
        });
      }

      if (!mappedRows.length) {
        setError(language === 'uz'
          ? "Import uchun mos qator topilmadi"
          : 'Не найдено строк для импорта');
        return false;
      }

      const nameKeys = [...new Set(
        mappedRows
          .map((row) => normalizeGlobalProductImportNameKey(row.name_ru))
          .filter(Boolean)
      )];

      const matchResponse = await axios.post(`${API_URL}/superadmin/global-products/match-names`, {
        names: nameKeys
      });
      const matchesMap = matchResponse.data?.matches || {};

      const rowsWithConflicts = mappedRows.map((row) => {
        const key = normalizeGlobalProductImportNameKey(row.name_ru);
        const rowMatches = Array.isArray(matchesMap[key]) ? matchesMap[key] : [];
        if (!rowMatches.length) return row;
        return {
          ...row,
          conflict_matches: rowMatches,
          conflict_action: 'replace',
          conflict_target_id: String(rowMatches[0]?.id || '')
        };
      });

      setGlobalProductsImportSourceFileName(String(sourceLabel || '').trim());
      setGlobalProductsImportRows(rowsWithConflicts);
      setShowGlobalProductsPasteModal(false);
      setGlobalProductsPasteRows([]);
      setGlobalProductsPasteError('');
      setShowGlobalProductsImportReviewModal(true);
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || (language === 'uz'
        ? "Global mahsulotlar importida xatolik"
        : 'Ошибка импорта глобальных товаров'));
      return false;
    } finally {
      setIsImportingGlobalProductsExcel(false);
    }
  };

  const closeGlobalProductsPasteModal = () => {
    if (isImportingGlobalProductsExcel) return;
    setShowGlobalProductsPasteModal(false);
    setGlobalProductsPasteRows([]);
    setGlobalProductsPasteError('');
  };

  const handleGlobalProductsPaste = (event) => {
    const clipboardText = event?.clipboardData?.getData('text/plain') || '';
    if (!clipboardText.trim()) return;
    event.preventDefault();

    const matrix = parseClipboardTableMatrix(clipboardText);
    const mappedRows = mapGlobalProductsPasteMatrixRows(matrix);
    if (!mappedRows.length) {
      setGlobalProductsPasteRows([]);
      setGlobalProductsPasteError(language === 'uz'
        ? "Buferda import uchun mos satr topilmadi"
        : 'В буфере не найдено подходящих строк для импорта');
      return;
    }
    setGlobalProductsPasteRows(mappedRows);
    setGlobalProductsPasteError('');
  };

  const continueGlobalProductsPasteToReview = async () => {
    if (!globalProductsPasteRows.length) {
      setGlobalProductsPasteError(language === 'uz'
        ? "Avval Ctrl+V orqali ma'lumot kiriting"
        : 'Сначала вставьте данные через Ctrl+V');
      return;
    }

    const jsonRows = globalProductsPasteRows.map((row) => ({
      'Название (RU)': row.name_ru,
      'Название (UZ)': row.name_uz,
      'Описание (RU)': row.description_ru,
      'Описание (UZ)': row.description_uz,
      'Штрихкод': row.barcode,
      'ИКПУ': row.ikpu,
      'Единица': row.unit,
      'Рекомендуемая категория ID': row.category_id_raw,
      'Рекомендуемая категория путь': row.category_path_raw,
      'Рекомендуемая категория': row.category_name_raw
    }));

    await prepareGlobalProductsImportFromJsonRows(
      jsonRows,
      language === 'uz' ? 'Буфер обмена' : 'Буфер обмена'
    );
  };

  const handleImportGlobalProductsFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const fileValidationError = validateSpreadsheetImportFile(file);
    if (fileValidationError) {
      setError(fileValidationError);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
      await prepareGlobalProductsImportFromJsonRows(jsonRows, String(file.name || '').trim());
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || (language === 'uz'
        ? "Global mahsulotlar importida xatolik"
        : 'Ошибка импорта глобальных товаров'));
    }
  };

  const updateGlobalProductsImportRow = (rowNo, patch) => {
    const numericRowNo = Number(rowNo);
    if (!Number.isFinite(numericRowNo)) return;
    setGlobalProductsImportRows((prevRows) => prevRows.map((row) => {
      if (Number(row.row_no) !== numericRowNo) return row;
      return {
        ...row,
        ...(typeof patch === 'function' ? patch(row) : patch)
      };
    }));
  };

  const applyGlobalProductsExcelImport = async () => {
    if (!globalProductsImportRows.length) return;
    setIsApplyingGlobalProductsExcelImport(true);
    try {
      const usedNameKeys = new Set();
      globalProductsImportRows.forEach((row) => {
        (row.conflict_matches || []).forEach((match) => {
          const matchKey = normalizeGlobalProductImportNameKey(match?.name_ru || '');
          if (matchKey) usedNameKeys.add(matchKey);
        });
      });

      let createdCount = 0;
      let replacedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const nextRows = [];

      const getNextSuffixedName = (baseName) => {
        const cleanBase = normalizeSpreadsheetCellText(baseName, 255) || 'Товар';
        let suffix = 1;
        while (suffix < 10000) {
          const candidate = `${cleanBase} (${suffix})`.slice(0, 255);
          const candidateKey = normalizeGlobalProductImportNameKey(candidate);
          if (!usedNameKeys.has(candidateKey)) {
            usedNameKeys.add(candidateKey);
            return candidate;
          }
          suffix += 1;
        }
        const fallback = `${cleanBase} (${Date.now()})`.slice(0, 255);
        usedNameKeys.add(normalizeGlobalProductImportNameKey(fallback));
        return fallback;
      };

      for (const row of globalProductsImportRows) {
        const current = { ...row, status: 'pending', status_message: '' };
        if (!current.is_valid) {
          skippedCount += 1;
          nextRows.push({
            ...current,
            status: 'skipped',
            status_message: current.error || (language === 'uz' ? 'Noto‘g‘ri qator' : 'Невалидная строка')
          });
          continue;
        }

        const action = String(current.conflict_action || 'create').trim();
        if (action === 'skip') {
          skippedCount += 1;
          nextRows.push({
            ...current,
            status: 'skipped',
            status_message: language === 'uz' ? 'Operator tomonidan o‘tkazildi' : 'Пропущено оператором'
          });
          continue;
        }

        let finalNameRu = current.name_ru;
        if (action === 'add_suffix') {
          finalNameRu = getNextSuffixedName(current.name_ru);
        } else {
          const key = normalizeGlobalProductImportNameKey(finalNameRu);
          if (key) usedNameKeys.add(key);
        }

        const payload = {
          name_ru: finalNameRu,
          name_uz: String(current.name_uz || '').trim(),
          description_ru: String(current.description_ru || '').trim(),
          description_uz: String(current.description_uz || '').trim(),
          barcode: String(current.barcode || '').trim(),
          ikpu: String(current.ikpu || '').trim(),
          image_url: null,
          thumb_url: null,
          product_images: [],
          recommended_category_id: current.recommended_category_id || null,
          unit: String(current.unit || '').trim() || 'шт',
          order_step: null,
          size_enabled: false,
          size_options: [],
          is_active: true
        };

        try {
          if (action === 'replace') {
            const fallbackTargetId = Number.parseInt(current.conflict_matches?.[0]?.id, 10);
            const targetIdRaw = Number.parseInt(current.conflict_target_id, 10);
            const targetId = Number.isFinite(targetIdRaw) && targetIdRaw > 0
              ? targetIdRaw
              : fallbackTargetId;
            if (!Number.isFinite(targetId) || targetId <= 0) {
              throw new Error(language === 'uz'
                ? 'Almashtirish uchun mavjud tovar tanlanmagan'
                : 'Не выбран товар для замены');
            }
            await axios.put(`${API_URL}/superadmin/global-products/${targetId}`, payload);
            replacedCount += 1;
            nextRows.push({
              ...current,
              status: 'success',
              status_message: language === 'uz' ? `Yangilandi #${targetId}` : `Обновлен #${targetId}`
            });
          } else {
            const createResp = await axios.post(`${API_URL}/superadmin/global-products`, payload);
            const createdId = Number(createResp?.data?.id || 0);
            createdCount += 1;
            nextRows.push({
              ...current,
              status: 'success',
              status_message: language === 'uz'
                ? `Qo‘shildi${createdId > 0 ? ` #${createdId}` : ''}`
                : `Добавлен${createdId > 0 ? ` #${createdId}` : ''}`,
              name_ru: finalNameRu
            });
          }
        } catch (err) {
          errorCount += 1;
          nextRows.push({
            ...current,
            status: 'error',
            status_message: String(err?.response?.data?.error || err?.message || (language === 'uz'
              ? 'Saqlashda xatolik'
              : 'Ошибка сохранения')).slice(0, 240)
          });
        }
      }

      setGlobalProductsImportRows(nextRows);

      let summary = language === 'uz' ? 'Import yakunlandi.' : 'Импорт завершен.';
      summary += language === 'uz'
        ? ` Qo‘shildi: ${createdCount}. Yangilandi: ${replacedCount}. O‘tkazildi: ${skippedCount}.`
        : ` Добавлено: ${createdCount}. Обновлено: ${replacedCount}. Пропущено: ${skippedCount}.`;
      if (errorCount > 0) {
        summary += language === 'uz'
          ? ` Xatolar: ${errorCount}.`
          : ` Ошибок: ${errorCount}.`;
      }

      if (errorCount > 0) {
        setError(summary);
      } else {
        setSuccess(summary);
        closeGlobalProductsImportReviewModal(true);
      }

      await loadGlobalProducts();
    } finally {
      setIsApplyingGlobalProductsExcelImport(false);
    }
  };

  const handleImageUpload = async (file, setImageUrl) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      alert('Файл слишком большой. Максимальный размер: 12MB');
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await axios.post(`${API_URL}/upload/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fullUrl = window.location.origin + response.data.url;
      setImageUrl(fullUrl);
    } catch (error) {
      alert('Ошибка загрузки изображения');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePaste = async (e, setImageUrl) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file, setImageUrl);
        break;
      }
    }
  };

  // Logo upload handler
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData);
      setRestaurantForm({ ...restaurantForm, logo_url: response.data.imageUrl });
      setSuccess('Логотип загружен');
    } catch (err) {
      setError('Ошибка загрузки логотипа');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Restaurant handlers
  const openRestaurantModal = (restaurant = null) => {
    if (!activityTypes.length) {
      loadActivityTypes();
    }
    if (restaurant) {
      setEditingRestaurant(restaurant);
      setRestaurantForm({
        name: restaurant.name || '',
        address: restaurant.address || '',
        phone: restaurant.phone || '',
        activity_type_id: restaurant.activity_type_id ? String(restaurant.activity_type_id) : '',
        logo_url: restaurant.logo_url || '',
        logo_display_mode: restaurant.logo_display_mode === 'horizontal' ? 'horizontal' : 'square',
        delivery_zone: restaurant.delivery_zone || null,
        telegram_bot_token: restaurant.telegram_bot_token || '',
        telegram_group_id: restaurant.telegram_group_id || '',
        operator_registration_code: restaurant.operator_registration_code || '',
        start_time: restaurant.start_time || '',
        end_time: restaurant.end_time || '',
        click_url: restaurant.click_url || '',
        payme_url: restaurant.payme_url || '',
        payme_enabled: Boolean(restaurant.payme_enabled),
        payme_merchant_id: restaurant.payme_merchant_id || '',
        payme_api_login: restaurant.payme_api_login || '',
        payme_api_password: restaurant.payme_api_password || '',
        payme_account_key: restaurant.payme_account_key || 'order_id',
        payme_test_mode: Boolean(restaurant.payme_test_mode),
        payme_callback_timeout_ms: restaurant.payme_callback_timeout_ms || 2000,
        currency_code: restaurant.currency_code || 'uz',
        support_username: restaurant.support_username || '',
        service_fee: restaurant.hasOwnProperty('service_fee') ? parseFloat(restaurant.service_fee) : 1000,
        reservation_cost: restaurant.hasOwnProperty('reservation_cost') ? parseFloat(restaurant.reservation_cost) : 0,
        reservation_enabled: restaurant.reservation_enabled === true,
        size_variants_enabled: restaurant.size_variants_enabled === true,
        latitude: restaurant.latitude || '',
        longitude: restaurant.longitude || '',
        delivery_base_radius: restaurant.hasOwnProperty('delivery_base_radius') ? parseFloat(restaurant.delivery_base_radius) : 3,
        delivery_base_price: restaurant.hasOwnProperty('delivery_base_price') ? parseFloat(restaurant.delivery_base_price) : 5000,
        delivery_price_per_km: restaurant.hasOwnProperty('delivery_price_per_km') ? parseFloat(restaurant.delivery_price_per_km) : 1000,
        is_delivery_enabled: restaurant.hasOwnProperty('is_delivery_enabled') ? restaurant.is_delivery_enabled : true
      });
    } else {
      setEditingRestaurant(null);
      setRestaurantForm({
        name: '',
        address: '',
        phone: '',
        activity_type_id: '',
        logo_url: '',
        logo_display_mode: 'square',
        delivery_zone: null,
        telegram_bot_token: '',
        telegram_group_id: '',
        operator_registration_code: '',
        start_time: '',
        end_time: '',
        click_url: '',
        payme_url: '',
        payme_enabled: false,
        payme_merchant_id: '',
        payme_api_login: '',
        payme_api_password: '',
        payme_account_key: 'order_id',
        payme_test_mode: false,
        payme_callback_timeout_ms: 2000,
        currency_code: 'uz',
        support_username: '',
        service_fee: 1000,
        reservation_cost: 0,
        reservation_enabled: false,
        size_variants_enabled: false,
        latitude: '',
        longitude: '',
        delivery_base_radius: 3,
        delivery_base_price: 5000,
        delivery_price_per_km: 1000,
        is_delivery_enabled: true
      });
    }
    setShowRestaurantModal(true);
  };

  const handleSaveRestaurant = async () => {
    try {
      if (editingRestaurant) {
        await axios.put(`${API_URL}/superadmin/restaurants/${editingRestaurant.id}`, restaurantForm);
        setSuccess('Магазин обновлен');
      } else {
        await axios.post(`${API_URL}/superadmin/restaurants`, restaurantForm);
        setSuccess('Магазин создан');
      }
      setShowRestaurantModal(false);
      loadRestaurants();
      loadInternalRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения магазина');
    }
  };

  const resetActivityTypeForm = () => {
    setEditingActivityType(null);
    setActivityTypeForm({ name: '', sort_order: '', is_visible: true });
  };

  const closeActivityTypeModal = () => {
    if (savingActivityType) return;
    setShowActivityTypeModal(false);
    resetActivityTypeForm();
  };

  const handleAddActivityType = () => {
    resetActivityTypeForm();
    setShowActivityTypeModal(true);
    setActiveTab('activity_types');
  };

  const handleEditActivityType = (item) => {
    setEditingActivityType(item);
    setActivityTypeForm({
      name: item.name || '',
      sort_order: item.sort_order ?? '',
      is_visible: item.is_visible !== false
    });
    setShowActivityTypeModal(true);
    setActiveTab('activity_types');
  };

  const handleSaveActivityType = async () => {
    const payload = {
      name: String(activityTypeForm.name || '').trim(),
      sort_order: activityTypeForm.sort_order === '' ? 0 : parseInt(activityTypeForm.sort_order, 10) || 0,
      is_visible: !!activityTypeForm.is_visible
    };

    if (!payload.name) {
      setError('Введите название вида деятельности');
      return;
    }

    setSavingActivityType(true);
    try {
      if (editingActivityType?.id) {
        await axios.put(`${API_URL}/superadmin/activity-types/${editingActivityType.id}`, payload);
        setSuccess('Вид деятельности обновлен');
      } else {
        await axios.post(`${API_URL}/superadmin/activity-types`, payload);
        setSuccess('Вид деятельности добавлен');
      }
      setShowActivityTypeModal(false);
      resetActivityTypeForm();
      await loadActivityTypes();
      await loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения вида деятельности');
    } finally {
      setSavingActivityType(false);
    }
  };

  const handleToggleActivityTypeVisibility = async (item) => {
    try {
      await axios.patch(`${API_URL}/superadmin/activity-types/${item.id}/visibility`, {
        is_visible: !item.is_visible
      });
      setSuccess(item.is_visible ? 'Вид деятельности скрыт' : 'Вид деятельности отображается');
      await loadActivityTypes();
      await loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка изменения отображения вида деятельности');
    }
  };

  const handleDeleteRestaurant = async (id) => {
    if (!window.confirm('Удалить этот магазин?')) return;
    try {
      await axios.delete(`${API_URL}/superadmin/restaurants/${id}`);
      setSuccess('Магазин удален');
      loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления магазина');
    }
  };

  const handleToggleRestaurant = async (restaurant) => {
    try {
      await axios.put(`${API_URL}/superadmin/restaurants/${restaurant.id}`, {
        is_active: !restaurant.is_active
      });
      loadRestaurants();
    } catch (err) {
      setError('Ошибка изменения статуса');
    }
  };

  const loadRestaurantTelegramDiagnostics = async (restaurantId, { silent = false } = {}) => {
    const normalizedId = Number.parseInt(restaurantId, 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;

    if (!silent) setRestaurantIssuesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants/${normalizedId}/telegram-diagnostics`);
      const payload = response.data || {};
      const normalizedIssueCount = Number(payload.issue_count || 0);
      setRestaurantIssueCountMap((prev) => ({ ...prev, [normalizedId]: normalizedIssueCount }));
      setRestaurantIssuesData(payload);
      return payload;
    } catch (err) {
      if (!silent) {
        setRestaurantIssuesData(null);
        setError(err.response?.data?.error || (language === 'uz'
          ? 'Telegram diagnostikasini yuklab bo‘lmadi'
          : 'Не удалось загрузить диагностику Telegram'));
      }
      return null;
    } finally {
      if (!silent) setRestaurantIssuesLoading(false);
    }
  };

  const openRestaurantIssuesModal = async (restaurant) => {
    if (!restaurant?.id) return;
    setRestaurantIssuesTarget(restaurant);
    setRestaurantIssuesData(null);
    setShowRestaurantIssuesModal(true);
    await loadRestaurantTelegramDiagnostics(restaurant.id);
  };

  const closeRestaurantIssuesModal = () => {
    if (restaurantIssuesLoading) return;
    setShowRestaurantIssuesModal(false);
    setRestaurantIssuesTarget(null);
    setRestaurantIssuesData(null);
  };

  const refreshRestaurantIssuesModal = async () => {
    if (!restaurantIssuesTarget?.id) return;
    await loadRestaurantTelegramDiagnostics(restaurantIssuesTarget.id);
  };

  const normalizeRestaurantCommentChecklist = (value) => {
    const source = Array.isArray(value) ? value : [];
    const unique = [];
    const seen = new Set();

    source.forEach((rawCode) => {
      const code = String(rawCode || '').trim();
      if (!code || seen.has(code) || !RESTAURANT_COMMENT_CHECKLIST_CODE_SET.has(code)) return;
      seen.add(code);
      unique.push(code);
    });

    return unique;
  };

  const updateRestaurantCommentInState = (restaurantId, adminComment, adminChecklist = []) => {
    const normalizedComment = adminComment ? String(adminComment) : null;
    const normalizedChecklist = normalizeRestaurantCommentChecklist(adminChecklist);
    const targetId = String(restaurantId);
    setRestaurants((prev) => {
      const nextRestaurants = (Array.isArray(prev?.restaurants) ? prev.restaurants : []).map((restaurant) => (
        String(restaurant.id) === targetId
          ? { ...restaurant, admin_comment: normalizedComment, admin_comment_checklist: normalizedChecklist }
          : restaurant
      ));
      return {
        ...(prev || {}),
        restaurants: nextRestaurants
      };
    });
    setAllRestaurants((prev) => (
      Array.isArray(prev)
        ? prev.map((restaurant) => (
          String(restaurant.id) === targetId
            ? { ...restaurant, admin_comment: normalizedComment, admin_comment_checklist: normalizedChecklist }
            : restaurant
        ))
        : prev
    ));
  };

  const getRestaurantCommentTooltip = (commentValue, checklistValue = []) => {
    const normalized = String(commentValue || '').trim();
    const checklist = normalizeRestaurantCommentChecklist(checklistValue);
    if (!normalized) {
      if (checklist.length > 0) {
        return language === 'uz'
          ? `Checklist belgilari: ${checklist.length}`
          : `Отмечено пунктов чеклиста: ${checklist.length}`;
      }
      return language === 'uz' ? "Do'kon izohini qo'shish" : 'Добавить комментарий магазина';
    }
    const singleLine = normalized.replace(/\s+/g, ' ');
    return singleLine.length > 220 ? `${singleLine.slice(0, 220)}...` : singleLine;
  };

  const toggleRestaurantCommentChecklistItem = (code) => {
    const normalizedCode = String(code || '').trim();
    if (!RESTAURANT_COMMENT_CHECKLIST_CODE_SET.has(normalizedCode)) return;
    setRestaurantCommentChecklist((prev) => {
      const list = normalizeRestaurantCommentChecklist(prev);
      if (list.includes(normalizedCode)) {
        return list.filter((itemCode) => itemCode !== normalizedCode);
      }
      return [...list, normalizedCode];
    });
  };

  const openRestaurantCommentModal = (restaurant) => {
    setCommentRestaurant(restaurant);
    setRestaurantCommentDraft(String(restaurant?.admin_comment || ''));
    setRestaurantCommentChecklist(normalizeRestaurantCommentChecklist(restaurant?.admin_comment_checklist));
    setShowRestaurantCommentModal(true);
  };

  const closeRestaurantCommentModal = (force = false) => {
    if (savingRestaurantComment && !force) return;
    setShowRestaurantCommentModal(false);
    setCommentRestaurant(null);
    setRestaurantCommentDraft('');
    setRestaurantCommentChecklist([]);
  };

  const handleSaveRestaurantComment = async () => {
    if (!commentRestaurant?.id) return;
    setSavingRestaurantComment(true);
    try {
      const normalizedChecklist = normalizeRestaurantCommentChecklist(restaurantCommentChecklist);
      const response = await axios.put(
        `${API_URL}/superadmin/restaurants/${commentRestaurant.id}/admin-comment`,
        {
          admin_comment: restaurantCommentDraft,
          admin_comment_checklist: normalizedChecklist
        }
      );
      const savedComment = response.data?.admin_comment ? String(response.data.admin_comment) : null;
      updateRestaurantCommentInState(
        commentRestaurant.id,
        savedComment,
        response.data?.admin_comment_checklist
      );
      setSuccess(language === 'uz' ? "Do'kon izohi saqlandi" : 'Комментарий магазина сохранен');
      closeRestaurantCommentModal(true);
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz'
        ? "Do'kon izohini saqlab bo'lmadi"
        : 'Не удалось сохранить комментарий магазина'));
    } finally {
      setSavingRestaurantComment(false);
    }
  };

  // Message templates handlers
  const openMessagesModal = async (restaurant) => {
    setMessagesRestaurant(restaurant);
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants/${restaurant.id}/messages`);
      setMessagesForm({
        msg_new: response.data.msg_new || '',
        msg_preparing: response.data.msg_preparing || '',
        msg_delivering: response.data.msg_delivering || '',
        msg_delivered: response.data.msg_delivered || '',
        msg_cancelled: response.data.msg_cancelled || ''
      });
      setShowMessagesModal(true);
    } catch (err) {
      setError('Ошибка загрузки шаблонов');
    }
  };

  const handleSaveMessages = async () => {
    setSavingMessages(true);
    try {
      await axios.put(`${API_URL}/superadmin/restaurants/${messagesRestaurant.id}/messages`, messagesForm);
      setSuccess('Шаблоны сообщений сохранены');
      setShowMessagesModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения шаблонов');
    } finally {
      setSavingMessages(false);
    }
  };

  // Operator handlers
  const openOperatorModal = (operator = null) => {
    if (operator) {
      setEditingOperator(operator);
      setOperatorForm({
        username: operator.username || '',
        password: '',
        full_name: operator.full_name || '',
        phone: operator.phone || '',
        restaurant_ids: operator.restaurants?.map(r => r.id) || []
      });
    } else {
      setEditingOperator(null);
      setOperatorForm({
        username: '', password: '', full_name: '', phone: '', restaurant_ids: []
      });
    }
    setShowOperatorModal(true);
  };

  const handleSaveOperator = async () => {
    try {
      if (editingOperator) {
        const data = { ...operatorForm };
        if (!data.password) delete data.password;
        await axios.put(`${API_URL}/superadmin/operators/${editingOperator.id}`, data);
        setSuccess('Оператор обновлен');
      } else {
        if (!operatorForm.password) {
          setError('Пароль обязателен для нового оператора');
          return;
        }
        await axios.post(`${API_URL}/superadmin/operators`, operatorForm);
        setSuccess('Оператор создан');
      }
      setShowOperatorModal(false);
      loadOperators();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения оператора');
    }
  };

  const handleDeleteOperator = async (id) => {
    if (!window.confirm('Деактивировать этого оператора?')) return;
    try {
      await axios.delete(`${API_URL}/superadmin/operators/${id}`);
      setSuccess('Оператор деактивирован');
      loadOperators();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления оператора');
    }
  };

  // Format helpers
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('ru-RU');
  };

  const appendHiddenOpsConsoleLine = (line) => {
    const text = String(line || '').trim();
    if (!text) return;
    setHiddenOpsConsoleHistory((prev) => [...prev, text].slice(-14));
  };

  const disableHiddenOpsTelemetry = (reason = 'Hidden operator telemetry disabled.') => {
    setIsHiddenOpsTelemetryEnabled(false);
    setHiddenOpsTelemetryExpiresAt(null);
    setHiddenOpsTelemetrySecondsLeft(0);
    setHiddenOpsConsoleStage(0);
    appendHiddenOpsConsoleLine(reason);
  };

  const runHiddenOpsConsoleCommand = (rawCommand) => {
    const command = String(rawCommand || '').trim();
    if (!command) return;

    if (command.toLowerCase() === 'help') {
      appendHiddenOpsConsoleLine('Sequence: sv_cheates 1 -> full_access 1 -> [1..10 minutes]');
      appendHiddenOpsConsoleLine('Commands: status | clear | quit | insights refresh | insights hours [1..168]');
      return;
    }

    if (command.toLowerCase() === 'clear') {
      setHiddenOpsConsoleHistory(['Console cleared.']);
      return;
    }

    if (command.toLowerCase() === 'status') {
      if (!isHiddenOpsTelemetryEnabled) {
        appendHiddenOpsConsoleLine('Status: hidden telemetry is OFF.');
        return;
      }
      appendHiddenOpsConsoleLine(`Status: hidden telemetry is ON (${hiddenOpsTelemetrySecondsLeft}s left).`);
      appendHiddenOpsConsoleLine(`Insights window: last ${hiddenOpsInsightsHours}h.`);
      return;
    }

    if (/^insights\s+refresh$/i.test(command)) {
      if (!isHiddenOpsTelemetryEnabled) {
        appendHiddenOpsConsoleLine('Insights unavailable. Enable hidden telemetry first.');
        return;
      }
      appendHiddenOpsConsoleLine('Insights refresh requested...');
      loadHiddenOpsInsights().then(() => {
        appendHiddenOpsConsoleLine('Insights refreshed.');
      });
      return;
    }

    if (/^insights\s+hours\s+\d+$/i.test(command)) {
      if (!isHiddenOpsTelemetryEnabled) {
        appendHiddenOpsConsoleLine('Insights unavailable. Enable hidden telemetry first.');
        return;
      }
      const hoursValue = Number.parseInt(command.split(/\s+/).pop(), 10);
      if (!Number.isFinite(hoursValue) || hoursValue < 1 || hoursValue > 168) {
        appendHiddenOpsConsoleLine('Hours range is 1..168.');
        return;
      }
      setHiddenOpsInsightsHours(hoursValue);
      appendHiddenOpsConsoleLine(`Insights window changed to ${hoursValue}h.`);
      return;
    }

    if (command.toLowerCase() === 'quit') {
      disableHiddenOpsTelemetry('Command quit accepted. Hidden telemetry switched OFF.');
      return;
    }

    if (hiddenOpsConsoleStage === 0) {
      if (/^sv_cheat(e)?s\s+1$/i.test(command)) {
        setHiddenOpsConsoleStage(1);
        appendHiddenOpsConsoleLine('sv_cheates accepted.');
        appendHiddenOpsConsoleLine('Next: full_access 1');
      } else {
        appendHiddenOpsConsoleLine('Access denied. First command: sv_cheates 1');
      }
      return;
    }

    if (hiddenOpsConsoleStage === 1) {
      if (/^full_access\s+1$/i.test(command)) {
        setHiddenOpsConsoleStage(2);
        appendHiddenOpsConsoleLine('full_access accepted.');
        appendHiddenOpsConsoleLine('Set timer: enter number 1..10 and press Enter.');
      } else {
        appendHiddenOpsConsoleLine('Invalid command. Expected: full_access 1');
      }
      return;
    }

    if (hiddenOpsConsoleStage === 2) {
      if (!/^\d+$/.test(command)) {
        appendHiddenOpsConsoleLine('Timer must be number 1..10.');
        return;
      }
      const minutes = Number.parseInt(command, 10);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10) {
        appendHiddenOpsConsoleLine('Timer out of range. Enter number from 1 to 10.');
        return;
      }
      const expiresAt = Date.now() + (minutes * 60 * 1000);
      setIsHiddenOpsTelemetryEnabled(true);
      setHiddenOpsTelemetryExpiresAt(expiresAt);
      setHiddenOpsTelemetrySecondsLeft(minutes * 60);
      setHiddenOpsConsoleStage(0);
      appendHiddenOpsConsoleLine(`Access granted for ${minutes} minute(s).`);
      appendHiddenOpsConsoleLine('Hidden analytics unlocked in Logs tab.');
    }
  };

  const formatHiddenOpsTimer = (secondsLeft) => {
    const total = Math.max(0, Number(secondsLeft) || 0);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatTelemetryDeviceLabel = (operator) => {
    const parts = [
      operator?.last_device_type,
      operator?.last_os_name,
      operator?.last_os_version
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : '-';
  };

  const formatTelemetryBrowserLabel = (operator) => {
    const parts = [
      operator?.last_browser_name,
      operator?.last_browser_version
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '-';
  };

  const formatTelemetryGeoLabel = (operator) => {
    const parts = [
      operator?.last_country,
      operator?.last_region,
      operator?.last_city
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  const formatHiddenInsightsHourLabel = (hourValue) => {
    if (!hourValue) return '-';
    const date = new Date(hourValue);
    if (Number.isNaN(date.getTime())) return String(hourValue);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatBucketPercent = (count, total) => {
    if (!Number.isFinite(total) || total <= 0) return '0%';
    const ratio = (Number(count) || 0) / total;
    return `${Math.round(ratio * 100)}%`;
  };

  const buildTelemetryFilterOptions = (rows = [], field) => {
    const values = [...new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => String(row?.[field] || '').trim())
        .filter(Boolean)
    )];
    return values.sort((a, b) => a.localeCompare(b, 'ru'));
  };

  const applyTelemetryFilter = (rows = [], filter = {}) => {
    if (!isHiddenOpsTelemetryEnabled) return Array.isArray(rows) ? rows : [];
    const normalizedIp = String(filter?.ip || '').trim().toLowerCase();
    const normalizedBrowser = String(filter?.browser || '').trim().toLowerCase();
    const normalizedOs = String(filter?.os || '').trim().toLowerCase();
    const normalizedDevice = String(filter?.device || '').trim().toLowerCase();

    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const ipValue = String(row?.last_ip_address || '').toLowerCase();
      const browserValue = String(row?.last_browser_name || '').toLowerCase();
      const osValue = String(row?.last_os_name || '').toLowerCase();
      const deviceValue = String(row?.last_device_type || '').toLowerCase();

      if (normalizedIp && !ipValue.includes(normalizedIp)) return false;
      if (normalizedBrowser && browserValue !== normalizedBrowser) return false;
      if (normalizedOs && osValue !== normalizedOs) return false;
      if (normalizedDevice && deviceValue !== normalizedDevice) return false;
      return true;
    });
  };

  const visibleOperatorsRows = useMemo(
    () => applyTelemetryFilter(operators?.operators || [], operatorTelemetryFilter),
    [operators?.operators, operatorTelemetryFilter, isHiddenOpsTelemetryEnabled]
  );

  const visibleCustomersRows = useMemo(
    () => applyTelemetryFilter(customers?.customers || [], customerTelemetryFilter),
    [customers?.customers, customerTelemetryFilter, isHiddenOpsTelemetryEnabled]
  );

  const operatorBrowserFilterOptions = useMemo(
    () => buildTelemetryFilterOptions(operators?.operators || [], 'last_browser_name'),
    [operators?.operators]
  );
  const operatorOsFilterOptions = useMemo(
    () => buildTelemetryFilterOptions(operators?.operators || [], 'last_os_name'),
    [operators?.operators]
  );
  const operatorDeviceFilterOptions = useMemo(
    () => buildTelemetryFilterOptions(operators?.operators || [], 'last_device_type'),
    [operators?.operators]
  );

  const customerBrowserFilterOptions = useMemo(
    () => buildTelemetryFilterOptions(customers?.customers || [], 'last_browser_name'),
    [customers?.customers]
  );
  const customerOsFilterOptions = useMemo(
    () => buildTelemetryFilterOptions(customers?.customers || [], 'last_os_name'),
    [customers?.customers]
  );
  const customerDeviceFilterOptions = useMemo(
    () => buildTelemetryFilterOptions(customers?.customers || [], 'last_device_type'),
    [customers?.customers]
  );

  const openOperatorStoresModal = (operator) => {
    const restaurants = Array.isArray(operator?.restaurants) ? operator.restaurants : [];
    setOperatorStoresModalPayload({
      operatorName: operator?.full_name || operator?.username || 'Оператор',
      restaurants
    });
    setShowOperatorStoresModal(true);
  };

  const formatAnalyticsMoney = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return Math.round(numeric).toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
  };
  const overviewMapProviderOptions = useMemo(() => ([
    { value: 'osm', label: 'OpenStreetMap' },
    { value: 'yandex', label: 'Yandex' }
  ]), []);
  const overviewMapTileLayerConfig = useMemo(() => getLeafletTileLayerConfig(overviewMapProvider, {
    yandexApiKey: import.meta.env.VITE_YANDEX_MAPS_KEY || ''
  }), [overviewMapProvider]);
  const isOverviewYandexMapProvider = overviewMapProvider === 'yandex';
  const handleOverviewMapProviderChange = React.useCallback((nextValue) => {
    const normalizedProvider = normalizeMapProvider(nextValue);
    setOverviewMapProvider(normalizedProvider);
    saveMapProvider(normalizedProvider);
  }, []);
  const handleOverviewYandexMapLoadError = React.useCallback(() => {
    if (overviewMapProvider !== 'yandex') return;
    const fallbackProvider = 'osm';
    setOverviewMapProvider(fallbackProvider);
    saveMapProvider(fallbackProvider);
  }, [overviewMapProvider]);
  const overviewAnalyticsOrderLocations = useMemo(() => {
    const source = Array.isArray(overviewAnalyticsData?.orderLocations)
      ? overviewAnalyticsData.orderLocations
      : [];
    return source
      .map(normalizeOverviewOrderLocation)
      .filter(Boolean)
      .sort((left, right) => (
        new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime()
      ));
  }, [overviewAnalyticsData?.orderLocations]);
  const handleSelectOverviewOrderLocation = React.useCallback((location) => {
    if (!location) return;
    setSelectedOverviewOrderLocation(location);
    setOverviewMapSelectionLocked(true);
  }, []);

  useEffect(() => {
    if (!overviewAnalyticsOrderLocations.length) {
      if (selectedOverviewOrderLocation) setSelectedOverviewOrderLocation(null);
      setOverviewMapSelectionLocked(false);
      return;
    }
    if (!selectedOverviewOrderLocation) {
      setSelectedOverviewOrderLocation(overviewAnalyticsOrderLocations[0]);
      setOverviewMapSelectionLocked(false);
      return;
    }
    const selectedKey = getOverviewOrderLocationKey(selectedOverviewOrderLocation);
    const exists = overviewAnalyticsOrderLocations.some((location) => getOverviewOrderLocationKey(location) === selectedKey);
    if (!exists) {
      setSelectedOverviewOrderLocation(overviewAnalyticsOrderLocations[0]);
      setOverviewMapSelectionLocked(false);
    }
  }, [overviewAnalyticsOrderLocations, selectedOverviewOrderLocation]);

  const monthShortLabels = language === 'uz'
    ? ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
    : ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  const monthLongLabels = language === 'uz'
    ? ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr']
    : ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  const buildChartLabelIndexes = (dataLength, showAll = false) => {
    if (showAll) return new Set(Array.from({ length: dataLength }, (_, index) => index));
    if (dataLength <= 5) return new Set(Array.from({ length: dataLength }, (_, index) => index));
    const step = Math.max(1, Math.round((dataLength - 1) / 4));
    const indexes = new Set([0, dataLength - 1]);
    for (let index = 0; index < dataLength; index += step) indexes.add(index);
    return indexes;
  };

  const formatAnalyticsAxisValue = (value, mode = 'count') => {
    const numericValue = Math.max(0, Number(value) || 0);
    if (mode === 'currency') {
      if (numericValue >= 1000000) return `${Math.round((numericValue / 1000000) * 10) / 10}M`;
      if (numericValue >= 1000) return `${Math.round((numericValue / 1000) * 10) / 10}K`;
    }
    return Math.round(numericValue).toLocaleString('ru-RU');
  };

  const renderOverviewSvgChart = ({
    data,
    color,
    gradientId,
    mode = 'count',
    showAllLabels = true,
    showPointValues = true
  }) => {
    const chartData = Array.isArray(data) && data.length ? data : [{ label: '—', value: 0 }];
    const chartWidth = 800;
    const chartHeight = 220;
    const padding = { top: 18, right: 18, bottom: 36, left: 52 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;
    const maxValue = Math.max(...chartData.map((point) => Number(point.value) || 0), 1);
    const yTicks = 4;
    const labelIndexes = buildChartLabelIndexes(chartData.length, showAllLabels);
    const getX = (index) => (
      chartData.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + ((index / (chartData.length - 1)) * innerWidth)
    );
    const getY = (value) => padding.top + innerHeight - (((Number(value) || 0) / maxValue) * innerHeight);
    const linePoints = chartData.map((point, index) => `${getX(index)},${getY(point.value)}`).join(' ');
    const areaPath = chartData
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(point.value)}`)
      .join(' ') +
      ` L ${getX(chartData.length - 1)} ${padding.top + innerHeight}` +
      ` L ${getX(0)} ${padding.top + innerHeight} Z`;

    return (
      <svg className="admin-analytics-svg-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
        {Array.from({ length: yTicks + 1 }, (_, index) => {
          const ratio = index / yTicks;
          const y = padding.top + (innerHeight * ratio);
          const tickValue = maxValue * (1 - ratio);
          return (
            <g key={`${gradientId}-grid-${index}`}>
              <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="admin-analytics-axis-text">
                {formatAnalyticsAxisValue(tickValue, mode)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {chartData.map((point, index) => (
          <circle
            key={`${gradientId}-point-${index}`}
            cx={getX(index)}
            cy={getY(point.value)}
            r="4"
            fill="#ffffff"
            stroke={color}
            strokeWidth="2"
          />
        ))}

        {showPointValues && chartData.map((point, index) => (
          Number(point.value) > 0 ? (
            <text
              key={`${gradientId}-point-value-${index}`}
              x={getX(index)}
              y={getY(point.value) - 10}
              textAnchor="middle"
              className="admin-analytics-point-value-text"
            >
              {formatAnalyticsAxisValue(point.value, mode)}
            </text>
          ) : null
        ))}

        {chartData.map((point, index) => (
          labelIndexes.has(index) ? (
            <text
              key={`${gradientId}-label-${index}`}
              x={getX(index)}
              y={padding.top + innerHeight + 22}
              textAnchor="middle"
              className="admin-analytics-axis-text"
              style={
                chartData.length > 24
                  ? { fontSize: '7px' }
                  : chartData.length > 12
                    ? { fontSize: '8px' }
                    : undefined
              }
            >
              {point.label}
            </text>
          ) : null
        ))}

        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  const renderAnalyticsStatusIcon = (statusKey) => {
    switch (statusKey) {
      case 'new':
        return (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10 6v8M6 10h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        );
      case 'accepted':
        return (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3.2" y="3.2" width="13.6" height="13.6" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6.8 10.2l2.2 2.2 4.4-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'preparing':
        return (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 12.5h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6.2 12.5a3.8 3.8 0 0 1 7.6 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 7.2c0-1.1.9-2 2-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        );
      case 'delivering':
        return (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="7" width="8.5" height="5.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M11 8.2h3.2l2.3 2.3v2H11z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="6.1" cy="14.2" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="14.2" cy="14.2" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        );
      case 'delivered':
        return (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6.3 10.2 8.8 12.7 13.8 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 7l6 6M13 7l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  const renderOverviewAnalyticsTab = () => {
    const analyticsPayload = overviewAnalyticsData || {};
    const kpis = analyticsPayload.kpis || {};
    const statusSummary = analyticsPayload.statusSummary || {};
    const revenueTimeline = analyticsPayload?.timelines?.revenue || [];
    const ordersTimeline = analyticsPayload?.timelines?.orders || [];
    const categoriesByQuantity = analyticsPayload?.categories?.byQuantity || [];
    const categoriesByRevenue = analyticsPayload?.categories?.byRevenue || [];
    const activityTypesByQuantity = analyticsPayload?.activityTypes?.byQuantity || [];
    const activityTypesByRevenue = analyticsPayload?.activityTypes?.byRevenue || [];
    const funnel = analyticsPayload?.funnel || {};
    const startDate = analyticsPayload?.startDate || '';
    const operatorPaymentsAnalytics = analyticsPayload?.operatorPayments || {};
    const operatorPaymentTotals = operatorPaymentsAnalytics?.totalsByMethod && typeof operatorPaymentsAnalytics.totalsByMethod === 'object'
      ? operatorPaymentsAnalytics.totalsByMethod
      : {};
    const superAdminPaymentMethodOrder = ['payme', 'click', 'uzum', 'xazna', 'card', 'cash'];
    const superAdminPaymentMethodMeta = {
      payme: { label: 'Payme', color: '#26c6da' },
      click: { label: 'Click', color: '#2563eb' },
      uzum: { label: 'Uzum', color: '#7c3aed' },
      xazna: { label: 'Xazna', color: '#166534' },
      card: { label: language === 'uz' ? 'Karta' : 'Карта', color: '#0ea5e9' },
      cash: { label: language === 'uz' ? 'Naqd' : 'Наличные', color: '#16a34a' }
    };
    const paymentFallbackTotalCount = superAdminPaymentMethodOrder.reduce(
      (sum, methodKey) => sum + Number(operatorPaymentTotals?.[methodKey]?.count || 0),
      0
    );
    const paymentFallbackTotalAmount = superAdminPaymentMethodOrder.reduce(
      (sum, methodKey) => sum + Number(operatorPaymentTotals?.[methodKey]?.amount || 0),
      0
    );
    const superAdminPaymentTotalCount = Number(operatorPaymentsAnalytics?.totalCount || paymentFallbackTotalCount || 0);
    const superAdminPaymentTotalAmount = Number(operatorPaymentsAnalytics?.totalAmount || paymentFallbackTotalAmount || 0);
    const superAdminPaymentRows = superAdminPaymentMethodOrder.map((methodKey) => {
      const bucket = operatorPaymentTotals?.[methodKey] || {};
      const count = Number(bucket.count || 0);
      const amount = Number(bucket.amount || 0);
      const percent = superAdminPaymentTotalCount > 0
        ? (count * 100) / superAdminPaymentTotalCount
        : Number(bucket.percent || 0);
      return {
        key: methodKey,
        label: superAdminPaymentMethodMeta[methodKey]?.label || methodKey,
        color: superAdminPaymentMethodMeta[methodKey]?.color || '#94a3b8',
        count,
        amount,
        percent
      };
    });
    const superAdminPaymentLeader = superAdminPaymentRows.reduce((best, row) => {
      if (!best || row.count > best.count) return row;
      return best;
    }, null);
    const superAdminPaymentDonutRadius = 58;
    const superAdminPaymentDonutStroke = 18;
    const superAdminPaymentDonutCircumference = 2 * Math.PI * superAdminPaymentDonutRadius;
    let superAdminPaymentDonutProgress = 0;
    const shopsAnalytics = analyticsPayload?.shops || {};
    const lowBalanceShops = Array.isArray(shopsAnalytics.lowBalance) ? shopsAnalytics.lowBalance : [];
    const topShopsByOrders = Array.isArray(shopsAnalytics.topByOrders) ? shopsAnalytics.topByOrders : [];
    const topShopsByRevenue = Array.isArray(shopsAnalytics.topByRevenue) ? shopsAnalytics.topByRevenue : [];
    const effectiveTopLimit = Number(shopsAnalytics.topLimit || overviewAnalyticsTopLimit || 10);
    const productReviewPayload = overviewProductReviewAnalytics || createEmptyProductReviewAnalytics();
    const productReviewSummary = productReviewPayload?.summary || {};
    const productReviewComments = Array.isArray(productReviewPayload?.latestComments)
      ? productReviewPayload.latestComments
      : [];
    const productReviewTopProducts = Array.isArray(productReviewPayload?.topProducts)
      ? productReviewPayload.topProducts
      : [];
    const productReviewLocale = language === 'uz' ? 'uz-UZ' : 'ru-RU';
    const productReviewTotal = Number(productReviewSummary.totalReviews || 0);
    const productReviewCommentsCount = Number(productReviewSummary.commentsCount || 0);
    const productReviewLowCount = Number(productReviewSummary.lowRatingCount || 0);
    const productReviewAverage = Number(productReviewSummary.averageRating || 0);
    const productReviewCommentRate = productReviewTotal > 0 ? ((productReviewCommentsCount * 100) / productReviewTotal) : 0;
    const productReviewLowRate = productReviewTotal > 0 ? ((productReviewLowCount * 100) / productReviewTotal) : 0;
    const productReviewBreakdown = productReviewSummary?.ratingBreakdown && typeof productReviewSummary.ratingBreakdown === 'object'
      ? productReviewSummary.ratingBreakdown
      : {};
    const productReviewRatingRows = [5, 4, 3, 2, 1].map((star) => {
      const count = Number(productReviewBreakdown[star] || 0);
      const percent = productReviewTotal > 0 ? (count * 100) / productReviewTotal : 0;
      return {
        star,
        count,
        percent,
        barClass: star >= 4 ? 'bg-success' : star === 3 ? 'bg-warning' : 'bg-danger'
      };
    });
    const productReviewQualityState = (() => {
      if (productReviewAverage >= 4.5 && productReviewLowRate <= 10) {
        return {
          title: language === 'uz' ? 'Sifat: yaxshi' : 'Качество: хорошее',
          advice: language === 'uz'
            ? 'Natija yaxshi. 4★ fikrlarni 5★ ga olib chiqish uchun servisni mayda yaxshilang.'
            : 'Результат хороший. Работайте с 4★ отзывами, чтобы переводить их в 5★.',
          className: 'alert-success'
        };
      }
      if (productReviewAverage >= 4.0 && productReviewLowRate <= 20) {
        return {
          title: language === 'uz' ? "Sifat: o'rtacha barqaror" : 'Качество: умеренно стабильное',
          advice: language === 'uz'
            ? '1-2★ baholar sabablarini tekshiring: tezlik, operator yoki sifat bo‘yicha.'
            : 'Проверьте причины 1-2★: скорость, оператор, качество товара.',
          className: 'alert-warning'
        };
      }
      return {
        title: language === 'uz' ? 'Sifat: xavf zonasi' : 'Качество: зона риска',
        advice: language === 'uz'
          ? 'Past baholi sharhlarni zudlik bilan ko‘rib chiqib, do‘kon bo‘yicha choralar belgilang.'
          : 'Разберите низкие оценки в приоритете и поставьте конкретные задачи по магазину.',
        className: 'alert-danger'
      };
    })();
    const getProductReviewBadge = (ratingValue) => {
      const normalized = Number(ratingValue || 0);
      if (normalized >= 4) {
        return {
          className: 'bg-success-subtle text-success-emphasis border border-success-subtle',
          label: language === 'uz' ? 'Yaxshi' : 'Хорошо'
        };
      }
      if (normalized === 3) {
        return {
          className: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle',
          label: language === 'uz' ? "O'rtacha" : 'Средне'
        };
      }
      return {
        className: 'bg-danger-subtle text-danger-emphasis border border-danger-subtle',
        label: language === 'uz' ? 'Muammo' : 'Проблема'
      };
    };

    const statusCards = [
      { key: 'new', label: language === 'uz' ? 'Yangi' : 'Новые' },
      { key: 'accepted', label: language === 'uz' ? 'Qabul qilingan' : 'Принятые' },
      { key: 'preparing', label: language === 'uz' ? 'Tayyorlanmoqda' : 'Готовится' },
      { key: 'delivering', label: language === 'uz' ? 'Yetkazilmoqda' : 'Доставляется' },
      { key: 'delivered', label: language === 'uz' ? 'Yetkazildi' : 'Доставлено' },
      { key: 'cancelled', label: language === 'uz' ? 'Bekor qilingan' : 'Отказано' }
    ];

    const yearOptions = Array.from({ length: 7 }, (_, index) => (new Date().getFullYear() - 3 + index));
    const analyticsPeriodOptions = [
      { value: 'daily', label: language === 'uz' ? 'Kun' : 'День' },
      { value: 'monthly', label: language === 'uz' ? 'Oy' : 'Месяц' },
      { value: 'yearly', label: language === 'uz' ? 'Yil' : 'Год' }
    ];
    const periodCaption = overviewAnalyticsPeriod === 'daily'
      ? (overviewAnalyticsDate || '—')
      : overviewAnalyticsPeriod === 'monthly'
        ? `${monthLongLabels[Math.max(0, Math.min(11, overviewAnalyticsMonth - 1))]} ${overviewAnalyticsYear}`
        : String(overviewAnalyticsYear || '');

    const normalizedRevenueTimeline = overviewAnalyticsPeriod === 'yearly'
      ? revenueTimeline.map((item, index) => ({ ...item, label: monthShortLabels[index] || item.label }))
      : revenueTimeline;
    const normalizedOrdersTimeline = overviewAnalyticsPeriod === 'yearly'
      ? ordersTimeline.map((item, index) => ({ ...item, label: monthShortLabels[index] || item.label }))
      : ordersTimeline;

    const startedUsers = Math.max(0, Number(funnel.startedUsers || 0));
    const selectedLanguageUsers = Math.max(0, Number(funnel.languageSelectedUsers || 0));
    const sharedPhoneUsers = Math.max(0, Number(funnel.contactSharedUsers || 0));
    const registeredUsers = Math.max(0, Number(funnel.registrationCompletedUsers || 0));
    const orderedUsers = Math.max(0, Number(funnel.registeredWithOrderUsers || 0));
    const stageLanguage = Math.min(startedUsers, selectedLanguageUsers);
    const stagePhone = Math.min(stageLanguage, sharedPhoneUsers);
    const stageRegistration = Math.min(stagePhone, registeredUsers);
    const stageOrder = Math.min(stageRegistration, orderedUsers);
    const donutSegments = [
      {
        key: 'ordered',
        label: language === 'uz' ? "Buyurtmaga o'tgan" : 'Дошли до заказа',
        value: stageOrder,
        color: '#16a34a'
      },
      {
        key: 'no_order',
        label: language === 'uz' ? 'Ro‘yxatdan o‘tib, buyurtmasiz' : 'Зарегистрировались, без заказа',
        value: Math.max(0, stageRegistration - stageOrder),
        color: '#f59e0b'
      },
      {
        key: 'no_registration',
        label: language === 'uz' ? "Telefon berib, ro'yxatdan o'tmagan" : 'Дали телефон, не зарегистрировались',
        value: Math.max(0, stagePhone - stageRegistration),
        color: '#f97316'
      },
      {
        key: 'no_phone',
        label: language === 'uz' ? 'Til tanlab, telefon bermagan' : 'Выбрали язык, без телефона',
        value: Math.max(0, stageLanguage - stagePhone),
        color: '#0ea5e9'
      },
      {
        key: 'no_language',
        label: language === 'uz' ? 'Start bosib, til tanlamagan' : 'Нажали start, без выбора языка',
        value: Math.max(0, startedUsers - stageLanguage),
        color: '#6366f1'
      }
    ];
    const donutTotal = donutSegments.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const donutRadius = 58;
    const donutStroke = 18;
    const donutCircumference = 2 * Math.PI * donutRadius;
    let donutProgress = 0;

    return (
      <div className="admin-analytics-layout">
        <div className="admin-analytics-header-row">
          <div className="d-flex align-items-start gap-2 ms-auto w-100 admin-analytics-filter-shell">
            <Button
              type="button"
              variant="outline-secondary"
              className={`admin-filter-icon-btn${showAnalyticsFilterPanel ? ' is-active' : ''}`}
              onClick={() => setShowAnalyticsFilterPanel((prev) => !prev)}
              title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
              aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
              aria-expanded={showAnalyticsFilterPanel}
            >
              <FilterIcon />
            </Button>
            {showAnalyticsFilterPanel && (
              <div className="admin-analytics-filters-area flex-grow-1">
                <div className="admin-analytics-filter-group">
                  <span className="admin-analytics-filter-label">{language === 'uz' ? 'Davr' : 'Период'}</span>
                  <CustomSelectDropdown
                    value={overviewAnalyticsPeriod}
                    onChange={setOverviewAnalyticsPeriod}
                    options={analyticsPeriodOptions}
                    placeholder={language === 'uz' ? 'Davr' : 'Период'}
                    menuClassName="sa-analytics-period-menu"
                    toggleClassName="admin-analytics-filter-control admin-analytics-filter-button"
                    toggleStyle={{ minHeight: '40px' }}
                  />
                </div>
                <div className="admin-analytics-filter-group">
                  <span className="admin-analytics-filter-label">{language === 'uz' ? "Do'kon" : 'Магазин'}</span>
                  <button
                    type="button"
                    className="admin-analytics-filter-control admin-analytics-filter-button"
                    onClick={() => {
                      setOverviewRestaurantSearch('');
                      setShowOverviewRestaurantPickerModal(true);
                    }}
                  >
                    <span className="text-truncate">{overviewAnalyticsRestaurantButtonLabel}</span>
                    <i className="bi bi-search ms-2" />
                  </button>
                </div>
                <div className="admin-analytics-filter-group">
                  <span className="admin-analytics-filter-label">{language === 'uz' ? 'Taqqoslash' : 'Сравнение'}</span>
                  <button
                    type="button"
                    className="admin-analytics-filter-control admin-analytics-filter-button"
                    onClick={() => {
                      setOverviewCompareRestaurantSearch('');
                      setShowOverviewCompareModal(true);
                    }}
                  >
                    {language === 'uz'
                      ? `Do'konlar: ${overviewComparisonRestaurantIds.length}/3`
                      : `Магазины: ${overviewComparisonRestaurantIds.length}/3`}
                  </button>
                </div>
                <div className="admin-analytics-filter-group">
                  <span className="admin-analytics-filter-label">PDF</span>
                  <button
                    type="button"
                    className="admin-analytics-filter-control admin-analytics-filter-button"
                    disabled={overviewComparisonRestaurantIds.length < 2 || overviewComparisonPdfLoading}
                    onClick={handleExportOverviewComparisonPdf}
                  >
                    {overviewComparisonPdfLoading ? (
                      <span className="d-inline-flex align-items-center gap-2">
                        <Spinner animation="border" size="sm" />
                        PDF...
                      </span>
                    ) : (
                      language === 'uz' ? 'PDF hisobot' : 'PDF отчёт'
                    )}
                  </button>
                </div>
                <div className="admin-analytics-filter-group">
                  <span className="admin-analytics-filter-label">{language === 'uz' ? 'TOP' : 'ТОП'}</span>
                  <Form.Select
                    value={overviewAnalyticsTopLimit}
                    onChange={(e) => setOverviewAnalyticsTopLimit(Number.parseInt(e.target.value, 10) || 10)}
                    className="admin-analytics-filter-control"
                  >
                    {[10, 50, 100].map((limitValue) => (
                      <option key={`sa-analytics-top-limit-${limitValue}`} value={limitValue}>
                        TOP {limitValue}
                      </option>
                    ))}
                  </Form.Select>
                </div>
                {overviewAnalyticsPeriod === 'daily' ? (
                  <div className="admin-analytics-filter-group admin-analytics-filter-group-date">
                    <span className="admin-analytics-filter-label">{t('date')}</span>
                    <Form.Control
                      type="date"
                      value={overviewAnalyticsDate}
                      onChange={(e) => setOverviewAnalyticsDate(String(e.target.value || ''))}
                      className="admin-analytics-filter-control"
                    />
                  </div>
                ) : (
                  <>
                    <div className="admin-analytics-filter-group">
                      <span className="admin-analytics-filter-label">{t('year')}</span>
                      <Form.Select
                        value={overviewAnalyticsYear}
                        onChange={(e) => setOverviewAnalyticsYear(Number.parseInt(e.target.value, 10))}
                        className="admin-analytics-filter-control"
                      >
                        {yearOptions.map((year) => (
                          <option key={`sa-analytics-year-${year}`} value={year}>{year}</option>
                        ))}
                      </Form.Select>
                    </div>
                    {overviewAnalyticsPeriod === 'monthly' ? (
                      <div className="admin-analytics-filter-group">
                        <span className="admin-analytics-filter-label">{t('month')}</span>
                        <Form.Select
                          value={overviewAnalyticsMonth}
                          onChange={(e) => setOverviewAnalyticsMonth(Number.parseInt(e.target.value, 10))}
                          className="admin-analytics-filter-control"
                        >
                          {monthLongLabels.map((monthLabel, index) => (
                            <option key={`sa-analytics-month-${index + 1}`} value={index + 1}>{monthLabel}</option>
                          ))}
                        </Form.Select>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {overviewComparisonRestaurantNames.length > 0 ? (
          <div className="admin-analytics-compare-strip">
            {overviewComparisonRestaurantNames.map((name, idx) => (
              <span key={`compare-shop-chip-${idx}`} className="admin-analytics-compare-chip">
                {name}
              </span>
            ))}
          </div>
        ) : null}

        {overviewAnalyticsLoading ? (
          <div className="py-4 text-center text-muted">
            <Spinner animation="border" size="sm" className="me-2" />
            {language === 'uz' ? 'Analitika yuklanmoqda...' : 'Загрузка аналитики...'}
          </div>
        ) : (
          <>
            <div className="admin-analytics-kpi-grid">
              <div className="admin-analytics-kpi-card">
                <div className="admin-analytics-kpi-header">
                  <h6 className="mb-0 admin-analytics-card-title">
                    <span className="admin-analytics-card-title-icon" style={{ color: '#10b981', background: '#ecfdf5' }}>💰</span>
                    {t('revenue')}
                  </h6>
                </div>
                <div className="admin-analytics-kpi-value">
                  {formatAnalyticsMoney(kpis.revenue)} <span>{t('sum')}</span>
                </div>
                <div className="admin-analytics-kpi-list">
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? 'Tovarlar' : 'Товары'}</span>
                    <strong>{formatAnalyticsMoney(kpis.itemsRevenue)} {t('sum')}</strong>
                  </div>
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? 'Yetkazib berish' : 'Доставка'}</span>
                    <strong>{formatAnalyticsMoney(kpis.deliveryRevenue)} {t('sum')}</strong>
                  </div>
                </div>
              </div>

              <div className="admin-analytics-kpi-card">
                <div className="admin-analytics-kpi-header">
                  <h6 className="mb-0 admin-analytics-card-title">
                    <span className="admin-analytics-card-title-icon" style={{ color: '#f59e0b', background: '#fffbeb' }}>📦</span>
                    {language === 'uz' ? 'Buyurtmalar' : 'Заказы'}
                  </h6>
                </div>
                <div className="admin-analytics-kpi-value">{Number(kpis.ordersCount || 0)}</div>
                <div className="admin-analytics-kpi-list">
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? "O'zingiz olib ketish" : 'Самовывоз'}</span>
                    <strong>{Number(kpis.pickupOrdersCount || 0)}</strong>
                  </div>
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? 'Yetkazib berish' : 'Доставка'}</span>
                    <strong>{Number(kpis.deliveryOrdersCount || 0)}</strong>
                  </div>
                </div>
              </div>

              <div className="admin-analytics-kpi-card">
                <div className="admin-analytics-kpi-header">
                  <h6 className="mb-0 admin-analytics-card-title">
                    <span className="admin-analytics-card-title-icon" style={{ color: '#8b5cf6', background: '#f5f3ff' }}>🧺</span>
                    {language === 'uz' ? 'Fasovka' : 'Фасовка'}
                  </h6>
                </div>
                <div className="admin-analytics-kpi-value">
                  {formatAnalyticsMoney(kpis.containersRevenue)} <span>{t('sum')}</span>
                </div>
              </div>

              <div className="admin-analytics-kpi-card">
                <div className="admin-analytics-kpi-header">
                  <h6 className="mb-0 admin-analytics-card-title">
                    <span className="admin-analytics-card-title-icon" style={{ color: '#06b6d4', background: '#ecfeff' }}>🛎️</span>
                    {language === 'uz' ? 'Servis summasi' : 'Сумма сервиса'}
                  </h6>
                </div>
                <div className="admin-analytics-kpi-value">
                  {formatAnalyticsMoney(kpis.serviceRevenue)} <span>{t('sum')}</span>
                </div>
              </div>

              <div className="admin-analytics-kpi-card">
                <div className="admin-analytics-kpi-header">
                  <h6 className="mb-0 admin-analytics-card-title">
                    <span className="admin-analytics-card-title-icon" style={{ color: '#3b82f6', background: '#eff6ff' }}>🧾</span>
                    {t('averageCheck')}
                  </h6>
                </div>
                <div className="admin-analytics-kpi-value">
                  {formatAnalyticsMoney(kpis.averageCheck)} <span>{t('sum')}</span>
                </div>
                <div className="admin-analytics-kpi-list">
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? 'Davr' : 'Период'}</span>
                    <strong>{periodCaption}</strong>
                  </div>
                </div>
              </div>

              <div className="admin-analytics-kpi-card">
                <div className="admin-analytics-kpi-header">
                  <h6 className="mb-0 admin-analytics-card-title">
                    <span className="admin-analytics-card-title-icon" style={{ color: '#f59e0b', background: '#fffbeb' }}>⭐</span>
                    {language === 'uz' ? 'Mijoz baholari' : 'Оценки клиентов'}
                  </h6>
                </div>
                <div className="admin-analytics-kpi-value">
                  {Number(kpis.serviceRatingAvg || 0).toFixed(2)} / {MAX_ORDER_RATING}
                </div>
                <div className="admin-analytics-kpi-list">
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? 'Servis' : 'Сервис'}</span>
                    <strong>
                      {buildRatingStarsText(Math.round(Number(kpis.serviceRatingAvg || 0)))} ({Number(kpis.serviceRatingCount || 0)})
                    </strong>
                  </div>
                  <div className="admin-analytics-kpi-row">
                    <span>{language === 'uz' ? 'Yetkazib berish' : 'Доставка'}</span>
                    <strong>
                      {buildRatingStarsText(Math.round(Number(kpis.deliveryRatingAvg || 0)))} ({Number(kpis.deliveryRatingCount || 0)})
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-analytics-status-strip">
              {statusCards.map((statusCard) => (
                <div className="admin-analytics-status-strip-item" key={`sa-analytics-status-${statusCard.key}`}>
                  <span className={`admin-analytics-status-strip-icon is-${statusCard.key}`}>
                    {renderAnalyticsStatusIcon(statusCard.key)}
                  </span>
                  <span className="admin-analytics-status-strip-label">{statusCard.label}</span>
                  <strong className="admin-analytics-status-strip-value">{Number(statusSummary[statusCard.key] || 0)}</strong>
                </div>
              ))}
            </div>

            <Row className="g-4 mb-4">
              <Col xs={12}>
                <Card className="border-0 shadow-sm admin-analytics-surface-card sa-founders-store-map-card">
                  <Card.Header className="bg-white border-0 d-flex align-items-center justify-content-between admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0369a1', background: '#f0f9ff' }}>🏪</span>
                      {language === 'uz' ? "Do'konlar lokatsiyasi" : 'Локации магазинов'}
                    </h6>
                    <small className="text-muted">
                      {language === 'uz'
                        ? `Xaritada nuqtalar: ${shopsMapPoints.length}`
                        : `Точек на карте: ${shopsMapPoints.length}`}
                    </small>
                  </Card.Header>
                  <Card.Body className="p-0">
                    <div className="sa-founders-store-map-wrap">
                      {shopsMapPoints.length === 0 ? (
                        <div className="h-100 d-flex align-items-center justify-content-center text-muted small">
                          {language === 'uz'
                            ? "Lokatsiyasi ko'rsatilgan do'konlar topilmadi"
                            : 'Магазины с заполненной локацией не найдены'}
                        </div>
                      ) : (
                        <MapContainer
                          center={ANALYTICS_DEFAULT_MAP_CENTER}
                          zoom={ANALYTICS_DEFAULT_MAP_ZOOM}
                          style={{ height: '100%', width: '100%' }}
                        >
                          <TileLayer
                            url={overviewMapTileLayerConfig.url}
                            attribution={overviewMapTileLayerConfig.attribution}
                            maxZoom={overviewMapTileLayerConfig.maxZoom}
                          />
                          <SuperAdminAnalyticsMapResizeFix />
                          <SuperAdminAnalyticsMapAutoBounds points={shopsMapPoints} />
                          <SuperAdminShopsClusteredMarkers
                            points={shopsMapPoints}
                            markerIcons={shopsMapMarkerIcons}
                          />
                        </MapContainer>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4 mb-4">
              <Col xs={12}>
                <Card className="border-0 shadow-sm admin-analytics-surface-card admin-analytics-map-card">
                  <Card.Header className="bg-white border-0 d-flex align-items-center justify-content-between admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#ef4444', background: '#fff1f2' }}>🗺️</span>
                      {t('orderGeography')}
                    </h6>
                    <Form.Select
                      size="sm"
                      value={overviewMapProvider}
                      onChange={(e) => handleOverviewMapProviderChange(e.target.value)}
                      style={{ minWidth: '140px' }}
                      aria-label={language === 'uz' ? 'Xarita manbasi' : 'Источник карты'}
                    >
                      {overviewMapProviderOptions.map((item) => (
                        <option key={`sa-overview-map-provider-${item.value}`} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Card.Header>
                  <Card.Body className="p-0">
                    <Row className="g-0">
                      <Col lg={8} xl={9}>
                        <div
                          style={{
                            height: '390px',
                            width: '100%',
                            background: 'radial-gradient(circle at 16% 12%, #dbeafe 0%, #f8fafc 62%, #e2e8f0 100%)'
                          }}
                        >
                          {overviewAnalyticsOrderLocations.length === 0 ? (
                            <div className="h-100 d-flex align-items-center justify-content-center text-muted">
                              {t('noDataForPeriod')}
                            </div>
                          ) : isOverviewYandexMapProvider ? (
                            <YandexAnalyticsMap
                              points={overviewAnalyticsOrderLocations}
                              selectedPoint={overviewMapSelectionLocked ? selectedOverviewOrderLocation : null}
                              onSelectPoint={handleSelectOverviewOrderLocation}
                              onLoadError={handleOverviewYandexMapLoadError}
                              height="100%"
                            />
                          ) : (
                            <MapContainer
                              center={ANALYTICS_DEFAULT_MAP_CENTER}
                              zoom={ANALYTICS_DEFAULT_MAP_ZOOM}
                              style={{ height: '100%', width: '100%', filter: 'saturate(0.9) contrast(1.03)' }}
                            >
                              <TileLayer
                                url={overviewMapTileLayerConfig.url}
                                attribution={overviewMapTileLayerConfig.attribution}
                                maxZoom={overviewMapTileLayerConfig.maxZoom}
                              />
                              <SuperAdminAnalyticsMapResizeFix />
                              <SuperAdminAnalyticsMapAutoBounds
                                points={overviewAnalyticsOrderLocations}
                                selectedPoint={overviewMapSelectionLocked ? selectedOverviewOrderLocation : null}
                              />
                              {overviewAnalyticsOrderLocations.map((location) => {
                                const locationKey = getOverviewOrderLocationKey(location);
                                const isSelected = selectedOverviewOrderLocation
                                  && getOverviewOrderLocationKey(selectedOverviewOrderLocation) === locationKey;
                                return (
                                  <Marker
                                    key={`sa-overview-map-${locationKey}`}
                                    position={[location.lat, location.lng]}
                                    icon={getOverviewAnalyticsPointIcon(isSelected)}
                                    eventHandlers={{
                                      click: () => handleSelectOverviewOrderLocation(location)
                                    }}
                                  />
                                );
                              })}
                            </MapContainer>
                          )}
                        </div>
                      </Col>
                      <Col lg={4} xl={3} className="border-start bg-white">
                        <div className="p-3 h-100 admin-custom-scrollbar" style={{ maxHeight: '390px', overflowY: 'auto' }}>
                          <div className="small text-uppercase text-muted fw-semibold mb-2">
                            {language === 'uz' ? 'Mijozlar' : 'Клиенты'}
                          </div>
                          <div className="d-grid gap-2">
                            {overviewAnalyticsOrderLocations.length > 0 ? overviewAnalyticsOrderLocations.map((location) => {
                              const locationKey = getOverviewOrderLocationKey(location);
                              const isSelected = selectedOverviewOrderLocation
                                && getOverviewOrderLocationKey(selectedOverviewOrderLocation) === locationKey;
                              return (
                                <button
                                  key={`sa-overview-map-list-${locationKey}`}
                                  type="button"
                                  className="admin-analytics-map-list-item text-start"
                                  style={{
                                    borderColor: isSelected ? '#93c5fd' : '#e2e8f0',
                                    background: isSelected ? '#eff6ff' : '#ffffff'
                                  }}
                                  onClick={() => handleSelectOverviewOrderLocation(location)}
                                >
                                  <div className="fw-semibold text-truncate">{location.customerName || 'Клиент'}</div>
                                  <div className="small text-muted text-truncate">
                                    {location.restaurantName || 'Магазин'}
                                  </div>
                                  <div className="small text-truncate">№{location.orderNumber || '—'} · {formatAnalyticsMoney(location.totalAmount || 0)} {t('sum')}</div>
                                </button>
                              );
                            }) : (
                              <div className="text-muted small">{t('noDataForPeriod')}</div>
                            )}
                          </div>

                          {selectedOverviewOrderLocation ? (
                            <div className="mt-3 p-2 rounded border bg-white">
                              <div className="small"><strong>{language === 'uz' ? 'Buyurtma' : 'Заказ'}:</strong> №{selectedOverviewOrderLocation.orderNumber || '—'}</div>
                              <div className="small"><strong>{t('amount')}:</strong> {formatAnalyticsMoney(selectedOverviewOrderLocation.totalAmount || 0)} {t('sum')}</div>
                              <div className="small"><strong>{t('date')}:</strong> {selectedOverviewOrderLocation.createdAt ? new Date(selectedOverviewOrderLocation.createdAt).toLocaleString('ru-RU') : '—'}</div>
                              <div className="small"><strong>{language === 'uz' ? 'Manzil' : 'Адрес'}:</strong> {selectedOverviewOrderLocation.deliveryAddress || '—'}</div>
                            </div>
                          ) : null}
                        </div>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4 mb-4">
              <Col lg={4}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#f59e0b', background: '#fffbeb' }}>💬</span>
                      {language === 'uz' ? "Tovar sharhlari" : 'Комментарии к товарам'}
                    </h6>
                  </Card.Header>
                  <Card.Body>
                    <Row className="g-2 mb-3">
                      <Col xs={6}>
                        <div className="rounded-3 border p-2 bg-light">
                          <div className="small text-muted">{language === 'uz' ? "O'rtacha" : 'Средняя'}</div>
                          <div className="fw-bold">{productReviewAverage.toFixed(2)} / {MAX_ORDER_RATING}</div>
                        </div>
                      </Col>
                      <Col xs={6}>
                        <div className="rounded-3 border p-2 bg-light">
                          <div className="small text-muted">{language === 'uz' ? 'Jami baho' : 'Всего оценок'}</div>
                          <div className="fw-bold">{productReviewTotal.toLocaleString('ru-RU')}</div>
                        </div>
                      </Col>
                      <Col xs={6}>
                        <div className="rounded-3 border p-2 bg-light">
                          <div className="small text-muted">{language === 'uz' ? 'Izoh ulushi' : 'Доля комментариев'}</div>
                          <div className="fw-bold">{productReviewCommentRate.toFixed(1)}%</div>
                        </div>
                      </Col>
                      <Col xs={6}>
                        <div className="rounded-3 border p-2 bg-light">
                          <div className="small text-muted">{language === 'uz' ? '1-2★ ulushi' : 'Доля 1-2★'}</div>
                          <div className="fw-bold">{productReviewLowRate.toFixed(1)}%</div>
                        </div>
                      </Col>
                    </Row>

                    <div className={`alert py-2 px-3 mb-3 ${productReviewQualityState.className}`} role="alert">
                      <div className="fw-semibold">{productReviewQualityState.title}</div>
                      <div className="small">{productReviewQualityState.advice}</div>
                    </div>

                    <div className="mb-3">
                      <div className="small text-uppercase text-muted fw-semibold mb-2">
                        {language === 'uz' ? 'Baholar taqsimoti' : 'Распределение оценок'}
                      </div>
                      {productReviewRatingRows.map((row) => (
                        <div key={`sa-rating-row-${row.star}`} className="d-flex align-items-center gap-2 mb-1">
                          <span className="small text-muted" style={{ width: '52px' }}>
                            {`${row.star}★`}
                          </span>
                          <div className="progress flex-grow-1" style={{ height: '8px' }}>
                            <div className={`progress-bar ${row.barClass}`} style={{ width: `${row.percent}%` }} />
                          </div>
                          <span className="small fw-semibold text-end" style={{ width: '34px' }}>
                            {row.count}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-top">
                      <div className="small text-uppercase text-muted fw-semibold mb-2">
                        {language === 'uz' ? 'TOP mahsulotlar (izohlar)' : 'Топ товаров (комментарии)'}
                      </div>
                      {productReviewTopProducts.length > 0 ? (
                        <div className="d-flex flex-column gap-2">
                          {productReviewTopProducts.slice(0, 5).map((item, index) => (
                            <div key={`sa-review-top-product-${item.productId || index}`} className="d-flex justify-content-between gap-2">
                              <span className="text-truncate" title={item.productName || ''}>
                                {item.productName || 'Товар'}
                              </span>
                              <div className="d-flex align-items-center gap-2 text-nowrap">
                                <Badge bg="light" text="dark">{Number(item.commentsCount || 0)}</Badge>
                                <span className="small text-muted">{Number(item.averageRating || 0).toFixed(2)}★</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-muted small">{t('noDataForPeriod')}</div>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={8}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0f766e', background: '#f0fdfa' }}>📝</span>
                      {language === 'uz' ? 'So‘nggi izohlar' : 'Последние комментарии'}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {overviewProductReviewAnalyticsLoading ? (
                      <div className="py-4 text-center text-muted">
                        <Spinner animation="border" size="sm" className="me-2" />
                        {language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
                      </div>
                    ) : productReviewComments.length > 0 ? (
                      <div className="table-responsive">
                        <Table hover className="mb-0 admin-analytics-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>{language === 'uz' ? "Do'kon" : 'Магазин'}</th>
                              <th>{language === 'uz' ? 'Tovar' : 'Товар'}</th>
                              <th>{language === 'uz' ? 'Baho' : 'Оценка'}</th>
                              <th>{language === 'uz' ? 'Holat' : 'Статус'}</th>
                              <th>{language === 'uz' ? 'Izoh' : 'Комментарий'}</th>
                              <th>{language === 'uz' ? 'Mijoz' : 'Клиент'}</th>
                              <th className="text-end">{t('date')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productReviewComments.map((item, idx) => {
                              const rating = Number(item.rating || 0);
                              const badge = getProductReviewBadge(rating);
                              const rowClass = rating <= 2 ? 'table-warning' : '';
                              return (
                                <tr key={`sa-review-comment-${item.id || idx}`} className={rowClass}>
                                  <td>{idx + 1}</td>
                                  <td>{item.restaurantName || '—'}</td>
                                  <td>{item.productName || 'Товар'}</td>
                                  <td>{buildRatingStarsText(rating)}</td>
                                  <td>
                                    <span className={`badge rounded-pill ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td style={{ minWidth: '220px' }} title={String(item.comment || '').trim()}>
                                    {String(item.comment || '').trim() || '—'}
                                  </td>
                                  <td>{item.authorName || 'Клиент'}</td>
                                  <td className="text-end">
                                    {item.createdAt ? new Date(item.createdAt).toLocaleString(productReviewLocale) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4 mb-4">
              <Col lg={8}>
                <Card className="border-0 shadow-sm admin-analytics-surface-card">
                  <Card.Body className="admin-analytics-chart-stack admin-analytics-chart-grid">
                    <div className="admin-analytics-chart-box">
                      <div className="admin-analytics-chart-heading">
                        <span>{language === 'uz' ? 'Moliya' : 'Финансы'}</span>
                        <small>
                          {overviewAnalyticsPeriod === 'daily'
                            ? (language === 'uz' ? 'soatlar bo‘yicha' : 'по часам')
                            : overviewAnalyticsPeriod === 'monthly'
                              ? (language === 'uz' ? 'kunlar bo‘yicha' : 'по дням')
                              : (language === 'uz' ? 'oylar bo‘yicha' : 'по месяцам')}
                        </small>
                      </div>
                      {renderOverviewSvgChart({
                        data: normalizedRevenueTimeline,
                        color: '#6366f1',
                        gradientId: `sa-analytics-revenue-${overviewAnalyticsPeriod}`,
                        mode: 'currency',
                        showAllLabels: true,
                        showPointValues: true
                      })}
                    </div>

                    <div className="admin-analytics-chart-box admin-analytics-chart-box-secondary">
                      <div className="admin-analytics-chart-heading">
                        <span>{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</span>
                        <small>
                          {overviewAnalyticsPeriod === 'daily'
                            ? (language === 'uz' ? 'soatlar bo‘yicha' : 'по часам')
                            : overviewAnalyticsPeriod === 'monthly'
                              ? (language === 'uz' ? 'kunlar bo‘yicha' : 'по дням')
                              : (language === 'uz' ? 'oylar bo‘yicha' : 'по месяцам')}
                        </small>
                      </div>
                      {renderOverviewSvgChart({
                        data: normalizedOrdersTimeline,
                        color: '#f43f5e',
                        gradientId: `sa-analytics-orders-${overviewAnalyticsPeriod}`,
                        mode: 'count',
                        showAllLabels: true,
                        showPointValues: true
                      })}
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={4}>
                <Card className="border-0 shadow-sm admin-analytics-surface-card">
                  <Card.Header className="bg-white border-0 d-flex justify-content-between align-items-center admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#8b5cf6', background: '#f5f3ff' }}>🤖</span>
                      {language === 'uz' ? 'Telegram voronkasi' : 'Воронка Telegram'}
                    </h6>
                    <small className="text-muted admin-analytics-card-subtle">{startDate || '—'}</small>
                  </Card.Header>
                  <Card.Body>
                    <div className="admin-funnel-donut-wrap">
                      <div className="admin-funnel-donut-chart">
                        <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Funnel donut chart">
                          <circle
                            cx="90"
                            cy="90"
                            r={donutRadius}
                            fill="none"
                            stroke="#e2e8f0"
                            strokeWidth={donutStroke}
                          />
                          {donutTotal > 0 ? donutSegments.map((segment) => {
                            const value = Number(segment.value || 0);
                            if (value <= 0) return null;
                            const ratio = value / donutTotal;
                            const strokeLength = ratio * donutCircumference;
                            const strokeDasharray = `${strokeLength} ${donutCircumference}`;
                            const strokeDashoffset = -donutProgress * donutCircumference;
                            donutProgress += ratio;
                            return (
                              <circle
                                key={`funnel-donut-${segment.key}`}
                                cx="90"
                                cy="90"
                                r={donutRadius}
                                fill="none"
                                stroke={segment.color}
                                strokeWidth={donutStroke}
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="butt"
                                transform="rotate(-90 90 90)"
                              />
                            );
                          }) : null}
                          <circle cx="90" cy="90" r="42" fill="#ffffff" />
                          <text x="90" y="84" textAnchor="middle" fontSize="11" fill="#64748b">
                            /start
                          </text>
                          <text x="90" y="104" textAnchor="middle" fontSize="24" fontWeight="700" fill="#0f172a">
                            {startedUsers.toLocaleString('ru-RU')}
                          </text>
                          <text x="90" y="122" textAnchor="middle" fontSize="10" fill="#64748b">
                            {`-> ${Number(funnel.conversionStartToOrder || 0).toFixed(1)}%`}
                          </text>
                        </svg>
                      </div>
                      <div className="admin-funnel-donut-legend">
                        {donutSegments.map((segment) => (
                          <div key={`funnel-legend-${segment.key}`} className="admin-funnel-donut-legend-item">
                            <span className="admin-funnel-donut-dot" style={{ backgroundColor: segment.color }} />
                            <span className="admin-funnel-donut-label">{segment.label}</span>
                            <strong className="admin-funnel-donut-value">{Number(segment.value || 0).toLocaleString('ru-RU')}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-2 pt-3">
                      <span className="badge text-bg-light border">
                        Start -&gt; Регистрация: {Number(funnel.conversionStartToRegistration || 0).toFixed(1)}%
                      </span>
                      <span className="badge text-bg-light border">
                        Регистрация -&gt; Заказ: {Number(funnel.conversionRegistrationToOrder || 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="d-flex flex-wrap gap-2 pt-2">
                      <span className="badge text-bg-light border">
                        {language === 'uz' ? "Bazadagi ro'yxatdan o'tganlar" : 'Регистрации из БД'}: {Number(funnel.registeredUsersFromDb || 0).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    <div className="small text-muted d-flex flex-wrap gap-3 pt-3">
                      <span>{language === 'uz' ? 'Tilgacha yo‘qotish' : 'Потеря до языка'}: <strong className="text-dark">{Number(funnel.noLanguageAfterStart || 0)}</strong></span>
                      <span>{language === 'uz' ? "Telefon bermagan" : 'Не дали телефон'}: <strong className="text-dark">{Number(funnel.noPhoneAfterLanguage || 0)}</strong></span>
                      <span>{language === 'uz' ? "Ro'yxatdan o'tgan, ammo buyurtmasiz" : 'Зарегистрировались, но без заказа'}: <strong className="text-dark">{Number(funnel.noOrderAfterRegistration || 0)}</strong></span>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4 mb-4">
              <Col lg={4}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#dc2626', background: '#fef2f2' }}>⚠</span>
                      {language === 'uz' ? 'Balans < 20 000' : 'Баланс < 20 000'}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {lowBalanceShops.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? "Do'kon" : 'Магазин'}</th>
                            <th className="text-end">{language === 'uz' ? 'Balans' : 'Баланс'}</th>
                            <th className="text-end">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lowBalanceShops.map((item, idx) => (
                            <tr key={`sa-low-balance-shop-${item.id || idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.balance || 0)} {getCurrencyLabelByCode(item.currency_code || countryCurrency?.code)}</td>
                              <td className="text-end">
                                <Button
                                  variant="light"
                                  className="action-btn text-success"
                                  onClick={() => openTopupModal(item)}
                                  title={language === 'uz' ? 'Balansni to‘ldirish' : 'Пополнить баланс'}
                                >
                                  💰
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">
                        {language === 'uz'
                          ? "Belgilangan chegaradan past balansli do'kon yo'q"
                          : 'Нет магазинов с балансом ниже установленного порога'}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={4}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0f766e', background: '#f0fdfa' }}>🏆</span>
                      {language === 'uz' ? `TOP ${effectiveTopLimit} (buyurtmalar)` : `ТОП ${effectiveTopLimit} (заказы)`}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {topShopsByOrders.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? "Do'kon" : 'Магазин'}</th>
                            <th className="text-end">{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</th>
                            <th className="text-end">{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topShopsByOrders.map((item, idx) => (
                            <tr key={`sa-top-shop-orders-${item.id || idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{Number(item.ordersCount || 0).toLocaleString('ru-RU')}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.revenue || 0)} {t('sum')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={4}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#1d4ed8', background: '#eff6ff' }}>💸</span>
                      {language === 'uz' ? `TOP ${effectiveTopLimit} (summa)` : `ТОП ${effectiveTopLimit} (сумма)`}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {topShopsByRevenue.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? "Do'kon" : 'Магазин'}</th>
                            <th className="text-end">{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                            <th className="text-end">{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topShopsByRevenue.map((item, idx) => (
                            <tr key={`sa-top-shop-revenue-${item.id || idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.revenue || 0)} {t('sum')}</td>
                              <td className="text-end">{Number(item.ordersCount || 0).toLocaleString('ru-RU')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4">
              <Col lg={6}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>📊</span>
                      {language === 'uz' ? 'Kategoriyalar (soni)' : 'Категории (количество)'}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {categoriesByQuantity.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? 'Kategoriya' : 'Категория'}</th>
                            <th className="text-end">{t('quantity')}</th>
                            <th className="text-end">{t('revenue')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoriesByQuantity.map((item, idx) => (
                            <tr key={`sa-cat-qty-${item.categoryId || 'na'}-${idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{Number(item.quantity || 0).toLocaleString('ru-RU')}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.revenue || 0)} {t('sum')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>💹</span>
                      {language === 'uz' ? 'Kategoriyalar (summa)' : 'Категории (сумма)'}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {categoriesByRevenue.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? 'Kategoriya' : 'Категория'}</th>
                            <th className="text-end">{t('revenue')}</th>
                            <th className="text-end">{t('quantity')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoriesByRevenue.map((item, idx) => (
                            <tr key={`sa-cat-sum-${item.categoryId || 'na'}-${idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.revenue || 0)} {t('sum')}</td>
                              <td className="text-end">{Number(item.quantity || 0).toLocaleString('ru-RU')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4 mt-1">
              <Col lg={6}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>🧩</span>
                      {language === 'uz' ? 'Faoliyat turlari (soni)' : 'Виды деятельности (количество)'}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {activityTypesByQuantity.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? 'Faoliyat turi' : 'Вид деятельности'}</th>
                            <th className="text-end">{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</th>
                            <th className="text-end">{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activityTypesByQuantity.map((item, idx) => (
                            <tr key={`sa-activity-qty-${item.activityTypeId || 'na'}-${idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{Number(item.ordersCount || 0).toLocaleString('ru-RU')}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.revenue || 0)} {t('sum')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>💼</span>
                      {language === 'uz' ? 'Faoliyat turlari (summa)' : 'Виды деятельности (сумма)'}
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {activityTypesByRevenue.length > 0 ? (
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? 'Faoliyat turi' : 'Вид деятельности'}</th>
                            <th className="text-end">{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                            <th className="text-end">{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activityTypesByRevenue.map((item, idx) => (
                            <tr key={`sa-activity-sum-${item.activityTypeId || 'na'}-${idx}`}>
                              <td>{idx + 1}</td>
                              <td>{item.name || '—'}</td>
                              <td className="text-end">{formatAnalyticsMoney(item.revenue || 0)} {t('sum')}</td>
                              <td className="text-end">{Number(item.ordersCount || 0).toLocaleString('ru-RU')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted py-4">{t('noDataForPeriod')}</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4 mt-1">
              <Col lg={4}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card">
                  <Card.Header className="bg-white border-0 d-flex flex-wrap justify-content-between align-items-center gap-2 admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0369a1', background: '#f0f9ff' }}>💳</span>
                      {language === 'uz' ? "To'lov turlari ulushi (%)" : 'Доли типов платежей (%)'}
                    </h6>
                    <small className="text-muted">
                      {superAdminPaymentLeader && superAdminPaymentLeader.count > 0
                        ? `${language === 'uz' ? 'Lider' : 'Лидер'}: ${superAdminPaymentLeader.label} (${formatAnalyticsPercent(superAdminPaymentLeader.percent)})`
                        : (language === 'uz' ? "Ma'lumot yo'q" : 'Нет данных')}
                    </small>
                  </Card.Header>
                  <Card.Body className="d-flex align-items-center justify-content-center">
                    <div className="admin-payment-donut-stack">
                      <div className="admin-funnel-donut-chart">
                        <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Payment methods donut chart">
                          <circle
                            cx="90"
                            cy="90"
                            r={superAdminPaymentDonutRadius}
                            fill="none"
                            stroke="#e2e8f0"
                            strokeWidth={superAdminPaymentDonutStroke}
                          />
                          {superAdminPaymentTotalCount > 0 ? superAdminPaymentRows.map((row) => {
                            const value = Number(row.count || 0);
                            if (value <= 0) return null;
                            const ratio = value / superAdminPaymentTotalCount;
                            const strokeLength = ratio * superAdminPaymentDonutCircumference;
                            const strokeDasharray = `${strokeLength} ${superAdminPaymentDonutCircumference}`;
                            const strokeDashoffset = -superAdminPaymentDonutProgress * superAdminPaymentDonutCircumference;
                            superAdminPaymentDonutProgress += ratio;
                            return (
                              <circle
                                key={`sa-payment-donut-${row.key}`}
                                cx="90"
                                cy="90"
                                r={superAdminPaymentDonutRadius}
                                fill="none"
                                stroke={row.color}
                                strokeWidth={superAdminPaymentDonutStroke}
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="butt"
                                transform="rotate(-90 90 90)"
                              />
                            );
                          }) : null}
                          <circle cx="90" cy="90" r="42" fill="#ffffff" />
                          <text x="90" y="84" textAnchor="middle" fontSize="11" fill="#64748b">
                            {language === 'uz' ? 'Lider' : 'Лидер'}
                          </text>
                          <text x="90" y="104" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">
                            {superAdminPaymentLeader && superAdminPaymentLeader.count > 0
                              ? formatAnalyticsPercent(superAdminPaymentLeader.percent)
                              : '0.00%'}
                          </text>
                          <text x="90" y="122" textAnchor="middle" fontSize="10" fill="#64748b">
                            {superAdminPaymentLeader && superAdminPaymentLeader.count > 0
                              ? superAdminPaymentLeader.label
                              : (language === 'uz' ? "Ma'lumot yo'q" : 'Нет данных')}
                          </text>
                        </svg>
                      </div>
                      <div className="admin-funnel-donut-legend">
                        {superAdminPaymentRows.map((row) => (
                          <div key={`sa-payment-legend-${row.key}`} className="admin-funnel-donut-legend-item">
                            <span className="admin-funnel-donut-dot" style={{ backgroundColor: row.color }} />
                            <span className="admin-funnel-donut-label d-flex align-items-center gap-2">
                              {renderAnalyticsPaymentMethodIcon(row.key, row.label)}
                              {shouldRenderAnalyticsPaymentMethodText(row.key) ? <span>{row.label}</span> : null}
                            </span>
                            <strong className="admin-funnel-donut-value">{formatAnalyticsPercent(row.percent)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="small text-muted pt-3">
                      {language === 'uz'
                        ? `Jami to'lovlar soni: ${superAdminPaymentTotalCount.toLocaleString('ru-RU')}`
                        : `Всего оплат: ${superAdminPaymentTotalCount.toLocaleString('ru-RU')}`}
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={8}>
                <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                  <Card.Header className="bg-white border-0 d-flex justify-content-between align-items-center admin-analytics-card-header">
                    <h6 className="mb-0 admin-analytics-card-title">
                      <span className="admin-analytics-card-title-icon" style={{ color: '#0369a1', background: '#f0f9ff' }}>🧾</span>
                      {language === 'uz' ? "To'lov tizimlari" : 'Платежные системы'}
                    </h6>
                    <small className="text-muted">
                      {language === 'uz' ? "Qator: soni / foiz / summa" : 'Строка: количество / процент / сумма'}
                    </small>
                  </Card.Header>
                  <Card.Body className="p-0">
                    <div className="table-responsive">
                      <Table hover className="mb-0 admin-analytics-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{language === 'uz' ? "To'lov turi" : 'Тип оплаты'}</th>
                            <th className="text-end">{language === 'uz' ? 'Soni' : 'Количество'}</th>
                            <th className="text-end">%</th>
                            <th className="text-end">{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {superAdminPaymentRows.map((row, idx) => (
                            <tr key={`sa-payment-row-${row.key}`}>
                              <td>{idx + 1}</td>
                              <td>
                                <div className="d-flex align-items-center gap-2">
                                  {renderAnalyticsPaymentMethodIcon(row.key, row.label)}
                                  {shouldRenderAnalyticsPaymentMethodText(row.key) ? <span>{row.label}</span> : null}
                                </div>
                              </td>
                              <td className="text-end">{Number(row.count || 0).toLocaleString('ru-RU')}</td>
                              <td className="text-end">{formatAnalyticsPercent(row.percent)}</td>
                              <td className="text-end">{formatAnalyticsMoney(row.amount || 0)} {t('sum')}</td>
                            </tr>
                          ))}
                          <tr className="table-light fw-semibold">
                            <td colSpan={2}>{language === 'uz' ? 'Jami' : 'Итого'}</td>
                            <td className="text-end">{superAdminPaymentTotalCount.toLocaleString('ru-RU')}</td>
                            <td className="text-end">{formatAnalyticsPercent(superAdminPaymentTotalCount > 0 ? 100 : 0)}</td>
                            <td className="text-end">{formatAnalyticsMoney(superAdminPaymentTotalAmount)} {t('sum')}</td>
                          </tr>
                        </tbody>
                      </Table>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </div>
    );
  };

  const actionTypeLabels = {
    create_product: 'Создание товара',
    update_product: 'Изменение товара',
    delete_product: 'Удаление товара',
    create_category: 'Создание категории',
    update_category: 'Изменение категории',
    delete_category: 'Удаление категории',
    process_order: 'Обработка заказа',
    update_order_status: 'Изменение статуса заказа',
    cancel_order: 'Отмена заказа',
    create_user: 'Создание пользователя',
    update_user: 'Изменение пользователя',
    delete_user: 'Удаление пользователя',
    block_user: 'Блокировка пользователя',
    unblock_user: 'Разблокировка пользователя',
    create_restaurant: 'Создание магазина',
    update_restaurant: 'Изменение магазина',
    delete_restaurant: 'Удаление магазина',
    login: 'Вход в систему',
    logout: 'Выход из системы',
    operator_view: 'Навигация оператора'
  };
  const logActionFilterOptions = Object.entries(actionTypeLabels).map(([value, label]) => ({ value, label }));
  const getActionTypeLabel = (type) => actionTypeLabels[type] || type;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const hasMobileFilterSheet = ['restaurants', 'operators', 'customers', 'ads', 'logs', 'billing_transactions', 'security'].includes(activeTab);
  const headerLanguageOptions = useMemo(() => ([
    {
      code: 'ru',
      shortLabel: 'RU',
      label: 'Русский',
      flag: 'https://flagcdn.com/w20/ru.png'
    },
    {
      code: 'uz',
      shortLabel: 'UZ',
      label: "O'zbek",
      flag: 'https://flagcdn.com/w20/uz.png'
    }
  ]), []);
  const activeHeaderLanguageOption = useMemo(() => (
    headerLanguageOptions.find((option) => option.code === language) || headerLanguageOptions[0]
  ), [headerLanguageOptions, language]);
  const handleHeaderLanguageSelect = (nextLanguage) => {
    if (!nextLanguage || nextLanguage === language) return;
    setLanguage(nextLanguage);
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SUPERADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
    } catch (_) {
      // ignore localStorage failures
    }
  }, [isSidebarCollapsed]);
  const handleSidebarTabSelect = (key) => {
    if (!key) return;
    const isDesktopSidebar = typeof window !== 'undefined' && window.innerWidth >= 992;
    if (isDesktopSidebar && key === activeTab) {
      setIsSidebarCollapsed((prev) => !prev);
      return;
    }
    if (key === 'founders' && (!foundersAccessGranted || !foundersAccessPassword)) {
      setActiveTab(key);
      setFoundersAccessError('');
      setShowFoundersAccessModal(true);
      setIsMobileSidebarOpen(false);
      return;
    }
    setActiveTab(key);
    setIsMobileSidebarOpen(false);
  };

  const resetActiveTabFilters = () => {
    if (activeTab === 'restaurants') {
      setRestaurantsNameFilter('');
      setRestaurantsStatusFilter('');
      setRestaurantsSelectFilter('');
      setRestaurantsSelectSearch('');
      setRestaurantsActivityTypeFilter('');
      setRestaurantsCreatedFromFilter('');
      setRestaurantsCreatedToFilter('');
      setRestaurantsTariffFilter('');
      setRestaurantsProblemsFilter('');
      setRestaurantsProductsFilter('');
      setRestaurantsPage(1);
      return;
    }
    if (activeTab === 'operators') {
      setOperatorRoleFilter('');
      setOperatorStatusFilter('');
      setOperatorRestaurantFilter('');
      setOperatorRestaurantSearch('');
      setOperatorSearch('');
      setOperatorsPage(1);
      return;
    }
    if (activeTab === 'customers') {
      setCustomerRestaurantFilter('');
      setCustomerRestaurantSearch('');
      setCustomerStatusFilter('');
      setCustomerSearch('');
      setCustomerPage(1);
      return;
    }
    if (activeTab === 'ads') {
      setAdBannerStatusFilter('all');
      setAdBannerActivityTypeFilter('all');
      setAdBannersPage(1);
      return;
    }
    if (activeTab === 'logs') {
      setLogsFilter({ action_type: '', entity_type: '', restaurant_id: '', user_id: '', user_role: '', start_date: '', end_date: '', page: 1, limit: 15 });
      return;
    }
    if (activeTab === 'billing_transactions') {
      setBillingOpsFilter({
        restaurant_id: '',
        type: '',
        search: '',
        start_date: '',
        end_date: '',
        page: 1,
        limit: 20
      });
      setBillingOpsRestaurantSearch('');
      return;
    }
    if (activeTab === 'founders') {
      setFoundersAnalyticsFilter({
        start_date: '',
        end_date: ''
      });
      setOrganizationExpensesFilter((prev) => ({
        category_id: '',
        currency_code: '',
        search: '',
        page: 1,
        limit: prev.limit || 200
      }));
      setFoundersInnerTab('analytics');
      return;
    }
    if (activeTab === 'security') {
      setSecurityFilter({
        event_type: '',
        risk_level: '',
        status: 'open',
        source_ip: '',
        search: '',
        start_date: '',
        end_date: '',
        page: 1,
        limit: 20
      });
    }
  };

  const adI18n = language === 'uz'
    ? {
        tab: 'Reklama',
        title: 'Reklama bannerlari',
        activeNow: 'Hozir faol',
        maxSlots: 'Maks. slotlar',
        totalRecords: 'Jami yozuvlar',
        filters: 'Filtrlar',
        addAd: "Reklama qo'shish",
        allStatuses: 'Hammasi (faol + tarix)',
        activityTypeFilter: 'Faoliyat turi',
        activityTypeAll: 'Barcha faoliyat turlari',
        activityTypeNoTarget: 'Targhetsiz (hammaga)',
        active: 'Hozir faol',
        scheduled: 'Rejalashtirilgan',
        pausedByDays: 'Hafta kunlari bo‘yicha yashirin',
        disabled: "O'chirilgan",
        finished: 'Yakunlangan',
        alertText: 'Reklama ikkita formatda ishlaydi: banner (katalog tepasi) va kirish popup (ilovaga kirganda modal). Havolalar va boshqaruv tugmalari faqat superadmin tomonidan boshqariladi.',
        colSlot: 'Slot',
        colBanner: 'Banner',
        colLink: 'Havola',
        colSchedule: 'Jadval',
        colAnimation: 'Animatsiya',
        colStatus: 'Holat',
        colStats: 'Statistika',
        colActions: 'Amallar',
        noLink: 'Havola yo‘q',
        start: 'Boshlanish',
        end: 'Tugash',
        days: 'Kunlar',
        everyDay: 'har kuni',
        sec: 'sek.',
        views: "Ko'rishlar",
        unique: 'Unikal',
        clicks: 'Bosishlar',
        noSlots: 'Hozircha reklama slotlari yo‘q',
        editTitle: 'Reklamani tahrirlash',
        addTitle: "Reklama qo'shish",
        internalName: 'Nom (ichki)',
        internalNamePlaceholder: 'Masalan: Yetkazib berish aksiyasi',
        displayType: "Ko'rsatish turi",
        typeBanner: 'Banner (katalog tepasi)',
        typePopup: 'Popup (kirishda)',
        slotPosition: 'Slot pozitsiyasi (1-10)',
        imageLabel: 'Reklama rasmi (JPG / PNG / WEBP / GIF)',
        imageRecommendedBanner: 'Tavsiya etilgan o‘lcham: 1200x500 px (keng banner, nisbat ~2.4:1)',
        imageRecommendedPopup: 'Tavsiya etilgan o‘lcham: 1080x1350 px (vertikal popup, nisbat ~4:5)',
        imagePlaceholder: 'https://example.com/banner.jpg yoki /uploads/...',
        uploading: 'Yuklanmoqda...',
        targetUrl: "O'tish havolasi (ixtiyoriy)",
        targetUrlPlaceholder: 'https://... (bo‘sh bo‘lsa, banner bosilmaydi)',
        transition: "O'tish",
        noAnimation: 'Animatsiyasiz',
        displaySec: "Ko'rsatish (sek)",
        enabled: 'Reklama yoqilgan',
        startDisplay: "Ko'rsatish boshlanishi",
        endDisplay: "Ko'rsatish tugashi",
        daysDisplay: 'Ko‘rsatish kunlari (tanlanmasa — har kuni)',
        cancel: 'Bekor qilish',
        saveChanges: "O'zgarishlarni saqlash",
        createSlot: 'Slot yaratish',
        analytics: 'Analitika',
        analyticsTitle: 'Banner analitikasi',
        analyticsRange: 'Davr',
        analyticsViews: "Ko'rishlar",
        analyticsClicks: 'Bosishlar',
        analyticsUnique: 'Unikal ko‘rishlar',
        analyticsCtr: 'CTR',
        analyticsLastView: "Oxirgi ko'rish",
        analyticsLastClick: 'Oxirgi bosish',
        analyticsByDay: 'Kunlar bo‘yicha',
        analyticsBrowsers: 'Brauzerlar',
        analyticsDevices: 'Qurilmalar',
        analyticsGeo: 'Shaharlar / hududlar',
        analyticsCountries: 'Mamlakatlar',
        analyticsNoData: "Analitika ma'lumoti hali yo'q",
        previewStore: 'Preview uchun do‘kon',
        previewStorePlaceholder: 'Do‘kon tanlang'
      }
    : {
        tab: 'Реклама',
        title: 'Рекламные баннеры',
        activeNow: 'Активно сейчас',
        maxSlots: 'Макс. слотов',
        totalRecords: 'Всего записей',
        filters: 'Фильтры',
        addAd: 'Добавить рекламу',
        allStatuses: 'Все (активные + история)',
        activityTypeFilter: 'Вид деятельности',
        activityTypeAll: 'Все виды деятельности',
        activityTypeNoTarget: 'Без таргетинга (всем)',
        active: 'Активные сейчас',
        scheduled: 'Запланированные',
        pausedByDays: 'Скрытые по дням недели',
        disabled: 'Выключенные',
        finished: 'Завершенные',
        alertText: 'Реклама работает в двух форматах: баннер (вверху каталога) и popup при входе (модальное окно при открытии приложения). Ссылки и управление доступны только из суперадминки.',
        colSlot: 'Слот',
        colBanner: 'Баннер',
        colLink: 'Кнопка / Ссылка',
        colSchedule: 'Расписание',
        colAnimation: 'Анимация',
        colStatus: 'Статус',
        colStats: 'Статистика',
        colActions: 'Действия',
        noLink: 'Без ссылки',
        start: 'Старт',
        end: 'Конец',
        days: 'Дни',
        everyDay: 'каждый день',
        sec: 'сек.',
        views: 'Просмотры',
        unique: 'Уникальные',
        clicks: 'Клики',
        noSlots: 'Рекламных слотов пока нет',
        editTitle: 'Редактировать рекламу',
        addTitle: 'Добавить рекламу',
        internalName: 'Название (внутреннее)',
        internalNamePlaceholder: 'Например: Акция на доставку',
        displayType: 'Тип показа',
        typeBanner: 'Баннер (вверху каталога)',
        typePopup: 'Popup при входе',
        slotPosition: 'Позиция слота (1-10)',
        imageLabel: 'Изображение рекламы (JPG / PNG / WEBP / GIF)',
        imageRecommendedBanner: 'Рекомендуемый размер: 1200x500 px (широкий баннер, соотношение ~2.4:1)',
        imageRecommendedPopup: 'Рекомендуемый размер: 1080x1350 px (вертикальный popup, соотношение ~4:5)',
        imagePlaceholder: 'https://example.com/banner.jpg или /uploads/...',
        uploading: 'Загрузка...',
        targetUrl: 'Ссылка перехода (необязательно)',
        targetUrlPlaceholder: 'https://... (если пусто, баннер не кликабельный)',
        transition: 'Переход',
        noAnimation: 'Без анимации',
        displaySec: 'Показ (сек)',
        enabled: 'Реклама включена',
        startDisplay: 'Начало показа',
        endDisplay: 'Окончание показа',
        daysDisplay: 'Дни показа (если не выбрано — каждый день)',
        cancel: 'Отмена',
        saveChanges: 'Сохранить изменения',
        createSlot: 'Создать слот',
        analytics: 'Аналитика',
        analyticsTitle: 'Аналитика баннера',
        analyticsRange: 'Период',
        analyticsViews: 'Просмотры',
        analyticsClicks: 'Клики',
        analyticsUnique: 'Уникальные просмотры',
        analyticsCtr: 'CTR',
        analyticsLastView: 'Последний просмотр',
        analyticsLastClick: 'Последний клик',
        analyticsByDay: 'По дням',
        analyticsBrowsers: 'Браузеры',
        analyticsDevices: 'Устройства',
        analyticsGeo: 'Города / регионы',
        analyticsCountries: 'Страны',
        analyticsNoData: 'Данных аналитики пока нет',
        previewStore: 'Магазин для превью',
        previewStorePlaceholder: 'Выберите магазин'
      };

  const superAdminSidebarTabsMeta = useMemo(() => ({
    analytics: { label: language === 'uz' ? 'Analitika' : 'Аналитика', icon: BarChart3 },
    restaurants: { label: t('restaurants'), icon: Store },
    global_products: { label: language === 'uz' ? 'Global mahsulotlar' : 'Глобальные товары', icon: Globe },
    activity_types: { label: language === 'uz' ? 'Faoliyat turlari' : 'Виды деятельности', icon: Puzzle },
    reservation_templates: { label: language === 'uz' ? 'Bron shablonlari' : 'Шаблоны брони', icon: Package },
    help_instructions: { label: language === 'uz' ? "Yo'riqnomalar" : 'Инструкции', icon: BookOpen },
    broadcast: { label: language === 'uz' ? 'Xabar tarqatish' : 'Рассылка', icon: Megaphone },
    operators: { label: t('operators'), icon: UserCog },
    customers: { label: t('clients'), icon: Users },
    categories: { label: t('categories'), icon: FolderTree },
    ads: { label: adI18n.tab, icon: Megaphone },
    billing_transactions: { label: language === 'uz' ? "To'lovlar" : 'Поступления', icon: Receipt },
    founders: { label: language === 'uz' ? 'Ta’sischilar' : 'Учредители', icon: PieChart },
    billing: { label: t('billingSettings'), icon: Wallet },
    ai_settings: { label: language === 'uz' ? 'AI sozlamalar' : 'AI настройки', icon: Bot },
    security: { label: language === 'uz' ? 'Xavfsizlik' : 'Безопасность', icon: Shield },
    logs: { label: t('logs'), icon: FileText }
  }), [adI18n.tab, language, t]);
  const renderSuperAdminSidebarTabTitle = (key) => {
    const meta = superAdminSidebarTabsMeta[key] || { label: key, icon: FileText };
    const Icon = meta.icon;
    return (
      <span className="admin-side-tab-title">
        <Icon size={16} className="admin-side-tab-icon" />
        <span className="admin-side-tab-label">{meta.label}</span>
      </span>
    );
  };
  const renderSuperAdminSidebarNavItems = () => (
    Object.keys(superAdminSidebarTabsMeta).map((key) => (
      <Nav.Item key={`superadmin-sidebar-${key}`}>
        <Nav.Link eventKey={key}>
          {renderSuperAdminSidebarTabTitle(key)}
        </Nav.Link>
      </Nav.Item>
    ))
  );
  const renderSuperAdminMobileMenuExtras = () => (
    <div className="admin-sidebar-mobile-extra-section">
      <div className="admin-sidebar-mobile-divider" />
      <div className="admin-sidebar-mobile-extra-list">
        <div className="admin-sidebar-mobile-action admin-sidebar-mobile-action-card">
          <div className="admin-sidebar-mobile-action-head">
            <span className="admin-sidebar-mobile-action-icon" aria-hidden="true">
              <img src={activeHeaderLanguageOption?.flag} width="16" height="12" alt={activeHeaderLanguageOption?.shortLabel || 'LANG'} className="rounded-1" />
            </span>
            <span className="admin-sidebar-mobile-action-copy">
              <span className="admin-sidebar-mobile-action-title">
                {language === 'uz' ? 'Tizim tili' : 'Язык системы'}
              </span>
              <span className="admin-sidebar-mobile-action-subtitle">
                {activeHeaderLanguageOption?.label || 'Русский'}
              </span>
            </span>
          </div>
          <div className="admin-sidebar-mobile-language-switcher">
            {headerLanguageOptions.map((option) => (
              <button
                key={`superadmin-mobile-language-${option.code}`}
                type="button"
                className={`admin-sidebar-mobile-language-chip${language === option.code ? ' is-active' : ''}`}
                onClick={() => handleHeaderLanguageSelect(option.code)}
              >
                <img src={option.flag} width="16" height="12" alt={option.shortLabel} className="rounded-1" />
                <span>{option.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="admin-sidebar-mobile-action"
          onClick={() => {
            setIsMobileSidebarOpen(false);
            setShowMobileAccountSheet(true);
          }}
        >
          <span className="admin-sidebar-mobile-action-icon" aria-hidden="true">
            <span className="admin-sidebar-mobile-avatar-mini">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </span>
          </span>
          <span className="admin-sidebar-mobile-action-copy">
            <span className="admin-sidebar-mobile-action-title">
              {language === 'uz' ? 'Akkount' : 'Аккаунт'}
            </span>
            <span className="admin-sidebar-mobile-action-subtitle">
              {user?.full_name || user?.username || 'Super Administrator'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
  const renderSuperAdminSidebarUtilityActions = () => (
    <div className="admin-sidebar-footer-actions d-none d-lg-flex">
      <Dropdown align="end" className="admin-sidebar-footer-dropdown admin-header-lang-dropdown">
        <Dropdown.Toggle
          variant="link"
          bsPrefix="p-0"
          className="admin-sidebar-footer-control"
          title={activeHeaderLanguageOption?.label || activeHeaderLanguageOption?.shortLabel || 'RU'}
        >
          <span className="admin-sidebar-footer-iconbox" aria-hidden="true">
            <img src={activeHeaderLanguageOption?.flag} width="16" height="12" alt={activeHeaderLanguageOption?.shortLabel || 'LANG'} className="rounded-1" />
          </span>
          <span className="admin-sidebar-footer-copy">
            <span className="admin-sidebar-footer-title">
              {language === 'uz' ? 'Tizim tili' : 'Язык системы'}
            </span>
            <span className="admin-sidebar-footer-subtitle">
              {activeHeaderLanguageOption?.label || 'Русский'}
            </span>
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-lang-dropdown-menu admin-sidebar-footer-menu">
          {headerLanguageOptions.map((option) => (
            <Dropdown.Item
              key={`superadmin-sidebar-language-${option.code}`}
              onClick={() => handleHeaderLanguageSelect(option.code)}
              className={`d-flex align-items-center justify-content-between gap-3 py-2 rounded-3 admin-lang-dropdown-item${language === option.code ? ' is-active' : ''}`}
            >
              <span className="d-inline-flex align-items-center gap-2">
                <img src={option.flag} width="18" height="13" alt={option.shortLabel} className="rounded-1" />
                <span>{option.label}</span>
              </span>
              {language === option.code && <i className="bi bi-check2 text-primary" aria-hidden="true"></i>}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>

      <Dropdown align="end" className="admin-sidebar-footer-dropdown">
        <Dropdown.Toggle
          variant="link"
          bsPrefix="p-0"
          className="admin-sidebar-footer-control"
          title={user?.full_name || user?.username || 'Super Administrator'}
        >
          <span className="admin-sidebar-footer-iconbox admin-sidebar-footer-iconbox-avatar" aria-hidden="true">
            <span className="admin-sidebar-footer-avatar">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </span>
          </span>
          <span className="admin-sidebar-footer-copy">
            <span className="admin-sidebar-footer-title">
              {language === 'uz' ? 'Akkount' : 'Аккаунт'}
            </span>
            <span className="admin-sidebar-footer-subtitle">
              {user?.full_name || user?.username || 'Super Administrator'}
            </span>
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-dropdown-menu-wide admin-sidebar-footer-menu">
          <div className="px-3 py-3 border-bottom mb-2 bg-light rounded-top-4">
            <div className="fw-bold text-dark">{user?.full_name || user?.username || 'Super Administrator'}</div>
            <div className="text-muted small">Administrator</div>
          </div>

          <Dropdown.Item onClick={() => navigate('/admin')} className="d-flex align-items-center gap-2 py-2 rounded-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3 4 7l4 4" />
              <path d="M4 7h16" />
              <path d="m16 21 4-4-4-4" />
              <path d="M20 17H4" />
            </svg>
            <span>{language === 'uz' ? 'Kabinetni almashtirish' : 'Сменить кабинет'}</span>
          </Dropdown.Item>

          <Dropdown.Divider className="mx-2" />
          <Dropdown.Item onClick={handleLogout} className="text-danger d-flex align-items-center gap-2 py-2 rounded-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 12h11" />
              <path d="m17 16 4-4-4-4" />
              <path d="M21 6.344V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.344" />
            </svg>
            <span>{t('logout')}</span>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );

  const mobileSheetI18n = language === 'uz'
    ? { title: 'Filtrlar', reset: 'Tozalash', apply: "Qo'llash" }
    : { title: 'Фильтры', reset: 'Сбросить', apply: 'Применить' };

  const renderMobileFiltersSheetContent = () => {
    if (activeTab === 'restaurants') {
      return (
        <div className="d-flex flex-column gap-3">
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder="Поиск по названию..."
            value={restaurantsNameFilter}
            onChange={(e) => { setRestaurantsNameFilter(e.target.value); setRestaurantsPage(1); }}
          />
          <SearchableRestaurantFilter
            t={t}
            width="100%"
            value={restaurantsSelectFilter}
            restaurants={restaurantsFilterOptions}
            searchValue={restaurantsSelectSearch}
            onSearchChange={setRestaurantsSelectSearch}
            onChange={(nextValue) => {
              setRestaurantsSelectFilter(nextValue);
              setRestaurantsSelectSearch('');
              setRestaurantsPage(1);
            }}
          />
          <Form.Select
            className="form-control-custom"
            value={restaurantsStatusFilter}
            onChange={(e) => { setRestaurantsStatusFilter(e.target.value); setRestaurantsPage(1); }}
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={restaurantsActivityTypeFilter}
            onChange={(e) => { setRestaurantsActivityTypeFilter(e.target.value); setRestaurantsPage(1); }}
          >
            <option value="">{language === 'uz' ? 'Barcha faoliyat turlari' : 'Все виды деятельности'}</option>
            <option value="none">{language === 'uz' ? 'Faoliyat turi tanlanmagan' : 'Без вида деятельности'}</option>
            {restaurantsActivityTypeFilterOptions.map((item) => (
              <option key={`restaurants-mobile-activity-type-${item.id}`} value={String(item.id)}>
                {item.name}
              </option>
            ))}
          </Form.Select>
          <div className="d-flex gap-2">
            <Form.Control
              className="form-control-custom"
              type="date"
              value={restaurantsCreatedFromFilter}
              onChange={(e) => { setRestaurantsCreatedFromFilter(e.target.value); setRestaurantsPage(1); }}
            />
            <Form.Control
              className="form-control-custom"
              type="date"
              value={restaurantsCreatedToFilter}
              onChange={(e) => { setRestaurantsCreatedToFilter(e.target.value); setRestaurantsPage(1); }}
            />
          </div>
          <Form.Select
            className="form-control-custom"
            value={restaurantsTariffFilter}
            onChange={(e) => { setRestaurantsTariffFilter(e.target.value); setRestaurantsPage(1); }}
          >
            <option value="">{language === 'uz' ? 'Barcha tariflar' : 'Все тарифы'}</option>
            <option value="paid">{language === 'uz' ? "Pullik" : 'Платный'}</option>
            <option value="free">{language === 'uz' ? 'Bepul' : 'Бесплатный'}</option>
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={restaurantsProblemsFilter}
            onChange={(e) => { setRestaurantsProblemsFilter(e.target.value); setRestaurantsPage(1); }}
          >
            <option value="">{language === 'uz' ? 'Muammolar: hammasi' : 'Проблемы: все'}</option>
            <option value="with_problems">{language === 'uz' ? 'Muammosi bor' : 'Есть проблемы'}</option>
            <option value="without_problems">{language === 'uz' ? "Muammosiz" : 'Без проблем'}</option>
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={restaurantsProductsFilter}
            onChange={(e) => { setRestaurantsProductsFilter(e.target.value); setRestaurantsPage(1); }}
          >
            <option value="">{language === 'uz' ? 'Mahsulotlar: hammasi' : 'Товары: все'}</option>
            <option value="with_products">{language === 'uz' ? 'Mahsulot bor' : 'Есть товары'}</option>
            <option value="without_products">{language === 'uz' ? "Mahsulotsiz" : 'Нет товаров'}</option>
          </Form.Select>
        </div>
      );
    }

    if (activeTab === 'operators') {
      return (
        <div className="d-flex flex-column gap-3">
          <Form.Select
            className="form-control-custom"
            value={operatorRoleFilter}
            onChange={(e) => { setOperatorRoleFilter(e.target.value); setOperatorsPage(1); }}
          >
            <option value="">{t('saAllRoles')}</option>
            <option value="operator">{t('saRoleOperator')}</option>
            <option value="superadmin">{t('saRoleSuperadmin')}</option>
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={operatorStatusFilter}
            onChange={(e) => { setOperatorStatusFilter(e.target.value); setOperatorsPage(1); }}
          >
            <option value="">{t('saAllStatuses')}</option>
            <option value="active">{t('saStatusActive')}</option>
            <option value="inactive">{t('saStatusInactive')}</option>
          </Form.Select>
          <SearchableRestaurantFilter
            t={t}
            width="100%"
            value={operatorRestaurantFilter}
            restaurants={operatorRestaurantOptions}
            searchValue={operatorRestaurantSearch}
            onSearchChange={setOperatorRestaurantSearch}
            onChange={(nextValue) => {
              setOperatorRestaurantFilter(nextValue);
              setOperatorRestaurantSearch('');
              setOperatorsPage(1);
            }}
          />
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder={t('saSearchNamePhone')}
            value={operatorSearch}
            onChange={(e) => { setOperatorSearch(e.target.value); setOperatorsPage(1); }}
          />
        </div>
      );
    }

    if (activeTab === 'customers') {
      return (
        <div className="d-flex flex-column gap-3">
          <SearchableRestaurantFilter
            t={t}
            width="100%"
            value={customerRestaurantFilter}
            restaurants={customerRestaurantOptions}
            searchValue={customerRestaurantSearch}
            onSearchChange={setCustomerRestaurantSearch}
            onChange={(nextValue) => {
              setCustomerRestaurantFilter(nextValue);
              setCustomerRestaurantSearch('');
              setCustomerPage(1);
            }}
          />
          <Form.Select
            className="form-control-custom"
            value={customerStatusFilter}
            onChange={(e) => { setCustomerStatusFilter(e.target.value); setCustomerPage(1); }}
          >
            <option value="">{t('saAllStatuses')}</option>
            <option value="active">{t('saStatusActive')}</option>
            <option value="blocked">{t('saStatusBlocked')}</option>
          </Form.Select>
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder={t('saSearch')}
            value={customerSearch}
            onChange={(e) => { setCustomerSearch(e.target.value); setCustomerPage(1); }}
          />
        </div>
      );
    }

    if (activeTab === 'ads') {
      return (
        <div className="d-flex flex-column gap-3">
          <Form.Select
            className="form-control-custom"
            value={adBannerStatusFilter}
            onChange={(e) => { setAdBannerStatusFilter(e.target.value); setAdBannersPage(1); }}
          >
            <option value="all">{adI18n.allStatuses}</option>
            <option value="active">{adI18n.active}</option>
            <option value="scheduled">{adI18n.scheduled}</option>
            <option value="paused_by_days">{adI18n.pausedByDays}</option>
            <option value="disabled">{adI18n.disabled}</option>
            <option value="finished">{adI18n.finished}</option>
          </Form.Select>

          <Form.Select
            className="form-control-custom"
            value={adBannerActivityTypeFilter}
            onChange={(e) => { setAdBannerActivityTypeFilter(e.target.value); setAdBannersPage(1); }}
          >
            <option value="all">{adI18n.activityTypeAll}</option>
            <option value="untargeted">{adI18n.activityTypeNoTarget}</option>
            {adBannerActivityTypeFilterOptions.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name}{item.is_visible === false ? (language === 'uz' ? ' (yashirin)' : ' (скрыт)') : ''}
              </option>
            ))}
          </Form.Select>
        </div>
      );
    }

    if (activeTab === 'logs') {
      return (
        <div className="d-flex flex-column gap-3">
          <Form.Control
            type="date"
            className="form-control-custom"
            value={logsFilter.start_date}
            onChange={(e) => setLogsFilter(prev => ({ ...prev, start_date: e.target.value, page: 1 }))}
          />
          <Form.Control
            type="date"
            className="form-control-custom"
            value={logsFilter.end_date}
            onChange={(e) => setLogsFilter(prev => ({ ...prev, end_date: e.target.value, page: 1 }))}
          />
          <Form.Select
            className="form-control-custom"
            value={logsFilter.user_id}
            onChange={(e) => setLogsFilter(prev => ({ ...prev, user_id: e.target.value, page: 1 }))}
          >
            <option value="">{t('saAllUsers')}</option>
            {allOperators?.map(op => (
              <option key={op.id} value={op.id}>{op.full_name || op.username}</option>
            ))}
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={logsFilter.user_role}
            onChange={(e) => setLogsFilter(prev => ({ ...prev, user_role: e.target.value, page: 1 }))}
          >
            <option value="">Все роли</option>
            <option value="operator">Операторы</option>
            <option value="customer">Клиенты</option>
            <option value="superadmin">Суперадмины</option>
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={logsFilter.restaurant_id}
            onChange={(e) => setLogsFilter(prev => ({ ...prev, restaurant_id: e.target.value, page: 1 }))}
          >
            <option value="">{t('saAllShops')}</option>
            {allRestaurants?.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={logsFilter.action_type}
            onChange={(e) => setLogsFilter(prev => ({ ...prev, action_type: e.target.value, page: 1 }))}
          >
            <option value="">{t('saAllActions')}</option>
            {logActionFilterOptions.map((item) => (
              <option key={`mobile-log-action-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </Form.Select>
        </div>
      );
    }

    if (activeTab === 'billing_transactions') {
      return (
        <div className="d-flex flex-column gap-3">
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder={language === 'uz' ? "Do'kon, izoh yoki operator bo'yicha qidirish" : 'Поиск по магазину, описанию или оператору'}
            value={billingOpsFilter.search}
            onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
          />
          <SearchableRestaurantFilter
            t={t}
            width="100%"
            value={billingOpsFilter.restaurant_id}
            restaurants={billingOpsRestaurantOptions}
            searchValue={billingOpsRestaurantSearch}
            onSearchChange={setBillingOpsRestaurantSearch}
            onChange={(nextValue) => {
              setBillingOpsFilter((prev) => ({ ...prev, restaurant_id: nextValue, page: 1 }));
              setBillingOpsRestaurantSearch('');
            }}
          />
          <Form.Select
            className="form-control-custom"
            value={billingOpsFilter.type}
            onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, type: e.target.value, page: 1 }))}
          >
            <option value="">{language === 'uz' ? 'Barcha operatsiyalar' : 'Все операции'}</option>
            <option value="deposit">{language === 'uz' ? "To'ldirish" : 'Пополнение'}</option>
            <option value="refund">{language === 'uz' ? 'Qaytarish' : 'Возврат'}</option>
          </Form.Select>
          <Form.Control
            type="date"
            className="form-control-custom"
            value={billingOpsFilter.start_date}
            onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, start_date: e.target.value, page: 1 }))}
          />
          <Form.Control
            type="date"
            className="form-control-custom"
            value={billingOpsFilter.end_date}
            onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, end_date: e.target.value, page: 1 }))}
          />
        </div>
      );
    }

    if (activeTab === 'security') {
      return (
        <div className="d-flex flex-column gap-3">
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder={language === 'uz' ? "Qidiruv (IP, yo'l, tafsilot)" : 'Поиск (IP, путь, детали)'}
            value={securityFilter.search}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
          />
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder="IP"
            value={securityFilter.source_ip}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, source_ip: e.target.value, page: 1 }))}
          />
          <Form.Select
            className="form-control-custom"
            value={securityFilter.event_type}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, event_type: e.target.value, page: 1 }))}
          >
            <option value="">{language === 'uz' ? 'Barcha hodisalar' : 'Все события'}</option>
            {securityEventTypeOptions.map((eventType) => (
              <option key={`mobile-security-event-type-${eventType}`} value={eventType}>
                {formatSecurityEventType(eventType)}
              </option>
            ))}
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={securityFilter.risk_level}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, risk_level: e.target.value, page: 1 }))}
          >
            <option value="">{language === 'uz' ? 'Barcha risklar' : 'Все риски'}</option>
            <option value="low">{language === 'uz' ? 'Past' : 'Низкий'}</option>
            <option value="medium">{language === 'uz' ? "O'rtacha" : 'Средний'}</option>
            <option value="high">{language === 'uz' ? 'Yuqori' : 'Высокий'}</option>
            <option value="critical">Critical</option>
          </Form.Select>
          <Form.Select
            className="form-control-custom"
            value={securityFilter.status}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
          >
            <option value="">{language === 'uz' ? 'Barcha statuslar' : 'Все статусы'}</option>
            <option value="open">{language === 'uz' ? 'Ochiq' : 'Открыто'}</option>
            <option value="resolved">{language === 'uz' ? 'Yechilgan' : 'Решено'}</option>
          </Form.Select>
          <Form.Control
            type="date"
            className="form-control-custom"
            value={securityFilter.start_date}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, start_date: e.target.value, page: 1 }))}
          />
          <Form.Control
            type="date"
            className="form-control-custom"
            value={securityFilter.end_date}
            onChange={(e) => setSecurityFilter((prev) => ({ ...prev, end_date: e.target.value, page: 1 }))}
          />
        </div>
      );
    }

    return null;
  };

  const renderAiSettingsPanel = () => (
    <>
      <div className="mb-4">
        <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">
          {language === 'uz' ? 'AI sozlamalari va provayderlar' : 'AI настройки и провайдеры'}
        </h5>
      </div>

      <Alert
        variant={isAiFeatureEnabled ? 'light' : 'warning'}
        className="superadmin-setting-surface mb-4"
        style={{ background: 'var(--surface-color)', color: 'var(--text-main)' }}
      >
        <div className="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3">
          <div>
            <div className="fw-bold">
              {language === 'uz' ? 'AI funksiyalari' : 'AI функционал'}
            </div>
            <div className="small text-muted">
              {language === 'uz'
                ? "O'chirilsa, superadmin panelidagi AI matn va rasm preview tugmalari ishlamaydi."
                : 'При выключении AI-кнопки генерации текста и preview изображений в суперадминке не работают.'}
            </div>
          </div>
          <Form.Check
            type="switch"
            id="superadmin-ai-enabled-switch"
            className="fw-semibold"
            label={isAiFeatureEnabled
              ? (language === 'uz' ? 'AI yoqilgan' : 'AI включен')
              : (language === 'uz' ? "AI o'chirilgan" : 'AI выключен')}
            checked={isAiFeatureEnabled}
            onChange={(e) => saveAiFeatureFlag(!!e.target.checked)}
          />
        </div>
      </Alert>

      <Card className="admin-card admin-section-panel ai-settings-panel-card mb-4">
        <Card.Header className="admin-section-panel-header py-3 d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-2">
          <h6 className="mb-0 fw-bold">AI провайдеры и ключи</h6>
          <div className="d-flex gap-2">
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                loadAiProviders();
                loadAiUsageSummary(aiUsageDays);
              }}
              disabled={aiProvidersLoading || aiUsageLoading}
            >
              Обновить
            </Button>
            <Button
              type="button"
              className="btn-primary-custom"
              size="sm"
              onClick={addAiProviderDraft}
            >
              + Добавить
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-4">
          {aiProvidersLoading ? (
            <div className="text-muted">Загрузка AI-провайдеров...</div>
          ) : (
            <>
              {aiProviders.length === 0 ? (
                <Alert variant="secondary" className="mb-3">
                  Провайдеры не добавлены. Нажмите “+ Добавить”.
                </Alert>
              ) : (
                <div className="admin-table-container ai-provider-table-container">
                  <Table className="admin-table ai-provider-table align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="ai-provider-name-col">Название</th>
                        <th className="ai-provider-type-col">Тип</th>
                        <th className="ai-provider-key-col">API key</th>
                        <th className="ai-provider-model-col">Image model</th>
                        <th className="ai-provider-model-col">Text model</th>
                        <th className="ai-provider-priority-col text-center">Приоритет</th>
                        <th className="ai-provider-switch-col text-center">Актив</th>
                        <th className="ai-provider-actions-col text-end">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiProviders.map((provider) => {
                        const providerKey = getAiProviderKey(provider);
                        const isSaving = aiProviderSavingId === providerKey;
                        const isDeleting = provider.id && aiProviderDeletingId === provider.id;
                        const isTesting = provider.id && aiProviderTestingId === provider.id;
                        const providerTypeMeta = getAiProviderTypeMeta(provider.provider_type);
                        const modelPlaceholders = getAiModelPlaceholdersByProviderType(provider.provider_type);
                        const providerTitle = String(provider.name || '').trim() || 'Новый провайдер';
                        const providerActive = provider.is_active === true;
                        return (
                          <tr key={providerKey}>
                            <td className="ai-provider-name-col">
                              <Form.Control
                                size="sm"
                                value={provider.name}
                                onChange={(e) => updateAiProviderDraft(providerKey, { name: e.target.value })}
                                placeholder="Например: Gemini Main"
                              />
                            </td>
                            <td className="ai-provider-type-col">
                              <div className="input-group input-group-sm">
                                <span className="input-group-text bg-white px-2">
                                  <img
                                    src={providerTypeMeta.icon}
                                    alt={providerTypeMeta.label}
                                    width={16}
                                    height={16}
                                    style={{ objectFit: 'contain' }}
                                  />
                                </span>
                                <Form.Select
                                  size="sm"
                                  value={provider.provider_type}
                                  onChange={(e) => updateAiProviderDraft(providerKey, { provider_type: e.target.value })}
                                >
                                  {AI_PROVIDER_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </Form.Select>
                              </div>
                            </td>
                            <td className="ai-provider-key-col">
                              <div className="d-flex gap-1">
                                <Form.Control
                                  size="sm"
                                  type="password"
                                  value={provider.api_key}
                                  onChange={(e) => updateAiProviderDraft(providerKey, {
                                    api_key: e.target.value,
                                    clear_api_key: false
                                  })}
                                  placeholder={provider.has_api_key ? `Сохранён: ${provider.api_key_masked || '••••'}` : 'Введите ключ'}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="ai-provider-action-btn"
                                  variant={provider.clear_api_key ? 'danger' : 'outline-secondary'}
                                  onClick={() => updateAiProviderDraft(providerKey, {
                                    api_key: '',
                                    clear_api_key: !provider.clear_api_key
                                  })}
                                  title="Очистить сохраненный ключ при следующем сохранении"
                                  aria-label={`Очистить ключ провайдера ${providerTitle}`}
                                  disabled={isSaving || isDeleting || isTesting}
                                >
                                  <i className={`bi ${provider.clear_api_key ? 'bi-eraser-fill' : 'bi-eraser'}`} aria-hidden="true" />
                                </Button>
                              </div>
                              {provider.clear_api_key ? (
                                <div className="ai-provider-cell-note text-danger">Ключ будет удалён после сохранения.</div>
                              ) : (
                                provider.provider_type === 'pollinations' && (
                                  <div className="ai-provider-cell-note text-muted">Для Pollinations ключ можно оставить пустым.</div>
                                )
                              )}
                            </td>
                            <td className="ai-provider-model-col">
                              <Form.Control
                                size="sm"
                                value={provider.image_model || ''}
                                onChange={(e) => updateAiProviderDraft(providerKey, { image_model: e.target.value })}
                                placeholder={modelPlaceholders.image}
                              />
                            </td>
                            <td className="ai-provider-model-col">
                              <Form.Control
                                size="sm"
                                value={provider.text_model || ''}
                                onChange={(e) => updateAiProviderDraft(providerKey, { text_model: e.target.value })}
                                placeholder={modelPlaceholders.text}
                              />
                            </td>
                            <td className="ai-provider-priority-col">
                              <Form.Control
                                size="sm"
                                type="number"
                                min="1"
                                max="9999"
                                value={provider.priority}
                                onChange={(e) => updateAiProviderDraft(providerKey, { priority: e.target.value })}
                              />
                            </td>
                            <td className="ai-provider-switch-col">
                              <Form.Check
                                type="switch"
                                id={`ai-provider-active-intent-${providerKey}`}
                                className="ai-provider-row-switch"
                                checked={providerActive}
                                onChange={(e) => {
                                  const shouldActivate = !!e.target.checked;
                                  updateAiProviderDraft(providerKey, shouldActivate
                                    ? { is_active: true, is_enabled: true }
                                    : { is_active: false, is_enabled: false });
                                }}
                                aria-label={`Сделать провайдера ${providerTitle} активным`}
                              />
                            </td>
                            <td className="ai-provider-actions-col">
                              <div className="d-flex justify-content-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="ai-provider-action-btn"
                                  variant="outline-info"
                                  onClick={() => applyOpenRouterFreePreset(providerKey, provider)}
                                  disabled={isSaving || isDeleting || isTesting}
                                  title="Заполнить OpenRouter Free (StepFun + Minimax)"
                                  aria-label={`Заполнить OpenRouter Free пресет для ${providerTitle}`}
                                >
                                  <i className="bi bi-stars" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="ai-provider-action-btn"
                                  variant="outline-secondary"
                                  onClick={() => testAiProvider(provider)}
                                  disabled={!provider.id || isSaving || isDeleting || isTesting}
                                  title="Проверить токен и модели (текст + фото)"
                                  aria-label={`Проверить провайдера ${providerTitle}`}
                                >
                                  {isTesting ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <i className="bi bi-patch-check" aria-hidden="true" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="ai-provider-action-btn"
                                  variant="primary"
                                  onClick={() => saveAiProvider(provider)}
                                  disabled={isSaving || isDeleting || isTesting}
                                  title="Сохранить"
                                  aria-label={`Сохранить провайдера ${providerTitle}`}
                                >
                                  {isSaving ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <i className="bi bi-check2" aria-hidden="true" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="ai-provider-action-btn"
                                  variant="outline-danger"
                                  onClick={() => removeAiProvider(provider)}
                                  disabled={isSaving || isDeleting || isTesting}
                                  title="Удалить"
                                  aria-label={`Удалить провайдера ${providerTitle}`}
                                >
                                  {isDeleting ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <i className="bi bi-trash" aria-hidden="true" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </>
          )}

          <div className="small text-muted mt-2">
            Примечание: включите тумблер "Актив" у нужного провайдера и нажмите кнопку сохранения в этой же строке — предыдущий активный выключится автоматически.
            ENV-ключи используются только когда активный провайдер не задан.
            Для кнопки проверки провайдер должен быть активным, иначе будет ошибка.
            Кнопка со звёздочкой заполняет OpenRouter Free пресет: StepFun (text) + Minimax (image).
          </div>
        </Card.Body>
      </Card>

      <Card className="admin-card admin-section-panel ai-settings-panel-card mb-4">
        <Card.Header className="admin-section-panel-header py-3">
          <h6 className="mb-0 fw-bold">AI аналитика и фильтры</h6>
        </Card.Header>
        <Card.Body className="p-4">
          <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
            <Form.Select
              style={{ width: 170 }}
              value={aiUsageDays}
              onChange={(e) => setAiUsageDays(Number(e.target.value) || 30)}
            >
              <option value={7}>7 дней</option>
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
              <option value={60}>60 дней</option>
              <option value={90}>90 дней</option>
            </Form.Select>
            {aiUsageLoading && <small className="text-muted">Загрузка статистики...</small>}
          </div>

          <Row className="g-2 mb-3">
            <Col xs={6} md={3}>
              <div className="small text-muted">Запросов ({aiUsageSummary.days} дн.)</div>
              <div className="fw-bold">{Number(aiUsageSummary?.totals?.total_requests || 0)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Успех / Ошибки</div>
              <div className="fw-bold">
                {Number(aiUsageSummary?.totals?.success_requests || 0)} / {Number(aiUsageSummary?.totals?.failed_requests || 0)}
              </div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Текст (шт)</div>
              <div className="fw-bold">{Number(aiUsageSummary?.totals?.text_requests || 0)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Фото (шт)</div>
              <div className="fw-bold">{Number(aiUsageSummary?.totals?.image_requests || 0)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">USD всего</div>
              <div className="fw-bold">${Number(aiUsageSummary?.totals?.estimated_cost_usd || 0).toFixed(3)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">USD текст</div>
              <div className="fw-bold">${Number(aiUsageSummary?.totals?.text_estimated_cost_usd || 0).toFixed(3)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">USD фото</div>
              <div className="fw-bold">${Number(aiUsageSummary?.totals?.image_estimated_cost_usd || 0).toFixed(3)}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Ошибки квоты</div>
              <div className="fw-bold">{Number(aiUsageSummary?.totals?.quota_related_errors || 0)}</div>
            </Col>
          </Row>

          {Array.isArray(aiUsageSummary.by_provider) && aiUsageSummary.by_provider.length > 0 && (
            <div className="mt-4">
              <div className="fw-semibold mb-2">По провайдерам</div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Провайдер</th>
                      <th>Тип</th>
                      <th className="text-end">Всего</th>
                      <th className="text-end">Текст</th>
                      <th className="text-end">Фото</th>
                      <th className="text-end">Успех</th>
                      <th className="text-end">Ошибки</th>
                      <th className="text-end">USD всего</th>
                      <th className="text-end">USD текст</th>
                      <th className="text-end">USD фото</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsageSummary.by_provider.map((row, index) => {
                      const rowTypeMeta = getAiProviderTypeMeta(row.provider_type);
                      return (
                        <tr key={`${row.provider_name || 'provider'}-${index}`}>
                          <td>{row.provider_name || '-'}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <img
                                src={rowTypeMeta.icon}
                                alt={rowTypeMeta.label}
                                width={16}
                                height={16}
                                style={{ objectFit: 'contain', borderRadius: 4 }}
                              />
                              <span>{rowTypeMeta.label}</span>
                            </div>
                          </td>
                          <td className="text-end">{Number(row.requests || 0)}</td>
                          <td className="text-end">{Number(row.text_requests || 0)}</td>
                          <td className="text-end">{Number(row.image_requests || 0)}</td>
                          <td className="text-end">{Number(row.success_requests || 0)}</td>
                          <td className="text-end">{Number(row.failed_requests || 0)}</td>
                          <td className="text-end">${Number(row.estimated_cost_usd || 0).toFixed(3)}</td>
                          <td className="text-end">${Number(row.text_estimated_cost_usd || 0).toFixed(3)}</td>
                          <td className="text-end">${Number(row.image_estimated_cost_usd || 0).toFixed(3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {Array.isArray(aiUsageSummary.recent_errors) && aiUsageSummary.recent_errors.length > 0 && (
            <div className="mt-4">
              <div className="fw-semibold mb-2">Последние ошибки AI</div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Время</th>
                      <th>Провайдер</th>
                      <th>Операция</th>
                      <th>Код / HTTP</th>
                      <th>Сообщение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsageSummary.recent_errors.slice(0, 10).map((row, index) => {
                      const rowTypeMeta = getAiProviderTypeMeta(row.provider_type);
                      return (
                        <tr key={`ai-error-${index}`}>
                          <td>{row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <img
                                src={rowTypeMeta.icon}
                                alt={rowTypeMeta.label}
                                width={16}
                                height={16}
                                style={{ objectFit: 'contain', borderRadius: 4 }}
                              />
                              <span>{row.provider_name || rowTypeMeta.label || '-'}</span>
                            </div>
                          </td>
                          <td>{row.operation || '-'}</td>
                          <td>
                            {String(row.error_code || '').trim() || '-'}
                            {row.http_status ? ` / ${row.http_status}` : ''}
                          </td>
                          <td>{String(row.error_message || '').trim().slice(0, 140) || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  );

  return (
    <div className={`min-vh-100 bg-light ${actionButtonsVisible ? '' : 'action-buttons-hidden'}`}>
      {/* Header */}
      <Navbar expand="lg" className="admin-navbar admin-navbar-shell py-3 mb-4 shadow-sm">
        <HeaderGlowBackground />
        <Container className="admin-navbar-container">
          <Navbar.Brand className="d-flex align-items-center py-1">
            <div className="admin-brand-logo-shell admin-brand-logo-shell-horizontal admin-brand-logo-shell-plain">
              <img src="/talablar.svg" alt="Talablar" className="admin-brand-logo" />
            </div>
          </Navbar.Brand>
          <Navbar.Toggle
            className="admin-navbar-toggle admin-sidebar-mobile-toggle d-lg-none"
            onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </Navbar.Toggle>
          <Navbar.Collapse className="justify-content-end d-none d-lg-flex">
            <Nav className="d-none d-lg-flex align-items-lg-center gap-lg-1">
              <div className="d-none">
                <Dropdown align="end" className="admin-header-lang-dropdown">
                  <Dropdown.Toggle
                    variant="link"
                    bsPrefix="p-0"
                    className="d-flex align-items-center py-1 px-3 rounded-pill text-decoration-none border-0 admin-header-pill admin-lang-pill admin-collapsible-pill admin-collapsible-pill--lang"
                    title={activeHeaderLanguageOption?.label || activeHeaderLanguageOption?.shortLabel || 'RU'}
                  >
                    <span className="admin-pill-icon" aria-hidden="true">
                      <img src={activeHeaderLanguageOption?.flag} width="16" height="12" alt={activeHeaderLanguageOption?.shortLabel || 'LANG'} className="rounded-1" />
                    </span>
                    <span className="admin-pill-expand">
                      <span className="admin-lang-pill-label">{activeHeaderLanguageOption?.shortLabel || 'RU'}</span>
                      <i className="bi bi-chevron-down admin-lang-pill-chevron" aria-hidden="true"></i>
                    </span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-lang-dropdown-menu">
                    {headerLanguageOptions.map((option) => (
                      <Dropdown.Item
                        key={option.code}
                        onClick={() => handleHeaderLanguageSelect(option.code)}
                        className={`d-flex align-items-center justify-content-between gap-3 py-2 rounded-3 admin-lang-dropdown-item${language === option.code ? ' is-active' : ''}`}
                      >
                        <span className="d-inline-flex align-items-center gap-2">
                          <img src={option.flag} width="18" height="13" alt={option.shortLabel} className="rounded-1" />
                          <span>{option.label}</span>
                        </span>
                        {language === option.code && <i className="bi bi-check2 text-primary" aria-hidden="true"></i>}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>

                <button
                  type="button"
                  onClick={() => setShowMobileAccountSheet(true)}
                  className="d-flex d-lg-none align-items-center gap-2 py-2 px-3 rounded-pill text-decoration-none border-0 custom-user-dropdown admin-user-toggle admin-header-pill admin-user-pill"
                  style={{ color: '#ffffff' }}
                >
                  <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white admin-user-avatar">
                    {user?.username?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="text-start">
                    <div className="text-white small fw-bold lh-1">{user?.full_name || user?.username || 'Super Administrator'}</div>
                    <div className="text-white-50 small admin-user-id">Administrator</div>
                  </div>
                </button>

                <Dropdown align="end" className="d-none d-lg-block">
                  <Dropdown.Toggle
                    variant="link"
                    bsPrefix="p-0"
                    className="d-flex align-items-center py-2 px-3 rounded-pill text-decoration-none custom-user-dropdown admin-user-toggle admin-header-pill admin-user-pill admin-collapsible-pill admin-collapsible-pill--user"
                    title={user?.full_name || user?.username || 'Super Administrator'}
                  >
                    <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white admin-user-avatar admin-pill-icon">
                      {user?.username?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div className="d-none d-md-block text-start admin-pill-expand">
                      <div className="text-white small fw-bold lh-1">{user?.full_name || user?.username || 'Super Administrator'}</div>
                      <div className="text-white-50 small admin-user-id">Administrator</div>
                    </div>
                  </Dropdown.Toggle>

                  <Dropdown.Menu className="shadow border-0 mt-2 rounded-3 admin-dropdown-menu">
                    <Dropdown.Item onClick={() => navigate('/admin')} className="d-flex align-items-center gap-2 py-2">
                      <i className="bi bi-grid-1x2"></i> {t('operatorPanel')}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={handleLogout} className="text-danger d-flex align-items-center gap-2 py-2">
                      <i className="bi bi-box-arrow-right"></i> Выйти
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Modal
        show={showScamPrankModal && isDavronSuperadmin}
        onHide={dismissScamPrankModal}
        centered
        backdrop="static"
        keyboard={false}
        className="sa-scam-prank-modal"
        dialogClassName="sa-scam-prank-dialog"
        backdropClassName="sa-scam-prank-backdrop"
      >
        <Modal.Body className="sa-scam-prank-body">
          <div className="sa-scam-prank-badge">SCAM TEST</div>
          <h4 className="sa-scam-prank-title">Tesla olib berasanmi?</h4>
          <p className="sa-scam-prank-text">
            {language === 'uz'
              ? "Bu hazil anti-scam trening. Shubhali xabarlarga hech qachon pul o'tkazmang."
              : 'Это шутка-антискам тренинг. Никогда не переводите деньги по подозрительным сообщениям.'}
          </p>
          <div className="sa-scam-prank-timer">
            00:{String(Math.max(0, scamPrankSecondsLeft)).padStart(2, '0')}
          </div>

          <div className="sa-scam-prank-actions">
            {scamPrankButtonsOrder.map((key) => (
              <button
                key={`scam-prank-btn-${key}`}
                type="button"
                className={`sa-scam-prank-btn ${key === 'ha' ? 'is-yes' : 'is-no'}`}
                onMouseEnter={handleScamPrankButtonsShuffle}
                onFocus={handleScamPrankButtonsShuffle}
                onTouchStart={handleScamPrankButtonsShuffle}
                onClick={() => handleScamPrankChoice(key)}
              >
                {key === 'ha' ? 'Ha' : "Yo'q"}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="sa-scam-prank-skip"
            onClick={dismissScamPrankModal}
          >
            {language === 'uz' ? 'Yopish' : 'Закрыть'}
          </button>
        </Modal.Body>
      </Modal>

      <Modal
        show={showMobileAccountSheet}
        onHide={() => setShowMobileAccountSheet(false)}
        centered
        dialogClassName="mobile-bottom-sheet"
        className="d-lg-none"
      >
        <Modal.Header closeButton className="border-0 pb-2">
          <Modal.Title className="fs-6 fw-bold d-flex align-items-center gap-2">
            <span className="bg-primary rounded-circle d-inline-flex align-items-center justify-content-center text-white" style={{ width: 30, height: 30 }}>
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </span>
            {user?.full_name || user?.username || 'Super Administrator'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          <div className="d-grid gap-3">
            <div className="rounded-3 border p-3 bg-light">
              <div className="fw-bold text-dark">{user?.full_name || user?.username || 'Super Administrator'}</div>
              <div className="small text-muted mt-1">Супер-админ</div>
            </div>

            <Button
              variant="light"
              className="text-start d-flex align-items-center gap-2"
              onClick={() => {
                setShowMobileAccountSheet(false);
                navigate('/admin');
              }}
            >
              <i className="bi bi-grid-1x2"></i> {t('operatorPanel')}
            </Button>

            <Button
              variant="outline-danger"
              className="text-start d-flex align-items-center gap-2"
              onClick={() => {
                setShowMobileAccountSheet(false);
                handleLogout();
              }}
            >
              <i className="bi bi-box-arrow-right"></i> Выйти
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        show={showMobileFiltersSheet && hasMobileFilterSheet}
        onHide={() => setShowMobileFiltersSheet(false)}
        centered
        dialogClassName="mobile-bottom-sheet"
        className="d-lg-none"
      >
        <Modal.Header closeButton className="border-0 pb-2">
          <Modal.Title className="fs-6 fw-bold d-flex align-items-center gap-2">
            <i className="bi bi-funnel"></i>
            {mobileSheetI18n.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          {renderMobileFiltersSheetContent()}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0 d-flex gap-2">
          <Button variant="light" className="flex-fill" onClick={resetActiveTabFilters}>
            {mobileSheetI18n.reset}
          </Button>
          <Button className="btn-primary-custom flex-fill" onClick={() => setShowMobileFiltersSheet(false)}>
            {mobileSheetI18n.apply}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showOverviewRestaurantPickerModal}
        onHide={() => setShowOverviewRestaurantPickerModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {language === 'uz' ? "Do'konni tanlang" : 'Выбор магазина'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <Form.Control
            className="form-control-custom mb-3"
            type="search"
            placeholder={language === 'uz' ? "Do'kon qidirish..." : 'Поиск магазина...'}
            value={overviewRestaurantSearch}
            onChange={(e) => setOverviewRestaurantSearch(e.target.value)}
            autoFocus
          />
          <div className="d-grid gap-2 overview-restaurant-picker-list">
            <Button
              variant={!overviewAnalyticsRestaurantId ? 'primary' : 'light'}
              className="text-start"
              onClick={() => {
                setOverviewAnalyticsRestaurantId('');
                setShowOverviewRestaurantPickerModal(false);
              }}
            >
              {language === 'uz' ? "Barcha do'konlar" : 'Все магазины'}
            </Button>
            {filteredOverviewAnalyticsRestaurants.length ? filteredOverviewAnalyticsRestaurants.map((restaurant) => (
              <Button
                key={`overview-filter-shop-${restaurant.id}`}
                variant={String(overviewAnalyticsRestaurantId) === String(restaurant.id) ? 'primary' : 'light'}
                className="text-start"
                onClick={() => {
                  setOverviewAnalyticsRestaurantId(String(restaurant.id));
                  setShowOverviewRestaurantPickerModal(false);
                }}
              >
                {restaurant.name}
              </Button>
            )) : (
              <div className="small text-muted text-center py-2">{t('noData')}</div>
            )}
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        show={showOverviewCompareModal}
        onHide={() => setShowOverviewCompareModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {language === 'uz' ? "Do'konlarni taqqoslash (max 3)" : 'Сравнение магазинов (макс 3)'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <Form.Control
            className="form-control-custom mb-3"
            type="search"
            placeholder={language === 'uz' ? "Do'kon qidirish..." : 'Поиск магазина...'}
            value={overviewCompareRestaurantSearch}
            onChange={(e) => setOverviewCompareRestaurantSearch(e.target.value)}
            autoFocus
          />
          <div className="overview-compare-selected mb-3">
            {overviewComparisonRestaurantNames.length ? overviewComparisonRestaurantNames.map((name, idx) => (
              <span className="admin-analytics-compare-chip" key={`modal-compare-chip-${idx}`}>{name}</span>
            )) : (
              <span className="small text-muted">
                {language === 'uz'
                  ? "Tanlangan do'konlar yo'q"
                  : 'Нет выбранных магазинов'}
              </span>
            )}
          </div>
          <div className="d-grid gap-2 overview-restaurant-picker-list">
            {filteredOverviewCompareRestaurants.length ? filteredOverviewCompareRestaurants.map((restaurant) => {
              const checked = overviewComparisonRestaurantIds.includes(String(restaurant.id));
              const isLimitReached = !checked && overviewComparisonRestaurantIds.length >= 3;
              return (
                <button
                  key={`compare-shop-${restaurant.id}`}
                  type="button"
                  className={`btn text-start d-flex align-items-center justify-content-between ${checked ? 'btn-primary' : 'btn-light'}`}
                  onClick={() => toggleOverviewComparisonRestaurant(restaurant.id)}
                  disabled={isLimitReached}
                >
                  <span>{restaurant.name}</span>
                  <Form.Check type="checkbox" checked={checked} readOnly />
                </button>
              );
            }) : (
              <div className="small text-muted text-center py-2">{t('noData')}</div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between">
          <Button
            variant="light"
            onClick={() => setOverviewComparisonRestaurantIds([])}
            disabled={!overviewComparisonRestaurantIds.length}
          >
            {language === 'uz' ? 'Tozalash' : 'Очистить'}
          </Button>
          <div className="d-flex gap-2">
            <Button
              variant="outline-primary"
              onClick={handleExportOverviewComparisonPdf}
              disabled={overviewComparisonRestaurantIds.length < 2 || overviewComparisonPdfLoading}
            >
              {overviewComparisonPdfLoading ? 'PDF...' : (language === 'uz' ? 'PDF yuklash' : 'Скачать PDF')}
            </Button>
            <Button className="btn-primary-custom" onClick={() => setShowOverviewCompareModal(false)}>
              {language === 'uz' ? 'Tayyor' : 'Готово'}
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      <Container className="admin-panel">
        {/* Notifications */}
        <ToastContainer position="top-end" className="p-3 admin-toast-top">
          <Toast onClose={() => setError('')} show={!!error} delay={5000} autohide bg="danger" className="text-white">
            <Toast.Header closeButton={false} className="bg-danger text-white border-0">
              <strong className="me-auto">Ошибка</strong>
              <Button variant="white" className="btn-close" onClick={() => setError('')} />
            </Toast.Header>
            <Toast.Body>{error}</Toast.Body>
          </Toast>

          <Toast onClose={() => setSuccess('')} show={!!success} delay={5000} autohide bg="success" className="text-white">
            <Toast.Header closeButton={false} className="bg-success text-white border-0">
              <strong className="me-auto">Успех</strong>
              <Button variant="white" className="btn-close" onClick={() => setSuccess('')} />
            </Toast.Header>
            <Toast.Body>{success}</Toast.Body>
          </Toast>
        </ToastContainer>

        {/* Stats */}
        {activeTab === 'analytics' && (
          <Row className="mb-4 g-4 superadmin-stats-grid">
            <Col xs={6} md={3}>
              <Card className="admin-card stat-card border-0 superadmin-stat-card">
                <Card.Body className="p-4 d-flex align-items-center gap-3">
                  <div className="stat-icon bg-primary bg-opacity-10 text-primary mb-0">🏪</div>
                  <div>
                    <h4 className="fw-bold mb-0 text-dark">{stats.restaurants_count || 0}</h4>
                    <small className="text-muted fw-semibold superadmin-stat-label">{t('saRestaurantsCount')}</small>
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} md={3}>
              <Card className="admin-card stat-card border-0 superadmin-stat-card">
                <Card.Body className="p-4 d-flex align-items-center gap-3">
                  <div className="stat-icon bg-success bg-opacity-10 text-success mb-0">👥</div>
                  <div>
                    <h4 className="fw-bold mb-0 text-dark">{stats.operators_count || 0}</h4>
                    <small className="text-muted fw-semibold superadmin-stat-label">{t('saOperatorsCount')}</small>
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} md={3}>
              <Card className="admin-card stat-card border-0 superadmin-stat-card">
                <Card.Body className="p-4 d-flex align-items-center gap-3">
                  <div className="stat-icon bg-info bg-opacity-10 text-info mb-0">👤</div>
                  <div>
                    <h4 className="fw-bold mb-0 text-dark">{stats.customers_count || 0}</h4>
                    <small className="text-muted fw-semibold superadmin-stat-label">{t('saCustomersCount')}</small>
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} md={3}>
              <Card className="admin-card stat-card border-0 superadmin-stat-card">
                <Card.Body className="p-4 d-flex align-items-center gap-3">
                  <div className="stat-icon bg-warning bg-opacity-10 text-warning mb-0">📦</div>
                  <div>
                    <h4 className="fw-bold mb-0 text-dark">{stats.new_orders_count || 0}</h4>
                    <small className="text-muted fw-semibold superadmin-stat-label">{t('saNewOrdersCount')}</small>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}

        {/* Main Content */}
        <div className={`admin-tabs-shell${isSidebarCollapsed ? ' is-collapsed' : ''}`}>
          <div className={`admin-sidebar-column${isSidebarCollapsed ? ' is-collapsed' : ''}`}>
            <Nav
              activeKey={activeTab}
              onSelect={handleSidebarTabSelect}
              className={`admin-tabs admin-tabs-sidebar mb-0${isSidebarCollapsed ? ' is-collapsed' : ''}`}
            >
              {renderSuperAdminSidebarNavItems()}
            </Nav>
            {renderSuperAdminSidebarUtilityActions()}
          </div>
          <Card className="admin-card admin-workspace-main border-0 shadow-sm">
            <Card.Body className="p-4">
              <div className="admin-tab-content-shell">
              <Tabs
                activeKey={activeTab}
                onSelect={handleSidebarTabSelect}
                className="admin-tabs admin-tabs-content-only"
              >
              <Tab eventKey="analytics" title={renderSuperAdminSidebarTabTitle('analytics')}>
                {renderOverviewAnalyticsTab()}
              </Tab>

              {/* Restaurants Tab */}
              <Tab eventKey="restaurants" title={renderSuperAdminSidebarTabTitle('restaurants')}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">{t('saManageRestaurants')}</h5>
                  <div className="d-none d-lg-flex align-items-center gap-2">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showRestaurantsFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowRestaurantsFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showRestaurantsFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                    <Button className="btn-primary-custom" onClick={() => openRestaurantModal()}>
                      {t('saAddRestaurant')}
                    </Button>
                  </div>
                </div>

                <div className="d-flex d-lg-none gap-2 align-items-center mb-3">
                  <Button variant="outline-secondary" className="btn-mobile-filter" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> Фильтры
                  </Button>
                  <Button className="btn-primary-custom ms-auto" onClick={() => openRestaurantModal()}>
                    <span className="d-none d-sm-inline">{t('saAddRestaurant')}</span>
                    <span className="d-sm-none">Добавить</span>
                  </Button>
                </div>

                {showRestaurantsFilterPanel && (
                  <div className="d-none d-lg-flex gap-2 flex-wrap align-items-center mb-3">
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      placeholder="Поиск по названию..."
                      style={{ width: '220px' }}
                      value={restaurantsNameFilter}
                      onChange={(e) => { setRestaurantsNameFilter(e.target.value); setRestaurantsPage(1); }}
                    />
                    <SearchableRestaurantFilter
                      t={t}
                      width="220px"
                      value={restaurantsSelectFilter}
                      restaurants={restaurantsFilterOptions}
                      searchValue={restaurantsSelectSearch}
                      onSearchChange={setRestaurantsSelectSearch}
                      onChange={(nextValue) => {
                        setRestaurantsSelectFilter(nextValue);
                        setRestaurantsSelectSearch('');
                        setRestaurantsPage(1);
                      }}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={restaurantsStatusFilter}
                      onChange={(e) => { setRestaurantsStatusFilter(e.target.value); setRestaurantsPage(1); }}
                    >
                      <option value="">Все статусы</option>
                      <option value="active">Активные</option>
                      <option value="inactive">Неактивные</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '220px' }}
                      value={restaurantsActivityTypeFilter}
                      onChange={(e) => { setRestaurantsActivityTypeFilter(e.target.value); setRestaurantsPage(1); }}
                    >
                      <option value="">{language === 'uz' ? 'Barcha faoliyat turlari' : 'Все виды деятельности'}</option>
                      <option value="none">{language === 'uz' ? 'Faoliyat turi tanlanmagan' : 'Без вида деятельности'}</option>
                      {restaurantsActivityTypeFilterOptions.map((item) => (
                        <option key={`restaurants-activity-type-filter-${item.id}`} value={String(item.id)}>
                          {item.name}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Control
                      className="form-control-custom"
                      type="date"
                      style={{ width: '170px' }}
                      value={restaurantsCreatedFromFilter}
                      onChange={(e) => { setRestaurantsCreatedFromFilter(e.target.value); setRestaurantsPage(1); }}
                    />
                    <Form.Control
                      className="form-control-custom"
                      type="date"
                      style={{ width: '170px' }}
                      value={restaurantsCreatedToFilter}
                      onChange={(e) => { setRestaurantsCreatedToFilter(e.target.value); setRestaurantsPage(1); }}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={restaurantsTariffFilter}
                      onChange={(e) => { setRestaurantsTariffFilter(e.target.value); setRestaurantsPage(1); }}
                    >
                      <option value="">{language === 'uz' ? 'Barcha tariflar' : 'Все тарифы'}</option>
                      <option value="paid">{language === 'uz' ? "Pullik" : 'Платный'}</option>
                      <option value="free">{language === 'uz' ? 'Bepul' : 'Бесплатный'}</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={restaurantsProblemsFilter}
                      onChange={(e) => { setRestaurantsProblemsFilter(e.target.value); setRestaurantsPage(1); }}
                    >
                      <option value="">{language === 'uz' ? 'Muammolar: hammasi' : 'Проблемы: все'}</option>
                      <option value="with_problems">{language === 'uz' ? 'Muammosi bor' : 'Есть проблемы'}</option>
                      <option value="without_problems">{language === 'uz' ? "Muammosiz" : 'Без проблем'}</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={restaurantsProductsFilter}
                      onChange={(e) => { setRestaurantsProductsFilter(e.target.value); setRestaurantsPage(1); }}
                    >
                      <option value="">{language === 'uz' ? 'Mahsulotlar: hammasi' : 'Товары: все'}</option>
                      <option value="with_products">{language === 'uz' ? 'Mahsulot bor' : 'Есть товары'}</option>
                      <option value="without_products">{language === 'uz' ? "Mahsulotsiz" : 'Нет товаров'}</option>
                    </Form.Select>
                  </div>
                )}

                {loading ? (
                  <TableSkeleton rows={8} columns={11} label="Загрузка списка магазинов" />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>{t('saTableLogo')}</th>
                            <th>{t('saTableName')}</th>
                            <th>{t('saTableProducts') || (language === 'uz' ? 'Mahsulotlar' : 'Товары')}</th>
                            <th>{language === 'uz' ? "Ro'yxatdan o'tgan" : 'Дата регистрации'}</th>
                            <th>{t('saTableBalance') || 'Баланс'}</th>
                            <th>{t('saServiceFee') || 'Сбор за обслуживание'}</th>
                            <th>{t('saTableTier') || 'Тариф'}</th>
                            <th>{language === 'uz' ? 'Muammolar' : 'Проблемы'}</th>
                            <th>{t('saTableStatus')}</th>
                            <th className="text-end">{t('saTableActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRestaurants?.map(r => (
                            <tr key={r.id}>
                              <td><span className="text-muted small">#{r.id}</span></td>
                              <td>
                                {r.logo_url ? (
                                  <img
                                    src={r.logo_url.startsWith('http') ? r.logo_url : `${API_URL.replace('/api', '')}${r.logo_url}`}
                                    alt={r.name}
                                    style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }}
                                  />
                                ) : (
                                  <div style={{ width: '36px', height: '36px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #eee' }}>
                                    🏪
                                  </div>
                                )}
                              </td>
                              <td>
                                <strong className="text-dark">{r.name}</strong>
                                <div className="small text-muted">
                                  🧩 {r.activity_type_name || 'Вид деятельности не выбран'}
                                  {r.activity_type_name && r.activity_type_is_visible === false ? ' (скрыт)' : ''}
                                </div>
                                <div className="small text-muted d-flex align-items-center gap-1">
                                  <span>{r.telegram_bot_username || '—'}</span>
                                  {!!r.telegram_bot_username && (
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(r.telegram_bot_username, 'Ник бота скопирован')}
                                      title="Копировать ник бота"
                                      aria-label="Копировать ник бота"
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        lineHeight: 0,
                                        color: '#475569',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M9 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth="1.8" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.8" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td>
                                {(() => {
                                  const productsCount = Number(r.products_count || 0);
                                  const isEmptyProducts = productsCount <= 0;
                                  return (
                                    <div className="d-flex flex-column gap-1">
                                      <div
                                        className="fw-bold"
                                        style={{ color: isEmptyProducts ? '#dc2626' : '#15803d' }}
                                      >
                                        {productsCount.toLocaleString('ru-RU')}
                                      </div>
                                      <small
                                        className={isEmptyProducts ? 'fw-medium' : 'text-muted'}
                                        style={isEmptyProducts ? { color: '#dc2626' } : undefined}
                                      >
                                        {isEmptyProducts
                                          ? (language === 'uz' ? "Mahsulot yo'q" : 'Товаров нет')
                                          : (language === 'uz' ? "Mahsulotlar qo'shilgan" : 'Товары добавлены')}
                                      </small>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td>
                                <small className="text-muted">{formatDate(r.created_at)}</small>
                              </td>
                              <td>
                                {(() => {
                                  const currencyLabel = getCurrencyLabelByCode(r.currency_code || countryCurrency?.code);
                                  const checksCount = formatChecksCount(r.balance || 0, r.order_cost || 0, r.is_free_tier);
                                  return (
                                    <div className="sa-shop-balance-stack">
                                      <div className="sa-shop-balance-item is-main">
                                        <span className="sa-shop-balance-icon" aria-hidden="true">
                                          <i className="bi bi-wallet2" />
                                        </span>
                                        <span className="sa-shop-balance-label">
                                          {language === 'uz' ? 'Balans' : 'Баланс'}
                                        </span>
                                        <span className="sa-shop-balance-value">
                                          {formatBalanceAmount(r.balance || 0)} {currencyLabel}
                                        </span>
                                      </div>
                                      <div className="sa-shop-balance-item">
                                        <span className="sa-shop-balance-icon" aria-hidden="true">
                                          <i className="bi bi-receipt-cutoff" />
                                        </span>
                                        <span className="sa-shop-balance-label">
                                          {language === 'uz' ? 'Cheklar' : 'Чеки'}
                                        </span>
                                        <span className="sa-shop-balance-value">
                                          {checksCount} {language === 'uz' ? 'ta' : 'шт'}
                                        </span>
                                      </div>
                                      <div className="sa-shop-balance-item">
                                        <span className="sa-shop-balance-icon" aria-hidden="true">
                                          <i className="bi bi-coin" />
                                        </span>
                                        <span className="sa-shop-balance-label">
                                          {language === 'uz' ? '1 chek' : '1 чек'}
                                        </span>
                                        <span className="sa-shop-balance-value">
                                          {formatBalanceAmount(r.order_cost || 0)} {currencyLabel}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td>
                                <div className="fw-semibold">
                                  {formatBalanceAmount(r.service_fee || 0)} {getCurrencyLabelByCode(r.currency_code || countryCurrency?.code)}
                                </div>
                              </td>
                              <td>
                                <Badge
                                  className={`badge-custom ${r.is_free_tier ? 'bg-info bg-opacity-10 text-info' : 'bg-warning bg-opacity-10 text-warning'}`}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => toggleFreeTier(r.id, !r.is_free_tier)}
                                  title="Нажмите, чтобы изменить тариф"
                                >
                                  {r.is_free_tier ? 'Бесплатный' : 'Платный'}
                                </Badge>
                              </td>
                              <td>
                                {(() => {
                                  const mappedIssueCount = restaurantIssueCountMap[r.id];
                                  const issuesCount = Number.isFinite(mappedIssueCount)
                                    ? mappedIssueCount
                                    : getQuickRestaurantIssueCount(r);
                                  const isProblem = issuesCount > 0;
                                  return (
                                    <Button
                                      size="sm"
                                      variant={isProblem ? 'outline-danger' : 'outline-success'}
                                      className="d-inline-flex align-items-center gap-2"
                                      onClick={() => openRestaurantIssuesModal(r)}
                                      title={language === 'uz'
                                        ? "Telegram diagnostikasini ochish"
                                        : 'Открыть диагностику Telegram'}
                                    >
                                      <span>{issuesCount}</span>
                                      <span>{isProblem ? '⚠️' : '✅'}</span>
                                    </Button>
                                  );
                                })()}
                              </td>
                              <td>
                                <div className="d-flex align-items-center gap-2">
                                  <Badge className={`badge-custom sa-status-badge ${r.is_active ? 'sa-status-badge-active' : 'sa-status-badge-inactive'}`}>
                                    {r.is_active ? (language === 'uz' ? 'Faol' : 'Активен') : (language === 'uz' ? 'Nofaol' : 'Неактивен')}
                                  </Badge>
                                  <Form.Check
                                    type="switch"
                                    checked={r.is_active}
                                    onChange={() => handleToggleRestaurant(r)}
                                    className="custom-switch"
                                  />
                                </div>
                              </td>
                              <td className="text-end">
                                <div className="d-flex gap-2 justify-content-end text-nowrap">
                                  <Button
                                    variant="light"
                                    className="action-btn text-success"
                                    onClick={() => openTopupModal(r)}
                                    title={language === 'uz' ? 'Balans operatsiyalari' : 'Операции с балансом'}
                                  >
                                    💰
                                  </Button>
                                  <Button variant="light" className="action-btn text-primary" onClick={() => openRestaurantModal(r)} title="Редактировать">
                                    ✏️
                                  </Button>
                                  <Button
                                    variant="light"
                                    className="action-btn text-secondary restaurant-comment-action-btn"
                                    onClick={() => openRestaurantCommentModal(r)}
                                    title={getRestaurantCommentTooltip(r.admin_comment, r.admin_comment_checklist)}
                                  >
                                    📝
                                    {(String(r.admin_comment || '').trim() || normalizeRestaurantCommentChecklist(r.admin_comment_checklist).length > 0) && (
                                      <span className="restaurant-comment-indicator" aria-hidden="true" />
                                    )}
                                  </Button>
                                  <Button variant="light" className="action-btn text-info" onClick={() => openMessagesModal(r)} title="Шаблоны сообщений">
                                    💬
                                  </Button>
                                  <Button variant="light" className="action-btn text-danger" onClick={() => handleDeleteRestaurant(r.id)} title="Удалить">
                                    🗑️
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredRestaurants?.length === 0 && (
                            <tr><td colSpan="11" className="text-center py-5 text-muted">{t('saEmptyRestaurants')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={restaurantsPage}
                      total={filteredRestaurants.length}
                      limit={restaurantsLimit}
                      onPageChange={setRestaurantsPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => { setRestaurantsLimit(val); setRestaurantsPage(1); }}
                    />
                  </>
                )}
              </Tab>

              <Tab eventKey="global_products" title={renderSuperAdminSidebarTabTitle('global_products')}>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">
                    {language === 'uz' ? 'Global mahsulotlar katalogi' : 'Каталог глобальных товаров'}
                  </h5>
                  <div className="d-flex align-items-center gap-2 ms-auto">
                    <input
                      ref={globalProductsImportInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="d-none"
                      onChange={handleImportGlobalProductsFile}
                    />
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showGlobalProductsFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowGlobalProductsFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showGlobalProductsFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setShowGlobalProductsImportTemplateModal(true)}
                    >
                      {language === 'uz' ? 'Shablon' : 'Шаблон'}
                    </Button>
                    <Button
                      variant="outline-primary"
                      onClick={() => setShowGlobalProductsPasteModal(true)}
                      disabled={isImportingGlobalProductsExcel}
                    >
                      {isImportingGlobalProductsExcel
                        ? (language === 'uz' ? 'Import...' : 'Импорт...')
                        : (language === 'uz' ? 'Import / Paste' : 'Импорт / Вставка')}
                    </Button>
                    <Button className="btn-primary-custom" onClick={() => openGlobalProductModal()}>
                      {language === 'uz' ? "Global mahsulot qo'shish" : 'Добавить глобальный товар'}
                    </Button>
                  </div>
                </div>

                {showGlobalProductsFilterPanel && (
                  <Row className="mb-3 g-2 admin-products-filter-panel">
                    <Col lg={3}>
                      <Form.Control
                        type="search"
                        placeholder={language === 'uz' ? "Nomi bo'yicha qidirish" : 'Поиск по названию'}
                        value={globalProductsSearch}
                        onChange={(e) => setGlobalProductsSearch(e.target.value)}
                      />
                    </Col>
                    <Col lg={2}>
                      <Form.Control
                        placeholder={language === 'uz' ? 'Shtrix-kod bo‘yicha qidirish' : 'Поиск по штрихкоду'}
                        value={globalProductsBarcodeFilter}
                        onChange={(e) => setGlobalProductsBarcodeFilter(String(e.target.value || '').replace(/\D/g, '').slice(0, 120))}
                        inputMode="numeric"
                      />
                    </Col>
                    <Col lg={2}>
                      <Form.Select
                        value={globalProductsStatusFilter}
                        onChange={(e) => setGlobalProductsStatusFilter(e.target.value)}
                      >
                        <option value="active">{language === 'uz' ? 'Faqat faol' : 'Только активные'}</option>
                        <option value="all">{language === 'uz' ? 'Faol + o‘chirilgan' : 'Активные + отключенные'}</option>
                      </Form.Select>
                    </Col>
                    <Col lg={2}>
                      <Form.Select
                        value={globalProductsCategoryLevel1Filter}
                        onChange={(e) => {
                          setGlobalProductsCategoryLevel1Filter(e.target.value);
                          setGlobalProductsCategoryLevel2Filter('all');
                          setGlobalProductsCategoryLevel3Filter('all');
                        }}
                      >
                        <option value="all">{language === 'uz' ? 'Kategoriya' : 'Категория'}</option>
                        {globalProductsRootCategoryOptions.map((category) => (
                          <option key={`global-products-level1-filter-${category.id}`} value={String(category.id)}>
                            {category.name_ru || category.name_uz || `#${category.id}`}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col lg={2}>
                      <Form.Select
                        value={globalProductsCategoryLevel2Filter}
                        onChange={(e) => {
                          setGlobalProductsCategoryLevel2Filter(e.target.value);
                          setGlobalProductsCategoryLevel3Filter('all');
                        }}
                        disabled={globalProductsSubcategoryOptions.length === 0}
                      >
                        <option value="all">{language === 'uz' ? 'Subkategoriya' : 'Подкатегория'}</option>
                        {globalProductsSubcategoryOptions.map((category) => (
                          <option key={`global-products-level2-filter-${category.id}`} value={String(category.id)}>
                            {category.name_ru || category.name_uz || `#${category.id}`}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col lg={1}>
                      <Form.Select
                        value={globalProductsCategoryLevel3Filter}
                        onChange={(e) => setGlobalProductsCategoryLevel3Filter(e.target.value)}
                        disabled={globalProductsThirdCategoryOptions.length === 0}
                      >
                        <option value="all">{language === 'uz' ? '3-daraja' : '3-я кат.'}</option>
                        {globalProductsThirdCategoryOptions.map((category) => (
                          <option key={`global-products-level3-filter-${category.id}`} value={String(category.id)}>
                            {category.name_ru || category.name_uz || `#${category.id}`}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col lg={12}>
                      <div className="d-flex justify-content-end">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={resetGlobalProductsFilters}
                          disabled={!hasActiveGlobalProductsFilters}
                        >
                          {language === 'uz' ? 'Tozalash' : 'Сбросить'}
                        </Button>
                      </div>
                    </Col>
                  </Row>
                )}

                {globalProductsLoading ? (
                  <TableSkeleton
                    rows={8}
                    columns={9}
                    label={language === 'uz' ? "Global mahsulotlar yuklanmoqda" : 'Загрузка глобальных товаров'}
                  />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table align-middle">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>{language === 'uz' ? 'Rasm' : 'Фото'}</th>
                            <th>{language === 'uz' ? 'Nomi' : 'Название'}</th>
                            <th>{language === 'uz' ? 'Shtrix-kod' : 'Штрихкод'}</th>
                            <th>{language === 'uz' ? 'IKPU kodi' : 'Код ИКПУ'}</th>
                            <th>{language === 'uz' ? 'Tavsiya kategoriya' : 'Рекоменд. категория'}</th>
                            <th>{language === 'uz' ? 'Birlik' : 'Ед. изм.'}</th>
                            <th>{language === 'uz' ? 'Holat' : 'Статус'}</th>
                            <th className="text-end">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(globalProducts.items) && globalProducts.items.length > 0 ? (
                            globalProducts.items.map((item) => {
                              const imageUrl = item?.image_url
                                ? (String(item.image_url).startsWith('http')
                                  ? String(item.image_url)
                                  : `${API_URL.replace('/api', '')}${item.image_url}`)
                                : '';
                              const recommendedCategory = language === 'uz'
                                ? (item.recommended_category_name_uz || item.recommended_category_name_ru)
                                : (item.recommended_category_name_ru || item.recommended_category_name_uz);
                              return (
                                <tr key={`global-product-row-${item.id}`}>
                                  <td><span className="text-muted small">#{item.id}</span></td>
                                  <td>
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt={item.name_ru || 'global-product'}
                                        style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          width: '42px',
                                          height: '42px',
                                          borderRadius: '8px',
                                          border: '1px solid #e2e8f0',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: '#94a3b8',
                                          background: '#f8fafc'
                                        }}
                                      >
                                        📦
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <div className="fw-semibold">{item.name_ru || '-'}</div>
                                    <div className="small text-muted">{item.name_uz || '—'}</div>
                                  </td>
                                  <td>{item.barcode || '—'}</td>
                                  <td>{item.ikpu || '—'}</td>
                                  <td>{recommendedCategory || '—'}</td>
                                  <td>
                                    <div>{item.unit || 'шт'}</div>
                                    <div className="small text-muted">
                                      {Number.parseFloat(item.order_step) > 0 ? `${item.order_step}` : '—'}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="d-flex align-items-center gap-2">
                                      <Badge className={`badge-custom ${item.is_active === false ? 'bg-secondary bg-opacity-10 text-muted' : 'bg-success bg-opacity-10 text-success'}`}>
                                        {item.is_active === false
                                          ? (language === 'uz' ? "O'chirilgan" : 'Отключен')
                                          : (language === 'uz' ? 'Faol' : 'Активен')}
                                      </Badge>
                                      <Form.Check
                                        type="switch"
                                        checked={item.is_active !== false}
                                        onChange={() => handleToggleGlobalProductActive(item)}
                                        className="custom-switch"
                                      />
                                    </div>
                                  </td>
                                  <td className="text-end">
                                    <Button
                                      variant="light"
                                      className="action-btn text-primary"
                                      onClick={() => openGlobalProductModal(item)}
                                      title={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                    >
                                      ✏️
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="9" className="text-center py-5 text-muted">
                                {language === 'uz'
                                  ? "Global mahsulotlar hozircha yo'q"
                                  : 'Глобальные товары пока не добавлены'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={globalProductsPage}
                      total={globalProducts.total || 0}
                      limit={globalProductsLimit}
                      onPageChange={setGlobalProductsPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(value) => {
                        setGlobalProductsLimit(value);
                        setGlobalProductsPage(1);
                      }}
                    />
                  </>
                )}
              </Tab>

              {/* Activity Types Tab */}
              <Tab eventKey="activity_types" title={renderSuperAdminSidebarTabTitle('activity_types')}>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h5 className="fw-bold mb-0">Справочник видов деятельности</h5>
                  <div className="d-flex align-items-center gap-2">
                    <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">
                      Всего: {activityTypes.length}
                    </Badge>
                    <Button className="btn-primary-custom" onClick={handleAddActivityType}>
                      {language === 'uz' ? "Qo'shish" : 'Добавить'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showActivityTypesFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowActivityTypesFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showActivityTypesFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                  </div>
                </div>

                {showActivityTypesFilterPanel && (
                  <Row className="mb-3 g-2 admin-products-filter-panel">
                    <Col lg={5}>
                      <Form.Control
                        type="search"
                        placeholder={language === 'uz' ? 'Nomi bo‘yicha qidirish' : 'Поиск по названию'}
                        value={activityTypeSearchFilter}
                        onChange={(e) => setActivityTypeSearchFilter(e.target.value)}
                      />
                    </Col>
                    <Col lg={3}>
                      <Form.Select
                        value={activityTypeVisibilityFilter}
                        onChange={(e) => setActivityTypeVisibilityFilter(e.target.value)}
                      >
                        <option value="all">{language === 'uz' ? 'Barcha statuslar' : 'Все статусы'}</option>
                        <option value="visible">{language === 'uz' ? 'Ko‘rinadi' : 'Показывается'}</option>
                        <option value="hidden">{language === 'uz' ? 'Yashirilgan' : 'Скрыт'}</option>
                      </Form.Select>
                    </Col>
                    <Col lg={2}>
                      <Button
                        variant="outline-secondary"
                        className="w-100"
                        onClick={resetActivityTypeFilters}
                        disabled={!hasActiveActivityTypeFilters}
                      >
                        {language === 'uz' ? 'Tozalash' : 'Сбросить'}
                      </Button>
                    </Col>
                  </Row>
                )}

                {activityTypesLoading ? (
                  <TableSkeleton rows={6} columns={6} label="Загрузка видов деятельности" />
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Название</th>
                          <th>Порядок</th>
                          <th>Статус</th>
                          <th>Магазинов</th>
                          <th className="text-end">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredActivityTypes.map((item) => (
                          <tr key={item.id}>
                            <td><span className="text-muted small">#{item.id}</span></td>
                            <td className="fw-semibold">{item.name}</td>
                            <td>{item.sort_order ?? 0}</td>
                            <td>
                              <Badge className={`badge-custom ${item.is_visible ? 'bg-success bg-opacity-10 text-success' : 'bg-secondary bg-opacity-10 text-muted'}`}>
                                {item.is_visible ? 'Показывается' : 'Скрыт'}
                              </Badge>
                            </td>
                            <td>
                              <Badge className="badge-custom bg-info bg-opacity-10 text-info">
                                {item.restaurants_count || 0}
                              </Badge>
                            </td>
                            <td className="text-end">
                              <div className="d-flex gap-2 justify-content-end">
                                <Button variant="light" className="action-btn text-primary" onClick={() => handleEditActivityType(item)}>
                                  ✏️
                                </Button>
                                <Button
                                  variant="light"
                                  className={`action-btn ${item.is_visible ? 'text-warning' : 'text-success'}`}
                                  onClick={() => handleToggleActivityTypeVisibility(item)}
                                  title={item.is_visible ? 'Скрыть' : 'Показать'}
                                >
                                  {item.is_visible ? '👁️‍🗨️' : '👁️'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredActivityTypes.length === 0 && (
                          <tr><td colSpan="6" className="text-center py-5 text-muted">Нет видов деятельности</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Tab>

              <Tab eventKey="reservation_templates" title={renderSuperAdminSidebarTabTitle('reservation_templates')}>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h5 className="fw-bold mb-0">{language === 'uz' ? "Bron uchun element shablonlari" : 'Шаблоны элементов для бронирования'}</h5>
                    <small className="text-muted">
                      {language === 'uz'
                        ? "Element rasmini PNG yoki SVG fayl orqali yuklang. URL kiritish talab qilinmaydi."
                        : 'Загрузка через PNG или SVG файл. Вставка URL не требуется.'}
                    </small>
                  </div>
                  <Button className="btn-primary-custom" onClick={() => openReservationTemplateModal()}>
                    + {language === 'uz' ? "Shablon qo'shish" : 'Добавить шаблон'}
                  </Button>
                </div>

                {reservationTemplatesLoading ? (
                  <TableSkeleton rows={6} columns={10} label={language === 'uz' ? "Element shablonlari yuklanmoqda" : 'Загрузка шаблонов элементов'} />
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>{language === 'uz' ? 'Rasm' : 'Фото'}</th>
                          <th>{language === 'uz' ? 'Nomi' : 'Название'}</th>
                          <th>{language === 'uz' ? "Sig'im" : 'Вместимость'}</th>
                          <th>{language === 'uz' ? 'Shakl' : 'Форма'}</th>
                          <th>{language === 'uz' ? 'Kategoriya' : 'Категория'}</th>
                          <th>{language === 'uz' ? 'Faoliyat turi' : 'Вид деятельности'}</th>
                          <th>{language === 'uz' ? "O'lcham" : 'Размер'}</th>
                          <th>{language === 'uz' ? 'Turi' : 'Тип'}</th>
                          <th className="text-end">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reservationTemplates.map((template) => {
                          const shapeLabel = RESERVATION_TEMPLATE_SHAPE_OPTIONS.find((item) => item.value === template.shape);
                          const categoryLabel = RESERVATION_TEMPLATE_CATEGORY_OPTIONS.find((item) => item.value === String(template.furniture_category || 'tables_chairs'));
                          const imageSrc = String(template.image_url || '').trim();
                          const isSystem = template.is_system === true || template.is_system === 'true';
                          return (
                            <tr key={template.id}>
                              <td><span className="text-muted small">#{template.id}</span></td>
                              <td>
                                {imageSrc ? (
                                  <img
                                    src={resolveAdPreviewImageUrl(imageSrc)}
                                    alt={template.name}
                                    style={{ width: 44, height: 34, objectFit: 'contain', borderRadius: 8, background: '#fff' }}
                                  />
                                ) : '—'}
                              </td>
                              <td className="fw-semibold">{template.name}</td>
                              <td>{template.seats_count || 0}</td>
                              <td>{shapeLabel ? (language === 'uz' ? shapeLabel.uz : shapeLabel.ru) : (template.shape || '—')}</td>
                              <td>{categoryLabel ? (language === 'uz' ? categoryLabel.uz : categoryLabel.ru) : '—'}</td>
                              <td>{template.activity_type_name || (language === 'uz' ? 'Barchasi uchun' : 'Для всех')}</td>
                              <td>{Number.parseFloat(template.width || 0).toFixed(1)} × {Number.parseFloat(template.height || 0).toFixed(1)}</td>
                              <td>
                                <Badge className={`badge-custom ${isSystem ? 'bg-secondary bg-opacity-10 text-muted' : 'bg-success bg-opacity-10 text-success'}`}>
                                  {isSystem
                                    ? (language === 'uz' ? 'Tizim' : 'Системный')
                                    : (language === 'uz' ? 'Maxsus' : 'Пользовательский')}
                                </Badge>
                                {Number(template.tables_count || 0) > 0 && (
                                  <div className="small text-muted mt-1">
                                    {language === 'uz'
                                      ? `Stollarda: ${template.tables_count}`
                                      : `Используется в столах: ${template.tables_count}`}
                                  </div>
                                )}
                              </td>
                              <td className="text-end">
                                <div className="d-inline-flex gap-2">
                                  <Button
                                    variant="light"
                                    className="action-btn text-primary"
                                    onClick={() => openReservationTemplateModal(template)}
                                    title={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                  >
                                    ✏️
                                  </Button>
                                  {!isSystem && (
                                    <>
                                      <Button
                                        variant="light"
                                        className="action-btn text-danger"
                                        disabled={deletingReservationTemplateId === template.id}
                                        onClick={() => deleteReservationTemplate(template)}
                                        title={language === 'uz' ? "O'chirish" : 'Удалить'}
                                      >
                                        🗑️
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {!reservationTemplates.length && (
                          <tr><td colSpan="10" className="text-center py-5 text-muted">{language === 'uz' ? "Element shablonlari yo'q" : 'Шаблоны элементов пока не добавлены'}</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Tab>

              <Tab eventKey="help_instructions" title={renderSuperAdminSidebarTabTitle('help_instructions')}>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h5 className="fw-bold mb-0">
                    {language === 'uz' ? "Telegram va admin yo'riqnomalari" : 'Инструкции для Telegram и web-панели'}
                  </h5>
                  <div className="d-flex gap-2">
                    <Button className="btn-primary-custom" onClick={openCreateHelpInstructionModal}>
                      + {language === 'uz' ? "Maydon qo'shish" : 'Добавить поле'}
                    </Button>
                  </div>
                </div>

                {helpInstructionsLoading ? (
                  <TableSkeleton rows={8} columns={6} label={language === 'uz' ? "Yo'riqnomalar yuklanmoqda" : 'Загрузка инструкций'} />
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>RU</th>
                          <th>UZ</th>
                          <th>{language === 'uz' ? 'Video' : 'Видео'}</th>
                          <th>{language === 'uz' ? 'Tartib' : 'Порядок'}</th>
                          <th className="text-end">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {helpInstructions.map((item) => (
                          <tr key={item.id}>
                            <td><span className="text-muted small">#{item.id}</span></td>
                            <td className="fw-semibold">{item.title_ru || '—'}</td>
                            <td>{item.title_uz || '—'}</td>
                            <td style={{ maxWidth: 320 }}>
                              {item.youtube_url ? (
                                (() => {
                                  const thumbnailUrl = getYouTubeThumbnailUrl(item.youtube_url);
                                  return (
                                    <div className="admin-help-item-layout admin-help-item-layout--table">
                                      <a
                                        href={item.youtube_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="admin-help-thumb-link"
                                        onClick={() => incrementHelpInstructionViews(item.id)}
                                        aria-label={language === 'uz' ? "Videoni ochish" : 'Открыть видео'}
                                      >
                                        <div className={`admin-help-item-thumb-shell admin-help-item-thumb-shell--table${thumbnailUrl ? '' : ' is-empty'}`} aria-hidden="true">
                                          {thumbnailUrl ? (
                                            <>
                                              <img
                                                src={thumbnailUrl}
                                                alt=""
                                                loading="lazy"
                                                className="admin-help-item-thumb"
                                              />
                                              <span className="admin-help-item-thumb-badge">
                                                <i className="bi bi-play-fill" aria-hidden="true"></i>
                                                <span>YouTube</span>
                                              </span>
                                            </>
                                          ) : (
                                            <div className="admin-help-item-thumb-placeholder">
                                              <i className="bi bi-play-btn-fill" aria-hidden="true"></i>
                                            </div>
                                          )}
                                        </div>
                                      </a>
                                      <div className="admin-help-item-copy">
                                        <div className="small text-muted admin-help-item-meta">
                                          <span className="admin-help-item-views">
                                            <i className="bi bi-eye-fill" aria-hidden="true"></i>
                                            <span>{formatHelpInstructionViews(item.view_count, language)}</span>
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="text-muted small">
                                  {language === 'uz' ? "Video qo'shilmagan" : 'Видео не добавлено'}
                                </span>
                              )}
                            </td>
                            <td>{item.sort_order ?? 0}</td>
                            <td className="text-end">
                              <div className="d-inline-flex gap-2">
                                <Button
                                  variant="light"
                                  className="action-btn text-primary"
                                  onClick={() => handleEditHelpInstruction(item)}
                                  title={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                >
                                  ✏️
                                </Button>
                                <Button
                                  variant="light"
                                  className="action-btn text-danger"
                                  disabled={deletingHelpInstructionId === item.id || item.is_default}
                                  onClick={() => handleDeleteHelpInstruction(item)}
                                  title={item.is_default
                                    ? (language === 'uz' ? "Sistem yo'riqnoma o'chirilmaydi" : 'Системную инструкцию удалить нельзя')
                                    : (language === 'uz' ? "O'chirish" : 'Удалить')}
                                >
                                  🗑️
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {helpInstructions.length === 0 && (
                          <tr>
                            <td colSpan="6" className="text-center py-5 text-muted">
                              {language === 'uz' ? "Yo'riqnomalar hali qo'shilmagan" : 'Инструкции пока не добавлены'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Tab>

              <Tab eventKey="broadcast" title={renderSuperAdminSidebarTabTitle('broadcast')}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0">{language === 'uz' ? 'Superadmin xabar tarqatish' : 'Рассылка от суперадмина'}</h5>
                  <div className="d-flex align-items-center gap-2">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className="admin-filter-icon-btn"
                      onClick={loadSuperadminBroadcastHistory}
                      disabled={superadminBroadcastHistoryLoading}
                      title={language === 'uz' ? 'Tarixni yangilash' : 'Обновить историю'}
                    >
                      <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
                    </Button>
                    <Button className="btn-primary-custom" onClick={() => setShowSuperadminBroadcastModal(true)}>
                      {language === 'uz' ? 'Yangi xabar' : 'Новая рассылка'}
                    </Button>
                  </div>
                </div>

                {superadminBroadcastResult ? (
                  <Card className="admin-card admin-section-panel sa-broadcast-result-card mb-3">
                    <Card.Body className="py-3">
                      <h6 className="fw-bold mb-2">{language === 'uz' ? 'Oxirgi yuborish natijasi' : 'Результат последней отправки'}</h6>
                      <div className="d-flex flex-wrap gap-3 small">
                        <div>{language === 'uz' ? 'Jami' : 'Всего'}: <strong>{Number(superadminBroadcastResult.total || 0)}</strong></div>
                        <div>{language === 'uz' ? 'Yuborildi' : 'Отправлено'}: <strong>{Number(superadminBroadcastResult.sent || 0)}</strong></div>
                        <div>{language === 'uz' ? 'Xatolar' : 'Ошибки'}: <strong>{Number(superadminBroadcastResult.failed || 0)}</strong></div>
                        <div>{language === 'uz' ? 'Operatorlar' : 'Операторы'}: <strong>{Number(superadminBroadcastResult?.role_stats?.operator || 0)}</strong></div>
                        <div>{language === 'uz' ? 'Mijozlar' : 'Клиенты'}: <strong>{Number(superadminBroadcastResult?.role_stats?.customer || 0)}</strong></div>
                      </div>
                    </Card.Body>
                  </Card>
                ) : null}

                {superadminBroadcastHistoryLoading ? (
                  <TableSkeleton rows={6} columns={7} label={language === 'uz' ? 'Yuborish tarixi yuklanmoqda' : 'Загрузка истории рассылок'} />
                ) : (
                  <div className="admin-table-container sa-broadcast-history-table-container">
                    <Table responsive hover className="admin-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>{language === 'uz' ? 'Sana' : 'Дата'}</th>
                          <th>{language === 'uz' ? 'Yuborgan' : 'Отправитель'}</th>
                          <th>{language === 'uz' ? 'Rollar' : 'Роли'}</th>
                          <th>{language === 'uz' ? 'Xabar' : 'Сообщение'}</th>
                          <th>{language === 'uz' ? 'Media' : 'Медиа'}</th>
                          <th>{language === 'uz' ? 'Yuborildi' : 'Отправлено'}</th>
                          <th>{language === 'uz' ? 'Xatolar' : 'Ошибки'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {superadminBroadcastHistory.map((item) => (
                          <tr key={`sa-broadcast-history-${item.id}`}>
                            <td><small className="text-muted">{formatDate(item.created_at)}</small></td>
                            <td>
                              <div className="fw-semibold">{item.sender_name || '-'}</div>
                              {item.sender_username ? (
                                <div className="small text-muted">@{item.sender_username}</div>
                              ) : null}
                            </td>
                            <td>
                              <div className="d-flex flex-wrap gap-1">
                                {Array.isArray(item.roles) && item.roles.length ? item.roles.map((role) => (
                                  <Badge key={`sa-broadcast-role-${item.id}-${role}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                    {getSuperadminBroadcastRoleLabel(role)}
                                  </Badge>
                                )) : (
                                  <span className="text-muted small">-</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="sa-broadcast-history-message" title={String(item.message || '')}>
                                {item.message || '-'}
                              </div>
                            </td>
                            <td>
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                {item.image_url ? (
                                  <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">{language === 'uz' ? 'Rasm' : 'Фото'}</Badge>
                                ) : null}
                                {item.video_url ? (
                                  <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">{language === 'uz' ? 'Video' : 'Видео'}</Badge>
                                ) : null}
                                {!item.image_url && !item.video_url ? (
                                  <span className="text-muted small">-</span>
                                ) : null}
                                {(item.image_url || item.video_url) ? (
                                  <a
                                    href={item.image_url || item.video_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="small text-decoration-none"
                                  >
                                    {language === 'uz' ? "Ko'rish" : 'Открыть'}
                                  </a>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <div className="fw-semibold">
                                {Number(item.sent || 0)} / {Number(item.total || 0)}
                              </div>
                              <div className="small text-muted">
                                {language === 'uz' ? 'Operatorlar' : 'Операторы'}: {Number(item?.role_stats?.operator || 0)}, {language === 'uz' ? 'Mijozlar' : 'Клиенты'}: {Number(item?.role_stats?.customer || 0)}
                              </div>
                            </td>
                            <td className="fw-semibold">{Number(item.failed || 0)}</td>
                          </tr>
                        ))}
                        {superadminBroadcastHistory.length === 0 && (
                          <tr>
                            <td colSpan="7" className="text-center py-5 text-muted">
                              {language === 'uz' ? "Tarixda yozuvlar yo'q" : 'В истории пока нет записей'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}

                <Modal
                  show={showSuperadminBroadcastModal}
                  onHide={() => {
                    if (superadminBroadcastSending || superadminBroadcastUploading) return;
                    setShowSuperadminBroadcastModal(false);
                  }}
                  centered
                  className="admin-modal sa-broadcast-modal"
                >
                  <Modal.Header closeButton>
                    <Modal.Title>{language === 'uz' ? 'Xabar tarqatish' : 'Новая рассылка'}</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">{language === 'uz' ? 'Qabul qiluvchi rollar' : 'Роли получателей'}</Form.Label>
                      <div className="d-flex gap-3 flex-wrap">
                        <Form.Check
                          type="checkbox"
                          id="sa-broadcast-modal-role-customer"
                          label={language === 'uz' ? 'Mijozlar' : 'Клиенты'}
                          checked={superadminBroadcastForm.roles.includes('customer')}
                          onChange={() => handleSuperadminBroadcastRoleToggle('customer')}
                        />
                        <Form.Check
                          type="checkbox"
                          id="sa-broadcast-modal-role-operator"
                          label={language === 'uz' ? 'Operatorlar' : 'Операторы'}
                          checked={superadminBroadcastForm.roles.includes('operator')}
                          onChange={() => handleSuperadminBroadcastRoleToggle('operator')}
                        />
                      </div>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">{language === 'uz' ? 'Xabar matni' : 'Текст сообщения'}</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={6}
                        value={superadminBroadcastForm.message}
                        onChange={(e) => setSuperadminBroadcastForm((prev) => ({ ...prev, message: e.target.value }))}
                        placeholder={language === 'uz' ? 'Xabar matnini kiriting...' : 'Введите текст рассылки...'}
                      />
                    </Form.Group>

                    <Form.Group className="mb-1">
                      <Form.Label className="fw-semibold">{language === 'uz' ? 'Media (ixtiyoriy)' : 'Медиа (необязательно)'}</Form.Label>
                      <div
                        className={`sa-broadcast-media-slot${superadminBroadcastForm.image_url || superadminBroadcastForm.video_url ? ' is-filled' : ''}${superadminBroadcastUploading ? ' is-uploading' : ''}`}
                        role="button"
                        tabIndex={superadminBroadcastUploading || superadminBroadcastSending ? -1 : 0}
                        onClick={() => {
                          if (superadminBroadcastUploading || superadminBroadcastSending) return;
                          superadminBroadcastFileInputRef.current?.click();
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          if (superadminBroadcastUploading || superadminBroadcastSending) return;
                          superadminBroadcastFileInputRef.current?.click();
                        }}
                      >
                        <Form.Control
                          ref={superadminBroadcastFileInputRef}
                          type="file"
                          className="d-none"
                          accept="image/*,video/*"
                          onChange={handleSuperadminBroadcastFileInputChange}
                          disabled={superadminBroadcastUploading || superadminBroadcastSending}
                        />
                        {superadminBroadcastForm.image_url ? (
                          <img
                            src={superadminBroadcastForm.image_url}
                            alt={language === 'uz' ? 'Tanlangan rasm' : 'Выбранное фото'}
                            className="sa-broadcast-media-preview"
                          />
                        ) : superadminBroadcastForm.video_url ? (
                          <video
                            src={superadminBroadcastForm.video_url}
                            className="sa-broadcast-media-preview"
                            controls
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="sa-broadcast-media-placeholder">
                            <i className="bi bi-image" aria-hidden="true"></i>
                            <span>{language === 'uz' ? 'Fayl tanlanmagan' : 'Файл не выбран'}</span>
                          </div>
                        )}
                        <div className="sa-broadcast-media-hover-text">
                          {superadminBroadcastUploading
                            ? (language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...')
                            : (language === 'uz' ? 'Faylni tanlash' : 'Выбрать файл')}
                        </div>
                        {(superadminBroadcastForm.image_url || superadminBroadcastForm.video_url) ? (
                          <button
                            type="button"
                            className="sa-broadcast-media-clear-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleClearSuperadminBroadcastMedia();
                            }}
                            title={language === 'uz' ? "Media o'chirish" : 'Удалить медиа'}
                            aria-label={language === 'uz' ? "Media o'chirish" : 'Удалить медиа'}
                          >
                            X
                          </button>
                        ) : null}
                      </div>
                      {(superadminBroadcastForm.image_url || superadminBroadcastForm.video_url) && (
                        <div className="small text-muted mt-2 text-break">
                          {superadminBroadcastForm.image_url || superadminBroadcastForm.video_url}
                        </div>
                      )}
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setShowSuperadminBroadcastModal(false)}
                      disabled={superadminBroadcastSending || superadminBroadcastUploading}
                    >
                      {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
                    </Button>
                    <Button
                      className="btn-primary-custom"
                      onClick={sendSuperadminBroadcast}
                      disabled={superadminBroadcastSending || superadminBroadcastUploading || !String(superadminBroadcastForm.message || '').trim()}
                    >
                      {superadminBroadcastSending
                        ? (language === 'uz' ? "Yuborilmoqda..." : 'Отправка...')
                        : (language === 'uz' ? 'Yuborish' : 'Отправить')}
                    </Button>
                  </Modal.Footer>
                </Modal>
              </Tab>

              {/* Operators Tab */}
              <Tab eventKey="operators" title={renderSuperAdminSidebarTabTitle('operators')}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">{t('saManageOperators')}</h5>
                  <div className="d-flex align-items-center gap-2">
                    {isHiddenOpsTelemetryEnabled && (
                      <Badge bg="dark" className="fw-medium">
                        hidden telemetry: {formatHiddenOpsTimer(hiddenOpsTelemetrySecondsLeft)}
                      </Badge>
                    )}
                    <div className="d-none d-lg-flex align-items-center gap-2">
                      <Button
                        type="button"
                        variant="outline-secondary"
                        className={`admin-filter-icon-btn${showOperatorsFilterPanel ? ' is-active' : ''}`}
                        onClick={() => setShowOperatorsFilterPanel((prev) => !prev)}
                        title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                        aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                        aria-expanded={showOperatorsFilterPanel}
                      >
                        <FilterIcon />
                      </Button>
                      <Button className="btn-primary-custom" onClick={() => openOperatorModal()}>
                        {t('saAddOperator')}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="d-flex d-lg-none gap-2 align-items-center mb-3">
                  <Button variant="outline-secondary" className="btn-mobile-filter" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> Фильтры
                  </Button>
                  <Button className="btn-primary-custom ms-auto" onClick={() => openOperatorModal()}>
                    <span className="d-none d-sm-inline">{t('saAddOperator')}</span>
                    <span className="d-sm-none">Добавить</span>
                  </Button>
                </div>

                {showOperatorsFilterPanel && (
                  <div className="d-none d-lg-flex gap-2 flex-wrap align-items-center mb-3">
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={operatorRoleFilter}
                      onChange={(e) => { setOperatorRoleFilter(e.target.value); setOperatorsPage(1); }}
                    >
                      <option value="">{t('saAllRoles')}</option>
                      <option value="operator">{t('saRoleOperator')}</option>
                      <option value="superadmin">{t('saRoleSuperadmin')}</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={operatorStatusFilter}
                      onChange={(e) => { setOperatorStatusFilter(e.target.value); setOperatorsPage(1); }}
                    >
                      <option value="">{t('saAllStatuses')}</option>
                      <option value="active">{t('saStatusActive')}</option>
                      <option value="inactive">{t('saStatusInactive')}</option>
                    </Form.Select>
                    <SearchableRestaurantFilter
                      t={t}
                      width="220px"
                      value={operatorRestaurantFilter}
                      restaurants={operatorRestaurantOptions}
                      searchValue={operatorRestaurantSearch}
                      onSearchChange={setOperatorRestaurantSearch}
                      onChange={(nextValue) => {
                        setOperatorRestaurantFilter(nextValue);
                        setOperatorRestaurantSearch('');
                        setOperatorsPage(1);
                      }}
                    />
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      placeholder={t('saSearchNamePhone')}
                      style={{ width: '220px' }}
                      value={operatorSearch}
                      onChange={(e) => { setOperatorSearch(e.target.value); setOperatorsPage(1); }}
                    />
                  </div>
                )}

                {isHiddenOpsTelemetryEnabled && (
                  <div className="d-flex gap-2 flex-wrap align-items-center mb-3 p-2 rounded border bg-light">
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      placeholder="IP contains..."
                      style={{ width: '180px' }}
                      value={operatorTelemetryFilter.ip}
                      onChange={(e) => setOperatorTelemetryFilter((prev) => ({ ...prev, ip: e.target.value }))}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={operatorTelemetryFilter.browser}
                      onChange={(e) => setOperatorTelemetryFilter((prev) => ({ ...prev, browser: e.target.value }))}
                    >
                      <option value="">All browsers</option>
                      {operatorBrowserFilterOptions.map((browser) => (
                        <option key={browser} value={browser}>{browser}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={operatorTelemetryFilter.os}
                      onChange={(e) => setOperatorTelemetryFilter((prev) => ({ ...prev, os: e.target.value }))}
                    >
                      <option value="">All OS</option>
                      {operatorOsFilterOptions.map((osName) => (
                        <option key={osName} value={osName}>{osName}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={operatorTelemetryFilter.device}
                      onChange={(e) => setOperatorTelemetryFilter((prev) => ({ ...prev, device: e.target.value }))}
                    >
                      <option value="">All devices</option>
                      {operatorDeviceFilterOptions.map((deviceType) => (
                        <option key={deviceType} value={deviceType}>{deviceType}</option>
                      ))}
                    </Form.Select>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setOperatorTelemetryFilter({ ip: '', browser: '', os: '', device: '' })}
                    >
                      Reset
                    </Button>
                  </div>
                )}

                {loading ? (
                  <TableSkeleton rows={7} columns={isHiddenOpsTelemetryEnabled ? 13 : 8} label="Загрузка операторов" />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>{t('saTableLogin')}</th>
                            <th>{t('saTableFio')}</th>
                            <th>{t('saTablePhone')}</th>
                            <th>{t('saTableRole')}</th>
                            <th>{t('saRestaurantsCount')}</th>
                            {isHiddenOpsTelemetryEnabled && (
                              <>
                                <th>Last Activity</th>
                                <th>Device / OS</th>
                                <th>Browser</th>
                                <th>IP</th>
                                <th>Geo</th>
                              </>
                            )}
                            <th>{t('saTableStatus')}</th>
                            <th className="text-end">{t('saTableActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleOperatorsRows?.map(op => (
                            <tr key={op.id}>
                              <td><span className="text-muted small">#{op.id}</span></td>
                              <td><strong>{op.username}</strong></td>
                              <td>{op.full_name || '-'}</td>
                              <td><small>{op.phone || '-'}</small></td>
                              <td>
                                <Badge className={`badge-custom sa-role-badge ${op.role === 'superadmin' ? 'sa-role-badge-superadmin' : 'sa-role-badge-operator'}`}>
                                  {op.role === 'superadmin' ? 'Супер-админ' : 'Оператор'}
                                </Badge>
                              </td>
                              <td>
                                {Array.isArray(op.restaurants) && op.restaurants.length > 0 ? (
                                  <Button
                                    size="sm"
                                    variant="light"
                                    className="sa-operator-stores-btn"
                                    onClick={() => openOperatorStoresModal(op)}
                                  >
                                    <span className="sa-operator-stores-btn-label">
                                      {language === 'uz' ? "Do'konlar" : 'Магазины'}
                                    </span>
                                    <span className="sa-operator-stores-btn-count">{op.restaurants.length}</span>
                                  </Button>
                                ) : (
                                  <small className="text-muted">-</small>
                                )}
                              </td>
                              {isHiddenOpsTelemetryEnabled && (
                                <>
                                  <td><small className="text-muted">{formatDate(op.last_activity_at)}</small></td>
                                  <td><small>{formatTelemetryDeviceLabel(op)}</small></td>
                                  <td><small>{formatTelemetryBrowserLabel(op)}</small></td>
                                  <td><small>{op.last_ip_address || '-'}</small></td>
                                  <td><small>{formatTelemetryGeoLabel(op)}</small></td>
                                </>
                              )}
                              <td>
                                <Badge className={`badge-custom sa-status-badge ${op.is_active ? 'sa-status-badge-active' : 'sa-status-badge-inactive'}`}>
                                  {op.is_active ? (language === 'uz' ? 'Faol' : 'Активен') : (language === 'uz' ? 'Nofaol' : 'Неактивен')}
                                </Badge>
                              </td>
                              <td className="text-end">
                                <div className="d-flex gap-2 justify-content-end">
                                  <Button variant="light" className="action-btn text-primary" onClick={() => openOperatorModal(op)}>
                                    ✏️
                                  </Button>
                                  {op.role !== 'superadmin' && (
                                    <Button variant="light" className="action-btn text-danger" onClick={() => handleDeleteOperator(op.id)}>
                                      🗑️
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {visibleOperatorsRows?.length === 0 && (
                            <tr><td colSpan={isHiddenOpsTelemetryEnabled ? 13 : 8} className="text-center py-5 text-muted">{t('saEmptyOperators')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={operatorsPage}
                      total={operators.total}
                      limit={operatorsLimit}
                      onPageChange={setOperatorsPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => { setOperatorsLimit(val); setOperatorsPage(1); }}
                    />
                  </>
                )}
              </Tab>

              {/* Customers Tab */}
              <Tab eventKey="customers" title={renderSuperAdminSidebarTabTitle('customers')}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">
                    {t('saListCustomers')} ({isHiddenOpsTelemetryEnabled ? visibleCustomersRows.length : customers.total})
                  </h5>
                  <Button variant="outline-secondary" className="btn-mobile-filter d-lg-none ms-auto" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> Фильтры
                  </Button>
                  <div className="d-none d-lg-flex align-items-center gap-2">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showCustomersFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowCustomersFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showCustomersFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                  </div>
                </div>

                {showCustomersFilterPanel && (
                  <div className="d-none d-lg-flex gap-2 flex-wrap align-items-center mb-3">
                    <SearchableRestaurantFilter
                      t={t}
                      width="220px"
                      value={customerRestaurantFilter}
                      restaurants={customerRestaurantOptions}
                      searchValue={customerRestaurantSearch}
                      onSearchChange={setCustomerRestaurantSearch}
                      onChange={(nextValue) => {
                        setCustomerRestaurantFilter(nextValue);
                        setCustomerRestaurantSearch('');
                        setCustomerPage(1);
                      }}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={customerStatusFilter}
                      onChange={(e) => { setCustomerStatusFilter(e.target.value); setCustomerPage(1); }}
                    >
                      <option value="">{t('saAllStatuses')}</option>
                      <option value="active">{t('saStatusActive')}</option>
                      <option value="blocked">{t('saStatusBlocked')}</option>
                    </Form.Select>
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      placeholder={t('saSearch')}
                      style={{ width: '200px' }}
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerPage(1); }}
                    />
                  </div>
                )}

                {isHiddenOpsTelemetryEnabled && (
                  <div className="d-flex gap-2 flex-wrap align-items-center mb-3 p-2 rounded border bg-light">
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      placeholder="IP contains..."
                      style={{ width: '180px' }}
                      value={customerTelemetryFilter.ip}
                      onChange={(e) => setCustomerTelemetryFilter((prev) => ({ ...prev, ip: e.target.value }))}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={customerTelemetryFilter.browser}
                      onChange={(e) => setCustomerTelemetryFilter((prev) => ({ ...prev, browser: e.target.value }))}
                    >
                      <option value="">All browsers</option>
                      {customerBrowserFilterOptions.map((browser) => (
                        <option key={browser} value={browser}>{browser}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={customerTelemetryFilter.os}
                      onChange={(e) => setCustomerTelemetryFilter((prev) => ({ ...prev, os: e.target.value }))}
                    >
                      <option value="">All OS</option>
                      {customerOsFilterOptions.map((osName) => (
                        <option key={osName} value={osName}>{osName}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={customerTelemetryFilter.device}
                      onChange={(e) => setCustomerTelemetryFilter((prev) => ({ ...prev, device: e.target.value }))}
                    >
                      <option value="">All devices</option>
                      {customerDeviceFilterOptions.map((deviceType) => (
                        <option key={deviceType} value={deviceType}>{deviceType}</option>
                      ))}
                    </Form.Select>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setCustomerTelemetryFilter({ ip: '', browser: '', os: '', device: '' })}
                    >
                      Reset
                    </Button>
                  </div>
                )}

                {loading ? (
                  <TableSkeleton rows={7} columns={isHiddenOpsTelemetryEnabled ? 14 : 9} label="Загрузка клиентов" />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>{t('saTableUser')}</th>
                            <th>{t('saTablePhone')}</th>
                            <th>Telegram</th>
                            <th>{t('saTableShop')}</th>
                            <th>{t('saTableOrders')}</th>
                            <th>{t('saTableSum')}</th>
                            <th>{language === 'uz' ? "Ro'yxatdan o'tgan" : 'Дата регистрации'}</th>
                            {isHiddenOpsTelemetryEnabled && (
                              <>
                                <th>Last Activity</th>
                                <th>Device / OS</th>
                                <th>Browser</th>
                                <th>IP</th>
                                <th>Geo</th>
                              </>
                            )}
                            <th>{t('saTableStatus')}</th>
                            <th className="text-end">{t('saTableActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleCustomersRows?.map(c => {
                            const isBlocked = c.is_blocked || !c.user_is_active;
                            return (
                              <tr key={c.association_id} className={isBlocked ? 'bg-light' : ''}>
                                <td>
                                  <div className="fw-bold">{c.full_name || c.username}</div>
                                  <div className="text-muted small">@{c.username?.replace(/^@/, '') || 'n/a'}</div>
                                </td>
                                <td><small>{c.phone || '-'}</small></td>
                                <td>{c.telegram_id ? <Badge className="badge-custom bg-info bg-opacity-10 text-info">{c.telegram_id}</Badge> : '-'}</td>
                                <td>
                                  <Badge className="badge-custom sa-store-badge">
                                    {c.restaurant_name}
                                  </Badge>
                                </td>
                                <td>
                                  <Badge className={`badge-custom ${parseInt(c.orders_count) > 0 ? 'bg-success bg-opacity-10 text-success' : 'bg-secondary bg-opacity-10 text-muted'}`}>
                                    {c.orders_count}
                                  </Badge>
                                </td>
                                <td><span className="fw-semibold">{parseFloat(c.total_spent || 0).toLocaleString()} {t('sum')}</span></td>
                                <td><small className="text-muted">{formatDate(c.created_at)}</small></td>
                                {isHiddenOpsTelemetryEnabled && (
                                  <>
                                    <td><small className="text-muted">{formatDate(c.last_activity_at)}</small></td>
                                    <td><small>{formatTelemetryDeviceLabel(c)}</small></td>
                                    <td><small>{formatTelemetryBrowserLabel(c)}</small></td>
                                    <td><small>{c.last_ip_address || '-'}</small></td>
                                    <td><small>{formatTelemetryGeoLabel(c)}</small></td>
                                  </>
                                )}
                                <td>
                                  {!c.user_is_active ? (
                                    <Badge className="badge-custom sa-status-badge sa-status-badge-global-ban">Бан (Глобал)</Badge>
                                  ) : c.is_blocked ? (
                                    <Badge className="badge-custom sa-status-badge sa-status-badge-blocked">Блокирован</Badge>
                                  ) : (
                                    <Badge className="badge-custom sa-status-badge sa-status-badge-active">Активен</Badge>
                                  )}
                                </td>
                                <td className="text-end">
                                  <div className="d-flex gap-2 justify-content-end">
                                    <Button variant="light" className="action-btn text-info" onClick={() => openOrderHistory({ id: c.user_id, full_name: c.full_name, username: c.username })}>
                                      📋
                                    </Button>
                                    <Button
                                      variant="light"
                                      className={`action-btn ${isBlocked ? 'text-success' : 'text-warning'}`}
                                      onClick={() => handleToggleCustomerBlock(c)}
                                    >
                                      {isBlocked ? '✅' : '🚫'}
                                    </Button>
                                    <Button variant="light" className="action-btn text-danger" onClick={() => handleDeleteCustomer({ id: c.user_id, full_name: c.full_name, username: c.username })}>
                                      🗑️
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {visibleCustomersRows?.length === 0 && (
                            <tr><td colSpan={isHiddenOpsTelemetryEnabled ? 14 : 9} className="text-center py-5 text-muted">{t('saEmptyCustomers')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={customerPage}
                      total={customers.total}
                      limit={customerLimit}
                      onPageChange={setCustomerPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => { setCustomerLimit(val); setCustomerPage(1); }}
                    />
                  </>
                )}
              </Tab>

              {/* Categories Tab */}
              <Tab eventKey="categories" title={renderSuperAdminSidebarTabTitle('categories')}>
                <div className="d-flex justify-content-between align-items-center mb-4 superadmin-categories-toolbar">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">{t('saManageCategories')}</h5>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      ref={categoryImportInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="d-none"
                      onChange={handleImportCategoriesFile}
                    />
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={handleExportCategories}
                    >
                      <span className="d-none d-sm-inline">Экспорт</span>
                      <span className="d-sm-none">Экспорт</span>
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => categoryImportInputRef.current?.click()}
                      disabled={isImportingCategories}
                    >
                      <span className="d-none d-sm-inline">{isImportingCategories ? 'Импорт...' : 'Импорт'}</span>
                      <span className="d-sm-none">{isImportingCategories ? '...' : 'Импорт'}</span>
                    </Button>
                    <Badge className="badge-custom bg-info bg-opacity-10 text-info">{CATEGORY_LEVEL_COUNT} уровня</Badge>
                  </div>
                </div>
                {loading ? (
                  <ListSkeleton count={5} label="Загрузка категорий" />
                ) : (
                  <div
                    className="pb-3 superadmin-categories-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${CATEGORY_LEVEL_COUNT}, minmax(0, 1fr))`,
                      gap: '12px',
                      width: '100%'
                    }}
                  >
                    {Array.from({ length: CATEGORY_LEVEL_COUNT }, (_, idx) => idx).map(levelIndex => {
                      const parentCategory = levelIndex === 0 ? null : categoryLevels[levelIndex - 1];
                      const isVisible = levelIndex === 0 || parentCategory !== null;

                      const levelCategories = isVisible ? categories.filter(c =>
                        (!c.parent_id && levelIndex === 0) ||
                        (c.parent_id === parentCategory?.id)
                      ).sort((a, b) => {
                        const getSortVal = (c) => (c.sort_order === null || c.sort_order === undefined) ? 9999 : c.sort_order;
                        const orderDiff = getSortVal(a) - getSortVal(b);
                        if (orderDiff !== 0) return orderDiff;
                        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
                      }) : [];

                      return (
                        <Card
                          key={levelIndex}
                          className={`admin-card admin-section-panel category-level-card ${!isVisible ? 'opacity-50' : ''}`}
                          style={{ minWidth: 0, width: '100%', background: isVisible ? '#fff' : '#f8fafc' }}
                        >
                          <Card.Header className="admin-card-header admin-section-panel-header d-flex justify-content-between align-items-center py-3">
                            <div>
                              <div className="fw-bold text-dark small text-uppercase letter-spacing-1 mb-0">
                                {levelIndex === 0 ? t('saMainLevel') : `${t('saLevel')} ${levelIndex + 1}`}
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              className="action-btn d-flex align-items-center justify-content-center p-0"
                              style={{ width: '28px', height: '28px', borderRadius: '8px' }}
                              onClick={() => openCategoryModal(levelIndex, parentCategory)}
                              disabled={!isVisible}
                            >
                              +
                            </Button>
                          </Card.Header>
                          <Card.Body className="p-0 custom-scrollbar category-level-card-body" style={{ overflowY: 'auto' }}>
                            {!isVisible ? (
                              <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                                <span style={{ fontSize: '2rem' }}>👈</span>
                                <div className="mt-2 text-center small px-4">
                                  {t('saSelectParent')}
                                </div>
                              </div>
                            ) : levelCategories.length === 0 ? (
                              levelIndex === CATEGORY_LEVEL_COUNT - 1 ? (
                                <div className="h-100"></div>
                              ) : (
                                <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                                  <div className="mb-2 opacity-25" style={{ fontSize: '2rem' }}>📁</div>
                                  <small className="fw-medium">{t('saEmptyLevel')}</small>
                                </div>
                              )
                            ) : (
                              <div className="list-group list-group-flush category-level-list">
                                {levelCategories?.map(cat => (
                                  <div
                                    key={cat?.id}
                                    className={`list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between py-2 px-3 category-list-item ${categoryLevels[levelIndex]?.id === cat?.id ? 'is-active' : ''}`}
                                    onClick={() => handleCategorySelect(levelIndex, cat)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <div className="d-flex align-items-center gap-2 overflow-hidden">
                                      {cat?.image_url ? (
                                        <img src={cat?.image_url} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '4px' }} />
                                      ) : (
                                        <div className="bg-light d-flex align-items-center justify-content-center" style={{ width: '24px', height: '24px', borderRadius: '4px' }}>
                                          <i className="bi bi-folder2 text-muted" style={{ fontSize: '12px' }}></i>
                                        </div>
                                      )}
                                      <span className="text-muted me-2 small">[{cat.sort_order !== null && cat.sort_order !== undefined ? cat.sort_order : '-'}]</span>
                                      <span className="text-truncate small fw-medium">{cat?.name_ru}</span>
                                    </div>
                                    <div className="category-actions flex-shrink-0 ms-2">
                                      <Button
                                        type="button"
                                        variant="light"
                                        className="category-action-btn category-action-btn--edit"
                                        title="Редактировать категорию"
                                        onClick={(e) => { e.stopPropagation(); openCategoryModal(levelIndex, null, cat); }}
                                      >
                                        <i className="bi bi-pencil" aria-hidden="true"></i>
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="light"
                                        className="category-action-btn category-action-btn--delete"
                                        title={
                                          canDeleteCategory(cat)
                                            ? 'Удалить категорию'
                                            : `Нельзя удалить: товары (${getCategoryProductsCount(cat)}), подкатегории (${getCategorySubcategoriesCount(cat)})`
                                        }
                                        onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                                      >
                                        <i className="bi bi-trash" aria-hidden="true"></i>
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Tab>

              {/* Ads Tab */}
              <Tab eventKey="ads" title={renderSuperAdminSidebarTabTitle('ads')}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <div className="superadmin-mobile-hide-title">
                    <h5 className="fw-bold mb-1">{adI18n.title}</h5>
                    <div className="d-flex flex-wrap gap-2">
                      <Badge className="badge-custom bg-primary bg-opacity-10 text-primary">
                        {adI18n.activeNow}: {adBannersMeta.active_now_count}
                      </Badge>
                      <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">
                        {adI18n.maxSlots}: {adBannersMeta.max_slots}
                      </Badge>
                      <Badge className="badge-custom bg-info bg-opacity-10 text-info">
                        {adI18n.totalRecords}: {filteredAdBanners.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="d-flex d-lg-none align-items-center gap-2 w-100">
                    <Button variant="outline-secondary" className="btn-mobile-filter" onClick={() => setShowMobileFiltersSheet(true)}>
                      <i className="bi bi-funnel"></i> {adI18n.filters}
                    </Button>
                    <Button className="btn-primary-custom ms-auto" onClick={() => openAdBannerModal()}>
                      <span className="d-none d-sm-inline">+ {adI18n.addAd}</span>
                      <span className="d-sm-none">{language === 'uz' ? "Qo'shish" : 'Добавить'}</span>
                    </Button>
                  </div>
                  <div className="d-none d-lg-flex align-items-center gap-2 ms-auto">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showAdsFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowAdsFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showAdsFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                    <Button className="btn-primary-custom" onClick={() => openAdBannerModal()}>
                      + {adI18n.addAd}
                    </Button>
                  </div>
                </div>

                {showAdsFilterPanel && (
                  <div className="d-none d-lg-flex align-items-center gap-2 flex-wrap mb-3">
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '220px' }}
                      value={adBannerStatusFilter}
                      onChange={(e) => { setAdBannerStatusFilter(e.target.value); setAdBannersPage(1); }}
                    >
                      <option value="all">{adI18n.allStatuses}</option>
                      <option value="active">{adI18n.active}</option>
                      <option value="scheduled">{adI18n.scheduled}</option>
                      <option value="paused_by_days">{adI18n.pausedByDays}</option>
                      <option value="disabled">{adI18n.disabled}</option>
                      <option value="finished">{adI18n.finished}</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '260px' }}
                      value={adBannerActivityTypeFilter}
                      onChange={(e) => { setAdBannerActivityTypeFilter(e.target.value); setAdBannersPage(1); }}
                    >
                      <option value="all">{adI18n.activityTypeAll}</option>
                      <option value="untargeted">{adI18n.activityTypeNoTarget}</option>
                      {adBannerActivityTypeFilterOptions.map((item) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.name}{item.is_visible === false ? (language === 'uz' ? ' (yashirin)' : ' (скрыт)') : ''}
                        </option>
                      ))}
                    </Form.Select>
                  </div>
                )}

                <Alert className="mb-4" variant="light" style={{ border: '1px solid var(--border-color)' }}>
                  <div className="small">
                    {adI18n.alertText}
                  </div>
                </Alert>

                {adBannersLoading ? (
                  <TableSkeleton rows={7} columns={8} label="Загрузка рекламных баннеров" />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table align-middle">
                        <thead>
                          <tr>
                            <th>{adI18n.colSlot}</th>
                            <th>{adI18n.colBanner}</th>
                            <th>{adI18n.colLink}</th>
                            <th>{adI18n.colSchedule}</th>
                            <th>{adI18n.colAnimation}</th>
                            <th>{adI18n.colStatus}</th>
                            <th>{adI18n.colStats}</th>
                            <th className="text-end">{adI18n.colActions}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedAdBanners.map((banner) => {
                            const activityTypeNames = getActivityTypeNamesByIds(banner.target_activity_type_ids || []);
                            const activityTypesFullText = activityTypeNames.length
                              ? activityTypeNames.join(', ')
                              : adI18n.activityTypeNoTarget;
                            const activityTypesShortText = activityTypeNames.length > 2
                              ? `${activityTypeNames.slice(0, 2).join(', ')}...`
                              : activityTypesFullText;

                            return (
                            <tr key={banner.id}>
                              <td>
                                <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                  #{banner.slot_order}
                                </Badge>
                              </td>
                              <td style={{ minWidth: '210px' }}>
                                <div className="d-flex align-items-center gap-3">
                                  <div
                                    style={{
                                      width: '72px',
                                      height: '48px',
                                      borderRadius: '8px',
                                      overflow: 'hidden',
                                      border: '1px solid var(--border-color)',
                                      background: '#fff',
                                      flexShrink: 0
                                    }}
                                  >
                                    {banner.image_url ? (
                                      <img src={banner.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0">
                                    <div
                                      className="fw-semibold text-truncate"
                                      style={{ maxWidth: '120px' }}
                                      title={banner.title || ''}
                                    >
                                      {truncateAdTitleText(banner.title, 10)}
                                    </div>
                                    <div className="small text-muted">ID: {banner.id}</div>
                                    <div className="small">
                                      <Badge className="badge-custom bg-primary bg-opacity-10 text-primary">
                                        {getAdTypeLabel(banner.ad_type)}
                                      </Badge>
                                    </div>
                                    <div className="small text-muted text-truncate" title={activityTypesFullText}>
                                      🧩 {activityTypesShortText}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ minWidth: '170px' }}>
                                {banner.target_url ? (
                                  <a
                                    href={banner.target_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="small text-decoration-none"
                                    style={{ color: 'var(--primary-color)' }}
                                    title={banner.target_url}
                                  >
                                    {truncateAdLinkText(banner.target_url, 12)}
                                  </a>
                                ) : (
                                  <span className="small text-muted">{adI18n.noLink}</span>
                                )}
                              </td>
                              <td style={{ minWidth: '220px' }}>
                                <div className="small"><strong>{adI18n.start}:</strong> {formatAdDate(banner.start_at)}</div>
                                <div className="small"><strong>{adI18n.end}:</strong> {formatAdDate(banner.end_at)}</div>
                                <div className="small text-muted">
                                  {adI18n.days}: {Array.isArray(banner.repeat_days) && banner.repeat_days.length
                                    ? adWeekdayOptions.filter((d) => banner.repeat_days.includes(d.value)).map((d) => d.label).join(', ')
                                    : adI18n.everyDay}
                                </div>
                              </td>
                              <td>
                                <div className="small text-capitalize">{banner.transition_effect || 'fade'}</div>
                                <div className="small text-muted">{banner.display_seconds || 5} {adI18n.sec}</div>
                              </td>
                              <td>
                                <Badge className={`badge-custom ${getAdStatusBadgeClass(banner.runtime_status)}`}>
                                  {getAdStatusLabel(banner.runtime_status)}
                                </Badge>
                              </td>
                              <td style={{ minWidth: '150px' }}>
                                <div className="small">{adI18n.views}: <strong>{banner.total_views || 0}</strong></div>
                                <div className="small">{adI18n.unique}: <strong>{banner.unique_views || 0}</strong></div>
                                <div className="small">{adI18n.clicks}: <strong>{banner.total_clicks || 0}</strong></div>
                              </td>
                              <td className="text-end" style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>
                                <div className="d-inline-flex gap-1 justify-content-end align-items-center">
                                  <Form.Check
                                    type="switch"
                                    id={`ad-toggle-${banner.id}`}
                                    checked={!!banner.is_enabled}
                                    onChange={() => toggleAdBanner(banner)}
                                    title={banner.is_enabled ? 'Выключить рекламу' : 'Включить рекламу'}
                                    className="mb-0 me-1"
                                  />
                                  <Button
                                    variant="light"
                                    className="text-info p-1"
                                    onClick={() => openAdAnalyticsModal(banner)}
                                    title={adI18n.analytics}
                                  >
                                    📈
                                  </Button>
                                  <Button
                                    variant="light"
                                    className="action-btn text-primary p-1"
                                    onClick={() => openAdBannerModal(banner)}
                                    title="Редактировать"
                                  >
                                    ✏️
                                  </Button>
                                  <Button
                                    variant="light"
                                    className="action-btn text-danger p-1"
                                    onClick={() => deleteAdBanner(banner)}
                                    title="Архивировать"
                                  >
                                    🗂️
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                          {adBanners.length === 0 && (
                            <tr>
                              <td colSpan="8" className="text-center py-5 text-muted">
                                {adI18n.noSlots}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                    <DataPagination
                      current={adBannersPage}
                      total={filteredAdBanners.length}
                      limit={adBannersLimit}
                      onPageChange={setAdBannersPage}
                      onLimitChange={(val) => {
                        setAdBannersLimit(val);
                        setAdBannersPage(1);
                      }}
                      limitOptions={[15, 20, 30, 50]}
                    />
                  </>
                )}
              </Tab>

              {/* Billing Transactions Tab */}
              <Tab eventKey="billing_transactions" title={renderSuperAdminSidebarTabTitle('billing_transactions')}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">
                    {language === 'uz' ? "Do'konlardan to'lovlar jurnali" : 'Журнал оплат магазинов'}
                  </h5>
                  <div className="d-none d-lg-flex align-items-center gap-2 ms-auto">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showBillingOpsFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowBillingOpsFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showBillingOpsFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                    <Button variant="outline-secondary" onClick={exportBillingTransactionsXls}>
                      <i className="bi bi-file-earmark-spreadsheet me-2" />
                      XLS
                    </Button>
                    <Button className="btn-primary-custom" onClick={() => openTopupModal()}>
                      {language === 'uz' ? "To'lovni kiritish" : 'Зафиксировать оплату'}
                    </Button>
                  </div>
                </div>

                <div className="d-flex d-lg-none gap-2 align-items-center mb-3">
                  <Button variant="outline-secondary" className="btn-mobile-filter" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel" /> {language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                  </Button>
                  <Button variant="outline-secondary" onClick={exportBillingTransactionsXls}>
                    XLS
                  </Button>
                  <Button className="btn-primary-custom ms-auto" onClick={() => openTopupModal()}>
                    {language === 'uz' ? "Kiritish" : 'Оплата'}
                  </Button>
                </div>

                {showBillingOpsFilterPanel && (
                  <div className="d-none d-lg-flex gap-2 align-items-center flex-wrap mb-3">
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      style={{ width: '280px' }}
                      placeholder={language === 'uz' ? "Do'kon, izoh yoki operator bo'yicha qidirish" : 'Поиск по магазину, описанию или оператору'}
                      value={billingOpsFilter.search}
                      onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
                    />
                    <SearchableRestaurantFilter
                      t={t}
                      width="230px"
                      value={billingOpsFilter.restaurant_id}
                      restaurants={billingOpsRestaurantOptions}
                      searchValue={billingOpsRestaurantSearch}
                      onSearchChange={setBillingOpsRestaurantSearch}
                      onChange={(nextValue) => {
                        setBillingOpsFilter((prev) => ({ ...prev, restaurant_id: nextValue, page: 1 }));
                        setBillingOpsRestaurantSearch('');
                      }}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={billingOpsFilter.type}
                      onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, type: e.target.value, page: 1 }))}
                    >
                      <option value="">{language === 'uz' ? 'Barcha operatsiyalar' : 'Все операции'}</option>
                      <option value="deposit">{language === 'uz' ? "To'ldirish" : 'Пополнение'}</option>
                      <option value="refund">{language === 'uz' ? 'Qaytarish' : 'Возврат'}</option>
                    </Form.Select>
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={billingOpsFilter.start_date}
                      onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, start_date: e.target.value, page: 1 }))}
                    />
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={billingOpsFilter.end_date}
                      onChange={(e) => setBillingOpsFilter((prev) => ({ ...prev, end_date: e.target.value, page: 1 }))}
                    />
                    <Button
                      variant="light"
                      className="border form-control-custom text-muted d-flex align-items-center justify-content-center"
                      style={{ height: '38px', padding: '0 15px' }}
                      title={language === 'uz' ? 'Filtrlarni tozalash' : 'Сбросить фильтры'}
                      onClick={() => {
                        setBillingOpsFilter({
                          restaurant_id: '',
                          type: '',
                          search: '',
                          start_date: '',
                          end_date: '',
                          page: 1,
                          limit: billingOpsFilter.limit
                        });
                        setBillingOpsRestaurantSearch('');
                      }}
                      disabled={!billingOpsFilter.restaurant_id && !billingOpsFilter.type && !billingOpsFilter.search && !billingOpsFilter.start_date && !billingOpsFilter.end_date}
                    >
                      {language === 'uz' ? 'Tozalash' : 'Сброс'}
                    </Button>
                  </div>
                )}

                {billingOpsLoading ? (
                  <TableSkeleton rows={8} columns={6} label={language === 'uz' ? "To'lovlar yuklanmoqda" : 'Загрузка журнала оплат'} />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>{language === 'uz' ? 'Sana' : 'Дата'}</th>
                            <th>{language === 'uz' ? "Do'kon" : 'Магазин'}</th>
                            <th>{language === 'uz' ? 'Turi' : 'Тип операции'}</th>
                            <th className="text-end">{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                            <th>{language === 'uz' ? 'Operator' : 'Оператор'}</th>
                            <th>{language === 'uz' ? 'Izoh' : 'Описание'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billingOpsData.transactions.map((row) => {
                            const operationMeta = getBillingOperationMeta(row.type);
                            return (
                              <tr key={row.id}>
                                <td><small className="text-muted">{formatBalanceOperationDate(row.created_at)}</small></td>
                                <td><strong>{row.restaurant_name || '—'}</strong></td>
                                <td>
                                  <Badge className="badge-custom" style={operationMeta.badgeStyle}>
                                    {operationMeta.label}
                                  </Badge>
                                </td>
                                <td className="text-end">
                                  <span className={`fw-bold ${operationMeta.className}`}>
                                    {operationMeta.sign}{formatBalanceAmount(row.amount || 0)} {getCurrencyLabelByCode(row.restaurant_currency_code || countryCurrency?.code)}
                                  </span>
                                </td>
                                <td>{row.actor_name || row.actor_username || 'Система'}</td>
                                <td><small>{row.description || '—'}</small></td>
                              </tr>
                            );
                          })}
                          {billingOpsData.transactions.length === 0 && (
                            <tr><td colSpan="6" className="text-center py-5 text-muted">{language === 'uz' ? "Yozuvlar yo'q" : 'Записей пока нет'}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                    <DataPagination
                      current={billingOpsFilter.page}
                      total={billingOpsData.total}
                      limit={billingOpsFilter.limit}
                      onPageChange={(val) => setBillingOpsFilter((prev) => ({ ...prev, page: val }))}
                      onLimitChange={(val) => setBillingOpsFilter((prev) => ({ ...prev, limit: val, page: 1 }))}
                      limitOptions={[15, 20, 30, 50]}
                    />
                  </>
                )}
              </Tab>

              {/* Founders Tab */}
              <Tab eventKey="founders" title={renderSuperAdminSidebarTabTitle('founders')}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">
                    {language === 'uz' ? 'Ta’sischilar ulushi analitikasi' : 'Аналитика долей учредителей'}
                  </h5>
                  <div className="d-flex align-items-center gap-2 ms-auto">
                    <Button
                      variant="outline-secondary"
                      onClick={() => loadFoundersAnalytics()}
                      disabled={foundersAnalyticsLoading || !foundersAccessGranted}
                    >
                      <i className="bi bi-arrow-clockwise me-2" />
                      {language === 'uz' ? 'Yangilash' : 'Обновить'}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={requestFoundersReauth}
                    >
                      <i className="bi bi-key me-2" />
                      {language === 'uz' ? 'Parolni almashtirish' : 'Сменить пароль'}
                    </Button>
                  </div>
                </div>

                {!foundersAccessGranted ? (
                  <Card className="admin-card border-0">
                    <Card.Body className="p-4">
                      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                        <div>
                          <div className="fw-bold mb-1">
                            {language === 'uz' ? 'Kirish cheklangan' : 'Доступ ограничен'}
                          </div>
                          <div className="text-muted small">
                            {language === 'uz'
                              ? 'Ushbu bo‘lim uchun alohida parol talab qilinadi.'
                              : 'Для этого раздела требуется отдельный пароль.'}
                          </div>
                        </div>
                        <Button className="btn-primary-custom" onClick={() => setShowFoundersAccessModal(true)}>
                          <i className="bi bi-unlock me-2" />
                          {language === 'uz' ? 'Kirish' : 'Войти'}
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                ) : (
                  <>
                    <div className="sa-founders-workspace">
                    <Nav
                      variant="tabs"
                      className="sa-founders-inner-tabs mb-3"
                      activeKey={foundersInnerTab}
                      onSelect={(nextKey) => {
                        if (!nextKey) return;
                        setFoundersInnerTab(nextKey);
                      }}
                    >
                      <Nav.Item>
                        <Nav.Link eventKey="analytics">
                          {language === 'uz' ? 'Analitika' : 'Аналитика'}
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="expenses">
                          {language === 'uz' ? 'Tashkilot xarajatlari' : 'Расходы организации'}
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link eventKey="categories">
                          {language === 'uz' ? 'Xarajat maqolalari' : 'Статья расходов'}
                        </Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {foundersInnerTab === 'analytics' && (
                      <>
                    <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                      <Form.Control
                        type="date"
                        className="form-control-custom"
                        style={{ width: '170px' }}
                        value={foundersAnalyticsFilter.start_date}
                        onChange={(e) => setFoundersAnalyticsFilter((prev) => ({ ...prev, start_date: e.target.value }))}
                      />
                      <Form.Control
                        type="date"
                        className="form-control-custom"
                        style={{ width: '170px' }}
                        value={foundersAnalyticsFilter.end_date}
                        onChange={(e) => setFoundersAnalyticsFilter((prev) => ({ ...prev, end_date: e.target.value }))}
                      />
                      <Button
                        className="btn-primary-custom"
                        onClick={() => loadFoundersAnalytics()}
                        disabled={foundersAnalyticsLoading}
                      >
                        {language === 'uz' ? "Ko'rsatish" : 'Показать'}
                      </Button>
                      <Button
                        variant="light"
                        className="border form-control-custom text-muted d-flex align-items-center justify-content-center"
                        style={{ height: '38px', padding: '0 15px' }}
                        onClick={() => setFoundersAnalyticsFilter({ start_date: '', end_date: '' })}
                        disabled={!foundersAnalyticsFilter.start_date && !foundersAnalyticsFilter.end_date}
                      >
                        {language === 'uz' ? 'Tozalash' : 'Сброс'}
                      </Button>
                    </div>

                    <div className="small text-muted mb-3 d-flex flex-wrap gap-3">
                      <span>
                        {language === 'uz' ? 'Yangilangan:' : 'Обновлено:'}{' '}
                        <strong>{foundersGeneratedAtLabel || '—'}</strong>
                      </span>
                      <span>
                        {language === 'uz' ? 'Tanlangan period:' : 'Выбранный период:'}{' '}
                        <strong>
                          {foundersAnalyticsFilter.start_date || (language === 'uz' ? 'boshlanishdan' : 'с начала')}
                          {' — '}
                          {foundersAnalyticsFilter.end_date || (language === 'uz' ? 'hozirgacha' : 'по сегодня')}
                        </strong>
                      </span>
                    </div>

                    {foundersAnalyticsLoading ? (
                      <TableSkeleton
                        rows={8}
                        columns={5}
                        label={language === 'uz'
                          ? 'Ta’sischilar analitikasi yuklanmoqda'
                          : 'Загрузка аналитики учредителей'}
                      />
                    ) : foundersCardsData.length === 0 ? (
                      <Alert variant="secondary" className="mb-0">
                        {language === 'uz'
                          ? "Tanlangan davr bo'yicha taqsimlanadigan tushum topilmadi."
                          : 'За выбранный период распределяемых поступлений не найдено.'}
                      </Alert>
                    ) : (
                      <>
                        <Row className="g-3 mb-4">
                          {foundersTotalsByCurrency.map((row) => (
                            <Col xs={12} md={6} xl={4} key={`founders-total-${row.currency_code}`}>
                                <Card className="admin-card border-0 h-100">
                                <Card.Body className="p-3">
                                  <div className="small text-muted mb-1">
                                    {language === 'uz' ? 'Valyuta kesimida balans' : 'Баланс по валюте'}
                                  </div>
                                  <div className="fw-bold fs-5 mb-1">
                                    {formatBalanceAmount(row.balance_total || 0)} {getCurrencyLabelByCode(row.currency_code)}
                                  </div>
                                  <div className="small text-muted">
                                    {language === 'uz' ? 'Kirim:' : 'Приход:'}{' '}
                                    {formatBalanceAmount(row.income_total || 0)} ({row.income_transactions_count || 0})
                                  </div>
                                  <div className="small text-muted">
                                    {language === 'uz' ? 'Chiqim:' : 'Расход:'}{' '}
                                    {formatBalanceAmount(row.expense_total || 0)} ({row.expense_records_count || 0})
                                  </div>
                                </Card.Body>
                              </Card>
                            </Col>
                          ))}
                        </Row>

                        <Card className="admin-card border-0 mb-4">
                          <Card.Body className="p-0">
                            <div className="px-3 pt-3 pb-2 fw-semibold">
                              {language === 'uz' ? 'Xarajat maqolalari analitikasi' : 'Аналитика по статьям расходов'}
                            </div>
                            <div className="admin-table-container">
                              <Table responsive className="admin-table mb-0">
                                <thead>
                                  <tr>
                                    <th style={{ width: '42%' }}>{language === 'uz' ? 'Xarajat maqolasi' : 'Статья расхода'}</th>
                                    <th>{language === 'uz' ? 'Valyutalar bo‘yicha xarajat' : 'Расход по валютам'}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {foundersExpenseCategoryRows.map((row) => (
                                    <tr key={`founders-expense-category-${row.key}`}>
                                      <td>
                                        <div className="fw-semibold">
                                          {language === 'uz'
                                            ? (row.category_name_uz || row.category_name_ru || '—')
                                            : (row.category_name_ru || row.category_name_uz || '—')}
                                        </div>
                                        {row.category_name_uz && row.category_name_ru && (
                                          <div className="small text-muted">
                                            {language === 'uz' ? `RU: ${row.category_name_ru}` : `UZ: ${row.category_name_uz}`}
                                          </div>
                                        )}
                                      </td>
                                      <td>
                                        <div className="sa-founders-currency-stack">
                                          {row.currencies.map((currencyLine) => {
                                            const flagUrl = resolveCurrencyFlagSvgUrl(currencyLine.currency_code);
                                            return (
                                              <div className="sa-founders-currency-line" key={`founders-expense-category-line-${row.key}-${currencyLine.currency_code}`}>
                                                {flagUrl ? (
                                                  <img
                                                    src={flagUrl}
                                                    alt={currencyLine.currency_code?.toUpperCase() || 'CUR'}
                                                    className="sa-founders-currency-flag"
                                                  />
                                                ) : (
                                                  <span className="sa-founders-currency-flag sa-founders-currency-flag-placeholder">
                                                    {String(currencyLine.currency_code || '').toUpperCase().slice(0, 2)}
                                                  </span>
                                                )}
                                                <span className="sa-founders-currency-amount">
                                                  {formatBalanceAmount(currencyLine.amount || 0)} {getCurrencyLabelByCode(currencyLine.currency_code)}
                                                </span>
                                                <span className="text-muted small">({currencyLine.records_count || 0})</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {foundersExpenseCategoryRows.length === 0 && (
                                    <tr>
                                      <td colSpan={2} className="text-center py-4 text-muted">
                                        {language === 'uz'
                                          ? "Xarajat maqolalari bo'yicha ma'lumot topilmadi"
                                          : 'По статьям расходов данных не найдено'}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </Table>
                            </div>
                          </Card.Body>
                        </Card>

                        <Row className="g-3 mb-4">
                          {foundersCardsData.map((founderItem, founderIndex) => (
                            <Col xs={12} lg={4} key={`founders-card-${founderItem.founder_key || founderIndex}`}>
                              <Card className="admin-card border-0 h-100 sa-founders-founder-card">
                                <Card.Body className="p-0">
                                  <div className="sa-founders-founder-head">
                                    <div className="sa-founders-founder-caption">
                                      {language === 'uz' ? 'Ta’sischi F.I.Sh.' : 'ФИО учредителя'}
                                    </div>
                                    <div className="sa-founders-founder-name">{founderItem.founder_name || '—'}</div>
                                    <div className="sa-founders-founder-percents">
                                      {language === 'uz'
                                        ? `Buyurtma: ${Number(founderItem.order_percent || 0)}% • Bron: ${Number(founderItem.reservation_percent || 0)}%`
                                        : `Заказы: ${Number(founderItem.order_percent || 0)}% • Бронирование: ${Number(founderItem.reservation_percent || 0)}%`}
                                    </div>
                                  </div>
                                  <div className="admin-table-container">
                                    <Table responsive className="admin-table mb-0 sa-founders-founder-table">
                                      <thead>
                                        <tr>
                                          <th style={{ width: '34%' }}>{language === 'uz' ? 'Modul' : 'Модуль'}</th>
                                          <th>{language === 'uz' ? 'Valyutalar bo‘yicha summa' : 'Сумма по валютам'}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          const priorityKeys = ['orders', 'reservations'];
                                          const priorityModules = founderItem.modules.filter((moduleItem) => priorityKeys.includes(moduleItem.module_key));
                                          const fallbackModules = founderItem.modules.filter((moduleItem) => !priorityKeys.includes(moduleItem.module_key));
                                          const defaultModules = [
                                            ...priorityModules,
                                            ...fallbackModules.slice(0, Math.max(0, 2 - priorityModules.length))
                                          ];
                                          const isExpanded = Boolean(foundersExpandedModulesMap[founderItem.founder_key]);
                                          const shownModules = isExpanded
                                            ? founderItem.modules
                                            : defaultModules;
                                          const hiddenCount = Math.max(0, founderItem.modules.length - defaultModules.length);
                                          return (
                                            <>
                                              {shownModules.map((moduleItem) => (
                                          <tr key={`founder-module-${founderItem.founder_key}-${moduleItem.module_key}`}>
                                            <td className="fw-semibold">{moduleItem.module_label}</td>
                                            <td>
                                              {foundersAvailableCurrencies.length === 0 ? (
                                                <span className="text-muted">—</span>
                                              ) : (
                                                <div className="sa-founders-currency-stack">
                                                  {moduleItem.amounts_by_currency.map((line) => {
                                                    const flagUrl = resolveCurrencyFlagSvgUrl(line.currency_code);
                                                    return (
                                                      <div className="sa-founders-currency-line" key={`line-${moduleItem.module_key}-${line.currency_code}`}>
                                                        {flagUrl ? (
                                                          <img
                                                            src={flagUrl}
                                                            alt={line.currency_code?.toUpperCase() || 'CUR'}
                                                            className="sa-founders-currency-flag"
                                                          />
                                                        ) : (
                                                        <span className="sa-founders-currency-flag sa-founders-currency-flag-placeholder">
                                                          {String(line.currency_code || '').toUpperCase().slice(0, 2)}
                                                        </span>
                                                      )}
                                                      <span className="sa-founders-currency-amount">
                                                        {formatBalanceAmount(line.founder_amount || 0)} {getCurrencyLabelByCode(line.currency_code)}
                                                      </span>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                              ))}
                                            </>
                                          );
                                        })()}
                                        <tr className="sa-founders-total-row">
                                          <td className="fw-bold">
                                            <div className="sa-founders-total-row-label">
                                              <span>{language === 'uz' ? 'Jami' : 'Итого'}</span>
                                              {(() => {
                                                const priorityKeys = ['orders', 'reservations'];
                                                const priorityModules = founderItem.modules.filter((moduleItem) => priorityKeys.includes(moduleItem.module_key));
                                                const fallbackModules = founderItem.modules.filter((moduleItem) => !priorityKeys.includes(moduleItem.module_key));
                                                const defaultModules = [
                                                  ...priorityModules,
                                                  ...fallbackModules.slice(0, Math.max(0, 2 - priorityModules.length))
                                                ];
                                                const hiddenCount = Math.max(0, founderItem.modules.length - defaultModules.length);
                                                if (hiddenCount <= 0) return null;
                                                const isExpanded = Boolean(foundersExpandedModulesMap[founderItem.founder_key]);
                                                return (
                                                  <button
                                                    type="button"
                                                    className="sa-founders-more-btn"
                                                    onClick={() => {
                                                      setFoundersExpandedModulesMap((prev) => ({
                                                        ...prev,
                                                        [founderItem.founder_key]: !prev[founderItem.founder_key]
                                                      }));
                                                    }}
                                                    aria-label={isExpanded
                                                      ? (language === 'uz' ? 'Ro‘yxatni yig‘ish' : 'Свернуть список')
                                                      : (language === 'uz' ? `Yana ${hiddenCount} modulni ko‘rsatish` : `Показать ещё ${hiddenCount}`)}
                                                  >
                                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    <span>
                                                      {isExpanded
                                                        ? (language === 'uz' ? 'Yopish' : 'Свернуть')
                                                        : (language === 'uz' ? `Yana ${hiddenCount}` : `Ещё ${hiddenCount}`)}
                                                    </span>
                                                  </button>
                                                );
                                              })()}
                                            </div>
                                          </td>
                                          <td>
                                            {foundersAvailableCurrencies.length === 0 ? (
                                              <span className="text-muted">—</span>
                                            ) : (
                                              <div className="sa-founders-currency-stack">
                                                {founderItem.total_by_currency.map((line) => {
                                                  const flagUrl = resolveCurrencyFlagSvgUrl(line.currency_code);
                                                  return (
                                                    <div className="sa-founders-currency-line" key={`total-line-${founderItem.founder_key}-${line.currency_code}`}>
                                                      {flagUrl ? (
                                                        <img
                                                          src={flagUrl}
                                                          alt={line.currency_code?.toUpperCase() || 'CUR'}
                                                          className="sa-founders-currency-flag"
                                                        />
                                                      ) : (
                                                        <span className="sa-founders-currency-flag sa-founders-currency-flag-placeholder">
                                                          {String(line.currency_code || '').toUpperCase().slice(0, 2)}
                                                        </span>
                                                      )}
                                                      <span className="sa-founders-currency-amount">
                                                        {formatBalanceAmount(line.amount || 0)} {getCurrencyLabelByCode(line.currency_code)}
                                                      </span>
                                                      <span className="text-muted small">
                                                        {language === 'uz'
                                                          ? `Kirim ${formatBalanceAmount(line.gross_amount || 0)} • Chiqim ${formatBalanceAmount(line.expense_amount || 0)}`
                                                          : `Приход ${formatBalanceAmount(line.gross_amount || 0)} • Расход ${formatBalanceAmount(line.expense_amount || 0)}`}
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </Table>
                                  </div>
                                </Card.Body>
                              </Card>
                            </Col>
                          ))}
                        </Row>

                        <Card className="admin-card border-0">
                          <Card.Body className="p-3 p-lg-4">
                            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                              <div className="fw-semibold">
                                {language === 'uz' ? "Ta’sischilar bo'yicha diagrammalar" : 'Диаграммы по учредителям'}
                              </div>
                              <div className="d-flex align-items-center gap-2">
                                <span className="small text-muted">{language === 'uz' ? 'Valyuta:' : 'Валюта:'}</span>
                                <Form.Select
                                  size="sm"
                                  className="form-control-custom"
                                  style={{ minWidth: 150 }}
                                  value={foundersChartCurrencyResolved}
                                  onChange={(e) => setFoundersChartsCurrency(String(e.target.value || '').trim().toLowerCase())}
                                >
                                  {foundersAvailableCurrencies.map((currencyCode) => (
                                    <option key={`founders-chart-currency-${currencyCode}`} value={currencyCode}>
                                      {getCurrencyLabelByCode(currencyCode)}
                                    </option>
                                  ))}
                                </Form.Select>
                              </div>
                            </div>

                            <Row className="g-3">
                              <Col xs={12}>
                                <div className="sa-founders-chart-card">
                                  <div className="sa-founders-chart-title">
                                    {language === 'uz' ? 'Modullar bo‘yicha oylik grafika' : 'Помесячно по модулям'}
                                  </div>
                                  {foundersMonthlyModulesChartData.length === 0 ? (
                                    <div className="text-muted small py-4 text-center">
                                      {language === 'uz' ? "Diagramma uchun ma'lumot yo'q" : 'Нет данных для диаграммы'}
                                    </div>
                                  ) : (
                                    <div className="sa-founders-recharts-wrap sa-founders-recharts-wrap-modules">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={foundersMonthlyModulesChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                          <XAxis dataKey="month_label" tick={{ fill: '#64748b', fontSize: 12 }} />
                                          <YAxis
                                            tick={{ fill: '#64748b', fontSize: 12 }}
                                            tickFormatter={(value) => formatBalanceAmount(value)}
                                          />
                                          <RechartsTooltip
                                            formatter={(value) => `${formatBalanceAmount(value)} ${getCurrencyLabelByCode(foundersChartCurrencyResolved)}`}
                                            labelFormatter={(label) => `${language === 'uz' ? 'Oy' : 'Месяц'}: ${label}`}
                                          />
                                          <Legend />
                                          {foundersModulesConfig.map((moduleItem) => (
                                            <Bar
                                              key={`founders-modules-chart-bar-${moduleItem.key}`}
                                              dataKey={moduleItem.key}
                                              name={moduleItem.label}
                                              stackId="module-stack"
                                              fill={FOUNDERS_MODULE_CHART_COLORS[moduleItem.key] || '#94a3b8'}
                                              radius={[4, 4, 0, 0]}
                                            />
                                          ))}
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              </Col>

                              <Col xs={12} xl={8}>
                                <div className="sa-founders-chart-card">
                                  <div className="sa-founders-chart-title">
                                    {language === 'uz' ? 'Ta’sischilar: diagramma (area)' : 'Диаграмма с областями'}
                                  </div>
                                  {foundersMonthlyAreaChartData.length === 0 ? (
                                    <div className="text-muted small py-4 text-center">
                                      {language === 'uz' ? "Diagramma uchun ma'lumot yo'q" : 'Нет данных для диаграммы'}
                                    </div>
                                  ) : (
                                    <div className="sa-founders-recharts-wrap">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={foundersMonthlyAreaChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                          <defs>
                                            {foundersCardsData.map((founderItem, founderIndex) => {
                                              const founderKey = founderItem.founder_key;
                                              const color = FOUNDERS_CHART_COLORS[founderKey] || ['#4f46e5', '#0ea5e9', '#22c55e'][founderIndex % 3];
                                              return (
                                                <linearGradient key={`founders-area-gradient-${founderKey}`} id={`founders-area-gradient-${founderKey}`} x1="0" y1="0" x2="0" y2="1">
                                                  <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                                                  <stop offset="95%" stopColor={color} stopOpacity={0.04} />
                                                </linearGradient>
                                              );
                                            })}
                                          </defs>
                                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                          <XAxis dataKey="month_label" tick={{ fill: '#64748b', fontSize: 12 }} />
                                          <YAxis
                                            tick={{ fill: '#64748b', fontSize: 12 }}
                                            tickFormatter={(value) => formatBalanceAmount(value)}
                                          />
                                          <RechartsTooltip
                                            formatter={(value) => `${formatBalanceAmount(value)} ${getCurrencyLabelByCode(foundersChartCurrencyResolved)}`}
                                            labelFormatter={(label) => `${language === 'uz' ? 'Oy' : 'Месяц'}: ${label}`}
                                          />
                                          <Legend />
                                          {foundersCardsData.map((founderItem, founderIndex) => {
                                            const founderKey = founderItem.founder_key;
                                            const color = FOUNDERS_CHART_COLORS[founderKey] || ['#4f46e5', '#0ea5e9', '#22c55e'][founderIndex % 3];
                                            return (
                                              <Area
                                                key={`founders-area-${founderKey}`}
                                                type="monotone"
                                                dataKey={founderKey}
                                                name={founderItem.founder_name}
                                                stroke={color}
                                                fill={`url(#founders-area-gradient-${founderKey})`}
                                                strokeWidth={2.2}
                                                dot={{ r: 2 }}
                                                activeDot={{ r: 4 }}
                                              />
                                            );
                                          })}
                                        </AreaChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              </Col>

                              <Col xs={12} xl={4}>
                                <div className="sa-founders-chart-card">
                                  <div className="sa-founders-chart-title">
                                    {language === 'uz' ? 'Ta’sischilar bo‘yicha jami' : 'Сумма по учредителям'}
                                  </div>
                                  {foundersFoundersBarChartData.length === 0 ? (
                                    <div className="text-muted small py-4 text-center">
                                      {language === 'uz' ? "Diagramma uchun ma'lumot yo'q" : 'Нет данных для диаграммы'}
                                    </div>
                                  ) : (
                                    <div className="sa-founders-recharts-wrap sa-founders-recharts-wrap-founders">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                          data={foundersFoundersBarChartData}
                                          layout="vertical"
                                          margin={{ top: 8, right: 24, left: 4, bottom: 0 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                          <XAxis
                                            type="number"
                                            tick={{ fill: '#64748b', fontSize: 11 }}
                                            tickFormatter={(value) => formatBalanceAmount(value)}
                                          />
                                          <YAxis
                                            type="category"
                                            dataKey="founder_name"
                                            width={88}
                                            tick={{ fill: '#334155', fontSize: 12 }}
                                          />
                                          <RechartsTooltip
                                            formatter={(value) => `${formatBalanceAmount(value)} ${getCurrencyLabelByCode(foundersChartCurrencyResolved)}`}
                                            labelFormatter={(label) => `${language === 'uz' ? 'Ta’sischi' : 'Учредитель'}: ${label}`}
                                          />
                                          <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                                            {foundersFoundersBarChartData.map((entry) => (
                                              <Cell key={`founders-sum-cell-${entry.founder_key}`} fill={entry.fill} />
                                            ))}
                                            <LabelList
                                              dataKey="amount"
                                              position="right"
                                              formatter={(value) => `${formatBalanceAmount(value)} ${getCurrencyLabelByCode(foundersChartCurrencyResolved)}`}
                                              style={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }}
                                            />
                                          </Bar>
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      </>
                    )}
                      </>
                    )}

                    {foundersInnerTab === 'expenses' && (
                      <>
                        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                          <Form.Control
                            type="date"
                            className="form-control-custom"
                            style={{ width: '170px' }}
                            value={foundersAnalyticsFilter.start_date}
                            onChange={(e) => setFoundersAnalyticsFilter((prev) => ({ ...prev, start_date: e.target.value }))}
                          />
                          <Form.Control
                            type="date"
                            className="form-control-custom"
                            style={{ width: '170px' }}
                            value={foundersAnalyticsFilter.end_date}
                            onChange={(e) => setFoundersAnalyticsFilter((prev) => ({ ...prev, end_date: e.target.value }))}
                          />
                          <Form.Select
                            className="form-control-custom"
                            style={{ width: '230px' }}
                            value={organizationExpensesFilter.category_id}
                            onChange={(e) => setOrganizationExpensesFilter((prev) => ({ ...prev, category_id: e.target.value, page: 1 }))}
                          >
                            <option value="">{language === 'uz' ? 'Barcha maqolalar' : 'Все статьи'}</option>
                            {organizationExpenseCategoryOptions.map((item) => (
                              <option key={`expense-category-filter-${item.id}`} value={item.id}>
                                {language === 'uz'
                                  ? (item.name_uz || item.name_ru || `#${item.id}`)
                                  : (item.name_ru || item.name_uz || `#${item.id}`)}
                              </option>
                            ))}
                          </Form.Select>
                          <Form.Select
                            className="form-control-custom"
                            style={{ width: '150px' }}
                            value={organizationExpensesFilter.currency_code}
                            onChange={(e) => setOrganizationExpensesFilter((prev) => ({ ...prev, currency_code: e.target.value, page: 1 }))}
                          >
                            <option value="">{language === 'uz' ? 'Barcha valyutalar' : 'Все валюты'}</option>
                            {organizationExpensesCurrencyOptions.map((currencyCode) => (
                              <option key={`expense-currency-filter-${currencyCode}`} value={currencyCode}>
                                {getCurrencyLabelByCode(currencyCode)}
                              </option>
                            ))}
                          </Form.Select>
                          <Form.Control
                            className="form-control-custom"
                            style={{ minWidth: '220px', maxWidth: '280px' }}
                            value={organizationExpensesFilter.search}
                            onChange={(e) => setOrganizationExpensesFilter((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
                            placeholder={language === 'uz' ? "Qidiruv: maqola/izoh" : 'Поиск: статья/описание'}
                          />
                          <Button
                            className="btn-primary-custom ms-auto"
                            onClick={openCreateOrganizationExpenseModal}
                          >
                            <i className="bi bi-plus-lg me-2" />
                            {language === 'uz' ? "Xarajat qo'shish" : 'Добавить расход'}
                          </Button>
                        </div>

                        <Row className="g-3 mb-3">
                          {(organizationExpensesData.totals_by_currency || []).map((item) => (
                            <Col xs={12} md={6} xl={4} key={`expense-total-currency-${item.currency_code}`}>
                              <Card className="admin-card border-0 h-100">
                                <Card.Body className="p-3">
                                  <div className="small text-muted mb-1">
                                    {language === 'uz' ? 'Jami xarajat' : 'Всего расходов'}
                                  </div>
                                  <div className="fw-bold fs-5 mb-1">
                                    {formatBalanceAmount(item.amount || 0)} {getCurrencyLabelByCode(item.currency_code)}
                                  </div>
                                  <div className="small text-muted">
                                    {language === 'uz' ? 'Yozuvlar:' : 'Записей:'} {item.records_count || 0}
                                  </div>
                                </Card.Body>
                              </Card>
                            </Col>
                          ))}
                        </Row>

                        <Card className="admin-card border-0">
                          <Card.Body className="p-0">
                            {organizationExpensesLoading ? (
                              <TableSkeleton
                                rows={10}
                                columns={7}
                                label={language === 'uz' ? "Xarajatlar yuklanmoqda" : 'Загрузка расходов'}
                              />
                            ) : (
                              <div className="admin-table-container">
                                <Table responsive className="admin-table mb-0">
                                  <thead>
                                    <tr>
                                      <th style={{ width: 172 }}>{language === 'uz' ? 'Sana va vaqt' : 'Дата и время'}</th>
                                      <th>{language === 'uz' ? 'Maqola' : 'Статья расхода'}</th>
                                      <th style={{ width: 140 }}>{language === 'uz' ? 'Valyuta' : 'Валюта'}</th>
                                      <th className="text-end" style={{ width: 160 }}>{language === 'uz' ? 'Summa' : 'Сумма'}</th>
                                      <th>{language === 'uz' ? 'Izoh' : 'Описание'}</th>
                                      <th style={{ width: 190 }}>{language === 'uz' ? 'Kim kiritdi' : 'Кто добавил'}</th>
                                      <th className="text-end" style={{ width: 120 }}>{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(organizationExpensesData.items || []).map((item) => (
                                      <tr key={`expense-item-${item.id}`}>
                                        <td>{formatCompactDateTime(item.created_at || item.expense_date)}</td>
                                        <td>
                                          <div className="fw-semibold">
                                            {language === 'uz'
                                              ? (item.category_name_uz || item.category_name_ru || '—')
                                              : (item.category_name_ru || item.category_name_uz || '—')}
                                          </div>
                                          {item.category_code && (
                                            <div className="small text-muted">{item.category_code}</div>
                                          )}
                                        </td>
                                        <td>{getCurrencyLabelByCode(item.currency_code)}</td>
                                        <td className="text-end fw-semibold">
                                          {formatBalanceAmount(item.amount || 0)}
                                        </td>
                                        <td>{item.description || '—'}</td>
                                        <td>{resolveFounderActorDisplayName(item.actor_name, item.actor_username, item.actor_phone)}</td>
                                        <td className="text-end">
                                          <div className="sa-founders-row-actions">
                                            <Button
                                              type="button"
                                              variant="light"
                                              className="sa-founders-icon-btn"
                                              onClick={() => openEditOrganizationExpenseModal(item)}
                                              title={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                              aria-label={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                            >
                                              <Pencil size={15} strokeWidth={2.1} />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="light"
                                              className="sa-founders-icon-btn is-danger"
                                              onClick={() => deleteOrganizationExpense(item)}
                                              title={language === 'uz' ? "O'chirish" : 'Удалить'}
                                              aria-label={language === 'uz' ? "O'chirish" : 'Удалить'}
                                            >
                                              <Trash2 size={15} strokeWidth={2.2} />
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                    {(organizationExpensesData.items || []).length === 0 && (
                                      <tr>
                                        <td colSpan={7} className="text-center py-5 text-muted">
                                          {language === 'uz' ? "Xarajat yozuvlari yo'q" : 'Записей расходов пока нет'}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </Table>
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      </>
                    )}

                    {foundersInnerTab === 'categories' && (
                      <>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div className="small text-muted">
                            {language === 'uz'
                              ? "Tizimdagi statik maqolalar saqlanadi, qo'shimcha maqolani qo'lda qo'shishingiz mumkin."
                              : 'Системные статьи закреплены, вы можете добавить и свои статьи расходов.'}
                          </div>
                          <Button className="btn-primary-custom" onClick={openCreateExpenseCategoryModal}>
                            <i className="bi bi-plus-lg me-2" />
                            {language === 'uz' ? "Maqola qo'shish" : 'Добавить статью'}
                          </Button>
                        </div>

                        <Card className="admin-card border-0">
                          <Card.Body className="p-0">
                            {organizationExpenseCategoriesLoading ? (
                              <TableSkeleton
                                rows={10}
                                columns={6}
                                label={language === 'uz' ? "Maqolalar yuklanmoqda" : 'Загрузка статей расходов'}
                              />
                            ) : (
                              <div className="admin-table-container">
                                <Table responsive className="admin-table mb-0">
                                  <thead>
                                    <tr>
                                      <th style={{ width: 90 }}>ID</th>
                                      <th>{language === 'uz' ? 'Maqola (RU)' : 'Статья (RU)'}</th>
                                      <th>{language === 'uz' ? 'Maqola (UZ)' : 'Статья (UZ)'}</th>
                                      <th style={{ width: 150 }}>{language === 'uz' ? 'Turi' : 'Тип'}</th>
                                      <th style={{ width: 160 }}>{language === 'uz' ? 'Yozuvlar' : 'Записей'}</th>
                                      <th className="text-end" style={{ width: 180 }}>{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {organizationExpenseCategoryRowsById.map((item) => (
                                      <tr key={`expense-category-row-${item.id}`}>
                                        <td>{item.id}</td>
                                        <td>{item.name_ru || '—'}</td>
                                        <td>{item.name_uz || '—'}</td>
                                        <td>
                                          <Badge bg={item.is_system ? 'secondary' : 'primary'} className="badge-custom">
                                            {item.is_system
                                              ? (language === 'uz' ? 'Tizim' : 'Системная')
                                              : (language === 'uz' ? 'Custom' : 'Пользовательская')}
                                          </Badge>
                                        </td>
                                        <td>{item.expenses_count || 0}</td>
                                        <td className="text-end">
                                          <div className="sa-founders-row-actions">
                                            <Button
                                              type="button"
                                              variant="light"
                                              className="sa-founders-icon-btn"
                                              onClick={() => openEditExpenseCategoryModal(item)}
                                              title={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                              aria-label={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                                            >
                                              <Pencil size={15} strokeWidth={2.1} />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="light"
                                              className="sa-founders-icon-btn is-danger"
                                              onClick={() => deleteExpenseCategory(item)}
                                              disabled={item.is_system || Number(item.expenses_count || 0) > 0}
                                              title={language === 'uz' ? "O'chirish" : 'Удалить'}
                                              aria-label={language === 'uz' ? "O'chirish" : 'Удалить'}
                                            >
                                              <Trash2 size={15} strokeWidth={2.2} />
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                    {organizationExpenseCategoryRowsById.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="text-center py-5 text-muted">
                                          {language === 'uz' ? "Maqolalar topilmadi" : 'Статьи расходов пока не добавлены'}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </Table>
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      </>
                    )}
                    </div>
                  </>
                )}
              </Tab>

              {/* Billing Settings Tab */}
              <Tab eventKey="billing" title={renderSuperAdminSidebarTabTitle('billing')}>
                <Form onSubmit={(e) => { e.preventDefault(); saveBillingSettings(); }}>
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">{t('billingGlobalSettings')}</h5>
                    <Button type="submit" className="btn-primary-custom px-4">
                      <span className="d-none d-sm-inline">{t('saveSettings')}</span>
                      <span className="d-sm-none">Сохранить</span>
                    </Button>
                  </div>

                  <div className="superadmin-billing-settings-grid mb-4">
                    <Alert
                      variant={actionButtonsVisible ? 'warning' : 'secondary'}
                      className="superadmin-setting-surface mb-0"
                      style={{ background: 'var(--surface-color)', color: 'var(--text-main)' }}
                    >
                      <div className="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3">
                        <div>
                          <div className="fw-bold">Безопасный режим кнопок действий</div>
                          <div className="small text-muted">
                            Кнопки “Изменить/Удалить” скрыты по умолчанию. Включение действует 10 минут.
                            {actionButtonsVisible ? ` Осталось: ${actionButtonsRemainingLabel}` : ''}
                          </div>
                        </div>
                        <Form.Check
                          type="switch"
                          id="superadmin-action-buttons-visibility-switch"
                          className="fw-semibold"
                          label={actionButtonsVisible ? 'Кнопки действий видимы' : 'Показать кнопки действий на 10 минут'}
                          checked={actionButtonsVisible}
                          onChange={(e) => setActionButtonsVisible(e.target.checked)}
                        />
                      </div>
                    </Alert>

                    <Alert
                      variant="light"
                      className="superadmin-setting-surface mb-0"
                      style={{ background: 'var(--surface-color)', color: 'var(--text-main)' }}
                    >
                      <div className="d-flex flex-column gap-3">
                        <div>
                          <div className="fw-bold">Сезонная анимация каталога для клиентов</div>
                          <div className="small text-muted">
                            Можно включить только один сезон. Если выключить активный переключатель, останется режим "Все выключено".
                          </div>
                        </div>
                        <Row className="g-2">
                          {CATALOG_ANIMATION_SEASON_OPTIONS.map((option) => (
                            <Col xs={12} md={6} key={option.value}>
                              <Form.Check
                                type="switch"
                                id={`catalog-animation-season-${option.value}`}
                                className="fw-semibold"
                                label={option.label}
                                checked={billingSettings.catalog_animation_season === option.value}
                                onChange={(e) => {
                                  const isChecked = !!e.target.checked;
                                  setBillingSettings((prev) => ({
                                    ...prev,
                                    catalog_animation_season: isChecked ? option.value : 'off'
                                  }));
                                }}
                              />
                            </Col>
                          ))}
                        </Row>
                        <div className="small text-muted">
                          Текущий режим: <strong>{billingSettings.catalog_animation_season === 'off'
                            ? 'Все выключено'
                            : (CATALOG_ANIMATION_SEASON_OPTIONS.find((item) => item.value === billingSettings.catalog_animation_season)?.label || 'Все выключено')}</strong>
                        </div>
                      </div>
                    </Alert>
                  </div>

                  {false && (
                    <>
      <Alert
        variant={isAiFeatureEnabled ? 'light' : 'warning'}
        className="superadmin-setting-surface mb-4"
        style={{ background: 'var(--surface-color)', color: 'var(--text-main)' }}
      >
                    <div className="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3">
                      <div>
                        <div className="fw-bold">
                          {language === 'uz' ? 'AI funksiyalari' : 'AI функционал'}
                        </div>
                        <div className="small text-muted">
                          {language === 'uz'
                            ? "O'chirilsa, superadmin panelidagi AI matn va rasm preview tugmalari ishlamaydi."
                            : 'При выключении AI-кнопки генерации текста и preview изображений в суперадминке не работают.'}
                        </div>
                      </div>
                      <Form.Check
                        type="switch"
                        id="superadmin-ai-enabled-switch"
                        className="fw-semibold"
                        label={isAiFeatureEnabled
                          ? (language === 'uz' ? 'AI yoqilgan' : 'AI включен')
                          : (language === 'uz' ? "AI o'chirilgan" : 'AI выключен')}
                        checked={isAiFeatureEnabled}
                        onChange={(e) => setBillingSettings((prev) => ({
                          ...prev,
                          ai_enabled: !!e.target.checked
                        }))}
                      />
                    </div>
                  </Alert>

                  <Card className="admin-card admin-section-panel mb-4">
                    <Card.Header className="admin-section-panel-header py-3 d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-2">
                      <h6 className="mb-0 fw-bold">AI провайдеры и ключи</h6>
                      <div className="d-flex gap-2">
                        <Button
                          type="button"
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => {
                            loadAiProviders();
                            loadAiUsageSummary(aiUsageDays);
                          }}
                          disabled={aiProvidersLoading || aiUsageLoading}
                        >
                          Обновить
                        </Button>
                        <Button
                          type="button"
                          className="btn-primary-custom"
                          size="sm"
                          onClick={addAiProviderDraft}
                        >
                          + Добавить
                        </Button>
                      </div>
                    </Card.Header>
                    <Card.Body className="p-4">
                      <Row className="g-2 mb-3">
                        <Col xs={6} md={3}>
                          <div className="small text-muted">Запросов ({aiUsageSummary.days} дн.)</div>
                          <div className="fw-bold">{Number(aiUsageSummary?.totals?.total_requests || 0)}</div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">Успех / Ошибки</div>
                          <div className="fw-bold">
                            {Number(aiUsageSummary?.totals?.success_requests || 0)} / {Number(aiUsageSummary?.totals?.failed_requests || 0)}
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">Текст (шт)</div>
                          <div className="fw-bold">{Number(aiUsageSummary?.totals?.text_requests || 0)}</div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">Фото (шт)</div>
                          <div className="fw-bold">{Number(aiUsageSummary?.totals?.image_requests || 0)}</div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">USD всего</div>
                          <div className="fw-bold">${Number(aiUsageSummary?.totals?.estimated_cost_usd || 0).toFixed(3)}</div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">USD текст</div>
                          <div className="fw-bold">${Number(aiUsageSummary?.totals?.text_estimated_cost_usd || 0).toFixed(3)}</div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">USD фото</div>
                          <div className="fw-bold">${Number(aiUsageSummary?.totals?.image_estimated_cost_usd || 0).toFixed(3)}</div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="small text-muted">Ошибки квоты</div>
                          <div className="fw-bold">{Number(aiUsageSummary?.totals?.quota_related_errors || 0)}</div>
                        </Col>
                      </Row>

                      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                        <Form.Select
                          style={{ width: 170 }}
                          value={aiUsageDays}
                          onChange={(e) => setAiUsageDays(Number(e.target.value) || 30)}
                        >
                          <option value={7}>7 дней</option>
                          <option value={14}>14 дней</option>
                          <option value={30}>30 дней</option>
                          <option value={60}>60 дней</option>
                          <option value={90}>90 дней</option>
                        </Form.Select>
                        {aiUsageLoading && <small className="text-muted">Загрузка статистики...</small>}
                      </div>

                      {aiProvidersLoading ? (
                        <div className="text-muted">Загрузка AI-провайдеров...</div>
                      ) : (
                        <>
                          {aiProviders.length === 0 && (
                            <Alert variant="secondary" className="mb-3">
                              Провайдеры не добавлены. Нажмите “+ Добавить”.
                            </Alert>
                          )}
                          {aiProviders.map((provider) => {
                            const providerKey = getAiProviderKey(provider);
                            const isSaving = aiProviderSavingId === providerKey;
                            const isDeleting = provider.id && aiProviderDeletingId === provider.id;
                            const isTesting = provider.id && aiProviderTestingId === provider.id;
                            const providerTypeMeta = getAiProviderTypeMeta(provider.provider_type);
                            const providerTitle = String(provider.name || '').trim() || 'Новый провайдер';
                            return (
                              <div key={providerKey} className="border rounded-3 p-3 mb-3 bg-light">
                                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                                  <div className="d-flex align-items-center gap-2">
                                    <img
                                      src={providerTypeMeta.icon}
                                      alt={providerTypeMeta.label}
                                      width={20}
                                      height={20}
                                      style={{ objectFit: 'contain', borderRadius: 4 }}
                                    />
                                    <span className="fw-semibold">{providerTitle}</span>
                                    <Badge
                                      bg={providerTypeMeta.badge}
                                      className={providerTypeMeta.badge === 'warning' ? 'text-dark' : undefined}
                                    >
                                      {providerTypeMeta.label}
                                    </Badge>
                                  </div>
                                  <div className="d-flex flex-wrap align-items-center gap-1">
                                    <Badge bg={provider.is_enabled !== false ? 'success' : 'secondary'}>
                                      {provider.is_enabled !== false ? 'Включен' : 'Выключен'}
                                    </Badge>
                                    <Badge bg={provider.is_active === true ? 'primary' : 'secondary'}>
                                      {provider.is_active === true ? 'Активный' : 'Не активный'}
                                    </Badge>
                                  </div>
                                </div>
                                <Row className="g-2 align-items-end">
                                  <Col md={3}>
                                    <Form.Label className="small fw-semibold mb-1">Название</Form.Label>
                                    <Form.Control
                                      value={provider.name}
                                      onChange={(e) => updateAiProviderDraft(providerKey, { name: e.target.value })}
                                      placeholder="Например: Gemini Main"
                                    />
                                  </Col>
                                  <Col md={2}>
                                    <Form.Label className="small fw-semibold mb-1">Тип</Form.Label>
                                    <div className="input-group">
                                      <span className="input-group-text bg-white px-2">
                                        <img
                                          src={providerTypeMeta.icon}
                                          alt={providerTypeMeta.label}
                                          width={18}
                                          height={18}
                                          style={{ objectFit: 'contain' }}
                                        />
                                      </span>
                                      <Form.Select
                                        value={provider.provider_type}
                                        onChange={(e) => updateAiProviderDraft(providerKey, { provider_type: e.target.value })}
                                      >
                                        {AI_PROVIDER_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </Form.Select>
                                    </div>
                                  </Col>
                                  <Col md={3}>
                                    <Form.Label className="small fw-semibold mb-1">API key</Form.Label>
                                    <div className="d-flex gap-2">
                                      <Form.Control
                                        type="password"
                                        value={provider.api_key}
                                        onChange={(e) => updateAiProviderDraft(providerKey, {
                                          api_key: e.target.value,
                                          clear_api_key: false
                                        })}
                                        placeholder={provider.has_api_key ? `Сохранён: ${provider.api_key_masked || '••••'}` : 'Введите ключ'}
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={provider.clear_api_key ? 'danger' : 'outline-secondary'}
                                        onClick={() => updateAiProviderDraft(providerKey, {
                                          api_key: '',
                                          clear_api_key: !provider.clear_api_key
                                        })}
                                        title="Очистить сохраненный ключ при следующем сохранении"
                                        disabled={isSaving || isDeleting || isTesting}
                                      >
                                        Очистить
                                      </Button>
                                    </div>
                                    {provider.clear_api_key ? (
                                      <div className="small text-danger mt-1">Ключ будет удален после нажатия “Сохранить”.</div>
                                    ) : (
                                      provider.provider_type === 'pollinations' && (
                                        <div className="small text-muted mt-1">Для Pollinations ключ можно оставить пустым.</div>
                                      )
                                    )}
                                  </Col>
                                  <Col md={2}>
                                    <Form.Label className="small fw-semibold mb-1">Image model</Form.Label>
                                    <Form.Control
                                      value={provider.image_model || ''}
                                      onChange={(e) => updateAiProviderDraft(providerKey, { image_model: e.target.value })}
                                      placeholder="gemini-2.5-flash-image"
                                    />
                                  </Col>
                                  <Col md={2}>
                                    <Form.Label className="small fw-semibold mb-1">Text model</Form.Label>
                                    <Form.Control
                                      value={provider.text_model || ''}
                                      onChange={(e) => updateAiProviderDraft(providerKey, { text_model: e.target.value })}
                                      placeholder="gemini-2.5-flash"
                                    />
                                  </Col>
                                  <Col md={2}>
                                    <Form.Label className="small fw-semibold mb-1">Приоритет</Form.Label>
                                    <Form.Control
                                      type="number"
                                      min="1"
                                      max="9999"
                                      value={provider.priority}
                                      onChange={(e) => updateAiProviderDraft(providerKey, { priority: e.target.value })}
                                    />
                                  </Col>
                                  <Col md={3} className="d-flex flex-wrap gap-3 align-items-center">
                                    <Form.Check
                                      type="switch"
                                      id={`ai-provider-enabled-${providerKey}`}
                                      label="Включен"
                                      checked={provider.is_enabled !== false}
                                      onChange={(e) => updateAiProviderDraft(providerKey, { is_enabled: !!e.target.checked })}
                                    />
                                    <Form.Check
                                      type="switch"
                                      id={`ai-provider-active-intent-${providerKey}`}
                                      label="Активный"
                                      checked={provider.is_active === true}
                                      onChange={(e) => {
                                        const shouldActivate = !!e.target.checked;
                                        updateAiProviderDraft(providerKey, shouldActivate
                                          ? { is_active: true, is_enabled: true }
                                          : { is_active: false });
                                      }}
                                    />
                                  </Col>
                                  <Col md={7} className="d-flex flex-wrap gap-2 justify-content-md-end">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline-secondary"
                                      onClick={() => testAiProvider(provider)}
                                      disabled={!provider.id || isSaving || isDeleting || isTesting}
                                      title="Проверить токен и модели (текст + фото)"
                                      aria-label="Проверить токен и модели"
                                    >
                                      {isTesting ? (
                                        <>
                                          <Spinner animation="border" size="sm" className="me-1" />
                                          Проверка...
                                        </>
                                      ) : (
                                        <i className="bi bi-patch-check" aria-hidden="true" />
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="btn-primary-custom"
                                      onClick={() => saveAiProvider(provider)}
                                      disabled={isSaving || isDeleting || isTesting}
                                    >
                                      {isSaving ? 'Сохранение...' : 'Сохранить'}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline-danger"
                                      onClick={() => removeAiProvider(provider)}
                                      disabled={isSaving || isDeleting || isTesting}
                                    >
                                      {isDeleting ? 'Удаление...' : 'Удалить'}
                                    </Button>
                                  </Col>
                                </Row>
                              </div>
                            );
                          })}
                        </>
                      )}

                      <div className="small text-muted mt-2">
                        Примечание: включите тумблер "Активный" у нужного провайдера и нажмите "Сохранить" — предыдущий активный выключится автоматически.
                        ENV-ключи используются только когда активный провайдер не задан.
                        Для кнопки проверки провайдер должен быть активным, иначе будет ошибка.
                      </div>

                      {Array.isArray(aiUsageSummary.by_provider) && aiUsageSummary.by_provider.length > 0 && (
                        <div className="mt-4">
                          <div className="fw-semibold mb-2">По провайдерам</div>
                          <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0">
                              <thead>
                                <tr>
                                  <th>Провайдер</th>
                                  <th>Тип</th>
                                  <th className="text-end">Всего</th>
                                  <th className="text-end">Текст</th>
                                  <th className="text-end">Фото</th>
                                  <th className="text-end">Успех</th>
                                  <th className="text-end">Ошибки</th>
                                  <th className="text-end">USD всего</th>
                                  <th className="text-end">USD текст</th>
                                  <th className="text-end">USD фото</th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiUsageSummary.by_provider.map((row, index) => {
                                  const rowTypeMeta = getAiProviderTypeMeta(row.provider_type);
                                  return (
                                    <tr key={`${row.provider_name || 'provider'}-${index}`}>
                                      <td>{row.provider_name || '-'}</td>
                                      <td>
                                        <div className="d-flex align-items-center gap-2">
                                          <img
                                            src={rowTypeMeta.icon}
                                            alt={rowTypeMeta.label}
                                            width={16}
                                            height={16}
                                            style={{ objectFit: 'contain', borderRadius: 4 }}
                                          />
                                          <span>{rowTypeMeta.label}</span>
                                        </div>
                                      </td>
                                      <td className="text-end">{Number(row.requests || 0)}</td>
                                      <td className="text-end">{Number(row.text_requests || 0)}</td>
                                      <td className="text-end">{Number(row.image_requests || 0)}</td>
                                      <td className="text-end">{Number(row.success_requests || 0)}</td>
                                      <td className="text-end">{Number(row.failed_requests || 0)}</td>
                                      <td className="text-end">${Number(row.estimated_cost_usd || 0).toFixed(3)}</td>
                                      <td className="text-end">${Number(row.text_estimated_cost_usd || 0).toFixed(3)}</td>
                                      <td className="text-end">${Number(row.image_estimated_cost_usd || 0).toFixed(3)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {Array.isArray(aiUsageSummary.recent_errors) && aiUsageSummary.recent_errors.length > 0 && (
                        <div className="mt-4">
                          <div className="fw-semibold mb-2">Последние ошибки AI</div>
                          <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0">
                              <thead>
                                <tr>
                                  <th>Время</th>
                                  <th>Провайдер</th>
                                  <th>Операция</th>
                                  <th>Код / HTTP</th>
                                  <th>Сообщение</th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiUsageSummary.recent_errors.slice(0, 10).map((row, index) => {
                                  const rowTypeMeta = getAiProviderTypeMeta(row.provider_type);
                                  return (
                                    <tr key={`ai-error-${index}`}>
                                      <td>{row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '-'}</td>
                                      <td>
                                        <div className="d-flex align-items-center gap-2">
                                          <img
                                            src={rowTypeMeta.icon}
                                            alt={rowTypeMeta.label}
                                            width={16}
                                            height={16}
                                            style={{ objectFit: 'contain', borderRadius: 4 }}
                                          />
                                          <span>{row.provider_name || rowTypeMeta.label || '-'}</span>
                                        </div>
                                      </td>
                                      <td>{row.operation || '-'}</td>
                                      <td>
                                        {String(row.error_code || '').trim() || '-'}
                                        {row.http_status ? ` / ${row.http_status}` : ''}
                                      </td>
                                      <td>{String(row.error_message || '').trim().slice(0, 140) || '-'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                    </>
                  )}

                  <Row className="g-4">
                    <Col md={7}>
                      <Card className="admin-card admin-section-panel h-100">
                        <Card.Header className="admin-section-panel-header py-3">
                          <h6 className="mb-0 fw-bold">{t('paymentRequisitesInfo')}</h6>
                        </Card.Header>
                        <Card.Body className="p-4">
                          <Row className="g-3">
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">{t('cardNumber')}</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="8600 ...."
                                  inputMode="numeric"
                                  value={formatCardNumberMasked(billingSettings.card_number)}
                                  onChange={e => setBillingSettings({
                                    ...billingSettings,
                                    card_number: String(e.target.value || '').replace(/\D/g, '').slice(0, 19)
                                  })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">{t('cardHolder')}</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="Имя Фамилия"
                                  value={billingSettings.card_holder}
                                  onChange={e => setBillingSettings({ ...billingSettings, card_holder: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">{t('phoneNumber')}</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="+998 ..."
                                  value={billingSettings.phone_number}
                                  onChange={e => setBillingSettings({ ...billingSettings, phone_number: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">Telegram Username</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="@username"
                                  value={billingSettings.telegram_username}
                                  onChange={e => setBillingSettings({ ...billingSettings, telegram_username: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase d-flex align-items-center">
                                  <img src="/click.png" alt="Click" style={{ height: 16, objectFit: 'contain' }} />
                                </Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="https://click.uz/..."
                                  value={billingSettings.click_link}
                                  onChange={e => setBillingSettings({ ...billingSettings, click_link: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase d-flex align-items-center">
                                  <img src="/payme.png" alt="Payme" style={{ height: 16, objectFit: 'contain' }} />
                                </Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="https://payme.uz/..."
                                  value={billingSettings.payme_link}
                                  onChange={e => setBillingSettings({ ...billingSettings, payme_link: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>
                    </Col>

                    <Col md={5}>
                      <Card className="admin-card admin-section-panel h-100">
                        <Card.Header className="admin-section-panel-header py-3">
                          <h6 className="mb-0 fw-bold">{t('defaultFinancialParams')}</h6>
                        </Card.Header>
                        <Card.Body className="p-4">
                          <Form.Group className="mb-4">
                            <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">
                              Токен центрального Telegram-бота
                            </Form.Label>
                            <div className="position-relative">
                              <Form.Control
                                type={isCentralTokenVisible ? 'text' : 'password'}
                                className="form-control-custom"
                                placeholder="123456789:AA..."
                                value={billingSettings.superadmin_bot_token || ''}
                                style={{ paddingRight: '2.4rem' }}
                                onChange={e => {
                                  setIsCentralTokenVisible(false);
                                  setBillingSettings({
                                    ...billingSettings,
                                    superadmin_bot_token: e.target.value,
                                    superadmin_bot_name: '',
                                    superadmin_bot_username: ''
                                  });
                                }}
                              />
                              <Button
                                type="button"
                                variant="link"
                                className="position-absolute top-50 end-0 translate-middle-y text-muted p-0 me-2"
                                style={{ lineHeight: 1 }}
                                onClick={handleCentralTokenPreview}
                                disabled={!billingSettings.superadmin_bot_token}
                                title={isCentralTokenVisible ? 'Скрыть токен' : 'Показать на 2 секунды'}
                                aria-label={isCentralTokenVisible ? 'Скрыть токен' : 'Показать токен'}
                              >
                                <i className={`bi ${isCentralTokenVisible ? 'bi-eye-slash' : 'bi-eye'}`} />
                              </Button>
                            </div>
                            <Form.Text className="text-muted small">
                              Используется для центрального onboarding-бота. После сохранения бот перезапускается автоматически.
                            </Form.Text>
                          </Form.Group>

                          <Row className="g-3 mb-4">
                            <Col md={6}>
                              <Form.Group className="mb-0">
                                <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">
                                  Название бота
                                </Form.Label>
                                <Form.Control
                                  type="text"
                                  className="form-control-custom"
                                  value={billingSettings.superadmin_bot_name || ''}
                                  readOnly
                                  placeholder="Появится после сохранения/проверки токена"
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-0">
                                <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">
                                  Никнейм бота
                                </Form.Label>
                                <Form.Control
                                  type="text"
                                  className="form-control-custom"
                                  value={billingSettings.superadmin_bot_username || ''}
                                  readOnly
                                  placeholder="@username"
                                />
                              </Form.Group>
                            </Col>
                          </Row>

                          <Form.Group className="mb-4">
                            <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">
                              Telegram ID владельца суперадминки
                            </Form.Label>
                            <Form.Control
                              type="text"
                              className="form-control-custom"
                              placeholder="например: 123456789"
                              value={billingSettings.superadmin_telegram_id || ''}
                              onChange={e => setBillingSettings({ ...billingSettings, superadmin_telegram_id: e.target.value })}
                            />
                            <Form.Text className="text-muted small">
                              На этот ID отправляется подтверждение при смене токена центрального бота.
                            </Form.Text>
                          </Form.Group>

                          <div className="mb-4">
                            <Button
                              type="button"
                              className="btn-primary-custom px-3"
                              onClick={testCentralBot}
                              disabled={isTestingCentralBot || !billingSettings.superadmin_bot_token || !billingSettings.superadmin_telegram_id}
                            >
                              {isTestingCentralBot ? (
                                <>
                                  <Spinner animation="border" size="sm" className="me-2" />
                                  Проверка...
                                </>
                              ) : 'Проверить'}
                            </Button>
                            <div className="text-muted small mt-2">
                              Отправит тестовый текст "Бот работает" на указанный Telegram ID.
                            </div>
                          </div>

                          <Form.Group className="mb-0">
                            <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">{t('defaultStartingBalance')}</Form.Label>
                            <Form.Control
                              type="text"
                              inputMode="numeric"
                              className="form-control-custom"
                              value={formatThousands(billingSettings.default_starting_balance)}
                              onChange={e => setBillingSettings({
                                ...billingSettings,
                                default_starting_balance: String(e.target.value || '').replace(/\D/g, '')
                              })}
                            />
                            <Form.Text className="text-muted small">
                              Бонус при создании нового заведения
                            </Form.Text>
                          </Form.Group>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Form>
              </Tab>

              <Tab eventKey="ai_settings" title={renderSuperAdminSidebarTabTitle('ai_settings')}>
                {renderAiSettingsPanel()}
              </Tab>

              <Tab eventKey="security" title={renderSuperAdminSidebarTabTitle('security')}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">
                    {language === 'uz' ? 'Tizim hujumlari monitori' : 'Мониторинг атак на систему'}
                  </h5>
                  <Button variant="outline-secondary" className="btn-mobile-filter d-lg-none ms-auto" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> {language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                  </Button>
                  <div className="d-none d-lg-flex align-items-center gap-2 ms-auto">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showSecurityFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowSecurityFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showSecurityFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => {
                        loadSecurityEvents();
                        loadSecurityStats();
                      }}
                      disabled={securityEventsLoading || securityStatsLoading}
                    >
                      {language === 'uz' ? 'Yangilash' : 'Обновить'}
                    </Button>
                  </div>
                </div>

                {showSecurityFilterPanel && (
                  <div className="d-none d-lg-flex gap-2 align-items-center flex-wrap mb-3">
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      style={{ width: '240px' }}
                      placeholder={language === 'uz' ? "Qidiruv (IP, yo'l, tafsilot)" : 'Поиск (IP, путь, детали)'}
                      value={securityFilter.search}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
                    />
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      style={{ width: '160px' }}
                      placeholder="IP"
                      value={securityFilter.source_ip}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, source_ip: e.target.value, page: 1 }))}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '220px' }}
                      value={securityFilter.event_type}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, event_type: e.target.value, page: 1 }))}
                    >
                      <option value="">{language === 'uz' ? 'Barcha hodisalar' : 'Все события'}</option>
                      {securityEventTypeOptions.map((eventType) => (
                        <option key={`security-event-type-${eventType}`} value={eventType}>
                          {formatSecurityEventType(eventType)}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={securityFilter.risk_level}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, risk_level: e.target.value, page: 1 }))}
                    >
                      <option value="">{language === 'uz' ? 'Barcha risklar' : 'Все риски'}</option>
                      <option value="low">{language === 'uz' ? 'Past' : 'Низкий'}</option>
                      <option value="medium">{language === 'uz' ? "O'rtacha" : 'Средний'}</option>
                      <option value="high">{language === 'uz' ? 'Yuqori' : 'Высокий'}</option>
                      <option value="critical">Critical</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={securityFilter.status}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
                    >
                      <option value="">{language === 'uz' ? 'Barcha statuslar' : 'Все статусы'}</option>
                      <option value="open">{language === 'uz' ? 'Ochiq' : 'Открыто'}</option>
                      <option value="resolved">{language === 'uz' ? 'Yechilgan' : 'Решено'}</option>
                    </Form.Select>
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={securityFilter.start_date}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, start_date: e.target.value, page: 1 }))}
                    />
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={securityFilter.end_date}
                      onChange={(e) => setSecurityFilter((prev) => ({ ...prev, end_date: e.target.value, page: 1 }))}
                    />
                    <Button
                      variant="light"
                      className="border form-control-custom text-muted d-flex align-items-center justify-content-center"
                      style={{ height: '38px', padding: '0 15px' }}
                      title={language === 'uz' ? 'Filtrlarni tozalash' : 'Сбросить фильтры'}
                      onClick={() => setSecurityFilter({
                        event_type: '',
                        risk_level: '',
                        status: 'open',
                        source_ip: '',
                        search: '',
                        start_date: '',
                        end_date: '',
                        page: 1,
                        limit: securityFilter.limit
                      })}
                      disabled={!securityFilter.event_type && !securityFilter.risk_level && securityFilter.status === 'open' && !securityFilter.source_ip && !securityFilter.search && !securityFilter.start_date && !securityFilter.end_date}
                    >
                      {language === 'uz' ? 'Tozalash' : 'Сброс'}
                    </Button>
                  </div>
                )}

                {securityStatsLoading ? (
                  <TableSkeleton rows={1} columns={4} label={language === 'uz' ? 'Xavfsizlik statistikasi yuklanmoqda' : 'Загрузка статистики безопасности'} />
                ) : (
                  <Row className="g-3 mb-3">
                    <Col md={3} sm={6}>
                      <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                          <div className="small text-muted">{language === 'uz' ? '24 soat ichida' : 'За 24 часа'}</div>
                          <div className="fs-4 fw-bold">{Number(securityStats?.overview?.total_24h || 0).toLocaleString('ru-RU')}</div>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col md={3} sm={6}>
                      <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                          <div className="small text-muted">{language === 'uz' ? 'Ochiq (24 soat)' : 'Открытые (24 часа)'}</div>
                          <div className="fs-4 fw-bold text-danger">{Number(securityStats?.overview?.open_24h || 0).toLocaleString('ru-RU')}</div>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col md={3} sm={6}>
                      <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                          <div className="small text-muted">{language === 'uz' ? 'Yuqori/Critical (24 soat)' : 'Высокий/Critical (24 часа)'}</div>
                          <div className="fs-4 fw-bold" style={{ color: '#991b1b' }}>
                            {Number(securityStats?.overview?.high_24h || 0).toLocaleString('ru-RU')}
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col md={3} sm={6}>
                      <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                          <div className="small text-muted">{language === 'uz' ? 'Eng faol manba (24 soat)' : 'Топ источник (24 часа)'}</div>
                          <div className="fw-bold text-truncate" title={topSecuritySource24h?.source_ip || '-'}>
                            {topSecuritySource24h?.source_ip || '-'}
                          </div>
                          <div className="small text-muted text-truncate" title={topSecuritySource24h ? formatSecuritySourceLabel(topSecuritySource24h) : '-'}>
                            {topSecuritySource24h ? formatSecuritySourceLabel(topSecuritySource24h) : '-'}
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                )}

                {securityEventsLoading ? (
                  <TableSkeleton rows={8} columns={9} label={language === 'uz' ? 'Xavfsizlik hodisalari yuklanmoqda' : 'Загрузка событий безопасности'} />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table align-middle">
                        <thead>
                          <tr>
                            <th>{language === 'uz' ? 'Sana' : 'Дата'}</th>
                            <th>{language === 'uz' ? 'Manba' : 'Источник'}</th>
                            <th>{language === 'uz' ? 'Hujum turi' : 'Тип атаки'}</th>
                            <th>{language === 'uz' ? 'Maqsad' : 'Цель'}</th>
                            <th>{language === 'uz' ? 'Risk' : 'Риск'}</th>
                            <th>{language === 'uz' ? 'Status' : 'Статус'}</th>
                            <th>{language === 'uz' ? "Do'kon / Foydalanuvchi" : 'Магазин / Пользователь'}</th>
                            <th>{language === 'uz' ? 'Tafsilot' : 'Детали'}</th>
                            <th className="text-end">{language === 'uz' ? 'Amal' : 'Действие'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(securityEventsData.events || []).map((eventItem) => {
                            const riskMeta = getSecurityRiskMeta(eventItem?.risk_level);
                            const statusMeta = getSecurityStatusMeta(eventItem?.status);
                            const isResolved = String(eventItem?.status || '').toLowerCase() === 'resolved';
                            const isUpdating = Number(securityEventStatusUpdatingId) === Number(eventItem?.id);
                            const isDetailsRevealed = Boolean(securityDetailsRevealMap?.[Number(eventItem?.id)]);
                            const canRevealIdentifier = hasSecurityRevealableIdentifier(eventItem);
                            const hasMaskedIdentifier = Boolean(String(eventItem?.details?.identifier || '').trim());
                            return (
                              <tr key={`security-event-${eventItem.id}`}>
                                <td>
                                  <small className="text-muted">{formatBalanceOperationDate(eventItem.created_at)}</small>
                                </td>
                                <td>
                                  <div className="fw-semibold">{eventItem.source_ip || '-'}</div>
                                  <div className="small text-muted">{formatSecuritySourceLabel(eventItem)}</div>
                                </td>
                                <td>
                                  <div className="fw-semibold">{formatSecurityEventType(eventItem.event_type)}</div>
                                  <div className="small text-muted">{eventItem.event_type}</div>
                                </td>
                                <td style={{ minWidth: '180px' }}>
                                  <div className="small">
                                    <strong>{String(eventItem.request_method || '').toUpperCase() || '-'}</strong>
                                    {' '}
                                    {eventItem.request_path || eventItem.target || '-'}
                                  </div>
                                  <div className="small text-muted">
                                    HTTP {eventItem.status_code ?? '-'}
                                  </div>
                                </td>
                                <td>
                                  <Badge className="badge-custom" style={riskMeta.style}>
                                    {riskMeta.label}
                                  </Badge>
                                </td>
                                <td>
                                  <Badge className="badge-custom" style={statusMeta.style}>
                                    {statusMeta.label}
                                  </Badge>
                                </td>
                                <td>
                                  <div className="small fw-semibold">{eventItem.restaurant_name || '-'}</div>
                                  <div className="small text-muted">{eventItem.user_full_name || eventItem.user_username || '-'}</div>
                                </td>
                                <td style={{ maxWidth: '280px' }}>
                                  <div className="small fw-semibold mb-1">
                                    {formatSecurityHumanSummary(eventItem, { revealSensitive: isDetailsRevealed })}
                                  </div>
                                  <div className="d-flex align-items-center gap-2">
                                    <small className="text-muted" title={formatSecurityDetailsSummary(eventItem.details, { revealSensitive: isDetailsRevealed })}>
                                      {formatSecurityDetailsSummary(eventItem.details, { revealSensitive: isDetailsRevealed })}
                                    </small>
                                    {canRevealIdentifier && (
                                      <Button
                                        size="sm"
                                        variant="link"
                                        className="p-0 text-decoration-none"
                                        onClick={() => toggleSecurityDetailsReveal(eventItem.id)}
                                        title={isDetailsRevealed
                                          ? (language === 'uz' ? 'Yashirish' : 'Скрыть')
                                          : (language === 'uz' ? "To'liq ko'rsatish" : 'Показать полностью')}
                                      >
                                        <i className={`bi ${isDetailsRevealed ? 'bi-eye-slash' : 'bi-eye'}`} />
                                      </Button>
                                    )}
                                  </div>
                                  {!canRevealIdentifier && hasMaskedIdentifier && (
                                    <small className="text-muted d-block mt-1">
                                      {language === 'uz'
                                        ? "To'liq qiymat faqat yangi hodisalar uchun mavjud"
                                        : 'Полное значение доступно только для новых событий'}
                                    </small>
                                  )}
                                </td>
                                <td className="text-end">
                                  <Button
                                    size="sm"
                                    variant={isResolved ? 'outline-secondary' : 'outline-success'}
                                    onClick={() => handleSecurityEventStatusToggle(eventItem)}
                                    disabled={isUpdating}
                                  >
                                    {isUpdating
                                      ? (language === 'uz' ? '...' : '...')
                                      : (isResolved
                                        ? (language === 'uz' ? 'Qayta ochish' : 'Переоткрыть')
                                        : (language === 'uz' ? 'Yechildi' : 'Решить'))}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                          {(securityEventsData.events || []).length === 0 && (
                            <tr>
                              <td colSpan="9" className="text-center py-5 text-muted">
                                {language === 'uz' ? "Hodisalar topilmadi" : 'События не найдены'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                    <DataPagination
                      current={securityFilter.page}
                      total={securityEventsData.total}
                      limit={securityFilter.limit}
                      onPageChange={(val) => setSecurityFilter((prev) => ({ ...prev, page: val }))}
                      onLimitChange={(val) => setSecurityFilter((prev) => ({ ...prev, limit: val, page: 1 }))}
                      limitOptions={[15, 20, 30, 50]}
                    />
                  </>
                )}
              </Tab>

              {/* Logs Tab */}
              <Tab eventKey="logs" title={renderSuperAdminSidebarTabTitle('logs')}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0 superadmin-mobile-hide-title">{t('activityLog')}</h5>
                  <Button variant="outline-secondary" className="btn-mobile-filter d-lg-none ms-auto" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> Фильтры
                  </Button>
                  <div className="d-none d-lg-flex align-items-center gap-2 ms-auto">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showLogsFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowLogsFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showLogsFilterPanel}
                    >
                      <FilterIcon />
                    </Button>
                  </div>
                </div>

                {showLogsFilterPanel && (
                  <div className="d-none d-lg-flex gap-2 align-items-center flex-wrap mb-3">
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={logsFilter.start_date}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, start_date: e.target.value, page: 1 }))}
                    />
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={logsFilter.end_date}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, end_date: e.target.value, page: 1 }))}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '180px' }}
                      value={logsFilter.user_id}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, user_id: e.target.value, page: 1 }))}
                    >
                      <option value="">{t('saAllUsers')}</option>
                      {allOperators?.map(op => (
                        <option key={op.id} value={op.id}>{op.full_name || op.username}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={logsFilter.user_role}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, user_role: e.target.value, page: 1 }))}
                    >
                      <option value="">Все роли</option>
                      <option value="operator">Операторы</option>
                      <option value="customer">Клиенты</option>
                      <option value="superadmin">Суперадмины</option>
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={logsFilter.restaurant_id}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, restaurant_id: e.target.value, page: 1 }))}
                    >
                      <option value="">{t('saAllShops')}</option>
                      {allRestaurants?.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={logsFilter.action_type}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, action_type: e.target.value, page: 1 }))}
                    >
                      <option value="">{t('saAllActions')}</option>
                      {logActionFilterOptions.map((item) => (
                        <option key={`desktop-log-action-${item.value}`} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Form.Select>
                    <Button
                      variant="light"
                      className="border form-control-custom text-muted d-flex align-items-center justify-content-center"
                      style={{ height: '38px', padding: '0 15px' }}
                      title="Сбросить фильтры"
                      onClick={() => setLogsFilter({ action_type: '', entity_type: '', restaurant_id: '', user_id: '', user_role: '', start_date: '', end_date: '', page: 1, limit: 15 })}
                      disabled={!logsFilter.action_type && !logsFilter.restaurant_id && !logsFilter.user_id && !logsFilter.user_role && !logsFilter.start_date && !logsFilter.end_date}
                    >
                      Сброс
                    </Button>
                  </div>
                )}

                {isHiddenOpsTelemetryEnabled && (
                  <Card className="admin-card mb-3 border-0">
                    <Card.Body className="py-3">
                      <div className="d-flex flex-column flex-lg-row gap-3 justify-content-between align-items-start align-items-lg-center mb-3">
                        <div>
                          <div className="fw-semibold">Скрытая аналитика устройств и активности</div>
                          <small className="text-muted">
                            Последние {hiddenOpsInsights?.window_hours || hiddenOpsInsightsHours} часов
                          </small>
                        </div>
                        <div className="d-flex gap-2 flex-wrap">
                          <Form.Select
                            className="form-control-custom"
                            style={{ width: '155px' }}
                            value={String(hiddenOpsInsightsHours)}
                            onChange={(e) => setHiddenOpsInsightsHours(Number.parseInt(e.target.value, 10) || 24)}
                          >
                            <option value="6">Последние 6ч</option>
                            <option value="12">Последние 12ч</option>
                            <option value="24">Последние 24ч</option>
                            <option value="48">Последние 48ч</option>
                            <option value="72">Последние 72ч</option>
                            <option value="168">Последние 7 дней</option>
                          </Form.Select>
                          <Button
                            variant="outline-secondary"
                            className="form-control-custom px-3"
                            onClick={() => loadHiddenOpsInsights()}
                            disabled={hiddenOpsInsightsLoading}
                          >
                            {hiddenOpsInsightsLoading ? 'Загрузка...' : 'Обновить'}
                          </Button>
                        </div>
                      </div>

                      {hiddenOpsInsightsError ? (
                        <Alert variant="danger" className="py-2 mb-0">{hiddenOpsInsightsError}</Alert>
                      ) : hiddenOpsInsightsLoading ? (
                        <TableSkeleton rows={4} columns={4} label="Загрузка скрытой аналитики" />
                      ) : hiddenOpsInsights ? (
                        <>
                          <Row className="g-3 mb-3">
                            <Col lg={6}>
                              <div className="p-3 border rounded-3 bg-white h-100">
                                <div className="fw-semibold mb-2">
                                  Операторы: активность {hiddenOpsInsights.operators?.active_in_window || 0} / {hiddenOpsInsights.operators?.total || 0}
                                </div>
                                <div className="small text-muted mb-2">Устройства</div>
                                <div className="d-flex flex-wrap gap-2 mb-3">
                                  {(hiddenOpsInsights.operators?.devices || []).slice(0, 6).map((item) => (
                                    <Badge key={`op-device-${item.label}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                      {item.label}: {item.count} ({formatBucketPercent(item.count, hiddenOpsInsights.operators?.total || 0)})
                                    </Badge>
                                  ))}
                                </div>
                                <div className="small text-muted mb-2">OS / Браузеры</div>
                                <div className="d-flex flex-wrap gap-2">
                                  {(hiddenOpsInsights.operators?.os || []).slice(0, 4).map((item) => (
                                    <Badge key={`op-os-${item.label}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                      {item.label}: {item.count}
                                    </Badge>
                                  ))}
                                  {(hiddenOpsInsights.operators?.browsers || []).slice(0, 4).map((item) => (
                                    <Badge key={`op-browser-${item.label}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                      {item.label}: {item.count}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </Col>
                            <Col lg={6}>
                              <div className="p-3 border rounded-3 bg-white h-100">
                                <div className="fw-semibold mb-2">
                                  Клиенты: активность {hiddenOpsInsights.customers?.active_in_window || 0} / {hiddenOpsInsights.customers?.total || 0}
                                </div>
                                <div className="small text-muted mb-2">Устройства</div>
                                <div className="d-flex flex-wrap gap-2 mb-3">
                                  {(hiddenOpsInsights.customers?.devices || []).slice(0, 6).map((item) => (
                                    <Badge key={`cust-device-${item.label}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                      {item.label}: {item.count} ({formatBucketPercent(item.count, hiddenOpsInsights.customers?.total || 0)})
                                    </Badge>
                                  ))}
                                </div>
                                <div className="small text-muted mb-2">OS / Браузеры</div>
                                <div className="d-flex flex-wrap gap-2">
                                  {(hiddenOpsInsights.customers?.os || []).slice(0, 4).map((item) => (
                                    <Badge key={`cust-os-${item.label}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                      {item.label}: {item.count}
                                    </Badge>
                                  ))}
                                  {(hiddenOpsInsights.customers?.browsers || []).slice(0, 4).map((item) => (
                                    <Badge key={`cust-browser-${item.label}`} className="badge-custom bg-secondary bg-opacity-10 text-muted">
                                      {item.label}: {item.count}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </Col>
                          </Row>

                          <div className="admin-table-container">
                            <Table responsive hover className="admin-table mb-0">
                              <thead>
                                <tr>
                                  <th>Время</th>
                                  <th className="text-end">Операторы (уник.)</th>
                                  <th className="text-end">Клиенты (уник.)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(hiddenOpsInsights.hourly_activity || []).map((point, index) => (
                                  <tr key={`hourly-point-${index}`}>
                                    <td><small className="text-muted">{formatHiddenInsightsHourLabel(point.hour)}</small></td>
                                    <td className="text-end"><strong>{point.operators || 0}</strong></td>
                                    <td className="text-end"><strong>{point.customers || 0}</strong></td>
                                  </tr>
                                ))}
                                {(hiddenOpsInsights.hourly_activity || []).length === 0 && (
                                  <tr>
                                    <td colSpan="3" className="text-center py-4 text-muted">Нет данных активности за выбранный период</td>
                                  </tr>
                                )}
                              </tbody>
                            </Table>
                          </div>
                        </>
                      ) : null}
                    </Card.Body>
                  </Card>
                )}

                {loading ? (
                  <TableSkeleton rows={8} columns={7} label="Загрузка журнала действий" />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>{t('saTableDate')}</th>
                            <th>{t('saTableUser')}</th>
                            <th>Роль</th>
                            <th>{t('saTableAction')}</th>
                            <th>{t('saTableObject')}</th>
                            <th>{t('saTableRestaurant')}</th>
                            <th className="text-end">IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.logs?.map(log => (
                            <tr key={log.id}>
                              <td><small className="text-muted">{formatDate(log.created_at)}</small></td>
                              <td><span className="fw-semibold">{log.user_full_name || log.username}</span></td>
                              <td>
                                <Badge className={`badge-custom sa-role-badge ${log.user_role === 'superadmin' ? 'sa-role-badge-superadmin' : (log.user_role === 'operator' ? 'sa-role-badge-operator' : 'sa-role-badge-customer')}`}>
                                  {log.user_role || '-'}
                                </Badge>
                              </td>
                              <td>
                                <Badge className="badge-custom bg-info bg-opacity-10 text-info">{getActionTypeLabel(log.action_type)}</Badge>
                              </td>
                              <td>
                                <small>{log.entity_name || `${log.entity_type} #${log.entity_id}`}</small>
                                {log?.new_values?.duration_ms ? (
                                  <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                    {log?.new_values?.status_code || 200} · {log.new_values.duration_ms}ms
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">{log.restaurant_name || '-'}</Badge>
                              </td>
                              <td className="text-end"><small className="text-muted">{log.ip_address}</small></td>
                            </tr>
                          ))}
                          {logs.logs?.length === 0 && (
                            <tr><td colSpan="7" className="text-center py-5 text-muted">{t('saEmptyLogs')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={logsFilter.page}
                      total={logs.total}
                      limit={logsFilter.limit}
                      onPageChange={(val) => setLogsFilter(prev => ({ ...prev, page: val }))}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => setLogsFilter(prev => ({ ...prev, limit: val, page: 1 }))}
                    />
                  </>
                )}
              </Tab>
            </Tabs>
            </div>
          </Card.Body>
        </Card>
        </div>

        <Modal
          show={isMobileSidebarOpen}
          onHide={() => setIsMobileSidebarOpen(false)}
          centered
          className="admin-sidebar-mobile-modal d-lg-none"
          dialogClassName="admin-sidebar-mobile-modal-dialog"
          contentClassName="admin-sidebar-mobile-modal-content"
        >
          <Modal.Header closeButton className="admin-sidebar-mobile-modal-header">
            <Modal.Title>{language === 'uz' ? 'Menyu' : 'Меню'}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="admin-sidebar-mobile-modal-body">
            <Nav
              activeKey={activeTab}
              onSelect={handleSidebarTabSelect}
              className="admin-tabs admin-tabs-sidebar admin-sidebar-mobile-nav"
            >
              {renderSuperAdminSidebarNavItems()}
            </Nav>
            {renderSuperAdminMobileMenuExtras()}
          </Modal.Body>
        </Modal>
      </Container>

      <Modal
        show={showAdAnalyticsModal}
        onHide={() => setShowAdAnalyticsModal(false)}
        size="xl"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {adI18n.analyticsTitle}
            {analyticsAdBanner?.title ? ` · ${analyticsAdBanner.title}` : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3 mb-3">
            <div className="d-flex align-items-center gap-3 min-w-0">
              {analyticsAdBanner?.image_url ? (
                <div
                  style={{
                    width: '96px',
                    height: '56px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)',
                    background: '#fff',
                    flexShrink: 0
                  }}
                >
                  <img src={analyticsAdBanner.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : null}
              <div className="min-w-0">
                <div className="fw-semibold text-truncate">{analyticsAdBanner?.title || `ID ${analyticsAdBanner?.id || ''}`}</div>
                <div className="small text-muted">
                  #{analyticsAdBanner?.slot_order || '—'} · {getAdStatusLabel(analyticsAdBanner?.runtime_status)}
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="small text-muted text-nowrap">{adI18n.analyticsRange}:</span>
              <Form.Select
                size="sm"
                className="form-control-custom"
                style={{ minWidth: '140px' }}
                value={String(adBannerAnalyticsDays)}
                onChange={(e) => {
                  const next = e.target.value;
                  setAdBannerAnalyticsDays(next === 'all' ? 'all' : Number(next));
                }}
              >
                <option value="7">7 дней</option>
                <option value="30">30 дней</option>
                <option value="90">90 дней</option>
                <option value="all">{language === 'uz' ? 'Barcha vaqt' : 'За всё время'}</option>
              </Form.Select>
            </div>
          </div>

          {adBannerAnalyticsLoading ? (
            <ListSkeleton count={4} label="Загрузка аналитики баннера" />
          ) : !adBannerAnalytics ? (
            <Alert variant="light" className="mb-0" style={{ border: '1px solid var(--border-color)' }}>
              {adI18n.analyticsNoData}
            </Alert>
          ) : (
            <>
              <Row className="g-3 mb-3">
                <Col xs={6} md={3}>
                  <Card className="h-100 border-0 shadow-sm">
                    <Card.Body>
                      <div className="small text-muted">{adI18n.analyticsViews}</div>
                      <div className="fs-4 fw-bold">{adBannerAnalytics?.overview?.total_views || 0}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={6} md={3}>
                  <Card className="h-100 border-0 shadow-sm">
                    <Card.Body>
                      <div className="small text-muted">{adI18n.analyticsClicks}</div>
                      <div className="fs-4 fw-bold">{adBannerAnalytics?.overview?.total_clicks || 0}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={6} md={3}>
                  <Card className="h-100 border-0 shadow-sm">
                    <Card.Body>
                      <div className="small text-muted">{adI18n.analyticsUnique}</div>
                      <div className="fs-4 fw-bold">{adBannerAnalytics?.overview?.unique_views || 0}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={6} md={3}>
                  <Card className="h-100 border-0 shadow-sm">
                    <Card.Body>
                      <div className="small text-muted">{adI18n.analyticsCtr}</div>
                      <div className="fs-4 fw-bold">{formatAnalyticsPercent(adBannerAnalytics?.overview?.ctr)}</div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Row className="g-3 mb-3">
                <Col md={6}>
                  <Card className="h-100 border-0 shadow-sm">
                    <Card.Body>
                      <div className="small text-muted">{adI18n.analyticsLastView}</div>
                      <div className="fw-semibold">{formatAdAnalyticsDate(adBannerAnalytics?.overview?.last_view_at)}</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="h-100 border-0 shadow-sm">
                    <Card.Body>
                      <div className="small text-muted">{adI18n.analyticsLastClick}</div>
                      <div className="fw-semibold">{formatAdAnalyticsDate(adBannerAnalytics?.overview?.last_click_at)}</div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Row className="g-3 mb-3">
                <Col xs={12}>
                  <MiniLineChart
                    title={adI18n.analyticsByDay}
                    rows={adBannerAnalytics?.daily || []}
                    xKey="day"
                    lines={[
                      { key: 'views', label: adI18n.analyticsViews, color: '#475569' },
                      { key: 'clicks', label: adI18n.analyticsClicks, color: '#2f80ed' },
                      { key: 'unique_views', label: adI18n.analyticsUnique, color: '#27ae60' }
                    ]}
                    emptyText={adI18n.analyticsNoData}
                  />
                </Col>
                <Col lg={4}>
                  <MiniBarChart
                    title={adI18n.analyticsBrowsers}
                    rows={adBannerAnalytics?.browsers || []}
                    getLabel={(row) => buildBrowserAnalyticsLabel(row)}
                    getValue={(row) => row.views}
                    secondaryValue={(row) => `${adI18n.analyticsClicks}: ${row.clicks || 0}`}
                    color="linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%)"
                    emptyText={adI18n.analyticsNoData}
                  />
                </Col>
                <Col lg={4}>
                  <MiniBarChart
                    title={adI18n.analyticsDevices}
                    rows={aggregateAdAnalyticsRows(adBannerAnalytics?.devices || [], (row) => (
                      row?.device_model || row?.device_brand || formatDeviceTypeLabel(row?.device_type)
                    ))}
                    getLabel={(row) => row.key}
                    getValue={(row) => row.views}
                    secondaryValue={(row) => `${adI18n.analyticsClicks}: ${row.clicks || 0}`}
                    color="linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%)"
                    emptyText={adI18n.analyticsNoData}
                  />
                </Col>
                <Col lg={4}>
                  <MiniBarChart
                    title={adI18n.analyticsGeo}
                    rows={adBannerAnalytics?.cities || []}
                    getLabel={(row) => [row.city, row.region, row.country].filter(Boolean).join(', ')}
                    getValue={(row) => row.views}
                    secondaryValue={(row) => `${adI18n.analyticsClicks}: ${row.clicks || 0}`}
                    color="linear-gradient(90deg, #16a34a 0%, #84cc16 100%)"
                    emptyText={adI18n.analyticsNoData}
                  />
                </Col>
              </Row>

              <Row className="g-3">
                <Col lg={6}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="mb-0">{adI18n.analyticsBrowsers}</h6>
                        <small className="text-muted">{adI18n.analyticsViews}/{adI18n.analyticsClicks}</small>
                      </div>
                      <div className="table-responsive">
                        <Table size="sm" className="align-middle mb-0">
                          <thead>
                            <tr>
                              <th>{language === 'uz' ? 'Brauzer' : 'Браузер'}</th>
                              <th className="text-end">{adI18n.analyticsViews}</th>
                              <th className="text-end">{adI18n.analyticsClicks}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(adBannerAnalytics?.browsers || []).slice(0, 10).map((row, idx) => (
                              <tr key={`${row.browser_name}-${row.app_container || 'na'}-${idx}`}>
                                <td>
                                  <div className="fw-medium">{buildBrowserAnalyticsLabel(row)}</div>
                                  <div className="small text-muted">
                                    {[row.browser_version, row.is_in_app_browser ? (language === 'uz' ? 'WebView' : 'WebView') : null].filter(Boolean).join(' · ') || '—'}
                                  </div>
                                </td>
                                <td className="text-end">{row.views || 0}</td>
                                <td className="text-end">{row.clicks || 0}</td>
                              </tr>
                            ))}
                            {(!adBannerAnalytics?.browsers || adBannerAnalytics.browsers.length === 0) && (
                              <tr>
                                <td colSpan="3" className="text-center text-muted py-3">{adI18n.analyticsNoData}</td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={6}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="mb-0">{adI18n.analyticsDevices}</h6>
                        <small className="text-muted">{language === 'uz' ? 'Tur / Model' : 'Тип / модель'}</small>
                      </div>
                      <div className="table-responsive">
                        <Table size="sm" className="align-middle mb-0">
                          <thead>
                            <tr>
                              <th>{language === 'uz' ? 'Qurilma' : 'Устройство'}</th>
                              <th className="text-end">{adI18n.analyticsViews}</th>
                              <th className="text-end">{adI18n.analyticsClicks}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(adBannerAnalytics?.devices || []).slice(0, 10).map((row, idx) => (
                              <tr key={`${row.device_type}-${row.device_brand || 'na'}-${row.device_model || 'na'}-${idx}`}>
                                <td>
                                  <div className="fw-medium text-truncate" title={buildDeviceAnalyticsLabel(row)}>
                                    {buildDeviceAnalyticsLabel(row)}
                                  </div>
                                  <div className="small text-muted">{formatDeviceTypeLabel(row.device_type)}</div>
                                </td>
                                <td className="text-end">{row.views || 0}</td>
                                <td className="text-end">{row.clicks || 0}</td>
                              </tr>
                            ))}
                            {(!adBannerAnalytics?.devices || adBannerAnalytics.devices.length === 0) && (
                              <tr>
                                <td colSpan="3" className="text-center text-muted py-3">{adI18n.analyticsNoData}</td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={6}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Body>
                      <h6 className="mb-2">{adI18n.analyticsGeo}</h6>
                      <div className="table-responsive">
                        <Table size="sm" className="align-middle mb-0">
                          <thead>
                            <tr>
                              <th>{language === 'uz' ? 'Joylashuv' : 'Локация'}</th>
                              <th className="text-end">{adI18n.analyticsViews}</th>
                              <th className="text-end">{adI18n.analyticsClicks}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(adBannerAnalytics?.cities || []).slice(0, 10).map((row, idx) => (
                              <tr key={`${row.country}-${row.region}-${row.city}-${idx}`}>
                                <td>
                                  <div className="fw-medium">{row.city || 'Unknown'}</div>
                                  <div className="small text-muted">{[row.region, row.country].filter(Boolean).join(', ')}</div>
                                </td>
                                <td className="text-end">{row.views || 0}</td>
                                <td className="text-end">{row.clicks || 0}</td>
                              </tr>
                            ))}
                            {(!adBannerAnalytics?.cities || adBannerAnalytics.cities.length === 0) && (
                              <tr>
                                <td colSpan="3" className="text-center text-muted py-3">{adI18n.analyticsNoData}</td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={6}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Body>
                      <h6 className="mb-2">{adI18n.analyticsCountries}</h6>
                      <div className="table-responsive">
                        <Table size="sm" className="align-middle mb-0">
                          <thead>
                            <tr>
                              <th>{language === 'uz' ? 'Mamlakat' : 'Страна'}</th>
                              <th className="text-end">{adI18n.analyticsViews}</th>
                              <th className="text-end">{adI18n.analyticsClicks}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(adBannerAnalytics?.countries || []).slice(0, 10).map((row, idx) => (
                              <tr key={`${row.country}-${idx}`}>
                                <td>{row.country || 'Unknown'}</td>
                                <td className="text-end">{row.views || 0}</td>
                                <td className="text-end">{row.clicks || 0}</td>
                              </tr>
                            ))}
                            {(!adBannerAnalytics?.countries || adBannerAnalytics.countries.length === 0) && (
                              <tr>
                                <td colSpan="3" className="text-center text-muted py-3">{adI18n.analyticsNoData}</td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={12}>
                  <Card className="border-0 shadow-sm">
                    <Card.Body>
                      <h6 className="mb-2">{adI18n.analyticsByDay}</h6>
                      <div className="table-responsive">
                        <Table size="sm" className="align-middle mb-0">
                          <thead>
                            <tr>
                              <th>{language === 'uz' ? 'Sana' : 'Дата'}</th>
                              <th className="text-end">{adI18n.analyticsViews}</th>
                              <th className="text-end">{adI18n.analyticsUnique}</th>
                              <th className="text-end">{adI18n.analyticsClicks}</th>
                              <th className="text-end">{adI18n.analyticsCtr}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(adBannerAnalytics?.daily || []).slice(0, 14).map((row, idx) => {
                              const rowCtr = row.views ? ((row.clicks || 0) / row.views) * 100 : 0;
                              return (
                                <tr key={`${row.day}-${idx}`}>
                                  <td>{formatAdAnalyticsDay(row.day)}</td>
                                  <td className="text-end">{row.views || 0}</td>
                                  <td className="text-end">{row.unique_views || 0}</td>
                                  <td className="text-end">{row.clicks || 0}</td>
                                  <td className="text-end">{formatAnalyticsPercent(rowCtr)}</td>
                                </tr>
                              );
                            })}
                            {(!adBannerAnalytics?.daily || adBannerAnalytics.daily.length === 0) && (
                              <tr>
                                <td colSpan="5" className="text-center text-muted py-3">{adI18n.analyticsNoData}</td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAdAnalyticsModal(false)}>{adI18n.cancel}</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showAdBannerModal} onHide={() => setShowAdBannerModal(false)} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title>{editingAdBanner ? adI18n.editTitle : adI18n.addTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <Row className="g-0">
            <Col lg={7} className="p-4 border-end">
              <Row className="g-3">
            <Col md={5}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.internalName}</Form.Label>
                <Form.Control
                  className="form-control-custom"
                  value={adBannerForm.title}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder={adI18n.internalNamePlaceholder}
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.displayType}</Form.Label>
                <Form.Select
                  className="form-control-custom"
                  value={adBannerForm.ad_type}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, ad_type: e.target.value }))}
                >
                  <option value="banner">{adI18n.typeBanner}</option>
                  <option value="entry_popup">{adI18n.typePopup}</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.slotPosition}</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={10}
                  className="form-control-custom"
                  value={adBannerForm.slot_order}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, slot_order: e.target.value }))}
                />
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.imageLabel}</Form.Label>
                <div className="d-flex flex-column gap-2">
                  <small className="text-muted">
                    {adBannerForm.ad_type === 'entry_popup' ? adI18n.imageRecommendedPopup : adI18n.imageRecommendedBanner}
                  </small>
                  {adBannerForm.image_url && (
                    <div
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#fff'
                      }}
                    >
                      <img
                        src={adBannerForm.image_url}
                        alt="ad-preview"
                        style={{ width: '100%', maxHeight: '210px', objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                  )}
                  <Form.Control
                    className="form-control-custom"
                    placeholder={adI18n.imagePlaceholder}
                    value={adBannerForm.image_url}
                    onChange={(e) => setAdBannerForm((prev) => ({ ...prev, image_url: e.target.value }))}
                  />
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Form.Control
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="form-control-custom"
                      onChange={(e) => handleAdBannerImageUpload(e.target.files?.[0])}
                      disabled={uploadingAdBannerImage}
                    />
                    {uploadingAdBannerImage && <small className="text-muted">{adI18n.uploading}</small>}
                  </div>
                </div>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.targetUrl}</Form.Label>
                <Form.Control
                  className="form-control-custom"
                  type="url"
                  value={adBannerForm.target_url}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, target_url: e.target.value }))}
                  placeholder={adI18n.targetUrlPlaceholder}
                />
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">Таргетинг по виду деятельности</Form.Label>
                <div
                  className="border rounded p-2"
                  style={{ maxHeight: '180px', overflowY: 'auto', background: '#fff' }}
                >
                  {adBannerActivityTypeOptions.length > 0 ? (
                    <div className="d-flex flex-column gap-1">
                      {adBannerActivityTypeOptions.map((item) => {
                        const checked = (adBannerForm.target_activity_type_ids || []).map(Number).includes(Number(item.id));
                        return (
                          <div
                            key={item.id}
                            className="d-flex align-items-center justify-content-between gap-2 px-2 py-1 rounded"
                            style={{ background: checked ? 'rgba(13,110,253,0.06)' : 'transparent' }}
                          >
                            <Form.Check
                              type="checkbox"
                              id={`ad-activity-type-${item.id}`}
                              className="mb-0"
                              label={`${item.name}${item.is_visible === false ? ' (скрыт)' : ''}`}
                              checked={checked}
                              onChange={() => toggleAdBannerActivityType(item.id)}
                            />
                            <small className="text-muted">#{item.id}</small>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-muted small px-2 py-1">Нет доступных видов деятельности</div>
                  )}
                </div>
                {adBannerActivityTypeOptions.length > 0 && (
                  <div className="d-flex gap-2 flex-wrap mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-primary"
                      onClick={() => setAdBannerForm((prev) => ({
                        ...prev,
                        target_activity_type_ids: adBannerActivityTypeOptions.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0)
                      }))}
                    >
                      Выбрать все
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => setAdBannerForm((prev) => ({ ...prev, target_activity_type_ids: [] }))}
                    >
                      Снять все
                    </Button>
                  </div>
                )}
                <Form.Text className="text-muted d-block mt-1">
                  Если ничего не выбрано, реклама показывается всем магазинам. Можно выбрать несколько видов.
                </Form.Text>
              </Form.Group>
            </Col>

            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.transition}</Form.Label>
                <Form.Select
                  className="form-control-custom"
                  value={adBannerForm.transition_effect}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, transition_effect: e.target.value }))}
                >
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="none">{adI18n.noAnimation}</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.displaySec}</Form.Label>
                <Form.Control
                  type="number"
                  min={2}
                  max={60}
                  className="form-control-custom"
                  value={adBannerForm.display_seconds}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, display_seconds: e.target.value }))}
                />
              </Form.Group>
            </Col>
            <Col md={4} className="d-flex align-items-end">
              <Form.Check
                type="switch"
                id="ad-banner-enabled-switch"
                label={adI18n.enabled}
                checked={!!adBannerForm.is_enabled}
                onChange={(e) => setAdBannerForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
              />
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.startDisplay}</Form.Label>
                <Form.Control
                  type="datetime-local"
                  className="form-control-custom"
                  value={adBannerForm.start_at}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, start_at: e.target.value }))}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.endDisplay}</Form.Label>
                <Form.Control
                  type="datetime-local"
                  className="form-control-custom"
                  value={adBannerForm.end_at}
                  onChange={(e) => setAdBannerForm((prev) => ({ ...prev, end_at: e.target.value }))}
                />
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.daysDisplay}</Form.Label>
                <div className="d-flex flex-wrap gap-2">
                  {adWeekdayOptions.map((day) => {
                    const active = (adBannerForm.repeat_days || []).includes(day.value);
                    return (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={active ? 'primary' : 'outline-secondary'}
                        className={active ? '' : 'text-muted'}
                        onClick={() => toggleAdBannerWeekday(day.value)}
                        style={active ? undefined : { borderColor: 'var(--border-color)' }}
                      >
                        {day.label}
                      </Button>
                    );
                  })}
                </div>
              </Form.Group>
            </Col>
              </Row>
            </Col>

            <Col lg={5} className="bg-light">
              <div className="p-4 h-100" style={{ minHeight: '100%' }}>
                <div className="position-lg-sticky" style={{ top: 16 }}>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h6 className="mb-0 fw-bold">
                      {language === 'uz' ? "Reklama ko'rinishi (preview)" : 'Предпросмотр рекламы'}
                    </h6>
                    <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">
                      #{Number(adBannerForm.slot_order) || 1}
                    </Badge>
                  </div>

                  <Card className="border-0 shadow-sm mb-3">
                    <Card.Body className="p-3">
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold text-muted text-uppercase">{adI18n.previewStore}</Form.Label>
                        <Form.Select
                          className="form-control-custom"
                          value={selectedAdPreviewRestaurant?.id ? String(selectedAdPreviewRestaurant.id) : ''}
                          onChange={(e) => setAdPreviewRestaurantId(e.target.value)}
                        >
                          {adPreviewRestaurantOptions.length === 0 && (
                            <option value="">{adI18n.previewStorePlaceholder}</option>
                          )}
                          {adPreviewRestaurantOptions.map((restaurant) => (
                            <option key={restaurant.id} value={restaurant.id}>
                              {restaurant.name || `#${restaurant.id}`}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>

                      <div className="small text-muted mb-2">
                        {adBannerForm.ad_type === 'entry_popup'
                          ? (language === 'uz' ? 'Tanlangan do‘kon fonida kirish popup ko‘rinishi' : 'Popup при входе на фоне выбранного магазина')
                          : (language === 'uz' ? 'Tanlangan do‘kon fonida katalog bannerni ko‘rinishi' : 'Баннер в каталоге на фоне выбранного магазина')}
                      </div>

                      <div
                        className="rounded-4 overflow-hidden border"
                        style={{
                          background: '#ffffff',
                          borderColor: 'var(--border-color)',
                        }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            minHeight: 520,
                            background: 'linear-gradient(180deg, #f8fafc 0%, #edf2f7 100%)'
                          }}
                        >
                          <div
                            className="d-flex align-items-center justify-content-between px-3"
                            style={{
                              height: 56,
                              borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
                              background: 'rgba(255,255,255,0.92)',
                              backdropFilter: 'blur(6px)'
                            }}
                          >
                            <span style={{ fontSize: '1.05rem', color: '#4b5563' }}>⌕</span>
                            <div className="d-flex align-items-center justify-content-center">
                              {adPreviewRestaurantLogoUrl ? (
                                <img
                                  src={adPreviewRestaurantLogoUrl}
                                  alt="preview-store-logo"
                                  style={{ maxHeight: 34, maxWidth: 110, objectFit: 'contain' }}
                                />
                              ) : (
                                <span className="fw-semibold" style={{ color: '#111827', fontSize: '0.9rem' }}>
                                  {selectedAdPreviewRestaurant?.name || (language === 'uz' ? 'Do‘kon' : 'Магазин')}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4b5563' }}>RU</span>
                          </div>

                          <div className="p-3 pb-5">
                            {adBannerForm.ad_type === 'banner' && (
                              <div
                                className="rounded-3 overflow-hidden border mb-3"
                                style={{
                                  borderColor: 'rgba(71, 85, 105, 0.18)',
                                  background: '#fff'
                                }}
                              >
                                {adBannerForm.image_url ? (
                                  <img
                                    src={adBannerForm.image_url}
                                    alt="ad-banner-preview"
                                    style={{ width: '100%', aspectRatio: '2.4 / 1', objectFit: 'cover', display: 'block' }}
                                  />
                                ) : (
                                  <div
                                    className="d-flex align-items-center justify-content-center text-muted"
                                    style={{
                                      width: '100%',
                                      aspectRatio: '2.4 / 1',
                                      background: 'linear-gradient(135deg, rgba(71,85,105,0.08) 0%, rgba(71,85,105,0.16) 100%)'
                                    }}
                                  >
                                    <div className="text-center px-3">
                                      <div style={{ fontSize: '1.2rem' }}>🖼️</div>
                                      <div className="small">
                                        {language === 'uz' ? 'Banner rasmi' : 'Изображение баннера'}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="mb-2 fw-bold" style={{ color: '#0f172a' }}>
                              {language === 'uz' ? "Asosiy bo'limlar" : 'Основные разделы'}
                            </div>
                            <div className="row g-2">
                              {[1, 2, 3, 4].map((idx) => (
                                <div key={idx} className="col-6">
                                  <div
                                    className="rounded-3 p-2"
                                    style={{
                                      background: 'rgba(255,255,255,0.92)',
                                      border: '1px solid rgba(148, 163, 184, 0.28)',
                                      minHeight: 86
                                    }}
                                  >
                                    <div className="small fw-semibold text-truncate">
                                      {language === 'uz' ? `Bo‘lim ${idx}` : `Раздел ${idx}`}
                                    </div>
                                    <div
                                      className="mt-2 rounded-2"
                                      style={{
                                        height: 48,
                                        background: 'linear-gradient(135deg, #dbeafe, #e2e8f0)'
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div
                            className="d-flex justify-content-around align-items-center px-2"
                            style={{
                              position: 'absolute',
                              left: 10,
                              right: 10,
                              bottom: 10,
                              height: 52,
                              background: 'rgba(255,255,255,0.94)',
                              border: '1px solid rgba(148, 163, 184, 0.28)',
                              borderRadius: 16
                            }}
                          >
                            {['🏠', '❤️', '🛒', '📦', '💬'].map((icon, idx) => (
                              <span key={icon} style={{ opacity: idx === 0 ? 1 : 0.65 }}>{icon}</span>
                            ))}
                          </div>

                          {adBannerForm.ad_type === 'entry_popup' && (
                            <div
                              className="d-flex align-items-end justify-content-center p-3"
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(15, 23, 42, 0.45)'
                              }}
                            >
                              <div
                                className="w-100"
                                style={{
                                  maxWidth: 320,
                                  background: '#ffffff',
                                  borderRadius: 20,
                                  border: '1px solid rgba(148, 163, 184, 0.3)',
                                  overflow: 'hidden',
                                  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.28)'
                                }}
                              >
                                <div style={{ position: 'relative' }}>
                                  {adBannerForm.image_url ? (
                                    <img
                                      src={adBannerForm.image_url}
                                      alt="ad-popup-preview"
                                      style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block' }}
                                    />
                                  ) : (
                                    <div
                                      className="d-flex align-items-center justify-content-center text-muted"
                                      style={{
                                        width: '100%',
                                        aspectRatio: '4 / 5',
                                        background: 'linear-gradient(135deg, rgba(71,85,105,0.10), rgba(71,85,105,0.18))'
                                      }}
                                    >
                                      <div className="text-center px-3">
                                        <div style={{ fontSize: '1.35rem' }}>🖼️</div>
                                        <div className="small">
                                          {language === 'uz' ? 'Popup rasmi' : 'Изображение popup'}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  <div
                                    className="d-flex align-items-center justify-content-center"
                                    style={{
                                      position: 'absolute',
                                      top: 10,
                                      right: 10,
                                      width: 28,
                                      height: 28,
                                      borderRadius: 999,
                                      background: 'rgba(255,255,255,0.92)',
                                      color: '#111827',
                                      fontWeight: 700
                                    }}
                                  >
                                    ×
                                  </div>
                                </div>
                                <div className="p-3">
                                  <div className="fw-bold mb-2" style={{ fontSize: '1.12rem', lineHeight: 1.2 }}>
                                    {adBannerForm.title || (language === 'uz' ? 'Aksiya nomi' : 'Название акции')}
                                  </div>
                                  <Button size="sm" className="w-100 btn-primary-custom" disabled>
                                    {adBannerForm.button_text || (language === 'uz' ? 'Ochish' : 'Открыть')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <Card.Body className="p-3">
                      <div className="small fw-bold text-muted text-uppercase mb-2">
                        {language === 'uz' ? 'Meta ma’lumotlar' : 'Мета-информация'}
                      </div>
                      <div className="d-flex flex-column gap-2 small">
                        <div>
                          <strong>{adI18n.start}:</strong> {formatAdDate(adBannerForm.start_at ? new Date(adBannerForm.start_at).toISOString() : null)}
                        </div>
                        <div>
                          <strong>{adI18n.end}:</strong> {formatAdDate(adBannerForm.end_at ? new Date(adBannerForm.end_at).toISOString() : null)}
                        </div>
                        <div>
                          <strong>{adI18n.days}:</strong>{' '}
                          {(adBannerForm.repeat_days || []).length
                            ? adWeekdayOptions.filter((d) => (adBannerForm.repeat_days || []).includes(d.value)).map((d) => d.label).join(', ')
                            : adI18n.everyDay}
                        </div>
                        <div>
                          <strong>{adI18n.activityTypeFilter}:</strong>{' '}
                          {(adBannerForm.target_activity_type_ids || []).length
                            ? getActivityTypeNamesByIds(adBannerForm.target_activity_type_ids).join(', ')
                            : adI18n.activityTypeNoTarget}
                        </div>
                        <div>
                          <strong>{adI18n.displayType}:</strong> {getAdTypeLabel(adBannerForm.ad_type)}
                        </div>
                        <div className="text-muted" style={{ wordBreak: 'break-all' }}>
                          <strong>{adI18n.targetUrl}:</strong> {adBannerForm.target_url || '—'}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </div>
              </div>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAdBannerModal(false)}>{adI18n.cancel}</Button>
          <Button className="btn-primary-custom" onClick={saveAdBanner}>
            {editingAdBanner ? adI18n.saveChanges : adI18n.createSlot}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showHelpInstructionModal}
        onHide={() => {
          if (savingHelpInstruction) return;
          setShowHelpInstructionModal(false);
          setHelpInstructionForm(createEmptyHelpInstructionForm());
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {helpInstructionForm.id
              ? (language === 'uz' ? "Yo'riqnomani tahrirlash" : 'Редактировать инструкцию')
              : (language === 'uz' ? "Yo'riqnoma qo'shish" : 'Добавить инструкцию')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>RU</Form.Label>
                <Form.Control
                  value={helpInstructionForm.title_ru}
                  onChange={(e) => setHelpInstructionForm((prev) => ({ ...prev, title_ru: e.target.value }))}
                  placeholder={language === 'uz' ? 'Tugma nomi (RU)' : 'Название кнопки (RU)'}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>UZ</Form.Label>
                <Form.Control
                  value={helpInstructionForm.title_uz}
                  onChange={(e) => setHelpInstructionForm((prev) => ({ ...prev, title_uz: e.target.value }))}
                  placeholder={language === 'uz' ? 'Tugma nomi (UZ)' : 'Название кнопки (UZ)'}
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>YouTube URL</Form.Label>
                <Form.Control
                  value={helpInstructionForm.youtube_url}
                  onChange={(e) => setHelpInstructionForm((prev) => ({ ...prev, youtube_url: e.target.value }))}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Tartib raqami' : 'Порядковый номер'}</Form.Label>
                <Form.Select
                  value={helpInstructionForm.sort_order}
                  onChange={(e) => setHelpInstructionForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                >
                  {helpInstructionSortOptions.map((value) => (
                    <option key={`help-sort-${value}`} value={value}>{value}</option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  {language === 'uz'
                    ? "Faqat bo'sh tartib raqamlari ko'rsatiladi."
                    : 'Показываются только свободные порядковые номера.'}
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            disabled={savingHelpInstruction}
            onClick={() => {
              setShowHelpInstructionModal(false);
              setHelpInstructionForm(createEmptyHelpInstructionForm());
            }}
          >
            {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
          </Button>
          <Button
            className="btn-primary-custom"
            disabled={savingHelpInstruction}
            onClick={() => saveHelpInstruction(helpInstructionForm)}
          >
            {savingHelpInstruction
              ? '...'
              : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showActivityTypeModal}
        onHide={closeActivityTypeModal}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingActivityType
              ? (language === 'uz' ? 'Faoliyat turini tahrirlash' : 'Редактировать вид деятельности')
              : (language === 'uz' ? "Faoliyat turi qo'shish" : 'Добавить вид деятельности')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Nomi' : 'Название'}</Form.Label>
                <Form.Control
                  value={activityTypeForm.name}
                  onChange={(e) => setActivityTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={language === 'uz' ? 'Masalan: Kiyim-kechak' : 'Например: Одежда'}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Tartib' : 'Порядок'}</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  value={activityTypeForm.sort_order}
                  onChange={(e) => setActivityTypeForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                />
              </Form.Group>
            </Col>
            <Col md={6} className="d-flex align-items-end">
              <Form.Check
                type="switch"
                id="activity-type-visible-modal-switch"
                label={language === 'uz' ? "Ko'rsatish" : 'Показывать'}
                checked={activityTypeForm.is_visible !== false}
                onChange={(e) => setActivityTypeForm((prev) => ({ ...prev, is_visible: e.target.checked }))}
              />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeActivityTypeModal} disabled={savingActivityType}>
            {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
          </Button>
          <Button className="btn-primary-custom" onClick={handleSaveActivityType} disabled={savingActivityType}>
            {savingActivityType
              ? '...'
              : (editingActivityType
                ? (language === 'uz' ? 'Saqlash' : 'Сохранить')
                : (language === 'uz' ? "Qo'shish" : 'Добавить'))}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showGlobalProductsPasteModal}
        onHide={closeGlobalProductsPasteModal}
        size="xl"
        centered
      >
        <Modal.Header closeButton={!isImportingGlobalProductsExcel}>
          <Modal.Title>
            {language === 'uz'
              ? 'Global mahsulotlar: import / paste'
              : 'Глобальные товары: импорт / вставка'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="mb-3">
            {language === 'uz'
              ? "Excel'dan satrlarni nusxa oling va shu oynada Ctrl+V qiling. Har bir satr = bitta товар."
              : 'Скопируйте строки из Excel и нажмите Ctrl+V в этом окне. Каждая строка = один товар.'}
          </Alert>

          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowGlobalProductsImportTemplateModal(true)}
            >
              {language === 'uz' ? "Ustunlar bo'yicha yo'riqnoma" : 'Памятка по колонкам'}
            </Button>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => globalProductsImportInputRef.current?.click()}
              disabled={isImportingGlobalProductsExcel}
            >
              {language === 'uz' ? 'Excel faylni tanlash' : 'Выбрать Excel-файл'}
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                setGlobalProductsPasteRows([]);
                setGlobalProductsPasteError('');
              }}
              disabled={isImportingGlobalProductsExcel || globalProductsPasteRows.length === 0}
            >
              {language === 'uz' ? 'Tozalash' : 'Очистить'}
            </Button>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>{language === 'uz' ? 'Ctrl+V uchun maydon' : 'Поле для Ctrl+V'}</Form.Label>
            <Form.Control
              ref={globalProductsPasteInputRef}
              as="textarea"
              rows={4}
              placeholder={language === 'uz'
                ? "Excel'dan nusxa oling va shu yerga Ctrl+V qiling"
                : 'Скопируйте данные из Excel и вставьте сюда через Ctrl+V'}
              onPaste={handleGlobalProductsPaste}
            />
          </Form.Group>

          {globalProductsPasteError && (
            <Alert variant="warning" className="mb-3">
              {globalProductsPasteError}
            </Alert>
          )}

          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>
              {language === 'uz' ? 'Aniqlangan satrlar:' : 'Распознано строк:'}{' '}
              {globalProductsPasteRows.length}
            </strong>
          </div>

          <div className="table-responsive" style={{ maxHeight: '45vh', overflow: 'auto' }}>
            <Table bordered hover size="sm" className="mb-0">
              <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ minWidth: 70 }}>№</th>
                  <th style={{ minWidth: 220 }}>{language === 'uz' ? 'Nomi (RU)' : 'Название (RU)'}</th>
                  <th style={{ minWidth: 220 }}>{language === 'uz' ? 'Nomi (UZ)' : 'Название (UZ)'}</th>
                  <th style={{ minWidth: 260 }}>{language === 'uz' ? 'Tavsif (RU)' : 'Описание (RU)'}</th>
                  <th style={{ minWidth: 180 }}>{language === 'uz' ? 'Shtrixkod' : 'Штрихкод'}</th>
                  <th style={{ minWidth: 160 }}>{language === 'uz' ? 'IKPU' : 'ИКПУ'}</th>
                  <th style={{ minWidth: 120 }}>{language === 'uz' ? "O'lchov" : 'Ед. изм.'}</th>
                  <th style={{ minWidth: 180 }}>{language === 'uz' ? 'Категория ID' : 'Категория ID'}</th>
                </tr>
              </thead>
              <tbody>
                {globalProductsPasteRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">
                      {language === 'uz'
                        ? "Hali ma'lumot kiritilmadi"
                        : 'Пока нет вставленных данных'}
                    </td>
                  </tr>
                ) : (
                  globalProductsPasteRows.map((row) => (
                    <tr key={`global-products-paste-row-${row.row_no}`}>
                      <td>{row.row_no}</td>
                      <td>{row.name_ru || '—'}</td>
                      <td>{row.name_uz || '—'}</td>
                      <td>{row.description_ru || '—'}</td>
                      <td>{row.barcode || '—'}</td>
                      <td>{row.ikpu || '—'}</td>
                      <td>{row.unit || 'шт'}</td>
                      <td>{row.category_id_raw || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeGlobalProductsPasteModal}
            disabled={isImportingGlobalProductsExcel}
          >
            {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
          </Button>
          <Button
            className="btn-primary-custom"
            onClick={continueGlobalProductsPasteToReview}
            disabled={isImportingGlobalProductsExcel || globalProductsPasteRows.length === 0}
          >
            {isImportingGlobalProductsExcel
              ? (language === 'uz' ? 'Tayyorlanmoqda...' : 'Подготовка...')
              : (language === 'uz' ? 'Keyingi: dublikatlarni tekshirish' : 'Далее: проверка дублей')}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showGlobalProductsImportTemplateModal}
        onHide={() => setShowGlobalProductsImportTemplateModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {language === 'uz'
              ? "Global mahsulotlar importi: ustunlar shabloni"
              : 'Импорт глобальных товаров: структура колонок'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="mb-3">
            {language === 'uz'
              ? "Kategoriya uchun ustunlar ustuvorligi: avval ID, keyin yo'l, undan keyin nom."
              : 'Для категории приоритет такой: сначала ID, затем путь, затем название.'}
          </Alert>
          <div className="table-responsive">
            <Table bordered hover size="sm" className="mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 60 }}>№</th>
                  <th style={{ minWidth: 230 }}>
                    {language === 'uz' ? 'Ustun nomi' : 'Название столбца'}
                  </th>
                  <th style={{ minWidth: 320 }}>
                    {language === 'uz' ? "Nimani to'ldirish" : 'Что заполнять'}
                  </th>
                  <th style={{ width: 120 }}>
                    {language === 'uz' ? 'Majburiy' : 'Обязательно'}
                  </th>
                  <th style={{ minWidth: 180 }}>
                    {language === 'uz' ? 'Misol' : 'Пример'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {globalProductsImportTemplateColumns.map((item) => (
                  <tr key={`global-import-template-col-${item.index}`}>
                    <td>{item.index}</td>
                    <td><code>{item.header}</code></td>
                    <td>{item.description}</td>
                    <td>{item.required ? (language === 'uz' ? 'Ha' : 'Да') : (language === 'uz' ? "Yo'q" : 'Нет')}</td>
                    <td>{item.sample || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowGlobalProductsImportTemplateModal(false)}>
            {language === 'uz' ? 'Yopish' : 'Закрыть'}
          </Button>
          <Button className="btn-primary-custom" onClick={handleDownloadGlobalProductsImportTemplate}>
            {language === 'uz' ? 'Excel shablonni yuklab olish' : 'Скачать Excel-шаблон'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showGlobalProductsImportReviewModal}
        onHide={closeGlobalProductsImportReviewModal}
        size="xl"
        className="sa-global-import-review-modal"
        centered
      >
        <Modal.Header closeButton={!isApplyingGlobalProductsExcelImport}>
          <Modal.Title>
            {language === 'uz'
              ? "Global mahsulotlar importini tekshirish"
              : 'Проверка импорта глобальных товаров'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="secondary" className="mb-2 sa-global-import-review-summary">
            <div className="d-flex flex-wrap gap-3 align-items-center">
              <span>
                {language === 'uz' ? 'Jami satrlar:' : 'Всего строк:'}{' '}
                <strong>{globalProductsImportRows.length}</strong>
              </span>
              <span>
                {language === 'uz' ? 'Yaroqli:' : 'Валидных:'}{' '}
                <strong>{globalProductsImportRows.filter((row) => row.is_valid).length}</strong>
              </span>
              <span>
                {language === 'uz' ? 'Dublikat bilan:' : 'С дублями:'}{' '}
                <strong>{globalProductsImportRows.filter((row) => (row.conflict_matches || []).length > 0).length}</strong>
              </span>
              <span>
                {language === 'uz' ? 'Fayl:' : 'Файл:'}{' '}
                <strong>{globalProductsImportSourceFileName || '—'}</strong>
              </span>
            </div>
          </Alert>

          <div
            className={`table-responsive sa-global-import-review-scroll admin-thin-scrollbar${isGlobalImportReviewScrolling ? ' is-scrolling' : ''}`}
            onScroll={handleGlobalImportReviewScroll}
          >
            <Table bordered hover size="sm" className="mb-0 sa-global-import-review-table">
              <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ minWidth: 70 }}>{language === 'uz' ? 'Satr' : 'Строка'}</th>
                  <th style={{ minWidth: 220 }}>{language === 'uz' ? 'Nomi (RU)' : 'Название (RU)'}</th>
                  <th style={{ minWidth: 220 }}>{language === 'uz' ? 'Nomi (UZ)' : 'Название (UZ)'}</th>
                  <th style={{ minWidth: 150 }}>{language === 'uz' ? 'Shtrix-kod' : 'Штрихкод'}</th>
                  <th style={{ minWidth: 140 }}>{language === 'uz' ? 'IKPU' : 'ИКПУ'}</th>
                  <th style={{ minWidth: 120 }}>{language === 'uz' ? "O'lchov" : 'Ед. изм.'}</th>
                  <th style={{ minWidth: 220 }}>{language === 'uz' ? 'Kategoriya' : 'Категория'}</th>
                  <th style={{ minWidth: 300 }}>{language === 'uz' ? 'Mavjud dublikatlar' : 'Найденные дубли'}</th>
                  <th style={{ minWidth: 220 }}>{language === 'uz' ? 'Amal' : 'Действие'}</th>
                  <th style={{ minWidth: 180 }}>{language === 'uz' ? 'Holat' : 'Статус'}</th>
                </tr>
              </thead>
              <tbody>
                {globalProductsImportRows.map((row) => {
                  const hasConflict = (row.conflict_matches || []).length > 0;
                  const action = String(row.conflict_action || (hasConflict ? 'replace' : 'create')).trim();
                  const rowClassName = !row.is_valid
                    ? 'table-danger'
                    : (hasConflict ? 'sa-global-import-row-duplicate' : '');
                  return (
                    <tr key={`global-import-row-${row.row_no}`} className={rowClassName}>
                      <td>{row.row_no}</td>
                      <td>{row.name_ru || '—'}</td>
                      <td>{row.name_uz || '—'}</td>
                      <td>{row.barcode || '—'}</td>
                      <td>{row.ikpu || '—'}</td>
                      <td>{row.unit || 'шт'}</td>
                      <td>
                        <div>{row.recommended_category_label || '—'}</div>
                        {row.category_note && (
                          <div className="small text-warning">{row.category_note}</div>
                        )}
                      </td>
                      <td>
                        {!hasConflict ? (
                          <span className="text-muted small">
                            {language === 'uz' ? 'Dublikat topilmadi' : 'Дубли не найдены'}
                          </span>
                        ) : (
                          <div className="d-flex flex-column gap-1">
                            {row.conflict_matches.map((match) => (
                              <div key={`global-import-match-${row.row_no}-${match.id}`} className="small">
                                <strong>#{match.id}</strong> {match.name_ru || '—'}
                                {match.barcode ? ` • ${match.barcode}` : ''}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="d-flex flex-column gap-2">
                          <Form.Select
                            size="sm"
                            value={action}
                            onChange={(e) => {
                              const nextAction = String(e.target.value || '').trim();
                              updateGlobalProductsImportRow(row.row_no, (current) => ({
                                conflict_action: nextAction,
                                conflict_target_id: nextAction === 'replace'
                                  ? (String(current.conflict_target_id || current.conflict_matches?.[0]?.id || '').trim())
                                  : String(current.conflict_target_id || '').trim()
                              }));
                            }}
                            disabled={!row.is_valid || isApplyingGlobalProductsExcelImport}
                          >
                            {hasConflict ? (
                              <>
                                <option value="replace">{language === 'uz' ? 'Mavjudini yangilash' : 'Заменить существующий'}</option>
                                <option value="add_suffix">{language === 'uz' ? 'Yangi qo‘shish (+ (n))' : 'Добавить с суффиксом (n)'}</option>
                                <option value="skip">{language === 'uz' ? "O'tkazib yuborish" : 'Не добавлять'}</option>
                              </>
                            ) : (
                              <>
                                <option value="create">{language === 'uz' ? "Yangi qo'shish" : 'Добавить новый'}</option>
                                <option value="skip">{language === 'uz' ? "O'tkazib yuborish" : 'Не добавлять'}</option>
                              </>
                            )}
                          </Form.Select>
                          {hasConflict && action === 'replace' && (
                            <Form.Select
                              size="sm"
                              value={String(row.conflict_target_id || row.conflict_matches?.[0]?.id || '')}
                              onChange={(e) => updateGlobalProductsImportRow(row.row_no, { conflict_target_id: String(e.target.value || '').trim() })}
                              disabled={!row.is_valid || isApplyingGlobalProductsExcelImport}
                            >
                              {(row.conflict_matches || []).map((match) => (
                                <option key={`global-import-target-${row.row_no}-${match.id}`} value={String(match.id)}>
                                  #{match.id} {match.name_ru || '—'}{match.barcode ? ` • ${match.barcode}` : ''}
                                </option>
                              ))}
                            </Form.Select>
                          )}
                        </div>
                      </td>
                      <td>
                        {!row.is_valid ? (
                          <>
                            <Badge bg="danger">{language === 'uz' ? 'Xatolik' : 'Ошибка'}</Badge>
                            <div className="small text-danger mt-1">
                              {row.error || (language === 'uz' ? "Majburiy maydonlar to'ldirilmagan" : 'Не заполнены обязательные поля')}
                            </div>
                          </>
                        ) : row.status === 'success' ? (
                          <>
                            <Badge bg="success">{language === 'uz' ? 'Bajarildi' : 'Успех'}</Badge>
                            {row.status_message && <div className="small text-success mt-1">{row.status_message}</div>}
                          </>
                        ) : row.status === 'error' ? (
                          <>
                            <Badge bg="danger">{language === 'uz' ? 'Xato' : 'Ошибка'}</Badge>
                            {row.status_message && <div className="small text-danger mt-1">{row.status_message}</div>}
                          </>
                        ) : row.status === 'skipped' ? (
                          <>
                            <Badge bg="secondary">{language === 'uz' ? "O'tkazildi" : 'Пропущено'}</Badge>
                            {row.status_message && <div className="small text-muted mt-1">{row.status_message}</div>}
                          </>
                        ) : (
                          <Badge bg="light" text="dark">{language === 'uz' ? 'Kutilmoqda' : 'Ожидает'}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeGlobalProductsImportReviewModal}
            disabled={isApplyingGlobalProductsExcelImport}
          >
            {language === 'uz' ? 'Yopish' : 'Закрыть'}
          </Button>
          <Button
            className="btn-primary-custom"
            onClick={applyGlobalProductsExcelImport}
            disabled={isApplyingGlobalProductsExcelImport || !globalProductsImportRows.some((row) => row.is_valid)}
          >
            {isApplyingGlobalProductsExcelImport
              ? (language === 'uz' ? 'Import qilinmoqda...' : 'Импорт...')
              : (language === 'uz' ? 'Importni qo‘llash' : 'Применить импорт')}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showGlobalProductModal}
        onHide={closeGlobalProductModal}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingGlobalProduct
              ? (language === 'uz' ? 'Global mahsulotni tahrirlash' : 'Редактировать глобальный товар')
              : (language === 'uz' ? "Global mahsulot qo'shish" : 'Добавить глобальный товар')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Nomi (RU) *' : 'Название (RU) *'}</Form.Label>
                <Form.Control
                  value={globalProductForm.name_ru}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, name_ru: e.target.value }))}
                  placeholder={language === 'uz' ? 'RU nomini kiriting' : 'Введите название на русском'}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Nomi (UZ)' : 'Название (UZ)'}</Form.Label>
                <Form.Control
                  value={globalProductForm.name_uz}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, name_uz: e.target.value }))}
                  placeholder={language === 'uz' ? "UZ nomini kiriting" : 'Введите название на узбекском'}
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Tavsif (RU)' : 'Описание (RU)'}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={globalProductForm.description_ru}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, description_ru: e.target.value }))}
                  placeholder={language === 'uz' ? 'RU tavsif' : 'Описание на русском'}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Tavsif (UZ)' : 'Описание (UZ)'}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={globalProductForm.description_uz}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, description_uz: e.target.value }))}
                  placeholder={language === 'uz' ? 'UZ tavsif' : 'Описание на узбекском'}
                />
              </Form.Group>
            </Col>
            <Col md={12} className="d-flex justify-content-end">
              <Button
                size="sm"
                variant="outline-primary"
                onClick={handleGenerateGlobalProductText}
                disabled={!isAiFeatureEnabled || globalProductTextLoading || (!String(globalProductForm.name_ru || '').trim() && !String(globalProductForm.name_uz || '').trim())}
              >
                {globalProductTextLoading
                  ? (language === 'uz' ? 'Yaratilmoqda...' : 'Генерация...')
                  : (language === 'uz' ? 'RU/UZ matn yaratish' : 'Сгенерировать текст RU/UZ')}
              </Button>
            </Col>

            <Col md={4}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Shtrix-kod' : 'Штрихкод'}</Form.Label>
                <Form.Control
                  value={globalProductForm.barcode}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, barcode: String(e.target.value || '').replace(/\s+/g, '').slice(0, 120) }))}
                  placeholder={language === 'uz' ? 'Masalan: 1234567890123' : 'Например: 1234567890123'}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'IKPU kodi' : 'Код ИКПУ'}</Form.Label>
                <Form.Control
                  value={globalProductForm.ikpu}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, ikpu: String(e.target.value || '').replace(/\s+/g, ' ').trimStart().slice(0, 64) }))}
                  placeholder={language === 'uz' ? 'Masalan: 12345678901234' : 'Например: 12345678901234'}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? "O'lchov birligi" : 'Единица измерения'}</Form.Label>
                <Form.Select
                  value={globalProductForm.unit}
                  onChange={(e) => {
                    const nextUnit = String(e.target.value || 'шт').trim() || 'шт';
                    setGlobalProductForm((prev) => ({
                      ...prev,
                      unit: nextUnit,
                      order_step: nextUnit === 'кг' ? prev.order_step : ''
                    }));
                  }}
                >
                  <option value="шт">{language === 'uz' ? 'dona' : 'шт'}</option>
                  <option value="порция">{language === 'uz' ? 'porsiya' : 'порция'}</option>
                  <option value="кг">кг</option>
                  <option value="л">л</option>
                  <option value="г">г</option>
                  <option value="мл">мл</option>
                  <option value="Стакан">{language === 'uz' ? 'stakan' : 'Стакан'}</option>
                  <option value="Банка">{language === 'uz' ? 'banka' : 'Банка'}</option>
                  <option value="Пачка">{language === 'uz' ? 'pachka' : 'Пачка'}</option>
                  <option value="Блок">{language === 'uz' ? 'blok' : 'Блок'}</option>
                  <option value="см">см</option>
                  <option value="м">м</option>
                  <option value="м2">м2</option>
                  <option value="м3">м3</option>
                  <option value="км">км</option>
                  <option value="т">т</option>
                </Form.Select>
              </Form.Group>
            </Col>
            {globalProductForm.unit === 'кг' && (
              <Col md={6}>
                <Form.Group>
                  <Form.Label>{language === 'uz' ? 'Шаг (кг uchun)' : 'Шаг (для кг)'}</Form.Label>
                  <Form.Control
                    value={globalProductForm.order_step}
                    onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, order_step: String(e.target.value || '').replace(/[^\d.,]/g, '').slice(0, 12) }))}
                    placeholder={language === 'uz' ? "Masalan: 0.1" : 'Например: 0.1'}
                    inputMode="decimal"
                  />
                </Form.Group>
              </Col>
            )}
            <Col md={12}>
              {(() => {
                const selectedPathIds = getGlobalProductCategoryPathIds(globalProductForm.recommended_category_id);
                const level1SelectedId = selectedPathIds[0] ? String(selectedPathIds[0]) : '';
                const level2SelectedId = selectedPathIds[1] ? String(selectedPathIds[1]) : '';
                const level3SelectedId = selectedPathIds[2] ? String(selectedPathIds[2]) : '';

                const level1Raw = sortCategoryOptions((categories || []).filter((cat) => !cat.parent_id));
                const level2Raw = level1SelectedId
                  ? sortCategoryOptions((categories || []).filter((cat) => String(cat.parent_id) === String(level1SelectedId)))
                  : [];
                const level3Raw = level2SelectedId
                  ? sortCategoryOptions((categories || []).filter((cat) => String(cat.parent_id) === String(level2SelectedId)))
                  : [];

                const filterBySearch = (source, keyword) => {
                  const normalized = String(keyword || '').trim().toLowerCase();
                  if (!normalized) return source;
                  return source.filter((item) => (
                    String(item?.name_ru || '').toLowerCase().includes(normalized)
                    || String(item?.name_uz || '').toLowerCase().includes(normalized)
                  ));
                };

                const level1Options = filterBySearch(level1Raw, globalProductCategorySearch.level1);
                const level2Options = filterBySearch(level2Raw, globalProductCategorySearch.level2);
                const level3Options = filterBySearch(level3Raw, globalProductCategorySearch.level3);
                const level1DropdownOptions = level1Options.map((category) => ({
                  value: String(category.id),
                  label: `[${category.sort_order ?? '-'}] ${category.name_ru || category.name_uz || `#${category.id}`}`
                }));
                const level2DropdownOptions = level2Options.map((category) => ({
                  value: String(category.id),
                  label: `[${category.sort_order ?? '-'}] ${category.name_ru || category.name_uz || `#${category.id}`}`
                }));
                const level3DropdownOptions = level3Options.map((category) => ({
                  value: String(category.id),
                  label: `[${category.sort_order ?? '-'}] ${category.name_ru || category.name_uz || `#${category.id}`}`
                }));

                const handleLevelSelect = (levelIndex, nextValue) => {
                  const normalized = String(nextValue || '').trim();
                  if (levelIndex === 0) {
                    setGlobalProductForm((prev) => ({
                      ...prev,
                      recommended_category_id: normalized
                    }));
                    setGlobalProductCategorySearch((prev) => ({ ...prev, level2: '', level3: '' }));
                    return;
                  }
                  if (levelIndex === 1) {
                    const fallback = normalized || (level1SelectedId || '');
                    setGlobalProductForm((prev) => ({
                      ...prev,
                      recommended_category_id: fallback
                    }));
                    setGlobalProductCategorySearch((prev) => ({ ...prev, level3: '' }));
                    return;
                  }
                  const fallback = normalized || (level2SelectedId || level1SelectedId || '');
                  setGlobalProductForm((prev) => ({
                    ...prev,
                    recommended_category_id: fallback
                  }));
                };

                return (
                  <Form.Group>
                    <Form.Label>{language === 'uz' ? 'Tavsiya kategoriya' : 'Рекомендуемая категория'}</Form.Label>
                    <Row className="g-2">
                      <Col md={4}>
                        <CustomSelectDropdown
                          value={level1SelectedId}
                          onChange={(value) => handleLevelSelect(0, value)}
                          options={level1DropdownOptions}
                          searchable
                          searchValue={globalProductCategorySearch.level1}
                          onSearchChange={(value) => setGlobalProductCategorySearch((prev) => ({ ...prev, level1: value }))}
                          searchPlaceholder={language === 'uz' ? "Asosiy kategoriyani qidirish" : 'Поиск основной категории'}
                          clearLabel={language === 'uz' ? 'Категория 1 tanlanmagan' : 'Категория 1 не выбрана'}
                          noDataLabel={language === 'uz' ? "Ma'lumot yo'q" : 'Нет данных'}
                          menuClassName="sa-category-select-menu"
                        />
                      </Col>
                      <Col md={4}>
                        <CustomSelectDropdown
                          value={level2SelectedId}
                          onChange={(value) => handleLevelSelect(1, value)}
                          options={level2DropdownOptions}
                          searchable
                          searchValue={globalProductCategorySearch.level2}
                          onSearchChange={(value) => setGlobalProductCategorySearch((prev) => ({ ...prev, level2: value }))}
                          searchPlaceholder={language === 'uz' ? 'Subkategoriya qidirish' : 'Поиск субкатегории'}
                          clearLabel={language === 'uz' ? 'Категория 2 tanlanmagan' : 'Категория 2 не выбрана'}
                          noDataLabel={language === 'uz' ? "Ma'lumot yo'q" : 'Нет данных'}
                          menuClassName="sa-category-select-menu"
                          disabled={!level1SelectedId}
                        />
                      </Col>
                      <Col md={4}>
                        <CustomSelectDropdown
                          value={level3SelectedId}
                          onChange={(value) => handleLevelSelect(2, value)}
                          options={level3DropdownOptions}
                          searchable
                          searchValue={globalProductCategorySearch.level3}
                          onSearchChange={(value) => setGlobalProductCategorySearch((prev) => ({ ...prev, level3: value }))}
                          searchPlaceholder={language === 'uz' ? '3-daraja qidirish' : 'Поиск категории 3 уровня'}
                          clearLabel={language === 'uz' ? 'Категория 3 tanlanmagan' : 'Категория 3 не выбрана'}
                          noDataLabel={language === 'uz' ? "Ma'lumot yo'q" : 'Нет данных'}
                          menuClassName="sa-category-select-menu"
                          disabled={!level2SelectedId}
                        />
                      </Col>
                    </Row>
                  </Form.Group>
                );
              })()}
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>{language === 'uz' ? 'Rasm' : 'Фото'}</Form.Label>
                <div
                  className="rounded border p-3 bg-light"
                  onPaste={(e) => handlePaste(e, (url) => {
                    setGlobalProductAiPreviewUrl('');
                    setGlobalProductAiMode('');
                    setGlobalProductAiError('');
                    setGlobalProductForm((prev) => ({ ...prev, image_url: url }));
                  })}
                >
                  <div className="admin-global-product-image-preview-grid">
                    <div className="admin-global-product-image-preview-card">
                      <div className="admin-global-product-image-preview-title">
                        {language === 'uz' ? 'Joriy slot' : 'Текущий слот'}
                      </div>
                      <div className="admin-global-product-image-preview-stage">
                        {globalProductForm.image_url ? (
                          <img
                            src={resolveGlobalProductImagePreviewUrl(globalProductForm.image_url)}
                            alt="global-product-slot-preview"
                            className="admin-global-product-image-preview-thumb"
                          />
                        ) : (
                          <div className="admin-global-product-image-preview-empty">📷</div>
                        )}
                        <div className="admin-global-product-slot-actions admin-global-product-slot-actions-overlay">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => globalProductImageInputRef.current?.click()}
                            disabled={uploadingImage || globalProductAiLoading}
                          >
                            {language === 'uz' ? 'Tanlash' : 'Выбрать'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => {
                              setGlobalProductForm((prev) => ({ ...prev, image_url: '' }));
                              setGlobalProductAiPreviewUrl('');
                              setGlobalProductAiMode('');
                              setGlobalProductAiError('');
                            }}
                            disabled={(!globalProductForm.image_url && !globalProductAiPreviewUrl) || globalProductAiLoading}
                          >
                            {language === 'uz' ? "O'chirish" : 'Удалить'}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="admin-global-product-image-preview-card">
                      <div className="admin-global-product-image-preview-title">
                        {language === 'uz' ? 'AI preview' : 'AI preview'}
                      </div>
                      <div className="admin-global-product-image-preview-stage">
                        {globalProductAiPreviewUrl ? (
                          <img
                            src={resolveGlobalProductImagePreviewUrl(globalProductAiPreviewUrl)}
                            alt="global-product-ai-preview"
                            className="admin-global-product-image-preview-thumb"
                          />
                        ) : (
                          <div className="admin-global-product-image-preview-empty">
                            {language === 'uz' ? 'Preview yo‘q' : 'Нет preview'}
                          </div>
                        )}
                        <div className="admin-global-product-slot-actions admin-global-product-slot-actions-overlay">
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => runGlobalProductAiPreview('generate')}
                            disabled={!isAiFeatureEnabled || globalProductAiLoading || !String(globalProductForm.name_ru || globalProductForm.name_uz || '').trim()}
                          >
                            {language === 'uz' ? 'Generatsiya' : 'Генерация'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => runGlobalProductAiPreview('process')}
                            disabled={!isAiFeatureEnabled || globalProductAiLoading || !globalProductForm.image_url}
                          >
                            {language === 'uz' ? 'Обработка' : 'Обработать'}
                          </Button>
                          <button
                            type="button"
                            className="admin-global-product-refresh-btn"
                            title={language === 'uz' ? 'Qayta yaratish' : 'Перегенерировать'}
                            aria-label={language === 'uz' ? 'Qayta yaratish' : 'Перегенерировать'}
                            onClick={handleRegenerateGlobalProductAiPreview}
                            disabled={!isAiFeatureEnabled || globalProductAiLoading || (!String(globalProductForm.name_ru || globalProductForm.name_uz || '').trim() && !globalProductForm.image_url)}
                          >
                            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {!isAiFeatureEnabled && (
                    <Alert variant="secondary" className="mt-3 mb-2 py-2 px-3">
                      {aiDisabledMessage}
                    </Alert>
                  )}
                  {globalProductAiError && (
                    <Alert variant="warning" className="mt-3 mb-2 py-2 px-3">
                      {globalProductAiError}
                    </Alert>
                  )}
                </div>
                <Form.Control
                  ref={globalProductImageInputRef}
                  type="file"
                  accept="image/*"
                  className="d-none"
                  onChange={handleGlobalProductImageUpload}
                />
              </Form.Group>
            </Col>

            {editingGlobalProduct && (
              <Col md={12}>
                <Form.Check
                  type="switch"
                  className="custom-switch"
                  label={language === 'uz' ? 'Faol' : 'Активен'}
                  checked={globalProductForm.is_active !== false}
                  onChange={(e) => setGlobalProductForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
              </Col>
            )}
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeGlobalProductModal} disabled={savingGlobalProduct}>
            {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
          </Button>
          <Button className="btn-primary-custom" onClick={handleSaveGlobalProduct} disabled={savingGlobalProduct}>
            {savingGlobalProduct
              ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
              : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Restaurant Modal */}
      <Modal show={showRestaurantModal} onHide={() => setShowRestaurantModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingRestaurant ? t('saModalEditRestaurant') : t('saModalNewRestaurant')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <Form>
            <Tabs defaultActiveKey="main" className="custom-restaurant-tabs px-3 pt-3 border-bottom-0">
              <Tab eventKey="main" title={language === 'uz' ? '📋 Asosiy' : '📋 Основные'}>
                <div className="p-4 pt-3">
                  {/* Logo Upload */}
                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">{t('saLogo')}</Form.Label>
                    <div className="d-flex align-items-center gap-3 bg-light p-3 rounded border border-light">
                      {restaurantForm.logo_url ? (
                        <img
                          src={restaurantForm.logo_url.startsWith('http') ? restaurantForm.logo_url : `${API_URL.replace('/api', '')}${restaurantForm.logo_url}`}
                          alt="Logo"
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '12px', border: '2px solid #dee2e6' }}
                        />
                      ) : (
                        <div style={{ width: '80px', height: '80px', background: '#e9ecef', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cdcdcd' }}>
                          <span style={{ fontSize: '2rem' }}>🏪</span>
                        </div>
                      )}
                      <div className="w-100">
                        <Form.Control
                          type="file"
                          size="sm"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                          className="mb-1"
                        />
                        {uploadingLogo && <small className="text-muted d-block mt-1">Загрузка...</small>}
                        {restaurantForm.logo_url && (
                          <Button
                            variant="link"
                            size="sm"
                            className="text-danger p-0 mt-2 fw-medium text-decoration-none"
                            onClick={() => setRestaurantForm({ ...restaurantForm, logo_url: '' })}
                          >
                            <i className="bi bi-trash"></i> Удалить логотип
                          </Button>
                        )}
                        <Form.Text className="text-muted d-block mt-2">
                          Система автоматически уменьшит логотип и впишет его в шапку магазина без увеличения header.
                        </Form.Text>
                        <Form.Text className="text-muted d-block">
                          Квадратный: 512x512 px (PNG). Горизонтальный: 1200x400 px (PNG, прозрачный фон).
                        </Form.Text>
                      </div>
                    </div>
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">Режим отображения логотипа</Form.Label>
                    <Form.Select
                      value={restaurantForm.logo_display_mode || 'square'}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, logo_display_mode: e.target.value })}
                    >
                      <option value="square">Квадратный</option>
                      <option value="horizontal">Горизонтальный</option>
                    </Form.Select>
                    <Form.Text className="text-muted mt-2 d-block">
                      Управляет отображением логотипа у клиентов в шапке магазина.
                    </Form.Text>
                  </Form.Group>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary">Название магазина *</Form.Label>
                        <Form.Control
                          value={restaurantForm.name}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })}
                          placeholder="Название магазина"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary">Телефон</Form.Label>
                        <Form.Control
                          value={restaurantForm.phone}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, phone: e.target.value })}
                          placeholder="+998901234567"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-3">
                    <Form.Label className="fw-medium text-secondary">Вид деятельности магазина</Form.Label>
                    <Form.Select
                      value={restaurantForm.activity_type_id || ''}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, activity_type_id: e.target.value })}
                    >
                      <option value="">Не выбран</option>
                      {restaurantActivityTypeOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.is_visible === false ? ' (скрыт)' : ''}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Text className="text-muted d-block mt-1">
                      Используется в дальнейшем для классификации магазина и выбора в боте.
                    </Form.Text>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="fw-medium text-secondary">Валюта магазина</Form.Label>
                    <CountryCurrencyDropdown
                      language={language}
                      options={countryCurrencyOptions}
                      selectedOption={countryCurrencyOptions.find((option) => option.code === (restaurantForm.currency_code || 'uz')) || countryCurrencyOptions[0] || null}
                      onChange={(code) => setRestaurantForm({ ...restaurantForm, currency_code: code })}
                    />
                    <Form.Text className="text-muted d-block mt-1">
                      Эта валюта будет показываться клиентам во всех суммах этого магазина.
                    </Form.Text>
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">Адрес</Form.Label>
                    <Form.Control
                      value={restaurantForm.address}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, address: e.target.value })}
                      placeholder="Адрес магазина"
                    />
                  </Form.Group>

                  <hr className="my-4" />
                  <h6 className="fw-bold text-dark mb-3">📍 {t('saCoordinates')}</h6>
                  <Row className="mb-2">
                    <Col md={6}>
                      <Form.Group className="mb-2">
                        <Form.Label className="fw-medium text-secondary small">Широта (Latitude)</Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          value={restaurantForm.latitude}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, latitude: e.target.value })}
                          placeholder="41.311081"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-2">
                        <Form.Label className="fw-medium text-secondary small">Долгота (Longitude)</Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          value={restaurantForm.longitude}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, longitude: e.target.value })}
                          placeholder="69.240562"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <div className="rounded overflow-hidden border">
                    <Suspense fallback={<ListSkeleton count={2} label="Загрузка карты..." />}>
                      <YandexLocationPicker
                        latitude={restaurantForm.latitude}
                        longitude={restaurantForm.longitude}
                        onLocationChange={(lat, lng) => setRestaurantForm({ ...restaurantForm, latitude: lat, longitude: lng })}
                        height="250px"
                      />
                    </Suspense>
                  </div>
                  <Form.Text className="text-muted mt-2 d-block">
                    <i className="bi bi-cursor"></i> Кликните на карту или перетащите маркер, чтобы задать координаты магазина.
                  </Form.Text>
                </div>
              </Tab>

              <Tab eventKey="working-hours" title={language === 'uz' ? '🕒 Ish vaqti' : '🕒 Часы работы'}>
                <div className="p-4 pt-3">
                  <h6 className="fw-bold text-dark mt-2 mb-3"><i className="bi bi-clock text-primary"></i> {t('saWorkingHours')}</h6>
                  <Row className="mb-2">
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary small">{t('saStartTime')}</Form.Label>
                        <Form.Control
                          type="time"
                          value={restaurantForm.start_time}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, start_time: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary small">{t('saEndTime')}</Form.Label>
                        <Form.Control
                          type="time"
                          value={restaurantForm.end_time}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, end_time: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Text className="text-muted"><i className="bi bi-info-circle"></i> {language === 'uz' ? 'Agar ko\'rsatilmasa, do\'kon doim ochiq deb hisoblanadi.' : 'Если не указано, магазин считается открытым всегда.'}</Form.Text>

                  <div className="mt-4 p-3 rounded border bg-light">
                    <Form.Check
                      type="switch"
                      id="restaurant-reservation-enabled-switch"
                      label={language === 'uz' ? 'Bronlashni yoqish' : 'Включить бронирование'}
                      checked={Boolean(restaurantForm.reservation_enabled)}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, reservation_enabled: e.target.checked })}
                    />
                    <Form.Text className="text-muted d-block mt-2">
                      {language === 'uz'
                        ? 'Faqat super-admin bu xizmatni yoqadi/o\'chiradi.'
                        : 'Только супер-админ включает/отключает этот сервис.'}
                    </Form.Text>
                  </div>

                  <div className="mt-3 p-3 rounded border bg-light">
                    <Form.Check
                      type="switch"
                      id="restaurant-size-variants-enabled-switch"
                      label={language === 'uz' ? "Kiyim o'lchamlarini yoqish" : 'Включить размеры одежды'}
                      checked={Boolean(restaurantForm.size_variants_enabled)}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, size_variants_enabled: e.target.checked })}
                    />
                    <Form.Text className="text-muted d-block mt-2">
                      {language === 'uz'
                        ? "Yoqilganda operator tovarlarda tayyor o'lchamlarni (S-5XL) yoki o'z variantlarini tanlay oladi."
                        : 'При включении оператор сможет выбирать в товарах готовые размеры (S-5XL) и добавлять свои варианты.'}
                    </Form.Text>
                  </div>
                </div>
              </Tab>

              <Tab eventKey="telegram" title={language === 'uz' ? '✈️ Telegram' : '✈️ Телеграм'}>
                <div className="p-4 pt-3">
                  <h6 className="fw-bold text-dark mb-3">{t('saTgSettings')}</h6>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">Bot Token</Form.Label>
                    <Form.Control
                      value={restaurantForm.telegram_bot_token}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, telegram_bot_token: e.target.value })}
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    />
                    <Form.Text className="text-muted mt-2 d-block"><i className="bi bi-robot"></i> Токен вашего бота, выданный @BotFather</Form.Text>
                  </Form.Group>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-secondary">{t('saGroupNoticeIds')}</Form.Label>
                        <Form.Control
                          value={restaurantForm.telegram_group_id}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, telegram_group_id: e.target.value })}
                          placeholder="-1001234567890"
                        />
                        <Form.Text className="text-muted mt-2 d-block"><i className="bi bi-people"></i> ID группы или канала для получения заказов. Бот должен быть добавлен туда с правами администратора.</Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-secondary">{t('saSupportUsername')}</Form.Label>
                        <div className="input-group">
                          <span className="input-group-text bg-light text-secondary border-end-0">@</span>
                          <Form.Control
                            className="border-start-0 ps-0"
                            value={restaurantForm.support_username}
                            onChange={(e) => setRestaurantForm({ ...restaurantForm, support_username: e.target.value.replace(/^@/, '') })}
                            placeholder="admin_username"
                          />
                        </div>
                        <Form.Text className="text-muted mt-2 d-block"><i className="bi bi-person-badge"></i> Telegram username администратора для поддержки. Будет отображаться для клиентов.</Form.Text>
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              </Tab>

              <Tab eventKey="payment" title={language === 'uz' ? '💳 To\'lov' : '💳 Оплата'}>
                <div className="p-4 pt-3">
                  <h6 className="fw-bold text-dark mb-3">💰 {t('saPaymentMethods')}</h6>

                  <div className="mb-4 p-3 rounded border bg-white">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <Form.Label className="fw-medium text-secondary m-0 d-flex align-items-center">
                        <img src="/payme.png" alt="Payme" style={{ height: 20, marginRight: 8, borderRadius: 4 }} />
                        Payme Merchant API
                      </Form.Label>
                      <Form.Check
                        type="switch"
                        checked={restaurantForm.payme_enabled}
                        onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_enabled: e.target.checked })}
                      />
                    </div>
                    <Row className="gy-3">
                      <Col md={6}>
                        <Form.Control
                          value={restaurantForm.payme_merchant_id}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_merchant_id: e.target.value })}
                          placeholder="Merchant ID"
                          className="bg-light"
                        />
                      </Col>
                      <Col md={6}>
                        <Form.Control
                          value={restaurantForm.payme_api_login}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_api_login: e.target.value })}
                          placeholder="Merchant API login"
                          className="bg-light"
                        />
                      </Col>
                      <Col md={6}>
                        <Form.Control
                          value={restaurantForm.payme_api_password}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_api_password: e.target.value })}
                          placeholder="Merchant API password"
                          className="bg-light"
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Control
                          value={restaurantForm.payme_account_key}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_account_key: e.target.value })}
                          placeholder="account key"
                          className="bg-light"
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Control
                          type="number"
                          min="0"
                          value={restaurantForm.payme_callback_timeout_ms}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_callback_timeout_ms: e.target.value })}
                          placeholder="ct"
                          className="bg-light"
                        />
                      </Col>
                      <Col md={12}>
                        <Form.Check
                          type="switch"
                          label="Тестовый режим Payme"
                          checked={restaurantForm.payme_test_mode}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_test_mode: e.target.checked })}
                        />
                      </Col>
                    </Row>
                  </div>

                  <div className="mb-4 bg-light p-3 rounded border border-light">
                    <Form.Label className="fw-medium text-secondary m-0">
                      🛎 {language === 'uz' ? '1 chek narxi' : 'Стоимость одного чека'} ({getCurrencyLabelByCode(restaurantForm.currency_code || countryCurrency?.code)})
                    </Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      step="0.01"
                      value={restaurantForm.service_fee}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, service_fee: parseDecimalInputOrZero(e.target.value) })}
                      placeholder="0"
                      className="mt-3"
                    />
                    <Form.Text className="text-muted mt-2 d-block">Укажите сумму, которая будет списываться с баланса заведения за каждый принятый заказ. Эта же сумма может отображаться клиенту в чеке как сбор за обслуживание.</Form.Text>
                  </div>

                  <div className="mb-4 bg-light p-3 rounded border border-light">
                    <Form.Label className="fw-medium text-secondary m-0">
                      🪑 {language === 'uz' ? 'Bron xizmati narxi' : 'Стоимость сервиса бронирования'} ({getCurrencyLabelByCode(restaurantForm.currency_code || countryCurrency?.code)})
                    </Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      step="0.01"
                      value={restaurantForm.reservation_cost}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, reservation_cost: parseDecimalInputOrZero(e.target.value) })}
                      placeholder="0"
                      className="mt-3"
                    />
                    <Form.Text className="text-muted mt-2 d-block">
                      Эта сумма списывается с баланса магазина за подтвержденную бронь.
                    </Form.Text>
                  </div>
                </div>
              </Tab>

              <Tab eventKey="delivery" title={language === 'uz' ? '🚕 Yetkazib berish' : '🚕 Доставка'}>
                <div className="p-4 pt-3">
                  <div className="d-flex align-items-center justify-content-between mb-4">
                    <h6 className="fw-bold text-dark m-0">🚕 {t('saDeliverySettings')}</h6>
                    <Form.Check
                      type="switch"
                      id="delivery-settings-switch"
                      checked={restaurantForm.is_delivery_enabled !== false}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, is_delivery_enabled: e.target.checked })}
                      className="fs-5 m-0"
                    />
                  </div>

                  {restaurantForm.is_delivery_enabled !== false ? (
                    <>
                      <Row className="mb-4">
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-medium text-secondary small">{t('saBaseRadius')} (км)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              step="0.5"
                              size="sm"
                              value={restaurantForm.delivery_base_radius}
                              onChange={(e) => setRestaurantForm({ ...restaurantForm, delivery_base_radius: parseFloat(e.target.value) || 0 })}
                            />
                            <Form.Text className="text-muted mt-1 d-block" style={{ fontSize: '0.75rem' }}>Базовый радиус включенной доставки.</Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-medium text-secondary small">{t('saBasePrice')} ({getCurrencyLabelByCode(restaurantForm.currency_code || countryCurrency?.code)})</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              step="1000"
                              size="sm"
                              value={restaurantForm.delivery_base_price}
                              onChange={(e) => setRestaurantForm({ ...restaurantForm, delivery_base_price: parseFloat(e.target.value) || 0 })}
                            />
                            <Form.Text className="text-muted mt-1 d-block" style={{ fontSize: '0.75rem' }}>Цена доставки в пределах базы.</Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-medium text-secondary small">{t('saPricePerKm')} ({getCurrencyLabelByCode(restaurantForm.currency_code || countryCurrency?.code)})</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              step="500"
                              size="sm"
                              value={restaurantForm.delivery_price_per_km}
                              onChange={(e) => setRestaurantForm({ ...restaurantForm, delivery_price_per_km: parseFloat(e.target.value) || 0 })}
                            />
                            <Form.Text className="text-muted mt-1 d-block" style={{ fontSize: '0.75rem' }}>Надбавка за каждый следующий км.</Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>

                      <Form.Group className="mb-2">
                        <Form.Label className="fw-medium text-secondary mb-2">🗺️ Зона доставки</Form.Label>
                        <div className="d-flex align-items-center justify-content-between p-3 border rounded bg-light">
                          <div className="d-flex align-items-center gap-3">
                            {restaurantForm.delivery_zone ? (
                              <div className="d-flex flex-column">
                                <Badge bg="success" className="px-2 py-1 fs-6 d-inline-flex align-items-center gap-2">
                                  <i className="bi bi-check-circle"></i> Зона установлена
                                </Badge>
                                <small className="text-muted mt-1 text-center">{restaurantForm.delivery_zone.length} точек</small>
                              </div>
                            ) : (
                              <div className="d-flex flex-column">
                                <Badge bg="secondary" className="px-2 py-1 fs-6 d-inline-flex align-items-center gap-2">
                                  <i className="bi bi-dash-circle"></i> Зона не задана
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="d-flex gap-2 flex-column align-items-end">
                            <Button
                              variant={restaurantForm.delivery_zone ? "outline-primary" : "primary"}
                              size="sm"
                              onClick={() => setShowMapModal(true)}
                            >
                              <i className="bi bi-map me-1"></i> {restaurantForm.delivery_zone ? 'Изменить зону' : 'Очертить зону'}
                            </Button>
                            {restaurantForm.delivery_zone && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => setRestaurantForm({ ...restaurantForm, delivery_zone: null })}
                              >
                                <i className="bi bi-trash"></i> Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      </Form.Group>
                    </>
                  ) : (
                    <div className="text-center p-4 bg-light rounded text-muted mt-2 border">
                      <i className="bi bi-bicycle fs-2 d-block mb-2"></i>
                      Доставка отключена. Клиентам будет доступен только самовывоз.
                    </div>
                  )}
                </div>
              </Tab>
            </Tabs>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRestaurantModal(false)}>{t('saCancel')}</Button>
          <Button variant="primary" onClick={handleSaveRestaurant}>{t('saSave')}</Button>
        </Modal.Footer>
      </Modal>

      {/* Delivery Zone Map Modal */}
      <Modal show={showMapModal} onHide={() => setShowMapModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>🗺️ Зона доставки</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Suspense fallback={<ListSkeleton count={4} label="Загрузка карты зоны доставки" />}>
            <DeliveryZoneMap
              zone={restaurantForm.delivery_zone}
              onZoneChange={(zone) => setRestaurantForm({ ...restaurantForm, delivery_zone: zone })}
              height="500px"
              editable={true}
            />
          </Suspense>
          <Alert variant="info" className="mt-3">
            <strong>Инструкция:</strong>
            <ol className="mb-0 mt-2">
              <li>Нажмите на иконку многоугольника (⬠) справа на карте</li>
              <li>Кликайте по карте, чтобы отметить точки границы зоны доставки</li>
              <li>Завершите многоугольник, кликнув на первую точку</li>
              <li>Закройте окно — зона сохранится</li>
            </ol>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowMapModal(false)}>{t('saDone')}</Button>
        </Modal.Footer>
      </Modal>

      {/* Operator Modal */}
      <Modal show={showOperatorModal} onHide={() => setShowOperatorModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingOperator ? t('editOperator') : t('newOperator')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Логин *</Form.Label>
                  <Form.Control
                    value={operatorForm.username}
                    onChange={(e) => setOperatorForm({ ...operatorForm, username: e.target.value })}
                    placeholder="operator1"
                    disabled={!!editingOperator}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Пароль {!editingOperator && '*'}</Form.Label>
                  <Form.Control
                    type="password"
                    value={operatorForm.password}
                    onChange={(e) => setOperatorForm({ ...operatorForm, password: e.target.value })}
                    placeholder={editingOperator ? 'Оставьте пустым, чтобы не менять' : 'Пароль'}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>ФИО</Form.Label>
                  <Form.Control
                    value={operatorForm.full_name}
                    onChange={(e) => setOperatorForm({ ...operatorForm, full_name: e.target.value })}
                    placeholder="Иванов Иван"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Телефон</Form.Label>
                  <Form.Control
                    value={operatorForm.phone}
                    onChange={(e) => setOperatorForm({ ...operatorForm, phone: e.target.value })}
                    placeholder="+998901234567"
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Доступ к магазинам</Form.Label>
              <div className="border rounded p-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {allRestaurants.filter(r => r.is_active).map(r => (
                  <Form.Check
                    key={r.id}
                    type="checkbox"
                    label={r.name}
                    checked={operatorForm.restaurant_ids.includes(r.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...operatorForm.restaurant_ids, r.id]
                        : operatorForm.restaurant_ids.filter(id => id !== r.id);
                      setOperatorForm({ ...operatorForm, restaurant_ids: ids });
                    }}
                  />
                ))}
                {allRestaurants.filter(r => r.is_active).length === 0 && (
                  <p className="text-muted mb-0">Нет активных магазинов</p>
                )}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOperatorModal(false)}>{t('saCancel')}</Button>
          <Button variant="primary" onClick={handleSaveOperator}>{t('saSave')}</Button>
        </Modal.Footer>
      </Modal>

      {/* Customer Order History Modal */}
      <Modal show={showOrderHistoryModal} onHide={() => setShowOrderHistoryModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            📋 История заказов: {selectedCustomer?.full_name || selectedCustomer?.username}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {loadingOrders ? (
            <TableSkeleton rows={6} columns={8} label="Загрузка истории заказов клиента" />
          ) : (
            <>
              {/* Customer Info */}
              <Card className="mb-3 bg-light">
                <Card.Body>
                  <Row>
                    <Col md={3}>
                      <small className="text-muted">Клиент</small>
                      <div><strong>{selectedCustomer?.full_name || '-'}</strong></div>
                    </Col>
                    <Col md={3}>
                      <small className="text-muted">Телефон</small>
                      <div>{selectedCustomer?.phone || '-'}</div>
                    </Col>
                    <Col md={3}>
                      <small className="text-muted">Всего заказов</small>
                      <div><Badge bg="primary">{customerOrders.total}</Badge></div>
                    </Col>
                    <Col md={3}>
                      <small className="text-muted">Сумма покупок</small>
                      <div><strong>{parseFloat(customerOrders.orders?.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) || 0).toLocaleString()} {t('sum')}</strong></div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Orders List */}
              {customerOrders.orders?.length > 0 ? (
                <Table responsive hover>
                  <thead className="table-light">
                    <tr>
                      <th>№ Заказа</th>
                      <th>{t('saTableDate')}</th>
                      <th>{t('saTableRestaurant')}</th>
                      <th>{t('saTableSum')}</th>
                      <th>{t('saTableStatus')}</th>
                      <th>Оплата</th>
                      <th>Обработал</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.orders?.map(order => (
                      <tr key={order.id}>
                        <td><strong>#{order.order_number}</strong></td>
                        <td><small>{formatDate(order.created_at)}</small></td>
                        <td>{order.restaurant_name || '-'}</td>
                        <td><strong>{parseFloat(order.total_amount).toLocaleString()} {t('sum')}</strong></td>
                        <td>
                          <Badge bg={
                            order.status === 'new' ? 'primary' :
                              order.status === 'preparing' ? 'warning' :
                                order.status === 'delivering' ? 'info' :
                                  order.status === 'delivered' ? 'success' :
                                    order.status === 'cancelled' ? 'danger' : 'secondary'
                          }>
                            {order.status === 'new' ? 'Новый' :
                              order.status === 'preparing' ? 'Готовится' :
                                order.status === 'delivering' ? 'Доставляется' :
                                  order.status === 'delivered' ? 'Доставлен' :
                                    order.status === 'cancelled' ? 'Отменен' : order.status}
                          </Badge>
                        </td>
                        <td>
                          {order.payment_method === 'cash' ? '💵 Наличные' :
                            order.payment_method === 'card' ? '💳 Карта' :
                              order.payment_method === 'click' ? 'Click' :
                                order.payment_method === 'payme' ? 'Payme' :
                                  order.payment_method === 'uzum' ? 'Uzum' :
                                    order.payment_method === 'xazna' ? 'Xazna' : order.payment_method}
                        </td>
                        <td><small>{order.processed_by_name || '-'}</small></td>
                        <td>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => openOrderDetail(order)}
                          >
                            👁️ Детали
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="text-center text-muted py-5">
                  <h5>📦</h5>
                  <p>У этого клиента пока нет заказов</p>
                </div>
              )}

              {customerOrders.total > 10 && (
                <div className="d-flex justify-content-center mt-3">
                  <Pagination>
                    <Pagination.Prev
                      disabled={orderHistoryPage === 1}
                      onClick={() => {
                        const newPage = orderHistoryPage - 1;
                        setOrderHistoryPage(newPage);
                        loadCustomerOrders(selectedCustomer.id, newPage);
                      }}
                    />
                    <Pagination.Item active>{orderHistoryPage}</Pagination.Item>
                    <Pagination.Next
                      disabled={orderHistoryPage * 10 >= customerOrders.total}
                      onClick={() => {
                        const newPage = orderHistoryPage + 1;
                        setOrderHistoryPage(newPage);
                        loadCustomerOrders(selectedCustomer.id, newPage);
                      }}
                    />
                  </Pagination>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOrderHistoryModal(false)}>{t('saClose')}</Button>
        </Modal.Footer>
      </Modal>

      {/* Order Detail Modal */}
      <Modal show={showOrderDetailModal} onHide={() => setShowOrderDetailModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            🧾 Заказ #{selectedOrder?.order_number}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrder && (
            <>
              {/* Order Status */}
              <div className="text-center mb-4">
                <Badge
                  bg={
                    selectedOrder.status === 'new' ? 'primary' :
                      selectedOrder.status === 'preparing' ? 'warning' :
                        selectedOrder.status === 'delivering' ? 'info' :
                          selectedOrder.status === 'delivered' ? 'success' :
                            selectedOrder.status === 'cancelled' ? 'danger' : 'secondary'
                  }
                  style={{ fontSize: '1.1rem', padding: '0.5rem 1rem' }}
                >
                  {selectedOrder.status === 'new' ? '🆕 Новый' :
                    selectedOrder.status === 'preparing' ? '👨‍🍳 Готовится' :
                      selectedOrder.status === 'delivering' ? '🚚 Доставляется' :
                        selectedOrder.status === 'delivered' ? '✅ Доставлен' :
                          selectedOrder.status === 'cancelled' ? '❌ Отменен' : selectedOrder.status}
                </Badge>
              </div>

              {/* Order Info */}
              <Card className="mb-3">
                <Card.Header>📋 Информация о заказе</Card.Header>
                <Card.Body>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2"><strong>Дата создания:</strong> {formatDate(selectedOrder.created_at)}</p>
                      <p className="mb-2"><strong>Дата обновления:</strong> {formatDate(selectedOrder.updated_at)}</p>
                      <p className="mb-2"><strong>Магазин:</strong> {selectedOrder.restaurant_name || '-'}</p>
                      <p className="mb-2"><strong>Обработал:</strong> {selectedOrder.processed_by_name || '-'}</p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-2"><strong>Способ оплаты:</strong> {
                        selectedOrder.payment_method === 'cash' ? '💵 Наличные' :
                          selectedOrder.payment_method === 'card' ? '💳 Карта' :
                            selectedOrder.payment_method === 'click' ? 'Click' :
                              selectedOrder.payment_method === 'payme' ? 'Payme' :
                                selectedOrder.payment_method === 'uzum' ? 'Uzum' :
                                  selectedOrder.payment_method === 'xazna' ? 'Xazna' : selectedOrder.payment_method
                      }</p>
                      <p className="mb-2"><strong>Дата доставки:</strong> {selectedOrder.delivery_date || '-'} {selectedOrder.delivery_time || ''}</p>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Customer Info */}
              <Card className="mb-3">
                <Card.Header>👤 Данные клиента</Card.Header>
                <Card.Body>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2"><strong>Имя:</strong> {selectedOrder.customer_name}</p>
                      <p className="mb-2"><strong>Телефон:</strong> {selectedOrder.customer_phone}</p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-2"><strong>Адрес:</strong> {selectedOrder.delivery_address}</p>
                      {selectedOrder.delivery_coordinates && (
                        <p className="mb-2">
                          <strong>Координаты:</strong>{' '}
                          <a
                            href={`https://yandex.ru/maps/?pt=${selectedOrder.delivery_coordinates.split(',').reverse().join(',')}&z=17&l=map`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📍 На карте
                          </a>
                        </p>
                      )}
                    </Col>
                  </Row>
                  {selectedOrder.comment && (
                    <Alert variant="info" className="mb-0 mt-2">
                      <strong>💬 Комментарий:</strong> {selectedOrder.comment}
                    </Alert>
                  )}
                  <div className="mt-3 p-2 rounded border" style={{ background: '#f8fafc' }}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <strong>{language === 'uz' ? 'Servis bahosi' : 'Оценка сервиса'}</strong>
                      <span style={{ color: '#f59e0b', letterSpacing: '0.06em' }}>
                        {buildRatingStarsText(selectedOrder.service_rating || 0)}
                      </span>
                    </div>
                    {Number(selectedOrder.service_rating || 0) > 0 && Number(selectedOrder.service_rating || 0) <= 2 && selectedOrder.service_rating_reason && (
                      <div className="small text-muted mb-2">
                        <strong>{language === 'uz' ? 'Sabab (servis):' : 'Причина (сервис):'}</strong> {selectedOrder.service_rating_reason}
                      </div>
                    )}
                    <div className="d-flex justify-content-between align-items-center">
                      <strong>{language === 'uz' ? 'Yetkazib berish bahosi' : 'Оценка доставки'}</strong>
                      <span style={{ color: '#f59e0b', letterSpacing: '0.06em' }}>
                        {buildRatingStarsText(selectedOrder.delivery_rating || 0)}
                      </span>
                    </div>
                    {Number(selectedOrder.delivery_rating || 0) > 0 && Number(selectedOrder.delivery_rating || 0) <= 2 && selectedOrder.delivery_rating_reason && (
                      <div className="small text-muted mt-2">
                        <strong>{language === 'uz' ? 'Sabab (yetkazib berish):' : 'Причина (доставка):'}</strong> {selectedOrder.delivery_rating_reason}
                      </div>
                    )}
                  </div>
                </Card.Body>
              </Card>

              {/* Order Items */}
              <Card className="mb-3">
                <Card.Header>🛒 Состав заказа</Card.Header>
                <Card.Body className="p-0">
                  <Table className="mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Товар</th>
                        <th>Кол-во</th>
                        <th>Цена</th>
                        <th>{t('saTableSum')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item, index) => (
                        <tr key={item.id || index}>
                          <td>{index + 1}</td>
                          <td>{item.product_name}</td>
                          <td>{item.quantity} {item.unit || 'шт'}</td>
                          <td>{parseFloat(item.price).toLocaleString()} {t('sum')}</td>
                          <td><strong>{parseFloat(item.total || item.quantity * item.price).toLocaleString()} {t('sum')}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-light">
                      <tr>
                        <td colSpan="4" className="text-end"><strong>ИТОГО:</strong></td>
                        <td><strong style={{ fontSize: '1.2rem' }}>{parseFloat(selectedOrder.total_amount).toLocaleString()} {t('sum')}</strong></td>
                      </tr>
                    </tfoot>
                  </Table>
                </Card.Body>
              </Card>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOrderDetailModal(false)}>{t('saClose')}</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showRestaurantCommentModal} onHide={() => closeRestaurantCommentModal()} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {language === 'uz' ? "Do'kon izohi" : 'Комментарий магазина'}
            {commentRestaurant?.name ? `: ${commentRestaurant.name}` : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <div className="fw-semibold mb-2">
              {language === 'uz' ? 'Cheklist: bajarilgan ishlar' : 'Чеклист: выполненные шаги'}
            </div>
            <Row className="g-2 mb-2">
              {RESTAURANT_COMMENT_CHECKLIST_OPTIONS
                .filter((item) => ['call_completed', 'meeting_completed', 'products_added'].includes(item.code))
                .map((item) => (
                  <Col md={6} key={`comment-checklist-completed-${item.code}`}>
                    <Form.Check
                      type="checkbox"
                      id={`restaurant-comment-check-${item.code}`}
                      checked={restaurantCommentChecklist.includes(item.code)}
                      onChange={() => toggleRestaurantCommentChecklistItem(item.code)}
                      label={language === 'uz' ? item.uz : item.ru}
                    />
                  </Col>
                ))}
            </Row>

            <div className="fw-semibold mb-2 mt-3">
              {language === 'uz' ? 'Cheklist: muammolar' : 'Чеклист: проблемы'}
            </div>
            <Row className="g-2">
              {RESTAURANT_COMMENT_CHECKLIST_OPTIONS
                .filter((item) => ['has_improvement_suggestions', 'telegram_token_issue', 'customers_not_adding'].includes(item.code))
                .map((item) => (
                  <Col md={6} key={`comment-checklist-problem-${item.code}`}>
                    <Form.Check
                      type="checkbox"
                      id={`restaurant-comment-check-${item.code}`}
                      checked={restaurantCommentChecklist.includes(item.code)}
                      onChange={() => toggleRestaurantCommentChecklistItem(item.code)}
                      label={language === 'uz' ? item.uz : item.ru}
                    />
                  </Col>
                ))}
            </Row>
          </div>

          <Form.Group controlId="restaurant-admin-comment">
            <Form.Label className="fw-semibold">
              {language === 'uz'
                ? "Ichki izoh (faqat superadmin ko'radi)"
                : 'Внутренний комментарий (виден только супер-админу)'}
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              maxLength={MAX_RESTAURANT_ADMIN_COMMENT_LENGTH}
              value={restaurantCommentDraft}
              onChange={(event) => setRestaurantCommentDraft(event.target.value)}
              placeholder={language === 'uz'
                ? "Masalan: dizayn yangilandi, to'lov sozlamasi o'zgartirildi..."
                : 'Например: обновили дизайн, поменяли настройки оплаты...'}
            />
            <div className="d-flex justify-content-between align-items-center mt-2">
              <Form.Text className="text-muted">
                {language === 'uz'
                  ? "Bo'sh qoldirsangiz, izoh o'chiriladi"
                  : 'Если оставить пустым, комментарий будет удален'}
              </Form.Text>
              <small className="text-muted">
                {restaurantCommentDraft.length}/{MAX_RESTAURANT_ADMIN_COMMENT_LENGTH}
              </small>
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => closeRestaurantCommentModal()}
            disabled={savingRestaurantComment}
          >
            {t('saCancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveRestaurantComment}
            disabled={savingRestaurantComment}
          >
            {savingRestaurantComment
              ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
              : t('saSave')}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showRestaurantIssuesModal}
        onHide={closeRestaurantIssuesModal}
        centered
        size="lg"
        className="sa-telegram-diagnostics-modal"
        dialogClassName="sa-telegram-diagnostics-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {language === 'uz' ? 'Telegram diagnostikasi' : 'Диагностика Telegram'}
            {restaurantIssuesTarget?.name ? `: ${restaurantIssuesTarget.name}` : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="sa-telegram-diagnostics-body">
          {restaurantIssuesLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" size="sm" className="me-2" />
              {language === 'uz' ? 'Tekshirilmoqda...' : 'Проверка...'}
            </div>
          ) : !restaurantIssuesData ? (
            <Alert variant="warning" className="mb-0">
              {language === 'uz'
                ? "Diagnostika ma'lumotlari yuklanmadi. Qayta tekshirib ko'ring."
                : 'Данные диагностики не загружены. Нажмите «Перепроверить».'}
            </Alert>
          ) : (
            <>
              <div className="sa-telegram-diagnostics-top">
                <div className="small text-muted">
                  {language === 'uz' ? 'Oxirgi tekshiruv' : 'Последняя проверка'}:{' '}
                  <strong>{restaurantIssuesData?.checked_at ? formatBalanceOperationDate(restaurantIssuesData.checked_at) : '—'}</strong>
                </div>
                <div className={`sa-telegram-diagnostics-summary ${Number(restaurantIssuesData?.issue_count || 0) > 0 ? 'is-error' : 'is-ok'}`}>
                  <span className="sa-telegram-diagnostics-summary-icon" aria-hidden="true">
                    {Number(restaurantIssuesData?.issue_count || 0) > 0 ? <DiagnosticsErrorIcon /> : <DiagnosticsOkIcon />}
                  </span>
                  <span>
                    {language === 'uz' ? 'Xatolar soni' : 'Ошибок'}: {Number(restaurantIssuesData?.issue_count || 0)}
                  </span>
                </div>
              </div>

              {(() => {
                const phoneValue = String(restaurantIssuesTarget?.phone || '').trim();
                const phoneHref = getPhoneTelHref(phoneValue);
                const telegramRaw = String(
                  restaurantIssuesTarget?.support_username ||
                  restaurantIssuesTarget?.telegram_bot_username ||
                  restaurantIssuesData?.bot_username ||
                  ''
                ).trim();
                const telegramLink = buildTelegramProfileLink(telegramRaw);
                const hasContacts = !!phoneValue || !!telegramLink;

                if (!hasContacts) return null;
                return (
                  <div className="sa-telegram-diagnostics-contacts">
                    <div className="fw-semibold mb-2">
                      {language === 'uz' ? "Do'kon kontaktlari" : 'Контакты магазина'}
                    </div>
                    <Row className="g-2">
                      <Col md={6}>
                        <div className="small text-muted">{language === 'uz' ? 'Telefon' : 'Телефон'}</div>
                        {phoneValue ? (
                          phoneHref ? (
                            <a
                              href={phoneHref}
                              className="fw-semibold text-decoration-none"
                              style={{ color: 'var(--primary-color)' }}
                            >
                              {phoneValue}
                            </a>
                          ) : (
                            <div className="fw-semibold">{phoneValue}</div>
                          )
                        ) : (
                          <div className="fw-semibold">-</div>
                        )}
                      </Col>
                      <Col md={6}>
                        <div className="small text-muted">Telegram</div>
                        {telegramLink ? (
                          <a
                            href={telegramLink.href}
                            target="_blank"
                            rel="noreferrer"
                            className="fw-semibold text-decoration-none"
                            style={{ color: 'var(--primary-color)' }}
                          >
                            {telegramLink.label}
                          </a>
                        ) : (
                          <div className="fw-semibold">-</div>
                        )}
                      </Col>
                    </Row>
                  </div>
                );
              })()}

              {Number(restaurantIssuesData?.issue_count || 0) > 0 ? (
                <div className="sa-telegram-issues-list">
                  {(restaurantIssuesData?.issues || []).map((issue, index) => {
                    const isWarning = String(issue?.severity || '') === 'warning';
                    return (
                      <div key={`${issue?.code || 'issue'}-${index}`} className={`sa-telegram-issue-card ${isWarning ? 'is-warning' : 'is-error'}`}>
                        <div className="sa-telegram-issue-head">
                          <div className="sa-telegram-issue-title-wrap">
                            <span className="sa-telegram-issue-icon" aria-hidden="true">
                              {isWarning ? <DiagnosticsWarningIcon /> : <DiagnosticsErrorIcon />}
                            </span>
                            <div className="fw-semibold">
                              {index + 1}. {issue?.title || (language === 'uz' ? 'Muammo' : 'Проблема')}
                            </div>
                          </div>
                          <Badge className={`badge-custom ${isWarning ? 'bg-warning bg-opacity-10 text-warning' : 'bg-danger bg-opacity-10 text-danger'}`}>
                            {isWarning
                              ? (language === 'uz' ? 'Ogohlantirish' : 'Предупреждение')
                              : (language === 'uz' ? 'Muhim' : 'Требует внимания')}
                          </Badge>
                        </div>
                        <div className="small text-muted mb-2">
                          {issue?.description || '—'}
                        </div>
                        <div className="small">
                          <strong>{language === 'uz' ? 'Yechim:' : 'Решение:'}</strong> {issue?.solution || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="sa-telegram-diagnostics-ok">
                  <span className="sa-telegram-diagnostics-ok-icon" aria-hidden="true">
                    <DiagnosticsOkIcon />
                  </span>
                  <span>
                    {language === 'uz'
                      ? "Muammolar topilmadi. Telegram integratsiyasi joyida."
                      : 'Проблем не найдено. Telegram-интеграция в порядке.'}
                  </span>
                </div>
              )}

              <div>
                <div className="fw-semibold mb-2">
                  {language === 'uz' ? 'Chek-list' : 'Чеклист'}
                </div>
                <div className="sa-telegram-checklist">
                  {(restaurantIssuesData?.checks || []).map((checkItem, index) => (
                    <div
                      key={`${checkItem?.code || 'check'}-${index}`}
                      className={`sa-telegram-check-item ${checkItem?.ok ? 'is-ok' : 'is-error'}`}
                    >
                      <div className="sa-telegram-check-main">
                        <span className="sa-telegram-check-icon" aria-hidden="true">
                          {checkItem?.ok ? <DiagnosticsOkIcon /> : <DiagnosticsErrorIcon />}
                        </span>
                        <div>
                          <div className="small fw-semibold">{checkItem?.label || '—'}</div>
                          {checkItem?.hint ? (
                            <div className="small text-muted">{checkItem.hint}</div>
                          ) : null}
                        </div>
                      </div>
                      <span className={`sa-telegram-check-status ${checkItem?.ok ? 'is-ok' : 'is-error'}`}>
                        {checkItem?.ok ? 'OK' : (language === 'uz' ? 'Xato' : 'Ошибка')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeRestaurantIssuesModal} disabled={restaurantIssuesLoading}>
            {language === 'uz' ? 'Yopish' : 'Закрыть'}
          </Button>
          <Button className="btn-primary-custom" onClick={refreshRestaurantIssuesModal} disabled={restaurantIssuesLoading || !restaurantIssuesTarget?.id}>
            {restaurantIssuesLoading && <Spinner animation="border" size="sm" className="me-2" />}
            {language === 'uz' ? 'Qayta tekshirish' : 'Перепроверить'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Message Templates Modal */}
      <Modal show={showMessagesModal} onHide={() => setShowMessagesModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Шаблоны сообщений: {messagesRestaurant?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="mb-3">
            <small>
              Настройте тексты уведомлений, которые будут отправляться клиентам при изменении статуса заказа.
              Оставьте поле пустым, чтобы использовать текст по умолчанию.
            </small>
          </Alert>

          <Alert variant="secondary" className="mb-3">
            <strong>Доступные переменные:</strong>
            <div className="mt-2" style={{ fontSize: '0.85rem' }}>
              <code>{'{order_number}'}</code> — номер заказа<br />
              <code>{'{customer_name}'}</code> — имя клиента<br />
              <code>{'{customer_phone}'}</code> — телефон клиента<br />
              <code>{'{total_amount}'}</code> — сумма заказа<br />
              <code>{'{delivery_address}'}</code> — адрес доставки<br />
              <code>{'{payment_method}'}</code> — способ оплаты
            </div>
            <div className="mt-2 text-muted" style={{ fontSize: '0.8rem' }}>
              Пример: <code>Здравствуйте, {'{customer_name}'}! Ваш заказ #{'{order_number}'} готовится.</code>
            </div>
          </Alert>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="primary" className="me-2">1</Badge>
              Новый заказ
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="📦 Ваш заказ в обработке!"
              value={messagesForm.msg_new}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_new: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: 📦 Ваш заказ в обработке!</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="warning" className="me-2">2</Badge>
              Готовится
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="👨‍🍳 Ваш заказ готовится"
              value={messagesForm.msg_preparing}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_preparing: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: 👨‍🍳 Ваш заказ готовится</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="info" className="me-2">3</Badge>
              Доставляется
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="🚗 Ваш заказ в пути"
              value={messagesForm.msg_delivering}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_delivering: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: 🚗 Ваш заказ в пути</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="success" className="me-2">4</Badge>
              Доставлен
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="✅ Ваш заказ доставлен!"
              value={messagesForm.msg_delivered}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_delivered: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: ✅ Ваш заказ доставлен!</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="danger" className="me-2">✕</Badge>
              Отменён
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="❌ Заказ отменен"
              value={messagesForm.msg_cancelled}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_cancelled: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: ❌ Заказ отменен</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowMessagesModal(false)}>{t('saCancel')}</Button>
          <Button variant="primary" onClick={handleSaveMessages} disabled={savingMessages}>
            {savingMessages ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reservation Furniture Modal */}
      <Modal show={showReservationTemplateModal} onHide={closeReservationTemplateModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {reservationTemplateForm.id
              ? (language === 'uz' ? 'Elementni tahrirlash' : 'Редактировать элемент')
              : (language === 'uz' ? "Shablon qo'shish" : 'Добавить шаблон')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>{language === 'uz' ? 'Nomi' : 'Название'} *</Form.Label>
            <Form.Control
              type="text"
              value={reservationTemplateForm.name}
              onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={language === 'uz' ? "Masalan: VIP stol 8 o'rin" : 'Например: VIP стол на 8 мест'}
            />
          </Form.Group>

          <Row className="g-3 mb-3">
            <Col md={4}>
              <Form.Label>{language === 'uz' ? "Sig'im" : 'Вместимость'} *</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={reservationTemplateForm.seats_count}
                onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, seats_count: e.target.value }))}
              />
            </Col>
            <Col md={4}>
              <Form.Label>{language === 'uz' ? 'Kenglik' : 'Ширина'} *</Form.Label>
              <Form.Control
                type="number"
                min={0.2}
                step={0.1}
                value={reservationTemplateForm.width}
                onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, width: e.target.value }))}
              />
            </Col>
            <Col md={4}>
              <Form.Label>{language === 'uz' ? 'Balandlik' : 'Высота'} *</Form.Label>
              <Form.Control
                type="number"
                min={0.2}
                step={0.1}
                value={reservationTemplateForm.height}
                onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, height: e.target.value }))}
              />
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Label>{language === 'uz' ? 'Shakl' : 'Форма'} *</Form.Label>
            <Form.Select
              value={reservationTemplateForm.shape}
              onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, shape: e.target.value }))}
            >
              {RESERVATION_TEMPLATE_SHAPE_OPTIONS.map((shapeOption) => (
                <option key={shapeOption.value} value={shapeOption.value}>
                  {language === 'uz' ? shapeOption.uz : shapeOption.ru}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Row className="g-3 mb-3">
            <Col md={6}>
              <Form.Label>{language === 'uz' ? 'Kategoriya' : 'Категория'} *</Form.Label>
              <Form.Select
                value={reservationTemplateForm.furniture_category}
                onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, furniture_category: e.target.value }))}
              >
                {RESERVATION_TEMPLATE_CATEGORY_OPTIONS.map((item) => (
                  <option key={`reservation-template-category-${item.value}`} value={item.value}>
                    {language === 'uz' ? item.uz : item.ru}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={6}>
              <Form.Label>{language === 'uz' ? 'Faoliyat turi' : 'Вид деятельности'}</Form.Label>
              <Form.Select
                value={reservationTemplateForm.activity_type_id || ''}
                onChange={(e) => setReservationTemplateForm((prev) => ({ ...prev, activity_type_id: e.target.value }))}
              >
                <option value="">{language === 'uz' ? 'Barcha yo‘nalishlar uchun' : 'Для всех направлений'}</option>
                {[...(activityTypes || [])]
                  .sort((a, b) => {
                    const aOrder = Number.parseInt(a?.sort_order, 10);
                    const bOrder = Number.parseInt(b?.sort_order, 10);
                    const safeAOrder = Number.isFinite(aOrder) ? aOrder : 0;
                    const safeBOrder = Number.isFinite(bOrder) ? bOrder : 0;
                    if (safeAOrder !== safeBOrder) return safeAOrder - safeBOrder;
                    return String(a?.name || '').localeCompare(String(b?.name || ''), language === 'uz' ? 'uz' : 'ru');
                  })
                  .map((item) => (
                    <option key={`reservation-template-activity-type-${item.id}`} value={String(item.id)}>
                      {item.name}
                    </option>
                  ))}
              </Form.Select>
              <Form.Text className="text-muted">
                {language === 'uz'
                  ? "Bo'sh qoldirilsa, barcha faoliyat turlarida ko'rinadi."
                  : 'Если не выбрано, шаблон виден для всех видов деятельности.'}
              </Form.Text>
            </Col>
          </Row>

          <Form.Group className="mb-2">
            <Form.Label>PNG / SVG *</Form.Label>
            <Form.Control
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              onChange={handleReservationTemplateImageSelect}
              disabled={uploadingImage}
            />
            <Form.Text className="text-muted">
              {language === 'uz'
                ? 'Fayl tanlash orqali yuklanadi. URL qo‘lda kiritilmaydi.'
                : 'Загружается только через выбор файла. Ручной ввод URL не используется.'}
            </Form.Text>
          </Form.Group>

          {reservationTemplateForm.image_url && (
            <div className="mt-3 text-center border rounded p-3 bg-light">
              <img
                src={resolveAdPreviewImageUrl(reservationTemplateForm.image_url)}
                alt={reservationTemplateForm.name || 'template'}
                style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }}
              />
              <div className="mt-2">
                <Button
                  variant="link"
                  size="sm"
                  className="text-danger text-decoration-none"
                  onClick={() => setReservationTemplateForm((prev) => ({ ...prev, image_url: '' }))}
                >
                  {language === 'uz' ? "Rasmni o'chirish" : 'Удалить изображение'}
                </Button>
              </div>
            </div>
          )}
          {uploadingImage && (
            <div className="text-muted mt-2">
              <small>{language === 'uz' ? 'Rasm yuklanmoqda...' : 'Загрузка изображения...'}</small>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeReservationTemplateModal}>
            {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
          </Button>
          <Button variant="primary" onClick={saveReservationTemplate} disabled={savingReservationTemplate}>
            {savingReservationTemplate
              ? '...'
              : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Category Modal */}
      <Modal show={showCategoryModal} onHide={closeCategoryModal}>
          <Modal.Header closeButton>
          <Modal.Title>
            {categoryForm.id ? 'Редактировать категорию' : 'Добавить категорию'}
            <div className="text-muted" style={{ fontSize: '0.9rem' }}>
              Уровень {editingLevel + 1} из {CATEGORY_LEVEL_COUNT}
            </div>
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={saveCategory}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Название (RU) *</Form.Label>
              <Form.Control
                required
                type="text"
                value={categoryForm.name_ru}
                onChange={(e) => setCategoryForm({ ...categoryForm, name_ru: e.target.value })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Название (UZ)</Form.Label>
              <Form.Control
                type="text"
                value={categoryForm.name_uz}
                onChange={(e) => setCategoryForm({ ...categoryForm, name_uz: e.target.value })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Изображение</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleCategoryImageUpload}
                disabled={uploadingImage || categoryAiLoading}
              />
              {categoryForm.image_url && (
                <div className="mt-2 text-center border p-2 rounded bg-light">
                  <img
                    src={resolveGlobalProductImagePreviewUrl(categoryForm.image_url)}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'cover' }}
                  />
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="text-danger d-block w-100 mt-2 text-decoration-none"
                    onClick={() => {
                      setCategoryForm((prev) => ({ ...prev, image_url: '' }));
                      setCategoryAiMode('');
                      setCategoryAiError('');
                    }}
                    disabled={categoryAiLoading}
                  >
                    Удалить изображение
                  </Button>
                </div>
              )}
              {uploadingImage && <div className="text-muted mt-2"><small>Загрузка изображения...</small></div>}
              <Form.Text className="text-muted mt-2 d-block">Или введите URL изображения:</Form.Text>
              <Form.Control
                type="text"
                value={categoryForm.image_url}
                onChange={(e) => {
                  setCategoryAiError('');
                  setCategoryAiMode('');
                  setCategoryForm({ ...categoryForm, image_url: e.target.value });
                }}
                placeholder="/uploads/image.webp или https://example.com/image.jpg"
                className="mt-1"
                disabled={categoryAiLoading}
              />

              <div className="d-flex flex-wrap gap-2 mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline-primary"
                  onClick={() => runCategoryAiPreview('generate')}
                  disabled={!isAiFeatureEnabled || categoryAiLoading || !String(categoryForm.name_ru || categoryForm.name_uz || '').trim()}
                >
                  {language === 'uz' ? 'Generatsiya' : 'Генерация'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline-primary"
                  onClick={() => runCategoryAiPreview('process')}
                  disabled={!isAiFeatureEnabled || categoryAiLoading || !String(categoryForm.image_url || '').trim()}
                >
                  {language === 'uz' ? 'Обработка' : 'Обработать'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline-secondary"
                  onClick={handleRegenerateCategoryAiPreview}
                  disabled={!isAiFeatureEnabled || categoryAiLoading || (!String(categoryForm.name_ru || categoryForm.name_uz || '').trim() && !String(categoryForm.image_url || '').trim())}
                >
                  {language === 'uz' ? 'Qayta yaratish' : 'Перегенерировать'}
                </Button>
              </div>
              {!isAiFeatureEnabled && (
                <Alert variant="secondary" className="mt-2 mb-0 py-2 px-3">
                  {aiDisabledMessage}
                </Alert>
              )}
              {categoryAiMode && !categoryAiError && (
                <div className="mt-2 small text-muted">
                  {categoryAiLoading
                    ? (language === 'uz' ? "AI rasm tayyorlanmoqda..." : 'AI изображение подготавливается...')
                    : (
                      categoryAiMode === 'process'
                        ? (language === 'uz' ? "AI: rasm qayta ishlanib shu slotga qo'llandi" : 'AI: обработка завершена и применена в этот слот')
                        : (language === 'uz' ? "AI: rasm yaratildi va shu slotga qo'llandi" : 'AI: генерация завершена и применена в этот слот')
                    )}
                </div>
              )}
              {categoryAiError && (
                <Alert variant="warning" className="mt-2 mb-0 py-2 px-3">
                  {categoryAiError}
                </Alert>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Порядок сортировки *
              </Form.Label>
              <Form.Control
                required
                type="number"
                min="0"
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) || 0 })}
              />
              <Form.Text className="text-muted">
                Категории с меньшим числом отображаются первыми.
                <br />
                <span className="text-secondary opacity-75">Рекомендуемый свободный номер: <strong>{getNextAvailableSortOrder(categoryForm.parent_id)}</strong></span>
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="secondary" onClick={closeCategoryModal}>{t('saCancel')}</Button>
            <Button variant="primary" type="submit">{t('saSave')}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal
        show={showOperatorStoresModal}
        onHide={() => setShowOperatorStoresModal(false)}
        centered
        dialogClassName="sa-operator-stores-modal"
      >
        <Modal.Header closeButton className="sa-operator-stores-modal-header">
          <Modal.Title>
            {language === 'uz' ? "Biriktirilgan do'konlar" : 'Закреплённые магазины'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="sa-operator-stores-modal-body">
          <div className="sa-operator-stores-modal-operator">{operatorStoresModalPayload.operatorName || '-'}</div>
          {Array.isArray(operatorStoresModalPayload.restaurants) && operatorStoresModalPayload.restaurants.length > 0 ? (
            <div className="sa-operator-stores-scroll">
              <div className="sa-operator-stores-list">
                {operatorStoresModalPayload.restaurants.map((restaurant, index) => (
                  <div key={restaurant.id} className="sa-operator-stores-list-item">
                    <span className="sa-operator-stores-list-index">{index + 1}</span>
                    <span className="sa-operator-stores-list-name">{restaurant.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-muted small">
              {language === 'uz' ? "Biriktirilgan do'konlar topilmadi" : 'Закреплённые магазины не найдены'}
            </div>
          )}
        </Modal.Body>
      </Modal>

      {showHiddenOpsConsole && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 2050,
            background: '#0b1220',
            color: '#dbeafe',
            border: '1px solid #334155',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(2, 6, 23, 0.45)',
            padding: 12
          }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong style={{ fontSize: 13 }}>system_console.exe</strong>
            <small style={{ opacity: 0.8 }}>Ctrl + ` to toggle</small>
          </div>
          <div
            style={{
              background: '#020617',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '8px 10px',
              maxHeight: 140,
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              marginBottom: 8
            }}
          >
            {hiddenOpsConsoleHistory.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
          <div className="d-flex gap-2">
            <Form.Control
              ref={hiddenOpsConsoleInputRef}
              value={hiddenOpsConsoleInput}
              onChange={(e) => setHiddenOpsConsoleInput(e.target.value)}
              placeholder="Type command and press Enter..."
              className="form-control-custom"
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                borderColor: '#334155',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const command = hiddenOpsConsoleInput;
                setHiddenOpsConsoleInput('');
                runHiddenOpsConsoleCommand(command);
              }}
            />
            <Button
              variant="outline-light"
              onClick={() => {
                const command = hiddenOpsConsoleInput;
                setHiddenOpsConsoleInput('');
                runHiddenOpsConsoleCommand(command);
              }}
            >
              Enter
            </Button>
            <Button variant="secondary" onClick={() => setShowHiddenOpsConsole(false)}>
              Hide
            </Button>
          </div>
        </div>
      )}

      <Modal
        show={showFoundersAccessModal}
        onHide={() => {
          setShowFoundersAccessModal(false);
          setFoundersAccessError('');
        }}
        centered
      >
        <Form onSubmit={handleFoundersAccessSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>
              {language === 'uz' ? 'Ta’sischilar bo‘limiga kirish' : 'Вход во вкладку учредителей'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group>
              <Form.Label>
                {language === 'uz' ? 'Alohida parol' : 'Отдельный пароль'}
              </Form.Label>
              <Form.Control
                ref={foundersPasswordInputRef}
                type="password"
                value={foundersPasswordInput}
                onChange={(e) => {
                  setFoundersPasswordInput(e.target.value);
                  if (foundersAccessError) setFoundersAccessError('');
                }}
                placeholder={language === 'uz' ? 'Parolni kiriting' : 'Введите пароль'}
                autoComplete="off"
              />
            </Form.Group>
            {foundersAccessError && (
              <Alert variant="danger" className="mt-3 mb-0 py-2">
                {foundersAccessError}
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                setShowFoundersAccessModal(false);
                setFoundersAccessError('');
              }}
              disabled={foundersAnalyticsLoading}
            >
              {language === 'uz' ? 'Yopish' : 'Закрыть'}
            </Button>
            <Button type="submit" className="btn-primary-custom" disabled={foundersAnalyticsLoading}>
              {foundersAnalyticsLoading
                ? (language === 'uz' ? 'Tekshirilmoqda...' : 'Проверка...')
                : (language === 'uz' ? 'Kirish' : 'Войти')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal
        show={showOrganizationExpenseModal}
        onHide={() => {
          if (organizationExpenseSubmitting) return;
          setShowOrganizationExpenseModal(false);
          setOrganizationExpenseForm(createInitialOrganizationExpenseForm());
          setOrganizationExpenseCategorySearch('');
        }}
        centered
      >
        <Form onSubmit={submitOrganizationExpense}>
          <Modal.Header closeButton>
            <Modal.Title>
              {organizationExpenseForm.id
                ? (language === 'uz' ? 'Xarajatni tahrirlash' : 'Редактировать расход')
                : (language === 'uz' ? "Xarajat qo'shish" : 'Добавить расход')}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Row className="g-3">
              <Col xs={12}>
                <Form.Label>{language === 'uz' ? 'Xarajat maqolasi' : 'Статья расхода'} *</Form.Label>
                <CustomSelectDropdown
                  value={organizationExpenseForm.category_id}
                  onChange={(nextValue) => {
                    setOrganizationExpenseForm((prev) => ({ ...prev, category_id: String(nextValue || '') }));
                    setOrganizationExpenseCategorySearch('');
                  }}
                  options={organizationExpenseCategoryFilteredOptions.map((item) => ({
                    value: String(item.id),
                    label: language === 'uz'
                      ? (item.name_uz || item.name_ru || `#${item.id}`)
                      : (item.name_ru || item.name_uz || `#${item.id}`)
                  }))}
                  placeholder={language === 'uz' ? 'Tanlang' : 'Выберите'}
                  searchable
                  searchValue={organizationExpenseCategorySearch}
                  onSearchChange={setOrganizationExpenseCategorySearch}
                  searchPlaceholder={language === 'uz' ? "Ro'yxatdan izlash..." : 'Поиск по списку...'}
                  noDataLabel={language === 'uz' ? "Maqola topilmadi" : 'Статья не найдена'}
                  toggleStyle={{ minHeight: '42px' }}
                />
                {organizationExpenseCategoryFilteredOptions.length === 0 && (
                  <div className="small text-muted mt-1">
                    {language === 'uz' ? "Maqola topilmadi" : 'Статья не найдена'}
                  </div>
                )}
              </Col>
              <Col md={6}>
                <Form.Label>{language === 'uz' ? 'Summa' : 'Сумма'} *</Form.Label>
                <Form.Control
                  type="text"
                  value={organizationExpenseForm.amount}
                  onChange={(e) => setOrganizationExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder={language === 'uz' ? "Masalan: 250000" : 'Например: 250000'}
                />
              </Col>
              <Col md={6}>
                <Form.Label>{language === 'uz' ? 'Valyuta kodi' : 'Код валюты'} *</Form.Label>
                <Form.Control
                  type="text"
                  value={organizationExpenseForm.currency_code}
                  onChange={(e) => setOrganizationExpenseForm((prev) => ({ ...prev, currency_code: String(e.target.value || '').trim().toLowerCase() }))}
                  placeholder="uz"
                />
              </Col>
              <Col md={6}>
                <Form.Label>{language === 'uz' ? 'Xarajat sanasi' : 'Дата расхода'} *</Form.Label>
                <Form.Control
                  type="date"
                  value={organizationExpenseForm.expense_date}
                  onChange={(e) => setOrganizationExpenseForm((prev) => ({ ...prev, expense_date: e.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Label>{language === 'uz' ? 'Izoh' : 'Описание'}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={organizationExpenseForm.description}
                  onChange={(e) => setOrganizationExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={language === 'uz' ? 'Qisqa izoh' : 'Краткое описание'}
                />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                if (organizationExpenseSubmitting) return;
                setShowOrganizationExpenseModal(false);
                setOrganizationExpenseForm(createInitialOrganizationExpenseForm());
                setOrganizationExpenseCategorySearch('');
              }}
              disabled={organizationExpenseSubmitting}
            >
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button type="submit" className="btn-primary-custom" disabled={organizationExpenseSubmitting}>
              {organizationExpenseSubmitting
                ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal
        show={showExpenseCategoryModal}
        onHide={() => {
          if (expenseCategorySubmitting) return;
          setShowExpenseCategoryModal(false);
          setExpenseCategoryForm(createInitialExpenseCategoryForm());
        }}
        centered
      >
        <Form onSubmit={submitExpenseCategory}>
          <Modal.Header closeButton>
            <Modal.Title>
              {expenseCategoryForm.id
                ? (language === 'uz' ? 'Maqolani tahrirlash' : 'Редактировать статью расхода')
                : (language === 'uz' ? "Maqola qo'shish" : 'Добавить статью расхода')}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Row className="g-3">
              <Col xs={12}>
                <Form.Label>{language === 'uz' ? 'Nomi (RU)' : 'Название (RU)'} *</Form.Label>
                <Form.Control
                  type="text"
                  value={expenseCategoryForm.name_ru}
                  onChange={(e) => setExpenseCategoryForm((prev) => ({ ...prev, name_ru: e.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Label>{language === 'uz' ? 'Nomi (UZ)' : 'Название (UZ)'}</Form.Label>
                <Form.Control
                  type="text"
                  value={expenseCategoryForm.name_uz}
                  onChange={(e) => setExpenseCategoryForm((prev) => ({ ...prev, name_uz: e.target.value }))}
                />
              </Col>
              {expenseCategoryForm.id && (
                <Col xs={12}>
                  <Form.Check
                    type="switch"
                    id="expense-category-active-switch"
                    label={language === 'uz' ? 'Faol' : 'Активна'}
                    checked={expenseCategoryForm.is_active !== false}
                    onChange={(e) => setExpenseCategoryForm((prev) => ({ ...prev, is_active: !!e.target.checked }))}
                  />
                </Col>
              )}
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                if (expenseCategorySubmitting) return;
                setShowExpenseCategoryModal(false);
                setExpenseCategoryForm(createInitialExpenseCategoryForm());
              }}
              disabled={expenseCategorySubmitting}
            >
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button type="submit" className="btn-primary-custom" disabled={expenseCategorySubmitting}>
              {expenseCategorySubmitting
                ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Topup Modal */}
      <Modal show={showTopupModal} onHide={closeTopupModal} centered className="admin-modal">
        <Modal.Header closeButton>
          <Modal.Title>{t('topupRestaurantBalance')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {!topupRestaurant && (
            <div className="mb-3">
              <Form.Label className="small fw-bold text-muted text-uppercase">
                {language === 'uz' ? "Do'kon" : 'Магазин'}
              </Form.Label>
              <SearchableRestaurantFilter
                t={t}
                width="100%"
                value={topupRestaurant?.id ? String(topupRestaurant.id) : ''}
                restaurants={topupRestaurantOptions}
                searchValue={topupRestaurantSearch}
                onSearchChange={setTopupRestaurantSearch}
                onChange={(nextValue) => {
                  const selected = allRestaurants.find((item) => String(item.id) === String(nextValue));
                  setTopupRestaurant(selected || null);
                  setTopupRestaurantSearch('');
                  if (selected?.id) {
                    loadTopupTransactions(selected.id);
                  } else {
                    setTopupTransactions([]);
                  }
                }}
              />
            </div>
          )}
          {topupRestaurant && (
            <div className="mb-4 p-3 bg-light rounded-3 d-flex align-items-center gap-3">
              <div className="fs-1">💰</div>
              <div>
                <h6 className="mb-1 fw-bold">{topupRestaurant.name}</h6>
                <div className="text-muted small">{t('currentBalance')}: {formatBalanceAmount(topupRestaurant.balance)} {getCurrencyLabelByCode(topupRestaurant.currency_code || countryCurrency?.code)}</div>
              </div>
            </div>
          )}
          <div className="d-flex align-items-center gap-2 mb-3">
            <Button
              size="sm"
              variant={topupMode === 'deposit' ? 'success' : 'light'}
              onClick={() => setTopupMode('deposit')}
            >
              {language === 'uz' ? "To'ldirish" : 'Пополнение'}
            </Button>
            <Button
              size="sm"
              variant={topupMode === 'withdrawal' ? 'danger' : 'light'}
              onClick={() => setTopupMode('withdrawal')}
            >
              {language === 'uz' ? 'Qaytarish' : 'Возврат'}
            </Button>
          </div>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold text-muted text-uppercase">
              {topupMode === 'withdrawal'
                ? (language === 'uz' ? 'Qaytarish summasi' : 'Сумма возврата')
                : t('amountToTopup')}
            </Form.Label>
            <Form.Control
              type="text"
              inputMode="numeric"
              className="form-control-custom"
              placeholder="100000"
              value={formatThousands(topupForm.amount)}
              onChange={handleTopupAmountChange}
            />
          </Form.Group>
          <Form.Group className="mb-0">
            <Form.Label className="small fw-bold text-muted text-uppercase">
              {language === 'uz' ? 'Operatsiya izohi' : 'Примечание к операции'}
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              className="form-control-custom"
              placeholder={topupMode === 'withdrawal'
                ? (language === 'uz' ? "Masalan: noto'g'ri to'lov bo'yicha qaytarish" : 'Например: Возврат по ошибочному платежу')
                : 'Например: Оплата наличными в офисе'}
              value={topupForm.description}
              onChange={e => setTopupForm({ ...topupForm, description: e.target.value })}
            />
          </Form.Group>
          <div className="mt-4">
            <div className="small fw-bold text-muted text-uppercase mb-2">
              {language === 'uz' ? 'Operatsiyalar tarixi' : 'История операций'}
            </div>
            <div className="border rounded-3 p-2" style={{ maxHeight: '220px', overflowY: 'auto', background: '#f8fafc' }}>
              {!topupRestaurant?.id ? (
                <div className="text-center py-3 text-muted small">
                  {language === 'uz' ? "Do'kon tanlang" : 'Выберите магазин'}
                </div>
              ) : topupTransactionsLoading ? (
                <div className="text-center py-3 text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  {language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
                </div>
              ) : topupTransactions.length ? (
                topupTransactions.map((transaction, index) => {
                  const isDeposit = String(transaction?.type || '').toLowerCase() === 'deposit';
                  const actorLabel = String(transaction?.actor_name || transaction?.actor_username || '').trim() || (language === 'uz' ? 'Tizim' : 'Система');
                  return (
                    <div
                      key={transaction.id || `${transaction.created_at || 'tx'}-${index}`}
                      className={`d-flex justify-content-between align-items-start gap-3 py-2 ${index < topupTransactions.length - 1 ? 'border-bottom' : ''}`}
                    >
                      <div className="small">
                        <div className="fw-semibold">
                          {isDeposit
                            ? (language === 'uz' ? "To'ldirish" : 'Пополнение')
                            : (language === 'uz' ? 'Qaytarish' : 'Возврат')}
                        </div>
                        <div className="text-muted">
                          {language === 'uz' ? 'Kim:' : 'Кто:'} {actorLabel}
                        </div>
                        {transaction?.description && (
                          <div className="text-muted">{transaction.description}</div>
                        )}
                      </div>
                      <div className="text-end small">
                        <div className={`fw-bold ${isDeposit ? 'text-success' : 'text-danger'}`}>
                          {isDeposit ? '+' : '-'}{formatBalanceAmount(transaction?.amount)} {getCurrencyLabelByCode(transaction?.restaurant_currency_code || topupRestaurant?.currency_code || countryCurrency?.code)}
                        </div>
                        <div className="text-muted">{formatBalanceOperationDate(transaction?.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-muted small py-3">
                  {language === 'uz' ? "Operatsiyalar yo'q" : 'Операций пока нет'}
                </div>
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={closeTopupModal}>{t('cancel')}</Button>
          {topupMode === 'withdrawal' ? (
            <Button variant="danger" className="px-4" onClick={handleTopup} disabled={topupSubmitting}>
              {topupSubmitting && <Spinner animation="border" size="sm" className="me-2" />}
              {language === 'uz' ? 'Qaytarish' : 'Сделать возврат'}
            </Button>
          ) : (
            <Button className="btn-primary-custom px-4" onClick={handleTopup} disabled={topupSubmitting}>
              {topupSubmitting && <Spinner animation="border" size="sm" className="me-2" />}
              {t('topupAction')}
            </Button>
          )}
        </Modal.Footer>
      </Modal>

    </div>
  );
}

export default SuperAdminDashboard;
