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

const getPointKey = (point) => String(point?.orderId ?? point?.orderNumber ?? `${point?.lat}:${point?.lng}`);
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const buildShopBalloonHtml = (shop = {}) => {
  const rows = [
    ['Магазин', shop.name || '—'],
    ['Оператор', shop.operatorName || '—'],
    ['Телефон', shop.operatorPhone || shop.phone || '—'],
    ['Баланс', `${Number(shop.balance || 0).toLocaleString('ru-RU')} ${shop.currencyCode || 'сум'}`],
    ['Ошибки', Number(shop.errorsCount || 0).toLocaleString('ru-RU')],
    ['Товары', Number(shop.productsCount || 0).toLocaleString('ru-RU')]
  ];
  return `
    <div style="min-width:220px;font-size:12px;line-height:1.35;color:#0f172a">
      ${rows.map(([label, value]) => (
        `<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px dashed #e2e8f0;">
          <span style="color:#64748b">${escapeHtml(label)}</span>
          <strong style="text-align:right">${escapeHtml(value)}</strong>
        </div>`
      )).join('')}
    </div>
  `;
};

function YandexAnalyticsMap({
  points = [],
  shopPoints = [],
  shopPoint = null,
  selectedPoint = null,
  onSelectPoint = () => {},
  onLoadError = () => {},
  height = '100%'
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geoCollectionRef = useRef(null);
  const customerMarkerLayoutRef = useRef(null);
  const customerMarkerActiveLayoutRef = useRef(null);
  const shopMarkerLayoutRef = useRef(null);
  const boundsSignatureRef = useRef('');
  const [loadError, setLoadError] = useState('');

  const normalizedPoints = useMemo(
    () => (Array.isArray(points) ? points.map(normalizePoint).filter(Boolean) : []),
    [points]
  );
  const normalizedShopPoints = useMemo(
    () => (Array.isArray(shopPoints) ? shopPoints.map(normalizePoint).filter(Boolean) : []),
    [shopPoints]
  );
  const normalizedShopPoint = useMemo(() => normalizePoint(shopPoint), [shopPoint]);
  const normalizedSelectedPoint = useMemo(() => normalizePoint(selectedPoint), [selectedPoint]);

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

        if (!customerMarkerLayoutRef.current) {
          customerMarkerLayoutRef.current = ymaps.templateLayoutFactory.createClass(
            '<div style="width:26px;height:26px;border-radius:999px;background:#ef4444;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,23,42,0.25);font-size:13px;line-height:1;">🙋🏻</div>'
          );
        }
        if (!customerMarkerActiveLayoutRef.current) {
          customerMarkerActiveLayoutRef.current = ymaps.templateLayoutFactory.createClass(
            '<div style="width:28px;height:28px;border-radius:999px;background:#2563eb;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(37,99,235,0.35);font-size:14px;line-height:1;">🙋🏻</div>'
          );
        }
        if (!shopMarkerLayoutRef.current) {
          shopMarkerLayoutRef.current = ymaps.templateLayoutFactory.createClass(
            '<div style="width:30px;height:30px;border-radius:999px;background:#16a34a;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(22,163,74,0.35);font-size:15px;line-height:1;">🏪</div>'
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
      const isSelected = normalizedSelectedPoint
        ? getPointKey(normalizedSelectedPoint) === getPointKey(point)
        : false;
      const placemark = new ymaps.Placemark(
        [point.lat, point.lng],
        {},
        {
          iconLayout: isSelected ? customerMarkerActiveLayoutRef.current : customerMarkerLayoutRef.current,
          iconShape: {
            type: 'Circle',
            coordinates: [isSelected ? 14 : 13, isSelected ? 14 : 13],
            radius: isSelected ? 14 : 13
          },
          iconOffset: [isSelected ? -14 : -13, isSelected ? -14 : -13]
        }
      );
      placemark.events.add('click', () => onSelectPoint(point));
      geoCollection.add(placemark);
    });

    const shopsForMap = normalizedShopPoints.length ? normalizedShopPoints : (normalizedShopPoint ? [normalizedShopPoint] : []);
    if (shopsForMap.length) {
      const clusterer = new ymaps.Clusterer({
        clusterIcons: [{
          href: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"><circle cx="21" cy="21" r="20" fill="%2316a34a" stroke="%23ffffff" stroke-width="2"/></svg>',
          size: [42, 42],
          offset: [-21, -21]
        }],
        clusterNumbers: [50, 100, 500, 1000],
        groupByCoordinates: false,
        hasBalloon: true,
        clusterDisableClickZoom: false,
        preset: 'islands#greenClusterIcons'
      });
      const shopPlacemarks = shopsForMap.map((shop) => (
        new ymaps.Placemark(
          [shop.lat, shop.lng],
          {
            balloonContentBody: buildShopBalloonHtml(shop)
          },
          {
            iconLayout: shopMarkerLayoutRef.current,
            iconShape: { type: 'Circle', coordinates: [15, 15], radius: 15 },
            iconOffset: [-15, -15]
          }
        )
      ));
      clusterer.add(shopPlacemarks);
      geoCollection.add(clusterer);
    }

    if (normalizedSelectedPoint) {
      map.setCenter([normalizedSelectedPoint.lat, normalizedSelectedPoint.lng], Math.max(map.getZoom(), 14), { duration: 300 });
      return;
    }

    const signature = JSON.stringify({
      points: normalizedPoints.map((point) => [point.lat, point.lng, getPointKey(point)]),
      shops: shopsForMap.map((shop) => [shop.lat, shop.lng, String(shop.id || shop.name || '')])
    });

    if (signature === boundsSignatureRef.current) return;
    boundsSignatureRef.current = signature;

    const bounds = geoCollection.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: [32, 32, 32, 32] });
    } else {
      map.setCenter(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [normalizedPoints, normalizedSelectedPoint, normalizedShopPoint, normalizedShopPoints, onSelectPoint]);

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

export default YandexAnalyticsMap;
