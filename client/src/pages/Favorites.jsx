import React from 'react';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';
import HeartIcon from '../components/HeartIcon';
import ClientEmptyState from '../components/ClientEmptyState';
import ClientTopBar from '../components/ClientTopBar';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Favorites() {
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
    <div className="client-page">
      <ClientTopBar
        logoUrl={user?.active_restaurant_logo}
        logoDisplayMode={user?.active_restaurant_logo_display_mode}
        restaurantName="Tandoor"
        language={language}
        onToggleLanguage={toggleLanguage}
        fallback={<HeartIcon size={20} filled color="var(--primary-color)" />}
        maxWidth="600px"
        sticky
      />

      <Container className="client-content client-content--narrow">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0" style={{ color: '#1f2937', fontWeight: 700 }}>
            <span className="me-2" style={{ verticalAlign: 'middle', display: 'inline-flex' }}>
              <HeartIcon size={18} filled color="var(--primary-color)" />
            </span>
            {t('favorites') || (language === 'uz' ? 'Saralanganlar' : 'Избранные')}
          </h5>
          <small className="text-muted">{favoritesSorted.length}</small>
        </div>

        {favoritesSorted.length === 0 ? (
          <ClientEmptyState
            emoji="🤍"
            message={language === 'uz' ? 'Saralanganlar bo‘sh' : 'Избранное пусто'}
          />
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
                          background: '#f1f5f9',
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
                                color: '#111827',
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
                                  background: '#f1f5f9',
                                  border: '1px solid rgba(71, 85, 105, 0.18)',
                                  padding: '2px',
                                  minWidth: 90
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn btn-sm border-0 bg-transparent"
                                  style={{ width: 30, height: 30, lineHeight: 1, color: '#4b5563' }}
                                  onClick={() => updateFavoriteQuantity(item.id, (item.favorite_quantity || 1) - 1)}
                                >
                                  −
                                </button>
                                <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: '#111827' }}>
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

        <div className="client-bottom-space" />
      </Container>

      <BottomNav />
    </div>
  );
}

export default Favorites;
