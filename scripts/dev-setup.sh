#!/bin/bash
# WHY: Dev environment setup script

set -e

echo "Setting up Mathison v2 development environment..."

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "Node.js required but not installed. Aborting." >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker required but not installed. Aborting." >&2; exit 1; }

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Start dev services
echo "Starting development services..."
docker-compose up -d postgres

# Wait for Postgres
echo "Waiting for Postgres..."
sleep 5

# Run migrations
echo "Running database migrations..."
pnpm --filter @mathison/server migrate

echo "✓ Development environment ready!"
echo ""
echo "Next steps:"
echo "  1. Start server: make server"
echo "  2. Run tests: make test"
echo "  3. View logs: docker-compose logs -f postgres"
