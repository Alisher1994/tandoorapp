import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const FavoritesContext = createContext();
const FAVORITES_STORAGE_KEY = 'favorites_v1';

const parseRestaurantId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getActiveRestaurantId = () => {
  try {
    return parseRestaurantId(localStorage.getItem('active_restaurant_id'));
  } catch {
    return null;
  }
};

const filterByActiveRestaurant = (items, restaurantId) => {
  if (!restaurantId) return items;
  return items.filter((item) => parseRestaurantId(item?.restaurant_id) === restaurantId);
};

const isSameFavoriteInRestaurant = (item, productId, restaurantId) => (
  Number(item?.id) === Number(productId) && parseRestaurantId(item?.restaurant_id) === restaurantId
);

const normalizeFavoriteProduct = (product) => ({
  id: product.id,
  restaurant_id: parseRestaurantId(product.restaurant_id),
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
  const [allFavorites, setAllFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeFavoriteProduct) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(allFavorites));
  }, [allFavorites]);

  const activeRestaurantId = getActiveRestaurantId();
  const favorites = filterByActiveRestaurant(allFavorites, activeRestaurantId);

  const isFavorite = (productId) => favorites.some((item) => Number(item.id) === Number(productId));

  const addFavorite = (product) => {
    const productRestaurantId = parseRestaurantId(product?.restaurant_id) || activeRestaurantId;
    setAllFavorites((prev) => {
      const existing = prev.find((item) => isSameFavoriteInRestaurant(item, product.id, productRestaurantId));
      if (existing) {
        return prev.map((item) => (
          isSameFavoriteInRestaurant(item, product.id, productRestaurantId)
            ? { ...item, ...normalizeFavoriteProduct({ ...item, ...product, restaurant_id: productRestaurantId, favorite_quantity: item.favorite_quantity }) }
            : item
        ));
      }
      return [...prev, normalizeFavoriteProduct({ ...product, restaurant_id: productRestaurantId })];
    });
  };

  const removeFavorite = (productId) => {
    setAllFavorites((prev) => prev.filter((item) => {
      if (activeRestaurantId) return !isSameFavoriteInRestaurant(item, productId, activeRestaurantId);
      return Number(item.id) !== Number(productId);
    }));
  };

  const toggleFavorite = (product) => {
    const productRestaurantId = parseRestaurantId(product?.restaurant_id) || activeRestaurantId;
    setAllFavorites((prev) => {
      const exists = prev.some((item) => isSameFavoriteInRestaurant(item, product.id, productRestaurantId));
      if (exists) {
        return prev.filter((item) => !isSameFavoriteInRestaurant(item, product.id, productRestaurantId));
      }
      return [...prev, normalizeFavoriteProduct({ ...product, restaurant_id: productRestaurantId })];
    });
  };

  const updateFavoriteQuantity = (productId, nextQuantity) => {
    setAllFavorites((prev) => prev.map((item) => (
      isSameFavoriteInRestaurant(item, productId, activeRestaurantId)
        || (!activeRestaurantId && Number(item.id) === Number(productId))
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
