import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Navbar from 'react-bootstrap/Navbar';
import Form from 'react-bootstrap/Form';
import { useAuth } from '../context/AuthContext';
import { useCart, formatPrice } from '../context/CartContext';
import BottomNav from '../components/BottomNav';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Catalog() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [prevRestaurant, setPrevRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [catalogQtyOpen, setCatalogQtyOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const { user, isOperator } = useAuth();
  const { addToCart, updateQuantity, clearCart, cart } = useCart();
  const navigate = useNavigate();
  
  // Refs for ScrollSpy
  const categoriesRef = useRef({});
  const categoryNavRef = useRef(null);
  const isScrolling = useRef(false);

  // Load restaurants (for header/logo and operator selection)
  useEffect(() => {
    fetchRestaurants();
  }, []);

  // For customers: lock to active_restaurant_id from bot
  useEffect(() => {
    if (!isOperator() && user?.active_restaurant_id) {
      setSelectedRestaurant(user.active_restaurant_id);
    }
  }, [user]);

  // Load products when restaurant changes
  useEffect(() => {
    if (selectedRestaurant) {
      fetchData();
      // Only clear cart if restaurant actually changed (not on first load)
      if (prevRestaurant && prevRestaurant !== selectedRestaurant) {
        clearCart();
      }
      setPrevRestaurant(selectedRestaurant);
    }
  }, [selectedRestaurant]);

  // ScrollSpy: detect which category is in view
  const handleScroll = useCallback(() => {
    if (isScrolling.current || selectedCategory !== null) return;
    
    const scrollTop = window.scrollY + 150; // Offset for sticky header
    let currentCategory = null;
    
    // Only consider non-empty categories
    const visibleCategories = categories.filter(cat => 
      products.some(p => p.category_id === cat.id)
    );
    
    for (const category of visibleCategories) {
      const element = categoriesRef.current[category.id];
      if (element) {
        const rect = element.getBoundingClientRect();
        const offsetTop = rect.top + window.scrollY;
        if (scrollTop >= offsetTop) {
          currentCategory = category.id;
        }
      }
    }
    
    if (currentCategory !== activeCategory) {
      setActiveCategory(currentCategory);
      // Scroll category nav to show active category
      if (categoryNavRef.current && currentCategory) {
        const navItem = categoryNavRef.current.querySelector(`[data-category="${currentCategory}"]`);
        if (navItem) {
          navItem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }
  }, [categories, products, selectedCategory, activeCategory]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to category when clicked
  const scrollToCategory = (categoryId) => {
    if (categoryId === null) {
      setSelectedCategory(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    const element = categoriesRef.current[categoryId];
    if (element) {
      isScrolling.current = true;
      setSelectedCategory(null); // Show all products grouped
      setActiveCategory(categoryId);
      
      const offsetTop = element.getBoundingClientRect().top + window.scrollY - 130;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      
      setTimeout(() => {
        isScrolling.current = false;
      }, 500);
    }
  };

  const fetchRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/products/restaurants/list`);
      setRestaurants(response.data || []);
      
      // Auto-select for operators if not set
      if (isOperator()) {
        if (response.data?.length === 1) {
          setSelectedRestaurant(response.data[0].id);
        } else if (response.data?.length > 0 && !selectedRestaurant) {
          setSelectedRestaurant(response.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching restaurants:', error);
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!selectedRestaurant) return;
    
    setLoading(true);
    try {
      const [categoriesRes, productsRes] = await Promise.all([
        axios.get(`${API_URL}/products/categories?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products?restaurant_id=${selectedRestaurant}`)
      ]);
      
      setCategories(categoriesRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setCategories([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantChange = (e) => {
    const restaurantId = parseInt(e.target.value);
    setSelectedRestaurant(restaurantId);
    setSelectedCategory(null);
  };

  const handleAddToCart = (product) => {
    addToCart({
      ...product,
      restaurant_id: selectedRestaurant
    });
  };

  const getCartItem = (productId) => cart.find(item => item.id === productId);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  // Filter out empty categories (categories with no products)
  const nonEmptyCategories = categories.filter(category => 
    products.some(p => p.category_id === category.id)
  );

  const currentRestaurant = restaurants.find(r => r.id === selectedRestaurant);

  // Product card component
  const renderProductCard = (product) => {
    const cartItem = getCartItem(product.id);
    const hasQty = !!cartItem;
    const qty = cartItem?.quantity || 0;
    const overlayKey = `qty_open_${product.id}`;
    const isOpen = catalogQtyOpen?.[overlayKey];
    
    return (
      <Card className="h-100 shadow-sm border-0">
        <div style={{ position: 'relative' }}>
          {product.image_url ? (
            <Card.Img
              variant="top"
              src={product.image_url.startsWith('http') ? product.image_url : `${API_URL.replace('/api', '')}${product.image_url}`}
              style={{ height: '140px', objectFit: 'cover' }}
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/150?text=No+Image';
              }}
            />
          ) : (
            <div 
              style={{ height: '140px', background: '#f8f9fa' }} 
              className="d-flex align-items-center justify-content-center"
            >
              <span style={{ fontSize: '3rem', opacity: 0.3 }}>🍽️</span>
            </div>
          )}
          {!product.in_stock && (
            <div 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span className="badge bg-secondary">Нет в наличии</span>
            </div>
          )}
          
          {/* Quantity controls on image */}
          {product.in_stock && (
            <>
              {/* Plus button or Quantity circle */}
              {!isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    zIndex: 2
                  }}
                >
                  {!hasQty ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm rounded-circle d-flex align-items-center justify-content-center shadow"
                      style={{ 
                        width: 32, 
                        height: 32,
                        fontSize: '18px',
                        fontWeight: 'bold',
                        padding: 0
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddToCart(product);
                        setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                        setTimeout(() => {
                          setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                        }, 2000);
                      }}
                    >
                      +
                    </button>
                  ) : (
                    <span
                      className="rounded-circle d-inline-flex align-items-center justify-content-center shadow"
                      style={{
                        width: 32,
                        height: 32,
                        background: 'var(--accent-color, #FFD700)',
                        color: '#1a1a1a',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                        setTimeout(() => {
                          setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                        }, 2000);
                      }}
                    >
                      {qty}
                    </span>
                  )}
                </div>
              )}
              
              {/* Expanded controls */}
              {isOpen && (
                <div
                  className="d-flex align-items-center justify-content-between rounded-pill px-1 shadow"
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    background: 'rgba(255,255,255,0.95)',
                    zIndex: 3,
                    minWidth: '90px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                    setTimeout(() => {
                      setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                    }, 2000);
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                    style={{ width: 28, height: 28, fontSize: '16px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(product.id, qty - 1);
                    }}
                  >
                    −
                  </button>
                  <span className="fw-bold px-2" style={{ fontSize: '14px' }}>{qty}</span>
                  <button
                    type="button"
                    className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                    style={{ width: 28, height: 28, fontSize: '16px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(product.id, qty + 1);
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <Card.Body className="d-flex flex-column p-2">
          <Card.Title className="fs-6 mb-1" style={{ fontSize: '0.85rem', lineHeight: '1.2' }}>
            {product.name_ru}
          </Card.Title>
          <Card.Text className="text-muted small mb-1" style={{ fontSize: '0.7rem' }}>
            {product.unit}
          </Card.Text>
          <div className="fw-bold text-primary mt-auto" style={{ fontSize: '0.9rem' }}>
            {formatPrice(product.price)} сум
          </div>
        </Card.Body>
      </Card>
    );
  };

  if (loading && restaurants.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar bg="white" expand="lg" className="shadow-sm mb-4 sticky-top">
        <Container className="justify-content-center">
          <Navbar.Brand className="d-flex align-items-center justify-content-center">
            {currentRestaurant?.logo_url ? (
              <img 
                src={currentRestaurant.logo_url.startsWith('http') ? currentRestaurant.logo_url : `${API_URL.replace('/api', '')}${currentRestaurant.logo_url}`}
                alt={currentRestaurant.name}
                style={{ height: '42px', width: '42px', objectFit: 'cover', borderRadius: '10px' }}
              />
            ) : (
              <span style={{ fontSize: '1.7rem' }}>🍽️</span>
            )}
          </Navbar.Brand>
        </Container>
      </Navbar>

      <Container>
        {/* No restaurants */}
        {restaurants.length === 0 && (
          <div className="text-center py-5">
            <div style={{ fontSize: '4rem' }}>🏪</div>
            <h4 className="mt-3">Рестораны не найдены</h4>
            <p className="text-muted">
              Пока нет активных ресторанов. Пожалуйста, попробуйте позже.
            </p>
          </div>
        )}

        {selectedRestaurant && (
          <>
            {/* Categories - sticky horizontal scroll (only show non-empty) */}
            {nonEmptyCategories.length > 0 && (
              <div 
                ref={categoryNavRef}
                className="mb-3 pb-2 bg-white sticky-top" 
                style={{ 
                  overflowX: 'auto', 
                  whiteSpace: 'nowrap',
                  top: '60px',
                  zIndex: 100,
                  paddingTop: '8px',
                  marginTop: '-8px',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              >
                <Button
                  variant={selectedCategory === null && activeCategory === null ? 'primary' : 'outline-primary'}
                  className="me-2 mb-2"
                  size="sm"
                  onClick={() => scrollToCategory(null)}
                >
                  🍴 Все
                </Button>
                {nonEmptyCategories.map(category => (
                  <Button
                    key={category.id}
                    data-category={category.id}
                    variant={(selectedCategory === category.id || activeCategory === category.id) ? 'primary' : 'outline-primary'}
                    className="me-2 mb-2"
                    size="sm"
                    onClick={() => scrollToCategory(category.id)}
                  >
                    {category.name_ru}
                  </Button>
                ))}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Загрузка...</span>
                </div>
              </div>
            )}

            {/* Products - grouped by category when showing "All" */}
            {!loading && selectedCategory === null && (
              <>
                {nonEmptyCategories.map(category => {
                  const categoryProducts = products.filter(p => p.category_id === category.id);
                  
                  return (
                    <div 
                      key={category.id} 
                      ref={el => categoriesRef.current[category.id] = el}
                      className="mb-4"
                    >
                      <h6 className="mb-3 text-muted fw-bold">{category.name_ru}</h6>
                      <Row>
                        {categoryProducts.map(product => (
                          <Col key={product.id} xs={6} sm={4} md={3} lg={2} className="mb-4">
                            {renderProductCard(product)}
                          </Col>
                        ))}
                      </Row>
                    </div>
                  );
                })}
              </>
            )}
            
            {/* Products - single category selected */}
            {!loading && selectedCategory !== null && (
              <Row>
                {filteredProducts.map(product => (
                  <Col key={product.id} xs={6} sm={4} md={3} lg={2} className="mb-4">
                    {renderProductCard(product)}
                  </Col>
                ))}
              </Row>
            )}

            {/* No products */}
            {!loading && filteredProducts.length === 0 && (
              <div className="text-center py-5">
                <div style={{ fontSize: '4rem', opacity: 0.5 }}>🍽️</div>
                <p className="text-muted mt-3">
                  {products.length === 0 
                    ? 'Товары пока не добавлены' 
                    : 'Товары не найдены в выбранной категории'}
                </p>
                {isOperator() && products.length === 0 && (
                  <Button variant="primary" onClick={() => navigate('/admin')}>
                    Добавить товары
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Container>

      {/* Bottom navigation */}
      {!isOperator() && <BottomNav />}
      
      {/* Spacer for bottom nav */}
      {!isOperator() && <div style={{ height: '70px' }} />}
    </>
  );
}

export default Catalog;
