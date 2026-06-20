FROM postgis/postgis:14-3.5

RUN apt-get update \
	&& apt-get install -y --no-install-recommends postgis \
	&& rm -rf /var/lib/apt/lists/*
