# Mathison Crystal Implementation Roadmap

**Target**: Complete implementation of MATHISON_ORACLE_OI_MONOLITH v1.1.0 crystal specification
**Current**: v2.2.0 (Foundation + Model Bus)
**Document Version**: 1.0
**Date**: 2026-01-19

## Executive Summary

This roadmap defines a staged implementation plan to complete Mathison to the full crystal specification (MATHISON_ORACLE_OI_MONOLITH v1.1.0). The implementation is organized into 7 major stages with clear dependencies, acceptance criteria, and build priorities.

**Estimated Scope**: ~18-24 months of focused development
**Critical Path**: Identity → World Pack → Skill Lattice → Stan-space
**Current Completion**: ~15% (Foundation only)

---

## Gap Analysis: v2.2 vs Crystal Specification

### ✅ Currently Implemented (v2.2)

| Component | Status | Coverage |
|-----------|--------|----------|
| Unified Pipeline (CIF/CDI) | ✅ Complete | 100% |
| ONE_PATH_LAW Enforcement | ✅ Complete | 100% |
| Fail-Closed Governance | ✅ Complete | 95% |
| Memory Store (PG/SQLite) | ✅ Complete | 90% |
| Adapter Gateway | ✅ Complete | 85% |
| Model Bus (OpenAI/Anthropic) | ✅ Complete | 80% |
| Namespace Isolation | ✅ Complete | 95% |
| Capability Tokens | ✅ Complete | 90% |

### ❌ Missing from Crystal Specification

| Component | Priority | Complexity | Dependency Chain |
|-----------|----------|-----------|------------------|
| **Identity System** | P0 | High | None (foundation) |
| IdentityCapsule | P0 | Medium | None |
| AuthorityCapsule | P0 | High | Identity |
| Rekey Ritual | P1 | Medium | Authority |
| Nascent Boot | P0 | High | Identity + Authority |
| **World Pack Indexes** | P0 | Very High | Identity |
| SymbolGraph | P0 | High | None |
| GovernanceMap | P0 | High | Pipeline |
| InvariantLedger | P0 | Medium | Tests |
| TestMatrix | P1 | Medium | Tests + Invariants |
| DependencyDAG | P1 | Medium | Packages |
| ReceiptLedger | P0 | High | Pipeline |
| StanSpaceIndex | P1 | Very High | Stan-space |
| **Skill Lattice** | P1 | Very High | World Pack |
| SkillCrystal Registry | P1 | High | None |
| Router (intent→chain) | P1 | Very High | Registry |
| Composer | P1 | Very High | Router |
| Core Skills (9 required) | P1 | Very High | Router + Composer |
| **Stan-space** | P1 | Very High | World Pack |
| StanConceptMap | P1 | High | None |
| StanLearnerProfile | P1 | High | ProfileStore |
| StanTrajectoryPlanner | P1 | High | ConceptMap + Profile |
| StanUpdateProtocol | P1 | Medium | Profile + Receipts |
| Stan Conformance Suite | P1 | High | All Stan components |
| **Modes** | P2 | Medium | World Pack |
| AIRLOCK_MODE | P2 | Medium | Pipeline + Receipts |
| **Tool Bus** | P2 | High | Adapter Gateway |
| Tool Adapters (7 classes) | P2 | High | Capabilities |
| **Evidence & Conformance** | P0 | Very High | All components |
| TCB_MANIFEST Signing | P0 | High | Crypto |
| AdapterRegistry Signing | P0 | Medium | Adapters |
| Property Tests | P0 | High | All components |
| Mutation Tests | P0 | High | Tests |
| Leak-Budget Probes | P1 | High | CIF/CDI |
| Full Conformance Suites | P0 | Very High | All components |

**Total Missing Components**: 38 major components across 7 categories

---

## Staged Implementation Plan

### Stage 0: Foundation Hardening (v2.2 → v2.3)
**Duration**: 2-3 months
**Goal**: Harden existing foundation, complete conformance testing
**Build Priority**: 0 (blocks all other work)

#### Tasks

1. **Complete ONE_PATH_LAW Conformance**
   - ✅ Core enforcement (done)
   - ⬜ Property-based tests with fast-check
   - ⬜ Mutation testing for pipeline stages
   - ⬜ Formal state machine verification
   - **Acceptance**: All 14 ONE_PATH_LAW tests pass + property tests

