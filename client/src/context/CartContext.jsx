import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';

const CartContext = createContext();
const CART_STORAGE_KEY = 'cart';

function parseRestaurantId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getActiveRestaurantId() {
  try {
    return parseRestaurantId(localStorage.getItem('active_restaurant_id'));
  } catch {
    return null;
  }
}

function normalizeCartItem(item) {
  return {
    ...item,
    id: Number(item?.id),
    quantity: Math.max(1, Number(item?.quantity) || 1),
    restaurant_id: parseRestaurantId(item?.restaurant_id)
  };
}

function isSameProductInRestaurant(item, productId, restaurantId) {
  return Number(item?.id) === Number(productId) && parseRestaurantId(item?.restaurant_id) === restaurantId;
}

function filterCartByRestaurant(allItems, restaurantId) {
  if (!restaurantId) return [];
  return allItems.filter((item) => parseRestaurantId(item?.restaurant_id) === restaurantId);
}

function parsePriceValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const trimmed = value.replace(/\u00A0/g, ' ').trim();
  if (!trimmed) return 0;

  // Handle values like "120 999 98" from old broken formatter -> "120999.98"
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (!trimmed.includes(',') && parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]) && parts[parts.length - 1].length === 2) {
    const normalized = `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
    const parsedLegacy = Number.parseFloat(normalized);
    if (Number.isFinite(parsedLegacy)) return parsedLegacy;
  }

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeContainerNorm(value, fallback = 1) {
  const parsed = parsePriceValue(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveContainerUnits(quantityValue, normValue) {
  const quantity = Number(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const norm = normalizeContainerNorm(normValue, 1);
  return Math.ceil(quantity / norm);
}

// Helper to format price with grouping and correct decimal separator
export function formatPrice(price) {
  const numeric = parsePriceValue(price);
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.0000001;

  return rounded
    .toLocaleString('ru-RU', {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2
    })
    .replace(/\u00A0/g, ' ');
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  // Initialize cart from localStorage
  const [allCartItems, setAllCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeCartItem) : [];
    } catch {
      return [];
    }
  });

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(allCartItems));
  }, [allCartItems]);

  const activeRestaurantId = parseRestaurantId(user?.active_restaurant_id) || getActiveRestaurantId();
  const cart = filterCartByRestaurant(allCartItems, activeRestaurantId);

  const addToCart = (product, quantityToAdd = 1) => {
    const safeQty = Math.max(1, Number(quantityToAdd) || 1);
    const productRestaurantId = parseRestaurantId(product?.restaurant_id) || activeRestaurantId;
    setAllCartItems((prevCart) => {
      const existingItem = prevCart.find((item) => isSameProductInRestaurant(item, product.id, productRestaurantId));
      
      if (existingItem) {
        return prevCart.map((item) =>
          isSameProductInRestaurant(item, product.id, productRestaurantId)
            ? { ...item, quantity: item.quantity + safeQty }
            : item
        );
      }
      
      return [...prevCart, normalizeCartItem({ ...product, restaurant_id: productRestaurantId, quantity: safeQty })];
    });
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    if (!activeRestaurantId) return;
    
    setAllCartItems((prevCart) =>
      prevCart.map((item) =>
        isSameProductInRestaurant(item, productId, activeRestaurantId)
          ? { ...item, quantity }
          : item
      )
    );
  };

  const removeFromCart = (productId) => {
    if (!activeRestaurantId) return;
    setAllCartItems((prevCart) => prevCart.filter((item) => {
      const inActiveRestaurant = isSameProductInRestaurant(item, productId, activeRestaurantId);
      return !inActiveRestaurant;
    }));
  };

  const clearCart = () => {
    if (!activeRestaurantId) return;
    setAllCartItems((prevCart) => prevCart.filter((item) => parseRestaurantId(item?.restaurant_id) !== activeRestaurantId));
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  // Calculate cart total including container prices
  const cartTotal = cart.reduce((sum, item) => {
    const productTotal = item.price * item.quantity;
    const containerUnits = resolveContainerUnits(item.quantity, item.container_norm);
    const containerTotal = item.container_price ? (parseFloat(item.container_price) * containerUnits) : 0;
    return sum + productTotal + containerTotal;
  }, 0);
  
  // Calculate container total separately for display
  const containerTotal = cart.reduce((sum, item) => {
    const containerUnits = resolveContainerUnits(item.quantity, item.container_norm);
    return sum + (item.container_price ? (parseFloat(item.container_price) * containerUnits) : 0);
  }, 0);
  
  // Calculate product total without containers
  const productTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        cartCount,
        cartTotal,
        productTotal,
        containerTotal,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}




