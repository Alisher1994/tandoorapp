import React, { useState, useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Feedback() {
  const { user } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  
  const [feedbackForm, setFeedbackForm] = useState({ type: 'complaint', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [myFeedback, setMyFeedback] = useState([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);

  useEffect(() => {
    fetchMyFeedback();
  }, []);

  const fetchMyFeedback = async () => {
    try {
      const response = await axios.get(`${API_URL}/orders/my-feedback`);
      setMyFeedback(response.data);
    } catch (err) {
      console.error('Error fetching feedback:', err);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!feedbackForm.message.trim()) {
      setError(language === 'uz' ? 'Xabar matnini kiriting' : 'Введите текст сообщения');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await axios.post(`${API_URL}/orders/feedback`, feedbackForm);
      setSuccess(language === 'uz' ? 'Murojaatingiz yuborildi. Rahmat!' : 'Ваше обращение отправлено. Спасибо!');
      setFeedbackForm({ type: 'complaint', message: '' });
      fetchMyFeedback();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(language === 'uz' ? 'Xatolik yuz berdi' : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type) => {
    const types = {
      complaint: language === 'uz' ? 'Shikoyat' : 'Жалоба',
      suggestion: language === 'uz' ? 'Taklif' : 'Предложение',
      question: language === 'uz' ? 'Savol' : 'Вопрос',
      other: language === 'uz' ? 'Boshqa' : 'Другое'
    };
    return types[type] || type;
  };

  const getStatusBadge = (status) => {
    const statuses = {
      new: { label: language === 'uz' ? 'Yangi' : 'Новый', color: 'primary' },
      in_progress: { label: language === 'uz' ? 'Ko\'rib chiqilmoqda' : 'В работе', color: 'warning' },
      resolved: { label: language === 'uz' ? 'Hal qilindi' : 'Решено', color: 'success' },
      closed: { label: language === 'uz' ? 'Yopildi' : 'Закрыто', color: 'secondary' }
    };
    return statuses[status] || { label: status, color: 'secondary' };
  };

  return (
    <>
      {/* Header */}
      <div style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 1000, 
        backgroundColor: '#f6f4ef',
        borderBottom: '1px solid var(--border-color)',
        padding: '12px 16px'
      }}>
        <Container style={{ maxWidth: '600px' }}>
          <div className="d-flex justify-content-between align-items-center">
            {user?.active_restaurant_logo ? (
              <img 
                src={user.active_restaurant_logo.startsWith('http') ? user.active_restaurant_logo : `${API_URL.replace('/api', '')}${user.active_restaurant_logo}`}
                alt="Logo" 
                height="36" 
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '1.5rem' }}>💬</span>
            )}
            <h5 className="mb-0">{language === 'uz' ? 'Shikoyat va takliflar' : 'Жалобы и предложения'}</h5>
            <button
              onClick={toggleLanguage}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer'
              }}
            >
              <img 
                src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
                alt={language === 'ru' ? 'RU' : 'UZ'}
                style={{ width: '28px', height: '20px', objectFit: 'cover', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
              />
            </button>
          </div>
        </Container>
      </div>

      <Container style={{ maxWidth: '600px', paddingTop: '16px', paddingBottom: '100px' }}>
        {/* New Feedback Form */}
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body>
            <h6 className="mb-3">{language === 'uz' ? 'Yangi murojaat' : 'Новое обращение'}</h6>
            
            {success && <Alert variant="success">{success}</Alert>}
            {error && <Alert variant="danger">{error}</Alert>}
            
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>{language === 'uz' ? 'Murojaat turi' : 'Тип обращения'}</Form.Label>
                <Form.Select
                  value={feedbackForm.type}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, type: e.target.value })}
                >
                  <option value="complaint">{language === 'uz' ? 'Shikoyat' : 'Жалоба'}</option>
                  <option value="suggestion">{language === 'uz' ? 'Taklif' : 'Предложение'}</option>
                  <option value="question">{language === 'uz' ? 'Savol' : 'Вопрос'}</option>
                  <option value="other">{language === 'uz' ? 'Boshqa' : 'Другое'}</option>
                </Form.Select>
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>{language === 'uz' ? 'Xabar' : 'Сообщение'} *</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder={language === 'uz' ? 'Xabaringizni yozing...' : 'Напишите ваше сообщение...'}
                  value={feedbackForm.message}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, message: e.target.value })}
                  required
                />
              </Form.Group>
              
              <Button variant="primary" type="submit" disabled={loading} className="w-100">
                {loading 
                  ? (language === 'uz' ? 'Yuborilmoqda...' : 'Отправка...') 
                  : (language === 'uz' ? 'Yuborish' : 'Отправить')}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        {/* My Feedback History */}
        <h6 className="mb-3">{language === 'uz' ? 'Mening murojaatlarim' : 'Мои обращения'}</h6>
        
        {loadingFeedback ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : myFeedback.length === 0 ? (
          <Card className="border-0 shadow-sm text-center py-4">
            <Card.Body>
              <div style={{ fontSize: '2rem' }}>📭</div>
              <p className="text-muted mb-0">
                {language === 'uz' ? 'Murojaatlar yo\'q' : 'Обращений пока нет'}
              </p>
            </Card.Body>
          </Card>
        ) : (
          myFeedback.map((fb) => {
            const status = getStatusBadge(fb.status);
            return (
              <Card key={fb.id} className="border-0 shadow-sm mb-3">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <span className={`badge bg-${fb.type === 'complaint' ? 'danger' : fb.type === 'suggestion' ? 'info' : 'secondary'}`}>
                      {getTypeLabel(fb.type)}
                    </span>
                    <span className={`badge bg-${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{fb.message}</p>
                  <small className="text-muted">
                    {new Date(fb.created_at).toLocaleDateString()}
                  </small>
                  
                  {fb.admin_response && (
                    <div className="mt-3 p-2 bg-light rounded">
                      <small className="text-muted d-block mb-1">
                        {language === 'uz' ? 'Javob:' : 'Ответ:'}
                      </small>
                      <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{fb.admin_response}</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            );
          })
        )}
      </Container>

      <BottomNav />
    </>
  );
}

export default Feedback;
