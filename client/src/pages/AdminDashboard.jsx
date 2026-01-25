import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Table from 'react-bootstrap/Table';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import Tabs from 'react-bootstrap/Tabs';
import Tab from 'react-bootstrap/Tab';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const { logout } = useAuth();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [statusFilter]);

  const fetchData = async () => {
    try {
      const [ordersRes, productsRes, categoriesRes] = await Promise.all([
        axios.get(`${API_URL}/admin/orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
        axios.get(`${API_URL}/admin/products`),
        axios.get(`${API_URL}/admin/categories`)
      ]);
      
      setOrders(ordersRes.data);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API_URL}/admin/orders/${orderId}/status`, { status: newStatus });
      fetchData();
      setShowOrderModal(false);
    } catch (error) {
      alert('Ошибка обновления статуса');
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

  const openOrderModal = (order) => {
    setSelectedOrder(order);
    setShowOrderModal(true);
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
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
        <Container>
          <Navbar.Brand>Админ-панель</Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Nav>
              <Nav.Link onClick={logout}>Выход</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container>
        <Tabs defaultActiveKey="orders" className="mb-4">
          <Tab eventKey="orders" title="Заказы">
            <Card>
              <Card.Body>
                <div className="mb-3">
                  <Form.Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ maxWidth: '200px' }}
                  >
                    <option value="all">Все статусы</option>
                    <option value="new">Новый</option>
                    <option value="preparing">Готовится</option>
                    <option value="delivering">Доставляется</option>
                    <option value="delivered">Доставлен</option>
                    <option value="cancelled">Отменен</option>
                  </Form.Select>
                </div>

                <Table responsive>
                  <thead>
                    <tr>
                      <th>Номер</th>
                      <th>Клиент</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                      <th>Дата</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order.id}>
                        <td>{order.order_number}</td>
                        <td>
                          <div>
                            <strong>{order.customer_name}</strong>
                            <br />
                            <small>{order.customer_phone}</small>
                          </div>
                        </td>
                        <td>{order.total_amount} сум</td>
                        <td>{getStatusBadge(order.status)}</td>
                        <td>{new Date(order.created_at).toLocaleString('ru-RU')}</td>
                        <td>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => openOrderModal(order)}
                          >
                            Детали
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Tab>

          <Tab eventKey="products" title="Товары">
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between mb-3">
                  <h5>Товары</h5>
                  <Button variant="primary">Добавить товар</Button>
                </div>
                <Table responsive>
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Категория</th>
                      <th>Цена</th>
                      <th>В наличии</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => (
                      <tr key={product.id}>
                        <td>{product.name_ru}</td>
                        <td>{product.category_name || '-'}</td>
                        <td>{product.price} сум</td>
                        <td>
                          {product.in_stock ? (
                            <Badge bg="success">Да</Badge>
                          ) : (
                            <Badge bg="danger">Нет</Badge>
                          )}
                        </td>
                        <td>
                          <Button variant="outline-primary" size="sm" className="me-2">
                            Редактировать
                          </Button>
                          <Button variant="outline-danger" size="sm">
                            Удалить
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Tab>
        </Tabs>

        {/* Order Details Modal */}
        <Modal show={showOrderModal} onHide={() => setShowOrderModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Заказ #{selectedOrder?.order_number}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedOrder && (
              <>
                <div className="mb-3">
                  <strong>Клиент:</strong> {selectedOrder.customer_name}
                </div>
                <div className="mb-3">
                  <strong>Телефон:</strong> {selectedOrder.customer_phone}
                </div>
                <div className="mb-3">
                  <strong>Адрес:</strong> {selectedOrder.delivery_address}
                </div>
                <div className="mb-3">
                  <strong>Сумма:</strong> {selectedOrder.total_amount} сум
                </div>
                <div className="mb-3">
                  <strong>Статус:</strong> {getStatusBadge(selectedOrder.status)}
                </div>

                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="mb-3">
                    <strong>Товары:</strong>
                    <Table className="mt-2">
                      <thead>
                        <tr>
                          <th>Товар</th>
                          <th>Количество</th>
                          <th>Цена</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.product_name}</td>
                            <td>{item.quantity} {item.unit}</td>
                            <td>{item.price} сум</td>
                            <td>{item.total} сум</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}

                <div className="mb-3">
                  <strong>Изменить статус:</strong>
                  <div className="d-flex gap-2 mt-2">
                    {selectedOrder.status !== 'new' && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'new')}
                      >
                        Новый
                      </Button>
                    )}
                    {selectedOrder.status !== 'preparing' && (
                      <Button
                        variant="outline-warning"
                        size="sm"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'preparing')}
                      >
                        Готовится
                      </Button>
                    )}
                    {selectedOrder.status !== 'delivering' && (
                      <Button
                        variant="outline-info"
                        size="sm"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'delivering')}
                      >
                        Доставляется
                      </Button>
                    )}
                    {selectedOrder.status !== 'delivered' && (
                      <Button
                        variant="outline-success"
                        size="sm"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                      >
                        Доставлен
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowOrderModal(false)}>
              Закрыть
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </>
  );
}

export default AdminDashboard;

