# Midas — single entry point for all CI/CD operations.
# POSIX sh: runs on GitHub-hosted runners, the self-hosted runner container, and the owner's Mac.

SHELL := /bin/sh
TAG ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

.PHONY: ci backend-ci functionapp-ci frontend-ci images deploy stack-up stack-down clean

# Quality gate: lint + test (+ type-check/build where applicable) for all three workspaces.
ci: backend-ci functionapp-ci frontend-ci

backend-ci:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest

functionapp-ci:
	cd functionapp && cargo fmt --check && cargo clippy --all-targets && cargo test

frontend-ci:
	cd frontend && npm ci && npm run build

# Build the three images, tagged with the git SHA (or `dev` outside a checkout).
images:
	MIDAS_TAG=$(TAG) docker compose build

# Ship the current tag as the `midas` stack via the Portainer API.
deploy:
	MIDAS_TAG=$(TAG) node scripts/portainer-deploy.mjs

# Local convenience (requires Docker on the machine running it).
stack-up:
	MIDAS_TAG=$(TAG) docker compose up -d

stack-down:
	docker compose down

clean:
	docker compose down --remove-orphans
	-docker image rm $$(docker images -q --filter reference='midas-*')
