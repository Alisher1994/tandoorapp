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

const normalizeVariantKey = (value) => String(value || '').trim().toLowerCase();
const normalizeVariantName = (value) => String(value || '').trim().slice(0, 120);
const extractVariantNameFromProductName = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const match = normalized.match(/\(([^()]{1,120})\)\s*$/);
  return match ? normalizeVariantName(match[1]) : '';
};
const resolveOrderItemVariantName = (item) => {
  const explicitVariant = normalizeVariantName(item?.selected_variant ?? item?.selectedVariant);
  if (explicitVariant) return explicitVariant;
  return extractVariantNameFromProductName(item?.product_name);
};

const normalizeProductVariantsForInventory = (value) => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_) {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  return source
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      ...item,
      name: normalizeVariantName(item.name || item.value || item.label),
      stock_quantity: normalizeInventoryQuantity(item.stock_quantity, 0),
      in_stock: item.in_stock !== false
    }))
    .filter((item) => item.name);
};

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
    await db.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_variant VARCHAR(120)`).catch(() => {});

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
    const current = aggregated.get(productId) || {
      baseQuantity: 0,
      variants: new Map()
    };

    const variantName = resolveOrderItemVariantName(item);
    if (variantName) {
      const variantKey = normalizeVariantKey(variantName);
      const currentVariant = current.variants.get(variantKey) || { name: variantName, quantity: 0 };
      currentVariant.quantity = Math.round((currentVariant.quantity + quantity + Number.EPSILON) * 1000) / 1000;
      if (!currentVariant.name) currentVariant.name = variantName;
      current.variants.set(variantKey, currentVariant);
    } else {
      current.baseQuantity = Math.round((current.baseQuantity + quantity + Number.EPSILON) * 1000) / 1000;
    }
    aggregated.set(productId, current);
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
    `SELECT id, restaurant_id, name_ru, name_uz, stock_quantity, in_stock, size_enabled, size_options
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
    const requested = requestedByProduct.get(productId) || { baseQuantity: 0, variants: new Map() };
    const requestedQty = normalizeInventoryQuantity(requested.baseQuantity, 0);
    const requestedVariantEntries = [...(requested.variants?.values() || [])]
      .filter((variant) => variant && Number.isFinite(variant.quantity) && variant.quantity > 0);
    const requestedVariantTotal = requestedVariantEntries.reduce(
      (sum, variant) => Math.round((sum + normalizeInventoryQuantity(variant.quantity, 0) + Number.EPSILON) * 1000) / 1000,
      0
    );
    const totalRequestedQty = Math.round((requestedQty + requestedVariantTotal + Number.EPSILON) * 1000) / 1000;
    if (!row) {
      shortages.push({
        product_id: productId,
        requested_quantity: totalRequestedQty,
        available_quantity: 0,
        threshold: inventorySettings.threshold,
        reason: 'PRODUCT_NOT_FOUND'
      });
      continue;
    }
    const productName = String(row.name_ru || row.name_uz || `ID ${productId}`).trim();
    const isVariantMode = row.size_enabled === true;
    const sourceVariants = normalizeProductVariantsForInventory(row.size_options);

    if (isVariantMode && sourceVariants.length > 0) {
      const nextVariants = sourceVariants.map((variant) => ({
        ...variant,
        stock_quantity: normalizeInventoryQuantity(variant.stock_quantity, 0),
        in_stock: variant.in_stock !== false
      }));
      const variantIndexByKey = new Map(
        nextVariants.map((variant, index) => [normalizeVariantKey(variant.name), index])
      );

      for (const requestedVariant of requestedVariantEntries) {
        const requestedVariantQuantity = normalizeInventoryQuantity(requestedVariant.quantity, 0);
        if (requestedVariantQuantity <= 0) continue;
        const variantKey = normalizeVariantKey(requestedVariant.name);
        const variantIndex = variantIndexByKey.get(variantKey);
        if (variantIndex === undefined) {
          shortages.push({
            product_id: productId,
            product_name: productName,
            variant_name: requestedVariant.name,
            requested_quantity: requestedVariantQuantity,
            available_quantity: 0,
            threshold: inventorySettings.threshold,
            reason: 'VARIANT_NOT_FOUND'
          });
          continue;
        }

        const availableVariantQty = normalizeInventoryQuantity(nextVariants[variantIndex].stock_quantity, 0);
        const nextVariantQty = Math.round((availableVariantQty - requestedVariantQuantity + Number.EPSILON) * 1000) / 1000;
        if (nextVariantQty + 1e-9 < inventorySettings.threshold) {
          shortages.push({
            product_id: productId,
            product_name: productName,
            variant_name: nextVariants[variantIndex].name,
            requested_quantity: requestedVariantQuantity,
            available_quantity: availableVariantQty,
            threshold: inventorySettings.threshold,
            reason: 'LOW_STOCK_VARIANT'
          });
          continue;
        }

        nextVariants[variantIndex].stock_quantity = Math.max(0, nextVariantQty);
        nextVariants[variantIndex].in_stock = nextVariantQty > inventorySettings.threshold;
      }

      let remainingBaseQty = requestedQty;
      if (remainingBaseQty > 0) {
        for (const variant of nextVariants) {
          const variantQty = normalizeInventoryQuantity(variant.stock_quantity, 0);
          const maxReservable = Math.max(0, variantQty - inventorySettings.threshold);
          if (maxReservable <= 0) continue;
          const take = Math.min(remainingBaseQty, maxReservable);
          if (take <= 0) continue;
          const nextVariantQty = Math.round((variantQty - take + Number.EPSILON) * 1000) / 1000;
          variant.stock_quantity = Math.max(0, nextVariantQty);
          variant.in_stock = nextVariantQty > inventorySettings.threshold;
          remainingBaseQty = Math.round((remainingBaseQty - take + Number.EPSILON) * 1000) / 1000;
          if (remainingBaseQty <= 1e-9) break;
        }
      }

      if (remainingBaseQty > 1e-9) {
        const availableVariantTotal = nextVariants.reduce(
          (sum, variant) => Math.round((sum + normalizeInventoryQuantity(variant.stock_quantity, 0) + Number.EPSILON) * 1000) / 1000,
          0
        );
        shortages.push({
          product_id: productId,
          product_name: productName,
          requested_quantity: requestedQty,
          available_quantity: availableVariantTotal,
          threshold: inventorySettings.threshold,
          reason: 'LOW_STOCK'
        });
        continue;
      }

      const nextProductQty = nextVariants.reduce(
        (sum, variant) => Math.round((sum + normalizeInventoryQuantity(variant.stock_quantity, 0) + Number.EPSILON) * 1000) / 1000,
        0
      );
      const nextProductInStock = nextVariants.some(
        (variant) => normalizeInventoryQuantity(variant.stock_quantity, 0) > inventorySettings.threshold
      );
      updates.push({
        productId,
        productName,
        oldQuantity: normalizeInventoryQuantity(row.stock_quantity, 0),
        newQuantity: nextProductQty,
        inStock: nextProductInStock,
        sizeOptions: nextVariants
      });
      continue;
    }

    const availableQty = normalizeInventoryQuantity(row.stock_quantity, 0);
    const nextQty = Math.round((availableQty - totalRequestedQty + Number.EPSILON) * 1000) / 1000;
    if (nextQty + 1e-9 < inventorySettings.threshold) {
      shortages.push({
        product_id: productId,
        product_name: productName,
        requested_quantity: totalRequestedQty,
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
      inStock: nextQty > inventorySettings.threshold,
      sizeOptions: null
    });
  }

  if (shortages.length > 0) {
    throw buildInventoryShortageError(shortages);
  }

  for (const update of updates) {
    if (Array.isArray(update.sizeOptions)) {
      await client.query(
        `UPDATE products
         SET stock_quantity = $2,
             in_stock = $3,
             size_options = $4::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [update.productId, update.newQuantity, update.inStock, JSON.stringify(update.sizeOptions)]
      );
    } else {
      await client.query(
        `UPDATE products
         SET stock_quantity = $2,
             in_stock = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [update.productId, update.newQuantity, update.inStock]
      );
    }
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
    `SELECT id, name_ru, name_uz, stock_quantity, size_enabled, size_options
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
    const productName = String(row.name_ru || row.name_uz || `ID ${productId}`).trim();
    const released = releasedByProduct.get(productId) || { baseQuantity: 0, variants: new Map() };
    const releasedBaseQty = normalizeInventoryQuantity(released.baseQuantity, 0);
    const releasedVariantEntries = [...(released.variants?.values() || [])]
      .filter((variant) => variant && Number.isFinite(variant.quantity) && variant.quantity > 0);
    const releasedVariantTotal = releasedVariantEntries.reduce(
      (sum, variant) => Math.round((sum + normalizeInventoryQuantity(variant.quantity, 0) + Number.EPSILON) * 1000) / 1000,
      0
    );
    const totalReleasedQty = Math.round((releasedBaseQty + releasedVariantTotal + Number.EPSILON) * 1000) / 1000;
    if (!Number.isFinite(totalReleasedQty) || totalReleasedQty <= 0) continue;

    const isVariantMode = row.size_enabled === true;
    const sourceVariants = normalizeProductVariantsForInventory(row.size_options);
    if (isVariantMode && sourceVariants.length > 0) {
      const nextVariants = sourceVariants.map((variant) => ({
        ...variant,
        stock_quantity: normalizeInventoryQuantity(variant.stock_quantity, 0),
        in_stock: variant.in_stock !== false
      }));
      const variantIndexByKey = new Map(
        nextVariants.map((variant, index) => [normalizeVariantKey(variant.name), index])
      );

      for (const releasedVariant of releasedVariantEntries) {
        const releasedVariantQuantity = normalizeInventoryQuantity(releasedVariant.quantity, 0);
        if (releasedVariantQuantity <= 0) continue;
        const variantKey = normalizeVariantKey(releasedVariant.name);
        const variantIndex = variantIndexByKey.get(variantKey);
        if (variantIndex === undefined) {
          const fallbackIndex = 0;
          if (nextVariants[fallbackIndex]) {
            const currentQty = normalizeInventoryQuantity(nextVariants[fallbackIndex].stock_quantity, 0);
            nextVariants[fallbackIndex].stock_quantity = Math.round((currentQty + releasedVariantQuantity + Number.EPSILON) * 1000) / 1000;
          }
          continue;
        }
        const currentQty = normalizeInventoryQuantity(nextVariants[variantIndex].stock_quantity, 0);
        nextVariants[variantIndex].stock_quantity = Math.round((currentQty + releasedVariantQuantity + Number.EPSILON) * 1000) / 1000;
      }

      if (releasedBaseQty > 0 && nextVariants[0]) {
        const currentQty = normalizeInventoryQuantity(nextVariants[0].stock_quantity, 0);
        nextVariants[0].stock_quantity = Math.round((currentQty + releasedBaseQty + Number.EPSILON) * 1000) / 1000;
      }

      nextVariants.forEach((variant) => {
        const variantQty = normalizeInventoryQuantity(variant.stock_quantity, 0);
        variant.in_stock = variantQty > inventorySettings.threshold;
      });

      const oldQty = normalizeInventoryQuantity(row.stock_quantity, 0);
      const nextQty = nextVariants.reduce(
        (sum, variant) => Math.round((sum + normalizeInventoryQuantity(variant.stock_quantity, 0) + Number.EPSILON) * 1000) / 1000,
        0
      );
      updates.push({
        productId,
        productName,
        oldQuantity: oldQty,
        newQuantity: nextQty,
        inStock: nextVariants.some((variant) => normalizeInventoryQuantity(variant.stock_quantity, 0) > inventorySettings.threshold),
        sizeOptions: nextVariants
      });
      continue;
    }

    const oldQty = normalizeInventoryQuantity(row.stock_quantity, 0);
    const nextQty = Math.round((oldQty + totalReleasedQty + Number.EPSILON) * 1000) / 1000;
    updates.push({
      productId,
      productName,
      oldQuantity: oldQty,
      newQuantity: nextQty,
      inStock: nextQty > inventorySettings.threshold,
      sizeOptions: null
    });
  }

  for (const update of updates) {
    if (Array.isArray(update.sizeOptions)) {
      await client.query(
        `UPDATE products
         SET stock_quantity = $2,
             in_stock = $3,
             size_options = $4::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [update.productId, update.newQuantity, update.inStock, JSON.stringify(update.sizeOptions)]
      );
    } else {
      await client.query(
        `UPDATE products
         SET stock_quantity = $2,
             in_stock = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [update.productId, update.newQuantity, update.inStock]
      );
    }
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
