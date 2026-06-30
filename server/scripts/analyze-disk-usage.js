/**
 * Disk Usage Analyzer for tandoorapp-volume
 * 
 * Analyzes what takes up space on the server volume:
 * - Uploaded images (products, logos, ads, etc.)
 * - Uploaded videos (broadcasts)
 * - Orphaned files (not referenced by any DB record)
 * - Database size
 */

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

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

async function analyzeUploadsDir() {
  console.log('\n📂 ==========================================');
  console.log('   UPLOADS DIRECTORY ANALYSIS');
  console.log('   ==========================================');
  console.log(`   Path: ${uploadsDir}`);

  if (!fs.existsSync(uploadsDir)) {
    console.log('   ❌ Directory does not exist!');
    return { files: [], totalSize: 0, totalCount: 0 };
  }

  const files = fs.readdirSync(uploadsDir);
  let totalSize = 0;
  let totalCount = 0;

  // Categorize files
  const categories = {
    images_webp: { count: 0, size: 0 },
    images_jpg: { count: 0, size: 0 },
    images_png: { count: 0, size: 0 },
    images_gif: { count: 0, size: 0 },
    images_other: { count: 0, size: 0 },
    videos: { count: 0, size: 0 },
    other: { count: 0, size: 0 }
  };

  // Track file sizes for finding largest files
  const fileDetails = [];

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;
      
      totalSize += stat.size;
      totalCount++;

      const ext = path.extname(file).toLowerCase();
      const detail = { name: file, size: stat.size, ext, mtime: stat.mtime };
      fileDetails.push(detail);

      if (ext === '.webp') categories.images_webp.count++, categories.images_webp.size += stat.size;
      else if (ext === '.jpg' || ext === '.jpeg') categories.images_jpg.count++, categories.images_jpg.size += stat.size;
      else if (ext === '.png') categories.images_png.count++, categories.images_png.size += stat.size;
      else if (ext === '.gif') categories.images_gif.count++, categories.images_gif.size += stat.size;
      else if (['.mp4', '.mov', '.webm', '.mkv', '.mpeg', '.avi'].includes(ext)) categories.videos.count++, categories.videos.size += stat.size;
      else if (['.svg', '.ico', '.bmp', '.tiff'].includes(ext)) categories.images_other.count++, categories.images_other.size += stat.size;
      else categories.other.count++, categories.other.size += stat.size;
    } catch (e) {
      // skip inaccessible files
    }
  }

  console.log(`\n   Total files: ${totalCount}`);
  console.log(`   Total size: ${formatBytes(totalSize)}`);
  console.log('\n   📊 Breakdown by type:');
  console.log(`   ┌─────────────────────┬─────────┬──────────────┐`);
  console.log(`   │ Type                │ Count   │ Size         │`);
  console.log(`   ├─────────────────────┼─────────┼──────────────┤`);
  for (const [key, val] of Object.entries(categories)) {
    if (val.count > 0) {
      const name = key.replace('_', ' ').padEnd(19);
      const count = String(val.count).padStart(7);
      const size = formatBytes(val.size).padStart(12);
      console.log(`   │ ${name} │ ${count} │ ${size} │`);
    }
  }
  console.log(`   └─────────────────────┴─────────┴──────────────┘`);

  // Top 20 largest files
  fileDetails.sort((a, b) => b.size - a.size);
  const top20 = fileDetails.slice(0, 20);
  console.log('\n   🏋️ Top 20 largest files:');
  for (let i = 0; i < top20.length; i++) {
    const f = top20[i];
    console.log(`   ${(i + 1 + '.').padEnd(4)} ${formatBytes(f.size).padStart(10)}  ${f.name}`);
  }

  return { files: fileDetails, totalSize, totalCount };
}

