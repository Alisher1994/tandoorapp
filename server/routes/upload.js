const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { authenticate, requireOperator } = require('../middleware/auth');

const router = express.Router();
const MAX_UPLOAD_FILE_SIZE_BYTES = 12 * 1024 * 1024;

// Настройка multer для сохранения файлов
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
console.log('📦 Uploads dir:', uploadsDir);

const fileFilter = (req, file, cb) => {
  // Разрешаем только изображения
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Только изображения разрешены!'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES // 12MB
  },
  fileFilter: fileFilter
});

const PRODUCT_MAX_WIDTH = 1280;
const PRODUCT_MAX_HEIGHT = 1280;
const PRODUCT_THUMB_SIZE = 220;
const AD_MAX_WIDTH = 1600;
const AD_MAX_HEIGHT = 900;
const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_MAX_HEIGHT = 1280;

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

const makeUploadResult = (filename, thumbFilename = null) => ({
  filename,
  ...(thumbFilename ? { thumbFilename } : {})
});

const resolveWebpOptions = (preset) => {
  if (preset === 'product') {
    return {
      quality: 68,
      alphaQuality: 72,
      effort: 6,
      smartSubsample: true
    };
  }

  if (preset === 'ad' || preset === 'ad_banner') {
    return {
      quality: 70,
      alphaQuality: 74,
      effort: 6,
      smartSubsample: true
    };
  }

  return {
    quality: 64,
    alphaQuality: 70,
    effort: 6,
    smartSubsample: true
  };
};

const optimizeAndSaveImage = async (file, preset) => {
  const source = sharp(file.buffer, { failOnError: true, animated: true });
  const metadata = await source.metadata();

  if (!metadata.format) {
    throw new Error('Не удалось определить формат изображения');
  }

  const isAnimated = (metadata.pages || 1) > 1;

  // Не трогаем анимированные изображения, чтобы не ломать анимацию (например GIF/WebP).
  if (isAnimated) {
    const originalExt = path.extname(file.originalname) || `.${metadata.format}`;
    const filename = await saveBufferToUploads(file.buffer, originalExt.toLowerCase());
    return makeUploadResult(filename);
  }

  const isProductPreset = preset === 'product';
  const isAdPreset = preset === 'ad' || preset === 'ad_banner';
  const maxWidth = isProductPreset ? PRODUCT_MAX_WIDTH : (isAdPreset ? AD_MAX_WIDTH : DEFAULT_MAX_WIDTH);
  const maxHeight = isProductPreset ? PRODUCT_MAX_HEIGHT : (isAdPreset ? AD_MAX_HEIGHT : DEFAULT_MAX_HEIGHT);

  const pipeline = sharp(file.buffer, { failOnError: true })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
      fastShrinkOnLoad: true
    });

  // Все статичные изображения перекодируем в WebP, чтобы агрессивно уменьшить вес.
  const outputBuffer = await pipeline
    .webp(resolveWebpOptions(preset))
    .toBuffer();

  const filename = await saveBufferToUploads(outputBuffer, '.webp');

  if (isProductPreset) {
    const thumbBuffer = await sharp(file.buffer, { failOnError: true })
      .rotate()
      .resize({
        width: PRODUCT_THUMB_SIZE,
        height: PRODUCT_THUMB_SIZE,
        fit: 'cover',
        position: sharp.strategy.attention,
        withoutEnlargement: true,
        fastShrinkOnLoad: true
      })
      .webp({
        quality: 56,
        alphaQuality: 64,
        effort: 6,
        smartSubsample: true
      })
      .toBuffer();

    const thumbFilename = await saveBufferToUploads(thumbBuffer, '.webp');
    return makeUploadResult(filename, thumbFilename);
  }

  return makeUploadResult(filename);
};

const handleUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const preset = typeof req.body?.preset === 'string' ? req.body.preset : '';
    const { filename, thumbFilename } = await optimizeAndSaveImage(req.file, preset);
    const fileUrl = `/uploads/${filename}`;
    const thumbUrl = thumbFilename ? `/uploads/${thumbFilename}` : null;

    return res.json({
      imageUrl: fileUrl,
      url: fileUrl,
      filename,
      ...(thumbUrl ? { thumbUrl, thumb_url: thumbUrl, thumbFilename } : {})
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
};

// Загрузка изображения (для операторов и superadmin)
// POST /api/upload - основной endpoint
router.post('/', authenticate, requireOperator, upload.single('image'), handleUpload);

// Также поддерживаем /api/upload/image для обратной совместимости
router.post('/image', authenticate, requireOperator, upload.single('image'), handleUpload);

module.exports = router;
