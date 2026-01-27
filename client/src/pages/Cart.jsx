import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import Badge from 'react-bootstrap/Badge';
import Alert from 'react-bootstrap/Alert';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Cart() {
  const { cart, cartTotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Use saved location from Telegram bot
  const hasLocation = user?.last_latitude && user?.last_longitude;
  const savedCoordinates = hasLocation ? `${user.last_latitude},${user.last_longitude}` : '';
  
  const [formData, setFormData] = useState({
    delivery_address: user?.last_address || '',
    delivery_coordinates: savedCoordinates,
    customer_name: user?.full_name || '',
    customer_phone: user?.phone || '',
    payment_method: 'cash',
    comment: '',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_time: 'asap'
  });

  const [deliveryTimeMode, setDeliveryTimeMode] = useState('asap');

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
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (cart.length === 0) {
      setError('Корзина пуста');
      return;
    }

    if (!formData.delivery_address || !formData.customer_name || !formData.customer_phone) {
      setError('Заполните все обязательные поля');
      return;
    }

    setLoading(true);

    try {
      // Get restaurant_id from first cart item
      const restaurant_id = cart[0]?.restaurant_id;
      
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
        delivery_date: formData.delivery_date || new Date().toISOString().split('T')[0]
      };

      const response = await axios.post(`${API_URL}/orders`, orderData);
      
      clearCart();
      navigate('/orders', { state: { orderCreated: true } });
    } catch (error) {
      setError(error.response?.data?.error || 'Ошибка создания заказа');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <Container className="mt-4">
        <Card>
          <Card.Body className="text-center py-5">
            <h3>Корзина пуста</h3>
            <p className="text-muted">Добавьте товары в корзину</p>
            <Button variant="primary" onClick={() => navigate('/')}>
              Перейти в каталог
            </Button>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <h2 className="mb-4">Корзина</h2>

      <Row>
        <Col md={8}>
          <Card className="mb-4">
            <Card.Body>
              {cart.map(item => (
                <div key={item.id} className="d-flex align-items-center justify-content-between mb-3">
                  <div className="d-flex align-items-center">
                    {item.image_url ? (
                      <img
                        src={item.image_url.startsWith('http') ? item.image_url : `${API_URL.replace('/api', '')}${item.image_url}`}
                        alt={item.name_ru}
                        style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '12px', marginRight: '12px' }}
                      />
                    ) : (
                      <div style={{ width: '72px', height: '72px', background: '#f1f1f1', borderRadius: '12px', marginRight: '12px' }} />
                    )}
                    <div>
                      <div className="fw-semibold">{item.name_ru}</div>
                      <div className="text-muted small">{item.unit}</div>
                      <div className="fw-bold text-primary mt-1">{parseFloat(item.price).toLocaleString()} сум</div>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <div className="d-flex align-items-center gap-2 bg-light px-2 py-1 rounded-pill">
                      <Button
                        variant="light"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        -
                      </Button>
                      <span className="fw-semibold">{item.quantity}</span>
                      <Button
                        variant="light"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <i className="bi bi-trash"></i>
                    </Button>
                  </div>
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card>
            <Card.Body>
              <h5>Оформление заказа</h5>
              
              {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

              <Form onSubmit={handleSubmit} className="mt-3">
                <Form.Group className="mb-3">
                  <Form.Label>Имя <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Телефон <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="tel"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Адрес доставки <span className="text-danger">*</span></Form.Label>
                  {hasLocation && (
                    <Alert variant="success" className="py-2 mb-2">
                      <small>
                        📍 Локация получена из Telegram
                        <br />
                        <a 
                          href={`https://yandex.ru/maps/?pt=${user.last_longitude},${user.last_latitude}&z=17&l=map`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Посмотреть на карте →
                        </a>
                      </small>
                    </Alert>
                  )}
                  {hasLocation && (
                    <div className="mb-2 rounded overflow-hidden" style={{ border: '1px solid #eee' }}>
                      <iframe
                        title="delivery-map"
                        src={`https://yandex.ru/map-widget/v1/?pt=${user.last_longitude},${user.last_latitude}&z=16&l=map`}
                        width="100%"
                        height="200"
                        frameBorder="0"
                      />
                    </div>
                  )}
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    placeholder={hasLocation ? "Уточните адрес (дом, подъезд, квартира)" : "Введите полный адрес доставки"}
                    required
                  />
                  {hasLocation && (
                    <Form.Text className="text-muted">
                      Уточните адрес: номер дома, подъезд, квартира
                    </Form.Text>
                  )}
                </Form.Group>

                <input type="hidden" value={formData.delivery_date} readOnly />

                <Form.Group className="mb-3">
                  <Form.Label>Время доставки</Form.Label>
                  <div className="d-flex gap-2">
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
                      className="mt-2"
                      value={formData.delivery_time}
                      onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                    >
                      {availableTimes.length === 0 && (
                        <option value="">Нет доступного времени на сегодня</option>
                      )}
                      {availableTimes.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </Form.Select>
                  )}
                  <Form.Text className="text-muted">
                    Минимальное время: 45 минут от текущего.
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Способ оплаты</Form.Label>
                  <Form.Select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    <option value="cash">Наличные</option>
                    <option value="card">Карта</option>
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Комментарий</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  />
                </Form.Group>

                <div className="border-top pt-3 mb-3">
                  <div className="d-flex justify-content-between mb-2">
                    <span>Итого:</span>
                    <strong className="fs-5">{cartTotal} сум</strong>
                  </div>
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  className="w-100"
                  disabled={loading}
                >
                  {loading ? 'Оформление...' : 'Оформить заказ'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default Cart;

