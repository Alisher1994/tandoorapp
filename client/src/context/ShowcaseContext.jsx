import React, { createContext, useContext, useState, useCallback } from 'react';
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

const VALID_BLOCK_TYPES = new Set(Object.values(BLOCK_TYPES));
const BLOCK_TYPE_ALIASES = Object.freeze({
  product_slider: BLOCK_TYPES.SLIDER
});
const DEFAULT_GRID_LIMITS = Object.freeze({
  [BLOCK_TYPES.GRID_3]: 3,
  [BLOCK_TYPES.GRID_2]: 2
});

const normalizeCategoryId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeBlockType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const alias = BLOCK_TYPE_ALIASES[normalized];
  if (alias) return alias;
  return VALID_BLOCK_TYPES.has(normalized) ? normalized : BLOCK_TYPES.GRID_3;
};

const normalizePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeBooleanLike = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return false;
};

const isUnlimitedGridSettings = (settings = {}) => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  return normalizeBooleanLike(
    settings.unlimitedRows
      ?? settings.unlimited_rows
      ?? settings.isUnlimited
      ?? settings.is_unlimited
      ?? false
  );
};

const getGridCategoryLimit = (blockType, settings = {}) => {
  if (!(blockType === BLOCK_TYPES.GRID_3 || blockType === BLOCK_TYPES.GRID_2)) return null;
  if (isUnlimitedGridSettings(settings)) return null;

  const explicitLimit = normalizePositiveInt(settings?.maxCategories);
  if (explicitLimit) return explicitLimit;

  return DEFAULT_GRID_LIMITS[blockType] || null;
};

const pickLegacySettings = (raw = {}) => {
  const result = { ...raw };
  delete result.id;
  delete result.block_type;
  delete result.title;
  delete result.content;
  delete result.category_id;
  delete result.categoryId;
  delete result.order;
  return result;
};

const normalizeBlockSettingsInput = (rawInput = {}) => {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return {};

  const nestedSettings = rawInput.settings;
  if (nestedSettings && typeof nestedSettings === 'object' && !Array.isArray(nestedSettings)) {
    return { ...nestedSettings };
  }

  const blockSettings = rawInput.blockSettings;
  if (blockSettings && typeof blockSettings === 'object' && !Array.isArray(blockSettings)) {
    return { ...blockSettings };
  }

  return pickLegacySettings(rawInput);
};

const normalizeShowcaseBlock = (rawBlock, index = 0) => {
  if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return null;

  const blockType = normalizeBlockType(rawBlock.block_type);
  const rawContent = Array.isArray(rawBlock.content)
    ? rawBlock.content
    : [];
  const content = [...new Set(rawContent
    .map((item) => normalizeCategoryId(item))
    .filter((item) => item !== null))];
  const settings = normalizeBlockSettingsInput(rawBlock);
  const rawTitle = settings.title ?? rawBlock.title;
  const title = rawTitle == null ? '' : String(rawTitle);
  const categoryId = normalizeCategoryId(
    rawBlock.category_id
      ?? rawBlock.categoryId
      ?? settings.category_id
      ?? settings.categoryId
      ?? null
  );
  if (categoryId) {
    settings.category_id = categoryId;
  } else {
    delete settings.category_id;
  }
  delete settings.categoryId;
  if (title && !settings.title) {
    settings.title = title;
  }
  const unlimitedGrid = isUnlimitedGridSettings(settings);
  if (unlimitedGrid) {
    settings.unlimitedRows = true;
  } else {
    delete settings.unlimitedRows;
  }
  delete settings.unlimited_rows;
  delete settings.isUnlimited;
  delete settings.is_unlimited;
  const gridLimit = getGridCategoryLimit(blockType, settings);
  if (gridLimit) {
    settings.maxCategories = gridLimit;
  } else {
    delete settings.maxCategories;
  }
  const limitedContent = gridLimit ? content.slice(0, gridLimit) : content;

  const rawOrder = Number.parseInt(rawBlock.order, 10);
  const fallbackId = `showcase_block_${index + 1}`;

  return {
    id: String(rawBlock.id || fallbackId),
    block_type: blockType,
    title,
    content: limitedContent,
    category_id: blockType === BLOCK_TYPES.SLIDER ? categoryId : null,
    settings,
    order: Number.isInteger(rawOrder) && rawOrder >= 0 ? rawOrder : index
  };
};

