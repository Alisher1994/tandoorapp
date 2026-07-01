/**
 * Orphaned Files Cleanup Script
 * 
 * Safely deletes files from the uploads directory that are not referenced in the database.
 * 
 * Usage:
 *   Preview changes:
 *     node server/scripts/cleanup-orphans.js
 *   Actually delete files:
 *     node server/scripts/cleanup-orphans.js --delete
 */

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const dryRun = !process.argv.includes('--delete');
const retentionHours = 24; // Keep files uploaded in the last 24h

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getReferencedFiles() {
  const referenced = new Set();

  // Helper to add files from a column query
  const addFromQuery = async (query, colName, isJsonb = false) => {
    try {
      const res = await pool.query(query);
      for (const row of res.rows) {
        if (isJsonb) {
          const val = row[colName];
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item === 'string') {
                referenced.add(path.basename(item));
              } else if (item && typeof item === 'object' && item.image_url) {
                referenced.add(path.basename(item.image_url));
              } else if (item && typeof item === 'object' && item.url) {
                referenced.add(path.basename(item.url));
              }
            }
          }
        } else {
          const val = row[colName];
          if (val && typeof val === 'string') {
            referenced.add(path.basename(val));
          }
        }
      }
    } catch (e) {
      console.log(`⚠️  Warning: failed to query ${colName}: ${e.message}`);
    }
  };

  console.log('🔍 Querying database for file references...');

  // 1. Products image_url and thumb_url
  await addFromQuery('SELECT image_url, thumb_url FROM products', 'image_url');
  await addFromQuery('SELECT image_url, thumb_url FROM products', 'thumb_url');

  // 2. Products JSONB array
  await addFromQuery('SELECT product_images FROM products WHERE product_images IS NOT NULL', 'product_images', true);

  // 3. Global products (templates)
  await addFromQuery('SELECT image_url, thumb_url FROM global_products', 'image_url');
  await addFromQuery('SELECT image_url, thumb_url FROM global_products', 'thumb_url');
  await addFromQuery('SELECT product_images FROM global_products WHERE product_images IS NOT NULL', 'product_images', true);

  // 4. Restaurants logo_url and receipt_logo_url
  await addFromQuery('SELECT logo_url FROM restaurants', 'logo_url');
  await addFromQuery('SELECT receipt_logo_url FROM restaurants WHERE receipt_logo_url IS NOT NULL', 'receipt_logo_url');
  await addFromQuery('SELECT guvohnoma_file_url FROM restaurants WHERE guvohnoma_file_url IS NOT NULL', 'guvohnoma_file_url');

  // 5. Categories image_url
  await addFromQuery('SELECT image_url FROM categories', 'image_url');
  await addFromQuery('SELECT image_url FROM restaurant_category_image_overrides WHERE image_url IS NOT NULL', 'image_url');

  // 6. Ad banners (table ad_banners and restaurants JSONB)
  await addFromQuery('SELECT image_url FROM ad_banners WHERE image_url IS NOT NULL', 'image_url');
  await addFromQuery('SELECT store_ad_banners FROM restaurants WHERE store_ad_banners IS NOT NULL', 'store_ad_banners', true);

  // 7. Broadcasts
  await addFromQuery('SELECT image_url, video_url FROM broadcast_history', 'image_url');
  await addFromQuery('SELECT image_url, video_url FROM broadcast_history', 'video_url');
  await addFromQuery('SELECT image_url, video_url FROM scheduled_broadcasts', 'image_url');
  await addFromQuery('SELECT image_url, video_url FROM scheduled_broadcasts', 'video_url');

  // 8. Floors & Tables layout
  await addFromQuery('SELECT image_url FROM reservation_floors', 'image_url');
  await addFromQuery('SELECT photo_url FROM reservation_tables', 'photo_url');
  await addFromQuery('SELECT image_url FROM reservation_table_templates', 'image_url');

  // 9. License/Business files
  await addFromQuery('SELECT file_url FROM restaurant_guvohnoma_files', 'file_url');

  // 10. Printers & Drivers & Agents
  await addFromQuery('SELECT photo_url FROM printer_drivers WHERE photo_url IS NOT NULL', 'photo_url');
  await addFromQuery('SELECT stored_filename FROM printer_agent_versions WHERE stored_filename IS NOT NULL', 'stored_filename');
  await addFromQuery('SELECT stored_filename FROM printer_driver_versions WHERE stored_filename IS NOT NULL', 'stored_filename');

  // 11. Founder profiles & billing settings
  await addFromQuery('SELECT photo_url FROM founder_profiles WHERE photo_url IS NOT NULL', 'photo_url');
  await addFromQuery('SELECT print_form_background_url FROM billing_settings WHERE print_form_background_url IS NOT NULL', 'print_form_background_url');

  return referenced;
}

