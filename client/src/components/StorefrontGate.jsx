import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import StorefrontLoader from './StorefrontLoader';

const Catalog = lazy(() => import('../pages/Catalog'));

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Публичная витрина магазина: talablar.app/<slug>
// Открывается без входа. Разрешает slug в id магазина и отдаёт его в каталог (гостевой режим).
function StorefrontGate() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', restaurantId: null, botHref: '', meta: null, logoUrl: '' });

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      setState({ status: 'loading', restaurantId: null, botHref: '', meta: null, logoUrl: '' });
      try {
        const resolveRes = await axios.get(`${API_URL}/products/storefront-resolve/${encodeURIComponent(slug)}`);
        const restaurantId = Number(resolveRes.data?.restaurant_id);
        if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
          if (!cancelled) setState({ status: 'not_found', restaurantId: null, botHref: '', meta: null, logoUrl: '' });
          return;
        }
        // Логотип и тему получаем уже из resolve — показываем магазин в лоадере, пока качается остальная инфа.
        const earlyLogo = String(resolveRes.data?.logo_url || '').trim();
        const earlyTheme = String(resolveRes.data?.ui_theme || 'classic').trim().toLowerCase();
        const earlyFont = String(resolveRes.data?.ui_font_family || 'sans').trim().toLowerCase();
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-ui-theme', earlyTheme);
          document.documentElement.setAttribute('data-ui-font', earlyFont);
        }
        if (!cancelled) {
          setState((prev) => ({ ...prev, restaurantId, logoUrl: earlyLogo }));
        }
        // Ссылка на бот магазина + публичные настройки (сервис/доставка) для модалки оформления.
        let botHref = '';
        let meta = null;
        try {
          const infoRes = await axios.get(`${API_URL}/products/restaurant/${restaurantId}`);
          const username = String(infoRes.data?.telegram_bot_username || '').trim().replace(/^@+/, '');
          if (username) botHref = `https://t.me/${username}`;
          meta = {
            service_fee: Number(infoRes.data?.service_fee) || 0,
            is_delivery_enabled: infoRes.data?.is_delivery_enabled !== false,
            currency_code: infoRes.data?.currency_code || 'uz',
            cash_enabled: infoRes.data?.cash_enabled !== false,
            card_payment_enabled: infoRes.data?.card_payment_enabled === true,
            click_enabled: Boolean(String(infoRes.data?.click_url || '').trim()),
            payme_enabled: infoRes.data?.payme_enabled === true,
            promo_codes_enabled: infoRes.data?.promo_codes_enabled === true,
            is_scheduled_date_delivery_enabled: infoRes.data?.is_scheduled_date_delivery_enabled === true,
            scheduled_delivery_max_days: Math.max(1, Math.trunc(Number(infoRes.data?.scheduled_delivery_max_days) || 7)),
            ui_theme: String(infoRes.data?.ui_theme || 'classic').trim().toLowerCase(),
            ui_font_family: String(infoRes.data?.ui_font_family || 'sans').trim().toLowerCase(),
            logo_url: String(infoRes.data?.logo_url || '').trim()
          };
          // Применяем стиль/шрифт магазина к корню документа, чтобы CSS-переменные подхватились.
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-ui-theme', meta.ui_theme);
            document.documentElement.setAttribute('data-ui-font', meta.ui_font_family);
          }
        } catch (_) { /* CTA просто не появится, не критично */ }
        if (!cancelled) setState({ status: 'ready', restaurantId, botHref, meta, logoUrl: meta?.logo_url || '' });
      } catch (error) {
        if (!cancelled) {
          const code = error?.response?.status;
          setState({ status: code === 404 ? 'not_found' : 'error', restaurantId: null, botHref: '', meta: null, logoUrl: '' });
        }
      }
    };
    if (slug) resolve();
    return () => { cancelled = true; };
  }, [slug]);

  if (state.status === 'loading') {
    // Если успели получить логотип магазина из resolve — показываем его, иначе дефолтный.
    return <StorefrontLoader fullscreen logoUrl={state.logoUrl} label="Загрузка" />;
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
    <Suspense fallback={<StorefrontLoader fullscreen logoUrl={state.logoUrl} label="Загрузка" />}>
      <Catalog publicStorefront publicRestaurantId={state.restaurantId} publicBotHref={state.botHref} publicRestaurantMeta={state.meta} />
    </Suspense>
  );
}

export default StorefrontGate;
