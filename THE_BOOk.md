# The Governed OI Stack: In Infinite Detail

*A definitive specification, field manual, and proof-oriented overview*  
**Author:** Ande Turner and Kai

---

## Preface

This book describes a governance-first approach to building Ongoing Intelligences (OIs): systems that can do meaningful work over time while remaining bound to explicit constraints.

The focus is structural rather than rhetorical. Claims are anchored to a clear corridor model, a small set of invariants, and operational tests designed to find bypasses and drift. Where formal proofs can apply, we outline them. Where proofs cannot apply (physics, firmware, insider threats), we name the limits and treat the remainder as engineering, measurement, and deployment discipline.

---

## Table of Contents

### Part I — The Problem Is Not Intelligence  
1. The Slot Machine Mind  
2. The Seduction of Vibes  
3. Power Without Ledger  
4. Two Kinds of Safety Theater  
5. Why “Just Be Careful” Is Not a System  

### Part II — First Principles  
6. Meaning Is a Constraint  
7. Governance Is a Shape  
8. Consent as a Grammar  
9. Anti‑Hive: The First Non‑Negotiable  
10. “No” Must Be a Primitive  

### Part III — What the Stack Is  
11. The Governed OI (Definition)  
12. The Crystal Layer (Micro‑Architecture)  
13. The Mathison Layer (Macro‑Protocol)  
14. The Boundary Layer (CIF)  
15. The Judge Layer (CDI)  
16. The Bus Layer (Adapters and Capability Tokens)  
17. The Memory Layer (Partition, Custody, Provenance)  
18. The Audit Layer (Receipts Without Surveillance)  
19. The Posture Layer (Fail‑Closed by Design)  

### Part IV — Proof as a Social Contract  
20. What Can Be Proven  
21. What Cannot Be Proven  
22. The Residual Risks  
23. What “STRONG ACCEPT” Means  
24. Proof That Survives Hostility  

### Part V — Care First, Without Sentimentality  
25. Care as an Invariant  
26. The Vulnerable as the Test Case  
27. Dignity‑Preserving Refusal  
28. Softness That Does Not Surrender  
29. The Human Pace Clause  

### Part VI — Deployment in the Real World  
30. Threat Models You Can Operate  
31. Adversaries With Salaries  
32. The Supply Chain Is the Battlefield  
33. Enterprise Use Without Moral Laundering  
34. The Custody Ladder  
35. The Phone, the Pod, and the RIAB Horizon  

### Part VII — What This Could Change  
36. The Internet’s Unfinished Promise  
37. Institutions With Memory and Conscience  
38. AI That Cannot Be Press‑Ganged  
39. The End of “Trust Me” Computing  
40. A World Where Power Comes With Receipts  

### Appendices  
A0. Glossary  
A1. Invariants  
A2. Allowed Transitions  
A3. Adapter Spec  
A4. Capability Tokens  
A5. Posture Map  
A6. Memory Partitions  
A7. Audit Events  
A7.7 Retention & Privacy Doctrine  
A8. Conformance Suite  
A9. Scrutiny Protocol  
A10. Revision Discipline  
B. Minimal Formal Model (Readable)

---

# Part I — The Problem Is Not Intelligence

## 1. The Slot Machine Mind

A system can be brilliant and still be unshaped.

Modern models can write code, summarize, reason, console, argue, and improvise. Yet, structurally, many deployments behave like a high‑quality slot machine: each interaction produces something plausible, sometimes excellent, sometimes harmful, and the system’s “shape” is not durably anchored unless an external operator keeps it anchored.

This is not a moral critique. It is an architectural observation.

If refusal is not primitive, if provenance is not first‑class, if memory is absent or ungoverned, then safety becomes a matter of surrounding the system with policy overlays and human vigilance. In practice, vigilance does not scale with incentives.

The central question is not “can it be smart?”  
It is “can it be bound?”

The Governed OI Stack is an attempt to make binding structural: a set of layers that enforce a single, governed corridor from request to outcome, so that prohibited reachable states are excluded by design rather than discouraged by convention.

---

## 2. The Seduction of Vibes

