import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminStyles.css';
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
import Dropdown from 'react-bootstrap/Dropdown';
import Tabs from 'react-bootstrap/Tabs';
import Tab from 'react-bootstrap/Tab';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import InputGroup from 'react-bootstrap/InputGroup';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import * as XLSX from 'xlsx';
import YandexLocationPicker from '../components/YandexLocationPicker';
import DeliveryZonePicker from '../components/DeliveryZonePicker';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// SVG Icons
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </svg>
);

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ReceiptIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 16H8" />
    <path d="M14 8H8" />
    <path d="M16 12H8" />
    <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
  </svg>
);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CustomToggle = React.forwardRef(({ children, onClick, className }, ref) => (
  <div
    className={`form-select text-start text-truncate ${(className || '').replace('dropdown-toggle', '')}`}
    ref={ref}
    onClick={(e) => {
      e.preventDefault();
      onClick(e);
    }}
    style={{ cursor: 'pointer', paddingRight: '2.5rem' }}
  >
    {children}
  </div>
));

const CustomMenu = React.forwardRef(
  ({ children, style, className, 'aria-labelledby': labeledBy }, ref) => {
    const [value, setValue] = useState('');

    return (
      <div
        ref={ref}
        style={{ ...style, width: '100%', minWidth: '300px', padding: '0.5rem 0', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)' }}
        className={className}
        aria-labelledby={labeledBy}
      >
        <div style={{ padding: '0 10px 10px 10px' }}>
          <Form.Control
            autoFocus
            className="w-100"
            placeholder="Поиск категории..."
            onChange={(e) => setValue(e.target.value)}
            value={value}
          />
        </div>
        <ul className="list-unstyled mb-0" style={{ maxHeight: '250px', overflowY: 'auto' }}>
          {React.Children.toArray(children).filter(
            (child) => {
              if (child.props.children && Array.isArray(child.props.children)) {
                const text = child.props.children.join('');
                return !value || text.toLowerCase().includes(value.toLowerCase());
              }
              return !value || (child.props.children && child.props.children.toString().toLowerCase().includes(value.toLowerCase()));
            }
          )}
        </ul>
      </div>
    );
  },
);

function AdminDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [statusFilter, setStatusFilter] = useState('delivered');
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
    in_stock: true,
    container_id: ''
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [alertMessage, setAlertMessage] = useState({ type: '', text: '' });

  // Broadcast state
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ message: '', image_url: '' });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastImageFile, setBroadcastImageFile] = useState(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [recurrence, setRecurrence] = useState('none'); // none, daily, custom
  const [repeatDays, setRepeatDays] = useState([]); // [0,1,2,3,4,5,6]
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [broadcastModalTab, setBroadcastModalTab] = useState('send');
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingBroadcastId, setEditingBroadcastId] = useState(null);

  // Billing states
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceTab, setBalanceTab] = useState('data');
  const [billingInfo, setBillingInfo] = useState({ restaurant: {}, requisites: {} });
  const [billingHistory, setBillingHistory] = useState([]);
  const [loadingBilling, setLoadingBilling] = useState(false);

  // Product filters and search
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState('all');
  const [productStatusFilter, setProductStatusFilter] = useState('all');

  // Image preview modal
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');

  // Product selection for bulk operations
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Cancel order modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  // Dashboard analytics
  const [dashboardYear, setDashboardYear] = useState(new Date().getFullYear());
  const [dashboardMonth, setDashboardMonth] = useState(new Date().getMonth() + 1);
  const [analytics, setAnalytics] = useState({
    revenue: 0,
    ordersCount: 0,
    averageCheck: 0,
    topProducts: [],
    orderLocations: []
  });

  // Yearly analytics
  const [yearlyAnalytics, setYearlyAnalytics] = useState({
    year: new Date().getFullYear(),
    monthlyData: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, orders_count: 0, revenue: 0 })),
    totalRevenue: 0,
    totalOrders: 0,
    averageCheck: 0,
    topProductsByMonth: Array.from({ length: 12 }, () => [])
  });
  const [loadingYearlyAnalytics, setLoadingYearlyAnalytics] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState({ new_count: 0 });
  const [feedbackFilter, setFeedbackFilter] = useState({ status: '', type: '' });
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackResponse, setFeedbackResponse] = useState('');

  // Containers (посуда)
  const [containers, setContainers] = useState([]);
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [containerForm, setContainerForm] = useState({ name: '', price: 0, sort_order: 0 });

  // Settings Tab
  const [restaurantSettings, setRestaurantSettings] = useState(null);
  const [operators, setOperators] = useState([]);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [operatorForm, setOperatorForm] = useState({ username: '', password: '', full_name: '', phone: '', telegram_id: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [testingBot, setTestingBot] = useState(false);
  const [showDeliveryZoneModal, setShowDeliveryZoneModal] = useState(false);

  const { user, logout, switchRestaurant, isSuperAdmin, fetchUser } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();

  // Excel export function
  const exportToExcel = (data, filename, columns) => {
    const ws = XLSX.utils.json_to_sheet(data.map(item => {
      const row = {};
      columns.forEach(col => {
        row[col.header] = col.accessor(item);
      });
      return row;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportOrders = () => {
    exportToExcel(orders, 'orders', [
      { header: '№', accessor: (o) => o.order_number },
      { header: 'Клиент', accessor: (o) => o.customer_name },
      { header: 'Телефон', accessor: (o) => o.customer_phone },
      { header: 'Сумма', accessor: (o) => o.total_amount },
      { header: 'Статус', accessor: (o) => o.status },
      { header: 'Дата', accessor: (o) => new Date(o.created_at).toLocaleString('ru-RU') },
      { header: 'Адрес', accessor: (o) => o.delivery_address },
      { header: 'Комментарий', accessor: (o) => o.comment },
    ]);
  };

  const exportProducts = () => {
    exportToExcel(products, 'products', [
      { header: 'Название (RU)', accessor: (p) => p.name_ru },
      { header: 'Название (UZ)', accessor: (p) => p.name_uz },
      { header: 'Категория', accessor: (p) => p.category_name },
      { header: 'Цена', accessor: (p) => p.price },
      { header: 'Единица', accessor: (p) => p.unit },
      { header: 'Статус', accessor: (p) => p.in_stock ? 'Активен' : 'Скрыт' },
    ]);
  };

  // Calculate analytics based on orders (only delivered orders for accurate statistics)
  useEffect(() => {
    const filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate.getFullYear() === dashboardYear &&
        orderDate.getMonth() + 1 === dashboardMonth &&
        order.status === 'delivered'; // Only count delivered orders
    });

    const revenue = filteredOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const ordersCount = filteredOrders.length;
    const averageCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

    // Calculate top products
    const productStats = {};
    filteredOrders.forEach(order => {
      if (order.items) {
        order.items.forEach(item => {
          if (!productStats[item.product_name]) {
            productStats[item.product_name] = { name: item.product_name, quantity: 0, revenue: 0 };
          }
          productStats[item.product_name].quantity += item.quantity;
          productStats[item.product_name].revenue += item.quantity * parseFloat(item.price || 0);
        });
      }
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Collect order locations
    const orderLocations = filteredOrders
      .filter(o => o.delivery_coordinates)
      .map(o => {
        const [lat, lng] = (o.delivery_coordinates || '').split(',').map(v => parseFloat(v.trim()));
        return { lat, lng, orderNumber: o.order_number };
      })
      .filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng));

    setAnalytics({ revenue, ordersCount, averageCheck, topProducts, orderLocations });
  }, [orders, dashboardYear, dashboardMonth]);

  // Fetch yearly analytics
  const fetchYearlyAnalytics = async (year) => {
    setLoadingYearlyAnalytics(true);
    try {
      const response = await axios.get(`${API_URL}/admin/analytics/yearly?year=${year}`);
      setYearlyAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching yearly analytics:', error);
    } finally {
      setLoadingYearlyAnalytics(false);
    }
  };

  useEffect(() => {
    if (user?.active_restaurant_id) {
      fetchYearlyAnalytics(dashboardYear);
    }
  }, [dashboardYear, user?.active_restaurant_id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [statusFilter, user?.active_restaurant_id]);

  useEffect(() => {
    if (user?.active_restaurant_id) {
      fetchFeedback();
    }
  }, [feedbackFilter, user?.active_restaurant_id]);

  useEffect(() => {
    if (user?.active_restaurant_id) {
      fetchRestaurantSettings();
      fetchOperators();
    }
  }, [user?.active_restaurant_id]);

  const fetchData = async () => {
    try {
      const [ordersRes, productsRes, categoriesRes, containersRes] = await Promise.all([
        axios.get(`${API_URL}/admin/orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
        axios.get(`${API_URL}/admin/products`),
        axios.get(`${API_URL}/admin/categories`),
        axios.get(`${API_URL}/admin/containers`)
      ]);

      setOrders(ordersRes.data);
      setProducts(productsRes.data);

      // Calculate full category paths locally
      const categoriesData = categoriesRes.data;
      const getCategoryPath = (cat) => {
        let path = cat.name_ru;
        let current = cat;
        while (current.parent_id) {
          const parent = categoriesData.find(c => c.id === current.parent_id);
          if (parent) {
            path = `${parent.name_ru} > ${path}`;
            current = parent;
          } else {
            break;
          }
        }
        return path;
      };

      const enrichedCategories = categoriesData.map(c => ({
        ...c,
        full_path: getCategoryPath(c)
      })).sort((a, b) => a.full_path.localeCompare(b.full_path, 'ru'));

      setCategories(enrichedCategories);

      setContainers(containersRes.data);

      // Fetch feedback stats
      fetchFeedbackStats();
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedback = async () => {
    try {
      let url = `${API_URL}/admin/feedback?`;
      if (feedbackFilter.status) url += `status=${feedbackFilter.status}&`;
      if (feedbackFilter.type) url += `type=${feedbackFilter.type}&`;
      const response = await axios.get(url);
      setFeedback(response.data.feedback || []);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    }
  };

  const fetchFeedbackStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/feedback/stats`);
      setFeedbackStats(response.data);
    } catch (error) {
      console.error('Error fetching feedback stats:', error);
    }
  };

  const openFeedbackDetail = (fb) => {
    setSelectedFeedback(fb);
    setFeedbackResponse(fb.admin_response || '');
    setShowFeedbackModal(true);
  };

  const handleFeedbackResponse = async (newStatus) => {
    try {
      await axios.patch(`${API_URL}/admin/feedback/${selectedFeedback.id}`, {
        status: newStatus,
        admin_response: feedbackResponse
      });
      setShowFeedbackModal(false);
      fetchFeedback();
      fetchFeedbackStats();
      setAlertMessage({ type: 'success', text: 'Обращение обновлено' });
    } catch (error) {
      setAlertMessage({ type: 'danger', text: 'Ошибка обновления' });
    }
  };

  // Container functions
  const openContainerModal = (container = null) => {
    setSelectedContainer(container);
    setContainerForm(container ? {
      name: container.name,
      price: container.price,
      sort_order: container.sort_order || 0
    } : { name: '', price: 0, sort_order: 0 });
    setShowContainerModal(true);
  };

  const saveContainer = async () => {
    try {
      if (selectedContainer) {
        await axios.put(`${API_URL}/admin/containers/${selectedContainer.id}`, containerForm);
      } else {
        await axios.post(`${API_URL}/admin/containers`, containerForm);
      }
      setShowContainerModal(false);
      fetchData();
      setAlertMessage({ type: 'success', text: selectedContainer ? 'Посуда обновлена' : 'Посуда добавлена' });
    } catch (error) {
      setAlertMessage({ type: 'danger', text: 'Ошибка сохранения' });
    }
  };

  const fetchBillingInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/billing/info`);
      setBillingInfo(response.data);
    } catch (error) {
      console.error('Fetch billing info error:', error);
    }
  };

  const fetchBillingHistory = async (type = '') => {
    setLoadingBilling(true);
    try {
      const response = await axios.get(`${API_URL}/admin/billing/history${type ? `?type=${type}` : ''}`);
      setBillingHistory(response.data);
    } catch (error) {
      console.error('Fetch billing history error:', error);
    } finally {
      setLoadingBilling(false);
    }
  };

  const fetchRestaurantSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/restaurant`);
      setRestaurantSettings(response.data);
    } catch (error) {
      console.error('Fetch restaurant settings error:', error);
    }
  };

  const saveRestaurantSettings = async () => {
    setSavingSettings(true);
    try {
      await axios.put(`${API_URL}/admin/restaurant`, restaurantSettings);
      setAlertMessage({ type: 'success', text: 'Настройки успешно сохранены' });
      // Refresh user context if needed (logo/name in header)
      fetchUser();
    } catch (error) {
      console.error('Save restaurant settings error:', error);
      setAlertMessage({ type: 'danger', text: 'Ошибка сохранения настроек' });
    } finally {
      setSavingSettings(false);
    }
  };

  const testBot = async () => {
    if (!restaurantSettings.telegram_bot_token) {
      setAlertMessage({ type: 'warning', text: 'Введите Bot Token для проверки' });
      return;
    }
    setTestingBot(true);
    try {
      const response = await axios.post(`${API_URL}/admin/test-bot`, {
        botToken: restaurantSettings.telegram_bot_token,
        groupId: restaurantSettings.telegram_group_id
      });

      const { message, details, errors, success } = response.data;

      let fullText = message + '\n\n' + details.join('\n');
      if (errors && errors.length > 0) {
        fullText += '\n\nОшибки:\n' + errors.join('\n');
      }

      setAlertMessage({
        type: success ? 'success' : 'warning',
        text: <div style={{ whiteSpace: 'pre-wrap' }}>{fullText}</div>
      });
    } catch (error) {
      console.error('Test bot error:', error);
      setAlertMessage({
        type: 'danger',
        text: 'Ошибка при проверке: ' + (error.response?.data?.error || error.message)
      });
    } finally {
      setTestingBot(false);
    }
  };

  const fetchOperators = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/operators`);
      setOperators(response.data);
    } catch (error) {
      console.error('Fetch operators error:', error);
    }
  };

  const [editingOperator, setEditingOperator] = useState(null);

  const openOperatorModal = (operator = null) => {
    if (operator) {
      setEditingOperator(operator);
      setOperatorForm({
        username: operator.username || '',
        password: '',
        full_name: operator.full_name || '',
        phone: operator.phone || '',
        telegram_id: operator.telegram_id || ''
      });
    } else {
      setEditingOperator(null);
      setOperatorForm({ username: '', password: '', full_name: '', phone: '', telegram_id: '' });
    }
    setShowOperatorModal(true);
  };

  const saveOperator = async (e) => {
    e.preventDefault();
    try {
      if (editingOperator) {
        const data = { ...operatorForm };
        if (!data.password) delete data.password;
        await axios.put(`${API_URL}/admin/operators/${editingOperator.id}`, data);
        setAlertMessage({ type: 'success', text: 'Оператор обновлен' });
      } else {
        await axios.post(`${API_URL}/admin/operators`, operatorForm);
        setAlertMessage({ type: 'success', text: 'Оператор добавлен' });
      }
      setShowOperatorModal(false);
      setOperatorForm({ username: '', password: '', full_name: '', phone: '' });
      setEditingOperator(null);
      fetchOperators();
    } catch (error) {
      console.error('Save operator error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка сохранения оператора' });
    }
  };

  const deleteOperator = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого оператора из ресторана?')) return;
    try {
      await axios.delete(`${API_URL}/admin/operators/${id}`);
      setAlertMessage({ type: 'success', text: 'Оператор удален' });
      fetchOperators();
    } catch (error) {
      console.error('Delete operator error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка удаления оператора' });
    }
  };

  const handleAcceptAndPay = async (orderId) => {
    try {
      const response = await axios.post(`/api/admin/orders/${orderId}/accept-and-pay`);
      setAlertMessage({ type: 'success', text: 'Заказ успешно принят и оплачен' });
      // Refresh user and orders
      fetchUser();
      fetchData(); // Changed from fetchOrders() to fetchData() to refresh all data
    } catch (error) {
      console.error('Accept and pay error:', error);
      setAlertMessage({ type: 'danger', text: error.response?.data?.error || 'Ошибка при оплате заказа' });
    }
  };

  const deleteContainer = async (id) => {
    if (!window.confirm('Удалить посуду? Она будет удалена из всех товаров.')) return;
    try {
      await axios.delete(`${API_URL}/admin/containers/${id}`);
      fetchData();
      setAlertMessage({ type: 'success', text: 'Посуда удалена' });
    } catch (error) {
      setAlertMessage({ type: 'danger', text: 'Ошибка удаления' });
    }
  };

  const updateOrderStatus = async (orderId, newStatus, reason = null) => {
    try {
      await axios.patch(`${API_URL}/admin/orders/${orderId}/status`, {
        status: newStatus,
        cancel_reason: reason
      });
      fetchData();
      fetchUser();
      setShowOrderModal(false);
    } catch (error) {
      alert('Ошибка обновления статуса');
    }
  };

  // Open cancel modal
  const openCancelModal = (orderId) => {
    setCancelOrderId(orderId);
    setCancelReason('');
    setShowCancelModal(true);
  };

  // Confirm cancel order
  const confirmCancelOrder = async () => {
    if (!cancelReason.trim()) {
      alert('Укажите причину отмены');
      return;
    }
    await updateOrderStatus(cancelOrderId, 'cancelled', cancelReason);
    setShowCancelModal(false);
    setCancelOrderId(null);
    setCancelReason('');
  };

  const startEditingItems = () => {
    setEditingItems([...selectedOrder.items]);
    setIsEditingItems(true);
  };

  const cancelEditingItems = () => {
    setEditingItems([]);
    setIsEditingItems(false);
  };

  const updateItemQuantity = (index, delta) => {
    const newItems = [...editingItems];
    newItems[index].quantity = Math.max(1, parseFloat(newItems[index].quantity) + delta);
    newItems[index].total = newItems[index].quantity * newItems[index].price;
    setEditingItems(newItems);
  };

  const removeItem = (index) => {
    if (editingItems.length <= 1) {
      alert('Нельзя удалить последний товар');
      return;
    }
    const newItems = editingItems.filter((_, i) => i !== index);
    setEditingItems(newItems);
  };

  const addProductToOrder = (product) => {
    const existingIndex = editingItems.findIndex(i => i.product_id === product.id);
    if (existingIndex >= 0) {
      updateItemQuantity(existingIndex, 1);
    } else {
      setEditingItems([...editingItems, {
        product_id: product.id,
        product_name: product.name_ru,
        quantity: 1,
        unit: product.unit || 'шт',
        price: parseFloat(product.price),
        total: parseFloat(product.price)
      }]);
    }
  };

  const saveEditedItems = async () => {
    setSavingItems(true);
    try {
      await axios.put(`${API_URL}/admin/orders/${selectedOrder.id}/items`, { items: editingItems });
      setIsEditingItems(false);
      fetchData();
      // Update selected order
      const newTotal = editingItems.reduce((sum, i) => sum + i.total, 0);
      setSelectedOrder({ ...selectedOrder, items: editingItems, total_amount: newTotal });
      setAlertMessage({ type: 'success', text: 'Товары обновлены' });
    } catch (error) {
      alert('Ошибка сохранения: ' + (error.response?.data?.error || error.message));
    } finally {
      setSavingItems(false);
    }
  };

  // Broadcast functions
  const handleBroadcastImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setBroadcastImageFile(file);

    // Upload image
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await axios.post(`${API_URL}/upload`, formData);
      const fullUrl = window.location.origin + res.data.imageUrl;
      setBroadcastForm({ ...broadcastForm, image_url: fullUrl });
    } catch (error) {
      alert('Ошибка загрузки изображения');
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.message.trim()) {
      alert('Введите текст сообщения');
      return;
    }

    if (isScheduled && recurrence === 'none' && !scheduledDate) {
      alert('Выберите дату');
      return;
    }
    if (isScheduled && !scheduledTime) {
      alert('Выберите время');
      return;
    }
    if (isScheduled && recurrence === 'custom' && repeatDays.length === 0) {
      alert('Выберите хотя бы один день недели');
      return;
    }

    if (!window.confirm(isScheduled ? 'Запланировать рассылку?' : 'Отправить рассылку всем клиентам?')) return;

    // Calculate final scheduledAt
    let finalScheduledAt = null;
    if (isScheduled) {
      const now = new Date();
      if (recurrence === 'none') {
        finalScheduledAt = `${scheduledDate}T${scheduledTime}:00`;
      } else {
        // For recurring, we find the first occurrence
        const [hours, minutes] = scheduledTime.split(':').map(Number);
        let target = new Date();
        target.setHours(hours, minutes, 0, 0);

        if (recurrence === 'daily') {
          if (target <= now) {
            target.setDate(target.getDate() + 1);
          }
        } else if (recurrence === 'custom') {
          // Find next day from repeatDays
          const today = now.getDay();
          const sortedDays = [...repeatDays].sort((a, b) => a - b);

          let nextDay = sortedDays.find(d => d > today);
          let targetDate = new Date(target);

          if (nextDay === undefined) {
            // If no days left this week, take first day of next week
            nextDay = sortedDays[0];
            let diff = (nextDay + 7) - today;
            targetDate.setDate(targetDate.getDate() + diff);
          } else {
            // If today is one of the target days and time hasn't passed
            if (sortedDays.includes(today) && target > now) {
              // Keep today
            } else {
              let diff = nextDay - today;
              targetDate.setDate(targetDate.getDate() + diff);
            }
          }
          target = targetDate;
        }
        finalScheduledAt = target.toISOString();
      }
    }

    setBroadcastLoading(true);
    try {
      const url = editingBroadcastId
        ? `${API_URL}/admin/scheduled-broadcasts/${editingBroadcastId}`
        : `${API_URL}/admin/broadcast`;

      const method = editingBroadcastId ? 'put' : 'post';

      const res = await axios[method](url, {
        message: broadcastForm.message,
        image_url: broadcastForm.image_url ? broadcastForm.image_url : null,
        scheduled_at: finalScheduledAt,
        recurrence: isScheduled ? recurrence : 'none',
        repeat_days: isScheduled && recurrence === 'custom' ? repeatDays : null
      });

      setAlertMessage({
        type: 'success',
        text: editingBroadcastId ? 'Расписание обновлено' : (isScheduled ? 'Рассылка запланирована' : `Рассылка завершена! Отправлено: ${res.data.sent}, Ошибок: ${res.data.failed}`)
      });
      setShowBroadcastModal(false);
      resetBroadcastForm();
      if (isScheduled || editingBroadcastId) fetchScheduledBroadcasts();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    } finally {
      setBroadcastLoading(false);
    }
  };

  const resetBroadcastForm = () => {
    setBroadcastForm({ message: '', image_url: '' });
    setBroadcastImageFile(null);
    setIsScheduled(false);
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }));
    setRecurrence('none');
    setRepeatDays([]);
    setEditingBroadcastId(null);
  };

  const fetchScheduledBroadcasts = async () => {
    setLoadingScheduled(true);
    try {
      const res = await axios.get(`${API_URL}/admin/scheduled-broadcasts`);
      setScheduledBroadcasts(res.data);
    } catch (error) {
      console.error('Error fetching scheduled broadcasts:', error);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const fetchBroadcastHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_URL}/admin/broadcast-history`);
      setBroadcastHistory(res.data);
    } catch (error) {
      console.error('Error fetching broadcast history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteRemoteBroadcast = async (id) => {
    if (!window.confirm('⚠️ ВНИМАНИЕ! Это действие удалит это сообщение у ВСЕХ получателей в их Телеграм-ботах. Вы уверены?')) return;

    setLoadingHistory(true);
    try {
      const res = await axios.post(`${API_URL}/admin/broadcast-history/${id}/delete-remote`);
      alert(`Успешно удалено: ${res.data.deleted} сообщений`);
      fetchBroadcastHistory();
    } catch (error) {
      alert('Ошибка при удалении: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingHistory(false);
    }
  };

  const startEditBroadcast = (sb) => {
    setEditingBroadcastId(sb.id);
    setBroadcastForm({ message: sb.message, image_url: sb.image_url || '' });
    setIsScheduled(true);
    setRecurrence(sb.recurrence);
    setRepeatDays(sb.repeat_days || []);

    const d = new Date(sb.scheduled_at);
    setScheduledDate(d.toISOString().split('T')[0]);
    setScheduledTime(d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }));

    setBroadcastModalTab('send');
  };

  const deleteScheduledBroadcast = async (id) => {
    if (!window.confirm('Удалить это расписание?')) return;
    try {
      await axios.delete(`${API_URL}/admin/scheduled-broadcasts/${id}`);
      fetchScheduledBroadcasts();
    } catch (error) {
      alert('Ошибка удаления');
    }
  };

  const toggleScheduledBroadcast = async (id) => {
    try {
      await axios.patch(`${API_URL}/admin/scheduled-broadcasts/${id}/toggle`);
      fetchScheduledBroadcasts();
    } catch (error) {
      alert('Ошибка изменения статуса');
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
        in_stock: product.in_stock !== false,
        container_id: product.container_id || ''
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
        in_stock: true,
        container_id: ''
      });
    }
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const productData = {
        ...productForm,
        price: parseFloat(productForm.price)
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

  // Bulk delete selected products
  const handleBulkDeleteProducts = async () => {
    if (selectedProducts.length === 0) return;

    if (!window.confirm(`Вы уверены, что хотите удалить ${selectedProducts.length} товар(ов)?`)) {
      return;
    }

    try {
      let deleted = 0;
      let errors = 0;

      for (const productId of selectedProducts) {
        try {
          await axios.delete(`${API_URL}/admin/products/${productId}`);
          deleted++;
        } catch (err) {
          errors++;
        }
      }

      setSelectedProducts([]);
      fetchData();
      setAlertMessage({
        type: errors > 0 ? 'warning' : 'success',
        text: `Удалено: ${deleted}${errors > 0 ? `, Ошибок: ${errors}` : ''}`
      });
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Ошибка массового удаления');
    }
  };

  // Toggle product selection
  const toggleProductSelection = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Select all filtered products
  const toggleSelectAllProducts = (filteredProductIds) => {
    if (selectedProducts.length === filteredProductIds.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProductIds);
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

  // Handle paste from clipboard (Ctrl+V)
  const handlePaste = async (e, setImageUrl) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleImageUpload(file, setImageUrl);
        }
        break;
      }
    }
  };

  // Duplicate product
  const duplicateProduct = (product) => {
    setSelectedProduct(null);
    setProductForm({
      category_id: product.category_id || '',
      name_ru: product.name_ru || '',
      name_uz: product.name_uz || '',
      description_ru: '',
      description_uz: '',
      image_url: '', // Empty - admin fills manually
      price: '', // Empty - admin fills manually
      unit: product.unit || 'шт',
      in_stock: true
    });
    setShowProductModal(true);
  };

  // Excel Import
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelPreview, setExcelPreview] = useState([]);
  const [importingExcel, setImportingExcel] = useState(false);

  const handleExcelFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setExcelFile(file);

    // Read and preview Excel file
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        // Dynamic import for xlsx
        const XLSX = await import('xlsx');
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Preview first 10 rows
        setExcelPreview(jsonData.slice(0, 10));
      } catch (error) {
        console.error('Error reading Excel:', error);
        alert('Ошибка чтения файла. Убедитесь, что это файл Excel (.xlsx, .xls) или CSV.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const importExcel = async () => {
    if (!excelFile) return;

    setImportingExcel(true);
    try {
      const reader = new FileReader();

      reader.onload = async (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const row of jsonData) {
          try {
            // Map Excel columns to product fields
            const productData = {
              category_id: row['Категория ID'] || row['category_id'] || '',
              name_ru: row['Название (RU)'] || row['Название'] || row['name_ru'] || '',
              name_uz: row['Название (UZ)'] || row['name_uz'] || '',
              price: parseFloat(row['Цена'] || row['price'] || 0),
              unit: row['Единица'] || row['unit'] || 'шт',
              in_stock: true
            };

            // Find category by name if category_id not provided
            if (!productData.category_id && row['Категория']) {
              const cat = categories.find(c =>
                c.name_ru?.toLowerCase() === row['Категория'].toLowerCase() ||
                c.name_uz?.toLowerCase() === row['Категория'].toLowerCase()
              );
              if (cat) productData.category_id = cat.id;
            }

            if (productData.name_ru && productData.price > 0) {
              // Use upsert endpoint - will update if category+name exists
              const response = await axios.post(`${API_URL}/admin/products/upsert`, productData);
              if (response.data.isUpdate) {
                updated++;
              } else {
                created++;
              }
            } else {
              errors++;
            }
          } catch (err) {
            console.error('Error importing row:', err);
            errors++;
          }
        }

        let message = 'Импорт завершен.';
        if (created > 0) message += ` Добавлено: ${created}.`;
        if (updated > 0) message += ` Обновлено: ${updated}.`;
        if (errors > 0) message += ` Ошибок: ${errors}.`;

        setAlertMessage({
          type: (created > 0 || updated > 0) ? 'success' : 'warning',
          text: message
        });
        setShowExcelModal(false);
        setExcelFile(null);
        setExcelPreview([]);
        fetchData();
        setImportingExcel(false);
      };

      reader.readAsArrayBuffer(excelFile);
    } catch (error) {
      console.error('Import error:', error);
      alert('Ошибка импорта: ' + error.message);
      setImportingExcel(false);
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
      <Navbar expand="lg" className="admin-navbar py-3 mb-4 shadow-sm" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'relative', zIndex: 1050 }}>
        <Container>
          <Navbar.Brand className="d-flex align-items-center gap-2 py-1">
            {user?.active_restaurant_logo ? (
              <img
                src={user.active_restaurant_logo.startsWith('http') ? user.active_restaurant_logo : `${API_URL.replace('/api', '')}${user.active_restaurant_logo}`}
                alt="Logo"
                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, border: '2px solid rgba(255,255,255,0.15)' }}
              />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" /><path d="M12 3v6" />
                </svg>
              </div>
            )}
            <div className="d-flex flex-column" style={{ lineHeight: 1.2 }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>
                {user?.active_restaurant_name || t('operatorPanel')}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: 400 }}>
                {t('controlPanel')}
              </span>
            </div>
          </Navbar.Brand>
          <Navbar.Toggle style={{ border: 'none' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </Navbar.Toggle>
          <Navbar.Collapse className="justify-content-end">
            <Nav className="align-items-lg-center gap-lg-1">
              {/* Restaurant Switcher */}
              {user?.restaurants?.length > 1 && (
                <NavDropdown
                  title={<span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>{t('switchRestaurant')}</span>}
                  id="restaurant-dropdown"
                  align="end"
                >
                  {user.restaurants.map(r => (
                    <NavDropdown.Item
                      key={r.id}
                      onClick={() => handleSwitchRestaurant(r.id)}
                      active={r.id === user.active_restaurant_id}
                      style={{ fontSize: '13px' }}
                    >
                      {r.name}
                    </NavDropdown.Item>
                  ))}
                </NavDropdown>
              )}

              {/* Broadcast */}
              <Nav.Link
                onClick={() => setShowBroadcastModal(true)}
                style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px' }}
                className="px-2"
              >
                {t('broadcast')}
              </Nav.Link>

              {/* User + Language + Logout group */}
              <div className="d-flex align-items-center gap-2 ms-lg-2">
                {/* User Profile Dropdown */}
                <Dropdown align="end">
                  <Dropdown.Toggle
                    variant="link"
                    bsPrefix="p-0"
                    className="d-flex align-items-center gap-2 bg-white bg-opacity-10 py-2 px-3 rounded-pill text-decoration-none custom-user-dropdown h-100"
                    style={{ cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  >
                    <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white shadow-sm" style={{ width: 32, height: 32, fontSize: '0.8rem', fontWeight: 600 }}>
                      {user?.username?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div className="d-none d-md-block text-start">
                      <div className="text-white small fw-bold lh-1">{user?.full_name || user?.username || 'Administrator'}</div>
                      <div className="text-white-50 small" style={{ fontSize: '0.65rem' }}>ID: {String(user?.id || 0).padStart(5, '0')}</div>
                    </div>
                  </Dropdown.Toggle>

                  <Dropdown.Menu className="shadow-lg border-0 mt-2 rounded-4" style={{ minWidth: "240px", zIndex: 9999, padding: '8px' }}>
                    <div className="px-3 py-3 border-bottom mb-2 bg-light rounded-top-4">
                      <div className="fw-bold text-dark">{user?.full_name || user?.username}</div>
                      <div className="text-muted small">{user?.role === 'superadmin' ? 'Super Administrator' : 'Administrator'}</div>
                    </div>

                    {isSuperAdmin() && (
                      <Dropdown.Item onClick={() => navigate('/superadmin')} className="d-flex align-items-center gap-2 py-2 rounded-3">
                        <i className="bi bi-shield-lock text-primary"></i> <span>{t('superAdmin')}</span>
                      </Dropdown.Item>
                    )}

                    <div className="px-2 py-2">
                      <div className="d-flex bg-light rounded-3 p-1 gap-1">
                        <div
                          onClick={language !== 'ru' ? toggleLanguage : undefined}
                          className={`flex-fill text-center rounded-2 py-1 px-2 transition-all ${language === 'ru' ? 'bg-white shadow-sm fw-bold text-primary' : 'text-muted'}`}
                          style={{ cursor: 'pointer', fontSize: '11px' }}
                        >
                          <img src="https://flagcdn.com/w20/ru.png" width="14" alt="RU" className="me-1" /> Рус
                        </div>
                        <div
                          onClick={language !== 'uz' ? toggleLanguage : undefined}
                          className={`flex-fill text-center rounded-2 py-1 px-2 transition-all ${language === 'uz' ? 'bg-white shadow-sm fw-bold text-primary' : 'text-muted'}`}
                          style={{ cursor: 'pointer', fontSize: '11px' }}
                        >
                          <img src="https://flagcdn.com/w20/uz.png" width="14" alt="UZ" className="me-1" /> O'zb
                        </div>
                      </div>
                    </div>

                    <Dropdown.Divider className="mx-2" />
                    <Dropdown.Item onClick={handleLogout} className="text-danger d-flex align-items-center gap-2 py-2 rounded-3">
                      <i className="bi bi-box-arrow-right"></i> <span>{t('logout')}</span>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>

                {/* Separate Balance pill */}
                <div
                  className="bg-white bg-opacity-10 py-1 px-3 rounded-pill d-flex flex-column align-items-end text-decoration-none h-100 border border-white border-opacity-10 shadow-sm transition-all"
                  style={{ cursor: 'pointer', minWidth: '110px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchBillingInfo();
                    setShowBalanceModal(true);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                >
                  <span className="text-white-50 extra-small fw-bold text-uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.05rem' }}>{t('balance')}</span>
                  <span className="text-white fw-bold" style={{ fontSize: '0.85rem' }}>{formatPrice(user?.balance || 0)} <span className="opacity-75 fw-normal small">{t('sum')}</span></span>
                </div>
              </div>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="admin-panel">
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
            ⚠️ {t('selectRestaurant')}
            {user?.restaurants?.length > 0 && ` ${t('useRestaurantMenu')}`}
          </Alert>
        )}

        <Card className="admin-card">
          <Card.Body>
            <Tabs defaultActiveKey="dashboard" className="admin-tabs">
              {/* Dashboard Tab */}
              <Tab eventKey="dashboard" title={t('dashboard')}>
                {/* Filters */}
                <Row className="mb-4 g-3">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted">{t('year')}</Form.Label>
                      <Form.Select
                        value={dashboardYear}
                        onChange={(e) => setDashboardYear(parseInt(e.target.value))}
                      >
                        {[2024, 2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted">{t('month')}</Form.Label>
                      <Form.Select
                        value={dashboardMonth}
                        onChange={(e) => setDashboardMonth(parseInt(e.target.value))}
                      >
                        {[
                          { value: 1, label: t('monthJan') },
                          { value: 2, label: t('monthFeb') },
                          { value: 3, label: t('monthMar') },
                          { value: 4, label: t('monthApr') },
                          { value: 5, label: t('monthMay') },
                          { value: 6, label: t('monthJun') },
                          { value: 7, label: t('monthJul') },
                          { value: 8, label: t('monthAug') },
                          { value: 9, label: t('monthSep') },
                          { value: 10, label: t('monthOct') },
                          { value: 11, label: t('monthNov') },
                          { value: 12, label: t('monthDec') },
                        ].map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>

                {/* Stats Widgets */}
                <Row className="g-4 mb-4">
                  <Col md={4}>
                    <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                      <Card.Body className="text-white">
                        <div>
                          <h6 className="text-white-50 mb-1">{t('revenue')}</h6>
                          <h3 className="mb-0">{formatPrice(analytics.revenue)} {t('sum')}</h3>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                      <Card.Body className="text-white">
                        <div>
                          <h6 className="text-white-50 mb-1">{t('ordersCount')}</h6>
                          <h3 className="mb-0">{analytics.ordersCount}</h3>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                      <Card.Body className="text-white">
                        <div>
                          <h6 className="text-white-50 mb-1">{t('averageCheck')}</h6>
                          <h3 className="mb-0">{formatPrice(analytics.averageCheck)} {t('sum')}</h3>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Row className="g-4">
                  {/* Top Products */}
                  <Col md={6}>
                    <Card className="border-0 shadow-sm h-100">
                      <Card.Header className="bg-white border-0">
                        <h6 className="mb-0">{t('topProducts')}</h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        {analytics.topProducts.length > 0 ? (
                          <Table hover className="mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>#</th>
                                <th>{t('productName')}</th>
                                <th className="text-end">{t('quantity')}</th>
                                <th className="text-end">{t('revenue')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.topProducts.map((item, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <Badge bg={idx < 3 ? 'warning' : 'secondary'}>{idx + 1}</Badge>
                                  </td>
                                  <td>{item.name}</td>
                                  <td className="text-end">{item.quantity}</td>
                                  <td className="text-end">{formatPrice(item.revenue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        ) : (
                          <div className="text-center text-muted py-4">
                            {t('noDataForPeriod')}
                          </div>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>

                  {/* Order Geography Map */}
                  <Col md={6}>
                    <Card className="border-0 shadow-sm h-100">
                      <Card.Header className="bg-white border-0">
                        <h6 className="mb-0">🗺️ {t('orderGeography')}</h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        <div style={{ height: '350px', width: '100%' }}>
                          <iframe
                            title="orders-map"
                            src={analytics.orderLocations.length > 0
                              ? `https://yandex.ru/map-widget/v1/?pt=${analytics.orderLocations.map(loc => `${loc.lng},${loc.lat},pm2rdm`).join('~')}&z=11&l=map`
                              : `https://yandex.ru/map-widget/v1/?ll=69.2401,41.2995&z=11&l=map`
                            }
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            style={{ borderRadius: '0 0 8px 8px' }}
                          />
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {/* =====================================================
                    ГОДОВАЯ АНАЛИТИКА
                ===================================================== */}
                <hr className="my-4" />
                <h5 className="mb-4">📈 {t('yearlyAnalytics')} {dashboardYear} {t('yearSuffix')}</h5>

                {loadingYearlyAnalytics ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Yearly Summary Cards */}
                    <Row className="g-4 mb-4">
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}>
                          <Card.Body className="text-white">
                            <div>
                              <h6 className="text-white-50 mb-1">{t('revenueForYear')}</h6>
                              <h3 className="mb-0">{formatPrice(yearlyAnalytics.totalRevenue)} {t('sum')}</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)' }}>
                          <Card.Body className="text-white">
                            <div>
                              <h6 className="text-white-50 mb-1">{t('ordersForYear')}</h6>
                              <h3 className="mb-0">{yearlyAnalytics.totalOrders}</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)' }}>
                          <Card.Body className="text-white">
                            <div>
                              <h6 className="text-white-50 mb-1">{t('avgCheckForYear')}</h6>
                              <h3 className="mb-0">{formatPrice(yearlyAnalytics.averageCheck)} {t('sum')}</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>

                    <Card className="border-0 shadow-sm mb-4">
                      <Card.Header className="bg-white border-0">
                        <h6 className="mb-0">{t('financeByMonths')}</h6>
                      </Card.Header>
                      <Card.Body>
                        <div style={{ height: '300px', position: 'relative' }}>
                          {/* SVG Line Chart for Revenue */}
                          <svg viewBox="0 0 1000 280" style={{ width: '100%', height: '100%' }}>
                            {/* Grid lines */}
                            {[0, 1, 2, 3, 4].map(i => (
                              <line key={i} x1="50" y1={50 + i * 50} x2="950" y2={50 + i * 50} stroke="#e0e0e0" strokeWidth="1" />
                            ))}

                            {/* Y-axis labels */}
                            {(() => {
                              const maxRevenue = Math.max(...yearlyAnalytics.monthlyData.map(m => m.revenue), 1);
                              return [0, 1, 2, 3, 4].map(i => (
                                <text key={i} x="45" y={255 - i * 50} textAnchor="end" fontSize="11" fill="#666">
                                  {formatPrice(Math.round(maxRevenue * i / 4))}
                                </text>
                              ));
                            })()}

                            {/* Line path */}
                            {(() => {
                              const maxRevenue = Math.max(...yearlyAnalytics.monthlyData.map(m => m.revenue), 1);
                              const points = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.revenue / maxRevenue) * 200;
                                return `${x},${y}`;
                              }).join(' ');

                              const areaPath = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.revenue / maxRevenue) * 200;
                                return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                              }).join(' ') + ` L ${75 + 11 * 75},250 L 75,250 Z`;

                              return (
                                <>
                                  {/* Area fill */}
                                  <path d={areaPath} fill="url(#revenueGradient)" opacity="0.3" />
                                  {/* Line */}
                                  <polyline points={points} fill="none" stroke="#667eea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                  {/* Points */}
                                  {yearlyAnalytics.monthlyData.map((m, i) => {
                                    const x = 75 + i * 75;
                                    const y = 250 - (m.revenue / maxRevenue) * 200;
                                    return (
                                      <g key={i}>
                                        <circle cx={x} cy={y} r="6" fill="#667eea" />
                                        <circle cx={x} cy={y} r="3" fill="white" />
                                      </g>
                                    );
                                  })}
                                </>
                              );
                            })()}

                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#667eea" />
                                <stop offset="100%" stopColor="#667eea" stopOpacity="0" />
                              </linearGradient>
                            </defs>

                            {/* X-axis labels */}
                            {[t('monthShortJan'), t('monthShortFeb'), t('monthShortMar'), t('monthShortApr'), t('monthShortMay'), t('monthShortJun'), t('monthShortJul'), t('monthShortAug'), t('monthShortSep'), t('monthShortOct'), t('monthShortNov'), t('monthShortDec')].map((m, i) => (
                              <text key={i} x={75 + i * 75} y="275" textAnchor="middle" fontSize="11" fill="#666">{m}</text>
                            ))}
                          </svg>
                        </div>
                        {/* Revenue values row */}
                        <div className="d-flex justify-content-between mt-2 px-4" style={{ overflowX: 'auto' }}>
                          {yearlyAnalytics.monthlyData.map((m, i) => (
                            <div key={i} className="text-center" style={{ minWidth: '70px' }}>
                              <small className="text-muted d-block" style={{ fontSize: '10px' }}>
                                {formatPrice(m.revenue)}
                              </small>
                            </div>
                          ))}
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Orders Chart - Line Graph */}
                    <Card className="border-0 shadow-sm mb-4">
                      <Card.Header className="bg-white border-0">
                        <h6 className="mb-0">{t('deliveredOrdersByMonths')}</h6>
                      </Card.Header>
                      <Card.Body>
                        <div style={{ height: '300px', position: 'relative' }}>
                          {/* SVG Line Chart for Orders */}
                          <svg viewBox="0 0 1000 280" style={{ width: '100%', height: '100%' }}>
                            {/* Grid lines */}
                            {[0, 1, 2, 3, 4].map(i => (
                              <line key={i} x1="50" y1={50 + i * 50} x2="950" y2={50 + i * 50} stroke="#e0e0e0" strokeWidth="1" />
                            ))}

                            {/* Y-axis labels */}
                            {(() => {
                              const maxOrders = Math.max(...yearlyAnalytics.monthlyData.map(m => m.orders_count), 1);
                              return [0, 1, 2, 3, 4].map(i => (
                                <text key={i} x="45" y={255 - i * 50} textAnchor="end" fontSize="11" fill="#666">
                                  {Math.round(maxOrders * i / 4)}
                                </text>
                              ));
                            })()}

                            {/* Line path */}
                            {(() => {
                              const maxOrders = Math.max(...yearlyAnalytics.monthlyData.map(m => m.orders_count), 1);
                              const points = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.orders_count / maxOrders) * 200;
                                return `${x},${y}`;
                              }).join(' ');

                              const areaPath = yearlyAnalytics.monthlyData.map((m, i) => {
                                const x = 75 + i * 75;
                                const y = 250 - (m.orders_count / maxOrders) * 200;
                                return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                              }).join(' ') + ` L ${75 + 11 * 75},250 L 75,250 Z`;

                              return (
                                <>
                                  {/* Area fill */}
                                  <path d={areaPath} fill="url(#ordersGradient)" opacity="0.3" />
                                  {/* Line */}
                                  <polyline points={points} fill="none" stroke="#f5576c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                  {/* Points */}
                                  {yearlyAnalytics.monthlyData.map((m, i) => {
                                    const x = 75 + i * 75;
                                    const y = 250 - (m.orders_count / maxOrders) * 200;
                                    return (
                                      <g key={i}>
                                        <circle cx={x} cy={y} r="6" fill="#f5576c" />
                                        <circle cx={x} cy={y} r="3" fill="white" />
                                      </g>
                                    );
                                  })}
                                </>
                              );
                            })()}

                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="ordersGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#f5576c" />
                                <stop offset="100%" stopColor="#f5576c" stopOpacity="0" />
                              </linearGradient>
                            </defs>

                            {/* X-axis labels */}
                            {[t('monthShortJan'), t('monthShortFeb'), t('monthShortMar'), t('monthShortApr'), t('monthShortMay'), t('monthShortJun'), t('monthShortJul'), t('monthShortAug'), t('monthShortSep'), t('monthShortOct'), t('monthShortNov'), t('monthShortDec')].map((m, i) => (
                              <text key={i} x={75 + i * 75} y="275" textAnchor="middle" fontSize="11" fill="#666">{m}</text>
                            ))}
                          </svg>
                        </div>
                        {/* Orders count row */}
                        <div className="d-flex justify-content-between mt-2 px-4" style={{ overflowX: 'auto' }}>
                          {yearlyAnalytics.monthlyData.map((m, i) => (
                            <div key={i} className="text-center" style={{ minWidth: '70px' }}>
                              <small className="text-primary fw-bold">{m.orders_count}</small>
                            </div>
                          ))}
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Top 5 Products by Month - Horizontal Scroll */}
                    <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 12, overflow: 'hidden' }}>
                      <Card.Header className="border-0 d-flex align-items-center gap-2" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', padding: '16px 20px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 9 7" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 15 7 15 7" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                          </svg>
                        </div>
                        <h6 className="mb-0" style={{ fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>{t('top5ByMonths')}</h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        <div className="premium-scrollbar" style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 8 }}>
                          <div className="d-flex" style={{ minWidth: 'max-content' }}>
                            {[t('monthJan'), t('monthFeb'), t('monthMar'), t('monthApr'), t('monthMay'), t('monthJun'), t('monthJul'), t('monthAug'), t('monthSep'), t('monthOct'), t('monthNov'), t('monthDec')].map((monthName, monthIdx) => {
                              const hasData = yearlyAnalytics.topProductsByMonth[monthIdx]?.length > 0;
                              const isCurrentMonth = monthIdx === new Date().getMonth() && dashboardYear === new Date().getFullYear();
                              return (
                                <div
                                  key={monthIdx}
                                  style={{
                                    minWidth: '210px',
                                    maxWidth: '210px',
                                    borderRight: monthIdx < 11 ? '1px solid #f1f5f9' : 'none',
                                    background: isCurrentMonth ? 'rgba(102, 126, 234, 0.03)' : 'transparent'
                                  }}
                                  className="px-3 pt-3 pb-2"
                                >
                                  {/* Month header pill */}
                                  <div className="text-center mb-3">
                                    <span style={{
                                      display: 'inline-block',
                                      background: isCurrentMonth
                                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                        : hasData
                                          ? 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)'
                                          : '#f1f5f9',
                                      color: isCurrentMonth ? '#fff' : hasData ? '#4338ca' : '#94a3b8',
                                      padding: '6px 18px',
                                      borderRadius: '20px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      letterSpacing: '0.3px',
                                      boxShadow: isCurrentMonth ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none'
                                    }}>
                                      {monthName}
                                    </span>
                                  </div>

                                  {hasData ? (
                                    <div style={{ whiteSpace: 'normal' }}>
                                      {yearlyAnalytics.topProductsByMonth[monthIdx].map((product, idx) => {
                                        // Medal colors for top 3
                                        const medalColors = [
                                          { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', numBg: 'linear-gradient(135deg, #f59e0b, #d97706)', numColor: '#fff' },
                                          { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', numBg: 'linear-gradient(135deg, #94a3b8, #64748b)', numColor: '#fff' },
                                          { bg: '#fff1e6', border: '#ea8b4b', text: '#7c2d12', numBg: 'linear-gradient(135deg, #ea8b4b, #c2410c)', numColor: '#fff' },
                                        ];
                                        const medal = medalColors[idx] || { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', numBg: '#e2e8f0', numColor: '#64748b' };

                                        return (
                                          <div
                                            key={idx}
                                            className="d-flex align-items-center mb-2"
                                            style={{
                                              background: medal.bg,
                                              border: `1px solid ${medal.border}20`,
                                              borderRadius: 8,
                                              padding: '8px 10px',
                                              transition: 'transform 0.15s ease',
                                            }}
                                          >
                                            {/* Rank number */}
                                            <div style={{
                                              width: 24,
                                              height: 24,
                                              borderRadius: '50%',
                                              background: medal.numBg,
                                              color: medal.numColor,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              flexShrink: 0,
                                              marginRight: 8,
                                              boxShadow: idx < 3 ? '0 1px 3px rgba(0,0,0,0.15)' : 'none'
                                            }}>
                                              {idx + 1}
                                            </div>

                                            {/* Product info */}
                                            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                              <div style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontWeight: 600,
                                                fontSize: '12px',
                                                color: medal.text,
                                                lineHeight: 1.3
                                              }} title={product.name}>
                                                {product.name}
                                              </div>
                                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 1 }}>
                                                {product.quantity} {t('unitPcs')} · {formatPrice(product.revenue)} {t('sum')}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="d-flex flex-column align-items-center justify-content-center" style={{ whiteSpace: 'normal', padding: '24px 8px' }}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                                      </svg>
                                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>{t('noData')}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </>
                )}

              </Tab>

              <Tab eventKey="orders" title={t('orders')}>

                <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                  {/* Status pill tabs */}
                  <div className="d-flex flex-wrap gap-1">
                    {[
                      { value: 'all', label: t('allStatuses'), color: '#64748b' },
                      { value: 'new', label: t('statusNew'), color: '#3b82f6' },
                      { value: 'preparing', label: t('statusPreparing'), color: '#f59e0b' },
                      { value: 'delivering', label: t('statusDelivering'), color: '#6366f1' },
                      { value: 'delivered', label: t('statusDelivered'), color: '#22c55e' },
                      { value: 'cancelled', label: t('statusCancelled'), color: '#ef4444' },
                    ].map(s => {
                      const isActive = statusFilter === s.value;
                      const count = s.value === 'all'
                        ? orders.length
                        : orders.filter(o => o.status === s.value).length;
                      return (
                        <button
                          key={s.value}
                          onClick={() => setStatusFilter(s.value)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 14px',
                            borderRadius: 20,
                            border: isActive ? `1.5px solid ${s.color}` : '1.5px solid #e2e8f0',
                            background: isActive ? s.color : '#fff',
                            color: isActive ? '#fff' : '#64748b',
                            fontSize: '13px',
                            fontWeight: isActive ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.label}
                          {count > 0 && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 20,
                              height: 20,
                              borderRadius: 10,
                              fontSize: '11px',
                              fontWeight: 700,
                              background: isActive ? 'rgba(255,255,255,0.25)' : `${s.color}15`,
                              color: isActive ? '#fff' : s.color,
                              padding: '0 5px',
                            }}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="dark" className="btn-primary-custom" onClick={exportOrders}>
                    {t('downloadExcel')}
                  </Button>
                </div>

                <div className="admin-table-container">
                  <Table responsive hover className="admin-table mb-0">
                    <thead>
                      <tr>
                        <th>{t('orderNumber')}</th>
                        <th>{t('client')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('status')}</th>
                        <th>{t('date')}</th>
                        <th>{t('actions')}</th>
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
                              <small className={!order.is_paid && !billingInfo.restaurant?.is_free_tier ? "text-muted opacity-50" : ""}>
                                {order.customer_phone}
                                {!order.is_paid && !billingInfo.restaurant?.is_free_tier && (
                                  <span className="ms-1" title="Требуется оплата">🔒</span>
                                )}
                              </small>
                            </div>
                          </td>
                          <td>{formatPrice(order.total_amount)} {t('sum')}</td>
                          <td>
                            <div className="d-flex flex-column gap-1">
                              {getStatusBadge(order.status)}
                              {!order.is_paid && !billingInfo.restaurant?.is_free_tier && order.status === 'new' && (
                                <Badge bg="warning" text="dark" style={{ fontSize: '0.65rem' }}>Требует оплаты</Badge>
                              )}
                              {order.is_paid && (
                                <Badge bg="success" style={{ fontSize: '0.65rem' }}>Оплачен</Badge>
                              )}
                            </div>
                          </td>
                          <td>{new Date(order.created_at).toLocaleString('ru-RU')}</td>
                          <td>
                            <div className="d-flex gap-1">
                              {/* Accept & Pay Button for New Unpaid Orders */}
                              {order.status === 'new' && !order.is_paid && !billingInfo.restaurant?.is_free_tier && (
                                <Button
                                  variant="success"
                                  size="sm"
                                  className="action-btn px-2 w-auto"
                                  onClick={() => handleAcceptAndPay(order.id)}
                                  title="Принять и оплатить"
                                >
                                  ✅ Принять
                                </Button>
                              )}

                              <Button
                                className="action-btn bg-primary bg-opacity-10 text-primary border-0"
                                size="sm"
                                onClick={() => openOrderModal(order)}
                                title={t('details')}
                              >
                                <ReceiptIcon />
                              </Button>
                              {order.status !== 'cancelled' && order.status !== 'delivered' && (
                                <Button
                                  className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                  size="sm"
                                  onClick={() => openCancelModal(order.id)}
                                  title={t('cancelOrder')}
                                >
                                  <TrashIcon />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

              </Tab>

              <Tab eventKey="products" title={t('products')}>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">{t('products')}</h5>
                  <div className="d-flex gap-2">
                    <Button variant="dark" className="btn-primary-custom" onClick={exportProducts}>
                      {t('downloadExcel')}
                    </Button>
                    <Button variant="dark" className="btn-primary-custom" onClick={() => setShowExcelModal(true)}>
                      {t('importExcel')}
                    </Button>
                    <Button variant="dark" className="btn-primary-custom" onClick={() => openProductModal()}>
                      {t('addProduct')}
                    </Button>
                  </div>
                </div>

                {/* Filters and Search */}
                <Row className="mb-3 g-2">
                  <Col md={3}>
                    <InputGroup size="sm">
                      <InputGroup.Text>🔍</InputGroup.Text>
                      <Form.Control
                        placeholder={t('searchByName')}
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      {productSearch && (
                        <Button variant="outline-secondary" onClick={() => setProductSearch('')}>
                          ✕
                        </Button>
                      )}
                    </InputGroup>
                  </Col>
                  <Col md={3}>
                    <Dropdown>
                      <Dropdown.Toggle as={CustomToggle} id="dropdown-custom-components" className="form-select-sm">
                        {productCategoryFilter === 'all'
                          ? t('allCategories')
                          : (() => {
                            const selectedObj = categories.find(c => c.id === parseInt(productCategoryFilter));
                            return selectedObj ? selectedObj.name_ru : t('allCategories');
                          })()}
                      </Dropdown.Toggle>

                      <Dropdown.Menu as={CustomMenu}>
                        <Dropdown.Item onClick={() => { setProductCategoryFilter('all'); setProductSubcategoryFilter('all'); }}>
                          {t('allCategories')}
                        </Dropdown.Item>
                        {categories.filter(c => !c.parent_id).map(cat => (
                          <Dropdown.Item
                            key={cat.id}
                            onClick={() => { setProductCategoryFilter(cat.id.toString()); setProductSubcategoryFilter('all'); }}
                            active={productCategoryFilter === cat.id.toString()}
                          >
                            {cat.name_ru}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Col>
                  <Col md={3}>
                    {/* Subcategory dropdown — shown when a root category is selected and has children */}
                    {(() => {
                      const subcats = productCategoryFilter !== 'all'
                        ? categories.filter(c => c.parent_id === parseInt(productCategoryFilter))
                        : [];
                      if (subcats.length === 0) return (
                        <Form.Select size="sm" disabled>
                          <option>{t('selectSubcategory')}</option>
                        </Form.Select>
                      );
                      return (
                        <Dropdown>
                          <Dropdown.Toggle as={CustomToggle} id="dropdown-subcat" className="form-select-sm">
                            {productSubcategoryFilter === 'all'
                              ? t('allCategories')
                              : (() => {
                                const selectedObj = categories.find(c => c.id === parseInt(productSubcategoryFilter));
                                return selectedObj ? selectedObj.name_ru : t('allCategories');
                              })()}
                          </Dropdown.Toggle>

                          <Dropdown.Menu as={CustomMenu}>
                            <Dropdown.Item onClick={() => setProductSubcategoryFilter('all')}>
                              {t('allCategories')}
                            </Dropdown.Item>
                            {subcats.map(sub => (
                              <Dropdown.Item
                                key={sub.id}
                                onClick={() => setProductSubcategoryFilter(sub.id.toString())}
                                active={productSubcategoryFilter === sub.id.toString()}
                              >
                                {sub.name_ru}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      );
                    })()}
                  </Col>
                  <Col md={3}>
                    <Form.Select
                      size="sm"
                      value={productStatusFilter}
                      onChange={(e) => setProductStatusFilter(e.target.value)}
                    >
                      <option value="all">{t('allStatuses')}</option>
                      <option value="active">{t('activeProducts')}</option>
                      <option value="hidden">{t('hiddenProducts')}</option>
                    </Form.Select>
                  </Col>
                </Row>

                {/* Bulk actions bar */}
                {selectedProducts.length > 0 && (
                  <Alert variant="info" className="d-flex justify-content-between align-items-center py-2">
                    <span>{t('selectedProducts')}: <strong>{selectedProducts.length}</strong></span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleBulkDeleteProducts}
                    >
                      {t('deleteSelected')}
                    </Button>
                  </Alert>
                )}

                <div className="admin-table-container">
                  <Table responsive hover className="admin-table mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '40px' }}>
                          <Form.Check
                            type="checkbox"
                            checked={(() => {
                              const filteredIds = products
                                .filter(product => {
                                  if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) return false;
                                  if (productSubcategoryFilter !== 'all') {
                                    if (product.category_id !== parseInt(productSubcategoryFilter)) return false;
                                  } else if (productCategoryFilter !== 'all') {
                                    const rootId = parseInt(productCategoryFilter);
                                    const childIds = categories.filter(c => c.parent_id === rootId).map(c => c.id);
                                    if (product.category_id !== rootId && !childIds.includes(product.category_id)) return false;
                                  }
                                  if (productStatusFilter === 'active' && !product.in_stock) return false;
                                  if (productStatusFilter === 'hidden' && product.in_stock) return false;
                                  return true;
                                })
                                .map(p => p.id);
                              return filteredIds.length > 0 && filteredIds.every(id => selectedProducts.includes(id));
                            })()}
                            onChange={() => {
                              const filteredIds = products
                                .filter(product => {
                                  if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) return false;
                                  if (productSubcategoryFilter !== 'all') {
                                    if (product.category_id !== parseInt(productSubcategoryFilter)) return false;
                                  } else if (productCategoryFilter !== 'all') {
                                    const rootId = parseInt(productCategoryFilter);
                                    const childIds = categories.filter(c => c.parent_id === rootId).map(c => c.id);
                                    if (product.category_id !== rootId && !childIds.includes(product.category_id)) return false;
                                  }
                                  if (productStatusFilter === 'active' && !product.in_stock) return false;
                                  if (productStatusFilter === 'hidden' && product.in_stock) return false;
                                  return true;
                                })
                                .map(p => p.id);
                              toggleSelectAllProducts(filteredIds);
                            }}
                          />
                        </th>
                        <th style={{ width: '50px' }}>№</th>
                        <th style={{ width: '60px' }}>{t('photo')}</th>
                        <th>{t('productName')}</th>
                        <th>{t('category')}</th>
                        <th>{t('price')}</th>
                        <th>{t('status')}</th>
                        <th>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products
                        .filter(product => {
                          // Search filter
                          if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) {
                            return false;
                          }
                          // Category filter
                          if (productSubcategoryFilter !== 'all') {
                            if (product.category_id !== parseInt(productSubcategoryFilter)) return false;
                          } else if (productCategoryFilter !== 'all') {
                            const rootId = parseInt(productCategoryFilter);
                            const childIds = categories.filter(c => c.parent_id === rootId).map(c => c.id);
                            if (product.category_id !== rootId && !childIds.includes(product.category_id)) return false;
                          }
                          // Status filter
                          if (productStatusFilter === 'active' && !product.in_stock) {
                            return false;
                          }
                          if (productStatusFilter === 'hidden' && product.in_stock) {
                            return false;
                          }
                          return true;
                        })
                        .map((product, index) => (
                          <tr key={product.id} className={selectedProducts.includes(product.id) ? 'table-active' : ''}>
                            <td>
                              <Form.Check
                                type="checkbox"
                                checked={selectedProducts.includes(product.id)}
                                onChange={() => toggleProductSelection(product.id)}
                              />
                            </td>
                            <td className="text-muted">{index + 1}</td>
                            <td>
                              {product.image_url ? (
                                <img
                                  src={product.image_url.startsWith('http') ? product.image_url : `${API_URL.replace('/api', '')}${product.image_url}`}
                                  alt={product.name_ru}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    objectFit: 'cover',
                                    borderRadius: 6,
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    setPreviewImageUrl(product.image_url.startsWith('http') ? product.image_url : `${API_URL.replace('/api', '')}${product.image_url}`);
                                    setShowImagePreview(true);
                                  }}
                                />
                              ) : (
                                <div
                                  className="bg-light d-flex align-items-center justify-content-center text-muted"
                                  style={{ width: 40, height: 40, borderRadius: 6 }}
                                >
                                  📷
                                </div>
                              )}
                            </td>
                            <td>{product.name_ru}</td>
                            <td>{categories.find(c => c.id === product.category_id)?.full_path || product.category_name || '-'}</td>
                            <td>{formatPrice(product.price)} сум</td>
                            <td>
                              {product.in_stock ? (
                                <Badge bg="success">Активен</Badge>
                              ) : (
                                <Badge bg="secondary">Скрыт</Badge>
                              )}
                            </td>
                            <td>
                              <Button
                                className="action-btn bg-primary bg-opacity-10 text-primary border-0 me-1"
                                size="sm"
                                onClick={() => openProductModal(product)}
                                title="Редактировать"
                              >
                                <EditIcon />
                              </Button>
                              <Button
                                className="action-btn bg-info bg-opacity-10 text-info border-0 me-1"
                                size="sm"
                                onClick={() => duplicateProduct(product)}
                                title="Дублировать"
                              >
                                <CopyIcon />
                              </Button>
                              <Button
                                className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                size="sm"
                                onClick={() => handleDeleteProduct(product.id)}
                                title="Удалить"
                              >
                                <TrashIcon />
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </Table>
                </div>

                {/* Results count */}
                <div className="text-muted small">
                  {t('found')}: {products.filter(product => {
                    if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) return false;
                    if (productSubcategoryFilter !== 'all') {
                      if (product.category_id !== parseInt(productSubcategoryFilter)) return false;
                    } else if (productCategoryFilter !== 'all') {
                      const rootId = parseInt(productCategoryFilter);
                      const childIds = categories.filter(c => c.parent_id === rootId).map(c => c.id);
                      if (product.category_id !== rootId && !childIds.includes(product.category_id)) return false;
                    }
                    if (productStatusFilter === 'active' && !product.in_stock) return false;
                    if (productStatusFilter === 'hidden' && product.in_stock) return false;
                    return true;
                  }).length} {t('of')} {products.length}
                </div>

              </Tab>

              <Tab eventKey="containers" title={t('containers')}>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5>{t('containers')}</h5>
                  <Button variant="primary" className="btn-primary-custom" onClick={() => openContainerModal()}>
                    {t('add')}
                  </Button>
                </div>
                <p className="text-muted small mb-3">
                  {t('containerDesc')}
                </p>
                <div className="admin-table-container">
                  <Table responsive hover className="admin-table mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t('productName')}</th>
                        <th>{t('price')}</th>
                        <th>{t('sortOrder')}</th>
                        <th>{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="text-center text-muted py-4">
                            {t('noContainersAdded')}
                          </td>
                        </tr>
                      ) : (
                        containers.map(container => (
                          <tr key={container.id}>
                            <td>{container.name}</td>
                            <td>{formatPrice(container.price)} {t('sum')}</td>
                            <td>{container.sort_order}</td>
                            <td>
                              <Button
                                className="action-btn bg-primary bg-opacity-10 text-primary border-0 me-1"
                                size="sm"
                                onClick={() => openContainerModal(container)}
                                title={t('edit')}
                              >
                                <EditIcon />
                              </Button>
                              <Button
                                className="action-btn bg-danger bg-opacity-10 text-danger border-0"
                                size="sm"
                                onClick={() => deleteContainer(container.id)}
                                title={t('delete')}
                              >
                                <TrashIcon />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>

              </Tab>

              <Tab eventKey="feedback" title={
                <span>
                  {t('feedbackTab')}
                  {feedbackStats.new_count > 0 && (
                    <Badge bg="danger" className="ms-2">{feedbackStats.new_count}</Badge>
                  )}
                </span>
              }>

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5>{t('customerAppeals')}</h5>
                  <div className="d-flex gap-2">
                    <Form.Select
                      size="sm"
                      style={{ width: 'auto' }}
                      value={feedbackFilter.type}
                      onChange={(e) => setFeedbackFilter({ ...feedbackFilter, type: e.target.value })}
                    >
                      <option value="">{t('allTypes')}</option>
                      <option value="complaint">{t('complaint')}</option>
                      <option value="suggestion">{t('suggestion')}</option>
                      <option value="question">{t('question')}</option>
                      <option value="other">{t('other')}</option>
                    </Form.Select>
                    <Form.Select
                      size="sm"
                      style={{ width: 'auto' }}
                      value={feedbackFilter.status}
                      onChange={(e) => setFeedbackFilter({ ...feedbackFilter, status: e.target.value })}
                    >
                      <option value="">{t('allStatuses')}</option>
                      <option value="new">{t('statusNew')}</option>
                      <option value="in_progress">{t('inProgress')}</option>
                      <option value="resolved">{t('resolved')}</option>
                      <option value="closed">{t('closed')}</option>
                    </Form.Select>
                  </div>
                </div>
                {feedback.length === 0 ? (
                  <p className="text-muted text-center py-4">{t('noAppeals')}</p>
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>#</th>
                          <th>{t('client')}</th>
                          <th>{t('type')}</th>
                          <th>{t('message')}</th>
                          <th>{t('status')}</th>
                          <th>{t('date')}</th>
                          <th>{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feedback.map((fb) => (
                          <tr key={fb.id} style={{ cursor: 'pointer' }} onClick={() => openFeedbackDetail(fb)}>
                            <td>{fb.id}</td>
                            <td>
                              <div>{fb.customer_name}</div>
                              <small className="text-muted">{fb.customer_phone}</small>
                            </td>
                            <td>
                              <Badge bg={
                                fb.type === 'complaint' ? 'danger' :
                                  fb.type === 'suggestion' ? 'info' :
                                    fb.type === 'question' ? 'warning' : 'secondary'
                              }>
                                {fb.type === 'complaint' ? t('complaint') :
                                  fb.type === 'suggestion' ? t('suggestion') :
                                    fb.type === 'question' ? t('question') : t('other')}
                              </Badge>
                            </td>
                            <td style={{ maxWidth: '250px' }}>
                              <div style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {fb.message}
                              </div>
                            </td>
                            <td>
                              <Badge bg={
                                fb.status === 'new' ? 'primary' :
                                  fb.status === 'in_progress' ? 'warning' :
                                    fb.status === 'resolved' ? 'success' : 'secondary'
                              }>
                                {fb.status === 'new' ? t('statusNew') :
                                  fb.status === 'in_progress' ? t('inProgress') :
                                    fb.status === 'resolved' ? t('resolved') : t('closed')}
                              </Badge>
                            </td>
                            <td>{new Date(fb.created_at).toLocaleDateString()}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <Button
                                className="action-btn bg-info bg-opacity-10 text-info border-0"
                                size="sm"
                                onClick={() => openFeedbackDetail(fb)}
                                title={t('view')}
                              >
                                <EyeIcon />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Tab>

              <Tab eventKey="settings" title={<span>{t('settings')}</span>}>
                <div className="px-4 pt-3 pb-0 border-bottom bg-white rounded-top-4">
                  <Nav variant="tabs" activeKey={settingsTab} onSelect={(k) => setSettingsTab(k)} className="border-0">
                    <Nav.Item>
                      <Nav.Link eventKey="general" className={`px-4 py-3 fw-bold border-0 border-bottom border-3 ${settingsTab === 'general' ? 'border-primary text-primary' : 'text-muted'}`}>Общие</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="delivery" className={`px-4 py-3 fw-bold border-0 border-bottom border-3 ${settingsTab === 'delivery' ? 'border-primary text-primary' : 'text-muted'}`}>Доставка</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey="operators" className={`px-4 py-3 fw-bold border-0 border-bottom border-3 ${settingsTab === 'operators' ? 'border-primary text-primary' : 'text-muted'}`}>Операторы</Nav.Link>
                    </Nav.Item>
                  </Nav>
                </div>

                <div className="p-4 bg-light" style={{ minHeight: '60vh' }}>
                  {restaurantSettings ? (
                    <>
                      {settingsTab === 'general' && (
                        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <Row className="gy-4">
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Название ресторана</Form.Label>
                                  <Form.Control
                                    type="text"
                                    className="form-control-custom"
                                    value={restaurantSettings.name}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, name: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Телефон</Form.Label>
                                  <Form.Control
                                    type="text"
                                    className="form-control-custom"
                                    value={restaurantSettings.phone}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, phone: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Адрес</Form.Label>
                                  <Form.Control
                                    type="text"
                                    className="form-control-custom"
                                    value={restaurantSettings.address}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, address: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Logo URL</Form.Label>
                                  <div className="d-flex gap-3 align-items-center">
                                    {restaurantSettings.logo_url && (
                                      <img
                                        src={restaurantSettings.logo_url}
                                        alt="Logo"
                                        className="rounded-3"
                                        style={{ width: 64, height: 64, objectFit: 'cover' }}
                                      />
                                    )}
                                    <Form.Control
                                      type="text"
                                      className="form-control-custom flex-grow-1"
                                      value={restaurantSettings.logo_url || ''}
                                      onChange={e => setRestaurantSettings({ ...restaurantSettings, logo_url: e.target.value })}
                                      placeholder="https://example.com/logo.png"
                                    />
                                  </div>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Начало работы</Form.Label>
                                  <Form.Control
                                    type="time"
                                    className="form-control-custom"
                                    value={restaurantSettings.start_time || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, start_time: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Конец работы</Form.Label>
                                  <Form.Control
                                    type="time"
                                    className="form-control-custom"
                                    value={restaurantSettings.end_time || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, end_time: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={12} className="border-top pt-4">
                                <h6 className="fw-bold mb-3">Telegram Интеграция</h6>
                                <Row className="gy-3">
                                  <Col md={6}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Bot Token</Form.Label>
                                      <Form.Control
                                        type="password"
                                        className="form-control-custom"
                                        value={restaurantSettings.telegram_bot_token || ''}
                                        onChange={e => setRestaurantSettings({ ...restaurantSettings, telegram_bot_token: e.target.value })}
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Group ID (чат для заказов)</Form.Label>
                                      <Form.Control
                                        type="text"
                                        className="form-control-custom"
                                        value={restaurantSettings.telegram_group_id || ''}
                                        onChange={e => setRestaurantSettings({ ...restaurantSettings, telegram_group_id: e.target.value })}
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={12}>
                                    {isSuperAdmin && (
                                      <Form.Group className="mb-3">
                                        <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Username поддержки (@...)</Form.Label>
                                        <Form.Control
                                          type="text"
                                          className="form-control-custom"
                                          value={restaurantSettings.support_username || ''}
                                          onChange={e => setRestaurantSettings({ ...restaurantSettings, support_username: e.target.value })}
                                        />
                                      </Form.Group>
                                    )}
                                    <div className="d-grid d-md-flex mt-2">
                                      <Button
                                        variant="outline-primary"
                                        size="sm"
                                        className="px-4 py-2 rounded-3 fw-bold"
                                        onClick={testBot}
                                        disabled={testingBot}
                                      >
                                        {testingBot ? '⌛ Проверка...' : '🔍 Проверить работу бота'}
                                      </Button>
                                    </div>
                                  </Col>
                                </Row>
                              </Col>

                              <Col md={12} className="border-top pt-4">
                                <h6 className="fw-bold mb-3">Платежные ссылки</h6>
                                <Row className="gy-3">
                                  <Col md={6}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Click URL</Form.Label>
                                      <Form.Control
                                        type="text"
                                        className="form-control-custom"
                                        value={restaurantSettings.click_url || ''}
                                        onChange={e => setRestaurantSettings({ ...restaurantSettings, click_url: e.target.value })}
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group>
                                      <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Payme URL</Form.Label>
                                      <Form.Control
                                        type="text"
                                        className="form-control-custom"
                                        value={restaurantSettings.payme_url || ''}
                                        onChange={e => setRestaurantSettings({ ...restaurantSettings, payme_url: e.target.value })}
                                      />
                                    </Form.Group>
                                  </Col>
                                </Row>
                              </Col>
                            </Row>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom"
                                onClick={saveRestaurantSettings}
                                disabled={savingSettings}
                              >
                                {savingSettings ? 'Сохранение...' : 'Сохранить изменения'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {settingsTab === 'delivery' && (
                        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                          <Card.Body className="p-4">
                            <Row className="gy-4">
                              <Col md={12}>
                                <Form.Check
                                  type="switch"
                                  label="Включить собственную доставку"
                                  className="fw-bold mb-4"
                                  checked={restaurantSettings.is_delivery_enabled}
                                  onChange={e => setRestaurantSettings({ ...restaurantSettings, is_delivery_enabled: e.target.checked })}
                                />
                              </Col>

                              <Col md={12}>
                                <div className="mb-4">
                                  <label className="small fw-bold text-muted text-uppercase mb-2 d-block">Точка центра доставки на карте</label>
                                  <YandexLocationPicker
                                    latitude={restaurantSettings.latitude}
                                    longitude={restaurantSettings.longitude}
                                    onLocationChange={(lat, lng) => setRestaurantSettings({ ...restaurantSettings, latitude: lat, longitude: lng })}
                                    height="400px"
                                  />
                                  <div className="small text-muted mt-2">Кликните на карту или перетащите маркер, чтобы установить координаты заведения.</div>
                                </div>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Широта (Latitude)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    step="any"
                                    className="form-control-custom"
                                    value={restaurantSettings.latitude || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, latitude: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Долгота (Longitude)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    step="any"
                                    className="form-control-custom"
                                    value={restaurantSettings.longitude || ''}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, longitude: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Базовый радиус (км)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    className="form-control-custom"
                                    value={restaurantSettings.delivery_base_radius || 0}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, delivery_base_radius: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Базовая цена (сум)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    className="form-control-custom"
                                    value={restaurantSettings.delivery_base_price || 0}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, delivery_base_price: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase mb-2">Цена за доп. км (сум)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    className="form-control-custom"
                                    value={restaurantSettings.delivery_price_per_km || 0}
                                    onChange={e => setRestaurantSettings({ ...restaurantSettings, delivery_price_per_km: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                            </Row>

                            <Col md={12}>
                              <Button
                                variant="outline-primary"
                                className="w-100 py-3 rounded-4 border-dashed mt-3 shadow-none overflow-hidden"
                                onClick={() => setShowDeliveryZoneModal(true)}
                                style={{ borderStyle: 'dashed' }}
                              >
                                🗺️ {restaurantSettings.delivery_zone ? 'Редактировать зону доставки' : 'Настроить зону доставки'}
                              </Button>
                            </Col>

                            <div className="mt-4 pt-3 border-top text-end">
                              <Button
                                variant="primary"
                                className="px-5 py-2 rounded-pill fw-bold btn-primary-custom shadow-none"
                                onClick={saveRestaurantSettings}
                                disabled={savingSettings}
                              >
                                {savingSettings ? 'Сохранение...' : 'Сохранить изменения'}
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}


                      {settingsTab === 'operators' && (
                        <>
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold mb-0">Операторы ресторана</h5>
                            <Button
                              variant="primary"
                              className="rounded-pill px-4 fw-bold shadow-sm btn-primary-custom"
                              onClick={() => openOperatorModal(null)}
                            >
                              + Добавить оператора
                            </Button>
                          </div>
                          <div className="admin-table-container">
                            <Table responsive hover className="admin-table mb-0">
                              <thead>
                                <tr>
                                  <th>Имя</th>
                                  <th>Username</th>
                                  <th>Телефон</th>
                                  <th className="text-end">ДЕЙСТВИЯ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {operators.map(op => (
                                  <tr key={op.id}>
                                    <td>{op.full_name}</td>
                                    <td><code>@{op.username}</code></td>
                                    <td>{op.phone}</td>
                                    <td className="text-end">
                                      <div className="d-flex gap-2 justify-content-end">
                                        <Button
                                          variant="light"
                                          className="action-btn text-primary shadow-none border-0"
                                          onClick={() => openOperatorModal(op)}
                                          title="Редактировать"
                                        >
                                          <EditIcon />
                                        </Button>
                                        <Button
                                          variant="light"
                                          className="action-btn text-danger shadow-none border-0"
                                          onClick={() => deleteOperator(op.id)}
                                          disabled={op.id === user?.id}
                                          title="Удалить"
                                        >
                                          <TrashIcon />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {operators.length === 0 && (
                                  <tr>
                                    <td colSpan="4" className="text-center py-4 text-muted">Нет дополнительных операторов</td>
                                  </tr>
                                )}
                              </tbody>
                            </Table>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-5">Загрузка настроек...</div>
                  )}
                </div>
              </Tab>
            </Tabs>
          </Card.Body>
        </Card>

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
                  <strong>Сумма:</strong> {formatPrice(selectedOrder.total_amount)} сум
                </div>

                {/* Processed by operator info */}
                {selectedOrder.processed_by_name && (
                  <div className="mb-3">
                    <strong>
                      {selectedOrder.status === 'cancelled' ? '❌ Отменил:' : '✅ Обработал:'}
                    </strong>{' '}
                    {selectedOrder.processed_by_name}
                    {selectedOrder.processed_at && (
                      <small className="text-muted ms-2">
                        ({new Date(selectedOrder.processed_at).toLocaleString('ru-RU')})
                      </small>
                    )}
                  </div>
                )}

                {/* Admin comment (rejection reason) */}
                {selectedOrder.admin_comment && (
                  <div className="mb-3 p-2 bg-light rounded">
                    <strong>Причина отмены:</strong> {selectedOrder.admin_comment}
                  </div>
                )}

                {/* Order Status Stepper */}
                <div className="mb-4">
                  <strong className="d-block mb-2">Статус заказа:</strong>
                  {(() => {
                    const statuses = [
                      { key: 'new', label: 'Новый', num: 1 },
                      { key: 'preparing', label: 'Готовится', num: 2 },
                      { key: 'delivering', label: 'Доставляется', num: 3 },
                      { key: 'delivered', label: 'Доставлен', num: 4 }
                    ];
                    const currentStatus = selectedOrder.status;
                    const isCancelled = currentStatus === 'cancelled';
                    const currentIdx = statuses.findIndex(s => s.key === currentStatus);
                    const cancelledAtIdx = isCancelled ?
                      (selectedOrder.cancelled_at_status ?
                        statuses.findIndex(s => s.key === selectedOrder.cancelled_at_status) : 0) : -1;

                    // Calculate progress percentage
                    let progressPercent = 0;
                    if (!isCancelled) {
                      if (currentIdx === 0) progressPercent = 0;
                      else if (currentIdx === 1) progressPercent = 33;
                      else if (currentIdx === 2) progressPercent = 66;
                      else if (currentIdx === 3) progressPercent = 100;
                    } else {
                      if (cancelledAtIdx === 0) progressPercent = 0;
                      else if (cancelledAtIdx === 1) progressPercent = 33;
                      else if (cancelledAtIdx === 2) progressPercent = 66;
                      else progressPercent = 33;
                    }

                    return (
                      <div className="bg-white rounded p-3" style={{ border: '1px solid #eee' }}>
                        <div className="order-stepper">
                          <div className="stepper-line-container">
                            <div className="stepper-line-bg"></div>
                            <div
                              className={`stepper-line-progress ${isCancelled ? 'cancelled' : ''}`}
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>

                          {statuses.map((status, idx) => {
                            const isCompleted = !isCancelled && currentIdx > idx;
                            const isActive = !isCancelled && currentIdx === idx;
                            const isCancelledStep = isCancelled && cancelledAtIdx === idx;
                            const isPastCancelled = isCancelled && idx < cancelledAtIdx;

                            let stepClass = 'stepper-step';
                            if (isCompleted || isPastCancelled) stepClass += ' completed';
                            if (isActive) stepClass += ' active';
                            if (isCancelledStep) stepClass += ' cancelled active';

                            return (
                              <div
                                key={status.key}
                                className={stepClass}
                                data-step={status.num}
                              >
                                <div
                                  className="stepper-circle"
                                  onClick={() => {
                                    if (!isCancelled && currentStatus !== status.key) {
                                      updateOrderStatus(selectedOrder.id, status.key);
                                    }
                                  }}
                                  title={`Изменить на: ${status.label}`}
                                >
                                  {isCancelledStep ? '✕' : status.num}
                                </div>
                                <div className="stepper-label">
                                  {isCancelledStep ? 'Отменён' : status.label}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Cancel reason */}
                        {isCancelled && selectedOrder.cancel_reason && (
                          <div className="cancel-reason-box">
                            <strong>Причина отмены:</strong>
                            {selectedOrder.cancel_reason}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <strong>Товары:</strong>
                      {!isEditingItems ? (
                        <Button variant="outline-primary" size="sm" onClick={startEditingItems}>
                          Редактировать
                        </Button>
                      ) : (
                        <div className="d-flex gap-2">
                          <Button variant="success" size="sm" onClick={saveEditedItems} disabled={savingItems}>
                            {savingItems ? '...' : '💾 Сохранить'}
                          </Button>
                          <Button variant="outline-secondary" size="sm" onClick={cancelEditingItems}>
                            Отмена
                          </Button>
                        </div>
                      )}
                    </div>

                    <Table className="mt-2" size="sm">
                      <thead>
                        <tr>
                          <th>Товар</th>
                          <th>Кол-во</th>
                          <th>Цена</th>
                          <th>Сумма</th>
                          {isEditingItems && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(isEditingItems ? editingItems : selectedOrder.items).map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.product_name}</td>
                            <td>
                              {isEditingItems ? (
                                <div className="d-flex align-items-center gap-1">
                                  <Button variant="outline-secondary" size="sm" onClick={() => updateItemQuantity(idx, -1)}>-</Button>
                                  <span className="mx-1">{item.quantity}</span>
                                  <Button variant="outline-secondary" size="sm" onClick={() => updateItemQuantity(idx, 1)}>+</Button>
                                </div>
                              ) : (
                                `${item.quantity} ${item.unit}`
                              )}
                            </td>
                            <td>{formatPrice(item.price)}</td>
                            <td>{formatPrice(item.quantity * item.price)}</td>
                            {isEditingItems && (
                              <td>
                                <Button variant="outline-danger" size="sm" onClick={() => removeItem(idx)}>X</Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </Table>

                    {/* Add product dropdown when editing */}
                    {isEditingItems && (
                      <Form.Group className="mt-2">
                        <Form.Label className="small">Добавить товар:</Form.Label>
                        <Form.Select
                          size="sm"
                          onChange={(e) => {
                            if (e.target.value) {
                              const product = products.find(p => p.id === parseInt(e.target.value));
                              if (product) addProductToOrder(product);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Выберите товар...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name_ru} - {formatPrice(p.price)} сум</option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    )}

                    {/* New total when editing */}
                    {isEditingItems && (
                      <div className="mt-2 text-end">
                        <strong>Новая сумма: {formatPrice(editingItems.reduce((sum, i) => sum + (i.quantity * i.price), 0))} сум</strong>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="bg-light border-0">
            <Button variant="secondary" onClick={() => setShowOrderModal(false)}>{t('close')}</Button>
          </Modal.Footer>
        </Modal>

        {/* Balance Modal */}
        <Modal
          show={showBalanceModal}
          onHide={() => setShowBalanceModal(false)}
          size="lg"
          centered
          className="admin-modal"
        >
          <Modal.Header closeButton closeVariant="white" className="text-white border-0" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}>
            <Modal.Title className="d-flex align-items-center gap-3">
              <span className="fs-3">💰</span>
              <div>
                <h5 className="mb-0 fw-bold">{t('accountBalance')}</h5>
                <p className="mb-0 small opacity-75 fw-normal">{user?.active_restaurant_name}</p>
              </div>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-0">
            {/* Balance Overview */}
            <div className="bg-light p-4 border-bottom d-flex justify-content-between align-items-center">
              <div>
                <div className="text-muted small text-uppercase fw-bold mb-1" style={{ letterSpacing: '0.05rem' }}>{t('currentBalance')}</div>
                <h2 className="mb-0 fw-bold text-primary">{formatPrice(user?.balance || 0)} <span className="fs-5 fw-normal">{t('sum')}</span></h2>
              </div>
              {billingInfo.restaurant?.is_free_tier ? (
                <Badge bg="success" className="px-3 py-2 fs-6">⭐ {t('freeTier')}</Badge>
              ) : (
                <div className="text-end">
                  <div className="text-muted small text-uppercase fw-bold mb-1" style={{ letterSpacing: '0.05rem' }}>{t('orderCost')}</div>
                  <h4 className="mb-0 fw-bold">{formatPrice(billingInfo.restaurant?.order_cost || 1000)} <span className="fs-6 fw-normal text-muted">{t('sum')}</span></h4>
                </div>
              )}
            </div>

            <div className="p-4">
              {/* Navigation Tabs */}
              <div className="custom-modal-tabs mb-4 p-1 bg-light rounded-3 d-flex overflow-hidden">
                <div
                  className={`flex-fill text-center py-2 px-3 cursor-pointer transition-all rounded-2 ${balanceTab === 'data' ? 'bg-white shadow-sm fw-bold text-primary' : 'text-muted'}`}
                  onClick={() => setBalanceTab('data')}
                  style={{ cursor: 'pointer' }}
                >
                  {t('paymentInfo')}
                </div>
                <div
                  className={`flex-fill text-center py-2 px-3 cursor-pointer transition-all rounded-2 ${balanceTab === 'incomes' ? 'bg-white shadow-sm fw-bold text-primary' : 'text-muted'}`}
                  onClick={() => {
                    setBalanceTab('incomes');
                    fetchBillingHistory('deposit');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {t('incomes')}
                </div>
                <div
                  className={`flex-fill text-center py-2 px-3 cursor-pointer transition-all rounded-2 ${balanceTab === 'expenses' ? 'bg-white shadow-sm fw-bold text-primary' : 'text-muted'}`}
                  onClick={() => {
                    setBalanceTab('expenses');
                    fetchBillingHistory('withdrawal');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {t('expenses')}
                </div>
              </div>

              {balanceTab === 'data' && (
                <div className="animate-fade-in">
                  <Row className="g-4">
                    <Col md={6}>
                      <div className="p-4 rounded-4 bg-white border border-light shadow-sm h-100">
                        <div className="d-flex align-items-center gap-2 mb-4">
                          <span className="fs-5">💳</span>
                          <h6 className="mb-0 fw-bold text-dark text-uppercase small" style={{ letterSpacing: '0.05rem' }}>{t('bankCard')}</h6>
                        </div>

                        <div className="mb-4">
                          <label className="text-muted extra-small fw-bold text-uppercase mb-2 d-block" style={{ letterSpacing: '0.05rem', fontSize: '0.65rem' }}>{t('cardNumber')}</label>
                          <div className="d-flex align-items-center justify-content-between p-2 bg-light rounded-3 border">
                            <span className="fw-bold fs-5 font-monospace">{billingInfo.requisites?.card_number || '—'}</span>
                            {billingInfo.requisites?.card_number && (
                              <Button
                                variant="link"
                                className="p-1 text-primary text-decoration-none"
                                onClick={() => {
                                  navigator.clipboard.writeText(billingInfo.requisites.card_number);
                                  setSuccess('Скопировано');
                                }}
                                title="Копировать"
                              >
                                <CopyIcon />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="text-muted extra-small fw-bold text-uppercase mb-1 d-block" style={{ letterSpacing: '0.05rem', fontSize: '0.65rem' }}>{t('cardHolder')}</label>
                          <div className="fw-bold text-dark">{billingInfo.requisites?.card_holder || '—'}</div>
                        </div>

                        <div>
                          <label className="text-muted extra-small fw-bold text-uppercase mb-1 d-block" style={{ letterSpacing: '0.05rem', fontSize: '0.65rem' }}>{t('phoneNumber')}</label>
                          <div className="fw-bold text-dark">{billingInfo.requisites?.phone_number || '—'}</div>
                        </div>
                      </div>
                    </Col>

                    <Col md={6}>
                      <div className="p-4 rounded-4 bg-white border border-light shadow-sm h-100">
                        <div className="d-flex align-items-center gap-2 mb-4">
                          <span className="fs-5">💬</span>
                          <h6 className="mb-0 fw-bold text-dark text-uppercase small" style={{ letterSpacing: '0.05rem' }}>{t('supportTitle')}</h6>
                        </div>

                        <div className="mb-4">
                          <label className="text-muted extra-small fw-bold text-uppercase mb-2 d-block" style={{ letterSpacing: '0.05rem', fontSize: '0.65rem' }}>Telegram</label>
                          <div className="p-2 bg-light rounded-3 border">
                            {billingInfo.requisites?.telegram_username ? (
                              <a
                                href={`https://t.me/${billingInfo.requisites.telegram_username.replace('@', '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="fw-bold text-info text-decoration-none d-flex align-items-center gap-2"
                              >
                                <span>@{billingInfo.requisites.telegram_username.replace('@', '')}</span>
                                <span className="small">↗️</span>
                              </a>
                            ) : <span className="fw-bold text-muted">—</span>}
                          </div>
                        </div>

                        <div className="d-flex gap-2">
                          {billingInfo.requisites?.click_link && (
                            <Button
                              variant="primary"
                              className="flex-fill fw-bold rounded-3 py-2 btn-click"
                              href={billingInfo.requisites.click_link}
                              target="_blank"
                              style={{ backgroundColor: '#00BAE0', border: 'none' }}
                            >
                              CLICK
                            </Button>
                          )}
                          {billingInfo.requisites?.payme_link && (
                            <Button
                              variant="info"
                              className="flex-fill fw-bold text-white rounded-3 py-2 btn-payme"
                              href={billingInfo.requisites.payme_link}
                              target="_blank"
                              style={{ backgroundColor: '#3d7ea6', border: 'none' }}
                            >
                              PAYME
                            </Button>
                          )}
                        </div>
                      </div>
                    </Col>
                  </Row>

                  <div className="mt-4 p-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-4 d-flex gap-3 align-items-center shadow-sm">
                    <div className="fs-3">ℹ️</div>
                    <div className="small text-dark fw-medium lh-sm">
                      {t('topupInstruction')}
                    </div>
                  </div>
                </div>
              )}

              {(balanceTab === 'incomes' || balanceTab === 'expenses') && (
                <div className="admin-table-container rounded-4 border overflow-hidden shadow-sm animate-fade-in">
                  <Table responsive hover className="admin-table mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th className="py-3 px-4 small fw-bold text-muted text-uppercase">{t('dateAndTime')}</th>
                        <th className="py-3 px-4 small fw-bold text-muted text-uppercase">{t('description')}</th>
                        <th className="py-3 px-4 small fw-bold text-muted text-uppercase text-end">{t('amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingBilling ? (
                        <tr><td colSpan="3" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                      ) : billingHistory.length > 0 ? (
                        billingHistory.map(item => (
                          <tr key={item.id}>
                            <td className="py-3 px-4 vertical-align-middle">
                              <div className="fw-bold text-dark">{new Date(item.created_at).toLocaleDateString()}</div>
                              <div className="extra-small text-muted">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td className="py-3 px-4 vertical-align-middle fw-medium">{item.description}</td>
                            <td className={`py-3 px-4 vertical-align-middle text-end fw-bold fs-6 ${item.amount > 0 ? 'text-success' : 'text-danger'}`}>
                              {item.amount > 0 ? '+' : ''}{formatPrice(item.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="3" className="text-center py-5 text-muted fw-medium">{t('noData')}</td></tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer className="border-top p-3">
            <Button variant="light" className="fw-bold px-4 rounded-3 border" onClick={() => setShowBalanceModal(false)}>{t('close')}</Button>
          </Modal.Footer>
        </Modal>
        {/* Product Modal */}
        <Modal show={showProductModal} onHide={() => setShowProductModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>
              {selectedProduct ? t('editProduct') : t('addProduct')}
            </Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleProductSubmit}>
            <Modal.Body>
              {(() => {
                const getCategoryPathIds = (catId) => {
                  const path = [];
                  let currentId = catId;
                  while (currentId) {
                    const cat = categories.find(c => c.id === parseInt(currentId));
                    if (cat) {
                      path.unshift(cat.id);
                      currentId = cat.parent_id;
                    } else {
                      break;
                    }
                  }
                  return path;
                };

                const selectedPathIds = getCategoryPathIds(productForm.category_id);
                const dropdownsToRender = [];
                let currentLevelCategories = categories.filter(c => !c.parent_id);
                let level = 0;

                while (currentLevelCategories.length > 0) {
                  const selectedIdForThisLevel = selectedPathIds[level] || '';
                  const isRootLevel = level === 0;

                  const handleSelect = (newVal) => {
                    if (newVal) {
                      setProductForm({ ...productForm, category_id: newVal });
                    } else {
                      const parentId = level > 0 ? selectedPathIds[level - 1] : '';
                      setProductForm({ ...productForm, category_id: parentId.toString() });
                    }
                  };

                  const selectedCat = currentLevelCategories.find(c => c.id.toString() === selectedIdForThisLevel.toString());
                  const defaultLabel = isRootLevel ? t('selectCategory') : t('selectSubcategory');
                  const dropDownLabel = selectedCat ? selectedCat.name_ru : defaultLabel;

                  dropdownsToRender.push(
                    <Col md={6} key={`category-level-${level}`}>
                      <Form.Group className="mb-3">
                        <Form.Label>{isRootLevel ? t('categoryRequired') : `${t('subcategoryLevel')} ${level}`}</Form.Label>
                        <Dropdown>
                          <Dropdown.Toggle as={CustomToggle} id={`dropdown-category-level-${level}`}>
                            {dropDownLabel}
                          </Dropdown.Toggle>

                          <Dropdown.Menu as={CustomMenu}>
                            <Dropdown.Item onClick={() => handleSelect('')}>
                              {defaultLabel}
                            </Dropdown.Item>
                            {currentLevelCategories.map(cat => (
                              <Dropdown.Item
                                key={cat.id}
                                onClick={() => handleSelect(cat.id.toString())}
                                active={selectedIdForThisLevel.toString() === cat.id.toString()}
                              >
                                {cat.name_ru}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                        {/* Hidden input to ensure HTML5 validation still catches required field */}
                        {isRootLevel && (
                          <input
                            type="text"
                            style={{ display: 'none' }}
                            required
                            value={selectedIdForThisLevel}
                            onChange={() => { }}
                          />
                        )}
                      </Form.Group>
                    </Col>
                  );

                  if (selectedIdForThisLevel) {
                    currentLevelCategories = categories.filter(c => c.parent_id === parseInt(selectedIdForThisLevel));
                    level++;
                  } else {
                    break;
                  }
                }

                return <Row>{dropdownsToRender}</Row>;
              })()}

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('nameRu')}</Form.Label>
                    <Form.Control
                      required
                      type="text"
                      value={productForm.name_ru}
                      onChange={(e) => setProductForm({ ...productForm, name_ru: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('nameUz')}</Form.Label>
                    <Form.Control
                      type="text"
                      value={productForm.name_uz}
                      onChange={(e) => setProductForm({ ...productForm, name_uz: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>{t('descriptionRu')}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={productForm.description_ru}
                  onChange={(e) => setProductForm({ ...productForm, description_ru: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>{t('descriptionUz')}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={productForm.description_uz}
                  onChange={(e) => setProductForm({ ...productForm, description_uz: e.target.value })}
                />
              </Form.Group>

              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('priceSum')}</Form.Label>
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
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('unit')}</Form.Label>
                    <Form.Select
                      required
                      value={productForm.unit}
                      onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    >
                      <option value="шт">{t('unitPcs')}</option>
                      <option value="порция">{t('unitPortion')}</option>
                      <option value="кг">{t('unitKg')}</option>
                      <option value="л">{t('unitL')}</option>
                      <option value="г">{t('unitG')}</option>
                      <option value="мл">{t('unitMl')}</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('containerLabel')}</Form.Label>
                    <Form.Select
                      value={productForm.container_id}
                      onChange={(e) => setProductForm({ ...productForm, container_id: e.target.value })}
                    >
                      <option value="">{t('noContainer')}</option>
                      {containers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} (+{formatPrice(c.price)} {t('sum')})
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Text className="text-muted">
                      {t('containerCostNote')}
                    </Form.Text>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('image')}</Form.Label>
                    <div
                      className="border rounded p-3 mb-2 text-center"
                      style={{
                        background: '#f8f9fa',
                        cursor: 'pointer',
                        minHeight: '100px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column'
                      }}
                      tabIndex={0}
                      onPaste={(e) => handlePaste(e, (url) => setProductForm({ ...productForm, image_url: url }))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) {
                          handleImageUpload(file, (url) => setProductForm({ ...productForm, image_url: url }));
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      {productForm.image_url ? (
                        <div className="position-relative">
                          <img
                            src={productForm.image_url}
                            alt="Preview"
                            style={{ maxWidth: '200px', maxHeight: '150px', objectFit: 'cover' }}
                            className="img-thumbnail"
                          />
                          <Button
                            variant="link"
                            size="sm"
                            className="d-block mx-auto mt-1"
                            onClick={() => setProductForm({ ...productForm, image_url: '' })}
                          >
                            ❌ {t('removeImage')}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-muted">
                          <div style={{ fontSize: '2rem' }}>📷</div>
                          <small>
                            {t('pasteImage')}<br />
                            {t('orDragFile')}
                          </small>
                        </div>
                      )}
                    </div>
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
                    {uploadingImage && (
                      <div className="text-muted mt-2">
                        <small>⏳ {t('uploadingImage')}</small>
                      </div>
                    )}
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('orEnterUrl')}</Form.Label>
                    <Form.Control
                      type="url"
                      value={productForm.image_url}
                      onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                    />
                  </Form.Group>
                </Col>
              </Row>

              {selectedProduct && (
                <Form.Group className="mb-3">
                  <Form.Check
                    type="switch"
                    label={t('hideProduct')}
                    checked={!productForm.in_stock}
                    onChange={(e) => setProductForm({ ...productForm, in_stock: !e.target.checked })}
                  />
                  <Form.Text className="text-muted">
                    {t('hideProductNote')}
                  </Form.Text>
                </Form.Group>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowProductModal(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" type="submit">
                {selectedProduct ? t('save') : t('add')}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Broadcast Modal */}
        <Modal show={showBroadcastModal} onHide={() => setShowBroadcastModal(false)} size="xl">
          <Modal.Header closeButton className="border-0">
            <Modal.Title className="d-flex align-items-center">
              <span className="me-2">📢</span> {t('broadcastTitle') || 'Рассылка уведомлений'}
            </Modal.Title>
          </Modal.Header>
          <div className="px-4 pb-0">
            <Nav variant="tabs" activeKey={broadcastModalTab} onSelect={(k) => {
              setBroadcastModalTab(k);
              if (k === 'scheduled') fetchScheduledBroadcasts();
              if (k === 'history') fetchBroadcastHistory();
            }}>
              <Nav.Item>
                <Nav.Link eventKey="send">{editingBroadcastId ? '✏️ Редактировать' : '🆕 Создать'}</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="scheduled">📅 Очередь</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="history">📜 История</Nav.Link>
              </Nav.Item>
            </Nav>
          </div>
          <Modal.Body className="p-0">
            {broadcastModalTab === 'send' ? (
              <Row className="g-0">
                {/* Left Column: Form */}
                <Col md={7} className="p-4 border-end">
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">{t('photo') || 'Фото'} (необязательно)</Form.Label>
                    <div
                      className="border rounded p-3 mb-2 text-center"
                      style={{
                        borderStyle: 'dashed',
                        background: '#f8f9fa',
                        cursor: 'pointer',
                        minHeight: '100px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0d6efd'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#dee2e6'}
                      tabIndex={0}
                      onPaste={(e) => handlePaste(e, (url) => setBroadcastForm({ ...broadcastForm, image_url: url }))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) {
                          const syntheticEvent = { target: { files: [file] } };
                          handleBroadcastImageUpload(syntheticEvent);
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => document.getElementById('broadcast-file-input').click()}
                    >
                      {broadcastForm.image_url ? (
                        <div className="position-relative">
                          <img
                            src={broadcastForm.image_url}
                            alt="Preview"
                            style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }}
                            className="rounded"
                          />
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: '1.2rem' }}>📸</div>
                          <div className="text-muted small">Вставьте (Ctrl+V) или нажмите для выбора</div>
                        </>
                      )}
                    </div>
                    <Form.Control
                      id="broadcast-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleBroadcastImageUpload}
                      className="d-none"
                    />
                    {broadcastForm.image_url && (
                      <Button variant="link" size="sm" className="text-danger p-0" onClick={() => { setBroadcastForm({ ...broadcastForm, image_url: '' }); setBroadcastImageFile(null); }}>
                        Удалить фото
                      </Button>
                    )}
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Текст сообщения *</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={6}
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                      placeholder="Напишите текст рассылки..."
                      className="border-0 bg-light p-3"
                      style={{ resize: 'none', fontSize: '0.9rem' }}
                    />
                  </Form.Group>

                  {/* Scheduling Section */}
                  <div className="border-top pt-3">
                    <Form.Check
                      type="switch"
                      id="schedule-switch"
                      label="🆕 Запланировать на дату/время"
                      checked={isScheduled}
                      onChange={(e) => setIsScheduled(e.target.checked)}
                      className="mb-3 fw-bold"
                    />

                    {isScheduled && (
                      <div className="bg-light p-3 rounded border mb-3">
                        <Row className="gy-3">
                          <Col md={12}>
                            <Form.Label className="small fw-bold">{t('recurrence') || 'Повтор'}</Form.Label>
                            <Form.Select
                              value={recurrence}
                              onChange={(e) => {
                                setRecurrence(e.target.value);
                                if (e.target.value === 'none') {
                                  setRepeatDays([]);
                                }
                              }}
                              className="form-select-sm"
                            >
                              <option value="none">{t('once') || 'Один раз'}</option>
                              <option value="daily">{t('everyDay') || 'Каждый день'}</option>
                              <option value="custom">{t('customDays') || 'По выбранным дням'}</option>
                            </Form.Select>
                          </Col>

                          {recurrence === 'none' && (
                            <Col md={6}>
                              <Form.Label className="small fw-bold">{t('date') || 'Дата'}</Form.Label>
                              <Form.Control
                                type="date"
                                size="sm"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                              />
                            </Col>
                          )}

                          <Col md={recurrence === 'none' ? 6 : 12}>
                            <Form.Label className="small fw-bold">{t('time') || 'Время отправки'}</Form.Label>
                            <Form.Control
                              type="time"
                              size="sm"
                              value={scheduledTime}
                              onChange={(e) => setScheduledTime(e.target.value)}
                            />
                          </Col>

                          {recurrence === 'custom' && (
                            <Col md={12}>
                              <Form.Label className="small fw-bold">{t('selectDays') || 'В какие дни:'}</Form.Label>
                              <div className="d-flex gap-1 flex-wrap">
                                {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, idx) => (
                                  <Button
                                    key={idx}
                                    size="sm"
                                    variant={repeatDays.includes(idx) ? 'primary' : 'outline-secondary'}
                                    onClick={() => {
                                      setRepeatDays(prev =>
                                        prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                                      );
                                    }}
                                    style={{ width: '40px', fontSize: '0.7rem' }}
                                  >
                                    {day}
                                  </Button>
                                ))}
                              </div>
                            </Col>
                          )}
                        </Row>
                      </div>
                    )}
                  </div>
                </Col>

                {/* Right Column: Telegram-style Preview */}
                <Col md={5} className="bg-light p-0 position-relative" style={{ minHeight: '400px', backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover' }}>
                  <div className="p-4 d-flex flex-column align-items-center h-100">
                    <div className="text-white bg-dark bg-opacity-25 rounded-pill px-3 py-1 small mb-4">
                      {isScheduled ? 'Превью (запланировано)' : 'Превью (мгновенно)'}
                    </div>

                    {/* Telegram Bubble */}
                    <div className="bg-white shadow-sm position-relative overflow-hidden" style={{ maxWidth: '90%', borderRadius: '12px 12px 12px 2px', paddingBottom: '4px' }}>
                      <div className="px-3 pt-2 pb-1 d-flex align-items-center gap-2 border-bottom mb-2 bg-light bg-opacity-50">
                        {user?.active_restaurant_logo ? (
                          <img
                            src={user.active_restaurant_logo?.startsWith('http') ? user.active_restaurant_logo : window.location.origin + (user.active_restaurant_logo?.startsWith('/') ? '' : '/') + user.active_restaurant_logo}
                            alt="logo"
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div className="bg-primary rounded-circle" style={{ width: 24, height: 24 }}></div>
                        )}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0088cc' }}>{user?.active_restaurant_name || 'Ресторан'}</span>
                      </div>
                      {broadcastForm.image_url && <div className="px-2 pb-2"><img src={broadcastForm.image_url} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px' }} /></div>}
                      <div className="px-3 pb-2 pt-1">
                        <div style={{ fontSize: '0.9rem', lineHeight: '1.4', whiteSpace: 'pre-wrap', color: '#222' }} dangerouslySetInnerHTML={{ __html: (broadcastForm.message || 'Текст сообщения...').replace(/<b>(.*?)<\/b>/g, '<strong>$1</strong>').replace(/<i>(.*?)<\/i>/g, '<em>$1</em>') }} />
                        <div className="text-end mt-1 me-1" style={{ fontSize: '0.65rem', color: '#999' }}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>
            ) : broadcastModalTab === 'scheduled' ? (
              <div className="p-4 bg-light" style={{ minHeight: '400px' }}>
                {loadingScheduled ? (
                  <div className="text-center py-5">Загрузка...</div>
                ) : scheduledBroadcasts.length === 0 ? (
                  <div className="text-center py-5 text-muted">Нет запланированных рассылок</div>
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table mb-0">
                      <thead>
                        <tr>
                          <th>ФОТО</th>
                          <th>ТЕКСТ</th>
                          <th>РАСПИСАНИЕ</th>
                          <th>СТАТУС</th>
                          <th className="text-end">ДЕЙСТВИЯ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledBroadcasts.map(sb => (
                          <tr key={sb.id}>
                            <td>
                              {sb.image_url ? (
                                <img src={sb.image_url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} alt="thumb" />
                              ) : '-'}
                            </td>
                            <td style={{ maxWidth: '200px' }} className="text-truncate small">{sb.message}</td>
                            <td className="small">
                              <div className="fw-bold">{new Date(sb.scheduled_at).toLocaleString('ru-RU')}</div>
                              <div className="text-muted">
                                {sb.recurrence === 'daily' ? 'Ежедневно' :
                                  sb.recurrence === 'custom' ? `Дни: ${(sb.repeat_days || []).map(d => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d]).join(',')}` : 'Один раз'}
                              </div>
                            </td>
                            <td>
                              <Form.Check
                                type="switch"
                                checked={sb.is_active}
                                onChange={() => toggleScheduledBroadcast(sb.id)}
                              />
                            </td>
                            <td className="text-end">
                              <div className="d-flex gap-2 justify-content-end">
                                <Button variant="light" className="action-btn text-primary" onClick={() => startEditBroadcast(sb)} title="Редактировать">✏️</Button>
                                <Button variant="light" className="action-btn text-danger" onClick={() => deleteScheduledBroadcast(sb.id)} title="Удалить">🗑</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-light" style={{ minHeight: '400px' }}>
                {loadingHistory ? (
                  <div className="text-center py-5">Загрузка...</div>
                ) : broadcastHistory.length === 0 ? (
                  <div className="text-center py-5 text-muted">История пуста</div>
                ) : (
                  <div className="admin-table-container">
                    <Table responsive hover className="admin-table mb-0">
                      <thead>
                        <tr>
                          <th>ДАТА ОТПРАВКИ</th>
                          <th>ФОТО</th>
                          <th>СООБЩЕНИЕ</th>
                          <th>ПОЛУЧАТЕЛЕЙ</th>
                          <th className="text-end">ДЕЙСТВИЯ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadcastHistory.map(bh => (
                          <tr key={bh.id}>
                            <td className="small font-monospace">{new Date(bh.sent_at).toLocaleString('ru-RU')}</td>
                            <td>
                              {bh.image_url ? (
                                <img src={bh.image_url} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} alt="thumb" />
                              ) : '-'}
                            </td>
                            <td style={{ maxWidth: '300px' }} className="text-truncate small">{bh.message}</td>
                            <td><Badge className="badge-custom bg-info bg-opacity-10 text-info">{bh.messages_count}</Badge></td>
                            <td className="text-end">
                              <Button
                                variant="light"
                                className="action-btn text-danger w-auto px-2 fw-bold"
                                style={{ height: '32px' }}
                                onClick={() => deleteRemoteBroadcast(bh.id)}
                                title="Удалить у всех получателей"
                              >
                                🔥 Удалить везде
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer className="border-0 bg-white">
            <Button variant="link" onClick={() => setShowBroadcastModal(false)} className="text-decoration-none text-muted">
              {t('close') || 'Закрыть'}
            </Button>
            {broadcastModalTab === 'send' && (
              <Button
                variant="primary"
                onClick={sendBroadcast}
                className="px-5 py-2 rounded-pill fw-bold"
                style={{ background: isScheduled ? '#28a745' : '#0088cc', border: 'none' }}
                disabled={broadcastLoading || !broadcastForm.message.trim()}
              >
                {broadcastLoading ? '...' : isScheduled ? '📅 Запланировать' : '🚀 Отправить всем'}
              </Button>
            )}
          </Modal.Footer>
        </Modal>

        {/* Excel Import Modal */}
        <Modal show={showExcelModal} onHide={() => setShowExcelModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Импорт товаров из Excel</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info">
              <strong>Формат файла:</strong><br />
              Первая строка — заголовки столбцов. Обязательные столбцы:<br />
              • <code>Название (RU)</code> или <code>Название</code> — название товара<br />
              • <code>Цена</code> — цена товара<br />
              Дополнительные столбцы:<br />
              • <code>Категория</code> — название категории<br />
              • <code>Название (UZ)</code> — название на узбекском<br />
              • <code>Единица</code> — единица измерения (шт, кг, порция и т.д.)
            </Alert>

            <Form.Group className="mb-3">
              <Form.Label>Выберите файл Excel (.xlsx, .xls, .csv)</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFile}
              />
            </Form.Group>

            {excelPreview.length > 0 && (
              <div className="mt-3">
                <strong>Предпросмотр (первые 10 строк):</strong>
                <div className="table-responsive mt-2" style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <table className="table table-sm table-bordered">
                    <thead className="table-light">
                      <tr>
                        {excelPreview[0]?.map((cell, idx) => (
                          <th key={idx} style={{ fontSize: '0.8rem' }}>{cell || `Столбец ${idx + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.slice(1).map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          {row.map((cell, idx) => (
                            <td key={idx} style={{ fontSize: '0.8rem' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => {
              setShowExcelModal(false);
              setExcelFile(null);
              setExcelPreview([]);
            }}>
              Отмена
            </Button>
            <Button
              variant="success"
              onClick={importExcel}
              disabled={importingExcel || !excelFile}
            >
              {importingExcel ? 'Импорт...' : 'Импортировать'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Image Preview Modal */}
        <Modal show={showImagePreview} onHide={() => setShowImagePreview(false)} centered size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Просмотр изображения</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center p-0">
            <img
              src={previewImageUrl}
              alt="Preview"
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          </Modal.Body>
        </Modal>

        {/* Cancel Order Modal */}
        <Modal show={showCancelModal} onHide={() => setShowCancelModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>❌ Отмена заказа</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted mb-3">
              Вы уверены, что хотите отменить этот заказ? Укажите причину отмены:
            </p>
            <Form.Group>
              <Form.Label>Причина отмены <span className="text-danger">*</span></Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Например: клиент отказался, нет товара в наличии, ошибка в заказе..."
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCancelModal(false)}>
              Назад
            </Button>
            <Button
              variant="danger"
              onClick={confirmCancelOrder}
              disabled={!cancelReason.trim()}
            >
              Отменить заказ
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Feedback Detail Modal */}
        <Modal show={showFeedbackModal} onHide={() => setShowFeedbackModal(false)} centered size="lg">
          <Modal.Header closeButton>
            <Modal.Title>
              Обращение #{selectedFeedback?.id}
              {selectedFeedback && (
                <Badge bg={
                  selectedFeedback.type === 'complaint' ? 'danger' :
                    selectedFeedback.type === 'suggestion' ? 'info' :
                      selectedFeedback.type === 'question' ? 'warning' : 'secondary'
                } className="ms-2">
                  {selectedFeedback.type === 'complaint' ? 'Жалоба' :
                    selectedFeedback.type === 'suggestion' ? 'Предложение' :
                      selectedFeedback.type === 'question' ? 'Вопрос' : 'Другое'}
                </Badge>
              )}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedFeedback && (
              <>
                <div className="mb-3 p-3 bg-light rounded">
                  <div className="row">
                    <div className="col-md-6">
                      <strong>Клиент:</strong> {selectedFeedback.customer_name}
                    </div>
                    <div className="col-md-6">
                      <strong>Телефон:</strong>{' '}
                      <a href={`tel:${selectedFeedback.customer_phone}`}>
                        {selectedFeedback.customer_phone}
                      </a>
                    </div>
                  </div>
                  <div className="row mt-2">
                    <div className="col-md-6">
                      <strong>Дата:</strong> {new Date(selectedFeedback.created_at).toLocaleString()}
                    </div>
                    <div className="col-md-6">
                      <strong>Статус:</strong>{' '}
                      <Badge bg={
                        selectedFeedback.status === 'new' ? 'primary' :
                          selectedFeedback.status === 'in_progress' ? 'warning' :
                            selectedFeedback.status === 'resolved' ? 'success' : 'secondary'
                      }>
                        {selectedFeedback.status === 'new' ? 'Новый' :
                          selectedFeedback.status === 'in_progress' ? 'В работе' :
                            selectedFeedback.status === 'resolved' ? 'Решено' : 'Закрыто'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Сообщение клиента:</label>
                  <div className="p-3 border rounded bg-white" style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedFeedback.message}
                  </div>
                </div>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Ваш ответ:</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={feedbackResponse}
                    onChange={(e) => setFeedbackResponse(e.target.value)}
                    placeholder="Введите ответ на обращение..."
                  />
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowFeedbackModal(false)}>
              Закрыть
            </Button>
            {selectedFeedback?.status === 'new' && (
              <Button variant="warning" onClick={() => handleFeedbackResponse('in_progress')}>
                Взять в работу
              </Button>
            )}
            {(selectedFeedback?.status === 'new' || selectedFeedback?.status === 'in_progress') && (
              <Button variant="success" onClick={() => handleFeedbackResponse('resolved')}>
                Решено
              </Button>
            )}
            {selectedFeedback?.status !== 'closed' && (
              <Button variant="dark" onClick={() => handleFeedbackResponse('closed')}>
                Закрыть
              </Button>
            )}
          </Modal.Footer>
        </Modal>

        {/* Container Modal */}
        <Modal show={showContainerModal} onHide={() => setShowContainerModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>{selectedContainer ? t('editContainer') : t('addContainer')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>{t('containerName')}</Form.Label>
              <Form.Control
                type="text"
                placeholder={t('containerNamePlaceholder')}
                value={containerForm.name}
                onChange={(e) => setContainerForm({ ...containerForm, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('containerPrice')}</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="100"
                value={containerForm.price}
                onChange={(e) => setContainerForm({ ...containerForm, price: parseFloat(e.target.value) || 0 })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('sortOrderLabel')}</Form.Label>
              <Form.Control
                type="number"
                value={containerForm.sort_order}
                onChange={(e) => setContainerForm({ ...containerForm, sort_order: parseInt(e.target.value) || 0 })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowContainerModal(false)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={saveContainer} disabled={!containerForm.name}>
              {selectedContainer ? t('save') : t('add')}
            </Button>
          </Modal.Footer>
        </Modal>
        {/* Operator Modal */}
        <Modal show={showOperatorModal} onHide={() => setShowOperatorModal(false)} centered>
          <Form onSubmit={saveOperator}>
            <Modal.Header closeButton>
              <Modal.Title>{editingOperator ? 'Редактировать оператора' : 'Добавить оператора (заменшика)'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {!editingOperator && (
                <Alert variant="info" className="small border-0 shadow-sm rounded-3">
                  Вы можете добавить существующего пользователя по <b>username</b> или создать нового с ролью "Оператор".
                </Alert>
              )}
              <Form.Group className="mb-3">
                <Form.Label>Username *</Form.Label>
                <Form.Control
                  required
                  type="text"
                  placeholder="name2024"
                  value={operatorForm.username}
                  onChange={e => setOperatorForm({ ...operatorForm, username: e.target.value })}
                  disabled={!!editingOperator}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Пароль {!editingOperator && '(для нового пользователя)'}</Form.Label>
                <Form.Control
                  type="password"
                  placeholder={editingOperator ? "Оставьте пустым, чтобы не менять" : "********"}
                  value={operatorForm.password}
                  onChange={e => setOperatorForm({ ...operatorForm, password: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Полное имя</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Иван Иванов"
                  value={operatorForm.full_name}
                  onChange={e => setOperatorForm({ ...operatorForm, full_name: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Телефон</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="+99890XXXXXXX"
                  value={operatorForm.phone}
                  onChange={e => setOperatorForm({ ...operatorForm, phone: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Telegram ID</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="123456789"
                  value={operatorForm.telegram_id}
                  onChange={e => setOperatorForm({ ...operatorForm, telegram_id: e.target.value })}
                />
                <Form.Text className="text-muted">
                  Узнать свой ID можно у бота командой /id. Нужно для получения тестовых уведомлений в личку.
                </Form.Text>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowOperatorModal(false)}>Отмена</Button>
              <Button variant="primary" type="submit">{editingOperator ? 'Сохранить' : 'Добавить'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>
        <Modal show={showDeliveryZoneModal} onHide={() => setShowDeliveryZoneModal(false)} size="lg" centered className="rounded-4 overflow-hidden border-0">
          <Modal.Header closeButton className="border-0 pb-0">
            <Modal.Title className="h5 fw-bold">🗺️ Зона доставки</Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-4 pt-2">
            <div className="mb-3">
              <label className="small fw-bold text-muted text-uppercase mb-2 d-block">Рисование области доставки</label>
              <DeliveryZonePicker
                deliveryZone={restaurantSettings?.delivery_zone}
                onZoneChange={(zone) => setRestaurantSettings({ ...restaurantSettings, delivery_zone: zone })}
                center={[restaurantSettings?.latitude || 41.311081, restaurantSettings?.longitude || 69.240562]}
              />
            </div>

            <Alert variant="info" className="border-0 shadow-sm rounded-4 mb-0" style={{ background: 'rgba(59, 130, 246, 0.05)', color: '#1e40af' }}>
              <div className="fw-bold mb-1">Инструкция:</div>
              <ol className="small mb-0 ps-3">
                <li>Нажмите на иконку многоугольника (⬠) справа на карте</li>
                <li>Кликайте по карте, чтобы отметить точки границы зоны доставки</li>
                <li>Завершите многоугольник, кликнув на первую точку</li>
                <li>Нажмите кнопку "Готово", чтобы сохранить изменения</li>
              </ol>
            </Alert>
          </Modal.Body>
          <Modal.Footer className="border-0">
            <Button variant="primary" className="px-5 rounded-pill fw-bold" onClick={() => setShowDeliveryZoneModal(false)}>
              Готово
            </Button>
          </Modal.Footer>
        </Modal>

      </Container>
    </>
  );
}

export default AdminDashboard;

