import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const PLAN_MIN_SCALE = 0.55;
const PLAN_MAX_SCALE = 3.4;
const PLAN_WORLD_WIDTH = 1200;
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
const parseTimeToMinutes = (value, fallback = 0) => {
  const [hhRaw, mmRaw] = String(value || '').split(':');
  const hh = Number.parseInt(hhRaw, 10);
  const mm = Number.parseInt(mmRaw, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
  return clamp((hh * 60) + mm, 0, (23 * 60) + 59);
};
const minutesToTime = (minutesValue) => {
  const minutes = clamp(Number.parseInt(minutesValue, 10) || 0, 0, (23 * 60) + 59);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};
const buildTimeSlots = (startHour = 9, endHour = 23, stepMinutes = 30) => {
  const slots = [];
  const start = startHour * 60;
  const end = (endHour * 60) + stepMinutes;
  for (let value = start; value <= end; value += stepMinutes) {
    slots.push({
      minutes: value,
      value: minutesToTime(value),
      hourLabel: `${String(Math.floor(value / 60)).padStart(2, '0')}:00`
    });
  }
  return slots;
};
const normalizeRotationAngle = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = ((parsed % 360) + 360) % 360;
  return Number(normalized.toFixed(2));
};
const formatDayLabel = (dateValue, language = 'ru') => {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', {
    weekday: 'short',
    day: '2-digit',
    month: 'long'
  });
};

