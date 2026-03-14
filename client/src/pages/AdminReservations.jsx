import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminStyles.css';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Table from 'react-bootstrap/Table';
import Spinner from 'react-bootstrap/Spinner';
import Modal from 'react-bootstrap/Modal';
import Pagination from 'react-bootstrap/Pagination';
import { formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const MAX_UPLOAD_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const RESERVATION_STATUSES = ['new', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizePlanCoordinate = (value, fallback = 50) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed >= 0 && parsed <= 100) return parsed;
  if (parsed > 100 && parsed <= 1000) return clamp(parsed / 10, 0, 100);
  return clamp(parsed, 0, 100);
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const toAbsoluteMediaUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = API_URL.replace('/api', '');
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M10 4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M7 7v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function AdminReservations() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const floorPlanRef = useRef(null);
  const draggedPositionRef = useRef(null);
  const isUz = language === 'uz';
  const tx = (ru, uz) => (isUz ? uz : ru);

  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingFloorImage, setUploadingFloorImage] = useState(false);
  const [uploadingTablePhoto, setUploadingTablePhoto] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [settings, setSettings] = useState({
    reservation_fee: 0,
    max_duration_minutes: 180,
    allow_multi_table: true
  });
  const [supportContact, setSupportContact] = useState({
    support_username: '',
    phone: ''
  });

  const [floors, setFloors] = useState([]);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [floorForm, setFloorForm] = useState({
    name: '',
    sort_order: 0,
    image_url: ''
  });

  const [templates, setTemplates] = useState([]);
  const [tables, setTables] = useState([]);
  const [tableForm, setTableForm] = useState({
    name: '',
    capacity: 2,
    template_id: '',
    photo_url: '',
    x: 50,
    y: 50
  });

  const [statusFilter, setStatusFilter] = useState('all');
  const [reservations, setReservations] = useState([]);
  const [reservationStatusDraft, setReservationStatusDraft] = useState({});

  const [imageModalTitle, setImageModalTitle] = useState('');
  const [imageModalUrl, setImageModalUrl] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [planScale, setPlanScale] = useState(1);
  const [planOffset, setPlanOffset] = useState({ x: 0, y: 0 });
  const [planPanStart, setPlanPanStart] = useState(null);
  const [savingTablePositionId, setSavingTablePositionId] = useState(null);
  const [tablesPage, setTablesPage] = useState(1);
  const [tablesPageSize, setTablesPageSize] = useState(10);
  const [reservationsPage, setReservationsPage] = useState(1);
  const [reservationsPageSize, setReservationsPageSize] = useState(10);

  const selectedFloor = useMemo(
    () => floors.find((floor) => Number(floor.id) === Number(selectedFloorId)) || null,
    [floors, selectedFloorId]
  );
  const selectedFloorImageUrl = useMemo(
    () => toAbsoluteMediaUrl(selectedFloor?.image_url),
    [selectedFloor?.image_url]
  );
  const pagedTables = useMemo(() => {
    const start = (tablesPage - 1) * tablesPageSize;
    return tables.slice(start, start + tablesPageSize);
  }, [tables, tablesPage, tablesPageSize]);
  const tablesTotalPages = useMemo(() => Math.max(1, Math.ceil(tables.length / tablesPageSize)), [tables.length, tablesPageSize]);
  const pagedReservations = useMemo(() => {
    const start = (reservationsPage - 1) * reservationsPageSize;
    return reservations.slice(start, start + reservationsPageSize);
  }, [reservations, reservationsPage, reservationsPageSize]);
  const reservationsTotalPages = useMemo(() => Math.max(1, Math.ceil(reservations.length / reservationsPageSize)), [reservations.length, reservationsPageSize]);

  const uploadImageWithCompression = async (file, preset = 'product') => {
    if (!file) {
      throw new Error('Файл не выбран');
    }
    if (!file.type?.startsWith('image/')) {
      throw new Error('Можно загружать только изображения');
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      throw new Error('Файл слишком большой. Максимум 12MB');
    }

    const formData = new FormData();
    formData.append('image', file);
    if (preset) {
      formData.append('preset', preset);
    }

    const response = await axios.post(`${API_URL}/upload/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    const uploadedUrl = response.data?.url || response.data?.imageUrl;
    const absoluteUrl = toAbsoluteMediaUrl(uploadedUrl);
    if (!absoluteUrl) {
      throw new Error('Сервер не вернул URL изображения');
    }
    return absoluteUrl;
  };

  const loadReservations = async (nextStatus = statusFilter) => {
    const response = await axios.get(`${API_URL}/admin/reservations`, {
      params: {
        status: nextStatus || 'all'
      }
    });
    const nextRows = Array.isArray(response.data) ? response.data : [];
    setReservations(nextRows);
    setReservationStatusDraft(
      Object.fromEntries(nextRows.map((row) => [row.id, String(row.status || 'new')]))
    );
  };

  const loadTables = async (floorId = selectedFloorId) => {
    if (!floorId) {
      setTables([]);
      return;
    }
    setLoadingTables(true);
    try {
      const response = await axios.get(`${API_URL}/admin/reservations/tables`, {
        params: { floor_id: floorId }
      });
      setTables(Array.isArray(response.data) ? response.data : []);
    } finally {
      setLoadingTables(false);
    }
  };

  const loadInitial = async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsRes, floorsRes, templatesRes, billingRes] = await Promise.all([
        axios.get(`${API_URL}/admin/reservations/settings`),
        axios.get(`${API_URL}/admin/reservations/floors`),
        axios.get(`${API_URL}/admin/reservations/table-templates`),
        axios.get(`${API_URL}/admin/billing/info`)
      ]);

      const nextSettings = settingsRes.data || {};
      const nextFloors = Array.isArray(floorsRes.data) ? floorsRes.data : [];
      const nextTemplates = Array.isArray(templatesRes.data) ? templatesRes.data : [];

      setSettings({
        reservation_fee: asNumber(nextSettings.reservation_fee, 0),
        max_duration_minutes: asInt(nextSettings.max_duration_minutes, 180),
        allow_multi_table: nextSettings.allow_multi_table !== false
      });
      setSupportContact({
        support_username: String(billingRes.data?.requisites?.telegram_username || '').trim(),
        phone: String(billingRes.data?.requisites?.phone_number || '').trim()
      });
      setFloors(nextFloors);
      setTemplates(nextTemplates);

      const firstFloorId = nextFloors[0]?.id ? Number(nextFloors[0].id) : null;
      setSelectedFloorId(firstFloorId);

      await Promise.all([
        loadReservations('all'),
        loadTables(firstFloorId)
      ]);
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка загрузки данных бронирования', 'Bronlash ma\'lumotlarini yuklashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    loadTables();
  }, [selectedFloorId]);

  useEffect(() => {
    setTablesPage(1);
  }, [selectedFloorId, tablesPageSize]);

  useEffect(() => {
    if (tablesPage > tablesTotalPages) {
      setTablesPage(tablesTotalPages);
    }
  }, [tablesPage, tablesTotalPages]);

  useEffect(() => {
    setReservationsPage(1);
  }, [statusFilter, reservationsPageSize]);

  useEffect(() => {
    if (reservationsPage > reservationsTotalPages) {
      setReservationsPage(reservationsTotalPages);
    }
  }, [reservationsPage, reservationsTotalPages]);

  useEffect(() => {
    setDragState(null);
    draggedPositionRef.current = null;
  }, [selectedFloorId]);

  useEffect(() => {
    setPlanScale(1);
    setPlanOffset({ x: 0, y: 0 });
    setPlanPanStart(null);
  }, [selectedFloorId]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        reservation_fee: Math.max(0, asNumber(settings.reservation_fee, 0)),
        max_duration_minutes: Math.max(30, asInt(settings.max_duration_minutes, 180)),
        allow_multi_table: !!settings.allow_multi_table
      };
      await axios.put(`${API_URL}/admin/reservations/settings`, payload);
      setSuccess(tx('Настройки бронирования сохранены', 'Bronlash sozlamalari saqlandi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка сохранения настроек', 'Sozlamalarni saqlashda xatolik'));
    } finally {
      setSavingSettings(false);
    }
  };

  const addFloor = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: String(floorForm.name || '').trim(),
        sort_order: asInt(floorForm.sort_order, 0),
        image_url: String(floorForm.image_url || '').trim() || null
      };
      if (!payload.name) {
        setError(tx('Введите название этажа', 'Qavat nomini kiriting'));
        return;
      }
      const response = await axios.post(`${API_URL}/admin/reservations/floors`, payload);
      const created = response.data;
      const nextFloors = [...floors, created].sort((a, b) => asInt(a.sort_order) - asInt(b.sort_order));
      setFloors(nextFloors);
      setSelectedFloorId(created.id);
      setFloorForm({ name: '', sort_order: 0, image_url: '' });
      setShowFloorModal(false);
      setSuccess(tx('Этаж добавлен', 'Qavat qo\'shildi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка создания этажа', 'Qavat yaratishda xatolik'));
    }
  };

  const deleteFloor = async (floorId) => {
    const target = floors.find((item) => Number(item.id) === Number(floorId));
    if (!target) return;
    if (!window.confirm(tx(`Удалить этаж "${target.name}"?`, `"${target.name}" qavatini o'chirasizmi?`))) return;

    setError('');
    setSuccess('');
    try {
      await axios.delete(`${API_URL}/admin/reservations/floors/${floorId}`);
      const nextFloors = floors.filter((item) => Number(item.id) !== Number(floorId));
      setFloors(nextFloors);
      const nextSelected = nextFloors[0]?.id ? Number(nextFloors[0].id) : null;
      setSelectedFloorId(nextSelected);
      setSuccess(tx('Этаж удален', 'Qavat o\'chirildi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка удаления этажа', 'Qavatni o\'chirishda xatolik'));
    }
  };

  const addTable = async (event) => {
    event.preventDefault();
    if (!selectedFloorId) {
      setError(tx('Сначала выберите этаж', 'Avval qavatni tanlang'));
      return;
    }
    setError('');
    setSuccess('');
    try {
      const payload = {
        floor_id: selectedFloorId,
        name: String(tableForm.name || '').trim(),
        capacity: Math.max(1, asInt(tableForm.capacity, 1)),
        template_id: tableForm.template_id ? asInt(tableForm.template_id, 0) : null,
        photo_url: String(tableForm.photo_url || '').trim() || null,
        x: asNumber(tableForm.x, 0),
        y: asNumber(tableForm.y, 0),
        is_active: true
      };
      if (!payload.name) {
        setError(tx('Введите название стола', 'Stol nomini kiriting'));
        return;
      }
      await axios.post(`${API_URL}/admin/reservations/tables`, payload);
      setTableForm({
        name: '',
        capacity: 2,
        template_id: '',
        photo_url: '',
        x: 50,
        y: 50
      });
      setShowTableModal(false);
      await loadTables(selectedFloorId);
      setSuccess(tx('Стол добавлен', 'Stol qo\'shildi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка добавления стола', 'Stol qo\'shishda xatolik'));
    }
  };

  const deleteTable = async (tableId) => {
    const target = tables.find((item) => Number(item.id) === Number(tableId));
    if (!target) return;
    if (!window.confirm(tx(`Удалить стол "${target.name}"?`, `"${target.name}" stolini o'chirasizmi?`))) return;

    setError('');
    setSuccess('');
    try {
      await axios.delete(`${API_URL}/admin/reservations/tables/${tableId}`);
      await loadTables(selectedFloorId);
      setSuccess(tx('Стол удален', 'Stol o\'chirildi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка удаления стола', 'Stolni o\'chirishda xatolik'));
    }
  };

  const acceptAndPay = async (reservationId) => {
    setError('');
    setSuccess('');
    try {
      await axios.post(`${API_URL}/admin/reservations/${reservationId}/accept-and-pay`);
      await loadReservations(statusFilter);
      setSuccess(tx('Бронирование подтверждено, списание выполнено', 'Bron tasdiqlandi, yechib olindi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка подтверждения бронирования', 'Bronni tasdiqlashda xatolik'));
    }
  };

  const updateReservationStatus = async (reservationId) => {
    const nextStatus = String(reservationStatusDraft[reservationId] || '').trim();
    if (!RESERVATION_STATUSES.includes(nextStatus)) return;

    const payload = { status: nextStatus };
    if (nextStatus === 'cancelled') {
      payload.cancel_reason = 'Отменено оператором';
    }

    setError('');
    setSuccess('');
    try {
      await axios.patch(`${API_URL}/admin/reservations/${reservationId}/status`, payload);
      await loadReservations(statusFilter);
      setSuccess(tx('Статус бронирования обновлен', 'Bron statusi yangilandi'));
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка обновления статуса', 'Statusni yangilashda xatolik'));
    }
  };

  const openImagePreview = (title, url) => {
    const src = toAbsoluteMediaUrl(url);
    if (!src) return;
    setImageModalTitle(title || tx('Фото', 'Rasm'));
    setImageModalUrl(src);
    setShowImageModal(true);
  };

  const handleFloorImageFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    setUploadingFloorImage(true);
    try {
      const imageUrl = await uploadImageWithCompression(file, 'product');
      setFloorForm((prev) => ({ ...prev, image_url: imageUrl }));
      setSuccess(tx('Фото этажа загружено', 'Qavat rasmi yuklandi'));
    } catch (err) {
      setError(err.response?.data?.error || err.message || tx('Ошибка загрузки фото этажа', 'Qavat rasmini yuklashda xatolik'));
    } finally {
      setUploadingFloorImage(false);
      event.target.value = '';
    }
  };

  const handleTablePhotoFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    setUploadingTablePhoto(true);
    try {
      const imageUrl = await uploadImageWithCompression(file, 'product');
      setTableForm((prev) => ({ ...prev, photo_url: imageUrl }));
      setSuccess(tx('Фото стола загружено', 'Stol rasmi yuklandi'));
    } catch (err) {
      setError(err.response?.data?.error || err.message || tx('Ошибка загрузки фото стола', 'Stol rasmini yuklashda xatolik'));
    } finally {
      setUploadingTablePhoto(false);
      event.target.value = '';
    }
  };

  const saveTablePosition = async (tableId, x, y) => {
    setSavingTablePositionId(tableId);
    try {
      await axios.put(`${API_URL}/admin/reservations/tables/${tableId}`, {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2))
      });
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка сохранения позиции стола', 'Stol joylashuvini saqlashda xatolik'));
      await loadTables(selectedFloorId);
    } finally {
      setSavingTablePositionId(null);
    }
  };

  const handleTablePlanPointerDown = (event, table) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const canvas = floorPlanRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = normalizePlanCoordinate(table.x, 50);
    const startY = normalizePlanCoordinate(table.y, 50);
    draggedPositionRef.current = { tableId: table.id, x: startX, y: startY };
    setDragState({
      tableId: table.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX,
      startY,
      scale: planScale,
      width: rect.width || 1,
      height: rect.height || 1
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleTablePlanPointerMove = (event, tableId) => {
    if (!dragState || dragState.tableId !== tableId) return;
    const effectiveScale = Math.max(0.1, Number(dragState.scale) || 1);
    const deltaXPercent = (((event.clientX - dragState.startClientX) / effectiveScale) / dragState.width) * 100;
    const deltaYPercent = (((event.clientY - dragState.startClientY) / effectiveScale) / dragState.height) * 100;
    const nextX = clamp(dragState.startX + deltaXPercent, 2, 98);
    const nextY = clamp(dragState.startY + deltaYPercent, 2, 98);
    draggedPositionRef.current = { tableId, x: nextX, y: nextY };

    setTables((prev) => prev.map((item) => (
      Number(item.id) === Number(tableId)
        ? { ...item, x: nextX, y: nextY }
        : item
    )));
  };

  const handleTablePlanPointerUp = async (event, tableId) => {
    if (!dragState || dragState.tableId !== tableId) return;
    event.currentTarget.releasePointerCapture?.(dragState.pointerId);
    setDragState(null);

    const latest = draggedPositionRef.current;
    if (!latest || Number(latest.tableId) !== Number(tableId)) return;
    await saveTablePosition(tableId, latest.x, latest.y);
  };

  const handleTablePlanPointerCancel = (tableId) => {
    if (!dragState || dragState.tableId !== tableId) return;
    setDragState(null);
    loadTables(selectedFloorId);
  };

  const handlePlanPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('[data-plan-table="1"]')) return;
    setPlanPanStart({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: planOffset.x,
      startOffsetY: planOffset.y
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePlanPointerMove = (event) => {
    if (!planPanStart) return;
    setPlanOffset({
      x: planPanStart.startOffsetX + (event.clientX - planPanStart.startClientX),
      y: planPanStart.startOffsetY + (event.clientY - planPanStart.startClientY)
    });
  };

  const handlePlanPointerUp = (event) => {
    if (!planPanStart) return;
    event.currentTarget.releasePointerCapture?.(planPanStart.pointerId);
    setPlanPanStart(null);
  };

  const handlePlanWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    setPlanScale((prev) => clamp(Number((prev + delta).toFixed(2)), 0.7, 2.4));
  };

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <Container fluid className="admin-panel py-3">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h4 className="mb-1">{tx('Управление бронированием', 'Bronlash boshqaruvi')}</h4>
          <div className="text-muted small">{tx('Этажи, фото этажей, столы, вместимость и статусы броней', 'Qavatlar, qavat rasmi, stollar sig\'imi va bron holatlari')}</div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={() => navigate('/admin')}>
            {tx('Назад в админку', 'Admin panelga qaytish')}
          </Button>
          <Button variant="outline-primary" onClick={loadInitial}>
            {tx('Обновить', 'Yangilash')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')} className="border-0">
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess('')} className="border-0">
          {success}
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Badge bg="secondary">{tx('Этажей', 'Qavatlar')}: {floors.length}</Badge>
        <Badge bg="secondary">{tx('Столов', 'Stollar')}: {tables.length}</Badge>
        <Badge bg="secondary">{tx('Заявок', 'So\'rovlar')}: {reservations.length}</Badge>
        {selectedFloor && <Badge bg="info" text="dark">{tx('Текущий этаж', 'Joriy qavat')}: {selectedFloor.name}</Badge>}
      </div>

      <Card className="border-0 shadow-sm mb-3 admin-reservation-tabs-card">
        <Card.Body className="p-3">
          <div className="admin-settings-pill-tabs" role="tablist" aria-label={tx('Вкладки бронирования', 'Bronlash bo\'limlari')}>
            {[
              { key: 'settings', label: tx('Настройки', 'Sozlamalar'), emoji: '⚙️' },
              { key: 'floors', label: tx('Этажи', 'Qavatlar'), emoji: '🏢' },
              { key: 'tables', label: tx('Столы', 'Stollar'), emoji: '🪑' },
              { key: 'plan', label: tx('Схема', 'Sxema'), emoji: '🗺️' },
              { key: 'requests', label: tx('Заявки', 'So\'rovlar'), emoji: '📋' }
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`admin-settings-pill-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="d-inline-flex align-items-center gap-1">
                    <span aria-hidden="true">{tab.emoji}</span>
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card.Body>
      </Card>

      {activeTab === 'settings' && (
      <div className="admin-settings-content admin-reservation-workspace p-3 rounded-4">
      <Card className="border-0 shadow-sm mb-0 admin-reservation-card">
        <Card.Header className="bg-white fw-semibold card-header admin-reservation-card-header">
          <span>{tx('Настройки сервиса брони', 'Bron xizmati sozlamalari')}</span>
          <Button className="btn-primary-custom admin-reservation-header-btn" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? tx('Сохраняем...', 'Saqlanmoqda...') : tx('Сохранить настройки', 'Sozlamalarni saqlash')}
          </Button>
        </Card.Header>
        <Card.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Label>{tx('Фиксированная цена брони (для клиента)', 'Mijoz uchun bron narxi (qat\'iy)')}</Form.Label>
              <Form.Control
                type="number"
                min={0}
                step="100"
                value={settings.reservation_fee}
                onChange={(event) => setSettings((prev) => ({ ...prev, reservation_fee: event.target.value }))}
              />
              <Form.Text className="text-muted">
                {tx('Эта сумма берется с клиента при создании брони.', 'Bu summa bron yaratishda mijozdan olinadi.')}
              </Form.Text>
            </Col>
            <Col md={6}>
              <Form.Label className="d-flex align-items-center gap-2">
                <span>{tx('Макс. длительность (мин.)', 'Maks. davomiylik (daq.)')}</span>
                <span
                  role="button"
                  tabIndex={0}
                  title={tx('Ограничение по длительности одной брони. Например, 180 означает максимум 3 часа.', 'Bir bron uchun maksimal vaqt cheklovi. Masalan, 180 bu ko\'pi bilan 3 soat.')}
                  style={{ fontSize: 14, color: '#64748b', cursor: 'help' }}
                >
                  ⓘ
                </span>
              </Form.Label>
              <Form.Control
                type="number"
                min={30}
                step={30}
                value={settings.max_duration_minutes}
                onChange={(event) => setSettings((prev) => ({ ...prev, max_duration_minutes: event.target.value }))}
              />
            </Col>
            <Col md={6} className="d-flex align-items-end">
              <Form.Check
                type="switch"
                label={tx('Разрешить несколько столов', 'Bir nechta stolni ruxsat etish')}
                checked={!!settings.allow_multi_table}
                onChange={(event) => setSettings((prev) => ({ ...prev, allow_multi_table: event.target.checked }))}
              />
            </Col>
            <Col md={6}>
              <Alert variant="light" className="mb-0 border">
                <div className="small">
                  {tx('Включение/выключение бронирования перенесено в раздел админки «Настройки → Общие/Часы работы».', 'Bronni yoqish/o\'chirish admin paneldagi «Sozlamalar → Umumiy / Ish vaqti» bo\'limiga ko\'chirildi.')}
                </div>
                <div className="small mt-2">
                  {tx('Подключение сервиса и стоимость списания для магазина настраиваются супер-админом.', 'Xizmatni ulash va do\'kondan yechiladigan servis narxi super-admin tomonidan sozlanadi.')}
                  {supportContact.support_username && (
                    <> {tx('Связь', 'Bog\'lanish')}: <strong>@{supportContact.support_username.replace(/^@/, '')}</strong>.</>
                  )}
                  {!supportContact.support_username && supportContact.phone && (
                    <> {tx('Связь', 'Bog\'lanish')}: <strong>{supportContact.phone}</strong>.</>
                  )}
                </div>
              </Alert>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      </div>
      )}

      {(activeTab === 'floors' || activeTab === 'tables') && (
      <Row className="g-3 m-0">
        {activeTab === 'floors' && (
        <Col lg={12} className="px-0">
          <div className="admin-settings-content admin-reservation-workspace p-3 rounded-4">
          <Card className="border-0 shadow-sm mb-0 admin-reservation-card">
            <Card.Header className="bg-white fw-semibold card-header admin-reservation-card-header">
              <span>{tx('Этажи', 'Qavatlar')}</span>
              <Button
                className="btn-primary-custom admin-reservation-header-btn"
                onClick={() => {
                  setFloorForm({ name: '', sort_order: floors.length, image_url: '' });
                  setShowFloorModal(true);
                }}
              >
                {tx('Добавить этаж', 'Qavat qo\'shish')}
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="admin-table-container">
                <Table size="sm" hover className="admin-table mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>{tx('Этаж', 'Qavat')}</th>
                      <th>{tx('Порядок', 'Tartib')}</th>
                      <th>{tx('Фото', 'Rasm')}</th>
                      <th className="text-end">{tx('Действия', 'Amallar')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {floors.map((floor) => {
                      const isActiveFloor = Number(selectedFloorId) === Number(floor.id);
                      return (
                        <tr
                          key={floor.id}
                          className={isActiveFloor ? 'table-active' : ''}
                          onClick={() => setSelectedFloorId(Number(floor.id))}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="fw-semibold">
                            {floor.name}
                            {isActiveFloor && <Badge bg="info" text="dark" className="ms-2">{tx('Выбран', 'Tanlangan')}</Badge>}
                          </td>
                          <td>{asInt(floor.sort_order, 0)}</td>
                          <td>{floor.image_url ? <Badge bg="secondary">{tx('Есть', 'Bor')}</Badge> : '—'}</td>
                          <td className="text-end">
                            <div className="d-inline-flex gap-1">
                              <Button
                                className="action-btn admin-reservation-action-btn"
                                variant="primary"
                                title={tx('Просмотр', 'Ko\'rish')}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openImagePreview(`Этаж: ${floor.name}`, floor.image_url);
                                }}
                                disabled={!floor.image_url}
                              >
                                <EyeIcon />
                              </Button>
                              <Button
                                className="action-btn admin-reservation-action-btn"
                                variant="primary"
                                title={tx('Удалить', 'O\'chirish')}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteFloor(floor.id);
                                }}
                              >
                                <TrashIcon />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {floors.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-muted text-center py-3">{tx('Этажи пока не добавлены', 'Qavatlar hali qo\'shilmagan')}</td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
          </div>
        </Col>
        )}

        {activeTab === 'tables' && (
        <Col lg={12} className="px-0">
          <div className="admin-settings-content admin-reservation-workspace p-3 rounded-4">
          <Card className="border-0 shadow-sm mb-0 admin-reservation-card">
            <Card.Header className="bg-white fw-semibold card-header admin-reservation-card-header">
              <span>{tx('Столы', 'Stollar')} {selectedFloor ? `(${selectedFloor.name})` : ''}</span>
              <div className="d-flex align-items-center gap-2 admin-reservation-header-controls">
                <Form.Select
                  size="sm"
                  className="admin-reservation-control"
                  style={{ minWidth: 220 }}
                  value={selectedFloorId || ''}
                  onChange={(event) => setSelectedFloorId(Number(event.target.value) || null)}
                >
                  <option value="">{tx('Выберите этаж', 'Qavatni tanlang')}</option>
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>{floor.name}</option>
                  ))}
                </Form.Select>
                <Button
                  size="sm"
                  className="btn-primary-custom admin-reservation-control"
                  disabled={!selectedFloorId}
                  onClick={() => {
                    setTableForm({
                      name: '',
                      capacity: 2,
                      template_id: '',
                      photo_url: '',
                      x: 50,
                      y: 50
                    });
                    setShowTableModal(true);
                  }}
                >
                  {tx('Добавить стол', 'Stol qo\'shish')}
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {!selectedFloorId && (
                <Alert variant="warning" className="border-0">
                  {tx('Сначала выберите этаж', 'Avval qavatni tanlang')}
                </Alert>
              )}

              {!!selectedFloorId && (
                <>
                  <div className="small text-muted mb-3">
                    {tx('Добавьте стол через кнопку вверху, затем перетащите его на вкладке "Схема".', 'Yuqoridagi tugma orqali stol qo\'shing, keyin uni "Sxema" bo\'limida joylashtiring.')}
                  </div>

                  {loadingTables ? (
                    <div className="text-muted">{tx('Загрузка столов...', 'Stollar yuklanmoqda...')}</div>
                  ) : (
                    <div className="admin-table-container">
                      <Table size="sm" hover className="admin-table mb-0 align-middle">
                        <thead>
                          <tr>
                            <th>{tx('Стол', 'Stol')}</th>
                            <th>{tx('Вместимость', 'Sig\'im')}</th>
                            <th>{tx('Шаблон', 'Shablon')}</th>
                            <th>{tx('Позиция', 'Joylashuv')}</th>
                            <th>{tx('Фото', 'Rasm')}</th>
                            <th className="text-end">{tx('Действия', 'Amallar')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedTables.map((table) => (
                            <tr key={table.id}>
                              <td>{table.name}</td>
                              <td>{table.capacity}</td>
                              <td>{table.template_name || '—'}</td>
                              <td className="small text-muted">
                                x: {Number.parseFloat(table.x || 0).toFixed(1)}%<br />
                                y: {Number.parseFloat(table.y || 0).toFixed(1)}%
                              </td>
                              <td>{table.photo_url ? <Badge bg="secondary">{tx('Есть', 'Bor')}</Badge> : '—'}</td>
                              <td className="text-end">
                                <div className="d-inline-flex gap-1">
                                  <Button
                                    className="action-btn admin-reservation-action-btn"
                                    variant="primary"
                                    title={tx('Просмотр', 'Ko\'rish')}
                                    onClick={() => openImagePreview(`Стол: ${table.name}`, table.photo_url)}
                                    disabled={!table.photo_url}
                                  >
                                    <EyeIcon />
                                  </Button>
                                  <Button
                                    className="action-btn admin-reservation-action-btn"
                                    variant="primary"
                                    title={tx('Удалить', 'O\'chirish')}
                                    onClick={() => deleteTable(table.id)}
                                  >
                                    <TrashIcon />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {tables.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-muted text-center py-3">{tx('Столов пока нет', 'Stollar hali yo\'q')}</td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                  )}
                  {tables.length > tablesPageSize && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <div className="small text-muted">
                        {tx('Записей', 'Yozuvlar')}: {tables.length}
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <Form.Select size="sm" className="admin-reservation-control" value={tablesPageSize} onChange={(e) => setTablesPageSize(Number(e.target.value) || 10)}>
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                        </Form.Select>
                        <Pagination className="mb-0">
                          <Pagination.Prev disabled={tablesPage <= 1} onClick={() => setTablesPage((p) => Math.max(1, p - 1))} />
                          <Pagination.Item active>{tablesPage}</Pagination.Item>
                          <Pagination.Next disabled={tablesPage >= tablesTotalPages} onClick={() => setTablesPage((p) => Math.min(tablesTotalPages, p + 1))} />
                        </Pagination>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card.Body>
          </Card>
          </div>
        </Col>
        )}
      </Row>
      )}

      {activeTab === 'plan' && (
        <div className="admin-settings-content admin-reservation-workspace p-3 rounded-4">
        <Card className="border-0 shadow-sm mb-0 admin-reservation-card">
          <Card.Header className="bg-white fw-semibold card-header admin-reservation-card-header">
            <span>{tx('Схема этажа', 'Qavat sxemasi')}: {selectedFloor?.name || '—'}</span>
            <div className="d-flex align-items-center gap-2 admin-reservation-header-controls">
              <Form.Select
                size="sm"
                className="admin-reservation-control"
                style={{ minWidth: 220 }}
                value={selectedFloorId || ''}
                onChange={(event) => setSelectedFloorId(Number(event.target.value) || null)}
              >
                <option value="">{tx('Выберите этаж', 'Qavatni tanlang')}</option>
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>{floor.name}</option>
                ))}
              </Form.Select>
              {savingTablePositionId && (
                <span className="small text-muted">{tx('Сохраняем позицию стола...', 'Stol joylashuvi saqlanmoqda...')}</span>
              )}
            </div>
          </Card.Header>
          <Card.Body>
            {!selectedFloorId && (
              <Alert variant="warning" className="border-0 mb-0">
                {tx('Выберите этаж для работы со схемой', 'Sxema bilan ishlash uchun qavatni tanlang')}
              </Alert>
            )}
            {!!selectedFloorId && (
            <>
            <div className="small text-muted mb-2">
              {tx('Схему можно двигать мышью/тачем, колесом менять масштаб. Столы перетаскиваются отдельно и сохраняются автоматически.', 'Sxemani sichqoncha/tach bilan surish mumkin, g\'ildirak bilan kattalashtirish ishlaydi. Stollar alohida sudraladi va avtomatik saqlanadi.')}
            </div>
            <div
              ref={floorPlanRef}
              onWheel={handlePlanWheel}
              onPointerDown={handlePlanPointerDown}
              onPointerMove={handlePlanPointerMove}
              onPointerUp={handlePlanPointerUp}
              onPointerCancel={handlePlanPointerUp}
              style={{
                position: 'relative',
                width: '100%',
                height: '58vh',
                minHeight: 360,
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#f8fafc',
                cursor: planPanStart ? 'grabbing' : 'grab',
                touchAction: 'none'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `translate(${planOffset.x}px, ${planOffset.y}px) scale(${planScale})`,
                  transformOrigin: 'center center'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: selectedFloorImageUrl
                      ? `url(${selectedFloorImageUrl})`
                      : 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                    backgroundSize: selectedFloorImageUrl ? 'contain' : 'cover',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                  }}
                />
                {tables.map((table) => {
                  const tableId = Number(table.id);
                  const posX = normalizePlanCoordinate(table.x, 50);
                  const posY = normalizePlanCoordinate(table.y, 50);
                  const isDragging = dragState?.tableId === tableId;
                  const templateImageUrl = toAbsoluteMediaUrl(table.template_image_url);

                  return (
                    <button
                      key={`plan-table-${table.id}`}
                      type="button"
                      data-plan-table="1"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        handleTablePlanPointerDown(event, table);
                      }}
                      onPointerMove={(event) => handleTablePlanPointerMove(event, tableId)}
                      onPointerUp={(event) => handleTablePlanPointerUp(event, tableId)}
                      onPointerCancel={() => handleTablePlanPointerCancel(tableId)}
                      style={{
                        position: 'absolute',
                        left: `${posX}%`,
                        top: `${posY}%`,
                        transform: 'translate(-50%, -50%)',
                        minWidth: 76,
                        minHeight: 50,
                        borderRadius: 12,
                        border: `2px solid ${isDragging ? 'var(--primary-color)' : '#94a3b8'}`,
                        background: isDragging
                          ? 'color-mix(in srgb, var(--primary-color) 10%, #fff)'
                          : 'rgba(255,255,255,0.76)',
                        boxShadow: '0 6px 16px rgba(15,23,42,0.14)',
                        padding: templateImageUrl ? '2px 4px' : '6px 8px',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2
                      }}
                    >
                      {templateImageUrl ? (
                        <img
                          src={templateImageUrl}
                          alt={table.template_name || table.name}
                          style={{ width: 88, height: 62, objectFit: 'contain', pointerEvents: 'none' }}
                        />
                      ) : (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>{table.name}</div>
                          <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.1 }}>{table.capacity || 0} {tx('мест', 'o\'rin')}</div>
                        </>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', lineHeight: 1 }}>{table.name}</div>
                    </button>
                  );
                })}
              </div>
              <div className="admin-reservation-plan-tools">
                <Button className="action-btn admin-reservation-action-btn" variant="primary" onClick={() => setPlanScale((prev) => clamp(Number((prev + 0.1).toFixed(2)), 0.7, 2.4))}>+</Button>
                <Button className="action-btn admin-reservation-action-btn" variant="primary" onClick={() => setPlanScale((prev) => clamp(Number((prev - 0.1).toFixed(2)), 0.7, 2.4))}>−</Button>
                <Button size="sm" className="admin-reservation-control px-2" variant="outline-secondary" onClick={() => { setPlanScale(1); setPlanOffset({ x: 0, y: 0 }); }}>
                  {tx('Сброс', 'Reset')}
                </Button>
              </div>
            </div>
            </>
            )}
          </Card.Body>
        </Card>
        </div>
      )}

      {activeTab === 'requests' && (
      <div className="admin-settings-content admin-reservation-workspace p-3 rounded-4">
      <Card className="border-0 shadow-sm mb-0 admin-reservation-card">
        <Card.Header className="bg-white fw-semibold card-header admin-reservation-card-header">
          <span>{tx('Заявки на бронирование', 'Bron so\'rovlari')}</span>
          <div className="d-flex gap-2 admin-reservation-header-controls">
            <Form.Select
              size="sm"
              className="admin-reservation-control"
              value={statusFilter}
              onChange={async (event) => {
                const next = event.target.value;
                setStatusFilter(next);
                await loadReservations(next);
              }}
            >
              <option value="all">{tx('Все статусы', 'Barcha statuslar')}</option>
              {RESERVATION_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Form.Select>
            <Button size="sm" className="admin-reservation-control" variant="outline-primary" onClick={() => loadReservations(statusFilter)}>
              {tx('Обновить', 'Yangilash')}
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="admin-table-container">
            <Table hover className="admin-table mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>{tx('Номер', 'Raqam')}</th>
                  <th>{tx('Дата/время', 'Sana/vaqt')}</th>
                  <th>{tx('Столы', 'Stollar')}</th>
                  <th>{tx('Гости', 'Mehmonlar')}</th>
                  <th>{tx('Предоплата', 'Oldindan to\'lov')}</th>
                  <th>{tx('Статус', 'Status')}</th>
                  <th>{tx('Действия', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td>{reservation.reservation_number}</td>
                    <td>
                      <div>{reservation.booking_date}</div>
                      <div className="small text-muted">
                        {String(reservation.start_time || '').slice(0, 5)} - {String(reservation.end_time || '').slice(0, 5)}
                      </div>
                    </td>
                    <td>
                      {(reservation.tables || []).map((table) => table.name).join(', ') || '—'}
                    </td>
                    <td>{reservation.guests_count}</td>
                    <td>{formatPrice(asNumber(reservation.total_prepay_amount, 0))}</td>
                    <td>
                      <Badge bg={reservation.status === 'cancelled' ? 'secondary' : reservation.status === 'completed' ? 'success' : 'primary'}>
                        {reservation.status}
                      </Badge>
                      {reservation.is_paid && <Badge bg="info" text="dark" className="ms-1">{tx('Списание ОК', 'Yechim OK')}</Badge>}
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <div className="d-flex gap-2 flex-wrap">
                        {!reservation.is_paid && !['cancelled', 'completed', 'no_show'].includes(String(reservation.status || '').toLowerCase()) && (
                          <Button size="sm" className="admin-reservation-control" variant="outline-success" onClick={() => acceptAndPay(reservation.id)}>
                            {tx('Принять и списать', 'Qabul qilish va yechish')}
                          </Button>
                        )}
                        <Form.Select
                          size="sm"
                          className="admin-reservation-control"
                          style={{ width: 130 }}
                          value={reservationStatusDraft[reservation.id] || reservation.status || 'new'}
                          onChange={(event) => setReservationStatusDraft((prev) => ({
                            ...prev,
                            [reservation.id]: event.target.value
                          }))}
                        >
                          {RESERVATION_STATUSES.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </Form.Select>
                        <Button size="sm" className="admin-reservation-control" variant="outline-primary" onClick={() => updateReservationStatus(reservation.id)}>
                          {tx('Обновить статус', 'Statusni yangilash')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-3">
                      {tx('Бронирований пока нет', 'Bronlar hali yo\'q')}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
          {reservations.length > reservationsPageSize && (
            <div className="d-flex justify-content-between align-items-center p-3 border-top">
              <div className="small text-muted">
                {tx('Записей', 'Yozuvlar')}: {reservations.length}
              </div>
              <div className="d-flex align-items-center gap-2">
                <Form.Select size="sm" className="admin-reservation-control" value={reservationsPageSize} onChange={(e) => setReservationsPageSize(Number(e.target.value) || 10)}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </Form.Select>
                <Pagination className="mb-0">
                  <Pagination.Prev disabled={reservationsPage <= 1} onClick={() => setReservationsPage((p) => Math.max(1, p - 1))} />
                  <Pagination.Item active>{reservationsPage}</Pagination.Item>
                  <Pagination.Next disabled={reservationsPage >= reservationsTotalPages} onClick={() => setReservationsPage((p) => Math.min(reservationsTotalPages, p + 1))} />
                </Pagination>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
      </div>
      )}

      <Modal show={showFloorModal} onHide={() => setShowFloorModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{tx('Добавить этаж', 'Qavat qo\'shish')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={addFloor}>
            <Row className="g-2">
              <Col xs={12}>
                <Form.Control
                  placeholder={tx('Название этажа', 'Qavat nomi')}
                  value={floorForm.name}
                  onChange={(event) => setFloorForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Control
                  type="number"
                  placeholder={tx('Порядок', 'Tartib')}
                  value={floorForm.sort_order}
                  onChange={(event) => setFloorForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Control type="file" accept="image/*" onChange={handleFloorImageFileChange} disabled={uploadingFloorImage} />
                <Form.Text className="text-muted">
                  {uploadingFloorImage ? tx('Загрузка и сжатие...', 'Yuklash va siqish...') : tx('Фото/план этажа (загрузка из файла)', 'Qavat rasmi/rejasi (fayldan yuklash)')}
                </Form.Text>
              </Col>
              {floorForm.image_url && (
                <Col xs={12}>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline-info" type="button" onClick={() => openImagePreview('Новый этаж', floorForm.image_url)}>
                      {tx('Просмотр', 'Ko\'rish')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      type="button"
                      onClick={() => setFloorForm((prev) => ({ ...prev, image_url: '' }))}
                    >
                      {tx('Удалить фото', 'Rasmni o\'chirish')}
                    </Button>
                  </div>
                </Col>
              )}
            </Row>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Button type="button" variant="outline-secondary" onClick={() => setShowFloorModal(false)}>
                {tx('Отмена', 'Bekor qilish')}
              </Button>
              <Button type="submit">{tx('Добавить этаж', 'Qavat qo\'shish')}</Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      <Modal show={showTableModal} onHide={() => setShowTableModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{tx('Добавить стол', 'Stol qo\'shish')} {selectedFloor ? `(${selectedFloor.name})` : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={addTable}>
            <Row className="g-2">
              <Col xs={12}>
                <Form.Control
                  placeholder={tx('Название стола', 'Stol nomi')}
                  value={tableForm.name}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Control
                  type="number"
                  min={1}
                  placeholder={tx('Вместимость', 'Sig\'im')}
                  value={tableForm.capacity}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, capacity: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Select
                  value={tableForm.template_id}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, template_id: event.target.value }))}
                >
                  <option value="">{tx('Шаблон (необязательно)', 'Shablon (ixtiyoriy)')}</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col xs={12}>
                <Form.Control type="file" accept="image/*" onChange={handleTablePhotoFileChange} disabled={uploadingTablePhoto} />
                <Form.Text className="text-muted">
                  {uploadingTablePhoto ? tx('Загрузка и сжатие...', 'Yuklash va siqish...') : tx('Реальное фото стола (из файла)', 'Stolning real rasmi (fayldan)')}
                </Form.Text>
              </Col>
              {tableForm.photo_url && (
                <Col xs={12}>
                  <div className="admin-reservation-photo-slot mb-2">
                    <img src={toAbsoluteMediaUrl(tableForm.photo_url)} alt={tx('Фото стола', 'Stol rasmi')} className="admin-reservation-photo-slot-img" />
                  </div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline-info" type="button" onClick={() => openImagePreview('Новый стол', tableForm.photo_url)}>
                      {tx('Просмотр фото', 'Rasmni ko\'rish')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      type="button"
                      onClick={() => setTableForm((prev) => ({ ...prev, photo_url: '' }))}
                    >
                      {tx('Удалить фото', 'Rasmni o\'chirish')}
                    </Button>
                  </div>
                </Col>
              )}
            </Row>
            <div className="small text-muted mt-2">
              {tx('После добавления перетащите стол на вкладке "Схема" в нужную точку.', 'Qo\'shilgandan keyin stolni "Sxema" bo\'limida kerakli joyga olib boring.')}
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Button type="button" variant="outline-secondary" onClick={() => setShowTableModal(false)}>
                {tx('Отмена', 'Bekor qilish')}
              </Button>
              <Button type="submit" disabled={!selectedFloorId}>{tx('Добавить стол', 'Stol qo\'shish')}</Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      <Modal show={showImageModal} onHide={() => setShowImageModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{imageModalTitle || tx('Фото', 'Rasm')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2">
          {imageModalUrl ? (
            <img
              src={imageModalUrl}
              alt={imageModalTitle || tx('Фото', 'Rasm')}
              style={{ width: '100%', borderRadius: 10, maxHeight: '70vh', objectFit: 'contain' }}
            />
          ) : (
            <div className="text-muted text-center p-3">{tx('Фото не найдено', 'Rasm topilmadi')}</div>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
}

export default AdminReservations;
