import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ShowcaseContext = createContext();

export const useShowcase = () => {
  const context = useContext(ShowcaseContext);
  if (!context) {
    throw new Error('useShowcase must be used within ShowcaseProvider');
  }
  return context;
};

/**
 * Block Types:
 * - grid_3: 3 columns, small icons (like "Готовая еда" on first screenshot)
 * - grid_2: 2 columns, medium cards (like current Tandoor menu)
 * - banner: Full width banner/hero block for special offers
 * - slider: Horizontal product slider (scrollable products from a category)
 */

export const BLOCK_TYPES = {
  GRID_3: 'grid_3',
  GRID_2: 'grid_2',
  BANNER: 'banner',
  SLIDER: 'slider'
};

/**
 * Block structure:
 * {
 *   id: unique identifier,
 *   block_type: 'grid_3' | 'grid_2' | 'banner' | 'slider',
 *   title: optional title for the block,
 *   content: array of category IDs (for grid and slider blocks),
 *   category_id: category ID (for slider blocks to fetch products),
 *   settings: { ...block-specific settings },
 *   order: display order
 * }
 */

export function ShowcaseProvider({ children }) {
  const [showcaseLayout, setShowcaseLayout] = useState([]);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [showcaseError, setShowcaseError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Load showcase layout from server
  const loadShowcase = useCallback(async (restaurantId) => {
    if (!restaurantId) return;
    
    setShowcaseLoading(true);
    setShowcaseError('');
    
    try {
      const response = await axios.get(
        `${API_URL}/products/restaurant/${restaurantId}/showcase`
      );
      setShowcaseLayout(response.data?.blocks || []);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to load showcase:', error);
      setShowcaseError(error.message || 'Failed to load showcase layout');
      setShowcaseLayout([]);
    } finally {
      setShowcaseLoading(false);
    }
  }, []);

  // Save showcase layout to server
  const saveShowcase = useCallback(async (restaurantId, blocks) => {
    if (!restaurantId) return;
    
    setShowcaseError('');
    
    try {
      await axios.post(
        `${API_URL}/products/restaurant/${restaurantId}/showcase`,
        { blocks }
      );
      setShowcaseLayout(blocks);
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('Failed to save showcase:', error);
      setShowcaseError(error.message || 'Failed to save showcase layout');
      return false;
    }
  }, []);

  // Add a new block to showcase
  const addBlock = useCallback((blockType, settings = {}) => {
    const newBlock = {
      id: `block_${Date.now()}`,
      block_type: blockType,
      title: settings.title || '',
      content: settings.content || [],
      category_id: settings.category_id || null,
      settings: settings.blockSettings || {},
      order: showcaseLayout.length
    };
    
    const newLayout = [...showcaseLayout, newBlock];
    setShowcaseLayout(newLayout);
    setIsDirty(true);
    return newBlock;
  }, [showcaseLayout]);

  // Remove block from showcase
  const removeBlock = useCallback((blockId) => {
    const newLayout = showcaseLayout.filter(b => b.id !== blockId);
    setShowcaseLayout(newLayout);
    setIsDirty(true);
  }, [showcaseLayout]);

  // Update block content/settings
  const updateBlock = useCallback((blockId, updates) => {
    const newLayout = showcaseLayout.map(b =>
      b.id === blockId ? { ...b, ...updates } : b
    );
    setShowcaseLayout(newLayout);
    setIsDirty(true);
  }, [showcaseLayout]);

  // Reorder blocks (move block up or down)
  const reorderBlocks = useCallback((blockId, direction = 'down') => {
    const currentIndex = showcaseLayout.findIndex(b => b.id === blockId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= showcaseLayout.length) return;

    const newLayout = [...showcaseLayout];
    [newLayout[currentIndex], newLayout[newIndex]] = [newLayout[newIndex], newLayout[currentIndex]];
    
    // Update order numbers
    newLayout.forEach((block, idx) => {
      block.order = idx;
    });

    setShowcaseLayout(newLayout);
    setIsDirty(true);
  }, [showcaseLayout]);

  // Add category to a grid block
  const addCategoryToBlock = useCallback((blockId, categoryId) => {
    const newLayout = showcaseLayout.map(b => {
      if (b.id === blockId && (b.block_type === 'grid_3' || b.block_type === 'grid_2')) {
        return {
          ...b,
          content: b.content.includes(categoryId) ? b.content : [...b.content, categoryId]
        };
      }
      return b;
    });
    setShowcaseLayout(newLayout);
    setIsDirty(true);
  }, [showcaseLayout]);

  // Remove category from a grid block
  const removeCategoryFromBlock = useCallback((blockId, categoryId) => {
    const newLayout = showcaseLayout.map(b => {
      if (b.id === blockId && (b.block_type === 'grid_3' || b.block_type === 'grid_2')) {
        return {
          ...b,
          content: b.content.filter(id => id !== categoryId)
        };
      }
      return b;
    });
    setShowcaseLayout(newLayout);
    setIsDirty(true);
  }, [showcaseLayout]);

  // Set slider category
  const setSliderCategory = useCallback((blockId, categoryId) => {
    const newLayout = showcaseLayout.map(b => {
      if (b.id === blockId && b.block_type === 'slider') {
        return {
          ...b,
          category_id: categoryId
        };
      }
      return b;
    });
    setShowcaseLayout(newLayout);
    setIsDirty(true);
  }, [showcaseLayout]);

  // Reset showcase to default state
  const resetShowcase = useCallback(() => {
    setShowcaseLayout([]);
    setIsDirty(false);
  }, []);

  const value = {
    // State
    showcaseLayout,
    showcaseLoading,
    showcaseError,
    isDirty,
    
    // Methods
    loadShowcase,
    saveShowcase,
    addBlock,
    removeBlock,
    updateBlock,
    reorderBlocks,
    addCategoryToBlock,
    removeCategoryFromBlock,
    setSliderCategory,
    resetShowcase
  };

  return (
    <ShowcaseContext.Provider value={value}>
      {children}
    </ShowcaseContext.Provider>
  );
}
