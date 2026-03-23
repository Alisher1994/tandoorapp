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

function ClientAccountModal({ show, onHide }) {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({ type: 'complaint', message: '' });
  const [feedbackSubmitError, setFeedbackSubmitError] = useState('');
  const [feedbackSubmitSuccess, setFeedbackSubmitSuccess] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const isUz = language === 'uz';

  const strings = useMemo(() => ({
    title: isUz ? 'Akkaunt' : 'Аккаунт',
    profile: isUz ? 'Mening profilim' : 'Мой профиль',
    fullName: isUz ? 'F.I.Sh.' : 'ФИО',
    phone: isUz ? 'Telefon raqami' : 'Номер телефона',
    notSpecified: isUz ? "Ko'rsatilmagan" : 'Не указано',
    systemLanguage: isUz ? 'Tizim tili' : 'Язык системы',
    orders: isUz ? 'Mening buyurtmalarim' : 'Мои заказы',
    feedback: isUz ? 'Shikoyatlar va takliflar' : 'Жалобы и предложения',
    emptyOrders: isUz ? "Hali buyurtmalar yo'q" : 'История заказов пока пуста',
    emptyFeedback: isUz ? "Murojaatlar hali yo'q" : 'Обращений пока нет',
    showDetails: isUz ? 'Batafsil' : 'Подробнее',
    hideDetails: isUz ? 'Yig\'ish' : 'Свернуть',
    orderItems: isUz ? 'Tarkib' : 'Состав',
    payment: isUz ? "To'lov" : 'Оплата',
    address: isUz ? 'Manzil' : 'Адрес',
    writeFeedback: isUz ? 'Yangi murojaat' : 'Новое обращение',
    feedbackType: isUz ? 'Murojaat turi' : 'Тип обращения',
    feedbackMessage: isUz ? 'Xabar' : 'Сообщение',
    feedbackPlaceholder: isUz ? 'Murojaatingizni yozing...' : 'Напишите ваше сообщение...',
    send: isUz ? 'Yuborish' : 'Отправить',
    sending: isUz ? 'Yuborilmoqda...' : 'Отправка...',
    adminResponse: isUz ? 'Administrator javobi' : 'Ответ администратора',
    feedbackRequired: isUz ? 'Xabar matnini kiriting.' : 'Введите текст обращения.',
    ordersLoadError: isUz ? "Buyurtmalarni yuklab bo'lmadi." : 'Не удалось загрузить историю заказов.',
    feedbackLoadError: isUz ? "Murojaatlarni yuklab bo'lmadi." : 'Не удалось загрузить обращения.',
    feedbackSendError: isUz ? 'Murojaat yuborilmadi.' : 'Не удалось отправить обращение.',
    feedbackSendSuccess: isUz ? 'Murojaat yuborildi.' : 'Обращение отправлено.',
    chooseLanguage: isUz ? 'Tilni tanlang' : 'Выберите язык'
  }), [isUz]);

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
    } catch (error) {
      setOrders([]);
      setOrdersError(strings.ordersLoadError);
    } finally {
      setLoadingOrders(false);
    }
  }, [strings.ordersLoadError]);

  const fetchFeedback = useCallback(async () => {
    setLoadingFeedback(true);
    setFeedbackError('');
    try {
      const response = await axios.get(`${API_URL}/orders/my-feedback`);
      setFeedbackItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setFeedbackItems([]);
      setFeedbackError(strings.feedbackLoadError);
    } finally {
      setLoadingFeedback(false);
    }
  }, [strings.feedbackLoadError]);

  useEffect(() => {
    if (!show) return;
    fetchOrders();
    fetchFeedback();
  }, [show, fetchOrders, fetchFeedback]);

  useEffect(() => {
    if (!show) {
      setExpandedOrderId(null);
      setFeedbackSubmitError('');
      setFeedbackSubmitSuccess('');
      setFeedbackForm({ type: 'complaint', message: '' });
    }
  }, [show]);

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

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      scrollable
      className="client-account-modal"
      dialogClassName="client-account-modal-dialog"
    >
      <Modal.Header closeButton className="border-0 pb-2">
        <Modal.Title className="fw-semibold">{strings.title}</Modal.Title>
      </Modal.Header>

      <Modal.Body className="pt-0 client-account-modal-body">
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

        <section className="client-account-section">
          <h6 className="client-account-section-title">{strings.systemLanguage}</h6>
          <div className="small text-muted mb-2">{strings.chooseLanguage}</div>
          <div className="client-account-language-grid">
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

        <section className="client-account-section">
          <div className="client-account-section-head">
            <h6 className="client-account-section-title mb-0">{strings.orders}</h6>
            {loadingOrders && <Spinner size="sm" animation="border" />}
          </div>

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
        </section>

        <section className="client-account-section">
          <div className="client-account-section-head">
            <h6 className="client-account-section-title mb-0">{strings.feedback}</h6>
            {loadingFeedback && <Spinner size="sm" animation="border" />}
          </div>

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
        </section>
      </Modal.Body>
    </Modal>
  );
}

export default ClientAccountModal;
