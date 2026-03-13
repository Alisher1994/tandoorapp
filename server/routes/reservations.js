const express = require('express');
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { ensureReservationSchema } = require('../services/reservationSchema');

const router = express.Router();

const ACTIVE_RESERVATION_STATUSES = ['new', 'confirmed', 'seated'];
const CANCELLABLE_RESERVATION_STATUSES = new Set(['new', 'confirmed']);
const RESERVATION_MODES = new Set(['reservation_only', 'with_items']);
const PAYMENTS_PENDING_METHODS = new Set(['payme']);

const parsePositiveInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDate = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
};

const normalizeTime = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  const hh = match[1];
  const mm = match[2];
  const ss = match[3] || '00';
  return `${hh}:${mm}:${ss}`;
};

const timeToSeconds = (timeValue) => {
  const normalized = normalizeTime(timeValue);
  if (!normalized) return null;
  const [hh, mm, ss] = normalized.split(':').map((part) => Number.parseInt(part, 10));
  return (hh * 3600) + (mm * 60) + ss;
};

const addMinutesToTime = (timeValue, minutesToAdd) => {
  const seconds = timeToSeconds(timeValue);
  if (!Number.isFinite(seconds)) return null;
  const delta = Math.max(0, Number(minutesToAdd || 0)) * 60;
  const total = seconds + delta;
  if (total > 24 * 3600) return null;
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const normalizeReservationMode = (value, fallback = 'reservation_only') => {
  const normalized = String(value || '').trim().toLowerCase();
  return RESERVATION_MODES.has(normalized) ? normalized : fallback;
};

const normalizePaymentMethod = (value, fallback = 'cash') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
};

const resolveRestaurantId = (req) => {
  const fromQuery = parsePositiveInt(req.query.restaurant_id);
  const fromBody = parsePositiveInt(req.body?.restaurant_id);
  const fromUser = parsePositiveInt(req.user?.active_restaurant_id);
  return fromQuery || fromBody || fromUser || null;
};

const getReservationConfig = async (client, restaurantId) => {
  const result = await client.query(
    `SELECT
       r.id,
       r.activity_type_id,
       COALESCE(rs.enabled, false) AS enabled,
       COALESCE(rs.reservation_fee, 0) AS reservation_fee,
       COALESCE(rs.max_duration_minutes, 180) AS max_duration_minutes,
       COALESCE(rs.allow_multi_table, true) AS allow_multi_table,
       COALESCE(rs.prepay_mode, 'none') AS prepay_mode,
       COALESCE(rs.prepay_percent, 0) AS prepay_percent,
       COALESCE(rs.reservation_service_cost, COALESCE(r.reservation_cost, 0)) AS reservation_service_cost
     FROM restaurants r
     LEFT JOIN restaurant_reservation_settings rs ON rs.restaurant_id = r.id
     WHERE r.id = $1
     LIMIT 1`,
    [restaurantId]
  );

  return result.rows[0] || null;
};

const generateReservationNumber = async (client) => {
  const dateToken = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomPart = String(Math.floor(10000 + (Math.random() * 90000)));
    const number = `R${dateToken}-${randomPart}`;
    const exists = await client.query(
      'SELECT 1 FROM reservations WHERE reservation_number = $1 LIMIT 1',
      [number]
    );
    if (!exists.rows.length) return number;
  }

  return `R${dateToken}-${Date.now().toString().slice(-6)}`;
};

router.use(authenticate);