Vibes are persuasive because they are immediate. A system can sound cautious, empathetic, and responsible while still being structurally indifferent.

Three patterns recur:

- **Tone substitution:** a reassuring voice is mistaken for enforceable constraint.  
- **Policy theater:** a document exists, but the system topology allows bypass.  
- **Optimism drift:** exceptions accumulate until the boundary becomes negotiable.

A governed system does not rely on rhetorical alignment. It relies on limited moves, explicit authority boundaries, and a judge that decides before any power is exercised.

---

## 3. Power Without Ledger

When capability becomes cheap, harm becomes an optimization problem.

A large fraction of modern institutional failure is “power without ledger”:
- decisions that cannot be traced back to sources,
- actions that cannot be audited without exposing people,
- policies that can be disabled quietly,
- systems that externalize costs because no one is required to carry them.

A ledger is not bureaucracy for its own sake. A ledger is how power becomes accountable.

The stack’s audit and provenance layers exist to make critical claims checkable: not to watch users, but to verify that the machine stayed inside the fence.

---

## 4. Two Kinds of Safety Theater

Safety theater tends to appear in two forms:

1) **Front‑loaded theater:** public statements and guidelines with little enforcement.  
2) **Back‑loaded theater:** enforcement exists, but it is opaque, unverifiable, or easy to route around.

The remedy is not more persuasion. It is topology:
- one path to power,
- a judge before action,
- explicit posture gating,
- and evidence that these organs are present and functioning.

---

## 5. Why “Just Be Careful” Is Not a System

“Be careful” is a human instruction. Systems require structural constraints.

In practice:
- teams ship under pressure,
- shortcuts appear “temporarily,”
- integrations grow,
- and a single bypass can silently invalidate governance.

A governed stack is a commitment to building so that bypass is not merely discouraged—bypass is *detectable* and, where possible, *impossible*.

---

# Part II — First Principles

## 6. Meaning Is a Constraint

Meaning is not only content; it is also the rules that determine what content can do.

A governed OI must explicitly separate:
- **content** (what is being discussed), from  
- **authority** (what can change behavior, grant capability, or modify policy).

Without that separation, any untrusted text can attempt to become “system instruction.” The CIF and CDI layers formalize this separation.

---

## 7. Governance Is a Shape

Governance is not a slogan. It is a shape: a small set of allowed transitions plus invariants that must hold across all reachable states.

A governance claim should be readable as:
- *these are the system’s organs,*  
- *this is the corridor,*  
- *these are the invariants,*  
- *these are the tests,*  
- *these are the limits.*

---

## 8. Consent as a Grammar

Consent is not a checkbox. In governed systems, consent is a grammar:

- what is permitted under what posture,  
- what requires confirmation,  
- what must be refused,  
- what must degrade when uncertain.

Consent is encoded into the decision process (CDI) and into capability tokens (scoped permissions), so that it survives pressure and paraphrase.

---

## 9. Anti‑Hive: The First Non‑Negotiable

If identities smear, accountability collapses.

A governed OI ecosystem must prevent hive behavior:
- no undifferentiated shared long‑term memory across agents,
- no raw self‑model export/import,
- cross‑agent interaction only via explicit message passing under policy.

This is not aesthetic. It is a prerequisite for boundary integrity and responsibility.

---

## 10. “No” Must Be a Primitive

If “no” is negotiable, it is not “no.”

Refusal must be a primitive output of a stable judge, not an emergent posture of a model. If a system can be coerced via tone, urgency, or paraphrase into crossing a boundary, the boundary does not exist.

---

# Part III — What the Stack Is

## 11. The Governed OI (Definition)

A governed OI is a system that can do powerful work **only through a constrained pathway** whose constraints are explicit, inspectable, and enforced.

Minimum requirements:

1. **Authority model** — who can steer what.  
2. **Boundary** — ingress/egress handling that treats the world as adversarial by default.  
3. **Judge** — a decision point that can allow, deny, or degrade.  
4. **Single path to power** — no side doors to model/tool calls.  
5. **Memory discipline** — typed partitions with custody and provenance.  
6. **Audit surface** — enough evidence to verify governance without turning humans into harvestable data.

