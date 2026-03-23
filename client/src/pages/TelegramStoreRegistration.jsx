import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './TelegramStoreRegistration.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getApiOrigin = () => {
  if (typeof window === 'undefined') return '';
  if (/^https?:\/\//i.test(API_URL)) {
    return API_URL.replace(/\/api\/?$/i, '').replace(/\/$/, '');
  }
  return window.location.origin;
};

const toAbsoluteUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const origin = getApiOrigin();
  if (!origin) return value;
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
};

const normalizeLang = (value) => String(value || '').toLowerCase().startsWith('uz') ? 'uz' : 'ru';
const waitForTelegramInitData = async (telegramWebApp, attempts = 20, delayMs = 220) => {
  for (let i = 0; i < attempts; i += 1) {
    const snapshot = String(telegramWebApp?.initData || '').trim();
    if (snapshot) return snapshot;
    await sleep(delayMs);
  }
  return '';
};

const parseInitDataFromUrl = () => {
  if (typeof window === 'undefined') return '';

  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = String(
    searchParams.get('init_data')
    || searchParams.get('tgWebAppData')
    || ''
  ).trim();
  if (fromSearch) return decodeURIComponent(fromSearch);

  const rawHash = String(window.location.hash || '').replace(/^#/, '');
  if (!rawHash) return '';
  const hashParams = new URLSearchParams(rawHash);
  const fromHash = String(hashParams.get('tgWebAppData') || '').trim();
  return fromHash ? decodeURIComponent(fromHash) : '';
};

const parseLaunchTokenFromUrl = () => {
  if (typeof window === 'undefined') return '';

  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = String(searchParams.get('launch_token') || '').trim();
  if (fromSearch) return fromSearch;

  const rawHash = String(window.location.hash || '').replace(/^#/, '');
  if (!rawHash) return '';
  const hashParams = new URLSearchParams(rawHash);
  return String(hashParams.get('launch_token') || '').trim();
};

const i18n = {
  ru: {
    title: 'Регистрация магазина',
    subtitle: 'Упрощенная регистрация через Telegram Web App',
    loading: 'Загрузка данных...',
    save: 'Сохранить',
    saving: 'Сохранение...',
    close: 'Закрыть',
    openPanel: 'Открыть панель',
    openBot: 'Открыть бота',
    downloadPdf: 'Скачать PDF',
    geo: 'Определить локацию',
    geoInProgress: 'Определяем...',
    geoReady: 'Локация получена',
    geoMissing: 'Локация не указана',
    storeName: 'Название магазина',
    activity: 'Вид деятельности',
    fullName: 'ФИО оператора',
    phone: 'Телефон',
    latitude: 'Широта',
    longitude: 'Долгота',
    logo: 'Логотип (необязательно)',
    logoPick: 'Выбрать фото',
    logoRemove: 'Удалить фото',
    logoUploading: 'Загрузка фото...',
    logoEmpty: 'Фото логотипа не выбрано',
    logoImageOnly: 'Можно выбрать только файл изображения',
    logoUploadError: 'Ошибка загрузки логотипа',
    botToken: 'Токен бота (необязательно)',
    groupId: 'ID группы для заказов (необязательно)',
    selectActivity: 'Выберите вид деятельности',
    siteLink: 'Ссылка на сайт',
    credentials: 'Реквизиты доступа',
    username: 'Логин',
    password: 'Пароль',
    botSection: 'Инструменты для печати',
    botUsername: 'Бот',
    success: 'Регистрация завершена',
    successHint: 'Данные также отправлены вам в личный чат бота.',
    openSiteLabel: 'Открыть сайт магазина',
    initDataMissing: 'Откройте форму через кнопку регистрации внутри Telegram-бота.'
  },
  uz: {
    title: "Do'kon ro'yxatdan o'tkazish",
    subtitle: 'Telegram Web App orqali soddalashtirilgan ro‘yxatdan o‘tish',
    loading: "Ma'lumotlar yuklanmoqda...",
    save: 'Saqlash',
    saving: 'Saqlanmoqda...',
    close: 'Yopish',
    openPanel: 'Panelni ochish',
    openBot: 'Botni ochish',
    downloadPdf: 'PDF yuklab olish',
    geo: 'Lokatsiyani aniqlash',
    geoInProgress: 'Aniqlanmoqda...',
    geoReady: 'Lokatsiya olindi',
    geoMissing: "Lokatsiya ko'rsatilmagan",
    storeName: "Do'kon nomi",
    activity: 'Faoliyat turi',
    fullName: 'Operator F.I.Sh.',
    phone: 'Telefon',
    latitude: 'Kenglik',
    longitude: "Uzunlik",
    logo: 'Logotip (ixtiyoriy)',
    logoPick: 'Rasm tanlash',
    logoRemove: "Rasmni o'chirish",
    logoUploading: 'Rasm yuklanmoqda...',
    logoEmpty: 'Logotip rasmi tanlanmagan',
    logoImageOnly: 'Faqat rasm faylini tanlash mumkin',
    logoUploadError: 'Logotipni yuklashda xatolik',
    botToken: 'Bot tokeni (ixtiyoriy)',
    groupId: 'Buyurtmalar guruhi ID (ixtiyoriy)',
    selectActivity: 'Faoliyat turini tanlang',
    siteLink: 'Sayt havolasi',
    credentials: 'Kirish ma’lumotlari',
    username: 'Login',
    password: 'Parol',
    botSection: 'Chop etish uchun vositalar',
    botUsername: 'Bot',
    success: "Ro'yxatdan o'tish yakunlandi",
    successHint: "Ma'lumotlar botdagi shaxsiy chatga ham yuborildi.",
    openSiteLabel: 'Do‘kon saytini ochish',
    initDataMissing: "Formani Telegram bot ichidagi ro'yxatdan o'tish tugmasi orqali oching."
  }
};

function TelegramStoreRegistration() {
  const [lang, setLang] = useState('ru');
  const [initData, setInitData] = useState('');
  const [launchToken, setLaunchToken] = useState('');
  const [activityTypes, setActivityTypes] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const logoFileInputRef = useRef(null);
  const [form, setForm] = useState({
    store_name: '',
    activity_type_id: '',
    full_name: '',
    phone: '',
    latitude: '',
    longitude: '',
    logo_url: '',
    bot_token: '',
    group_id: ''
  });

  const dict = i18n[lang] || i18n.ru;

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        try {
          tg.ready();
          tg.expand();
        } catch (_) {}
        const telegramLang = normalizeLang(tg.initDataUnsafe?.user?.language_code);
        setLang(telegramLang);
      }

      const queryData = parseInitDataFromUrl();
      const fallbackLaunchToken = parseLaunchTokenFromUrl();
      if (fallbackLaunchToken) {
        setLaunchToken(fallbackLaunchToken);
      }
      let effectiveInitData = String(tg?.initData || queryData || '').trim();
      if (!effectiveInitData && tg) {
        effectiveInitData = await waitForTelegramInitData(tg, 24, 220);
      }
      if (cancelled) return;

      setInitData(effectiveInitData);
      if (!effectiveInitData && !fallbackLaunchToken) {
        setLoadingMeta(false);
        return;
      }

      try {
        setLoadingMeta(true);
        const response = await axios.post(`${API_URL}/auth/telegram-webapp-store-registration/meta`, {
          init_data: effectiveInitData || undefined,
          launch_token: fallbackLaunchToken || undefined
        });
        if (cancelled) return;

        const suggestedFullName = String(response.data?.suggested_full_name || '').trim();
        const tgUser = response.data?.telegram_user || {};
        const fallbackName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
        const nextName = suggestedFullName || fallbackName;
        setActivityTypes(Array.isArray(response.data?.activity_types) ? response.data.activity_types : []);
        setForm((prev) => ({
          ...prev,
          full_name: prev.full_name || nextName
        }));
      } catch (metaError) {
        if (!cancelled) {
          setError(metaError?.response?.data?.error || 'Ошибка загрузки метаданных регистрации');
        }
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestGeoLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus(dict.geoMissing);
      return;
    }
    setGeoLoading(true);
    setGeoStatus('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoLoading(false);
        setForm((prev) => ({
          ...prev,
          latitude: String(position.coords.latitude.toFixed(6)),
          longitude: String(position.coords.longitude.toFixed(6))
        }));
        setGeoStatus(dict.geoReady);
      },
      () => {
        setGeoLoading(false);
        setGeoStatus(dict.geoMissing);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setError(dict.logoImageOnly);
      return;
    }

    try {
      setLogoUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('image', file);
      if (initData) formData.append('init_data', initData);
      if (launchToken) formData.append('launch_token', launchToken);
      const response = await axios.post(`${API_URL}/auth/telegram-webapp-store-registration/upload-logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const uploadedUrl = response.data?.url || response.data?.imageUrl || '';
      if (!uploadedUrl) {
        throw new Error('Не удалось загрузить фото');
      }
      setForm((prev) => ({
        ...prev,
        logo_url: uploadedUrl
      }));
    } catch (uploadError) {
      setError(uploadError?.response?.data?.error || dict.logoUploadError);
    } finally {
      setLogoUploading(false);
    }
  };

  const removeUploadedLogo = () => {
    setForm((prev) => ({
      ...prev,
      logo_url: ''
    }));
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = '';
    }
  };

  const canSubmit = useMemo(() => (
    Boolean(initData || launchToken)
    && form.store_name.trim()
    && form.activity_type_id
    && form.full_name.trim()
    && form.phone.trim()
    && form.latitude.trim()
    && form.longitude.trim()
  ), [initData, launchToken, form]);

  const sendWebAppCompletionSignal = () => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.sendData) return;
    try {
      tg.sendData(JSON.stringify({
        type: 'store_registration_completed',
        lang
      }));
    } catch (_) {}
  };

  const closeWebApp = () => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.close) return;
    try {
      tg.close();
    } catch (_) {}
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || saving) return;

    try {
      setSaving(true);
      setError('');
      const payload = {
        ...form,
        activity_type_id: Number(form.activity_type_id),
        init_data: initData || undefined,
        launch_token: launchToken || undefined,
        lang
      };
      const response = await axios.post(`${API_URL}/auth/telegram-webapp-store-registration/complete`, payload);
      setSuccessData(response.data?.registration || null);
      sendWebAppCompletionSignal();
    } catch (submitError) {
      setError(submitError?.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loadingMeta) {
    return (
      <div className="tg-store-registration-page tg-store-registration-page--loading">
        <div className="tg-store-loader" role="status" aria-label={dict.loading}>
          <span className="tg-store-loader-ring" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (!initData && !launchToken) {
    return (
      <div className="tg-store-registration-page">
        <div className="tg-store-registration-card">
          <h2>{dict.title}</h2>
          <p className="muted">{dict.initDataMissing}</p>
        </div>
      </div>
    );
  }

  if (successData) {
    const siteUrl = toAbsoluteUrl(successData.site_url);
    const botLink = toAbsoluteUrl(successData.bot_link);
    const qrUrl = toAbsoluteUrl(successData.qr_url_full || successData.qr_url);
    const pdfUrl = toAbsoluteUrl(successData.pdf_url_full || successData.pdf_url);

    return (
      <div className="tg-store-registration-page">
        <div className="tg-store-registration-card">
          <h2>{dict.success}</h2>
          <p className="muted">{dict.successHint}</p>

          <div className="tg-result-block">
            <div className="tg-result-label">{dict.siteLink}</div>
            {siteUrl ? (
              <a href={siteUrl} target="_blank" rel="noreferrer" className="tg-link">
                {dict.openSiteLabel}
              </a>
            ) : <span className="muted">—</span>}
          </div>

          <div className="tg-result-block">
            <div className="tg-result-label">{dict.credentials}</div>
            <div className="tg-row"><span>{dict.username}</span><code>{successData.username}</code></div>
            <div className="tg-row"><span>{dict.password}</span><code>{successData.password}</code></div>
          </div>

          {(successData.bot_username || pdfUrl) && (
            <div className="tg-result-block">
              <div className="tg-result-label">{dict.botSection}</div>
              {successData.bot_username && (
                <div className="tg-row"><span>{dict.botUsername}</span><strong>{successData.bot_username}</strong></div>
              )}
              {qrUrl && (
                <div className="tg-qr-preview-wrap">
                  <img src={qrUrl} alt="QR" className="tg-qr-preview" />
                </div>
              )}
              <div className="tg-actions">
                {siteUrl && (
                  <a href={siteUrl} target="_blank" rel="noreferrer" className="tg-btn tg-btn-secondary">
                    {dict.openPanel}
                  </a>
                )}
                {botLink && (
                  <a href={botLink} target="_blank" rel="noreferrer" className="tg-btn tg-btn-secondary">
                    {dict.openBot}
                  </a>
                )}
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noreferrer" className="tg-btn tg-btn-primary">
                    {dict.downloadPdf}
                  </a>
                )}
              </div>
            </div>
          )}

          <button type="button" className="tg-btn tg-btn-primary tg-close-btn" onClick={closeWebApp}>
            {dict.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-store-registration-page">
      <form className="tg-store-registration-card" onSubmit={handleSubmit}>
        <h2>{dict.title}</h2>
        <p className="muted">{dict.subtitle}</p>

        <label>
          <span>{dict.storeName}</span>
          <input
            value={form.store_name}
            onChange={(e) => onFieldChange('store_name', e.target.value)}
            maxLength={255}
            required
          />
        </label>

        <label>
          <span>{dict.activity}</span>
          <select
            value={form.activity_type_id}
            onChange={(e) => onFieldChange('activity_type_id', e.target.value)}
            required
          >
            <option value="">{dict.selectActivity}</option>
            {activityTypes.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{dict.fullName}</span>
          <input
            value={form.full_name}
            onChange={(e) => onFieldChange('full_name', e.target.value)}
            maxLength={255}
            required
          />
        </label>

        <label>
          <span>{dict.phone}</span>
          <input
            value={form.phone}
            onChange={(e) => onFieldChange('phone', e.target.value)}
            maxLength={30}
            required
          />
        </label>

        <div className="tg-geo-block">
          <div className="tg-geo-header">
            <strong>{dict.geo}</strong>
            <button type="button" onClick={requestGeoLocation} className="tg-btn tg-btn-secondary" disabled={geoLoading}>
              {geoLoading ? dict.geoInProgress : dict.geo}
            </button>
          </div>
          <div className="tg-grid-two">
            <label>
              <span>{dict.latitude}</span>
              <input
                value={form.latitude}
                onChange={(e) => onFieldChange('latitude', e.target.value)}
                required
              />
            </label>
            <label>
              <span>{dict.longitude}</span>
              <input
                value={form.longitude}
                onChange={(e) => onFieldChange('longitude', e.target.value)}
                required
              />
            </label>
          </div>
          {geoStatus && <div className="muted">{geoStatus}</div>}
        </div>

        <div className="tg-logo-section">
          <span className="tg-logo-label">{dict.logo}</span>
          <div className={`tg-logo-slot${form.logo_url ? ' is-filled' : ''}`}>
            {form.logo_url ? (
              <img src={toAbsoluteUrl(form.logo_url)} alt="Logo" className="tg-logo-preview" />
            ) : (
              <div className="tg-logo-empty">{dict.logoEmpty}</div>
            )}
          </div>
          <div className="tg-logo-actions">
            <label className="tg-btn tg-btn-secondary tg-file-btn">
              {logoUploading ? dict.logoUploading : dict.logoPick}
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                disabled={logoUploading}
                hidden
              />
            </label>
            {form.logo_url && (
              <button
                type="button"
                className="tg-btn tg-btn-secondary"
                onClick={removeUploadedLogo}
                disabled={logoUploading}
              >
                {dict.logoRemove}
              </button>
            )}
          </div>
        </div>

        <label>
          <span>{dict.botToken}</span>
          <input
            value={form.bot_token}
            onChange={(e) => onFieldChange('bot_token', e.target.value)}
            maxLength={300}
          />
        </label>

        <label>
          <span>{dict.groupId}</span>
          <input
            value={form.group_id}
            onChange={(e) => onFieldChange('group_id', e.target.value)}
            maxLength={32}
          />
        </label>

        {error && <div className="tg-error">{error}</div>}

        <button type="submit" className="tg-btn tg-btn-primary tg-save-btn" disabled={!canSubmit || saving}>
          {saving ? dict.saving : dict.save}
        </button>
      </form>
    </div>
  );
}

export default TelegramStoreRegistration;
