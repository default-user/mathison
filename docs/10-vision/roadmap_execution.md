# Roadmap Execution Status

## Who This Is For

- **Core maintainers** tracking implementation progress against the Mathison roadmap
- **Contributors** wanting to understand current priorities and what's next
- **Auditors** verifying that claimed features are actually implemented and tested
- **Project stakeholders** monitoring delivery status and blockers
- **Developers** joining the project and needing to understand the execution state

## Why This Exists

This document exists because:

1. **Roadmap transparency** — Anyone can see what's done, what's in progress, and what's pending
2. **Definition of Done enforcement** — Each phase has concrete deliverables and tests, not vague claims
3. **Blocker visibility** — Blockers surface immediately, not hidden in commit messages
4. **READY_FOR_HUMAN tracking** — Items requiring manual intervention (credentials, external systems) are explicitly flagged
5. **Accountability** — Claims of completion are backed by key files and tests, making them falsifiable
6. **Context for contributors** — New contributors can quickly identify where help is needed

This is a living document updated as phases complete. It serves as the single source of truth for roadmap execution status.

## Guarantees / Invariants

**Structural invariants:**

1. **No phase marked as complete without tests** — "Done" requires tests passing, not just code written
2. **Definition of Done is falsifiable** — Each phase specifies concrete files, tests, and commands to verify completion
3. **Blockers are explicit** — If a phase is stuck, the blocker is stated clearly (not "in progress" indefinitely)
4. **READY_FOR_HUMAN items are tracked** — Manual steps (credentials, migrations) are listed, not hidden
5. **Execution order is visible** — Phases progress sequentially unless explicitly noted as parallel

**Operational invariants:**

- Status values: `PENDING` | `IN_PROGRESS` | `BLOCKED` | `READY_FOR_HUMAN` | `DONE`
- "Definition of Done" column is mandatory for every phase
- "Tests Added" column is mandatory before marking `DONE`
- "Current Focus" section points to exactly one `IN_PROGRESS` phase (or is empty)
- "Blockers" section is updated in real-time as issues surface

## Non-Goals

**What this document explicitly does NOT do:**

- **Detailed task breakdown** — This is phase-level; individual commits/PRs are tracked elsewhere
- **Time estimates** — No dates or deadlines; this is status, not schedule
- **Blame tracking** — This shows progress, not who did what
- **Feature requests** — New features go in roadmap planning, not execution tracking
- **Design rationale** — Why decisions were made lives in architecture docs, not here
- **User-facing changelog** — See RELEASE-NOTES for that; this is internal execution state

---

## Overview
This document tracks the execution of the Mathison roadmap from manifest 4 to roadmap completion.

## Execution Table

| Phase | Status | Definition of Done | Key Files | Tests Added | Notes |
|-------|--------|-------------------|-----------|-------------|-------|
| 0.1 Repo hygiene | IN_PROGRESS | package-lock.json removed, .gitignore updated | .gitignore | - | Starting |
| 0.2 Tooling truthfulness | PENDING | Genome scripts runnable from root | package.json, genome scripts | - | - |
| 0.3 Genome conformance | PENDING | Real proof tests (valid/tampered/invalid) | genome tests | Conformance tests | - |
| 0.4 JSON contract | PENDING | JSON-only enforced, fail-closed | server pipeline | Contract tests | - |
| 0.5 StorageAdapter | PENDING | First-class abstraction + conformance tests | storage package, server, jobs | FILE/SQLITE equiv tests | - |
| 1 Memory API | PENDING | Full read/write governed endpoints | server memory routes | Receipt + governance tests | - |
| 2 OI Interpretation | PENDING | POST /oi/interpret with governance | oi package, server | Deny + receipt tests | - |
| 3 Job API parity | PENDING | Complete job endpoints + streaming | server job routes | Resume + idempotency tests | - |
| 4 OpenAPI + SDK | PENDING | OpenAPI spec + TS/PY/RUST sdks | sdk-generator | Snapshot tests | - |
| 5 gRPC | PENDING | gRPC server + governance parity | proto/, server grpc | Stream + deny tests | - |
| 6 Mesh discovery | PENDING | Discovery with consent gates | mesh package | Deterministic discovery tests | - |
| 7 Mesh E2EE | PENDING | End-to-end encryption | mesh crypto | Roundtrip + tamper tests | - |
| 8.1 Mobile app | PENDING | RN skeleton with adapters | mobile app | Adapter + storage tests | - |
| 8.2 Play Store prep | PENDING | READY_FOR_HUMAN artifacts | docs/60-mobile/play_store.md | - | Requires credentials |
| Finalization | PENDING | Single commit with versions applied | All | All pass | - |

