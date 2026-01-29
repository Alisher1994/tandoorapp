import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [supportUsername, setSupportUsername] = useState(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    // Check for token in URL first (auto-login from Telegram)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
      // Save token from URL and try to authenticate
      localStorage.setItem('token', tokenFromUrl);
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokenFromUrl}`;
      
      // Remove token from URL to clean up
      window.history.replaceState({}, document.title, window.location.pathname);
      
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
      setUser(response.data.user);
      setIsBlocked(false);
    } catch (error) {
      // Check if user is blocked
      if (error.response?.status === 403 && error.response?.data?.blocked) {
        setIsBlocked(true);
        setSupportUsername(error.response.data.support_username || 'admin');
      } else {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username,
        password
      });
      
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      return { success: true };
    } catch (error) {
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
        active_restaurant_logo: response.data.active_restaurant_logo
      }));
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Ошибка переключения ресторана'
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
