CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS locations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	point geometry(Point, 4326),
	time timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS locations_point_idx
	ON locations
	USING GIST (point);

DO $$
DECLARE
	_max_move float;
	_start_loc geometry;
BEGIN
	_max_move := 1 / 110.0; -- about 1km
	_start_loc := ST_SetSRID(ST_MakePoint(-71.5550657, 42.0642992), 4326);

	DELETE FROM locations;
	INSERT INTO locations (point)
		SELECT _start_loc;

	FOR counter IN 1..45 LOOP
		INSERT INTO locations (point, time)
			SELECT
				ST_Translate(
					existing.point,
					random() * _max_move - _max_move / 2,
					random() * _max_move - _max_move / 2
				),
				time + (1 * interval '1 minute')
			FROM (
				SELECT *
				FROM locations
				ORDER BY time DESC
				LIMIT 1
			) existing;
	END LOOP;

	INSERT INTO locations (point, time)
		SELECT
			_start_loc,
			time + (1 * interval '1 minute')
		FROM (
			SELECT *
			FROM locations
			ORDER BY time DESC
			LIMIT 1
		) existing;
END;
$$;
