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
      [BLOCK_TYPES.GRID_3]: { title: 'Готовая еда' },
      [BLOCK_TYPES.GRID_2]: { title: 'Категории' },
      [BLOCK_TYPES.BANNER]: {
        title: 'Баннер',
        backgroundColor: 'linear-gradient(135deg, var(--primary-light, #6366f1) 0%, var(--primary-color, #4f46e5) 100%)',
        textColor: '#ffffff',
        ctaText: 'Подробнее'
      },
      [BLOCK_TYPES.SLIDER]: { title: 'Популярное' }
    };

    addBlock(blockType, defaultSettings[blockType]);
    setShowBlockTypeModal(false);
  };

  const handleApplyTemplate = (templateKey) => {
    const templates = {
      grid_3_2: [
        { blockType: BLOCK_TYPES.GRID_3, settings: { title: 'Категории 3' } },
        { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Категории 2' } }
      ],
      grid_2_3: [
        { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Категории 2' } },
        { blockType: BLOCK_TYPES.GRID_3, settings: { title: 'Категории 3' } }
      ],
      banner_2: [
        {
          blockType: BLOCK_TYPES.BANNER,
          settings: {
            title: 'Баннер',
            backgroundColor: 'linear-gradient(135deg, var(--primary-light, #6366f1) 0%, var(--primary-color, #4f46e5) 100%)',
            textColor: '#ffffff',
            ctaText: 'Подробнее'
          }
        },
        { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Категории 2' } }
      ],
      grid_2_banner: [
        { blockType: BLOCK_TYPES.GRID_2, settings: { title: 'Категории 2' } },
        {
          blockType: BLOCK_TYPES.BANNER,
          settings: {
            title: 'Баннер',
            backgroundColor: 'linear-gradient(135deg, var(--primary-light, #6366f1) 0%, var(--primary-color, #4f46e5) 100%)',
            textColor: '#ffffff',
            ctaText: 'Подробнее'
          }
        }
      ]
    };

    const payload = templates[templateKey] || [];
    if (payload.length > 0) {
      addBlocks(payload);
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
      } else {
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

  const getBlockStatusText = (block) => {
    if (block.block_type === BLOCK_TYPES.GRID_3 || block.block_type === BLOCK_TYPES.GRID_2) {
      return block.content.length > 0
        ? `Назначено категорий: ${block.content.length}`
        : 'Перетащите категории в эту область';
    }
    if (block.block_type === BLOCK_TYPES.SLIDER) {
      const selectedCategory = categories.find(
        (category) => normalizeId(category?.id) === normalizeId(block?.category_id)
      );
      return selectedCategory
        ? `Категория слайдера: ${getCategoryDisplayName(selectedCategory)}`
        : 'Перетащите сюда категорию или выберите её в настройках блока';
    }
    if (block.block_type === BLOCK_TYPES.BANNER) {
      return block.title ? `Заголовок: ${block.title}` : 'Настройте заголовок, цвет и CTA в настройках блока';
    }
    return '';
  };

  const renderGridBlockCategoryChips = (block) => {
    if (!(block.block_type === BLOCK_TYPES.GRID_3 || block.block_type === BLOCK_TYPES.GRID_2)) return null;
    if (!Array.isArray(block.content) || block.content.length === 0) return null;

    return (
      <div className="block-category-chips">
        {block.content.map((categoryId) => {
          const category = categories.find(
            (item) => normalizeId(item?.id) === normalizeId(categoryId)
          );
          const categoryTitle = category ? getCategoryDisplayName(category) : `Категория #${categoryId}`;
          return (
            <span key={`${block.id}_${categoryId}`} className="block-category-chip">
              <span className="block-category-chip-text">{categoryTitle}</span>
              <button
                type="button"
                className="block-category-chip-remove"
                title="Убрать категорию из блока"
                onClick={() => removeCategoryFromBlock(block.id, categoryId)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    );
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
    const blockCategories = block.content.map((categoryId) => {
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
                      Добавьте блоки справа, чтобы увидеть экран магазина
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

            <div className="quick-blocks">
              <div className="quick-blocks-title">Типы блоков</div>
              <div className="quick-blocks-grid">
                <button
                  type="button"
                  className="quick-block-btn"
                  onClick={() => handleAddBlock(BLOCK_TYPES.GRID_3)}
                >
                  Сетка 3x
                </button>
                <button
                  type="button"
                  className="quick-block-btn"
                  onClick={() => handleAddBlock(BLOCK_TYPES.GRID_2)}
                >
                  Сетка 2x
                </button>
                <button
                  type="button"
                  className="quick-block-btn"
                  onClick={() => handleAddBlock(BLOCK_TYPES.BANNER)}
                >
                  Баннер
                </button>
                <button
                  type="button"
                  className="quick-block-btn"
                  onClick={() => handleAddBlock(BLOCK_TYPES.SLIDER)}
                >
                  Слайдер
                </button>
              </div>
            </div>

            <div className="quick-blocks templates-section">
              <div className="quick-blocks-title">Шаблоны</div>
              <div className="quick-blocks-grid">
                <button
                  type="button"
                  className="quick-block-btn template-btn"
                  onClick={() => handleApplyTemplate('grid_3_2')}
                >
                  3 сверху + 2 снизу
                </button>
                <button
                  type="button"
                  className="quick-block-btn template-btn"
                  onClick={() => handleApplyTemplate('grid_2_3')}
                >
                  2 сверху + 3 снизу
                </button>
                <button
                  type="button"
                  className="quick-block-btn template-btn"
                  onClick={() => handleApplyTemplate('banner_2')}
                >
                  1 сверху + 2 снизу
                </button>
                <button
                  type="button"
                  className="quick-block-btn template-btn"
                  onClick={() => handleApplyTemplate('grid_2_banner')}
                >
                  2 сверху + 1 снизу
                </button>
              </div>
            </div>
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
                <div className="canvas-top-actions">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => setShowBlockTypeModal(true)}
                  >
                    <Plus size={16} /> Добавить блок
                  </Button>
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
                    <div key={block.id} className="canvas-block-wrapper">
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
                      <div className="block-preview">
                        <div
                          className={`preview-content${dropTargetBlockId === block.id ? ' is-drop-target' : ''}`}
                          onDragOver={(e) => handleDragOver(e, block.id)}
                          onDragLeave={() => handleDragLeave(block.id)}
                          onDrop={(e) => handleDropOnBlock(e, block.id)}
                        >
                          {renderBlock(block)}
                        </div>
                        {renderGridBlockCategoryChips(block)}
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
          <Modal.Title>Выберите тип блока</Modal.Title>
        </Modal.Header>
        <Modal.Body>
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
