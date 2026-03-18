import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, LocateFixed, Expand, Minimize } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ClientTopBar from '../components/ClientTopBar';
import { PageSkeleton } from '../components/SkeletonUI';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const PLAN_MIN_SCALE = 0.35;
const PLAN_MAX_SCALE = 3.4;
const PLAN_WORLD_WIDTH = 1200;
const DEFAULT_WORK_START_MINUTES = 9 * 60;
const DEFAULT_WORK_END_MINUTES = 23 * 60;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeTimeSlotStep = (value, fallback = 30) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return clamp(parsed, 5, 60);
};
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
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(raw)) return raw;
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
const addMinutesWithinDay = (timeValue, durationMinutes) => {
  const base = parseTimeToMinutes(timeValue, Number.NaN);
  const delta = Number.parseInt(durationMinutes, 10);
  if (!Number.isFinite(base) || !Number.isFinite(delta) || delta <= 0) return '';
  const target = base + delta;
  if (target > (23 * 60) + 59) return '';
  return minutesToTime(target);
};
const buildTimeSlots = (startMinutesRaw = DEFAULT_WORK_START_MINUTES, endMinutesRaw = DEFAULT_WORK_END_MINUTES, stepMinutes = 30) => {
  const step = clamp(Number.parseInt(stepMinutes, 10) || 30, 5, 60);
  const startMinutes = clamp(Number.parseInt(startMinutesRaw, 10) || DEFAULT_WORK_START_MINUTES, 0, (23 * 60) + 59);
  const endMinutes = clamp(Number.parseInt(endMinutesRaw, 10) || DEFAULT_WORK_END_MINUTES, 0, (23 * 60) + 59);
  if (endMinutes <= startMinutes) {
    return [{
      minutes: startMinutes,
      value: minutesToTime(startMinutes),
      hourLabel: `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:00`
    }];
  }
  const slots = [];
  for (let value = startMinutes; value <= endMinutes; value += step) {
    slots.push({
      minutes: value,
      value: minutesToTime(value),
      hourLabel: `${String(Math.floor(value / 60)).padStart(2, '0')}:00`
    });
  }
  const lastSlotMinutes = slots[slots.length - 1]?.minutes;
  if (Number.isFinite(lastSlotMinutes) && lastSlotMinutes < endMinutes) {
    slots.push({
      minutes: endMinutes,
      value: minutesToTime(endMinutes),
      hourLabel: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:00`
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
const extractTableCenterLabel = (name, fallback = '') => {
  const raw = String(name || '').trim();
  if (!raw) return String(fallback || '');
  const numberMatch = raw.match(/\d+/);
  if (numberMatch?.[0]) return numberMatch[0];
  return raw.length > 4 ? raw.slice(0, 4) : raw;
};
const formatDateCompact = (dateValue) => {
  const [yyyy, mm, dd] = String(dateValue || '').split('-');
  if (!yyyy || !mm || !dd) return String(dateValue || '');
  return `${dd}.${mm}.${yyyy}`;
};
const resolveWorkingWindow = (workStartTime, workEndTime) => {
  const startMinutes = parseTimeToMinutes(workStartTime, Number.NaN);
  const endMinutes = parseTimeToMinutes(workEndTime, Number.NaN);

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return {
      startMinutes: DEFAULT_WORK_START_MINUTES,
      endMinutes: DEFAULT_WORK_END_MINUTES,
      startLabel: minutesToTime(DEFAULT_WORK_START_MINUTES),
      endLabel: minutesToTime(DEFAULT_WORK_END_MINUTES)
    };
  }

  return {
    startMinutes,
    endMinutes,
    startLabel: minutesToTime(startMinutes),
    endLabel: minutesToTime(endMinutes)
  };
};

function Reservations() {
  const navigate = useNavigate();
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
  const [timeSlotStepMinutes, setTimeSlotStepMinutes] = useState(30);
  const [workingWindow, setWorkingWindow] = useState(() => resolveWorkingWindow('', ''));
  const [reservationFee, setReservationFee] = useState(0);
  const [reservationServiceCost, setReservationServiceCost] = useState(0);
  const [guestsCount, setGuestsCount] = useState(2);
  const [bookingMode, setBookingMode] = useState('reservation_only');
  const [comment, setComment] = useState('');
  const [allowMultiTable, setAllowMultiTable] = useState(true);
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [bookingStep, setBookingStep] = useState('plan');
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const [planScale, setPlanScale] = useState(1);
  const [planOffset, setPlanOffset] = useState({ x: 0, y: 0 });
  const [planGestureMode, setPlanGestureMode] = useState('idle');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoTableName, setPhotoTableName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [reservationReceipt, setReservationReceipt] = useState(null);
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
  const timeRulerRef = useRef(null);
  const timeRulerAutoScrollRef = useRef(false);
  const timeRulerManualScrollRef = useRef(false);
  const timeRulerManualScrollTimeoutRef = useRef(null);
  const timeRulerSyncRafRef = useRef(null);
  const latestStartTimeRef = useRef(startTime);
  const lastAvailabilityKeyRef = useRef('');
  const availabilityRequestIdRef = useRef(0);

  const restaurantId = useMemo(() => Number.parseInt(user?.active_restaurant_id, 10) || null, [user?.active_restaurant_id]);
  const selectedFloor = useMemo(() => floors.find((floor) => Number(floor.id) === Number(selectedFloorId)) || null, [floors, selectedFloorId]);
  const selectedFloorImageUrl = useMemo(() => toAbsoluteMediaUrl(selectedFloor?.image_url), [selectedFloor?.image_url]);
  const selectedTables = useMemo(() => tables.filter((table) => selectedTableIds.includes(Number(table.id))), [tables, selectedTableIds]);
  const totalSelectedCapacity = useMemo(() => selectedTables.reduce((sum, table) => sum + (Number.parseInt(table.capacity, 10) || 0), 0), [selectedTables]);
  const isCapacityEnough = totalSelectedCapacity >= guestsCount;
  const timeSlots = useMemo(
    () => buildTimeSlots(workingWindow.startMinutes, workingWindow.endMinutes, normalizeTimeSlotStep(timeSlotStepMinutes, 30)),
    [workingWindow.startMinutes, workingWindow.endMinutes, timeSlotStepMinutes]
  );
  const bookingDateCompact = useMemo(() => formatDateCompact(bookingDate), [bookingDate]);
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
  const planWorldHeight = useMemo(() => Math.max(560, Math.round(PLAN_WORLD_WIDTH / floorAspectRatio)), [floorAspectRatio]);
  const bookingDurationOptions = useMemo(() => [60, 90, 120, 150, 180, 210, 240], []);
  const minDurationMinutes = useMemo(() => Math.min(...bookingDurationOptions), [bookingDurationOptions]);
  const bookingEndOptions = useMemo(
    () => bookingDurationOptions
      .map((durationOption) => ({
        duration: durationOption,
        endTime: addMinutesWithinDay(startTime, durationOption)
      }))
      .filter((option) => Boolean(option.endTime)),
    [bookingDurationOptions, startTime]
  );
  const selectedEndTime = useMemo(() => addMinutesWithinDay(startTime, durationMinutes), [startTime, durationMinutes]);
  const bookingTotalCost = useMemo(() => Math.max(0, reservationFee) + Math.max(0, reservationServiceCost), [reservationFee, reservationServiceCost]);
  const moneyLabel = useMemo(() => {
    const code = String(restaurant?.currency_code || '').toLowerCase();
    if (code === 'kz') return '₸';
    if (code === 'tm') return 'TMT';
    if (code === 'tj') return 'сомони';
    if (code === 'kg') return 'сом';
    if (code === 'af') return 'AFN';
    if (code === 'ru') return '₽';
    return t('сум', 'so‘m');
  }, [restaurant?.currency_code, t]);
  const formatMoney = useCallback((value) => {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    return new Intl.NumberFormat(language === 'uz' ? 'uz-UZ' : 'ru-RU').format(Math.round(amount));
  }, [language]);
  const resolveMainMenuPath = useCallback(() => {
    const isOperatorUser = typeof isOperator === 'function'
      ? isOperator()
      : (user?.role === 'operator' || user?.role === 'superadmin');
    return isOperatorUser ? '/admin' : '/catalog';
  }, [isOperator, user?.role]);
  const handleBackClick = useCallback(() => {
    if (bookingStep !== 'plan') {
      setBookingStep('plan');
      return;
    }
    navigate(resolveMainMenuPath());
  }, [bookingStep, navigate, resolveMainMenuPath]);
  const handleBrandClick = useCallback(() => {
    navigate(resolveMainMenuPath());
  }, [navigate, resolveMainMenuPath]);

  const constrainOffset = useCallback((offsetCandidate) => ({
    x: Number((Number(offsetCandidate?.x) || 0).toFixed(3)),
    y: Number((Number(offsetCandidate?.y) || 0).toFixed(3))
  }), []);

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

  const fetchAvailability = useCallback(async (nextFloorId = selectedFloorId, overrides = {}) => {
    const requestId = availabilityRequestIdRef.current + 1;
    availabilityRequestIdRef.current = requestId;

    const effectiveDate = String(overrides.bookingDate || bookingDate || '').trim();
    const effectiveStartTime = String(overrides.startTime || startTime || '').trim();
    const effectiveDuration = Number.parseInt(overrides.durationMinutes ?? durationMinutes, 10);
    const availabilityKey = `${restaurantId || 0}:${nextFloorId || 0}:${effectiveDate}:${effectiveStartTime}:${effectiveDuration || 0}`;
    if (!overrides.force && availabilityKey === lastAvailabilityKeyRef.current) return;

    if (!restaurantId || !nextFloorId || !effectiveDate || !effectiveStartTime) return;
    const optimisticEndTime = addMinutesWithinDay(effectiveStartTime, effectiveDuration);
    if (!optimisticEndTime) return;
    if (parseTimeToMinutes(optimisticEndTime, Number.NaN) > workingWindow.endMinutes) return;
    if (restaurant?.reservation_enabled !== true) {
      setTables([]);
      lastAvailabilityKeyRef.current = '';
      return;
    }
    lastAvailabilityKeyRef.current = availabilityKey;
    setLoadingAvailability(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/reservations/availability`, {
        params: {
          restaurant_id: restaurantId,
          floor_id: nextFloorId,
          date: effectiveDate,
          start_time: effectiveStartTime,
          duration_minutes: effectiveDuration
        }
      });
      if (requestId !== availabilityRequestIdRef.current) return;
      const payload = response.data || {};
      const nextTables = Array.isArray(payload.tables) ? payload.tables : [];
      setTables(nextTables);
      setAllowMultiTable(payload.allow_multi_table !== false);
      setTimeSlotStepMinutes(normalizeTimeSlotStep(payload.time_slot_step_minutes, 30));
      setReservationFee(Number.isFinite(Number(payload.reservation_fee)) ? Number(payload.reservation_fee) : 0);
      setReservationServiceCost(Number.isFinite(Number(payload.reservation_service_cost)) ? Number(payload.reservation_service_cost) : 0);
      setWorkingWindow(resolveWorkingWindow(payload.work_start_time, payload.work_end_time));
      setSelectedTableIds((prev) => {
        const availableIds = new Set(nextTables.filter((t) => t.is_available).map((t) => Number(t.id)));
        const filtered = prev.filter((id) => availableIds.has(Number(id)));
        return payload.allow_multi_table === false && filtered.length > 1 ? filtered.slice(0, 1) : filtered;
      });
    } catch (err) {
      if (requestId !== availabilityRequestIdRef.current) return;
      lastAvailabilityKeyRef.current = '';
      setError(err.response?.data?.error || t('Ошибка загрузки столов', 'Stollarni yuklashda xatolik'));
      setTables([]);
    } finally {
      if (requestId !== availabilityRequestIdRef.current) return;
      setLoadingAvailability(false);
    }
  }, [selectedFloorId, bookingDate, startTime, durationMinutes, restaurantId, workingWindow.endMinutes, restaurant?.reservation_enabled, t]);

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
        const nextWindow = resolveWorkingWindow(nextRestaurant?.work_start_time, nextRestaurant?.work_end_time);
        setWorkingWindow(nextWindow);
        setReservationFee(Number.isFinite(Number(nextRestaurant?.reservation_fee)) ? Number(nextRestaurant.reservation_fee) : 0);
        setReservationServiceCost(Number.isFinite(Number(nextRestaurant?.reservation_service_cost)) ? Number(nextRestaurant.reservation_service_cost) : 0);
        setStartTime((prev) => {
          const prevMinutes = parseTimeToMinutes(prev, nextWindow.startMinutes);
          if (prevMinutes >= nextWindow.startMinutes && prevMinutes <= nextWindow.endMinutes) {
            return prev;
          }
          return minutesToTime(nextWindow.startMinutes);
        });

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
  }, [fetchAvailability]);

  useEffect(() => () => {
    if (timeRulerManualScrollTimeoutRef.current) {
      window.clearTimeout(timeRulerManualScrollTimeoutRef.current);
      timeRulerManualScrollTimeoutRef.current = null;
    }
    if (timeRulerSyncRafRef.current) {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(timeRulerSyncRafRef.current);
      } else {
        window.clearTimeout(timeRulerSyncRafRef.current);
      }
      timeRulerSyncRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    latestStartTimeRef.current = startTime;
  }, [startTime]);

  useEffect(() => {
    if (!timeSlots.length) return;
    const hasExact = timeSlots.some((slot) => slot.value === startTime);
    if (hasExact) return;

    const currentMinutes = parseTimeToMinutes(startTime, parseTimeToMinutes(currentHourTime(), 9 * 60));
    let nearest = timeSlots[0];
    let nearestDiff = Number.POSITIVE_INFINITY;
    timeSlots.forEach((slot) => {
      const diff = Math.abs(slot.minutes - currentMinutes);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearest = slot;
      }
    });

    if (nearest?.value) {
      setStartTime(nearest.value);
    }
  }, [startTime, timeSlots]);

  useEffect(() => {
    if (!bookingEndOptions.length) return;
    const hasCurrent = bookingEndOptions.some((option) => Number(option.duration) === Number(durationMinutes));
    if (hasCurrent) return;
    setDurationMinutes(Number(bookingEndOptions[0]?.duration) || 60);
  }, [bookingEndOptions, durationMinutes]);

  useEffect(() => {
    if (bookingEndOptions.length || !timeSlots.length) return;
    const latestStartMinutes = ((23 * 60) + 59) - minDurationMinutes;
    const fallbackSlot = [...timeSlots].reverse().find((slot) => slot.minutes <= latestStartMinutes);
    if (fallbackSlot?.value && fallbackSlot.value !== startTime) {
      setStartTime(fallbackSlot.value);
    }
  }, [bookingEndOptions, timeSlots, minDurationMinutes, startTime]);

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

    if (typeof window.requestAnimationFrame === 'function') {
      const animationFrame = window.requestAnimationFrame(() => {
        fitPlanToViewport();
      });
      return () => {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(animationFrame);
        } else {
          window.clearTimeout(animationFrame);
        }
      };
    }

    const fallbackTimer = window.setTimeout(() => {
      fitPlanToViewport();
    }, 0);
    return () => window.clearTimeout(fallbackTimer);
  }, [selectedFloorId, planWorldHeight, fitPlanToViewport]);

  useEffect(() => {
    if (bookingStep !== 'plan') return undefined;
    if (typeof window.requestAnimationFrame === 'function') {
      const animationFrame = window.requestAnimationFrame(() => {
        if (planManualTransformRef.current) {
          setPlanTransform(planScaleRef.current, planOffsetRef.current);
        } else {
          fitPlanToViewport();
        }
      });
      return () => {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(animationFrame);
        } else {
          window.clearTimeout(animationFrame);
        }
      };
    }

    const fallbackTimer = window.setTimeout(() => {
      if (planManualTransformRef.current) {
        setPlanTransform(planScaleRef.current, planOffsetRef.current);
      } else {
        fitPlanToViewport();
      }
    }, 0);
    return () => window.clearTimeout(fallbackTimer);
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

  const centerTimeSlot = useCallback((slotValue, behavior = 'smooth') => {
    const ruler = timeRulerRef.current;
    if (!ruler || !slotValue) return;
    const target = ruler.querySelector(`[data-slot-value="${slotValue}"]`);
    if (!target) return;

    const rawLeft = target.offsetLeft - ((ruler.clientWidth - target.offsetWidth) / 2);
    const maxLeft = Math.max(0, ruler.scrollWidth - ruler.clientWidth);
    const nextLeft = clamp(rawLeft, 0, maxLeft);

    timeRulerAutoScrollRef.current = true;
    if (typeof ruler.scrollTo === 'function') {
      try {
        ruler.scrollTo({ left: nextLeft, behavior });
      } catch {
        ruler.scrollLeft = nextLeft;
      }
    } else {
      ruler.scrollLeft = nextLeft;
    }
    window.setTimeout(() => {
      timeRulerAutoScrollRef.current = false;
    }, behavior === 'smooth' ? 240 : 40);
  }, []);

  const syncTimelineByCenter = useCallback(() => {
    const ruler = timeRulerRef.current;
    if (!ruler) return;

    const ticks = Array.from(ruler.querySelectorAll('[data-slot-value]'));
    if (!ticks.length) return;

    const rulerRect = ruler.getBoundingClientRect();
    const centerX = rulerRect.left + (rulerRect.width / 2);
    let nearestValue = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    ticks.forEach((tick) => {
      const tickRect = tick.getBoundingClientRect();
      const tickCenter = tickRect.left + (tickRect.width / 2);
      const distance = Math.abs(tickCenter - centerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestValue = tick.getAttribute('data-slot-value');
      }
    });

    if (nearestValue && nearestValue !== startTime) {
      setStartTime(nearestValue);
      void fetchAvailability(selectedFloorId, {
        bookingDate,
        startTime: nearestValue,
        durationMinutes,
        force: true
      });
    }
  }, [startTime, selectedFloorId, bookingDate, durationMinutes, fetchAvailability]);

  const handleTimeRulerScroll = useCallback(() => {
    if (timeRulerAutoScrollRef.current) return;

    timeRulerManualScrollRef.current = true;
    if (timeRulerManualScrollTimeoutRef.current) {
      window.clearTimeout(timeRulerManualScrollTimeoutRef.current);
    }
    timeRulerManualScrollTimeoutRef.current = window.setTimeout(() => {
      timeRulerManualScrollRef.current = false;
      centerTimeSlot(latestStartTimeRef.current, 'smooth');
    }, 140);

    if (timeRulerSyncRafRef.current) {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(timeRulerSyncRafRef.current);
      } else {
        window.clearTimeout(timeRulerSyncRafRef.current);
      }
    }
    if (typeof window.requestAnimationFrame === 'function') {
      timeRulerSyncRafRef.current = window.requestAnimationFrame(() => {
        syncTimelineByCenter();
        timeRulerSyncRafRef.current = null;
      });
    } else {
      timeRulerSyncRafRef.current = window.setTimeout(() => {
        syncTimelineByCenter();
        timeRulerSyncRafRef.current = null;
      }, 16);
    }
  }, [centerTimeSlot, syncTimelineByCenter]);

  useEffect(() => {
    if (timeRulerManualScrollRef.current) return;
    centerTimeSlot(startTime, 'auto');
  }, [startTime, timeSlots, centerTimeSlot]);

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
      try {
        viewportEl.releasePointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture release errors in limited webviews
      }
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

  const toggleControlsCollapsed = useCallback(() => {
    setControlsCollapsed((prev) => !prev);
  }, []);

  const handleControlsHeadKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleControlsCollapsed();
    }
  }, [toggleControlsCollapsed]);

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
      const reservation = response.data?.reservation || null;
      setSuccessMessage(reservation?.reservation_number
        ? `${t('Бронь создана', 'Band qilindi')}: ${reservation.reservation_number}`
        : t('Бронирование успешно создано', 'Band qilish muvaffaqiyatli yaratildi'));
      setReservationReceipt({
        reservationNumber: reservation?.reservation_number || '',
        bookingDate,
        startTime,
        endTime: selectedEndTime || '',
        floorName: selectedFloor?.name || '',
        guestsCount,
        tableNames: selectedTables.map((table) => String(table.name || '')),
        reservationFee,
        reservationServiceCost,
        totalCost: bookingTotalCost
      });
      setShowReceiptModal(true);
    } catch (err) {
      setError(err.response?.data?.error || t('Ошибка создания бронирования', 'Band qilishda xatolik'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseReceiptModal = () => {
    setShowReceiptModal(false);
    setReservationReceipt(null);
    setSelectedTableIds([]);
    setComment('');
    setBookingStep('plan');
    fetchAvailability();
  };

  const hasNoRestaurant = !restaurantId;
  const reservationEnabled = restaurant?.reservation_enabled === true;
  if (loading) return <PageSkeleton fullscreen label={t('Загрузка...', 'Yuklanmoqda...')} cards={4} />;

  return (
    <div className="client-page client-reservation-page">
      <ClientTopBar
        logoUrl={restaurant?.logo_url}
        logoDisplayMode={restaurant?.logo_display_mode}
        restaurantName={restaurant?.name || 'Reservation'}
        language={language}
        onToggleLanguage={toggleLanguage}
        onBack={handleBackClick}
        onBrandClick={handleBrandClick}
        showBackButton
        fallback="🪑"
        maxWidth="1260px"
        sticky
      />
      <Container fluid className="client-content client-reservation-content">
        {hasNoRestaurant && <Alert variant="warning" className="border-0 shadow-sm mt-3">{t('Сначала выберите магазин', 'Avval do‘kon tanlang')}</Alert>}
        {!hasNoRestaurant && !reservationEnabled && <Alert variant="info" className="border-0 shadow-sm mt-3">{t('Для этого магазина бронирование пока отключено', 'Ushbu do‘kon uchun band qilish xizmati yoqilmagan')}</Alert>}
        {!hasNoRestaurant && reservationEnabled && (
          <>
            {error && <Alert variant="danger" className="mt-3 border-0 shadow-sm">{error}</Alert>}
            {successMessage && <Alert variant="success" className="mt-3 border-0 shadow-sm">{successMessage}</Alert>}

            {bookingStep === 'plan' ? (
              <>
                <section ref={planStageRef} className={`client-res-map-shell ${controlsCollapsed ? 'is-controls-collapsed' : ''}`}>
                  <div className={`client-res-controls-overlay ${controlsCollapsed ? 'is-collapsed' : ''}`}>
                    <div
                      className="client-res-controls-head"
                      role="button"
                      tabIndex={0}
                      aria-expanded={!controlsCollapsed}
                      onClick={toggleControlsCollapsed}
                      onKeyDown={handleControlsHeadKeyDown}
                    >
                      <div className="client-res-controls-title-line">
                        <span className="client-res-top-title">{t('Бронирование', 'Band qilish')}</span>
                        <span className="client-res-top-subtitle">{startTime}{selectedEndTime ? ` - ${selectedEndTime}` : ''}</span>
                      </div>
                      <button
                        type="button"
                        className="client-res-collapse-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleControlsCollapsed();
                        }}
                        aria-expanded={!controlsCollapsed}
                        title={controlsCollapsed ? t('Развернуть', 'Yoyish') : t('Свернуть', 'Yig‘ish')}
                      >
                        {controlsCollapsed ? '▾' : '▴'}
                      </button>
                    </div>

                    {!controlsCollapsed && (
                      <div className="client-res-controls-stack">
                        <div className="client-res-overlay-row">
                          <span className="client-res-overlay-label">{t('Дата', 'Sana')}</span>
                          <Form.Control
                            type="date"
                            className="client-res-overlay-input"
                            value={bookingDate}
                            min={todayDate()}
                            onClick={(event) => event.currentTarget.showPicker?.()}
                            onFocus={(event) => event.currentTarget.showPicker?.()}
                            onChange={(event) => {
                              const nextDate = String(event.target.value || '').trim();
                              if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
                                setBookingDate(nextDate);
                              }
                            }}
                          />
                        </div>
                        <div className="client-res-overlay-row">
                          <span className="client-res-overlay-label">{t('Этаж', 'Qavat')}</span>
                          <Form.Select className="client-res-overlay-input" value={selectedFloorId || ''} onChange={(event) => setSelectedFloorId(Number(event.target.value) || null)}>
                            <option value="">{t('Выберите этаж', 'Qavatni tanlang')}</option>
                            {floors.map((floor) => (
                              <option key={`reservation-floor-${floor.id}`} value={floor.id}>
                                {floor.name}
                              </option>
                            ))}
                          </Form.Select>
                        </div>
                      </div>
                    )}
                    {selectedTableIds.length > 0 && (
                      <div className="client-res-overlay-next-row">
                        <Button
                          variant="primary"
                          className="client-res-overlay-next-btn"
                          disabled={loadingAvailability || !selectedFloorId}
                          onClick={() => setBookingStep('details')}
                        >
                          {t('Далее', 'Keyingi')}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div ref={planViewportRef} className={`client-res-plan-stage ${planGestureMode !== 'idle' ? 'is-gesturing' : ''}`} onWheel={handlePlanWheel} onPointerDown={handlePlanPointerDown} onPointerMove={handlePlanPointerMove} onPointerUp={endPointerSession} onPointerCancel={endPointerSession} onPointerLeave={(event) => { if (event.pointerType === 'mouse') endPointerSession(event); }}>
                    {loadingAvailability && <div className="client-res-map-loading">{t('Проверяем доступность столов...', 'Stollar mavjudligi tekshirilmoqda...')}</div>}
                    <div className="client-res-plan-world" style={{ width: `${PLAN_WORLD_WIDTH}px`, height: `${planWorldHeight}px`, transform: `translate(${planOffset.x}px, ${planOffset.y}px) scale(${planScale})` }}>
                      <div
                        className="client-res-plan-floor"
                        style={{
                          backgroundImage: selectedFloorImageUrl ? `url(${selectedFloorImageUrl})` : 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)',
                          opacity: selectedFloorImageOpacity
                        }}
                      />
                      <div className="client-res-plan-floor-overlay" style={{ background: `rgba(0, 0, 0, ${selectedFloorDarkOverlay})` }} />

                      {tables.map((table) => {
                        const selected = selectedTableIds.includes(Number(table.id));
                        const available = Boolean(table.is_available);
                        const tableX = (normalizePlanCoordinate(table.x, 50) / 100) * PLAN_WORLD_WIDTH;
                        const tableY = (normalizePlanCoordinate(table.y, 50) / 100) * planWorldHeight;
                        const tableRotation = normalizeRotationAngle(table.rotation);
                        const templateImageUrl = toAbsoluteMediaUrl(table.template_image_url);
                        const tableCenterLabel = extractTableCenterLabel(table.name, table.id);

                        const markerScaleCompensation = Number(clamp(1 / Math.max(planScale, 0.001), 0.65, 1.35).toFixed(4));

                        return (
                          <button
                            key={table.id}
                            type="button"
                            data-plan-table="1"
                            className={`client-res-plan-table ${selected ? 'is-selected' : ''} ${available ? 'is-available' : 'is-disabled is-unavailable'}`}
                            style={{ left: `${tableX}px`, top: `${tableY}px`, transform: `translate(-50%, -50%) scale(${markerScaleCompensation})` }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => toggleTableSelection(table)}
                            disabled={!available}
                            title={table.name || ''}
                          >
                            {table.photo_url && (
                              <span role="button" tabIndex={0} className="client-res-plan-photo-btn" onClick={(event) => { event.stopPropagation(); setPhotoTableName(String(table.name || t('Стол', 'Stol'))); setPhotoUrl(toAbsoluteMediaUrl(table.photo_url)); setShowPhotoModal(true); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setPhotoTableName(String(table.name || t('Стол', 'Stol'))); setPhotoUrl(toAbsoluteMediaUrl(table.photo_url)); setShowPhotoModal(true); } }}>📷</span>
                            )}
                            <div className="client-res-plan-table-visual" style={{ transform: `rotate(${tableRotation}deg)` }}>
                              {templateImageUrl ? <img src={templateImageUrl} alt={table.template_name || table.name} className="client-res-plan-table-img" /> : <span className="client-res-plan-table-fallback">{table.name}</span>}
                              <span className="client-res-plan-table-center-id">{tableCenterLabel}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="client-res-plan-controls" aria-label={t('Управление картой', 'Xarita boshqaruvi')}>
                    <button type="button" className="client-res-map-control-btn" onClick={handlePlanZoomIn} title={t('Приблизить', 'Yaqinlashtirish')} aria-label={t('Приблизить', 'Yaqinlashtirish')}>
                      <Plus aria-hidden="true" />
                    </button>
                    <button type="button" className="client-res-map-control-btn" onClick={handlePlanZoomOut} title={t('Отдалить', 'Uzoqlashtirish')} aria-label={t('Отдалить', 'Uzoqlashtirish')}>
                      <Minus aria-hidden="true" />
                    </button>
                    <button type="button" className="client-res-map-control-btn" onClick={fitPlanToViewport} title={t('Сбросить вид', 'Ko‘rinishni tiklash')} aria-label={t('Сбросить вид', 'Ko‘rinishni tiklash')}>
                      <LocateFixed aria-hidden="true" />
                    </button>
                    <button type="button" className="client-res-map-control-btn" onClick={handleToggleFullscreen} title={isPlanFullscreen ? t('Свернуть', 'Yig‘ish') : t('Полный экран', 'To‘liq ekran')} aria-label={isPlanFullscreen ? t('Свернуть', 'Yig‘ish') : t('Полный экран', 'To‘liq ekran')}>
                      {isPlanFullscreen ? <Minimize aria-hidden="true" /> : <Expand aria-hidden="true" />}
                    </button>
                  </div>

                  <div className="client-res-time-strip" aria-label={t('Выбор времени', 'Vaqt tanlash')}>
                    <div className="client-res-time-strip-head">
                      <span className="client-res-time-strip-label">{t('Время', 'Vaqt')}</span>
                      <strong className="client-res-time-strip-value">{startTime}</strong>
                      {selectedEndTime ? <span className="client-res-time-strip-range">{startTime} - {selectedEndTime}</span> : null}
                    </div>
                    <div ref={timeRulerRef} className="client-res-time-ruler client-res-time-ruler--floating" onScroll={handleTimeRulerScroll}>
                      {timeSlots.map((slot, index) => {
                        const active = slot.value === startTime;
                        const isHour = slot.minutes % 60 === 0;
                        return (
                          <button key={slot.value} type="button" data-slot-value={slot.value} className={`client-res-ruler-tick ${active ? 'is-active' : ''} ${isHour ? 'is-hour' : ''}`} onClick={() => { timeRulerManualScrollRef.current = false; setStartTime(slot.value); centerTimeSlot(slot.value, 'smooth'); }} title={slot.value} aria-label={slot.value}>
                            <span className="client-res-ruler-line" />
                            {isHour && <span className="client-res-ruler-label">{slot.hourLabel}</span>}
                            {!isHour && active && <span className="client-res-ruler-label">{slot.value}</span>}
                            {index === timeSlots.length - 1 ? <span className="client-res-ruler-end" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </section>

                {!isCapacityEnough && selectedTableIds.length > 0 && <Alert variant="warning" className="border-0 mt-2 mb-2">{t('Вместимости выбранных столов недостаточно для указанного количества гостей', 'Tanlangan stollar sig‘imi mehmonlar soni uchun yetarli emas')}</Alert>}
              </>
            ) : (
                <Card className="border-0 shadow-sm mt-3 mb-3 client-res-details-card">
                <Card.Body>
                  <div className="client-res-details-head">
                    <div className="text-muted small">{bookingDateCompact} · {startTime}{selectedEndTime ? ` - ${selectedEndTime}` : ''}</div>
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
                            <Form.Label>{t('Дата', 'Sana')}</Form.Label>
                            <Form.Control
                              type="text"
                              readOnly
                              className="client-res-readonly-input"
                              value={bookingDateCompact}
                            />
                          </Form.Group>

                          <Row className="g-2 mb-3">
                            <Col xs={6}>
                              <Form.Group className="mb-0">
                                <Form.Label>{t('Начало', 'Boshlanish')}</Form.Label>
                                <Form.Control
                                  type="text"
                                  readOnly
                                  className="client-res-readonly-input"
                                  value={startTime}
                                />
                              </Form.Group>
                            </Col>
                            <Col xs={6}>
                              <Form.Group className="mb-0">
                                <Form.Label>{t('До', 'Gacha')}</Form.Label>
                                <Form.Select value={durationMinutes} onChange={(e) => setDurationMinutes(Number.parseInt(e.target.value, 10) || 120)}>
                                  {bookingEndOptions.map((option) => (
                                    <option key={option.duration} value={option.duration}>{option.endTime}</option>
                                  ))}
                                </Form.Select>
                              </Form.Group>
                            </Col>
                          </Row>

                          <Form.Group className="mb-3">
                            <Form.Label>{t('Количество гостей', 'Mehmonlar soni')}</Form.Label>
                            <Form.Control type="number" min={1} value={guestsCount} onChange={(e) => setGuestsCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} />
                          </Form.Group>

                          <Form.Group className="mb-3">
                            <Form.Label>{t('Комментарий (необязательно)', 'Izoh (ixtiyoriy)')}</Form.Label>
                            <Form.Control as="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
                          </Form.Group>

                          <div className="client-res-summary-card mb-3">
                            <div className="client-res-summary-row">
                              <span>{t('Сумма брони', 'Bron summasi')}</span>
                              <strong>{formatMoney(reservationFee)} {moneyLabel}</strong>
                            </div>
                            <div className="client-res-summary-row">
                              <span>{t('Сервис брони', 'Bron servisi')}</span>
                              <strong>{formatMoney(reservationServiceCost)} {moneyLabel}</strong>
                            </div>
                            <div className="client-res-summary-row is-total">
                              <span>{t('Итого', 'Jami')}</span>
                              <strong>{formatMoney(bookingTotalCost)} {moneyLabel}</strong>
                            </div>
                          </div>

                          {!isCapacityEnough && selectedTableIds.length > 0 && <Alert variant="warning" className="border-0 mb-3">{t('Выбранные столы не покрывают количество гостей', 'Tanlangan stollar mehmonlar soniga yetmaydi')}</Alert>}

                          <Button variant="primary" className="w-100 client-res-book-btn" disabled={submitting || !selectedTableIds.length || !selectedFloorId || !isCapacityEnough} onClick={submitReservation}>{submitting ? t('Отправляем...', 'Yuborilmoqda...') : t('Забронировать', 'Band qilish')}</Button>
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
      <Modal show={showReceiptModal} onHide={handleCloseReceiptModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Бронь оформлена', 'Bron rasmiylashtirildi')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="client-res-receipt">
            <div className="client-res-receipt-row"><span>{t('Номер', 'Raqam')}</span><strong>{reservationReceipt?.reservationNumber || '-'}</strong></div>
            <div className="client-res-receipt-row"><span>{t('Дата', 'Sana')}</span><strong>{reservationReceipt?.bookingDate || '-'}</strong></div>
            <div className="client-res-receipt-row"><span>{t('Время', 'Vaqt')}</span><strong>{reservationReceipt?.startTime || '-'}{reservationReceipt?.endTime ? ` - ${reservationReceipt.endTime}` : ''}</strong></div>
            <div className="client-res-receipt-row"><span>{t('Этаж', 'Qavat')}</span><strong>{reservationReceipt?.floorName || '-'}</strong></div>
            <div className="client-res-receipt-row"><span>{t('Столы', 'Stollar')}</span><strong>{reservationReceipt?.tableNames?.filter(Boolean).join(', ') || '-'}</strong></div>
            <div className="client-res-receipt-row"><span>{t('Гостей', 'Mehmonlar')}</span><strong>{reservationReceipt?.guestsCount || 0}</strong></div>
            <hr className="my-2" />
            <div className="client-res-receipt-row"><span>{t('Сумма брони', 'Bron summasi')}</span><strong>{formatMoney(reservationReceipt?.reservationFee || 0)} {moneyLabel}</strong></div>
            <div className="client-res-receipt-row"><span>{t('Сервис брони', 'Bron servisi')}</span><strong>{formatMoney(reservationReceipt?.reservationServiceCost || 0)} {moneyLabel}</strong></div>
            <div className="client-res-receipt-row is-total"><span>{t('Итого', 'Jami')}</span><strong>{formatMoney(reservationReceipt?.totalCost || 0)} {moneyLabel}</strong></div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handleCloseReceiptModal}>{t('Готово', 'Tayyor')}</Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showPhotoModal} onHide={() => setShowPhotoModal(false)} centered><Modal.Header closeButton><Modal.Title>{t('Фото стола', 'Stol rasmi')}: {photoTableName}</Modal.Title></Modal.Header><Modal.Body className="p-2">{photoUrl ? <img src={photoUrl} alt={photoTableName} style={{ width: '100%', borderRadius: 10, maxHeight: '70vh', objectFit: 'contain' }} /> : <div className="text-muted p-3 text-center">{t('Фото не найдено', 'Rasm topilmadi')}</div>}</Modal.Body></Modal>
    </div>
  );
}

export default Reservations;
