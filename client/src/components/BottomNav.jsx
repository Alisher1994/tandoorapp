import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  const { t } = useLanguage();
  
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const isActive = (path) => location.pathname === path;
  
  const navItems = [
    { path: '/', icon: '🏠', label: t('menu') },
    { path: '/cart', icon: '🛒', label: t('cart'), badge: cartCount },
    { path: '/orders', icon: '📋', label: t('orders') },
    { path: '/feedback', icon: '💬', label: t('feedback') || 'Жалобы' },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 10,
      left: 10,
      right: 10,
      background: 'rgba(255, 250, 243, 0.88)',
      border: '1px solid rgba(143, 109, 70, 0.18)',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '8px 6px 10px',
      zIndex: 1000,
      boxShadow: '0 14px 34px rgba(52, 36, 18, 0.14)',
      borderRadius: 20,
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)'
    }}>
      {navItems.map((item) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: isActive(item.path) ? 'rgba(143, 109, 70, 0.08)' : 'transparent',
            border: isActive(item.path) ? '1px solid rgba(143, 109, 70, 0.16)' : '1px solid transparent',
            borderRadius: 14,
            padding: '6px 14px',
            cursor: 'pointer',
            position: 'relative',
            opacity: isActive(item.path) ? 1 : 0.72,
            transform: isActive(item.path) ? 'translateY(-1px)' : 'translateY(0)',
            transition: 'all 0.2s ease',
            minWidth: 70
          }}
        >
          <span style={{
            fontSize: '22px',
            marginBottom: '2px',
            filter: isActive(item.path) ? 'none' : 'grayscale(0.1)'
          }}>
            {item.icon}
          </span>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: isActive(item.path) ? '600' : '400',
            color: isActive(item.path) ? 'var(--primary-color)' : 'var(--text-secondary)',
            letterSpacing: '0.02em'
          }}>
            {item.label}
          </span>
          
          {/* Badge for cart */}
          {item.badge > 0 && (
            <span style={{
              position: 'absolute',
              top: 0,
              right: 6,
              background: 'linear-gradient(135deg, #be8d56, #8f6d46)',
              color: '#fff',
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
    </nav>
  );
}

export default BottomNav;
