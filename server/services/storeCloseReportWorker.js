const pool = require('../database/connection');
const { getRestaurantBot } = require('../bot/notifications');

const REPORT_TIMEZONE = process.env.RESTAURANT_TIMEZONE || 'Asia/Tashkent';
const CLOSE_REPORT_WINDOW_MINUTES = Number(process.env.CLOSE_REPORT_WINDOW_MINUTES || 120);
const CLOSE_REPORT_WORKER_INTERVAL_MS = Number(process.env.CLOSE_REPORT_WORKER_INTERVAL_MS || 60000);

let isProcessing = false;
const padDatePart = (value) => String(value).padStart(2, '0');

function parseTimeToMinutes(value) {
  if (!value) return null;
  const parts = String(value).trim().split(':');
  if (parts.length < 2) return null;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return (hh * 60) + mm;
}

function getNowMinutesInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const hh = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const mm = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return (hh * 60) + mm;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

function getDateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey, offsetDays) {
  const [year, month, day] = String(dateKey || '').split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return dateKey;
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return `${shifted.getUTCFullYear()}-${padDatePart(shifted.getUTCMonth() + 1)}-${padDatePart(shifted.getUTCDate())}`;
}

function resolveReportDateKey({ now, nowMinutes, closeMinutes, timeZone }) {
  const todayKey = getDateKeyInTimeZone(now, timeZone);
  if (closeMinutes === null) return todayKey;
  return nowMinutes >= closeMinutes ? todayKey : shiftDateKey(todayKey, -1);
}

function formatReportDateLabel(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return String(dateKey || '—');
  return `${padDatePart(day)}.${padDatePart(month)}.${year}`;
}

async function getDailyOrderStats(restaurantId, reportDateKey) {
  const statsResult = await pool.query(
    `SELECT
       COUNT(*)::int AS orders_count,
       COALESCE(SUM(total_amount), 0) AS total_sum,
       COALESCE(SUM(service_fee), 0) AS service_sum,
       COALESCE(SUM(delivery_cost), 0) AS delivery_sum,
       COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
       COUNT(*) FILTER (WHERE status IN ('preparing', 'in_progress'))::int AS preparing_count,
       COUNT(*) FILTER (WHERE status = 'delivering')::int AS delivering_count,
       COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_count,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count
     FROM orders
     WHERE restaurant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + interval '1 day')`,
    [restaurantId, reportDateKey]
  );

  let breakdownResult;
  try {
    breakdownResult = await pool.query(
      `SELECT
         COALESCE(SUM((oi.quantity::numeric) * (oi.price::numeric)), 0) AS items_sum,
         COALESCE(
           SUM(
             CEIL(
               (oi.quantity::numeric) /
               NULLIF(GREATEST(COALESCE(oi.container_norm, 1)::numeric, 1), 0)
             ) * COALESCE(oi.container_price, 0)::numeric
           ),
           0
         ) AS containers_sum
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.restaurant_id = $1
         AND o.created_at >= $2::date
         AND o.created_at < ($2::date + interval '1 day')`,
      [restaurantId, reportDateKey]
    );
  } catch (error) {
    if (error.code === '42703') {
      breakdownResult = {
        rows: [{
          items_sum: 0,
          containers_sum: 0
        }]
      };
    } else {
      throw error;
    }
  }

  return {
    stats: statsResult.rows[0] || {},
    breakdown: breakdownResult.rows[0] || {}
  };
}

