#!/bin/bash
# Get current permalink for Quadratic OI

echo "📍 Quadratic OI Permalinks"
echo ""

# Local file
if [ -f "quadratic.html" ]; then
  LOCAL_PATH=$(pwd)/quadratic.html
  echo "🗂️  Local File:"
  echo "   file://$LOCAL_PATH"
  echo ""
fi

# Git remote
if git remote -v &> /dev/null; then
  REMOTE_URL=$(git remote get-url origin 2>/dev/null)
  if [[ $REMOTE_URL == *"github.com"* ]]; then
    # Extract username/repo from git URL
    REPO_PATH=$(echo $REMOTE_URL | sed 's/.*github.com[:/]\(.*\)\.git/\1/' | sed 's/.*github.com[:/]\(.*\)/\1/')
    
    echo "🌐 GitHub Pages (after enabling):"
    echo "   https://$(echo $REPO_PATH | cut -d'/' -f1).github.io/$(echo $REPO_PATH | cut -d'/' -f2)/quadratic.html"
    echo ""
  fi
fi

# Local server options
echo "💻 Local Server:"
echo "   1. Run: ./bootstrap-oi.sh"
echo "   2. Access: http://localhost:8080/quadratic.html"
echo ""

# Bridge permalink
echo "🌉 Bridge Server:"
echo "   Local: http://localhost:3142"
echo "   Production: https://bridge.example.com (deploy to cloud)"
echo ""

echo "📋 Quick Start:"
echo "   ./bootstrap-oi.sh"