const normalizeShowcaseLayout = (rawBlocks = []) => {
  if (!Array.isArray(rawBlocks)) return [];

  const normalized = rawBlocks
    .map((block, index) => normalizeShowcaseBlock(block, index))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .map((block, index) => ({
      ...block,
      order: index
    }));

  return normalized;
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
  const [showcaseVisible, setShowcaseVisible] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const buildShowcaseBlock = useCallback((blockType, settingsInput = {}, order = 0) => {
    const normalizedBlockType = normalizeBlockType(blockType);
    const settings = settingsInput && typeof settingsInput === 'object' ? settingsInput : {};
    const blockSettings = normalizeBlockSettingsInput(settings);
    const content = [...new Set((Array.isArray(settings.content) ? settings.content : [])
      .map((item) => normalizeCategoryId(item))
      .filter((item) => item !== null))];
    const categoryId = normalizeCategoryId(
      settings.category_id
      ?? settings.categoryId
      ?? blockSettings.category_id
      ?? blockSettings.categoryId
      ?? null
    );
    const title = settings.title == null ? '' : String(settings.title);

    if (categoryId) {
      blockSettings.category_id = categoryId;
    } else {
      delete blockSettings.category_id;
    }
    delete blockSettings.categoryId;
    if (title && !blockSettings.title) {
      blockSettings.title = title;
    }
    const unlimitedGrid = isUnlimitedGridSettings(blockSettings);
    if (unlimitedGrid) {
      blockSettings.unlimitedRows = true;
    } else {
      delete blockSettings.unlimitedRows;
    }
    delete blockSettings.unlimited_rows;
    delete blockSettings.isUnlimited;
    delete blockSettings.is_unlimited;
    const gridLimit = getGridCategoryLimit(normalizedBlockType, blockSettings);
    if (gridLimit) {
      blockSettings.maxCategories = gridLimit;
    } else {
      delete blockSettings.maxCategories;
    }
    const limitedContent = gridLimit ? content.slice(0, gridLimit) : content;

    return {
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      block_type: normalizedBlockType,
      title,
      content: limitedContent,
      category_id: normalizedBlockType === BLOCK_TYPES.SLIDER ? categoryId : null,
      settings: blockSettings,
      order: Number.isInteger(order) && order >= 0 ? order : 0
    };
  }, []);

  // Load showcase layout from server
  const loadShowcase = useCallback(async (restaurantId) => {
    if (!restaurantId) return;
    
    setShowcaseLoading(true);
    setShowcaseError('');
    
    try {
      const response = await axios.get(
        `${API_URL}/products/restaurant/${restaurantId}/showcase`
      );
      setShowcaseLayout(normalizeShowcaseLayout(response.data?.blocks || []));
      setShowcaseVisible(response.data?.isVisible !== false);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to load showcase:', error);
      setShowcaseError(error.message || 'Failed to load showcase layout');
      setShowcaseLayout([]);
      setShowcaseVisible(true);
    } finally {
      setShowcaseLoading(false);
    }
  }, []);

  // Save showcase layout to server
  const saveShowcase = useCallback(async (restaurantId, blocks, visibility = showcaseVisible) => {
    if (!restaurantId) return;
    
    setShowcaseError('');
    
    try {
      const normalizedBlocks = normalizeShowcaseLayout(blocks || []);
      await axios.post(
        `${API_URL}/products/restaurant/${restaurantId}/showcase`,
        { blocks: normalizedBlocks, isVisible: Boolean(visibility) }
      );
      setShowcaseLayout(normalizedBlocks);
      setShowcaseVisible(Boolean(visibility));
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('Failed to save showcase:', error);
      setShowcaseError(error.message || 'Failed to save showcase layout');
      return false;
    }
  }, [showcaseVisible]);

  // Add several blocks at once (used by templates)
  const addBlocks = useCallback((blockSpecs = []) => {
    if (!Array.isArray(blockSpecs) || blockSpecs.length === 0) return;

    setShowcaseLayout((prevLayout) => {
      const nextBaseOrder = prevLayout.length;
      const preparedBlocks = blockSpecs
        .map((spec, index) => {
          if (typeof spec === 'string') {
            return buildShowcaseBlock(spec, {}, nextBaseOrder + index);
          }
          if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
          const nextType = spec.blockType || spec.block_type;
          const nextSettings = spec.settings && typeof spec.settings === 'object'
            ? spec.settings
            : spec;
          return buildShowcaseBlock(nextType, nextSettings, nextBaseOrder + index);
        })
        .filter(Boolean);

      if (preparedBlocks.length === 0) return prevLayout;
      return normalizeShowcaseLayout([...prevLayout, ...preparedBlocks]);
    });
    setIsDirty(true);
  }, [buildShowcaseBlock]);

  // Add a new block to showcase
  const addBlock = useCallback((blockType, settingsInput = {}) => {
    addBlocks([{ blockType, settings: settingsInput }]);
  }, [addBlocks]);

  // Remove block from showcase
  const removeBlock = useCallback((blockId) => {
    setShowcaseLayout((prevLayout) => normalizeShowcaseLayout(prevLayout.filter((block) => block.id !== blockId)));
    setIsDirty(true);
  }, []);

  // Update block content/settings
  const updateBlock = useCallback((blockId, updates) => {
    setShowcaseLayout((prevLayout) => normalizeShowcaseLayout(prevLayout.map((block) => (
      block.id === blockId
        ? { ...block, ...updates }
        : block
    ))));
    setIsDirty(true);
  }, []);

  // Reorder blocks (move block up or down)
  const reorderBlocks = useCallback((blockId, direction = 'down') => {
    setShowcaseLayout((prevLayout) => {
      const currentIndex = prevLayout.findIndex((block) => block.id === blockId);
      if (currentIndex === -1) return prevLayout;

      const newIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
      if (newIndex < 0 || newIndex >= prevLayout.length) return prevLayout;

      const newLayout = [...prevLayout];
      [newLayout[currentIndex], newLayout[newIndex]] = [newLayout[newIndex], newLayout[currentIndex]];
      const normalizedOrderLayout = newLayout.map((block, index) => ({
        ...block,
        order: index
      }));
      return normalizeShowcaseLayout(normalizedOrderLayout);
    });
    setIsDirty(true);
  }, []);

  // Add category to a grid block
  const addCategoryToBlock = useCallback((blockId, categoryId) => {
    const normalizedCategoryId = normalizeCategoryId(categoryId);
    if (!normalizedCategoryId) return;

    setShowcaseLayout((prevLayout) => normalizeShowcaseLayout(prevLayout.map((block) => {
      if (block.id === blockId && (block.block_type === BLOCK_TYPES.GRID_3 || block.block_type === BLOCK_TYPES.GRID_2)) {
        const blockContent = Array.isArray(block.content) ? block.content : [];
        const gridLimit = getGridCategoryLimit(block.block_type, block.settings);
        if (blockContent.includes(normalizedCategoryId)) return block;
        if (gridLimit && blockContent.length >= gridLimit) return block;
        return {
          ...block,
          content: [...blockContent, normalizedCategoryId]
        };
      }
      return block;
    })));
    setIsDirty(true);
  }, []);

  // Remove category from a grid block
  const removeCategoryFromBlock = useCallback((blockId, categoryId) => {
    const normalizedCategoryId = normalizeCategoryId(categoryId);
    if (!normalizedCategoryId) return;

    setShowcaseLayout((prevLayout) => normalizeShowcaseLayout(prevLayout.map((block) => {
      if (block.id === blockId && (block.block_type === BLOCK_TYPES.GRID_3 || block.block_type === BLOCK_TYPES.GRID_2)) {
        const blockContent = Array.isArray(block.content) ? block.content : [];
        return {
          ...block,
          content: blockContent.filter((id) => id !== normalizedCategoryId)
        };
      }
      return block;
    })));
    setIsDirty(true);
  }, []);

  // Set slider category
  const setSliderCategory = useCallback((blockId, categoryId) => {
    const normalizedCategoryId = normalizeCategoryId(categoryId);
    setShowcaseLayout((prevLayout) => normalizeShowcaseLayout(prevLayout.map((block) => {
      if (block.id === blockId && block.block_type === BLOCK_TYPES.SLIDER) {
        const nextSettings = {
          ...(block.settings || {})
        };
        if (normalizedCategoryId) {
          nextSettings.category_id = normalizedCategoryId;
        } else {
          delete nextSettings.category_id;
        }
        return {
          ...block,
          category_id: normalizedCategoryId,
          settings: nextSettings
        };
      }
      return block;
    })));
    setIsDirty(true);
  }, []);

  // Reset showcase to default state
  const resetShowcase = useCallback(() => {
    setShowcaseLayout([]);
    setIsDirty(false);
  }, []);

  const setShowcaseVisibility = useCallback((nextVisibility) => {
    const normalizedVisibility = Boolean(nextVisibility);
    setShowcaseVisible((prevVisibility) => {
      if (prevVisibility === normalizedVisibility) return prevVisibility;
      setIsDirty(true);
      return normalizedVisibility;
    });
  }, []);

  const value = {
    // State
    showcaseLayout,
    showcaseLoading,
    showcaseError,
    showcaseVisible,
    isDirty,
    
    // Methods
    loadShowcase,
    saveShowcase,
    addBlock,
    addBlocks,
    removeBlock,
    updateBlock,
    reorderBlocks,
    addCategoryToBlock,
    removeCategoryFromBlock,
    setSliderCategory,
    setShowcaseVisible: setShowcaseVisibility,
    resetShowcase
  };

  return (
    <ShowcaseContext.Provider value={value}>
      {children}
    </ShowcaseContext.Provider>
  );
}
