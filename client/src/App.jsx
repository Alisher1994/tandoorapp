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

const Login = lazy(() => import('./pages/Login'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Cart = lazy(() => import('./pages/Cart'));
const Orders = lazy(() => import('./pages/Orders'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Favorites = lazy(() => import('./pages/Favorites'));
const Reservations = lazy(() => import('./pages/Reservations'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminReservations = lazy(() => import('./pages/AdminReservations'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));

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
