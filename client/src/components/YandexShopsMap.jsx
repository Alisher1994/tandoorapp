import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_CENTER = [41.311081, 69.240562];
const DEFAULT_ZOOM = 12;

let yandexMapsLoaderPromise = null;

const resetYandexLoader = () => {
  yandexMapsLoaderPromise = null;
};

const loadYandexMaps = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Yandex Maps доступен только в браузере'));
  }

  if (window.ymaps) {
    return new Promise((resolve) => {
      window.ymaps.ready(() => resolve(window.ymaps));
    });
  }

  if (yandexMapsLoaderPromise) return yandexMapsLoaderPromise;

  yandexMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="api-maps.yandex.ru"]');
    if (existingScript) {
      const waitTimer = setInterval(() => {
        if (window.ymaps) {
          clearInterval(waitTimer);
          window.ymaps.ready(() => resolve(window.ymaps));
        }
      }, 100);
      setTimeout(() => {
        if (!window.ymaps) {
          clearInterval(waitTimer);
          resetYandexLoader();
          reject(new Error('Не удалось загрузить Yandex Maps'));
        }
      }, 15000);
      return;
    }

    const apiKey = import.meta.env.VITE_YANDEX_MAPS_KEY || '';
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps) {
        resetYandexLoader();
        reject(new Error('Yandex Maps API не инициализирован'));
        return;
      }
      window.ymaps.ready(() => resolve(window.ymaps));
    };
    script.onerror = () => {
      resetYandexLoader();
      reject(new Error('Ошибка загрузки Yandex Maps API'));
    };
    document.head.appendChild(script);
  });

  return yandexMapsLoaderPromise;
};

const isFiniteCoord = (value) => Number.isFinite(Number(value));

const normalizePoint = (point) => {
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!isFiniteCoord(lat) || !isFiniteCoord(lng)) return null;
  return {
    ...point,
    lat,
    lng
  };
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatMoney = (value) => {
  const safeValue = Number(value || 0);
  return Number.isFinite(safeValue) ? safeValue.toLocaleString('ru-RU') : '0';
};

const getPointKey = (point) => String(point?.id ?? `${point?.lat}:${point?.lng}`);

function YandexShopsMap({
  points = [],
  language = 'ru',
  height = '100%',
  onLoadError = () => {}
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geoCollectionRef = useRef(null);
  const shopMarkerLayoutRef = useRef(null);
  const boundsSignatureRef = useRef('');
  const [loadError, setLoadError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const normalizedPoints = useMemo(
    () => (Array.isArray(points) ? points.map(normalizePoint).filter(Boolean) : []),
    [points]
  );

  useEffect(() => {
    let destroyed = false;

    const initMap = async () => {
      try {
        const ymaps = await loadYandexMaps();
        if (destroyed || !containerRef.current || mapRef.current) return;

        const map = new ymaps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          controls: ['zoomControl']
        });
        mapRef.current = map;

        if (!shopMarkerLayoutRef.current) {
          shopMarkerLayoutRef.current = ymaps.templateLayoutFactory.createClass(
            '<div style="width:30px;height:30px;border-radius:999px;background:#16a34a;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(22,163,74,0.35);font-size:15px;line-height:1;">🏪</div>'
          );
        }

        const geoCollection = new ymaps.GeoObjectCollection({}, {});
        geoCollectionRef.current = geoCollection;
        map.geoObjects.add(geoCollection);
        map.container.fitToViewport();
        setMapReady(true);
      } catch (error) {
        if (!destroyed) {
          const message = error?.message || 'Не удалось загрузить карту Yandex';
          setLoadError(message);
          onLoadError(message);
        }
      }
    };

    initMap();

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      geoCollectionRef.current = null;
    };
  }, [onLoadError]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps = typeof window !== 'undefined' ? window.ymaps : null;
    const geoCollection = geoCollectionRef.current;
    if (!map || !ymaps || !geoCollection || !mapReady) return;

    geoCollection.removeAll();

    normalizedPoints.forEach((point) => {
      const balloonContentBody = `
        <div class="sa-yandex-shop-balloon">
          <div class="sa-yandex-shop-balloon-title">🏪 ${escapeHtml(point.name)}</div>
          <div><strong>${language === 'uz' ? 'Faoliyat turi' : 'Вид деятельности'}:</strong> ${escapeHtml(point.activityType)}</div>
          <div><strong>${language === 'uz' ? 'Telefon' : 'Телефон'}:</strong> ${escapeHtml(point.phone)}</div>
          <div><strong>${language === 'uz' ? 'Balans' : 'Баланс'}:</strong> ${formatMoney(point.balance)} ${escapeHtml(point.currencyLabel)}</div>
          <div><strong>${language === 'uz' ? 'Operator' : 'Оператор'}:</strong> ${escapeHtml(point.operatorLabel)}</div>
          <div><strong>${language === 'uz' ? 'Tovarlar' : 'Товары'}:</strong> ${Number(point.productsCount || 0)} · <strong>${language === 'uz' ? 'Xatolar' : 'Ошибки'}:</strong> ${Number(point.issuesCount || 0)}</div>
        </div>
      `;

      const placemark = new ymaps.Placemark(
        [point.lat, point.lng],
        {
          hintContent: String(point.name || '—'),
          balloonContentBody
        },
        {
          iconLayout: shopMarkerLayoutRef.current,
          iconShape: { type: 'Circle', coordinates: [15, 15], radius: 15 },
          iconOffset: [-15, -15]
        }
      );

      placemark.events.add('click', () => {
        if (placemark.balloon && typeof placemark.balloon.open === 'function') {
          placemark.balloon.open();
        }
      });

      geoCollection.add(placemark);
    });

    const signature = JSON.stringify({
      points: normalizedPoints.map((point) => [getPointKey(point), point.lat, point.lng])
    });

    if (signature === boundsSignatureRef.current) return;
    boundsSignatureRef.current = signature;

    const bounds = geoCollection.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: [32, 32, 32, 32] });
    } else {
      map.setCenter(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [normalizedPoints, language, mapReady]);

  if (loadError) {
    return (
      <div
        className="d-flex align-items-center justify-content-center text-muted"
        style={{ height, width: '100%', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#f8fafc' }}
      >
        {loadError}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%' }}
    />
  );
}

export default YandexShopsMap;
