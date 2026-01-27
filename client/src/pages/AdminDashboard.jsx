import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import NavDropdown from 'react-bootstrap/NavDropdown';
import Tabs from 'react-bootstrap/Tabs';
import Tab from 'react-bootstrap/Tab';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function AdminDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    category_id: '',
    name_ru: '',
    name_uz: '',
    description_ru: '',
    description_uz: '',
    image_url: '',
    price: '',
    unit: 'шт',
    barcode: '',
    in_stock: true,
    sort_order: 0
  });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name_ru: '',
    name_uz: '',
    image_url: '',
    sort_order: 0
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [alertMessage, setAlertMessage] = useState({ type: '', text: '' });
  const { user, logout, switchRestaurant, isSuperAdmin } = useAuth();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [statusFilter, user?.active_restaurant_id]);

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

  const openProductModal = (product = null) => {
    if (product) {
      setSelectedProduct(product);
      setProductForm({
        category_id: product.category_id || '',
        name_ru: product.name_ru || '',
        name_uz: product.name_uz || '',
        description_ru: product.description_ru || '',
        description_uz: product.description_uz || '',
        image_url: product.image_url || '',
        price: product.price || '',
        unit: product.unit || 'шт',
        barcode: product.barcode || '',
        in_stock: product.in_stock !== false,
        sort_order: product.sort_order || 0
      });
    } else {
      setSelectedProduct(null);
      setProductForm({
        category_id: '',
        name_ru: '',
        name_uz: '',
        description_ru: '',
        description_uz: '',
        image_url: '',
        price: '',
        unit: 'шт',
        barcode: '',
        in_stock: true,
        sort_order: 0
      });
    }
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const productData = {
        ...productForm,
        price: parseFloat(productForm.price),
        sort_order: parseInt(productForm.sort_order) || 0
      };

      if (selectedProduct) {
        await axios.put(`${API_URL}/admin/products/${selectedProduct.id}`, productData);
      } else {
        await axios.post(`${API_URL}/admin/products`, productData);
      }
      
      setShowProductModal(false);
      fetchData();
    } catch (error) {
      console.error('Product save error:', error);
      alert('Ошибка сохранения товара: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот товар?')) {
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/admin/products/${productId}`);
      fetchData();
    } catch (error) {
      console.error('Delete product error:', error);
      alert('Ошибка удаления товара');
    }
  };

  const openCategoryModal = (category = null) => {
    if (category) {
      setSelectedCategory(category);
      setCategoryForm({
        name_ru: category.name_ru || '',
        name_uz: category.name_uz || '',
        image_url: category.image_url || '',
        sort_order: category.sort_order || 0
      });
    } else {
      setSelectedCategory(null);
      setCategoryForm({
        name_ru: '',
        name_uz: '',
        image_url: '',
        sort_order: 0
      });
    }
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    try {
      const categoryData = {
        ...categoryForm,
        sort_order: parseInt(categoryForm.sort_order) || 0
      };

      if (selectedCategory) {
        await axios.put(`${API_URL}/admin/categories/${selectedCategory.id}`, categoryData);
      } else {
        await axios.post(`${API_URL}/admin/categories`, categoryData);
      }
      
      setShowCategoryModal(false);
      fetchData();
    } catch (error) {
      console.error('Category save error:', error);
      alert('Ошибка сохранения категории: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту категорию? Товары в этой категории должны быть удалены или перемещены.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/admin/categories/${categoryId}`);
      fetchData();
    } catch (error) {
      console.error('Delete category error:', error);
      alert(error.response?.data?.error || 'Ошибка удаления категории');
    }
  };

  const handleImageUpload = async (file, setImageUrl) => {
    if (!file) return;
    
    // Проверка размера файла (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой. Максимальный размер: 5MB');
      return;
    }
    
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      // axios.defaults.headers уже содержит Authorization токен
      const response = await axios.post(`${API_URL}/upload/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Получаем полный URL
      const fullUrl = window.location.origin + response.data.url;
      setImageUrl(fullUrl);
    } catch (error) {
      console.error('Image upload error:', error);
      alert('Ошибка загрузки изображения: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingImage(false);
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

  const handleSwitchRestaurant = async (restaurantId) => {
    const result = await switchRestaurant(restaurantId);
    if (result.success) {
      setAlertMessage({ type: 'success', text: 'Ресторан переключен' });
      fetchData();
    } else {
      setAlertMessage({ type: 'danger', text: result.error });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
        <Container>
          <Navbar.Brand>
            🍽️ Панель оператора
            {user?.active_restaurant_name && (
              <Badge bg="light" text="dark" className="ms-2">{user.active_restaurant_name}</Badge>
            )}
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Nav>
              {/* Restaurant Switcher */}
              {user?.restaurants?.length > 1 && (
                <NavDropdown title="🏪 Переключить ресторан" id="restaurant-dropdown">
                  {user.restaurants.map(r => (
                    <NavDropdown.Item 
                      key={r.id} 
                      onClick={() => handleSwitchRestaurant(r.id)}
                      active={r.id === user.active_restaurant_id}
                    >
                      {r.name}
                    </NavDropdown.Item>
                  ))}
                </NavDropdown>
              )}
              
              {/* Super Admin Link */}
              {isSuperAdmin() && (
                <Nav.Link onClick={() => navigate('/superadmin')}>
                  🏢 Супер-админ
                </Nav.Link>
              )}
              
              <Nav.Link className="text-light">👤 {user?.full_name || user?.username}</Nav.Link>
              <Nav.Link onClick={handleLogout}>Выход</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container>
        {/* Alerts */}
        {alertMessage.text && (
          <Alert 
            variant={alertMessage.type} 
            dismissible 
            onClose={() => setAlertMessage({ type: '', text: '' })}
            className="mb-3"
          >
            {alertMessage.text}
          </Alert>
        )}
        
        {/* No restaurant selected warning */}
        {!user?.active_restaurant_id && (
          <Alert variant="warning" className="mb-3">
            ⚠️ Выберите ресторан для работы. 
            {user?.restaurants?.length > 0 && ' Используйте меню "Переключить ресторан" выше.'}
          </Alert>
        )}
        
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
                  <Button variant="primary" onClick={() => openProductModal()}>
                    Добавить товар
                  </Button>
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
                          <Button 
                            variant="outline-primary" 
                            size="sm" 
                            className="me-2"
                            onClick={() => openProductModal(product)}
                          >
                            Редактировать
                          </Button>
                          <Button 
                            variant="outline-danger" 
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
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

          <Tab eventKey="categories" title="Категории">
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between mb-3">
                  <h5>Категории</h5>
                  <Button variant="primary" onClick={() => openCategoryModal()}>
                    Добавить категорию
                  </Button>
                </div>
                <Table responsive>
                  <thead>
                    <tr>
                      <th>Название (RU)</th>
                      <th>Название (UZ)</th>
                      <th>Изображение</th>
                      <th>Порядок</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(category => (
                      <tr key={category.id}>
                        <td>{category.name_ru}</td>
                        <td>{category.name_uz || '-'}</td>
                        <td>
                          {category.image_url && (
                            <img 
                              src={category.image_url} 
                              alt={category.name_ru}
                              style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                            />
                          )}
                        </td>
                        <td>{category.sort_order}</td>
                        <td>
                          <Button 
                            variant="outline-primary" 
                            size="sm" 
                            className="me-2"
                            onClick={() => openCategoryModal(category)}
                          >
                            Редактировать
                          </Button>
                          <Button 
                            variant="outline-danger" 
                            size="sm"
                            onClick={() => handleDeleteCategory(category.id)}
                          >
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
                  <strong>Телефон:</strong>{' '}
                  <a href={`tel:${selectedOrder.customer_phone}`} className="text-decoration-none">
                    {selectedOrder.customer_phone}
                  </a>
                  <a 
                    href={`tel:${selectedOrder.customer_phone}`} 
                    className="btn btn-success btn-sm ms-2"
                  >
                    📞 Позвонить
                  </a>
                </div>
                <div className="mb-3">
                  <strong>Адрес:</strong> {selectedOrder.delivery_address}
                  
                  {/* Map and location links */}
                  {selectedOrder.delivery_coordinates && (() => {
                    const coords = selectedOrder.delivery_coordinates.split(',').map(c => c.trim());
                    if (coords.length === 2) {
                      const [lat, lng] = coords;
                      const yandexMapUrl = `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;
                      const yandexNaviUrl = `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
                      const yandexTaxiUrl = `https://3.redirect.appmetrica.yandex.com/route?end-lat=${lat}&end-lon=${lng}&appmetrica_tracking_id=1178268795219780156`;
                      const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
                      
                      return (
                        <div className="mt-2">
                          {/* Embedded map */}
                          <div className="rounded overflow-hidden mb-2" style={{ border: '1px solid #ddd' }}>
                            <iframe
                              title="delivery-map"
                              src={`https://yandex.ru/map-widget/v1/?pt=${lng},${lat}&z=16&l=map`}
                              width="100%"
                              height="200"
                              frameBorder="0"
                            />
                          </div>
                          
                          {/* Action buttons */}
                          <div className="d-flex gap-2 flex-wrap">
                            <a 
                              href={yandexMapUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="btn btn-outline-primary btn-sm"
                            >
                              🗺 Яндекс.Карты
                            </a>
                            <a 
                              href={googleMapsUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="btn btn-outline-secondary btn-sm"
                            >
                              📍 Google Maps
                            </a>
                            <a 
                              href={yandexTaxiUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="btn btn-warning btn-sm"
                            >
                              🚕 Яндекс.Такси
                            </a>
                            <a 
                              href={yandexNaviUrl} 
                              className="btn btn-outline-info btn-sm"
                            >
                              🧭 Навигатор
                            </a>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="mb-3">
                  <strong>Сумма:</strong> {parseFloat(selectedOrder.total_amount).toLocaleString()} сум
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

        {/* Product Modal */}
        <Modal show={showProductModal} onHide={() => setShowProductModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>
              {selectedProduct ? 'Редактировать товар' : 'Добавить товар'}
            </Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleProductSubmit}>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label>Категория *</Form.Label>
                <Form.Select
                  required
                  value={productForm.category_id}
                  onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                >
                  <option value="">Выберите категорию</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name_ru}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Название (RU) *</Form.Label>
                <Form.Control
                  required
                  type="text"
                  value={productForm.name_ru}
                  onChange={(e) => setProductForm({ ...productForm, name_ru: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Название (UZ)</Form.Label>
                <Form.Control
                  type="text"
                  value={productForm.name_uz}
                  onChange={(e) => setProductForm({ ...productForm, name_uz: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Описание (RU)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={productForm.description_ru}
                  onChange={(e) => setProductForm({ ...productForm, description_ru: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Описание (UZ)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={productForm.description_uz}
                  onChange={(e) => setProductForm({ ...productForm, description_uz: e.target.value })}
                />
              </Form.Group>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Цена (сум) *</Form.Label>
                    <Form.Control
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Единица измерения *</Form.Label>
                    <Form.Select
                      required
                      value={productForm.unit}
                      onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    >
                      <option value="шт">шт</option>
                      <option value="кг">кг</option>
                      <option value="л">л</option>
                      <option value="г">г</option>
                      <option value="мл">мл</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Изображение</Form.Label>
                <Form.Control
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      handleImageUpload(file, (url) => {
                        setProductForm({ ...productForm, image_url: url });
                      });
                    }
                  }}
                  disabled={uploadingImage}
                />
                {productForm.image_url && (
                  <div className="mt-2">
                    <img 
                      src={productForm.image_url} 
                      alt="Preview" 
                      style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'cover' }}
                      className="img-thumbnail"
                    />
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setProductForm({ ...productForm, image_url: '' })}
                    >
                      Удалить изображение
                    </Button>
                  </div>
                )}
                {uploadingImage && (
                  <div className="text-muted mt-2">
                    <small>Загрузка изображения...</small>
                  </div>
                )}
                <Form.Text className="text-muted">
                  Или введите URL изображения:
                </Form.Text>
                <Form.Control
                  type="url"
                  value={productForm.image_url}
                  onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1"
                />
              </Form.Group>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Штрих-код</Form.Label>
                    <Form.Control
                      type="text"
                      value={productForm.barcode}
                      onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>
                  Порядок сортировки
                  <Form.Text className="text-muted ms-2">
                    (Число: чем меньше, тем выше в списке. Например: 1, 2, 3...)
                  </Form.Text>
                </Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  value={productForm.sort_order}
                  onChange={(e) => setProductForm({ ...productForm, sort_order: parseInt(e.target.value) || 0 })}
                />
                <Form.Text className="text-muted">
                  Товары с меньшим числом отображаются первыми в категории.
                </Form.Text>
              </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  label="В наличии"
                  checked={productForm.in_stock}
                  onChange={(e) => setProductForm({ ...productForm, in_stock: e.target.checked })}
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowProductModal(false)}>
                Отмена
              </Button>
              <Button variant="primary" type="submit">
                {selectedProduct ? 'Сохранить' : 'Добавить'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Category Modal */}
        <Modal show={showCategoryModal} onHide={() => setShowCategoryModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>
              {selectedCategory ? 'Редактировать категорию' : 'Добавить категорию'}
            </Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleCategorySubmit}>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label>Название (RU) *</Form.Label>
                <Form.Control
                  required
                  type="text"
                  value={categoryForm.name_ru}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_ru: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Название (UZ)</Form.Label>
                <Form.Control
                  type="text"
                  value={categoryForm.name_uz}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_uz: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Изображение</Form.Label>
                <Form.Control
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      handleImageUpload(file, (url) => {
                        setCategoryForm({ ...categoryForm, image_url: url });
                      });
                    }
                  }}
                  disabled={uploadingImage}
                />
                {categoryForm.image_url && (
                  <div className="mt-2">
                    <img 
                      src={categoryForm.image_url} 
                      alt="Preview" 
                      style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'cover' }}
                      className="img-thumbnail"
                    />
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setCategoryForm({ ...categoryForm, image_url: '' })}
                    >
                      Удалить изображение
                    </Button>
                  </div>
                )}
                {uploadingImage && (
                  <div className="text-muted mt-2">
                    <small>Загрузка изображения...</small>
                  </div>
                )}
                <Form.Text className="text-muted">
                  Или введите URL изображения:
                </Form.Text>
                <Form.Control
                  type="url"
                  value={categoryForm.image_url}
                  onChange={(e) => setCategoryForm({ ...categoryForm, image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>
                  Порядок сортировки *
                  <Form.Text className="text-muted ms-2">
                    (Число: чем меньше, тем выше в списке. Например: 1, 2, 3...)
                  </Form.Text>
                </Form.Label>
                <Form.Control
                  required
                  type="number"
                  min="0"
                  value={categoryForm.sort_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) || 0 })}
                />
                <Form.Text className="text-muted">
                  Категории с меньшим числом отображаются первыми в каталоге.
                </Form.Text>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowCategoryModal(false)}>
                Отмена
              </Button>
              <Button variant="primary" type="submit">
                {selectedCategory ? 'Сохранить' : 'Добавить'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </Container>
    </>
  );
}

export default AdminDashboard;

