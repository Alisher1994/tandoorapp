import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useShowcase } from '../context/ShowcaseContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import ClientAccountModal from '../components/ClientAccountModal';
import {
  Grid3Block,
  Grid2Block,
  PatternGridBlock,
  BannerBlock,
  ProductSliderBlock,
  EmptyShowcaseBlock
} from '../components/ShowcaseBlocks';
import './ShowcaseDisplay.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const getShowcaseScrollStorageKey = (restaurantId) => (
  `showcase_scroll:${Number.isInteger(restaurantId) ? restaurantId : 0}`
);

const normalizeId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const extractProductsFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const getCategoryName = (category) => (
  category?.name_ru
  || category?.name_uz
  || category?.name
  || ''
);

const getProductName = (product) => (
  product?.name_ru
  || product?.name_uz
  || product?.name
  || ''
);

const normalizeBooleanLike = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return false;
};

const isUnlimitedGridBlock = (block) => (
  (block?.block_type === 'grid_3' || block?.block_type === 'grid_2')
  && normalizeBooleanLike(
    block?.settings?.unlimitedRows
      ?? block?.settings?.unlimited_rows
      ?? block?.settings?.isUnlimited
      ?? block?.settings?.is_unlimited
  )
);

const getGridColumns = (block) => {
  const explicitColumns = Number.parseInt(
    block?.settings?.columns
      ?? block?.settings?.gridColumns,
    10
  );
  if (Number.isInteger(explicitColumns) && explicitColumns > 0) return explicitColumns;
  return block?.block_type === 'grid_2' ? 2 : 3;
};

const getGridLimitFromBlock = (block) => {
  if (isUnlimitedGridBlock(block)) return null;
  const settingsLimit = Number.parseInt(block?.settings?.maxCategories, 10);
  if (Number.isInteger(settingsLimit) && settingsLimit > 0) return settingsLimit;
  return block?.block_type === 'grid_2' ? 2 : 3;
};

const parseRowPattern = (rawValue) => {
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim();
    if (!normalized) return [];
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return normalized
        .split(/[+,xX;|/ ]+/)
        .map((part) => Number.parseInt(part, 10))
        .filter((value) => Number.isInteger(value) && value > 0);
    }
  }
  return [];
};

const getGridRowPattern = (block, categoryCount = null) => {
  const totalCategories = Number.isInteger(categoryCount) && categoryCount >= 0
    ? categoryCount
    : (Array.isArray(block?.content) ? block.content.length : 0);
  if (isUnlimitedGridBlock(block)) {
    const columns = getGridColumns(block);
    if (columns <= 0) return [];
    const totalSlots = Math.max(columns, totalCategories);
    const resolved = [];
    let remaining = totalSlots;
    while (remaining > 0) {
      const take = Math.min(columns, remaining);
      resolved.push(take);
      remaining -= take;
    }
    return resolved;
  }

  const limit = getGridLimitFromBlock(block);
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const rawPattern = parseRowPattern(block?.settings?.rowPattern);
  const normalized = rawPattern
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (normalized.length === 0) return [limit];

  let remaining = limit;
  const resolved = [];
  normalized.forEach((value) => {
    if (remaining <= 0) return;
    const take = Math.min(value, remaining);
    if (take > 0) {
      resolved.push(take);
      remaining -= take;
    }
  });
  if (remaining > 0) resolved.push(remaining);
  return resolved.length > 0 ? resolved : [limit];
};

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

const resolveLogoUrl = (logoUrl) => (
  !logoUrl
    ? ''
    : (String(logoUrl).startsWith('http')
      ? logoUrl
      : `${API_URL.replace('/api', '')}${logoUrl}`)
);

