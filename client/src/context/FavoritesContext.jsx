import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const FavoritesContext = createContext();
const FAVORITES_STORAGE_KEY = 'favorites_v1';

const normalizeFavoriteProduct = (product) => ({
  id: product.id,
  restaurant_id: product.restaurant_id ?? null,
  name_ru: product.name_ru || '',
  name_uz: product.name_uz || '',
  unit: product.unit || '',
  unit_uz: product.unit_uz || '',
  price: Number(product.price) || 0,
  image_url: product.image_url || '',
  thumb_url: product.thumb_url || '',
  in_stock: product.in_stock !== false,
  favorite_quantity: Math.max(1, Number(product.favorite_quantity) || 1)
});

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeFavoriteProduct) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const isFavorite = (productId) => favorites.some((item) => Number(item.id) === Number(productId));

  const addFavorite = (product) => {
    setFavorites((prev) => {
      const existing = prev.find((item) => Number(item.id) === Number(product.id));
      if (existing) {
        return prev.map((item) => (
          Number(item.id) === Number(product.id)
            ? { ...item, ...normalizeFavoriteProduct({ ...item, ...product, favorite_quantity: item.favorite_quantity }) }
            : item
        ));
      }
      return [...prev, normalizeFavoriteProduct(product)];
    });
  };

  const removeFavorite = (productId) => {
    setFavorites((prev) => prev.filter((item) => Number(item.id) !== Number(productId)));
  };

  const toggleFavorite = (product) => {
    setFavorites((prev) => {
      const exists = prev.some((item) => Number(item.id) === Number(product.id));
      if (exists) {
        return prev.filter((item) => Number(item.id) !== Number(product.id));
      }
      return [...prev, normalizeFavoriteProduct(product)];
    });
  };

  const updateFavoriteQuantity = (productId, nextQuantity) => {
    setFavorites((prev) => prev.map((item) => (
      Number(item.id) === Number(productId)
        ? { ...item, favorite_quantity: Math.max(1, Number(nextQuantity) || 1) }
        : item
    )));
  };

  const favoriteCount = favorites.length;

  const value = useMemo(() => ({
    favorites,
    favoriteCount,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    updateFavoriteQuantity
  }), [favorites, favoriteCount]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}