## Current Focus
Phase 0.1: Repo hygiene

## Blockers
None yet

## READY_FOR_HUMAN Items
- (Will be populated as encountered)

---

## How to Verify

**Execution table verification:**
```bash
# Check that claimed files exist for completed phases
# Example: If phase 1 is marked DONE
ls packages/server/src/routes/memory.ts  # Should exist
ls packages/server/__tests__/routes/memory.test.ts  # Tests should exist

# Run tests for completed phases
npm test -- memory.test.ts  # Should pass
```

**Status integrity checks:**
- No phase should be `DONE` without entries in "Tests Added" column
- "Current Focus" should point to exactly one `IN_PROGRESS` phase or be empty
- If "Blockers" lists items, at least one phase should be `BLOCKED`

**Definition of Done verification:**
Each phase's "Definition of Done" is a falsifiable claim. To verify:

1. Check that key files listed exist
2. Run tests listed in "Tests Added" column
3. Verify behavior matches the "Definition of Done" description

Example for "Phase 1 Memory API":
```bash
# Verify endpoints exist
curl http://localhost:3000/api/v1/memory/nodes  # Should return governed response

# Verify tests pass
npm test -- memory-routes.test.ts

# Verify governance enforcement
curl -X POST http://localhost:3000/api/v1/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{"boundary_violation": true}'
# Should receive DENY receipt
```

**Blocker verification:**
- If a phase is `BLOCKED`, the "Blockers" section should explain why
- If "Blockers" section says "None", no phase should have status `BLOCKED`

**READY_FOR_HUMAN verification:**
- Items listed should be concrete, actionable manual steps
- Examples: "Add Google OAuth credentials", "Submit to Play Store", "Configure production DNS"
- NOT vague like "Fix remaining issues"

## Implementation Pointers

**How to update this document:**

1. **When starting a phase:**
   - Update "Status" from `PENDING` to `IN_PROGRESS`
   - Update "Current Focus" to point to this phase
   - If multiple phases can run in parallel, note that in the "Notes" column

2. **When completing a phase:**
   - Update "Status" from `IN_PROGRESS` to `DONE`
   - Fill in "Key Files" with absolute paths to created/modified files
   - Fill in "Tests Added" with test file names and test types
   - Verify Definition of Done is met (run tests, check files)
   - Update "Current Focus" to the next phase or empty if no next phase

3. **When blocked:**
   - Update "Status" to `BLOCKED`
   - Add entry to "Blockers" section with clear explanation
   - Add suggested resolution or next steps

4. **When encountering READY_FOR_HUMAN items:**
   - Update "Status" to `READY_FOR_HUMAN`
   - Add entry to "READY_FOR_HUMAN Items" section with:
     - What manual action is required
     - Why automation isn't possible
     - Who can perform the action (role, not name)
     - Rough effort estimate

**Execution table columns explained:**

- **Phase:** Short identifier from roadmap (e.g., "0.1 Repo hygiene", "1 Memory API")
- **Status:** One of: `PENDING` | `IN_PROGRESS` | `BLOCKED` | `READY_FOR_HUMAN` | `DONE`
- **Definition of Done:** Concrete, falsifiable completion criteria (tests pass, files exist, behavior verified)
- **Key Files:** Absolute or repo-relative paths to created/modified files
- **Tests Added:** Test files and types (e.g., "memory.test.ts: receipt + governance tests")
- **Notes:** Blockers, dependencies, parallel work, or other context

