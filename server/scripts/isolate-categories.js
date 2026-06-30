const pool = require('../database/connection');

async function run() {
  console.log('Starting category isolation migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get all restaurants
    const restaurantsResult = await client.query('SELECT id, name FROM restaurants');
    const restaurants = restaurantsResult.rows;
    console.log(`Found ${restaurants.length} restaurants to check.`);

    for (const r of restaurants) {
      console.log(`\nProcessing restaurant #${r.id}: ${r.name}`);

      // Get all product category IDs for this restaurant
      const productsResult = await client.query(
        'SELECT DISTINCT category_id FROM products WHERE restaurant_id = $1 AND category_id IS NOT NULL',
        [r.id]
      );
      const productCategoryIds = productsResult.rows.map(row => row.category_id);

      // Get all showcase layout category IDs for this restaurant
      const showcaseResult = await client.query(
        'SELECT layout FROM showcase_layouts WHERE restaurant_id = $1 LIMIT 1',
        [r.id]
      );
      const showcaseCategoryIds = [];
      let rawLayout = null;
      if (showcaseResult.rows.length > 0) {
        rawLayout = showcaseResult.rows[0].layout;
        // Parse layout blocks
        let blocks = [];
        if (Array.isArray(rawLayout)) {
          blocks = rawLayout;
        } else if (rawLayout && typeof rawLayout === 'object') {
          blocks = rawLayout.blocks || [];
        } else if (typeof rawLayout === 'string') {
          try {
            const parsed = JSON.parse(rawLayout);
            blocks = Array.isArray(parsed) ? parsed : (parsed.blocks || []);
          } catch (e) {}
        }

        blocks.forEach(block => {
          if (!block || typeof block !== 'object') return;
          const blockContent = Array.isArray(block.content) ? block.content : [];
          blockContent.forEach(rawId => {
            const id = parseInt(rawId, 10);
            if (Number.isInteger(id) && id > 0) showcaseCategoryIds.push(id);
          });
          const sliderId = parseInt(block.category_id, 10);
          if (Number.isInteger(sliderId) && sliderId > 0) showcaseCategoryIds.push(sliderId);
        });
      }

      // Combine and get unique category IDs used by this store
      const allUsedCategoryIds = Array.from(new Set([...productCategoryIds, ...showcaseCategoryIds]));
      console.log(`Used category IDs: ${allUsedCategoryIds.join(', ')}`);

      const mapping = {}; // old_id -> new_id

      for (const oldId of allUsedCategoryIds) {
        // Fetch the category
        const catResult = await client.query('SELECT * FROM categories WHERE id = $1', [oldId]);
        if (catResult.rows.length === 0) continue;
        const cat = catResult.rows[0];

        // If the category does not belong to this restaurant (it is NULL or belongs to another restaurant)
        if (cat.restaurant_id !== r.id) {
          console.log(`Category #${oldId} ("${cat.name_ru}") does not belong to restaurant #${r.id}. Copying...`);

          // Insert a copy of the category for this restaurant
          const insertResult = await client.query(
            `INSERT INTO categories (restaurant_id, name_ru, name_uz, image_url, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [r.id, cat.name_ru, cat.name_uz, cat.image_url, cat.sort_order, cat.is_active]
          );
          const newId = insertResult.rows[0].id;
          mapping[oldId] = newId;
          console.log(`Created copy: Category #${oldId} -> #${newId}`);

          // Update products of this restaurant
          const prodUpdate = await client.query(
            'UPDATE products SET category_id = $1 WHERE restaurant_id = $2 AND category_id = $3',
            [newId, r.id, oldId]
          );
          console.log(`Updated ${prodUpdate.rowCount} products.`);

          // Update category image overrides
          const overridesCheck = await client.query(
            'SELECT * FROM restaurant_category_image_overrides WHERE restaurant_id = $1 AND category_id = $2',
            [r.id, oldId]
          );
          if (overridesCheck.rows.length > 0) {
            const ov = overridesCheck.rows[0];
            await client.query(
              `INSERT INTO restaurant_category_image_overrides (restaurant_id, category_id, use_custom_image, image_url)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (restaurant_id, category_id) DO UPDATE
               SET use_custom_image = EXCLUDED.use_custom_image, image_url = EXCLUDED.image_url`,
              [r.id, newId, ov.use_custom_image, ov.image_url]
            );
            // Delete old override to avoid cluttering
            await client.query(
              'DELETE FROM restaurant_category_image_overrides WHERE restaurant_id = $1 AND category_id = $2',
              [r.id, oldId]
            );
            console.log(`Copied image override for Category #${oldId} -> #${newId}`);
          }
        } else {
          console.log(`Category #${oldId} ("${cat.name_ru}") already belongs to restaurant #${r.id}.`);
        }
      }

      // If we made any mappings, update showcase layout
      if (Object.keys(mapping).length > 0 && rawLayout) {
        let blocks = [];
        let parsedLayoutObj = null;
        if (Array.isArray(rawLayout)) {
          blocks = rawLayout;
        } else if (rawLayout && typeof rawLayout === 'object') {
          parsedLayoutObj = rawLayout;
          blocks = rawLayout.blocks || [];
        } else if (typeof rawLayout === 'string') {
          try {
            const parsed = JSON.parse(rawLayout);
            if (Array.isArray(parsed)) {
              blocks = parsed;
            } else {
              parsedLayoutObj = parsed;
              blocks = parsed.blocks || [];
            }
          } catch (e) {}
        }

        let modified = false;
        blocks.forEach(block => {
          if (!block || typeof block !== 'object') return;
          if (Array.isArray(block.content)) {
            block.content = block.content.map(rawId => {
              const id = parseInt(rawId, 10);
              if (mapping[id]) {
                modified = true;
                return mapping[id];
              }
              return rawId;
            });
          }
          const sliderId = parseInt(block.category_id, 10);
          if (Number.isInteger(sliderId) && mapping[sliderId]) {
            block.category_id = mapping[sliderId];
            modified = true;
          }
        });

        if (modified) {
          const newLayoutValue = parsedLayoutObj ? { ...parsedLayoutObj, blocks } : blocks;
          await client.query(
            'UPDATE showcase_layouts SET layout = $1 WHERE restaurant_id = $2',
            [JSON.stringify(newLayoutValue), r.id]
          );
          console.log(`Updated showcase layout for restaurant #${r.id} with new category IDs.`);
        }
      }
    }

    await client.query('COMMIT');
    console.log('\nMigration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
  }
}

run().then(() => pool.end());
