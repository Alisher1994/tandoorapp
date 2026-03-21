import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_CENTER = [41.311081, 69.240562];
const DEFAULT_ZOOM = 11;

let yandexLoaderPromise = null;

const resetLoader = () => {
  yandexLoaderPromise = null;
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

  if (yandexLoaderPromise) return yandexLoaderPromise;

  yandexLoaderPromise = new Promise((resolve, reject) => {
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
          resetLoader();
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
        resetLoader();
        reject(new Error('Yandex Maps API не инициализирован'));
        return;
      }
      window.ymaps.ready(() => resolve(window.ymaps));
    };
    script.onerror = () => {
      resetLoader();
      reject(new Error('Ошибка загрузки Yandex Maps API'));
    };
    document.head.appendChild(script);
  });

  return yandexLoaderPromise;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizePoint = (point) => {
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    ...point,
    lat,
    lng
  };
};

function YandexShopsMap({
  points = [],
  language = 'ru',
  height = '100%',
  onLoadError = () => {}
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geoCollectionRef = useRef(null);
  const markerLayoutRef = useRef(null);
  const [loadError, setLoadError] = useState('');
  const boundsSignatureRef = useRef('');

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

        if (!markerLayoutRef.current) {
          markerLayoutRef.current = ymaps.templateLayoutFactory.createClass(
            '<div style="width:26px;height:26px;border-radius:999px;background:#16a34a;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,23,42,0.25);font-size:13px;line-height:1;">🏪</div>'
          );
        }

        const geoCollection = new ymaps.GeoObjectCollection({}, {});
        geoCollectionRef.current = geoCollection;
        map.geoObjects.add(geoCollection);
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
    if (!map || !ymaps || !geoCollection) return;

    geoCollection.removeAll();

    normalizedPoints.forEach((point) => {
      const balloonContentBody = `
        <div class="sa-yandex-shop-balloon">
          <div class="sa-yandex-shop-balloon-title">🏪 ${escapeHtml(point.name)}</div>
          <div><strong>${language === 'uz' ? 'Faoliyat turi' : 'Вид деятельности'}:</strong> ${escapeHtml(point.activityType)}</div>
          <div><strong>${language === 'uz' ? 'Telefon' : 'Телефон'}:</strong> ${escapeHtml(point.phone)}</div>
          <div><strong>${language === 'uz' ? 'Balans' : 'Баланс'}:</strong> ${escapeHtml(point.balance)} ${escapeHtml(point.currencyLabel)}</div>
          <div><strong>${language === 'uz' ? 'Operator' : 'Оператор'}:</strong> ${escapeHtml(point.operatorLabel)}</div>
          <div><strong>${language === 'uz' ? 'Tovarlar' : 'Товары'}:</strong> ${Number(point.productsCount || 0)} · <strong>${language === 'uz' ? 'Xatolar' : 'Ошибки'}:</strong> ${Number(point.issuesCount || 0)}</div>
        </div>
      `;

      const placemark = new ymaps.Placemark(
        [point.lat, point.lng],
        {
          hintContent: String(point.name || ''),
          balloonContentBody
        },
        {
          iconLayout: markerLayoutRef.current,
          iconShape: {
            type: 'Circle',
            coordinates: [13, 13],
            radius: 13
          },
          iconOffset: [-13, -13]
        }
      );

      geoCollection.add(placemark);
    });

    const signature = JSON.stringify(normalizedPoints.map((point) => [point.id, point.lat, point.lng]));
    if (signature === boundsSignatureRef.current) return;
    boundsSignatureRef.current = signature;

    const bounds = geoCollection.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: [26, 26, 26, 26] });
    } else {
      map.setCenter(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [normalizedPoints, language]);

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

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}

export default YandexShopsMap;
