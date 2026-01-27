import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const isActive = (path) => location.pathname === path;
  
  const navItems = [
    { path: '/', icon: '🏠', label: 'Меню' },
    { path: '/cart', icon: '🛒', label: 'Корзина', badge: cartCount },
    { path: '/orders', icon: '📋', label: 'Заказы' },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#fff',
      borderTop: '1px solid #eee',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '8px 0 12px',
      zIndex: 1000,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
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
            opacity: isActive(item.path) ? 1 : 0.6,
            transform: isActive(item.path) ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.2s'
          }}
        >
          <span style={{ fontSize: '24px', marginBottom: '2px' }}>
            {item.icon}
          </span>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: isActive(item.path) ? '600' : '400',
            color: isActive(item.path) ? '#0d6efd' : '#666'
          }}>
            {item.label}
          </span>
          
          {/* Badge for cart */}
          {item.badge > 0 && (
            <span style={{
              position: 'absolute',
              top: 0,
              right: 8,
              background: '#dc3545',
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

