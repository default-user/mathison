#!/bin/bash
set -e

# Build llama.cpp for macOS
# This script clones llama.cpp and builds llama-server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
LLAMA_DIR="${HOME}/Library/Application Support/Mathison/llama.cpp"
REPO_DIR="${LLAMA_DIR}/repo"

echo "[LLAMA] Building llama.cpp for macOS..."

# Ensure directories exist
mkdir -p "${LLAMA_DIR}"

# Clone llama.cpp if not exists
if [ ! -d "${REPO_DIR}" ]; then
  echo "[LLAMA] Cloning llama.cpp repository..."
  git clone https://github.com/ggerganov/llama.cpp.git "${REPO_DIR}"
else
  echo "[LLAMA] Repository already exists at ${REPO_DIR}"
fi

# Build llama-server
echo "[LLAMA] Building llama-server..."
cd "${REPO_DIR}"
make llama-server

# Copy binary to LLAMA_DIR
echo "[LLAMA] Installing llama-server..."
cp "${REPO_DIR}/llama-server" "${LLAMA_DIR}/llama-server"
chmod +x "${LLAMA_DIR}/llama-server"

echo "[LLAMA] llama-server built successfully at ${LLAMA_DIR}/llama-server"
