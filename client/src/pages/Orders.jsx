import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Badge from 'react-bootstrap/Badge';
import Collapse from 'react-bootstrap/Collapse';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ type: 'complaint', message: '' });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const { user, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  
  const toggleOrderDetails = (orderId) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

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
      'new': { variant: 'primary', text: t('statusNew') },
      'preparing': { variant: 'warning', text: t('statusPreparing') },
      'delivering': { variant: 'info', text: t('statusDelivering') },
      'delivered': { variant: 'success', text: t('statusDelivered') },
      'cancelled': { variant: 'danger', text: t('statusCancelled') }
    };
    
    const config = statusConfig[status] || { variant: 'secondary', text: status };
    return <Badge bg={config.variant}>{config.text}</Badge>;
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!feedbackForm.message.trim()) {
      setFeedbackError(language === 'uz' ? 'Xabar matnini kiriting' : 'Введите текст сообщения');
      return;
    }
    
    setFeedbackLoading(true);
    setFeedbackError('');
    
    try {
      await axios.post(`${API_URL}/orders/feedback`, feedbackForm);
      setFeedbackSuccess(language === 'uz' ? 'Murojaatingiz yuborildi. Rahmat!' : 'Ваше обращение отправлено. Спасибо!');
      setFeedbackForm({ type: 'complaint', message: '' });
      setTimeout(() => {
        setShowFeedbackModal(false);
        setFeedbackSuccess('');
      }, 2000);
    } catch (error) {
      setFeedbackError(error.response?.data?.error || 'Ошибка отправки');
    } finally {
      setFeedbackLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header with language switcher */}
      <div className="bg-white shadow-sm py-3 mb-3">
        <Container style={{ maxWidth: '600px' }}>
          <div className="d-flex align-items-center justify-content-between">
            <div style={{ width: '40px' }} />
            {restaurant?.logo_url ? (
              <img 
                src={restaurant.logo_url.startsWith('http') ? restaurant.logo_url : `${API_URL.replace('/api', '')}${restaurant.logo_url}`} 
                alt="Logo" 
                height="36" 
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '1.5rem' }}>🍽️</span>
            )}
            <button
              onClick={toggleLanguage}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer'
              }}
            >
              <img 
                src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
                alt={language === 'ru' ? 'RU' : 'UZ'}
                style={{ width: '28px', height: '20px', objectFit: 'cover', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
              />
            </button>
          </div>
        </Container>
      </div>

      <Container style={{ maxWidth: '600px' }}>

        {orders.length === 0 ? (
          <Card className="border-0 shadow-sm text-center py-5">
            <Card.Body>
              <div style={{ fontSize: '3rem' }}>📦</div>
              <h5 className="mt-3">{t('noOrders')}</h5>
              <p className="text-muted">{t('makeFirstOrder')}</p>
              <button className="btn btn-primary" onClick={() => navigate('/')}>
                {t('goToCatalog')}
              </button>
            </Card.Body>
          </Card>
        ) : (
          orders.map(order => (
            <Card 
              key={order.id} 
              className="border-0 shadow-sm mb-3"
              style={{ cursor: 'pointer' }}
              onClick={() => toggleOrderDetails(order.id)}
            >
              <Card.Body className="p-3">
                {/* Compact order header - always visible */}
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center">
                    <div 
                      className="rounded-circle d-flex align-items-center justify-content-center me-3"
                      style={{ 
                        width: 40, 
                        height: 40, 
                        background: order.status === 'delivered' ? '#d4edda' : 
                                   order.status === 'cancelled' ? '#f8d7da' : '#e7f1ff',
                        fontSize: '1.2rem'
                      }}
                    >
                      {order.status === 'new' ? '🆕' : 
                       order.status === 'preparing' ? '👨‍🍳' : 
                       order.status === 'delivering' ? '🚚' : 
                       order.status === 'delivered' ? '✅' : '❌'}
                    </div>
                    <div>
                      <div className="fw-bold">#{order.order_number}</div>
                      <small className="text-muted">
                        {new Date(order.created_at).toLocaleDateString('ru-RU')} {new Date(order.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold text-primary">{formatPrice(order.total_amount)} {t('sum')}</div>
                    {getStatusBadge(order.status)}
                  </div>
                </div>

                {/* Expandable details */}
                <Collapse in={expandedOrder === order.id}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <hr className="my-3" />
                    
                    {/* Order items */}
                    {order.items && order.items.length > 0 && (
                      <div className="mb-3">
                        <div className="text-muted small mb-2">{t('orderComposition')}:</div>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="d-flex justify-content-between py-1 border-bottom" style={{ fontSize: '0.9rem' }}>
                            <span>{item.product_name}</span>
                            <span className="text-muted">
                              {item.quantity} × {formatPrice(item.price)} = <strong>{formatPrice(item.total || item.quantity * item.price)}</strong> {t('sum')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Payment method */}
                    <div className="mb-2 small">
                      <span className="text-muted">{t('payment')}:</span>{' '}
                      {order.payment_method === 'click' ? (
                        <><img src="/click.png" alt="Click" style={{ height: 16, marginRight: 4 }} /> Click</>
                      ) : order.payment_method === 'payme' ? (
                        <><img src="/payme.png" alt="Payme" style={{ height: 16, marginRight: 4 }} /> Payme</>
                      ) : (
                        `💵 ${t('cash')}`
                      )}
                    </div>

                    {/* Comment */}
                    {order.comment && (
                      <div className="mb-2 small">
                        <span className="text-muted">{language === 'uz' ? 'Izoh' : 'Комментарий'}:</span> {order.comment}
                      </div>
                    )}

                    {/* Cancel button - only for 'new' status */}
                    {order.status === 'new' && (
                      <button
                        className="btn btn-outline-danger btn-sm w-100 mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelOrder(order.id);
                        }}
                        disabled={cancelling === order.id}
                      >
                        {cancelling === order.id ? t('cancelling') : `❌ ${t('cancelOrder')}`}
                      </button>
                    )}
                  </div>
                </Collapse>
                
                {/* Expand indicator */}
                <div className="text-center mt-2">
                  <small className="text-muted">
                    {expandedOrder === order.id ? `▲ ${t('collapse')}` : `▼ ${t('expand')}`}
                  </small>
                </div>
              </Card.Body>
            </Card>
          ))
        )}
        
        {/* Feedback button */}
        <Card 
          className="border-0 shadow-sm mb-3 text-center mt-4"
          style={{ 
            cursor: 'pointer', 
            backgroundColor: '#fff8e6',
            border: '1px solid #f0d68a !important'
          }}
          onClick={() => setShowFeedbackModal(true)}
        >
          <Card.Body className="py-3">
            <span style={{ fontSize: '1.3rem' }}>💬</span>
            <span className="ms-2 fw-medium" style={{ color: '#8b6914' }}>
              {language === 'uz' ? 'Shikoyat va takliflar' : 'Жалобы и предложения'}
            </span>
          </Card.Body>
        </Card>
        
        {/* Spacer for bottom nav */}
        <div style={{ height: '70px' }} />
      </Container>
      
      {/* Feedback Modal */}
      <Modal show={showFeedbackModal} onHide={() => setShowFeedbackModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {language === 'uz' ? 'Shikoyat va takliflar' : 'Жалобы и предложения'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmitFeedback}>
          <Modal.Body>
            {feedbackSuccess && <Alert variant="success">{feedbackSuccess}</Alert>}
            {feedbackError && <Alert variant="danger">{feedbackError}</Alert>}
            
            <Form.Group className="mb-3">
              <Form.Label>{language === 'uz' ? 'Murojaat turi' : 'Тип обращения'}</Form.Label>
              <Form.Select
                value={feedbackForm.type}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, type: e.target.value })}
              >
                <option value="complaint">{language === 'uz' ? 'Shikoyat' : 'Жалоба'}</option>
                <option value="suggestion">{language === 'uz' ? 'Taklif' : 'Предложение'}</option>
                <option value="question">{language === 'uz' ? 'Savol' : 'Вопрос'}</option>
                <option value="other">{language === 'uz' ? 'Boshqa' : 'Другое'}</option>
              </Form.Select>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>{language === 'uz' ? 'Xabar' : 'Сообщение'} *</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                placeholder={language === 'uz' ? 'Xabaringizni yozing...' : 'Напишите ваше сообщение...'}
                value={feedbackForm.message}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, message: e.target.value })}
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowFeedbackModal(false)}>
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button variant="primary" type="submit" disabled={feedbackLoading}>
              {feedbackLoading 
                ? (language === 'uz' ? 'Yuborilmoqda...' : 'Отправка...') 
                : (language === 'uz' ? 'Yuborish' : 'Отправить')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
      
      {/* Bottom navigation */}
      <BottomNav />
    </>
  );
}

export default Orders;
