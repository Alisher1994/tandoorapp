const { Server } = require('socket.io');
const pool = require('../database/connection');

/** USB VID:PID pattern — не использовать как UNC \\localhost\… */
function looksLikeUsbVidPid(s) {
  const t = String(s).trim();
  return /^[0-9a-fA-F]{4}[:-][0-9a-fA-F]{4}$/.test(t);
}

/**
 * Поле printers.usb_vid_pid в БД по смыслу «доп. идентификатор», но агент для Windows USB
 * подставляет его в copy \\localhost\ИМЯ. Если пусто — старый агент берёт только дефолт XP-80.
 * Поэтому пробрасываем сюда явное имя шары или извлекаем из display name (без « (cashier)»).
 */
function agentWindowsShareName(row) {
  const raw = (row.usb_vid_pid && String(row.usb_vid_pid).trim()) || '';
  if (raw && !looksLikeUsbVidPid(raw)) return raw;
  const fromName = String(row.name || '')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  if (fromName) return fromName;
  return null;
}

/** Из поля настроек: чистый путь или целиком <img src="…"> — в абсолютный URL для axios на агенте */
function resolveShopLogoAbsoluteUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (/<img\b/i.test(s)) {
    const m = s.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    s = m ? m[1].trim() : '';
    if (!s) return null;
  }
  s = s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  const base = String(process.env.BACKEND_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  const pathPart = s.startsWith('/') ? s : `/${s}`;
  return `${base}${pathPart}`;
}

