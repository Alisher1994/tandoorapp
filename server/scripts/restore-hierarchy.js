const pool = require('../database/connection');

async function restoreHierarchy() {
  console.log('🏁 Starting Category Hierarchy Restoration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get all restaurants
    const restaurantsRes = await client.query('SELECT id, name FROM restaurants');
    const restaurants = restaurantsRes.rows;
    console.log(`Found ${restaurants.length} restaurants.`);

    // Pre-load all categories to matching and copying
    const allCatsRes = await client.query('SELECT * FROM categories');
    const allCategories = allCatsRes.rows;

    let totalFixed = 0;

    for (const r of restaurants) {
      const rCats = allCategories.filter(c => c.restaurant_id === r.id);
      if (rCats.length === 0) continue;

      console.log(`\nProcessing Restaurant #${r.id}: ${r.name} (${rCats.length} categories)`);

      // Helper function to find or copy a parent category chain for restaurant R
      async function resolveParentForRestaurant(origParentId, restaurantId) {
        if (!origParentId) return null;

        // Fetch original parent details
        const origParent = allCategories.find(c => c.id === origParentId);
        if (!origParent) return null;

        // Check if restaurant already has a category with this name
        let existingParent = rCats.find(c => c.name_ru === origParent.name_ru);
        if (!existingParent) {
          // Check if we already inserted it in this transaction
          const dbCheck = await client.query(
            'SELECT * FROM categories WHERE restaurant_id = $1 AND name_ru = $2 LIMIT 1',
            [restaurantId, origParent.name_ru]
          );
          if (dbCheck.rows.length > 0) {
            existingParent = dbCheck.rows[0];
          }
        }

        if (existingParent) {
          // If it exists, make sure its parent is also resolved
          if (origParent.parent_id && !existingParent.parent_id) {
            const grandParentId = await resolveParentForRestaurant(origParent.parent_id, restaurantId);
            if (grandParentId) {
              await client.query('UPDATE categories SET parent_id = $1 WHERE id = $2', [grandParentId, existingParent.id]);
              existingParent.parent_id = grandParentId;
              console.log(`  Updated existing parent category #${existingParent.id} ("${existingParent.name_ru}") parent to #${grandParentId}`);
            }
          }
          return existingParent.id;
        }

        // If it doesn't exist, we must copy it
        const newParentOfParentId = await resolveParentForRestaurant(origParent.parent_id, restaurantId);
        console.log(`  Creating parent category copy: "${origParent.name_ru}" for restaurant #${restaurantId}`);
        const insertRes = await client.query(
          `INSERT INTO categories (restaurant_id, name_ru, name_uz, image_url, sort_order, is_active, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [restaurantId, origParent.name_ru, origParent.name_uz, origParent.image_url, origParent.sort_order, origParent.is_active, newParentOfParentId]
        );
        const newParentId = insertRes.rows[0].id;
        
        // Push the newly created category to rCats so we don't recreate it
        rCats.push({
          id: newParentId,
          name_ru: origParent.name_ru,
          name_uz: origParent.name_uz,
          restaurant_id: restaurantId,
          parent_id: newParentOfParentId,
          image_url: origParent.image_url,
          sort_order: origParent.sort_order,
          is_active: origParent.is_active
        });

        return newParentId;
      }

      for (const c of rCats) {
        // If the category has no parent_id, try to find if it originally had one in the global/original categories
        if (c.parent_id === null) {
          // Search in other categories (like those in other restaurants or the original global ones) for one with the same name that HAS a parent
          const origMatch = allCategories.find(other => other.name_ru === c.name_ru && other.parent_id !== null);
          
          if (origMatch) {
            console.log(`Category #${c.id} ("${c.name_ru}") was found to have parent in original Category #${origMatch.id} (Parent: #${origMatch.parent_id})`);
            const targetParentId = await resolveParentForRestaurant(origMatch.parent_id, r.id);
            if (targetParentId) {
              await client.query('UPDATE categories SET parent_id = $1 WHERE id = $2', [targetParentId, c.id]);
              c.parent_id = targetParentId;
              totalFixed++;
              console.log(`  ✅ Fixed Category #${c.id} ("${c.name_ru}") -> parent set to #${targetParentId}`);
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\n🎉 Hierarchy restoration completed successfully! Fixed ${totalFixed} categories.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Hierarchy restoration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

restoreHierarchy();
