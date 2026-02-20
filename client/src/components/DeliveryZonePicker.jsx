import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DeliveryZonePicker = ({ deliveryZone, onZoneChange, center = [41.311081, 69.240562] }) => {
    const [zone, setZone] = useState(deliveryZone || null);

    const onCreated = (e) => {
        const { layerType, layer } = e;
        if (layerType === 'polygon') {
            const coords = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
            setZone(coords);
            onZoneChange(coords);
        }
    };

    const onEdited = (e) => {
        const { layers } = e;
        layers.eachLayer((layer) => {
            const coords = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
            setZone(coords);
            onZoneChange(coords);
        });
    };

    const onDeleted = () => {
        setZone(null);
        onZoneChange(null);
    };

    return (
        <div style={{ height: '500px', width: '100%', position: 'relative' }}>
            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <FeatureGroup>
                    <EditControl
                        position="topright"
                        onCreated={onCreated}
                        onEdited={onEdited}
                        onDeleted={onDeleted}
                        draw={{
                            rectangle: false,
                            circle: false,
                            polyline: false,
                            circlemarker: false,
                            marker: false,
                            polygon: {
                                allowIntersection: false,
                                drawError: {
                                    color: '#e1e100',
                                    message: '<strong>Oh no!<strong> you cannot draw that!'
                                },
                                shapeOptions: {
                                    color: '#28a745'
                                }
                            }
                        }}
                    />
                    {zone && <Polygon positions={zone} color="#28a745" />}
                </FeatureGroup>
            </MapContainer>
            <div className="mt-2 text-center">
                <small className="text-muted">📍 Нажмите на иконку многоугольника справа и нарисуйте зону доставки</small>
            </div>
        </div>
    );
};

export default DeliveryZonePicker;
