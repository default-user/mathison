.PHONY: help dev-up dev-down migrate server test lint typecheck clean

help:
	@echo "Mathison v2 Development Commands"
	@echo ""
	@echo "  make dev-up      - Start dev services (Postgres)"
	@echo "  make dev-down    - Stop dev services"
	@echo "  make migrate     - Run database migrations"
	@echo "  make server      - Start Mathison server"
	@echo "  make test        - Run all tests"
	@echo "  make lint        - Lint code"
	@echo "  make typecheck   - Type check TypeScript"
	@echo "  make clean       - Clean build artifacts"

dev-up:
	docker-compose up -d postgres
	@echo "Waiting for Postgres..."
	@sleep 3

dev-down:
	docker-compose down

migrate:
	pnpm --filter @mathison/server migrate

server:
	pnpm --filter @mathison/server start

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

clean:
	rm -rf node_modules packages/*/node_modules packages/*/dist
	rm -rf data
