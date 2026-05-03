import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminStyles.css';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Table from 'react-bootstrap/Table';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import Dropdown from 'react-bootstrap/Dropdown';
import Tabs from 'react-bootstrap/Tabs';
import Tab from 'react-bootstrap/Tab';
import Accordion from 'react-bootstrap/Accordion';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import InputGroup from 'react-bootstrap/InputGroup';
import Pagination from 'react-bootstrap/Pagination';
import Spinner from 'react-bootstrap/Spinner';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatQuantity } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useTimedActionButtonsVisibility } from '../hooks/useTimedActionButtonsVisibility';
import * as XLSX from 'xlsx';
import YandexLocationPicker from '../components/YandexLocationPicker';
import DeliveryZonePicker from '../components/DeliveryZonePicker';
import YandexAnalyticsMap from '../components/YandexAnalyticsMap';
import { AdminDashboardSkeleton, ListSkeleton, TableSkeleton } from '../components/SkeletonUI';
import CountryCurrencyDropdown from '../components/CountryCurrencyDropdown';
import HeaderGlowBackground from '../components/HeaderGlowBackground';
import ShowcaseBuilder from './ShowcaseBuilder';
import {
  getLeafletTileLayerConfig,
  getSavedMapProvider,
  normalizeMapProvider,
  saveMapProvider
} from '../utils/mapTileProviders';
import {
  DEFAULT_MENU_ICON_SETTINGS,
  isImageIconValue,
  normalizeMenuIconSettings
} from '../constants/menuIcons';
import {
  BookOpen,
  Boxes,
  CalendarDays,
  Copy,
  Download,
  FlaskConical,
  Home,
  LayoutGrid,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search as SearchIcon,
  Settings,
  ShoppingCart,
  Trash2,
  User as UserIcon,
  Users
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY = 'admin_sidebar_collapsed_v1';
const ADMIN_ACTIVE_TAB_STORAGE_KEY = 'admin_active_tab_v1';
const UI_THEME_VALUES = new Set([
  'classic',
  'modern',
  'talablar_blue',
  'mint_fresh',
  'sunset_pop',
  'berry_blast',
  'violet_wave',
  'rainbow'
]);
const UI_THEME_OPTIONS = [
  { value: 'classic', label: 'Текущий (Classic)', preview: ['#64748b', '#475569', '#334155'] },
  { value: 'modern', label: 'Новый (Modern)', preview: ['#14b8a6', '#0f766e', '#0b5f58'] },
  { value: 'talablar_blue', label: 'Talablar Blue (бело-синий)', preview: ['#6366f1', '#4f46e5', '#4338ca'] },
  { value: 'mint_fresh', label: 'Mint Fresh (мятный)', preview: ['#10b981', '#0f766e', '#22d3ee'] },
  { value: 'sunset_pop', label: 'Sunset Pop (тёплый)', preview: ['#f97316', '#ea580c', '#f43f5e'] },
  { value: 'berry_blast', label: 'Berry Blast (ягодный)', preview: ['#db2777', '#be185d', '#f97316'] },
  { value: 'violet_wave', label: 'Violet Wave (фиолетовый)', preview: ['#8b5cf6', '#6d28d9', '#22d3ee'] },
  { value: 'rainbow', label: 'Rainbow (радужный)', preview: ['#3b82f6', '#f97316', '#8b5cf6'] }
];
const UI_FONT_FAMILY_VALUES = new Set([
  'sans',
  'inter',
  'roboto',
  'open_sans',
  'lato',
  'montserrat',
  'poppins',
  'nunito',
  'serif_times',
  'serif_georgia',
  'serif_merriweather',
  'serif_playfair',
  'serif_garamond',
  'serif_baskerville'
]);
const UI_FONT_FAMILY_OPTIONS = [
  {
    value: 'sans',
    label: 'Manrope',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'inter',
    label: 'Inter',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'roboto',
    label: 'Roboto',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'open_sans',
    label: 'Open Sans',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'lato',
    label: 'Lato',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'montserrat',
    label: 'Montserrat',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'poppins',
    label: 'Poppins',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'nunito',
    label: 'Nunito',
    group: 'Sans',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'serif_times',
    label: 'Times New Roman',
    group: 'Serif',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'serif_georgia',
    label: 'Georgia',
    group: 'Serif',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'serif_merriweather',
    label: 'Merriweather',
    group: 'Serif',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'serif_playfair',
    label: 'Playfair Display',
    group: 'Serif',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'serif_garamond',
    label: 'Garamond',
    group: 'Serif',
    sample: 'Быстрый заказ и удобный каталог'
  },
  {
    value: 'serif_baskerville',
    label: 'Baskerville',
    group: 'Serif',
    sample: 'Быстрый заказ и удобный каталог'
  }
];
const UI_FONT_FAMILY_PREVIEW_STYLES = Object.freeze({
  sans: "'Manrope', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  inter: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "'Roboto', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  open_sans: "'Open Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  lato: "'Lato', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  montserrat: "'Montserrat', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  poppins: "'Poppins', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  nunito: "'Nunito', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  serif_times: "'Times New Roman', Times, 'Nimbus Roman No9 L', serif",
  serif_georgia: "Georgia, 'Times New Roman', Times, serif",
  serif_merriweather: "'Merriweather', Georgia, 'Times New Roman', serif",
  serif_playfair: "'Playfair Display', Georgia, 'Times New Roman', serif",
  serif_garamond: "Garamond, 'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  serif_baskerville: "Baskerville, 'Times New Roman', Georgia, serif"
});
const MENU_MODE_PREVIEW_MEDIA = Object.freeze({
  categoryPhoto: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900' viewBox='0 0 1200 900'%3E%3Crect width='1200' height='900' rx='24' fill='%23eef2f7'/%3E%3Crect x='60' y='80' width='1080' height='740' rx='28' fill='%23dde5ef'/%3E%3Cpath d='M260 640h680l-70 120H330z' fill='%23c5ceda'/%3E%3Ccircle cx='420' cy='420' r='118' fill='%23b6c2d2'/%3E%3Ccircle cx='780' cy='420' r='118' fill='%23b6c2d2'/%3E%3C/svg%3E",
  categoryPhotoAlt: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900' viewBox='0 0 1200 900'%3E%3Crect width='1200' height='900' rx='24' fill='%23eef2f7'/%3E%3Crect x='60' y='80' width='1080' height='740' rx='28' fill='%23dde5ef'/%3E%3Cpath d='M260 640h680l-70 120H330z' fill='%23c5ceda'/%3E%3Ccircle cx='420' cy='420' r='118' fill='%23b6c2d2'/%3E%3Ccircle cx='780' cy='420' r='118' fill='%23b6c2d2'/%3E%3C/svg%3E",
  productPhoto: "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900' viewBox='0 0 1200 900'%3E%3Crect width='1200' height='900' rx='24' fill='%23eef2f7'/%3E%3Crect x='60' y='80' width='1080' height='740' rx='28' fill='%23dde5ef'/%3E%3Cpath d='M260 640h680l-70 120H330z' fill='%23c5ceda'/%3E%3Ccircle cx='420' cy='420' r='118' fill='%23b6c2d2'/%3E%3Ccircle cx='780' cy='420' r='118' fill='%23b6c2d2'/%3E%3C/svg%3E"
});
const APPEARANCE_PREVIEW_THEME_TOKENS = Object.freeze({
  classic: { bgStart: '#edf3ff', bgEnd: '#f6fbff', accent: '#4f46e5', accentSoft: '#c7d2fe' },
  modern: { bgStart: '#e6fffb', bgEnd: '#f0fdf4', accent: '#0f766e', accentSoft: '#99f6e4' },
  talablar_blue: { bgStart: '#e6edff', bgEnd: '#f0f6ff', accent: '#4338ca', accentSoft: '#c7d2fe' },
  mint_fresh: { bgStart: '#e7fff6', bgEnd: '#f0fffb', accent: '#0f766e', accentSoft: '#99f6e4' },
  sunset_pop: { bgStart: '#fff3ea', bgEnd: '#fff8f1', accent: '#ea580c', accentSoft: '#fdba74' },
  berry_blast: { bgStart: '#ffeaf4', bgEnd: '#fff2f7', accent: '#be185d', accentSoft: '#f9a8d4' },
  violet_wave: { bgStart: '#f2ecff', bgEnd: '#f8f5ff', accent: '#6d28d9', accentSoft: '#ddd6fe' },
  rainbow: { bgStart: '#edf4ff', bgEnd: '#fff7ef', accent: '#2563eb', accentSoft: '#bfdbfe' }
});
const normalizeUiTheme = (value, fallback = 'classic') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (UI_THEME_VALUES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return UI_THEME_VALUES.has(normalizedFallback) ? normalizedFallback : 'classic';
};
const normalizeUiFontFamily = (value, fallback = 'sans') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (UI_FONT_FAMILY_VALUES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return UI_FONT_FAMILY_VALUES.has(normalizedFallback) ? normalizedFallback : 'sans';
};
const normalizeDeliveryPricingMode = (value, fallback = 'dynamic') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fixed' || normalized === 'dynamic') return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return normalizedFallback === 'fixed' ? 'fixed' : 'dynamic';
};
const normalizeCatalogCardMode = (value, fallback = 'wide') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'portrait' || normalized === 'wide') return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return normalizedFallback === 'portrait' ? 'portrait' : 'wide';
};
const normalizeMenuViewMode = (value, fallback = 'grid_categories') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'grid_categories' || normalized === 'single_list' || normalized === 'nested_categories') {
    return normalized;
  }
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  if (normalizedFallback === 'single_list') return 'single_list';
  if (normalizedFallback === 'nested_categories') return 'nested_categories';
  return 'grid_categories';
};
const normalizeId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const PRODUCT_PLACEHOLDER_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='10' fill='%23eef2f7'/%3E%3Cpath d='M18 28h28l-2 16a4 4 0 0 1-4 3H24a4 4 0 0 1-4-3l-2-16z' fill='%23c5ceda'/%3E%3Cpath d='M24 28a8 8 0 0 1 16 0' fill='none' stroke='%2390a0b4' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";
const PRODUCT_IMAGE_SLOTS_COUNT = 5;
const VARIANT_IMAGE_SLOTS_COUNT = 5;
const MAX_PRODUCT_SIZE_OPTIONS = 20;
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
const STOCK_IMPORT_MODE_VALUES = new Set(['replace', 'add']);
const STOCK_IMPORT_TEMPLATE_HEADERS = [
  'Product ID',
  'Название товара',
  'Вариант',
  'Штрихкод',
  'Фото',
  'Текущий остаток',
  'Приход (шт)'
];
const ANALYTICS_DEFAULT_MAP_CENTER = [41.311081, 69.240562];
const ANALYTICS_DEFAULT_MAP_ZOOM = 12;
const ANALYTICS_MAP_IDLE_RESET_MS = 60 * 1000;
const DAILY_REPORT_HOURS_COUNT = 24;
const PAYMENT_PLACEHOLDER_SYSTEMS = ['click', 'uzum', 'xazna'];
const ANALYTICS_PAYMENT_METHOD_ORDER = ['payme', 'click', 'uzum', 'xazna', 'card', 'cash'];
const MAX_ORDER_RATING = 5;
const ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS = 7000;
const ADMIN_DASHBOARD_LOADING_GUARD_MS = 12000;
const CONTAINER_LABEL_WORDS_BY_LANGUAGE = Object.freeze({
  ru: ['Пакет', 'Посуда', 'Коробка', 'Мешок'],
  uz: ['Paket', 'Idish', 'Quti', 'Qop']
});
const createEmptyProductReviewAnalytics = () => ({
  period: 'daily',
  date: '',
  startDate: '',
  endDateExclusive: '',
  year: null,
  month: null,
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
const KANBAN_COLUMN_FILTER_DEFAULT = Object.freeze({
  sortDirection: 'desc',
  fulfillment: 'all',
  timing: 'all',
  scheduleSort: 'none'
});
const ANALYTICS_PAYMENT_METHOD_META = {
  payme: { labelRu: 'Payme', labelUz: 'Payme', color: '#26c6da', iconType: 'image' },
  click: { labelRu: 'Click', labelUz: 'Click', color: '#2563eb', iconType: 'image' },
  uzum: { labelRu: 'Uzum', labelUz: 'Uzum', color: '#7c3aed', iconType: 'image' },
  xazna: { labelRu: 'Xazna', labelUz: 'Xazna', color: '#166534', iconType: 'image' },
  card: { labelRu: 'Карта', labelUz: 'Karta', color: '#0ea5e9', iconType: 'emoji', icon: '💳' },
  cash: { labelRu: 'Наличные', labelUz: 'Naqd', color: '#16a34a', iconType: 'emoji', icon: '💵' }
};
const normalizeAnalyticsPaymentMethod = (paymentMethod) => {
  const normalized = String(paymentMethod || '').trim().toLowerCase();
  return ANALYTICS_PAYMENT_METHOD_ORDER.includes(normalized) ? normalized : '';
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
const isOperatorProductsPasteHeaderRow = (cells = []) => {
  const joined = String((cells || []).join(' ') || '').toLowerCase();
  if (!joined) return false;
  return (
    joined.includes('категор')
    || joined.includes('category')
    || joined.includes('название')
    || joined.includes('name')
    || joined.includes('описание')
    || joined.includes('description')
    || joined.includes('цена')
    || joined.includes('price')
    || joined.includes('единиц')
    || joined.includes('unit')
    || joined.includes('штрих')
    || joined.includes('barcode')
    || joined.includes('икпу')
    || joined.includes('ikpu')
    || joined.includes('сезон')
    || joined.includes('hidden')
  );
};
const mapOperatorProductsPasteMatrixRows = (matrix = []) => {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const sourceRows = isOperatorProductsPasteHeaderRow(matrix[0]) ? matrix.slice(1) : matrix;
  const rows = [];

  sourceRows.forEach((cells = [], index) => {
    const normalizedCells = Array.from({ length: 14 }, (_, colIndex) => String(cells[colIndex] || '').trim());
    const hasAnyValue = normalizedCells.some((value) => value !== '');
    if (!hasAnyValue) return;

    rows.push({
      rowNo: index + 1,
      sourceCategoryLevel1: normalizedCells[0],
      sourceCategoryLevel2: normalizedCells[1],
      sourceCategoryLevel3: normalizedCells[2],
      name_ru: normalizedCells[3],
      name_uz: normalizedCells[4],
      description_ru: normalizedCells[5],
      description_uz: normalizedCells[6],
      price_raw: normalizedCells[7],
      unit: normalizedCells[8] || 'шт',
      barcode: normalizedCells[9],
      ikpu: normalizedCells[10],
      in_stock_raw: normalizedCells[11],
      season_scope_raw: normalizedCells[12],
      is_hidden_catalog_raw: normalizedCells[13]
    });
  });

  return rows;
};
const padDatePart = (value) => String(value).padStart(2, '0');
const toLocalDateKey = (rawDate) => {
  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};
const getTodayDateKey = () => toLocalDateKey(new Date());
const shiftDateKeyByDays = (dateKey, offsetDays = 0) => {
  const [year, month, day] = String(dateKey || '').split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  const normalizedOffset = Number.isFinite(Number(offsetDays)) ? Number(offsetDays) : 0;
  date.setDate(date.getDate() + normalizedOffset);
  return toLocalDateKey(date);
};
const isOrderInDateKey = (value, dateKey) => {
  if (!dateKey) return false;
  return toLocalDateKey(value) === dateKey;
};
const formatHourLabel = (hour) => `${padDatePart(hour)}:00`;
const formatDateKeyLabel = (dateKey, language = 'ru') => {
  const [year, month, day] = String(dateKey || '').split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return dateKey || '—';
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dateKey || '—';
  return date.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'short'
  });
};
const formatPercentLabel = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0%';
  return `${parsed.toFixed(1)}%`;
};
const normalizeOrderRatingValue = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > MAX_ORDER_RATING) return MAX_ORDER_RATING;
  return parsed;
};
const buildOrderRatingStars = (value) => {
  const normalized = normalizeOrderRatingValue(value);
  return `${'★'.repeat(normalized)}${'☆'.repeat(Math.max(0, MAX_ORDER_RATING - normalized))}`;
};
const buildMiniSparklinePoints = (values = []) => {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const source = numericValues.length ? numericValues : [0, 0, 0, 0];
  const maxValue = Math.max(...source, 1);
  const minValue = Math.min(...source, 0);
  const range = Math.max(maxValue - minValue, 1);
  const width = 120;
  const height = 28;
  const chartHeight = 14;
  const yOffset = 9;

  return source.map((value, index) => {
    const x = source.length === 1
      ? 0
      : (index / (source.length - 1)) * width;
    const y = yOffset + chartHeight - (((value - minValue) / range) * chartHeight);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
};
const buildDailyOrdersTimeline = (orders = []) => {
  const points = Array.from({ length: DAILY_REPORT_HOURS_COUNT }, (_, hour) => ({
    hour,
    count: 0
  }));

  for (const order of orders || []) {
    const createdAt = new Date(order?.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    points[createdAt.getHours()].count += 1;
  }

  const maxCount = points.reduce((max, point) => Math.max(max, point.count), 0);
  const peakHours = maxCount > 0
    ? points.filter((point) => point.count === maxCount).map((point) => point.hour)
    : [];

  return {
    points,
    maxCount,
    peakHours
  };
};
const buildHourlyMetricTimeline = (orders = [], valueAccessor = () => 1) => {
  const points = Array.from({ length: DAILY_REPORT_HOURS_COUNT }, (_, hour) => ({
    label: formatHourLabel(hour),
    value: 0
  }));

  for (const order of orders || []) {
    const createdAt = new Date(order?.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    const hour = createdAt.getHours();
    points[hour].value += Math.max(0, toNumericValue(valueAccessor(order), 0));
  }

  return points;
};
const buildMonthDayMetricTimeline = (orders = [], year, month, valueAccessor = () => 1) => {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeMonth = Number(month) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate();
  const points = Array.from({ length: daysInMonth }, (_, dayIndex) => ({
    label: `${dayIndex + 1}`,
    value: 0
  }));

  for (const order of orders || []) {
    const createdAt = new Date(order?.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt.getFullYear() !== safeYear || createdAt.getMonth() + 1 !== safeMonth) continue;
    const dayIndex = createdAt.getDate() - 1;
    if (dayIndex < 0 || dayIndex >= points.length) continue;
    points[dayIndex].value += Math.max(0, toNumericValue(valueAccessor(order), 0));
  }

  return points;
};
const buildTopProductsAnalytics = (orders = [], limit = 10) => {
  const productStats = {};

  for (const order of orders || []) {
    if (!Array.isArray(order?.items)) continue;
    for (const item of order.items) {
      const productName = String(item?.product_name || '').trim() || 'Товар';
      if (!productStats[productName]) {
        productStats[productName] = {
          name: productName,
          quantity: 0,
          revenue: 0
        };
      }
      productStats[productName].quantity += toNumericValue(item?.quantity, 0);
      productStats[productName].revenue += toNumericValue(item?.quantity, 0) * toNumericValue(item?.price, 0);
    }
  }

  return Object.values(productStats)
    .sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    })
    .slice(0, limit);
};
const buildTopCustomersAnalytics = (orders = [], limit = 10) => {
  const customerStats = new Map();

  for (const order of orders || []) {
    const customerName = String(order?.customer_name || '').trim() || 'Клиент';
    const customerPhone = String(order?.customer_phone || '').trim();
    const key = `${customerName.toLowerCase()}::${customerPhone.toLowerCase()}`;
    if (!customerStats.has(key)) {
      customerStats.set(key, {
        name: customerName,
        phone: customerPhone || '—',
        ordersCount: 0,
        totalAmount: 0
      });
    }
    const entry = customerStats.get(key);
    entry.ordersCount += 1;
    entry.totalAmount += toNumericValue(order?.total_amount, 0);
  }

  return Array.from(customerStats.values())
    .sort((a, b) => {
      if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
      return b.totalAmount - a.totalAmount;
    })
    .slice(0, limit);
};
const buildOrderLocationsAnalytics = (orders = []) => (
  (orders || [])
    .filter((order) => order?.delivery_coordinates)
    .map((order) => {
      const [lat, lng] = String(order.delivery_coordinates || '')
        .split(',')
        .map((value) => Number.parseFloat(value.trim()));
      return {
        lat,
        lng,
        orderId: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name || 'Клиент',
        customerPhone: order.customer_phone || '—',
        totalAmount: toNumericValue(order.total_amount, 0),
        status: order.status,
        deliveryAddress: order.delivery_address || '',
        createdAt: order.created_at
      };
    })
    .filter((location) => !Number.isNaN(location.lat) && !Number.isNaN(location.lng))
);
const getDefaultPaymentPlaceholder = () => ({
  enabled: false,
  merchant_id: '',
  api_login: '',
  api_password: '',
  callback_timeout_ms: 2000,
  test_mode: false
});
const normalizePaymentPlaceholders = (value) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }
  if (!source || typeof source !== 'object') source = {};

  const normalized = {};
  for (const system of PAYMENT_PLACEHOLDER_SYSTEMS) {
    const raw = source[system] && typeof source[system] === 'object' ? source[system] : {};
    normalized[system] = {
      ...getDefaultPaymentPlaceholder(),
      ...raw,
      enabled: raw.enabled === true || raw.enabled === 'true',
      test_mode: raw.test_mode === true || raw.test_mode === 'true',
      callback_timeout_ms: Number.isFinite(Number(raw.callback_timeout_ms))
        ? Number(raw.callback_timeout_ms)
        : 2000
    };
  }
  return normalized;
};
const normalizeSettingsBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
};
const normalizeSettingsNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const MENU_GLASS_OPACITY_MIN = 20;
const MENU_GLASS_OPACITY_MAX = 60;
const MENU_GLASS_OPACITY_DEFAULT = 34;
const normalizeMenuGlassOpacity = (value, fallback = MENU_GLASS_OPACITY_DEFAULT) => {
  const fallbackValue = Number.isFinite(Number(fallback))
    ? Math.round(Number(fallback))
    : MENU_GLASS_OPACITY_DEFAULT;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(MENU_GLASS_OPACITY_MIN, Math.min(MENU_GLASS_OPACITY_MAX, fallbackValue));
  }
  return Math.max(MENU_GLASS_OPACITY_MIN, Math.min(MENU_GLASS_OPACITY_MAX, Math.round(parsed)));
};
const MENU_GLASS_BLUR_MIN = 8;
const MENU_GLASS_BLUR_MAX = 24;
const MENU_GLASS_BLUR_DEFAULT = 16;
const normalizeMenuGlassBlur = (value, fallback = MENU_GLASS_BLUR_DEFAULT) => {
  const fallbackValue = Number.isFinite(Number(fallback))
    ? Math.round(Number(fallback))
    : MENU_GLASS_BLUR_DEFAULT;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(MENU_GLASS_BLUR_MIN, Math.min(MENU_GLASS_BLUR_MAX, fallbackValue));
  }
  return Math.max(MENU_GLASS_BLUR_MIN, Math.min(MENU_GLASS_BLUR_MAX, Math.round(parsed)));
};
const parseNumberInputWithGrouping = (value) => {
  const raw = String(value ?? '');
  if (!raw.trim()) return '';
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/[^\d.,-]/g, '')
    .replace(',', '.');
  if (!normalized || normalized === '.' || normalized === '-') return '';
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? String(parsed) : '';
};
const formatNumberInputWithGrouping = (value, maximumFractionDigits = 2) => {
  if (value === undefined || value === null || value === '') return '';
  const parsed = normalizeSettingsNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) return String(value || '');
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(parsed);
};
const normalizeSettingsText = (value) => String(value || '').trim();
const sortObjectKeysDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeysDeep(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeysDeep(value[key]);
      return acc;
    }, {});
  }
  return value;
};
const buildRestaurantSettingsSignature = (settings) => {
  if (!settings || typeof settings !== 'object') return '';

  const placeholders = normalizePaymentPlaceholders(settings.payment_placeholders);
  const normalizedPlaceholders = PAYMENT_PLACEHOLDER_SYSTEMS.reduce((acc, key) => {
    const item = placeholders[key] || getDefaultPaymentPlaceholder();
    acc[key] = {
      enabled: normalizeSettingsBoolean(item.enabled, false),
      merchant_id: normalizeSettingsText(item.merchant_id),
      api_login: normalizeSettingsText(item.api_login),
      api_password: normalizeSettingsText(item.api_password),
      callback_timeout_ms: Math.max(0, Math.trunc(normalizeSettingsNumber(item.callback_timeout_ms, 2000))),
      test_mode: normalizeSettingsBoolean(item.test_mode, false)
    };
    return acc;
  }, {});

  return JSON.stringify({
    name: normalizeSettingsText(settings.name),
    address: normalizeSettingsText(settings.address),
    phone: normalizeSettingsText(settings.phone),
    logo_url: normalizeSettingsText(settings.logo_url),
    logo_display_mode: String(settings.logo_display_mode || '').trim().toLowerCase() === 'horizontal'
      ? 'horizontal'
      : 'square',
    ui_theme: normalizeUiTheme(settings.ui_theme, 'classic'),
    ui_font_family: normalizeUiFontFamily(settings.ui_font_family, 'sans'),
    menu_view_mode: normalizeMenuViewMode(settings.menu_view_mode, 'grid_categories'),
    catalog_card_mode: normalizeCatalogCardMode(settings.catalog_card_mode, 'wide'),
    menu_liquid_glass_enabled: normalizeSettingsBoolean(settings.menu_liquid_glass_enabled, false),
    menu_height_lock_enabled: normalizeSettingsBoolean(settings.menu_height_lock_enabled, false),
    menu_liquid_glass_opacity: normalizeMenuGlassOpacity(
      settings.menu_liquid_glass_opacity,
      MENU_GLASS_OPACITY_DEFAULT
    ),
    menu_liquid_glass_blur: normalizeMenuGlassBlur(
      settings.menu_liquid_glass_blur,
      MENU_GLASS_BLUR_DEFAULT
    ),
    currency_code: String(settings.currency_code || 'uz').trim().toLowerCase() || 'uz',
    telegram_bot_token: normalizeSettingsText(settings.telegram_bot_token),
    telegram_group_id: normalizeSettingsText(settings.telegram_group_id),
    operator_registration_code: normalizeSettingsText(settings.operator_registration_code),
    support_username: normalizeSettingsText(settings.support_username),
    start_time: normalizeSettingsText(settings.start_time),
    end_time: normalizeSettingsText(settings.end_time),
    click_url: normalizeSettingsText(settings.click_url),
    payme_url: normalizeSettingsText(settings.payme_url),
    uzum_url: normalizeSettingsText(settings.uzum_url),
    xazna_url: normalizeSettingsText(settings.xazna_url),
    cash_enabled: normalizeSettingsBoolean(settings.cash_enabled, true),
    card_payment_title: normalizeSettingsText(settings.card_payment_title),
    card_payment_number: normalizeSettingsText(settings.card_payment_number),
    card_payment_holder: normalizeSettingsText(settings.card_payment_holder),
    card_receipt_target: String(settings.card_receipt_target || '').trim().toLowerCase() === 'admin' ? 'admin' : 'bot',
    payme_enabled: normalizeSettingsBoolean(settings.payme_enabled, false),
    payme_merchant_id: normalizeSettingsText(settings.payme_merchant_id),
    payme_api_login: normalizeSettingsText(settings.payme_api_login),
    payme_api_password: normalizeSettingsText(settings.payme_api_password),
    payme_account_key: normalizeSettingsText(settings.payme_account_key) || 'order_id',
    payme_test_mode: normalizeSettingsBoolean(settings.payme_test_mode, false),
    payme_callback_timeout_ms: Math.max(0, Math.trunc(normalizeSettingsNumber(settings.payme_callback_timeout_ms, 2000))),
    latitude: normalizeSettingsNumber(settings.latitude, 0),
    longitude: normalizeSettingsNumber(settings.longitude, 0),
    delivery_base_radius: normalizeSettingsNumber(settings.delivery_base_radius, 0),
    delivery_base_price: normalizeSettingsNumber(settings.delivery_base_price, 0),
    delivery_price_per_km: normalizeSettingsNumber(settings.delivery_price_per_km, 0),
    delivery_pricing_mode: normalizeDeliveryPricingMode(settings.delivery_pricing_mode, 'dynamic'),
    delivery_fixed_price: normalizeSettingsNumber(settings.delivery_fixed_price, 0),
    is_delivery_enabled: normalizeSettingsBoolean(settings.is_delivery_enabled, true),
    delivery_zone: sortObjectKeysDeep(settings.delivery_zone || null),
    minimum_order_amount: normalizeSettingsNumber(settings.minimum_order_amount, 0),
    inventory_tracking_enabled: normalizeSettingsBoolean(settings.inventory_tracking_enabled, false),
    inventory_min_threshold: normalizeSettingsNumber(settings.inventory_min_threshold, 0),
    is_scheduled_date_delivery_enabled: normalizeSettingsBoolean(settings.is_scheduled_date_delivery_enabled, false),
    scheduled_delivery_max_days: Math.max(1, Math.trunc(normalizeSettingsNumber(settings.scheduled_delivery_max_days, 7))),
    is_asap_delivery_enabled: normalizeSettingsBoolean(settings.is_asap_delivery_enabled, true),
    is_scheduled_time_delivery_enabled: normalizeSettingsBoolean(settings.is_scheduled_time_delivery_enabled, true),
    is_operator_delivery_later_enabled: normalizeSettingsBoolean(settings.is_operator_delivery_later_enabled, false),
    send_balance_after_confirm: normalizeSettingsBoolean(settings.send_balance_after_confirm, false),
    send_daily_close_report: normalizeSettingsBoolean(settings.send_daily_close_report, false),
    msg_new: normalizeSettingsText(settings.msg_new),
    msg_preparing: normalizeSettingsText(settings.msg_preparing),
    msg_delivering: normalizeSettingsText(settings.msg_delivering),
    msg_delivered: normalizeSettingsText(settings.msg_delivered),
    msg_cancelled: normalizeSettingsText(settings.msg_cancelled),
    payment_placeholders: normalizedPlaceholders
  });
};
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

const normalizeYouTubeEmbedUrl = (value) => {
  const videoId = extractYouTubeVideoId(value);
  if (!videoId) return '';

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1'
  });

  if (typeof window !== 'undefined' && window.location?.origin) {
    params.set('origin', window.location.origin);
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
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
const toNumericValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeProductPriceValue = (value, fallback = NaN) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};
const sanitizeProductPriceInputValue = (value) => {
  const raw = String(value ?? '').replace(/\s+/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!raw) return '';
  const endsWithDot = raw.endsWith('.');
  const [rawInteger = '', ...rawFractionParts] = raw.split('.');
  const integerPart = (rawInteger.replace(/^0+(?=\d)/, '') || '0').slice(0, 14);
  const fractionPart = rawFractionParts.join('').replace(/\./g, '').slice(0, 2);
  if (rawFractionParts.length > 0 || endsWithDot) {
    return fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : `${integerPart}.`;
  }
  return integerPart;
};
const sanitizeProductStockInputValue = (value) => {
  const raw = String(value ?? '').replace(/\s+/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!raw) return '';
  const endsWithDot = raw.endsWith('.');
  const [rawInteger = '', ...rawFractionParts] = raw.split('.');
  const integerPart = (rawInteger.replace(/^0+(?=\d)/, '') || '0').slice(0, 14);
  const fractionPart = rawFractionParts.join('').replace(/\./g, '').slice(0, 3);
  if (rawFractionParts.length > 0 || endsWithDot) {
    return fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : `${integerPart}.`;
  }
  return integerPart;
};
const formatProductPriceInputValue = (value) => {
  const normalized = sanitizeProductPriceInputValue(value);
  if (!normalized) return '';
  const hasDot = normalized.includes('.');
  const endsWithDot = normalized.endsWith('.');
  const [integerPartRaw = '', fractionPart = ''] = normalized.split('.');
  const integerPart = integerPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (!hasDot) return integerPart;
  if (endsWithDot) return `${integerPart}.`;
  return `${integerPart}.${fractionPart}`;
};
const isPickupOrderForAnalytics = (order) => {
  const fulfillmentType = String(order?.fulfillment_type || '').trim().toLowerCase();
  if (fulfillmentType === 'pickup') return true;
  return String(order?.delivery_address || '').trim().toLowerCase() === 'самовывоз';
};
const resolveContainerTotalsFromItems = (items = [], productsById = null) => {
  let total = 0;

  for (const item of items || []) {
    const quantity = toNumericValue(item?.quantity, 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    let containerPrice = toNumericValue(item?.container_price, NaN);
    let containerNorm = toNumericValue(item?.container_norm, NaN);

    const productId = Number.parseInt(item?.product_id, 10);
    if ((!Number.isFinite(containerPrice) || !Number.isFinite(containerNorm)) && Number.isFinite(productId) && productsById?.has(productId)) {
      const productMeta = productsById.get(productId);
      containerPrice = Number.isFinite(containerPrice) ? containerPrice : toNumericValue(productMeta?.container_price, 0);
      containerNorm = Number.isFinite(containerNorm) ? containerNorm : Math.max(1, toNumericValue(productMeta?.container_norm, 1));
    }

    if (!Number.isFinite(containerPrice) || containerPrice <= 0) continue;
    const norm = Math.max(1, Number.isFinite(containerNorm) ? containerNorm : 1);
    total += Math.ceil(quantity / norm) * containerPrice;
  }

  return total;
};
const calculateOrderCostBreakdown = (order, items = [], productsById = null, options = {}) => {
  const useOrderTotal = options.useOrderTotal !== false;
  const itemsSubtotal = (items || []).reduce((sum, item) => (
    sum + (toNumericValue(item?.quantity, 0) * toNumericValue(item?.price, 0))
  ), 0);

  const serviceFee = Math.max(0, toNumericValue(order?.service_fee, 0));
  const deliveryCost = Math.max(0, toNumericValue(order?.delivery_cost, 0));
  const deliveryDistanceKm = Math.max(0, toNumericValue(order?.delivery_distance_km, 0));
  let containersTotal = Math.max(0, resolveContainerTotalsFromItems(items, productsById));

  const orderTotalRaw = toNumericValue(order?.total_amount, NaN);
  if (useOrderTotal && Number.isFinite(orderTotalRaw)) {
    const fallbackContainers = orderTotalRaw - itemsSubtotal - serviceFee - deliveryCost;
    if (containersTotal <= 0 && fallbackContainers > 0) {
      containersTotal = fallbackContainers;
    }
  }

  const calculatedTotal = itemsSubtotal + containersTotal + serviceFee + deliveryCost;
  const total = (useOrderTotal && Number.isFinite(orderTotalRaw))
    ? orderTotalRaw
    : calculatedTotal;

  return {
    itemsSubtotal,
    containersTotal,
    serviceFee,
    deliveryCost,
    deliveryDistanceKm,
    total
  };
};
const calculateOrdersFinancialBreakdown = (orders = []) => (
  (orders || []).reduce((totals, order) => {
    const breakdown = calculateOrderCostBreakdown(order, Array.isArray(order?.items) ? order.items : [], null);
    totals.items += breakdown.itemsSubtotal;
    totals.delivery += breakdown.deliveryCost;
    totals.service += breakdown.serviceFee;
    totals.containers += breakdown.containersTotal;
    return totals;
  }, {
    items: 0,
    delivery: 0,
    service: 0,
    containers: 0
  })
);
const normalizeOrderActionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return normalized === 'in_progress' ? 'preparing' : normalized;
};
const normalizeOrderStatusForAnalytics = (value) => (
  value === 'in_progress' ? 'preparing' : value
);
const ORDER_STATUS_ACTION_LABELS = {
  accepted: '✅ Принят',
  preparing: '👨‍🍳 Готовится',
  delivering: '🚚 Доставляется',
  delivered: '✅ Доставлен',
  cancelled: '❌ Отменён'
};
const extractActorNameFromActionComment = (comment) => {
  const text = String(comment || '').trim();
  if (!text) return '';
  const patterns = [
    /из telegram-группы:\s*(.+)$/i,
    /принято в telegram-группе:\s*(.+)$/i,
    /подтверждено:\s*(.+)$/i,
    /из админки:\s*(.+)$/i,
    /принято в админке:\s*(.+)$/i,
    /отказано:\s*.*\((.+)\)\s*$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
};
const normalizeStatusActions = (value) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  return source
    .map((rawAction, index) => {
      const status = normalizeOrderActionStatus(rawAction?.status);
      if (!ORDER_STATUS_ACTION_LABELS[status]) return null;
      const createdAt = rawAction?.created_at || null;
      const actorName =
        String(rawAction?.actor_name || '').trim() ||
        extractActorNameFromActionComment(rawAction?.comment) ||
        'Неизвестно';
      return {
        id: rawAction?.id || null,
        status,
        actor_name: actorName,
        comment: rawAction?.comment || '',
        created_at: createdAt,
        _sortIndex: index,
        _sortTimestamp: createdAt ? new Date(createdAt).getTime() : 0
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      (left._sortTimestamp - right._sortTimestamp) ||
      (left._sortIndex - right._sortIndex)
    ))
    .map(({ _sortIndex, _sortTimestamp, ...action }) => action);
};
const hasOrderAcceptedActionForAnalytics = (order) => {
  const actions = Array.isArray(order?.status_actions)
    ? order.status_actions
    : normalizeStatusActions(order?.status_actions);
  return actions.some((action) => normalizeOrderActionStatus(action?.status) === 'accepted');
};
const getOrderStatusActionLabel = (status) => ORDER_STATUS_ACTION_LABELS[normalizeOrderActionStatus(status)] || status || '—';
const formatOrderStatusActionTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
};
const getAnalyticsLocationKey = (location) => String(location?.orderId ?? location?.orderNumber ?? '');
const getAnalyticsPointIcon = (isActive = false) => L.divIcon({
  className: `analytics-map-point${isActive ? ' is-active' : ''}`,
  html: `<span class="analytics-map-point-badge"><span class="analytics-map-point-emoji">🙋🏻</span></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});
const getAnalyticsShopIcon = () => L.divIcon({
  className: 'analytics-map-shop-point',
  html: `<span class="analytics-map-shop-badge"><span class="analytics-map-shop-emoji">🏪</span></span>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const AnalyticsMapAutoBounds = ({ points }) => {
  const map = useMap();
  const wasFittedRef = useRef(false);
  const idleResetTimeoutRef = useRef(null);
  const isUserActiveRef = useRef(false);
  const pointsSignatureRef = useRef('');

  const clearIdleTimeout = useCallback(() => {
    if (idleResetTimeoutRef.current) {
      clearTimeout(idleResetTimeoutRef.current);
      idleResetTimeoutRef.current = null;
    }
  }, []);

  const scheduleIdleReset = useCallback(() => {
    clearIdleTimeout();
    idleResetTimeoutRef.current = setTimeout(() => {
      isUserActiveRef.current = false;
      map.flyTo(ANALYTICS_DEFAULT_MAP_CENTER, ANALYTICS_DEFAULT_MAP_ZOOM, { duration: 0.5 });
    }, ANALYTICS_MAP_IDLE_RESET_MS);
  }, [clearIdleTimeout, map]);

  const markMapInteraction = useCallback(() => {
    isUserActiveRef.current = true;
    scheduleIdleReset();
  }, [scheduleIdleReset]);

  useMapEvents({
    movestart: markMapInteraction,
    zoomstart: markMapInteraction,
    dragstart: markMapInteraction,
    click: markMapInteraction,
    touchstart: markMapInteraction
  });

  useEffect(() => {
    scheduleIdleReset();
    return () => {
      clearIdleTimeout();
    };
  }, [scheduleIdleReset, clearIdleTimeout]);

  useEffect(() => {
    if (!map) return;

    if (isUserActiveRef.current) return;

    const signature = Array.isArray(points)
      ? points.map((point) => `${point.lat}:${point.lng}`).join('|')
      : '';

    if (signature !== pointsSignatureRef.current) {
      pointsSignatureRef.current = signature;
      wasFittedRef.current = false;
    }

    if (!Array.isArray(points) || points.length === 0) {
      map.setView(ANALYTICS_DEFAULT_MAP_CENTER, ANALYTICS_DEFAULT_MAP_ZOOM);
      return;
    }

    if (wasFittedRef.current) return;

    const validPoints = points.filter(p => p && typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng));
    if (validPoints.length === 0) return;

    const bounds = L.latLngBounds(validPoints.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    wasFittedRef.current = true;
  }, [map, points]);

  return null;
};

const AnalyticsMapFocus = ({ selectedPoint }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedPoint) return;
    if (typeof selectedPoint.lat !== 'number' || isNaN(selectedPoint.lat) || typeof selectedPoint.lng !== 'number' || isNaN(selectedPoint.lng)) return;
    map.flyTo([selectedPoint.lat, selectedPoint.lng], Math.max(map.getZoom(), 14), { duration: 0.45 });
  }, [map, selectedPoint]);

  return null;
};
const AnalyticsMapResizeFix = () => {
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
const toAbsoluteFileUrl = (value) => {
  if (!value) return '';
  if (/^(https?:\/\/|data:|blob:)/i.test(value)) return value;
  const base = API_URL.replace(/\/api$/, '');
  const normalized = String(value).startsWith('/') ? String(value) : `/${value}`;
  return `${base}${normalized}`;
};
const normalizeProductImageItems = (value) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  const normalized = [];
  for (const entry of source) {
    let imageUrl = '';
    let thumbUrl = '';

    if (typeof entry === 'string') {
      imageUrl = entry.trim();
    } else if (entry && typeof entry === 'object') {
      imageUrl = String(entry.url || entry.image_url || '').trim();
      thumbUrl = String(entry.thumb_url || entry.thumbUrl || '').trim();
    }

    if (!imageUrl) continue;
    normalized.push({
      url: imageUrl,
      thumb_url: thumbUrl
    });
    if (normalized.length >= PRODUCT_IMAGE_SLOTS_COUNT) break;
  }

  return normalized;
};
const normalizeProductSizeOptions = (value) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = [];
    }
  }
  return Array.isArray(source) ? source : [];
};
const normalizeVariantName = (value) => {
  const normalized = String(value || '').trim().slice(0, 120);
  return normalized || null;
};
const normalizeStockVariantKey = (value) => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
);
const resolveOrderItemImageUrl = (item) => {
  const selectedVariant = normalizeVariantName(item?.selected_variant);
  const sizeOptions = normalizeProductSizeOptions(item?.size_options);
  const matchedVariant = sizeOptions.find((option) => normalizeVariantName(option?.name) === selectedVariant);
  const variantImages = normalizeProductImageItems(matchedVariant?.product_images);
  const productImages = normalizeProductImageItems(item?.product_images);
  const bestImage = (
    variantImages.find((entry) => entry.thumb_url)?.thumb_url
    || String(matchedVariant?.thumb_url || matchedVariant?.thumbUrl || '').trim()
    || variantImages[0]?.url
    || String(matchedVariant?.image_url || matchedVariant?.imageUrl || '').trim()
    || String(item?.thumb_url || item?.thumbUrl || '').trim()
    || productImages.find((entry) => entry.thumb_url)?.thumb_url
    || productImages[0]?.url
    || String(item?.image_url || item?.imageUrl || '').trim()
  );
  return bestImage ? toAbsoluteFileUrl(bestImage) : '';
};
const createProductImageSlots = (value, fallbackImageUrl = '', fallbackThumbUrl = '') => {
  const slots = Array.from({ length: PRODUCT_IMAGE_SLOTS_COUNT }, () => ({ url: '', thumb_url: '' }));
  const normalized = normalizeProductImageItems(value);
  if (!normalized.length && String(fallbackImageUrl || '').trim()) {
    normalized.push({
      url: String(fallbackImageUrl).trim(),
      thumb_url: String(fallbackThumbUrl || '').trim()
    });
  }
  normalized.slice(0, PRODUCT_IMAGE_SLOTS_COUNT).forEach((item, index) => {
    slots[index] = {
      url: item.url,
      thumb_url: item.thumb_url || ''
    };
  });
  return slots;
};
const serializeProductImageSlots = (slots) => normalizeProductImageItems(slots).slice(0, PRODUCT_IMAGE_SLOTS_COUNT);
const clampProductVisibleSlotsCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(PRODUCT_IMAGE_SLOTS_COUNT, Math.max(1, parsed));
};
const resolveProductVisibleSlotsCount = (slots) => {
  const lastFilledSlotIndex = (Array.isArray(slots) ? slots : []).reduce((maxIndex, slot, slotIndex) => (
    String(slot?.url || '').trim() ? slotIndex : maxIndex
  ), -1);
  return clampProductVisibleSlotsCount(lastFilledSlotIndex + 1);
};
const createVariantImageSlots = (value, fallbackImageUrl = '', fallbackThumbUrl = '') => (
  createProductImageSlots(value, fallbackImageUrl, fallbackThumbUrl).slice(0, VARIANT_IMAGE_SLOTS_COUNT)
);
const serializeVariantImageSlots = (slots) => normalizeProductImageItems(slots).slice(0, VARIANT_IMAGE_SLOTS_COUNT);
const clampVariantVisibleSlotsCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(VARIANT_IMAGE_SLOTS_COUNT, Math.max(1, parsed));
};
const resolveVariantVisibleSlotsCount = (variant) => {
  const explicitValue = variant?.__slots_count ?? variant?.__slot_count;
  if (explicitValue !== undefined && explicitValue !== null && String(explicitValue).trim() !== '') {
    return clampVariantVisibleSlotsCount(explicitValue);
  }
  const slots = createVariantImageSlots(variant?.product_images, variant?.image_url, variant?.thumb_url);
  const lastFilledSlotIndex = slots.reduce((maxIndex, slot, slotIndex) => (
    String(slot?.url || '').trim() ? slotIndex : maxIndex
  ), -1);
  return clampVariantVisibleSlotsCount(lastFilledSlotIndex + 1);
};
const normalizeProductVariantContainerNormValue = (value, fallback = 1) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const normalizeProductVariantOrderStepValue = (value, unit = 'шт', fallback = '') => {
  if (String(unit || '').trim() !== 'кг') return '';
  const normalized = String(value ?? '').trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};
const normalizeVariantBooleanValue = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const normalizeProductVariantStockQuantityValue = (value, fallback = '') => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round((parsed + Number.EPSILON) * 1000) / 1000;
};
const normalizeProductVariantOptions = (
  value,
  {
    fallbackPrice = NaN,
    fallbackIkpu = '',
    fallbackContainerId = '',
    fallbackContainerNorm = 1,
    fallbackOrderStep = '',
    unit = 'шт',
    inventoryTrackingEnabled = false,
    inventoryThreshold = 0
  } = {}
) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = source
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(source)) return [];

  const unique = new Set();
  const normalized = [];
  for (const item of source) {
    let name = '';
    let descriptionRu = '';
    let descriptionUz = '';
    let priceRaw = fallbackPrice;
    let barcode = '';
    let imageUrl = '';
    let thumbUrl = '';
    let variantImages = [];
    let ikpu = '';
    let containerId = '';
    let containerNormRaw = '';
    let orderStepRaw = '';
    let discountEnabledRaw = false;
    let discountPriceRaw = '';
    let stockQuantityRaw = '';
    let inStockRaw = true;

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      name = String(item.name || item.value || item.label || '').trim();
      descriptionRu = String(item.description_ru || item.descriptionRu || '').trim();
      descriptionUz = String(item.description_uz || item.descriptionUz || '').trim();
      priceRaw = item.price ?? fallbackPrice;
      barcode = String(item.barcode || '').trim();
      ikpu = String(item.ikpu || '').trim();
      containerId = String(item.container_id ?? item.containerId ?? '').trim();
      containerNormRaw = item.container_norm ?? item.containerNorm;
      orderStepRaw = item.order_step ?? item.orderStep;
      discountEnabledRaw = item.discount_enabled ?? item.discountEnabled ?? false;
      discountPriceRaw = item.discount_price ?? item.discountPrice ?? '';
      stockQuantityRaw = item.stock_quantity ?? item.stockQuantity ?? '';
      inStockRaw = item.in_stock ?? item.inStock ?? true;
      variantImages = serializeVariantImageSlots(
        createVariantImageSlots(item.product_images, item.image_url, item.thumb_url)
      );
      const mainVariantImage = variantImages[0] || { url: '', thumb_url: '' };
      imageUrl = String(mainVariantImage.url || '').trim();
      thumbUrl = String(mainVariantImage.thumb_url || '').trim();
    } else {
      name = String(item ?? '').trim();
    }

    if (!name) continue;
    const key = name.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    const normalizedPrice = normalizeProductPriceValue(priceRaw, NaN);
    const normalizedContainerId = (containerId || String(fallbackContainerId || '').trim()).slice(0, 64);
    const fallbackContainerNormValue = normalizeProductVariantContainerNormValue(fallbackContainerNorm, 1);
    const normalizedContainerNorm = normalizedContainerId
      ? normalizeProductVariantContainerNormValue(
        (containerNormRaw !== undefined && containerNormRaw !== null && String(containerNormRaw).trim() !== '')
          ? containerNormRaw
          : fallbackContainerNormValue,
        fallbackContainerNormValue
      )
      : 1;
    const fallbackOrderStepValue = normalizeProductVariantOrderStepValue(fallbackOrderStep, unit, '');
    const normalizedOrderStep = normalizeProductVariantOrderStepValue(
      (orderStepRaw !== undefined && orderStepRaw !== null && String(orderStepRaw).trim() !== '')
        ? orderStepRaw
        : fallbackOrderStepValue,
      unit,
      ''
    );
    const normalizedDiscountEnabledCandidate = normalizeVariantBooleanValue(discountEnabledRaw, false) === true;
    const normalizedDiscountPrice = normalizeProductPriceValue(discountPriceRaw, NaN);
    const hasValidVariantDiscount = normalizedDiscountEnabledCandidate
      && Number.isFinite(normalizedPrice)
      && normalizedPrice > 0
      && Number.isFinite(normalizedDiscountPrice)
      && normalizedDiscountPrice > 0
      && normalizedDiscountPrice < normalizedPrice;
    const normalizedStockQuantity = normalizeProductVariantStockQuantityValue(stockQuantityRaw, '');
    const normalizedManualInStock = normalizeVariantBooleanValue(inStockRaw, true);
    const normalizedInStock = inventoryTrackingEnabled
      ? (Number.isFinite(Number(normalizedStockQuantity))
        ? Number(normalizedStockQuantity) > Number(inventoryThreshold || 0)
        : false)
      : (normalizedManualInStock !== false);
    normalized.push({
      name,
      description_ru: descriptionRu.slice(0, 1500),
      description_uz: descriptionUz.slice(0, 1500),
      price: Number.isFinite(normalizedPrice) ? normalizedPrice : '',
      discount_enabled: hasValidVariantDiscount,
      discount_price: hasValidVariantDiscount ? normalizedDiscountPrice : '',
      stock_quantity: normalizedStockQuantity === '' ? '' : Number(normalizedStockQuantity),
      in_stock: normalizedInStock,
      barcode: barcode.slice(0, 120),
      ikpu: (ikpu || String(fallbackIkpu || '').trim()).slice(0, 64),
      container_id: normalizedContainerId,
      container_norm: normalizedContainerNorm,
      order_step: normalizedOrderStep,
      image_url: imageUrl,
      thumb_url: thumbUrl,
      product_images: variantImages
    });
    if (normalized.length >= MAX_PRODUCT_SIZE_OPTIONS) break;
  }
  return normalized;
};
const createProductVariantDraft = (name, fallbackPrice = NaN, isDraft = false, defaults = {}) => {
  const normalizedName = String(name || '').trim();
  const normalizedPrice = normalizeProductPriceValue(fallbackPrice, NaN);
  const normalizedContainerId = String(defaults.container_id || '').trim().slice(0, 64);
  const normalizedContainerNorm = normalizedContainerId
    ? normalizeProductVariantContainerNormValue(defaults.container_norm, 1)
    : 1;
  const normalizedDiscountPrice = normalizeProductPriceValue(defaults.discount_price, NaN);
  const normalizedDiscountEnabled = normalizeVariantBooleanValue(defaults.discount_enabled, false) === true
    && Number.isFinite(normalizedPrice)
    && Number.isFinite(normalizedDiscountPrice)
    && normalizedDiscountPrice > 0
    && normalizedDiscountPrice < normalizedPrice;
  const normalizedStockQuantity = normalizeProductVariantStockQuantityValue(defaults.stock_quantity, '');
  return {
    __key: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizedName,
    description_ru: '',
    description_uz: '',
    price: Number.isFinite(normalizedPrice) ? normalizedPrice : '',
    discount_enabled: normalizedDiscountEnabled,
    discount_price: normalizedDiscountEnabled ? normalizedDiscountPrice : '',
    stock_quantity: normalizedStockQuantity === '' ? '' : Number(normalizedStockQuantity),
    in_stock: normalizeVariantBooleanValue(defaults.in_stock, true) !== false,
    barcode: '',
    ikpu: String(defaults.ikpu || '').trim().slice(0, 64),
    container_id: normalizedContainerId,
    container_norm: normalizedContainerNorm,
    order_step: normalizeProductVariantOrderStepValue(defaults.order_step, defaults.unit || 'шт', ''),
    image_url: '',
    thumb_url: '',
    product_images: [],
    __slots_count: 1,
    __draft: isDraft || !normalizedName
  };
};

const normalizeProductVariantOptionsForEditor = (value, { fallbackPrice = NaN, unit = 'шт' } = {}) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  const unique = new Set();
  const normalized = [];
  for (const item of source) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rawName = String(item.name || item.value || item.label || '').slice(0, 60);
    const name = rawName;
    const normalizedName = rawName.trim();
    const descriptionRu = String(item.description_ru || item.descriptionRu || '').slice(0, 1500);
    const descriptionUz = String(item.description_uz || item.descriptionUz || '').slice(0, 1500);
    const priceRaw = item.price ?? fallbackPrice;
    const barcode = String(item.barcode || '').slice(0, 120);
    const ikpu = String(item.ikpu || '').slice(0, 64);
    const containerId = String(item.container_id ?? item.containerId ?? '').trim().slice(0, 64);
    const containerNorm = containerId
      ? normalizeProductVariantContainerNormValue(item.container_norm ?? item.containerNorm, 1)
      : 1;
    const orderStep = normalizeProductVariantOrderStepValue(item.order_step ?? item.orderStep, unit, '');
    const discountEnabledRaw = item.discount_enabled ?? item.discountEnabled ?? false;
    const discountPriceRaw = item.discount_price ?? item.discountPrice ?? '';
    const stockQuantityRaw = item.stock_quantity ?? item.stockQuantity ?? '';
    const inStockRaw = item.in_stock ?? item.inStock ?? true;
    const variantImages = serializeVariantImageSlots(
      createVariantImageSlots(item.product_images, item.image_url, item.thumb_url)
    );
    const mainVariantImage = variantImages[0] || { url: '', thumb_url: '' };
    const imageUrl = String(mainVariantImage.url || '').trim();
    const thumbUrl = String(mainVariantImage.thumb_url || '').trim();
    const visibleSlotsCount = resolveVariantVisibleSlotsCount({
      ...item,
      product_images: variantImages,
      image_url: imageUrl,
      thumb_url: thumbUrl
    });
    const normalizedPrice = normalizeProductPriceValue(priceRaw, NaN);
    const normalizedDiscountEnabledCandidate = normalizeVariantBooleanValue(discountEnabledRaw, false) === true;
    const normalizedDiscountPrice = normalizeProductPriceValue(discountPriceRaw, NaN);
    const hasValidDiscount = normalizedDiscountEnabledCandidate
      && Number.isFinite(normalizedPrice)
      && Number.isFinite(normalizedDiscountPrice)
      && normalizedDiscountPrice > 0
      && normalizedDiscountPrice < normalizedPrice;
    const normalizedStockQuantity = normalizeProductVariantStockQuantityValue(stockQuantityRaw, '');
    const normalizedInStock = normalizeVariantBooleanValue(inStockRaw, true) !== false;
    const isDraft = Boolean(item.__draft) || !normalizedName;
    const explicitPriceRaw = item.price;
    const hasExplicitPrice = ![undefined, null, ''].includes(explicitPriceRaw) && Number.isFinite(normalizedPrice);
    const hasExplicitDiscount = hasValidDiscount;
    const hasExplicitStock = Number.isFinite(Number(normalizedStockQuantity)) && Number(normalizedStockQuantity) > 0;
    const hasManualOutOfStock = normalizedInStock === false;

    const hasAnyContent = Boolean(
      normalizedName
      || descriptionRu.trim()
      || descriptionUz.trim()
      || barcode.trim()
      || ikpu.trim()
      || containerId
      || orderStep
      || imageUrl
      || thumbUrl
      || visibleSlotsCount > 1
      || variantImages.some((variantImage) => String(variantImage?.url || '').trim())
      || hasExplicitPrice
      || hasExplicitDiscount
      || hasExplicitStock
      || hasManualOutOfStock
    );
    if (!hasAnyContent && !isDraft) continue;

    if (normalizedName) {
      const key = normalizedName.toLowerCase();
      if (unique.has(key)) continue;
      unique.add(key);
    }

    normalized.push({
      __key: String(item.__key || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      name,
      description_ru: descriptionRu,
      description_uz: descriptionUz,
      price: Number.isFinite(normalizedPrice) ? normalizedPrice : '',
      discount_enabled: hasValidDiscount,
      discount_price: hasValidDiscount ? normalizedDiscountPrice : '',
      stock_quantity: normalizedStockQuantity === '' ? '' : Number(normalizedStockQuantity),
      in_stock: normalizedInStock,
      barcode,
      ikpu,
      container_id: containerId,
      container_norm: containerNorm,
      order_step: orderStep,
      image_url: imageUrl,
      thumb_url: thumbUrl,
      product_images: variantImages,
      __slots_count: visibleSlotsCount,
      __draft: isDraft
    });
    if (normalized.length >= MAX_PRODUCT_SIZE_OPTIONS) break;
  }
  return normalized;
};

const RussiaFlagIcon = () => (
  <svg viewBox="0 0 18 12" width="16" height="12" aria-hidden="true" focusable="false">
    <rect width="18" height="12" fill="#ffffff" />
    <rect y="4" width="18" height="4" fill="#2563eb" />
    <rect y="8" width="18" height="4" fill="#dc2626" />
  </svg>
);

const UzbekistanFlagIcon = () => (
  <svg viewBox="0 0 18 12" width="16" height="12" aria-hidden="true" focusable="false">
    <rect width="18" height="3.85" fill="#22c1f1" />
    <rect y="3.85" width="18" height="0.55" fill="#dc2626" />
    <rect y="4.4" width="18" height="3.2" fill="#ffffff" />
    <rect y="7.6" width="18" height="0.55" fill="#dc2626" />
    <rect y="8.15" width="18" height="3.85" fill="#16a34a" />
    <circle cx="3.05" cy="2" r="1.05" fill="#ffffff" />
    <circle cx="3.4" cy="2" r="0.8" fill="#22c1f1" />
    <circle cx="4.95" cy="1.15" r="0.18" fill="#ffffff" />
    <circle cx="5.65" cy="1.55" r="0.18" fill="#ffffff" />
    <circle cx="6.35" cy="1.15" r="0.18" fill="#ffffff" />
  </svg>
);

// SVG Icons
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </svg>
);

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ReceiptIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 16H8" />
    <path d="M14 8H8" />
    <path d="M16 12H8" />
    <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
  </svg>
);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CustomToggle = React.forwardRef(({ children, onClick, className }, ref) => (
  <div
    className={`form-select text-start text-truncate ${(className || '').replace('dropdown-toggle', '')}`}
    ref={ref}
    onClick={(e) => {
      e.preventDefault();
      onClick(e);
    }}
    style={{ cursor: 'pointer', paddingRight: '2.5rem' }}
  >
    {children}
  </div>
));

const CustomMenu = React.forwardRef(
  ({ children, style, className, 'aria-labelledby': labeledBy }, ref) => {
    const [value, setValue] = useState('');
    const { language } = useLanguage();

    return (
      <div
        ref={ref}
        style={{ ...style, width: '100%', minWidth: '300px', padding: '0.5rem 0', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)' }}
        className={className}
        aria-labelledby={labeledBy}
      >
        <div style={{ padding: '0 10px 10px 10px' }}>
          <Form.Control
            autoFocus
            className="w-100"
            placeholder={language === 'uz' ? 'Kategoriya qidirish...' : 'Поиск категории...'}
            onChange={(e) => setValue(e.target.value)}
            value={value}
          />
        </div>
        <ul className="list-unstyled mb-0" style={{ maxHeight: '250px', overflowY: 'auto' }}>
          {React.Children.toArray(children).filter(
            (child) => {
              if (child.props.children && Array.isArray(child.props.children)) {
                const text = child.props.children.join('');
                return !value || text.toLowerCase().includes(value.toLowerCase());
              }
              return !value || (child.props.children && child.props.children.toString().toLowerCase().includes(value.toLowerCase()));
            }
          )}
        </ul>
      </div>
    );
  },
);

const AdminListPagination = ({ current, total, limit, onPageChange, onLimitChange, limitOptions = [15, 20, 30, 50] }) => {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));
  if (!total) return null;

  const shownCount = Math.min(limit, Math.max(0, total - (current - 1) * limit));
  const items = [];
  const maxPages = 5;
  let startPage = Math.max(1, current - Math.floor(maxPages / 2));
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  if (endPage - startPage + 1 < maxPages) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }

  if (startPage > 1) {
    items.push(<Pagination.Item key={1} onClick={() => onPageChange(1)}>1</Pagination.Item>);
    if (startPage > 2) items.push(<Pagination.Ellipsis key="start-ellipsis" disabled />);
  }
  for (let page = startPage; page <= endPage; page += 1) {
    items.push(
      <Pagination.Item key={page} active={page === current} onClick={() => onPageChange(page)}>
        {page}
      </Pagination.Item>
    );
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) items.push(<Pagination.Ellipsis key="end-ellipsis" disabled />);
    items.push(<Pagination.Item key={totalPages} onClick={() => onPageChange(totalPages)}>{totalPages}</Pagination.Item>);
  }

  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mt-4 px-2 gap-3" style={{ width: '100%' }}>
      <div className="d-flex align-items-center gap-3">
        {onLimitChange && (
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted">{t('saShow') || 'Показать по:'}</span>
            <Form.Select
              size="sm"
              style={{ width: '75px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
              value={limit}
              onChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Form.Select>
          </div>
        )}
        <div className="small text-muted text-nowrap">
          {(t('saShown') || 'Показано')} {shownCount} {(t('saOf') || 'из')} {total} {(t('saRecords') || 'записей')}
        </div>
      </div>
      <Pagination className="mb-0">{items}</Pagination>
    </div>
  );
};

/** Заголовки столбцов Excel для массовой вставки товаров (порядок как при импорте) */
const OPERATOR_PASTE_IMPORT_TEMPLATE_HEADERS = [
  'Категория 1',
  'Категория 2',
  'Категория 3',
  'Название (RU)',
  'Название (UZ)',
  'Описание (RU)',
  'Описание (UZ)',
  'Цена',
  'Единица',
  'Штрихкод',
  'ИКПУ',
  'В наличии',
  'Сезонность',
  'Скрыть из каталога'
];

// Showcase Builder Tab Component - встроенный конструктор витрины
function ShowcaseBuilderTab() {
  return (
    <div className="admin-showcase-tab-host">
      <ShowcaseBuilder embedded />
    </div>
  );
}

function AdminDashboard() {
  const normalizeAdminOrderForUI = (order) => ({
    ...order,
    status: order.status === 'in_progress' ? 'preparing' : order.status,
    cancelled_at_status: order.cancelled_at_status === 'in_progress'
      ? 'preparing'
      : order.cancelled_at_status,
    status_actions: normalizeStatusActions(order.status_actions)
  });

  const buildOrderStatusCounts = (ordersList = []) => {
    const counts = {
      all: ordersList.length,
      new: 0,
      preparing: 0,
      delivering: 0,
      delivered: 0,
      cancelled: 0
    };

    for (const order of ordersList) {
      const normalizedStatus = order?.status === 'in_progress' ? 'preparing' : order?.status;
      if (normalizedStatus && Object.prototype.hasOwnProperty.call(counts, normalizedStatus)) {
        counts[normalizedStatus] += 1;
      }
    }

    return counts;
  };

  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [allOrdersForAnalytics, setAllOrdersForAnalytics] = useState([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLimit, setOrdersLimit] = useState(15);
  const [products, setProducts] = useState([]);
  const [productsPage, setProductsPage] = useState(1);
  const [productsLimit, setProductsLimit] = useState(15);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingGuardTriggered, setLoadingGuardTriggered] = useState(false);
  const [mainTab, setMainTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    try {
      const savedTab = String(window.localStorage.getItem(ADMIN_ACTIVE_TAB_STORAGE_KEY) || '').trim();
      return savedTab || 'dashboard';
    } catch (_) {
      return 'dashboard';
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [showAddOrderItemModal, setShowAddOrderItemModal] = useState(false);
  const [showDeliveryLaterModal, setShowDeliveryLaterModal] = useState(false);
  const [deliveryLaterDate, setDeliveryLaterDate] = useState('');
  const [savingDeliveryLater, setSavingDeliveryLater] = useState(false);
  const [orderItemSearch, setOrderItemSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('delivered');
  const [ordersViewMode, setOrdersViewMode] = useState('kanban');
  const [ordersDateFrom, setOrdersDateFrom] = useState(() => getTodayDateKey());
  const [ordersDateTo, setOrdersDateTo] = useState(() => getTodayDateKey());
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showGlobalImportModal, setShowGlobalImportModal] = useState(false);
  const [globalCatalogProducts, setGlobalCatalogProducts] = useState([]);
  const [globalCatalogLoading, setGlobalCatalogLoading] = useState(false);
  const [globalImportSaving, setGlobalImportSaving] = useState(false);
  const [globalImportSearch, setGlobalImportSearch] = useState('');
  const [globalImportBarcodeSearch, setGlobalImportBarcodeSearch] = useState('');
  const [globalImportLeftSelectedIds, setGlobalImportLeftSelectedIds] = useState([]);
  const [globalImportRightSelectedIds, setGlobalImportRightSelectedIds] = useState([]);
  const [globalImportItems, setGlobalImportItems] = useState([]);
  const [productForm, setProductForm] = useState({
    category_id: '',
    name_ru: '',
    name_uz: '',
    description_ru: '',
    description_uz: '',
    image_url: '',
    thumb_url: '',
    product_images: createProductImageSlots([]),
    price: '',
    unit: 'шт',
    sort_order: 0,
    order_step: '',
    discount_enabled: false,
    discount_price: '',
    stock_quantity: '',
    barcode: '',
    ikpu: '',
    in_stock: true,
    season_scope: 'all',
    is_hidden_catalog: false,
    size_enabled: false,
    variant_options: [],
    size_options: [],
    container_id: '',
    container_norm: 1,
    printer_id: ''
  });
  const [isProductImagesMobileLayout, setIsProductImagesMobileLayout] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 992 : false
  ));
  const [visibleProductImageSlotsCount, setVisibleProductImageSlotsCount] = useState(() => (
    (typeof window !== 'undefined' && window.innerWidth < 992) ? 1 : PRODUCT_IMAGE_SLOTS_COUNT
  ));
  const [productContainerLabelWordIndex, setProductContainerLabelWordIndex] = useState(0);
  const [isGeneratingProductLocalizedText, setIsGeneratingProductLocalizedText] = useState(false);
  const [isProductSortHintsPopupOpen, setIsProductSortHintsPopupOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingRestaurantLogo, setUploadingRestaurantLogo] = useState(false);
  const [alertMessage, setAlertMessage] = useState({ type: '', text: '' });
  const restaurantLogoInputRef = useRef(null);
  const productModalBodyRef = useRef(null);
  const pendingProductModalScrollTopRef = useRef(null);

  // Broadcast state
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ message: '', image_url: '', video_url: '' });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastImageFile, setBroadcastImageFile] = useState(null);
  const [broadcastVideoFile, setBroadcastVideoFile] = useState(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [recurrence, setRecurrence] = useState('none'); // none, daily, custom
  const [repeatDays, setRepeatDays] = useState([]); // [0,1,2,3,4,5,6]
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [broadcastModalTab, setBroadcastModalTab] = useState('send');
  const sanitizedBroadcastPreviewHtml = useMemo(() => {
    const previewSource = String(broadcastForm.message || 'Текст сообщения...');
    const normalizedMarkup = previewSource
      .replace(/<b>(.*?)<\/b>/gi, '<strong>$1</strong>')
      .replace(/<i>(.*?)<\/i>/gi, '<em>$1</em>');

    return DOMPurify.sanitize(normalizedMarkup, {
      ALLOWED_TAGS: ['strong', 'em', 'b', 'i', 'br'],
      ALLOWED_ATTR: []
    });
  }, [broadcastForm.message]);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingBroadcastId, setEditingBroadcastId] = useState(null);

  // Billing states
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceTab, setBalanceTab] = useState('data');
  const [billingInfo, setBillingInfo] = useState({ restaurant: {}, requisites: {} });
  const [billingHistory, setBillingHistory] = useState([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [showRestaurantPickerModal, setShowRestaurantPickerModal] = useState(false);
  const [restaurantSwitchSearch, setRestaurantSwitchSearch] = useState('');
  const [printers, setPrinters] = useState([]);
  const [printerAgents, setPrinterAgents] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [printerForm, setPrinterForm] = useState({
    name: '',
    printer_alias: '',
    connection_type: 'network',
    ip_address: '',
    usb_vid_pid: ''
  });
  const [showPrinterAgentModal, setShowPrinterAgentModal] = useState(false);
  const [printerAgentName, setPrinterAgentName] = useState('');
  const [downloadingPrinterAgent, setDownloadingPrinterAgent] = useState(false);
  const [testingPrinterIds, setTestingPrinterIds] = useState([]);

  // Product filters and search
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState('all');
  const [productThirdCategoryFilter, setProductThirdCategoryFilter] = useState('all');
  const [productStatusFilter, setProductStatusFilter] = useState('all');
  const [showProductsFilterPanel, setShowProductsFilterPanel] = useState(false);

  const resetProductFilters = () => {
    setProductSearch('');
    setProductCategoryFilter('all');
    setProductSubcategoryFilter('all');
    setProductThirdCategoryFilter('all');
    setProductStatusFilter('all');
  };

  const hasActiveProductFilters = (
    productSearch.trim() !== '' ||
    productCategoryFilter !== 'all' ||
    productSubcategoryFilter !== 'all' ||
    productThirdCategoryFilter !== 'all' ||
    productStatusFilter !== 'all'
  );

  // Image preview modal
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const productSortHintsRef = useRef(null);

  // Product selection for bulk operations
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productStockUpdatingIds, setProductStockUpdatingIds] = useState([]);

  // Cancel order modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  // Dashboard analytics
  const [dashboardYear, setDashboardYear] = useState(new Date().getFullYear());
  const [dashboardMonth, setDashboardMonth] = useState(new Date().getMonth() + 1);
  const [dashboardDailyDate, setDashboardDailyDate] = useState(() => getTodayDateKey());
  const [analyticsPeriod, setAnalyticsPeriod] = useState('daily');
  const [analytics, setAnalytics] = useState({
    revenue: 0,
    ordersCount: 0,
    averageCheck: 0,
    deliveryOrdersCount: 0,
    pickupOrdersCount: 0,
    itemsRevenue: 0,
    deliveryRevenue: 0,
    serviceRevenue: 0,
    containersRevenue: 0,
    topProducts: [],
    topCustomers: [],
    orderLocations: []
  });
  const [analyticsProductReviews, setAnalyticsProductReviews] = useState(() => createEmptyProductReviewAnalytics());
  const [loadingAnalyticsProductReviews, setLoadingAnalyticsProductReviews] = useState(false);
  const [showAnalyticsMapModal, setShowAnalyticsMapModal] = useState(false);
  const [leafletMapProvider, setLeafletMapProvider] = useState(() => getSavedMapProvider());
  const [selectedAnalyticsLocation, setSelectedAnalyticsLocation] = useState(null);
  const [analyticsMapSelectionLocked, setAnalyticsMapSelectionLocked] = useState(false);
  const analyticsListItemRefs = useRef(new Map());
  const analyticsFullscreenListItemRefs = useRef(new Map());

  // Yearly analytics
  const [yearlyAnalytics, setYearlyAnalytics] = useState({
    year: new Date().getFullYear(),
    monthlyData: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, orders_count: 0, revenue: 0 })),
    totalRevenue: 0,
    totalOrders: 0,
    averageCheck: 0,
    topProductsByMonth: Array.from({ length: 12 }, () => [])
  });
  const [loadingYearlyAnalytics, setLoadingYearlyAnalytics] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState({ new_count: 0 });
  const [feedbackFilter, setFeedbackFilter] = useState({ status: '', type: '' });
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackResponse, setFeedbackResponse] = useState('');

  // Containers (посуда)
  const [containers, setContainers] = useState([]);
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [containerForm, setContainerForm] = useState({ name: '', price: 0, sort_order: 0 });

  // Settings Tab
  const [restaurantSettings, setRestaurantSettings] = useState(null);
  const [operators, setOperators] = useState([]);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [operatorForm, setOperatorForm] = useState({ username: '', password: '', full_name: '', phone: '', telegram_id: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [categoryImageCategories, setCategoryImageCategories] = useState([]);
  const [categoryImageLevels, setCategoryImageLevels] = useState([null, null, null]);
  const [loadingCategoryImageCategories, setLoadingCategoryImageCategories] = useState(false);
  const [savingCategoryImageCategoryId, setSavingCategoryImageCategoryId] = useState(null);
  const [categoryImageUploadTargetId, setCategoryImageUploadTargetId] = useState(null);
  const categoryImageFileInputRef = useRef(null);
  const [helpInstructions, setHelpInstructions] = useState([]);
  const [loadingHelpInstructions, setLoadingHelpInstructions] = useState(false);
  const [selectedHelpInstruction, setSelectedHelpInstruction] = useState(null);
  const lastTrackedHelpInstructionIdRef = useRef(null);
  const [testingBot, setTestingBot] = useState(false);
  const [testedBotInfo, setTestedBotInfo] = useState(null);
  const [botProfileLookupLoading, setBotProfileLookupLoading] = useState(false);
  const [botProfileLookupError, setBotProfileLookupError] = useState('');
  const [copiedTelegramField, setCopiedTelegramField] = useState('');
  const [downloadingRegistrationQr, setDownloadingRegistrationQr] = useState(false);
  const [showDeliveryZoneModal, setShowDeliveryZoneModal] = useState(false);
  const [initialRestaurantBotToken, setInitialRestaurantBotToken] = useState('');
  const [restaurantSettingsBaselineSignature, setRestaurantSettingsBaselineSignature] = useState('');
  const [registrationQrPreviewMeta, setRegistrationQrPreviewMeta] = useState(null);
  const [loadingRegistrationQrPreview, setLoadingRegistrationQrPreview] = useState(false);
  const [registrationQrPreviewError, setRegistrationQrPreviewError] = useState('');
  const [tokenSaveCountdown, setTokenSaveCountdown] = useState(0);
  const [isRestaurantBotTokenVisible, setIsRestaurantBotTokenVisible] = useState(false);
  const tokenCountdownArmedRef = useRef(false);
  const rowDoubleTapRef = useRef({ key: '', at: 0 });
  const kanbanScrollTimeoutsRef = useRef({});
  const variantsTableScrollHideTimeoutRef = useRef(null);
  const [kanbanScrollingColumns, setKanbanScrollingColumns] = useState({});
  const [isVariantsTableScrolling, setIsVariantsTableScrolling] = useState(false);
  const [showMobileAccountSheet, setShowMobileAccountSheet] = useState(false);
  const [showMobileFiltersSheet, setShowMobileFiltersSheet] = useState(false);
  const [kanbanTimingNowMs, setKanbanTimingNowMs] = useState(() => Date.now());
  const [kanbanColumnFilters, setKanbanColumnFilters] = useState({});
  const [showKanbanColumnFilterModal, setShowKanbanColumnFilterModal] = useState(false);
  const [activeKanbanFilterColumn, setActiveKanbanFilterColumn] = useState('');
  const [kanbanFilterDraft, setKanbanFilterDraft] = useState(() => ({ ...KANBAN_COLUMN_FILTER_DEFAULT }));
  const [expandedKanbanCardIds, setExpandedKanbanCardIds] = useState({});
  const [appearancePreviewActiveTab, setAppearancePreviewActiveTab] = useState('showcase');
  const [appearancePreviewOpenedProductId, setAppearancePreviewOpenedProductId] = useState(null);
  const [appearancePreviewSelectedCategoryId, setAppearancePreviewSelectedCategoryId] = useState(null);

  // Customers (operator-scoped)
  const [customers, setCustomers] = useState({ customers: [], total: 0, page: 1, limit: 20 });
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerLimit, setCustomerLimit] = useState(15);
  const [showCustomerOrdersModal, setShowCustomerOrdersModal] = useState(false);
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState(null);
  const [customerOrdersHistory, setCustomerOrdersHistory] = useState({ orders: [], total: 0, page: 1, limit: 10 });
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [customerOrdersPage, setCustomerOrdersPage] = useState(1);

  const { user, logout, switchRestaurant, isSuperAdmin, fetchUser } = useAuth();
  const {
    language,
    setLanguage,
    t,
    countryCurrency,
    countryCurrencyOptions,
    setCountryCurrency
  } = useLanguage();
  const getProductPriceDisplayLabel = useCallback((product) => {
    const basePrice = normalizeProductPriceValue(product?.price, NaN);
    const fallbackLabel = Number.isFinite(basePrice) ? `${formatPrice(basePrice)} ${t('sum')}` : '-';
    if (!Boolean(product?.size_enabled)) return fallbackLabel;

    const variants = normalizeProductVariantOptions(
      product?.size_options ?? product?.variant_options,
      {
        fallbackPrice: basePrice,
        unit: product?.unit || 'шт'
      }
    );
    const prices = variants
      .map((variant) => normalizeProductPriceValue(variant?.price, NaN))
      .filter((price) => Number.isFinite(price) && price > 0);
    if (prices.length === 0) return fallbackLabel;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (Number.isFinite(maxPrice) && maxPrice > minPrice) {
      return `${formatPrice(minPrice)} - ${formatPrice(maxPrice)} ${t('sum')}`;
    }
    return `${formatPrice(minPrice)} ${t('sum')}`;
  }, [t]);

  const getProductListImageSources = useCallback((product) => {
    const resolveAbsoluteUrl = (value) => {
      const normalized = String(value || '').trim();
      if (!normalized) return '';
      return normalized.startsWith('http') ? normalized : `${API_URL.replace('/api', '')}${normalized}`;
    };

    const baseThumb = String(product?.thumb_url || '').trim();
    const baseImage = String(product?.image_url || '').trim();
    if (baseThumb || baseImage) {
      return {
        thumb: resolveAbsoluteUrl(baseThumb || baseImage),
        preview: resolveAbsoluteUrl(baseImage || baseThumb)
      };
    }

    if (!Boolean(product?.size_enabled)) {
      return { thumb: '', preview: '' };
    }

    const basePrice = normalizeProductPriceValue(product?.price, NaN);
    const variants = normalizeProductVariantOptions(
      product?.size_options ?? product?.variant_options,
      {
        fallbackPrice: basePrice,
        unit: product?.unit || 'шт'
      }
    );

    const firstVariantWithImage = variants.find((variant) => {
      const variantThumb = String(variant?.thumb_url || '').trim();
      const variantImage = String(variant?.image_url || '').trim();
      return Boolean(variantThumb || variantImage);
    });

    if (!firstVariantWithImage) {
      return { thumb: '', preview: '' };
    }

    const variantThumb = String(firstVariantWithImage.thumb_url || '').trim();
    const variantImage = String(firstVariantWithImage.image_url || '').trim();
    return {
      thumb: resolveAbsoluteUrl(variantThumb || variantImage),
      preview: resolveAbsoluteUrl(variantImage || variantThumb)
    };
  }, []);
  const isVariantStockImportEnabled = Boolean(restaurantSettings?.inventory_tracking_enabled)
    && Boolean(restaurantSettings?.size_variants_enabled);
  const productsByIdForStockImport = useMemo(() => {
    const map = new Map();
    (products || []).forEach((product) => {
      const id = Number.parseInt(product?.id, 10);
      if (Number.isInteger(id) && id > 0) {
        map.set(id, product);
      }
    });
    return map;
  }, [products]);
  const mapProviderOptions = useMemo(() => ([
    { value: 'osm', label: 'OpenStreetMap' },
    { value: 'yandex', label: 'Yandex' }
  ]), []);
  const mapTileLayerConfig = useMemo(() => getLeafletTileLayerConfig(leafletMapProvider, {
    yandexApiKey: import.meta.env.VITE_YANDEX_MAPS_KEY || ''
  }), [leafletMapProvider]);
  const handleLeafletMapProviderChange = useCallback((nextValue) => {
    const normalizedProvider = normalizeMapProvider(nextValue);
    setLeafletMapProvider(normalizedProvider);
    saveMapProvider(normalizedProvider);
  }, []);
  const isYandexMapProvider = leafletMapProvider === 'yandex';
  const handleYandexAnalyticsMapLoadError = useCallback(() => {
    if (leafletMapProvider !== 'yandex') return;
    const fallbackProvider = 'osm';
    setLeafletMapProvider(fallbackProvider);
    saveMapProvider(fallbackProvider);
  }, [leafletMapProvider]);
  const variantSupportContactName = String(billingInfo?.requisites?.card_holder || '').trim() || 'Akromov Davron';
  const variantSupportPhone = String(billingInfo?.requisites?.phone_number || '').trim() || '+998993025345';
  const variantSupportTelegram = String(billingInfo?.requisites?.telegram_username || '').trim() || '@budavron';
  const variantSupportTelegramHandle = variantSupportTelegram.replace(/^@+/, '');
  const variantSupportTelegramLink = variantSupportTelegramHandle
    ? `https://t.me/${encodeURIComponent(variantSupportTelegramHandle)}`
    : '';
  const containerLabelAnimatedWords = useMemo(() => (
    CONTAINER_LABEL_WORDS_BY_LANGUAGE[language] || CONTAINER_LABEL_WORDS_BY_LANGUAGE.ru
  ), [language]);
  const activeContainerLabelWord = containerLabelAnimatedWords[
    productContainerLabelWordIndex % Math.max(containerLabelAnimatedWords.length, 1)
  ] || (language === 'uz' ? 'Idish' : 'Посуда');
  const allSubcategoriesLabel = language === 'uz' ? 'Barcha subkategoriyalar' : 'Все подкатегории';
  const allThirdCategoriesLabel = language === 'uz' ? 'Barcha 3-daraja kategoriyalari' : 'Все категории 3 уровня';
  const thirdCategoryLabel = language === 'uz' ? '3-daraja kategoriya' : 'Категория 3';
  const categoryLineLabels = language === 'uz'
    ? ['Kategoriya 1', 'Kategoriya 2', 'Kategoriya 3']
    : ['Категория 1', 'Категория 2', 'Категория 3'];
  const canEditStoreCurrency = isSuperAdmin();
  const isReservationModuleEnabled = restaurantSettings?.reservation_enabled !== false;
  const activeRestaurantLogoUrl = useMemo(() => {
    const raw = String(user?.active_restaurant_logo || '').trim();
    if (!raw) return '';
    const normalizedRaw = raw.toLowerCase();
    if (normalizedRaw === 'null' || normalizedRaw === 'undefined' || normalizedRaw === 'false') return '';
    return toAbsoluteFileUrl(raw);
  }, [user?.active_restaurant_logo]);
  const activeRestaurantLogoDisplayMode = useMemo(() => (
    String(
      restaurantSettings?.logo_display_mode
      || user?.active_restaurant_logo_display_mode
      || 'square'
    ).trim().toLowerCase() === 'horizontal' ? 'horizontal' : 'square'
  ), [restaurantSettings?.logo_display_mode, user?.active_restaurant_logo_display_mode]);

  const languageOptions = useMemo(() => ([
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
  const activeLanguageOption = useMemo(() => (
    languageOptions.find((option) => option.code === language) || languageOptions[0]
  ), [language, languageOptions]);
  const handleLanguageSelect = useCallback((nextLanguage) => {
    if (!nextLanguage || nextLanguage === language) return;
    setLanguage(nextLanguage);
  }, [language, setLanguage]);
  useEffect(() => {
    if (!showProductModal) return undefined;
    setProductContainerLabelWordIndex(0);
    const intervalId = window.setInterval(() => {
      setProductContainerLabelWordIndex((prev) => (
        (prev + 1) % Math.max(containerLabelAnimatedWords.length, 1)
      ));
    }, 1700);
    return () => window.clearInterval(intervalId);
  }, [showProductModal, containerLabelAnimatedWords.length]);
  const selectedRestaurantCurrencyOption = useMemo(() => {
    const nextCode = String(
      restaurantSettings?.currency_code
      || user?.active_restaurant_currency_code
      || countryCurrency?.code
      || 'uz'
    ).trim().toLowerCase();
    return countryCurrencyOptions.find((option) => option.code === nextCode) || countryCurrencyOptions[0] || null;
  }, [
    restaurantSettings?.currency_code,
    user?.active_restaurant_currency_code,
    countryCurrency?.code,
    countryCurrencyOptions
  ]);
  const resolveCurrencyLabelByCode = useCallback((rawCode) => {
    const normalizedCode = String(rawCode || '').trim().toLowerCase();
    const fallback = countryCurrencyOptions?.[0];
    const matched = countryCurrencyOptions?.find((option) => (
      String(option?.code || '').trim().toLowerCase() === normalizedCode
    )) || fallback;

    if (!matched) return t('sum');
    if (language === 'uz') {
      return matched.currencyUz || matched.currencyRu || t('sum');
    }
    return matched.currencyRu || matched.currencyUz || t('sum');
  }, [countryCurrencyOptions, language, t]);
  const activeRestaurantCurrencyLabel = useMemo(() => (
    resolveCurrencyLabelByCode(
      restaurantSettings?.currency_code
      || billingInfo?.restaurant?.currency_code
      || user?.active_restaurant_currency_code
      || countryCurrency?.code
    )
  ), [
    resolveCurrencyLabelByCode,
    restaurantSettings?.currency_code,
    billingInfo?.restaurant?.currency_code,
    user?.active_restaurant_currency_code,
    countryCurrency?.code
  ]);
  const appearancePreviewThemeKey = normalizeUiTheme(restaurantSettings?.ui_theme, 'classic');
  const appearancePreviewTheme = APPEARANCE_PREVIEW_THEME_TOKENS[appearancePreviewThemeKey]
    || APPEARANCE_PREVIEW_THEME_TOKENS.classic;
  const appearancePreviewFontFamily = UI_FONT_FAMILY_PREVIEW_STYLES[
    normalizeUiFontFamily(restaurantSettings?.ui_font_family, 'sans')
  ] || UI_FONT_FAMILY_PREVIEW_STYLES.sans;
  const appearancePreviewMenuMode = normalizeMenuViewMode(restaurantSettings?.menu_view_mode, 'grid_categories');
  const appearancePreviewCardMode = normalizeCatalogCardMode(restaurantSettings?.catalog_card_mode, 'wide');
  const appearancePreviewGlassOpacity = normalizeMenuGlassOpacity(
    restaurantSettings?.menu_liquid_glass_opacity,
    MENU_GLASS_OPACITY_DEFAULT
  );
  const appearancePreviewGlassBlur = normalizeMenuGlassBlur(
    restaurantSettings?.menu_liquid_glass_blur,
    MENU_GLASS_BLUR_DEFAULT
  );
  const appearancePreviewCategoryTree = useMemo(() => {
    const sourceCategories = Array.isArray(categories) ? categories : [];
    const sourceProducts = Array.isArray(products) ? products : [];
    const parseCategoryId = (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) ? parsed : null;
    };
    const getCategoryTitle = (category, fallbackIndex = 1) => {
      const title = language === 'uz'
        ? (String(category?.name_uz || '').trim() || String(category?.name_ru || '').trim())
        : (String(category?.name_ru || '').trim() || String(category?.name_uz || '').trim());
      return title || `${language === 'uz' ? 'Kategoriya' : 'Категория'} ${fallbackIndex}`;
    };
    const getCategorySort = (category, fallbackIndex = 1) => {
      const parsed = Number.parseInt(category?.sort_order ?? category?.sort ?? fallbackIndex, 10);
      return Number.isInteger(parsed) ? parsed : fallbackIndex;
    };
    const getCategoryImage = (category) => {
      const image = toAbsoluteFileUrl(
        String(category?.image_url || category?.icon_url || category?.image || '').trim()
      );
      return image || MENU_MODE_PREVIEW_MEDIA.categoryPhoto;
    };

    const categoriesById = new Map();
    const childrenByParent = new Map();
    sourceCategories.forEach((category, index) => {
      const id = parseCategoryId(category?.id);
      if (!id) return;
      const parentId = parseCategoryId(category?.parent_id);
      const normalizedCategory = {
        raw: category,
        id,
        parentId,
        sort: getCategorySort(category, index + 1),
        title: getCategoryTitle(category, index + 1),
        image: getCategoryImage(category)
      };
      categoriesById.set(id, normalizedCategory);
      const mapKey = parentId === null ? 'root' : String(parentId);
      if (!childrenByParent.has(mapKey)) childrenByParent.set(mapKey, []);
      childrenByParent.get(mapKey).push(normalizedCategory);
    });

    const sortCategoryList = (list) => list.sort((left, right) => {
      if (left.sort !== right.sort) return left.sort - right.sort;
      return left.title.localeCompare(right.title, language === 'uz' ? 'uz' : 'ru');
    });
    for (const list of childrenByParent.values()) sortCategoryList(list);

    const productCategoryIds = new Set(
      sourceProducts
        .map((product) => parseCategoryId(product?.category_id))
        .filter((id) => Number.isInteger(id))
    );

    const nonEmptyCategoryIds = new Set();
    const collectAncestors = (categoryId) => {
      let currentId = categoryId;
      while (Number.isInteger(currentId)) {
        if (nonEmptyCategoryIds.has(currentId)) break;
        nonEmptyCategoryIds.add(currentId);
        currentId = categoriesById.get(currentId)?.parentId ?? null;
      }
    };
    productCategoryIds.forEach((categoryId) => collectAncestors(categoryId));

    const level1Categories = (childrenByParent.get('root') || []).filter((category) => nonEmptyCategoryIds.has(category.id));
    const activeLevel1 = level1Categories[0] || null;
    const level2Categories = activeLevel1
      ? (childrenByParent.get(String(activeLevel1.id)) || []).filter((category) => nonEmptyCategoryIds.has(category.id))
      : [];

    return {
      level1Categories,
      activeLevel1,
      level2Categories,
      categoriesById,
      childrenByParent,
      nonEmptyCategoryIds
    };
  }, [categories, products, language]);
  const appearancePreviewCategories = useMemo(() => {
    const level2Categories = appearancePreviewCategoryTree.level2Categories || [];
    if (level2Categories.length > 0) return level2Categories.slice(0, 8);
    return [
      { id: 1, sort: 1, title: language === 'uz' ? 'Kategoriya 1' : 'Категория 1', image: MENU_MODE_PREVIEW_MEDIA.categoryPhoto },
      { id: 2, sort: 2, title: language === 'uz' ? 'Kategoriya 2' : 'Категория 2', image: MENU_MODE_PREVIEW_MEDIA.categoryPhotoAlt }
    ];
  }, [appearancePreviewCategoryTree, language]);
  const appearancePreviewProducts = useMemo(() => {
    const mapped = (Array.isArray(products) ? products : [])
      .filter((product) => product?.is_active !== false)
      .map((product, index) => {
        const id = Number.parseInt(product?.id, 10);
        const categoryId = Number.parseInt(product?.category_id, 10);
        const sortValue = Number.parseInt(product?.sort_order ?? product?.sort ?? index + 1, 10);
        const productImageSlots = createProductImageSlots(product?.product_images, product?.image_url, product?.thumb_url);
        const bestSlot = productImageSlots.find((slot) => String(slot?.thumb_url || slot?.url || '').trim());
        const bestImageRaw = String(
          bestSlot?.thumb_url
          || bestSlot?.url
          || product?.thumb_url
          || product?.image_url
          || ''
        ).trim();
        const title = language === 'uz'
          ? (String(product?.name_uz || '').trim() || String(product?.name_ru || '').trim())
          : (String(product?.name_ru || '').trim() || String(product?.name_uz || '').trim());
        const priceValue = Number(
          product?.price
          ?? product?.sale_price
          ?? product?.base_price
          ?? product?.current_price
          ?? 0
        );
        return {
          id: Number.isInteger(id) ? id : index + 1,
          categoryId: Number.isInteger(categoryId) ? categoryId : null,
          sort: Number.isInteger(sortValue) ? sortValue : index + 1,
          title: title || `${language === 'uz' ? 'Mahsulot' : 'Товар'} ${index + 1}`,
          unit: String(product?.unit || (language === 'uz' ? 'dona' : 'шт')).trim() || (language === 'uz' ? 'dona' : 'шт'),
          isLogoFallback: !bestImageRaw && Boolean(activeRestaurantLogoUrl),
          image: bestImageRaw
            ? toAbsoluteFileUrl(bestImageRaw)
            : (activeRestaurantLogoUrl || MENU_MODE_PREVIEW_MEDIA.productPhoto),
          priceLabel: Number.isFinite(priceValue) && priceValue > 0
            ? `${formatPrice(priceValue)} ${activeRestaurantCurrencyLabel}`
            : `${formatPrice(16000)} ${activeRestaurantCurrencyLabel}`
        };
      })
      .sort((left, right) => left.sort - right.sort);

    if (mapped.length > 0) return mapped.slice(0, 12);

    return [
      {
        id: 1,
        categoryId: appearancePreviewCategories[0]?.id || null,
        sort: 1,
        title: language === 'uz' ? 'Mahsulot 1' : 'Товар 1',
        unit: language === 'uz' ? 'dona' : 'шт',
        isLogoFallback: Boolean(activeRestaurantLogoUrl),
        image: activeRestaurantLogoUrl || MENU_MODE_PREVIEW_MEDIA.productPhoto,
        priceLabel: `${formatPrice(16000)} ${activeRestaurantCurrencyLabel}`
      },
      {
        id: 2,
        categoryId: appearancePreviewCategories[0]?.id || null,
        sort: 2,
        title: language === 'uz' ? 'Mahsulot 2' : 'Товар 2',
        unit: language === 'uz' ? 'dona' : 'шт',
        isLogoFallback: Boolean(activeRestaurantLogoUrl),
        image: activeRestaurantLogoUrl || MENU_MODE_PREVIEW_MEDIA.categoryPhotoAlt,
        priceLabel: `${formatPrice(18000)} ${activeRestaurantCurrencyLabel}`
      }
    ];
  }, [products, language, activeRestaurantCurrencyLabel, appearancePreviewCategories, activeRestaurantLogoUrl]);
  const appearancePreviewPrimaryCategory = appearancePreviewCategoryTree.activeLevel1 || appearancePreviewCategories[0] || null;
  const appearancePreviewCatalogProducts = useMemo(() => {
    const selectedLevel2Id = Number.parseInt(appearancePreviewSelectedCategoryId, 10);
    if (Number.isInteger(selectedLevel2Id)) {
      const level2Children = appearancePreviewCategoryTree.childrenByParent.get(String(selectedLevel2Id)) || [];
      const allowedCategoryIds = new Set([selectedLevel2Id, ...level2Children.map((item) => Number(item.id))]);
      const byCategory = appearancePreviewProducts.filter((item) => allowedCategoryIds.has(Number.parseInt(item?.categoryId, 10)));
      if (byCategory.length > 0) return byCategory.slice(0, 8);
    }
    return appearancePreviewProducts.slice(0, 6);
  }, [appearancePreviewProducts, appearancePreviewCategoryTree, appearancePreviewSelectedCategoryId]);
  const appearancePreviewMenuIconSettings = useMemo(() => {
    const raw = restaurantSettings?.menu_icon_settings;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return normalizeMenuIconSettings(raw, DEFAULT_MENU_ICON_SETTINGS);
    }
    if (typeof raw === 'string') {
      const normalized = raw.trim();
      if (!normalized) return { ...DEFAULT_MENU_ICON_SETTINGS };
      try {
        return normalizeMenuIconSettings(JSON.parse(normalized), DEFAULT_MENU_ICON_SETTINGS);
      } catch (_) {
        return { ...DEFAULT_MENU_ICON_SETTINGS };
      }
    }
    return { ...DEFAULT_MENU_ICON_SETTINGS };
  }, [restaurantSettings?.menu_icon_settings]);
  const appearancePreviewNavItems = useMemo(() => {
    const showcaseVisible = restaurantSettings?.is_visible !== false;
    const menuVisible = restaurantSettings?.is_menu_visible !== false;
    const items = [];
    if (showcaseVisible) {
      items.push({
        key: 'showcase',
        label: language === 'uz' ? 'Vitrina' : 'Витрина',
        icon: appearancePreviewMenuIconSettings.showcase
      });
    }
    if (menuVisible) {
      items.push({
        key: 'catalog',
        label: language === 'uz' ? 'Menyu' : 'Меню',
        icon: appearancePreviewMenuIconSettings.catalog
      });
    }
    items.push(
      {
        key: 'favorites',
        label: language === 'uz' ? 'Saralanganlar' : 'Избранные',
        icon: appearancePreviewMenuIconSettings.favorites
      },
      {
        key: 'cart',
        label: language === 'uz' ? 'Savat' : 'Корзина',
        icon: appearancePreviewMenuIconSettings.cart
      }
    );
    if (isReservationModuleEnabled) {
      items.push({
        key: 'reservations',
        label: language === 'uz' ? 'Bron' : 'Бронь',
        icon: appearancePreviewMenuIconSettings.reservations
      });
    }
    return items;
  }, [language, isReservationModuleEnabled, restaurantSettings?.is_menu_visible, restaurantSettings?.is_visible, appearancePreviewMenuIconSettings]);
  const appearancePreviewVisibleProducts = useMemo(() => {
    const selectedCategoryId = Number.parseInt(appearancePreviewSelectedCategoryId, 10);
    if (Number.isInteger(selectedCategoryId)) {
      const byCategory = appearancePreviewProducts.filter((item) => (
        Number.parseInt(item?.categoryId, 10) === selectedCategoryId
      ));
      if (byCategory.length > 0) return byCategory.slice(0, 10);
    }
    if (appearancePreviewMenuMode === 'grid_categories' || appearancePreviewMenuMode === 'nested_categories') {
      return appearancePreviewCatalogProducts.slice(0, 10);
    }
    return appearancePreviewProducts.slice(0, 10);
  }, [
    appearancePreviewProducts,
    appearancePreviewMenuMode,
    appearancePreviewCatalogProducts,
    appearancePreviewSelectedCategoryId
  ]);
  const appearancePreviewFavoriteProducts = useMemo(() => (
    appearancePreviewProducts
      .filter((_, index) => index % 2 === 0)
      .slice(0, 6)
  ), [appearancePreviewProducts]);
  const appearancePreviewCartProducts = useMemo(() => (
    appearancePreviewProducts.slice(0, 3)
  ), [appearancePreviewProducts]);
  const appearancePreviewOpenedProduct = useMemo(() => (
    appearancePreviewProducts.find((item) => Number(item.id) === Number(appearancePreviewOpenedProductId)) || null
  ), [appearancePreviewProducts, appearancePreviewOpenedProductId]);
  const appearancePreviewRootStyle = useMemo(() => ({
    '--appearance-preview-bg-start': appearancePreviewTheme.bgStart,
    '--appearance-preview-bg-end': appearancePreviewTheme.bgEnd,
    '--appearance-preview-accent': appearancePreviewTheme.accent,
    '--appearance-preview-accent-soft': appearancePreviewTheme.accentSoft,
    fontFamily: appearancePreviewFontFamily
  }), [appearancePreviewTheme, appearancePreviewFontFamily]);
  useEffect(() => {
    if (!appearancePreviewNavItems.length) return;
    if (!appearancePreviewNavItems.some((item) => item.key === appearancePreviewActiveTab)) {
      setAppearancePreviewActiveTab(appearancePreviewNavItems[0].key);
    }
  }, [appearancePreviewNavItems, appearancePreviewActiveTab]);
  useEffect(() => {
    if (!appearancePreviewCategories.length) {
      setAppearancePreviewSelectedCategoryId(null);
      return;
    }
    const current = Number.parseInt(appearancePreviewSelectedCategoryId, 10);
    const exists = appearancePreviewCategories.some((item) => Number(item.id) === current);
    if (!exists) {
      setAppearancePreviewSelectedCategoryId(appearancePreviewCategories[0].id);
    }
  }, [appearancePreviewCategories, appearancePreviewSelectedCategoryId]);
  useEffect(() => {
    if (!appearancePreviewOpenedProduct) return;
    const exists = appearancePreviewProducts.some((item) => Number(item.id) === Number(appearancePreviewOpenedProduct.id));
    if (!exists) setAppearancePreviewOpenedProductId(null);
  }, [appearancePreviewOpenedProduct, appearancePreviewProducts]);
  const resolvedOrderCost = useMemo(() => {
    const billingCost = Number(billingInfo?.restaurant?.order_cost);
    if (Number.isFinite(billingCost) && billingCost >= 0) return billingCost;
    const settingsCost = Number(restaurantSettings?.order_cost);
    if (Number.isFinite(settingsCost) && settingsCost >= 0) return settingsCost;
    return 1000;
  }, [billingInfo?.restaurant?.order_cost, restaurantSettings?.order_cost]);
  const isUnlimitedChecksBalance = Boolean(
    billingInfo?.restaurant?.is_free_tier ?? restaurantSettings?.is_free_tier
  );
  const balanceChecksCount = useMemo(() => {
    if (isUnlimitedChecksBalance) return Number.POSITIVE_INFINITY;
    const currentBalance = Number(user?.balance);
    if (!Number.isFinite(currentBalance) || currentBalance <= 0) return 0;
    if (!Number.isFinite(resolvedOrderCost)) return 0;
    if (resolvedOrderCost <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor(currentBalance / resolvedOrderCost));
  }, [isUnlimitedChecksBalance, user?.balance, resolvedOrderCost]);
  const checksCountLabel = language === 'uz' ? 'ta chek' : 'чеков';
  const checksAvailableLabel = language === 'uz' ? 'Qolgan cheklar' : 'Доступно чеков';
  const formatChecksCount = (value) => {
    if (value === Number.POSITIVE_INFINITY) return '∞';
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return '0';
    return Math.floor(numeric).toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
  };
  const {
    actionButtonsVisible,
    actionButtonsRemainingLabel,
    setActionButtonsVisible
  } = useTimedActionButtonsVisibility();
  const normalizedInitialRestaurantBotToken = (initialRestaurantBotToken || '').trim();
  const normalizedCurrentRestaurantBotToken = (restaurantSettings?.telegram_bot_token || '').trim();
  const isRestaurantBotTokenChanged = Boolean(restaurantSettings) &&
    normalizedCurrentRestaurantBotToken !== normalizedInitialRestaurantBotToken;
  const currentRestaurantSettingsSignature = useMemo(
    () => buildRestaurantSettingsSignature(restaurantSettings),
    [restaurantSettings]
  );
  const isRestaurantSettingsDirty = Boolean(restaurantSettings)
    && currentRestaurantSettingsSignature !== restaurantSettingsBaselineSignature;
  const isTokenSaveLocked = isRestaurantBotTokenChanged && tokenSaveCountdown > 0;
  const isRestaurantSettingsSaveDisabled = savingSettings || isTokenSaveLocked || !isRestaurantSettingsDirty;
  
  const fetchPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      const { data } = await axios.get(`${API_URL}/admin/printers`);
      setPrinters(data);
    } catch (err) {
      console.error('Fetch printers error:', err);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  const fetchPrinterAgents = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/admin/printer-agents`);
      setPrinterAgents(data);
    } catch (err) {
      console.error('Fetch agents error:', err);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'printers') {
      fetchPrinters();
      fetchPrinterAgents();
    }
  }, [mainTab, fetchPrinters, fetchPrinterAgents]);

  const handleDownloadPrinterAgent = async () => {
    if (downloadingPrinterAgent) return;

    setDownloadingPrinterAgent(true);
    try {
      const response = await axios.get(`${API_URL}/admin/printer-agent/download`, {
        responseType: 'blob',
        timeout: 120000
      });

      const fileBlob = response?.data;
      if (!fileBlob || Number(fileBlob.size || 0) <= 0) {
        throw new Error('Пустой файл');
      }

      let filename = 'TalablarPrinter.exe';
      const contentDisposition = String(response.headers?.['content-disposition'] || '');
      const utf8NameMatch = contentDisposition.match(/filename\\*=UTF-8''([^;]+)/i);
      const plainNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const rawFilename = utf8NameMatch?.[1] || plainNameMatch?.[1] || '';
      if (rawFilename) {
        try {
          filename = decodeURIComponent(rawFilename.trim());
        } catch (_) {
          filename = rawFilename.trim();
        }
      }

      const objectUrl = window.URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || 'TalablarPrinter.exe';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);

      setAlertMessage({
        type: 'success',
        text: language === 'uz'
          ? "Talablar Printer yuklab olindi."
          : 'Файл TalablarPrinter.exe скачан.'
      });
    } catch (error) {
      console.error('Download printer-agent error:', error);
      let errorText = '';
      const errorPayload = error?.response?.data;
      if (errorPayload instanceof Blob) {
        try {
          const payloadText = await errorPayload.text();
          const parsedPayload = JSON.parse(payloadText);
          errorText = String(parsedPayload?.error || '').trim();
        } catch (_) {
          errorText = '';
        }
      } else if (errorPayload && typeof errorPayload === 'object') {
        errorText = String(errorPayload.error || '').trim();
      }

      setAlertMessage({
        type: 'danger',
        text: errorText || (language === 'uz'
          ? "Talablar Printer faylini yuklab bo'lmadi."
          : 'Не удалось скачать Talablar Printer.')
      });
    } finally {
      setDownloadingPrinterAgent(false);
    }
  };

  const handleCreatePrinterAgent = async (e) => {
    e.preventDefault();
    if (!printerAgentName.trim()) return;
    try {
      await axios.post(`${API_URL}/admin/printer-agents`, { name: printerAgentName });
      setPrinterAgentName('');
      setShowPrinterAgentModal(false);
      fetchPrinterAgents();
    } catch (err) {
      alert('Ошибка при создании агента');
    }
  };

  const handleDeletePrinterAgent = async (id) => {
    if (!window.confirm('Удалить этого агента?')) return;
    try {
      await axios.delete(`${API_URL}/admin/printer-agents/${id}`);
      fetchPrinterAgents();
    } catch (err) {
      alert('Ошибка при удалении');
    }
  };

  const handleSavePrinter = async (e) => {
    e.preventDefault();
    try {
      if (selectedPrinter) {
        await axios.put(`${API_URL}/admin/printers/${selectedPrinter.id}`, printerForm);
      } else {
        await axios.post(`${API_URL}/admin/printers`, printerForm);
      }
      setShowPrinterModal(false);
      fetchPrinters();
    } catch (err) {
      alert('Ошибка при сохранении принтера');
    }
  };

  const handleDeletePrinter = async (id) => {
    if (!window.confirm('Удалить принтер?')) return;
    try {
      await axios.delete(`${API_URL}/admin/printers/${id}`);
      fetchPrinters();
    } catch (err) {
      alert('Ошибка при удалении');
    }
  };

  const handleTestPrinter = async (printer) => {
    const printerId = Number(printer?.id);
    if (!Number.isFinite(printerId) || printerId <= 0) return;
    if (testingPrinterIds.includes(printerId)) return;

    setTestingPrinterIds((prev) => [...prev, printerId]);
    try {
      const { data } = await axios.post(`${API_URL}/admin/printers/${printerId}/test`);
      setAlertMessage({
        type: 'success',
        text: data?.message || (language === 'uz'
          ? 'Test chop etish yuborildi.'
          : 'Тестовая печать отправлена.')
      });
    } catch (error) {
      console.error('Test printer error:', error);
      setAlertMessage({
        type: 'danger',
        text: error?.response?.data?.error || (language === 'uz'
          ? 'Printerni tekshirib bo‘lmadi.'
          : 'Не удалось проверить принтер.')
      });
    } finally {
      setTestingPrinterIds((prev) => prev.filter((id) => id !== printerId));
    }
  };

  const hasMobileFilterSheet = ['orders', 'products', 'feedback', 'clients'].includes(mainTab);
  const operatorHotkeyTabOrder = useMemo(() => {
    const tabs = ['dashboard', 'orders'];
    if (isReservationModuleEnabled) tabs.push('reservations');
    tabs.push('products', 'showcase', 'containers', 'feedback', 'clients', 'help', 'printers', 'settings');
    return tabs;
  }, [isReservationModuleEnabled]);
  const orderStatusPillItems = [
    { value: 'all', label: t('allStatuses'), color: '#6b7280', emoji: '📋' },
    { value: 'new', label: t('statusNew'), color: '#3b82f6', emoji: '🆕' },
    { value: 'preparing', label: t('statusPreparing'), color: '#f59e0b', emoji: '👨‍🍳' },
    { value: 'delivering', label: t('statusDelivering'), color: '#06b6d4', emoji: '🚚' },
    { value: 'delivered', label: t('statusDelivered'), color: '#16a34a', emoji: '✅' },
    { value: 'cancelled', label: t('statusCancelled'), color: '#ef4444', emoji: '❌' },
  ];
  const orderViewModeItems = [
    { value: 'list', icon: 'bi-list-ul', label: language === 'uz' ? "Ro'yxat" : 'Список' },
    { value: 'kanban', icon: 'bi-columns-gap', label: 'Kanban' }
  ];
  const isOrdersKanbanMode = mainTab === 'orders' && ordersViewMode === 'kanban';
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY, isSidebarCollapsed ? '1' : '0');
    } catch (_) {
      // ignore localStorage failures
    }
  }, [isSidebarCollapsed]);
  const handleSidebarTabSelect = useCallback((key) => {
    if (!key) return;
    const isDesktopSidebar = typeof window !== 'undefined' && window.innerWidth >= 992;
    if (isDesktopSidebar && key === mainTab) {
      setIsSidebarCollapsed((prev) => !prev);
      return;
    }
    setMainTab(key);
    setIsMobileSidebarOpen(false);
  }, [mainTab]);
  const adminSidebarTabsMeta = useMemo(() => {
    const tabs = {
      dashboard: { label: t('dashboard'), icon: Home },
      orders: { label: t('orders'), icon: ShoppingCart }
    };

    if (isReservationModuleEnabled) {
      tabs.reservations = { label: t('reservations'), icon: CalendarDays };
    }

    tabs.products = { label: t('products'), icon: Boxes };
    tabs.showcase = { label: language === 'uz' ? "Menyu konstruktori" : 'Конструктор меню', icon: LayoutGrid };
    tabs.containers = { label: t('containers'), icon: Package };
    tabs.feedback = { label: language === 'uz' ? 'Fikr-mulohaza' : 'Отзывы', icon: MessageCircle };
    tabs.clients = { label: t('clients'), icon: Users };
    tabs.help = { label: language === 'uz' ? "Yo'riqnomalar" : 'Инструкции', icon: BookOpen };
    tabs.printers = { label: language === 'uz' ? "Printerlar" : 'Принтеры', icon: LayoutGrid };
    tabs.settings = { label: t('settings'), icon: Settings };

    return tabs;
  }, [isReservationModuleEnabled, language, t]);
  useEffect(() => {
    if (!mainTab || !adminSidebarTabsMeta[mainTab]) {
      if (mainTab !== 'dashboard') setMainTab('dashboard');
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ADMIN_ACTIVE_TAB_STORAGE_KEY, mainTab);
    } catch (_) {
      // ignore localStorage failures
    }
  }, [mainTab, adminSidebarTabsMeta]);
  const renderAdminSidebarTabTitle = (key) => {
    const meta = adminSidebarTabsMeta[key] || { label: key, icon: Home };
    const Icon = meta.icon;
    if (key === 'printers') {
      return (
        <span className="admin-side-tab-title">
          <Printer size={16} className="admin-side-tab-icon" />
          <span className="admin-side-tab-label">{meta.label}</span>
        </span>
      );
    }
    return (
      <span className="admin-side-tab-title">
        <Icon size={16} className="admin-side-tab-icon" />
        <span className="admin-side-tab-label">{meta.label}</span>
      </span>
    );
  };
  const renderAdminSidebarNavItems = () => (
    Object.keys(adminSidebarTabsMeta).map((key) => (
      <Nav.Item key={`admin-sidebar-${key}`}>
        <Nav.Link eventKey={key}>
          {renderAdminSidebarTabTitle(key)}
        </Nav.Link>
      </Nav.Item>
    ))
  );
  const renderAdminMobileMenuExtras = () => (
    <div className="admin-sidebar-mobile-extra-section">
      <div className="admin-sidebar-mobile-divider" />
      <div className="admin-sidebar-mobile-extra-list">
        <button
          type="button"
          className="admin-sidebar-mobile-action"
          onClick={() => {
            setIsMobileSidebarOpen(false);
            setShowBroadcastModal(true);
          }}
        >
          <span className="admin-sidebar-mobile-action-icon" aria-hidden="true">
            <i className="bi bi-megaphone-fill"></i>
          </span>
          <span className="admin-sidebar-mobile-action-copy">
            <span className="admin-sidebar-mobile-action-title">{t('broadcast')}</span>
            <span className="admin-sidebar-mobile-action-subtitle">
              {language === 'uz' ? 'Mijozlarga xabar yuborish' : 'Рассылка клиентам'}
            </span>
          </span>
        </button>

        {isReservationModuleEnabled && (
          <button
            type="button"
            className="admin-sidebar-mobile-action"
            onClick={() => {
              setIsMobileSidebarOpen(false);
              navigate('/admin/reservations');
            }}
          >
            <span className="admin-sidebar-mobile-action-icon" aria-hidden="true">
              <i className="bi bi-calendar2-week-fill"></i>
            </span>
            <span className="admin-sidebar-mobile-action-copy">
              <span className="admin-sidebar-mobile-action-title">{t('reservations')}</span>
              <span className="admin-sidebar-mobile-action-subtitle">
                {language === 'uz' ? 'Bronlarni boshqarish' : 'Управление бронями'}
              </span>
            </span>
          </button>
        )}

        <div className="admin-sidebar-mobile-action admin-sidebar-mobile-action-card">
          <div className="admin-sidebar-mobile-action-head">
            <span className="admin-sidebar-mobile-action-icon" aria-hidden="true">
              <img src={activeLanguageOption?.flag} width="16" height="12" alt={activeLanguageOption?.shortLabel || 'LANG'} className="rounded-1" />
            </span>
            <span className="admin-sidebar-mobile-action-copy">
              <span className="admin-sidebar-mobile-action-title">
                {language === 'uz' ? 'Tizim tili' : 'Язык системы'}
              </span>
              <span className="admin-sidebar-mobile-action-subtitle">
                {activeLanguageOption?.label || 'Русский'}
              </span>
            </span>
          </div>
          <div className="admin-sidebar-mobile-language-switcher">
            {languageOptions.map((option) => (
              <button
                key={`admin-mobile-language-${option.code}`}
                type="button"
                className={`admin-sidebar-mobile-language-chip${language === option.code ? ' is-active' : ''}`}
                onClick={() => handleLanguageSelect(option.code)}
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
              {user?.full_name || user?.username || 'Administrator'}
            </span>
          </span>
        </button>

        <button
          type="button"
          className="admin-sidebar-mobile-action"
          onClick={() => {
            setIsMobileSidebarOpen(false);
            fetchBillingInfo();
            setShowBalanceModal(true);
          }}
        >
          <span className="admin-sidebar-mobile-action-icon" aria-hidden="true">
            <i className="bi bi-receipt"></i>
          </span>
          <span className="admin-sidebar-mobile-action-copy">
            <span className="admin-sidebar-mobile-action-title">
              {language === 'uz' ? 'Cheklar' : 'Чеки'}
            </span>
            <span className="admin-sidebar-mobile-action-subtitle">
              {checksAvailableLabel}: {formatChecksCount(balanceChecksCount)} {checksCountLabel}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
  const renderAdminSidebarUtilityActions = () => (
    <div className="admin-sidebar-footer-actions d-none d-lg-flex">
      <Dropdown align="end" className="admin-sidebar-footer-dropdown admin-header-lang-dropdown">
        <Dropdown.Toggle
          variant="link"
          bsPrefix="p-0"
          className="admin-sidebar-footer-control"
          title={activeLanguageOption?.label || activeLanguageOption?.shortLabel || 'RU'}
        >
          <span className="admin-sidebar-footer-iconbox" aria-hidden="true">
            <img src={activeLanguageOption?.flag} width="16" height="12" alt={activeLanguageOption?.shortLabel || 'LANG'} className="rounded-1" />
          </span>
          <span className="admin-sidebar-footer-copy">
            <span className="admin-sidebar-footer-title">
              {language === 'uz' ? 'Tizim tili' : 'Язык системы'}
            </span>
            <span className="admin-sidebar-footer-subtitle">
              {activeLanguageOption?.label || 'Русский'}
            </span>
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-lang-dropdown-menu admin-sidebar-footer-menu">
          {languageOptions.map((option) => (
            <Dropdown.Item
              key={`admin-sidebar-language-${option.code}`}
              onClick={() => handleLanguageSelect(option.code)}
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
          title={user?.full_name || user?.username || 'Administrator'}
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
              {user?.full_name || user?.username || 'Administrator'}
            </span>
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-dropdown-menu-wide admin-sidebar-footer-menu">
          <div className="px-3 py-3 border-bottom mb-2 bg-light rounded-top-4">
            <div className="fw-bold text-dark">{user?.full_name || user?.username || 'Administrator'}</div>
            <div className="text-muted small">{user?.role === 'superadmin' ? 'Super Administrator' : 'Administrator'}</div>
          </div>

          {isSuperAdmin() && (
            <Dropdown.Item onClick={() => navigate('/superadmin')} className="d-flex align-items-center gap-2 py-2 rounded-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3 4 7l4 4" />
                <path d="M4 7h16" />
                <path d="m16 21 4-4-4-4" />
                <path d="M20 17H4" />
              </svg>
              <span>{language === 'uz' ? 'Kabinetni almashtirish' : 'Сменить кабинет'}</span>
            </Dropdown.Item>
          )}

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
  const effectiveOrdersStatusFilter = ordersViewMode === 'kanban' ? 'all' : statusFilter;
  const getKanbanColumnFilter = useCallback((columnKey) => ({
    ...KANBAN_COLUMN_FILTER_DEFAULT,
    ...(kanbanColumnFilters[columnKey] || {})
  }), [kanbanColumnFilters]);
  const isKanbanColumnFilterCustom = useCallback((filterConfig) => {
    const normalized = {
      ...KANBAN_COLUMN_FILTER_DEFAULT,
      ...(filterConfig || {})
    };
    return normalized.fulfillment !== 'all'
      || normalized.timing !== 'all'
      || normalized.scheduleSort !== 'none';
  }, []);

  // Excel export function
  const exportToExcel = (data, filename, columns) => {
    const ws = XLSX.utils.json_to_sheet(data.map(item => {
      const row = {};
      columns.forEach(col => {
        row[col.header] = col.accessor(item);
      });
      return row;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportRowsToExcel = (rows, filename, sheetName = 'Data') => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportOrders = () => {
    exportToExcel(orders, 'orders', [
      { header: '№', accessor: (o) => o.order_number },
      { header: 'Клиент', accessor: (o) => o.customer_name },
      { header: 'Телефон', accessor: (o) => o.customer_phone },
      { header: 'Сумма', accessor: (o) => o.total_amount },
      { header: 'Статус', accessor: (o) => o.status },
      { header: 'Дата', accessor: (o) => new Date(o.created_at).toLocaleString('ru-RU') },
      { header: 'Адрес', accessor: (o) => o.delivery_address },
      { header: 'Комментарий', accessor: (o) => o.comment },
    ]);
  };

  const exportProducts = () => {
    const seasonLabels = {
      all: 'Всесезонный',
      spring: 'Весна',
      summer: 'Лето',
      autumn: 'Осень',
      winter: 'Зима'
    };
    if (!products.length) {
      exportRowsToExcel([{
        'Название (RU)': '',
        'Название (UZ)': '',
        'Категория ID': '',
        'Категория путь': '',
        'Категория': '',
        'Цена': '',
        'Единица': 'шт',
        'В наличии': 'Да',
        'Сезонность': 'Всесезонный',
        'Скрыть из каталога': 'Нет'
      }], 'products_template');
      return;
    }

    exportToExcel(products, 'products', [
      { header: 'Название (RU)', accessor: (p) => p.name_ru },
      { header: 'Название (UZ)', accessor: (p) => p.name_uz },
      { header: 'Категория ID', accessor: (p) => p.category_id || '' },
      { header: 'Категория путь', accessor: (p) => categoryPathById.get(String(p.category_id || '')) || '' },
      { header: 'Категория', accessor: (p) => categories.find((c) => c.id === p.category_id)?.name_ru || p.category_name || '' },
      { header: 'Цена', accessor: (p) => p.price },
      { header: 'Единица', accessor: (p) => p.unit },
      { header: 'В наличии', accessor: (p) => p.in_stock ? 'Да' : 'Нет' },
      { header: 'Сезонность', accessor: (p) => seasonLabels[p.season_scope || 'all'] || 'Всесезонный' },
      { header: 'Скрыть из каталога', accessor: (p) => p.is_hidden_catalog ? 'Да' : 'Нет' },
      { header: 'Статус', accessor: (p) => p.in_stock ? 'Активен' : 'Нет в наличии' },
    ]);
  };

  const exportSystemCategories = () => {
    const rows = categories.map((cat) => ({
      'Категория ID': cat.id,
      'Родитель ID': cat.parent_id || '',
      'Название (RU)': cat.name_ru || '',
      'Название (UZ)': cat.name_uz || '',
      'Путь категории': categoryPathById.get(String(cat.id)) || cat.name_ru || '',
      'Можно назначать товар': cat.parent_id ? 'Да' : 'Нет'
    }));

    if (!rows.length) {
      exportRowsToExcel([{
        'Категория ID': '',
        'Родитель ID': '',
        'Название (RU)': '',
        'Название (UZ)': '',
        'Путь категории': '',
        'Можно назначать товар': ''
      }], 'categories_reference');
      return;
    }

    exportRowsToExcel(rows, 'categories_reference');
  };

  // Calculate analytics based on orders (only delivered orders for accurate statistics)
  useEffect(() => {
    const periodOrders = allOrdersForAnalytics.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear &&
        orderDate.getMonth() + 1 === dashboardMonth;
    });
    const filteredOrders = allOrdersForAnalytics.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear &&
        orderDate.getMonth() + 1 === dashboardMonth &&
        order.status === 'delivered'; // Only count delivered orders
    });

    const revenue = filteredOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const ordersCount = filteredOrders.length;
    const averageCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;
    const pickupOrdersCount = filteredOrders.filter((order) => isPickupOrderForAnalytics(order)).length;
    const deliveryOrdersCount = Math.max(0, ordersCount - pickupOrdersCount);
    const financialBreakdown = calculateOrdersFinancialBreakdown(filteredOrders);
    const serviceRevenueAllStatuses = periodOrders.reduce(
      (sum, order) => sum + Math.max(0, toNumericValue(order?.service_fee, 0)),
      0
    );

    // Calculate top products
    const productStats = {};
    filteredOrders.forEach(order => {
      if (order.items) {
        order.items.forEach(item => {
          if (!productStats[item.product_name]) {
            productStats[item.product_name] = { name: item.product_name, quantity: 0, revenue: 0 };
          }
          productStats[item.product_name].quantity += item.quantity;
          productStats[item.product_name].revenue += item.quantity * parseFloat(item.price || 0);
        });
      }
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const customerStats = new Map();
    filteredOrders.forEach((order) => {
      const customerName = String(order.customer_name || '').trim() || 'Клиент';
      const customerPhone = String(order.customer_phone || '').trim();
      const key = `${customerName.toLowerCase()}::${customerPhone.toLowerCase()}`;
      if (!customerStats.has(key)) {
        customerStats.set(key, {
          name: customerName,
          phone: customerPhone || '—',
          ordersCount: 0,
          totalAmount: 0
        });
      }
      const entry = customerStats.get(key);
      entry.ordersCount += 1;
      entry.totalAmount += parseFloat(order.total_amount || 0);
    });

    const topCustomers = Array.from(customerStats.values())
      .sort((a, b) => {
        if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
        return b.totalAmount - a.totalAmount;
      })
      .slice(0, 10);

    // Collect order locations
    const orderLocations = filteredOrders
      .filter(o => o.delivery_coordinates)
      .map(o => {
        const [lat, lng] = (o.delivery_coordinates || '').split(',').map(v => parseFloat(v.trim()));
        return {
          lat,
          lng,
          orderId: o.id,
          orderNumber: o.order_number,
          customerName: o.customer_name || 'Клиент',
          customerPhone: o.customer_phone || '—',
          totalAmount: parseFloat(o.total_amount || 0),
          status: o.status,
          deliveryAddress: o.delivery_address || '',
          createdAt: o.created_at
        };
      })
      .filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng));

    setAnalytics({
      revenue,
      ordersCount,
      averageCheck,
      deliveryOrdersCount,
      pickupOrdersCount,
      itemsRevenue: financialBreakdown.items,
      deliveryRevenue: financialBreakdown.delivery,
      serviceRevenue: serviceRevenueAllStatuses,
      containersRevenue: financialBreakdown.containers,
      topProducts,
      topCustomers,
      orderLocations
    });
  }, [allOrdersForAnalytics, dashboardYear, dashboardMonth]);

  const dailyOrdersAllStatuses = useMemo(() => (
    allOrdersForAnalytics.filter((order) => isOrderInDateKey(order?.created_at, dashboardDailyDate))
  ), [allOrdersForAnalytics, dashboardDailyDate]);

  const dailyDeliveredOrders = useMemo(() => (
    dailyOrdersAllStatuses.filter((order) => order.status === 'delivered')
  ), [dailyOrdersAllStatuses]);

  const dailyOrdersTimeline = useMemo(() => (
    buildDailyOrdersTimeline(dailyOrdersAllStatuses)
  ), [dailyOrdersAllStatuses]);

  const dailyAnalytics = useMemo(() => {
    const revenue = dailyDeliveredOrders.reduce((sum, order) => sum + toNumericValue(order?.total_amount, 0), 0);
    const ordersCount = dailyDeliveredOrders.length;
    const pickupOrdersCount = dailyDeliveredOrders.filter((order) => isPickupOrderForAnalytics(order)).length;
    const deliveryOrdersCount = Math.max(0, ordersCount - pickupOrdersCount);
    const averageCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;
    const financialBreakdown = calculateOrdersFinancialBreakdown(dailyDeliveredOrders);
    const serviceRevenueAllStatuses = dailyOrdersAllStatuses.reduce(
      (sum, order) => sum + Math.max(0, toNumericValue(order?.service_fee, 0)),
      0
    );

    return {
      revenue,
      ordersCount,
      averageCheck,
      pickupOrdersCount,
      deliveryOrdersCount,
      itemsRevenue: financialBreakdown.items,
      deliveryRevenue: financialBreakdown.delivery,
      serviceRevenue: serviceRevenueAllStatuses,
      containersRevenue: financialBreakdown.containers,
      totalOrdersAllStatuses: dailyOrdersAllStatuses.length,
      peakOrdersCount: dailyOrdersTimeline.maxCount,
      peakHours: dailyOrdersTimeline.peakHours
    };
  }, [dailyDeliveredOrders, dailyOrdersAllStatuses, dailyOrdersTimeline]);

  const yearlyFulfillmentStats = useMemo(() => {
    const yearOrders = allOrdersForAnalytics.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear && order.status === 'delivered';
    });
    const pickup = yearOrders.filter((order) => isPickupOrderForAnalytics(order)).length;
    const total = yearOrders.length;
    return {
      pickup,
      delivery: Math.max(0, total - pickup),
      total
    };
  }, [allOrdersForAnalytics, dashboardYear]);
  const yearlyFinancialStats = useMemo(() => {
    const yearOrders = allOrdersForAnalytics.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear && order.status === 'delivered';
    });
    const yearOrdersAllStatuses = allOrdersForAnalytics.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear;
    });
    const totals = calculateOrdersFinancialBreakdown(yearOrders);
    return {
      ...totals,
      service: yearOrdersAllStatuses.reduce(
        (sum, order) => sum + Math.max(0, toNumericValue(order?.service_fee, 0)),
        0
      )
    };
  }, [allOrdersForAnalytics, dashboardYear]);

  const monthlyPeriodOrders = useMemo(() => (
    allOrdersForAnalytics.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear &&
        orderDate.getMonth() + 1 === dashboardMonth;
    })
  ), [allOrdersForAnalytics, dashboardYear, dashboardMonth]);

  const monthlyDeliveredOrders = useMemo(() => (
    monthlyPeriodOrders.filter((order) => order.status === 'delivered')
  ), [monthlyPeriodOrders]);

  const yearlyPeriodOrders = useMemo(() => (
    allOrdersForAnalytics.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear;
    })
  ), [allOrdersForAnalytics, dashboardYear]);

  const yearlyDeliveredOrders = useMemo(() => (
    yearlyPeriodOrders.filter((order) => order.status === 'delivered')
  ), [yearlyPeriodOrders]);

  const analyticsPeriodOrders = useMemo(() => (
    analyticsPeriod === 'daily'
      ? dailyOrdersAllStatuses
      : analyticsPeriod === 'yearly'
        ? yearlyPeriodOrders
        : monthlyPeriodOrders
  ), [analyticsPeriod, dailyOrdersAllStatuses, yearlyPeriodOrders, monthlyPeriodOrders]);
  const analyticsDeliveredPeriodOrders = useMemo(() => (
    analyticsPeriod === 'daily'
      ? dailyDeliveredOrders
      : analyticsPeriod === 'yearly'
        ? yearlyDeliveredOrders
        : monthlyDeliveredOrders
  ), [analyticsPeriod, dailyDeliveredOrders, yearlyDeliveredOrders, monthlyDeliveredOrders]);

  const analyticsRatingSummary = useMemo(() => {
    let serviceSum = 0;
    let serviceCount = 0;
    let deliverySum = 0;
    let deliveryCount = 0;

    for (const order of analyticsDeliveredPeriodOrders) {
      const serviceRating = normalizeOrderRatingValue(order?.service_rating);
      const deliveryRating = normalizeOrderRatingValue(order?.delivery_rating);
      if (serviceRating > 0) {
        serviceSum += serviceRating;
        serviceCount += 1;
      }
      if (deliveryRating > 0) {
        deliverySum += deliveryRating;
        deliveryCount += 1;
      }
    }

    return {
      serviceAvg: serviceCount > 0 ? Number((serviceSum / serviceCount).toFixed(2)) : 0,
      deliveryAvg: deliveryCount > 0 ? Number((deliverySum / deliveryCount).toFixed(2)) : 0,
      serviceCount,
      deliveryCount
    };
  }, [analyticsDeliveredPeriodOrders]);

  const analyticsPaymentMethodSummary = useMemo(() => {
    const buckets = ANALYTICS_PAYMENT_METHOD_ORDER.reduce((acc, methodKey) => {
      acc[methodKey] = { count: 0, amount: 0 };
      return acc;
    }, {});

    let totalCount = 0;
    let totalAmount = 0;

    for (const order of analyticsDeliveredPeriodOrders) {
      const methodKey = normalizeAnalyticsPaymentMethod(order?.payment_method);
      if (!methodKey) continue;
      const amount = Math.max(0, toNumericValue(order?.total_amount, 0));
      buckets[methodKey].count += 1;
      buckets[methodKey].amount += amount;
      totalCount += 1;
      totalAmount += amount;
    }

    const rows = ANALYTICS_PAYMENT_METHOD_ORDER.map((methodKey) => {
      const methodMeta = ANALYTICS_PAYMENT_METHOD_META[methodKey] || {};
      const count = Number(buckets[methodKey]?.count || 0);
      const amount = Number(buckets[methodKey]?.amount || 0);
      const percent = totalCount > 0 ? (count * 100) / totalCount : 0;

      return {
        key: methodKey,
        label: language === 'uz' ? (methodMeta.labelUz || methodKey) : (methodMeta.labelRu || methodKey),
        color: methodMeta.color || '#94a3b8',
        iconType: methodMeta.iconType || 'text',
        icon: methodMeta.icon || '',
        count,
        amount,
        percent
      };
    });

    const leader = rows.reduce((best, row) => {
      if (!best || row.count > best.count) return row;
      return best;
    }, null);

    return {
      rows,
      totalCount,
      totalAmount,
      leader: leader && leader.count > 0 ? leader : null
    };
  }, [analyticsDeliveredPeriodOrders, language]);

  const analyticsFinancialExtras = useMemo(() => {
    const totals = calculateOrdersFinancialBreakdown(analyticsPeriodOrders);
    const serviceRevenue = analyticsPeriodOrders.reduce(
      (sum, order) => sum + Math.max(0, toNumericValue(order?.service_fee, 0)),
      0
    );
    return {
      serviceRevenue,
      containersRevenue: totals.containers
    };
  }, [analyticsPeriodOrders]);

  const analyticsStatusSummary = useMemo(() => {
    const counts = {
      new: 0,
      accepted: 0,
      preparing: 0,
      delivering: 0,
      delivered: 0,
      cancelled: 0
    };

    for (const order of analyticsPeriodOrders) {
      const normalizedStatus = normalizeOrderStatusForAnalytics(order?.status);
      const isAcceptedInNewState = normalizedStatus === 'new' && (
        hasOrderAcceptedActionForAnalytics(order) ||
        Boolean(order?.is_paid) ||
        String(order?.payment_status || '').trim().toLowerCase() === 'paid'
      );

      if (normalizedStatus === 'new') {
        if (isAcceptedInNewState) counts.accepted += 1;
        else counts.new += 1;
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(counts, normalizedStatus)) {
        counts[normalizedStatus] += 1;
      }
    }

    return counts;
  }, [analyticsPeriodOrders]);

  const dailyTopProducts = useMemo(() => buildTopProductsAnalytics(dailyDeliveredOrders), [dailyDeliveredOrders]);
  const dailyTopCustomers = useMemo(() => buildTopCustomersAnalytics(dailyDeliveredOrders), [dailyDeliveredOrders]);
  const dailyOrderLocations = useMemo(() => buildOrderLocationsAnalytics(dailyDeliveredOrders), [dailyDeliveredOrders]);
  const dailyRevenueTimeline = useMemo(() => (
    buildHourlyMetricTimeline(dailyDeliveredOrders, (order) => order?.total_amount)
  ), [dailyDeliveredOrders]);
  const dailyOrdersCountTimeline = useMemo(() => (
    buildHourlyMetricTimeline(dailyOrdersAllStatuses, () => 1)
  ), [dailyOrdersAllStatuses]);

  const monthlyRevenueTimeline = useMemo(() => (
    buildMonthDayMetricTimeline(monthlyDeliveredOrders, dashboardYear, dashboardMonth, (order) => order?.total_amount)
  ), [monthlyDeliveredOrders, dashboardYear, dashboardMonth]);
  const monthlyOrdersCountTimeline = useMemo(() => (
    buildMonthDayMetricTimeline(monthlyPeriodOrders, dashboardYear, dashboardMonth, () => 1)
  ), [monthlyPeriodOrders, dashboardYear, dashboardMonth]);

  const yearlyTopProducts = useMemo(() => buildTopProductsAnalytics(yearlyDeliveredOrders), [yearlyDeliveredOrders]);
  const yearlyTopCustomers = useMemo(() => buildTopCustomersAnalytics(yearlyDeliveredOrders), [yearlyDeliveredOrders]);
  const yearlyOrderLocations = useMemo(() => buildOrderLocationsAnalytics(yearlyDeliveredOrders), [yearlyDeliveredOrders]);
  const yearlyRevenueTimeline = useMemo(() => (
    (yearlyAnalytics.monthlyData || []).map((item, index) => ({
      label: String(index + 1),
      value: toNumericValue(item?.revenue, 0)
    }))
  ), [yearlyAnalytics.monthlyData]);
  const yearlyOrdersCountTimeline = useMemo(() => (
    (yearlyAnalytics.monthlyData || []).map((item, index) => ({
      label: String(index + 1),
      value: toNumericValue(item?.orders_count, 0)
    }))
  ), [yearlyAnalytics.monthlyData]);

  const openAnalyticsLocationDetails = (location) => {
    if (!location) return;
    setSelectedAnalyticsLocation(location);
    setAnalyticsMapSelectionLocked(true);
  };

  const monthlyAnalyticsLocationsList = useMemo(() => (
    [...(analytics.orderLocations || [])].sort((a, b) => (
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    ))
  ), [analytics.orderLocations]);
  const analyticsLocationsList = monthlyAnalyticsLocationsList;

  const activeAnalyticsLocationsList = useMemo(() => {
    const source = analyticsPeriod === 'daily'
      ? dailyOrderLocations
      : analyticsPeriod === 'yearly'
        ? yearlyOrderLocations
        : monthlyAnalyticsLocationsList;

    return [...source].sort((a, b) => (
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    ));
  }, [analyticsPeriod, dailyOrderLocations, yearlyOrderLocations, monthlyAnalyticsLocationsList]);

  const analyticsShopLocation = useMemo(() => {
    const parseCoordinate = (value, min, max) => {
      const numeric = Number.parseFloat(String(value ?? '').replace(',', '.'));
      return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
    };

    const lat = parseCoordinate(
      restaurantSettings?.latitude
      ?? billingInfo?.restaurant?.latitude
      ?? user?.active_restaurant_latitude
      ?? user?.active_restaurant_lat
      ?? user?.restaurant_latitude
      ?? user?.restaurant_lat,
      -90,
      90
    );
    const lng = parseCoordinate(
      restaurantSettings?.longitude
      ?? billingInfo?.restaurant?.longitude
      ?? user?.active_restaurant_longitude
      ?? user?.active_restaurant_lng
      ?? user?.restaurant_longitude
      ?? user?.restaurant_lng,
      -180,
      180
    );

    if (lat === null || lng === null) return null;
    return { lat, lng };
  }, [
    restaurantSettings?.latitude,
    restaurantSettings?.longitude,
    billingInfo?.restaurant?.latitude,
    billingInfo?.restaurant?.longitude,
    user?.active_restaurant_latitude,
    user?.active_restaurant_lat,
    user?.active_restaurant_longitude,
    user?.active_restaurant_lng,
    user?.restaurant_latitude,
    user?.restaurant_lat,
    user?.restaurant_longitude,
    user?.restaurant_lng
  ]);

  const activeAnalyticsMapPoints = useMemo(() => (
    analyticsShopLocation
      ? [...activeAnalyticsLocationsList, analyticsShopLocation]
      : activeAnalyticsLocationsList
  ), [activeAnalyticsLocationsList, analyticsShopLocation]);

  const monthlyAnalyticsMapPoints = useMemo(() => (
    analyticsShopLocation
      ? [...(analytics.orderLocations || []), analyticsShopLocation]
      : (analytics.orderLocations || [])
  ), [analytics.orderLocations, analyticsShopLocation]);

  useEffect(() => {
    if (!activeAnalyticsLocationsList.length) {
      if (selectedAnalyticsLocation) setSelectedAnalyticsLocation(null);
      setAnalyticsMapSelectionLocked(false);
      return;
    }
    if (!selectedAnalyticsLocation) {
      setSelectedAnalyticsLocation(activeAnalyticsLocationsList[0]);
      setAnalyticsMapSelectionLocked(false);
      return;
    }
    const exists = activeAnalyticsLocationsList.some((location) => location.orderId === selectedAnalyticsLocation.orderId);
    if (!exists) {
      setSelectedAnalyticsLocation(activeAnalyticsLocationsList[0]);
      setAnalyticsMapSelectionLocked(false);
    }
  }, [activeAnalyticsLocationsList, selectedAnalyticsLocation]);

  useEffect(() => {
    if (!selectedAnalyticsLocation) return;
    const selectedKey = getAnalyticsLocationKey(selectedAnalyticsLocation);
    if (!selectedKey) return;
    if (!showAnalyticsMapModal) return;
    const scrollOptions = { behavior: 'smooth', block: 'nearest', inline: 'nearest' };
    const fullscreenListTarget = analyticsFullscreenListItemRefs.current.get(selectedKey);
    if (fullscreenListTarget) {
      fullscreenListTarget.scrollIntoView(scrollOptions);
    }
  }, [selectedAnalyticsLocation, showAnalyticsMapModal]);

  // Fetch yearly analytics
  const fetchYearlyAnalytics = async (year) => {
    setLoadingYearlyAnalytics(true);
    try {
      const response = await axios.get(`${API_URL}/admin/analytics/yearly?year=${year}`, {
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      setYearlyAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching yearly analytics:', error);
    } finally {
      setLoadingYearlyAnalytics(false);
    }
  };

  const buildProductReviewAnalyticsParams = useCallback(() => {
    const params = {
      period: analyticsPeriod,
      year: dashboardYear
    };
    if (analyticsPeriod === 'daily') {
      params.date = dashboardDailyDate;
    } else if (analyticsPeriod === 'monthly') {
      params.month = dashboardMonth;
    }
    return params;
  }, [analyticsPeriod, dashboardYear, dashboardMonth, dashboardDailyDate]);

  const fetchAnalyticsProductReviews = useCallback(async () => {
    if (!user?.active_restaurant_id) {
      setAnalyticsProductReviews(createEmptyProductReviewAnalytics());
      return;
    }

    setLoadingAnalyticsProductReviews(true);
    try {
      const response = await axios.get(`${API_URL}/admin/analytics/product-reviews`, {
        params: buildProductReviewAnalyticsParams(),
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      const payload = response.data || {};
      setAnalyticsProductReviews({
        ...createEmptyProductReviewAnalytics(),
        ...payload,
        summary: {
          ...createEmptyProductReviewAnalytics().summary,
          ...(payload.summary || {})
        },
        latestComments: Array.isArray(payload.latestComments) ? payload.latestComments : [],
        topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : []
      });
    } catch (error) {
      console.error('Error fetching product review analytics:', error);
      setAnalyticsProductReviews(createEmptyProductReviewAnalytics());
    } finally {
      setLoadingAnalyticsProductReviews(false);
    }
  }, [user?.active_restaurant_id, buildProductReviewAnalyticsParams]);

  useEffect(() => {
    if (mainTab === 'dashboard' && user?.active_restaurant_id) {
      fetchYearlyAnalytics(dashboardYear);
    }
  }, [dashboardYear, user?.active_restaurant_id, mainTab]);

  useEffect(() => {
    if (mainTab !== 'dashboard') return;
    fetchAnalyticsProductReviews();
  }, [mainTab, fetchAnalyticsProductReviews]);

  useEffect(() => {
    const instructionId = Number.parseInt(selectedHelpInstruction?.id, 10);
    const youtubeUrl = String(selectedHelpInstruction?.youtube_url || '').trim();

    if (!Number.isFinite(instructionId) || instructionId <= 0 || !youtubeUrl) {
      lastTrackedHelpInstructionIdRef.current = null;
      return;
    }

    if (lastTrackedHelpInstructionIdRef.current === instructionId) return;
    lastTrackedHelpInstructionIdRef.current = instructionId;
    incrementHelpInstructionViews(instructionId);
  }, [selectedHelpInstruction?.id, selectedHelpInstruction?.youtube_url]);

  useEffect(() => {
    if (!user?.active_restaurant_id) {
      // No active restaurant yet -> avoid periodic requests (e.g. /admin/containers)
      setLoading(false);
      return;
    }

    const runFetchByTab = () => {
      if (mainTab === 'orders') {
        fetchData({
          includeOrders: true,
          includeAllOrders: false,
          includeProducts: false,
          includeCategories: false,
          includeContainers: false,
          includeFeedbackStats: false
        });
        return;
      }
      if (mainTab === 'dashboard') {
        fetchData({
          includeOrders: true,
          includeAllOrders: true,
          includeProducts: false,
          includeCategories: false,
          includeContainers: false,
          includeFeedbackStats: true
        });
        return;
      }
      if (mainTab === 'products') {
        fetchData({
          includeOrders: false,
          includeAllOrders: false,
          includeProducts: true,
          includeCategories: true,
          includeContainers: true,
          includeFeedbackStats: false
        });
        return;
      }
      if (mainTab === 'containers') {
        fetchData({
          includeOrders: false,
          includeAllOrders: false,
          includeProducts: false,
          includeCategories: false,
          includeContainers: true,
          includeFeedbackStats: false
        });
        return;
      }

      // Tabs like settings/showcase/feedback/clients/help/printers do not require
      // the initial blocking loader; otherwise skeleton can stay forever.
      setLoading(false);
    };

    runFetchByTab();

    let interval = null;
    if (mainTab === 'orders') {
      interval = setInterval(() => {
        fetchData({
          includeOrders: true,
          includeAllOrders: false,
          includeProducts: false,
          includeCategories: false,
          includeContainers: false,
          includeFeedbackStats: false
        });
      }, 12000);
    } else if (mainTab === 'dashboard') {
      interval = setInterval(() => {
        fetchData({
          includeOrders: true,
          includeAllOrders: true,
          includeProducts: false,
          includeCategories: false,
          includeContainers: false,
          includeFeedbackStats: true
        });
      }, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [effectiveOrdersStatusFilter, user?.active_restaurant_id, mainTab]);

  useEffect(() => {
    if (!loading) {
      if (loadingGuardTriggered) setLoadingGuardTriggered(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingGuardTriggered(true);
      setLoading(false);
      setAlertMessage((prev) => {
        if (prev?.type && String(prev?.text || '').trim()) return prev;
        return {
          type: 'warning',
          text: language === 'uz'
            ? "Ma'lumotlar yuklanishi kechikdi. Oyna ochildi, kerakli bo'limni qayta tanlang."
            : 'Загрузка данных задержалась. Панель открыта, выберите нужный раздел ещё раз.'
        };
      });
    }, ADMIN_DASHBOARD_LOADING_GUARD_MS);

    return () => clearTimeout(timer);
  }, [loading, loadingGuardTriggered, language]);

  useEffect(() => {
    if (mainTab === 'feedback' && user?.active_restaurant_id) {
      fetchFeedback();
    }
  }, [feedbackFilter, user?.active_restaurant_id, mainTab]);

  useEffect(() => {
    if (mainTab !== 'clients' || !user?.active_restaurant_id) return;
    fetchCustomers();
  }, [mainTab, user?.active_restaurant_id, customerSearch, customerStatusFilter, customerPage, customerLimit]);

  useEffect(() => {
    if (ordersViewMode === 'kanban' && statusFilter !== 'all') {
      setStatusFilter('all');
    }
  }, [ordersViewMode, statusFilter]);

  useEffect(() => {
    if (mainTab !== 'orders' || ordersViewMode !== 'kanban') return;
    setKanbanTimingNowMs(Date.now());
    const intervalId = setInterval(() => {
      setKanbanTimingNowMs(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [mainTab, ordersViewMode]);

  useEffect(() => {
    setOrdersPage(1);
  }, [statusFilter, ordersDateFrom, ordersDateTo, ordersViewMode]);

  useEffect(() => () => {
    Object.values(kanbanScrollTimeoutsRef.current).forEach((timerId) => clearTimeout(timerId));
    kanbanScrollTimeoutsRef.current = {};
  }, []);

  useEffect(() => () => {
    if (variantsTableScrollHideTimeoutRef.current) {
      clearTimeout(variantsTableScrollHideTimeoutRef.current);
      variantsTableScrollHideTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'superadmin') return undefined;

    const onKeyDown = (event) => {
      const target = event.target;
      const tagName = String(target?.tagName || '').toLowerCase();
      const isTypingField = target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
      const isCtrlSpaceHotkey = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey
        && (event.code === 'Space' || event.key === ' ');
      if (!isCtrlSpaceHotkey || isTypingField) return;

      event.preventDefault();
      navigate('/superadmin');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, user?.role]);
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tagName = String(target?.tagName || '').toLowerCase();
      const isTypingField = target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
      const isCtrlArrowHotkey = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey
        && (event.key === 'ArrowRight' || event.key === 'ArrowLeft');
      if (!isCtrlArrowHotkey || isTypingField) return;

      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      setMainTab((prevTab) => {
        if (!operatorHotkeyTabOrder.length) return prevTab;
        const currentIndex = operatorHotkeyTabOrder.indexOf(prevTab);
        if (currentIndex === -1) return operatorHotkeyTabOrder[0];
        const nextIndex = (currentIndex + direction + operatorHotkeyTabOrder.length) % operatorHotkeyTabOrder.length;
        return operatorHotkeyTabOrder[nextIndex];
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [operatorHotkeyTabOrder]);

  useEffect(() => {
    setProductsPage(1);
  }, [productSearch, productCategoryFilter, productSubcategoryFilter, productThirdCategoryFilter, productStatusFilter]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 991.98px)');
    const syncLayoutMode = () => {
      const isMobile = Boolean(mediaQuery.matches);
      setIsProductImagesMobileLayout(isMobile);
      setVisibleProductImageSlotsCount((prev) => (
        isMobile ? clampProductVisibleSlotsCount(prev) : PRODUCT_IMAGE_SLOTS_COUNT
      ));
    };
    syncLayoutMode();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncLayoutMode);
      return () => mediaQuery.removeEventListener('change', syncLayoutMode);
    }
    mediaQuery.addListener(syncLayoutMode);
    return () => mediaQuery.removeListener(syncLayoutMode);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('quickAddProduct') !== '1') return;

    setMainTab('products');
    openProductModal();

    params.delete('quickAddProduct');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

  useEffect(() => {
    if (user?.active_restaurant_id) {
      fetchRestaurantSettings();
    }
  }, [user?.active_restaurant_id]);

  useEffect(() => {
    if (mainTab === 'settings' && user?.active_restaurant_id) {
      fetchOperators();
      fetchBillingInfo();
    }
  }, [user?.active_restaurant_id, mainTab]);
  useEffect(() => {
    if (user?.active_restaurant_currency_code) {
      setCountryCurrency(user.active_restaurant_currency_code);
    }
  }, [user?.active_restaurant_currency_code, setCountryCurrency]);

  useEffect(() => {
    if (mainTab !== 'help' || !user?.active_restaurant_id) return;
    fetchHelpInstructions();
  }, [mainTab, user?.active_restaurant_id]);

  useEffect(() => {
    if (!isReservationModuleEnabled && mainTab === 'reservations') {
      setMainTab('dashboard');
    }
  }, [isReservationModuleEnabled, mainTab]);

  const categoryById = useMemo(() => {
    const map = new Map();
    categories.forEach((cat) => map.set(Number(cat.id), cat));
    return map;
  }, [categories]);

  const categoryHierarchyById = useMemo(() => {
    const cache = new Map();
    const buildHierarchy = (categoryId) => {
      const normalizedId = Number(categoryId);
      if (!Number.isFinite(normalizedId)) return [];
      if (cache.has(normalizedId)) return cache.get(normalizedId);

      const hierarchy = [];
      const visited = new Set();
      let current = categoryById.get(normalizedId);

      while (current && !visited.has(current.id)) {
        hierarchy.unshift(current);
        visited.add(current.id);
        if (!current.parent_id) break;
        current = categoryById.get(Number(current.parent_id));
      }

      cache.set(normalizedId, hierarchy);
      return hierarchy;
    };

    categories.forEach((cat) => {
      buildHierarchy(cat.id);
    });

    return cache;
  }, [categories, categoryById]);

  const categoryPathById = useMemo(() => {
    const result = new Map();
    categories.forEach((cat) => {
      const hierarchy = categoryHierarchyById.get(Number(cat.id)) || [];
      const path = hierarchy.map((entry) => entry.name_ru || '').join(' > ').trim();
      result.set(String(cat.id), path);
    });
    return result;
  }, [categories, categoryHierarchyById]);

  const rootCategoryOptions = useMemo(() => (
    categories.filter((cat) => cat.parent_id === null)
  ), [categories]);

  const importAssignableCategories = useMemo(() => (
    categories
      .filter((cat) => cat.parent_id !== null)
      .map((cat) => ({
        id: cat.id,
        name_ru: cat.name_ru || '',
        path: categoryPathById.get(String(cat.id)) || (cat.name_ru || '')
      }))
      .sort((a, b) => a.path.localeCompare(b.path, 'ru'))
  ), [categories, categoryPathById]);

  const importCategoryById = useMemo(() => {
    const map = new Map();
    importAssignableCategories.forEach((cat) => {
      map.set(String(cat.id), cat);
    });
    return map;
  }, [importAssignableCategories]);

  const importCategoryByPath = useMemo(() => {
    const map = new Map();
    importAssignableCategories.forEach((cat) => {
      map.set(cat.path.trim().toLowerCase(), cat);
    });
    return map;
  }, [importAssignableCategories]);

  const importCategoryByUniqueName = useMemo(() => {
    const counts = new Map();
    importAssignableCategories.forEach((cat) => {
      const key = cat.name_ru.trim().toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const uniqueMap = new Map();
    importAssignableCategories.forEach((cat) => {
      const key = cat.name_ru.trim().toLowerCase();
      if ((counts.get(key) || 0) === 1) {
        uniqueMap.set(key, cat);
      }
    });
    return uniqueMap;
  }, [importAssignableCategories]);

  const globalImportCatalogById = useMemo(() => {
    const map = new Map();
    (globalCatalogProducts || []).forEach((item) => {
      map.set(Number(item.id), item);
    });
    return map;
  }, [globalCatalogProducts]);

  const globalImportItemIdsSet = useMemo(() => (
    new Set((globalImportItems || []).map((item) => Number(item.global_product_id)))
  ), [globalImportItems]);

  const productSubcategoryOptions = useMemo(() => {
    const rootId = parseInt(productCategoryFilter, 10);
    const source = categories.filter((cat) => {
      const hierarchy = categoryHierarchyById.get(Number(cat.id)) || [];
      if (hierarchy.length !== 2) return false;
      if (productCategoryFilter === 'all' || Number.isNaN(rootId)) return true;
      return hierarchy[0]?.id === rootId;
    });

    return [...source].sort((a, b) => {
      const orderA = Number.isFinite(a.sort_order) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(b.sort_order) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru');
    });
  }, [categories, categoryHierarchyById, productCategoryFilter]);

  const productThirdCategoryOptions = useMemo(() => {
    const rootId = parseInt(productCategoryFilter, 10);
    const level2Id = parseInt(productSubcategoryFilter, 10);
    const source = categories.filter((cat) => {
      const hierarchy = categoryHierarchyById.get(Number(cat.id)) || [];
      if (hierarchy.length !== 3) return false;
      if (productSubcategoryFilter !== 'all' && !Number.isNaN(level2Id)) {
        return hierarchy[1]?.id === level2Id;
      }
      if (productCategoryFilter !== 'all' && !Number.isNaN(rootId)) {
        return hierarchy[0]?.id === rootId;
      }
      return true;
    });

    return [...source].sort((a, b) => {
      const orderA = Number.isFinite(a.sort_order) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(b.sort_order) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru');
    });
  }, [categories, categoryHierarchyById, productCategoryFilter, productSubcategoryFilter]);

  const formatCategoryWithSort = (category) => {
    if (!category) return '-';
    const sortLabel = category.sort_order === null || category.sort_order === undefined ? '-' : category.sort_order;
    return `[${sortLabel}] ${category.name_ru || ''}`.trim();
  };

  const filteredProductsForTable = useMemo(() => (
    products
      .filter((product) => {
        if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) return false;
        const hierarchy = categoryHierarchyById.get(Number(product.category_id)) || [];
        if (productCategoryFilter !== 'all') {
          const rootId = parseInt(productCategoryFilter, 10);
          if (Number.isNaN(rootId) || hierarchy[0]?.id !== rootId) return false;
        }
        if (productSubcategoryFilter !== 'all') {
          const level2Id = parseInt(productSubcategoryFilter, 10);
          if (Number.isNaN(level2Id) || hierarchy[1]?.id !== level2Id) return false;
        }
        if (productThirdCategoryFilter !== 'all') {
          const level3Id = parseInt(productThirdCategoryFilter, 10);
          if (Number.isNaN(level3Id) || hierarchy[2]?.id !== level3Id) return false;
        }
        if (productStatusFilter === 'active' && !product.in_stock) return false;
        if (productStatusFilter === 'hidden' && product.in_stock) return false;
        return true;
      })
      .sort((left, right) => {
        const leftHierarchy = categoryHierarchyById.get(Number(left.category_id)) || [];
        const rightHierarchy = categoryHierarchyById.get(Number(right.category_id)) || [];

        for (let levelIndex = 0; levelIndex < 3; levelIndex += 1) {
          const leftCategory = leftHierarchy[levelIndex] || null;
          const rightCategory = rightHierarchy[levelIndex] || null;
          const leftOrder = leftCategory && Number.isFinite(Number(leftCategory.sort_order))
            ? Number(leftCategory.sort_order)
            : Number.MAX_SAFE_INTEGER;
          const rightOrder = rightCategory && Number.isFinite(Number(rightCategory.sort_order))
            ? Number(rightCategory.sort_order)
            : Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;

          const leftName = String(leftCategory?.name_ru || '');
          const rightName = String(rightCategory?.name_ru || '');
          const nameDiff = leftName.localeCompare(rightName, 'ru');
          if (nameDiff !== 0) return nameDiff;
        }

        const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER;
        const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER;
        if (leftSort !== rightSort) return leftSort - rightSort;

        return String(left.name_ru || '').localeCompare(String(right.name_ru || ''), 'ru');
      })
  ), [products, categoryHierarchyById, productSearch, productCategoryFilter, productSubcategoryFilter, productThirdCategoryFilter, productStatusFilter]);

  const dateFilteredOrders = useMemo(() => (
    orders.filter((order) => isOrderWithinDateRange(order, ordersDateFrom, ordersDateTo))
  ), [orders, ordersDateFrom, ordersDateTo]);

  const dateFilteredOrdersForStatusCounts = useMemo(() => (
    allOrdersForAnalytics.filter((order) => isOrderWithinDateRange(order, ordersDateFrom, ordersDateTo))
  ), [allOrdersForAnalytics, ordersDateFrom, ordersDateTo]);

  const visibleOrderStatusCounts = useMemo(() => (
    buildOrderStatusCounts(dateFilteredOrdersForStatusCounts)
  ), [dateFilteredOrdersForStatusCounts]);

  const pagedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ordersLimit;
    return dateFilteredOrders.slice(start, start + ordersLimit);
  }, [dateFilteredOrders, ordersPage, ordersLimit]);

  const kanbanColumns = useMemo(() => (
    orderStatusPillItems.filter((item) => item.value !== 'all')
  ), [orderStatusPillItems]);

  const getOrderDeliveryTimingType = useCallback((order) => {
    const normalizedTime = String(order?.delivery_time || '').trim().toLowerCase();
    const hasScheduledTime = Boolean(normalizedTime && normalizedTime !== 'asap');
    return hasScheduledTime ? 'scheduled' : 'asap';
  }, []);

  const getOrderScheduledDeliveryMs = useCallback((order) => {
    const normalizedTime = String(order?.delivery_time || '').trim().toLowerCase();
    if (!normalizedTime || normalizedTime === 'asap') return null;
    const hhmm = normalizedTime.match(/^(\d{1,2}):(\d{2})/);
    if (!hhmm) return null;
    const hours = Number.parseInt(hhmm[1], 10);
    const minutes = Number.parseInt(hhmm[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

    const dateRaw = String(order?.delivery_date || '').trim();
    let baseDate = null;
    if (dateRaw) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
        const [year, month, day] = dateRaw.split('-').map((part) => Number.parseInt(part, 10));
        baseDate = new Date(year, (month || 1) - 1, day || 1);
      } else {
        const parsedDate = new Date(dateRaw);
        if (!Number.isNaN(parsedDate.getTime())) baseDate = parsedDate;
      }
    }
    if (!baseDate) {
      const createdAt = new Date(order?.created_at || Date.now());
      baseDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
    }

    baseDate.setHours(hours, minutes, 0, 0);
    const timestamp = baseDate.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }, []);

  const applyKanbanColumnFiltersAndSort = useCallback((ordersForColumn = [], columnValue = '') => {
    const config = getKanbanColumnFilter(columnValue);
    const filtered = ordersForColumn.filter((order) => {
      const isPickup = isPickupOrderForAnalytics(order);
      if (config.fulfillment === 'pickup' && !isPickup) return false;
      if (config.fulfillment === 'delivery' && isPickup) return false;
      if (config.timing !== 'all' && getOrderDeliveryTimingType(order) !== config.timing) return false;
      return true;
    });

    filtered.sort((orderA, orderB) => {
      if (config.scheduleSort !== 'none') {
        const aMs = getOrderScheduledDeliveryMs(orderA);
        const bMs = getOrderScheduledDeliveryMs(orderB);
        if (aMs === null && bMs === null) return 0;
        if (aMs === null) return 1;
        if (bMs === null) return -1;
        return config.scheduleSort === 'asc' ? aMs - bMs : bMs - aMs;
      }

      const statusA = getOrderDisplayWorkflowStatus(orderA);
      const statusB = getOrderDisplayWorkflowStatus(orderB);
      const aSeconds = Number(getOrderWorkflowTiming(orderA, statusA)?.statusSeconds || 0);
      const bSeconds = Number(getOrderWorkflowTiming(orderB, statusB)?.statusSeconds || 0);
      return config.sortDirection === 'asc' ? aSeconds - bSeconds : bSeconds - aSeconds;
    });

    return filtered;
  }, [getKanbanColumnFilter, getOrderDeliveryTimingType, getOrderScheduledDeliveryMs]);

  const kanbanOrdersByStatus = useMemo(() => {
    const grouped = {};
    kanbanColumns.forEach((column) => {
      grouped[column.value] = [];
    });

    dateFilteredOrders.forEach((order) => {
      const normalizedStatus = order?.status === 'in_progress' ? 'preparing' : order?.status;
      if (grouped[normalizedStatus]) {
        grouped[normalizedStatus].push(order);
      }
    });

    kanbanColumns.forEach((column) => {
      grouped[column.value] = applyKanbanColumnFiltersAndSort(grouped[column.value], column.value);
    });

    return grouped;
  }, [dateFilteredOrders, kanbanColumns, applyKanbanColumnFiltersAndSort, kanbanTimingNowMs]);

  useEffect(() => {
    if (!Array.isArray(kanbanColumns) || kanbanColumns.length === 0) return;
    setKanbanColumnFilters((prev) => {
      let changed = false;
      const next = { ...prev };
      kanbanColumns.forEach((column) => {
        if (!next[column.value]) {
          next[column.value] = { ...KANBAN_COLUMN_FILTER_DEFAULT };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [kanbanColumns]);

  const pagedProducts = useMemo(() => {
    const start = (productsPage - 1) * productsLimit;
    return filteredProductsForTable.slice(start, start + productsLimit);
  }, [filteredProductsForTable, productsPage, productsLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(dateFilteredOrders.length / ordersLimit));
    if (ordersPage > totalPages) setOrdersPage(totalPages);
  }, [dateFilteredOrders.length, ordersLimit, ordersPage]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredProductsForTable.length / productsLimit));
    if (productsPage > totalPages) setProductsPage(totalPages);
  }, [filteredProductsForTable.length, productsLimit, productsPage]);

  useEffect(() => {
    if (!restaurantSettings) return;

    if (!isRestaurantBotTokenChanged) {
      tokenCountdownArmedRef.current = false;
      setTokenSaveCountdown(0);
      return;
    }

    if (!tokenCountdownArmedRef.current) {
      tokenCountdownArmedRef.current = true;
      setTokenSaveCountdown(5);
    }
  }, [restaurantSettings, isRestaurantBotTokenChanged]);

  useEffect(() => {
    if (tokenSaveCountdown <= 0) return;
    const timer = setTimeout(() => {
      setTokenSaveCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [tokenSaveCountdown]);

  useEffect(() => {
    const rawToken = restaurantSettings?.telegram_bot_token || '';
    const token = rawToken.trim();

    if (!restaurantSettings) return;

    if (!token) {
      setTestedBotInfo(null);
      setBotProfileLookupError('');
      setBotProfileLookupLoading(false);
      return;
    }

    // Avoid noisy validation errors while the user is still typing a partial token.
    if (!token.includes(':') || token.length < 20) {
      setTestedBotInfo(null);
      setBotProfileLookupError('');
      setBotProfileLookupLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setBotProfileLookupLoading(true);
      try {
        const response = await axios.post(`${API_URL}/admin/test-bot`, {
          botToken: token,
          profileOnly: true
        });
        if (cancelled) return;
        setTestedBotInfo(response.data?.bot || null);
        setBotProfileLookupError('');
      } catch (error) {
        if (cancelled) return;
        setTestedBotInfo(null);
        setBotProfileLookupError(error.response?.data?.error || 'Ошибка получения данных бота');
      } finally {
        if (!cancelled) setBotProfileLookupLoading(false);
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restaurantSettings?.telegram_bot_token]);

  const applyCategoriesData = (categoriesData = []) => {
    // Calculate full category paths locally and sort correctly
    const getCategoryPath = (cat) => {
      const getSortDisplay = (c) => `[${c.sort_order !== null && c.sort_order !== undefined ? c.sort_order : '-'}] `;
      let path = getSortDisplay(cat) + cat.name_ru;
      let current = cat;
      while (current.parent_id) {
        const parent = categoriesData.find(c => c.id === current.parent_id);
        if (parent) {
          path = `${getSortDisplay(parent)}${parent.name_ru} > ${path}`;
          current = parent;
        } else {
          break;
        }
      }
      return path;
    };

    // To sort correctly by hierarchy and sort_order, we build a sort_path
    const getCategorySortPath = (cat) => {
      const getSortVal = (c) => (c.sort_order === null || c.sort_order === undefined) ? 9999 : c.sort_order;
      let path = [String(getSortVal(cat)).padStart(5, '0') + cat.name_ru];
      let current = cat;
      while (current.parent_id) {
        const parent = categoriesData.find(c => c.id === current.parent_id);
        if (parent) {
          path.unshift(String(getSortVal(parent)).padStart(5, '0') + parent.name_ru);
          current = parent;
        } else {
          break;
        }
      }
      return path.join(' > ');
    };

    const enrichedCategories = categoriesData.map(c => ({
      ...c,
      full_path: getCategoryPath(c),
      sort_key: getCategorySortPath(c)
    })).sort((a, b) => a.sort_key.localeCompare(b.sort_key, 'ru'));

    setCategories(enrichedCategories);
  };

  const loadCategoriesForProducts = async () => {
    const response = await axios.get(`${API_URL}/admin/categories`);
    applyCategoriesData(response.data || []);
  };

  const getCategoryImageSortValue = useCallback((category) => (
    category?.sort_order === null || category?.sort_order === undefined
      ? 999999
      : Number(category.sort_order)
  ), []);

  const getLocalizedCategoryTitle = useCallback((category) => (
    language === 'uz'
      ? (category?.name_uz || category?.name_ru || '')
      : (category?.name_ru || category?.name_uz || '')
  ), [language]);

  const categoryImageCategoriesById = useMemo(() => {
    const map = new Map();
    (categoryImageCategories || []).forEach((category) => {
      const id = Number.parseInt(category?.id, 10);
      if (Number.isInteger(id) && id > 0) {
        map.set(id, category);
      }
    });
    return map;
  }, [categoryImageCategories]);

  const categoryImageChildrenByParent = useMemo(() => {
    const map = new Map();
    (categoryImageCategories || []).forEach((category) => {
      const parentId = normalizeId(category?.parent_id);
      if (!map.has(parentId)) {
        map.set(parentId, []);
      }
      map.get(parentId).push(category);
    });
    for (const list of map.values()) {
      list.sort((a, b) => {
        const orderDiff = getCategoryImageSortValue(a) - getCategoryImageSortValue(b);
        if (orderDiff !== 0) return orderDiff;
        return getLocalizedCategoryTitle(a).localeCompare(getLocalizedCategoryTitle(b), language === 'uz' ? 'uz' : 'ru');
      });
    }
    return map;
  }, [categoryImageCategories, getCategoryImageSortValue, getLocalizedCategoryTitle, language]);

  const categoryImageLevel1List = useMemo(
    () => categoryImageChildrenByParent.get(null) || [],
    [categoryImageChildrenByParent]
  );

  const selectedCategoryImageLevel1 = useMemo(() => {
    const selectedId = normalizeId(categoryImageLevels[0]);
    return (categoryImageLevel1List || []).find((item) => normalizeId(item?.id) === selectedId) || null;
  }, [categoryImageLevels, categoryImageLevel1List]);

  const categoryImageLevel2List = useMemo(() => {
    const parentId = normalizeId(selectedCategoryImageLevel1?.id);
    if (!parentId) return [];
    return categoryImageChildrenByParent.get(parentId) || [];
  }, [categoryImageChildrenByParent, selectedCategoryImageLevel1]);

  const selectedCategoryImageLevel2 = useMemo(() => {
    const selectedId = normalizeId(categoryImageLevels[1]);
    return (categoryImageLevel2List || []).find((item) => normalizeId(item?.id) === selectedId) || null;
  }, [categoryImageLevels, categoryImageLevel2List]);

  const categoryImageLevel3List = useMemo(() => {
    const parentId = normalizeId(selectedCategoryImageLevel2?.id);
    if (!parentId) return [];
    return categoryImageChildrenByParent.get(parentId) || [];
  }, [categoryImageChildrenByParent, selectedCategoryImageLevel2]);

  const selectedCategoryImageLevel3 = useMemo(() => {
    const selectedId = normalizeId(categoryImageLevels[2]);
    return (categoryImageLevel3List || []).find((item) => normalizeId(item?.id) === selectedId) || null;
  }, [categoryImageLevels, categoryImageLevel3List]);

  const selectedCategoryImageCategory = selectedCategoryImageLevel3
    || selectedCategoryImageLevel2
    || selectedCategoryImageLevel1
    || null;

  const loadCategoryImageCategories = useCallback(async () => {
    try {
      setLoadingCategoryImageCategories(true);
      const response = await axios.get(`${API_URL}/admin/categories/used`);
      const nextCategories = Array.isArray(response.data) ? response.data : [];
      setCategoryImageCategories(nextCategories);
      setCategoryImageLevels((prev) => {
        const validIds = new Set(
          nextCategories
            .map((item) => normalizeId(item?.id))
            .filter((id) => Number.isInteger(id) && id > 0)
        );
        const normalized = [
          validIds.has(normalizeId(prev?.[0])) ? normalizeId(prev?.[0]) : null,
          validIds.has(normalizeId(prev?.[1])) ? normalizeId(prev?.[1]) : null,
          validIds.has(normalizeId(prev?.[2])) ? normalizeId(prev?.[2]) : null
        ];
        if (!normalized[0]) {
          const firstRoot = nextCategories
            .filter((item) => normalizeId(item?.parent_id) === null)
            .sort((a, b) => {
              const orderDiff = getCategoryImageSortValue(a) - getCategoryImageSortValue(b);
              if (orderDiff !== 0) return orderDiff;
              return getLocalizedCategoryTitle(a).localeCompare(getLocalizedCategoryTitle(b), language === 'uz' ? 'uz' : 'ru');
            })[0];
          normalized[0] = normalizeId(firstRoot?.id);
        }
        return normalized;
      });
    } catch (error) {
      console.error('Load category images categories error:', error);
      setAlertMessage({
        type: 'danger',
        text: error.response?.data?.error || 'Ошибка загрузки категорий магазина'
      });
    } finally {
      setLoadingCategoryImageCategories(false);
    }
  }, [getCategoryImageSortValue, getLocalizedCategoryTitle, language]);

  const selectCategoryImageLevel = useCallback((levelIndex, category) => {
    const selectedId = normalizeId(category?.id);
    setCategoryImageLevels((prev) => {
      const next = [...(Array.isArray(prev) ? prev : [null, null, null])];
      next[levelIndex] = selectedId;
      for (let idx = levelIndex + 1; idx < 3; idx += 1) {
        next[idx] = null;
      }
      return next;
    });
  }, []);

  const fetchData = async (options = {}) => {
    const {
      includeOrders = true,
      includeAllOrders = true,
      includeProducts = true,
      includeCategories = true,
      includeContainers = true,
      includeFeedbackStats = false
    } = options;

    try {
      const hasActiveRestaurant = Boolean(user?.active_restaurant_id);
      const filteredOrdersUrl = `${API_URL}/admin/orders${effectiveOrdersStatusFilter !== 'all' ? `?status=${effectiveOrdersStatusFilter}` : ''}`;

      if (includeOrders) {
        try {
          const filteredOrdersRes = await axios.get(filteredOrdersUrl, {
            timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
          });
          const normalizedFilteredOrders = (filteredOrdersRes.data || []).map(normalizeAdminOrderForUI);
          setOrders(normalizedFilteredOrders);

          if (includeAllOrders) {
            if (effectiveOrdersStatusFilter === 'all') {
              setAllOrdersForAnalytics(normalizedFilteredOrders);
            } else {
              try {
                const allOrdersRes = await axios.get(`${API_URL}/admin/orders`, {
                  timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
                });
                const normalizedAllOrders = (allOrdersRes.data || []).map(normalizeAdminOrderForUI);
                setAllOrdersForAnalytics(normalizedAllOrders.length ? normalizedAllOrders : normalizedFilteredOrders);
              } catch (error) {
                console.error('Orders counts fetch error:', error);
                setAllOrdersForAnalytics(normalizedFilteredOrders);
              }
            }
          }
        } catch (error) {
          console.error('Orders fetch error:', error);
        }
      }

      if (includeProducts) {
        try {
          const productsRes = await axios.get(`${API_URL}/admin/products`, {
            timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
          });
          setProducts(productsRes.data || []);
        } catch (error) {
          console.error('Products fetch error:', error);
        }
      }

      if (includeCategories) {
        try {
          const categoriesRes = await axios.get(`${API_URL}/admin/categories`, {
            timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
          });
          applyCategoriesData(categoriesRes.data || []);
        } catch (error) {
          console.error('Categories fetch error:', error);
        }
      }

      if (includeContainers) {
        if (!hasActiveRestaurant) {
          setContainers([]);
        } else {
          try {
            const containersRes = await axios.get(`${API_URL}/admin/containers`, {
              timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
            });
            setContainers(containersRes.data || []);
          } catch (error) {
            console.error('Containers fetch error:', error);
          }
        }
      }

      if (includeFeedbackStats) {
        fetchFeedbackStats();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab !== 'settings' || settingsTab !== 'appearance') return;
    if (!user?.active_restaurant_id) return;

    fetchData({
      includeOrders: false,
      includeAllOrders: false,
      includeProducts: true,
      includeCategories: true,
      includeContainers: false,
      includeFeedbackStats: false
    });
  }, [
    mainTab,
    settingsTab,
    user?.active_restaurant_id,
    products.length,
    categories.length
  ]);

  useEffect(() => {
    if (mainTab !== 'settings' || settingsTab !== 'category_images') return;
    if (!user?.active_restaurant_id) return;
    loadCategoryImageCategories();
  }, [
    mainTab,
    settingsTab,
    user?.active_restaurant_id,
    loadCategoryImageCategories
  ]);

  const resetGlobalImportModalState = () => {
    setGlobalCatalogProducts([]);
    setGlobalImportSearch('');
    setGlobalImportBarcodeSearch('');
    setGlobalImportLeftSelectedIds([]);
    setGlobalImportRightSelectedIds([]);
    setGlobalImportItems([]);
    setGlobalCatalogLoading(false);
    setGlobalImportSaving(false);
  };

  const closeGlobalImportModal = () => {
    if (globalImportSaving) return;
    setShowGlobalImportModal(false);
    resetGlobalImportModalState();
  };

  const createGlobalImportItemDraft = (product) => {
    const productId = Number.parseInt(product?.id, 10);
    if (!Number.isFinite(productId) || productId <= 0) return null;

    const recommendedCategoryIdRaw = Number.parseInt(product?.recommended_category_id, 10);
    const recommendedCategoryId = (
      Number.isFinite(recommendedCategoryIdRaw) && importCategoryById.has(String(recommendedCategoryIdRaw))
    )
      ? String(recommendedCategoryIdRaw)
      : '';

    return {
      global_product_id: productId,
      category_id: recommendedCategoryId,
      price: '',
      name_ru: String(product?.name_ru || '').trim(),
      name_uz: String(product?.name_uz || '').trim(),
      barcode: String(product?.barcode || '').trim(),
      image_url: String(product?.thumb_url || product?.image_url || '').trim(),
      recommended_category_name_ru: String(product?.recommended_category_name_ru || '').trim(),
      recommended_category_name_uz: String(product?.recommended_category_name_uz || '').trim()
    };
  };

  const loadGlobalCatalogProducts = async () => {
    setGlobalCatalogLoading(true);
    try {
      const response = await axios.get(`${API_URL}/admin/global-products`, {
        params: {
          limit: 200,
          search: globalImportSearch.trim(),
          barcode: String(globalImportBarcodeSearch || '').replace(/\D/g, '')
        }
      });
      setGlobalCatalogProducts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Global catalog load error:', error);
      setAlertMessage({
        type: 'danger',
        text: error.response?.data?.error || (language === 'uz'
          ? "Global mahsulotlar ro'yxatini yuklab bo'lmadi"
          : 'Не удалось загрузить список глобальных товаров')
      });
    } finally {
      setGlobalCatalogLoading(false);
    }
  };

  const openGlobalImportModal = () => {
    resetGlobalImportModalState();
    setShowGlobalImportModal(true);
  };

  const toggleGlobalImportLeftSelection = (productId) => {
    const normalizedId = Number.parseInt(productId, 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    setGlobalImportLeftSelectedIds((prev) => (
      prev.includes(normalizedId)
        ? prev.filter((id) => id !== normalizedId)
        : [...prev, normalizedId]
    ));
  };

  const toggleGlobalImportRightSelection = (productId) => {
    const normalizedId = Number.parseInt(productId, 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    setGlobalImportRightSelectedIds((prev) => (
      prev.includes(normalizedId)
        ? prev.filter((id) => id !== normalizedId)
        : [...prev, normalizedId]
    ));
  };

  const moveSelectedGlobalProductsToRight = () => {
    if (!globalImportLeftSelectedIds.length) {
      setAlertMessage({
        type: 'warning',
        text: language === 'uz'
          ? "Chap ro'yxatdan kamida bitta global mahsulotni tanlang"
          : 'Выберите минимум один глобальный товар слева'
      });
      return;
    }

    const nextItems = [];
    for (const id of globalImportLeftSelectedIds) {
      if (globalImportItemIdsSet.has(Number(id))) continue;
      const source = globalImportCatalogById.get(Number(id));
      if (!source) continue;
      const draft = createGlobalImportItemDraft(source);
      if (draft) nextItems.push(draft);
    }

    if (!nextItems.length) {
      setGlobalImportLeftSelectedIds([]);
      return;
    }

    setGlobalImportItems((prev) => [...prev, ...nextItems]);
    setGlobalImportLeftSelectedIds([]);
  };

  const moveSelectedGlobalProductsToLeft = () => {
    if (!globalImportRightSelectedIds.length) {
      setAlertMessage({
        type: 'warning',
        text: language === 'uz'
          ? "O'ng ro'yxatdan olib tashlanadigan mahsulotlarni tanlang"
          : 'Выберите товары справа для удаления из добавления'
      });
      return;
    }

    const removeSet = new Set(globalImportRightSelectedIds.map((id) => Number(id)));
    setGlobalImportItems((prev) => prev.filter((item) => !removeSet.has(Number(item.global_product_id))));
    setGlobalImportRightSelectedIds([]);
  };

  const updateGlobalImportItem = (productId, field, value) => {
    const normalizedId = Number.parseInt(productId, 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    setGlobalImportItems((prev) => prev.map((item) => {
      if (Number(item.global_product_id) !== normalizedId) return item;
      return {
        ...item,
        [field]: value
      };
    }));
  };

  const submitGlobalProductImport = async () => {
    if (!globalImportItems.length) {
      setAlertMessage({
        type: 'warning',
        text: language === 'uz'
          ? "Qo'shish uchun kamida bitta global mahsulot tanlang"
          : 'Выберите минимум один глобальный товар для добавления'
      });
      return;
    }

    const payloadItems = [];
    for (const item of globalImportItems) {
      const normalizedPrice = normalizeProductPriceValue(item.price, NaN);
      if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
        setAlertMessage({
          type: 'warning',
          text: `${language === 'uz' ? "Narxni kiriting:" : 'Укажите корректную цену:'} ${item.name_ru || `#${item.global_product_id}`}`
        });
        return;
      }

      const categoryIdRaw = Number.parseInt(item.category_id, 10);
      const categoryId = Number.isFinite(categoryIdRaw) && categoryIdRaw > 0 ? categoryIdRaw : null;

      payloadItems.push({
        global_product_id: Number(item.global_product_id),
        price: Math.round(normalizedPrice),
        category_id: categoryId
      });
    }

    setGlobalImportSaving(true);
    try {
      const response = await axios.post(`${API_URL}/admin/global-products/import`, {
        items: payloadItems
      });
      const createdCount = Number(response.data?.created_count || payloadItems.length || 0);
      setAlertMessage({
        type: 'success',
        text: language === 'uz'
          ? `Global mahsulotlar qo'shildi: ${createdCount}`
          : `Глобальные товары добавлены: ${createdCount}`
      });
      setShowGlobalImportModal(false);
      resetGlobalImportModalState();
      fetchData();
    } catch (error) {
      console.error('Import global products error:', error);
      setAlertMessage({
        type: 'danger',
        text: error.response?.data?.error || (language === 'uz'
          ? "Global mahsulotlarni qo'shib bo'lmadi"
          : 'Не удалось добавить глобальные товары')
      });
    } finally {
      setGlobalImportSaving(false);
    }
  };

  useEffect(() => {
    if (!showGlobalImportModal) return;
    const timer = setTimeout(() => {
      loadGlobalCatalogProducts();
    }, 260);
    return () => clearTimeout(timer);
  }, [showGlobalImportModal, globalImportSearch, globalImportBarcodeSearch]);

  useEffect(() => {
    if (!showGlobalImportModal) return;
    setGlobalImportLeftSelectedIds((prev) => (
      prev.filter((id) => globalImportCatalogById.has(Number(id)))
    ));
  }, [showGlobalImportModal, globalImportCatalogById]);

  useEffect(() => {
    if (!showGlobalImportModal) return;
    setGlobalImportRightSelectedIds((prev) => (
      prev.filter((id) => globalImportItemIdsSet.has(Number(id)))
    ));
  }, [showGlobalImportModal, globalImportItemIdsSet]);

  const fetchFeedback = async () => {
    try {
      let url = `${API_URL}/admin/feedback?`;
      if (feedbackFilter.status) url += `status=${feedbackFilter.status}&`;
      if (feedbackFilter.type) url += `type=${feedbackFilter.type}&`;
      const response = await axios.get(url, {
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      setFeedback(response.data.feedback || []);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    }
  };

  const fetchFeedbackStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/feedback/stats`, {
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      setFeedbackStats(response.data);
    } catch (error) {
      console.error('Error fetching feedback stats:', error);
    }
  };

  const fetchCustomers = async () => {
    if (!user?.active_restaurant_id) {
      setCustomers({ customers: [], total: 0, page: 1, limit: customerLimit });
      return;
    }

    setCustomersLoading(true);
    try {
      const response = await axios.get(`${API_URL}/admin/customers`, {
        params: {
          page: customerPage,
          limit: customerLimit,
          search: customerSearch.trim(),
          status: customerStatusFilter
        }
      });
      const data = response.data || {};
      setCustomers({
        customers: data.customers || [],
        total: data.total || 0,
        page: data.page || customerPage,
        limit: data.limit || customerLimit
      });
    } catch (error) {
      console.error('Error fetching admin customers:', error);
      setAlertMessage({ type: 'danger', text: 'Ошибка загрузки клиентов' });
    } finally {
      setCustomersLoading(false);
    }
  };

  const fetchCustomerOrdersHistory = async (customerId, page = 1) => {
    setCustomerOrdersLoading(true);
    try {
      const response = await axios.get(`${API_URL}/admin/customers/${customerId}/orders`, {
        params: { page, limit: 10 }
      });
      const data = response.data || {};
      setCustomerOrdersHistory({
        orders: (data.orders || []).map(normalizeAdminOrderForUI),
        total: data.total || 0,
        page: data.page || page,
        limit: data.limit || 10
      });
      setSelectedCustomerProfile(data.customer || null);
      setCustomerOrdersPage(data.page || page);
    } catch (error) {
      console.error('Error fetching customer order history:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка загрузки истории заказов' });
    } finally {
      setCustomerOrdersLoading(false);
    }
  };

  const openCustomerOrdersModal = (customer) => {
    setSelectedCustomerProfile(customer);
    setCustomerOrdersHistory({ orders: [], total: 0, page: 1, limit: 10 });
    setCustomerOrdersPage(1);
    setShowCustomerOrdersModal(true);
    fetchCustomerOrdersHistory(customer.user_id, 1);
  };

  const resetActiveTabMobileFilters = () => {
    if (mainTab === 'orders') {
      setStatusFilter('all');
      setOrdersDateFrom(getTodayDateKey());
      setOrdersDateTo(getTodayDateKey());
      return;
    }
    if (mainTab === 'products') {
      resetProductFilters();
      return;
    }
    if (mainTab === 'feedback') {
      setFeedbackFilter({ status: '', type: '' });
      return;
    }
    if (mainTab === 'clients') {
      setCustomerSearch('');
      setCustomerStatusFilter('');
      setCustomerPage(1);
    }
  };

  const renderMobileFiltersSheetContent = () => {
    if (mainTab === 'orders') {
      return (
        <div className="d-grid gap-2">
          <div className="small text-muted fw-semibold">Период</div>
          <div className="d-flex align-items-center gap-2">
            <Form.Control
              type="date"
              size="sm"
              value={ordersDateFrom}
              onChange={(e) => {
                const nextFrom = e.target.value;
                setOrdersDateFrom(nextFrom);
                if (ordersDateTo && nextFrom && nextFrom > ordersDateTo) {
                  setOrdersDateTo(nextFrom);
                }
              }}
            />
            <span className="text-muted small">—</span>
            <Form.Control
              type="date"
              size="sm"
              value={ordersDateTo}
              onChange={(e) => {
                const nextTo = e.target.value;
                setOrdersDateTo(nextTo);
                if (ordersDateFrom && nextTo && nextTo < ordersDateFrom) {
                  setOrdersDateFrom(nextTo);
                }
              }}
            />
          </div>
          <div className="small text-muted fw-semibold">Статус заказов</div>
          {orderStatusPillItems.map((s) => {
            const isActive = statusFilter === s.value;
            const count = visibleOrderStatusCounts?.[s.value] || 0;
            return (
              <button
                key={`mobile-order-status-${s.value}`}
                type="button"
                className="btn text-start d-flex align-items-center justify-content-between"
                onClick={() => {
                  if (ordersViewMode === 'kanban') return;
                  setStatusFilter(s.value);
                }}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${isActive ? s.color : '#d1d5db'}`,
                  background: isActive ? `${s.color}12` : '#fff',
                  color: '#374151',
                  cursor: ordersViewMode === 'kanban' ? 'not-allowed' : 'pointer',
                  opacity: ordersViewMode === 'kanban' ? 0.7 : 1
                }}
              >
                <span className="d-flex align-items-center gap-2">
                  <span aria-hidden="true">{s.emoji}</span>
                  {s.label}
                </span>
                {count > 0 && (
                  <Badge pill style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}25` }}>
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
          {ordersViewMode !== 'kanban' && (
            <Button variant="outline-secondary" onClick={exportOrders}>
              Экспорт заказов
            </Button>
          )}
        </div>
      );
    }

    if (mainTab === 'products') {
      return (
        <div className="d-grid gap-3">
          <Form.Group>
            <Form.Label className="small text-muted">Поиск</Form.Label>
            <Form.Control
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder={t('searchByName')}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small text-muted">{t('category')}</Form.Label>
            <Form.Select
              value={productCategoryFilter}
              onChange={(e) => {
                setProductCategoryFilter(e.target.value);
                setProductSubcategoryFilter('all');
                setProductThirdCategoryFilter('all');
              }}
            >
              <option value="all">{t('allCategories')}</option>
              {rootCategoryOptions.map(cat => (
                <option key={`mobile-root-cat-${cat.id}`} value={String(cat.id)}>
                  {cat.name_ru}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="small text-muted">{t('subcategory') || 'Подкатегория'}</Form.Label>
            <Form.Select
              value={productSubcategoryFilter}
              onChange={(e) => {
                setProductSubcategoryFilter(e.target.value);
                setProductThirdCategoryFilter('all');
              }}
            >
              <option value="all">{allSubcategoriesLabel}</option>
              {productSubcategoryOptions.map(sub => (
                <option key={`mobile-sub-cat-${sub.id}`} value={String(sub.id)}>
                  {sub.name_ru}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="small text-muted">{thirdCategoryLabel}</Form.Label>
            <Form.Select
              value={productThirdCategoryFilter}
              onChange={(e) => setProductThirdCategoryFilter(e.target.value)}
            >
              <option value="all">{allThirdCategoriesLabel}</option>
              {productThirdCategoryOptions.map(sub => (
                <option key={`mobile-third-cat-${sub.id}`} value={String(sub.id)}>
                  {sub.name_ru}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="small text-muted">{t('status')}</Form.Label>
            <Form.Select value={productStatusFilter} onChange={(e) => setProductStatusFilter(e.target.value)}>
              <option value="all">{t('allStatuses')}</option>
              <option value="active">{t('activeProducts')}</option>
              <option value="hidden">{t('hiddenProducts')}</option>
            </Form.Select>
          </Form.Group>
        </div>
      );
    }

    if (mainTab === 'feedback') {
      return (
        <div className="d-grid gap-3">
          <Form.Group>
            <Form.Label className="small text-muted">{t('type')}</Form.Label>
            <Form.Select
              value={feedbackFilter.type}
              onChange={(e) => setFeedbackFilter((prev) => ({ ...prev, type: e.target.value }))}
            >
              <option value="">{t('allTypes')}</option>
              <option value="complaint">{t('complaint')}</option>
              <option value="suggestion">{t('suggestion')}</option>
              <option value="question">{t('question')}</option>
              <option value="other">{t('other')}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="small text-muted">{t('status')}</Form.Label>
            <Form.Select
              value={feedbackFilter.status}
              onChange={(e) => setFeedbackFilter((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="new">{t('statusNew')}</option>
              <option value="in_progress">{t('inProgress')}</option>
              <option value="resolved">{t('resolved')}</option>
              <option value="closed">{t('closed')}</option>
            </Form.Select>
          </Form.Group>
        </div>
      );
    }

    if (mainTab === 'clients') {
      return (
        <div className="d-grid gap-3">
          <Form.Group>
            <Form.Label className="small text-muted">{t('search')}</Form.Label>
            <Form.Control
              type="search"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerPage(1);
              }}
              placeholder={`${t('client')}: имя / телефон / username`}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small text-muted">{t('status')}</Form.Label>
            <Form.Select
              value={customerStatusFilter}
              onChange={(e) => {
                setCustomerStatusFilter(e.target.value);
                setCustomerPage(1);
              }}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="active">Активен</option>
              <option value="blocked">Заблокирован</option>
            </Form.Select>
          </Form.Group>
        </div>
      );
    }

    return null;
  };

  const openFeedbackDetail = (fb) => {
    setSelectedFeedback(fb);
    setFeedbackResponse(fb.admin_response || '');
    setShowFeedbackModal(true);
  };

  const handleFeedbackResponse = async (newStatus) => {
    try {
      await axios.patch(`${API_URL}/admin/feedback/${selectedFeedback.id}`, {
        status: newStatus,
        admin_response: feedbackResponse
      });
      setShowFeedbackModal(false);
      fetchFeedback();
      fetchFeedbackStats();
      setAlertMessage({ type: 'success', text: 'Обращение обновлено' });
    } catch (error) {
      setAlertMessage({ type: 'danger', text: 'Ошибка обновления' });
    }
  };

  // Container functions
  const openContainerModal = (container = null) => {
    setSelectedContainer(container);
    setContainerForm(container ? {
      name: container.name,
      price: container.price,
      sort_order: container.sort_order || 0
    } : { name: '', price: 0, sort_order: 0 });
    setShowContainerModal(true);
  };

  const saveContainer = async () => {
    try {
      if (selectedContainer) {
        await axios.put(`${API_URL}/admin/containers/${selectedContainer.id}`, containerForm);
      } else {
        await axios.post(`${API_URL}/admin/containers`, containerForm);
      }
      setShowContainerModal(false);
      fetchData();
      setAlertMessage({ type: 'success', text: selectedContainer ? 'Посуда обновлена' : 'Посуда добавлена' });
    } catch (error) {
      setAlertMessage({ type: 'danger', text: 'Ошибка сохранения' });
    }
  };

  const fetchBillingInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/billing/info`, {
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      setBillingInfo(response.data);
    } catch (error) {
      console.error('Fetch billing info error:', error);
    }
  };

  const fetchBillingHistory = async (type = '') => {
    setLoadingBilling(true);
    try {
      const response = await axios.get(`${API_URL}/admin/billing/history${type ? `?type=${type}` : ''}`);
      setBillingHistory(response.data);
    } catch (error) {
      console.error('Fetch billing history error:', error);
    } finally {
      setLoadingBilling(false);
    }
  };

  const fetchRestaurantSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/restaurant`, {
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      const settings = {
        ...(response.data || {}),
        cash_enabled: response.data?.cash_enabled === false ? false : true,
        is_delivery_enabled: response.data?.is_delivery_enabled === false ? false : true,
        currency_code: response.data?.currency_code || 'uz',
        logo_display_mode: (response.data?.logo_display_mode === 'horizontal') ? 'horizontal' : 'square',
        ui_theme: normalizeUiTheme(response.data?.ui_theme, 'classic'),
        ui_font_family: normalizeUiFontFamily(response.data?.ui_font_family, 'sans'),
        menu_view_mode: normalizeMenuViewMode(response.data?.menu_view_mode, 'grid_categories'),
        catalog_card_mode: normalizeCatalogCardMode(response.data?.catalog_card_mode, 'wide'),
        menu_liquid_glass_enabled: response.data?.menu_liquid_glass_enabled === true,
        menu_height_lock_enabled: response.data?.menu_height_lock_enabled === true,
        menu_liquid_glass_opacity: normalizeMenuGlassOpacity(
          response.data?.menu_liquid_glass_opacity,
          MENU_GLASS_OPACITY_DEFAULT
        ),
        menu_liquid_glass_blur: normalizeMenuGlassBlur(
          response.data?.menu_liquid_glass_blur,
          MENU_GLASS_BLUR_DEFAULT
        ),
        delivery_pricing_mode: normalizeDeliveryPricingMode(response.data?.delivery_pricing_mode, 'dynamic'),
        delivery_fixed_price: Number.isFinite(Number(response.data?.delivery_fixed_price))
          ? Number(response.data?.delivery_fixed_price)
          : 0,
        inventory_tracking_enabled: response.data?.inventory_tracking_enabled === true,
        inventory_min_threshold: Number.isFinite(Number(response.data?.inventory_min_threshold))
          ? Number(response.data?.inventory_min_threshold)
          : 0,
        is_operator_delivery_later_enabled: response.data?.is_operator_delivery_later_enabled === true,
        payment_placeholders: normalizePaymentPlaceholders(response.data?.payment_placeholders)
      };
      setRestaurantSettings(settings);
      setRestaurantSettingsBaselineSignature(buildRestaurantSettingsSignature(settings));
      if (settings.currency_code) {
        setCountryCurrency(settings.currency_code);
      }
      setInitialRestaurantBotToken((settings.telegram_bot_token || '').trim());
      setTokenSaveCountdown(0);
      tokenCountdownArmedRef.current = false;
      setRegistrationQrPreviewMeta(null);
      setRegistrationQrPreviewError('');
    } catch (error) {
      console.error('Fetch restaurant settings error:', error);
    }
  };

  const saveRestaurantSettings = async () => {
    if (isTokenSaveLocked) return;

    setSavingSettings(true);
    try {
      const response = await axios.put(`${API_URL}/admin/restaurant`, restaurantSettings);
      const savedSettings = response.data || {};
      const mergedSettings = {
        ...(restaurantSettings || {}),
        ...savedSettings,
        cash_enabled: savedSettings?.cash_enabled === false ? false : (restaurantSettings?.cash_enabled !== false),
        is_delivery_enabled: savedSettings?.is_delivery_enabled === false ? false : (restaurantSettings?.is_delivery_enabled !== false),
        is_scheduled_date_delivery_enabled: savedSettings?.is_scheduled_date_delivery_enabled === true || savedSettings?.is_scheduled_date_delivery_enabled === 'true' || false,
        scheduled_delivery_max_days: Math.max(1, Math.trunc(Number(savedSettings?.scheduled_delivery_max_days || restaurantSettings?.scheduled_delivery_max_days || 7))),
        is_asap_delivery_enabled: savedSettings?.is_asap_delivery_enabled !== false,
        is_scheduled_time_delivery_enabled: savedSettings?.is_scheduled_time_delivery_enabled !== false,
        is_operator_delivery_later_enabled: savedSettings?.is_operator_delivery_later_enabled === true
          ? true
          : Boolean(restaurantSettings?.is_operator_delivery_later_enabled),
        currency_code: savedSettings?.currency_code || restaurantSettings?.currency_code || 'uz',
        logo_display_mode: (savedSettings?.logo_display_mode === 'horizontal') ? 'horizontal' : 'square',
        ui_theme: normalizeUiTheme(savedSettings?.ui_theme, restaurantSettings?.ui_theme || 'classic'),
        ui_font_family: normalizeUiFontFamily(savedSettings?.ui_font_family, restaurantSettings?.ui_font_family || 'sans'),
        menu_view_mode: normalizeMenuViewMode(
          savedSettings?.menu_view_mode,
          restaurantSettings?.menu_view_mode || 'grid_categories'
        ),
        catalog_card_mode: normalizeCatalogCardMode(
          savedSettings?.catalog_card_mode,
          restaurantSettings?.catalog_card_mode || 'wide'
        ),
        menu_liquid_glass_enabled: savedSettings?.menu_liquid_glass_enabled === true
          ? true
          : Boolean(restaurantSettings?.menu_liquid_glass_enabled),
        menu_height_lock_enabled: savedSettings?.menu_height_lock_enabled === true
          ? true
          : Boolean(restaurantSettings?.menu_height_lock_enabled),
        menu_liquid_glass_opacity: normalizeMenuGlassOpacity(
          savedSettings?.menu_liquid_glass_opacity,
          restaurantSettings?.menu_liquid_glass_opacity ?? MENU_GLASS_OPACITY_DEFAULT
        ),
        menu_liquid_glass_blur: normalizeMenuGlassBlur(
          savedSettings?.menu_liquid_glass_blur,
          restaurantSettings?.menu_liquid_glass_blur ?? MENU_GLASS_BLUR_DEFAULT
        ),
        delivery_pricing_mode: normalizeDeliveryPricingMode(
          savedSettings?.delivery_pricing_mode,
          restaurantSettings?.delivery_pricing_mode || 'dynamic'
        ),
        delivery_fixed_price: Number.isFinite(Number(savedSettings?.delivery_fixed_price))
          ? Number(savedSettings?.delivery_fixed_price)
          : Number.isFinite(Number(restaurantSettings?.delivery_fixed_price))
            ? Number(restaurantSettings?.delivery_fixed_price)
            : 0,
        inventory_tracking_enabled: savedSettings?.inventory_tracking_enabled === true
          ? true
          : Boolean(restaurantSettings?.inventory_tracking_enabled),
        inventory_min_threshold: Number.isFinite(Number(savedSettings?.inventory_min_threshold))
          ? Number(savedSettings?.inventory_min_threshold)
          : Number.isFinite(Number(restaurantSettings?.inventory_min_threshold))
            ? Number(restaurantSettings?.inventory_min_threshold)
            : 0,
        payment_placeholders: normalizePaymentPlaceholders(
          savedSettings?.payment_placeholders ?? restaurantSettings?.payment_placeholders
        )
      };
      setRestaurantSettings(mergedSettings);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-ui-font', normalizeUiFontFamily(mergedSettings.ui_font_family, 'sans'));
      }
      setRestaurantSettingsBaselineSignature(buildRestaurantSettingsSignature(mergedSettings));
      if (savedSettings.currency_code) {
        setCountryCurrency(savedSettings.currency_code);
      }
      setInitialRestaurantBotToken((mergedSettings.telegram_bot_token || '').trim());
      setTokenSaveCountdown(0);
      tokenCountdownArmedRef.current = false;

      const migration = savedSettings.token_migration;
      const operatorNotification = savedSettings.operator_notification;

      const successLines = ['Настройки успешно сохранены'];
      if (migration && !migration.skipped) {
        successLines.push(`Клиенты уведомлены: ${migration.delivered}/${migration.total}`);
      }

      if (operatorNotification && operatorNotification.failed > 0) {
        successLines.push(`Операторы уведомлены частично: ${operatorNotification.delivered}/${operatorNotification.total}`);
        successLines.push('Попросите операторов открыть новый бот и нажать /start.');
      }
      setAlertMessage({
        type: operatorNotification && operatorNotification.failed > 0 ? 'warning' : 'success',
        text: <div style={{ whiteSpace: 'pre-wrap' }}>{successLines.join('\n')}</div>
      });
      // Refresh user context if needed (logo/name in header)
      fetchUser();
    } catch (error) {
      console.error('Save restaurant settings error:', error);
      const backendError = error.response?.data?.error || 'Ошибка сохранения настроек';
      const migration = error.response?.data?.token_migration;
      const details = error.response?.data?.details;

      const errorLines = [backendError];
      if (migration && typeof migration.total === 'number') {
        errorLines.push(`Клиенты уведомлены: ${migration.delivered}/${migration.total}`);
        errorLines.push(`Не доставлено: ${migration.failed}`);
      }
      if (details) {
        errorLines.push(`Детали: ${details}`);
      }

      setAlertMessage({
        type: 'danger',
        text: <div style={{ whiteSpace: 'pre-wrap' }}>{errorLines.join('\n')}</div>
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const testBot = async () => {
    if (!restaurantSettings.telegram_bot_token) {
      setAlertMessage({ type: 'warning', text: 'Введите Bot Token для проверки' });
      return;
    }
    setTestingBot(true);
    setBotProfileLookupError('');
    try {
      const response = await axios.post(`${API_URL}/admin/test-bot`, {
        botToken: restaurantSettings.telegram_bot_token,
        groupId: restaurantSettings.telegram_group_id
      });

      const { message, details, errors, success, bot } = response.data;
      setTestedBotInfo(bot || null);

      let fullText = message + '\n\n' + details.join('\n');
      if (errors && errors.length > 0) {
        fullText += '\n\nОшибки:\n' + errors.join('\n');
      }

      setAlertMessage({
        type: success ? 'success' : 'warning',
        text: <div style={{ whiteSpace: 'pre-wrap' }}>{fullText}</div>
      });
    } catch (error) {
      console.error('Test bot error:', error);
      setTestedBotInfo(null);
      setAlertMessage({
        type: 'danger',
        text: 'Ошибка при проверке: ' + (error.response?.data?.error || error.message)
      });
    } finally {
      setTestingBot(false);
    }
  };

  const copyTelegramMetaField = async (value, fieldKey) => {
    const text = String(value || '').trim();
    if (!text || text === '—') return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      setCopiedTelegramField(fieldKey);
      window.setTimeout(() => {
        setCopiedTelegramField((prev) => (prev === fieldKey ? '' : prev));
      }, 1400);
    } catch (error) {
      setAlertMessage({ type: 'warning', text: 'Не удалось скопировать значение' });
    }
  };

  const formatCardNumberMasked = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 19);
    if (!digits) return '';
    return digits.match(/.{1,4}/g)?.join(' ') || digits;
  };

  const handleRestaurantTokenPreview = () => {
    if (!restaurantSettings?.telegram_bot_token) return;
    if (isRestaurantBotTokenVisible) {
      setIsRestaurantBotTokenVisible(false);
      return;
    }

    setIsRestaurantBotTokenVisible(true);
    setTimeout(() => {
      setIsRestaurantBotTokenVisible(false);
    }, 2000);
  };

  const fetchOperators = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/operators`, {
        timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
      });
      setOperators(response.data);
    } catch (error) {
      console.error('Fetch operators error:', error);
    }
  };

  const fetchHelpInstructions = async () => {
    setLoadingHelpInstructions(true);
    try {
      const response = await axios.get(`${API_URL}/admin/help-instructions`);
      const items = Array.isArray(response.data) ? response.data : [];
      setHelpInstructions(items);
      setSelectedHelpInstruction((prev) => {
        if (prev && items.some((item) => Number(item.id) === Number(prev.id))) {
          return items.find((item) => Number(item.id) === Number(prev.id)) || prev;
        }
        return items.find((item) => String(item.youtube_url || '').trim()) || null;
      });
    } catch (error) {
      console.error('Fetch help instructions error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка загрузки инструкций' });
    } finally {
      setLoadingHelpInstructions(false);
    }
  };

  const applyHelpInstructionUpdate = (updatedInstruction) => {
    if (!updatedInstruction?.id) return;
    setHelpInstructions((prev) => prev.map((item) => (
      Number(item.id) === Number(updatedInstruction.id)
        ? { ...item, ...updatedInstruction }
        : item
    )));
    setSelectedHelpInstruction((prev) => (
      prev && Number(prev.id) === Number(updatedInstruction.id)
        ? { ...prev, ...updatedInstruction }
        : prev
    ));
  };

  const incrementHelpInstructionViews = async (instructionId) => {
    try {
      const response = await axios.post(`${API_URL}/admin/help-instructions/${instructionId}/view`);
      applyHelpInstructionUpdate(response.data);
    } catch (error) {
      console.error('Increment help instruction views error:', error);
    }
  };

  const [editingOperator, setEditingOperator] = useState(null);

  const openOperatorModal = (operator = null) => {
    if (operator) {
      setEditingOperator(operator);
      setOperatorForm({
        username: operator.username || '',
        password: '',
        full_name: operator.full_name || '',
        phone: operator.phone || '',
        telegram_id: operator.telegram_id || ''
      });
    } else {
      setEditingOperator(null);
      setOperatorForm({ username: '', password: '', full_name: '', phone: '', telegram_id: '' });
    }
    setShowOperatorModal(true);
  };

  const saveOperator = async (e) => {
    e.preventDefault();
    try {
      if (editingOperator) {
        const data = { ...operatorForm };
        if (!data.password) delete data.password;
        await axios.put(`${API_URL}/admin/operators/${editingOperator.id}`, data);
        setAlertMessage({ type: 'success', text: 'Оператор обновлен' });
      } else {
        await axios.post(`${API_URL}/admin/operators`, operatorForm);
        setAlertMessage({ type: 'success', text: 'Оператор добавлен' });
      }
      setShowOperatorModal(false);
      setOperatorForm({ username: '', password: '', full_name: '', phone: '' });
      setEditingOperator(null);
      fetchOperators();
    } catch (error) {
      console.error('Save operator error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка сохранения оператора' });
    }
  };

  const deleteOperator = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого оператора из магазина?')) return;
    try {
      await axios.delete(`${API_URL}/admin/operators/${id}`);
      setAlertMessage({ type: 'success', text: 'Оператор удален' });
      fetchOperators();
    } catch (error) {
      console.error('Delete operator error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка удаления оператора' });
    }
  };

  const handleAcceptAndPay = async (orderId) => {
    try {
      await axios.post(`${API_URL}/admin/orders/${orderId}/accept-and-pay`, { lang: language });
      setAlertMessage({ type: 'success', text: 'Заказ успешно принят и оплачен' });
      // Refresh user and orders
      fetchUser();
      fetchData(); // Changed from fetchOrders() to fetchData() to refresh all data
    } catch (error) {
      console.error('Accept and pay error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка при оплате заказа' });
    }
  };

  const deleteContainer = async (id) => {
    if (!window.confirm('Удалить посуду? Она будет удалена из всех товаров.')) return;
    try {
      await axios.delete(`${API_URL}/admin/containers/${id}`);
      fetchData();
      setAlertMessage({ type: 'success', text: 'Посуда удалена' });
    } catch (error) {
      setAlertMessage({ type: 'danger', text: 'Ошибка удаления' });
    }
  };

  const updateOrderStatus = async (orderId, newStatus, reason = null) => {
    try {
      await axios.patch(`${API_URL}/admin/orders/${orderId}/status`, {
        status: newStatus,
        cancel_reason: reason
      });
      await fetchData();
      await fetchUser();
      setAlertMessage({ type: 'success', text: 'Статус заказа обновлен' });
      setShowOrderModal(false);
    } catch (error) {
      const errorText = error.response?.data?.error || 'Ошибка обновления статуса';
      setAlertMessage({ type: 'danger', text: errorText });
    }
  };

  const openDeliveryLaterModal = (order) => {
    if (!order?.id) return;
    const todayDateKey = getTodayDateKey();
    const minDate = shiftDateKeyByDays(todayDateKey, 1) || todayDateKey;
    const orderDeliveryDate = String(order?.delivery_date || '').trim();
    const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(orderDeliveryDate) && orderDeliveryDate > todayDateKey
      ? orderDeliveryDate
      : minDate;

    setDeliveryLaterDate(initialDate);
    setShowDeliveryLaterModal(true);
  };

  const saveDeliveryLaterDate = async () => {
    if (!selectedOrder?.id) return;

    const normalizedDate = String(deliveryLaterDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      setAlertMessage({ type: 'danger', text: 'Укажите корректную дату доставки' });
      return;
    }

    setSavingDeliveryLater(true);
    try {
      const response = await axios.patch(`${API_URL}/admin/orders/${selectedOrder.id}/delivery-later`, {
        delivery_date: normalizedDate
      });
      const nextOrderRaw = response.data?.order || {};
      setSelectedOrder((prev) => {
        if (!prev) return prev;
        return normalizeAdminOrderForUI({
          ...prev,
          ...nextOrderRaw,
          status_actions: prev.status_actions || []
        });
      });
      setShowDeliveryLaterModal(false);
      setDeliveryLaterDate('');
      await fetchData();
      setAlertMessage({ type: 'success', text: 'Дата доставки обновлена, клиент уведомлен в боте' });
    } catch (error) {
      setAlertMessage({
        type: 'danger',
        text: error.response?.data?.error || 'Ошибка обновления даты доставки'
      });
    } finally {
      setSavingDeliveryLater(false);
    }
  };

  // Open cancel modal
  const openCancelModal = (orderId) => {
    setCancelOrderId(orderId);
    setCancelReason('');
    setShowCancelModal(true);
  };

  // Confirm cancel order
  const confirmCancelOrder = async () => {
    if (!cancelReason.trim()) {
      alert('Укажите причину отмены');
      return;
    }
    await updateOrderStatus(cancelOrderId, 'cancelled', cancelReason);
    setShowCancelModal(false);
    setCancelOrderId(null);
    setCancelReason('');
  };

  const startEditingItems = () => {
    setEditingItems([...selectedOrder.items]);
    setShowAddOrderItemModal(false);
    setOrderItemSearch('');
    setIsEditingItems(true);
  };

  const cancelEditingItems = () => {
    setEditingItems([]);
    setShowAddOrderItemModal(false);
    setOrderItemSearch('');
    setIsEditingItems(false);
  };

  const updateItemQuantity = (index, delta) => {
    const newItems = [...editingItems];
    newItems[index].quantity = Math.max(1, parseFloat(newItems[index].quantity) + delta);
    newItems[index].total = newItems[index].quantity * newItems[index].price;
    setEditingItems(newItems);
  };

  const removeItem = (index) => {
    if (editingItems.length <= 1) {
      alert('Нельзя удалить последний товар');
      return;
    }
    const newItems = editingItems.filter((_, i) => i !== index);
    setEditingItems(newItems);
  };

  const addProductToOrder = (product) => {
    const existingIndex = editingItems.findIndex(i => i.product_id === product.id);
    if (existingIndex >= 0) {
      updateItemQuantity(existingIndex, 1);
    } else {
      setEditingItems([...editingItems, {
        product_id: product.id,
        product_name: product.name_ru,
        image_url: product.image_url || null,
        quantity: 1,
        unit: product.unit || 'шт',
        price: parseFloat(product.price),
        total: parseFloat(product.price)
      }]);
    }
  };

  const saveEditedItems = async () => {
    setSavingItems(true);
    try {
      const response = await axios.put(`${API_URL}/admin/orders/${selectedOrder.id}/items`, { items: editingItems });
      setIsEditingItems(false);
      fetchData();
      const nextOrder = response.data?.order || {};
      const nextItems = Array.isArray(response.data?.items) ? response.data.items : editingItems;
      setSelectedOrder({
        ...selectedOrder,
        ...nextOrder,
        items: nextItems,
        total_amount: toNumericValue(response.data?.total_amount, selectedOrder.total_amount)
      });
      setShowAddOrderItemModal(false);
      setOrderItemSearch('');
      setAlertMessage({ type: 'success', text: 'Товары обновлены' });
    } catch (error) {
      alert('Ошибка сохранения: ' + (error.response?.data?.error || error.message));
    } finally {
      setSavingItems(false);
    }
  };

  // Broadcast functions
  const handleBroadcastImageUpload = async (file) => {
    if (!file) return;

    setBroadcastImageFile(file);
    setBroadcastVideoFile(null);

    // Upload image
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await axios.post(`${API_URL}/upload`, formData);
      const fullUrl = toAbsoluteFileUrl(res.data?.imageUrl || res.data?.url || '');
      setBroadcastForm(prev => ({ ...prev, image_url: fullUrl, video_url: '' }));
    } catch (error) {
      alert('Ошибка загрузки изображения');
    }
  };

  const handleBroadcastVideoUpload = async (file) => {
    if (!file) return;

    setBroadcastVideoFile(file);
    setBroadcastImageFile(null);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const res = await axios.post(`${API_URL}/upload/video`, formData);
      const videoUrl = String(res.data.videoUrl || res.data.url || '').trim();
      if (!videoUrl) throw new Error('video url missing');
      const fullUrl = toAbsoluteFileUrl(videoUrl);
      setBroadcastForm(prev => ({ ...prev, video_url: fullUrl, image_url: '' }));
    } catch (error) {
      alert('Ошибка загрузки видео');
    }
  };

  const handleBroadcastMediaInputChange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.type.startsWith('image/')) {
      handleBroadcastImageUpload(file);
      return;
    }
    if (file.type.startsWith('video/')) {
      handleBroadcastVideoUpload(file);
      return;
    }
    alert('Поддерживаются только фото и видео');
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.message.trim()) {
      alert('Введите текст сообщения');
      return;
    }

    if (isScheduled && recurrence === 'none' && !scheduledDate) {
      alert('Выберите дату');
      return;
    }
    if (isScheduled && !scheduledTime) {
      alert('Выберите время');
      return;
    }
    if (isScheduled && recurrence === 'custom' && repeatDays.length === 0) {
      alert('Выберите хотя бы один день недели');
      return;
    }

    if (!window.confirm(isScheduled ? 'Запланировать рассылку?' : 'Отправить рассылку всем клиентам?')) return;

    // Calculate final scheduledAt
    let finalScheduledAt = null;
    if (isScheduled) {
      const now = new Date();
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      if (recurrence === 'none') {
        const target = new Date(`${scheduledDate}T${scheduledTime}:00`);
        finalScheduledAt = target.toISOString();
      } else {
        // For recurring, we find the first occurrence
        let target = new Date();
        target.setHours(hours, minutes, 0, 0);

        if (recurrence === 'daily') {
          if (target <= now) {
            target.setDate(target.getDate() + 1);
          }
        } else if (recurrence === 'custom') {
          // Find next day from repeatDays
          const today = now.getDay();
          const sortedDays = [...repeatDays].sort((a, b) => a - b);

          let nextDay = sortedDays.find(d => d > today);
          let targetDate = new Date(target);

          if (nextDay === undefined) {
            // If no days left this week, take first day of next week
            nextDay = sortedDays[0];
            let diff = (nextDay + 7) - today;
            targetDate.setDate(targetDate.getDate() + diff);
          } else {
            // If today is one of the target days and time hasn't passed
            if (sortedDays.includes(today) && target > now) {
              // Keep today
            } else {
              let diff = nextDay - today;
              targetDate.setDate(targetDate.getDate() + diff);
            }
          }
          target = targetDate;
        }
        finalScheduledAt = target.toISOString();
      }
    }

    setBroadcastLoading(true);
    try {
      const url = editingBroadcastId
        ? `${API_URL}/admin/scheduled-broadcasts/${editingBroadcastId}`
        : `${API_URL}/admin/broadcast`;

      const method = editingBroadcastId ? 'put' : 'post';

      const res = await axios[method](url, {
        message: broadcastForm.message,
        image_url: broadcastForm.image_url ? broadcastForm.image_url : null,
        video_url: broadcastForm.video_url ? broadcastForm.video_url : null,
        scheduled_at: finalScheduledAt,
        recurrence: isScheduled ? recurrence : 'none',
        repeat_days: isScheduled && recurrence === 'custom' ? repeatDays : null
      });

      setAlertMessage({
        type: 'success',
        text: editingBroadcastId ? 'Расписание обновлено' : (isScheduled ? 'Рассылка запланирована' : `Рассылка завершена! Отправлено: ${res.data.sent}, Ошибок: ${res.data.failed}`)
      });
      setShowBroadcastModal(false);
      resetBroadcastForm();
      if (isScheduled || editingBroadcastId) fetchScheduledBroadcasts();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    } finally {
      setBroadcastLoading(false);
    }
  };

  const resetBroadcastForm = () => {
    setBroadcastForm({ message: '', image_url: '', video_url: '' });
    setBroadcastImageFile(null);
    setBroadcastVideoFile(null);
    setIsScheduled(false);
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }));
    setRecurrence('none');
    setRepeatDays([]);
    setEditingBroadcastId(null);
  };

  const fetchScheduledBroadcasts = async () => {
    setLoadingScheduled(true);
    try {
      const res = await axios.get(`${API_URL}/admin/scheduled-broadcasts`);
      setScheduledBroadcasts(res.data);
    } catch (error) {
      console.error('Error fetching scheduled broadcasts:', error);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const fetchBroadcastHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_URL}/admin/broadcast-history`);
      setBroadcastHistory(res.data);
    } catch (error) {
      console.error('Error fetching broadcast history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteRemoteBroadcast = async (id) => {
    if (!window.confirm('⚠️ ВНИМАНИЕ! Это действие удалит это сообщение у ВСЕХ получателей в их Телеграм-ботах. Вы уверены?')) return;

    setLoadingHistory(true);
    try {
      const res = await axios.post(`${API_URL}/admin/broadcast-history/${id}/delete-remote`);
      alert(`Успешно удалено: ${res.data.deleted} сообщений`);
      fetchBroadcastHistory();
    } catch (error) {
      alert('Ошибка при удалении: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingHistory(false);
    }
  };

  const startEditBroadcast = (sb) => {
    setEditingBroadcastId(sb.id);
    setBroadcastForm({ message: sb.message, image_url: sb.image_url || '', video_url: sb.video_url || '' });
    setIsScheduled(true);
    setRecurrence(sb.recurrence);
    setRepeatDays(sb.repeat_days || []);

    const d = new Date(sb.scheduled_at);
    setScheduledDate(d.toISOString().split('T')[0]);
    setScheduledTime(d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }));

    setBroadcastModalTab('send');
  };

  const deleteScheduledBroadcast = async (id) => {
    if (!window.confirm('Удалить это расписание?')) return;
    try {
      await axios.delete(`${API_URL}/admin/scheduled-broadcasts/${id}`);
      fetchScheduledBroadcasts();
    } catch (error) {
      alert('Ошибка удаления');
    }
  };

  const toggleScheduledBroadcast = async (id) => {
    try {
      await axios.patch(`${API_URL}/admin/scheduled-broadcasts/${id}/toggle`);
      fetchScheduledBroadcasts();
    } catch (error) {
      alert('Ошибка изменения статуса');
    }
  };

  const openProductModal = async (product = null) => {
    if (!categories.length) {
      try {
        await loadCategoriesForProducts();
      } catch (error) {
        console.error('Load categories for modal error:', error);
      }
    }

    if (product) {
      const imageSlots = createProductImageSlots(product.product_images, product.image_url, product.thumb_url);
      const mainImage = imageSlots[0] || { url: '', thumb_url: '' };
      const fallbackBasePrice = normalizeProductPriceValue(product.price, NaN);
      const normalizedDiscountPrice = normalizeProductPriceValue(product.discount_price, NaN);
      const normalizedDiscountEnabled = (
        product.size_enabled !== true
        && product.discount_enabled === true
        && Number.isFinite(normalizedDiscountPrice)
        && Number.isFinite(fallbackBasePrice)
        && normalizedDiscountPrice < fallbackBasePrice
      );
      const variantFallbackUnit = String(product.unit || 'шт').trim() || 'шт';
      const fallbackContainerNorm = normalizeProductVariantContainerNormValue(product.container_norm, 1);
      const fallbackOrderStep = Number.parseFloat(product.order_step) > 0 ? Number.parseFloat(product.order_step) : '';
      const normalizedVariantOptions = normalizeProductVariantOptions(product.size_options, {
        fallbackPrice: fallbackBasePrice,
        fallbackIkpu: product.ikpu || '',
        fallbackContainerId: product.container_id || '',
        fallbackContainerNorm,
        fallbackOrderStep,
        unit: variantFallbackUnit
      });
      const hasVariants = normalizedVariantOptions.length > 0;
      const initialEditorVariantsRaw = hasVariants
        ? normalizedVariantOptions.map((variant) => ({ ...variant, __draft: false }))
        : (product.size_enabled === true
          ? [createProductVariantDraft('', fallbackBasePrice, true, {
            ikpu: product.ikpu || '',
            container_id: product.container_id || '',
            container_norm: fallbackContainerNorm,
            order_step: fallbackOrderStep,
            unit: variantFallbackUnit
          })]
          : []);
      const initialEditorVariants = normalizeProductVariantOptionsForEditor(initialEditorVariantsRaw, {
        fallbackPrice: fallbackBasePrice,
        unit: variantFallbackUnit
      });
      setSelectedProduct(product);
      setProductForm({
        category_id: product.category_id || '',
        name_ru: product.name_ru || '',
        name_uz: product.name_uz || '',
        description_ru: product.description_ru || '',
        description_uz: product.description_uz || '',
        image_url: mainImage.url || '',
        thumb_url: mainImage.thumb_url || '',
        product_images: imageSlots,
        price: Number.isFinite(normalizeProductPriceValue(product.price)) ? normalizeProductPriceValue(product.price) : '',
        unit: product.unit || 'шт',
        sort_order: Number.isFinite(Number(product.sort_order)) ? Number(product.sort_order) : 0,
        order_step: Number.parseFloat(product.order_step) > 0 ? Number.parseFloat(product.order_step) : '',
        discount_enabled: normalizedDiscountEnabled,
        discount_price: normalizedDiscountEnabled ? normalizedDiscountPrice : '',
        stock_quantity: Number.isFinite(Number(product.stock_quantity))
          ? Number(product.stock_quantity)
          : '',
        barcode: product.barcode || '',
        ikpu: product.ikpu || '',
        in_stock: product.in_stock !== false,
        season_scope: product.season_scope || 'all',
        is_hidden_catalog: !!product.is_hidden_catalog,
        size_enabled: product.size_enabled === true,
        variant_options: initialEditorVariants,
        size_options: normalizeProductVariantOptions(initialEditorVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: variantFallbackUnit
        }).map((variant) => variant.name),
        container_id: product.container_id || '',
        container_norm: Number.parseFloat(product.container_norm) > 0 ? Number.parseFloat(product.container_norm) : 1
      });
      setVisibleProductImageSlotsCount(
        isProductImagesMobileLayout
          ? resolveProductVisibleSlotsCount(imageSlots)
          : PRODUCT_IMAGE_SLOTS_COUNT
      );
    } else {
      setSelectedProduct(null);
      setProductForm({
        category_id: '',
        name_ru: '',
        name_uz: '',
        description_ru: '',
        description_uz: '',
        image_url: '',
        thumb_url: '',
        product_images: createProductImageSlots([]),
        price: '',
        unit: 'шт',
        sort_order: 0,
        order_step: '',
        discount_enabled: false,
        discount_price: '',
        stock_quantity: '',
        barcode: '',
        ikpu: '',
        in_stock: true,
        season_scope: 'all',
        is_hidden_catalog: false,
        size_enabled: false,
        variant_options: [],
        size_options: [],
        container_id: '',
        container_norm: 1
      });
      setVisibleProductImageSlotsCount(isProductImagesMobileLayout ? 1 : PRODUCT_IMAGE_SLOTS_COUNT);
    }
    setIsGeneratingProductLocalizedText(false);
    setProductContainerLabelWordIndex(0);
    setShowProductModal(true);
  };

  const getCategoryById = (categoryId) => categories.find((cat) => String(cat.id) === String(categoryId));
  const isTopLevelCategorySelection = (categoryId) => {
    const selected = getCategoryById(categoryId);
    return Boolean(selected && !selected.parent_id);
  };
  const updateProductImageSlot = (slotIndex, nextUrl, nextThumbUrl = '') => {
    setProductForm((prev) => {
      const slots = createProductImageSlots(prev.product_images, prev.image_url, prev.thumb_url);
      if (slotIndex < 0 || slotIndex >= PRODUCT_IMAGE_SLOTS_COUNT) return prev;

      const normalizedUrl = String(nextUrl || '').trim();
      slots[slotIndex] = normalizedUrl
        ? { url: normalizedUrl, thumb_url: String(nextThumbUrl || '').trim() }
        : { url: '', thumb_url: '' };

      if (!slots[0].url) {
        const firstFilledSlotIndex = slots.findIndex((slot) => slot.url);
        if (firstFilledSlotIndex > 0) {
          [slots[0], slots[firstFilledSlotIndex]] = [slots[firstFilledSlotIndex], slots[0]];
        }
      }

      const mainSlot = slots.find((slot) => slot.url) || { url: '', thumb_url: '' };
      return {
        ...prev,
        image_url: mainSlot.url || '',
        thumb_url: mainSlot.thumb_url || '',
        product_images: slots
      };
    });
  };
  const clearProductImageSlot = (slotIndex) => {
    setProductForm((prev) => {
      const slots = createProductImageSlots(prev.product_images, prev.image_url, prev.thumb_url);
      if (slotIndex < 0 || slotIndex >= PRODUCT_IMAGE_SLOTS_COUNT) return prev;
      slots[slotIndex] = { url: '', thumb_url: '' };

      const normalizedImages = serializeProductImageSlots(slots);
      const normalizedSlots = createProductImageSlots(normalizedImages);
      const mainSlot = normalizedSlots.find((slot) => slot.url) || { url: '', thumb_url: '' };
      return {
        ...prev,
        image_url: mainSlot.url || '',
        thumb_url: mainSlot.thumb_url || '',
        product_images: normalizedSlots
      };
    });
  };
  const setMainProductImageSlot = (slotIndex) => {
    setProductForm((prev) => {
      const slots = createProductImageSlots(prev.product_images, prev.image_url, prev.thumb_url);
      if (slotIndex < 0 || slotIndex >= PRODUCT_IMAGE_SLOTS_COUNT) return prev;
      if (!slots[slotIndex]?.url || slotIndex === 0) return prev;

      [slots[0], slots[slotIndex]] = [slots[slotIndex], slots[0]];
      return {
        ...prev,
        image_url: slots[0].url || '',
        thumb_url: slots[0].thumb_url || '',
        product_images: slots
      };
    });
  };

  const requestRestaurantRegistrationQrMeta = useCallback(async () => {
    const response = await axios.get(`${API_URL}/admin/restaurant/registration-qr`, {
      params: { lang: language },
      timeout: ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS
    });
    return response.data || {};
  }, [language]);

  const fetchRestaurantRegistrationQrPreview = useCallback(async () => {
    const currentToken = String(restaurantSettings?.telegram_bot_token || '').trim();
    if (!currentToken) {
      setRegistrationQrPreviewMeta(null);
      setRegistrationQrPreviewError('');
      setLoadingRegistrationQrPreview(false);
      return;
    }

    setLoadingRegistrationQrPreview(true);
    setRegistrationQrPreviewError('');
    try {
      const qrMeta = await requestRestaurantRegistrationQrMeta();
      const qrUrl = qrMeta?.qr_url_full || qrMeta?.qr_url || '';
      if (!qrUrl) {
        throw new Error('QR URL отсутствует');
      }
      setRegistrationQrPreviewMeta({ ...qrMeta, qr_url_full: qrUrl });
    } catch (error) {
      setRegistrationQrPreviewMeta(null);
      setRegistrationQrPreviewError(
        error.response?.data?.error || error.message || 'Не удалось загрузить QR-код'
      );
    } finally {
      setLoadingRegistrationQrPreview(false);
    }
  }, [requestRestaurantRegistrationQrMeta, restaurantSettings?.telegram_bot_token]);

  const downloadRestaurantRegistrationQr = async () => {
    if (downloadingRegistrationQr) return;
    const currentToken = String(restaurantSettings?.telegram_bot_token || '').trim();
    if (!currentToken) {
      setAlertMessage({ type: 'warning', text: 'Сначала укажите и сохраните Bot Token.' });
      return;
    }

    setDownloadingRegistrationQr(true);
    try {
      const qrMeta = await requestRestaurantRegistrationQrMeta();
      const qrUrl = qrMeta?.qr_url_full || qrMeta?.qr_url || '';
      if (!qrUrl) {
        throw new Error('QR URL отсутствует');
      }
      setRegistrationQrPreviewMeta((prev) => ({ ...(prev || {}), ...qrMeta, qr_url_full: qrUrl }));

      const imageResponse = await axios.get(qrUrl, { responseType: 'blob' });
      const qrBlob = imageResponse?.data;
      if (!qrBlob) {
        throw new Error('Не удалось получить файл QR');
      }

      const restaurantPartRaw = String(
        qrMeta?.restaurant_name || restaurantSettings?.name || 'store'
      ).trim();
      const botPartRaw = String(qrMeta?.bot_username || '').replace(/^@/, '').trim();
      const restaurantPart = restaurantPartRaw.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'store';
      const botPart = botPartRaw.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'bot';
      const filename = `registration-qr-${restaurantPart}-${botPart}.png`;

      const objectUrl = window.URL.createObjectURL(qrBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);

      setAlertMessage({ type: 'success', text: 'QR-код скачан.' });
    } catch (error) {
      console.error('Download restaurant registration QR error:', error);
      setAlertMessage({
        type: 'danger',
        text: error.response?.data?.error || 'Не удалось скачать QR-код'
      });
    } finally {
      setDownloadingRegistrationQr(false);
    }
  };

  useEffect(() => {
    if (settingsTab !== 'general') return;
    fetchRestaurantRegistrationQrPreview();
  }, [settingsTab, fetchRestaurantRegistrationQrPreview]);

  const addProductImageSlot = () => {
    setVisibleProductImageSlotsCount((prev) => clampProductVisibleSlotsCount(prev + 1));
  };
  const toggleProductVariantsEnabled = (isEnabled) => {
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const currentVariants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      const enablingFromDisabled = isEnabled && !prev.size_enabled;
      const nextVariants = enablingFromDisabled
        ? [createProductVariantDraft('', fallbackBasePrice, true, {
          ikpu: prev.ikpu || '',
          container_id: prev.container_id || '',
          container_norm: prev.container_norm,
          order_step: prev.order_step,
          unit: prev.unit || 'шт'
        })]
        : currentVariants;
      return {
        ...prev,
        size_enabled: isEnabled,
        discount_enabled: isEnabled ? false : prev.discount_enabled,
        discount_price: isEnabled ? '' : prev.discount_price,
        stock_quantity: isEnabled ? '' : prev.stock_quantity,
        variant_options: nextVariants,
        size_options: normalizeProductVariantOptions(nextVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const addEmptyProductVariantRow = () => {
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const currentVariants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      if (currentVariants.length >= MAX_PRODUCT_SIZE_OPTIONS) return prev;
      const cleanedVariants = currentVariants.filter((variant) => (
        String(variant.name || '').trim()
        || String(variant.description_ru || '').trim()
        || String(variant.description_uz || '').trim()
        || String(variant.barcode || '').trim()
        || String(variant.ikpu || '').trim()
        || Number.isFinite(normalizeProductPriceValue(variant.price, NaN))
        || (Boolean(variant.discount_enabled) && Number.isFinite(normalizeProductPriceValue(variant.discount_price, NaN)))
        || Number.isFinite(Number.parseFloat(String(variant.stock_quantity ?? '').replace(',', '.')))
        || variant.in_stock === false
        || (String(variant.container_id || '').trim() && Number.parseFloat(variant.container_norm) > 0)
        || (prev.unit === 'кг' && Number.parseFloat(variant.order_step) > 0)
        || (Array.isArray(variant.product_images) && variant.product_images.some((img) => String(img?.url || '').trim()))
      ));
      const nextVariants = [...cleanedVariants, createProductVariantDraft('', fallbackBasePrice, true)];
      return {
        ...prev,
        variant_options: nextVariants,
        size_options: normalizeProductVariantOptions(nextVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const preserveProductModalScrollPosition = useCallback(() => {
    if (!showProductModal) return;
    const modalBody = productModalBodyRef.current;
    if (!modalBody) return;
    pendingProductModalScrollTopRef.current = modalBody.scrollTop;
  }, [showProductModal]);

  useEffect(() => {
    const pendingScrollTop = pendingProductModalScrollTopRef.current;
    if (!Number.isFinite(pendingScrollTop)) return;
    pendingProductModalScrollTopRef.current = null;
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const modalBody = productModalBodyRef.current;
      if (!modalBody) return;
      modalBody.scrollTop = pendingScrollTop;
    });
  }, [productForm.variant_options, uploadingImage]);

  const updateProductVariantOption = (index, field, value) => {
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const variants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      if (index < 0 || index >= variants.length) return prev;

      const nextVariants = variants.map((variant, variantIndex) => {
        if (variantIndex !== index) return variant;
        if (field === 'price') {
          const nextPrice = sanitizeProductPriceInputValue(value);
          const parsedNextPrice = normalizeProductPriceValue(nextPrice, NaN);
          const parsedDiscountPrice = normalizeProductPriceValue(variant.discount_price, NaN);
          const keepDiscount = (
            Boolean(variant.discount_enabled)
            && Number.isFinite(parsedNextPrice)
            && Number.isFinite(parsedDiscountPrice)
            && parsedDiscountPrice > 0
            && parsedDiscountPrice < parsedNextPrice
          );
          return {
            ...variant,
            price: nextPrice,
            discount_enabled: keepDiscount,
            discount_price: keepDiscount ? variant.discount_price : ''
          };
        }
        if (field === 'name') {
          const nextName = String(value || '').slice(0, 60);
          return {
            ...variant,
            name: nextName,
            __draft: !nextName.trim()
          };
        }
        if (field === 'barcode') {
          return {
            ...variant,
            barcode: String(value || '').slice(0, 120)
          };
        }
        if (field === 'ikpu') {
          return {
            ...variant,
            ikpu: String(value || '').slice(0, 64)
          };
        }
        if (field === 'container_id') {
          const nextContainerId = String(value || '').trim();
          return {
            ...variant,
            container_id: nextContainerId,
            container_norm: nextContainerId
              ? normalizeProductVariantContainerNormValue(variant.container_norm, 1)
              : 1
          };
        }
        if (field === 'container_norm') {
          return {
            ...variant,
            container_norm: normalizeProductVariantContainerNormValue(value, 1)
          };
        }
        if (field === 'order_step') {
          return {
            ...variant,
            order_step: normalizeProductVariantOrderStepValue(value, prev.unit || 'шт', '')
          };
        }
        if (field === 'description_ru' || field === 'description_uz') {
          return {
            ...variant,
            [field]: String(value || '').slice(0, 1500)
          };
        }
        if (field === 'discount_enabled') {
          const enabled = value === true;
          const parsedPrice = normalizeProductPriceValue(variant.price, NaN);
          const parsedDiscountPrice = normalizeProductPriceValue(variant.discount_price, NaN);
          const keepDiscountPrice = enabled
            && Number.isFinite(parsedPrice)
            && Number.isFinite(parsedDiscountPrice)
            && parsedDiscountPrice > 0
            && parsedDiscountPrice < parsedPrice;
          return {
            ...variant,
            discount_enabled: enabled && keepDiscountPrice,
            discount_price: enabled ? variant.discount_price : ''
          };
        }
        if (field === 'discount_price') {
          const parsedPrice = normalizeProductPriceValue(variant.price, NaN);
          const nextDiscountPrice = sanitizeProductPriceInputValue(value);
          const parsedDiscountPrice = normalizeProductPriceValue(nextDiscountPrice, NaN);
          const hasValidDiscount = Number.isFinite(parsedPrice)
            && Number.isFinite(parsedDiscountPrice)
            && parsedDiscountPrice > 0
            && parsedDiscountPrice < parsedPrice;
          return {
            ...variant,
            discount_enabled: hasValidDiscount,
            discount_price: nextDiscountPrice
          };
        }
        if (field === 'stock_quantity') {
          return {
            ...variant,
            stock_quantity: sanitizeProductStockInputValue(value)
          };
        }
        if (field === 'in_stock') {
          return {
            ...variant,
            in_stock: value !== false
          };
        }
        return variant;
      });

      const normalizedVariants = normalizeProductVariantOptionsForEditor(nextVariants, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      return {
        ...prev,
        variant_options: normalizedVariants,
        size_options: normalizeProductVariantOptions(normalizedVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const updateProductVariantImageSlot = (variantIndex, slotIndex, nextUrl, nextThumbUrl = '') => {
    preserveProductModalScrollPosition();
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const variants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      if (variantIndex < 0 || variantIndex >= variants.length) return prev;

      const nextVariants = variants.map((variant, currentVariantIndex) => {
        if (currentVariantIndex !== variantIndex) return variant;
        const slots = createVariantImageSlots(variant.product_images, variant.image_url, variant.thumb_url);
        if (slotIndex < 0 || slotIndex >= VARIANT_IMAGE_SLOTS_COUNT) return variant;
        const currentVisibleSlotsCount = resolveVariantVisibleSlotsCount(variant);

        const normalizedUrl = String(nextUrl || '').trim();
        slots[slotIndex] = normalizedUrl
          ? { url: normalizedUrl, thumb_url: String(nextThumbUrl || '').trim() }
          : { url: '', thumb_url: '' };

        if (!slots[0].url) {
          const firstFilledSlotIndex = slots.findIndex((slot) => slot.url);
          if (firstFilledSlotIndex > 0) {
            [slots[0], slots[firstFilledSlotIndex]] = [slots[firstFilledSlotIndex], slots[0]];
          }
        }

        const normalizedSlots = serializeVariantImageSlots(slots);
        const mainSlot = normalizedSlots[0] || { url: '', thumb_url: '' };
        return {
          ...variant,
          image_url: mainSlot.url || '',
          thumb_url: mainSlot.thumb_url || '',
          product_images: normalizedSlots,
          __slots_count: clampVariantVisibleSlotsCount(
            slotIndex >= currentVisibleSlotsCount
              ? slotIndex + 1
              : currentVisibleSlotsCount
          )
        };
      });

      const normalizedVariants = normalizeProductVariantOptionsForEditor(nextVariants, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      return {
        ...prev,
        variant_options: normalizedVariants,
        size_options: normalizeProductVariantOptions(normalizedVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const addProductVariantImageSlot = (variantIndex) => {
    preserveProductModalScrollPosition();
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const variants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      if (variantIndex < 0 || variantIndex >= variants.length) return prev;

      const nextVariants = variants.map((variant, currentVariantIndex) => {
        if (currentVariantIndex !== variantIndex) return variant;
        const currentVisibleSlotsCount = resolveVariantVisibleSlotsCount(variant);
        return {
          ...variant,
          __slots_count: clampVariantVisibleSlotsCount(currentVisibleSlotsCount + 1)
        };
      });

      const normalizedVariants = normalizeProductVariantOptionsForEditor(nextVariants, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      return {
        ...prev,
        variant_options: normalizedVariants,
        size_options: normalizeProductVariantOptions(normalizedVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const clearProductVariantImageSlot = (variantIndex, slotIndex) => {
    updateProductVariantImageSlot(variantIndex, slotIndex, '', '');
  };
  const setMainProductVariantImageSlot = (variantIndex, slotIndex) => {
    preserveProductModalScrollPosition();
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const variants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      if (variantIndex < 0 || variantIndex >= variants.length) return prev;

      const nextVariants = variants.map((variant, currentVariantIndex) => {
        if (currentVariantIndex !== variantIndex) return variant;
        const slots = createVariantImageSlots(variant.product_images, variant.image_url, variant.thumb_url);
        if (slotIndex < 0 || slotIndex >= VARIANT_IMAGE_SLOTS_COUNT) return variant;
        if (!slots[slotIndex]?.url || slotIndex === 0) return variant;

        [slots[0], slots[slotIndex]] = [slots[slotIndex], slots[0]];
        const normalizedSlots = serializeVariantImageSlots(slots);
        return {
          ...variant,
          image_url: normalizedSlots[0]?.url || '',
          thumb_url: normalizedSlots[0]?.thumb_url || '',
          product_images: normalizedSlots
        };
      });

      const normalizedVariants = normalizeProductVariantOptionsForEditor(nextVariants, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      return {
        ...prev,
        variant_options: normalizedVariants,
        size_options: normalizeProductVariantOptions(normalizedVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const handlePasteToVariantImageSlot = (variantIndex, e) => {
    preserveProductModalScrollPosition();
    const fallbackBasePrice = normalizeProductPriceValue(productForm.price, NaN);
    const variants = normalizeProductVariantOptionsForEditor(productForm.variant_options, {
      fallbackPrice: fallbackBasePrice,
      unit: productForm.unit || 'шт'
    });
    const variant = variants[variantIndex];
    if (!variant) return;
    const variantSlots = createVariantImageSlots(variant.product_images, variant.image_url, variant.thumb_url);
    const firstEmptySlotIndex = variantSlots.findIndex((slot) => !String(slot?.url || '').trim());
    const targetSlotIndex = firstEmptySlotIndex >= 0 ? firstEmptySlotIndex : 0;
    handlePaste(
      e,
      (url, meta) => updateProductVariantImageSlot(
        variantIndex,
        targetSlotIndex,
        url,
        meta?.thumbUrl || meta?.thumb_url || ''
      ),
      { preset: 'product' }
    );
  };
  const removeProductVariantOption = (index) => {
    setProductForm((prev) => {
      const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
      const variants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      if (index < 0 || index >= variants.length) return prev;
      const nextVariantsRaw = variants.filter((_, variantIndex) => variantIndex !== index);
      const nextVariants = nextVariantsRaw.length === 0 && prev.size_enabled
        ? [createProductVariantDraft('', fallbackBasePrice, true, {
          ikpu: prev.ikpu || '',
          container_id: prev.container_id || '',
          container_norm: prev.container_norm,
          order_step: prev.order_step,
          unit: prev.unit || 'шт'
        })]
        : nextVariantsRaw;
      const normalizedVariants = normalizeProductVariantOptionsForEditor(nextVariants, {
        fallbackPrice: fallbackBasePrice,
        unit: prev.unit || 'шт'
      });
      return {
        ...prev,
        variant_options: normalizedVariants,
        size_options: normalizeProductVariantOptions(normalizedVariants, {
          fallbackPrice: fallbackBasePrice,
          unit: prev.unit || 'шт'
        }).map((variant) => variant.name)
      };
    });
  };
  const handleGenerateProductLocalizedText = async () => {
    const sourceNameRu = String(productForm.name_ru || '').trim();
    const sourceNameUz = String(productForm.name_uz || '').trim();
    const sourceVariants = normalizeProductVariantOptionsForEditor(productForm.variant_options, {
      fallbackPrice: normalizeProductPriceValue(productForm.price, NaN),
      unit: productForm.unit || 'шт'
    })
      .map((variant) => String(variant?.name || '').trim())
      .filter(Boolean);

    if (!sourceNameRu && !sourceNameUz) {
      alert(
        language === 'uz'
          ? "AI generatsiya uchun kamida bitta nom kiriting: RU yoki UZ."
          : 'Для AI-генерации заполните хотя бы одно название: RU или UZ.'
      );
      return;
    }

    setIsGeneratingProductLocalizedText(true);
    try {
      const response = await axios.post(`${API_URL}/admin/products/description-preview`, {
        name_ru: sourceNameRu,
        name_uz: sourceNameUz,
        variants: sourceVariants
      });
      const generated = response?.data || {};
      setProductForm((prev) => ({
        ...prev,
        name_ru: String(generated.name_ru || '').trim() || String(prev.name_ru || '').trim() || String(prev.name_uz || '').trim(),
        name_uz: String(generated.name_uz || '').trim() || String(prev.name_uz || '').trim() || String(prev.name_ru || '').trim(),
        description_ru: String(generated.description_ru || '').trim() || String(prev.description_ru || '').trim(),
        description_uz: String(generated.description_uz || '').trim() || String(prev.description_uz || '').trim(),
        variant_options: (() => {
          const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
          const currentVariants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
            fallbackPrice: fallbackBasePrice,
            unit: prev.unit || 'шт'
          });
          const generatedVariantDescriptions = Array.isArray(generated.variant_descriptions)
            ? generated.variant_descriptions
            : [];
          const generatedMap = new Map(
            generatedVariantDescriptions
              .map((item) => {
                const key = String(item?.name || '').trim().toLowerCase();
                if (!key) return null;
                return [key, item];
              })
              .filter(Boolean)
          );
          return currentVariants.map((variant) => {
            const key = String(variant?.name || '').trim().toLowerCase();
            if (!key || !generatedMap.has(key)) return variant;
            const generatedVariant = generatedMap.get(key) || {};
            return {
              ...variant,
              description_ru: String(generatedVariant.description_ru || '').trim() || String(variant.description_ru || '').trim(),
              description_uz: String(generatedVariant.description_uz || '').trim() || String(variant.description_uz || '').trim()
            };
          });
        })()
      }));
    } catch (error) {
      alert(
        language === 'uz'
          ? `AI generatsiya xatosi: ${error?.response?.data?.error || error.message}`
          : `Ошибка AI-генерации: ${error?.response?.data?.error || error.message}`
      );
    } finally {
      setIsGeneratingProductLocalizedText(false);
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();

    if (isTopLevelCategorySelection(productForm.category_id)) {
      alert('Товар нельзя добавлять в категорию 1-го уровня. Выберите субкатегорию.');
      return;
    }

    const normalizedNameRu = String(productForm.name_ru || '').trim();
    const normalizedNameUz = String(productForm.name_uz || '').trim();
    if (!normalizedNameRu && !normalizedNameUz) {
      alert(
        language === 'uz'
          ? "Kamida bitta nomni kiriting: RU yoki UZ."
          : 'Укажите название товара хотя бы на одном языке: RU или UZ.'
      );
      return;
    }

    try {
      const normalizedPrice = normalizeProductPriceValue(productForm.price);
      const normalizedVariantOptions = normalizeProductVariantOptions(productForm.variant_options, {
        fallbackPrice: normalizedPrice,
        fallbackIkpu: productForm.ikpu || '',
        fallbackContainerId: productForm.container_id || '',
        fallbackContainerNorm: productForm.container_norm,
        fallbackOrderStep: productForm.order_step,
        unit: productForm.unit || 'шт',
        inventoryTrackingEnabled: Boolean(restaurantSettings?.inventory_tracking_enabled),
        inventoryThreshold: Math.max(0, Number.parseFloat(restaurantSettings?.inventory_min_threshold) || 0)
      });
      const isVariantsMode = Boolean(productForm.size_enabled);
      if (isVariantsMode) {
        if (!normalizedVariantOptions.length) {
          alert('Добавьте минимум один вариант товара');
          return;
        }
        const invalidVariant = normalizedVariantOptions.find((variant) => (
          !String(variant.name || '').trim()
          || !Number.isFinite(normalizeProductPriceValue(variant.price))
          || normalizeProductPriceValue(variant.price) <= 0
        ));
        if (invalidVariant) {
          alert(`Укажите название и цену для варианта "${invalidVariant.name || 'без названия'}"`);
          return;
        }
      }
      const variantFallbackPrice = normalizeProductPriceValue(
        normalizedVariantOptions.find((variant) => Number.isFinite(normalizeProductPriceValue(variant.price)))?.price,
        NaN
      );
      const effectivePrice = Number.isFinite(normalizedPrice) && normalizedPrice > 0
        ? normalizedPrice
        : variantFallbackPrice;
      if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
        alert('Укажите корректную цену больше 0');
        return;
      }
      const inventoryTrackingEnabled = Boolean(restaurantSettings?.inventory_tracking_enabled);
      const inventoryMinThreshold = Math.max(0, Number.parseFloat(restaurantSettings?.inventory_min_threshold) || 0);
      const effectiveVariantOptions = isVariantsMode
        ? normalizedVariantOptions.map((variant) => {
          const variantBasePrice = normalizeProductPriceValue(variant.price, NaN);
          const variantDiscountPrice = normalizeProductPriceValue(variant.discount_price, NaN);
          const hasVariantDiscount = Number.isFinite(variantBasePrice)
            && Number.isFinite(variantDiscountPrice)
            && variantDiscountPrice > 0
            && variantDiscountPrice < variantBasePrice;
          const parsedVariantStock = Number.parseFloat(
            String(variant.stock_quantity ?? '')
              .replace(/\s+/g, '')
              .replace(',', '.')
          );
          const normalizedVariantStock = inventoryTrackingEnabled
            ? (Number.isFinite(parsedVariantStock) && parsedVariantStock >= 0 ? parsedVariantStock : Number.NaN)
            : null;
          const normalizedVariantInStock = inventoryTrackingEnabled
            ? (Number.isFinite(normalizedVariantStock) && normalizedVariantStock > inventoryMinThreshold)
            : (variant.in_stock !== false);
          return {
            ...variant,
            discount_enabled: hasVariantDiscount,
            discount_price: hasVariantDiscount ? variantDiscountPrice : null,
            stock_quantity: inventoryTrackingEnabled
              ? (Number.isFinite(normalizedVariantStock)
                ? Math.round((normalizedVariantStock + Number.EPSILON) * 1000) / 1000
                : Number.NaN)
              : null,
            in_stock: normalizedVariantInStock
          };
        })
        : normalizedVariantOptions;

      if (isVariantsMode) {
        const invalidVariantDiscount = effectiveVariantOptions.find((variant) => {
          const basePrice = normalizeProductPriceValue(variant.price, NaN);
          const discountPriceRaw = normalizeProductPriceValue(
            variant.discount_price ?? variant.discountPrice ?? '',
            Number.NaN
          );
          const hasDiscountField = String(variant.discount_price ?? variant.discountPrice ?? '').trim() !== '';
          if (!hasDiscountField) return false;
          return !Number.isFinite(discountPriceRaw) || !Number.isFinite(basePrice) || discountPriceRaw <= 0 || discountPriceRaw >= basePrice;
        });
        if (invalidVariantDiscount) {
          alert(`Проверьте скидку у варианта "${invalidVariantDiscount.name || 'без названия'}"`);
          return;
        }
        if (inventoryTrackingEnabled) {
          const invalidVariantStock = effectiveVariantOptions.find((variant) => !Number.isFinite(Number(variant.stock_quantity)));
          if (invalidVariantStock) {
            alert(`Укажите корректный остаток у варианта "${invalidVariantStock.name || 'без названия'}"`);
            return;
          }
        }
      }

      const totalVariantsStock = isVariantsMode && inventoryTrackingEnabled
        ? effectiveVariantOptions.reduce(
          (sum, variant) => Math.round((sum + (Number.isFinite(Number(variant.stock_quantity)) ? Number(variant.stock_quantity) : 0) + Number.EPSILON) * 1000) / 1000,
          0
        )
        : null;
      const variantsInStock = isVariantsMode
        ? effectiveVariantOptions.some((variant) => variant.in_stock !== false)
        : false;
      const discountToggleEnabled = Boolean(productForm.discount_enabled) && !isVariantsMode;
      const normalizedDiscountPrice = discountToggleEnabled
        ? normalizeProductPriceValue(productForm.discount_price, NaN)
        : Number.NaN;
      if (discountToggleEnabled) {
        if (!Number.isFinite(normalizedDiscountPrice) || normalizedDiscountPrice <= 0) {
          alert(language === 'uz'
            ? "Chegirma narxini to'g'ri kiriting"
            : 'Укажите корректную цену со скидкой');
          return;
        }
        if (normalizedDiscountPrice >= effectivePrice) {
          alert(language === 'uz'
            ? "Chegirma narxi asosiy narxdan kichik bo'lishi kerak"
            : 'Цена со скидкой должна быть меньше основной цены');
          return;
        }
      }
      const effectiveDiscountPrice = discountToggleEnabled
        && Number.isFinite(normalizedDiscountPrice)
        && normalizedDiscountPrice > 0
        && normalizedDiscountPrice < effectivePrice
        ? normalizedDiscountPrice
        : null;
      const parsedStockQuantity = Number.parseFloat(
        String(productForm.stock_quantity ?? '')
          .replace(/\s+/g, '')
          .replace(',', '.')
      );
      const normalizedStockQuantity = inventoryTrackingEnabled && !isVariantsMode
        ? (Number.isFinite(parsedStockQuantity) && parsedStockQuantity >= 0 ? parsedStockQuantity : Number.NaN)
        : null;
      if (inventoryTrackingEnabled && !isVariantsMode && !Number.isFinite(normalizedStockQuantity)) {
        alert(language === 'uz'
          ? "Iltimos, ombordagi qoldiq sonini kiriting"
          : 'Укажите корректный остаток товара на складе');
        return;
      }
      const normalizedInStock = isVariantsMode
        ? variantsInStock
        : (inventoryTrackingEnabled
          ? normalizedStockQuantity > inventoryMinThreshold
          : (productForm.in_stock !== false));
      const normalizedImages = serializeProductImageSlots(productForm.product_images);
      const mainImage = normalizedImages[0] || { url: '', thumb_url: '' };
      const effectiveNameRu = normalizedNameRu || normalizedNameUz;
      const effectiveNameUz = normalizedNameUz || normalizedNameRu;
      const productData = {
        ...productForm,
        name_ru: effectiveNameRu,
        name_uz: effectiveNameUz,
        description_ru: String(productForm.description_ru || '').trim(),
        description_uz: String(productForm.description_uz || '').trim(),
        image_url: mainImage.url || '',
        thumb_url: mainImage.thumb_url || '',
        product_images: normalizedImages,
        price: effectivePrice,
        in_stock: normalizedInStock,
        stock_quantity: isVariantsMode
          ? (inventoryTrackingEnabled ? totalVariantsStock : null)
          : (inventoryTrackingEnabled ? normalizedStockQuantity : null),
        order_step: productForm.unit === 'кг'
          ? (() => {
            const parsed = Number.parseFloat(String(productForm.order_step || '').replace(',', '.'));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          })()
          : null,
        ikpu: String(productForm.ikpu || '').trim().slice(0, 64),
        container_norm: Math.max(1, Number.parseFloat(productForm.container_norm) || 1),
        size_enabled: Boolean(productForm.size_enabled),
        discount_enabled: isVariantsMode ? false : Boolean(effectiveDiscountPrice),
        discount_price: isVariantsMode ? null : effectiveDiscountPrice,
        variant_options: effectiveVariantOptions,
        size_options: effectiveVariantOptions
      };

      if (selectedProduct) {
        await axios.put(`${API_URL}/admin/products/${selectedProduct.id}`, productData);
      } else {
        await axios.post(`${API_URL}/admin/products`, productData);
      }

      setShowProductModal(false);
      fetchData();
    } catch (error) {
      console.error('Product save error:', error);
      alert('Ошибка сохранения товара: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот товар?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/admin/products/${productId}`);
      fetchData();
    } catch (error) {
      console.error('Delete product error:', error);
      alert('Ошибка удаления товара');
    }
  };

  function hasAcceptedStatusAction(order) {
    const actions = Array.isArray(order?.status_actions) ? order.status_actions : [];
    return actions.some((action) => normalizeOrderActionStatus(action?.status) === 'accepted');
  }

  function getOrderDisplayWorkflowStatus(order) {
    if (!order) return 'new';
    const normalizedStatus = order.status === 'in_progress' ? 'preparing' : order.status;
    if (normalizedStatus === 'new' && (Boolean(order.processed_at) || hasAcceptedStatusAction(order))) {
      return 'accepted';
    }
    return normalizedStatus;
  }

  const isOrderSensitiveDataHidden = (order) => getOrderDisplayWorkflowStatus(order) === 'new';

  const getOrderMainActionConfig = (order) => {
    const rawOrderStatus = order?.status === 'in_progress' ? 'preparing' : order?.status;
    const orderStatus = getOrderDisplayWorkflowStatus(order);
    const needsBillingPayment = !order?.is_paid && !billingInfo?.restaurant?.is_free_tier;

    if (rawOrderStatus === 'new' && needsBillingPayment) {
      return {
        variant: 'success',
        label: '✅ Принять',
        title: 'Принять и оплатить',
        onClick: () => handleAcceptAndPay(order.id),
        textWhite: false
      };
    }

    if ((rawOrderStatus === 'new' || orderStatus === 'accepted') && !needsBillingPayment) {
      return {
        variant: 'warning',
        label: 'Готовится',
        title: 'Перевести в статус Готовится',
        onClick: () => updateOrderStatus(order.id, 'preparing'),
        textWhite: false
      };
    }

    if (orderStatus === 'preparing') {
      return {
        variant: 'info',
        label: 'Доставляется',
        title: 'Перевести в статус Доставляется',
        onClick: () => updateOrderStatus(order.id, 'delivering'),
        textWhite: true
      };
    }

    if (orderStatus === 'delivering') {
      return {
        variant: 'success',
        label: 'Доставлен',
        title: 'Перевести в статус Доставлен',
        onClick: () => updateOrderStatus(order.id, 'delivered'),
        textWhite: false
      };
    }

    return null;
  };

  const canCancelOrder = (order) => {
    const orderStatus = getOrderDisplayWorkflowStatus(order);
    return orderStatus !== 'cancelled' && orderStatus !== 'delivered';
  };

  const renderOrderMainActionButton = (order, options = {}) => {
    const { showPlaceholder = false, buttonClassName = 'admin-order-main-action-btn' } = options;
    const actionConfig = getOrderMainActionConfig(order);

    if (!actionConfig) {
      if (!showPlaceholder) return null;
      return <span className="admin-order-action-placeholder admin-order-action-placeholder-main" aria-hidden="true"></span>;
    }

    return (
      <Button
        variant={actionConfig.variant}
        size="sm"
        className={`${buttonClassName}${actionConfig.textWhite ? ' text-white' : ''}`}
        onClick={actionConfig.onClick}
        title={actionConfig.title}
      >
        {actionConfig.label}
      </Button>
    );
  };

  // Bulk delete selected products
  const handleBulkDeleteProducts = async () => {
    if (selectedProducts.length === 0) return;

    if (!window.confirm(`Вы уверены, что хотите удалить ${selectedProducts.length} товар(ов)?`)) {
      return;
    }

    try {
      let deleted = 0;
      let errors = 0;

      for (const productId of selectedProducts) {
        try {
          await axios.delete(`${API_URL}/admin/products/${productId}`);
          deleted++;
        } catch (err) {
          errors++;
        }
      }

      setSelectedProducts([]);
      fetchData();
      setAlertMessage({
        type: errors > 0 ? 'warning' : 'success',
        text: `Удалено: ${deleted}${errors > 0 ? `, Ошибок: ${errors}` : ''}`
      });
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Ошибка массового удаления');
    }
  };

  // Toggle product selection
  const toggleProductSelection = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Select all filtered products
  const toggleSelectAllProducts = (filteredProductIds) => {
    if (selectedProducts.length === filteredProductIds.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProductIds);
    }
  };

  const handleImageUpload = async (file, setImageUrl, options = {}) => {
    if (!file) return;

    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      alert('Файл слишком большой. Максимальный размер: 12MB');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      if (options.preset) {
        formData.append('preset', options.preset);
      }

      // axios.defaults.headers уже содержит Authorization токен
      const response = await axios.post(`${API_URL}/upload/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const fullUrl = toAbsoluteFileUrl(response.data?.url || response.data?.imageUrl);
      const thumbUrl = toAbsoluteFileUrl(response.data?.thumbUrl || response.data?.thumb_url);
      setImageUrl(fullUrl, { thumbUrl, response: response.data });
    } catch (error) {
      console.error('Image upload error:', error);
      alert('Ошибка загрузки изображения: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingImage(false);
    }
  };
  const productImageUploadHintText = language === 'uz'
    ? '⭐ - asosiy rasm, ✕ - o‘chirish, "Tanlash" tugmasi - fayl yuklash. Tavsiya: 1080×1080 px, 10 MB gacha.'
    : '⭐ - главное фото, ✕ - удалить, кнопка "Выбрать" - загрузка файла. Рекомендуемый размер: 1080×1080 px, до 10 МБ.';

  const handleRestaurantLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith('image/')) {
      setAlertMessage({ type: 'warning', text: 'Можно загружать только изображения' });
      e.target.value = '';
      return;
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      setAlertMessage({ type: 'warning', text: 'Файл слишком большой. Максимум 12MB' });
      e.target.value = '';
      return;
    }

    setUploadingRestaurantLogo(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await axios.post(`${API_URL}/upload/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const logoUrl = toAbsoluteFileUrl(response.data?.url || response.data?.imageUrl);
      setRestaurantSettings((prev) => ({ ...prev, logo_url: logoUrl }));
      setAlertMessage({ type: 'success', text: 'Логотип загружен. Нажмите "Сохранить изменения".' });
    } catch (error) {
      console.error('Restaurant logo upload error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка загрузки логотипа' });
    } finally {
      setUploadingRestaurantLogo(false);
      e.target.value = '';
    }
  };

  const applyUpdatedCategoryImageCategory = useCallback((updatedCategory) => {
    const updatedId = normalizeId(updatedCategory?.id);
    if (!updatedId) return;
    setCategoryImageCategories((prev) => (
      (Array.isArray(prev) ? prev : []).map((category) => (
        normalizeId(category?.id) === updatedId
          ? { ...category, ...updatedCategory }
          : category
      ))
    ));
  }, []);

  const saveCategoryImageOverride = useCallback(async ({ categoryId, useCustomImage, imageUrl }) => {
    if (!normalizeId(categoryId)) return;
    setSavingCategoryImageCategoryId(normalizeId(categoryId));
    try {
      const response = await axios.put(`${API_URL}/admin/categories/${categoryId}/store-image`, {
        use_custom_image: useCustomImage === true,
        image_url: imageUrl === undefined ? null : imageUrl
      });
      applyUpdatedCategoryImageCategory(response.data || {});
      return response.data || null;
    } catch (error) {
      console.error('Save store category image error:', error);
      setAlertMessage({
        type: 'danger',
        text: error.response?.data?.error || 'Ошибка сохранения фото категории'
      });
      return null;
    } finally {
      setSavingCategoryImageCategoryId(null);
    }
  }, [applyUpdatedCategoryImageCategory]);

  const handleToggleCategoryOwnImage = useCallback(async (category, checked) => {
    const categoryId = normalizeId(category?.id);
    if (!categoryId) return;
    const updated = await saveCategoryImageOverride({
      categoryId,
      useCustomImage: checked === true,
      imageUrl: checked === true ? (String(category?.custom_image_url || '').trim() || null) : null
    });
    if (updated) {
      setAlertMessage({
        type: 'success',
        text: checked
          ? 'Режим собственного фото включен для категории'
          : 'Категория возвращена к системному фото'
      });
    }
  }, [saveCategoryImageOverride]);

  const handleUploadOwnCategoryImage = useCallback(async (category, file) => {
    const categoryId = normalizeId(category?.id);
    if (!categoryId || !file) return;
    setCategoryImageUploadTargetId(categoryId);
    await handleImageUpload(file, async (uploadedUrl) => {
      if (!uploadedUrl) return;
      const updated = await saveCategoryImageOverride({
        categoryId,
        useCustomImage: true,
        imageUrl: uploadedUrl
      });
      if (updated) {
        setAlertMessage({
          type: 'success',
          text: 'Собственное фото категории сохранено'
        });
      }
    }, { preset: 'product' });
    setCategoryImageUploadTargetId(null);
  }, [handleImageUpload, saveCategoryImageOverride]);

  const handleCategoryImageFileChange = useCallback((event) => {
    const categoryId = normalizeId(categoryImageUploadTargetId);
    const category = categoryImageCategoriesById.get(categoryId);
    const file = event.target.files?.[0];
    if (category && file) {
      handleUploadOwnCategoryImage(category, file);
    }
    event.target.value = '';
  }, [categoryImageCategoriesById, categoryImageUploadTargetId, handleUploadOwnCategoryImage]);

  const handleClearOwnCategoryImage = useCallback(async (category) => {
    const categoryId = normalizeId(category?.id);
    if (!categoryId) return;
    const updated = await saveCategoryImageOverride({
      categoryId,
      useCustomImage: true,
      imageUrl: null
    });
    if (updated) {
      setAlertMessage({
        type: 'success',
        text: 'Собственное фото очищено. Показывается логотип магазина'
      });
    }
  }, [saveCategoryImageOverride]);

  // Handle paste from clipboard (Ctrl+V)
  const handlePaste = async (e, setImageUrl, options = {}) => {
    const items = Array.from(e.clipboardData?.items || []);
    if (!items.length) return false;

    const imageItem = items.find((item) => (
      String(item?.kind || '').toLowerCase() === 'file'
      && String(item?.type || '').toLowerCase().startsWith('image/')
    ));
    if (!imageItem) return false;

    e.preventDefault();
    e.stopPropagation();
    const file = imageItem.getAsFile();
    if (!file) return false;
    await handleImageUpload(file, setImageUrl, options);
    return true;
  };

  // Duplicate product
  const duplicateProduct = (product) => {
    setSelectedProduct(null);
    const duplicateImageSlots = createProductImageSlots([]);
    const duplicateVariantUnit = String(product.unit || 'шт').trim() || 'шт';
    const duplicateContainerNorm = normalizeProductVariantContainerNormValue(product.container_norm, 1);
    const duplicateOrderStep = Number.parseFloat(product.order_step) > 0 ? Number.parseFloat(product.order_step) : '';
    const sourceVariantOptions = normalizeProductVariantOptions(product.size_options, {
      fallbackPrice: normalizeProductPriceValue(product.price, NaN),
      fallbackIkpu: product.ikpu || '',
      fallbackContainerId: product.container_id || '',
      fallbackContainerNorm: duplicateContainerNorm,
      fallbackOrderStep: duplicateOrderStep,
      unit: duplicateVariantUnit
    });
    const duplicateVariantOptionsRaw = sourceVariantOptions.length
      ? sourceVariantOptions.map((variant) => ({ ...variant, __draft: false }))
      : (product.size_enabled === true
        ? [createProductVariantDraft('', normalizeProductPriceValue(product.price, NaN), true, {
          ikpu: product.ikpu || '',
          container_id: product.container_id || '',
          container_norm: duplicateContainerNorm,
          order_step: duplicateOrderStep,
          unit: duplicateVariantUnit
        })]
        : []);
    const duplicateVariantOptions = normalizeProductVariantOptionsForEditor(duplicateVariantOptionsRaw, {
      fallbackPrice: normalizeProductPriceValue(product.price, NaN),
      unit: duplicateVariantUnit
    });
    setProductForm({
      category_id: product.category_id || '',
      name_ru: product.name_ru || '',
      name_uz: product.name_uz || '',
      description_ru: '',
      description_uz: '',
      image_url: '', // Empty - admin fills manually
      thumb_url: '',
      product_images: duplicateImageSlots,
      price: '', // Empty - admin fills manually
      unit: product.unit || 'шт',
      sort_order: Number.isFinite(Number(product.sort_order)) ? Number(product.sort_order) : 0,
      order_step: Number.parseFloat(product.order_step) > 0 ? Number.parseFloat(product.order_step) : '',
      discount_enabled: false,
      discount_price: '',
      stock_quantity: '',
      barcode: '',
      ikpu: product.ikpu || '',
      in_stock: true,
      season_scope: product.season_scope || 'all',
      is_hidden_catalog: !!product.is_hidden_catalog,
      size_enabled: product.size_enabled === true,
      variant_options: duplicateVariantOptions,
      size_options: normalizeProductVariantOptions(duplicateVariantOptions, {
        fallbackPrice: normalizeProductPriceValue(product.price, NaN),
        unit: duplicateVariantUnit
      }).map((variant) => variant.name),
      container_id: product.container_id || '',
      container_norm: Number.parseFloat(product.container_norm) > 0 ? Number.parseFloat(product.container_norm) : 1
    });
    setVisibleProductImageSlotsCount(isProductImagesMobileLayout ? 1 : PRODUCT_IMAGE_SLOTS_COUNT);
    setShowProductModal(true);
  };

  const handleProductStockToggle = async (product, showAsOutOfStock) => {
    const nextInStock = !showAsOutOfStock;
    const productId = product?.id;
    if (!productId) return;

    setProductStockUpdatingIds((prev) => (
      prev.includes(productId) ? prev : [...prev, productId]
    ));

    try {
      const productData = {
        category_id: product.category_id,
        name_ru: product.name_ru || '',
        name_uz: product.name_uz || '',
        description_ru: product.description_ru || '',
        description_uz: product.description_uz || '',
        image_url: product.image_url || '',
        thumb_url: product.thumb_url || '',
        product_images: normalizeProductImageItems(product.product_images),
        price: Number(product.price || 0),
        unit: product.unit || 'шт',
        order_step: Number.parseFloat(product.order_step) > 0 ? Number.parseFloat(product.order_step) : null,
        discount_enabled: product.discount_enabled === true,
        discount_price: Number.isFinite(normalizeProductPriceValue(product.discount_price, NaN))
          ? normalizeProductPriceValue(product.discount_price, NaN)
          : null,
        stock_quantity: Number.isFinite(Number(product.stock_quantity))
          ? Number(product.stock_quantity)
          : 0,
        barcode: product.barcode || '',
        ikpu: product.ikpu || '',
        in_stock: nextInStock,
        sort_order: Number(product.sort_order || 0),
        container_id: product.container_id || null,
        container_norm: Math.max(1, Number(product.container_norm) || 1),
        season_scope: product.season_scope || 'all',
        is_hidden_catalog: !!product.is_hidden_catalog,
        size_enabled: product.size_enabled === true,
        size_options: normalizeProductVariantOptions(product.size_options, {
          fallbackPrice: normalizeProductPriceValue(product.price, NaN),
          fallbackIkpu: product.ikpu || '',
          fallbackContainerId: product.container_id || '',
          fallbackContainerNorm: product.container_norm,
          fallbackOrderStep: product.order_step,
          unit: product.unit || 'шт'
        })
      };

      const response = await axios.put(`${API_URL}/admin/products/${productId}`, productData);
      const updatedProduct = response.data || {};

      setProducts((prev) => prev.map((item) => (
        item.id === productId ? { ...item, ...updatedProduct } : item
      )));
    } catch (error) {
      console.error('Toggle product stock error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка обновления статуса товара' });
    } finally {
      setProductStockUpdatingIds((prev) => prev.filter((id) => id !== productId));
    }
  };

  // Excel Import
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelPreview, setExcelPreview] = useState([]);
  const [importingExcel, setImportingExcel] = useState(false);
  const [showPasteImportModal, setShowPasteImportModal] = useState(false);
  const [pastedImportRows, setPastedImportRows] = useState([]);
  const [pasteImportError, setPasteImportError] = useState('');
  const [showImportReviewModal, setShowImportReviewModal] = useState(false);
  const [preparedImportRows, setPreparedImportRows] = useState([]);
  const [savingImportRows, setSavingImportRows] = useState(false);
  const [showStockExcelModal, setShowStockExcelModal] = useState(false);
  const [stockExcelFile, setStockExcelFile] = useState(null);
  const [stockExcelPreview, setStockExcelPreview] = useState([]);
  const [importingStockExcel, setImportingStockExcel] = useState(false);
  const [showStockImportReviewModal, setShowStockImportReviewModal] = useState(false);
  const [preparedStockImportRows, setPreparedStockImportRows] = useState([]);
  const [savingStockImportRows, setSavingStockImportRows] = useState(false);
  const [stockImportMode, setStockImportMode] = useState('replace');
  const pasteImportInputRef = useRef(null);

  const closeExcelImportModal = () => {
    setShowExcelModal(false);
    setExcelFile(null);
    setExcelPreview([]);
  };

  const closePasteImportModal = () => {
    if (importingExcel) return;
    setShowPasteImportModal(false);
    setPastedImportRows([]);
    setPasteImportError('');
  };

  const closeImportReviewModal = () => {
    setShowImportReviewModal(false);
    setPreparedImportRows([]);
  };
  const closeStockExcelImportModal = () => {
    if (importingStockExcel) return;
    setShowStockExcelModal(false);
    setStockExcelFile(null);
    setStockExcelPreview([]);
  };
  const closeStockImportReviewModal = () => {
    if (savingStockImportRows) return;
    setShowStockImportReviewModal(false);
    setPreparedStockImportRows([]);
    setStockImportMode('replace');
  };

  const normalizeStockImportMode = (value) => (
    STOCK_IMPORT_MODE_VALUES.has(String(value || '').trim().toLowerCase())
      ? String(value || '').trim().toLowerCase()
      : 'replace'
  );

  const parseYesNoForImport = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    const v = String(value).trim().toLowerCase();
    if (['да', 'yes', 'y', 'true', '1', 'ha'].includes(v)) return true;
    if (['нет', 'no', 'n', 'false', '0', "yo'q", 'yoq'].includes(v)) return false;
    return fallback;
  };

  const parseSeasonScopeForImport = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const v = String(value).trim().toLowerCase();
    if (['all', 'всесезонный', 'все', 'hammasi', 'barcha'].includes(v)) return 'all';
    if (['spring', 'весна', 'bahor'].includes(v)) return 'spring';
    if (['summer', 'лето', 'yoz'].includes(v)) return 'summer';
    if (['autumn', 'fall', 'осень', 'kuz'].includes(v)) return 'autumn';
    if (['winter', 'зима', 'qish'].includes(v)) return 'winter';
    return undefined;
  };

  const resolveCategoryForImport = ({
    categoryIdRaw,
    categoryPathRaw,
    categoryNameRaw,
    categoryLevel1Raw,
    categoryLevel2Raw,
    categoryLevel3Raw
  }) => {
    const normalizeLevelName = (value) => String(value || '').trim().toLowerCase();
    const level1 = normalizeLevelName(categoryLevel1Raw);
    const level2 = normalizeLevelName(categoryLevel2Raw);
    const level3 = normalizeLevelName(categoryLevel3Raw);
    const hasLevelInput = level1 || level2 || level3;

    if (hasLevelInput) {
      const matchedCategories = importAssignableCategories.filter((category) => {
        const hierarchy = (category.path || '').split(' > ').map((part) => normalizeLevelName(part));
        const pathLevel1 = hierarchy[0] || '';
        const pathLevel2 = hierarchy[1] || '';
        const pathLevel3 = hierarchy[2] || '';
        if (level1 && pathLevel1 !== level1) return false;
        if (level2 && pathLevel2 !== level2) return false;
        if (level3 && pathLevel3 !== level3) return false;
        return true;
      });

      if (matchedCategories.length === 1) {
        return { category: matchedCategories[0], error: '' };
      }
      if (matchedCategories.length > 1) {
        return { category: null, error: 'Категории 1/2/3 неоднозначны, укажите точнее' };
      }
      return { category: null, error: 'Не найдена категория по связке 1/2/3' };
    }

    const categoryIdStr = String(categoryIdRaw ?? '').trim();
    if (categoryIdStr) {
      const byId = importCategoryById.get(categoryIdStr);
      if (byId) return { category: byId, error: '' };
      return { category: null, error: 'Категория ID не найдена среди доступных конечных категорий' };
    }

    const categoryPathStr = String(categoryPathRaw ?? '').trim();
    if (categoryPathStr) {
      const byPath = importCategoryByPath.get(categoryPathStr.toLowerCase());
      if (byPath) return { category: byPath, error: '' };
      return { category: null, error: 'Путь категории не совпадает с системным (строгое совпадение)' };
    }

    const categoryNameStr = String(categoryNameRaw ?? '').trim();
    if (!categoryNameStr) {
      return { category: null, error: 'Категория не заполнена' };
    }

    const byUniqueName = importCategoryByUniqueName.get(categoryNameStr.toLowerCase());
    if (byUniqueName) return { category: byUniqueName, error: '' };
    return { category: null, error: 'Категория не найдена или неоднозначна, выберите вручную из списка' };
  };

  const validatePreparedImportRow = (row) => {
    if (!row.name_ru) {
      return { ...row, isValid: false, error: 'Не заполнено название товара' };
    }
    if (!(row.price > 0)) {
      return { ...row, isValid: false, error: 'Цена должна быть больше 0' };
    }
    if (!row.category_id) {
      return { ...row, isValid: false, error: row.error || 'Категория не выбрана' };
    }
    return { ...row, isValid: true, error: '' };
  };

  useEffect(() => {
    if (!showPasteImportModal) return;
    const timer = setTimeout(() => {
      pasteImportInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [showPasteImportModal]);

  const operatorPasteImportDemoRows = useMemo(() => {
    if (language === 'uz') {
      return [
        ['Магазин', 'Бакалея', 'Крупы', 'Namuna «A»', 'Sample A', 'To‘liq tavsif A', 'To‘liq tavsif UZ A', '1500', 'шт', '4600000000001', '12345678901234', 'Ha', 'Hammasi', "Yo'q"],
        ['Магазин', 'Напитки', 'Соки', 'Namuna «B»', 'Sample B', 'To‘liq tavsif B', 'To‘liq tavsif UZ B', '89', 'шт', '4600000000002', '98765432109876', 'Ha', 'Yoz', "Yo'q"],
        ['Магазин', 'Заморозка', 'Пельмени', 'Namuna «C»', 'Sample C', 'To‘liq tavsif C', 'To‘liq tavsif UZ C', '200', 'кг', '4600000000003', '22222222222222', "Yo'q", 'Kuz', 'Ha']
      ];
    }
    return [
      ['Магазин', 'Бакалея', 'Крупы', 'Товар-пример «Альфа»', 'Alpha sample', 'Полное описание товара A', 'Подробное описание UZ A', '1500', 'шт', '4600000000001', '12345678901234', 'Да', 'Всесезонный', 'Нет'],
      ['Магазин', 'Напитки', 'Соки', 'Товар-пример «Бета»', 'Beta sample', 'Полное описание товара B', 'Подробное описание UZ B', '89', 'шт', '4600000000002', '98765432109876', 'Да', 'Лето', 'Нет'],
      ['Магазин', 'Заморозка', 'Пельмени', 'Товар-пример «Гамма»', 'Gamma sample', 'Полное описание товара C', 'Подробное описание UZ C', '200', 'кг', '4600000000003', '22222222222222', 'Нет', 'Осень', 'Да']
    ];
  }, [language]);

  const handleDownloadOperatorPasteTemplate = useCallback(async () => {
    try {
      const headers = OPERATOR_PASTE_IMPORT_TEMPLATE_HEADERS;
      const rows = operatorPasteImportDemoRows;
      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 14 }, { wch: 34 }, { wch: 24 }, { wch: 24 }, { wch: 16 },
        { wch: 28 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 16 },
        { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }
      ];

      let categoriesForTemplate = Array.isArray(categories) ? categories : [];
      if (!categoriesForTemplate.length) {
        const categoriesResponse = await axios.get(`${API_URL}/admin/categories`);
        categoriesForTemplate = Array.isArray(categoriesResponse.data) ? categoriesResponse.data : [];
        if (categoriesForTemplate.length) {
          applyCategoriesData(categoriesForTemplate);
        }
      }

      const categoryById = new Map();
      categoriesForTemplate.forEach((category) => {
        const categoryId = Number(category?.id);
        if (Number.isFinite(categoryId)) {
          categoryById.set(categoryId, category);
        }
      });

      const buildPathNames = (categoryId) => {
        const normalizedId = Number.parseInt(categoryId, 10);
        if (!Number.isFinite(normalizedId)) return [];
        const names = [];
        const visited = new Set();
        let current = categoryById.get(normalizedId);
        while (current && !visited.has(current.id)) {
          names.unshift(String(current?.name_ru || current?.name_uz || '').trim());
          visited.add(current.id);
          if (!current.parent_id) break;
          current = categoryById.get(Number(current.parent_id));
        }
        return names.filter(Boolean);
      };

      const categoriesRows = categoriesForTemplate
        .map((category) => {
          const pathNames = buildPathNames(category?.id);
          const level1 = pathNames[0] || '';
          const level2 = pathNames[1] || '';
          const level3 = pathNames[2] || '';
          return {
            'Категория 1': level1,
            'Категория 2': level2,
            'Категория 3': level3
          };
        })
        .sort((left, right) => (
          String([left['Категория 1'], left['Категория 2'], left['Категория 3']].filter(Boolean).join(' > '))
            .localeCompare(String([right['Категория 1'], right['Категория 2'], right['Категория 3']].filter(Boolean).join(' > ')), 'ru')
        ));

      const categoriesSheet = XLSX.utils.json_to_sheet(categoriesRows.length ? categoriesRows : [{
        'Категория 1': '',
        'Категория 2': '',
        'Категория 3': ''
      }]);
      categoriesSheet['!cols'] = [
        { wch: 24 },
        { wch: 24 },
        { wch: 24 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, language === 'uz' ? 'Shablon' : 'Шаблон');
      XLSX.utils.book_append_sheet(wb, categoriesSheet, language === 'uz' ? 'Kategoriyalar' : 'Категории');
      const stamp = new Date().toISOString().slice(0, 10);
      const base = language === 'uz' ? 'mahsulotlar_import_shablon' : 'import_tovarov_shablon';
      XLSX.writeFile(wb, `${base}_${stamp}.xlsx`);
      setSuccess(language === 'uz'
        ? 'Import shabloni yuklab olindi'
        : 'Шаблон импорта скачан');
    } catch (error) {
      setError(language === 'uz'
        ? "Shablonni yuklab bo'lmadi"
        : 'Не удалось скачать шаблон импорта');
    }
  }, [operatorPasteImportDemoRows, language, categories, applyCategoriesData]);

  const buildPreparedImportRows = (jsonData = [], rowNumberOffset = 2) => (
    (Array.isArray(jsonData) ? jsonData : []).map((row, index) => {
      const rowNo = index + rowNumberOffset;
      const categoryLevel1Raw = row['Категория 1'] ?? row.category_level_1 ?? row.category1;
      const categoryLevel2Raw = row['Категория 2'] ?? row.category_level_2 ?? row.category2;
      const categoryLevel3Raw = row['Категория 3'] ?? row.category_level_3 ?? row.category3;
      const categoryIdRaw = row['Категория ID'] ?? row.category_id;
      const categoryPathRaw = row['Категория путь'] ?? row['Путь категории'] ?? row.category_path;
      const categoryNameRaw = row['Категория'] ?? row.category_name;
      const categoryResolved = resolveCategoryForImport({
        categoryIdRaw,
        categoryPathRaw,
        categoryNameRaw,
        categoryLevel1Raw,
        categoryLevel2Raw,
        categoryLevel3Raw
      });

      const mappedRow = {
        rowNo,
        sourceCategoryLevel1: String(categoryLevel1Raw ?? '').trim(),
        sourceCategoryLevel2: String(categoryLevel2Raw ?? '').trim(),
        sourceCategoryLevel3: String(categoryLevel3Raw ?? '').trim(),
        sourceCategoryId: String(categoryIdRaw ?? '').trim(),
        sourceCategoryPath: String(categoryPathRaw ?? '').trim(),
        sourceCategoryName: String(categoryNameRaw ?? '').trim(),
        category_id: categoryResolved.category?.id || '',
        category_label: categoryResolved.category?.path || '',
        name_ru: String(row['Название (RU)'] || row['Название'] || row.name_ru || '').trim(),
        name_uz: String(row['Название (UZ)'] || row.name_uz || '').trim(),
        description_ru: String(row['Описание (RU)'] || row['Описание RU'] || row.description_ru || '').trim(),
        description_uz: String(row['Описание (UZ)'] || row['Описание UZ'] || row.description_uz || '').trim(),
        price: normalizeProductPriceValue(row['Цена'] ?? row.price, 0),
        unit: String(row['Единица'] || row['Ед. изм.'] || row['Ед.изм.'] || row.unit || 'шт').trim() || 'шт',
        barcode: String(row['Штрихкод'] || row['Баркод'] || row.barcode || '').replace(/\s+/g, '').slice(0, 120),
        ikpu: String(row['ИКПУ'] || row['Код ИКПУ'] || row.ikpu || '').replace(/\s+/g, ' ').trim().slice(0, 64),
        in_stock: parseYesNoForImport(row['В наличии'] ?? row.in_stock, true),
        season_scope: parseSeasonScopeForImport(row['Сезонность'] ?? row.season_scope),
        is_hidden_catalog: parseYesNoForImport(row['Скрыть из каталога'] ?? row.is_hidden_catalog, undefined),
        error: categoryResolved.error,
        isValid: false
      };

      return validatePreparedImportRow(mappedRow);
    })
  );

  const handleProductsPasteImport = (event) => {
    const clipboardText = event?.clipboardData?.getData('text/plain') || '';
    if (!clipboardText.trim()) return;
    event.preventDefault();

    const matrix = parseClipboardTableMatrix(clipboardText);
    const mappedRows = mapOperatorProductsPasteMatrixRows(matrix);
    if (!mappedRows.length) {
      setPastedImportRows([]);
      setPasteImportError('В буфере не найдено подходящих строк для импорта');
      return;
    }

    setPastedImportRows(mappedRows);
    setPasteImportError('');
  };

  const continuePasteImportToReview = () => {
    if (!pastedImportRows.length) {
      setPasteImportError('Сначала вставьте данные через Ctrl+V');
      return;
    }

    const jsonRows = pastedImportRows.map((row) => ({
      'Категория 1': row.sourceCategoryLevel1,
      'Категория 2': row.sourceCategoryLevel2,
      'Категория 3': row.sourceCategoryLevel3,
      'Название (RU)': row.name_ru,
      'Название (UZ)': row.name_uz,
      'Описание (RU)': row.description_ru,
      'Описание (UZ)': row.description_uz,
      'Цена': row.price_raw,
      'Единица': row.unit,
      'Штрихкод': row.barcode,
      'ИКПУ': row.ikpu,
      'В наличии': row.in_stock_raw,
      'Сезонность': row.season_scope_raw,
      'Скрыть из каталога': row.is_hidden_catalog_raw
    }));

    const preparedRows = buildPreparedImportRows(jsonRows, 2);
    setPreparedImportRows(preparedRows);
    setShowPasteImportModal(false);
    setPastedImportRows([]);
    setPasteImportError('');
    setShowImportReviewModal(true);
  };

  const handleExcelFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileValidationError = validateSpreadsheetImportFile(file);
    if (fileValidationError) {
      alert(fileValidationError);
      setExcelFile(null);
      setExcelPreview([]);
      return;
    }

    setExcelFile(file);

    // Read and preview Excel file
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Preview first 10 rows
        setExcelPreview(jsonData.slice(0, 10));
      } catch (error) {
        console.error('Error reading Excel:', error);
        alert('Ошибка чтения файла. Убедитесь, что это файл Excel (.xlsx, .xls) или CSV.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const importExcel = async () => {
    if (!excelFile) return;

    const fileValidationError = validateSpreadsheetImportFile(excelFile);
    if (fileValidationError) {
      alert(fileValidationError);
      return;
    }

    setImportingExcel(true);
    try {
      const reader = new FileReader();

      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          const preparedRows = buildPreparedImportRows(jsonData, 2);

          setPreparedImportRows(preparedRows);
          setShowExcelModal(false);
          setShowImportReviewModal(true);
        } catch (err) {
          console.error('Error preparing import rows:', err);
          alert('Ошибка подготовки импорта: ' + err.message);
        } finally {
          setImportingExcel(false);
        }
      };

      reader.readAsArrayBuffer(excelFile);
    } catch (error) {
      console.error('Import error:', error);
      alert('Ошибка импорта: ' + error.message);
      setImportingExcel(false);
    }
  };

  const updatePreparedImportCategory = (rowNo, categoryId) => {
    setPreparedImportRows((prevRows) => prevRows.map((row) => {
      if (row.rowNo !== rowNo) return row;
      const selectedCategory = importCategoryById.get(String(categoryId));
      const updated = {
        ...row,
        category_id: selectedCategory?.id || '',
        category_label: selectedCategory?.path || '',
        error: selectedCategory ? '' : 'Категория не выбрана'
      };
      return validatePreparedImportRow(updated);
    }));
  };

  const removeInvalidPreparedRows = () => {
    setPreparedImportRows((prevRows) => prevRows.filter((row) => row.isValid));
  };

  const importPreparedRows = async () => {
    if (!preparedImportRows.length) return;

    const rowsToImport = preparedImportRows.filter((row) => row.isValid);
    if (!rowsToImport.length) {
      setAlertMessage({ type: 'warning', text: 'Нет валидных товаров для записи. Исправьте категории или удалите невалидные строки.' });
      return;
    }

    setSavingImportRows(true);
    let created = 0;
    let updated = 0;
    let errors = 0;

    try {
      for (const row of rowsToImport) {
        try {
          const productData = {
            category_id: row.category_id,
            name_ru: row.name_ru,
            name_uz: row.name_uz,
            description_ru: row.description_ru,
            description_uz: row.description_uz,
            price: row.price,
            unit: row.unit || 'шт',
            barcode: row.barcode,
            ikpu: row.ikpu,
            in_stock: row.in_stock,
            season_scope: row.season_scope,
            is_hidden_catalog: row.is_hidden_catalog
          };

          const response = await axios.post(`${API_URL}/admin/products/upsert`, productData);
          if (response.data.isUpdate) updated += 1;
          else created += 1;
        } catch (err) {
          console.error('Error importing row:', row.rowNo, err);
          errors += 1;
        }
      }

      const skipped = preparedImportRows.length - rowsToImport.length;
      let message = 'Импорт завершен.';
      if (created > 0) message += ` Добавлено: ${created}.`;
      if (updated > 0) message += ` Обновлено: ${updated}.`;
      if (errors > 0) message += ` Ошибок записи: ${errors}.`;
      if (skipped > 0) message += ` Пропущено невалидных: ${skipped}.`;

      setAlertMessage({
        type: (created > 0 || updated > 0) ? 'success' : 'warning',
        text: message
      });

      closeImportReviewModal();
      setExcelFile(null);
      setExcelPreview([]);
      fetchData();
    } finally {
      setSavingImportRows(false);
    }
  };

  const resolveAbsoluteMediaUrl = useCallback((value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return normalized.startsWith('http') ? normalized : `${API_URL.replace('/api', '')}${normalized}`;
  }, []);

  const getVariantStockTemplateRows = useCallback(() => {
    const rows = [];
    (products || []).forEach((product) => {
      const productId = Number.parseInt(product?.id, 10);
      if (!Number.isInteger(productId) || productId <= 0) return;
      const productName = String(product?.name_ru || product?.name_uz || '').trim();
      const baseImage = resolveAbsoluteMediaUrl(product?.thumb_url || product?.image_url || '');
      const baseBarcode = String(product?.barcode || '').trim();
      const isVariantMode = product?.size_enabled === true;
      const variants = normalizeProductVariantOptions(product?.size_options, {
        fallbackPrice: normalizeProductPriceValue(product?.price, NaN),
        fallbackIkpu: product?.ikpu || '',
        fallbackContainerId: product?.container_id || '',
        fallbackContainerNorm: product?.container_norm,
        fallbackOrderStep: product?.order_step,
        unit: product?.unit || 'шт'
      });

      if (isVariantMode && variants.length > 0) {
        variants.forEach((variant) => {
          const variantImage = resolveAbsoluteMediaUrl(variant?.thumb_url || variant?.image_url || '');
          rows.push({
            'Product ID': productId,
            'Название товара': productName,
            'Вариант': String(variant?.name || '').trim(),
            'Штрихкод': String(variant?.barcode || baseBarcode || '').trim(),
            'Фото': variantImage || baseImage || '',
            'Текущий остаток': Number.isFinite(Number(variant?.stock_quantity)) ? Number(variant.stock_quantity) : 0,
            'Приход (шт)': ''
          });
        });
        return;
      }

      rows.push({
        'Product ID': productId,
        'Название товара': productName,
        'Вариант': '',
        'Штрихкод': baseBarcode,
        'Фото': baseImage || '',
        'Текущий остаток': Number.isFinite(Number(product?.stock_quantity)) ? Number(product.stock_quantity) : 0,
        'Приход (шт)': ''
      });
    });
    return rows;
  }, [products, resolveAbsoluteMediaUrl]);

  const downloadVariantStockTemplate = useCallback(() => {
    const rows = getVariantStockTemplateRows();
    const aoa = [STOCK_IMPORT_TEMPLATE_HEADERS];
    rows.forEach((row) => {
      aoa.push(STOCK_IMPORT_TEMPLATE_HEADERS.map((header) => row[header] ?? ''));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 38 },
      { wch: 24 },
      { wch: 20 },
      { wch: 56 },
      { wch: 14 },
      { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, language === 'uz' ? 'Qoldiq' : 'Остатки');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `stocks_variants_template_${stamp}.xlsx`);
  }, [getVariantStockTemplateRows, language]);

  const buildPreparedStockImportRows = useCallback((jsonData = [], rowNumberOffset = 2) => (
    (Array.isArray(jsonData) ? jsonData : [])
      .filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const values = Object.values(row);
        return values.some((value) => String(value ?? '').trim() !== '');
      })
      .map((row, index) => {
      const rowNo = index + rowNumberOffset;
      const productIdRaw = row['Product ID'] ?? row['ID товара'] ?? row.product_id ?? row.id;
      const variantNameRaw = row['Вариант'] ?? row.variant_name ?? row.variant;
      const barcodeRaw = row['Штрихкод'] ?? row.barcode ?? row['Barcode'];
      const incomingRaw = row['Приход (шт)'] ?? row['Приход'] ?? row['Количество'] ?? row.quantity ?? row.incoming_stock;
      const parsedProductId = Number.parseInt(String(productIdRaw ?? '').trim(), 10);
      const incomingValue = Number.parseFloat(String(incomingRaw ?? '').trim().replace(',', '.'));
      const normalizedVariantName = String(variantNameRaw || '').trim();
      const normalizedBarcode = String(barcodeRaw || '').trim();
      const product = productsByIdForStockImport.get(parsedProductId) || null;
      const isVariantMode = product?.size_enabled === true;
      const variants = normalizeProductVariantOptions(product?.size_options, {
        fallbackPrice: normalizeProductPriceValue(product?.price, NaN),
        unit: product?.unit || 'шт'
      });
      const matchedVariant = isVariantMode
        ? (
          variants.find((variant) => normalizeStockVariantKey(variant?.name) === normalizeStockVariantKey(normalizedVariantName))
          || variants.find((variant) => String(variant?.barcode || '').trim() && String(variant?.barcode || '').trim() === normalizedBarcode)
        )
        : null;
      const imageUrl = resolveAbsoluteMediaUrl(
        matchedVariant?.thumb_url
        || matchedVariant?.image_url
        || product?.thumb_url
        || product?.image_url
        || ''
      );
      const currentStock = isVariantMode
        ? (Number.isFinite(Number(matchedVariant?.stock_quantity)) ? Number(matchedVariant.stock_quantity) : 0)
        : (Number.isFinite(Number(product?.stock_quantity)) ? Number(product.stock_quantity) : 0);
      const error = (() => {
        if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
          return 'Неверный Product ID';
        }
        if (!product) {
          return 'Товар не найден в текущем магазине';
        }
        if (isVariantMode && !matchedVariant) {
          return 'Вариант не найден для товара';
        }
        if (!Number.isFinite(incomingValue) || incomingValue < 0) {
          return 'Неверное количество прихода';
        }
        return '';
      })();
      return {
        rowNo,
        product_id: Number.isInteger(parsedProductId) ? parsedProductId : 0,
        product_name: String(product?.name_ru || product?.name_uz || row['Название товара'] || '').trim(),
        variant_name: isVariantMode ? normalizedVariantName : '',
        barcode: normalizedBarcode,
        image_url: imageUrl,
        current_stock: currentStock,
        incoming_quantity: Number.isFinite(incomingValue) && incomingValue >= 0 ? incomingValue : 0,
        error,
        isValid: error === ''
      };
    })
  ), [productsByIdForStockImport, resolveAbsoluteMediaUrl]);

  const handleStockExcelFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileValidationError = validateSpreadsheetImportFile(file);
    if (fileValidationError) {
      setAlertMessage({ type: 'warning', text: fileValidationError });
      return;
    }
    setStockExcelFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const headers = Array.isArray(rows[0]) ? rows[0] : [];
        const dataRows = rows.slice(1).filter((row) => (
          (Array.isArray(row) ? row : []).some((cell) => String(cell ?? '').trim() !== '')
        ));
        setStockExcelPreview([headers, ...dataRows]);
      } catch (error) {
        console.error('Stock import preview read error:', error);
        setAlertMessage({ type: 'danger', text: 'Ошибка чтения файла остатков' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const prepareVariantStockImport = async () => {
    if (!stockExcelFile) return;
    const fileValidationError = validateSpreadsheetImportFile(stockExcelFile);
    if (fileValidationError) {
      setAlertMessage({ type: 'warning', text: fileValidationError });
      return;
    }
    setImportingStockExcel(true);
    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          const preparedRows = buildPreparedStockImportRows(jsonData, 2);
          setPreparedStockImportRows(preparedRows);
          setShowStockExcelModal(false);
          setShowStockImportReviewModal(true);
        } catch (error) {
          console.error('Prepare stock import rows error:', error);
          setAlertMessage({ type: 'danger', text: 'Ошибка подготовки строк импорта остатков' });
        } finally {
          setImportingStockExcel(false);
        }
      };
      reader.readAsArrayBuffer(stockExcelFile);
    } catch (error) {
      console.error('Prepare stock import error:', error);
      setAlertMessage({ type: 'danger', text: 'Ошибка импорта остатков' });
      setImportingStockExcel(false);
    }
  };

  const updatePreparedStockImportQuantity = (rowNo, value) => {
    setPreparedStockImportRows((prevRows) => prevRows.map((row) => {
      if (row.rowNo !== rowNo) return row;
      const normalizedRaw = String(value ?? '').trim().replace(',', '.');
      const parsed = Number.parseFloat(normalizedRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return {
          ...row,
          incoming_quantity: 0,
          isValid: false,
          error: 'Неверное количество прихода'
        };
      }
      if (row.error && row.error !== 'Неверное количество прихода') {
        return row;
      }
      return {
        ...row,
        incoming_quantity: parsed,
        isValid: true,
        error: ''
      };
    }));
  };

  const getStockImportNextQuantity = useCallback((row) => {
    const incoming = Number.isFinite(Number(row?.incoming_quantity)) ? Number(row.incoming_quantity) : 0;
    const current = Number.isFinite(Number(row?.current_stock)) ? Number(row.current_stock) : 0;
    if (normalizeStockImportMode(stockImportMode) === 'add') {
      return Math.round((current + incoming + Number.EPSILON) * 1000) / 1000;
    }
    return incoming;
  }, [stockImportMode]);

  const applyPreparedStockImportRows = async () => {
    const validRows = preparedStockImportRows.filter((row) => row.isValid);
    const invalidRowsCount = Math.max(0, preparedStockImportRows.length - validRows.length);
    if (!validRows.length) {
      setAlertMessage({ type: 'warning', text: 'Нет валидных строк для импорта остатков' });
      return;
    }
    setSavingStockImportRows(true);
    try {
      const mode = normalizeStockImportMode(stockImportMode);
      await axios.post(`${API_URL}/admin/products/stock-import/apply`, {
        mode,
        items: validRows.map((row) => ({
          product_id: row.product_id,
          variant_name: row.variant_name || null,
          barcode: row.barcode || null,
          quantity: Number(row.incoming_quantity || 0)
        }))
      });
      setAlertMessage({
        type: 'success',
        text: mode === 'add'
          ? `Остатки суммированы по ${validRows.length} строкам${invalidRowsCount > 0 ? `, пропущено: ${invalidRowsCount}` : ''}`
          : `Остатки обновлены по ${validRows.length} строкам${invalidRowsCount > 0 ? `, пропущено: ${invalidRowsCount}` : ''}`
      });
      closeStockImportReviewModal();
      setStockExcelFile(null);
      setStockExcelPreview([]);
      fetchData();
    } catch (error) {
      console.error('Apply stock import rows error:', error);
      const details = Array.isArray(error.response?.data?.details) ? error.response.data.details : [];
      const detailsText = details.length ? `: ${details.slice(0, 2).join(' | ')}` : '';
      setAlertMessage({
        type: 'danger',
        text: `${error.response?.data?.error || 'Ошибка применения остатков'}${detailsText}`
      });
    } finally {
      setSavingStockImportRows(false);
    }
  };

  const getStatusBadge = (status) => {
    const normalizedStatus = status === 'in_progress' ? 'preparing' : status;
    const statusConfig = {
      'new': { text: 'Новый' },
      'accepted': { text: 'Принят' },
      'preparing': { text: 'Готовится' },
      'delivering': { text: 'Доставляется' },
      'delivered': { text: 'Доставлен' },
      'cancelled': { text: 'Отменен' }
    };

    const config = statusConfig[normalizedStatus] || { text: normalizedStatus || '—' };
    return <span className={`admin-order-status-badge is-${normalizedStatus || 'unknown'}`}>{config.text}</span>;
  };

  const formatCustomerPhone = (rawPhone) => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '-';

    const normalizedDigits = digits.length === 9 ? `998${digits}` : digits;
    if (normalizedDigits.length < 12) {
      return `+${normalizedDigits}`;
    }

    const normalized12 = normalizedDigits.slice(0, 12);
    const g1 = normalized12.slice(0, 3);
    const g2 = normalized12.slice(3, 5);
    const g3 = normalized12.slice(5, 8);
    const g4 = normalized12.slice(8, 10);
    const g5 = normalized12.slice(10, 12);
    return `+${g1} ${g2} ${g3}-${g4}-${g5}`;
  };
  const getTelegramPhoneHref = (rawPhone) => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    const normalizedDigits = digits.length === 9 ? `998${digits}` : digits;
    return `https://t.me/+${normalizedDigits}`;
  };
  const renderCustomerPhoneLink = (rawPhone) => {
    const phoneValue = String(rawPhone || '').trim();
    const formattedPhone = formatCustomerPhone(phoneValue);
    const telegramHref = getTelegramPhoneHref(phoneValue);
    if (!phoneValue || formattedPhone === '-') return '-';
    if (!telegramHref) return formattedPhone;
    return (
      <a href={telegramHref} target="_blank" rel="noopener noreferrer">
        {formattedPhone}
      </a>
    );
  };

  const getPaymentMethodLabel = (paymentMethod) => {
    if (paymentMethod === 'cash') return 'Наличные';
    if (paymentMethod === 'card') return 'Карта';
    if (paymentMethod === 'click') return 'Click';
    if (paymentMethod === 'payme') return 'Payme';
    if (paymentMethod === 'uzum') return 'Uzum';
    if (paymentMethod === 'xazna') return 'Xazna';
    return paymentMethod || '-';
  };

  const getAnalyticsPaymentMethodLabel = (methodKey) => {
    const meta = ANALYTICS_PAYMENT_METHOD_META[methodKey] || {};
    return language === 'uz' ? (meta.labelUz || methodKey || '-') : (meta.labelRu || methodKey || '-');
  };

  const renderAnalyticsPaymentMethodIcon = (methodKey, fallbackLabel = '') => {
    const label = fallbackLabel || getAnalyticsPaymentMethodLabel(methodKey);
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

  const formatDeliveryDateTime = (deliveryDate, deliveryTime) => {
    const normalizedTime = String(deliveryTime || '').trim().toLowerCase();
    const isAsap = !normalizedTime || normalizedTime === 'asap';

    if (isAsap && isFutureDeliveryDate(deliveryDate)) {
      const raw = String(deliveryDate).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const [year, month, day] = raw.slice(0, 10).split('-');
        return `${day}.${month}.${year}`;
      }
      return raw;
    }

    if (isAsap) return 'Как можно быстрее';

    const parts = [];

    if (deliveryDate) {
      const deliveryDateRaw = String(deliveryDate).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(deliveryDateRaw)) {
        const [year, month, day] = deliveryDateRaw.split('-');
        parts.push(`${day}.${month}.${year}`);
      } else {
        const parsedDate = new Date(deliveryDateRaw);
        if (!Number.isNaN(parsedDate.getTime())) {
          parts.push(parsedDate.toLocaleDateString('ru-RU'));
        } else {
          parts.push(deliveryDateRaw);
        }
      }
    }

    if (normalizedTime) {
      if (/^\d{1,2}:\d{2}/.test(normalizedTime)) {
        parts.push(normalizedTime.slice(0, 5));
      } else {
        const parsedTime = new Date(deliveryTime);
        if (!Number.isNaN(parsedTime.getTime())) {
          parts.push(parsedTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
        } else {
          parts.push(String(deliveryTime));
        }
      }
    } else {
      const parsedTime = new Date(deliveryTime);
      if (!Number.isNaN(parsedTime.getTime())) {
        parts.push(parsedTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      }
    }

    return parts.join(', ') || 'Как можно быстрее';
  };

  const isFutureDeliveryDate = (deliveryDate) => {
    if (!deliveryDate) return false;
    const raw = String(deliveryDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return false;
    const dateOnly = raw.slice(0, 10);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return dateOnly > todayStr;
  };

  const getDeliveryTimingLabel = (deliveryDate, deliveryTime) => {
    if (isFutureDeliveryDate(deliveryDate)) return 'На дату';
    const normalizedTime = String(deliveryTime || '').trim().toLowerCase();
    const hasScheduledTime = Boolean(normalizedTime && normalizedTime !== 'asap');
    if (hasScheduledTime) return 'Ко времени';
    return 'Как можно быстрее';
  };

  function parseOrderTimestampMs(value) {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isOrderWithinDateRange(order, fromDate, toDate) {
    const orderDateKey = toLocalDateKey(order?.created_at);
    if (!orderDateKey) return false;
    if (fromDate && orderDateKey < fromDate) return false;
    if (toDate && orderDateKey > toDate) return false;
    return true;
  }

  function formatElapsedDuration(seconds) {
    const safeSeconds = Math.floor(Number(seconds));
    if (!Number.isFinite(safeSeconds) || safeSeconds < 0) return '—';
    if (safeSeconds < 60) return `${safeSeconds} сек`;

    const totalMinutes = Math.floor(safeSeconds / 60);
    const restSeconds = safeSeconds % 60;
    if (totalMinutes < 60) return `${totalMinutes} мин ${restSeconds} сек`;

    const hours = Math.floor(totalMinutes / 60);
    const restMinutes = totalMinutes % 60;
    if (hours < 24) return `${hours} ч ${restMinutes} мин ${restSeconds} сек`;

    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return `${days} д ${restHours} ч ${restMinutes} мин`;
  }

  function getElapsedSeverityClass(seconds) {
    const safeSeconds = Number(seconds);
    if (!Number.isFinite(safeSeconds) || safeSeconds < 0) return '';
    if (safeSeconds >= 15 * 60) return 'is-danger';
    if (safeSeconds >= 10 * 60) return 'is-warning';
    return '';
  }

  function getOrderItemsCount(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (items.length > 0) {
      return items.reduce((sum, item) => (
        sum + Math.max(0, Number(item?.quantity) || 0)
      ), 0);
    }
    const fallbackCount = Number(order?.items_count);
    return Number.isFinite(fallbackCount) && fallbackCount > 0 ? Math.floor(fallbackCount) : 0;
  }

  function getOrderStatusStartedAtMs(order, workflowStatus) {
    if (!order) return null;
    const targetStatus = normalizeOrderActionStatus(workflowStatus);
    if (!targetStatus) return null;
    const createdAtMs = parseOrderTimestampMs(order?.created_at);
    const updatedAtMs = parseOrderTimestampMs(order?.updated_at);
    const processedAtMs = parseOrderTimestampMs(order?.processed_at);
    const actions = Array.isArray(order?.status_actions)
      ? order.status_actions
      : normalizeStatusActions(order?.status_actions);

    for (let index = actions.length - 1; index >= 0; index -= 1) {
      const action = actions[index];
      if (normalizeOrderActionStatus(action?.status) !== targetStatus) continue;
      const actionMs = parseOrderTimestampMs(action?.created_at);
      if (actionMs) return actionMs;
    }

    if (targetStatus === 'new') return createdAtMs;

    if (targetStatus === 'accepted') {
      const acceptedFallback = processedAtMs || updatedAtMs;
      if (acceptedFallback && (!createdAtMs || acceptedFallback > createdAtMs)) {
        return acceptedFallback;
      }
    }

    const genericFallback = updatedAtMs || processedAtMs;
    if (genericFallback && (!createdAtMs || genericFallback > createdAtMs)) {
      return genericFallback;
    }

    // Fallback: if status is already progressed but we do not have transition timestamps,
    // place start slightly after creation so "current status" does not mirror total timer.
    if (createdAtMs && targetStatus !== 'new') {
      return Math.min(Date.now(), createdAtMs + 1000);
    }

    return createdAtMs || null;
  }

  function getOrderWorkflowTiming(order, workflowStatus) {
    const createdAtMs = parseOrderTimestampMs(order?.created_at);
    if (!createdAtMs) {
      return { totalSeconds: null, statusSeconds: null, isFinal: false };
    }

    const rawStatusStartedAtMs = getOrderStatusStartedAtMs(order, workflowStatus);
    const statusStartedAtMs = Math.max(createdAtMs, rawStatusStartedAtMs || createdAtMs);
    const isFinalStatus = workflowStatus === 'delivered' || workflowStatus === 'cancelled';
    const fallbackFinishedAtMs = parseOrderTimestampMs(order?.updated_at) || parseOrderTimestampMs(order?.processed_at);
    const nowMs = kanbanTimingNowMs;
    const rawFinishedAtMs = isFinalStatus ? (fallbackFinishedAtMs || rawStatusStartedAtMs || nowMs) : nowMs;
    const finishedAtMs = Math.max(rawFinishedAtMs, statusStartedAtMs, createdAtMs);
    const totalSeconds = Math.max(0, Math.floor((finishedAtMs - createdAtMs) / 1000));
    const statusSeconds = Math.max(0, Math.floor((finishedAtMs - statusStartedAtMs) / 1000));

    return {
      totalSeconds,
      statusSeconds,
      isFinal: isFinalStatus
    };
  }

  const handleKanbanColumnScroll = useCallback((columnKey) => {
    if (!columnKey) return;
    setKanbanScrollingColumns((prev) => (
      prev[columnKey] ? prev : { ...prev, [columnKey]: true }
    ));

    if (kanbanScrollTimeoutsRef.current[columnKey]) {
      clearTimeout(kanbanScrollTimeoutsRef.current[columnKey]);
    }
    kanbanScrollTimeoutsRef.current[columnKey] = setTimeout(() => {
      setKanbanScrollingColumns((prev) => {
        if (!prev[columnKey]) return prev;
        const next = { ...prev };
        delete next[columnKey];
        return next;
      });
      delete kanbanScrollTimeoutsRef.current[columnKey];
    }, 700);
  }, []);

  const handleVariantsTableScroll = useCallback(() => {
    setIsVariantsTableScrolling((prev) => (prev ? prev : true));
    if (variantsTableScrollHideTimeoutRef.current) {
      clearTimeout(variantsTableScrollHideTimeoutRef.current);
    }
    variantsTableScrollHideTimeoutRef.current = setTimeout(() => {
      setIsVariantsTableScrolling(false);
      variantsTableScrollHideTimeoutRef.current = null;
    }, 700);
  }, []);

  const toggleKanbanColumnSort = useCallback((columnKey) => {
    if (!columnKey) return;
    setKanbanColumnFilters((prev) => {
      const current = {
        ...KANBAN_COLUMN_FILTER_DEFAULT,
        ...(prev[columnKey] || {})
      };
      return {
        ...prev,
        [columnKey]: {
          ...current,
          sortDirection: current.sortDirection === 'desc' ? 'asc' : 'desc'
        }
      };
    });
  }, []);

  const toggleKanbanCardExpanded = useCallback((orderId) => {
    if (!orderId) return;
    const key = String(orderId);
    setExpandedKanbanCardIds((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  const openKanbanColumnFilterModal = useCallback((columnKey) => {
    if (!columnKey) return;
    setActiveKanbanFilterColumn(columnKey);
    setKanbanFilterDraft(getKanbanColumnFilter(columnKey));
    setShowKanbanColumnFilterModal(true);
  }, [getKanbanColumnFilter]);

  const applyKanbanColumnFilterModal = useCallback(() => {
    if (!activeKanbanFilterColumn) return;
    setKanbanColumnFilters((prev) => ({
      ...prev,
      [activeKanbanFilterColumn]: {
        ...KANBAN_COLUMN_FILTER_DEFAULT,
        ...(kanbanFilterDraft || {})
      }
    }));
    setShowKanbanColumnFilterModal(false);
  }, [activeKanbanFilterColumn, kanbanFilterDraft]);

  const resetKanbanColumnFilterModal = useCallback(() => {
    if (!activeKanbanFilterColumn) return;
    const nextDefault = { ...KANBAN_COLUMN_FILTER_DEFAULT };
    setKanbanFilterDraft(nextDefault);
    setKanbanColumnFilters((prev) => ({
      ...prev,
      [activeKanbanFilterColumn]: nextDefault
    }));
  }, [activeKanbanFilterColumn]);

  const openOrderModal = (order) => {
    const normalizedStatus = order.status === 'in_progress' ? 'preparing' : order.status;
    const normalizedCancelledAtStatus = order.cancelled_at_status === 'in_progress'
      ? 'preparing'
      : order.cancelled_at_status;

    setSelectedOrder({
      ...order,
      status: normalizedStatus,
      cancelled_at_status: normalizedCancelledAtStatus
    });
    setShowOrderModal(true);
  };

  const isInteractiveTableRowTarget = (target) => {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest(
      'button, a, input, label, select, textarea, summary, [role="button"], .dropdown-toggle, .form-check-input'
    ));
  };

  const handleRowTouchOpen = (event, rowKey, onOpen) => {
    if (isInteractiveTableRowTarget(event.target)) return;

    const now = Date.now();
    const prev = rowDoubleTapRef.current;
    const isDoubleTap = prev.key === rowKey && (now - prev.at) <= 450;

    if (isDoubleTap) {
      rowDoubleTapRef.current = { key: '', at: 0 };
      onOpen();
      return;
    }

    rowDoubleTapRef.current = { key: rowKey, at: now };
  };

  const normalizePaymentLink = (value) => {
    if (!value) return '';
    let link = String(value).trim();
    if (!link) return '';
    if (!/^https?:\/\//i.test(link)) {
      link = `https://${link}`;
    }
    try {
      return new URL(link).toString();
    } catch {
      return '';
    }
  };

  const getQrCodeUrl = (link) => `https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=${encodeURIComponent(link)}`;

  const clickPaymentLink = normalizePaymentLink(billingInfo.requisites?.click_link);
  const paymePaymentLink = normalizePaymentLink(billingInfo.requisites?.payme_link);
  const productsById = useMemo(() => {
    const map = new Map();
    for (const product of products || []) {
      const productId = Number.parseInt(product?.id, 10);
      if (!Number.isFinite(productId)) continue;
      map.set(productId, {
        container_price: toNumericValue(product?.container_price, 0),
        container_norm: Math.max(1, toNumericValue(product?.container_norm, 1))
      });
    }
    return map;
  }, [products]);
  const filteredProductsForOrderEdit = useMemo(() => {
    const query = String(orderItemSearch || '').trim().toLowerCase();
    const source = Array.isArray(products) ? products : [];

    return source
      .filter((product) => {
        if (!query) return true;
        const nameRu = String(product?.name_ru || '').toLowerCase();
        const nameUz = String(product?.name_uz || '').toLowerCase();
        return nameRu.includes(query) || nameUz.includes(query);
      })
      .sort((left, right) => String(left?.name_ru || '').localeCompare(String(right?.name_ru || ''), 'ru'));
  }, [products, orderItemSearch]);
  const productSortOrderHints = useMemo(() => {
    const categoryId = Number.parseInt(productForm?.category_id, 10);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return {
        hasCategory: false,
        isCurrentFree: true,
        smallestFree: 0,
        closestFree: 0,
        suggestions: [0]
      };
    }

    const editingProductId = Number.parseInt(selectedProduct?.id, 10);
    const usedSortOrders = new Set(
      (Array.isArray(products) ? products : [])
        .filter((product) => Number.parseInt(product?.category_id, 10) === categoryId)
        .filter((product) => !Number.isInteger(editingProductId) || Number.parseInt(product?.id, 10) !== editingProductId)
        .map((product) => Number.parseInt(product?.sort_order, 10))
        .filter((sortOrder) => Number.isInteger(sortOrder) && sortOrder >= 0)
    );

    const currentSortOrderRaw = Number.parseInt(productForm?.sort_order, 10);
    const currentSortOrder = Number.isInteger(currentSortOrderRaw) && currentSortOrderRaw >= 0 ? currentSortOrderRaw : 0;

    const findFirstFreeFrom = (startValue = 0) => {
      let probe = Math.max(0, Number.parseInt(startValue, 10) || 0);
      while (usedSortOrders.has(probe)) probe += 1;
      return probe;
    };

    const findClosestFree = (targetValue = 0) => {
      const safeTarget = Math.max(0, Number.parseInt(targetValue, 10) || 0);
      if (!usedSortOrders.has(safeTarget)) return safeTarget;

      for (let delta = 1; delta < 5000; delta += 1) {
        const lower = safeTarget - delta;
        if (lower >= 0 && !usedSortOrders.has(lower)) return lower;
        const upper = safeTarget + delta;
        if (!usedSortOrders.has(upper)) return upper;
      }

      return findFirstFreeFrom(safeTarget + 1);
    };

    const smallestFree = findFirstFreeFrom(0);
    const closestFree = findClosestFree(currentSortOrder);

    const suggestionSet = new Set([smallestFree, closestFree]);
    let probe = 0;
    while (suggestionSet.size < 30 && probe < 5000) {
      if (!usedSortOrders.has(probe)) suggestionSet.add(probe);
      probe += 1;
    }

    const suggestions = Array.from(suggestionSet).sort((left, right) => left - right);
    return {
      hasCategory: true,
      isCurrentFree: !usedSortOrders.has(currentSortOrder),
      smallestFree,
      closestFree,
      suggestions
    };
  }, [products, productForm?.category_id, productForm?.sort_order, selectedProduct?.id]);

  useEffect(() => {
    if (!isProductSortHintsPopupOpen) return undefined;
    const handleDocumentMouseDown = (event) => {
      if (!productSortHintsRef.current) return;
      if (productSortHintsRef.current.contains(event.target)) return;
      setIsProductSortHintsPopupOpen(false);
    };
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [isProductSortHintsPopupOpen]);

  useEffect(() => {
    if (!productSortOrderHints.hasCategory) {
      setIsProductSortHintsPopupOpen(false);
    }
  }, [productSortOrderHints.hasCategory]);

  const paymentPlaceholders = useMemo(
    () => normalizePaymentPlaceholders(restaurantSettings?.payment_placeholders),
    [restaurantSettings?.payment_placeholders]
  );
  const updatePaymentPlaceholder = (systemKey, patch) => {
    setRestaurantSettings((prev) => {
      const base = normalizePaymentPlaceholders(prev?.payment_placeholders);
      return {
        ...prev,
        payment_placeholders: {
          ...base,
          [systemKey]: {
            ...base[systemKey],
            ...patch
          }
        }
      };
    });
  };
  const hasGatewayPlaceholderConfig = (systemKey) => {
    const item = paymentPlaceholders?.[systemKey] || getDefaultPaymentPlaceholder();
    return Boolean(
      item.enabled
      || String(item.merchant_id || '').trim()
      || String(item.api_login || '').trim()
      || String(item.api_password || '').trim()
      || Number(item.callback_timeout_ms || 0) !== 2000
      || item.test_mode
    );
  };
  const renderGatewayPlaceholderFields = (systemKey, title) => {
    const fields = paymentPlaceholders?.[systemKey] || getDefaultPaymentPlaceholder();
    return (
      <div className="admin-payment-placeholder-box mt-3">
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <div className="small fw-bold text-muted text-uppercase">{title} Merchant API (заглушка)</div>
            <div className="small text-muted">Поля подготовлены для будущей API-интеграции.</div>
          </div>
          <Form.Check
            type="switch"
            label={fields.enabled ? 'Включено' : 'Выключено'}
            checked={Boolean(fields.enabled)}
            onChange={(e) => updatePaymentPlaceholder(systemKey, { enabled: e.target.checked })}
          />
        </div>
        <Row className="gy-3">
          <Col md={4}>
            <Form.Control
              type="text"
              className="form-control-custom"
              value={fields.merchant_id || ''}
              onChange={(e) => updatePaymentPlaceholder(systemKey, { merchant_id: e.target.value })}
              placeholder="Merchant ID"
            />
          </Col>
          <Col md={4}>
            <Form.Control
              type="text"
              className="form-control-custom"
              value={fields.api_login || ''}
              onChange={(e) => updatePaymentPlaceholder(systemKey, { api_login: e.target.value })}
              placeholder="API login"
            />
          </Col>
          <Col md={4}>
            <Form.Control
              type="text"
              className="form-control-custom"
              value={fields.api_password || ''}
              onChange={(e) => updatePaymentPlaceholder(systemKey, { api_password: e.target.value })}
              placeholder="API password"
            />
          </Col>
          <Col md={6}>
            <Form.Control
              type="number"
              min="0"
              className="form-control-custom"
              value={fields.callback_timeout_ms || 2000}
              onChange={(e) => updatePaymentPlaceholder(systemKey, { callback_timeout_ms: e.target.value })}
              placeholder="Callback timeout ms"
            />
          </Col>
          <Col md={6}>
            <Form.Check
              type="switch"
              className="pt-2"
              label={`Тестовый режим ${title}`}
              checked={Boolean(fields.test_mode)}
              onChange={(e) => updatePaymentPlaceholder(systemKey, { test_mode: e.target.checked })}
            />
          </Col>
        </Row>
      </div>
    );
  };
  const paymentSystems = [
    {
      key: 'cash',
      title: 'Наличные',
      logo: '/cash.svg',
      description: 'Оплата наличными при получении заказа.',
      configured: restaurantSettings?.cash_enabled !== false
    },
    {
      key: 'card',
      title: 'Карта',
      logo: '/card.svg',
      description: 'Оплата переводом на карту магазина с отправкой чека.',
      configured: Boolean(
        String(restaurantSettings?.card_payment_title || '').trim()
        && String(restaurantSettings?.card_payment_number || '').replace(/\D/g, '').trim()
        && String(restaurantSettings?.card_payment_holder || '').trim()
      )
    },
    {
      key: 'click',
      title: 'Click',
      logo: '/click.png',
      description: 'Персональная ссылка для перевода клиента в оплату Click.',
      configured: Boolean(
        String(restaurantSettings?.click_url || '').trim()
        || hasGatewayPlaceholderConfig('click')
      )
    },
    {
      key: 'payme',
      title: 'Payme',
      logo: '/payme.png',
      description: 'Ссылка оплаты и Merchant API для автоматического подтверждения заказов.',
      configured: Boolean(
        String(restaurantSettings?.payme_url || '').trim()
        || Boolean(restaurantSettings?.payme_enabled)
        || String(restaurantSettings?.payme_merchant_id || '').trim()
      )
    },
    {
      key: 'uzum',
      title: 'Uzum',
      logo: '/uzum.png',
      description: 'Ссылка для перенаправления клиента на оплату через Uzum.',
      configured: Boolean(
        String(restaurantSettings?.uzum_url || '').trim()
        || hasGatewayPlaceholderConfig('uzum')
      )
    },
    {
      key: 'xazna',
      title: 'Xazna',
      logo: '/xazna.png',
      description: 'Ссылка для перенаправления клиента на оплату через Xazna.',
      configured: Boolean(
        String(restaurantSettings?.xazna_url || '').trim()
        || hasGatewayPlaceholderConfig('xazna')
      )
    }
  ];

  if (loading) {
    return <AdminDashboardSkeleton label="Загрузка панели оператора" />;
  }

  const handleSwitchRestaurant = async (restaurantId) => {
    if (Number(restaurantId) === Number(user?.active_restaurant_id)) {
      setShowRestaurantPickerModal(false);
      return;
    }
    const result = await switchRestaurant(restaurantId);
    if (result.success) {
      setAlertMessage({ type: 'success', text: 'Магазин переключен' });
      setShowRestaurantPickerModal(false);
      setRestaurantSwitchSearch('');
      fetchData();
    } else {
      setAlertMessage({ type: 'danger', text: result.error });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canSwitchRestaurants = (user?.restaurants?.length || 0) > 1;
  const normalizedRestaurantSearch = restaurantSwitchSearch.trim().toLowerCase();
  const filteredRestaurants = (user?.restaurants || []).filter((r) =>
    !normalizedRestaurantSearch || String(r.name || '').toLowerCase().includes(normalizedRestaurantSearch)
  );
  const dashboardMonthOptions = [
    { value: 1, label: t('monthJan') },
    { value: 2, label: t('monthFeb') },
    { value: 3, label: t('monthMar') },
    { value: 4, label: t('monthApr') },
    { value: 5, label: t('monthMay') },
    { value: 6, label: t('monthJun') },
    { value: 7, label: t('monthJul') },
    { value: 8, label: t('monthAug') },
    { value: 9, label: t('monthSep') },
    { value: 10, label: t('monthOct') },
    { value: 11, label: t('monthNov') },
    { value: 12, label: t('monthDec') }
  ];
  const dashboardMonthShortLabels = [
    t('monthShortJan'),
    t('monthShortFeb'),
    t('monthShortMar'),
    t('monthShortApr'),
    t('monthShortMay'),
    t('monthShortJun'),
    t('monthShortJul'),
    t('monthShortAug'),
    t('monthShortSep'),
    t('monthShortOct'),
    t('monthShortNov'),
    t('monthShortDec')
  ];
  const analyticsPeriodCaption = analyticsPeriod === 'daily'
    ? formatDateKeyLabel(dashboardDailyDate, language)
    : analyticsPeriod === 'monthly'
      ? `${dashboardMonthOptions.find((option) => option.value === dashboardMonth)?.label || dashboardMonth} ${dashboardYear}`
      : `${dashboardYear}`;
  const activeAnalyticsView = analyticsPeriod === 'daily'
    ? {
        revenue: dailyAnalytics.revenue,
        revenueRows: [
          { label: language === 'uz' ? 'Tovarlar' : 'Товары', value: `${formatPrice(dailyAnalytics.itemsRevenue)} ${t('sum')}` },
          { label: language === 'uz' ? 'Yetkazib berish' : 'Доставка', value: `${formatPrice(dailyAnalytics.deliveryRevenue)} ${t('sum')}` }
        ],
        ordersCount: dailyAnalytics.totalOrdersAllStatuses,
        ordersRows: [
          { label: language === 'uz' ? 'Yetkazib berilgan' : 'Доставлено', value: `${dailyAnalytics.ordersCount}` },
          { label: language === 'uz' ? "Pik soatlar" : 'Пиковые часы', value: dailyAnalytics.peakHours.length ? dailyAnalytics.peakHours.map((hour) => formatHourLabel(hour)).join(', ') : '—' }
        ],
        averageCheck: dailyAnalytics.averageCheck,
        averageRows: [
          { label: language === 'uz' ? 'Davr' : 'Период', value: analyticsPeriodCaption },
          { label: language === 'uz' ? 'Buyurtma/soat piki' : 'Пик заказов/час', value: `${dailyAnalytics.peakOrdersCount}` }
        ],
        revenueTimeline: dailyRevenueTimeline,
        ordersTimeline: dailyOrdersCountTimeline,
        revenueChartSubtitle: language === 'uz' ? 'soatlar bo‘yicha' : 'по часам',
        ordersChartSubtitle: language === 'uz' ? 'soatlar bo‘yicha' : 'по часам',
        topProducts: dailyTopProducts,
        topCustomers: dailyTopCustomers
      }
    : analyticsPeriod === 'yearly'
      ? {
          revenue: yearlyAnalytics.totalRevenue,
          revenueRows: [
            { label: language === 'uz' ? 'Tovarlar' : 'Товары', value: `${formatPrice(yearlyFinancialStats.items)} ${t('sum')}` },
            { label: language === 'uz' ? 'Yetkazib berish' : 'Доставка', value: `${formatPrice(yearlyFinancialStats.delivery)} ${t('sum')}` }
          ],
          ordersCount: yearlyAnalytics.totalOrders,
          ordersRows: [
            { label: language === 'uz' ? "Olib ketish" : 'Самовывоз', value: `${yearlyFulfillmentStats.pickup}` },
            { label: language === 'uz' ? 'Yetkazib berish' : 'Доставка', value: `${yearlyFulfillmentStats.delivery}` }
          ],
          averageCheck: yearlyAnalytics.averageCheck,
          averageRows: [
            { label: language === 'uz' ? 'Davr' : 'Период', value: analyticsPeriodCaption },
            { label: language === 'uz' ? 'Oylar' : 'Месяцев', value: '12' }
          ],
          revenueTimeline: yearlyRevenueTimeline.map((item, index) => ({ ...item, label: dashboardMonthShortLabels[index] || item.label })),
          ordersTimeline: yearlyOrdersCountTimeline.map((item, index) => ({ ...item, label: dashboardMonthShortLabels[index] || item.label })),
          revenueChartSubtitle: language === 'uz' ? 'oylar bo‘yicha' : 'по месяцам',
          ordersChartSubtitle: language === 'uz' ? 'oylar bo‘yicha' : 'по месяцам',
          topProducts: yearlyTopProducts,
          topCustomers: yearlyTopCustomers
        }
      : {
          revenue: analytics.revenue,
          revenueRows: [
            { label: language === 'uz' ? 'Tovarlar' : 'Товары', value: `${formatPrice(analytics.itemsRevenue)} ${t('sum')}` },
            { label: language === 'uz' ? 'Yetkazib berish' : 'Доставка', value: `${formatPrice(analytics.deliveryRevenue)} ${t('sum')}` }
          ],
          ordersCount: analytics.ordersCount,
          ordersRows: [
            { label: language === 'uz' ? "Olib ketish" : 'Самовывоз', value: `${analytics.pickupOrdersCount}` },
            { label: language === 'uz' ? 'Yetkazib berish' : 'Доставка', value: `${analytics.deliveryOrdersCount}` }
          ],
          averageCheck: analytics.averageCheck,
          averageRows: [
            { label: language === 'uz' ? 'Davr' : 'Период', value: analyticsPeriodCaption },
            { label: language === 'uz' ? 'Yil' : 'Год', value: `${dashboardYear}` }
          ],
          revenueTimeline: monthlyRevenueTimeline,
          ordersTimeline: monthlyOrdersCountTimeline,
          revenueChartSubtitle: language === 'uz' ? 'kunlar bo‘yicha' : 'по дням',
          ordersChartSubtitle: language === 'uz' ? 'kunlar bo‘yicha' : 'по дням',
          topProducts: analytics.topProducts,
          topCustomers: analytics.topCustomers
        };

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

  const renderAnalyticsSvgChart = ({
    data,
    color,
    gradientId,
    mode = 'count',
    showAllLabels = false,
    showPointValues = false
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
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
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
                showAllLabels
                  ? (chartData.length > 24
                    ? { fontSize: '7px' }
                    : chartData.length > 12
                      ? { fontSize: '8px' }
                      : undefined)
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

  const renderAnalyticsFilters = () => (
    <div className="admin-analytics-filters-area">
      {analyticsPeriod === 'daily' ? (
        <div className="admin-analytics-filter-group admin-analytics-filter-group-date">
          <span className="admin-analytics-filter-label">{t('date')}</span>
          <Form.Control
            type="date"
            value={dashboardDailyDate}
            onChange={(e) => setDashboardDailyDate(String(e.target.value || '').trim() || getTodayDateKey())}
            className="admin-analytics-filter-control"
          />
        </div>
      ) : (
        <>
          <div className="admin-analytics-filter-group">
            <span className="admin-analytics-filter-label">{t('year')}</span>
            <Form.Select
              value={dashboardYear}
              onChange={(e) => setDashboardYear(parseInt(e.target.value, 10))}
              className="admin-analytics-filter-control"
            >
              {[2024, 2025, 2026, 2027].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </Form.Select>
          </div>
          {analyticsPeriod === 'monthly' ? (
            <div className="admin-analytics-filter-group">
              <span className="admin-analytics-filter-label">{t('month')}</span>
              <Form.Select
                value={dashboardMonth}
                onChange={(e) => setDashboardMonth(parseInt(e.target.value, 10))}
                className="admin-analytics-filter-control"
              >
                {dashboardMonthOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Form.Select>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const renderAnalyticsMapCard = () => (
    <Card className="border-0 shadow-sm admin-analytics-surface-card admin-analytics-map-card">
      <Card.Header className="bg-white border-0 d-flex align-items-center justify-content-between admin-analytics-card-header">
        <h6 className="mb-0 admin-analytics-card-title">
          <span className="admin-analytics-card-title-icon" style={{ color: '#ef4444', background: '#fff1f2' }}>🗺️</span>
          {t('orderGeography')}
        </h6>
        <div className="d-flex align-items-center gap-2">
          <Form.Select
            size="sm"
            value={leafletMapProvider}
            onChange={(e) => handleLeafletMapProviderChange(e.target.value)}
            style={{ minWidth: '140px' }}
            aria-label="Выбор карты"
          >
            {mapProviderOptions.map((item) => (
              <option key={`analytics-map-provider-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </Form.Select>
          <Button
            size="sm"
            variant="outline-secondary"
            className="admin-analytics-fullscreen-btn"
            onClick={() => setShowAnalyticsMapModal(true)}
            title={t('fullscreen') || 'Во весь экран'}
            aria-label={t('fullscreen') || 'Во весь экран'}
          >
            <i className="bi bi-arrows-fullscreen" />
          </Button>
        </div>
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
              {isYandexMapProvider ? (
                <YandexAnalyticsMap
                  points={activeAnalyticsLocationsList}
                  shopPoint={analyticsShopLocation}
                  selectedPoint={analyticsMapSelectionLocked ? selectedAnalyticsLocation : null}
                  onSelectPoint={openAnalyticsLocationDetails}
                  onLoadError={handleYandexAnalyticsMapLoadError}
                  height="100%"
                />
              ) : (
                <MapContainer
                  center={ANALYTICS_DEFAULT_MAP_CENTER}
                  zoom={ANALYTICS_DEFAULT_MAP_ZOOM}
                  style={{ height: '100%', width: '100%', filter: 'saturate(0.9) contrast(1.03)' }}
                >
                  <TileLayer
                    url={mapTileLayerConfig.url}
                    attribution={mapTileLayerConfig.attribution}
                    maxZoom={mapTileLayerConfig.maxZoom}
                  />
                  <AnalyticsMapResizeFix />
                  <AnalyticsMapAutoBounds points={activeAnalyticsMapPoints} />
                  <AnalyticsMapFocus selectedPoint={analyticsMapSelectionLocked ? selectedAnalyticsLocation : null} />
                  {activeAnalyticsLocationsList.map((location) => {
                    const isSelected = selectedAnalyticsLocation &&
                      (selectedAnalyticsLocation.orderId === location.orderId);
                    return (
                      <Marker
                        key={`analytics-map-${location.orderId || location.orderNumber}`}
                        position={[location.lat, location.lng]}
                        icon={getAnalyticsPointIcon(isSelected)}
                        zIndexOffset={isSelected ? 1000 : 0}
                        eventHandlers={{
                          click: () => openAnalyticsLocationDetails(location)
                        }}
                      />
                    );
                  })}
                  {analyticsShopLocation && (
                    <Marker
                      position={[analyticsShopLocation.lat, analyticsShopLocation.lng]}
                      icon={getAnalyticsShopIcon()}
                      zIndexOffset={1300}
                    />
                  )}
                </MapContainer>
              )}
            </div>
          </Col>
          <Col lg={4} xl={3} className="border-start bg-white">
            <div className="p-3 admin-custom-scrollbar admin-analytics-map-sidebar" style={{ maxHeight: '390px', overflowY: 'auto' }}>
              <div className="small text-uppercase text-muted fw-semibold mb-2 admin-analytics-map-sidebar-title">
                {t('clients') || 'Клиенты'}
              </div>
              <div className="d-grid gap-2">
                {activeAnalyticsLocationsList.length > 0 ? activeAnalyticsLocationsList.map((location) => {
                  const locationKey = getAnalyticsLocationKey(location);
                  const isSelected = selectedAnalyticsLocation &&
                    (selectedAnalyticsLocation.orderId === location.orderId);
                  return (
                    <button
                      type="button"
                      key={`analytics-list-${location.orderId || location.orderNumber}`}
                      ref={(el) => {
                        if (!locationKey) return;
                        if (el) analyticsListItemRefs.current.set(locationKey, el);
                        else analyticsListItemRefs.current.delete(locationKey);
                      }}
                      onClick={() => openAnalyticsLocationDetails(location)}
                      className={`btn text-start admin-analytics-map-list-item${isSelected ? ' is-active' : ''}`}
                      style={{
                        border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`,
                        background: isSelected ? '#eff6ff' : '#ffffff'
                      }}
                    >
                      <div className="fw-semibold">{location.customerName || 'Клиент'}</div>
                      <div className="small text-muted">{location.customerPhone || '—'}</div>
                      <div className="small mt-1">№{location.orderNumber} · {formatPrice(location.totalAmount)} {t('sum')}</div>
                    </button>
                  );
                }) : (
                  <div className="text-muted small py-2">{t('noDataForPeriod')}</div>
                )}
              </div>

              {selectedAnalyticsLocation && (
                <div className="mt-3 p-3 rounded-3 border admin-analytics-map-detail" style={{ background: '#f8fafc' }}>
                  <div className="small fw-semibold mb-2">{t('client') || 'Клиент'}</div>
                  <div className="small"><strong>{language === 'uz' ? 'Buyurtma' : 'Заказ'}:</strong> №{selectedAnalyticsLocation.orderNumber || '—'}</div>
                  <div className="small"><strong>{t('amount')}:</strong> {formatPrice(selectedAnalyticsLocation.totalAmount || 0)} {t('sum')}</div>
                  <div className="small"><strong>{t('date')}:</strong> {selectedAnalyticsLocation.createdAt ? new Date(selectedAnalyticsLocation.createdAt).toLocaleString('ru-RU') : '—'}</div>
                  <div className="small"><strong>{language === 'uz' ? 'Manzil' : 'Адрес'}:</strong> {selectedAnalyticsLocation.deliveryAddress || '—'}</div>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );

  const renderAnalyticsTopTables = () => (
    <Row className="g-4">
      <Col lg={6}>
        <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
          <Card.Header className="bg-white border-0 admin-analytics-card-header">
            <h6 className="mb-0 admin-analytics-card-title">
              <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>🍔</span>
              {t('topProducts')}
            </h6>
          </Card.Header>
          <Card.Body className="p-0">
            {activeAnalyticsView.topProducts.length > 0 ? (
              <Table hover className="mb-0 admin-analytics-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('productName')}</th>
                    <th className="text-end">{t('quantity')}</th>
                    <th className="text-end">{t('revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAnalyticsView.topProducts.map((item, idx) => (
                    <tr key={`${analyticsPeriod}-top-product-${idx}-${item.name}`}>
                      <td>
                        <span className={`admin-analytics-rank ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : ''}`}>{idx + 1}</span>
                      </td>
                      <td>{item.name}</td>
                      <td className="text-end">{item.quantity}</td>
                      <td className="text-end">{formatPrice(item.revenue)}</td>
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
              <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>👑</span>
              {t('topCustomers') || 'Топ клиентов'}
            </h6>
          </Card.Header>
          <Card.Body className="p-0">
            {activeAnalyticsView.topCustomers.length > 0 ? (
              <Table hover className="mb-0 admin-analytics-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('client')}</th>
                    <th className="text-end">{t('ordersCount')}</th>
                    <th className="text-end">{t('revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAnalyticsView.topCustomers.map((item, idx) => (
                    <tr key={`${analyticsPeriod}-top-customer-${idx}-${item.phone}`}>
                      <td>
                        <span className={`admin-analytics-rank ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : ''}`}>{idx + 1}</span>
                      </td>
                      <td>
                        <div className="fw-semibold">{item.name}</div>
                        <small className="text-muted">{item.phone}</small>
                      </td>
                      <td className="text-end">{item.ordersCount}</td>
                      <td className="text-end">{formatPrice(item.totalAmount)}</td>
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
  );

  const renderAnalyticsProductReviews = () => {
    const summary = analyticsProductReviews?.summary || {};
    const latestComments = Array.isArray(analyticsProductReviews?.latestComments)
      ? analyticsProductReviews.latestComments
      : [];
    const topProducts = Array.isArray(analyticsProductReviews?.topProducts)
      ? analyticsProductReviews.topProducts
      : [];
    const locale = language === 'uz' ? 'uz-UZ' : 'ru-RU';
    const totalReviews = Number(summary.totalReviews || 0);
    const commentsCount = Number(summary.commentsCount || 0);
    const lowRatingCount = Number(summary.lowRatingCount || 0);
    const averageRating = Number(summary.averageRating || 0);
    const commentRate = totalReviews > 0 ? ((commentsCount * 100) / totalReviews) : 0;
    const lowRatingShare = totalReviews > 0 ? ((lowRatingCount * 100) / totalReviews) : 0;
    const ratingBreakdown = summary?.ratingBreakdown && typeof summary.ratingBreakdown === 'object'
      ? summary.ratingBreakdown
      : {};
    const ratingRows = [5, 4, 3, 2, 1].map((star) => {
      const count = Number(ratingBreakdown[star] || 0);
      const percent = totalReviews > 0 ? (count * 100) / totalReviews : 0;
      return {
        star,
        count,
        percent,
        barClass: star >= 4 ? 'bg-success' : star === 3 ? 'bg-warning' : 'bg-danger'
      };
    });
    const qualityState = (() => {
      if (averageRating >= 4.5 && lowRatingShare <= 10) {
        return {
          title: language === 'uz' ? 'Sifat: yaxshi' : 'Качество: хорошее',
          advice: language === 'uz'
            ? 'Hozirgi darajani ushlab turing, 4★ sharhlarni ham 5★ ga olib chiqishga harakat qiling.'
            : 'Держите текущий уровень, и попробуйте дотянуть отзывы 4★ до 5★.',
          className: 'alert-success'
        };
      }
      if (averageRating >= 4.0 && lowRatingShare <= 20) {
        return {
          title: language === 'uz' ? "Sifat: barqaror, lekin o'sish kerak" : 'Качество: стабильно, но есть рост',
          advice: language === 'uz'
            ? 'Oxirgi past baholarni ko‘rib chiqing: ko‘pincha tezlik yoki servis muammosi bo‘ladi.'
            : 'Проверьте последние низкие оценки: чаще всего там причины по скорости или сервису.',
          className: 'alert-warning'
        };
      }
      return {
        title: language === 'uz' ? "Sifat: xavf zonasi" : 'Качество: зона риска',
        advice: language === 'uz'
          ? '1-2★ sharhlarni birinchi bo‘lib tahlil qiling va operatorlar bo‘yicha choralar ko‘ring.'
          : 'Сначала разберите отзывы 1-2★ и назначьте действия по операторам.',
        className: 'alert-danger'
      };
    })();
    const getRatingBadge = (ratingValue) => {
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

    return (
      <Row className="g-4 mt-1">
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
                    <div className="fw-bold">{averageRating.toFixed(2)} / {MAX_ORDER_RATING}</div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="rounded-3 border p-2 bg-light">
                    <div className="small text-muted">{language === 'uz' ? 'Jami baho' : 'Всего оценок'}</div>
                    <div className="fw-bold">{totalReviews.toLocaleString('ru-RU')}</div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="rounded-3 border p-2 bg-light">
                    <div className="small text-muted">{language === 'uz' ? 'Izoh ulushi' : 'Доля комментариев'}</div>
                    <div className="fw-bold">{commentRate.toFixed(1)}%</div>
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="rounded-3 border p-2 bg-light">
                    <div className="small text-muted">{language === 'uz' ? '1-2★ ulushi' : 'Доля 1-2★'}</div>
                    <div className="fw-bold">{lowRatingShare.toFixed(1)}%</div>
                  </div>
                </Col>
              </Row>

              <div className={`alert py-2 px-3 mb-3 ${qualityState.className}`} role="alert">
                <div className="fw-semibold">{qualityState.title}</div>
                <div className="small">{qualityState.advice}</div>
              </div>

              <div className="mb-3">
                <div className="small text-uppercase text-muted fw-semibold mb-2">
                  {language === 'uz' ? 'Baholar taqsimoti' : 'Распределение оценок'}
                </div>
                {ratingRows.map((row) => (
                  <div key={`admin-rating-row-${row.star}`} className="d-flex align-items-center gap-2 mb-1">
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
                {topProducts.length > 0 ? (
                  <div className="d-flex flex-column gap-2">
                    {topProducts.slice(0, 5).map((item, index) => (
                      <div key={`admin-review-top-product-${item.productId || index}`} className="d-flex justify-content-between gap-2">
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
              {loadingAnalyticsProductReviews ? (
                <div className="py-4 text-center text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  {language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
                </div>
              ) : latestComments.length > 0 ? (
                <div className="table-responsive">
                  <Table hover className="mb-0 admin-analytics-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{language === 'uz' ? 'Tovar' : 'Товар'}</th>
                        <th>{language === 'uz' ? 'Baho' : 'Оценка'}</th>
                        <th>{language === 'uz' ? 'Holat' : 'Статус'}</th>
                        <th>{language === 'uz' ? 'Izoh' : 'Комментарий'}</th>
                        <th>{language === 'uz' ? 'Mijoz' : 'Клиент'}</th>
                        <th className="text-end">{t('date')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestComments.map((item, idx) => {
                        const rating = Number(item.rating || 0);
                        const badge = getRatingBadge(rating);
                        const rowClass = rating <= 2 ? 'table-warning' : '';
                        return (
                        <tr key={`admin-review-comment-${item.id || idx}`} className={rowClass}>
                          <td>{idx + 1}</td>
                          <td>{item.productName || 'Товар'}</td>
                          <td>{buildOrderRatingStars(rating)}</td>
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
                            {item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : '—'}
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
    );
  };

  const renderAnalyticsDashboard = () => {
    const renderStatusIcon = (statusKey) => {
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

    const analyticsStatusCards = [
      { key: 'new', label: language === 'uz' ? 'Yangi' : 'Новые' },
      { key: 'accepted', label: language === 'uz' ? 'Qabul qilingan' : 'Принятые' },
      { key: 'preparing', label: language === 'uz' ? 'Tayyorlanmoqda' : 'Готовится' },
      { key: 'delivering', label: language === 'uz' ? 'Yetkazilmoqda' : 'Доставляется' },
      { key: 'delivered', label: language === 'uz' ? 'Yetkazildi' : 'Доставлено' },
      { key: 'cancelled', label: language === 'uz' ? 'Bekor qilingan' : 'Отказано' }
    ];
    const paymentRows = analyticsPaymentMethodSummary.rows || [];
    const paymentTotalCount = Number(analyticsPaymentMethodSummary.totalCount || 0);
    const paymentTotalAmount = Number(analyticsPaymentMethodSummary.totalAmount || 0);
    const paymentLeader = analyticsPaymentMethodSummary.leader || null;
    const paymentDonutRadius = 58;
    const paymentDonutStroke = 18;
    const paymentDonutCircumference = 2 * Math.PI * paymentDonutRadius;
    let paymentDonutProgress = 0;
    const formatPaymentPercent = (value) => `${Number(value || 0).toFixed(2)}%`;

    return (
      <div className="admin-analytics-layout">
      <div className="admin-analytics-header-row">
        <div className="admin-analytics-period-tabs">
          {[
            { key: 'daily', label: language === 'uz' ? 'Kun' : 'День' },
            { key: 'monthly', label: language === 'uz' ? 'Oy' : 'Месяц' },
            { key: 'yearly', label: language === 'uz' ? 'Yil' : 'Год' }
          ].map((periodTab) => (
            <button
              key={periodTab.key}
              type="button"
              className={`admin-analytics-period-btn${analyticsPeriod === periodTab.key ? ' is-active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAnalyticsPeriod(periodTab.key);
              }}
            >
              {periodTab.label}
            </button>
          ))}
        </div>
        {renderAnalyticsFilters()}
        </div>

        <div className="admin-analytics-kpi-grid">
          <div className="admin-analytics-kpi-card">
          <div className="admin-analytics-kpi-header">
            <h6 className="mb-0 admin-analytics-card-title">
              <span className="admin-analytics-card-title-icon" style={{ color: '#10b981', background: '#ecfdf5' }}>💰</span>
              {t('revenue')}
            </h6>
          </div>
          <div className="admin-analytics-kpi-value">
            {formatPrice(activeAnalyticsView.revenue)} <span>{t('sum')}</span>
          </div>
          <div className="admin-analytics-kpi-list">
            {activeAnalyticsView.revenueRows.map((row) => (
              <div className="admin-analytics-kpi-row" key={`rev-${row.label}`}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
          </div>

          <div className="admin-analytics-kpi-card">
            <div className="admin-analytics-kpi-header">
              <h6 className="mb-0 admin-analytics-card-title">
                <span className="admin-analytics-card-title-icon" style={{ color: '#f59e0b', background: '#fffbeb' }}>📦</span>
                {language === 'uz' ? 'Buyurtmalar' : 'Заказы'}
              </h6>
            </div>
            <div className="admin-analytics-kpi-value">
              {activeAnalyticsView.ordersCount}
          </div>
          <div className="admin-analytics-kpi-list">
            {activeAnalyticsView.ordersRows.map((row) => (
              <div className="admin-analytics-kpi-row" key={`ord-${row.label}`}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
              ))}
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
              {formatPrice(analyticsFinancialExtras.containersRevenue)} <span>{t('sum')}</span>
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
              {formatPrice(analyticsFinancialExtras.serviceRevenue)} <span>{t('sum')}</span>
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
            {formatPrice(activeAnalyticsView.averageCheck)} <span>{t('sum')}</span>
          </div>
          <div className="admin-analytics-kpi-list">
            {activeAnalyticsView.averageRows.map((row) => (
              <div className="admin-analytics-kpi-row" key={`avg-${row.label}`}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
            </div>
          </div>
        </div>

        <div className="admin-analytics-status-strip">
          {analyticsStatusCards.map((statusCard) => (
            <div className="admin-analytics-status-strip-item" key={`analytics-status-strip-${statusCard.key}`}>
              <span className={`admin-analytics-status-strip-icon is-${statusCard.key}`}>
                {renderStatusIcon(statusCard.key)}
              </span>
              <span className="admin-analytics-status-strip-label">{statusCard.label}</span>
              <strong className="admin-analytics-status-strip-value">{analyticsStatusSummary[statusCard.key] || 0}</strong>
            </div>
          ))}
        </div>

        <Row className="g-4 mb-4">
          <Col lg={4}>
            <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card">
              <Card.Header className="bg-white border-0 d-flex justify-content-between align-items-center admin-analytics-card-header">
                <h6 className="mb-0 admin-analytics-card-title">
                  <span className="admin-analytics-card-title-icon" style={{ color: '#2563eb', background: '#eff6ff' }}>💳</span>
                  {language === 'uz' ? "To'lov turlari ulushi" : 'Доли типов платежей'}
                </h6>
                <small className="text-muted admin-analytics-card-subtle">{analyticsPeriodCaption}</small>
              </Card.Header>
              <Card.Body className="d-flex align-items-center justify-content-center">
                <div className="admin-payment-donut-stack">
                  <div className="admin-funnel-donut-chart">
                    <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Payment methods donut chart">
                      <circle
                        cx="90"
                        cy="90"
                        r={paymentDonutRadius}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth={paymentDonutStroke}
                      />
                      {paymentTotalCount > 0 ? paymentRows.map((row) => {
                        const value = Number(row.count || 0);
                        if (value <= 0) return null;
                        const ratio = value / paymentTotalCount;
                        const strokeLength = ratio * paymentDonutCircumference;
                        const strokeDasharray = `${strokeLength} ${paymentDonutCircumference}`;
                        const strokeDashoffset = -paymentDonutProgress * paymentDonutCircumference;
                        paymentDonutProgress += ratio;
                        return (
                          <circle
                            key={`admin-payment-donut-${row.key}`}
                            cx="90"
                            cy="90"
                            r={paymentDonutRadius}
                            fill="none"
                            stroke={row.color}
                            strokeWidth={paymentDonutStroke}
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
                        {paymentLeader ? formatPaymentPercent(paymentLeader.percent) : '0.00%'}
                      </text>
                      <text x="90" y="122" textAnchor="middle" fontSize="10" fill="#64748b">
                        {paymentLeader ? paymentLeader.label : (language === 'uz' ? "Ma'lumot yo'q" : 'Нет данных')}
                      </text>
                    </svg>
                  </div>
                  <div className="admin-funnel-donut-legend">
                    {paymentRows.map((row) => (
                      <div key={`admin-payment-legend-${row.key}`} className="admin-funnel-donut-legend-item">
                        <span className="admin-funnel-donut-dot" style={{ backgroundColor: row.color }} />
                        <span className="admin-funnel-donut-label d-flex align-items-center gap-2">
                          {renderAnalyticsPaymentMethodIcon(row.key, row.label)}
                          {shouldRenderAnalyticsPaymentMethodText(row.key) ? <span>{row.label}</span> : null}
                        </span>
                        <strong className="admin-funnel-donut-value">{formatPaymentPercent(row.percent)}</strong>
                      </div>
                    ))}
                  </div>
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
                      {paymentRows.map((row, idx) => (
                        <tr key={`admin-payment-row-${row.key}`}>
                          <td>{idx + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {renderAnalyticsPaymentMethodIcon(row.key, row.label)}
                              {shouldRenderAnalyticsPaymentMethodText(row.key) ? <span>{row.label}</span> : null}
                            </div>
                          </td>
                          <td className="text-end">{Number(row.count || 0).toLocaleString('ru-RU')}</td>
                          <td className="text-end">{formatPaymentPercent(row.percent)}</td>
                          <td className="text-end">{formatPrice(row.amount || 0)} {t('sum')}</td>
                        </tr>
                      ))}
                      <tr className="table-light fw-semibold">
                        <td colSpan={2}>{language === 'uz' ? 'Jami' : 'Итого'}</td>
                        <td className="text-end">{paymentTotalCount.toLocaleString('ru-RU')}</td>
                        <td className="text-end">{formatPaymentPercent(paymentTotalCount > 0 ? 100 : 0)}</td>
                        <td className="text-end">{formatPrice(paymentTotalAmount)} {t('sum')}</td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

      <Row className="g-4 mb-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm admin-analytics-surface-card">
            <Card.Body className="admin-analytics-chart-stack admin-analytics-chart-grid">
              <div className="admin-analytics-chart-box">
                <div className="admin-analytics-chart-heading">
                  <span>{language === 'uz' ? 'Moliya' : 'Финансы'}</span>
                  <small>{activeAnalyticsView.revenueChartSubtitle}</small>
                </div>
                {renderAnalyticsSvgChart({
                  data: activeAnalyticsView.revenueTimeline,
                  color: '#6366f1',
                  gradientId: `analytics-revenue-${analyticsPeriod}`,
                  mode: 'currency',
                  showAllLabels: analyticsPeriod !== 'monthly',
                  showPointValues: true
                })}
              </div>

              <div className="admin-analytics-chart-box admin-analytics-chart-box-secondary">
                <div className="admin-analytics-chart-heading">
                  <span>{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</span>
                  <small>{activeAnalyticsView.ordersChartSubtitle}</small>
                </div>
                {renderAnalyticsSvgChart({
                  data: activeAnalyticsView.ordersTimeline,
                  color: '#f43f5e',
                  gradientId: `analytics-orders-${analyticsPeriod}`,
                  mode: 'count',
                  showAllLabels: analyticsPeriod !== 'monthly',
                  showPointValues: true
                })}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4 mb-4">
        <Col xs={12}>
          {renderAnalyticsMapCard()}
        </Col>
      </Row>

      {renderAnalyticsTopTables()}
      {renderAnalyticsProductReviews()}
    </div>
    );
  };

  return (
    <>
      <div className={actionButtonsVisible ? '' : 'action-buttons-hidden'}>
      <Navbar expand="lg" className="admin-navbar admin-navbar-shell py-3 mb-4 shadow-sm">
        <HeaderGlowBackground />
        <Container
          fluid={isOrdersKanbanMode}
          className={`admin-navbar-container${isOrdersKanbanMode ? ' admin-navbar-container-kanban-focus' : ''}`}
        >
          <Navbar.Brand
            as="div"
            className={`d-flex align-items-center gap-2 py-1 ${canSwitchRestaurants ? 'admin-brand-trigger' : ''}`}
            role={canSwitchRestaurants ? 'button' : undefined}
            tabIndex={canSwitchRestaurants ? 0 : undefined}
            onClick={canSwitchRestaurants ? () => {
              setRestaurantSwitchSearch('');
              setShowRestaurantPickerModal(true);
            } : undefined}
            onKeyDown={canSwitchRestaurants ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setRestaurantSwitchSearch('');
                setShowRestaurantPickerModal(true);
              }
            } : undefined}
            aria-label={canSwitchRestaurants ? 'Открыть выбор магазина' : undefined}
          >
            {activeRestaurantLogoUrl ? (
              <div className={`admin-brand-logo-shell admin-brand-logo-shell-${activeRestaurantLogoDisplayMode}`}>
                <img
                  src={activeRestaurantLogoUrl}
                  alt="Logo"
                  className="admin-brand-logo"
                />
              </div>
            ) : (
              <div className="admin-brand-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" /><path d="M12 3v6" />
                </svg>
              </div>
            )}
            <div className="d-flex flex-column admin-brand-meta">
              <span className="admin-brand-title">
                {canSwitchRestaurants && <i className="bi bi-chevron-down admin-brand-chevron" aria-hidden="true"></i>}
                <span>{user?.active_restaurant_name || t('operatorPanel')}</span>
              </span>
              <span className="admin-brand-subtitle">
                {t('controlPanel')}
              </span>
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
              {/* Broadcast */}
              <Nav.Link
                onClick={() => setShowBroadcastModal(true)}
                className="admin-nav-link admin-header-pill admin-header-action-pill admin-collapsible-pill admin-collapsible-pill--action"
                title={t('broadcast')}
              >
                <span className="admin-pill-icon" aria-hidden="true">
                  <i className="bi bi-megaphone-fill"></i>
                </span>
                <span className="admin-pill-expand">{t('broadcast')}</span>
              </Nav.Link>
              {isReservationModuleEnabled && (
                <Nav.Link
                  onClick={() => navigate('/admin/reservations')}
                  className="admin-nav-link admin-header-pill admin-header-action-pill admin-collapsible-pill admin-collapsible-pill--action"
                  title={t('reservations')}
                >
                  <span className="admin-pill-icon" aria-hidden="true">
                    <i className="bi bi-calendar2-week-fill"></i>
                  </span>
                  <span className="admin-pill-expand">{t('reservations')}</span>
                </Nav.Link>
              )}

              {/* User + Language + Logout group */}
              <div className="d-flex align-items-stretch gap-2 ms-lg-2 admin-header-pill-group">
                <Dropdown align="end" className="d-none admin-header-lang-dropdown">
                  <Dropdown.Toggle
                    variant="link"
                    bsPrefix="p-0"
                    className="d-flex align-items-center py-1 px-3 rounded-pill text-decoration-none border-0 admin-header-pill admin-lang-pill admin-collapsible-pill admin-collapsible-pill--lang"
                    title={activeLanguageOption?.label || activeLanguageOption?.shortLabel || 'RU'}
                  >
                    <span className="admin-pill-icon" aria-hidden="true">
                      <img src={activeLanguageOption?.flag} width="16" height="12" alt={activeLanguageOption?.shortLabel || 'LANG'} className="rounded-1" />
                    </span>
                    <span className="admin-pill-expand">
                      <span className="admin-lang-pill-label">{activeLanguageOption?.shortLabel || 'RU'}</span>
                      <i className="bi bi-chevron-down admin-lang-pill-chevron" aria-hidden="true"></i>
                    </span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-lang-dropdown-menu">
                    {languageOptions.map((option) => (
                      <Dropdown.Item
                        key={option.code}
                        onClick={() => handleLanguageSelect(option.code)}
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

                {/* User Profile Dropdown (desktop) */}
                <Dropdown align="end" className="d-none">
                  <Dropdown.Toggle
                    variant="link"
                    bsPrefix="p-0"
                    className="d-flex align-items-center py-1 px-3 rounded-pill text-decoration-none custom-user-dropdown admin-user-toggle admin-header-pill admin-user-pill admin-collapsible-pill admin-collapsible-pill--user"
                    title={user?.full_name || user?.username || 'Administrator'}
                  >
                    <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white shadow-sm admin-user-avatar admin-pill-icon">
                      {user?.username?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div className="d-none d-md-block text-start admin-pill-expand">
                      <div className="text-white small fw-bold lh-1">{user?.full_name || user?.username || 'Administrator'}</div>
                      <div className="text-white-50 small admin-user-id">ID: {String(user?.id || 0).padStart(5, '0')}</div>
                    </div>
                  </Dropdown.Toggle>

                  <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4 admin-dropdown-menu-wide">
                    <div className="px-3 py-3 border-bottom mb-2 bg-light rounded-top-4">
                      <div className="fw-bold text-dark">{user?.full_name || user?.username}</div>
                      <div className="text-muted small">{user?.role === 'superadmin' ? 'Super Administrator' : 'Administrator'}</div>
                    </div>

                    {isSuperAdmin() && (
                      <Dropdown.Item onClick={() => navigate('/superadmin')} className="d-flex align-items-center gap-2 py-2 rounded-3">
                        <i className="bi bi-shield-lock text-primary"></i> <span>{t('superAdmin')}</span>
                      </Dropdown.Item>
                    )}

                    <Dropdown.Divider className="mx-2" />
                    <Dropdown.Item onClick={handleLogout} className="text-danger d-flex align-items-center gap-2 py-2 rounded-3">
                      <i className="bi bi-box-arrow-right"></i> <span>{t('logout')}</span>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>

                {/* Mobile account button -> bottom sheet */}
                <button
                  type="button"
                  className="d-flex d-lg-none align-items-center gap-2 py-1 px-3 rounded-pill text-decoration-none border-0 custom-user-dropdown admin-user-toggle admin-header-pill admin-user-pill"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                  onClick={() => setShowMobileAccountSheet(true)}
                >
                  <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white shadow-sm admin-user-avatar">
                    {user?.username?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="text-start">
                    <div className="text-white small fw-bold lh-1">{user?.full_name || user?.username || 'Administrator'}</div>
                    <div className="text-white-50 small admin-user-id">ID: {String(user?.id || 0).padStart(5, '0')}</div>
                  </div>
                </button>

                {/* Separate Balance pill */}
                <div
                  className="py-1 px-3 rounded-pill d-flex align-items-center justify-content-center text-decoration-none shadow-sm transition-all admin-header-pill admin-balance-pill admin-collapsible-pill admin-collapsible-pill--balance"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchBillingInfo();
                    setShowBalanceModal(true);
                  }}
                  title={`${checksAvailableLabel}: ${formatChecksCount(balanceChecksCount)} ${checksCountLabel}`}
                >
                  <span className="admin-pill-icon admin-balance-icon" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 3h16v18H4z" />
                      <path d="M8 7h8" />
                      <path d="M8 11h8" />
                      <path d="m8.5 15 2.2 2 4.8-4.5" />
                    </svg>
                  </span>
                  <span className="admin-pill-expand admin-balance-content">
                    <span className="text-white-50 extra-small fw-bold text-uppercase admin-balance-caption">{checksAvailableLabel}</span>
                    <span className="text-white fw-bold admin-balance-value">
                      {formatChecksCount(balanceChecksCount)} <span className="opacity-75 fw-normal small">{checksCountLabel}</span>
                    </span>
                  </span>
                </div>
              </div>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Modal
        show={showRestaurantPickerModal}
        onHide={() => {
          setShowRestaurantPickerModal(false);
          setRestaurantSwitchSearch('');
        }}
        centered
        className="admin-modal"
      >
        <Modal.Header closeButton className="border-0">
          <Modal.Title className="d-flex align-items-center gap-2">
            <i className="bi bi-shop-window"></i>
            <span>{t('switchRestaurant')}</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          <Form.Group className="mb-3">
            <Form.Control
              value={restaurantSwitchSearch}
              onChange={(e) => setRestaurantSwitchSearch(e.target.value)}
              placeholder={t('saSearchShop') || 'Поиск магазина...'}
              autoFocus
            />
          </Form.Group>

          <div className="admin-restaurant-switch-list">
            {filteredRestaurants.length > 0 ? (
              filteredRestaurants.map((r) => {
                const isActiveRestaurant = Number(r.id) === Number(user?.active_restaurant_id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSwitchRestaurant(r.id)}
                    className={`admin-restaurant-switch-item ${isActiveRestaurant ? 'is-active' : ''}`}
                  >
                    <div className="d-flex align-items-center gap-2 min-w-0">
                      <span className={`admin-restaurant-switch-dot ${isActiveRestaurant ? 'is-active' : ''}`} aria-hidden="true" />
                      <span className="text-truncate fw-semibold">{r.name}</span>
                    </div>
                    {isActiveRestaurant && (
                      <Badge bg="light" text="dark" pill className="border">
                        Текущий
                      </Badge>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="text-center text-muted py-4">
                Магазины не найдены
              </div>
            )}
          </div>
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
            {user?.full_name || user?.username || 'Administrator'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          <div className="d-grid gap-2">
            {isSuperAdmin() && (
              <Button
                variant="light"
                className="text-start d-flex align-items-center gap-2"
                onClick={() => {
                  setShowMobileAccountSheet(false);
                  navigate('/superadmin');
                }}
              >
                <i className="bi bi-shield-lock"></i> {t('superAdmin')}
              </Button>
            )}

            <Button
              variant="light"
              className="text-danger text-start d-flex align-items-center gap-2"
              onClick={() => {
                setShowMobileAccountSheet(false);
                handleLogout();
              }}
            >
              <i className="bi bi-box-arrow-right"></i> {t('logout')}
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
            Фильтры
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          {renderMobileFiltersSheetContent()}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0 d-flex gap-2">
          <Button variant="light" className="flex-fill" onClick={resetActiveTabMobileFilters}>
            Сбросить
          </Button>
          <Button className="btn-primary-custom flex-fill" onClick={() => setShowMobileFiltersSheet(false)}>
            Применить
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showKanbanColumnFilterModal}
        onHide={() => setShowKanbanColumnFilterModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 fw-bold">
            Фильтр колонки: {kanbanColumns.find((column) => column.value === activeKanbanFilterColumn)?.label || 'Статус'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-grid gap-3">
            <Form.Group>
              <Form.Label className="small text-muted mb-1">Тип подачи</Form.Label>
              <Form.Select
                value={kanbanFilterDraft.fulfillment}
                onChange={(e) => setKanbanFilterDraft((prev) => ({ ...prev, fulfillment: e.target.value }))}
              >
                <option value="all">Все</option>
                <option value="pickup">Только самовывоз</option>
                <option value="delivery">Только доставка</option>
              </Form.Select>
            </Form.Group>

            <Form.Group>
              <Form.Label className="small text-muted mb-1">Показывать по времени</Form.Label>
              <Form.Select
                value={kanbanFilterDraft.timing}
                onChange={(e) => setKanbanFilterDraft((prev) => ({ ...prev, timing: e.target.value }))}
              >
                <option value="all">Все заказы</option>
                <option value="asap">Только «Как можно быстрее»</option>
                <option value="scheduled">Только «Ко времени»</option>
              </Form.Select>
            </Form.Group>

            <Form.Group>
              <Form.Label className="small text-muted mb-1">Сортировка по «Ко времени»</Form.Label>
              <Form.Select
                value={kanbanFilterDraft.scheduleSort}
                onChange={(e) => setKanbanFilterDraft((prev) => ({ ...prev, scheduleSort: e.target.value }))}
              >
                <option value="none">Отключено</option>
                <option value="asc">Сначала ранние</option>
                <option value="desc">Сначала поздние</option>
              </Form.Select>
            </Form.Group>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={resetKanbanColumnFilterModal}>Сбросить</Button>
          <Button className="btn-primary-custom" onClick={applyKanbanColumnFilterModal}>Применить</Button>
        </Modal.Footer>
      </Modal>

      <Container fluid={isOrdersKanbanMode} className={`admin-panel${isOrdersKanbanMode ? ' admin-panel-kanban-focus' : ''}`}>
        {/* Alerts */}
        {alertMessage.text && (
          <Alert
            variant={alertMessage.type}
            dismissible
            onClose={() => setAlertMessage({ type: '', text: '' })}
            className="mb-3"
          >
            {alertMessage.text}
          </Alert>
        )}

        {/* No restaurant selected warning */}
        {!user?.active_restaurant_id && (
          <Alert variant="warning" className="mb-3">
            ⚠️ {t('selectRestaurant')}
            {user?.restaurants?.length > 0 && ` ${t('useRestaurantMenu')}`}
          </Alert>
        )}

        <div className={`admin-tabs-shell${isSidebarCollapsed ? ' is-collapsed' : ''}`}>
          <div className={`admin-sidebar-column${isSidebarCollapsed ? ' is-collapsed' : ''}`}>
            <Nav
              activeKey={mainTab}
              onSelect={handleSidebarTabSelect}
              className={`admin-tabs admin-tabs-sidebar${isOrdersKanbanMode ? ' admin-tabs-kanban-focus' : ''}${isSidebarCollapsed ? ' is-collapsed' : ''}`}
            >
              {renderAdminSidebarNavItems()}
            </Nav>
            {renderAdminSidebarUtilityActions()}
          </div>
          <Card className={`admin-card admin-main-card admin-workspace-main${isOrdersKanbanMode ? ' admin-main-card-kanban-focus' : ''}`}>
            <Card.Body>
              <div className="admin-tab-content-shell">
              <Tabs
                activeKey={mainTab}
                onSelect={handleSidebarTabSelect}
                className="admin-tabs admin-tabs-content-only"
              >
              {/* Dashboard Tab */}
              <Tab eventKey="dashboard" title={renderAdminSidebarTabTitle('dashboard')}>
                {renderAnalyticsDashboard()}
                {false && (
                  <>
                {/* Filters */}
                <Row className="mb-4 g-3">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted">{t('year')}</Form.Label>
                      <Form.Select
                        value={dashboardYear}
                        onChange={(e) => setDashboardYear(parseInt(e.target.value))}
                      >
                        {[2024, 2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted">{t('month')}</Form.Label>
                      <Form.Select
                        value={dashboardMonth}
                        onChange={(e) => setDashboardMonth(parseInt(e.target.value))}
                      >
                        {[
                          { value: 1, label: t('monthJan') },
                          { value: 2, label: t('monthFeb') },
                          { value: 3, label: t('monthMar') },
                          { value: 4, label: t('monthApr') },
                          { value: 5, label: t('monthMay') },
                          { value: 6, label: t('monthJun') },
                          { value: 7, label: t('monthJul') },
                          { value: 8, label: t('monthAug') },
                          { value: 9, label: t('monthSep') },
                          { value: 10, label: t('monthOct') },
                          { value: 11, label: t('monthNov') },
                          { value: 12, label: t('monthDec') },
                        ].map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted">
                        {language === 'uz' ? 'Kunlik hisobot kuni' : 'День ежедневного отчёта'}
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={dashboardDailyDate}
                        onChange={(e) => setDashboardDailyDate(String(e.target.value || '').trim() || getTodayDateKey())}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {/* Stats Widgets */}
                <Row className="g-4 mb-4">
                  <Col md={4}>
                    <Card className="border-0 shadow-sm h-100 admin-kpi-card admin-kpi-card-month-revenue">
                      <Card.Body>
                        <div>
                          <h6 className="mb-1 admin-kpi-title">{t('revenue')}</h6>
                          <h3 className="mb-0 admin-kpi-value">{formatPrice(analytics.revenue)} {t('sum')}</h3>
                          <div className="admin-analytics-breakdown mt-2">
                            <div className="admin-analytics-breakdown-row">
                              <span className="admin-analytics-chip admin-analytics-chip-items">
                                {language === 'uz' ? 'Tovarlar' : 'Товары'}: {formatPrice(analytics.itemsRevenue)} {t('sum')}
                              </span>
                              <span className="admin-analytics-chip admin-analytics-chip-delivery">
                                {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}: {formatPrice(analytics.deliveryRevenue)} {t('sum')}
                              </span>
                            </div>
                            <div className="admin-analytics-breakdown-row">
                              <span className="admin-analytics-chip admin-analytics-chip-service">
                                {language === 'uz' ? 'Servis' : 'Сервис'}: {formatPrice(analytics.serviceRevenue)} {t('sum')}
                              </span>
                              <span className="admin-analytics-chip admin-analytics-chip-packaging">
                                {language === 'uz' ? 'Fasovka' : 'Фасовка'}: {formatPrice(analytics.containersRevenue)} {t('sum')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="border-0 shadow-sm h-100 admin-kpi-card admin-kpi-card-month-orders">
                      <Card.Body>
                        <div>
                          <h6 className="mb-1 admin-kpi-title">{t('ordersCount')}</h6>
                          <h3 className="mb-0 admin-kpi-value">{analytics.ordersCount}</h3>
                          <div className="admin-analytics-breakdown mt-2">
                            <div className="admin-analytics-breakdown-row">
                              <span className="admin-analytics-chip admin-analytics-chip-pickup">
                                {language === 'uz' ? "O'zingiz olib ketish" : 'Самовывоз'}: {analytics.pickupOrdersCount}
                              </span>
                              <span className="admin-analytics-chip admin-analytics-chip-delivery-count">
                                {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}: {analytics.deliveryOrdersCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="border-0 shadow-sm h-100 admin-kpi-card admin-kpi-card-month-average">
                      <Card.Body>
                        <div>
                          <h6 className="mb-1 admin-kpi-title">{t('averageCheck')}</h6>
                          <h3 className="mb-0 admin-kpi-value">{formatPrice(analytics.averageCheck)} {t('sum')}</h3>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Row className="g-4 mb-4">
                  <Col xs={12}>
                    <Card className="border-0 shadow-sm admin-daily-report-card admin-analytics-surface-card">
                      <Card.Header className="bg-white border-0 d-flex flex-wrap align-items-center justify-content-between gap-2 admin-analytics-card-header">
                        <h6 className="mb-0 admin-analytics-card-title">
                          <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>⏱️</span>
                          {language === 'uz' ? "Kunlik hisobot: buyurtmalar piki" : 'Ежедневный отчёт: пик заказов'}
                        </h6>
                        <div className="small text-muted admin-analytics-card-subtle">
                          {t('date')}: <span className="fw-semibold text-dark">{formatDateKeyLabel(dashboardDailyDate, language)}</span>
                        </div>
                      </Card.Header>
                      <Card.Body>
                        <div className="admin-daily-report-summary mb-3">
                          <div className="admin-daily-report-kpi">
                            <span>{language === 'uz' ? 'Jami buyurtmalar' : 'Все заказы'}</span>
                            <strong>{dailyAnalytics.totalOrdersAllStatuses}</strong>
                          </div>
                          <div className="admin-daily-report-kpi">
                            <span>{language === 'uz' ? 'Yakunlangan' : 'Доставлено'}</span>
                            <strong>{dailyAnalytics.ordersCount}</strong>
                          </div>
                          <div className="admin-daily-report-kpi">
                            <span>{language === 'uz' ? 'Kunlik tushum' : 'Выручка за день'}</span>
                            <strong>{formatPrice(dailyAnalytics.revenue)} {t('sum')}</strong>
                          </div>
                          <div className="admin-daily-report-kpi">
                            <span>{language === 'uz' ? 'Pik (buyurtma/soat)' : 'Пик (заказов/час)'}</span>
                            <strong>{dailyAnalytics.peakOrdersCount}</strong>
                          </div>
                        </div>

                        <div className="admin-daily-orders-chart">
                          <svg viewBox="0 0 1000 320" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                            {(() => {
                              const chartRows = dailyOrdersTimeline.points;
                              const chartWidth = 1000;
                              const chartHeight = 320;
                              const chartPadding = { top: 22, right: 28, bottom: 48, left: 56 };
                              const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
                              const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
                              const maxValue = Math.max(dailyOrdersTimeline.maxCount, 1);
                              const yTicks = 4;
                              const peakHoursSet = new Set(dailyOrdersTimeline.peakHours);
                              const getX = (hour) => chartPadding.left + ((hour / (chartRows.length - 1)) * innerWidth);
                              const getY = (value) => chartPadding.top + innerHeight - ((value / maxValue) * innerHeight);
                              const linePoints = chartRows
                                .map((point) => `${getX(point.hour)},${getY(point.count)}`)
                                .join(' ');
                              const areaPath = chartRows
                                .map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(point.hour)} ${getY(point.count)}`)
                                .join(' ') +
                                ` L ${getX(chartRows[chartRows.length - 1].hour)} ${chartPadding.top + innerHeight}` +
                                ` L ${getX(chartRows[0].hour)} ${chartPadding.top + innerHeight} Z`;

                              return (
                                <>
                                  {Array.from({ length: yTicks + 1 }, (_, index) => {
                                    const ratio = index / yTicks;
                                    const y = chartPadding.top + (innerHeight * ratio);
                                    const value = Math.round(maxValue * (1 - ratio));
                                    return (
                                      <g key={`daily-orders-grid-${index}`}>
                                        <line
                                          x1={chartPadding.left}
                                          y1={y}
                                          x2={chartPadding.left + innerWidth}
                                          y2={y}
                                          stroke="#dbe8ff"
                                          strokeWidth="1"
                                          strokeDasharray={index === yTicks ? '0' : '4 4'}
                                        />
                                        <text
                                          x={chartPadding.left - 10}
                                          y={y + 4}
                                          textAnchor="end"
                                          fontSize="11"
                                          fill="#64748b"
                                        >
                                          {value}
                                        </text>
                                      </g>
                                    );
                                  })}

                                  <path d={areaPath} fill="url(#dailyOrdersAreaGradient)" />
                                  <polyline
                                    points={linePoints}
                                    fill="none"
                                    stroke="#0ea5e9"
                                    strokeWidth="3"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                  />

                                  {chartRows.map((point) => {
                                    const x = getX(point.hour);
                                    const y = getY(point.count);
                                    const isPeak = peakHoursSet.has(point.hour) && point.count > 0;
                                    return (
                                      <g key={`daily-orders-point-${point.hour}`}>
                                        <circle
                                          cx={x}
                                          cy={y}
                                          r={isPeak ? 6 : 4}
                                          fill={isPeak ? '#ef4444' : '#0ea5e9'}
                                          stroke="#ffffff"
                                          strokeWidth={isPeak ? 2 : 1.5}
                                        />
                                        {isPeak && (
                                          <text
                                            x={x}
                                            y={y - 11}
                                            textAnchor="middle"
                                            fontSize="11"
                                            fill="#dc2626"
                                            fontWeight="700"
                                          >
                                            {point.count}
                                          </text>
                                        )}
                                      </g>
                                    );
                                  })}

                                  {chartRows.map((point) => {
                                    if (!(point.hour % 2 === 0 || point.hour === chartRows.length - 1)) return null;
                                    return (
                                      <text
                                        key={`daily-orders-hour-${point.hour}`}
                                        x={getX(point.hour)}
                                        y={chartPadding.top + innerHeight + 22}
                                        textAnchor="middle"
                                        fontSize="10.5"
                                        fill="#64748b"
                                      >
                                        {formatHourLabel(point.hour)}
                                      </text>
                                    );
                                  })}

                                  <defs>
                                    <linearGradient id="dailyOrdersAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.36" />
                                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
                                    </linearGradient>
                                  </defs>
                                </>
                              );
                            })()}
                          </svg>
                        </div>

                        <div className="small text-muted mt-3 d-flex flex-wrap gap-3">
                          <span>
                            {language === 'uz' ? 'Pik soatlar' : 'Пиковые часы'}:{' '}
                            <strong className="text-dark">
                              {dailyAnalytics.peakHours.length
                                ? dailyAnalytics.peakHours.map((hour) => formatHourLabel(hour)).join(', ')
                                : '—'}
                            </strong>
                          </span>
                          <span>
                            {language === 'uz' ? "O'rtacha chek" : 'Средний чек'}:{' '}
                            <strong className="text-dark">{formatPrice(dailyAnalytics.averageCheck)} {t('sum')}</strong>
                          </span>
                          <span>
                            {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}:{' '}
                            <strong className="text-dark">{dailyAnalytics.deliveryOrdersCount}</strong>
                          </span>
                          <span>
                            {language === 'uz' ? "O'zingiz olib ketish" : 'Самовывоз'}:{' '}
                            <strong className="text-dark">{dailyAnalytics.pickupOrdersCount}</strong>
                          </span>
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
                        <div className="d-flex align-items-center gap-2">
                          <Form.Select
                            size="sm"
                            value={leafletMapProvider}
                            onChange={(e) => handleLeafletMapProviderChange(e.target.value)}
                            style={{ minWidth: '140px' }}
                            aria-label="Выбор карты"
                          >
                            {mapProviderOptions.map((item) => (
                              <option key={`analytics-monthly-map-provider-${item.value}`} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </Form.Select>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            className="admin-analytics-fullscreen-btn"
                            onClick={() => setShowAnalyticsMapModal(true)}
                            title={t('fullscreen') || 'Во весь экран'}
                            aria-label={t('fullscreen') || 'Во весь экран'}
                          >
                            <i className="bi bi-arrows-fullscreen" />
                          </Button>
                        </div>
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
                              {isYandexMapProvider ? (
                                <YandexAnalyticsMap
                                  points={analytics.orderLocations || []}
                                  shopPoint={analyticsShopLocation}
                                  selectedPoint={analyticsMapSelectionLocked ? selectedAnalyticsLocation : null}
                                  onSelectPoint={openAnalyticsLocationDetails}
                                  onLoadError={handleYandexAnalyticsMapLoadError}
                                  height="100%"
                                />
                              ) : (
                                <MapContainer
                                  center={ANALYTICS_DEFAULT_MAP_CENTER}
                                  zoom={ANALYTICS_DEFAULT_MAP_ZOOM}
                                  style={{ height: '100%', width: '100%', filter: 'saturate(0.9) contrast(1.03)' }}
                                >
                                  <TileLayer
                                    url={mapTileLayerConfig.url}
                                    attribution={mapTileLayerConfig.attribution}
                                    maxZoom={mapTileLayerConfig.maxZoom}
                                  />
                                  <AnalyticsMapResizeFix />
                                  <AnalyticsMapAutoBounds points={monthlyAnalyticsMapPoints} />
                                  <AnalyticsMapFocus selectedPoint={analyticsMapSelectionLocked ? selectedAnalyticsLocation : null} />
                                  {analytics.orderLocations.map((location) => {
                                    const isSelected = selectedAnalyticsLocation &&
                                      (selectedAnalyticsLocation.orderId === location.orderId);
                                    return (
                                      <Marker
                                        key={`analytics-map-${location.orderId || location.orderNumber}`}
                                        position={[location.lat, location.lng]}
                                        icon={getAnalyticsPointIcon(isSelected)}
                                        zIndexOffset={isSelected ? 1000 : 0}
                                        eventHandlers={{
                                          click: () => openAnalyticsLocationDetails(location)
                                        }}
                                      />
                                    );
                                  })}
                                  {analyticsShopLocation && (
                                    <Marker
                                      position={[analyticsShopLocation.lat, analyticsShopLocation.lng]}
                                      icon={getAnalyticsShopIcon()}
                                      zIndexOffset={1300}
                                    />
                                  )}
                                </MapContainer>
                              )}
                            </div>
                          </Col>
                          <Col lg={4} xl={3} className="border-start bg-white">
                            <div className="p-3 admin-custom-scrollbar admin-analytics-map-sidebar" style={{ maxHeight: '390px', overflowY: 'auto' }}>
                              <div className="small text-uppercase text-muted fw-semibold mb-2 admin-analytics-map-sidebar-title">
                                {t('clients') || 'Клиенты'}
                              </div>
                              <div className="d-grid gap-2">
                                {analyticsLocationsList.length > 0 ? analyticsLocationsList.map((location) => {
                                  const locationKey = getAnalyticsLocationKey(location);
                                  const isSelected = selectedAnalyticsLocation &&
                                    (selectedAnalyticsLocation.orderId === location.orderId);
                                  return (
                                    <button
                                      type="button"
                                      key={`analytics-list-${location.orderId || location.orderNumber}`}
                                      ref={(el) => {
                                        if (!locationKey) return;
                                        if (el) analyticsListItemRefs.current.set(locationKey, el);
                                        else analyticsListItemRefs.current.delete(locationKey);
                                      }}
                                      onClick={() => openAnalyticsLocationDetails(location)}
                                      className={`btn text-start admin-analytics-map-list-item${isSelected ? ' is-active' : ''}`}
                                      style={{
                                        border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`,
                                        background: isSelected ? '#eff6ff' : '#ffffff'
                                      }}
                                    >
                                      <div className="fw-semibold">{location.customerName || 'Клиент'}</div>
                                      <div className="small text-muted">{location.customerPhone || '—'}</div>
                                      <div className="small mt-1">№{location.orderNumber} · {formatPrice(location.totalAmount)} {t('sum')}</div>
                                    </button>
                                  );
                                }) : (
                                  <div className="text-muted small py-2">{t('noDataForPeriod')}</div>
                                )}
                              </div>

                              {selectedAnalyticsLocation && (
                                <div className="mt-3 p-3 rounded-3 border admin-analytics-map-detail" style={{ background: '#f8fafc' }}>
                                  <div className="small fw-semibold mb-2">{t('client') || 'Клиент'}</div>
                                  <div className="small"><strong>{language === 'uz' ? 'Buyurtma' : 'Заказ'}:</strong> №{selectedAnalyticsLocation.orderNumber || '—'}</div>
                                  <div className="small"><strong>{t('amount')}:</strong> {formatPrice(selectedAnalyticsLocation.totalAmount || 0)} {t('sum')}</div>
                                  <div className="small"><strong>{t('date')}:</strong> {selectedAnalyticsLocation.createdAt ? new Date(selectedAnalyticsLocation.createdAt).toLocaleString('ru-RU') : '—'}</div>
                                  <div className="small"><strong>{language === 'uz' ? 'Manzil' : 'Адрес'}:</strong> {selectedAnalyticsLocation.deliveryAddress || '—'}</div>
                                </div>
                              )}
                            </div>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Row className="g-4">
                  <Col lg={6}>
                    <Card className="border-0 shadow-sm h-100 admin-analytics-surface-card admin-analytics-table-card">
                      <Card.Header className="bg-white border-0 admin-analytics-card-header">
                        <h6 className="mb-0 admin-analytics-card-title">
                          <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>🍔</span>
                          {t('topProducts')}
                        </h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        {analytics.topProducts.length > 0 ? (
                          <Table hover className="mb-0 admin-analytics-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{t('productName')}</th>
                                <th className="text-end">{t('quantity')}</th>
                                <th className="text-end">{t('revenue')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.topProducts.map((item, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <span className={`admin-analytics-rank ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : ''}`}>{idx + 1}</span>
                                  </td>
                                  <td>{item.name}</td>
                                  <td className="text-end">{item.quantity}</td>
                                  <td className="text-end">{formatPrice(item.revenue)}</td>
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
                          <span className="admin-analytics-card-title-icon" style={{ color: '#0f172a', background: '#f1f5f9' }}>👑</span>
                          {t('topCustomers') || 'Топ клиентов'}
                        </h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        {analytics.topCustomers.length > 0 ? (
                          <Table hover className="mb-0 admin-analytics-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{t('client')}</th>
                                <th className="text-end">{t('ordersCount')}</th>
                                <th className="text-end">{t('revenue')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.topCustomers.map((item, idx) => (
                                <tr key={`top-customer-${idx}-${item.phone}`}>
                                  <td>
                                    <span className={`admin-analytics-rank ${idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : ''}`}>{idx + 1}</span>
                                  </td>
                                  <td>
                                    <div className="fw-semibold">{item.name}</div>
                                    <small className="text-muted">{item.phone}</small>
                                  </td>
                                  <td className="text-end">{item.ordersCount}</td>
                                  <td className="text-end">{formatPrice(item.totalAmount)}</td>
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

                {/* =====================================================
                    ГОДОВАЯ АНАЛИТИКА
                ===================================================== */}
                <hr className="my-4" />
                <h5 className="mb-4 admin-analytics-year-title">
                  <span className="admin-analytics-card-title-icon" style={{ color: '#4f46e5', background: '#eef2ff' }}>📈</span>
                  {t('yearlyAnalytics')} {dashboardYear} {t('yearSuffix')}
                </h5>

                {loadingYearlyAnalytics ? (
                  <div className="py-3">
                    <ListSkeleton count={3} label="Загрузка годовой аналитики" />
                  </div>
                ) : (
                  <>
                    {/* Yearly Summary Cards */}
                    <Row className="g-4 mb-4">
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100 admin-kpi-card admin-kpi-card-year-revenue">
                          <Card.Body>
                            <div>
                              <h6 className="mb-1 admin-kpi-title">{t('revenueForYear')}</h6>
                              <h3 className="mb-0 admin-kpi-value">{formatPrice(yearlyAnalytics.totalRevenue)} {t('sum')}</h3>
                              <div className="admin-analytics-breakdown mt-2">
                                <div className="admin-analytics-breakdown-row">
                                  <span className="admin-analytics-chip admin-analytics-chip-items">
                                    {language === 'uz' ? 'Tovarlar' : 'Товары'}: {formatPrice(yearlyFinancialStats.items)} {t('sum')}
                                  </span>
                                  <span className="admin-analytics-chip admin-analytics-chip-delivery">
                                    {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}: {formatPrice(yearlyFinancialStats.delivery)} {t('sum')}
                                  </span>
                                </div>
                                <div className="admin-analytics-breakdown-row">
                                  <span className="admin-analytics-chip admin-analytics-chip-service">
                                    {language === 'uz' ? 'Servis' : 'Сервис'}: {formatPrice(yearlyFinancialStats.service)} {t('sum')}
                                  </span>
                                  <span className="admin-analytics-chip admin-analytics-chip-packaging">
                                    {language === 'uz' ? 'Fasovka' : 'Фасовка'}: {formatPrice(yearlyFinancialStats.containers)} {t('sum')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100 admin-kpi-card admin-kpi-card-year-orders">
                          <Card.Body>
                            <div>
                              <h6 className="mb-1 admin-kpi-title">{t('ordersForYear')}</h6>
                              <h3 className="mb-0 admin-kpi-value">{yearlyAnalytics.totalOrders}</h3>
                              <div className="admin-analytics-breakdown mt-2">
                                <div className="admin-analytics-breakdown-row">
                                  <span className="admin-analytics-chip admin-analytics-chip-pickup">
                                    {language === 'uz' ? "O'zingiz olib ketish" : 'Самовывоз'}: {yearlyFulfillmentStats.pickup}
                                  </span>
                                  <span className="admin-analytics-chip admin-analytics-chip-delivery-count">
                                    {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}: {yearlyFulfillmentStats.delivery}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100 admin-kpi-card admin-kpi-card-year-average">
                          <Card.Body>
                            <div>
                              <h6 className="mb-1 admin-kpi-title">{t('avgCheckForYear')}</h6>
                              <h3 className="mb-0 admin-kpi-value">{formatPrice(yearlyAnalytics.averageCheck)} {t('sum')}</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>

                    <Card className="border-0 shadow-sm mb-4 admin-analytics-surface-card admin-analytics-chart-card">
                      <Card.Header className="bg-white border-0 admin-analytics-card-header">
                        <h6 className="mb-0 admin-analytics-card-title">
                          <span className="admin-analytics-card-title-icon" style={{ color: '#3b82f6', background: '#eff6ff' }}>💹</span>
                          {t('financeByMonths')}
                        </h6>
                      </Card.Header>
                      <Card.Body>
                        <div style={{ height: '300px', position: 'relative' }}>
                          {/* SVG Line Chart for Revenue */}
                          <svg viewBox="0 0 1000 280" style={{ width: '100%', height: '100%' }}>
                            {/* Grid lines */}
                            {[0, 1, 2, 3, 4].map(i => (
                              <line key={i} x1="50" y1={50 + i * 50} x2="950" y2={50 + i * 50} stroke="#e0e0e0" strokeWidth="1" />
                            ))}

                            {/* Y-axis labels */}
                            {(() => {
                              const maxRevenue = Math.max(...yearlyAnalytics.monthlyData.map(m => m.revenue), 1);
                              return [0, 1, 2, 3, 4].map(i => (
                                <text key={i} x="45" y={255 - i * 50} textAnchor="end" fontSize="11" fill="#666">
                                  {formatPrice(Math.round(maxRevenue * i / 4))}
                                </text>
                              ));
                            })()}

                            {/* Line path */}
                            {(() => {
                              const maxRevenue = Math.max(...yearlyAnalytics.monthlyData.map(m => m.revenue), 1);
                              const points = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.revenue / maxRevenue) * 200;
                                return `${x},${y}`;
                              }).join(' ');

                              const areaPath = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.revenue / maxRevenue) * 200;
                                return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                              }).join(' ') + ` L ${75 + 11 * 75},250 L 75,250 Z`;

                              return (
                                <>
                                  {/* Area fill */}
                                  <path d={areaPath} fill="url(#revenueGradient)" opacity="0.3" />
                                  {/* Line */}
                                  <polyline points={points} fill="none" stroke="#667eea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                  {/* Points */}
                                  {yearlyAnalytics.monthlyData.map((m, i) => {
                                    const x = 75 + i * 75;
                                    const y = 250 - (m.revenue / maxRevenue) * 200;
                                    return (
                                      <g key={i}>
                                        <circle cx={x} cy={y} r="6" fill="#667eea" />
                                        <circle cx={x} cy={y} r="3" fill="white" />
                                      </g>
                                    );
                                  })}
                                </>
                              );
                            })()}

                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#667eea" />
                                <stop offset="100%" stopColor="#667eea" stopOpacity="0" />
                              </linearGradient>
                            </defs>

                            {/* X-axis labels */}
                            {[t('monthShortJan'), t('monthShortFeb'), t('monthShortMar'), t('monthShortApr'), t('monthShortMay'), t('monthShortJun'), t('monthShortJul'), t('monthShortAug'), t('monthShortSep'), t('monthShortOct'), t('monthShortNov'), t('monthShortDec')].map((m, i) => (
                              <text key={i} x={75 + i * 75} y="275" textAnchor="middle" fontSize="11" fill="#666">{m}</text>
                            ))}
                          </svg>
                        </div>
                        {/* Revenue values row */}
                        <div className="d-flex justify-content-between mt-2 px-4" style={{ overflowX: 'auto' }}>
                          {yearlyAnalytics.monthlyData.map((m, i) => (
                            <div key={i} className="text-center" style={{ minWidth: '70px' }}>
                              <small className="text-muted d-block" style={{ fontSize: '10px' }}>
                                {formatPrice(m.revenue)}
                              </small>
                            </div>
                          ))}
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Orders Chart - Line Graph */}
                    <Card className="border-0 shadow-sm mb-4 admin-analytics-surface-card admin-analytics-chart-card">
                      <Card.Header className="bg-white border-0 admin-analytics-card-header">
                        <h6 className="mb-0 admin-analytics-card-title">
                          <span className="admin-analytics-card-title-icon" style={{ color: '#ef4444', background: '#fff1f2' }}>📦</span>
                          {t('deliveredOrdersByMonths')}
                        </h6>
                      </Card.Header>
                      <Card.Body>
                        <div style={{ height: '300px', position: 'relative' }}>
                          {/* SVG Line Chart for Orders */}
                          <svg viewBox="0 0 1000 280" style={{ width: '100%', height: '100%' }}>
                            {/* Grid lines */}
                            {[0, 1, 2, 3, 4].map(i => (
                              <line key={i} x1="50" y1={50 + i * 50} x2="950" y2={50 + i * 50} stroke="#e0e0e0" strokeWidth="1" />
                            ))}

                            {/* Y-axis labels */}
                            {(() => {
                              const maxOrders = Math.max(...yearlyAnalytics.monthlyData.map(m => m.orders_count), 1);
                              return [0, 1, 2, 3, 4].map(i => (
                                <text key={i} x="45" y={255 - i * 50} textAnchor="end" fontSize="11" fill="#666">
                                  {Math.round(maxOrders * i / 4)}
                                </text>
                              ));
                            })()}

                            {/* Line path */}
                            {(() => {
                              const maxOrders = Math.max(...yearlyAnalytics.monthlyData.map(m => m.orders_count), 1);
                              const points = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.orders_count / maxOrders) * 200;
                                return `${x},${y}`;
                              }).join(' ');

                              const areaPath = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.orders_count / maxOrders) * 200;
                                return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                              }).join(' ') + ` L ${75 + 11 * 75},250 L 75,250 Z`;

                              return (
                                <>
                                  {/* Area fill */}
                                  <path d={areaPath} fill="url(#ordersGradient)" opacity="0.3" />
                                  {/* Line */}
                                  <polyline points={points} fill="none" stroke="#f5576c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                  {/* Points */}
                                  {yearlyAnalytics.monthlyData.map((m, i) => {
                                    const x = 75 + i * 75;
                                    const y = 250 - (m.orders_count / maxOrders) * 200;
                                    return (
                                      <g key={i}>
                                        <circle cx={x} cy={y} r="6" fill="#f5576c" />
                                        <circle cx={x} cy={y} r="3" fill="white" />
                                      </g>
                                    );
                                  })}
                                </>
                              );
                            })()}

                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="ordersGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#f5576c" />
                                <stop offset="100%" stopColor="#f5576c" stopOpacity="0" />
                              </linearGradient>
                            </defs>

                            {/* X-axis labels */}
                            {[t('monthShortJan'), t('monthShortFeb'), t('monthShortMar'), t('monthShortApr'), t('monthShortMay'), t('monthShortJun'), t('monthShortJul'), t('monthShortAug'), t('monthShortSep'), t('monthShortOct'), t('monthShortNov'), t('monthShortDec')].map((m, i) => (
                              <text key={i} x={75 + i * 75} y="275" textAnchor="middle" fontSize="11" fill="#666">{m}</text>
                            ))}
                          </svg>
                        </div>
                        {/* Orders count row */}
                        <div className="d-flex justify-content-between mt-2 px-4" style={{ overflowX: 'auto' }}>
                          {yearlyAnalytics.monthlyData.map((m, i) => (
                            <div key={i} className="text-center" style={{ minWidth: '70px' }}>
                              <small className="text-primary fw-bold">{m.orders_count}</small>
                            </div>
                          ))}
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Top 5 Products by Month - Horizontal Scroll */}
                    <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 12, overflow: 'hidden' }}>
                      <Card.Header className="border-0 d-flex align-items-center gap-2" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', padding: '16px 20px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 9 7" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 15 7 15 7" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                          </svg>
                        </div>
                        <h6 className="mb-0" style={{ fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>{t('top5ByMonths')}</h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        <div className="premium-scrollbar" style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 8 }}>
                          <div className="d-flex" style={{ minWidth: 'max-content' }}>
                            {[t('monthJan'), t('monthFeb'), t('monthMar'), t('monthApr'), t('monthMay'), t('monthJun'), t('monthJul'), t('monthAug'), t('monthSep'), t('monthOct'), t('monthNov'), t('monthDec')].map((monthName, monthIdx) => {
                              const hasData = yearlyAnalytics.topProductsByMonth[monthIdx]?.length > 0;
                              const isCurrentMonth = monthIdx === new Date().getMonth() && dashboardYear === new Date().getFullYear();
                              return (
                                <div
                                  key={monthIdx}
                                  style={{
                                    minWidth: '210px',
                                    maxWidth: '210px',
                                    borderRight: monthIdx < 11 ? '1px solid #f1f5f9' : 'none',
                                    background: isCurrentMonth ? 'rgba(102, 126, 234, 0.03)' : 'transparent'
                                  }}
                                  className="px-3 pt-3 pb-2"
                                >
                                  {/* Month header pill */}
                                  <div className="text-center mb-3">
                                    <span style={{
                                      display: 'inline-block',
                                      background: isCurrentMonth
                                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                        : hasData
                                          ? 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)'
                                          : '#f1f5f9',
                                      color: isCurrentMonth ? '#fff' : hasData ? '#4338ca' : '#94a3b8',
                                      padding: '6px 18px',
                                      borderRadius: '20px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      letterSpacing: '0.3px',
                                      boxShadow: isCurrentMonth ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none'
                                    }}>
                                      {monthName}
                                    </span>
                                  </div>

                                  {hasData ? (
                                    <div style={{ whiteSpace: 'normal' }}>
                                      {yearlyAnalytics.topProductsByMonth[monthIdx].map((product, idx) => {
                                        // Medal colors for top 3
                                        const medalColors = [
                                          { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', numBg: 'linear-gradient(135deg, #f59e0b, #d97706)', numColor: '#fff' },
                                          { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', numBg: 'linear-gradient(135deg, #94a3b8, #64748b)', numColor: '#fff' },
                                          { bg: '#fff1e6', border: '#ea8b4b', text: '#7c2d12', numBg: 'linear-gradient(135deg, #ea8b4b, #c2410c)', numColor: '#fff' },
                                        ];
                                        const medal = medalColors[idx] || { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', numBg: '#e2e8f0', numColor: '#64748b' };

                                        return (
                                          <div
                                            key={idx}
                                            className="d-flex align-items-center mb-2"
                                            style={{
                                              background: medal.bg,
                                              border: `1px solid ${medal.border}20`,
                                              borderRadius: 8,
                                              padding: '8px 10px',
                                              transition: 'transform 0.15s ease',
                                            }}
                                          >
                                            {/* Rank number */}
                                            <div style={{
                                              width: 24,
                                              height: 24,
                                              borderRadius: '50%',
                                              background: medal.numBg,
                                              color: medal.numColor,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              flexShrink: 0,
                                              marginRight: 8,
                                              boxShadow: idx < 3 ? '0 1px 3px rgba(0,0,0,0.15)' : 'none'
                                            }}>
                                              {idx + 1}
                                            </div>

                                            {/* Product info */}
                                            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                              <div style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontWeight: 600,
                                                fontSize: '12px',
                                                color: medal.text,
                                                lineHeight: 1.3
                                              }} title={product.name}>
                                                {product.name}
                                              </div>
                                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 1 }}>
                                                {product.quantity} {t('unitPcs')} · {formatPrice(product.revenue)} {t('sum')}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="d-flex flex-column align-items-center justify-content-center" style={{ whiteSpace: 'normal', padding: '24px 8px' }}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                                      </svg>
                                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>{t('noData')}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </>
                )}
                  </>
                )}

              </Tab>

              <Tab eventKey="orders" title={renderAdminSidebarTabTitle('orders')}>

                <div className="d-flex justify-content-between align-items-center mb-3 gap-2 admin-order-toolbar">
                  {/* Status pill tabs */}
                  <div className="admin-order-status-tabs" role="tablist" aria-label={language === 'uz' ? 'Buyurtma statuslari' : 'Статусы заказов'}>
                    {orderStatusPillItems.map(s => {
                      const isActive = statusFilter === s.value;
                      const count = visibleOrderStatusCounts?.[s.value] || 0;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => {
                            if (ordersViewMode === 'kanban') return;
                            setStatusFilter(s.value);
                          }}
                          className={`admin-order-status-pill${isActive ? ' is-active' : ''}${ordersViewMode === 'kanban' ? ' is-disabled' : ''}`}
                          style={{ '--order-status-color': s.color }}
                        >
                          <span className="admin-order-status-pill-label">
                            <span className="admin-order-status-pill-emoji" aria-hidden="true">{s.emoji}</span>
                            <span>{s.label}</span>
                          </span>
                          {count > 0 && (
                            <span className="admin-order-status-pill-count">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="d-flex align-items-center gap-2 admin-order-toolbar-right">
                    <Button variant="outline-secondary" className="btn-mobile-filter d-lg-none" onClick={() => setShowMobileFiltersSheet(true)}>
                      <i className="bi bi-funnel"></i> Фильтр
                    </Button>
                    <div className="admin-order-date-range d-none d-md-flex">
                      <Form.Control
                        type="date"
                        size="sm"
                        value={ordersDateFrom}
                        onChange={(e) => {
                          const nextFrom = e.target.value;
                          setOrdersDateFrom(nextFrom);
                          if (ordersDateTo && nextFrom && nextFrom > ordersDateTo) {
                            setOrdersDateTo(nextFrom);
                          }
                        }}
                      />
                      <span className="admin-order-date-range-separator">—</span>
                      <Form.Control
                        type="date"
                        size="sm"
                        value={ordersDateTo}
                        onChange={(e) => {
                          const nextTo = e.target.value;
                          setOrdersDateTo(nextTo);
                          if (ordersDateFrom && nextTo && nextTo < ordersDateFrom) {
                            setOrdersDateFrom(nextTo);
                          }
                        }}
                      />
                    </div>
                    <div className="admin-order-view-switch" role="tablist" aria-label={language === 'uz' ? "Buyurtmalar ko'rinishi" : 'Вид заказов'}>
                      {orderViewModeItems.map((modeItem) => {
                        const isActive = ordersViewMode === modeItem.value;
                        return (
                          <button
                            key={`orders-view-${modeItem.value}`}
                            type="button"
                            className={`admin-order-view-switch-btn${isActive ? ' is-active' : ''}`}
                            onClick={() => setOrdersViewMode(modeItem.value)}
                            aria-pressed={isActive}
                            title={modeItem.label}
                          >
                            <i className={`bi ${modeItem.icon}`} aria-hidden="true" />
                            <span className="visually-hidden">{modeItem.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="admin-order-download-slot d-none d-md-flex">
                      {ordersViewMode !== 'kanban' ? (
                        <Button variant="dark" className="btn-primary-custom" onClick={exportOrders}>
                          <span className="d-none d-md-inline">{t('downloadExcel')}</span>
                          <span className="d-md-none">Экспорт</span>
                        </Button>
                      ) : (
                        <span className="admin-order-download-placeholder" aria-hidden="true"></span>
                      )}
                    </div>
                  </div>
                </div>

                {ordersViewMode === 'list' ? (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table mb-0">
                        <thead>
                          <tr>
                            <th>{t('orderNumber')}</th>
                            <th>{t('client')}</th>
                            <th>{t('amount')}</th>
                            <th>{t('status')}</th>
                            <th>{t('date')}</th>
                            <th>{t('actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedOrders.map(order => {
                            const rawOrderStatus = order.status === 'in_progress' ? 'preparing' : order.status;
                            const orderStatus = getOrderDisplayWorkflowStatus(order);
                            const needsBillingPayment = !order.is_paid && !billingInfo.restaurant?.is_free_tier;
                            const paymentMethodKey = normalizeAnalyticsPaymentMethod(order.payment_method);
                            const paymentStatusKey = String(order.payment_status || '').trim().toLowerCase();
                            const isPaymeOrder = paymentMethodKey === 'payme';
                            const requiresPaymePayment = isPaymeOrder && paymentStatusKey !== 'paid';
                            const isPaymePaid = isPaymeOrder && paymentStatusKey === 'paid';
                            const hideSensitive = isOrderSensitiveDataHidden(order);
                            const canCancelCurrentOrder = canCancelOrder(order);

                            return (
                              <tr
                                key={order.id}
                                onDoubleClick={() => openOrderModal(order)}
                                onTouchEnd={(e) => handleRowTouchOpen(e, `order-${order.id}`, () => openOrderModal(order))}
                                style={{ cursor: 'pointer' }}
                                title="Двойной клик / двойной тап: открыть заказ"
                              >
                                <td>{order.order_number}</td>
                                <td>
                                  <div>
                                    <strong>{hideSensitive ? 'Скрыто до принятия' : order.customer_name}</strong>
                                    <br />
                                    <small className={needsBillingPayment ? "text-muted opacity-50" : ""}>
                                      {hideSensitive ? 'Нажмите «Принять»' : order.customer_phone}
                                      {needsBillingPayment && (
                                        <span className="ms-1" title="Требуется оплата">🔒</span>
                                      )}
                                    </small>
                                  </div>
                                </td>
                                <td>{formatPrice(order.total_amount)} {t('sum')}</td>
                                <td>
                                  <div className="d-flex flex-column gap-1">
                                    {getStatusBadge(orderStatus)}
                                    {requiresPaymePayment && rawOrderStatus === 'new' && (
                                      <Badge bg="warning" text="dark" style={{ fontSize: '0.65rem' }}>Требует оплаты (Payme)</Badge>
                                    )}
                                    {isPaymePaid && (
                                      <Badge bg="success" style={{ fontSize: '0.65rem' }}>Payme оплачено</Badge>
                                    )}
                                    {needsBillingPayment && rawOrderStatus === 'new' && (
                                      <Badge bg="secondary" style={{ fontSize: '0.65rem' }}>Требует списания чека</Badge>
                                    )}
                                  </div>
                                </td>
                                <td>{new Date(order.created_at).toLocaleString('ru-RU')}</td>
                                <td>
                                  <div className="admin-order-actions-grid">
                                    <div className="admin-order-actions-slot admin-order-actions-slot-main">
                                      {renderOrderMainActionButton(order, { showPlaceholder: true })}
                                    </div>

                                    <div className="admin-order-actions-slot">
                                      <Button
                                        className="action-btn bg-primary bg-opacity-10 text-primary border-0"
                                        size="sm"
                                        onClick={() => openOrderModal(order)}
                                        title={t('details')}
                                      >
                                        <ReceiptIcon />
                                      </Button>
                                    </div>

                                    <div className="admin-order-actions-slot">
                                      {canCancelCurrentOrder ? (
                                        <Button
                                          className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                          size="sm"
                                          onClick={() => openCancelModal(order.id)}
                                          title={t('cancelOrder')}
                                        >
                                          <TrashIcon />
                                        </Button>
                                      ) : (
                                        <span className="admin-order-action-placeholder admin-order-action-placeholder-icon" aria-hidden="true"></span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>

                    <AdminListPagination
                      current={ordersPage}
                      total={dateFilteredOrders.length}
                      limit={ordersLimit}
                      onPageChange={setOrdersPage}
                      onLimitChange={(value) => {
                        setOrdersLimit(value);
                        setOrdersPage(1);
                      }}
                    />
                  </>
                ) : (
                  <div className="admin-order-kanban-board">
                    {kanbanColumns.map((column) => {
                      const columnFilter = getKanbanColumnFilter(column.value);
                      const isSortAsc = columnFilter.sortDirection === 'asc';
                      const hasCustomFilter = isKanbanColumnFilterCustom(columnFilter);
                      const columnOrders = kanbanOrdersByStatus[column.value] || [];
                      return (
                        <section className="admin-order-kanban-column" key={`kanban-column-${column.value}`}>
                          <header className="admin-order-kanban-column-header">
                            <div className="admin-order-kanban-column-title-wrap">
                              <span
                                className="admin-order-kanban-column-dot"
                                style={{ background: column.color }}
                                aria-hidden="true"
                              />
                              <span className="admin-order-kanban-column-title">{column.label}</span>
                            </div>
                            <div className="admin-order-kanban-column-controls">
                              <button
                                type="button"
                                className={`admin-order-kanban-column-btn admin-order-kanban-column-sort-btn${isSortAsc ? ' is-asc' : ''}`}
                                onClick={() => toggleKanbanColumnSort(column.value)}
                                title={isSortAsc ? 'Сначала более ранние' : 'Сначала более поздние'}
                              >
                                <i className="bi bi-arrow-down" aria-hidden="true"></i>
                              </button>
                              <button
                                type="button"
                                className={`admin-order-kanban-column-btn admin-order-kanban-column-filter-btn${hasCustomFilter ? ' is-active' : ''}`}
                                onClick={() => openKanbanColumnFilterModal(column.value)}
                                title="Фильтр колонки"
                              >
                                <i className="bi bi-funnel" aria-hidden="true"></i>
                              </button>
                              <Badge pill className="admin-order-kanban-column-count">
                                {columnOrders.length}
                              </Badge>
                            </div>
                          </header>

                          <div
                            className={`admin-order-kanban-column-body${kanbanScrollingColumns[column.value] ? ' is-scrolling' : ''}`}
                            onScroll={() => handleKanbanColumnScroll(column.value)}
                          >
                            {columnOrders.length > 0 ? columnOrders.map((order) => {
                              const rawOrderStatus = order.status === 'in_progress' ? 'preparing' : order.status;
                              const orderStatus = getOrderDisplayWorkflowStatus(order);
                              const needsBillingPayment = !order.is_paid && !billingInfo.restaurant?.is_free_tier;
                              const paymentMethodKey = normalizeAnalyticsPaymentMethod(order.payment_method);
                              const paymentStatusKey = String(order.payment_status || '').trim().toLowerCase();
                              const isPaymeOrder = paymentMethodKey === 'payme';
                              const requiresPaymePayment = isPaymeOrder && paymentStatusKey !== 'paid';
                              const isPaymePaid = isPaymeOrder && paymentStatusKey === 'paid';
                              const hideSensitive = isOrderSensitiveDataHidden(order);
                              const canCancelCurrentOrder = canCancelOrder(order);
                              const workflowTiming = getOrderWorkflowTiming(order, orderStatus);
                              const deliveryDeadline = formatDeliveryDateTime(order.delivery_date, order.delivery_time);
                              const deliveryTimingLabel = getDeliveryTimingLabel(order.delivery_date, order.delivery_time);
                              const isPickup = isPickupOrderForAnalytics(order);
                              const fulfillmentTypeLabel = isPickup ? '🚶‍♂️ Самовывоз' : '🚕 Доставка';
                              const paymentMethodLabel = getPaymentMethodLabel(order.payment_method);
                              const itemsCount = getOrderItemsCount(order);
                              const isKanbanCardExpanded = Boolean(expandedKanbanCardIds[String(order.id)]);
                              const isUzbek = language === 'uz';
                              const expandCardLabel = isKanbanCardExpanded
                                ? (isUzbek ? 'Yashirish' : 'Скрыть')
                                : (isUzbek ? 'Yana' : 'Ещё');
                              const isScheduledDateOrder = isFutureDeliveryDate(order.delivery_date);

                              return (
                                <article
                                  key={`kanban-order-${order.id}`}
                                  className={`admin-order-kanban-card${isKanbanCardExpanded ? ' is-expanded' : ''}${isScheduledDateOrder ? ' scheduled-date-order' : ''}`}
                                  onDoubleClick={() => openOrderModal(order)}
                                  onTouchEnd={(e) => handleRowTouchOpen(e, `kanban-order-${order.id}`, () => openOrderModal(order))}
                                  title="Двойной клик / двойной тап: открыть заказ"
                                >
                                  <div className="admin-order-kanban-card-head">
                                    <strong>#{order.order_number}</strong>
                                    {isScheduledDateOrder && (
                                      <span className="badge bg-info text-dark ms-1" style={{ fontSize: '0.7rem' }}>
                                        📅 {(() => {
                                          const raw = String(order.delivery_date || '').trim();
                                          if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
                                            const [y, m, d] = raw.slice(0, 10).split('-');
                                            return `${d}.${m}.${y}`;
                                          }
                                          return raw;
                                        })()}
                                      </span>
                                    )}
                                    {getStatusBadge(orderStatus)}
                                  </div>

                                  <div className="admin-order-kanban-card-overview">
                                    <div className="admin-order-kanban-card-overview-main">
                                      <div className="fw-semibold">{hideSensitive ? 'Скрыто до принятия' : order.customer_name}</div>
                                      <small className={needsBillingPayment ? "text-muted opacity-50" : "text-muted"}>
                                        {hideSensitive ? 'Нажмите «Принять»' : renderCustomerPhoneLink(order.customer_phone)}
                                        {needsBillingPayment && (
                                          <span className="ms-1" title="Требуется оплата">🔒</span>
                                        )}
                                      </small>
                                    </div>
                                    <div className="admin-order-kanban-card-overview-meta">
                                      <span className="admin-order-kanban-amount">{formatPrice(order.total_amount)} {t('sum')}</span>
                                      <small className="text-muted">{new Date(order.created_at).toLocaleString('ru-RU')}</small>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className={`admin-order-kanban-expand-btn${isKanbanCardExpanded ? ' is-expanded' : ''}`}
                                    aria-expanded={isKanbanCardExpanded}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleKanbanCardExpanded(order.id);
                                    }}
                                  >
                                    <span>{expandCardLabel}</span>
                                    <i className="bi bi-chevron-down" aria-hidden="true"></i>
                                  </button>

                                  <div className="admin-order-kanban-card-details">
                                    <div className="admin-order-kanban-card-info-list">
                                      <div className="admin-order-kanban-card-info-item">
                                        <span className="admin-order-kanban-card-info-label">
                                          {workflowTiming.isFinal
                                            ? (orderStatus === 'cancelled' ? 'Отменен за:' : 'Выполнен за:')
                                            : 'С момента заказа:'}
                                        </span>
                                        <strong className="admin-order-kanban-card-info-value">
                                          {formatElapsedDuration(workflowTiming.totalSeconds)}
                                        </strong>
                                      </div>
                                      <div className="admin-order-kanban-card-info-item">
                                        <span className="admin-order-kanban-card-info-label">
                                          {workflowTiming.isFinal ? 'На финальном статусе:' : 'В текущем статусе:'}
                                        </span>
                                        <strong className={`admin-order-kanban-card-info-value ${getElapsedSeverityClass(workflowTiming.statusSeconds)}`}>
                                          {formatElapsedDuration(workflowTiming.statusSeconds)}
                                        </strong>
                                      </div>
                                      <div className="admin-order-kanban-card-info-item">
                                        <span className="admin-order-kanban-card-info-label">{deliveryTimingLabel}:</span>
                                        <span className="admin-order-kanban-card-info-value text-end">{deliveryDeadline}</span>
                                      </div>
                                      <div className="admin-order-kanban-card-info-item">
                                        <span className="admin-order-kanban-card-info-label">Оплата:</span>
                                        <span className="admin-order-kanban-card-info-value d-inline-flex align-items-center gap-1">
                                          {renderAnalyticsPaymentMethodIcon(paymentMethodKey, paymentMethodLabel)}
                                          {shouldRenderAnalyticsPaymentMethodText(paymentMethodKey) && <span>{paymentMethodLabel}</span>}
                                        </span>
                                      </div>
                                      <div className="admin-order-kanban-card-info-item">
                                        <span className="admin-order-kanban-card-info-label">Подача:</span>
                                        <span className="admin-order-kanban-card-info-value">{fulfillmentTypeLabel}</span>
                                      </div>
                                      <div className="admin-order-kanban-card-info-item">
                                        <span className="admin-order-kanban-card-info-label">Товаров:</span>
                                        <span className="admin-order-kanban-card-info-value">{itemsCount}</span>
                                      </div>
                                    </div>

                                    <div className="admin-order-kanban-card-badges">
                                      {requiresPaymePayment && rawOrderStatus === 'new' && (
                                        <Badge bg="warning" text="dark" style={{ fontSize: '0.65rem' }}>Требует оплаты (Payme)</Badge>
                                      )}
                                      {isPaymePaid && (
                                        <Badge bg="success" style={{ fontSize: '0.65rem' }}>Payme оплачено</Badge>
                                      )}
                                      {needsBillingPayment && rawOrderStatus === 'new' && (
                                        <Badge bg="secondary" style={{ fontSize: '0.65rem' }}>Требует списания чека</Badge>
                                      )}
                                    </div>

                                    <div className="admin-order-kanban-card-actions">
                                      <div className="admin-order-actions-slot admin-order-actions-slot-main">
                                        {renderOrderMainActionButton(order, { buttonClassName: 'admin-order-main-action-btn admin-order-main-action-btn-kanban' })}
                                      </div>
                                      <div className="admin-order-actions-slot">
                                        <Button
                                          className="action-btn bg-primary bg-opacity-10 text-primary border-0"
                                          size="sm"
                                          onClick={() => openOrderModal(order)}
                                          title={t('details')}
                                        >
                                          <EyeIcon />
                                        </Button>
                                      </div>
                                      <div className="admin-order-actions-slot">
                                        {canCancelCurrentOrder ? (
                                          <Button
                                            className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                            size="sm"
                                            onClick={() => openCancelModal(order.id)}
                                            title={t('cancelOrder')}
                                          >
                                            <TrashIcon />
                                          </Button>
                                        ) : (
                                          <span className="admin-order-action-placeholder admin-order-action-placeholder-icon" aria-hidden="true"></span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </article>
                              );
                            }) : (
                              <div className="admin-order-kanban-empty">
                                {t('noData')}
                              </div>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}

              </Tab>

              {isReservationModuleEnabled && (
              <Tab eventKey="reservations" title={renderAdminSidebarTabTitle('reservations')}>
                <Card className="border-0 shadow-sm mb-3">
                  <Card.Body>
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                      <div>
                        <h5 className="mb-2">{language === 'uz' ? 'Bronlash moduli' : 'Модуль бронирования'}</h5>
                        <div className="text-muted">
                          {language === 'uz'
                            ? 'Qavatlar, stol sig‘imi, stol rasmi va bron holatlarini boshqarish.'
                            : 'Управление этажами, вместимостью столов, фото столов и статусами броней.'}
                        </div>
                      </div>
                      <Button variant="primary" onClick={() => navigate('/admin/reservations')}>
                        {language === 'uz' ? 'Modulni ochish' : 'Открыть модуль'}
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              </Tab>
              )}

              <Tab eventKey="products" title={renderAdminSidebarTabTitle('products')}>

                <div className="d-flex justify-content-between align-items-center mb-3 admin-product-toolbar">
                  <h5 className="mb-0 admin-mobile-section-title">{t('products')}</h5>
                  <div className="d-flex gap-2 admin-product-toolbar-actions">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      className={`admin-filter-icon-btn${showProductsFilterPanel ? ' is-active' : ''}`}
                      onClick={() => setShowProductsFilterPanel((prev) => !prev)}
                      title={language === 'uz' ? 'Filtrlar' : 'Фильтры'}
                      aria-label={language === 'uz' ? 'Filtrlarni ochish' : 'Открыть фильтры'}
                      aria-expanded={showProductsFilterPanel}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Button>
                    <Button
                      variant="outline-primary"
                      onClick={() => setShowPasteImportModal(true)}
                      className="btn-primary-custom"
                    >
                      {language === 'uz' ? 'Import' : 'Импорт'}
                    </Button>
                    <Dropdown align="end" className="admin-products-add-dropdown" popperConfig={{ strategy: 'fixed' }}>
                      <Dropdown.Toggle variant="dark" className="btn-primary-custom" id="admin-products-add-menu">
                        {language === 'uz' ? "+ Qo'shish" : '+ Добавить'}
                      </Dropdown.Toggle>
                      <Dropdown.Menu className="admin-products-add-dropdown-menu">
                        <Dropdown.Item onClick={() => openProductModal()}>
                          {language === 'uz' ? "Qo'lda qo'shish" : 'Добавить вручную'}
                        </Dropdown.Item>
                        <Dropdown.Item onClick={openGlobalImportModal}>
                          {language === 'uz' ? "Global mahsulot qo'shish" : 'Добавить глобальный товар'}
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>
                </div>

                {/* Filters and Search */}
                {showProductsFilterPanel && (
                <Row className="mb-3 g-2 admin-products-filter-panel">
                  <Col lg={3}>
                    <InputGroup size="sm">
                      <InputGroup.Text>🔍</InputGroup.Text>
                      <Form.Control
                        placeholder={t('searchByName')}
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      {productSearch && (
                        <Button variant="outline-secondary" onClick={() => setProductSearch('')}>
                          ✕
                        </Button>
                      )}
                    </InputGroup>
                  </Col>
                  <Col lg={2}>
                    <Dropdown popperConfig={{ strategy: 'fixed' }}>
                      <Dropdown.Toggle as={CustomToggle} id="dropdown-custom-components" className="form-select-sm">
                        {productCategoryFilter === 'all'
                          ? t('allCategories')
                          : (() => {
                            const selectedObj = categories.find(c => c.id === parseInt(productCategoryFilter));
                            return selectedObj ? selectedObj.name_ru : t('allCategories');
                          })()}
                      </Dropdown.Toggle>

                      <Dropdown.Menu as={CustomMenu} className="admin-filter-dropdown-menu">
                        <Dropdown.Item onClick={() => { setProductCategoryFilter('all'); setProductSubcategoryFilter('all'); setProductThirdCategoryFilter('all'); }}>
                          {t('allCategories')}
                        </Dropdown.Item>
                        {rootCategoryOptions.map(cat => (
                          <Dropdown.Item
                            key={cat.id}
                            onClick={() => { setProductCategoryFilter(cat.id.toString()); setProductSubcategoryFilter('all'); setProductThirdCategoryFilter('all'); }}
                            active={productCategoryFilter === cat.id.toString()}
                          >
                            <span className="text-muted me-2 small">[{cat.sort_order !== null && cat.sort_order !== undefined ? cat.sort_order : '-'}]</span>
                            {cat.name_ru}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Col>
                  <Col lg={2}>
                    {/* Subcategory dropdown — shown when a root category is selected and has children */}
                    {(() => {
                      const subcats = productSubcategoryOptions;
                      if (subcats.length === 0) return (
                        <Form.Select size="sm" disabled>
                          <option>{t('selectSubcategory')}</option>
                        </Form.Select>
                      );
                      return (
                        <Dropdown popperConfig={{ strategy: 'fixed' }}>
                          <Dropdown.Toggle as={CustomToggle} id="dropdown-subcat" className="form-select-sm">
                            {productSubcategoryFilter === 'all'
                              ? allSubcategoriesLabel
                              : (() => {
                                const selectedObj = categories.find(c => c.id === parseInt(productSubcategoryFilter));
                                return selectedObj ? selectedObj.name_ru : allSubcategoriesLabel;
                              })()}
                          </Dropdown.Toggle>

                          <Dropdown.Menu as={CustomMenu} className="admin-filter-dropdown-menu">
                            <Dropdown.Item onClick={() => { setProductSubcategoryFilter('all'); setProductThirdCategoryFilter('all'); }}>
                              {allSubcategoriesLabel}
                            </Dropdown.Item>
                            {subcats.map(sub => (
                              <Dropdown.Item
                                key={sub.id}
                                onClick={() => { setProductSubcategoryFilter(sub.id.toString()); setProductThirdCategoryFilter('all'); }}
                                active={productSubcategoryFilter === sub.id.toString()}
                              >
                                <span className="text-muted me-2 small">[{sub.sort_order !== null && sub.sort_order !== undefined ? sub.sort_order : '-'}]</span>
                                {sub.name_ru}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      );
                    })()}
                  </Col>
                  <Col lg={2}>
                    {(() => {
                      const thirdCats = productThirdCategoryOptions;
                      if (thirdCats.length === 0) return (
                        <Form.Select size="sm" disabled>
                          <option>{thirdCategoryLabel}</option>
                        </Form.Select>
                      );
                      return (
                        <Dropdown popperConfig={{ strategy: 'fixed' }}>
                          <Dropdown.Toggle as={CustomToggle} id="dropdown-third-cat" className="form-select-sm">
                            {productThirdCategoryFilter === 'all'
                              ? allThirdCategoriesLabel
                              : (() => {
                                const selectedObj = categories.find(c => c.id === parseInt(productThirdCategoryFilter, 10));
                                return selectedObj ? selectedObj.name_ru : allThirdCategoriesLabel;
                              })()}
                          </Dropdown.Toggle>

                          <Dropdown.Menu as={CustomMenu} className="admin-filter-dropdown-menu">
                            <Dropdown.Item onClick={() => setProductThirdCategoryFilter('all')}>
                              {allThirdCategoriesLabel}
                            </Dropdown.Item>
                            {thirdCats.map(sub => (
                              <Dropdown.Item
                                key={sub.id}
                                onClick={() => setProductThirdCategoryFilter(sub.id.toString())}
                                active={productThirdCategoryFilter === sub.id.toString()}
                              >
                                <span className="text-muted me-2 small">[{sub.sort_order !== null && sub.sort_order !== undefined ? sub.sort_order : '-'}]</span>
                                {sub.name_ru}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      );
                    })()}
                  </Col>
                  <Col lg={2}>
                    <Form.Select
                      size="sm"
                      value={productStatusFilter}
                      onChange={(e) => setProductStatusFilter(e.target.value)}
                    >
                      <option value="all">{t('allStatuses')}</option>
                      <option value="active">{t('activeProducts')}</option>
                      <option value="hidden">{t('hiddenProducts')}</option>
                    </Form.Select>
                  </Col>
                  <Col lg={1}>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="w-100"
                      onClick={resetProductFilters}
                      disabled={!hasActiveProductFilters}
                    >
                      Очистить
                    </Button>
                  </Col>
                </Row>
                )}

                {/* Bulk actions bar */}
                {selectedProducts.length > 0 && (
                  <Alert variant="info" className="d-flex justify-content-between align-items-center py-2">
                    <span>{t('selectedProducts')}: <strong>{selectedProducts.length}</strong></span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleBulkDeleteProducts}
                    >
                      {t('deleteSelected')}
                    </Button>
                  </Alert>
                )}

                <div className="d-lg-none mb-2 admin-products-mobile-bulk">
                  <Form.Check
                    type="checkbox"
                    checked={(() => {
                      const filteredIds = filteredProductsForTable.map(p => p.id);
                      return filteredIds.length > 0 && filteredIds.every(id => selectedProducts.includes(id));
                    })()}
                    onChange={() => {
                      const filteredIds = filteredProductsForTable.map(p => p.id);
                      toggleSelectAllProducts(filteredIds);
                    }}
                    label={`${t('selectedProducts')}: ${selectedProducts.length}`}
                  />
                </div>

                <div className="d-lg-none admin-products-mobile-grid">
                  {pagedProducts.length === 0 ? (
                    <div className="admin-products-mobile-empty">
                      {t('noData')}
                    </div>
                  ) : (
                    pagedProducts.map((product, index) => {
                      const categoryHierarchy = categoryHierarchyById.get(Number(product.category_id)) || [];
                      const categoryPath = categoryHierarchy.length > 0
                        ? categoryHierarchy.map((category) => formatCategoryWithSort(category)).join(' • ')
                        : (product.category_name || '-');
                      const productImageSources = getProductListImageSources(product);
                      const thumbSourceResolved = productImageSources.thumb;
                      const previewSourceResolved = productImageSources.preview;
                      const productPriceLabel = getProductPriceDisplayLabel(product);
                      return (
                        <article
                          key={`mobile-product-${product.id}`}
                          className={`admin-product-mobile-card${selectedProducts.includes(product.id) ? ' is-selected' : ''}`}
                          onClick={() => openProductModal(product)}
                        >
                          <div className="admin-product-mobile-layout">
                            <div className="admin-product-mobile-cell admin-product-mobile-photo-col">
                              <Form.Check
                                type="checkbox"
                                className="admin-product-mobile-check"
                                checked={selectedProducts.includes(product.id)}
                                onClick={(e) => e.stopPropagation()}
                                onTouchEnd={(e) => e.stopPropagation()}
                                onChange={() => toggleProductSelection(product.id)}
                              />
                              <button
                                type="button"
                                className="admin-product-mobile-photo-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!previewSourceResolved) return;
                                  setPreviewImageUrl(previewSourceResolved);
                                  setShowImagePreview(true);
                                }}
                              >
                                {thumbSourceResolved ? (
                                  <img
                                    src={thumbSourceResolved}
                                    alt={product.name_ru}
                                    className="admin-product-mobile-photo"
                                  />
                                ) : (
                                  <span className="admin-product-mobile-photo-empty">+</span>
                                )}
                              </button>
                            </div>

                            <div className="admin-product-mobile-cell admin-product-mobile-main-col">
                              <div className="admin-product-mobile-name">{product.name_ru}</div>
                              <div className="admin-product-mobile-price">{productPriceLabel}</div>
                              <div className="admin-product-mobile-meta">
                                <span>#{(productsPage - 1) * productsLimit + index + 1}</span>
                                <span>•</span>
                                <span>{product.unit || '-'}</span>
                                {Number.parseFloat(product.order_step) > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{formatQuantity(product.order_step)}</span>
                                  </>
                                )}
                              </div>
                              <div className="admin-product-mobile-category" title={categoryPath}>{categoryPath}</div>
                              <div className="admin-product-mobile-status-row">
                                {product.is_hidden_catalog && (
                                  <Badge bg="dark" className="admin-product-mobile-badge">Скрыт</Badge>
                                )}
                                {(product.season_scope && product.season_scope !== 'all') && (
                                  <Badge bg="info" className="admin-product-mobile-badge">
                                    {{
                                      spring: 'Весна',
                                      summer: 'Лето',
                                      autumn: 'Осень',
                                      winter: 'Зима'
                                    }[product.season_scope] || product.season_scope}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div
                              className="admin-product-mobile-cell admin-product-mobile-controls-col"
                              onClick={(e) => e.stopPropagation()}
                              onTouchEnd={(e) => e.stopPropagation()}
                            >
                              <Form.Check
                                type="switch"
                                id={`mobile-product-stock-${product.id}`}
                                label={language === 'uz' ? 'Mavjud emas' : 'Нет в наличии'}
                                checked={!product.in_stock}
                                disabled={
                                  productStockUpdatingIds.includes(product.id)
                                  || (Boolean(restaurantSettings?.inventory_tracking_enabled) && product.size_enabled !== true)
                                }
                                className="small mb-2 admin-product-mobile-stock-switch"
                                onChange={(e) => handleProductStockToggle(product, e.target.checked)}
                              />
                              <div className="d-inline-flex flex-nowrap gap-1 product-table-actions admin-product-mobile-actions">
                                <Button
                                  className="action-btn bg-primary bg-opacity-10 text-primary border-0"
                                  size="sm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openProductModal(product);
                                  }}
                                  title="Редактировать"
                                >
                                  <EditIcon />
                                </Button>
                                <Button
                                  className="action-btn bg-info bg-opacity-10 text-info border-0"
                                  size="sm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    duplicateProduct(product);
                                  }}
                                  title="Дублировать"
                                >
                                  <CopyIcon />
                                </Button>
                                <Button
                                  className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                  size="sm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteProduct(product.id);
                                  }}
                                  title="Удалить"
                                >
                                  <TrashIcon />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                <div className="admin-table-container d-none d-lg-block">
                  <Table responsive hover className="admin-table admin-product-table mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="admin-product-col-check">
                          <Form.Check
                            type="checkbox"
                            checked={(() => {
                              const filteredIds = filteredProductsForTable.map(p => p.id);
                              return filteredIds.length > 0 && filteredIds.every(id => selectedProducts.includes(id));
                            })()}
                            onChange={() => {
                              const filteredIds = filteredProductsForTable.map(p => p.id);
                              toggleSelectAllProducts(filteredIds);
                            }}
                          />
                        </th>
                        <th className="admin-product-col-index">№</th>
                        <th className="admin-product-col-photo">{t('photo')}</th>
                        <th className="admin-product-col-name">{t('productName')}</th>
                        <th className="admin-product-col-sort">{t('sortOrder')}</th>
                        <th className="admin-product-col-category">{t('category')}</th>
                        <th className="admin-product-col-price">{t('price')}</th>
                        <th className="admin-product-col-unit">Ед.изм</th>
                        <th className="admin-product-col-step">Шаг</th>
                        <th className="admin-product-col-container">Фасовка</th>
                        <th className="admin-product-col-status">{t('status')}</th>
                        <th className="admin-product-col-actions">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedProducts
                        .map((product, index) => {
                          const categoryHierarchy = categoryHierarchyById.get(Number(product.category_id)) || [];
                          const categoryTooltip = categoryHierarchy.map((category) => formatCategoryWithSort(category)).join(' > ');
                          const productPriceLabel = getProductPriceDisplayLabel(product);
                          const productImageSources = getProductListImageSources(product);
                          return (
                            <tr
                              key={product.id}
                              className={selectedProducts.includes(product.id) ? 'table-active' : ''}
                              onDoubleClick={() => openProductModal(product)}
                              onTouchEnd={(e) => handleRowTouchOpen(e, `product-${product.id}`, () => openProductModal(product))}
                              style={{ cursor: 'pointer' }}
                              title="Двойной клик / двойной тап: открыть товар"
                            >
                            <td className="admin-product-col-check">
                              <Form.Check
                                type="checkbox"
                                checked={selectedProducts.includes(product.id)}
                                onChange={() => toggleProductSelection(product.id)}
                              />
                            </td>
                            <td className="text-muted admin-product-col-index">{(productsPage - 1) * productsLimit + index + 1}</td>
                            <td className="admin-product-col-photo">
                              {(productImageSources.thumb || productImageSources.preview) ? (
                                <img
                                  src={productImageSources.thumb || productImageSources.preview}
                                  alt={product.name_ru}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    objectFit: 'cover',
                                    borderRadius: 6,
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    const previewSrc = productImageSources.preview || productImageSources.thumb;
                                    if (!previewSrc) return;
                                    setPreviewImageUrl(previewSrc);
                                    setShowImagePreview(true);
                                  }}
                                />
                              ) : (
                                <div
                                  className="bg-light d-flex align-items-center justify-content-center text-muted"
                                  style={{ width: 40, height: 40, borderRadius: 6 }}
                                >
                                  📷
                                </div>
                              )}
                            </td>
                            <td className="admin-product-col-name">{product.name_ru}</td>
                            <td className="admin-product-col-sort">
                              <span className="admin-product-nowrap">{Number.isFinite(Number(product.sort_order)) ? Number(product.sort_order) : 0}</span>
                            </td>
                            <td className="admin-product-category-cell admin-product-col-category">
                              <div className="admin-product-category-lines" title={categoryTooltip || (product.category_name || '-')}>
                                {[0, 1, 2].map((levelIndex) => {
                                  const levelCategory = categoryHierarchy[levelIndex];
                                  const levelValue = levelCategory
                                    ? formatCategoryWithSort(levelCategory)
                                    : (levelIndex === 0 ? (product.category_name || '-') : '-');
                                  return (
                                    <div className="admin-product-category-line" key={`product-${product.id}-category-level-${levelIndex}`}>
                                      <span className="admin-product-category-label">{categoryLineLabels[levelIndex]}:</span>
                                      <span className="admin-product-category-value">{levelValue}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="admin-product-col-price">{productPriceLabel}</td>
                            <td className="admin-product-col-unit"><span className="admin-product-nowrap">{product.unit || '-'}</span></td>
                            <td className="admin-product-col-step"><span className="admin-product-nowrap">{Number.parseFloat(product.order_step) > 0 ? formatQuantity(product.order_step) : '-'}</span></td>
                            <td className="admin-product-col-container"><span className="admin-product-ellipsis">{product.container_name || '-'}</span></td>
                            <td className="admin-product-col-status">
                              <div className="d-flex flex-column gap-1 align-items-start">
                                {product.in_stock ? (
                                  <Badge bg="success">В наличии</Badge>
                                ) : (
                                  <Badge bg="secondary">Нет в наличии</Badge>
                                )}
                                {product.is_hidden_catalog && (
                                  <Badge bg="dark">Скрыт из каталога</Badge>
                                )}
                                {(product.season_scope && product.season_scope !== 'all') && (
                                  <Badge bg="info">
                                    {{
                                      spring: 'Весна',
                                      summer: 'Лето',
                                      autumn: 'Осень',
                                      winter: 'Зима'
                                    }[product.season_scope] || product.season_scope}
                                  </Badge>
                                )}
                                {Boolean(restaurantSettings?.inventory_tracking_enabled) && product.size_enabled !== true && (
                                  <Badge bg={product.in_stock ? 'success' : 'secondary'}>
                                    Остаток: {formatQuantity(Number(product.stock_quantity || 0))}
                                  </Badge>
                                )}
                                <Form.Check
                                  type="switch"
                                  id={`product-stock-${product.id}`}
                                  label={language === 'uz' ? 'Mavjud emas' : 'Нет в наличии'}
                                  checked={!product.in_stock}
                                  disabled={
                                    productStockUpdatingIds.includes(product.id)
                                    || (Boolean(restaurantSettings?.inventory_tracking_enabled) && product.size_enabled !== true)
                                  }
                                  className="small mb-0"
                                  onClick={(e) => e.stopPropagation()}
                                  onTouchEnd={(e) => e.stopPropagation()}
                                  onChange={(e) => handleProductStockToggle(product, e.target.checked)}
                                />
                              </div>
                            </td>
                            <td className="admin-product-col-actions">
                              <div className="d-inline-flex flex-nowrap gap-1 product-table-actions">
                                <Button
                                  className="action-btn bg-primary bg-opacity-10 text-primary border-0"
                                  size="sm"
                                  onClick={() => openProductModal(product)}
                                  title="Редактировать"
                                >
                                  <EditIcon />
                                </Button>
                                <Button
                                  className="action-btn bg-info bg-opacity-10 text-info border-0"
                                  size="sm"
                                  onClick={() => duplicateProduct(product)}
                                  title="Дублировать"
                                >
                                  <CopyIcon />
                                </Button>
                                <Button
                                  className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                  size="sm"
                                  onClick={() => handleDeleteProduct(product.id)}
                                  title="Удалить"
                                >
                                  <TrashIcon />
                                </Button>
                              </div>
                            </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </Table>
                </div>

                <AdminListPagination
                  current={productsPage}
                  total={filteredProductsForTable.length}
                  limit={productsLimit}
                  onPageChange={setProductsPage}
                  onLimitChange={(value) => {
                    setProductsLimit(value);
                    setProductsPage(1);
                  }}
                />

              </Tab>

              <Tab eventKey="showcase" title={renderAdminSidebarTabTitle('showcase')}>
                <ShowcaseBuilderTab />
              </Tab>

              <Tab eventKey="containers" title={renderAdminSidebarTabTitle('containers')}>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="admin-mobile-section-title">{t('containers')}</h5>
                  <Button variant="primary" className="btn-primary-custom" onClick={() => openContainerModal()}>
                    {t('add')}
                  </Button>
                </div>
                <p className="text-muted small mb-3">
                  {t('containerDesc')}
                </p>
                <div className="admin-table-container">
                  <Table responsive hover className="admin-table mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t('productName')}</th>
                        <th>{t('price')}</th>
                        <th>{t('sortOrder')}</th>
                        <th>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="text-center text-muted py-4">
                            {t('noContainersAdded')}
                          </td>
                        </tr>
                      ) : (
                        containers.map(container => (
                          <tr key={container.id}>
                            <td>{container.name}</td>
                            <td>{formatPrice(container.price)} {t('sum')}</td>
                            <td>{container.sort_order}</td>
                            <td>
                              <Button
                                className="action-btn bg-primary bg-opacity-10 text-primary border-0 me-1"
                                size="sm"
                                onClick={() => openContainerModal(container)}
                                title={t('edit')}
                              >
                                <EditIcon />
                              </Button>
                              <Button
                                className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                size="sm"
                                onClick={() => deleteContainer(container.id)}
                                title={t('delete')}
                              >
                                <TrashIcon />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>

              </Tab>

              <Tab eventKey="feedback" title={
                <span className="admin-side-tab-title">
                  <MessageCircle size={16} className="admin-side-tab-icon" />
                  <span className="admin-side-tab-label">{t('feedbackTab')}</span>
                  {feedbackStats.new_count > 0 && (
                    <Badge bg="danger" className="ms-1">{feedbackStats.new_count}</Badge>
                  )}
                </span>
              }>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="admin-mobile-section-title">{t('customerAppeals')}</h5>
                  <Button variant="outline-secondary" className="btn-mobile-filter d-lg-none ms-auto" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> Фильтр
                  </Button>
                  <div className="d-none d-lg-flex gap-2">
                    <Form.Select
                      size="sm"
                      style={{ width: 'auto' }}
                      value={feedbackFilter.type}
                      onChange={(e) => setFeedbackFilter({ ...feedbackFilter, type: e.target.value })}
                    >
                      <option value="">{t('allTypes')}</option>
                      <option value="complaint">{t('complaint')}</option>
                      <option value="suggestion">{t('suggestion')}</option>
                      <option value="question">{t('question')}</option>
                      <option value="other">{t('other')}</option>
                    </Form.Select>
                    <Form.Select
                      size="sm"
                      style={{ width: 'auto' }}
                      value={feedbackFilter.status}
                      onChange={(e) => setFeedbackFilter({ ...feedbackFilter, status: e.target.value })}
                    >
                      <option value="">{t('allStatuses')}</option>
                      <option value="new">{t('statusNew')}</option>
                      <option value="in_progress">{t('inProgress')}</option>
                      <option value="resolved">{t('resolved')}</option>
                      <option value="closed">{t('closed')}</option>
                    </Form.Select>
                  </div>
                </div>
                {feedback.length === 0 ? (
                  <p className="text-muted text-center py-4">{t('noAppeals')}</p>
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>#</th>
                          <th>{t('client')}</th>
                          <th>{t('type')}</th>
                          <th>{t('message')}</th>
                          <th>{t('status')}</th>
                          <th>{t('date')}</th>
                          <th>{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feedback.map((fb) => (
                          <tr key={fb.id} style={{ cursor: 'pointer' }} onClick={() => openFeedbackDetail(fb)}>
                            <td>{fb.id}</td>
                            <td>
                              <div>{fb.customer_name}</div>
                              <small className="text-muted">{fb.customer_phone}</small>
                            </td>
                            <td>
                              <Badge bg={
                                fb.type === 'complaint' ? 'danger' :
                                  fb.type === 'suggestion' ? 'info' :
                                    fb.type === 'question' ? 'warning' : 'secondary'
                              }>
                                {fb.type === 'complaint' ? t('complaint') :
                                  fb.type === 'suggestion' ? t('suggestion') :
                                    fb.type === 'question' ? t('question') : t('other')}
                              </Badge>
                            </td>
                            <td style={{ maxWidth: '250px' }}>
                              <div style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {fb.message}
                              </div>
                            </td>
                            <td>
                              <Badge bg={
                                fb.status === 'new' ? 'primary' :
                                  fb.status === 'in_progress' ? 'warning' :
                                    fb.status === 'resolved' ? 'success' : 'secondary'
                              }>
                                {fb.status === 'new' ? t('statusNew') :
                                  fb.status === 'in_progress' ? t('inProgress') :
                                    fb.status === 'resolved' ? t('resolved') : t('closed')}
                              </Badge>
                            </td>
                            <td>{new Date(fb.created_at).toLocaleDateString()}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <Button
                                className="action-btn bg-info bg-opacity-10 text-info border-0"
                                size="sm"
                                onClick={() => openFeedbackDetail(fb)}
                                title={t('view')}
                              >
                                <EyeIcon />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Tab>

              <Tab eventKey="clients" title={renderAdminSidebarTabTitle('clients')}>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h5 className="admin-mobile-section-title mb-0">{t('clients')} ({customers.total || 0})</h5>
                  <Button variant="outline-secondary" className="btn-mobile-filter d-lg-none ms-auto" onClick={() => setShowMobileFiltersSheet(true)}>
                    <i className="bi bi-funnel"></i> Фильтр
                  </Button>
                  <div className="d-none d-lg-flex gap-2 flex-wrap">
                    <Form.Control
                      size="sm"
                      type="search"
                      style={{ width: 240 }}
                      placeholder="Поиск клиента"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setCustomerPage(1);
                      }}
                    />
                    <Form.Select
                      size="sm"
                      style={{ width: 170 }}
                      value={customerStatusFilter}
                      onChange={(e) => {
                        setCustomerStatusFilter(e.target.value);
                        setCustomerPage(1);
                      }}
                    >
                      <option value="">{t('allStatuses')}</option>
                      <option value="active">Активен</option>
                      <option value="blocked">Заблокирован</option>
                    </Form.Select>
                    <Form.Select
                      size="sm"
                      style={{ width: 120 }}
                      value={customerLimit}
                      onChange={(e) => {
                        setCustomerLimit(parseInt(e.target.value, 10));
                        setCustomerPage(1);
                      }}
                    >
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                    </Form.Select>
                  </div>
                </div>

                {customersLoading ? (
                  <TableSkeleton rows={8} columns={7} label="Загрузка клиентов" />
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table mb-0">
                        <thead>
                          <tr>
                            <th>{t('client')}</th>
                            <th>Telegram</th>
                            <th>{t('orders')}</th>
                            <th>{t('amount')}</th>
                            <th>{t('status')}</th>
                            <th>{t('date')}</th>
                            <th>{t('actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customers.customers || []).map((c) => {
                            const isBlocked = c.is_blocked || !c.user_is_active;
                            return (
                              <tr key={`admin-customer-${c.user_id}`}>
                                <td>
                                  <div className="fw-semibold">{c.full_name || c.username || `ID ${c.user_id}`}</div>
                                  <small className="text-muted">{renderCustomerPhoneLink(c.phone)}</small>
                                </td>
                                <td>
                                  {c.telegram_id ? (
                                    <Badge bg="info" className="bg-opacity-10 text-info border border-info-subtle">
                                      {c.telegram_id}
                                    </Badge>
                                  ) : '-'}
                                </td>
                                <td>
                                  <Badge bg={Number(c.orders_count) > 0 ? 'success' : 'secondary'} className="bg-opacity-10 border">
                                    {c.orders_count || 0}
                                  </Badge>
                                </td>
                                <td className="fw-semibold">{formatPrice(c.total_spent || 0)} {t('sum')}</td>
                                <td>
                                  {isBlocked ? (
                                    <Badge bg="warning" text="dark">Ограничен</Badge>
                                  ) : (
                                    <Badge bg="success">Активен</Badge>
                                  )}
                                </td>
                                <td>
                                  <small>{c.last_order_date ? new Date(c.last_order_date).toLocaleString('ru-RU') : '-'}</small>
                                </td>
                                <td>
                                  <Button
                                    className="action-btn bg-info bg-opacity-10 text-info border-0"
                                    size="sm"
                                    title="История заказов"
                                    onClick={() => openCustomerOrdersModal(c)}
                                  >
                                    <EyeIcon />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                          {(customers.customers || []).length === 0 && (
                            <tr>
                              <td colSpan="7" className="text-center py-4 text-muted">
                                Клиенты не найдены
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <AdminListPagination
                      current={customerPage}
                      total={customers.total || 0}
                      limit={customerLimit}
                      onPageChange={setCustomerPage}
                      onLimitChange={(value) => {
                        setCustomerLimit(value);
                        setCustomerPage(1);
                      }}
                    />
                  </>
                )}
              </Tab>

              <Tab eventKey="printers" title={renderAdminSidebarTabTitle('printers')}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">{language === 'uz' ? 'Printerlar boshqaruvi' : '🖨️ Управление принтерами'}</h5>
                </div>

                <Row className="g-3 mb-3">
                  <Col lg={6}>
                    <Card className="admin-printer-panel h-100">
                      <Card.Body className="p-3 p-xl-4">
                        <div className="admin-printer-panel-head">
                          <h6 className="mb-0">
                            {language === 'uz' ? 'Agentlar (tokenlar)' : 'Токены агентов'}
                          </h6>
                          <div className="d-flex gap-2">
                            <Button
                              type="button"
                              className="admin-printer-icon-btn"
                              title={language === 'uz' ? "Talablar Printerni yuklab olish" : 'Скачать Talablar Printer'}
                              aria-label={language === 'uz' ? "Talablar Printerni yuklab olish" : 'Скачать Talablar Printer'}
                              onClick={handleDownloadPrinterAgent}
                              disabled={downloadingPrinterAgent}
                            >
                              {downloadingPrinterAgent ? <Spinner animation="border" size="sm" /> : <Download size={16} />}
                            </Button>
                            <Button
                              type="button"
                              className="admin-printer-icon-btn admin-printer-icon-btn-primary"
                              title={language === 'uz' ? "Agent qo'shish" : 'Добавить агента'}
                              aria-label={language === 'uz' ? "Agent qo'shish" : 'Добавить агента'}
                              onClick={() => { setPrinterAgentName(''); setShowPrinterAgentModal(true); }}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                        </div>

                        <Alert className="admin-printer-note mb-3">
                          {language === 'uz'
                            ? "Agent — bu printerga ulangan kompyuter. Token orqali Talablar Printer dasturini ishga tushiradi."
                            : 'Агент — это компьютер оператора, к которому подключен принтер. Скопируйте токен и вставьте его в Talablar Printer на компьютере оператора.'}
                        </Alert>

                        {printerAgents.length === 0 ? (
                          <div className="text-muted text-center py-4">
                            {language === 'uz' ? 'Agentlar mavjud emas' : 'Нет зарегистрированных агентов'}
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <Table hover size="sm" className="mb-0">
                              <thead>
                                <tr>
                                  <th>{language === 'uz' ? 'Nomi' : 'Имя'}</th>
                                  <th>Token</th>
                                  <th>{language === 'uz' ? 'Holati' : 'Статус'}</th>
                                  <th>{language === 'uz' ? "Oxirgi ulanish" : 'Последнее соединение'}</th>
                                  <th className="text-end">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {printerAgents.map((agent) => (
                                  <tr key={`agent-${agent.id}`}>
                                    <td className="fw-semibold">{agent.name}</td>
                                    <td>
                                      <div className="d-flex align-items-center gap-2">
                                        <code className="small admin-printer-token-code">{agent.agent_token}</code>
                                        <Button
                                          type="button"
                                          className="admin-printer-icon-btn"
                                          title={language === 'uz' ? 'Token nusxalash' : 'Скопировать токен'}
                                          aria-label={language === 'uz' ? 'Token nusxalash' : 'Скопировать токен'}
                                          onClick={() => {
                                            navigator.clipboard.writeText(agent.agent_token);
                                            setAlertMessage({ type: 'success', text: language === 'uz' ? 'Token nusxalandi!' : 'Токен скопирован!' });
                                          }}
                                        >
                                          <Copy size={15} />
                                        </Button>
                                      </div>
                                    </td>
                                    <td>
                                      {agent.is_active
                                        ? <Badge bg="success">Online</Badge>
                                        : <Badge bg="secondary">Offline</Badge>}
                                    </td>
                                    <td className="small text-muted">
                                      {agent.last_connected_at
                                        ? new Date(agent.last_connected_at).toLocaleString('ru-RU')
                                        : '—'}
                                    </td>
                                    <td>
                                      <div className="d-flex justify-content-end">
                                        <Button
                                          type="button"
                                          className="admin-printer-icon-btn admin-printer-icon-btn-danger"
                                          title={language === 'uz' ? "Agentni o'chirish" : 'Удалить агента'}
                                          aria-label={language === 'uz' ? "Agentni o'chirish" : 'Удалить агента'}
                                          onClick={() => handleDeletePrinterAgent(agent.id)}
                                        >
                                          <Trash2 size={15} />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>

                  <Col lg={6}>
                    <Card className="admin-printer-panel h-100">
                      <Card.Body className="p-3 p-xl-4">
                        <div className="admin-printer-panel-head">
                          <h6 className="mb-0">
                            {language === 'uz' ? 'Printerlar' : 'Принтеры'}
                          </h6>
                          <div className="d-flex gap-2">
                            <Button
                              type="button"
                              className="admin-printer-icon-btn admin-printer-icon-btn-primary"
                              title={language === 'uz' ? "Printer qo'shish" : 'Добавить принтер'}
                              aria-label={language === 'uz' ? "Printer qo'shish" : 'Добавить принтер'}
                              onClick={() => {
                                setSelectedPrinter(null);
                                setPrinterForm({ name: '', printer_alias: '', connection_type: 'network', ip_address: '', usb_vid_pid: '' });
                                setShowPrinterModal(true);
                              }}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                        </div>

                        {loadingPrinters ? (
                          <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
                        ) : printers.length === 0 ? (
                          <div className="text-muted text-center py-4">
                            {language === 'uz' ? 'Printerlar mavjud emas' : 'Нет добавленных принтеров'}
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <Table hover size="sm" className="mb-0">
                              <thead>
                                <tr>
                                  <th>{language === 'uz' ? 'Nomi' : 'Название'}</th>
                                  <th>Alias</th>
                                  <th>{language === 'uz' ? "Ulanish turi" : 'Тип'}</th>
                                  <th>IP / USB</th>
                                  <th className="text-end">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {printers.map((printer) => {
                                  const isTesting = testingPrinterIds.includes(Number(printer.id));
                                  return (
                                    <tr key={`printer-${printer.id}`}>
                                      <td className="fw-semibold">{printer.name}</td>
                                      <td><code className="small">{printer.printer_alias}</code></td>
                                      <td>
                                        <Badge bg={printer.connection_type === 'network' ? 'primary' : 'warning'} className="text-uppercase" style={{ fontSize: '0.7rem' }}>
                                          {printer.connection_type === 'network' ? 'Network' : 'USB'}
                                        </Badge>
                                      </td>
                                      <td className="small text-muted">{printer.ip_address || printer.usb_vid_pid || '—'}</td>
                                      <td>
                                        <div className="d-flex justify-content-end gap-1">
                                          <Button
                                            type="button"
                                            className="admin-printer-icon-btn admin-printer-icon-btn-success"
                                            title={language === 'uz' ? 'Test chop etish' : 'Проверка принтера'}
                                            aria-label={language === 'uz' ? 'Test chop etish' : 'Проверка принтера'}
                                            onClick={() => handleTestPrinter(printer)}
                                            disabled={isTesting}
                                          >
                                            {isTesting ? <Spinner animation="border" size="sm" /> : <FlaskConical size={15} />}
                                          </Button>
                                          <Button
                                            type="button"
                                            className="admin-printer-icon-btn"
                                            title={language === 'uz' ? 'Printerni tahrirlash' : 'Редактировать принтер'}
                                            aria-label={language === 'uz' ? 'Printerni tahrirlash' : 'Редактировать принтер'}
                                            onClick={() => {
                                              setSelectedPrinter(printer);
                                              setPrinterForm({
                                                name: printer.name || '',
                                                printer_alias: printer.printer_alias || '',
                                                connection_type: printer.connection_type || 'network',
                                                ip_address: printer.ip_address || '',
                                                usb_vid_pid: printer.usb_vid_pid || ''
                                              });
                                              setShowPrinterModal(true);
                                            }}
                                          >
                                            <Pencil size={15} />
                                          </Button>
                                          <Button
                                            type="button"
                                            className="admin-printer-icon-btn admin-printer-icon-btn-danger"
                                            title={language === 'uz' ? "Printerni o'chirish" : 'Удалить принтер'}
                                            aria-label={language === 'uz' ? "Printerni o'chirish" : 'Удалить принтер'}
                                            onClick={() => handleDeletePrinter(printer.id)}
                                          >
                                            <Trash2 size={15} />
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
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Card className="admin-printer-panel">
                  <Card.Body className="p-3 p-xl-4">
                    <h6 className="mb-3">{language === 'uz' ? "Qanday ishlaydi?" : '📖 Как это работает?'}</h6>
                    <ol className="small text-muted mb-0">
                      <li className="mb-2">{language === 'uz' ? "«+» orqali agent qo‘shing. Tizim token yaratadi." : 'Через кнопку «+» добавьте агента. Система создаст уникальный Token.'}</li>
                      <li className="mb-2">{language === 'uz' ? "Talablar Printer dasturini yuklab oling va tokenni operator kompyuteriga kiriting." : 'Скачайте Talablar Printer и вставьте Token на компьютере оператора.'}</li>
                      <li className="mb-2">{language === 'uz' ? "Printerni qo‘shing va «Проверка принтера» tugmasi bilan test chekni chiqaring." : 'Добавьте принтер и нажмите «Проверка принтера» для тестового чека.'}</li>
                      <li>{language === 'uz' ? "Agent ulanganda auto-test chek (logo + muvaffaqiyat matni) chiqadi." : 'При подключении агента автоматически печатается тест-чек (лого + текст успешного подключения).'}</li>
                    </ol>
                  </Card.Body>
                </Card>

                {/* Printer Agent Modal */}
                <Modal show={showPrinterAgentModal} onHide={() => setShowPrinterAgentModal(false)} centered>
                  <Form onSubmit={handleCreatePrinterAgent}>
                    <Modal.Header closeButton>
                      <Modal.Title className="h6">{language === 'uz' ? "Yangi agent qo'shish" : 'Новый агент'}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                      <Form.Group>
                        <Form.Label>{language === 'uz' ? 'Agent nomi' : 'Название агента'}</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder={language === 'uz' ? "masalan: Kassa 1" : 'например: Касса 1'}
                          value={printerAgentName}
                          onChange={(e) => setPrinterAgentName(e.target.value)}
                          required
                        />
                        <Form.Text className="text-muted">
                          {language === 'uz' ? "Bu nom faqat sizning qulay farqlashingiz uchun." : 'Это имя для вашего удобства, чтобы различать компьютеры.'}
                        </Form.Text>
                      </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                      <Button variant="secondary" onClick={() => setShowPrinterAgentModal(false)}>{t('cancel')}</Button>
                      <Button type="submit" className="btn-primary-custom" disabled={!printerAgentName.trim()}>
                        {language === 'uz' ? "Yaratish" : 'Создать'}
                      </Button>
                    </Modal.Footer>
                  </Form>
                </Modal>

                {/* Printer Add/Edit Modal */}
                <Modal show={showPrinterModal} onHide={() => setShowPrinterModal(false)} centered>
                  <Form onSubmit={handleSavePrinter}>
                    <Modal.Header closeButton>
                      <Modal.Title className="h6">
                        {selectedPrinter
                          ? (language === 'uz' ? 'Printerni tahrirlash' : 'Редактировать принтер')
                          : (language === 'uz' ? "Yangi printer qo'shish" : 'Добавить принтер')}
                      </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                      <Form.Group className="mb-3">
                        <Form.Label>{language === 'uz' ? 'Nomi' : 'Название'} *</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder={language === 'uz' ? "masalan: Oshxona printeri" : 'например: Кухонный принтер'}
                          value={printerForm.name}
                          onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                          required
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Alias (роль) *</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="cashier / kitchen / bar"
                          value={printerForm.printer_alias}
                          onChange={(e) => setPrinterForm({ ...printerForm, printer_alias: e.target.value })}
                          required
                        />
                        <Form.Text className="text-muted">
                          {language === 'uz'
                            ? 'Kategoriya/chёklar qaysi printerga ketishi uchun (masalan: cashier).'
                            : 'Для маршрутизации позиций на принтер: обычно cashier, kitchen и т.д. Это не имя шары Windows.'}
                        </Form.Text>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>{language === 'uz' ? "Ulanish turi" : 'Тип подключения'}</Form.Label>
                        <Form.Select
                          value={printerForm.connection_type}
                          onChange={(e) => setPrinterForm({ ...printerForm, connection_type: e.target.value })}
                        >
                          <option value="network">{language === 'uz' ? 'Tarmoq (Network share)' : 'Сетевой (Network share)'}</option>
                          <option value="usb">{language === 'uz' ? 'USB' : 'USB'}</option>
                        </Form.Select>
                      </Form.Group>
                      {printerForm.connection_type === 'network' && (
                        <Form.Group className="mb-3">
                          <Form.Label>IP {language === 'uz' ? '(ixtiyoriy)' : '(необязательно)'}</Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="192.168.1.100"
                            value={printerForm.ip_address}
                            onChange={(e) => setPrinterForm({ ...printerForm, ip_address: e.target.value })}
                          />
                        </Form.Group>
                      )}
                      {printerForm.connection_type === 'usb' && (
                        <Form.Group className="mb-3">
                          <Form.Label>
                            {language === 'uz'
                              ? 'Windows Share nomi (ixtiyoriy)'
                              : 'Имя сетевого ресурса Windows (необязательно)'}
                          </Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="XP-80C"
                            value={printerForm.usb_vid_pid}
                            onChange={(e) => setPrinterForm({ ...printerForm, usb_vid_pid: e.target.value })}
                          />
                          <Form.Text className="text-muted">
                            {language === 'uz'
                              ? "Bo‘sh qoldirsangiz, server printer nomidan (qavssiz) oladi. \\localhost\\ nomi bilan mos kelishi kerak."
                              : 'Если пусто — сервер возьмёт из названия принтера (без скобок). Должно совпадать с «Имя ресурса» в Windows → Общий доступ.'}
                          </Form.Text>
                        </Form.Group>
                      )}
                    </Modal.Body>
                    <Modal.Footer>
                      <Button variant="secondary" onClick={() => setShowPrinterModal(false)}>{t('cancel')}</Button>
                      <Button type="submit" className="btn-primary-custom" disabled={!printerForm.name || !printerForm.printer_alias}>
                        {selectedPrinter ? t('save') : (language === 'uz' ? "Qo'shish" : 'Добавить')}
                      </Button>
                    </Modal.Footer>
                  </Form>
                </Modal>
              </Tab>

              <Tab eventKey="settings" title={renderAdminSidebarTabTitle('settings')}>
                <div className="px-4 pt-3 pb-0 border-bottom bg-white rounded-top-4">
                  <div className="admin-settings-pill-tabs" role="tablist" aria-label="Настройки магазина">
                    {[
                      { key: 'general', icon: '⚙️', label: language === 'uz' ? 'Umumiy' : 'Общие' },
                      { key: 'product_settings', icon: '📦', label: language === 'uz' ? 'Mahsulot sozlamalari' : 'Настройки товаров' },
                      { key: 'appearance', icon: '🎨', label: language === 'uz' ? "Dizayn va uslub" : 'Оформление и стиль' },
                      { key: 'category_images', icon: '🗂️', label: language === 'uz' ? 'Kategoriya rasmlari' : 'Фото категорий' },
                      { key: 'telegram', icon: '✈️', label: 'Telegram' },
                      { key: 'payments', icon: '💳', label: language === 'uz' ? "To'lov tizimlari" : 'Платежные системы' },
                      { key: 'delivery', icon: '🚚', label: language === 'uz' ? 'Yetkazib berish' : 'Доставка' },
                      { key: 'reports', icon: '📊', label: language === 'uz' ? 'Hisobotlar' : 'Отчёты' },
                      { key: 'operators', icon: '👨‍💻', label: language === 'uz' ? 'Operatorlar' : 'Операторы' }
                    ].map((tab) => {
                      const isActive = settingsTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`admin-settings-pill-btn ${isActive ? 'is-active' : ''}`}
                          onClick={() => setSettingsTab(tab.key)}
                        >
                          <span>{tab.icon} {tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 bg-light admin-settings-content" style={{ minHeight: '60vh' }}>
                  {restaurantSettings ? (
                    <>
                      {settingsTab === 'general' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <Row className="gy-4">
                              <Col md={12}>
                                <div className="admin-store-profile-group">
                                  <Row className="g-4 justify-content-center admin-store-profile-layout">
                                    <Col xxl={8} xl={9} lg={10} md={11} className="admin-store-profile-layout-side">
                                      <div className="admin-store-profile-side h-100">
                                        <Form.Group className="mb-4">
                                          <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Логотип магазина</Form.Label>
                                          <input
                                            ref={restaurantLogoInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="d-none"
                                            onChange={handleRestaurantLogoUpload}
                                          />
                                          <div className="admin-store-logo-slot">
                                            <button
                                              type="button"
                                              className="admin-store-logo-preview"
                                              onClick={() => restaurantLogoInputRef.current?.click()}
                                              disabled={uploadingRestaurantLogo}
                                              aria-label="Выбрать логотип магазина"
                                            >
                                              {restaurantSettings.logo_url ? (
                                                <img
                                                  src={toAbsoluteFileUrl(restaurantSettings.logo_url)}
                                                  alt="Логотип магазина"
                                                  className="admin-store-logo-image"
                                                />
                                              ) : (
                                                <div className="admin-store-logo-empty">
                                                  <i className="bi bi-image fs-3" aria-hidden="true" />
                                                  <span>{uploadingRestaurantLogo ? 'Загрузка...' : 'Выбрать логотип'}</span>
                                                </div>
                                              )}
                                            </button>
                                            <div className="admin-store-logo-overlay-actions">
                                              <button
                                                type="button"
                                                className="admin-store-logo-icon-btn"
                                                onClick={() => restaurantLogoInputRef.current?.click()}
                                                disabled={uploadingRestaurantLogo}
                                                aria-label="Выбрать логотип"
                                                title={uploadingRestaurantLogo ? 'Загрузка...' : 'Выбрать'}
                                              >
                                                <i className={`bi ${uploadingRestaurantLogo ? 'bi-hourglass-split' : 'bi-upload'}`} aria-hidden="true" />
                                              </button>
                                              <button
                                                type="button"
                                                className="admin-store-logo-icon-btn is-danger"
                                                onClick={() => setRestaurantSettings({ ...restaurantSettings, logo_url: '' })}
                                                disabled={!restaurantSettings.logo_url}
                                                aria-label="Удалить логотип"
                                                title="Удалить"
                                              >
                                                <i className="bi bi-trash" aria-hidden="true" />
                                              </button>
                                            </div>
                                            <div className="admin-store-logo-mode-block">
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Режим отображения логотипа</Form.Label>
                                              <Form.Select
                                                className="form-control-custom"
                                                value={restaurantSettings.logo_display_mode || 'square'}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, logo_display_mode: e.target.value })}
                                              >
                                                <option value="square">Квадратный</option>
                                                <option value="horizontal">Горизонтальный</option>
                                              </Form.Select>
                                            </div>
                                          </div>
                                          <Form.Text className="text-muted d-block mt-2">
                                            Система автоматически уменьшит логотип и впишет его в шапку без изменения высоты header.
                                          </Form.Text>
                                          <Form.Text className="text-muted d-block">
                                            Квадратный: рекомендуется `512x512 px` (PNG). Горизонтальный: `1200x400 px` (PNG, прозрачный фон).
                                          </Form.Text>
                                        </Form.Group>

                                        <div className="admin-general-qr-panel">
                                          <div className="admin-general-qr-head">
                                            <div className="small fw-bold text-muted text-uppercase">QR-код магазина</div>
                                            <div className="small text-muted">
                                              Быстрый доступ к QR-коду регистрации прямо во вкладке «Общие».
                                            </div>
                                          </div>
                                          <div className="admin-general-qr-preview">
                                            {loadingRegistrationQrPreview ? (
                                              <div className="admin-general-qr-placeholder">
                                                <Spinner animation="border" size="sm" />
                                                <span>Подготовка превью QR...</span>
                                              </div>
                                            ) : registrationQrPreviewMeta?.qr_url_full ? (
                                              <img
                                                src={registrationQrPreviewMeta.qr_url_full}
                                                alt="QR-код магазина"
                                                className="admin-general-qr-image"
                                              />
                                            ) : (
                                              <div className="admin-general-qr-placeholder">
                                                <i className="bi bi-qr-code" aria-hidden="true" />
                                                <span>{registrationQrPreviewError || 'Сохраните Bot Token для генерации QR'}</span>
                                              </div>
                                            )}
                                          </div>
                                          <Button
                                            variant="outline-primary"
                                            className="w-100"
                                            onClick={downloadRestaurantRegistrationQr}
                                            disabled={downloadingRegistrationQr || !String(restaurantSettings.telegram_bot_token || '').trim()}
                                          >
                                            {downloadingRegistrationQr ? '⌛ Подготовка QR...' : '⬇️ Скачать QR'}
                                          </Button>
                                        </div>

                                      </div>
                                    </Col>

                                    <Col xxl={8} xl={9} lg={10} md={11} className="admin-store-profile-layout-main">
                                      <div className="admin-store-profile-fields h-100">
                                        <Row className="gy-4">
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Название магазина</Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.name}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, name: e.target.value })}
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Телефон</Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.phone}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, phone: e.target.value })}
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Адрес</Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.address}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, address: e.target.value })}
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">
                                                {language === 'uz' ? "Do'kon faoliyat turi" : 'Вид деятельности магазина'}
                                              </Form.Label>
                                              <Form.Control
                                                type="text"
                                                readOnly
                                                className="form-control-custom admin-readonly-field"
                                                value={String(
                                                  restaurantSettings.activity_type_name
                                                  || (language === 'uz' ? 'Tanlanmagan' : 'Не выбран')
                                                )}
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Начало работы</Form.Label>
                                              <Form.Control
                                                type="time"
                                                className="form-control-custom"
                                                value={restaurantSettings.start_time || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, start_time: e.target.value })}
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Конец работы</Form.Label>
                                              <Form.Control
                                                type="time"
                                                className="form-control-custom"
                                                value={restaurantSettings.end_time || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, end_time: e.target.value })}
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">
                                                {language === 'uz' ? 'Do\'kon valyutasi' : 'Валюта магазина'}
                                              </Form.Label>
                                              <CountryCurrencyDropdown
                                                language={language}
                                                selectedOption={selectedRestaurantCurrencyOption}
                                                options={countryCurrencyOptions}
                                                readOnly={!canEditStoreCurrency}
                                                disabled={!canEditStoreCurrency}
                                                onChange={canEditStoreCurrency ? (code) => {
                                                  if (!canEditStoreCurrency) return;
                                                  setRestaurantSettings({ ...restaurantSettings, currency_code: code });
                                                  setCountryCurrency(code);
                                                } : undefined}
                                              />
                                              <Form.Text className="text-muted d-block mt-2">
                                                {canEditStoreCurrency
                                                  ? (language === 'uz'
                                                    ? 'Bu tanlov mijozlar uchun ham summalarda aks etadi.'
                                                    : 'Этот выбор также применяется к отображению сумм у клиентов.')
                                                  : (language === 'uz'
                                                    ? "Valyutani faqat superadmin o'zgartiradi."
                                                    : 'Валюту может менять только супер-админ.')}
                                              </Form.Text>
                                            </Form.Group>
                                          </Col>
                                          <Col md={12}>
                                            <div className="admin-store-safety-panel">
                                              <div className="fw-bold">Безопасный режим кнопок действий</div>
                                              <div className="small text-muted mb-3">
                                                Кнопки “Изменить/Удалить” скрыты по умолчанию. Включение работает 10 минут.
                                                {actionButtonsVisible ? ` Осталось: ${actionButtonsRemainingLabel}` : ''}
                                              </div>
                                              <Form.Check
                                                type="switch"
                                                id="admin-action-buttons-visibility-switch"
                                                className="fw-semibold mb-0"
                                                label={actionButtonsVisible ? 'Кнопки действий видимы' : 'Показать кнопки действий на 10 минут'}
                                                checked={actionButtonsVisible}
                                                onChange={(e) => setActionButtonsVisible(e.target.checked)}
                                              />
                                            </div>
                                          </Col>
                                        </Row>
                                      </div>
                                    </Col>
                                  </Row>
                                </div>
                              </Col>

                            </Row>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'appearance' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <div className="admin-appearance-layout">
                              <div className="admin-appearance-settings-column">
                                <div className="admin-settings-single-column admin-settings-single-column--appearance">
                              <div className="admin-settings-surface-block">
                                <Form.Group className="mb-0">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Стиль интерфейса магазина</Form.Label>
                                  <div className="admin-theme-slots" role="radiogroup" aria-label="Стиль интерфейса магазина">
                                    {UI_THEME_OPTIONS.map((themeOption) => {
                                      const isActive = normalizeUiTheme(restaurantSettings.ui_theme, 'classic') === themeOption.value;
                                      return (
                                        <button
                                          key={themeOption.value}
                                          type="button"
                                          role="radio"
                                          aria-checked={isActive}
                                          className={`admin-theme-slot${isActive ? ' is-active' : ''}`}
                                          onClick={() => setRestaurantSettings({ ...restaurantSettings, ui_theme: themeOption.value })}
                                        >
                                          <span
                                            className="admin-theme-slot-preview"
                                            style={{
                                              '--theme-slot-c1': themeOption.preview[0],
                                              '--theme-slot-c2': themeOption.preview[1],
                                              '--theme-slot-c3': themeOption.preview[2]
                                            }}
                                          />
                                          <span className="admin-theme-slot-title">{themeOption.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <Form.Text className="text-muted d-block mt-2">
                                    Выбранный стиль применяется к вашей админке и клиентской части этого магазина.
                                  </Form.Text>
                                </Form.Group>
                              </div>

                              <div className="admin-settings-surface-block">
                                <Form.Group className="mb-0">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Шрифт системы</Form.Label>
                                  <div className="admin-font-slots" role="radiogroup" aria-label="Шрифт системы">
                                    {UI_FONT_FAMILY_OPTIONS.map((fontOption) => {
                                      const isActive = normalizeUiFontFamily(restaurantSettings.ui_font_family, 'sans') === fontOption.value;
                                      return (
                                        <button
                                          key={fontOption.value}
                                          type="button"
                                          role="radio"
                                          aria-checked={isActive}
                                          className={`admin-font-slot${isActive ? ' is-active' : ''}`}
                                          onClick={() => setRestaurantSettings({ ...restaurantSettings, ui_font_family: fontOption.value })}
                                          style={{
                                            fontFamily: UI_FONT_FAMILY_PREVIEW_STYLES[fontOption.value] || UI_FONT_FAMILY_PREVIEW_STYLES.sans
                                          }}
                                        >
                                          <span className="admin-font-slot-top">
                                            <span className="admin-font-slot-name">{fontOption.label}</span>
                                            <span className="admin-font-slot-group">{fontOption.group}</span>
                                          </span>
                                          <span className="admin-font-slot-sample">{fontOption.sample}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <Form.Text className="text-muted d-block mt-2">
                                    Выбранный шрифт применяется к админке и витрине этого магазина.
                                  </Form.Text>
                                </Form.Group>
                              </div>

                              <div className="admin-settings-surface-block">
                                <Form.Group className="mb-0">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Режим отображения каталога</Form.Label>
                                  <div className="admin-menu-mode-preview-grid">
                                    <button
                                      type="button"
                                      className={`admin-menu-mode-preview-card ${normalizeMenuViewMode(restaurantSettings.menu_view_mode, 'grid_categories') === 'grid_categories' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({ ...restaurantSettings, menu_view_mode: 'grid_categories' })}
                                    >
                                      <span className="admin-menu-mode-preview-visual admin-preview-shell admin-preview-shell-catalog">
                                        <span className="admin-preview-header-line" />
                                        <span className="admin-preview-category-grid-live">
                                          <span className="admin-preview-category-live-item">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhoto}
                                              alt="Категория 1"
                                              className="admin-preview-category-live-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-category-live-name">Хлеб пшеничный</span>
                                          </span>
                                          <span className="admin-preview-category-live-item">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhotoAlt}
                                              alt="Категория 2"
                                              className="admin-preview-category-live-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-category-live-name">Хлеб ржаной</span>
                                          </span>
                                        </span>
                                      </span>
                                      <span className="admin-menu-mode-preview-title">Каталог</span>
                                      <span className="admin-menu-mode-preview-desc">Категории плиткой, затем товары</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`admin-menu-mode-preview-card ${normalizeMenuViewMode(restaurantSettings.menu_view_mode, 'grid_categories') === 'single_list' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({ ...restaurantSettings, menu_view_mode: 'single_list' })}
                                    >
                                      <span className="admin-menu-mode-preview-visual admin-preview-shell admin-preview-shell-card-mode">
                                        <span className="admin-preview-header-line" />
                                        <span className="admin-preview-card-grid-live admin-preview-card-grid-live-wide">
                                          <span className="admin-preview-live-card admin-preview-live-card-wide">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.productPhoto}
                                              alt="Товар 1"
                                              className="admin-preview-live-card-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-live-overlay-heart">♡</span>
                                            <span className="admin-preview-live-overlay-plus">+</span>
                                            <span className="admin-preview-live-card-body">
                                              <span className="admin-preview-live-card-name">Хлеб «Фермерский»</span>
                                              <span className="admin-preview-live-card-unit">шт</span>
                                              <span className="admin-preview-live-card-price">12 000 сум</span>
                                            </span>
                                          </span>
                                          <span className="admin-preview-live-card admin-preview-live-card-wide">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhotoAlt}
                                              alt="Товар 2"
                                              className="admin-preview-live-card-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-live-overlay-heart">♡</span>
                                            <span className="admin-preview-live-overlay-plus">+</span>
                                            <span className="admin-preview-live-card-body">
                                              <span className="admin-preview-live-card-name">Батон нарезной</span>
                                              <span className="admin-preview-live-card-unit">шт</span>
                                              <span className="admin-preview-live-card-price">10 000 сум</span>
                                            </span>
                                          </span>
                                        </span>
                                      </span>
                                      <span className="admin-menu-mode-preview-title">Карточный режим</span>
                                      <span className="admin-menu-mode-preview-desc">Все товары по категориям на одном экране</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`admin-menu-mode-preview-card ${normalizeMenuViewMode(restaurantSettings.menu_view_mode, 'grid_categories') === 'nested_categories' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({ ...restaurantSettings, menu_view_mode: 'nested_categories' })}
                                    >
                                      <span className="admin-menu-mode-preview-visual admin-preview-shell admin-preview-shell-catalog">
                                        <span className="admin-preview-header-line" />
                                        <span className="admin-preview-category-grid-live">
                                          <span className="admin-preview-category-live-item">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhoto}
                                              alt="Категория A"
                                              className="admin-preview-category-live-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-category-live-name">Напитки</span>
                                          </span>
                                          <span className="admin-preview-category-live-item">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhotoAlt}
                                              alt="Категория B"
                                              className="admin-preview-category-live-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-category-live-name">Соки</span>
                                          </span>
                                        </span>
                                      </span>
                                      <span className="admin-menu-mode-preview-title">Папки категорий</span>
                                      <span className="admin-menu-mode-preview-desc">Категория → Категория → Категория → товары</span>
                                    </button>
                                  </div>
                                  <Form.Text className="text-muted d-block mt-2">
                                    Выберите один режим отображения без выпадающего списка.
                                  </Form.Text>
                                </Form.Group>
                              </div>

                              <div className="admin-settings-surface-block">
                                <Form.Group className="mb-0">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Режим карточек товара</Form.Label>
                                  <div className="admin-menu-mode-preview-grid">
                                    <button
                                      type="button"
                                      className={`admin-menu-mode-preview-card ${normalizeCatalogCardMode(restaurantSettings.catalog_card_mode, 'wide') === 'wide' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({ ...restaurantSettings, catalog_card_mode: 'wide' })}
                                    >
                                      <span className="admin-menu-mode-preview-visual admin-preview-shell">
                                        <span className="admin-preview-header-line" />
                                        <span className="admin-preview-card-grid-live admin-preview-card-grid-live-wide">
                                          <span className="admin-preview-live-card admin-preview-live-card-wide">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhoto}
                                              alt="Wide 1"
                                              className="admin-preview-live-card-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-live-overlay-heart">♡</span>
                                            <span className="admin-preview-live-overlay-plus">+</span>
                                            <span className="admin-preview-live-card-body">
                                              <span className="admin-preview-live-card-name">Хлеб «Фермерский»</span>
                                              <span className="admin-preview-live-card-unit">шт</span>
                                              <span className="admin-preview-live-card-price">12 000 сум</span>
                                            </span>
                                          </span>
                                          <span className="admin-preview-live-card admin-preview-live-card-wide">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhotoAlt}
                                              alt="Wide 2"
                                              className="admin-preview-live-card-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-live-overlay-heart">♡</span>
                                            <span className="admin-preview-live-overlay-plus">+</span>
                                            <span className="admin-preview-live-card-body">
                                              <span className="admin-preview-live-card-name">Батон нарезной</span>
                                              <span className="admin-preview-live-card-unit">шт</span>
                                              <span className="admin-preview-live-card-price">10 000 сум</span>
                                            </span>
                                          </span>
                                        </span>
                                      </span>
                                      <span className="admin-menu-mode-preview-title">Широкий</span>
                                      <span className="admin-menu-mode-preview-desc">Картинка 4:3, компактная карточка</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`admin-menu-mode-preview-card ${normalizeCatalogCardMode(restaurantSettings.catalog_card_mode, 'wide') === 'portrait' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({ ...restaurantSettings, catalog_card_mode: 'portrait' })}
                                    >
                                      <span className="admin-menu-mode-preview-visual admin-preview-shell">
                                        <span className="admin-preview-header-line" />
                                        <span className="admin-preview-card-grid-live admin-preview-card-grid-live-portrait">
                                          <span className="admin-preview-live-card admin-preview-live-card-portrait">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.categoryPhoto}
                                              alt="Portrait 1"
                                              className="admin-preview-live-card-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-live-overlay-heart">♡</span>
                                            <span className="admin-preview-live-overlay-plus">+</span>
                                            <span className="admin-preview-live-card-body">
                                              <span className="admin-preview-live-card-name">Хлеб «Фермерский»</span>
                                              <span className="admin-preview-live-card-unit">шт</span>
                                              <span className="admin-preview-live-card-price">12 000 сум</span>
                                            </span>
                                          </span>
                                          <span className="admin-preview-live-card admin-preview-live-card-portrait">
                                            <img
                                              src={MENU_MODE_PREVIEW_MEDIA.productPhoto}
                                              alt="Portrait 2"
                                              className="admin-preview-live-card-image"
                                              loading="lazy"
                                            />
                                            <span className="admin-preview-live-overlay-heart">♡</span>
                                            <span className="admin-preview-live-overlay-plus">+</span>
                                            <span className="admin-preview-live-card-body">
                                              <span className="admin-preview-live-card-name">Бородинский хлеб</span>
                                              <span className="admin-preview-live-card-unit">шт</span>
                                              <span className="admin-preview-live-card-price">14 000 сум</span>
                                            </span>
                                          </span>
                                        </span>
                                      </span>
                                      <span className="admin-menu-mode-preview-title">Книжный</span>
                                      <span className="admin-menu-mode-preview-desc">Картинка 3:4, акцент на фото</span>
                                    </button>
                                  </div>
                                  <Form.Text className="text-muted d-block mt-2">
                                    Влияет на карточки товаров в меню и в витрине клиента.
                                  </Form.Text>
                                </Form.Group>
                              </div>

                              <div className="admin-settings-surface-block">
                                <Form.Group className="mb-0">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Стиль меню</Form.Label>
                                  <div className="d-flex flex-column gap-3">
                                    <Form.Check
                                      type="switch"
                                      id="menu-liquid-glass-switch"
                                      className="fw-semibold"
                                      label={language === 'uz' ? 'Liquid Glass menyu shaffofligi' : 'Liquid Glass прозрачность меню'}
                                      checked={restaurantSettings.menu_liquid_glass_enabled === true}
                                      onChange={(e) => setRestaurantSettings({
                                        ...restaurantSettings,
                                        menu_liquid_glass_enabled: e.target.checked
                                      })}
                                    />
                                    <Form.Check
                                      type="switch"
                                      id="menu-height-lock-switch"
                                      className="fw-semibold"
                                      label={language === 'uz' ? "Menyu balandligini fiksatsiya qilish" : 'Фиксировать высоту меню при прокрутке'}
                                      checked={restaurantSettings.menu_height_lock_enabled === true}
                                      onChange={(e) => setRestaurantSettings({
                                        ...restaurantSettings,
                                        menu_height_lock_enabled: e.target.checked
                                      })}
                                    />
                                    <div className="admin-menu-glass-preview">
                                      <div className="admin-menu-glass-preview-phone">
                                        <div className="admin-menu-glass-preview-screen">
                                          <div className="admin-menu-glass-preview-cards">
                                            <span className="admin-menu-glass-preview-card" />
                                            <span className="admin-menu-glass-preview-card" />
                                            <span className="admin-menu-glass-preview-card" />
                                          </div>
                                          <div
                                            className="admin-menu-glass-preview-nav"
                                            style={{
                                              background: restaurantSettings.menu_liquid_glass_enabled === true
                                                ? `rgba(255,255,255,${(normalizeMenuGlassOpacity(
                                                  restaurantSettings.menu_liquid_glass_opacity,
                                                  MENU_GLASS_OPACITY_DEFAULT
                                                ) / 100).toFixed(2)})`
                                                : '#ffffff',
                                              backdropFilter: restaurantSettings.menu_liquid_glass_enabled === true
                                                ? `blur(${normalizeMenuGlassBlur(
                                                  restaurantSettings.menu_liquid_glass_blur,
                                                  MENU_GLASS_BLUR_DEFAULT
                                                )}px)`
                                                : 'none',
                                              WebkitBackdropFilter: restaurantSettings.menu_liquid_glass_enabled === true
                                                ? `blur(${normalizeMenuGlassBlur(
                                                  restaurantSettings.menu_liquid_glass_blur,
                                                  MENU_GLASS_BLUR_DEFAULT
                                                )}px)`
                                                : 'none'
                                            }}
                                          >
                                            <span className="admin-menu-glass-preview-item is-active">Vitrina</span>
                                            <span className="admin-menu-glass-preview-item">Menyu</span>
                                            <span className="admin-menu-glass-preview-item">Savat</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="admin-menu-glass-preview-meta">
                                        <span>
                                          {language === 'uz' ? 'Shaffoflik' : 'Прозрачность'}:{' '}
                                          {normalizeMenuGlassOpacity(
                                            restaurantSettings.menu_liquid_glass_opacity,
                                            MENU_GLASS_OPACITY_DEFAULT
                                          )}%
                                        </span>
                                        <span>
                                          Blur:{' '}
                                          {normalizeMenuGlassBlur(
                                            restaurantSettings.menu_liquid_glass_blur,
                                            MENU_GLASS_BLUR_DEFAULT
                                          )}px
                                        </span>
                                      </div>
                                    </div>
                                    <Row className="g-2">
                                      <Col md={6}>
                                        <Form.Group>
                                          <Form.Label className="small fw-semibold mb-1 d-flex justify-content-between align-items-center">
                                            {language === 'uz' ? 'Shaffoflik foizi' : 'Прозрачность (%)'}
                                            <span className="text-muted">
                                              {normalizeMenuGlassOpacity(
                                                restaurantSettings.menu_liquid_glass_opacity,
                                                MENU_GLASS_OPACITY_DEFAULT
                                              )}%
                                            </span>
                                          </Form.Label>
                                          <Form.Range
                                            value={normalizeMenuGlassOpacity(
                                              restaurantSettings.menu_liquid_glass_opacity,
                                              MENU_GLASS_OPACITY_DEFAULT
                                            )}
                                            min={20}
                                            max={60}
                                            step={1}
                                            disabled={restaurantSettings.menu_liquid_glass_enabled !== true}
                                            onChange={(e) => setRestaurantSettings({
                                              ...restaurantSettings,
                                              menu_liquid_glass_opacity: normalizeMenuGlassOpacity(
                                                e.target.value,
                                                restaurantSettings.menu_liquid_glass_opacity
                                              )
                                            })}
                                          />
                                        </Form.Group>
                                      </Col>
                                      <Col md={6}>
                                        <Form.Group>
                                          <Form.Label className="small fw-semibold mb-1 d-flex justify-content-between align-items-center">
                                            {language === 'uz' ? 'Xiralashtirish (blur)' : 'Сила blur (px)'}
                                            <span className="text-muted">
                                              {normalizeMenuGlassBlur(
                                                restaurantSettings.menu_liquid_glass_blur,
                                                MENU_GLASS_BLUR_DEFAULT
                                              )}px
                                            </span>
                                          </Form.Label>
                                          <Form.Range
                                            value={normalizeMenuGlassBlur(
                                              restaurantSettings.menu_liquid_glass_blur,
                                              MENU_GLASS_BLUR_DEFAULT
                                            )}
                                            min={8}
                                            max={24}
                                            step={1}
                                            disabled={restaurantSettings.menu_liquid_glass_enabled !== true}
                                            onChange={(e) => setRestaurantSettings({
                                              ...restaurantSettings,
                                              menu_liquid_glass_blur: normalizeMenuGlassBlur(
                                                e.target.value,
                                                restaurantSettings.menu_liquid_glass_blur
                                              )
                                            })}
                                          />
                                        </Form.Group>
                                      </Col>
                                    </Row>
                                  </div>
                                  <Form.Text className="text-muted d-block mt-2">
                                    При включении Liquid Glass нижнее меню и круг избранного становятся полупрозрачными. Отдельно можно выбрать уровень прозрачности и blur.
                                  </Form.Text>
                                </Form.Group>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-top text-end admin-appearance-actions">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                                </div>

                              <aside className="admin-appearance-preview-column">
                                <div className="admin-appearance-live-preview-sticky">
                                  <div className="admin-appearance-live-preview-card" style={appearancePreviewRootStyle}>
                                    <div className="admin-appearance-live-preview-device">
                                      <div className="admin-appearance-live-preview-viewport">
                                        <div className="admin-appearance-live-preview-header">
                                          <div className="admin-appearance-live-preview-topbar">
                                            <span className="admin-appearance-live-preview-brand">{restaurantSettings?.name || user?.active_restaurant_name || 'Store'}</span>
                                            <span className="admin-appearance-live-preview-top-icons">
                                              <UserIcon size={15} />
                                              <SearchIcon size={15} />
                                            </span>
                                          </div>
                                          <div className="admin-appearance-live-preview-logo-wrap">
                                            {activeRestaurantLogoUrl ? (
                                              <img
                                                src={activeRestaurantLogoUrl}
                                                alt="Логотип магазина"
                                                className={`admin-appearance-live-preview-logo ${activeRestaurantLogoDisplayMode === 'horizontal' ? 'is-horizontal' : ''}`}
                                                loading="lazy"
                                              />
                                            ) : (
                                              <span className="admin-appearance-live-preview-logo-fallback">
                                                {(restaurantSettings?.name || 'S').slice(0, 1).toUpperCase()}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="admin-appearance-live-preview-content">
                                          {appearancePreviewOpenedProduct ? (
                                            <div className="admin-appearance-live-product-detail">
                                              <button
                                                type="button"
                                                className="admin-appearance-live-detail-back"
                                                onClick={() => setAppearancePreviewOpenedProductId(null)}
                                              >
                                                ← {language === 'uz' ? 'Orqaga' : 'Назад'}
                                              </button>
                                              <div className="admin-appearance-live-detail-image-wrap">
                                                <img src={appearancePreviewOpenedProduct.image} alt={appearancePreviewOpenedProduct.title} loading="lazy" />
                                              </div>
                                              <div className="admin-appearance-live-detail-title">{appearancePreviewOpenedProduct.title}</div>
                                              <div className="admin-appearance-live-detail-price">{appearancePreviewOpenedProduct.priceLabel}</div>
                                              <div className="admin-appearance-live-detail-meta">{language === 'uz' ? "Mavjud: 12 ta" : 'В наличии: 12 шт'}</div>
                                              <button type="button" className="admin-appearance-live-detail-cta">
                                                {language === 'uz' ? "Savatga qo'shish" : 'В корзину'}
                                              </button>
                                            </div>
                                          ) : (
                                            <>
                                              {(appearancePreviewActiveTab === 'showcase' || appearancePreviewActiveTab === 'catalog') && (appearancePreviewMenuMode === 'grid_categories' || appearancePreviewMenuMode === 'nested_categories') && (
                                                <>
                                                  <div className="admin-appearance-live-section-title">
                                                    {appearancePreviewPrimaryCategory?.title || (language === 'uz' ? 'Kategoriyalar' : 'Категории')}
                                                  </div>
                                                  <div className="admin-appearance-live-category-grid">
                                                    {appearancePreviewCategories.slice(0, 6).map((categoryItem) => (
                                                      <button
                                                        key={`appearance-preview-category-${categoryItem.id}`}
                                                        type="button"
                                                        className={`admin-appearance-live-category-card${Number(appearancePreviewSelectedCategoryId) === Number(categoryItem.id) ? ' is-active' : ''}`}
                                                        onClick={() => {
                                                          setAppearancePreviewSelectedCategoryId(categoryItem.id);
                                                          setAppearancePreviewOpenedProductId(null);
                                                        }}
                                                      >
                                                        <img src={categoryItem.image} alt={categoryItem.title} loading="lazy" />
                                                        <span>{categoryItem.title}</span>
                                                      </button>
                                                    ))}
                                                  </div>
                                                </>
                                              )}

                                              {appearancePreviewActiveTab === 'reservations' ? (
                                                <div className="admin-appearance-live-empty-state">
                                                  {language === 'uz'
                                                    ? 'Bronlash oynasi shu yerda ko‘rinadi'
                                                    : 'Окно бронирования отображается здесь'}
                                                </div>
                                              ) : appearancePreviewActiveTab === 'cart' ? (
                                                <div className="admin-appearance-live-cart-list">
                                                  <div className="admin-appearance-live-section-title">
                                                    {language === 'uz' ? 'Savat' : 'Корзина'}
                                                  </div>
                                                  {appearancePreviewCartProducts.map((productItem) => (
                                                    <button
                                                      key={`appearance-preview-cart-${productItem.id}`}
                                                      type="button"
                                                      className="admin-appearance-live-cart-item"
                                                      onClick={() => setAppearancePreviewOpenedProductId(productItem.id)}
                                                    >
                                                      <img src={productItem.image} alt={productItem.title} loading="lazy" />
                                                      <span className="admin-appearance-live-cart-item-title">{productItem.title}</span>
                                                      <span className="admin-appearance-live-cart-item-price">{productItem.priceLabel}</span>
                                                    </button>
                                                  ))}
                                                  <button type="button" className="admin-appearance-live-detail-cta">
                                                    {language === 'uz' ? 'Buyurtma berish' : 'Оформить заказ'}
                                                  </button>
                                                </div>
                                              ) : (
                                                <>
                                                  <div className="admin-appearance-live-section-title">
                                                    {appearancePreviewActiveTab === 'favorites'
                                                      ? (language === 'uz' ? 'Saralanganlar' : 'Избранные')
                                                      : (appearancePreviewMenuMode === 'grid_categories' || appearancePreviewMenuMode === 'nested_categories')
                                                        ? (language === 'uz' ? 'Mahsulotlar' : 'Товары')
                                                        : (language === 'uz' ? 'Barcha mahsulotlar' : 'Все товары')}
                                                  </div>
                                                  <div
                                                    className={`admin-appearance-live-products ${appearancePreviewCardMode === 'portrait' ? 'is-portrait' : 'is-wide'}`}
                                                  >
                                                    {(appearancePreviewActiveTab === 'favorites'
                                                      ? appearancePreviewFavoriteProducts
                                                      : appearancePreviewVisibleProducts
                                                    ).slice(0, 8).map((productItem) => (
                                                      <button
                                                        type="button"
                                                        key={`appearance-preview-product-${productItem.id}`}
                                                        className="admin-appearance-live-product-card"
                                                        onClick={() => setAppearancePreviewOpenedProductId(productItem.id)}
                                                      >
                                                        <div className="admin-appearance-live-product-image-wrap">
                                                          <img
                                                            src={productItem.image}
                                                            alt={productItem.title}
                                                            loading="lazy"
                                                            className={productItem.isLogoFallback ? 'is-logo-fallback' : ''}
                                                          />
                                                          <span className="admin-appearance-live-product-heart">♡</span>
                                                          <span className="admin-appearance-live-product-plus">+</span>
                                                        </div>
                                                        <div className="admin-appearance-live-product-body">
                                                          <span className="admin-appearance-live-product-name">{productItem.title}</span>
                                                          <span className="admin-appearance-live-product-unit">{productItem.unit}</span>
                                                          <span className="admin-appearance-live-product-price">{productItem.priceLabel}</span>
                                                        </div>
                                                      </button>
                                                    ))}
                                                  </div>
                                                </>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <div
                                        className="admin-appearance-live-preview-nav"
                                        style={{
                                          '--appearance-preview-nav-count': String(Math.max(4, appearancePreviewNavItems.length)),
                                          background: restaurantSettings.menu_liquid_glass_enabled === true
                                            ? `rgba(255,255,255,${(appearancePreviewGlassOpacity / 100).toFixed(2)})`
                                            : '#ffffff',
                                          backdropFilter: restaurantSettings.menu_liquid_glass_enabled === true
                                            ? `blur(${appearancePreviewGlassBlur}px)`
                                            : 'none',
                                          WebkitBackdropFilter: restaurantSettings.menu_liquid_glass_enabled === true
                                            ? `blur(${appearancePreviewGlassBlur}px)`
                                            : 'none'
                                        }}
                                      >
                                        {appearancePreviewNavItems.map((item) => (
                                          <button
                                            key={`appearance-preview-nav-${item.key}`}
                                            type="button"
                                            className={`admin-appearance-live-preview-nav-item${appearancePreviewActiveTab === item.key ? ' is-active' : ''}`}
                                            onClick={() => {
                                              setAppearancePreviewActiveTab(item.key);
                                              setAppearancePreviewOpenedProductId(null);
                                            }}
                                          >
                                            <span className="admin-appearance-live-preview-nav-icon" aria-hidden="true">
                                              {isImageIconValue(item.icon) ? (
                                                <img
                                                  src={toAbsoluteFileUrl(item.icon)}
                                                  alt=""
                                                  className="admin-appearance-live-preview-nav-icon-image"
                                                  loading="lazy"
                                                />
                                              ) : (
                                                item.icon
                                              )}
                                            </span>
                                            <span className="admin-appearance-live-preview-nav-label">{item.label}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </aside>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'category_images' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <input
                              ref={categoryImageFileInputRef}
                              type="file"
                              accept="image/*"
                              className="d-none"
                              onChange={handleCategoryImageFileChange}
                            />
                            <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
                              <div>
                                <h5 className="fw-bold mb-1 admin-mobile-section-title">
                                  {language === 'uz' ? 'Do‘kon kategoriya rasmlari' : 'Фото категорий магазина'}
                                </h5>
                                <div className="text-muted small">
                                  {language === 'uz'
                                    ? 'Bu yerda faqat sizning do‘konda ishlatilgan kategoriyalar ko‘rsatiladi. Nomi va ierarxiya o‘zgarmaydi.'
                                    : 'Здесь показываются только категории, которые реально используются в вашем магазине. Названия и иерархия менять нельзя.'}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                onClick={loadCategoryImageCategories}
                                disabled={loadingCategoryImageCategories}
                              >
                                {loadingCategoryImageCategories ? 'Обновление...' : 'Обновить список'}
                              </Button>
                            </div>

                            {loadingCategoryImageCategories ? (
                              <ListSkeleton count={4} label="Загрузка категорий магазина" />
                            ) : (
                              <div className="admin-category-images-layout">
                                <div
                                  className="superadmin-categories-grid admin-category-images-grid"
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                    gap: '12px',
                                    width: '100%'
                                  }}
                                >
                                  {[0, 1, 2].map((levelIndex) => {
                                    const selectedLevels = [
                                      selectedCategoryImageLevel1,
                                      selectedCategoryImageLevel2,
                                      selectedCategoryImageLevel3
                                    ];
                                    const parentCategory = levelIndex === 0 ? null : selectedLevels[levelIndex - 1];
                                    const isVisible = levelIndex === 0 || parentCategory !== null;
                                    const levelCategories = (
                                      levelIndex === 0
                                        ? categoryImageLevel1List
                                        : levelIndex === 1
                                          ? categoryImageLevel2List
                                          : categoryImageLevel3List
                                    );
                                    const selectedCategory = selectedLevels[levelIndex];

                                    return (
                                      <Card
                                        key={`admin-category-images-level-${levelIndex}`}
                                        className={`admin-card admin-section-panel category-level-card ${!isVisible ? 'opacity-50' : ''}`}
                                        style={{ minWidth: 0, width: '100%', background: isVisible ? '#fff' : '#f8fafc' }}
                                      >
                                        <Card.Header className="admin-card-header admin-section-panel-header d-flex justify-content-between align-items-center py-3">
                                          <div className="fw-bold text-dark small text-uppercase letter-spacing-1 mb-0">
                                            {levelIndex === 0
                                              ? (language === 'uz' ? 'Asosiy daraja' : 'Главный уровень')
                                              : `${language === 'uz' ? 'Daraja' : 'Уровень'} ${levelIndex + 1}`}
                                          </div>
                                        </Card.Header>
                                        <Card.Body className="p-0 custom-scrollbar category-level-card-body" style={{ overflowY: 'auto' }}>
                                          {!isVisible ? (
                                            <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                                              <span style={{ fontSize: '2rem' }}>👈</span>
                                              <div className="mt-2 text-center small px-3">
                                                {language === 'uz'
                                                  ? 'Oldingi darajadan kategoriya tanlang'
                                                  : 'Выберите категорию на предыдущем уровне'}
                                              </div>
                                            </div>
                                          ) : levelCategories.length === 0 ? (
                                            <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                                              <div className="mb-2 opacity-25" style={{ fontSize: '2rem' }}>📁</div>
                                              <small className="fw-medium">
                                                {language === 'uz' ? 'Bo‘sh' : 'Пусто'}
                                              </small>
                                            </div>
                                          ) : (
                                            <div className="list-group list-group-flush category-level-list">
                                              {levelCategories.map((category) => {
                                                const effectiveImageUrl = toAbsoluteFileUrl(
                                                  category?.effective_image_url
                                                    || category?.custom_image_url
                                                    || category?.system_image_url
                                                    || category?.image_url
                                                    || ''
                                                );
                                                return (
                                                  <button
                                                    key={`admin-category-images-item-${category.id}`}
                                                    type="button"
                                                    className={`list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between py-2 px-3 category-list-item ${normalizeId(selectedCategory?.id) === normalizeId(category?.id) ? 'is-active' : ''}`}
                                                    onClick={() => selectCategoryImageLevel(levelIndex, category)}
                                                  >
                                                    <span className="d-flex align-items-center gap-2 overflow-hidden">
                                                      {effectiveImageUrl ? (
                                                        <img
                                                          src={effectiveImageUrl}
                                                          alt=""
                                                          style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 6 }}
                                                        />
                                                      ) : activeRestaurantLogoUrl ? (
                                                        <img
                                                          src={activeRestaurantLogoUrl}
                                                          alt=""
                                                          style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 6, opacity: 0.8, background: '#f8fafc' }}
                                                        />
                                                      ) : (
                                                        <div className="bg-light d-flex align-items-center justify-content-center" style={{ width: 24, height: 24, borderRadius: 6 }}>
                                                          <i className="bi bi-image text-muted" style={{ fontSize: 11 }} />
                                                        </div>
                                                      )}
                                                      <span className="text-muted me-1 small">
                                                        [{category?.sort_order === null || category?.sort_order === undefined ? '-' : category.sort_order}]
                                                      </span>
                                                      <span className="text-truncate small fw-medium">{getLocalizedCategoryTitle(category)}</span>
                                                    </span>
                                                    <span className="small text-muted flex-shrink-0 ms-2">
                                                      {category?.use_custom_image
                                                        ? (category?.custom_image_url ? 'Свое' : 'Лого')
                                                        : 'Сист.'}
                                                    </span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </Card.Body>
                                      </Card>
                                    );
                                  })}
                                </div>

                                <Card className="admin-category-image-editor-card border-0 rounded-4 mt-3">
                                  <Card.Body>
                                    {selectedCategoryImageCategory ? (
                                      <div className="d-flex flex-column gap-3">
                                        <div>
                                          <div className="small fw-bold text-muted text-uppercase mb-2">
                                            {language === 'uz' ? 'Tanlangan kategoriya' : 'Выбранная категория'}
                                          </div>
                                          <div className="d-flex align-items-center gap-3">
                                            <div className="admin-category-image-preview-box">
                                              {toAbsoluteFileUrl(
                                                selectedCategoryImageCategory?.effective_image_url
                                                  || selectedCategoryImageCategory?.custom_image_url
                                                  || selectedCategoryImageCategory?.system_image_url
                                                  || selectedCategoryImageCategory?.image_url
                                                  || ''
                                              ) ? (
                                                <img
                                                  src={toAbsoluteFileUrl(
                                                    selectedCategoryImageCategory?.effective_image_url
                                                      || selectedCategoryImageCategory?.custom_image_url
                                                      || selectedCategoryImageCategory?.system_image_url
                                                      || selectedCategoryImageCategory?.image_url
                                                      || ''
                                                  )}
                                                  alt={getLocalizedCategoryTitle(selectedCategoryImageCategory)}
                                                  className="admin-category-image-preview-img"
                                                />
                                              ) : activeRestaurantLogoUrl ? (
                                                <img
                                                  src={activeRestaurantLogoUrl}
                                                  alt={restaurantSettings?.name || 'Store'}
                                                  className="admin-category-image-preview-img is-logo"
                                                />
                                              ) : (
                                                <div className="admin-category-image-preview-empty">🏪</div>
                                              )}
                                            </div>
                                            <div className="flex-grow-1">
                                              <div className="fw-semibold">{getLocalizedCategoryTitle(selectedCategoryImageCategory)}</div>
                                              <div className="small text-muted">
                                                ID: {selectedCategoryImageCategory.id}
                                              </div>
                                              <div className="small text-muted">
                                                {selectedCategoryImageCategory?.use_custom_image
                                                  ? (selectedCategoryImageCategory?.custom_image_url
                                                    ? 'Источник: собственное фото'
                                                    : 'Источник: логотип магазина (фото не загружено)')
                                                  : 'Источник: системное фото суперадмина'}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <Row className="g-3">
                                          <Col lg={7}>
                                            <Form.Group>
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">
                                                {language === 'uz' ? 'Kategoriya nomi (faqat o‘qish)' : 'Название категории (только чтение)'}
                                              </Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom admin-readonly-field"
                                                value={getLocalizedCategoryTitle(selectedCategoryImageCategory)}
                                                readOnly
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col lg={5}>
                                            <Form.Group className="h-100 d-flex flex-column justify-content-end">
                                              <Form.Check
                                                type="switch"
                                                id={`category-own-image-${selectedCategoryImageCategory.id}`}
                                                label={language === 'uz' ? 'Shaxsiy kategoriya rasmi' : 'Собственное фото категории'}
                                                checked={selectedCategoryImageCategory?.use_custom_image === true}
                                                disabled={savingCategoryImageCategoryId === normalizeId(selectedCategoryImageCategory?.id)}
                                                onChange={(e) => handleToggleCategoryOwnImage(selectedCategoryImageCategory, e.target.checked)}
                                              />
                                            </Form.Group>
                                          </Col>
                                        </Row>

                                        {selectedCategoryImageCategory?.use_custom_image && (
                                          <div className="d-flex flex-wrap gap-2">
                                            <Button
                                              type="button"
                                              className="btn-primary-custom"
                                              onClick={() => {
                                                setCategoryImageUploadTargetId(normalizeId(selectedCategoryImageCategory?.id));
                                                categoryImageFileInputRef.current?.click();
                                              }}
                                              disabled={
                                                savingCategoryImageCategoryId === normalizeId(selectedCategoryImageCategory?.id)
                                                || categoryImageUploadTargetId === normalizeId(selectedCategoryImageCategory?.id)
                                                || uploadingImage
                                              }
                                            >
                                              {categoryImageUploadTargetId === normalizeId(selectedCategoryImageCategory?.id) && uploadingImage
                                                ? 'Загрузка...'
                                                : 'Загрузить фото'}
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline-danger"
                                              onClick={() => handleClearOwnCategoryImage(selectedCategoryImageCategory)}
                                              disabled={
                                                savingCategoryImageCategoryId === normalizeId(selectedCategoryImageCategory?.id)
                                                || !String(selectedCategoryImageCategory?.custom_image_url || '').trim()
                                              }
                                            >
                                              Очистить фото
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-muted small">
                                        {language === 'uz'
                                          ? 'Foto sozlamalarini ochish uchun chapdagi kategoriyadan birini tanlang.'
                                          : 'Выберите категорию слева, чтобы настроить фото.'}
                                      </div>
                                    )}
                                  </Card.Body>
                                </Card>
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'telegram' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <div className="d-flex flex-column gap-2 mb-4">
                              <h5 className="fw-bold mb-0 admin-mobile-section-title">Telegram интеграция</h5>
                              <div className="text-muted small">
                                Настройки бота и чата для обработки заказов. Здесь же проверка токена и копирование данных бота.
                              </div>
                            </div>

                            <Row className="gy-3">
                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Bot Token</Form.Label>
                                  <div className="admin-input-action-field">
                                    <Form.Control
                                      type={isRestaurantBotTokenVisible ? 'text' : 'password'}
                                      className="form-control-custom admin-input-action-control"
                                      value={restaurantSettings.telegram_bot_token || ''}
                                      onChange={e => {
                                        setIsRestaurantBotTokenVisible(false);
                                        setTestedBotInfo(null);
                                        setBotProfileLookupError('');
                                        setRestaurantSettings({ ...restaurantSettings, telegram_bot_token: e.target.value });
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="admin-input-action-btn"
                                      onClick={handleRestaurantTokenPreview}
                                      disabled={!restaurantSettings.telegram_bot_token}
                                      title={isRestaurantBotTokenVisible ? 'Скрыть токен' : 'Показать на 2 секунды'}
                                      aria-label={isRestaurantBotTokenVisible ? 'Скрыть токен' : 'Показать токен'}
                                    >
                                      <i className={`bi ${isRestaurantBotTokenVisible ? 'bi-eye-slash' : 'bi-eye'}`} />
                                    </button>
                                  </div>
                                </Form.Group>
                              </Col>
                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Group ID (чат для заказов)</Form.Label>
                                  <Form.Control
                                    type="text"
                                    className="form-control-custom"
                                    value={restaurantSettings.telegram_group_id || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, telegram_group_id: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={4}>
                                <Form.Group className="h-100 d-flex flex-column">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Проверка</Form.Label>
                                  <Button
                                    variant="outline-primary"
                                    className="w-100 px-3 py-2 rounded-3 fw-bold mt-auto"
                                    onClick={testBot}
                                    disabled={testingBot}
                                  >
                                    {testingBot ? '⌛ Проверка...' : '🔍 Проверить'}
                                  </Button>
                                </Form.Group>
                              </Col>

                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Имя бота</Form.Label>
                                  <div className="admin-input-action-field">
                                    <Form.Control
                                      type="text"
                                      readOnly
                                      className="form-control-custom admin-input-action-control"
                                      value={testedBotInfo?.first_name || '—'}
                                    />
                                    <button
                                      type="button"
                                      className="admin-input-action-btn"
                                      onClick={() => copyTelegramMetaField(testedBotInfo?.first_name, 'bot_name')}
                                      disabled={!testedBotInfo?.first_name}
                                      title="Копировать имя бота"
                                      aria-label="Копировать имя бота"
                                    >
                                      {copiedTelegramField === 'bot_name' ? <i className="bi bi-check2" /> : <CopyIcon />}
                                    </button>
                                  </div>
                                </Form.Group>
                              </Col>

                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Юзернейм бота</Form.Label>
                                  <div className="admin-input-action-field">
                                    <Form.Control
                                      type="text"
                                      readOnly
                                      className="form-control-custom admin-input-action-control"
                                      value={testedBotInfo?.username ? `@${testedBotInfo.username}` : '—'}
                                    />
                                    <button
                                      type="button"
                                      className="admin-input-action-btn"
                                      onClick={() => copyTelegramMetaField(testedBotInfo?.username ? `@${testedBotInfo.username}` : '', 'bot_username')}
                                      disabled={!testedBotInfo?.username}
                                      title="Копировать юзернейм бота"
                                      aria-label="Копировать юзернейм бота"
                                    >
                                      {copiedTelegramField === 'bot_username' ? <i className="bi bi-check2" /> : <CopyIcon />}
                                    </button>
                                  </div>
                                </Form.Group>
                              </Col>

                              <Col md={4}>
                                {isSuperAdmin() ? (
                                  <Form.Group>
                                    <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Username поддержки (@...)</Form.Label>
                                    <Form.Control
                                      type="text"
                                      className="form-control-custom"
                                      value={restaurantSettings.support_username || ''}
                                      onChange={e => setRestaurantSettings({ ...restaurantSettings, support_username: e.target.value })}
                                    />
                                  </Form.Group>
                                ) : (
                                  <Form.Group>
                                    <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Username поддержки (@...)</Form.Label>
                                    <Form.Control
                                      type="text"
                                      className="form-control-custom"
                                      value="Только для суперадмина"
                                      readOnly
                                      disabled
                                    />
                                  </Form.Group>
                                )}
                              </Col>

                              {isRestaurantBotTokenChanged && (
                                <Col md={12}>
                                  <Alert
                                    variant={isTokenSaveLocked ? 'warning' : 'info'}
                                    className="mb-0 py-2 px-3 small"
                                  >
                                    Перед сохранением откройте новый бот и нажмите <code>/start</code>.
                                    {isTokenSaveLocked
                                      ? ` Кнопка сохранения станет активной через ${tokenSaveCountdown} сек.`
                                      : ' Теперь можно сохранять токен.'}
                                  </Alert>
                                </Col>
                              )}
                              {(botProfileLookupLoading || botProfileLookupError) && (
                                <Col md={12}>
                                  {botProfileLookupLoading && (
                                    <div className="small text-muted">⌛ Определяем имя и username бота...</div>
                                  )}
                                  {!botProfileLookupLoading && botProfileLookupError && (
                                    <div className="small text-danger">{botProfileLookupError}</div>
                                  )}
                                </Col>
                              )}
                              <Col md={12}>
                                <div className="admin-telegram-qr-download-panel">
                                  <div className="admin-telegram-qr-download-copy">
                                    <div className="small fw-bold text-muted text-uppercase">QR-код магазина</div>
                                    <div className="small text-muted">
                                      Скачайте регистрационный QR (как при первичной регистрации). Полезно, если Bot Token добавили позже.
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline-primary"
                                    className="fw-bold"
                                    onClick={downloadRestaurantRegistrationQr}
                                    disabled={downloadingRegistrationQr || !String(restaurantSettings.telegram_bot_token || '').trim()}
                                  >
                                    {downloadingRegistrationQr ? '⌛ Подготовка QR...' : '⬇️ Скачать QR'}
                                  </Button>
                                </div>
                              </Col>
                            </Row>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'payments' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <div className="d-flex flex-column gap-2 mb-4">
                              <h5 className="fw-bold mb-0 admin-mobile-section-title">Платежные системы</h5>
                              <div className="text-muted small">
                                Откройте нужную систему и заполните ссылку оплаты. Для всех систем доступны поля-заглушки Merchant API для будущей интеграции.
                              </div>
                            </div>

                            <Accordion defaultActiveKey="payme" alwaysOpen className="admin-payment-accordion">
                              {paymentSystems.map((system) => (
                                <Accordion.Item eventKey={system.key} key={system.key} className="admin-payment-accordion-item">
                                  <Accordion.Header>
                                    <div className="admin-payment-accordion-header">
                                      <div className="admin-payment-accordion-brand">
                                        <span className="admin-payment-logo-wrap">
                                          <img src={system.logo} alt={system.title} className="admin-payment-logo" />
                                        </span>
                                        <span className="admin-payment-title-wrap">
                                          <span className="admin-payment-title">{system.title}</span>
                                          <span className="admin-payment-subtitle">{system.description}</span>
                                        </span>
                                      </div>
                                      <span className={`admin-payment-status-chip ${system.configured ? 'is-ready' : 'is-empty'}`}>
                                        {system.configured ? 'Настроено' : 'Не заполнено'}
                                      </span>
                                    </div>
                                  </Accordion.Header>
                                  <Accordion.Body>
                                    {system.key === 'cash' && (
                                      <div className="d-flex flex-column gap-3">
                                        <div className="admin-payment-placeholder-box">
                                          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                                            <div>
                                              <div className="small fw-bold text-muted text-uppercase">Оплата наличными</div>
                                              <div className="small text-muted">Если выключить, клиенты не смогут выбрать наличную оплату.</div>
                                            </div>
                                            <Form.Check
                                              type="switch"
                                              checked={restaurantSettings.cash_enabled !== false}
                                              onChange={e => setRestaurantSettings({ ...restaurantSettings, cash_enabled: e.target.checked })}
                                              label={restaurantSettings.cash_enabled !== false ? 'Включено' : 'Выключено'}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {system.key === 'card' && (
                                      <div className="d-flex flex-column gap-4">
                                        <Row className="gy-3">
                                          <Col md={12}>
                                            <Form.Group className="mb-0">
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Название карты</Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.card_payment_title || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, card_payment_title: e.target.value })}
                                                placeholder="Например: HUMO / UZCARD"
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={6}>
                                            <Form.Group className="mb-0">
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Номер карты</Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.card_payment_number || ''}
                                                onChange={e => setRestaurantSettings({
                                                  ...restaurantSettings,
                                                  card_payment_number: String(e.target.value || '').replace(/\D/g, '').slice(0, 19)
                                                })}
                                                placeholder="8600..."
                                              />
                                            </Form.Group>
                                          </Col>
                                          <Col md={6}>
                                            <Form.Group className="mb-0">
                                              <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Владелец карты</Form.Label>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.card_payment_holder || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, card_payment_holder: e.target.value })}
                                                placeholder="ИМЯ ФАМИЛИЯ"
                                              />
                                            </Form.Group>
                                          </Col>
                                        </Row>

                                        <div className="admin-payment-placeholder-box">
                                          <div className="small fw-bold text-muted text-uppercase mb-2">Куда отправлять чек оплаты</div>
                                          <div className="d-flex flex-column gap-2">
                                            <Form.Check
                                              type="radio"
                                              id="card-receipt-target-bot"
                                              name="card-receipt-target"
                                              label="Отправить чек оплаты через бот"
                                              checked={(restaurantSettings.card_receipt_target || 'bot') === 'bot'}
                                              onChange={() => setRestaurantSettings({ ...restaurantSettings, card_receipt_target: 'bot' })}
                                            />
                                            <Form.Check
                                              type="radio"
                                              id="card-receipt-target-admin"
                                              name="card-receipt-target"
                                              label="Отправить чек оплаты администратору"
                                              checked={restaurantSettings.card_receipt_target === 'admin'}
                                              onChange={() => setRestaurantSettings({ ...restaurantSettings, card_receipt_target: 'admin' })}
                                            />
                                          </div>
                                          <div className="small text-muted mt-2">
                                            По умолчанию выбран вариант через бот.
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {system.key === 'click' && (
                                      <>
                                        <Form.Group className="mb-0">
                                          <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Ссылка Click</Form.Label>
                                          <Form.Control
                                            type="text"
                                            className="form-control-custom"
                                            value={restaurantSettings.click_url || ''}
                                            onChange={e => setRestaurantSettings({ ...restaurantSettings, click_url: e.target.value })}
                                            placeholder="https://..."
                                          />
                                        </Form.Group>
                                        {renderGatewayPlaceholderFields('click', 'Click')}
                                      </>
                                    )}

                                    {system.key === 'payme' && (
                                      <div className="d-flex flex-column gap-4">
                                        <Form.Group className="mb-0">
                                          <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Ссылка Payme</Form.Label>
                                          <Form.Control
                                            type="text"
                                            className="form-control-custom"
                                            value={restaurantSettings.payme_url || ''}
                                            onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_url: e.target.value })}
                                            placeholder="https://..."
                                          />
                                        </Form.Group>

                                        <div className="admin-payment-payme-box">
                                          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-3">
                                            <div>
                                              <div className="small fw-bold text-muted text-uppercase">Payme Merchant API</div>
                                              <div className="small text-muted">Автоподтверждение оплаты и возврат статусов заказа.</div>
                                            </div>
                                            <Form.Check
                                              type="switch"
                                              checked={Boolean(restaurantSettings.payme_enabled)}
                                              onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_enabled: e.target.checked })}
                                              label={restaurantSettings.payme_enabled ? 'Включено' : 'Выключено'}
                                            />
                                          </div>
                                          <Row className="gy-3">
                                            <Col md={4}>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.payme_merchant_id || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_merchant_id: e.target.value })}
                                                placeholder="Merchant ID"
                                              />
                                            </Col>
                                            <Col md={4}>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.payme_api_login || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_api_login: e.target.value })}
                                                placeholder="Merchant API login"
                                              />
                                            </Col>
                                            <Col md={4}>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.payme_api_password || ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_api_password: e.target.value })}
                                                placeholder="Merchant API password"
                                              />
                                            </Col>
                                            <Col md={6}>
                                              <Form.Control
                                                type="text"
                                                className="form-control-custom"
                                                value={restaurantSettings.payme_account_key ?? ''}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_account_key: e.target.value })}
                                                placeholder="order_id"
                                              />
                                            </Col>
                                            <Col md={6}>
                                              <Form.Control
                                                type="number"
                                                min="0"
                                                className="form-control-custom"
                                                value={restaurantSettings.payme_callback_timeout_ms || 2000}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_callback_timeout_ms: e.target.value })}
                                                placeholder="Callback timeout ms"
                                              />
                                            </Col>
                                            <Col md={12}>
                                              <Form.Check
                                                type="switch"
                                                label="Тестовый режим Payme"
                                                checked={Boolean(restaurantSettings.payme_test_mode)}
                                                onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_test_mode: e.target.checked })}
                                              />
                                            </Col>
                                          </Row>
                                        </div>
                                      </div>
                                    )}

                                    {system.key === 'uzum' && (
                                      <>
                                        <Form.Group className="mb-0">
                                          <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Ссылка Uzum</Form.Label>
                                          <Form.Control
                                            type="text"
                                            className="form-control-custom"
                                            value={restaurantSettings.uzum_url || ''}
                                            onChange={e => setRestaurantSettings({ ...restaurantSettings, uzum_url: e.target.value })}
                                            placeholder="https://..."
                                          />
                                        </Form.Group>
                                        {renderGatewayPlaceholderFields('uzum', 'Uzum')}
                                      </>
                                    )}

                                    {system.key === 'xazna' && (
                                      <>
                                        <Form.Group className="mb-0">
                                          <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Ссылка Xazna</Form.Label>
                                          <Form.Control
                                            type="text"
                                            className="form-control-custom"
                                            value={restaurantSettings.xazna_url || ''}
                                            onChange={e => setRestaurantSettings({ ...restaurantSettings, xazna_url: e.target.value })}
                                            placeholder="https://..."
                                          />
                                        </Form.Group>
                                        {renderGatewayPlaceholderFields('xazna', 'Xazna')}
                                      </>
                                    )}
                                  </Accordion.Body>
                                </Accordion.Item>
                              ))}
                            </Accordion>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'delivery' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <Row className="gy-4">
                              <Col md={12}>
                                <Form.Check
                                  type="switch"
                                  label="Включить собственную доставку"
                                  className="fw-bold mb-4"
                                  checked={restaurantSettings.is_delivery_enabled}
                                  onChange={e => setRestaurantSettings({ ...restaurantSettings, is_delivery_enabled: e.target.checked })}
                                />
                              </Col>

                              <Col md={12}>
                                <div className="mb-4">
                                  <label className="small fw-bold text-muted text-uppercase mb-2 d-block">Точка центра доставки на карте</label>
                                  <YandexLocationPicker
                                    latitude={restaurantSettings.latitude}
                                    longitude={restaurantSettings.longitude}
                                    onLocationChange={(lat, lng) => setRestaurantSettings({ ...restaurantSettings, latitude: lat, longitude: lng })}
                                    height="400px"
                                  />
                                  <div className="small text-muted mt-2">Кликните на карту или перетащите маркер, чтобы установить координаты заведения.</div>
                                </div>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Широта (Latitude)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    step="any"
                                    className="form-control-custom"
                                    value={restaurantSettings.latitude || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, latitude: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Долгота (Longitude)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    step="any"
                                    className="form-control-custom"
                                    value={restaurantSettings.longitude || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, longitude: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Режим цены доставки</Form.Label>
                                  <div className="admin-delivery-pricing-tabs">
                                    <button
                                      type="button"
                                      className={`admin-delivery-pricing-tab ${(restaurantSettings.delivery_pricing_mode || 'dynamic') === 'fixed' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({
                                        ...restaurantSettings,
                                        delivery_pricing_mode: 'fixed'
                                      })}
                                    >
                                      Фиксированная
                                    </button>
                                    <button
                                      type="button"
                                      className={`admin-delivery-pricing-tab ${(restaurantSettings.delivery_pricing_mode || 'dynamic') === 'dynamic' ? 'is-active' : ''}`}
                                      onClick={() => setRestaurantSettings({
                                        ...restaurantSettings,
                                        delivery_pricing_mode: 'dynamic'
                                      })}
                                    >
                                      Динамичная
                                    </button>
                                  </div>
                                  <Form.Text className="text-muted d-block mt-2">
                                    Фиксированная: одна цена на любую дистанцию. Динамичная: расчет по радиусу и километрам.
                                  </Form.Text>
                                </Form.Group>
                              </Col>

                              {(restaurantSettings.delivery_pricing_mode || 'dynamic') === 'fixed' ? (
                                <Col md={6}>
                                  <Form.Group>
                                    <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Фиксированная цена доставки ({t('sum')})</Form.Label>
                                    <Form.Control
                                      type="text"
                                      inputMode="decimal"
                                      className="form-control-custom"
                                      value={formatNumberInputWithGrouping(restaurantSettings.delivery_fixed_price, 2)}
                                      onChange={e => setRestaurantSettings({
                                        ...restaurantSettings,
                                        delivery_fixed_price: parseNumberInputWithGrouping(e.target.value)
                                      })}
                                    />
                                  </Form.Group>
                                </Col>
                              ) : (
                                <>
                                  <Col md={4}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Базовый радиус (км)</Form.Label>
                                      <Form.Control
                                        type="number"
                                        className="form-control-custom"
                                        value={restaurantSettings.delivery_base_radius || 0}
                                        onChange={e => setRestaurantSettings({ ...restaurantSettings, delivery_base_radius: e.target.value })}
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={4}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Базовая цена ({t('sum')})</Form.Label>
                                      <Form.Control
                                        type="text"
                                        inputMode="decimal"
                                        className="form-control-custom"
                                        value={formatNumberInputWithGrouping(restaurantSettings.delivery_base_price, 2)}
                                        onChange={e => setRestaurantSettings({
                                          ...restaurantSettings,
                                          delivery_base_price: parseNumberInputWithGrouping(e.target.value)
                                        })}
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={4}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Цена за доп. км ({t('sum')})</Form.Label>
                                      <Form.Control
                                        type="text"
                                        inputMode="decimal"
                                        className="form-control-custom"
                                        value={formatNumberInputWithGrouping(restaurantSettings.delivery_price_per_km, 2)}
                                        onChange={e => setRestaurantSettings({
                                          ...restaurantSettings,
                                          delivery_price_per_km: parseNumberInputWithGrouping(e.target.value)
                                        })}
                                      />
                                    </Form.Group>
                                  </Col>
                                </>
                              )}

                              <Col md={12}>
                                <hr className="my-2" />
                                <label className="small fw-bold text-muted text-uppercase mb-2 d-block">Режимы времени доставки</label>
                                <Form.Check
                                  type="switch"
                                  label="Как можно быстрее"
                                  className="mb-2"
                                  checked={restaurantSettings.is_asap_delivery_enabled}
                                  onChange={e => setRestaurantSettings({ ...restaurantSettings, is_asap_delivery_enabled: e.target.checked })}
                                />
                                <Form.Check
                                  type="switch"
                                  label="Ко времени (выбор часа)"
                                  className="mb-2"
                                  checked={restaurantSettings.is_scheduled_time_delivery_enabled}
                                  onChange={e => setRestaurantSettings({ ...restaurantSettings, is_scheduled_time_delivery_enabled: e.target.checked })}
                                />
                                <Form.Check
                                  type="switch"
                                  label="Доставка в выбранную дату"
                                  className="mb-2"
                                  checked={restaurantSettings.is_scheduled_date_delivery_enabled}
                                  onChange={e => setRestaurantSettings({ ...restaurantSettings, is_scheduled_date_delivery_enabled: e.target.checked })}
                                />
                                <Form.Check
                                  type="switch"
                                  label='Режим "Доставить позже" для оператора'
                                  className="mb-2"
                                  checked={Boolean(restaurantSettings.is_operator_delivery_later_enabled)}
                                  onChange={e => setRestaurantSettings({ ...restaurantSettings, is_operator_delivery_later_enabled: e.target.checked })}
                                />
                                <Form.Text className="text-muted d-block mb-3">
                                  Клиенты смогут выбрать дату доставки из календаря. Заказ будет отображаться у оператора до завершения.
                                </Form.Text>
                                {restaurantSettings.is_scheduled_date_delivery_enabled && (
                                  <Form.Group className="mb-0" style={{ maxWidth: 260 }}>
                                    <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Максимум дней вперёд</Form.Label>
                                    <Form.Control
                                      type="number"
                                      min={1}
                                      max={90}
                                      className="form-control-custom"
                                      value={restaurantSettings.scheduled_delivery_max_days}
                                      onChange={e => setRestaurantSettings({
                                        ...restaurantSettings,
                                        scheduled_delivery_max_days: Math.max(1, Math.min(90, Math.trunc(Number(e.target.value) || 7)))
                                      })}
                                    />
                                    <Form.Text className="text-muted">
                                      На сколько дней вперёд клиент может выбрать дату (по умолчанию 7).
                                    </Form.Text>
                                  </Form.Group>
                                )}
                              </Col>
                            </Row>

                            <Col md={12}>
                              <Button
                                variant="outline-primary"
                                className="w-100 py-3 rounded-4 border-dashed mt-3 shadow-none overflow-hidden"
                                onClick={() => setShowDeliveryZoneModal(true)}
                                style={{ borderStyle: 'dashed' }}
                              >
                                🗺️ {restaurantSettings.delivery_zone ? 'Редактировать зону доставки' : 'Настроить зону доставки'}
                              </Button>
                            </Col>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom shadow-none"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'product_settings' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <div className="admin-settings-single-column">
                              <div className="admin-settings-surface-block">
                                <div className="fw-bold mb-1">
                                  {language === 'uz' ? "Ombor qoldig'ini nazorat qilish" : 'Контроль складских остатков'}
                                </div>
                                <div className="small text-muted mb-3">
                                  {language === 'uz'
                                    ? "Yoqilganda, mahsulot mavjudligi ombordagi qoldiq va xavfsizlik chegarasi bo'yicha avtomatik boshqariladi."
                                    : 'При включении система автоматически управляет статусом товара по остатку и порогу безопасности.'}
                                </div>
                                <Form.Check
                                  type="switch"
                                  id="inventory-tracking-enabled-switch"
                                  className="fw-semibold mb-3"
                                  label={language === 'uz' ? "Qoldiq hisobini yoqish" : 'Учет остатков'}
                                  checked={Boolean(restaurantSettings.inventory_tracking_enabled)}
                                  onChange={(e) => setRestaurantSettings({
                                    ...restaurantSettings,
                                    inventory_tracking_enabled: e.target.checked
                                  })}
                                />
                                <Row className="g-3 align-items-start">
                                  <Col md={6}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">
                                        {language === 'uz' ? 'Minimal xavfsizlik chegarasi (dona)' : 'Минимальный порог (шт.)'}
                                      </Form.Label>
                                      <Form.Control
                                        type="number"
                                        min={0}
                                        step="0.001"
                                        className="form-control-custom"
                                        value={restaurantSettings.inventory_min_threshold ?? 0}
                                        onChange={(e) => setRestaurantSettings({
                                          ...restaurantSettings,
                                          inventory_min_threshold: e.target.value
                                        })}
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <div className={`admin-product-stock-hint ${Boolean(restaurantSettings.inventory_tracking_enabled) ? 'is-ok' : 'is-low'}`}>
                                      <div className="fw-semibold mb-1">
                                        {language === 'uz' ? 'Qoidaning ishlashi' : 'Как работает порог'}
                                      </div>
                                      <div className="small">
                                        {language === 'uz'
                                          ? `Masalan, chegara 2 bo'lsa, qoldiq 2 ga tushganda mahsulot "Mavjud emas" holatiga o'tadi.`
                                          : 'Например, при пороге 2 товар автоматически станет «Нет в наличии», когда остаток дойдет до 2.'}
                                      </div>
                                    </div>
                                  </Col>
                                </Row>
                              </div>

                              <div className="admin-settings-surface-block">
                                <Form.Group className="mb-0">
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">
                                    Сумма минимального заказа ({t('sum')})
                                  </Form.Label>
                                  <Form.Control
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="form-control-custom"
                                    value={restaurantSettings.minimum_order_amount ?? 0}
                                    onChange={(e) => setRestaurantSettings({
                                      ...restaurantSettings,
                                      minimum_order_amount: e.target.value
                                    })}
                                  />
                                  <Form.Text className="text-muted">
                                    Учитывается только стоимость товаров (без доставки, сервиса и фасовки). 0 — без ограничения.
                                  </Form.Text>
                                </Form.Group>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom shadow-none"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'reports' && (
                        <Card className="admin-settings-card border-0 rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <div className="admin-settings-single-column">
                              <div className="admin-settings-surface-block">
                                <div className="admin-store-automation-panel">
                                  <div className="fw-bold mb-1">
                                    {language === 'uz' ? "Telegram avtomatik xabarlari" : 'Автоматические уведомления в Telegram'}
                                  </div>
                                  <div className="small text-muted mb-3">
                                    {language === 'uz'
                                      ? "Buyurtma tasdiqlangandan keyin balans qoldig'ini va do'kon yopilgandan keyin kunlik hisobotni guruhga yuborish."
                                      : 'Отправка остатка баланса после подтверждения заказа и детального отчёта после закрытия магазина.'}
                                  </div>
                                  <div className="d-flex flex-column gap-2">
                                    <Form.Check
                                      type="switch"
                                      id="send-balance-after-confirm-switch"
                                      className="fw-semibold"
                                      label={language === 'uz'
                                        ? "Tasdiqlangandan keyin balans qoldig'ini yuborish"
                                        : 'Отправлять остаток баланса после подтверждения'}
                                      checked={Boolean(restaurantSettings.send_balance_after_confirm)}
                                      onChange={(e) => setRestaurantSettings({
                                        ...restaurantSettings,
                                        send_balance_after_confirm: e.target.checked
                                      })}
                                    />
                                    <Form.Check
                                      type="switch"
                                      id="send-daily-close-report-switch"
                                      className="fw-semibold"
                                      label={language === 'uz'
                                        ? "Do'kon yopilganda kunlik hisobotni yuborish"
                                        : 'Отправлять отчёт после закрытия магазина'}
                                      checked={Boolean(restaurantSettings.send_daily_close_report)}
                                      onChange={(e) => setRestaurantSettings({
                                        ...restaurantSettings,
                                        send_daily_close_report: e.target.checked
                                      })}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom shadow-none"
                                onClick={saveRestaurantSettings}
                                disabled={isRestaurantSettingsSaveDisabled}
                              >
                                {savingSettings
                                  ? 'Сохранение...'
                                  : isTokenSaveLocked
                                    ? `Подождите ${tokenSaveCountdown}с...`
                                    : isRestaurantSettingsDirty
                                      ? 'Сохранить изменения'
                                      : 'Нет изменений'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}


                      {settingsTab === 'operators' && (
                        <>
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold mb-0 admin-mobile-section-title">Операторы магазина</h5>
                            <Button
                              variant="primary"
                              className="rounded-pill px-4 fw-bold shadow-sm btn-primary-custom"
                              onClick={() => openOperatorModal(null)}
                            >
                              + Добавить оператора
                            </Button>
                          </div>
                          <div className="admin-table-container">
                            <Table responsive hover className="admin-table mb-0">
                              <thead>
                                <tr>
                                  <th>Имя</th>
                                  <th>Username</th>
                                  <th>Телефон</th>
                                  <th className="text-end">ДЕЙСТВИЯ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {operators.map(op => (
                                  <tr key={op.id}>
                                    <td>{op.full_name}</td>
                                    <td><code>@{op.username}</code></td>
                                    <td>{op.phone}</td>
                                    <td className="text-end">
                                      <div className="d-flex gap-2 justify-content-end">
                                        <Button
                                          variant="light"
                                          className="action-btn text-primary shadow-none border-0"
                                          onClick={() => openOperatorModal(op)}
                                          title="Редактировать"
                                        >
                                          <EditIcon />
                                        </Button>
                                        <Button
                                          variant="light"
                                          className="action-btn text-danger shadow-none border-0"
                                          onClick={() => deleteOperator(op.id)}
                                          disabled={op.id === user?.id}
                                          title="Удалить"
                                        >
                                          <TrashIcon />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {operators.length === 0 && (
                                  <tr>
                                    <td colSpan="4" className="text-center py-4 text-muted">Нет дополнительных операторов</td>
                                  </tr>
                                )}
                              </tbody>
                            </Table>
                          </div>
                        </>
                      )}

                    </>
                  ) : (
                    <ListSkeleton count={3} label="Загрузка настроек" />
                  )}
                </div>
              </Tab>

              <Tab eventKey="help" title={renderAdminSidebarTabTitle('help')}>
                <Card className="admin-help-shell border-0 rounded-4 overflow-hidden">
                  <Card.Body className="p-4 admin-help-body">
                    <div className="admin-help-header d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                      <h5 className="fw-bold mb-0 admin-mobile-section-title">
                        {language === 'uz' ? "Video yo'riqnomalar" : 'Видео-инструкции'}
                      </h5>
                      <Button
                        variant="outline-secondary"
                        className="admin-help-refresh-btn"
                        onClick={fetchHelpInstructions}
                        disabled={loadingHelpInstructions}
                      >
                        {loadingHelpInstructions
                          ? (language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...')
                          : (language === 'uz' ? 'Yangilash' : 'Обновить')}
                      </Button>
                    </div>

                    {loadingHelpInstructions ? (
                      <ListSkeleton count={5} label={language === 'uz' ? "Yo'riqnomalar yuklanmoqda" : 'Загрузка инструкций'} />
                    ) : helpInstructions.length === 0 ? (
                      <div className="text-center text-muted py-4">
                        {language === 'uz' ? "Yo'riqnomalar hali qo'shilmagan" : 'Инструкции пока не добавлены'}
                      </div>
                    ) : (
                      <Row className="g-3 admin-help-layout">
                        <Col xl={4} className="admin-help-col-list">
                          <div className="admin-help-list-panel">
                            <div className="admin-help-list-title">
                              {language === 'uz' ? "Yo'riqnomalar ro'yxati" : 'Список инструкций'}
                            </div>
                            <div className="d-grid gap-2 admin-custom-scrollbar admin-help-list-scroll">
                            {helpInstructions.map((item) => {
                              const isActive = Number(selectedHelpInstruction?.id) === Number(item.id);
                              const title = language === 'uz'
                                ? (item.title_uz || item.title_ru || '—')
                                : (item.title_ru || item.title_uz || '—');
                              const rawUrl = String(item.youtube_url || '').trim();
                              const hasVideo = Boolean(rawUrl);
                              const thumbnailUrl = getYouTubeThumbnailUrl(rawUrl);
                              return (
                                <button
                                  key={`admin-help-${item.id}`}
                                  type="button"
                                  className={`btn text-start admin-help-list-item ${isActive ? 'is-active' : ''}`}
                                  onClick={() => setSelectedHelpInstruction(item)}
                                >
                                  <div className="admin-help-item-layout">
                                    <div className={`admin-help-item-thumb-shell${thumbnailUrl ? '' : ' is-empty'}`} aria-hidden="true">
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
                                    <div className="admin-help-item-copy">
                                      <div className="fw-semibold admin-help-item-title">
                                        {title}
                                      </div>
                                      <div className="small text-muted admin-help-item-meta">
                                        {hasVideo ? (
                                          <span className="admin-help-item-views">
                                            <i className="bi bi-eye-fill" aria-hidden="true"></i>
                                            <span>{formatHelpInstructionViews(item.view_count, language)}</span>
                                          </span>
                                        ) : (
                                          <span className="admin-help-item-status">
                                            {language === 'uz' ? "Video qo'shilmagan" : 'Видео не добавлено'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                            </div>
                          </div>
                        </Col>
                        <Col xl={8} className="admin-help-col-preview">
                          {selectedHelpInstruction && selectedHelpInstruction.youtube_url ? (
                            <Card className="admin-help-preview-card border-0 h-100">
                              <Card.Body className="p-3 p-lg-4">
                                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 admin-help-preview-head">
                                  <div>
                                    <div className="fw-semibold admin-help-preview-title">
                                      {language === 'uz'
                                        ? (selectedHelpInstruction.title_uz || selectedHelpInstruction.title_ru || '—')
                                        : (selectedHelpInstruction.title_ru || selectedHelpInstruction.title_uz || '—')}
                                    </div>
                                    <div className="admin-help-preview-meta">
                                      <i className="bi bi-eye-fill" aria-hidden="true"></i>
                                      <span>{formatHelpInstructionViews(selectedHelpInstruction.view_count, language)}</span>
                                    </div>
                                  </div>
                                  <a
                                    href={selectedHelpInstruction.youtube_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-outline-primary btn-sm admin-help-open-btn"
                                  >
                                    {language === 'uz' ? 'Yangi oynada ochish' : 'Открыть в новой вкладке'}
                                  </a>
                                </div>
                                {normalizeYouTubeEmbedUrl(selectedHelpInstruction.youtube_url) ? (
                                  <div className="ratio ratio-16x9 rounded-3 overflow-hidden admin-help-video-frame">
                                    <iframe
                                      title={`help-video-${selectedHelpInstruction.id}`}
                                      src={normalizeYouTubeEmbedUrl(selectedHelpInstruction.youtube_url)}
                                      referrerPolicy="strict-origin-when-cross-origin"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                      allowFullScreen
                                    />
                                  </div>
                                ) : (
                                  <Alert variant="warning" className="mb-0">
                                    {language === 'uz'
                                      ? "Video havolasi YouTube formatida emas. Yangi oynada oching."
                                      : 'Ссылка не распознана как YouTube. Откройте видео в новой вкладке.'}
                                  </Alert>
                                )}
                              </Card.Body>
                            </Card>
                          ) : (
                            <div className="admin-help-empty-state">
                              <div className="admin-help-empty-icon" aria-hidden="true">▶</div>
                              <div className="admin-help-empty-text">
                                {language === 'uz'
                                  ? "Ko'rish uchun video yo'riqnomani tanlang"
                                  : 'Выберите инструкцию для просмотра'}
                              </div>
                            </div>
                          )}
                        </Col>
                      </Row>
                    )}
                  </Card.Body>
                </Card>
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
              activeKey={mainTab}
              onSelect={handleSidebarTabSelect}
              className="admin-tabs admin-tabs-sidebar admin-sidebar-mobile-nav"
            >
              {renderAdminSidebarNavItems()}
            </Nav>
            {renderAdminMobileMenuExtras()}
          </Modal.Body>
        </Modal>

        <Modal
          show={showCustomerOrdersModal}
          onHide={() => setShowCustomerOrdersModal(false)}
          size="xl"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>История заказов клиента</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <Card className="mb-3 border-0 bg-light">
              <Card.Body className="py-3">
                <Row className="g-3">
                  <Col md={4}>
                    <div className="small text-muted">Клиент</div>
                    <div className="fw-semibold">{selectedCustomerProfile?.full_name || selectedCustomerProfile?.username || '-'}</div>
                  </Col>
                  <Col md={4}>
                    <div className="small text-muted">Телефон</div>
                    <div>{selectedCustomerProfile?.phone || '-'}</div>
                  </Col>
                  <Col md={4}>
                    <div className="small text-muted">Всего заказов в магазине</div>
                    <div className="fw-semibold">{customerOrdersHistory.total || 0}</div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {customerOrdersLoading ? (
              <TableSkeleton rows={5} columns={6} label="Загрузка истории заказов клиента" />
            ) : (customerOrdersHistory.orders || []).length === 0 ? (
              <div className="text-center py-4 text-muted">У этого клиента пока нет заказов в текущем магазине</div>
            ) : (
              <>
                <div className="admin-table-container">
                  <Table responsive hover className="admin-table mb-0">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>{t('date')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('status')}</th>
                        <th>Оплата</th>
                        <th>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerOrdersHistory.orders.map((order) => (
                        <tr key={`customer-order-${order.id}`}>
                          <td className="fw-semibold">#{order.order_number}</td>
                          <td><small>{order.created_at ? new Date(order.created_at).toLocaleString('ru-RU') : '-'}</small></td>
                          <td>{formatPrice(order.total_amount || 0)} {t('sum')}</td>
                          <td>{getStatusBadge(order.status)}</td>
                          <td><small>{getPaymentMethodLabel(order.payment_method)}</small></td>
                          <td>
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => openOrderModal(order)}
                            >
                              Детали
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="d-flex justify-content-between align-items-center mt-3 gap-2">
                  <span className="small text-muted">Стр. {customerOrdersPage}</span>
                  <div className="d-flex gap-2">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      disabled={customerOrdersPage <= 1 || customerOrdersLoading || !selectedCustomerProfile?.id}
                      onClick={() => {
                        const nextPage = Math.max(customerOrdersPage - 1, 1);
                        setCustomerOrdersPage(nextPage);
                        fetchCustomerOrdersHistory(selectedCustomerProfile.id, nextPage);
                      }}
                    >
                      Назад
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      disabled={(customerOrdersPage * (customerOrdersHistory.limit || 10)) >= (customerOrdersHistory.total || 0) || customerOrdersLoading || !selectedCustomerProfile?.id}
                      onClick={() => {
                        const nextPage = customerOrdersPage + 1;
                        setCustomerOrdersPage(nextPage);
                        fetchCustomerOrdersHistory(selectedCustomerProfile.id, nextPage);
                      }}
                    >
                      Вперед
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCustomerOrdersModal(false)}>
              {t('close') || 'Закрыть'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Order Details Modal */}
        <Modal
          show={showOrderModal}
          onHide={() => {
            setShowOrderModal(false);
            setShowAddOrderItemModal(false);
            setShowDeliveryLaterModal(false);
            setDeliveryLaterDate('');
            setOrderItemSearch('');
          }}
          size="xl"
          centered
          dialogClassName="order-details-modal-dialog"
          contentClassName="order-details-modal-content"
        >
          <Modal.Header closeButton>
            <Modal.Title className="d-flex align-items-center gap-2 flex-wrap">
              <span>Заказ #{selectedOrder?.order_number}</span>
              {selectedOrder && getStatusBadge(getOrderDisplayWorkflowStatus(selectedOrder))}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="order-details-modal-body">
            {selectedOrder && (
              <>
                {(() => {
                  const hideSensitive = isOrderSensitiveDataHidden(selectedOrder);
                  return (
                  <>
                <Row className="g-3 order-details-modal-layout">
                  <Col lg={4} md={12}>
                <div className="order-details-side">
                <div className="order-meta-card mb-3">
                  {hideSensitive && (
                    <Alert variant="warning" className="mb-3 py-2 px-3">
                      Данные клиента и адрес будут показаны после подтверждения заказа.
                    </Alert>
                  )}
                  <div className="order-meta-grid">
                    <div className="order-meta-item">
                      <span className="order-meta-label">Клиент</span>
                      <div className="order-meta-value">{hideSensitive ? 'Скрыто до принятия' : (selectedOrder.customer_name || '-')}</div>
                    </div>
                    <div className="order-meta-item">
                      <span className="order-meta-label">Телефон</span>
                      <div className="order-meta-value order-meta-phone">
                        {hideSensitive ? (
                          <span className="text-muted">Нажмите «Принять», чтобы увидеть номер</span>
                        ) : (
                          <>
                            {(() => {
                              const telegramHref = getTelegramPhoneHref(selectedOrder.customer_phone);
                              if (!telegramHref) {
                                return (
                                  <span className="order-meta-phone-link">
                                    {selectedOrder.customer_phone}
                                  </span>
                                );
                              }
                              return (
                                <a
                                  href={telegramHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="order-meta-phone-link"
                                >
                                  {selectedOrder.customer_phone}
                                </a>
                              );
                            })()}
                            <a
                              href={`tel:${selectedOrder.customer_phone}`}
                              className="btn btn-success btn-sm order-call-btn"
                            >
                              Позвонить
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="order-meta-item">
                      <span className="order-meta-label">Дата заказа</span>
                      <div className="order-meta-value">
                        {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString('ru-RU') : '-'}
                      </div>
                    </div>
                    <div className="order-meta-item">
                      <span className="order-meta-label">Доставка</span>
                      <div className="order-meta-value">
                        {formatDeliveryDateTime(selectedOrder.delivery_date, selectedOrder.delivery_time)}
                      </div>
                    </div>
                    <div className="order-meta-item">
                      <span className="order-meta-label">Оплата</span>
                      <div className="order-meta-value">{getPaymentMethodLabel(selectedOrder.payment_method)}</div>
                    </div>
                    {selectedOrder.processed_by_name && (
                      <div className="order-meta-item">
                        <span className="order-meta-label">
                          {selectedOrder.status === 'cancelled' ? 'Отменил' : 'Обработал'}
                        </span>
                        <div className="order-meta-value order-meta-processed">
                          <span className={`order-meta-processed-icon ${selectedOrder.status === 'cancelled' ? 'is-cancelled' : ''}`}>
                            {selectedOrder.status === 'cancelled' ? '✕' : '✓'}
                          </span>
                          <span className="order-meta-processed-name">{selectedOrder.processed_by_name}</span>
                        </div>
                        {selectedOrder.processed_at && (
                          <div className="order-meta-time">
                            {new Date(selectedOrder.processed_at).toLocaleString('ru-RU')}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="order-meta-item order-meta-item-wide">
                      <span className="order-meta-label">Адрес</span>
                      <div className="order-meta-value">{hideSensitive ? 'Скрыто до принятия' : selectedOrder.delivery_address}</div>

                      {/* Map and location links */}
                      {!hideSensitive && selectedOrder.delivery_coordinates && (() => {
                        const coords = selectedOrder.delivery_coordinates.split(',').map(c => c.trim());
                        if (coords.length === 2) {
                          const [lat, lng] = coords;
                          const yandexMapUrl = `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;
                          const yandexTaxiUrl = `https://3.redirect.appmetrica.yandex.com/route?end-lat=${lat}&end-lon=${lng}&appmetrica_tracking_id=1178268795219780156`;

                          return (
                            <div className="mt-2">
                              {/* Embedded map */}
                              <div className="rounded overflow-hidden mb-2" style={{ border: '1px solid #ddd' }}>
                                <iframe
                                  title="delivery-map"
                                  src={`https://yandex.ru/map-widget/v1/?pt=${lng},${lat}&z=16&l=map`}
                                  width="100%"
                                  height="180"
                                  frameBorder="0"
                                />
                              </div>

                              {/* Action buttons */}
                              <div className="order-map-actions d-flex gap-2 flex-wrap">
                                <a
                                  href={yandexMapUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm order-map-btn"
                                >
                                  🗺 Яндекс.Карты
                                </a>
                                <a
                                  href={yandexTaxiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm order-map-btn"
                                >
                                  🚕 Яндекс Go
                                </a>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {selectedOrder.comment && (
                      <div className="order-meta-item order-meta-item-wide">
                        <span className="order-meta-label">Комментарий клиента</span>
                        <div className="order-meta-note">{selectedOrder.comment}</div>
                      </div>
                    )}

                    <div className="order-meta-item order-meta-item-wide">
                      <span className="order-meta-label">{language === 'uz' ? 'Mijoz baholari' : 'Оценки клиента'}</span>
                      <div className="order-meta-note" style={{ background: '#f8fafc' }}>
                        <div className="order-rating-row mb-1">
                          <span className="order-rating-label">{language === 'uz' ? 'Servis' : 'Сервис'}</span>
                          <span className="order-rating-stars">
                            {buildOrderRatingStars(selectedOrder.service_rating || 0)}
                          </span>
                        </div>
                        {Number(selectedOrder.service_rating || 0) > 0 && Number(selectedOrder.service_rating || 0) <= 2 && selectedOrder.service_rating_reason && (
                          <div className="small text-muted mb-2">
                            <strong>{language === 'uz' ? 'Sabab (servis):' : 'Причина (сервис):'}</strong> {selectedOrder.service_rating_reason}
                          </div>
                        )}
                        <div className="order-rating-row">
                          <span className="order-rating-label">{language === 'uz' ? 'Yetkazib berish' : 'Доставка'}</span>
                          <span className="order-rating-stars">
                            {buildOrderRatingStars(selectedOrder.delivery_rating || 0)}
                          </span>
                        </div>
                        {Number(selectedOrder.delivery_rating || 0) > 0 && Number(selectedOrder.delivery_rating || 0) <= 2 && selectedOrder.delivery_rating_reason && (
                          <div className="small text-muted mt-2">
                            <strong>{language === 'uz' ? 'Sabab (yetkazib berish):' : 'Причина (доставка):'}</strong> {selectedOrder.delivery_rating_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Status Stepper */}
                <div className="order-status-section mb-2">
                  <strong className="d-block mb-2">Статус заказа:</strong>
                  {(() => {
                    const statuses = [
                      { key: 'new', label: 'Принято', shortLabel: 'Принято', num: 1 },
                      { key: 'preparing', label: 'Готовится', shortLabel: 'Готовится', num: 2 },
                      { key: 'delivering', label: 'Доставляется', shortLabel: 'В пути', num: 3 },
                      { key: 'delivered', label: 'Доставлен', shortLabel: 'Доставлен', num: 4 }
                    ];
                    const currentStatus = selectedOrder.status;
                    const isCancelled = currentStatus === 'cancelled';
                    const currentIdx = statuses.findIndex(s => s.key === currentStatus);
                    const cancelledAtIdx = isCancelled ?
                      (selectedOrder.cancelled_at_status ?
                        statuses.findIndex(s => s.key === selectedOrder.cancelled_at_status) : 0) : -1;

                    const segmentPercent = statuses.length > 1 ? 100 / (statuses.length - 1) : 100;
                    const rawProgressIdx = isCancelled ? Math.max(cancelledAtIdx, 0) : Math.max(currentIdx, 0);
                    const progressPercent = Math.min(100, rawProgressIdx * segmentPercent);

                    return (
                      <div className="order-status-card">
                        <div className="order-stepper" style={{ '--step-count': statuses.length }}>
                          <div className="stepper-line-container">
                            <div className="stepper-line-bg"></div>
                            <div
                              className={`stepper-line-progress ${isCancelled ? 'cancelled' : ''}`}
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>

                          {statuses.map((status, idx) => {
                            const isCompleted = !isCancelled && currentIdx > idx;
                            const isActive = !isCancelled && currentIdx === idx;
                            const isCancelledStep = isCancelled && cancelledAtIdx === idx;
                            const isPastCancelled = isCancelled && idx < cancelledAtIdx;
                            const isAcceptedStep = status.key === 'new' && (isActive || isCompleted || isPastCancelled);
                            const stepValue = isCancelledStep ? '✕' : (isAcceptedStep ? 'OK' : status.num);

                            let stepClass = 'stepper-step';
                            if (isCompleted || isPastCancelled) stepClass += ' completed';
                            if (isActive) stepClass += ' active';
                            if (isCancelledStep) stepClass += ' cancelled active';

                            return (
                              <div
                                key={status.key}
                                className={stepClass}
                                data-step={status.num}
                              >
                                <div
                                  className={`stepper-circle ${isAcceptedStep ? 'stepper-circle-ok' : ''}`}
                                  onClick={() => {
                                    if (!isCancelled && currentStatus !== status.key) {
                                      updateOrderStatus(selectedOrder.id, status.key);
                                    }
                                  }}
                                  title={`Изменить на: ${status.label}`}
                                >
                                  {stepValue}
                                </div>
                                <div className="stepper-label">
                                  {isCancelledStep ? 'Отменён' : status.shortLabel}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Cancel reason */}
                        {isCancelled && selectedOrder.cancel_reason && (
                          <div className="cancel-reason-box">
                            <strong>Причина отмены:</strong>
                            {selectedOrder.cancel_reason}
                          </div>
                        )}

                        {Boolean(restaurantSettings?.is_operator_delivery_later_enabled) && !isCancelled && currentStatus !== 'delivered' && (
                          <div className="mt-3 d-grid">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => openDeliveryLaterModal(selectedOrder)}
                            >
                              📅 Доставить позже
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Admin comment (rejection reason) */}
                {selectedOrder.admin_comment && (
                  <div className="mb-2 p-2 bg-light rounded">
                    <strong>Причина отмены:</strong> {selectedOrder.admin_comment}
                  </div>
                )}
                </div>
                  </Col>
                  <Col lg={6} md={12}>
                  <div className="order-items-side">
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="mb-0 d-flex flex-column order-items-content">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <strong>Товары:</strong>
                      <div className="d-flex align-items-center gap-2">
                        {selectedOrder && (
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            className="d-inline-flex align-items-center gap-1"
                            onClick={async () => {
                              try {
                                await axios.post(`${API_URL}/admin/orders/${selectedOrder.id}/print`);
                                alert('Отправлено на печать!');
                              } catch (error) {
                                alert('Ошибка печати');
                              }
                            }}
                          >
                            <Printer size={15} aria-hidden="true" />
                            <span>Распечатать чек</span>
                          </Button>
                        )}
                        {!isEditingItems ? (
                          <Button variant="outline-primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={startEditingItems}>
                            <Pencil size={15} aria-hidden="true" />
                            <span>Редактировать</span>
                          </Button>
                        ) : (
                          <div className="d-flex gap-2">
                            <Button variant="success" size="sm" onClick={saveEditedItems} disabled={savingItems}>
                              {savingItems ? '...' : '💾 Сохранить'}
                            </Button>
                            <Button variant="outline-secondary" size="sm" onClick={cancelEditingItems}>
                              Отмена
                            </Button>
                          </div>
                        )}
                        </div>
                    </div>

                    {!isEditingItems ? (
                      <>
                        <div className="order-items-stack mt-2">
                          {selectedOrder.items.map((item, idx) => {
                            const imageUrl = resolveOrderItemImageUrl(item);
                            const lineTotal = parseFloat(item.total || (item.quantity * item.price) || 0);

                            return (
                              <div key={`${item.product_name}-${idx}`} className="order-item-line">
                                <div className="order-item-number">{idx + 1}</div>
                                <div className="order-item-photo">
                                  {imageUrl ? (
                                    <img
                                      src={imageUrl}
                                      alt={item.product_name}
                                      onError={(e) => {
                                        if (e.currentTarget.src !== PRODUCT_PLACEHOLDER_IMAGE) {
                                          e.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                                        }
                                      }}
                                    />
                                  ) : (
                                    <img src={PRODUCT_PLACEHOLDER_IMAGE} alt="placeholder" />
                                  )}
                                </div>
                                <div className="order-item-content">
                                  <div className="order-item-title">{item.product_name}</div>
                                  <div className="order-item-caption">{item.quantity} {item.unit || 'шт'} x {formatPrice(item.price)} {t('sum')}</div>
                                </div>
                                <div className="order-item-total">{formatPrice(lineTotal)} {t('sum')}</div>
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const breakdown = calculateOrderCostBreakdown(
                            selectedOrder,
                            selectedOrder.items || [],
                            productsById
                          );
                          return (
                            <div className="order-items-total">
                              <div className="order-items-total-row">
                                <span className="order-items-total-label">Товары</span>
                                <span className="order-items-total-value">{formatPrice(breakdown.itemsSubtotal)} {t('sum')}</span>
                              </div>
                              {breakdown.containersTotal > 0 && (
                                <div className="order-items-total-row">
                                  <span className="order-items-total-label">Фасовка</span>
                                  <span className="order-items-total-value">{formatPrice(breakdown.containersTotal)} {t('sum')}</span>
                                </div>
                              )}
                              {breakdown.serviceFee > 0 && (
                                <div className="order-items-total-row">
                                  <span className="order-items-total-label">Сервис</span>
                                  <span className="order-items-total-value">{formatPrice(breakdown.serviceFee)} {t('sum')}</span>
                                </div>
                              )}
                              {(breakdown.deliveryCost > 0 || breakdown.deliveryDistanceKm > 0) && (
                                <div className="order-items-total-row">
                                  <span className="order-items-total-label">Доставка{breakdown.deliveryDistanceKm > 0 ? ` (${breakdown.deliveryDistanceKm} км)` : ''}</span>
                                  <span className="order-items-total-value">{formatPrice(breakdown.deliveryCost)} {t('sum')}</span>
                                </div>
                              )}
                              <div className="order-items-total-row is-total">
                                <span className="order-items-total-label">Итого</span>
                                <strong className="order-items-total-value">{formatPrice(breakdown.total)} {t('sum')}</strong>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                        <Table className="mt-2 order-edit-items-table" size="sm">
                          <thead>
                            <tr>
                              <th className="order-edit-col-product">Товар</th>
                              <th className="order-edit-col-qty">Кол-во</th>
                              <th className="order-edit-col-price">Цена</th>
                              <th className="order-edit-col-sum">Сумма</th>
                              <th className="order-edit-col-remove"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {editingItems.map((item, idx) => {
                              const editImageUrl = resolveOrderItemImageUrl(item) || PRODUCT_PLACEHOLDER_IMAGE;
                              return (
                              <tr key={idx}>
                                <td className="order-edit-col-product">
                                  <div className="order-edit-product-cell">
                                    <img
                                      src={editImageUrl}
                                      alt={item.product_name}
                                      className="order-edit-product-thumb"
                                      onError={(e) => {
                                        if (e.currentTarget.src !== PRODUCT_PLACEHOLDER_IMAGE) {
                                          e.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                                        }
                                      }}
                                    />
                                    <span>{item.product_name}</span>
                                  </div>
                                </td>
                                <td className="order-edit-col-qty">
                                  <div className="d-flex align-items-center gap-1">
                                    <Button variant="outline-secondary" size="sm" onClick={() => updateItemQuantity(idx, -1)}>-</Button>
                                    <span className="mx-1">{item.quantity}</span>
                                    <Button variant="outline-secondary" size="sm" onClick={() => updateItemQuantity(idx, 1)}>+</Button>
                                  </div>
                                </td>
                                <td className="order-edit-col-price">{formatPrice(item.price)}</td>
                                <td className="order-edit-col-sum">{formatPrice(item.quantity * item.price)}</td>
                                <td className="order-edit-col-remove">
                                  <Button variant="outline-danger" size="sm" onClick={() => removeItem(idx)}>X</Button>
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </Table>

                      <div className="d-flex justify-content-between align-items-center mt-2 gap-2">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => {
                            setOrderItemSearch('');
                            setShowAddOrderItemModal(true);
                          }}
                        >
                          + Добавить товар
                        </Button>
                        <span className="small text-muted">Позиций: {editingItems.length}</span>
                      </div>

                      {(() => {
                        const breakdown = calculateOrderCostBreakdown(
                          { ...selectedOrder, total_amount: null },
                          editingItems,
                          productsById,
                          { useOrderTotal: false }
                        );
                        return (
                          <div className="mt-2 text-end">
                            <div className="small text-muted">Товары: {formatPrice(breakdown.itemsSubtotal)} {t('sum')}</div>
                            {breakdown.containersTotal > 0 && <div className="small text-muted">Фасовка: {formatPrice(breakdown.containersTotal)} {t('sum')}</div>}
                            {breakdown.serviceFee > 0 && <div className="small text-muted">Сервис: {formatPrice(breakdown.serviceFee)} {t('sum')}</div>}
                            {(breakdown.deliveryCost > 0 || breakdown.deliveryDistanceKm > 0) && (
                              <div className="small text-muted">
                                Доставка: {formatPrice(breakdown.deliveryCost)} {t('sum')}{breakdown.deliveryDistanceKm > 0 ? ` (${breakdown.deliveryDistanceKm} км)` : ''}
                              </div>
                            )}
                            <strong>Новая сумма: {formatPrice(breakdown.total)} {t('sum')}</strong>
                          </div>
                        );
                      })()}
                      </>
                    )}
                  </div>
                )}
                </div>
              </Col>
              <Col lg={2} md={12}>
                <div className="order-history-side">
                  <div className="order-status-history-card h-100 mb-0">
                    <strong className="d-block mb-2">История нажатий:</strong>
                    {Array.isArray(selectedOrder.status_actions) && selectedOrder.status_actions.length > 0 ? (
                      <div className="order-status-history-list">
                        {selectedOrder.status_actions.map((action, index) => (
                          <div
                            key={`${action.id || 'action'}-${index}`}
                            className="order-status-history-item"
                          >
                            <div className="order-status-history-main">
                              <span className="order-status-history-status">{getOrderStatusActionLabel(action.status)}</span>
                              <span className="order-status-history-actor">{action.actor_name || 'Неизвестно'}</span>
                            </div>
                            <div className="order-status-history-time">{formatOrderStatusActionTime(action.created_at)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="order-status-history-empty">Действий по статусам пока нет.</div>
                    )}
                  </div>
                </div>
              </Col>
                </Row>
                  </>
                  );
                })()}
              </>
            )}
          </Modal.Body>
        </Modal>

        <Modal
          show={showAddOrderItemModal}
          onHide={() => setShowAddOrderItemModal(false)}
          size="lg"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Добавить товар в заказ</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Control
              type="text"
              placeholder="Поиск товара..."
              value={orderItemSearch}
              onChange={(e) => setOrderItemSearch(e.target.value)}
            />

            <div className="order-add-product-list mt-3">
              {filteredProductsForOrderEdit.length > 0 ? (
                filteredProductsForOrderEdit.map((product) => {
                  const productImageUrl = product?.image_url ? toAbsoluteFileUrl(product.image_url) : PRODUCT_PLACEHOLDER_IMAGE;
                  const isOutOfStock = product?.in_stock === false;
                  return (
                    <button
                      key={`add-order-item-${product.id}`}
                      type="button"
                      className={`order-add-product-item ${isOutOfStock ? 'is-disabled' : ''}`}
                      disabled={isOutOfStock}
                      onClick={() => {
                        addProductToOrder(product);
                        setShowAddOrderItemModal(false);
                        setOrderItemSearch('');
                      }}
                    >
                      <img
                        src={productImageUrl}
                        alt={product.name_ru}
                        className="order-add-product-thumb"
                        onError={(e) => {
                          if (e.currentTarget.src !== PRODUCT_PLACEHOLDER_IMAGE) {
                            e.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                          }
                        }}
                      />
                      <div className="order-add-product-content">
                        <div className="order-add-product-name">{product.name_ru}</div>
                        <div className="order-add-product-price">{formatPrice(product.price)} {t('sum')}</div>
                      </div>
                      {isOutOfStock && <span className="order-add-product-stock">Нет в наличии</span>}
                    </button>
                  );
                })
              ) : (
                <div className="text-muted small py-3">Ничего не найдено.</div>
              )}
            </div>
          </Modal.Body>
        </Modal>

        <Modal
          show={showDeliveryLaterModal}
          onHide={() => {
            if (savingDeliveryLater) return;
            setShowDeliveryLaterModal(false);
            setDeliveryLaterDate('');
          }}
          centered
        >
          <Modal.Header closeButton={!savingDeliveryLater}>
            <Modal.Title>Доставить позже</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group>
              <Form.Label>Дата доставки</Form.Label>
              <Form.Control
                type="date"
                value={deliveryLaterDate}
                min={shiftDateKeyByDays(getTodayDateKey(), 1) || getTodayDateKey()}
                onChange={(e) => setDeliveryLaterDate(String(e.target.value || '').trim())}
                disabled={savingDeliveryLater}
              />
              <Form.Text className="text-muted">
                Клиент получит сообщение в Telegram-боте с новой датой доставки.
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeliveryLaterModal(false);
                setDeliveryLaterDate('');
              }}
              disabled={savingDeliveryLater}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={saveDeliveryLaterDate}
              disabled={savingDeliveryLater}
            >
              {savingDeliveryLater ? 'Сохранение...' : 'Сохранить дату'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Balance Modal */}
        <Modal
          show={showBalanceModal}
          onHide={() => setShowBalanceModal(false)}
          centered
          fullscreen="sm-down"
          dialogClassName="admin-balance-modal-compact"
          className="admin-modal admin-balance-modal-redesign"
        >
          <Modal.Header closeButton className="border-0 admin-balance-modal-header">
            <Modal.Title className="d-flex align-items-center gap-3">
              <span className="fs-4">💰</span>
              <div>
                <h5 className="mb-0">{t('accountBalance')}</h5>
                <p className="mb-0 small opacity-75">{user?.active_restaurant_name}</p>
              </div>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-0">
            {/* Balance Overview */}
            <div className="bg-light p-3 border-bottom">
              {billingInfo.restaurant?.is_free_tier && (
                <Badge bg="success" className="px-2 py-1 mb-2">⭐ {t('freeTier')}</Badge>
              )}
              <Row className="g-2">
                <Col md={4}>
                  <div className="bg-white rounded-3 border p-2 h-100 admin-balance-metric-card">
                    <div className="text-muted small mb-1 admin-balance-metric-label">
                      {language === 'uz' ? 'Balans' : 'Баланс'}
                    </div>
                    <div className="text-primary fs-5 admin-balance-metric-value">
                      {formatPrice(user?.balance || 0)} <span className="small">{activeRestaurantCurrencyLabel}</span>
                    </div>
                    <div className="text-muted small mt-1">{language === 'uz' ? 'Summa' : 'Сумма'}</div>
                  </div>
                </Col>
                <Col md={4}>
                  <div className="bg-white rounded-3 border p-2 h-100 admin-balance-metric-card">
                    <div className="text-muted small mb-1 admin-balance-metric-label">
                      {checksAvailableLabel}
                    </div>
                    <div className="text-primary fs-5 admin-balance-metric-value">
                      {formatChecksCount(balanceChecksCount)} <span className="small">{checksCountLabel}</span>
                    </div>
                    <div className="text-muted small mt-1">{language === 'uz' ? "Soni" : 'Кол-во'}</div>
                  </div>
                </Col>
                <Col md={4}>
                  <div className="bg-white rounded-3 border p-2 h-100 admin-balance-metric-card">
                    <div className="text-muted small mb-1 admin-balance-metric-label">
                      {language === 'uz' ? '1 chek narxi' : 'Стоимость чека'}
                    </div>
                    <div className="text-primary fs-5 admin-balance-metric-value">
                      {billingInfo.restaurant?.is_free_tier ? (
                        <span className="fs-6">{language === 'uz' ? 'Bepul' : 'Бесплатно'}</span>
                      ) : (
                        <>
                          {formatPrice(resolvedOrderCost)} <span className="small">{activeRestaurantCurrencyLabel}</span>
                        </>
                      )}
                    </div>
                    <div className="text-muted small mt-1">{language === 'uz' ? 'Summa' : 'Сумма'}</div>
                  </div>
                </Col>
              </Row>
              {!billingInfo.restaurant?.is_free_tier && (
                <div className="text-muted small mt-3">
                  {t('orderCost')}: {formatPrice(resolvedOrderCost)} {activeRestaurantCurrencyLabel}
                </div>
              )}
            </div>

            <div className="p-3 admin-balance-modal-content">
              {/* Navigation Tabs */}
              <div className="custom-modal-tabs admin-balance-tabs mb-3 p-1 bg-light rounded-3 d-flex flex-nowrap overflow-auto">
                <div
                  className={`flex-fill text-center py-2 px-3 cursor-pointer transition-all rounded-2 admin-balance-tab-item ${balanceTab === 'data' ? 'bg-white shadow-sm text-primary' : 'text-muted'}`}
                  onClick={() => setBalanceTab('data')}
                  style={{ cursor: 'pointer' }}
                >
                  {t('paymentInfo')}
                </div>
                <div
                  className={`flex-fill text-center py-2 px-3 cursor-pointer transition-all rounded-2 admin-balance-tab-item ${balanceTab === 'incomes' ? 'bg-white shadow-sm text-primary' : 'text-muted'}`}
                  onClick={() => {
                    setBalanceTab('incomes');
                    fetchBillingHistory('deposit');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {t('incomes')}
                </div>
                <div
                  className={`flex-fill text-center py-2 px-3 cursor-pointer transition-all rounded-2 admin-balance-tab-item ${balanceTab === 'expenses' ? 'bg-white shadow-sm text-primary' : 'text-muted'}`}
                  onClick={() => {
                    setBalanceTab('expenses');
                    fetchBillingHistory('withdrawal');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {t('expenses')}
                </div>
              </div>

              {balanceTab === 'data' && (
                <div className="animate-fade-in">
                  <Row className="g-3">
                    <Col md={6}>
                      <div className="p-3 rounded-3 bg-white border border-light shadow-sm h-100 admin-balance-info-card">
                        <div className="d-flex align-items-center gap-2 mb-3">
                          <span className="fs-5">💳</span>
                          <h6 className="mb-0 small admin-balance-info-title">{t('bankCard')}</h6>
                        </div>

                        <div className="mb-3">
                          <label className="text-muted extra-small mb-2 d-block admin-balance-info-label">{t('cardNumber')}</label>
                          <div className="d-flex align-items-center justify-content-between p-2 bg-light rounded-3 border">
                            <span className="fs-6 font-monospace admin-balance-info-value">{formatCardNumberMasked(billingInfo.requisites?.card_number) || '—'}</span>
                            {billingInfo.requisites?.card_number && (
                              <Button
                                variant="link"
                                className="p-1 text-primary text-decoration-none"
                                onClick={() => {
                                  navigator.clipboard.writeText(billingInfo.requisites.card_number);
                                  setSuccess('Скопировано');
                                }}
                                title="Копировать"
                              >
                                <CopyIcon />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="text-muted extra-small mb-1 d-block admin-balance-info-label">{t('cardHolder')}</label>
                          <div className="admin-balance-info-value">{billingInfo.requisites?.card_holder || '—'}</div>
                        </div>

                        <div>
                          <label className="text-muted extra-small mb-1 d-block admin-balance-info-label">{t('phoneNumber')}</label>
                          <div className="admin-balance-info-value">{billingInfo.requisites?.phone_number || '—'}</div>
                        </div>
                      </div>
                    </Col>

                    <Col md={6}>
                      <div className="p-3 rounded-3 bg-white border border-light shadow-sm h-100 admin-balance-info-card">
                        <div className="d-flex align-items-center gap-2 mb-3">
                          <span className="fs-5">💬</span>
                          <h6 className="mb-0 small admin-balance-info-title">{t('supportTitle')}</h6>
                        </div>

                        <div className="mb-3">
                          <label className="text-muted extra-small mb-2 d-block admin-balance-info-label">Telegram</label>
                          <div className="p-2 bg-light rounded-3 border">
                            {billingInfo.requisites?.telegram_username ? (
                              <a
                                href={`https://t.me/${billingInfo.requisites.telegram_username.replace('@', '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-info text-decoration-none d-flex align-items-center gap-2 admin-balance-telegram-link"
                              >
                                <span>@{billingInfo.requisites.telegram_username.replace('@', '')}</span>
                                <span className="small">↗️</span>
                              </a>
                            ) : <span className="text-muted">—</span>}
                          </div>
                        </div>

                        <div className="d-flex flex-column gap-2">
                          <div className="p-2 bg-light rounded-3 border d-flex align-items-center justify-content-between gap-2">
                            <div className="min-w-0">
                              <div className="mb-2">
                                <img
                                  src="/click.png"
                                  alt="Click"
                                  style={{ height: 22, width: 'auto', display: 'block' }}
                                />
                              </div>
                              {clickPaymentLink ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="px-2 py-1"
                                    href={clickPaymentLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ backgroundColor: '#00BAE0', border: 'none', color: '#fff' }}
                                  >
                                    {language === 'uz' ? "To'lash" : 'Оплатить'}
                                  </Button>
                                </>
                              ) : (
                                <span className="small text-muted">{language === 'uz' ? "Havola yo'q" : 'Ссылка не указана'}</span>
                              )}
                            </div>
                            <div
                              style={{
                                width: 72,
                                height: 72,
                                borderRadius: 8,
                                border: '1px dashed #d1d5db',
                                background: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                flexShrink: 0
                              }}
                            >
                              {clickPaymentLink ? (
                                <img src={getQrCodeUrl(clickPaymentLink)} alt="Click QR" width="72" height="72" />
                              ) : (
                                <span className="small text-muted">QR</span>
                              )}
                            </div>
                          </div>

                          <div className="p-2 bg-light rounded-3 border d-flex align-items-center justify-content-between gap-2">
                            <div className="min-w-0">
                              <div className="mb-2">
                                <img
                                  src="/payme.png"
                                  alt="Payme"
                                  style={{ height: 22, width: 'auto', display: 'block' }}
                                />
                              </div>
                              {paymePaymentLink ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="px-2 py-1"
                                    href={paymePaymentLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ backgroundColor: '#3d7ea6', border: 'none', color: '#fff' }}
                                  >
                                    {language === 'uz' ? "To'lash" : 'Оплатить'}
                                  </Button>
                                </>
                              ) : (
                                <span className="small text-muted">{language === 'uz' ? "Havola yo'q" : 'Ссылка не указана'}</span>
                              )}
                            </div>
                            <div
                              style={{
                                width: 72,
                                height: 72,
                                borderRadius: 8,
                                border: '1px dashed #d1d5db',
                                background: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                flexShrink: 0
                              }}
                            >
                              {paymePaymentLink ? (
                                <img src={getQrCodeUrl(paymePaymentLink)} alt="Payme QR" width="72" height="72" />
                              ) : (
                                <span className="small text-muted">QR</span>
                              )}
              </div>
            </div>
          </div>

        </div>
                    </Col>
                  </Row>

                  <div className="admin-balance-hint mt-3 p-2 rounded-3 d-flex gap-2 align-items-center">
                    <div className="fs-5">ℹ️</div>
                    <div className="small lh-sm">
                      {t('topupInstruction')}
                    </div>
                  </div>
                </div>
              )}

              {(balanceTab === 'incomes' || balanceTab === 'expenses') && (
                <div className="admin-table-container rounded-4 border shadow-sm animate-fade-in admin-balance-history-scroll">
                  <Table responsive hover className="admin-table mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th className="py-3 px-4 small fw-bold text-muted text-uppercase">{t('dateAndTime')}</th>
                        <th className="py-3 px-4 small fw-bold text-muted text-uppercase">{t('description')}</th>
                        <th className="py-3 px-4 small fw-bold text-muted text-uppercase text-end">{t('amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingBilling ? (
                        <tr>
                          <td colSpan="3" className="py-3">
                            <ListSkeleton count={3} label="Загрузка биллинга" />
                          </td>
                        </tr>
                      ) : billingHistory.length > 0 ? (
                        billingHistory.map(item => (
                          <tr key={item.id}>
                            <td className="py-3 px-4 vertical-align-middle">
                              <div className="fw-bold text-dark">{new Date(item.created_at).toLocaleDateString()}</div>
                              <div className="extra-small text-muted">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td className="py-3 px-4 vertical-align-middle fw-medium">{item.description}</td>
                            <td className={`py-3 px-4 vertical-align-middle text-end fw-bold fs-6 ${item.amount > 0 ? 'text-success' : 'text-danger'}`}>
                              {item.amount > 0 ? '+' : ''}{formatPrice(item.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="3" className="text-center py-5 text-muted fw-medium">{t('noData')}</td></tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          </Modal.Body>
        <Modal.Footer className="border-top p-3">
          <Button variant="light" className="admin-balance-close-btn px-4 rounded-3 border" onClick={() => setShowBalanceModal(false)}>{t('close')}</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showAnalyticsMapModal}
        onHide={() => setShowAnalyticsMapModal(false)}
        fullscreen
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>🗺️ {t('orderGeography')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <div style={{ width: '100%', height: 'calc(100vh - 64px)', background: '#f8fafc' }}>
            <Row className="g-0 h-100">
              <Col xs={7} sm={8} lg={9} className="h-100">
                {isYandexMapProvider ? (
                  <YandexAnalyticsMap
                    points={activeAnalyticsLocationsList}
                    shopPoint={analyticsShopLocation}
                    selectedPoint={analyticsMapSelectionLocked ? selectedAnalyticsLocation : null}
                    onSelectPoint={openAnalyticsLocationDetails}
                    onLoadError={handleYandexAnalyticsMapLoadError}
                    height="100%"
                  />
                ) : (
                  <MapContainer
                    center={ANALYTICS_DEFAULT_MAP_CENTER}
                    zoom={ANALYTICS_DEFAULT_MAP_ZOOM}
                    style={{ height: '100%', width: '100%', filter: 'saturate(0.9) contrast(1.03)' }}
                  >
                    <TileLayer
                      url={mapTileLayerConfig.url}
                      attribution={mapTileLayerConfig.attribution}
                      maxZoom={mapTileLayerConfig.maxZoom}
                    />
                    <AnalyticsMapResizeFix />
                    <AnalyticsMapAutoBounds points={activeAnalyticsLocationsList} />
                    <AnalyticsMapFocus selectedPoint={analyticsMapSelectionLocked ? selectedAnalyticsLocation : null} />
                    {activeAnalyticsLocationsList.map((location) => (
                      (() => {
                        const isSelected = selectedAnalyticsLocation &&
                          (selectedAnalyticsLocation.orderId === location.orderId);
                        return (
                          <Marker
                            key={`analytics-map-full-${location.orderId || location.orderNumber}`}
                            position={[location.lat, location.lng]}
                            icon={getAnalyticsPointIcon(isSelected)}
                            zIndexOffset={isSelected ? 1000 : 0}
                            eventHandlers={{
                              click: () => openAnalyticsLocationDetails(location)
                            }}
                          />
                        );
                      })()
                    ))}
                    {analyticsShopLocation && (
                      <Marker
                        position={[analyticsShopLocation.lat, analyticsShopLocation.lng]}
                        icon={getAnalyticsShopIcon()}
                        zIndexOffset={1300}
                      />
                    )}
                  </MapContainer>
                )}
              </Col>
              <Col xs={5} sm={4} lg={3} className="h-100 border-start bg-white">
                <div className="p-2 p-sm-3 h-100 admin-custom-scrollbar" style={{ overflowY: 'auto' }}>
                  <div className="small text-uppercase text-muted fw-semibold mb-2">
                    {t('clients') || 'Клиенты'}
                  </div>
                  <div className="d-grid gap-2">
                    {activeAnalyticsLocationsList.length > 0 ? activeAnalyticsLocationsList.map((location) => {
                      const locationKey = getAnalyticsLocationKey(location);
                      const isSelected = selectedAnalyticsLocation &&
                        (selectedAnalyticsLocation.orderId === location.orderId);
                      return (
                        <button
                          type="button"
                          key={`analytics-full-list-${location.orderId || location.orderNumber}`}
                          ref={(el) => {
                            if (!locationKey) return;
                            if (el) analyticsFullscreenListItemRefs.current.set(locationKey, el);
                            else analyticsFullscreenListItemRefs.current.delete(locationKey);
                          }}
                          onClick={() => openAnalyticsLocationDetails(location)}
                          className={`btn text-start admin-analytics-map-list-item${isSelected ? ' is-active' : ''}`}
                          style={{
                            border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`,
                            background: isSelected ? '#eff6ff' : '#ffffff'
                          }}
                        >
                          <div className="fw-semibold">{location.customerName || 'Клиент'}</div>
                          <div className="small text-muted">{location.customerPhone || '—'}</div>
                          <div className="small mt-1">№{location.orderNumber} · {formatPrice(location.totalAmount)} {t('sum')}</div>
                        </button>
                      );
                    }) : (
                      <div className="text-muted small py-2">{t('noDataForPeriod')}</div>
                    )}
                  </div>

                  {selectedAnalyticsLocation && (
                    <div className="mt-3 p-2 p-sm-3 rounded-3 border" style={{ background: '#f8fafc' }}>
                      <div className="small fw-semibold mb-2">{t('client') || 'Клиент'}</div>
                      <div className="small text-truncate"><strong>{language === 'uz' ? 'Buyurtma' : 'Заказ'}:</strong> №{selectedAnalyticsLocation.orderNumber || '—'}</div>
                      <div className="small text-truncate"><strong>{t('amount')}:</strong> {formatPrice(selectedAnalyticsLocation.totalAmount || 0)} {t('sum')}</div>
                      <div className="small text-truncate"><strong>{t('date')}:</strong> {selectedAnalyticsLocation.createdAt ? new Date(selectedAnalyticsLocation.createdAt).toLocaleString('ru-RU') : '—'}</div>
                      <div className="small"><strong>{language === 'uz' ? 'Manzil' : 'Адрес'}:</strong> {selectedAnalyticsLocation.deliveryAddress || '—'}</div>
                    </div>
                  )}
                </div>
              </Col>
            </Row>
          </div>
        </Modal.Body>
      </Modal>

        <Modal
          show={showGlobalImportModal}
          onHide={closeGlobalImportModal}
          size="xl"
          centered
          className="admin-global-import-modal"
          dialogClassName="admin-global-import-modal-dialog"
        >
          <Modal.Header closeButton className="admin-global-import-modal-header">
            <Modal.Title className="sa-global-products-modal-title h6 mb-0">
              {language === 'uz' ? "Global mahsulotni do'konga qo'shish" : 'Добавить глобальный товар в магазин'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="admin-global-import-modal-body">
            <Row className="g-2 align-items-stretch admin-global-import-layout">
              <Col className="admin-global-import-col admin-global-import-col-left">
                <div className="admin-global-import-panel">
                  <div className="admin-global-import-panel-head">
                    <strong>{language === 'uz' ? "Global mahsulotlar" : 'Глобальные товары'}</strong>
                    <span className="small text-muted">
                      {globalCatalogProducts.filter((entry) => !globalImportItemIdsSet.has(Number(entry.id))).length}
                    </span>
                  </div>
                  <Row className="g-2 mb-3 admin-global-import-search-row">
                    <Col xs={12} md={7}>
                      <Form.Control
                        type="search"
                        value={globalImportSearch}
                        onChange={(e) => setGlobalImportSearch(e.target.value)}
                        placeholder={language === 'uz' ? "Nomi bo'yicha qidirish" : 'Поиск по названию'}
                      />
                    </Col>
                    <Col xs={12} md={5}>
                      <Form.Control
                        value={globalImportBarcodeSearch}
                        onChange={(e) => setGlobalImportBarcodeSearch(String(e.target.value || '').replace(/\D/g, '').slice(0, 120))}
                        placeholder={language === 'uz' ? 'Shtrix-kod bo‘yicha qidirish' : 'Поиск по штрихкоду'}
                        inputMode="numeric"
                      />
                    </Col>
                  </Row>
                  <div className="admin-global-import-list">
                    {globalCatalogLoading ? (
                      <div className="text-muted small py-3 text-center admin-global-import-empty-hint">
                        {language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
                      </div>
                    ) : globalCatalogProducts.filter((entry) => !globalImportItemIdsSet.has(Number(entry.id))).length === 0 ? (
                      <div className="text-muted small py-3 text-center admin-global-import-empty-hint">
                        {language === 'uz' ? "Global mahsulotlar topilmadi" : 'Глобальные товары не найдены'}
                      </div>
                    ) : (
                      globalCatalogProducts
                        .filter((entry) => !globalImportItemIdsSet.has(Number(entry.id)))
                        .map((item) => {
                        const itemId = Number(item.id);
                        const isSelected = globalImportLeftSelectedIds.includes(itemId);
                        const imageUrl = item.thumb_url || item.image_url
                          ? toAbsoluteFileUrl(item.thumb_url || item.image_url)
                          : PRODUCT_PLACEHOLDER_IMAGE;
                        return (
                          <div
                            key={`global-catalog-item-${itemId}`}
                            className={`admin-global-import-list-item${isSelected ? ' is-selected' : ''}`}
                            onClick={() => toggleGlobalImportLeftSelection(itemId)}
                          >
                            <Form.Check
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleGlobalImportLeftSelection(itemId)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <img
                              src={imageUrl}
                              alt={item.name_ru || 'product'}
                              className="admin-global-import-thumb"
                              onError={(event) => {
                                if (event.currentTarget.src !== PRODUCT_PLACEHOLDER_IMAGE) {
                                  event.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                                }
                              }}
                            />
                            <div className="admin-global-import-list-content">
                              <div className="fw-semibold text-truncate">
                                {language === 'uz'
                                  ? (item.name_uz || item.name_ru || '-')
                                  : (item.name_ru || item.name_uz || '-')}
                              </div>
                              <div className="small text-muted">
                                {language === 'uz' ? 'Shtrix-kod' : 'Штрихкод'}: {item.barcode || '—'}
                              </div>
                              <div className="small text-muted text-truncate">
                                {language === 'uz' ? 'Tavsiya etilgan kategoriya' : 'Рекомендуемая категория'}:{' '}
                                {(language === 'uz'
                                  ? (item.recommended_category_name_uz || item.recommended_category_name_ru)
                                  : (item.recommended_category_name_ru || item.recommended_category_name_uz)) || '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </Col>

              <Col className="d-flex align-items-center justify-content-center py-1 admin-global-import-arrows-col">
                <div className="admin-global-import-arrows">
                  <Button
                    type="button"
                    variant="outline-primary"
                    onClick={moveSelectedGlobalProductsToRight}
                    disabled={!globalImportLeftSelectedIds.length}
                  >
                    →
                  </Button>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={moveSelectedGlobalProductsToLeft}
                    disabled={!globalImportRightSelectedIds.length}
                  >
                    ←
                  </Button>
                </div>
              </Col>

              <Col className="admin-global-import-col admin-global-import-col-right">
                <div className="admin-global-import-panel">
                  <div className="admin-global-import-panel-head">
                    <strong>{language === 'uz' ? "Qo'shiladiganlar" : 'К добавлению'}</strong>
                    <span className="small text-muted">{globalImportItems.length}</span>
                  </div>
                  <div className="admin-global-import-list admin-global-import-list-right">
                    {globalImportItems.length === 0 ? (
                      <div className="text-muted small py-3 text-center admin-global-import-empty-hint">
                        {language === 'uz'
                          ? "Hozircha tanlangan mahsulotlar yo'q"
                          : 'Пока нет выбранных товаров'}
                      </div>
                    ) : (
                      globalImportItems.map((item) => {
                        const itemId = Number(item.global_product_id);
                        const selectedOnRight = globalImportRightSelectedIds.includes(itemId);
                        const sourceImage = item.image_url ? toAbsoluteFileUrl(item.image_url) : PRODUCT_PLACEHOLDER_IMAGE;
                        const selectedCategoryId = String(item.category_id || '');
                        const selectedCategory = importCategoryById.get(selectedCategoryId);
                        return (
                          <div
                            key={`global-import-item-${itemId}`}
                            className={`admin-global-import-card${selectedOnRight ? ' is-selected' : ''}`}
                          >
                            <div className="admin-global-import-card-head">
                              <Form.Check
                                type="checkbox"
                                checked={selectedOnRight}
                                onChange={() => toggleGlobalImportRightSelection(itemId)}
                              />
                              <img
                                src={sourceImage}
                                alt={item.name_ru || 'selected-product'}
                                className="admin-global-import-thumb"
                                onError={(event) => {
                                  if (event.currentTarget.src !== PRODUCT_PLACEHOLDER_IMAGE) {
                                    event.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                                  }
                                }}
                              />
                              <div className="min-w-0">
                                <div className="fw-semibold text-truncate">
                                  {language === 'uz'
                                    ? (item.name_uz || item.name_ru || '-')
                                    : (item.name_ru || item.name_uz || '-')}
                                </div>
                                <div className="small text-muted">
                                  {language === 'uz' ? 'Shtrix-kod' : 'Штрихкод'}: {item.barcode || '—'}
                                </div>
                              </div>
                            </div>
                            <Row className="g-2 mt-1">
                              <Col md={5}>
                                <Form.Control
                                  className="admin-global-import-field"
                                  value={item.price}
                                  onChange={(e) => updateGlobalImportItem(itemId, 'price', String(e.target.value || '').replace(/[^\d.,]/g, '').slice(0, 20))}
                                  placeholder={language === 'uz' ? 'Narx *' : 'Цена *'}
                                  inputMode="decimal"
                                />
                              </Col>
                              <Col md={7}>
                                <Dropdown>
                                  <Dropdown.Toggle as={CustomToggle} className="form-select-sm admin-global-import-field">
                                    {selectedCategory?.path || (language === 'uz' ? 'Kategoriya tanlanmagan' : 'Категория не выбрана')}
                                  </Dropdown.Toggle>
                                  <Dropdown.Menu as={CustomMenu} className="admin-filter-dropdown-menu">
                                    <Dropdown.Item
                                      onClick={() => updateGlobalImportItem(itemId, 'category_id', '')}
                                      active={!selectedCategoryId}
                                    >
                                      {language === 'uz' ? 'Kategoriya tanlanmagan' : 'Категория не выбрана'}
                                    </Dropdown.Item>
                                    {importAssignableCategories.map((categoryOption) => (
                                      <Dropdown.Item
                                        key={`global-import-category-${categoryOption.id}`}
                                        onClick={() => updateGlobalImportItem(itemId, 'category_id', String(categoryOption.id))}
                                        active={selectedCategoryId === String(categoryOption.id)}
                                      >
                                        {categoryOption.path}
                                      </Dropdown.Item>
                                    ))}
                                  </Dropdown.Menu>
                                </Dropdown>
                              </Col>
                            </Row>
                            <div className="small text-muted mt-2">
                              {language === 'uz' ? 'Tavsiya:' : 'Рекомендация:'}{' '}
                              {selectedCategory?.path || (language === 'uz'
                                ? (item.recommended_category_name_uz || item.recommended_category_name_ru || '—')
                                : (item.recommended_category_name_ru || item.recommended_category_name_uz || '—'))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer className="admin-global-import-modal-footer">
            <Button variant="outline-secondary" onClick={closeGlobalImportModal} disabled={globalImportSaving}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="btn-primary-custom"
              onClick={submitGlobalProductImport}
              disabled={globalImportSaving || globalImportItems.length === 0}
            >
              {globalImportSaving
                ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                : (language === 'uz' ? "Do'konga qo'shish" : 'Добавить в магазин')}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Product Modal */}
        <Modal show={showProductModal} onHide={() => setShowProductModal(false)} size="xl" dialogClassName="admin-product-modal-dialog">
          <Modal.Header closeButton className="admin-product-modal-header">
            <Modal.Title>
              {selectedProduct ? t('editProduct') : t('addProduct')}
            </Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleProductSubmit}>
            <Modal.Body ref={productModalBodyRef}>
              {(() => {
                const getCategoryPathIds = (catId) => {
                  const path = [];
                  let currentId = catId;
                  while (currentId) {
                    const cat = categories.find(c => c.id === parseInt(currentId));
                    if (cat) {
                      path.unshift(cat.id);
                      currentId = cat.parent_id;
                    } else {
                      break;
                    }
                  }
                  return path;
                };
                const getLocalizedCategoryName = (category) => (
                  language === 'uz'
                    ? (category?.name_uz || category?.name_ru || '')
                    : (category?.name_ru || category?.name_uz || '')
                );

                const selectedPathIds = getCategoryPathIds(productForm.category_id);
                const dropdownsToRender = [];
                let currentLevelCategories = categories.filter(c => !c.parent_id);
                let level = 0;

                while (currentLevelCategories.length > 0) {
                  const selectedIdForThisLevel = selectedPathIds[level] || '';
                  const isRootLevel = level === 0;

                  const handleSelect = (newVal) => {
                    if (newVal) {
                      setProductForm({ ...productForm, category_id: newVal });
                    } else {
                      const parentId = level > 0 ? selectedPathIds[level - 1] : '';
                      setProductForm({ ...productForm, category_id: parentId.toString() });
                    }
                  };

                  const selectedCat = currentLevelCategories.find(c => c.id.toString() === selectedIdForThisLevel.toString());
                  const defaultLabel = isRootLevel ? t('selectCategory') : t('selectSubcategory');
                  const dropDownLabel = selectedCat ? getLocalizedCategoryName(selectedCat) : defaultLabel;

                  dropdownsToRender.push(
                    <Col md={6} key={`category-level-${level}`}>
                      <Form.Group className="mb-3">
                        <Form.Label>{isRootLevel ? t('categoryRequired') : `${t('subcategoryLevel')} ${level}`}</Form.Label>
                        <div className="d-flex align-items-center gap-2">
                          <Dropdown className="flex-grow-1">
                            <Dropdown.Toggle as={CustomToggle} id={`dropdown-category-level-${level}`}>
                              {dropDownLabel}
                            </Dropdown.Toggle>

                            <Dropdown.Menu as={CustomMenu}>
                              <Dropdown.Item onClick={() => handleSelect('')}>
                                {defaultLabel}
                              </Dropdown.Item>
                              {currentLevelCategories.map(cat => (
                                <Dropdown.Item
                                  key={cat.id}
                                  onClick={() => handleSelect(cat.id.toString())}
                                  active={selectedIdForThisLevel.toString() === cat.id.toString()}
                                >
                                  <span className="text-muted me-2 small">[{cat.sort_order !== null && cat.sort_order !== undefined ? cat.sort_order : '-'}]</span>
                                  {getLocalizedCategoryName(cat)}
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown>
                          {!isRootLevel && selectedIdForThisLevel && (
                            <Button
                              variant="outline-secondary"
                              type="button"
                              className="admin-product-clear-category-btn"
                              title="Снять выбор субкатегории"
                              aria-label="Снять выбор субкатегории"
                              onClick={() => handleSelect('')}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                        {/* Hidden input to ensure HTML5 validation still catches required field */}
                        {isRootLevel && (
                          <input
                            type="text"
                            style={{ display: 'none' }}
                            required
                            value={selectedIdForThisLevel}
                            onChange={() => { }}
                          />
                        )}
                      </Form.Group>
                    </Col>
                  );

                  if (selectedIdForThisLevel) {
                    currentLevelCategories = categories.filter(c => c.parent_id === parseInt(selectedIdForThisLevel));
                    level++;
                  } else {
                    break;
                  }
                }

                return <Row>{dropdownsToRender}</Row>;
              })()}
              {isTopLevelCategorySelection(productForm.category_id) && (
                <Alert variant="warning" className="py-2 px-3 small">
                  В категорию 1-го уровня товар добавлять нельзя. Выберите субкатегорию.
                </Alert>
              )}

              <div className="small text-muted mb-2">
                {language === 'uz'
                  ? "Kamida bitta nom maydoni to'ldirilishi kerak: RU yoki UZ."
                  : 'Обязательно заполните хотя бы одно название: RU или UZ.'}
              </div>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="d-flex align-items-center gap-2">
                      <span>{language === 'uz' ? 'Nomi (RU)' : 'Название (RU)'}</span>
                      <span className="admin-lang-flag-icon"><RussiaFlagIcon /></span>
                    </Form.Label>
                    <div className="admin-product-name-ai-wrap">
                      <Form.Control
                        type="text"
                        className="admin-product-name-ai-input"
                        value={productForm.name_ru}
                        onChange={(e) => setProductForm({ ...productForm, name_ru: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="link"
                        className="admin-product-ai-generate-inline-btn"
                        title={language === 'uz'
                          ? 'AI: RU/UZ nom va tavsifni generatsiya qilish'
                          : 'AI: сгенерировать RU/UZ название и описание'}
                        onClick={handleGenerateProductLocalizedText}
                        disabled={isGeneratingProductLocalizedText}
                      >
                        {isGeneratingProductLocalizedText ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <i className="bi bi-stars" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="d-flex align-items-center gap-2">
                      <span>{language === 'uz' ? 'Nomi (UZ)' : 'Название (UZ)'}</span>
                      <span className="admin-lang-flag-icon"><UzbekistanFlagIcon /></span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      value={productForm.name_uz}
                      onChange={(e) => setProductForm({ ...productForm, name_uz: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              </Row>

              {!productForm.size_enabled && (
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label className="d-flex align-items-center gap-2">
                        <span>{language === 'uz' ? 'Tavsif (RU)' : 'Описание (RU)'}</span>
                        <span className="admin-lang-flag-icon"><RussiaFlagIcon /></span>
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={productForm.description_ru}
                        onChange={(e) => setProductForm({ ...productForm, description_ru: e.target.value })}
                        placeholder={language === 'uz' ? 'Rus tilida tavsif kiriting' : 'Введите описание на русском'}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label className="d-flex align-items-center gap-2">
                        <span>{language === 'uz' ? 'Tavsif (UZ)' : 'Описание (UZ)'}</span>
                        <span className="admin-lang-flag-icon"><UzbekistanFlagIcon /></span>
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={productForm.description_uz}
                        onChange={(e) => setProductForm({ ...productForm, description_uz: e.target.value })}
                        placeholder={language === 'uz' ? "O'zbek tilida tavsif kiriting" : 'Введите описание на узбекском'}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              )}

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="d-flex align-items-center gap-2">
                      <span>Сезонность товара</span>
                      <span className="admin-container-help-trigger" tabIndex={0} aria-label="Подсказка по сезонности">
                        i
                        <span className="admin-container-help-tooltip">
                          В каталоге товар показывается только в выбранный сезон (или круглый год для всесезонного).
                        </span>
                      </span>
                    </Form.Label>
                    <Form.Select
                      value={productForm.season_scope || 'all'}
                      onChange={(e) => setProductForm({ ...productForm, season_scope: e.target.value })}
                    >
                      <option value="all">Всесезонный товар</option>
                      <option value="spring">Весна</option>
                      <option value="summer">Лето</option>
                      <option value="autumn">Осень</option>
                      <option value="winter">Зима</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{language === 'uz' ? "Mahsulot ko'rinishi" : 'Отображение товара'}</Form.Label>
                    <div className="admin-product-switch-inline-shell">
                      <Form.Check
                        className="admin-product-switch"
                        type="switch"
                        label={Boolean(restaurantSettings?.inventory_tracking_enabled) && !productForm.size_enabled
                          ? 'Нет в наличии (авто)'
                          : 'Нет в наличии'}
                        checked={!productForm.in_stock}
                        disabled={Boolean(restaurantSettings?.inventory_tracking_enabled) && !productForm.size_enabled}
                        onChange={(e) => setProductForm({ ...productForm, in_stock: !e.target.checked })}
                      />
                      <Form.Check
                        className="admin-product-switch"
                        type="switch"
                        label="Скрыть из каталога"
                        checked={!!productForm.is_hidden_catalog}
                        onChange={(e) => setProductForm({ ...productForm, is_hidden_catalog: e.target.checked })}
                      />
                      {Boolean(restaurantSettings?.size_variants_enabled) && (
                        <Form.Check
                          className="admin-product-switch"
                          type="switch"
                          id="product-size-enabled-switch"
                          label={language === 'uz' ? 'Variantlar' : 'Варианты товара'}
                          checked={Boolean(productForm.size_enabled)}
                          onChange={(e) => toggleProductVariantsEnabled(e.target.checked)}
                        />
                      )}
                    </div>
                  </Form.Group>
                </Col>
              </Row>

              {Boolean(restaurantSettings?.inventory_tracking_enabled) && !productForm.size_enabled && (
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>{language === 'uz' ? 'Ombordagi qoldiq' : 'Остаток на складе'}</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        step="0.001"
                        className="admin-product-compact-field"
                        value={productForm.stock_quantity ?? ''}
                        onChange={(e) => setProductForm((prev) => ({ ...prev, stock_quantity: e.target.value }))}
                        placeholder={language === 'uz' ? 'Masalan: 25' : 'Например: 25'}
                      />
                      <Form.Text className="text-muted">
                        {language === 'uz'
                          ? `Avto status chegarasi: ${Number(restaurantSettings?.inventory_min_threshold || 0)}`
                          : `Авто-порог недоступности: ${Number(restaurantSettings?.inventory_min_threshold || 0)}`}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    {(() => {
                      const threshold = Math.max(0, Number.parseFloat(restaurantSettings?.inventory_min_threshold) || 0);
                      const qty = Number.parseFloat(String(productForm.stock_quantity ?? '').replace(',', '.'));
                      const inStockByQty = Number.isFinite(qty) ? qty > threshold : false;
                      return (
                        <div className={`admin-product-stock-hint ${inStockByQty ? 'is-ok' : 'is-low'}`}>
                          <div className="fw-semibold">
                            {inStockByQty ? 'В наличии (авто)' : 'Нет в наличии (авто)'}
                          </div>
                          <div className="small">
                            {Number.isFinite(qty)
                              ? `Остаток: ${formatQuantity(qty)} / порог: ${formatQuantity(threshold)}`
                              : 'Укажите остаток для авто-статуса'}
                          </div>
                        </div>
                      );
                    })()}
                  </Col>
                </Row>
              )}

              {Boolean(restaurantSettings?.size_variants_enabled) && productForm.size_enabled && (
                <Row className="g-3 mt-1">
                  <Col xs={12}>
                    <Form.Group className="mb-3 admin-variants-simple-wrap">
                      <div className="d-flex align-items-center justify-content-between gap-2 admin-variants-simple-toolbar">
                        <Form.Label className="mb-0">
                          {language === 'uz' ? 'Mahsulot variantlari' : 'Варианты товара'}
                        </Form.Label>
                        <Button
                          type="button"
                          variant="light"
                          className="admin-variant-add-btn"
                          title={language === 'uz' ? "Yana bir variant qo'shish" : 'Добавить еще вариант'}
                          onClick={addEmptyProductVariantRow}
                          disabled={normalizeProductVariantOptionsForEditor(productForm.variant_options, {
                            fallbackPrice: normalizeProductPriceValue(productForm.price, NaN),
                            unit: productForm.unit || 'шт'
                          }).length >= MAX_PRODUCT_SIZE_OPTIONS}
                        >
                          +
                        </Button>
                      </div>
                      <div
                        className={`admin-variants-simple-table-scroll admin-thin-scrollbar${isVariantsTableScrolling ? ' is-scrolling' : ''}`}
                        onScroll={handleVariantsTableScroll}
                      >
                        <div className={`admin-variants-simple-head ${productForm.unit === 'кг' ? 'is-kg' : 'is-not-kg'}`}>
                          <span>№</span>
                          <span>{language === 'uz' ? 'Nomi' : 'Название варианта'}</span>
                          <span>Описание RU</span>
                          <span>Описание UZ</span>
                          <span>{language === 'uz' ? 'Narxi' : 'Цена'}</span>
                          <span>{language === 'uz' ? 'Chegirma' : 'Скидка'}</span>
                          <span>{Boolean(restaurantSettings?.inventory_tracking_enabled)
                            ? (language === 'uz' ? 'Qoldiq' : 'Остаток')
                            : (language === 'uz' ? 'Mavjud' : 'В наличии')}
                          </span>
                          <span>{language === 'uz' ? 'Shtrix-kod' : 'Штрихкод варианта'}</span>
                          <span>ИКПУ</span>
                          <span>{language === 'uz' ? 'Fasovka' : 'Фасовка'}</span>
                          <span>{language === 'uz' ? 'Qadoqlash normasi' : 'Норма фасовки'}</span>
                          {productForm.unit === 'кг' && <span>{language === 'uz' ? 'Buyurtma qadami' : 'Шаг заказа'}</span>}
                          <span>{language === 'uz' ? 'Foto' : 'Фото'}</span>
                          <span className="text-center">{language === 'uz' ? 'Amal' : 'Действие'}</span>
                        </div>

                        {(() => {
                          const fallbackPrice = normalizeProductPriceValue(productForm.price, NaN);
                          const isKgUnit = productForm.unit === 'кг';
                          const currentVariants = normalizeProductVariantOptionsForEditor(productForm.variant_options, {
                            fallbackPrice,
                            unit: productForm.unit || 'шт'
                          });
                          const isInventoryTrackingEnabledForVariants = Boolean(restaurantSettings?.inventory_tracking_enabled);
                          const inventoryThresholdForVariants = Math.max(0, Number.parseFloat(restaurantSettings?.inventory_min_threshold) || 0);
                          return (
                            <div className="admin-variants-simple-body">
                              {currentVariants.map((variant, index) => {
                                        const visibleSlotsCount = resolveVariantVisibleSlotsCount(variant);
                                        const variantImageSlots = createVariantImageSlots(
                                          variant.product_images,
                                          variant.image_url,
                                          variant.thumb_url
                                        ).slice(0, visibleSlotsCount);
                                        const canAddImageSlot = visibleSlotsCount < VARIANT_IMAGE_SLOTS_COUNT;
                                        const parsedVariantStock = Number.parseFloat(String(variant.stock_quantity ?? '').replace(',', '.'));
                                        const variantInStockByQty = Number.isFinite(parsedVariantStock)
                                          ? parsedVariantStock > inventoryThresholdForVariants
                                          : false;
                                        return (
                                          <div key={variant.__key || `variant-row-${index}`} className="admin-variant-row admin-variants-simple-row">
                                            <Row className={`g-0 align-items-stretch admin-variant-table-input-row ${isKgUnit ? 'is-kg' : 'is-not-kg'}`}>
                                              <Col xl={1} md={2} className="admin-variant-table-col admin-variant-table-col-number">
                                                <span className="admin-variant-row-number">{index + 1}</span>
                                              </Col>
                                              <Col xl={2} md={6} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  value={variant.name || ''}
                                                  onChange={(event) => updateProductVariantOption(index, 'name', event.target.value)}
                                                  placeholder={language === 'uz' ? 'Variant nomi' : 'Название варианта'}
                                                  maxLength={60}
                                                />
                                              </Col>
                                              <Col xl={2} md={6} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  value={variant.description_ru || ''}
                                                  onChange={(event) => updateProductVariantOption(index, 'description_ru', event.target.value)}
                                                  placeholder="Описание RU"
                                                  maxLength={1500}
                                                />
                                              </Col>
                                              <Col xl={2} md={6} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  value={variant.description_uz || ''}
                                                  onChange={(event) => updateProductVariantOption(index, 'description_uz', event.target.value)}
                                                  placeholder="Описание UZ"
                                                  maxLength={1500}
                                                />
                                              </Col>
                                              <Col xl={2} md={4} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  type="text"
                                                  inputMode="decimal"
                                                  value={formatProductPriceInputValue(variant.price)}
                                                  onChange={(event) => updateProductVariantOption(index, 'price', event.target.value)}
                                                  placeholder={language === 'uz' ? 'Narxi' : 'Цена'}
                                                />
                                              </Col>
                                              <Col xl={2} md={4} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  type="text"
                                                  inputMode="decimal"
                                                  value={formatProductPriceInputValue(variant.discount_price)}
                                                  onChange={(event) => updateProductVariantOption(index, 'discount_price', event.target.value)}
                                                  placeholder={language === 'uz' ? 'Chegirma narxi' : 'Цена со скидкой'}
                                                />
                                              </Col>
                                              <Col xl={2} md={4} className="admin-variant-table-col">
                                                {isInventoryTrackingEnabledForVariants ? (
                                                  <div className="d-flex flex-column w-100">
                                                    <Form.Control
                                                      className="form-control-custom"
                                                      type="text"
                                                      inputMode="decimal"
                                                      value={variant.stock_quantity ?? ''}
                                                      onChange={(event) => updateProductVariantOption(index, 'stock_quantity', event.target.value)}
                                                      placeholder={language === 'uz' ? 'Qoldiq' : 'Остаток'}
                                                      title={language === 'uz'
                                                        ? `Avto-chegara: ${formatQuantity(inventoryThresholdForVariants)}`
                                                        : `Авто-порог: ${formatQuantity(inventoryThresholdForVariants)}`}
                                                    />
                                                    <div className="admin-variant-stock-inline-note">
                                                      {variantInStockByQty
                                                        ? (language === 'uz' ? 'Avto: mavjud' : 'Авто: в наличии')
                                                        : (language === 'uz' ? 'Avto: yo‘q' : 'Авто: нет')}
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <Form.Check
                                                    type="switch"
                                                    className="admin-variant-inline-switch"
                                                    label={variant.in_stock !== false
                                                      ? (language === 'uz' ? 'Mavjud' : 'В наличии')
                                                      : (language === 'uz' ? 'Yo‘q' : 'Нет')}
                                                    checked={variant.in_stock !== false}
                                                    onChange={(event) => updateProductVariantOption(index, 'in_stock', event.target.checked)}
                                                  />
                                                )}
                                              </Col>
                                              <Col xl={3} md={6} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  type="text"
                                                  value={variant.barcode || ''}
                                                  onChange={(event) => updateProductVariantOption(index, 'barcode', event.target.value)}
                                                  placeholder={language === 'uz' ? 'Shtrix-kod varianti' : 'Штрихкод варианта'}
                                                  maxLength={120}
                                                />
                                              </Col>
                                              <Col xl={2} md={6} className="admin-variant-table-col">
                                                <Form.Control
                                                  className="form-control-custom"
                                                  type="text"
                                                  value={variant.ikpu || ''}
                                                  onChange={(event) => updateProductVariantOption(index, 'ikpu', event.target.value)}
                                                  placeholder="ИКПУ"
                                                  maxLength={64}
                                                />
                                              </Col>
                                              <Col xl={2} md={6} className="admin-variant-table-col">
                                                <Form.Select
                                                  className="form-control-custom"
                                                  value={variant.container_id || ''}
                                                  onChange={(event) => updateProductVariantOption(index, 'container_id', event.target.value)}
                                                >
                                                  <option value="">{t('noContainer')}</option>
                                                  {containers.map((container) => (
                                                    <option key={`variant-container-${container.id}`} value={container.id}>
                                                      {container.name} (+{formatPrice(container.price)} {t('sum')})
                                                    </option>
                                                  ))}
                                                </Form.Select>
                                              </Col>
                                              <Col xl={1} md={4} className="admin-variant-table-col">
                                                {variant.container_id ? (
                                                  <Form.Control
                                                    className="form-control-custom"
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={variant.container_norm}
                                                    onChange={(event) => updateProductVariantOption(index, 'container_norm', event.target.value)}
                                                  />
                                                ) : (
                                                  <span className="admin-variant-empty-cell">—</span>
                                                )}
                                              </Col>
                                              {isKgUnit && (
                                                <Col xl={1} md={4} className="admin-variant-table-col">
                                                  <Form.Control
                                                    className="form-control-custom"
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={variant.order_step || ''}
                                                    onChange={(event) => updateProductVariantOption(index, 'order_step', event.target.value)}
                                                  />
                                                </Col>
                                              )}
                                              <Col xl={3} md={8} className="admin-variant-table-col admin-variant-table-col-images">
                                                <div
                                                  className="admin-product-variant-inline-images-shell"
                                                  tabIndex={0}
                                                  onPaste={(e) => handlePasteToVariantImageSlot(index, e)}
                                                  title={language === 'uz'
                                                    ? "Ctrl+V bilan birinchi bo'sh slotga rasm qo'ying"
                                                    : 'Нажмите Ctrl+V, чтобы вставить фото в первый свободный слот'}
                                                >
                                                  <div className="admin-product-variant-inline-images-row">
                                                    {variantImageSlots.map((slot, slotIndex) => (
                                                      <div key={`variant-image-slot-${index}-${slotIndex}`} className="admin-product-variant-inline-image-item">
                                                        <div className={`admin-product-image-slot admin-product-image-slot-variant-inline ${slotIndex === 0 ? 'is-main' : ''}`}>
                                                          <div
                                                            className={`admin-product-image-dropzone admin-product-image-dropzone-variant-inline ${slot.url ? 'has-image' : ''}`}
                                                            tabIndex={0}
                                                            onPaste={(e) => handlePaste(
                                                              e,
                                                              (url, meta) => updateProductVariantImageSlot(
                                                                index,
                                                                slotIndex,
                                                                url,
                                                                meta?.thumbUrl || meta?.thumb_url || ''
                                                              ),
                                                              { preset: 'product' }
                                                            )}
                                                            onDrop={(e) => {
                                                              e.preventDefault();
                                                              const file = e.dataTransfer.files[0];
                                                              if (file) {
                                                                handleImageUpload(
                                                                  file,
                                                                  (url, meta) => updateProductVariantImageSlot(
                                                                    index,
                                                                    slotIndex,
                                                                    url,
                                                                    meta?.thumbUrl || meta?.thumb_url || ''
                                                                  ),
                                                                  { preset: 'product' }
                                                                );
                                                              }
                                                            }}
                                                            onDragOver={(e) => e.preventDefault()}
                                                          >
                                                            {slot.url ? (
                                                              <img
                                                                src={slot.url}
                                                                alt={`Variant ${index + 1} ${slotIndex + 1}`}
                                                                className="admin-product-image-preview"
                                                              />
                                                            ) : (
                                                              <div className="admin-product-image-placeholder">
                                                                <div className="admin-product-image-placeholder-icon">📷</div>
                                                              </div>
                                                            )}
                                                            <div className="admin-product-image-slot-overlay">
                                                              <Button
                                                                type="button"
                                                                variant="light"
                                                                size="sm"
                                                                className="admin-product-image-slot-btn admin-product-image-slot-btn-clear admin-product-image-slot-btn-top-right"
                                                                title="Удалить фото варианта"
                                                                onClick={(e) => {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  clearProductVariantImageSlot(index, slotIndex);
                                                                }}
                                                                disabled={!slot.url}
                                                              >
                                                                ✕
                                                              </Button>
                                                              {!slot.url && (
                                                                <label
                                                                  htmlFor={`product-variant-image-file-input-${index}-${slotIndex}`}
                                                                  className={`admin-product-image-select-btn admin-product-image-select-btn-variant-inline ${uploadingImage ? 'is-disabled' : ''}`}
                                                                >
                                                                  {language === 'uz' ? 'Tanlash' : 'Выбрать файл'}
                                                                </label>
                                                              )}
                                                            </div>
                                                          </div>
                                                          <Form.Control
                                                            className="admin-product-image-file-input"
                                                            id={`product-variant-image-file-input-${index}-${slotIndex}`}
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => {
                                                              const file = e.target.files[0];
                                                              if (file) {
                                                                handleImageUpload(
                                                                  file,
                                                                  (url, meta) => updateProductVariantImageSlot(
                                                                    index,
                                                                    slotIndex,
                                                                    url,
                                                                    meta?.thumbUrl || meta?.thumb_url || ''
                                                                  ),
                                                                  { preset: 'product' }
                                                                );
                                                                e.target.value = '';
                                                              }
                                                            }}
                                                            disabled={uploadingImage}
                                                          />
                                                        </div>
                                                      </div>
                                                    ))}
                                                    {canAddImageSlot && (
                                                      <button
                                                        type="button"
                                                        className="admin-product-variant-inline-add-slot"
                                                        onClick={() => addProductVariantImageSlot(index)}
                                                        title={language === 'uz' ? "Foto slot qo'shish" : 'Добавить фото-слот'}
                                                      >
                                                        +
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                              </Col>
                                              <Col xl={1} md={2} className="admin-variant-table-col admin-variant-table-col-actions d-flex justify-content-end">
                                                <Button
                                                  type="button"
                                                  variant="light"
                                                  className="admin-variant-remove-btn"
                                                  onClick={() => removeProductVariantOption(index)}
                                                  title={language === 'uz' ? "Variantni o'chirish" : 'Удалить вариант'}
                                                >
                                                  ×
                                                </Button>
                                              </Col>
                                            </Row>
                                          </div>
                                        );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <Form.Text className="text-muted admin-product-image-help">
                        {productImageUploadHintText}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              )}

              <div className={`admin-product-main-fields-grid ${productForm.size_enabled ? 'variants-mode' : (productForm.container_id ? 'has-container-norm' : '')}`}>
                {!productForm.size_enabled && (
                  <Form.Group className="mb-0">
                    <Form.Label>{language === 'uz' ? 'Tovar shtrix-kodi' : 'Штрихкод товара'}</Form.Label>
                    <Form.Control
                      className="admin-product-compact-field"
                      type="text"
                      value={productForm.barcode}
                      onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value.slice(0, 120) })}
                      placeholder={language === 'uz' ? 'Asosiy shtrix-kod' : 'Основной штрихкод'}
                      maxLength={120}
                    />
                  </Form.Group>
                )}

                {!productForm.size_enabled && (
                  <Form.Group className="mb-0">
                    <Form.Label>ИКПУ</Form.Label>
                    <Form.Control
                      className="admin-product-compact-field"
                      type="text"
                      value={productForm.ikpu || ''}
                      onChange={(e) => setProductForm({ ...productForm, ikpu: e.target.value.slice(0, 64) })}
                      placeholder="Необязательно"
                      maxLength={64}
                    />
                  </Form.Group>
                )}

                <Form.Group className="mb-0">
                  <Form.Label>{t('sortOrderLabel')}</Form.Label>
                  <div className="admin-product-sort-input-wrap" ref={productSortHintsRef}>
                    <Form.Control
                      className="admin-product-compact-field admin-product-sort-input-field"
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.sort_order}
                      onChange={(e) => setProductForm({
                        ...productForm,
                        sort_order: Number.parseInt(e.target.value, 10) || 0
                      })}
                    />
                    {productSortOrderHints.hasCategory && (
                      <button
                        type="button"
                        className="admin-product-sort-popup-trigger"
                        aria-label={language === 'uz' ? "Bo'sh tartib raqamlarini ko'rsatish" : 'Показать свободные номера сортировки'}
                        title={language === 'uz' ? "Bo'sh tartib raqamlari" : 'Свободные номера сортировки'}
                        onClick={() => setIsProductSortHintsPopupOpen((prev) => !prev)}
                      >
                        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                          <path
                            d="M4 4h12v2H4V4zm0 5h8v2H4V9zm0 5h12v2H4v-2zm10-4 2 2 4-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    {isProductSortHintsPopupOpen && productSortOrderHints.hasCategory && (
                      <div className="admin-product-sort-popup">
                        <div className={`small ${productSortOrderHints.isCurrentFree ? 'text-success' : 'text-danger'}`}>
                          {productSortOrderHints.isCurrentFree
                            ? (
                              language === 'uz'
                                ? "Joriy raqam bo'sh."
                                : 'Текущий номер свободен.'
                            )
                            : (
                              language === 'uz'
                                ? "Joriy raqam band. Erkin raqamni tanlang."
                                : 'Текущий номер занят. Выберите свободный.'
                            )}
                        </div>
                        <div className="small text-muted mt-1">
                          {language === 'uz'
                            ? `Eng kichik bo'sh: ${productSortOrderHints.smallestFree}, eng yaqin bo'sh: ${productSortOrderHints.closestFree}`
                            : `Минимальный свободный: ${productSortOrderHints.smallestFree}, ближайший: ${productSortOrderHints.closestFree}`}
                        </div>
                        <div className="admin-product-sort-popup-list">
                          {productSortOrderHints.suggestions.map((value) => {
                            const isActive = Number(productForm.sort_order || 0) === value;
                            return (
                              <button
                                key={`sort-order-hint-popup-${value}`}
                                type="button"
                                className={`admin-product-sort-popup-value ${isActive ? 'is-active' : ''}`}
                                onClick={() => {
                                  setProductForm((prev) => ({ ...prev, sort_order: value }));
                                  setIsProductSortHintsPopupOpen(false);
                                }}
                              >
                                {value}
                              </button>
                            );
                          })}
                        </div>
                        <div className="small text-muted mt-2">
                          {language === 'uz'
                            ? "Bir xil kategoriyada kichik raqam birinchi ko'rsatiladi."
                            : 'Внутри категории сначала показываются меньшие номера.'}
                        </div>
                      </div>
                    )}
                  </div>
                </Form.Group>

                {!productForm.size_enabled && (
                  <>
                    <Form.Group className="mb-0">
                      <Form.Label>{t('priceSum')}</Form.Label>
                      <Form.Control
                        className="admin-product-compact-field"
                        required
                        type="text"
                        inputMode="decimal"
                        value={formatProductPriceInputValue(productForm.price)}
                        onChange={(e) => {
                          const nextPrice = sanitizeProductPriceInputValue(e.target.value);
                          setProductForm((prev) => {
                            const parsedBasePrice = normalizeProductPriceValue(nextPrice, NaN);
                            const parsedDiscountPrice = normalizeProductPriceValue(prev.discount_price, NaN);
                            const shouldResetDiscountPrice = (
                              prev.discount_enabled
                              && Number.isFinite(parsedBasePrice)
                              && Number.isFinite(parsedDiscountPrice)
                              && parsedDiscountPrice >= parsedBasePrice
                            );
                            return {
                              ...prev,
                              price: nextPrice,
                              discount_price: shouldResetDiscountPrice ? '' : prev.discount_price
                            };
                          });
                        }}
                      />
                    </Form.Group>
                    <Form.Group className="mb-0">
                      <Form.Label className="d-flex align-items-center justify-content-between gap-2">
                        <span>{language === 'uz' ? 'Chegirma' : 'Скидка'}</span>
                        <Form.Check
                          type="switch"
                          id="admin-product-discount-switch"
                          checked={Boolean(productForm.discount_enabled)}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setProductForm((prev) => ({
                              ...prev,
                              discount_enabled: enabled,
                              discount_price: enabled ? prev.discount_price : ''
                            }));
                          }}
                        />
                      </Form.Label>
                      {Boolean(productForm.discount_enabled) ? (
                        (() => {
                          const basePrice = normalizeProductPriceValue(productForm.price, NaN);
                          const discountPrice = normalizeProductPriceValue(productForm.discount_price, NaN);
                          const hasValidDiscount = Number.isFinite(basePrice)
                            && Number.isFinite(discountPrice)
                            && discountPrice > 0
                            && discountPrice < basePrice;
                          const discountAmount = hasValidDiscount ? Math.max(0, basePrice - discountPrice) : 0;
                          return (
                            <div className="admin-product-discount-fields">
                              <Form.Control
                                className="admin-product-compact-field"
                                type="text"
                                inputMode="decimal"
                                value={formatProductPriceInputValue(productForm.discount_price)}
                                onChange={(e) => setProductForm((prev) => ({
                                  ...prev,
                                  discount_price: sanitizeProductPriceInputValue(e.target.value)
                                }))}
                                placeholder={language === 'uz' ? 'Chegirma narxi' : 'Цена со скидкой'}
                              />
                              <div className={`admin-product-discount-note ${hasValidDiscount ? 'is-valid' : 'is-invalid'}`}>
                                {hasValidDiscount
                                  ? (language === 'uz'
                                    ? `Yakuniy narx: ${formatPrice(discountPrice)} ${t('sum')} (-${formatPrice(discountAmount)} ${t('sum')})`
                                    : `Итоговая цена: ${formatPrice(discountPrice)} ${t('sum')} (-${formatPrice(discountAmount)} ${t('sum')})`)
                                  : (language === 'uz'
                                    ? "Chegirma narxi asosiy narxdan kichik bo'lishi kerak"
                                    : 'Цена со скидкой должна быть меньше основной цены')}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="admin-product-discount-note is-muted">
                          {language === 'uz'
                            ? "Chegirma o'chirilgan. Mijozga oddiy narx ko'rsatiladi."
                            : 'Скидка отключена. Клиент увидит обычную цену.'}
                        </div>
                      )}
                    </Form.Group>
                  </>
                )}

                <Form.Group className="mb-0">
                  <Form.Label>{t('unit')}</Form.Label>
                  <Form.Select
                    className="admin-product-compact-field"
                    required
                    value={productForm.unit}
                    onChange={(e) => {
                      const nextUnit = e.target.value;
                      setProductForm((prev) => {
                        const fallbackBasePrice = normalizeProductPriceValue(prev.price, NaN);
                        const normalizedVariants = normalizeProductVariantOptionsForEditor(prev.variant_options, {
                          fallbackPrice: fallbackBasePrice,
                          unit: nextUnit
                        });
                        return {
                          ...prev,
                          unit: nextUnit,
                          order_step: nextUnit === 'кг' ? prev.order_step : '',
                          variant_options: normalizedVariants,
                          size_options: normalizeProductVariantOptions(normalizedVariants, {
                            fallbackPrice: fallbackBasePrice,
                            unit: nextUnit
                          }).map((variant) => variant.name)
                        };
                      });
                    }}
                  >
                    <option value="шт">{t('unitPcs')}</option>
                    <option value="порция">{t('unitPortion')}</option>
                    <option value="кг">{t('unitKg')}</option>
                    <option value="л">{t('unitL')}</option>
                    <option value="г">{t('unitG')}</option>
                    <option value="мл">{t('unitMl')}</option>
                    <option value="Стакан">{t('unitCup')}</option>
                    <option value="Банка">{t('unitJar')}</option>
                    <option value="Пачка">{t('unitPack')}</option>
                    <option value="Блок">{t('unitBlock')}</option>
                    <option value="см">{t('unitCm')}</option>
                    <option value="м">{t('unitM')}</option>
                    <option value="м2">{t('unitM2')}</option>
                    <option value="м3">{t('unitM3')}</option>
                    <option value="км">{t('unitKm')}</option>
                    <option value="т">{t('unitT')}</option>
                  </Form.Select>
                </Form.Group>

                {!productForm.size_enabled && (
                  <>
                    <Form.Group className="mb-0">
                      <Form.Label className="d-flex align-items-center gap-2">
                        <span>{language === 'uz' ? 'Fasovka' : 'Фасовка'}</span>
                        <span className="admin-container-help-trigger" tabIndex={0} aria-label={language === 'uz' ? "Idish turlari" : 'Типы тары'}>
                          i
                          <span className="admin-container-help-tooltip">
                            <span>{language === 'uz' ? 'Turlari:' : 'Варианты:'}</span>{' '}
                            <span key={`container-word-${activeContainerLabelWord}`} className="admin-container-help-animated-word">
                              {activeContainerLabelWord}
                            </span>
                            <span className="admin-container-help-tooltip-list">
                              {' '}({containerLabelAnimatedWords.join(', ')})
                            </span>
                            <br />
                            <span>
                              {language === 'uz' ? "Idish narxi buyurtmaga qo'shiladi." : 'Стоимость посуды добавится к заказу.'}
                            </span>
                          </span>
                        </span>
                      </Form.Label>
                      <Form.Select
                        className="admin-product-compact-field"
                        value={productForm.container_id}
                        onChange={(e) => {
                          const nextContainerId = e.target.value;
                          setProductForm({
                            ...productForm,
                            container_id: nextContainerId,
                            container_norm: nextContainerId ? productForm.container_norm : 1
                          });
                        }}
                      >
                        <option value="">{t('noContainer')}</option>
                        {containers.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} (+{formatPrice(c.price)} {t('sum')})
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>

                    {productForm.container_id && (
                      <Form.Group className="mb-0">
                        <Form.Label className="d-flex align-items-center gap-2">
                          <span>{language === 'uz' ? 'Qadoqlash normasi' : 'Норма фасовки'}</span>
                          <span className="admin-container-help-trigger" tabIndex={0} aria-label={language === 'uz' ? "Idish normasi izohi" : 'Подсказка по норме посуды'}>
                            i
                            <span className="admin-container-help-tooltip">
                              {t('containerNormNote')}
                            </span>
                          </span>
                        </Form.Label>
                        <Form.Control
                          className="admin-product-compact-field"
                          type="number"
                          min="1"
                          step="1"
                          value={productForm.container_norm}
                          onChange={(e) => setProductForm({ ...productForm, container_norm: e.target.value })}
                        />
                      </Form.Group>
                    )}

                    {productForm.unit === 'кг' && (
                      <Form.Group className="mb-0">
                        <Form.Label className="d-flex align-items-center gap-2">
                          <span>{t('orderStepLabel')}</span>
                          <span className="admin-container-help-trigger" tabIndex={0} aria-label={language === 'uz' ? "Qadam bo'yicha izoh" : 'Подсказка по шагу заказа'}>
                            i
                            <span className="admin-container-help-tooltip">
                              {language === 'uz'
                                ? "Agar 0,25 kiritsangiz, mijoz bir bosishda 0,25 kg qo'shadi."
                                : 'Если указать 0,25, клиент будет добавлять товар по 0,25 кг за одно нажатие.'}
                            </span>
                          </span>
                        </Form.Label>
                        <Form.Control
                          className="admin-product-compact-field"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={productForm.order_step}
                          onChange={(e) => setProductForm({ ...productForm, order_step: e.target.value })}
                        />
                      </Form.Group>
                    )}
                  </>
                )}
              </div>

              {!productForm.size_enabled && (
                <Row>
                  <Col xs={12}>
                    <Form.Group className="mb-3">
                      <Form.Label className="mb-2">{t('image')} (до 5)</Form.Label>
                      <div className="admin-product-images-shell">
                        <div className="admin-product-images-row">
                          {(() => {
                            const allProductImageSlots = createProductImageSlots(
                              productForm.product_images,
                              productForm.image_url,
                              productForm.thumb_url
                            );
                            const renderedSlotsCount = isProductImagesMobileLayout
                              ? visibleProductImageSlotsCount
                              : PRODUCT_IMAGE_SLOTS_COUNT;
                            const renderedSlotItems = allProductImageSlots.slice(0, renderedSlotsCount).map((slot, slotIndex) => (
                              <div key={`product-image-slot-${slotIndex}`} className="admin-product-image-item">
                                <div className={`admin-product-image-slot ${slotIndex === 0 ? 'is-main' : ''}`}>
                                  <div
                                    className={`admin-product-image-dropzone ${slot.url ? 'has-image' : ''}`}
                                    tabIndex={0}
                                    onPaste={(e) => handlePaste(
                                      e,
                                      (url, meta) => updateProductImageSlot(slotIndex, url, meta?.thumbUrl || meta?.thumb_url || ''),
                                      { preset: 'product' }
                                    )}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const file = e.dataTransfer.files[0];
                                      if (file) {
                                        handleImageUpload(
                                          file,
                                          (url, meta) => updateProductImageSlot(slotIndex, url, meta?.thumbUrl || meta?.thumb_url || ''),
                                          { preset: 'product' }
                                        );
                                      }
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                  >
                                    {slot.url ? (
                                      <img
                                        src={slot.url}
                                        alt={`Preview ${slotIndex + 1}`}
                                        className="admin-product-image-preview"
                                      />
                                    ) : (
                                      <div className="admin-product-image-placeholder">
                                        <div className="admin-product-image-placeholder-icon is-add">+</div>
                                      </div>
                                    )}
                                    <div className="admin-product-image-slot-overlay">
                                      <Button
                                        type="button"
                                        variant="light"
                                        size="sm"
                                        className={`admin-product-image-slot-btn admin-product-image-slot-btn-star ${slotIndex === 0 ? 'is-main' : ''} admin-product-image-slot-btn-top-left`}
                                        title={slotIndex === 0 ? 'Главное фото' : 'Сделать главным'}
                                        onClick={() => setMainProductImageSlot(slotIndex)}
                                        disabled={!slot.url}
                                      >
                                        ★
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="light"
                                        size="sm"
                                        className="admin-product-image-slot-btn admin-product-image-slot-btn-clear admin-product-image-slot-btn-top-right"
                                        title="Удалить фото"
                                        onClick={() => clearProductImageSlot(slotIndex)}
                                        disabled={!slot.url}
                                      >
                                        ✕
                                      </Button>
                                      <label
                                        htmlFor={`product-image-file-input-${slotIndex}`}
                                        className={`admin-product-image-select-btn ${uploadingImage ? 'is-disabled' : ''}`}
                                      >
                                        {language === 'uz' ? 'Tanlash' : 'Выбрать'}
                                      </label>
                                    </div>
                                  </div>

                                  <Form.Control
                                    className="admin-product-image-file-input"
                                    id={`product-image-file-input-${slotIndex}`}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files[0];
                                      if (file) {
                                        handleImageUpload(
                                          file,
                                          (url, meta) => updateProductImageSlot(slotIndex, url, meta?.thumbUrl || meta?.thumb_url || ''),
                                          { preset: 'product' }
                                        );
                                        e.target.value = '';
                                      }
                                    }}
                                    disabled={uploadingImage}
                                  />
                                </div>
                              </div>
                            ));
                            if (isProductImagesMobileLayout && visibleProductImageSlotsCount < PRODUCT_IMAGE_SLOTS_COUNT) {
                              renderedSlotItems.push(
                                <div key="product-image-slot-add" className="admin-product-image-item">
                                  <button
                                    type="button"
                                    className="admin-product-image-slot admin-product-image-slot-add"
                                    onClick={addProductImageSlot}
                                    title={language === 'uz' ? "Foto slot qo'shish" : 'Добавить фото-слот'}
                                    aria-label={language === 'uz' ? "Foto slot qo'shish" : 'Добавить фото-слот'}
                                  >
                                    +
                                  </button>
                                </div>
                              );
                            }
                            return renderedSlotItems;
                          })()}
                        </div>
                      </div>
                      {uploadingImage && (
                        <div className="text-muted mt-2 admin-product-image-uploading">
                          <small>⏳ {t('uploadingImage')}</small>
                        </div>
                      )}
                      <Form.Text className="text-muted admin-product-image-help">
                        {productImageUploadHintText}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              )}

              {restaurantSettings && !Boolean(restaurantSettings?.size_variants_enabled) && (
                <Row className="g-3 mt-1">
                  <Col xs={12}>
                    <div className="p-2 rounded-3 border bg-light small admin-product-variant-support-line">
                      <span>
                        {language === 'uz'
                          ? "Agar mahsulot variantlarini yoqmoqchi bo'lsangiz, dastur ta'minotchisiga murojaat qiling."
                          : 'Если хотите включить варианты товаров, обратитесь к поставщику программы.'}
                      </span>
                      <span className="mx-2 text-muted">|</span>
                      <span>{language === 'uz' ? 'Aloqa (superadmin):' : 'Контакты (суперадмин):'}</span>
                      <span className="mx-2"><strong>{language === 'uz' ? 'Ism' : 'Имя'}:</strong> {variantSupportContactName}</span>
                      <span className="mx-2"><strong>{language === 'uz' ? 'Telefon' : 'Телефон'}:</strong> {variantSupportPhone}</span>
                      <span className="mx-2">
                        <strong>Telegram:</strong>{' '}
                        {variantSupportTelegramLink ? (
                          <a href={variantSupportTelegramLink} target="_blank" rel="noreferrer">
                            @{variantSupportTelegramHandle}
                          </a>
                        ) : (
                          `@${variantSupportTelegramHandle}`
                        )}
                      </span>
                    </div>
                  </Col>
                </Row>
              )}

            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowProductModal(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" type="submit" disabled={isTopLevelCategorySelection(productForm.category_id)}>
                {selectedProduct ? t('save') : t('add')}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Broadcast Modal */}
        <Modal show={showBroadcastModal} onHide={() => setShowBroadcastModal(false)} size="xl" className="admin-broadcast-modal">
          <Modal.Header closeButton className="border-0">
            <Modal.Title className="d-flex align-items-center">
              <span className="me-2">📢</span> {t('broadcastTitle') || 'Рассылка уведомлений'}
            </Modal.Title>
          </Modal.Header>
          <div className="px-4 pb-0">
            <Nav variant="tabs" activeKey={broadcastModalTab} onSelect={(k) => {
              setBroadcastModalTab(k);
              if (k === 'scheduled') fetchScheduledBroadcasts();
              if (k === 'history') fetchBroadcastHistory();
            }}>
              <Nav.Item>
                <Nav.Link eventKey="send">{editingBroadcastId ? '✏️ Редактировать' : '🆕 Создать'}</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="scheduled">📅 Очередь</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="history">📜 История</Nav.Link>
              </Nav.Item>
            </Nav>
          </div>
          <Modal.Body className="p-0">
            {broadcastModalTab === 'send' ? (
              <Row className="g-0">
                {/* Left Column: Form */}
                <Col md={7} className="p-4 border-end">
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">{t('broadcastMedia') || 'Фото/видео (необязательно)'}</Form.Label>
                    <div
                      className="border rounded p-3 mb-2 text-center"
                      style={{
                        borderStyle: 'dashed',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        minHeight: '100px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#475569'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                      tabIndex={0}
                      onPaste={(e) => handlePaste(e, (url) => setBroadcastForm(prev => ({ ...prev, image_url: url, video_url: '' })))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) {
                          handleBroadcastImageUpload(file);
                        } else if (file && file.type.startsWith('video/')) {
                          handleBroadcastVideoUpload(file);
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => document.getElementById('broadcast-media-input').click()}
                    >
                      {broadcastForm.image_url ? (
                        <div className="position-relative">
                          <img
                            src={broadcastForm.image_url}
                            alt="Preview"
                            style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }}
                            className="rounded"
                          />
                        </div>
                      ) : broadcastForm.video_url ? (
                        <div className="position-relative w-100">
                          <video
                            src={broadcastForm.video_url}
                            controls
                            style={{ maxWidth: '100%', maxHeight: '160px' }}
                            className="rounded"
                          />
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: '1.2rem' }}>📸🎬</div>
                          <div className="text-muted small">{t('broadcastPasteOrSelectMedia') || 'Вставьте изображение (Ctrl+V), перетащите файл или нажмите для выбора'}</div>
                        </>
                      )}
                    </div>
                    <Form.Control
                      id="broadcast-media-input"
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleBroadcastMediaInputChange}
                      className="d-none"
                    />
                    {broadcastForm.image_url && (
                      <Button variant="link" size="sm" className="text-danger p-0" onClick={() => { setBroadcastForm(prev => ({ ...prev, image_url: '' })); setBroadcastImageFile(null); }}>
                        {t('deletePhoto') || 'Удалить фото'}
                      </Button>
                    )}
                    {broadcastForm.video_url && (
                      <Button variant="link" size="sm" className="text-danger p-0 ms-3" onClick={() => { setBroadcastForm(prev => ({ ...prev, video_url: '' })); setBroadcastVideoFile(null); }}>
                        {t('deleteVideo') || 'Удалить видео'}
                      </Button>
                    )}
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Текст сообщения *</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={6}
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                      placeholder="Напишите текст рассылки..."
                      className="border-0 bg-light p-3"
                      style={{ resize: 'none', fontSize: '0.9rem' }}
                    />
                  </Form.Group>

                  {/* Scheduling Section */}
                  <div className="border-top pt-3">
                    <Form.Check
                      type="switch"
                      id="schedule-switch"
                      label="🆕 Запланировать на дату/время"
                      checked={isScheduled}
                      onChange={(e) => setIsScheduled(e.target.checked)}
                      className="mb-3 fw-bold"
                    />

                    {isScheduled && (
                      <div className="bg-light p-3 rounded border mb-3">
                        <Row className="gy-3">
                          <Col md={12}>
                            <Form.Label className="small fw-bold">{t('recurrence') || 'Повтор'}</Form.Label>
                            <Form.Select
                              value={recurrence}
                              onChange={(e) => {
                                setRecurrence(e.target.value);
                                if (e.target.value === 'none') {
                                  setRepeatDays([]);
                                }
                              }}
                              className="form-select-sm"
                            >
                              <option value="none">{t('once') || 'Один раз'}</option>
                              <option value="daily">{t('everyDay') || 'Каждый день'}</option>
                              <option value="custom">{t('customDays') || 'По выбранным дням'}</option>
                            </Form.Select>
                          </Col>

                          {recurrence === 'none' && (
                            <Col md={6}>
                              <Form.Label className="small fw-bold">{t('date') || 'Дата'}</Form.Label>
                              <Form.Control
                                type="date"
                                size="sm"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                              />
                            </Col>
                          )}

                          <Col md={recurrence === 'none' ? 6 : 12}>
                            <Form.Label className="small fw-bold">{t('time') || 'Время отправки'}</Form.Label>
                            <Form.Control
                              type="time"
                              size="sm"
                              value={scheduledTime}
                              onChange={(e) => setScheduledTime(e.target.value)}
                            />
                          </Col>

                          {recurrence === 'custom' && (
                            <Col md={12}>
                              <Form.Label className="small fw-bold">{t('selectDays') || 'В какие дни:'}</Form.Label>
                              <div className="d-flex gap-1 flex-wrap">
                                {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, idx) => (
                                  <Button
                                    key={idx}
                                    size="sm"
                                    variant={repeatDays.includes(idx) ? 'primary' : 'outline-secondary'}
                                    onClick={() => {
                                      setRepeatDays(prev =>
                                        prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                                      );
                                    }}
                                    style={{ width: '40px', fontSize: '0.7rem' }}
                                  >
                                    {day}
                                  </Button>
                                ))}
                              </div>
                            </Col>
                          )}
                        </Row>
                      </div>
                    )}
                  </div>
                </Col>

                {/* Right Column: Telegram-style Preview */}
                <Col md={5} className="bg-light p-0 position-relative" style={{ minHeight: '400px', backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover' }}>
                  <div className="p-4 d-flex flex-column align-items-center h-100">
                    <div className="text-white bg-dark bg-opacity-25 rounded-pill px-3 py-1 small mb-4">
                      {isScheduled ? 'Превью (запланировано)' : 'Превью (мгновенно)'}
                    </div>

                    {/* Telegram Bubble */}
                    <div className="bg-white shadow-sm position-relative overflow-hidden" style={{ maxWidth: '90%', borderRadius: '12px 12px 12px 2px', paddingBottom: '4px' }}>
                      <div className="px-3 pt-2 pb-1 d-flex align-items-center gap-2 border-bottom mb-2 bg-light bg-opacity-50">
                        {activeRestaurantLogoUrl ? (
                          <img
                            src={activeRestaurantLogoUrl}
                            alt="logo"
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div className="bg-primary rounded-circle" style={{ width: 24, height: 24 }}></div>
                        )}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{user?.active_restaurant_name || 'Магазин'}</span>
                      </div>
                      {broadcastForm.image_url && <div className="px-2 pb-2"><img src={broadcastForm.image_url} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px' }} /></div>}
                      {broadcastForm.video_url && (
                        <div className="px-2 pb-2">
                          <video src={broadcastForm.video_url} controls style={{ width: '100%', maxHeight: '240px', borderRadius: '8px' }} />
                        </div>
                      )}
                      <div className="px-3 pb-2 pt-1">
                        <div
                          style={{
                            fontSize: '0.9rem',
                            lineHeight: '1.4',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                            color: '#222'
                          }}
                          dangerouslySetInnerHTML={{ __html: sanitizedBroadcastPreviewHtml }}
                        />
                        <div className="text-end mt-1 me-1" style={{ fontSize: '0.65rem', color: '#999' }}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>
            ) : broadcastModalTab === 'scheduled' ? (
              <div className="p-4 bg-light" style={{ minHeight: '400px' }}>
                {loadingScheduled ? (
                  <TableSkeleton rows={5} columns={5} label="Загрузка запланированных рассылок" />
                ) : scheduledBroadcasts.length === 0 ? (
                  <div className="text-center py-5 text-muted">Нет запланированных рассылок</div>
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table mb-0">
                      <thead>
                        <tr>
                          <th>МЕДИА</th>
                          <th>ТЕКСТ</th>
                          <th>РАСПИСАНИЕ</th>
                          <th>СТАТУС</th>
                          <th className="text-end">ДЕЙСТВИЯ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledBroadcasts.map(sb => (
                          <tr key={sb.id}>
                            <td>
                              {sb.image_url ? (
                                <img src={sb.image_url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} alt="thumb" />
                              ) : sb.video_url ? (
                                <span className="small fw-semibold">🎬 Видео</span>
                              ) : '-'}
                            </td>
                            <td style={{ maxWidth: '200px' }} className="text-truncate small">{sb.message}</td>
                            <td className="small">
                              <div className="fw-bold">{new Date(sb.scheduled_at).toLocaleString('ru-RU')}</div>
                              <div className="text-muted">
                                {sb.recurrence === 'daily' ? 'Ежедневно' :
                                  sb.recurrence === 'custom' ? `Дни: ${(sb.repeat_days || []).map(d => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d]).join(',')}` : 'Один раз'}
                              </div>
                            </td>
                            <td>
                              <Form.Check
                                type="switch"
                                checked={sb.is_active}
                                onChange={() => toggleScheduledBroadcast(sb.id)}
                              />
                            </td>
                            <td className="text-end">
                              <div className="d-flex gap-2 justify-content-end">
                                <Button variant="light" className="action-btn text-primary" onClick={() => startEditBroadcast(sb)} title="Редактировать">✏️</Button>
                                <Button variant="light" className="action-btn text-danger" onClick={() => deleteScheduledBroadcast(sb.id)} title="Удалить">🗑</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-light" style={{ minHeight: '400px' }}>
                {loadingHistory ? (
                  <TableSkeleton rows={5} columns={5} label="Загрузка истории рассылок" />
                ) : broadcastHistory.length === 0 ? (
                  <div className="text-center py-5 text-muted">История пуста</div>
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table mb-0">
                      <thead>
                        <tr>
                          <th>ДАТА ОТПРАВКИ</th>
                          <th>МЕДИА</th>
                          <th>СООБЩЕНИЕ</th>
                          <th>ПОЛУЧАТЕЛЕЙ</th>
                          <th className="text-end">ДЕЙСТВИЯ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadcastHistory.map(bh => (
                          <tr key={bh.id}>
                            <td className="small font-monospace">{new Date(bh.sent_at).toLocaleString('ru-RU')}</td>
                            <td>
                              {bh.image_url ? (
                                <img src={bh.image_url} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} alt="thumb" />
                              ) : bh.video_url ? (
                                <span className="small fw-semibold">🎬 Видео</span>
                              ) : '-'}
                            </td>
                            <td style={{ maxWidth: '300px' }} className="text-truncate small">{bh.message}</td>
                            <td><Badge className="badge-custom bg-info bg-opacity-10 text-info">{bh.messages_count}</Badge></td>
                            <td className="text-end">
                              <Button
                                variant="light"
                                className="action-btn text-danger w-auto px-2 fw-bold"
                                style={{ height: '32px' }}
                                onClick={() => deleteRemoteBroadcast(bh.id)}
                                title="Удалить у всех получателей"
                              >
                                🔥 Удалить везде
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer className="border-0 bg-white">
            <Button variant="link" onClick={() => setShowBroadcastModal(false)} className="text-decoration-none text-muted">
              {t('close') || 'Закрыть'}
            </Button>
            {broadcastModalTab === 'send' && (
              <Button
                variant="primary"
                onClick={sendBroadcast}
                className="px-5 py-2 rounded-pill fw-bold"
                style={{
                  background: isScheduled ? '#475569' : '#64748b',
                  border: '1px solid #475569',
                  color: '#ffffff'
                }}
                disabled={broadcastLoading || !broadcastForm.message.trim()}
              >
                {broadcastLoading ? '...' : isScheduled ? '📅 Запланировать' : '🚀 Отправить всем'}
              </Button>
            )}
          </Modal.Footer>
        </Modal>

        {/* Paste Import Modal */}
        <Modal
          show={showPasteImportModal}
          onHide={closePasteImportModal}
          size="xl"
          centered
          className="sa-global-products-paste-modal admin-operator-paste-modal"
          dialogClassName="sa-global-products-paste-dialog"
        >
          <Modal.Header closeButton className="sa-global-products-paste-header">
            <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap w-100 me-1">
              <Modal.Title className="sa-global-products-modal-title h6 mb-0">
                {language === 'uz' ? 'Exceldan mahsulotlar importi' : 'Импорт товаров из Excel'}
              </Modal.Title>
              <OverlayTrigger
                trigger="click"
                rootClose
                placement="bottom"
                overlay={(
                  <Popover id="admin-paste-import-hint" className="sa-global-products-hint-popover">
                    <Popover.Body className="small mb-0">
                      {language === 'uz'
                        ? "Excel'dan satrlarni nusxa oling va shu oynada Ctrl+V qiling. Har bir satr — bitta mahsulot; variantlar yaratilmaydi (tahrirdan keyin qo'lda)."
                        : 'Скопируйте строки из Excel и вставьте через Ctrl+V в этом окне. Каждая строка — один товар; варианты не создаются (их можно добавить вручную в карточке товара).'}
                    </Popover.Body>
                  </Popover>
                )}
              >
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  className="sa-global-products-paste-info-btn"
                  aria-label={language === 'uz' ? 'Yo‘riqnoma' : 'Справка по вставке'}
                >
                  i
                </Button>
              </OverlayTrigger>
            </div>
          </Modal.Header>
          <Modal.Body className="sa-global-products-paste-body">
            <Alert variant="info" className="sa-global-products-info-alert mb-0 d-flex gap-2 align-items-start">
              <span className="sa-global-products-info-icon" aria-hidden>ⓘ</span>
              <span>
                {language === 'uz'
                  ? 'Kategoriya: 1-daraja, 2-daraja, 3-daraja bo‘yicha kiriting.'
                  : 'Категория: укажите значения для Категория 1, Категория 2 и Категория 3.'}
              </span>
            </Alert>
            <p className="small text-muted mb-0">
              {language === 'uz'
                ? 'Exceldagi tartibda 3 ta namuna qator (ustunlar yuqoridagi kabi):'
                : 'Три примера строк в том же порядке столбцов, что в Excel:'}
            </p>
            <div className="sa-global-products-template-table-wrap admin-thin-scrollbar">
              <Table
                bordered
                hover
                size="sm"
                className="mb-0 sa-global-products-template-table sa-global-products-template-demo-table admin-operator-paste-demo-table"
              >
                <thead className="table-light">
                  <tr>
                    {OPERATOR_PASTE_IMPORT_TEMPLATE_HEADERS.map((h) => (
                      <th key={`op-paste-h-${h}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operatorPasteImportDemoRows.map((demoRow, rowIdx) => (
                    <tr key={`op-paste-demo-${rowIdx}`}>
                      {demoRow.map((cell, cellIdx) => (
                        <td key={`op-paste-cell-${rowIdx}-${cellIdx}`}>{cell ? String(cell) : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="sa-global-products-paste-toolbar justify-content-between align-items-center">
              <Button
                type="button"
                size="sm"
                className="btn-primary-custom sa-global-products-btn"
                onClick={handleDownloadOperatorPasteTemplate}
              >
                {language === 'uz' ? 'Excel shablonni yuklab olish (.xlsx)' : 'Скачать XLS-шаблон (.xlsx)'}
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                className="sa-global-products-btn sa-global-products-paste-clear"
                onClick={() => {
                  setPastedImportRows([]);
                  setPasteImportError('');
                }}
                disabled={pastedImportRows.length === 0}
              >
                {language === 'uz' ? 'Tozalash' : 'Очистить'}
              </Button>
            </div>

            <div
              className="sa-global-products-paste-focus-zone"
              onClick={() => pasteImportInputRef.current?.focus()}
              role="presentation"
            >
              <p className="sa-global-products-paste-short-hint small text-muted mb-0">
                {language === 'uz'
                  ? 'Ctrl+V — satrlar pastdagi jadvalga tushadi. Fokus avtomatik.'
                  : 'Вставьте через Ctrl+V — строки появятся в таблице ниже. Фокус устанавливается автоматически.'}
              </p>
              <Form.Control
                ref={pasteImportInputRef}
                as="textarea"
                tabIndex={0}
                rows={2}
                aria-label={language === 'uz' ? 'Exceldan Ctrl+V' : 'Вставка из Excel Ctrl+V'}
                className="sa-global-products-paste-textarea"
                placeholder={language === 'uz'
                  ? "Excel jadvalidan nusxa olib shu yerga Ctrl+V qiling"
                  : 'Скопируйте строки из Excel и вставьте сюда через Ctrl+V'}
                onPaste={handleProductsPasteImport}
              />
            </div>

            {pasteImportError && (
              <Alert variant="warning" className="sa-global-products-info-alert">
                {pasteImportError}
              </Alert>
            )}

            <section className="sa-global-products-paste-preview">
              <div className="sa-global-products-paste-preview-head">
                <span className="sa-global-products-paste-preview-label">
                  {language === 'uz' ? 'Aniqlangan satrlar' : 'Распознано строк'}
                </span>
                <span className="sa-global-products-paste-preview-count">{pastedImportRows.length}</span>
              </div>
              <div className="sa-global-products-paste-table-wrap admin-thin-scrollbar">
                <Table bordered hover size="sm" className="mb-0 sa-global-products-paste-table">
                  <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ minWidth: 48 }}>№</th>
                      <th style={{ minWidth: 140 }}>{language === 'uz' ? 'Nomi (RU)' : 'Название (RU)'}</th>
                      <th style={{ minWidth: 120 }}>{language === 'uz' ? 'Nomi (UZ)' : 'Название (UZ)'}</th>
                      <th style={{ minWidth: 72 }}>{language === 'uz' ? 'Narx' : 'Цена'}</th>
                      <th style={{ minWidth: 160 }}>{language === 'uz' ? 'Kategoriya' : 'Категория (из буфера)'}</th>
                      <th style={{ minWidth: 120 }}>{language === 'uz' ? 'Shtrix-kod / IKPU' : 'Штрихкод / ИКПУ'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastedImportRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted sa-global-products-paste-empty">
                          {language === 'uz' ? 'Hali qatorlar yo‘q' : 'Пока нет вставленных строк'}
                        </td>
                      </tr>
                    ) : (
                      pastedImportRows.map((row) => (
                        <tr key={`pasted-import-row-${row.rowNo}`}>
                          <td>{row.rowNo}</td>
                          <td>{row.name_ru || '—'}</td>
                          <td>{row.name_uz || '—'}</td>
                          <td>{row.price_raw || '—'}</td>
                          <td>
                            {[
                              row.sourceCategoryLevel1,
                              row.sourceCategoryLevel2,
                              row.sourceCategoryLevel3
                            ].filter(Boolean).join(' | ') || '—'}
                          </td>
                          <td>
                            <div>{row.barcode || '—'}</div>
                            <div className="small text-muted">{row.ikpu || '—'}</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </section>
          </Modal.Body>
          <Modal.Footer className="sa-global-products-modal-footer d-flex flex-wrap gap-2 justify-content-end">
            <Button variant="outline-secondary" className="sa-global-products-btn" onClick={closePasteImportModal}>
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button
              className="btn-primary-custom sa-global-products-btn"
              onClick={continuePasteImportToReview}
              disabled={pastedImportRows.length === 0}
            >
              {language === 'uz' ? 'Keyingi: tekshirish' : 'Далее: проверка'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Excel Import Modal */}
        <Modal show={showExcelModal} onHide={closeExcelImportModal} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Импорт товаров из Excel</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info">
              <strong>Формат файла:</strong><br />
              Первая строка — заголовки столбцов. Обязательные столбцы:<br />
              • <code>Название (RU)</code> или <code>Название</code> — название товара<br />
              • <code>Цена</code> — цена товара<br />
              Дополнительные столбцы:<br />
              • <code>Категория 1</code>, <code>Категория 2</code>, <code>Категория 3</code> — связка категорий по уровням<br />
              • <code>Название (UZ)</code> — название на узбекском<br />
              • <code>Описание (RU)</code> — описание товара на русском<br />
              • <code>Описание (UZ)</code> — описание товара на узбекском<br />
              • <code>Единица</code> — единица измерения (шт, кг, порция и т.д.)<br />
              • <code>Штрихкод</code> — штрихкод товара<br />
              • <code>ИКПУ</code> — код ИКПУ<br />
              • <code>В наличии</code> — Да/Нет<br />
              • <code>Сезонность</code> — Всесезонный / Весна / Лето / Осень / Зима<br />
              • <code>Скрыть из каталога</code> — Да/Нет<br />
              <span className="text-muted">
                Фасовка и шаг заказа при импорте не заполняются: оператор задаёт их вручную.
              </span>
            </Alert>

            <Form.Group className="mb-3">
              <Form.Label>Выберите файл Excel (.xlsx, .xls, .csv)</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFile}
              />
            </Form.Group>

            {excelPreview.length > 0 && (
              <div className="mt-3">
                <strong>Предпросмотр (первые 10 строк):</strong>
                <div className="table-responsive mt-2" style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <table className="table table-sm table-bordered">
                    <thead className="table-light">
                      <tr>
                        {excelPreview[0]?.map((cell, idx) => (
                          <th key={idx} style={{ fontSize: '0.8rem' }}>{cell || `Столбец ${idx + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.slice(1).map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          {row.map((cell, idx) => (
                            <td key={idx} style={{ fontSize: '0.8rem' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeExcelImportModal}>
              Отмена
            </Button>
            <Button
              variant="success"
              onClick={importExcel}
              disabled={importingExcel || !excelFile}
            >
              {importingExcel ? 'Импорт...' : 'Импортировать'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Import Review Modal */}
        <Modal show={showImportReviewModal} onHide={closeImportReviewModal} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>Проверка импорта товаров</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="secondary">
              <div className="d-flex flex-wrap gap-3">
                <span>Всего строк: <strong>{preparedImportRows.length}</strong></span>
                <span>Валидных: <strong>{preparedImportRows.filter((row) => row.isValid).length}</strong></span>
                <span>Невалидных: <strong>{preparedImportRows.filter((row) => !row.isValid).length}</strong></span>
              </div>
            </Alert>

            <div className="d-flex justify-content-start mb-3">
              <Button
                variant="outline-danger"
                onClick={removeInvalidPreparedRows}
                disabled={!preparedImportRows.some((row) => !row.isValid)}
              >
                Удалить непроходимые товары
              </Button>
            </div>

            <div className="table-responsive" style={{ maxHeight: '65vh', overflow: 'auto' }}>
              <Table bordered hover size="sm" className="mb-0">
                <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ minWidth: '70px' }}>Строка</th>
                    <th style={{ minWidth: '180px' }}>Название</th>
                    <th style={{ minWidth: '110px' }}>Цена</th>
                    <th style={{ minWidth: '170px' }}>Штрихкод / ИКПУ</th>
                    <th style={{ minWidth: '360px' }}>Категория (выбор из системы)</th>
                    <th style={{ minWidth: '260px' }}>Данные из файла</th>
                    <th style={{ minWidth: '190px' }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {preparedImportRows.map((row) => (
                    <tr key={`prepared-row-${row.rowNo}`} className={row.isValid ? '' : 'table-danger'}>
                      <td>{row.rowNo}</td>
                      <td>{row.name_ru || '-'}</td>
                      <td>{Number.isFinite(row.price) ? row.price : '-'}</td>
                      <td>
                        <div className="small">{row.barcode || '-'}</div>
                        <div className="small text-muted">{row.ikpu || '-'}</div>
                      </td>
                      <td>
                        <Dropdown>
                          <Dropdown.Toggle as={CustomToggle} id={`import-category-${row.rowNo}`} className="form-select-sm">
                            {row.category_id
                              ? (importCategoryById.get(String(row.category_id))?.path || row.category_label || `ID ${row.category_id}`)
                              : 'Выберите категорию'}
                          </Dropdown.Toggle>
                          <Dropdown.Menu as={CustomMenu}>
                            {importAssignableCategories.map((cat) => (
                              <Dropdown.Item
                                key={`import-assignable-cat-${cat.id}-${row.rowNo}`}
                                onClick={() => updatePreparedImportCategory(row.rowNo, cat.id)}
                              >
                                {cat.path}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      </td>
                      <td>
                        <div className="small text-muted">ID: {row.sourceCategoryId || '-'}</div>
                        <div className="small text-muted">Путь: {row.sourceCategoryPath || '-'}</div>
                        <div className="small text-muted">Название: {row.sourceCategoryName || '-'}</div>
                      </td>
                      <td>
                        {row.isValid ? (
                          <Badge bg="success">Готово к записи</Badge>
                        ) : (
                          <>
                            <Badge bg="danger">Проверить</Badge>
                            <div className="small mt-1 text-danger">{row.error}</div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeImportReviewModal}>
              Отмена
            </Button>
            <Button
              variant="success"
              onClick={importPreparedRows}
              disabled={savingImportRows || !preparedImportRows.some((row) => row.isValid)}
            >
              {savingImportRows ? 'Запись...' : 'Записать'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Stock Import Modal */}
        <Modal
          show={showStockExcelModal}
          onHide={closeStockExcelImportModal}
          size="xl"
          dialogClassName="admin-stock-import-modal"
        >
          <Modal.Header closeButton>
            <Modal.Title>
              {language === 'uz' ? "Variant qoldiqlarini import" : 'Импорт остатков (варианты)'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info" className="mb-3">
              {language === 'uz'
                ? "Avval 'Qoldiq shabloni' ni yuklab oling. Faylga faqat 'Приход (шт)' ustunini to'ldiring va qayta yuklang."
                : "Сначала скачайте шаблон остатков. В файле заполняйте столбец 'Приход (шт)' и загрузите обратно."}
            </Alert>
            <Form.Group className="mb-3">
              <Form.Label>{language === 'uz' ? 'Excel faylni tanlang (.xlsx, .xls, .csv)' : 'Выберите файл Excel (.xlsx, .xls, .csv)'}</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleStockExcelFile}
              />
            </Form.Group>

            {stockExcelPreview.length > 0 && (
              <div className="mt-3">
                {(() => {
                  const headerRow = stockExcelPreview[0] || [];
                  const photoColumnIndex = headerRow.findIndex((cell) => {
                    const normalized = String(cell || '').trim().toLowerCase();
                    return normalized === 'фото' || normalized === 'photo';
                  });
                  return (
                    <>
                <strong>
                  {language === 'uz'
                    ? `Oldindan ko'rish (satrlar: ${Math.max(0, stockExcelPreview.length - 1)})`
                    : `Предпросмотр (строк: ${Math.max(0, stockExcelPreview.length - 1)})`}
                </strong>
                <div className="table-responsive mt-2" style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        {stockExcelPreview[0]?.map((cell, idx) => (
                          <th key={`stock-preview-head-${idx}`} style={{ fontSize: '0.8rem' }}>{cell || `Столбец ${idx + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stockExcelPreview.slice(1).map((row, rowIdx) => (
                        <tr key={`stock-preview-row-${rowIdx}`}>
                          {(stockExcelPreview[0] || []).map((_, idx) => (
                            <td key={`stock-preview-cell-${rowIdx}-${idx}`} style={{ fontSize: '0.8rem' }}>
                              {photoColumnIndex === idx ? (
                                (() => {
                                  const rawCell = String(row?.[idx] ?? '').trim();
                                  if (!rawCell) return '';
                                  const previewSrc = resolveAbsoluteMediaUrl(rawCell);
                                  return (
                                    <button
                                      type="button"
                                      className="admin-stock-preview-photo-btn"
                                      onClick={() => {
                                        setPreviewImageUrl(previewSrc);
                                        setShowImagePreview(true);
                                      }}
                                    >
                                      <img
                                        src={previewSrc || PRODUCT_PLACEHOLDER_IMAGE}
                                        alt="preview"
                                        className="admin-stock-preview-photo"
                                      />
                                    </button>
                                  );
                                })()
                              ) : (
                                String(row?.[idx] ?? '')
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                    </>
                  );
                })()}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeStockExcelImportModal}>
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button
              variant="warning"
              onClick={prepareVariantStockImport}
              disabled={importingStockExcel || !stockExcelFile}
            >
              {importingStockExcel
                ? (language === 'uz' ? 'Tayyorlanmoqda...' : 'Подготовка...')
                : (language === 'uz' ? "Tekshiruvga o'tish" : 'Далее: проверка')}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Stock Import Review Modal */}
        <Modal
          show={showStockImportReviewModal}
          onHide={closeStockImportReviewModal}
          size="xl"
          dialogClassName="admin-stock-import-review-modal"
        >
          <Modal.Header closeButton>
            <Modal.Title>
              {language === 'uz' ? 'Qoldiqlarni tekshirish' : 'Проверка импорта остатков'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="secondary">
              <div className="d-flex flex-wrap gap-3 align-items-center">
                <span>{language === 'uz' ? 'Jami satr:' : 'Всего строк:'} <strong>{preparedStockImportRows.length}</strong></span>
                <span>{language === 'uz' ? 'Yaroqli:' : 'Валидных:'} <strong>{preparedStockImportRows.filter((row) => row.isValid).length}</strong></span>
                <span>{language === 'uz' ? 'Xato:' : 'Невалидных:'} <strong>{preparedStockImportRows.filter((row) => !row.isValid).length}</strong></span>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <Form.Check
                    type="switch"
                    id="stock-import-add-mode-switch"
                    className="fw-semibold"
                    label={language === 'uz' ? "Summalash (eski + kirim)" : 'Суммировать (старый + приход)'}
                    checked={normalizeStockImportMode(stockImportMode) === 'add'}
                    onChange={(e) => setStockImportMode(e.target.checked ? 'add' : 'replace')}
                  />
                </div>
              </div>
            </Alert>

            <div className="table-responsive" style={{ maxHeight: '66vh', overflow: 'auto' }}>
              <Table bordered hover size="sm" className="mb-0">
                <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ minWidth: 64, textAlign: 'center' }}>#</th>
                    <th style={{ minWidth: 88, textAlign: 'center' }}>{language === 'uz' ? 'Foto' : 'Фото'}</th>
                    <th style={{ minWidth: 280 }}>{language === 'uz' ? 'Tovar / Variant' : 'Товар / Вариант'}</th>
                    <th style={{ minWidth: 110 }}>{language === 'uz' ? 'Joriy' : 'Текущий'}</th>
                    <th style={{ minWidth: 140 }}>{language === 'uz' ? 'Kirim' : 'Приход'}</th>
                    <th style={{ minWidth: 130 }} className="admin-stock-import-result-head">{language === 'uz' ? 'Natija' : 'Результат'}</th>
                    <th style={{ minWidth: 170 }}>{language === 'uz' ? 'Holat' : 'Статус'}</th>
                  </tr>
                </thead>
                <tbody>
                  {preparedStockImportRows.map((row) => (
                    <tr key={`prepared-stock-row-${row.rowNo}`} className={row.isValid ? '' : 'table-danger'}>
                      <td style={{ textAlign: 'center' }}>{row.rowNo}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="admin-stock-preview-photo-btn"
                          onClick={() => {
                            setPreviewImageUrl(row.image_url || PRODUCT_PLACEHOLDER_IMAGE);
                            setShowImagePreview(true);
                          }}
                        >
                          <img
                            src={row.image_url || PRODUCT_PLACEHOLDER_IMAGE}
                            alt={row.product_name || 'product'}
                            className="admin-stock-preview-photo"
                          />
                        </button>
                      </td>
                      <td>
                        <div className="fw-semibold">{row.product_name || '-'}</div>
                        <div className="small text-muted">
                          {row.variant_name ? `Variant: ${row.variant_name}` : (language === 'uz' ? 'Variant yo‘q' : 'Без варианта')}
                        </div>
                      </td>
                      <td>{formatQuantity(Number(row.current_stock || 0))}</td>
                      <td>
                        <Form.Control
                          size="sm"
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.incoming_quantity}
                          onChange={(e) => updatePreparedStockImportQuantity(row.rowNo, e.target.value)}
                        />
                      </td>
                      <td className="admin-stock-import-result-cell">{formatQuantity(getStockImportNextQuantity(row))}</td>
                      <td>
                        {row.isValid ? (
                          <Badge bg="success">{language === 'uz' ? 'Tayyor' : 'Готово'}</Badge>
                        ) : (
                          <>
                            <Badge bg="danger">{language === 'uz' ? 'Xato' : 'Ошибка'}</Badge>
                            <div className="small text-danger mt-1">{row.error}</div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeStockImportReviewModal}>
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button
              variant="warning"
              onClick={applyPreparedStockImportRows}
              disabled={savingStockImportRows || !preparedStockImportRows.some((row) => row.isValid)}
            >
              {savingStockImportRows
                ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                : (language === 'uz' ? 'Tasdiqlash va saqlash' : 'Подтвердить и сохранить')}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Image Preview Modal */}
        <Modal show={showImagePreview} onHide={() => setShowImagePreview(false)} centered size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Просмотр изображения</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center p-0">
            <img
              src={previewImageUrl}
              alt="Preview"
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          </Modal.Body>
        </Modal>

        {/* Cancel Order Modal */}
        <Modal show={showCancelModal} onHide={() => setShowCancelModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>❌ Отмена заказа</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted mb-3">
              Вы уверены, что хотите отменить этот заказ? Укажите причину отмены:
            </p>
            <Form.Group>
              <Form.Label>Причина отмены <span className="text-danger">*</span></Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Например: клиент отказался, нет товара в наличии, ошибка в заказе..."
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCancelModal(false)}>
              Назад
            </Button>
            <Button
              variant="danger"
              onClick={confirmCancelOrder}
              disabled={!cancelReason.trim()}
            >
              Отменить заказ
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Feedback Detail Modal */}
        <Modal show={showFeedbackModal} onHide={() => setShowFeedbackModal(false)} centered size="lg">
          <Modal.Header closeButton>
            <Modal.Title>
              Обращение #{selectedFeedback?.id}
              {selectedFeedback && (
                <Badge bg={
                  selectedFeedback.type === 'complaint' ? 'danger' :
                    selectedFeedback.type === 'suggestion' ? 'info' :
                      selectedFeedback.type === 'question' ? 'warning' : 'secondary'
                } className="ms-2">
                  {selectedFeedback.type === 'complaint' ? 'Жалоба' :
                    selectedFeedback.type === 'suggestion' ? 'Предложение' :
                      selectedFeedback.type === 'question' ? 'Вопрос' : 'Другое'}
                </Badge>
              )}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedFeedback && (
              <>
                <div className="mb-3 p-3 bg-light rounded">
                  <div className="row">
                    <div className="col-md-6">
                      <strong>Клиент:</strong> {selectedFeedback.customer_name}
                    </div>
                    <div className="col-md-6">
                      <strong>Телефон:</strong>{' '}
                      <a href={`tel:${selectedFeedback.customer_phone}`}>
                        {selectedFeedback.customer_phone}
                      </a>
                    </div>
                  </div>
                  <div className="row mt-2">
                    <div className="col-md-6">
                      <strong>Дата:</strong> {new Date(selectedFeedback.created_at).toLocaleString()}
                    </div>
                    <div className="col-md-6">
                      <strong>Статус:</strong>{' '}
                      <Badge bg={
                        selectedFeedback.status === 'new' ? 'primary' :
                          selectedFeedback.status === 'in_progress' ? 'warning' :
                            selectedFeedback.status === 'resolved' ? 'success' : 'secondary'
                      }>
                        {selectedFeedback.status === 'new' ? 'Новый' :
                          selectedFeedback.status === 'in_progress' ? 'В работе' :
                            selectedFeedback.status === 'resolved' ? 'Решено' : 'Закрыто'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Сообщение клиента:</label>
                  <div className="p-3 border rounded bg-white" style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedFeedback.message}
                  </div>
                </div>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Ваш ответ:</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={feedbackResponse}
                    onChange={(e) => setFeedbackResponse(e.target.value)}
                    placeholder="Введите ответ на обращение..."
                  />
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowFeedbackModal(false)}>
              Закрыть
            </Button>
            {selectedFeedback?.status === 'new' && (
              <Button variant="warning" onClick={() => handleFeedbackResponse('in_progress')}>
                Взять в работу
              </Button>
            )}
            {(selectedFeedback?.status === 'new' || selectedFeedback?.status === 'in_progress') && (
              <Button variant="success" onClick={() => handleFeedbackResponse('resolved')}>
                Решено
              </Button>
            )}
            {selectedFeedback?.status !== 'closed' && (
              <Button variant="dark" onClick={() => handleFeedbackResponse('closed')}>
                Закрыть
              </Button>
            )}
          </Modal.Footer>
        </Modal>

        {/* Container Modal */}
        <Modal show={showContainerModal} onHide={() => setShowContainerModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>{selectedContainer ? t('editContainer') : t('addContainer')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>{t('containerName')}</Form.Label>
              <Form.Control
                type="text"
                placeholder={t('containerNamePlaceholder')}
                value={containerForm.name}
                onChange={(e) => setContainerForm({ ...containerForm, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('containerPrice')}</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="100"
                value={containerForm.price}
                onChange={(e) => setContainerForm({ ...containerForm, price: parseFloat(e.target.value) || 0 })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('sortOrderLabel')}</Form.Label>
              <Form.Control
                type="number"
                value={containerForm.sort_order}
                onChange={(e) => setContainerForm({ ...containerForm, sort_order: parseInt(e.target.value) || 0 })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowContainerModal(false)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={saveContainer} disabled={!containerForm.name}>
              {selectedContainer ? t('save') : t('add')}
            </Button>
          </Modal.Footer>
        </Modal>
        {/* Operator Modal */}
        <Modal show={showOperatorModal} onHide={() => setShowOperatorModal(false)} centered>
          <Form onSubmit={saveOperator}>
            <Modal.Header closeButton>
              <Modal.Title>{editingOperator ? 'Редактировать оператора' : 'Добавить оператора (заменшика)'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {!editingOperator && (
                <Alert variant="info" className="small border-0 shadow-sm rounded-3">
                  Вы можете добавить существующего пользователя по <b>username</b> или создать нового с ролью "Оператор".
                </Alert>
              )}
              <Form.Group className="mb-3">
                <Form.Label>Username *</Form.Label>
                <Form.Control
                  required
                  type="text"
                  placeholder="name2024"
                  value={operatorForm.username}
                  onChange={e => setOperatorForm({ ...operatorForm, username: e.target.value })}
                  disabled={!!editingOperator}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Пароль {!editingOperator && '(для нового пользователя)'}</Form.Label>
                <Form.Control
                  type="password"
                  placeholder={editingOperator ? "Оставьте пустым, чтобы не менять" : "********"}
                  value={operatorForm.password}
                  onChange={e => setOperatorForm({ ...operatorForm, password: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Полное имя</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Иван Иванов"
                  value={operatorForm.full_name}
                  onChange={e => setOperatorForm({ ...operatorForm, full_name: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Телефон</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="+99890XXXXXXX"
                  value={operatorForm.phone}
                  onChange={e => setOperatorForm({ ...operatorForm, phone: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Telegram ID</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="123456789"
                  value={operatorForm.telegram_id}
                  onChange={e => setOperatorForm({ ...operatorForm, telegram_id: e.target.value })}
                />
                <Form.Text className="text-muted">
                  Узнать свой ID можно у бота командой /id. Нужно для получения тестовых уведомлений в личку.
                </Form.Text>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowOperatorModal(false)}>Отмена</Button>
              <Button variant="primary" type="submit">{editingOperator ? 'Сохранить' : 'Добавить'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>
        <Modal show={showDeliveryZoneModal} onHide={() => setShowDeliveryZoneModal(false)} size="lg" centered className="rounded-4 overflow-hidden border-0">
          <Modal.Header closeButton className="border-0 pb-0">
            <Modal.Title className="h5 fw-bold">🗺️ Зона доставки</Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-4 pt-2">
            <div className="mb-3">
              <label className="small fw-bold text-muted text-uppercase mb-2 d-block">Рисование области доставки</label>
              <DeliveryZonePicker
                deliveryZone={restaurantSettings?.delivery_zone}
                onZoneChange={(zone) => setRestaurantSettings((prev) => (prev ? { ...prev, delivery_zone: zone } : prev))}
                center={[restaurantSettings?.latitude || 41.311081, restaurantSettings?.longitude || 69.240562]}
              />
            </div>

            <Alert variant="info" className="border-0 shadow-sm rounded-4 mb-0" style={{ background: '#eef2f7', color: '#374151' }}>
              <div className="fw-bold mb-1">Инструкция:</div>
              <ol className="small mb-0 ps-3">
                <li>Нажмите на иконку многоугольника (⬠) справа на карте</li>
                <li>Кликайте по карте, чтобы отметить точки границы зоны доставки</li>
                <li>Завершите многоугольник, кликнув на первую точку</li>
                <li>При необходимости перетащите точки мышкой, чтобы подправить контур</li>
                <li>Нажмите кнопку "Готово", чтобы сохранить изменения</li>
              </ol>
            </Alert>
          </Modal.Body>
          <Modal.Footer className="border-0">
            <Button variant="primary" className="px-5 rounded-pill fw-bold" onClick={() => setShowDeliveryZoneModal(false)}>
              Готово
            </Button>
          </Modal.Footer>
        </Modal>

      </Container>
      </div>
    </>
  );
}

export default AdminDashboard;


