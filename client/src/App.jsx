import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { LanguageProvider } from './context/LanguageContext';
import { ShowcaseProvider } from './context/ShowcaseContext';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import SuperAdminRoute from './components/SuperAdminRoute';
import CatalogGate from './components/CatalogGate';
import AppVersionWatcher from './components/AppVersionWatcher';
import ClientRoutePersistence from './components/ClientRoutePersistence';
import { PageSkeleton } from './components/SkeletonUI';

const lazyWithRetry = (importer, chunkName) => lazy(async () => {
  try {
    return await importer();
  } catch (error) {
    const message = String(error?.message || '');
    const isChunkLoadError = /ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);

    if (typeof window !== 'undefined' && isChunkLoadError) {
      const reloadKey = `lazy-retry:${chunkName}`;
      if (!window.sessionStorage.getItem(reloadKey)) {
        window.sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return new Promise(() => {});
      }
    }

    throw error;
  }
});

const Login = lazyWithRetry(() => import('./pages/Login'), 'login');
const ShowcaseDisplay = lazyWithRetry(() => import('./pages/ShowcaseDisplay'), 'showcase-display');
const Catalog = lazyWithRetry(() => import('./pages/Catalog'), 'catalog');
const Cart = lazyWithRetry(() => import('./pages/Cart'), 'cart');
const Orders = lazyWithRetry(() => import('./pages/Orders'), 'orders');
const Feedback = lazyWithRetry(() => import('./pages/Feedback'), 'feedback');
const Favorites = lazyWithRetry(() => import('./pages/Favorites'), 'favorites');
const Reservations = lazyWithRetry(() => import('./pages/Reservations'), 'reservations');
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'), 'admin-dashboard');
const AdminReservations = lazyWithRetry(() => import('./pages/AdminReservations'), 'admin-reservations');
const OperatorQuickProducts = lazyWithRetry(() => import('./pages/OperatorQuickProducts'), 'operator-quick-products');
const ShowcaseBuilder = lazyWithRetry(() => import('./pages/ShowcaseBuilder'), 'showcase-builder');
const SuperAdminDashboard = lazyWithRetry(() => import('./pages/SuperAdminDashboard'), 'superadmin-dashboard');
const TelegramStoreRegistration = lazyWithRetry(() => import('./pages/TelegramStoreRegistration'), 'tg-store-registration');
const Menu2 = lazyWithRetry(() => import('./pages/Menu2'), 'menu2');

function RoutePrefetcher() {
  const { user, loading } = useAuth();
  const prefetchedRef = useRef(new Set());

  useEffect(() => {
    if (loading || !user) return undefined;
    if (typeof window === 'undefined') return undefined;

    const connection = window.navigator?.connection;
    if (connection?.saveData) return undefined;

    const role = String(user?.role || '');
    const tasks = [];

    if (role === 'superadmin') {
      tasks.push(
        { key: 'admin-dashboard', load: () => import('./pages/AdminDashboard') },
        { key: 'superadmin-dashboard', load: () => import('./pages/SuperAdminDashboard') }
      );
    } else if (role === 'operator') {
      tasks.push(
        { key: 'admin-dashboard', load: () => import('./pages/AdminDashboard') },
        { key: 'admin-reservations', load: () => import('./pages/AdminReservations') },
        { key: 'operator-quick-products', load: () => import('./pages/OperatorQuickProducts') },
        { key: 'showcase-builder', load: () => import('./pages/ShowcaseBuilder') }
      );
    } else {
      tasks.push(
        { key: 'cart', load: () => import('./pages/Cart') },
        { key: 'orders', load: () => import('./pages/Orders') },
        { key: 'favorites', load: () => import('./pages/Favorites') },
        { key: 'feedback', load: () => import('./pages/Feedback') }
      );
    }

    const pending = tasks.filter((task) => !prefetchedRef.current.has(task.key));
    if (pending.length === 0) return undefined;

    const runPrefetch = () => {
      pending.forEach((task) => {
        prefetchedRef.current.add(task.key);
        task.load().catch(() => {
          prefetchedRef.current.delete(task.key);
        });
      });
    };

    let timeoutId = null;
    let idleId = null;

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(runPrefetch, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(runPrefetch, 900);
    }

    return () => {
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [loading, user?.id, user?.role]);

  return null;
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <FavoritesProvider>
            <ShowcaseProvider>
              <AppVersionWatcher />
              <ClientRoutePersistence />
              <RoutePrefetcher />
              <Suspense fallback={(
                <PageSkeleton fullscreen label="Загрузка приложения" cards={8} />
              )}
              >
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/webapp/store-registration" element={<TelegramStoreRegistration />} />
                  <Route
                    path="/"
                    element={
                      <PrivateRoute>
                        <ShowcaseDisplay />
                      </PrivateRoute>
                    }
                  />
                  <Route path="/catalog" element={<CatalogGate />} />
                  <Route path="/menu2" element={<Menu2 />} />
                  <Route path="/showcase/catalog" element={<CatalogGate />} />
                  <Route
                    path="/cart"
                    element={
                      <PrivateRoute>
                        <Cart />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/orders"
                    element={
                      <PrivateRoute>
                        <Orders />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/feedback"
                    element={
                      <PrivateRoute>
                        <Feedback />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/favorites"
                    element={
                      <PrivateRoute>
                        <Favorites />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/reservations"
                    element={
                      <PrivateRoute>
                        <Reservations />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminDashboard />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/admin/reservations"
                    element={
                      <AdminRoute>
                        <AdminReservations />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/admin/showcase"
                    element={
                      <AdminRoute>
                        <ShowcaseBuilder />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/webapp/operator-products"
                    element={
                      <AdminRoute>
                        <OperatorQuickProducts />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/superadmin"
                    element={
                      <SuperAdminRoute>
                        <SuperAdminDashboard />
                      </SuperAdminRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ShowcaseProvider>
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