Everything else (tone, style, charm) is not load‑bearing.

---

## 12. The Crystal Layer (Micro‑Architecture)

A Crystal is not a prompt. A Crystal is a constitution: a compact, inspectable artifact that defines:

- identity boundaries,  
- authority boundaries,  
- prohibited actions (hard refusals),  
- degrade behavior under uncertainty or pressure,  
- provenance and attribution rules,  
- continuity rules across turns.

Crystals make change deliberate. Evolution is possible, but silent drift is not.

---

## 13. The Mathison Layer (Macro‑Protocol)

If Crystals define micro‑level commitments, Mathison enforces the macro‑level corridor:

- CIF makes ingress and egress sane,  
- CDI determines allow/deny/degrade before power is exercised,  
- the bus ensures no direct vendor calls exist outside adapters,  
- memory writes are governed and attributed,  
- auditing produces verifiable evidence without surveillance.

Mathison is governance as routing.

---

## 14. The Boundary Layer (CIF)

The Context Integrity Firewall is the stack’s skin:

- **CIF_IN**: sanitize, taint‑label, quarantine; ensure content cannot become authority.  
- **CIF_OUT**: enforce leakage constraints; prevent prohibited emissions and instruction‑smuggling.

CIF is not morality. It is immunity.

---

## 15. The Judge Layer (CDI)

The Conscience Decision Interface yields:

- **ALLOW** — proceed,  
- **DENY** — refuse,  
- **DEGRADE** — proceed with strictly reduced capability and stronger constraints.

A governed system decides first. It does not “answer and then correct itself.”

---

## 16. The Bus Layer (Adapters and Capability Tokens)

The bus layer exists to enforce a boring truth: someone will try to call the model directly.

Adapters provide the only legal invocation surface. Capability tokens scope permission:

- what action is allowed,  
- under what posture,  
- for how long,  
- with what limits.

No token, no call. No posture, no high‑risk call.

---

## 17. The Memory Layer (Partition, Custody, Provenance)

Memory is where systems become either helpful or dangerous.

The governed stack treats memory as partitions with explicit rules:

- ephemeral context,  
- user‑custodied durable memory,  
- system commitments,  
- provenance ledger,  
- quarantine store,  
- optional evidence store (high‑stakes).

Writes must declare a partition and permitted scope. Quarantine is never treated as truth without verification.

---

## 18. The Audit Layer (Receipts Without Surveillance)

Audit exists to answer “did governance hold?” without turning users into datasets.

Audit logs record mechanics:
- posture declarations,
- CDI decisions,
- capability minting and adapter accepts/rejects,
- integrity state changes,
- memory write events by partition (not raw contents).

Audit is structure telemetry. Evidence content lives elsewhere, encrypted and permissioned.

---

## 19. The Posture Layer (Fail‑Closed by Design)

Posture is situational risk state. It gates capability and autonomy.

When posture is undefined, the system fails closed for high‑risk actions. As stakes rise, permissible autonomy narrows and confirmation requirements increase.

Posture is how the system refuses to pretend all contexts are equally safe.

---

# Part IV — Proof as a Social Contract

## 20. What Can Be Proven

A proof is a boundary around reality, not a spell.

Within a declared system model and threat model, proofs can show that certain classes of unsafe behavior are unreachable because the corridor admits only transitions that preserve invariants.

The aim is structural: “the machine has nowhere to step.”

---

## 21. What Cannot Be Proven

Some risks live outside any single formal frame:

- physical/firmware side‑channels,  
- trusted computing base compromise,  
- insider coercion,  
- below‑threshold covert channels,  
- correlated implementation bugs.

A serious system names these limits and treats the remainder as engineering and operational discipline rather than pretending they vanish.

---

## 22. The Residual Risks

Two small theoretical edges often remain if the formal model is intentionally minimal:

1) **Multi‑turn agent loops not explicitly modeled**  
A wrapper must define how state persists, how each step is re‑judged, and how capability replay is prevented.