async function analyzeDatabaseSize() {
  console.log('\n🗄️  ==========================================');
  console.log('   DATABASE SIZE ANALYSIS');
  console.log('   ==========================================');

  try {
    // Total DB size
    const dbSize = await pool.query(`
      SELECT pg_database_size(current_database()) as db_size,
             pg_size_pretty(pg_database_size(current_database())) as db_size_pretty
    `);
    console.log(`\n   Total database size: ${dbSize.rows[0].db_size_pretty}`);

    // Table sizes
    const tableSizes = await pool.query(`
      SELECT 
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(oid)) as total_size,
        pg_total_relation_size(oid) as total_size_bytes,
        pg_size_pretty(pg_relation_size(oid)) as data_size,
        pg_size_pretty(pg_total_relation_size(oid) - pg_relation_size(oid)) as index_size,
        (SELECT count(*) FROM pg_class c2 WHERE c2.oid = pg_class.oid) as est_rows
      FROM pg_class
      WHERE relkind = 'r' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY pg_total_relation_size(oid) DESC
      LIMIT 20
    `);

    console.log('\n   📊 Top 20 largest tables:');
    console.log(`   ┌──────────────────────────────────┬──────────────┬──────────────┬──────────────┐`);
    console.log(`   │ Table                            │ Total        │ Data         │ Indexes      │`);
    console.log(`   ├──────────────────────────────────┼──────────────┼──────────────┼──────────────┤`);
    for (const row of tableSizes.rows) {
      const name = row.table_name.padEnd(32);
      const total = row.total_size.padStart(12);
      const data = row.data_size.padStart(12);
      const index = row.index_size.padStart(12);
      console.log(`   │ ${name} │ ${total} │ ${data} │ ${index} │`);
    }
    console.log(`   └──────────────────────────────────┴──────────────┴──────────────┴──────────────┘`);

    // Row counts for key tables
    const rowCounts = await pool.query(`
      SELECT 'products' as name, count(*) as cnt FROM products
      UNION ALL SELECT 'categories', count(*) FROM categories
      UNION ALL SELECT 'orders', count(*) FROM orders
      UNION ALL SELECT 'order_items', count(*) FROM order_items
      UNION ALL SELECT 'restaurants', count(*) FROM restaurants
      UNION ALL SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'broadcast_history', count(*) FROM broadcast_history
      ORDER BY cnt DESC
    `);

    console.log('\n   📈 Row counts:');
    for (const row of rowCounts.rows) {
      console.log(`      ${row.name}: ${Number(row.cnt).toLocaleString()}`);
    }

  } catch (e) {
    console.error('   Error analyzing DB:', e.message);
  }
}

