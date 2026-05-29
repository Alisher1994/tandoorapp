import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import StorefrontLoader from './StorefrontLoader';

const Catalog = lazy(() => import('../pages/Catalog'));

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Сдвиг яркости hex-цвета (percent<0 — темнее, >0 — светлее) для derived оттенков.
const shadeHex = (hex, percent) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const t = percent < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(percent) / 100);
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return { r, g, b, hex: `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}` };
};

// Применяет кастомный основной цвет магазина поверх темы (фон темы не трогаем).
// Пустой/невалидный цвет => снимаем оверрайды, остаётся стоковый цвет темы.
const applyStorePrimaryColor = (color) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const overrideVars = ['--primary-color', '--primary-dark', '--primary-light', '--bs-primary', '--bs-primary-rgb'];
  const base = shadeHex(color, 0);
  if (!base) {
    overrideVars.forEach((v) => root.style.removeProperty(v));
    return;
  }
  const dark = shadeHex(color, -16) || base;
  const light = shadeHex(color, 16) || base;
  root.style.setProperty('--primary-color', base.hex);
  root.style.setProperty('--primary-dark', dark.hex);
  root.style.setProperty('--primary-light', light.hex);
  root.style.setProperty('--bs-primary', base.hex);
  root.style.setProperty('--bs-primary-rgb', `${base.r}, ${base.g}, ${base.b}`);
};

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
          applyStorePrimaryColor(resolveRes.data?.ui_primary_color);
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
            is_pickup_enabled: infoRes.data?.is_pickup_enabled !== false,
            currency_code: infoRes.data?.currency_code || 'uz',
            cash_enabled: infoRes.data?.cash_enabled !== false,
            card_payment_enabled: infoRes.data?.card_payment_enabled === true,
            card_payment_title: String(infoRes.data?.card_payment_title || '').trim(),
            card_payment_number: String(infoRes.data?.card_payment_number || '').trim(),
            card_payment_holder: String(infoRes.data?.card_payment_holder || '').trim(),
            click_enabled: Boolean(String(infoRes.data?.click_url || '').trim()),
            payme_enabled: infoRes.data?.payme_enabled === true,
            promo_codes_enabled: infoRes.data?.promo_codes_enabled === true,
            is_scheduled_date_delivery_enabled: infoRes.data?.is_scheduled_date_delivery_enabled === true,
            scheduled_delivery_max_days: Math.max(1, Math.trunc(Number(infoRes.data?.scheduled_delivery_max_days) || 7)),
            delivery_lead_enabled: infoRes.data?.delivery_lead_enabled === true,
            delivery_lead_days: Math.max(1, Math.trunc(Number(infoRes.data?.delivery_lead_days) || 1)),
            ui_theme: String(infoRes.data?.ui_theme || 'classic').trim().toLowerCase(),
            ui_font_family: String(infoRes.data?.ui_font_family || 'sans').trim().toLowerCase(),
            logo_url: String(infoRes.data?.logo_url || '').trim()
          };
          // Применяем стиль/шрифт магазина к корню документа, чтобы CSS-переменные подхватились.
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-ui-theme', meta.ui_theme);
            document.documentElement.setAttribute('data-ui-font', meta.ui_font_family);
            applyStorePrimaryColor(infoRes.data?.ui_primary_color);
          }
        } catch (_) { /* CTA просто не появится, не критично */ }
        if (!cancelled) setState({ status: 'ready', restaurantId, botHref, meta, logoUrl: meta?.logo_url || earlyLogo });
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
