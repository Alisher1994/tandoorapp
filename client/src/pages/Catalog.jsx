import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Navbar from 'react-bootstrap/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCart, formatPrice } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import HeartIcon from '../components/HeartIcon';
import { ListSkeleton, PageSkeleton } from '../components/SkeletonUI';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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

function Catalog() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [prevRestaurant, setPrevRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [adBanners, setAdBanners] = useState([]);
  const [activeAdIndex, setActiveAdIndex] = useState(0);
  const [entryPopupBanner, setEntryPopupBanner] = useState(null);
  const [showEntryPopupModal, setShowEntryPopupModal] = useState(false);
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
  const [loading, setLoading] = useState(true);
  const { user, isOperator } = useAuth();
  const { addToCart, updateQuantity, clearCart, cart, cartTotal } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { language, toggleLanguage } = useLanguage();
  const navigate = useNavigate();

  const productGroupRefs = useRef({});
  const viewedAdsRef = useRef(new Set());
  const catalogHeaderRef = useRef(null);
  const catalogSearchInputRef = useRef(null);
  const categoryListScrollOffsetRef = useRef(0);
  const isDataFetchInProgressRef = useRef(false);
  const catalogFetchIdRef = useRef(0);
  const level3TabsScrollerRef = useRef(null);
  const level3TabButtonRefs = useRef({});
  const tabScrollSpyRafRef = useRef(null);
  const scrollProgressRafRef = useRef(null);
  const tabScrollLockTimeoutRef = useRef(null);
  const isTabAutoScrollRef = useRef(false);
  const catalogHeaderBackground = '#f8fafc';

  // Load restaurants (for header/logo and operator selection)
  useEffect(() => {
    fetchRestaurants();
  }, []);

  // For customers: lock to active_restaurant_id from bot
  useEffect(() => {
    if (!isOperator() && user?.active_restaurant_id) {
      setSelectedRestaurant(user.active_restaurant_id);
    }
  }, [user]);

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

  const getScrollContainer = () => document.getElementById('root') || window;
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

  const resolveImageUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_URL.replace('/api', '')}${url}`;
  };
  const getProductGalleryImages = (product) => {
    const result = [];
    const seen = new Set();
    const addImage = (value) => {
      const resolved = resolveImageUrl(value);
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      result.push(resolved);
    };

    addImage(product?.image_url);

    let rawImages = product?.product_images;
    if (typeof rawImages === 'string') {
      try {
        rawImages = JSON.parse(rawImages);
      } catch (error) {
        rawImages = [];
      }
    }

    if (Array.isArray(rawImages)) {
      rawImages.forEach((item) => {
        if (typeof item === 'string') {
          addImage(item);
          return;
        }
        if (item && typeof item === 'object') {
          addImage(item.url || item.image_url);
        }
      });
    }

    if (!result.length) addImage(product?.thumb_url);
    return result;
  };

  const preloadImage = (url) => new Promise((resolve) => {
    if (!url || typeof window === 'undefined') {
      resolve();
      return;
    }
    const img = new window.Image();
    const done = () => {
      img.onload = null;
      img.onerror = null;
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
    if (img.complete) done();
  });

  const preloadProductCardImages = async (productsList = []) => {
    const uniqueImageUrls = [];
    const seen = new Set();

    productsList.forEach((product) => {
      const galleryImages = getProductGalleryImages(product);
      const productCardImage = galleryImages[0] || resolveImageUrl(product?.thumb_url || product?.image_url);
      if (!productCardImage || seen.has(productCardImage)) return;
      seen.add(productCardImage);
      uniqueImageUrls.push(productCardImage);
    });

    await Promise.all(uniqueImageUrls.map((url) => preloadImage(url)));
  };

  const openProductGallery = (product, startIndex = 0) => {
    const images = getProductGalleryImages(product);
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

  const fetchRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/products/restaurants/list`);
      setRestaurants(response.data || []);

      // Auto-select for operators if not set
      if (isOperator()) {
        if (response.data?.length === 1) {
          setSelectedRestaurant(response.data[0].id);
        } else if (response.data?.length > 0 && !selectedRestaurant) {
          setSelectedRestaurant(response.data[0].id);
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
      const [categoriesRes, productsRes, adsRes] = await Promise.all([
        axios.get(`${API_URL}/products/categories?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products/ads-banners?restaurant_id=${selectedRestaurant}`)
      ]);

      const nextCategories = (categoriesRes.data || []).sort((a, b) => {
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

      // Keep skeleton visible until all product card images are fully loaded (or failed).
      await preloadProductCardImages(nextProducts);

      if (fetchId !== catalogFetchIdRef.current) return;

      setCategories(nextCategories);
      setProducts(nextProducts);
      setAdBanners(nextAdBanners);
      setActiveAdIndex(0);
      viewedAdsRef.current = new Set();
    } catch (error) {
      if (fetchId !== catalogFetchIdRef.current) return;
      console.error('Error fetching data:', error);
      setCategories([]);
      setProducts([]);
      setAdBanners([]);
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

  const handleAddToCart = (product) => {
    addToCart({
      ...product,
      restaurant_id: selectedRestaurant
    });
  };

  const handleToggleFavorite = (product) => {
    toggleFavorite({
      ...product,
      restaurant_id: selectedRestaurant
    });
  };

  const getCartItem = (productId) => cart.find(item => item.id === productId);

  const categoriesById = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      const key = category.parent_id ?? null;
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
        .map((product) => Number(product.category_id))
        .filter((id) => Number.isFinite(id))
    )
  ), [products]);

  const normalizedCatalogSearch = useMemo(
    () => String(catalogSearchQuery || '').trim().toLowerCase(),
    [catalogSearchQuery]
  );

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
    if (!normalizedCatalogSearch) return [];
    return products
      .filter((product) => {
        const ru = String(product?.name_ru || '').toLowerCase();
        const uz = String(product?.name_uz || '').toLowerCase();
        return ru.includes(normalizedCatalogSearch) || uz.includes(normalizedCatalogSearch);
      })
      .sort((a, b) => {
        const aName = String(getProductName(a) || '').toLowerCase();
        const bName = String(getProductName(b) || '').toLowerCase();
        const aStarts = aName.startsWith(normalizedCatalogSearch) ? 0 : 1;
        const bStarts = bName.startsWith(normalizedCatalogSearch) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return aName.localeCompare(bName, language === 'uz' ? 'uz' : 'ru');
      });
  }, [products, normalizedCatalogSearch, language, categoriesById]);

  const inlineAdBanners = useMemo(
    () => (adBanners || []).filter((banner) => String(banner?.ad_type || 'banner').toLowerCase() !== 'entry_popup'),
    [adBanners]
  );

  const entryPopupBanners = useMemo(
    () => (adBanners || []).filter((banner) => String(banner?.ad_type || 'banner').toLowerCase() === 'entry_popup'),
    [adBanners]
  );

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
    return categoriesById.get(Number(selectedCategory)) || null;
  }, [selectedCategory, categoriesById]);

  const level3Categories = useMemo(() => {
    if (!selectedLevel2Category) return [];
    return (childrenByParent.get(selectedLevel2Category.id) || []).filter((category) => nonEmptyCategoryIds.has(category.id));
  }, [childrenByParent, nonEmptyCategoryIds, selectedLevel2Category]);

  const directSelectedProducts = useMemo(() => {
    if (!selectedLevel2Category) return [];
    return products.filter((product) => Number(product.category_id) === selectedLevel2Category.id);
  }, [products, selectedLevel2Category]);

  const level3Sections = useMemo(() => (
    level3Categories
      .map((category) => ({
        id: category.id,
        title: getCategoryName(category),
        products: products.filter((product) => Number(product.category_id) === category.id)
      }))
      .filter((section) => section.products.length > 0)
  ), [level3Categories, products, language]);

  const hasLevel3Sections = level3Sections.length > 0;

  const level3Tabs = useMemo(() => (
    hasLevel3Sections ? level3Sections : []
  ), [hasLevel3Sections, level3Sections]);

  useEffect(() => {
    level3TabButtonRefs.current = {};
  }, [selectedCategory, level3Tabs]);

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

  useEffect(() => {
    productGroupRefs.current = {};
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedCategory || level3Tabs.length === 0) {
      setActiveSubcategoryTab(null);
      return;
    }
    setActiveSubcategoryTab(level3Tabs[0].id);
  }, [selectedCategory, level3Tabs]);

  useEffect(() => {
    if (!activeSubcategoryTab) return;
    const tabsScroller = level3TabsScrollerRef.current;
    const activeTabButton = level3TabButtonRefs.current[activeSubcategoryTab];
    if (!tabsScroller || !activeTabButton) return;
    const targetLeft = activeTabButton.offsetLeft - ((tabsScroller.clientWidth - activeTabButton.offsetWidth) / 2);
    tabsScroller.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth'
    });
  }, [activeSubcategoryTab, level3Tabs]);

  useEffect(() => {
    if (selectedCategory === null || level3Tabs.length === 0 || normalizedCatalogSearch || loading) {
      return undefined;
    }

    const scrollContainer = getScrollContainer();
    const scrollTarget = scrollContainer === window ? window : scrollContainer;
    const stickyOffset = Math.max(56, catalogHeaderHeight);

    const detectVisibleSection = () => {
      if (isTabAutoScrollRef.current) return;
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 700;
      const sectionProbeLine = Math.max(
        stickyOffset + 16,
        Math.min(stickyOffset + 120, viewportHeight * 0.45)
      );
      let currentId = null;
      let firstId = null;

      level3Tabs.forEach((section) => {
        const sectionElement = productGroupRefs.current[section.id];
        if (!sectionElement) return;
        const sectionTop = sectionElement.getBoundingClientRect().top;
        if (firstId === null) firstId = section.id;
        if (sectionTop <= sectionProbeLine) currentId = section.id;
      });

      const nextActiveId = currentId ?? firstId;
      if (nextActiveId && nextActiveId !== activeSubcategoryTab) {
        setActiveSubcategoryTab(nextActiveId);
      }
    };

    const onScroll = () => {
      if (tabScrollSpyRafRef.current) return;
      tabScrollSpyRafRef.current = requestAnimationFrame(() => {
        tabScrollSpyRafRef.current = null;
        detectVisibleSection();
      });
    };

    detectVisibleSection();
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (tabScrollSpyRafRef.current) {
        cancelAnimationFrame(tabScrollSpyRafRef.current);
        tabScrollSpyRafRef.current = null;
      }
    };
  }, [selectedCategory, level3Tabs, activeSubcategoryTab, normalizedCatalogSearch, loading, catalogHeaderHeight]);

  useEffect(() => {
    if (!selectedRestaurant || loading) {
      setCatalogScrollProgress(0);
      return undefined;
    }

    const scrollContainer = getScrollContainer();
    const scrollTarget = scrollContainer === window ? window : scrollContainer;

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
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (scrollProgressRafRef.current) {
        cancelAnimationFrame(scrollProgressRafRef.current);
        scrollProgressRafRef.current = null;
      }
    };
  }, [selectedRestaurant, loading, selectedCategory, normalizedCatalogSearch, productSections.length]);

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
    const sectionElement = productGroupRefs.current[sectionId];
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
    setActiveSubcategoryTab(sectionId);
    scrollToOffset(topOffset);
    tabScrollLockTimeoutRef.current = setTimeout(() => {
      isTabAutoScrollRef.current = false;
    }, 450);
  };

  const currentRestaurant = restaurants.find(r => r.id === selectedRestaurant);

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
    const cartItem = getCartItem(product.id);
    const hasQty = !!cartItem;
    const qty = cartItem?.quantity || 0;
    const overlayKey = `qty_open_${product.id}`;
    const isOpen = catalogQtyOpen?.[overlayKey];
    const favoriteActive = isFavorite(product.id);
    const productName = getProductName(product);
    const productGallery = getProductGalleryImages(product);
    const primaryImageUrl = productGallery[0] || '';

    return (
      <Card className="h-100 shadow-sm border-0">
        <div style={{ position: 'relative' }}>
          {primaryImageUrl ? (
            <Card.Img
              variant="top"
              src={primaryImageUrl}
              alt={productName}
              style={{ height: '140px', objectFit: 'cover', cursor: 'zoom-in' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openProductGallery(product, 0);
              }}
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/150?text=No+Image';
              }}
            />
          ) : (
            <div
              style={{ height: '140px', background: '#f8f9fa' }}
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
          {product.in_stock && (
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
                        width: 32,
                        height: 32,
                        fontSize: '18px',
                        fontWeight: 'bold',
                        padding: 0
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
                      +
                    </button>
                  ) : (
                    <span
                      className="rounded-circle d-inline-flex align-items-center justify-content-center shadow"
                      style={{
                        width: 32,
                        height: 32,
                        background: 'var(--accent-color, #FFD700)',
                        color: '#1a1a1a',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
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
                    minWidth: '90px'
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
                    style={{ width: 28, height: 28, fontSize: '16px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(product.id, qty - 1);
                    }}
                  >
                    −
                  </button>
                  <span className="fw-bold px-2" style={{ fontSize: '14px' }}>{qty}</span>
                  <button
                    type="button"
                    className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                    style={{ width: 28, height: 28, fontSize: '16px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(product.id, qty + 1);
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
          <div className="fw-bold mt-auto" style={{ fontSize: '0.9rem', color: 'var(--primary-color)' }}>
            {formatPrice(product.price)} {language === 'uz' ? "so'm" : 'сум'}
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
          </div>
          {inlineAdBanners.length > 1 && (
            <div className="d-flex justify-content-center align-items-center gap-1 py-2" style={{ background: '#fff' }}>
              {inlineAdBanners.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveAdIndex(idx)}
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
          {formatPrice(cartTotal || 0)} {language === 'uz' ? "so'm" : 'сум'}
        </span>
      </button>
    </div>
    );
  };

  const openProductFromSearch = (product) => {
    const level2CategoryId = getLevel2CategoryIdForProduct(product);
    if (level2CategoryId) {
      categoryListScrollOffsetRef.current = getCurrentScrollOffset();
      setSelectedCategory(level2CategoryId);
      setActiveSubcategoryTab(null);
      scrollToTop();
    }
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
              const productGallery = getProductGalleryImages(product);
              const imageUrl = productGallery[0] || resolveImageUrl(product.thumb_url || product.image_url);
              const category = categoriesById.get(Number(product.category_id));
              const cartItem = getCartItem(product.id);
              const qty = cartItem?.quantity || 0;
              const isAvailable = product.in_stock !== false;
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
                        openProductGallery(product, 0);
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
                        cursor: 'zoom-in'
                      }}
                      aria-label={language === 'uz' ? 'Rasmni ochish' : 'Открыть фото'}
                    >
                      <img src={imageUrl} alt={productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                      qty > 0 ? (
                        <div
                          className="d-flex align-items-center justify-content-between rounded-pill px-1"
                          style={{
                            background: 'rgba(71, 85, 105,0.10)',
                            border: '1px solid rgba(71, 85, 105,0.2)',
                            minWidth: 90,
                            height: 32
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-sm p-0 d-flex align-items-center justify-content-center border-0 bg-transparent"
                            style={{ width: 26, height: 26, color: '#4b5563', fontSize: '16px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(product.id, qty - 1);
                            }}
                            aria-label={language === 'uz' ? 'Kamaytirish' : 'Уменьшить'}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.86rem', minWidth: 18, textAlign: 'center' }}>
                            {qty}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm p-0 d-flex align-items-center justify-content-center border-0 bg-transparent"
                            style={{ width: 26, height: 26, color: 'var(--primary-color)', fontSize: '16px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(product.id, qty + 1);
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
                            minWidth: 90,
                            height: 32,
                            background: 'var(--primary-color)',
                            border: '1px solid var(--primary-color)',
                            color: '#fff'
                          }}
                        >
                          +
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
                      {formatPrice(product.price)} {language === 'uz' ? "so'm" : 'сум'}
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

  return (
    <>
      <Navbar
        ref={catalogHeaderRef}
        expand="lg"
        className="mb-0"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1010,
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          backgroundColor: catalogHeaderBackground,
          borderBottom: selectedRestaurant && selectedCategory !== null && level3Tabs.length > 0
            ? 'none'
            : '1px solid var(--border-color)'
        }}
      >
        <div className="d-flex justify-content-between align-items-center w-100 px-3">
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

          {/* Center logo */}
          <Navbar.Brand className="d-flex align-items-center justify-content-center mx-auto">
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

          {/* Language switcher with flag + label */}
          <button
            onClick={toggleLanguage}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title={language === 'ru' ? 'Ўзбекча' : 'Русский'}
          >
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#4b5563',
                letterSpacing: '0.04em',
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '20px',
                textShadow: 'none'
              }}
            >
              {language === 'ru' ? 'RU' : 'UZ'}
            </span>
            <img
              src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
              alt={language === 'ru' ? 'RU' : 'UZ'}
              style={{ width: '28px', height: '20px', objectFit: 'cover', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
            />
          </button>
        </div>

        <div
          className="px-3"
          style={{
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
            display: selectedRestaurant && selectedCategory !== null && level3Tabs.length > 0 ? 'block' : 'none',
            backgroundColor: catalogHeaderBackground,
            borderBottom: 'none',
            boxShadow: 'none'
          }}
        >
          <div
            ref={level3TabsScrollerRef}
            style={{
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              padding: '6px 12px 7px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {level3Tabs.map((section) => (
              <Button
                ref={(el) => {
                  if (el) level3TabButtonRefs.current[section.id] = el;
                }}
                key={section.id}
                variant="light"
                className="me-2 mb-0"
                size="sm"
                style={{
                  border: 'none',
                  boxShadow: 'none',
                  borderRadius: 8,
                  minHeight: 32,
                  padding: '6px 12px',
                  fontSize: '0.9rem',
                  fontWeight: activeSubcategoryTab === section.id ? 500 : 400,
                  color: activeSubcategoryTab === section.id ? '#ffffff' : '#526277',
                  background: activeSubcategoryTab === section.id
                    ? 'linear-gradient(180deg, #66768e 0%, #4f6078 100%)'
                    : 'rgba(255, 255, 255, 0.88)',
                  transition: 'background 0.2s ease, color 0.2s ease'
                }}
                onClick={() => scrollToProductGroup(section.id)}
              >
                {section.title}
              </Button>
            ))}
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

            {!loading && !normalizedCatalogSearch && selectedCategory === null && (
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
                            <Col key={level2Category.id} xs={6}>
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
                                     backgroundSize: categoryImage ? 'contain' : 'cover',
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
                                      padding: '6px 10px 0',
                                      color: '#111827',
                                      fontWeight: 700,
                                      fontSize: '0.78rem',
                                     lineHeight: 1.2
                                   }}
                                  >
                                    {getCategoryName(level2Category)}
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

            {!loading && !normalizedCatalogSearch && selectedCategory !== null && selectedLevel2Category && (
              <div className={hasCartTotalBanner ? 'pt-2 pb-3' : 'py-3'}>
                {renderAdBannerCarousel()}
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <Button variant="outline-secondary" size="sm" onClick={closeLevel2Category}>
                    {language === 'uz' ? 'Orqaga' : 'Назад'}
                  </Button>
                  <h6 className="mb-0 fw-bold text-dark text-end ms-3">{getCategoryName(selectedLevel2Category)}</h6>
                </div>

                {productSections.map((section) => (
                  <section
                    key={section.id}
                    ref={(el) => { productGroupRefs.current[section.id] = el; }}
                    className="mb-4"
                  >
                    <h6 className="mb-3 text-muted fw-bold">{section.title}</h6>
                    <Row className="g-3">
                      {section.products.map((product) => (
                        <Col key={product.id} xs={6}>
                          {renderProductCard(product)}
                        </Col>
                      ))}
                    </Row>
                  </section>
                ))}
              </div>
            )}

            {!loading && !normalizedCatalogSearch && selectedCategory === null && level1Categories.length === 0 && (
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

            {!loading && !normalizedCatalogSearch && selectedCategory !== null && productSections.length === 0 && (
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

      <Modal show={showGalleryModal} onHide={closeProductGallery} centered size="lg" className="product-gallery-modal">
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 text-truncate">
            {galleryProductName || (language === 'uz' ? 'Mahsulot galereyasi' : 'Галерея товара')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="product-gallery-modal-body">
          {galleryImages.length > 0 && (
            <div className="product-gallery-frame">
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
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={showNextGalleryImage}
                    aria-label={language === 'uz' ? 'Keyingi rasm' : 'Следующее фото'}
                    className="product-gallery-nav-btn product-gallery-nav-btn-next"
                  >
                    ›
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
    </>
  );
}

export default Catalog;
