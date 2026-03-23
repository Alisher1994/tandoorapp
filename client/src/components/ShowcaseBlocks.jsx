import React from 'react';
import './ShowcaseBlocks.css';

/**
 * Grid3Block - 3 columns layout with small icons
 * Perfect for quick categories like "Готовая еда", "Кофейня"
 */
export function Grid3Block({ categories, products, onCategoryClick, cartItems }) {
  const getCartBadge = (categoryId) => {
    const total = cartItems
      .filter(item => {
        const product = products.find(p => p.id === item.product_id);
        return product?.category_id === categoryId;
      })
      .reduce((sum, item) => sum + item.quantity, 0);
    return total > 0 ? total : null;
  };

  return (
    <div className="showcase-block grid-3-block">
      <div className="grid-3-container">
        {categories.map(category => (
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
            <div className="grid-3-image-wrapper">
              <img
                src={category.image || '/placeholder.png'}
                alt={category.name}
                className="grid-3-image"
              />
              {getCartBadge(category.id) && (
                <span className="cart-badge">{getCartBadge(category.id)}</span>
              )}
            </div>
            <div className="grid-3-label">{category.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Grid2Block - 2 columns layout with medium cards
 * Standard Tandoor menu style
 */
export function Grid2Block({ categories, products, onCategoryClick, cartItems }) {
  const getCartBadge = (categoryId) => {
    const total = cartItems
      .filter(item => {
        const product = products.find(p => p.id === item.product_id);
        return product?.category_id === categoryId;
      })
      .reduce((sum, item) => sum + item.quantity, 0);
    return total > 0 ? total : null;
  };

  return (
    <div className="showcase-block grid-2-block">
      <div className="grid-2-container">
        {categories.map(category => (
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
            <div className="grid-2-image-wrapper">
              <img
                src={category.image || '/placeholder.png'}
                alt={category.name}
                className="grid-2-image"
              />
              {getCartBadge(category.id) && (
                <span className="cart-badge">{getCartBadge(category.id)}</span>
              )}
            </div>
            <div className="grid-2-content">
              <h3 className="grid-2-title">{category.name}</h3>
              {category.description && (
                <p className="grid-2-description">{category.description}</p>
              )}
            </div>
          </div>
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
    imageUrl = '/placeholder-banner.png',
    ctaText = 'Подробнее',
    backgroundColor = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
export function ProductSliderBlock({ categoryId, products, onProductClick, cartItems, onCategoryClick }) {
  const categoryProducts = products.filter(p => p.category_id === categoryId);
  const categoryName = products.find(p => p.category_id === categoryId)?.category?.name || '';

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

            return (
              <div
                key={product.id}
                className="slider-item"
                onClick={() => onProductClick?.(product)}
              >
                <div className="slider-image-wrapper">
                  <img
                    src={product.image || '/placeholder.png'}
                    alt={product.name}
                    className="slider-image"
                  />
                  {quantity > 0 && (
                    <span className="slider-item-badge">{quantity}</span>
                  )}
                </div>
                <div className="slider-item-content">
                  <h4 className="slider-item-name">{product.name}</h4>
                  {product.price && (
                    <div className="slider-item-price">{product.price} сум</div>
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
