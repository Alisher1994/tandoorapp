const TelegramBot = require('node-telegram-bot-api');
const { getBot } = require('./bot');

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function sendOrderNotification(order, items) {
  if (!ADMIN_CHAT_ID) {
    console.warn('⚠️  TELEGRAM_ADMIN_CHAT_ID not set, notifications disabled');
    return;
  }
  
  const bot = getBot();
  if (!bot) return;
  
  try {
    const itemsList = items.map((item, index) => 
      `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit || 'шт'} × ${item.price} = ${(item.quantity * item.price).toFixed(2)} сум`
    ).join('\n');
    
    const paymentEmoji = order.payment_method === 'card' ? '💳' : '💵';
    const paymentText = order.payment_method === 'card' ? 'Карта' : 'Наличные';
    
    let locationLink = order.delivery_address;
    if (order.delivery_coordinates) {
      const [lat, lng] = order.delivery_coordinates.split(',').map(c => c.trim());
      const yandexMapsUrl = `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;
      locationLink = `<a href="${yandexMapsUrl}">${order.delivery_address}</a>`;
    }
    
    const message = 
      `🛒 <b>Новый заказ #${order.order_number}</b>\n\n` +
      `👤 <b>Клиент:</b> ${order.customer_name}\n` +
      `📞 <b>Телефон:</b> <a href="tel:${order.customer_phone}">${order.customer_phone}</a>\n` +
      `📍 <b>Адрес:</b> ${locationLink}\n` +
      `${paymentEmoji} <b>Оплата:</b> ${paymentText}\n` +
      `💰 <b>Сумма:</b> ${order.total_amount} сум\n\n` +
      `🛍️ <b>Состав заказа:</b>\n${itemsList}\n\n` +
      (order.comment ? `💬 <b>Комментарий:</b> ${order.comment}\n\n` : '') +
      `📅 <b>Дата доставки:</b> ${order.delivery_date || 'Не указана'} ${order.delivery_time || ''}`;
    
    await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Send order notification error:', error);
  }
}

async function sendOrderUpdateToUser(telegramId, order, status) {
  if (!telegramId) return;
  
  const bot = getBot();
  if (!bot) return;
  
  try {
    const statusMessages = {
      'new': '🆕 Ваш заказ принят и обрабатывается',
      'preparing': '👨‍🍳 Ваш заказ готовится',
      'delivering': '🚚 Ваш заказ доставляется',
      'delivered': '✅ Ваш заказ доставлен',
      'cancelled': '❌ Ваш заказ отменен'
    };
    
    const message = 
      `${statusMessages[status] || '📦 Обновление заказа'}\n\n` +
      `Заказ #${order.order_number}\n` +
      `Сумма: ${order.total_amount} сум\n` +
      `Статус: ${getStatusText(status)}`;
    
    await bot.sendMessage(telegramId, message);
  } catch (error) {
    console.error('Send order update error:', error);
  }
}

function getStatusText(status) {
  const statusMap = {
    'new': 'Новый',
    'preparing': 'Готовится',
    'delivering': 'Доставляется',
    'delivered': 'Доставлен',
    'cancelled': 'Отменен'
  };
  return statusMap[status] || status;
}

module.exports = { sendOrderNotification, sendOrderUpdateToUser };

