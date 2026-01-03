# Governance Types (Canonical Contracts)

These are the minimum contracts required to prevent governance from becoming “vibes”.
Implementation language may differ; semantics MUST match.

---

## Envelope

Represents any inbound or outbound message at the boundary.

Fields:
- envelope_id: unique identifier
- source: http | grpc | ui | job | mesh | adapter
- received_at: monotonic timestamp or sequence
- raw: original payload (kept internal only)
- sanitized: CIF-sanitized payload or reference
- taint: labels (e.g. untrusted, user-supplied, mesh, tool-output)
- risk: risk class / action scope hints
- actor: authenticated identity context if known

---

## Intent

Canonical internal representation of what is being requested.

Fields:
- intent_id
- actor
- scope (route/interface/capability scope)
- operation (verb)
- params_ref (reference to sanitized params)
- taint
- risk
- needed_resolution: R0–R5
- requested_tools: list (optional)
- requested_memory: list (optional)

---

## Decision

Output of CDI evaluation.

Fields:
- decision_id
- outcome: ALLOW | DENY | REFUSE | DEGRADE | TRANSFORM
- transformed_intent_ref (optional)
- constraints:
  - allowed_tools + param constraints
  - allowed_memory_layers
  - output_constraints
- capability_tokens: list (optional)
- receipts:
  - minimal_receipt_ref
  - full_receipt_ref (optional internal)

---

## CapabilityToken

A signed, scoped permission to perform a specific action.

Fields:
- token_id
- actor
- scope
- tool_name (or memory operation)
- param_constraints
- posture_constraints
- credits_ceiling (optional)
- expiry
- signature

Rule:
- Adapters MUST verify signature and constraints before execution.

---

## Receipt

A tamper-evident record of what CDI decided and why.

Minimal receipt fields:
- receipt_id
- intent_id
- outcome
- policy_version (treaty hash / id)
- constraints summary
- timestamp/sequence
- signature (optional but recommended)

Full receipt fields (internal):
- evaluation trace (policy inputs/outputs)
- references to evidence used
- deny reasons or downgrade reasons
- tool calls permitted/denied
- redaction directives
