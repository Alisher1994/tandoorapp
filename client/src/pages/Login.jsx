import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import deliveryTruckVideo from '../assets/animations/delivery-truck.mp4';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotTimer, setForgotTimer] = useState(0);
  const [showAccountChoiceModal, setShowAccountChoiceModal] = useState(false);
  const [accountChoiceMessage, setAccountChoiceMessage] = useState('');
  const [accountChoices, setAccountChoices] = useState([]);
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const loginPortal = (searchParams.get('portal') || '').toLowerCase();
  const restaurantIdParam = searchParams.get('restaurantId') || searchParams.get('restaurant_id') || '';

  const portalTitles = {
    admin: 'Вход для администратора',
    operator: 'Вход для оператора',
    moderator: 'Вход для модератора',
    superadmin: 'Вход для суперадмина',
    customer: 'Вход для клиента'
  };

  const isRoleCompatibleWithPortal = (role, portal) => {
    if (!portal) return true;
    if (portal === 'customer') return role === 'customer';
    if (portal === 'admin') return role === 'operator' || role === 'moderator' || role === 'superadmin';
    if (portal === 'operator') return role === 'operator' || role === 'moderator' || role === 'superadmin';
    if (portal === 'moderator') return role === 'moderator' || role === 'superadmin';
    if (portal === 'superadmin') return role === 'superadmin';
    return true;
  };

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (!isRoleCompatibleWithPortal(user.role, loginPortal)) {
        setError(
          loginPortal === 'customer'
            ? 'Обнаружена активная сессия администратора. Выполняем выход для входа клиента...'
            : 'Обнаружена активная клиентская сессия. Выполняем выход для входа администратора...'
        );
        logout();
        return;
      }
      redirectBasedOnRole(user.role);
    }
  }, [user, loginPortal]);

  const redirectBasedOnRole = (role) => {
    if (role === 'superadmin') {
      navigate('/superadmin');
    } else if (role === 'operator' || role === 'moderator') {
      navigate('/admin');
    } else {
      navigate('/');
    }
  };

  const getAccountRoleLabel = (role) => {
    if (role === 'superadmin') return 'Суперадмин';
    if (role === 'operator') return 'Оператор';
    if (role === 'customer') return 'Клиент';
    return role || 'Аккаунт';
  };

  const buildLoginOptions = (extra = {}) => ({
    portal: loginPortal,
    restaurantId: restaurantIdParam,
    ...extra
  });

  const handleAccountChoice = async (accountId) => {
    setError('');
    setLoading(true);
    const result = await login(username, password, buildLoginOptions({ accountUserId: accountId }));
    if (result.success) {
      setShowAccountChoiceModal(false);
      setAccountChoices([]);
      setAccountChoiceMessage('');
    } else if (result.requiresAccountChoice) {
      setAccountChoices(result.accounts || []);
      setAccountChoiceMessage(result.message || 'Выберите аккаунт');
      setShowAccountChoiceModal(true);
    } else {
      setShowAccountChoiceModal(false);
      setError(result.error);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password, buildLoginOptions());
    
    if (result.success) {
      // Login will set user, useEffect will handle redirect
    } else if (result.requiresAccountChoice) {
      setAccountChoices(result.accounts || []);
      setAccountChoiceMessage(result.message || 'Выберите аккаунт');
      setShowAccountChoiceModal(true);
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (forgotTimer <= 0) return undefined;
    const timer = window.setInterval(() => {
      setForgotTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotTimer]);

  const requestForgotPasswordCode = async () => {
    if (!username.trim()) {
      setError('Введите логин, чтобы получить код в Telegram');
      return;
    }
    setError('');
    setForgotLoading(true);
    try {
      await axios.post(`${API_URL}/auth/forgot-password/request`, { username });
      setShowForgotPassword(true);
      setForgotTimer(120);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Не удалось отправить код');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotPasswordConfirm = async () => {
    if (!username.trim() || !forgotCode.trim() || !forgotNewPassword.trim()) {
      setError('Заполните логин, код и новый пароль');
      return;
    }
    setError('');
    setForgotLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password/verify`, {
        username,
        code: forgotCode.trim(),
        new_password: forgotNewPassword,
        portal: loginPortal
      });
      const { token, user: nextUser } = response.data || {};
      if (!token || !nextUser) {
        setError('Ошибка входа после подтверждения кода');
      } else {
        localStorage.setItem('token', token);
        localStorage.setItem('active_restaurant_id', String(nextUser?.active_restaurant_id || ''));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        window.location.reload();
      }
    } catch (confirmError) {
      setError(confirmError.response?.data?.error || 'Неверный код или пароль');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <Container className="d-flex justify-content-center align-items-center login-shell" style={{ minHeight: '100vh' }}>
      <Card style={{ width: '100%', maxWidth: '420px' }} className="shadow login-card">
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            {(loginPortal === 'admin' || loginPortal === 'operator' || loginPortal === 'moderator' || loginPortal === 'superadmin' || loginPortal === 'customer') && (
              <div className="mb-3">
                <span className="login-context-chip">
                  {loginPortal === 'customer' ? 'Client Portal' : 'Admin Portal'}
                </span>
              </div>
            )}
            <div
              className="mx-auto mb-3"
              style={{
                width: '100%',
                maxWidth: '180px',
                borderRadius: '14px',
                overflow: 'hidden',
                background: '#ffffff'
              }}
            >
              <video
                src={deliveryTruckVideo}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: '100%',
                  display: 'block',
                  maxHeight: '120px',
                  objectFit: 'cover'
                }}
              />
            </div>
            <h2>{portalTitles[loginPortal] || 'Вход в систему'}</h2>
            <p className="text-muted">
              {loginPortal === 'admin' || loginPortal === 'operator' || loginPortal === 'moderator' || loginPortal === 'superadmin'
                ? 'Введите данные администратора'
                : 'Введите ваши данные для входа'}
            </p>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Логин</Form.Label>
              <Form.Control
                type="text"
                placeholder="Введите номер телефона"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Пароль</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <Button
                  variant="outline-secondary"
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="login-password-toggle"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M10.59 10.58A2 2 0 0 0 13.41 13.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M9.88 5.08A10.94 10.94 0 0 1 12 4.88C17.52 4.88 21.27 9.5 22 12c-.25.85-.84 2.09-1.9 3.34" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M6.61 6.61C4.07 8.12 2.55 10.35 2 12c.73 2.5 4.48 7.12 10 7.12 1.89 0 3.57-.54 5-1.34" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M2 12c.73-2.5 4.48-7.12 10-7.12S21.27 9.5 22 12c-.73 2.5-4.48 7.12-10 7.12S2.73 14.5 2 12Z" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  )}
                </Button>
              </InputGroup>
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100 rounded-pill py-2 fw-semibold"
              disabled={loading}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
            <div className="d-flex justify-content-end mt-2">
              <button
                type="button"
                className="login-inline-link"
                onClick={requestForgotPasswordCode}
                disabled={forgotLoading}
              >
                Забыли пароль?
              </button>
            </div>
            {showForgotPassword && (
              <div className="login-forgot-panel mt-3">
                <div className="small text-muted mb-2">
                  Код отправлен в Telegram {forgotTimer > 0 ? `(осталось ${forgotTimer} сек.)` : '(код истек)'}
                </div>
                <Form.Control
                  className="mb-2"
                  placeholder="Код из Telegram"
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value)}
                />
                <Form.Control
                  className="mb-2"
                  type="password"
                  placeholder="Новый пароль"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                />
                <div className="d-flex gap-2">
                  <Button
                    variant="outline-secondary"
                    type="button"
                    onClick={requestForgotPasswordCode}
                    disabled={forgotLoading}
                  >
                    Отправить заново
                  </Button>
                  <Button
                    variant="primary"
                    type="button"
                    onClick={handleForgotPasswordConfirm}
                    disabled={forgotLoading || forgotTimer <= 0}
                  >
                    Подтвердить
                  </Button>
                </div>
              </div>
            )}
          </Form>

        </Card.Body>
      </Card>

      <Modal
        show={showAccountChoiceModal}
        onHide={() => !loading && setShowAccountChoiceModal(false)}
        centered
      >
        <Modal.Header closeButton={!loading}>
          <Modal.Title>Выберите аккаунт</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {accountChoiceMessage && (
            <Alert variant="info" className="mb-3">
              {accountChoiceMessage}
            </Alert>
          )}
          <div className="d-flex flex-column gap-2">
            {accountChoices.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={loading}
                onClick={() => handleAccountChoice(account.id)}
                className="text-start"
                style={{
                  border: '1px solid var(--border-color)',
                  background: 'var(--surface-color)',
                  borderRadius: 12,
                  padding: '12px 14px'
                }}
              >
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <strong>{getAccountRoleLabel(account.role)}</strong>
                  {account.active_restaurant_name && (
                    <span className="text-muted" style={{ fontSize: 12 }}>{account.active_restaurant_name}</span>
                  )}
                </div>
                <div className="small text-muted">
                  {account.full_name || account.username || '—'}
                </div>
                {account.phone && (
                  <div className="small text-muted">{account.phone}</div>
                )}
              </button>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAccountChoiceModal(false)} disabled={loading}>
            Отмена
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default Login;
