# Quadratic Bridge (Secure)

System-side OI bridge that enables browser OIs to access SYSTEM/NETWORK stage capabilities with enterprise-grade security.

## Architecture

```
Browser OI (BROWSER stage) <--HTTPS/Auth--> Bridge OI (SYSTEM/NETWORK stage)
```

The bridge runs a full Quadratic OI runtime at SYSTEM or NETWORK stage in Node.js, exposing HTTP endpoints that browser-based OIs can call to access privileged operations.

## Security Features

- **API Key Authentication**: Optional or required authentication via X-API-Key header
- **CORS Origin Allowlist**: Configurable origin whitelist (no more wildcards by default)
- **Action Allowlist**: Only explicitly permitted actions can be relayed
- **Rate Limiting**: 100 req/min per client by default (configurable)
- **Audit Logging**: All actions logged with timestamps for forensic analysis
- **Input Sanitization**: Automatic depth/size limits on all inputs
- **Risk-Based Gating**: System actions disabled by default, require explicit enable
- **Constant-Time Auth**: SHA-256 hash comparison prevents timing attacks

## Features

- **Action Relay**: Browser OIs dispatch actions to the bridge via HTTP POST
- **Mesh Protocol**: Peer-to-peer OI messaging via BeamEnvelope
- **Receipt Verification**: Hash chain integrity checking
- **Peer Registry**: Track connected browser OIs
- **Audit Trail**: GET /audit endpoint for security monitoring

## Quick Start

### Generate API Key

```bash
# Generate secure random API key
export BRIDGE_API_KEY=$(openssl rand -hex 32)
echo "Save this key: $BRIDGE_API_KEY"
```

### Start the Bridge (Secure Mode)

```bash
# With authentication (recommended)
BRIDGE_API_KEY=$(openssl rand -hex 32) npx tsx quadratic-bridge.mjs
```

### Start the Bridge (Development Mode)

```bash
# Without authentication (localhost only!)
BRIDGE_REQUIRE_AUTH=false npx tsx quadratic-bridge.mjs
```

### Advanced Configuration

```bash
# Full configuration example
BRIDGE_PORT=8080 \
BRIDGE_HOST=localhost \
BRIDGE_API_KEY=your-secret-key \
BRIDGE_ALLOWED_ORIGINS="http://localhost:*,https://app.example.com" \
BRIDGE_RATE_LIMIT=200 \
BRIDGE_ALLOW_SYSTEM=true \
ANTHROPIC_API_KEY=sk-... \
npx tsx quadratic-bridge.mjs
```

### Connect from Browser

Open `quadratic.html` in your browser, then:

1. Enter bridge URL (default: `http://localhost:3142`)
2. Click "Connect"
3. Use "Bridge Actions" buttons to dispatch actions through the bridge

### Environment Variables

**Server Configuration:**
- `BRIDGE_PORT` - Server port (default: 3142)
- `BRIDGE_HOST` - Server host (default: localhost)

