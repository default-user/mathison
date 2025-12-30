# Quadratic OI — Quick Start for New Users

## One-Command Bootstrap

Copy and paste this command to get started immediately:

```bash
git clone http://127.0.0.1:40075/git/default-user/mathison && cd mathison && ./bootstrap-oi.sh
```

## Or Manual Setup

### 1. Clone the Repository
```bash
git clone http://127.0.0.1:40075/git/default-user/mathison
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

### 4. Optional: Start Bridge (for SYSTEM/NETWORK capabilities)

In a new terminal:
```bash
cd mathison
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

1. Try memory operations: Click "Store Memory" button
2. Try LLM fallback: Click "LLM Fallback" button
3. Connect to bridge: Enter `http://localhost:3142` and click "Connect"
4. Try bridge actions: Click "System: Date" button

## Documentation

- **Full Guide**: See `DEPLOYMENT.md` for all deployment options
- **Bridge Security**: See `BRIDGE.md` for production configuration
- **Architecture**: See `packages/mathison-quadratic/ARCHITECTURE.md`

---

**Need help?** All documentation is in the `mathison` directory after cloning.
