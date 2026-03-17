import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CLIENT_LAST_ROUTE_KEY = 'client_last_route';
const CLIENT_ROUTES = new Set(['/', '/catalog', '/cart', '/orders', '/feedback', '/favorites', '/reservations']);

const isReloadNavigation = () => {
  if (typeof window === 'undefined') return false;

  const entries = window.performance?.getEntriesByType?.('navigation');
  if (entries?.length) {
    return entries[0]?.type === 'reload';
  }

  if (window.performance?.navigation) {
    return window.performance.navigation.type === 1;
  }

  return false;
};

function ClientRoutePersistence() {
  const { user, loading, isOperator } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const restoredRef = useRef(false);
  const resolveIsOperator = () => {
    if (typeof isOperator === 'function') {
      try {
        return isOperator();
      } catch {
        return user?.role === 'operator' || user?.role === 'superadmin';
      }
    }
    return user?.role === 'operator' || user?.role === 'superadmin';
  };

  useEffect(() => {
    if (loading || !user || resolveIsOperator()) return;
    if (!CLIENT_ROUTES.has(location.pathname)) return;

    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    localStorage.setItem(CLIENT_LAST_ROUTE_KEY, fullPath);
  }, [loading, user, isOperator, location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (restoredRef.current) return;
    if (loading || !user || resolveIsOperator()) return;
    if (!isReloadNavigation()) return;

    if (location.pathname !== '/' && location.pathname !== '/catalog') return;

    const savedRoute = localStorage.getItem(CLIENT_LAST_ROUTE_KEY);
    if (!savedRoute || savedRoute === '/' || savedRoute === '/catalog') return;

    let savedPathname = savedRoute;
    try {
      savedPathname = new URL(savedRoute, window.location.origin).pathname;
    } catch {
      savedPathname = String(savedRoute).split('?')[0].split('#')[0];
    }

    if (!CLIENT_ROUTES.has(savedPathname)) return;

    restoredRef.current = true;
    navigate(savedRoute, { replace: true });
  }, [loading, user, isOperator, location.pathname, navigate]);

  return null;
}

export default ClientRoutePersistence;
