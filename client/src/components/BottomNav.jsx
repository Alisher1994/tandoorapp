import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useCart, formatQuantity } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useShowcase } from '../context/ShowcaseContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showcaseVisible, loadShowcase } = useShowcase();
  const { cart } = useCart();
  const { favoriteCount } = useFavorites();
  const { t } = useLanguage();
  const [isCompact, setIsCompact] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isReservationMenuVisible, setIsReservationMenuVisible] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth >= 992 : false
  ));
  const lastScrollTopRef = useRef(0);
  
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname === '/showcase/catalog';
    }
    return location.pathname === path;
  };

  useEffect(() => {
    let ignore = false;
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) {
      setIsReservationMenuVisible(false);
      return () => { ignore = true; };
    }

    (async () => {
      try {
        const response = await axios.get(`${API_URL}/products/restaurant/${restaurantId}`);
        if (ignore) return;
        setIsReservationMenuVisible(response.data?.reservation_enabled === true);
      } catch (error) {
        if (ignore) return;
        setIsReservationMenuVisible(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [user?.active_restaurant_id]);

  useEffect(() => {
    const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);
    if (!restaurantId) return;
    loadShowcase(restaurantId);
  }, [user?.active_restaurant_id, loadShowcase]);
  
  const navItems = [
    ...(showcaseVisible ? [{ path: '/', icon: '🛍️', label: t('showcase') || 'Витрина' }] : []),
    { path: '/catalog', icon: '📋', label: t('menu') || 'Меню' },
    { path: '/menu2', icon: '🆕', label: 'Меню2' },
    { path: '/favorites', icon: '❤️', label: t('favorites') || 'Избранные', badge: favoriteCount },
    { path: '/cart', icon: '🛒', label: t('cart'), badge: cartCount },
    ...(isReservationMenuVisible ? [{ path: '/reservations', icon: '🪑', label: t('reservations') || 'Бронь' }] : []),
  ];

  useEffect(() => {
    const ua = navigator.userAgent || '';
    setIsIOSDevice(/iPhone|iPad|iPod/i.test(ua));
  }, []);

  useEffect(() => {
    const handleResize = () => setIsDesktopViewport(window.innerWidth >= 992);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setIsCompact(false);
    lastScrollTopRef.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    if (showcaseVisible) return;
    if (location.pathname === '/' || location.pathname === '/showcase/catalog') {
      navigate('/catalog', { replace: true });
    }
  }, [showcaseVisible, location.pathname, navigate]);

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
    }
    navigate(path);
  };

  const navClassName = [
    'client-bottom-nav',
    isCompact ? 'is-compact' : '',
    isIOSDevice ? 'is-ios' : '',
    isDesktopViewport ? 'is-desktop' : ''
  ].filter(Boolean).join(' ');

  return (
    <nav
      className={navClassName}
      onClick={(e) => {
        if (isCompact && e.target === e.currentTarget) {
          setIsCompact(false);
        }
      }}
    >
      {navItems.map((item) => (
        <button
          key={item.path}
          onClick={() => handleNavItemClick(item.path)}
          title={item.label}
          aria-label={item.label}
          className={[
            'client-bottom-nav-item',
            isActive(item.path) ? 'is-active' : '',
            isCompact ? 'is-compact' : ''
          ].filter(Boolean).join(' ')}
        >
          <span className="client-bottom-nav-icon">
            {item.icon}
          </span>
          <span className="client-bottom-nav-label">
            {item.label}
          </span>

          {item.badge > 0 && (
            <span className="client-bottom-nav-badge">
              {typeof item.badge === 'number' ? formatQuantity(item.badge) : item.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
