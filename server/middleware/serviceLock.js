const { SERVICE_KEY, getServiceState } = require('../services/serviceControl');

const bypassPrefixes = [
  '/api/service-control',
  '/version.json',
  '/api/health',
  '/uploads',
  '/favicon.ico'
];

const isStaticAsset = (path) => (
  path.startsWith('/assets/')
  || path.endsWith('.js')
  || path.endsWith('.css')
  || path.endsWith('.png')
  || path.endsWith('.jpg')
  || path.endsWith('.jpeg')
  || path.endsWith('.svg')
  || path.endsWith('.ico')
  || path.endsWith('.webp')
  || path.endsWith('.woff')
  || path.endsWith('.woff2')
  || path.endsWith('.mp3')
  || path.endsWith('.mp4')
);

const serviceLockMiddleware = async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  const path = req.path || '';
  if (bypassPrefixes.some((prefix) => path.startsWith(prefix)) || isStaticAsset(path)) {
    return next();
  }

  let state;
  try {
    state = await getServiceState(SERVICE_KEY);
  } catch (error) {
    console.warn('Service lock check failed:', error?.message || error);
    return next();
  }

  if (!state?.success || state.enabled) return next();

  if (path.startsWith('/api/telegram/webhook')) {
    return res.status(200).json({ ok: true, service_locked: true });
  }

  if (path.startsWith('/api/')) {
    return res.status(423).json({
      success: false,
      service_locked: true,
      message: state.message,
      phone: state.support_phone
    });
  }

  if (req.method === 'GET' || req.method === 'HEAD') return next();

  return res.status(423).json({
    success: false,
    service_locked: true,
    message: state.message,
    phone: state.support_phone
  });
};

module.exports = serviceLockMiddleware;
