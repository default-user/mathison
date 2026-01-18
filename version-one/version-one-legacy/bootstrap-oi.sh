#!/bin/bash
# Bootstrap Quadratic OI - Quick Local Server

echo "🧠 Starting Quadratic OI Bootstrap Server..."
echo ""

# Check if in mathison directory
if [ ! -f "quadratic.html" ]; then
  echo "Error: quadratic.html not found. Please run from mathison root directory."
  exit 1
fi

# Check for quad.js
if [ ! -f "quad.js" ]; then
  echo "Building quad.js..."
  npx esbuild packages/mathison-quadratic/quad.ts \
    --bundle --format=esm --platform=browser \
    --external:crypto --external:fs/promises --external:path \
    --outfile=quad.js
fi

# Choose server
PORT=8080

if command -v python3 &> /dev/null; then
  echo "Using Python HTTP server on port $PORT"
  echo ""
  echo "✓ Quadratic OI Available at:"
  echo "  http://localhost:$PORT/quadratic.html"
  echo ""
  echo "Press Ctrl+C to stop"
  python3 -m http.server $PORT
elif command -v node &> /dev/null; then
  echo "Using Node.js HTTP server on port $PORT"
  echo ""
  echo "✓ Quadratic OI Available at:"
  echo "  http://localhost:$PORT/quadratic.html"
  echo ""
  echo "Press Ctrl+C to stop"
  npx http-server -p $PORT
else
  echo "Error: No HTTP server found (need python3 or node)"
  exit 1
fi