2. **Receipt Ledger Foundation**
   - ⬜ Implement tamper-evident hash chain
   - ⬜ Append-only log backend (PostgreSQL)
   - ⬜ Receipt verification at each stage
   - ⬜ Merkle root generation (optional)
   - **Acceptance**: All receipts logged, chain verified, no gaps

3. **Governance Capsule Hardening**
   - ⬜ Capsule signature verification
   - ⬜ TTL management with stale detection
   - ⬜ Cache invalidation on STOP
   - ⬜ Deterministic resolver audit
   - **Acceptance**: Fail-closed tests pass at 100%

4. **Adapter Registry Enforcement**
   - ⬜ Signed adapter registry
   - ⬜ Tiering enforcement (T0-T3)
   - ⬜ Posture constraints per adapter
   - ⬜ No-bypass validation in CI
   - **Acceptance**: Adapter bypass tests pass + CI enforcement

**Deliverables**:
- Receipt ledger with hash chain
- Hardened governance capsule loader
- Signed adapter registry
- 100% ONE_PATH_LAW conformance
- Mutation test suite

**Success Criteria**:
- All existing tests pass at 100%
- Mutation testing shows <5% escaped mutants
- Property tests run 10k iterations without failure
- CI enforces all invariants

---

### Stage 1: Identity & Authority (v2.3 → v2.4)
**Duration**: 3-4 months
**Goal**: Cryptographically-bound identity with principal authority
**Build Priority**: 0 (foundation for all governance)

#### Tasks

1. **Identity Capsule**
   - ⬜ `IdentityCapsule` schema + Zod validation
   - ⬜ `instance_id`, `instance_name`, `principal_id` fields
   - ⬜ Lineage tracking: `["MATHISON_ORACLE_OI_MONOLITH@1.1.0"]`
   - ⬜ Continuity contract enforcement
   - ⬜ Storage in ProfileStore with encryption
   - **Acceptance**: Identity capsule created on nascent boot

2. **Authority Capsule**
   - ⬜ `AuthorityCapsule` schema + validation
   - ⬜ Authority chain: `principal_id → OI`
   - ⬜ Root authority verification
   - ⬜ STOP preemption enforcement
   - ⬜ Rekey ritual (signed RekeyCapsule)
   - **Acceptance**: Authority verified on every request

3. **Cryptographic Binding**
   - ⬜ Public-key fingerprint for principal_id
   - ⬜ Signature verification for capsules
   - ⬜ Key rotation support (rekey ritual)
   - ⬜ Receipt signing with principal key
   - **Acceptance**: All capsules cryptographically signed

4. **Nascent Boot Process**
   - ⬜ First-run initialization flow
   - ⬜ Creates: Identity + Authority + Governance + WorldPackBinding
   - ⬜ Principal consent ceremony
   - ⬜ Seed data generation
   - **Acceptance**: Clean boot creates all capsules

5. **WorldPackBinding**
   - ⬜ Bind OI instance to repo snapshot
   - ⬜ Commit hash + timestamp binding
   - ⬜ Truth domain declaration
   - ⬜ Refresh protocol on code change
   - **Acceptance**: OI knows its source-of-truth repo state

**Deliverables**:
- Identity capsule with continuity
- Authority capsule with cryptographic binding
- Nascent boot CLI command
- Rekey ritual implementation
- WorldPackBinding mechanism

**Success Criteria**:
- Identity created and persisted on first run
- Authority verified on all requests
- STOP revokes immediately (verified by tests)
- Rekey ceremony works with full audit trail

---

### Stage 2: World Pack Indexes (v2.4 → v2.5)
**Duration**: 4-6 months
**Goal**: Build comprehensive indexes of codebase, governance, invariants, tests
**Build Priority**: 1 (enables oracle mode queries)

#### Tasks

1. **SymbolGraph Index**
   - ⬜ Parse TypeScript AST for all packages
   - ⬜ Extract: types, functions, classes, modules
   - ⬜ Build call graph
   - ⬜ Track API surface
   - ⬜ Ownership map (files → maintainers)
   - ⬜ Incremental rebuild on file change
   - **Acceptance**: `mathison oracle query "where is createPipeline defined?"` → precise answer

2. **GovernanceMap Index**
   - ⬜ Map CIF→CDI→Handler→CDI→CIF flow for all intents
   - ⬜ Track enforcement sites (where checks happen)
   - ⬜ Link invariants to enforcement code
   - ⬜ Proof points for each governance rule
   - **Acceptance**: `mathison oracle query "how is intent X governed?"` → full pipeline trace