function parseBooleanFromEnv(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

class PrinterManager {
  constructor() {
    this.io = null;
    this.activeAgents = new Map(); // restaurant_id -> socket_id
    this.lastAutoTestAtByRestaurant = new Map();
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Authentication error: Missing token"));

      try {
        const result = await pool.query(
          "SELECT id, restaurant_id FROM printer_agents WHERE agent_token = $1 AND is_active = TRUE",
          [token]
        );

        if (result.rows.length === 0) {
          return next(new Error("Authentication error: Invalid token"));
        }

        socket.restaurant_id = result.rows[0].restaurant_id;
        socket.agent_id = result.rows[0].id;
        next();
      } catch (error) {
        console.error("Printer Auth Error:", error);
        next(new Error("Server error during authentication"));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`🖨️ Printer Agent connected: Restaurant #${socket.restaurant_id}`);
      this.activeAgents.set(socket.restaurant_id, socket.id);

      pool.query('UPDATE printer_agents SET last_connected_at = CURRENT_TIMESTAMP WHERE id = $1', [socket.agent_id])
        .catch(err => console.error('Failed to update agent last_connected_at', err));

      const autoTestEnabled = parseBooleanFromEnv(process.env.PRINTER_AUTO_TEST_ON_CONNECT, true);
      const autoTestMinIntervalMs = normalizePositiveInt(
        process.env.PRINTER_AUTO_TEST_MIN_INTERVAL_MS,
        5 * 60 * 1000
      );

      if (autoTestEnabled) {
        const now = Date.now();
        const lastAutoTestAt = this.lastAutoTestAtByRestaurant.get(socket.restaurant_id) || 0;
        if (now - lastAutoTestAt >= autoTestMinIntervalMs) {
          this.lastAutoTestAtByRestaurant.set(socket.restaurant_id, now);
          setTimeout(() => {
            this.printTestReceipt(socket.restaurant_id, { trigger: 'auto-connect' })
              .then((result) => {
                if (!result.ok) {
                  console.warn(`⚠️ Auto test print skipped/failed for Restaurant #${socket.restaurant_id}: ${result.code || 'unknown'}`);
                }
              })
              .catch((error) => {
                console.error(`❌ Auto test print error for Restaurant #${socket.restaurant_id}:`, error.message);
              });
          }, 1200);
        } else {
          console.log(`⏭️ Skip auto test print for Restaurant #${socket.restaurant_id} (throttled)`);
        }
      }

      socket.on('disconnect', () => {
        console.log(`🖨️ Printer Agent disconnected: Restaurant #${socket.restaurant_id}`);
        if (this.activeAgents.get(socket.restaurant_id) === socket.id) {
          this.activeAgents.delete(socket.restaurant_id);
        }
      });
    });
  }

  mapPrintersForAgent(rows) {
    return rows.map((p, _index, all) => ({
      alias: all.length === 1 ? 'cashier' : p.printer_alias,
      ip: p.ip_address,
      type: p.connection_type,
      usb: agentWindowsShareName(p),
      name: p.name
    }));
  }

  async getRestaurantShopInfo(restaurantId) {
    const shopResult = await pool.query("SELECT * FROM restaurants WHERE id = $1", [restaurantId]);
    return shopResult.rows[0] || null;
  }

  async getActivePrinters(restaurantId, printerId = null) {
    const params = [restaurantId];
    let sql = "SELECT * FROM printers WHERE restaurant_id = $1 AND is_active = TRUE";
    if (Number.isInteger(printerId) && printerId > 0) {
      params.push(printerId);
      sql += " AND id = $2";
    }
    sql += " ORDER BY name";
    const printersResult = await pool.query(sql, params);
    return printersResult.rows;
  }

  /**
   * Trigger test printing (manual button or auto on agent connect)
   */
  async printTestReceipt(restaurantId, { printerId = null, trigger = 'manual' } = {}) {
    const socketId = this.activeAgents.get(restaurantId);
    if (!socketId) {
      console.warn(`⚠️ No active Printer Agent for Restaurant #${restaurantId} (test print)`);
      return { ok: false, code: 'AGENT_OFFLINE' };
    }

    try {
      const shop = await this.getRestaurantShopInfo(restaurantId);
      if (!shop) return { ok: false, code: 'SHOP_NOT_FOUND' };

      const printers = await this.getActivePrinters(restaurantId, printerId);
      if (!printers || printers.length === 0) return { ok: false, code: 'PRINTER_NOT_FOUND' };

      const payload = {
        printAt: new Date().toISOString(),
        trigger,
        shopInfo: {
          name: shop.name,
          address: shop.address,
          phone: shop.phone,
          logoUrl: resolveShopLogoAbsoluteUrl(shop.receipt_logo_url || shop.logo_url),
          footer: shop.receipt_footer_text
        },
        printers: this.mapPrintersForAgent(printers)
      };

      this.io.to(socketId).emit('print_test', payload);
      return { ok: true, code: 'SENT', printersCount: printers.length };
    } catch (error) {
      console.error("Test Print Service Error:", error);
      return { ok: false, code: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Main method to trigger printing
   */
  async printOrder(restaurantId, orderId) {
    const socketId = this.activeAgents.get(restaurantId);
    if (!socketId) {
      console.warn(`⚠️ No active Printer Agent for Restaurant #${restaurantId}`);
      return false;
    }

    try {
      // 1. Fetch Order Data
      const orderResult = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
      if (orderResult.rows.length === 0) return false;
      const order = orderResult.rows[0];

      // 2. Fetch Shop Info & Logo
      const shop = await this.getRestaurantShopInfo(restaurantId);
      if (!shop) return false;

      // 3. Fetch Order Items + Category Printer Info
      const itemsResult = await pool.query(`
        SELECT oi.*, c.printer_id, p.printer_id as p_printer_id, pr.printer_alias
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN printers pr ON pr.id = COALESCE(p.printer_id, c.printer_id)
        WHERE oi.order_id = $1
      `, [orderId]);

      const items = itemsResult.rows;

      // 4. Calculate Fasovka (Packaging) total
      let containersTotal = 0;
      items.forEach(item => {
        const qty = parseFloat(item.quantity || 0);
        const norm = parseFloat(item.container_norm || 1) || 1;
        const price = parseFloat(item.container_price || 0);
        if (price > 0) {
          const units = Math.ceil(qty / norm);
          containersTotal += units * price;
        }
      });

      // 5. Fetch All Active Printers for this shop
      const printers = await this.getActivePrinters(restaurantId);
      if (!printers || printers.length === 0) {
        console.warn(`⚠️ No active printers configured for Restaurant #${restaurantId}`);
        return false;
      }

      // 6. Package the data for the Agent
      const payload = {
        orderId: order.id,
        orderNumber: order.order_number,
        createdAt: order.created_at,
        printAt: new Date().toISOString(),
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryAddress: order.delivery_address,
        comment: order.comment,
        paymentMethod: order.payment_method,
        isOnline: true,
        financials: {
          itemsSubtotal: items.reduce((sum, i) => sum + parseFloat(i.total || 0), 0),
          serviceFee: parseFloat(order.service_fee || 0),
          deliveryCost: parseFloat(order.delivery_cost || 0),
          fasovkaTotal: containersTotal,
          totalAmount: parseFloat(order.total_amount || 0)
        },
        items: items.map(i => ({
          name: i.product_name,
          quantity: parseFloat(i.quantity),
          unit: i.unit || 'шт',
          price: parseFloat(i.price),
          total: parseFloat(i.total),
          printer_alias: i.printer_alias || 'cashier'
        })),
        shopInfo: {
          name: shop.name,
          address: shop.address,
          phone: shop.phone,
          logoUrl: resolveShopLogoAbsoluteUrl(shop.receipt_logo_url || shop.logo_url),
          header: shop.receipt_header_text,
          footer: shop.receipt_footer_text
        },
        printers: this.mapPrintersForAgent(printers)
      };

      // 7. Send to Agent
      this.io.to(socketId).emit('print_order', payload);
      return true;
    } catch (error) {
      console.error("Print Service Error:", error);
      return false;
    }
  }
}

module.exports = new PrinterManager();
