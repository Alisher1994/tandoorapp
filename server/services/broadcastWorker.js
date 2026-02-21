const pool = require('../database/connection');
const TelegramBot = require('node-telegram-bot-api');
let isProcessing = false;

async function processScheduledBroadcasts() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Get active broadcasts due now
        const result = await pool.query(`
      SELECT sb.*, r.telegram_bot_token, r.name as restaurant_name
      FROM scheduled_broadcasts sb
      JOIN restaurants r ON sb.restaurant_id = r.id
      WHERE sb.is_active = true
        AND sb.scheduled_at <= NOW()
        AND (sb.last_run_at IS NULL OR sb.last_run_at < sb.scheduled_at)
    `);

        const now = new Date();

        for (const sb of result.rows) {
            console.log(`Processing scheduled broadcast ${sb.id} for restaurant ${sb.restaurant_name}`);

            // Create history record
            const historyResult = await pool.query(`
        INSERT INTO broadcast_history (restaurant_id, user_id, scheduled_broadcast_id, message, image_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [sb.restaurant_id, sb.user_id, sb.id, sb.message, sb.image_url]);
            const broadcastHistoryId = historyResult.rows[0].id;

            const success = await sendBroadcastMessage(sb, broadcastHistoryId);

            if (success) {
                // Handle recurrence
                let nextRun = null;
                if (sb.recurrence === 'daily') {
                    nextRun = new Date(now);
                    nextRun.setDate(nextRun.getDate() + 1);
                    nextRun.setHours(sb.scheduled_at.getHours(), sb.scheduled_at.getMinutes(), 0, 0);
                } else if (sb.recurrence === 'weekly') {
                    nextRun = new Date(now);
                    nextRun.setDate(nextRun.getDate() + 7);
                    nextRun.setHours(sb.scheduled_at.getHours(), sb.scheduled_at.getMinutes(), 0, 0);
                } else if (sb.recurrence === 'custom' && sb.repeat_days && sb.repeat_days.length > 0) {
                    // Find next day in repeat_days
                    const currentDay = now.getDay();
                    const sortedDays = [...sb.repeat_days].sort((a, b) => a - b);
                    let nextDay = sortedDays.find(d => d > currentDay);
                    nextRun = new Date(now);
                    let diff = nextDay - currentDay;
                    if (nextDay === undefined || diff <= 0) {
                        nextDay = sortedDays[0];
                        diff = (nextDay + 7) - currentDay;
                    }
                    nextRun.setDate(nextRun.getDate() + diff);
                    nextRun.setHours(sb.scheduled_at.getHours(), sb.scheduled_at.getMinutes(), 0, 0);
                }

                if (nextRun) {
                    await pool.query(`
            UPDATE scheduled_broadcasts 
            SET last_run_at = $1, scheduled_at = $2 
            WHERE id = $3
          `, [now, nextRun, sb.id]);
                } else {
                    // One-time broadcast
                    await pool.query(`
            UPDATE scheduled_broadcasts 
            SET last_run_at = $1, is_active = false 
            WHERE id = $2
          `, [now, sb.id]);
                }
            }
        }
    } catch (error) {
        console.error('Process scheduled broadcasts error:', error);
    } finally {
        isProcessing = false;
    }
}

async function sendBroadcastMessage(sb, historyId) {
    try {
        const bot = new TelegramBot(sb.telegram_bot_token);

        // Get customers
        const customersResult = await pool.query(`
      SELECT DISTINCT u.telegram_id
      FROM users u
      WHERE u.telegram_id IS NOT NULL 
        AND u.is_active = true
        AND u.role = 'customer'
        AND (
          u.active_restaurant_id = $1
          OR u.id IN (SELECT DISTINCT user_id FROM orders WHERE restaurant_id = $1)
          OR u.id IN (SELECT DISTINCT user_id FROM user_restaurants WHERE restaurant_id = $1)
        )
    `, [sb.restaurant_id]);

        const customers = customersResult.rows;
        if (customers.length === 0) return true;

        const broadcastMessage = `📢 <b>${sb.restaurant_name}</b>\n\n${sb.message}`;

        for (const customer of customers) {
            try {
                let sentMsg;
                if (sb.image_url) {
                    sentMsg = await bot.sendPhoto(customer.telegram_id, sb.image_url, {
                        caption: broadcastMessage,
                        parse_mode: 'HTML'
                    });
                } else {
                    sentMsg = await bot.sendMessage(customer.telegram_id, broadcastMessage, {
                        parse_mode: 'HTML'
                    });
                }

                if (sentMsg && sentMsg.message_id) {
                    await pool.query(`
              INSERT INTO broadcast_sent_messages (broadcast_history_id, chat_id, message_id)
              VALUES ($1, $2, $3)
            `, [historyId, customer.telegram_id, sentMsg.message_id]);
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
                console.error(`Worker failed to send msg to ${customer.telegram_id}:`, err.message);
            }
        }
        return true;
    } catch (error) {
        console.error(`sendBroadcastMessage error for sb ${sb.id}:`, error);
        return false;
    }
}

function initBroadcastWorker() {
    // Run once on startup and then poll
    processScheduledBroadcasts().catch((e) => console.error('Initial scheduled broadcasts check failed:', e));
    setInterval(processScheduledBroadcasts, 30000);
    console.log('⏰ Scheduled broadcast worker initialized');
}

module.exports = { initBroadcastWorker };
