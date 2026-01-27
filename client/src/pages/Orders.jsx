import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Table from 'react-bootstrap/Table';
import Badge from 'react-bootstrap/Badge';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
    
    // Poll for order updates every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API_URL}/orders/my-orders`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'new': { variant: 'primary', text: 'Новый' },
      'preparing': { variant: 'warning', text: 'Готовится' },
      'delivering': { variant: 'info', text: 'Доставляется' },
      'delivered': { variant: 'success', text: 'Доставлен' },
      'cancelled': { variant: 'danger', text: 'Отменен' }
    };
    
    const config = statusConfig[status] || { variant: 'secondary', text: status };
    return <Badge bg={config.variant}>{config.text}</Badge>;
  };

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
              <Nav.Link onClick={() => navigate('/')}>
                <i className="bi bi-shop me-1"></i>
                Каталог
              </Nav.Link>
              <Nav.Link onClick={() => navigate('/cart')}>
                <i className="bi bi-cart-fill me-1"></i>
                Корзина
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
        <h2 className="mb-4">Мои заказы</h2>

        {orders.length === 0 ? (
          <Card>
            <Card.Body className="text-center py-5">
              <h4>У вас пока нет заказов</h4>
              <p className="text-muted">Сделайте ваш первый заказ!</p>
              <button className="btn btn-primary" onClick={() => navigate('/')}>
                Перейти в каталог
              </button>
            </Card.Body>
          </Card>
        ) : (
          <div className="row">
            {orders.map(order => (
              <div key={order.id} className="col-md-6 mb-4">
                <Card>
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div>
                        <h5>Заказ #{order.order_number}</h5>
                        <small className="text-muted">
                          {new Date(order.created_at).toLocaleString('ru-RU')}
                        </small>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="mb-3">
                      <strong>Адрес:</strong> {order.delivery_address}
                    </div>

                    <div className="mb-3">
                      <strong>Сумма:</strong> {order.total_amount} сум
                    </div>

                    <div className="mb-3">
                      <strong>Оплата:</strong> {order.payment_method === 'card' ? 'Карта' : 'Наличные'}
                    </div>

                    {order.items && order.items.length > 0 && (
                      <div className="mb-3">
                        <strong>Товары:</strong>
                        <ul className="mt-2">
                          {order.items.map((item, idx) => (
                            <li key={idx}>
                              {item.product_name} - {item.quantity} {item.unit} × {item.price} = {item.total} сум
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {order.comment && (
                      <div className="mb-3">
                        <strong>Комментарий:</strong> {order.comment}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </div>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}

export default Orders;



