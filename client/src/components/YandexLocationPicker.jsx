import React, { useEffect, useRef, useCallback } from 'react';

function YandexLocationPicker({ latitude, longitude, onLocationChange, height = '300px' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const placemarkRef = useRef(null);
  const isInitializedRef = useRef(false);

  const defaultCenter = [41.311081, 69.240562]; // Tashkent center
  
  const getCenter = useCallback(() => {
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return [lat, lng];
      }
    }
    return defaultCenter;
  }, [latitude, longitude]);

  // Update placemark position when coordinates change externally
  useEffect(() => {
    if (placemarkRef.current && latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        const currentCoords = placemarkRef.current.geometry.getCoordinates();
        // Only update if coordinates are different (avoid infinite loop)
        if (Math.abs(currentCoords[0] - lat) > 0.000001 || Math.abs(currentCoords[1] - lng) > 0.000001) {
          placemarkRef.current.geometry.setCoordinates([lat, lng]);
          mapInstanceRef.current?.setCenter([lat, lng], mapInstanceRef.current.getZoom(), { duration: 300 });
        }
      }
    }
  }, [latitude, longitude]);

  useEffect(() => {
    // Load Yandex Maps API
    const loadYandexMaps = () => {
      return new Promise((resolve, reject) => {
        if (window.ymaps) {
          resolve(window.ymaps);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://api-maps.yandex.ru/2.1/?apikey=&lang=ru_RU';
        script.async = true;
        script.onload = () => {
          window.ymaps.ready(() => resolve(window.ymaps));
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const initMap = async () => {
      if (isInitializedRef.current || !mapRef.current) return;
      
      try {
        const ymaps = await loadYandexMaps();
        
        if (!mapRef.current || isInitializedRef.current) return;
        isInitializedRef.current = true;

        const center = getCenter();
        
        // Create map
        const map = new ymaps.Map(mapRef.current, {
          center: center,
          zoom: 15,
          controls: ['zoomControl', 'geolocationControl']
        });

        mapInstanceRef.current = map;

        // Create draggable placemark
        const placemark = new ymaps.Placemark(center, {
          hintContent: 'Перетащите или кликните на карту'
        }, {
          preset: 'islands#redDotIcon',
          draggable: true
        });

        placemarkRef.current = placemark;
        map.geoObjects.add(placemark);

        // Handle placemark drag
        placemark.events.add('dragend', () => {
          const coords = placemark.geometry.getCoordinates();
          onLocationChange(coords[0].toFixed(6), coords[1].toFixed(6));
        });

        // Handle map click - move placemark
        map.events.add('click', (e) => {
          const coords = e.get('coords');
          placemark.geometry.setCoordinates(coords);
          onLocationChange(coords[0].toFixed(6), coords[1].toFixed(6));
        });

      } catch (error) {
        console.error('Failed to load Yandex Maps:', error);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
        placemarkRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []);

  return (
    <div 
      ref={mapRef}
      style={{ 
        height, 
        width: '100%', 
        borderRadius: '8px', 
        overflow: 'hidden',
        border: '1px solid #dee2e6'
      }}
    />
  );
}

export default YandexLocationPicker;