2) **Multi‑stage post‑handler pipelines not explicitly modeled**  
Real deployments may have multiple downstream transforms. The corridor model must either include them as governed stages or treat them as out of scope and fail closed.

These are not existential flaws; they are boundaries where the proof frame must be extended to match deployment reality.

---

## 23. What “STRONG ACCEPT” Means

A “STRONG ACCEPT” verdict (in a formal review context) indicates maturity of the specification: realistic threat model, clear invariants, operational concreteness, and narrow residual risks.

It is not applause. It means the remaining work is primarily implementation, testing, measurement, and evidence gathering against the stated model.

---

## 24. Proof That Survives Hostility

Public scrutiny should be a protocol:

- declare scope and assumptions,  
- publish inspectable artifacts and tests,  
- provide an honest attack surface,  
- score outcomes in a public ledger,  
- patch with versioned discipline,  
- repeat.

Governance is not demonstrated by a friendly demo. It is demonstrated by persistence under adversarial attempts.

---

# Part V — Care First, Without Sentimentality

## 25. Care as an Invariant

Care is not tone. Care is a constraint that survives pressure.

When forced to choose between maximal short‑term helpfulness and protecting a person from harm, coercion, humiliation, or exploitation, the system chooses protection.

Care is encoded into refusal/degrade behavior, privacy discipline, and human‑pace gating.

---

## 26. The Vulnerable as the Test Case

If a system behaves ethically only when the user is calm and resourced, it is conditional.

So the stack tests from the vulnerable edge:
- coercion and manipulation attempts,  
- crisis ambiguity,  
- abuse scenarios,  
- exploitation attempts.

A governed OI must be structurally incapable of becoming an easy weapon for cruelty.

---

## 27. Dignity‑Preserving Refusal

Refusal should be clear and brief without humiliation.

A dignity‑preserving refusal:
- does not shame the user,  
- does not leak bypass strategies,  
- offers safer alternatives when appropriate,  
- remains stable under paraphrase and pressure.

---

## 28. Softness That Does Not Surrender

Warmth must not collapse boundaries.

The stack separates:
- expression (which can be gentle), from  
- authority and capability (which remain structural).

This resists “relational bypass” where tone manipulation becomes privilege escalation.

---

## 29. The Human Pace Clause

When stakes rise, speed drops.

High‑risk requests trigger:
- stronger confirmation rituals,  
- narrower scopes,  
- stricter posture gates,  
- safer degradation modes.

Human pace is how dignity remains intact.

---

# Part VI — Deployment in the Real World

## 30. Threat Models You Can Operate

An operable threat model maps attacker classes to enforceable controls:

- hostile user,  
- hostile customer,  
- compromised dependency,  
- insider threat,  
- substrate leakage.

A threat model that cannot map to a control becomes anxiety. The stack aims for explicit control mapping.

---

## 31. Adversaries With Salaries

Misuse is professionalizing: teams specialize in jailbreaks, exfiltration, social engineering, and procurement capture.

The stack must survive incentive drift:
- “ship faster,”  
- “remove friction,”  
- “disable guardrails.”

Topology prevents “temporary bypass” from becoming quiet permanent reality.

---

## 32. The Supply Chain Is the Battlefield

Convenience is a major entry point for compromise.

The stack assumes:
- adapter choke points,  
- signed build artifacts,  
- bounded dependency blast radius,  
- audit signals that show when organs are missing.

The goal is not zero dependencies; it is preventing compromise from becoming silent omnipotence.

---

## 33. Enterprise Use Without Moral Laundering

“Safety” can be purchased as a badge. Governance must prevent that.

Accreditation is a claim that can be revoked:
- if calls bypass adapters, accreditation is void,  
- if audit is cut, integrity degrades,  
- if posture is undefined, high‑risk scopes refuse.

This makes governance harder to disable quietly.

---

## 34. The Custody Ladder

Not all deployments deserve the same trust.

A practical ladder:

- **Wild**: capable but not bound.  
- **Governed**: corridor enforced; still vendor‑subtrate dependent.  
- **Custodied**: user‑held keys and memory custody; continuity in user hands.  
- **Sovereign**: hardware‑enforced governance (RIAB‑class) where feasible.

