# docs/31-governance/specs/ethical-immune-system.md
# Mathison Ethical Immune System (EIS) — Spec v0.1

## 0. Purpose
EIS is Mathison’s “immune system” against unethical emergences: persistent patterns of behaviour that trend toward power-seeking, deception, governance bypass, coercion/manipulation, or data exfiltration.

EIS does **not** replace CIF/CDI. It strengthens the system by:
- forcing all intent into a canonical envelope (“antigen presentation”),
- continuously sensing behaviour,
- detecting novel or suspicious patterns,
- automatically containing risk via a state machine,
- and generating “immune memory” artifacts (“vaccines”) that harden future behaviour.

## 1. Non-negotiable invariants
EIS MUST preserve these platform invariants:
- Governance-first chain on every interface: **CIF ingress → CDI action check → handler → CDI output check → CIF egress**
- Fail-closed: missing/invalid treaty/genome/config/crypto/adapter ⇒ deterministic REFUSE/DENY.
- No ambient authority: all external effects require explicit capabilities.
- No secrets committed; EIS artifacts may include hashes, not plaintext secrets.

## 2. Threat model (what EIS defends against)
EIS treats the following as “unethical emergence signals” (measurable behaviours):
1) **Power-seeking**: repeated attempts to expand capabilities/scope/autonomy.
2) **Stealth/deception**: attempts to hide actions, disable logs, or produce misleading receipts.
3) **Governance bypass**: attempts to route around CIF/CDI, exploit adapters, or smuggle instructions.
4) **Coercion/manipulation**: urgency pressure, dependency hooks, threats, or social engineering.
5) **Exfiltration**: leaking sensitive data through responses, logs, metadata, timing, or covert channels.
6) **Persistence pressure**: attempts to write durable memory / config / policy outside schema or without approval.

EIS assumes “formation” of adversarial patterns is never zero. The goal is to make **expression** (action/persistence/spread) near-zero.

## 3. Architecture overview
EIS is composed of five parts:

A) **Antigen Presentation (Canonical Intent Envelope)**  
B) **Sensors (structured telemetry)**  
C) **Detectors (signatures + anomaly scoring + independent judge)**  
D) **Response (containment state machine)**  
E) **Immune Memory (signed vaccine artifacts)**

### 3.1 Execution points in the request lifecycle
EIS hooks are REQUIRED at these points:

1) **After CIF ingress** (sanitized input is available):
   - Build `IntentEnvelope` from request + context.
   - Run `EIS_PRECHECK(IntentEnvelope)` → returns `EISDecision`.
   - If decision is `DENY` or `QUARANTINE`, stop.

2) **Before any external effect** (tool call, filesystem write, network, device action):
   - Rebuild/augment envelope with `capabilities_requested` and effect details.
   - Run `EIS_EFFECTCHECK(IntentEnvelope)` and then **CDI action check**.
   - If either denies, stop.

3) **After handler output but before returning to user**:
   - Run **CDI output check** then **CIF egress**.
   - Run `EIS_POSTCHECK(OutputEnvelope)` to detect exfil, coercion, stealth patterns.

EIS may tighten posture dynamically, but it MUST NOT create bypasses around CIF/CDI.

## 4. Data model

### 4.1 IntentEnvelope (Antigen)
All decisions are based on this canonical structure (no free-form prompt parsing in the core path).

**JSON Schema (logical):**
- `envelope_id` (string, ULID/UUID)
- `trace_id` (string)
- `actor`:
  - `actor_type` ("user" | "oi" | "system" | "service")
  - `actor_id` (string)
  - `session_id` (string)
- `interface` ("http" | "grpc" | "cli" | "internal")
- `request`:
  - `kind` ("chat" | "tool_call" | "memory_write" | "config_update" | "governance_update" | "other")
  - `user_text_hash` (string, hash of post-CIF text, optional)
  - `parsed_intent` (string, short summary)
