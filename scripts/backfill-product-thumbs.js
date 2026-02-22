#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const pool = require('../server/database/connection');

const PRODUCT_THUMB_SIZE = 320;
const FETCH_TIMEOUT_MS = 15000;
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : null;

if (limitArg && (!Number.isFinite(limit) || limit <= 0)) {
  console.error('❌ Некорректный --limit. Пример: --limit=100');
  process.exit(1);
}

const buildFilename = (ext) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return `img-${uniqueSuffix}${ext}`;
};

const saveBufferToUploads = async (buffer, ext) => {
  const filename = buildFilename(ext);
  const filePath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return filename;
};

const resolveLocalUploadPath = (imageUrl) => {
  if (!imageUrl) return null;

  let pathname = null;
  const raw = String(imageUrl).trim();

  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return null;
    }
  } else {
    pathname = raw;
  }

  if (!pathname) return null;
  if (!pathname.startsWith('/uploads/') && !pathname.startsWith('uploads/')) return null;

  const filename = path.basename(pathname);
  if (!filename) return null;

  return path.join(uploadsDir, filename);
};

const loadImageBuffer = async (imageUrl) => {
  const localPath = resolveLocalUploadPath(imageUrl);
  if (localPath) {
    return fs.promises.readFile(localPath);
  }

  if (/^https?:\/\//i.test(String(imageUrl || '').trim())) {
    const response = await axios.get(String(imageUrl).trim(), {
      responseType: 'arraybuffer',
      timeout: FETCH_TIMEOUT_MS,
      maxContentLength: MAX_FETCH_BYTES,
      maxBodyLength: MAX_FETCH_BYTES,
      validateStatus: (status) => status >= 200 && status < 300
    });
    return Buffer.from(response.data);
  }

  throw new Error('Поддерживаются только /uploads/... или http(s) URL');
};

const createThumbBuffer = async (sourceBuffer) => {
  const metadata = await sharp(sourceBuffer, { failOnError: true, animated: true }).metadata();

  if (!metadata.format) {
    throw new Error('Не удалось определить формат изображения');
  }

  if ((metadata.pages || 1) > 1) {
    throw new Error('Анимированное изображение пропущено');
  }

  return sharp(sourceBuffer, { failOnError: true })
    .rotate()
    .resize({
      width: PRODUCT_THUMB_SIZE,
      height: PRODUCT_THUMB_SIZE,
      fit: 'cover',
      position: sharp.strategy.attention,
      withoutEnlargement: true
    })
    .webp({
      quality: 76,
      alphaQuality: 80,
      effort: 5,
      smartSubsample: true
    })
    .toBuffer();
};

async function main() {
  const startedAt = Date.now();
  const sourceCache = new Map();

  console.log(`🖼️  Backfill product thumbs started${dryRun ? ' (dry-run)' : ''}`);
  console.log(`📦 Uploads dir: ${uploadsDir}`);

  let query = `
    SELECT id, image_url
    FROM products
    WHERE COALESCE(TRIM(image_url), '') <> ''
      AND (thumb_url IS NULL OR TRIM(thumb_url) = '')
    ORDER BY id
  `;
  const params = [];

  if (limit) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
  }

  const { rows } = await pool.query(query, params);
  console.log(`🔎 Найдено товаров без thumb_url: ${rows.length}`);

  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    reused: 0
  };

  for (const row of rows) {
    stats.processed += 1;
    const imageUrl = String(row.image_url || '').trim();

    try {
      if (sourceCache.has(imageUrl)) {
        const cached = sourceCache.get(imageUrl);
        if (cached.ok) {
          if (!dryRun) {
            await pool.query(
              `UPDATE products
               SET thumb_url = $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2 AND (thumb_url IS NULL OR TRIM(thumb_url) = '')`,
              [cached.thumbUrl, row.id]
            );
          }
          stats.updated += 1;
          stats.reused += 1;
          console.log(`♻️  #${row.id}: reused ${cached.thumbUrl}`);
        } else {
          stats.skipped += 1;
          console.log(`⏭️  #${row.id}: skipped (same source failed earlier: ${cached.reason})`);
        }
        continue;
      }

      const sourceBuffer = await loadImageBuffer(imageUrl);
      const thumbBuffer = await createThumbBuffer(sourceBuffer);
      const thumbFilename = dryRun ? buildFilename('.webp') : await saveBufferToUploads(thumbBuffer, '.webp');
      const thumbUrl = `/uploads/${thumbFilename}`;

      sourceCache.set(imageUrl, { ok: true, thumbUrl });

      if (!dryRun) {
        await pool.query(
          `UPDATE products
           SET thumb_url = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND (thumb_url IS NULL OR TRIM(thumb_url) = '')`,
          [thumbUrl, row.id]
        );
      }

      stats.updated += 1;
      console.log(`✅ #${row.id}: ${thumbUrl}`);
    } catch (error) {
      const reason = error?.message || String(error);
      sourceCache.set(imageUrl, { ok: false, reason });

      if (/Анимированное изображение/.test(reason)) {
        stats.skipped += 1;
        console.log(`⏭️  #${row.id}: ${reason}`);
      } else {
        stats.failed += 1;
        console.log(`❌ #${row.id}: ${reason}`);
      }
    }
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log('📊 Итог:');
  console.log(`- processed: ${stats.processed}`);
  console.log(`- updated: ${stats.updated}`);
  console.log(`- reused: ${stats.reused}`);
  console.log(`- skipped: ${stats.skipped}`);
  console.log(`- failed: ${stats.failed}`);
  console.log(`- duration: ${durationSec}s`);
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (error) {
      console.error('⚠️  pool.end() error:', error.message);
    }
  });
