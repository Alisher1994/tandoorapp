const express = require('express');
const pool = require('../database/connection');
const { authenticate, requireOperator } = require('../middleware/auth');
const { ensureReservationSchema } = require('../services/reservationSchema');

const router = express.Router();

const ALLOWED_RESERVATION_STATUSES = new Set(['new', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']);
const ALLOWED_PREPAY_MODES = new Set(['none', 'fixed', 'percent']);

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

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const clampTimeSlotStep = (value, fallback = 30) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(60, Math.max(5, parsed));
};
const clampRatio = (value, fallback = 0, min = 0, max = 1) => {
  const parsed = parseAmount(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Number(parsed)));
};

const resolveRestaurantId = (req) => {
  const explicit = parsePositiveInt(req.query.restaurant_id)
    || parsePositiveInt(req.body?.restaurant_id);
  const activeRestaurantId = parsePositiveInt(req.user?.active_restaurant_id);

  if (req.user.role === 'superadmin') {
    return explicit || activeRestaurantId || null;
  }

  if (explicit && activeRestaurantId && explicit !== activeRestaurantId) {
    return -1;
  }

  return activeRestaurantId || explicit || null;
};

const ensureRestaurantSettingsRow = async (client, restaurantId) => {
  await client.query(
    `INSERT INTO restaurant_reservation_settings (
       restaurant_id,
       enabled,
       reservation_fee,
       reservation_service_cost,
       max_duration_minutes,
       time_slot_step_minutes,
       allow_multi_table,
       prepay_mode,
       prepay_percent
     )
     SELECT
       r.id,
       false,
       0,
       COALESCE(r.reservation_cost, 0),
       180,
       30,
       true,
       'none',
       0
     FROM restaurants r
     WHERE r.id = $1
     ON CONFLICT (restaurant_id) DO NOTHING`,
    [restaurantId]
  );
};

router.use(authenticate);
router.use(requireOperator);

router.get('/', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const status = normalizeStatus(req.query.status);
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();

    const params = [restaurantId];
    let where = 'WHERE r.restaurant_id = $1';

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      params.push(dateFrom);
      where += ` AND r.booking_date >= $${params.length}::date`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      params.push(dateTo);
      where += ` AND r.booking_date <= $${params.length}::date`;
    }

    const result = await pool.query(
      `SELECT
         r.*,
         u.full_name AS user_name,
         u.phone AS user_phone,
         pb.full_name AS processed_by_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id', t.id,
               'name', t.name,
               'floor_id', t.floor_id
             )
             ORDER BY t.name
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'::json
         ) AS tables
       FROM reservations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN users pb ON pb.id = r.processed_by
       LEFT JOIN reservation_tables_map rtm ON rtm.reservation_id = r.id
       LEFT JOIN reservation_tables t ON t.id = rtm.table_id
       ${where}
       GROUP BY r.id, u.full_name, u.phone, pb.full_name
       ORDER BY r.booking_date DESC, r.start_time DESC, r.created_at DESC`,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Admin reservations list error:', error);
    return res.status(500).json({ error: 'Ошибка получения бронирований' });
  }
});

