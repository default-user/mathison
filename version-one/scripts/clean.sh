#!/bin/bash
# WHY: Clean all build artifacts and data

set -e

echo "Cleaning Mathison v2..."

# Clean build artifacts
echo "Removing build artifacts..."
rm -rf packages/*/dist
rm -rf packages/*/node_modules
rm -rf node_modules
rm -rf pnpm-lock.yaml

# Clean data
echo "Removing data..."
rm -rf data

echo "✓ Clean complete"