function buildCloseReportMessage(restaurantName, reportDateKey, stats, breakdown) {
  const ordersCount = Number(stats.orders_count || 0);
  const totalSum = Number(stats.total_sum || 0);
  const serviceSum = Number(stats.service_sum || 0);
  const deliverySum = Number(stats.delivery_sum || 0);
  const containersSum = Number(breakdown.containers_sum || 0);
  let itemsSum = Number(breakdown.items_sum || 0);

  if (itemsSum <= 0 && totalSum > 0) {
    itemsSum = Math.max(0, totalSum - serviceSum - deliverySum - containersSum);
  }

  return (
    `📊 <b>Отчёт после закрытия магазина</b>\n` +
    `🏪 <b>${String(restaurantName || 'Магазин')}</b>\n\n` +
    `📅 Дата отчёта: <b>${formatReportDateLabel(reportDateKey)}</b>\n\n` +
    `📦 Кол-во заказов: <b>${ordersCount}</b>\n` +
    `💵 Общая сумма заказов: <b>${formatMoney(totalSum)} сум</b>\n\n` +
    `🧾 Сумма товара: <b>${formatMoney(itemsSum)} сум</b>\n` +
    `🍽 Пакеты / Посуда: <b>${formatMoney(containersSum)} сум</b>\n` +
    `🛎 Услуга сервиса: <b>${formatMoney(serviceSum)} сум</b>\n` +
    `🚗 Доставка: <b>${formatMoney(deliverySum)} сум</b>\n\n` +
    `Статусы: 🆕 ${Number(stats.new_count || 0)} · 👨‍🍳 ${Number(stats.preparing_count || 0)} · 🚚 ${Number(stats.delivering_count || 0)} · ✅ ${Number(stats.delivered_count || 0)} · ❌ ${Number(stats.cancelled_count || 0)}`
  );
}

async function processStoreCloseReports() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = new Date();
    const nowMinutes = getNowMinutesInTimeZone(REPORT_TIMEZONE);

    let restaurantsResult;
    try {
      restaurantsResult = await pool.query(
        `SELECT id, name, telegram_bot_token, telegram_group_id, end_time, close_report_last_sent_at
         FROM restaurants
         WHERE send_daily_close_report = true
           AND telegram_bot_token IS NOT NULL
           AND TRIM(COALESCE(telegram_bot_token, '')) <> ''
           AND telegram_group_id IS NOT NULL
           AND TRIM(COALESCE(telegram_group_id, '')) <> ''
           AND end_time IS NOT NULL`
      );
    } catch (error) {
      if (error.code === '42703') return;
      throw error;
    }

    for (const restaurant of restaurantsResult.rows) {
      const closeMinutes = parseTimeToMinutes(restaurant.end_time);
      if (closeMinutes === null) continue;

      const minutesSinceClose = (nowMinutes - closeMinutes + 1440) % 1440;
      if (minutesSinceClose > CLOSE_REPORT_WINDOW_MINUTES) continue;
      const reportDateKey = resolveReportDateKey({
        now,
        nowMinutes,
        closeMinutes,
        timeZone: REPORT_TIMEZONE
      });

      const lastSentAtRaw = restaurant.close_report_last_sent_at;
      if (lastSentAtRaw) {
        const lastSentAt = new Date(lastSentAtRaw);
        const minutesSinceLastSend = Math.floor((now.getTime() - lastSentAt.getTime()) / 60000);
        if (Number.isFinite(minutesSinceLastSend) && minutesSinceLastSend >= 0 && minutesSinceLastSend <= (CLOSE_REPORT_WINDOW_MINUTES + 5)) {
          continue;
        }
      }

      const { stats, breakdown } = await getDailyOrderStats(restaurant.id, reportDateKey);
      const message = buildCloseReportMessage(restaurant.name, reportDateKey, stats, breakdown);
      const bot = getRestaurantBot(restaurant.telegram_bot_token, restaurant.id);
      if (!bot) continue;

      try {
        await bot.sendMessage(String(restaurant.telegram_group_id), message, { parse_mode: 'HTML' });
        await pool.query(
          `UPDATE restaurants
           SET close_report_last_sent_at = NOW(),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [restaurant.id]
        );
      } catch (sendError) {
        console.error(`Store close report send error (restaurant ${restaurant.id}):`, sendError.message);
      }
    }
  } catch (error) {
    console.error('Store close report worker error:', error);
  } finally {
    isProcessing = false;
  }
}

function initStoreCloseReportWorker() {
  processStoreCloseReports().catch((error) => {
    console.error('Initial store close report check failed:', error);
  });
  setInterval(processStoreCloseReports, CLOSE_REPORT_WORKER_INTERVAL_MS);
  console.log('🧾 Store close report worker initialized');
}

module.exports = {
  initStoreCloseReportWorker
};
