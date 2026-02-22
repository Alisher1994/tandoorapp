import { useCallback, useEffect, useMemo, useState } from 'react';

const ACTION_BUTTONS_VISIBILITY_KEY = 'ui_action_buttons_visible_until';
export const ACTION_BUTTONS_VISIBILITY_TTL_MS = 10 * 60 * 1000;

const readVisibleUntil = () => {
  try {
    const raw = localStorage.getItem(ACTION_BUTTONS_VISIBILITY_KEY);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value;
  } catch {
    return 0;
  }
};

const writeVisibleUntil = (timestamp) => {
  try {
    if (!timestamp || timestamp <= 0) {
      localStorage.removeItem(ACTION_BUTTONS_VISIBILITY_KEY);
      return;
    }
    localStorage.setItem(ACTION_BUTTONS_VISIBILITY_KEY, String(timestamp));
  } catch {
    // Ignore localStorage errors
  }
};

const getRemainingMs = () => {
  const visibleUntil = readVisibleUntil();
  const remaining = visibleUntil - Date.now();
  if (remaining <= 0) {
    if (visibleUntil) writeVisibleUntil(0);
    return 0;
  }
  return remaining;
};

export function useTimedActionButtonsVisibility() {
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs());

  useEffect(() => {
    const tick = () => setRemainingMs(getRemainingMs());

    tick();
    const intervalId = window.setInterval(tick, 1000);

    const onStorage = (event) => {
      if (event.key === ACTION_BUTTONS_VISIBILITY_KEY) tick();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const enableForTenMinutes = useCallback(() => {
    const visibleUntil = Date.now() + ACTION_BUTTONS_VISIBILITY_TTL_MS;
    writeVisibleUntil(visibleUntil);
    setRemainingMs(Math.max(0, visibleUntil - Date.now()));
  }, []);

  const disableNow = useCallback(() => {
    writeVisibleUntil(0);
    setRemainingMs(0);
  }, []);

  const setEnabled = useCallback((enabled) => {
    if (enabled) enableForTenMinutes();
    else disableNow();
  }, [enableForTenMinutes, disableNow]);

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const visible = remainingSeconds > 0;

  const remainingLabel = useMemo(() => {
    if (!visible) return '00:00';
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [remainingSeconds, visible]);

  return {
    actionButtonsVisible: visible,
    actionButtonsRemainingSeconds: remainingSeconds,
    actionButtonsRemainingLabel: remainingLabel,
    enableActionButtonsForTenMinutes: enableForTenMinutes,
    disableActionButtonsNow: disableNow,
    setActionButtonsVisible: setEnabled
  };
}

