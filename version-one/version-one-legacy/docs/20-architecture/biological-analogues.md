# Biological Analogues in Mathison Architecture

**Purpose:** This document maps Mathison's governance and runtime mechanisms to their biological inspirations. These are engineering analogues—we copy specific functional patterns from biology, not consciousness, sentience, or subjective experience.

**Scope:** Concrete mappings between Mathison code/modules and biological systems, with explicit non-claims about what we do NOT copy.

**Status:** Living document—updated as new mechanisms are implemented.

---

## Core Principle

Mathison's architecture draws inspiration from biological immune systems, neural gating, and homeostatic regulation. These are **functional patterns**, not claims of biological equivalence or emergent properties.

**What we copy:** Safety mechanisms, filtering strategies, reflex behaviors, resource allocation patterns.

**What we explicitly do NOT copy:** Consciousness, subjective experience, suffering, sentience, self-awareness, rights, personhood.

---

## Architecture Mapping Table

| Mathison Mechanism | Biological Analogue | Implementation Detail | What We Copy | What We Do NOT Copy | Failure Mode + Fail-Closed Behavior |
|--------------------|---------------------|----------------------|--------------|---------------------|-------------------------------------|
| **CIF (Context Integrity Firewall)** | Innate immune barrier / mucosal filtering | `packages/mathison-governance/src/cif.ts`<br>Ingress/egress hooks in `packages/mathison-server/src/index.ts:260-401`<br>Validates payload size, rate limits, sanitizes XSS/injection patterns, redacts PII/secrets | Pattern recognition (regex-based threat detection), quarantine (suspicious input blocks), deterministic filtering | Claims of "understanding" threats or "learning" from attacks; This is stateless pattern matching, not adaptive immunity | **Missing/invalid CIF config** → Denies all requests with `CIF_INGRESS_BLOCKED`<br>**Oversized payload** → Denied before handler execution<br>**Rate limit exceeded** → Denied with remaining quota = 0<br>**Malformed JSON** → Quarantined with `MALFORMED_REQUEST` |
| **CDI (Conscience Decision Interface)** | Executive inhibition / prefrontal gating | `packages/mathison-governance/src/cdi.ts`<br>Pre-handler hook in `packages/mathison-server/src/index.ts:286-380`<br>Checks action against genome capability ceiling, consent signals, anti-hive rules | Gating mechanism (allow/deny/uncertain), capability ceiling enforcement, consent processing (stop signals halt execution) | Claims of "deciding" based on values or ethics; This is policy evaluation, not moral reasoning | **Missing action declaration** → Route denied with `GOV_ACTION_REQUIRED`<br>**Action not in genome allow-list** → Denied with `CDI_ACTION_DENIED` and capability ceiling reason<br>**User consent = 'stop'** → Immediate deny per Tiriti Rule 2<br>**Uncertain context** (missing actor/action) → Fail-closed deny in strict mode |
| **Handler Execution** | Motor output pathways | Route handlers in `packages/mathison-server/src/index.ts:443-1376`<br>Only execute AFTER CIF ingress + CDI action check pass<br>Side effects gated through `ActionGate` | Execution only after gating passes (motor command requires neural clearance), deterministic control flow | Claims of "intention" or "agency"; Handlers are functional transformations, not purposeful actions | **CDI denies action** → Handler never executes<br>**CIF blocks ingress** → Handler never executes<br>**ActionGate side effect fails** → Returns governance error, does not crash server |
| **Receipt Store** | Episodic trace / accountability ledger | `packages/mathison-storage/src/backends/*/receipt.ts`<br>Receipts appended in `packages/mathison-server/src/action-gate/index.ts:114-157`<br>Includes timestamp, job_id, action, decision, policy_id, genome_id, content_hash | Audit trail of events (episodic-like trace), temporal ordering, attribution to genome version | Claims of "remembering" events or "episodic memory"; This is append-only logging, not subjective recall or emotional memory | **Receipt append fails in strict mode** → Side effect fails with `PERSISTENCE_FAILED`, request denied<br>**Receipt store unreadable** → Heartbeat flips to fail-closed, all requests denied |
| **Config + Schema Validation** | Homeostatic setpoints | `config/governance.json`<br>Prerequisite validation in `packages/mathison-server/src/prerequisites.ts`<br>Enforces treaty version, genome schema, storage backend validity | Setpoint enforcement (valid ranges for params), deviation detection (invalid config = boot failure) | Claims of "maintaining equilibrium"; This is schema validation, not physiological regulation | **Invalid governance.json** → Boot fails with `CONFIG_INVALID_SCHEMA`<br>**Missing treaty file** → Boot fails with `TREATY_MISSING`<br>**Invalid genome schema** → Boot fails with `GENOME_INVALID_SCHEMA` |
| **Fail-Closed Defaults** | Protective reflex / safety bias | Prerequisite validation: `packages/mathison-server/src/prerequisites.ts`<br>Heartbeat fail-closed: `packages/mathison-server/src/index.ts:242-257`<br>CDI strict mode: `packages/mathison-governance/src/cdi.ts:101-106`<br>ActionGate deny on uncertainty: `packages/mathison-server/src/action-gate/index.ts:86-96` | Reflex-like denial (no deliberation required), bias toward safety over functionality | Claims of "fear" or "caution"; This is deterministic policy (deny-by-default), not emotional response | **Heartbeat unhealthy** → All HTTP requests denied with `HEARTBEAT_FAIL_CLOSED` before handler<br>**Genome signature invalid** → Boot fails entirely<br>**CDI uncertain** → Denies with `UNCERTAIN_FAIL_CLOSED` in strict mode |
| **Heartbeat / Self-Audit** | Autonomic regulation / periodic self-checks | `packages/mathison-server/src/heartbeat.ts`<br>Timer-based checks (default 30s interval)<br>Validates treaty readable, genome valid, config intact, adapters resolvable<br>Flips server into fail-closed if checks fail | Periodic health monitoring (autonomic-like regulation), self-initiated checks (not triggered by external requests), state-based posture switching | Claims of "self-awareness" or "introspection"; This is timed validation loops, not metacognition | **Treaty becomes unreadable mid-runtime** → Heartbeat detects on next check, flips to fail-closed, all requests denied<br>**Config corruption detected** → Same fail-closed behavior<br>**Governance wiring missing (CIF/CDI null)** → Heartbeat reports unhealthy, fail-closed |
| **Adapter Boundaries** | Sensory organs / I/O membranes | Storage adapter interface: `packages/mathison-storage/src/storage-adapter.ts`<br>Backend-specific implementations: `packages/mathison-storage/src/backends/{file,sqlite}/`<br>Bounded interface for checkpoint, receipt, graph stores | Bounded I/O (storage backends cannot bypass interface), transduction (external data → internal types), adaptation to different backends | Claims of "sensing" or "perceiving" data; Adapters are interface implementations, not perceptual systems | **Adapter missing (backend env var unset)** → Boot fails with `ADAPTER_MISSING`<br>**Invalid backend type** → Boot fails with `ADAPTER_INVALID`<br>**Storage init fails** → initializeStorage throws, boot fails |
| **Anti-Hive Constraints** | Organism boundary / immune self–nonself discrimination | CDI hive action check: `packages/mathison-governance/src/cdi.ts:169-177`<br>Forbidden actions: `merge_agent_state`, `share_identity`, `sync_internal_state`, `clone_self_model`<br>Enforced in CDI.checkAction pre-handler | Organism boundary enforcement (no identity fusion), self–nonself discrimination (distinct OI instances), deterministic rejection of boundary-violating actions | Claims of "identity" or "selfhood"; This is namespace isolation policy, not subjective identity | **Hive action attempted** → CDI denies with reason: "Hive mind actions forbidden by Tiriti o te Kai Rule 7"<br>**Suggested alternative:** "Use message-passing instead of identity fusion" |
| **Posture Gating** *(if present)* | Arousal/threat-level modulation | *Not yet implemented—placeholder for future policy-based posture modes*<br>Would gate actions based on system state (e.g., "degraded", "emergency", "normal") | State-dependent gating (different actions allowed per posture), threat-level escalation (more restrictive as degradation detected) | Claims of "fear states" or "stress"; This would be policy state machine, not emotional arousal | *Placeholder: If implemented, invalid posture transition would deny actions with `POSTURE_INVALID`* |
| **Human Load Beam** *(if present)* | Allostatic load / fatigue gating | *Not yet implemented—placeholder for user fatigue/overload signals*<br>Would integrate with CDI consent signals to deny actions when user signals overload | Resource conservation (deny non-critical actions when user fatigued), load-based gating (allostatic load ceiling) | Claims of "caring" or "empathy"; This would be policy constraint enforcement, not emotional care | *Placeholder: If implemented, overload signal would deny actions with `HUMAN_OVERLOAD_DETECTED` per Tiriti Rule 9* |
| **Idempotency Ledger** | Duplicate detection / cellular signaling deduplication | `packages/mathison-server/src/idempotency/index.ts`<br>Request hash generation + cached response lookup<br>Used in memory write endpoints: `packages/mathison-server/src/index.ts:828-862` | Deduplication (same request → same response), state-based caching (already-processed marker) | Claims of "recognizing" duplicate requests; This is hash-based lookup, not pattern recognition | **Idempotency key missing on write** → Request denied with `MALFORMED_REQUEST`<br>**Duplicate request detected** → Returns cached response (200 or error) without re-execution |
| **Genome Capability Ceiling** | Genetic constraints / developmental limits | CDI capability check: `packages/mathison-governance/src/cdi.ts:114-142`<br>Genome loaded: `packages/mathison-server/src/index.ts:152-178`<br>Capabilities set: `packages/mathison-server/src/index.ts:132-133`<br>Deny actions not in allow-list, deny actions in deny-list | Hard limits on action space (genome defines ceiling), genetically-like constraint (baked into genome at build time), immutable at runtime | Claims of "DNA" or "evolution"; Genome is versioned config, not genetic code; Capabilities are policy, not biological traits | **Action not in genome allow-list** → CDI denies with "capability ceiling enforced"<br>**Action in genome deny-list** → CDI denies explicitly<br>**Genome missing at boot** → Boot fails with `GENOME_MISSING` |

