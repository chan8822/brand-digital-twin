import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Bundle Leaflet's default marker images through Vite so the runtime
// doesn't depend on unpkg.com (and so a strict CSP can stay in place).
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { getSocket } from "@/lib/socket";

const DefaultIcon = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// A small house-shaped marker for the customer's destination so it's
// visually distinct from the moving rider pin.
const DestinationIcon = L.divIcon({
  className: "rider-map-destination-icon",
  html:
    '<div style="width:24px;height:24px;border-radius:50%;background:#D4AF37;border:2px solid #050505;box-shadow:0 0 0 2px #D4AF37;display:flex;align-items:center;justify-content:center;color:#050505;font-size:14px;font-weight:700;">⌂</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

interface RiderPosition {
  riderId: number;
  lat: number;
  lng: number;
  orderId?: number;
}

interface DeliveryEta {
  orderId: number;
  etaAt: string;
  distanceMeters: number;
}

// Maximum number of past rider positions kept for the trailing polyline.
const MAX_TRAIL_POINTS = 50;

function FitBounds({
  rider,
  destination,
}: {
  rider: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (rider && destination) {
      const bounds = L.latLngBounds([
        [rider.lat, rider.lng],
        [destination.lat, destination.lng],
      ]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
    } else if (rider) {
      map.flyTo([rider.lat, rider.lng], map.getZoom(), { duration: 0.6 });
    } else if (destination) {
      map.flyTo([destination.lat, destination.lng], 14, { duration: 0.6 });
    }
  }, [
    rider?.lat,
    rider?.lng,
    destination?.lat,
    destination?.lng,
    map,
  ]);
  return null;
}

interface Props {
  orderId: number;
  /** Optional initial rider position (e.g. from /delivery seed). */
  initial?: { lat: number; lng: number; riderId?: number };
  /** Customer drop-off coordinates and label. */
  destination?: { lat: number; lng: number; label?: string };
}

export default function RiderMap({ orderId, initial, destination }: Props) {
  const [position, setPosition] = useState<RiderPosition | null>(
    initial ? { lat: initial.lat, lng: initial.lng, riderId: initial.riderId ?? 0 } : null,
  );
  const [trail, setTrail] = useState<Array<[number, number]>>(
    initial ? [[initial.lat, initial.lng]] : [],
  );
  const [eta, setEta] = useState<DeliveryEta | null>(null);
  // Track the most recent point we've appended so that duplicate emits
  // (same lat/lng) don't bloat the trail.
  const lastPointRef = useRef<[number, number] | null>(
    initial ? [initial.lat, initial.lng] : null,
  );

  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe:order", orderId);
    const onPosition = (msg: RiderPosition) => {
      if (!msg || (msg.orderId && msg.orderId !== orderId)) return;
      setPosition({ riderId: msg.riderId, lat: msg.lat, lng: msg.lng });
      const last = lastPointRef.current;
      if (!last || last[0] !== msg.lat || last[1] !== msg.lng) {
        lastPointRef.current = [msg.lat, msg.lng];
        setTrail((prev) => {
          const next = [...prev, [msg.lat, msg.lng] as [number, number]];
          return next.length > MAX_TRAIL_POINTS
            ? next.slice(next.length - MAX_TRAIL_POINTS)
            : next;
        });
      }
    };
    const onEta = (msg: DeliveryEta) => {
      if (!msg || msg.orderId !== orderId) return;
      setEta(msg);
    };
    socket.on("rider:position", onPosition);
    socket.on("delivery:eta", onEta);
    return () => {
      socket.off("rider:position", onPosition);
      socket.off("delivery:eta", onEta);
      socket.emit("unsubscribe:order", orderId);
    };
  }, [orderId]);

  const etaMinutes = eta
    ? Math.max(0, Math.round((new Date(eta.etaAt).getTime() - Date.now()) / 60000))
    : null;
  const distanceLabel = eta
    ? eta.distanceMeters >= 1000
      ? `${(eta.distanceMeters / 1000).toFixed(1)} km`
      : `${eta.distanceMeters} m`
    : null;

  const center = useMemo<[number, number]>(() => {
    if (position) return [position.lat, position.lng];
    if (initial) return [initial.lat, initial.lng];
    if (destination) return [destination.lat, destination.lng];
    // Fallback: Bangalore-ish centroid for the demo data.
    return [12.9716, 77.5946];
  }, [position, initial, destination]);

  return (
    <div className="space-y-2">
      {eta && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-clinical-zinc">
            Live ETA: <span className="text-clinical-gold font-semibold">{etaMinutes} min</span>
          </span>
          <span className="text-clinical-zinc tabular-nums">{distanceLabel} away</span>
        </div>
      )}
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
        {destination && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={DestinationIcon}
          >
            <Popup>{destination.label ?? "Delivery address"}</Popup>
          </Marker>
        )}
        {trail.length >= 2 && (
          <Polyline
            positions={trail}
            pathOptions={{
              color: "#D4AF37",
              weight: 3,
              opacity: 0.85,
              dashArray: "6 6",
            }}
          />
        )}
        {position && (
          <Marker position={[position.lat, position.lng]} icon={DefaultIcon}>
            <Popup>Rider #{position.riderId}</Popup>
          </Marker>
        )}
        <FitBounds
          rider={position ? { lat: position.lat, lng: position.lng } : null}
          destination={destination ? { lat: destination.lat, lng: destination.lng } : null}
        />
      </MapContainer>
      </div>
    </div>
  );
}
