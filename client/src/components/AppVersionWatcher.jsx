import React, { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 30000;

function AppVersionWatcher() {
  const initialVersionRef = useRef(null);
  const reloadingRef = useRef(false);
  const [updateMessage, setUpdateMessage] = useState('');

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
          initialVersionRef.current = nextVersion;
          return;
        }

        if (initialVersionRef.current !== nextVersion && !reloadingRef.current) {
          reloadingRef.current = true;
          setUpdateMessage('Доступно обновление. Обновляем страницу...');
          window.setTimeout(() => {
            window.location.reload();
          }, 800);
        }
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