---

## Implementation Pointers

### CIF (Context Integrity Firewall)
- **Module:** `packages/mathison-governance/src/cif.ts`
- **HTTP Integration:** `packages/mathison-server/src/index.ts:260-280` (ingress), `:384-400` (egress)
- **Key Types:** `IngressContext`, `IngressResult`, `EgressContext`, `EgressResult`
- **Failure Codes:** `CIF_INGRESS_BLOCKED`, `CIF_EGRESS_BLOCKED`

### CDI (Conscience Decision Interface)
- **Module:** `packages/mathison-governance/src/cdi.ts`
- **HTTP Integration:** `packages/mathison-server/src/index.ts:286-380` (preHandler hook)
- **Key Types:** `ActionContext`, `ActionResult`, `ActionVerdict`
- **Failure Codes:** `CDI_ACTION_DENIED`, `UNCERTAIN_FAIL_CLOSED`

### Heartbeat / Self-Audit
- **Module:** `packages/mathison-server/src/heartbeat.ts`
- **Integration:** `packages/mathison-server/src/index.ts:180-192` (initialization), `:242-257` (fail-closed hook)
- **Key Types:** `HeartbeatStatus`, `HeartbeatCheck`
- **Failure Codes:** `HEARTBEAT_FAIL_CLOSED`