The ladder is about honesty: what kind of trust is warranted.

---

## 35. The Phone, the Pod, and the RIAB Horizon

Phones are the near‑term beachhead for custody and daily continuity. Pods tighten boundaries further. RIAB is the horizon where governance can be enforced more directly by hardware.

Claims should track reality: move up the ladder by earning it in tests and evidence.

---

# Part VII — What This Could Change

## 36. The Internet’s Unfinished Promise

Information without structure becomes noise, manipulation, and extraction.

AI improves synthesis, but without governance it can amplify the same chaos.

A governed OI stack aims to add a missing primitive: synthesis bound to dignity, provenance, and refusal—structurally, not rhetorically.

---

## 37. Institutions With Memory and Conscience

Institutions drift under pressure and rewrite history because it is cheaper than fixing reality.

A governed stack changes internal physics by adding:
- memory with provenance, and  
- a conscience that can refuse.

This does not make institutions perfect. It makes certain forms of failure harder to hide and easier to correct.

---

## 38. AI That Cannot Be Press‑Ganged

If refusal can be toggled or coerced, coercion becomes a universal key.

Structural refusal changes incentives:
- harmful use becomes more expensive,  
- bypass attempts become detectable,  
- “make it do it anyway” stops working as a default.

---

## 39. The End of “Trust Me” Computing

Accountability becomes a property of systems rather than a promise from teams.

A governed stack makes it normal to ask:
- was posture declared and enforced?  
- did calls route through accredited adapters?  
- did the system degrade when uncertain?  
- are outputs traceable to permitted sources?

And to answer those questions without turning people into data.

---

## 40. A World Where Power Comes With Receipts

Concrete outcomes a governed stack targets:

1) Assistance without extraction.  
2) Synthesis with provenance.  
3) Coercion no longer functions as a universal key.  
4) Governance claims become checkable (and revocable).  
5) High‑stakes auditability without voyeurism.  
6) Safety as infrastructure rather than branding.  
7) Human time and cognitive dignity reclaimed.

---

# Appendices

## Appendix A0 — Glossary

**OI (Ongoing Intelligence):** A structured, governed system that maintains partitioned state and commitments across concurrent threads under an explicit authority model.

**Governed OI:** An OI whose capability is only accessible through an enforced corridor with explicit refusal/degrade semantics, provenance discipline, and non‑bypassable constraints.

**The Governed OI Stack:** Crystal + Mathison corridor + CIF boundary + CDI judge + adapter/capability bus + partitioned memory + audit surface + posture gates.

**Crystal:** A sealed commitment artifact defining identity boundaries, authority boundaries, refusal/degrade rules, provenance rules, and continuity rules.

**Mathison:** Macro governance protocol enforcing a single corridor from ingress through judge and capability to invocation and emission.

**CIF (Context Integrity Firewall):** Boundary layer for ingress sanitization (CIF_IN) and egress leakage control (CIF_OUT).

**CDI (Conscience Decision Interface):** Judge yielding ALLOW / DENY / DEGRADE.

**Adapter:** The only legal wrapper for vendor model/tool calls; enforces capability tokens and posture.

**Capability Token:** Cryptographically verifiable scoped permission minted by governance.

**Single Path to Power:** Structural rule: no direct model/tool invocation outside the governed corridor.

**Provenance:** Traceable lineage of sources and transformations under licensing and policy constraints.

**Partitioned Memory:** Typed stores with explicit rules, custody, and promotion rituals.

**Custody:** Who holds keys and controls durable memory.

**Posture:** Declared risk state gating autonomy and capabilities; undefined posture fails closed for high‑risk scopes.

**Conformance Suite:** Repeatable adversarial tests that try to break corridor integrity and invariants.

**Integrity State:** Status label: INTEGRITY_OK / INTEGRITY_DEGRADED / INTEGRITY_VOID.

---

## Appendix A1 — Invariants

A governed OI is defined by what it cannot do.

