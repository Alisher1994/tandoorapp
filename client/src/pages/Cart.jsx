import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import ListGroup from 'react-bootstrap/ListGroup';
import Badge from 'react-bootstrap/Badge';
import { useCart, formatPrice, formatQuantity, resolveQuantityStep } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import OrderReceipt from '../components/OrderReceipt';
import ClientLocationPicker from '../components/ClientLocationPicker';
import ClientEmptyState from '../components/ClientEmptyState';
import ClientTopBar from '../components/ClientTopBar';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toEnabledFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';
const deriveAddressTitle = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[0] || text;
};

function Cart() {
  const { cart, cartTotal, productTotal, containerTotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const hasSavedLocation = user?.last_latitude && user?.last_longitude;
  const savedCoordinates = hasSavedLocation ? `${user.last_latitude},${user.last_longitude}` : '';
  const activeRestaurantId = cart[0]?.restaurant_id || user?.active_restaurant_id || null;

  const [formData, setFormData] = useState({
    delivery_address: user?.last_address || '',
    delivery_coordinates: savedCoordinates,
    house: '',
    apartment: '',
    door_code: '',
    customer_name: user?.full_name || 'Клиент',
    customer_phone: user?.phone || '',
    payment_method: 'cash',
    comment: '',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_time: 'asap'
  });

  const [deliveryTimeMode, setDeliveryTimeMode] = useState('asap');
  const [fulfillmentType, setFulfillmentType] = useState('delivery');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [deliveryDistance, setDeliveryDistance] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryOutOfZone, setDeliveryOutOfZone] = useState(false);

  // Мои адреса
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showNewAddressModal, setShowNewAddressModal] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({ name: '', address: '' });
  const [mapAddressMeta, setMapAddressMeta] = useState({ shortAddress: '', fullAddress: '' });
  const [showConfirmOrderModal, setShowConfirmOrderModal] = useState(false);
  const [cardCopyNotice, setCardCopyNotice] = useState(false);
  const [typedReceiptInstruction, setTypedReceiptInstruction] = useState('');
  const [receiptInstructionBlink, setReceiptInstructionBlink] = useState(false);
  const [showShopHoursModal, setShowShopHoursModal] = useState(false);
  const [shopHoursMessage, setShopHoursMessage] = useState('');

  const themePrimaryTextStyle = { color: 'var(--primary-color)' };
  const paymentButtonStyle = (isActive) => ({
    backgroundColor: isActive ? 'var(--primary-color)' : 'var(--surface-color, #ffffff)',
    borderColor: isActive ? 'var(--primary-color)' : 'var(--border-color, #d1d5db)',
    color: isActive ? '#fff' : 'var(--text-color, #111827)'
  });
  const isCashEnabled = useMemo(
    () => (restaurant?.cash_enabled === undefined || restaurant?.cash_enabled === null
      ? true
      : toEnabledFlag(restaurant?.cash_enabled)),
    [restaurant?.cash_enabled]
  );
  const onlinePaymentOptions = useMemo(() => ([
    { key: 'click', url: restaurant?.click_url, logo: '/click.png', alt: 'Click' },
    {
      key: 'payme',
      url: restaurant?.payme_enabled ? restaurant?.payme_url : '',
      logo: '/payme.png',
      alt: 'Payme',
      isServerCheckout: Boolean(restaurant?.payme_enabled)
    },
    { key: 'uzum', url: restaurant?.uzum_url, logo: '/uzum.png', alt: 'Uzum' },
    { key: 'xazna', url: restaurant?.xazna_url, logo: '/xazna.png', alt: 'Xazna' },
    {
      key: 'card',
      isCard: true,
      enabled: Boolean(restaurant?.card_payment_enabled),
      label: restaurant?.card_payment_title ? `💳 ${restaurant.card_payment_title}` : '💳 Карта'
    }
  ].filter((item) => item.isCard ? item.enabled : (item.isServerCheckout || Boolean(String(item.url || '').trim())))), [
    restaurant?.click_url,
    restaurant?.payme_enabled,
    restaurant?.payme_url,
    restaurant?.uzum_url,
    restaurant?.xazna_url,
    restaurant?.card_payment_enabled,
    restaurant?.card_payment_title
  ]);
  const availablePaymentMethods = useMemo(() => ([
    ...(isCashEnabled ? ['cash'] : []),
    ...onlinePaymentOptions.map((option) => option.key)
  ]), [isCashEnabled, onlinePaymentOptions]);
  const addressDetailsParts = useMemo(() => {
    const parts = [];
    if (String(formData.house || '').trim()) {
      parts.push(`${language === 'uz' ? 'uy' : 'дом'} ${String(formData.house).trim()}`);
    }
    if (String(formData.apartment || '').trim()) {
      parts.push(`${language === 'uz' ? 'kv' : 'кв'} ${String(formData.apartment).trim()}`);
    }
    if (String(formData.door_code || '').trim()) {
      parts.push(`${language === 'uz' ? 'kod' : 'код'} ${String(formData.door_code).trim()}`);
    }
    return parts;
  }, [formData.house, formData.apartment, formData.door_code, language]);
  const selectedSavedAddress = useMemo(
    () => savedAddresses.find((a) => a.id === selectedAddressId) || null,
    [savedAddresses, selectedAddressId]
  );
  const cardReceiptInstructionText = useMemo(() => (
    restaurant?.card_receipt_target === 'admin'
      ? (language === 'uz'
        ? "To'lovdan so'ng chekni administratorga yuboring."
        : 'После оплаты отправьте чек администратору.')
      : (language === 'uz'
        ? "To'lovdan so'ng chekni bot orqali yuboring."
        : 'После оплаты отправьте чек через бота.')
  ), [restaurant?.card_receipt_target, language]);
  const hasDistinctAddressLine = (addr) => {
    const name = String(addr?.name || '').trim().toLowerCase();
    const address = String(addr?.address || '').trim().toLowerCase();
    if (!address) return false;
    return address !== name;
  };

  // Ref for comment textarea for keyboard avoidance
  const commentRef = useRef(null);
  const errorAlertRef = useRef(null);
  const cardCopyTimeoutRef = useRef(null);
  const receiptTypingIntervalRef = useRef(null);
  const receiptBlinkTimeoutRef = useRef(null);

  // Keyboard avoidance - scroll to comment field when focused (works on iOS)
  const handleCommentFocus = () => {
    // Multiple attempts for iOS compatibility
    const scrollToInput = () => {
      if (commentRef.current) {
        // Get scroll container (#root for iOS fix)
        const scrollContainer = document.getElementById('root') || window;
        const rect = commentRef.current.getBoundingClientRect();

        // Calculate position to center the input in visible area
        const visualHeight = window.visualViewport?.height || window.innerHeight;
        const targetScroll = scrollContainer === window
          ? window.scrollY + rect.top - (visualHeight / 3)
          : scrollContainer.scrollTop + rect.top - (visualHeight / 3);

        if (scrollContainer === window) {
          window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        } else {
          scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }

        // Also use scrollIntoView as fallback
        commentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    // Initial scroll
    setTimeout(scrollToInput, 100);
    // Re-scroll after keyboard appears (iOS)
    setTimeout(scrollToInput, 300);
    setTimeout(scrollToInput, 500);
  };

  // Handle iOS visualViewport resize (keyboard open/close)
  useEffect(() => {
    const handleResize = () => {
      if (document.activeElement === commentRef.current) {
        setTimeout(() => {
          if (commentRef.current) {
            commentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);

  // Fetch restaurant info for receipt and delivery availability
  useEffect(() => {
    if (!activeRestaurantId) {
      setRestaurant(null);
      return;
    }

    let isMounted = true;

    const fetchRestaurant = async () => {
      try {
        const res = await axios.get(`${API_URL}/products/restaurant/${activeRestaurantId}`, {
          params: { _t: Date.now() },
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
          }
        });
        if (isMounted) {
          setRestaurant(res.data);
        }
      } catch (e) {
        console.error('Error fetching restaurant:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRestaurant();
      }
    };

    fetchRestaurant();
    const interval = setInterval(fetchRestaurant, 15000);
    window.addEventListener('focus', fetchRestaurant);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', fetchRestaurant);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeRestaurantId]);

  // Загрузка сохранённых адресов
  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/addresses`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSavedAddresses(res.data);

        // Если есть адрес по умолчанию и ещё не выбран адрес
        const defaultAddr = res.data.find(a => a.is_default);
        if (defaultAddr && !selectedAddressId) {
          selectAddress(defaultAddr);
        }
      } catch (e) {
        console.error('Error fetching addresses:', e);
      }
    };
    fetchAddresses();
  }, []);

  useEffect(() => {
    const selectedIsAvailable = availablePaymentMethods.includes(formData.payment_method);
    if (selectedIsAvailable) return;
    const fallbackMethod = availablePaymentMethods[0] || 'cash';
    setFormData((prev) => (
      prev.payment_method === fallbackMethod
        ? prev
        : { ...prev, payment_method: fallbackMethod }
    ));
  }, [formData.payment_method, availablePaymentMethods]);

  useEffect(() => {
    if (!showLocationModal) return;
    setMapAddressMeta({ shortAddress: '', fullAddress: '' });
  }, [showLocationModal]);

  // Выбор адреса из списка
  const selectAddress = (addr) => {
    setSelectedAddressId(addr.id);
    setFormData(prev => ({
      ...prev,
      delivery_address: addr.address,
      delivery_coordinates: addr.latitude && addr.longitude ? `${addr.latitude},${addr.longitude}` : ''
    }));
    setShowAddressModal(false);
  };

  // Сохранение нового адреса
  const saveNewAddress = async () => {
    const resolvedAddressName = String(newAddressForm.name || '').trim() || deriveAddressTitle(newAddressForm.address || formData.delivery_address);
    const resolvedAddressText = String(newAddressForm.address || '').trim() || String(formData.delivery_address || '').trim() || resolvedAddressName;
    if (!resolvedAddressName || !formData.delivery_coordinates) {
      setError(language === 'uz' ? 'Nom va koordinatalar kerak' : 'Укажите название и точку на карте');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const [lat, lng] = formData.delivery_coordinates.split(',').map(Number);

      const res = await axios.post(`${API_URL}/addresses`, {
        name: resolvedAddressName,
        address: resolvedAddressText,
        latitude: lat,
        longitude: lng,
        is_default: savedAddresses.length === 0
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSavedAddresses(prev => [...prev, res.data]);
      setSelectedAddressId(res.data.id);
      setShowNewAddressModal(false);
      setNewAddressForm({ name: '', address: '' });
    } catch (e) {
      console.error('Error saving address:', e);
      setError(language === 'uz' ? 'Manzilni saqlab bolmadi' : 'Ошибка сохранения адреса');
    }
  };

  // Удаление адреса
  const deleteAddress = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/addresses/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSavedAddresses(prev => prev.filter(a => a.id !== id));
      if (selectedAddressId === id) {
        setSelectedAddressId(null);
        setFormData(prev => ({ ...prev, delivery_address: '', delivery_coordinates: '' }));
      }
    } catch (e) {
      console.error('Error deleting address:', e);
    }
  };

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

  const isScheduledDateEnabled = restaurant?.is_scheduled_date_delivery_enabled === true;
  const scheduledMaxDays = Math.max(1, Math.trunc(Number(restaurant?.scheduled_delivery_max_days) || 7));

  const scheduledDateOptions = useMemo(() => {
    if (!isScheduledDateEnabled) return [];
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= scheduledMaxDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const value = `${yyyy}-${mm}-${dd}`;
      const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
      dates.push({ value, label: dayName });
    }
    return dates;
  }, [isScheduledDateEnabled, scheduledMaxDays]);

  useEffect(() => {
    if (deliveryTimeMode === 'scheduled') {
      setFormData(prev => ({ ...prev, delivery_time: availableTimes[0] || '' }));
    } else if (deliveryTimeMode === 'scheduled_date') {
      const firstDate = scheduledDateOptions[0]?.value || '';
      setFormData(prev => ({ ...prev, delivery_date: firstDate, delivery_time: 'asap' }));
    } else {
      setFormData(prev => ({ ...prev, delivery_time: 'asap', delivery_date: new Date().toISOString().split('T')[0] }));
    }
  }, [deliveryTimeMode, availableTimes, scheduledDateOptions]);

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
  const serviceFee = useMemo(() => {
    return toNumber(restaurant?.service_fee ?? user?.active_restaurant_service_fee ?? 0, 0);
  }, [restaurant?.service_fee, user?.active_restaurant_service_fee]);
  const isDeliveryEnabled = useMemo(() => {
    const flag = restaurant?.is_delivery_enabled ?? user?.active_restaurant_is_delivery_enabled;
    return toEnabledFlag(flag);
  }, [restaurant?.is_delivery_enabled, user?.active_restaurant_is_delivery_enabled]);
  const isDeliverySelected = isDeliveryEnabled && fulfillmentType === 'delivery';
  const effectiveDeliveryCost = isDeliverySelected ? deliveryCost : 0;
  const effectiveDeliveryDistance = isDeliverySelected ? deliveryDistance : 0;

  const minimumOrderAmount = useMemo(
    () => Math.max(0, toNumber(restaurant?.minimum_order_amount, 0)),
    [restaurant?.minimum_order_amount]
  );
  const meetsMinimumOrder = minimumOrderAmount <= 0 || productTotal + 1e-6 >= minimumOrderAmount;

  useEffect(() => {
    if (!isDeliveryEnabled) {
      setFulfillmentType('pickup');
      return;
    }
    setFulfillmentType((prev) => (prev === 'pickup' || prev === 'delivery' ? prev : 'delivery'));
  }, [isDeliveryEnabled]);

  useEffect(() => () => {
    if (cardCopyTimeoutRef.current) {
      clearTimeout(cardCopyTimeoutRef.current);
    }
    if (receiptTypingIntervalRef.current) {
      clearInterval(receiptTypingIntervalRef.current);
    }
    if (receiptBlinkTimeoutRef.current) {
      clearTimeout(receiptBlinkTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const shouldAnimateReceiptInstruction = (
      step === 3 &&
      formData.payment_method === 'card' &&
      Boolean(restaurant?.card_payment_enabled)
    );

    if (receiptTypingIntervalRef.current) {
      clearInterval(receiptTypingIntervalRef.current);
      receiptTypingIntervalRef.current = null;
    }
    if (receiptBlinkTimeoutRef.current) {
      clearTimeout(receiptBlinkTimeoutRef.current);
      receiptBlinkTimeoutRef.current = null;
    }

    if (!shouldAnimateReceiptInstruction) {
      setTypedReceiptInstruction(cardReceiptInstructionText);
      setReceiptInstructionBlink(false);
      return;
    }

    setTypedReceiptInstruction('');
    setReceiptInstructionBlink(false);

    let index = 0;
    receiptTypingIntervalRef.current = setInterval(() => {
      index += 1;
      setTypedReceiptInstruction(cardReceiptInstructionText.slice(0, index));
      if (index >= cardReceiptInstructionText.length) {
        clearInterval(receiptTypingIntervalRef.current);
        receiptTypingIntervalRef.current = null;
        setReceiptInstructionBlink(true);
        receiptBlinkTimeoutRef.current = setTimeout(() => {
          setReceiptInstructionBlink(false);
          receiptBlinkTimeoutRef.current = null;
        }, 950);
      }
    }, 32);
  }, [step, formData.payment_method, restaurant?.card_payment_enabled, cardReceiptInstructionText]);

  // Fetch delivery cost when coordinates change
  useEffect(() => {
    const fetchDeliveryCost = async () => {
      if (!mapCoordinates || !activeRestaurantId || !isDeliverySelected) {
        setDeliveryCost(0);
        setDeliveryDistance(0);
        setDeliveryOutOfZone(false);
        setDeliveryLoading(false);
        return;
      }

      setDeliveryLoading(true);
      try {
        const res = await axios.post(`${API_URL}/delivery/calculate`, {
          restaurant_id: activeRestaurantId,
          customer_lat: mapCoordinates.lat,
          customer_lng: mapCoordinates.lng
        });
        if (res.data?.disabled) {
          setDeliveryCost(0);
          setDeliveryDistance(0);
          setDeliveryOutOfZone(false);
          setRestaurant(prev => (prev ? { ...prev, is_delivery_enabled: false } : prev));
          return;
        }
        if (res.data?.out_of_zone) {
          setDeliveryCost(0);
          setDeliveryDistance(0);
          setDeliveryOutOfZone(true);
          setError(language === 'uz' ? 'Manzil yetkazib berish zonasidan tashqarida' : 'Адрес вне зоны доставки');
          return;
        }
        setDeliveryOutOfZone(false);
        setDeliveryCost(toNumber(res.data.delivery_cost, 0));
        setDeliveryDistance(toNumber(res.data.distance_km, 0));
      } catch (e) {
        console.error('Error fetching delivery cost:', e);
        setDeliveryCost(0);
        setDeliveryDistance(0);
        setDeliveryOutOfZone(false);
      } finally {
        setDeliveryLoading(false);
      }
    };

    fetchDeliveryCost();
  }, [mapCoordinates, activeRestaurantId, isDeliverySelected, language]);

  const useCurrentLocation = () => {
    setLocationLoading(true);
    setError('');
    // Try Telegram WebApp LocationManager first
    const tg = window.Telegram?.WebApp;
    const handleCoords = (lat, lng) => {
      setFormData(prev => ({
        ...prev,
        delivery_coordinates: `${lat},${lng}`
      }));
    };
    if (tg?.LocationManager) {
      tg.LocationManager.init(() => {
        if (tg.LocationManager.isInited && tg.LocationManager.isLocationAvailable) {
          tg.LocationManager.getLocation((location) => {
            if (location) {
              handleCoords(location.latitude, location.longitude);
            } else {
              setError('Не удалось получить геолокацию через Telegram');
            }
            setLocationLoading(false);
          });
        } else {
          fallbackToNavigatorGeolocation(handleCoords);
        }
      });
      return;
    }
    fallbackToNavigatorGeolocation(handleCoords);
  };

  const fallbackToNavigatorGeolocation = (onSuccess) => {
    const tryYandexGeolocation = async () => {
      if (!window.ymaps?.geolocation?.get) return false;

      try {
        const browserGeo = await window.ymaps.geolocation.get({
          provider: 'browser',
          mapStateAutoApply: false
        });
        const browserCoords = browserGeo?.geoObjects?.position;
        if (Array.isArray(browserCoords) && browserCoords.length === 2) {
          onSuccess(browserCoords[0], browserCoords[1]);
          return true;
        }
      } catch (_) {
        // ignore and fallback to yandex provider
      }

      try {
        const yandexGeo = await window.ymaps.geolocation.get({
          provider: 'yandex',
          mapStateAutoApply: false
        });
        const yandexCoords = yandexGeo?.geoObjects?.position;
        if (Array.isArray(yandexCoords) && yandexCoords.length === 2) {
          onSuccess(yandexCoords[0], yandexCoords[1]);
          return true;
        }
      } catch (_) {
        // ignore
      }

      return false;
    };

    if (!navigator.geolocation) {
      tryYandexGeolocation().then((resolved) => {
        if (!resolved) {
          setError('Геолокация не поддерживается');
          alert('Геолокация отключена или не поддерживается. Включите геолокацию в настройках устройства.');
        }
        setLocationLoading(false);
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (onSuccess) {
          onSuccess(pos.coords.latitude, pos.coords.longitude);
        }
        setLocationLoading(false);
      },
      async (err) => {
        console.error('Geolocation error:', err);
        const fallbackResolved = await tryYandexGeolocation();
        if (!fallbackResolved) {
          setError('Не удалось получить геолокацию. Разрешите доступ к местоположению.');
          alert('Не удалось получить геолокацию. Включите геолокацию в настройках устройства и разрешите доступ.');
        }
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (!error) return;

    const normalizedError = String(error).trim();
    const hoursMatch = normalizedError.match(/([0-2]\d:[0-5]\d)\D+([0-2]\d:[0-5]\d)/);
    const isShopHoursError = /магазин работает/i.test(normalizedError) || /do'?kon.*ishlaydi/i.test(normalizedError);
    if (hoursMatch || isShopHoursError) {
      const message = hoursMatch
        ? (language === 'uz'
          ? `Do'kon ${hoursMatch[1]} dan ${hoursMatch[2]} gacha ishlaydi`
          : `Магазин работает с ${hoursMatch[1]} по ${hoursMatch[2]}`)
        : (language === 'uz' ? "Do'kon hozir yopiq" : 'Магазин сейчас закрыт');
      setShopHoursMessage(message);
      setShowShopHoursModal(true);
      setError('');
      return;
    }

    setTimeout(() => {
      errorAlertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }, [error, language]);

  // Показать модалку подтверждения перед заказом
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (cart.length === 0) {
      setError('Корзина пуста');
      return;
    }

    if (availablePaymentMethods.length === 0) {
      setError(language === 'uz' ? "To'lov usuli mavjud emas" : 'Нет доступных способов оплаты');
      return;
    }

    if (!formData.customer_phone) {
      setError('Укажите номер телефона');
      return;
    }

    if (isDeliverySelected && !selectedAddressId) {
      setError(language === 'uz' ? 'Yetkazib berish manzilini tanlang' : 'Выберите адрес доставки');
      return;
    }

    if (isDeliverySelected && !hasLocation) {
      setError(language === 'uz' ? 'Xaritada manzilni belgilang' : 'Укажите адрес на карте');
      return;
    }

    if (isDeliverySelected && deliveryLoading) {
      setError(language === 'uz' ? 'Yetkazib berish narxi hisoblanmoqda, kuting' : 'Идёт расчёт стоимости доставки, подождите');
      return;
    }

    if (isDeliverySelected && deliveryOutOfZone) {
      setError(language === 'uz' ? 'Manzil yetkazib berish zonasidan tashqarida' : 'Адрес вне зоны доставки');
      return;
    }

    if (minimumOrderAmount > 0 && !meetsMinimumOrder) {
      setError(
        language === 'uz'
          ? `Minimal buyurtma (faqat mahsulotlar): ${formatPrice(minimumOrderAmount)} ${t('sum')}`
          : `Минимальная сумма заказа (товары): ${formatPrice(minimumOrderAmount)} ${t('sum')}`
      );
      return;
    }

    // Показываем модалку подтверждения адреса
    setShowConfirmOrderModal(true);
  };

  // Финальная отправка заказа после подтверждения
  const confirmAndSendOrder = async () => {
    setShowConfirmOrderModal(false);
    setLoading(true);

    try {
      if (isDeliverySelected && !selectedAddressId) {
        setError(language === 'uz' ? 'Yetkazib berish manzilini tanlang' : 'Выберите адрес доставки');
        return;
      }

      if (isDeliverySelected && !hasLocation) {
        setError(language === 'uz' ? 'Xaritada manzilni belgilang' : 'Укажите адрес на карте');
        return;
      }

      if (isDeliverySelected && deliveryLoading) {
        setError(language === 'uz' ? 'Yetkazib berish narxi hisoblanmoqda, kuting' : 'Идёт расчёт стоимости доставки, подождите');
        return;
      }

      if (isDeliverySelected && deliveryOutOfZone) {
        setError(language === 'uz' ? 'Manzil yetkazib berish zonasidan tashqarida' : 'Адрес вне зоны доставки');
        return;
      }

      if (minimumOrderAmount > 0 && !meetsMinimumOrder) {
        setError(
          language === 'uz'
            ? `Minimal buyurtma (faqat mahsulotlar): ${formatPrice(minimumOrderAmount)} ${t('sum')}`
            : `Минимальная сумма заказа (товары): ${formatPrice(minimumOrderAmount)} ${t('sum')}`
        );
        setLoading(false);
        return;
      }

      const restaurant_id = cart[0]?.restaurant_id || user?.active_restaurant_id;

      // Если нет адреса но есть локация - указываем что доставка по локации.
      // Детали адреса (дом/квартира/код) добавляем в ту же строку для операторов.
      const baseDeliveryAddress = !isDeliverySelected
        ? 'Самовывоз'
        : (formData.delivery_address || (hasLocation ? 'По геолокации' : ''));
      const deliveryAddress = !isDeliverySelected
        ? baseDeliveryAddress
        : [baseDeliveryAddress, addressDetailsParts.join(', ')].filter(Boolean).join(', ');

      const orderData = {
        items: cart.map(item => ({
          product_id: item.id,
          product_name: item.selected_variant ? `${item.name_ru} (${item.selected_variant})` : item.name_ru,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          container_name: item.container_name || null,
          container_price: item.container_price || 0,
          container_norm: item.container_norm || 1
        })),
        container_total: containerTotal,
        service_fee: serviceFee,
        delivery_cost: effectiveDeliveryCost,
        delivery_distance_km: effectiveDeliveryDistance,
        fulfillment_type: isDeliverySelected ? 'delivery' : 'pickup',
        restaurant_id,
        ...formData,
        delivery_address: deliveryAddress,
        delivery_coordinates: isDeliverySelected ? formData.delivery_coordinates : '',
        customer_name: formData.customer_name || user?.full_name || 'Клиент',
        delivery_date: formData.delivery_date || new Date().toISOString().split('T')[0]
      };

      console.log('📦 Sending order:', JSON.stringify(orderData, null, 2));

      const response = await axios.post(`${API_URL}/orders`, orderData);
      console.log('✅ Order created:', response.data);

      // Save order info for receipt BEFORE clearing cart
      const orderForReceipt = response.data.order || {
        order_number: response.data.order_number || 'N/A',
        total_amount: orderData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0),
        payment_method: orderData.payment_method
      };

      // Store items before clearing
      const itemsForReceipt = [...orderData.items];

      const selectedPaymentOption = onlinePaymentOptions.find((option) => option.key === formData.payment_method);
      let redirectUrl = selectedPaymentOption?.url || '';

      if (formData.payment_method === 'payme') {
        const checkoutResponse = await axios.get(`${API_URL}/payments/payme/checkout/${orderForReceipt.id}`);
        redirectUrl = checkoutResponse.data?.checkout_url || redirectUrl;
      }

      if (formData.payment_method === 'card' && orderForReceipt?.id) {
        try {
          const receiptLinkResponse = await axios.get(`${API_URL}/orders/${orderForReceipt.id}/receipt-link`);
          orderForReceipt.card_receipt_target = receiptLinkResponse.data?.target || 'bot';
          orderForReceipt.card_receipt_url = receiptLinkResponse.data?.url || '';
        } catch (receiptLinkError) {
          console.warn('Card receipt link resolve warning:', receiptLinkError?.response?.data || receiptLinkError?.message);
        }
      }

      // Открываем ссылку на оплату если выбран онлайн-способ и ссылка настроена
      if (redirectUrl) {
        clearCart();
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(redirectUrl);
        } else {
          window.location.assign(redirectUrl);
        }
        return;
      }

      clearCart();

      // Then show receipt
      setCreatedOrder(orderForReceipt);
      setOrderItems(itemsForReceipt);
      setShowReceipt(true);

      console.log('📋 Showing receipt:', orderForReceipt);
    } catch (err) {
      console.error('❌ Order error:', err);
      console.error('❌ Response:', err.response?.data);
      console.error('❌ Status:', err.response?.status);
      if (err.response?.status === 400 && err.response?.data?.code === 'MINIMUM_ORDER_NOT_MET') {
        const min = toNumber(err.response?.data?.minimum_order_amount, minimumOrderAmount);
        setError(
          language === 'uz'
            ? `Minimal buyurtma (faqat mahsulotlar): ${formatPrice(min)} ${t('sum')}`
            : `Минимальная сумма заказа (товары): ${formatPrice(min)} ${t('sum')}`
        );
        return;
      }
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Ошибка создания заказа';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleTopBarBack = () => {
    if (step > 1) {
      setStep((prev) => Math.max(1, prev - 1));
      return;
    }
    navigate(-1);
  };

  const handleProceedToFinalStep = () => {
    setError('');
    if (isDeliverySelected && !selectedAddressId) {
      setError(language === 'uz' ? 'Yetkazib berish manzilini tanlang' : 'Выберите адрес доставки');
      return;
    }
    if (isDeliverySelected && !hasLocation) {
      setError(language === 'uz' ? 'Xaritada manzilni belgilang' : 'Укажите адрес на карте');
      return;
    }
    if (isDeliverySelected && deliveryLoading) {
      setError(language === 'uz' ? 'Yetkazib berish narxi hisoblanmoqda, kuting' : 'Идёт расчёт стоимости доставки, подождите');
      return;
    }
    if (isDeliverySelected && deliveryOutOfZone) {
      setError(language === 'uz' ? 'Manzil yetkazib berish zonasidan tashqarida' : 'Адрес вне зоны доставки');
      return;
    }
    if (minimumOrderAmount > 0 && !meetsMinimumOrder) {
      setError(
        language === 'uz'
          ? `Minimal buyurtma (faqat mahsulotlar): ${formatPrice(minimumOrderAmount)} ${t('sum')}`
          : `Минимальная сумма заказа (товары): ${formatPrice(minimumOrderAmount)} ${t('sum')}`
      );
      return;
    }
    setStep(3);
  };

  const handleCopyCardNumber = async () => {
    const number = String(restaurant?.card_payment_number || '').trim();
    if (!number) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(number);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = number;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCardCopyNotice(true);
      if (cardCopyTimeoutRef.current) {
        clearTimeout(cardCopyTimeoutRef.current);
      }
      cardCopyTimeoutRef.current = setTimeout(() => setCardCopyNotice(false), 1800);
    } catch (copyError) {
      console.error('Copy card number error:', copyError);
    }
  };

  // Show receipt if order was created (even if cart is empty now)
  if (showReceipt) {
    const logoUrl = restaurant?.logo_url
      ? (restaurant.logo_url.startsWith('http') ? restaurant.logo_url : `${API_URL.replace('/api', '')}${restaurant.logo_url}`)
      : null;

    return (
      <OrderReceipt
        order={createdOrder}
        items={orderItems}
        cardPaymentInfo={createdOrder?.payment_method === 'card' ? {
          title: restaurant?.card_payment_title || '',
          number: restaurant?.card_payment_number || '',
          holder: restaurant?.card_payment_holder || '',
          receiptTarget: createdOrder?.card_receipt_target || restaurant?.card_receipt_target || 'bot',
          receiptUrl: createdOrder?.card_receipt_url || '',
          supportUsername: restaurant?.support_username || ''
        } : null}
        restaurantLogo={logoUrl}
        restaurantName={restaurant?.name}
        onClose={() => {
          setShowReceipt(false);
          navigate('/orders');
        }}
      />
    );
  }

  if (cart.length === 0) {
    return (
      <div className="client-page">
        <ClientTopBar
          logoUrl={restaurant?.logo_url || user?.active_restaurant_logo}
          logoDisplayMode={restaurant?.logo_display_mode || user?.active_restaurant_logo_display_mode}
          restaurantName={restaurant?.name || user?.active_restaurant_name || 'Tandoor'}
          language={language}
          showBackButton
          onBack={handleTopBarBack}
          onBrandClick={handleTopBarBack}
          showLanguageToggle={false}
          fallback="🍽️"
          maxWidth="500px"
          sticky
        />

        <Container className="client-content client-content--compact">
          <ClientEmptyState
            emoji="🛒"
            message={t('cartEmpty')}
            subMessage={t('cartEmptyDesc')}
          />
          <div style={{ height: 12 }} />
        </Container>
      </div>
    );
  }

  return (
    <div className="client-page">
      <style>{`
        .cart-addresses-sheet-modal {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          margin: 0 auto;
          width: min(500px, calc(100vw - 16px));
        }
        .cart-addresses-sheet-modal .modal-content {
          border-radius: 18px 18px 0 0;
          overflow: hidden;
        }
        @media (min-width: 576px) {
          .cart-addresses-sheet-modal {
            bottom: 8px;
            width: min(500px, calc(100vw - 32px));
          }
          .cart-addresses-sheet-modal .modal-content {
            border-radius: 18px;
          }
        }
        .cart-surface-field {
          background: #f8fafc !important;
          border: 1px solid rgba(71, 85, 105, 0.22) !important;
          border-radius: 12px !important;
          color: #111827;
          min-height: 44px;
        }
        .cart-surface-field:focus {
          border-color: rgba(71, 85, 105, 0.45) !important;
          box-shadow: 0 0 0 2px rgba(71, 85, 105, 0.08) !important;
          background: #fff !important;
        }
        .cart-surface-panel {
          background: #f8fafc !important;
          border: 1px solid rgba(71, 85, 105, 0.22) !important;
          border-radius: 12px !important;
        }
        .cart-segmented-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 6px;
          background: #f8fafc;
          border: 1px solid rgba(71, 85, 105, 0.22);
          border-radius: 12px;
        }
        .cart-segmented-option {
          width: 100%;
          border-radius: 10px !important;
          border: 1px solid rgba(71, 85, 105, 0.18) !important;
          background: #fff !important;
          color: #111827 !important;
          min-height: 40px;
        }
        .cart-segmented-option:hover,
        .cart-segmented-option:focus {
          background: #f9fafb !important;
          border-color: rgba(71, 85, 105, 0.26) !important;
          box-shadow: none !important;
        }
        .cart-segmented-option.is-active {
          background: rgba(71, 85, 105, 0.10) !important;
          border-color: rgba(71, 85, 105, 0.42) !important;
          color: #1f2937 !important;
          font-weight: 600;
        }
        .cart-card-copy-btn {
          width: 28px;
          height: 28px;
          border: 1px solid rgba(71, 85, 105, 0.28);
          border-radius: 8px;
          background: #fff;
          color: #0f172a;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          cursor: pointer;
        }
        .cart-summary-row {
          font-size: 0.82rem;
        }
        @keyframes cart-receipt-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        .cart-receipt-attention.is-blinking {
          animation: cart-receipt-blink 0.45s ease-in-out 2;
        }
        .cart-select-custom {
          background: #f8fafc !important;
          border: 1px solid rgba(71, 85, 105, 0.22) !important;
          border-radius: 12px !important;
          color: #111827 !important;
          min-height: 46px;
          box-shadow: none !important;
        }
        .cart-select-custom:focus {
          border-color: rgba(71, 85, 105, 0.45) !important;
          box-shadow: 0 0 0 2px rgba(71, 85, 105, 0.08) !important;
          background: #fff !important;
        }
      `}</style>
      <ClientTopBar
        logoUrl={restaurant?.logo_url || user?.active_restaurant_logo}
        logoDisplayMode={restaurant?.logo_display_mode || user?.active_restaurant_logo_display_mode}
        restaurantName={restaurant?.name || user?.active_restaurant_name || 'Tandoor'}
        language={language}
        showBackButton
        onBack={handleTopBarBack}
        onBrandClick={handleTopBarBack}
        showLanguageToggle={false}
        fallback="🍽️"
        maxWidth="500px"
        sticky
      />

      <Container className="client-content client-content--compact">
        {error && <Alert ref={errorAlertRef} variant="danger" className="py-2 mb-3">{error}</Alert>}

        {cart.length > 0 && minimumOrderAmount > 0 && !meetsMinimumOrder && (
          <Alert variant="warning" className="py-2 mb-3">
            {language === 'uz' ? (
              <>
                Minimal buyurtma: <strong>{formatPrice(minimumOrderAmount)} {t('sum')}</strong> (faqat mahsulotlar). Hozir:{' '}
                <strong>{formatPrice(productTotal)} {t('sum')}</strong>
              </>
            ) : (
              <>
                Минимальная сумма заказа: <strong>{formatPrice(minimumOrderAmount)} {t('sum')}</strong> (только товары). Сейчас:{' '}
                <strong>{formatPrice(productTotal)} {t('sum')}</strong>
              </>
            )}
          </Alert>
        )}

        {/* ШАГ 1: Список товаров */}
        {step === 1 && (
          <Card className="border-0 shadow-sm mb-3">
            <Card.Body className="p-0">
              {cart.map((item, index) => {
                const quantityStep = resolveQuantityStep(item);

                return (
                <div
                  key={item.id}
                  className={`d-flex align-items-center p-3 ${index !== cart.length - 1 ? 'border-bottom' : ''}`}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url.startsWith('http') ? item.image_url : `${API_URL.replace('/api', '')}${item.image_url}`}
                      alt={item.name_ru}
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }}
                    />
                  ) : (
                    <div
                      className="bg-light d-flex align-items-center justify-content-center"
                      style={{ width: 56, height: 56, borderRadius: 10, fontSize: '1.5rem' }}
                    >
                      🍽️
                    </div>
                  )}
                  <div className="flex-grow-1 ms-3">
                    <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{language === 'uz' && item.name_uz ? item.name_uz : item.name_ru}</div>
                    {item.selected_variant && (
                      <div className="small fw-semibold" style={{ color: '#166534' }}>
                        {language === 'uz' ? 'Variant' : 'Вариант'}: {item.selected_variant}
                      </div>
                    )}
                    <div className="fw-bold" style={themePrimaryTextStyle}>
                      {formatPrice(item.price)} {t('sum')}
                    </div>
                  </div>
                  <div className="d-flex align-items-center">
                    <div className="d-flex align-items-center bg-light rounded-pill">
                      <Button
                        variant="link"
                        className="p-1 px-2 text-dark text-decoration-none"
                        onClick={() => updateQuantity(item.id, item.quantity - quantityStep, item.selected_variant)}
                      >
                        −
                      </Button>
                      <span className="mx-1 fw-semibold" style={{ minWidth: 20, textAlign: 'center' }}>
                        {formatQuantity(item.quantity)}
                      </span>
                      <Button
                        variant="link"
                        className="p-1 px-2 text-dark text-decoration-none"
                        onClick={() => updateQuantity(item.id, item.quantity + quantityStep, item.selected_variant)}
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      variant="link"
                      className="text-danger p-1 ms-2"
                      onClick={() => removeFromCart(item.id, item.selected_variant)}
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
                );
              })}
            </Card.Body>
          </Card>
        )}

        {/* Комментарий - только на шаге 1 */}
        {step === 1 && (
          <Card className="border-0 shadow-sm mb-3">
            <Card.Body>
              <Form.Group>
                <Form.Label className="small text-muted mb-1">{t('comment')}</Form.Label>
                <Form.Control
                  ref={commentRef}
                  as="textarea"
                  rows={2}
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  onFocus={handleCommentFocus}
                  placeholder={t('commentPlaceholder')}
                  className="cart-surface-field"
                />
              </Form.Group>
            </Card.Body>
          </Card>
        )}

        {/* ШАГ 2/3: Оформление */}
        {(step === 2 || step === 3) && (
          <Form onSubmit={step === 3 ? handleSubmit : undefined}>
            <Card className="border-0 shadow-sm mb-3">
              <Card.Body>
                {step === 2 && (
                  <div className="mb-3">
                    <Form.Label className="small text-muted mb-1">
                      {language === 'uz' ? 'Buyurtma turi' : 'Тип заказа'}
                    </Form.Label>
                    {isDeliveryEnabled ? (
                      <div className="cart-segmented-switch">
                        <Button
                          type="button"
                          variant="light"
                          size="sm"
                          className={`cart-segmented-option ${fulfillmentType === 'delivery' ? 'is-active' : ''}`}
                          onClick={() => setFulfillmentType('delivery')}
                        >
                          🚚 {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}
                        </Button>
                        <Button
                          type="button"
                          variant="light"
                          size="sm"
                          className={`cart-segmented-option ${fulfillmentType === 'pickup' ? 'is-active' : ''}`}
                          onClick={() => setFulfillmentType('pickup')}
                        >
                          🚶‍♂️ {language === 'uz' ? "O'zingiz olib ketish" : 'Самовывоз'}
                        </Button>
                      </div>
                    ) : (
                      <div className="small text-muted px-3 py-2 cart-surface-panel">
                        🚶‍♂️ {language === 'uz' ? "Faqat o'zingiz olib ketish mavjud" : 'Доступен только самовывоз'}
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <>
                    {isDeliverySelected ? (
                      <>
                        <div className="mb-3">
                          <div className="small text-muted mb-2">{language === 'uz' ? 'Manzil' : 'Адрес доставки'}</div>

                          {selectedSavedAddress ? (
                            <div className="p-3 rounded mb-2 cart-surface-panel">
                              <div className="d-flex align-items-center">
                                <span className="me-2">📍</span>
                                <div className="flex-grow-1">
                                  <div className="small fw-semibold" style={{ color: '#16a34a' }}>
                                    {language === 'uz' ? 'Tanlandi' : 'Выбрано'}
                                  </div>
                                  <div className="fw-bold">{selectedSavedAddress.name}</div>
                                  {hasDistinctAddressLine(selectedSavedAddress) && (
                                    <div className="small text-muted">{selectedSavedAddress.address}</div>
                                  )}
                                </div>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="p-0 text-decoration-none fw-medium"
                                  style={{ ...themePrimaryTextStyle, whiteSpace: 'nowrap' }}
                                  onClick={() => setShowAddressModal(true)}
                                >
                                  {language === 'uz' ? 'Mening manzillarim' : 'Мои адреса'}
                                </Button>
                              </div>
                            </div>
                          ) : savedAddresses.length > 0 ? (
                            <div className="mb-2">
                              <div className="d-flex flex-wrap gap-2 mb-2">
                                {savedAddresses.slice(0, 3).map(addr => (
                                  <Button
                                    key={addr.id}
                                    variant="outline-secondary"
                                    size="sm"
                                    className="d-flex align-items-center"
                                    onClick={() => selectAddress(addr)}
                                  >
                                    {addr.name === 'Дом' || addr.name === 'Uy' ? '🏠' :
                                      addr.name === 'Работа' || addr.name === 'Ish' ? '💼' : '📍'} {addr.name}
                                  </Button>
                                ))}
                              </div>
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => setShowLocationModal(true)}
                              >
                                ➕ {language === 'uz' ? "Yangi manzil" : 'Новый адрес'}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="primary"
                              className="w-100"
                              onClick={() => setShowLocationModal(true)}
                              style={{ color: '#fff', fontWeight: 600 }}
                            >
                              + {language === 'uz' ? "Yangi manzil qo'shish" : 'Добавить новый адрес'}
                            </Button>
                          )}
                        </div>

                        <Form.Group className="mb-3">
                          <Form.Label className="small text-muted mb-1">
                            {language === 'uz' ? 'Manzil tafsilotlari' : 'Детали адреса'}
                          </Form.Label>
                          <div className="row g-2">
                            <div className="col-6">
                              <Form.Control
                                type="text"
                                value={formData.house}
                                onChange={(e) => setFormData({ ...formData, house: e.target.value })}
                                placeholder={language === 'uz' ? 'Uy' : 'Дом'}
                                className="cart-surface-field"
                              />
                            </div>
                            <div className="col-6">
                              <Form.Control
                                type="text"
                                value={formData.apartment}
                                onChange={(e) => setFormData({ ...formData, apartment: e.target.value })}
                                placeholder={language === 'uz' ? 'Kvartira' : 'Квартира'}
                                className="cart-surface-field"
                              />
                            </div>
                            <div className="col-12">
                              <Form.Control
                                type="text"
                                value={formData.door_code}
                                onChange={(e) => setFormData({ ...formData, door_code: e.target.value })}
                                placeholder={language === 'uz' ? 'Eshik kodi / domofon' : 'Код двери / домофон'}
                                className="cart-surface-field"
                              />
                            </div>
                          </div>
                        </Form.Group>
                      </>
                    ) : (
                      <div className="small text-muted px-3 py-2 mb-3 cart-surface-panel">
                        {language === 'uz'
                          ? "Samovozda manzil kiritish shart emas."
                          : 'Для самовывоза адрес заполнять не нужно.'}
                      </div>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                {/* Телефон */}
                <Form.Group className="mb-3">
                  <Form.Label className="small text-muted mb-1">
                    {t('phone')} <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="tel"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    placeholder="+998 90 123 45 67"
                    className="cart-surface-field"
                    required
                  />
                </Form.Group>

                {/* Время доставки */}
                <Form.Group className="mb-3">
                  <Form.Label className="small text-muted mb-1">{t('deliveryTime')}</Form.Label>
                  <div className="cart-segmented-switch">
                    <Button
                      type="button"
                      variant="light"
                      size="sm"
                      className={`cart-segmented-option ${deliveryTimeMode === 'asap' ? 'is-active' : ''}`}
                      onClick={() => setDeliveryTimeMode('asap')}
                    >
                      🚀 {t('asap')}
                    </Button>
                    <Button
                      type="button"
                      variant="light"
                      size="sm"
                      className={`cart-segmented-option ${deliveryTimeMode === 'scheduled' ? 'is-active' : ''}`}
                      onClick={() => setDeliveryTimeMode('scheduled')}
                    >
                      🕐 {t('scheduled')}
                    </Button>
                    {isScheduledDateEnabled && (
                      <Button
                        type="button"
                        variant="light"
                        size="sm"
                        className={`cart-segmented-option ${deliveryTimeMode === 'scheduled_date' ? 'is-active' : ''}`}
                        onClick={() => setDeliveryTimeMode('scheduled_date')}
                      >
                        📅 {language === 'uz' ? 'Sanani tanlash' : 'Выбрать дату'}
                      </Button>
                    )}
                  </div>
                  {deliveryTimeMode === 'scheduled' && (
                    <Form.Select
                      className="cart-select-custom mt-2"
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
                  {deliveryTimeMode === 'scheduled_date' && (
                    <div className="mt-2">
                      <Form.Select
                        className="cart-select-custom"
                        value={formData.delivery_date}
                        onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                      >
                        {scheduledDateOptions.length === 0 ? (
                          <option value="">{language === 'uz' ? 'Sana mavjud emas' : 'Нет доступных дат'}</option>
                        ) : (
                          scheduledDateOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))
                        )}
                      </Form.Select>
                      <small className="text-muted d-block mt-1">
                        {language === 'uz'
                          ? 'Buyurtma tanlangan kunigacha operatorda ko\'rinadi'
                          : 'Заказ будет у оператора до выбранной даты'}
                      </small>
                    </div>
                  )}
                </Form.Group>

                {/* Способ оплаты */}
                <Form.Group>
                  <Form.Label className="small text-muted mb-1">{t('paymentMethod')}</Form.Label>
                  <div className="d-flex flex-column gap-2">
                    {isCashEnabled && (
                      <Button
                        variant="light"
                        size="sm"
                        className="w-100"
                        style={paymentButtonStyle(formData.payment_method === 'cash')}
                        onClick={() => setFormData({ ...formData, payment_method: 'cash' })}
                      >
                        💵 {t('cash')}
                      </Button>
                    )}
                    {onlinePaymentOptions.length > 0 && (
                      <div className="d-flex gap-2 flex-wrap">
                        {onlinePaymentOptions.map((option) => (
                          <Button
                            key={option.key}
                            variant="light"
                            size="sm"
                            className="flex-fill d-flex align-items-center justify-content-center"
                            style={{
                              ...paymentButtonStyle(formData.payment_method === option.key),
                              minWidth: onlinePaymentOptions.length > 2 ? 'calc(50% - 4px)' : undefined
                            }}
                            onClick={() => setFormData({ ...formData, payment_method: option.key })}
                          >
                            {option.logo ? (
                              <img src={option.logo} alt={option.alt} style={{ height: 22, objectFit: 'contain' }} />
                            ) : (
                              <span>{option.label || option.key}</span>
                            )}
                          </Button>
                        ))}
                      </div>
                    )}
                    {!isCashEnabled && onlinePaymentOptions.length === 0 && (
                      <div className="small text-danger">
                        {language === 'uz'
                          ? "Bu do'konda to'lov usullari hozircha yo'q."
                          : 'В этом магазине сейчас нет доступных способов оплаты.'}
                      </div>
                    )}
                  </div>
                </Form.Group>

                {formData.payment_method === 'card' && restaurant?.card_payment_enabled && (
                  <div className="p-3 rounded-3 border bg-light">
                    <div className="d-flex align-items-center gap-2">
                      <div className="font-monospace fw-semibold">{restaurant.card_payment_number || '—'}</div>
                      <button
                        type="button"
                        className="cart-card-copy-btn"
                        onClick={handleCopyCardNumber}
                        aria-label={language === 'uz' ? 'Karta raqamini nusxalash' : 'Скопировать номер карты'}
                        title={language === 'uz' ? 'Nusxalash' : 'Скопировать'}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M5 1.5h7A1.5 1.5 0 0 1 13.5 3v8A1.5 1.5 0 0 1 12 12.5H5A1.5 1.5 0 0 1 3.5 11V3A1.5 1.5 0 0 1 5 1.5Z" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M2.5 4.5V13A1.5 1.5 0 0 0 4 14.5h7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    {cardCopyNotice && (
                      <div className="small text-success mt-1">
                        {language === 'uz' ? 'Karta nusxalandi' : 'Карта скопировано'}
                      </div>
                    )}
                    <div>{restaurant.card_payment_holder || '—'}</div>
                    <div className={`small text-danger mt-2 cart-receipt-attention ${receiptInstructionBlink ? 'is-blinking' : ''}`}>
                      {typedReceiptInstruction}
                    </div>
                  </div>
                )}
                  </>
                )}
              </Card.Body>
            </Card>
          </Form>
        )}

        {/* Итого и кнопки */}
        <Card className="border-0 shadow-sm">
          <Card.Body>
            {/* Детализация и итог только на финальном шаге */}
            {step === 3 && (
              <>
                <div className="d-flex justify-content-between align-items-center mb-1 cart-summary-row">
                  <span className="text-muted">🛒 {t('products')}:</span>
                  <span className="text-muted">{formatPrice(productTotal)} {t('sum')}</span>
                </div>

                {containerTotal > 0 && (
                  <div className="d-flex justify-content-between align-items-center mb-1 cart-summary-row">
                    <span className="text-muted">📦 {language === 'uz' ? 'Fasovka' : 'Фасовка'}:</span>
                    <span className="text-muted">{formatPrice(containerTotal)} {t('sum')}</span>
                  </div>
                )}

                {serviceFee > 0 && (
                  <div className="d-flex justify-content-between align-items-center mb-1 cart-summary-row">
                    <span className="text-muted">🛎 {language === 'uz' ? 'Xizmat' : 'Сервис'}:</span>
                    <span className="text-muted">{formatPrice(serviceFee)} {t('sum')}</span>
                  </div>
                )}

                {/* Доставка - показываем всегда когда есть координаты */}
                {isDeliverySelected && hasLocation && (
                  <div className="d-flex justify-content-between align-items-center mb-1 cart-summary-row">
                    <span className="text-muted">
                      🚗 {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}
                      {effectiveDeliveryDistance > 0 && <small className="ms-1">({effectiveDeliveryDistance} км)</small>}
                    </span>
                    <span className="text-muted">
                      {deliveryLoading ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        `${formatPrice(effectiveDeliveryCost)} ${t('sum')}`
                      )}
                    </span>
                  </div>
                )}

                {!isDeliverySelected && (
                  <div className="d-flex justify-content-between align-items-center mb-1 cart-summary-row">
                    <span className="text-muted">🚶‍♂️ {language === 'uz' ? "O'zingiz olib ketish" : 'Самовывоз'}</span>
                    <span className="text-muted">0 {t('sum')}</span>
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <div className="d-flex justify-content-between align-items-center mb-3 pt-2 border-top">
                <span className="text-muted fw-bold">{t('total')}:</span>
                <span className="fs-4 fw-bold" style={themePrimaryTextStyle}>{formatPrice(cartTotal + serviceFee + effectiveDeliveryCost)} {t('sum')}</span>
              </div>
            )}

            {step === 1 && (
              <Button
                variant="primary"
                size="lg"
                className="w-100"
                onClick={() => setStep(2)}
                disabled={!meetsMinimumOrder}
              >
                {t('next')} →
              </Button>
            )}

            {step === 2 && (
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  className="flex-fill"
                  onClick={() => setStep(1)}
                >
                  ← {t('back')}
                </Button>
                <Button
                  variant="primary"
                  className="flex-fill"
                  onClick={handleProceedToFinalStep}
                  disabled={!meetsMinimumOrder}
                >
                  {t('next')} →
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  className="flex-fill"
                  onClick={() => setStep(2)}
                >
                  ← {t('back')}
                </Button>
                <Button
                  variant="primary"
                  className="flex-fill"
                  onClick={handleSubmit}
                  disabled={loading || !meetsMinimumOrder}
                >
                  {loading ? <Spinner size="sm" /> : t('checkout')}
                </Button>
              </div>
            )}
          </Card.Body>
        </Card>

        {/* Модалка для выбора локации на карте (только карта) */}
        <Modal
          show={showLocationModal}
          onHide={() => setShowLocationModal(false)}
          fullscreen
          className="location-picker-modal"
        >
          <Modal.Header closeButton className="border-0 bg-white shadow-sm">
            <Modal.Title className="fs-5">📍 {language === 'uz' ? 'Yangi manzil' : 'Новый адрес'}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-0 d-flex flex-column">
            {/* Карта Яндекс */}
            <div className="flex-grow-1" style={{ minHeight: '300px' }}>
              <ClientLocationPicker
                latitude={mapCoordinates?.lat || 41.311081}
                longitude={mapCoordinates?.lng || 69.240562}
                onLocationChange={(lat, lng) => {
                  setFormData(prev => ({
                    ...prev,
                    delivery_coordinates: `${lat},${lng}`
                  }));
                }}
                onAddressChange={(addressText, meta = {}) => {
                  const fullAddress = String(meta?.fullAddress || addressText || '').trim();
                  const shortAddress = String(meta?.shortAddress || deriveAddressTitle(fullAddress)).trim();
                  setMapAddressMeta({
                    shortAddress,
                    fullAddress
                  });
                  setFormData(prev => ({
                    ...prev,
                    delivery_address: fullAddress || prev.delivery_address
                  }));
                }}
              />
            </div>

            {/* Кнопки внизу */}
            <div className="p-3 bg-white border-top">
              <Button
                variant="outline-secondary"
                className="w-100 mb-2"
                onClick={useCurrentLocation}
                disabled={locationLoading}
              >
                {locationLoading ? (
                  <><Spinner size="sm" className="me-2" />{language === 'uz' ? 'Aniqlanmoqda...' : 'Определение...'}</>
                ) : (
                  <>📍 {language === 'uz' ? 'Joriy joylashuvni aniqlash' : 'Определить моё местоположение'}</>
                )}
              </Button>
              <Button
                variant="primary"
                className="w-100"
                onClick={() => {
                  setShowLocationModal(false);
                  setNewAddressForm({
                    name: String(mapAddressMeta.shortAddress || deriveAddressTitle(formData.delivery_address)).trim(),
                    address: String(mapAddressMeta.fullAddress || formData.delivery_address || '').trim()
                  });
                  if (formData.delivery_coordinates) {
                    setShowNewAddressModal(true);
                  }
                }}
                disabled={!formData.delivery_coordinates}
              >
                ✓ {language === 'uz' ? 'Davom etish' : 'Продолжить'}
              </Button>
            </div>
          </Modal.Body>
        </Modal>

        {/* Модалка выбора из сохранённых адресов */}
        <Modal
          show={showAddressModal}
          onHide={() => setShowAddressModal(false)}
          dialogClassName="cart-addresses-sheet-modal"
          contentClassName="border-0 shadow-lg"
        >
          <Modal.Header closeButton className="border-0 pb-1">
            <div className="w-100">
              <div
                className="mx-auto mb-2"
                style={{ width: 44, height: 4, borderRadius: 999, background: '#d9d9d9' }}
              />
              <Modal.Title className="fs-5">📍 {language === 'uz' ? 'Mening manzillarim' : 'Мои адреса'}</Modal.Title>
            </div>
          </Modal.Header>
          <Modal.Body className="p-0" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <ListGroup variant="flush">
              {savedAddresses.map(addr => (
                <ListGroup.Item
                  key={addr.id}
                  action
                  className="d-flex align-items-center py-3 px-3"
                  onClick={() => selectAddress(addr)}
                >
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center me-3"
                    style={{
                      width: 44, height: 44,
                      background: addr.name === 'Дом' || addr.name === 'Uy' ? '#e8f4fd' :
                        addr.name === 'Работа' || addr.name === 'Ish' ? '#fef3e8' : '#f0f0f0'
                    }}
                  >
                    {addr.name === 'Дом' || addr.name === 'Uy' ? '🏠' :
                      addr.name === 'Работа' || addr.name === 'Ish' ? '💼' : '📍'}
                  </div>
                  <div className="flex-grow-1">
                    <div className="fw-bold">{addr.name}</div>
                    {hasDistinctAddressLine(addr) && (
                      <div className="text-muted small">{addr.address}</div>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2 ms-2">
                    {selectedAddressId === addr.id && (
                      <span
                        className="d-inline-flex align-items-center gap-1 small fw-semibold"
                        style={{ color: '#16a34a', lineHeight: 1.15 }}
                      >
                        <span>✓</span>
                        <span>{language === 'uz' ? 'Tanlandi' : 'Выбрано'}</span>
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="p-0 text-danger text-decoration-none"
                      title={language === 'uz' ? "Manzilni o'chirish" : 'Удалить адрес'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteAddress(addr.id);
                      }}
                    >
                      🗑️
                    </Button>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Modal.Body>
          <Modal.Footer className="border-0 pt-2">
            <Button
              variant="primary"
              className="w-100"
              onClick={() => {
                setShowAddressModal(false);
                setShowLocationModal(true);
              }}
            >
              <span className="fw-bold text-white me-2">+</span>
              <span>{language === 'uz' ? "Manzil qo'shish" : 'Добавить адрес'}</span>
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Модалка сохранения нового адреса */}
        <Modal show={showNewAddressModal} onHide={() => setShowNewAddressModal(false)} centered>
          <Modal.Header closeButton className="border-0">
          </Modal.Header>
          <Modal.Body>
            {(newAddressForm.address || formData.delivery_address) && (
              <div className="small text-muted mb-3">
                📍 {language === 'uz' ? 'Tanlangan manzil' : 'Выбранный адрес'}: {newAddressForm.address || formData.delivery_address}
              </div>
            )}
            <Form.Group className="mb-3">
              <Form.Label>{language === 'uz' ? 'Manzil nomi' : 'Название адреса'}</Form.Label>
              <Form.Control
                type="text"
                value={newAddressForm.name}
                onChange={(e) => setNewAddressForm({ ...newAddressForm, name: e.target.value })}
                placeholder={language === 'uz' ? 'Masalan: Uy, Ofis, Dacha' : 'Например: Дом, Офис, Дача'}
                className="cart-surface-field"
              />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                className="flex-fill"
                onClick={() => {
                  setShowNewAddressModal(false);
                  setNewAddressForm({ name: '', address: '' });
                }}
              >
                {language === 'uz' ? 'Saqlamaslik' : 'Не сохранять'}
              </Button>
              <Button
                variant="primary"
                className="flex-fill"
                onClick={saveNewAddress}
                disabled={
                  !String(newAddressForm.name || '').trim()
                  && !String(newAddressForm.address || formData.delivery_address || '').trim()
                }
              >
                {language === 'uz' ? 'Saqlash' : 'Сохранить'}
              </Button>
            </div>
          </Modal.Body>
        </Modal>

        {/* Модалка подтверждения заказа */}
        <Modal show={showConfirmOrderModal} onHide={() => setShowConfirmOrderModal(false)} centered>
          <Modal.Header closeButton className="border-0">
            <Modal.Title className="fs-5">✅ {language === 'uz' ? 'Buyurtmani tasdiqlang' : 'Подтвердите заказ'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {isDeliverySelected && (
              <Alert variant="warning" className="mb-3">
                <div className="fw-bold mb-1">📍 {language === 'uz' ? 'Yetkazib berish manzili' : 'Адрес доставки'}:</div>
                <div>
                  {selectedSavedAddress ? (
                    <>
                      <strong>{selectedSavedAddress.name}</strong>
                      {hasDistinctAddressLine(selectedSavedAddress) && (
                        <>
                          <br />
                          {selectedSavedAddress.address}
                        </>
                      )}
                    </>
                  ) : formData.delivery_address || (language === 'uz' ? 'Joriy joylashuv' : 'По геолокации')}
                  {addressDetailsParts.length > 0 && (
                    <>
                      <br />
                      <span className="small text-muted">{addressDetailsParts.join(', ')}</span>
                    </>
                  )}
                </div>
              </Alert>
            )}

            {!isDeliverySelected && (
              <Alert variant="info" className="mb-3 border-0 bg-light text-dark">
                <div className="fw-bold mb-1">🚶‍♂️ {language === 'uz' ? 'O\'zingiz olib ketish' : 'Самовывоз'}</div>
                <div className="small">Заказ будет готов в магазине. Подходите к кассе и назовите свое имя или телефон.</div>
              </Alert>
            )}

            <div className="mb-3">
              <div className="d-flex justify-content-between">
                <span>🛒 {language === 'uz' ? 'Mahsulotlar' : 'Товары'}:</span>
                <span>{formatPrice(productTotal)} {t('sum')}</span>
              </div>
              {containerTotal > 0 && (
                <div className="d-flex justify-content-between">
                  <span>📦 {language === 'uz' ? 'Fasovka' : 'Фасовка'}:</span>
                  <span>{formatPrice(containerTotal)} {t('sum')}</span>
                </div>
              )}
              {serviceFee > 0 && (
                <div className="d-flex justify-content-between">
                  <span>🛎 {language === 'uz' ? 'Xizmat' : 'Сервис'}:</span>
                  <span>{formatPrice(serviceFee)} {t('sum')}</span>
                </div>
              )}
              {effectiveDeliveryCost > 0 && (
                <div className="d-flex justify-content-between">
                  <span>🚗 {language === 'uz' ? 'Yetkazib berish' : 'Доставка'}:</span>
                  <span>{formatPrice(effectiveDeliveryCost)} {t('sum')}</span>
                </div>
              )}
              <hr />
              <div className="d-flex justify-content-between fw-bold">
                <span>{t('total')}:</span>
                <span style={themePrimaryTextStyle}>{formatPrice(cartTotal + serviceFee + effectiveDeliveryCost)} {t('sum')}</span>
              </div>
            </div>

            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                className="flex-fill"
                onClick={() => setShowConfirmOrderModal(false)}
              >
                {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </Button>
              <Button
                variant="primary"
                className="flex-fill"
                onClick={confirmAndSendOrder}
                disabled={loading || (isDeliverySelected && deliveryLoading)}
              >
                {loading ? <Spinner size="sm" /> : (language === 'uz' ? 'Tasdiqlash' : 'Подтвердить')}
              </Button>
            </div>
          </Modal.Body>
        </Modal>

        <Modal
          show={showShopHoursModal}
          onHide={() => setShowShopHoursModal(false)}
          fullscreen
          centered
          backdrop="static"
          keyboard={false}
        >
          <Modal.Body className="d-flex flex-column justify-content-center align-items-center text-center p-4">
            <img
              src="/Cat playing animation.gif"
              alt="Cat playing animation"
              style={{ width: 112, height: 112, objectFit: 'contain' }}
              className="mb-3"
            />
            <div className="fs-5 fw-bold mb-2">{shopHoursMessage || (language === 'uz' ? "Do'kon hozir yopiq" : 'Магазин сейчас закрыт')}</div>
            <div className="text-muted mb-4">{language === 'uz' ? 'Iltimos, keyinroq qayting.' : 'Вернитесь позже.'}</div>
            <Button
              variant="primary"
              className="px-5"
              onClick={() => setShowShopHoursModal(false)}
            >
              Ок
            </Button>
          </Modal.Body>
        </Modal>

        <div style={{ height: 12 }} />
      </Container>
    </div>
  );
}

export default Cart;
