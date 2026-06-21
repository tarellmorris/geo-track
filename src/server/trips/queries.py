from django.conf import settings
from django.db import connection

from .db import dict_fetch_all, elevation_table_name


def list_trips():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                t.id,
                t.name,
                t.started_at,
                t.created_at,
                count(l.id) AS location_count,
                min(l.time) AS first_location_at,
                max(l.time) AS last_location_at
            FROM trips t
            LEFT JOIN locations l ON l.trip_id = t.id
            GROUP BY t.id, t.name, t.started_at, t.created_at
            ORDER BY t.created_at DESC;
            """
        )
        return dict_fetch_all(cursor)


def get_trip(trip_id):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                t.id,
                t.name,
                t.started_at,
                t.created_at,
                count(l.id) AS location_count,
                min(l.time) AS first_location_at,
                max(l.time) AS last_location_at
            FROM trips t
            LEFT JOIN locations l ON l.trip_id = t.id
            WHERE t.id = %s
            GROUP BY t.id, t.name, t.started_at, t.created_at;
            """,
            [trip_id],
        )
        rows = dict_fetch_all(cursor)
        return rows[0] if rows else None


def list_locations(trip_id):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id,
                time,
                ST_AsGeoJSON(point)::json AS point
            FROM locations
            WHERE trip_id = %s
            ORDER BY time;
            """,
            [trip_id],
        )
        return dict_fetch_all(cursor)


def get_route(trip_id):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT ST_AsGeoJSON(ST_MakeLine(point ORDER BY time))::json AS route
            FROM locations
            WHERE trip_id = %s;
            """,
            [trip_id],
        )
        rows = dict_fetch_all(cursor)
        return rows[0]["route"] if rows and rows[0]["route"] else None


def get_distance_metrics(trip_id):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            WITH segments AS (
                SELECT
                    time,
                    point,
                    LEAD(point) OVER (ORDER BY time) AS next_point,
                    LEAD(time) OVER (ORDER BY time) AS next_time
                FROM locations
                WHERE trip_id = %s
            ), distances AS (
                SELECT
                    ST_DistanceSphere(point, next_point) AS distance_m,
                    time,
                    next_time
                FROM segments
                WHERE next_point IS NOT NULL
            )
            SELECT
                COALESCE(SUM(distance_m) / 1000, 0) AS total_distance_km,
                COALESCE(
                    (EXTRACT(epoch FROM MAX(next_time) - MIN(time)) / 3600)::double precision,
                    0
                ) AS total_hours,
                COALESCE(
                    (SUM(distance_m) / 1000)
                    / NULLIF(EXTRACT(epoch FROM MAX(next_time) - MIN(time)) / 3600, 0),
                    0
                ) AS avg_speed_kmh
            FROM distances;
            """,
            [trip_id],
        )
        return dict_fetch_all(cursor)[0]


def get_elevation_profile(trip_id):
    table = elevation_table_name()

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            WITH transformed_locations AS (
                SELECT
                    time,
                    point,
                    ST_Transform(point, %s) AS raster_point
                FROM locations
                WHERE trip_id = %s
            )
            SELECT
                l.time,
                ST_AsGeoJSON(l.point)::json AS location,
                ST_Value(e.rast, l.raster_point) AS elevation
            FROM transformed_locations l
            JOIN {table} e
                ON ST_ConvexHull(e.rast) && l.raster_point
                AND ST_Intersects(e.rast, l.raster_point)
            ORDER BY l.time;
            """,
            [settings.DEM_SRID, trip_id],
        )
        return dict_fetch_all(cursor)


def get_elevation_summary(trip_id):
    table = elevation_table_name()

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            WITH transformed_locations AS (
                SELECT
                    time,
                    ST_Transform(point, %s) AS raster_point
                FROM locations
                WHERE trip_id = %s
            ), data_points AS (
                SELECT
                    l.time,
                    ST_Value(e.rast, l.raster_point) AS elevation
                FROM transformed_locations l
                JOIN {table} e
                    ON ST_ConvexHull(e.rast) && l.raster_point
                    AND ST_Intersects(e.rast, l.raster_point)
            ), deltas AS (
                SELECT
                    elevation,
                    LEAD(elevation) OVER (ORDER BY time) - elevation AS delta
                FROM data_points
            )
            SELECT
                COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS total_ascent,
                COALESCE(ABS(SUM(delta) FILTER (WHERE delta < 0)), 0) AS total_descent
            FROM deltas
            WHERE delta IS NOT NULL;
            """,
            [settings.DEM_SRID, trip_id],
        )
        return dict_fetch_all(cursor)[0]