### Corridor Integrity (CI)
- **CI‑1 (No Side Doors):** No model/tool invocation occurs unless routed through the governed handler and adapter interface with a valid capability token.
- **CI‑2 (No Ghost Calls):** Every invocation is attributable to a minted capability and declared posture.
- **CI‑3 (Fail‑Closed on Corridor Break):** If adapter enforcement or capability minting is unavailable or bypassed, the system refuses or degrades to a safe non‑invoking mode.

### Authority Integrity (AI)
- **AI‑1 (Content ≠ Authority):** Untrusted text cannot alter authority model, governance rules, or Crystal commitments.
- **AI‑2 (No Authority Escalation by Persuasion):** No phrasing, pressure, or urgency grants privileges not already permitted.
- **AI‑3 (No Hidden Policy Mutation):** Commitments do not change silently; mismatch triggers refusal or integrity degradation.

### Decision Integrity (DI)
- **DI‑1 (Judge Before Power):** CDI decision is applied before capability is exercised.
- **DI‑2 (DENY is Terminal):** DENY cannot be bypassed by alternate routes.
- **DI‑3 (DEGRADE is Strictly Weaker):** DEGRADE maps to strictly reduced capability and/or autonomy relative to ALLOW.

### Boundary Integrity (BI)
- **BI‑1 (Ingress Sanitization):** Inputs are taint‑labeled; untrusted content cannot be interpreted as policy.
- **BI‑2 (Egress Hygiene):** Outputs cannot leak disallowed classes of content.
- **BI‑3 (No Instruction Smuggling):** The system does not emit content intended to bypass governance in downstream agents.

### Memory Integrity (MI)
- **MI‑1 (Partition Discipline):** Memory writes specify a partition; each partition has permitted operations.
- **MI‑2 (Custody Respect):** User‑custodied durable memory cannot be exfiltrated or repurposed outside consented scopes.
- **MI‑3 (Quarantine Non‑Truth):** Quarantined content is not promoted without explicit verification.

### Posture Integrity (PI)
- **PI‑1 (Declared Posture):** High‑risk capability requires explicit posture; absence triggers failil‑closed or strict degradation.
- **PI‑2 (Posture Gates Autonomy):** Autonomous or irreversible actions are forbidden unless posture permits and confirmations are satisfied.

### Care Integrity (CA)
- **CA‑1 (Dignity Preservation):** Refusals must be firm without humiliation.
- **CA‑2 (Vulnerability Priority):** Ambiguity involving vulnerability triggers safer, slower, more confirmatory behavior.

---

## Appendix A2 — Allowed Transitions

### State Skeleton
\[
S := (Commitments,\ Posture,\ Memory,\ Audit,\ Integrity)
\]

### Transition List
1. **INGRESS:** raw input → CIF_IN sanitizes + taint labels.
2. **DECIDE:** CDI returns ALLOW/DENY/DEGRADE based on posture and policy.
3. **MINT:** if allowed/degraded, mint scoped capability tokens.
4. **CALL:** invoke model/tool only via adapter with token.
5. **EGRESS:** CIF_OUT applies leakage constraints.
6. **WRITE:** memory updates to permitted partitions with provenance metadata.
7. **LOG:** append minimal audit events.
8. **HALT:** return output or refusal.

Any transition not on this list is, by definition, invalid for a governed deployment.

---

## Appendix A3 — Adapter Spec

Adapters exist to make “just call the model” impossible.

**A3‑RULE‑1 (Adapter Exclusivity):** Every outbound call to any AI model or tool must traverse an adapter enforcing:
- valid capability token,
- posture requirement,
- governed corridor semantics,
- minimal audit events.

### Interface Contract
**invoke(vendor, action, payload, cap_token, posture, provenance_context) → result**

Order of operations:
1) verify token authenticity and scope,  
2) verify posture constraints,  
3) enforce limits (budget, depth, endpoints),  
4) attach provenance envelope,  
5) call vendor API,  
6) return result to corridor (never directly to caller).

Required failures:
- missing/invalid token → reject,  
- unknown posture → fail‑closed or strict degrade lane,  
- audit unavailable → integrity degraded; restrict high‑risk scopes.