**Security:**
- `BRIDGE_API_KEY` - Required for authentication (generate with `openssl rand -hex 32`)
- `BRIDGE_REQUIRE_AUTH` - Set to `false` to disable auth (default: true)
- `BRIDGE_ALLOWED_ORIGINS` - Comma-separated CORS origins (default: localhost, 127.0.0.1, file://)
- `BRIDGE_RATE_LIMIT` - Max requests per minute per client (default: 100)
- `BRIDGE_ALLOW_SYSTEM` - Set to `true` to enable system.exec/read/write (default: false)

**LLM Integration:**
- `ANTHROPIC_API_KEY` - API key for LLM actions (optional, uses fallback if not set)

## API Endpoints

### GET /status (Public)

Bridge and OI status information. No authentication required.

```bash
curl http://localhost:3142/status
```

Response:
```json
{
  "bridge": "Mathison Quadratic Bridge v0.3.0 (Secure)",
  "oi_id": "...",
  "stage": "NETWORK",
  "posture": "HIGH",
  "adapters": ["memory", "storage", "network", "llm", "mesh"],
  "receipts_count": 42,
  "peers_connected": 3,
  "security": {
    "auth_required": true,
    "rate_limit": "100/min",
    "system_actions": false
  },
  "capabilities": [
    { "action": "llm.complete", "risk": "LOW" },
    { "action": "http.get", "risk": "LOW" },
    { "action": "mesh.send", "risk": "MEDIUM" }
  ]
}
```

### POST /dispatch (Auth Required)

Dispatch action to bridge OI.

**Headers:**
- `X-API-Key` - Bridge API key (required if auth enabled)
- `X-OI-ID` - Calling OI identifier (optional, for logging)

```bash
curl -X POST http://localhost:3142/dispatch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-bridge-api-key" \
  -H "X-OI-ID: your-browser-oi-id" \
  -d '{
    "action": "llm.complete",
    "args": {"prompt": "Hello from bridge"}
  }'
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid API key
- `403 Forbidden` - Action not in allowlist
- `429 Too Many Requests` - Rate limit exceeded

Response:
```json
{
  "success": true,
  "data": {
    "text": "Hello! I'm responding via the bridge.",
    "model": "claude-3-haiku-20240307",
    "tokens": 15
  },
  "receipt_id": "..."
}
```

### GET /receipts

Get recent receipts from bridge OI.

```bash
curl http://localhost:3142/receipts?count=10
```

### POST /mesh/send

Send a BeamEnvelope to a peer OI.

```bash
curl -X POST http://localhost:3142/mesh/send \
  -H "Content-Type: application/json" \
  -d '{
    "from_oi": "browser-oi-123",
    "to_oi": "peer-oi-456",
    "message_type": "request",
    "payload": {"query": "status"},
    "taint_labels": []
  }'
```

### GET /mesh/receive

Receive beams for an OI.

```bash
curl http://localhost:3142/mesh/receive?oi_id=browser-oi-123
```

### POST /peer/register

Register a peer OI with the bridge.

```bash
curl -X POST http://localhost:3142/peer/register \
  -H "Content-Type: application/json" \
  -d '{
    "oi_id": "browser-oi-123",
    "address": "http://localhost:8080",
    "stage": "BROWSER"
  }'
```

### GET /peers

List all registered peers.

```bash
curl http://localhost:3142/peers
```

### GET /verify

Verify bridge OI receipt hash chain integrity.

```bash
curl http://localhost:3142/verify
```

Response:
```json
{
  "valid": true,
  "receipts_verified": 150,
  "errors": []
}
```

## Security Model

The bridge implements defense-in-depth security:

### Authentication

- **API Key Required**: All endpoints except /status require valid X-API-Key header
- **Constant-Time Comparison**: SHA-256 hash comparison prevents timing attacks
- **Configurable**: Can disable auth for localhost development (not recommended for production)

### Authorization

- **Action Allowlist**: Only explicitly whitelisted actions can be relayed
- **Risk Classification**: LOW/MEDIUM/HIGH/CRITICAL risk levels
- **System Actions Disabled**: system.exec/read/write require BRIDGE_ALLOW_SYSTEM=true

### Rate Limiting

- **Per-Client Limits**: 100 req/min per X-OI-ID or IP address
- **Configurable**: Set BRIDGE_RATE_LIMIT environment variable
- **Headers**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

### Input Validation

- **Depth Limits**: Max 3 levels of object nesting
- **Size Limits**: Max 10KB strings, 100 array items, 100 object keys
- **Sanitization**: All inputs sanitized before dispatch

### CORS Policy

- **Origin Allowlist**: Default allows localhost/127.0.0.1/file:// only
- **Wildcard Patterns**: Support for http://localhost:* patterns
- **Configurable**: Set BRIDGE_ALLOWED_ORIGINS environment variable

### Audit Logging

- **All Actions Logged**: Timestamp, client ID, action, result
- **Structured Logs**: JSON format for easy parsing
- **Queryable**: GET /audit endpoint (auth required)
- **Retention**: Last 1000 events in memory

### Quadratic Governance

The bridge inherits Quadratic's built-in governance:
- **CDI Gating**: Only actions allowed at NETWORK stage can execute
- **Receipt Chain**: All actions logged with hash chain verification
- **CIF Boundary**: Input sanitization and output redaction
- **Anti-Hive**: Each browser OI is tracked separately, no state fusion
- **Posture**: Bridge runs at HIGH posture for stricter enforcement

## Production Deployment

### Recommended Configuration

```bash
# 1. Generate strong API key
export BRIDGE_API_KEY=$(openssl rand -hex 32)