function Reservations() {
  const { user, isOperator } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const t = useCallback((ru, uz) => (language === 'uz' ? uz : ru), [language]);

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
  const [bookingStep, setBookingStep] = useState('plan');
  const [planScale, setPlanScale] = useState(1);
  const [planOffset, setPlanOffset] = useState({ x: 0, y: 0 });
  const [planGestureMode, setPlanGestureMode] = useState('idle');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoTableName, setPhotoTableName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [floorImageMeta, setFloorImageMeta] = useState({ width: 0, height: 0 });
  const [isPlanFullscreen, setIsPlanFullscreen] = useState(false);

  const planStageRef = useRef(null);
  const planViewportRef = useRef(null);
  const planPointersRef = useRef(new Map());
  const planPanRef = useRef(null);
  const planPinchRef = useRef(null);
  const planScaleRef = useRef(1);
  const planOffsetRef = useRef({ x: 0, y: 0 });
  const planManualTransformRef = useRef(false);

  const restaurantId = useMemo(() => Number.parseInt(user?.active_restaurant_id, 10) || null, [user?.active_restaurant_id]);
  const selectedFloor = useMemo(() => floors.find((floor) => Number(floor.id) === Number(selectedFloorId)) || null, [floors, selectedFloorId]);
  const selectedFloorImageUrl = useMemo(() => toAbsoluteMediaUrl(selectedFloor?.image_url), [selectedFloor?.image_url]);
  const selectedTables = useMemo(() => tables.filter((table) => selectedTableIds.includes(Number(table.id))), [tables, selectedTableIds]);
  const totalSelectedCapacity = useMemo(() => selectedTables.reduce((sum, table) => sum + (Number.parseInt(table.capacity, 10) || 0), 0), [selectedTables]);
  const isCapacityEnough = totalSelectedCapacity >= guestsCount;
  const timeSlots = useMemo(() => buildTimeSlots(9, 23, 30), []);
  const timelineHourMarks = useMemo(() => timeSlots.filter((slot) => slot.minutes % 60 === 0), [timeSlots]);
  const selectedTimeSlotIndex = useMemo(() => {
    const directIndex = timeSlots.findIndex((slot) => slot.value === startTime);
    if (directIndex >= 0) return directIndex;
    const startMinutes = parseTimeToMinutes(startTime, parseTimeToMinutes(currentHourTime(), 9 * 60));
    let nearestIndex = 0;
    let nearestDiff = Number.POSITIVE_INFINITY;
    timeSlots.forEach((slot, index) => {
      const diff = Math.abs(slot.minutes - startMinutes);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }, [startTime, timeSlots]);
  const selectedDateLabel = useMemo(() => formatDayLabel(bookingDate, language), [bookingDate, language]);
  const floorAspectRatio = useMemo(() => {
    const width = Number(floorImageMeta.width || 0);
    const height = Number(floorImageMeta.height || 0);
    if (width > 0 && height > 0) return clamp(width / height, 0.45, 2.8);
    return 1.1;
  }, [floorImageMeta.width, floorImageMeta.height]);
  const planWorldHeight = useMemo(() => Math.max(560, Math.round(PLAN_WORLD_WIDTH / floorAspectRatio)), [floorAspectRatio]);
  const bookingDurationOptions = useMemo(() => [60, 90, 120, 150, 180, 210, 240], []);

  const constrainOffset = useCallback((offsetCandidate, scaleCandidate = planScaleRef.current) => {
    const viewport = planViewportRef.current?.getBoundingClientRect();
    if (!viewport) {
      return {
        x: Number(offsetCandidate?.x) || 0,
        y: Number(offsetCandidate?.y) || 0
      };
    }

    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const scaledWidth = PLAN_WORLD_WIDTH * scaleCandidate;
    const scaledHeight = planWorldHeight * scaleCandidate;
    const edgePadding = Math.min(140, Math.max(44, Math.round(Math.min(viewportWidth, viewportHeight) * 0.12)));

    let x = Number(offsetCandidate?.x) || 0;
    let y = Number(offsetCandidate?.y) || 0;

    if (scaledWidth <= viewportWidth - (edgePadding * 1.7)) {
      x = (viewportWidth - scaledWidth) / 2;
    } else {
      x = clamp(x, viewportWidth - scaledWidth - edgePadding, edgePadding);
    }

    if (scaledHeight <= viewportHeight - (edgePadding * 1.7)) {
      y = (viewportHeight - scaledHeight) / 2;
    } else {
      y = clamp(y, viewportHeight - scaledHeight - edgePadding, edgePadding);
    }

    return {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3))
    };
  }, [planWorldHeight]);

  const setPlanTransform = useCallback((nextScaleCandidate, nextOffsetCandidate) => {
    const nextScale = clamp(Number(nextScaleCandidate) || 1, PLAN_MIN_SCALE, PLAN_MAX_SCALE);
    const constrainedOffset = constrainOffset(nextOffsetCandidate, nextScale);
    const roundedScale = Number(nextScale.toFixed(4));

    setPlanScale(roundedScale);
    setPlanOffset(constrainedOffset);
    planScaleRef.current = roundedScale;
    planOffsetRef.current = constrainedOffset;
  }, [constrainOffset]);

  const fitPlanToViewport = useCallback(() => {
    const viewport = planViewportRef.current?.getBoundingClientRect();
    if (!viewport || viewport.width < 40 || viewport.height < 40) return;

    const padding = Math.min(84, Math.max(24, Math.round(Math.min(viewport.width, viewport.height) * 0.08)));
    const fitScale = clamp(
      Math.min((viewport.width - (padding * 2)) / PLAN_WORLD_WIDTH, (viewport.height - (padding * 2)) / planWorldHeight),
      PLAN_MIN_SCALE,
      PLAN_MAX_SCALE
    );
    const fitOffset = {
      x: (viewport.width - (PLAN_WORLD_WIDTH * fitScale)) / 2,
      y: (viewport.height - (planWorldHeight * fitScale)) / 2
    };

    setPlanTransform(fitScale, fitOffset);
    planManualTransformRef.current = false;
    planPointersRef.current.clear();
    planPanRef.current = null;
    planPinchRef.current = null;
    setPlanGestureMode('idle');
  }, [planWorldHeight, setPlanTransform]);

  const zoomPlanAt = useCallback((nextScaleCandidate, anchorX, anchorY) => {
    const currentScale = planScaleRef.current;
    const currentOffset = planOffsetRef.current;
    const nextScale = clamp(Number(nextScaleCandidate) || currentScale, PLAN_MIN_SCALE, PLAN_MAX_SCALE);
    if (Math.abs(nextScale - currentScale) < 0.0001) return;

    const worldX = (anchorX - currentOffset.x) / currentScale;
    const worldY = (anchorY - currentOffset.y) / currentScale;
    const nextOffset = {
      x: anchorX - (worldX * nextScale),
      y: anchorY - (worldY * nextScale)
    };

    setPlanTransform(nextScale, nextOffset);
    planManualTransformRef.current = true;
  }, [setPlanTransform]);

  const beginPanSession = useCallback((pointer) => {
    if (!pointer) return;
    planPanRef.current = {
      startX: pointer.x,
      startY: pointer.y,
      startOffset: { ...planOffsetRef.current }
    };
    planPinchRef.current = null;
    setPlanGestureMode('pan');
  }, []);

  const beginPinchSession = useCallback(() => {
    const pointerValues = Array.from(planPointersRef.current.values());
    if (pointerValues.length < 2) return;

    const viewport = planViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;

    const first = pointerValues[0];
    const second = pointerValues[1];
    const midpoint = {
      x: ((first.x + second.x) / 2) - viewport.left,
      y: ((first.y + second.y) / 2) - viewport.top
    };

    const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
    const startScale = planScaleRef.current;
    const startOffset = planOffsetRef.current;

    planPinchRef.current = {
      distance,
      startScale,
      worldX: (midpoint.x - startOffset.x) / startScale,
      worldY: (midpoint.y - startOffset.y) / startScale
    };
    planPanRef.current = null;
    setPlanGestureMode('pinch');
  }, []);

  const fetchAvailability = async (nextFloorId = selectedFloorId) => {
    if (!restaurantId || !nextFloorId || !bookingDate || !startTime) return;
    if (restaurant?.reservation_enabled !== true) {
      setTables([]);
      return;
    }
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
      setError(err.response?.data?.error || t('Ошибка загрузки столов', 'Stollarni yuklashda xatolik'));
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
        const restaurantResponse = await axios.get(`${API_URL}/products/restaurant/${restaurantId}`);
        if (!isMounted) return;
        const nextRestaurant = restaurantResponse.data || null;
        setRestaurant(nextRestaurant);

        if (nextRestaurant?.reservation_enabled !== true) {
          setFloors([]);
          setSelectedFloorId(null);
          return;
        }

        const floorsResponse = await axios.get(`${API_URL}/reservations/floors`, { params: { restaurant_id: restaurantId } });
        if (!isMounted) return;
        const nextFloors = Array.isArray(floorsResponse.data) ? floorsResponse.data : [];
        setFloors(nextFloors);
        setSelectedFloorId(nextFloors[0]?.id ? Number(nextFloors[0].id) : null);
      } catch (err) {
        if (isMounted) setError(err.response?.data?.error || t('Ошибка загрузки данных', 'Maʼlumotlarni yuklashda xatolik'));
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [restaurantId, t]);

  useEffect(() => {
    fetchAvailability();
  }, [selectedFloorId, bookingDate, startTime, durationMinutes, restaurantId]);

  useEffect(() => {
    if (!selectedFloorImageUrl) {
      setFloorImageMeta({ width: 0, height: 0 });
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setFloorImageMeta({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
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
    const listener = () => {
      const stageEl = planStageRef.current;
      if (!stageEl) {
        setIsPlanFullscreen(false);
        return;
      }
      const currentFullscreen = document.fullscreenElement;
      setIsPlanFullscreen(Boolean(currentFullscreen && (currentFullscreen === stageEl || stageEl.contains(currentFullscreen))));
    };

    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);

  useEffect(() => {
    if (!selectedFloorId) return;

    planManualTransformRef.current = false;
    planPointersRef.current.clear();
    planPanRef.current = null;
    planPinchRef.current = null;
    setPlanGestureMode('idle');

    const animationFrame = window.requestAnimationFrame(() => {
      fitPlanToViewport();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedFloorId, planWorldHeight, fitPlanToViewport]);

  useEffect(() => {
    if (bookingStep !== 'plan') return undefined;
    const animationFrame = window.requestAnimationFrame(() => {
      if (planManualTransformRef.current) {
        setPlanTransform(planScaleRef.current, planOffsetRef.current);
      } else {
        fitPlanToViewport();
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [bookingStep, setPlanTransform, fitPlanToViewport]);

  useEffect(() => {
    const viewportEl = planViewportRef.current;
    if (!viewportEl) return undefined;

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (planManualTransformRef.current) {
          setPlanTransform(planScaleRef.current, planOffsetRef.current);
        } else {
          fitPlanToViewport();
        }
      });
      observer.observe(viewportEl);
      return () => observer.disconnect();
    }

    const onResize = () => {
      if (planManualTransformRef.current) {
        setPlanTransform(planScaleRef.current, planOffsetRef.current);
      } else {
        fitPlanToViewport();
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setPlanTransform, fitPlanToViewport]);

  const handleTimelineChange = (nextIndexValue) => {
    const index = clamp(Number.parseInt(nextIndexValue, 10) || 0, 0, timeSlots.length - 1);
    const slot = timeSlots[index];
    if (slot?.value) setStartTime(slot.value);
  };

  const handlePlanPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('[data-plan-table="1"]')) return;

    const viewportEl = planViewportRef.current;
    if (!viewportEl) return;

    event.preventDefault();

    try {
      viewportEl.setPointerCapture(event.pointerId);
    } catch (_) {
      // ignore unsupported pointer capture
    }

    planPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (planPointersRef.current.size >= 2) {
      beginPinchSession();
    } else {
      beginPanSession({ x: event.clientX, y: event.clientY });
    }
  };

  const handlePlanPointerMove = (event) => {
    if (!planPointersRef.current.has(event.pointerId)) return;

    planPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (planPointersRef.current.size >= 2) {
      if (!planPinchRef.current) beginPinchSession();

      const pinch = planPinchRef.current;
      const viewport = planViewportRef.current?.getBoundingClientRect();
      const pointerValues = Array.from(planPointersRef.current.values());
      if (!pinch || !viewport || pointerValues.length < 2) return;

      const first = pointerValues[0];
      const second = pointerValues[1];
      const midpoint = {
        x: ((first.x + second.x) / 2) - viewport.left,
        y: ((first.y + second.y) / 2) - viewport.top
      };
      const distance = Math.hypot(second.x - first.x, second.y - first.y) || pinch.distance;
      const scaleRatio = distance / pinch.distance;
      const nextScale = pinch.startScale * scaleRatio;
      const nextOffset = {
        x: midpoint.x - (pinch.worldX * nextScale),
        y: midpoint.y - (pinch.worldY * nextScale)
      };

      setPlanTransform(nextScale, nextOffset);
      planManualTransformRef.current = true;
      return;
    }

    if (!planPanRef.current) return;

    const singlePointer = Array.from(planPointersRef.current.values())[0];
    if (!singlePointer) return;

    const nextOffset = {
      x: planPanRef.current.startOffset.x + (singlePointer.x - planPanRef.current.startX),
      y: planPanRef.current.startOffset.y + (singlePointer.y - planPanRef.current.startY)
    };

    setPlanTransform(planScaleRef.current, nextOffset);
    planManualTransformRef.current = true;
  };

  const endPointerSession = (event) => {
    const viewportEl = planViewportRef.current;
    if (viewportEl?.hasPointerCapture?.(event.pointerId)) {
      viewportEl.releasePointerCapture(event.pointerId);
    }

    planPointersRef.current.delete(event.pointerId);

    if (planPointersRef.current.size >= 2) {
      beginPinchSession();
      return;
    }

    if (planPointersRef.current.size === 1) {
      const remaining = Array.from(planPointersRef.current.values())[0];
      beginPanSession(remaining);
      return;
    }

    planPanRef.current = null;
    planPinchRef.current = null;
    setPlanGestureMode('idle');
  };

  const handlePlanWheel = (event) => {
    event.preventDefault();

    const viewport = planViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;

    const anchorX = event.clientX - viewport.left;
    const anchorY = event.clientY - viewport.top;
    const scaleFactor = event.deltaY < 0 ? 1.12 : 0.88;

    zoomPlanAt(planScaleRef.current * scaleFactor, anchorX, anchorY);
  };

  const handlePlanZoomIn = () => {
    const viewport = planViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    zoomPlanAt(planScaleRef.current + 0.18, viewport.width / 2, viewport.height / 2);
  };

  const handlePlanZoomOut = () => {
    const viewport = planViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    zoomPlanAt(planScaleRef.current - 0.18, viewport.width / 2, viewport.height / 2);
  };

  const handleToggleFullscreen = async () => {
    const stageEl = planStageRef.current;
    if (!stageEl || !document.fullscreenEnabled) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageEl.requestFullscreen();
      }
    } catch (_) {
      // ignore fullscreen errors
    }
  };

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
    if (restaurant?.reservation_enabled !== true) {
      setError(t('Для этого магазина бронирование отключено', 'Ushbu do‘kon uchun band qilish xizmati o‘chirilgan'));
      return;
    }
    if (!selectedTableIds.length) return setError(t('Выберите хотя бы один стол', 'Kamida bitta stol tanlang'));
    if (!isCapacityEnough) return setError(t('Вместимость выбранных столов меньше количества гостей', 'Tanlangan stollar sig‘imi mehmonlar sonidan kam'));
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
        ? `${t('Бронь создана', 'Band qilindi')}: ${response.data.reservation.reservation_number}`
        : t('Бронирование успешно создано', 'Band qilish muvaffaqiyatli yaratildi'));
      setSelectedTableIds([]);
      setComment('');
      setBookingStep('plan');
      fetchAvailability();
    } catch (err) {
      setError(err.response?.data?.error || t('Ошибка создания бронирования', 'Band qilishda xatolik'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasNoRestaurant = !restaurantId;
  const reservationEnabled = restaurant?.reservation_enabled === true;
  if (loading) return <PageSkeleton fullscreen label={t('Загрузка...', 'Yuklanmoqda...')} cards={4} />;

  return (
    <div className="client-page client-reservation-page">
      <ClientTopBar logoUrl={restaurant?.logo_url} logoDisplayMode={restaurant?.logo_display_mode} restaurantName={restaurant?.name || 'Reservation'} language={language} onToggleLanguage={toggleLanguage} fallback="🪑" maxWidth="1260px" sticky />
      <Container fluid className="client-content client-reservation-content">
        {hasNoRestaurant && <Alert variant="warning" className="border-0 shadow-sm mt-3">{t('Сначала выберите магазин', 'Avval do‘kon tanlang')}</Alert>}
        {!hasNoRestaurant && !reservationEnabled && <Alert variant="info" className="border-0 shadow-sm mt-3">{t('Для этого магазина бронирование пока отключено', 'Ushbu do‘kon uchun band qilish xizmati yoqilmagan')}</Alert>}
        {!hasNoRestaurant && reservationEnabled && (
          <>
            {error && <Alert variant="danger" className="mt-3 border-0 shadow-sm">{error}</Alert>}
            {successMessage && <Alert variant="success" className="mt-3 border-0 shadow-sm">{successMessage}</Alert>}

            <Card className="border-0 shadow-sm mt-3 client-res-top-card">
              <Card.Body>
                <div className="client-res-top-row">
                  <div>
                    <div className="client-res-top-title">{t('Бронирование', 'Band qilish')}</div>
                    <div className="client-res-top-subtitle">{selectedDateLabel || bookingDate}</div>
                  </div>
                  <div className="client-res-top-controls">
                    <Form.Control type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="client-res-date-input" />
                    <Form.Select value={durationMinutes} onChange={(e) => setDurationMinutes(Math.max(30, Number.parseInt(e.target.value, 10) || 30))} className="client-res-duration-input">
                      {bookingDurationOptions.map((durationOption) => (
                        <option key={durationOption} value={durationOption}>{t(`${durationOption} мин`, `${durationOption} daq`)}</option>
                      ))}
                    </Form.Select>
                  </div>
                </div>

                <div className="client-res-time-readout">
                  <span>{t('Время:', 'Vaqt:')}</span>
                  <strong>{startTime}</strong>
                </div>

                <input className="client-res-time-slider" type="range" min={0} max={Math.max(0, timeSlots.length - 1)} step={1} value={selectedTimeSlotIndex} onChange={(e) => handleTimelineChange(e.target.value)} />
                <div className="client-res-time-hour-strip">
                  {timelineHourMarks.map((mark) => {
                    const active = startTime.slice(0, 2) === mark.value.slice(0, 2);
                    return <button key={mark.value} type="button" className={`client-res-time-hour-btn ${active ? 'is-active' : ''}`} onClick={() => setStartTime(mark.value)}>{mark.hourLabel}</button>;
                  })}
                </div>
              </Card.Body>
            </Card>

            {bookingStep === 'plan' ? (
              <Card className="border-0 shadow-sm mt-3 mb-3 client-res-plan-card">
                <Card.Body>
                  <div className="client-res-plan-header-row">
                    <div className="client-res-plan-header-title-wrap">
                      <div className="client-res-plan-header-title">{t('Выберите стол на схеме', 'Sxemadan stol tanlang')}</div>
                      <div className="client-res-plan-header-subtitle">{selectedFloor?.name || t('Этаж не выбран', 'Qavat tanlanmagan')}</div>
                    </div>

                    <div className="client-res-plan-header-actions">
                      {loadingAvailability && <div className="text-muted small d-flex align-items-center gap-2"><Spinner animation="border" size="sm" />{t('Обновляем', 'Yangilanmoqda')}</div>}
                      <Form.Select value={selectedFloorId || ''} onChange={(e) => setSelectedFloorId(Number.parseInt(e.target.value, 10) || null)} className="client-res-floor-select">
                        {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
                      </Form.Select>
                    </div>
                  </div>

                  <div ref={planStageRef} className="client-res-plan-stage-wrap">
                    <div ref={planViewportRef} className={`client-res-plan-stage ${planGestureMode !== 'idle' ? 'is-gesturing' : ''}`} onWheel={handlePlanWheel} onPointerDown={handlePlanPointerDown} onPointerMove={handlePlanPointerMove} onPointerUp={endPointerSession} onPointerCancel={endPointerSession} onPointerLeave={(event) => { if (event.pointerType === 'mouse') endPointerSession(event); }}>
                      <div className="client-res-plan-world" style={{ width: `${PLAN_WORLD_WIDTH}px`, height: `${planWorldHeight}px`, transform: `translate(${planOffset.x}px, ${planOffset.y}px) scale(${planScale})` }}>
                        <div className="client-res-plan-floor" style={{ backgroundImage: selectedFloorImageUrl ? `url(${selectedFloorImageUrl})` : 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)' }} />

                        {tables.map((table) => {
                          const selected = selectedTableIds.includes(Number(table.id));
                          const available = Boolean(table.is_available);
                          const tableX = (normalizePlanCoordinate(table.x, 50) / 100) * PLAN_WORLD_WIDTH;
                          const tableY = (normalizePlanCoordinate(table.y, 50) / 100) * planWorldHeight;
                          const tableRotation = normalizeRotationAngle(table.rotation);
                          const templateImageUrl = toAbsoluteMediaUrl(table.template_image_url);

                          return (
                            <button key={table.id} type="button" data-plan-table="1" className={`client-res-plan-table ${selected ? 'is-selected' : ''} ${available ? '' : 'is-disabled'}`} style={{ left: `${tableX}px`, top: `${tableY}px` }} onPointerDown={(event) => event.stopPropagation()} onClick={() => toggleTableSelection(table)} disabled={!available}>
                              {table.photo_url && (
                                <span role="button" tabIndex={0} className="client-res-plan-photo-btn" onClick={(event) => { event.stopPropagation(); setPhotoTableName(String(table.name || t('Стол', 'Stol'))); setPhotoUrl(toAbsoluteMediaUrl(table.photo_url)); setShowPhotoModal(true); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setPhotoTableName(String(table.name || t('Стол', 'Stol'))); setPhotoUrl(toAbsoluteMediaUrl(table.photo_url)); setShowPhotoModal(true); } }}>📷</span>
                              )}
                              <div className="client-res-plan-table-visual" style={{ transform: `rotate(${tableRotation}deg)` }}>
                                {templateImageUrl ? <img src={templateImageUrl} alt={table.template_name || table.name} className="client-res-plan-table-img" /> : <span className="client-res-plan-table-fallback">{table.name}</span>}
                              </div>
                              <span className="client-res-plan-table-label">{table.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="client-res-plan-controls">
                      <Button size="sm" variant="light" onClick={handlePlanZoomIn}>+</Button>
                      <Button size="sm" variant="light" onClick={handlePlanZoomOut}>-</Button>
                      <Button size="sm" variant="outline-secondary" onClick={fitPlanToViewport}>{t('Центр', 'Markaz')}</Button>
                      <Button size="sm" variant="outline-secondary" onClick={handleToggleFullscreen}>{isPlanFullscreen ? t('Свернуть', 'Yig‘ish') : t('Fullscreen', 'To‘liq ekran')}</Button>
                    </div>
                  </div>

                  <div className="client-res-floor-carousel" role="tablist" aria-label={t('Этажи', 'Qavatlar')}>
                    {floors.map((floor) => {
                      const active = Number(selectedFloorId) === Number(floor.id);
                      const floorTablesCount = Number.isInteger(Number(floor.tables_count)) ? Number(floor.tables_count) : null;
                      return <button key={floor.id} type="button" className={`client-res-floor-pill ${active ? 'is-active' : ''}`} onClick={() => setSelectedFloorId(Number(floor.id))}><span>{floor.name}</span><small>{floorTablesCount ?? '•'}</small></button>;
                    })}
                  </div>

                  <div className="client-res-summary-strip">
                    <Badge bg="success">{t('Выбрано столов', 'Tanlangan stollar')}: {selectedTableIds.length}</Badge>
                    <Badge bg={isCapacityEnough ? 'primary' : 'warning'} text={isCapacityEnough ? undefined : 'dark'}>{t('Итоговая вместимость', 'Jami sig‘im')}: {totalSelectedCapacity}</Badge>
                    <Badge bg="secondary">{t('Стоимость брони', 'Band narxi')}: {formatPrice(reservationFee)}</Badge>
                  </div>

                  {!isCapacityEnough && selectedTableIds.length > 0 && <Alert variant="warning" className="border-0 mb-3">{t('Вместимости выбранных столов недостаточно для указанного количества гостей', 'Tanlangan stollar sig‘imi mehmonlar soni uchun yetarli emas')}</Alert>}

                  <div className="client-res-plan-next-row">
                    <div className="text-muted small">{t('Можно двигать карту пальцем и масштабировать щипком', 'Xaritani barmoq bilan suring va pinch bilan kattalashtiring')}</div>
                    <Button variant="primary" className="client-res-next-btn" disabled={!selectedTableIds.length || !selectedFloorId} onClick={() => setBookingStep('details')}>{t('Далее', 'Keyingi')}</Button>
                  </div>
                </Card.Body>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm mt-3 mb-3 client-res-details-card">
                <Card.Body>
                  <div className="client-res-details-head">
                    <Button variant="outline-secondary" onClick={() => setBookingStep('plan')}>{t('← Назад к схеме', '← Sxemaga qaytish')}</Button>
                    <div className="text-muted small">{selectedDateLabel || bookingDate} · {startTime}</div>
                  </div>

                  <Row className="g-3">
                    <Col lg={7}>
                      <Card className="h-100 border-0 client-res-selected-card">
                        <Card.Body>
                          <div className="client-res-selected-title">{t('Выбранные столы', 'Tanlangan stollar')}</div>
                          {selectedTables.length === 0 ? (
                            <Alert variant="warning" className="mb-0 border-0">{t('Столы не выбраны', 'Stollar tanlanmagan')}</Alert>
                          ) : (
                            <div className="client-res-selected-list">
                              {selectedTables.map((table) => {
                                const templateImageUrl = toAbsoluteMediaUrl(table.template_image_url);
                                return (
                                  <div key={table.id} className="client-res-selected-item">
                                    <div className="client-res-selected-thumb">{templateImageUrl ? <img src={templateImageUrl} alt={table.template_name || table.name} /> : <span>{table.name}</span>}</div>
                                    <div>
                                      <div className="client-res-selected-name">{table.name}</div>
                                      <div className="client-res-selected-capacity">{t('Вместимость', 'Sig‘im')}: {table.capacity || 0}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>

                    <Col lg={5}>
                      <Card className="h-100 border-0 client-res-form-card">
                        <Card.Body>
                          <Form.Group className="mb-3">
                            <Form.Label>{t('Количество гостей', 'Mehmonlar soni')}</Form.Label>
                            <Form.Control type="number" min={1} value={guestsCount} onChange={(e) => setGuestsCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} />
                          </Form.Group>

                          <Form.Group className="mb-3">
                            <Form.Label>{t('Тип брони', 'Band turi')}</Form.Label>
                            <Form.Select value={bookingMode} onChange={(e) => setBookingMode(e.target.value)}>
                              <option value="reservation_only">{t('Только бронь', 'Faqat bron')}</option>
                              <option value="with_items">{t('Бронь + блюда', 'Bron + taomlar')}</option>
                            </Form.Select>
                          </Form.Group>

                          <Form.Group className="mb-3">
                            <Form.Label>{t('Комментарий (необязательно)', 'Izoh (ixtiyoriy)')}</Form.Label>
                            <Form.Control as="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
                          </Form.Group>

                          {!isCapacityEnough && selectedTableIds.length > 0 && <Alert variant="warning" className="border-0 mb-3">{t('Выбранные столы не покрывают количество гостей', 'Tanlangan stollar mehmonlar soniga yetmaydi')}</Alert>}

                          <Button variant="success" className="w-100" disabled={submitting || !selectedTableIds.length || !selectedFloorId || !isCapacityEnough} onClick={submitReservation}>{submitting ? t('Отправляем...', 'Yuborilmoqda...') : t('Забронировать', 'Band qilish')}</Button>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            )}
          </>
        )}
      </Container>
      <Modal show={showPhotoModal} onHide={() => setShowPhotoModal(false)} centered><Modal.Header closeButton><Modal.Title>{t('Фото стола', 'Stol rasmi')}: {photoTableName}</Modal.Title></Modal.Header><Modal.Body className="p-2">{photoUrl ? <img src={photoUrl} alt={photoTableName} style={{ width: '100%', borderRadius: 10, maxHeight: '70vh', objectFit: 'contain' }} /> : <div className="text-muted p-3 text-center">{t('Фото не найдено', 'Rasm topilmadi')}</div>}</Modal.Body></Modal>
      {!isOperator() && <BottomNav />}
      {!isOperator() && <div style={{ height: 76 }} />}
    </div>
  );
}

export default Reservations;
