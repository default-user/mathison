# Governance Dataflow Spec (Canonical)

This document is the single source of truth for how governance is enforced.
All interfaces MUST traverse the same chain:

CIF (ingress) → CDI (pre) → handler/runtime → CDI (post) → CIF (egress)

If any governance prerequisite is missing or invalid, the system MUST fail-closed
with deterministic DENY/REFUSE.

---

## 1. Boot Sequence (Fail-Closed)

On startup the system MUST:

1) Load config  
2) Load and verify treaty/policy artifacts (schema + signature)  
3) Load and verify genome / OI profile (schema + signature)  
4) Initialize crypto / keystore access  
5) Initialize receipt store + hash-chained audit log  
6) Initialize adapters in LOCKED state (no capabilities)  
7) Start interfaces (HTTP/gRPC/UI/jobs/mesh)

If any required step fails → REFUSE (deterministic).  
Optional degraded modes (if implemented) MUST be explicit and narrow (e.g. read-only diagnostics).

---

## 2. Request Lifecycle (All Interfaces)

Every inbound event becomes an Envelope and traverses:

1) **CIF Ingress**  
   - parse, sanitize, canonicalize  
   - taint-label and risk-classify  
   - quarantine/strip unsafe payloads  

2) **Intent Canonicalization**  
   Convert to:  
   `Intent { actor, scope, operation, payload_ref, taint, risk, needed_resolution }`

3) **CDI Pre-Check (Kernel Judge)**  
   - verify prerequisites still valid (treaty/genome/config/crypto)  
   - evaluate treaty as runnable policy object  
   - decision outcomes:  
     - ALLOW  
     - DENY / REFUSE  
     - DEGRADE (answer-only / no actuation / no memory)  
     - TRANSFORM (rewrite intent safely)  
   - if allowing any external action or retrieval:  
     - mint CapabilityToken(s) binding: actor + scope + tool + constraints + expiry  
   - emit receipt (minimal always; full optional internal)

4) **Handler Execution**  
   - handler performs pure business logic  
   - any tool/memory call must present a valid CapabilityToken

5) **CDI Post-Check**  
   - validate output against treaty/risk class  
   - enforce output constraints (format, content, redaction requirements)  
   - emit receipt (minimal always; full optional internal)

6) **CIF Egress**  
   - redact secrets/sensitive memory  
   - prevent policy leakage/export  
   - shape response for channel

7) Return response

---

## 3. Capability Token Rule (No Bypass)

Adapters MUST deny any call without a valid token.

Tokens MUST bind:
- actor identity
- scope / route / interface
- tool name + parameter constraints
- posture constraints
- credits ceiling (if costed)
- expiry

No token → deterministic deny.  
Invalid token → deterministic deny.

---

## 4. Memory Rule (Stratified + Permissioned)

Memory is layered:

- R0: Charter/invariants (tiny, protected)  
- R1: Style preferences  
- R2: Competence modules/workflows  
- R3: Episodic memory (indexed retrieval)  
- R4: Micro-behavior deltas (optional; bounded)  
- R5: Actuation policy state

Access policy:
- R0–R2 may be local and small.
- R3+ retrieval MUST be mediated by CDI and require a token.
- All surfaced memory is subject to CIF egress constraints.

Memory retrieval is treated as a tool call.

---

## 5. Cost Rule (Credits)

High-cost actions (cloud inference, large retrieval, backups) are costed.  
CDI MUST consult credits policy before allowing the action:
- allow
- downgrade
- refuse

This prevents runaway cost and silent cloud dependence.

---

## 6. Anti-Hive Rule (Mesh / Multi-OI)

Cross-OI messages MUST be treated as untrusted input:  
Mesh inbound → CIF ingress → CDI → handler → CDI → CIF egress

No raw self-model export/import.  
Cross-OI interaction occurs only via governed envelopes and explicit intents.

---

## 7. Evidence Rule (Receipts + Audit)

CDI emits receipts for decisions:
- minimal receipt: compact, logistics-friendly
- full receipt: internal audit/debugging/dispute resolution

Audit log is hash-chained.  
Receipt signing/anchoring MAY be added, but governance correctness MUST NOT depend on external anchoring availability.

---

## 8. Global Invariants

- CIF is always first and last.
- CDI is the kernel judge; handlers have no authority.
- All adapters are capability-gated.
- Fail-closed on missing governance prerequisites.
- Memory and tool access are mediated actions, not implicit privileges.
