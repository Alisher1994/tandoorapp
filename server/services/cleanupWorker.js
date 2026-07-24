/**
 * Background Cleanup Worker
 * 
 * Automatically runs maintenance tasks periodically:
 * - Deletes all print forms (which are regenerated on demand)
 * - Safely deletes orphaned upload files not referenced in the DB (older than 24h)
 */

const fs = require('fs');
const path = require('path');
const pool = require('../database/connection');
const {
  addUploadBasename,
  collectJsonUploadReferences
} = require('./uploadReferences');

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run once every 24 hours
const RETENTION_HOURS = 24; // Keep files uploaded in the last 24h

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

const printFormsDir = path.join(uploadsDir, 'print_forms');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getReferencedFiles() {
  const referenced = new Set();
  
  const addFromQuery = async (query, colName, isJsonb = false) => {
    try {
      const res = await pool.query(query);
      for (const row of res.rows) {
        if (isJsonb) {
          collectJsonUploadReferences(row[colName], referenced);
        } else {
          addUploadBasename(referenced, row[colName]);
        }
      }
    } catch (e) {
      // ignore query errors for non-existent columns
    }
  };

  // Query all fields that contain file links
  await addFromQuery('SELECT image_url, thumb_url FROM products', 'image_url');
  await addFromQuery('SELECT image_url, thumb_url FROM products', 'thumb_url');
  await addFromQuery('SELECT product_images FROM products WHERE product_images IS NOT NULL', 'product_images', true);
  await addFromQuery('SELECT size_options FROM products WHERE size_options IS NOT NULL', 'size_options', true);
  await addFromQuery('SELECT image_url, thumb_url FROM global_products', 'image_url');
  await addFromQuery('SELECT image_url, thumb_url FROM global_products', 'thumb_url');
  await addFromQuery('SELECT product_images FROM global_products WHERE product_images IS NOT NULL', 'product_images', true);
  await addFromQuery('SELECT logo_url FROM restaurants', 'logo_url');
  await addFromQuery('SELECT receipt_logo_url FROM restaurants WHERE receipt_logo_url IS NOT NULL', 'receipt_logo_url');
  await addFromQuery('SELECT guvohnoma_file_url FROM restaurants WHERE guvohnoma_file_url IS NOT NULL', 'guvohnoma_file_url');
  await addFromQuery('SELECT image_url FROM categories', 'image_url');
  await addFromQuery('SELECT image_url FROM restaurant_category_image_overrides WHERE image_url IS NOT NULL', 'image_url');
  await addFromQuery('SELECT image_url FROM ad_banners WHERE image_url IS NOT NULL', 'image_url');
  await addFromQuery('SELECT store_ad_banners FROM restaurants WHERE store_ad_banners IS NOT NULL', 'store_ad_banners', true);
  await addFromQuery('SELECT image_url, video_url FROM broadcast_history', 'image_url');
  await addFromQuery('SELECT image_url, video_url FROM broadcast_history', 'video_url');
  await addFromQuery('SELECT image_url, video_url FROM scheduled_broadcasts', 'image_url');
  await addFromQuery('SELECT image_url, video_url FROM scheduled_broadcasts', 'video_url');
  await addFromQuery('SELECT image_url FROM reservation_floors', 'image_url');
  await addFromQuery('SELECT photo_url FROM reservation_tables', 'photo_url');
  await addFromQuery('SELECT image_url FROM reservation_table_templates', 'image_url');
  await addFromQuery('SELECT file_url FROM restaurant_guvohnoma_files', 'file_url');
  await addFromQuery('SELECT photo_url FROM printer_drivers WHERE photo_url IS NOT NULL', 'photo_url');
  await addFromQuery('SELECT stored_filename FROM printer_agent_versions WHERE stored_filename IS NOT NULL', 'stored_filename');
  await addFromQuery('SELECT stored_filename FROM printer_driver_versions WHERE stored_filename IS NOT NULL', 'stored_filename');
  await addFromQuery('SELECT photo_url FROM founder_profiles WHERE photo_url IS NOT NULL', 'photo_url');
  await addFromQuery('SELECT print_form_background_url FROM billing_settings WHERE print_form_background_url IS NOT NULL', 'print_form_background_url');

  return referenced;
}

async function cleanPrintForms() {
  console.log('🧹 [Cleanup Worker] Starting print forms cleanup...');
  if (!fs.existsSync(printFormsDir)) return;

  try {
    const files = await fs.promises.readdir(printFormsDir);
    if (files.length === 0) return;

    let freedSpace = 0;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(printFormsDir, file);
      try {
        const stat = await fs.promises.stat(filePath);
        await fs.promises.unlink(filePath);
        freedSpace += stat.size;
        deletedCount++;
      } catch (_) {}
    }

    console.log(`✅ [Cleanup Worker] Deleted ${deletedCount} print forms. Freed ${formatBytes(freedSpace)}.`);
  } catch (e) {
    console.error('❌ [Cleanup Worker] Error cleaning print forms:', e.message);
  }
}

async function cleanOrphanedUploads() {
  console.log('🧹 [Cleanup Worker] Starting orphaned uploads cleanup...');
  if (!fs.existsSync(uploadsDir)) return;

  try {
    const referenced = await getReferencedFiles();
    const files = fs.readdirSync(uploadsDir);
    const now = new Date();

    let freedSpace = 0;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) continue;
        if (referenced.has(file)) continue;
        if (file === '.gitkeep') continue;

        // Retention guard: only delete if older than 24h
        const ageHours = (now - stat.mtime) / (1000 * 60 * 60);
        if (ageHours < RETENTION_HOURS) continue;

        fs.unlinkSync(filePath);
        freedSpace += stat.size;
        deletedCount++;
      } catch (_) {}
    }

    console.log(`✅ [Cleanup Worker] Deleted ${deletedCount} orphaned uploads. Freed ${formatBytes(freedSpace)}.`);
  } catch (e) {
    console.error('❌ [Cleanup Worker] Error cleaning orphaned uploads:', e.message);
  }
}

async function runCleanup() {
  try {
    await cleanPrintForms();
    await cleanOrphanedUploads();
  } catch (err) {
    console.error('❌ [Cleanup Worker] Fatal cleanup error:', err.message);
  }
}

function initCleanupWorker() {
  console.log('🤖 [Cleanup Worker] Background cleanup worker initialized.');
  
  // Run first cleanup 5 minutes after server start to avoid CPU load during boot
  setTimeout(runCleanup, 5 * 60 * 1000);

  // Set interval to run once every 24 hours
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = { initCleanupWorker };
