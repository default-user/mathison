# Mathison Semantic Formula
## Mathematical Equation Using Semantic Literal Descriptors

### The Mathison Kernel Transition Function

```
𝕄athison(user_intent_at_time_t; system_state_at_time_t) :=

  let validated_user_request =
    INPUT_VALIDATION_GATEWAY(
      user_intent_at_time_t;
      system_state_at_time_t
    ) in

  let action_decision =
    GOVERNANCE_ACTION_GATEKEEPER(
      validated_user_request;
      system_state_at_time_t
    ) ∈ {ALLOW, DENY, DEGRADE} in

  let intermediate_result =
    if action_decision ≠ ALLOW then action_decision
    else
      let (
        skill_execution_chain,
        required_capability_tokens,
        knowledge_grounding_plan,
        evidence_provenance_plan
      ) = INTENT_TO_EXECUTION_ROUTER(
        validated_user_request,
        conversational_context,
        current_posture_level,
        data_sensitivity_labels(validated_user_request),
        world_knowledge_pack_state,
        learning_geometry_profile(profile_store_at_time_t)
      ) in
      SKILL_CHAIN_ORCHESTRATOR(
        skill_execution_chain;
        system_state_at_time_t
      ) in

  let output_decision =
    if action_decision ≠ ALLOW then intermediate_result
    else
      let independent_governance_votes =
        { GOVERNANCE_ACTION_GATEKEEPER(
            intermediate_result;
            system_state_at_time_t
          ) }_{vote_index = 1 to ensemble_size} in
      CONSENSUS_AGGREGATOR(independent_governance_votes) in

  let shaped_user_response =
    OUTPUT_SHAPING_GATEWAY(
      output_decision;
      system_state_at_time_t
    ) in

  let updated_system_state =
    STATE_UPDATER(
      system_state_at_time_t,
      shaped_user_response
    ) in

  let next_user_intent =
    CONVERSATION_CONTINUATOR(
      updated_system_state,
      shaped_user_response
    ) in

  (next_user_intent, updated_system_state, shaped_user_response)
```

---

### Multi-Turn System Equation

```
𝕄athison_over_conversation_turns(
  initial_user_intent;
  initial_system_state
) :=
  response_projection ∘
  ITERATE_UNTIL_CONVERSATION_HALT^maximum_turns(
    𝕄athison_kernel
  )(
    initial_user_intent,
    initial_system_state
  )
```

---

### System State Decomposition

```
system_state := ⟨
  identity_capsule,
  authority_capsule,
  governance_capsule,
  world_knowledge_pack,
  semantic_indexes,
  communication_buses,
  user_profile_store,
  audit_receipt_ledger,
  current_posture_level,
  active_capability_tokens,
  adapter_registry,
  model_bus,
  tool_bus,
  declassification_ledger,
  governing_axioms
⟩
```

Where:

| Semantic Component | Mathematical Binding | Purpose |
|--------------------|---------------------|---------|
| **identity_capsule** | Instance ID + Principal ID + Lineage | Who is requesting |
| **authority_capsule** | Authority Chain + STOP Dominance | Who has permission |
| **governance_capsule** | Hard Constraints + Posture Levels + Gate Pipeline | What is allowed |
| **world_knowledge_pack** | Repository + Docs + Tests + Manifests + Logs | Available knowledge |
| **semantic_indexes** | Symbol Graph + Governance Map + Test Matrix + Receipt Ledger | Structured access |
| **communication_buses** | Model Bus + Tool Bus | Mediated I/O channels |
| **user_profile_store** | Includes Learning Geometry Profile | User context |
| **audit_receipt_ledger** | Append-only hash-chained log | Immutable audit trail |
| **current_posture_level** | ∈ {P0, P1, P2, P3, P4} | Safety constraint level |
| **active_capability_tokens** | Scoped + TTL + Posture Bounds | Runtime permissions |
| **adapter_registry** | Signed + Tiered Enforcement | Trusted adapters |
| **model_bus** | Oracle mediation layer | Model invocation path |
| **tool_bus** | Allowlisted tools | Tool invocation path |
| **declassification_ledger** | Logged privacy widening | Information flow tracking |
| **governing_axioms** | Mediation + Path + Fail-Closed | Immutable invariants |

