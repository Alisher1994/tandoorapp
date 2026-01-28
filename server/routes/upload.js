const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Разрешаем только изображения
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Только изображения разрешены!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: fileFilter
});

// Загрузка изображения (для операторов и superadmin)
// POST /api/upload - основной endpoint
router.post('/', authenticate, requireOperator, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Возвращаем URL для доступа к файлу
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      imageUrl: fileUrl,
      url: fileUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// Также поддерживаем /api/upload/image для обратной совместимости
router.post('/image', authenticate, requireOperator, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      imageUrl: fileUrl,
      url: fileUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

module.exports = router;
