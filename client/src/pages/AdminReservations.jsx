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
const PLAN_WORLD_WIDTH = 1200;
const PLAN_MIN_SCALE = 0.45;
const PLAN_MAX_SCALE = 2.8;
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

const normalizeRotationAngle = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = ((parsed % 360) + 360) % 360;
  return Number(normalized.toFixed(2));
};

const toAbsoluteMediaUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = API_URL.replace('/api', '');
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
};
const extractTableCenterLabel = (name, fallback = '') => {
  const raw = String(name || '').trim();
  if (!raw) return String(fallback || '');
  const numberMatch = raw.match(/\d+/);
  if (numberMatch?.[0]) return numberMatch[0];
  return raw.length > 4 ? raw.slice(0, 4) : raw;
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

const ResetIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M4 4v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 12a8 8 0 1 1-2.34-5.66L16 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PLAN_TABLE_DRAFT_MIME = 'application/x-admin-reservation-table-draft';
const createEmptyTableForm = () => ({
  name: '',
  capacity: 2,
  template_id: '',
  photo_url: '',
  x: 50,
  y: 50
});
const TEMPLATE_CATEGORY_OPTIONS = [
  { value: 'all', ru: 'Все категории', uz: 'Barcha toifalar' },
  { value: 'tables_chairs', ru: 'Столы и стулья', uz: 'Stol va stullar' },
  { value: 'bed', ru: 'Кровати', uz: 'Krovatlar' },
  { value: 'garage_box', ru: 'Гараж / бокс', uz: 'Garaj / boks' },
  { value: 'work_desk', ru: 'Рабочий стол', uz: 'Ish stoli' },
  { value: 'bunk', ru: 'Койки', uz: 'Koykalar' }
];

function AdminReservations() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const floorPlanRef = useRef(null);
  const draggedPositionRef = useRef(null);
  const planDraggedDraftRef = useRef(null);
  const planDragDepthRef = useRef(0);
  const floorVisualSaveTimerRef = useRef(null);
  const floorVisualDraftRef = useRef({
    floorId: null,
    plan_image_opacity: 1,
    plan_dark_overlay: 0
  });
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
    time_slot_step_minutes: 30,
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
  const [tableForm, setTableForm] = useState(createEmptyTableForm);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('all');

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
  const [planTableScale, setPlanTableScale] = useState(1);
  const [planPanStart, setPlanPanStart] = useState(null);
  const [selectedPlanTableId, setSelectedPlanTableId] = useState(null);
  const [showPlanRotationControls, setShowPlanRotationControls] = useState(false);
  const [isCreatingPlanTable, setIsCreatingPlanTable] = useState(false);
  const [isPlanDropActive, setIsPlanDropActive] = useState(false);
  const [savingFloorVisual, setSavingFloorVisual] = useState(false);
  const [floorImageMeta, setFloorImageMeta] = useState({ width: 0, height: 0 });
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
  const selectedFloorImageOpacity = useMemo(
    () => clamp(asNumber(selectedFloor?.plan_image_opacity, 1), 0.25, 1),
    [selectedFloor?.plan_image_opacity]
  );
  const selectedFloorDarkOverlay = useMemo(
    () => clamp(asNumber(selectedFloor?.plan_dark_overlay, 0), 0, 0.8),
    [selectedFloor?.plan_dark_overlay]
  );
  const floorAspectRatio = useMemo(() => {
    const width = Number(floorImageMeta.width || 0);
    const height = Number(floorImageMeta.height || 0);
    if (width > 0 && height > 0) return clamp(width / height, 0.45, 2.8);
    return 1.1;
  }, [floorImageMeta.width, floorImageMeta.height]);
  const planWorldHeight = useMemo(
    () => Math.max(560, Math.round(PLAN_WORLD_WIDTH / floorAspectRatio)),
    [floorAspectRatio]
  );

  const fitPlanToCanvas = () => {
    const canvas = floorPlanRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const padding = Math.min(72, Math.max(22, Math.round(Math.min(rect.width, rect.height) * 0.08)));
    const maxWidth = Math.max(1, rect.width - (padding * 2));
    const maxHeight = Math.max(1, rect.height - (padding * 2));
    const scale = clamp(Math.min(maxWidth / PLAN_WORLD_WIDTH, maxHeight / planWorldHeight), PLAN_MIN_SCALE, PLAN_MAX_SCALE);
    const offset = {
      x: Number(((rect.width - (PLAN_WORLD_WIDTH * scale)) / 2).toFixed(2)),
      y: Number(((rect.height - (planWorldHeight * scale)) / 2).toFixed(2))
    };
    setPlanScale(Number(scale.toFixed(3)));
    setPlanOffset(offset);
  };
  const queueSaveFloorVisualConfig = (floorId, nextOpacity, nextOverlay) => {
    floorVisualDraftRef.current = {
      floorId,
      plan_image_opacity: clamp(asNumber(nextOpacity, 1), 0.25, 1),
      plan_dark_overlay: clamp(asNumber(nextOverlay, 0), 0, 0.8)
    };

    if (floorVisualSaveTimerRef.current) {
      window.clearTimeout(floorVisualSaveTimerRef.current);
    }

    floorVisualSaveTimerRef.current = window.setTimeout(async () => {
      const draft = floorVisualDraftRef.current;
      if (!draft.floorId) return;
      setSavingFloorVisual(true);
      try {
        const response = await axios.put(`${API_URL}/admin/reservations/floors/${draft.floorId}`, {
          plan_image_opacity: draft.plan_image_opacity,
          plan_dark_overlay: draft.plan_dark_overlay
        });
        const updatedFloor = response.data || null;
        if (updatedFloor?.id) {
          setFloors((prev) => prev.map((floor) => (
            Number(floor.id) === Number(updatedFloor.id)
              ? { ...floor, ...updatedFloor }
              : floor
          )));
        }
      } catch (saveError) {
        setError(tx('Не удалось сохранить визуальные настройки схемы', 'Sxema vizual sozlamalarini saqlab bo‘lmadi'));
      } finally {
        setSavingFloorVisual(false);
      }
    }, 260);
  };

  const updateSelectedFloorVisualConfig = (patch) => {
    const floorId = Number(selectedFloorId);
    if (!floorId) return;

    const nextOpacity = clamp(
      asNumber(
        Object.prototype.hasOwnProperty.call(patch || {}, 'plan_image_opacity')
          ? patch.plan_image_opacity
          : selectedFloorImageOpacity,
        selectedFloorImageOpacity
      ),
      0.25,
      1
    );
    const nextOverlay = clamp(
      asNumber(
        Object.prototype.hasOwnProperty.call(patch || {}, 'plan_dark_overlay')
          ? patch.plan_dark_overlay
          : selectedFloorDarkOverlay,
        selectedFloorDarkOverlay
      ),
      0,
      0.8
    );

    setFloors((prev) => prev.map((floor) => (
      Number(floor.id) === floorId
        ? { ...floor, plan_image_opacity: nextOpacity, plan_dark_overlay: nextOverlay }
        : floor
    )));

    queueSaveFloorVisualConfig(floorId, nextOpacity, nextOverlay);
  };
  const selectedTemplate = useMemo(
    () => templates.find((template) => Number(template.id) === Number(tableForm.template_id)) || null,
    [templates, tableForm.template_id]
  );
  const filteredTemplates = useMemo(() => (
    templates.filter((template) => (
      templateCategoryFilter === 'all'
        ? true
        : String(template?.furniture_category || 'tables_chairs') === templateCategoryFilter
    ))
  ), [templates, templateCategoryFilter]);
  const selectedPlanTable = useMemo(
    () => tables.find((table) => Number(table.id) === Number(selectedPlanTableId)) || null,
    [tables, selectedPlanTableId]
  );
  const selectedPlanTableRotation = useMemo(
    () => normalizeRotationAngle(selectedPlanTable?.rotation, 0),
    [selectedPlanTable?.rotation]
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
  const suggestedTableName = useMemo(() => {
    const maxNumber = tables.reduce((max, table) => {
      const parsed = Number.parseInt(String(table?.name || '').trim(), 10);
      if (!Number.isInteger(parsed)) return max;
      return Math.max(max, parsed);
    }, 0);
    return String(maxNumber + 1);
  }, [tables]);

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
        time_slot_step_minutes: Math.min(60, Math.max(5, asInt(nextSettings.time_slot_step_minutes, 30))),
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
    planDragDepthRef.current = 0;
    setIsPlanDropActive(false);
    planDraggedDraftRef.current = null;
  }, [selectedFloorId]);

  useEffect(() => {
    if (!selectedFloorImageUrl) {
      setFloorImageMeta({ width: 0, height: 0 });
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setFloorImageMeta({
        width: image.naturalWidth || 0,
        height: image.naturalHeight || 0
      });
    };
    image.onerror = () => {
      if (cancelled) return;
      setFloorImageMeta({ width: 0, height: 0 });
    };
    image.src = selectedFloorImageUrl;
    return () => {
      cancelled = true;
    };
  }, [selectedFloorImageUrl]);

  useEffect(() => {
    setPlanPanStart(null);
    setSelectedPlanTableId(null);
    setShowPlanRotationControls(false);
    if (selectedFloorId) {
      const storageKey = `reservation_plan_table_scale_${selectedFloorId}`;
      const stored = Number.parseFloat(window.localStorage.getItem(storageKey) || '');
      if (Number.isFinite(stored)) {
        setPlanTableScale(clamp(stored, 0.65, 1.85));
      } else {
        setPlanTableScale(1);
      }
    } else {
      setPlanTableScale(1);
    }
    const animationFrame = window.requestAnimationFrame(() => {
      fitPlanToCanvas();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedFloorId, planWorldHeight]);

  useEffect(() => {
    if (!selectedFloorId) return;
    const storageKey = `reservation_plan_table_scale_${selectedFloorId}`;
    window.localStorage.setItem(storageKey, String(clamp(asNumber(planTableScale, 1), 0.65, 1.85)));
  }, [selectedFloorId, planTableScale]);

  useEffect(() => () => {
    if (floorVisualSaveTimerRef.current) {
      window.clearTimeout(floorVisualSaveTimerRef.current);
      floorVisualSaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!selectedPlanTableId) return;
    const exists = tables.some((table) => Number(table.id) === Number(selectedPlanTableId));
    if (!exists) {
      setSelectedPlanTableId(null);
      setShowPlanRotationControls(false);
    }
  }, [tables, selectedPlanTableId]);

  useEffect(() => {
    const node = floorPlanRef.current;
    if (!node || activeTab !== 'plan') return undefined;

    const nativeWheelHandler = (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      setPlanScale((prev) => clamp(Number((prev + delta).toFixed(2)), PLAN_MIN_SCALE, PLAN_MAX_SCALE));
    };

    node.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => {
      node.removeEventListener('wheel', nativeWheelHandler);
    };
  }, [activeTab]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        reservation_fee: Math.max(0, asNumber(settings.reservation_fee, 0)),
        max_duration_minutes: Math.max(30, asInt(settings.max_duration_minutes, 180)),
        time_slot_step_minutes: Math.min(60, Math.max(5, asInt(settings.time_slot_step_minutes, 30))),
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

  const createTableByPayload = async (draftPayload, options = {}) => {
    const { showSuccessMessage = true } = options;
    const floorId = asInt(draftPayload?.floor_id, selectedFloorId || 0);
    if (!floorId) {
      setError(tx('Сначала выберите этаж', 'Avval qavatni tanlang'));
      return false;
    }

    const payload = {
      floor_id: floorId,
      name: String(draftPayload?.name || '').trim(),
      capacity: Math.max(1, asInt(draftPayload?.capacity, 1)),
      template_id: draftPayload?.template_id ? asInt(draftPayload.template_id, 0) : null,
      photo_url: String(draftPayload?.photo_url || '').trim() || null,
      x: clamp(asNumber(draftPayload?.x, 50), 2, 98),
      y: clamp(asNumber(draftPayload?.y, 50), 2, 98),
      rotation: normalizeRotationAngle(draftPayload?.rotation, 0),
      is_active: true
    };

    if (!payload.name) {
      setError(tx('Введите название стола', 'Stol nomini kiriting'));
      return false;
    }

    try {
      await axios.post(`${API_URL}/admin/reservations/tables`, payload);
      await loadTables(floorId);
      if (showSuccessMessage) {
        setSuccess(tx('Стол добавлен', 'Stol qo\'shildi'));
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка добавления стола', 'Stol qo\'shishda xatolik'));
      return false;
    }
  };

  const addTable = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const created = await createTableByPayload({
      floor_id: selectedFloorId,
      name: tableForm.name,
      capacity: tableForm.capacity,
      template_id: tableForm.template_id,
      photo_url: tableForm.photo_url,
      x: tableForm.x,
      y: tableForm.y,
      rotation: 0
    });
    if (!created) return;
    setTableForm(createEmptyTableForm());
    setShowTableModal(false);
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
    try {
      await axios.put(`${API_URL}/admin/reservations/tables/${tableId}`, {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2))
      });
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка сохранения позиции стола', 'Stol joylashuvini saqlashda xatolik'));
      await loadTables(selectedFloorId);
    }
  };

  const saveTableRotation = async (tableId, rotation) => {
    try {
      await axios.put(`${API_URL}/admin/reservations/tables/${tableId}`, {
        rotation: normalizeRotationAngle(rotation, 0)
      });
    } catch (err) {
      setError(err.response?.data?.error || tx('Ошибка сохранения поворота стола', 'Stol burilishini saqlashda xatolik'));
      await loadTables(selectedFloorId);
    }
  };

  const applyTableRotationLocally = (tableId, rotation) => {
    const normalized = normalizeRotationAngle(rotation, 0);
    setTables((prev) => prev.map((item) => (
      Number(item.id) === Number(tableId)
        ? { ...item, rotation: normalized }
        : item
    )));
    return normalized;
  };

  const handleSelectedTableRotationChange = (nextRotation) => {
    if (!selectedPlanTable) return;
    applyTableRotationLocally(selectedPlanTable.id, nextRotation);
  };

  const commitSelectedTableRotation = async (rotationOverride = null) => {
    if (!selectedPlanTable) return;
    const nextRotation = rotationOverride === null
      ? normalizeRotationAngle(selectedPlanTable.rotation, 0)
      : normalizeRotationAngle(rotationOverride, 0);
    await saveTableRotation(selectedPlanTable.id, nextRotation);
  };

  const rotateSelectedTableBy = async (delta) => {
    if (!selectedPlanTable) return;
    const nextRotation = normalizeRotationAngle(selectedPlanTableRotation + Number(delta || 0), selectedPlanTableRotation);
    applyTableRotationLocally(selectedPlanTable.id, nextRotation);
    await saveTableRotation(selectedPlanTable.id, nextRotation);
  };

  const rotatePlanTableBy = async (tableId, delta) => {
    const target = tables.find((table) => Number(table.id) === Number(tableId));
    if (!target) return;
    setSelectedPlanTableId(Number(tableId));
    const currentRotation = normalizeRotationAngle(target.rotation, 0);
    const nextRotation = normalizeRotationAngle(currentRotation + Number(delta || 0), currentRotation);
    applyTableRotationLocally(tableId, nextRotation);
    await saveTableRotation(tableId, nextRotation);
  };

  const handleTablePlanPointerDown = (event, table) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const canvas = floorPlanRef.current;
    if (!canvas) return;
    setSelectedPlanTableId(Number(table.id));
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
      width: PLAN_WORLD_WIDTH,
      height: planWorldHeight
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

  const applyTemplateSelection = (templateId) => {
    const normalizedId = templateId ? Number(templateId) : null;
    const template = templates.find((item) => Number(item.id) === normalizedId) || null;
    setTableForm((prev) => ({
      ...prev,
      template_id: normalizedId ? String(normalizedId) : '',
      capacity: template?.seats_count ? Math.max(1, asInt(template.seats_count, asInt(prev.capacity, 2))) : prev.capacity
    }));
  };

  const getPlanCoordinatesFromClientPoint = (clientX, clientY) => {
    const canvas = floorPlanRef.current;
    if (!canvas) return { x: 50, y: 50 };

    const rect = canvas.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const scale = Math.max(0.1, asNumber(planScale, 1));
    const worldX = (pointerX - planOffset.x) / scale;
    const worldY = (pointerY - planOffset.y) / scale;

    return {
      x: clamp((worldX / PLAN_WORLD_WIDTH) * 100, 2, 98),
      y: clamp((worldY / planWorldHeight) * 100, 2, 98)
    };
  };

  const buildPlanTableDraftPayload = (templateOverride) => {
    const hasTemplateOverride = templateOverride !== undefined;
    const templateIdFromOverride = templateOverride === null ? null : asInt(templateOverride, 0);
    const activeTemplate = hasTemplateOverride
      ? templates.find((item) => Number(item.id) === Number(templateIdFromOverride)) || null
      : selectedTemplate;
    const effectiveTemplateId = hasTemplateOverride
      ? templateIdFromOverride
      : (tableForm.template_id ? asInt(tableForm.template_id, 0) : null);
    const normalizedName = String(tableForm.name || '').trim() || suggestedTableName;
    return {
      floor_id: selectedFloorId,
      name: normalizedName,
      capacity: Math.max(1, asInt(tableForm.capacity, activeTemplate?.seats_count || 2)),
      template_id: effectiveTemplateId || null,
      photo_url: String(tableForm.photo_url || '').trim() || null,
      rotation: 0
    };
  };

  const clearPlanDraftDragState = () => {
    planDragDepthRef.current = 0;
    setIsPlanDropActive(false);
    planDraggedDraftRef.current = null;
  };

  const hasPlanDraftMimeType = (dataTransfer) => Array.from(dataTransfer?.types || []).includes(PLAN_TABLE_DRAFT_MIME);

  const handlePlanDraftDragStart = (event, templateOverride) => {
    if (!selectedFloorId) {
      event.preventDefault();
      setError(tx('Сначала выберите этаж', 'Avval qavatni tanlang'));
      return;
    }

    if (templateOverride === null) {
      applyTemplateSelection(null);
    } else if (templateOverride !== undefined) {
      applyTemplateSelection(templateOverride);
    }

    setError('');
    setSuccess('');
    const payload = buildPlanTableDraftPayload(templateOverride);
    planDraggedDraftRef.current = payload;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(PLAN_TABLE_DRAFT_MIME, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', JSON.stringify(payload));
  };

  const handlePlanDraftDragEnd = () => {
    clearPlanDraftDragState();
  };

  const handlePlanDragEnter = (event) => {
    if (!hasPlanDraftMimeType(event.dataTransfer)) return;
    event.preventDefault();
    planDragDepthRef.current += 1;
    setIsPlanDropActive(true);
  };

  const handlePlanDragOver = (event) => {
    if (!hasPlanDraftMimeType(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isPlanDropActive) {
      setIsPlanDropActive(true);
    }
  };

  const handlePlanDragLeave = () => {
    if (planDragDepthRef.current > 0) {
      planDragDepthRef.current -= 1;
    }
    if (planDragDepthRef.current <= 0) {
      setIsPlanDropActive(false);
    }
  };

  const handlePlanDrop = async (event) => {
    event.preventDefault();
    const raw = event.dataTransfer?.getData(PLAN_TABLE_DRAFT_MIME);
    let payload = null;

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        payload = null;
      }
    }
    if (!payload && planDraggedDraftRef.current) {
      payload = planDraggedDraftRef.current;
    }

    clearPlanDraftDragState();
    if (!payload || !selectedFloorId || isCreatingPlanTable) return;

    const { x, y } = getPlanCoordinatesFromClientPoint(event.clientX, event.clientY);
    setIsCreatingPlanTable(true);
    setError('');
    setSuccess('');
    const created = await createTableByPayload({
      ...payload,
      floor_id: selectedFloorId,
      x,
      y
    });
    setIsCreatingPlanTable(false);
    if (created) {
      setTableForm((prev) => ({
        ...prev,
        name: String(asInt(payload.name, asInt(suggestedTableName, 1)) + 1)
      }));
    }
  };

  const handlePlanPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('[data-plan-table="1"]')) return;
    setSelectedPlanTableId(null);
    setShowPlanRotationControls(false);
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
            <Col md={6}>
              <Form.Label className="d-flex align-items-center gap-2">
                <span>{tx('Шаг времени на шкале (мин.)', 'Vaqt shkalasi qadami (daq.)')}</span>
                <span
                  role="button"
                  tabIndex={0}
                  title={tx('От 5 до 60 минут. Например, 30 даст слоты 10:00, 10:30, 11:00.', '5 dan 60 daqiqagacha. Masalan, 30 bo\'lsa 10:00, 10:30, 11:00 kabi bo\'ladi.')}
                  style={{ fontSize: 14, color: '#64748b', cursor: 'help' }}
                >
                  ⓘ
                </span>
              </Form.Label>
              <Form.Control
                type="number"
                min={5}
                max={60}
                step={5}
                value={settings.time_slot_step_minutes}
                onChange={(event) => setSettings((prev) => ({ ...prev, time_slot_step_minutes: event.target.value }))}
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
                    setTableForm(createEmptyTableForm());
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
                    {tx('Быстрое добавление и размещение столов теперь доступно на вкладке "Схема" через правую панель.', 'Stollarni tez qo\'shish va joylashtirish endi "Sxema" bo\'limida o\'ng panel orqali bajariladi.')}
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
                                y: {Number.parseFloat(table.y || 0).toFixed(1)}%<br />
                                ↻: {normalizeRotationAngle(table.rotation, 0).toFixed(0)}°
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
              {isCreatingPlanTable && <span className="small text-muted">{tx('Добавляем стол...', 'Stol qo\'shilmoqda...')}</span>}
            </div>
          </Card.Header>
          <Card.Body>
            {!selectedFloorId && (
              <Alert variant="warning" className="border-0 mb-0">
                {tx('Выберите этаж для работы со схемой', 'Sxema bilan ishlash uchun qavatni tanlang')}
              </Alert>
            )}
            {!!selectedFloorId && (
            <div className="admin-reservation-plan-layout">
              <div className="admin-reservation-plan-main">
                <div className="small text-muted mb-2">
                  {tx('Схему можно двигать мышью/тачем, колесом менять масштаб. Столы перетаскиваются отдельно и сохраняются автоматически.', 'Sxemani sichqoncha/tach bilan surish mumkin, g\'ildirak bilan kattalashtirish ishlaydi. Stollar alohida sudraladi va avtomatik saqlanadi.')}
                </div>
                <div
                  ref={floorPlanRef}
                  className={`admin-reservation-plan-canvas ${isPlanDropActive ? 'is-drop-active' : ''}`}
                  onPointerDown={handlePlanPointerDown}
                  onPointerMove={handlePlanPointerMove}
                  onPointerUp={handlePlanPointerUp}
                  onPointerCancel={handlePlanPointerUp}
                  onDragEnter={handlePlanDragEnter}
                  onDragOver={handlePlanDragOver}
                  onDragLeave={handlePlanDragLeave}
                  onDrop={handlePlanDrop}
                  style={{ cursor: planPanStart ? 'grabbing' : 'grab' }}
                >
                  <div
                    className="admin-reservation-plan-world"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: `${PLAN_WORLD_WIDTH}px`,
                      height: `${planWorldHeight}px`,
                      transform: `translate(${planOffset.x}px, ${planOffset.y}px) scale(${planScale})`,
                      transformOrigin: '0 0'
                    }}
                  >
                    <div
                      className="admin-reservation-plan-floor"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: selectedFloorImageUrl
                          ? `url(${selectedFloorImageUrl})`
                          : 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                        backgroundSize: selectedFloorImageUrl ? 'contain' : 'cover',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        opacity: selectedFloorImageOpacity
                      }}
                    />
                    <div
                      className="admin-reservation-plan-floor-overlay"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `rgba(0, 0, 0, ${selectedFloorDarkOverlay})`,
                        pointerEvents: 'none'
                      }}
                    />
                    {tables.map((table) => {
                      const tableId = Number(table.id);
                      const posX = (normalizePlanCoordinate(table.x, 50) / 100) * PLAN_WORLD_WIDTH;
                      const posY = (normalizePlanCoordinate(table.y, 50) / 100) * planWorldHeight;
                      const isDragging = dragState?.tableId === tableId;
                      const isSelected = Number(selectedPlanTableId) === tableId;
                      const rotation = normalizeRotationAngle(table.rotation, 0);
                      const templateImageUrl = toAbsoluteMediaUrl(table.template_image_url);
                      const tableCenterLabel = extractTableCenterLabel(table.name, tableId);

                      return (
                        <button
                          key={`plan-table-${table.id}`}
                          type="button"
                          className={`admin-reservation-plan-table ${isDragging ? 'is-dragging' : ''} ${isSelected ? 'is-selected' : ''}`}
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
                            left: `${posX}px`,
                            top: `${posY}px`,
                            transform: `translate(-50%, -50%) scale(${clamp(asNumber(planTableScale, 1), 0.65, 1.85)})`,
                            transformOrigin: 'center center',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none',
                            zIndex: isDragging ? 6 : isSelected ? 5 : 3
                          }}
                        >
                          <div
                            className="admin-reservation-plan-table-rotate-controls"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span
                              role="button"
                              tabIndex={0}
                              className="admin-reservation-plan-table-rotate-btn is-left"
                              title={tx('Повернуть влево на 15°', '15° chapga burish')}
                              onClick={() => rotatePlanTableBy(tableId, -15)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  rotatePlanTableBy(tableId, -15);
                                }
                              }}
                            >
                              ↺
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="admin-reservation-plan-table-rotate-btn is-right"
                              title={tx('Повернуть вправо на 15°', '15° o‘ngga burish')}
                              onClick={() => rotatePlanTableBy(tableId, 15)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  rotatePlanTableBy(tableId, 15);
                                }
                              }}
                            >
                              ↻
                            </span>
                          </div>
                          <div
                            className="admin-reservation-plan-table-visual"
                            style={{
                              transform: `rotate(${rotation}deg)`,
                              transformOrigin: 'center center'
                            }}
                          >
                            {templateImageUrl ? (
                              <img
                                src={templateImageUrl}
                                alt={table.template_name || table.name}
                                className="admin-reservation-plan-table-image"
                              />
                            ) : (
                              <div className="admin-reservation-plan-table-fallback">
                                <div>{table.name}</div>
                                <div>{table.capacity || 0} {tx('мест', 'o\'rin')}</div>
                              </div>
                            )}
                            <span className="admin-reservation-plan-table-center-id">{tableCenterLabel}</span>
                          </div>
                          <div className="admin-reservation-plan-table-label">{table.name}</div>
                        </button>
                      );
                    })}
                  </div>
                  {isPlanDropActive && (
                    <div className="admin-reservation-plan-drop-hint">
                      {tx('Отпустите, чтобы добавить стол в эту точку', 'Stolni shu joyga qo\'shish uchun qo\'yib yuboring')}
                    </div>
                  )}
                  <div
                    className="admin-reservation-plan-tools"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button className="action-btn admin-reservation-action-btn" variant="primary" onClick={() => setPlanScale((prev) => clamp(Number((prev + 0.1).toFixed(2)), PLAN_MIN_SCALE, PLAN_MAX_SCALE))}>+</Button>
                    <Button className="action-btn admin-reservation-action-btn" variant="primary" onClick={() => setPlanScale((prev) => clamp(Number((prev - 0.1).toFixed(2)), PLAN_MIN_SCALE, PLAN_MAX_SCALE))}>−</Button>
                    <Button
                      className="action-btn admin-reservation-action-btn"
                      variant="primary"
                      title={tx('Подогнать схему по экрану', 'Sxemani ekranga moslash')}
                      onClick={fitPlanToCanvas}
                    >
                      <ResetIcon />
                    </Button>
                    <Button
                      className="action-btn admin-reservation-action-btn"
                      variant="primary"
                      title={tx('Повернуть стол', 'Stolni burish')}
                      disabled={!selectedPlanTable}
                      onClick={() => setShowPlanRotationControls((prev) => !prev)}
                    >
                      ↻
                    </Button>
                  </div>
                  {showPlanRotationControls && selectedPlanTable && (
                    <div
                      className="admin-reservation-plan-rotation-panel"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="admin-reservation-plan-rotation-title">
                        {tx('Поворот стола', 'Stol burilishi')}: <strong>{selectedPlanTable.name}</strong>
                      </div>
                      <div className="admin-reservation-plan-rotation-row">
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={() => rotateSelectedTableBy(-5)}
                        >
                          −5°
                        </Button>
                        <input
                          className="admin-reservation-plan-rotation-range"
                          type="range"
                          min={0}
                          max={359}
                          step={1}
                          value={Math.round(selectedPlanTableRotation)}
                          onChange={(event) => handleSelectedTableRotationChange(event.target.value)}
                          onMouseUp={(event) => commitSelectedTableRotation(event.currentTarget.value)}
                          onTouchEnd={(event) => commitSelectedTableRotation(event.currentTarget.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={() => rotateSelectedTableBy(5)}
                        >
                          +5°
                        </Button>
                      </div>
                      <div className="admin-reservation-plan-rotation-controls">
                        <Form.Control
                          type="number"
                          min={0}
                          max={359}
                          step={1}
                          value={Math.round(selectedPlanTableRotation)}
                          onChange={(event) => handleSelectedTableRotationChange(event.target.value)}
                          onBlur={(event) => commitSelectedTableRotation(event.target.value)}
                        />
                        <span className="admin-reservation-plan-rotation-degree">°</span>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={async () => {
                            handleSelectedTableRotationChange(0);
                            await commitSelectedTableRotation(0);
                          }}
                        >
                          0°
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <aside className="admin-reservation-plan-sidebar">
                <div className="small fw-semibold text-dark mb-2">{tx('Добавление стола', 'Stol qo\'shish')}</div>
                <Form.Group className="mb-2">
                  <Form.Control
                    value={tableForm.name}
                    placeholder={tx('Название стола', 'Stol nomi')}
                    onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  <Form.Text className="text-muted">
                    {tx('Если оставить пустым, подставится номер', 'Bo\'sh qoldirilsa, raqam qo\'yiladi')}: {suggestedTableName}
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Control
                    type="number"
                    min={1}
                    value={tableForm.capacity}
                    onChange={(event) => setTableForm((prev) => ({ ...prev, capacity: Math.max(1, asInt(event.target.value, 1)) }))}
                  />
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label className="small text-muted mb-1">
                    {tx('Масштаб столов на схеме', 'Sxemadagi stollar masshtabi')}
                  </Form.Label>
                  <div className="d-flex align-items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => setPlanTableScale((prev) => clamp(Number((prev - 0.05).toFixed(2)), 0.65, 1.85))}
                    >
                      −
                    </Button>
                    <Form.Range
                      min={0.65}
                      max={1.85}
                      step={0.05}
                      value={planTableScale}
                      onChange={(event) => setPlanTableScale(clamp(asNumber(event.target.value, 1), 0.65, 1.85))}
                    />
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => setPlanTableScale((prev) => clamp(Number((prev + 0.05).toFixed(2)), 0.65, 1.85))}
                    >
                      +
                    </Button>
                  </div>
                  <Form.Text className="text-muted">
                    {tx('Только для удобства редактора, на клиенте пропорции останутся ровными.', 'Faqat editor qulayligi uchun, mijoz tomonda proporsiya to‘g‘ri qoladi.')} {Math.round(clamp(asNumber(planTableScale, 1), 0.65, 1.85) * 100)}%
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label className="small text-muted mb-1">
                    {tx('Прозрачность плана', 'Sxema shaffofligi')}
                  </Form.Label>
                  <Form.Range
                    min={0.25}
                    max={1}
                    step={0.05}
                    value={selectedFloorImageOpacity}
                    onChange={(event) => updateSelectedFloorVisualConfig({ plan_image_opacity: event.target.value })}
                  />
                  <Form.Text className="text-muted">
                    {tx('Видимость схемы', 'Sxema ko‘rinishi')}: {Math.round(selectedFloorImageOpacity * 100)}%
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label className="small text-muted mb-1">
                    {tx('Наложение чёрного слоя', 'Qora qatlam')}
                  </Form.Label>
                  <Form.Range
                    min={0}
                    max={0.8}
                    step={0.05}
                    value={selectedFloorDarkOverlay}
                    onChange={(event) => updateSelectedFloorVisualConfig({ plan_dark_overlay: event.target.value })}
                  />
                  <Form.Text className="text-muted">
                    {tx('Затемнение', 'Qoraytirish')}: {Math.round(selectedFloorDarkOverlay * 100)}%
                    {savingFloorVisual ? ` · ${tx('сохранение...', 'saqlanmoqda...')}` : ''}
                  </Form.Text>
                </Form.Group>
                <div className="small text-muted mb-1">{tx('Мебель', 'Mebel')}</div>
                <div className="small text-muted mb-2">
                  {tx('Перетащите карточку мебели на схему для мгновенного добавления.', 'Tez qo\'shish uchun mebel kartasini sxemaga sudrab olib boring.')}
                </div>
                <Form.Group className="mb-2">
                  <Form.Select
                    size="sm"
                    value={templateCategoryFilter}
                    onChange={(event) => setTemplateCategoryFilter(event.target.value)}
                  >
                    {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                      <option key={`plan-template-category-${option.value}`} value={option.value}>
                        {tx(option.ru, option.uz)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <div className="admin-reservation-plan-template-grid mb-2">
                  <button
                    type="button"
                    className={`admin-reservation-plan-template-item ${!tableForm.template_id ? 'is-active' : ''}`}
                    onClick={() => applyTemplateSelection(null)}
                    draggable={Boolean(selectedFloorId) && !isCreatingPlanTable}
                    onDragStart={(event) => handlePlanDraftDragStart(event, null)}
                    onDragEnd={handlePlanDraftDragEnd}
                    title={tx('Без шаблона • перетащите на схему', 'Shablonsiz • sxemaga sudrang')}
                    disabled={!selectedFloorId || isCreatingPlanTable}
                  >
                    <span className="small text-muted">{tx('Без шаблона', 'Shablonsiz')}</span>
                  </button>
                  {filteredTemplates.map((template) => {
                    const isActive = Number(tableForm.template_id) === Number(template.id);
                    const imageUrl = toAbsoluteMediaUrl(template.image_url);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={`admin-reservation-plan-template-item ${isActive ? 'is-active' : ''}`}
                        onClick={() => applyTemplateSelection(template.id)}
                        draggable={Boolean(selectedFloorId) && !isCreatingPlanTable}
                        onDragStart={(event) => handlePlanDraftDragStart(event, template.id)}
                        onDragEnd={handlePlanDraftDragEnd}
                        title={`${template.name} • ${template.seats_count || 0}`}
                        disabled={!selectedFloorId || isCreatingPlanTable}
                      >
                        <div className="admin-reservation-plan-template-thumb">
                          {imageUrl ? (
                            <img src={imageUrl} alt={template.name} />
                          ) : (
                            <span style={{ fontSize: 18 }}>🪑</span>
                          )}
                        </div>
                        <div className="small text-truncate w-100">{template.name}</div>
                        <div className="small text-muted">{template.seats_count || 0} {tx('мест', 'o\'rin')}</div>
                      </button>
                    );
                  })}
                </div>
                <Form.Group className="mb-2">
                  <Form.Control type="file" accept="image/*" onChange={handleTablePhotoFileChange} disabled={uploadingTablePhoto} />
                  <Form.Text className="text-muted">
                    {uploadingTablePhoto ? tx('Загрузка и сжатие...', 'Yuklash va siqish...') : tx('Реальное фото стола (из файла)', 'Stolning real rasmi (fayldan)')}
                  </Form.Text>
                </Form.Group>
                {tableForm.photo_url && (
                  <div className="admin-reservation-photo-slot mb-2">
                    <img src={toAbsoluteMediaUrl(tableForm.photo_url)} alt={tx('Фото стола', 'Stol rasmi')} className="admin-reservation-photo-slot-img" />
                  </div>
                )}
              </aside>
            </div>
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
                  onChange={(event) => applyTemplateSelection(event.target.value)}
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
                <div className="small fw-semibold text-dark mb-2">
                  {tx('Галерея мебели', 'Mebel galereyasi')}
                </div>
                <Form.Group className="mb-2">
                  <Form.Select
                    size="sm"
                    value={templateCategoryFilter}
                    onChange={(event) => setTemplateCategoryFilter(event.target.value)}
                  >
                    {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                      <option key={`modal-template-category-${option.value}`} value={option.value}>
                        {tx(option.ru, option.uz)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <div className="d-flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!tableForm.template_id ? 'primary' : 'outline-secondary'}
                    onClick={() => applyTemplateSelection(null)}
                  >
                    {tx('Без шаблона', 'Shablonsiz')}
                  </Button>
                  {filteredTemplates.map((template) => {
                    const isActive = Number(tableForm.template_id) === Number(template.id);
                    const imageUrl = toAbsoluteMediaUrl(template.image_url);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={`btn p-2 border ${isActive ? 'border-primary bg-primary-subtle' : 'border-light-subtle bg-white'}`}
                        onClick={() => applyTemplateSelection(template.id)}
                        style={{
                          width: 112,
                          borderRadius: 10,
                          boxShadow: isActive ? '0 0 0 1px rgba(59,130,246,0.35)' : 'none'
                        }}
                        title={`${template.name} • ${template.seats_count || 0}`}
                      >
                        <div className="d-flex flex-column align-items-center gap-1">
                          <div
                            style={{
                              width: '100%',
                              height: 52,
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                              background: '#f8fafc',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden'
                            }}
                          >
                            {imageUrl ? (
                              <img src={imageUrl} alt={template.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: 18 }}>🪑</span>
                            )}
                          </div>
                          <div className="small text-truncate w-100" style={{ maxWidth: 96 }}>{template.name}</div>
                          <div className="small text-muted">{template.seats_count || 0} {tx('мест', 'o\'rin')}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedTemplate && (
                  <div className="small text-muted mt-2">
                    {tx('Выбрано', 'Tanlandi')}: <strong>{selectedTemplate.name}</strong>
                  </div>
                )}
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
