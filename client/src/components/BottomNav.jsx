import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  const { favoriteCount } = useFavorites();
  const { t } = useLanguage();
  const [isCompact, setIsCompact] = useState(false);
  const lastScrollTopRef = useRef(0);
  
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const isActive = (path) => location.pathname === path;
  
  const navItems = [
    { path: '/', icon: '🏠', label: t('menu') },
    { path: '/favorites', icon: '❤️', label: t('favorites') || 'Избранные', badge: favoriteCount },
    { path: '/cart', icon: '🛒', label: t('cart'), badge: cartCount },
    { path: '/orders', icon: '📋', label: t('orders') },
    { path: '/feedback', icon: '💬', label: t('feedback') || 'Жалобы' },
  ];

  useEffect(() => {
    setIsCompact(false);
    lastScrollTopRef.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    const rootEl = document.getElementById('root');
    const docEl = document.documentElement;

    const getScrollTop = () => Math.max(
      window.scrollY || 0,
      rootEl?.scrollTop || 0,
      docEl?.scrollTop || 0
    );

    const handleScroll = () => {
      const nextTop = getScrollTop();
      const delta = Math.abs(nextTop - lastScrollTopRef.current);

      if (nextTop > 24 && delta > 2) {
        setIsCompact(true);
      }

      lastScrollTopRef.current = nextTop;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    rootEl?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      rootEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleNavItemClick = (path) => {
    if (isCompact) {
      setIsCompact(false);
      return;
    }
    navigate(path);
  };

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
      alignItems: 'center',
      padding: isCompact ? '6px 6px' : '8px 6px 10px',
      zIndex: 1000,
      boxShadow: '0 14px 34px rgba(52, 36, 18, 0.14)',
      borderRadius: isCompact ? 16 : 20,
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      transition: 'padding 0.24s ease, border-radius 0.24s ease, box-shadow 0.24s ease',
      cursor: isCompact ? 'pointer' : 'default'
    }}
    onClick={(e) => {
      if (isCompact && e.target === e.currentTarget) {
        setIsCompact(false);
      }
    }}>
      {navItems.map((item) => (
        <button
          key={item.path}
          onClick={() => handleNavItemClick(item.path)}
          title={item.label}
          aria-label={item.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: isActive(item.path) ? 'rgba(143, 109, 70, 0.08)' : 'transparent',
            border: isActive(item.path) ? '1px solid rgba(143, 109, 70, 0.16)' : '1px solid transparent',
            borderRadius: 14,
            padding: isCompact ? '5px 10px' : '6px 14px',
            cursor: 'pointer',
            position: 'relative',
            opacity: isActive(item.path) ? 1 : 0.72,
            transform: isActive(item.path) ? 'translateY(-1px)' : 'translateY(0)',
            transition: 'all 0.24s ease',
            minWidth: isCompact ? 50 : 70
          }}
        >
          <span style={{
            fontSize: isCompact ? '18px' : '22px',
            lineHeight: 1,
            marginBottom: isCompact ? 0 : '2px',
            filter: isActive(item.path) ? 'none' : 'grayscale(0.1)'
          }}>
            {item.icon}
          </span>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: isActive(item.path) ? '600' : '400',
            color: isActive(item.path) ? 'var(--primary-color)' : 'var(--text-secondary)',
            letterSpacing: '0.02em',
            maxHeight: isCompact ? 0 : 16,
            opacity: isCompact ? 0 : 1,
            marginTop: isCompact ? 0 : 1,
            transform: `translateY(${isCompact ? -4 : 0}px)`,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-height 0.22s ease, opacity 0.18s ease, transform 0.22s ease, margin-top 0.22s ease'
          }}>
            {item.label}
          </span>
          
          {/* Badge for cart */}
          {item.badge > 0 && (
            <span style={{
              position: 'absolute',
              top: isCompact ? -2 : 0,
              right: isCompact ? 2 : 6,
              background: 'linear-gradient(135deg, #be8d56, #8f6d46)',
              color: '#fff',
              fontSize: isCompact ? '9px' : '10px',
              fontWeight: 'bold',
              minWidth: isCompact ? '16px' : '18px',
              height: isCompact ? '16px' : '18px',
              borderRadius: isCompact ? '8px' : '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isCompact ? '0 3px' : '0 4px',
              transition: 'all 0.24s ease'
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
