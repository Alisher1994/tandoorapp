import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      redirectBasedOnRole(user.role);
    }
  }, [user]);

  const redirectBasedOnRole = (role) => {
    if (role === 'superadmin') {
      navigate('/superadmin');
    } else if (role === 'operator') {
      navigate('/admin');
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    
    if (result.success) {
      // Login will set user, useEffect will handle redirect
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
            <div className="mb-3" style={{ fontSize: '3rem' }}>🍽️</div>
            <h2>Вход в систему</h2>
            <p className="text-muted">Введите ваши данные для входа</p>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Логин</Form.Label>
              <Form.Control
                type="text"
                placeholder="Введите логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
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
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100"
              disabled={loading}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </Form>

          <div className="text-center mt-4 pt-3 border-top">
            <small className="text-muted">
              <div className="mb-2">
                <strong>👤 Клиенты:</strong> Вход по ссылке из Telegram бота
              </div>
              <div className="mb-2">
                <strong>👨‍💼 Операторы:</strong> Логин выдается супер-админом
              </div>
              <div>
                <strong>🏢 Супер-админ:</strong> Используйте ADMIN_USERNAME
              </div>
            </small>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default Login;
