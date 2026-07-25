.PHONY: up down logs db dev cli typecheck

# Full stack (postgres + API) in docker.
up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f api

# Just postgres, for running the API on your host.
db:
	docker compose up -d postgres

# API on host against the docker postgres. Run `make db` first.
dev:
	DOTENV_CONFIG_PATH=.env.local npm run api

# CLI on host, e.g. `make cli ARGS="publish --payload 'lot is full' --price 0.50"`
cli:
	DOTENV_CONFIG_PATH=.env.local npm run cli -- $(ARGS)

typecheck:
	npm run typecheck
