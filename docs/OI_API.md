# OI API — Open Interpretation

**Mathison OI (Open Interpretation)** — Deterministic interpretation endpoint using MemoryGraph context.

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

- [Memory API](./MEMORY_API.md)
- [CDI Specification](./cdi-spec.md)
- [CIF Specification](./cif-spec.md)
