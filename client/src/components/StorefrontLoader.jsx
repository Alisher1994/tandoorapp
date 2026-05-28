import React from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const DEFAULT_LOGO = '/favicon.svg';

const resolveLogoSrc = (logoUrl) => {
  const raw = String(logoUrl || '').trim();
  if (!raw) return DEFAULT_LOGO;
  if (raw.startsWith('http')) return raw;
  return `${API_URL.replace('/api', '')}${raw}`;
};

// Анимированный логотип магазина вместо скелетонов на витрине.
// fullscreen=true — на всё окно (вход в витрину); иначе — компактный блок в каталоге.
function StorefrontLoader({ logoUrl = '', label = '', fullscreen = false }) {
  const src = resolveLogoSrc(logoUrl);
  return (
    <div className={fullscreen ? 'storefront-loader-fullscreen' : 'storefront-loader-inline'}>
      <img
        src={src}
        alt=""
        className="storefront-loader-logo"
        draggable="false"
        onError={(e) => { if (e.currentTarget.src.indexOf(DEFAULT_LOGO) === -1) e.currentTarget.src = DEFAULT_LOGO; }}
      />
      <div className="storefront-loader-label">
        {label || 'Загрузка'}
        <span className="storefront-loader-dots" aria-hidden="true">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </div>
    </div>
  );
}

export default StorefrontLoader;
