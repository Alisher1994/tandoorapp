const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');
const { io } = require("socket.io-client");
const escpos = require('escpos');
escpos.Network = require('escpos-network');
const { exec, spawn, execFile } = require('child_process');
const axios = require('axios');
const readline = require('readline/promises');
const Jimp = require('jimp');
const QRCode = require('qrcode');
const webp = require('webp-converter');

const AGENT_BUILD_ID = '8.14.0+receipt-qr';
let AGENT_PKG_VERSION = AGENT_BUILD_ID;
try {
  AGENT_PKG_VERSION = require('./package.json').version;
} catch (_) {}
const cliArgs = new Set(
  process.argv
    .slice(2)
    .map((arg) => String(arg || '').trim().toLowerCase())
    .filter(Boolean)
);
const forceSetupMode = cliArgs.has('--setup')
  || cliArgs.has('/setup')
  || cliArgs.has('--reconfigure')
  || cliArgs.has('--change-token');

// --- GLOBALS ---
const appData = process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const installDir = path.join(appData, 'TalablarAgent');

// Ensure installDir exists early
if (!fs.existsSync(installDir)) {
  try {
    fs.mkdirSync(installDir, { recursive: true });
  } catch (e) {}
}

// Prefer local .env (dev), otherwise use installDir (pkg/exe run from any folder)
const cwdEnvPath = path.join(process.cwd(), '.env');
const installEnvPath = path.join(installDir, '.env');
if (fs.existsSync(cwdEnvPath)) {
  dotenv.config({ path: cwdEnvPath });
} else if (fs.existsSync(installEnvPath)) {
  dotenv.config({ path: installEnvPath });
} else {
  dotenv.config();
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
  const currentServerUrl = String(process.env.SERVER_URL || '').trim();
  const currentToken = String(process.env.AGENT_TOKEN || '').trim();
  const hasCurrentToken = currentToken && currentToken !== "YOUR_AGENT_TOKEN_HERE";
  const currentTokenMasked = hasCurrentToken
    ? `${currentToken.slice(0, 8)}...`
    : 'не задан';

  if (currentServerUrl) {
    console.log(`Текущий сервер: ${currentServerUrl}`);
  }
  console.log(`Текущий токен: ${currentTokenMasked}\n`);

  const defaultPromptUrl = currentServerUrl || defaultUrl;
  let inputUrl = await rl.question(`Адрес сервера [Enter для ${defaultPromptUrl}]: `);
  const finalServerUrl = inputUrl.trim() || defaultPromptUrl;

  let finalAgentToken = "";
  while (!finalAgentToken) {
    const tokenPrompt = hasCurrentToken
      ? `Вставьте ТОКЕН агента [Enter оставить текущий ${currentTokenMasked}]: `
      : "Вставьте ТОКЕН агента (из админки): ";
    const tokenInput = (await rl.question(tokenPrompt)).trim();
    if (tokenInput) {
      finalAgentToken = tokenInput;
      break;
    }
    if (hasCurrentToken) {
      finalAgentToken = currentToken;
    }
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
  const sourceScript = process.argv[1] ? path.resolve(process.argv[1]) : path.join(__dirname, 'agent.js');
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
  const shortcutArgs = process.pkg ? '' : `"${sourceScript}"`;
  const shortcutScript = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${path.join(desktop, 'Talablar Agent.lnk')}'); $s.TargetPath = '${shortcutTarget}'; $s.WorkingDirectory = '${installDir}'; $s.IconLocation = 'shell32.dll,16'; $s.Description = 'Talablar Agent Agent'; $s.Save();`;
  const shortcutScriptWithArgs = shortcutArgs
    ? shortcutScript.replace("$s.WorkingDirectory", `$s.Arguments = '${shortcutArgs}'; $s.WorkingDirectory`)
    : shortcutScript;
  
  const psCommand = `powershell -NoProfile -Command "${shortcutScriptWithArgs}"`;
  
  await new Promise(resolve => exec(psCommand, resolve));

  console.log("✅ Установка успешно завершена!");
  console.log(`📂 Установлено в: ${installDir}`);
  console.log("🖥️ Ярлык 'Talablar Agent' создан на рабочем столе.\n");
  
  console.log("🚀 Запускаем агент...");
  if (process.pkg) {
    spawn(targetExe, [], { detached: true, stdio: 'ignore', cwd: installDir }).unref();
  } else {
    // If running from node script, restart the same script with node.
    spawn(process.execPath, [sourceScript], { detached: true, stdio: 'ignore', cwd: installDir }).unref();
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

/** Убираем узкие/неразрывные пробелы из toLocaleString — в cp866 принтере это мусор */
function tx(s) {
  return String(s ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u202F/g, ' ')
    .replace(/\u2009/g, ' ');
}

let webpPermissionOnce = false;
function ensureWebpTools() {
  if (webpPermissionOnce) return;
  webpPermissionOnce = true;
  try {
    if (process.platform !== 'win32') webp.grant_permission();
  } catch (_) {}
}

let cachedWebpBinDir = null;
function extractWebpBinariesIfNeeded() {
  const srcDir = path.join(__dirname, 'node_modules', 'webp-converter', 'bin', 'libwebp_win64', 'bin');
  if (!process.pkg || process.platform !== 'win32' || process.arch !== 'x64') {
    return { dwebpPath: path.join(srcDir, 'dwebp.exe') };
  }
  if (cachedWebpBinDir) {
    return { dwebpPath: path.join(cachedWebpBinDir, 'dwebp.exe') };
  }
  const dstDir = path.join(installDir, 'webp-bin');
  try { fs.mkdirSync(dstDir, { recursive: true }); } catch (_) {}
  let files = ['dwebp.exe', 'freeglut.dll'];
  try {
    files = fs.readdirSync(srcDir);
  } catch (_) {}
  for (const file of files) {
    const src = path.join(srcDir, file);
    const dst = path.join(dstDir, file);
    try {
      if (!fs.existsSync(dst) || fs.statSync(dst).size === 0) {
        fs.writeFileSync(dst, fs.readFileSync(src));
      }
    } catch (e) {
      console.warn(`⚠️ WebP binary copy failed (${file}):`, e.message);
    }
  }
  cachedWebpBinDir = dstDir;
  return { dwebpPath: path.join(dstDir, 'dwebp.exe') };
}

function execFilePromise(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout || stderr);
    });
  });
}

