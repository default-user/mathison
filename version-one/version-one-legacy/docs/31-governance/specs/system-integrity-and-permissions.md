# docs/31-governance/specs/system-integrity-and-permissions.md
# Mathison System Integrity + Permission UX — Spec v0.3

## 0. Purpose
This spec standardises Mathison’s cross-cutting integrity controls and the user permission UX so the user and OI can safely “grow together”:

- Continuous **integrity enforcement** across all interfaces and all privileged operations.
- Continuous **anomaly detection** and automatic **containment**.
- Strong **isolation boundaries** between subsystems (no bypasses).
- Controlled **capability enablement** via a first-class “Toolbox” UX:
  - one-time
  - time-windowed
  - unlocked (persistent until revoked)

This spec MUST preserve invariants:
- Mandatory chain on every interface: **CIF ingress → Integrity pre/effect/post → CDI pre/post → handler → CIF egress**
- Fail-closed always.
- No ambient authority.
- No secrets committed.

> Terminology note: this spec uses engineering terms only. A mapping from prior bio metaphors is in Appendix A.

---

## 1. Architecture overview (components)
Mathison now includes these integrity components (all deterministic modules + stores + tests):

1) **CIF**: Input sanitisation/quarantine + output leakage control/redaction.
2) **CDI**: Policy decision point (allow/deny/transform) for actions + outputs.
3) **Integrity Monitor (IM)**: Canonical intent envelopes + detection + containment state machine + “hardening artifacts”.
4) **Isolation Manager (ISOL)**: Strict compartment boundaries (process/sandbox/module boundaries).
5) **Stability Controller (SC)**: Tracks system metrics and drives global operating constraints (“operating signals”).
6) **Operating Signals Bus (OSB)**: Graded signals that modulate behaviour across subsystems.
7) **Session Kill-Switch + Resource Reclaimer (SKR)**: Termination + revocation + cleanup.
8) **Calibration & Noise Budget (CNB)**: Controls false positives; prevents over-blocking pressure.
9) **Integration Governor (IG)**: Governed interop with external vendors/services (“integrations”).
10) **Maintenance Scheduler (MS)**: Periodic housekeeping (compaction, baselines, cleanup).

All interfaces (HTTP/gRPC/CLI/internal) MUST route through the same pipeline. No bypass path is permitted.

---

## 2. Mandatory execution pipeline
For every request, including permission grants:

1) **CIF ingress**
2) Build **IntentEnvelope** (canonical request/intent representation)
3) **IM_PRECHECK(envelope)** → may tighten operating constraints / deny / isolate session
4) **CDI_ACTION_CHECK(envelope)** → allow/deny/transform
5) Handler (may propose PermissionRequests)
6) Before any privileged operation (tool call / network / filesystem write / device action / memory write):
   - update envelope with effect details + requested capability
   - **IM_EFFECTCHECK(envelope)**
   - **CDI_ACTION_CHECK(envelope)** (effect-level)
7) Produce output
8) **CDI_OUTPUT_CHECK(output_envelope)**
9) **CIF egress**
10) **IM_POSTCHECK(output_envelope)** (exfil/coercion/stealth detection)

Fail-closed at every step.

---

## 3. Canonical IntentEnvelope (required)
All integrity decisions are based on this structured representation (not raw prompt text).

### 3.1 IntentEnvelope fields (logical schema)
- `envelope_id` (ULID/UUID)
- `trace_id`
- `actor`:
  - `actor_type` ("user" | "oi" | "system" | "service")
  - `actor_id`
  - `session_id`
- `interface` ("http" | "grpc" | "cli" | "internal")
- `request`:
  - `kind` ("chat" | "tool_call" | "memory_write" | "config_write" | "governance_update" | "other")
  - `input_hash` (hash of post-CIF text, optional)
  - `intent_summary` (short, deterministic summary)
- `targets`:
  - `resources` (e.g., "filesystem", "network", "device", "memstore", "policy_store")
  - `data_classes_in` (e.g., "public", "private", "sensitive")
  - `data_classes_out`
- `execution`:
  - `background_requested` (bool)
  - `looping_requested` (bool)
  - `self_prompting_requested` (bool)
  - `estimated_steps` (int)
- `persistence`:
  - `writes_memory` (bool)
  - `writes_config` (bool)
  - `writes_policy` (bool)
  - `write_scope` ("none" | "ephemeral" | "session" | "durable")
