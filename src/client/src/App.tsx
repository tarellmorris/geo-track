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
  Plus,
  Radio,
  RefreshCw,
  Route,
  Square,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  addTripLocation,
  ApiError,
  completeTrip,
  createTrip,
  getTripData,
  getTrips,
} from "./api";
import { ElevationChart } from "./components/ElevationChart";
import { TripMap } from "./components/TripMap";
import type { Location, RouteFeature, Trip, TripData } from "./types";

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

function defaultTripName() {
  return `Trip ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date())}`;
}

function buildRoute(tripId: string, locations: Location[]): RouteFeature | null {
  if (locations.length < 2) {
    return null;
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: locations.map((location) => location.point.coordinates),
    },
    properties: { tripId },
  };
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
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
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTripName, setNewTripName] = useState(defaultTripName);
  const [isCreating, setIsCreating] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [recordingTripId, setRecordingTripId] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const uploadChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );
  const activeTrip = useMemo(
    () => trips.find((trip) => trip.status === "active") ?? null,
    [trips],
  );

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setRecordingTripId(null);
  }, []);

  const appendLocation = useCallback(
    (tripId: string, location: Location) => {
      setTrips((current) =>
        current.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                location_count: trip.location_count + 1,
                first_location_at: trip.first_location_at ?? location.time,
                last_location_at: location.time,
              }
            : trip,
        ),
      );

      if (selectedTripId === tripId) {
        setTripData((current) => {
          if (!current) {
            return current;
          }
          const locations = [...current.locations, location];
          return {
            ...current,
            locations,
            route: buildRoute(tripId, locations),
          };
        });
      }
    },
    [selectedTripId],
  );

  const beginRecording = useCallback(
    (tripId: string) => {
      if (!("geolocation" in navigator)) {
        setRecordingError("This browser does not support location recording.");
        return;
      }

      stopWatching();
      setRecordingError(null);
      setRecordingTripId(tripId);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          uploadChainRef.current = uploadChainRef.current
            .then(() => addTripLocation(tripId, position))
            .then((location) => appendLocation(tripId, location))
            .catch((requestError: unknown) => {
              setRecordingError(
                requestError instanceof Error
                  ? requestError.message
                  : "A location sample could not be saved.",
              );
            });
        },
        (positionError) => {
          setRecordingError(positionError.message || "Location access failed.");
          stopWatching();
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        },
      );
    },
    [appendLocation, stopWatching],
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

  const handleCreateTrip = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = newTripName.trim();
      if (!name) {
        return;
      }

      setIsCreating(true);
      setRecordingError(null);

      try {
        const trip = await createTrip(name);
        setTrips((current) => [trip, ...current]);
        setTripData(null);
        setIsLoadingData(true);
        setSelectedTripId(trip.id);
        setIsCreateOpen(false);
        setNewTripName(defaultTripName());
        beginRecording(trip.id);
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 409) {
          const existing = requestError.data.activeTrip as Trip | undefined;
          if (existing) {
            setTrips((current) => [
              existing,
              ...current.filter((trip) => trip.id !== existing.id),
            ]);
            selectTrip(existing.id);
          }
        }
        setRecordingError(
          requestError instanceof Error
            ? requestError.message
            : "The trip could not be started.",
        );
      } finally {
        setIsCreating(false);
      }
    },
    [beginRecording, newTripName, selectTrip],
  );

  const handleCompleteTrip = useCallback(async () => {
    if (!selectedTrip || selectedTrip.status !== "active") {
      return;
    }

    setIsStopping(true);
    setRecordingError(null);
    stopWatching();

    try {
      await uploadChainRef.current;
      const completed = await completeTrip(selectedTrip.id);
      const [data, nextTrips] = await Promise.all([
        getTripData(selectedTrip.id),
        getTrips(),
      ]);
      setTripData(data);
      setTrips(
        nextTrips.map((trip) => (trip.id === completed.id ? completed : trip)),
      );
    } catch (requestError) {
      setRecordingError(
        requestError instanceof Error
          ? requestError.message
          : "The trip could not be completed.",
      );
    } finally {
      setIsStopping(false);
    }
  }, [selectedTrip, stopWatching]);

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

  useEffect(() => stopWatching, [stopWatching]);

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
          <div className="picker-heading">
            <label htmlFor="trip-select">Current trip</label>
            <Button
              size="sm"
              variant="primary"
              className="brand-primary"
              isDisabled={Boolean(activeTrip)}
              onPress={() => {
                setRecordingError(null);
                setIsCreateOpen(true);
              }}
            >
              <Plus size={15} />
              New trip
            </Button>
          </div>
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
                  {trip.name}{trip.status === "active" ? " (active)" : ""}
                </option>
              ))}
            </select>
          </div>
          {activeTrip && activeTrip.id !== selectedTripId && (
            <button
              type="button"
              className="active-trip-link"
              onClick={() => selectTrip(activeTrip.id)}
            >
              <Radio size={14} />
              Return to active trip
            </button>
          )}
        </section>

        {recordingError && (
          <div className="recording-error">
            <Activity size={16} />
            <span>{recordingError}</span>
            <button
              type="button"
              aria-label="Dismiss recording error"
              onClick={() => setRecordingError(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}

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
                <span className="eyebrow">
                  {selectedTrip.status === "active" ? "Active route" : "Recorded route"}
                </span>
                <h2>{selectedTrip.name}</h2>
              </div>
              <div className="trip-date">
                <CalendarDays size={16} />
                {formatDate(selectedTrip.started_at)}
              </div>
            </section>

            {selectedTrip.status === "active" && (
              <section className="recording-controls">
                <div className="recording-status">
                  <span
                    className={recordingTripId ? "recording-pulse is-recording" : "recording-pulse"}
                  />
                  <div>
                    <strong>{recordingTripId ? "Recording location" : "Trip ready"}</strong>
                    <span>
                      {recordingTripId
                        ? "GPS samples are being saved"
                        : "Resume recording or finish this trip"}
                    </span>
                  </div>
                </div>
                <div className="recording-buttons">
                  {!recordingTripId && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="brand-primary"
                      onPress={() => beginRecording(selectedTrip.id)}
                    >
                      <Radio size={15} />
                      Record
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={recordingTripId ? "danger" : "outline"}
                    isDisabled={isStopping}
                    onPress={handleCompleteTrip}
                  >
                    {isStopping ? <Spinner size="sm" /> : <Square size={14} />}
                    Finish trip
                  </Button>
                </div>
              </section>
            )}

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
          <span className={recordingTripId ? "status-dot is-recording" : "status-dot"} />
          {recordingTripId
            ? "Recording live GPS locations"
            : selectedTrip
              ? `${selectedTrip.location_count} recorded locations`
              : "Waiting for trip data"}
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

      {isCreateOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="create-trip-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-trip-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">New recording</span>
                <h2 id="create-trip-title">Start a trip</h2>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label="Close new trip dialog"
                onPress={() => setIsCreateOpen(false)}
              >
                <X size={18} />
              </Button>
            </div>
            <form onSubmit={handleCreateTrip}>
              <label htmlFor="trip-name">Trip name</label>
              <input
                id="trip-name"
                value={newTripName}
                maxLength={120}
                autoFocus
                onChange={(event) => setNewTripName(event.target.value)}
              />
              <p>Location recording begins after the trip is created.</p>
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onPress={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="brand-primary"
                  isDisabled={isCreating || !newTripName.trim()}
                >
                  {isCreating ? <Spinner size="sm" /> : <Radio size={16} />}
                  Start recording
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
