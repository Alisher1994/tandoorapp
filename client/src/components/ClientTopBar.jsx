import React from 'react';
import Container from 'react-bootstrap/Container';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaderLogoFrame = (mode, squareSize = 36, horizontalWidth = 112) => {
  const isHorizontal = String(mode || '').toLowerCase() === 'horizontal';
  return {
    box: {
      width: isHorizontal ? `${horizontalWidth}px` : `${squareSize}px`,
      height: `${squareSize}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    img: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      borderRadius: '8px'
    }
  };
};

const resolveLogoUrl = (logoUrl) => {
  if (!logoUrl) return '';
  return String(logoUrl).startsWith('http') ? logoUrl : `${API_URL.replace('/api', '')}${logoUrl}`;
};

function ClientTopBar({
  logoUrl = '',
  logoDisplayMode = 'square',
  restaurantName = 'Logo',
  language = 'ru',
  onToggleLanguage = () => {},
  onBack = null,
  showBackButton = false,
  fallback = '🏪',
  maxWidth = '600px',
  sticky = false
}) {
  const frame = getHeaderLogoFrame(logoDisplayMode);
  const logoSrc = resolveLogoUrl(logoUrl);

  return (
    <header className={`client-topbar ${sticky ? 'is-sticky' : ''}`}>
      <Container className="client-topbar-inner" style={{ maxWidth }}>
        <div className="client-topbar-side">
          {showBackButton ? (
            <button
              type="button"
              className="client-topbar-back-btn"
              onClick={onBack}
              aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
              title={language === 'uz' ? 'Orqaga' : 'Назад'}
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : (
            <span className="client-topbar-spacer" aria-hidden="true" />
          )}
        </div>

        <div className="client-topbar-brand" aria-label={restaurantName}>
          {logoSrc ? (
            <div style={frame.box}>
              <img src={logoSrc} alt={restaurantName} style={frame.img} />
            </div>
          ) : (
            <span className="client-topbar-fallback">{fallback}</span>
          )}
        </div>

        <div className="client-topbar-side client-topbar-side--right">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="client-language-toggle"
            aria-label={language === 'ru' ? 'Switch to Uzbek' : 'Переключить на русский'}
            title={language === 'ru' ? 'Ўзбекча' : 'Русский'}
          >
            <span className="client-language-code">{language === 'ru' ? 'RU' : 'UZ'}</span>
            <img
              src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
              alt={language === 'ru' ? 'RU' : 'UZ'}
              className="client-language-flag"
            />
          </button>
        </div>
      </Container>
    </header>
  );
}

export default ClientTopBar;