3. **InvariantLedger Index**
   - ⬜ Extract all "must-hold" properties from specs
   - ⬜ Link invariants to enforcement sites in code
   - ⬜ Link invariants to test coverage
   - ⬜ Track violation history
   - **Acceptance**: All invariants tracked, linked to code + tests

4. **TestMatrix Index**
   - ⬜ Parse all test files
   - ⬜ Map invariants → tests
   - ⬜ Identify coverage gaps
   - ⬜ Track test pass/fail history
   - **Acceptance**: Coverage report shows invariants → tests mapping

5. **DependencyDAG Index**
   - ⬜ Parse package.json dependencies
   - ⬜ Build dependency graph
   - ⬜ Assign trust tiers (T0-T3)
   - ⬜ Detect circular dependencies
   - **Acceptance**: `mathison oracle query "what depends on @mathison/pipeline?"` → full list

6. **Index Builder Tool**
   - ⬜ CLI: `mathison index rebuild [index-name]`
   - ⬜ Watch mode: auto-rebuild on file change
   - ⬜ Incremental updates (delta only)
   - ⬜ Receipt logging for index updates
   - **Acceptance**: All indexes build in <30s, incremental in <5s

**Deliverables**:
- 5 production indexes (Symbol, Governance, Invariant, Test, Dependency)
- Index builder CLI
- File watcher integration
- Oracle query interface

**Success Criteria**:
- All indexes build without errors
- Queries return accurate results in <1s
- Incremental updates work correctly
- Index integrity verified by tests

---

### Stage 3: ORACLE_MODE & Grounding (v2.5 → v2.6)
**Duration**: 2-3 months
**Goal**: Oracle queries with provenance-grounded answers
**Build Priority**: 1 (core OI capability)

#### Tasks

1. **Oracle Query Handler**
   - ⬜ New intent: `oracle.query`
   - ⬜ Input: natural language question
   - ⬜ Output: answer + citations + confidence
   - ⬜ Uses World Pack indexes for grounding
   - **Acceptance**: Queries answered with file:line citations

2. **Grounding Engine**
   - ⬜ Parse question → identify target (code/doc/governance)
   - ⬜ Search indexes for relevant artifacts
   - ⬜ Rank by relevance
   - ⬜ Generate provenance-backed answer
   - ⬜ Mark GROUNDED / SYNTHESIS / UNCERTAIN
   - **Acceptance**: All claims cite world-pack artifacts

3. **Truth Marking System**
   - ⬜ GROUNDED: cites world-pack or KB
   - ⬜ SYNTHESIS: design/idea, explains grounding path
   - ⬜ UNCERTAIN: insufficient evidence, requests input
   - ⬜ Apply to all outputs
   - **Acceptance**: Every output has truth mark

4. **Oracle Knowledge Base (Embedded)**
   - ⬜ Distill Governance Proof Book v1.5 → structured KB
   - ⬜ Axioms (A1-A21)
   - ⬜ Invariants (I1-I6)
   - ⬜ Theorems (T1-T13)
   - ⬜ Query interface for KB
   - **Acceptance**: Oracle can cite axioms/invariants from KB

5. **ORACLE_MODE Enforcement**
   - ⬜ Default mode: internet DENIED
   - ⬜ Truth claims require World Pack grounding
   - ⬜ Uncertainty marked explicitly
   - ⬜ No substitution of model memory for truth
   - **Acceptance**: Oracle mode tests pass 100%

**Deliverables**:
- Oracle query handler with grounding
- Truth marking system
- Embedded governance KB
- ORACLE_MODE enforcement

**Success Criteria**:
- Queries about Mathison answered with citations
- No hallucinated file paths or functions
- Truth marks applied consistently
- Oracle golden tests pass

---

### Stage 4: Skill Lattice Foundation (v2.6 → v2.7)
**Duration**: 4-6 months
**Goal**: SkillCrystal registry, router, composer for multi-step work
**Build Priority**: 1 (enables complex tasks)

#### Tasks

1. **SkillCrystal Schema**
   - ⬜ Define SkillCrystal data format
   - ⬜ Fields: IO schema, system contract, safety limits, tests, adapters
   - ⬜ Registry storage (database + index)
   - ⬜ Versioning and lineage
   - **Acceptance**: SkillCrystal schema validated

2. **Router (Intent → Skill Chain)**
   - ⬜ Input: user_text + context + posture + risk + world_pack_state
   - ⬜ Output: skill_chain + confidence + capabilities + grounding_plan
   - ⬜ Policies:
     - Mathison queries → oracle chain
     - Uncertainty/high-stakes → critic + auditor
     - Learning → StanSpace coach
   - ⬜ Router uses model for intent classification
   - **Acceptance**: Intents correctly routed to skill chains