async function findOrphanedFiles(fileDetails) {
  console.log('\n🔍 ==========================================');
  console.log('   ORPHANED FILES ANALYSIS');
  console.log('   ==========================================');

  try {
    // Collect all file references from DB
    const referencedFiles = new Set();

    // Products: image_url and thumb_url
    const products = await pool.query(`SELECT image_url, thumb_url FROM products WHERE image_url IS NOT NULL`);
    for (const row of products.rows) {
      if (row.image_url) referencedFiles.add(path.basename(row.image_url));
      if (row.thumb_url) referencedFiles.add(path.basename(row.thumb_url));
    }

    // Restaurants: logo_url
    const restaurants = await pool.query(`SELECT logo_url FROM restaurants WHERE logo_url IS NOT NULL`);
    for (const row of restaurants.rows) {
      if (row.logo_url) referencedFiles.add(path.basename(row.logo_url));
    }

    // Categories: logo_url (if exists)
    try {
      const cats = await pool.query(`SELECT logo_url FROM categories WHERE logo_url IS NOT NULL`);
      for (const row of cats.rows) {
        if (row.logo_url) referencedFiles.add(path.basename(row.logo_url));
      }
    } catch (e) { /* column may not exist */ }

    // Ad banners: image_url
    try {
      const ads = await pool.query(`SELECT image_url FROM ad_banners WHERE image_url IS NOT NULL`);
      for (const row of ads.rows) {
        if (row.image_url) referencedFiles.add(path.basename(row.image_url));
      }
    } catch (e) { /* table may not exist */ }

    // Broadcast history: image_url and video_url
    try {
      const broadcasts = await pool.query(`SELECT image_url, video_url FROM broadcast_history WHERE image_url IS NOT NULL OR video_url IS NOT NULL`);
      for (const row of broadcasts.rows) {
        if (row.image_url) referencedFiles.add(path.basename(row.image_url));
        if (row.video_url) referencedFiles.add(path.basename(row.video_url));
      }
    } catch (e) { /* table may not exist */ }

    // Scheduled broadcasts
    try {
      const sched = await pool.query(`SELECT image_url, video_url FROM scheduled_broadcasts WHERE image_url IS NOT NULL OR video_url IS NOT NULL`);
      for (const row of sched.rows) {
        if (row.image_url) referencedFiles.add(path.basename(row.image_url));
        if (row.video_url) referencedFiles.add(path.basename(row.video_url));
      }
    } catch (e) { /* table may not exist */ }

    // Driver verification files
    try {
      const drivers = await pool.query(`SELECT stored_filename FROM driver_verification_files WHERE stored_filename IS NOT NULL`);
      for (const row of drivers.rows) {
        if (row.stored_filename) referencedFiles.add(row.stored_filename);
      }
    } catch (e) { /* table may not exist */ }

    // Users: photo_url, avatar_url
    try {
      const users = await pool.query(`SELECT photo_url FROM users WHERE photo_url IS NOT NULL`);
      for (const row of users.rows) {
        if (row.photo_url) referencedFiles.add(path.basename(row.photo_url));
      }
    } catch (e) {}

    // Receipt logo
    try {
      const rlogo = await pool.query(`SELECT receipt_logo_url FROM restaurants WHERE receipt_logo_url IS NOT NULL`);
      for (const row of rlogo.rows) {
        if (row.receipt_logo_url) referencedFiles.add(path.basename(row.receipt_logo_url));
      }
    } catch (e) {}

    console.log(`\n   Files referenced in DB: ${referencedFiles.size}`);
    console.log(`   Files on disk: ${fileDetails.length}`);

    // Find orphans
    let orphanCount = 0;
    let orphanSize = 0;
    const orphansByExt = {};

    for (const f of fileDetails) {
      if (!referencedFiles.has(f.name)) {
        orphanCount++;
        orphanSize += f.size;
        const ext = f.ext || 'unknown';
        if (!orphansByExt[ext]) orphansByExt[ext] = { count: 0, size: 0 };
        orphansByExt[ext].count++;
        orphansByExt[ext].size += f.size;
      }
    }

    console.log(`\n   ⚠️  ORPHANED files (on disk but NOT in DB):`);
    console.log(`      Count: ${orphanCount}`);
    console.log(`      Size:  ${formatBytes(orphanSize)}`);
    
    if (Object.keys(orphansByExt).length > 0) {
      console.log('\n      By extension:');
      for (const [ext, val] of Object.entries(orphansByExt).sort((a, b) => b[1].size - a[1].size)) {
        console.log(`        ${ext}: ${val.count} files, ${formatBytes(val.size)}`);
      }
    }

    // Show top orphaned files by size
    const orphans = fileDetails
      .filter(f => !referencedFiles.has(f.name))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    
    if (orphans.length > 0) {
      console.log('\n      Top 10 largest orphans:');
      for (const f of orphans) {
        console.log(`        ${formatBytes(f.size).padStart(10)}  ${f.name}  (${f.mtime.toISOString().slice(0, 10)})`);
      }
    }

    return { orphanCount, orphanSize, referencedCount: referencedFiles.size };
  } catch (e) {
    console.error('   Error analyzing orphans:', e.message);
    return { orphanCount: 0, orphanSize: 0, referencedCount: 0 };
  }
}

