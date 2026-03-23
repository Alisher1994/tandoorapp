import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useShowcase } from '../context/ShowcaseContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import ClientTopBar from '../components/ClientTopBar';
import {
  Grid3Block,
  Grid2Block,
  BannerBlock,
  ProductSliderBlock,
  EmptyShowcaseBlock
} from '../components/ShowcaseBlocks';
import './ShowcaseDisplay.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function ShowcaseDisplay() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart } = useCart();
  const { showcaseLayout, showcaseLoading, loadShowcase } = useShowcase();
  const { t } = useLanguage();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        setProducts(productsRes.data.filter(p => p.is_active));
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
    // Open product details or add to cart
    // This could open a modal or navigate to product details
    navigate('/catalog', { state: { selectedProductId: product.id } });
  };

  const renderBlock = (block) => {
    const blockCategories = block.content
      .map(catId => categories.find(c => c.id === catId))
      .filter(Boolean);

    switch (block.block_type) {
      case 'grid_3':
        return (
          <Grid3Block
            key={block.id}
            categories={blockCategories}
            products={products}
            cartItems={cart}
            onCategoryClick={handleCategoryClick}
          />
        );
      case 'grid_2':
        return (
          <Grid2Block
            key={block.id}
            categories={blockCategories}
            products={products}
            cartItems={cart}
            onCategoryClick={handleCategoryClick}
          />
        );
      case 'banner':
        return (
          <BannerBlock
            key={block.id}
            block={block}
            onBannerClick={() => {
              // Handle banner click - could navigate to a promo or product
              if (block.content.length > 0) {
                handleCategoryClick(block.content[0]);
              }
            }}
          />
        );
      case 'slider':
        return (
          <ProductSliderBlock
            key={block.id}
            categoryId={block.category_id}
            products={products}
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
      <ClientTopBar />

      <div className="showcase-content">
        <Container fluid className="showcase-inner">
          {error && (
            <div className="alert alert-warning" role="alert">
              {error}
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
    </div>
  );
}

export default ShowcaseDisplay;