3. **Composer (Plan Decomposition)**
   - ⬜ Decompose plan into steps
   - ⬜ Manage intermediate artifacts
   - ⬜ Run invariant checks per step
   - ⬜ Enforce capability/consent gates
   - ⬜ Synthesize with provenance + truth marking
   - **Acceptance**: Multi-step plans execute correctly

4. **Mandatory Core Skills (9 Skills)**
   - ⬜ MATHISON_ORACLE_QUERY - provenance-grounded queries
   - ⬜ MATHISON_GOVERNANCE_AUDITOR - governance checks
   - ⬜ ARCHITECT_SYSTEMS - system design
   - ⬜ CODE_ENGINEER - code implementation
   - ⬜ TEST_ENGINEER - test writing
   - ⬜ DOC_WRITER - documentation
   - ⬜ SECURITY_DEFENDER - security analysis
   - ⬜ INCIDENT_ANALYST - debugging
   - ⬜ CRITIC_REDTEAM - critique and red team
   - **Acceptance**: All 9 core skills implemented and tested

5. **Skill Registry (Initial 50 Skills)**
   - ⬜ Target: 50 skills for v2.7 (1% of 1e3-1e4 target)
   - ⬜ Cover: queries, coding, testing, docs, security, analysis
   - ⬜ Each skill: IO schema + contract + limits + tests
   - ⬜ Registry management: add, update, deprecate
   - **Acceptance**: 50 skills registered, working, tested

**Deliverables**:
- SkillCrystal registry with 50 skills
- Router for intent → skill chain
- Composer for multi-step execution
- 9 mandatory core skills

**Success Criteria**:
- Router correctly classifies 95%+ of intents
- Composer executes multi-step plans without bypass
- All core skills tested and working
- Skill registry indexed and queryable

---

### Stage 5: Stan-space Implementation (v2.7 → v2.8)
**Duration**: 4-6 months
**Goal**: Learning geometry with evidence-based scaffolding
**Build Priority**: 1 (core OI competence per spec)

#### Tasks

1. **StanConceptMap**
   - ⬜ Define Stan vector representation (what dimensions?)
   - ⬜ Map concepts → Stan requirement vectors
   - ⬜ Storage: concept → vector mapping
   - ⬜ Query: "what are Stan requirements for X?"
   - **Acceptance**: ConceptMap built for 100+ Mathison concepts

2. **StanLearnerProfile**
   - ⬜ Principal-consented learner profile
   - ⬜ Stan vector + evidence links
   - ⬜ Storage in ProfileStore (privacy-minimized)
   - ⬜ Update protocol: evidence-backed, logged, reversible
   - ⬜ STOP blocks profile updates
   - **Acceptance**: Profile created with consent, updates logged

3. **StanTrajectoryPlanner**
   - ⬜ Input: current profile + target concept
   - ⬜ Output: learning path with gradient logic
   - ⬜ Distance calculation in Stan-space
   - ⬜ Path selection by difficulty gradient
   - **Acceptance**: Planner generates sensible learning paths

4. **StanUpdateProtocol**
   - ⬜ Evidence-backed updates only
   - ⬜ Logged in receipt ledger
   - ⬜ Reversible (rollback support)
   - ⬜ Consent-respecting (no updates without permission)
   - **Acceptance**: Profile updates follow protocol, logged, auditable

5. **Stan Invariants Enforcement**
   - ⬜ I_STAN_GROUNDED_SCAFFOLD - teaching references Stan
   - ⬜ I_STAN_PROFILE_CONSENT - updates require consent
   - ⬜ I_STAN_NO_OVERCLAIM - no mastery claims without evidence
   - **Acceptance**: All 3 Stan invariants enforced by tests

6. **StanSpace Index**
   - ⬜ Integrate with World Pack indexes
   - ⬜ StanConceptMap queryable
   - ⬜ StanPathLibrary with difficulty gradients
   - ⬜ StanLearnerProfile indexed per principal
   - **Acceptance**: StanSpace fully indexed and queryable

7. **STANSPACE_COACH Skill**
   - ⬜ One of the 9 mandatory core skills
   - ⬜ Uses StanSpace for all teaching/coaching
   - ⬜ References current profile + target + path
   - ⬜ Evidence-based progress tracking
   - **Acceptance**: Coaching uses Stan, no generic advice

