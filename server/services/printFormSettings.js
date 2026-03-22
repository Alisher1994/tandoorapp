const pool = require('../database/connection');

const PRINT_FORM_QR_POSITIONS = new Set(['center', 'lower']);
const DEFAULT_PRINT_FORM_CAPTION_RU = 'Сканируй и заказывай';
const DEFAULT_PRINT_FORM_CAPTION_UZ = 'Skanerlang va buyurtma bering';

const normalizePrintFormQrPosition = (value, fallback = 'center') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (PRINT_FORM_QR_POSITIONS.has(normalized)) return normalized;
  return PRINT_FORM_QR_POSITIONS.has(String(fallback || '').trim().toLowerCase()) ? String(fallback).trim().toLowerCase() : 'center';
};

const normalizePrintFormBackgroundUrl = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const normalizePrintFormCaption = (value, fallback) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  return normalized || fallback;
};

let printFormSchemaReady = false;
let printFormSchemaPromise = null;

const ensurePrintFormSettingsSchema = async () => {
  if (printFormSchemaReady) return;
  if (printFormSchemaPromise) {
    await printFormSchemaPromise;
    return;
  }

  printFormSchemaPromise = (async () => {
    await pool.query(`ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS print_form_background_url TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS print_form_qr_position VARCHAR(16) DEFAULT 'center'`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ALTER COLUMN print_form_qr_position SET DEFAULT 'center'`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS print_form_caption_ru TEXT DEFAULT 'Сканируй и заказывай'`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS print_form_caption_uz TEXT DEFAULT 'Skanerlang va buyurtma bering'`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ALTER COLUMN print_form_caption_ru SET DEFAULT 'Сканируй и заказывай'`).catch(() => {});
    await pool.query(`ALTER TABLE billing_settings ALTER COLUMN print_form_caption_uz SET DEFAULT 'Skanerlang va buyurtma bering'`).catch(() => {});
    await pool.query(`
      UPDATE billing_settings
      SET print_form_qr_position = 'center'
      WHERE print_form_qr_position IS NULL
         OR BTRIM(print_form_qr_position) = ''
         OR LOWER(print_form_qr_position) NOT IN ('center', 'lower')
    `).catch(() => {});
    await pool.query(`
      UPDATE billing_settings
      SET print_form_caption_ru = $1
      WHERE print_form_caption_ru IS NULL OR BTRIM(print_form_caption_ru) = ''
    `, [DEFAULT_PRINT_FORM_CAPTION_RU]).catch(() => {});
    await pool.query(`
      UPDATE billing_settings
      SET print_form_caption_uz = $1
      WHERE print_form_caption_uz IS NULL OR BTRIM(print_form_caption_uz) = ''
    `, [DEFAULT_PRINT_FORM_CAPTION_UZ]).catch(() => {});
    await pool.query(`
      ALTER TABLE billing_settings
      ADD CONSTRAINT IF NOT EXISTS billing_settings_print_form_qr_position_check
      CHECK (print_form_qr_position IN ('center', 'lower'))
    `).catch(() => {});
    printFormSchemaReady = true;
  })();

  try {
    await printFormSchemaPromise;
  } finally {
    printFormSchemaPromise = null;
  }
};

const normalizePrintFormSettingsPayload = (raw = {}) => ({
  print_form_background_url: normalizePrintFormBackgroundUrl(raw.print_form_background_url),
  print_form_qr_position: normalizePrintFormQrPosition(raw.print_form_qr_position, 'center'),
  print_form_caption_ru: normalizePrintFormCaption(raw.print_form_caption_ru, DEFAULT_PRINT_FORM_CAPTION_RU),
  print_form_caption_uz: normalizePrintFormCaption(raw.print_form_caption_uz, DEFAULT_PRINT_FORM_CAPTION_UZ)
});

module.exports = {
  PRINT_FORM_QR_POSITIONS,
  DEFAULT_PRINT_FORM_CAPTION_RU,
  DEFAULT_PRINT_FORM_CAPTION_UZ,
  normalizePrintFormQrPosition,
  normalizePrintFormBackgroundUrl,
  normalizePrintFormCaption,
  normalizePrintFormSettingsPayload,
  ensurePrintFormSettingsSchema
};
