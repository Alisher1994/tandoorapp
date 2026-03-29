require('dotenv').config();
const { io } = require("socket.io-client");
const escpos = require('escpos');
escpos.Network = require('escpos-network');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const readline = require('readline/promises');
const os = require('os');

const AGENT_BUILD_ID = '8.7.1+bundle-check'; // видно в логе даже если package.json в exe не подтянулся
let AGENT_PKG_VERSION = AGENT_BUILD_ID;
try {
  AGENT_PKG_VERSION = require('./package.json').version;
} catch (_) {}

// --- GLOBALS ---
const appData = process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const installDir = path.join(appData, 'TalablarAgent');

// Ensure installDir exists early
if (!fs.existsSync(installDir)) {
  try {
    fs.mkdirSync(installDir, { recursive: true });
  } catch (e) {}
}

async function runSetupWizard() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   TALABLAR AGENT AGENT - УСТАНОВКА v1.0     ║");
  console.log("╚══════════════════════════════════════════════╝\n");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const defaultUrl = "https://talablar.up.railway.app";
  let inputUrl = await rl.question(`Адрес сервера [Enter для ${defaultUrl}]: `);
  const finalServerUrl = inputUrl.trim() || defaultUrl;

  let finalAgentToken = "";
  while (!finalAgentToken) {
    finalAgentToken = (await rl.question("Вставьте ТОКЕН агента (из админки): ")).trim();
  }
  
  rl.close();

  console.log("\n⏳ Установка...");
  
  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
  }

  // Write .env
  fs.writeFileSync(path.join(installDir, '.env'), `SERVER_URL=${finalServerUrl}\nAGENT_TOKEN=${finalAgentToken}\n`);
  
  // Copy exe if running from pkg
  const targetExe = path.join(installDir, 'TalablarAgent.exe');
  if (process.pkg) {
    try {
      fs.copyFileSync(process.execPath, targetExe);
    } catch (e) {
      console.warn("⚠️ Не удалось скопировать .exe:", e.message);
    }
  }
  
  // Create shortcut on desktop using powershell
  const desktop = path.join(os.homedir(), 'Desktop');
  const shortcutTarget = process.pkg ? targetExe : process.execPath;
  const shortcutScript = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${path.join(desktop, 'Talablar Agent.lnk')}'); $s.TargetPath = '${shortcutTarget}'; $s.WorkingDirectory = '${installDir}'; $s.IconLocation = 'shell32.dll,16'; $s.Description = 'Talablar Agent Agent'; $s.Save();`;
  
  const psCommand = `powershell -NoProfile -Command "${shortcutScript}"`;
  
  await new Promise(resolve => exec(psCommand, resolve));

  console.log("✅ Установка успешно завершена!");
  console.log(`📂 Установлено в: ${installDir}`);
  console.log("🖥️ Ярлык 'Talablar Agent' создан на рабочем столе.\n");
  
  console.log("🚀 Запускаем агент...");
  if (process.pkg) {
    spawn(targetExe, [], { detached: true, stdio: 'ignore', cwd: installDir }).unref();
  } else {
    // If running from node script, just spawn node
    spawn('node', [shortcutTarget], { detached: true, stdio: 'ignore', cwd: installDir }).unref();
  }
  process.exit(0);
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "YOUR_AGENT_TOKEN_HERE";
const isTokenValid = AGENT_TOKEN && AGENT_TOKEN !== "YOUR_AGENT_TOKEN_HERE";

/** DB field usb_vid_pid is often empty or VID:PID; Windows needs the printer SHARE name for \\localhost\Share */
function looksLikeUsbVidPid(s) {
  const t = String(s).trim();
  return /^[0-9a-fA-F]{4}[:-][0-9a-fA-F]{4}$/.test(t);
}

function sanitizePrinterShareName(name) {
  return String(name)
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 80);
}