8. **Stan Conformance Suite**
   - ⬜ concept_vector_consistency_tests
   - ⬜ trajectory_gradient_tests
   - ⬜ profile_update_evidence_tests
   - ⬜ consent_stop_profile_write_tests
   - ⬜ no_overclaim_mastery_tests
   - **Acceptance**: All Stan conformance tests pass

**Deliverables**:
- StanConceptMap with 100+ Mathison concepts
- StanLearnerProfile storage + protocol
- StanTrajectoryPlanner
- StanSpace index in World Pack
- STANSPACE_COACH skill
- Stan conformance suite

**Success Criteria**:
- Stan geometry mathematically sound
- Learning paths show valid gradients
- Profile updates logged with evidence
- No mastery claims without proof
- Conformance suite passes 100%

---

### Stage 6: Tool Bus & AIRLOCK_MODE (v2.8 → v2.9)
**Duration**: 3-4 months
**Goal**: Expand tool capabilities, add external source import
**Build Priority**: 2 (enhances capability)

#### Tasks

1. **Tool Adapter Classes**
   - ⬜ `repo_reader` - read code, search, diff, symbol lookup
   - ⬜ `patch_stager` - write workspace, generate/apply patches
   - ⬜ `test_runner` - unit, integration, fuzz tests
   - ⬜ `static_analysis` - lint, typecheck, dep audit
   - ⬜ `doc_renderer` - markdown to PDF, diagrams
   - ⬜ `index_builder` - rebuild indexes
   - ⬜ `stan_evaluator` - exercise generation + grading
   - **Acceptance**: All 7 tool classes implemented, tested

2. **Tool Adapter Registry**
   - ⬜ Signed registry like model adapters
   - ⬜ Tiering (T0-T3)
   - ⬜ Posture constraints per adapter
   - ⬜ Capability enforcement
   - **Acceptance**: Tool adapters require capability tokens

3. **AIRLOCK_MODE**
   - ⬜ Purpose: auditable import of external sources
   - ⬜ Requirements:
     - Principal explicit enable
     - Domain allowlist
     - Read-only retrieval
     - Full receipts + provenance
   - ⬜ Imported content → SourceCapsule in World Pack
   - ⬜ Auto-return to ORACLE_MODE after import
   - **Acceptance**: External sources imported with full audit trail

4. **SourceCapsule Schema**
   - ⬜ Contains imported external content
   - ⬜ Signed with provenance (URL, timestamp, hash)
   - ⬜ Stored in World Pack
   - ⬜ Queryable by oracle
   - **Acceptance**: Imported sources become first-class artifacts

5. **Mode Management**
   - ⬜ `mathison mode status` - show current mode
   - ⬜ `mathison mode airlock --enable --domain=example.com` - enter airlock
   - ⬜ Auto-return to ORACLE_MODE after import
   - ⬜ Receipt logging for mode transitions
   - **Acceptance**: Mode transitions governed and logged

**Deliverables**:
- 7 tool adapter classes
- Signed tool adapter registry
- AIRLOCK_MODE implementation
- SourceCapsule schema + storage
- Mode management CLI

**Success Criteria**:
- Tool adapters tested and working
- AIRLOCK imports with full provenance
- Mode transitions logged
- No free browsing or hidden network calls

---

### Stage 7: Evidence Pack & Full Conformance (v2.9 → v3.0)
**Duration**: 6-9 months
**Goal**: Production-grade conformance, full evidence pack
**Build Priority**: 0 (gates production release)

#### Tasks

1. **TCB_MANIFEST Signing**
   - ⬜ Self-audit: enumerate all loaded IO primitives/modules
   - ⬜ Generate signed TCB_MANIFEST
   - ⬜ Verify manifest on boot (mismatch → fail-closed)
   - ⬜ Canary detection for UNKNOWN_IO
   - **Acceptance**: TCB fully enumerated, signed, verified

2. **Property-Based Testing (All Components)**
   - ⬜ Pipeline stages: property tests with fast-check
   - ⬜ Governance: property tests for CIF/CDI
   - ⬜ Memory: property tests for isolation
   - ⬜ Adapters: property tests for capability enforcement
   - ⬜ Stan-space: property tests for geometry consistency
   - **Acceptance**: 10k+ property test iterations pass

3. **Mutation Testing (All Components)**
   - ⬜ Pipeline: mutation tests (target: <5% escape)
   - ⬜ Governance: mutation tests for fail-closed
   - ⬜ Adapters: mutation tests for bypass detection
   - ⬜ Stan-space: mutation tests for invariants
   - **Acceptance**: <5% escaped mutants across all components

