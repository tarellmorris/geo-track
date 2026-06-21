import uuid

import django.db.models.deletion
from django.db import migrations, models


FORWARDS_SQL = """
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    started_at timestamp DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS trip_id uuid;

DO $$
DECLARE
    legacy_trip_id uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM locations WHERE trip_id IS NULL) THEN
        INSERT INTO trips (name, started_at)
        SELECT
            'Simulated Trip',
            COALESCE(MIN(time), CURRENT_TIMESTAMP)
        FROM locations
        RETURNING id INTO legacy_trip_id;

        UPDATE locations
        SET trip_id = legacy_trip_id
        WHERE trip_id IS NULL;
    END IF;
END;
$$;

ALTER TABLE locations
    ALTER COLUMN trip_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'locations_trip_id_fkey'
            AND conrelid = 'locations'::regclass
    ) THEN
        ALTER TABLE locations
            ADD CONSTRAINT locations_trip_id_fkey
            FOREIGN KEY (trip_id)
            REFERENCES trips(id)
            ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS locations_trip_time_idx
    ON locations (trip_id, time);

CREATE INDEX IF NOT EXISTS locations_point_idx
    ON locations
    USING GIST (point);
"""


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=FORWARDS_SQL,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.CreateModel(
                    name="Trip",
                    fields=[
                        (
                            "id",
                            models.UUIDField(
                                default=uuid.uuid4,
                                editable=False,
                                primary_key=True,
                                serialize=False,
                            ),
                        ),
                        ("name", models.TextField()),
                        ("started_at", models.DateTimeField()),
                        ("created_at", models.DateTimeField()),
                    ],
                    options={
                        "db_table": "trips",
                        "managed": False,
                    },
                ),
                migrations.CreateModel(
                    name="Location",
                    fields=[
                        (
                            "id",
                            models.UUIDField(
                                default=uuid.uuid4,
                                editable=False,
                                primary_key=True,
                                serialize=False,
                            ),
                        ),
                        ("time", models.DateTimeField()),
                        (
                            "trip",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.CASCADE,
                                to="trips.trip",
                            ),
                        ),
                    ],
                    options={
                        "db_table": "locations",
                        "managed": False,
                    },
                ),
            ],
        ),
    ]
