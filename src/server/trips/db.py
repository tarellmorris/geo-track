import re

from django.conf import settings
from django.db import connection


_QUALIFIED_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")


def dict_fetch_all(cursor):
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def quote_qualified_name(name):
    if not _QUALIFIED_NAME_RE.match(name):
        raise ValueError(f"Invalid database identifier: {name}")

    return ".".join(connection.ops.quote_name(part) for part in name.split("."))


def elevation_table_name():
    return quote_qualified_name(settings.DEM_TABLE)
