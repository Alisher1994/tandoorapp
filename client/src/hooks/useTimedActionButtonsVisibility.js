import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ACTION_BUTTONS_VISIBILITY_KEY = 'ui_action_buttons_visible_until';
export const ACTION_BUTTONS_VISIBILITY_TTL_MS = 10 * 60 * 1000;
const HOTKEY_SEQUENCE = '111';
const HOTKEY_RESET_MS = 1200;

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
    // ignore storage errors
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
  // Default behavior: show edit buttons for 10 minutes on first visit, then hide.
  const [remainingMs, setRemainingMs] = useState(() => {
    const current = getRemainingMs();
    if (current > 0) return current;
    const initialVisibleUntil = Date.now() + ACTION_BUTTONS_VISIBILITY_TTL_MS;
    writeVisibleUntil(initialVisibleUntil);
    return Math.max(0, initialVisibleUntil - Date.now());
  });
  const hotkeyBufferRef = useRef('');
  const hotkeyTimerRef = useRef(null);

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

  useEffect(() => {
    const tick = () => setRemainingMs(getRemainingMs());

    tick();
    const intervalId = window.setInterval(tick, 1000);

    const onStorage = (event) => {
      if (event.key === ACTION_BUTTONS_VISIBILITY_KEY) tick();
    };

    const onKeyDown = (event) => {
      if (event.key !== '1') return;

      hotkeyBufferRef.current = `${hotkeyBufferRef.current}${event.key}`.slice(-HOTKEY_SEQUENCE.length);
      if (hotkeyTimerRef.current) {
        window.clearTimeout(hotkeyTimerRef.current);
      }
      hotkeyTimerRef.current = window.setTimeout(() => {
        hotkeyBufferRef.current = '';
      }, HOTKEY_RESET_MS);

      if (hotkeyBufferRef.current === HOTKEY_SEQUENCE) {
        hotkeyBufferRef.current = '';
        if (hotkeyTimerRef.current) {
          window.clearTimeout(hotkeyTimerRef.current);
          hotkeyTimerRef.current = null;
        }
        enableForTenMinutes();
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('keydown', onKeyDown);
      if (hotkeyTimerRef.current) {
        window.clearTimeout(hotkeyTimerRef.current);
      }
    };
  }, [enableForTenMinutes]);

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
