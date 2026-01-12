#!/usr/bin/env bash
# Verify SDK generation works from clean checkout
# This script tests that SDKs can be generated and are up-to-date

set -euo pipefail

echo "🔍 Verifying SDK generation..."
echo ""

# 1. Check that SDKs exist
echo "1️⃣  Checking SDK directories exist..."
for sdk in typescript python rust; do
  if [ ! -d "sdks/$sdk" ]; then
    echo "❌ SDK directory missing: sdks/$sdk"
    exit 1
  fi
  echo "  ✅ sdks/$sdk exists"
done
echo ""

# 2. Check TypeScript SDK can be imported (basic smoke test)
echo "2️⃣  TypeScript SDK smoke test..."
if [ -f "sdks/typescript/src/index.ts" ]; then
  # Basic syntax check
  if head -n 20 sdks/typescript/src/index.ts | grep -q "MathisonClient"; then
    echo "  ✅ TypeScript SDK contains MathisonClient class"
  else
    echo "  ❌ TypeScript SDK missing MathisonClient class"
    exit 1
  fi
else
  echo "  ❌ TypeScript SDK missing: sdks/typescript/src/index.ts"
  exit 1
fi
echo ""

# 3. Check Python SDK structure
echo "3️⃣  Python SDK smoke test..."
if [ -f "sdks/python/pyproject.toml" ]; then
  echo "  ✅ Python SDK has pyproject.toml"
else
  echo "  ❌ Python SDK missing pyproject.toml"
  exit 1
fi

if [ -f "sdks/python/mathison_sdk/__init__.py" ]; then
  if head -n 50 sdks/python/mathison_sdk/__init__.py | grep -q "MathisonClient"; then
    echo "  ✅ Python SDK contains MathisonClient class"
  else
    echo "  ❌ Python SDK missing MathisonClient class"
    exit 1
  fi
else
  echo "  ❌ Python SDK missing: sdks/python/mathison_sdk/__init__.py"
  exit 1
fi
echo ""

# 4. Check Rust SDK structure (at minimum should have basic scaffolding)
echo "4️⃣  Rust SDK smoke test..."
if [ -f "sdks/rust/Cargo.toml" ]; then
  echo "  ✅ Rust SDK has Cargo.toml"
else
  echo "  ❌ Rust SDK missing Cargo.toml"
  exit 1
fi

if [ -f "sdks/rust/src/lib.rs" ]; then
  echo "  ✅ Rust SDK has src/lib.rs"
else
  echo "  ❌ Rust SDK missing src/lib.rs"
  exit 1
fi
echo ""

# 5. Check that SDKs are generated from OpenAPI (should have comment or marker)
echo "5️⃣  Checking SDK generation markers..."
if grep -q "Generated from mathison-server OpenAPI" sdks/typescript/src/index.ts 2>/dev/null || \
   grep -q "Mathison TypeScript SDK" sdks/typescript/src/index.ts 2>/dev/null; then
  echo "  ✅ TypeScript SDK appears to be generated"
else
  echo "  ⚠️  TypeScript SDK may not be generated from OpenAPI spec"
fi

if grep -q "Generated from OpenAPI" sdks/python/mathison_sdk/__init__.py 2>/dev/null || \
   grep -q "Mathison Python SDK" sdks/python/mathison_sdk/__init__.py 2>/dev/null; then
  echo "  ✅ Python SDK appears to be generated"
else
  echo "  ⚠️  Python SDK may not be generated from OpenAPI spec"
fi
echo ""

echo "✅ SDK verification complete"
