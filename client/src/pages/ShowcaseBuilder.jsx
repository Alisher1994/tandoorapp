import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../context/AuthContext';
import { useShowcase, BLOCK_TYPES } from '../context/ShowcaseContext';
import {
  Grid3Block,
  Grid2Block,
  PatternGridBlock,
  BannerBlock,
  ProductSliderBlock
} from '../components/ShowcaseBlocks';
import './ShowcaseBuilder.css';
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Settings as SettingsIcon,
  User as UserIcon,
  Search as SearchIcon
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const DEFAULT_BANNER_SETTINGS = {
  title: 'Спецпредложение',
  backgroundColor: 'linear-gradient(135deg, var(--primary-light, #6366f1) 0%, var(--primary-color, #4f46e5) 100%)',
  textColor: '#ffffff',
  ctaText: 'Подробнее'
};
const DEFAULT_GRID_LIMITS = {
  [BLOCK_TYPES.GRID_3]: 3,
  [BLOCK_TYPES.GRID_2]: 2
};
const SHOWCASE_TEMPLATES = [
  {
    key: 'grid_3_2',
    label: '3 сверху + 2 снизу',
    description: 'Один блок, 5 категорий',
    blockType: BLOCK_TYPES.GRID_3,
    settings: {
      title: '',
      maxCategories: 5,
      rowPattern: [3, 2]
    }
  },
  {
    key: 'grid_2_3',
    label: '2 сверху + 3 снизу',
    description: 'Один блок, 5 категорий',
    blockType: BLOCK_TYPES.GRID_3,
    settings: {
      title: '',
      maxCategories: 5,
      rowPattern: [2, 3]
    }
  },
  {
    key: 'grid_3_3',
    label: '3 сверху + 3 снизу + 3',
    description: 'Один блок, 9 категорий',
    blockType: BLOCK_TYPES.GRID_3,
    settings: {
      title: '',
      maxCategories: 9,
      rowPattern: [3, 3, 3]
    }
  },
  {
    key: 'grid_1_2',
    label: '1 сверху + 2 снизу',
    description: 'Один блок, 3 категории',
    blockType: BLOCK_TYPES.GRID_3,
    settings: {
      title: '',
      maxCategories: 3,
      rowPattern: [1, 2]
    }
  },
  {
    key: 'grid_2_1',
    label: '2 сверху + 1 снизу',
    description: 'Один блок, 3 категории',
    blockType: BLOCK_TYPES.GRID_3,
    settings: {
      title: '',
      maxCategories: 3,
      rowPattern: [2, 1]
    }
  },
  {
    key: 'zigzag_2',
    label: 'Широкий + квадратный',
    description: 'Шахматный 2-колоночный блок',
    blockType: BLOCK_TYPES.GRID_3,
    settings: {
      title: '',
      maxCategories: 6,
      rowPattern: [2, 2, 2],
      layoutVariant: 'zigzag_2'
    }
  }
];

const getCategoryDisplayName = (category) => (
  category?.name_ru
  || category?.name_uz
  || category?.name
  || `Категория ${category?.id || ''}`
);

