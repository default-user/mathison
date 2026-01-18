# Deployment Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Operators deploying Mathison to various environments
- DevOps engineers setting up CI/CD pipelines
- Developers testing deployment configurations

## Why This Exists

This guide covers multiple deployment methods from local development to cloud production, with security considerations for each environment.

## Guarantees / Invariants

1. All deployment methods support the governance pipeline
2. Environment variables control deployment configuration
3. Server fails-closed on missing required configuration
4. Bridge authentication is configurable per environment

## Non-Goals

- This guide does NOT cover Kubernetes-specific deployment (separate guide)
- This guide does NOT configure external databases (see storage docs)
- This guide does NOT set up monitoring infrastructure

---

## Quick Access Permalinks

### Local File Access

**Direct file path** (after building):
```
file:///home/user/mathison/quadratic.html
```

**Local development server:**
```bash
# Option 1: Python (if installed)
python3 -m http.server 8080

# Option 2: Node.js http-server
npx http-server -p 8080

# Option 3: Node.js serve
npx serve -p 8080

# Then access at:
# http://localhost:8080/quadratic.html
```

### GitHub Pages Deployment

**1. Enable GitHub Pages:**
```bash
# Push to your GitHub repository
git push origin master

# Then in GitHub web UI:
# Settings → Pages → Source: Deploy from branch
# Branch: select master → /root → Save
```

**2. Your permalink will be:**
```
https://[username].github.io/mathison/quadratic.html
```

### Cloudflare Pages / Vercel / Netlify

**Deploy command:**
```bash
# Build step (if needed)
npx esbuild packages/mathison-quadratic/quad.ts \
  --bundle --format=esm --platform=browser \
  --external:crypto --external:fs/promises --external:path \
  --outfile=quad.js

# Deploy entire repo, they'll serve static files
```

### Docker Deployment

**Dockerfile for Bridge:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY quadratic-bridge.mjs .
COPY packages/mathison-quadratic ./packages/mathison-quadratic

RUN npm install -g tsx

EXPOSE 3142

CMD ["tsx", "quadratic-bridge.mjs"]
```

**Run:**
```bash
docker build -t quadratic-bridge .

docker run -d \
  -p 3142:3142 \
  -e BRIDGE_API_KEY=$(openssl rand -hex 32) \
  -e BRIDGE_ALLOWED_ORIGINS="*" \
  --name quadratic-bridge \
  quadratic-bridge
```

### Bridge Server Deployment

For the bridge server, deploy to a cloud VM:

```bash
# On your server
git clone https://github.com/[username]/mathison.git
cd mathison

# Install dependencies
npm install -g tsx

# Generate API key
export BRIDGE_API_KEY=$(openssl rand -hex 32)
echo "Bridge API Key: $BRIDGE_API_KEY" > ~/.bridge-key

# Start with PM2
npm install -g pm2
pm2 start quadratic-bridge.mjs \
  --name quadratic-bridge \
  --env BRIDGE_API_KEY=$BRIDGE_API_KEY \
  --env BRIDGE_ALLOWED_ORIGINS="https://[username].github.io"

# Save PM2 config
pm2 save
pm2 startup
```

## LLM Environment Variables

```bash
# GitHub Models API (free tier)
export GITHUB_TOKEN="ghp_your_token_here"

# Anthropic API (fallback)
export ANTHROPIC_API_KEY="sk-ant-your_key_here"

# Fallback chain: GitHub Models → Anthropic → Local
```

## Security Note

When sharing permalinks publicly:
- Use HTTPS only (not HTTP or file://)
- Implement bridge authentication
- Restrict CORS origins
- Monitor bridge audit logs
- Consider rate limiting at CDN level

---

## How to Verify

```bash
# Verify local deployment
curl http://localhost:8080/quadratic.html | head -20

# Verify bridge is running
curl http://localhost:3142/status

# Verify health endpoint
curl http://localhost:3000/health | jq
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Bridge server | `quadratic-bridge.mjs` |
| Browser UI | `quadratic.html` |
| Server entry | `packages/mathison-server/src/index.ts` |
| Docker example | See this document |