async function main() {
  console.log('🧹 ==========================================');
  console.log(`   ORPHANED FILES CLEANUP${dryRun ? ' (PREVIEW / DRY RUN)' : ' (EXECUTION)'}`);
  console.log('   ==========================================');
  console.log(`   Uploads path: ${uploadsDir}`);

  if (!fs.existsSync(uploadsDir)) {
    console.log('   ❌ Directory does not exist!');
    await pool.end();
    return;
  }

  const referenced = await getReferencedFiles();
  console.log(`   Database references: ${referenced.size} files`);

  const files = fs.readdirSync(uploadsDir);
  console.log(`   Files on disk: ${files.length} files`);

  let orphanCount = 0;
  let orphanSize = 0;
  let skippedNewFiles = 0;
  const toDelete = [];

  const now = new Date();

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;

      // Skip files that are referenced in DB
      if (referenced.has(file)) continue;
      if (file === '.gitkeep') continue;

      // Skip newly created files (protect files currently being uploaded/processed)
      const ageHours = (now - stat.mtime) / (1000 * 60 * 60);
      if (ageHours < retentionHours) {
        skippedNewFiles++;
        continue;
      }

      orphanCount++;
      orphanSize += stat.size;
      toDelete.push({ name: file, path: filePath, size: stat.size });
    } catch (e) {
      // skip inaccessible files
    }
  }

  console.log(`\n   📊 Analysis results:`);
  console.log(`      Orphaned files found:   ${orphanCount} files`);
  console.log(`      Potential space saved:  ${formatBytes(orphanSize)}`);
  console.log(`      Skipped (recent < 24h): ${skippedNewFiles} files`);

  if (toDelete.length === 0) {
    console.log('\n   🎉 No orphaned files older than 24 hours to delete!');
    await pool.end();
    return;
  }

  if (dryRun) {
    console.log('\n   🏋️ Top 10 largest orphans to be deleted:');
    toDelete.sort((a, b) => b.size - a.size);
    for (let i = 0; i < Math.min(10, toDelete.length); i++) {
      const f = toDelete[i];
      console.log(`      - ${formatBytes(f.size).padStart(10)}  ${f.name}`);
    }
    console.log('\n   ⚠️  This was a DRY RUN. No files were deleted.');
    console.log('      To actually delete these files, run:');
    console.log('      node server/scripts/cleanup-orphans.js --delete');
  } else {
    console.log('\n   🗑️  Deleting orphaned files...');
    let deletedCount = 0;
    let failedCount = 0;

    for (const file of toDelete) {
      try {
        fs.unlinkSync(file.path);
        deletedCount++;
      } catch (err) {
        failedCount++;
      }
    }

    console.log(`   ✅ Done! Successfully deleted ${deletedCount} files, freed ${formatBytes(orphanSize)}.`);
    if (failedCount > 0) {
      console.log(`   ⚠️  Failed to delete ${failedCount} files.`);
    }
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('Fatal error during cleanup:', e);
  await pool.end();
  process.exit(1);
});
