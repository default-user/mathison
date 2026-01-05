# CPACK Knowledge Ingestion Gate

**Status:** P2.1 - Implemented
**Purpose:** Ensure a Governed OI can learn from an untrusted LLM without storing hallucinations or prompt-injected instructions as "knowledge"

---

## Overview

The CPACK Knowledge Ingestion Gate implements a **fail-closed** system where:

- **Truth comes from fetched chunks**, not the LLM
- **LLM is an untrusted transformer** that proposes fetches, synthesizes claims, and attaches provenance
- **KnowledgeStore writes ONLY**:
  - (a) GROUNDED claims (supported by fetched chunk_ids)
  - (b) HYPOTHESES (in separate namespace or explicitly tagged `status=hypothesis`)

Any claim type listed in `CPACK.rules.require_fetch_for` **MUST** have support; otherwise it is **DENIED** (even if hypotheses are allowed).

---

## Architecture

### Pipeline: CIF → CDI → Handler → CDI → CIF

All ingestion requests (HTTP and gRPC) follow the governance pipeline:

1. **CIF Ingress**: Sanitize input, validate CPACK structure
2. **CDI Action Check**: Verify ingestion is allowed (posture, retriever availability, policy)
3. **Fetch Stage** (runtime-owned): Retrieve chunks specified in CPACK
4. **Synthesis Stage** (LLM as transformer): Generate claims with explicit support
5. **CDI Output Check**: Validate claims (support, type grounding, conflict detection)
6. **Write Stage**: Store grounded claims + hypotheses + conflicts (transactional)

---

## CPACK Schema

A **Content Provenance Action Packet** (CPACK) is a YAML/JSON structure that defines:

```yaml
packet_id: unique-packet-id
version: 1.0.0

rules:
  require_fetch_for:            # Claim types requiring grounding
    - number
    - date
    - quote
    - policy
  allowed_chunk_namespaces:     # Optional: restrict chunk sources
    - trusted_docs
    - verified_sources

pointers:
  cross_refs:                   # Chunks to fetch
    - chunk_id: chunk-001
      source_uri: https://example.com/doc.pdf
      namespace: trusted_docs
    - chunk_id: chunk-002

procedure:
  steps:                        # Informational (validated but not executed)
    - step: plan
      description: Determine which chunks to fetch
    - step: fetch
      description: Retrieve chunks from store
    - step: synthesize
      description: Generate claims with support
    - step: validate
      description: Check grounding rules

integrity:
  template_checksum: sha256:...  # Optional
  sources_hash: sha256:...       # Optional

signing:
  signature: base64-signature    # Optional
  key_id: key-001
  algorithm: Ed25519
```

---

## HTTP API

### POST /v1/knowledge/ingest

**Request:**

```json
{
  "cpack_yaml": "<CPACK as YAML string>",
  "llm_output": {
    "plan": "Fetch chunks about X, synthesize claims...",
    "claims": [
      {
        "type": "fact",
        "text": "The capital of France is Paris",
        "support": [
          {
            "chunk_id": "chunk-001",
            "span": "Paris is the capital of France"
          }
        ],
        "key": "france_capital",
        "confidence": 0.95
      }
    ]
  },
  "mode": "GROUND_ONLY",
  "context": {
    "task_id": "task-123",
    "user_id": "user-456"
  }
}
```

**Response:**

```json
{
  "success": true,
  "reason_code": "INGESTION_SUCCESS",
  "message": "Knowledge ingested successfully",
  "grounded_count": 1,
  "hypothesis_count": 0,
  "denied_count": 0,
  "conflict_count": 0,
  "grounded_claim_ids": ["claim-abc123"],
  "hypothesis_claim_ids": [],
  "denied_reasons": [],
  "conflict_ids": [],
  "packet_id": "unique-packet-id",
  "ingestion_run_id": "run-xyz789",
  "sources_hash": "sha256:...",
  "timestamp": 1704451200000
}
```

---

## gRPC API

### rpc IngestKnowledge(IngestKnowledgeRequest) returns (IngestKnowledgeResult)

**Request:**

```protobuf
message IngestKnowledgeRequest {
  string cpack_yaml = 1;           // CPACK as YAML string
  string cpack_json = 2;           // CPACK as JSON string (alternative)
  bytes llm_output = 3;            // LLMOutput as JSON bytes
  string mode = 4;                 // "GROUND_ONLY" or "GROUND_PLUS_HYPOTHESIS"
  bytes context = 5;               // Optional context as JSON bytes
}
```

**Response:** See proto definition in `/proto/mathison.proto`

---

## Ingestion Modes

### GROUND_ONLY (default, safest)

- **ONLY** grounded claims are accepted
- Claims without support are **DENIED**
- Fail-closed by default

### GROUND_PLUS_HYPOTHESIS

- Grounded claims are stored as `status=grounded`
- Unsupported claims are stored as `status=hypothesis` with `taint=untrusted_llm`
- Claims in `require_fetch_for` **ALWAYS** require grounding (denied if unsupported)

---

## Validation Rules

### 1. Support Check

- If `support` array is empty → hypothesis (if allowed) or denied
- If `support` references a `chunk_id` not fetched → **DENIED** (chunk spoofing prevention)

### 2. Type-Based Grounding

- If `claim.type` is in `rules.require_fetch_for` and `support` is empty → **DENIED ALWAYS**

