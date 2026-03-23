import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import './ShowcaseBuilder.css';
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Copy,
  Settings as SettingsIcon
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function ShowcaseBuilder() {
  const { user } = useAuth();
  const {
    showcaseLayout,
    showcaseLoading,
    showcaseError,
    isDirty,
    loadShowcase,
    saveShowcase,
    addBlock,
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
  const [blockSettings, setBlockSettings] = useState({});

  const draggedCategoryRef = useRef(null);

  // Load categories and products
  useEffect(() => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;

    const loadData = async () => {
      setCategoriesLoading(true);
      try {
        const [categoriesRes, productsRes] = await Promise.all([
          axios.get(`${API_URL}/products/categories/restaurant/${restaurantId}`),
          axios.get(`${API_URL}/products/restaurant/${restaurantId}`)
        ]);

        // Filter categories that have at least one active product
        const activeCategories = categoriesRes.data.filter(cat =>
          productsRes.data.some(prod =>
            prod.category_id === cat.id && prod.is_active
          )
        );

        setCategories(activeCategories);
        setProducts(productsRes.data);
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
        title: 'Спецпредложение',
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        textColor: '#ffffff',
        ctaText: 'Подробнее'
      },
      [BLOCK_TYPES.SLIDER]: { title: 'Популярное' }
    };

    addBlock(blockType, defaultSettings[blockType]);
    setShowBlockTypeModal(false);
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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDropOnBlock = (e, blockId) => {
    e.preventDefault();
    const categoryId = draggedCategoryRef.current;
    if (categoryId) {
      addCategoryToBlock(blockId, Number.parseInt(categoryId, 10));
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderBlock = (block) => {
    const blockCategories = block.content.map(catId =>
      categories.find(c => c.id === catId)
    ).filter(Boolean);

    switch (block.block_type) {
      case BLOCK_TYPES.GRID_3:
        return (
          <Grid3Block
            categories={blockCategories}
            products={products}
            cartItems={[]}
          />
        );
      case BLOCK_TYPES.GRID_2:
        return (
          <Grid2Block
            categories={blockCategories}
            products={products}
            cartItems={[]}
          />
        );
      case BLOCK_TYPES.BANNER:
        return <BannerBlock block={block} />;
      case BLOCK_TYPES.SLIDER:
        return (
          <ProductSliderBlock
            categoryId={block.category_id}
            products={products}
            cartItems={[]}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="showcase-builder-container">
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
        {/* Left Panel - Categories */}
        <div className="builder-left-panel">
          <div className="panel-section">
            <h3>Ресурсная база</h3>
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
                      ? 'Нет активных категорий'
                      : 'Нет результатов поиска'}
                  </div>
                ) : (
                  filteredCategories.map(category => (
                    <div
                      key={category.id}
                      className="category-item"
                      draggable
                      onDragStart={(e) => handleDragStart(e, category.id)}
                    >
                      {category.image && (
                        <img
                          src={category.image}
                          alt={category.name}
                          className="category-thumbnail"
                        />
                      )}
                      <div className="category-info">
                        <div className="category-name">{category.name}</div>
                        <div className="category-count">
                          {products.filter(p => p.category_id === category.id).length} товаров
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
            <div className="canvas-header">
              <h3>Визуальный холст</h3>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => setShowBlockTypeModal(true)}
              >
                <Plus size={16} /> Добавить блок
              </Button>
            </div>

            {showcaseLoading ? (
              <div className="loading-state">
                <Spinner animation="border" /> Загрузка витрины...
              </div>
            ) : showcaseLayout.length === 0 ? (
              <div className="canvas-empty">
                <div className="empty-canvas-message">
                  <p>Нажмите «Добавить блок» для создания витрины</p>
                </div>
              </div>
            ) : (
              <div className="canvas">
                {showcaseLayout.map((block, index) => (
                  <div key={block.id} className="canvas-block-wrapper">
                    <div className="block-preview">
                      <div
                        className="preview-content"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnBlock(e, block.id)}
                      >
                        {renderBlock(block)}
                      </div>
                      <div className="block-controls">
                        {block.block_type === 'grid_3' ||
                        block.block_type === 'grid_2' ? (
                          <span className="block-info">
                            {block.content.length} категорий
                          </span>
                        ) : block.block_type === 'slider' ? (
                          <span className="block-info">
                            {block.category_id
                              ? 'Категория выбрана'
                              : 'Категория не выбрана'}
                          </span>
                        ) : null}

                        <div className="button-group">
                          {index > 0 && (
                            <button
                              className="btn-icon"
                              onClick={() => reorderBlocks(block.id, 'up')}
                              title="Переместить выше"
                            >
                              <ChevronUp size={18} />
                            </button>
                          )}
                          {index < showcaseLayout.length - 1 && (
                            <button
                              className="btn-icon"
                              onClick={() => reorderBlocks(block.id, 'down')}
                              title="Переместить ниже"
                            >
                              <ChevronDown size={18} />
                            </button>
                          )}
                          <button
                            className="btn-icon"
                            onClick={() => {
                              setSelectedBlock(block);
                              setBlockSettings(block.settings || {});
                              setShowBlockSettingsModal(true);
                            }}
                            title="Настройки блока"
                          >
                            <SettingsIcon size={18} />
                          </button>
                          <button
                            className="btn-icon danger"
                            onClick={() => removeBlock(block.id)}
                            title="Удалить блок"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            if (selectedBlock.block_type === BLOCK_TYPES.SLIDER && settings.category_id) {
              setSliderCategory(selectedBlock.id, settings.category_id);
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
                    {cat.name}
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
                  type="color"
                  value={settings.backgroundColor || '#667eea'}
                  onChange={(e) => handleChange('backgroundColor', e.target.value)}
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
