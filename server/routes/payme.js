const express = require('express');
const pool = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { sendOrderNotification } = require('../bot/notifications');
const {
  ensureInventorySchema,
  isInventoryTrackingEnabled,
  releaseInventoryForOrder
} = require('../services/inventoryManager');
const {
  PAYME_TRANSACTION_TIMEOUT_MS,
  PAYME_DEFAULT_CALLBACK_TIMEOUT_MS,
  amountToTiyin,
  buildPaymeRpcError,
  buildPaymeRpcSuccess,
  buildPaymeCheckoutUrl,
  isPaymeConfigured,
  normalizePaymeText,
  parseBasicAuthorization,
  resolveFrontendBaseUrl,
  resolvePaymeAccountKey
} = require('../services/payme');

const router = express.Router();

const ORDER_PAYMENT_PENDING = 'pending';
const ORDER_PAYMENT_PAID = 'paid';
const ORDER_PAYMENT_CANCELLED = 'cancelled';
const ORDER_PAYMENT_REFUNDED = 'refunded';

const PAYME_ERROR_INVALID_AMOUNT = -31001;
const PAYME_ERROR_TRANSACTION_NOT_FOUND = -31003;
const PAYME_ERROR_INVALID_ACCOUNT = -31050;
const PAYME_ERROR_ACCOUNT_BUSY = -31099;
const PAYME_ERROR_CANNOT_PERFORM = -31008;
const PAYME_ERROR_AUTH = -32504;
const PAYME_ERROR_METHOD_NOT_FOUND = -32601;
const PAYME_ERROR_INVALID_PARAMS = -32602;
const PAYME_ERROR_INTERNAL = -32400;

const resolveCallbackTimeout = (restaurant) => {
  const parsed = Number.parseInt(restaurant?.payme_callback_timeout_ms, 10);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : PAYME_DEFAULT_CALLBACK_TIMEOUT_MS;
};

const getPaymeTransactionState = (transaction) => Number.parseInt(transaction?.state, 10) || 0;
const isPendingTransaction = (transaction) => getPaymeTransactionState(transaction) === 1;
const isPaidTransaction = (transaction) => getPaymeTransactionState(transaction) === 2;
const isCancelledTransaction = (transaction) => getPaymeTransactionState(transaction) < 0;

const createTransactionResult = (transaction) => ({
  create_time: Number(transaction.create_time || 0),
  transaction: String(transaction.order_id),
  state: getPaymeTransactionState(transaction)
});

const checkTransactionResult = (transaction) => ({
  create_time: Number(transaction.create_time || 0),
  perform_time: Number(transaction.perform_time || 0),
  cancel_time: Number(transaction.cancel_time || 0),
  transaction: String(transaction.order_id),
  state: getPaymeTransactionState(transaction),
  reason: transaction.reason === null || transaction.reason === undefined
    ? null
    : Number.parseInt(transaction.reason, 10)
});

const transactionStatementResult = (transaction) => ({
  id: transaction.payme_transaction_id,
  time: Number(transaction.payme_time || transaction.create_time || 0),
  amount: Number(transaction.amount_tiyin || 0),
  account: transaction.account_data || {},
  create_time: Number(transaction.create_time || 0),
  perform_time: Number(transaction.perform_time || 0),
  cancel_time: Number(transaction.cancel_time || 0),
  transaction: String(transaction.order_id),
  state: getPaymeTransactionState(transaction),
  reason: transaction.reason === null || transaction.reason === undefined
    ? null
    : Number.parseInt(transaction.reason, 10)
});