router.get('/status-counts', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS all_count,
         COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
         COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
         COUNT(*) FILTER (WHERE status = 'seated')::int AS seated_count,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show_count
       FROM reservations
       WHERE restaurant_id = $1`,
      [restaurantId]
    );

    return res.json(result.rows[0] || {
      all_count: 0,
      new_count: 0,
      confirmed_count: 0,
      seated_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      no_show_count: 0
    });
  } catch (error) {
    console.error('Admin reservation status counts error:', error);
    return res.status(500).json({ error: 'Ошибка получения счетчиков бронирований' });
  }
});

router.get('/settings', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    await client.query('BEGIN');
    await ensureRestaurantSettingsRow(client, restaurantId);

    const result = await client.query(
      `SELECT
         rs.*,
         r.name AS restaurant_name,
         r.reservation_cost
       FROM restaurant_reservation_settings rs
       INNER JOIN restaurants r ON r.id = rs.restaurant_id
       WHERE rs.restaurant_id = $1
       LIMIT 1`,
      [restaurantId]
    );
    await client.query('COMMIT');

    return res.json(result.rows[0] || null);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin reservation settings error:', error);
    return res.status(500).json({ error: 'Ошибка получения настроек бронирования' });
  } finally {
    client.release();
  }
});

router.put('/settings', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    await client.query('BEGIN');
    await ensureRestaurantSettingsRow(client, restaurantId);

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'enabled')) {
      if (req.user?.role !== 'superadmin') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Включение/выключение бронирования доступно только супер-админу' });
      }
      params.push(!!req.body.enabled);
      updates.push(`enabled = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'reservation_fee')) {
      params.push(Math.max(0, parseAmount(req.body.reservation_fee, 0)));
      updates.push(`reservation_fee = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'reservation_service_cost')) {
      if (req.user?.role !== 'superadmin') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Стоимость сервиса бронирования задается только супер-админом' });
      }
      params.push(Math.max(0, parseAmount(req.body.reservation_service_cost, 0)));
      updates.push(`reservation_service_cost = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'max_duration_minutes')) {
      params.push(parsePositiveInt(req.body.max_duration_minutes, 180));
      updates.push(`max_duration_minutes = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'time_slot_step_minutes')) {
      params.push(clampTimeSlotStep(req.body.time_slot_step_minutes, 30));
      updates.push(`time_slot_step_minutes = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'allow_multi_table')) {
      params.push(!!req.body.allow_multi_table);
      updates.push(`allow_multi_table = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'prepay_mode')) {
      const prepayMode = String(req.body.prepay_mode || '').trim().toLowerCase();
      if (!ALLOWED_PREPAY_MODES.has(prepayMode)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Некорректный тип предоплаты' });
      }
      params.push(prepayMode);
      updates.push(`prepay_mode = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'prepay_percent')) {
      const percent = Math.max(0, Math.min(100, parseAmount(req.body.prepay_percent, 0)));
      params.push(percent);
      updates.push(`prepay_percent = $${params.length}`);
    }

    if (!updates.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(restaurantId);

    const result = await client.query(
      `UPDATE restaurant_reservation_settings
       SET ${updates.join(', ')}
       WHERE restaurant_id = $${params.length}
       RETURNING *`,
      params
    );

    const hasServiceCostUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'reservation_service_cost');
    if (hasServiceCostUpdate) {
      await client.query(
        `UPDATE restaurants
         SET reservation_cost = $1
         WHERE id = $2`,
        [Math.max(0, parseAmount(req.body.reservation_service_cost, 0)), restaurantId]
      );
    }

    await client.query('COMMIT');
    return res.json(result.rows[0] || null);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update reservation settings error:', error);
    return res.status(500).json({ error: 'Ошибка обновления настроек бронирования' });
  } finally {
    client.release();
  }
});

router.get('/floors', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const result = await pool.query(
      `SELECT *
       FROM reservation_floors
       WHERE restaurant_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [restaurantId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Get reservation floors error:', error);
    return res.status(500).json({ error: 'Ошибка получения этажей' });
  }
});

router.post('/floors', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Название этажа обязательно' });
    }

    const sortOrder = Number.isFinite(Number(req.body?.sort_order)) ? Number.parseInt(req.body.sort_order, 10) : 0;
    const imageUrl = req.body?.image_url ? String(req.body.image_url).trim() : null;
    const isActive = req.body?.is_active === undefined ? true : !!req.body.is_active;
    const planImageOpacity = clampRatio(req.body?.plan_image_opacity, 1, 0.25, 1);
    const planDarkOverlay = clampRatio(req.body?.plan_dark_overlay, 0, 0, 0.8);

    const result = await pool.query(
      `INSERT INTO reservation_floors (
         restaurant_id, name, sort_order, image_url, plan_image_opacity, plan_dark_overlay, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [restaurantId, name, sortOrder, imageUrl, planImageOpacity, planDarkOverlay, isActive]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create reservation floor error:', error);
    return res.status(500).json({ error: 'Ошибка создания этажа' });
  }
});

