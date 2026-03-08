const pool = require('../database/connection');
const LOW_BALANCE_ALERT_THRESHOLD = Number(process.env.LOW_BALANCE_ALERT_THRESHOLD || 3000);

async function ensureOrderPaidForProcessing({
  orderId,
  actorUserId = null,
  markProcessedByUserId = null
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT o.id, o.order_number, o.restaurant_id, o.is_paid, o.status,
              r.balance, r.is_free_tier, r.order_cost
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderResult.rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'NOT_FOUND', error: 'Заказ не найден' };
    }

    const order = orderResult.rows[0];
    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return { ok: false, code: 'CANCELLED', error: 'Заказ отменен' };
    }

    if (order.is_paid) {
      await client.query('COMMIT');
      return {
        ok: true,
        alreadyPaid: true,
        cost: Number(order.order_cost || 0),
        order,
        restaurantId: Number(order.restaurant_id || 0) || null,
        balanceBefore: Number(order.balance || 0),
        remainingBalance: Number(order.balance || 0),
        lowBalanceThreshold: LOW_BALANCE_ALERT_THRESHOLD,
        lowBalanceCrossed: false
      };
    }

    const cost = order.is_free_tier ? 0 : Number(order.order_cost || 1000);
    const balance = Number(order.balance || 0);

    if (!order.is_free_tier && balance < cost) {
      console.warn('[billing] insufficient balance', {
        orderId: Number(order.id || orderId),
        orderNumber: order.order_number,
        restaurantId: Number(order.restaurant_id || 0) || null,
        balance,
        requiredAmount: cost
      });
      await client.query('ROLLBACK');
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        error: 'Недостаточно средств на балансе',
        restaurantId: Number(order.restaurant_id || 0) || null,
        balanceBefore: balance,
        remainingBalance: balance,
        requiredAmount: cost,
        lowBalanceThreshold: LOW_BALANCE_ALERT_THRESHOLD,
        lowBalanceCrossed: false
      };
    }

    if (cost > 0) {
      await client.query(
        'UPDATE restaurants SET balance = balance - $1 WHERE id = $2',
        [cost, order.restaurant_id]
      );

      await client.query(
        `INSERT INTO billing_transactions (restaurant_id, user_id, amount, type, description)
         VALUES ($1, $2, $3, 'withdrawal', $4)`,
        [order.restaurant_id, actorUserId, -cost, `Списание за заказ #${order.id}`]
      );
    }
    const remainingBalance = Math.max(0, balance - cost);
    const lowBalanceCrossed =
      !order.is_free_tier &&
      cost > 0 &&
      balance > LOW_BALANCE_ALERT_THRESHOLD &&
      remainingBalance <= LOW_BALANCE_ALERT_THRESHOLD;

    if (markProcessedByUserId) {
      await client.query(
        `UPDATE orders
         SET is_paid = true,
             paid_amount = $2,
             processed_by = COALESCE($3, processed_by),
             processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id, cost, markProcessedByUserId]
      );
    } else {
      await client.query(
        `UPDATE orders
         SET is_paid = true,
             paid_amount = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id, cost]
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      alreadyPaid: false,
      cost,
      order,
      restaurantId: Number(order.restaurant_id || 0) || null,
      balanceBefore: balance,
      remainingBalance,
      lowBalanceThreshold: LOW_BALANCE_ALERT_THRESHOLD,
      lowBalanceCrossed
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureOrderPaidForProcessing
};