# 2. Restrict origins to your domain
export BRIDGE_ALLOWED_ORIGINS="https://app.example.com"

# 3. Bind to localhost only (use reverse proxy for external access)
export BRIDGE_HOST=localhost

# 4. Keep system actions disabled
# (don't set BRIDGE_ALLOW_SYSTEM)

# 5. Set LLM API key if needed
export ANTHROPIC_API_KEY=sk-...

# 6. Start bridge
npx tsx quadratic-bridge.mjs
```

### Reverse Proxy (HTTPS)

Use nginx or similar for TLS termination:

```nginx
server {
  listen 443 ssl;
  server_name bridge.example.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:3142;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### Firewall Rules

```bash
# Allow only specific IP ranges
iptables -A INPUT -p tcp --dport 3142 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 3142 -j DROP
```

### Monitoring

```bash
# Watch audit log
curl -H "X-API-Key: $BRIDGE_API_KEY" \
  http://localhost:3142/audit?count=100 | jq '.audit[] | select(.event=="AUTH_FAILED")'

# Check rate limits
watch -n 1 'curl -s http://localhost:3142/status | jq .security'
```

## Example Use Cases

### Browser OI with System Access

```javascript
// In browser
const result = await fetch('http://localhost:3142/dispatch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-OI-ID': oi.state.oi_id,
  },
  body: JSON.stringify({
    action: 'system.exec',
    args: { command: 'date' },
  }),
});
```

### LLM via Bridge (with server-side API key)

```javascript
// Browser doesn't need API key
const result = await fetch('http://localhost:3142/dispatch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'llm.complete',
    args: {
      prompt: 'Summarize this document',
      model: 'claude-3-haiku-20240307',
    },
  }),
});
```

### Mesh Messaging Between OIs

```javascript
// Browser OI 1 sends beam
await fetch('http://localhost:3142/mesh/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from_oi: 'browser-a',
    to_oi: 'browser-b',
    message_type: 'request',
    payload: { task: 'coordinate' },
    taint_labels: [],
  }),
});

// Browser OI 2 receives beams
const beams = await fetch('http://localhost:3142/mesh/receive?oi_id=browser-b');
```

## Development

### Running Tests

```bash
# Start bridge
npx tsx quadratic-bridge.mjs

# In another terminal, test endpoints
curl http://localhost:3142/status
curl -X POST http://localhost:3142/dispatch \
  -H "Content-Type: application/json" \
  -d '{"action": "llm.complete", "args": {"prompt": "test"}}'
```

### Logging

Bridge logs all dispatched actions:

```
[DISPATCH] Client OI: browser-oi-123
[DISPATCH] Action: llm.complete
[DISPATCH] Args: {"prompt":"Hello"}
[DISPATCH] Result: SUCCESS
```

Monitor with:

```bash
npx tsx quadratic-bridge.mjs 2>&1 | tee bridge.log
```

## Files

- `quadratic-bridge.mjs` - Bridge server implementation
- `quadratic.html` - Browser UI with bridge connection
- `quad.js` - Compiled Quadratic runtime
- `packages/mathison-quadratic/quad.ts` - Source runtime

## Version

**Quadratic Bridge v0.3.0 (Secure)**
- Added API key authentication
- Added CORS origin allowlist
- Added action allowlist with risk levels
- Added rate limiting (100 req/min)
- Added audit logging with timestamps
- Added input sanitization
- System actions disabled by default
- Posture upgraded to HIGH

Compatible with Quadratic Monolith v0.2.0
