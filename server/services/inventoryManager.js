const pool = require('../database/connection');

let inventorySchemaReady = false;
let inventorySchemaPromise = null;

const normalizeInventoryQuantity = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseFloat(String(value).replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round((parsed + Number.EPSILON) * 1000) / 1000;
};

const normalizeInventoryThreshold = (value, fallback = 0) => {
  const parsed = normalizeInventoryQuantity(value, fallback);
  return parsed >= 0 ? parsed : 0;
};

const isInventoryTrackingEnabled = (value) => (
  value === true
  || value === 'true'
  || value === 1
  || value === '1'
);

const ensureInventorySchema = async (clientOrPool = pool) => {
  if (inventorySchemaReady) return;
  if (inventorySchemaPromise) {
    await inventorySchemaPromise;
    return;
  }

  const db = clientOrPool || pool;
  inventorySchemaPromise = (async () => {
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS inventory_tracking_enabled BOOLEAN DEFAULT false`).catch(() => {});
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS inventory_min_threshold DECIMAL(10, 3) DEFAULT 0`).catch(() => {});
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity DECIMAL(12, 3) DEFAULT 0`).catch(() => {});
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_reserved BOOLEAN DEFAULT false`).catch(() => {});

    await db.query(`UPDATE restaurants SET inventory_tracking_enabled = false WHERE inventory_tracking_enabled IS NULL`).catch(() => {});
    await db.query(`UPDATE restaurants SET inventory_min_threshold = 0 WHERE inventory_min_threshold IS NULL OR inventory_min_threshold < 0`).catch(() => {});
    await db.query(`UPDATE products SET stock_quantity = 0 WHERE stock_quantity IS NULL OR stock_quantity < 0`).catch(() => {});
    await db.query(`UPDATE orders SET inventory_reserved = false WHERE inventory_reserved IS NULL`).catch(() => {});

    inventorySchemaReady = true;
  })();

  try {
    await inventorySchemaPromise;
  } finally {
    inventorySchemaPromise = null;
  }
};

const getRestaurantInventorySettings = async (clientOrPool, restaurantId, { forUpdate = false } = {}) => {
  const db = clientOrPool || pool;
  await ensureInventorySchema(db);
  const result = await db.query(
    `SELECT inventory_tracking_enabled, inventory_min_threshold
     FROM restaurants
     WHERE id = $1
     ${forUpdate ? 'FOR UPDATE' : ''}
     LIMIT 1`,
    [restaurantId]
  );
  const row = result.rows[0] || {};
  return {
    trackingEnabled: isInventoryTrackingEnabled(row.inventory_tracking_enabled),
    threshold: normalizeInventoryThreshold(row.inventory_min_threshold, 0)
  };
};

const aggregateOrderItemsByProduct = (items = []) => {
  const aggregated = new Map();
  for (const item of items || []) {
    const productId = Number.parseInt(item?.product_id, 10);
    const quantity = normalizeInventoryQuantity(item?.quantity, 0);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    aggregated.set(productId, (aggregated.get(productId) || 0) + quantity);
  }
  return aggregated;
};

const buildInventoryShortageError = (details = []) => {
  const error = new Error('Недостаточно остатка товара на складе');
  error.code = 'INVENTORY_SHORTAGE';
  error.status = 409;
  error.details = details;
  return error;
};

