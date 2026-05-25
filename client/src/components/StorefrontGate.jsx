import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from './SkeletonUI';

const Catalog = lazy(() => import('../pages/Catalog'));

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Публичная витрина магазина: talablar.app/<slug>
// Открывается без входа. Разрешает slug в id магазина и отдаёт его в каталог (гостевой режим).
function StorefrontGate() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ status: 'loading', restaurantId: null, botHref: '' });

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      setState({ status: 'loading', restaurantId: null, botHref: '' });
      try {
        const resolveRes = await axios.get(`${API_URL}/products/storefront-resolve/${encodeURIComponent(slug)}`);
        const restaurantId = Number(resolveRes.data?.restaurant_id);
        if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
          if (!cancelled) setState({ status: 'not_found', restaurantId: null, botHref: '' });
          return;
        }
        // Ссылка на бот магазина — для CTA «Заказать в Telegram».
        let botHref = '';
        try {
          const infoRes = await axios.get(`${API_URL}/products/restaurant/${restaurantId}`);
          const username = String(infoRes.data?.telegram_bot_username || '').trim().replace(/^@+/, '');
          if (username) botHref = `https://t.me/${username}`;
        } catch (_) { /* CTA просто не появится, не критично */ }
        if (!cancelled) setState({ status: 'ready', restaurantId, botHref });
      } catch (error) {
        if (!cancelled) {
          const code = error?.response?.status;
          setState({ status: code === 404 ? 'not_found' : 'error', restaurantId: null, botHref: '' });
        }
      }
    };
    if (slug) resolve();
    return () => { cancelled = true; };
  }, [slug]);

  // Авторизованного пользователя ведём в его обычный каталог, чтобы не смешивать режимы.
  if (user) {
    return <Navigate to="/" replace />;
  }

  if (state.status === 'loading') {
    return <PageSkeleton fullscreen label="Загрузка витрины" cards={8} />;
  }

  if (state.status === 'not_found' || state.status === 'error') {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh', padding: '20px', backgroundColor: '#f8f9fa' }}>
        <div className="text-center" style={{ maxWidth: '420px' }}>
          <div style={{ fontSize: '72px', marginBottom: '16px' }}>🔎</div>
          <h2 className="mb-3">Витрина не найдена</h2>
          <p className="text-muted mb-4">
            Магазин с таким адресом не существует или временно недоступен.
          </p>
          <a href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>На главную</a>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageSkeleton fullscreen label="Подготовка витрины" cards={8} />}>
      <Catalog publicStorefront publicRestaurantId={state.restaurantId} publicBotHref={state.botHref} />
    </Suspense>
  );
}

export default StorefrontGate;
