# Quadratic OI — Quick Start for New Users

**Version:** 0.9.0 — Now with GitHub Models API (free tier LLM access!)

## One-Command Bootstrap

Copy and paste this command to get started immediately:

```bash
git clone https://github.com/default-user/mathison && cd mathison && ./bootstrap-oi.sh
```

## Or Manual Setup

### 1. Clone the Repository
```bash
git clone https://github.com/default-user/mathison
cd mathison
```

### 2. Start the OI Interface
```bash
./bootstrap-oi.sh
```

### 3. Open in Browser
```
http://localhost:8080/quadratic.html
```

### 4. Optional: Start Bridge (for SYSTEM/NETWORK/LLM capabilities)

In a new terminal:
```bash
cd mathison

# Optional: Set your GitHub token for free LLM access
export GITHUB_TOKEN="ghp_your_token_here"

# Start bridge (auth disabled for local testing)
BRIDGE_REQUIRE_AUTH=false npx tsx quadratic-bridge.mjs
```

Then connect to bridge at: `http://localhost:3142`

## What You Get

- **Quadratic OI Browser Runtime** — Interactive web interface for testing OI actions
- **Growth Ladder** — Progress from WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
- **Bridge Server** — System-side relay for privileged operations
- **Security Model** — CIF/CDI governance with receipt verification

## Quick Test

Once the browser is open at `http://localhost:8080/quadratic.html`:

1. **Try memory operations**: Click "Store Memory" button
2. **Try local LLM fallback**: Click "LLM Fallback" button (pattern-based)
3. **Connect to bridge**: Enter `http://localhost:3142` and click "Connect"
4. **Try real LLM** (if GitHub token set): Use the LLM complete button with bridge connected
5. **Try system actions**: Click "System: Date" button

## GitHub Models API (Free LLM)

Get free LLM access with your GitHub account:

1. **Get token**: Visit https://github.com/settings/tokens
2. **Set environment**: `export GITHUB_TOKEN="ghp_your_token"`
3. **Start bridge**: `BRIDGE_REQUIRE_AUTH=false npx tsx quadratic-bridge.mjs`
4. **Use LLM**: `llm.complete` action now uses GPT-4o-mini (15 req/min, 150 req/day)

**Provider chain**: GitHub Models → Anthropic (if API key set) → Local fallback

See `GITHUB_MODELS_SETUP.md` for full details.

## Documentation

- **Full Guide**: See `DEPLOYMENT.md` for all deployment options
- **Bridge Security**: See `BRIDGE.md` for production configuration
- **Architecture**: See `packages/mathison-quadratic/ARCHITECTURE.md`

---

**Need help?** All documentation is in the `mathison` directory after cloning.
