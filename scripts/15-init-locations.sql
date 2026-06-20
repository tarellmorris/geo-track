CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trips (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	started_at timestamp DEFAULT CURRENT_TIMESTAMP,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
	point geometry(Point, 4326) NOT NULL,
	time timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS locations_trip_time_idx
	ON locations (trip_id, time);

CREATE INDEX IF NOT EXISTS locations_point_idx
	ON locations
	USING GIST (point);

DO $$
DECLARE
	_default_trip_id uuid;
	_max_move float;
	_start_loc geometry;
BEGIN
	_max_move := 1 / 110.0; -- about 1km
	_start_loc := ST_SetSRID(ST_MakePoint(-71.5550657, 42.0642992), 4326);

	DELETE FROM trips WHERE name = 'Simulated Trip';

	INSERT INTO trips (name)
		VALUES ('Simulated Trip')
		RETURNING id INTO _default_trip_id;

	INSERT INTO locations (trip_id, point)
		SELECT _default_trip_id, _start_loc;

	FOR counter IN 1..45 LOOP
		INSERT INTO locations (trip_id, point, time)
			SELECT
				_default_trip_id,
				ST_Translate(
					existing.point,
					random() * _max_move - _max_move / 2,
					random() * _max_move - _max_move / 2
				),
				time + (1 * interval '1 minute')
			FROM (
				SELECT *
				FROM locations
				WHERE trip_id = _default_trip_id
				ORDER BY time DESC
				LIMIT 1
			) existing;
	END LOOP;

	INSERT INTO locations (trip_id, point, time)
		SELECT
			_default_trip_id,
			_start_loc,
			time + (1 * interval '1 minute')
		FROM (
			SELECT *
			FROM locations
			WHERE trip_id = _default_trip_id
			ORDER BY time DESC
			LIMIT 1
		) existing;
END;
$$;
