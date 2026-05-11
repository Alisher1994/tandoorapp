const pool = require('../database/connection');

const PROMO_TYPES = new Set(['fixed', 'percent']);

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().slice(0, 64);
}

function parseAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseTimestamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function calculateDiscountAmount({ promo, eligibleSubtotal }) {
  const subtotal = Math.max(0, Number(eligibleSubtotal) || 0);
  const value = Math.max(0, Number(promo.value) || 0);
  if (promo.type === 'percent') {
    let amount = (subtotal * value) / 100;
    if (promo.max_discount_amount != null) {
      const cap = Number(promo.max_discount_amount) || 0;
      if (cap > 0) amount = Math.min(amount, cap);
    }
    return Math.round(amount);
  }
  // fixed
  return Math.min(subtotal, Math.round(value));
}

// Loads one promo row by (restaurant, code) with its product whitelist if applies_to_all=false.
async function loadPromoForRestaurant({ restaurantId, code, client = pool }) {
  const rid = Number(restaurantId);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const result = await client.query(
    `SELECT id, restaurant_id, code, type, value, max_discount_amount,
            applies_to_all, valid_from, valid_to, max_uses, used_count, is_active
       FROM promo_codes
       WHERE restaurant_id = $1 AND UPPER(code) = $2
       LIMIT 1`,
    [rid, normalized]
  );
  const promo = result.rows[0];
  if (!promo) return null;
  if (!promo.applies_to_all) {
    const productsResult = await client.query(
      `SELECT product_id FROM promo_code_products WHERE promo_code_id = $1`,
      [promo.id]
    );
    promo.product_ids = new Set(productsResult.rows.map((r) => Number(r.product_id)));
  } else {
    promo.product_ids = null;
  }
  return promo;
}

// items: [{ product_id, total }] — `total` is the line subtotal (qty * price + container).
// Returns the subset sum that the promo actually applies to (full cart for applies_to_all,
// otherwise sum of matching product lines).
function computeEligibleSubtotal({ promo, items }) {
  if (!promo) return 0;
  if (promo.applies_to_all) {
    return (items || []).reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  }
  const allowed = promo.product_ids || new Set();
  return (items || []).reduce((sum, it) => {
    if (allowed.has(Number(it.product_id))) return sum + (Number(it.total) || 0);
    return sum;
  }, 0);
}

// Pure validator — does NOT touch used_count. Use this from the cart "Apply" button.
async function validatePromo({ restaurantId, code, items, now = new Date() }) {
  const promo = await loadPromoForRestaurant({ restaurantId, code });
  if (!promo) return { valid: false, reason: 'NOT_FOUND' };
  if (!promo.is_active) return { valid: false, reason: 'INACTIVE' };
  if (!PROMO_TYPES.has(promo.type)) return { valid: false, reason: 'INVALID_TYPE' };
  const nowDate = now instanceof Date ? now : new Date(now);
  if (promo.valid_from && new Date(promo.valid_from).getTime() > nowDate.getTime()) {
    return { valid: false, reason: 'NOT_STARTED' };
  }
  if (promo.valid_to && new Date(promo.valid_to).getTime() < nowDate.getTime()) {
    return { valid: false, reason: 'EXPIRED' };
  }
  if (promo.max_uses != null && Number(promo.used_count) >= Number(promo.max_uses)) {
    return { valid: false, reason: 'MAX_USES_REACHED' };
  }
  const eligibleSubtotal = computeEligibleSubtotal({ promo, items });
  if (eligibleSubtotal <= 0) {
    return { valid: false, reason: 'NO_ELIGIBLE_ITEMS' };
  }
  const discountAmount = calculateDiscountAmount({ promo, eligibleSubtotal });
  if (discountAmount <= 0) return { valid: false, reason: 'ZERO_DISCOUNT' };
  return {
    valid: true,
    promo: {
      id: promo.id,
      code: promo.code,
      type: promo.type,
      value: Number(promo.value),
      max_discount_amount: promo.max_discount_amount != null ? Number(promo.max_discount_amount) : null,
      applies_to_all: promo.applies_to_all,
      max_uses: promo.max_uses,
      used_count: Number(promo.used_count)
    },
    eligibleSubtotal,
    discountAmount
  };
}

// Atomic apply for use inside the order-create transaction. Pass the same client
// (transaction). Re-runs validation under FOR UPDATE so concurrent orders cannot exceed
// max_uses. Returns { applied: true, discountAmount, promoId } or { applied: false, reason }.
async function applyPromoForOrder({ client, restaurantId, code, items }) {
  const normalized = normalizeCode(code);
  if (!normalized) return { applied: false, reason: 'EMPTY' };
  const locked = await client.query(
    `SELECT id, restaurant_id, code, type, value, max_discount_amount,
            applies_to_all, valid_from, valid_to, max_uses, used_count, is_active
       FROM promo_codes
       WHERE restaurant_id = $1 AND UPPER(code) = $2
       FOR UPDATE`,
    [Number(restaurantId), normalized]
  );
  const promo = locked.rows[0];
  if (!promo) return { applied: false, reason: 'NOT_FOUND' };
  if (!promo.is_active) return { applied: false, reason: 'INACTIVE' };
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from).getTime() > now.getTime()) {
    return { applied: false, reason: 'NOT_STARTED' };
  }
  if (promo.valid_to && new Date(promo.valid_to).getTime() < now.getTime()) {
    return { applied: false, reason: 'EXPIRED' };
  }
  if (promo.max_uses != null && Number(promo.used_count) >= Number(promo.max_uses)) {
    return { applied: false, reason: 'MAX_USES_REACHED' };
  }
  if (!promo.applies_to_all) {
    const products = await client.query(
      `SELECT product_id FROM promo_code_products WHERE promo_code_id = $1`,
      [promo.id]
    );
    promo.product_ids = new Set(products.rows.map((r) => Number(r.product_id)));
  } else {
    promo.product_ids = null;
  }
  const eligibleSubtotal = computeEligibleSubtotal({ promo, items });
  if (eligibleSubtotal <= 0) return { applied: false, reason: 'NO_ELIGIBLE_ITEMS' };
  const discountAmount = calculateDiscountAmount({ promo, eligibleSubtotal });
  if (discountAmount <= 0) return { applied: false, reason: 'ZERO_DISCOUNT' };
  await client.query(
    `UPDATE promo_codes SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [promo.id]
  );
  return {
    applied: true,
    promoId: promo.id,
    code: promo.code,
    type: promo.type,
    value: Number(promo.value),
    discountAmount
  };
}

module.exports = {
  PROMO_TYPES,
  normalizeCode,
  parseAmount,
  parseTimestamp,
  calculateDiscountAmount,
  computeEligibleSubtotal,
  loadPromoForRestaurant,
  validatePromo,
  applyPromoForOrder
};
