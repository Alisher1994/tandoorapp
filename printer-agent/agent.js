require('dotenv').config();
const { io } = require("socket.io-client");
const escpos = require('escpos');
escpos.Network = require('escpos-network');
const { exec } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "YOUR_AGENT_TOKEN_HERE";

console.log("🚀 Starting Printer Agent...");
console.log(`🔗 Connecting to ${SERVER_URL}...`);

const socket = io(SERVER_URL, {
  auth: {
    token: AGENT_TOKEN
  },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

socket.on("connect", () => {
  console.log("✅ Linked to Server!");
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection Error:", err.message);
});

socket.on("disconnect", (reason) => {
  console.warn("⚠️ Disconnected:", reason);
});

/**
 * Main Print Routing logic
 */
socket.on("print_order", async (payload) => {
  console.log(`📦 Received Print Job for Order #${payload.orderNumber}`);

  const { printers, items, shopInfo, financials, orderNumber, createdAt, printAt, customerName, customerPhone, deliveryAddress, comment } = payload;

  if (!printers || printers.length === 0) {
    console.warn("⚠️ No printers configured for this restaurant.");
    return;
  }

  // Group items by printer_alias
  const itemsByPrinter = items.reduce((acc, item) => {
    const alias = item.printer_alias || 'cashier';
    if (!acc[alias]) acc[alias] = [];
    acc[alias].push(item);
    return acc;
  }, {});

  // Print to each printer
  for (const printerConfig of printers) {
    const printerItems = itemsByPrinter[printerConfig.alias] || [];
    const isCashier = printerConfig.alias === 'cashier' || printerConfig.alias === 'admin';

    // If no items for this printer and it's not a master (cashier always prints full receipt), skip
    if (printerItems.length === 0 && !isCashier) continue;

    console.log(`🖨️ Printing to: ${printerConfig.name} (${printerConfig.alias}) over ${printerConfig.type}`);
    
    try {
      await printToPrinter(printerConfig, {
        ...payload,
        items: isCashier ? items : printerItems, // Cashier gets full list, kitchen only its part
        isFullReceipt: isCashier
      });
    } catch (err) {
      console.error(`❌ Failed to print to ${printerConfig.alias}:`, err.message);
    }
  }
});

/**
 * Low-level ESC/POS Printing
 */
async function printToPrinter(config, data) {
  let device;

  if (config.type === 'network') {
    device = new escpos.Network(config.ip, 9100);
    const printer = new escpos.Printer(device);
    
    return new Promise((resolve, reject) => {
      device.open(async (error) => {
        if (error) return reject(error);
        try {
          await executePrintSequence(printer, device, data, config);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  } else if (config.type === 'usb' || config.type === 'win-raw' || config.type === 'windows') {
    // FOR WINDOWS USB: We use "copy /b" to a shared printer.
    const printerName = config.usb || "XP-80"; 
    const tempFile = path.join(__dirname, `print_${Date.now()}.bin`);
    
    const fileDevice = new (require('escpos').Console)((chunk) => {
      fs.appendFileSync(tempFile, chunk);
    });
    const printer = new escpos.Printer(fileDevice);

    // Clear/Create file
    fs.writeFileSync(tempFile, Buffer.alloc(0));
    
    await executePrintSequence(printer, fileDevice, data, config);
    
    // Wait for last bytes and copy
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const cmd = `copy /b "${tempFile}" "\\\\localhost\\${printerName}"`;
        console.log(`Executing: ${cmd}`);
        exec(cmd, (err) => {
          if (err) {
            console.error("Print Command Error:", err.message);
            try { fs.unlinkSync(tempFile); } catch(e) {}
            return reject(new Error(`Ensure printer is shared as "${printerName}"`));
          }
          try { fs.unlinkSync(tempFile); } catch(e) {}
          resolve();
        });
      }, 300);
    });
  } else {
    throw new Error(`Unsupported connection type: ${config.type}`);
  }
}

/**
 * Shared print commands sequence
 */
async function executePrintSequence(printer, device, data, config) {
  printer.font('a').align('ct').style('bu').size(1, 1);

  // 1. Logo (if Full Receipt)
  if (data.isFullReceipt && data.shopInfo?.logoUrl) {
    try {
      const logoFilename = path.join(__dirname, 'temp_logo.png');
      const response = await axios({
        url: data.shopInfo.logoUrl,
        responseType: 'stream',
      });
      await new Promise((res, rej) => {
        response.data.pipe(fs.createWriteStream(logoFilename))
          .on('finish', res)
          .on('error', rej);
      });

      const image = await new Promise((res, rej) => {
        escpos.Image.load(logoFilename, (img) => {
          if (img) res(img);
          else rej(new Error("Failed to load image"));
        });
      });

      printer.align('ct').raster(image, 'dw');
      printer.feed(1);
    } catch (e) {
      console.error("Logo printing error:", e.message);
    }
  }

  // 2. Shop Header
  printer.align('ct').style('b').size(1, 1);
  printer.text((data.shopInfo?.name || "SHOP").toUpperCase()).feed(1);
  printer.style('n').size(0, 0);
  if (data.shopInfo?.address) printer.text(data.shopInfo.address);
  if (data.shopInfo?.phone) printer.text(`Тел: ${data.shopInfo.phone}`);
  printer.text("-------------------------------").feed(1);

  // 3. Order Metadata
  printer.align('lt').style('b').size(1, 1).text(`ЗАКАЗ: #${data.orderNumber}`);
  printer.style('n').size(0, 0).text(`Дата: ${new Date(data.createdAt).toLocaleString('ru-RU')}`);
  printer.text(`Печать: ${new Date(data.printAt).toLocaleString('ru-RU')}`);
  printer.text(`Тип: ОНЛАЙН (Telegram)`);
  printer.text("-------------------------------").feed(1);

  // 4. Customer Info
  printer.style('b').text(`КЛИЕНТ: ${data.customerName || 'Гость'}`);
  printer.text(`ТЕЛ: ${data.customerPhone || '-'}`);
  printer.style('n');
  if (data.deliveryAddress) {
    printer.text(`АДРЕС: ${data.deliveryAddress}`);
  }
  if (data.comment) {
    printer.feed(1).style('b').text(`КОММЕНТАРИЙ:`).style('n').text(data.comment);
  }
  printer.feed(1).align('ct').text("========== ТОВАРЫ ==========").feed(1);

  // 5. Items Table
  data.items.forEach(item => {
    const name = item.name;
    const qty = item.quantity + (item.unit || 'шт');
    const price = (item.price || 0).toLocaleString('ru-RU');
    const total = (item.total || 0).toLocaleString('ru-RU');
    
    printer.align('lt').text(name);
    printer.align('rt').text(`${qty} x ${price} = ${total} сум`);
  });

  printer.feed(1).text("-------------------------------");

  // 6. Financials (Only if Full Receipt)
  if (data.isFullReceipt && data.financials) {
    printer.align('rt');
    printer.text(`Сумма товаров: ${data.financials.itemsSubtotal?.toLocaleString('ru-RU')} сум`);
    if (data.financials.fasovkaTotal > 0) {
      printer.text(`Фасовка: ${data.financials.fasovkaTotal.toLocaleString('ru-RU')} сум`);
    }
    if (data.financials.serviceFee > 0) {
      printer.text(`Сервис: ${data.financials.serviceFee.toLocaleString('ru-RU')} сум`);
    }
    if (data.financials.deliveryCost > 0) {
      printer.text(`Доставка: ${data.financials.deliveryCost.toLocaleString('ru-RU')} сум`);
    }
    printer.feed(1).style('b').size(1, 1).text(`ИТОГО: ${data.financials.totalAmount?.toLocaleString('ru-RU')} сум`);
    printer.style('n').size(0, 0).text(`Способ оплаты: ${data.paymentMethod || 'Наличные'}`);
  } else {
    printer.align('ct').text(`ЧЕК ДЛЯ: ${config.alias?.toUpperCase() || 'КУХНЯ'}`);
  }

  // 7. Footer
  printer.feed(2).align('ct');
  if (data.shopInfo?.footer) printer.text(data.shopInfo.footer);
  printer.text("СПАСИБО ЗА ЗАКАЗ!").feed(3).cut().close();
}

