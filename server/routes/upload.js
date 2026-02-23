const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { authenticate, requireOperator } = require('../middleware/auth');

const router = express.Router();

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
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: fileFilter
});

const PRODUCT_MAX_WIDTH = 1600;
const PRODUCT_MAX_HEIGHT = 1600;
const PRODUCT_THUMB_SIZE = 320;
const AD_MAX_WIDTH = 1920;
const AD_MAX_HEIGHT = 1080;
const DEFAULT_MAX_WIDTH = 2400;
const DEFAULT_MAX_HEIGHT = 2400;

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

  let pipeline = sharp(file.buffer, { failOnError: true })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true
    });

  // Для карточек товара и рекламных баннеров используем WebP как основной формат.
  if (isProductPreset || isAdPreset) {
    const outputBuffer = await pipeline
      .webp({
        quality: isAdPreset ? 80 : 82,
        alphaQuality: 85,
        effort: 5,
        smartSubsample: true
      })
      .toBuffer();

    const filename = await saveBufferToUploads(outputBuffer, '.webp');

    if (!isProductPreset) {
      return makeUploadResult(filename);
    }

    const thumbBuffer = await sharp(file.buffer, { failOnError: true })
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

    const thumbFilename = await saveBufferToUploads(thumbBuffer, '.webp');
    return makeUploadResult(filename, thumbFilename);
  }

  const format = metadata.format.toLowerCase();

  if (format === 'jpeg' || format === 'jpg') {
    const outputBuffer = await pipeline
      .jpeg({
        quality: 84,
        mozjpeg: true,
        progressive: true
      })
      .toBuffer();

    const filename = await saveBufferToUploads(outputBuffer, '.jpg');
    return makeUploadResult(filename);
  }

  if (format === 'png') {
    const outputBuffer = await pipeline
      .png({
        compressionLevel: 9,
        palette: true,
        effort: 8
      })
      .toBuffer();

    const filename = await saveBufferToUploads(outputBuffer, '.png');
    return makeUploadResult(filename);
  }

  if (format === 'webp') {
    const outputBuffer = await pipeline
      .webp({
        quality: 82,
        alphaQuality: 85,
        effort: 5,
        smartSubsample: true
      })
      .toBuffer();

    const filename = await saveBufferToUploads(outputBuffer, '.webp');
    return makeUploadResult(filename);
  }

  // Фолбэк для редко встречающихся форматов: сохраняем оригинал как есть.
  const fallbackExt = path.extname(file.originalname) || `.${format}`;
  const filename = await saveBufferToUploads(file.buffer, fallbackExt.toLowerCase());
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
