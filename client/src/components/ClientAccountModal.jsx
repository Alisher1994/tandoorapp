import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Alert from 'react-bootstrap/Alert';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SCREEN_MENU = 'menu';
const SCREEN_PROFILE = 'profile';
const SCREEN_ORDERS = 'orders';
const SCREEN_FEEDBACK = 'feedback';
const LANGUAGE_OPTIONS = [
  {
    code: 'uz',
    flag: '/flags/uz.svg',
    labelRu: "O'zbekcha",
    labelUz: "O'zbekcha"
  },
  {
    code: 'ru',
    flag: '/flags/ru.svg',
    labelRu: 'Русский',
    labelUz: 'Ruscha'
  }
];

const normalizeOrderStatus = (status) => (
  String(status || '').toLowerCase() === 'in_progress' ? 'preparing' : String(status || '').toLowerCase()
);
const normalizeContainerNorm = (value, fallback = 1) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};
const resolveContainerUnits = (quantityValue, normValue) => {
  const quantity = Number.parseFloat(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.ceil(quantity / normalizeContainerNorm(normValue, 1));
};
const normalizeUsername = (value) => String(value || '').trim().replace(/^@+/, '');
const formatOwnerUsername = (value) => {
  const normalized = normalizeUsername(value);
  return normalized ? `@${normalized}` : '';
};

function MenuIcon({ type }) {
  if (type === 'profile') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a5 5 0 1 1 0 10a5 5 0 0 1 0-10Zm0 12c4.42 0 8 2.24 8 5v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1c0-2.76 3.58-5 8-5Z"
        />
      </svg>
    );
  }

  if (type === 'orders') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M6 2h12a2 2 0 0 1 2 2v16l-3-1.8L14 20l-2-1.8L10 20l-3-1.8L4 20V4a2 2 0 0 1 2-2Zm2 5v2h8V7H8Zm0 4v2h8v-2H8Z"
        />
      </svg>
    );
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 4v2h10V8H7Zm0 4v2h6v-2H7Z"
      />
    </svg>
  );
}

