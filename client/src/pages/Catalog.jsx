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
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Catalog() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const { addToCart, cartCount } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [categoriesRes, productsRes] = await Promise.all([
        axios.get(`${API_URL}/products/categories`),
        axios.get(`${API_URL}/products`)
      ]);
      
      setCategories(categoriesRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  if (loading) {
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
      <Navbar bg="white" expand="lg" className="shadow-sm mb-4">
        <Container>
          <Navbar.Brand>
            <img src="https://iili.io/KXB1Kut.png" alt="Logo" height="40" />
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Nav>
              <Nav.Link onClick={() => navigate('/orders')}>
                <i className="bi bi-box-seam me-1"></i>
                Мои заказы
              </Nav.Link>
              <Nav.Link onClick={() => navigate('/cart')} className="position-relative">
                <i className="bi bi-cart-fill me-1"></i>
                Корзина
                {cartCount > 0 && (
                  <Badge bg="danger" className="position-absolute top-0 start-100 translate-middle rounded-pill" style={{ fontSize: '0.7rem' }}>
                    {cartCount}
                  </Badge>
                )}
              </Nav.Link>
              <Nav.Link onClick={logout}>
                <i className="bi bi-box-arrow-right me-1"></i>
                Выход
              </Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container>
        <h2 className="mb-4">Каталог товаров</h2>

        {/* Categories */}
        <div className="mb-4">
          <Button
            variant={selectedCategory === null ? 'primary' : 'outline-primary'}
            className="me-2 mb-2"
            onClick={() => setSelectedCategory(null)}
          >
            Все
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

        {/* Products */}
        <Row>
          {filteredProducts.map(product => (
            <Col key={product.id} xs={6} sm={4} md={3} lg={2} className="mb-4">
              <Card className="h-100">
                {product.image_url && (
                  <Card.Img
                    variant="top"
                    src={product.image_url}
                    style={{ height: '150px', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/150';
                    }}
                  />
                )}
                <Card.Body className="d-flex flex-column">
                  <Card.Title className="fs-6">{product.name_ru}</Card.Title>
                  <Card.Text className="text-muted small mb-2">
                    {product.unit}
                  </Card.Text>
                  <div className="mt-auto">
                    <div className="fw-bold text-primary mb-2">
                      {product.price} сум
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-100"
                      onClick={() => addToCart(product)}
                      disabled={!product.in_stock}
                    >
                      {product.in_stock ? 'В корзину' : 'Нет в наличии'}
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        {filteredProducts.length === 0 && (
          <div className="text-center py-5">
            <p className="text-muted">Товары не найдены</p>
          </div>
        )}
      </Container>
    </>
  );
}

export default Catalog;

