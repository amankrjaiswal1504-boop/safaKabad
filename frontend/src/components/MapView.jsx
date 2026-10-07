// Leaflet map with OpenStreetMap tiles (free, no key). Markers are HTML div
// icons so no image assets are needed and they follow the theme.
import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useConfig } from '../context/ConfigContext';

const COLORS = { rust: '#168045', patina: '#16A34A', blue: '#2F6DB5', steel: '#4F5955', amber: '#A0701A' };

export function pinIcon(color = 'rust', label = '') {
  const c = COLORS[color] || color;
  return L.divIcon({
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
    html: `<div style="position:relative;width:30px;height:38px">
      <svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37s13-12.3 13-22A13 13 0 0 0 2 15c0 9.7 13 22 13 22z" fill="${c}" stroke="white" stroke-width="2"/></svg>
      <span style="position:absolute;top:6px;left:0;right:0;text-align:center;color:white;font:600 11px Inter,sans-serif">${label}</span>
    </div>`,
  });
}

export function dotIcon(color = 'blue') {
  const c = COLORS[color] || color;
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:${c};border:3px solid white;box-shadow:0 0 0 6px ${c}33"></span>`,
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (valid.length === 1) map.setView(valid[0], 15);
    else if (valid.length > 1) map.fitBounds(valid, { padding: [36, 36], maxZoom: 15 });
  }, [JSON.stringify(points)]);
  return null;
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

// markers: [{ id, lat, lng, color, label, popup, icon: 'pin' | 'dot', draggable, onDragEnd }]
export default function MapView({ markers = [], line, center, zoom = 12, height = 320, onPick, fit = true, className = '' }) {
  const { mapCenter } = useConfig();
  const pts = markers.map((m) => [m.lat, m.lng]);
  return (
    <div className={`overflow-hidden rounded-xl border border-steel-100 ${className}`} style={{ height }}>
      <MapContainer center={pts[0] || center || mapCenter()} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {fit && <FitBounds points={pts} />}
        {onPick && <ClickToPick onPick={onPick} />}
        {line && line.length > 1 && <Polyline positions={line} pathOptions={{ color: COLORS.rust, weight: 3, opacity: 0.7, dashArray: '6 6' }} />}
        {markers
          .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
          .map((m) => (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={m.icon === 'dot' ? dotIcon(m.color) : pinIcon(m.color, m.label)}
              draggable={Boolean(m.draggable)}
              eventHandlers={m.onDragEnd ? { dragend: (e) => m.onDragEnd(e.target.getLatLng()) } : undefined}
            >
              {m.popup && <Popup>{m.popup}</Popup>}
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
