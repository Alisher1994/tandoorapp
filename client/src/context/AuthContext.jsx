import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || '/api';
const normalizeUiTheme = (value) => (String(value || '').toLowerCase() === 'modern' ? 'modern' : 'classic');
const withNormalizedTheme = (nextUser) => (
  nextUser
    ? { ...nextUser, active_restaurant_ui_theme: normalizeUiTheme(nextUser.active_restaurant_ui_theme) }
    : nextUser
);
const applyUiTheme = (theme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-theme', normalizeUiTheme(theme));
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [supportUsername, setSupportUsername] = useState(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    applyUiTheme(user?.active_restaurant_ui_theme);
  }, [user?.active_restaurant_ui_theme]);

  const initializeAuth = async () => {
    // Check for token in URL first (auto-login from Telegram)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
      // Save token from URL and try to authenticate
      localStorage.setItem('token', tokenFromUrl);
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokenFromUrl}`;
      
      // Remove only token from URL, keep portal/restaurant context for login page behavior
      urlParams.delete('token');
      const remainingQuery = urlParams.toString();
      const nextUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}`;
      window.history.replaceState({}, document.title, nextUrl);
      
      await fetchUser();
      return;
    }
    
    // Check for existing token in localStorage
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      await fetchUser();
    } else {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/me`);
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
      setLoading(false);
    }
  };

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
        active_restaurant_ui_theme: normalizeUiTheme(response.data.active_restaurant_ui_theme)
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
  const isOperator = () => user?.role === 'operator' || user?.role === 'superadmin';
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
