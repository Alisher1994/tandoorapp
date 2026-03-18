import React, { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 30000;
const VERSION_STORAGE_KEY = 'app:last_server_version';
const VERSION_QUERY_PARAM = 'app_v';
const RELOAD_GUARD_KEY = 'app:version_reload_guard';
const RELOAD_GUARD_TTL_MS = 15000;

const isTelegramWebView = () => Boolean(window.Telegram?.WebApp);

const getReloadGuardTimestamp = () => {
  try {
    const rawValue = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const setReloadGuardTimestamp = () => {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // Ignore unavailable storage.
  }
};

const clearReloadGuardTimestamp = () => {
  try {
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // Ignore unavailable storage.
  }
};

const hasActiveReloadGuard = () => {
  const ts = getReloadGuardTimestamp();
  return ts > 0 && Date.now() - ts < RELOAD_GUARD_TTL_MS;
};

const readStoredVersion = () => {
  try {
    return window.localStorage.getItem(VERSION_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const writeStoredVersion = (version) => {
  try {
    window.localStorage.setItem(VERSION_STORAGE_KEY, version);
  } catch {
    // Ignore unavailable storage.
  }
};

const buildVersionedLocation = (version) => {
  const url = new URL(window.location.href);
  url.searchParams.set(VERSION_QUERY_PARAM, version);
  url.searchParams.set('cb', String(Date.now()));
  return url.toString();
};

const clearRuntimeCaches = async () => {
  const tasks = [];

  if ('caches' in window) {
    tasks.push(
      window.caches.keys()
        .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
        .catch(() => {})
    );
  }

  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
};

function AppVersionWatcher() {
  const initialVersionRef = useRef(null);
  const reloadingRef = useRef(false);
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    let disposed = false;

    const triggerHardRefresh = async (message, targetVersion) => {
      if (!targetVersion || reloadingRef.current || disposed) return;

      reloadingRef.current = true;
      setUpdateMessage(message);
      setReloadGuardTimestamp();

      try {
        await clearRuntimeCaches();
      } catch {
        // Silent fail: continue with hard refresh anyway.
      }

      window.setTimeout(() => {
        if (disposed) return;
        window.location.replace(buildVersionedLocation(targetVersion));
      }, 700);
    };

    const checkVersion = async () => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) return;

        const payload = await response.json();
        const nextVersion = payload?.version || '';
        if (!nextVersion || disposed) return;

        const previousStoredVersion = readStoredVersion();
        writeStoredVersion(nextVersion);
        const currentUrlVersion = new URL(window.location.href).searchParams.get(VERSION_QUERY_PARAM) || '';
        const reloadGuardActive = hasActiveReloadGuard();

        if (!initialVersionRef.current) {
          initialVersionRef.current = nextVersion;

          if (!reloadGuardActive && previousStoredVersion && previousStoredVersion !== nextVersion) {
            await triggerHardRefresh('Найдена новая версия. Обновляем страницу...', nextVersion);
            return;
          }

          if (isTelegramWebView() && !reloadGuardActive && currentUrlVersion !== nextVersion) {
            await triggerHardRefresh('Синхронизируем версию приложения...', nextVersion);
            return;
          }

          clearReloadGuardTimestamp();
          return;
        }

        if (!reloadGuardActive && initialVersionRef.current !== nextVersion) {
          await triggerHardRefresh('Доступно обновление. Обновляем страницу...', nextVersion);
          return;
        }

        if (isTelegramWebView() && !reloadGuardActive && currentUrlVersion !== nextVersion) {
          await triggerHardRefresh('Обновляем кеш Telegram WebView...', nextVersion);
          return;
        }

        clearReloadGuardTimestamp();
      } catch {
        // Silent fail: version check should not affect user flow.
      }
    };

    checkVersion();
    const intervalId = window.setInterval(checkVersion, CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  if (!updateMessage) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        background: 'rgba(28, 35, 44, 0.92)',
        color: '#fff',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
        fontSize: 13,
        fontWeight: 600
      }}
      role="status"
      aria-live="polite"
    >
      {updateMessage}
    </div>
  );
}

export default AppVersionWatcher;
