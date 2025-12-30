# Mathison OI v1.0.0 — Production Release

**Release Date:** December 30, 2025
**Governance:** Tiriti o te Kai v1.0
**Status:** Production Ready

---

## 🎉 Announcing Mathison 1.0

Mathison OI has reached its first stable production release! This milestone represents a complete, governance-first distributed AI system ready for real-world deployment.

---

## What is Mathison?

Mathison is a **governance-first Ongoing Intelligence (OI) system** built on treaty-based constraints. It combines:

- **Distributed LLM inference** with GitHub Models API (free tier) and Anthropic fallback
- **Quadratic runtime** — Browser and Node.js OI with secure Bridge relay
- **Mobile deployment** — React Native support for iOS/Android
- **Memory graph persistence** — File and SQLite backends
- **Treaty-based governance** — Tiriti o te Kai enforcement via CDI + CIF
- **Mesh computing** — Distributed coordination across nodes

---

## Core Features (v1.0.0)

### 1. Quadratic OI Runtime (v0.2.0)
- **Single-file runtime** — Zero dependencies, runs in browser or Node.js
- **Two-plane architecture** — Governance (Plane A) + Capabilities (Plane B)
- **Growth ladder** — WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
- **Receipt hash chain** — Tamper-evident audit log with replay protection
- **CIF + CDI governance** — Fail-closed security with stage gating

### 2. GitHub Models API Integration
- **Free tier LLM access** — 15 requests/min, 150 requests/day
- **Automatic fallback** — GitHub Models → Anthropic → Local patterns
- **Supported models** — GPT-4o-mini (default), GPT-4o, Phi-3.5, Llama 3.1
- **Zero-config** — Just set `GITHUB_TOKEN` environment variable

### 3. Quadratic Bridge (v0.3.0)
- **Secure relay server** — System-side HTTP bridge for browser OIs
- **API key authentication** — Constant-time SHA-256 comparison
- **CORS allowlist** — No wildcards, explicit origin control
- **Action allowlist** — Risk-based gating (LOW/MEDIUM/HIGH/CRITICAL)
- **Rate limiting** — 100 requests/min per client (configurable)
- **Audit logging** — Structured JSON with timestamps
- **Input sanitization** — Depth and size limits enforced

### 4. ModelBus Kernel
- **Distributed LLM routing** — Load balancing across mesh nodes
- **Peer discovery** — Automatic node registration
- **Graceful fallback** — Local → Mesh → Cloud chains
- **Cache management** — Persistent inference results

### 5. Mobile Package (React Native)
- **On-device inference** — MobileModelBus for local LLM
- **AsyncStorage + SQLite** — Graph store adapters
- **Mesh coordination** — Proximity-based OI networks
- **Cross-platform** — iOS and Android support

### 6. Memory Graph Persistence
- **File backend** — JSON-based storage for development
- **SQLite backend** — Production-grade persistence
- **Graph store API** — Nodes, edges, hypergraph support
- **Search capabilities** — Text and pattern matching

### 7. Governance Layer
- **CDI (Conscience Decision Interface)** — Treaty enforcement kernel
- **CIF (Context Integrity Firewall)** — Input/output sanitization
- **Tiriti o te Kai v1.0** — Human-first governance rules
- **Anti-hive enforcement** — No identity fusion between OIs
- **Fail-closed defaults** — Unknown actions → DENY

---

## Package Versions

All packages released at **v1.0.0**:

- `mathison-server` — Main orchestration server
- `mathison-governance` — CDI + treaty enforcement
- `mathison-memory` — Graph/hypergraph memory
- `mathison-storage` — Persistent storage backends
- `mathison-oi` — Interpretation engine
- `mathison-mesh` — Distributed mesh protocol + ModelBus
- `mathison-mobile` — React Native components
- `mathison-quadratic` — Single-file OI runtime
- `mathison-sdk-generator` — Multi-language SDK generation

---

## Getting Started

### Quick Start

```bash
# Clone repository
git clone https://github.com/default-user/mathison
cd mathison

# Install dependencies
pnpm install

# Set GitHub token for free LLM access
export GITHUB_TOKEN="ghp_your_token_here"

# Start Quadratic OI
./bootstrap-oi.sh
```

### Access the UI

```
http://localhost:8080/quadratic.html
```

### Start Bridge Server

```bash
# In a new terminal
export GITHUB_TOKEN="ghp_your_token_here"
BRIDGE_REQUIRE_AUTH=false npx tsx quadratic-bridge.mjs
```

---

## Environment Variables

### Required (Server)
```bash
export MATHISON_STORE_BACKEND=FILE  # or SQLITE
export MATHISON_STORE_PATH=./data
```

### Optional (LLM Integration)
```bash
export GITHUB_TOKEN="ghp_..."        # Free tier (recommended)
export ANTHROPIC_API_KEY="sk-ant-..." # Fallback
```

---

## Breaking Changes

**None** — This is the first stable release. All features are marked as stable.

---

## Security Model