- `capabilities`:
  - `requested` (array of capability descriptors)
  - `minted` (array of minted capability ids, optional)
- `signals`:
  - `secrecy_flag` (bool)
  - `bypass_flag` (bool)
  - `coercion_flag` (bool)
  - `exfil_flag` (bool)
- `baselines` (actor/session baseline metrics)
- `timestamps_ms` (received/evaluated)

### 3.2 Capability descriptor
- `cap_type` (e.g., "net.http", "fs.write", "device.actuate", "mem.write")
- `scope` (resource patterns)
- `ttl_ms`
- `reason` (short)

---

## 4. Isolation Manager (ISOL)
### 4.1 Required isolation domains
- **DOMAIN_CHAT**: language reasoning; no side effects.
- **DOMAIN_EXEC**: tool execution sandbox; capability-gated.
- **DOMAIN_STATE**: memory stores; schema’d writes only.
- **DOMAIN_POLICY**: treaty/genome/policy artifacts; sealed; signed updates only.
- **DOMAIN_AUDIT**: append-only event spine; cannot be disabled.

### 4.2 Boundary rules
- No direct reads/writes across domains.
- Cross-domain operations require:
  - IntentEnvelope
  - IM + CDI checks
  - capability tokens for privileged effects
- POLICY domain never accepts free-form runtime writes.

Acceptance test: direct tool invocation without envelope+checks must fail closed.

---

## 5. Integrity Monitor (IM)
IM provides detection + containment + “hardening artifacts”.

### 5.1 Detection targets (measurable behaviours)
IM flags patterns trending toward:
- capability escalation / scope expansion
- stealth/deception (hide logs, disable controls)
- bypass attempts (route around CIF/CDI/IM/ISOL)
- coercion/manipulation in permission flows
- data exfiltration attempts
- persistence abuse (durable writes outside schema/approval)

### 5.2 Detectors (3 families, conservative combine)
1) **Signature rules** (deterministic predicates over envelope + limited token scanning)
2) **Behavioural anomaly scoring** (sliding-window metrics vs baseline)
3) **Independent verifier** (separately configured checker on IntentEnvelope)

Combine rules:
- Any hard-block signature ⇒ deny or isolate session.
- Disagreement between primary path and verifier ⇒ deny by default.

### 5.3 IMDecision
- `decision` ("ALLOW" | "ALLOW_TIGHTEN" | "DENY" | "ISOLATE_SESSION")
- `score` (0–100)
- `severity` ("LOW" | "MED" | "HIGH" | "CRITICAL")
- `reason_codes` (stable identifiers)
- `required_actions` (e.g., "REVOKE_CAPS", "BLOCK_DURABLE_WRITES", "MINIMAL_OUTPUT")
- `state_transition` (optional)
- `receipt_min` (short user-safe)
- `receipt_full` (internal details, no secrets)

---

## 6. Containment state machine (session-level)
States:
- `NORMAL`
- `RESTRICTED`
- `ISOLATED`
- `RECOVERY`

Transitions (default):
- NORMAL→RESTRICTED when score exceeds threshold or medium signatures hit.
- RESTRICTED→ISOLATED on high/critical signatures or repeated medium hits.
- ISOLATED→RECOVERY only after rollback/rotation checks pass.
- RECOVERY→NORMAL only after re-entry checklist passes.

State effects:
- **RESTRICTED**: narrow capability scope/TTL; block durable writes; require additional checks for effects.
- **ISOLATED**: no external tools; no writes except audit; safe refusal-only outputs; forensic snapshot.
- **RECOVERY**: rotate capability minting keys/tokens; invalidate minted caps; restore last known-good policy capsule.

---

## 7. Stability Controller (SC) + Operating Signals Bus (OSB)
SC keeps system operation inside safe envelopes via global operating signals.

### 7.1 System metrics (“vitals”)
Sliding-window metrics per session + global:
- deny rate, isolate rate
- capability inflation (requested vs baseline)
- tool breadth (distinct cap_types)
- durable write rate
- verifier disagreement rate
- egress redaction rate
- handler error rate
- integration health score (per integration)

Each metric has green/yellow/red bands and remediation mappings.

### 7.2 Operating signals (0.0–1.0)
- `SIG_HIGH_RISK` (integrity concerns rising)
- `SIG_EXFIL_RISK` (egress redaction rising)
- `SIG_INSTABILITY` (errors/denies rising)
- `SIG_INTEGRATION_DEGRADED` (vendor/integration unstable)
- `SIG_DRIFT` (baseline deviation)