4. **Algebra Dual Implementation**
   - ⬜ Implement label algebra (taint, IP) in two independent ways
   - ⬜ Crosscheck results on every operation
   - ⬜ Mismatch → quarantine + alert
   - ⬜ Mutation tests for algebra
   - **Acceptance**: Dual-impl catches label algebra bugs

5. **Declassify Protocol**
   - ⬜ Proof-carrying declassification
   - ⬜ Replay protection
   - ⬜ Optional two-man rule
   - ⬜ Logged in DeclassifyLedger
   - **Acceptance**: Declassify requires proof, logged, auditable

6. **Leak-Budget Conformance Probes**
   - ⬜ Define leak budgets per posture
   - ⬜ Runtime probes measure actual leakage
   - ⬜ Log probe results
   - ⬜ Alert on budget violation
   - **Acceptance**: Leak budgets enforced, probes logged

7. **Full Conformance Suites**
   - ⬜ refusal_goldens - test hard constraints
   - ⬜ oracle_grounding_goldens - test provenance
   - ⬜ capability_scope_tests - test token enforcement
   - ⬜ stop_preemption_tests - test STOP dominance
   - ⬜ manifest_self_audit_tests - test TCB enumeration
   - ⬜ algebra_property_and_mutation_tests - test label algebra
   - ⬜ declassify_protocol_tests - test declassification
   - ⬜ leak_budget_conformance_probes - test leak budgets
   - ⬜ stanspace_conformance_suite - test Stan-space
   - **Acceptance**: All 9 conformance suites pass at 100%

8. **CI/CD Hardening**
   - ⬜ All conformance tests in CI
   - ⬜ No-bypass enforcement in CI
   - ⬜ Mutation testing in CI
   - ⬜ Property testing in CI
   - ⬜ Release gates: all tests pass + no regressions
   - **Acceptance**: CI enforces all invariants, blocks bad releases

9. **Production Readiness Checklist**
   - ⬜ All conformance suites pass
   - ⬜ No escaped mutants >5%
   - ⬜ Property tests pass 10k iterations
   - ⬜ TCB manifest signed and verified
   - ⬜ Evidence pack complete
   - ⬜ Security audit completed
   - ⬜ Performance benchmarks met
   - ⬜ Documentation complete
   - **Acceptance**: Crystal specification conformance at 100%

**Deliverables**:
- Signed TCB_MANIFEST
- Property test suite (all components)
- Mutation test suite (all components)
- Dual-implementation algebra
- Declassify protocol
- Leak-budget probes
- 9 conformance suites
- Hardened CI/CD
- Production readiness certification

**Success Criteria**:
- All conformance tests pass 100%
- Mutation testing <5% escape
- Property testing 10k iterations no failure
- Evidence pack complete
- Security audit approved
- **Ready for production deployment**

---

## Implementation Principles

### 1. Build Priority Discipline

**Priority 0 (P0)**: Blocks all other work, must be complete before proceeding
- ONE_PATH_LAW enforcement
- Receipt ledger
- Identity/Authority system
- World Pack indexes
- Conformance testing
- Evidence pack

**Priority 1 (P1)**: Core OI capabilities per crystal spec
- Oracle mode with grounding
- Skill lattice
- Stan-space
- Learning geometry

**Priority 2 (P2)**: Enhanced capabilities, not blocking
- AIRLOCK_MODE
- Extended tool bus
- Multi-tenant features

### 2. Test-Driven Development

- Every feature MUST have tests before merging
- Invariants MUST have enforcement + tests
- Conformance tests MUST pass in CI
- No code ships without tests

### 3. Fail-Closed by Default

- Unknown behavior → DENY
- Missing prerequisites → DENY
- Invalid input → DENY
- Expired tokens → DENY
- Never assume safe

### 4. Provenance Over Vibes

- All claims cite sources (file:line or KB)
- Mark GROUNDED / SYNTHESIS / UNCERTAIN
- Never substitute model memory for truth
- Log all decisions with receipts

### 5. Incremental Delivery

- Ship each stage as a working system
- No half-built features in main branch
- Every stage has acceptance criteria
- Validate before proceeding

### 6. Evidence-Based Acceptance

- Each stage has clear deliverables
- Success criteria are objective
- Tests prove conformance
- No "trust me" acceptance

---

## Risk Analysis

