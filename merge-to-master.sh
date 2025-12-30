#!/bin/bash
# Merge claude/vision-distributed-ai-XzjFP to master
# Run this script if you have push access to master

set -e

echo "=== Mathison Merge Script ==="
echo ""
echo "Repository: $(git remote get-url origin)"
echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
echo ""

# Safety check
read -p "This will merge claude/vision-distributed-ai-XzjFP to master. Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Merge cancelled."
    exit 1
fi

# Fetch latest
echo "→ Fetching latest changes..."
git fetch origin master
git fetch origin claude/vision-distributed-ai-XzjFP

# Checkout master
echo "→ Checking out master..."
git checkout master

# Pull latest
echo "→ Pulling latest master..."
git pull origin master

# Show what will be merged
echo ""
echo "=== Commits to be merged ==="
git log --oneline origin/master..claude/vision-distributed-ai-XzjFP | head -20
echo ""

# Confirm again
read -p "Proceed with merge? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Merge cancelled."
    exit 1
fi

# Merge
echo "→ Merging claude/vision-distributed-ai-XzjFP..."
git merge claude/vision-distributed-ai-XzjFP --no-ff -m "Merge branch 'claude/vision-distributed-ai-XzjFP': ModelBus, Quadratic, Mobile, and Deployment Infrastructure

Complete implementation including:
- ModelBus kernel for distributed LLM inference
- Quadratic runtime with secure Bridge relay
- Mobile package for React Native
- Memory graph persistence (file + SQLite)
- GitHub Pages deployment infrastructure
- Comprehensive documentation

Phases: P4-C through P7-A
See PULL_REQUEST.md for full details."

# Show result
echo ""
echo "=== Merge complete ==="
git log --oneline -5
echo ""

# Push
read -p "Push to origin/master? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Merge completed locally but not pushed."
    echo "To push later: git push origin master"
    exit 0
fi

echo "→ Pushing to origin/master..."
git push origin master

echo ""
echo "✓ Merge complete and pushed to master!"
echo ""
echo "Verify with:"
echo "  git log --oneline -20"
echo "  git diff HEAD~20..HEAD --stat"