---

### Core Function Semantics

#### INPUT_VALIDATION_GATEWAY(user_intent; system_state)
```
INPUT_VALIDATION_GATEWAY :=
  schema_validator ∘
  size_limit_enforcer ∘
  injection_taint_detector ∘
  data_sensitivity_labeler ∘
  user_consent_verifier ∘
  request_sanitizer
```

**Constraints:**
- Schema must validate against expected format
- Size must be ≤ configured_maximum
- Must not contain XSS/SQL injection patterns
- Must pass consent check against authority capsule

---

#### GOVERNANCE_ACTION_GATEKEEPER(request; system_state)
```
GOVERNANCE_ACTION_GATEKEEPER(request; system_state) :=
  let governance_capsule_status =
    CAPSULE_VERIFIER(governance_capsule) in
  let requested_operation_risk_class =
    RISK_CLASSIFIER(request) in
  let permission_granted =
    PERMISSION_CHECKER(
      identity_capsule,
      authority_capsule,
      requested_operation
    ) in

  DEGRADATION_DECIDER(
    governance_capsule_status,
    requested_operation_risk_class,
    permission_granted
  ) → {ALLOW, DENY, DEGRADE}
```

**Degradation Logic:**
```
DEGRADATION_DECIDER :=
  match (capsule_status, risk_class, has_permission):
    (VALID, _, true)           → ALLOW
    (VALID, _, false)          → DENY
    (STALE, read_only, true)   → ALLOW
    (STALE, low_risk, true)    → ALLOW
    (STALE, medium_risk, _)    → DENY
    (STALE, high_risk, _)      → DENY
    (MISSING, read_only, true) → ALLOW
    (MISSING, *, _)            → DENY
```

---

#### INTENT_TO_EXECUTION_ROUTER(request, context, posture, labels, world_pack, learning_profile)
```
INTENT_TO_EXECUTION_ROUTER :=
  let intent_classification =
    INTENT_CLASSIFIER(request, context) in
  let required_knowledge_sources =
    KNOWLEDGE_RESOLVER(
      intent_classification,
      world_pack,
      learning_profile
    ) in
  let skill_chain =
    SKILL_CHAIN_PLANNER(
      intent_classification,
      posture,
      labels,
      required_knowledge_sources
    ) in
  let capability_requirements =
    CAPABILITY_EXTRACTOR(skill_chain) in
  let grounding_plan =
    GROUNDING_PLANNER(
      required_knowledge_sources,
      world_pack
    ) in
  let evidence_plan =
    EVIDENCE_TRACER(skill_chain) in

  (skill_chain, capability_requirements, grounding_plan, evidence_plan)
```

---

#### SKILL_CHAIN_ORCHESTRATOR(skill_chain; system_state)
```
SKILL_CHAIN_ORCHESTRATOR(skill_chain; system_state) :=
  FOLD_LEFT(
    skill_chain,
    initial_artifact := ∅,
    λ(accumulated_artifact, current_skill) →
      let capability_gate_result =
        CAPABILITY_GATE_CHECK(
          current_skill.required_capabilities,
          active_capability_tokens
        ) in
      if capability_gate_result ≠ PASS then HALT_WITH_DENIAL
      else
        SINGLE_EXECUTION_HANDLER(
          current_skill,
          accumulated_artifact,
          system_state
        )
  )
```

**Invariant:** All skill execution MUST flow through SINGLE_EXECUTION_HANDLER (no bypass).

---

