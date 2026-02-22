import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminStyles.css';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Container, Row, Col, Card, Table, Button, Form, Modal,
  Tabs, Tab, Badge, Navbar, Nav, Alert, Pagination, Spinner,
  Toast, ToastContainer, Dropdown
} from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

// Lazy load map components (heavy)
const DeliveryZoneMap = lazy(() => import('../components/DeliveryZoneMap'));
const YandexLocationPicker = lazy(() => import('../components/YandexLocationPicker'));

const API_URL = import.meta.env.VITE_API_URL || '/api';
const CATEGORY_LEVEL_COUNT = 3;

const DataPagination = ({ current, total, limit, onPageChange, limitOptions, onLimitChange }) => {
  const { t } = useLanguage();
  const totalPages = Math.ceil(total / limit);
  if (total === 0) return null;

  let items = [];
  const maxPages = 5;
  let startPage = Math.max(1, current - Math.floor(maxPages / 2));
  let endPage = Math.min(totalPages, startPage + maxPages - 1);
  if (endPage - startPage + 1 < maxPages) {
    startPage = Math.max(1, endPage - maxPages + 1);
  }

  if (startPage > 1) {
    items.push(<Pagination.Item key={1} onClick={() => onPageChange(1)}>1</Pagination.Item>);
    if (startPage > 2) items.push(<Pagination.Ellipsis key="ell-1" disabled />);
  }

  for (let number = startPage; number <= endPage; number++) {
    items.push(
      <Pagination.Item
        key={number}
        active={number === current}
        onClick={() => onPageChange(number)}
      >
        {number}
      </Pagination.Item>
    );
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) items.push(<Pagination.Ellipsis key="ell-2" disabled />);
    items.push(<Pagination.Item key={totalPages} onClick={() => onPageChange(totalPages)}>{totalPages}</Pagination.Item>);
  }

  const shownCount = total === 0 ? 0 : Math.min(limit, total - (current - 1) * limit);

  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mt-4 px-2 gap-3" style={{ width: '100%' }}>
      <div className="d-flex align-items-center gap-3">
        {onLimitChange && (
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted font-weight-bold text-primary">{t('saShow')}</span>
            <Form.Select
              size="sm"
              style={{ width: '75px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
              value={limit}
              onChange={(e) => onLimitChange(parseInt(e.target.value))}
            >
              {(limitOptions || [15, 20, 30, 50]).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Form.Select>
          </div>
        )}
        <div className="small text-muted text-nowrap">
          {t('saShown')} {shownCount} {t('saOf')} {total} {t('saRecords')}
        </div>
      </div>
      <Pagination size="sm" className="mb-0 flex-wrap justify-content-center">
        <Pagination.First disabled={current === 1} onClick={() => onPageChange(1)} />
        <Pagination.Prev disabled={current === 1} onClick={() => onPageChange(current - 1)} />
        {items}
        <Pagination.Next disabled={current === totalPages || totalPages === 0} onClick={() => onPageChange(current + 1)} />
        <Pagination.Last disabled={current === totalPages || totalPages === 0} onClick={() => onPageChange(totalPages)} />
      </Pagination>
    </div>
  );
};

const SearchableRestaurantFilter = ({
  t,
  value,
  onChange,
  restaurants,
  searchValue,
  onSearchChange,
  width = '220px'
}) => {
  const [show, setShow] = useState(false);
  const selectedRestaurant = restaurants.find((restaurant) => String(restaurant.id) === String(value));

  return (
    <Dropdown
      show={show}
      onToggle={(nextShow) => {
        setShow(nextShow);
        if (nextShow) onSearchChange('');
      }}
      autoClose="outside"
      popperConfig={{ strategy: 'fixed' }}
      style={{ width, position: 'relative', zIndex: show ? 1200 : 1 }}
    >
      <Dropdown.Toggle
        variant="light"
        className="form-control-custom w-100 d-flex align-items-center justify-content-between text-start"
        style={{ minHeight: '40px' }}
      >
        <span className="text-truncate">{selectedRestaurant?.name || t('saAllShops')}</span>
      </Dropdown.Toggle>

      <Dropdown.Menu style={{ width, maxHeight: '320px', overflowY: 'auto', zIndex: 1210 }}>
        <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Form.Control
            className="form-control-custom"
            type="search"
            placeholder={t('saSearchShop')}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
        </div>
        <Dropdown.Divider className="my-1" />
        <Dropdown.Item
          active={!value}
          onClick={() => {
            onChange('');
            setShow(false);
          }}
        >
          {t('saAllShops')}
        </Dropdown.Item>
        {restaurants.length === 0 ? (
          <Dropdown.Item disabled>{t('noData')}</Dropdown.Item>
        ) : (
          restaurants.map((restaurant) => (
            <Dropdown.Item
              key={restaurant.id}
              active={String(value) === String(restaurant.id)}
              onClick={() => {
                onChange(String(restaurant.id));
                setShow(false);
              }}
            >
              {restaurant.name}
            </Dropdown.Item>
          ))
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};

function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState('restaurants');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Data
  const [stats, setStats] = useState({});
  const [restaurants, setRestaurants] = useState({ restaurants: [], total: 0 });
  const [allRestaurants, setAllRestaurants] = useState([]); // For filters
  const [operators, setOperators] = useState({ operators: [], total: 0 });
  const [allOperators, setAllOperators] = useState([]); // For filters
  const [customers, setCustomers] = useState({ customers: [], total: 0 });
  const [logs, setLogs] = useState({ logs: [], total: 0 });

  // Categories
  const [categories, setCategories] = useState([]);
  const [categoryLevels, setCategoryLevels] = useState(() => Array(CATEGORY_LEVEL_COUNT).fill(null));
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: null, name_ru: '', name_uz: '', image_url: '', sort_order: 0, parent_id: null });
  const [editingLevel, setEditingLevel] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isImportingCategories, setIsImportingCategories] = useState(false);
  const categoryImportInputRef = useRef(null);

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
    operator_registration_code: '',
    start_time: '',
    end_time: '',
    click_url: '',
    payme_url: '',
    support_username: '',
    service_fee: 1000,
    latitude: '',
    longitude: '',
    delivery_base_radius: 3,
    delivery_base_price: 5000,
    delivery_price_per_km: 1000,
    is_delivery_enabled: true
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [operatorForm, setOperatorForm] = useState({
    username: '', password: '', full_name: '', phone: '', restaurant_ids: []
  });

  // Filters
  const [restaurantsPage, setRestaurantsPage] = useState(1);
  const [restaurantsLimit, setRestaurantsLimit] = useState(15);
  const [restaurantsNameFilter, setRestaurantsNameFilter] = useState('');
  const [restaurantsStatusFilter, setRestaurantsStatusFilter] = useState('');
  const [restaurantsSelectFilter, setRestaurantsSelectFilter] = useState('');
  const [restaurantsSelectSearch, setRestaurantsSelectSearch] = useState('');
  const [operatorsPage, setOperatorsPage] = useState(1);
  const [operatorsLimit, setOperatorsLimit] = useState(15);
  const [operatorSearch, setOperatorSearch] = useState('');
  const [operatorRoleFilter, setOperatorRoleFilter] = useState('');
  const [operatorStatusFilter, setOperatorStatusFilter] = useState('');
  const [operatorRestaurantFilter, setOperatorRestaurantFilter] = useState('');
  const [operatorRestaurantSearch, setOperatorRestaurantSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerLimit, setCustomerLimit] = useState(15);
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [customerRestaurantFilter, setCustomerRestaurantFilter] = useState('');
  const [customerRestaurantSearch, setCustomerRestaurantSearch] = useState('');
  const [logsFilter, setLogsFilter] = useState({
    action_type: '', entity_type: '', restaurant_id: '', user_id: '', start_date: '', end_date: '', page: 1, limit: 15
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

  // Message templates modal
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [messagesRestaurant, setMessagesRestaurant] = useState(null);
  const [messagesForm, setMessagesForm] = useState({
    msg_new: '',
    msg_preparing: '',
    msg_delivering: '',
    msg_delivered: '',
    msg_cancelled: ''
  });
  const [savingMessages, setSavingMessages] = useState(false);

  // Billing settings
  const [billingSettings, setBillingSettings] = useState({
    superadmin_bot_token: '',
    card_number: '',
    card_holder: '',
    phone_number: '',
    telegram_username: '',
    click_link: '',
    payme_link: '',
    default_starting_balance: 100000,
    default_order_cost: 1000
  });
  const [isCentralTokenVisible, setIsCentralTokenVisible] = useState(false);
  const centralTokenHideTimeoutRef = useRef(null);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupRestaurant, setTopupRestaurant] = useState(null);
  const [topupForm, setTopupForm] = useState({ amount: '', description: '' });

  // Load data on tab change
  // Auto-hide notifications
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  useEffect(() => {
    loadStats();
    loadInternalRestaurants();
  }, []);

  useEffect(() => {
    if (activeTab === 'restaurants') loadRestaurants();
    if (activeTab === 'operators') loadOperators();
    if (activeTab === 'customers') loadCustomers();
    if (activeTab === 'logs') loadLogs();
    if (activeTab === 'categories') loadCategories();
    if (activeTab === 'billing') loadBillingSettings();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'restaurants') loadRestaurants();
  }, [restaurantsPage, restaurantsLimit]);

  useEffect(() => {
    return () => {
      if (centralTokenHideTimeoutRef.current) {
        clearTimeout(centralTokenHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'operators') loadOperators();
  }, [operatorsPage, operatorsLimit, operatorSearch, operatorRoleFilter, operatorStatusFilter, operatorRestaurantFilter]);

  useEffect(() => {
    if (activeTab === 'customers') loadCustomers();
  }, [customerPage, customerLimit, customerSearch, customerStatusFilter, customerRestaurantFilter]);

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
      const response = await axios.get(`${API_URL}/superadmin/restaurants`, {
        params: { page: restaurantsPage, limit: restaurantsLimit }
      });
      const data = Array.isArray(response.data)
        ? { restaurants: response.data, total: response.data.length }
        : response.data;
      setRestaurants(data);
    } catch (err) {
      setError('Ошибка загрузки ресторанов');
    } finally {
      setLoading(false);
    }
  };

  const loadInternalRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants`, {
        params: { limit: 1000 } // Load all for filters
      });
      // Handle both formats: [r1, r2] or { restaurants: [r1, r2] }
      const restaurantData = Array.isArray(response.data) ? response.data : (response.data?.restaurants || []);
      setAllRestaurants(restaurantData);

      const opResponse = await axios.get(`${API_URL}/superadmin/operators`, {
        params: { limit: 1000 }
      });
      const operatorData = Array.isArray(opResponse.data) ? opResponse.data : (opResponse.data?.operators || []);
      setAllOperators(operatorData);
    } catch (err) {
      console.error('Load filter data error:', err);
    }
  };

  const loadOperators = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/operators`, {
        params: {
          page: operatorsPage,
          limit: operatorsLimit,
          search: operatorSearch.trim(),
          role: operatorRoleFilter,
          status: operatorStatusFilter,
          restaurant_id: operatorRestaurantFilter
        }
      });
      const data = Array.isArray(response.data)
        ? { operators: response.data, total: response.data.length }
        : response.data;
      setOperators(data);
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
        params: { page: customerPage, search: customerSearch.trim(), status: customerStatusFilter, restaurant_id: customerRestaurantFilter, limit: customerLimit }
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
    // Now customer object contains restaurant_id and is_blocked for specific shop
    const currentIsBlocked = customer.is_blocked || !customer.user_is_active;
    const action = currentIsBlocked ? 'разблокировать' : 'заблокировать';
    const scopeName = `в магазине/ресторане "${customer.restaurant_name}"`;

    if (!window.confirm(`Вы уверены, что хотите ${action} клиента ${customer.full_name || customer.username} ${scopeName}?`)) {
      return;
    }

    try {
      const response = await axios.put(`${API_URL}/superadmin/customers/${customer.user_id}/toggle-block`, {
        restaurant_id: customer.restaurant_id
      });
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
        params: logsFilter
      });
      setLogs(response.data);
    } catch (err) {
      setError('Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/superadmin/categories`);
      setCategories(response.data);
    } catch (err) {
      setError('Ошибка загрузки категорий');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (levelIndex, category) => {
    const newLevels = [...categoryLevels];
    newLevels[levelIndex] = category;
    for (let i = levelIndex + 1; i < CATEGORY_LEVEL_COUNT; i++) {
      newLevels[i] = null;
    }
    setCategoryLevels(newLevels);
  };

  const getCategoryProductsCount = (category) => Number(category?.products_count || 0);
  const getCategorySubcategoriesCount = (category) => Number(category?.subcategories_count || 0);
  const canDeleteCategory = (category) => (
    getCategoryProductsCount(category) === 0 &&
    getCategorySubcategoriesCount(category) === 0
  );

  const normalizeCategoryName = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const getCategoryKey = (parentId, name) => `${parentId ?? 'root'}::${normalizeCategoryName(name).toLowerCase()}`;
  const getSiblingNameConflict = ({ parentId, nameRu, nameUz, excludeId = null }) => {
    const targetRu = normalizeCategoryName(nameRu).toLowerCase();
    const targetUz = normalizeCategoryName(nameUz).toLowerCase();

    return (categories || []).find((category) => {
      if ((category.parent_id ?? null) !== (parentId ?? null)) return false;
      if (excludeId && category.id === excludeId) return false;

      const categoryRu = normalizeCategoryName(category.name_ru).toLowerCase();
      const categoryUz = normalizeCategoryName(category.name_uz).toLowerCase();

      if (targetRu && categoryRu === targetRu) return true;
      if (targetUz && categoryUz && categoryUz === targetUz) return true;
      return false;
    });
  };

  const getNextAvailableSortOrder = (parentId) => {
    const existingOrders = (categories || [])
      .filter((c) => c.parent_id === parentId && c.sort_order != null)
      .map((c) => c?.sort_order)
      .sort((a, b) => a - b);

    let nextAvailable = 1;
    for (const order of existingOrders) {
      if (order === nextAvailable) {
        nextAvailable++;
      } else if (order > nextAvailable) {
        break;
      }
    }
    return nextAvailable;
  };

  // Billing functions
  const loadBillingSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/superadmin/billing/settings`);
      if (response.data) setBillingSettings(response.data);
    } catch (err) {
      console.error('Load billing settings error:', err);
    }
  };

  const saveBillingSettings = async () => {
    try {
      await axios.put(`${API_URL}/superadmin/billing/settings`, billingSettings);
      setSuccess('Настройки биллинга сохранены');
    } catch (err) {
      setError('Ошибка сохранения настроек');
    }
  };

  const handleCentralTokenPreview = () => {
    if (!billingSettings.superadmin_bot_token) return;

    if (centralTokenHideTimeoutRef.current) {
      clearTimeout(centralTokenHideTimeoutRef.current);
      centralTokenHideTimeoutRef.current = null;
    }

    if (isCentralTokenVisible) {
      setIsCentralTokenVisible(false);
      return;
    }

    setIsCentralTokenVisible(true);
    centralTokenHideTimeoutRef.current = setTimeout(() => {
      setIsCentralTokenVisible(false);
      centralTokenHideTimeoutRef.current = null;
    }, 2000);
  };

  const customerRestaurantOptions = useMemo(() => {
    const term = customerRestaurantSearch.trim().toLowerCase();
    const filtered = allRestaurants.filter((restaurant) => (
      !term || restaurant.name?.toLowerCase().includes(term)
    ));

    if (!customerRestaurantFilter) return filtered;

    const selected = allRestaurants.find((restaurant) => String(restaurant.id) === String(customerRestaurantFilter));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [allRestaurants, customerRestaurantSearch, customerRestaurantFilter]);

  const operatorRestaurantOptions = useMemo(() => {
    const term = operatorRestaurantSearch.trim().toLowerCase();
    const filtered = allRestaurants.filter((restaurant) => (
      !term || restaurant.name?.toLowerCase().includes(term)
    ));

    if (!operatorRestaurantFilter) return filtered;

    const selected = allRestaurants.find((restaurant) => String(restaurant.id) === String(operatorRestaurantFilter));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [allRestaurants, operatorRestaurantSearch, operatorRestaurantFilter]);

  const restaurantsFilterOptions = useMemo(() => {
    const term = restaurantsSelectSearch.trim().toLowerCase();
    const source = restaurants?.restaurants || [];
    const filtered = source.filter((restaurant) => (
      !term || restaurant.name?.toLowerCase().includes(term)
    ));

    if (!restaurantsSelectFilter) return filtered;

    const selected = source.find((restaurant) => String(restaurant.id) === String(restaurantsSelectFilter));
    if (!selected || filtered.some((restaurant) => restaurant.id === selected.id)) return filtered;

    return [selected, ...filtered];
  }, [restaurants, restaurantsSelectSearch, restaurantsSelectFilter]);

  const filteredRestaurants = useMemo(() => {
    const source = restaurants?.restaurants || [];
    return source.filter((restaurant) => {
      const nameMatch = !restaurantsNameFilter ||
        String(restaurant.name || '').toLowerCase().includes(restaurantsNameFilter.trim().toLowerCase());
      const selectedMatch = !restaurantsSelectFilter || String(restaurant.id) === String(restaurantsSelectFilter);
      const statusMatch = !restaurantsStatusFilter ||
        (restaurantsStatusFilter === 'active' ? !!restaurant.is_active : !restaurant.is_active);
      return nameMatch && selectedMatch && statusMatch;
    });
  }, [restaurants, restaurantsNameFilter, restaurantsSelectFilter, restaurantsStatusFilter]);

  const paginatedRestaurants = useMemo(() => {
    const start = (restaurantsPage - 1) * restaurantsLimit;
    return filteredRestaurants.slice(start, start + restaurantsLimit);
  }, [filteredRestaurants, restaurantsPage, restaurantsLimit]);

  const formatThousands = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
  };

  const handleTopupAmountChange = (event) => {
    const digitsOnly = String(event.target.value || '').replace(/\D/g, '');
    setTopupForm((prev) => ({ ...prev, amount: digitsOnly }));
  };

  const handleTopup = async () => {
    const amountValue = Number(String(topupForm.amount || '').replace(/\D/g, ''));
    if (!amountValue || Number.isNaN(amountValue) || amountValue <= 0) {
      setError('Некорректная сумма');
      return;
    }
    try {
      await axios.post(`${API_URL}/superadmin/restaurants/${topupRestaurant.id}/topup`, {
        ...topupForm,
        amount: amountValue
      });
      setSuccess(`Баланс ресторана "${topupRestaurant.name}" пополнен`);
      setShowTopupModal(false);
      setTopupForm({ amount: '', description: '' });
      loadRestaurants();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка пополнения баланса');
    }
  };

  const toggleFreeTier = async (restaurantId, isFree) => {
    try {
      await axios.patch(`${API_URL}/superadmin/restaurants/${restaurantId}/free-tier`, { is_free_tier: isFree });
      setSuccess('Статус бесплатного тарифа изменен');
      loadRestaurants();
    } catch (err) {
      setError('Ошибка изменения статуса тарифа');
    }
  };

  // Container functions
  const openCategoryModal = (levelIndex, parentCategory = null, categoryToEdit = null) => {
    setEditingLevel(levelIndex);
    const pId = parentCategory ? parentCategory.id : null;

    if (categoryToEdit) {
      setCategoryForm({
        id: categoryToEdit.id,
        name_ru: categoryToEdit.name_ru || '',
        name_uz: categoryToEdit.name_uz || '',
        image_url: categoryToEdit.image_url || '',
        sort_order: categoryToEdit.sort_order !== null && categoryToEdit.sort_order !== undefined ? categoryToEdit.sort_order : getNextAvailableSortOrder(pId),
        parent_id: categoryToEdit.parent_id
      });
    } else {
      setCategoryForm({
        id: null,
        name_ru: '',
        name_uz: '',
        image_url: '',
        sort_order: getNextAvailableSortOrder(pId),
        parent_id: pId
      });
    }
    setShowCategoryModal(true);
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    if (!normalizeCategoryName(categoryForm.name_ru)) {
      setError('Название категории обязательно');
      return;
    }

    const duplicateName = getSiblingNameConflict({
      parentId: categoryForm.parent_id ?? null,
      nameRu: categoryForm.name_ru,
      nameUz: categoryForm.name_uz,
      excludeId: categoryForm.id || null
    });
    if (duplicateName) {
      setError('На этом уровне уже есть категория с таким названием RU или UZ');
      return;
    }

    // Check for duplicate sort_order at the same level
    const isDuplicateSortOrder = categories.some(
      (c) =>
        c.parent_id === categoryForm.parent_id &&
        c.sort_order === categoryForm.sort_order &&
        c.id !== categoryForm.id
    );

    if (isDuplicateSortOrder) {
      setError('Порядок сортировки с таким номером уже существует на этом уровне. Пожалуйста, выберите другой номер.');
      return;
    }

    try {
      if (categoryForm.id) {
        await axios.put(`${API_URL}/superadmin/categories/${categoryForm.id}`, categoryForm);
        setSuccess('Категория обновлена');
      } else {
        await axios.post(`${API_URL}/superadmin/categories`, categoryForm);
        setSuccess('Категория добавлена');
      }
      setShowCategoryModal(false);
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения категории');
    }
  };

  const deleteCategory = async (categoryId) => {
    const categoryToDelete = categories.find((c) => c.id === categoryId);
    if (categoryToDelete && !canDeleteCategory(categoryToDelete)) {
      setError('Категорию нельзя удалить: в ней есть товары или подкатегории');
      return;
    }

    if (!window.confirm('Вы уверены, что хотите удалить эту категорию?')) return;
    try {
      await axios.delete(`${API_URL}/superadmin/categories/${categoryId}`);
      setSuccess('Категория удалена');
      loadCategories();
      setCategoryLevels((prev) => {
        const idx = prev.findIndex((cat) => cat?.id === categoryId);
        if (idx === -1) return prev;
        const next = [...prev];
        for (let i = idx; i < CATEGORY_LEVEL_COUNT; i++) {
          next[i] = null;
        }
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления категории');
    }
  };

  const handleExportCategories = () => {
    if (!categories?.length) {
      setError('Нет категорий для экспорта');
      return;
    }

    const sortCategories = (list) => [...list].sort((a, b) => {
      const aSort = a.sort_order ?? 9999;
      const bSort = b.sort_order ?? 9999;
      if (aSort !== bSort) return aSort - bSort;
      return String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru');
    });

    const childrenMap = new Map();
    categories.forEach((cat) => {
      const parentKey = cat.parent_id ?? 'root';
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey).push(cat);
    });
    for (const [key, value] of childrenMap.entries()) {
      childrenMap.set(key, sortCategories(value));
    }

    const rows = [];
    const walk = (node, path = []) => {
      const currentPath = [...path, {
        ru: node.name_ru || '',
        uz: node.name_uz || ''
      }];
      const children = childrenMap.get(node.id) || [];

      if (currentPath.length >= CATEGORY_LEVEL_COUNT || children.length === 0) {
        rows.push({
          'Уровень 1 (RU)': currentPath[0]?.ru || '',
          'Уровень 1 (UZ)': currentPath[0]?.uz || '',
          'Уровень 2 (RU)': currentPath[1]?.ru || '',
          'Уровень 2 (UZ)': currentPath[1]?.uz || '',
          'Уровень 3 (RU)': currentPath[2]?.ru || '',
          'Уровень 3 (UZ)': currentPath[2]?.uz || '',
          'Путь (RU)': currentPath.map((p) => p.ru).filter(Boolean).join(' > '),
          'Путь (UZ)': currentPath.map((p) => p.uz).filter(Boolean).join(' > ')
        });
        return;
      }

      children.forEach((child) => walk(child, currentPath));
    };

    (childrenMap.get('root') || []).forEach((root) => walk(root, []));

    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        'Уровень 1 (RU)', 'Уровень 1 (UZ)',
        'Уровень 2 (RU)', 'Уровень 2 (UZ)',
        'Уровень 3 (RU)', 'Уровень 3 (UZ)',
        'Путь (RU)', 'Путь (UZ)'
      ]
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Категории');

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `categories_export_${stamp}.xlsx`);
    setSuccess(`Экспортировано категорий: ${rows.length}`);
  };

  const parseCategoryImportLevels = (row, index) => {
    const cleaned = (row || []).map((cell) => normalizeCategoryName(cell));
    if (!cleaned.some(Boolean)) return null;

    const firstCell = cleaned[0] || '';
    const secondCell = cleaned[1] || '';
    const thirdCell = cleaned[2] || '';
    const fourthCell = cleaned[3] || '';
    const fifthCell = cleaned[4] || '';
    const sixthCell = cleaned[5] || '';
    const seventhCell = cleaned[6] || '';
    const eighthCell = cleaned[7] || '';

    const isHeaderRow = index === 0 && cleaned
      .join(' ')
      .toLowerCase()
      .match(/уров|катег|path|путь|ru|uz|level/);
    if (isHeaderRow) return null;

    let levels = [];
    const hasRuUzColumns = [fifthCell, sixthCell, seventhCell, eighthCell].some(Boolean) ||
      (cleaned.length >= 6 && [secondCell, fourthCell, sixthCell].some(Boolean));

    if (hasRuUzColumns) {
      const levelCandidates = [
        { ru: firstCell, uz: secondCell },
        { ru: thirdCell, uz: fourthCell },
        { ru: fifthCell, uz: sixthCell }
      ];
      levels = levelCandidates.filter((l) => l.ru || l.uz);

      const pathRu = seventhCell;
      const pathUz = eighthCell;
      if (!levels.length && pathRu.includes('>')) {
        const ruParts = pathRu.split('>').map((part) => normalizeCategoryName(part)).filter(Boolean);
        const uzParts = pathUz.includes('>')
          ? pathUz.split('>').map((part) => normalizeCategoryName(part)).filter(Boolean)
          : [];
        levels = ruParts.map((ru, i) => ({ ru, uz: uzParts[i] || '' }));
      }
    } else {
      const inlinePath = [firstCell, secondCell, thirdCell].filter(Boolean).length <= 1 && firstCell.includes('>');
      const pathColumn = fourthCell && fourthCell.includes('>');

      if (inlinePath) {
        levels = firstCell
          .split('>')
          .map((part) => normalizeCategoryName(part))
          .filter(Boolean)
          .map((ru) => ({ ru, uz: '' }));
      } else if (pathColumn) {
        levels = fourthCell
          .split('>')
          .map((part) => normalizeCategoryName(part))
          .filter(Boolean)
          .map((ru) => ({ ru, uz: '' }));
      } else {
        levels = [firstCell, secondCell, thirdCell]
          .filter(Boolean)
          .map((ru) => ({ ru, uz: '' }));
      }
    }

    if (!levels.length) return null;
    if (levels.length > CATEGORY_LEVEL_COUNT) {
      return { error: `Строка ${index + 1}: больше ${CATEGORY_LEVEL_COUNT} уровней` };
    }

    for (let i = 0; i < levels.length; i++) {
      if (!levels[i].ru) {
        return { error: `Строка ${index + 1}: отсутствует название RU на уровне ${i + 1}` };
      }
    }

    return { levels };
  };

  const handleImportCategoriesFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImportingCategories(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      if (!rows.length) {
        setError('Файл пустой');
        return;
      }

      const parsedRows = [];
      const parseErrors = [];
      rows.forEach((row, idx) => {
        const parsed = parseCategoryImportLevels(row, idx);
        if (!parsed) return;
        if (parsed.error) {
          parseErrors.push(parsed.error);
          return;
        }
        parsedRows.push(parsed.levels);
      });

      if (!parsedRows.length) {
        setError(parseErrors[0] || 'Не найдено строк для импорта');
        return;
      }

      const categoryMap = new Map();
      const categoryUzMap = new Map();
      const siblingMaxSort = new Map();
      categories.forEach((cat) => {
        const ruName = normalizeCategoryName(cat.name_ru);
        const uzName = normalizeCategoryName(cat.name_uz);
        const parentId = cat.parent_id ?? null;

        if (ruName) {
          const ruKey = getCategoryKey(parentId, ruName);
          categoryMap.set(ruKey, cat);
        }
        if (uzName) {
          const uzKey = getCategoryKey(parentId, uzName);
          categoryUzMap.set(uzKey, cat);
        }

        const parentKey = parentId;
        const sortVal = Number.isFinite(Number(cat.sort_order)) ? Number(cat.sort_order) : 0;
        siblingMaxSort.set(parentKey, Math.max(siblingMaxSort.get(parentKey) || 0, sortVal));
      });

      const getNextSortOrder = (parentId) => {
        const next = (siblingMaxSort.get(parentId) || 0) + 1;
        siblingMaxSort.set(parentId, next);
        return next;
      };

      let createdCount = 0;
      let skippedDuplicates = 0;
      let updatedUzCount = 0;
      let skippedNameConflicts = 0;

      for (const levels of parsedRows) {
        let parentId = null;
        let skipRow = false;

        for (const levelItem of levels) {
          const levelNameRu = normalizeCategoryName(levelItem.ru);
          const levelNameUz = normalizeCategoryName(levelItem.uz);
          if (!levelNameRu) continue;

          const ruKey = getCategoryKey(parentId, levelNameRu);
          const uzKey = levelNameUz ? getCategoryKey(parentId, levelNameUz) : null;
          const existingByRu = categoryMap.get(ruKey);
          const existingByUz = uzKey ? categoryUzMap.get(uzKey) : null;

          if (existingByUz && (!existingByRu || existingByUz.id !== existingByRu.id)) {
            skippedNameConflicts += 1;
            skipRow = true;
            break;
          }

          if (existingByRu) {
            const existingUz = normalizeCategoryName(existingByRu.name_uz);
            if (levelNameUz && existingUz !== levelNameUz) {
              if (!existingUz) {
                const updatedResp = await axios.put(`${API_URL}/superadmin/categories/${existingByRu.id}`, {
                  ...existingByRu,
                  name_uz: levelNameUz
                });
                const updatedCategory = updatedResp.data;
                categoryMap.set(ruKey, updatedCategory);
                categoryUzMap.set(uzKey, updatedCategory);
                updatedUzCount += 1;
                parentId = updatedCategory.id;
                continue;
              }

              skippedNameConflicts += 1;
              skipRow = true;
              break;
            }

            parentId = existingByRu.id;
            skippedDuplicates += 1;
            continue;
          }

          const payload = {
            name_ru: levelNameRu,
            name_uz: levelNameUz || '',
            image_url: '',
            sort_order: getNextSortOrder(parentId),
            parent_id: parentId
          };

          const created = await axios.post(`${API_URL}/superadmin/categories`, payload);
          const createdCategory = created.data;
          categoryMap.set(ruKey, createdCategory);
          if (levelNameUz) {
            categoryUzMap.set(uzKey, createdCategory);
          }
          parentId = createdCategory.id;
          createdCount += 1;
        }

        if (skipRow) continue;
      }

      await loadCategories();
      setCategoryLevels(Array(CATEGORY_LEVEL_COUNT).fill(null));
      const issues = parseErrors.length ? ` Ошибок строк: ${parseErrors.length}.` : '';
      setSuccess(`Импорт завершен. Создано: ${createdCount}. Обновлено UZ: ${updatedUzCount}. Совпадений: ${skippedDuplicates}. Пропущено конфликтов RU/UZ: ${skippedNameConflicts}.${issues}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка импорта категорий');
    } finally {
      setIsImportingCategories(false);
    }
  };

  const handleImageUpload = async (file, setImageUrl) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой. Максимальный размер: 5MB');
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await axios.post(`${API_URL}/upload/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fullUrl = window.location.origin + response.data.url;
      setImageUrl(fullUrl);
    } catch (error) {
      alert('Ошибка загрузки изображения');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePaste = async (e, setImageUrl) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file, setImageUrl);
        break;
      }
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
        operator_registration_code: restaurant.operator_registration_code || '',
        start_time: restaurant.start_time || '',
        end_time: restaurant.end_time || '',
        click_url: restaurant.click_url || '',
        payme_url: restaurant.payme_url || '',
        support_username: restaurant.support_username || '',
        service_fee: restaurant.hasOwnProperty('service_fee') ? parseFloat(restaurant.service_fee) : 1000,
        latitude: restaurant.latitude || '',
        longitude: restaurant.longitude || '',
        delivery_base_radius: restaurant.hasOwnProperty('delivery_base_radius') ? parseFloat(restaurant.delivery_base_radius) : 3,
        delivery_base_price: restaurant.hasOwnProperty('delivery_base_price') ? parseFloat(restaurant.delivery_base_price) : 5000,
        delivery_price_per_km: restaurant.hasOwnProperty('delivery_price_per_km') ? parseFloat(restaurant.delivery_price_per_km) : 1000,
        is_delivery_enabled: restaurant.hasOwnProperty('is_delivery_enabled') ? restaurant.is_delivery_enabled : true
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
        operator_registration_code: '',
        start_time: '',
        end_time: '',
        click_url: '',
        payme_url: '',
        support_username: '',
        service_fee: 1000,
        latitude: '',
        longitude: '',
        delivery_base_radius: 3,
        delivery_base_price: 5000,
        delivery_price_per_km: 1000,
        is_delivery_enabled: true
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

  // Message templates handlers
  const openMessagesModal = async (restaurant) => {
    setMessagesRestaurant(restaurant);
    try {
      const response = await axios.get(`${API_URL}/superadmin/restaurants/${restaurant.id}/messages`);
      setMessagesForm({
        msg_new: response.data.msg_new || '',
        msg_preparing: response.data.msg_preparing || '',
        msg_delivering: response.data.msg_delivering || '',
        msg_delivered: response.data.msg_delivered || '',
        msg_cancelled: response.data.msg_cancelled || ''
      });
      setShowMessagesModal(true);
    } catch (err) {
      setError('Ошибка загрузки шаблонов');
    }
  };

  const handleSaveMessages = async () => {
    setSavingMessages(true);
    try {
      await axios.put(`${API_URL}/superadmin/restaurants/${messagesRestaurant.id}/messages`, messagesForm);
      setSuccess('Шаблоны сообщений сохранены');
      setShowMessagesModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения шаблонов');
    } finally {
      setSavingMessages(false);
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
      <Navbar expand="lg" className="admin-navbar admin-navbar-shell py-3 mb-4 shadow-sm">
        <Container>
          <Navbar.Brand className="d-flex align-items-center gap-2 py-1">
            <div className="admin-brand-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
              </svg>
            </div>
            <div className="d-flex flex-column admin-brand-meta">
              <span className="admin-brand-title">
                Супер-Админ
              </span>
              <span className="admin-brand-subtitle">
                {t('saSubtitle')}
              </span>
            </div>
          </Navbar.Brand>
          <Navbar.Toggle className="admin-navbar-toggle">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </Navbar.Toggle>
          <Navbar.Collapse className="justify-content-end">
            <Nav className="align-items-lg-center gap-lg-1">
              <Dropdown align="end" className="ms-lg-2">
                <Dropdown.Toggle
                  variant="link"
                  bsPrefix="p-0"
                  className="d-flex align-items-center gap-2 bg-white bg-opacity-10 py-2 px-3 rounded-pill text-decoration-none custom-user-dropdown admin-user-toggle"
                >
                  <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white admin-user-avatar">
                    {user?.username?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="d-none d-md-block text-start">
                    <div className="text-white small fw-bold lh-1">{user?.full_name || user?.username || 'Super Administrator'}</div>
                    <div className="text-white-50 small admin-user-id">Administrator</div>
                  </div>
                </Dropdown.Toggle>

                <Dropdown.Menu className="shadow border-0 mt-2 rounded-3 admin-dropdown-menu">
                  <Dropdown.Item onClick={() => navigate('/admin')} className="d-flex align-items-center gap-2 py-2">
                    <i className="bi bi-grid-1x2"></i> {t('operatorPanel')}
                  </Dropdown.Item>
                  <div className="px-3 py-2">
                    <div className="admin-lang-switch">
                      <div
                        onClick={language !== 'ru' ? toggleLanguage : undefined}
                        className={`flex-fill text-center rounded py-1 admin-lang-item ${language === 'ru' ? 'bg-white shadow-sm text-primary fw-medium' : 'text-muted'}`}
                      >
                        <img src="/ru.svg" alt="RU" className="admin-flag" />
                        Рус
                      </div>
                      <div
                        onClick={language !== 'uz' ? toggleLanguage : undefined}
                        className={`flex-fill text-center rounded py-1 admin-lang-item ${language === 'uz' ? 'bg-white shadow-sm text-primary fw-medium' : 'text-muted'}`}
                      >
                        <img src="/uz.svg" alt="UZ" className="admin-flag" />
                        O'zb
                      </div>
                    </div>
                  </div>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={handleLogout} className="text-danger d-flex align-items-center gap-2 py-2">
                    <i className="bi bi-box-arrow-right"></i> Выйти
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="admin-panel">
        {/* Notifications */}
        <ToastContainer position="top-end" className="p-3 admin-toast-top">
          <Toast onClose={() => setError('')} show={!!error} delay={5000} autohide bg="danger" className="text-white">
            <Toast.Header closeButton={false} className="bg-danger text-white border-0">
              <strong className="me-auto">Ошибка</strong>
              <Button variant="white" className="btn-close" onClick={() => setError('')} />
            </Toast.Header>
            <Toast.Body>{error}</Toast.Body>
          </Toast>

          <Toast onClose={() => setSuccess('')} show={!!success} delay={5000} autohide bg="success" className="text-white">
            <Toast.Header closeButton={false} className="bg-success text-white border-0">
              <strong className="me-auto">Успех</strong>
              <Button variant="white" className="btn-close" onClick={() => setSuccess('')} />
            </Toast.Header>
            <Toast.Body>{success}</Toast.Body>
          </Toast>
        </ToastContainer>

        {/* Stats */}
        <Row className="mb-4 g-4">
          <Col md={3}>
            <Card className="admin-card stat-card border-0">
              <Card.Body className="p-4 d-flex align-items-center gap-3">
                <div className="stat-icon bg-primary bg-opacity-10 text-primary mb-0">🏪</div>
                <div>
                  <h4 className="fw-bold mb-0 text-dark">{stats.restaurants_count || 0}</h4>
                  <small className="text-muted fw-semibold">{t('saRestaurantsCount')}</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="admin-card stat-card border-0">
              <Card.Body className="p-4 d-flex align-items-center gap-3">
                <div className="stat-icon bg-success bg-opacity-10 text-success mb-0">👥</div>
                <div>
                  <h4 className="fw-bold mb-0 text-dark">{stats.operators_count || 0}</h4>
                  <small className="text-muted fw-semibold">{t('saOperatorsCount')}</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="admin-card stat-card border-0">
              <Card.Body className="p-4 d-flex align-items-center gap-3">
                <div className="stat-icon bg-info bg-opacity-10 text-info mb-0">👤</div>
                <div>
                  <h4 className="fw-bold mb-0 text-dark">{stats.customers_count || 0}</h4>
                  <small className="text-muted fw-semibold">{t('saCustomersCount')}</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="admin-card stat-card border-0">
              <Card.Body className="p-4 d-flex align-items-center gap-3">
                <div className="stat-icon bg-warning bg-opacity-10 text-warning mb-0">📦</div>
                <div>
                  <h4 className="fw-bold mb-0 text-dark">{stats.new_orders_count || 0}</h4>
                  <small className="text-muted fw-semibold">{t('saNewOrdersCount')}</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Main Content */}
        <Card className="admin-card border-0 shadow-sm">
          <Card.Body className="p-4">
            <Tabs activeKey={activeTab} onSelect={setActiveTab} className="admin-tabs mb-4">

              {/* Restaurants Tab */}
              <Tab eventKey="restaurants" title={`🏪 ${t('restaurants')}`}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0">{t('saManageRestaurants')}</h5>
                </div>

                <div className="d-flex gap-2 flex-wrap align-items-center mb-3">
                  <Form.Control
                    className="form-control-custom"
                    type="search"
                    placeholder="Поиск по названию..."
                    style={{ width: '220px' }}
                    value={restaurantsNameFilter}
                    onChange={(e) => { setRestaurantsNameFilter(e.target.value); setRestaurantsPage(1); }}
                  />
                  <SearchableRestaurantFilter
                    t={t}
                    width="220px"
                    value={restaurantsSelectFilter}
                    restaurants={restaurantsFilterOptions}
                    searchValue={restaurantsSelectSearch}
                    onSearchChange={setRestaurantsSelectSearch}
                    onChange={(nextValue) => {
                      setRestaurantsSelectFilter(nextValue);
                      setRestaurantsSelectSearch('');
                      setRestaurantsPage(1);
                    }}
                  />
                  <Form.Select
                    className="form-control-custom"
                    style={{ width: '170px' }}
                    value={restaurantsStatusFilter}
                    onChange={(e) => { setRestaurantsStatusFilter(e.target.value); setRestaurantsPage(1); }}
                  >
                    <option value="">Все статусы</option>
                    <option value="active">Активные</option>
                    <option value="inactive">Неактивные</option>
                  </Form.Select>
                  <Button className="btn-primary-custom ms-auto" onClick={() => openRestaurantModal()}>
                    {t('saAddRestaurant')}
                  </Button>
                </div>

                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>{t('saTableLogo')}</th>
                            <th>{t('saTableName')}</th>
                            <th>{t('saTableBalance') || 'Баланс'}</th>
                            <th>{t('saServiceFee') || 'Сбор за обслуживание'}</th>
                            <th>{t('saTableTier') || 'Тариф'}</th>
                            <th>{t('saTableStatus')}</th>
                            <th className="text-end">{t('saTableActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRestaurants?.map(r => (
                            <tr key={r.id}>
                              <td><span className="text-muted small">#{r.id}</span></td>
                              <td>
                                {r.logo_url ? (
                                  <img
                                    src={r.logo_url.startsWith('http') ? r.logo_url : `${API_URL.replace('/api', '')}${r.logo_url}`}
                                    alt={r.name}
                                    style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }}
                                  />
                                ) : (
                                  <div style={{ width: '36px', height: '36px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #eee' }}>
                                    🏪
                                  </div>
                                )}
                              </td>
                              <td>
                                <strong className="text-dark">{r.name}</strong>
                              </td>
                              <td>
                                <div className="fw-bold text-primary">{parseFloat(r.balance || 0).toLocaleString()} сум</div>
                                <small className="text-muted">Стоимость заказа: {parseFloat(r.order_cost || 1000).toLocaleString()}</small>
                              </td>
                              <td>
                                <div className="fw-semibold">
                                  {parseFloat(r.service_fee || 0).toLocaleString()} сум
                                </div>
                              </td>
                              <td>
                                <Badge
                                  className={`badge-custom ${r.is_free_tier ? 'bg-info bg-opacity-10 text-info' : 'bg-warning bg-opacity-10 text-warning'}`}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => toggleFreeTier(r.id, !r.is_free_tier)}
                                  title="Нажмите, чтобы изменить тариф"
                                >
                                  {r.is_free_tier ? 'Бесплатный' : 'Платный'}
                                </Badge>
                              </td>
                              <td>
                                <Form.Check
                                  type="switch"
                                  checked={r.is_active}
                                  onChange={() => handleToggleRestaurant(r)}
                                  className="custom-switch"
                                />
                              </td>
                              <td className="text-end">
                                <div className="d-flex gap-2 justify-content-end text-nowrap">
                                  <Button
                                    variant="light"
                                    className="action-btn text-success"
                                    onClick={() => { setTopupRestaurant(r); setShowTopupModal(true); }}
                                    title="Пополнить баланс"
                                  >
                                    💰
                                  </Button>
                                  <Button variant="light" className="action-btn text-primary" onClick={() => openRestaurantModal(r)} title="Редактировать">
                                    ✏️
                                  </Button>
                                  <Button variant="light" className="action-btn text-info" onClick={() => openMessagesModal(r)} title="Шаблоны сообщений">
                                    💬
                                  </Button>
                                  <Button variant="light" className="action-btn text-danger" onClick={() => handleDeleteRestaurant(r.id)} title="Удалить">
                                    🗑️
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredRestaurants?.length === 0 && (
                            <tr><td colSpan="8" className="text-center py-5 text-muted">{t('saEmptyRestaurants')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={restaurantsPage}
                      total={filteredRestaurants.length}
                      limit={restaurantsLimit}
                      onPageChange={setRestaurantsPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => { setRestaurantsLimit(val); setRestaurantsPage(1); }}
                    />
                  </>
                )}
              </Tab>

              {/* Operators Tab */}
              <Tab eventKey="operators" title={`👥 ${t('operators')}`}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="fw-bold mb-0">{t('saManageOperators')}</h5>
                </div>

                <div className="d-flex gap-2 flex-wrap align-items-center mb-3">
                  <Form.Select
                    className="form-control-custom"
                    style={{ width: '170px' }}
                    value={operatorRoleFilter}
                    onChange={(e) => { setOperatorRoleFilter(e.target.value); setOperatorsPage(1); }}
                  >
                    <option value="">{t('saAllRoles')}</option>
                    <option value="operator">{t('saRoleOperator')}</option>
                    <option value="superadmin">{t('saRoleSuperadmin')}</option>
                  </Form.Select>
                  <Form.Select
                    className="form-control-custom"
                    style={{ width: '160px' }}
                    value={operatorStatusFilter}
                    onChange={(e) => { setOperatorStatusFilter(e.target.value); setOperatorsPage(1); }}
                  >
                    <option value="">{t('saAllStatuses')}</option>
                    <option value="active">{t('saStatusActive')}</option>
                    <option value="inactive">{t('saStatusInactive')}</option>
                  </Form.Select>
                  <SearchableRestaurantFilter
                    t={t}
                    width="220px"
                    value={operatorRestaurantFilter}
                    restaurants={operatorRestaurantOptions}
                    searchValue={operatorRestaurantSearch}
                    onSearchChange={setOperatorRestaurantSearch}
                    onChange={(nextValue) => {
                      setOperatorRestaurantFilter(nextValue);
                      setOperatorRestaurantSearch('');
                      setOperatorsPage(1);
                    }}
                  />
                  <Form.Control
                    className="form-control-custom"
                    type="search"
                    placeholder={t('saSearchNamePhone')}
                    style={{ width: '220px' }}
                    value={operatorSearch}
                    onChange={(e) => { setOperatorSearch(e.target.value); setOperatorsPage(1); }}
                  />
                  <Button className="btn-primary-custom ms-auto" onClick={() => openOperatorModal()}>
                    {t('saAddOperator')}
                  </Button>
                </div>

                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>{t('saTableLogin')}</th>
                            <th>{t('saTableFio')}</th>
                            <th>{t('saTablePhone')}</th>
                            <th>{t('saTableRole')}</th>
                            <th>{t('saRestaurantsCount')}</th>
                            <th>{t('saTableStatus')}</th>
                            <th className="text-end">{t('saTableActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operators.operators?.map(op => (
                            <tr key={op.id}>
                              <td><span className="text-muted small">#{op.id}</span></td>
                              <td><strong>{op.username}</strong></td>
                              <td>{op.full_name || '-'}</td>
                              <td><small>{op.phone || '-'}</small></td>
                              <td>
                                <Badge className={`badge-custom ${op.role === 'superadmin' ? 'bg-danger bg-opacity-10 text-danger' : 'bg-primary bg-opacity-10 text-primary'}`}>
                                  {op.role === 'superadmin' ? 'Супер-админ' : 'Оператор'}
                                </Badge>
                              </td>
                              <td>
                                <div className="d-flex flex-wrap gap-1">
                                  {op.restaurants?.map(r => (
                                    <Badge key={r.id} className="badge-custom bg-secondary bg-opacity-10 text-muted small">{r.name}</Badge>
                                  ))}
                                </div>
                              </td>
                              <td>
                                <Badge className={`badge-custom ${op.is_active ? 'bg-success bg-opacity-10 text-success' : 'bg-secondary bg-opacity-10 text-muted'}`}>
                                  {op.is_active ? 'Активен' : 'Неактивен'}
                                </Badge>
                              </td>
                              <td className="text-end">
                                <div className="d-flex gap-2 justify-content-end">
                                  <Button variant="light" className="action-btn text-primary" onClick={() => openOperatorModal(op)}>
                                    ✏️
                                  </Button>
                                  {op.role !== 'superadmin' && (
                                    <Button variant="light" className="action-btn text-danger" onClick={() => handleDeleteOperator(op.id)}>
                                      🗑️
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {operators.operators?.length === 0 && (
                            <tr><td colSpan="8" className="text-center py-5 text-muted">{t('saEmptyOperators')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={operatorsPage}
                      total={operators.total}
                      limit={operatorsLimit}
                      onPageChange={setOperatorsPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => { setOperatorsLimit(val); setOperatorsPage(1); }}
                    />
                  </>
                )}
              </Tab>

              {/* Customers Tab */}
              <Tab eventKey="customers" title={`👤 ${t('clients')}`}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0">{t('saListCustomers')} ({customers.total})</h5>
                  <div className="d-flex gap-2 flex-wrap align-items-center">
                    <SearchableRestaurantFilter
                      t={t}
                      width="220px"
                      value={customerRestaurantFilter}
                      restaurants={customerRestaurantOptions}
                      searchValue={customerRestaurantSearch}
                      onSearchChange={setCustomerRestaurantSearch}
                      onChange={(nextValue) => {
                        setCustomerRestaurantFilter(nextValue);
                        setCustomerRestaurantSearch('');
                        setCustomerPage(1);
                      }}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={customerStatusFilter}
                      onChange={(e) => { setCustomerStatusFilter(e.target.value); setCustomerPage(1); }}
                    >
                      <option value="">{t('saAllStatuses')}</option>
                      <option value="active">{t('saStatusActive')}</option>
                      <option value="blocked">{t('saStatusBlocked')}</option>
                    </Form.Select>
                    <Form.Control
                      className="form-control-custom"
                      type="search"
                      placeholder={t('saSearch')}
                      style={{ width: '200px' }}
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerPage(1); }}
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>{t('saTableUser')}</th>
                            <th>{t('saTablePhone')}</th>
                            <th>Telegram</th>
                            <th>{t('saTableShop')}</th>
                            <th>{t('saTableOrders')}</th>
                            <th>{t('saTableSum')}</th>
                            <th>{t('saTableStatus')}</th>
                            <th className="text-end">{t('saTableActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.customers?.map(c => {
                            const isBlocked = c.is_blocked || !c.user_is_active;
                            return (
                              <tr key={c.association_id} className={isBlocked ? 'bg-light' : ''}>
                                <td>
                                  <div className="fw-bold">{c.full_name || c.username}</div>
                                  <div className="text-muted small">@{c.username?.replace(/^@/, '') || 'n/a'}</div>
                                </td>
                                <td><small>{c.phone || '-'}</small></td>
                                <td>{c.telegram_id ? <Badge className="badge-custom bg-info bg-opacity-10 text-info">{c.telegram_id}</Badge> : '-'}</td>
                                <td>
                                  <Badge className="badge-custom bg-primary bg-opacity-10 text-primary">
                                    {c.restaurant_name}
                                  </Badge>
                                </td>
                                <td>
                                  <Badge className={`badge-custom ${parseInt(c.orders_count) > 0 ? 'bg-success bg-opacity-10 text-success' : 'bg-secondary bg-opacity-10 text-muted'}`}>
                                    {c.orders_count}
                                  </Badge>
                                </td>
                                <td><span className="fw-semibold">{parseFloat(c.total_spent || 0).toLocaleString()} сум</span></td>
                                <td>
                                  {!c.user_is_active ? (
                                    <Badge className="badge-custom bg-danger bg-opacity-10 text-danger">Бан (Глобал)</Badge>
                                  ) : c.is_blocked ? (
                                    <Badge className="badge-custom bg-warning bg-opacity-10 text-warning">Блокирован</Badge>
                                  ) : (
                                    <Badge className="badge-custom bg-success bg-opacity-10 text-success">Активен</Badge>
                                  )}
                                </td>
                                <td className="text-end">
                                  <div className="d-flex gap-2 justify-content-end">
                                    <Button variant="light" className="action-btn text-info" onClick={() => openOrderHistory({ id: c.user_id, full_name: c.full_name, username: c.username })}>
                                      📋
                                    </Button>
                                    <Button
                                      variant="light"
                                      className={`action-btn ${isBlocked ? 'text-success' : 'text-warning'}`}
                                      onClick={() => handleToggleCustomerBlock(c)}
                                    >
                                      {isBlocked ? '✅' : '🚫'}
                                    </Button>
                                    <Button variant="light" className="action-btn text-danger" onClick={() => handleDeleteCustomer({ id: c.user_id, full_name: c.full_name, username: c.username })}>
                                      🗑️
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {customers.customers?.length === 0 && (
                            <tr><td colSpan="8" className="text-center py-5 text-muted">{t('saEmptyCustomers')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={customerPage}
                      total={customers.total}
                      limit={customerLimit}
                      onPageChange={setCustomerPage}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => { setCustomerLimit(val); setCustomerPage(1); }}
                    />
                  </>
                )}
              </Tab>

              {/* Categories Tab */}
              <Tab eventKey="categories" title={`📁 ${t('categories')}`}>
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h5 className="fw-bold mb-0">{t('saManageCategories')}</h5>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      ref={categoryImportInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="d-none"
                      onChange={handleImportCategoriesFile}
                    />
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={handleExportCategories}
                    >
                      Экспорт
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => categoryImportInputRef.current?.click()}
                      disabled={isImportingCategories}
                    >
                      {isImportingCategories ? 'Импорт...' : 'Импорт'}
                    </Button>
                    <Badge className="badge-custom bg-info bg-opacity-10 text-info">{CATEGORY_LEVEL_COUNT} уровня</Badge>
                  </div>
                </div>
                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <div
                    className="pb-3"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${CATEGORY_LEVEL_COUNT}, minmax(0, 1fr))`,
                      gap: '12px',
                      minHeight: '450px',
                      width: '100%'
                    }}
                  >
                    {Array.from({ length: CATEGORY_LEVEL_COUNT }, (_, idx) => idx).map(levelIndex => {
                      const parentCategory = levelIndex === 0 ? null : categoryLevels[levelIndex - 1];
                      const isVisible = levelIndex === 0 || parentCategory !== null;

                      const levelCategories = isVisible ? categories.filter(c =>
                        (!c.parent_id && levelIndex === 0) ||
                        (c.parent_id === parentCategory?.id)
                      ).sort((a, b) => {
                        const getSortVal = (c) => (c.sort_order === null || c.sort_order === undefined) ? 9999 : c.sort_order;
                        const orderDiff = getSortVal(a) - getSortVal(b);
                        if (orderDiff !== 0) return orderDiff;
                        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
                      }) : [];

                      return (
                        <Card
                          key={levelIndex}
                          className={`admin-card admin-section-panel ${!isVisible ? 'opacity-50' : ''}`}
                          style={{ minWidth: 0, width: '100%', background: isVisible ? '#fff' : '#f8fafc' }}
                        >
                          <Card.Header className="admin-card-header admin-section-panel-header d-flex justify-content-between align-items-center py-3">
                            <div>
                              <div className="fw-bold text-dark small text-uppercase letter-spacing-1 mb-0">
                                {levelIndex === 0 ? t('saMainLevel') : `${t('saLevel')} ${levelIndex + 1}`}
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              className="action-btn d-flex align-items-center justify-content-center p-0"
                              style={{ width: '28px', height: '28px', borderRadius: '8px' }}
                              onClick={() => openCategoryModal(levelIndex, parentCategory)}
                              disabled={!isVisible}
                            >
                              +
                            </Button>
                          </Card.Header>
                          <Card.Body className="p-0 custom-scrollbar" style={{ height: '400px', overflowY: 'auto' }}>
                            {!isVisible ? (
                              <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                                <span style={{ fontSize: '2rem' }}>👈</span>
                                <div className="mt-2 text-center small px-4">
                                  {t('saSelectParent')}
                                </div>
                              </div>
                            ) : levelCategories.length === 0 ? (
                              levelIndex === CATEGORY_LEVEL_COUNT - 1 ? (
                                <div className="h-100"></div>
                              ) : (
                                <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                                  <div className="mb-2 opacity-25" style={{ fontSize: '2rem' }}>📁</div>
                                  <small className="fw-medium">{t('saEmptyLevel')}</small>
                                </div>
                              )
                            ) : (
                              <div className="list-group list-group-flush category-level-list">
                                {levelCategories?.map(cat => (
                                  <div
                                    key={cat?.id}
                                    className={`list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between py-2 px-3 category-list-item ${categoryLevels[levelIndex]?.id === cat?.id ? 'is-active' : ''}`}
                                    onClick={() => handleCategorySelect(levelIndex, cat)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <div className="d-flex align-items-center gap-2 overflow-hidden">
                                      {cat?.image_url ? (
                                        <img src={cat?.image_url} alt="" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '4px' }} />
                                      ) : (
                                        <div className="bg-light d-flex align-items-center justify-content-center" style={{ width: '24px', height: '24px', borderRadius: '4px' }}>
                                          <i className="bi bi-folder2 text-muted" style={{ fontSize: '12px' }}></i>
                                        </div>
                                      )}
                                      <span className="text-muted me-2 small">[{cat.sort_order !== null && cat.sort_order !== undefined ? cat.sort_order : '-'}]</span>
                                      <span className="text-truncate small fw-medium">{cat?.name_ru}</span>
                                    </div>
                                    <div className="category-actions flex-shrink-0 ms-2">
                                      <Button
                                        variant="link"
                                        className="p-0 text-muted hover-primary me-1"
                                        onClick={(e) => { e.stopPropagation(); openCategoryModal(levelIndex, null, cat); }}
                                      >
                                        <i className="bi bi-pencil" style={{ fontSize: '11px' }}></i>
                                      </Button>
                                      <Button
                                        variant="link"
                                        className="p-0 text-danger"
                                        title={
                                          canDeleteCategory(cat)
                                            ? 'Удалить категорию'
                                            : `Нельзя удалить: товары (${getCategoryProductsCount(cat)}), подкатегории (${getCategorySubcategoriesCount(cat)})`
                                        }
                                        onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                                      >
                                        <i className="bi bi-trash" style={{ fontSize: '11px' }}></i>
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Tab>

              {/* Logs Tab */}
              <Tab eventKey="logs" title={`📋 ${t('logs')}`}>
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <h5 className="fw-bold mb-0">{t('activityLog')}</h5>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={logsFilter.start_date}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, start_date: e.target.value, page: 1 }))}
                    />
                    <Form.Control
                      type="date"
                      className="form-control-custom"
                      style={{ width: '150px' }}
                      value={logsFilter.end_date}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, end_date: e.target.value, page: 1 }))}
                    />
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '180px' }}
                      value={logsFilter.user_id}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, user_id: e.target.value, page: 1 }))}
                    >
                      <option value="">{t('saAllUsers')}</option>
                      {allOperators?.map(op => (
                        <option key={op.id} value={op.id}>{op.full_name || op.username}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '160px' }}
                      value={logsFilter.restaurant_id}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, restaurant_id: e.target.value, page: 1 }))}
                    >
                      <option value="">{t('saAllShops')}</option>
                      {allRestaurants?.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Form.Select>
                    <Form.Select
                      className="form-control-custom"
                      style={{ width: '170px' }}
                      value={logsFilter.action_type}
                      onChange={(e) => setLogsFilter(prev => ({ ...prev, action_type: e.target.value, page: 1 }))}
                    >
                      <option value="">{t('saAllActions')}</option>
                      <option value="create_product">Создание товара</option>
                      <option value="update_product">Изменение товара</option>
                      <option value="delete_product">Удаление товара</option>
                      <option value="update_order_status">Изменение заказа</option>
                      <option value="login">Вход</option>
                    </Form.Select>
                    <Button
                      variant="light"
                      className="border form-control-custom text-muted d-flex align-items-center justify-content-center"
                      style={{ height: '38px', padding: '0 15px' }}
                      title="Сбросить фильтры"
                      onClick={() => setLogsFilter({ action_type: '', entity_type: '', restaurant_id: '', user_id: '', start_date: '', end_date: '', page: 1, limit: 15 })}
                      disabled={!logsFilter.action_type && !logsFilter.restaurant_id && !logsFilter.user_id && !logsFilter.start_date && !logsFilter.end_date}
                    >
                      Сброс
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : (
                  <>
                    <div className="admin-table-container">
                      <Table responsive hover className="admin-table">
                        <thead>
                          <tr>
                            <th>{t('saTableDate')}</th>
                            <th>{t('saTableUser')}</th>
                            <th>{t('saTableAction')}</th>
                            <th>{t('saTableObject')}</th>
                            <th>{t('saTableRestaurant')}</th>
                            <th className="text-end">IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.logs?.map(log => (
                            <tr key={log.id}>
                              <td><small className="text-muted">{formatDate(log.created_at)}</small></td>
                              <td><span className="fw-semibold">{log.user_full_name || log.username}</span></td>
                              <td>
                                <Badge className="badge-custom bg-info bg-opacity-10 text-info">{getActionTypeLabel(log.action_type)}</Badge>
                              </td>
                              <td><small>{log.entity_name || `${log.entity_type} #${log.entity_id}`}</small></td>
                              <td>
                                <Badge className="badge-custom bg-secondary bg-opacity-10 text-muted">{log.restaurant_name || '-'}</Badge>
                              </td>
                              <td className="text-end"><small className="text-muted">{log.ip_address}</small></td>
                            </tr>
                          ))}
                          {logs.logs?.length === 0 && (
                            <tr><td colSpan="6" className="text-center py-5 text-muted">{t('saEmptyLogs')}</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <DataPagination
                      current={logsFilter.page}
                      total={logs.total}
                      limit={logsFilter.limit}
                      onPageChange={(val) => setLogsFilter(prev => ({ ...prev, page: val }))}
                      limitOptions={[15, 20, 30, 50]}
                      onLimitChange={(val) => setLogsFilter(prev => ({ ...prev, limit: val, page: 1 }))}
                    />
                  </>
                )}
              </Tab>

              {/* Billing Settings Tab */}
              <Tab eventKey="billing" title={`💰 ${t('billingSettings')}`}>
                <Form onSubmit={(e) => { e.preventDefault(); saveBillingSettings(); }}>
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="fw-bold mb-0">{t('billingGlobalSettings')}</h5>
                    <Button type="submit" className="btn-primary-custom px-4">
                      {t('saveSettings')}
                    </Button>
                  </div>

                  <Row className="g-4">
                    <Col md={7}>
                      <Card className="admin-card admin-section-panel h-100">
                        <Card.Header className="admin-section-panel-header py-3">
                          <h6 className="mb-0 fw-bold">{t('paymentRequisitesInfo')}</h6>
                        </Card.Header>
                        <Card.Body className="p-4">
                          <Row className="g-3">
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">{t('cardNumber')}</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="8600 ...."
                                  value={billingSettings.card_number}
                                  onChange={e => setBillingSettings({ ...billingSettings, card_number: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">{t('cardHolder')}</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="Имя Фамилия"
                                  value={billingSettings.card_holder}
                                  onChange={e => setBillingSettings({ ...billingSettings, card_holder: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">{t('phoneNumber')}</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="+998 ..."
                                  value={billingSettings.phone_number}
                                  onChange={e => setBillingSettings({ ...billingSettings, phone_number: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">Telegram Username</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="@username"
                                  value={billingSettings.telegram_username}
                                  onChange={e => setBillingSettings({ ...billingSettings, telegram_username: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">Ссылка Click</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="https://click.uz/..."
                                  value={billingSettings.click_link}
                                  onChange={e => setBillingSettings({ ...billingSettings, click_link: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                            <Col md={6}>
                              <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted text-uppercase">Ссылка Payme</Form.Label>
                                <Form.Control
                                  className="form-control-custom"
                                  placeholder="https://payme.uz/..."
                                  value={billingSettings.payme_link}
                                  onChange={e => setBillingSettings({ ...billingSettings, payme_link: e.target.value })}
                                />
                              </Form.Group>
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>
                    </Col>

                    <Col md={5}>
                      <Card className="admin-card admin-section-panel h-100">
                        <Card.Header className="admin-section-panel-header py-3">
                          <h6 className="mb-0 fw-bold">{t('defaultFinancialParams')}</h6>
                        </Card.Header>
                        <Card.Body className="p-4">
                          <Form.Group className="mb-4">
                            <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">
                              Токен центрального Telegram-бота
                            </Form.Label>
                            <div className="position-relative">
                              <Form.Control
                                type={isCentralTokenVisible ? 'text' : 'password'}
                                className="form-control-custom"
                                placeholder="123456789:AA..."
                                value={billingSettings.superadmin_bot_token || ''}
                                style={{ paddingRight: '2.4rem' }}
                                onChange={e => {
                                  setIsCentralTokenVisible(false);
                                  setBillingSettings({ ...billingSettings, superadmin_bot_token: e.target.value });
                                }}
                              />
                              <Button
                                type="button"
                                variant="link"
                                className="position-absolute top-50 end-0 translate-middle-y text-muted p-0 me-2"
                                style={{ lineHeight: 1 }}
                                onClick={handleCentralTokenPreview}
                                disabled={!billingSettings.superadmin_bot_token}
                                title={isCentralTokenVisible ? 'Скрыть токен' : 'Показать на 2 секунды'}
                                aria-label={isCentralTokenVisible ? 'Скрыть токен' : 'Показать токен'}
                              >
                                <i className={`bi ${isCentralTokenVisible ? 'bi-eye-slash' : 'bi-eye'}`} />
                              </Button>
                            </div>
                            <Form.Text className="text-muted small">
                              Используется для центрального onboarding-бота. После сохранения бот перезапускается автоматически.
                            </Form.Text>
                          </Form.Group>

                          <Form.Group className="mb-0">
                            <Form.Label className="small fw-bold text-muted text-uppercase d-block mb-2">{t('defaultStartingBalance')}</Form.Label>
                            <Form.Control
                              type="number"
                              className="form-control-custom"
                              value={billingSettings.default_starting_balance}
                              onChange={e => setBillingSettings({ ...billingSettings, default_starting_balance: e.target.value })}
                            />
                            <Form.Text className="text-muted small">
                              Бонус при создании нового заведения
                            </Form.Text>
                          </Form.Group>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Form>
              </Tab>
            </Tabs>
          </Card.Body>
        </Card>
      </Container>

      {/* Restaurant Modal */}
      <Modal show={showRestaurantModal} onHide={() => setShowRestaurantModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingRestaurant ? t('saModalEditRestaurant') : t('saModalNewRestaurant')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <Form>
            <Tabs defaultActiveKey="main" className="custom-restaurant-tabs px-3 pt-3 border-bottom-0">
              <Tab eventKey="main" title="📋 Основные">
                <div className="p-4 pt-3">
                  {/* Logo Upload */}
                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">{t('saLogo')}</Form.Label>
                    <div className="d-flex align-items-center gap-3 bg-light p-3 rounded border border-light">
                      {restaurantForm.logo_url ? (
                        <img
                          src={restaurantForm.logo_url.startsWith('http') ? restaurantForm.logo_url : `${API_URL.replace('/api', '')}${restaurantForm.logo_url}`}
                          alt="Logo"
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '12px', border: '2px solid #dee2e6' }}
                        />
                      ) : (
                        <div style={{ width: '80px', height: '80px', background: '#e9ecef', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cdcdcd' }}>
                          <span style={{ fontSize: '2rem' }}>🏪</span>
                        </div>
                      )}
                      <div className="w-100">
                        <Form.Control
                          type="file"
                          size="sm"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                          className="mb-1"
                        />
                        {uploadingLogo && <small className="text-muted d-block mt-1">Загрузка...</small>}
                        {restaurantForm.logo_url && (
                          <Button
                            variant="link"
                            size="sm"
                            className="text-danger p-0 mt-2 fw-medium text-decoration-none"
                            onClick={() => setRestaurantForm({ ...restaurantForm, logo_url: '' })}
                          >
                            <i className="bi bi-trash"></i> Удалить логотип
                          </Button>
                        )}
                      </div>
                    </div>
                  </Form.Group>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary">Название магазина / ресторана *</Form.Label>
                        <Form.Control
                          value={restaurantForm.name}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })}
                          placeholder="Название ресторана"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary">Телефон</Form.Label>
                        <Form.Control
                          value={restaurantForm.phone}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, phone: e.target.value })}
                          placeholder="+998901234567"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">Адрес</Form.Label>
                    <Form.Control
                      value={restaurantForm.address}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, address: e.target.value })}
                      placeholder="Адрес ресторана"
                    />
                  </Form.Group>

                  <h6 className="fw-bold text-dark mt-2 mb-3"><i className="bi bi-clock text-primary"></i> {t('saWorkingHours')}</h6>
                  <Row className="mb-2">
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary small">{t('saStartTime')}</Form.Label>
                        <Form.Control
                          type="time"
                          value={restaurantForm.start_time}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, start_time: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-medium text-secondary small">{t('saEndTime')}</Form.Label>
                        <Form.Control
                          type="time"
                          value={restaurantForm.end_time}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, end_time: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Text className="text-muted"><i className="bi bi-info-circle"></i> Если не указано, ресторан считается открытым всегда.</Form.Text>

                  <hr className="my-4" />
                  <h6 className="fw-bold text-dark mb-3">📍 {t('saCoordinates')}</h6>
                  <Row className="mb-2">
                    <Col md={6}>
                      <Form.Group className="mb-2">
                        <Form.Label className="fw-medium text-secondary small">Широта (Latitude)</Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          value={restaurantForm.latitude}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, latitude: e.target.value })}
                          placeholder="41.311081"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-2">
                        <Form.Label className="fw-medium text-secondary small">Долгота (Longitude)</Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          value={restaurantForm.longitude}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, longitude: e.target.value })}
                          placeholder="69.240562"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <div className="rounded overflow-hidden border">
                    <Suspense fallback={<div className="text-center p-3 text-muted"><Spinner size="sm" className="me-2" /> Загрузка карты...</div>}>
                      <YandexLocationPicker
                        latitude={restaurantForm.latitude}
                        longitude={restaurantForm.longitude}
                        onLocationChange={(lat, lng) => setRestaurantForm({ ...restaurantForm, latitude: lat, longitude: lng })}
                        height="250px"
                      />
                    </Suspense>
                  </div>
                  <Form.Text className="text-muted mt-2 d-block">
                    <i className="bi bi-cursor"></i> Кликните на карту или перетащите маркер, чтобы задать координаты ресторана.
                  </Form.Text>
                </div>
              </Tab>

              <Tab eventKey="telegram" title="✈️ Телеграм">
                <div className="p-4 pt-3">
                  <h6 className="fw-bold text-dark mb-3">{t('saTgSettings')}</h6>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-medium text-secondary">Bot Token</Form.Label>
                    <Form.Control
                      value={restaurantForm.telegram_bot_token}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, telegram_bot_token: e.target.value })}
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    />
                    <Form.Text className="text-muted mt-2 d-block"><i className="bi bi-robot"></i> Токен вашего бота, выданный @BotFather</Form.Text>
                  </Form.Group>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-secondary">{t('saGroupNoticeIds')}</Form.Label>
                        <Form.Control
                          value={restaurantForm.telegram_group_id}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, telegram_group_id: e.target.value })}
                          placeholder="-1001234567890"
                        />
                        <Form.Text className="text-muted mt-2 d-block"><i className="bi bi-people"></i> ID группы или канала для получения заказов. Бот должен быть добавлен туда с правами администратора.</Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-secondary">{t('saSupportUsername')}</Form.Label>
                        <div className="input-group">
                          <span className="input-group-text bg-light text-secondary border-end-0">@</span>
                          <Form.Control
                            className="border-start-0 ps-0"
                            value={restaurantForm.support_username}
                            onChange={(e) => setRestaurantForm({ ...restaurantForm, support_username: e.target.value.replace(/^@/, '') })}
                            placeholder="admin_username"
                          />
                        </div>
                        <Form.Text className="text-muted mt-2 d-block"><i className="bi bi-person-badge"></i> Telegram username администратора для поддержки. Будет отображаться для клиентов.</Form.Text>
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group className="mb-4">
                        <Form.Label className="fw-medium text-secondary">Код регистрации оператора</Form.Label>
                        <Form.Control
                          value={restaurantForm.operator_registration_code || ''}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, operator_registration_code: e.target.value.trim() })}
                          placeholder="например: OPERATOR-2026"
                        />
                        <Form.Text className="text-muted mt-2 d-block">
                          <i className="bi bi-key"></i> Операторы используют команду <code>/operator КОД</code> в этом боте.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              </Tab>

              <Tab eventKey="delivery-payment" title="💳 Доставка и оплата">
                <div className="p-4 pt-3">
                  <h6 className="fw-bold text-dark mb-3">💰 {t('saPaymentMethods')}</h6>

                  <Row className="mb-4">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-medium text-secondary d-flex align-items-center">
                          <img src="/click.png" alt="Click" style={{ height: 20, marginRight: 8, borderRadius: 4 }} />
                          Click - персональная ссылка
                        </Form.Label>
                        <Form.Control
                          value={restaurantForm.click_url}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, click_url: e.target.value })}
                          placeholder="https://my.click.uz/services/pay?service_id=..."
                          className="bg-light"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-medium text-secondary d-flex align-items-center">
                          <img src="/payme.png" alt="Payme" style={{ height: 20, marginRight: 8, borderRadius: 4 }} />
                          Payme - персональная ссылка
                        </Form.Label>
                        <Form.Control
                          value={restaurantForm.payme_url}
                          onChange={(e) => setRestaurantForm({ ...restaurantForm, payme_url: e.target.value })}
                          placeholder="https://payme.uz/fallback/merchant/..."
                          className="bg-light"
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <div className="mb-4 bg-light p-3 rounded border border-light">
                    <div className="d-flex align-items-center justify-content-between">
                      <Form.Label className="fw-medium text-secondary m-0">🛎 {t('saServiceFee')} (Сум)</Form.Label>
                      <Form.Check
                        type="switch"
                        id="service-fee-switch"
                        checked={restaurantForm.service_fee > 0}
                        onChange={(e) => setRestaurantForm({ ...restaurantForm, service_fee: e.target.checked ? 1000 : 0 })}
                        className="fs-5 m-0"
                      />
                    </div>
                    {restaurantForm.service_fee > 0 && (
                      <Form.Control
                        type="number"
                        min="0"
                        step="1000"
                        value={restaurantForm.service_fee}
                        onChange={(e) => setRestaurantForm({ ...restaurantForm, service_fee: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="mt-3"
                      />
                    )}
                    <Form.Text className="text-muted mt-2 d-block">Укажите сумму, которая будет списываться с баланса заведения за каждый принятый заказ. Эта же сумма может отображаться клиенту в чеке как сбор за обслуживание.</Form.Text>
                  </div>

                  <hr className="my-4" />

                  <div className="d-flex align-items-center justify-content-between mb-4">
                    <h6 className="fw-bold text-dark m-0">🚕 {t('saDeliverySettings')}</h6>
                    <Form.Check
                      type="switch"
                      id="delivery-settings-switch"
                      checked={restaurantForm.is_delivery_enabled !== false}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, is_delivery_enabled: e.target.checked })}
                      className="fs-5 m-0"
                    />
                  </div>

                  {restaurantForm.is_delivery_enabled !== false ? (
                    <>
                      <Row className="mb-4">
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-medium text-secondary small">{t('saBaseRadius')} (км)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              step="0.5"
                              size="sm"
                              value={restaurantForm.delivery_base_radius}
                              onChange={(e) => setRestaurantForm({ ...restaurantForm, delivery_base_radius: parseFloat(e.target.value) || 0 })}
                            />
                            <Form.Text className="text-muted mt-1 d-block" style={{ fontSize: '0.75rem' }}>Базовый радиус включенной доставки.</Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-medium text-secondary small">{t('saBasePrice')} (Сум)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              step="1000"
                              size="sm"
                              value={restaurantForm.delivery_base_price}
                              onChange={(e) => setRestaurantForm({ ...restaurantForm, delivery_base_price: parseFloat(e.target.value) || 0 })}
                            />
                            <Form.Text className="text-muted mt-1 d-block" style={{ fontSize: '0.75rem' }}>Цена доставки в пределах базы.</Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-medium text-secondary small">{t('saPricePerKm')} (Сум)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              step="500"
                              size="sm"
                              value={restaurantForm.delivery_price_per_km}
                              onChange={(e) => setRestaurantForm({ ...restaurantForm, delivery_price_per_km: parseFloat(e.target.value) || 0 })}
                            />
                            <Form.Text className="text-muted mt-1 d-block" style={{ fontSize: '0.75rem' }}>Надбавка за каждый следующий км.</Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>

                      <Form.Group className="mb-2">
                        <Form.Label className="fw-medium text-secondary mb-2">🗺️ Зона доставки</Form.Label>
                        <div className="d-flex align-items-center justify-content-between p-3 border rounded bg-light">
                          <div className="d-flex align-items-center gap-3">
                            {restaurantForm.delivery_zone ? (
                              <div className="d-flex flex-column">
                                <Badge bg="success" className="px-2 py-1 fs-6 d-inline-flex align-items-center gap-2">
                                  <i className="bi bi-check-circle"></i> Зона установлена
                                </Badge>
                                <small className="text-muted mt-1 text-center">{restaurantForm.delivery_zone.length} точек</small>
                              </div>
                            ) : (
                              <div className="d-flex flex-column">
                                <Badge bg="secondary" className="px-2 py-1 fs-6 d-inline-flex align-items-center gap-2">
                                  <i className="bi bi-dash-circle"></i> Зона не задана
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="d-flex gap-2 flex-column align-items-end">
                            <Button
                              variant={restaurantForm.delivery_zone ? "outline-primary" : "primary"}
                              size="sm"
                              onClick={() => setShowMapModal(true)}
                            >
                              <i className="bi bi-map me-1"></i> {restaurantForm.delivery_zone ? 'Изменить зону' : 'Очертить зону'}
                            </Button>
                            {restaurantForm.delivery_zone && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => setRestaurantForm({ ...restaurantForm, delivery_zone: null })}
                              >
                                <i className="bi bi-trash"></i> Удалить
                              </Button>
                            )}
                          </div>
                        </div>
                      </Form.Group>
                    </>
                  ) : (
                    <div className="text-center p-4 bg-light rounded text-muted mt-2 border">
                      <i className="bi bi-bicycle fs-2 d-block mb-2"></i>
                      Доставка отключена. Клиентам будет доступен только самовывоз.
                    </div>
                  )}
                </div>
              </Tab>
            </Tabs>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRestaurantModal(false)}>{t('saCancel')}</Button>
          <Button variant="primary" onClick={handleSaveRestaurant}>{t('saSave')}</Button>
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
          <Button variant="secondary" onClick={() => setShowMapModal(false)}>{t('saDone')}</Button>
        </Modal.Footer>
      </Modal>

      {/* Operator Modal */}
      <Modal show={showOperatorModal} onHide={() => setShowOperatorModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingOperator ? t('editOperator') : t('newOperator')}</Modal.Title>
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
                {allRestaurants.filter(r => r.is_active).map(r => (
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
                {allRestaurants.filter(r => r.is_active).length === 0 && (
                  <p className="text-muted mb-0">Нет активных ресторанов</p>
                )}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowOperatorModal(false)}>{t('saCancel')}</Button>
          <Button variant="primary" onClick={handleSaveOperator}>{t('saSave')}</Button>
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
                      <th>{t('saTableDate')}</th>
                      <th>{t('saTableRestaurant')}</th>
                      <th>{t('saTableSum')}</th>
                      <th>{t('saTableStatus')}</th>
                      <th>Оплата</th>
                      <th>Обработал</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.orders?.map(order => (
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
          <Button variant="secondary" onClick={() => setShowOrderHistoryModal(false)}>{t('saClose')}</Button>
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
                        <th>{t('saTableSum')}</th>
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
          <Button variant="secondary" onClick={() => setShowOrderDetailModal(false)}>{t('saClose')}</Button>
        </Modal.Footer>
      </Modal>

      {/* Message Templates Modal */}
      <Modal show={showMessagesModal} onHide={() => setShowMessagesModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Шаблоны сообщений: {messagesRestaurant?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="mb-3">
            <small>
              Настройте тексты уведомлений, которые будут отправляться клиентам при изменении статуса заказа.
              Оставьте поле пустым, чтобы использовать текст по умолчанию.
            </small>
          </Alert>

          <Alert variant="secondary" className="mb-3">
            <strong>Доступные переменные:</strong>
            <div className="mt-2" style={{ fontSize: '0.85rem' }}>
              <code>{'{order_number}'}</code> — номер заказа<br />
              <code>{'{customer_name}'}</code> — имя клиента<br />
              <code>{'{customer_phone}'}</code> — телефон клиента<br />
              <code>{'{total_amount}'}</code> — сумма заказа<br />
              <code>{'{delivery_address}'}</code> — адрес доставки<br />
              <code>{'{payment_method}'}</code> — способ оплаты
            </div>
            <div className="mt-2 text-muted" style={{ fontSize: '0.8rem' }}>
              Пример: <code>Здравствуйте, {'{customer_name}'}! Ваш заказ #{'{order_number}'} готовится.</code>
            </div>
          </Alert>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="primary" className="me-2">1</Badge>
              Новый заказ
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="📦 Ваш заказ в обработке!"
              value={messagesForm.msg_new}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_new: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: 📦 Ваш заказ в обработке!</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="warning" className="me-2">2</Badge>
              Готовится
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="👨‍🍳 Ваш заказ готовится"
              value={messagesForm.msg_preparing}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_preparing: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: 👨‍🍳 Ваш заказ готовится</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="info" className="me-2">3</Badge>
              Доставляется
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="🚗 Ваш заказ в пути"
              value={messagesForm.msg_delivering}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_delivering: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: 🚗 Ваш заказ в пути</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="success" className="me-2">4</Badge>
              Доставлен
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="✅ Ваш заказ доставлен!"
              value={messagesForm.msg_delivered}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_delivered: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: ✅ Ваш заказ доставлен!</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              <Badge bg="danger" className="me-2">✕</Badge>
              Отменён
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="❌ Заказ отменен"
              value={messagesForm.msg_cancelled}
              onChange={(e) => setMessagesForm({ ...messagesForm, msg_cancelled: e.target.value })}
            />
            <Form.Text className="text-muted">По умолчанию: ❌ Заказ отменен</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowMessagesModal(false)}>{t('saCancel')}</Button>
          <Button variant="primary" onClick={handleSaveMessages} disabled={savingMessages}>
            {savingMessages ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Category Modal */}
      <Modal show={showCategoryModal} onHide={() => setShowCategoryModal(false)}>
          <Modal.Header closeButton>
          <Modal.Title>
            {categoryForm.id ? 'Редактировать категорию' : 'Добавить категорию'}
            <div className="text-muted" style={{ fontSize: '0.9rem' }}>
              Уровень {editingLevel + 1} из {CATEGORY_LEVEL_COUNT}
            </div>
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={saveCategory}>
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
                    handleImageUpload(file, (url) => setCategoryForm({ ...categoryForm, image_url: url }));
                  }
                }}
                disabled={uploadingImage}
              />
              {categoryForm.image_url && (
                <div className="mt-2 text-center border p-2 rounded bg-light">
                  <img
                    src={categoryForm.image_url}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'cover' }}
                  />
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger d-block w-100 mt-2 text-decoration-none"
                    onClick={() => setCategoryForm({ ...categoryForm, image_url: '' })}
                  >
                    Удалить изображение
                  </Button>
                </div>
              )}
              {uploadingImage && <div className="text-muted mt-2"><small>Загрузка изображения...</small></div>}
              <Form.Text className="text-muted mt-2 d-block">Или введите URL изображения:</Form.Text>
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
              </Form.Label>
              <Form.Control
                required
                type="number"
                min="0"
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) || 0 })}
              />
              <Form.Text className="text-muted">
                Категории с меньшим числом отображаются первыми.
                <br />
                <span className="text-secondary opacity-75">Рекомендуемый свободный номер: <strong>{getNextAvailableSortOrder(categoryForm.parent_id)}</strong></span>
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCategoryModal(false)}>{t('saCancel')}</Button>
            <Button variant="primary" type="submit">{t('saSave')}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
      {/* Topup Modal */}
      <Modal show={showTopupModal} onHide={() => setShowTopupModal(false)} centered className="admin-modal">
        <Modal.Header closeButton>
          <Modal.Title>{t('topupRestaurantBalance')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {topupRestaurant && (
            <div className="mb-4 p-3 bg-light rounded-3 d-flex align-items-center gap-3">
              <div className="fs-1">💰</div>
              <div>
                <h6 className="mb-1 fw-bold">{topupRestaurant.name}</h6>
                <div className="text-muted small">{t('currentBalance')}: {parseFloat(topupRestaurant.balance).toLocaleString()} {t('sum')}</div>
              </div>
            </div>
          )}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold text-muted text-uppercase">{t('amountToTopup')}</Form.Label>
            <Form.Control
              type="text"
              inputMode="numeric"
              className="form-control-custom"
              placeholder="100000"
              value={formatThousands(topupForm.amount)}
              onChange={handleTopupAmountChange}
            />
          </Form.Group>
          <Form.Group className="mb-0">
            <Form.Label className="small fw-bold text-muted text-uppercase">{t('topupDescription')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              className="form-control-custom"
              placeholder="Например: Оплата наличными в офисе"
              value={topupForm.description}
              onChange={e => setTopupForm({ ...topupForm, description: e.target.value })}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowTopupModal(false)}>{t('cancel')}</Button>
          <Button className="btn-primary-custom px-4" onClick={handleTopup}>{t('topupAction')}</Button>
        </Modal.Footer>
      </Modal>

    </div>
  );
}

export default SuperAdminDashboard;