**Phase dependencies:**

Some phases must complete sequentially:
- 0.1 → 0.2 → 0.3 → 0.4 → 0.5 (foundational cleanup and contracts)
- 0.5 → 1 (storage abstraction before memory API)
- 1 → 2 (memory must work before OI interpretation uses it)
- 4 → SDKs depend on OpenAPI spec being complete
- 6 → 7 (mesh discovery before mesh encryption)
- 8.1 → 8.2 (mobile app before Play Store submission)

Other phases can run in parallel:
- Phase 4 (OpenAPI) and Phase 5 (gRPC) are independent
- Phase 6-7 (mesh) and Phase 3 (Job API) are independent

**Testing requirements per phase:**

| Phase | Required Test Types | Example Test Files |
|-------|-------------------|-------------------|
| 0.3 Genome | Conformance (valid/tampered/invalid) | `genome.test.ts` |
| 0.4 JSON contract | Contract enforcement | `json-contract.test.ts` |
| 0.5 Storage | Adapter equivalence (FILE/SQLITE) | `storage-adapter.test.ts` |
| 1 Memory API | Receipt + governance denial | `memory-routes.test.ts` |
| 2 OI Interpretation | Deny + receipt verification | `oi-routes.test.ts` |
| 3 Job API | Resume + idempotency | `job-routes.test.ts` |
| 4 OpenAPI | Snapshot tests for spec stability | `openapi-spec.test.ts` |
| 5 gRPC | Stream + governance denial | `grpc-server.test.ts` |
| 6 Mesh discovery | Deterministic discovery | `mesh-discovery.test.ts` |
| 7 Mesh E2EE | Roundtrip + tamper detection | `mesh-crypto.test.ts` |
| 8.1 Mobile | Adapter + storage conformance | `mobile-storage.test.ts` |

**Common patterns:**

- **Governance tests:** Every API endpoint should have a test that triggers `DENY` (boundary violation, consent failure, etc.)
- **Receipt tests:** Every governed action should return a receipt with provenance
- **Conformance tests:** Adapters (storage, models) should have equivalence tests ensuring behavior matches regardless of implementation
- **Snapshot tests:** Stable interfaces (OpenAPI spec, gRPC proto) should use snapshot testing to catch unintended changes

**Tools and commands:**

```bash
# Run specific phase tests
npm test -- <test-file-name>

# Run all tests
npm test

# Verify file existence for a phase
ls <key-file-path>

# Check test coverage for a phase
npm run test:coverage -- <test-file-name>

# Update execution table
# Edit this file directly; no automation (yet)
```

**When to mark DONE vs READY_FOR_HUMAN:**

- `DONE`: All code written, all tests passing, fully automated verification possible
- `READY_FOR_HUMAN`: Implementation complete but requires manual step (credentials, external service, UI testing, etc.)

**Finalization phase:**

The final phase ("Finalization") requires:
- All prior phases marked `DONE` or `READY_FOR_HUMAN` (with documented manual steps)
- Version numbers applied across all packages (consistent v1.0.0, v2.0.0, etc.)
- All tests passing in CI
- Documentation updated to reflect completion
- Single atomic commit capturing the finalized state

**Documentation dependencies:**

- This file (`ROADMAP_EXECUTION.md`) tracks execution state
- `docs/ROADMAP.md` (if exists) defines the phases and rationale
- `RELEASE-NOTES.md` (if exists) captures user-facing changes
- `docs/20-architecture/repo-architecture.md` explains system design
- `docs/31-governance/tiriti.md` defines governance rules enforced by phases

**Contributing to roadmap execution:**

1. Check "Current Focus" to see what's in progress
2. Check "Blockers" to see if you can help unblock
3. Check `PENDING` phases to see what's next
4. Pick a phase, update status to `IN_PROGRESS`, and start work
5. Follow Definition of Done; write tests first
6. Update this document as you progress
7. Mark `DONE` only when tests pass and verification succeeds
