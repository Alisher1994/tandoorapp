import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  const { language, toggleLanguage, t } = useLanguage();
  
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const isActive = (path) => location.pathname === path;
  
  const navItems = [
    { path: '/', icon: '🏠', label: t('menu') },
    { path: '/cart', icon: '🛒', label: t('cart'), badge: cartCount },
    { path: '/orders', icon: '📋', label: t('orders') },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--surface-color)',
      borderTop: '1px solid var(--border-color)',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '8px 0 12px',
      zIndex: 1000,
      boxShadow: '0 -6px 18px rgba(0,0,0,0.08)'
    }}>
      {navItems.map((item) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            padding: '4px 16px',
            cursor: 'pointer',
            position: 'relative',
            opacity: isActive(item.path) ? 1 : 0.65,
            transform: isActive(item.path) ? 'scale(1.05)' : 'scale(1)',
            transition: 'all 0.2s'
          }}
        >
          <span style={{ fontSize: '24px', marginBottom: '2px' }}>
            {item.icon}
          </span>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: isActive(item.path) ? '600' : '400',
            color: isActive(item.path) ? 'var(--accent-color)' : 'var(--text-secondary)'
          }}>
            {item.label}
          </span>
          
          {/* Badge for cart */}
          {item.badge > 0 && (
            <span style={{
              position: 'absolute',
              top: 0,
              right: 8,
              background: 'var(--accent-color)',
              color: '#1a1a1a',
              fontSize: '10px',
              fontWeight: 'bold',
              minWidth: '18px',
              height: '18px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px'
            }}>
              {item.badge}
            </span>
          )}
        </button>
      ))}
      
      {/* Language switcher */}
      <button
        onClick={toggleLanguage}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: '4px 16px',
          cursor: 'pointer',
          opacity: 0.65,
          transition: 'all 0.2s'
        }}
      >
        <span style={{ fontSize: '24px', marginBottom: '2px' }}>
          🌐
        </span>
        <span style={{ 
          fontSize: '11px', 
          fontWeight: '600',
          color: 'var(--accent-color)'
        }}>
          {language === 'ru' ? 'UZ' : 'RU'}
        </span>
      </button>
    </nav>
  );
}

export default BottomNav;

