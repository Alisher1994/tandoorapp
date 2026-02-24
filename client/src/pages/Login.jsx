import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import deliveryTruckVideo from '../assets/animations/delivery-truck.mp4';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
    superadmin: 'Вход для суперадмина',
    customer: 'Вход для клиента'
  };

  const isRoleCompatibleWithPortal = (role, portal) => {
    if (!portal) return true;
    if (portal === 'customer') return role === 'customer';
    if (portal === 'admin') return role === 'operator' || role === 'superadmin';
    if (portal === 'operator') return role === 'operator' || role === 'superadmin';
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
    } else if (role === 'operator') {
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

  return (
    <Container className="d-flex justify-content-center align-items-center login-shell" style={{ minHeight: '100vh' }}>
      <Card style={{ width: '100%', maxWidth: '420px' }} className="shadow login-card">
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            {(loginPortal === 'admin' || loginPortal === 'operator' || loginPortal === 'superadmin' || loginPortal === 'customer') && (
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
              {loginPortal === 'admin' || loginPortal === 'operator' || loginPortal === 'superadmin'
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
              <Form.Control
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100 rounded-pill py-2 fw-semibold"
              disabled={loading}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
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
