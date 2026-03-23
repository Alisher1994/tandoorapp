import React, { useState, useEffect, useRef } from 'react';
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
  BannerBlock,
  ProductSliderBlock
} from '../components/ShowcaseBlocks';
import ClientTopBar from '../components/ClientTopBar';
import './ShowcaseBuilder.css';
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Settings as SettingsIcon
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
    blocks: [
      { blockType: BLOCK_TYPES.GRID_3, settings: { title: 'Верхний ряд', maxCategories: 3 } },
      { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Нижний ряд', maxCategories: 2 } }
    ]
  },
  {
    key: 'grid_2_3',
    label: '2 сверху + 3 снизу',
    blocks: [
      { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Верхний ряд', maxCategories: 2 } },
      { blockType: BLOCK_TYPES.GRID_3, settings: { title: 'Нижний ряд', maxCategories: 3 } }
    ]
  },
  {
    key: 'banner_2',
    label: '1 сверху + 2 снизу',
    blocks: [
      { blockType: BLOCK_TYPES.BANNER, settings: DEFAULT_BANNER_SETTINGS },
      { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Нижний ряд', maxCategories: 2 } }
    ]
  },
  {
    key: 'grid_2_banner',
    label: '2 сверху + 1 снизу',
    blocks: [
      { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Верхний ряд', maxCategories: 2 } },
      { blockType: BLOCK_TYPES.BANNER, settings: DEFAULT_BANNER_SETTINGS }
    ]
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

const isProductEnabledForShowcase = (product) => (
  product?.is_active !== false
);

const normalizeId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const isGridBlockType = (blockType) => (
  blockType === BLOCK_TYPES.GRID_3 || blockType === BLOCK_TYPES.GRID_2
);

const getGridCategoryLimit = (block) => {
  if (!block || !isGridBlockType(block.block_type)) return null;
  const settingsLimit = Number.parseInt(block?.settings?.maxCategories, 10);
  if (Number.isInteger(settingsLimit) && settingsLimit > 0) return settingsLimit;
  return DEFAULT_GRID_LIMITS[block.block_type] || null;
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
    isDirty,
    loadShowcase,
    saveShowcase,
    addBlock,
    addBlocks,
    removeBlock,
    updateBlock,
    reorderBlocks,
    addCategoryToBlock,
    removeCategoryFromBlock,
    setSliderCategory
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

  const draggedCategoryRef = useRef(null);

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

  const handleAddBlock = (blockType) => {
    const defaultSettings = {
      [BLOCK_TYPES.GRID_3]: { title: 'Категории 3', maxCategories: 3 },
      [BLOCK_TYPES.GRID_2]: { title: 'Категории 2', maxCategories: 2 },
      [BLOCK_TYPES.BANNER]: DEFAULT_BANNER_SETTINGS,
      [BLOCK_TYPES.SLIDER]: { title: 'Популярное' }
    };

    addBlock(blockType, defaultSettings[blockType]);
    setShowBlockTypeModal(false);
  };

  const handleApplyTemplate = (templateKey) => {
    const selectedTemplate = SHOWCASE_TEMPLATES.find((template) => template.key === templateKey);
    const payload = selectedTemplate?.blocks || [];
    if (payload.length > 0) {
      addBlocks(payload);
      setShowBlockTypeModal(false);
    }
  };

  const handleSaveShowcase = async () => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;

    setSaveLoading(true);
    setSaveSuccess(false);
    setErrorMessage('');

    const success = await saveShowcase(restaurantId, showcaseLayout);
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
        if (limit && content.length >= limit) {
          setErrorMessage(`В блок "${getBlockTypeLabel(targetBlock.block_type)}" можно добавить максимум ${limit} категорий`);
          return;
        }
        addCategoryToBlock(blockId, normalizedCategoryId);
      }
    }
  };

  const handleDragLeave = (blockId) => {
    setDropTargetBlockId((prevBlockId) => (prevBlockId === blockId ? null : prevBlockId));
  };

  const getBlockTypeLabel = (blockType) => {
    switch (blockType) {
      case BLOCK_TYPES.GRID_3:
        return 'Сетка 3x';
      case BLOCK_TYPES.GRID_2:
        return 'Сетка 2x';
      case BLOCK_TYPES.BANNER:
        return 'Баннер';
      case BLOCK_TYPES.SLIDER:
        return 'Слайдер';
      default:
        return 'Блок';
    }
  };

  const getCategoryById = (categoryId) => (
    categories.find((item) => normalizeId(item?.id) === normalizeId(categoryId)) || null
  );

  const renderDropHint = (block) => {
    if (isGridBlockType(block.block_type)) {
      const limit = getGridCategoryLimit(block) || 0;
      const assignedCount = Array.isArray(block.content) ? block.content.length : 0;
      const isFull = limit > 0 && assignedCount >= limit;
      return (
        <div className={`block-drop-hint${isFull ? ' is-full' : ''}`}>
          {isFull
            ? `Лимит заполнен: ${assignedCount}/${limit}. Удалите одну категорию в слотах ниже.`
            : `Перетащите категории сюда (${assignedCount}/${limit})`}
        </div>
      );
    }

    if (block.block_type === BLOCK_TYPES.SLIDER) {
      const selectedCategory = getCategoryById(block.category_id);
      return (
        <div className="block-drop-hint">
          {selectedCategory
            ? `Категория слайдера: ${getCategoryDisplayName(selectedCategory)}`
            : 'Перетащите одну категорию сюда для слайдера'}
        </div>
      );
    }

    if (block.block_type === BLOCK_TYPES.BANNER) {
      return (
        <div className="block-drop-hint">
          Баннер: редактируется через кнопку настроек
        </div>
      );
    }

    return null;
  };

  const renderBlockAssignments = (block) => {
    if (isGridBlockType(block.block_type)) {
      const limit = getGridCategoryLimit(block) || 0;
      const assigned = Array.isArray(block.content) ? block.content.slice(0, limit) : [];
      return (
        <div className="block-slots-wrap">
          <div className="block-slots-title">Слоты категорий: {assigned.length}/{limit}</div>
          <div className={`block-slots-grid ${block.block_type === BLOCK_TYPES.GRID_2 ? 'grid-two' : 'grid-three'}`}>
            {Array.from({ length: limit }).map((_, slotIndex) => {
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

    return null;
  };

  const filteredCategories = categories.filter(cat =>
    getCategoryDisplayName(cat).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryProductCount = (categoryId) => {
    const normalizedCategoryId = normalizeId(categoryId);
    if (!normalizedCategoryId) return 0;
    return products.filter((product) => normalizeId(product.category_id) === normalizedCategoryId).length;
  };

  const renderBlock = (block) => {
    const limit = isGridBlockType(block.block_type) ? getGridCategoryLimit(block) : null;
    const sourceCategoryIds = Array.isArray(block.content)
      ? (limit ? block.content.slice(0, limit) : block.content)
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
        return (
          <Grid3Block
            categories={blockCategories}
            products={products}
            cartItems={[]}
            categoryImageFallback={user?.active_restaurant_logo || ''}
          />
        );
      case BLOCK_TYPES.GRID_2:
        return (
          <Grid2Block
            categories={blockCategories}
            products={products}
            cartItems={[]}
            categoryImageFallback={user?.active_restaurant_logo || ''}
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
                <ClientTopBar
                  logoUrl={user?.active_restaurant_logo || ''}
                  logoDisplayMode={user?.active_restaurant_logo_display_mode || 'square'}
                  restaurantName={user?.active_restaurant_name || 'Мой магазин'}
                  maxWidth="100%"
                  fallback="🏪"
                />
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
                    {categories.length === 0
                      ? 'Нет категорий в магазине'
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
                      {getCategoryImage(category) && (
                        <img
                          src={getCategoryImage(category)}
                          alt={getCategoryDisplayName(category)}
                          className="category-thumbnail"
                        />
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
                      className={`canvas-block-wrapper${dropTargetBlockId === block.id ? ' is-drop-target' : ''}`}
                    >
                      <div className="block-head">
                        <div className="block-head-main">
                          <span className="block-order">#{index + 1}</span>
                          <span className={`block-type-badge type-${block.block_type}`}>
                            {getBlockTypeLabel(block.block_type)}
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
                {template.label}
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
        categories={categories}
        onHide={() => setShowBlockSettingsModal(false)}
        onSave={(settings) => {
          if (selectedBlock) {
            updateBlock(selectedBlock.id, {
              settings,
              title: settings.title || selectedBlock.title
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
    <Modal show={show} onHide={onHide} centered>
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
