import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSocket } from "@/lib/socket";

// Fix Leaflet's default icon paths (Vite + bundler don't resolve the asset URLs).
const DefaultIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface RiderPosition {
  riderId: number;
  lat: number;
  lng: number;
  orderId?: number;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { duration: 0.6 });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  orderId: number;
  /** Optional initial rider position (e.g. from /delivery seed). */
  initial?: { lat: number; lng: number; riderId?: number };
}

export default function RiderMap({ orderId, initial }: Props) {
  const [position, setPosition] = useState<RiderPosition | null>(
    initial ? { lat: initial.lat, lng: initial.lng, riderId: initial.riderId ?? 0 } : null,
  );

  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe:order", orderId);
    const handler = (msg: RiderPosition) => {
      if (!msg || (msg.orderId && msg.orderId !== orderId)) return;
      setPosition({ riderId: msg.riderId, lat: msg.lat, lng: msg.lng });
    };
    socket.on("rider:position", handler);
    return () => {
      socket.off("rider:position", handler);
      socket.emit("unsubscribe:order", orderId);
    };
  }, [orderId]);

  const center = useMemo<[number, number]>(() => {
    if (position) return [position.lat, position.lng];
    if (initial) return [initial.lat, initial.lng];
    // Fallback: Bangalore-ish centroid for the demo data.
    return [12.9716, 77.5946];
  }, [position, initial]);

  return (
    <div className="h-64 w-full rounded-md overflow-hidden border border-clinical-slate/20">
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ background: "#0a0a0a" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {position && (
          <>
            <Marker position={[position.lat, position.lng]} icon={DefaultIcon}>
              <Popup>Rider #{position.riderId}</Popup>
            </Marker>
            <Recenter lat={position.lat} lng={position.lng} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
