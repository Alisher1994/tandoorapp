const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const {
  ensurePrintFormSettingsSchema,
  normalizePrintFormQrPosition,
  DEFAULT_PRINT_FORM_CAPTION_RU,
  DEFAULT_PRINT_FORM_CAPTION_UZ
} = require('./printFormSettings');

const A5_WIDTH_PX_300_DPI = 1748;
const A5_HEIGHT_PX_300_DPI = 2480;
const A5_WIDTH_PT = 419.5276;
const A5_HEIGHT_PT = 595.2756;
const DEFAULT_QR_SIZE_PX = 760;

const resolveUploadsDir = () => (
  process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '../../uploads')
);

const ensureDirExists = async (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
};

const escapeSvgText = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const resolveLocalUploadPath = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('/uploads/')) {
    const relativePath = value.replace(/^\/uploads\//, '');
    return path.join(resolveUploadsDir(), relativePath);
  }
  if (value.startsWith('uploads/')) {
    const relativePath = value.replace(/^uploads\//, '');
    return path.join(resolveUploadsDir(), relativePath);
  }
  return null;
};

const loadBackgroundBuffer = async (rawUrl) => {
  const normalized = String(rawUrl || '').trim();
  if (!normalized) return null;

  if (/^https?:\/\//i.test(normalized)) {
    const response = await axios.get(normalized, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(response.data);
  }

  const localPath = resolveLocalUploadPath(normalized);
  if (!localPath) return null;
  if (!fs.existsSync(localPath)) return null;
  return fs.promises.readFile(localPath);
};

const buildTextOverlaySvg = ({
  botUsername,
  caption,
  usernameY,
  captionY
}) => `
<svg width="${A5_WIDTH_PX_300_DPI}" height="${A5_HEIGHT_PX_300_DPI}" viewBox="0 0 ${A5_WIDTH_PX_300_DPI} ${A5_HEIGHT_PX_300_DPI}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.16" />
    </filter>
  </defs>
  <text
    x="50%"
    y="${usernameY}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="76"
    font-weight="700"
    fill="#111111"
    filter="url(#softShadow)"
  >${escapeSvgText(botUsername)}</text>
  <text
    x="50%"
    y="${captionY}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="52"
    font-weight="600"
    fill="#1f2937"
  >${escapeSvgText(caption)}</text>
</svg>
`;

const buildQrBackgroundSvg = ({ x, y, size }) => `
<svg width="${A5_WIDTH_PX_300_DPI}" height="${A5_HEIGHT_PX_300_DPI}" viewBox="0 0 ${A5_WIDTH_PX_300_DPI} ${A5_HEIGHT_PX_300_DPI}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${x - 34}" y="${y - 34}" width="${size + 68}" height="${size + 68}" rx="48" ry="48" fill="white" fill-opacity="0.94" />
</svg>
`;

const createBaseCanvas = async (backgroundBuffer) => {
  if (!backgroundBuffer) {
    return sharp({
      create: {
        width: A5_WIDTH_PX_300_DPI,
        height: A5_HEIGHT_PX_300_DPI,
        channels: 3,
        background: '#f8fafc'
      }
    }).png({ quality: 100 }).toBuffer();
  }

  return sharp(backgroundBuffer)
    .rotate()
    .resize({
      width: A5_WIDTH_PX_300_DPI,
      height: A5_HEIGHT_PX_300_DPI,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: false
    })
    .png({ quality: 100 })
    .toBuffer();
};

const createPdfFromPng = async (pngBuffer) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A5_WIDTH_PT, A5_HEIGHT_PT]);
  const image = await pdfDoc.embedPng(pngBuffer);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: A5_WIDTH_PT,
    height: A5_HEIGHT_PT
  });
  return Buffer.from(await pdfDoc.save());
};

const generateStorePrintForm = async ({
  restaurantId,
  botUsername,
  botLink,
  language = 'ru',
  settings = {}
}) => {
  if (!botLink) throw new Error('BOT_LINK_REQUIRED');

  await ensurePrintFormSettingsSchema();

  const normalizedLanguage = String(language || '').trim().toLowerCase().startsWith('uz') ? 'uz' : 'ru';
  const qrPosition = normalizePrintFormQrPosition(settings.print_form_qr_position, 'center');
  const caption = normalizedLanguage === 'uz'
    ? String(settings.print_form_caption_uz || DEFAULT_PRINT_FORM_CAPTION_UZ).trim()
    : String(settings.print_form_caption_ru || DEFAULT_PRINT_FORM_CAPTION_RU).trim();

  const qrSize = DEFAULT_QR_SIZE_PX;
  const centerX = Math.round(A5_WIDTH_PX_300_DPI * 0.5);
  const centerY = qrPosition === 'lower'
    ? Math.round(A5_HEIGHT_PX_300_DPI * 0.60)
    : Math.round(A5_HEIGHT_PX_300_DPI * 0.45);
  const qrX = Math.round(centerX - qrSize / 2);
  const qrY = Math.round(centerY - qrSize / 2);
  const usernameY = qrY + qrSize + 130;
  const captionY = qrY + qrSize + 220;

  let backgroundBuffer = null;
  try {
    backgroundBuffer = await loadBackgroundBuffer(settings.print_form_background_url);
  } catch (error) {
    console.warn('Print form background load warning:', error.message);
  }

  const baseCanvasBuffer = await createBaseCanvas(backgroundBuffer);
  const qrBuffer = await QRCode.toBuffer(botLink, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: qrSize,
    type: 'png',
    color: {
      dark: '#111111',
      light: '#FFFFFF'
    }
  });

  const qrBackgroundSvg = buildQrBackgroundSvg({ x: qrX, y: qrY, size: qrSize });
  const textSvg = buildTextOverlaySvg({
    botUsername: botUsername || botLink,
    caption,
    usernameY,
    captionY
  });

  const compositedPng = await sharp(baseCanvasBuffer)
    .composite([
      { input: Buffer.from(qrBackgroundSvg), top: 0, left: 0 },
      { input: qrBuffer, top: qrY, left: qrX },
      { input: Buffer.from(textSvg), top: 0, left: 0 }
    ])
    .withMetadata({ density: 300 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  const pdfBuffer = await createPdfFromPng(compositedPng);

  const uploadsDir = resolveUploadsDir();
  const printFormsDir = path.join(uploadsDir, 'print_forms');
  await ensureDirExists(printFormsDir);

  const baseName = `print-form-${Number(restaurantId) || 'shop'}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const pngFilename = `${baseName}.png`;
  const pdfFilename = `${baseName}.pdf`;
  const pngPath = path.join(printFormsDir, pngFilename);
  const pdfPath = path.join(printFormsDir, pdfFilename);

  await fs.promises.writeFile(pngPath, compositedPng);
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  return {
    png_url: `/uploads/print_forms/${pngFilename}`,
    pdf_url: `/uploads/print_forms/${pdfFilename}`
  };
};

module.exports = {
  generateStorePrintForm,
  A5_WIDTH_PX_300_DPI,
  A5_HEIGHT_PX_300_DPI
};