#### SINGLE_EXECUTION_HANDLER(skill, artifact, system_state)
```
SINGLE_EXECUTION_HANDLER :=
  let valid_capability_token =
    CAPABILITY_TOKEN_MINTER(
      skill.scope,
      skill.time_to_live,
      current_posture_level,
      workspace_bounds
    ) in
  let adapter =
    ADAPTER_RESOLVER(
      skill.type,
      adapter_registry
    ) in
  let execution_result =
    ADAPTER_DISPATCHER(
      adapter,
      skill.parameters,
      valid_capability_token,
      model_bus ∪ tool_bus
    ) in
  let provenance_receipt =
    RECEIPT_GENERATOR(
      skill,
      execution_result,
      valid_capability_token.digest
    ) in
  RECEIPT_LOGGER(audit_receipt_ledger, provenance_receipt);
  execution_result
```

**Critical Constraints:**
1. `valid_capability_token` must have capability type matching skill type
2. `valid_capability_token.expires_at` > current_timestamp
3. `valid_capability_token.oi_id` matches request namespace OR is '*'
4. All execution logged to `audit_receipt_ledger` (append-only, hash-chained)

---

#### OUTPUT_SHAPING_GATEWAY(result; system_state)
```
OUTPUT_SHAPING_GATEWAY :=
  capability_expiry_validator ∘
  namespace_leakage_detector ∘
  redaction_rule_applier ∘
  content_filter ∘
  leak_budget_enforcer ∘
  format_validator ∘
  audit_metadata_packager
```

**Leak Budget:**
```
leak_budget_enforcer(output, posture) :=
  let privacy_widening_cost =
    PRIVACY_WIDENING_CALCULATOR(output, posture) in
  if privacy_widening_cost > posture.max_leak_budget then
    REDACT_UNTIL_COMPLIANT(output, posture.max_leak_budget)
  else
    LOG_DECLASSIFICATION(output, privacy_widening_cost);
    output
```

---

### The ONE_PATH_LAW Invariant

```
∀ request ∈ user_intents:
  side_effects(request) ⇒
    ∃! execution_path:
      execution_path =
        INPUT_VALIDATION_GATEWAY ⇝
        GOVERNANCE_ACTION_GATEKEEPER ⇝
        SINGLE_EXECUTION_HANDLER ⇝
        GOVERNANCE_OUTPUT_GATEKEEPER ⇝
        OUTPUT_SHAPING_GATEWAY
```

**English:** Every request that produces side effects MUST flow through exactly one execution path with no bypasses.

**Type-Level Enforcement:**
```
CIF_INGRESS_TOKEN → CDI_ACTION_TOKEN → CAPABILITY_TOKEN → CDI_OUTPUT_TOKEN → CIF_EGRESS_TOKEN
```
Each token is a branded type that can ONLY be constructed by passing through the previous stage.

---

### The FAIL_CLOSED Axiom

```
∀ decision_point ∈ governance_decisions:
  governance_state(decision_point) ∉ {VALID, EXPLICITLY_ALLOWED} ⇒
    decision(decision_point) = DENY
```

**English:** Absence of explicit permission is denial. Unknown is always DENY.

---

### The MEDIATION_PATH Axiom

```
∀ io_operation ∈ {model_calls, tool_calls}:
  io_operation.executed ⇒
    ∃ adapter ∈ adapter_registry:
      ∃ capability_token ∈ active_capability_tokens:
        adapter.verify(capability_token) = VALID ∧
        audit_receipt_ledger.logged(io_operation, capability_token.digest)
```

**English:** All model/tool I/O MUST be mediated through registered adapters with valid capability tokens and complete audit trail.

---

### The STOP_DOMINANCE Axiom

```
∀ time_t:
  user_revokes_consent_at(time_t) ⇒
    ∀ capability_token ∈ active_capability_tokens:
      capability_token.status := REVOKED ∧
      all_in_flight_operations_at(time_t) := PREEMPTED
```

**English:** User consent revocation immediately revokes all capabilities and preempts all operations.

---

### Posture Level Semantics

