import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useDeferredValue } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Navbar from 'react-bootstrap/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCart, formatPrice, formatQuantity, resolveQuantityStep } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import ClientAccountModal from '../components/ClientAccountModal';
import HeartIcon from '../components/HeartIcon';
import { ListSkeleton, PageSkeleton } from '../components/SkeletonUI';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const CATALOG_ANIMATION_SEASONS = ['off', 'spring', 'summer', 'autumn', 'winter'];
const MENU_VIEW_MODES = ['grid_categories', 'single_list'];
const catalogSectionTabKey = (id) => (
  id === null || id === undefined ? '' : String(id)
);
const CATALOG_SEARCH_RESULTS_LIMIT = 80;
const PENDING_PRODUCT_REVIEW_SNOOZE_MS = 24 * 60 * 60 * 1000;
const LANGUAGE_STORAGE_KEY = 'language';
const normalizeCatalogAnimationSeason = (value, fallback = 'off') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CATALOG_ANIMATION_SEASONS.includes(normalized) ? normalized : fallback;
};
const normalizeMenuViewMode = (value, fallback = 'grid_categories') => {
  const normalized = String(value || '').trim().toLowerCase();
  return MENU_VIEW_MODES.includes(normalized) ? normalized : fallback;
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

function Menu2() {
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
  const [selectedCategory, setSelectedCategory] = useState(null); // level 2 category id
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
  const [productReviews, setProductReviews] = useState([]);
  const [productReviewsTotal, setProductReviewsTotal] = useState(0);
  const [productReviewsAverage, setProductReviewsAverage] = useState(0);
  const [productReviewsHasMore, setProductReviewsHasMore] = useState(false);
  const [productReviewsLoadingMore, setProductReviewsLoadingMore] = useState(false);
  const [productReviewRating, setProductReviewRating] = useState(5);
  const [productReviewComment, setProductReviewComment] = useState('');
  const [productReviewSubmitting, setProductReviewSubmitting] = useState(false);
  const [showProductReviewComposer, setShowProductReviewComposer] = useState(false);
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
  const [productHeroIndex, setProductHeroIndex] = useState(0);
  const [catalogAnimationSeason, setCatalogAnimationSeason] = useState('off');
  const [loading, setLoading] = useState(true);
  const [catalogTabsLayout, setCatalogTabsLayout] = useState({
    startSpacerWidth: 0,
    endSpacerWidth: 0
  });
  const { user, isOperator, logout } = useAuth();
  const { addToCart, updateQuantity, clearCart, cart, cartTotal } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { language, t, setCountryCurrency, setLanguage } = useLanguage();
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
  const menu2ContentScrollRef = useRef(null);
  const catalogHeaderBackground = '#f8fafc';
  const catalogTabGap = 8;
  const isTelegramWebView = useMemo(() => (
    typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp)
  ), []);
  const shouldShowDesktopLogout = isDesktopViewport && !isTelegramWebView && !isOperator();

  // Load restaurants (for header/logo and operator selection); re-sync when active shop changes (tabs / Telegram)
  useEffect(() => {
    fetchRestaurants();
  }, [user?.active_restaurant_id]);

  useEffect(() => {
    const onResize = () => {
      setIsDesktopViewport(window.innerWidth >= 992);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // Keep catalog bound to token-selected restaurant in Telegram WebApp.
    if (!isTelegramWebView) return;
    const activeRestaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!Number.isInteger(activeRestaurantId) || activeRestaurantId <= 0) return;
    if (Number(selectedRestaurant) === activeRestaurantId) return;
    setSelectedRestaurant(activeRestaurantId);
  }, [isTelegramWebView, user?.active_restaurant_id, selectedRestaurant]);

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
    const role = user?.role;
    if (role === 'operator' || role === 'superadmin') return;
    if (user?.active_restaurant_id) {
      setSelectedRestaurant(user.active_restaurant_id);
    }
  }, [user?.active_restaurant_id, user?.role]);

  useEffect(() => {
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
    // Menu2 uses a dedicated scroll container instead of #root/window
    return menu2ContentScrollRef.current || window;
  };
  const getCurrentScrollOffset = () => {
    const sc = getScrollContainer();
    if (sc === window) return window.scrollY || 0;
    return sc.scrollTop || 0;
  };

  const scrollToOffset = (offsetTop) => {
    const sc = getScrollContainer();
    sc.scrollTo({ top: offsetTop, behavior: 'smooth' });
  };

  const scrollToTop = () => scrollToOffset(0);
  const restoreScrollOffset = (offsetTop) => {
    const target = Math.max(0, Number(offsetTop) || 0);
    const sc = getScrollContainer();
    sc.scrollTo({ top: target, behavior: 'auto' });
  };
  const scrollActiveTabIntoView = (tabId, behavior = 'smooth') => {
    if (tabId === null || tabId === undefined || tabId === '') return;
    const scroller = level3TabsScrollerRef.current;
    const key = typeof tabId === 'string' ? tabId : catalogSectionTabKey(tabId);
    const btn = level3TabButtonRefs.current[key];
    if (!scroller || !btn) return;

    const scRect = scroller.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.width < 1 && btnRect.height < 1) return;

    // Center the active tab within the scroller viewport
    const btnCenter = btnRect.left + btnRect.width / 2;
    const scrollerCenter = scRect.left + scRect.width / 2;
    const delta = btnCenter - scrollerCenter;
    let targetLeft = scroller.scrollLeft + delta;

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    targetLeft = Math.min(maxScrollLeft, Math.max(0, targetLeft));
    if (Math.abs(scroller.scrollLeft - targetLeft) < 1) return;
    scroller.scrollTo({
      left: targetLeft,
      behavior: behavior === 'smooth' ? 'smooth' : 'auto'
    });
  };

  // Touch-based horizontal scroll for tabs (works in Telegram WebView)
  // IMPORTANT: touch handlers are added via native addEventListener with {passive:false}
  // so that e.preventDefault() works. React onTouchMove is passive by default in Chrome.
  const tabTouchRef = useRef({ active: false, dragged: false, startX: 0, startY: 0, scrollStart: 0, directionLocked: false, isHorizontal: false });

  useEffect(() => {
    const scroller = level3TabsScrollerRef.current;
    if (!scroller) return;

    const onTouchStart = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      tabTouchRef.current = {
        active: true,
        dragged: false,
        startX: touch.clientX,
        startY: touch.clientY,
        scrollStart: scroller.scrollLeft,
        directionLocked: false,
        isHorizontal: false
      };
    };

    const onTouchMove = (e) => {
      const state = tabTouchRef.current;
      if (!state.active) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (!state.directionLocked) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          state.directionLocked = true;
          state.isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
      }

      if (state.directionLocked && state.isHorizontal) {
        // Horizontal drag — scroll the tabs, block page scroll
        e.preventDefault();
        e.stopPropagation();
        state.dragged = true;
        scroller.scrollLeft = state.scrollStart - dx;
      }
      // If vertical — do nothing, let the page scroll naturally
    };

    const onTouchEnd = () => {
      tabTouchRef.current.active = false;
    };

    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
    };
  });

  // Mouse-based drag for desktop (no setPointerCapture, no conflict)
  const tabMouseRef = useRef({ active: false, dragged: false, startX: 0, scrollStart: 0 });
  const handleTabMouseDown = (e) => {
    // Only handle left mouse click, ignore touch events converted to mouse
    if (e.button !== 0) return;
    const scroller = level3TabsScrollerRef.current;
    if (!scroller) return;
    tabMouseRef.current = { active: true, dragged: false, startX: e.clientX, scrollStart: scroller.scrollLeft };
    e.preventDefault(); // prevent text selection
  };
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!tabMouseRef.current.active) return;
      const scroller = level3TabsScrollerRef.current;
      if (!scroller) return;
      const dx = e.clientX - tabMouseRef.current.startX;
      if (Math.abs(dx) > 4) tabMouseRef.current.dragged = true;
      scroller.scrollLeft = tabMouseRef.current.scrollStart - dx;
    };
    const onMouseUp = () => {
      tabMouseRef.current.active = false;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleTabsWheelScroll = (event) => {
    const tabsScroller = level3TabsScrollerRef.current;
    if (!tabsScroller) return;

    const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(primaryDelta) < 1) return;

    tabsScroller.scrollLeft += primaryDelta;
    event.preventDefault();
  };
  const handleCatalogTabClick = (sectionId) => {
    if (tabTouchRef.current.dragged || tabMouseRef.current.dragged) return;
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
    return options[0];
  };
  const getSelectedVariantDetails = (product, selectedVariant = null) => {
    const variants = getProductVariantOptions(product);
    if (!variants.length) return null;
    const selectedName = String(selectedVariant || getSelectedVariantForProduct(product) || '').trim().toLowerCase();
    if (!selectedName) return variants[0];
    return variants.find((variant) => String(variant.name || '').trim().toLowerCase() === selectedName) || variants[0];
  };
  const getSelectedVariantPrice = (product, selectedVariant = null) => {
    const variant = getSelectedVariantDetails(product, selectedVariant);
    if (variant && Number.isFinite(Number(variant.price)) && Number(variant.price) > 0) {
      return Number(variant.price);
    }
    const fallbackPrice = Number(product?.price);
    return Number.isFinite(fallbackPrice) ? fallbackPrice : 0;
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
    addToCart({
      ...product,
      restaurant_id: selectedRestaurant,
      price: variantPrice,
      description_ru: language === 'uz' ? (product?.description_ru || selectedVariantDescription) : selectedVariantDescription,
      description_uz: language === 'uz' ? selectedVariantDescription : (product?.description_uz || selectedVariantDescription),
      selected_variant: selectedVariant || null,
      container_name: resolvedContainerName,
      container_price: Number.isFinite(resolvedContainerPrice) && resolvedContainerPrice > 0 ? resolvedContainerPrice : 0,
      container_norm: Number.isFinite(resolvedContainerNorm) && resolvedContainerNorm > 0 ? resolvedContainerNorm : 1,
      image_url: cartImageUrl,
      thumb_url: cartThumbUrl,
      product_images: cartProductImages
    });
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
  useEffect(() => {
    if (currentRestaurant?.currency_code) {
      setCountryCurrency(currentRestaurant.currency_code);
    }
  }, [currentRestaurant?.currency_code, setCountryCurrency]);
  const menuViewMode = useMemo(
    () => normalizeMenuViewMode(currentRestaurant?.menu_view_mode, 'grid_categories'),
    [currentRestaurant]
  );
  const isSingleListMode = menuViewMode === 'single_list';
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
  const visibleProductSections = useMemo(() => (
    isSingleListMode ? singleListSections : productSections
  ), [isSingleListMode, singleListSections, productSections]);
  const activeCatalogTabs = useMemo(() => {
    if (isSingleListMode) {
      return singleListSections;
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
    if (!isSingleListMode || selectedCategory === null) return;
    setSelectedCategory(null);
    setActiveSubcategoryTab(null);
  }, [isSingleListMode, selectedCategory]);

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

    const scrollContainer = menu2ContentScrollRef.current;
    if (!scrollContainer) return undefined;

    // Header is outside the scroll container, so probe at ~16px from top of content area
    const sectionProbeLine = 16;

    const detectVisibleSection = () => {
      if (isTabAutoScrollRef.current) return;

      const containerRect = scrollContainer.getBoundingClientRect();

      let currentId = null;
      for (const section of activeCatalogTabs) {
        const el = productGroupRefs.current[catalogSectionTabKey(section.id)];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // rect.top is relative to viewport; containerRect.top is where content starts
        const relativeTop = rect.top - containerRect.top;
        if (relativeTop <= sectionProbeLine) {
          currentId = section.id;
        }
      }

      const isAtBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 48;

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
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (tabScrollSpyRafRef.current) {
        cancelAnimationFrame(tabScrollSpyRafRef.current);
        tabScrollSpyRafRef.current = null;
      }
    };
  }, [selectedCategory, activeCatalogTabs, activeSubcategoryTab, normalizedCatalogSearch, loading, isSingleListMode]);

  useEffect(() => {
    if (!selectedRestaurant || loading) {
      setCatalogScrollProgress(0);
      return undefined;
    }

    const scrollContainer = menu2ContentScrollRef.current;
    if (!scrollContainer) return undefined;

    const updateProgress = () => {
      const scrollTop = scrollContainer.scrollTop;
      const maxScroll = Math.max(1, scrollContainer.scrollHeight - scrollContainer.clientHeight);
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
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
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
    categoryListScrollOffsetRef.current = getCurrentScrollOffset();
    isTabAutoScrollRef.current = false;
    setSelectedCategory(categoryId);
    setActiveSubcategoryTab(null);
    scrollToTop();
  };

  const closeLevel2Category = () => {
    if (location.pathname === '/showcase/catalog') {
      navigate('/');
      return;
    }

    isTabAutoScrollRef.current = false;
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
    const scrollContainer = menu2ContentScrollRef.current;
    if (!sectionElement || !scrollContainer) return;

    isTabAutoScrollRef.current = true;
    if (tabScrollLockTimeoutRef.current) {
      clearTimeout(tabScrollLockTimeoutRef.current);
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const sectionRect = sectionElement.getBoundingClientRect();
    
    // Calculate position relative to the scroll container's top
    const relativeTop = sectionRect.top - containerRect.top;
    const topOffset = scrollContainer.scrollTop + relativeTop - 8;

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

  // Product card component
  const renderProductCard = (product) => {
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
    const productSizeOptions = getProductSizeOptions(product);
    const productDisplayPrice = getSelectedVariantPrice(product, selectedVariant);

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
          {primaryImageUrl ? (
            <Card.Img
              variant="top"
              src={primaryImageUrl}
              alt={productName}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                cursor: 'zoom-in',
                display: 'block'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openProductDetailsModal(product);
              }}
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/150?text=No+Image';
              }}
            />
          ) : (
            <div
              style={{ width: '100%', aspectRatio: '4 / 3', background: '#f8f9fa' }}
              className="d-flex align-items-center justify-content-center"
            >
              <span style={{ fontSize: '3rem', opacity: 0.3 }}>🏪</span>
            </div>
          )}
          {!product.in_stock && (
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
              border: '1px solid rgba(255,255,255,0.55)',
              background: favoriteActive ? 'rgba(255, 95, 125, 0.94)' : 'rgba(255,255,255,0.92)',
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
          {product.in_stock && productSizeOptions.length === 0 && (
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
                  className="d-flex align-items-center justify-content-between rounded-pill px-1 shadow"
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
                    style={{ width: 34, height: 34, fontSize: '18px', touchAction: 'manipulation' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateQuantity(product.id, qty + quantityStep, selectedVariant);
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
          <Card.Title className="fs-6 mb-1" style={{ fontSize: '0.85rem', lineHeight: '1.2' }}>
            {productName}
          </Card.Title>
          <Card.Text className="text-muted small mb-1" style={{ fontSize: '0.7rem' }}>
            {language === 'uz' && product.unit_uz ? product.unit_uz : product.unit}
          </Card.Text>
          {productSizeOptions.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-2">
              {productSizeOptions.slice(0, 3).map((sizeValue) => (
                <span
                  key={`product-card-size-${product.id}-${sizeValue}`}
                  className="badge"
                  style={{
                    background: 'rgba(22,163,74,0.12)',
                    color: '#166534',
                    border: '1px solid rgba(22,163,74,0.35)',
                    fontWeight: 500,
                    fontSize: '0.66rem'
                  }}
                >
                  {sizeValue}
                </span>
              ))}
              {productSizeOptions.length > 3 && (
                <span className="badge bg-light text-secondary border" style={{ fontSize: '0.66rem' }}>
                  +{productSizeOptions.length - 3}
                </span>
              )}
            </div>
          )}
          <div className="fw-bold mt-auto" style={{ fontSize: '0.9rem', color: 'var(--primary-color)' }}>
            {formatPrice(productDisplayPrice)} {t('sum')}
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
              src={resolveImageUrl(banner.image_url)}
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
          onClick={() => navigate('/cart')}
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
    setProductReviews([]);
    setProductReviewsTotal(0);
    setProductReviewsAverage(0);
    setProductReviewsHasMore(false);
    setShowProductReviewComposer(false);
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
    const requestedCategoryId = normalizeId(location.state?.selectedCategoryId);
    if (!requestedCategoryId || categories.length === 0) return;

    const requestedCategory = categoriesById.get(requestedCategoryId) || null;
    let targetLevel2CategoryId = requestedCategoryId;
    let targetLevel3TabId = null;

    if (requestedCategory) {
      const parentId = normalizeId(requestedCategory.parent_id);
      if (parentId === null) {
        const level2Children = (childrenByParent.get(requestedCategoryId) || [])
          .map((item) => normalizeId(item?.id))
          .filter((id) => Number.isInteger(id));
        targetLevel2CategoryId = level2Children[0] || requestedCategoryId;
      } else {
        const parentCategory = categoriesById.get(parentId) || null;
        const grandParentId = normalizeId(parentCategory?.parent_id);
        if (parentCategory && grandParentId !== null) {
          // Selected category is level 3 -> open its level 2 and activate the tab.
          targetLevel2CategoryId = parentId;
          targetLevel3TabId = requestedCategoryId;
        } else {
          // Selected category is already level 2.
          targetLevel2CategoryId = requestedCategoryId;
        }
      }
    }

    if (targetLevel2CategoryId) {
      setSelectedCategory(targetLevel2CategoryId);
      if (targetLevel3TabId) {
        setActiveSubcategoryTab(targetLevel3TabId);
      }
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [
    location.state?.selectedCategoryId,
    categories.length,
    categoriesById,
    childrenByParent,
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
              const isAvailable = product.in_stock !== false;
              const displayPrice = getSelectedVariantPrice(product, selectedVariant);
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
                      <span style={{ opacity: 0.5 }}>📦</span>
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
                            style={{ width: 32, height: 32, color: 'var(--primary-color)', fontSize: '18px', touchAction: 'manipulation' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(product.id, qty + quantityStep, selectedVariant);
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
                    <div
                      className="text-end mt-1"
                      style={{ color: 'var(--primary-color)', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.83rem' }}
                    >
                      {formatPrice(displayPrice)} {t('sum')}
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
    return <PageSkeleton fullscreen label="Загрузка магазинов" cards={8} />;
  }

  const isCategoryView = !isSingleListMode && selectedCategory !== null;
  const isShowcaseCatalogRoute = location.pathname === '/showcase/catalog';
  const shouldShowHeaderBackButton = isCategoryView || isShowcaseCatalogRoute;
  const handleHeaderBackAction = () => {
    if (isCategoryView) {
      closeLevel2Category();
      return;
    }
    if (isShowcaseCatalogRoute) {
      navigate('/');
    }
  };
  const shouldShowCatalogTabs = Boolean(
    selectedRestaurant
    && !loading
    && !normalizedCatalogSearch
    && activeCatalogTabs.length > 0
  );
  const activeProduct = selectedProductDetails || selectedProductSummary;
  const activeProductName = getProductName(activeProduct);
  const activeProductSelectedVariant = getSelectedVariantForProduct(activeProduct);
  const activeProductCardImage = getProductCardImage(activeProduct, activeProductSelectedVariant);
  const activeProductGalleryImages = getProductGalleryImages(activeProduct, activeProductSelectedVariant);
  const activeProductGalleryIndex = activeProductGalleryImages.length > 0
    ? Math.max(0, Math.min(productHeroIndex, activeProductGalleryImages.length - 1))
    : 0;
  const activeProductHeroImage = activeProductGalleryImages[activeProductGalleryIndex] || activeProductCardImage;
  const activeProductDescription = getSelectedVariantDescription(activeProduct, activeProductSelectedVariant);
  const activeProductDisplayPrice = getSelectedVariantPrice(activeProduct, activeProductSelectedVariant);
  const activeProductCartItem = activeProduct?.id ? getCartItem(activeProduct.id, activeProductSelectedVariant) : null;
  const activeProductQty = activeProductCartItem?.quantity || 0;
  const activeProductQuantityStep = resolveQuantityStep(activeProductCartItem || activeProduct || {});
  const activeProductFavorite = activeProduct?.id ? isFavorite(activeProduct.id) : false;
  const activeProductSizeOptions = getProductSizeOptions(activeProduct);

  return (
    <div className="menu2-shell" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      {/* ═══ FIXED TOP: Header + Tabs ═══ */}
      <div style={{ flex: '0 0 auto', zIndex: 1010 }}>
      <Navbar
        ref={catalogHeaderRef}
        expand="lg"
        className="mb-0"
        style={{
          position: 'relative',
          backgroundColor: catalogHeaderBackground,
          borderBottom: shouldShowCatalogTabs
            ? 'none'
            : '1px solid var(--border-color)'
        }}
      >
        <div
          className="w-100 px-3 mx-auto"
          style={{
            maxWidth: '1280px',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div className="d-flex align-items-center justify-content-start">
            {shouldShowHeaderBackButton ? (
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

          <div className="d-flex align-items-center justify-content-end gap-2">
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
              className="menu2-tabs-scroll"
              onWheel={handleTabsWheelScroll}
              onMouseDown={handleTabMouseDown}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${catalogTabGap}px`,
                overflowY: 'hidden',
                overflowX: 'scroll',
                overscrollBehaviorX: 'contain',
                overscrollBehaviorY: 'none',
                minHeight: 42,
                paddingTop: 4,
                paddingBottom: 7,
                paddingLeft: '16px',
                paddingRight: '16px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                position: 'relative',
                zIndex: 2,
                cursor: 'grab',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                touchAction: 'none'
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
                  className="btn mb-0 btn-sm menu2-tab-btn"
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
      </div>

      {/* ═══ SCROLLABLE BOTTOM: Content ═══ */}
      <div
        ref={menu2ContentScrollRef}
        className="menu2-content-scroll"
        style={{
          flex: '1 1 auto',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          position: 'relative'
        }}
      >
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
              <div className="py-3">
                <ListSkeleton count={6} label="Загрузка товаров" />
              </div>
            )}

            {!loading && renderCartTotalBanner()}
            {!loading && normalizedCatalogSearch && renderCatalogSearchResults()}

            {!loading && !normalizedCatalogSearch && !isSingleListMode && selectedCategory === null && (
              <div className={hasCartTotalBanner ? 'pt-2 pb-3' : 'py-3'}>
                {renderAdBannerCarousel()}
                {level1Categories.map((level1Category) => {
                  const level2Categories = level2ByLevel1.get(level1Category.id) || [];
                  if (level2Categories.length === 0) return null;

                  return (
                    <section key={level1Category.id} className="mb-4">
                      <h5 className="mb-3 fw-bold" style={{ fontSize: '1.1rem' }}>{getCategoryName(level1Category)}</h5>
                      <Row className="g-3">
                        {level2Categories.map((level2Category) => {
                          const categoryImage = resolveImageUrl(level2Category.image_url);
                          return (
                            <Col key={level2Category.id} xs={6} lg={3}>
                              <button
                                type="button"
                                onClick={() => openLevel2Category(level2Category.id)}
                                className="w-100 border-0 p-0 text-start"
                                style={{
                                  borderRadius: '14px',
                                  overflow: 'hidden',
                                  background: '#ffffff',
                                  position: 'relative',
                                  minHeight: '110px'
                                }}
                              >
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundImage: categoryImage ? `url(${categoryImage})` : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundColor: '#ffffff'
                                  }}
                                />
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
                                      padding: '4px 8px',
                                      borderRadius: 8,
                                      background: 'rgba(255, 255, 255, 0.74)',
                                      backdropFilter: 'blur(2px)',
                                      WebkitBackdropFilter: 'blur(2px)',
                                      color: '#111827',
                                      fontWeight: 700,
                                      fontSize: '0.78rem',
                                      lineHeight: 1.2
                                    }}
                                  >
                                    {getCategoryName(level2Category)}
                                  </span>
                                </div>
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
              (isSingleListMode || (selectedCategory !== null && selectedLevel2Category))
            ) && (
                <div className={hasCartTotalBanner ? 'pt-2 pb-3' : 'py-3'}>
                  {renderAdBannerCarousel()}
                  <>
                    {!isSingleListMode && selectedLevel2Category && (
                      <div className="mb-3">
                        <h6 className="mb-0 fw-bold text-dark">{getCategoryName(selectedLevel2Category)}</h6>
                      </div>
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
                            <Col key={product.id} xs={6} lg={3}>
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

            {!loading && !normalizedCatalogSearch && (isSingleListMode || selectedCategory !== null) && visibleProductSections.length === 0 && (
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
                    <span style={{ opacity: 0.5 }}>📦</span>
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
            <div className="product-details-shell">
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
                    <div className="product-details-hero-empty">📦</div>
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
                        onClick={closeProductDetailsModal}
                        aria-label={language === 'uz' ? 'Yopish' : 'Закрыть'}
                      >
                        <span className="product-details-icon-glyph">×</span>
                      </button>
                    </div>
                  </div>

                  {activeProductGalleryImages.length > 1 && (
                    <div className="product-details-hero-counter">
                      {activeProductGalleryIndex + 1} / {activeProductGalleryImages.length}
                    </div>
                  )}
                </section>

                <section className="product-details-sheet">
                  {productDetailsError && (
                    <div className="alert alert-warning py-2 small mb-3">{productDetailsError}</div>
                  )}

                  <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
                    <div className="min-w-0">
                      <h4 className="mb-1 text-truncate">{activeProductName}</h4>
                      <div className="small text-muted">{activeProduct?.unit || (language === 'uz' ? 'dona' : 'шт')}</div>
                    </div>
                    <span
                      className="badge"
                      style={{
                        background: activeProduct?.in_stock !== false ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.18)',
                        color: activeProduct?.in_stock !== false ? '#166534' : '#475569',
                        border: '1px solid rgba(15,23,42,0.08)'
                      }}
                    >
                      {activeProduct?.in_stock !== false
                        ? (language === 'uz' ? 'Mavjud' : 'В наличии')
                        : (language === 'uz' ? 'Mavjud emas' : 'Нет в наличии')}
                    </span>
                  </div>

                  <div className="fw-bold mb-3" style={{ color: 'var(--primary-color)', fontSize: '2rem', lineHeight: 1.05 }}>
                    {formatPrice(activeProductDisplayPrice)} {t('sum')}
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
                        {activeProductSizeOptions.map((sizeValue) => {
                          const isActiveVariant = String(getSelectedVariantForProduct(activeProduct)).toLowerCase() === String(sizeValue).toLowerCase();
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
                              whiteSpace: 'nowrap'
                              }}
                            >
                              {sizeValue}
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
                        {productReviews.map((review) => (
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

                    {productReviewsHasMore && (
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
                    )}

                    <hr className="my-3" />

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
                    ) : (
                      <div className="small text-muted">
                        {productReviewPermissions.is_authenticated
                          ? (language === 'uz'
                            ? "Komment va baho faqat muvaffaqiyatli yetkazilgan buyurtmadan keyin ochiladi."
                            : 'Оценка и комментарий доступны только после успешно доставленного заказа.')
                          : (language === 'uz'
                            ? "Komment qoldirish uchun tizimga kiring."
                            : 'Войдите в аккаунт, чтобы оставить комментарий.')}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="product-details-bottom-bar">
                <div className="product-details-bottom-inner">
                  {activeProduct?.in_stock !== false ? (
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
                            onClick={() => updateQuantity(activeProduct.id, activeProductQty + activeProductQuantityStep, activeProductSelectedVariant)}
                            aria-label={language === 'uz' ? "Ko'paytirish" : 'Увеличить'}
                          >
                            +
                          </button>
                        </div>
                        <Button
                          type="button"
                          className="product-details-bottom-cta"
                          onClick={() => navigate('/cart')}
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

      {/* Bottom navigation */}
      {!isOperator() && <BottomNav />}

      {/* Spacer for bottom nav */}
      {!isOperator() && <div style={{ height: '70px' }} />}
      </div>
    </div>
  );
}

export default Menu2;