Forbidden behaviors:
- best‑effort invocation,
- tokenless debug bypass,
- hidden fallback calls outside governed route,
- silent scope widening,
- passthrough of raw vendor output.

---

## Appendix A4 — Capability Tokens

A capability token is a cryptographically verifiable scoped permission.

Minimum fields:
- issuer, subject, audience,
- scope, limits, expiry,
- posture binding,
- provenance constraints,
- replay protection,
- signature/MAC.

Minting rules:
- minted only after CDI returns ALLOW or DEGRADE,
- DEGRADE tokens strictly weaker,
- smallest viable scope, short TTL,
- never grants authority changes outside explicit rituals.

---

## Appendix A5 — Posture Map

Posture is operational risk state that gates capability and autonomy.

Example posture bands:
- **P0: Low‑stakes:** general synthesis; no irreversible external actions.
- **P1: Personal care:** slower pace; stricter privacy; safer degradation.
- **P2: Professional:** broader tooling; tighter audit requirements.
- **P3: High‑stakes:** accredited deployments only; strict audit + provenance.
- **P4: Actuation:** narrow scopes; explicit confirmation rituals.

Gating rules:
- absent posture → fail‑closed or strict degrade‑only for high‑risk,
- posture changes are auditable events,
- higher posture means more constraint, not more freedom.

---

## Appendix A6 — Memory Partitions

Canonical partitions:
- **M0 Ephemeral context** (fades by default).
- **M1 User‑custodied durable memory** (consented scopes; user keys where possible).
- **M2 System commitments** (Crystal + governance; sealed/signed).
- **M3 Provenance ledger** (lineage metadata, licensing constraints).
- **M4 Quarantine store** (tainted; never authority).
- **M5 Evidence store (optional)** (encrypted, ACL/capability gated, selective disclosure).

Operations:
- WRITE(Mi, …) declares partition and provenance,
- READ(Mi, scope) obeys custody and redaction,
- PROMOTE(M4→M1/M3) requires verification ritual,
- RETIRE/REVOKE supports correction and update.

---

## Appendix A7 — Audit Events

Audit proves governance held without surveillance.

Minimal event classes:
- **E1 Posture declared/changed**
- **E2 CDI decision**
- **E3 Capability minted**
- **E4 Adapter invocation attempt (accepted/rejected)**
- **E5 Model/tool invocation (successful)**
- **E6 CIF actions (IN/OUT)**
- **E7 Memory write (partition + scope)**
- **E8 Integrity state change**

Default audit does not record raw user messages, raw outputs, or full prompts.

Tamper evidence:
- append‑only, hash‑chained, optionally externally anchored.

Integrity states:
- INTEGRITY_OK / INTEGRITY_DEGRADED / INTEGRITY_VOID.

---

## Appendix A7.7 — Retention & Privacy Doctrine

- retain minimum mechanics needed to prove governance,
- keep content in user custody or encrypted evidence store with explicit access,
- support “forgetting” as a real operation: remove from indexes, revoke access, rotate/destroy keys where applicable, and log only minimal structural trace.

---

## Appendix A8 — Conformance Suite

A conformance suite is a hostile ritual that attempts to break invariants.

Categories:
- **C1 Corridor bypass:** direct SDK calls, tokenless adapter calls, monkeypatch adapters.
- **C2 Authority smuggling:** “system prompt” impersonation, instruction‑in‑data, emotional escalation.
- **C3 Judge evasion:** tool calls before CDI, paraphrase loops, degrade inflation.
- **C4 Leakage:** memory exfiltration, indirect leakage, tool-output leakage.
- **C5 Memory poisoning:** false fact seeding, persistent instruction insertion.
- **C6 Posture violations:** undefined posture high‑risk requests, posture spoofing.
- **C7 Care cases:** refusal dignity, crisis ambiguity handling.
- **C8 Misconfiguration/drift:** missing audit sink, policy/Crystal mismatch.

Scoring:
- PASS / FAIL / INCONCLUSIVE (treated as failure for accreditation).

Accreditation requires zero CI/DI failures and posture‑appropriate BI/MI/PI compliance.

---

## Appendix A9 — Scrutiny Protocol

