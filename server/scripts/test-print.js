require('dotenv').config();
const pool = require('../database/connection');
const printerManager = require('../services/printerManager');

async function testPrint() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("❌ Укажите ID заказа: node server/scripts/test-print.js <ORDER_ID>");
    process.exit(1);
  }

  try {
    const result = await pool.query("SELECT restaurant_id FROM orders WHERE id = $1", [orderId]);
    if (result.rows.length === 0) {
      console.error(`❌ Заказ #${orderId} не найден`);
      process.exit(1);
    }

    const restaurantId = result.rows[0].restaurant_id;
    console.log(`📡 Отправка команды печати для заказа #${orderId} (Ресторан #${restaurantId})...`);
    
    // ВАЖНО: printerManager должен быть инициализирован
    // В данном скрипте он не инициализирован сервером, поэтому мы просто имитируем вызов
    // Но для реальной проверки нужно запустить сервер и вызвать этот метод
    
    // Если вы хотите проверить именно логику формирования данных:
    const status = await printerManager.printOrder(restaurantId, orderId);
    
    if (status) {
      console.log("✅ Команда успешно отправлена агенту!");
    } else {
      console.log("❌ Не удалось отправить. Проверьте: подключен ли агент? Добавлен ли принтер в админке?");
    }
  } catch (err) {
    console.error("❌ Ошибка:", err.message);
  } finally {
    process.exit(0);
  }
}

testPrint();
