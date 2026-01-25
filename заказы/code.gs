// --- НАСТРОЙКИ УВЕДОМЛЕНИЙ ---
const TELEGRAM_BOT_TOKEN = '8537856837:AAHrK1rjc79XHW7nEqmb_Vyp7QrnZm80bxk';
const TELEGRAM_CHAT_ID = '-1002912838386';
const PARALLEL_SPREADSHEET_ID = '14JCCbPH9QtuXxIJpa9D9LGhZ9KUU0GrwCQfrpHgWzR8';

function doGet(e) {
  const type = e.parameter.type || "request";

  if (type === "supply") {
    return HtmlService.createHtmlOutputFromFile('3.Snabjenie')
      .setTitle('Формирование заявки для снабженца')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (type === "request") {
    return HtmlService.createHtmlOutputFromFile('FormaZayavki')
      .setTitle('Форма заявки')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutput('Invalid type')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Получает текущую дату в Ташкенте и возвращает опции для выбора.
 * @returns {object} Объект с доступными датами и текущим временем.
 */
function getDateOptions() {
  const localTime = new Date();
  const utcTime = localTime.getTime() + (localTime.getTimezoneOffset() * 60000);
  const TASHKENT_OFFSET = 5 * 60 * 60000;
  const tashkentTime = new Date(utcTime + TASHKENT_OFFSET);
  
  const today = new Date(tashkentTime.getFullYear(), tashkentTime.getMonth(), tashkentTime.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const formatDateToString = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };
  
  const options = [];
  const currentHour = tashkentTime.getHours();
  
  // Если до 17:00, можно заказать на сегодня
  if (currentHour < 17) {
    options.push({
      value: formatDateToString(today),
      label: 'Бугун',
      isDefault: false
    });
  }
  
  // Всегда можно заказать на завтра
  options.push({
    value: formatDateToString(tomorrow),
    label: 'Эртага',
    isDefault: true
  });
  
  return {
    options: options,
    currentTime: tashkentTime.toISOString(),
    currentHour: currentHour
  };
}

/**
 * Получает все необходимые данные для инициализации приложения "Форма заявки".
 * @returns {object} Объект с данными о товарах, отделах и правами доступа.
 */
function getAppData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Получаем данные об отделах
  let dataSheet = ss.getSheetByName('Отделы');
  if (!dataSheet) {
    dataSheet = ss.insertSheet('Отделы');
    dataSheet.getRange('A1:C1').setValues([['№', 'Отдел', 'Пароль']]);
    dataSheet.getRange('B2:C2').setValues([['Склад', '123']]);
  }
  const departmentsRange = dataSheet.getRange('B2:B' + dataSheet.getLastRow());
  const departments = [...new Set(departmentsRange.getValues().map(row => row[0]).filter(Boolean))];

  // Получаем данные о категориях с изображениями (RU и UZ)
  let categoriesSheet = ss.getSheetByName('Категории');
  const categoryImages = {};
  const categoryNamesRU = {};
  const categoryNamesUZ = {};
  
  if (!categoriesSheet) {
    categoriesSheet = ss.insertSheet('Категории');
    categoriesSheet.getRange('A1:D1').setValues([['№', 'Название RU', 'Название UZ', 'Фото категории']]);
    categoriesSheet.getRange('B2:D2').setValues([['Пример Категории', 'Пример Тотира', 'https://via.placeholder.com/150']]);
  } else {
    const categoryData = categoriesSheet.getDataRange().getValues();
    if (categoryData.length > 1) {
      for (let i = 1; i < categoryData.length; i++) {
        const row = categoryData[i];
        const categoryNameRU = row[1];
        const categoryNameUZ = row[2];
        const categoryImage = row[3];
        if (categoryNameRU) {
          categoryImages[categoryNameRU] = categoryImage || 'https://via.placeholder.com/150';
          categoryNamesRU[categoryNameRU] = categoryNameRU;
          if (categoryNameUZ) {
            categoryNamesUZ[categoryNameRU] = categoryNameUZ;
          }
        }
      }
    }
  }

  // Получаем данные о товарах (обновленная структура)
  let productSheet = ss.getSheetByName('Товары');
  if (!productSheet) {
    productSheet = ss.insertSheet('Товары');
    productSheet.getRange('A1:H1').setValues([
      ['№', 'Фото товара', 'Категория', 'Наименование RU', 'Название UZ', 'Ед.изм', 'Штрих код товара', 'Цена']
    ]);
    return {
      departments, categories: [], products: [], categoryImages, categoryNamesRU, categoryNamesUZ,
      dateOptions: getDateOptions(),
      message: 'Лист "Товары" создан. Добавьте данные.'
    };
  }

  const productData = productSheet.getDataRange().getValues();
  if (productData.length <= 1) {
    return {
      departments, categories: [], products: [], categoryImages, categoryNamesRU, categoryNamesUZ,
      dateOptions: getDateOptions(),
      message: 'Нет данных в листе "Товары".'
    };
  }

  // ОБНОВЛЕННАЯ СТРУКТУРА: Колонки соответствуют новой структуре
  const products = productData.slice(1).map(row => ({
    image: row[1],    // B - Фото товара
    category: row[2], // C - Категория
    nameRU: row[3],   // D - Наименование RU
    nameUZ: row[4],   // E - Название UZ
    unit: row[5],     // F - Ед.изм
    barcode: row[6],  // G - Штрих код товара
    price: row[7]     // H - Цена
  })).filter(p => p.nameRU && p.category);

  const categories = [...new Set(products.map(p => p.category))].filter(c => c).sort();

  // Добавляем изображения по умолчанию для категорий, которых нет в листе "Категории"
  categories.forEach(category => {
    if (!categoryImages[category]) {
      categoryImages[category] = 'https://via.placeholder.com/150';
    }
    if (!categoryNamesRU[category]) {
      categoryNamesRU[category] = category;
    }
    if (!categoryNamesUZ[category]) {
      categoryNamesUZ[category] = category;
    }
  });

  return { 
    departments, 
    categories, 
    products, 
    categoryImages,
    categoryNamesRU,
    categoryNamesUZ,
    dateOptions: getDateOptions(),
    message: '' 
  };
}

/**
 * Получает список единиц измерения.
 * @returns {Array} Массив единиц измерения.
 */
function getUnits() {
  return ['кг', 'шт', 'л', 'м', 'упак', 'г', 'мл', 'см', 'пачка', 'коробка'];
}

/**
 * Получает список категорий для нового товара.
 * @returns {Array} Массив категорий.
 */
function getCategoriesForNewProduct() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let categoriesSheet = ss.getSheetByName('Категории');
  
  if (!categoriesSheet) {
    return ['Овощи', 'Фрукты', 'Мясо', 'Молочные продукты', 'Хлебобулочные изделия'];
  }
  
  const categoryData = categoriesSheet.getDataRange().getValues();
  if (categoryData.length <= 1) {
    return ['Овощи', 'Фрукты', 'Мясо', 'Молочные продукты', 'Хлебобулочные изделия'];
  }
  
  const categories = [];
  for (let i = 1; i < categoryData.length; i++) {
    const categoryName = categoryData[i][1];
    if (categoryName) {
      categories.push(categoryName);
    }
  }
  
  return categories.length > 0 ? categories : ['Овощи', 'Фрукты', 'Мясо', 'Молочные продукты', 'Хлебобулочные изделия'];
}

/**
 * Записывает заказ в параллельную таблицу
 * @param {object} order - Объект заказа
 * @param {number} orderNumber - Номер заказа
 */
function writeToParallelSpreadsheet(order, orderNumber) {
  try {
    const parallelSS = SpreadsheetApp.openById(PARALLEL_SPREADSHEET_ID);
    let parallelSheet = parallelSS.getSheetByName('Заказы');
    
    if (!parallelSheet) {
      parallelSheet = parallelSS.insertSheet('Заказы');
      parallelSheet.getRange('A1:P1').setValues([[
        'ID', 'Заказан в', 'Время заказа', 'Заказ на дату', 'На время', 'Клиент', 
        'Номер телефона', 'Адрес клиента', 'Долгота и широта', 'Название товара', 
        'Кол-во', 'Цена', 'Сумма', 'Комментарии', 'Способ оплаты', 'Статус заказа'
      ]]);
    }

    // Текущая дата и время заказа
    const now = new Date();
    const orderDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

    // Запись данных в параллельную таблицу
    order.items.forEach(item => {
      parallelSheet.appendRow([
        orderNumber,
        orderDateTime,
        order.time,
        order.date,
        order.time,
        order.customerName,
        order.phone,
        order.location,
        order.coordinates || '',
        item.name,
        item.quantity,
        item.price,
        item.price * item.quantity,
        order.comment || '',
        order.paymentMethod === 'cash' ? 'Наличные' : 'Карта',
        'Новый' // Статус заказа
      ]);
    });
    
    Logger.log('Запись в параллельную таблицу успешно завершена');
    return true;
    
  } catch (error) {
    Logger.log('Ошибка при записи в параллельную таблицу: ' + error.toString());
    return false;
  }
}

/**
 * Принимает и сохраняет заказ от клиента.
 * @param {object} order - Объект заказа.
 * @returns {object} Результат операции с сообщением.
 */
function submitOrder(order) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Создаем лист для заказов (ранее 'Заказы магазина')
    let sheet = ss.getSheetByName('Заказы');
    if (!sheet) {
      sheet = ss.insertSheet('Заказы');
      sheet.getRange('A1:P1').setValues([[
        'ID', 'Заказан в', 'Время заказа', 'Заказ на дату', 'На время', 'Клиент', 
        'Номер телефона', 'Адрес клиента', 'Долгота и широта', 'Название товара', 
        'Кол-во', 'Цена', 'Сумма', 'Комментарии', 'Способ оплаты', 'Статус заказа'
      ]]);
    }

    // Генерируем случайный 5-значный ID
    const orderNumber = Math.floor(10000 + Math.random() * 90000);

    // Текущая дата и время заказа
    const now = new Date();
    const orderDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

    // Запись данных в основную таблицу
    order.items.forEach(item => {
      sheet.appendRow([
        orderNumber,
        orderDateTime,
        order.time,
        order.date,
        order.time,
        order.customerName,
        order.phone,
        order.location,
        order.coordinates || '',
        item.name,
        item.quantity,
        item.price,
        item.price * item.quantity,
        order.comment || '',
        order.paymentMethod === 'cash' ? 'Наличные' : 'Карта',
        'Новый' // Статус заказа
      ]);
    });

    // Запись в параллельную таблицу
    const parallelWriteSuccess = writeToParallelSpreadsheet(order, orderNumber);

    // Формируем текст для бота с кликабельной ссылкой на карту
    const itemsList = order.items.map((item, index) => 
      `${index + 1}. ${item.name} - ${item.quantity} ${item.unit} / ${formatPrice(item.price)} x ${item.quantity} = ${formatPrice(item.price * item.quantity)} сум`
    ).join('\n');

    const paymentInfo = order.paymentMethod === 'card' ? 
      `\n💳 Оплата картой` : 
      '\n💵 Оплата наличными при получении';

    // Создаем кликабельную ссылку на карту
    let locationLink = order.location;
    if (order.coordinates) {
      const [lat, lng] = order.coordinates.split(',').map(coord => coord.trim());
      const yandexMapsUrl = `https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map`;
      const yandexGoUrl = `yandextaxi://map?lat=${lat}&lon=${lng}`;
      locationLink = `<a href="${yandexMapsUrl}">${order.location}</a>\n🗺️ <a href="${yandexGoUrl}">Открыть в Яндекс Go</a>`;
    }

    const message = 
`🛒 <b>Новый заказ №${orderNumber}</b>

📅 <b>Дата доставки:</b> ${order.formattedDate} ${order.formattedTime}
📍 <b>Адрес:</b> ${locationLink}
👤 <b>Клиент:</b> ${order.customerName}
📞 <b>Телефон:</b> <a href="tel:${order.phone}">${order.phone}</a>
${paymentInfo}

🛍️ <b>Состав заказа:</b>
${itemsList}

💰 <b>ИТОГО: ${formatPrice(order.total)} сум</b>
*Стоимость доставки не включена и будет выставлена отдельно*${order.comment ? `\n\n💬 <b>Комментарий:</b> ${order.comment}` : ''}`;

    // Отправляем в телеграм (только основная функция)
    sendMessageInChunks(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
    
    return { 
      success: true, 
      message: 'Заказ успешно отправлен!' + (parallelWriteSuccess ? ' (Записано в обе таблицы)' : ' (Ошибка записи в параллельную таблицу)'),
      orderNumber: orderNumber
    };
  } catch (error) {
    Logger.log('Ошибка в submitOrder: ' + error.toString());
    return { success: false, message: 'Ошибка при сохранении заказа: ' + error.toString() };
  }
}

// Вспомогательная функция для форматирования цены
function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU').format(price);
}

/**
 * Возвращает список всех ресторанов.
 * @returns {Array<string>} Массив с названиями ресторанов.
 */
function getRestaurants() {
  return ['Магазин'];
}

/**
 * Функция для отправки сообщений в Telegram частями
 */
function sendMessageInChunks(botToken, chatId, text) {
  const MAX_LENGTH = 4096;
  if (!text) {
    Logger.log(`Попытка отправить пустое сообщение в чат ${chatId}`);
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  if (text.length <= MAX_LENGTH) {
    try {
      UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ 
          chat_id: String(chatId), 
          text: text, 
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      });
    } catch (e) {
      Logger.log(`Ошибка отправки в Telegram: ${e.toString()}`);
    }
    return;
  }
  let chunks = [];
  let currentChunk = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > MAX_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }
  chunks.push(currentChunk);
  chunks.forEach((chunk, index) => {
    try {
      UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ 
          chat_id: String(chatId), 
          text: chunk, 
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      });
      if (chunks.length > 1) {
        Utilities.sleep(1000);
      }
    } catch (e) {
      Logger.log(`Ошибка отправки части ${index + 1} в Telegram: ${e.toString()}`);
    }
  });
}