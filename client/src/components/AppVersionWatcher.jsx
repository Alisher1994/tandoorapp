import React, { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 120000;
const VERSION_STORAGE_KEY = 'app:last_server_version';

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

function AppVersionWatcher() {
  const initialVersionRef = useRef(null);

  useEffect(() => {
    let disposed = false;

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

        if (!initialVersionRef.current) {
          initialVersionRef.current = readStoredVersion() || nextVersion;
        }

        // Keep version marker in sync silently.
        if (initialVersionRef.current !== nextVersion) {
          initialVersionRef.current = nextVersion;
          writeStoredVersion(nextVersion);
          return;
        }

        writeStoredVersion(nextVersion);
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
  return null;
}

export default AppVersionWatcher;
