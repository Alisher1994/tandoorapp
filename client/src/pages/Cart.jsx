import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useCart, formatPrice } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import OrderReceipt from '../components/OrderReceipt';
import BottomNav from '../components/BottomNav';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Cart() {
  const { cart, cartTotal, productTotal, containerTotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  
  const hasSavedLocation = user?.last_latitude && user?.last_longitude;
  const savedCoordinates = hasSavedLocation ? `${user.last_latitude},${user.last_longitude}` : '';
  
  const [formData, setFormData] = useState({
    delivery_address: user?.last_address || '',
    delivery_coordinates: savedCoordinates,
    customer_name: user?.full_name || 'Клиент',
    customer_phone: user?.phone || '',
    payment_method: 'cash',
    comment: '',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_time: 'asap'
  });

  const [deliveryTimeMode, setDeliveryTimeMode] = useState('asap');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  
  // Ref for comment textarea for keyboard avoidance
  const commentRef = useRef(null);
  
  // Keyboard avoidance - scroll to comment field when focused (works on iOS)
  const handleCommentFocus = () => {
    // Multiple attempts for iOS compatibility
    const scrollToInput = () => {
      if (commentRef.current) {
        // Get scroll container (#root for iOS fix)
        const scrollContainer = document.getElementById('root') || window;
        const rect = commentRef.current.getBoundingClientRect();
        
        // Calculate position to center the input in visible area
        const visualHeight = window.visualViewport?.height || window.innerHeight;
        const targetScroll = scrollContainer === window 
          ? window.scrollY + rect.top - (visualHeight / 3)
          : scrollContainer.scrollTop + rect.top - (visualHeight / 3);
        
        if (scrollContainer === window) {
          window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        } else {
          scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }
        
        // Also use scrollIntoView as fallback
        commentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    
    // Initial scroll
    setTimeout(scrollToInput, 100);
    // Re-scroll after keyboard appears (iOS)
    setTimeout(scrollToInput, 300);
    setTimeout(scrollToInput, 500);
  };
  
  // Handle iOS visualViewport resize (keyboard open/close)
  useEffect(() => {
    const handleResize = () => {
      if (document.activeElement === commentRef.current) {
        setTimeout(() => {
          if (commentRef.current) {
            commentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    };
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);
  
  // Fetch restaurant info for receipt
  useEffect(() => {
    const fetchRestaurant = async () => {
      if (user?.active_restaurant_id) {
        try {
          const res = await axios.get(`${API_URL}/products/restaurant/${user.active_restaurant_id}`);
          setRestaurant(res.data);
        } catch (e) {
          console.error('Error fetching restaurant:', e);
        }
      }
    };
    fetchRestaurant();
  }, [user?.active_restaurant_id]);

  const availableTimes = useMemo(() => {
    const now = new Date();
    const minDate = new Date(now.getTime() + 45 * 60000);
    const stepMinutes = 15;
    const times = [];

    const start = new Date(minDate);
    const minutes = start.getMinutes();
    const rounded = Math.ceil(minutes / stepMinutes) * stepMinutes;
    start.setMinutes(rounded, 0, 0);

    const end = new Date(now);
    end.setHours(23, 45, 0, 0);

    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + stepMinutes * 60000)) {
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      times.push(`${hh}:${mm}`);
    }

    return times;
  }, []);

  useEffect(() => {
    if (deliveryTimeMode === 'scheduled') {
      setFormData(prev => ({ ...prev, delivery_time: availableTimes[0] || '' }));
    } else {
      setFormData(prev => ({ ...prev, delivery_time: 'asap' }));
    }
  }, [deliveryTimeMode, availableTimes]);

  const mapCoordinates = useMemo(() => {
    if (formData.delivery_coordinates) {
      const parts = formData.delivery_coordinates.split(',').map(v => v.trim());
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          return { lat, lng };
        }
      }
    }
    if (hasSavedLocation) {
      return { lat: parseFloat(user.last_latitude), lng: parseFloat(user.last_longitude) };
    }
    return null;
  }, [formData.delivery_coordinates, hasSavedLocation, user]);

  const hasLocation = !!mapCoordinates;

  const useCurrentLocation = () => {
    setLocationLoading(true);
    setError('');
    
    // Try Telegram WebApp LocationManager first
    const tg = window.Telegram?.WebApp;
    if (tg?.LocationManager) {
      tg.LocationManager.init(() => {
        if (tg.LocationManager.isInited && tg.LocationManager.isLocationAvailable) {
          tg.LocationManager.getLocation((location) => {
            if (location) {
              setFormData(prev => ({
                ...prev,
                delivery_coordinates: `${location.latitude},${location.longitude}`
              }));
              setShowLocationModal(false);
            } else {
              setError('Не удалось получить геолокацию через Telegram');
            }
            setLocationLoading(false);
          });
        } else {
          // Fallback to browser geolocation
          fallbackToNavigatorGeolocation();
        }
      });
      return;
    }
    
    // Fallback to browser geolocation
    fallbackToNavigatorGeolocation();
  };
  
  const fallbackToNavigatorGeolocation = () => {
    if (!navigator.geolocation) {
      setError('Геолокация не поддерживается');
      setLocationLoading(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          delivery_coordinates: `${pos.coords.latitude},${pos.coords.longitude}`
        }));
        setShowLocationModal(false);
        setLocationLoading(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Не удалось получить геолокацию. Разрешите доступ к местоположению.');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (cart.length === 0) {
      setError('Корзина пуста');
      return;
    }

    if (!formData.customer_phone) {
      setError('Укажите номер телефона');
      return;
    }
    
    if (!hasLocation && !formData.delivery_address) {
      setError('Укажите адрес доставки');
      return;
    }

    setLoading(true);

    try {
      const restaurant_id = cart[0]?.restaurant_id || user?.active_restaurant_id;
      
      // Если нет адреса но есть локация - указываем что доставка по локации
      const deliveryAddress = formData.delivery_address || (hasLocation ? 'По геолокации' : '');
      
      const orderData = {
        items: cart.map(item => ({
          product_id: item.id,
          product_name: item.name_ru,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price
        })),
        restaurant_id,
        ...formData,
        delivery_address: deliveryAddress,
        customer_name: formData.customer_name || user?.full_name || 'Клиент',
        delivery_date: new Date().toISOString().split('T')[0]
      };

      console.log('📦 Sending order:', JSON.stringify(orderData, null, 2));
      
      const response = await axios.post(`${API_URL}/orders`, orderData);
      console.log('✅ Order created:', response.data);
      
      // Save order info for receipt BEFORE clearing cart
      const orderForReceipt = response.data.order || {
        order_number: response.data.order_number || 'N/A',
        total_amount: orderData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0),
        payment_method: orderData.payment_method
      };
      
      // Store items before clearing
      const itemsForReceipt = [...orderData.items];
      
      // Clear cart first
      clearCart();
      
      // Открываем ссылку на оплату если выбран Click или Payme
      if (formData.payment_method === 'click' && restaurant?.click_url) {
        // Используем Telegram WebApp для открытия ссылки
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(restaurant.click_url);
        } else {
          window.open(restaurant.click_url, '_blank');
        }
      } else if (formData.payment_method === 'payme' && restaurant?.payme_url) {
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(restaurant.payme_url);
        } else {
          window.open(restaurant.payme_url, '_blank');
        }
      }
      
      // Then show receipt
      setCreatedOrder(orderForReceipt);
      setOrderItems(itemsForReceipt);
      setShowReceipt(true);
      
      console.log('📋 Showing receipt:', orderForReceipt);
    } catch (err) {
      console.error('❌ Order error:', err);
      console.error('❌ Response:', err.response?.data);
      console.error('❌ Status:', err.response?.status);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Ошибка создания заказа';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Show receipt if order was created (even if cart is empty now)
  if (showReceipt) {
    const logoUrl = restaurant?.logo_url 
      ? (restaurant.logo_url.startsWith('http') ? restaurant.logo_url : `${API_URL.replace('/api', '')}${restaurant.logo_url}`)
      : null;
    
    return (
      <OrderReceipt 
        order={createdOrder} 
        items={orderItems}
        restaurantLogo={logoUrl}
        restaurantName={restaurant?.name}
        onClose={() => {
          setShowReceipt(false);
          navigate('/orders');
        }}
      />
    );
  }

  if (cart.length === 0) {
    return (
      <>
        <Container className="py-4" style={{ paddingBottom: '80px' }}>
          <Card className="text-center py-5 border-0 shadow-sm">
            <Card.Body>
              <div style={{ fontSize: '4rem' }}>🛒</div>
              <h4 className="mt-3">{t('cartEmpty')}</h4>
              <p className="text-muted">{t('cartEmptyDesc')}</p>
              <Button variant="primary" onClick={() => navigate('/')}>
                {t('goToCatalog')}
              </Button>
            </Card.Body>
          </Card>
        </Container>
        <BottomNav />
      </>
    );
  }

  return (
    <>
      {/* Header with language switcher */}
      <div className="bg-white shadow-sm py-3 mb-3">
        <Container style={{ maxWidth: '500px' }}>
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
      
      <Container className="py-3" style={{ maxWidth: '500px' }}>
        {/* Заголовок с номером шага */}
        <div className="text-center mb-4">
          <h5 className="mb-2">
            {step === 1 ? `🛒 ${t('yourOrder')}` : `📍 ${t('delivery')}`}
          </h5>
        <div className="d-flex justify-content-center gap-2">
          <div 
            className={`rounded-circle d-flex align-items-center justify-content-center ${step >= 1 ? 'bg-primary text-white' : 'bg-light'}`}
            style={{ width: 32, height: 32, fontSize: '0.85rem', fontWeight: 'bold' }}
          >
            1
          </div>
          <div 
            className="align-self-center" 
            style={{ width: 40, height: 2, background: step >= 2 ? '#0d6efd' : '#dee2e6' }}
          />
          <div 
            className={`rounded-circle d-flex align-items-center justify-content-center ${step >= 2 ? 'bg-primary text-white' : 'bg-light'}`}
            style={{ width: 32, height: 32, fontSize: '0.85rem', fontWeight: 'bold' }}
          >
            2
          </div>
        </div>
      </div>

      {error && <Alert variant="danger" className="py-2 mb-3">{error}</Alert>}

      {/* ШАГ 1: Список товаров */}
      {step === 1 && (
        <Card className="border-0 shadow-sm mb-3">
          <Card.Body className="p-0">
            {cart.map((item, index) => (
              <div 
                key={item.id} 
                className={`d-flex align-items-center p-3 ${index !== cart.length - 1 ? 'border-bottom' : ''}`}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url.startsWith('http') ? item.image_url : `${API_URL.replace('/api', '')}${item.image_url}`}
                    alt={item.name_ru}
                    style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }}
                  />
                ) : (
                  <div 
                    className="bg-light d-flex align-items-center justify-content-center"
                    style={{ width: 56, height: 56, borderRadius: 10, fontSize: '1.5rem' }}
                  >
                    🍽️
                  </div>
                )}
                <div className="flex-grow-1 ms-3">
                  <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{language === 'uz' && item.name_uz ? item.name_uz : item.name_ru}</div>
                  <div className="text-primary fw-bold">
                    {formatPrice(item.price)} {t('sum')}
                    {item.container_price > 0 && (
                      <small className="text-muted ms-1">
                        + 🍽 {formatPrice(item.container_price)}
                      </small>
                    )}
                  </div>
                </div>
                <div className="d-flex align-items-center">
                  <div className="d-flex align-items-center bg-light rounded-pill">
                    <Button 
                      variant="link" 
                      className="p-1 px-2 text-dark text-decoration-none" 
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      −
                    </Button>
                    <span className="mx-1 fw-semibold" style={{ minWidth: 20, textAlign: 'center' }}>
                      {item.quantity}
                    </span>
                    <Button 
                      variant="link" 
                      className="p-1 px-2 text-dark text-decoration-none" 
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                  <Button 
                    variant="link" 
                    className="text-danger p-1 ms-2" 
                    onClick={() => removeFromCart(item.id)}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </Card.Body>
        </Card>
      )}

      {/* Комментарий - только на шаге 1 */}
      {step === 1 && (
        <Card className="border-0 shadow-sm mb-3">
          <Card.Body>
            <Form.Group>
              <Form.Label className="small text-muted mb-1">{t('comment')}</Form.Label>
              <Form.Control
                ref={commentRef}
                as="textarea"
                rows={2}
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                onFocus={handleCommentFocus}
                placeholder={t('commentPlaceholder')}
                className="border-0 bg-light"
              />
            </Form.Group>
          </Card.Body>
        </Card>
      )}

      {/* ШАГ 2: Данные доставки */}
      {step === 2 && (
        <Form onSubmit={handleSubmit}>
          <Card className="border-0 shadow-sm mb-3">
            <Card.Body>
              {/* Карта */}
              {hasLocation && (
                <div className="mb-3">
                  <div className="small text-muted mb-1">{t('deliveryPoint')}</div>
                  <div className="rounded overflow-hidden mb-2" style={{ border: '1px solid #eee' }}>
                    <iframe
                      title="map"
                      src={`https://yandex.ru/map-widget/v1/?pt=${mapCoordinates.lng},${mapCoordinates.lat}&z=16&l=map`}
                      width="100%"
                      height="150"
                      frameBorder="0"
                    />
                  </div>
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    className="w-100"
                    onClick={() => setShowLocationModal(true)}
                  >
                    📍 {t('changePoint')}
                  </Button>
                </div>
              )}

              {!hasLocation && (
                <Button 
                  variant="outline-primary" 
                  className="w-100 mb-3"
                  onClick={() => setShowLocationModal(true)}
                >
                  📍 {t('specifyLocation')}
                </Button>
              )}

              {/* Адрес - только если нет локации */}
              {!hasLocation && (
                <Form.Group className="mb-3">
                  <Form.Label className="small text-muted mb-1">
                    Адрес доставки <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    placeholder="Улица, дом, подъезд, квартира"
                    className="border-0 bg-light"
                    required
                  />
                </Form.Group>
              )}

              {/* Телефон */}
              <Form.Group className="mb-3">
                <Form.Label className="small text-muted mb-1">
                  {t('phone')} <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="tel"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  placeholder="+998 90 123 45 67"
                  className="border-0 bg-light"
                  required
                />
              </Form.Group>

              {/* Время доставки */}
              <Form.Group className="mb-3">
                <Form.Label className="small text-muted mb-1">{t('deliveryTime')}</Form.Label>
                <div className="d-flex gap-2 mb-2">
                  <Button
                    variant={deliveryTimeMode === 'asap' ? 'primary' : 'outline-secondary'}
                    size="sm"
                    className="flex-fill"
                    onClick={() => setDeliveryTimeMode('asap')}
                  >
                    🚀 {t('asap')}
                  </Button>
                  <Button
                    variant={deliveryTimeMode === 'scheduled' ? 'primary' : 'outline-secondary'}
                    size="sm"
                    className="flex-fill"
                    onClick={() => setDeliveryTimeMode('scheduled')}
                  >
                    🕐 {t('scheduled')}
                  </Button>
                </div>
                {deliveryTimeMode === 'scheduled' && (
                  <Form.Select
                    value={formData.delivery_time}
                    onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                    className="border-0 bg-light"
                  >
                    {availableTimes.length === 0 ? (
                      <option value="">Нет доступного времени</option>
                    ) : (
                      availableTimes.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))
                    )}
                  </Form.Select>
                )}
              </Form.Group>

              {/* Способ оплаты */}
              <Form.Group>
                <Form.Label className="small text-muted mb-1">{t('paymentMethod')}</Form.Label>
                <div className="d-flex flex-column gap-2">
                  {/* Наличные */}
                  <Button
                    variant={formData.payment_method === 'cash' ? 'success' : 'outline-secondary'}
                    size="sm"
                    className="w-100"
                    onClick={() => setFormData({ ...formData, payment_method: 'cash' })}
                  >
                    💵 {t('cash')}
                  </Button>
                  {/* Click и Payme */}
                  <div className="d-flex gap-2">
                    <Button
                      variant={formData.payment_method === 'click' ? 'success' : 'outline-secondary'}
                      size="sm"
                      className="flex-fill d-flex align-items-center justify-content-center"
                      onClick={() => setFormData({ ...formData, payment_method: 'click' })}
                    >
                      <img src="/click.png" alt="Click" style={{ height: 22 }} />
                    </Button>
                    <Button
                      variant={formData.payment_method === 'payme' ? 'success' : 'outline-secondary'}
                      size="sm"
                      className="flex-fill d-flex align-items-center justify-content-center"
                      onClick={() => setFormData({ ...formData, payment_method: 'payme' })}
                    >
                      <img src="/payme.png" alt="Payme" style={{ height: 22 }} />
                    </Button>
                  </div>
                </div>
              </Form.Group>
            </Card.Body>
          </Card>
        </Form>
      )}

      {/* Итого и кнопки */}
      <Card className="border-0 shadow-sm">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="text-muted">{t('products')}:</span>
            <span>{formatPrice(productTotal)} {t('sum')}</span>
          </div>
          
          {containerTotal > 0 && (
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted">🍽 {t('containers') || 'Посуда'}:</span>
              <span>{formatPrice(containerTotal)} {t('sum')}</span>
            </div>
          )}
          
          <div className="d-flex justify-content-between align-items-center mb-3 pt-2 border-top">
            <span className="text-muted fw-bold">{t('total')}:</span>
            <span className="fs-4 fw-bold text-primary">{formatPrice(cartTotal)} {t('sum')}</span>
          </div>
          
          {step === 1 ? (
            <Button 
              variant="primary" 
              size="lg" 
              className="w-100"
              onClick={() => setStep(2)}
            >
              {t('next')} →
            </Button>
          ) : (
            <div className="d-flex gap-2">
              <Button 
                variant="outline-secondary" 
                className="flex-fill"
                onClick={() => setStep(1)}
              >
                ← {t('back')}
              </Button>
              <Button 
                variant="primary" 
                className="flex-fill"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" /> : t('checkout')}
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Модалка для локации */}
      <Modal show={showLocationModal} onHide={() => setShowLocationModal(false)} centered>
        <Modal.Header closeButton className="border-0">
          <Modal.Title className="fs-5">📍 {t('location')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          <p className="text-muted mb-4">
            {language === 'uz' ? 'Yetkazib berish uchun joriy joylashuvingizni aniqlaymiz' : 'Определим ваше текущее местоположение для доставки'}
          </p>
          <Button 
            variant="primary" 
            size="lg"
            className="w-100 mb-3"
            onClick={useCurrentLocation}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <><Spinner size="sm" className="me-2" />{language === 'uz' ? 'Aniqlanmoqda...' : 'Определение...'}</>
            ) : (
              `📍 ${t('detectLocation')}`
            )}
          </Button>
          <Button 
            variant="light" 
            className="w-100"
            onClick={() => setShowLocationModal(false)}
          >
            {t('cancel')}
          </Button>
        </Modal.Body>
      </Modal>
      
        {/* Spacer for bottom nav */}
        <div style={{ height: '70px' }} />
      </Container>
      
      {/* Bottom navigation */}
      <BottomNav />
    </>
  );
}

export default Cart;
