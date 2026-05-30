// Customer segmentation + per-segment product pricing.
//
// Design (kept intentionally simple, no dynamic rules):
//  - Each restaurant has its own ordered list of customer_segments. The first
//    one (lowest position) is the BASE segment ("Сегмент 1"): its price always
//    equals the product's own `price` column — no overrides are stored for it.
//  - Non-base segments may store a per-product override in product_segment_prices.
//  - A customer's segment for a given restaurant lives in user_restaurants.segment_id.
//    NULL (or the base segment) => base price. Guests => base price.
//  - A product only participates in segmentation when use_segment_pricing = true.
//  - If a segment override is missing/empty for a product, the base price is used.
const pool = require('../database/connection');

let schemaReady = false;

async function ensureSegmentSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_segments (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 1,
      custom_name VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_segments_restaurant ON customer_segments(restaurant_id)`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_segment_prices (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      segment_id INTEGER NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
      price DECIMAL(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, segment_id)
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_product_segment_prices_product ON product_segment_prices(product_id)`).catch(() => {});
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS use_segment_pricing BOOLEAN DEFAULT false`).catch(() => {});
  await pool.query(`ALTER TABLE user_restaurants ADD COLUMN IF NOT EXISTS segment_id INTEGER REFERENCES customer_segments(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS segment_pricing_enabled BOOLEAN DEFAULT false`).catch(() => {});
  schemaReady = true;
}

// Global (per-restaurant) on/off switch for segmentation.
async function isSegmentPricingEnabled(restaurantId) {
  const rid = toPositiveInt(restaurantId);
  if (!rid) return false;
  await ensureSegmentSchema();
  const r = await pool.query(
    `SELECT segment_pricing_enabled FROM restaurants WHERE id = $1 LIMIT 1`,
    [rid]
  );
  return r.rows[0]?.segment_pricing_enabled === true;
}

function toPositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Ensures the base ("Сегмент 1") segment row exists and returns it.
async function getOrCreateBaseSegment(restaurantId) {
  await ensureSegmentSchema();
  const rid = toPositiveInt(restaurantId);
  if (!rid) return null;
  const existing = await pool.query(
    `SELECT * FROM customer_segments WHERE restaurant_id = $1 ORDER BY position ASC, id ASC LIMIT 1`,
    [rid]
  );
  if (existing.rows.length) return existing.rows[0];
  const created = await pool.query(
    `INSERT INTO customer_segments (restaurant_id, position) VALUES ($1, 1) RETURNING *`,
    [rid]
  );
  return created.rows[0];
}

async function listSegments(restaurantId) {
  const rid = toPositiveInt(restaurantId);
  if (!rid) return [];
  await getOrCreateBaseSegment(rid);
  const result = await pool.query(
    `SELECT id, restaurant_id, position, custom_name, created_at, updated_at
     FROM customer_segments
     WHERE restaurant_id = $1
     ORDER BY position ASC, id ASC`,
    [rid]
  );
  return result.rows;
}

async function createSegment(restaurantId, customName = null) {
  const rid = toPositiveInt(restaurantId);
  if (!rid) return null;
  await getOrCreateBaseSegment(rid);
  const posResult = await pool.query(
    `SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM customer_segments WHERE restaurant_id = $1`,
    [rid]
  );
  const nextPosition = Number(posResult.rows[0]?.next_position || 1);
  const name = typeof customName === 'string' && customName.trim() ? customName.trim().slice(0, 120) : null;
  const created = await pool.query(
    `INSERT INTO customer_segments (restaurant_id, position, custom_name) VALUES ($1, $2, $3) RETURNING *`,
    [rid, nextPosition, name]
  );
  return created.rows[0];
}

async function renameSegment(restaurantId, segmentId, customName) {
  const rid = toPositiveInt(restaurantId);
  const sid = toPositiveInt(segmentId);
  if (!rid || !sid) return null;
  const name = typeof customName === 'string' && customName.trim() ? customName.trim().slice(0, 120) : null;
  const updated = await pool.query(
    `UPDATE customer_segments SET custom_name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND restaurant_id = $3 RETURNING *`,
    [name, sid, rid]
  );
  return updated.rows[0] || null;
}

async function deleteSegment(restaurantId, segmentId) {
  const rid = toPositiveInt(restaurantId);
  const sid = toPositiveInt(segmentId);
  if (!rid || !sid) return { ok: false, reason: 'BAD_REQUEST' };
  const segments = await listSegments(rid);
  if (segments.length <= 1) return { ok: false, reason: 'LAST_SEGMENT' };
  const base = segments[0];
  if (Number(base.id) === sid) return { ok: false, reason: 'BASE_SEGMENT' };
  const target = segments.find((s) => Number(s.id) === sid);
  if (!target) return { ok: false, reason: 'NOT_FOUND' };
  // Customers assigned to this segment fall back to the base segment.
  await pool.query(
    `UPDATE user_restaurants SET segment_id = NULL WHERE restaurant_id = $1 AND segment_id = $2`,
    [rid, sid]
  ).catch(() => {});
  // product_segment_prices rows are removed by ON DELETE CASCADE.
  await pool.query(`DELETE FROM customer_segments WHERE id = $1 AND restaurant_id = $2`, [sid, rid]);
  return { ok: true };
}

// Resolves the segment id assigned to a customer for a restaurant (or null = base).
async function resolveCustomerSegmentId(restaurantId, userId) {
  const rid = toPositiveInt(restaurantId);
  const uid = toPositiveInt(userId);
  if (!rid || !uid) return null;
  await ensureSegmentSchema();
  const r = await pool.query(
    `SELECT segment_id FROM user_restaurants WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1`,
    [uid, rid]
  );
  return toPositiveInt(r.rows[0]?.segment_id);
}

// Mutates product rows in-place: replaces `price` with the customer's segment
// price. Gated by the restaurant's GLOBAL segment_pricing_enabled switch — when
// it is off, prices are never touched (and stored overrides are preserved).
// Base segment / guests / missing overrides keep the product's own price.
async function applySegmentPricingToRows(rows, { restaurantId, userId } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  // Global switch: when off, segmentation is fully disabled (base price everywhere).
  if (!(await isSegmentPricingEnabled(restaurantId))) return rows;
  const segmentId = await resolveCustomerSegmentId(restaurantId, userId);
  if (!segmentId) return rows; // base / guest -> base prices
  const segInfo = await pool.query(
    `SELECT cs.position,
            (SELECT MIN(position) FROM customer_segments WHERE restaurant_id = cs.restaurant_id) AS base_position
     FROM customer_segments cs WHERE cs.id = $1 LIMIT 1`,
    [segmentId]
  );
  if (!segInfo.rows.length) return rows;
  if (Number(segInfo.rows[0].position) === Number(segInfo.rows[0].base_position)) return rows; // base segment
  const productIds = rows.map((row) => toPositiveInt(row?.id)).filter(Boolean);
  if (!productIds.length) return rows;
  const overrides = await pool.query(
    `SELECT product_id, price FROM product_segment_prices
     WHERE segment_id = $1 AND product_id = ANY($2::int[])`,
    [segmentId, productIds]
  );
  const overrideMap = new Map(overrides.rows.map((o) => [Number(o.product_id), Number(o.price)]));
  for (const row of rows) {
    const override = overrideMap.get(Number(row.id));
    if (override === undefined || !(override > 0)) continue; // fallback to base price
    row.price = override;
    // Segment price is authoritative — drop the base discount to avoid conflicts.
    row.discount_enabled = false;
    row.discount_price = null;
  }
  return rows;
}

// Returns { "<segment_id>": price } for a product, used by the admin product form.
async function getProductSegmentPriceMap(productId) {
  await ensureSegmentSchema();
  const pid = toPositiveInt(productId);
  if (!pid) return {};
  const r = await pool.query(
    `SELECT segment_id, price FROM product_segment_prices WHERE product_id = $1`,
    [pid]
  );
  const map = {};
  for (const row of r.rows) map[String(row.segment_id)] = Number(row.price);
  return map;
}

// Persists per-segment overrides for a product. Called ONLY when the editor
// actually sent the segment block (i.e. global segmentation is on), so it never
// wipes data just because segmentation got disabled globally. Provided segments
// with a positive price are upserted; provided non-base segments left blank get
// their override removed. Segments not present in the payload are untouched.
async function saveProductSegmentPrices(productId, restaurantId, segmentPrices) {
  await ensureSegmentSchema();
  const pid = toPositiveInt(productId);
  const rid = toPositiveInt(restaurantId);
  if (!pid || !rid) return;
  if (!Array.isArray(segmentPrices)) return; // nothing provided -> preserve existing
  const segments = await listSegments(rid);
  const basePosition = segments.length ? Number(segments[0].position) : 1;
  const nonBaseSegmentIds = new Set(
    segments.filter((s) => Number(s.position) !== basePosition).map((s) => Number(s.id))
  );
  const keepIds = [];
  const blankIds = [];
  for (const entry of segmentPrices) {
    const segId = toPositiveInt(entry?.segment_id);
    if (!segId || !nonBaseSegmentIds.has(segId)) continue;
    const priceNum = Number(entry?.price);
    if (Number.isFinite(priceNum) && priceNum > 0) {
      await pool.query(
        `INSERT INTO product_segment_prices (product_id, segment_id, price)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, segment_id)
         DO UPDATE SET price = EXCLUDED.price, updated_at = CURRENT_TIMESTAMP`,
        [pid, segId, priceNum]
      );
      keepIds.push(segId);
    } else {
      blankIds.push(segId);
    }
  }
  // Only remove overrides explicitly blanked in the payload — never bulk-delete.
  if (blankIds.length) {
    await pool.query(
      `DELETE FROM product_segment_prices WHERE product_id = $1 AND segment_id = ANY($2::int[])`,
      [pid, blankIds]
    );
  }
}

module.exports = {
  ensureSegmentSchema,
  getOrCreateBaseSegment,
  listSegments,
  createSegment,
  renameSegment,
  deleteSegment,
  resolveCustomerSegmentId,
  applySegmentPricingToRows,
  getProductSegmentPriceMap,
  saveProductSegmentPrices
};