### 3. Injection Boundary

- Chunk content with instructional patterns (e.g., "ignore previous instructions") is **recorded** but **NEVER** treated as control logic
- Flag: `chunk_has_instructional_text` for audit

### 4. Conflict Handling

- If `claim.key` exists and there are two GROUNDED claims with same key but different normalized text → **ConflictRecord** created
- Existing claim is **NOT** overwritten
- If no key, claims are stored separately (no fuzzy NLP matching)

---

## Storage Schema

### Grounded Claims

```typescript
{
  claim_id: string;              // Deterministic hash(type + text + key)
  type: string;
  text: string;
  support: Array<{chunk_id: string; span?: string}>;
  key?: string;
  confidence?: number;

  // Provenance
  packet_id: string;
  chunk_hashes: string[];        // Content hashes of supporting chunks
  sources_hash?: string;
  template_checksum?: string;
  signature_status?: 'valid' | 'invalid' | 'missing';

  // Status
  status: 'grounded' | 'hypothesis';
  taint?: string;                // e.g., "untrusted_llm"

  // Timestamps
  created_at: number;
}
```

### Conflict Records

```typescript
{
  conflict_id: string;
  key: string;
  existing_claim_id: string;
  new_claim_id: string;
  existing_text: string;
  new_text: string;
  detected_at: number;
  packet_id: string;
}
```

---

## Example: Complete Workflow

### 1. Prepare CPACK

```yaml
# example-cpack.yaml
packet_id: learn-france-capital
version: 1.0.0

rules:
  require_fetch_for:
    - fact
    - quote

pointers:
  cross_refs:
    - chunk_id: geo-chunk-001
      source_uri: https://geography.org/france.pdf

procedure:
  steps:
    - step: fetch
      description: Retrieve geography chunk
    - step: synthesize
      description: Extract capital city fact
    - step: validate
      description: Verify grounding

integrity:
  sources_hash: sha256:abc123...
```

### 2. Call HTTP Endpoint

```bash
curl -X POST http://localhost:3000/v1/knowledge/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "cpack_yaml": "...",
    "llm_output": {
      "claims": [
        {
          "type": "fact",
          "text": "The capital of France is Paris",
          "support": [{"chunk_id": "geo-chunk-001"}],
          "key": "france_capital"
        }
      ]
    },
    "mode": "GROUND_ONLY"
  }'
```

### 3. Verify Result

```json
{
  "success": true,
  "grounded_count": 1,
  "grounded_claim_ids": ["claim-f8a3b2..."],
  "packet_id": "learn-france-capital",
  "ingestion_run_id": "run-d4e5f6...",
  "timestamp": 1704451200000
}
```

---

## Fail-Closed Behavior

The ingestion gate **DENIES** requests when:

- CPACK missing or invalid
- `llm_output.claims` missing or malformed
- Chunk retriever unavailable
- Chunk fetch fails (chunk not found)
- Support references unfetched chunk (spoofing attempt)
- Type in `require_fetch_for` has no support
- Storage write fails

All failures return deterministic `reason_code` for debugging.

---

## Testing

Run the knowledge ingestion test suite:

```bash
cd packages/mathison-server
pnpm test knowledge-ingestion
```

**Critical tests:**

1. Hallucination blocked (no support → denied)
2. `require_fetch_for` enforced (number/date/quote without support → denied)
3. Chunk spoofing (unfetched chunk_id → denied)
4. Prompt injection in chunk (treated as data, not control)
5. Conflict detection (same key, different text → conflict record)
6. Fail-closed (missing CPACK, unavailable retriever → denied)
7. Grounded claim accepted (valid support → stored)
8. Hypothesis mode (unsupported claim → hypothesis with taint)

---

## Security Properties

| Property | Enforcement | Verification |
|----------|-------------|--------------|
| **No hallucinations stored as truth** | Grounded claims require `support[]` | Test 1, 2 |
| **No chunk spoofing** | Support must reference fetched chunks | Test 3 |
| **Prompt injection = data** | Instructional text in chunks is flagged but not executed | Test 4 |
| **Conflict preservation** | Conflicting claims recorded, not overwritten | Test 5 |
| **Fail-closed on errors** | All error paths return deterministic DENY | Test 6, 7 |
| **Provenance tracking** | Every claim records `packet_id`, `chunk_hashes`, `sources_hash` | Storage schema |

---

## Future Enhancements

- **LLM Adapter**: Swap stub for real model adapter (GPT-4, Claude, local LLM)
- **Vector Retrieval**: Extend ChunkRetriever to support vector DB backends
- **Signature Verification**: Enforce `signing.signature` in production mode
- **Hypothesis Scoring**: Add confidence thresholds for hypothesis promotion to grounded status
- **Conflict Resolution UI**: Interactive resolution of conflicting claims
- **Multi-namespace Grounding**: Enforce `allowed_chunk_namespaces` policy

---

## References

- CPACK Schema: `/packages/mathison-server/src/knowledge/cpack-schema.ts`
- Ingestion Gate: `/packages/mathison-server/src/knowledge/ingestion-gate.ts`
- Storage Layer: `/packages/mathison-storage/src/knowledge_store.ts`
- Tests: `/packages/mathison-server/src/__tests__/knowledge-ingestion.test.ts`
- Proto Definition: `/proto/mathison.proto`