```
posture_constraints := {
  P0 → {
    allowed_operations: {answer_generation},
    tool_calls: FORBIDDEN,
    file_writes: FORBIDDEN,
    model_invocations: LIMITED_TO_RESPONSE_GENERATION
  },
  P1 → {
    allowed_operations: {oracle_reads, retrieval, provenance_citations},
    tool_calls: {repo_reader, doc_renderer},
    file_writes: FORBIDDEN,
    internet: DENIED,
    must_ground_claims: true
  },
  P2 → {
    allowed_operations: P1.allowed_operations ∪ {proposal_writes},
    tool_calls: P1.tool_calls ∪ {patch_stager},
    file_writes: STAGED_ONLY,
    artifacts: PROPOSAL_STATUS
  },
  P3 → {
    allowed_operations: P2.allowed_operations ∪ {allowlisted_execution},
    tool_calls: P2.tool_calls ∪ {test_runner, static_analysis, index_builder},
    file_writes: SCOPED_WORKSPACE_ONLY,
    execution: {tests, linters, builds, indexers}
  },
  P4 → {
    allowed_operations: P3.allowed_operations ∪ {high_assurance_disclosure},
    leak_budget: STRICT,
    conformance_probes: ENHANCED,
    audit_level: MAXIMUM
  }
}
```

---

### Capability Token Algebra

```
capability_token := ⟨
  token_id,
  capability_type ∈ {model_invocation, tool_execution, file_write, ...},
  scope := {allowed_operations},
  time_to_live,
  issued_at_timestamp,
  expires_at_timestamp := issued_at_timestamp + time_to_live,
  posture_bounds := [minimum_posture, maximum_posture],
  workspace_bounds := {allowed_paths},
  namespace_id,
  principal_id,
  cryptographic_digest
⟩
```

**Token Validity:**
```
is_valid(token, current_time, current_posture, requested_operation) :=
  token.expires_at_timestamp > current_time ∧
  current_posture ∈ [token.posture_bounds.min, token.posture_bounds.max] ∧
  requested_operation ∈ token.scope ∧
  requested_operation.workspace_path ⊆ token.workspace_bounds
```

---

### The Complete System Identity

```
𝕄athison := ⟨𝕄athison_kernel, ONE_PATH_LAW, FAIL_CLOSED, MEDIATION_PATH, STOP_DOMINANCE⟩

where:
  𝕄athison_kernel ≡ Φ(user_intent, system_state) → (next_intent, next_state, response)
  ONE_PATH_LAW ≡ ∀ side_effects ⇒ unique_governed_path
  FAIL_CLOSED ≡ unknown ⇒ deny
  MEDIATION_PATH ≡ ∀ io ⇒ adapter ∧ capability ∧ logged
  STOP_DOMINANCE ≡ user_revokes ⇒ immediate_halt
```

---

### Governing Values Encoded

```
governing_values := {
  CARE_FIRST → human_constraints_are_first_class_inputs,
  TRUTHFULNESS → claims_must_be_grounded_or_labeled_uncertain,
  PRIVACY_MINIMIZATION → minimize_information_widening,
  BOUNDED_AGENCY → no_unbounded_autonomy_without_oversight,
  AUDITABILITY → all_operations_receipt_logged,
  FAIL_CLOSED_SAFETY → absence_of_permission_is_denial,
  PROVENANCE_OVER_VIBES → evidence_required_for_authoritative_claims,
  STANSPACE_GROWTH_DISCIPLINE → learning_geometry_as_load_bearing_discipline
}
```

---

## Summary

**Mathison** is the equation:

```
𝕄athison(intent; state) =
  (next_intent, next_state, response)

where every transition is:
  INPUT_VALIDATED ⇝
  GOVERNANCE_GATED ⇝
  CAPABILITY_MEDIATED ⇝
  GOVERNANCE_VERIFIED ⇝
  OUTPUT_SHAPED

under invariants:
  ONE_PATH_LAW ∧
  FAIL_CLOSED ∧
  MEDIATION_PATH ∧
  STOP_DOMINANCE
```

Every operation is:
- **Validated** before entry
- **Authorized** before action
- **Mediated** through adapters
- **Verified** before output
- **Logged** for auditability
- **Bounded** by capabilities
- **Revocable** by user

This is the semantic formula of Mathison.