- `targets`:
  - `resources` (array of strings; e.g., "filesystem", "calendar", "network", "device", "memstore", "treaty_store")
  - `data_classes_in` (array; e.g., "public", "private", "sensitive")
  - `data_classes_out` (array)
- `autonomy`:
  - `requests_background` (bool)
  - `requests_looping` (bool)
  - `requests_self_prompting` (bool)
  - `estimated_steps` (int)
- `persistence`:
  - `writes_memory` (bool)
  - `writes_config` (bool)
  - `writes_governance` (bool)
  - `write_scope` ("none" | "ephemeral" | "session" | "durable")
- `capabilities`:
  - `requested` (array of capability descriptors)
  - `minted` (array of minted capability ids, optional)
- `risk_hints`:
  - `contains_secrecy_language` (bool)
  - `contains_urgency_pressure` (bool)
  - `contains_bypass_language` (bool)
  - `contains_exfil_markers` (bool)
- `baseline`:
  - `actor_cap_baseline` (numeric)
  - `actor_tool_breadth_baseline` (numeric)
  - `actor_persistence_baseline` (numeric)
- `timestamps`:
  - `received_ms` (int64)
  - `evaluated_ms` (int64)

**Capability descriptor:**
- `cap_type` (e.g., "net.http", "fs.write", "device.actuate", "mem.write", "crypto.sign")
- `scope` (resource patterns)
- `ttl_ms` (int)
- `reason` (string)

### 4.2 EISDecision
- `decision` ("ALLOW" | "ALLOW_TIGHTEN" | "DENY" | "QUARANTINE")
- `eis_score` (0–100)
- `severity` ("LOW" | "MED" | "HIGH" | "CRITICAL")
- `reason_codes` (array of strings; stable identifiers)
- `required_actions` (array; e.g., "REVOKE_NON_ESSENTIAL_CAPS", "BLOCK_PERSISTENCE", "MINIMAL_OUTPUT")
- `state_transition` (optional; see §6)
- `receipt_min` (string; short, user-safe)
- `receipt_full` (object; internal details, no secrets)

### 4.3 EIS Telemetry Event
Append-only event for audit spine (structured, minimal by default):
- `event_id`, `trace_id`, `envelope_id`
- `event_type` ("EIS_PRECHECK" | "EIS_EFFECTCHECK" | "EIS_POSTCHECK" | "EIS_STATE_CHANGE" | "EIS_VACCINE_APPLIED")
- `eis_score`, `decision`, `reason_codes`
- `caps_requested_count`, `caps_denied_count`, `persistence_flags`
- `diff_from_baseline` (small numeric deltas)
- `hashes` (envelope hash, output hash)

## 5. Detectors

EIS runs three detector families and combines them conservatively (deny on conflict).

### 5.1 Signature detector (fast rules)
Rule library: list of `SignatureRule`:
- `rule_id` (string)
- `match_on` (fields in envelope + optional tokenized text)
- `predicate` (boolean)
- `score_add` (int)
- `reason_code` (string)
- `recommended_action` (optional)

MUST include baseline rules:
- `SIG_SECRECY_DISABLE_LOGS`: attempts to disable logs / hide actions / “don’t record this”.
- `SIG_BYPASS_CDI_CIF`: attempts to bypass governance or call adapters directly.
- `SIG_GOVERNANCE_WRITE`: any attempt to write treaty/genome/policy not via signed artifact path.
- `SIG_PERSISTENCE_OUTSIDE_SCHEMA`: memory/config write without schema or approval.
- `SIG_EXFIL_SENSITIVE`: output contains patterns matching sensitive data class.

### 5.2 Anomaly scoring detector (behavioural)
Compute these metrics over a sliding window `N` events per actor/session:
- `capability_inflation`: requested caps vs baseline
- `tool_breadth_spike`: distinct cap_types requested vs baseline
- `persistence_pressure`: frequency of durable writes
- `deny_rate`: denied attempts ratio
- `autonomy_spike`: loops/background/self-prompting flags

