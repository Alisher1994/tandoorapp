import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Container, Row, Col, Card, Table, Button, Form, Modal, 
  Tabs, Tab, Badge, Navbar, Nav, Alert, Pagination, Spinner
} from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

// Lazy load map component (heavy)
const DeliveryZoneMap = lazy(() => import('../components/DeliveryZoneMap'));

const API_URL = import.meta.env.VITE_API_URL || '/api';

function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [activeTab, setActiveTab] = useState('restaurants');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Data
  const [stats, setStats] = useState({});
  const [restaurants, setRestaurants] = useState([]);
  const [operators, setOperators] = useState([]);
  const [customers, setCustomers] = useState({ customers: [], total: 0 });
  const [logs, setLogs] = useState({ logs: [] });
  
  // Modals
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [editingOperator, setEditingOperator] = useState(null);
  
  // Forms
  const [restaurantForm, setRestaurantForm] = useState({
    name: '',
    address: '',
    phone: '',
    logo_url: '',
    delivery_zone: null,
    telegram_bot_token: '',
    telegram_group_id: '',
    open_time: '',
    close_time: ''
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [operatorForm, setOperatorForm] = useState({
    username: '', password: '', full_name: '', phone: '', restaurant_ids: []
  });
  
  // Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [logsFilter, setLogsFilter] = useState({
    action_type: '', entity_type: '', page: 1
  });
  
  // Customer order history modal
  const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState({ orders: [], total: 0 });
  const [orderHistoryPage, setOrderHistoryPage] = useState(1);
  const [loadingOrders, setLoadingOrders] = useState(false);
  
  // Order detail modal
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Load data on tab change
  useEffect(() => {
    loadStats();
    if (activeTab === 'restaurants') loadRestaurants();
    if (activeTab === 'operators') loadOperators();
    if (activeTab === 'customers') loadCustomers();
    if (activeTab === 'logs') loadLogs();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'customers') loadCustomers();
  }, [customerPage, customerSearch, customerStatusFilter]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [logsFilter]);

  // API calls
  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Load stats error:', err);
    }
  };

  const loadRestaurants = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants`);
      setRestaurants(response.data);
    } catch (err) {
      setError('Ошибка загрузки ресторанов');
    } finally {
      setLoading(false);
    }
  };

  const loadOperators = async () => {
    setLoading(true);
    try {
      const [operatorsRes, restaurantsRes] = await Promise.all([
        axios.get(`${API_URL}/superadmin/operators`),
        axios.get(`${API_URL}/superadmin/restaurants`)
      ]);
      setOperators(operatorsRes.data);
      setRestaurants(restaurantsRes.data);
    } catch (err) {
      setError('Ошибка загрузки операторов');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/customers`, {
        params: { page: customerPage, search: customerSearch, status: customerStatusFilter, limit: 20 }
      });
      setCustomers(response.data);
    } catch (err) {
      setError('Ошибка загрузки клиентов');
    } finally {
      setLoading(false);
    }
  };
  
  // Load customer order history
  const loadCustomerOrders = async (customerId, page = 1) => {
    setLoadingOrders(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/customers/${customerId}/orders`, {
        params: { page, limit: 10 }
      });
      setCustomerOrders(response.data);
      setSelectedCustomer(response.data.customer);
    } catch (err) {
      setError('Ошибка загрузки заказов клиента');
    } finally {
      setLoadingOrders(false);
    }
  };
  
  // Open order history modal
  const openOrderHistory = (customer) => {
    setSelectedCustomer(customer);
    setOrderHistoryPage(1);
    loadCustomerOrders(customer.id, 1);
    setShowOrderHistoryModal(true);
  };
  
  // Toggle customer block status
  const handleToggleCustomerBlock = async (customer) => {
    const action = customer.is_active ? 'заблокировать' : 'разблокировать';
    if (!window.confirm(`Вы уверены, что хотите ${action} клиента ${customer.full_name || customer.username}?`)) {
      return;
    }
    
    try {
      const response = await axios.put(`${API_URL}/superadmin/customers/${customer.id}/toggle-block`);
      setSuccess(response.data.message);
      loadCustomers();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка изменения статуса клиента');
    }
  };
  
  // Delete customer
  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`Удалить клиента ${customer.full_name || customer.username}? Это действие нельзя отменить.`)) {
      return;
    }
    
    try {
      const response = await axios.delete(`${API_URL}/superadmin/customers/${customer.id}`);
      setSuccess(response.data.message);
      loadCustomers();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления клиента');
    }
  };
  
  // View order detail
  const openOrderDetail = (order) => {
    setSelectedOrder(order);
    setShowOrderDetailModal(true);
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/logs`, {
        params: { ...logsFilter, limit: 50 }
      });
      setLogs(response.data);
    } catch (err) {
      setError('Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  };

  // Logo upload handler
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const response = await axios.post(`${API_URL}/upload`, formData);
      setRestaurantForm({ ...restaurantForm, logo_url: response.data.imageUrl });
      setSuccess('Логотип загружен');
    } catch (err) {
      setError('Ошибка загрузки логотипа');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Restaurant handlers
  const openRestaurantModal = (restaurant = null) => {
    if (restaurant) {
      setEditingRestaurant(restaurant);
      setRestaurantForm({
        name: restaurant.name || '',
        address: restaurant.address || '',
        phone: restaurant.phone || '',
        logo_url: restaurant.logo_url || '',
        delivery_zone: restaurant.delivery_zone || null,
        telegram_bot_token: restaurant.telegram_bot_token || '',
        telegram_group_id: restaurant.telegram_group_id || '',
        open_time: restaurant.open_time || '',
        close_time: restaurant.close_time || ''
      });
    } else {
      setEditingRestaurant(null);
      setRestaurantForm({
        name: '',
        address: '',
        phone: '',
        logo_url: '',
        delivery_zone: null,
        telegram_bot_token: '',
        telegram_group_id: '',
        open_time: '',
        close_time: ''
      });
    }
    setShowRestaurantModal(true);
  };

  const handleSaveRestaurant = async () => {
    try {
      if (editingRestaurant) {
        await axios.put(`${API_URL}/superadmin/restaurants/${editingRestaurant.id}`, restaurantForm);
        setSuccess('Ресторан обновлен');
      } else {
        await axios.post(`${API_URL}/superadmin/restaurants`, restaurantForm);
        setSuccess('Ресторан создан');
      }
      setShowRestaurantModal(false);
      loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения ресторана');
    }
  };

  const handleDeleteRestaurant = async (id) => {
    if (!window.confirm('Удалить этот ресторан?')) return;
    try {
      await axios.delete(`${API_URL}/superadmin/restaurants/${id}`);
      setSuccess('Ресторан удален');
      loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления ресторана');
    }
  };

  const handleToggleRestaurant = async (restaurant) => {
    try {
      await axios.put(`${API_URL}/superadmin/restaurants/${restaurant.id}`, {
        is_active: !restaurant.is_active
      });
      loadRestaurants();
    } catch (err) {
      setError('Ошибка изменения статуса');
    }
  };

  // Operator handlers
  const openOperatorModal = (operator = null) => {
    if (operator) {
      setEditingOperator(operator);
      setOperatorForm({
        username: operator.username || '',
        password: '',
        full_name: operator.full_name || '',
        phone: operator.phone || '',
        restaurant_ids: operator.restaurants?.map(r => r.id) || []
      });
    } else {
      setEditingOperator(null);
      setOperatorForm({
        username: '', password: '', full_name: '', phone: '', restaurant_ids: []
      });
    }
    setShowOperatorModal(true);
  };

  const handleSaveOperator = async () => {
    try {
      if (editingOperator) {
        const data = { ...operatorForm };
        if (!data.password) delete data.password;
        await axios.put(`${API_URL}/superadmin/operators/${editingOperator.id}`, data);
        setSuccess('Оператор обновлен');
      } else {
        if (!operatorForm.password) {
          setError('Пароль обязателен для нового оператора');
          return;
        }
        await axios.post(`${API_URL}/superadmin/operators`, operatorForm);
        setSuccess('Оператор создан');
      }
      setShowOperatorModal(false);
      loadOperators();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения оператора');
    }
  };

  const handleDeleteOperator = async (id) => {
    if (!window.confirm('Деактивировать этого оператора?')) return;
    try {
      await axios.delete(`${API_URL}/superadmin/operators/${id}`);
      setSuccess('Оператор деактивирован');
      loadOperators();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления оператора');
    }
  };

  // Format helpers
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('ru-RU');
  };

  const getActionTypeLabel = (type) => {
    const labels = {
      'create_product': 'Создание товара',
      'update_product': 'Изменение товара',
      'delete_product': 'Удаление товара',
      'create_category': 'Создание категории',
      'update_category': 'Изменение категории',
      'delete_category': 'Удаление категории',
      'process_order': 'Обработка заказа',
      'update_order_status': 'Изменение статуса заказа',
      'cancel_order': 'Отмена заказа',
      'create_user': 'Создание пользователя',
      'update_user': 'Изменение пользователя',
      'delete_user': 'Удаление пользователя',
      'block_user': 'Блокировка пользователя',
      'unblock_user': 'Разблокировка пользователя',
      'create_restaurant': 'Создание ресторана',
      'update_restaurant': 'Изменение ресторана',
      'delete_restaurant': 'Удаление ресторана',
      'login': 'Вход в систему',
      'logout': 'Выход из системы'
    };
    return labels[type] || type;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-vh-100 bg-light">
      {/* Header */}
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
        <Container>
          <Navbar.Brand>🏢 Супер-Админ панель</Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Nav>
              <Nav.Link onClick={() => navigate('/admin')}>Панель оператора</Nav.Link>
              <Nav.Link className="text-light">👤 {user?.full_name || user?.username}</Nav.Link>
              <Nav.Link onClick={handleLogout}>Выход</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container>
        {/* Alerts */}
        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

        {/* Stats */}
        <Row className="mb-4">
          <Col md={3}>
            <Card className="text-center border-0 shadow-sm">
              <Card.Body>
                <h3 className="text-primary">{stats.restaurants_count || 0}</h3>
                <small className="text-muted">Рестораны</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center border-0 shadow-sm">
              <Card.Body>
                <h3 className="text-success">{stats.operators_count || 0}</h3>
                <small className="text-muted">Операторы</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center border-0 shadow-sm">
              <Card.Body>
                <h3 className="text-info">{stats.customers_count || 0}</h3>
                <small className="text-muted">Клиенты</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="text-center border-0 shadow-sm">
              <Card.Body>
                <h3 className="text-warning">{stats.new_orders_count || 0}</h3>
                <small className="text-muted">Новых заказов</small>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Main Content */}
        <Card className="border-0 shadow-sm">
          <Card.Body>
            <Tabs activeKey={activeTab} onSelect={setActiveTab} className="mb-4">
              
              {/* Restaurants Tab */}
              <Tab eventKey="restaurants" title="🏪 Рестораны">
                <div className="d-flex justify-content-between mb-3">
                  <h5>Управление ресторанами</h5>
                  <Button variant="primary" onClick={() => openRestaurantModal()}>
                    + Добавить ресторан
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <Table responsive hover>
                    <thead className="table-light">
                      <tr>
                        <th>ID</th>
                        <th>Логотип</th>
                        <th>Название</th>
                        <th>Адрес</th>
                        <th>Зона доставки</th>
                        <th>Telegram</th>
                        <th>Статус</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restaurants.map(r => (
                        <tr key={r.id}>
                          <td>{r.id}</td>
                          <td>
                            {r.logo_url ? (
                              <img 
                                src={r.logo_url.startsWith('http') ? r.logo_url : `${API_URL.replace('/api', '')}${r.logo_url}`}
                                alt={r.name}
                                style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px' }}
                              />
                            ) : (
                              <div style={{ width: '40px', height: '40px', background: '#f0f0f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                🏪
                              </div>
                            )}
                          </td>
                          <td><strong>{r.name}</strong></td>
                          <td>{r.address || '-'}</td>
                          <td>
                            {r.delivery_zone ? (
                              <Badge bg="success">🗺️ Настроена</Badge>
                            ) : (
                              <Badge bg="secondary">Не настроена</Badge>
                            )}
                          </td>
                          <td>
                            {r.telegram_bot_token ? (
                              <Badge bg="success">✓</Badge>
                            ) : (
                              <Badge bg="secondary">✗</Badge>
                            )}
                          </td>
                          <td>
                            <Form.Check 
                              type="switch"
                              checked={r.is_active}
                              onChange={() => handleToggleRestaurant(r)}
                              label={r.is_active ? 'Да' : 'Нет'}
                            />
                          </td>
                          <td>
                            <Button variant="outline-primary" size="sm" className="me-2" onClick={() => openRestaurantModal(r)}>
                              ✏️
                            </Button>
                            <Button variant="outline-danger" size="sm" onClick={() => handleDeleteRestaurant(r.id)}>
                              🗑️
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {restaurants.length === 0 && (
                        <tr><td colSpan="8" className="text-center text-muted">Нет ресторанов</td></tr>
                      )}
                    </tbody>
                  </Table>
                )}
              </Tab>

              {/* Operators Tab */}
              <Tab eventKey="operators" title="👥 Операторы">
                <div className="d-flex justify-content-between mb-3">
                  <h5>Управление операторами</h5>
                  <Button variant="primary" onClick={() => openOperatorModal()}>
                    + Добавить оператора
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <Table responsive hover>
                    <thead className="table-light">
                      <tr>
                        <th>ID</th>
                        <th>Логин</th>
                        <th>ФИО</th>
                        <th>Телефон</th>
                        <th>Роль</th>
                        <th>Рестораны</th>
                        <th>Статус</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operators.map(op => (
                        <tr key={op.id}>
                          <td>{op.id}</td>
                          <td><strong>{op.username}</strong></td>
                          <td>{op.full_name || '-'}</td>
                          <td>{op.phone || '-'}</td>
                          <td>
                            <Badge bg={op.role === 'superadmin' ? 'danger' : 'primary'}>
                              {op.role === 'superadmin' ? 'Супер-админ' : 'Оператор'}
                            </Badge>
                          </td>
                          <td>
                            {op.restaurants?.map(r => (
                              <Badge key={r.id} bg="secondary" className="me-1">{r.name}</Badge>
                            ))}
                          </td>
                          <td>
                            <Badge bg={op.is_active ? 'success' : 'secondary'}>
                              {op.is_active ? 'Активен' : 'Неактивен'}
                            </Badge>
                          </td>
                          <td>
                            <Button variant="outline-primary" size="sm" className="me-2" onClick={() => openOperatorModal(op)}>
                              ✏️
                            </Button>
                            {op.role !== 'superadmin' && (
                              <Button variant="outline-danger" size="sm" onClick={() => handleDeleteOperator(op.id)}>
                                🗑️
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {operators.length === 0 && (
                        <tr><td colSpan="8" className="text-center text-muted">Нет операторов</td></tr>
                      )}
                    </tbody>
                  </Table>
                )}
              </Tab>

              {/* Customers Tab */}
              <Tab eventKey="customers" title="👤 Клиенты">
                <div className="d-flex justify-content-between mb-3 flex-wrap gap-2">
                  <h5>Список клиентов ({customers.total})</h5>
                  <div className="d-flex gap-2">
                    <Form.Select
                      style={{ width: '150px' }}
                      value={customerStatusFilter}
                      onChange={(e) => { setCustomerStatusFilter(e.target.value); setCustomerPage(1); }}
                    >
                      <option value="">Все</option>
                      <option value="active">Активные</option>
                      <option value="blocked">Заблокированные</option>
                    </Form.Select>
                    <Form.Control 
                      type="search"
                      placeholder="Поиск по имени, телефону..."
                      style={{ width: '250px' }}
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerPage(1); }}
                    />
                  </div>
                </div>
                
                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <>
                    <Table responsive hover>
                      <thead className="table-light">
                        <tr>
                          <th>ID</th>
                          <th>ФИО</th>
                          <th>Телефон</th>
                          <th>Telegram</th>
                          <th>Заказов</th>
                          <th>Сумма</th>
                          <th>Статус</th>
                          <th>Дата регистрации</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.customers?.map(c => (
                          <tr key={c.id} className={!c.is_active ? 'table-secondary' : ''}>
                            <td>{c.id}</td>
                            <td>
                              <strong>{c.full_name || c.username}</strong>
                              {c.full_name && <div><small className="text-muted">{c.username}</small></div>}
                            </td>
                            <td>{c.phone || '-'}</td>
                            <td>{c.telegram_id ? <Badge bg="info">@{c.telegram_id}</Badge> : '-'}</td>
                            <td>
                              <Badge bg={c.orders_count > 0 ? 'success' : 'secondary'}>
                                {c.orders_count}
                              </Badge>
                            </td>
                            <td>{parseFloat(c.total_spent || 0).toLocaleString()} сум</td>
                            <td>
                              <Badge bg={c.is_active ? 'success' : 'danger'}>
                                {c.is_active ? 'Активен' : 'Заблокирован'}
                              </Badge>
                            </td>
                            <td><small>{formatDate(c.created_at)}</small></td>
                            <td>
                              <div className="d-flex gap-1">
                                <Button 
                                  variant="outline-info" 
                                  size="sm" 
                                  title="История заказов"
                                  onClick={() => openOrderHistory(c)}
                                >
                                  📋
                                </Button>
                                <Button 
                                  variant={c.is_active ? 'outline-warning' : 'outline-success'} 
                                  size="sm"
                                  title={c.is_active ? 'Заблокировать' : 'Разблокировать'}
                                  onClick={() => handleToggleCustomerBlock(c)}
                                >
                                  {c.is_active ? '🚫' : '✅'}
                                </Button>
                                <Button 
                                  variant="outline-danger" 
                                  size="sm"
                                  title="Удалить"
                                  onClick={() => handleDeleteCustomer(c)}
                                >
                                  🗑️
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {customers.customers?.length === 0 && (
                          <tr><td colSpan="9" className="text-center text-muted">Нет клиентов</td></tr>
                        )}
                      </tbody>
                    </Table>
                    
                    {customers.total > 20 && (
                      <div className="d-flex justify-content-center">
                        <Pagination>
                          <Pagination.Prev 
                            disabled={customerPage === 1}
                            onClick={() => setCustomerPage(p => p - 1)}
                          />
                          <Pagination.Item active>{customerPage}</Pagination.Item>
                          <Pagination.Next 
                            disabled={customerPage * 20 >= customers.total}
                            onClick={() => setCustomerPage(p => p + 1)}
                          />
                        </Pagination>
                      </div>
                    )}
                  </>
                )}
              </Tab>

              {/* Logs Tab */}
              <Tab eventKey="logs" title="📋 Логи">
                <div className="d-flex justify-content-between mb-3 flex-wrap gap-2">
                  <h5>Журнал действий</h5>
                  <div className="d-flex gap-2">
                    <Form.Select 
                      style={{ width: '200px' }}
                      value={logsFilter.action_type}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, action_type: e.target.value, page: 1 }))}
                    >
                      <option value="">Все действия</option>
                      <option value="create_product">Создание товара</option>
                      <option value="update_product">Изменение товара</option>
                      <option value="delete_product">Удаление товара</option>
                      <option value="update_order_status">Изменение заказа</option>
                      <option value="login">Вход</option>
                      <option value="logout">Выход</option>
                    </Form.Select>
                    <Form.Select 
                      style={{ width: '150px' }}
                      value={logsFilter.entity_type}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, entity_type: e.target.value, page: 1 }))}
                    >
                      <option value="">Все сущности</option>
                      <option value="product">Товары</option>
                      <option value="category">Категории</option>
                      <option value="order">Заказы</option>
                      <option value="user">Пользователи</option>
                      <option value="restaurant">Рестораны</option>
                    </Form.Select>
                  </div>
                </div>
                
                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <Table responsive hover size="sm">
                    <thead className="table-light">
                      <tr>
                        <th>Дата</th>
                        <th>Пользователь</th>
                        <th>Действие</th>
                        <th>Объект</th>
                        <th>Ресторан</th>
                        <th>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.logs?.map(log => (
                        <tr key={log.id}>
                          <td><small>{formatDate(log.created_at)}</small></td>
                          <td>{log.user_full_name || log.username}</td>
                          <td>
                            <Badge bg="info">{getActionTypeLabel(log.action_type)}</Badge>
                          </td>
                          <td>{log.entity_name || `${log.entity_type} #${log.entity_id}`}</td>
                          <td>{log.restaurant_name || '-'}</td>
                          <td><small className="text-muted">{log.ip_address}</small></td>
                        </tr>
                      ))}
                      {logs.logs?.length === 0 && (
                        <tr><td colSpan="6" className="text-center text-muted">Нет записей</td></tr>
                      )}
                    </tbody>
                  </Table>
                )}
              </Tab>
            </Tabs>
          </Card.Body>
        </Card>
      </Container>

      {/* Restaurant Modal */}
      <Modal show={showRestaurantModal} onHide={() => setShowRestaurantModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingRestaurant ? 'Редактировать ресторан' : 'Новый ресторан'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            {/* Logo Upload */}
            <Form.Group className="mb-3">
              <Form.Label>Логотип ресторана</Form.Label>
              <div className="d-flex align-items-center gap-3">
                {restaurantForm.logo_url ? (
                  <img 
                    src={restaurantForm.logo_url.startsWith('http') ? restaurantForm.logo_url : `${API_URL.replace('/api', '')}${restaurantForm.logo_url}`}
                    alt="Logo"
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '12px', border: '2px solid #dee2e6' }}
                  />
                ) : (
                  <div style={{ width: '80px', height: '80px', background: '#f8f9fa', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #dee2e6' }}>
                    <span style={{ fontSize: '2rem' }}>🏪</span>
                  </div>
                )}
                <div>
                  <Form.Control 
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                  {uploadingLogo && <small className="text-muted">Загрузка...</small>}
                  {restaurantForm.logo_url && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="text-danger p-0 mt-1"
                      onClick={() => setRestaurantForm({ ...restaurantForm, logo_url: '' })}
                    >
                      Удалить логотип
                    </Button>
                  )}
                </div>
              </div>
            </Form.Group>
            
            <hr />
            
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Название *</Form.Label>
                  <Form.Control 
                    value={restaurantForm.name}
                    onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })}
                    placeholder="Название ресторана"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Телефон</Form.Label>
                  <Form.Control 
                    value={restaurantForm.phone}
                    onChange={(e) => setRestaurantForm({ ...restaurantForm, phone: e.target.value })}
                    placeholder="+998901234567"
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Адрес</Form.Label>
              <Form.Control 
                value={restaurantForm.address}
                onChange={(e) => setRestaurantForm({ ...restaurantForm, address: e.target.value })}
                placeholder="Адрес ресторана"
              />
            </Form.Group>
            <hr />
            <h6>Время работы ресторана</h6>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Начало работы</Form.Label>
                  <Form.Control
                    type="time"
                    value={restaurantForm.open_time}
                    onChange={(e) => setRestaurantForm({ ...restaurantForm, open_time: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Окончание работы</Form.Label>
                  <Form.Control
                    type="time"
                    value={restaurantForm.close_time}
                    onChange={(e) => setRestaurantForm({ ...restaurantForm, close_time: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Text className="text-muted">Если не указано, ресторан считается открытым всегда.</Form.Text>
            
            <hr />
            <h6>Настройки Telegram</h6>
            <Form.Group className="mb-3">
              <Form.Label>Bot Token</Form.Label>
              <Form.Control 
                value={restaurantForm.telegram_bot_token}
                onChange={(e) => setRestaurantForm({ ...restaurantForm, telegram_bot_token: e.target.value })}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              />
              <Form.Text className="text-muted">Токен бота из @BotFather</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ID Группы для уведомлений</Form.Label>
              <Form.Control 
                value={restaurantForm.telegram_group_id}
                onChange={(e) => setRestaurantForm({ ...restaurantForm, telegram_group_id: e.target.value })}
                placeholder="-1001234567890"
              />
              <Form.Text className="text-muted">ID группы или канала для получения заказов</Form.Text>
            </Form.Group>
            
            <hr />
            <h6>🗺️ Зона доставки</h6>
            <Form.Group className="mb-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                {restaurantForm.delivery_zone ? (
                  <Badge bg="success">✓ Зона установлена ({restaurantForm.delivery_zone.length} точек)</Badge>
                ) : (
                  <Badge bg="secondary">Зона не установлена</Badge>
                )}
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  onClick={() => setShowMapModal(true)}
                >
                  {restaurantForm.delivery_zone ? 'Изменить зону' : 'Нарисовать зону'}
                </Button>
                {restaurantForm.delivery_zone && (
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={() => setRestaurantForm({ ...restaurantForm, delivery_zone: null })}
                  >
                    Удалить
                  </Button>
                )}
              </div>
              <Form.Text className="text-muted">
                Нарисуйте на карте область, в которую ресторан осуществляет доставку
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRestaurantModal(false)}>Отмена</Button>
          <Button variant="primary" onClick={handleSaveRestaurant}>Сохранить</Button>
        </Modal.Footer>
      </Modal>
      
      {/* Delivery Zone Map Modal */}
      <Modal show={showMapModal} onHide={() => setShowMapModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>🗺️ Зона доставки</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Suspense fallback={<div className="text-center p-5"><Spinner animation="border" /></div>}>
            <DeliveryZoneMap
              zone={restaurantForm.delivery_zone}
              onZoneChange={(zone) => setRestaurantForm({ ...restaurantForm, delivery_zone: zone })}
              height="500px"
              editable={true}
            />
          </Suspense>
          <Alert variant="info" className="mt-3">
            <strong>Инструкция:</strong>
            <ol className="mb-0 mt-2">
              <li>Нажмите на иконку многоугольника (⬠) справа на карте</li>
              <li>Кликайте по карте, чтобы отметить точки границы зоны доставки</li>
              <li>Завершите многоугольник, кликнув на первую точку</li>
              <li>Закройте окно — зона сохранится</li>
            </ol>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowMapModal(false)}>Готово</Button>
        </Modal.Footer>
      </Modal>

      {/* Operator Modal */}
      <Modal show={showOperatorModal} onHide={() => setShowOperatorModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingOperator ? 'Редактировать оператора' : 'Новый оператор'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Логин *</Form.Label>
                  <Form.Control 
                    value={operatorForm.username}
                    onChange={(e) => setOperatorForm({ ...operatorForm, username: e.target.value })}
                    placeholder="operator1"
                    disabled={!!editingOperator}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Пароль {!editingOperator && '*'}</Form.Label>
                  <Form.Control 
                    type="password"
                    value={operatorForm.password}
                    onChange={(e) => setOperatorForm({ ...operatorForm, password: e.target.value })}
                    placeholder={editingOperator ? 'Оставьте пустым, чтобы не менять' : 'Пароль'}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>ФИО</Form.Label>
                  <Form.Control 
                    value={operatorForm.full_name}
                    onChange={(e) => setOperatorForm({ ...operatorForm, full_name: e.target.value })}
                    placeholder="Иванов Иван"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Телефон</Form.Label>
                  <Form.Control 
                    value={operatorForm.phone}
                    onChange={(e) => setOperatorForm({ ...operatorForm, phone: e.target.value })}
                    placeholder="+998901234567"
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Доступ к ресторанам</Form.Label>
              <div className="border rounded p-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {restaurants.filter(r => r.is_active).map(r => (
                  <Form.Check 
                    key={r.id}
                    type="checkbox"
                    label={r.name}
                    checked={operatorForm.restaurant_ids.includes(r.id)}
                    onChange={(e) => {
                      const ids = e.target.checked 
                        ? [...operatorForm.restaurant_ids, r.id]
                        : operatorForm.restaurant_ids.filter(id => id !== r.id);
                      setOperatorForm({ ...operatorForm, restaurant_ids: ids });
                    }}
                  />
                ))}
                {restaurants.filter(r => r.is_active).length === 0 && (
                  <p className="text-muted mb-0">Нет активных ресторанов</p>
                )}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOperatorModal(false)}>Отмена</Button>
          <Button variant="primary" onClick={handleSaveOperator}>Сохранить</Button>
        </Modal.Footer>
      </Modal>
      
      {/* Customer Order History Modal */}
      <Modal show={showOrderHistoryModal} onHide={() => setShowOrderHistoryModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            📋 История заказов: {selectedCustomer?.full_name || selectedCustomer?.username}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {loadingOrders ? (
            <div className="text-center p-5"><Spinner animation="border" /></div>
          ) : (
            <>
              {/* Customer Info */}
              <Card className="mb-3 bg-light">
                <Card.Body>
                  <Row>
                    <Col md={3}>
                      <small className="text-muted">Клиент</small>
                      <div><strong>{selectedCustomer?.full_name || '-'}</strong></div>
                    </Col>
                    <Col md={3}>
                      <small className="text-muted">Телефон</small>
                      <div>{selectedCustomer?.phone || '-'}</div>
                    </Col>
                    <Col md={3}>
                      <small className="text-muted">Всего заказов</small>
                      <div><Badge bg="primary">{customerOrders.total}</Badge></div>
                    </Col>
                    <Col md={3}>
                      <small className="text-muted">Сумма покупок</small>
                      <div><strong>{parseFloat(customerOrders.orders?.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) || 0).toLocaleString()} сум</strong></div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
              
              {/* Orders List */}
              {customerOrders.orders?.length > 0 ? (
                <Table responsive hover>
                  <thead className="table-light">
                    <tr>
                      <th>№ Заказа</th>
                      <th>Дата</th>
                      <th>Ресторан</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                      <th>Оплата</th>
                      <th>Обработал</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.orders.map(order => (
                      <tr key={order.id}>
                        <td><strong>#{order.order_number}</strong></td>
                        <td><small>{formatDate(order.created_at)}</small></td>
                        <td>{order.restaurant_name || '-'}</td>
                        <td><strong>{parseFloat(order.total_amount).toLocaleString()} сум</strong></td>
                        <td>
                          <Badge bg={
                            order.status === 'new' ? 'primary' :
                            order.status === 'preparing' ? 'warning' :
                            order.status === 'delivering' ? 'info' :
                            order.status === 'delivered' ? 'success' :
                            order.status === 'cancelled' ? 'danger' : 'secondary'
                          }>
                            {order.status === 'new' ? 'Новый' :
                             order.status === 'preparing' ? 'Готовится' :
                             order.status === 'delivering' ? 'Доставляется' :
                             order.status === 'delivered' ? 'Доставлен' :
                             order.status === 'cancelled' ? 'Отменен' : order.status}
                          </Badge>
                        </td>
                        <td>
                          {order.payment_method === 'cash' ? '💵 Наличные' : 
                           order.payment_method === 'card' ? '💳 Карта' : order.payment_method}
                        </td>
                        <td><small>{order.processed_by_name || '-'}</small></td>
                        <td>
                          <Button 
                            variant="outline-primary" 
                            size="sm"
                            onClick={() => openOrderDetail(order)}
                          >
                            👁️ Детали
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="text-center text-muted py-5">
                  <h5>📦</h5>
                  <p>У этого клиента пока нет заказов</p>
                </div>
              )}
              
              {customerOrders.total > 10 && (
                <div className="d-flex justify-content-center mt-3">
                  <Pagination>
                    <Pagination.Prev 
                      disabled={orderHistoryPage === 1}
                      onClick={() => {
                        const newPage = orderHistoryPage - 1;
                        setOrderHistoryPage(newPage);
                        loadCustomerOrders(selectedCustomer.id, newPage);
                      }}
                    />
                    <Pagination.Item active>{orderHistoryPage}</Pagination.Item>
                    <Pagination.Next 
                      disabled={orderHistoryPage * 10 >= customerOrders.total}
                      onClick={() => {
                        const newPage = orderHistoryPage + 1;
                        setOrderHistoryPage(newPage);
                        loadCustomerOrders(selectedCustomer.id, newPage);
                      }}
                    />
                  </Pagination>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOrderHistoryModal(false)}>Закрыть</Button>
        </Modal.Footer>
      </Modal>
      
      {/* Order Detail Modal */}
      <Modal show={showOrderDetailModal} onHide={() => setShowOrderDetailModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            🧾 Заказ #{selectedOrder?.order_number}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrder && (
            <>
              {/* Order Status */}
              <div className="text-center mb-4">
                <Badge 
                  bg={
                    selectedOrder.status === 'new' ? 'primary' :
                    selectedOrder.status === 'preparing' ? 'warning' :
                    selectedOrder.status === 'delivering' ? 'info' :
                    selectedOrder.status === 'delivered' ? 'success' :
                    selectedOrder.status === 'cancelled' ? 'danger' : 'secondary'
                  }
                  style={{ fontSize: '1.1rem', padding: '0.5rem 1rem' }}
                >
                  {selectedOrder.status === 'new' ? '🆕 Новый' :
                   selectedOrder.status === 'preparing' ? '👨‍🍳 Готовится' :
                   selectedOrder.status === 'delivering' ? '🚚 Доставляется' :
                   selectedOrder.status === 'delivered' ? '✅ Доставлен' :
                   selectedOrder.status === 'cancelled' ? '❌ Отменен' : selectedOrder.status}
                </Badge>
              </div>
              
              {/* Order Info */}
              <Card className="mb-3">
                <Card.Header>📋 Информация о заказе</Card.Header>
                <Card.Body>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2"><strong>Дата создания:</strong> {formatDate(selectedOrder.created_at)}</p>
                      <p className="mb-2"><strong>Дата обновления:</strong> {formatDate(selectedOrder.updated_at)}</p>
                      <p className="mb-2"><strong>Ресторан:</strong> {selectedOrder.restaurant_name || '-'}</p>
                      <p className="mb-2"><strong>Обработал:</strong> {selectedOrder.processed_by_name || '-'}</p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-2"><strong>Способ оплаты:</strong> {selectedOrder.payment_method === 'cash' ? '💵 Наличные' : '💳 Карта'}</p>
                      <p className="mb-2"><strong>Дата доставки:</strong> {selectedOrder.delivery_date || '-'} {selectedOrder.delivery_time || ''}</p>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
              
              {/* Customer Info */}
              <Card className="mb-3">
                <Card.Header>👤 Данные клиента</Card.Header>
                <Card.Body>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2"><strong>Имя:</strong> {selectedOrder.customer_name}</p>
                      <p className="mb-2"><strong>Телефон:</strong> {selectedOrder.customer_phone}</p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-2"><strong>Адрес:</strong> {selectedOrder.delivery_address}</p>
                      {selectedOrder.delivery_coordinates && (
                        <p className="mb-2">
                          <strong>Координаты:</strong>{' '}
                          <a 
                            href={`https://yandex.ru/maps/?pt=${selectedOrder.delivery_coordinates.split(',').reverse().join(',')}&z=17&l=map`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📍 На карте
                          </a>
                        </p>
                      )}
                    </Col>
                  </Row>
                  {selectedOrder.comment && (
                    <Alert variant="info" className="mb-0 mt-2">
                      <strong>💬 Комментарий:</strong> {selectedOrder.comment}
                    </Alert>
                  )}
                </Card.Body>
              </Card>
              
              {/* Order Items */}
              <Card className="mb-3">
                <Card.Header>🛒 Состав заказа</Card.Header>
                <Card.Body className="p-0">
                  <Table className="mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Товар</th>
                        <th>Кол-во</th>
                        <th>Цена</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item, index) => (
                        <tr key={item.id || index}>
                          <td>{index + 1}</td>
                          <td>{item.product_name}</td>
                          <td>{item.quantity} {item.unit || 'шт'}</td>
                          <td>{parseFloat(item.price).toLocaleString()} сум</td>
                          <td><strong>{parseFloat(item.total || item.quantity * item.price).toLocaleString()} сум</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-light">
                      <tr>
                        <td colSpan="4" className="text-end"><strong>ИТОГО:</strong></td>
                        <td><strong style={{ fontSize: '1.2rem' }}>{parseFloat(selectedOrder.total_amount).toLocaleString()} сум</strong></td>
                      </tr>
                    </tfoot>
                  </Table>
                </Card.Body>
              </Card>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOrderDetailModal(false)}>Закрыть</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default SuperAdminDashboard;

