const path = require('path');

const MEDIA_REFERENCE_KEYS = new Set([
  'image',
  'image_url',
  'imageUrl',
  'thumb',
  'thumb_url',
  'thumbUrl',
  'video_url',
  'videoUrl',
  'logo_url',
  'photo_url',
  'file_url',
  'url'
]);

function addUploadBasename(referenced, value) {
  if (typeof value !== 'string') return;

  const normalized = value.trim().replace(/\\/g, '/').split(/[?#]/, 1)[0];
  if (!normalized) return;

  const filename = path.posix.basename(normalized);
  if (filename && filename !== '.' && filename !== '/') {
    referenced.add(filename);
  }
}

function collectJsonUploadReferences(value, referenced) {
  if (typeof value === 'string') {
    addUploadBasename(referenced, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonUploadReferences(item, referenced));
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value)) {
    if (MEDIA_REFERENCE_KEYS.has(key)) {
      collectJsonUploadReferences(nestedValue, referenced);
      continue;
    }

    // Variant media is nested under containers such as
    // size_options[].product_images.
    if (nestedValue && typeof nestedValue === 'object') {
      collectJsonUploadReferences(nestedValue, referenced);
    }
  }
}

module.exports = {
  addUploadBasename,
  collectJsonUploadReferences
};