const getOrderForNotification = async (orderId) => {
  const orderResult = await pool.query(
    `SELECT o.*, r.telegram_group_id, r.telegram_bot_token
     FROM orders o
     LEFT JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.id = $1
     LIMIT 1`,
    [orderId]
  );

  if (!orderResult.rows.length) return null;

  const itemsResult = await pool.query(
    `SELECT oi.*, p.image_url
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );

  return {
    order: orderResult.rows[0],
    items: itemsResult.rows
  };
};

const notifyPaidOrder = async (orderId) => {
  const payload = await getOrderForNotification(orderId);
  if (!payload?.order) return;

  const { order, items } = payload;
  if (order.telegram_group_id) {
    await sendOrderNotification(order, items, order.telegram_group_id, order.telegram_bot_token);
    return;
  }

  await sendOrderNotification(order, items);
};

const releaseOrderInventoryIfReserved = async (client, orderId) => {
  if (!client || !orderId) return false;
  await ensureInventorySchema(client);

  const orderResult = await client.query(
    `SELECT id, restaurant_id, status, inventory_reserved
     FROM orders
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [orderId]
  );

  const order = orderResult.rows[0];
  if (!order) return false;
  if (String(order.status || '').trim().toLowerCase() !== 'new') return false;
  if (!isInventoryTrackingEnabled(order.inventory_reserved)) return false;

  const itemsResult = await client.query(
    `SELECT product_id, quantity
     FROM order_items
     WHERE order_id = $1`,
    [orderId]
  );

  await releaseInventoryForOrder({
    client,
    restaurantId: order.restaurant_id,
    items: itemsResult.rows
  });

  await client.query(
    `UPDATE orders
     SET inventory_reserved = false,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [orderId]
  );

  return true;
};

const cancelExpiredPendingTransaction = async (client, transaction) => {
  if (!transaction || !isPendingTransaction(transaction)) return transaction;
  if (Date.now() - Number(transaction.create_time || 0) < PAYME_TRANSACTION_TIMEOUT_MS) return transaction;

  const cancelTime = Date.now();
  const cancelledResult = await client.query(
    `UPDATE payme_transactions
     SET state = -1,
         reason = COALESCE(reason, 4),
         cancel_time = COALESCE(cancel_time, $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [transaction.id, cancelTime]
  );

  const cancelled = cancelledResult.rows[0] || transaction;

  await client.query(
    `UPDATE orders
     SET payment_status = $2,
         payment_cancelled_at = COALESCE(payment_cancelled_at, CURRENT_TIMESTAMP),
         payment_reference = COALESCE(payment_reference, $3),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND payment_status <> $4`,
    [cancelled.order_id, ORDER_PAYMENT_CANCELLED, cancelled.payme_transaction_id, ORDER_PAYMENT_PAID]
  );

  await releaseOrderInventoryIfReserved(client, cancelled.order_id);

  await client.query(
    `UPDATE orders
     SET status = CASE WHEN status = 'new' THEN 'cancelled' ELSE status END,
         cancel_reason = COALESCE(cancel_reason, 'Payme transaction expired'),
         cancelled_at_status = CASE WHEN status = 'new' THEN 'new' ELSE cancelled_at_status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND payment_status <> $2`,
    [cancelled.order_id, ORDER_PAYMENT_PAID]
  );

  return cancelled;
};

const findRestaurantByPaymeAuth = async (login, password) => {
  const result = await pool.query(
    `SELECT *
     FROM restaurants
     WHERE payme_enabled = true
       AND payme_api_login = $1
       AND payme_api_password = $2
     LIMIT 1`,
    [login, password]
  );

  return result.rows[0] || null;
};

const getOrderByAccount = async (restaurantId, accountKey, account) => {
  const resolveAccountValue = (source, key) => {
    if (!source || typeof source !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];

    const normalizedTarget = String(key || '').trim().toLowerCase();
    if (!normalizedTarget) return undefined;

    for (const candidateKey of Object.keys(source)) {
      if (String(candidateKey || '').trim().toLowerCase() === normalizedTarget) {
        return source[candidateKey];
      }
    }

    return undefined;
  };

  const orderIdRaw = resolveAccountValue(account, accountKey);
  const orderId = Number.parseInt(orderIdRaw, 10);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: buildPaymeRpcError(null, PAYME_ERROR_INVALID_ACCOUNT, 'Order not found', accountKey) };
  }

  const result = await pool.query(
    `SELECT o.*,
            r.payme_enabled,
            r.payme_merchant_id,
            r.payme_api_login,
            r.payme_api_password,
            r.payme_account_key,
            r.payme_test_mode,
            r.payme_callback_timeout_ms
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.id = $1
       AND o.restaurant_id = $2
     LIMIT 1`,
    [orderId, restaurantId]
  );

  if (!result.rows.length) {
    return { error: buildPaymeRpcError(null, PAYME_ERROR_INVALID_ACCOUNT, 'Order not found', accountKey) };
  }

  return { order: result.rows[0], orderId };
};

