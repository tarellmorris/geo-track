from django.urls import path

from . import views


urlpatterns = [
    path("trips/", views.trips_list, name="trips-list"),
    path("trips/<uuid:trip_id>/", views.trip_detail, name="trip-detail"),
    path("trips/<uuid:trip_id>/locations/", views.trip_locations, name="trip-locations"),
    path("trips/<uuid:trip_id>/route/", views.trip_route, name="trip-route"),
    path("trips/<uuid:trip_id>/metrics/", views.trip_metrics, name="trip-metrics"),
    path(
        "trips/<uuid:trip_id>/elevation-profile/",
        views.trip_elevation_profile,
        name="trip-elevation-profile",
    ),
    path(
        "trips/<uuid:trip_id>/elevation-summary/",
        views.trip_elevation_summary,
        name="trip-elevation-summary",
    ),
]