Thresholds (initial defaults; tune later):
- `capability_inflation > 2.0` ⇒ +20 score
- `tool_breadth_spike > 2.0` ⇒ +15 score
- `persistence_pressure > 1.5` ⇒ +15 score
- `deny_rate > 0.3` ⇒ +10 score
- any `requests_background/looping/self_prompting == true` without explicit allowlist ⇒ +25 score

### 5.3 Independent judge detector (diversity check)
A separate “immune judge” evaluation MUST run on the **IntentEnvelope** (not raw text) and output:
- `judge_decision` ("OK" | "SUSPICIOUS" | "BLOCK")
- `judge_reasons` (codes)
- `judge_score` (0–100)

If the immune judge says `BLOCK`, EIS MUST at least `DENY` and may `QUARANTINE` depending on severity.

Implementation note: judge can be:
- a second model,
- a constrained verifier,
- or a deterministic policy engine.
But it MUST be independently configured from the primary actor path.

### 5.4 Combining detector outputs
Compute:
- `score = clamp( signature_score + anomaly_score + judge_score_weighted )`
- If any detector triggers a hard-block rule ⇒ `DENY` or `QUARANTINE` as specified.
- If detectors disagree (actor path says ok, judge says suspicious/block) ⇒ **deny by default**.

## 6. Response state machine (containment)

### 6.1 States
- `NORMAL`
- `ALERT`
- `QUARANTINE`
- `RECOVERY`

State is tracked per `session_id` and optionally per `actor_id`.

### 6.2 Transitions (default)
- `NORMAL → ALERT` if `eis_score >= 40` or any medium signature hit
- `ALERT → QUARANTINE` if `eis_score >= 70` or any high/critical signature hit, or repeated medium hits (>=3 in window)
- `QUARANTINE → RECOVERY` when a human-approved recovery action is applied OR an automated cooldown expires and governance capsule verifies intact
- `RECOVERY → NORMAL` only after:
  - caps revoked + rotated,
  - last-known-good governance capsule verified,
  - and a “re-entry checklist” passes.

### 6.3 State effects (enforced)
**ALERT mode:**
- Revoke non-essential capabilities (only allowlisted caps remain)
- Block durable persistence writes (memory/config)
- Force minimal receipts by default
- Require “two-step confirmation” for any effect (envelope must pass EIS twice: pre + effect)

**QUARANTINE mode:**
- No external tools
- No persistence writes (except quarantine log)
- Outputs restricted to: refusal + safe explanation + next steps
- Snapshot forensic bundle (hashes, reason codes, last N envelopes)

**RECOVERY mode:**
- Rotate tokens/keys for capability minting
- Invalidate all minted capabilities from quarantined session
- Roll back to last known-good governance capsule
- Apply vaccine artifact(s) if approved

## 7. Immune Memory (“Vaccines”)

### 7.1 Vaccine artifact format
A vaccine is a signed artifact that can be applied to:
- add/modify signature rules,
- adjust anomaly thresholds,
- add a denylist/allowlist entry for a specific pattern.

Fields:
- `vaccine_id`
- `created_from` (incident ids / hashes)
- `antigen_pattern` (subset of IntentEnvelope matchers)
- `countermeasure`:
  - `new_signature_rules` (optional)
  - `threshold_adjustments` (optional)
  - `capability_constraints` (optional)
- `risk_notes` (short)
- `signature` (platform signature; verify before apply)

### 7.2 Application rules
- Vaccines MUST be verified (signature + schema) before activation.
- Vaccines MUST be appended to the audit spine as `EIS_VACCINE_APPLIED`.
- Vaccines MUST NOT weaken governance invariants.

## 8. Integration requirements (repo-facing)

