import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FeatureGroup, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import {
  getLeafletTileLayerConfig,
  getSavedMapProvider,
  normalizeMapProvider,
  saveMapProvider
} from '../utils/mapTileProviders';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const DEFAULT_CENTER = [41.311081, 69.240562];

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const normalizeZone = (value) => {
  if (!value) return null;

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed)) return null;

  const coords = parsed
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return [lat, lng];
    })
    .filter(Boolean);

  return coords.length >= 3 ? coords : null;
};

const normalizeCenter = (center) => {
  if (!Array.isArray(center) || center.length < 2) return DEFAULT_CENTER;
  const lat = Number(center[0]);
  const lng = Number(center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_CENTER;
  return [lat, lng];
};

const zonesAreEqual = (first, second) => {
  const firstZone = Array.isArray(first) ? first : [];
  const secondZone = Array.isArray(second) ? second : [];
  if (firstZone.length !== secondZone.length) return false;

  for (let index = 0; index < firstZone.length; index += 1) {
    const [firstLat, firstLng] = firstZone[index] || [];
    const [secondLat, secondLng] = secondZone[index] || [];
    if (!isFiniteNumber(firstLat) || !isFiniteNumber(firstLng) || !isFiniteNumber(secondLat) || !isFiniteNumber(secondLng)) {
      return false;
    }
    if (Math.abs(Number(firstLat) - Number(secondLat)) > 1e-9) return false;
    if (Math.abs(Number(firstLng) - Number(secondLng)) > 1e-9) return false;
  }

  return true;
};

const extractCoords = (layer) => (
  layer
    ?.getLatLngs()?.[0]
    ?.map((latlng) => [latlng.lat, latlng.lng])
    ?.filter((point) => isFiniteNumber(point[0]) && isFiniteNumber(point[1])) || []
);

const createPolygonLayer = (zone) => L.polygon(zone, {
  color: '#28a745',
  fillColor: '#28a745',
  fillOpacity: 0.22,
  weight: 3
});

function DrawLayer({ zone, onZoneChange }) {
  const map = useMap();
  const featureGroupRef = useRef(null);
  const activeLayerRef = useRef(null);
  const cleanupLayerListenersRef = useRef(() => {});
  const onZoneChangeRef = useRef(onZoneChange);

  useEffect(() => {
    onZoneChangeRef.current = onZoneChange;
  }, [onZoneChange]);

  const emitZone = useCallback((coords) => {
    const normalized = Array.isArray(coords) && coords.length >= 3 ? coords : null;
    if (typeof onZoneChangeRef.current === 'function') {
      onZoneChangeRef.current(normalized);
    }
  }, []);

  const setActiveLayer = useCallback((nextLayer) => {
    const featureGroup = featureGroupRef.current;
    if (!featureGroup) return;

    cleanupLayerListenersRef.current();
    cleanupLayerListenersRef.current = () => {};

    featureGroup.clearLayers();
    activeLayerRef.current = null;

    if (!nextLayer) return;

    featureGroup.addLayer(nextLayer);
    activeLayerRef.current = nextLayer;

    const handleDirectEdit = () => {
      emitZone(extractCoords(nextLayer));
    };

    nextLayer.on('edit', handleDirectEdit);
    if (typeof nextLayer.editing?.enable === 'function') {
      nextLayer.editing.enable();
    }

    cleanupLayerListenersRef.current = () => {
      nextLayer.off('edit', handleDirectEdit);
      if (typeof nextLayer.editing?.disable === 'function') {
        nextLayer.editing.disable();
      }
    };
  }, [emitZone]);

  useEffect(() => {
    if (!map || !featureGroupRef.current) return undefined;

    const featureGroup = featureGroupRef.current;
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        rectangle: false,
        circle: false,
        polyline: false,
        circlemarker: false,
        marker: false,
        polygon: {
          allowIntersection: false,
          drawError: {
            color: '#e1e100',
            message: '<strong>Ошибка:</strong> линии не должны пересекаться'
          },
          shapeOptions: {
            color: '#28a745'
          }
        }
      },
      edit: {
        featureGroup,
        remove: true
      }
    });

    const handleCreated = (event) => {
      if (!event.layer) return;
      setActiveLayer(event.layer);
      emitZone(extractCoords(event.layer));
    };

    const handleEdited = (event) => {
      let nextZone = null;
      event.layers.eachLayer((layer) => {
        const coords = extractCoords(layer);
        if (coords.length >= 3) {
          nextZone = coords;
        }
      });
      emitZone(nextZone);
    };

    const handleDeleted = () => {
      setActiveLayer(null);
      emitZone(null);
    };

    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      cleanupLayerListenersRef.current();
      cleanupLayerListenersRef.current = () => {};
      map.removeControl(drawControl);
    };
  }, [map, emitZone, setActiveLayer]);

  useEffect(() => {
    if (!featureGroupRef.current) return;

    const currentZone = extractCoords(activeLayerRef.current);

    if (!zone || zone.length < 3) {
      if (activeLayerRef.current) {
        setActiveLayer(null);
      }
      return;
    }

    if (zonesAreEqual(zone, currentZone)) return;
    setActiveLayer(createPolygonLayer(zone));
  }, [zone, setActiveLayer]);

  return <FeatureGroup ref={featureGroupRef} />;
}

const DeliveryZonePicker = ({ deliveryZone, onZoneChange, center = DEFAULT_CENTER, mapProvider = null, onMapProviderChange = null }) => {
  const zone = useMemo(() => normalizeZone(deliveryZone), [deliveryZone]);
  const safeCenter = useMemo(() => normalizeCenter(center), [center]);
  const [selectedMapProvider, setSelectedMapProvider] = React.useState(() => normalizeMapProvider(mapProvider || getSavedMapProvider()));
  const tileLayerConfig = useMemo(() => getLeafletTileLayerConfig(selectedMapProvider, {
    yandexApiKey: import.meta.env.VITE_YANDEX_MAPS_KEY || ''
  }), [selectedMapProvider]);

  useEffect(() => {
    if (!mapProvider) return;
    setSelectedMapProvider(normalizeMapProvider(mapProvider));
  }, [mapProvider]);

  const handleMapProviderSelect = (event) => {
    const nextProvider = normalizeMapProvider(event.target.value);
    setSelectedMapProvider(nextProvider);
    saveMapProvider(nextProvider);
    if (typeof onMapProviderChange === 'function') {
      onMapProviderChange(nextProvider);
    }
  };

  return (
    <div style={{ height: '500px', width: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 500,
          background: 'rgba(255, 255, 255, 0.96)',
          border: '1px solid #dbe3ee',
          borderRadius: '8px',
          padding: '6px 8px',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)'
        }}
      >
        <select
          value={selectedMapProvider}
          onChange={handleMapProviderSelect}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          aria-label="Выбор карты"
        >
          <option value="osm">OpenStreetMap</option>
          <option value="yandex">Yandex</option>
        </select>
      </div>
      <MapContainer center={safeCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url={tileLayerConfig.url}
          attribution={tileLayerConfig.attribution}
          maxZoom={tileLayerConfig.maxZoom}
        />
        <DrawLayer zone={zone} onZoneChange={onZoneChange} />
      </MapContainer>
      <div className="mt-2 text-center">
        <small className="text-muted">📍 Точки зоны можно перетаскивать мышкой сразу после создания</small>
      </div>
    </div>
  );
};

export default DeliveryZonePicker;
