# Quadratic OI — Deployment & Permalinks

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
git push origin claude/vision-distributed-ai-XzjFP

# Then in GitHub web UI:
# Settings → Pages → Source: Deploy from branch
# Branch: select your branch → /root → Save
```

**2. Your permalink will be:**
```
https://[username].github.io/mathison/quadratic.html
```

**3. Share with parameters (optional):**
```
https://[username].github.io/mathison/quadratic.html?stage=NETWORK&bridge=http://bridge.example.com:3142
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

**Permalink:**
- Cloudflare Pages: `https://mathison.pages.dev/quadratic.html`
- Vercel: `https://mathison.vercel.app/quadratic.html`
- Netlify: `https://mathison.netlify.app/quadratic.html`

## Bookmarklet for Instant Bootstrap

Copy this JavaScript bookmarklet to instantly load Quadratic OI on any page:

```javascript
javascript:(function(){
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'https://[username].github.io/mathison/quad.js';
  script.onload = () => {
    const mount = document.createElement('div');
    mount.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;';
    document.body.appendChild(mount);
    window.quadOI = window.bootBrowser({ mount });
  };
  document.head.appendChild(script);
})();
```

Save as browser bookmark with the above code as URL.

## Single-File Portable Version

For maximum portability, create a single HTML file with everything embedded:

```bash
# Generate single-file version
node scripts/bundle-portable.js
```

This creates `quadratic-portable.html` with:
- Quad.js inlined as base64
- No external dependencies
- Works offline via `file://` protocol
- Can be emailed or shared directly

**Permalink:**
```
file:///path/to/quadratic-portable.html
```

## Bridge Permalink

For the bridge server, deploy to a cloud VM and use:

```
https://bridge.example.com
```

**Quick Deploy (DigitalOcean/AWS/GCP):**
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

# Setup nginx reverse proxy for HTTPS
# (see BRIDGE.md for nginx config)
```

**Permalink:**
```
https://bridge.example.com:3142
```

## QR Code for Mobile Access

Generate QR code for mobile devices:

```bash
# Install qrcode generator
npm install -g qrcode

# Generate QR for quadratic.html
qrcode "https://[username].github.io/mathison/quadratic.html" -o quadratic-qr.png

# Generate QR for bridge
qrcode "https://bridge.example.com:3142" -o bridge-qr.png
```

Scan with phone to instantly access OI runtime on mobile browser.

## Docker Deployment

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

# Permalink
http://localhost:3142
```

## Environment-Specific Permalinks

### Development
```
http://localhost:8080/quadratic.html
```

### Staging
```
https://staging.mathison.dev/quadratic.html
```

### Production
```
https://app.mathison.io/quadratic.html
```

## Share Links with Pre-Configuration

Add URL parameters for pre-configured instances:

**Examples:**
```
# Pre-connected to bridge
https://[username].github.io/mathison/quadratic.html?bridge=https://bridge.example.com&api_key=...

# Specific stage
https://[username].github.io/mathison/quadratic.html?stage=NETWORK

# Pre-loaded memory
https://[username].github.io/mathison/quadratic.html?memory=base64encodedstate
```

## Recommended Permalink Structure

**For public sharing:**
```
https://mathison.app/oi
```

**For development:**
```
http://localhost:8080/quadratic.html
```

**For enterprise:**
```
https://oi.yourcompany.com
```

**For bridge:**
```
https://bridge.yourcompany.com
```

## Next Steps

1. Choose deployment method (GitHub Pages recommended for quick start)
2. Deploy quadratic.html and quad.js
3. Optionally deploy bridge server
4. Share permalink with users
5. Users can bookmark or save as app on mobile

## Security Note

When sharing permalinks publicly:
- Use HTTPS only (not HTTP or file://)
- Implement bridge authentication
- Restrict CORS origins
- Monitor bridge audit logs
- Consider rate limiting at CDN level