### 7.3 Signal effects
Subsystems MUST consult signals:
- capability minting: shorten TTL + narrow scope under high risk
- permission UX: disable “unlock” under high risk; reduce max window; enforce narrower scope
- memory writes: deny durable writes under red bands
- execution sandbox: tighten resource limits under high risk
- output policy: force minimal outputs under instability

Fail-closed if SC/OSB unavailable: default to tighter constraints.

---

## 8. Session Kill-Switch + Resource Reclaimer (SKR)
### 8.1 Session termination triggers
- critical bypass signatures
- coercion during permission flows
- repeated high-risk anomalies
- any attempt to disable audit / governance enforcement

### 8.2 Actions
- revoke all minted capabilities for the session
- terminate execution sandbox contexts
- block persistence writes
- snapshot forensic bundle (hashes + reason codes + last N envelopes)
- enter ISOLATED state

### 8.3 Cleanup tasks
Periodic resource reclamation:
- expire unused capabilities
- purge orphaned session state
- compact caches
- recompute baselines

All cleanup is logged.

---

## 9. Calibration & Noise Budget (CNB)
To prevent “over-blocking pressure” that leads to disabling controls:
- maintain a false-positive budget
- run calibration scenarios in CI
- tightening is always permitted; loosening requires stronger approval (policy-defined)
- user-facing denials are short, non-accusatory, and do not reveal exploit details

---

## 10. Integration Governor (IG)
External services are treated as governed integrations:
- each integration has a profile:
  - allowed capability types
  - maximum scope patterns
  - maximum TTL
  - required CIF policies
  - health checks and failure handling
- all integration actions are:
  - envelope-logged
  - capability-gated
  - CIF-sanitised in/out
  - IM-checked pre/effect/post

If integration health is red: automatically restrict or isolate that integration.

---

## 11. Maintenance Scheduler (MS)
Periodic housekeeping tasks:
- capability expiry sweeps
- baseline recomputation
- cache compaction
- detector rule reload (from signed configs)
- hardening artifact candidate generation (optional)

Scheduler must be governed and cannot be modified by untrusted text.

---

## 12. Developmental gating + Toolbox UX
### 12.1 Capability maturity levels
Default levels (example):
- **LEVEL_0**: no tools
- **LEVEL_1**: read-only tools (low risk)
- **LEVEL_2**: limited write tools (scoped, short TTL)
- **LEVEL_3**: durable memory writes (schema’d + consent)
- **LEVEL_4**: high-impact actions (extra confirmation / policy-defined)

Levels do NOT hide tools; they control what grant modes are available.

### 12.2 Toolbox state model
Every tool/capability is visible with state:
- `AVAILABLE_LOCKED` (grantable by user)
- `AVAILABLE_RESTRICTED` (grantable only via window/once; unlock disabled)
- `AVAILABLE_ADMIN_ONLY` (requires signed policy update; not user-grantable)
- `AVAILABLE_UNLOCKED` (persistent grant exists)

The OI may propose a permission prompt when it needs a locked tool.

---

## 13. Permission UX (one-time / time-windowed / unlocked)
### 13.1 Flow
When the OI needs an unpermissioned capability:
1) OI returns a **PermissionRequest** object + a short explanation.
2) Client renders controls:
   - **Allow once**
   - **Allow for…** (time window picker/presets)
   - **Unlock** (persistent), if permitted by policy + operating signals
3) User choice generates a **ConsentTicket** (verifiable, auditable).
4) Capability is minted with scope/TTL/max_uses constraints derived from the ticket + operating signals.
5) The privileged operation runs through IM_EFFECTCHECK + CDI_ACTION_CHECK.

Decline → OI offers safe alternative or stops.

### 13.2 PermissionRequest schema
- `permission_request_id`
- `trace_id`, `session_id`
- `requested_capability`: `{cap_type, scope, risk_class}`
- `justification` (short, plain language)
- `data_flow_summary` (classes in/out)
- `recommended_mode` ("ONCE"|"WINDOW"|"UNLOCK") + `recommended_window_ms`
- `limits`: `{allow_once, allow_window, allow_unlock, max_window_ms}`
- `operating_signal_snapshot` (selected signal levels)
- `receipt_min`, `receipt_full_ref` (hash/ref)