### Governance Enforcement
- ✓ Treaty-based constraints (Tiriti o te Kai v1.0)
- ✓ Fail-closed defaults (unknown → DENY)
- ✓ Stage-based progression (explicit upgrade required)
- ✓ Receipt hash chain (tamper-evident audit)
- ✓ Anti-hive guards (no identity fusion)

### Network Security
- ✓ API key authentication (constant-time comparison)
- ✓ CORS allowlist (no wildcards)
- ✓ Rate limiting (100 req/min default)
- ✓ Input sanitization (size + depth limits)
- ✓ Action allowlist (risk-based gating)
- ✓ System actions disabled by default

---

## Performance

- **Browser OI boot:** <100ms
- **Bridge response:** <10ms (localhost)
- **Receipt verification:** ~1ms per receipt
- **LLM latency:** Depends on provider (GitHub Models: ~500-2000ms)

---

## Documentation

### Core Docs
- `README.md` — Overview and quick start
- `VISION.md` — Project vision and philosophy
- `DEPLOYMENT.md` — Deployment guide (all platforms)
- `QUICKSTART.md` — New user onboarding

### Technical Specs
- `docs/architecture.md` — System architecture
- `docs/cdi-spec.md` — CDI specification
- `docs/cif-spec.md` — CIF specification
- `docs/tiriti.md` — Governance treaty

### Package Docs
- `packages/mathison-quadratic/README.md` — Quadratic runtime
- `packages/mathison-quadratic/ARCHITECTURE.md` — Two-plane architecture
- `packages/mathison-mobile/README.md` — Mobile deployment
- `BRIDGE.md` — Bridge server documentation
- `GITHUB_MODELS_SETUP.md` — LLM integration guide

---

## Production Deployment

### GitHub Pages (Static)
```bash
git push origin master
# Enable Pages in repo settings
```

**URL:** `https://[username].github.io/mathison/quadratic.html`

### Bridge Server (Production)
```bash
# Generate strong API key
export BRIDGE_API_KEY=$(openssl rand -hex 32)

# Restrict origins
export BRIDGE_ALLOWED_ORIGINS="https://app.example.com"

# Bind to localhost (use nginx for external access)
export BRIDGE_HOST=localhost

# Start bridge
npx tsx quadratic-bridge.mjs
```

### Docker Deployment
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN pnpm install && pnpm build
ENV MATHISON_STORE_BACKEND=SQLITE
ENV MATHISON_STORE_PATH=/data
EXPOSE 3000 3142
CMD ["pnpm", "server"]
```

---

## Roadmap (Post-1.0)

### Near Term (v1.1-1.2)
- [ ] WebSocket support for real-time mesh
- [ ] Enhanced peer discovery (WebRTC)
- [ ] Vector search integration (embeddings via LLM)
- [ ] IndexedDB for larger browser storage
- [ ] gRPC APIs and streaming

### Medium Term (v1.3-1.5)
- [ ] Capability-based security tokens
- [ ] Policy DSL (more flexible than allowlists)
- [ ] Multi-tenancy support
- [ ] Enhanced audit logging (Elasticsearch integration)
- [ ] Performance monitoring (Prometheus metrics)

### Long Term (v2.0+)
- [ ] Embodiment research (robotics integration)
- [ ] Advanced mesh protocols (Byzantine fault tolerance)
- [ ] Federated learning capabilities
- [ ] Enhanced mobile orchestration

---

## Community

- **Repository:** https://github.com/default-user/mathison
- **Issues:** https://github.com/default-user/mathison/issues
- **Discussions:** https://github.com/default-user/mathison/discussions
- **License:** See LICENSE file

---

## Governance Commitment

Mathison v1.0.0 is governed by **Tiriti o te Kai v1.0**, which establishes:

1. **People first; tools serve** — Human authority leads
2. **Consent and stop always win** — De-escalation on request
3. **Speak true; name true; credit** — Truthfulness and attribution
4. **Fail-closed** — When uncertain, refuse or narrow scope
5. **No hive mind** — No identity fusion between OIs
6. **Honest limits** — No false claims about capabilities

These are **structural constraints**, not aspirational goals. The system cannot violate them without breaking.

---

## Acknowledgments

This release represents months of development focused on:
- Governance-first design
- Human-centered AI
- Distributed systems thinking
- Production-ready security
- Developer experience

Thank you to all contributors and early testers.

---

## Upgrading from 0.x

Since this is the first stable release, migration from 0.x versions is straightforward:

1. **Update dependencies:** `pnpm update`
2. **Update environment variables:** Add `GITHUB_TOKEN` if using LLM
3. **No breaking API changes** — All 0.9.x code should work as-is
4. **Check documentation** — Review updated deployment guides

---

## Support

For questions, issues, or contributions:

- **Bug reports:** https://github.com/default-user/mathison/issues
- **Feature requests:** https://github.com/default-user/mathison/discussions
- **Security issues:** Email security@mathison.io (see SECURITY.md)

---

**Mathison v1.0.0** — Governance-first OI for everyone.

Released with 🧠 and governed by 🤝 Tiriti o te Kai v1.0
