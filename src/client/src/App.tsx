import { Button, Spinner } from "@heroui/react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Gauge,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Route,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getTripData, getTrips } from "./api";
import { ElevationChart } from "./components/ElevationChart";
import { TripMap } from "./components/TripMap";
import type { Trip, TripData } from "./types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDuration(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const hoursPart = Math.floor(totalMinutes / 60);
  const minutesPart = totalMinutes % 60;

  return hoursPart ? `${hoursPart}h ${minutesPart}m` : `${minutesPart} min`;
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );

  const reload = useCallback(() => {
    setError(null);
    setIsLoadingTrips(true);
    setIsLoadingData(Boolean(selectedTripId));
    setReloadKey((value) => value + 1);
  }, [selectedTripId]);

  const selectTrip = useCallback((tripId: string) => {
    setTripData(null);
    setIsLoadingData(Boolean(tripId));
    setSelectedTripId(tripId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getTrips(controller.signal)
      .then((nextTrips) => {
        setTrips(nextTrips);
        setSelectedTripId((current) => current || nextTrips[0]?.id || "");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError("The trip list could not be loaded.");
      })
      .finally(() => setIsLoadingTrips(false));

    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedTripId) {
      return;
    }

    const controller = new AbortController();

    getTripData(selectedTripId, controller.signal)
      .then(setTripData)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError("The selected trip could not be loaded.");
      })
      .finally(() => setIsLoadingData(false));

    return () => controller.abort();
  }, [reloadKey, selectedTripId]);

  return (
    <main className="app-shell">
      <aside className="trip-panel">
        <header className="app-header">
          <div className="brand-mark">
            <MapPinned size={21} strokeWidth={2.2} />
          </div>
          <div>
            <h1>GeoTrack</h1>
            <p>Trip explorer</p>
          </div>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Refresh trip data"
            onPress={reload}
          >
            <RefreshCw size={17} />
          </Button>
        </header>

        <section className="trip-picker">
          <label htmlFor="trip-select">Current trip</label>
          <div className="select-wrap">
            <Route size={18} aria-hidden="true" />
            <select
              id="trip-select"
              value={selectedTripId}
              onChange={(event) => selectTrip(event.target.value)}
              disabled={isLoadingTrips || trips.length === 0}
            >
              {trips.length === 0 && <option value="">No trips available</option>}
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {error ? (
          <section className="error-state">
            <Activity size={22} />
            <h2>Data unavailable</h2>
            <p>{error}</p>
            <Button variant="primary" size="sm" onPress={reload}>
              Try again
            </Button>
          </section>
        ) : isLoadingTrips || isLoadingData || !selectedTrip || !tripData ? (
          <section className="loading-state">
            <Spinner size="lg" />
            <p>Loading trip data</p>
          </section>
        ) : (
          <div className="panel-content">
            <section className="trip-summary">
              <div>
                <span className="eyebrow">Recorded route</span>
                <h2>{selectedTrip.name}</h2>
              </div>
              <div className="trip-date">
                <CalendarDays size={16} />
                {formatDate(selectedTrip.started_at)}
              </div>
            </section>

            <section className="metric-grid" aria-label="Trip metrics">
              <Metric
                icon={<Route size={18} />}
                label="Distance"
                value={`${tripData.metrics.total_distance_km.toFixed(1)} km`}
              />
              <Metric
                icon={<Clock3 size={18} />}
                label="Duration"
                value={formatDuration(tripData.metrics.total_hours)}
              />
              <Metric
                icon={<Gauge size={18} />}
                label="Avg. speed"
                value={`${tripData.metrics.avg_speed_kmh.toFixed(1)} km/h`}
              />
              <Metric
                icon={<LocateFixed size={18} />}
                label="Points"
                value={String(selectedTrip.location_count)}
              />
            </section>

            <section className="elevation-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Terrain</span>
                  <h3>Elevation profile</h3>
                </div>
                <span>{tripData.elevationPoints.length} samples</span>
              </div>
              <ElevationChart points={tripData.elevationPoints} />
              <div className="elevation-totals">
                <div>
                  <ArrowUpRight size={17} />
                  <span>Ascent</span>
                  <strong>{Math.round(tripData.elevationSummary.total_ascent)} m</strong>
                </div>
                <div>
                  <ArrowDownRight size={17} />
                  <span>Descent</span>
                  <strong>{Math.round(tripData.elevationSummary.total_descent)} m</strong>
                </div>
              </div>
            </section>
          </div>
        )}

        <footer className="panel-footer">
          <span className="status-dot" />
          {selectedTrip ? `${selectedTrip.location_count} recorded locations` : "Waiting for trip data"}
        </footer>
      </aside>

      <section className="map-workspace" aria-label="Trip map">
        <TripMap
          locations={tripData?.locations ?? []}
          route={tripData?.route ?? null}
        />
        <div className="map-legend">
          <span><i className="legend-start" />Start</span>
          <span><i className="legend-route" />Route</span>
          <span><i className="legend-end" />End</span>
        </div>
      </section>
    </main>
  );
}
