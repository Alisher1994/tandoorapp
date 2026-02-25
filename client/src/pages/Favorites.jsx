import React from 'react';
import { useNavigate } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import HeartIcon from '../components/HeartIcon';

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

function Favorites() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const { favorites, removeFavorite, updateFavoriteQuantity } = useFavorites();

  const getProductName = (product) => (
    language === 'uz' && product?.name_uz ? product.name_uz : product?.name_ru
  );

  const getUnitName = (product) => (
    language === 'uz' && product?.unit_uz ? product.unit_uz : product?.unit
  );

  const resolveImageUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_URL.replace('/api', '')}${url}`;
  };

  const favoritesSorted = [...favorites].sort((a, b) => {
    const aActive = Number(a.restaurant_id) === Number(user?.active_restaurant_id);
    const bActive = Number(b.restaurant_id) === Number(user?.active_restaurant_id);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
  });

  return (
    <>
      <div className="bg-white shadow-sm py-3 mb-3">
        <Container style={{ maxWidth: '600px' }}>
          <div className="d-flex align-items-center justify-content-between">
            <div style={{ width: '40px' }} />
            {user?.active_restaurant_logo ? (
              (() => {
                const logoFrame = getHeaderLogoFrame(user?.active_restaurant_logo_display_mode);
                return (
                  <div style={logoFrame.box}>
                    <img
                      src={String(user.active_restaurant_logo).startsWith('http')
                        ? user.active_restaurant_logo
                        : `${API_URL.replace('/api', '')}${user.active_restaurant_logo}`}
                      alt="Logo"
                      style={logoFrame.img}
                    />
                  </div>
                );
              })()
            ) : (
              <HeartIcon size={20} filled color="var(--primary-color)" />
            )}
            <button
              onClick={toggleLanguage}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer'
              }}
            >
              <img
                src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
                alt={language === 'ru' ? 'RU' : 'UZ'}
                style={{ width: '28px', height: '20px', objectFit: 'cover', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
              />
            </button>
          </div>
        </Container>
      </div>

      <Container className="py-2" style={{ maxWidth: '600px' }}>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0" style={{ color: '#4b3a27', fontWeight: 700 }}>
            <span className="me-2" style={{ verticalAlign: 'middle', display: 'inline-flex' }}>
              <HeartIcon size={18} filled color="var(--primary-color)" />
            </span>
            {t('favorites') || (language === 'uz' ? 'Saralanganlar' : 'Избранные')}
          </h5>
          <small className="text-muted">{favoritesSorted.length}</small>
        </div>

        {favoritesSorted.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <Card.Body className="text-center py-4">
              <div style={{ fontSize: '2rem' }} className="mb-2">🤍</div>
              <div className="fw-semibold mb-1">
                {language === 'uz' ? 'Saralanganlar bo‘sh' : 'Избранное пусто'}
              </div>
              <div className="text-muted small mb-3">
                {language === 'uz'
                  ? 'Katalogda yurakcha bosib tovarlarni saqlang'
                  : 'Нажмите на сердечко в карточке товара, чтобы сохранить'}
              </div>
              <Button variant="primary" onClick={() => navigate('/')}>
                {language === 'uz' ? 'Menyuga o‘tish' : 'Перейти в меню'}
              </Button>
            </Card.Body>
          </Card>
        ) : (
          <div className="d-flex flex-column gap-3">
            {favoritesSorted.map((item) => {
              const imageUrl = resolveImageUrl(item.thumb_url || item.image_url);
              const itemName = getProductName(item);
              const itemUnit = getUnitName(item);
              return (
                <Card key={`favorite-${item.id}`} className="border-0 shadow-sm">
                  <Card.Body className="p-3">
                    <div className="d-flex gap-3 align-items-start">
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          overflow: 'hidden',
                          background: '#f3eee4',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {imageUrl ? (
                          <img src={imageUrl} alt={itemName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ opacity: 0.5, fontSize: '1.6rem' }}>📦</span>
                        )}
                      </div>

                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              className="fw-semibold"
                              style={{
                                color: '#3a2b1b',
                                lineHeight: 1.2,
                                minHeight: '2.4em',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {itemName}
                            </div>
                            {itemUnit && (
                              <div className="small text-muted mt-1" style={{ minHeight: '1.1em' }}>{itemUnit}</div>
                            )}
                            <div className="d-flex align-items-center justify-content-between gap-2 mt-2" style={{ width: '100%' }}>
                              <div className="fw-bold" style={{ color: 'var(--primary-color)' }}>
                                {formatPrice(item.price)} {t('sum')}
                              </div>
                              <div
                                className="d-flex align-items-center rounded-pill"
                                style={{
                                  background: '#f8f2e8',
                                  border: '1px solid rgba(143, 109, 70, 0.18)',
                                  padding: '2px',
                                  minWidth: 90
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn btn-sm border-0 bg-transparent"
                                  style={{ width: 30, height: 30, lineHeight: 1, color: '#6f5538' }}
                                  onClick={() => updateFavoriteQuantity(item.id, (item.favorite_quantity || 1) - 1)}
                                >
                                  −
                                </button>
                                <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: '#3a2b1b' }}>
                                  {Math.max(1, Number(item.favorite_quantity) || 1)}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-sm border-0 bg-transparent"
                                  style={{ width: 30, height: 30, lineHeight: 1, color: 'var(--primary-color)' }}
                                  onClick={() => updateFavoriteQuantity(item.id, (item.favorite_quantity || 1) + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFavorite(item.id)}
                            className="border-0 bg-transparent p-0"
                            aria-label={language === 'uz' ? 'Saralanganlardan olib tashlash' : 'Убрать из избранного'}
                            title={language === 'uz' ? 'Saralanganlardan olib tashlash' : 'Убрать из избранного'}
                            style={{ lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <HeartIcon size={18} filled color="#de4f6f" />
                          </button>
                        </div>

                      </div>
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </div>
        )}

        <div style={{ height: '70px' }} />
      </Container>

      <BottomNav />
    </>
  );
}

export default Favorites;
