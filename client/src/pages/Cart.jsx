import React, { useState } from 'react';
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
  
  const [formData, setFormData] = useState({
    delivery_address: '',
    delivery_coordinates: '',
    customer_name: user?.full_name || '',
    customer_phone: user?.phone || '',
    payment_method: 'cash',
    comment: '',
    delivery_date: '',
    delivery_time: ''
  });
  
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
      const orderData = {
        items: cart.map(item => ({
          product_id: item.id,
          product_name: item.name_ru,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price
        })),
        ...formData
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
              <Table responsive>
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Цена</th>
                    <th>Количество</th>
                    <th>Сумма</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div>
                          <strong>{item.name_ru}</strong>
                          <br />
                          <small className="text-muted">{item.unit}</small>
                        </div>
                      </td>
                      <td>{item.price} сум</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            -
                          </Button>
                          <span>{item.quantity}</span>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </td>
                      <td><strong>{item.price * item.quantity} сум</strong></td>
                      <td>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <i className="bi bi-trash"></i>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
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
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Дата доставки</Form.Label>
                  <Form.Control
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Время доставки</Form.Label>
                  <Form.Control
                    type="time"
                    value={formData.delivery_time}
                    onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                  />
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