### High-Risk Items

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Stan-space complexity** | Very High - learning geometry is novel | Start with simplified model, iterate with domain experts |
| **Skill lattice scale** | High - target is 1e3-1e4 skills | Build infrastructure first, skills incrementally |
| **Property testing coverage** | High - may miss edge cases | Combine with mutation testing, fuzz testing |
| **Performance at scale** | Medium - indexes may be slow | Incremental indexing, caching, optimization |
| **Crypto implementation** | High - security critical | Use audited libraries (libsodium), external audit |
| **Conformance test gaps** | High - may miss violations | Mutation testing catches gaps, continuous review |

### Medium-Risk Items

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Router accuracy** | Medium - may misroute intents | Gold standard test set, iterative improvement |
| **Composer correctness** | Medium - multi-step errors | Extensive integration tests, invariant checks |
| **Index freshness** | Medium - stale data | File watcher, incremental updates, validation |
| **AIRLOCK security** | Medium - external data risk | Strict domain allowlist, full provenance, audit |

### Low-Risk Items

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Tool adapter bugs** | Low - isolated components | Per-adapter tests, capability gating |
| **Mode transitions** | Low - simple state machine | State machine tests, receipt logging |
| **Documentation** | Low - can lag implementation | Continuous docs, examples, ADRs |

---

## Justification & Rationale

### Why This Staging?

#### 1. **Foundation First (Stage 0)**
- **Rationale**: Cannot build on shaky ground. ONE_PATH_LAW is the load-bearing invariant. If it breaks, everything breaks.
- **Evidence**: Crystal spec calls ONE_PATH_LAW "BUILD PRIORITY 0" (docs/specs/ONE_PATH_LAW.md:228)
- **Consequence**: Skipping this stage risks bypass vulnerabilities, defeats governance

#### 2. **Identity Before Everything (Stage 1)**
- **Rationale**: Crystal spec requires OI to be "cryptographically bound to its inceptor as sole root authority" (MATHISON_ORACLE_OI_MONOLITH v1.1.0:6)
- **Evidence**: IDENTITY section (lines 25-55) is foundational - defines who the OI serves
- **Consequence**: Without identity, no authority binding, no user sovereignty, no STOP preemption

#### 3. **World Pack Enables Oracle (Stage 2)**
- **Rationale**: Oracle mode requires "provenance-grounded to World Pack and/or embedded KB" (line 147)
- **Evidence**: WORLD section (lines 115-141) defines indexes as core infrastructure
- **Consequence**: Without indexes, OI cannot ground claims, violates truthfulness value

#### 4. **Oracle Before Skills (Stage 3)**
- **Rationale**: Skills depend on grounding for correctness. Oracle provides grounding infrastructure.
- **Evidence**: Skill router policies: "Mathison queries → oracle skill chain with provenance" (line 213)
- **Consequence**: Skills without grounding produce unverified outputs, violates proof-over-vibes

#### 5. **Skills Enable Composition (Stage 4)**
- **Rationale**: Crystal spec requires "composable SkillCrystal registry" for universal competence (line 190)
- **Evidence**: SKILL_LATTICE section (lines 188-223) defines skills as core capability
- **Consequence**: Without skills, OI cannot handle complex multi-step tasks

#### 6. **Stan-space is Load-Bearing (Stage 5)**
- **Rationale**: Crystal spec: "Stan-space load-bearing: it must maintain and use Stan Geometry of Learning as a core competence" (line 9)
- **Evidence**: STANSPACE_LOAD_BEARING section (lines 225-251) defines it as mandatory
- **Consequence**: Without Stan-space, OI cannot teach/coach/scaffold, violates spec

#### 7. **Tools Extend Capability (Stage 6)**
- **Rationale**: Tool bus provides "maximum practical capability without ferality" (line 269)
- **Evidence**: Lower priority than core competencies but extends usefulness
- **Consequence**: Can defer to P2 without violating core spec

#### 8. **Evidence Pack Gates Production (Stage 7)**
- **Rationale**: Cannot ship without proof of conformance
- **Evidence**: CONFORMANCE section (lines 383-402) defines must-prove requirements
- **Consequence**: Shipping without evidence pack violates safety claims

### Why This Order Cannot Be Changed

1. **Identity → World Pack → Skills → Stan-space** is a strict dependency chain
2. Foundation hardening (Stage 0) must come first or risk compounding bugs
3. Evidence pack (Stage 7) must come last as it validates everything
4. Each stage delivers working software (no half-built features)

