import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useDeferredValue, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Navbar from 'react-bootstrap/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCart, formatPrice, formatQuantity, resolveQuantityStep } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';
import { useShowcase } from '../context/ShowcaseContext';
import BottomNav from '../components/BottomNav';
import ClientAccountModal from '../components/ClientAccountModal';
import ClientLocationPicker from '../components/ClientLocationPicker';
import HeartIcon from '../components/HeartIcon';
import { ListSkeleton, PageSkeleton } from '../components/SkeletonUI';
import StorefrontLoader from '../components/StorefrontLoader';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const CATALOG_ANIMATION_SEASONS = ['off', 'spring', 'summer', 'autumn', 'winter'];
const MENU_VIEW_MODES = ['grid_categories', 'single_list', 'nested_categories'];
const CATALOG_CARD_MODES = ['wide', 'portrait'];
const HIDE_CATALOG_SECTION_TABS = true;
const catalogSectionTabKey = (id) => (
  id === null || id === undefined ? '' : String(id)
);
const CATALOG_SEARCH_RESULTS_LIMIT = 80;
const PENDING_PRODUCT_REVIEW_SNOOZE_MS = 24 * 60 * 60 * 1000;
const LANGUAGE_STORAGE_KEY = 'language';
const CATALOG_CARD_SWIPE_THRESHOLD_PX = 34;
const CATALOG_CARD_SWIPE_BLOCK_CLICK_MS = 320;
const normalizeCatalogAnimationSeason = (value, fallback = 'off') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CATALOG_ANIMATION_SEASONS.includes(normalized) ? normalized : fallback;
};
const normalizeMenuViewMode = (value, fallback = 'grid_categories') => {
  const normalized = String(value || '').trim().toLowerCase();
  return MENU_VIEW_MODES.includes(normalized) ? normalized : fallback;
};
const normalizeCatalogCardMode = (value, fallback = 'wide') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CATALOG_CARD_MODES.includes(normalized) ? normalized : fallback;
};
const normalizeMenuGlassOpacity = (value, fallback = 34) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(20, Math.min(60, Math.round(parsed)));
};
const normalizeMenuGlassBlur = (value, fallback = 16) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(8, Math.min(24, Math.round(parsed)));
};
const normalizeId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const CartLucideIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2h2l2.66 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L22 6H6" />
  </svg>
);

const SearchLucideIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const UserLucideIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 21a7 7 0 0 0-14 0" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);


const ShareLucideIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.59 13.51 6.83 3.98" />
    <path d="m15.41 7.51-6.82 3.98" />
  </svg>
);

