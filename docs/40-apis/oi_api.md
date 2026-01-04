# OI API — Open Interpretation

**Mathison OI (Open Interpretation)** — Deterministic interpretation endpoint using MemoryGraph context.

---

## Who This Is For

- **Application developers** building text interpretation features grounded in a knowledge graph
- **Search engineers** needing semantic search over structured memory with citations
- **Chatbot builders** requiring deterministic, auditable interpretation (no external LLM calls)
- **Compliance teams** who need transparent, reproducible query results with genome versioning

If you're doing unstructured knowledge retrieval or need LLM-powered generation, this is NOT the right endpoint (OI is deterministic, not generative).

---

## Why This Exists

**Problem:** Traditional search is keyword-based; LLM interpretation is non-deterministic and opaque.

**Solution:** The OI API provides:
- **Deterministic interpretation**: Graph-based search with reproducible results (no LLM randomness)
- **Citations**: Every interpretation includes node references showing *why* results were returned
- **Governance**: All requests protected by CIF+CDI (same as Memory API)
- **Fail-closed**: Denies requests if memory backend unavailable or genome missing

**Design choice:** Interpretations are *constructed* from graph search results, not *generated* by an LLM. This ensures reproducibility and auditability.

---

## Guarantees / Invariants

1. **Determinism**: Same query + same memory graph state → same interpretation + same citations
2. **No external LLM calls**: Interpretations are constructed locally from graph search (no API calls to OpenAI/Anthropic/etc.)
3. **Citation completeness**: Every interpretation includes node IDs + explanations of why they were included
4. **Fail-closed**: Requests denied if memory backend unavailable or genome metadata missing
5. **Governed**: All requests pass through CIF ingress/egress + CDI action authorization

---

## Non-Goals

- **Generative AI**: No freeform text generation (use external LLM for that)
- **Multi-turn conversations**: Stateless; no conversation history (use external session management)
- **Advanced query languages**: No SQL/GraphQL/Cypher (simple text queries only)
- **Real-time updates**: No live streaming (use polling or future gRPC support)
- **Embedding-based similarity**: Simple keyword matching only (future: vector search)

---

## How to Verify

### Verify interpretation works
```bash
curl -X POST http://localhost:3000/oi/interpret \
  -H "Content-Type: application/json" \
  -d '{"text": "test query", "limit": 5}'
# Expected: 200 with interpretation, confidence, citations, genome metadata
```

### Verify determinism
```bash
# Run same query twice
curl -X POST http://localhost:3000/oi/interpret \
  -d '{"text": "artificial intelligence"}' -H "Content-Type: application/json" > result1.json
curl -X POST http://localhost:3000/oi/interpret \
  -d '{"text": "artificial intelligence"}' -H "Content-Type: application/json" > result2.json
diff result1.json result2.json
# Expected: No differences (same interpretation + citations)
```

### Verify citations
```bash
curl -X POST http://localhost:3000/oi/interpret \
  -d '{"text": "test"}' -H "Content-Type: application/json" | jq .citations
# Expected: Array of citations with node_id and "why" explanations
```

### Verify fail-closed behavior
```bash
# Stop memory backend (simulate failure)
# curl should return 503 GOVERNANCE_INIT_FAILED
```

### Verify governance enforcement
```bash
# Missing required field
curl -X POST http://localhost:3000/oi/interpret \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400 "Missing required field: text"

# Oversized text (> 10k chars)
curl -X POST http://localhost:3000/oi/interpret \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$(printf 'x%.0s' {1..20000})\"}"
# Expected: 400 CIF_INGRESS_BLOCKED
```

---

## Implementation Pointers

**Location**: `/packages/mathison-server/src/routes/oi.ts`

**Key components**:
- **OIInterpreter**: Main interpretation logic (search + citation generation)
- **MemoryGraph**: Provides search results for context
- **ConfidenceScorer**: Calculates confidence based on context quality + query quality
- **CitationBuilder**: Generates "why" explanations for each context node

**Algorithm**:
1. Extract search terms from input text (stopword filtering)
2. Query MemoryGraph for nodes matching terms
3. Group results by node type (concept, definition, etc.)
4. Construct interpretation string from node counts + top match
5. Calculate confidence (0.3 baseline + context quality + query quality)
6. Return interpretation + citations + genome metadata

**Confidence formula**:
```
confidence = 0.3 + (context_nodes * 0.1) + query_quality_bonus
confidence = max(0, min(confidence, 1.0))
```

**Dependencies**:
- MemoryGraph for search
- Genome for metadata (id + version)
- CIF/CDI middleware for governance

---

## Overview

The OI API provides governed interpretation of text queries grounded in the memory graph. All interpretations are:

- **Deterministic** — based on graph search results, no external LLM calls
- **Governed** — CIF ingress/egress + CDI action authorization
- **Fail-closed** — denies requests if memory backend unavailable or genome missing
- **Receipted** — responses include genome metadata (id + version)

---

## Endpoint

### POST /oi/interpret

