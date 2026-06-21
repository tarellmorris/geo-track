import uuid

from django.db import models


class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True)
    status = models.TextField(default="active")
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "trips"


class Location(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE)
    accuracy_m = models.FloatField(null=True)
    time = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "locations"