function Catalog({ publicStorefront = false, publicRestaurantId = null, publicBotHref = '', publicRestaurantMeta = null } = {}) {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [prevRestaurant, setPrevRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [adBanners, setAdBanners] = useState([]);
  const [activeAdIndex, setActiveAdIndex] = useState(0);
  const [entryPopupBanner, setEntryPopupBanner] = useState(null);
  const [showEntryPopupModal, setShowEntryPopupModal] = useState(false);
  const [showLanguageSetupModal, setShowLanguageSetupModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState('ru');
  const [selectedCategory, setSelectedCategory] = useState(null); // selected folder category id
  const [activeSubcategoryTab, setActiveSubcategoryTab] = useState(null);
  const [catalogQtyOpen, setCatalogQtyOpen] = useState({});
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = useState(false);
  const [catalogHeaderHeight, setCatalogHeaderHeight] = useState(56);
  const [catalogSearchPlaceholderPhraseIndex, setCatalogSearchPlaceholderPhraseIndex] = useState(0);
  const [catalogSearchPlaceholderCharIndex, setCatalogSearchPlaceholderCharIndex] = useState(0);
  const [catalogSearchPlaceholderDeleting, setCatalogSearchPlaceholderDeleting] = useState(false);
  const [catalogScrollProgress, setCatalogScrollProgress] = useState(0);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryProductName, setGalleryProductName] = useState('');
  const [showProductDetailsModal, setShowProductDetailsModal] = useState(false);
  const [productDetailsLoading, setProductDetailsLoading] = useState(false);
  const [productDetailsError, setProductDetailsError] = useState('');
  const [selectedProductSummary, setSelectedProductSummary] = useState(null);
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [productReviews, setProductReviews] = useState([]);
  const [productReviewsTotal, setProductReviewsTotal] = useState(0);
  const [productReviewsAverage, setProductReviewsAverage] = useState(0);
  const [productReviewsHasMore, setProductReviewsHasMore] = useState(false);
  const [productReviewsLoadingMore, setProductReviewsLoadingMore] = useState(false);
  const [productReviewRating, setProductReviewRating] = useState(5);
  const [productReviewComment, setProductReviewComment] = useState('');
  const [productReviewSubmitting, setProductReviewSubmitting] = useState(false);
  const [showProductReviewComposer, setShowProductReviewComposer] = useState(false);
  const [showAllProductReviews, setShowAllProductReviews] = useState(false);
  const [productReviewPermissions, setProductReviewPermissions] = useState({
    is_authenticated: false,
    has_successful_order: false,
    can_review: false
  });
  const [pendingProductReviewItems, setPendingProductReviewItems] = useState([]);
  const [showPendingProductReviewModal, setShowPendingProductReviewModal] = useState(false);
  const [pendingProductReviewRating, setPendingProductReviewRating] = useState(5);
  const [pendingProductReviewComment, setPendingProductReviewComment] = useState('');
  const [pendingProductReviewSubmitting, setPendingProductReviewSubmitting] = useState(false);
  const [pendingProductReviewError, setPendingProductReviewError] = useState('');
  const [productWeeklyBuyers, setProductWeeklyBuyers] = useState(0);
  const [productWeeklyOrders, setProductWeeklyOrders] = useState(0);
  const [productWeeklySoldCount, setProductWeeklySoldCount] = useState(0);
  const [selectedProductVariants, setSelectedProductVariants] = useState({});
  const [catalogCardImageIndexes, setCatalogCardImageIndexes] = useState({});
  const [productHeroIndex, setProductHeroIndex] = useState(0);
  const [catalogAnimationSeason, setCatalogAnimationSeason] = useState('off');
  const [loading, setLoading] = useState(true);
  const [shareFallbackModal, setShareFallbackModal] = useState({
    show: false,
    title: '',
    text: '',
    url: ''
  });
  const [shareActionActive, setShareActionActive] = useState('');
  const [catalogTabsLayout, setCatalogTabsLayout] = useState({
    startSpacerWidth: 0,
    endSpacerWidth: 0
  });
  const { user, isOperator, logout } = useAuth();
  const { addToCart, updateQuantity, removeFromCart, clearCart, cart, cartTotal, productTotal, containerTotal, setOverrideRestaurantId: setCartOverrideRestaurantId } = useCart();
  const { toggleFavorite, isFavorite, setOverrideRestaurantId: setFavoritesOverrideRestaurantId } = useFavorites();
  const { language, t, setCountryCurrency, setLanguage } = useLanguage();
  const { menuVisible, categoryStyleSettings, loadShowcase } = useShowcase();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth >= 992 : false
  ));

  const productGroupRefs = useRef({});
  const viewedAdsRef = useRef(new Set());
  const catalogHeaderRef = useRef(null);
  const catalogSearchInputRef = useRef(null);
  const categoryListScrollOffsetRef = useRef(0);
  const isDataFetchInProgressRef = useRef(false);
  const catalogFetchIdRef = useRef(0);
  const lastActiveRestaurantForCatalogRef = useRef(null);
  const level3TabsScrollerRef = useRef(null);
  const level3TabButtonRefs = useRef({});
  const tabScrollSpyRafRef = useRef(null);
  const scrollProgressRafRef = useRef(null);
  const tabScrollLockTimeoutRef = useRef(null);
  const galleryTouchStartXRef = useRef(null);
  const galleryTouchStartYRef = useRef(null);
  const gallerySwipeLockedRef = useRef(false);
  const productHeroTouchStartXRef = useRef(null);
  const productHeroTouchStartYRef = useRef(null);
  const productHeroSwipeTriggeredRef = useRef(false);
  const pendingProductReviewsLoadedRef = useRef(false);
  const isTabAutoScrollRef = useRef(false);
  const tabActivationSourceRef = useRef('init');
  const activeSubcategoryTabRef = useRef(null);
  const showcaseEntryScrollOffsetRef = useRef(0);
  const showcaseEntryCategoryRef = useRef(null);
  const catalogCardTouchStartRef = useRef({});
  const catalogCardSwipeTimestampRef = useRef({});
  const catalogHeaderBackground = '#f8fafc';
  const catalogTabGap = 8;
  const isTelegramWebView = useMemo(() => (
    typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp)
  ), []);
  const shouldShowDesktopLogout = isDesktopViewport && !isTelegramWebView && !isOperator() && !publicStorefront;
  const requestedShareContext = useMemo(() => {
    const searchParams = new URLSearchParams(location.search || '');
    const requestedProductId = normalizeId(searchParams.get('product_id'));
    const requestedRestaurantId = normalizeId(searchParams.get('restaurant_id'));
    if (!requestedProductId || !requestedRestaurantId) {
      return { productId: null, restaurantId: null };
    }
    return { productId: requestedProductId, restaurantId: requestedRestaurantId };
  }, [location.search]);
  const requestedShareRestaurantId = requestedShareContext.restaurantId;

  // Публичная витрина (talablar.app/<slug>): открывается без входа, привязана к магазину из slug.
  // Все действия, требующие заказа/аккаунта, перенаправляются в Telegram-бот магазина.
  const isPublicStorefront = Boolean(publicStorefront);
  // На публичной витрине заказ всегда идёт через Telegram, даже если в localStorage
  // осталась чужая сессия (актуально для встроенного браузера Telegram на мобиле).
  const isGuestStorefront = isPublicStorefront;
  // Гостевое оформление заказа с витрины (без авторизации, без SMS).
  // Шаги мастера: 1) Корзина 2) Адрес (карта) 3) Контакты + отправка.
  const [showStorefrontCartModal, setShowStorefrontCartModal] = useState(false);
  const [storefrontStep, setStorefrontStep] = useState(1);
  const [storefrontOrderForm, setStorefrontOrderForm] = useState({
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    address_house: '',
    address_apartment: '',
    address_doorcode: '',
    comment: '',
    delivery_lat: null,
    delivery_lng: null,
    fulfillment_type: 'delivery', // 'delivery' | 'pickup'
    delivery_time_type: 'asap',   // 'asap' | 'scheduled'
    delivery_date: '',
    payment_method: 'cash',       // 'cash' | 'card' | 'click'
    promo_code: ''
  });
  const [storefrontPromoState, setStorefrontPromoState] = useState({ status: 'idle', discount: 0, message: '' });
  const [storefrontPromoLoading, setStorefrontPromoLoading] = useState(false);
  const [storefrontGeolocating, setStorefrontGeolocating] = useState(false);
  // Управление видимостью кнопки «Определить» и поля адреса.
  // Изначально показываем только кнопку под картой; после определения — скрываем её и показываем поле.
  // Если пользователь сдвинет маркер — кнопка снова появится, поле остаётся.
  const [storefrontShowGpsButton, setStorefrontShowGpsButton] = useState(true);
  const [storefrontShowAddressField, setStorefrontShowAddressField] = useState(false);

  // Спросить браузер о текущей геолокации и подставить в форму.
  const requestStorefrontGeolocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setStorefrontGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setStorefrontOrderForm((prev) => ({ ...prev, delivery_lat: lat, delivery_lng: lng }));
          setStorefrontShowGpsButton(false);
          setStorefrontShowAddressField(true);
        }
        setStorefrontGeolocating(false);
      },
      () => { setStorefrontGeolocating(false); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  // На шаге 2 (если доставка и координат ещё нет) — сразу попросить браузер о локации.
  useEffect(() => {
    if (!isPublicStorefront) return;
    if (!showStorefrontCartModal) return;
    if (storefrontStep !== 2) return;
    if (storefrontOrderForm.fulfillment_type === 'pickup') return;
    if (storefrontOrderForm.delivery_lat && storefrontOrderForm.delivery_lng) return;
    requestStorefrontGeolocation();
  }, [isPublicStorefront, showStorefrontCartModal, storefrontStep, storefrontOrderForm.fulfillment_type, storefrontOrderForm.delivery_lat, storefrontOrderForm.delivery_lng, requestStorefrontGeolocation]);
  const [storefrontOrderSubmitting, setStorefrontOrderSubmitting] = useState(false);
  const [storefrontOrderError, setStorefrontOrderError] = useState('');
  const [storefrontOrderSuccess, setStorefrontOrderSuccess] = useState(''); // order_number
  const [storefrontCardCopied, setStorefrontCardCopied] = useState(false);
  // Услуги и доставка — как в Telegram WebApp корзине
  const [storefrontDeliveryCost, setStorefrontDeliveryCost] = useState(0);
  const [storefrontDeliveryDistance, setStorefrontDeliveryDistance] = useState(0);
  const [storefrontDeliveryLoading, setStorefrontDeliveryLoading] = useState(false);
  const [storefrontDeliveryOutOfZone, setStorefrontDeliveryOutOfZone] = useState(false);
  const storefrontServiceFee = Number(publicRestaurantMeta?.service_fee) || 0;
  const storefrontIsDeliveryEnabled = publicRestaurantMeta?.is_delivery_enabled !== false;
  const storefrontIsPickupEnabled = publicRestaurantMeta?.is_pickup_enabled !== false;
  // Магазин запретил самовывоз — насильно держим режим доставки, иначе будет недостижимое состояние.
  useEffect(() => {
    if (!isPublicStorefront) return;
    if (storefrontIsPickupEnabled) return;
    if (storefrontOrderForm.fulfillment_type === 'pickup') {
      setStorefrontOrderForm((prev) => ({ ...prev, fulfillment_type: 'delivery' }));
    }
  }, [isPublicStorefront, storefrontIsPickupEnabled, storefrontOrderForm.fulfillment_type]);
  const storefrontEffectiveDeliveryCost = storefrontOrderForm.fulfillment_type === 'pickup' ? 0 : storefrontDeliveryCost;
  const storefrontEffectivePromoDiscount = storefrontPromoState.status === 'valid' ? Number(storefrontPromoState.discount) || 0 : 0;
  const storefrontFinalTotal = Math.max(0, Number(cartTotal || 0) + storefrontServiceFee + storefrontEffectiveDeliveryCost - storefrontEffectivePromoDiscount);

  // Рассчитываем стоимость доставки при смене координат на карте.
  useEffect(() => {
    if (!isPublicStorefront) return;
    if (!storefrontIsDeliveryEnabled) { setStorefrontDeliveryCost(0); setStorefrontDeliveryDistance(0); setStorefrontDeliveryOutOfZone(false); return; }
    const lat = Number(storefrontOrderForm.delivery_lat);
    const lng = Number(storefrontOrderForm.delivery_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      setStorefrontDeliveryCost(0); setStorefrontDeliveryDistance(0); setStorefrontDeliveryOutOfZone(false);
      return;
    }
    const rid = Number(publicRestaurantId) || Number(selectedRestaurant);
    if (!rid) return;
    let cancelled = false;
    setStorefrontDeliveryLoading(true);
    axios.post(`${API_URL}/delivery/calculate`, { restaurant_id: rid, customer_lat: lat, customer_lng: lng })
      .then((res) => {
        if (cancelled) return;
        if (res.data?.disabled) {
          setStorefrontDeliveryCost(0); setStorefrontDeliveryDistance(0); setStorefrontDeliveryOutOfZone(false);
          return;
        }
        if (res.data?.out_of_zone) {
          setStorefrontDeliveryCost(0); setStorefrontDeliveryDistance(0); setStorefrontDeliveryOutOfZone(true);
          return;
        }
        setStorefrontDeliveryOutOfZone(false);
        setStorefrontDeliveryCost(Number(res.data?.delivery_cost) || 0);
        setStorefrontDeliveryDistance(Number(res.data?.distance_km) || 0);
      })
      .catch(() => { if (!cancelled) { setStorefrontDeliveryCost(0); setStorefrontDeliveryDistance(0); } })
      .finally(() => { if (!cancelled) setStorefrontDeliveryLoading(false); });
    return () => { cancelled = true; };
  }, [isPublicStorefront, storefrontIsDeliveryEnabled, storefrontOrderForm.delivery_lat, storefrontOrderForm.delivery_lng, publicRestaurantId, selectedRestaurant]);
  const submitStorefrontOrder = useCallback(async () => {
    if (storefrontOrderSubmitting) return;
    if (!cart || cart.length === 0) {
      setStorefrontOrderError(language === 'uz' ? 'Savat boʻsh' : 'Корзина пуста');
      return;
    }
    const name = String(storefrontOrderForm.customer_name || '').trim();
    const phone = String(storefrontOrderForm.customer_phone || '').trim();
    const fulfillment = storefrontOrderForm.fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
    const baseAddress = String(storefrontOrderForm.delivery_address || '').trim();
    const extras = [
      storefrontOrderForm.address_house && `дом ${storefrontOrderForm.address_house}`,
      storefrontOrderForm.address_apartment && `кв. ${storefrontOrderForm.address_apartment}`,
      storefrontOrderForm.address_doorcode && `домофон ${storefrontOrderForm.address_doorcode}`
    ].filter(Boolean).join(', ');
    const address = fulfillment === 'pickup'
      ? ''
      : (extras ? `${baseAddress}${baseAddress ? ', ' : ''}${extras}` : baseAddress);
    if (!name) { setStorefrontOrderError(language === 'uz' ? "Ismingizni kiriting" : 'Введите ФИО'); return; }
    if (!phone || phone.replace(/\D/g, '').length < 7) { setStorefrontOrderError(language === 'uz' ? "Toʻgʻri telefon kiriting" : 'Введите корректный телефон'); return; }
    if (fulfillment !== 'pickup' && !baseAddress) { setStorefrontOrderError(language === 'uz' ? "Yetkazib berish manzilini kiriting" : 'Введите адрес доставки'); return; }

    setStorefrontOrderSubmitting(true);
    setStorefrontOrderError('');
    try {
      const payloadItems = cart.map((item) => ({
        product_id: Number(item.id),
        quantity: Number(item.quantity) || 1,
        selected_variant: item.selected_variant || null
      }));
      const lat = Number(storefrontOrderForm.delivery_lat);
      const lng = Number(storefrontOrderForm.delivery_lng);
      const coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : null;
      const response = await axios.post(`${API_URL}/products/storefront-orders`, {
        restaurant_id: Number(publicRestaurantId) || Number(selectedRestaurant),
        items: payloadItems,
        customer_name: name,
        customer_phone: phone,
        delivery_address: address,
        delivery_coordinates: fulfillment === 'pickup' ? null : coordinates,
        delivery_cost: storefrontEffectiveDeliveryCost,
        delivery_distance_km: storefrontDeliveryDistance,
        service_fee: storefrontServiceFee,
        fulfillment_type: fulfillment,
        delivery_time_type: storefrontOrderForm.delivery_time_type,
        delivery_date: storefrontOrderForm.delivery_time_type === 'scheduled' ? storefrontOrderForm.delivery_date : null,
        payment_method: storefrontOrderForm.payment_method,
        promo_code: storefrontPromoState.status === 'valid' ? storefrontOrderForm.promo_code : '',
        comment: String(storefrontOrderForm.comment || '').trim() || undefined
      });
      const orderNumber = String(response?.data?.order_number || '');
      setStorefrontOrderSuccess(orderNumber);
      clearCart();
      setStorefrontOrderForm({ customer_name: '', customer_phone: '', delivery_address: '', comment: '' });
    } catch (err) {
      const message = err?.response?.data?.error || 'Не удалось отправить заказ. Попробуйте ещё раз.';
      const code = err?.response?.data?.code;
      const detail = err?.response?.data?.detail;
      setStorefrontOrderError(String(message) + (code ? ` (код: ${code})` : '') + (detail ? ` — ${detail}` : ''));
    } finally {
      setStorefrontOrderSubmitting(false);
    }
  }, [cart, storefrontOrderForm, storefrontOrderSubmitting, publicRestaurantId, selectedRestaurant, clearCart, storefrontDeliveryCost, storefrontDeliveryDistance, storefrontServiceFee]);

  const promptTelegramOrder = useCallback(() => {
    const href = String(publicBotHref || '').trim();
    if (href) {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(href);
      } else if (typeof window !== 'undefined') {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (typeof window !== 'undefined') {
      window.alert('Для оформления заказа откройте магазин в Telegram.');
    }
  }, [publicBotHref]);

  // В публичном режиме жёстко привязываем витрину к магазину из slug.
  useEffect(() => {
    if (!isPublicStorefront) return;
    const id = Number.parseInt(publicRestaurantId, 10);
    if (!Number.isInteger(id) || id <= 0) return;
    if (Number(selectedRestaurant) === id) return;
    setSelectedRestaurant(id);
  }, [isPublicStorefront, publicRestaurantId, selectedRestaurant]);

  // На публичной витрине корзина и избранное фильтруются по магазину из URL
  // (а не по active_restaurant_id сессии), иначе счётчик «+» не видит добавленные товары.
  useEffect(() => {
    if (!isPublicStorefront) return;
    const id = Number.parseInt(publicRestaurantId, 10);
    if (!Number.isInteger(id) || id <= 0) return;
    if (typeof setCartOverrideRestaurantId === 'function') setCartOverrideRestaurantId(id);
    if (typeof setFavoritesOverrideRestaurantId === 'function') setFavoritesOverrideRestaurantId(id);
    return () => {
      if (typeof setCartOverrideRestaurantId === 'function') setCartOverrideRestaurantId(null);
      if (typeof setFavoritesOverrideRestaurantId === 'function') setFavoritesOverrideRestaurantId(null);
    };
  }, [isPublicStorefront, publicRestaurantId, setCartOverrideRestaurantId, setFavoritesOverrideRestaurantId]);

  // Load restaurants (for header/logo and operator selection); re-sync when active shop changes (tabs / Telegram)
  useEffect(() => {
    fetchRestaurants();
  }, [user?.active_restaurant_id, requestedShareRestaurantId]);

  useEffect(() => {
    const onResize = () => {
      setIsDesktopViewport(window.innerWidth >= 992);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;
    loadShowcase(restaurantId);
  }, [user?.active_restaurant_id, loadShowcase]);

  useEffect(() => {
    if (menuVisible) return;
    if (location.pathname === '/catalog') {
      navigate('/', { replace: true });
    }
  }, [menuVisible, location.pathname, navigate]);

  useEffect(() => {
    // Keep catalog bound to token-selected restaurant in Telegram WebApp.
    if (isPublicStorefront) return; // на витрине магазин задаёт slug, а не сессия
    if (requestedShareRestaurantId) return;
    if (!isTelegramWebView) return;
    const activeRestaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!Number.isInteger(activeRestaurantId) || activeRestaurantId <= 0) return;
    if (Number(selectedRestaurant) === activeRestaurantId) return;
    setSelectedRestaurant(activeRestaurantId);
  }, [isTelegramWebView, user?.active_restaurant_id, selectedRestaurant, requestedShareRestaurantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedLanguage = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || '').trim().toLowerCase();
    if (savedLanguage === 'ru' || savedLanguage === 'uz') {
      setPendingLanguage(savedLanguage);
      return;
    }
    setPendingLanguage(language === 'uz' ? 'uz' : 'ru');
    setShowLanguageSetupModal(true);
  }, [language]);

  // For customers: lock to active_restaurant_id from bot (avoid stale catalog when only other user fields change)
  useEffect(() => {
    if (isPublicStorefront) return; // на витрине магазин задаёт slug, а не сессия
    const role = user?.role;
    if (role === 'operator' || role === 'superadmin') return;
    if (requestedShareRestaurantId) return;
    if (user?.active_restaurant_id) {
      setSelectedRestaurant(user.active_restaurant_id);
    }
  }, [user?.active_restaurant_id, user?.role, requestedShareRestaurantId]);

  useEffect(() => {
    if (!requestedShareRestaurantId) return;
    if (normalizeId(selectedRestaurant) === requestedShareRestaurantId) return;
    setSelectedRestaurant(requestedShareRestaurantId);
  }, [requestedShareRestaurantId, selectedRestaurant]);

  useEffect(() => {
    if (isPublicStorefront) return; // витрина не зависит от active_restaurant_id сессии
    const raw = user?.active_restaurant_id;
    if (raw === undefined || raw === null || raw === '') {
      lastActiveRestaurantForCatalogRef.current = null;
      return;
    }
    const idNum = Number.parseInt(String(raw), 10);
    if (!Number.isInteger(idNum) || idNum <= 0) return;

    if (lastActiveRestaurantForCatalogRef.current !== null && lastActiveRestaurantForCatalogRef.current !== idNum) {
      catalogFetchIdRef.current += 1;
      setProducts([]);
      setCategories([]);
      setAdBanners([]);
      setCatalogAnimationSeason('off');
      setLoading(true);
    }
    lastActiveRestaurantForCatalogRef.current = idNum;
  }, [user?.active_restaurant_id]);

  // Load products when restaurant changes
  useEffect(() => {
    if (selectedRestaurant) {
      setSelectedCategory(null);
      setActiveSubcategoryTab(null);
      setCatalogSearchQuery('');
      setEntryPopupBanner(null);
      setShowEntryPopupModal(false);
      fetchData();
      // Only clear cart if restaurant actually changed (not on first load)
      if (prevRestaurant && prevRestaurant !== selectedRestaurant) {
        clearCart();
      }
      setPrevRestaurant(selectedRestaurant);
    }
  }, [selectedRestaurant]);

  useEffect(() => {
    pendingProductReviewsLoadedRef.current = false;
    setPendingProductReviewItems([]);
    setShowPendingProductReviewModal(false);
    setPendingProductReviewRating(5);
    setPendingProductReviewComment('');
    setPendingProductReviewError('');
  }, [user?.id, selectedRestaurant]);

  useEffect(() => {
    if (!user?.id || user?.role !== 'customer' || !selectedRestaurant) return;
    if (pendingProductReviewsLoadedRef.current) return;

    const snoozeUntil = getPendingReviewSnoozeUntil(user.id, selectedRestaurant);
    if (snoozeUntil > Date.now()) {
      pendingProductReviewsLoadedRef.current = true;
      setShowPendingProductReviewModal(false);
      return;
    }

    pendingProductReviewsLoadedRef.current = true;
    let cancelled = false;

    const loadPendingProductReviews = async () => {
      try {
        const response = await axios.get(`${API_URL}/products/reviews/pending`, {
          params: { limit: 5 }
        });
        if (cancelled) return;
        const items = Array.isArray(response.data?.items) ? response.data.items : [];
        setPendingProductReviewItems(items);
        setShowPendingProductReviewModal(items.length > 0);
      } catch (error) {
        if (cancelled) return;
        setPendingProductReviewItems([]);
      }
    };

    loadPendingProductReviews();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, selectedRestaurant]);

  const getScrollContainer = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return window;
    }

    const rootNode = document.getElementById('root');
    if (!rootNode) return window;

    const style = window.getComputedStyle(rootNode);
    const overflowRule = `${style.overflow || ''} ${style.overflowY || ''}`.toLowerCase();
    const canScrollVertically = /(auto|scroll|overlay)/.test(overflowRule);

    if (canScrollVertically && rootNode.scrollHeight > rootNode.clientHeight + 2) {
      return rootNode;
    }

    return window;
  };
  const getCurrentScrollOffset = () => {
    const scrollContainer = getScrollContainer();
    if (scrollContainer === window) {
      return window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || 0;
    }
    return scrollContainer.scrollTop || 0;
  };

  const scrollToOffset = (offsetTop) => {
    const scrollContainer = getScrollContainer();
    if (scrollContainer === window) {
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    } else {
      scrollContainer.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => scrollToOffset(0);
  const restoreScrollOffset = (offsetTop) => {
    const target = Math.max(0, Number(offsetTop) || 0);
    const scrollContainer = getScrollContainer();
    if (scrollContainer === window) {
      window.scrollTo({ top: target, behavior: 'auto' });
      return;
    }
    scrollContainer.scrollTo({ top: target, behavior: 'auto' });
  };
  const scrollActiveTabIntoView = (tabId, behavior = 'smooth') => {
    if (tabId === null || tabId === undefined || tabId === '') return;
    const scroller = level3TabsScrollerRef.current;
    const btn = level3TabButtonRefs.current[catalogSectionTabKey(tabId)];
    if (!scroller || !btn) return;

    const scRect = scroller.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.width < 1 && btnRect.height < 1) return;

    // offsetLeft breaks under flex + transformed ancestors (iOS / Telegram); use viewport deltas.
    const gutter = 12;
    const tabContentLeft = scroller.scrollLeft + (btnRect.left - scRect.left);
    const tabContentRight = tabContentLeft + btnRect.width;
    const viewStart = scroller.scrollLeft;
    const viewEnd = viewStart + scroller.clientWidth;

    let targetLeft = viewStart;
    if (tabContentLeft < viewStart + gutter) {
      targetLeft = tabContentLeft - gutter;
    } else if (tabContentRight > viewEnd - gutter) {
      targetLeft = tabContentRight - scroller.clientWidth + gutter;
    }

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    targetLeft = Math.min(maxScrollLeft, Math.max(0, targetLeft));
    if (Math.abs(scroller.scrollLeft - targetLeft) < 1) return;
    scroller.scrollTo({
      left: targetLeft,
      behavior: behavior === 'smooth' ? 'smooth' : 'auto'
    });
  };
  const tabDragStateRef = useRef({ active: false, dragged: false, startX: 0, scrollStart: 0 });
  const handleTabPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    const scroller = level3TabsScrollerRef.current;
    if (!scroller) return;
    tabDragStateRef.current = { active: true, dragged: false, startX: e.clientX, scrollStart: scroller.scrollLeft };
    scroller.setPointerCapture(e.pointerId);
  };
  const handleTabPointerMove = (e) => {
    if (!tabDragStateRef.current.active) return;
    const scroller = level3TabsScrollerRef.current;
    if (!scroller) return;
    const dx = e.clientX - tabDragStateRef.current.startX;
    if (Math.abs(dx) > 4) tabDragStateRef.current.dragged = true;
    scroller.scrollLeft = tabDragStateRef.current.scrollStart - dx;
  };
  const handleTabPointerUp = (e) => {
    if (!tabDragStateRef.current.active) return;
    tabDragStateRef.current.active = false;
    const scroller = level3TabsScrollerRef.current;
    if (scroller) {
      try { scroller.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const handleTabsWheelScroll = (event) => {
    const tabsScroller = level3TabsScrollerRef.current;
    if (!tabsScroller) return;

    const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(primaryDelta) < 1) return;

    tabsScroller.scrollLeft += primaryDelta;
    event.preventDefault();
  };
  const handleCatalogTabClick = (sectionId) => {
    if (tabDragStateRef.current.dragged) return;
    tabActivationSourceRef.current = 'click';
    scrollToProductGroup(sectionId);
  };

  const resolveImageUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_URL.replace('/api', '')}${url}`;
  };
  const getProductImageItems = (product) => {
    let rawImages = product?.product_images;
    if (typeof rawImages === 'string') {
      try {
        rawImages = JSON.parse(rawImages);
      } catch (error) {
        rawImages = [];
      }
    }

    if (!Array.isArray(rawImages)) return [];

    return rawImages
      .map((item) => {
        if (typeof item === 'string') {
          const url = item.trim();
          return url ? { url, thumb_url: '' } : null;
        }
        if (!item || typeof item !== 'object') return null;
        const url = String(item.url || item.image_url || '').trim();
        const thumbUrl = String(item.thumb_url || item.thumbUrl || '').trim();
        if (!url && !thumbUrl) return null;
        return { url, thumb_url: thumbUrl };
      })
      .filter(Boolean);
  };
  const getProductGalleryImages = (product, selectedVariant = null) => {
    const result = [];
    const seen = new Set();
    const addImage = (value) => {
      const resolved = resolveImageUrl(value);
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      result.push(resolved);
    };

    const selectedVariantDetails = getSelectedVariantDetails(product, selectedVariant);
    if (selectedVariantDetails) {
      addImage(selectedVariantDetails?.image_url);
      getProductImageItems(selectedVariantDetails).forEach((item) => addImage(item.url));
      if (!result.length) addImage(selectedVariantDetails?.thumb_url);
      if (result.length) return result;
    }

    addImage(product?.image_url);
    getProductImageItems(product).forEach((item) => addImage(item.url));

    if (!result.length) addImage(product?.thumb_url);
    if (!result.length) {
      const allVariants = getProductVariantOptions(product);
      const inStockVariants = allVariants.filter((variant) => variant?.in_stock !== false);
      const scanList = inStockVariants.length > 0 ? inStockVariants : allVariants;
      scanList.forEach((variant) => {
        addImage(variant?.image_url);
        getProductImageItems(variant).forEach((item) => addImage(item.url));
        if (!result.length) addImage(variant?.thumb_url);
      });
    }
    return result;
  };
  const getProductCardImage = (product, selectedVariant = null) => {
    const selectedVariantDetails = getSelectedVariantDetails(product, selectedVariant);
    if (selectedVariantDetails) {
      const variantImageItems = getProductImageItems(selectedVariantDetails);
      const variantItemWithThumb = variantImageItems.find((item) => item.thumb_url);
      if (variantItemWithThumb?.thumb_url) {
        return resolveImageUrl(variantItemWithThumb.thumb_url);
      }

      const directVariantThumbUrl = resolveImageUrl(selectedVariantDetails?.thumb_url);
      if (directVariantThumbUrl) return directVariantThumbUrl;

      if (variantImageItems[0]?.url) {
        return resolveImageUrl(variantImageItems[0].url);
      }

      const directVariantImageUrl = resolveImageUrl(selectedVariantDetails?.image_url);
      if (directVariantImageUrl) return directVariantImageUrl;
    }

    const allVariants = getProductVariantOptions(product);
    if (allVariants.length > 0) {
      const inStockVariants = allVariants.filter((variant) => variant?.in_stock !== false);
      const scanList = inStockVariants.length > 0 ? inStockVariants : allVariants;
      for (const variant of scanList) {
        const variantImageItems = getProductImageItems(variant);
        const variantItemWithThumb = variantImageItems.find((item) => item.thumb_url);
        if (variantItemWithThumb?.thumb_url) {
          return resolveImageUrl(variantItemWithThumb.thumb_url);
        }
        const directVariantThumbUrl = resolveImageUrl(variant?.thumb_url);
        if (directVariantThumbUrl) return directVariantThumbUrl;
        if (variantImageItems[0]?.url) {
          return resolveImageUrl(variantImageItems[0].url);
        }
        const directVariantImageUrl = resolveImageUrl(variant?.image_url);
        if (directVariantImageUrl) return directVariantImageUrl;
      }
    }

    const imageItems = getProductImageItems(product);
    const itemWithThumb = imageItems.find((item) => item.thumb_url);
    if (itemWithThumb?.thumb_url) {
      return resolveImageUrl(itemWithThumb.thumb_url);
    }

    const directThumbUrl = resolveImageUrl(product?.thumb_url);
    if (directThumbUrl) return directThumbUrl;

    if (imageItems[0]?.url) {
      return resolveImageUrl(imageItems[0].url);
    }

    return resolveImageUrl(product?.image_url);
  };

  const openProductGallery = (product, startIndex = 0, selectedVariant = null) => {
    const images = getProductGalleryImages(product, selectedVariant);
    if (!images.length) return;
    const safeIndex = Math.max(0, Math.min(startIndex, images.length - 1));
    setGalleryImages(images);
    setGalleryIndex(safeIndex);
    setGalleryProductName(getProductName(product) || '');
    setShowGalleryModal(true);
  };
  const closeProductGallery = () => setShowGalleryModal(false);
  const showPrevGalleryImage = () => {
    setGalleryIndex((prev) => (prev <= 0 ? galleryImages.length - 1 : prev - 1));
  };
  const showNextGalleryImage = () => {
    setGalleryIndex((prev) => (prev >= galleryImages.length - 1 ? 0 : prev + 1));
  };
  const handleGalleryTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    galleryTouchStartXRef.current = touch.clientX;
    galleryTouchStartYRef.current = touch.clientY;
    gallerySwipeLockedRef.current = false;
  };
  const handleGalleryTouchMove = (event) => {
    const startX = galleryTouchStartXRef.current;
    const startY = galleryTouchStartYRef.current;
    if (startX === null || startX === undefined || startY === null || startY === undefined) return;
    if (gallerySwipeLockedRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) > Math.abs(deltaY) + 8) {
      gallerySwipeLockedRef.current = true;
      event.preventDefault();
    }
  };
  const handleGalleryTouchEnd = (event) => {
    const startX = galleryTouchStartXRef.current;
    const startY = galleryTouchStartYRef.current;
    galleryTouchStartXRef.current = null;
    galleryTouchStartYRef.current = null;
    gallerySwipeLockedRef.current = false;
    if (startX === null || startX === undefined || startY === null || startY === undefined) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 44) return;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX < 0) {
      showNextGalleryImage();
    } else {
      showPrevGalleryImage();
    }
  };

  const showPrevProductHeroImage = (imagesCount) => {
    if (!Number.isInteger(imagesCount) || imagesCount <= 1) return;
    setProductHeroIndex((prev) => (prev <= 0 ? imagesCount - 1 : prev - 1));
  };

  const showNextProductHeroImage = (imagesCount) => {
    if (!Number.isInteger(imagesCount) || imagesCount <= 1) return;
    setProductHeroIndex((prev) => (prev >= imagesCount - 1 ? 0 : prev + 1));
  };

  const handleProductHeroTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    productHeroTouchStartXRef.current = touch.clientX;
    productHeroTouchStartYRef.current = touch.clientY;
    productHeroSwipeTriggeredRef.current = false;
  };

  const handleProductHeroTouchMove = (event, imagesCount) => {
    if (!Number.isInteger(imagesCount) || imagesCount <= 1) return;
    const startX = productHeroTouchStartXRef.current;
    const startY = productHeroTouchStartYRef.current;
    if (startX === null || startX === undefined || startY === null || startY === undefined) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) > Math.abs(deltaY) + 8) {
      event.preventDefault();
      productHeroSwipeTriggeredRef.current = true;
    }
  };

  const handleProductHeroTouchEnd = (event, imagesCount) => {
    const startX = productHeroTouchStartXRef.current;
    const startY = productHeroTouchStartYRef.current;
    productHeroTouchStartXRef.current = null;
    productHeroTouchStartYRef.current = null;
    if (startX === null || startX === undefined || startY === null || startY === undefined) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 36) return;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    productHeroSwipeTriggeredRef.current = true;
    if (deltaX < 0) {
      showNextProductHeroImage(imagesCount);
    } else {
      showPrevProductHeroImage(imagesCount);
    }
  };

  const getRestaurantLogoFrame = (logoDisplayMode) => {
    const mode = String(logoDisplayMode || '').toLowerCase() === 'horizontal' ? 'horizontal' : 'square';
    return mode === 'horizontal'
      ? {
        box: {
          width: '112px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        },
        img: {
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          borderRadius: '10px'
        }
      }
      : {
        box: {
          width: '42px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        },
        img: {
          width: '42px',
          height: '42px',
          objectFit: 'contain',
          borderRadius: '10px'
        }
      };
  };

  const getCategoryName = (category) => (
    language === 'uz' && category?.name_uz ? category.name_uz : category?.name_ru
  );

  const getProductName = (product) => (
    language === 'uz' && product?.name_uz ? product.name_uz : product?.name_ru
  );

  const getProductDescription = (product) => (
    language === 'uz' && product?.description_uz
      ? product.description_uz
      : (product?.description_ru || '')
  );
  const normalizeProductVariantOptions = (value, { fallbackPrice = NaN } = {}) => {
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
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
      let discountEnabledRaw = false;
      let discountPriceRaw = null;
      let stockQuantityRaw = null;
      let inStockRaw = true;
      let hasContainerName = false;
      let hasContainerPrice = false;
      let hasContainerNorm = false;
      let hasContainerId = false;
      let containerNameRaw = null;
      let containerPriceRaw = null;
      let containerNormRaw = null;
      let containerIdRaw = null;

      if (item && typeof item === 'object' && !Array.isArray(item)) {
        name = String(item.name || item.value || item.label || '').trim();
        descriptionRu = String(item.description_ru || item.descriptionRu || '').trim();
        descriptionUz = String(item.description_uz || item.descriptionUz || '').trim();
        priceRaw = item.price ?? fallbackPrice;
        barcode = String(item.barcode || '').trim();
        discountEnabledRaw = item.discount_enabled ?? item.discountEnabled ?? false;
        discountPriceRaw = item.discount_price ?? item.discountPrice ?? null;
        stockQuantityRaw = item.stock_quantity ?? item.stockQuantity ?? null;
        inStockRaw = item.in_stock ?? item.inStock ?? true;
        variantImages = getProductImageItems(item).slice(0, 4);
        const mainVariantImage = variantImages[0] || null;
        imageUrl = String(mainVariantImage?.url || item.image_url || item.imageUrl || '').trim();
        thumbUrl = String(mainVariantImage?.thumb_url || item.thumb_url || item.thumbUrl || '').trim();
        hasContainerName = hasOwn(item, 'container_name') || hasOwn(item, 'containerName');
        hasContainerPrice = hasOwn(item, 'container_price') || hasOwn(item, 'containerPrice');
        hasContainerNorm = hasOwn(item, 'container_norm') || hasOwn(item, 'containerNorm');
        hasContainerId = hasOwn(item, 'container_id') || hasOwn(item, 'containerId');
        if (hasContainerName) {
          containerNameRaw = item.container_name ?? item.containerName ?? '';
        }
        if (hasContainerPrice) {
          containerPriceRaw = item.container_price ?? item.containerPrice;
        }
        if (hasContainerNorm) {
          containerNormRaw = item.container_norm ?? item.containerNorm;
        }
        if (hasContainerId) {
          containerIdRaw = item.container_id ?? item.containerId ?? '';
        }
      } else {
        name = String(item ?? '').trim();
      }

      if (!name) continue;
      const key = name.toLowerCase();
      if (unique.has(key)) continue;
      unique.add(key);

      const normalizedPrice = parseFloat(String(priceRaw ?? '').replace(',', '.'));
      const normalizedDiscountPrice = parseFloat(String(discountPriceRaw ?? '').replace(',', '.'));
      const normalizedStockQuantity = stockQuantityRaw === null || stockQuantityRaw === undefined || stockQuantityRaw === ''
        ? null
        : parseFloat(String(stockQuantityRaw).replace(',', '.'));
      const normalizedDiscountEnabled = (
        (discountEnabledRaw === true || discountEnabledRaw === 'true' || discountEnabledRaw === 1 || discountEnabledRaw === '1')
        && Number.isFinite(normalizedPrice)
        && normalizedPrice > 0
        && Number.isFinite(normalizedDiscountPrice)
        && normalizedDiscountPrice > 0
        && normalizedDiscountPrice < normalizedPrice
      );
      const normalizedContainerPrice = containerPriceRaw === null || containerPriceRaw === undefined
        ? null
        : parseFloat(String(containerPriceRaw).replace(',', '.'));
      const normalizedContainerNorm = containerNormRaw === null || containerNormRaw === undefined
        ? null
        : parseFloat(String(containerNormRaw).replace(',', '.'));
      const normalizedContainerName = hasContainerName
        ? (String(containerNameRaw ?? '').trim() || null)
        : null;
      const normalizedContainerId = hasContainerId
        ? (String(containerIdRaw ?? '').trim() || null)
        : null;
      const shouldFallbackContainerPriceToProduct = hasContainerPrice
        && (!Number.isFinite(normalizedContainerPrice) || normalizedContainerPrice <= 0)
        && !normalizedContainerName
        && !normalizedContainerId;
      normalized.push({
        name,
        description_ru: descriptionRu.slice(0, 1500),
        description_uz: descriptionUz.slice(0, 1500),
        price: Number.isFinite(normalizedPrice) && normalizedPrice > 0 ? normalizedPrice : null,
        discount_enabled: normalizedDiscountEnabled,
        discount_price: normalizedDiscountEnabled ? normalizedDiscountPrice : null,
        stock_quantity: Number.isFinite(normalizedStockQuantity) && normalizedStockQuantity >= 0 ? normalizedStockQuantity : null,
        in_stock: !(inStockRaw === false || inStockRaw === 'false' || inStockRaw === 0 || inStockRaw === '0'),
        barcode: barcode.slice(0, 120),
        image_url: imageUrl,
        thumb_url: thumbUrl,
        product_images: variantImages,
        container_id: normalizedContainerId,
        container_name: normalizedContainerName,
        container_price: shouldFallbackContainerPriceToProduct
          ? null
          : hasContainerPrice
          ? (Number.isFinite(normalizedContainerPrice) && normalizedContainerPrice >= 0 ? normalizedContainerPrice : 0)
          : null,
        container_norm: hasContainerNorm
          ? (Number.isFinite(normalizedContainerNorm) && normalizedContainerNorm > 0 ? normalizedContainerNorm : 1)
          : null
      });
      if (normalized.length >= 20) break;
    }
    return normalized;
  };
  const normalizeProductSizeOptions = (value) => (
    normalizeProductVariantOptions(value).map((variant) => variant.name)
  );
  const getProductVariantOptions = (product) => {
    if (!product || product.size_enabled !== true) return [];
    if (!currentRestaurant || currentRestaurant.size_variants_enabled !== true) return [];
    const fallbackPrice = Number(product?.price);
    return normalizeProductVariantOptions(product.size_options, {
      fallbackPrice: Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : NaN
    });
  };
  const getProductSizeOptions = (product) => {
    return getProductVariantOptions(product).map((variant) => variant.name);
  };
  const getSelectedVariantForProduct = (product) => {
    const variants = getProductVariantOptions(product);
    const options = variants.map((variant) => variant.name);
    if (!options.length) return null;
    const productId = Number(product?.id);
    const selectedRaw = selectedProductVariants[productId];
    const selected = String(selectedRaw || '').trim();
    if (selected && options.some((item) => item.toLowerCase() === selected.toLowerCase())) {
      return options.find((item) => item.toLowerCase() === selected.toLowerCase()) || selected;
    }
    const firstInStockVariant = variants.find((variant) => variant?.in_stock !== false);
    return firstInStockVariant?.name || options[0];
  };
  const getSelectedVariantDetails = (product, selectedVariant = null) => {
    const variants = getProductVariantOptions(product);
    if (!variants.length) return null;
    const selectedName = String(selectedVariant || getSelectedVariantForProduct(product) || '').trim().toLowerCase();
    const fallbackVariant = variants.find((variant) => variant?.in_stock !== false) || variants[0];
    if (!selectedName) return fallbackVariant;
    return variants.find((variant) => String(variant.name || '').trim().toLowerCase() === selectedName) || fallbackVariant;
  };
  const getSelectedVariantAvailability = (product, selectedVariant = null) => {
    const variant = getSelectedVariantDetails(product, selectedVariant);
    if (variant) return variant.in_stock !== false;
    return product?.in_stock !== false;
  };
  const getProductOverallAvailability = (product) => {
    const variants = getProductVariantOptions(product);
    if (variants.length > 0) {
      return variants.some((variant) => variant?.in_stock !== false);
    }
    return product?.in_stock !== false;
  };
  const getSelectedVariantPriceMeta = (product, selectedVariant = null) => {
    const variant = getSelectedVariantDetails(product, selectedVariant);
    if (variant && Number.isFinite(Number(variant.price)) && Number(variant.price) > 0) {
      const variantBasePrice = Number(variant.price);
      const variantDiscountEnabled = (
        variant?.discount_enabled === true
        || variant?.discount_enabled === 'true'
        || variant?.discount_active === true
      );
      const variantDiscountCandidate = Number(
        variant?.discount_effective_price
        ?? variant?.discount_final_price
        ?? variant?.discount_price
      );
      const hasVariantDiscount = (
        variantDiscountEnabled
        && Number.isFinite(variantDiscountCandidate)
        && variantDiscountCandidate > 0
        && variantDiscountCandidate < variantBasePrice
      );
      return {
        currentPrice: hasVariantDiscount ? variantDiscountCandidate : variantBasePrice,
        originalPrice: hasVariantDiscount ? variantBasePrice : null,
        isDiscount: hasVariantDiscount
      };
    }

    const basePrice = Number(product?.price);
    const normalizedBasePrice = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 0;
    const discountEnabled = (
      product?.discount_enabled === true
      || product?.discount_enabled === 'true'
      || product?.discount_active === true
    );
    const discountCandidate = Number(
      product?.discount_effective_price
      ?? product?.discount_final_price
      ?? product?.discount_price
    );
    const hasValidDiscount = (
      discountEnabled
      && Number.isFinite(discountCandidate)
      && discountCandidate > 0
      && discountCandidate < normalizedBasePrice
    );

    return {
      currentPrice: hasValidDiscount ? discountCandidate : normalizedBasePrice,
      originalPrice: hasValidDiscount ? normalizedBasePrice : null,
      isDiscount: hasValidDiscount
    };
  };
  const getSelectedVariantPrice = (product, selectedVariant = null) => {
    return getSelectedVariantPriceMeta(product, selectedVariant).currentPrice;
  };
  const getSelectedVariantDescription = (product, selectedVariant = null) => {
    const variant = getSelectedVariantDetails(product, selectedVariant);
    if (variant) {
      const localized = language === 'uz'
        ? String(variant.description_uz || '').trim()
        : String(variant.description_ru || '').trim();
      if (localized) return localized;
    }
    return getProductDescription(product);
  };
  const selectVariantForProduct = (product, variantValue) => {
    const productId = Number(product?.id);
    const normalizedValue = String(variantValue || '').trim();
    if (!productId || !normalizedValue) return;
    setSelectedProductVariants((prev) => ({
      ...prev,
      [productId]: normalizedValue
    }));
  };

  const normalizeRatingValue = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < 0) return 0;
    if (parsed > 5) return 5;
    return parsed;
  };

  const renderRatingStars = (ratingValue, { size = 18, max = 5 } = {}) => {
    const normalized = Math.round(normalizeRatingValue(ratingValue, 0));
    return (
      <span className="d-inline-flex align-items-center gap-1" aria-label={`rating-${normalized}-of-${max}`}>
        {Array.from({ length: max }).map((_, index) => (
          <span
            key={`star-${ratingValue}-${index}`}
            style={{
              color: index < normalized ? '#f59e0b' : '#cbd5e1',
              fontSize: `${size}px`,
              lineHeight: 1
            }}
          >
            ★
          </span>
        ))}
      </span>
    );
  };

  const formatReviewDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const fetchRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/products/restaurants/list`);
      const restaurantList = response.data || [];
      setRestaurants(restaurantList);
      // На публичной витрине магазин жёстко задаётся slug — не даём сессии/оператору переопределить выбор.
      if (isPublicStorefront) {
        const id = Number.parseInt(publicRestaurantId, 10);
        if (Number.isInteger(id) && id > 0) setSelectedRestaurant(id);
        return;
      }
      const hasRequestedRestaurant = requestedShareRestaurantId
        ? restaurantList.some((item) => Number(item?.id) === Number(requestedShareRestaurantId))
        : false;
      if (hasRequestedRestaurant) {
        setSelectedRestaurant(requestedShareRestaurantId);
        return;
      }

      const activeRestaurantId = Number.parseInt(user?.active_restaurant_id, 10);
      const hasActiveRestaurantInList = Number.isInteger(activeRestaurantId) && activeRestaurantId > 0
        ? restaurantList.some((item) => Number(item?.id) === activeRestaurantId)
        : false;

      // In bot/WebApp context we should always open the shop that comes from token (active_restaurant_id),
      // even if user has superadmin access to many shops.
      if (isTelegramWebView && hasActiveRestaurantInList) {
        setSelectedRestaurant(activeRestaurantId);
        return;
      }

      // Prefer active restaurant for admins/operators as well; fallback to first item only if missing.
      if (hasActiveRestaurantInList && !selectedRestaurant) {
        setSelectedRestaurant(activeRestaurantId);
        return;
      }

      // Auto-select for operators if not set
      if (isOperator()) {
        if (restaurantList.length === 1) {
          setSelectedRestaurant(restaurantList[0].id);
        } else if (restaurantList.length > 0 && !selectedRestaurant) {
          setSelectedRestaurant(restaurantList[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching restaurants:', error);
      setRestaurants([]);
    } finally {
      if (!isDataFetchInProgressRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchData = async () => {
    if (!selectedRestaurant) return;

    const fetchId = ++catalogFetchIdRef.current;
    isDataFetchInProgressRef.current = true;
    setLoading(true);
    try {
      const [categoriesRes, productsRes, adsRes, animationSeasonRes] = await Promise.all([
        axios.get(`${API_URL}/products/categories?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products/ads-banners?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products/catalog-animation-season`).catch(() => ({ data: { season: 'off' } }))
      ]);

      const nextCategories = (categoriesRes.data || []).map((category) => ({
        ...category,
        id: normalizeId(category?.id),
        parent_id: normalizeId(category?.parent_id)
      })).filter((category) => Number.isInteger(category.id)).sort((a, b) => {
        const getSortVal = (c) => (c.sort_order === null || c.sort_order === undefined) ? 9999 : c.sort_order;
        const orderDiff = getSortVal(a) - getSortVal(b);
        if (orderDiff !== 0) return orderDiff;
        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
      });
      const nextProducts = productsRes.data || [];
      const nextAdBanners = (adsRes.data || []).sort((a, b) => {
        const slotDiff = (a.slot_order || 999) - (b.slot_order || 999);
        if (slotDiff !== 0) return slotDiff;
        return (a.id || 0) - (b.id || 0);
      });

      if (fetchId !== catalogFetchIdRef.current) return;

      setCategories(nextCategories);
      setProducts(nextProducts);
      setAdBanners(nextAdBanners);
      setCatalogAnimationSeason(normalizeCatalogAnimationSeason(animationSeasonRes?.data?.season, 'off'));
      setActiveAdIndex(0);
      viewedAdsRef.current = new Set();
    } catch (error) {
      if (fetchId !== catalogFetchIdRef.current) return;
      console.error('Error fetching data:', error);
      setCategories([]);
      setProducts([]);
      setAdBanners([]);
      setCatalogAnimationSeason('off');
    } finally {
      if (fetchId === catalogFetchIdRef.current) {
        isDataFetchInProgressRef.current = false;
        setLoading(false);
      }
    }
  };

  const handleRestaurantChange = (e) => {
    const restaurantId = parseInt(e.target.value);
    setSelectedRestaurant(restaurantId);
    setSelectedCategory(null);
    setActiveSubcategoryTab(null);
  };

  const handleSaveLanguagePreference = () => {
    const nextLanguage = pendingLanguage === 'uz' ? 'uz' : 'ru';
    setLanguage(nextLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setShowLanguageSetupModal(false);
  };

  const handleAddToCart = (product) => {
    const parseLocalizedNumber = (value, fallback = 0) => {
      if (value === null || value === undefined || value === '') return fallback;
      const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const selectedVariant = getSelectedVariantForProduct(product);
    const selectedVariantDetails = getSelectedVariantDetails(product, selectedVariant);
    const selectedVariantAvailable = getSelectedVariantAvailability(product, selectedVariant);
    if (!selectedVariantAvailable) return;
    const resolveStockLimit = (targetProduct, targetVariant = null) => {
      if (!isInventoryTrackingEnabled || !targetProduct) return null;
      const targetVariantDetails = getSelectedVariantDetails(targetProduct, targetVariant);
      const rawStock = targetVariantDetails?.stock_quantity ?? targetProduct?.stock_quantity;
      const parsedStock = Number(rawStock);
      if (!Number.isFinite(parsedStock) || parsedStock < 0) return null;
      return parsedStock;
    };
    const variantPrice = getSelectedVariantPrice(product, selectedVariant);
    const selectedVariantDescription = getSelectedVariantDescription(product, selectedVariant);
    const variantImageItems = getProductImageItems(selectedVariantDetails).slice(0, 4);
    const variantMainImage = variantImageItems[0] || null;
    const cartImageUrl = selectedVariantDetails
      ? (selectedVariantDetails.image_url || variantMainImage?.url || product?.image_url || '')
      : (product?.image_url || '');
    const cartThumbUrl = selectedVariantDetails
      ? (selectedVariantDetails.thumb_url || variantMainImage?.thumb_url || product?.thumb_url || '')
      : (product?.thumb_url || '');
    const cartProductImages = selectedVariantDetails && variantImageItems.length > 0
      ? variantImageItems
      : getProductImageItems(product);
    const variantContainerPrice = parseLocalizedNumber(selectedVariantDetails?.container_price, NaN);
    const productContainerPrice = parseLocalizedNumber(product?.container_price, 0);
    const resolvedContainerPrice = Number.isFinite(variantContainerPrice) && variantContainerPrice > 0
      ? variantContainerPrice
      : productContainerPrice;
    const variantContainerNorm = parseLocalizedNumber(selectedVariantDetails?.container_norm, NaN);
    const productContainerNorm = parseLocalizedNumber(product?.container_norm, 1);
    const resolvedContainerNorm = Number.isFinite(variantContainerNorm) && variantContainerNorm > 0
      ? variantContainerNorm
      : productContainerNorm;
    const variantContainerName = String(selectedVariantDetails?.container_name || '').trim();
    const productContainerName = String(product?.container_name || '').trim();
    const resolvedContainerName = (variantContainerName || productContainerName) || null;
    const existingCartItem = getCartItem(product?.id, selectedVariant);
    const currentQtyInCart = Number(existingCartItem?.quantity || 0);
    const stockLimit = resolveStockLimit(product, selectedVariant);
    const baseStep = resolveQuantityStep(existingCartItem || product || {});
    const cappedAddQty = Number.isFinite(stockLimit)
      ? Math.max(0, Math.min(baseStep, stockLimit - currentQtyInCart))
      : baseStep;
    if (cappedAddQty <= 0) return;
    addToCart({
      ...product,
      restaurant_id: selectedRestaurant,
      price: variantPrice,
      description_ru: language === 'uz' ? (product?.description_ru || selectedVariantDescription) : selectedVariantDescription,
      description_uz: language === 'uz' ? selectedVariantDescription : (product?.description_uz || selectedVariantDescription),
      selected_variant: selectedVariant || null,
      in_stock: selectedVariantAvailable,
      container_name: resolvedContainerName,
      container_price: Number.isFinite(resolvedContainerPrice) && resolvedContainerPrice > 0 ? resolvedContainerPrice : 0,
      container_norm: Number.isFinite(resolvedContainerNorm) && resolvedContainerNorm > 0 ? resolvedContainerNorm : 1,
      image_url: cartImageUrl,
      thumb_url: cartThumbUrl,
      product_images: cartProductImages
    }, cappedAddQty);
  };

  const handleToggleFavorite = (product) => {
    toggleFavorite({
      ...product,
      restaurant_id: selectedRestaurant
    });
  };

  const normalizeVariantKey = (value) => String(value || '').trim().toLowerCase();
  const getCartItem = (productId, selectedVariant = undefined) => cart.find((item) => {
    if (Number(item?.id) !== Number(productId)) return false;
    if (selectedVariant === undefined) return true;
    return normalizeVariantKey(item?.selected_variant) === normalizeVariantKey(selectedVariant);
  });
  const resolveProductStockLimit = (product, selectedVariant = null) => {
    if (!isInventoryTrackingEnabled || !product) return null;
    const variantDetails = getSelectedVariantDetails(product, selectedVariant);
    const rawStock = variantDetails?.stock_quantity ?? product?.stock_quantity;
    const parsedStock = Number(rawStock);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) return null;
    return parsedStock;
  };
  const updateProductQuantityWithinStock = (product, currentQty, quantityStep, selectedVariant = null) => {
    if (!product?.id) return;
    const nextQtyRaw = Number(currentQty || 0) + Number(quantityStep || 0);
    if (!Number.isFinite(nextQtyRaw)) return;
    const stockLimit = resolveProductStockLimit(product, selectedVariant);
    const nextQty = Number.isFinite(stockLimit) ? Math.min(nextQtyRaw, stockLimit) : nextQtyRaw;
    if (!Number.isFinite(nextQty) || nextQty <= Number(currentQty || 0)) return;
    updateQuantity(product.id, nextQty, selectedVariant);
  };

  const categoriesById = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      const categoryId = normalizeId(category?.id);
      if (categoryId) {
        map.set(categoryId, category);
      }
    });
    return map;
  }, [categories]);
  const currentRestaurant = useMemo(
    () => restaurants.find((restaurant) => Number(restaurant.id) === Number(selectedRestaurant)) || null,
    [restaurants, selectedRestaurant]
  );
  const isInventoryTrackingEnabled = currentRestaurant?.inventory_tracking_enabled === true;
  const isMenuLiquidGlassEnabled = currentRestaurant?.menu_liquid_glass_enabled === true;
  const menuLiquidGlassOpacity = normalizeMenuGlassOpacity(
    currentRestaurant?.menu_liquid_glass_opacity,
    34
  );
  const menuLiquidGlassBlur = normalizeMenuGlassBlur(
    currentRestaurant?.menu_liquid_glass_blur,
    16
  );
  const menuLiquidGlassOpacityAlpha = menuLiquidGlassOpacity / 100;
  const storeLogoFallbackUrl = resolveImageUrl(
    currentRestaurant?.logo_url || user?.active_restaurant_logo || ''
  );
  const renderStoreLogoFallback = ({
    wrapperStyle = {},
    imageStyle = {},
    fallbackSize = '3rem',
    className = ''
  } = {}) => (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...wrapperStyle
      }}
    >
      {storeLogoFallbackUrl ? (
        <img
          src={storeLogoFallbackUrl}
          alt={currentRestaurant?.name || 'Store logo'}
          loading="lazy"
          decoding="async"
          style={{
            width: '60%',
            maxHeight: '60%',
            objectFit: 'contain',
            opacity: 0.22,
            filter: 'grayscale(0.1)',
            ...imageStyle
          }}
        />
      ) : (
        <span style={{ fontSize: fallbackSize, opacity: 0.22 }}>🏪</span>
      )}
    </div>
  );
  useEffect(() => {
    if (currentRestaurant?.currency_code) {
      setCountryCurrency(currentRestaurant.currency_code);
    }
  }, [currentRestaurant?.currency_code, setCountryCurrency]);
  const menuViewMode = useMemo(
    () => normalizeMenuViewMode(currentRestaurant?.menu_view_mode, 'grid_categories'),
    [currentRestaurant]
  );
  const catalogCardMode = useMemo(
    () => normalizeCatalogCardMode(currentRestaurant?.catalog_card_mode, 'wide'),
    [currentRestaurant]
  );
  // Витрина (/showcase/catalog) всегда работает как режим «Папки категорий»,
  // независимо от menu_view_mode магазина: входим в категорию -> видим
  // подкатегории как папки/карточки, а если их нет — товары этой категории.
  const isShowcaseCatalog = location.pathname === '/showcase/catalog';
  const isSingleListMode = menuViewMode === 'single_list' && !isShowcaseCatalog;
  const isNestedCategoriesMode = menuViewMode === 'nested_categories' || isShowcaseCatalog;
  const hideCategoryTitleBackgroundForMenu = categoryStyleSettings?.hideCategoryTitleBackground === true;
  const categoryTitleBackgroundTransparentForMenu = categoryStyleSettings?.categoryTitleBackgroundTransparent === true;
  const categoryTitleOutsideImageForMenu = true;
  const getCategorySortVal = (category) => (
    category?.sort_order === null || category?.sort_order === undefined ? 9999 : Number(category.sort_order)
  );

  const childrenByParent = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      const key = normalizeId(category?.parent_id) ?? null;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(category);
    });

    const getSortVal = (category) => (
      category.sort_order === null || category.sort_order === undefined ? 9999 : Number(category.sort_order)
    );

    for (const list of map.values()) {
      list.sort((a, b) => {
        const sortDiff = getSortVal(a) - getSortVal(b);
        if (sortDiff !== 0) return sortDiff;
        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
      });
    }

    return map;
  }, [categories]);

  const productCategoryIds = useMemo(() => (
    new Set(
      products
        .map((product) => normalizeId(product?.category_id))
        .filter((id) => Number.isFinite(id))
    )
  ), [products]);

  const normalizedCatalogSearch = useMemo(
    () => String(catalogSearchQuery || '').trim().toLowerCase(),
    [catalogSearchQuery]
  );
  const deferredCatalogSearch = useDeferredValue(normalizedCatalogSearch);

  const catalogSearchPlaceholderPhrases = useMemo(() => (
    language === 'uz'
      ? [
        'Tovar qidirish uchun nomini yozing',
        'Masalan "Kartoshka"',
        'Bolalar kitobi',
        'Gullar',
        'Non'
      ]
      : [
        'Для поиска товара напишите имя товара',
        'Например "Картошка"',
        'Книга детская',
        'Цветы',
        'Хлеб'
      ]
  ), [language]);

  const animatedCatalogSearchPlaceholder = useMemo(() => {
    const phrase = catalogSearchPlaceholderPhrases[catalogSearchPlaceholderPhraseIndex] || '';
    return phrase.slice(0, catalogSearchPlaceholderCharIndex);
  }, [catalogSearchPlaceholderPhrases, catalogSearchPlaceholderPhraseIndex, catalogSearchPlaceholderCharIndex]);

  const getLevel2CategoryIdForProduct = (product) => {
    let current = categoriesById.get(Number(product?.category_id));
    if (!current) return null;
    while (current?.parent_id) {
      const parent = categoriesById.get(Number(current.parent_id));
      if (!parent) break;
      if (!parent.parent_id) {
        return current.id;
      }
      current = parent;
    }
    return current?.id || null;
  };

  const catalogSearchResults = useMemo(() => {
    if (!deferredCatalogSearch) return [];

    const startsWithMatches = [];
    const containsMatches = [];
    const locale = language === 'uz' ? 'uz' : 'ru';

    for (const product of products) {
      const ru = String(product?.name_ru || '').toLowerCase();
      const uz = String(product?.name_uz || '').toLowerCase();
      if (!ru.includes(deferredCatalogSearch) && !uz.includes(deferredCatalogSearch)) continue;

      const displayName = String(getProductName(product) || '').toLowerCase();
      if (displayName.startsWith(deferredCatalogSearch)) {
        startsWithMatches.push(product);
      } else {
        containsMatches.push(product);
      }
    }

    const sortByName = (left, right) => (
      String(getProductName(left) || '').localeCompare(String(getProductName(right) || ''), locale)
    );

    startsWithMatches.sort(sortByName);
    containsMatches.sort(sortByName);

    return [...startsWithMatches, ...containsMatches].slice(0, CATALOG_SEARCH_RESULTS_LIMIT);
  }, [products, deferredCatalogSearch, language, categoriesById]);

  const inlineAdBanners = useMemo(
    () => (adBanners || []).filter((banner) => String(banner?.ad_type || 'banner').toLowerCase() !== 'entry_popup'),
    [adBanners]
  );

  const entryPopupBanners = useMemo(
    () => (adBanners || []).filter((banner) => String(banner?.ad_type || 'banner').toLowerCase() === 'entry_popup'),
    [adBanners]
  );
  const normalizedAnimationSeason = useMemo(
    () => normalizeCatalogAnimationSeason(catalogAnimationSeason, 'off'),
    [catalogAnimationSeason]
  );

  const springPetals = useMemo(() => (
    Array.from({ length: 26 }, (_, idx) => ({
      id: idx + 1,
      left: `${Math.random() * 100}%`,
      delay: `${(Math.random() * 9).toFixed(2)}s`,
      duration: `${(7 + Math.random() * 8).toFixed(2)}s`,
      drift: `${(-40 + Math.random() * 80).toFixed(1)}px`,
      size: `${(10 + Math.random() * 12).toFixed(1)}px`,
      opacity: `${(0.42 + Math.random() * 0.42).toFixed(2)}`,
      rotate: `${Math.round(Math.random() * 180)}deg`
    }))
  ), [normalizedAnimationSeason]);

  const autumnLeaves = useMemo(() => (
    Array.from({ length: 24 }, (_, idx) => ({
      id: idx + 1,
      left: `${Math.random() * 100}%`,
      delay: `${(Math.random() * 7).toFixed(2)}s`,
      duration: `${(8 + Math.random() * 9).toFixed(2)}s`,
      drift: `${(-70 + Math.random() * 140).toFixed(1)}px`,
      size: `${(11 + Math.random() * 14).toFixed(1)}px`,
      hue: `${(18 + Math.random() * 26).toFixed(1)}`,
      rotate: `${Math.round(Math.random() * 360)}deg`
    }))
  ), [normalizedAnimationSeason]);

  const summerMotes = useMemo(() => (
    Array.from({ length: 18 }, (_, idx) => ({
      id: idx + 1,
      left: `${Math.random() * 100}%`,
      top: `${5 + Math.random() * 80}%`,
      delay: `${(Math.random() * 6).toFixed(2)}s`,
      duration: `${(4 + Math.random() * 6).toFixed(2)}s`,
      size: `${(6 + Math.random() * 18).toFixed(1)}px`,
      drift: `${(10 + Math.random() * 40).toFixed(1)}px`,
      opacity: `${(0.08 + Math.random() * 0.18).toFixed(2)}`
    }))
  ), [normalizedAnimationSeason]);

  const winterSnowflakes = useMemo(() => (
    Array.from({ length: 44 }, (_, idx) => ({
      id: idx + 1,
      left: `${Math.random() * 100}%`,
      delay: `${(Math.random() * 10).toFixed(2)}s`,
      duration: `${(7 + Math.random() * 11).toFixed(2)}s`,
      size: `${(4 + Math.random() * 8).toFixed(1)}px`,
      drift: `${(-55 + Math.random() * 110).toFixed(1)}px`,
      opacity: `${(0.45 + Math.random() * 0.45).toFixed(2)}`,
      rotate: `${Math.round(Math.random() * 120)}deg`
    }))
  ), [normalizedAnimationSeason]);

  const renderCatalogSeasonOverlay = () => {
    if (isOperator()) return null;
    if (!selectedRestaurant || normalizedAnimationSeason === 'off') return null;

    const topOffset = Math.max(52, Number(catalogHeaderHeight) || 52);

    return (
      <>
        <style>{`
          .catalog-season-overlay {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 1008;
            overflow: hidden;
          }
          .catalog-season-overlay * {
            pointer-events: none !important;
            user-select: none;
          }
          .catalog-season-spring-petal,
          .catalog-season-autumn-leaf,
          .catalog-season-winter-snowflake {
            position: absolute;
            top: -8vh;
            will-change: transform, opacity;
          }
          @keyframes catalogSeasonFloatDown {
            0% {
              transform: translate3d(0, -8vh, 0) rotate(0deg);
              opacity: 0;
            }
            10% {
              opacity: var(--item-opacity, 0.7);
            }
            100% {
              transform: translate3d(var(--item-drift, 0px), 112vh, 0) rotate(var(--item-rotate, 180deg));
              opacity: 0;
            }
          }
          .catalog-season-spring-petal {
            background: linear-gradient(145deg, rgba(255, 224, 240, 0.95) 0%, rgba(246, 175, 205, 0.92) 100%);
            border-radius: 80% 16% 70% 12%;
            filter: drop-shadow(0 0 2px rgba(248, 113, 160, 0.28));
            animation: catalogSeasonFloatDown var(--item-duration, 10s) linear infinite;
          }
          .catalog-season-autumn-leaf {
            background: linear-gradient(
              155deg,
              hsla(var(--leaf-hue, 26), 95%, 64%, 0.95) 0%,
              hsla(calc(var(--leaf-hue, 26) - 10), 92%, 46%, 0.95) 100%
            );
            border-radius: 12% 68% 10% 64%;
            filter: drop-shadow(0 0 2px rgba(217, 119, 6, 0.32));
            animation: catalogSeasonFloatDown var(--item-duration, 10s) linear infinite;
          }
          .catalog-season-summer-sun {
            position: absolute;
            top: 3%;
            right: 8%;
            width: min(15vw, 96px);
            height: min(15vw, 96px);
            border-radius: 50%;
            background: radial-gradient(circle at 32% 32%, rgba(255, 255, 255, 0.88), rgba(253, 224, 71, 0.86) 35%, rgba(249, 115, 22, 0.18) 100%);
            box-shadow:
              0 0 0 10px rgba(251, 191, 36, 0.15),
              0 0 38px rgba(249, 115, 22, 0.26);
            animation: catalogSeasonSummerPulse 3.2s ease-in-out infinite;
          }
          .catalog-season-summer-rays {
            position: absolute;
            top: calc(3% - 42px);
            right: calc(8% - 42px);
            width: min(15vw, 96px);
            height: min(15vw, 96px);
            transform-origin: center;
            border-radius: 50%;
            background: conic-gradient(
              from 0deg,
              rgba(251, 191, 36, 0.15),
              rgba(251, 191, 36, 0.00) 22%,
              rgba(251, 191, 36, 0.13) 44%,
              rgba(251, 191, 36, 0.00) 66%,
              rgba(251, 191, 36, 0.12) 88%,
              rgba(251, 191, 36, 0.00) 100%
            );
            filter: blur(0.3px);
            transform: scale(1.8);
            animation: catalogSeasonSummerRotate 16s linear infinite;
          }
          .catalog-season-summer-mote {
            position: absolute;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(254, 243, 199, 0.95), rgba(251, 191, 36, 0.0) 72%);
            will-change: transform, opacity;
            animation: catalogSeasonSummerMote var(--item-duration, 6s) ease-in-out infinite;
          }
          @keyframes catalogSeasonSummerRotate {
            from { transform: scale(1.8) rotate(0deg); }
            to { transform: scale(1.8) rotate(360deg); }
          }
          @keyframes catalogSeasonSummerPulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.06); opacity: 1; }
          }
          @keyframes catalogSeasonSummerMote {
            0% {
              transform: translate3d(0, 0, 0) scale(0.8);
              opacity: 0;
            }
            25% { opacity: var(--item-opacity, 0.2); }
            100% {
              transform: translate3d(var(--item-drift, 22px), -35px, 0) scale(1.2);
              opacity: 0;
            }
          }
          .catalog-season-winter-snowflake {
            background: rgba(255, 255, 255, 0.92);
            border-radius: 50%;
            filter: drop-shadow(0 0 3px rgba(224, 242, 254, 0.65));
            animation: catalogSeasonFloatDown var(--item-duration, 10s) linear infinite;
          }
        `}</style>

        <div className="catalog-season-overlay" aria-hidden="true" style={{ top: `${topOffset}px` }}>
          {normalizedAnimationSeason === 'spring' && springPetals.map((item) => (
            <span
              key={`spring-${item.id}`}
              className="catalog-season-spring-petal"
              style={{
                left: item.left,
                width: item.size,
                height: `calc(${item.size} * 0.72)`,
                animationDelay: item.delay,
                '--item-duration': item.duration,
                '--item-drift': item.drift,
                '--item-opacity': item.opacity,
                '--item-rotate': item.rotate
              }}
            />
          ))}

          {normalizedAnimationSeason === 'summer' && (
            <>
              <span className="catalog-season-summer-rays" />
              <span className="catalog-season-summer-sun" />
              {summerMotes.map((item) => (
                <span
                  key={`summer-${item.id}`}
                  className="catalog-season-summer-mote"
                  style={{
                    left: item.left,
                    top: item.top,
                    width: item.size,
                    height: item.size,
                    animationDelay: item.delay,
                    '--item-duration': item.duration,
                    '--item-drift': item.drift,
                    '--item-opacity': item.opacity
                  }}
                />
              ))}
            </>
          )}

          {normalizedAnimationSeason === 'autumn' && autumnLeaves.map((item) => (
            <span
              key={`autumn-${item.id}`}
              className="catalog-season-autumn-leaf"
              style={{
                left: item.left,
                width: item.size,
                height: `calc(${item.size} * 0.9)`,
                transform: `rotate(${item.rotate})`,
                animationDelay: item.delay,
                '--item-duration': item.duration,
                '--item-drift': item.drift,
                '--item-opacity': 0.92,
                '--item-rotate': `${360 + Number.parseInt(item.rotate, 10)}deg`,
                '--leaf-hue': item.hue
              }}
            />
          ))}

          {normalizedAnimationSeason === 'winter' && winterSnowflakes.map((item) => (
            <span
              key={`winter-${item.id}`}
              className="catalog-season-winter-snowflake"
              style={{
                left: item.left,
                width: item.size,
                height: item.size,
                animationDelay: item.delay,
                '--item-duration': item.duration,
                '--item-drift': item.drift,
                '--item-opacity': item.opacity,
                '--item-rotate': item.rotate
              }}
            />
          ))}
        </div>
      </>
    );
  };

  useEffect(() => {
    setCatalogSearchPlaceholderPhraseIndex(0);
    setCatalogSearchPlaceholderCharIndex(0);
    setCatalogSearchPlaceholderDeleting(false);
  }, [language]);

  useEffect(() => {
    if (!catalogSearchPlaceholderPhrases.length) return undefined;

    const currentPhrase = catalogSearchPlaceholderPhrases[catalogSearchPlaceholderPhraseIndex] || '';
    const isTyping = !catalogSearchPlaceholderDeleting;
    let delay = isTyping ? 55 : 28;

    if (!catalogSearchPlaceholderDeleting && catalogSearchPlaceholderCharIndex < currentPhrase.length) {
      delay = 55;
    } else if (!catalogSearchPlaceholderDeleting && catalogSearchPlaceholderCharIndex === currentPhrase.length) {
      delay = 1200;
    } else if (catalogSearchPlaceholderDeleting && catalogSearchPlaceholderCharIndex > 0) {
      delay = 22;
    } else {
      delay = 280;
    }

    const timer = setTimeout(() => {
      if (!catalogSearchPlaceholderDeleting && catalogSearchPlaceholderCharIndex < currentPhrase.length) {
        setCatalogSearchPlaceholderCharIndex((prev) => prev + 1);
        return;
      }

      if (!catalogSearchPlaceholderDeleting && catalogSearchPlaceholderCharIndex === currentPhrase.length) {
        setCatalogSearchPlaceholderDeleting(true);
        return;
      }

      if (catalogSearchPlaceholderDeleting && catalogSearchPlaceholderCharIndex > 0) {
        setCatalogSearchPlaceholderCharIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      setCatalogSearchPlaceholderDeleting(false);
      setCatalogSearchPlaceholderPhraseIndex((prev) => (prev + 1) % catalogSearchPlaceholderPhrases.length);
      setCatalogSearchPlaceholderCharIndex(0);
    }, delay);

    return () => clearTimeout(timer);
  }, [
    catalogSearchPlaceholderPhrases,
    catalogSearchPlaceholderPhraseIndex,
    catalogSearchPlaceholderCharIndex,
    catalogSearchPlaceholderDeleting
  ]);

  useEffect(() => {
    if (catalogSearchQuery && !isHeaderSearchOpen) {
      setIsHeaderSearchOpen(true);
    }
  }, [catalogSearchQuery, isHeaderSearchOpen]);

  useEffect(() => {
    if (!isHeaderSearchOpen) return;
    const timer = setTimeout(() => {
      catalogSearchInputRef.current?.focus();
    }, 160);
    return () => clearTimeout(timer);
  }, [isHeaderSearchOpen]);

  useEffect(() => {
    const headerEl = catalogHeaderRef.current;
    if (!headerEl) return undefined;

    const updateHeaderHeight = () => {
      const nextHeight = Math.round(headerEl.getBoundingClientRect().height || 56);
      setCatalogHeaderHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateHeaderHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeaderHeight);
      ro.observe(headerEl);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  const clearCatalogSearch = () => setCatalogSearchQuery('');

  const toggleHeaderSearch = () => {
    setIsHeaderSearchOpen((prev) => !prev);
  };
  const handleOpenAccountModal = () => {
    setShowAccountModal(true);
    if (isHeaderSearchOpen) {
      setIsHeaderSearchOpen(false);
    }
  };
  const handleDesktopLogout = async () => {
    await logout();
    navigate('/login');
  };
  const closeShareFallbackModal = () => {
    setShareFallbackModal({
      show: false,
      title: '',
      text: '',
      url: ''
    });
    setShareActionActive('');
  };
  const openExternalLink = (targetUrl) => {
    if (!targetUrl || typeof window === 'undefined') return;
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(targetUrl);
      return;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };
  const copyShareTextToClipboard = async (value) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  };
  const executeShareAction = async (action, payload) => {
    const safePayload = payload || {};
    if (action === 'telegram') {
      if (!safePayload.url) return;
      const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(safePayload.url)}&text=${encodeURIComponent(safePayload.text || safePayload.title || '')}`;
      openExternalLink(tgShareUrl);
      return;
    }
    if (action === 'whatsapp') {
      if (!safePayload.text && !safePayload.url) return;
      const waText = safePayload.text || safePayload.url;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(waText)}`;
      openExternalLink(waUrl);
      return;
    }
    if (action === 'copy') {
      const copied = await copyShareTextToClipboard(safePayload.text || safePayload.url || '');
      const copiedMessage = language === 'uz' ? 'Havola nusxalandi' : 'Ссылка скопирована';
      if (copied) {
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.showAlert) {
          window.Telegram.WebApp.showAlert(copiedMessage);
        } else if (typeof window !== 'undefined') {
          window.alert(copiedMessage);
        }
        return;
      }
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const promptText = language === 'uz' ? 'Havolani nusxalang:' : 'Скопируйте ссылку:';
        window.prompt(promptText, safePayload.text || safePayload.url || '');
      }
    }
  };
  const handleShareViaTelegram = async () => {
    setShareActionActive('telegram');
    await executeShareAction('telegram', shareFallbackModal);
    closeShareFallbackModal();
  };
  const handleShareViaWhatsApp = async () => {
    setShareActionActive('whatsapp');
    await executeShareAction('whatsapp', shareFallbackModal);
    closeShareFallbackModal();
  };
  const handleShareCopyFallback = async () => {
    setShareActionActive('copy');
    await executeShareAction('copy', shareFallbackModal);
    closeShareFallbackModal();
  };

  const buildProductShareUrl = (product) => {
    const productId = normalizeId(product?.id);
    if (!productId) return '';
    const restaurantId = normalizeId(selectedRestaurant);
    const langParam = language === 'ru' ? 'ru' : 'uz';
    const apiBase = (() => {
      const normalizedApi = String(API_URL || '/api').replace(/\/+$/, '');
      if (/^https?:\/\//i.test(normalizedApi)) return normalizedApi;
      if (typeof window === 'undefined') return normalizedApi;
      const normalizedPath = normalizedApi.startsWith('/') ? normalizedApi : `/${normalizedApi}`;
      return `${window.location.origin}${normalizedPath}`;
    })();
    const shareParams = new URLSearchParams();
    if (restaurantId) {
      shareParams.set('restaurant_id', String(restaurantId));
    }
    shareParams.set('lang', langParam);
    shareParams.set('v', '2');
    return `${apiBase}/products/share/${productId}?${shareParams.toString()}`;
  };

  const handleShareProduct = async (product) => {
    const productId = normalizeId(product?.id);
    if (!productId) return;

    const shareUrl = buildProductShareUrl(product);
    if (!shareUrl) {
      const message = language === 'uz'
        ? 'Bot havolasi sozlanmagan. Administratorga murojaat qiling.'
        : 'Ссылка на бот не настроена. Обратитесь к администратору.';
      if (typeof window !== 'undefined' && window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
      } else if (typeof window !== 'undefined') {
        window.alert(message);
      }
      return;
    }

    const shareTitle = getProductName(product) || (language === 'uz' ? 'Mahsulot' : 'Товар');
    const shareText = shareUrl;
    const isAndroidWebView = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
    const shouldSkipNativeShare = isAndroidWebView && isTelegramWebView;

    // 1) Try native OS share sheet (Telegram/WhatsApp/etc chooser on supported mobile browsers).
    if (
      !shouldSkipNativeShare
      && typeof navigator !== 'undefined'
      && typeof navigator.share === 'function'
      && (typeof window === 'undefined' || window.isSecureContext !== false)
    ) {
      try {
        const sharePayload = { title: shareTitle, text: shareText };
        if (typeof navigator.canShare !== 'function' || navigator.canShare(sharePayload)) {
          await navigator.share(sharePayload);
        } else if (navigator.canShare({ text: shareText })) {
          await navigator.share({ text: shareText });
        }
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    // 2) Custom bottom sheet fallback (works reliably in Android Telegram WebView).
    const sharePayload = {
      show: true,
      title: shareTitle,
      text: shareText,
      url: shareUrl
    };
    setShareFallbackModal(sharePayload);
  };

  const nonEmptyCategoryIds = useMemo(() => {
    const memo = new Map();

    const hasProductsDeep = (categoryId) => {
      if (memo.has(categoryId)) return memo.get(categoryId);

      let hasProducts = productCategoryIds.has(categoryId);
      const children = childrenByParent.get(categoryId) || [];
      if (!hasProducts) {
        for (const child of children) {
          if (hasProductsDeep(child.id)) {
            hasProducts = true;
            break;
          }
        }
      }
      memo.set(categoryId, hasProducts);
      return hasProducts;
    };

    categories.forEach((category) => {
      hasProductsDeep(category.id);
    });

    return new Set(
      [...memo.entries()]
        .filter(([, hasProducts]) => hasProducts)
        .map(([id]) => id)
    );
  }, [categories, childrenByParent, productCategoryIds]);

  const level1Categories = useMemo(() => (
    (childrenByParent.get(null) || []).filter((category) => nonEmptyCategoryIds.has(category.id))
  ), [childrenByParent, nonEmptyCategoryIds]);

  const level2ByLevel1 = useMemo(() => {
    const map = new Map();
    level1Categories.forEach((level1) => {
      map.set(
        level1.id,
        (childrenByParent.get(level1.id) || []).filter((category) => nonEmptyCategoryIds.has(category.id))
      );
    });
    return map;
  }, [childrenByParent, level1Categories, nonEmptyCategoryIds]);

  const selectedLevel2Category = useMemo(() => {
    if (!selectedCategory) return null;
    return categoriesById.get(normalizeId(selectedCategory)) || null;
  }, [selectedCategory, categoriesById]);
  const selectedCategoryNode = useMemo(() => {
    if (!selectedCategory) return null;
    return categoriesById.get(normalizeId(selectedCategory)) || null;
  }, [selectedCategory, categoriesById]);
  const productsByCategoryId = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const categoryId = normalizeId(product?.category_id);
      if (!categoryId) return;
      if (!map.has(categoryId)) map.set(categoryId, []);
      map.get(categoryId).push(product);
    });
    return map;
  }, [products]);
  const nestedChildCategories = useMemo(() => {
    if (!isNestedCategoriesMode || !selectedCategoryNode) return [];
    return (childrenByParent.get(selectedCategoryNode.id) || [])
      .filter((category) => nonEmptyCategoryIds.has(category.id));
  }, [isNestedCategoriesMode, selectedCategoryNode, childrenByParent, nonEmptyCategoryIds]);
  const nestedDirectProducts = useMemo(() => {
    if (!isNestedCategoriesMode || !selectedCategoryNode) return [];
    return productsByCategoryId.get(selectedCategoryNode.id) || [];
  }, [isNestedCategoriesMode, selectedCategoryNode, productsByCategoryId]);

  const level3Categories = useMemo(() => {
    if (!selectedLevel2Category) return [];
    return (childrenByParent.get(selectedLevel2Category.id) || []).filter((category) => nonEmptyCategoryIds.has(category.id));
  }, [childrenByParent, nonEmptyCategoryIds, selectedLevel2Category]);

  const directSelectedProducts = useMemo(() => {
    if (!selectedLevel2Category) return [];
    return products.filter((product) => normalizeId(product?.category_id) === selectedLevel2Category.id);
  }, [products, selectedLevel2Category]);

  const level3Sections = useMemo(() => {
    const groupedSections = new Map();

    level3Categories.forEach((category) => {
      const categoryProducts = productsByCategoryId.get(category.id) || [];
      if (categoryProducts.length === 0) return;

      const title = getCategoryName(category) || '';
      const normalizedTitle = String(title).trim().toLowerCase();
      const groupKey = normalizedTitle || `__category_${category.id}`;

      if (!groupedSections.has(groupKey)) {
        groupedSections.set(groupKey, {
          id: category.id,
          title,
          products: [...categoryProducts]
        });
        return;
      }

      const existingSection = groupedSections.get(groupKey);
      existingSection.products.push(...categoryProducts);
    });

    return Array.from(groupedSections.values());
  }, [level3Categories, productsByCategoryId, language]);

  const hasLevel3Sections = level3Sections.length > 0;

  const level3Tabs = useMemo(() => (
    hasLevel3Sections ? level3Sections : []
  ), [hasLevel3Sections, level3Sections]);

  const productSections = useMemo(() => {
    if (!selectedLevel2Category) return [];

    if (hasLevel3Sections) {
      const sections = [];

      if (directSelectedProducts.length > 0) {
        sections.push({
          id: `direct-${selectedLevel2Category.id}`,
          title: getCategoryName(selectedLevel2Category),
          products: directSelectedProducts,
          tab: false
        });
      }

      level3Sections.forEach((section) => {
        sections.push({
          id: section.id,
          title: section.title,
          products: section.products,
          tab: true
        });
      });

      return sections;
    }

    if (directSelectedProducts.length === 0) return [];
    return [{
      id: selectedLevel2Category.id,
      title: getCategoryName(selectedLevel2Category),
      products: directSelectedProducts,
      tab: false
    }];
  }, [selectedLevel2Category, hasLevel3Sections, level3Sections, directSelectedProducts, language]);
  const singleListLevel2Categories = useMemo(() => (
    categories
      .filter((category) => {
        if (!nonEmptyCategoryIds.has(category.id)) return false;
        const parent = categoriesById.get(Number(category.parent_id));
        return Boolean(parent && parent.parent_id === null);
      })
      .sort((a, b) => {
        const sortDiff = getCategorySortVal(a) - getCategorySortVal(b);
        if (sortDiff !== 0) return sortDiff;
        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
      })
  ), [categories, nonEmptyCategoryIds, categoriesById]);
  const singleListSections = useMemo(() => {
    const groupedSections = new Map();

    const collectDescendantIds = (rootCategoryId) => {
      const ids = [];
      const stack = [rootCategoryId];
      while (stack.length > 0) {
        const currentId = Number(stack.pop());
        if (!Number.isFinite(currentId)) continue;
        ids.push(currentId);
        const children = childrenByParent.get(currentId) || [];
        children.forEach((child) => stack.push(child.id));
      }
      return ids;
    };

    singleListLevel2Categories.forEach((level2Category) => {
      const descendantIds = collectDescendantIds(level2Category.id);
      const sectionProducts = [];

      descendantIds.forEach((categoryId) => {
        const categoryProducts = productsByCategoryId.get(categoryId) || [];
        if (categoryProducts.length > 0) {
          sectionProducts.push(...categoryProducts);
        }
      });

      if (sectionProducts.length === 0) return;

      const title = getCategoryName(level2Category) || '';
      const normalizedTitle = String(title).trim().toLowerCase();
      const groupKey = normalizedTitle || `__single_${level2Category.id}`;

      if (!groupedSections.has(groupKey)) {
        groupedSections.set(groupKey, {
          id: `single-${level2Category.id}`,
          title,
          products: [...sectionProducts]
        });
        return;
      }

      const existingSection = groupedSections.get(groupKey);
      existingSection.products.push(...sectionProducts);
    });

    return Array.from(groupedSections.values()).map((section) => {
      const seenIds = new Set();
      const uniqueProducts = [];
      section.products.forEach((product) => {
        const productId = Number(product?.id);
        if (Number.isFinite(productId) && seenIds.has(productId)) return;
        if (Number.isFinite(productId)) seenIds.add(productId);
        uniqueProducts.push(product);
      });
      return {
        ...section,
        products: uniqueProducts
      };
    });
  }, [singleListLevel2Categories, productsByCategoryId, childrenByParent, language]);
  const filteredSingleListSections = useMemo(() => {
    if (!selectedLevel2Category) return singleListSections;
    const targetSectionId = `single-${selectedLevel2Category.id}`;
    return singleListSections.filter(
      (section) => catalogSectionTabKey(section.id) === catalogSectionTabKey(targetSectionId)
    );
  }, [singleListSections, selectedLevel2Category]);
  const visibleProductSections = useMemo(() => (
    isSingleListMode
      ? (selectedCategory === null ? singleListSections : filteredSingleListSections)
      : productSections
  ), [isSingleListMode, selectedCategory, singleListSections, filteredSingleListSections, productSections]);
  const activeCatalogTabs = useMemo(() => {
    if (isSingleListMode) {
      return selectedCategory === null ? singleListSections : filteredSingleListSections;
    }
    if (selectedCategory === null) {
      return [];
    }
    if (level3Tabs.length === 0) {
      return [];
    }
    if (directSelectedProducts.length > 0 && selectedLevel2Category) {
      return [
        {
          id: `direct-${selectedLevel2Category.id}`,
          title: language === 'uz' && selectedLevel2Category.name_uz
            ? selectedLevel2Category.name_uz
            : (selectedLevel2Category.name_ru || ''),
          products: directSelectedProducts
        },
        ...level3Tabs
      ];
    }
    return level3Tabs;
  }, [
    isSingleListMode,
    singleListSections,
    filteredSingleListSections,
    selectedCategory,
    level3Tabs,
    directSelectedProducts,
    selectedLevel2Category,
    language
  ]);

  useEffect(() => {
    level3TabButtonRefs.current = {};
  }, [selectedCategory, isSingleListMode]);

  useEffect(() => {
    productGroupRefs.current = {};
  }, [selectedCategory, isSingleListMode]);

  useEffect(() => {
    if (normalizedCatalogSearch || loading || activeCatalogTabs.length === 0) {
      setActiveSubcategoryTab(null);
      return;
    }

    const isCurrentTabPresent = activeCatalogTabs.some(
      (section) => catalogSectionTabKey(section.id) === catalogSectionTabKey(activeSubcategoryTab)
    );
    if (!isCurrentTabPresent) {
      tabActivationSourceRef.current = 'init';
      setActiveSubcategoryTab(activeCatalogTabs[0].id);
    }
  }, [activeCatalogTabs, activeSubcategoryTab, normalizedCatalogSearch, loading]);

  useLayoutEffect(() => {
    if (activeSubcategoryTab === null || activeSubcategoryTab === undefined) return;
    const activationSource = tabActivationSourceRef.current;
    const behavior = activationSource === 'click' ? 'smooth' : 'auto';
    const tabKey = catalogSectionTabKey(activeSubcategoryTab);
    let cancelled = false;
    let retryTimer = 0;
    let retries = 0;
    const attempt = () => {
      if (cancelled) return;
      const btn = level3TabButtonRefs.current[tabKey];
      if (!btn && retries < 6) {
        retries++;
        retryTimer = setTimeout(attempt, 80);
        return;
      }
      if (btn) scrollActiveTabIntoView(tabKey, behavior);
    };
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(attempt);
    });
    tabActivationSourceRef.current = 'scroll';
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(retryTimer);
    };
  }, [activeSubcategoryTab, activeCatalogTabs]);

  useLayoutEffect(() => {
    activeSubcategoryTabRef.current = activeSubcategoryTab;
  }, [activeSubcategoryTab]);

  // Tabs layout management removed to simplify native scrolling


  useEffect(() => {
    if (activeCatalogTabs.length === 0 || normalizedCatalogSearch || loading) {
      return undefined;
    }

    if (!isSingleListMode && selectedCategory === null) {
      return undefined;
    }

    const scrollContainer = getScrollContainer();
    const scrollTarget = scrollContainer === window ? window : scrollContainer;
    const rootScrollNode = typeof document !== 'undefined' ? document.getElementById('root') : null;
    const scrollTargets = [
      scrollTarget,
      rootScrollNode,
      window
    ].filter(Boolean);
    const uniqueScrollTargets = [...new Set(scrollTargets)];
    const stickyOffset = Math.max(56, catalogHeaderHeight);

    const detectVisibleSection = () => {
      if (isTabAutoScrollRef.current) return;
      const sectionProbeLine = stickyOffset + 16;

      let currentId = null;
      for (const section of activeCatalogTabs) {
        const el = productGroupRefs.current[catalogSectionTabKey(section.id)];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= sectionProbeLine) {
          currentId = section.id;
        }
      }

      const scrollPos = scrollContainer === window ? window.scrollY : scrollContainer.scrollTop;
      const containerHeight = scrollContainer === window ? window.innerHeight : scrollContainer.clientHeight;
      const totalHeight = scrollContainer === window ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;
      const isAtBottom = scrollPos + containerHeight >= totalHeight - 48;

      if (isAtBottom && activeCatalogTabs.length > 0) {
        currentId = activeCatalogTabs[activeCatalogTabs.length - 1].id;
      }

      if (currentId === null && activeCatalogTabs.length > 0) {
        currentId = activeCatalogTabs[0].id;
      }

      if (currentId !== null && catalogSectionTabKey(currentId) !== catalogSectionTabKey(activeSubcategoryTab)) {
        tabActivationSourceRef.current = 'scroll';
        setActiveSubcategoryTab(currentId);
      }
    };

    const onScroll = () => {
      if (tabScrollSpyRafRef.current) return;
      tabScrollSpyRafRef.current = requestAnimationFrame(() => {
        tabScrollSpyRafRef.current = null;
        detectVisibleSection();
      });
    };

    const onResize = () => {
      onScroll();
      requestAnimationFrame(() => {
        const id = activeSubcategoryTabRef.current;
        if (id) scrollActiveTabIntoView(id, 'auto');
      });
    };

    detectVisibleSection();
    uniqueScrollTargets.forEach((target) => {
      target.addEventListener('scroll', onScroll, { passive: true });
    });
    window.addEventListener('resize', onResize);

    return () => {
      uniqueScrollTargets.forEach((target) => {
        target.removeEventListener('scroll', onScroll);
      });
      window.removeEventListener('resize', onResize);
      if (tabScrollSpyRafRef.current) {
        cancelAnimationFrame(tabScrollSpyRafRef.current);
        tabScrollSpyRafRef.current = null;
      }
    };
  }, [selectedCategory, activeCatalogTabs, activeSubcategoryTab, normalizedCatalogSearch, loading, catalogHeaderHeight, isSingleListMode]);

  useEffect(() => {
    if (!selectedRestaurant || loading) {
      setCatalogScrollProgress(0);
      return undefined;
    }

    const scrollContainer = getScrollContainer();
    const scrollTarget = scrollContainer === window ? window : scrollContainer;
    const rootScrollNode = typeof document !== 'undefined' ? document.getElementById('root') : null;
    const scrollTargets = [
      scrollTarget,
      rootScrollNode,
      window
    ].filter(Boolean);
    const uniqueScrollTargets = [...new Set(scrollTargets)];

    const updateProgress = () => {
      const scrollTop = scrollContainer === window
        ? (window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || 0)
        : scrollContainer.scrollTop;
      const maxScroll = scrollContainer === window
        ? Math.max(1, (document.documentElement?.scrollHeight || 1) - window.innerHeight)
        : Math.max(1, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const nextProgress = Math.min(1, Math.max(0, scrollTop / maxScroll));
      setCatalogScrollProgress((prev) => (
        Math.abs(prev - nextProgress) < 0.004 ? prev : nextProgress
      ));
    };

    const onScroll = () => {
      if (scrollProgressRafRef.current) return;
      scrollProgressRafRef.current = requestAnimationFrame(() => {
        scrollProgressRafRef.current = null;
        updateProgress();
      });
    };

    updateProgress();
    uniqueScrollTargets.forEach((target) => {
      target.addEventListener('scroll', onScroll, { passive: true });
    });
    window.addEventListener('resize', onScroll);

    return () => {
      uniqueScrollTargets.forEach((target) => {
        target.removeEventListener('scroll', onScroll);
      });
      window.removeEventListener('resize', onScroll);
      if (scrollProgressRafRef.current) {
        cancelAnimationFrame(scrollProgressRafRef.current);
        scrollProgressRafRef.current = null;
      }
    };
  }, [selectedRestaurant, loading, selectedCategory, normalizedCatalogSearch, visibleProductSections.length]);

  useEffect(() => () => {
    if (tabScrollLockTimeoutRef.current) {
      clearTimeout(tabScrollLockTimeoutRef.current);
      tabScrollLockTimeoutRef.current = null;
    }
  }, []);

  const openLevel2Category = (categoryId) => {
    if (selectedCategory === null) {
      categoryListScrollOffsetRef.current = getCurrentScrollOffset();
    }
    isTabAutoScrollRef.current = false;
    setSelectedCategory(categoryId);
    setActiveSubcategoryTab(null);
    scrollToTop();
  };

  const closeLevel2Category = () => {
    isTabAutoScrollRef.current = false;

    if (isShowcaseCatalog) {
      // Внутри витрины поднимаемся по дереву категорий на один уровень.
      const currentId = normalizeId(selectedCategory);
      const entryId = showcaseEntryCategoryRef.current;
      if (currentId !== null && currentId !== entryId) {
        const currentCategory = categoriesById.get(currentId) || null;
        const parentId = normalizeId(currentCategory?.parent_id);
        if (parentId !== null) {
          setSelectedCategory(parentId);
          setActiveSubcategoryTab(null);
          scrollToTop();
          return;
        }
      }
      // Дошли до категории, в которую зашли из витрины — возвращаемся на витрину.
      navigate('/', {
        state: {
          restoreShowcaseScrollOffset: showcaseEntryScrollOffsetRef.current
        }
      });
      return;
    }

    if (isNestedCategoriesMode && selectedCategory !== null) {
      const currentCategory = categoriesById.get(normalizeId(selectedCategory)) || null;
      const parentId = normalizeId(currentCategory?.parent_id);
      if (parentId !== null) {
        const parentCategory = categoriesById.get(parentId) || null;
        const grandParentId = normalizeId(parentCategory?.parent_id);
        if (grandParentId !== null) {
          setSelectedCategory(parentId);
          setActiveSubcategoryTab(null);
          scrollToTop();
          return;
        }
      }
    }
    const restoreOffset = categoryListScrollOffsetRef.current;
    setSelectedCategory(null);
    setActiveSubcategoryTab(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreScrollOffset(restoreOffset);
      });
    });
  };

  const scrollToProductGroup = (sectionId) => {
    const sectionElement = productGroupRefs.current[catalogSectionTabKey(sectionId)];
    if (!sectionElement) return;

    isTabAutoScrollRef.current = true;
    if (tabScrollLockTimeoutRef.current) {
      clearTimeout(tabScrollLockTimeoutRef.current);
    }

    const scrollContainer = getScrollContainer();
    const currentScroll = scrollContainer === window ? window.scrollY : scrollContainer.scrollTop;
    const rect = sectionElement.getBoundingClientRect();
    const stickyOffset = Math.max(56, catalogHeaderHeight) + 12;
    const topOffset = rect.top + currentScroll - stickyOffset;
    tabActivationSourceRef.current = 'click';
    setActiveSubcategoryTab(sectionId);
    scrollToOffset(topOffset);
    tabScrollLockTimeoutRef.current = setTimeout(() => {
      isTabAutoScrollRef.current = false;
    }, 450);
  };

  const getAdViewerKey = () => {
    try {
      const key = 'catalog_ad_viewer_key';
      let value = localStorage.getItem(key);
      if (!value) {
        value = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        localStorage.setItem(key, value);
      }
      return value;
    } catch (e) {
      return `v_fallback_${Date.now()}`;
    }
  };

  const getEntryPopupSeenKey = (restaurantId, bannerId) => (
    `catalog_entry_popup_seen:${Number(restaurantId) || 0}:${Number(bannerId) || 0}`
  );

  const getPendingReviewSnoozeKey = (customerId, restaurantId) => (
    `catalog_pending_review_snooze_until:${Number(customerId) || 0}:${Number(restaurantId) || 0}`
  );

  const getPendingReviewSnoozeUntil = (customerId, restaurantId) => {
    try {
      const raw = localStorage.getItem(getPendingReviewSnoozeKey(customerId, restaurantId));
      const timestamp = Number.parseInt(String(raw || ''), 10);
      return Number.isFinite(timestamp) ? timestamp : 0;
    } catch (e) {
      return 0;
    }
  };

  const setPendingReviewSnoozeUntil = (customerId, restaurantId, timestamp) => {
    try {
      localStorage.setItem(
        getPendingReviewSnoozeKey(customerId, restaurantId),
        String(Math.max(0, Number.parseInt(String(timestamp || 0), 10) || 0))
      );
    } catch (e) {
      // ignore storage errors
    }
  };

  const hasSeenEntryPopupInSession = (restaurantId, bannerId) => {
    try {
      return sessionStorage.getItem(getEntryPopupSeenKey(restaurantId, bannerId)) === '1';
    } catch (e) {
      return false;
    }
  };

  const markEntryPopupSeenInSession = (restaurantId, bannerId) => {
    try {
      sessionStorage.setItem(getEntryPopupSeenKey(restaurantId, bannerId), '1');
    } catch (e) {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!inlineAdBanners.length) return undefined;
    const activeBanner = inlineAdBanners[activeAdIndex] || inlineAdBanners[0];
    if (!activeBanner) return undefined;

    const timeout = setTimeout(() => {
      setActiveAdIndex((prev) => ((prev + 1) % inlineAdBanners.length));
    }, Math.max(2, Number(activeBanner.display_seconds) || 5) * 1000);

    return () => clearTimeout(timeout);
  }, [inlineAdBanners, activeAdIndex]);

  useEffect(() => {
    const activeBanner = inlineAdBanners[activeAdIndex];
    if (!activeBanner || !selectedRestaurant) return;
    // Баннеры магазина (id вида "store-0") не имеют записи в ad_banners — пропускаем учёт.
    if (!Number.isFinite(Number(activeBanner.id))) return;
    const trackKey = `${selectedRestaurant}:${activeBanner.id}`;
    if (viewedAdsRef.current.has(trackKey)) return;
    viewedAdsRef.current.add(trackKey);

    axios.post(`${API_URL}/products/ads-banners/${activeBanner.id}/view`, {
      viewer_key: getAdViewerKey(),
      restaurant_id: selectedRestaurant
    }).catch((error) => {
      console.error('Ad view track error:', error);
    });
  }, [inlineAdBanners, activeAdIndex, selectedRestaurant]);

  useEffect(() => {
    if (!selectedRestaurant || loading || !entryPopupBanners.length) return;

    const nextPopupBanner = entryPopupBanners.find((banner) => !hasSeenEntryPopupInSession(selectedRestaurant, banner.id));
    if (!nextPopupBanner) return;

    const trackKey = `${selectedRestaurant}:${nextPopupBanner.id}`;
    if (!viewedAdsRef.current.has(trackKey)) {
      viewedAdsRef.current.add(trackKey);
      axios.post(`${API_URL}/products/ads-banners/${nextPopupBanner.id}/view`, {
        viewer_key: getAdViewerKey(),
        restaurant_id: selectedRestaurant
      }).catch((error) => {
        console.error('Entry popup ad view track error:', error);
      });
    }

    markEntryPopupSeenInSession(selectedRestaurant, nextPopupBanner.id);
    setEntryPopupBanner(nextPopupBanner);
    setShowEntryPopupModal(true);
  }, [entryPopupBanners, selectedRestaurant, loading]);

  useEffect(() => {
    if (!showEntryPopupModal || !entryPopupBanner) return undefined;

    const timeout = setTimeout(() => {
      setShowEntryPopupModal(false);
    }, Math.max(2, Number(entryPopupBanner.display_seconds) || 5) * 1000);

    return () => clearTimeout(timeout);
  }, [showEntryPopupModal, entryPopupBanner]);

  const openAdBannerLink = (banner) => {
    if (!banner?.click_url) return;
    const viewerKey = encodeURIComponent(getAdViewerKey());
    const restaurantId = selectedRestaurant ? `&restaurant_id=${selectedRestaurant}` : '';
    const separator = banner.click_url.includes('?') ? '&' : '?';
    const targetUrl = `${banner.click_url}${separator}viewer_key=${viewerKey}${restaurantId}`;
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(targetUrl);
      return;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const closeEntryPopup = () => setShowEntryPopupModal(false);

  const handleEntryPopupAction = () => {
    if (!entryPopupBanner?.click_url) {
      closeEntryPopup();
      return;
    }
    openAdBannerLink(entryPopupBanner);
    closeEntryPopup();
  };

  const getCatalogCardMediaKey = (productId, selectedVariant = null) => (
    `catalog_card_media_${Number(productId) || 0}_${normalizeVariantKey(selectedVariant || 'base')}`
  );

  const isCatalogCardSwipeRecentlyTriggered = (mediaKey) => {
    const lastTimestamp = Number(catalogCardSwipeTimestampRef.current?.[mediaKey] || 0);
    if (!lastTimestamp) return false;
    return (Date.now() - lastTimestamp) < CATALOG_CARD_SWIPE_BLOCK_CLICK_MS;
  };

  const handleCatalogCardTouchStart = (event, mediaKey) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    catalogCardTouchStartRef.current[mediaKey] = {
      x: touch.clientX,
      y: touch.clientY
    };
  };

  const handleCatalogCardTouchEnd = (event, mediaKey, imagesCount) => {
    if (!mediaKey || !Number.isFinite(imagesCount) || imagesCount <= 1) return;
    const started = catalogCardTouchStartRef.current?.[mediaKey];
    delete catalogCardTouchStartRef.current[mediaKey];
    const touch = event.changedTouches?.[0];
    if (!started || !touch) return;
    const dx = touch.clientX - started.x;
    const dy = touch.clientY - started.y;
    if (Math.abs(dx) < CATALOG_CARD_SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    setCatalogCardImageIndexes((prev) => {
      const currentIndex = Number(prev?.[mediaKey] || 0);
      const normalizedCurrent = Number.isFinite(currentIndex)
        ? Math.max(0, Math.min(imagesCount - 1, currentIndex))
        : 0;
      const nextIndex = dx < 0
        ? (normalizedCurrent + 1) % imagesCount
        : (normalizedCurrent - 1 + imagesCount) % imagesCount;
      return {
        ...(prev || {}),
        [mediaKey]: nextIndex
      };
    });
    catalogCardSwipeTimestampRef.current[mediaKey] = Date.now();
  };

  // Product card component
  const renderProductCard = (product) => {
    const isPortraitCardMode = catalogCardMode === 'portrait';
    const cardImageAspectRatio = isPortraitCardMode ? '3 / 4' : '4 / 3';
    const cardTitleFontSize = isPortraitCardMode ? '0.86rem' : '0.85rem';
    const cardPriceFontSize = isPortraitCardMode ? '0.94rem' : '0.9rem';
    const selectedVariant = getSelectedVariantForProduct(product);
    const cartItem = getCartItem(product.id, selectedVariant);
    const hasQty = !!cartItem;
    const qty = cartItem?.quantity || 0;
    const quantityStep = resolveQuantityStep(cartItem || product);
    const overlayKey = `qty_open_${product.id}_${normalizeVariantKey(selectedVariant || 'base')}`;
    const isOpen = catalogQtyOpen?.[overlayKey];
    const favoriteActive = isFavorite(product.id);
    const productName = getProductName(product);
    const primaryImageUrl = getProductCardImage(product, selectedVariant);
    const cardGalleryImages = getProductGalleryImages(product, selectedVariant);
    const mediaImages = cardGalleryImages.length > 0
      ? cardGalleryImages
      : (primaryImageUrl ? [primaryImageUrl] : []);
    const cardMediaKey = getCatalogCardMediaKey(product.id, selectedVariant);
    const storedCardMediaIndex = Number(catalogCardImageIndexes?.[cardMediaKey] || 0);
    const activeCardMediaIndex = mediaImages.length > 0
      ? Math.max(0, Math.min(mediaImages.length - 1, storedCardMediaIndex))
      : 0;
    const displayCardImageUrl = mediaImages[activeCardMediaIndex] || primaryImageUrl;
    const productSizeOptions = getProductSizeOptions(product);
    const productPriceMeta = getSelectedVariantPriceMeta(product, selectedVariant);
    const productDisplayPrice = productPriceMeta.currentPrice;
    const isAvailable = getProductOverallAvailability(product);
    const stockLimit = resolveProductStockLimit(product, selectedVariant);
    const isAtStockLimit = Number.isFinite(stockLimit) && Number(qty || 0) >= stockLimit;
    const renderImageFallback = () => renderStoreLogoFallback({
      wrapperStyle: { width: '100%', aspectRatio: cardImageAspectRatio, background: '#f8f9fa' }
    });

    return (
      <Card
        className="h-100 shadow-sm border-0"
        role="button"
        tabIndex={0}
        onClick={() => openProductDetailsModal(product)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openProductDetailsModal(product);
          }
        }}
      >
        <div style={{ position: 'relative' }}>
          {displayCardImageUrl ? (
            <Card.Img
              variant="top"
              src={displayCardImageUrl}
              alt={productName}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                aspectRatio: cardImageAspectRatio,
                objectFit: 'cover',
                cursor: 'zoom-in',
                display: 'block',
                touchAction: 'pan-y'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isCatalogCardSwipeRecentlyTriggered(cardMediaKey)) return;
                openProductDetailsModal(product);
              }}
              onTouchStart={(event) => handleCatalogCardTouchStart(event, cardMediaKey)}
              onTouchEnd={(event) => handleCatalogCardTouchEnd(event, cardMediaKey, mediaImages.length)}
              onTouchCancel={() => {
                delete catalogCardTouchStartRef.current[cardMediaKey];
              }}
              onError={(e) => {
                if (storeLogoFallbackUrl) {
                  e.target.onerror = null;
                  e.target.src = storeLogoFallbackUrl;
                  e.target.style.objectFit = 'contain';
                  e.target.style.padding = '14px';
                  e.target.style.opacity = '0.22';
                  e.target.style.background = '#f8f9fa';
                } else {
                  e.target.src = 'https://via.placeholder.com/150?text=No+Image';
                }
              }}
            />
          ) : (
            renderImageFallback()
          )}
          {mediaImages.length > 1 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: 8,
                zIndex: 5,
                display: 'flex',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(15, 23, 42, 0.28)',
                pointerEvents: 'none'
              }}
            >
              {mediaImages.map((_, imageIndex) => (
                <span
                  key={`card-media-dot-${cardMediaKey}-${imageIndex}`}
                  style={{
                    width: imageIndex === activeCardMediaIndex ? 10 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: imageIndex === activeCardMediaIndex ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    transition: 'all 0.18s ease'
                  }}
                />
              ))}
            </div>
          )}
          {!isAvailable && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span className="badge bg-secondary">{language === 'uz' ? 'Mavjud emas' : 'Нет в наличии'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleToggleFavorite(product);
            }}
            aria-label={favoriteActive
              ? (language === 'uz' ? 'Saralanganlardan olib tashlash' : 'Убрать из избранного')
              : (language === 'uz' ? 'Saralanganlarga qo‘shish' : 'Добавить в избранное')}
            title={favoriteActive
              ? (language === 'uz' ? 'Saralanganlardan olib tashlash' : 'Убрать из избранного')
              : (language === 'uz' ? 'Saralanganlarga qo‘shish' : 'Добавить в избранное')}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 30,
              height: 30,
              borderRadius: '999px',
              border: isMenuLiquidGlassEnabled
                ? `1px solid ${favoriteActive ? 'rgba(255, 255, 255, 0.45)' : 'rgba(148, 163, 184, 0.38)'}`
                : '1px solid rgba(255,255,255,0.55)',
              background: isMenuLiquidGlassEnabled
                ? (
                  favoriteActive
                    ? `rgba(255, 95, 125, ${Math.max(0.36, Math.min(0.72, menuLiquidGlassOpacityAlpha + 0.12))})`
                    : `rgba(255,255,255,${menuLiquidGlassOpacityAlpha})`
                )
                : (favoriteActive ? 'rgba(255, 95, 125, 0.94)' : 'rgba(255,255,255,0.92)'),
              backdropFilter: isMenuLiquidGlassEnabled ? `blur(${menuLiquidGlassBlur}px)` : 'none',
              WebkitBackdropFilter: isMenuLiquidGlassEnabled ? `blur(${menuLiquidGlassBlur}px)` : 'none',
              color: favoriteActive ? '#fff' : '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              zIndex: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              lineHeight: 1
            }}
          >
            <HeartIcon size={16} filled={favoriteActive} color={favoriteActive ? '#ffffff' : '#475569'} />
          </button>

          {/* Quantity controls on image */}
          {isAvailable && productSizeOptions.length === 0 && (
            <>
              {/* Plus button or Quantity circle */}
              {!isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    zIndex: 2
                  }}
                >
                  {!hasQty ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm rounded-circle d-flex align-items-center justify-content-center shadow"
                      style={{
                        width: 40,
                        height: 40,
                        fontSize: '22px',
                        fontWeight: 'bold',
                        lineHeight: 1,
                        padding: 0,
                        touchAction: 'manipulation'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddToCart(product);
                        setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                        setTimeout(() => {
                          setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                        }, 2000);
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          height: '100%',
                          transform: 'translateY(-1px)'
                        }}
                      >
                        +
                      </span>
                    </button>
                  ) : (
                    <span
                      className="rounded-circle d-inline-flex align-items-center justify-content-center shadow"
                      style={{
                        width: 40,
                        height: 40,
                        background: 'var(--accent-color, #FFD700)',
                        color: '#1a1a1a',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        touchAction: 'manipulation'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                        setTimeout(() => {
                          setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                        }, 2000);
                      }}
                    >
                      {qty}
                    </span>
                  )}
                </div>
              )}

              {/* Expanded controls */}
              {isOpen && (
                <div
                  className="catalog-card-qty-stepper d-flex align-items-center justify-content-between rounded-pill px-1 shadow"
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    background: 'rgba(255,255,255,0.95)',
                    zIndex: 3,
                    minWidth: '108px',
                    minHeight: '40px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                    setTimeout(() => {
                      setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                    }, 2000);
                  }}
                >
                    <button
                      type="button"
                      className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                      style={{ width: 34, height: 34, fontSize: '18px', touchAction: 'manipulation' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateQuantity(product.id, qty - quantityStep, selectedVariant);
                      }}
                    >
                      −
                  </button>
                  <span className="fw-bold px-2" style={{ fontSize: '15px' }}>{formatQuantity(qty)}</span>
                  <button
                    type="button"
                    className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                    style={{
                      width: 34,
                      height: 34,
                      fontSize: '18px',
                      touchAction: 'manipulation',
                      opacity: isAtStockLimit ? 0.45 : 1
                    }}
                    disabled={isAtStockLimit}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateProductQuantityWithinStock(product, qty, quantityStep, selectedVariant);
                      }}
                    >
                      +
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <Card.Body className="d-flex flex-column p-2">
          <Card.Title className="fs-6 mb-1" style={{ fontSize: cardTitleFontSize, lineHeight: '1.2' }}>
            {productName}
          </Card.Title>
          <Card.Text className="text-muted small mb-1" style={{ fontSize: '0.7rem' }}>
            {language === 'uz' && product.unit_uz ? product.unit_uz : product.unit}
          </Card.Text>
          <div className="mt-auto d-flex flex-column" style={{ lineHeight: 1.2 }}>
            {productPriceMeta.isDiscount && Number.isFinite(productPriceMeta.originalPrice) && (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#94a3b8',
                  textDecoration: 'line-through',
                  fontWeight: 500
                }}
              >
                {formatPrice(productPriceMeta.originalPrice)} {t('sum')}
              </span>
            )}
            <span className="fw-bold" style={{ fontSize: cardPriceFontSize, color: productPriceMeta.isDiscount ? '#dc2626' : 'var(--primary-color)' }}>
              {formatPrice(productDisplayPrice)} {t('sum')}
            </span>
          </div>
        </Card.Body>
      </Card>
    );
  };

  const renderAdBannerCarousel = () => {
    if (!inlineAdBanners.length) return null;
    const banner = inlineAdBanners[activeAdIndex] || inlineAdBanners[0];
    if (!banner) return null;

    const transitionEffect = banner.transition_effect || 'fade';
    let animation = 'none';
    if (transitionEffect === 'fade') animation = 'catalogAdFadeIn 360ms ease';
    if (transitionEffect === 'slide') animation = 'catalogAdSlideIn 360ms ease';

    return (
      <div className="mb-3">
        <style>{`
          @keyframes catalogAdFadeIn { from { opacity: 0.2; } to { opacity: 1; } }
          @keyframes catalogAdSlideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        `}</style>
        <div
          style={{
            borderRadius: '16px',
            overflow: 'hidden',
            background: '#fff',
            border: '1px solid rgba(71, 85, 105,0.18)',
            boxShadow: '0 8px 20px rgba(60, 42, 24, 0.05)'
          }}
        >
          <div
            key={banner.id}
            role={banner.click_url ? 'button' : undefined}
            tabIndex={banner.click_url ? 0 : undefined}
            onClick={banner.click_url ? () => openAdBannerLink(banner) : undefined}
            onKeyDown={banner.click_url ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAdBannerLink(banner);
              }
            } : undefined}
            style={{
              position: 'relative',
              minHeight: '150px',
              background: '#fff',
              animation,
              cursor: banner.click_url ? 'pointer' : 'default'
            }}
          >
            <img
              src={resolveImageUrl(
                isDesktopViewport
                  ? (banner.image_url || banner.image_url_mobile)
                  : (banner.image_url_mobile || banner.image_url)
              )}
              alt={banner.title || 'Реклама'}
              style={{
                width: '100%',
                height: '150px',
                objectFit: 'cover',
                display: 'block',
                background: '#fff'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            {inlineAdBanners.length > 1 && (
              <div
                className="d-flex justify-content-center align-items-center gap-1"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 8,
                  transform: 'translateX(-50%)',
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'rgba(255, 255, 255, 0.82)',
                  backdropFilter: 'blur(2px)'
                }}
              >
                {inlineAdBanners.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAdIndex(idx);
                    }}
                    aria-label={`banner-${idx + 1}`}
                    style={{
                      width: idx === activeAdIndex ? 18 : 6,
                      height: 6,
                      borderRadius: 999,
                      border: 'none',
                      background: idx === activeAdIndex ? 'var(--primary-color)' : 'rgba(71, 85, 105,0.25)',
                      transition: 'all 180ms ease'
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const hasCartTotalBanner = (cartTotal || 0) > 0;

  const renderCartTotalBanner = () => {
    if (!hasCartTotalBanner) return null;

    return (
      <div className="mt-2 mb-0">
        <button
          type="button"
          onClick={() => { if (isGuestStorefront) { setShowProductDetailsModal(false); setStorefrontOrderError(''); setStorefrontOrderSuccess(''); setStorefrontStep(1); setShowStorefrontCartModal(true); return; } navigate('/cart'); }}
          style={{
            width: '100%',
            border: '1px solid rgba(71, 85, 105,0.22)',
            background: (cartTotal || 0) > 0 ? 'rgba(71, 85, 105,0.10)' : 'rgba(255,255,255,0.85)',
            color: '#111827',
            borderRadius: '12px',
            padding: '11px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(60, 42, 24, 0.04)'
          }}
          title={language === 'uz' ? 'Savatni ochish' : 'Открыть корзину'}
        >
          <div className="d-flex align-items-center gap-2 min-w-0">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 999,
                background: 'rgba(71, 85, 105,0.13)',
                color: 'var(--primary-color)',
                flexShrink: 0
              }}
            >
              <CartLucideIcon size={16} />
            </span>
            <span
              style={{
                color: '#4b5563',
                fontWeight: 500,
                fontSize: '0.88rem',
                lineHeight: 1.1
              }}
            >
              {language === 'uz' ? 'Jami summa' : 'Итого сумма'}
            </span>
          </div>
          <span
            style={{
              marginLeft: 'auto',
              whiteSpace: 'nowrap',
              color: 'var(--primary-color)',
              fontWeight: 700,
              fontSize: '0.95rem'
            }}
          >
            {formatPrice(cartTotal || 0)} {t('sum')}
          </span>
        </button>
      </div>
    );
  };

  const resetProductDetailsState = () => {
    setSelectedProductDetails(null);
    setRelatedProducts([]);
    setProductReviews([]);
    setProductReviewsTotal(0);
    setProductReviewsAverage(0);
    setProductReviewsHasMore(false);
    setShowProductReviewComposer(false);
    setShowAllProductReviews(false);
    setProductReviewPermissions({
      is_authenticated: false,
      has_successful_order: false,
      can_review: false
    });
    setProductWeeklyBuyers(0);
    setProductWeeklyOrders(0);
    setProductWeeklySoldCount(0);
    setProductDetailsError('');
  };

  const closeProductDetailsModal = () => {
    closeShareFallbackModal();
    setShowProductDetailsModal(false);
    setSelectedProductSummary(null);
    resetProductDetailsState();
    setProductReviewRating(5);
    setProductReviewComment('');
    setShowProductReviewComposer(false);
    setProductHeroIndex(0);
    productHeroSwipeTriggeredRef.current = false;
    productHeroTouchStartXRef.current = null;
    productHeroTouchStartYRef.current = null;
  };

  const loadProductDetails = async (productId, fallbackProduct = null) => {
    if (!productId) return;
    setProductDetailsLoading(true);
    setProductDetailsError('');
    try {
      const response = await axios.get(`${API_URL}/products/${productId}/details`);
      const payload = response.data || {};
      const detailsProduct = payload.product || fallbackProduct || null;
      const related = Array.isArray(payload?.related_products) ? payload.related_products.slice(0, 15) : [];
      const ratingAverage = normalizeRatingValue(payload?.rating?.average, 0);
      const ratingTotal = Number.parseInt(payload?.rating?.total, 10) || 0;
      const latestReviews = Array.isArray(payload?.latest_reviews) ? payload.latest_reviews : [];
      const hasMoreReviews = Boolean(payload?.has_more_reviews) && ratingTotal > latestReviews.length;
      const weeklyBuyers = Number.parseInt(payload?.weekly_stats?.buyers_count, 10) || 0;
      const weeklyOrders = Number.parseInt(payload?.weekly_stats?.orders_count, 10) || 0;
      const weeklySoldCount = Number.parseFloat(payload?.weekly_stats?.sold_count) || 0;
      const myReview = payload?.my_review || null;
      const reviewPermissions = payload?.review_permissions || {};
      const canReview = Boolean(reviewPermissions?.can_review);

      setSelectedProductDetails(detailsProduct);
      setRelatedProducts(related);
      setProductReviewsAverage(ratingAverage);
      setProductReviewsTotal(ratingTotal);
      setProductReviews(latestReviews);
      setProductReviewsHasMore(hasMoreReviews);
      setProductReviewPermissions({
        is_authenticated: Boolean(reviewPermissions?.is_authenticated),
        has_successful_order: Boolean(reviewPermissions?.has_successful_order),
        can_review: canReview
      });
      setProductWeeklyBuyers(weeklyBuyers);
      setProductWeeklyOrders(weeklyOrders);
      setProductWeeklySoldCount(weeklySoldCount);
      if (myReview) {
        setProductReviewRating(normalizeRatingValue(myReview.rating, 5));
        setProductReviewComment(String(myReview.comment || ''));
      } else {
        setProductReviewRating(5);
        setProductReviewComment('');
      }
      if (!canReview) {
        setShowProductReviewComposer(false);
      }
    } catch (error) {
      setProductDetailsError(
        language === 'uz'
          ? "Mahsulot tafsilotlarini yuklab bo'lmadi"
          : 'Не удалось загрузить детали товара'
      );
      setSelectedProductDetails(fallbackProduct || null);
      setRelatedProducts([]);
      setProductReviews([]);
      setProductReviewsAverage(0);
      setProductReviewsTotal(0);
      setProductReviewsHasMore(false);
      setProductReviewPermissions({
        is_authenticated: false,
        has_successful_order: false,
        can_review: false
      });
      setProductWeeklyBuyers(0);
      setProductWeeklyOrders(0);
      setProductWeeklySoldCount(0);
    } finally {
      setProductDetailsLoading(false);
    }
  };

  const openProductDetailsModal = (product) => {
    if (!product?.id) return;
    setSelectedProductSummary(product);
    setShowProductDetailsModal(true);
    resetProductDetailsState();
    setProductReviewRating(5);
    setProductReviewComment('');
    setShowProductReviewComposer(false);
    setProductHeroIndex(0);
    productHeroSwipeTriggeredRef.current = false;
    productHeroTouchStartXRef.current = null;
    productHeroTouchStartYRef.current = null;
    loadProductDetails(product.id, product);
  };

  // Handle category filtering from Showcase navigation
  useEffect(() => {
    const showcaseEntryScrollOffset = Number.parseInt(
      String(location.state?.showcaseScrollOffset || ''),
      10
    );
    if (Number.isInteger(showcaseEntryScrollOffset) && showcaseEntryScrollOffset >= 0) {
      showcaseEntryScrollOffsetRef.current = showcaseEntryScrollOffset;
    }
    const requestedCategoryId = normalizeId(location.state?.selectedCategoryId);
    if (!requestedCategoryId || categories.length === 0) return;

    const requestedCategory = categoriesById.get(requestedCategoryId) || null;
    let targetLevel2CategoryId = requestedCategoryId;
    let targetLevel3TabId = null;

    if (requestedCategory) {
      const parentId = normalizeId(requestedCategory.parent_id);
      if (parentId === null) {
        if (isNestedCategoriesMode) {
          // В папочном режиме показываем подкатегории выбранной категории как
          // папки, а не проваливаемся сразу в первую из них.
          targetLevel2CategoryId = requestedCategoryId;
        } else {
          const level2Children = (childrenByParent.get(requestedCategoryId) || [])
            .map((item) => normalizeId(item?.id))
            .filter((id) => Number.isInteger(id));
          targetLevel2CategoryId = level2Children[0] || requestedCategoryId;
        }
      } else {
        const parentCategory = categoriesById.get(parentId) || null;
        const grandParentId = normalizeId(parentCategory?.parent_id);
        if (parentCategory && grandParentId !== null) {
          // Selected category is level 3.
          if (isNestedCategoriesMode) {
            targetLevel2CategoryId = requestedCategoryId;
          } else {
            // Open its level 2 and activate the tab.
            targetLevel2CategoryId = parentId;
            targetLevel3TabId = requestedCategoryId;
          }
        } else {
          // Selected category is already level 2.
          targetLevel2CategoryId = requestedCategoryId;
        }
      }
    }

    if (targetLevel2CategoryId) {
      if (isShowcaseCatalog) {
        // Запоминаем категорию, в которую зашли из витрины — это «корень»
        // навигации: при достижении его кнопка «назад» вернёт на витрину.
        showcaseEntryCategoryRef.current = normalizeId(targetLevel2CategoryId);
      }
      setSelectedCategory(targetLevel2CategoryId);
      if (isSingleListMode) {
        setActiveSubcategoryTab(`single-${targetLevel2CategoryId}`);
      } else if (!isNestedCategoriesMode && targetLevel3TabId) {
        setActiveSubcategoryTab(targetLevel3TabId);
      }
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [
    location.state?.selectedCategoryId,
    location.state?.showcaseScrollOffset,
    categories.length,
    categoriesById,
    childrenByParent,
    isSingleListMode,
    isNestedCategoriesMode,
    navigate,
    location.pathname
  ]);

  // Handle direct product opening from Showcase navigation
  useEffect(() => {
    const requestedProductId = normalizeId(location.state?.selectedProductId);
    if (!requestedProductId || products.length === 0) return;

    const requestedProduct = products.find(
      (product) => normalizeId(product?.id) === requestedProductId
    );
    if (requestedProduct) {
      openProductDetailsModal(requestedProduct);
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.selectedProductId, products, navigate, location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (showProductDetailsModal) return;
    if (!selectedRestaurant || products.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const requestedProductId = normalizeId(params.get('product_id'));
    if (!requestedProductId) return;

    const requestedRestaurantId = normalizeId(params.get('restaurant_id'));
    if (requestedRestaurantId && requestedRestaurantId !== normalizeId(selectedRestaurant)) {
      setSelectedRestaurant(requestedRestaurantId);
      return;
    }

    const requestedProduct = products.find((item) => normalizeId(item?.id) === requestedProductId);
    if (!requestedProduct) return;

    const requestedVariant = String(params.get('variant') || '').trim();
    if (requestedVariant) {
      selectVariantForProduct(requestedProduct, requestedVariant);
    }
    openProductDetailsModal(requestedProduct);

    const cleanedParams = new URLSearchParams(window.location.search);
    cleanedParams.delete('product_id');
    cleanedParams.delete('restaurant_id');
    cleanedParams.delete('variant');
    const cleanedSearch = cleanedParams.toString();
    const cleanedUrl = `${window.location.pathname}${cleanedSearch ? `?${cleanedSearch}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(window.history.state, '', cleanedUrl);
  }, [products, selectedRestaurant, showProductDetailsModal]);

  useEffect(() => {
    if (!showProductDetailsModal) return;
    const activeProduct = selectedProductDetails || selectedProductSummary;
    if (!activeProduct?.id) return;
    const activeProductId = Number(activeProduct.id);
    if (!activeProductId) return;
    const selectedVariant = String(selectedProductVariants[activeProductId] || '').trim();
    if (!selectedVariant) return;
    setProductHeroIndex(0);
    productHeroSwipeTriggeredRef.current = false;
  }, [selectedProductVariants, selectedProductDetails, selectedProductSummary, showProductDetailsModal]);

  const loadMoreProductReviews = async () => {
    const product = selectedProductDetails || selectedProductSummary;
    if (!product?.id || productReviewsLoadingMore || !productReviewsHasMore) return;
    setProductReviewsLoadingMore(true);
    try {
      const response = await axios.get(`${API_URL}/products/${product.id}/reviews`, {
        params: {
          limit: 50,
          offset: productReviews.length
        }
      });
      const payload = response.data || {};
      const nextReviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      setProductReviews((prev) => {
        const knownIds = new Set(prev.map((item) => Number(item.id)));
        const merged = [...prev];
        nextReviews.forEach((item) => {
          const id = Number(item.id);
          if (!knownIds.has(id)) merged.push(item);
        });
        return merged;
      });
      if (Number.isFinite(Number(payload.average_rating))) {
        setProductReviewsAverage(normalizeRatingValue(payload.average_rating, 0));
      }
      if (Number.isFinite(Number(payload.total))) {
        setProductReviewsTotal(Number.parseInt(payload.total, 10) || 0);
      }
      setProductReviewsHasMore(Boolean(payload.has_more));
    } catch (error) {
      setProductDetailsError(
        language === 'uz'
          ? "Kommentlarni yuklab bo'lmadi"
          : 'Не удалось загрузить комментарии'
      );
    } finally {
      setProductReviewsLoadingMore(false);
    }
  };

  const submitProductReview = async () => {
    if (isGuestStorefront) { promptTelegramOrder(); return; }
    const product = selectedProductDetails || selectedProductSummary;
    if (!product?.id || productReviewSubmitting) return;
    if (!productReviewPermissions.can_review) {
      setProductDetailsError(
        language === 'uz'
          ? "Baholash faqat muvaffaqiyatli yetkazilgan buyurtmadan keyin ochiladi"
          : 'Оценка доступна только после успешно доставленного заказа'
      );
      return;
    }
    const rating = Math.round(normalizeRatingValue(productReviewRating, 0));
    if (rating < 1 || rating > 5) {
      setProductDetailsError(
        language === 'uz'
          ? "Bahoni 1 dan 5 gacha tanlang"
          : 'Выберите оценку от 1 до 5'
      );
      return;
    }

    setProductReviewSubmitting(true);
    setProductDetailsError('');
    try {
      await axios.post(`${API_URL}/products/${product.id}/reviews`, {
        rating,
        comment: String(productReviewComment || '').trim()
      });
      await loadProductDetails(product.id, product);
    } catch (error) {
      setProductDetailsError(
        error?.response?.data?.error
        || (language === 'uz' ? "Kommentni saqlab bo'lmadi" : 'Не удалось сохранить комментарий')
      );
    } finally {
      setProductReviewSubmitting(false);
    }
  };

  const activePendingProductReviewItem = pendingProductReviewItems[0] || null;

  const closePendingProductReviewModal = () => {
    setShowPendingProductReviewModal(false);
    setPendingProductReviewError('');
  };

  const deferPendingProductReviewModal = () => {
    if (user?.id && selectedRestaurant) {
      setPendingReviewSnoozeUntil(user.id, selectedRestaurant, Date.now() + PENDING_PRODUCT_REVIEW_SNOOZE_MS);
    }
    closePendingProductReviewModal();
  };

  const submitPendingProductReview = async () => {
    if (!activePendingProductReviewItem?.product_id || pendingProductReviewSubmitting) return;
    const rating = Math.round(normalizeRatingValue(pendingProductReviewRating, 0));
    if (rating < 1 || rating > 5) {
      setPendingProductReviewError(
        language === 'uz'
          ? "Bahoni 1 dan 5 gacha tanlang"
          : 'Выберите оценку от 1 до 5'
      );
      return;
    }

    setPendingProductReviewSubmitting(true);
    setPendingProductReviewError('');
    try {
      await axios.post(`${API_URL}/products/${activePendingProductReviewItem.product_id}/reviews`, {
        rating,
        comment: String(pendingProductReviewComment || '').trim()
      });

      const remainingItems = pendingProductReviewItems.slice(1);
      setPendingProductReviewItems(remainingItems);
      setPendingProductReviewRating(5);
      setPendingProductReviewComment('');
      setShowPendingProductReviewModal(remainingItems.length > 0);

      const openProductId = Number((selectedProductDetails || selectedProductSummary)?.id || 0);
      if (openProductId > 0 && openProductId === Number(activePendingProductReviewItem.product_id)) {
        await loadProductDetails(openProductId, selectedProductDetails || selectedProductSummary);
      }
    } catch (error) {
      setPendingProductReviewError(
        error?.response?.data?.error
        || (language === 'uz' ? "Kommentni saqlab bo'lmadi" : 'Не удалось сохранить комментарий')
      );
    } finally {
      setPendingProductReviewSubmitting(false);
    }
  };

  const openProductFromSearch = (product) => {
    openProductDetailsModal(product);
  };

  const renderCatalogSearch = ({ compact = false } = {}) => (
    <div className={compact ? 'mt-0 mb-0' : 'mt-2 mb-0'}>
      <div
        style={{
          border: '1px solid rgba(71, 85, 105,0.22)',
          background: compact ? 'rgba(255,255,255,0.95)' : '#fff',
          borderRadius: 12,
          padding: '10px 12px',
          boxShadow: 'none'
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <span
            style={{
              width: 18,
              height: 18,
              color: '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <SearchLucideIcon size={16} color="#475569" />
          </span>
          <input
            ref={catalogSearchInputRef}
            type="search"
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            placeholder={animatedCatalogSearchPlaceholder || (language === 'uz' ? 'Tovar qidirish...' : 'Поиск товара...')}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#111827',
              fontSize: '0.92rem'
            }}
          />
          {catalogSearchQuery && (
            <button
              type="button"
              onClick={clearCatalogSearch}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#475569',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0
              }}
              aria-label={language === 'uz' ? 'Qidiruvni tozalash' : 'Очистить поиск'}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderCatalogSearchResults = () => {
    if (!normalizedCatalogSearch) return null;

    return (
      <div className="pt-2 pb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0 fw-bold" style={{ color: '#1f2937' }}>
            {language === 'uz' ? 'Topilgan tovarlar' : 'Найденные товары'}
          </h6>
          <small className="text-muted">{catalogSearchResults.length}</small>
        </div>

        {catalogSearchResults.length === 0 ? (
          <div className="text-center py-4 text-muted">
            {language === 'uz' ? 'Mos tovar topilmadi' : 'Товары не найдены'}
          </div>
        ) : (
          <div
            style={{
              background: '#fff',
              border: '1px solid rgba(71, 85, 105,0.18)',
              borderRadius: 14,
              overflow: 'hidden'
            }}
          >
            {catalogSearchResults.map((product, index) => {
              const productName = getProductName(product);
              const selectedVariant = getSelectedVariantForProduct(product);
              const imageUrl = getProductCardImage(product, selectedVariant);
              const category = categoriesById.get(Number(product.category_id));
              const productSizeOptions = getProductSizeOptions(product);
              const hasSelectableVariants = productSizeOptions.length > 0;
              const cartItem = getCartItem(product.id, selectedVariant);
              const qty = cartItem?.quantity || 0;
              const quantityStep = resolveQuantityStep(cartItem || product);
              const isAvailable = getProductOverallAvailability(product);
              const stockLimit = resolveProductStockLimit(product, selectedVariant);
              const isAtStockLimit = Number.isFinite(stockLimit) && Number(qty || 0) >= stockLimit;
              const displayPriceMeta = getSelectedVariantPriceMeta(product, selectedVariant);
              const displayPrice = displayPriceMeta.currentPrice;
              return (
                <div
                  key={`search-result-${product.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderBottom: index === catalogSearchResults.length - 1 ? 'none' : '1px solid rgba(71, 85, 105,0.12)'
                  }}
                >
                  {imageUrl ? (
                    <button
                      type="button"
                      className="border-0 p-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openProductDetailsModal(product);
                      }}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#f1f5f9',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      aria-label={language === 'uz' ? 'Tovarni ochish' : 'Открыть товар'}
                    >
                      <img
                        src={imageUrl}
                        alt={productName}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </button>
                  ) : (
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#f1f5f9',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {storeLogoFallbackUrl ? (
                        <img
                          src={storeLogoFallbackUrl}
                          alt={currentRestaurant?.name || 'Store logo'}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '70%', height: '70%', objectFit: 'contain', opacity: 0.22 }}
                        />
                      ) : (
                        <span style={{ opacity: 0.5 }}>🏪</span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openProductFromSearch(product)}
                    className="border-0 bg-transparent p-0 text-start min-w-0 flex-grow-1"
                    style={{ minWidth: 0 }}
                  >
                    <div className="fw-semibold text-truncate" style={{ color: '#111827', fontSize: '0.92rem' }}>
                      {productName}
                    </div>
                    <div className="small text-muted text-truncate">
                      {category ? getCategoryName(category) : (language === 'uz' ? 'Kategoriya' : 'Категория')}
                    </div>
                  </button>
                  <div className="d-flex flex-column align-items-end" style={{ minWidth: 94 }}>
                    {isAvailable ? (
                      hasSelectableVariants ? (
                        <span className="badge bg-light text-secondary border" style={{ fontSize: '0.72rem' }}>
                          {language === 'uz' ? 'Variant' : 'Вариант'}
                        </span>
                      ) : qty > 0 ? (
                        <div
                          className="d-flex align-items-center justify-content-between rounded-pill px-1"
                          style={{
                            background: 'rgba(71, 85, 105,0.10)',
                            border: '1px solid rgba(71, 85, 105,0.2)',
                            minWidth: 102,
                            height: 38
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-sm p-0 d-flex align-items-center justify-content-center border-0 bg-transparent"
                            style={{ width: 32, height: 32, color: '#4b5563', fontSize: '18px', touchAction: 'manipulation' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(product.id, qty - quantityStep, selectedVariant);
                            }}
                            aria-label={language === 'uz' ? 'Kamaytirish' : 'Уменьшить'}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.86rem', minWidth: 18, textAlign: 'center' }}>
                            {formatQuantity(qty)}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm p-0 d-flex align-items-center justify-content-center border-0 bg-transparent"
                            style={{
                              width: 32,
                              height: 32,
                              color: 'var(--primary-color)',
                              fontSize: '18px',
                              touchAction: 'manipulation',
                              opacity: isAtStockLimit ? 0.45 : 1
                            }}
                            disabled={isAtStockLimit}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateProductQuantityWithinStock(product, qty, quantityStep, selectedVariant);
                            }}
                            aria-label={language === 'uz' ? 'Ko‘paytirish' : 'Увеличить'}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToCart(product);
                          }}
                          className="btn btn-sm rounded-pill"
                          style={{
                            minWidth: 102,
                            height: 38,
                            background: 'var(--primary-color)',
                            border: '1px solid var(--primary-color)',
                            color: '#fff',
                            fontSize: '1.05rem',
                            lineHeight: 1,
                            touchAction: 'manipulation'
                          }}
                        >
                          <span style={{ display: 'inline-block', transform: 'translateY(-1px)' }}>+</span>
                        </button>
                      )
                    ) : (
                      <span className="badge bg-secondary" style={{ fontSize: '0.7rem' }}>
                        {language === 'uz' ? 'Mavjud emas' : 'Нет'}
                      </span>
                    )}
                    <div className="text-end mt-1 d-flex flex-column align-items-end" style={{ lineHeight: 1.2 }}>
                      {displayPriceMeta.isDiscount && Number.isFinite(displayPriceMeta.originalPrice) && (
                        <span
                          style={{
                            color: '#94a3b8',
                            whiteSpace: 'nowrap',
                            fontSize: '0.72rem',
                            textDecoration: 'line-through',
                            fontWeight: 500
                          }}
                        >
                          {formatPrice(displayPriceMeta.originalPrice)} {t('sum')}
                        </span>
                      )}
                      <span
                        style={{
                          color: displayPriceMeta.isDiscount ? '#dc2626' : 'var(--primary-color)',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          fontSize: '0.83rem'
                        }}
                      >
                        {formatPrice(displayPrice)} {t('sum')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading && restaurants.length === 0) {
    if (isPublicStorefront) {
      return (
        <StorefrontLoader
          fullscreen
          logoUrl={currentRestaurant?.logo_url || publicRestaurantMeta?.logo_url || ''}
          label={language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
        />
      );
    }
    return <PageSkeleton fullscreen label="Загрузка магазинов" cards={8} />;
  }

  const isCategoryView = !isSingleListMode && selectedCategory !== null;
  const isShowcaseCatalogRoute = isShowcaseCatalog;
  const shouldShowHeaderBackButton = isCategoryView || isShowcaseCatalogRoute;
  const handleHeaderBackAction = () => {
    if (isCategoryView) {
      closeLevel2Category();
      return;
    }
    if (isShowcaseCatalogRoute) {
      navigate('/', {
        state: {
          restoreShowcaseScrollOffset: showcaseEntryScrollOffsetRef.current
        }
      });
    }
  };
  const shouldShowCatalogTabs = Boolean(
    !HIDE_CATALOG_SECTION_TABS
    && selectedRestaurant
    && !loading
    && !normalizedCatalogSearch
    && activeCatalogTabs.length > 0
  );
  const activeProduct = selectedProductDetails || selectedProductSummary;
  const activeProductName = getProductName(activeProduct);
  const activeProductSelectedVariant = getSelectedVariantForProduct(activeProduct);
  const activeProductSelectedVariantDetails = getSelectedVariantDetails(activeProduct, activeProductSelectedVariant);
  const activeProductCardImage = getProductCardImage(activeProduct, activeProductSelectedVariant);
  const activeProductGalleryImages = getProductGalleryImages(activeProduct, activeProductSelectedVariant);
  const activeProductGalleryIndex = activeProductGalleryImages.length > 0
    ? Math.max(0, Math.min(productHeroIndex, activeProductGalleryImages.length - 1))
    : 0;
  const activeProductHeroImage = activeProductGalleryImages[activeProductGalleryIndex] || activeProductCardImage;
  const activeProductDescription = getSelectedVariantDescription(activeProduct, activeProductSelectedVariant);
  const activeProductPriceMeta = getSelectedVariantPriceMeta(activeProduct, activeProductSelectedVariant);
  const activeProductDisplayPrice = activeProductPriceMeta.currentPrice;
  const activeProductCartItem = activeProduct?.id ? getCartItem(activeProduct.id, activeProductSelectedVariant) : null;
  const activeProductQty = activeProductCartItem?.quantity || 0;
  const activeProductQuantityStep = resolveQuantityStep(activeProductCartItem || activeProduct || {});
  const activeProductFavorite = activeProduct?.id ? isFavorite(activeProduct.id) : false;
  const activeProductSizeOptions = getProductSizeOptions(activeProduct);
  const activeProductIsAvailable = activeProduct
    ? getProductOverallAvailability(activeProduct)
    : false;
  const activeProductSelectedVariantAvailable = activeProduct
    ? getSelectedVariantAvailability(activeProduct, activeProductSelectedVariant)
    : false;
  const activeProductStockQuantity = Number(
    activeProductSelectedVariantDetails?.stock_quantity ?? activeProduct?.stock_quantity
  );
  const shouldShowActiveProductStockLine = (
    isInventoryTrackingEnabled
    && Number.isFinite(activeProductStockQuantity)
    && activeProductStockQuantity > 0
  );
  const activeProductUnitLabel = language === 'uz' && activeProduct?.unit_uz
    ? activeProduct.unit_uz
    : (activeProduct?.unit || (language === 'uz' ? 'dona' : 'шт'));
  const activeProductIsAtStockLimit = (
    Number.isFinite(activeProductStockQuantity)
    && Number(activeProductQty || 0) >= activeProductStockQuantity
  );

  return (
    <div className="client-surface">
      <Navbar
        ref={catalogHeaderRef}
        expand="lg"
        className="mb-0"
        style={{
          position: 'sticky',
          top: 'env(safe-area-inset-top, 0px)',
          left: 0,
          right: 0,
          zIndex: 1010,
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          backgroundColor: catalogHeaderBackground,
          borderBottom: shouldShowCatalogTabs
            ? 'none'
            : '1px solid var(--border-color)'
        }}
      >
        <div
          className="w-100 px-3 mx-auto"
          style={{
            maxWidth: isDesktopViewport ? '1440px' : '1280px',
            display: 'grid',
            gridTemplateColumns: isDesktopViewport ? 'auto 1fr auto' : '1fr auto 1fr',
            alignItems: 'center',
            gap: isDesktopViewport ? '24px' : '12px'
          }}
        >
          {/* Левая колонка: на мобиле — кнопка назад/плейсхолдер; на ПК — кнопка назад (в категории) + логотип */}
          <div className="d-flex align-items-center justify-content-start gap-2">
            {isDesktopViewport ? (
              <>
                {shouldShowHeaderBackButton && (
                  <button
                    type="button"
                    onClick={handleHeaderBackAction}
                    aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    title={language === 'uz' ? 'Orqaga' : 'Назад'}
                    className="client-topbar-back-btn"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 12,
                      border: '1px solid rgba(71, 85, 105, 0.18)',
                      background: 'rgba(255,255,255,0.82)',
                      color: '#334155',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      fontSize: '1rem',
                      fontWeight: 700,
                      flex: '0 0 auto'
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1 }}>←</span>
                  </button>
                )}
                {currentRestaurant?.logo_url ? (
                  (() => {
                    const logoFrame = getRestaurantLogoFrame(currentRestaurant?.logo_display_mode);
                    return (
                      <div style={logoFrame.box}>
                        <img
                          src={currentRestaurant.logo_url.startsWith('http') ? currentRestaurant.logo_url : `${API_URL.replace('/api', '')}${currentRestaurant.logo_url}`}
                          alt={currentRestaurant.name}
                          style={logoFrame.img}
                        />
                      </div>
                    );
                  })()
                ) : (
                  <span style={{ fontSize: '1.7rem' }}>🏪</span>
                )}
              </>
            ) : shouldShowHeaderBackButton ? (
              <button
                type="button"
                onClick={handleHeaderBackAction}
                aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                title={language === 'uz' ? 'Orqaga' : 'Назад'}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 12,
                  border: '1px solid rgba(71, 85, 105, 0.18)',
                  background: 'rgba(255,255,255,0.82)',
                  color: '#334155',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  fontSize: '1rem',
                  fontWeight: 700,
                  transition: 'all 0.22s ease'
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1 }}>←</span>
              </button>
            ) : (
              <div style={{ width: '40px', height: '40px' }} aria-hidden="true" />
            )}
          </div>

          {/* Центральная колонка: на мобиле — логотип; на ПК — инлайн-поиск */}
          {isDesktopViewport ? (
            <div className="w-100" style={{ maxWidth: 640, justifySelf: 'center' }}>
              {renderCatalogSearch({ compact: true })}
            </div>
          ) : (
            <Navbar.Brand className="d-flex align-items-center justify-content-center mx-auto mb-0">
              {currentRestaurant?.logo_url ? (
                (() => {
                  const logoFrame = getRestaurantLogoFrame(currentRestaurant?.logo_display_mode);
                  return (
                    <div style={logoFrame.box}>
                      <img
                        src={currentRestaurant.logo_url.startsWith('http') ? currentRestaurant.logo_url : `${API_URL.replace('/api', '')}${currentRestaurant.logo_url}`}
                        alt={currentRestaurant.name}
                        style={logoFrame.img}
                      />
                    </div>
                  );
                })()
              ) : (
                <span style={{ fontSize: '1.7rem' }}>🏪</span>
              )}
            </Navbar.Brand>
          )}

          <div className="d-flex align-items-center justify-content-end gap-2">
            {/* Флаги RU/UZ — только на ПК; на мобиле скрыты чтобы шапка выглядела как WebApp */}
            {isPublicStorefront && isDesktopViewport && (
              <div className="d-flex align-items-center gap-1" role="group" aria-label="Язык / Til">
                {['ru', 'uz'].map((lang) => {
                  const active = (language === 'uz' ? 'uz' : 'ru') === lang;
                  return (
                    <button
                      key={`lang-${lang}`}
                      type="button"
                      onClick={() => {
                        if (typeof setLanguage === 'function') setLanguage(lang);
                        if (typeof window !== 'undefined') {
                          try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lang); } catch (_) { /* no-op */ }
                        }
                      }}
                      aria-label={lang === 'ru' ? 'Русский' : 'Oʻzbek'}
                      title={lang === 'ru' ? 'Русский' : 'Oʻzbek'}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: active ? '2px solid #2563eb' : '1px solid rgba(71,85,105,0.22)',
                        background: '#fff',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        opacity: active ? 1 : 0.65,
                        transition: 'all 0.18s ease'
                      }}
                    >
                      <img
                        src={`/flags/${lang}.svg`}
                        alt={lang.toUpperCase()}
                        width="22"
                        height="22"
                        style={{ display: 'block', objectFit: 'cover', borderRadius: '50%' }}
                      />
                    </button>
                  );
                })}
              </div>
            )}
            {/* Иконка корзины в шапке витрины — только на ПК; на мобиле шапка как WebApp без неё (корзина видна через баннер «Итого сумма») */}
            {isPublicStorefront && isDesktopViewport && (
              <button
                type="button"
                onClick={() => { setShowProductDetailsModal(false); setStorefrontOrderError(''); setStorefrontOrderSuccess(''); setStorefrontStep(1); setShowStorefrontCartModal(true); }}
                aria-label={language === 'uz' ? 'Savat' : 'Корзина'}
                title={language === 'uz' ? 'Savat' : 'Корзина'}
                style={{
                  position: 'relative',
                  width: '40px',
                  height: '40px',
                  borderRadius: 12,
                  border: cart.length > 0 ? '1px solid rgba(71, 85, 105, 0.22)' : '1px solid transparent',
                  background: cart.length > 0 ? 'rgba(255,255,255,0.7)' : 'transparent',
                  color: '#4b5563',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.22s ease'
                }}
              >
                <CartLucideIcon size={17} color="#4b5563" />
                {cart.length > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 9,
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1
                    }}
                  >
                    {cart.length > 99 ? '99+' : cart.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenAccountModal}
              aria-label={language === 'uz' ? 'Akkaunt' : 'Аккаунт'}
              title={language === 'uz' ? 'Akkaunt' : 'Аккаунт'}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 12,
                border: showAccountModal
                  ? '1px solid rgba(71, 85, 105, 0.22)'
                  : '1px solid transparent',
                background: showAccountModal
                  ? 'rgba(255,255,255,0.7)'
                  : 'transparent',
                color: '#4b5563',
                fontSize: '1rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.22s ease'
              }}
            >
              <UserLucideIcon size={17} color="#4b5563" />
            </button>

            {/* На ПК поиск инлайн в центре — тогл-иконка не нужна */}
            {!isDesktopViewport && (
              <button
                type="button"
                onClick={toggleHeaderSearch}
                aria-label={language === 'uz' ? 'Qidiruv' : 'Поиск'}
                title={language === 'uz' ? 'Qidiruv' : 'Поиск'}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 12,
                  border: isHeaderSearchOpen || normalizedCatalogSearch
                    ? '1px solid rgba(71, 85, 105, 0.22)'
                    : '1px solid transparent',
                  background: isHeaderSearchOpen || normalizedCatalogSearch
                    ? 'rgba(255,255,255,0.7)'
                    : 'transparent',
                  color: '#4b5563',
                  fontSize: '1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.22s ease'
                }}
              >
                <SearchLucideIcon size={17} color="#4b5563" />
              </button>
            )}

            {shouldShowDesktopLogout && (
              <button
                type="button"
                onClick={handleDesktopLogout}
                className="btn btn-sm btn-outline-secondary"
                style={{ borderRadius: 10, fontWeight: 600, minHeight: 34 }}
              >
                {t('logout')}
              </button>
            )}
          </div>
        </div>

        {!isDesktopViewport && (
          <div
            className="px-3 mx-auto"
            style={{
              maxWidth: '1280px',
              width: '100%',
              overflow: 'hidden',
              maxHeight: isHeaderSearchOpen ? 88 : 0,
              opacity: isHeaderSearchOpen ? 1 : 0,
              transform: `translateY(${isHeaderSearchOpen ? 0 : -8}px)`,
              transition: 'max-height 0.28s ease, opacity 0.22s ease, transform 0.28s ease',
              pointerEvents: isHeaderSearchOpen ? 'auto' : 'none'
            }}
          >
            <div style={{ padding: '0 0 10px' }}>
              {renderCatalogSearch({ compact: true })}
            </div>
          </div>
        )}
        <div
          style={{
            display: shouldShowCatalogTabs ? 'block' : 'none',
            backgroundColor: catalogHeaderBackground,
            borderBottom: 'none',
            boxShadow: 'none'
          }}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: '1280px',
              position: 'relative'
            }}
          >
            <div
              ref={level3TabsScrollerRef}
              className="catalog-level3-tabs-scroll"
              onWheel={handleTabsWheelScroll}
              onPointerDown={handleTabPointerDown}
              onPointerMove={handleTabPointerMove}
              onPointerUp={handleTabPointerUp}
              onPointerCancel={handleTabPointerUp}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${catalogTabGap}px`,
                overflowY: 'hidden',
                overflowX: 'auto',
                overscrollBehaviorX: 'contain',
                overscrollBehaviorY: 'none',
                minHeight: 42,
                paddingTop: 4,
                paddingBottom: 7,
                paddingLeft: '16px',
                paddingRight: '16px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
                position: 'relative',
                zIndex: 2,
                cursor: 'grab'
              }}
            >
              {activeCatalogTabs.map((section) => (
                <button
                  ref={(el) => {
                    const k = catalogSectionTabKey(section.id);
                    if (el) level3TabButtonRefs.current[k] = el;
                    else delete level3TabButtonRefs.current[k];
                  }}
                  key={section.id}
                  type="button"
                  className="btn mb-0 btn-sm catalog-level3-tab-btn"
                  style={{
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    maxWidth: 'min(62vw, 220px)',
                    border: 'none',
                    boxShadow: 'none',
                    borderRadius: 999,
                    minHeight: 34,
                    padding: 0,
                    fontSize: '0.92rem',
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: catalogSectionTabKey(activeSubcategoryTab) === catalogSectionTabKey(section.id) ? 600 : 500,
                    color: catalogSectionTabKey(activeSubcategoryTab) === catalogSectionTabKey(section.id) ? '#0f172a' : '#64748b',
                    background: 'transparent',
                    transition: 'color 0.2s ease, font-weight 0.2s ease',
                    WebkitTapHighlightColor: 'transparent'
                  }}
                  onClick={() => handleCatalogTabClick(section.id)}
                  aria-current={catalogSectionTabKey(activeSubcategoryTab) === catalogSectionTabKey(section.id) ? 'true' : undefined}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      maxWidth: '100%',
                      padding: '7px 14px',
                      borderRadius: 999,
                      background: catalogSectionTabKey(activeSubcategoryTab) === catalogSectionTabKey(section.id) ? 'rgba(148, 163, 184, 0.34)' : 'transparent',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'background 0.2s ease'
                    }}
                  >
                    {section.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            background: 'transparent',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              width: `${Math.round(catalogScrollProgress * 100)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #38bdf8 0%, #2563eb 55%, #22d3ee 100%)',
              boxShadow: '0 0 8px rgba(37, 99, 235, 0.35)',
              transition: 'width 0.12s linear'
            }}
          />
        </div>
      </Navbar>

      {renderCatalogSeasonOverlay()}

      <Container>
        {/* No restaurants */}
        {restaurants.length === 0 && (
          <div className="text-center py-5">
            <div style={{ fontSize: '4rem' }}>🏪</div>
            <h4 className="mt-3">Магазины не найдены</h4>
            <p className="text-muted">
              Пока нет активных магазинов. Пожалуйста, попробуйте позже.
            </p>
          </div>
        )}

        {selectedRestaurant && (
          <>

            {/* Loading */}
            {loading && (
              isPublicStorefront ? (
                <StorefrontLoader
                  logoUrl={currentRestaurant?.logo_url || publicRestaurantMeta?.logo_url || ''}
                  label={language === 'uz' ? 'Mahsulotlar yuklanmoqda...' : 'Загрузка товаров...'}
                />
              ) : (
                <div className="py-3">
                  <ListSkeleton count={6} label="Загрузка товаров" />
                </div>
              )
            )}

            {!loading && renderCartTotalBanner()}
            {!loading && normalizedCatalogSearch && renderCatalogSearchResults()}

            {!loading && !normalizedCatalogSearch && !isSingleListMode && selectedCategory === null && (
              <div className={hasCartTotalBanner ? 'pt-2 pb-3' : 'py-3'}>
                {renderAdBannerCarousel()}
                {level1Categories.map((level1Category) => {
                  const level2Categories = level2ByLevel1.get(level1Category.id) || [];
                  if (level2Categories.length === 0) return null;

                  // Заголовок группы показываем только если групп несколько —
                  // иначе он дублирует смысл (одна группа = это сам магазин).
                  const renderedLevel1Groups = level1Categories.filter(
                    (c) => (level2ByLevel1.get(c.id) || []).length > 0
                  ).length;
                  return (
                    <section key={level1Category.id} className="mb-4">
                      {renderedLevel1Groups > 1 && (
                        <h5 className="mb-3 fw-bold" style={{ fontSize: '1.1rem' }}>{getCategoryName(level1Category)}</h5>
                      )}
                      <Row className="g-3">
                        {level2Categories.map((level2Category) => {
                          const categoryImage = resolveImageUrl(level2Category.image_url);
                          const hasCategoryImage = Boolean(categoryImage);
                          const categoryName = getCategoryName(level2Category);
                          const titleBackground = hideCategoryTitleBackgroundForMenu
                            ? 'transparent'
                            : (categoryTitleBackgroundTransparentForMenu ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.74)');
                          const imageZoneHeight = '110px';
                          return (
                            <Col key={level2Category.id} xs={6} md={4} lg={3} xxl={2}>
                              <button
                                type="button"
                                onClick={() => openLevel2Category(level2Category.id)}
                                className="w-100 border-0 p-0 text-start client-category-card"
                                style={{
                                  borderRadius: '14px',
                                  overflow: categoryTitleOutsideImageForMenu ? 'visible' : 'hidden',
                                  background: categoryTitleOutsideImageForMenu ? 'transparent' : '#ffffff',
                                  position: 'relative',
                                  minHeight: '110px'
                                }}
                              >
                                <div
                                  style={{
                                    position: 'relative',
                                    height: imageZoneHeight,
                                    borderRadius: '14px',
                                    overflow: 'hidden',
                                    backgroundImage: hasCategoryImage
                                      ? `url(${categoryImage})`
                                      : (
                                        storeLogoFallbackUrl
                                          ? `url(${storeLogoFallbackUrl})`
                                          : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)'
                                      ),
                                    backgroundSize: hasCategoryImage ? 'cover' : (storeLogoFallbackUrl ? '58%' : 'cover'),
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundColor: hasCategoryImage ? '#ffffff' : '#eef2f7'
                                  }}
                                >
                                  {!categoryTitleOutsideImageForMenu && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: 4,
                                        left: 0,
                                        right: 0,
                                        zIndex: 1,
                                        padding: '6px 10px 0'
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          maxWidth: '100%',
                                          padding: hideCategoryTitleBackgroundForMenu ? '0' : '4px 8px',
                                          borderRadius: hideCategoryTitleBackgroundForMenu ? 0 : 8,
                                          background: titleBackground,
                                          backdropFilter: hideCategoryTitleBackgroundForMenu ? 'none' : 'blur(2px)',
                                          WebkitBackdropFilter: hideCategoryTitleBackgroundForMenu ? 'none' : 'blur(2px)',
                                          color: '#111827',
                                          fontWeight: 700,
                                          fontSize: '0.78rem',
                                          lineHeight: 1.2
                                        }}
                                      >
                                        {categoryName}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {categoryTitleOutsideImageForMenu && (
                                  <div
                                    style={{
                                      marginTop: '0.42rem',
                                      padding: '0 0.16rem'
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: '-webkit-box',
                                        maxWidth: '100%',
                                        color: '#111827',
                                        fontWeight: 500,
                                        fontSize: '0.76rem',
                                        lineHeight: 1.15,
                                        overflow: 'hidden',
                                        textOverflow: 'clip',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical'
                                      }}
                                    >
                                      {categoryName}
                                    </span>
                                  </div>
                                )}
                              </button>
                            </Col>
                          );
                        })}
                      </Row>
                    </section>
                  );
                })}
              </div>
            )}

            {!loading && !normalizedCatalogSearch && (
              isNestedCategoriesMode && selectedCategory !== null && selectedCategoryNode
            ) && (
                <div className={hasCartTotalBanner ? 'pt-2 pb-3' : 'py-3'}>
                  {renderAdBannerCarousel()}
                  <div className="mb-3">
                    <h6 className="mb-0 fw-bold text-dark">{getCategoryName(selectedCategoryNode)}</h6>
                  </div>

                  {nestedChildCategories.length > 0 && (
                    <section className="mb-4">
                      <Row className="g-3">
                        {nestedChildCategories.map((nestedCategory) => {
                          const nestedCategoryImage = resolveImageUrl(nestedCategory.image_url);
                          const hasNestedCategoryImage = Boolean(nestedCategoryImage);
                          const nestedCategoryName = getCategoryName(nestedCategory);
                          const titleBackground = hideCategoryTitleBackgroundForMenu
                            ? 'transparent'
                            : (categoryTitleBackgroundTransparentForMenu ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.74)');
                          return (
                            <Col key={nestedCategory.id} xs={6} md={4} lg={3} xxl={2}>
                              <button
                                type="button"
                                onClick={() => openLevel2Category(nestedCategory.id)}
                                className="w-100 border-0 p-0 text-start"
                                style={{
                                  borderRadius: '14px',
                                  overflow: categoryTitleOutsideImageForMenu ? 'visible' : 'hidden',
                                  background: categoryTitleOutsideImageForMenu ? 'transparent' : '#ffffff',
                                  position: 'relative',
                                  minHeight: '110px'
                                }}
                              >
                                <div
                                  style={{
                                    position: 'relative',
                                    height: '110px',
                                    borderRadius: '14px',
                                    overflow: 'hidden',
                                    backgroundImage: hasNestedCategoryImage
                                      ? `url(${nestedCategoryImage})`
                                      : (
                                        storeLogoFallbackUrl
                                          ? `url(${storeLogoFallbackUrl})`
                                          : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)'
                                      ),
                                    backgroundSize: hasNestedCategoryImage ? 'cover' : (storeLogoFallbackUrl ? '58%' : 'cover'),
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundColor: hasNestedCategoryImage ? '#ffffff' : '#eef2f7'
                                  }}
                                >
                                  {!categoryTitleOutsideImageForMenu && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: 4,
                                        left: 0,
                                        right: 0,
                                        zIndex: 1,
                                        padding: '6px 10px 0'
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          maxWidth: '100%',
                                          padding: hideCategoryTitleBackgroundForMenu ? '0' : '4px 8px',
                                          borderRadius: hideCategoryTitleBackgroundForMenu ? 0 : 8,
                                          background: titleBackground,
                                          backdropFilter: hideCategoryTitleBackgroundForMenu ? 'none' : 'blur(2px)',
                                          WebkitBackdropFilter: hideCategoryTitleBackgroundForMenu ? 'none' : 'blur(2px)',
                                          color: '#111827',
                                          fontWeight: 700,
                                          fontSize: '0.78rem',
                                          lineHeight: 1.2
                                        }}
                                      >
                                        {nestedCategoryName}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {categoryTitleOutsideImageForMenu && (
                                  <div
                                    style={{
                                      marginTop: '0.42rem',
                                      padding: '0 0.16rem'
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: '-webkit-box',
                                        maxWidth: '100%',
                                        color: '#111827',
                                        fontWeight: 500,
                                        fontSize: '0.76rem',
                                        lineHeight: 1.15,
                                        overflow: 'hidden',
                                        textOverflow: 'clip',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical'
                                      }}
                                    >
                                      {nestedCategoryName}
                                    </span>
                                  </div>
                                )}
                              </button>
                            </Col>
                          );
                        })}
                      </Row>
                    </section>
                  )}

                  {nestedDirectProducts.length > 0 && (
                    <section className="mb-1">
                      <Row className="g-3">
                        {nestedDirectProducts.map((product) => (
                          <Col key={product.id} xs={6} md={4} lg={3} xxl={2}>
                            {renderProductCard(product)}
                          </Col>
                        ))}
                      </Row>
                    </section>
                  )}
                </div>
              )}

            {!loading && !normalizedCatalogSearch && (
              !isNestedCategoriesMode && (
              (isSingleListMode || (selectedCategory !== null && selectedLevel2Category))
              )
            ) && (
                <div className={hasCartTotalBanner ? 'pt-2 pb-3' : 'py-3'}>
                  {renderAdBannerCarousel()}
                  <>
                    {/* Заголовок выбранной категории уже выводится секцией ниже
                        (section.title), отдельный дублирующий заголовок убран. */}
                    {!isSingleListMode && level3Categories.length > 0 && (
                      <section className="mb-4">
                        <Row className="g-2 g-lg-3">
                          {level3Categories.map((category) => {
                            const isActive = catalogSectionTabKey(activeSubcategoryTab) === catalogSectionTabKey(category.id);
                            return (
                              <Col key={`level3-folder-${category.id}`} xs={6} md={4} lg={3} xxl={2}>
                                <button
                                  type="button"
                                  onClick={() => handleCatalogTabClick(category.id)}
                                  className="w-100 border-0 text-start"
                                  style={{
                                    borderRadius: 12,
                                    minHeight: 64,
                                    padding: '10px 12px',
                                    background: isActive ? 'rgba(59, 130, 246, 0.12)' : '#ffffff',
                                    border: isActive ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid rgba(148, 163, 184, 0.24)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{ fontSize: '1.05rem', lineHeight: 1 }}
                                  >
                                    📁
                                  </span>
                                  <span
                                    style={{
                                      color: '#0f172a',
                                      fontWeight: isActive ? 700 : 600,
                                      fontSize: '0.84rem',
                                      lineHeight: 1.2
                                    }}
                                  >
                                    {getCategoryName(category)}
                                  </span>
                                </button>
                              </Col>
                            );
                          })}
                        </Row>
                      </section>
                    )}
                    {visibleProductSections.map((section) => (
                      <section
                        key={section.id}
                        ref={(el) => {
                          const k = catalogSectionTabKey(section.id);
                          if (el) productGroupRefs.current[k] = el;
                          else delete productGroupRefs.current[k];
                        }}
                        className="mb-4"
                      >
                        <h6 className="mb-3 text-muted fw-bold">{section.title}</h6>
                        <Row className="g-3">
                          {section.products.map((product) => (
                            <Col key={product.id} xs={6} md={4} lg={3} xxl={2}>
                              {renderProductCard(product)}
                            </Col>
                          ))}
                        </Row>
                      </section>
                    ))}
                  </>
                </div>
              )}

            {!loading && !normalizedCatalogSearch && !isSingleListMode && selectedCategory === null && level1Categories.length === 0 && (
              <div className="text-center py-5">
                <div style={{ fontSize: '4rem', opacity: 0.5 }}>🏪</div>
                <p className="text-muted mt-3">Товары пока не добавлены</p>
                {isOperator() && (
                  <Button variant="primary" onClick={() => navigate('/admin')}>
                    Добавить товары
                  </Button>
                )}
              </div>
            )}

            {!loading && !normalizedCatalogSearch && !isNestedCategoriesMode && (isSingleListMode || selectedCategory !== null) && visibleProductSections.length === 0 && (
              <div className="text-center py-5">
                <div style={{ fontSize: '4rem', opacity: 0.5 }}>🏪</div>
                <p className="text-muted mt-3">
                  {language === 'uz' ? 'Tanlangan bo‘limda mahsulotlar topilmadi' : 'В выбранном разделе товары не найдены'}
                </p>
              </div>
            )}
            {!loading && !normalizedCatalogSearch && isNestedCategoriesMode && selectedCategory !== null && nestedChildCategories.length === 0 && nestedDirectProducts.length === 0 && (
              <div className="text-center py-5">
                <div style={{ fontSize: '4rem', opacity: 0.5 }}>🏪</div>
                <p className="text-muted mt-3">
                  {language === 'uz' ? 'Tanlangan bo‘limda mahsulotlar topilmadi' : 'В выбранном разделе товары не найдены'}
                </p>
              </div>
            )}
          </>
        )}
      </Container>

      <Modal
        show={showLanguageSetupModal}
        backdrop="static"
        keyboard={false}
        centered
      >
        <Modal.Header className="border-0 pb-1">
          <Modal.Title className="w-100 text-center">
            {pendingLanguage === 'uz' ? 'Tilni tanlang' : 'Выберите язык'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-1">
          <div className="text-muted text-center mb-3" style={{ fontSize: '0.92rem' }}>
            {pendingLanguage === 'uz' ? 'Interfeys tilini tanlang' : 'Выберите язык интерфейса'}
          </div>
          <div className="d-flex gap-2 mb-3">
            <Button
              type="button"
              variant={pendingLanguage === 'uz' ? 'primary' : 'light'}
              className="flex-fill"
              style={{
                minHeight: 48,
                borderRadius: 12,
                border: pendingLanguage === 'uz' ? 'none' : '1px solid #ced4da',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
              onClick={() => setPendingLanguage('uz')}
            >
              <img
                src="/flags/uz.svg"
                alt="UZ"
                style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2 }}
              />
              <span>O'zbekcha</span>
            </Button>
            <Button
              type="button"
              variant={pendingLanguage === 'ru' ? 'primary' : 'light'}
              className="flex-fill"
              style={{
                minHeight: 48,
                borderRadius: 12,
                border: pendingLanguage === 'ru' ? 'none' : '1px solid #ced4da',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
              onClick={() => setPendingLanguage('ru')}
            >
              <img
                src="/flags/ru.svg"
                alt="RU"
                style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2 }}
              />
              <span>Русский</span>
            </Button>
          </div>
          <Button
            type="button"
            className="w-100"
            style={{ minHeight: 46, borderRadius: 12 }}
            onClick={handleSaveLanguagePreference}
          >
            {pendingLanguage === 'uz' ? 'Saqlash' : 'Сохранить'}
          </Button>
        </Modal.Body>
      </Modal>

      <ClientAccountModal show={showAccountModal} onHide={() => setShowAccountModal(false)} />

      <Modal
        show={showEntryPopupModal && !!entryPopupBanner}
        onHide={closeEntryPopup}
        centered
        backdrop
        keyboard
      >
        <Modal.Body className="p-0 position-relative" style={{ borderRadius: 20, overflow: 'hidden', background: '#ffffff' }}>
          <button
            type="button"
            onClick={closeEntryPopup}
            aria-label={language === 'uz' ? 'Yopish' : 'Закрыть'}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              border: 'none',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.92)',
              color: '#111827',
              fontSize: '22px',
              lineHeight: 1,
              zIndex: 3,
              boxShadow: '0 4px 12px rgba(15,23,42,0.22)'
            }}
          >
            ×
          </button>

          <div className="p-3 p-sm-4">
            <div
              className="rounded-4 overflow-hidden"
              style={{ border: '1px solid rgba(71, 85, 105, 0.15)', background: '#f8fafc' }}
            >
              <img
                src={resolveImageUrl(entryPopupBanner?.image_url)}
                alt={entryPopupBanner?.title || 'Ad'}
                style={{
                  width: '100%',
                  aspectRatio: '4 / 5',
                  objectFit: 'cover',
                  display: 'block',
                  background: '#ffffff'
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <div className="pt-3">
              <div className="fw-bold" style={{ fontSize: '1.55rem', lineHeight: 1.15, color: '#111827' }}>
                {entryPopupBanner?.title || (language === 'uz' ? 'Maxsus taklif' : 'Специальное предложение')}
              </div>
            </div>

            <Button
              className="w-100 mt-3 rounded-pill"
              style={{
                minHeight: 52,
                fontWeight: 700,
                fontSize: '1.05rem',
                background: 'var(--primary-color)',
                borderColor: 'var(--primary-color)',
                color: '#ffffff'
              }}
              onClick={handleEntryPopupAction}
            >
              {entryPopupBanner?.button_text || (language === 'uz' ? "Ochish" : 'Открыть')}
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        show={showPendingProductReviewModal && Boolean(activePendingProductReviewItem)}
        onHide={closePendingProductReviewModal}
        centered
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>
            {language === 'uz' ? 'Buyurtma bahosi' : 'Оценка заказа'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {activePendingProductReviewItem && (
            <>
              <div className="d-flex align-items-center gap-3 mb-3">
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {getProductCardImage(activePendingProductReviewItem) ? (
                    <img
                      src={getProductCardImage(activePendingProductReviewItem)}
                      alt={getProductName(activePendingProductReviewItem) || 'Product'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    renderStoreLogoFallback({
                      wrapperStyle: { width: '100%', height: '100%' },
                      imageStyle: { width: '70%', maxHeight: '70%' },
                      fallbackSize: '1.6rem'
                    })
                  )}
                </div>
                <div className="min-w-0">
                  <div className="fw-semibold text-truncate">
                    {getProductName(activePendingProductReviewItem) || (language === 'uz' ? 'Mahsulot' : 'Товар')}
                  </div>
                  <div className="small text-muted">
                    {language === 'uz'
                      ? 'Muvaffaqiyatli buyurtmadan keyin baho qoldiring'
                      : 'Оставьте оценку после успешно выполненного заказа'}
                  </div>
                </div>
              </div>

              {pendingProductReviewError && (
                <div className="alert alert-warning py-2 small">{pendingProductReviewError}</div>
              )}

              <div className="d-flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={`pending-review-star-${star}`}
                    type="button"
                    onClick={() => setPendingProductReviewRating(star)}
                    className="btn btn-sm p-0 border-0"
                    style={{
                      width: 38,
                      height: 38,
                      fontSize: '1.72rem',
                      lineHeight: 1,
                      color: star <= Math.round(normalizeRatingValue(pendingProductReviewRating, 0)) ? '#f59e0b' : '#cbd5e1',
                      background: 'transparent'
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                value={pendingProductReviewComment}
                onChange={(e) => setPendingProductReviewComment(e.target.value)}
                rows={3}
                maxLength={1500}
                className="form-control"
                placeholder={language === 'uz' ? 'Komment yozing...' : 'Напишите комментарий...'}
              />

              <div className="d-flex justify-content-between align-items-center mt-2">
                <small className="text-muted">
                  {String(pendingProductReviewComment || '').length}/1500
                </small>
                <small className="text-muted">
                  {language === 'uz'
                    ? `Qolgan: ${pendingProductReviewItems.length}`
                    : `Осталось: ${pendingProductReviewItems.length}`}
                </small>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="light"
            onClick={deferPendingProductReviewModal}
            disabled={pendingProductReviewSubmitting}
          >
            {language === 'uz' ? 'Keyinroq' : 'Позже'}
          </Button>
          <Button
            onClick={submitPendingProductReview}
            disabled={!activePendingProductReviewItem || pendingProductReviewSubmitting}
          >
            {pendingProductReviewSubmitting
              ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
              : (language === 'uz' ? 'Yuborish' : 'Отправить')}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showProductDetailsModal}
        onHide={closeProductDetailsModal}
        className="product-details-modal-fullscreen"
        dialogClassName="product-details-modal-dialog"
        backdropClassName="product-details-backdrop"
        fullscreen
        backdrop
        keyboard
      >
        <Modal.Body className="product-details-modal-body p-0">
          {productDetailsLoading && !activeProduct ? (
            <div className="p-3">
              <ListSkeleton rows={4} />
            </div>
          ) : activeProduct ? (
            <div className="product-details-shell" style={{ position: 'relative' }}>
              <style>{`
                @keyframes catalogShareSheetUp {
                  from { transform: translateY(20px); opacity: 0; }
                  to { transform: translateY(0); opacity: 1; }
                }
              `}</style>
              <div className="product-details-scroll">
                <section className="product-details-hero">
                  {activeProductHeroImage ? (
                    <button
                      type="button"
                      className="product-details-hero-image-btn"
                      onClick={() => {
                        if (productHeroSwipeTriggeredRef.current) {
                          productHeroSwipeTriggeredRef.current = false;
                          return;
                        }
                        openProductGallery(activeProduct, activeProductGalleryIndex, activeProductSelectedVariant);
                      }}
                      onTouchStart={handleProductHeroTouchStart}
                      onTouchMove={(event) => handleProductHeroTouchMove(event, activeProductGalleryImages.length)}
                      onTouchEnd={(event) => handleProductHeroTouchEnd(event, activeProductGalleryImages.length)}
                      aria-label={language === 'uz' ? 'Rasmni ochish' : 'Открыть фото'}
                    >
                      <img
                        src={activeProductHeroImage}
                        alt={activeProductName || 'Product'}
                        className="product-details-hero-image"
                      />
                    </button>
                  ) : (
                    renderStoreLogoFallback({
                      className: 'product-details-hero-empty',
                      imageStyle: { width: '48%', maxHeight: '48%' }
                    })
                  )}

                  <div className="product-details-top-actions">
                    <button
                      type="button"
                      className="product-details-icon-btn"
                      onClick={closeProductDetailsModal}
                      aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    >
                      <span className="product-details-icon-glyph">←</span>
                    </button>
                    <div className="d-flex align-items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(activeProduct)}
                        className="product-details-icon-btn"
                        aria-label={language === 'uz' ? "Saralanganlarga qo'shish" : 'Добавить в избранное'}
                      >
                        <HeartIcon size={18} filled={activeProductFavorite} color={activeProductFavorite ? '#e11d48' : '#334155'} />
                      </button>
                      <button
                        type="button"
                        className="product-details-icon-btn"
                        onClick={() => handleShareProduct(activeProduct)}
                        aria-label={language === 'uz' ? 'Ulashish' : 'Поделиться'}
                        title={language === 'uz' ? 'Ulashish' : 'Поделиться'}
                      >
                        <ShareLucideIcon size={18} color="#334155" />
                      </button>
                      <button
                        type="button"
                        className="product-details-icon-btn"
                        onClick={closeProductDetailsModal}
                        aria-label={language === 'uz' ? 'Yopish' : 'Закрыть'}
                      >
                        <span className="product-details-icon-glyph">×</span>
                      </button>
                    </div>
                  </div>

                  {activeProductGalleryImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="product-details-hero-nav product-details-hero-nav-prev"
                        onClick={(e) => { e.stopPropagation(); showPrevProductHeroImage(activeProductGalleryImages.length); }}
                        aria-label={language === 'uz' ? 'Oldingi rasm' : 'Предыдущее фото'}
                      >‹</button>
                      <button
                        type="button"
                        className="product-details-hero-nav product-details-hero-nav-next"
                        onClick={(e) => { e.stopPropagation(); showNextProductHeroImage(activeProductGalleryImages.length); }}
                        aria-label={language === 'uz' ? 'Keyingi rasm' : 'Следующее фото'}
                      >›</button>
                      <div className="product-details-hero-counter">
                        {activeProductGalleryIndex + 1} / {activeProductGalleryImages.length}
                      </div>
                    </>
                  )}
                </section>

                <section className="product-details-sheet">
                  {productDetailsError && (
                    <div className="alert alert-warning py-2 small mb-3">{productDetailsError}</div>
                  )}

                  <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
                    <div className="min-w-0">
                      <h4
                        className="mb-1"
                        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
                      >
                        {activeProductName}
                      </h4>
                      {!shouldShowActiveProductStockLine && (
                        <div className="small text-muted">{activeProductUnitLabel}</div>
                      )}
                    </div>
                    {(!shouldShowActiveProductStockLine || !activeProductIsAvailable) && (
                      <span
                        className="badge"
                        style={{
                          background: activeProductIsAvailable ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.18)',
                          color: activeProductIsAvailable ? '#166534' : '#475569',
                          border: '1px solid rgba(15,23,42,0.08)'
                        }}
                      >
                        {activeProductIsAvailable
                          ? (language === 'uz' ? 'Mavjud' : 'В наличии')
                          : (language === 'uz' ? 'Mavjud emas' : 'Нет в наличии')}
                      </span>
                    )}
                  </div>
                  {shouldShowActiveProductStockLine && (
                    <div className="small mb-2" style={{ color: '#166534', fontWeight: 600 }}>
                      {language === 'uz'
                        ? `Mavjud: ${formatQuantity(activeProductStockQuantity)} ${activeProductUnitLabel}`
                        : `В наличии: ${formatQuantity(activeProductStockQuantity)} ${activeProductUnitLabel}`}
                    </div>
                  )}

                  <div className="mb-3 d-flex flex-column" style={{ lineHeight: 1.05 }}>
                    {activeProductPriceMeta.isDiscount && Number.isFinite(activeProductPriceMeta.originalPrice) && (
                      <span
                        style={{
                          color: '#94a3b8',
                          fontSize: '1rem',
                          textDecoration: 'line-through',
                          fontWeight: 500
                        }}
                      >
                        {formatPrice(activeProductPriceMeta.originalPrice)} {t('sum')}
                      </span>
                    )}
                    <span
                      className="fw-bold"
                      style={{
                        color: activeProductPriceMeta.isDiscount ? '#dc2626' : 'var(--primary-color)',
                        fontSize: '2rem'
                      }}
                    >
                      {formatPrice(activeProductDisplayPrice)} {t('sum')}
                    </span>
                  </div>

                  {/* Inline-кнопки управления (видны только на ПК) */}
                  <div className="product-details-inline-actions">
                    {activeProductSelectedVariantAvailable ? (
                      activeProductQty > 0 ? (
                        <>
                          <div className="product-details-bottom-stepper">
                            <button
                              type="button"
                              className="btn btn-sm p-0 border-0 bg-transparent"
                              onClick={() => updateQuantity(activeProduct.id, activeProductQty - activeProductQuantityStep, activeProductSelectedVariant)}
                              aria-label={language === 'uz' ? 'Kamaytirish' : 'Уменьшить'}
                            >−</button>
                            <span>{formatQuantity(activeProductQty)}</span>
                            <button
                              type="button"
                              className="btn btn-sm p-0 border-0 bg-transparent"
                              style={{ opacity: activeProductIsAtStockLimit ? 0.45 : 1 }}
                              disabled={activeProductIsAtStockLimit}
                              onClick={() => updateProductQuantityWithinStock(
                                activeProduct,
                                activeProductQty,
                                activeProductQuantityStep,
                                activeProductSelectedVariant
                              )}
                              aria-label={language === 'uz' ? "Ko'paytirish" : 'Увеличить'}
                            >+</button>
                          </div>
                          <Button
                            type="button"
                            className="product-details-bottom-cta"
                            onClick={() => { if (isGuestStorefront) { setShowProductDetailsModal(false); setStorefrontOrderError(''); setStorefrontOrderSuccess(''); setStorefrontStep(1); setShowStorefrontCartModal(true); return; } navigate('/cart'); }}
                          >
                            {language === 'uz' ? "Savatga o'tish" : 'В корзину'}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          className="product-details-bottom-cta"
                          onClick={() => handleAddToCart(activeProduct)}
                        >
                          {language === 'uz' ? "Savatga qo'shish" : 'В корзину'}
                        </Button>
                      )
                    ) : (
                      <Button type="button" className="product-details-bottom-cta" disabled>
                        {language === 'uz' ? 'Mavjud emas' : 'Нет в наличии'}
                      </Button>
                    )}
                  </div>

                  {(productWeeklyBuyers > 0 || productWeeklyOrders > 0 || productWeeklySoldCount > 0) && (
                    <div className="product-details-weekly-metric mb-3">
                      <div>
                        {language === 'uz'
                          ? `Bu haftada sotildi: ${formatQuantity(productWeeklySoldCount)}`
                          : `Продано за эту неделю: ${formatQuantity(productWeeklySoldCount)}`}
                      </div>
                    </div>
                  )}

                  {activeProductSizeOptions.length > 0 && (
                    <div className="product-details-block mb-3">
                      <div className="small text-muted mb-2">{language === 'uz' ? 'Variantlar' : 'Варианты'}</div>
                      <div
                        className="product-details-variants-scroll d-flex align-items-center gap-2"
                        style={{
                          overflowX: 'auto',
                          overflowY: 'hidden',
                          flexWrap: 'nowrap',
                          WebkitOverflowScrolling: 'touch',
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                          paddingBottom: 2
                        }}
                      >
                        {getProductVariantOptions(activeProduct).map((variant) => {
                          const sizeValue = variant?.name || '';
                          if (!sizeValue) return null;
                          const isActiveVariant = String(getSelectedVariantForProduct(activeProduct)).toLowerCase() === String(sizeValue).toLowerCase();
                          const isVariantAvailable = variant?.in_stock !== false;
                          return (
                            <button
                              key={`details-size-${activeProduct?.id}-${sizeValue}`}
                              type="button"
                              onClick={() => selectVariantForProduct(activeProduct, sizeValue)}
                              className="btn btn-sm"
                              style={{
                                flex: '0 0 auto',
                                borderRadius: 10,
                                background: isActiveVariant ? 'rgba(22,163,74,0.14)' : 'rgba(15,23,42,0.04)',
                                border: isActiveVariant ? '2px solid #16a34a' : '1px solid rgba(15,23,42,0.15)',
                                color: isActiveVariant ? '#166534' : '#334155',
                                fontWeight: 500,
                                fontSize: '0.78rem',
                                padding: '7px 10px',
                                whiteSpace: 'nowrap',
                                position: 'relative',
                                overflow: 'hidden'
                              }}
                            >
                              {sizeValue}
                              {!isVariantAvailable && (
                                <span
                                  aria-hidden="true"
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    pointerEvents: 'none',
                                    background: 'linear-gradient(135deg, transparent 49%, rgba(148,163,184,0.8) 50%, transparent 51%)'
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="product-details-block mb-3">
                    <div className="small text-muted mb-1">{language === 'uz' ? 'Tavsif' : 'Описание'}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {activeProductDescription || (language === 'uz' ? "Tavsif kiritilmagan" : 'Описание не указано')}
                    </div>
                  </div>

                </section>

                {/* Похожие товары — отдельной секцией снизу, на ПК растягиваются на 2 колонки */}
                {relatedProducts.length > 0 && (
                  <section className="product-details-related-section">
                    <div className="product-details-block">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="fw-semibold">{language === 'uz' ? "O'xshash mahsulotlar" : 'Похожие товары'}</div>
                        <small className="text-muted">{relatedProducts.length}/15</small>
                      </div>
                      <div className="product-details-related-scroll">
                        {relatedProducts.slice(0, 15).map((item) => {
                          const relatedName = getProductName(item);
                          const relatedImageUrl = getProductCardImage(item, getSelectedVariantForProduct(item));
                          const relatedPriceMeta = getSelectedVariantPriceMeta(item, getSelectedVariantForProduct(item));
                          return (
                            <button
                              key={`related-${item.id}`}
                              type="button"
                              onClick={() => openProductDetailsModal(item)}
                              className="product-details-related-card"
                            >
                              {relatedImageUrl ? (
                                <img
                                  src={relatedImageUrl}
                                  alt={relatedName}
                                  style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
                                />
                              ) : (
                                renderStoreLogoFallback({
                                  wrapperStyle: { width: '100%', aspectRatio: '4 / 3', background: '#f8fafc' },
                                  imageStyle: { width: '46%', maxHeight: '46%' }
                                })
                              )}
                              <div style={{ padding: '8px 9px 9px' }}>
                                <div
                                  style={{
                                    fontSize: '0.78rem',
                                    lineHeight: 1.2,
                                    color: '#0f172a',
                                    fontWeight: 600,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    minHeight: 34
                                  }}
                                >
                                  {relatedName}
                                </div>
                                <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color, #0f766e)' }}>
                                  {formatPrice(relatedPriceMeta.currentPrice)} {t('sum')}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {/* Отзывы и комментарии — внизу: список может быть длинным, поэтому
                    показываем 3, остальное — по кнопке «Показать ещё». */}
                <section className="product-details-reviews-section">
                  <div className="product-details-block">
                    <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
                      <div className="fw-semibold">{language === 'uz' ? 'Baholar va kommentlar' : 'Оценки и комментарии'}</div>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        {renderRatingStars(productReviewsAverage, { size: 18 })}
                        <span className="small text-muted">
                          {productReviewsAverage.toFixed(1)} ({productReviewsTotal})
                        </span>
                      </div>
                    </div>

                    {productReviews.length === 0 ? (
                      <div className="small text-muted">
                        {language === 'uz' ? "Hali kommentlar yo'q" : 'Комментариев пока нет'}
                      </div>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        {(showAllProductReviews ? productReviews : productReviews.slice(0, 3)).map((review) => (
                          <div key={review.id} className="product-details-review-item">
                            <div className="d-flex justify-content-between align-items-center gap-2">
                              <strong style={{ fontSize: '0.9rem' }}>{review.author_name || (language === 'uz' ? 'Mijoz' : 'Клиент')}</strong>
                              <small className="text-muted">{formatReviewDate(review.created_at)}</small>
                            </div>
                            <div>{renderRatingStars(review.rating, { size: 16 })}</div>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                              {review.comment || (language === 'uz' ? 'Kommentsiz baho' : 'Оценка без комментария')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!showAllProductReviews && (productReviews.length > 3 || productReviewsHasMore) ? (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => { setShowAllProductReviews(true); if (productReviewsHasMore) loadMoreProductReviews(); }}
                        >
                          {language === 'uz' ? "Ko'proq ko'rsatish" : 'Показать ещё'}
                        </Button>
                      </div>
                    ) : (showAllProductReviews && productReviewsHasMore) ? (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline-secondary"
                          size="sm"
                          onClick={loadMoreProductReviews}
                          disabled={productReviewsLoadingMore}
                        >
                          {productReviewsLoadingMore
                            ? (language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...')
                            : (language === 'uz' ? "Yana ko'rsatish" : 'Ещё')}
                        </Button>
                      </div>
                    ) : null}

                    {(productReviewPermissions.can_review || !productReviewPermissions.is_authenticated) && (
                      <hr className="my-3" />
                    )}

                    {productReviewPermissions.can_review ? (
                      !showProductReviewComposer ? (
                        <Button
                          type="button"
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => setShowProductReviewComposer(true)}
                        >
                          {language === 'uz' ? 'Komment qoldirish' : 'Оставить комментарий'}
                        </Button>
                      ) : (
                        <>
                          <div className="small text-muted mb-2">
                            {language === 'uz' ? 'Baholang va komment qoldiring' : 'Оцените и оставьте комментарий'}
                          </div>
                          <div className="d-flex gap-1 mb-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={`review-star-${star}`}
                                type="button"
                                onClick={() => setProductReviewRating(star)}
                                className="btn btn-sm p-0 border-0"
                                style={{
                                  width: 38,
                                  height: 38,
                                  fontSize: '1.72rem',
                                  lineHeight: 1,
                                  color: star <= Math.round(normalizeRatingValue(productReviewRating, 0)) ? '#f59e0b' : '#cbd5e1',
                                  background: 'transparent'
                                }}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={productReviewComment}
                            onChange={(e) => setProductReviewComment(e.target.value)}
                            rows={3}
                            maxLength={1500}
                            className="form-control"
                            placeholder={language === 'uz' ? 'Komment yozing...' : 'Напишите комментарий...'}
                          />
                          <div className="d-flex justify-content-between align-items-center mt-2">
                            <small className="text-muted">
                              {String(productReviewComment || '').length}/1500
                            </small>
                            <div className="d-flex align-items-center gap-2">
                              <Button
                                type="button"
                                variant="light"
                                size="sm"
                                onClick={() => setShowProductReviewComposer(false)}
                              >
                                {language === 'uz' ? 'Bekor qilish' : 'Скрыть'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={submitProductReview}
                                disabled={productReviewSubmitting}
                              >
                                {productReviewSubmitting
                                  ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                                  : (language === 'uz' ? 'Yuborish' : 'Отправить')}
                              </Button>
                            </div>
                          </div>
                        </>
                      )
                    ) : !productReviewPermissions.is_authenticated ? (
                      <div className="small text-muted">
                        {language === 'uz'
                          ? "Komment qoldirish uchun tizimga kiring."
                          : 'Войдите в аккаунт, чтобы оставить комментарий.'}
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="product-details-bottom-bar">
                <div className="product-details-bottom-inner">
                  {activeProductSelectedVariantAvailable ? (
                    activeProductQty > 0 ? (
                      <>
                        <div className="product-details-bottom-stepper">
                          <button
                            type="button"
                            className="btn btn-sm p-0 border-0 bg-transparent"
                            onClick={() => updateQuantity(activeProduct.id, activeProductQty - activeProductQuantityStep, activeProductSelectedVariant)}
                            aria-label={language === 'uz' ? 'Kamaytirish' : 'Уменьшить'}
                          >
                            −
                          </button>
                          <span>{formatQuantity(activeProductQty)}</span>
                          <button
                            type="button"
                            className="btn btn-sm p-0 border-0 bg-transparent"
                            style={{ opacity: activeProductIsAtStockLimit ? 0.45 : 1 }}
                            disabled={activeProductIsAtStockLimit}
                            onClick={() => updateProductQuantityWithinStock(
                              activeProduct,
                              activeProductQty,
                              activeProductQuantityStep,
                              activeProductSelectedVariant
                            )}
                            aria-label={language === 'uz' ? "Ko'paytirish" : 'Увеличить'}
                          >
                            +
                          </button>
                        </div>
                        <Button
                          type="button"
                          className="product-details-bottom-cta"
                          onClick={() => { if (isGuestStorefront) { setShowProductDetailsModal(false); setStorefrontOrderError(''); setStorefrontOrderSuccess(''); setStorefrontStep(1); setShowStorefrontCartModal(true); return; } navigate('/cart'); }}
                        >
                          {language === 'uz' ? "Savatga o'tish" : 'В корзину'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        className="product-details-bottom-cta"
                        onClick={() => handleAddToCart(activeProduct)}
                      >
                        {language === 'uz' ? "Savatga qo'shish" : 'В корзину'}
                      </Button>
                    )
                  ) : (
                    <Button type="button" className="product-details-bottom-cta" disabled>
                      {language === 'uz' ? 'Mavjud emas' : 'Нет в наличии'}
                    </Button>
                  )}
                </div>
              </div>

              {shareFallbackModal.show && (
                <>
                  <div
                    onClick={closeShareFallbackModal}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.36)',
                      zIndex: 30
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: '#ffffff',
                      borderTopLeftRadius: 20,
                      borderTopRightRadius: 20,
                      padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
                      boxShadow: '0 -8px 28px rgba(15, 23, 42, 0.24)',
                      zIndex: 31,
                      animation: 'catalogShareSheetUp 180ms ease-out'
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 4,
                        borderRadius: 999,
                        background: '#d1d5db',
                        margin: '0 auto 10px'
                      }}
                    />
                    <div
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: 10
                      }}
                    >
                      {language === 'uz' ? 'Ulashish' : 'Поделиться'}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 10
                      }}
                    >
                      <button
                        type="button"
                        onClick={handleShareViaTelegram}
                        style={{
                          border: shareActionActive === 'telegram' ? '2px solid #229ED9' : '1px solid #dbe5f2',
                          borderRadius: 14,
                          background: shareActionActive === 'telegram' ? '#eef8ff' : '#f8fbff',
                          minHeight: 96,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8
                        }}
                      >
                        <img src="https://cdn.simpleicons.org/telegram/229ED9" alt="Telegram" width="26" height="26" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>Telegram</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleShareViaWhatsApp}
                        style={{
                          border: shareActionActive === 'whatsapp' ? '2px solid #25D366' : '1px solid #dbe5f2',
                          borderRadius: 14,
                          background: shareActionActive === 'whatsapp' ? '#f2fff7' : '#f8fbff',
                          minHeight: 96,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8
                        }}
                      >
                        <img src="https://cdn.simpleicons.org/whatsapp/25D366" alt="WhatsApp" width="26" height="26" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleShareCopyFallback}
                        style={{
                          border: shareActionActive === 'copy' ? '2px solid #475569' : '1px solid #dbe5f2',
                          borderRadius: 14,
                          background: shareActionActive === 'copy' ? '#f1f5f9' : '#f8fbff',
                          minHeight: 96,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8
                        }}
                      >
                        <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>⧉</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>
                          {language === 'uz' ? 'Nusxalash' : 'Копировать'}
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-3 text-muted">{language === 'uz' ? "Mahsulot topilmadi" : 'Товар не найден'}</div>
          )}
        </Modal.Body>
      </Modal>

      <Modal
        show={showGalleryModal}
        onHide={closeProductGallery}
        className="product-gallery-modal"
        dialogClassName="product-gallery-dialog"
        backdropClassName="product-gallery-backdrop"
        backdrop
        keyboard
        fullscreen
      >
        <Modal.Body className="product-gallery-modal-body p-0">
          <button
            type="button"
            className="product-gallery-close-btn"
            onClick={closeProductGallery}
            aria-label={language === 'uz' ? 'Yopish' : 'Закрыть'}
          >
            <span className="product-gallery-close-glyph">×</span>
          </button>
          {galleryImages.length > 0 && (
            <div
              className="product-gallery-frame"
              onTouchStart={handleGalleryTouchStart}
              onTouchMove={handleGalleryTouchMove}
              onTouchEnd={handleGalleryTouchEnd}
            >
              <img
                src={galleryImages[galleryIndex]}
                alt={galleryProductName || 'Product'}
                className="product-gallery-image"
              />
              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPrevGalleryImage}
                    aria-label={language === 'uz' ? 'Oldingi rasm' : 'Предыдущее фото'}
                    className="product-gallery-nav-btn product-gallery-nav-btn-prev"
                  >
                    <span className="product-gallery-nav-glyph">‹</span>
                  </button>
                  <button
                    type="button"
                    onClick={showNextGalleryImage}
                    aria-label={language === 'uz' ? 'Keyingi rasm' : 'Следующее фото'}
                    className="product-gallery-nav-btn product-gallery-nav-btn-next"
                  >
                    <span className="product-gallery-nav-glyph">›</span>
                  </button>
                  <div className="product-gallery-counter">
                    {galleryIndex + 1} / {galleryImages.length}
                  </div>
                </>
              )}
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Bottom navigation — скрываем на публичной витрине, иначе пункты ведут на /cart, /favorites
         и т.д., которые защищены PrivateRoute и редиректят гостя на /login. Корзина у гостя доступна
         через иконку в шапке. */}
      {!isOperator() && !isPublicStorefront && <BottomNav />}

      {/* Spacer for bottom nav */}
      {!isOperator() && !isPublicStorefront && <div style={{ height: '70px' }} />}

      {/* Гостевое оформление заказа с публичной витрины (мастер 3 шага, как в WebApp) */}
      {isPublicStorefront && (
        <Modal
          show={showStorefrontCartModal}
          onHide={() => setShowStorefrontCartModal(false)}
          centered
          size="lg"
          scrollable
        >
          <Modal.Header closeButton>
            <Modal.Title style={{ fontSize: '1.05rem' }}>
              {storefrontOrderSuccess
                ? (language === 'uz' ? 'Buyurtma qabul qilindi' : 'Заказ принят')
                : storefrontStep === 1
                  ? (language === 'uz' ? 'Savat' : 'Корзина')
                  : storefrontStep === 2
                    ? (language === 'uz' ? 'Yetkazib berish manzili' : 'Адрес доставки')
                    : (language === 'uz' ? 'Aloqa maʼlumotlari' : 'Контактные данные')}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ padding: '12px 14px' }}>
            {storefrontOrderSuccess ? (
              <div className="text-center py-3">
                <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                <h5 className="mb-2">
                  {language === 'uz' ? 'Rahmat! Buyurtma rasmiylashtirildi.' : 'Спасибо! Заказ оформлен.'}
                </h5>
                <div className="text-muted mb-3">
                  {language === 'uz' ? 'Buyurtma raqami' : 'Номер заказа'}: <strong>#{storefrontOrderSuccess}</strong>
                </div>
                <p className="text-muted small mb-4">
                  {language === 'uz'
                    ? 'Magazin koʻrsatilgan raqam orqali siz bilan bogʻlanadi.'
                    : 'Магазин свяжется с вами по указанному номеру телефона.'}
                </p>
                <Button variant="primary" className="w-100" onClick={() => { setShowStorefrontCartModal(false); setStorefrontOrderSuccess(''); setStorefrontStep(1); }}>
                  {language === 'uz' ? 'Yopish' : 'Закрыть'}
                </Button>
              </div>
            ) : (
              <>
                {/* Индикатор шагов */}
                <div className="d-flex align-items-center justify-content-center mb-3 gap-2">
                  {[1, 2, 3].map((stepNum) => (
                    <div key={stepNum} className="d-flex align-items-center gap-2">
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: storefrontStep >= stepNum ? 'var(--primary-color, #2563eb)' : '#e5e7eb',
                        color: storefrontStep >= stepNum ? '#fff' : '#6b7280',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: 700
                      }}>{stepNum}</div>
                      {stepNum < 3 && <div style={{ width: 28, height: 2, background: storefrontStep > stepNum ? 'var(--primary-color, #2563eb)' : '#e5e7eb' }} />}
                    </div>
                  ))}
                </div>

                {/* Шаг 1: корзина */}
                {storefrontStep === 1 && (
                  cart.length === 0 ? (
                    <div className="text-center py-4 text-muted">
                      <div style={{ fontSize: 56, marginBottom: 8 }}>🛒</div>
                      <div>{language === 'uz' ? 'Savat boʻsh' : 'Корзина пуста'}</div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3" style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid rgba(71,85,105,0.12)', borderRadius: 12 }}>
                        {cart.map((item, index) => {
                          const itemName = (language === 'uz' && item.name_uz) ? item.name_uz : (item.name_ru || item.name || `#${item.id}`);
                          const qty = Number(item.quantity) || 0;
                          const price = Number(item.price) || 0;
                          const step = resolveQuantityStep(item) || 1;
                          const imgSrc = item.image_url
                            ? (item.image_url.startsWith('http') ? item.image_url : `${API_URL.replace('/api', '')}${item.image_url}`)
                            : '';
                          return (
                            <div
                              key={`${item.id}-${item.selected_variant || ''}`}
                              className="d-flex align-items-center p-2"
                              style={{ borderBottom: index !== cart.length - 1 ? '1px solid rgba(71,85,105,0.08)' : 'none', gap: 10 }}
                            >
                              {imgSrc ? (
                                <img src={imgSrc} alt={itemName} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 56, height: 56, borderRadius: 10, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>🛍️</div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="text-truncate" style={{ fontWeight: 600, fontSize: '0.9rem' }}>{itemName}</div>
                                {item.selected_variant && (
                                  <div className="small text-muted">{language === 'uz' ? 'Variant' : 'Вариант'}: {item.selected_variant}</div>
                                )}
                                <div className="small" style={{ color: 'var(--primary-color, #2563eb)', fontWeight: 700 }}>
                                  {price.toLocaleString('ru-RU')} {language === 'uz' ? "so'm" : 'сум'}
                                </div>
                                {Number(item.container_price) > 0 && (
                                  <div className="small text-muted">
                                    + {Number(item.container_price).toLocaleString('ru-RU')} {language === 'uz' ? 'qadoq' : 'упаковка'}
                                  </div>
                                )}
                              </div>
                              <div className="d-flex align-items-center gap-1">
                                <div className="d-flex align-items-center" style={{ background: '#f1f5f9', borderRadius: 999, padding: '2px 4px' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(item.id, qty - step, item.selected_variant)}
                                    style={{ border: 'none', background: 'transparent', padding: '2px 8px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}
                                  >−</button>
                                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(item.id, qty + step, item.selected_variant)}
                                    style={{ border: 'none', background: 'transparent', padding: '2px 8px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}
                                  >+</button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id, item.selected_variant)}
                                  aria-label="Удалить"
                                  style={{ border: 'none', background: 'transparent', color: '#ef4444', padding: '4px 6px', fontSize: '1rem' }}
                                >🗑️</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Комментарий к заказу — как в WebApp */}
                      <Form.Group className="mb-3">
                        <Form.Label className="small mb-1 text-muted">
                          {language === 'uz' ? 'Buyurtmaga izoh' : 'Комментарий к заказу'}
                        </Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          placeholder={language === 'uz' ? 'Buyurtmaga doir tilaklar...' : 'Пожелания к заказу...'}
                          value={storefrontOrderForm.comment}
                          onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, comment: e.target.value })}
                        />
                      </Form.Group>

                      {/* Сумма скрыта на шаге 1 — она зависит от доставки, которую выберут дальше */}
                    </>
                  )
                )}

                {/* Шаг 2: тип заказа + адрес + детали */}
                {storefrontStep === 2 && (
                  <>
                    {/* Тип заказа: Доставка / Самовывоз — кнопки прячем, если магазин не разрешил самовывоз */}
                    {storefrontIsPickupEnabled && (
                      <>
                        <Form.Label className="small mb-1 text-muted">{language === 'uz' ? 'Buyurtma turi' : 'Тип заказа'}</Form.Label>
                        <div className="d-flex gap-2 mb-3">
                          <Button
                            variant={storefrontOrderForm.fulfillment_type === 'delivery' ? 'primary' : 'outline-secondary'}
                            style={{ flex: 1 }}
                            onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, fulfillment_type: 'delivery' }))}
                          >
                            🛵 {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}
                          </Button>
                          <Button
                            variant={storefrontOrderForm.fulfillment_type === 'pickup' ? 'primary' : 'outline-secondary'}
                            style={{ flex: 1 }}
                            onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, fulfillment_type: 'pickup' }))}
                          >
                            🚶 {language === 'uz' ? 'Olib ketish' : 'Самовывоз'}
                          </Button>
                        </div>
                      </>
                    )}

                    {storefrontOrderForm.fulfillment_type === 'pickup' ? (
                      <div className="p-3 mb-2" style={{ background: '#f8fafc', borderRadius: 12 }}>
                        <div className="small text-muted">
                          {language === 'uz'
                            ? 'Buyurtmani magazinning oʻzidan olib ketasiz. Magazin siz bilan tasdiqlash uchun bogʻlanadi.'
                            : 'Заберёте заказ из магазина. Магазин свяжется с вами для подтверждения.'}
                        </div>
                      </div>
                    ) : (
                      <>
                        <Form.Label className="small mb-1 text-muted">{language === 'uz' ? 'Yetkazib berish manzili' : 'Адрес доставки'}</Form.Label>
                        <div style={{ height: 240, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(71,85,105,0.18)', marginBottom: 10 }}>
                          <ClientLocationPicker
                            latitude={storefrontOrderForm.delivery_lat || 41.311081}
                            longitude={storefrontOrderForm.delivery_lng || 69.240562}
                            onLocationChange={(lat, lng) => {
                              const nlat = Number(lat);
                              const nlng = Number(lng);
                              if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return;
                              setStorefrontOrderForm((prev) => ({ ...prev, delivery_lat: nlat, delivery_lng: nlng }));
                              // Пользователь сдвинул маркер — снова даём возможность определить по GPS.
                              setStorefrontShowGpsButton(true);
                              setStorefrontShowAddressField(true);
                            }}
                            onAddressChange={(addressText, meta = {}) => {
                              const full = String(meta?.fullAddress || addressText || '').trim();
                              if (full) {
                                setStorefrontOrderForm((prev) => ({ ...prev, delivery_address: full }));
                              }
                            }}
                          />
                        </div>
                        {storefrontShowGpsButton && (
                          <Button
                            variant="primary"
                            className="w-100 mb-3 d-inline-flex align-items-center justify-content-center gap-2"
                            disabled={storefrontGeolocating}
                            onClick={() => requestStorefrontGeolocation()}
                          >
                            <span aria-hidden="true">📍</span>
                            {storefrontGeolocating
                              ? (language === 'uz' ? 'Aniqlanmoqda...' : 'Определяем...')
                              : (language === 'uz' ? 'Joriy joylashuvni aniqlash' : 'Определить местоположение')}
                          </Button>
                        )}
                        {storefrontShowAddressField && (
                          <Form.Group className="mb-3">
                            <Form.Control
                              as="textarea"
                              rows={2}
                              placeholder={language === 'uz' ? 'Shahar, koʻcha' : 'Город, улица'}
                              value={storefrontOrderForm.delivery_address}
                              onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, delivery_address: e.target.value })}
                              autoComplete="street-address"
                            />
                          </Form.Group>
                        )}

                        {/* Детали адреса: Дом / Квартира / Домофон */}
                        <Form.Label className="small mb-1 text-muted">{language === 'uz' ? 'Manzil tafsilotlari' : 'Детали адреса'}</Form.Label>
                        <div className="d-flex gap-2 mb-2">
                          <Form.Control
                            type="text"
                            placeholder={language === 'uz' ? 'Uy' : 'Дом'}
                            value={storefrontOrderForm.address_house}
                            onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, address_house: e.target.value })}
                          />
                          <Form.Control
                            type="text"
                            placeholder={language === 'uz' ? 'Kvartira' : 'Квартира'}
                            value={storefrontOrderForm.address_apartment}
                            onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, address_apartment: e.target.value })}
                          />
                        </div>
                        <Form.Control
                          className="mb-2"
                          type="text"
                          placeholder={language === 'uz' ? 'Eshik kodi / domofon' : 'Код двери / домофон'}
                          value={storefrontOrderForm.address_doorcode}
                          onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, address_doorcode: e.target.value })}
                        />
                      </>
                    )}
                  </>
                )}

                {/* Шаг 3: ФИО, телефон*, время доставки, оплата, промокод, сводка */}
                {storefrontStep === 3 && (
                  <>
                    <Form.Group className="mb-2">
                      <Form.Label className="small mb-1">{language === 'uz' ? 'F.I.SH.' : 'ФИО'} <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        type="text"
                        placeholder={language === 'uz' ? 'Ismingiz' : 'Ваше имя'}
                        value={storefrontOrderForm.customer_name}
                        onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, customer_name: e.target.value })}
                        autoComplete="name"
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label className="small mb-1">{language === 'uz' ? 'Telefon' : 'Телефон'} <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        type="tel"
                        placeholder="+998 90 123 45 67"
                        value={storefrontOrderForm.customer_phone}
                        onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, customer_phone: e.target.value })}
                        autoComplete="tel"
                      />
                    </Form.Group>

                    {/* Время доставки — как в WebApp */}
                    {storefrontOrderForm.fulfillment_type !== 'pickup' && (
                      <>
                        <Form.Label className="small mb-1 text-muted">{language === 'uz' ? 'Yetkazib berish vaqti' : 'Время доставки'}</Form.Label>
                        <div className="d-flex gap-2 mb-2">
                          <Button
                            variant={storefrontOrderForm.delivery_time_type === 'asap' ? 'primary' : 'outline-secondary'}
                            style={{ flex: 1 }}
                            onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, delivery_time_type: 'asap', delivery_date: '' }))}
                          >
                            🚀 {language === 'uz' ? 'Tezroq' : 'Быстрее'}
                          </Button>
                          {publicRestaurantMeta?.is_scheduled_date_delivery_enabled && (
                            <Button
                              variant={storefrontOrderForm.delivery_time_type === 'scheduled' ? 'primary' : 'outline-secondary'}
                              style={{ flex: 1 }}
                              onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, delivery_time_type: 'scheduled' }))}
                            >
                              📅 {language === 'uz' ? 'Sana tanlash' : 'Выбрать дату'}
                            </Button>
                          )}
                        </div>
                        {storefrontOrderForm.delivery_time_type === 'scheduled' && publicRestaurantMeta?.is_scheduled_date_delivery_enabled && (
                          <Form.Control
                            className="mb-3"
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            max={(() => {
                              const maxDays = Number(publicRestaurantMeta?.scheduled_delivery_max_days) || 7;
                              const d = new Date();
                              d.setDate(d.getDate() + maxDays);
                              return d.toISOString().split('T')[0];
                            })()}
                            value={storefrontOrderForm.delivery_date}
                            onChange={(e) => setStorefrontOrderForm({ ...storefrontOrderForm, delivery_date: e.target.value })}
                          />
                        )}
                      </>
                    )}

                    {/* Способ оплаты — оригинальные иконки/логотипы */}
                    <Form.Label className="small mb-1 text-muted">{language === 'uz' ? 'Toʻlov usuli' : 'Способ оплаты'}</Form.Label>
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      {publicRestaurantMeta?.cash_enabled !== false && (
                        <Button
                          variant={storefrontOrderForm.payment_method === 'cash' ? 'primary' : 'outline-secondary'}
                          style={{ flex: '1 1 30%', minWidth: 110, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, payment_method: 'cash' }))}
                        >
                          <img src="/cash.svg" alt="" width="18" height="18" style={{ display: 'block' }} />
                          {language === 'uz' ? 'Naqd' : 'Наличные'}
                        </Button>
                      )}
                      {publicRestaurantMeta?.click_enabled && (
                        <Button
                          variant={storefrontOrderForm.payment_method === 'click' ? 'primary' : 'outline-secondary'}
                          style={{ flex: '1 1 30%', minWidth: 110, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, payment_method: 'click' }))}
                          aria-label="Click"
                        >
                          <img src="/click.png" alt="Click" height="20" style={{ display: 'block' }} />
                        </Button>
                      )}
                      {publicRestaurantMeta?.card_payment_enabled && (
                        <Button
                          variant={storefrontOrderForm.payment_method === 'card' ? 'primary' : 'outline-secondary'}
                          style={{ flex: '1 1 30%', minWidth: 110, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          onClick={() => setStorefrontOrderForm((prev) => ({ ...prev, payment_method: 'card' }))}
                        >
                          <img src="/card.svg" alt="" width="18" height="18" style={{ display: 'block' }} />
                          {language === 'uz' ? 'Karta' : 'Карта'}
                        </Button>
                      )}
                    </div>

                    {/* Реквизиты карты — как в WebApp: показываем при выборе оплаты картой */}
                    {storefrontOrderForm.payment_method === 'card' && publicRestaurantMeta?.card_payment_enabled && (
                      <div className="p-3 mb-3" style={{ background: '#f8fafc', borderRadius: 12 }}>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="fw-bold font-monospace" style={{ fontSize: '1.05rem', letterSpacing: '0.5px' }}>
                            {publicRestaurantMeta?.card_payment_number || '—'}
                          </span>
                          {publicRestaurantMeta?.card_payment_number && (
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              onClick={() => {
                                try {
                                  navigator.clipboard?.writeText(String(publicRestaurantMeta.card_payment_number));
                                  setStorefrontCardCopied(true);
                                  setTimeout(() => setStorefrontCardCopied(false), 1500);
                                } catch (_) { /* noop */ }
                              }}
                            >
                              {storefrontCardCopied
                                ? (language === 'uz' ? 'Nusxalandi' : 'Скопировано')
                                : (language === 'uz' ? 'Nusxalash' : 'Копировать')}
                            </Button>
                          )}
                        </div>
                        {publicRestaurantMeta?.card_payment_holder && (
                          <div className="mt-1">{publicRestaurantMeta.card_payment_holder}</div>
                        )}
                        <div className="small text-danger mt-2">
                          {language === 'uz'
                            ? "To'lovdan so'ng chekni saqlang — do'kon tasdiqlash uchun bog'lanadi."
                            : 'После оплаты сохраните чек — магазин свяжется для подтверждения.'}
                        </div>
                      </div>
                    )}

                    {/* Промокод — показываем всегда; если магазин не включил, сервер вернёт ошибку */}
                    {(
                      <>
                        <Form.Label className="small mb-1 text-muted d-inline-flex align-items-center gap-1">
                          <span aria-hidden="true">🎁</span>
                          {language === 'uz' ? 'Promokod' : 'Промокод'}
                        </Form.Label>
                        <div className="d-flex gap-2 mb-3">
                          <Form.Control
                            type="text"
                            placeholder={language === 'uz' ? 'Promokodni kiriting' : 'Введите промокод'}
                            value={storefrontOrderForm.promo_code}
                            onChange={(e) => {
                              const v = e.target.value;
                              setStorefrontOrderForm((prev) => ({ ...prev, promo_code: v }));
                              setStorefrontPromoState({ status: 'idle', discount: 0, message: '' });
                            }}
                          />
                          <Button
                            variant="primary"
                            style={{ background: 'var(--primary-color, #2563eb)', borderColor: 'var(--primary-color, #2563eb)' }}
                            disabled={storefrontPromoLoading || !String(storefrontOrderForm.promo_code || '').trim()}
                            onClick={async () => {
                              const code = String(storefrontOrderForm.promo_code || '').trim();
                              if (!code) return;
                              setStorefrontPromoLoading(true);
                              try {
                                const promoItems = cart.map((it) => {
                                  const containerNorm = Number(it.container_norm) || 1;
                                  const containerUnits = containerNorm > 0 ? Math.ceil(Number(it.quantity || 0) / containerNorm) : 0;
                                  const line = Number(it.price || 0) * Number(it.quantity || 0) + Number(it.container_price || 0) * containerUnits;
                                  return { product_id: Number(it.id), total: line };
                                });
                                const res = await axios.post(`${API_URL}/products/storefront-promo/validate`, {
                                  restaurant_id: Number(publicRestaurantId) || Number(selectedRestaurant),
                                  code,
                                  items: promoItems
                                });
                                if (res.data?.valid) {
                                  setStorefrontPromoState({ status: 'valid', discount: Number(res.data?.discount_amount) || 0, message: (language === 'uz' ? 'Promokod qoʻllandi' : 'Промокод применён') });
                                } else {
                                  setStorefrontPromoState({ status: 'invalid', discount: 0, message: (language === 'uz' ? 'Promokod yaroqsiz' : 'Промокод недействителен') });
                                }
                              } catch {
                                setStorefrontPromoState({ status: 'invalid', discount: 0, message: (language === 'uz' ? 'Tekshirishda xatolik' : 'Ошибка проверки') });
                              } finally {
                                setStorefrontPromoLoading(false);
                              }
                            }}
                          >
                            {storefrontPromoLoading ? '...' : (language === 'uz' ? 'Qoʻllash' : 'Применить')}
                          </Button>
                        </div>
                        {storefrontPromoState.message && (
                          <div className={`small mb-2 ${storefrontPromoState.status === 'valid' ? 'text-success' : 'text-danger'}`}>
                            {storefrontPromoState.message}
                          </div>
                        )}
                      </>
                    )}

                    {/* Сводка с иконками */}
                    <div className="p-3 mb-3" style={{ background: '#f8fafc', borderRadius: 12, fontSize: '0.9rem' }}>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted d-inline-flex align-items-center gap-1">
                          <span aria-hidden="true">🧾</span>{language === 'uz' ? 'Mahsulotlar' : 'Товары'}
                        </span>
                        <span className="fw-semibold">{Number(productTotal || 0).toLocaleString('ru-RU')} {language === 'uz' ? "so'm" : 'сум'}</span>
                      </div>
                      {Number(containerTotal || 0) > 0 && (
                        <div className="d-flex justify-content-between mb-1">
                          <span className="text-muted d-inline-flex align-items-center gap-1">
                            <span aria-hidden="true">🎁</span>{language === 'uz' ? 'Qadoqlash' : 'Упаковка'}
                          </span>
                          <span className="fw-semibold">{Number(containerTotal).toLocaleString('ru-RU')} {language === 'uz' ? "so'm" : 'сум'}</span>
                        </div>
                      )}
                      {storefrontServiceFee > 0 && (
                        <div className="d-flex justify-content-between mb-1">
                          <span className="text-muted d-inline-flex align-items-center gap-1">
                            <span aria-hidden="true">🛎️</span>{language === 'uz' ? 'Xizmat' : 'Сервис'}
                          </span>
                          <span className="fw-semibold">{storefrontServiceFee.toLocaleString('ru-RU')} {language === 'uz' ? "so'm" : 'сум'}</span>
                        </div>
                      )}
                      {storefrontOrderForm.fulfillment_type !== 'pickup' && (
                        <div className="d-flex justify-content-between mb-1">
                          <span className="text-muted d-inline-flex align-items-center gap-1">
                            <span aria-hidden="true">🚚</span>{language === 'uz' ? 'Yetkazib berish' : 'Доставка'}
                            {storefrontDeliveryDistance > 0 && (
                              <span style={{ opacity: 0.7 }}>({storefrontDeliveryDistance.toFixed(2)} км)</span>
                            )}
                          </span>
                          <span className="fw-semibold">
                            {storefrontDeliveryLoading
                              ? (language === 'uz' ? 'Hisoblanmoqda...' : 'Расчёт...')
                              : storefrontDeliveryOutOfZone
                                ? <span className="text-danger">{language === 'uz' ? 'Zonadan tashqarida' : 'Вне зоны'}</span>
                                : (!storefrontOrderForm.delivery_lat || !storefrontOrderForm.delivery_lng)
                                  ? <span style={{ opacity: 0.7 }}>{language === 'uz' ? 'Manzilni kartadan tanlang' : 'Укажите на карте'}</span>
                                  : `${storefrontEffectiveDeliveryCost.toLocaleString('ru-RU')} ${language === 'uz' ? "so'm" : 'сум'}`}
                          </span>
                        </div>
                      )}
                      {storefrontEffectivePromoDiscount > 0 && (
                        <div className="d-flex justify-content-between mb-1">
                          <span className="text-muted d-inline-flex align-items-center gap-1">
                            <span aria-hidden="true">🎁</span>{language === 'uz' ? 'Promokod' : 'Промокод'}
                          </span>
                          <span className="fw-semibold text-success">−{storefrontEffectivePromoDiscount.toLocaleString('ru-RU')} {language === 'uz' ? "so'm" : 'сум'}</span>
                        </div>
                      )}
                      <div className="d-flex justify-content-between pt-2 mt-2" style={{ borderTop: '1px solid rgba(71,85,105,0.12)', fontSize: '1.05rem' }}>
                        <span className="fw-semibold">{language === 'uz' ? 'Jami' : 'Итого'}</span>
                        <strong style={{ color: 'var(--primary-color, #2563eb)' }}>{storefrontFinalTotal.toLocaleString('ru-RU')} {language === 'uz' ? "so'm" : 'сум'}</strong>
                      </div>
                      {storefrontOrderForm.delivery_address && storefrontOrderForm.fulfillment_type !== 'pickup' && (
                        <div className="small text-muted mt-2">
                          📍 {storefrontOrderForm.delivery_address}
                          {(storefrontOrderForm.address_house || storefrontOrderForm.address_apartment) && (
                            <> · {storefrontOrderForm.address_house && `дом ${storefrontOrderForm.address_house}`} {storefrontOrderForm.address_apartment && `кв. ${storefrontOrderForm.address_apartment}`}</>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {storefrontOrderError && (
                  <div className="alert alert-danger py-2 small mb-2">{storefrontOrderError}</div>
                )}

                {/* Навигация: Назад / Далее или Отправить */}
                <div className="d-flex gap-2 mt-2">
                  {storefrontStep > 1 && (
                    <Button
                      variant="outline-secondary"
                      style={{ flex: '0 0 35%' }}
                      onClick={() => { setStorefrontOrderError(''); setStorefrontStep(storefrontStep - 1); }}
                      disabled={storefrontOrderSubmitting}
                    >
                      ← {language === 'uz' ? 'Orqaga' : 'Назад'}
                    </Button>
                  )}
                  {storefrontStep < 3 ? (
                    <Button
                      variant="primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setStorefrontOrderError('');
                        if (storefrontStep === 1) {
                          if (cart.length === 0) { setStorefrontOrderError(language === 'uz' ? 'Savat boʻsh' : 'Корзина пуста'); return; }
                          setStorefrontStep(2);
                          return;
                        }
                        if (storefrontStep === 2) {
                          if (storefrontOrderForm.fulfillment_type !== 'pickup'
                            && !String(storefrontOrderForm.delivery_address || '').trim()) {
                            setStorefrontOrderError('Введите адрес доставки');
                            return;
                          }
                          setStorefrontStep(3);
                        }
                      }}
                    >
                      {language === 'uz' ? 'Davom etish' : 'Далее'} →
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      style={{ flex: 1 }}
                      onClick={submitStorefrontOrder}
                      disabled={storefrontOrderSubmitting}
                    >
                      {storefrontOrderSubmitting
                        ? (language === 'uz' ? 'Yuborilmoqda...' : 'Отправка...')
                        : (language === 'uz' ? 'Buyurtma berish' : 'Оформить заказ')}
                    </Button>
                  )}
                </div>
                {storefrontStep === 3 && (
                  <div className="text-center text-muted small mt-2">
                    {language === 'uz' ? 'Toʻlov — qabul qilishda naqd pulda.' : 'Оплата — наличными при получении.'}
                  </div>
                )}
              </>
            )}
          </Modal.Body>
        </Modal>
      )}
    </div>
  );
}

export default Catalog;
