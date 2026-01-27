import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Cart() {
  const { cart, cartTotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Use saved location from Telegram bot
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
      setFormData(prev => ({
        ...prev,
        delivery_time: availableTimes[0] || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        delivery_time: 'asap'
      }));
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
    if (!navigator.geolocation) {
      setError('Геолокация не поддерживается в этом браузере');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          delivery_coordinates: `${pos.coords.latitude},${pos.coords.longitude}`
        }));
        setShowLocationModal(false);
        setLocationLoading(false);
      },
      () => {
        setError('Не удалось получить геолокацию');
        setLocationLoading(false);
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (cart.length === 0) {
      setError('Корзина пуста');
      return;
    }

    if (!formData.delivery_address || !formData.customer_phone) {
      setError('Заполните адрес и телефон');
      return;
    }

    setLoading(true);

    try {
      const restaurant_id = cart[0]?.restaurant_id || user?.active_restaurant_id;
      
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
        customer_name: formData.customer_name || user?.full_name || 'Клиент',
        delivery_date: new Date().toISOString().split('T')[0]
      };

      await axios.post(`${API_URL}/orders`, orderData);
      
      clearCart();
      navigate('/orders', { state: { orderCreated: true } });
    } catch (err) {
      console.error('Order error:', err);
      setError(err.response?.data?.error || 'Ошибка создания заказа');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <Container className="py-4">
        <Card className="text-center py-5">
          <Card.Body>
            <div style={{ fontSize: '4rem' }}>🛒</div>
            <h4 className="mt-3">Корзина пуста</h4>
            <p className="text-muted">Добавьте товары из каталога</p>
            <Button variant="primary" onClick={() => navigate('/')}>
              В каталог
            </Button>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: '600px' }}>
      <h4 className="mb-4">Корзина</h4>

      {/* Список товаров - виден всегда */}
      <Card className="mb-3">
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
                  style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '10px' }}
                />
              ) : (
                <div style={{ width: '60px', height: '60px', background: '#f5f5f5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  🍽️
                </div>
              )}
              <div className="flex-grow-1 ms-3">
                <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>{item.name_ru}</div>
                <div className="text-muted small">{item.unit}</div>
                <div className="fw-bold text-primary">{parseFloat(item.price).toLocaleString()} сум</div>
              </div>
              <div className="d-flex align-items-center">
                <div className="d-flex align-items-center bg-light rounded-pill px-2">
                  <Button variant="link" className="p-1 text-dark" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</Button>
                  <span className="mx-2 fw-semibold">{item.quantity}</span>
                  <Button variant="link" className="p-1 text-dark" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</Button>
                </div>
                <Button variant="link" className="text-danger ms-2 p-1" onClick={() => removeFromCart(item.id)}>🗑️</Button>
              </div>
            </div>
          ))}
        </Card.Body>
      </Card>

      {/* Оформление заказа */}
      <Card>
        <Card.Body>
          <h5 className="mb-3">Оформление заказа</h5>
          
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}

          {/* Степпер */}
          <div className="d-flex mb-4">
            <div 
              className={`flex-fill text-center py-2 rounded-start ${step === 1 ? 'bg-primary text-white' : 'bg-light text-muted'}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setStep(1)}
            >
              <strong>1.</strong> Комментарий
            </div>
            <div 
              className={`flex-fill text-center py-2 rounded-end ${step === 2 ? 'bg-primary text-white' : 'bg-light text-muted'}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setStep(2)}
            >
              <strong>2.</strong> Доставка
            </div>
          </div>

          <Form onSubmit={handleSubmit}>
            {/* ШАГ 1 - Комментарий */}
            {step === 1 && (
              <div>
                <Form.Group className="mb-3">
                  <Form.Label>Комментарий к заказу</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Пожелания к заказу, особые инструкции..."
                  />
                </Form.Group>
                <Button variant="primary" className="w-100" onClick={() => setStep(2)}>
                  Далее →
                </Button>
              </div>
            )}

            {/* ШАГ 2 - Доставка и оплата */}
            {step === 2 && (
              <div>
                {/* Карта */}
                {hasLocation && (
                  <div className="mb-3">
                    <Form.Label>Точка доставки</Form.Label>
                    <div className="rounded overflow-hidden mb-2" style={{ border: '1px solid #ddd' }}>
                      <iframe
                        title="delivery-map"
                        src={`https://yandex.ru/map-widget/v1/?pt=${mapCoordinates.lng},${mapCoordinates.lat}&z=16&l=map`}
                        width="100%"
                        height="180"
                        frameBorder="0"
                      />
                    </div>
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      className="w-100"
                      onClick={() => setShowLocationModal(true)}
                    >
                      📍 Изменить местоположение
                    </Button>
                  </div>
                )}

                {!hasLocation && (
                  <div className="mb-3">
                    <Button 
                      variant="outline-primary" 
                      className="w-100"
                      onClick={() => setShowLocationModal(true)}
                    >
                      📍 Указать местоположение
                    </Button>
                  </div>
                )}

                {/* Адрес */}
                <Form.Group className="mb-3">
                  <Form.Label>Адрес доставки <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    placeholder="Улица, дом, подъезд, квартира"
                    required
                  />
                </Form.Group>

                {/* Телефон */}
                <Form.Group className="mb-3">
                  <Form.Label>Телефон <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="tel"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    placeholder="+998 90 123 45 67"
                    required
                  />
                </Form.Group>

                {/* Время доставки */}
                <Form.Group className="mb-3">
                  <Form.Label>Время доставки</Form.Label>
                  <div className="d-flex gap-3 mb-2">
                    <Form.Check
                      type="radio"
                      id="time-asap"
                      label="Как можно быстрее"
                      checked={deliveryTimeMode === 'asap'}
                      onChange={() => setDeliveryTimeMode('asap')}
                    />
                    <Form.Check
                      type="radio"
                      id="time-scheduled"
                      label="Выбрать время"
                      checked={deliveryTimeMode === 'scheduled'}
                      onChange={() => setDeliveryTimeMode('scheduled')}
                    />
                  </div>
                  {deliveryTimeMode === 'scheduled' && (
                    <Form.Select
                      value={formData.delivery_time}
                      onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
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
                <Form.Group className="mb-4">
                  <Form.Label>Способ оплаты</Form.Label>
                  <Form.Select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    <option value="cash">💵 Наличные</option>
                    <option value="card">💳 Карта</option>
                  </Form.Select>
                </Form.Group>

                {/* Кнопки */}
                <div className="d-flex gap-2">
                  <Button variant="outline-secondary" className="flex-fill" onClick={() => setStep(1)}>
                    ← Назад
                  </Button>
                  <Button variant="primary" type="submit" className="flex-fill" disabled={loading}>
                    {loading ? <Spinner size="sm" /> : 'Оформить заказ'}
                  </Button>
                </div>
              </div>
            )}
          </Form>

          {/* Итого */}
          <div className="border-top mt-3 pt-3 d-flex justify-content-between align-items-center">
            <span className="text-muted">Итого:</span>
            <strong className="fs-4 text-primary">{cartTotal.toLocaleString()} сум</strong>
          </div>
        </Card.Body>
      </Card>

      {/* Модалка для изменения локации - БЕЗ координат! */}
      <Modal show={showLocationModal} onHide={() => setShowLocationModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>📍 Местоположение</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          <p className="text-muted mb-4">
            Нажмите кнопку ниже, чтобы определить ваше текущее местоположение
          </p>
          <Button 
            variant="primary" 
            size="lg"
            className="w-100 mb-3"
            onClick={useCurrentLocation}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Определение...
              </>
            ) : (
              '📍 Определить моё местоположение'
            )}
          </Button>
          <Button 
            variant="outline-secondary" 
            className="w-100"
            onClick={() => setShowLocationModal(false)}
          >
            Отмена
          </Button>
        </Modal.Body>
      </Modal>
    </Container>
  );
}

export default Cart;
