const SHEET_NAME = "Заказы";
const PRODUCTS_SHEET_NAME = "Товары"; 
const STATUSES = ["Новый", "Готовка", "В пути", "Доставлено", "Отказано"];
const PAYMENT_STATUSES = ["Да", "Нет"]; 

// Индексы колонок листа "Заказы" (0-based)
const COL = {
  ID: 0,
  ORDERED_AT_DATE: 1,
  ORDERED_AT_TIME: 2,
  DELIVERY_DATE: 3,
  DELIVERY_TIME: 4,
  CLIENT_NAME: 5,
  PHONE: 6,
  ADDRESS: 7,
  LAT_LNG: 8,
  PRODUCT_NAME: 9,
  QUANTITY: 10,
  PRICE: 11,
  ITEM_TOTAL: 12, 
  COMMENTS: 13,
  PAYMENT_METHOD: 14,
  STATUS: 15, 
  PAYMENT_STATUS: 16 // Статус оплаты ("Да" или "Нет")
};

// Индексы колонок листа "Товары" (0-based)
const PRODUCTS_COL = {
  NAME_RU: 3,
  UNIT: 5,
  PRICE: 7
};

// --- Основная функция для запуска веб-приложения ---
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Управление Заказами')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

// --- Утилита для включения HTML-файлов ---
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}

/**
 * Получает список товаров с листа "Товары" для дропдауна.
 */
function getProductList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  
  if (!sheet) {
    Logger.log(`Лист "${PRODUCTS_SHEET_NAME}" не найден.`);
    return [];
  }
  
  try {
    const values = sheet.getDataRange().getValues().slice(1);
    
    return values.filter(row => row[PRODUCTS_COL.NAME_RU]).map(row => ({
      name: String(row[PRODUCTS_COL.NAME_RU] || '').trim(),
      unit: String(row[PRODUCTS_COL.UNIT] || '').trim(),
      price: parseFloat(row[PRODUCTS_COL.PRICE]) || 0
    }));
  } catch(e) {
    Logger.log(`Ошибка чтения листа "Товары": ${e}`);
    return [];
  }
}

/**
 * Получает все заказы, группирует их по ID.
 */
function getOrderData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { orders: [], statusCounts: {} }; 
  }

  const values = sheet.getDataRange().getValues().slice(1);
  
  const groupedOrders = {};
  const statusCounts = { "Все": 0 };
  STATUSES.forEach(s => statusCounts[s] = 0);

  if (values.length === 0) {
      return { orders: [], statusCounts: statusCounts };
  }

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const id = row[COL.ID];
    const status = row[COL.STATUS];

    if (!id) continue;

    const quantity = parseFloat(row[COL.QUANTITY]) || 0;
    const price = parseFloat(row[COL.PRICE]) || 0;
    const itemTotal = quantity * price;

    if (!groupedOrders[id]) {
      groupedOrders[id] = {
        id: id,
        client_name: row[COL.CLIENT_NAME],
        phone: row[COL.PHONE] || 'Нет данных', 
        delivery_date: formatDateValue(row[COL.DELIVERY_DATE], "dd.MM.yyyy"), 
        delivery_time: formatTimeValue(row[COL.DELIVERY_TIME]), 
        payment_method: row[COL.PAYMENT_METHOD] || 'Не указан', 
        address: row[COL.ADDRESS],
        status: status,
        // Проверка: если пусто или не "Да", то "Нет"
        payment_status: row[COL.PAYMENT_STATUS] === PAYMENT_STATUSES[0] ? PAYMENT_STATUSES[0] : PAYMENT_STATUSES[1], 
        total_sum: 0,
        items: [],
      };

      statusCounts["Все"]++;
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      }
    }
    
    groupedOrders[id].items.push({
      product_name: row[COL.PRODUCT_NAME],
      quantity: quantity,
      price: price,
      item_total: itemTotal
    });
    
    groupedOrders[id].total_sum += itemTotal;
  }

  return { orders: Object.values(groupedOrders), statusCounts: statusCounts };
}

/**
 * Получает все строки (товары) для одного заказа по ID.
 */
