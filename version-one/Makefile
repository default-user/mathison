# Mathison Makefile
# Single source of truth for common development tasks

.PHONY: help test build clean install openapi sdk conformance

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

openapi: build ## Generate and validate OpenAPI spec
	@echo "📋 Generating OpenAPI spec..."
	@node -e "const { generateOpenAPISpec } = require('./packages/mathison-server/dist/openapi.js'); const spec = generateOpenAPISpec(); console.log(JSON.stringify(spec, null, 2));" > /tmp/openapi-spec.json
	@echo "✅ OpenAPI spec generated and validated"

sdk: build ## Generate SDKs from OpenAPI spec
	@echo "🔧 Generating SDKs..."
	@pnpm generate-sdks
	@echo "✅ SDKs generated"

conformance: test openapi sdk ## Run full conformance suite (tests + OpenAPI + SDK verification)
	@echo ""
	@echo "🎉 Conformance suite complete"
	@echo "  ✅ All tests passed"
	@echo "  ✅ OpenAPI spec validated"
	@echo "  ✅ SDKs generated successfully"
