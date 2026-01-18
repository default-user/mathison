# Mathison v2.1 Development Commands

.PHONY: dev-up dev-down migrate server test lint typecheck clean install

# Development environment
dev-up:
	docker-compose up -d postgres

dev-down:
	docker-compose down

# Database
migrate:
	pnpm --filter @mathison/server migrate

# Server
server:
	pnpm --filter @mathison/server start

# Quality
test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

# Dependencies
install:
	pnpm install

# Cleanup
clean:
	rm -rf node_modules packages/*/node_modules packages/*/dist

# Full development setup
setup: install dev-up migrate
	@echo "Development environment ready"

# Run all checks (CI simulation)
ci: typecheck lint test
	@echo "All CI checks passed"
