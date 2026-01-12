# Mathison Makefile
# Single source of truth for common development tasks

.PHONY: help test build clean install

help: ## Show this help message
	@echo "Mathison Development Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

test: ## Run consolidated test suite (CI and local use this)
	@./scripts/test.sh

build: ## Build all packages
	@pnpm -r build

install: ## Install dependencies
	@pnpm install --frozen-lockfile

clean: ## Clean build artifacts
	@pnpm -r clean || true
	@rm -rf node_modules packages/*/node_modules packages/*/dist
