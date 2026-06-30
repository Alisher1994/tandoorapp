const pool = require('../database/connection');

async function fixMismatches() {
  console.log('🔄 Starting automated category mismatch resolver...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find all products with mismatching categories
    const mismatchesResult = await client.query(`
      SELECT 
        p.id as product_id, 
        p.name_ru as product_name, 
        p.restaurant_id as product_restaurant_id, 
        c.id as category_id, 
        c.name_ru as category_name_ru,
        c.name_uz as category_name_uz,
        c.image_url as category_image_url,
        c.sort_order as category_sort_order,
        c.is_active as category_is_active,
        c.restaurant_id as category_restaurant_id
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.restaurant_id <> c.restaurant_id
    `);

    const mismatches = mismatchesResult.rows;
    console.log(`Found ${mismatches.length} products with category restaurant mismatch.`);

    const categoryMappingsByRestaurant = {}; // restaurantId -> { oldCategoryId -> newCategoryId }

    for (const row of mismatches) {
      const restId = row.product_restaurant_id;
      const oldCatId = row.category_id;

      if (!categoryMappingsByRestaurant[restId]) {
        categoryMappingsByRestaurant[restId] = {};
      }

      // Check if we already created/found a mapping for this old category in this restaurant
      let targetCatId = categoryMappingsByRestaurant[restId][oldCatId];

      if (!targetCatId) {
        // Look up if a category with the same name already exists in the target restaurant
        const existingCat = await client.query(
          'SELECT id FROM categories WHERE restaurant_id = $1 AND name_ru = $2 LIMIT 1',
          [restId, row.category_name_ru]
        );

        if (existingCat.rows.length > 0) {
          targetCatId = existingCat.rows[0].id;
          console.log(`Matching category found for restaurant #${restId}: "${row.category_name_ru}" (ID #${targetCatId}).`);
        } else {
          // Copy the category to the target restaurant
          const insertResult = await client.query(
            `INSERT INTO categories (restaurant_id, name_ru, name_uz, image_url, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              restId,
              row.category_name_ru,
              row.category_name_uz,
              row.category_image_url,
              row.category_sort_order,
              row.category_is_active
            ]
          );
          targetCatId = insertResult.rows[0].id;
          console.log(`Created copy of Category #${oldCatId} ("${row.category_name_ru}") -> #${targetCatId} for restaurant #${restId}.`);
        }
        categoryMappingsByRestaurant[restId][oldCatId] = targetCatId;
      }

      // Update the product
      await client.query(
        'UPDATE products SET category_id = $1 WHERE id = $2',
        [targetCatId, row.product_id]
      );
      console.log(`Updated Product #${row.product_id} ("${row.product_name}") category to #${targetCatId}.`);
    }

    // Now update showcase layouts with the category mappings
    for (const restId of Object.keys(categoryMappingsByRestaurant)) {
      const mapping = categoryMappingsByRestaurant[restId];
      const restIdNum = parseInt(restId, 10);

      const showcaseResult = await client.query(
        'SELECT layout FROM showcase_layouts WHERE restaurant_id = $1 LIMIT 1',
        [restIdNum]
      );

      if (showcaseResult.rows.length > 0) {
        const rawLayout = showcaseResult.rows[0].layout;
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
            [JSON.stringify(newLayoutValue), restIdNum]
          );
          console.log(`Updated showcase layout for restaurant #${restIdNum} with mapping:`, mapping);
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ All category mismatches fixed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Mismatch resolver failed:', err.message);
  } finally {
    client.release();
  }
}

fixMismatches().then(() => pool.end());