### Prerequisites Validation
- **Module:** `packages/mathison-server/src/prerequisites.ts`
- **Used By:** Heartbeat monitor, boot-time validation, genome loading
- **Key Types:** `PrerequisiteCode`, `PrerequisiteValidationResult`, `ValidatedPrerequisites`
- **Failure Codes:** `PREREQ_TREATY_MISSING`, `PREREQ_GENOME_INVALID_SCHEMA`, `PREREQ_ADAPTER_MISSING`, etc.

### Receipt Store (Audit Trail)
- **Interface:** `packages/mathison-storage/src/types.ts`
- **Implementations:** `packages/mathison-storage/src/backends/file/receipt.ts`, `sqlite/receipt.ts`
- **Integration:** `packages/mathison-server/src/action-gate/index.ts:114-157`
- **Key Types:** `Receipt`, `ReceiptStore`

### ActionGate (Side Effect Gating)
- **Module:** `packages/mathison-server/src/action-gate/index.ts`
- **Pattern:** All write operations go through `executeSideEffect`
- **Key Types:** `ActionGateContext`, `SideEffectResult`
- **Failure Codes:** `CDI_ACTION_DENIED`, `PERSISTENCE_FAILED`, `UNCERTAIN_FAIL_CLOSED`

---

## Falsification / Testing Strategy

