import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTH_REQUEST_TIMEOUT_MS = 8000;
const TELEGRAM_INIT_DATA_ATTEMPTS = 10;
const TELEGRAM_INIT_DATA_DELAY_MS = 140;
const TELEGRAM_AUTO_LOGIN_ATTEMPTS = 2;
const UI_THEME_VALUES = new Set([
  'classic',
  'modern',
  'talablar_blue',
  'mint_fresh',
  'sunset_pop',
  'berry_blast',
  'violet_wave',
  'rainbow'
]);
const normalizeUiTheme = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return UI_THEME_VALUES.has(normalized) ? normalized : 'classic';
};
const UI_FONT_FAMILY_VALUES = new Set([
  'sans',
  'inter',
  'roboto',
  'open_sans',
  'lato',
  'montserrat',
  'poppins',
  'nunito',
  'serif_times',
  'serif_georgia',
  'serif_merriweather',
  'serif_playfair',
  'serif_garamond',
  'serif_baskerville'
]);
const normalizeUiFontFamily = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return UI_FONT_FAMILY_VALUES.has(normalized) ? normalized : 'sans';
};
const withNormalizedTheme = (nextUser) => (
  nextUser
    ? {
      ...nextUser,
      active_restaurant_ui_theme: normalizeUiTheme(nextUser.active_restaurant_ui_theme),
      active_restaurant_ui_font_family: normalizeUiFontFamily(nextUser.active_restaurant_ui_font_family)
    }
    : nextUser
);
const applyUiTheme = (theme, fontFamily) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-theme', normalizeUiTheme(theme));
  document.documentElement.setAttribute('data-ui-font', normalizeUiFontFamily(fontFamily));
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [supportUsername, setSupportUsername] = useState(null);

  const getRestaurantIdFromLocation = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('restaurant_id') || urlParams.get('restaurantId') || '';
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const parseRestaurantIdFromToken = (rawToken) => {
    try {
      const token = String(rawToken || '').trim();
      const payloadPart = token.split('.')[1] || '';
      if (!payloadPart) return '';
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
      const decodedPayload = JSON.parse(atob(padded));
      const candidate = Number.parseInt(
        decodedPayload?.restaurantId || decodedPayload?.restaurant_id,
        10
      );
      return Number.isFinite(candidate) && candidate > 0 ? String(candidate) : '';
    } catch (_) {
      return '';
    }
  };

  const waitForTelegramInitData = async (
    attempts = TELEGRAM_INIT_DATA_ATTEMPTS,
    delayMs = TELEGRAM_INIT_DATA_DELAY_MS
  ) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const telegramInitData = window.Telegram?.WebApp?.initData || '';
      if (telegramInitData) return telegramInitData;
      await sleep(delayMs);
    }
    return '';
  };

  const tryTelegramWebAppAutoLogin = async (restaurantIdFromUrl, initDataOverride = null) => {
    const telegramInitData =
      typeof initDataOverride === 'string' && initDataOverride.trim()
        ? initDataOverride.trim()
        : await waitForTelegramInitData();
    if (!telegramInitData) return false;

    const parsedRid = Number.parseInt(String(restaurantIdFromUrl || '').trim(), 10);
    const payload = { init_data: telegramInitData };
    if (Number.isFinite(parsedRid) && parsedRid > 0) {
      payload.restaurant_id = parsedRid;
    }

    try {
      const response = await axios.post(`${API_URL}/auth/telegram-webapp-login`, payload, {
        timeout: AUTH_REQUEST_TIMEOUT_MS
      });
      const nextToken = response.data?.token;
      const nextUser = withNormalizedTheme(response.data?.user || null);
      if (!nextToken || !nextUser) return false;

      localStorage.setItem('token', nextToken);
      localStorage.setItem('active_restaurant_id', String(nextUser?.active_restaurant_id || ''));
      axios.defaults.headers.common['Authorization'] = `Bearer ${nextToken}`;
      setUser(nextUser);
      setIsBlocked(false);
      setSupportUsername(null);
      return true;
    } catch (error) {
      console.warn('Telegram WebApp auto-login skipped:', error?.response?.data?.error || error.message);
      return false;
    }
  };

  const clearSessionIfJwtRestaurantDiffersFromTelegram = async (initData) => {
    const token = localStorage.getItem('token');
    if (!token || !initData) return false;
    const jwtRid = parseRestaurantIdFromToken(token);
    if (!jwtRid) return false;
    try {
      const { data } = await axios.post(`${API_URL}/auth/telegram-webapp-resolve-restaurant`, {
        init_data: initData
      }, {
        timeout: AUTH_REQUEST_TIMEOUT_MS
      });
      const resolvedRid = data?.restaurant_id;
      if (resolvedRid === undefined || resolvedRid === null) return false;
      if (String(resolvedRid) === String(jwtRid)) return false;
      localStorage.removeItem('token');
      localStorage.removeItem('active_restaurant_id');
      delete axios.defaults.headers.common['Authorization'];
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    const effectiveTheme = user?.role === 'superadmin'
      ? 'talablar_blue'
      : user?.active_restaurant_ui_theme;
    const effectiveFontFamily = user?.active_restaurant_ui_font_family || 'sans';
    applyUiTheme(effectiveTheme, effectiveFontFamily);
  }, [user?.role, user?.active_restaurant_ui_theme, user?.active_restaurant_ui_font_family]);

  const initializeAuth = async () => {
    const loadingGuardId = window.setTimeout(() => setLoading(false), AUTH_REQUEST_TIMEOUT_MS + 2000);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token');
      const restaurantIdFromUrl = getRestaurantIdFromLocation();
      const restaurantIdFromToken = parseRestaurantIdFromToken(tokenFromUrl);
      const effectiveRestaurantId = restaurantIdFromUrl || restaurantIdFromToken;

      if (tokenFromUrl) {
        // Save token from URL and try to authenticate
        localStorage.setItem('token', tokenFromUrl);
        axios.defaults.headers.common['Authorization'] = `Bearer ${tokenFromUrl}`;

        // Remove only token from URL, keep portal/restaurant context for login page behavior
        urlParams.delete('token');
        const remainingQuery = urlParams.toString();
        const nextUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}`;
        window.history.replaceState({}, document.title, nextUrl);

        const authResult = await fetchUser({ manageLoading: false, timeoutMs: AUTH_REQUEST_TIMEOUT_MS });
        if (authResult?.unauthorized) {
          const loggedInByTelegram = await tryTelegramWebAppAutoLogin(effectiveRestaurantId);
          if (loggedInByTelegram) {
            setLoading(false);
            return;
          }
        }
        setLoading(false);
        return;
      }

      // Telegram Mini App: shared WebView localStorage keeps the last JWT; initData is tied to the current bot.
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const initSnapshot = await waitForTelegramInitData();
        if (initSnapshot) {
          for (let attempt = 0; attempt < TELEGRAM_AUTO_LOGIN_ATTEMPTS; attempt += 1) {
            if (attempt > 0) await sleep(250);
            const telegramOk = await tryTelegramWebAppAutoLogin(restaurantIdFromUrl || null, initSnapshot);
            if (telegramOk) {
              setLoading(false);
              return;
            }
          }
          const clearedStaleJwt = await clearSessionIfJwtRestaurantDiffersFromTelegram(initSnapshot);
          if (clearedStaleJwt) {
            const afterClear = await tryTelegramWebAppAutoLogin(restaurantIdFromUrl || null, initSnapshot);
            if (afterClear) {
              setLoading(false);
              return;
            }
          }
        }
      }

      // Check for existing token in localStorage
      const token = localStorage.getItem('token');
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const authResult = await fetchUser({ manageLoading: false, timeoutMs: AUTH_REQUEST_TIMEOUT_MS });
        if (authResult?.unauthorized) {
          const loggedInByTelegram = await tryTelegramWebAppAutoLogin(restaurantIdFromUrl);
          if (loggedInByTelegram) {
            setLoading(false);
            return;
          }
        }
        setLoading(false);
      } else {
        if (!window.Telegram?.WebApp) {
          const loggedInByTelegram = await tryTelegramWebAppAutoLogin(restaurantIdFromUrl);
          if (loggedInByTelegram) {
            setLoading(false);
            return;
          }
        }
        setLoading(false);
      }
    } finally {
      window.clearTimeout(loadingGuardId);
    }
  };

  const fetchUser = async ({ manageLoading = true, timeoutMs = AUTH_REQUEST_TIMEOUT_MS } = {}) => {
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        timeout: timeoutMs
      });
      const normalizedUser = withNormalizedTheme(response.data.user);
      setUser(normalizedUser);
      localStorage.setItem('active_restaurant_id', String(normalizedUser?.active_restaurant_id || ''));
      setIsBlocked(false);
      setSupportUsername(null);
      return { success: true, user: normalizedUser };
    } catch (error) {
      const status = error.response?.status;

      // Check if user is blocked
      if (status === 403 && error.response?.data?.blocked) {
        setIsBlocked(true);
        setSupportUsername(error.response.data.support_username || 'admin');
        return { success: false, blocked: true };
      }

      // Logout only when token is invalid/expired/unauthorized
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('active_restaurant_id');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
        return { success: false, unauthorized: true };
      }

      // Temporary backend/network errors should not destroy session
      console.error('fetchUser temporary error (session preserved):', error);
      return {
        success: false,
        temporary: true,
        error: error.response?.data?.error || error.message || 'Temporary auth error'
      };
    } finally {
      if (manageLoading) {
        setLoading(false);
      }
    }
  };

  const fetchUserRef = useRef(fetchUser);
  fetchUserRef.current = fetchUser;

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || (e.key !== 'token' && e.key !== 'active_restaurant_id')) return;
      if (e.storageArea !== localStorage) return;
      const token = localStorage.getItem('token');
      if (!token) return;
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserRef.current({ manageLoading: false, timeoutMs: 5000 });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    let timeoutId;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const token = localStorage.getItem('token');
        if (token) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          fetchUserRef.current({ manageLoading: false, timeoutMs: 5000 });
        }
      }, 250);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const login = async (username, password, options = {}) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username,
        password,
        portal: options.portal || '',
        restaurant_id: options.restaurantId || null,
        account_user_id: options.accountUserId || null
      });
      
      const { token, user } = response.data;
      const normalizedUser = withNormalizedTheme(user);
      localStorage.setItem('token', token);
      localStorage.setItem('active_restaurant_id', String(normalizedUser?.active_restaurant_id || ''));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(normalizedUser);
      return { success: true };
    } catch (error) {
      if (error.response?.status === 409 && error.response?.data?.requires_account_choice) {
        return {
          success: false,
          requiresAccountChoice: true,
          accounts: error.response.data.accounts || [],
          message: error.response.data.message || 'Выберите аккаунт'
        };
      }
      return {
        success: false,
        error: error.response?.data?.error || 'Ошибка входа'
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`);
    } catch (error) {
      // Ignore logout errors
    }
    localStorage.removeItem('token');
    localStorage.removeItem('active_restaurant_id');
    localStorage.removeItem('client_last_route');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  // Update active restaurant (for operators)
  const switchRestaurant = async (restaurantId) => {
    try {
      const response = await axios.post(`${API_URL}/admin/switch-restaurant`, {
        restaurant_id: restaurantId
      });
      
      setUser(prev => ({
        ...prev,
        active_restaurant_id: response.data.active_restaurant_id,
        active_restaurant_name: response.data.active_restaurant_name,
        active_restaurant_logo: response.data.active_restaurant_logo,
        active_restaurant_logo_display_mode: response.data.active_restaurant_logo_display_mode,
        active_restaurant_ui_theme: normalizeUiTheme(response.data.active_restaurant_ui_theme),
        active_restaurant_ui_font_family: normalizeUiFontFamily(response.data.active_restaurant_ui_font_family),
        active_restaurant_currency_code: response.data.active_restaurant_currency_code || prev?.active_restaurant_currency_code || 'uz'
      }));
      localStorage.setItem('active_restaurant_id', String(response.data.active_restaurant_id || ''));
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Ошибка переключения магазина'
      };
    }
  };

  // Helper to check roles
  const isSuperAdmin = () => user?.role === 'superadmin';
  const isOperator = () => user?.role === 'operator' || user?.role === 'moderator' || user?.role === 'superadmin';
  const isCustomer = () => user?.role === 'customer';

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      switchRestaurant,
      isSuperAdmin,
      isOperator,
      isCustomer,
      fetchUser,
      isBlocked,
      supportUsername
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
