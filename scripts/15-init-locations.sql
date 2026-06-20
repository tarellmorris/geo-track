CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS locations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	point geometry(Point, 4326),
	time timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS locations_point_idx
	ON locations
	USING GIST (point);