const reserveInventoryForOrder = async ({ client, restaurantId, items }) => {
  if (!client || !restaurantId) return { reserved: false, trackingEnabled: false, threshold: 0, updates: [] };
  await ensureInventorySchema(client);
  const inventorySettings = await getRestaurantInventorySettings(client, restaurantId, { forUpdate: true });
  if (!inventorySettings.trackingEnabled) {
    return { reserved: false, trackingEnabled: false, threshold: inventorySettings.threshold, updates: [] };
  }

  const requestedByProduct = aggregateOrderItemsByProduct(items);
  if (!requestedByProduct.size) {
    return { reserved: false, trackingEnabled: true, threshold: inventorySettings.threshold, updates: [] };
  }

  const productIds = [...requestedByProduct.keys()];
  const productsResult = await client.query(
    `SELECT id, restaurant_id, name_ru, name_uz, stock_quantity, in_stock
     FROM products
     WHERE id = ANY($1::int[])
       AND restaurant_id = $2
     FOR UPDATE`,
    [productIds, restaurantId]
  );
  const productById = new Map(productsResult.rows.map((row) => [Number(row.id), row]));
  const shortages = [];
  const updates = [];

  for (const productId of productIds) {
    const row = productById.get(productId);
    const requestedQty = normalizeInventoryQuantity(requestedByProduct.get(productId), 0);
    if (!row) {
      shortages.push({
        product_id: productId,
        requested_quantity: requestedQty,
        available_quantity: 0,
        threshold: inventorySettings.threshold,
        reason: 'PRODUCT_NOT_FOUND'
      });
      continue;
    }
    const availableQty = normalizeInventoryQuantity(row.stock_quantity, 0);
    const nextQty = Math.round((availableQty - requestedQty + Number.EPSILON) * 1000) / 1000;
    const productName = String(row.name_ru || row.name_uz || `ID ${productId}`).trim();
    if (nextQty + 1e-9 < inventorySettings.threshold) {
      shortages.push({
        product_id: productId,
        product_name: productName,
        requested_quantity: requestedQty,
        available_quantity: availableQty,
        threshold: inventorySettings.threshold,
        reason: 'LOW_STOCK'
      });
      continue;
    }
    updates.push({
      productId,
      productName,
      oldQuantity: availableQty,
      newQuantity: Math.max(0, nextQty),
      inStock: nextQty > inventorySettings.threshold
    });
  }

  if (shortages.length > 0) {
    throw buildInventoryShortageError(shortages);
  }

  for (const update of updates) {
    await client.query(
      `UPDATE products
       SET stock_quantity = $2,
           in_stock = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [update.productId, update.newQuantity, update.inStock]
    );
  }

  return {
    reserved: true,
    trackingEnabled: true,
    threshold: inventorySettings.threshold,
    updates
  };
};

const releaseInventoryForOrder = async ({ client, restaurantId, items }) => {
  if (!client || !restaurantId) return { released: false, trackingEnabled: false, threshold: 0, updates: [] };
  await ensureInventorySchema(client);
  const inventorySettings = await getRestaurantInventorySettings(client, restaurantId, { forUpdate: true });
  if (!inventorySettings.trackingEnabled) {
    return { released: false, trackingEnabled: false, threshold: inventorySettings.threshold, updates: [] };
  }

  const releasedByProduct = aggregateOrderItemsByProduct(items);
  if (!releasedByProduct.size) {
    return { released: false, trackingEnabled: true, threshold: inventorySettings.threshold, updates: [] };
  }

  const productIds = [...releasedByProduct.keys()];
  const productsResult = await client.query(
    `SELECT id, name_ru, name_uz, stock_quantity
     FROM products
     WHERE id = ANY($1::int[])
       AND restaurant_id = $2
     FOR UPDATE`,
    [productIds, restaurantId]
  );
  const productById = new Map(productsResult.rows.map((row) => [Number(row.id), row]));
  const updates = [];

  for (const productId of productIds) {
    const row = productById.get(productId);
    if (!row) continue;
    const restoredQty = normalizeInventoryQuantity(releasedByProduct.get(productId), 0);
    if (!Number.isFinite(restoredQty) || restoredQty <= 0) continue;
    const oldQty = normalizeInventoryQuantity(row.stock_quantity, 0);
    const nextQty = Math.round((oldQty + restoredQty + Number.EPSILON) * 1000) / 1000;
    const productName = String(row.name_ru || row.name_uz || `ID ${productId}`).trim();
    updates.push({
      productId,
      productName,
      oldQuantity: oldQty,
      newQuantity: nextQty,
      inStock: nextQty > inventorySettings.threshold
    });
  }

  for (const update of updates) {
    await client.query(
      `UPDATE products
       SET stock_quantity = $2,
           in_stock = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [update.productId, update.newQuantity, update.inStock]
    );
  }

  return {
    released: updates.length > 0,
    trackingEnabled: true,
    threshold: inventorySettings.threshold,
    updates
  };
};

const syncRestaurantInventoryAvailability = async ({ client, restaurantId, productIds = [] }) => {
  if (!client || !restaurantId) return 0;
  await ensureInventorySchema(client);
  const inventorySettings = await getRestaurantInventorySettings(client, restaurantId, { forUpdate: true });
  if (!inventorySettings.trackingEnabled) return 0;

  if (Array.isArray(productIds) && productIds.length > 0) {
    const normalizedIds = [...new Set(
      productIds
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )];
    if (!normalizedIds.length) return 0;
    const result = await client.query(
      `UPDATE products
       SET in_stock = CASE WHEN COALESCE(stock_quantity, 0) > $2 THEN true ELSE false END,
           updated_at = CURRENT_TIMESTAMP
       WHERE restaurant_id = $1
         AND id = ANY($3::int[])`,
      [restaurantId, inventorySettings.threshold, normalizedIds]
    );
    return Number(result.rowCount || 0);
  }

  const result = await client.query(
    `UPDATE products
     SET in_stock = CASE WHEN COALESCE(stock_quantity, 0) > $2 THEN true ELSE false END,
         updated_at = CURRENT_TIMESTAMP
     WHERE restaurant_id = $1`,
    [restaurantId, inventorySettings.threshold]
  );
  return Number(result.rowCount || 0);
};

module.exports = {
  ensureInventorySchema,
  normalizeInventoryQuantity,
  normalizeInventoryThreshold,
  isInventoryTrackingEnabled,
  getRestaurantInventorySettings,
  reserveInventoryForOrder,
  releaseInventoryForOrder,
  syncRestaurantInventoryAvailability
};
