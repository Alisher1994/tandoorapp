import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

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

function DrawLayer({ zone, onZoneChange }) {
  const map = useMap();
  const featureGroupRef = useRef(null);

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

    const extractCoords = (layer) => (
      layer
        .getLatLngs()?.[0]
        ?.map((latlng) => [latlng.lat, latlng.lng])
        ?.filter((point) => isFiniteNumber(point[0]) && isFiniteNumber(point[1])) || []
    );

    const handleCreated = (e) => {
      if (!e.layer) return;
      featureGroup.clearLayers();
      featureGroup.addLayer(e.layer);
      const coords = extractCoords(e.layer);
      onZoneChange(coords.length >= 3 ? coords : null);
    };

    const handleEdited = (e) => {
      let nextZone = null;
      e.layers.eachLayer((layer) => {
        const coords = extractCoords(layer);
        if (coords.length >= 3) {
          nextZone = coords;
        }
      });
      onZoneChange(nextZone);
    };

    const handleDeleted = () => {
      onZoneChange(null);
    };

    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(drawControl);
    };
  }, [map, onZoneChange]);

  useEffect(() => {
    if (!featureGroupRef.current) return;
    const featureGroup = featureGroupRef.current;
    featureGroup.clearLayers();

    if (zone && zone.length >= 3) {
      featureGroup.addLayer(L.polygon(zone, { color: '#28a745' }));
    }
  }, [zone]);

  return <FeatureGroup ref={featureGroupRef} />;
}

const DeliveryZonePicker = ({ deliveryZone, onZoneChange, center = DEFAULT_CENTER }) => {
  const zone = useMemo(() => normalizeZone(deliveryZone), [deliveryZone]);
  const safeCenter = useMemo(() => normalizeCenter(center), [center]);

  return (
    <div style={{ height: '500px', width: '100%', position: 'relative' }}>
      <MapContainer center={safeCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <DrawLayer zone={zone} onZoneChange={onZoneChange} />
      </MapContainer>
      <div className="mt-2 text-center">
        <small className="text-muted">📍 Нажмите на иконку многоугольника справа и нарисуйте зону доставки</small>
      </div>
    </div>
  );
};

export default DeliveryZonePicker;
