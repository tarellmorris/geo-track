import { useEffect } from "react";
import { latLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import type { Location, RouteFeature } from "../types";

interface TripMapProps {
  locations: Location[];
  route: RouteFeature | null;
}

function FitRoute({ route }: { route: RouteFeature | null }) {
  const map = useMap();

  useEffect(() => {
    if (!route?.geometry?.coordinates.length) {
      return;
    }

    const bounds = latLngBounds(
      route.geometry.coordinates.map(([longitude, latitude]) => [
        latitude,
        longitude,
      ]),
    );
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 });
  }, [map, route]);

  return null;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TripMap({ locations, route }: TripMapProps) {
  const routePositions =
    route?.geometry?.coordinates.map(([longitude, latitude]) => [
      latitude,
      longitude,
    ] as [number, number]) ?? [];

  return (
    <MapContainer
      center={[42.0642992, -71.5550657]}
      zoom={12}
      zoomControl
      className="trip-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {routePositions.length > 1 && (
        <>
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#ffffff",
              opacity: 0.9,
              weight: 8,
            }}
          />
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#167a63",
              opacity: 1,
              weight: 4,
            }}
          />
        </>
      )}

      {locations.map((location, index) => {
        const [longitude, latitude] = location.point.coordinates;
        const isStart = index === 0;
        const isEnd = index === locations.length - 1;

        return (
          <CircleMarker
            key={location.id}
            center={[latitude, longitude]}
            radius={isStart || isEnd ? 7 : 3}
            pathOptions={{
              color: isEnd ? "#b34d37" : "#0d5e4d",
              fillColor: isEnd ? "#dc7358" : isStart ? "#f1b84b" : "#35a17d",
              fillOpacity: 1,
              opacity: isStart || isEnd ? 1 : 0.65,
              weight: isStart || isEnd ? 3 : 1,
            }}
          >
            <Popup>
              <strong>{isStart ? "Trip start" : isEnd ? "Trip end" : "Recorded point"}</strong>
              <br />
              {formatTime(location.time)}
            </Popup>
          </CircleMarker>
        );
      })}

      <FitRoute route={route} />
    </MapContainer>
  );
}
