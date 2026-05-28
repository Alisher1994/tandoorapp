import React from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const resolveLogoSrc = (logoUrl) => {
  const raw = String(logoUrl || '').trim();
  if (!raw) return '/talablar.svg';
  if (raw.startsWith('http')) return raw;
  return `${API_URL.replace('/api', '')}${raw}`;
};

// Анимированный логотип магазина вместо скелетонов на витрине.
// fullscreen=true — на всё окно (вход в витрину); иначе — компактный блок в каталоге.
function StorefrontLoader({ logoUrl = '', label = '', fullscreen = false }) {
  const src = resolveLogoSrc(logoUrl);
  return (
    <div className={fullscreen ? 'storefront-loader-fullscreen' : 'storefront-loader-inline'}>
      <div className="storefront-loader-wrap">
        <div className="storefront-loader-ring" aria-hidden="true" />
        <img
          src={src}
          alt=""
          className="storefront-loader-logo"
          draggable="false"
        />
      </div>
      {label && <div className="storefront-loader-label">{label}</div>}
    </div>
  );
}

export default StorefrontLoader;
