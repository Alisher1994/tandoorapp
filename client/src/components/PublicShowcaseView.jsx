import React from 'react';
import Container from 'react-bootstrap/Container';
import {
  Grid3Block,
  Grid2Block,
  PatternGridBlock,
  BannerBlock,
  ProductSliderBlock,
  EmptyShowcaseBlock
} from './ShowcaseBlocks';
import '../pages/ShowcaseDisplay.css';

// Рендер витрины (showcase) для публичного магазина (talablar.app/<slug>) и других
// гостевых контекстов. Логика блоков 1:1 повторяет ShowcaseDisplay, но без роутинга и
// привязки к авторизованному пользователю: клики прокидываются наружу через колбэки.

const normalizeId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

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
    block?.settings?.columns ?? block?.settings?.gridColumns,
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

function PublicShowcaseView({
  layout = [],
  categories = [],
  products = [],
  cart = [],
  language = 'ru',
  onCategoryClick = () => {},
  onProductClick = () => {},
  categoryImageFallback = ''
}) {
  const renderBlock = (block) => {
    const blockTitle = String(block?.settings?.title || block?.title || '').trim();
    const blockLayoutVariant = String(block?.settings?.layoutVariant || '').trim();
    const hideCategoryTitleBackground = block?.settings?.hideCategoryTitleBackground === true;
    const categoryTitleBackgroundTransparent = block?.settings?.categoryTitleBackgroundTransparent === true;
    const categoryTitleOutsideImage = block?.settings?.categoryTitleOutsideImage === true;
    const content = Array.isArray(block.content) ? block.content : [];
    const limit = block.block_type === 'grid_3' || block.block_type === 'grid_2'
      ? getGridLimitFromBlock(block)
      : null;
    const categoryIds = Number.isInteger(limit) ? content.slice(0, limit) : content;
    const rowPattern = block.block_type === 'grid_3' || block.block_type === 'grid_2'
      ? getGridRowPattern(block, categoryIds.length)
      : [];
    const blockCategories = categoryIds
      .map((catId) => categories.find((c) => normalizeId(c?.id) === normalizeId(catId)))
      .filter(Boolean);

    switch (block.block_type) {
      case 'grid_3':
        if (rowPattern.length > 1) {
          return (
            <PatternGridBlock
              key={block.id}
              categories={blockCategories}
              rowPattern={rowPattern}
              products={products}
              cartItems={cart}
              onCategoryClick={onCategoryClick}
              categoryImageFallback={categoryImageFallback}
              blockTitle={blockTitle}
              layoutVariant={blockLayoutVariant}
              hideCategoryTitleBackground={hideCategoryTitleBackground}
              categoryTitleBackgroundTransparent={categoryTitleBackgroundTransparent}
              categoryTitleOutsideImage={categoryTitleOutsideImage}
              language={language}
            />
          );
        }
        return (
          <Grid3Block
            key={block.id}
            categories={blockCategories}
            products={products}
            cartItems={cart}
            onCategoryClick={onCategoryClick}
            categoryImageFallback={categoryImageFallback}
            blockTitle={blockTitle}
            hideCategoryTitleBackground={hideCategoryTitleBackground}
            categoryTitleBackgroundTransparent={categoryTitleBackgroundTransparent}
            categoryTitleOutsideImage={categoryTitleOutsideImage}
            language={language}
          />
        );
      case 'grid_2':
        if (rowPattern.length > 1) {
          return (
            <PatternGridBlock
              key={block.id}
              categories={blockCategories}
              rowPattern={rowPattern}
              products={products}
              cartItems={cart}
              onCategoryClick={onCategoryClick}
              categoryImageFallback={categoryImageFallback}
              blockTitle={blockTitle}
              layoutVariant={blockLayoutVariant}
              hideCategoryTitleBackground={hideCategoryTitleBackground}
              categoryTitleBackgroundTransparent={categoryTitleBackgroundTransparent}
              categoryTitleOutsideImage={categoryTitleOutsideImage}
              language={language}
            />
          );
        }
        return (
          <Grid2Block
            key={block.id}
            categories={blockCategories}
            products={products}
            cartItems={cart}
            onCategoryClick={onCategoryClick}
            categoryImageFallback={categoryImageFallback}
            blockTitle={blockTitle}
            hideCategoryTitleBackground={hideCategoryTitleBackground}
            categoryTitleBackgroundTransparent={categoryTitleBackgroundTransparent}
            categoryTitleOutsideImage={categoryTitleOutsideImage}
            language={language}
          />
        );
      case 'banner':
        return (
          <BannerBlock
            key={block.id}
            block={block}
            onBannerClick={() => {
              const bannerCategories = Array.isArray(block.content) ? block.content : [];
              if (bannerCategories.length > 0) {
                onCategoryClick(bannerCategories[0]);
              }
            }}
          />
        );
      case 'slider':
        return (
          <ProductSliderBlock
            key={block.id}
            categoryId={block.category_id}
            categories={categories}
            products={products}
            cartItems={cart}
            onProductClick={onProductClick}
            onCategoryClick={onCategoryClick}
            language={language}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Container fluid className="showcase-inner">
      {(!Array.isArray(layout) || layout.length === 0) ? (
        <EmptyShowcaseBlock />
      ) : (
        <div className="showcase-blocks">
          {layout.map((block) => renderBlock(block))}
        </div>
      )}
    </Container>
  );
}

export default PublicShowcaseView;
