# @mathison/server

Mathison HTTP server with CIF/CDI middleware.

## Purpose

WHY: Centralized API layer with CIF/CDI middleware ensures all requests are validated and governed.

Responsibilities:
- Expose HTTP API
- Apply CIF ingress validation
- Apply CDI decision gates
- Structured logging with request_id

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```bash
# Start server
pnpm start

# Development mode
pnpm dev

# Run migrations
pnpm migrate
```

## API Endpoints

- `GET /health` - Health check
- `POST /threads` - Create thread
- `GET /threads` - List threads (requires namespace_id query param)
- `POST /threads/:id/commitments` - Add commitment
- `GET /threads/:id/commitments` - List commitments
- `POST /threads/:id/messages` - Store message as event
- `POST /threads/:id/reflect` - Trigger reflection job (stub)

## WHY

**Why CIF/CDI middleware on all endpoints?**
Centralized enforcement prevents bypass, makes governance auditable.

**Why request_id?**
Enables tracing across logs, errors, and events.

**Why structured logging?**
Machine-parseable logs enable analysis and alerting.

See [Architecture](../../docs/ARCHITECTURE.md)