router.get('/checkout/:orderId', authenticate, async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.orderId, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID заказа' });
    }

    const result = await pool.query(
      `SELECT o.*, r.payme_enabled, r.payme_merchant_id, r.payme_api_login, r.payme_api_password,
              r.payme_test_mode, r.payme_callback_timeout_ms, r.payme_account_key
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = $1
         AND o.user_id = $2
       LIMIT 1`,
      [orderId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = result.rows[0];
    if (order.payment_method !== 'payme') {
      return res.status(400).json({ error: 'Для заказа не выбран Payme' });
    }

    if (!isPaymeConfigured(order)) {
      return res.status(400).json({ error: 'Payme не настроен для этого магазина' });
    }

    if (order.payment_status === ORDER_PAYMENT_PAID) {
      return res.json({
        already_paid: true,
        checkout_url: null
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Заказ отменен' });
    }

    const frontendUrl = resolveFrontendBaseUrl(req);
    const returnUrl = `${frontendUrl}/orders?payme_order_id=${order.id}`;
    const checkoutUrl = buildPaymeCheckoutUrl({
      merchantId: normalizePaymeText(order.payme_merchant_id),
      orderId: order.id,
      amountTiyin: amountToTiyin(order.total_amount),
      accountKey: resolvePaymeAccountKey(order),
      returnUrl,
      language: String(req.query.lang || 'ru').trim() || 'ru',
      callbackTimeoutMs: resolveCallbackTimeout(order),
      testMode: Boolean(order.payme_test_mode)
    });

    res.json({
      checkout_url: checkoutUrl,
      payment_status: order.payment_status,
      return_url: returnUrl
    });
  } catch (error) {
    console.error('Payme checkout error:', error);
    res.status(500).json({ error: 'Ошибка генерации ссылки оплаты' });
  }
});

router.get('/return', async (req, res) => {
  const orderId = Number.parseInt(req.query.order_id, 10);
  const frontendUrl = resolveFrontendBaseUrl(req);
  const target = Number.isInteger(orderId) && orderId > 0
    ? `${frontendUrl}/orders?payme_order_id=${orderId}`
    : `${frontendUrl}/orders`;
  res.redirect(target);
});

router.post('/merchant', async (req, res) => {
  const rpcId = req.body?.id ?? null;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const auth = parseBasicAuthorization(req.headers.authorization);
    if (!auth) {
      return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_AUTH, 'Недостаточно привилегий'));
    }

    const restaurant = await findRestaurantByPaymeAuth(auth.login, auth.password);
    if (!restaurant) {
      return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_AUTH, 'Недостаточно привилегий'));
    }

    const method = String(req.body?.method || '').trim();
    const params = req.body?.params || {};
    const accountKey = resolvePaymeAccountKey(restaurant);

    if (!method) {
      return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_PARAMS, 'Некорректные параметры'));
    }

    if (method === 'CheckPerformTransaction') {
      const accountLookup = await getOrderByAccount(restaurant.id, accountKey, params.account || {});
      if (accountLookup.error) {
        accountLookup.error.id = rpcId;
        return res.status(200).json(accountLookup.error);
      }

      const order = accountLookup.order;
      const requestedAmount = Number(params.amount || 0);
      const expectedAmount = amountToTiyin(order.total_amount);

      if (requestedAmount !== expectedAmount) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_AMOUNT, 'Incorrect amount'));
      }

      if (order.payment_method !== 'payme' || !isPaymeConfigured(order)) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_CANNOT_PERFORM, 'Transaction cannot be performed'));
      }

      if (order.status === 'cancelled' || order.payment_status === ORDER_PAYMENT_PAID) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_CANNOT_PERFORM, 'Transaction cannot be performed'));
      }

      return res.status(200).json(buildPaymeRpcSuccess(rpcId, { allow: true }));
    }

    if (method === 'CreateTransaction') {
      const paymeTransactionId = normalizePaymeText(params.id);
      if (!paymeTransactionId) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_PARAMS, 'Некорректные параметры'));
      }

      const requestedAmount = Number(params.amount || 0);
      const paymeTime = Number(params.time || Date.now());
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const accountLookup = await getOrderByAccount(restaurant.id, accountKey, params.account || {});
        if (accountLookup.error) {
          await client.query('ROLLBACK');
          accountLookup.error.id = rpcId;
          return res.status(200).json(accountLookup.error);
        }

        const order = accountLookup.order;
        const expectedAmount = amountToTiyin(order.total_amount);
        if (requestedAmount !== expectedAmount) {
          await client.query('ROLLBACK');
          return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_AMOUNT, 'Incorrect amount'));
        }

        if (order.payment_method !== 'payme' || !isPaymeConfigured(order) || order.status === 'cancelled' || order.payment_status === ORDER_PAYMENT_PAID) {
          await client.query('ROLLBACK');
          return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_CANNOT_PERFORM, 'Transaction cannot be performed'));
        }

        const existingResult = await client.query(
          `SELECT *
           FROM payme_transactions
           WHERE payme_transaction_id = $1
           LIMIT 1
           FOR UPDATE`,
          [paymeTransactionId]
        );

        if (existingResult.rows.length) {
          const existing = await cancelExpiredPendingTransaction(client, existingResult.rows[0]);
          if (
            Number(existing.order_id) !== Number(order.id)
            || Number(existing.amount_tiyin) !== requestedAmount
          ) {
            await client.query('ROLLBACK');
            return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_CANNOT_PERFORM, 'Transaction cannot be performed'));
          }
          await client.query('COMMIT');
          return res.status(200).json(buildPaymeRpcSuccess(rpcId, createTransactionResult(existing)));
        }

        const activeResult = await client.query(
          `SELECT *
           FROM payme_transactions
           WHERE order_id = $1
             AND state = 1
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [order.id]
        );

        if (activeResult.rows.length) {
          const activeTransaction = await cancelExpiredPendingTransaction(client, activeResult.rows[0]);
          if (isPendingTransaction(activeTransaction)) {
            await client.query('ROLLBACK');
            return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_ACCOUNT_BUSY, 'Another transaction is in progress'));
          }
        }

        const createTime = Date.now();
        const insertResult = await client.query(
          `INSERT INTO payme_transactions (
             restaurant_id,
             order_id,
             payme_transaction_id,
             payme_time,
             amount_tiyin,
             account_data,
             state,
             create_time,
             raw_request
           )
           VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
           RETURNING *`,
          [
            restaurant.id,
            order.id,
            paymeTransactionId,
            paymeTime,
            requestedAmount,
            JSON.stringify(params.account || {}),
            createTime,
            JSON.stringify(req.body || {})
          ]
        );

        await client.query(
          `UPDATE orders
           SET payment_status = $2,
               payment_provider = 'payme',
               payment_reference = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [order.id, ORDER_PAYMENT_PENDING, paymeTransactionId]
        );

        await client.query('COMMIT');
        return res.status(200).json(buildPaymeRpcSuccess(rpcId, createTransactionResult(insertResult.rows[0])));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (method === 'PerformTransaction') {
      const paymeTransactionId = normalizePaymeText(params.id);
      if (!paymeTransactionId) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_PARAMS, 'Некорректные параметры'));
      }

      const client = await pool.connect();
      let shouldNotify = false;

      try {
        await client.query('BEGIN');

        const transactionResult = await client.query(
          `SELECT *
           FROM payme_transactions
           WHERE payme_transaction_id = $1
           LIMIT 1
           FOR UPDATE`,
          [paymeTransactionId]
        );

        if (!transactionResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_TRANSACTION_NOT_FOUND, 'Transaction not found'));
        }

        let transaction = await cancelExpiredPendingTransaction(client, transactionResult.rows[0]);
        if (isCancelledTransaction(transaction)) {
          await client.query('COMMIT');
          return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_CANNOT_PERFORM, 'Transaction cannot be performed'));
        }

        if (isPaidTransaction(transaction)) {
          await client.query('COMMIT');
          return res.status(200).json(buildPaymeRpcSuccess(rpcId, checkTransactionResult(transaction)));
        }

        const performTime = Date.now();
        const updatedTransactionResult = await client.query(
          `UPDATE payme_transactions
           SET state = 2,
               perform_time = COALESCE(perform_time, $2),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [transaction.id, performTime]
        );
        transaction = updatedTransactionResult.rows[0];

        const orderUpdateResult = await client.query(
          `UPDATE orders
           SET payment_status = $2,
               payment_provider = 'payme',
               payment_reference = $3,
               payment_paid_at = COALESCE(payment_paid_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
             AND payment_status <> $2
           RETURNING id`,
          [transaction.order_id, ORDER_PAYMENT_PAID, paymeTransactionId]
        );

        shouldNotify = orderUpdateResult.rows.length > 0;

        await client.query('COMMIT');

        if (shouldNotify) {
          notifyPaidOrder(transaction.order_id).catch((notifyError) => {
            console.error('Payme order notification error:', notifyError);
          });
        }

        return res.status(200).json(buildPaymeRpcSuccess(rpcId, checkTransactionResult(transaction)));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (method === 'CancelTransaction') {
      const paymeTransactionId = normalizePaymeText(params.id);
      const reason = Number.parseInt(params.reason, 10);
      if (!paymeTransactionId) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_PARAMS, 'Некорректные параметры'));
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const transactionResult = await client.query(
          `SELECT *
           FROM payme_transactions
           WHERE payme_transaction_id = $1
           LIMIT 1
           FOR UPDATE`,
          [paymeTransactionId]
        );

        if (!transactionResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_TRANSACTION_NOT_FOUND, 'Transaction not found'));
        }

        let transaction = transactionResult.rows[0];
        if (isCancelledTransaction(transaction)) {
          await client.query('COMMIT');
          return res.status(200).json(buildPaymeRpcSuccess(rpcId, checkTransactionResult(transaction)));
        }

        const cancelTime = Date.now();
        const nextState = isPaidTransaction(transaction) ? -2 : -1;
        const updatedTransactionResult = await client.query(
          `UPDATE payme_transactions
           SET state = $2,
               reason = $3,
               cancel_time = COALESCE(cancel_time, $4),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [transaction.id, nextState, Number.isInteger(reason) ? reason : 0, cancelTime]
        );
        transaction = updatedTransactionResult.rows[0];

        const nextPaymentStatus = nextState === -2 ? ORDER_PAYMENT_REFUNDED : ORDER_PAYMENT_CANCELLED;
        await client.query(
          `UPDATE orders
           SET payment_status = $2,
               payment_provider = 'payme',
               payment_reference = $3,
               payment_cancelled_at = COALESCE(payment_cancelled_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [transaction.order_id, nextPaymentStatus, paymeTransactionId]
        );

        if (nextState === -1) {
          await releaseOrderInventoryIfReserved(client, transaction.order_id);

          await client.query(
            `UPDATE orders
             SET status = CASE WHEN status = 'new' THEN 'cancelled' ELSE status END,
                 cancel_reason = COALESCE(cancel_reason, 'Payme transaction cancelled'),
                 cancelled_at_status = CASE WHEN status = 'new' THEN 'new' ELSE cancelled_at_status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [transaction.order_id]
          );

          await client.query(
            `INSERT INTO order_status_history (order_id, status, comment)
             SELECT $1, 'cancelled', 'Payme transaction cancelled'
             WHERE NOT EXISTS (
               SELECT 1
               FROM order_status_history
               WHERE order_id = $1
                 AND status = 'cancelled'
                 AND comment = 'Payme transaction cancelled'
             )`,
            [transaction.order_id]
          );
        }

        await client.query('COMMIT');
        return res.status(200).json(buildPaymeRpcSuccess(rpcId, checkTransactionResult(transaction)));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (method === 'CheckTransaction') {
      const paymeTransactionId = normalizePaymeText(params.id);
      if (!paymeTransactionId) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_PARAMS, 'Некорректные параметры'));
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const transactionResult = await client.query(
          `SELECT *
           FROM payme_transactions
           WHERE payme_transaction_id = $1
           LIMIT 1
           FOR UPDATE`,
          [paymeTransactionId]
        );

        if (!transactionResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_TRANSACTION_NOT_FOUND, 'Transaction not found'));
        }

        const transaction = await cancelExpiredPendingTransaction(client, transactionResult.rows[0]);
        await client.query('COMMIT');
        return res.status(200).json(buildPaymeRpcSuccess(rpcId, checkTransactionResult(transaction)));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (method === 'GetStatement') {
      const from = Number(params.from || 0);
      const to = Number(params.to || 0);
      const result = await pool.query(
        `SELECT *
         FROM payme_transactions
         WHERE restaurant_id = $1
           AND create_time >= $2
           AND create_time <= $3
         ORDER BY create_time ASC`,
        [restaurant.id, from, to || Date.now()]
      );

      return res.status(200).json(buildPaymeRpcSuccess(rpcId, {
        transactions: result.rows.map(transactionStatementResult)
      }));
    }

    if (method === 'SetFiscalData') {
      const paymeTransactionId = normalizePaymeText(params.id);
      if (!paymeTransactionId) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INVALID_PARAMS, 'Некорректные параметры'));
      }

      const updateResult = await pool.query(
        `UPDATE payme_transactions
         SET fiscal_data = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE payme_transaction_id = $1
         RETURNING id`,
        [paymeTransactionId, JSON.stringify(params || {})]
      );

      if (!updateResult.rows.length) {
        return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_TRANSACTION_NOT_FOUND, 'Transaction not found'));
      }

      return res.status(200).json(buildPaymeRpcSuccess(rpcId, { success: true }));
    }

    return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_METHOD_NOT_FOUND, 'Метод не найден'));
  } catch (error) {
    console.error('Payme merchant error:', error);
    return res.status(200).json(buildPaymeRpcError(rpcId, PAYME_ERROR_INTERNAL, 'Внутренняя ошибка'));
  }
});

module.exports = router;