function ShowcaseDisplay() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart } = useCart();
  const { showcaseLayout, showcaseLoading, showcaseVisible, loadShowcase, showcaseError } = useShowcase();
  const { t, language } = useLanguage();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSearchField, setShowSearchField] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const showcaseContentRef = useRef(null);
  const hasRestoredShowcaseScrollRef = useRef(false);
  const activeRestaurantId = normalizeId(user?.active_restaurant_id);
  const showcaseScrollStorageKey = getShowcaseScrollStorageKey(activeRestaurantId);

  const getShowcaseScrollContainer = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;

    const showcaseContentNode = showcaseContentRef.current;
    if (showcaseContentNode && showcaseContentNode.scrollHeight > showcaseContentNode.clientHeight + 2) {
      return showcaseContentNode;
    }

    const rootNode = document.getElementById('root');
    if (rootNode) {
      const style = window.getComputedStyle(rootNode);
      const overflowRule = `${style.overflow || ''} ${style.overflowY || ''}`.toLowerCase();
      const canScrollVertically = /(auto|scroll|overlay)/.test(overflowRule);
      if (canScrollVertically && rootNode.scrollHeight > rootNode.clientHeight + 2) {
        return rootNode;
      }
    }

    return window;
  };

  const readShowcaseScrollOffset = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
    const scrollContainer = getShowcaseScrollContainer();
    if (!scrollContainer || scrollContainer === window) {
      return window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || 0;
    }
    return scrollContainer.scrollTop || 0;
  };

  const writeShowcaseScrollOffset = (offsetTop) => {
    if (typeof window === 'undefined') return;
    const targetOffset = Math.max(0, Number(offsetTop) || 0);
    const scrollContainer = getShowcaseScrollContainer();
    if (!scrollContainer || scrollContainer === window) {
      window.scrollTo({ top: targetOffset, behavior: 'auto' });
      return;
    }
    scrollContainer.scrollTop = targetOffset;
  };

  const persistShowcaseScroll = () => {
    if (!activeRestaurantId || typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      showcaseScrollStorageKey,
      String(Math.max(0, Math.round(readShowcaseScrollOffset())))
    );
  };

  // Load categories and products
  useEffect(() => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const [categoriesRes, productsRes] = await Promise.all([
          axios.get(`${API_URL}/products/restaurants/${restaurantId}/categories`),
          axios.get(`${API_URL}/products`, { params: { restaurant_id: restaurantId } })
        ]);

        const categoryList = Array.isArray(categoriesRes.data)
          ? categoriesRes.data
          : (Array.isArray(categoriesRes.data?.categories) ? categoriesRes.data.categories : []);
        const productList = extractProductsFromResponse(productsRes.data);
        const isProductVisible = (product) => product?.is_active !== false;
        const visibleProducts = productList.filter(isProductVisible);

        // Filter categories that have at least one visible product
        const activeCategories = categoryList.filter(cat =>
          visibleProducts.some(prod =>
            normalizeId(prod?.category_id) === normalizeId(cat?.id)
          )
        );

        setCategories(activeCategories);
        setProducts(visibleProducts);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.active_restaurant_id]);

  // Load showcase layout
  useEffect(() => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;
    loadShowcase(restaurantId);
  }, [user?.active_restaurant_id, loadShowcase]);

  useEffect(() => {
    if (!showcaseLoading && showcaseVisible === false) {
      navigate('/catalog', { replace: true });
    }
  }, [showcaseVisible, showcaseLoading, navigate]);

  useEffect(() => {
    hasRestoredShowcaseScrollRef.current = false;
  }, [activeRestaurantId]);

  useEffect(() => {
    if (!activeRestaurantId || hasRestoredShowcaseScrollRef.current) return undefined;
    if (loading || showcaseLoading) return undefined;
    if (typeof window === 'undefined') return undefined;

    hasRestoredShowcaseScrollRef.current = true;
    const rawValue = window.sessionStorage.getItem(showcaseScrollStorageKey);
    const savedScroll = Number.parseInt(rawValue || '0', 10);
    if (!Number.isInteger(savedScroll) || savedScroll <= 0) return undefined;

    const timeoutIds = [];
    let rafId = 0;
    const restorePosition = () => {
      writeShowcaseScrollOffset(savedScroll);
    };

    rafId = window.requestAnimationFrame(() => {
      restorePosition();
    });
    [90, 220, 420, 760].forEach((delay) => {
      timeoutIds.push(window.setTimeout(restorePosition, delay));
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [activeRestaurantId, showcaseScrollStorageKey, loading, showcaseLoading, showcaseLayout.length]);

  useEffect(() => {
    if (!activeRestaurantId || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const handleScroll = () => {
      window.sessionStorage.setItem(
        showcaseScrollStorageKey,
        String(Math.max(0, Math.round(readShowcaseScrollOffset())))
      );
    };

    const scrollTargets = [
      showcaseContentRef.current,
      document.getElementById('root'),
      window
    ].filter(Boolean);
    const uniqueTargets = [...new Set(scrollTargets)];

    uniqueTargets.forEach((target) => {
      target.addEventListener('scroll', handleScroll, { passive: true });
    });

    return () => {
      handleScroll();
      uniqueTargets.forEach((target) => {
        target.removeEventListener('scroll', handleScroll);
      });
    };
  }, [activeRestaurantId, showcaseScrollStorageKey]);

  const handleCategoryClick = (categoryId) => {
    persistShowcaseScroll();
    navigate('/showcase/catalog', {
      state: {
        selectedCategoryId: categoryId,
        navigationSource: 'showcase'
      }
    });
  };

  const handleProductClick = (product) => {
    persistShowcaseScroll();
    navigate('/showcase/catalog', {
      state: {
        selectedProductId: product.id,
        navigationSource: 'showcase'
      }
    });
  };

  const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter((product) => getProductName(product).toLowerCase().includes(normalizedSearch))
    : products;
  const searchableCategoryIds = new Set(
    filteredProducts
      .map((product) => normalizeId(product?.category_id))
      .filter((id) => Number.isInteger(id))
  );
  const filteredCategories = normalizedSearch
    ? categories.filter((category) => {
      const categoryName = getCategoryName(category).toLowerCase();
      return categoryName.includes(normalizedSearch) || searchableCategoryIds.has(normalizeId(category?.id));
    })
    : categories;

  const renderBlock = (block) => {
    const blockTitle = String(block?.settings?.title || block?.title || '').trim();
    const blockLayoutVariant = String(block?.settings?.layoutVariant || '').trim();
    const hideCategoryTitleBackground = block?.settings?.hideCategoryTitleBackground === true;
    const content = Array.isArray(block.content) ? block.content : [];
    const limit = block.block_type === 'grid_3' || block.block_type === 'grid_2'
      ? getGridLimitFromBlock(block)
      : null;
    const categoryIds = Number.isInteger(limit) ? content.slice(0, limit) : content;
    const rowPattern = block.block_type === 'grid_3' || block.block_type === 'grid_2'
      ? getGridRowPattern(block, categoryIds.length)
      : [];
    const blockCategories = categoryIds
      .map(catId => filteredCategories.find(c => normalizeId(c?.id) === normalizeId(catId)))
      .filter(Boolean);

    switch (block.block_type) {
      case 'grid_3':
        if (rowPattern.length > 1) {
          return (
            <PatternGridBlock
              key={block.id}
              categories={blockCategories}
              rowPattern={rowPattern}
              products={filteredProducts}
              cartItems={cart}
              onCategoryClick={handleCategoryClick}
              categoryImageFallback={user?.active_restaurant_logo || ''}
              blockTitle={blockTitle}
              layoutVariant={blockLayoutVariant}
              hideCategoryTitleBackground={hideCategoryTitleBackground}
            />
          );
        }
        return (
          <Grid3Block
            key={block.id}
            categories={blockCategories}
            products={filteredProducts}
            cartItems={cart}
            onCategoryClick={handleCategoryClick}
            categoryImageFallback={user?.active_restaurant_logo || ''}
            blockTitle={blockTitle}
            hideCategoryTitleBackground={hideCategoryTitleBackground}
          />
        );
      case 'grid_2':
        if (rowPattern.length > 1) {
          return (
            <PatternGridBlock
              key={block.id}
              categories={blockCategories}
              rowPattern={rowPattern}
              products={filteredProducts}
              cartItems={cart}
              onCategoryClick={handleCategoryClick}
              categoryImageFallback={user?.active_restaurant_logo || ''}
              blockTitle={blockTitle}
              layoutVariant={blockLayoutVariant}
              hideCategoryTitleBackground={hideCategoryTitleBackground}
            />
          );
        }
        return (
          <Grid2Block
            key={block.id}
            categories={blockCategories}
            products={filteredProducts}
            cartItems={cart}
            onCategoryClick={handleCategoryClick}
            categoryImageFallback={user?.active_restaurant_logo || ''}
            blockTitle={blockTitle}
            hideCategoryTitleBackground={hideCategoryTitleBackground}
          />
        );
      case 'banner':
        return (
          <BannerBlock
            key={block.id}
            block={block}
            onBannerClick={() => {
              // Handle banner click - could navigate to a promo or product
              const bannerCategories = Array.isArray(block.content) ? block.content : [];
              if (bannerCategories.length > 0) {
                handleCategoryClick(bannerCategories[0]);
              }
            }}
          />
        );
      case 'slider':
        return (
          <ProductSliderBlock
            key={block.id}
            categoryId={block.category_id}
            categories={filteredCategories}
            products={filteredProducts}
            cartItems={cart}
            onProductClick={handleProductClick}
            onCategoryClick={handleCategoryClick}
          />
        );
      default:
        return null;
    }
  };

  if (loading && showcaseLoading) {
    return (
      <div className="showcase-display-loading">
        <Spinner animation="border" />
        <p>Загрузка витрины...</p>
      </div>
    );
  }

  return (
    <div className="showcase-display-container">
      <Navbar
        expand="lg"
        className="mb-0 showcase-header-shell"
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
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid var(--border-color)'
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
            <div style={{ width: '40px', height: '40px' }} aria-hidden="true" />
          </div>

          <Navbar.Brand className="d-flex align-items-center justify-content-center mx-auto mb-0">
            {resolveLogoUrl(user?.active_restaurant_logo) ? (
              (() => {
                const logoFrame = getRestaurantLogoFrame(user?.active_restaurant_logo_display_mode);
                return (
                  <div style={logoFrame.box}>
                    <img
                      src={resolveLogoUrl(user?.active_restaurant_logo)}
                      alt={user?.active_restaurant_name || 'Магазин'}
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
              onClick={() => setShowAccountModal(true)}
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
              onClick={() => setShowSearchField((prev) => !prev)}
              aria-label={language === 'uz' ? 'Qidiruv' : 'Поиск'}
              title={language === 'uz' ? 'Qidiruv' : 'Поиск'}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 12,
                border: showSearchField || normalizedSearch
                  ? '1px solid rgba(71, 85, 105, 0.22)'
                  : '1px solid transparent',
                background: showSearchField || normalizedSearch
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
          </div>
        </div>

        <div
          className="px-3 mx-auto"
          style={{
            maxWidth: '1280px',
            width: '100%',
            overflow: 'hidden',
            maxHeight: showSearchField ? 88 : 0,
            opacity: showSearchField ? 1 : 0,
            transform: `translateY(${showSearchField ? 0 : -8}px)`,
            transition: 'max-height 0.28s ease, opacity 0.22s ease, transform 0.28s ease',
            pointerEvents: showSearchField ? 'auto' : 'none'
          }}
        >
          <div style={{ padding: '0 0 10px' }}>
            <input
              type="text"
              className="showcase-header-search-input"
              placeholder={language === 'uz' ? 'Tovar qidirish...' : 'Поиск товара...'}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </Navbar>

      <div ref={showcaseContentRef} className="showcase-content">
        <Container fluid className="showcase-inner">
          {error && (
            <div className="alert alert-warning" role="alert">
              {error}
            </div>
          )}
          {showcaseError && (
            <div className="alert alert-warning" role="alert">
              {showcaseError}
            </div>
          )}

          {showcaseLayout.length === 0 ? (
            <EmptyShowcaseBlock />
          ) : (
            <div className="showcase-blocks">
              {showcaseLayout.map(block => renderBlock(block))}
            </div>
          )}
        </Container>
      </div>

      <BottomNav />
      <ClientAccountModal
        show={showAccountModal}
        onHide={() => setShowAccountModal(false)}
      />
    </div>
  );
}

export default ShowcaseDisplay;