async function convertWebpToPng(inputPath, outputPath) {
  if (process.pkg && process.platform === 'win32' && process.arch === 'x64') {
    const { dwebpPath } = extractWebpBinariesIfNeeded();
    if (dwebpPath && fs.existsSync(dwebpPath)) {
      await execFilePromise(dwebpPath, [inputPath, '-png', '-o', outputPath, '-quiet']);
      return;
    }
  }
  await webp.dwebp(inputPath, outputPath, '-png', '-quiet');
}

/** WebP + слишком широкие логотипы: в PNG для escpos, ширина ≤ TALABLAR_LOGO_MAX_WIDTH (576 для 80мм) */
async function prepareReceiptLogoFile(logoHref) {
  ensureWebpTools();
  const stamp = Date.now();
  const base = path.join(installDir, `receipt_logo_${stamp}`);
  const response = await axios({ url: logoHref, responseType: 'arraybuffer', timeout: 45000, validateStatus: (s) => s === 200 });
  const buf = Buffer.from(response.data);
  const ctype = String(response.headers['content-type'] || '').toLowerCase();
  let ext = path.extname(new URL(logoHref).pathname.replace(/\?.*$/, '') || '').toLowerCase();
  if (!ext || ext.length > 8) ext = '.dat';
  let dlPath = `${base}_dl${ext}`;
  fs.writeFileSync(dlPath, buf);

  const isWebp = ext === '.webp' || ctype.includes('webp') ||
    (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP');

  let workPath = dlPath;
  if (isWebp) {
    const pngPath = `${base}_conv.png`;
    await convertWebpToPng(dlPath, pngPath);
    try { fs.unlinkSync(dlPath); } catch (_) {}
    if (!fs.existsSync(pngPath) || fs.statSync(pngPath).size < 40) {
      throw new Error('dwebp produced empty file');
    }
    workPath = pngPath;
  }

  const outPath = `${base}_print.png`;
  const image = await Jimp.read(workPath);
  const maxW = parseInt(process.env.TALABLAR_LOGO_MAX_WIDTH || '384', 10);
  if (image.bitmap.width > maxW) {
    image.resize(maxW, Jimp.AUTO);
  }
  await new Promise((res, rej) => image.write(outPath, (err) => (err ? rej(err) : res())));
  if (workPath !== outPath) {
    try { fs.unlinkSync(workPath); } catch (_) {}
  }
  return outPath;
}

function resolvePaymentMethodLabel(rawMethod) {
  const method = String(rawMethod || '').trim().toLowerCase();
  if (method === 'cash') return 'Наличные';
  if (method === 'payme') return 'Payme';
  if (method === 'click') return 'Click';
  if (method === 'uzum') return 'Uzum';
  if (method === 'xazna') return 'Xazna';
  if (method === 'card') return 'Карта';
  return method ? method : 'Наличные';
}

function resolveFulfillmentTypeLabel(rawType, deliveryAddress) {
  const normalized = String(rawType || '').trim().toLowerCase();
  if (normalized === 'pickup') return 'Самовывоз';
  if (normalized === 'delivery') return 'Доставка';
  const fallbackAddress = String(deliveryAddress || '').trim().toLowerCase();
  if (fallbackAddress === 'самовывоз') return 'Самовывоз';
  return 'Доставка';
}

function resolveDeliveryScheduleLabel(deliveryDate, deliveryTime) {
  const timeRaw = String(deliveryTime || '').trim();
  const dateRaw = String(deliveryDate || '').trim();
  if (timeRaw) {
    return `На время: ${timeRaw}`;
  }
  if (dateRaw) {
    return `На дату: ${dateRaw}`;
  }
  return 'Как можно скорее';
}

function formatTwoColumns(leftText, rightText, totalWidth = 32) {
  const left = String(leftText || '').trim();
  const right = String(rightText || '').trim();
  if (!left && !right) return '';
  if (!left) return right;
  if (!right) return left;
  if ((left.length + right.length + 1) >= totalWidth) {
    return `${left} | ${right}`;
  }
  const spaces = ' '.repeat(Math.max(1, totalWidth - left.length - right.length));
  return `${left}${spaces}${right}`;
}

async function loadEscposImageFromPath(filePath) {
  return new Promise((resolve, reject) => {
    escpos.Image.load(filePath, (arg) => {
      if (arg && typeof arg.toRaster === 'function') return resolve(arg);
      reject(arg instanceof Error ? arg : new Error('Failed to load raster image'));
    });
  });
}

async function generateQrCodeImageBuffer(content, size = 150) {
  return QRCode.toBuffer(String(content || '').trim(), {
    type: 'png',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M'
  });
}

async function printReceiptQrSection(printer, data) {
  const orderQrValue = String(data?.shopInfo?.orderQrUrl || '').trim();
  const locationQrValue = String(data?.clientLocationUrl || '').trim();
  if (!orderQrValue && !locationQrValue) return;

  const sectionStamp = Date.now();
  const sectionPath = path.join(installDir, `receipt_qr_${sectionStamp}.png`);

  try {
    const paperWidth = parseInt(process.env.TALABLAR_LOGO_MAX_WIDTH || '384', 10) || 384;
    const qrSize = 150;
    const gap = 14;
    const topBottomPadding = 8;
    const canvasHeight = (qrSize + topBottomPadding * 2);

    const canvas = new Jimp(paperWidth, canvasHeight, 0xffffffff);
    const qrEntries = [];

    if (orderQrValue) {
      qrEntries.push({
        key: 'order',
        label: 'Отсканируйте для заказов',
        value: orderQrValue
      });
    }
    if (locationQrValue) {
      qrEntries.push({
        key: 'location',
        label: 'Локация клиента',
        value: locationQrValue
      });
    }

    const totalQrWidth = qrEntries.length === 2 ? (qrSize * 2 + gap) : qrSize;
    const startX = Math.max(0, Math.floor((paperWidth - totalQrWidth) / 2));

    for (let index = 0; index < qrEntries.length; index += 1) {
      const entry = qrEntries[index];
      const qrBuffer = await generateQrCodeImageBuffer(entry.value, qrSize);
      const qrImage = await Jimp.read(qrBuffer);
      qrImage.greyscale().contrast(0.6);
      const x = startX + (index * (qrSize + gap));
      const y = topBottomPadding;
      canvas.composite(qrImage, x, y);
    }

    await canvas.writeAsync(sectionPath);
    const image = await loadEscposImageFromPath(sectionPath);
    printer.align('ct').raster(image, 'dw').feed(1);

    if (qrEntries.length === 2) {
      printer.align('lt').text(tx(formatTwoColumns(qrEntries[0].label, qrEntries[1].label)));
    } else if (qrEntries.length === 1) {
      printer.align('ct').text(tx(qrEntries[0].label));
    }
  } catch (error) {
    console.error('QR section print error:', error.message);
  } finally {
    try { fs.unlinkSync(sectionPath); } catch (_) {}
  }
}

async function main() {
  if (forceSetupMode) {
    await runSetupWizard();
    return;
  }

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

    const { printers, items } = payload;

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
        }, 'order');
      } catch (err) {
        console.error(`❌ Failed to print to ${printerConfig.alias}:`, err.message);
        if (isCashier) {
          console.warn(`↩️ Retry printing without QR/extra block for ${printerConfig.alias}...`);
          try {
            await printToPrinter(printerConfig, {
              ...payload,
              items,
              isFullReceipt: true,
              disableQrSection: true
            }, 'order');
            console.log(`✅ Fallback print succeeded for ${printerConfig.alias}`);
          } catch (fallbackErr) {
            console.error(`❌ Fallback print failed for ${printerConfig.alias}:`, fallbackErr.message);
          }
        }
      }
    }
  });

  /**
   * Test print routing logic
   */
  socket.on("print_test", async (payload) => {
    const { printers } = payload || {};
    console.log(`🧪 Received Test Print Job (${payload?.trigger || 'manual'})`);

    if (!printers || printers.length === 0) {
      console.warn("⚠️ No printers configured for test print.");
      return;
    }

    for (const printerConfig of printers) {
      console.log(`🖨️ Test print to: ${printerConfig.name} (${printerConfig.alias}) over ${printerConfig.type}`);
      try {
        await printToPrinter(printerConfig, {
          ...payload,
          isFullReceipt: true
        }, 'test');
      } catch (err) {
        console.error(`❌ Failed test print to ${printerConfig.alias}:`, err.message);
      }
    }
  });
}

