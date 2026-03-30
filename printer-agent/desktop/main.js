const { app, Tray, Menu, BrowserWindow, shell, dialog, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const APP_USER_MODEL_ID = 'com.talablar.printer';
const DATA_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'TalablarAgent');
const ENV_PATH = path.join(DATA_DIR, '.env');
const CORE_EXE_NAME = 'TalablarAgent.exe';
const RESTART_DELAY_MS = 1800;

let tray = null;
let settingsWindow = null;
let coreProcess = null;
let restartTimer = null;
let isQuitting = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const result = {};
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function writeEnvFile(nextSettings) {
  const current = readEnvFile();
  const merged = {
    ...current,
    SERVER_URL: String(nextSettings.serverUrl || '').trim(),
    AGENT_TOKEN: String(nextSettings.agentToken || '').trim()
  };
  const lines = [];
  lines.push(`SERVER_URL=${merged.SERVER_URL}`);
  lines.push(`AGENT_TOKEN=${merged.AGENT_TOKEN}`);

  for (const key of Object.keys(merged).sort()) {
    if (key === 'SERVER_URL' || key === 'AGENT_TOKEN') continue;
    lines.push(`${key}=${merged[key]}`);
  }
  fs.writeFileSync(ENV_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function hasRequiredSettings(settings) {
  const serverUrl = String(settings?.SERVER_URL || '').trim();
  const agentToken = String(settings?.AGENT_TOKEN || '').trim();
  if (!serverUrl) return false;
  if (!agentToken || agentToken === 'YOUR_AGENT_TOKEN_HERE') return false;
  return true;
}

function resolveCoreExecutable() {
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'agent-core', CORE_EXE_NAME));
  }
  candidates.push(path.join(__dirname, '..', 'build', 'core', CORE_EXE_NAME));
  candidates.push(path.join(__dirname, '..', 'dist', CORE_EXE_NAME));
  candidates.push(path.join(process.cwd(), 'build', 'core', CORE_EXE_NAME));
  candidates.push(path.join(process.cwd(), 'dist', CORE_EXE_NAME));

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function stopCoreProcess() {
  if (!coreProcess) return;
  try {
    coreProcess.removeAllListeners();
    coreProcess.kill();
  } catch (_) {
    // ignore
  } finally {
    coreProcess = null;
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const isRunning = Boolean(coreProcess && coreProcess.exitCode === null);
  const settings = readEnvFile();
  const statusText = hasRequiredSettings(settings)
    ? (isRunning ? 'Статус: Подключен' : 'Статус: Перезапуск')
    : 'Статус: Нужен токен';

  const menu = Menu.buildFromTemplate([
    { label: 'Talablar Printer', enabled: false },
    { label: statusText, enabled: false },
    { type: 'separator' },
    { label: 'Настройки (сервер/токен)', click: () => showSettingsWindow() },
    { label: 'Перезапустить агент', click: () => restartCoreProcess() },
    { label: 'Открыть папку данных', click: () => shell.openPath(DATA_DIR) },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function scheduleCoreRestart() {
  if (isQuitting) return;
  if (restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startCoreProcessIfConfigured();
  }, RESTART_DELAY_MS);
}

function startCoreProcessIfConfigured() {
  const settings = readEnvFile();
  if (!hasRequiredSettings(settings)) {
    updateTrayMenu();
    showSettingsWindow();
    return false;
  }

  const coreExePath = resolveCoreExecutable();
  if (!coreExePath) {
    const message = `${CORE_EXE_NAME} не найден. Пересоберите приложение.`;
    dialog.showErrorBox('Talablar Printer', message);
    updateTrayMenu();
    return false;
  }

  if (coreProcess && coreProcess.exitCode === null) {
    updateTrayMenu();
    return true;
  }

  ensureDataDir();
  coreProcess = spawn(coreExePath, [], {
    cwd: DATA_DIR,
    windowsHide: true,
    stdio: 'ignore'
  });
  coreProcess.on('exit', () => {
    coreProcess = null;
    updateTrayMenu();
    scheduleCoreRestart();
  });
  coreProcess.on('error', () => {
    coreProcess = null;
    updateTrayMenu();
    scheduleCoreRestart();
  });

  updateTrayMenu();
  return true;
}

function restartCoreProcess() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  stopCoreProcess();
  startCoreProcessIfConfigured();
}

function getTrayIcon() {
  const iconCandidates = [
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(__dirname, 'icon.ico'),
    process.execPath
  ];
  for (const candidate of iconCandidates) {
    if (!candidate) continue;
    try {
      const image = nativeImage.createFromPath(candidate);
      if (!image.isEmpty()) {
        return image;
      }
    } catch (_) {
      // ignore
    }
  }
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABU0lEQVR4nKWTvUoDQRTHf1dY2VhY2FkY2MJCJ8Q2VhYWG9hY2NhY2MLCQh8QY2NjYWFhY2Nh4Q9xQx2Vw0kS3N2kJ7m6k+7mX+6b9x7u9/7gJDR4YfJY8D+Y9Q5mAn9gQnYxwBf7JQ3fYh3T3u7J+z7E4VY7s4u4QfGJq0QmW9Q1tP4hR2l9vJzI8QdE2qS9y4wYwF0V2B+w5kTgJ2r2wL1qJjWm4X0v6f1y6a4jWmP0R7n2w5bJXnAfVYlYzKjz9g6X9oB2dhtk2G6u1m2hM4v+4F8g0F9n4w6gR5g7m8JqZ6tTqXq4Jx2P8n3kT0l4WzJ2h2hU1Q4A7kC8wWfYfJkQ9Zg8h4R3Q8Qh7QJjJgM1w0E8Q9mYf9Q0rI6j1a3G1m5mQf5mQ7Gf1PjG7H0S4m6vM9xv8p2i+qS8qXWm0dP8v8Q2vJ3eW6Q0mJAAAAAElFTkSuQmCC'
  );
}

function showSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 360,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title: 'Talablar Printer - Настройки',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('settings:load', async () => {
    const settings = readEnvFile();
    return {
      serverUrl: String(settings.SERVER_URL || ''),
      agentToken: String(settings.AGENT_TOKEN || '')
    };
  });

  ipcMain.handle('settings:save', async (_event, payload) => {
    const serverUrl = String(payload?.serverUrl || '').trim();
    const agentToken = String(payload?.agentToken || '').trim();
    if (!serverUrl) {
      return { ok: false, error: 'Введите адрес сервера (SERVER_URL).' };
    }
    if (!agentToken) {
      return { ok: false, error: 'Введите токен агента (AGENT_TOKEN).' };
    }

    ensureDataDir();
    writeEnvFile({ serverUrl, agentToken });
    restartCoreProcess();
    return { ok: true };
  });

  ipcMain.handle('agent:restart', async () => {
    restartCoreProcess();
    return { ok: true };
  });

  ipcMain.handle('system:open-data-dir', async () => {
    ensureDataDir();
    await shell.openPath(DATA_DIR);
    return { ok: true };
  });

  ipcMain.handle('window:close-settings', async () => {
    if (settingsWindow) settingsWindow.close();
    return { ok: true };
  });
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Talablar Printer');
  tray.on('double-click', () => showSettingsWindow());
  updateTrayMenu();
}

function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => showSettingsWindow());
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.whenReady().then(() => {
    ensureDataDir();
    registerIpcHandlers();
    createTray();
    if (!startCoreProcessIfConfigured()) {
      showSettingsWindow();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    stopCoreProcess();
  });

  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });
}

bootstrap();
