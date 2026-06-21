import type {
  ElevationPoint,
  ElevationSummary,
  Location,
  Metrics,
  RouteFeature,
  Trip,
  TripData,
} from "./types";

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(typeof data.detail === "string" ? data.detail : `Request failed with status ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(response.status, data);
  }

  return response.json() as Promise<T>;
}

async function sendJson<T>(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}

export async function getTrips(signal?: AbortSignal): Promise<Trip[]> {
  const data = await getJson<{ trips: Trip[] }>("/api/trips/", signal);
  return data.trips;
}

export async function getTripData(
  tripId: string,
  signal?: AbortSignal,
): Promise<TripData> {
  const basePath = `/api/trips/${tripId}`;
  const [locations, route, metrics, elevationPoints, elevationSummary] =
    await Promise.all([
      getJson<{ locations: Location[] }>(`${basePath}/locations/`, signal),
      getJson<RouteFeature>(`${basePath}/route/`, signal),
      getJson<{ metrics: Metrics }>(`${basePath}/metrics/`, signal),
      getJson<{ points: ElevationPoint[] }>(
        `${basePath}/elevation-profile/`,
        signal,
      ),
      getJson<{ summary: ElevationSummary }>(
        `${basePath}/elevation-summary/`,
        signal,
      ),
    ]);

  return {
    locations: locations.locations,
    route: route.geometry ? route : null,
    metrics: metrics.metrics,
    elevationPoints: elevationPoints.points,
    elevationSummary: elevationSummary.summary,
  };
}

export async function createTrip(name: string): Promise<Trip> {
  const data = await sendJson<{ trip: Trip }>("/api/trips/", "POST", {
    name,
    startedAt: new Date().toISOString(),
  });
  return data.trip;
}

export async function addTripLocation(
  tripId: string,
  position: GeolocationPosition,
): Promise<Location> {
  const data = await sendJson<{ location: Location }>(
    `/api/trips/${tripId}/locations/`,
    "POST",
    {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      recordedAt: new Date(position.timestamp).toISOString(),
    },
  );
  return data.location;
}

export async function completeTrip(tripId: string): Promise<Trip> {
  const data = await sendJson<{ trip: Trip }>(
    `/api/trips/${tripId}/`,
    "PATCH",
    {
      status: "completed",
      endedAt: new Date().toISOString(),
    },
  );
  return data.trip;
}
