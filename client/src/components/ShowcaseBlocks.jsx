import React from 'react';
import './ShowcaseBlocks.css';
import { formatPrice } from '../context/CartContext';

const getCategoryName = (category) => (
  category?.name_ru
  || category?.name_uz
  || category?.name
  || ''
);

const getCategoryImage = (category) => (
  category?.image
  || category?.icon_url
  || category?.image_url
  || ''
);

const getProductName = (product) => (
  product?.name_ru
  || product?.name_uz
  || product?.name
  || ''
);

const getProductImage = (product) => (
  product?.thumb_url
  || product?.image_url
  || product?.image
  || '/placeholder.png'
);
const getProductPriceMeta = (product) => {
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

const normalizeId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const normalizeRowPattern = (rowPattern = [], fallback = 3) => {
  const normalized = Array.isArray(rowPattern)
    ? rowPattern
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  return normalized.length > 0 ? normalized : [Math.max(1, Number.parseInt(fallback, 10) || 3)];
};

const getDisplayBlockTitle = (title) => String(title || '').trim();

const createCategoryCartBadgeResolver = (products = [], cartItems = []) => (categoryId) => {
  const normalizedCategoryId = normalizeId(categoryId);
  const total = cartItems
    .filter(item => {
      const product = products.find(p => p.id === item.product_id);
      return normalizeId(product?.category_id) === normalizedCategoryId;
    })
    .reduce((sum, item) => sum + item.quantity, 0);
  return total > 0 ? total : null;
};

const renderCategoryImage = (category, fallbackLogo, imageClassName) => {
  const primarySrc = getCategoryImage(category);
  const fallbackSrc = fallbackLogo || '/placeholder.png';
  const initialSrc = primarySrc || fallbackSrc;
  const initialFallback = !primarySrc;

  return (
    <img
      src={initialSrc}
      alt={getCategoryName(category)}
      className={`${imageClassName}${initialFallback ? ' category-image-logo-fallback' : ''}`}
      onError={(event) => {
        const img = event.currentTarget;
        if (img.dataset.fallbackApplied === '1') return;
        img.dataset.fallbackApplied = '1';
        img.src = fallbackSrc;
        img.classList.add('category-image-logo-fallback');
      }}
    />
  );
};

/**
 * Grid3Block - 3 columns layout with small icons
 * Perfect for quick categories like "Готовая еда", "Кофейня"
 */
export function Grid3Block({
  categories = [],
  products = [],
  onCategoryClick,
  cartItems = [],
  categoryImageFallback = '',
  blockTitle = '',
  hideCategoryTitleBackground = false
}) {
  const getCartBadge = createCategoryCartBadgeResolver(products, cartItems);
  const titleText = getDisplayBlockTitle(blockTitle);

  return (
    <div className={`showcase-block grid-3-block${hideCategoryTitleBackground ? ' no-title-bg' : ''}`}>
      {titleText && <h3 className="showcase-block-title">{titleText}</h3>}
      <div className="grid-3-container">
        {categories.map((category) => {
          const hasCategoryImage = Boolean(getCategoryImage(category));
          return (
            <div
              key={category.id}
              className="grid-3-item"
              onClick={() => onCategoryClick?.(category.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onCategoryClick?.(category.id);
                }
              }}
            >
              <div className={`grid-3-image-wrapper${!hasCategoryImage ? ' category-logo-fallback-wrapper' : ''}`}>
                {renderCategoryImage(category, categoryImageFallback, 'grid-3-image')}
                {getCartBadge(category.id) && (
                  <span className="cart-badge">{getCartBadge(category.id)}</span>
                )}
                <div className="category-card-overlay-title">{getCategoryName(category)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Grid2Block - 2 columns layout with medium cards
 * Standard Tandoor menu style
 */
export function Grid2Block({
  categories = [],
  products = [],
  onCategoryClick,
  cartItems = [],
  categoryImageFallback = '',
  blockTitle = '',
  hideCategoryTitleBackground = false
}) {
  const getCartBadge = createCategoryCartBadgeResolver(products, cartItems);
  const titleText = getDisplayBlockTitle(blockTitle);

  return (
    <div className={`showcase-block grid-2-block${hideCategoryTitleBackground ? ' no-title-bg' : ''}`}>
      {titleText && <h3 className="showcase-block-title">{titleText}</h3>}
      <div className="grid-2-container">
        {categories.map((category) => {
          const hasCategoryImage = Boolean(getCategoryImage(category));
          return (
            <div
              key={category.id}
              className="grid-2-card"
              onClick={() => onCategoryClick?.(category.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onCategoryClick?.(category.id);
                }
              }}
            >
              <div className={`grid-2-image-wrapper${!hasCategoryImage ? ' category-logo-fallback-wrapper' : ''}`}>
                {renderCategoryImage(category, categoryImageFallback, 'grid-2-image')}
                {getCartBadge(category.id) && (
                  <span className="cart-badge">{getCartBadge(category.id)}</span>
                )}
                <div className="category-card-overlay-title">{getCategoryName(category)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PatternGridBlock - mixed row templates (e.g. 3+2, 2+3, 1+2, 2+1)
 */
export function PatternGridBlock({
  categories = [],
  rowPattern = [],
  products = [],
  onCategoryClick,
  cartItems = [],
  categoryImageFallback = '',
  blockTitle = '',
  layoutVariant = '',
  hideCategoryTitleBackground = false
}) {
  const getCartBadge = createCategoryCartBadgeResolver(products, cartItems);
  const normalizedPattern = normalizeRowPattern(rowPattern, categories.length || 3);
  const isZigzagLayout = String(layoutVariant || '').trim().toLowerCase() === 'zigzag_2';
  const titleText = getDisplayBlockTitle(blockTitle);
  const rows = [];
  let cursor = 0;
  normalizedPattern.forEach((count) => {
    const rowItems = categories.slice(cursor, cursor + count);
    if (rowItems.length > 0) {
      rows.push(rowItems);
    }
    cursor += count;
  });
  if (cursor < categories.length) {
    rows.push(categories.slice(cursor));
  }

  return (
    <div className={`showcase-block pattern-grid-block${isZigzagLayout ? ' is-zigzag' : ''}${hideCategoryTitleBackground ? ' no-title-bg' : ''}`}>
      {titleText && <h3 className="showcase-block-title">{titleText}</h3>}
      <div className="pattern-grid-rows">
        {rows.map((rowItems, rowIndex) => (
          (() => {
            const isZigzagTwoSlots = isZigzagLayout && rowItems.length === 2;
            const rowColumns = isZigzagTwoSlots
              ? (rowIndex % 2 === 0 ? '1.7fr 1fr' : '1fr 1.7fr')
              : `repeat(${rowItems.length}, minmax(0, 1fr))`;
            return (
              <div
                key={`pattern_row_${rowIndex}`}
                className={`pattern-grid-row${isZigzagTwoSlots ? ' pattern-grid-row-zigzag' : ''}`}
                style={{ gridTemplateColumns: rowColumns }}
              >
                {rowItems.map((category, rowItemIndex) => {
                  const isWideZigzagCard = isZigzagTwoSlots
                    && ((rowIndex % 2 === 0 && rowItemIndex === 0) || (rowIndex % 2 === 1 && rowItemIndex === 1));
                  const zigzagTypeClass = isZigzagTwoSlots
                    ? (isWideZigzagCard ? ' is-wide' : ' is-square')
                    : '';
                  const hasCategoryImage = Boolean(getCategoryImage(category));
                  return (
                    <div
                      key={category.id}
                      className={`pattern-grid-item${isZigzagLayout ? ' pattern-grid-item-zigzag' : ''}${zigzagTypeClass}`}
                      onClick={() => onCategoryClick?.(category.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          onCategoryClick?.(category.id);
                        }
                      }}
                    >
                      <div className={`pattern-grid-image-wrapper${!hasCategoryImage ? ' category-logo-fallback-wrapper' : ''}`}>
                        {renderCategoryImage(category, categoryImageFallback, 'pattern-grid-image')}
                        {getCartBadge(category.id) && (
                          <span className="cart-badge">{getCartBadge(category.id)}</span>
                        )}
                        <div className="category-card-overlay-title">{getCategoryName(category)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ))}
      </div>
    </div>
  );
}

/**
 * BannerBlock - Full width hero/banner for special offers
 */
export function BannerBlock({ block, onBannerClick }) {
  const { settings = {}, title } = block;
  const {
    imageUrl = '',
    ctaText = 'Подробнее',
    backgroundColor = 'linear-gradient(135deg, var(--primary-light, #6366f1) 0%, var(--primary-color, #4f46e5) 100%)',
    textColor = '#ffffff'
  } = settings;

  return (
    <div
      className="showcase-block banner-block"
      style={{
        background: backgroundColor.startsWith('linear-gradient') ||
                    backgroundColor.startsWith('#') ||
                    backgroundColor.startsWith('rgb')
          ? backgroundColor
          : `url(${backgroundColor})`
      }}
      onClick={() => onBannerClick?.(block.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onBannerClick?.(block.id);
        }
      }}
    >
      <div className="banner-content">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title || 'Banner'}
            className="banner-image"
          />
        )}
        <div className="banner-text" style={{ color: textColor }}>
          {title && <h2 className="banner-title">{title}</h2>}
          {ctaText && <div className="banner-cta">{ctaText}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * ProductSliderBlock - Horizontal scrollable product slider
 * Products from a specific category
 */
export function ProductSliderBlock({ categoryId, categories = [], products = [], onProductClick, cartItems = [], onCategoryClick }) {
  const normalizedCategoryId = normalizeId(categoryId);
  const categoryProducts = products.filter(
    (product) => normalizeId(product?.category_id) === normalizedCategoryId
  );
  const categoryFromList = (categories || []).find(
    (category) => normalizeId(category?.id) === normalizedCategoryId
  );
  const categoryNameFromProducts = categoryProducts.find((product) => (
    product?.category_name_ru
    || product?.category_name_uz
    || product?.category_name
    || product?.category?.name_ru
    || product?.category?.name_uz
    || product?.category?.name
  ));
  const categoryName = getCategoryName(categoryFromList)
    || categoryNameFromProducts?.category_name_ru
    || categoryNameFromProducts?.category_name_uz
    || categoryNameFromProducts?.category_name
    || categoryNameFromProducts?.category?.name_ru
    || categoryNameFromProducts?.category?.name_uz
    || categoryNameFromProducts?.category?.name
    || '';

  if (categoryProducts.length === 0) {
    return (
      <div className="showcase-block slider-block">
        <div className="slider-empty">Нет товаров в этой категории</div>
      </div>
    );
  }

  return (
    <div className="showcase-block slider-block">
      {categoryName && (
        <div
          className="slider-header"
          onClick={() => onCategoryClick?.(categoryId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onCategoryClick?.(categoryId);
            }
          }}
        >
          <h3 className="slider-title">{categoryName}</h3>
          <span className="slider-view-all">Все →</span>
        </div>
      )}
      <div className="slider-container">
        <div className="slider-track">
          {categoryProducts.map(product => {
            const itemInCart = cartItems.find(item => item.product_id === product.id);
            const quantity = itemInCart?.quantity || 0;
            const priceMeta = getProductPriceMeta(product);

            return (
              <div
                key={product.id}
                className="slider-item"
                onClick={() => onProductClick?.(product)}
              >
                <div className="slider-image-wrapper">
                  <img
                    src={getProductImage(product)}
                    alt={getProductName(product)}
                    className="slider-image"
                  />
                  {quantity > 0 && (
                    <span className="slider-item-badge">{quantity}</span>
                  )}
                </div>
                <div className="slider-item-content">
                  <h4 className="slider-item-name">{getProductName(product)}</h4>
                  {priceMeta.currentPrice > 0 && (
                    <div className="slider-item-price">
                      {priceMeta.isDiscount && Number.isFinite(priceMeta.originalPrice) && (
                        <span className="slider-item-price-old">{formatPrice(priceMeta.originalPrice)} сум</span>
                      )}
                      <span className={`slider-item-price-main ${priceMeta.isDiscount ? 'is-discount' : ''}`}>
                        {formatPrice(priceMeta.currentPrice)} сум
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder block for empty state
 */
export function EmptyShowcaseBlock() {
  return (
    <div className="showcase-block empty-block">
      <div className="empty-state">
        <p>Витрина не настроена. Обратитесь к администратору.</p>
      </div>
    </div>
  );
}
