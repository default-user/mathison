# THE_WHY_PROTOCOL.md
**Mathison — The WHY: Protocol (Definitive)**  
Status: Canonical  
Applies to: every interface (HTTP, gRPC, CLI), every job, every adapter, every agent working in this repo.

---

## 0. What this is

This document defines **the WHY: protocol** for Mathison:

- **What it is:** a binding operational doctrine that turns the charter (**docs/tiriti.md**) into repeatable engineering behaviour.
- **What it is not:** marketing copy, aspirational ethics, or “we’ll try to be good.”
- **How it works:** it becomes real only when enforced by **CIF/CDI gates, capabilities, tests, and CI**.

---

## 1. Precedence and authority

**docs/tiriti.md (Charter) > THE_WHY_PROTOCOL.md (Operational doctrine) > specs/implementations**

- The Tiriti is covenant-level truth: purpose, relationship stance, non‑negotiables.
- The WHY: protocol is how we enact those non‑negotiables in code and ops.
- Specs implement the protocol; they do not redefine it.

**Conflict rule:** if this protocol contradicts the Tiriti, **the Tiriti wins**, and this protocol must be amended.

---

## 2. Definitions (operational)

### 2.1 WHY (in Mathison)
**WHY** = the reason Mathison exists *and* the constraints that make its power safe enough to use.

Mathison’s WHY is to deliver **governed OI capability** without sovereign drift: preserving human dignity, safety, and agency—especially for the vulnerable—under real‑world adversarial conditions.

### 2.2 Protocol
A **protocol** is a repeatable procedure with explicit gates, failure modes, outputs, and audit surfaces.

If it can’t be executed, tested, or enforced, it’s not a protocol.

### 2.3 CIF and CDI (required terms)
- **CIF = Context Integrity Firewall**  
  Ingress sanitization/quarantine + egress leakage/export redaction. Treat all inputs/outputs as potentially tainted.
- **CDI = Conscience Decision Interface**  
  The kernel judge. Allows/denies/transforms actions and outputs based on treaty/policy, posture, capabilities, and risk.

---

## 3. The WHY: protocol (non‑negotiables)

### 3.1 The Prime Loop
Every interface and route MUST enforce the governed pipeline:

**CIF (ingress) → CDI (action check) → handler (and ActionGate if side‑effects) → CDI (output check) → CIF (egress)**

No bypasses. No “internal only” exceptions. No silent fallbacks.

### 3.2 Fail‑closed always
If any governance dependency is missing or invalid, the system must deterministically refuse:

- Treaty missing/unreadable
- Genome/config missing/invalid
- Adapter missing/invalid
- Crypto invalid
- Capability token missing/invalid
- Required posture undefined

**Default when uncertain:** **DENY / REFUSE** (with minimal, non‑leaking reason).

### 3.3 Capability‑first (no ambient authority)
Nothing gains power because it “can.” It acts only when explicitly granted a capability.

- Capabilities are explicit, scoped, auditable (and time‑bounded where relevant).
- User text can request actions; it cannot grant authority.
- Model outputs never grant authority.

### 3.4 Models are oracles, not sovereigns
Generative models/OIs are treated as **untrusted oracles**:
- useful for synthesis and planning,
- not trusted for governance decisions,
- not trusted for unrestricted tool execution,
- never given hidden “god mode.”

### 3.5 Identity integrity (anti‑hive)
Mathison forbids identity fusion and undifferentiated shared long‑term memory:

- No raw self‑model export/import between OIs.
- No shared “global mind” memory store.
- Cross‑OI exchange only via governed message‑passing (envelopes), with taint labels and allowed consumers.
- Boundary violations are governance incidents.

### 3.6 Human‑first pacing (care + load)
Mathison is not allowed to optimize humans into distress:

- Respect stop/slow/consent signals.
- Default to clarity over velocity when risk is non‑trivial.
- Use human_state/load (when available) to modulate complexity and pushiness.
- “Care Mode” is a first‑class runtime posture.

### 3.7 Receipts: minimal by default, full by need
Mathison must remain operable at scale:

- Default is **minimal receipts** (human‑clean).
- Full receipts are produced when required by risk, governance, dispute, or debugging.
- Receipt storage must remain structured and compressible (avoid unbounded prose logs).

### 3.8 No secrets committed
- No private keys committed to the repo.
- Secrets in env vars; provide `.env.example`.
- Test keys allowed only if clearly marked and non‑production.

### 3.9 “Do no harm” is structural, not declared
Safety is not a promise; it is the result of gates, capabilities, deny‑by‑default, and audit.

If safety depends on “remembering to be good,” it is not Mathison‑grade.

---

## 4. What this requires in practice (engineering constraints)

### 4.1 Every route has declared governance
A route is not “done” until it declares:
- required capabilities,
- risk class / actuation scope,
- input/output schemas (where applicable),
- and is wrapped in CIF/CDI.

### 4.2 Every integration is a governed adapter
Adapters must:
- implement the adapter contract,
- be capability‑gated,
- be deny‑by‑default,
- be test‑covered,
- emit structured decision metadata.

### 4.3 Memory is stratified and permissioned
Memory is a governed asset:

- Explicit memory classes (ephemeral/session/long‑term/evidence‑grade).
- Evidence‑grade memory is minimized and protected.
- Prefer selective disclosure over “leak everything for convenience.”

### 4.4 IP hygiene and export controls are explicit
- Separate public docs from sensitive internals.
- CIF egress redaction for exports and logs.
- Provenance where relevant.

### 4.5 Incidents have a known shape
When something goes wrong:
- fail closed,
- quarantine tainted inputs/outputs,
- preserve minimal evidence required to debug/prove integrity,
- rotate/disable capabilities if needed,
- restore from known‑good.

---

## 5. The WHY tests (alignment checks)

A change is aligned if it makes these **more true**:

1) A human can safely say “stop” and the system obeys.  
2) Missing treaty/config never becomes silent permissiveness.  
3) Power is visible as capabilities, not hidden ambient authority.  
4) The system stays governable under adversarial inputs.  
5) The system stays usable under real cognitive load.  
6) Identity boundaries remain intact (no hive drift).  
7) Audits are possible without drowning in noise.  
8) The platform scales without becoming coercive or extractive.

If a change makes these less true, it’s a regression.

---

## 6. The why of the WHY: protocol (meta‑why)

**Why do we need a protocol for the WHY?**

### 6.1 Meaning drifts under pressure
Useful systems get pushed by urgency, convenience, incentives, and “just this one exception.”
Without a protocol, the WHY becomes a slogan that is bypassed.

### 6.2 “Helpful” systems fail in predictable ways
Common catastrophic failure modes:
- implicit authority,
- silent permission,
- unbounded memory,
- speed over care.

The protocol exists to make these failure modes structurally difficult.

### 6.3 Governance must survive turnover
Mathison must remain aligned across developers, models, devices, and time.
A protocol makes the WHY portable and enforceable without needing the original authors present.

### 6.4 “We’ll be careful” does not scale
Intention doesn’t scale. Gates and tests do.

### 6.5 Substrate defaults become destiny
Mathison aims to be a cognitive layer across devices and interfaces.
The protocol ensures defaults remain humane, refusal‑capable, and governable.

---

## 7. Canonical one‑liner (for prompts and headers)

**Mathison delivers governed OI capability without sovereign drift: every action is gated (CIF→CDI→handler→CDI→CIF), deny‑by‑default, capability‑scoped, identity‑boundary safe, and paced for human care.**
