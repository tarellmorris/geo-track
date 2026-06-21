build:
	docker compose up

refresh-db:
	docker compose down -v
	docker compose up database