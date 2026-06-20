#!/bin/bash

set -Eeuo pipefail

export PGUSER="${POSTGRES_USER}"

DEM_DIR="${DEM_DIR:-/dem}"
DEM_TABLE="${DEM_TABLE:-public.elevation}"
DEM_TILE_SIZE="${DEM_TILE_SIZE:-100x100}"
DEM_SRID="${DEM_SRID:-4269}"

if ! command -v raster2pgsql >/dev/null 2>&1; then
	echo "raster2pgsql is required to load DEM GeoTIFF data" >&2
	exit 1
fi

shopt -s nullglob
dem_files=("${DEM_DIR}"/*.TIF "${DEM_DIR}"/*.tif "${DEM_DIR}"/*.TIFF "${DEM_DIR}"/*.tiff)
shopt -u nullglob

if [ "${#dem_files[@]}" -eq 0 ]; then
	echo "No DEM GeoTIFF files found in ${DEM_DIR}; skipping DEM raster load"
	exit 0
fi

echo "Ensuring PostGIS raster support is available in ${POSTGRES_DB}"
psql --set ON_ERROR_STOP=1 --dbname="${POSTGRES_DB}" <<-'EOSQL'
	CREATE EXTENSION IF NOT EXISTS postgis;
	CREATE EXTENSION IF NOT EXISTS postgis_raster;
EOSQL

echo "Loading ${#dem_files[@]} DEM GeoTIFF file(s) into ${DEM_TABLE}"
raster2pgsql \
	-d \
	-s "${DEM_SRID}" \
	-I \
	-C \
	-M \
	-F \
	-t "${DEM_TILE_SIZE}" \
	"${dem_files[@]}" \
	"${DEM_TABLE}" \
	| psql --set ON_ERROR_STOP=1 --dbname="${POSTGRES_DB}"

echo "Finished loading DEM GeoTIFF data into ${DEM_TABLE}"