function ClientAccountModal({ show, onHide }) {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const isUz = language === 'uz';
  const [activeScreen, setActiveScreen] = useState(SCREEN_MENU);
  const [orders, setOrders] = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [restaurantOwner, setRestaurantOwner] = useState({ username: '', phone: '' });
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingOwner, setLoadingOwner] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [ownerLoaded, setOwnerLoaded] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({ type: 'complaint', message: '' });
  const [feedbackSubmitError, setFeedbackSubmitError] = useState('');
  const [feedbackSubmitSuccess, setFeedbackSubmitSuccess] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);

  const strings = useMemo(() => ({
    title: isUz ? 'Akkaunt' : 'Аккаунт',
    profile: isUz ? "Mening ma'lumotlarim" : 'Мои данные',
    orders: isUz ? 'Mening buyurtmalarim' : 'Мои заказы',
    feedback: isUz ? 'Shikoyatlar va takliflar' : 'Жалобы и предложения',
    systemLanguage: isUz ? 'Tizim tili' : 'Язык системы',
    operatorInfo: isUz ? "Do'kon operatori" : 'Оператор магазина',
    fullName: isUz ? 'F.I.Sh.' : 'ФИО',
    phone: isUz ? 'Telefon raqami' : 'Номер телефона',
    ownerUsername: isUz ? 'Operator username' : 'Username оператора',
    ownerPhone: isUz ? 'Operator telefoni' : 'Номер телефона оператора',
    notSpecified: isUz ? "Ko'rsatilmagan" : 'Не указано',
    emptyOrders: isUz ? "Hali buyurtmalar yo'q" : 'История заказов пока пуста',
    emptyFeedback: isUz ? "Murojaatlar hali yo'q" : 'Обращений пока нет',
    showDetails: isUz ? 'Batafsil' : 'Подробнее',
    hideDetails: isUz ? 'Yig\'ish' : 'Свернуть',
    orderItems: isUz ? 'Tarkib' : 'Состав',
    payment: isUz ? "To'lov" : 'Оплата',
    address: isUz ? 'Manzil' : 'Адрес',
    feedbackType: isUz ? 'Murojaat turi' : 'Тип обращения',
    feedbackMessage: isUz ? 'Xabar' : 'Сообщение',
    feedbackPlaceholder: isUz ? 'Murojaatingizni yozing...' : 'Напишите ваше сообщение...',
    send: isUz ? 'Yuborish' : 'Отправить',
    sending: isUz ? 'Yuborilmoqda...' : 'Отправка...',
    adminResponse: isUz ? 'Administrator javobi' : 'Ответ администратора',
    feedbackRequired: isUz ? 'Xabar matnini kiriting.' : 'Введите текст обращения.',
    ordersLoadError: isUz ? "Buyurtmalarni yuklab bo'lmadi." : 'Не удалось загрузить историю заказов.',
    feedbackLoadError: isUz ? "Murojaatlarni yuklab bo'lmadi." : 'Не удалось загрузить обращения.',
    ownerLoadError: isUz ? "Operator ma'lumotlarini yuklab bo'lmadi." : 'Не удалось загрузить данные оператора.',
    feedbackSendError: isUz ? 'Murojaat yuborilmadi.' : 'Не удалось отправить обращение.',
    feedbackSendSuccess: isUz ? 'Murojaat yuborildi.' : 'Обращение отправлено.',
    loading: isUz ? 'Yuklanmoqda...' : 'Загрузка...'
  }), [isUz]);

  const menuItems = useMemo(() => ([
    {
      key: SCREEN_PROFILE,
      title: strings.profile,
      icon: 'profile'
    },
    {
      key: SCREEN_ORDERS,
      title: strings.orders,
      icon: 'orders'
    },
    {
      key: SCREEN_FEEDBACK,
      title: strings.feedback,
      icon: 'feedback'
    }
  ]), [strings.profile, strings.orders, strings.feedback]);

  const screenTitleByKey = useMemo(() => ({
    [SCREEN_MENU]: strings.title,
    [SCREEN_PROFILE]: strings.profile,
    [SCREEN_ORDERS]: strings.orders,
    [SCREEN_FEEDBACK]: strings.feedback
  }), [strings.title, strings.profile, strings.orders, strings.feedback]);

  const formatDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(isUz ? 'uz-UZ' : 'ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resolveOrderStatus = (status) => {
    const normalized = normalizeOrderStatus(status);
    const statuses = {
      new: { variant: 'primary', label: isUz ? 'Yangi' : 'Новый' },
      preparing: { variant: 'warning', label: isUz ? 'Tayyorlanmoqda' : 'Готовится' },
      delivering: { variant: 'info', label: isUz ? 'Yetkazilmoqda' : 'Доставляется' },
      delivered: { variant: 'success', label: isUz ? 'Yetkazildi' : 'Доставлен' },
      cancelled: { variant: 'danger', label: isUz ? 'Bekor qilindi' : 'Отменен' }
    };
    return statuses[normalized] || { variant: 'secondary', label: normalized || '-' };
  };

  const resolveFeedbackType = (type) => {
    const key = String(type || '').toLowerCase();
    const types = {
      complaint: isUz ? 'Shikoyat' : 'Жалоба',
      suggestion: isUz ? 'Taklif' : 'Предложение',
      question: isUz ? 'Savol' : 'Вопрос',
      other: isUz ? 'Boshqa' : 'Другое'
    };
    return types[key] || key;
  };

  const resolveFeedbackTypeColor = (type) => {
    const key = String(type || '').toLowerCase();
    if (key === 'complaint') return 'danger';
    if (key === 'suggestion') return 'info';
    if (key === 'question') return 'warning';
    return 'secondary';
  };

  const resolveFeedbackStatus = (status) => {
    const key = String(status || '').toLowerCase();
    const statuses = {
      new: { color: 'primary', label: isUz ? 'Yangi' : 'Новый' },
      in_progress: { color: 'warning', label: isUz ? "Ko'rib chiqilmoqda" : 'В работе' },
      resolved: { color: 'success', label: isUz ? 'Hal qilindi' : 'Решено' },
      closed: { color: 'secondary', label: isUz ? 'Yopildi' : 'Закрыто' }
    };
    return statuses[key] || { color: 'secondary', label: key || '-' };
  };

  const resolvePaymentLabel = (method) => {
    const key = String(method || '').toLowerCase();
    if (key === 'cash') return isUz ? 'Naqd pul' : 'Наличные';
    if (key === 'card') return isUz ? 'Karta' : 'Карта';
    if (key === 'click') return 'Click';
    if (key === 'payme') return 'Payme';
    if (key === 'xazna') return 'Xazna';
    if (key === 'uzum') return 'Uzum';
    return method || '-';
  };

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrdersError('');
    try {
      const response = await axios.get(`${API_URL}/orders/my-orders`);
      setOrders(Array.isArray(response.data) ? response.data : []);
    } catch {
      setOrders([]);
      setOrdersError(strings.ordersLoadError);
    } finally {
      setLoadingOrders(false);
      setOrdersLoaded(true);
    }
  }, [strings.ordersLoadError]);

  const fetchFeedback = useCallback(async () => {
    setLoadingFeedback(true);
    setFeedbackError('');
    try {
      const response = await axios.get(`${API_URL}/orders/my-feedback`);
      setFeedbackItems(Array.isArray(response.data) ? response.data : []);
    } catch {
      setFeedbackItems([]);
      setFeedbackError(strings.feedbackLoadError);
    } finally {
      setLoadingFeedback(false);
      setFeedbackLoaded(true);
    }
  }, [strings.feedbackLoadError]);

  const fetchOwnerDetails = useCallback(async () => {
    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      setRestaurantOwner({ username: '', phone: '' });
      setOwnerLoaded(true);
      return;
    }

    setLoadingOwner(true);
    setOwnerError('');
    try {
      const response = await axios.get(`${API_URL}/products/restaurant/${restaurantId}`);
      // In client account footer we should show the configured support contact first.
      const ownerUsername = normalizeUsername(response.data?.support_username || response.data?.owner_username);
      const ownerPhone = String(response.data?.owner_phone || '').trim();
      setRestaurantOwner({
        username: ownerUsername,
        phone: ownerPhone
      });
    } catch {
      setRestaurantOwner({ username: '', phone: '' });
      setOwnerError(strings.ownerLoadError);
    } finally {
      setLoadingOwner(false);
      setOwnerLoaded(true);
    }
  }, [restaurantId, strings.ownerLoadError]);

  useEffect(() => {
    if (!show) return;
    setActiveScreen(SCREEN_MENU);
    setExpandedOrderId(null);
    setFeedbackSubmitError('');
    setFeedbackSubmitSuccess('');
    setFeedbackForm({ type: 'complaint', message: '' });
    setOrdersLoaded(false);
    setFeedbackLoaded(false);
    setOwnerLoaded(false);
  }, [show]);

  useEffect(() => {
    if (!show || activeScreen !== SCREEN_ORDERS || ordersLoaded) return;
    fetchOrders();
  }, [show, activeScreen, ordersLoaded, fetchOrders]);

  useEffect(() => {
    if (!show || activeScreen !== SCREEN_FEEDBACK || feedbackLoaded) return;
    fetchFeedback();
  }, [show, activeScreen, feedbackLoaded, fetchFeedback]);

  useEffect(() => {
    if (!show || ownerLoaded) return;
    fetchOwnerDetails();
  }, [show, ownerLoaded, fetchOwnerDetails]);

  const submitFeedback = async (event) => {
    event.preventDefault();
    const message = String(feedbackForm.message || '').trim();
    if (!message) {
      setFeedbackSubmitError(strings.feedbackRequired);
      setFeedbackSubmitSuccess('');
      return;
    }

    setSubmittingFeedback(true);
    setFeedbackSubmitError('');
    setFeedbackSubmitSuccess('');

    try {
      await axios.post(`${API_URL}/orders/feedback`, {
        type: feedbackForm.type,
        message
      });
      setFeedbackForm((prev) => ({ ...prev, message: '' }));
      setFeedbackSubmitSuccess(strings.feedbackSendSuccess);
      fetchFeedback();
    } catch (error) {
      setFeedbackSubmitError(error.response?.data?.error || strings.feedbackSendError);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const renderMenu = () => (
    <div className="client-account-menu">
      <div className="client-account-menu-list">
        {menuItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className="client-account-menu-item"
            onClick={() => setActiveScreen(item.key)}
          >
            <span className="client-account-menu-item-icon" aria-hidden="true">
              <MenuIcon type={item.icon} />
            </span>
            <span className="client-account-menu-item-title">{item.title}</span>
            <span className="client-account-menu-item-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      <section className="client-account-language-outside">
        <h6 className="client-account-language-outside-title">{strings.systemLanguage}</h6>
        <div className="client-account-language-grid client-account-language-grid-compact">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = language === option.code;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => setLanguage(option.code)}
                className={`client-account-language-btn ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
              >
                <img src={option.flag} alt={option.code.toUpperCase()} />
                <span>{isUz ? option.labelUz : option.labelRu}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="client-account-operator-footer">
        <div className="client-account-operator-title">{strings.operatorInfo}</div>
        {loadingOwner ? (
          <div className="client-account-loading">
            <Spinner size="sm" animation="border" />
            <span>{strings.loading}</span>
          </div>
        ) : (
          <>
            <div>
              {strings.ownerUsername}: <strong>{formatOwnerUsername(restaurantOwner.username) || strings.notSpecified}</strong>
            </div>
            <div>
              {strings.ownerPhone}: <strong>{restaurantOwner.phone || strings.notSpecified}</strong>
            </div>
            {ownerError && <div className="client-account-operator-error">{ownerError}</div>}
          </>
        )}
      </div>
    </div>
  );

  const renderProfileScreen = () => (
    <div className="client-account-screen">
      <section className="client-account-section">
        <h6 className="client-account-section-title">{strings.profile}</h6>
        <div className="client-account-profile-grid">
          <div className="client-account-field">
            <span>{strings.fullName}</span>
            <strong>{user?.full_name || user?.username || strings.notSpecified}</strong>
          </div>
          <div className="client-account-field">
            <span>{strings.phone}</span>
            <strong>{user?.phone || strings.notSpecified}</strong>
          </div>
        </div>
      </section>
    </div>
  );

  const renderOrdersScreen = () => (
    <div className="client-account-screen">
      {loadingOrders && (
        <div className="client-account-loading">
          <Spinner size="sm" animation="border" />
          <span>{strings.loading}</span>
        </div>
      )}

      {ordersError && <Alert variant="warning" className="py-2 mb-2">{ordersError}</Alert>}

      {!loadingOrders && orders.length === 0 && (
        <div className="client-account-empty">{strings.emptyOrders}</div>
      )}

      <div className="client-account-order-list">
        {orders.map((order) => {
          const status = resolveOrderStatus(order.status);
          const isExpanded = expandedOrderId === order.id;
          return (
            <div key={order.id} className="client-account-order-card">
              <button
                type="button"
                className="client-account-order-trigger"
                onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
              >
                <div className="client-account-order-main">
                  <div className="text-start">
                    <div className="client-account-order-number">#{order.order_number}</div>
                    <div className="client-account-order-date">{formatDateTime(order.created_at)}</div>
                  </div>
                  <div className="text-end">
                    <div className="client-account-order-total">
                      {formatPrice(order.total_amount)} {t('sum')}
                    </div>
                    <Badge bg={status.variant}>{status.label}</Badge>
                  </div>
                </div>
                <div className="client-account-order-toggle">
                  {isExpanded ? strings.hideDetails : strings.showDetails}
                </div>
              </button>

              {isExpanded && (
                <div className="client-account-order-details">
                  {Array.isArray(order.items) && order.items.length > 0 && (
                    <>
                      <div className="client-account-order-label">{strings.orderItems}</div>
                      {order.items.map((item, idx) => {
                        const lineTotal = Number(item.total) || (Number(item.quantity) * Number(item.price));
                        const containerPrice = Number(item.container_price) || 0;
                        const containerUnits = resolveContainerUnits(item.quantity, item.container_norm);
                        return (
                          <div key={`${order.id}-item-${idx}`} className="client-account-order-item">
                            <div className="client-account-order-item-row">
                              <span>{idx + 1}. {item.product_name} x {item.quantity}</span>
                              <span>{formatPrice(lineTotal)} {t('sum')}</span>
                            </div>
                            {containerPrice > 0 && containerUnits > 0 && (
                              <div className="client-account-order-item-extra">
                                {item.container_name || (isUz ? 'Idish' : 'Посуда')}: {containerUnits} x {formatPrice(containerPrice)} {t('sum')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}

                  <div className="client-account-order-meta">
                    <span>{strings.payment}: {resolvePaymentLabel(order.payment_method)}</span>
                    <span>{strings.address}: {order.delivery_address || '-'}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderFeedbackScreen = () => (
    <div className="client-account-screen">
      {loadingFeedback && (
        <div className="client-account-loading">
          <Spinner size="sm" animation="border" />
          <span>{strings.loading}</span>
        </div>
      )}

      <Form onSubmit={submitFeedback} className="client-account-feedback-form">
        <Form.Group className="mb-2">
          <Form.Label className="small mb-1">{strings.feedbackType}</Form.Label>
          <Form.Select
            size="sm"
            value={feedbackForm.type}
            onChange={(e) => setFeedbackForm((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="complaint">{isUz ? 'Shikoyat' : 'Жалоба'}</option>
            <option value="suggestion">{isUz ? 'Taklif' : 'Предложение'}</option>
            <option value="question">{isUz ? 'Savol' : 'Вопрос'}</option>
            <option value="other">{isUz ? 'Boshqa' : 'Другое'}</option>
          </Form.Select>
        </Form.Group>

        <Form.Group>
          <Form.Label className="small mb-1">{strings.feedbackMessage}</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            maxLength={600}
            value={feedbackForm.message}
            onChange={(e) => setFeedbackForm((prev) => ({ ...prev, message: e.target.value }))}
            placeholder={strings.feedbackPlaceholder}
          />
        </Form.Group>

        <div className="d-flex justify-content-between align-items-center mt-2">
          <small className="text-muted">{feedbackForm.message.length}/600</small>
          <Button type="submit" size="sm" disabled={submittingFeedback}>
            {submittingFeedback ? strings.sending : strings.send}
          </Button>
        </div>
      </Form>

      {feedbackSubmitError && <Alert variant="danger" className="py-2 mt-2 mb-2">{feedbackSubmitError}</Alert>}
      {feedbackSubmitSuccess && <Alert variant="success" className="py-2 mt-2 mb-2">{feedbackSubmitSuccess}</Alert>}
      {feedbackError && <Alert variant="warning" className="py-2 mb-2">{feedbackError}</Alert>}

      {!loadingFeedback && feedbackItems.length === 0 && (
        <div className="client-account-empty">{strings.emptyFeedback}</div>
      )}

      <div className="client-account-feedback-list">
        {feedbackItems.map((item) => {
          const status = resolveFeedbackStatus(item.status);
          return (
            <div key={item.id} className="client-account-feedback-card">
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <Badge bg={resolveFeedbackTypeColor(item.type)}>{resolveFeedbackType(item.type)}</Badge>
                <Badge bg={status.color}>{status.label}</Badge>
              </div>
              <div className="client-account-feedback-message">{item.message}</div>
              <div className="client-account-feedback-date">{formatDateTime(item.created_at)}</div>
              {item.admin_response && (
                <div className="client-account-feedback-response">
                  <small>{strings.adminResponse}</small>
                  <div>{item.admin_response}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCurrentScreen = () => {
    if (activeScreen === SCREEN_PROFILE) return renderProfileScreen();
    if (activeScreen === SCREEN_ORDERS) return renderOrdersScreen();
    if (activeScreen === SCREEN_FEEDBACK) return renderFeedbackScreen();
    return renderMenu();
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      fullscreen
      className="client-account-modal"
    >
      <Modal.Header className="client-account-modal-header border-0">
        {activeScreen === SCREEN_MENU ? (
          <span className="client-account-header-spacer" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="client-account-nav-btn"
            onClick={() => setActiveScreen(SCREEN_MENU)}
            aria-label={isUz ? 'Orqaga' : 'Назад'}
          >
            ←
          </button>
        )}

        <Modal.Title className="fw-semibold">{screenTitleByKey[activeScreen] || strings.title}</Modal.Title>

        <button
          type="button"
          className="client-account-nav-btn"
          onClick={onHide}
          aria-label={isUz ? 'Yopish' : 'Закрыть'}
        >
          ×
        </button>
      </Modal.Header>

      <Modal.Body className="client-account-modal-body">
        {renderCurrentScreen()}
      </Modal.Body>
    </Modal>
  );
}

export default ClientAccountModal;
