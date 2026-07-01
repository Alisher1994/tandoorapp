/**
 * One-time cleanup: delete ALL old print forms from /data/uploads/print_forms/
 * 
 * This is safe to run because print forms are regenerated on demand.
 * Users just click "Generate" again and get a fresh one.
 * 
 * Usage: node server/scripts/cleanup-print-forms.js
 * Add --dry-run to preview without deleting
 */

const fs = require('fs');
const path = require('path');

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

const printFormsDir = path.join(uploadsDir, 'print_forms');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`🧹 Print Forms Cleanup${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`   Directory: ${printFormsDir}`);

  if (!fs.existsSync(printFormsDir)) {
    console.log('   Directory does not exist. Nothing to clean.');
    return;
  }

  const files = await fs.promises.readdir(printFormsDir);
  console.log(`   Found ${files.length} files`);

  if (files.length === 0) {
    console.log('   Already clean!');
    return;
  }

  // Calculate total size
  let totalSize = 0;
  for (const file of files) {
    try {
      const stat = await fs.promises.stat(path.join(printFormsDir, file));
      totalSize += stat.size;
    } catch (_) {}
  }

  const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
  console.log(`   Total size: ${sizeGB} GB (${sizeMB} MB)`);

  if (dryRun) {
    console.log('\n   ⚠️  DRY RUN - no files deleted. Remove --dry-run to actually delete.');
    return;
  }

  // Delete all files in batches of 500
  let deleted = 0;
  let failed = 0;
  const batchSize = 500;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(batch.map(async (file) => {
      try {
        await fs.promises.unlink(path.join(printFormsDir, file));
        deleted++;
      } catch (e) {
        failed++;
      }
    }));
    
    const progress = Math.min(100, Math.round(((i + batch.length) / files.length) * 100));
    process.stdout.write(`\r   Deleting... ${progress}% (${deleted} deleted, ${failed} failed)`);
  }

  console.log(`\n\n   ✅ Done! Deleted ${deleted} files, freed ~${sizeGB} GB`);
  if (failed > 0) {
    console.log(`   ⚠️  ${failed} files could not be deleted`);
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