async function analyzeVolumeRoot() {
  console.log('\n💾 ==========================================');
  console.log('   VOLUME ROOT ANALYSIS');
  console.log('   ==========================================');

  // Check common volume mount points on Railway
  const volumePaths = [
    '/app/uploads',
    '/data',
    '/var/lib/containers/railwayapp',
    uploadsDir
  ];

  for (const vp of volumePaths) {
    if (!fs.existsSync(vp)) continue;
    
    try {
      const items = fs.readdirSync(vp);
      let totalSize = 0;
      let fileCount = 0;
      let dirCount = 0;
      
      for (const item of items) {
        try {
          const stat = fs.statSync(path.join(vp, item));
          if (stat.isDirectory()) {
            dirCount++;
          } else {
            fileCount++;
            totalSize += stat.size;
          }
        } catch (e) {}
      }

      console.log(`\n   ${vp}:`);
      console.log(`     ${fileCount} files, ${dirCount} dirs, top-level total: ${formatBytes(totalSize)}`);
      
      // List subdirectories
      for (const item of items.slice(0, 30)) {
        try {
          const stat = fs.statSync(path.join(vp, item));
          if (stat.isDirectory()) {
            // Count recursively
            let subSize = 0;
            let subCount = 0;
            const walk = (dir) => {
              try {
                for (const f of fs.readdirSync(dir)) {
                  const p = path.join(dir, f);
                  try {
                    const s = fs.statSync(p);
                    if (s.isDirectory()) walk(p);
                    else { subSize += s.size; subCount++; }
                  } catch (_) {}
                }
              } catch (_) {}
            };
            walk(path.join(vp, item));
            console.log(`     📁 ${item}/ - ${subCount} files, ${formatBytes(subSize)}`);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.log(`   ${vp}: cannot read (${e.message})`);
    }
  }
}

async function generateSummary(uploadsData, orphanData) {
  console.log('\n\n🏆 ==========================================');
  console.log('   SUMMARY & RECOMMENDATIONS');
  console.log('   ==========================================');

  const usedByApp = uploadsData.totalSize - (orphanData?.orphanSize || 0);

  console.log(`\n   📊 Disk usage breakdown:`);
  console.log(`     Uploads (total):        ${formatBytes(uploadsData.totalSize)}`);
  console.log(`     ├─ Used by app (in DB): ${formatBytes(usedByApp)}`);
  console.log(`     └─ ORPHANS (wasted):    ${formatBytes(orphanData?.orphanSize || 0)} (${orphanData?.orphanCount || 0} files)`);

  console.log('\n   💡 Recommendations:');
  
  if ((orphanData?.orphanSize || 0) > 100 * 1024 * 1024) {
    console.log('   🔴 HIGH PRIORITY: Delete orphaned files to free ' + formatBytes(orphanData.orphanSize));
    console.log('      These are files uploaded but no longer referenced by any product/ad/broadcast.');
  }

  if (uploadsData.totalSize > 5 * 1024 * 1024 * 1024) {
    console.log('   🟡 Consider moving uploads to cloud storage (S3/Cloudflare R2)');
    console.log('      This would dramatically reduce volume usage and costs.');
  }

  console.log('   🟢 Add file cleanup: when products/ads are deleted, automatically remove their files.');
  console.log('   🟢 Enable image compression on existing files (already using WebP for new uploads).');
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   tandoorapp Volume Disk Usage Analyzer      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`   Date: ${new Date().toISOString()}`);

  const uploadsData = await analyzeUploadsDir();
  await analyzeDatabaseSize();
  const orphanData = await findOrphanedFiles(uploadsData.files);
  await analyzeVolumeRoot();
  await generateSummary(uploadsData, orphanData);

  await pool.end();
  console.log('\n✅ Analysis complete.\n');
}

main().catch(e => {
  console.error('Fatal error:', e);
  pool.end();
  process.exit(1);
});
