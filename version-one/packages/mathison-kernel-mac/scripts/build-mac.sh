#!/bin/bash
set -e

# Build Mathison Kernel for macOS
# Produces a standalone executable using pkg or a shell wrapper

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

echo "[BUILD] Building Mathison Kernel for macOS..."

# Install dependencies
echo "[BUILD] Installing dependencies..."
cd "${PACKAGE_DIR}"
pnpm install

# Build TypeScript
echo "[BUILD] Compiling TypeScript..."
pnpm run build

# Make CLI executable
chmod +x "${PACKAGE_DIR}/dist/cli.js"

# Create standalone executable with pkg (if available)
if command -v pkg &> /dev/null; then
  echo "[BUILD] Creating standalone executable with pkg..."
  pnpm run pkg:build
  echo "[BUILD] Standalone executable created: ${PACKAGE_DIR}/mathison"
else
  echo "[BUILD] pkg not found, creating shell wrapper instead..."

  # Create a shell wrapper
  cat > "${PACKAGE_DIR}/mathison" <<'EOF'
#!/bin/bash
# Mathison Kernel wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/dist/cli.js" "$@"
EOF

  chmod +x "${PACKAGE_DIR}/mathison"
  echo "[BUILD] Shell wrapper created: ${PACKAGE_DIR}/mathison"
fi

echo "[BUILD] Build complete!"
echo ""
echo "Next steps:"
echo "  1. Install llama.cpp: ./scripts/build-llama.sh"
echo "  2. Initialize Mathison: ./mathison init"
echo "  3. Download model: ./mathison model install"
echo "  4. Start chat: ./mathison chat"
