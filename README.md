# Mathison v2.2

Mathison v2.2 is a complete implementation of the Organized Intelligence (OI) system with enforced governance, fail-closed behavior, strict namespace isolation, and **governed Model Bus for AI API access**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HTTP/gRPC/CLI/Worker                              │
│                              Entrypoints                                    │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Unified Governed Pipeline                           │
│  ┌─────────┐  ┌─────────────┐  ┌─────────┐  ┌────────────┐  ┌──────────┐  │
│  │ Context │→│ CIF Ingress │→│ CDI     │→│ Handler    │→│ CDI      │→│ CIF    │ │
│  │ Normal. │  │ Validation  │  │ Action  │  │ Execution  │  │ Output   │  │ Egress │ │
│  └─────────┘  └─────────────┘  └─────────┘  └────────────┘  └──────────┘  │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼─────────────────────────┐
          │                        │                         │
          ▼                        ▼                         ▼
┌─────────────────┐   ┌─────────────────┐   ┌───────────────────────────┐
│   Governance    │   │     Memory      │   │       Model Bus           │
│    Provider     │   │     Store       │   │  (v2.2 - governed only)   │
│  (Capsule/CDI)  │   │  (PG/SQLite)    │   │  OpenAI │ Anthropic │ ... │
└─────────────────┘   └─────────────────┘   └───────────────────────────┘
```

## Key Invariants (v2.2)

1. **Unified Pipeline**: Every request flows through the same governed pipeline
2. **Fail-Closed**: Missing/invalid/stale governance = deny
3. **No Hive Mind**: Strict per-OI namespace boundaries
4. **Adapter Enforcement**: All model/tool calls require capability tokens
5. **No-Bypass (v2.2)**: All vendor AI calls MUST go through `@mathison/model-bus`

## Directory Structure

```
/
├── packages/                    # v2.2 Runtime packages
│   ├── mathison-pipeline/      # Unified governed request pipeline
│   ├── mathison-governance/    # CIF/CDI, capsule management
│   ├── mathison-memory/        # MemoryStore interface + backends
│   ├── mathison-adapters/      # Adapter conformance + gateway
│   ├── mathison-model-bus/     # v2.2: Governed model invocation (OpenAI, Anthropic)
│   └── mathison-server/        # HTTP server with ai.chat endpoint
├── config/                     # Configuration files
│   ├── authority.json          # Authority configuration
│   ├── governance-capsule.json # Governance capsule
│   └── keys/                   # Crypto keys
├── docs/                       # Documentation
│   ├── specs/                  # v2.2 specifications
│   └── ARCHITECTURE.md         # System architecture
├── version-one/                # ARCHIVE ONLY (v2 snapshot)
└── .github/workflows/          # CI configuration
```

## Important: /version-one is Archive Only

The `/version-one` directory contains an archive snapshot of the v2.0 codebase. **No runtime imports from /version-one are allowed.** This directory exists for reference only.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose (for PostgreSQL)

### Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd mathison

# Install dependencies
pnpm install

# Start PostgreSQL
docker-compose up -d

# Run tests
pnpm test

# Start the server
pnpm --filter @mathison/server start
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=3000
HOST=0.0.0.0

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mathison
POSTGRES_USER=mathison
POSTGRES_PASSWORD=your_password

# Governance
AUTHORITY_CONFIG_PATH=./config/authority.json
GOVERNANCE_CAPSULE_PATH=./config/governance-capsule.json

# Model Bus (v2.2) - API keys for AI providers
OPENAI_API_KEY=sk-...         # Required for OpenAI models (gpt-4, etc.)
ANTHROPIC_API_KEY=sk-ant-...  # Required for Anthropic models (claude-3, etc.)
```

## Core Concepts

### Governed Request Pipeline

Every action in Mathison v2.1 flows through a single governed pipeline:

1. **Context Normalization**: Extract principal_id, oi_id, intent, capabilities
2. **CIF Ingress**: Validate schema, size limits, taint rules
3. **CDI Action Check**: Verify permissions, issue capability tokens
4. **Handler Execution**: Execute the business logic (if allowed)
5. **CDI Output Check**: Validate response, apply redactions
6. **CIF Egress**: Package response with audit metadata

### Fail-Closed Behavior

If governance material is missing, invalid, or stale:

- **Missing capsule**: Deny all except read-only (if explicitly permitted)
- **Invalid capsule**: Deny all
- **Expired capsule**: Deny all
- **Stale capsule** (past TTL): Deny high-risk, allow low-risk with warning

### Namespace Isolation

All memory operations are namespaced:

- `oi_id` in context must match `namespace_id` in queries
- Cross-namespace access without explicit envelope = denied
- All queries require governance tags (principal_id, oi_id, purpose)

### Adapter Gateway

Model and tool adapters are accessed through a capability-gated gateway:

- No direct adapter calls allowed
- Every invocation requires a valid capability token
- Tokens are issued by CDI during action check
- Token expiry and capability type are enforced

## Packages

### @mathison/pipeline

The core pipeline module implementing `ExecuteRequest`:

```typescript
import { createPipeline, HandlerRegistry, buildContext } from '@mathison/pipeline';

const registry = new HandlerRegistry();
registry.register({
  id: 'my_handler',
  intent: 'my.action',
  risk_class: 'low_risk',
  handler: async (ctx, payload, caps) => ({ success: true }),
});

const pipeline = createPipeline(governanceProvider, registry);
const response = await pipeline.execute({ context, payload });
```

### @mathison/governance

Governance capsule management and CIF/CDI enforcement:

```typescript
import { createGovernanceProvider, createCapsuleLoader } from '@mathison/governance';

const provider = createGovernanceProvider();
await provider.initialize(authorityPath, capsulePath);

const status = provider.getCapsuleStatus();
if (!status.valid) {
  // Fail-closed: deny operations
}
```

### @mathison/memory

MemoryStore interface with PostgreSQL and SQLite backends:

```typescript
import { createMemoryStore, GovernanceTags } from '@mathison/memory';

const store = createMemoryStore({ type: 'postgres', config: { ... } });
await store.initialize();

const tags: GovernanceTags = {
  principal_id: 'user-123',
  oi_id: 'my-namespace',
  purpose: 'thread.create',
  origin_labels: [],
};

const thread = await store.createThread({ namespace_id: 'my-namespace', scope: 'work', priority: 50 }, tags);
```

### @mathison/adapters

Adapter conformance contract and gateway:

```typescript
import { createGateway, AdapterGateway } from '@mathison/adapters';

const gateway = createGateway({
  allowed_model_families: ['openai'],
  allowed_tool_categories: ['file'],
});

gateway.registerModelAdapter(myModelAdapter);

const result = await gateway.invokeModel({
  model_id: 'gpt-4',
  messages: [...],
  capability_token: token, // From CDI
});
```

## Testing

Run all tests:

```bash
pnpm test
```

Run invariant tests specifically:

```bash
pnpm --filter @mathison/pipeline test -- --testPathPattern=pipeline-enforcement
pnpm --filter @mathison/governance test -- --testPathPattern=fail-closed
pnpm --filter @mathison/memory test -- --testPathPattern=no-hive-mind
pnpm --filter @mathison/adapters test -- --testPathPattern=adapter-bypass
```

## License

MIT
