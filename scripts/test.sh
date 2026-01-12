#!/usr/bin/env bash
# Consolidated test suite for Mathison
# This is the SINGLE SOURCE OF TRUTH for running tests in CI and locally
# DO NOT add additional test commands/discovery mechanisms

set -euo pipefail

# Set test environment
export NODE_ENV=test
export MATHISON_ENV=test
export MATHISON_REQUIRE_SQLITE=1

echo "=== Mathison Consolidated Test Suite ==="
echo "Running tests from approved package locations only..."
echo ""

# Run tests via pnpm workspace - this uses each package's jest config
# which is properly scoped to their __tests__ directories only
pnpm -r test

echo ""
echo "✅ All tests passed"