router.put('/floors/:id', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const floorId = parsePositiveInt(req.params.id);
    if (!floorId) {
      return res.status(400).json({ error: 'Некорректный ID этажа' });
    }

    const updates = [];
    const params = [];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Название этажа не может быть пустым' });
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'sort_order')) {
      params.push(Number.isFinite(Number(req.body.sort_order)) ? Number.parseInt(req.body.sort_order, 10) : 0);
      updates.push(`sort_order = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'image_url')) {
      params.push(req.body.image_url ? String(req.body.image_url).trim() : null);
      updates.push(`image_url = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) {
      params.push(!!req.body.is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'plan_image_opacity')) {
      params.push(clampRatio(req.body.plan_image_opacity, 1, 0.25, 1));
      updates.push(`plan_image_opacity = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'plan_dark_overlay')) {
      params.push(clampRatio(req.body.plan_dark_overlay, 0, 0, 0.8));
      updates.push(`plan_dark_overlay = $${params.length}`);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(floorId, restaurantId);
    const result = await pool.query(
      `UPDATE reservation_floors
       SET ${updates.join(', ')}
       WHERE id = $${params.length - 1}
         AND restaurant_id = $${params.length}
       RETURNING *`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Этаж не найден' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update reservation floor error:', error);
    return res.status(500).json({ error: 'Ошибка обновления этажа' });
  }
});

router.delete('/floors/:id', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const floorId = parsePositiveInt(req.params.id);
    if (!floorId) {
      return res.status(400).json({ error: 'Некорректный ID этажа' });
    }

    const result = await pool.query(
      `DELETE FROM reservation_floors
       WHERE id = $1
         AND restaurant_id = $2
       RETURNING id`,
      [floorId, restaurantId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Этаж не найден' });
    }
    return res.json({ message: 'Этаж удален' });
  } catch (error) {
    console.error('Delete reservation floor error:', error);
    return res.status(500).json({ error: 'Ошибка удаления этажа' });
  }
});

router.get('/table-templates', async (req, res) => {
  try {
    await ensureReservationSchema();
    const result = await pool.query(
      `SELECT *
       FROM reservation_table_templates
       ORDER BY is_system DESC, name ASC, id ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Get reservation table templates error:', error);
    return res.status(500).json({ error: 'Ошибка получения шаблонов столов' });
  }
});

router.get('/tables', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const floorId = parsePositiveInt(req.query.floor_id, null);
    const result = await pool.query(
      `SELECT
         t.*,
         f.name AS floor_name,
         tpl.code AS template_code,
         tpl.name AS template_name,
         tpl.shape AS template_shape,
         tpl.image_url AS template_image_url
       FROM reservation_tables t
       INNER JOIN reservation_floors f ON f.id = t.floor_id
       LEFT JOIN reservation_table_templates tpl ON tpl.id = t.template_id
       WHERE t.restaurant_id = $1
         AND ($2::int IS NULL OR t.floor_id = $2::int)
       ORDER BY f.sort_order ASC, f.id ASC, t.name ASC`,
      [restaurantId, floorId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Get reservation tables error:', error);
    return res.status(500).json({ error: 'Ошибка получения столов' });
  }
});