function getSingleOrder(orderId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Лист "${SHEET_NAME}" не найден.`);

  const data = sheet.getDataRange().getValues().slice(1);
  const orderRows = data.filter(row => String(row[COL.ID]) === String(orderId));
  
  if (orderRows.length === 0) throw new Error(`Заказ с ID ${orderId} не найден.`);

  const firstRow = orderRows[0];
  const order = {
    id: firstRow[COL.ID],
    ordered_at_date: formatDateValue(firstRow[COL.ORDERED_AT_DATE], "yyyy-MM-dd"),
    ordered_at_time: formatTimeValue(firstRow[COL.ORDERED_AT_TIME]),
    delivery_date: formatDateValue(firstRow[COL.DELIVERY_DATE], "yyyy-MM-dd"),
    delivery_time: formatTimeValue(firstRow[COL.DELIVERY_TIME]),
    client_name: firstRow[COL.CLIENT_NAME],
    phone: firstRow[COL.PHONE],
    address: firstRow[COL.ADDRESS],
    lat_lng: firstRow[COL.LAT_LNG],
    comments: firstRow[COL.COMMENTS],
    payment_method: firstRow[COL.PAYMENT_METHOD],
    status: firstRow[COL.STATUS],
    // Проверка: если пусто или не "Да", то "Нет"
    payment_status: firstRow[COL.PAYMENT_STATUS] === PAYMENT_STATUSES[0] ? PAYMENT_STATUSES[0] : PAYMENT_STATUSES[1], 
    items: [],
    total_sum: 0
  };
  
  orderRows.forEach(row => {
    const quantity = parseFloat(row[COL.QUANTITY]) || 0;
    const price = parseFloat(row[COL.PRICE]) || 0;
    const itemTotal = quantity * price;
    order.total_sum += itemTotal;
    
    order.items.push({
      product_name: row[COL.PRODUCT_NAME],
      quantity: quantity,
      price: price
    });
  });

  return order;
}

/**
 * Обновляет заказ: удаляет старые строки заказа и вставляет новые.
 */
function updateOrder(orderData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return { success: false, message: `Лист "${SHEET_NAME}" не найден.` };
  
  const orderId = String(orderData.id);
  const values = sheet.getDataRange().getValues();
  const headerRows = 1; 

  // 1. Находим и удаляем старые строки заказа
  const rowsToDelete = [];
  for (let i = values.length - 1; i >= headerRows; i--) {
    if (String(values[i][COL.ID]) === orderId) {
      rowsToDelete.push(i + 1); // 1-based index
    }
  }

  rowsToDelete.forEach(rowIndex => sheet.deleteRow(rowIndex));
  
  // 2. Готовим и вставляем новые строки
  const newRows = [];
  
  const orderedAtDateValue = orderData.ordered_at_date ? new Date(orderData.ordered_at_date) : null;
  const deliveryDateValue = orderData.delivery_date ? new Date(orderData.delivery_date) : null;
  
  orderData.items.forEach(item => {
    if (orderData.status === "Отказано" && !item.product_name) return;

    const quantity = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const itemTotal = quantity * price;

    const newRow = [];
    newRow[COL.ID] = orderId;
    newRow[COL.ORDERED_AT_DATE] = orderedAtDateValue;
    newRow[COL.ORDERED_AT_TIME] = orderData.ordered_at_time || '';
    newRow[COL.DELIVERY_DATE] = deliveryDateValue;
    newRow[COL.DELIVERY_TIME] = orderData.delivery_time || '';
    newRow[COL.CLIENT_NAME] = orderData.client_name;
    newRow[COL.PHONE] = orderData.phone;
    newRow[COL.ADDRESS] = orderData.address;
    newRow[COL.LAT_LNG] = orderData.lat_lng || '';
    newRow[COL.PRODUCT_NAME] = item.product_name;
    newRow[COL.QUANTITY] = quantity;
    newRow[COL.PRICE] = price;
    newRow[COL.ITEM_TOTAL] = itemTotal;
    newRow[COL.COMMENTS] = orderData.comments || '';
    newRow[COL.PAYMENT_METHOD] = orderData.payment_method; 
    newRow[COL.STATUS] = orderData.status;
    newRow[COL.PAYMENT_STATUS] = orderData.payment_status; // Сохраняем статус оплаты
    
    for (let i = 0; i <= COL.PAYMENT_STATUS; i++) {
      if (newRow[i] === undefined) {
        newRow[i] = '';
      }
    }

    newRows.push(newRow);
  });
  
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  } else if (orderData.status !== "Отказано") {
    return { success: false, message: `Ошибка: Невозможно сохранить заказ без товаров, если статус не "Отказано".` };
  }
  
  return { success: true, message: `Заказ ${orderId} успешно обновлен на статус: ${orderData.status}` };
}

// --------------------------------------------------------------------------------
// --- ФУНКЦИИ СТАТИСТИКИ ---
// --------------------------------------------------------------------------------

/**
 * Собирает все данные для вкладки "Статистика".
 */
function getStatisticsData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return {};

  const values = sheet.getDataRange().getValues().slice(1);
  const data = values.map(row => ({
    id: row[COL.ID],
    status: row[COL.STATUS],
    paymentStatus: row[COL.PAYMENT_STATUS] === PAYMENT_STATUSES[0] ? PAYMENT_STATUSES[0] : PAYMENT_STATUSES[1],
    deliveryDate: row[COL.DELIVERY_DATE],
    productName: row[COL.PRODUCT_NAME],
    quantity: parseFloat(row[COL.QUANTITY]) || 0,
    itemTotal: parseFloat(row[COL.ITEM_TOTAL]) || 0
  }));

  return {
    paymentStatusByDelivered: getPaymentStatusByDelivered(data),
    totalSumByMonth: getTotalSumByMonth(data),
    top10Products: getTop10Products(data),
    orderCountByStatus: getOrderCountByStatus(data)
  };
}

// 1. Статус оплаты по доставленным заказам (только "Доставлено")
function getPaymentStatusByDelivered(data) {
  const counts = { "Да": 0, "Нет": 0 };
  const totals = { "Да": 0, "Нет": 0 };
  
  data.filter(row => row.status === 'Доставлено')
    .forEach(row => {
      const status = row.paymentStatus; 
      counts[status]++;
      totals[status] += row.itemTotal;
    });

  return { counts: counts, totals: totals };
}

// 2. Итого сумма всех заказов по 12 месяцам (только доставленные)
function getTotalSumByMonth(data) {
  const now = new Date();
  const twelveMonthsData = {};
  
  // Создаем ключи для последних 12 месяцев
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM");
    const label = Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM yyyy");
    twelveMonthsData[key] = { label: label, total: 0 };
  }
  
  data.filter(row => row.status === 'Доставлено' && row.deliveryDate instanceof Date)
    .forEach(row => {
      const date = row.deliveryDate;
      const key = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
      
      if (twelveMonthsData[key]) {
        twelveMonthsData[key].total += row.itemTotal;
      }
    });
    
  // Преобразуем в массив, сортируем по дате и возвращаем только значения
  return Object.keys(twelveMonthsData)
    .sort()
    .map(key => ({ 
      label: twelveMonthsData[key].label, 
      total: twelveMonthsData[key].total 
    }));
}

// 3. Список топ 10 товаров (статус не важен)
function getTop10Products(data) {
  const productQuantities = {};
  
  data.forEach(row => {
    if (row.productName) {
      const name = row.productName;
      productQuantities[name] = (productQuantities[name] || 0) + row.quantity;
    }
  });
  
  return Object.entries(productQuantities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }));
}

// 4. Кол-во круговой чарт сколько по статусам заказов (уникальные заказы)
function getOrderCountByStatus(data) {
  const uniqueOrders = new Map();
  const counts = {};

  // Собираем уникальные ID заказов и их статус
  data.forEach(row => {
      const id = row.id;
      if (!uniqueOrders.has(id)) {
          uniqueOrders.set(id, row.status);
      }
  });

  // Считаем статусы
  uniqueOrders.forEach(status => {
      counts[status] = (counts[status] || 0) + 1;
  });

  return counts;
}


// --- Вспомогательные функции форматирования ---

function formatDateValue(value, format) {
  if (value instanceof Date) {
    if (value.getFullYear() === 1899 && value.getMonth() === 11 && value.getDate() === 30) {
      return ''; 
    }
    return Utilities.formatDate(value, Session.getScriptTimeZone(), format);
  }
  return '';
}

function formatTimeValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  if (typeof value === 'string') {
    return value.length > 5 ? value.substring(0, 5) : value; 
  }
  return '';
}