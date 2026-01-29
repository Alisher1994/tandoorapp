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
import InputGroup from 'react-bootstrap/InputGroup';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// SVG Icons
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
    <path d="m15 5 4 4"/>
  </svg>
);

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    <path d="M3 6h18"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const ReceiptIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 16H8"/>
    <path d="M14 8H8"/>
    <path d="M16 12H8"/>
    <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>
  </svg>
);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
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
    in_stock: true
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
  
  // Broadcast state
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ message: '', image_url: '' });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastImageFile, setBroadcastImageFile] = useState(null);
  
  // Product filters and search
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
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
  
  const { user, logout, switchRestaurant, isSuperAdmin } = useAuth();
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
  
  const exportCategories = () => {
    exportToExcel(categories, 'categories', [
      { header: 'Название (RU)', accessor: (c) => c.name_ru },
      { header: 'Название (UZ)', accessor: (c) => c.name_uz },
      { header: 'Порядок', accessor: (c) => c.sort_order },
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

  const updateOrderStatus = async (orderId, newStatus, reason = null) => {
    try {
      await axios.patch(`${API_URL}/admin/orders/${orderId}/status`, { 
        status: newStatus,
        cancel_reason: reason 
      });
      fetchData();
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
      setBroadcastForm({ ...broadcastForm, image_url: res.data.imageUrl });
    } catch (error) {
      alert('Ошибка загрузки изображения');
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.message.trim()) {
      alert('Введите текст сообщения');
      return;
    }
    
    if (!window.confirm('Отправить рассылку всем клиентам?')) return;
    
    setBroadcastLoading(true);
    try {
      const res = await axios.post(`${API_URL}/admin/broadcast`, {
        message: broadcastForm.message,
        image_url: broadcastForm.image_url ? `${window.location.origin}${broadcastForm.image_url}` : null
      });
      
      setAlertMessage({ 
        type: 'success', 
        text: `Рассылка завершена! Отправлено: ${res.data.sent}, Ошибок: ${res.data.failed}` 
      });
      setShowBroadcastModal(false);
      setBroadcastForm({ message: '', image_url: '' });
      setBroadcastImageFile(null);
    } catch (error) {
      alert('Ошибка рассылки: ' + (error.response?.data?.error || error.message));
    } finally {
      setBroadcastLoading(false);
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
        in_stock: product.in_stock !== false
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
        in_stock: true
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
      const XLSX = await import('xlsx');
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
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
        <Container>
          <Navbar.Brand className="d-flex align-items-center">
            {user?.active_restaurant_logo ? (
              <img 
                src={user.active_restaurant_logo.startsWith('http') ? user.active_restaurant_logo : `${API_URL.replace('/api', '')}${user.active_restaurant_logo}`}
                alt="Logo"
                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, marginRight: 10 }}
              />
            ) : null}
            <span>Панель оператора</span>
            {user?.active_restaurant_name && (
              <Badge bg="light" text="dark" className="ms-2">{user.active_restaurant_name}</Badge>
            )}
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-end">
            <Nav>
              {/* Restaurant Switcher */}
              {user?.restaurants?.length > 1 && (
                <NavDropdown title="Переключить ресторан" id="restaurant-dropdown">
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
              
              {/* Broadcast button */}
              <Nav.Link onClick={() => setShowBroadcastModal(true)}>
                Рассылка
              </Nav.Link>
              
              {/* Super Admin Link */}
              {isSuperAdmin() && (
                <Nav.Link onClick={() => navigate('/superadmin')}>
                  Супер-админ
                </Nav.Link>
              )}
              
              <Nav.Link className="text-light">{user?.full_name || user?.username}</Nav.Link>
              
              {/* Language switcher with flag */}
              <Nav.Link onClick={toggleLanguage} className="d-flex align-items-center">
                <img 
                  src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
                  alt={language === 'ru' ? 'RU' : 'UZ'}
                  style={{ width: '28px', height: '20px', objectFit: 'cover', borderRadius: '3px', boxShadow: '0 1px 3px rgba(255,255,255,0.3)' }}
                />
              </Nav.Link>
              
              <Nav.Link onClick={handleLogout}>{t('logout')}</Nav.Link>
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
            ⚠️ Выберите ресторан для работы. 
            {user?.restaurants?.length > 0 && ' Используйте меню "Переключить ресторан" выше.'}
          </Alert>
        )}
        
        <Tabs defaultActiveKey="dashboard" className="mb-4">
          {/* Dashboard Tab */}
          <Tab eventKey="dashboard" title={t('dashboard')}>
            <Card className="mb-4">
              <Card.Body>
                {/* Filters */}
                <Row className="mb-4 g-3">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted">Год</Form.Label>
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
                      <Form.Label className="small text-muted">Месяц</Form.Label>
                      <Form.Select 
                        value={dashboardMonth} 
                        onChange={(e) => setDashboardMonth(parseInt(e.target.value))}
                      >
                        {[
                          { value: 1, label: 'Январь' },
                          { value: 2, label: 'Февраль' },
                          { value: 3, label: 'Март' },
                          { value: 4, label: 'Апрель' },
                          { value: 5, label: 'Май' },
                          { value: 6, label: 'Июнь' },
                          { value: 7, label: 'Июль' },
                          { value: 8, label: 'Август' },
                          { value: 9, label: 'Сентябрь' },
                          { value: 10, label: 'Октябрь' },
                          { value: 11, label: 'Ноябрь' },
                          { value: 12, label: 'Декабрь' },
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
                                <th className="text-end">Кол-во</th>
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
                            Нет данных за выбранный период
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
                <h5 className="mb-4">📈 Годовая аналитика за {dashboardYear} год</h5>
                
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
                              <h6 className="text-white-50 mb-1">Выручка за год</h6>
                              <h3 className="mb-0">{formatPrice(yearlyAnalytics.totalRevenue)} сум</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)' }}>
                          <Card.Body className="text-white">
                            <div>
                              <h6 className="text-white-50 mb-1">Заказов за год</h6>
                              <h3 className="mb-0">{yearlyAnalytics.totalOrders}</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)' }}>
                          <Card.Body className="text-white">
                            <div>
                              <h6 className="text-white-50 mb-1">Средний чек за год</h6>
                              <h3 className="mb-0">{formatPrice(yearlyAnalytics.averageCheck)} сум</h3>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                    
                    <Card className="border-0 shadow-sm mb-4">
                      <Card.Header className="bg-white border-0">
                        <h6 className="mb-0">Финансы по месяцам</h6>
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
                            {['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'].map((m, i) => (
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
                        <h6 className="mb-0">Доставленные заказы по месяцам</h6>
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
                            {['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'].map((m, i) => (
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
                    <Card className="border-0 shadow-sm mb-4">
                      <Card.Header className="bg-white border-0">
                        <h6 className="mb-0">Топ-5 товаров по месяцам</h6>
                      </Card.Header>
                      <Card.Body className="p-0">
                        <div style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          <div className="d-flex" style={{ minWidth: 'max-content' }}>
                            {['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'].map((monthName, monthIdx) => (
                              <div 
                                key={monthIdx} 
                                style={{ 
                                  minWidth: '200px', 
                                  maxWidth: '200px',
                                  borderRight: monthIdx < 11 ? '1px solid #dee2e6' : 'none'
                                }}
                                className="p-3"
                              >
                                <h6 className="text-center mb-3" style={{ 
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  color: 'white',
                                  padding: '8px',
                                  borderRadius: '8px',
                                  fontSize: '13px'
                                }}>
                                  {monthName}
                                </h6>
                                {yearlyAnalytics.topProductsByMonth[monthIdx]?.length > 0 ? (
                                  <div style={{ whiteSpace: 'normal' }}>
                                    {yearlyAnalytics.topProductsByMonth[monthIdx].map((product, idx) => (
                                      <div 
                                        key={idx} 
                                        className="d-flex align-items-center mb-2 p-2" 
                                        style={{ 
                                          background: idx === 0 ? '#fff3cd' : idx === 1 ? '#e2e3e5' : idx === 2 ? '#fce4d6' : '#f8f9fa',
                                          borderRadius: '6px',
                                          fontSize: '12px'
                                        }}
                                      >
                                        <Badge 
                                          bg={idx === 0 ? 'warning' : idx === 1 ? 'secondary' : idx === 2 ? 'danger' : 'light'}
                                          text={idx > 2 ? 'dark' : undefined}
                                          className="me-2"
                                        >
                                          {idx + 1}
                                        </Badge>
                                        <div style={{ overflow: 'hidden' }}>
                                          <div style={{ 
                                            overflow: 'hidden', 
                                            textOverflow: 'ellipsis',
                                            fontWeight: '500'
                                          }} title={product.name}>
                                            {product.name}
                                          </div>
                                          <small className="text-muted">
                                            {product.quantity} шт • {formatPrice(product.revenue)}
                                          </small>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center text-muted py-4" style={{ whiteSpace: 'normal', fontSize: '12px' }}>
                                    Нет данных
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </>
                )}
              </Card.Body>
            </Card>
          </Tab>
          
          <Tab eventKey="orders" title={t('orders')}>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <Form.Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ maxWidth: '200px' }}
                  >
                    <option value="all">{t('allStatuses')}</option>
                    <option value="new">{t('statusNew')}</option>
                    <option value="preparing">{t('statusPreparing')}</option>
                    <option value="delivering">{t('statusDelivering')}</option>
                    <option value="delivered">{t('statusDelivered')}</option>
                    <option value="cancelled">{t('statusCancelled')}</option>
                  </Form.Select>
                  <Button variant="outline-success" size="sm" onClick={exportOrders}>
                    {t('downloadExcel')}
                  </Button>
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
                        <td>{formatPrice(order.total_amount)} сум</td>
                        <td>{getStatusBadge(order.status)}</td>
                        <td>{new Date(order.created_at).toLocaleString('ru-RU')}</td>
                        <td>
                          <div className="d-flex gap-1">
                            <Button
                              className="btn-action"
                              size="sm"
                              onClick={() => openOrderModal(order)}
                              title="Детали"
                            >
                              <ReceiptIcon />
                            </Button>
                            {order.status !== 'cancelled' && order.status !== 'delivered' && (
                              <Button
                                className="btn-action"
                                size="sm"
                                onClick={() => openCancelModal(order.id)}
                                title="Отменить заказ"
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
              </Card.Body>
            </Card>
          </Tab>

          <Tab eventKey="products" title="Товары">
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">Товары</h5>
                  <div className="d-flex gap-2">
                    <Button variant="outline-secondary" size="sm" onClick={exportProducts}>
                      {t('downloadExcel')}
                    </Button>
                    <Button variant="outline-success" onClick={() => setShowExcelModal(true)}>
                      {t('importExcel')}
                    </Button>
                    <Button variant="primary" onClick={() => openProductModal()}>
                      {t('addProduct')}
                    </Button>
                  </div>
                </div>
                
                {/* Filters and Search */}
                <Row className="mb-3 g-2">
                  <Col md={4}>
                    <InputGroup size="sm">
                      <InputGroup.Text>🔍</InputGroup.Text>
                      <Form.Control
                        placeholder="Поиск по названию..."
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
                  <Col md={4}>
                    <Form.Select 
                      size="sm"
                      value={productCategoryFilter}
                      onChange={(e) => setProductCategoryFilter(e.target.value)}
                    >
                      <option value="all">Все категории</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name_ru}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={4}>
                    <Form.Select 
                      size="sm"
                      value={productStatusFilter}
                      onChange={(e) => setProductStatusFilter(e.target.value)}
                    >
                      <option value="all">Все статусы</option>
                      <option value="active">Активные</option>
                      <option value="hidden">Скрытые</option>
                    </Form.Select>
                  </Col>
                </Row>
                
                {/* Bulk actions bar */}
                {selectedProducts.length > 0 && (
                  <Alert variant="info" className="d-flex justify-content-between align-items-center py-2">
                    <span>Выбрано товаров: <strong>{selectedProducts.length}</strong></span>
                    <Button 
                      variant="danger" 
                      size="sm"
                      onClick={handleBulkDeleteProducts}
                    >
                      Удалить выбранные
                    </Button>
                  </Alert>
                )}
                
                <Table responsive hover>
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: '40px' }}>
                        <Form.Check 
                          type="checkbox"
                          checked={(() => {
                            const filteredIds = products
                              .filter(product => {
                                if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) return false;
                                if (productCategoryFilter !== 'all' && product.category_id !== parseInt(productCategoryFilter)) return false;
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
                                if (productCategoryFilter !== 'all' && product.category_id !== parseInt(productCategoryFilter)) return false;
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
                      <th style={{ width: '60px' }}>Фото</th>
                      <th>Название</th>
                      <th>Категория</th>
                      <th>Цена</th>
                      <th>Статус</th>
                      <th>Действия</th>
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
                        if (productCategoryFilter !== 'all' && product.category_id !== parseInt(productCategoryFilter)) {
                          return false;
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
                        <td>{product.category_name || '-'}</td>
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
                            className="btn-action me-1"
                            size="sm" 
                            onClick={() => openProductModal(product)}
                            title="Редактировать"
                          >
                            <EditIcon />
                          </Button>
                          <Button 
                            className="btn-action me-1"
                            size="sm"
                            onClick={() => duplicateProduct(product)}
                            title="Дублировать"
                          >
                            <CopyIcon />
                          </Button>
                          <Button 
                            className="btn-action"
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
                
                {/* Results count */}
                <div className="text-muted small">
                  Найдено: {products.filter(product => {
                    if (productSearch && !product.name_ru.toLowerCase().includes(productSearch.toLowerCase())) return false;
                    if (productCategoryFilter !== 'all' && product.category_id !== parseInt(productCategoryFilter)) return false;
                    if (productStatusFilter === 'active' && !product.in_stock) return false;
                    if (productStatusFilter === 'hidden' && product.in_stock) return false;
                    return true;
                  }).length} из {products.length}
                </div>
              </Card.Body>
            </Card>
          </Tab>

          <Tab eventKey="categories" title={t('categories')}>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5>{t('categories')}</h5>
                  <div className="d-flex gap-2">
                    <Button variant="outline-secondary" size="sm" onClick={exportCategories}>
                      {t('downloadExcel')}
                    </Button>
                    <Button variant="primary" onClick={() => openCategoryModal()}>
                      {t('add')}
                    </Button>
                  </div>
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
                            className="btn-action me-1"
                            size="sm" 
                            onClick={() => openCategoryModal(category)}
                            title="Редактировать"
                          >
                            <EditIcon />
                          </Button>
                          <Button 
                            className="btn-action"
                            size="sm"
                            onClick={() => handleDeleteCategory(category.id)}
                            title="Удалить"
                          >
                            <TrashIcon />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Tab>
          
          <Tab eventKey="feedback" title={
            <span>
              Обратная связь
              {feedbackStats.new_count > 0 && (
                <Badge bg="danger" className="ms-2">{feedbackStats.new_count}</Badge>
              )}
            </span>
          }>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5>Обращения клиентов</h5>
                  <div className="d-flex gap-2">
                    <Form.Select 
                      size="sm" 
                      style={{ width: 'auto' }}
                      value={feedbackFilter.type}
                      onChange={(e) => setFeedbackFilter({...feedbackFilter, type: e.target.value})}
                    >
                      <option value="">Все типы</option>
                      <option value="complaint">Жалоба</option>
                      <option value="suggestion">Предложение</option>
                      <option value="question">Вопрос</option>
                      <option value="other">Другое</option>
                    </Form.Select>
                    <Form.Select 
                      size="sm" 
                      style={{ width: 'auto' }}
                      value={feedbackFilter.status}
                      onChange={(e) => setFeedbackFilter({...feedbackFilter, status: e.target.value})}
                    >
                      <option value="">Все статусы</option>
                      <option value="new">Новый</option>
                      <option value="in_progress">В работе</option>
                      <option value="resolved">Решено</option>
                      <option value="closed">Закрыто</option>
                    </Form.Select>
                  </div>
                </div>
                
                {feedback.length === 0 ? (
                  <p className="text-muted text-center py-4">Обращений пока нет</p>
                ) : (
                  <Table responsive hover>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Клиент</th>
                        <th>Тип</th>
                        <th>Сообщение</th>
                        <th>Статус</th>
                        <th>Дата</th>
                        <th>Действия</th>
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
                              {fb.type === 'complaint' ? 'Жалоба' :
                               fb.type === 'suggestion' ? 'Предложение' :
                               fb.type === 'question' ? 'Вопрос' : 'Другое'}
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
                              {fb.status === 'new' ? 'Новый' :
                               fb.status === 'in_progress' ? 'В работе' :
                               fb.status === 'resolved' ? 'Решено' : 'Закрыто'}
                            </Badge>
                          </td>
                          <td>{new Date(fb.created_at).toLocaleDateString()}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <Button 
                              className="btn-action"
                              size="sm"
                              onClick={() => openFeedbackDetail(fb)}
                              title="Просмотр"
                            >
                              <EyeIcon />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
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
                      <option value="порция">порция</option>
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
                        ❌ Удалить
                      </Button>
                    </div>
                  ) : (
                    <div className="text-muted">
                      <div style={{ fontSize: '2rem' }}>📷</div>
                      <small>
                        Вставьте изображение (Ctrl+V)<br/>
                        или перетащите файл сюда
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
                    <small>⏳ Загрузка изображения...</small>
                  </div>
                )}
                <Form.Text className="text-muted">
                  Или введите URL:
                </Form.Text>
                <Form.Control
                  type="url"
                  value={productForm.image_url}
                  onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  label="Скрыть товар"
                  checked={!productForm.in_stock}
                  onChange={(e) => setProductForm({ ...productForm, in_stock: !e.target.checked })}
                />
                <Form.Text className="text-muted">
                  Если включено — товар не будет показываться клиентам.
                </Form.Text>
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

        {/* Broadcast Modal */}
        <Modal show={showBroadcastModal} onHide={() => setShowBroadcastModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>📢 Рассылка уведомлений</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info">
              Сообщение будет отправлено всем клиентам, которые делали заказы в вашем ресторане.
            </Alert>
            
            <Form.Group className="mb-3">
              <Form.Label>Фото (необязательно)</Form.Label>
              <div
                className="border rounded p-3 mb-2 text-center"
                style={{
                  borderStyle: 'dashed',
                  background: '#f8f9fa',
                  cursor: 'pointer',
                  minHeight: broadcastForm.image_url ? 'auto' : '100px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
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
              >
                {broadcastForm.image_url ? (
                  <>
                    <img 
                      src={broadcastForm.image_url} 
                      alt="Preview" 
                      style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }}
                      className="img-thumbnail mb-2"
                    />
                    <Button
                      variant="link"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBroadcastForm({ ...broadcastForm, image_url: '' });
                        setBroadcastImageFile(null);
                      }}
                    >
                      Удалить фото
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-muted mb-2">📸 Вставьте изображение (Ctrl+V)</div>
                    <div className="text-muted small">или перетащите файл сюда</div>
                  </>
                )}
              </div>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleBroadcastImageUpload}
                size="sm"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Текст сообщения *</Form.Label>
              <Form.Control
                as="textarea"
                rows={5}
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                placeholder="Напишите текст рассылки...&#10;&#10;Например:&#10;🎉 Скидка 20% на всё меню!&#10;Только сегодня!"
              />
              <Form.Text className="text-muted">
                Поддерживается форматирование: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;
              </Form.Text>
            </Form.Group>

            <Card className="bg-light">
              <Card.Body>
                <small className="text-muted">Предпросмотр:</small>
                <div className="mt-2 p-2 bg-white rounded">
                  {broadcastForm.image_url && (
                    <img 
                      src={broadcastForm.image_url} 
                      alt="Preview" 
                      style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain' }}
                      className="mb-2"
                    />
                  )}
                  <div>
                    <strong>📢 {user?.active_restaurant_name || 'Ресторан'}</strong>
                  </div>
                  <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>
                    {broadcastForm.message || 'Текст сообщения...'}
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowBroadcastModal(false)}>
              Отмена
            </Button>
            <Button 
              variant="primary" 
              onClick={sendBroadcast}
              disabled={broadcastLoading || !broadcastForm.message.trim()}
            >
              {broadcastLoading ? 'Отправка...' : '📢 Отправить рассылку'}
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Excel Import Modal */}
        <Modal show={showExcelModal} onHide={() => setShowExcelModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Импорт товаров из Excel</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info">
              <strong>Формат файла:</strong><br/>
              Первая строка — заголовки столбцов. Обязательные столбцы:<br/>
              • <code>Название (RU)</code> или <code>Название</code> — название товара<br/>
              • <code>Цена</code> — цена товара<br/>
              Дополнительные столбцы:<br/>
              • <code>Категория</code> — название категории<br/>
              • <code>Название (UZ)</code> — название на узбекском<br/>
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
      </Container>
    </>
  );
}

export default AdminDashboard;

