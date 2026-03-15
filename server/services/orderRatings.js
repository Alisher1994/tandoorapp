const pool = require('../database/connection');

const ORDER_RATING_MIN = 0;
const ORDER_RATING_MAX = 5;
let orderRatingsSchemaReady = false;
let orderRatingsSchemaPromise = null;

const normalizeOrderRating = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < ORDER_RATING_MIN || parsed > ORDER_RATING_MAX) return fallback;
  return parsed;
};

const ensureOrderRatingsSchema = async ({ client = null } = {}) => {
  if (!client && orderRatingsSchemaReady) return;
  if (!client && orderRatingsSchemaPromise) {
    await orderRatingsSchemaPromise;
    return;
  }

  const run = async (db) => {
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_rating INTEGER DEFAULT 0').catch(() => {});
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_rating INTEGER DEFAULT 0').catch(() => {});
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_rating_reason TEXT').catch(() => {});
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_rating_reason TEXT').catch(() => {});
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating_reason_pending_field VARCHAR(32)').catch(() => {});
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating_requested_at TIMESTAMP').catch(() => {});
    await db.query('UPDATE orders SET service_rating = 0 WHERE service_rating IS NULL').catch(() => {});
    await db.query('UPDATE orders SET delivery_rating = 0 WHERE delivery_rating IS NULL').catch(() => {});
  };

  if (client) {
    await run(client);
    return;
  }

  orderRatingsSchemaPromise = (async () => {
    await run(pool);
    orderRatingsSchemaReady = true;
  })();

  try {
    await orderRatingsSchemaPromise;
  } finally {
    orderRatingsSchemaPromise = null;
  }
};

module.exports = {
  ORDER_RATING_MIN,
  ORDER_RATING_MAX,
  normalizeOrderRating,
  ensureOrderRatingsSchema
};
