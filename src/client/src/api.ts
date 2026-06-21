import type {
  ElevationPoint,
  ElevationSummary,
  Location,
  Metrics,
  RouteFeature,
  Trip,
  TripData,
} from "./types";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
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
    route,
    metrics: metrics.metrics,
    elevationPoints: elevationPoints.points,
    elevationSummary: elevationSummary.summary,
  };
}