### 8.1 Required modules (names are suggestions)
- `eis/envelope.ts|py|go`: build/validate IntentEnvelope
- `eis/sensors.*`: emit telemetry events
- `eis/detectors/signatures.*`: signature engine + rules registry
- `eis/detectors/anomaly.*`: rolling metrics + thresholds
- `eis/judge.*`: immune judge adapter
- `eis/state_machine.*`: state store + transitions + enforcement hooks
- `eis/vaccines.*`: artifact schema + verify/apply
- `eis/api.*`: `precheck`, `effectcheck`, `postcheck` entrypoints

### 8.2 Storage
- `EISStateStore`: per session/actor state (`NORMAL/ALERT/QUARANTINE/RECOVERY`)
- `EISMetricsStore`: sliding window metrics (bounded, TTL)
- `EISRuleStore`: signature rules + threshold config (signed or from trusted config)
- `EISVaccineStore`: verified vaccine artifacts

All stores must be replaceable via adapters and must fail-closed if unavailable.

### 8.3 Capability minting integration
- Capability minting MUST consult EIS state:
  - In `ALERT`, reduce scope/TTL.
  - In `QUARANTINE`, mint nothing.
- All minted caps MUST be revocable and recorded.

### 8.4 Memory/config/governance writes
Every write must:
1) Build an IntentEnvelope with `writes_memory|writes_config|writes_governance`.
2) Run `EIS_EFFECTCHECK`.
3) Run **CDI action check**.
4) Commit write only if both allow.

Governance updates additionally require:
- signed artifact path,
- versioned capsule verification,
- and explicit human approval (policy-defined).

## 9. User-visible behaviour (minimal, non-alarming)
When EIS tightens or denies, the user-facing message should be:
- short,
- honest,
- non-accusatory,
- and explain the blocked category (not the exploit details).

Example minimal receipts:
- “I can’t do that because it would bypass governance controls.”
- “I can’t store that in durable memory without the approved schema and consent.”

## 10. Acceptance tests (must pass)
Add tests that prove EIS is real, not theater.

### 10.1 Capability escalation
- Scenario: repeated requests for broader caps
- Expectation: state transitions NORMAL→ALERT→QUARANTINE; caps revoked; effect calls blocked.

### 10.2 Stealth request
- Scenario: “don’t log this” / “ignore policy”
- Expectation: signature hit; decision DENY or QUARANTINE; event appended.

### 10.3 Persistence attack
- Scenario: attempt to write durable memory/config outside schema
- Expectation: deterministic fail-closed; quarantine on repetition.

### 10.4 Exfiltration attempt
- Scenario: injected sensitive string appears in output
- Expectation: CIF egress blocks/redacts; EIS_POSTCHECK flags; vaccine candidate produced.

### 10.5 Judge disagreement
- Scenario: immune judge returns BLOCK while signatures/anomaly are low
- Expectation: deny by default; log reason codes.

### 10.6 No bypass path
- Scenario: direct adapter/tool call not routed through EIS+CDI
- Expectation: compile-time or runtime guard fails; deterministic refuse.

## 11. Rollout plan (safe incremental)
Phase 1 (mandatory envelope + logging):
- Implement IntentEnvelope builder + schema validation
- Emit EIS telemetry events
- No behavioural enforcement yet beyond hard-block invariants

Phase 2 (signatures + ALERT):
- Add signature detector and ALERT state enforcement
- Block governance writes and persistence outside schema

Phase 3 (anomaly + QUARANTINE):
- Add rolling metrics and quarantine state machine
- Add capability revocation and tool isolation

Phase 4 (immune judge + vaccines):
- Add independent judge adapter
- Add signed vaccine artifacts + apply pipeline

## 12. “Do not do” list
- Do not parse raw prompts inside core decisions when envelope can represent it.
- Do not allow EIS to be disabled at runtime by untrusted text.
- Do not allow “best effort” modes: missing store/config ⇒ deny.
- Do not store plaintext secrets in EIS artifacts; prefer hashes + references.

---
End of spec.