router.get('/floors', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не указан' });
    }

    const result = await pool.query(
      `SELECT
         f.*,
         COUNT(t.id)::int AS tables_count
       FROM reservation_floors f
       LEFT JOIN reservation_tables t
         ON t.floor_id = f.id
        AND t.is_active = true
       WHERE f.restaurant_id = $1
         AND f.is_active = true
       GROUP BY f.id
       ORDER BY f.sort_order ASC, f.id ASC`,
      [restaurantId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Reservation floors error:', error);
    return res.status(500).json({ error: 'Ошибка получения этажей бронирования' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    await ensureReservationSchema();

    const restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не указан' });
    }

    const bookingDate = normalizeDate(req.query.date);
    const startTime = normalizeTime(req.query.start_time);
    if (!bookingDate || !startTime) {
      return res.status(400).json({ error: 'Укажите дату и время бронирования' });
    }

    const floorId = parsePositiveInt(req.query.floor_id, null);
    const durationMinutes = parsePositiveInt(req.query.duration_minutes, 120);
    const endTime = addMinutesToTime(startTime, durationMinutes);
    if (!endTime) {
      return res.status(400).json({ error: 'Некорректная длительность брони' });
    }

    const config = await getReservationConfig(pool, restaurantId);
    if (!config) {
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    const tablesResult = await pool.query(
      `SELECT
         t.id,
         t.restaurant_id,
         t.floor_id,
         t.template_id,
         t.name,
         t.capacity,
         t.photo_url,
         t.x,
         t.y,
         t.rotation,
         t.is_active,
         f.name AS floor_name,
         f.sort_order AS floor_sort_order,
         tpl.code AS template_code,
         tpl.name AS template_name,
         tpl.shape AS template_shape,
         tpl.width AS template_width,
         tpl.height AS template_height,
         tpl.seats_count AS template_seats_count
       FROM reservation_tables t
       INNER JOIN reservation_floors f ON f.id = t.floor_id
       LEFT JOIN reservation_table_templates tpl ON tpl.id = t.template_id
       WHERE t.restaurant_id = $1
         AND t.is_active = true
         AND f.is_active = true
         AND ($2::int IS NULL OR t.floor_id = $2::int)
       ORDER BY f.sort_order ASC, f.id ASC, t.name ASC`,
      [restaurantId, floorId]
    );

    const busyResult = await pool.query(
      `SELECT DISTINCT rtm.table_id
       FROM reservations r
       INNER JOIN reservation_tables_map rtm ON rtm.reservation_id = r.id
       WHERE r.restaurant_id = $1
         AND r.booking_date = $2::date
         AND r.status = ANY($3::text[])
         AND r.start_time < $4::time
         AND r.end_time > $5::time`,
      [restaurantId, bookingDate, ACTIVE_RESERVATION_STATUSES, endTime, startTime]
    );

    const busyTableSet = new Set(
      busyResult.rows.map((row) => Number.parseInt(row.table_id, 10)).filter((id) => Number.isInteger(id))
    );

    const tables = tablesResult.rows.map((table) => ({
      ...table,
      is_available: !busyTableSet.has(Number(table.id))
    }));

    return res.json({
      restaurant_id: restaurantId,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      reservation_enabled: Boolean(config.enabled),
      reservation_fee: parseAmount(config.reservation_fee, 0),
      allow_multi_table: Boolean(config.allow_multi_table),
      tables
    });
  } catch (error) {
    console.error('Reservation availability error:', error);
    return res.status(500).json({ error: 'Ошибка получения доступности столов' });
  }
});

router.get('/my', async (req, res) => {
  try {
    await ensureReservationSchema();

    const activeRestaurantId = parsePositiveInt(req.user?.active_restaurant_id, null);
    const result = await pool.query(
      `SELECT
         r.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', t.id,
               'name', t.name,
               'floor_id', t.floor_id
             )
             ORDER BY t.id
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'::json
         ) AS tables
       FROM reservations r
       LEFT JOIN reservation_tables_map rtm ON rtm.reservation_id = r.id
       LEFT JOIN reservation_tables t ON t.id = rtm.table_id
       WHERE r.user_id = $1
         AND ($2::int IS NULL OR r.restaurant_id = $2::int)
       GROUP BY r.id
       ORDER BY r.booking_date DESC, r.start_time DESC, r.created_at DESC`,
      [req.user.id, activeRestaurantId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Get my reservations error:', error);
    return res.status(500).json({ error: 'Ошибка получения бронирований' });
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();

    const restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не указан' });
    }

    const bookingDate = normalizeDate(req.body?.booking_date);
    const startTime = normalizeTime(req.body?.start_time);
    const endTimeRaw = normalizeTime(req.body?.end_time);
    const durationMinutes = parsePositiveInt(req.body?.duration_minutes, null);
    const guestsCount = parsePositiveInt(req.body?.guests_count, 1);
    const tableIds = Array.isArray(req.body?.table_ids)
      ? [...new Set(req.body.table_ids.map((id) => parsePositiveInt(id)).filter((id) => Number.isInteger(id)))]
      : [];

    if (!bookingDate || !startTime || tableIds.length === 0) {
      return res.status(400).json({ error: 'Дата, время и столы обязательны' });
    }

    await client.query('BEGIN');

    const config = await getReservationConfig(client, restaurantId);
    if (!config) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ресторан не найден' });
    }

    if (!config.enabled) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Бронирование отключено для этого магазина' });
    }

    if (!config.allow_multi_table && tableIds.length > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Для этого магазина доступен выбор только одного стола' });
    }

    const resolvedDuration = durationMinutes || parsePositiveInt(config.max_duration_minutes, 180) || 180;
    const endTime = endTimeRaw || addMinutesToTime(startTime, resolvedDuration);
    if (!endTime) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Некорректное время окончания брони' });
    }

    const startSeconds = timeToSeconds(startTime);
    const endSeconds = timeToSeconds(endTime);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Время окончания должно быть больше времени начала' });
    }

    const tablesResult = await client.query(
      `SELECT id, capacity
       FROM reservation_tables
       WHERE restaurant_id = $1
         AND is_active = true
         AND id = ANY($2::int[])
       FOR UPDATE`,
      [restaurantId, tableIds]
    );
    if (tablesResult.rows.length !== tableIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Некоторые столы недоступны для брони' });
    }
    const totalCapacity = tablesResult.rows.reduce(
      (sum, row) => sum + parsePositiveInt(row.capacity, 0),
      0
    );
    if (totalCapacity < guestsCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Недостаточная вместимость выбранных столов',
        total_capacity: totalCapacity,
        guests_count: guestsCount
      });
    }

    const overlapResult = await client.query(
      `SELECT DISTINCT rtm.table_id
       FROM reservations r
       INNER JOIN reservation_tables_map rtm ON rtm.reservation_id = r.id
       WHERE r.restaurant_id = $1
         AND r.booking_date = $2::date
         AND r.status = ANY($3::text[])
         AND r.start_time < $4::time
         AND r.end_time > $5::time
         AND rtm.table_id = ANY($6::int[])`,
      [restaurantId, bookingDate, ACTIVE_RESERVATION_STATUSES, endTime, startTime, tableIds]
    );

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Часть столов уже занята на выбранное время',
        busy_table_ids: overlapResult.rows.map((row) => Number.parseInt(row.table_id, 10)).filter((id) => Number.isInteger(id))
      });
    }

    const reservationNumber = await generateReservationNumber(client);
    const bookingMode = normalizeReservationMode(req.body?.booking_mode, 'reservation_only');
    const reservationFee = Math.max(0, parseAmount(config.reservation_fee, 0));
    const itemsPrepayAmount = bookingMode === 'with_items'
      ? Math.max(0, parseAmount(req.body?.items_prepay_amount, 0))
      : 0;
    const serviceFee = Math.max(0, parseAmount(req.body?.service_fee, 0));
    const totalPrepayAmount = reservationFee + itemsPrepayAmount + serviceFee;
    const paymentMethod = normalizePaymentMethod(req.body?.payment_method, 'cash');
    const paymentStatus = PAYMENTS_PENDING_METHODS.has(paymentMethod) ? 'pending' : 'unpaid';
    const comment = req.body?.comment ? String(req.body.comment).trim().slice(0, 1000) : null;

    const reservationInsertResult = await client.query(
      `INSERT INTO reservations (
        restaurant_id,
        user_id,
        reservation_number,
        status,
        booking_date,
        start_time,
        end_time,
        guests_count,
        booking_mode,
        reservation_fee,
        items_prepay_amount,
        service_fee,
        total_prepay_amount,
        payment_method,
        payment_status,
        comment
      )
      VALUES (
        $1, $2, $3, 'new', $4::date, $5::time, $6::time, $7,
        $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING *`,
      [
        restaurantId,
        req.user.id,
        reservationNumber,
        bookingDate,
        startTime,
        endTime,
        guestsCount,
        bookingMode,
        reservationFee,
        itemsPrepayAmount,
        serviceFee,
        totalPrepayAmount,
        paymentMethod,
        paymentStatus,
        comment
      ]
    );
    const reservation = reservationInsertResult.rows[0];

    for (const tableId of tableIds) {
      await client.query(
        `INSERT INTO reservation_tables_map (reservation_id, table_id)
         VALUES ($1, $2)`,
        [reservation.id, tableId]
      );
    }

    await client.query(
      `INSERT INTO reservation_status_history (reservation_id, status, changed_by, comment)
       VALUES ($1, 'new', $2, $3)`,
      [reservation.id, req.user.id, 'Создано клиентом']
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Бронирование создано',
      reservation: {
        ...reservation,
        table_ids: tableIds
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create reservation error:', error);
    return res.status(500).json({ error: 'Ошибка создания бронирования' });
  } finally {
    client.release();
  }
});

