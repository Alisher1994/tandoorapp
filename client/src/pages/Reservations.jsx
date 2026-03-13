import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatPrice } from '../context/CartContext';
import ClientTopBar from '../components/ClientTopBar';
import BottomNav from '../components/BottomNav';
import { PageSkeleton } from '../components/SkeletonUI';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizePlanCoordinate = (value, fallback = 50) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed >= 0 && parsed <= 100) return parsed;
  if (parsed > 100 && parsed <= 1000) return clamp(parsed / 10, 0, 100);
  return clamp(parsed, 0, 100);
};
const toAbsoluteMediaUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = API_URL.replace('/api', '');
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
};
const todayDate = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
const currentHourTime = () => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const hh = String(now.getHours()).padStart(2, '0');
  return `${hh}:00`;
};

function Reservations() {
  const { user, isOperator } = useAuth();
  const { language, toggleLanguage } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [restaurant, setRestaurant] = useState(null);
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [bookingDate, setBookingDate] = useState(todayDate());
  const [startTime, setStartTime] = useState(currentHourTime());
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [guestsCount, setGuestsCount] = useState(2);
  const [bookingMode, setBookingMode] = useState('reservation_only');
  const [comment, setComment] = useState('');
  const [allowMultiTable, setAllowMultiTable] = useState(true);
  const [reservationFee, setReservationFee] = useState(0);
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [planScale, setPlanScale] = useState(1);
  const [planOffset, setPlanOffset] = useState({ x: 0, y: 0 });
  const [planPanStart, setPlanPanStart] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoTableName, setPhotoTableName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const restaurantId = useMemo(() => Number.parseInt(user?.active_restaurant_id, 10) || null, [user?.active_restaurant_id]);
  const selectedFloor = useMemo(() => floors.find((floor) => Number(floor.id) === Number(selectedFloorId)) || null, [floors, selectedFloorId]);
  const selectedFloorImageUrl = useMemo(() => toAbsoluteMediaUrl(selectedFloor?.image_url), [selectedFloor?.image_url]);
  const selectedTables = useMemo(() => tables.filter((table) => selectedTableIds.includes(Number(table.id))), [tables, selectedTableIds]);
  const totalSelectedCapacity = useMemo(() => selectedTables.reduce((sum, table) => sum + (Number.parseInt(table.capacity, 10) || 0), 0), [selectedTables]);
  const isCapacityEnough = totalSelectedCapacity >= guestsCount;

  const fetchAvailability = async (nextFloorId = selectedFloorId) => {
    if (!restaurantId || !nextFloorId || !bookingDate || !startTime) return;
    setLoadingAvailability(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/reservations/availability`, {
        params: { restaurant_id: restaurantId, floor_id: nextFloorId, date: bookingDate, start_time: startTime, duration_minutes: durationMinutes }
      });
      const payload = response.data || {};
      const nextTables = Array.isArray(payload.tables) ? payload.tables : [];
      setTables(nextTables);
      setAllowMultiTable(payload.allow_multi_table !== false);
      setReservationFee(Number.parseFloat(payload.reservation_fee) || 0);
      setSelectedTableIds((prev) => {
        const availableIds = new Set(nextTables.filter((t) => t.is_available).map((t) => Number(t.id)));
        const filtered = prev.filter((id) => availableIds.has(Number(id)));
        return payload.allow_multi_table === false && filtered.length > 1 ? filtered.slice(0, 1) : filtered;
      });
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? 'Stollarni yuklashda xatolik' : 'Ошибка загрузки столов'));
      setTables([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!restaurantId) return setLoading(false);
      setLoading(true);
      try {
        const [restaurantResponse, floorsResponse] = await Promise.all([
          axios.get(`${API_URL}/products/restaurant/${restaurantId}`),
          axios.get(`${API_URL}/reservations/floors`, { params: { restaurant_id: restaurantId } })
        ]);
        if (!isMounted) return;
        const nextFloors = Array.isArray(floorsResponse.data) ? floorsResponse.data : [];
        setRestaurant(restaurantResponse.data || null);
        setFloors(nextFloors);
        setSelectedFloorId(nextFloors[0]?.id ? Number(nextFloors[0].id) : null);
      } catch (err) {
        if (isMounted) setError(err.response?.data?.error || (language === 'uz' ? 'Maʼlumotlarni yuklashda xatolik' : 'Ошибка загрузки данных'));
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [restaurantId, language]);

  useEffect(() => {
    fetchAvailability();
  }, [selectedFloorId, bookingDate, startTime, durationMinutes, restaurantId]);

  useEffect(() => {
    setPlanScale(1);
    setPlanOffset({ x: 0, y: 0 });
    setPlanPanStart(null);
  }, [selectedFloorId]);

  const toggleTableSelection = (table) => {
    if (!table?.is_available) return;
    const tableId = Number(table.id);
    if (!Number.isInteger(tableId)) return;
    setSelectedTableIds((prev) => {
      if (prev.includes(tableId)) return prev.filter((id) => id !== tableId);
      return allowMultiTable ? [...prev, tableId] : [tableId];
    });
  };

  const submitReservation = async () => {
    if (!restaurantId) return;
    if (!selectedTableIds.length) return setError(language === 'uz' ? 'Kamida bitta stol tanlang' : 'Выберите хотя бы один стол');
    if (!isCapacityEnough) return setError(language === 'uz' ? 'Tanlangan stollar sig‘imi mehmonlar sonidan kam' : 'Вместимость выбранных столов меньше количества гостей');
    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await axios.post(`${API_URL}/reservations`, {
        restaurant_id: restaurantId,
        booking_date: bookingDate,
        start_time: startTime,
        duration_minutes: durationMinutes,
        table_ids: selectedTableIds,
        guests_count: guestsCount,
        booking_mode: bookingMode,
        comment
      });
      setSuccessMessage(response.data?.reservation?.reservation_number
        ? `${language === 'uz' ? 'Band qilindi' : 'Бронь создана'}: ${response.data.reservation.reservation_number}`
        : (language === 'uz' ? 'Band qilish muvaffaqiyatli yaratildi' : 'Бронирование успешно создано'));
      setSelectedTableIds([]);
      setComment('');
      fetchAvailability();
    } catch (err) {
      setError(err.response?.data?.error || (language === 'uz' ? 'Band qilishda xatolik' : 'Ошибка создания бронирования'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasNoRestaurant = !restaurantId;
  const reservationEnabled = restaurant?.reservation_enabled !== false;
  if (loading) return <PageSkeleton fullscreen label={language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'} cards={4} />;

  return (
    <div className="client-page">
      <ClientTopBar logoUrl={restaurant?.logo_url} logoDisplayMode={restaurant?.logo_display_mode} restaurantName={restaurant?.name || 'Reservation'} language={language} onToggleLanguage={toggleLanguage} fallback="🪑" maxWidth="980px" sticky />
      <Container className="client-content" style={{ maxWidth: 980 }}>
        {hasNoRestaurant && <Alert variant="warning" className="border-0 shadow-sm mt-3">{language === 'uz' ? 'Avval do‘kon tanlang' : 'Сначала выберите магазин'}</Alert>}
        {!hasNoRestaurant && !reservationEnabled && <Alert variant="info" className="border-0 shadow-sm mt-3">{language === 'uz' ? 'Ushbu do‘kon uchun band qilish xizmati yoqilmagan' : 'Для этого магазина бронирование пока отключено'}</Alert>}
        {!hasNoRestaurant && reservationEnabled && (
          <>
            {error && <Alert variant="danger" className="mt-3 border-0 shadow-sm">{error}</Alert>}
            {successMessage && <Alert variant="success" className="mt-3 border-0 shadow-sm">{successMessage}</Alert>}
            <Card className="border-0 shadow-sm mt-3">
              <Card.Body>
                <Row className="g-3">
                  <Col md={3}><Form.Label>{language === 'uz' ? 'Qavat' : 'Этаж'}</Form.Label><Form.Select value={selectedFloorId || ''} onChange={(e) => setSelectedFloorId(Number.parseInt(e.target.value, 10) || null)}>{floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</Form.Select></Col>
                  <Col md={3}><Form.Label>{language === 'uz' ? 'Sana' : 'Дата'}</Form.Label><Form.Control type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} /></Col>
                  <Col md={3}><Form.Label>{language === 'uz' ? 'Vaqt' : 'Время'}</Form.Label><Form.Control type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Col>
                  <Col md={3}><Form.Label>{language === 'uz' ? 'Davomiylik (daq.)' : 'Длительность (мин.)'}</Form.Label><Form.Control type="number" min={30} step={30} value={durationMinutes} onChange={(e) => setDurationMinutes(Math.max(30, Number.parseInt(e.target.value, 10) || 30))} /></Col>
                  <Col md={3}><Form.Label>{language === 'uz' ? 'Mehmonlar soni' : 'Количество гостей'}</Form.Label><Form.Control type="number" min={1} value={guestsCount} onChange={(e) => setGuestsCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} /></Col>
                  <Col md={3}><Form.Label>{language === 'uz' ? 'Band turi' : 'Тип брони'}</Form.Label><Form.Select value={bookingMode} onChange={(e) => setBookingMode(e.target.value)}><option value="reservation_only">{language === 'uz' ? 'Faqat bron' : 'Только бронь'}</option><option value="with_items">{language === 'uz' ? 'Bron + taomlar' : 'Бронь + блюда'}</option></Form.Select></Col>
                  <Col md={6}><Form.Label>{language === 'uz' ? 'Ko‘rinish' : 'Режим просмотра'}</Form.Label><div className="d-flex gap-2"><Button type="button" variant={viewMode === 'grid' ? 'primary' : 'outline-secondary'} onClick={() => setViewMode('grid')}>{language === 'uz' ? 'Ro‘yxat / Grid' : 'Список / Грид'}</Button><Button type="button" variant={viewMode === 'plan' ? 'primary' : 'outline-secondary'} onClick={() => setViewMode('plan')}>{language === 'uz' ? 'Qavat sxemasi' : 'Схема этажа'}</Button></div></Col>
                </Row>
              </Card.Body>
            </Card>
            <div className="d-flex justify-content-between align-items-center mt-3 mb-2"><strong>{language === 'uz' ? 'Stollar' : 'Столы'}</strong>{loadingAvailability && <div className="text-muted small d-flex align-items-center gap-2"><Spinner animation="border" size="sm" />{language === 'uz' ? 'Yangilanmoqda' : 'Обновляем'}</div>}</div>

            {viewMode === 'grid' ? (
              <Row className="g-3">
                {tables.map((table) => {
                  const selected = selectedTableIds.includes(Number(table.id));
                  const available = Boolean(table.is_available);
                  return (
                    <Col key={table.id} xs={6} md={4} lg={3}>
                      <button type="button" onClick={() => toggleTableSelection(table)} disabled={!available} className="w-100 text-start" style={{ borderRadius: 14, border: `1px solid ${selected ? 'var(--primary-color)' : (available ? '#b9d7a8' : '#d5d5d5')}`, background: selected ? 'color-mix(in srgb, var(--primary-color) 15%, #fff)' : (available ? '#f4f8f1' : '#f1f1f1'), color: available ? '#1f2937' : '#8a8a8a', minHeight: 108, padding: '10px 12px', position: 'relative', cursor: available ? 'pointer' : 'not-allowed' }}>
                        {table.photo_url && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setPhotoTableName(String(table.name || 'Стол')); setPhotoUrl(toAbsoluteMediaUrl(table.photo_url)); setShowPhotoModal(true); }} style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', border: '1px solid #d1d5db', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>📷</span>}
                        <div className="fw-bold">{table.name}</div>
                        <div className="small mt-1">{language === 'uz' ? 'Sig‘im' : 'Вместимость'}: {table.capacity || 0}</div>
                      </button>
                    </Col>
                  );
                })}
              </Row>
            ) : (
              <Card className="border-0 shadow-sm"><Card.Body className="p-2">
                <div onWheel={(event) => { event.preventDefault(); setPlanScale((prev) => clamp(Number((prev + (event.deltaY < 0 ? 0.12 : -0.12)).toFixed(2)), 0.8, 2.4)); }} onPointerDown={(event) => { if (event.pointerType === 'mouse' && event.button !== 0) return; if (event.target.closest('[data-plan-table="1"]')) return; setPlanPanStart({ x: event.clientX, y: event.clientY, ox: planOffset.x, oy: planOffset.y }); }} onPointerMove={(event) => { if (!planPanStart) return; setPlanOffset({ x: planPanStart.ox + event.clientX - planPanStart.x, y: planPanStart.oy + event.clientY - planPanStart.y }); }} onPointerUp={() => setPlanPanStart(null)} onPointerCancel={() => setPlanPanStart(null)} style={{ position: 'relative', height: '60vh', minHeight: 380, border: '1px solid var(--border-color)', borderRadius: 16, overflow: 'hidden', background: '#f3f4f6', cursor: planPanStart ? 'grabbing' : 'grab', touchAction: 'none' }}>
                  <div style={{ position: 'absolute', inset: 0, transform: `translate(${planOffset.x}px, ${planOffset.y}px) scale(${planScale})`, transformOrigin: 'center center' }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: selectedFloorImageUrl ? `url(${selectedFloorImageUrl})` : 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    {tables.map((table) => {
                      const selected = selectedTableIds.includes(Number(table.id));
                      const available = Boolean(table.is_available);
                      const x = normalizePlanCoordinate(table.x, 50);
                      const y = normalizePlanCoordinate(table.y, 50);
                      return (
                        <button key={table.id} type="button" data-plan-table="1" onPointerDown={(event) => event.stopPropagation()} onClick={() => toggleTableSelection(table)} disabled={!available} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', minWidth: 62, minHeight: 46, borderRadius: 12, border: `2px solid ${selected ? 'var(--primary-color)' : (available ? '#22c55e' : '#9ca3af')}`, background: selected ? 'color-mix(in srgb, var(--primary-color) 15%, #fff)' : (available ? 'rgba(236,253,245,0.9)' : 'rgba(243,244,246,0.95)'), boxShadow: '0 6px 16px rgba(15,23,42,0.16)', padding: 6 }}>
                          {table.photo_url && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPhotoTableName(String(table.name || 'Стол'));
                                setPhotoUrl(toAbsoluteMediaUrl(table.photo_url));
                                setShowPhotoModal(true);
                              }}
                              style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', border: '1px solid #d1d5db', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}
                            >
                              📷
                            </span>
                          )}
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{table.name}</div>
                          <div style={{ fontSize: 10 }}>{table.capacity || 0}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', flexDirection: 'column', gap: 8 }}><Button size="sm" variant="light" onClick={() => setPlanScale((prev) => clamp(Number((prev + 0.12).toFixed(2)), 0.8, 2.4))}>+</Button><Button size="sm" variant="light" onClick={() => setPlanScale((prev) => clamp(Number((prev - 0.12).toFixed(2)), 0.8, 2.4))}>-</Button><Button size="sm" variant="outline-secondary" onClick={() => { setPlanScale(1); setPlanOffset({ x: 0, y: 0 }); }}>{language === 'uz' ? 'Reset' : 'Сброс'}</Button></div>
                </div>
              </Card.Body></Card>
            )}

            <Card className="border-0 shadow-sm mt-3 mb-4"><Card.Body>
              <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                <Badge bg="success">{language === 'uz' ? 'Tanlangan stollar' : 'Выбрано столов'}: {selectedTableIds.length}</Badge>
                <Badge bg={isCapacityEnough ? 'primary' : 'warning'} text={isCapacityEnough ? undefined : 'dark'}>{language === 'uz' ? 'Jami sig‘im' : 'Итоговая вместимость'}: {totalSelectedCapacity}</Badge>
                <Badge bg="secondary">{language === 'uz' ? 'Band narxi' : 'Стоимость брони'}: {formatPrice(reservationFee)}</Badge>
              </div>
              {!isCapacityEnough && selectedTableIds.length > 0 && <Alert variant="warning" className="border-0 mb-3">{language === 'uz' ? 'Tanlangan stollar sig‘imi mehmonlar soni uchun yetarli emas' : 'Вместимости выбранных столов недостаточно для указанного количества гостей'}</Alert>}
              <Form.Group className="mb-3"><Form.Label>{language === 'uz' ? 'Izoh (ixtiyoriy)' : 'Комментарий (необязательно)'}</Form.Label><Form.Control as="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} /></Form.Group>
              <Button variant="success" className="w-100" disabled={submitting || !selectedTableIds.length || !selectedFloorId || !isCapacityEnough} onClick={submitReservation}>{submitting ? (language === 'uz' ? 'Yuborilmoqda...' : 'Отправляем...') : (language === 'uz' ? 'Band qilish' : 'Забронировать')}</Button>
            </Card.Body></Card>
          </>
        )}
      </Container>
      <Modal show={showPhotoModal} onHide={() => setShowPhotoModal(false)} centered><Modal.Header closeButton><Modal.Title>{language === 'uz' ? 'Stol rasmi' : 'Фото стола'}: {photoTableName}</Modal.Title></Modal.Header><Modal.Body className="p-2">{photoUrl ? <img src={photoUrl} alt={photoTableName} style={{ width: '100%', borderRadius: 10, maxHeight: '70vh', objectFit: 'contain' }} /> : <div className="text-muted p-3 text-center">{language === 'uz' ? 'Rasm topilmadi' : 'Фото не найдено'}</div>}</Modal.Body></Modal>
      {!isOperator() && <BottomNav />}
      {!isOperator() && <div style={{ height: 70 }} />}
    </div>
  );
}

export default Reservations;