Interpret text using memory graph context.

**Request Body:**
```json
{
  "text": "What is artificial intelligence?",
  "limit": 5
}
```

**Fields:**
- `text` (required, string) — Query text to interpret
- `limit` (optional, number) — Max context nodes to use (default: 5, max: 100)

**Response (200):**
```json
{
  "interpretation": "Query: \"What is artificial intelligence?\". Found 3 relevant nodes in memory graph: 2 concepts, 1 definitions. Top match: concept (concept-ai-001).",
  "confidence": 0.75,
  "citations": [
    {
      "node_id": "concept-ai-001",
      "why": "Matched search term: \"artificial\""
    },
    {
      "node_id": "concept-ai-002",
      "why": "Matched search term: \"intelligence\""
    }
  ],
  "genome": {
    "id": "abc123...",
    "version": "1.0.0"
  }
}
```

**Response (400):** Invalid request (missing/empty text)
```json
{
  "error": "INVALID_REQUEST",
  "message": "Missing required field: text"
}
```

**Response (403):** CDI action denied
```json
{
  "error": "CDI_ACTION_DENIED",
  "reason": "CONSENT_STOP_ACTIVE",
  "alternative": null
}
```

**Response (503):** Memory backend unavailable or genome missing
```json
{
  "reason_code": "GOVERNANCE_INIT_FAILED",
  "message": "Memory backend unavailable"
}
```

---

## Behavior

### Deterministic Interpretation

The interpreter:
1. Extracts key terms from input text (stopword filtering)
2. Searches memory graph for relevant context nodes
3. Generates interpretation summary based on node types and counts
4. Returns citations showing which nodes were used and why

**No external LLM calls** — interpretations are constructed from graph search results only.

### Confidence Scoring

Confidence (0..1) is calculated based on:
- **Context quality**: Number and relevance of context nodes found
- **Query quality**: Input length and structure
- **Base confidence**: 0.3 baseline

Formula:
```
confidence = 0.3 + (context_nodes * 0.1) + query_quality_bonus
confidence = max(0, min(confidence, 1.0))
```

### Citations

Each citation includes:
- `node_id` — Memory graph node ID that was used
- `why` — Explanation of why this node was included (e.g., "Matched search term: 'AI'")

Citations are limited by the `limit` parameter (default: 5).

---

## Governance

### CIF Ingress
- Request payload sanitized before processing
- Max text length: 10,000 characters
- Invalid payloads blocked

### CDI Action Check
- Action: `oi_interpret`
- Requires consent (treaty active)
- Rate limited per client

### Fail-Closed
If any of these conditions fail, the request is denied:
- Memory graph not initialized → 503
- Genome metadata missing → 503
- CDI denies action → 403
- Invalid/empty text → 400

---

## Examples

### Basic interpretation
```bash
curl -X POST http://localhost:3000/oi/interpret \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Explain neural networks",
    "limit": 3
  }'
```

### Response with context
```json
{
  "interpretation": "Query: \"Explain neural networks\". Found 2 relevant nodes in memory graph: 1 concept, 1 definition. Top match: concept (nn-concept-001).",
  "confidence": 0.65,
  "citations": [
    {
      "node_id": "nn-concept-001",
      "why": "Matched search term: \"neural\""
    },
    {
      "node_id": "nn-def-001",
      "why": "Matched search term: \"networks\""
    }
  ],
  "genome": {
    "id": "f4e3...",
    "version": "1.0.0"
  }
}
```

### No context found
```bash
curl -X POST http://localhost:3000/oi/interpret \
  -H "Content-Type: application/json" \
  -d '{
    "text": "nonexistent topic xyz"
  }'
```

Response:
```json
{
  "interpretation": "Query: \"nonexistent topic xyz\". No relevant context found in memory graph.",
  "confidence": 0.3,
  "citations": [],
  "genome": {
    "id": "f4e3...",
    "version": "1.0.0"
  }
}
```

---

## Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_REQUEST` | 400 | Missing/invalid required fields |
| `CIF_INGRESS_BLOCKED` | 400 | CIF blocked payload (oversized/malformed) |
| `CDI_ACTION_DENIED` | 403 | CDI denied action (consent stop, rate limit) |
| `GOVERNANCE_INIT_FAILED` | 503 | Memory backend or interpreter not initialized |
| `GENOME_MISSING` | 503 | Genome metadata missing (boot failure) |

---

## Rate Limiting

OI interpretation is subject to CDI rate limiting:
- **Default:** 10 requests/minute per client
- **Governed by:** `oi_interpret` action policy

Rate limit exceeded returns `429 Too Many Requests`.

---

## Future Enhancements

Potential future additions (not currently implemented):
- Embedding-based relevance scoring
- Multi-turn conversation context
- Structured query language support
- Model adapter integration (Gemini Nano, LlamaCpp)

---

## See Also

- [Memory API](./memory_api.md)
- [CDI Specification](../31-governance/cdi-spec.md)
- [CIF Specification](../31-governance/cif-spec.md)