const getCategoryImage = (category) => (
  category?.image
  || category?.icon_url
  || category?.image_url
  || ''
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

const isProductEnabledForShowcase = (product) => (
  product?.is_active !== false
);

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

const isGridBlockType = (blockType) => (
  blockType === BLOCK_TYPES.GRID_3 || blockType === BLOCK_TYPES.GRID_2
);

const isUnlimitedGridBlock = (block) => (
  isGridBlockType(block?.block_type)
  && normalizeBooleanLike(
    block?.settings?.unlimitedRows
      ?? block?.settings?.unlimited_rows
      ?? block?.settings?.isUnlimited
      ?? block?.settings?.is_unlimited
  )
);

const getGridColumns = (block) => {
  if (!block || !isGridBlockType(block.block_type)) return 0;
  const explicitColumns = Number.parseInt(
    block?.settings?.columns
      ?? block?.settings?.gridColumns,
    10
  );
  if (Number.isInteger(explicitColumns) && explicitColumns > 0) return explicitColumns;
  return block.block_type === BLOCK_TYPES.GRID_2 ? 2 : 3;
};

const getGridCategoryLimit = (block) => {
  if (!block || !isGridBlockType(block.block_type)) return null;
  if (isUnlimitedGridBlock(block)) return null;
  const settingsLimit = Number.parseInt(block?.settings?.maxCategories, 10);
  if (Number.isInteger(settingsLimit) && settingsLimit > 0) return settingsLimit;
  return DEFAULT_GRID_LIMITS[block.block_type] || null;
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

const getGridRowPattern = (block, assignedCount = null, includeTrailingEmptyRow = false) => {
  if (!block || !isGridBlockType(block.block_type)) return [];

  const totalAssigned = Number.isInteger(assignedCount) && assignedCount >= 0
    ? assignedCount
    : (Array.isArray(block?.content) ? block.content.length : 0);
  const columns = getGridColumns(block);
  if (columns <= 0) return [];

  if (isUnlimitedGridBlock(block)) {
    const totalSlots = Math.max(
      columns,
      totalAssigned + (includeTrailingEmptyRow ? columns : 0)
    );
    const resolved = [];
    let remaining = totalSlots;
    while (remaining > 0) {
      const take = Math.min(columns, remaining);
      resolved.push(take);
      remaining -= take;
    }
    return resolved;
  }

  const limit = getGridCategoryLimit(block);
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const rawPattern = parseRowPattern(block?.settings?.rowPattern);
  const normalizedPattern = rawPattern
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (normalizedPattern.length === 0) return [limit];

  let remaining = limit;
  const resolved = [];
  normalizedPattern.forEach((value) => {
    if (remaining <= 0) return;
    const take = Math.min(value, remaining);
    if (take > 0) {
      resolved.push(take);
      remaining -= take;
    }
  });

  if (remaining > 0) {
    resolved.push(remaining);
  }

  return resolved.length > 0 ? resolved : [limit];
};

const getGridPatternLabel = (block) => {
  if (isUnlimitedGridBlock(block)) {
    return `${getGridColumns(block)}xN`;
  }
  const pattern = getGridRowPattern(block);
  return pattern.length > 1 ? pattern.join('+') : null;
};

const extractProductsFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

function ShowcaseBuilder({ embedded = false }) {
  const { user } = useAuth();
  const {
    showcaseLayout,
    showcaseLoading,
    showcaseError,
    showcaseVisible,
    isDirty,
    loadShowcase,
    saveShowcase,
    addBlock,
    removeBlock,
    updateBlock,
    reorderBlocks,
    addCategoryToBlock,
    removeCategoryFromBlock,
    setSliderCategory,
    setShowcaseVisible
  } = useShowcase();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [showBlockTypeModal, setShowBlockTypeModal] = useState(false);
  const [showBlockSettingsModal, setShowBlockSettingsModal] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [dropTargetBlockId, setDropTargetBlockId] = useState(null);
  const [hideCategoryTitleBackgroundGlobal, setHideCategoryTitleBackgroundGlobal] = useState(false);

  const draggedCategoryRef = useRef(null);
  const gridBlocks = showcaseLayout.filter((block) => isGridBlockType(block?.block_type));

  // Load categories and products
  useEffect(() => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;

    const loadData = async () => {
      setCategoriesLoading(true);
      try {
        const [categoriesRes, productsRes] = await Promise.all([
          axios.get(`${API_URL}/products/restaurants/${restaurantId}/categories`),
          axios
            .get(`${API_URL}/admin/products`, { params: { restaurant_id: restaurantId } })
            .catch(() => axios.get(`${API_URL}/products`, { params: { restaurant_id: restaurantId } }))
        ]);
        const fetchedCategories = Array.isArray(categoriesRes.data)
          ? categoriesRes.data
          : (Array.isArray(categoriesRes.data?.categories) ? categoriesRes.data.categories : []);
        const fetchedProductsRaw = extractProductsFromResponse(productsRes.data);
        const fetchedProducts = fetchedProductsRaw
          .filter((product) => isProductEnabledForShowcase(product))
          .filter((product) => {
            const productRestaurantId = normalizeId(product?.restaurant_id);
            return !productRestaurantId || productRestaurantId === restaurantId;
          });

        setCategories(fetchedCategories);
        setProducts(fetchedProducts);
      } catch (error) {
        console.error('Failed to load data:', error);
        setErrorMessage('Ошибка загрузки данных');
      } finally {
        setCategoriesLoading(false);
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
    const showcaseGridBlocks = showcaseLayout.filter((block) => isGridBlockType(block?.block_type));
    if (showcaseGridBlocks.length === 0) return;
    setHideCategoryTitleBackgroundGlobal(
      showcaseGridBlocks.every((block) => block?.settings?.hideCategoryTitleBackground === true)
    );
  }, [showcaseLayout]);

  const handleToggleGlobalCategoryTitleBackground = (hidden) => {
    const normalizedHidden = Boolean(hidden);
    setHideCategoryTitleBackgroundGlobal(normalizedHidden);
    gridBlocks.forEach((block) => {
      if ((block?.settings?.hideCategoryTitleBackground === true) === normalizedHidden) return;
      updateBlock(block.id, {
        settings: {
          ...(block?.settings || {}),
          hideCategoryTitleBackground: normalizedHidden
        },
        title: String(block?.title ?? '')
      });
    });
  };

  const handleAddBlock = (blockType, customSettings = null) => {
    const defaultSettings = {
      [BLOCK_TYPES.GRID_3]: { title: '', maxCategories: 3, hideCategoryTitleBackground: hideCategoryTitleBackgroundGlobal },
      [BLOCK_TYPES.GRID_2]: { title: '', maxCategories: 2, hideCategoryTitleBackground: hideCategoryTitleBackgroundGlobal },
      [BLOCK_TYPES.BANNER]: DEFAULT_BANNER_SETTINGS,
      [BLOCK_TYPES.SLIDER]: { title: '' }
    };

    const nextSettings = {
      ...(defaultSettings[blockType] || {}),
      ...(customSettings && typeof customSettings === 'object' ? customSettings : {})
    };
    if (isGridBlockType(blockType) && normalizeBooleanLike(nextSettings.unlimitedRows)) {
      delete nextSettings.maxCategories;
      const fallbackColumns = blockType === BLOCK_TYPES.GRID_2 ? 2 : 3;
      const normalizedColumns = Number.parseInt(nextSettings.columns, 10);
      nextSettings.columns = Number.isInteger(normalizedColumns) && normalizedColumns > 0
        ? normalizedColumns
        : fallbackColumns;
      nextSettings.unlimitedRows = true;
    }
    addBlock(blockType, nextSettings);
    setShowBlockTypeModal(false);
  };

  const handleApplyTemplate = (templateKey) => {
    const selectedTemplate = SHOWCASE_TEMPLATES.find((template) => template.key === templateKey);
    if (selectedTemplate?.blockType) {
      const baseSettings = {
        ...(selectedTemplate.settings || {})
      };
      if (isGridBlockType(selectedTemplate.blockType)) {
        baseSettings.hideCategoryTitleBackground = hideCategoryTitleBackgroundGlobal;
      }
      addBlock(selectedTemplate.blockType, baseSettings);
      setShowBlockTypeModal(false);
    }
  };

  const handleSaveShowcase = async () => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;

    setSaveLoading(true);
    setSaveSuccess(false);
    setErrorMessage('');

    const success = await saveShowcase(restaurantId, showcaseLayout, showcaseVisible);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setErrorMessage('Ошибка при сохранении витрины');
    }
    setSaveLoading(false);
  };

  const handleDragStart = (e, categoryId) => {
    draggedCategoryRef.current = categoryId;
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    draggedCategoryRef.current = null;
    setDropTargetBlockId(null);
  };

  const handleDragOver = (e, blockId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (blockId) setDropTargetBlockId(blockId);
  };

  const handleDropOnBlock = (e, blockId) => {
    e.preventDefault();
    const categoryId = draggedCategoryRef.current;
    draggedCategoryRef.current = null;
    setDropTargetBlockId(null);
    if (categoryId) {
      const normalizedCategoryId = Number.parseInt(categoryId, 10);
      const targetBlock = showcaseLayout.find((block) => String(block.id) === String(blockId));
      if (!targetBlock || !Number.isInteger(normalizedCategoryId)) return;

      if (targetBlock.block_type === BLOCK_TYPES.SLIDER) {
        setSliderCategory(blockId, normalizedCategoryId);
      } else if (isGridBlockType(targetBlock.block_type)) {
        const limit = getGridCategoryLimit(targetBlock);
        const content = Array.isArray(targetBlock.content) ? targetBlock.content : [];
        if (content.includes(normalizedCategoryId)) return;
        if (limit && content.length >= limit) return;
        addCategoryToBlock(blockId, normalizedCategoryId);
      }
    }
  };

  const handleDragLeave = (blockId) => {
    setDropTargetBlockId((prevBlockId) => (prevBlockId === blockId ? null : prevBlockId));
  };

  const getBlockTypeLabel = (block) => {
    const blockType = block?.block_type;
    if (isGridBlockType(blockType)) {
      if (String(block?.settings?.layoutVariant || '').trim().toLowerCase() === 'zigzag_2') {
        return 'Зигзаг 2x';
      }
      const customPattern = getGridPatternLabel(block);
      if (customPattern) return `Сетка ${customPattern}`;
      return blockType === BLOCK_TYPES.GRID_2 ? 'Сетка 2x' : 'Сетка 3x';
    }
    if (blockType === BLOCK_TYPES.BANNER) return 'Баннер';
    if (blockType === BLOCK_TYPES.SLIDER) return 'Слайдер';
    return 'Блок';
  };

  const getCategoryById = (categoryId) => (
    categories.find((item) => normalizeId(item?.id) === normalizeId(categoryId)) || null
  );

  const getBlockDisplayTitle = (block) => (
    String(block?.settings?.title ?? block?.title ?? '')
  );

  const handleBlockTitleInputChange = (block, rawTitle) => {
    const nextTitle = String(rawTitle ?? '');
    const nextSettings = {
      ...(block?.settings || {}),
      title: nextTitle
    };
    updateBlock(block.id, {
      title: nextTitle,
      settings: nextSettings
    });
  };

  const renderDropHint = () => null;

  const renderBlockAssignments = (block) => {
    if (isGridBlockType(block.block_type)) {
      const limit = getGridCategoryLimit(block);
      const assignedSource = Array.isArray(block.content) ? block.content : [];
      const assigned = Number.isInteger(limit) ? assignedSource.slice(0, limit) : assignedSource;
      const rowPattern = getGridRowPattern(block, assigned.length, true);
      const limitLabel = Number.isInteger(limit) ? limit : '∞';
      let currentSlotIndex = 0;
      return (
        <div className="block-slots-wrap">
          <div className="block-slots-title">Слоты категорий: {assigned.length}/{limitLabel}</div>
          <div className="block-slots-pattern">
            {rowPattern.map((rowSize, rowIndex) => {
              const rowStartIndex = currentSlotIndex;
              currentSlotIndex += rowSize;
              return (
                <div
                  key={`${block.id}_row_${rowIndex}`}
                  className="block-slots-row"
                  style={{ gridTemplateColumns: `repeat(${rowSize}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: rowSize }).map((_, rowSlotIndex) => {
                    const slotIndex = rowStartIndex + rowSlotIndex;
                    const categoryId = assigned[slotIndex];
                    if (!categoryId) {
                      return (
                        <div key={`${block.id}_slot_${slotIndex}`} className="block-slot empty">
                          <span className="slot-index">Слот {slotIndex + 1}</span>
                          <span className="slot-subtitle">Перетащите категорию</span>
                        </div>
                      );
                    }

                    const category = getCategoryById(categoryId);
                    const categoryTitle = category ? getCategoryDisplayName(category) : `Категория #${categoryId}`;
                    return (
                      <div key={`${block.id}_slot_${categoryId}`} className="block-slot filled">
                        <span className="slot-index">{slotIndex + 1}</span>
                        <span className="slot-label">{categoryTitle}</span>
                        <button
                          type="button"
                          className="slot-remove-btn"
                          onClick={() => removeCategoryFromBlock(block.id, categoryId)}
                          title="Удалить категорию из слота"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (block.block_type === BLOCK_TYPES.SLIDER) {
      const selectedCategory = getCategoryById(block.category_id);
      return (
        <div className="block-slots-wrap">
          <div className="block-slots-title">Категория слайдера</div>
          {selectedCategory ? (
            <div className="block-slot filled slider-slot">
              <span className="slot-label">{getCategoryDisplayName(selectedCategory)}</span>
              <button
                type="button"
                className="slot-remove-btn"
                onClick={() => setSliderCategory(block.id, null)}
                title="Очистить категорию слайдера"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="block-slot empty slider-slot">
              <span className="slot-subtitle">Категория не выбрана. Перетащите одну категорию.</span>
            </div>
          )}
        </div>
      );
    }

    if (block.block_type === BLOCK_TYPES.BANNER) {
      const ctaText = String(block?.settings?.ctaText || 'Подробнее').trim();
      return (
        <div className="block-slots-wrap">
          <div className="block-slots-title">Баннер</div>
          <div className="block-slot filled slider-slot">
            <span className="slot-label">{String(block?.title || 'Без заголовка')}</span>
            <span className="slot-subtitle-inline">{ctaText}</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const categoryProductCountMap = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const categoryId = normalizeId(product?.category_id);
      if (!categoryId) return;
      map.set(categoryId, (map.get(categoryId) || 0) + 1);
    });
    return map;
  }, [products]);

  const getCategoryProductCount = (categoryId) => {
    const normalizedCategoryId = normalizeId(categoryId);
    if (!normalizedCategoryId) return 0;
    return categoryProductCountMap.get(normalizedCategoryId) || 0;
  };

  const availableCategories = useMemo(
    () => categories.filter((cat) => getCategoryProductCount(cat?.id) > 0),
    [categories, categoryProductCountMap]
  );

  const filteredCategories = availableCategories.filter(cat =>
    getCategoryDisplayName(cat).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderBlock = (block) => {
    const blockTitle = String(block?.settings?.title || block?.title || '').trim();
    const blockLayoutVariant = String(block?.settings?.layoutVariant || '').trim();
    const hideCategoryTitleBackground = block?.settings?.hideCategoryTitleBackground === true;
    const limit = isGridBlockType(block.block_type) ? getGridCategoryLimit(block) : null;
    const sourceCategoryIds = Array.isArray(block.content)
      ? (Number.isInteger(limit) ? block.content.slice(0, limit) : block.content)
      : [];
    const rowPattern = isGridBlockType(block.block_type)
      ? getGridRowPattern(block, sourceCategoryIds.length, false)
      : [];
    const blockCategories = sourceCategoryIds.map((categoryId) => {
      const category = categories.find(
        (item) => normalizeId(item?.id) === normalizeId(categoryId)
      );
      if (category) return category;
      return {
        id: categoryId,
        name_ru: `Категория #${categoryId}`,
        name_uz: `Kategoriya #${categoryId}`,
        name: `Категория #${categoryId}`
      };
    });

    switch (block.block_type) {
      case BLOCK_TYPES.GRID_3:
        if (rowPattern.length > 1) {
          return (
            <PatternGridBlock
              categories={blockCategories}
              rowPattern={rowPattern}
              products={products}
              cartItems={[]}
              categoryImageFallback={user?.active_restaurant_logo || ''}
              blockTitle={blockTitle}
              layoutVariant={blockLayoutVariant}
              hideCategoryTitleBackground={hideCategoryTitleBackground}
            />
          );
        }
        return (
          <Grid3Block
            categories={blockCategories}
            products={products}
            cartItems={[]}
            categoryImageFallback={user?.active_restaurant_logo || ''}
            blockTitle={blockTitle}
            hideCategoryTitleBackground={hideCategoryTitleBackground}
          />
        );
      case BLOCK_TYPES.GRID_2:
        if (rowPattern.length > 1) {
          return (
            <PatternGridBlock
              categories={blockCategories}
              rowPattern={rowPattern}
              products={products}
              cartItems={[]}
              categoryImageFallback={user?.active_restaurant_logo || ''}
              blockTitle={blockTitle}
              layoutVariant={blockLayoutVariant}
              hideCategoryTitleBackground={hideCategoryTitleBackground}
            />
          );
        }
        return (
          <Grid2Block
            categories={blockCategories}
            products={products}
            cartItems={[]}
            categoryImageFallback={user?.active_restaurant_logo || ''}
            blockTitle={blockTitle}
            hideCategoryTitleBackground={hideCategoryTitleBackground}
          />
        );
      case BLOCK_TYPES.BANNER:
        return <BannerBlock block={block} />;
      case BLOCK_TYPES.SLIDER:
        return (
          <ProductSliderBlock
            categoryId={block.category_id}
            categories={categories}
            products={products}
            cartItems={[]}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={`showcase-builder-container${embedded ? ' showcase-builder-embedded' : ''}`}>
      <div className="builder-header">
        <h1>Конструктор Витрины</h1>
        <div className="header-actions">
          <Form.Check
            type="switch"
            id="showcase-visible-switch"
            className="header-visibility-switch"
            label="Отображать витрину клиенту"
            checked={showcaseVisible}
            onChange={(event) => setShowcaseVisible(event.target.checked)}
          />
          <Form.Check
            type="switch"
            id="category-title-bg-global-switch"
            className="header-visibility-switch"
            label="Скрыть фон названий категорий"
            checked={hideCategoryTitleBackgroundGlobal}
            onChange={(event) => handleToggleGlobalCategoryTitleBackground(event.target.checked)}
          />
          {isDirty && <span className="unsaved-indicator">• Несохраненные изменения</span>}
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => setShowBlockTypeModal(true)}
          >
            <Plus size={16} /> Добавить блок
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveShowcase}
            disabled={saveLoading || !isDirty}
          >
            {saveLoading ? <Spinner size="sm" /> : 'Сохранить'}
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" onClose={() => setSaveSuccess(false)} dismissible>
          Витрина успешно сохранена!
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="danger" onClose={() => setErrorMessage('')} dismissible>
          {errorMessage}
        </Alert>
      )}

      {showcaseError && (
        <Alert variant="warning">
          Ошибка загрузки: {showcaseError}
        </Alert>
      )}

      <div className="builder-content">
        {/* Preview Panel */}
        <div className="builder-preview-panel">
          <div className="panel-section">
            <h3>Предпросмотр магазина</h3>
            <div className="store-preview-shell">
              <div className="store-preview-screen">
                <div className="store-preview-header">
                  <div className="store-preview-header-inner">
                    <div className="store-preview-header-side" aria-hidden="true" />
                    <div className="store-preview-brand" aria-label={user?.active_restaurant_name || 'Магазин'}>
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
                        <span style={{ fontSize: '1.4rem' }}>🏪</span>
                      )}
                    </div>
                    <div className="store-preview-header-actions">
                      <button type="button" className="store-preview-header-btn" aria-label="Аккаунт" tabIndex={-1}>
                        <UserIcon size={14} />
                      </button>
                      <button type="button" className="store-preview-header-btn" aria-label="Поиск" tabIndex={-1}>
                        <SearchIcon size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="store-preview-content">
                  {showcaseLayout.length === 0 ? (
                    <div className="store-preview-empty">
                      Нажмите «Добавить блок», чтобы собрать экран магазина
                    </div>
                  ) : (
                    showcaseLayout.map((block) => (
                      <div key={`preview_${block.id}`}>
                        {renderBlock(block)}
                      </div>
                    ))
                  )}
                </div>
                <div className="store-preview-nav">
                  <span>Витрина</span>
                  <span>Каталог</span>
                  <span>Корзина</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Left Panel - Categories */}
        <div className="builder-left-panel">
          <div className="panel-section">
            <h3>Категории</h3>
            <Form.Control
              type="text"
              placeholder="Поиск категории..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="category-search"
            />

            {categoriesLoading ? (
              <div className="loading-state">
                <Spinner animation="border" size="sm" /> Загрузка...
              </div>
            ) : (
              <div className="categories-list">
                {filteredCategories.length === 0 ? (
                  <div className="empty-categories">
                    {availableCategories.length === 0
                      ? 'Нет категорий с товарами'
                      : 'Нет результатов поиска'}
                  </div>
                ) : (
                  filteredCategories.map(category => (
                    <div
                      key={category.id}
                      className="category-item"
                      draggable
                      onDragStart={(e) => handleDragStart(e, category.id)}
                      onDragEnd={handleDragEnd}
                    >
                      {getCategoryImage(category) ? (
                        <img
                          src={getCategoryImage(category)}
                          alt={getCategoryDisplayName(category)}
                          className="category-thumbnail"
                        />
                      ) : (
                        <div className="category-thumbnail category-thumbnail-placeholder">
                          нет фото
                        </div>
                      )}
                      <div className="category-info">
                        <div className="category-name">{getCategoryDisplayName(category)}</div>
                        <div className="category-count">
                          {getCategoryProductCount(category.id)} товаров
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </div>
        </div>

        {/* Right Panel - Canvas */}
        <div className="builder-right-panel">
          <div className="panel-section">
            <div className="canvas-workspace-card">
              <div className="canvas-header">
                <div className="canvas-header-meta">
                  <h3>Структура витрины</h3>
                </div>
              </div>

              {showcaseLoading ? (
                <div className="loading-state">
                  <Spinner animation="border" /> Загрузка витрины...
                </div>
              ) : showcaseLayout.length === 0 ? (
                <div className="canvas-empty">
                  <div className="empty-canvas-message">
                    <p>Пока нет блоков. Добавьте первый блок, чтобы собрать витрину.</p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowBlockTypeModal(true)}
                    >
                      <Plus size={14} /> Добавить блок
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="canvas">
                  {showcaseLayout.map((block, index) => (
                    <div
                      key={block.id}
                      className={`canvas-block-wrapper block-type-${block.block_type}${dropTargetBlockId === block.id ? ' is-drop-target' : ''}`}
                    >
                      <div className="block-head">
                        <div className="block-head-main">
                          <span className="block-order">#{index + 1}</span>
                          <span className={`block-type-badge type-${block.block_type}`}>
                            {getBlockTypeLabel(block)}
                          </span>
                        </div>
                        <div className="button-group">
                          {index > 0 && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => reorderBlocks(block.id, 'up')}
                            title="Переместить выше"
                            >
                              <ChevronUp size={18} />
                            </button>
                          )}
                          {index < showcaseLayout.length - 1 && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => reorderBlocks(block.id, 'down')}
                            title="Переместить ниже"
                            >
                              <ChevronDown size={18} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => {
                              setSelectedBlock(block);
                              setShowBlockSettingsModal(true);
                            }}
                            title="Настройки блока"
                          >
                            <SettingsIcon size={18} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon danger"
                            onClick={() => removeBlock(block.id)}
                            title="Удалить блок"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <div
                        className="block-preview"
                        onDragOver={(e) => handleDragOver(e, block.id)}
                        onDragLeave={() => handleDragLeave(block.id)}
                        onDrop={(e) => handleDropOnBlock(e, block.id)}
                      >
                        <div className="block-title-input-row">
                          <input
                            type="text"
                            className="block-title-input"
                            value={getBlockDisplayTitle(block)}
                            onChange={(event) => handleBlockTitleInputChange(block, event.target.value)}
                            placeholder="Название блока (видно клиенту)"
                          />
                        </div>
                        {renderBlockAssignments(block)}
                        {renderDropHint(block)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Block Type Selection Modal */}
      <Modal
        show={showBlockTypeModal}
        onHide={() => setShowBlockTypeModal(false)}
        centered
        dialogClassName="showcase-builder-modal"
      >
      <Modal.Header closeButton>
          <Modal.Title>Добавление в витрину</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="modal-section-title">Готовые шаблоны</div>
          <div className="template-options">
            {SHOWCASE_TEMPLATES.map((template) => (
              <button
                key={template.key}
                className="template-option"
                onClick={() => handleApplyTemplate(template.key)}
              >
                <div className="template-option-preview" aria-hidden="true">
                  {(parseRowPattern(template?.settings?.rowPattern) || []).map((rowSize, rowIndex) => (
                    (() => {
                      const isZigzagTemplate = String(template?.settings?.layoutVariant || '').trim().toLowerCase() === 'zigzag_2';
                      const rowColumns = isZigzagTemplate && rowSize === 2
                        ? (rowIndex % 2 === 0 ? '1.7fr 1fr' : '1fr 1.7fr')
                        : `repeat(${rowSize}, minmax(0, 1fr))`;
                      return (
                        <div
                          key={`${template.key}_row_${rowIndex}`}
                          className="template-option-row"
                          style={{ gridTemplateColumns: rowColumns }}
                        >
                          {Array.from({ length: rowSize }).map((_, rowCellIndex) => (
                            <span
                              key={`${template.key}_cell_${rowIndex}_${rowCellIndex}`}
                              className="template-option-cell"
                            />
                          ))}
                        </div>
                      );
                    })()
                  ))}
                </div>
                <div className="template-option-label">{template.label}</div>
                <div className="template-option-desc">{template.description}</div>
              </button>
            ))}
          </div>

          <div className="modal-section-title">Отдельные блоки</div>
          <div className="block-type-options">
            <button
              className="block-type-option"
              onClick={() => handleAddBlock(BLOCK_TYPES.GRID_3)}
            >
              <div className="block-type-preview grid-3-preview">
                <div className="preview-item" />
                <div className="preview-item" />
                <div className="preview-item" />
              </div>
              <div className="block-type-name">Сетка 3x (3 колонны)</div>
              <div className="block-type-desc">Маленькие иконки</div>
            </button>

            <button
              className="block-type-option"
              onClick={() => handleAddBlock(BLOCK_TYPES.GRID_2)}
            >
              <div className="block-type-preview grid-2-preview">
                <div className="preview-item" />
                <div className="preview-item" />
              </div>
              <div className="block-type-name">Сетка 2x (2 колонны)</div>
              <div className="block-type-desc">Средние карточки</div>
            </button>

            <button
              className="block-type-option"
              onClick={() => handleAddBlock(BLOCK_TYPES.GRID_3, {
                title: '',
                columns: 3,
                unlimitedRows: true
              })}
            >
              <div className="block-type-preview grid-3n-preview">
                <div className="preview-row">
                  <div className="preview-item" />
                  <div className="preview-item" />
                  <div className="preview-item" />
                </div>
                <div className="preview-row">
                  <div className="preview-item" />
                  <div className="preview-item" />
                  <div className="preview-item" />
                </div>
              </div>
              <div className="block-type-name">Сетка 3xN (без лимита)</div>
              <div className="block-type-desc">Любое количество категорий</div>
            </button>

            <button
              className="block-type-option"
              onClick={() => handleAddBlock(BLOCK_TYPES.GRID_2, {
                title: '',
                columns: 2,
                unlimitedRows: true
              })}
            >
              <div className="block-type-preview grid-2n-preview">
                <div className="preview-row">
                  <div className="preview-item" />
                  <div className="preview-item" />
                </div>
                <div className="preview-row">
                  <div className="preview-item" />
                  <div className="preview-item" />
                </div>
              </div>
              <div className="block-type-name">Сетка 2xN (без лимита)</div>
              <div className="block-type-desc">Любое количество категорий</div>
            </button>

            <button
              className="block-type-option"
              onClick={() => handleAddBlock(BLOCK_TYPES.BANNER)}
            >
              <div className="block-type-preview banner-preview" />
              <div className="block-type-name">Баннер/Герой</div>
              <div className="block-type-desc">На всю ширину</div>
            </button>

            <button
              className="block-type-option"
              onClick={() => handleAddBlock(BLOCK_TYPES.SLIDER)}
            >
              <div className="block-type-preview slider-preview">
                <div className="preview-item" />
                <div className="preview-item" />
                <div className="preview-item" />
              </div>
              <div className="block-type-name">Слайдер товаров</div>
              <div className="block-type-desc">Горизонтальная лента</div>
            </button>
          </div>
        </Modal.Body>
      </Modal>

      {/* Block Settings Modal */}
      <BlockSettingsModal
        show={showBlockSettingsModal}
        block={selectedBlock}
        categories={availableCategories}
        onHide={() => setShowBlockSettingsModal(false)}
        onSave={(settings) => {
          if (selectedBlock) {
            const nextTitle = settings.title == null ? '' : String(settings.title);
            updateBlock(selectedBlock.id, {
              settings,
              title: nextTitle
            });
            if (selectedBlock.block_type === BLOCK_TYPES.SLIDER) {
              setSliderCategory(selectedBlock.id, settings.category_id ?? null);
            }
          }
          setShowBlockSettingsModal(false);
        }}
      />
    </div>
  );
}

// Settings Modal Component
function BlockSettingsModal({ show, block, categories, onHide, onSave }) {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    if (block) {
      setSettings(block.settings || {});
      if (block.block_type === BLOCK_TYPES.SLIDER) {
        setSettings(prev => ({ ...prev, category_id: block.category_id }));
      }
    }
  }, [block, show]);

  if (!block) return null;

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(settings);
  };

  return (
    <Modal show={show} onHide={onHide} centered dialogClassName="showcase-builder-modal">
      <Modal.Header closeButton>
        <Modal.Title>Настройки блока</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>Название блока</Form.Label>
            <Form.Control
              type="text"
              value={settings.title || ''}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Введите название"
            />
          </Form.Group>

          {block.block_type === BLOCK_TYPES.SLIDER && (
            <Form.Group className="mb-3">
              <Form.Label>Выберите категорию</Form.Label>
              <Form.Select
                value={settings.category_id || ''}
                onChange={(e) => handleChange('category_id', Number.parseInt(e.target.value, 10) || null)}
              >
                <option value="">-- Выберите категорию --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {getCategoryDisplayName(cat)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}

          {block.block_type === BLOCK_TYPES.BANNER && (
            <>
              <Form.Group className="mb-3">
                <Form.Label>URL изображения</Form.Label>
                <Form.Control
                  type="text"
                  value={settings.imageUrl || ''}
                  onChange={(e) => handleChange('imageUrl', e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Цвет фона</Form.Label>
                <Form.Control
                  type="text"
                  value={settings.backgroundColor || '#667eea'}
                  onChange={(e) => handleChange('backgroundColor', e.target.value)}
                  placeholder="#4f46e5 или linear-gradient(...)"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Цвет текста</Form.Label>
                <Form.Control
                  type="color"
                  value={settings.textColor || '#ffffff'}
                  onChange={(e) => handleChange('textColor', e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Текст кнопки</Form.Label>
                <Form.Control
                  type="text"
                  value={settings.ctaText || ''}
                  onChange={(e) => handleChange('ctaText', e.target.value)}
                  placeholder="Подробнее"
                />
              </Form.Group>
            </>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Отмена
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Сохранить
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ShowcaseBuilder;
