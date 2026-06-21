from django.db import migrations, models


FORWARDS_SQL = """
ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS ended_at timestamp;

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS accuracy_m double precision;

UPDATE trips
SET
    status = 'completed',
    ended_at = COALESCE(
        ended_at,
        (
            SELECT MAX(locations.time)
            FROM locations
            WHERE locations.trip_id = trips.id
        ),
        started_at
    )
WHERE status IS NULL;

ALTER TABLE trips
    ALTER COLUMN status SET DEFAULT 'active',
    ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'trips_status_check'
            AND conrelid = 'trips'::regclass
    ) THEN
        ALTER TABLE trips
            ADD CONSTRAINT trips_status_check
            CHECK (status IN ('active', 'completed'));
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS trips_single_active_idx
    ON trips (status)
    WHERE status = 'active';
"""


class Migration(migrations.Migration):
    dependencies = [("trips", "0001_adopt_trip_schema")]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=FORWARDS_SQL,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="trip",
                    name="ended_at",
                    field=models.DateTimeField(null=True),
                ),
                migrations.AddField(
                    model_name="trip",
                    name="status",
                    field=models.TextField(default="active"),
                ),
                migrations.AddField(
                    model_name="location",
                    name="accuracy_m",
                    field=models.FloatField(null=True),
                ),
            ],
        ),
    ]
