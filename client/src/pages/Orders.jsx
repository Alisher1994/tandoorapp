import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Badge from 'react-bootstrap/Badge';
import Collapse from 'react-bootstrap/Collapse';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import { PageSkeleton } from '../components/SkeletonUI';
import ClientEmptyState from '../components/ClientEmptyState';
import ClientTopBar from '../components/ClientTopBar';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const normalizeContainerNorm = (value, fallback = 1) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};
const resolveContainerUnits = (quantityValue, normValue) => {
  const quantity = Number.parseFloat(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.ceil(quantity / normalizeContainerNorm(normValue, 1));
};

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState('');
  const [isPaymentStatusPolling, setIsPaymentStatusPolling] = useState(false);
  const { user } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const location = useLocation();
  const paymeOrderId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Number.parseInt(params.get('payme_order_id'), 10);
  }, [location.search]);
  
  const toggleOrderDetails = (orderId) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  useEffect(() => {
    fetchOrders();
    fetchRestaurant();
    
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(paymeOrderId) || paymeOrderId <= 0) {
      setPaymentStatusMessage('');
      setIsPaymentStatusPolling(false);
      return undefined;
    }

    let attempts = 0;
    setIsPaymentStatusPolling(true);
    fetchOrders();

    const interval = setInterval(() => {
      attempts += 1;
      fetchOrders();
      if (attempts >= 20) {
        clearInterval(interval);
        setIsPaymentStatusPolling(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymeOrderId]);

  useEffect(() => {
    if (!Number.isInteger(paymeOrderId) || paymeOrderId <= 0) return;
    const order = orders.find((entry) => Number(entry.id) === paymeOrderId);
    if (!order) {
      setPaymentStatusMessage('Платеж найден, заказ еще обрабатывается.');
      return;
    }

    if (order.payment_status === 'paid') {
      setPaymentStatusMessage('Оплата Payme прошла успешно.');
      setIsPaymentStatusPolling(false);
      return;
    }

    if (order.payment_status === 'cancelled' || order.payment_status === 'refunded') {
      setPaymentStatusMessage('Оплата Payme не была завершена.');
      setIsPaymentStatusPolling(false);
      return;
    }

    setPaymentStatusMessage('Ожидаем подтверждение оплаты от Payme...');
  }, [orders, paymeOrderId]);

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

  if (loading) {
    return <PageSkeleton fullscreen label={t('loading')} cards={5} />;
  }

  return (
    <div className="client-page">
      <ClientTopBar
        logoUrl={restaurant?.logo_url}
        logoDisplayMode={restaurant?.logo_display_mode}
        restaurantName={restaurant?.name || 'Tandoor'}
        language={language}
        onToggleLanguage={toggleLanguage}
        fallback="🍽️"
        maxWidth="600px"
        sticky
      />

      <Container className="client-content client-content--narrow">

        {orders.length === 0 ? (
          <ClientEmptyState
            emoji="📦"
            message={t('noOrders')}
            subMessage={t('makeFirstOrder')}
          />
        ) : (
          <>
            {paymentStatusMessage && (
              <Alert variant={paymentStatusMessage.includes('успешно') ? 'success' : 'info'} className="border-0 shadow-sm">
                <div className="d-flex align-items-center justify-content-between gap-3">
                  <span>{paymentStatusMessage}</span>
                  {isPaymentStatusPolling && <Spinner animation="border" size="sm" />}
                </div>
              </Alert>
            )}
            {orders.map(order => (
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
                      <div className="fw-bold">№{order.order_number}</div>
                      <small className="text-muted">
                        {new Date(order.created_at).toLocaleDateString('ru-RU')} {new Date(order.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold text-primary">{formatPrice(order.total_amount)} {t('sum')}</div>
                    {getStatusBadge(order.status)}
                    {order.payment_method === 'payme' && (
                      <div className="small text-muted mt-1">
                        {order.payment_status === 'paid'
                          ? 'Payme: оплачено'
                          : order.payment_status === 'pending'
                            ? 'Payme: ожидает'
                            : order.payment_status === 'cancelled'
                              ? 'Payme: отменено'
                              : order.payment_status === 'refunded'
                                ? 'Payme: возврат'
                                : 'Payme'}
                      </div>
                    )}
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
                        {order.items.map((item, idx) => {
                          const containerUnits = resolveContainerUnits(item.quantity, item.container_norm);
                          const containerPrice = Number.parseFloat(item.container_price) || 0;
                          return (
                          <div key={idx} className="py-1 border-bottom" style={{ fontSize: '0.9rem' }}>
                            <div className="d-flex justify-content-between">
                              <span>{idx + 1}. {item.product_name}</span>
                              <span className="text-muted">
                                {item.quantity} × {formatPrice(item.price)} = <strong>{formatPrice(item.total || item.quantity * item.price)}</strong> {t('sum')}
                              </span>
                            </div>
                            {containerPrice > 0 && containerUnits > 0 && (
                              <div className="d-flex justify-content-between ps-3" style={{ fontSize: '0.8rem', color: '#888' }}>
                                <span>🍽 {item.container_name || 'Посуда'}</span>
                                <span>
                                  {containerUnits} × {formatPrice(containerPrice)} = {formatPrice(containerUnits * containerPrice)} {t('sum')}
                                </span>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Delivery cost */}
                    {parseFloat(order.delivery_cost) > 0 && (
                      <div className="mb-2 small">
                        <span className="text-muted">🚗 {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}:</span>{' '}
                        <strong>{formatPrice(order.delivery_cost)}</strong> {t('sum')}
                        {parseFloat(order.delivery_distance_km) > 0 && (
                          <span className="text-muted ms-1">({order.delivery_distance_km} км)</span>
                        )}
                      </div>
                    )}

                    {/* Payment method */}
                    <div className="mb-2 small">
                      <span className="text-muted">{t('payment')}:</span>{' '}
                      {order.payment_method === 'click' ? (
                        <img src="/click.png" alt="Click" style={{ height: 16, verticalAlign: 'middle' }} />
                      ) : order.payment_method === 'payme' ? (
                        <img src="/payme.png" alt="Payme" style={{ height: 16, verticalAlign: 'middle' }} />
                      ) : order.payment_method === 'uzum' ? (
                        <img src="/uzum.png" alt="Uzum" style={{ height: 16, verticalAlign: 'middle' }} />
                      ) : order.payment_method === 'xazna' ? (
                        <img src="/xazna.png" alt="Xazna" style={{ height: 16, verticalAlign: 'middle' }} />
                      ) : order.payment_method === 'card' ? (
                        '💳 Карта'
                      ) : (
                        `💵 ${t('cash')}`
                      )}
                    </div>

                    {order.payment_method === 'payme' && (
                      <div className="mb-2 small">
                        <span className="text-muted">Статус оплаты:</span>{' '}
                        <strong>{order.payment_status || 'pending'}</strong>
                        {order.payment_paid_at && (
                          <span className="text-muted">
                            {' '}• {new Date(order.payment_paid_at).toLocaleString('ru-RU')}
                          </span>
                        )}
                      </div>
                    )}

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
            ))}
          </>
        )}

        <div className="client-bottom-space" />
      </Container>

      <BottomNav />
    </div>
  );
}

export default Orders;
