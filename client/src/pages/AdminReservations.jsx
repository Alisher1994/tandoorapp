import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import Nav from 'react-bootstrap/Nav';
import { formatPrice } from '../context/CartContext';

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

function AdminReservations() {
  const navigate = useNavigate();
  const floorPlanRef = useRef(null);
  const draggedPositionRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingFloorImage, setUploadingFloorImage] = useState(false);
  const [uploadingTablePhoto, setUploadingTablePhoto] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [settings, setSettings] = useState({
    enabled: false,
    reservation_fee: 0,
    reservation_service_cost: 0,
    max_duration_minutes: 180,
    allow_multi_table: true
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
  const [savingTablePositionId, setSavingTablePositionId] = useState(null);

  const selectedFloor = useMemo(
    () => floors.find((floor) => Number(floor.id) === Number(selectedFloorId)) || null,
    [floors, selectedFloorId]
  );
  const selectedFloorImageUrl = useMemo(
    () => toAbsoluteMediaUrl(selectedFloor?.image_url),
    [selectedFloor?.image_url]
  );

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
      const [settingsRes, floorsRes, templatesRes] = await Promise.all([
        axios.get(`${API_URL}/admin/reservations/settings`),
        axios.get(`${API_URL}/admin/reservations/floors`),
        axios.get(`${API_URL}/admin/reservations/table-templates`)
      ]);

      const nextSettings = settingsRes.data || {};
      const nextFloors = Array.isArray(floorsRes.data) ? floorsRes.data : [];
      const nextTemplates = Array.isArray(templatesRes.data) ? templatesRes.data : [];

      setSettings({
        enabled: !!nextSettings.enabled,
        reservation_fee: asNumber(nextSettings.reservation_fee, 0),
        reservation_service_cost: asNumber(nextSettings.reservation_service_cost, 0),
        max_duration_minutes: asInt(nextSettings.max_duration_minutes, 180),
        allow_multi_table: nextSettings.allow_multi_table !== false
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
      setError(err.response?.data?.error || 'Ошибка загрузки данных бронирования');
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
    setDragState(null);
    draggedPositionRef.current = null;
  }, [selectedFloorId]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        enabled: !!settings.enabled,
        reservation_fee: Math.max(0, asNumber(settings.reservation_fee, 0)),
        reservation_service_cost: Math.max(0, asNumber(settings.reservation_service_cost, 0)),
        max_duration_minutes: Math.max(30, asInt(settings.max_duration_minutes, 180)),
        allow_multi_table: !!settings.allow_multi_table
      };
      await axios.put(`${API_URL}/admin/reservations/settings`, payload);
      setSuccess('Настройки бронирования сохранены');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сохранения настроек');
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
        setError('Введите название этажа');
        return;
      }
      const response = await axios.post(`${API_URL}/admin/reservations/floors`, payload);
      const created = response.data;
      const nextFloors = [...floors, created].sort((a, b) => asInt(a.sort_order) - asInt(b.sort_order));
      setFloors(nextFloors);
      setSelectedFloorId(created.id);
      setFloorForm({ name: '', sort_order: 0, image_url: '' });
      setShowFloorModal(false);
      setSuccess('Этаж добавлен');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка создания этажа');
    }
  };

  const deleteFloor = async (floorId) => {
    const target = floors.find((item) => Number(item.id) === Number(floorId));
    if (!target) return;
    if (!window.confirm(`Удалить этаж "${target.name}"?`)) return;

    setError('');
    setSuccess('');
    try {
      await axios.delete(`${API_URL}/admin/reservations/floors/${floorId}`);
      const nextFloors = floors.filter((item) => Number(item.id) !== Number(floorId));
      setFloors(nextFloors);
      const nextSelected = nextFloors[0]?.id ? Number(nextFloors[0].id) : null;
      setSelectedFloorId(nextSelected);
      setSuccess('Этаж удален');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления этажа');
    }
  };

  const addTable = async (event) => {
    event.preventDefault();
    if (!selectedFloorId) {
      setError('Сначала выберите этаж');
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
        setError('Введите название стола');
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
      setSuccess('Стол добавлен');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка добавления стола');
    }
  };

  const deleteTable = async (tableId) => {
    const target = tables.find((item) => Number(item.id) === Number(tableId));
    if (!target) return;
    if (!window.confirm(`Удалить стол "${target.name}"?`)) return;

    setError('');
    setSuccess('');
    try {
      await axios.delete(`${API_URL}/admin/reservations/tables/${tableId}`);
      await loadTables(selectedFloorId);
      setSuccess('Стол удален');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления стола');
    }
  };

  const acceptAndPay = async (reservationId) => {
    setError('');
    setSuccess('');
    try {
      await axios.post(`${API_URL}/admin/reservations/${reservationId}/accept-and-pay`);
      await loadReservations(statusFilter);
      setSuccess('Бронирование подтверждено, списание выполнено');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка подтверждения бронирования');
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
      setSuccess('Статус бронирования обновлен');
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка обновления статуса');
    }
  };

  const openImagePreview = (title, url) => {
    const src = toAbsoluteMediaUrl(url);
    if (!src) return;
    setImageModalTitle(title || 'Фото');
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
      setSuccess('Фото этажа загружено');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки фото этажа');
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
      setSuccess('Фото стола загружено');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки фото стола');
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
      setError(err.response?.data?.error || 'Ошибка сохранения позиции стола');
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
      width: rect.width || 1,
      height: rect.height || 1
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleTablePlanPointerMove = (event, tableId) => {
    if (!dragState || dragState.tableId !== tableId) return;
    const deltaXPercent = ((event.clientX - dragState.startClientX) / dragState.width) * 100;
    const deltaYPercent = ((event.clientY - dragState.startClientY) / dragState.height) * 100;
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

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <Container fluid className="py-3">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h4 className="mb-1">Управление бронированием</h4>
          <div className="text-muted small">Этажи, фото этажей, столы, вместимость и статусы броней</div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={() => navigate('/admin')}>
            Назад в админку
          </Button>
          <Button variant="outline-primary" onClick={loadInitial}>
            Обновить
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" className="border-0">{error}</Alert>}
      {success && <Alert variant="success" className="border-0">{success}</Alert>}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Badge bg="secondary">Этажей: {floors.length}</Badge>
        <Badge bg="secondary">Столов: {tables.length}</Badge>
        <Badge bg="secondary">Заявок: {reservations.length}</Badge>
        {selectedFloor && <Badge bg="info" text="dark">Текущий этаж: {selectedFloor.name}</Badge>}
      </div>

      <Card className="border-0 shadow-sm mb-3">
        <Card.Body className="py-2">
          <Nav variant="pills" activeKey={activeTab} onSelect={(key) => setActiveTab(key || 'settings')} className="gap-2 flex-wrap">
            <Nav.Item><Nav.Link eventKey="settings">Настройки</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="floors">Этажи</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="tables">Столы</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="plan">Схема</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="requests">Заявки</Nav.Link></Nav.Item>
          </Nav>
        </Card.Body>
      </Card>

      {activeTab === 'settings' && (
      <Card className="border-0 shadow-sm mb-3">
        <Card.Header className="bg-white fw-semibold">Настройки сервиса брони</Card.Header>
        <Card.Body>
          <Row className="g-3">
            <Col md={2}>
              <Form.Check
                type="switch"
                label="Включить бронирование"
                checked={!!settings.enabled}
                onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
            </Col>
            <Col md={3}>
              <Form.Label>Фиксированная цена брони (для клиента)</Form.Label>
              <Form.Control
                type="number"
                min={0}
                step="100"
                value={settings.reservation_fee}
                onChange={(event) => setSettings((prev) => ({ ...prev, reservation_fee: event.target.value }))}
              />
            </Col>
            <Col md={3}>
              <Form.Label>Списание сервиса с магазина</Form.Label>
              <Form.Control
                type="number"
                min={0}
                step="100"
                value={settings.reservation_service_cost}
                onChange={(event) => setSettings((prev) => ({ ...prev, reservation_service_cost: event.target.value }))}
              />
            </Col>
            <Col md={2}>
              <Form.Label>Макс. длительность (мин.)</Form.Label>
              <Form.Control
                type="number"
                min={30}
                step={30}
                value={settings.max_duration_minutes}
                onChange={(event) => setSettings((prev) => ({ ...prev, max_duration_minutes: event.target.value }))}
              />
            </Col>
            <Col md={2}>
              <Form.Check
                className="mt-4"
                type="switch"
                label="Разрешить несколько столов"
                checked={!!settings.allow_multi_table}
                onChange={(event) => setSettings((prev) => ({ ...prev, allow_multi_table: event.target.checked }))}
              />
            </Col>
          </Row>

          <div className="mt-3">
            <Button variant="primary" onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? 'Сохраняем...' : 'Сохранить настройки'}
            </Button>
          </div>
        </Card.Body>
      </Card>
      )}

      {(activeTab === 'floors' || activeTab === 'tables') && (
      <Row className="g-3">
        {activeTab === 'floors' && (
        <Col lg={12}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold">Этажи</Card.Header>
            <Card.Body>
              <div className="d-flex justify-content-end mb-3">
                <Button
                  onClick={() => {
                    setFloorForm({ name: '', sort_order: floors.length, image_url: '' });
                    setShowFloorModal(true);
                  }}
                >
                  Добавить этаж
                </Button>
              </div>

              <div className="d-flex flex-column gap-2">
                {floors.length === 0 && (
                  <div className="text-muted small">Этажи пока не добавлены</div>
                )}
                {floors.map((floor) => (
                  <div
                    key={floor.id}
                    className="d-flex align-items-center justify-content-between p-2 rounded border"
                    style={{
                      background: Number(selectedFloorId) === Number(floor.id) ? '#f4f8ff' : '#fff'
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-sm text-start p-0 d-flex align-items-center gap-2"
                      onClick={() => setSelectedFloorId(Number(floor.id))}
                    >
                      <span className="fw-semibold">{floor.name}</span>
                      {!!floor.image_url && (
                        <Badge bg="info" text="dark">Фото</Badge>
                      )}
                    </button>
                    <div className="d-flex gap-1">
                      {!!floor.image_url && (
                        <Button
                          size="sm"
                          variant="outline-info"
                          onClick={() => openImagePreview(`Этаж: ${floor.name}`, floor.image_url)}
                        >
                          👁
                        </Button>
                      )}
                      <Button size="sm" variant="outline-danger" onClick={() => deleteFloor(floor.id)}>
                        Удалить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
        )}

        {activeTab === 'tables' && (
        <Col lg={12}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span>Столы {selectedFloor ? `(${selectedFloor.name})` : ''}</span>
              <div className="d-flex align-items-center gap-2">
                <Form.Select
                  size="sm"
                  style={{ minWidth: 220 }}
                  value={selectedFloorId || ''}
                  onChange={(event) => setSelectedFloorId(Number(event.target.value) || null)}
                >
                  <option value="">Выберите этаж</option>
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>{floor.name}</option>
                  ))}
                </Form.Select>
                <Button
                  size="sm"
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
                  Добавить стол
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {!selectedFloorId && (
                <Alert variant="warning" className="border-0">
                  Сначала выберите этаж
                </Alert>
              )}

              {!!selectedFloorId && (
                <>
                  <div className="small text-muted mb-3">
                    Добавьте стол через кнопку вверху, затем перетащите его на вкладке "Схема".
                  </div>

                  {loadingTables ? (
                    <div className="text-muted">Загрузка столов...</div>
                  ) : (
                    <div className="table-responsive">
                      <Table size="sm" hover className="align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Стол</th>
                            <th>Вместимость</th>
                            <th>Шаблон</th>
                            <th>Позиция</th>
                            <th>Фото</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {tables.map((table) => (
                            <tr key={table.id}>
                              <td>{table.name}</td>
                              <td>{table.capacity}</td>
                              <td>{table.template_name || '—'}</td>
                              <td className="small text-muted">
                                x: {Number.parseFloat(table.x || 0).toFixed(1)}%<br />
                                y: {Number.parseFloat(table.y || 0).toFixed(1)}%
                              </td>
                              <td>
                                {table.photo_url ? (
                                  <Button
                                    size="sm"
                                    variant="outline-info"
                                    onClick={() => openImagePreview(`Стол: ${table.name}`, table.photo_url)}
                                  >
                                    Открыть
                                  </Button>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td className="text-end">
                                <Button size="sm" variant="outline-danger" onClick={() => deleteTable(table.id)}>
                                  Удалить
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {tables.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-muted text-center py-3">Столов пока нет</td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
        )}
      </Row>
      )}

      {activeTab === 'plan' && (
        <Card className="border-0 shadow-sm mt-3">
          <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Схема этажа: {selectedFloor?.name || '—'}</span>
            <div className="d-flex align-items-center gap-2">
              <Form.Select
                size="sm"
                style={{ minWidth: 220 }}
                value={selectedFloorId || ''}
                onChange={(event) => setSelectedFloorId(Number(event.target.value) || null)}
              >
                <option value="">Выберите этаж</option>
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>{floor.name}</option>
                ))}
              </Form.Select>
              {savingTablePositionId && (
                <span className="small text-muted">Сохраняем позицию стола...</span>
              )}
            </div>
          </Card.Header>
          <Card.Body>
            {!selectedFloorId && (
              <Alert variant="warning" className="border-0 mb-0">
                Выберите этаж для работы со схемой
              </Alert>
            )}
            {!!selectedFloorId && (
            <>
            <div className="small text-muted mb-2">
              Перетащите стол в нужную точку. Позиция сохраняется автоматически после отпускания.
            </div>
            <div
              ref={floorPlanRef}
              style={{
                position: 'relative',
                width: '100%',
                height: '58vh',
                minHeight: 360,
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#f8fafc',
                backgroundImage: selectedFloorImageUrl
                  ? `url(${selectedFloorImageUrl})`
                  : 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              {tables.map((table) => {
                const tableId = Number(table.id);
                const posX = normalizePlanCoordinate(table.x, 50);
                const posY = normalizePlanCoordinate(table.y, 50);
                const isDragging = dragState?.tableId === tableId;

                return (
                  <button
                    key={`plan-table-${table.id}`}
                    type="button"
                    onPointerDown={(event) => handleTablePlanPointerDown(event, table)}
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
                        ? 'color-mix(in srgb, var(--primary-color) 14%, #fff)'
                        : 'rgba(255,255,255,0.92)',
                      boxShadow: '0 6px 16px rgba(15,23,42,0.14)',
                      padding: '6px 8px',
                      cursor: isDragging ? 'grabbing' : 'grab',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>{table.name}</div>
                    <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.1 }}>{table.capacity || 0} мест</div>
                  </button>
                );
              })}
            </div>
            </>
            )}
          </Card.Body>
        </Card>
      )}

      {activeTab === 'requests' && (
      <Card className="border-0 shadow-sm mt-3">
        <Card.Header className="bg-white d-flex justify-content-between align-items-center">
          <span className="fw-semibold">Заявки на бронирование</span>
          <div className="d-flex gap-2">
            <Form.Select
              size="sm"
              value={statusFilter}
              onChange={async (event) => {
                const next = event.target.value;
                setStatusFilter(next);
                await loadReservations(next);
              }}
            >
              <option value="all">Все статусы</option>
              {RESERVATION_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Form.Select>
            <Button size="sm" variant="outline-primary" onClick={() => loadReservations(statusFilter)}>
              Обновить
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Номер</th>
                  <th>Дата/время</th>
                  <th>Столы</th>
                  <th>Гости</th>
                  <th>Предоплата</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => (
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
                      {reservation.is_paid && <Badge bg="info" text="dark" className="ms-1">Списание ОК</Badge>}
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <div className="d-flex gap-2 flex-wrap">
                        {!reservation.is_paid && !['cancelled', 'completed', 'no_show'].includes(String(reservation.status || '').toLowerCase()) && (
                          <Button size="sm" variant="outline-success" onClick={() => acceptAndPay(reservation.id)}>
                            Принять и списать
                          </Button>
                        )}
                        <Form.Select
                          size="sm"
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
                        <Button size="sm" variant="outline-primary" onClick={() => updateReservationStatus(reservation.id)}>
                          Обновить статус
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-3">
                      Бронирований пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
      )}

      <Modal show={showFloorModal} onHide={() => setShowFloorModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Добавить этаж</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={addFloor}>
            <Row className="g-2">
              <Col xs={12}>
                <Form.Control
                  placeholder="Название этажа"
                  value={floorForm.name}
                  onChange={(event) => setFloorForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Control
                  type="number"
                  placeholder="Порядок"
                  value={floorForm.sort_order}
                  onChange={(event) => setFloorForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Control type="file" accept="image/*" onChange={handleFloorImageFileChange} disabled={uploadingFloorImage} />
                <Form.Text className="text-muted">
                  {uploadingFloorImage ? 'Загрузка и сжатие...' : 'Фото/план этажа (загрузка из файла)'}
                </Form.Text>
              </Col>
              {floorForm.image_url && (
                <Col xs={12}>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline-info" type="button" onClick={() => openImagePreview('Новый этаж', floorForm.image_url)}>
                      Просмотр
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      type="button"
                      onClick={() => setFloorForm((prev) => ({ ...prev, image_url: '' }))}
                    >
                      Удалить фото
                    </Button>
                  </div>
                </Col>
              )}
            </Row>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Button type="button" variant="outline-secondary" onClick={() => setShowFloorModal(false)}>
                Отмена
              </Button>
              <Button type="submit">Добавить этаж</Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      <Modal show={showTableModal} onHide={() => setShowTableModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Добавить стол {selectedFloor ? `(${selectedFloor.name})` : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={addTable}>
            <Row className="g-2">
              <Col xs={12}>
                <Form.Control
                  placeholder="Название стола"
                  value={tableForm.name}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Control
                  type="number"
                  min={1}
                  placeholder="Вместимость"
                  value={tableForm.capacity}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, capacity: event.target.value }))}
                />
              </Col>
              <Col xs={12}>
                <Form.Select
                  value={tableForm.template_id}
                  onChange={(event) => setTableForm((prev) => ({ ...prev, template_id: event.target.value }))}
                >
                  <option value="">Шаблон (необязательно)</option>
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
                  {uploadingTablePhoto ? 'Загрузка и сжатие...' : 'Реальное фото стола (из файла)'}
                </Form.Text>
              </Col>
              {tableForm.photo_url && (
                <Col xs={12}>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline-info" type="button" onClick={() => openImagePreview('Новый стол', tableForm.photo_url)}>
                      Просмотр фото
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      type="button"
                      onClick={() => setTableForm((prev) => ({ ...prev, photo_url: '' }))}
                    >
                      Удалить фото
                    </Button>
                  </div>
                </Col>
              )}
            </Row>
            <div className="small text-muted mt-2">
              После добавления перетащите стол на вкладке "Схема" в нужную точку.
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Button type="button" variant="outline-secondary" onClick={() => setShowTableModal(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={!selectedFloorId}>Добавить стол</Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      <Modal show={showImageModal} onHide={() => setShowImageModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{imageModalTitle || 'Фото'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2">
          {imageModalUrl ? (
            <img
              src={imageModalUrl}
              alt={imageModalTitle || 'Фото'}
              style={{ width: '100%', borderRadius: 10, maxHeight: '70vh', objectFit: 'contain' }}
            />
          ) : (
            <div className="text-muted text-center p-3">Фото не найдено</div>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
}

export default AdminReservations;
