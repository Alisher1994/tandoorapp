const { Server } = require('socket.io');
const pool = require('../database/connection');

class PrinterManager {
  constructor() {
    this.io = null;
    this.activeAgents = new Map(); // restaurant_id -> socket_id
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

      socket.on('disconnect', () => {
        console.log(`🖨️ Printer Agent disconnected: Restaurant #${socket.restaurant_id}`);
        if (this.activeAgents.get(socket.restaurant_id) === socket.id) {
          this.activeAgents.delete(socket.restaurant_id);
        }
      });
    });
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
      const shopResult = await pool.query("SELECT * FROM restaurants WHERE id = $1", [restaurantId]);
      const shop = shopResult.rows[0];

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
      const printersResult = await pool.query("SELECT * FROM printers WHERE restaurant_id = $1 AND is_active = TRUE", [restaurantId]);
      const printers = printersResult.rows;

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
          logoUrl: shop.receipt_logo_url || shop.logo_url,
          header: shop.receipt_header_text,
          footer: shop.receipt_footer_text
        },
        printers: printers.map(p => ({
          alias: p.printer_alias,
          ip: p.ip_address,
          type: p.connection_type,
          usb: p.usb_vid_pid,
          name: p.name
        }))
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