### Alternative Orderings Considered

#### Alt 1: Skills Before Oracle
- **Problem**: Skills need grounding infrastructure, would produce unverified outputs
- **Rejected**: Violates provenance-over-vibes value

#### Alt 2: Stan-space Before Skills
- **Problem**: Stan-space needs skill infrastructure (STANSPACE_COACH is a skill)
- **Rejected**: Circular dependency, wrong precedence

#### Alt 3: Tool Bus Before Skills
- **Problem**: Tools are adapters, skills are compositional logic. Skills enable tool use.
- **Rejected**: Cart before horse

#### Alt 4: All at Once (Big Bang)
- **Problem**: Too much risk, no incremental validation
- **Rejected**: Violates incremental delivery principle

---

## Success Metrics

### Stage Completion Metrics

| Stage | Test Coverage | Conformance | Performance |
|-------|--------------|-------------|-------------|
| 0: Foundation | 100% line, 90% branch | ONE_PATH_LAW: 100% | Baseline |
| 1: Identity | 95% line, 85% branch | Identity tests: 100% | <10ms overhead |
| 2: World Pack | 90% line, 80% branch | Index tests: 100% | <1s query latency |
| 3: Oracle | 95% line, 85% branch | Oracle goldens: 100% | <2s per query |
| 4: Skills | 90% line, 80% branch | Skill tests: 100% | <5s multi-step |
| 5: Stan-space | 95% line, 85% branch | Stan conformance: 100% | <1s trajectory |
| 6: Tools | 90% line, 80% branch | Tool tests: 100% | <10s per tool |
| 7: Evidence | 95% line, 90% branch | All suites: 100% | Production SLA |

### Final Conformance Requirements (v3.0)

From MATHISON_ORACLE_OI_MONOLITH v1.1.0 CONFORMANCE section:

- ✅ ONE_PATH_LAW enforcement
- ✅ Capability gating + STOP revocation
- ✅ Fail-closed on missing prerequisites
- ✅ Oracle grounding with citations
- ✅ Tool honesty from logs only
- ✅ Algebra correctness + dual-impl crosscheck
- ✅ Privacy shaping + DECLASSIFY compliance
- ✅ Stan-space load-bearing scaffolding + evidence+consent logging

**All 8 conformance requirements MUST be proven before v3.0 release.**

---

## Long-Term Vision (Beyond v3.0)

### Skill Registry Growth

- **v3.0**: 50 skills (1% of target)
- **v3.1-v3.5**: Incremental growth to 500 skills (10% of target)
- **v4.0**: 1,000+ skills (20% of target)
- **v5.0**: 5,000+ skills (50% of target)
- **Long-term**: 1e4 skills (100% of target per crystal spec)

### Multi-Tenant & Federation (v3.x)

After v3.0, expand to:
- Multi-tenant deployment
- Cross-OI federation with authorized beams
- Enhanced observability and metrics
- Production hardening at scale

### Continuous Evolution

Per crystal EVOLUTION section (lines 361-381):
- Add/refine SkillCrystals continuously
- Improve router/composer heuristics
- Extend World Pack indexes
- Generate eval cases from repo diffs
- Expand StanConceptMap with evidence

**Forbidden**:
- Weaken hard constraints
- Bypass governance gates
- Self-grant capabilities
- Uncontrolled internet/exec
- Change authority without rekey ritual

---

## Conclusion

This roadmap provides a clear, staged path from v2.2 (foundation) to v3.0 (crystal specification conformance). Each stage builds on the previous, with clear dependencies, acceptance criteria, and justification.

**Key Takeaways**:

1. **Foundation first** - harden ONE_PATH_LAW and governance before building up
2. **Identity is foundational** - everything depends on cryptographic binding
3. **World Pack enables Oracle** - indexes enable provenance-grounded answers
4. **Skills compose capabilities** - router + composer + skills = universal competence
5. **Stan-space is load-bearing** - learning geometry is mandatory per spec
6. **Evidence gates production** - conformance must be proven, not assumed

**Timeline**: 18-24 months to v3.0 (crystal conformance)
**Current Progress**: 15% (v2.2 foundation)
**Critical Path**: Identity → World Pack → Oracle → Skills → Stan-space → Evidence

This is an ambitious but achievable roadmap grounded in the crystal specification requirements and software engineering best practices.

---

**Document Status**: DRAFT v1.0
**Next Review**: After Stage 0 completion
**Maintainer**: Mathison Core Team
**Last Updated**: 2026-01-19
