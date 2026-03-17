import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMap } from 'react-leaflet';
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

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Draw control component
function DrawControl({ onCreated, onDeleted }) {
  const map = useMap();
  const featureGroupRef = useRef(null);

  useEffect(() => {
    if (!map || !featureGroupRef.current) return;

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          drawError: {
            color: '#e1e100',
            message: '<strong>Ошибка:</strong> Линии не должны пересекаться!'
          },
          shapeOptions: {
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.2
          }
        },
        polyline: false,
        circle: false,
        rectangle: false,
        marker: false,
        circlemarker: false
      },
      edit: {
        featureGroup: featureGroupRef.current,
        remove: true
      }
    });

    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      featureGroupRef.current.addLayer(layer);
      
      // Get coordinates
      const coords = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
      onCreated && onCreated(coords);
    });

    map.on(L.Draw.Event.DELETED, () => {
      onDeleted && onDeleted();
    });

    map.on(L.Draw.Event.EDITED, (e) => {
      const layers = e.layers;
      layers.eachLayer((layer) => {
        const coords = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
        onCreated && onCreated(coords);
      });
    });

    return () => {
      map.removeControl(drawControl);
    };
  }, [map, onCreated, onDeleted]);

  return <FeatureGroup ref={featureGroupRef} />;
}

// Main component
function DeliveryZoneMap({ 
  zone, 
  onZoneChange, 
  center = [41.2995, 69.2401], // Tashkent default
  height = '400px',
  editable = true,
  mapProvider = null,
  onMapProviderChange = null
}) {
  const [mapCenter, setMapCenter] = useState(center);
  const [selectedMapProvider, setSelectedMapProvider] = useState(() => normalizeMapProvider(mapProvider || getSavedMapProvider()));
  const tileLayerConfig = getLeafletTileLayerConfig(selectedMapProvider, {
    yandexApiKey: import.meta.env.VITE_YANDEX_MAPS_KEY || ''
  });

  useEffect(() => {
    if (!mapProvider) return;
    setSelectedMapProvider(normalizeMapProvider(mapProvider));
  }, [mapProvider]);

  // Parse zone if it's a string
  const parsedZone = typeof zone === 'string' ? JSON.parse(zone) : zone;

  const handleCreated = (coords) => {
    onZoneChange && onZoneChange(coords);
  };

  const handleDeleted = () => {
    onZoneChange && onZoneChange(null);
  };

  const handleMapProviderSelect = (event) => {
    const nextProvider = normalizeMapProvider(event.target.value);
    setSelectedMapProvider(nextProvider);
    saveMapProvider(nextProvider);
    if (typeof onMapProviderChange === 'function') {
      onMapProviderChange(nextProvider);
    }
  };

  return (
    <div style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
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
      <MapContainer 
        center={mapCenter} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution={tileLayerConfig.attribution}
          url={tileLayerConfig.url}
          maxZoom={tileLayerConfig.maxZoom}
        />
        
        {/* Show existing zone */}
        {parsedZone && parsedZone.length > 0 && !editable && (
          <Polygon 
            positions={parsedZone}
            pathOptions={{ 
              color: '#3388ff', 
              fillColor: '#3388ff', 
              fillOpacity: 0.2 
            }}
          />
        )}
        
        {/* Draw controls (only in edit mode) */}
        {editable && (
          <DrawControl 
            onCreated={handleCreated}
            onDeleted={handleDeleted}
          />
        )}
        
        {/* Show zone in edit mode too */}
        {parsedZone && parsedZone.length > 0 && editable && (
          <Polygon 
            positions={parsedZone}
            pathOptions={{ 
              color: '#28a745', 
              fillColor: '#28a745', 
              fillOpacity: 0.3,
              dashArray: '5, 5'
            }}
          />
        )}
      </MapContainer>
      
      {editable && (
        <div className="mt-2">
          <small className="text-muted">
            📍 Нажмите на иконку многоугольника справа и нарисуйте зону доставки
          </small>
        </div>
      )}
    </div>
  );
}

export default DeliveryZoneMap;


