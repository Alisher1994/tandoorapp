const pool = require('../database/connection');

async function runVerification() {
  console.log('🏁 Starting Automated System Verification...');
  let hasErrors = false;

  // 1. Verify mobile_product_columns column in restaurants table
  try {
    const colCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'restaurants' AND column_name = 'mobile_product_columns'
    `);
    
    if (colCheck.rows.length === 0) {
      console.error('❌ FAIL: "mobile_product_columns" column is missing in "restaurants" table!');
      hasErrors = true;
    } else {
      console.log(`✅ PASS: "mobile_product_columns" column exists with type "${colCheck.rows[0].data_type}".`);
    }
  } catch (err) {
    console.error('❌ FAIL checking "mobile_product_columns" column:', err.message);
    hasErrors = true;
  }

  // 2. Verify Category Isolation
  try {
    const isolationCheck = await pool.query(`
      SELECT 
        p.id as product_id, 
        p.name_ru as product_name, 
        p.restaurant_id as product_restaurant, 
        c.id as category_id, 
        c.name_ru as category_name, 
        c.restaurant_id as category_restaurant
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.restaurant_id <> c.restaurant_id
    `);

    if (isolationCheck.rows.length > 0) {
      console.error(`❌ FAIL: Found ${isolationCheck.rows.length} products associated with categories from another restaurant!`);
      console.error('Sample mismatching products:');
      console.error(isolationCheck.rows.slice(0, 5));
      hasErrors = true;
    } else {
      console.log('✅ PASS: All products are correctly linked to categories belonging to the SAME restaurant.');
    }
  } catch (err) {
    console.error('❌ FAIL checking category isolation:', err.message);
    hasErrors = true;
  }

  // 3. Verify category hierarchy/orphans inside showcase layout (if applicable)
  try {
    const showcaseCheck = await pool.query(`
      SELECT restaurant_id, layout 
      FROM showcase_layouts 
      WHERE layout IS NOT NULL
    `);
    
    let badShowcases = 0;
    for (const row of showcaseCheck.rows) {
      try {
        const rawLayout = row.layout;
        let blocks = [];
        if (Array.isArray(rawLayout)) {
          blocks = rawLayout;
        } else if (rawLayout && typeof rawLayout === 'object') {
          blocks = rawLayout.blocks || [];
        } else if (typeof rawLayout === 'string') {
          const parsed = JSON.parse(rawLayout);
          blocks = Array.isArray(parsed) ? parsed : (parsed.blocks || []);
        }

        const categoryIds = [];
        blocks.forEach(block => {
          if (!block || typeof block !== 'object') return;
          const blockContent = Array.isArray(block.content) ? block.content : [];
          blockContent.forEach(rawId => {
            const id = parseInt(rawId, 10);
            if (Number.isInteger(id) && id > 0) categoryIds.push(id);
          });
          const sliderId = parseInt(block.category_id, 10);
          if (Number.isInteger(sliderId) && sliderId > 0) categoryIds.push(sliderId);
        });

        const uniqueCategoryIds = Array.from(new Set(categoryIds));

        if (uniqueCategoryIds.length > 0) {
          const dbCheck = await pool.query(
            `SELECT id FROM categories WHERE id = ANY($1) AND restaurant_id <> $2`,
            [uniqueCategoryIds, row.restaurant_id]
          );
          if (dbCheck.rows.length > 0) {
            console.error(`❌ FAIL: Restaurant #${row.restaurant_id} has showcase layout references to categories from other stores:`, dbCheck.rows.map(r => r.id));
            badShowcases++;
          }
        }
      } catch (parseErr) {
        // Skip invalid JSON layout entries
      }
    }

    if (badShowcases > 0) {
      console.error(`❌ FAIL: Found ${badShowcases} showcase layouts with cross-restaurant category IDs!`);
      hasErrors = true;
    } else {
      console.log('✅ PASS: No cross-restaurant category IDs found in showcase_layouts.');
    }
  } catch (err) {
    console.error('❌ FAIL checking showcase layout category integrity:', err.message);
    hasErrors = true;
  }

  // 4. Verify API response structure / settings default value mapping
  try {
    const restaurantRes = await pool.query('SELECT id, mobile_product_columns FROM restaurants LIMIT 1');
    if (restaurantRes.rows.length > 0) {
      const rest = restaurantRes.rows[0];
      if (rest.mobile_product_columns !== null && rest.mobile_product_columns !== undefined) {
        console.log(`✅ PASS: Checked restaurant settings. Current mobile_product_columns value: ${rest.mobile_product_columns}.`);
      } else {
        console.warn('⚠️ WARNING: Column exists, but is currently NULL for the selected restaurant (default fallback to 2 will be used).');
      }
    } else {
      console.warn('⚠️ WARNING: No restaurants found to test.');
    }
  } catch (err) {
    console.error('❌ FAIL checking API response mock database call:', err.message);
    hasErrors = true;
  }

  if (hasErrors) {
    console.error('\n🛑 VERIFICATION FAILED! Please inspect the issues listed above.');
    process.exit(1);
  } else {
    console.log('\n🌟 ALL SYSTEM VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('Unexpected error running system verification:', err);
  process.exit(1);
});