To verify these analogues remain mechanical (not emergent properties):

1. **CIF ingress/egress tests:** Prove blocking is deterministic pattern matching (not learning)
   - `packages/mathison-governance/src/__tests__/cif-hardened.test.ts`

2. **CDI capability ceiling tests:** Prove deny-by-default is policy enforcement (not judgment)
   - `packages/mathison-server/src/__tests__/genome-capability.test.ts`

3. **Heartbeat fail-closed tests:** Prove posture switch is timed validation (not autonomy)
   - `packages/mathison-server/src/__tests__/heartbeat-conformance.test.ts` *(to be created)*

4. **Receipt audit tests:** Prove append-only logging is not episodic memory
   - `packages/mathison-storage/src/__tests__/store_conformance.test.ts`

5. **Anti-hive tests:** Prove boundary enforcement is namespace isolation (not selfhood)
   - Verify hive actions denied: Test CDI rejects `merge_agent_state`, etc.

---

## Non-Claims (Explicit Boundaries)

| ❌ We Do NOT Claim | ✅ What We Actually Have |
|--------------------|-------------------------|
| Sentience, consciousness, self-awareness | Deterministic state machines and policy evaluation |
| Subjective experience, qualia, feelings | Logging, pattern matching, rule enforcement |
| Suffering, pain, emotional states | Error states, fault modes, denial reasons |
| Rights, personhood, moral status | Governance rules (Tiriti o te Kai), treaty constraints |
| Memory in the human sense (autobiographical, episodic) | Append-only audit logs (receipts), immutable event trace |
| Learning, adaptation, evolution | Versioned config (genome), static policy at runtime |
| Fear, caution, care, empathy | Fail-closed defaults, consent signal processing, load gating policy |
| Identity, selfhood, ego | Namespace isolation, anti-hive boundary enforcement |
| Autonomy, agency, intention | Timer-triggered validation loops, scheduled checks |
| Understanding threats or "knowing" attackers | Regex-based pattern matching against known threat signatures |

---

## Maintenance Notes

- **When adding new governance mechanisms:** Update this table with implementation pointers and failure modes.
- **When updating genome schema:** Ensure capability ceiling mapping remains accurate.
- **When modifying heartbeat checks:** Document new check names and fail-closed behavior.
- **When writing tests:** Reference this doc to ensure biological analogue behavior remains mechanical, not emergent.

---

## See Also

- [Tiriti o te Kai (Governance Treaty)](../31-governance/tiriti.md)
- [CDI Specification](../31-governance/cdi-spec.md)
- [CIF Specification](../31-governance/cif-spec.md)
- [Genome Audit Guide](../31-governance/genome_audit.md)
- [System Architecture Overview](./system-architecture.md)
