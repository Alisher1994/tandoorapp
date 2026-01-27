import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Container, Row, Col, Card, Table, Button, Form, Modal, 
  Tabs, Tab, Badge, Navbar, Nav, Alert, Pagination, Spinner
} from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

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
    name: '', address: '', phone: '', logo_url: '', telegram_bot_token: '', telegram_group_id: ''
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [operatorForm, setOperatorForm] = useState({
    username: '', password: '', full_name: '', phone: '', restaurant_ids: []
  });
  
  // Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [logsFilter, setLogsFilter] = useState({
    action_type: '', entity_type: '', page: 1
  });

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
  }, [customerPage, customerSearch]);

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
        params: { page: customerPage, search: customerSearch, limit: 20 }
      });
      setCustomers(response.data);
    } catch (err) {
      setError('Ошибка загрузки клиентов');
    } finally {
      setLoading(false);
    }
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
        telegram_bot_token: restaurant.telegram_bot_token || '',
        telegram_group_id: restaurant.telegram_group_id || ''
      });
    } else {
      setEditingRestaurant(null);
      setRestaurantForm({
        name: '', address: '', phone: '', logo_url: '', telegram_bot_token: '', telegram_group_id: ''
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
                        <th>Telegram Bot</th>
                        <th>Статус</th>
                        <th>Товары</th>
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
                            {r.telegram_bot_token ? (
                              <Badge bg="success">Настроен</Badge>
                            ) : (
                              <Badge bg="secondary">Не настроен</Badge>
                            )}
                          </td>
                          <td>
                            <Form.Check 
                              type="switch"
                              checked={r.is_active}
                              onChange={() => handleToggleRestaurant(r)}
                              label={r.is_active ? 'Активен' : 'Неактивен'}
                            />
                          </td>
                          <td>{r.products_count || 0}</td>
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
                <div className="d-flex justify-content-between mb-3">
                  <h5>Список клиентов ({customers.total})</h5>
                  <Form.Control 
                    type="search"
                    placeholder="Поиск..."
                    style={{ maxWidth: '300px' }}
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setCustomerPage(1); }}
                  />
                </div>
                
                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <>
                    <Table responsive hover>
                      <thead className="table-light">
                        <tr>
                          <th>ID</th>
                          <th>Логин</th>
                          <th>ФИО</th>
                          <th>Телефон</th>
                          <th>Telegram ID</th>
                          <th>Заказов</th>
                          <th>Сумма</th>
                          <th>Дата регистрации</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.customers?.map(c => (
                          <tr key={c.id}>
                            <td>{c.id}</td>
                            <td>{c.username}</td>
                            <td>{c.full_name || '-'}</td>
                            <td>{c.phone || '-'}</td>
                            <td>{c.telegram_id || '-'}</td>
                            <td>{c.orders_count}</td>
                            <td>{parseFloat(c.total_spent || 0).toLocaleString()} сум</td>
                            <td>{formatDate(c.created_at)}</td>
                          </tr>
                        ))}
                        {customers.customers?.length === 0 && (
                          <tr><td colSpan="8" className="text-center text-muted">Нет клиентов</td></tr>
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
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRestaurantModal(false)}>Отмена</Button>
          <Button variant="primary" onClick={handleSaveRestaurant}>Сохранить</Button>
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
    </div>
  );
}

export default SuperAdminDashboard;

