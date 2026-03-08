import React, { useState, useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/SkeletonUI';
import ClientEmptyState from '../components/ClientEmptyState';
import ClientTopBar from '../components/ClientTopBar';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Feedback() {
  const { user } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  
  const [feedbackForm, setFeedbackForm] = useState({ type: 'complaint', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [myFeedback, setMyFeedback] = useState([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

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
      setError('');
      setShowFeedbackModal(false);
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

  const openFeedbackModal = () => {
    setError('');
    setShowFeedbackModal(true);
  };

  const closeFeedbackModal = () => {
    setShowFeedbackModal(false);
    setError('');
  };

  return (
    <div className="client-page">
      <ClientTopBar
        logoUrl={user?.active_restaurant_logo}
        logoDisplayMode={user?.active_restaurant_logo_display_mode}
        restaurantName={user?.active_restaurant_name || 'Tandoor'}
        language={language}
        onToggleLanguage={toggleLanguage}
        fallback="💬"
        maxWidth="600px"
        sticky
      />

      <Container className="client-content client-content--narrow">
        {success && <Alert variant="success" className="mb-3">{success}</Alert>}

        {/* My Feedback History */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0">{language === 'uz' ? 'Mening murojaatlarim' : 'Мои обращения'}</h6>
          <Button variant="dark" size="sm" onClick={openFeedbackModal}>
            {language === 'uz' ? 'Yangi murojaat' : 'Новое обращение'}
          </Button>
        </div>
        
        {loadingFeedback ? (
          <ListSkeleton count={4} label={language === 'uz' ? 'Murojaatlar yuklanmoqda' : 'Загрузка обращений'} />
        ) : myFeedback.length === 0 ? (
          <ClientEmptyState
            emoji="📭"
            message={language === 'uz' ? 'Murojaatlar yo\'q' : 'Обращений пока нет'}
          />
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

        <div className="client-bottom-space" />
      </Container>

      <Modal show={showFeedbackModal} onHide={closeFeedbackModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>{language === 'uz' ? 'Yangi murojaat' : 'Новое обращение'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}

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

            <Form.Group>
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
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeFeedbackModal} disabled={loading}>
              {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading
                ? (language === 'uz' ? 'Yuborilmoqda...' : 'Отправка...')
                : (language === 'uz' ? 'Yuborish' : 'Отправить')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <BottomNav />
    </div>
  );
}

export default Feedback;
