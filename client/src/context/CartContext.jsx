import React, { createContext, useState, useContext, useEffect } from 'react';

const CartContext = createContext();

// Helper to format price with spaces (10 000 instead of 10000)
export function formatPrice(price) {
  return parseFloat(price).toLocaleString('ru-RU').replace(/,/g, ' ');
}

export function CartProvider({ children }) {
  // Initialize cart from localStorage
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  // Calculate cart total including container prices
  const cartTotal = cart.reduce((sum, item) => {
    const productTotal = item.price * item.quantity;
    const containerTotal = item.container_price ? (parseFloat(item.container_price) * item.quantity) : 0;
    return sum + productTotal + containerTotal;
  }, 0);
  
  // Calculate container total separately for display
  const containerTotal = cart.reduce((sum, item) => {
    return sum + (item.container_price ? (parseFloat(item.container_price) * item.quantity) : 0);
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




