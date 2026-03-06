const PAYME_TRANSACTION_TIMEOUT_MS = 43_200_000;
const PAYME_DEFAULT_CALLBACK_TIMEOUT_MS = 2000;

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const amountToTiyin = (value) => Math.round(toNumber(value, 0) * 100);

const resolvePaymeAccountKey = (restaurant) => {
  const value = String(restaurant?.payme_account_key || '').trim();
  return value || 'order_id';
};

const normalizePaymeText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const isPaymeConfigured = (restaurant) => Boolean(
  restaurant
  && restaurant.payme_enabled
  && normalizePaymeText(restaurant.payme_merchant_id)
  && normalizePaymeText(restaurant.payme_api_login)
  && normalizePaymeText(restaurant.payme_api_password)
);

const buildPaymeErrorMessage = (ru, data = null) => ({
  ru,
  uz: ru,
  en: ru,
  ...(data !== null && data !== undefined ? { data } : {})
});

const buildPaymeRpcError = (id, code, ruMessage, data = null) => ({
  error: {
    code,
    message: {
      ru: ruMessage,
      uz: ruMessage,
      en: ruMessage
    },
    ...(data !== null && data !== undefined ? { data } : {})
  },
  id: id ?? null
});

const buildPaymeRpcSuccess = (id, result) => ({
  result,
  id: id ?? null
});

const parseBasicAuthorization = (headerValue) => {
  const raw = String(headerValue || '');
  if (!raw.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(raw.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;

    return {
      login: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch (error) {
    return null;
  }
};

const resolveRequestBaseUrl = (req) => {
  const protocolHeader = req.headers['x-forwarded-proto'];
  const protocol = String(protocolHeader || req.protocol || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${protocol}://${host}` : '';
};

const resolveFrontendBaseUrl = (req) => {
  const envUrl = normalizePaymeText(process.env.FRONTEND_URL);
  if (envUrl) return envUrl.replace(/\/+$/, '');

  const origin = normalizePaymeText(req.headers.origin);
  if (origin) return origin.replace(/\/+$/, '');

  return resolveRequestBaseUrl(req).replace(/\/+$/, '');
};

const encodePaymeCheckoutParams = (params) => Buffer.from(params, 'utf8').toString('base64');

const buildPaymeCheckoutUrl = ({
  merchantId,
  orderId,
  amountTiyin,
  accountKey = 'order_id',
  returnUrl,
  language = 'ru',
  callbackTimeoutMs = PAYME_DEFAULT_CALLBACK_TIMEOUT_MS,
  testMode = false
}) => {
  const parts = [
    `m=${merchantId}`,
    `ac.${accountKey}=${orderId}`,
    `a=${amountTiyin}`
  ];

  if (language) parts.push(`l=${language}`);
  if (returnUrl) parts.push(`c=${returnUrl}`);
  if (callbackTimeoutMs) parts.push(`ct=${callbackTimeoutMs}`);

  const payload = parts.join(';');
  const host = testMode ? 'https://test.paycom.uz' : 'https://checkout.paycom.uz';
  return `${host}/${encodePaymeCheckoutParams(payload)}`;
};

module.exports = {
  PAYME_TRANSACTION_TIMEOUT_MS,
  PAYME_DEFAULT_CALLBACK_TIMEOUT_MS,
  amountToTiyin,
  buildPaymeErrorMessage,
  buildPaymeRpcError,
  buildPaymeRpcSuccess,
  buildPaymeCheckoutUrl,
  isPaymeConfigured,
  normalizePaymeText,
  parseBasicAuthorization,
  resolveFrontendBaseUrl,
  resolvePaymeAccountKey
};
