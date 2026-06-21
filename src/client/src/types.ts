export type Position = [number, number];

export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}

export interface LineStringGeometry {
  type: "LineString";
  coordinates: Position[];
}

export interface Trip {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  status: "active" | "completed";
  created_at: string;
  location_count: number;
  first_location_at: string | null;
  last_location_at: string | null;
}

export interface Location {
  id: string;
  time: string;
  accuracy_m: number | null;
  point: PointGeometry;
}

export interface RouteFeature {
  type: "Feature";
  geometry: LineStringGeometry | null;
  properties: {
    tripId: string;
  };
}

export interface Metrics {
  total_distance_km: number;
  total_hours: number;
  avg_speed_kmh: number;
}

export interface ElevationPoint {
  time: string;
  location: PointGeometry;
  elevation: number | null;
}

export interface ElevationSummary {
  total_ascent: number | null;
  total_descent: number | null;
  elevation_sample_count: number;
  total_location_count: number;
  coverage: "pending" | "unavailable" | "partial" | "available";
}

export interface TripData {
  locations: Location[];
  route: RouteFeature | null;
  metrics: Metrics;
  elevationPoints: ElevationPoint[];
  elevationSummary: ElevationSummary;
}
