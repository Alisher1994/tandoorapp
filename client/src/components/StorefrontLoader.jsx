import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const resolveLogoSrc = (logoUrl) => {
  const raw = String(logoUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  return `${API_URL.replace('/api', '')}${raw}`;
};

// Анимированный логотип магазина вместо скелетонов на витрине.
// Талаблар-логотип НЕ показываем: если у магазина нет logo_url или картинка не загрузилась —
// рендерим только подпись с прыгающими точками, без какого-либо системного изображения.
// fullscreen=true — на всё окно (вход в витрину); иначе — компактный блок в каталоге.
function StorefrontLoader({ logoUrl = '', label = '', fullscreen = false }) {
  const src = resolveLogoSrc(logoUrl);
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(src) && !failed;
  return (
    <div className={fullscreen ? 'storefront-loader-fullscreen' : 'storefront-loader-inline'}>
      {showLogo && (
        <img
          src={src}
          alt=""
          className="storefront-loader-logo"
          draggable="false"
          onError={() => setFailed(true)}
        />
      )}
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
