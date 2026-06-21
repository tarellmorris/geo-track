import json
import math
from datetime import timezone

from django.http import JsonResponse
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_http_methods

from . import queries


def parse_body(request):
    try:
        body = json.loads(request.body or "{}")
        return body if isinstance(body, dict) else None
    except json.JSONDecodeError:
        return None


def parse_timestamp(value):
    if value is None:
        return None

    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


@require_http_methods(["GET", "POST"])
def trips_list(request):
    if request.method == "GET":
        return JsonResponse({"trips": queries.list_trips()})

    body = parse_body(request)
    if body is None:
        return JsonResponse({"detail": "Request body must be valid JSON."}, status=400)

    name = str(body.get("name", "")).strip()
    if not name:
        return JsonResponse({"detail": "Trip name is required."}, status=400)
    if len(name) > 120:
        return JsonResponse(
            {"detail": "Trip name must be 120 characters or fewer."},
            status=400,
        )

    started_at = parse_timestamp(body.get("startedAt"))
    if body.get("startedAt") is not None and started_at is None:
        return JsonResponse({"detail": "startedAt must be an ISO timestamp."}, status=400)

    trip = queries.create_trip(name, started_at)
    if trip is None:
        active_trip = next(
            (trip for trip in queries.list_trips() if trip["status"] == "active"),
            None,
        )
        return JsonResponse(
            {
                "detail": "An active trip already exists.",
                "activeTrip": active_trip,
            },
            status=409,
        )

    return JsonResponse({"trip": trip}, status=201)


@require_http_methods(["GET", "PATCH"])
def trip_detail(request, trip_id):
    if request.method == "PATCH":
        body = parse_body(request)
        if body is None:
            return JsonResponse({"detail": "Request body must be valid JSON."}, status=400)
        if body.get("status") != "completed":
            return JsonResponse(
                {"detail": "Only status='completed' is supported."},
                status=400,
            )

        ended_at = parse_timestamp(body.get("endedAt"))
        if body.get("endedAt") is not None and ended_at is None:
            return JsonResponse({"detail": "endedAt must be an ISO timestamp."}, status=400)

        trip = queries.complete_trip(trip_id, ended_at)
        if trip is None:
            return JsonResponse({"detail": "Trip not found."}, status=404)
        return JsonResponse({"trip": trip})

    trip = queries.get_trip(trip_id)
    if trip is None:
        return JsonResponse({"detail": "Trip not found."}, status=404)

    return JsonResponse({"trip": trip})


@require_http_methods(["GET", "POST"])
def trip_locations(request, trip_id):
    if request.method == "GET":
        return JsonResponse({"locations": queries.list_locations(trip_id)})

    body = parse_body(request)
    if body is None:
        return JsonResponse({"detail": "Request body must be valid JSON."}, status=400)

    try:
        latitude = float(body["latitude"])
        longitude = float(body["longitude"])
        accuracy_m = (
            float(body["accuracyM"]) if body.get("accuracyM") is not None else None
        )
    except (KeyError, TypeError, ValueError):
        return JsonResponse(
            {"detail": "latitude and longitude must be numbers."},
            status=400,
        )

    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return JsonResponse(
            {"detail": "Coordinates are outside valid latitude/longitude ranges."},
            status=400,
        )
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return JsonResponse({"detail": "Coordinates must be finite numbers."}, status=400)
    if accuracy_m is not None and accuracy_m < 0:
        return JsonResponse({"detail": "accuracyM cannot be negative."}, status=400)
    if accuracy_m is not None and not math.isfinite(accuracy_m):
        return JsonResponse({"detail": "accuracyM must be a finite number."}, status=400)

    recorded_at = parse_timestamp(body.get("recordedAt"))
    if body.get("recordedAt") is not None and recorded_at is None:
        return JsonResponse({"detail": "recordedAt must be an ISO timestamp."}, status=400)

    location = queries.add_location(
        trip_id,
        longitude,
        latitude,
        recorded_at,
        accuracy_m,
    )
    if location is None:
        trip = queries.get_trip(trip_id)
        if trip is None:
            return JsonResponse({"detail": "Trip not found."}, status=404)
        return JsonResponse(
            {"detail": "Locations can only be added to an active trip."},
            status=409,
        )

    return JsonResponse({"location": location}, status=201)


def trip_route(_request, trip_id):
    if queries.get_trip(trip_id) is None:
        return JsonResponse({"detail": "Trip not found."}, status=404)

    route = queries.get_route(trip_id)
    return JsonResponse(
        {
            "type": "Feature",
            "geometry": route,
            "properties": {"tripId": str(trip_id)},
        }
    )


def trip_metrics(_request, trip_id):
    return JsonResponse({"metrics": queries.get_distance_metrics(trip_id)})


def trip_elevation_profile(_request, trip_id):
    return JsonResponse({"points": queries.get_elevation_profile(trip_id)})


def trip_elevation_summary(_request, trip_id):
    return JsonResponse({"summary": queries.get_elevation_summary(trip_id)})