router.post('/tables', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const floorId = parsePositiveInt(req.body?.floor_id);
    const name = String(req.body?.name || '').trim();
    if (!floorId || !name) {
      return res.status(400).json({ error: 'Этаж и название стола обязательны' });
    }

    const templateId = parsePositiveInt(req.body?.template_id, null);
    const capacity = parsePositiveInt(req.body?.capacity, 1);
    const photoUrl = req.body?.photo_url ? String(req.body.photo_url).trim() : null;
    const x = parseAmount(req.body?.x, 0);
    const y = parseAmount(req.body?.y, 0);
    const rotation = parseAmount(req.body?.rotation, 0);
    const isActive = req.body?.is_active === undefined ? true : !!req.body.is_active;

    await client.query('BEGIN');

    const floorResult = await client.query(
      'SELECT id FROM reservation_floors WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
      [floorId, restaurantId]
    );
    if (!floorResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Этаж не найден в этом магазине' });
    }

    if (templateId) {
      const templateResult = await client.query(
        'SELECT id FROM reservation_table_templates WHERE id = $1 LIMIT 1',
        [templateId]
      );
      if (!templateResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Шаблон стола не найден' });
      }
    }

    const result = await client.query(
      `INSERT INTO reservation_tables (
         restaurant_id, floor_id, template_id, name, capacity, photo_url, x, y, rotation, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [restaurantId, floorId, templateId, name, capacity, photoUrl, x, y, rotation, isActive]
    );

    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create reservation table error:', error);
    return res.status(500).json({ error: 'Ошибка создания стола' });
  } finally {
    client.release();
  }
});

router.put('/tables/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const tableId = parsePositiveInt(req.params.id);
    if (!tableId) {
      return res.status(400).json({ error: 'Некорректный ID стола' });
    }

    await client.query('BEGIN');

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'floor_id')) {
      const floorId = parsePositiveInt(req.body.floor_id);
      if (!floorId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Некорректный этаж' });
      }
      const floorResult = await client.query(
        'SELECT id FROM reservation_floors WHERE id = $1 AND restaurant_id = $2 LIMIT 1',
        [floorId, restaurantId]
      );
      if (!floorResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Этаж не найден в этом магазине' });
      }
      params.push(floorId);
      updates.push(`floor_id = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'template_id')) {
      const templateId = parsePositiveInt(req.body.template_id, null);
      if (templateId) {
        const templateResult = await client.query(
          'SELECT id FROM reservation_table_templates WHERE id = $1 LIMIT 1',
          [templateId]
        );
        if (!templateResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Шаблон стола не найден' });
        }
      }
      params.push(templateId);
      updates.push(`template_id = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Название стола не может быть пустым' });
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'capacity')) {
      params.push(parsePositiveInt(req.body.capacity, 1));
      updates.push(`capacity = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'photo_url')) {
      params.push(req.body.photo_url ? String(req.body.photo_url).trim() : null);
      updates.push(`photo_url = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'x')) {
      params.push(parseAmount(req.body.x, 0));
      updates.push(`x = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'y')) {
      params.push(parseAmount(req.body.y, 0));
      updates.push(`y = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'rotation')) {
      params.push(parseAmount(req.body.rotation, 0));
      updates.push(`rotation = $${params.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) {
      params.push(!!req.body.is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (!updates.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(tableId, restaurantId);
    const result = await client.query(
      `UPDATE reservation_tables
       SET ${updates.join(', ')}
       WHERE id = $${params.length - 1}
         AND restaurant_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Стол не найден' });
    }

    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update reservation table error:', error);
    return res.status(500).json({ error: 'Ошибка обновления стола' });
  } finally {
    client.release();
  }
});

router.delete('/tables/:id', async (req, res) => {
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const tableId = parsePositiveInt(req.params.id);
    if (!tableId) {
      return res.status(400).json({ error: 'Некорректный ID стола' });
    }

    const result = await pool.query(
      `DELETE FROM reservation_tables
       WHERE id = $1
         AND restaurant_id = $2
       RETURNING id`,
      [tableId, restaurantId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Стол не найден' });
    }
    return res.json({ message: 'Стол удален' });
  } catch (error) {
    console.error('Delete reservation table error:', error);
    return res.status(500).json({ error: 'Ошибка удаления стола' });
  }
});

router.post('/:id/accept-and-pay', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const reservationId = parsePositiveInt(req.params.id);
    if (!reservationId) {
      return res.status(400).json({ error: 'Некорректный ID бронирования' });
    }

    await client.query('BEGIN');

    const reservationResult = await client.query(
      `SELECT
         r.*,
         rest.balance,
         rest.is_free_tier,
         rest.reservation_cost
       FROM reservations r
       INNER JOIN restaurants rest ON rest.id = r.restaurant_id
       WHERE r.id = $1
         AND r.restaurant_id = $2
       FOR UPDATE`,
      [reservationId, restaurantId]
    );
    if (!reservationResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }

    const reservation = reservationResult.rows[0];
    if (reservation.is_paid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Бронирование уже оплачено для биллинга' });
    }
    if (['cancelled', 'completed', 'no_show'].includes(normalizeStatus(reservation.status))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Нельзя подтвердить биллинг для завершенного или отмененного бронирования' });
    }

    const billingCost = reservation.is_free_tier
      ? 0
      : Math.max(0, parseAmount(reservation.reservation_cost, 0));
    const balanceBefore = parseAmount(reservation.balance, 0);

    if (!reservation.is_free_tier && balanceBefore < billingCost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств на балансе магазина' });
    }

    if (billingCost > 0) {
      await client.query(
        'UPDATE restaurants SET balance = balance - $1 WHERE id = $2',
        [billingCost, restaurantId]
      );
      await client.query(
        `INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
         VALUES ($1, $2, $3, 'withdrawal', $4)`,
        [restaurantId, req.user.id, -billingCost, `Списание за бронь #${reservationId}`]
      );
    }

    const nextStatus = normalizeStatus(reservation.status) === 'new' ? 'confirmed' : reservation.status;
    const updatedResult = await client.query(
      `UPDATE reservations
       SET is_paid = true,
           paid_amount = $2,
           status = $3,
           processed_by = $4,
           processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [reservationId, billingCost, nextStatus, req.user.id]
    );

    await client.query(
      `INSERT INTO reservation_status_history (reservation_id, status, changed_by, comment)
       VALUES ($1, 'accepted', $2, $3)`,
      [reservationId, req.user.id, `Принято оператором: ${req.user.full_name || req.user.username || req.user.id}`]
    );
    if (nextStatus === 'confirmed') {
      await client.query(
        `INSERT INTO reservation_status_history (reservation_id, status, changed_by, comment)
         VALUES ($1, 'confirmed', $2, $3)`,
        [reservationId, req.user.id, 'Подтверждено после списания сервиса']
      );
    }

    await client.query('COMMIT');
    return res.json({
      message: 'Бронирование принято и оплачено для биллинга',
      reservation: updatedResult.rows[0],
      billing_cost: billingCost,
      remaining_balance: Math.max(0, balanceBefore - billingCost)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept and pay reservation error:', error);
    return res.status(500).json({ error: 'Ошибка подтверждения бронирования' });
  } finally {
    client.release();
  }
});

router.patch('/:id/status', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReservationSchema();
    const restaurantId = resolveRestaurantId(req);
    if (restaurantId === -1) {
      return res.status(403).json({ error: 'Нет доступа к выбранному магазину' });
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Ресторан не выбран' });
    }

    const reservationId = parsePositiveInt(req.params.id);
    if (!reservationId) {
      return res.status(400).json({ error: 'Некорректный ID бронирования' });
    }

    const status = normalizeStatus(req.body?.status);
    if (!ALLOWED_RESERVATION_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Некорректный статус бронирования' });
    }
    const comment = req.body?.comment ? String(req.body.comment).trim().slice(0, 500) : null;
    const cancelReason = req.body?.cancel_reason ? String(req.body.cancel_reason).trim().slice(0, 500) : null;

    await client.query('BEGIN');

    const oldResult = await client.query(
      `SELECT *
       FROM reservations
       WHERE id = $1
         AND restaurant_id = $2
       FOR UPDATE`,
      [reservationId, restaurantId]
    );
    if (!oldResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }
    const oldReservation = oldResult.rows[0];

    const updateResult = await client.query(
      `UPDATE reservations
       SET status = $2,
           cancel_reason = CASE WHEN $2 = 'cancelled' THEN COALESCE($3, cancel_reason) ELSE cancel_reason END,
           cancelled_at_status = CASE WHEN $2 = 'cancelled' THEN $4 ELSE cancelled_at_status END,
           processed_by = $5,
           processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [reservationId, status, cancelReason, oldReservation.status, req.user.id]
    );

    await client.query(
      `INSERT INTO reservation_status_history (reservation_id, status, changed_by, comment)
       VALUES ($1, $2, $3, $4)`,
      [
        reservationId,
        status,
        req.user.id,
        cancelReason || comment || `Из админки: ${req.user.full_name || req.user.username || req.user.id}`
      ]
    );

    await client.query('COMMIT');
    return res.json({
      message: 'Статус бронирования обновлен',
      reservation: updateResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update reservation status error:', error);
    return res.status(500).json({ error: 'Ошибка обновления статуса бронирования' });
  } finally {
    client.release();
  }
});

module.exports = router;
