from django.conf import settings
from django.db import IntegrityError, connection, transaction

from .db import dict_fetch_all, elevation_table_name


def list_trips():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                t.id,
                t.name,
                t.started_at,
                t.ended_at,
                t.status,
                t.created_at,
                count(l.id) AS location_count,
                min(l.time) AS first_location_at,
                max(l.time) AS last_location_at
            FROM trips t
            LEFT JOIN locations l ON l.trip_id = t.id
            GROUP BY t.id, t.name, t.started_at, t.ended_at, t.status, t.created_at
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
                t.ended_at,
                t.status,
                t.created_at,
                count(l.id) AS location_count,
                min(l.time) AS first_location_at,
                max(l.time) AS last_location_at
            FROM trips t
            LEFT JOIN locations l ON l.trip_id = t.id
            WHERE t.id = %s
            GROUP BY t.id, t.name, t.started_at, t.ended_at, t.status, t.created_at;
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
                accuracy_m,
                ST_AsGeoJSON(point)::json AS point
            FROM locations
            WHERE trip_id = %s
            ORDER BY time;
            """,
            [trip_id],
        )
        return dict_fetch_all(cursor)


def create_trip(name, started_at):
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO trips (name, started_at, status)
                VALUES (%s, COALESCE(%s, CURRENT_TIMESTAMP), 'active')
                RETURNING id;
                """,
                [name, started_at],
            )
            trip_id = cursor.fetchone()[0]
    except IntegrityError:
        return None

    return get_trip(trip_id)


def add_location(trip_id, longitude, latitude, recorded_at, accuracy_m):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO locations (trip_id, point, time, accuracy_m)
            SELECT
                id,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                COALESCE(%s, CURRENT_TIMESTAMP),
                %s
            FROM trips
            WHERE id = %s
                AND status = 'active'
            RETURNING
                id,
                time,
                accuracy_m,
                ST_AsGeoJSON(point)::json AS point;
            """,
            [longitude, latitude, recorded_at, accuracy_m, trip_id],
        )
        rows = dict_fetch_all(cursor)
        return rows[0] if rows else None


def complete_trip(trip_id, ended_at):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE trips
            SET
                status = 'completed',
                ended_at = COALESCE(%s, (
                    SELECT MAX(time)
                    FROM locations
                    WHERE trip_id = trips.id
                ), CURRENT_TIMESTAMP)
            WHERE id = %s
                AND status = 'active'
            RETURNING id;
            """,
            [ended_at, trip_id],
        )
        row = cursor.fetchone()

    return get_trip(row[0]) if row else get_trip(trip_id)


def get_route(trip_id):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT CASE
                WHEN COUNT(*) >= 2
                THEN ST_AsGeoJSON(ST_MakeLine(point ORDER BY time))::json
                ELSE NULL
            END AS route
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
                    id,
                    time,
                    point,
                    ST_Transform(point, %s) AS raster_point
                FROM locations
                WHERE trip_id = %s
            ), sampled_points AS (
                SELECT DISTINCT ON (l.id)
                    l.id,
                    l.time,
                    l.point,
                    ST_Value(e.rast, l.raster_point) AS elevation
                FROM transformed_locations l
                JOIN {table} e
                    ON ST_ConvexHull(e.rast) && l.raster_point
                    AND ST_Intersects(e.rast, l.raster_point)
                WHERE ST_Value(e.rast, l.raster_point) IS NOT NULL
                ORDER BY l.id
            )
            SELECT
                time,
                ST_AsGeoJSON(point)::json AS location,
                elevation
            FROM sampled_points
            ORDER BY time;
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
                    id,
                    time,
                    ST_Transform(point, %s) AS raster_point
                FROM locations
                WHERE trip_id = %s
            ), data_points AS (
                SELECT DISTINCT ON (l.id)
                    l.id,
                    l.time,
                    ST_Value(e.rast, l.raster_point) AS elevation
                FROM transformed_locations l
                JOIN {table} e
                    ON ST_ConvexHull(e.rast) && l.raster_point
                    AND ST_Intersects(e.rast, l.raster_point)
                WHERE ST_Value(e.rast, l.raster_point) IS NOT NULL
                ORDER BY l.id
            ), deltas AS (
                SELECT
                    elevation,
                    LEAD(elevation) OVER (ORDER BY time) - elevation AS delta
                FROM data_points
            ), summary AS (
                SELECT
                    COUNT(*) AS elevation_sample_count,
                    COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS total_ascent,
                    COALESCE(ABS(SUM(delta) FILTER (WHERE delta < 0)), 0) AS total_descent
                FROM deltas
            )
            SELECT
                CASE
                    WHEN summary.elevation_sample_count >= 2
                    THEN summary.total_ascent
                    ELSE NULL
                END AS total_ascent,
                CASE
                    WHEN summary.elevation_sample_count >= 2
                    THEN summary.total_descent
                    ELSE NULL
                END AS total_descent,
                summary.elevation_sample_count,
                location_totals.location_count AS total_location_count,
                CASE
                    WHEN location_totals.location_count = 0 THEN 'pending'
                    WHEN summary.elevation_sample_count = 0 THEN 'unavailable'
                    WHEN summary.elevation_sample_count < location_totals.location_count THEN 'partial'
                    ELSE 'available'
                END AS coverage
            FROM summary
            CROSS JOIN (
                SELECT COUNT(*) AS location_count
                FROM transformed_locations
            ) location_totals;
            """,
            [settings.DEM_SRID, trip_id],
        )
        return dict_fetch_all(cursor)[0]
