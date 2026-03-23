import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useShowcase } from '../context/ShowcaseContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import ClientTopBar from '../components/ClientTopBar';
import ClientAccountModal from '../components/ClientAccountModal';
import {
  Grid3Block,
  Grid2Block,
  BannerBlock,
  ProductSliderBlock,
  EmptyShowcaseBlock
} from '../components/ShowcaseBlocks';
import './ShowcaseDisplay.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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

function ShowcaseDisplay() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart } = useCart();
  const { showcaseLayout, showcaseLoading, loadShowcase, showcaseError } = useShowcase();
  const { t } = useLanguage();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSearchField, setShowSearchField] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleCategoryClick = (categoryId) => {
    // Navigate to catalog with filtered category
    navigate('/catalog', { state: { selectedCategoryId: categoryId } });
  };

  const handleProductClick = (product) => {
    navigate('/catalog', { state: { selectedProductId: product.id } });
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
    const blockCategories = block.content
      .map(catId => filteredCategories.find(c => normalizeId(c?.id) === normalizeId(catId)))
      .filter(Boolean);

    switch (block.block_type) {
      case 'grid_3':
        return (
          <Grid3Block
            key={block.id}
            categories={blockCategories}
            products={filteredProducts}
            cartItems={cart}
            onCategoryClick={handleCategoryClick}
            categoryImageFallback={user?.active_restaurant_logo || ''}
          />
        );
      case 'grid_2':
        return (
          <Grid2Block
            key={block.id}
            categories={blockCategories}
            products={filteredProducts}
            cartItems={cart}
            onCategoryClick={handleCategoryClick}
            categoryImageFallback={user?.active_restaurant_logo || ''}
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
      <div className="showcase-header-shell">
        <div className="showcase-header-main">
          <div className="showcase-header-title">
            {user?.active_restaurant_name || 'Магазин'}
          </div>
          <div className="showcase-header-actions">
            <button
              type="button"
              className="showcase-header-btn"
              onClick={() => setShowAccountModal(true)}
              aria-label="Аккаунт"
              title="Аккаунт"
            >
              👤
            </button>
            <button
              type="button"
              className={`showcase-header-btn${showSearchField || normalizedSearch ? ' is-active' : ''}`}
              onClick={() => setShowSearchField((prev) => !prev)}
              aria-label="Поиск"
              title="Поиск"
            >
              🔎
            </button>
          </div>
        </div>

        <ClientTopBar
          logoUrl={user?.active_restaurant_logo || ''}
          logoDisplayMode={user?.active_restaurant_logo_display_mode || 'square'}
          restaurantName={user?.active_restaurant_name || 'Магазин'}
          maxWidth="100%"
          fallback="🏪"
        />

        {showSearchField && (
          <div className="showcase-header-search">
            <input
              type="text"
              className="showcase-header-search-input"
              placeholder="Поиск по витрине..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="showcase-content">
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
