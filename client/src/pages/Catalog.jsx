import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import Form from 'react-bootstrap/Form';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Catalog() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, logout, isOperator } = useAuth();
  const { addToCart, cartCount, clearCart } = useCart();
  const navigate = useNavigate();

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
      // Clear cart when switching restaurants
      clearCart();
    }
  }, [selectedRestaurant]);

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  const currentRestaurant = restaurants.find(r => r.id === selectedRestaurant);

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
        <Container>
          <Navbar.Brand className="d-flex align-items-center">
            {currentRestaurant?.logo_url ? (
              <img 
                src={currentRestaurant.logo_url.startsWith('http') ? currentRestaurant.logo_url : `${API_URL.replace('/api', '')}${currentRestaurant.logo_url}`}
                alt={currentRestaurant.name}
                style={{ height: '35px', width: '35px', objectFit: 'cover', borderRadius: '8px', marginRight: '10px' }}
              />
            ) : (
              <span style={{ fontSize: '1.5rem' }} className="me-2">🍽️</span>
            )}
            {isOperator() && restaurants.length > 1 ? (
              <Form.Select 
                size="sm"
                value={selectedRestaurant || ''}
                onChange={handleRestaurantChange}
                style={{ width: 'auto', minWidth: '150px' }}
              >
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Form.Select>
            ) : (
              <span>{currentRestaurant?.name || 'Каталог'}</span>
            )}
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Nav>
              <Nav.Link onClick={() => navigate('/orders')}>
                📦 Заказы
              </Nav.Link>
              <Nav.Link onClick={() => navigate('/cart')} className="position-relative">
                🛒 Корзина
                {cartCount > 0 && (
                  <Badge bg="danger" className="ms-1 rounded-pill">
                    {cartCount}
                  </Badge>
                )}
              </Nav.Link>
              {isOperator() && (
                <Nav.Link onClick={() => navigate('/admin')}>
                  ⚙️ Админ
                </Nav.Link>
              )}
              <Nav.Link onClick={handleLogout}>
                🚪 Выход
              </Nav.Link>
            </Nav>
          </Navbar.Collapse>
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
            {/* Categories */}
            {categories.length > 0 && (
              <div className="mb-4 pb-2" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
                <Button
                  variant={selectedCategory === null ? 'primary' : 'outline-primary'}
                  className="me-2 mb-2"
                  onClick={() => setSelectedCategory(null)}
                >
                  🍴 Все
                </Button>
                {categories.map(category => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? 'primary' : 'outline-primary'}
                    className="me-2 mb-2"
                    onClick={() => setSelectedCategory(category.id)}
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

            {/* Products */}
            {!loading && (
              <Row>
                {filteredProducts.map(product => (
                  <Col key={product.id} xs={6} sm={4} md={3} lg={2} className="mb-4">
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
                            <Badge bg="secondary">Нет в наличии</Badge>
                          </div>
                        )}
                      </div>
                      <Card.Body className="d-flex flex-column p-2">
                        <Card.Title className="fs-6 mb-1" style={{ fontSize: '0.85rem' }}>
                          {product.name_ru}
                        </Card.Title>
                        <Card.Text className="text-muted small mb-2" style={{ fontSize: '0.75rem' }}>
                          {product.unit}
                        </Card.Text>
                        <div className="mt-auto">
                          <div className="fw-bold text-primary mb-2" style={{ fontSize: '0.95rem' }}>
                            {parseFloat(product.price).toLocaleString()} сум
                          </div>
                          <Button
                            variant={product.in_stock ? 'primary' : 'secondary'}
                            size="sm"
                            className="w-100"
                            onClick={() => handleAddToCart(product)}
                            disabled={!product.in_stock}
                          >
                            {product.in_stock ? '+ В корзину' : 'Нет'}
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>
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

      {/* Fixed cart button for mobile */}
      {cartCount > 0 && (
        <div 
          className="d-lg-none position-fixed bottom-0 start-0 end-0 p-3 bg-white shadow-lg"
          style={{ zIndex: 1000 }}
        >
          <Button 
            variant="primary" 
            className="w-100 py-2"
            onClick={() => navigate('/cart')}
          >
            🛒 Корзина ({cartCount})
          </Button>
        </div>
      )}
    </>
  );
}

export default Catalog;
