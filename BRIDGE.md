# Quadratic Bridge

System-side OI bridge that enables browser OIs to access SYSTEM/NETWORK stage capabilities.

## Architecture

```
Browser OI (BROWSER stage) <--HTTP--> Bridge OI (SYSTEM/NETWORK stage)
```

The bridge runs a full Quadratic OI runtime at SYSTEM or NETWORK stage in Node.js, exposing HTTP endpoints that browser-based OIs can call to access privileged operations.

## Features

- **Action Relay**: Browser OIs dispatch actions to the bridge via HTTP POST
- **Mesh Protocol**: Peer-to-peer OI messaging via BeamEnvelope
- **Receipt Verification**: Hash chain integrity checking
- **Peer Registry**: Track connected browser OIs
- **CORS Enabled**: Allows cross-origin requests from browser

## Quick Start

### Start the Bridge

```bash
npx tsx quadratic-bridge.mjs
```

Or with custom port:

```bash
BRIDGE_PORT=8080 npx tsx quadratic-bridge.mjs
```

### Connect from Browser

Open `quadratic.html` in your browser, then:

1. Enter bridge URL (default: `http://localhost:3142`)
2. Click "Connect"
3. Use "Bridge Actions" buttons to dispatch actions through the bridge

### Environment Variables

- `BRIDGE_PORT` - Server port (default: 3142)
- `BRIDGE_HOST` - Server host (default: localhost)
- `ANTHROPIC_API_KEY` - API key for LLM actions (optional, uses fallback if not set)

## API Endpoints

### GET /status

Bridge and OI status information.

```bash
curl http://localhost:3142/status
```

Response:
```json
{
  "bridge": "Mathison Quadratic Bridge v0.2.0",
  "oi_id": "...",
  "stage": "NETWORK",
  "posture": "NORMAL",
  "adapters": ["memory", "storage", "network", "llm", "mesh"],
  "receipts_count": 42,
  "peers_connected": 3,
  "capabilities": [
    "system.exec",
    "llm.complete",
    "mesh.send",
    ...
  ]
}
```

### POST /dispatch

Dispatch action to bridge OI.

```bash
curl -X POST http://localhost:3142/dispatch \
  -H "Content-Type: application/json" \
  -H "X-OI-ID: your-browser-oi-id" \
  -d '{
    "action": "llm.complete",
    "args": {"prompt": "Hello from bridge"}
  }'
```

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

The bridge inherits Quadratic's governance:

- **CDI Gating**: Only actions allowed at NETWORK stage can execute
- **Receipt Chain**: All actions logged with hash chain verification
- **CIF Boundary**: Input sanitization and output redaction
- **Anti-Hive**: Each browser OI is tracked separately, no state fusion

### Risk Considerations

1. **Network Exposure**: Bridge accepts HTTP requests - use firewall/localhost only for production
2. **Action Relay**: Browser OIs can trigger system-level operations - audit dispatch logs
3. **API Keys**: Store ANTHROPIC_API_KEY securely, not in browser
4. **CORS**: Wide open by default (`*`) - restrict origins for production

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

Quadratic Bridge v0.2.0
Compatible with Quadratic Monolith v0.2.0