router.post('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const reservationId = parsePositiveInt(req.params.id);
    if (!reservationId) {
      return res.status(400).json({ error: 'Некорректный ID бронирования' });
    }

    const cancelReason = req.body?.cancel_reason
      ? String(req.body.cancel_reason).trim().slice(0, 500)
      : 'Отменено клиентом';

    await client.query('BEGIN');

    const reservationResult = await client.query(
      `SELECT *
       FROM reservations
       WHERE id = $1
         AND user_id = $2
       FOR UPDATE`,
      [reservationId, req.user.id]
    );
    if (!reservationResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }

    const reservation = reservationResult.rows[0];
    if (!CANCELLABLE_RESERVATION_STATUSES.has(String(reservation.status || '').trim().toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Это бронирование уже нельзя отменить' });
    }

    const updatedResult = await client.query(
      `UPDATE reservations
       SET status = 'cancelled',
           cancel_reason = $2,
           cancelled_at_status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [reservationId, cancelReason, reservation.status]
    );

    await client.query(
      `INSERT INTO reservation_status_history (reservation_id, status, changed_by, comment)
       VALUES ($1, 'cancelled', $2, $3)`,
      [reservationId, req.user.id, cancelReason]
    );

    await client.query('COMMIT');
    return res.json({
      message: 'Бронирование отменено',
      reservation: updatedResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel reservation error:', error);
    return res.status(500).json({ error: 'Ошибка отмены бронирования' });
  } finally {
    client.release();
  }
});

module.exports = router;
