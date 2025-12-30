# Advice From Codex

## Critique

### What’s working well
- **Governance-first framing is clear.** The repository consistently centers the treaty, governance pipeline, and fail-closed defaults.
- **Architecture boundaries are explicit.** CIF/CDI/ActionGate separation is well described and matches the monorepo layout.
- **Operational expectations are documented.** The README gives a clear runtime contract (env vars, endpoints, health payload).

### Gaps and risks
- **Documentation does not map specs to code.** The repository explains *what* should exist (CIF/CDI/ActionGate), but not *where* to find the implementation or how to trace a request through the code.
- **Governance invariants are not test-codified.** The treaty and governance pipeline are described, yet there’s no obvious “golden set” of invariants or automated checks that prove these rules are enforced.
- **Onboarding path is thin.** The monorepo layout is described, but there is no fast path for contributors to understand “start here”, “this package owns X”, or “this is the minimal dev workflow.”
- **Failure modes are under-documented.** The repo describes “fail-closed,” but does not show concrete examples (e.g., what a denial looks like, how receipts are recorded for denies, or how to debug policy failures).

## Fix Guide

### 1) Add a “trace the request” map
Create a short document that walks a request through the pipeline with code pointers.

Suggested content:
- A single example request (e.g., `POST /memory/nodes`).
- The handler entry file and how it reaches CIF/CDI hooks.
- The ActionGate boundary and where receipts are created.

**Outcome:** a new contributor can find the relevant modules without reading the entire codebase.

### 2) Encode governance invariants as tests
Turn treaty rules into explicit test cases so regressions are visible.

Suggested invariants to codify:
- Request denial on missing governance context.
- Fail-closed behavior when treaty config is missing.
- No write actions without ActionGate.
- Receipts emitted on all allow/deny outcomes.

**Outcome:** treaty guarantees become executable and CI-enforced.

### 3) Create an onboarding “first 30 minutes” guide
Add a short guide that answers:
- What to build/run for minimal validation.
- Which package owns core governance logic.
- Which tests are “must-run” for contributions.

**Outcome:** reduces contributor overhead and aligns expectations.

### 4) Document failure-mode examples
Provide a small set of real error payloads for denied/invalid requests.

Suggested artifacts:
- Sample deny receipt structure.
- Example of CIF ingress block.
- Example of CDI output check failure.

**Outcome:** operators and developers can quickly debug policy failures.

---

**If you want, I can implement these docs and tests directly in the repo.**
