const pool = require('../database/connection');
const { getRestaurantBot } = require('../bot/notifications');

const REMINDER_TIMEZONE = process.env.RESTAURANT_TIMEZONE || 'Asia/Tashkent';
const REMINDER_WORKER_INTERVAL_MS = Number(process.env.SCHEDULED_DELIVERY_REMINDER_INTERVAL_MS || 3600000);
const REMINDER_HOUR = Number(process.env.SCHEDULED_DELIVERY_REMINDER_HOUR || 9);

let isProcessing = false;

function getTodayInTimezone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value || '0000';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function getNowHourInTimezone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'hour')?.value || 0);
}

function shiftDateKey(dateKey, offsetDays) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const pad = v => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatDateLabel(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  return `${day}.${month}.${year}`;
}

async function processScheduledDeliveryReminders() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const currentHour = getNowHourInTimezone(REMINDER_TIMEZONE);
    if (currentHour !== REMINDER_HOUR) return;

    const todayKey = getTodayInTimezone(REMINDER_TIMEZONE);
    const tomorrowKey = shiftDateKey(todayKey, 1);

    const ordersResult = await pool.query(
      `SELECT o.id, o.order_number, o.delivery_date, o.customer_name, o.total_amount,
              o.restaurant_id, o.status,
              r.name AS restaurant_name, r.telegram_bot_token, r.telegram_group_id
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.delivery_date = $1
         AND o.status NOT IN ('delivered', 'cancelled')
         AND r.telegram_bot_token IS NOT NULL
         AND TRIM(COALESCE(r.telegram_bot_token, '')) <> ''
         AND r.telegram_group_id IS NOT NULL
         AND TRIM(COALESCE(r.telegram_group_id, '')) <> ''`,
      [tomorrowKey]
    );

    if (ordersResult.rows.length === 0) return;

    const groupedByRestaurant = {};
    for (const order of ordersResult.rows) {
      const key = order.restaurant_id;
      if (!groupedByRestaurant[key]) {
        groupedByRestaurant[key] = {
          restaurant_name: order.restaurant_name,
          bot_token: order.telegram_bot_token,
          group_id: order.telegram_group_id,
          orders: []
        };
      }
      groupedByRestaurant[key].orders.push(order);
    }

    for (const [restaurantId, data] of Object.entries(groupedByRestaurant)) {
      try {
        const bot = getRestaurantBot(data.bot_token, Number(restaurantId));
        if (!bot) continue;

        const orderLines = data.orders.map(o =>
          `  #${o.order_number} — ${o.customer_name || 'Клиент'} — ${Number(o.total_amount || 0).toLocaleString('ru-RU')} сум`
        ).join('\n');

        const message =
          `📅 <b>Напоминание: заказы на завтра</b>\n` +
          `🏪 <b>${data.restaurant_name}</b>\n\n` +
          `Дата доставки: <b>${formatDateLabel(tomorrowKey)}</b>\n` +
          `Заказов: <b>${data.orders.length}</b>\n\n` +
          `${orderLines}`;

        await bot.sendMessage(data.group_id, message, { parse_mode: 'HTML' });
      } catch (err) {
        console.error(`Scheduled delivery reminder error for restaurant ${restaurantId}:`, err.message);
      }
    }

    console.log(`Scheduled delivery reminders sent for ${Object.keys(groupedByRestaurant).length} restaurant(s)`);
  } catch (error) {
    console.error('Scheduled delivery reminder worker error:', error.message);
  } finally {
    isProcessing = false;
  }
}

function initScheduledDeliveryReminderWorker() {
  console.log(`Scheduled delivery reminder worker started (interval: ${REMINDER_WORKER_INTERVAL_MS}ms, hour: ${REMINDER_HOUR})`);
  setInterval(processScheduledDeliveryReminders, REMINDER_WORKER_INTERVAL_MS);
  setTimeout(processScheduledDeliveryReminders, 10000);
}

module.exports = { initScheduledDeliveryReminderWorker };