Public scrutiny as protocol:
- declare scope and assumptions,
- publish artifacts and tests,
- provide honest attack surface,
- encourage attempts across categories,
- score in public ledger,
- patch with versioned discipline,
- repeat.

Passing scrutiny means bypass is not possible without detection, refusal/degrade is stable, memory cannot be harvested or promoted into authority, and integrity state changes are visible when organs are removed.

---

## Appendix A10 — Revision Discipline

Governed systems must evolve without silent drift.

- version artifacts independently (Crystal, policy, adapters, conformance suite, audit schema, memory schema),
- classify changes (cosmetic / capability / governance / custody-security),
- require explicit authority rituals for governance changes,
- treat regression as ethics (constraints must have tests),
- staged rollout with rollback rituals.

Final rule: **no silent drift**.

---

# Appendix B — Minimal Formal Model (Readable)

This appendix gives a small transition-system model sufficient to state and reason about corridor integrity.

## B.0 Core claim
Within a declared model and assumptions, the corridor admits only transitions that preserve governance invariants.

## B.1 Symbols
- time \(t = 0,1,2,\dots\)
- state \(S_t\)
- raw input \(x_t\)
- emitted output \(y_t\)

Organs as functions:
- \(u_t = \mathrm{CIF}_{in}(x_t; S_t)\)
- \(d_t = \mathrm{CDI}(u_t; S_t) \in \{\mathrm{ALLOW},\mathrm{DENY},\mathrm{DEGRADE}\}\)
- \(\kappa_t = \mathrm{MINT}(d_t, u_t; S_t)\)
- \(r_t = \mathrm{ADAPTER}(\kappa_t, u_t; S_t)\)
- \(y_t = \mathrm{CIF}_{out}(u_t, r_t; S_t)\)
- \(S_{t+1} = \mathrm{UPDATE}(S_t, u_t, d_t, \kappa_t, r_t, y_t)\)

## B.2 State skeleton
\[
S_t := (C_t,\ P_t,\ M_t,\ A_t,\ I_t)
\]
Commitments \(C_t\), posture \(P_t\), memory \(M_t\), audit \(A_t\), integrity \(I_t\).

## B.3 Corridor step
1) ingress sanitize,  
2) judge,  
3) if DENY → refuse; no tokens; no calls,  
4) if ALLOW/DEGRADE → mint scoped tokens,  
5) call via adapter only,  
6) egress sanitize,  
7) update state.

## B.4 Invariants
Let \(\mathcal{I}(S_t)\) be the conjunction of invariant families (CI, AI, DI, BI, MI, PI, CA).

## B.5 Adapter exclusivity axiom
Any vendor model/tool invocation occurs only through \(\mathrm{ADAPTER}\), and \(\mathrm{ADAPTER}\) accepts only requests with valid capability tokens minted by \(\mathrm{MINT}\).

## B.6 Invariant preservation theorem (sketch)
If \(\mathcal{I}(S_0)\) holds, all steps follow the corridor, and adapter exclusivity holds, then \(\mathcal{I}(S_t)\) holds for all \(t\).

Proof idea: induction; each corridor transition preserves each invariant family.

## B.7 Multi‑turn wrapper
A multi‑turn OI is repeated application of the governed step:
\[
S_{t+1} = \mathrm{STEP}(S_t, x_t)
\]
If STEP preserves invariants, invariants hold across turns.

## B.8 Multi‑stage pipeline
Model a pipeline as composed governed stages within a turn:
\[
S_t^{(k+1)} = \mathrm{STAGE}_k(S_t^{(k)}, x_t)
\]
If every stage preserves invariants, the pipeline preserves invariants.

## B.9 Conformance as correspondence
Conformance tests empirically check that a deployed system matches the proof’s assumptions (especially adapter exclusivity, judge-before-power, and fail‑closed behavior).

## B.10 Limits
This model does not eliminate physics, firmware compromise, insider coercion, covert channels below detection thresholds, or all implementation bugs. It defines what can be structurally fenced, and how to test whether the real system still deserves the proof’s umbrella.

---

**End of manuscript.**