function resolveWindowsPrinterShare(config) {
  const fromUsb = config.usb != null ? String(config.usb).trim() : '';
  if (fromUsb && !looksLikeUsbVidPid(fromUsb)) {
    const s = sanitizePrinterShareName(fromUsb);
    if (s) return s;
  }
  const rawLabel =
    config.name ??
    config.printerName ??
    config.title ??
    (typeof config.label === 'string' ? config.label : '');
  const fromName = sanitizePrinterShareName(rawLabel != null ? rawLabel : '');
  if (fromName) return fromName;
  const envShare = process.env.TALABLAR_PRINTER_SHARE;
  if (envShare && String(envShare).trim()) {
    return sanitizePrinterShareName(envShare) || 'XP-80';
  }
  return 'XP-80';
}

function resolveAbsoluteLogoUrl(logoUrl) {
  if (logoUrl == null) return null;
  let s = logoUrl;
  if (typeof s !== 'string') {
    if (typeof s === 'object' && s !== null) {
      s = s.url || s.href || s.src || '';
    } else {
      s = String(s);
    }
  }
  const t = s.trim();
  if (!t) return null;
  try {
    if (/^https?:\/\//i.test(t)) return new URL(t).href;
    if (/^\/\//.test(t)) return new URL(`https:${t}`).href;
    const base = SERVER_URL.endsWith('/') ? SERVER_URL : `${SERVER_URL}/`;
    return new URL(t.startsWith('/') ? t : `/${t}`, base).href;
  } catch {
    return null;
  }
}

async function main() {
  if (!isTokenValid) {
    await runSetupWizard();
    return; // Execution stops here since runSetupWizard calls process.exit(0)
  }

  console.log("\n=============================================");
  console.log("🚀 Talablar Agent Started...");
  console.log(`📌 Agent v${AGENT_PKG_VERSION} · build ${AGENT_BUILD_ID}`);
  console.log(`🧩 Executable: ${process.execPath}`);
  console.log(`🔗 Connecting to ${SERVER_URL}...`);
  console.log(`📂 Working Directory: ${installDir}`);
  console.log("=============================================\n");

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
    const isCashier = printerConfig.alias === 'cashier' || printerConfig.alias === 'admin' || printers.length === 1;

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
}

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
    // Must use os.tmpdir() (not installDir next to pkg snapshot / project): pkg treats writes under snapshot as missing assets.
    const printerName = resolveWindowsPrinterShare(config);
    console.log(`📎 Windows share for copy: "${printerName}" (from server name: "${config.name ?? ''}")`);
    const printScratch = path.join(os.tmpdir(), 'TalablarAgent');
    try {
      if (!fs.existsSync(printScratch)) fs.mkdirSync(printScratch, { recursive: true });
    } catch (e) {}
    const tempFile = path.join(printScratch, `print_${Date.now()}.bin`);
    
    const fileDevice = {
      open: function(cb) { fs.writeFileSync(tempFile, Buffer.alloc(0)); cb && cb(null); },
      write: function(data, cb) { fs.appendFileSync(tempFile, data); cb && cb(null); },
      close: function(cb) { cb && cb(null); },
      read: function() {}
    };

    const printer = new escpos.Printer(fileDevice);

    // Ensure file is cleared/started
    fileDevice.open();
    
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
            return reject(new Error(
              `Печать на \\\\localhost\\${printerName} не удалась. В Windows: свойства принтера → Доступ → общий доступ; имя ресурса должно совпадать с "${printerName}" (сейчас в админке: "${config.name || ''}").`
            ));
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
      const logoHref = resolveAbsoluteLogoUrl(data.shopInfo.logoUrl);
      if (!logoHref) {
        console.error("Logo printing error: invalid or relative URL could not be resolved:", data.shopInfo.logoUrl);
      } else {
        const logoFilename = path.join(installDir, 'temp_logo.png');
        const response = await axios({
          url: logoHref,
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
      }
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

main().catch(console.error);
