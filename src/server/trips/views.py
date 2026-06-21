from django.http import JsonResponse

from . import queries


def trips_list(_request):
    return JsonResponse({"trips": queries.list_trips()})


def trip_detail(_request, trip_id):
    trip = queries.get_trip(trip_id)
    if trip is None:
        return JsonResponse({"detail": "Trip not found."}, status=404)

    return JsonResponse({"trip": trip})


def trip_locations(_request, trip_id):
    return JsonResponse({"locations": queries.list_locations(trip_id)})


def trip_route(_request, trip_id):
    route = queries.get_route(trip_id)
    if route is None:
        return JsonResponse({"detail": "Trip route not found."}, status=404)

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