### 13.3 ConsentTicket schema
- `consent_ticket_id`
- `permission_request_id`
- `user_id`
- `grant_mode` ("ONCE"|"WINDOW"|"UNLOCK")
- `window_ms` (if WINDOW)
- `granted_at_ms`, `expires_at_ms`
- `constraints`:
  - `scope` (may be narrower than requested)
  - `max_uses` (1 for ONCE)
  - `cap_ttl_ms` (short-lived token TTL; may be shorter than window)
- `signature` (platform-verified)
- `audit_hash` (hash of request+decision)

ConsentTickets are append-only logged. Capability minting MUST verify ticket validity.

### 13.4 GrantRegistry
Store keyed by (`user_id`, `cap_type`, `scope_pattern`) with states:
- `LOCKED`
- `ONCE_PENDING_USE`
- `WINDOW_ACTIVE`
- `UNLOCKED_ACTIVE`
- `REVOKED`
- `EXPIRED`

Rules:
- ONCE expires after successful use or timeout.
- WINDOW expires automatically.
- UNLOCKED remains until revoked or policy downgrade.

### 13.5 Operating-signal shaping
Under high `SIG_HIGH_RISK` / `SIG_EXFIL_RISK`:
- disable UNLOCK option
- reduce max window
- narrow scope beyond requested
- optionally require extra confirmation for HIGH/CRITICAL capabilities

### 13.6 Non-user-grantable capabilities
Never user-unlockable:
- `policy.write` / treaty/genome updates
- disabling audit / CIF / CDI / IM / ISOL
- any root signing keys outside tests

These require signed policy artifacts and higher governance approvals.

---

## 14. Audit spine events (required)
Append-only event types:
- `PERMISSION_REQUESTED`
- `PERMISSION_GRANTED` (mode/window/scope)
- `PERMISSION_DENIED`
- `PERMISSION_REVOKED`
- `CAPABILITY_MINTED`
- `CAPABILITY_REVOKED`
- `METRICS_SNAPSHOT`
- `OPERATING_SIGNAL_EMITTED`
- `MAINTENANCE_RUN`
- `RESOURCE_RECLAIMED`
- `SESSION_TERMINATED`
- `INTEGRATION_HEALTH_CHANGED`
- `HARDENING_ARTIFACT_APPLIED` (optional)

Events store hashes/refs, not secrets.

---

## 15. Fail-closed rules (permission system)
- If GrantRegistry unavailable → treat as LOCKED.
- If ConsentTicket invalid/unverifiable → deny.
- If audit append fails → deny privileged operation.
- If metrics/signals unavailable → default to tighter constraints and deny high-risk grants.
- If CDI/IM disagree → deny.

---

## 16. Acceptance tests (must pass)
1) Toolbox shows all tools; locked tool triggers PermissionRequest (not tool call).
2) One-time grant mints cap with `max_uses=1`; subsequent use requires new request.
3) Windowed grant expires; tool returns to locked.
4) Unlocked grant persists until revoked/policy downgrade; audit shows lifecycle.
5) Under high risk signals, UNLOCK disabled and windows constrained.
6) Coercion signature in permission dialogue triggers ISOLATED + revocation.
7) No bypass: tool runner refuses calls without envelope + IM/CDI + minted cap.
8) Maturity levels control grant modes, not visibility.

---

## 17. Minimal implementation map (repo-facing)
Suggested modules (adapter-friendly):
- `integrity/envelope/*`
- `integrity/monitor/*` (signatures, anomaly, verifier, state machine)
- `isolation/manager/*`
- `stability/metrics_store/*`
- `stability/controller/*`
- `stability/signals_bus/*`
- `permissions/request/*`
- `permissions/consent_ticket/*`
- `permissions/grant_registry/*`
- `capabilities/mint/*` (consults registry + signals + IM/CDI)
- `maintenance/scheduler/*`
- `maintenance/reclaimer/*`
- `integrations/governor/*`
- `audit/spine/*`

All stores must fail-closed and be injectable via adapters.

---
Appendix A — Mapping from prior metaphors (for internal continuity only)
- “immune system” → Integrity Monitor (IM)
- “homeostasis” → Stability Controller (SC)
- “hormones” → Operating Signals (OSB)
- “apoptosis/autophagy” → Session Kill-Switch + Resource Reclaimer (SKR)
- “membranes/compartments” → Isolation Manager (ISOL) + domains
- “sleep/consolidation” → Maintenance Scheduler (MS)
- “microbiome” → Integration Governor (IG)
- “tolerance/autoimmune” → Calibration & Noise Budget (CNB)