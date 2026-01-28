import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Badge from 'react-bootstrap/Badge';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
    fetchRestaurant();
    
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

  const fetchRestaurant = async () => {
    if (user?.active_restaurant_id) {
      try {
        const response = await axios.get(`${API_URL}/products/restaurant/${user.active_restaurant_id}`);
        setRestaurant(response.data);
      } catch (error) {
        console.error('Error fetching restaurant:', error);
      }
    }
  };

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Вы уверены, что хотите отменить заказ?')) return;
    
    setCancelling(orderId);
    try {
      await axios.post(`${API_URL}/orders/${orderId}/cancel`);
      fetchOrders(); // Refresh orders
    } catch (error) {
      alert(error.response?.data?.error || 'Ошибка отмены заказа');
    } finally {
      setCancelling(null);
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
      {/* Simple header */}
      <div className="bg-white shadow-sm py-3 mb-3">
        <Container style={{ maxWidth: '600px' }}>
          <div className="d-flex align-items-center justify-content-center">
            {restaurant?.logo_url && (
              <img 
                src={restaurant.logo_url.startsWith('http') ? restaurant.logo_url : `${API_URL.replace('/api', '')}${restaurant.logo_url}`} 
                alt="Logo" 
                height="36" 
                style={{ objectFit: 'contain' }}
              />
            )}
          </div>
        </Container>
      </div>

      <Container style={{ maxWidth: '600px' }}>

        {orders.length === 0 ? (
          <Card className="border-0 shadow-sm text-center py-5">
            <Card.Body>
              <div style={{ fontSize: '3rem' }}>📦</div>
              <h5 className="mt-3">У вас пока нет заказов</h5>
              <p className="text-muted">Сделайте ваш первый заказ!</p>
              <button className="btn btn-primary" onClick={() => navigate('/')}>
                Перейти в каталог
              </button>
            </Card.Body>
          </Card>
        ) : (
          orders.map(order => (
            <Card key={order.id} className="border-0 shadow-sm mb-3">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <div>
                    <h6 className="mb-0">Заказ #{order.order_number}</h6>
                    <small className="text-muted">
                      {new Date(order.created_at).toLocaleString('ru-RU')}
                    </small>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                <div className="mb-2">
                  <strong>Сумма:</strong> {parseFloat(order.total_amount).toLocaleString()} сум
                </div>

                <div className="mb-2">
                  <strong>Оплата:</strong> {order.payment_method === 'card' ? '💳 Карта' : '💵 Наличные'}
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="mb-2">
                    <strong>Товары:</strong>
                    <ul className="mt-1 mb-0 ps-3" style={{ fontSize: '0.9rem' }}>
                      {order.items.map((item, idx) => (
                        <li key={idx} className="text-muted">
                          {item.product_name} - {item.quantity} {item.unit} × {parseFloat(item.price).toLocaleString()} = {parseFloat(item.total).toLocaleString()} сум
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {order.comment && (
                  <div className="text-muted small mb-2">
                    <strong>Комментарий:</strong> {order.comment}
                  </div>
                )}

                {/* Cancel button - only for 'new' status */}
                {order.status === 'new' && (
                  <button
                    className="btn btn-outline-danger btn-sm w-100 mt-2"
                    onClick={() => cancelOrder(order.id)}
                    disabled={cancelling === order.id}
                  >
                    {cancelling === order.id ? 'Отмена...' : '❌ Отменить заказ'}
                  </button>
                )}
              </Card.Body>
            </Card>
          ))
        )}
        
        {/* Spacer for bottom nav */}
        <div style={{ height: '70px' }} />
      </Container>
      
      {/* Bottom navigation */}
      <BottomNav />
    </>
  );
}

export default Orders;
