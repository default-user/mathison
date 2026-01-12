#!/usr/bin/env bash
# CI Guard: Prevent legacy test discovery
# Fails CI if tests are found in forbidden locations

set -euo pipefail

echo "=== CI Test Guard ==="
echo "Checking for tests in forbidden locations..."
echo ""

# Define forbidden patterns (these should NOT contain test files)
FORBIDDEN_PATTERNS=(
  "*/legacy_test*/**/*.test.*"
  "*/old_pr*/**/*.test.*"
  "*/test-archive/**/*.test.*"
  "*/archived/**/*.test.*"
  "test/legacy/**/*.test.*"
  "test/old/**/*.test.*"
)

# Define allowed locations (tests should ONLY be here)
ALLOWED_PATTERNS=(
  "packages/*/src/__tests__/**/*.test.ts"
  "packages/*/__tests__/**/*.test.ts"
  "sdks/*/jest.config.js"
)

VIOLATIONS=0

# Check for forbidden test locations
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if compgen -G "$pattern" > /dev/null 2>&1; then
    echo "❌ VIOLATION: Found tests in forbidden location: $pattern"
    find . -path "./$pattern" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -5
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

# Verify tests are only in allowed locations
echo "Checking that all tests are in approved locations..."
ALL_TESTS=$(find . -name "*.test.ts" -o -name "*.spec.ts" | grep -v node_modules | grep -v .git || true)

if [ -n "$ALL_TESTS" ]; then
  while IFS= read -r test_file; do
    ALLOWED=false
    for allowed_pattern in "${ALLOWED_PATTERNS[@]}"; do
      # Convert glob to regex for matching
      if [[ "$test_file" =~ packages/.*/src/__tests__/.*\.test\.ts$ ]] || \
         [[ "$test_file" =~ packages/.*/__tests__/.*\.test\.ts$ ]] || \
         [[ "$test_file" =~ sdks/.*/.*\.test\.ts$ ]]; then
        ALLOWED=true
        break
      fi
    done

    if [ "$ALLOWED" = false ]; then
      echo "❌ VIOLATION: Test file in non-standard location: $test_file"
      echo "   Tests must be in: packages/*/src/__tests__/ or packages/*/__tests__/"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done <<< "$ALL_TESTS"
fi

if [ $VIOLATIONS -gt 0 ]; then
  echo ""
  echo "❌ CI Test Guard FAILED"
  echo "   Found $VIOLATIONS violation(s)"
  echo ""
  echo "Tests must ONLY exist in these locations:"
  echo "  - packages/*/src/__tests__/**/*.test.ts"
  echo "  - packages/*/__tests__/**/*.test.ts"
  echo ""
  echo "Legacy/archived tests are FORBIDDEN in CI."
  exit 1
fi

echo ""
echo "✅ CI Test Guard PASSED"
echo "   All tests are in approved locations"
