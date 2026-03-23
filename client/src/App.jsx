import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { LanguageProvider } from './context/LanguageContext';
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
const Catalog = lazyWithRetry(() => import('./pages/Catalog'), 'catalog');
const Cart = lazyWithRetry(() => import('./pages/Cart'), 'cart');
const Orders = lazyWithRetry(() => import('./pages/Orders'), 'orders');
const Feedback = lazyWithRetry(() => import('./pages/Feedback'), 'feedback');
const Favorites = lazyWithRetry(() => import('./pages/Favorites'), 'favorites');
const Reservations = lazyWithRetry(() => import('./pages/Reservations'), 'reservations');
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'), 'admin-dashboard');
const AdminReservations = lazyWithRetry(() => import('./pages/AdminReservations'), 'admin-reservations');
const OperatorQuickProducts = lazyWithRetry(() => import('./pages/OperatorQuickProducts'), 'operator-quick-products');
const SuperAdminDashboard = lazyWithRetry(() => import('./pages/SuperAdminDashboard'), 'superadmin-dashboard');
const TelegramStoreRegistration = lazyWithRetry(() => import('./pages/TelegramStoreRegistration'), 'tg-store-registration');

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <FavoritesProvider>
            <AppVersionWatcher />
            <ClientRoutePersistence />
            <Suspense fallback={(
              <PageSkeleton fullscreen label="Загрузка приложения" cards={8} />
            )}
            >
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/webapp/store-registration" element={<TelegramStoreRegistration />} />
                <Route path="/catalog" element={<CatalogGate />} />
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <Catalog />
                    </PrivateRoute>
                  }
                />
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
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
