# @mathison/governance

Authority model and CIF/CDI enforcement for Mathison v2.

## Purpose

WHY: Explicit authority prevents privilege escalation and ensures all actions are traceable to principals.

Responsibilities:
- Load and validate authority configuration
- Enforce CIF (Context Integrity Firewall) input validation
- Enforce CDI (Conscience Decision Interface) decision gating
- Track capability tokens

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```typescript
import { loadAuthorityConfig, getCurrentPrincipal, checkCDI, validateCIF } from '@mathison/governance';

// Load config at boot
const config = loadAuthorityConfig('./config/authority.json');

// Get current principal
const principal = getCurrentPrincipal();

// Check CDI before action
const decision = await checkCDI('create_thread', { namespace_id: 'ns-1' });

// Validate CIF input
const validated = validateCIF(userInput, schema);
```

## How to Run

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## WHY

**Why explicit authority config?**
Forces conscious configuration, prevents accidental privilege escalation, fails closed if config is missing.

**Why CIF/CDI separation?**
CIF handles syntax (schema validation), CDI handles semantics (policy decisions). Clear separation of concerns.

**Why fail closed?**
Security by default. Missing config or invalid policy causes startup failure, not runtime vulnerabilities.

## See Also

- [Architecture](../../docs/ARCHITECTURE.md)
- [OI Definition](../../docs/OI_DEFINITION.md)
