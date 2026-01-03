# Full Stack Overview (Governance-First)

## Core Pipeline (Every Interface)

CIF ingress → CDI pre-check → handler → CDI post-check → CIF egress

## Components and Responsibilities

### Treaty / Policy (ReceiptLang executable artifacts)
Defines rules as runnable objects. CDI evaluates these to produce decisions + receipts.

### Genome / OI Profile
Defines identity, boundaries, permitted capabilities, posture defaults, and memory policy.

### Crypto / Verification
Verifies signatures on treaty/genome. Signs receipts and tokens.

### CIF (Context Integrity Firewall)
Ingress: sanitize, canonicalize, taint-label, risk-classify, quarantine.  
Egress: redact, prevent leakage, output shaping.

### CDI (Conscience Decision Interface)
Kernel judge:
- Pre: allow/deny/degrade/transform + token minting
- Post: output validation + redaction directives + receipts

### Handlers
Pure business logic. Cannot directly access tools, memory, or I/O.

### Adapters / Tools
Only way to touch external world. Must require valid tokens.

### Memory System (Stratified)
R0 charter → R1 style → R2 competence → R3 episodic → R4 micro-deltas → R5 actuation state.  
R3+ retrieval is mediated and tokened.

### Credits Ledger
Cost gating for expensive operations and cloud dependencies.

### Receipts + Audit Log
Evidence of decisions. Hash-chained audit for integrity.

### Anti-Hive / Mesh Envelope Layer
Cross-OI communication only via governed envelopes, never raw model export/import.

## Interaction Guarantees
- No interface bypasses CIF/CDI.
- No tool runs without a token minted by CDI.
- No sensitive memory leaks past CIF egress.
- Missing governance prerequisites cause deterministic refusal.