/**
 * Low-level ESC/POS Printing
 */
async function printToPrinter(config, data, mode = 'order') {
  let device;

  if (config.type === 'network') {
    device = new escpos.Network(config.ip, 9100);
    const printer = new escpos.Printer(device);
    
    return new Promise((resolve, reject) => {
      device.open(async (error) => {
        if (error) return reject(error);
        try {
          if (mode === 'test') {
            await executeTestPrintSequence(printer, device, data, config);
          } else {
            await executePrintSequence(printer, device, data, config);
          }
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
    
    if (mode === 'test') {
      await executeTestPrintSequence(printer, fileDevice, data, config);
    } else {
      await executePrintSequence(printer, fileDevice, data, config);
    }
    
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
function applyPrinterTextEncoding(printer) {
  printer.hardware('init');
  const rawCodePage = parseInt(process.env.TALABLAR_CODEPAGE || '17', 10);
  const codePage = Number.isFinite(rawCodePage) ? rawCodePage : 17;
  printer.setCharacterCodeTable(codePage);
  const defaultEncoding = codePage === 17 ? 'cp866' : 'windows-1251';
  printer.encode((process.env.TALABLAR_ICONV_ENCODING || defaultEncoding).trim());
}

async function printLogoIfPresent(printer, shopInfo, allowLogo) {
  if (!allowLogo || !shopInfo?.logoUrl) return;
  let logoPrintPath = null;
  try {
    const logoHref = resolveAbsoluteLogoUrl(shopInfo.logoUrl);
    if (!logoHref) {
      console.error("Logo printing error: invalid or relative URL could not be resolved:", shopInfo.logoUrl);
      return;
    }
    logoPrintPath = await prepareReceiptLogoFile(logoHref);
    const image = await loadEscposImageFromPath(logoPrintPath);
    printer.align('ct').raster(image, 'dw');
    printer.feed(1);
  } catch (e) {
    console.error("Logo printing error:", e.message);
  } finally {
    if (logoPrintPath) {
      try { fs.unlinkSync(logoPrintPath); } catch (_) {}
    }
  }
}

async function executePrintSequence(printer, device, data, config) {
  // Сброс + кириллица: таблица 17 ≈ CP866 на большинстве Xprinter/Epson-совместимых;
  // при кракозябрах попробуйте TALABLAR_CODEPAGE=46 и TALABLAR_ICONV_ENCODING=windows-1251
  applyPrinterTextEncoding(printer);

  printer.font('a').align('ct').style('bu').size(1, 1);

  // 1. Logo (if Full Receipt): WebP→PNG, масштаб под 80 мм
  await printLogoIfPresent(printer, data.shopInfo, data.isFullReceipt);

  // 2. Shop Header
  printer.align('ct').style('b').size(1, 1);
  printer.text(tx((data.shopInfo?.name || 'SHOP').toUpperCase())).feed(1);
  printer.style('n').size(0, 0);
  if (data.shopInfo?.address) printer.text(tx(data.shopInfo.address));
  if (data.shopInfo?.phone) printer.text(tx(`Тел: ${data.shopInfo.phone}`));
  printer.text('-------------------------------').feed(1);

  // 3. Order Metadata
  printer.align('lt').style('b').size(1, 1).text(tx(`ЗАКАЗ: #${data.orderNumber}`));
  printer.style('n').size(0, 0).text(tx(`Дата: ${new Date(data.createdAt).toLocaleString('ru-RU')}`));
  printer.text(tx(`Печать: ${new Date(data.printAt).toLocaleString('ru-RU')}`));
  printer.text(tx(`Тип: ${resolveFulfillmentTypeLabel(data.fulfillmentType, data.deliveryAddress)}`));
  printer.text(tx(`Оплата: ${resolvePaymentMethodLabel(data.paymentMethod)}`));
  printer.text(tx(`Ко времени: ${resolveDeliveryScheduleLabel(data.deliveryDate, data.deliveryTime)}`));
  printer.text('-------------------------------').feed(1);

  // 4. Customer Info
  printer.style('b').text(tx(`КЛИЕНТ: ${data.customerName || 'Гость'}`));
  printer.text(tx(`ТЕЛ: ${data.customerPhone || '-'}`));
  printer.style('n');
  if (data.deliveryAddress) {
    printer.text(tx(`АДРЕС: ${data.deliveryAddress}`));
  }
  if (data.comment) {
    printer.feed(1).style('b').text(tx('КОММЕНТАРИЙ:')).style('n').text(tx(data.comment));
  }
  printer.feed(1).align('ct').text(tx('========== ТОВАРЫ ==========')).feed(1);

  // 5. Items Table
  data.items.forEach((item, index) => {
    const number = index + 1;
    const name = `${number}. ${item.name}`;
    const qty = item.quantity + (item.unit || 'шт');
    const price = tx((item.price || 0).toLocaleString('ru-RU'));
    const total = tx((item.total || 0).toLocaleString('ru-RU'));

    printer.align('lt').text(tx(name));
    printer.align('rt').text(tx(`${qty} x ${price} = ${total} сум`));
  });

  printer.feed(1).text('-------------------------------');

  // 6. Financials (Only if Full Receipt)
  if (data.isFullReceipt && data.financials) {
    printer.align('rt');
    printer.text(tx(`Сумма товаров: ${data.financials.itemsSubtotal?.toLocaleString('ru-RU')} сум`));
    if (data.financials.fasovkaTotal > 0) {
      printer.text(tx(`Фасовка: ${data.financials.fasovkaTotal.toLocaleString('ru-RU')} сум`));
    }
    if (data.financials.serviceFee > 0) {
      printer.text(tx(`Сервис: ${data.financials.serviceFee.toLocaleString('ru-RU')} сум`));
    }
    if (data.financials.deliveryCost > 0) {
      printer.text(tx(`Доставка: ${data.financials.deliveryCost.toLocaleString('ru-RU')} сум`));
    }
    printer.feed(1).style('b').size(1, 1).text(tx(`ИТОГО: ${data.financials.totalAmount?.toLocaleString('ru-RU')} сум`));
    printer.style('n').size(0, 0).text(tx(`Способ оплаты: ${resolvePaymentMethodLabel(data.paymentMethod)}`));

    // QR блок: слева - заказы магазина, справа - локация клиента
    printer.feed(1).align('ct').text('-------------------------------').feed(1);
    if (!data.disableQrSection) {
      await printReceiptQrSection(printer, data);
    }
  } else {
    printer.align('ct').text(tx(`ЧЕК ДЛЯ: ${config.alias?.toUpperCase() || 'КУХНЯ'}`));
  }

  // 7. Footer
  printer.feed(2).align('ct');
  if (data.shopInfo?.footer) printer.text(tx(data.shopInfo.footer));
  printer.text(tx('СПАСИБО ЗА ЗАКАЗ!')).feed(3).cut().close();
}

async function executeTestPrintSequence(printer, device, data, config) {
  applyPrinterTextEncoding(printer);
  printer.font('a').align('ct').style('bu').size(1, 1);
  await printLogoIfPresent(printer, data.shopInfo, true);

  const now = data?.printAt ? new Date(data.printAt) : new Date();
  const triggerLabel = data?.trigger === 'auto-connect'
    ? 'АВТОТЕСТ ПРИ ПОДКЛЮЧЕНИИ'
    : 'РУЧНАЯ ПРОВЕРКА ПРИНТЕРА';

  printer.align('ct').style('b').size(1, 1);
  printer.text(tx((data.shopInfo?.name || 'SHOP').toUpperCase())).feed(1);
  printer.style('n').size(0, 0);
  if (data.shopInfo?.address) printer.text(tx(data.shopInfo.address));
  if (data.shopInfo?.phone) printer.text(tx(`Тел: ${data.shopInfo.phone}`));
  printer.text('-------------------------------').feed(1);

  printer.align('ct').style('b').text(tx('ТЕСТ ПОДКЛЮЧЕНИЯ ПРИНТЕРА'));
  printer.style('n').text(tx(triggerLabel));
  printer.text(tx(`Принтер: ${config?.name || config?.alias || '-'}`));
  printer.text(tx(`Дата: ${now.toLocaleString('ru-RU')}`));
  printer.text('-------------------------------').feed(1);

  printer.align('ct').style('b').size(1, 1).text(tx('ПОДКЛЮЧЕНИЕ УСПЕШНО'));
  printer.style('n').size(0, 0).feed(1);
  printer.text(tx('Принтер подключен к магазину.'));
  printer.text(tx('Тестовая печать выполнена корректно.'));

  printer.feed(2).align('ct');
  if (data.shopInfo?.footer) printer.text(tx(data.shopInfo.footer));
  printer.text(tx('СПАСИБО!')).feed(3).cut().close();
}

main().catch(console.error);
