import React, { useEffect, useRef, useState } from 'react';
import './ClientLocationPicker.css';

const YANDEX_API_KEY = '650c02e9-6ef5-4d0e-add0-91e1abd044d8'; // Тот же ключ что и для ресторанов

function ClientLocationPicker({ latitude, longitude, onLocationChange }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const placemarkRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [address, setAddress] = useState('');

  // Загрузка Yandex Maps API
  useEffect(() => {
    if (window.ymaps) {
      setIsLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="api-maps.yandex.ru"]');
    if (existingScript) {
      const checkYmaps = setInterval(() => {
        if (window.ymaps) {
          setIsLoaded(true);
          clearInterval(checkYmaps);
        }
      }, 100);
      return () => clearInterval(checkYmaps);
    }

    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        setIsLoaded(true);
      });
    };
    document.head.appendChild(script);
  }, []);

  // Инициализация карты
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current) return;

    window.ymaps.ready(() => {
      // Очищаем предыдущую карту
      if (mapRef.current) {
        mapRef.current.destroy();
      }

      const initialLat = latitude || 41.311081;
      const initialLng = longitude || 69.240562;

      // Создаем карту
      const map = new window.ymaps.Map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        controls: ['zoomControl', 'geolocationControl']
      });

      mapRef.current = map;

      // Создаем перетаскиваемую метку
      const placemark = new window.ymaps.Placemark(
        [initialLat, initialLng],
        {
          hintContent: 'Перетащите метку',
          balloonContent: 'Точка доставки'
        },
        {
          preset: 'islands#redDeliveryIcon',
          draggable: true
        }
      );

      placemarkRef.current = placemark;
      map.geoObjects.add(placemark);

      // Получаем адрес по координатам
      const getAddress = (coords) => {
        window.ymaps.geocode(coords).then((res) => {
          const firstGeoObject = res.geoObjects.get(0);
          if (firstGeoObject) {
            const addr = firstGeoObject.getAddressLine();
            setAddress(addr);
          }
        });
      };

      // Обработчик перетаскивания метки
      placemark.events.add('dragend', () => {
        const coords = placemark.geometry.getCoordinates();
        onLocationChange(coords[0], coords[1]);
        getAddress(coords);
      });

      // Обработчик клика по карте
      map.events.add('click', (e) => {
        const coords = e.get('coords');
        placemark.geometry.setCoordinates(coords);
        map.setCenter(coords, map.getZoom(), { duration: 300 });
        onLocationChange(coords[0], coords[1]);
        getAddress(coords);
      });

      // Начальный адрес
      getAddress([initialLat, initialLng]);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [isLoaded]);

  // Обновляем позицию маркера при изменении координат извне
  useEffect(() => {
    if (placemarkRef.current && latitude && longitude) {
      const coords = [latitude, longitude];
      placemarkRef.current.geometry.setCoordinates(coords);
      if (mapRef.current) {
        mapRef.current.setCenter(coords, 16, { duration: 300 });
      }
      // Обновляем адрес
      if (window.ymaps) {
        window.ymaps.geocode(coords).then((res) => {
          const firstGeoObject = res.geoObjects.get(0);
          if (firstGeoObject) {
            setAddress(firstGeoObject.getAddressLine());
          }
        });
      }
    }
  }, [latitude, longitude]);

  if (!isLoaded) {
    return (
      <div className="client-location-picker-loading">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2 text-muted">Загрузка карты...</p>
      </div>
    );
  }

  return (
    <div className="client-location-picker">
      <div ref={mapContainerRef} className="client-map-container" />
      {address && (
        <div className="client-address-display">
          <span className="address-icon">📍</span>
          <span className="address-text">{address}</span>
        </div>
      )}
      <div className="map-hint">
        Нажмите на карту или перетащите маркер
      </div>
    </div>
  );
}

export default ClientLocationPicker;
