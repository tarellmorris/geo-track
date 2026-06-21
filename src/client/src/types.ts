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
  created_at: string;
  location_count: number;
  first_location_at: string | null;
  last_location_at: string | null;
}

export interface Location {
  id: string;
  time: string;
  point: PointGeometry;
}

export interface RouteFeature {
  type: "Feature";
  geometry: LineStringGeometry;
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
  total_ascent: number;
  total_descent: number;
}

export interface TripData {
  locations: Location[];
  route: RouteFeature;
  metrics: Metrics;
  elevationPoints: ElevationPoint[];
  elevationSummary: ElevationSummary;
}
