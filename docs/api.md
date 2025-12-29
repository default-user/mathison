# Mathison API Documentation

**Version:** 0.1.0
**Base URL:** `http://localhost:3000`
**Governance:** All endpoints protected by CIF + CDI (except `/health`)

## Overview

Mathison Server provides a governed HTTP API for executing jobs with full checkpoint/resume capabilities and audit trails. Every request passes through a mandatory governance pipeline:

1. **CIF Ingress** — Rate limiting, input sanitization, size checks
2. **CDI Action Check** — Consent tracking, anti-hive enforcement, fail-closed logic
3. **Business Logic** — Job execution with checkpoints
4. **CDI Output Check** — Response validation, no personhood claims
5. **CIF Egress** — PII scrubbing, leak detection, audit logging

**Fail-Closed:** Any governance component failure → 503 or 403 (no bypass)

---

## Endpoints

### Health Check

**GET /health**

Health check endpoint (ONLY endpoint that bypasses governance).

**Response (200):**
```json
{
  "status": "healthy",
  "governance": "ready",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Run Job

**POST /v1/jobs/run**

Start a new job with full governance checks and checkpoint/receipt generation.

**Governance Action:** `run_job`

**Request Body:**
```json
{
  "job": "tiriti-audit",
  "in": "docs/tiriti.md",
  "outdir": "dist/tiriti",
  "policy": "policies/tiriti_invariants.v1.json"  // optional
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job` | string | Yes | Job type (`tiriti-audit`) |
| `in` | string | Yes | Input file path |
| `outdir` | string | Yes | Output directory path |
| `policy` | string | No | Policy file path (default: `policies/tiriti_invariants.v1.json`) |

**Success Response (200):**
```json
{
  "job_id": "tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4",
  "status": "COMPLETED",
  "message": "Job completed successfully"
}
```

**Error Responses:**

**400 Bad Request — Missing Fields:**
```json
{
  "error": "Bad Request",
  "message": "Missing required fields: job, in, outdir",
  "code": "MISSING_FIELDS"
}
```

**400 Bad Request — Unknown Job Type:**
```json
{
  "error": "Bad Request",
  "message": "Unknown job type: invalid-job",
  "code": "UNKNOWN_JOB_TYPE"
}
```

**403 Forbidden — CIF Ingress Denied:**
```json
{
  "error": "Forbidden",
  "message": "CIF ingress denied",
  "violations": ["rate_limit_exceeded"],
  "code": "CIF_INGRESS_DENIED"
}
```

**403 Forbidden — CDI Action Denied:**
```json
{
  "error": "Forbidden",
  "message": "CDI action denied",
  "reason": "Stop signal active for source: 127.0.0.1",
  "verdict": "deny",
  "code": "CDI_ACTION_DENIED"
}
```

**403 Forbidden — CDI Output Denied:**
```json
{
  "error": "Forbidden",
  "message": "CDI output check denied",
  "violations": ["personhood_claim"],
  "code": "CDI_OUTPUT_DENIED"
}
```

**503 Service Unavailable — Governance Not Ready:**
```json
{
  "error": "Service Unavailable",
  "message": "Governance components not initialized (CDI missing)",
  "code": "GOVERNANCE_NOT_READY"
}
```

**Example (curl):**
```bash
curl -X POST http://localhost:3000/v1/jobs/run \
  -H "Content-Type: application/json" \
  -d '{
    "job": "tiriti-audit",
    "in": "docs/tiriti.md",
    "outdir": "dist/tiriti"
  }'
```

---

### Get Job Status

**GET /v1/jobs/:job_id/status**

Retrieve the current status and progress of a job.

**Governance Action:** `get_job_status`

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | string | Job identifier (from run response) |

**Success Response (200):**
```json
{
  "job_id": "tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4",
  "job_type": "tiriti-audit",
  "status": "COMPLETED",
  "current_stage": "DONE",
  "completed_stages": ["LOAD", "NORMALIZE", "GOVERNANCE_CHECK", "RENDER", "VERIFY", "DONE"],
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:15.000Z",
  "error": null
}
```

**Status Values:**

- `PENDING` — Job created but not started
- `IN_PROGRESS` — Job currently executing
- `COMPLETED` — Job finished successfully
- `FAILED` — Job failed permanently (cannot resume)
- `RESUMABLE_FAILURE` — Job failed but can be resumed

**Error Response (404):**
```json
{
  "error": "Not Found",
  "message": "Job not found: invalid-job-id",
  "code": "JOB_NOT_FOUND"
}
```

**Example (curl):**
```bash
curl http://localhost:3000/v1/jobs/tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4/status
```

---

### Resume Job

**POST /v1/jobs/:job_id/resume**

Resume a failed or incomplete job from its last checkpoint.

**Governance Action:** `resume_job`

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | string | Job identifier to resume |

**Success Response (200):**
```json
{
  "job_id": "tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4",
  "status": "COMPLETED",
  "message": "Job resumed and completed successfully"
}
```

**Error Responses:**

**400 Bad Request — Already Completed:**
```json
{
  "error": "Bad Request",
  "message": "Job already completed",
  "code": "JOB_ALREADY_COMPLETED"
}
```

**400 Bad Request — Permanent Failure:**
```json
{
  "error": "Bad Request",
  "message": "Job failed permanently, cannot resume",
  "code": "JOB_FAILED_PERMANENT"
}
```

**404 Not Found:**
```json
{
  "error": "Not Found",
  "message": "Job not found: invalid-job-id",
  "code": "JOB_NOT_FOUND"
}
```

**Example (curl):**
```bash
curl -X POST http://localhost:3000/v1/jobs/tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4/resume
```

---

### Get Job Receipts

**GET /v1/jobs/:job_id/receipts**

Retrieve all audit receipts (event log entries) for a job.

**Governance Action:** `get_job_receipts`

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | string | Job identifier |

**Success Response (200):**
```json
{
  "job_id": "tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4",
  "count": 12,
  "receipts": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "job_id": "tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4",
      "stage": "LOAD",
      "action": "checkpoint_created",
      "inputs_hash": "sha256:abc123...",
      "outputs_hash": null,
      "decision": null,
      "policy_id": null,
      "notes": "Starting tiriti-audit job"
    },
    {
      "timestamp": "2024-01-15T10:30:02.000Z",
      "job_id": "tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4",
      "stage": "GOVERNANCE_CHECK",
      "action": "governance_decision",
      "inputs_hash": "sha256:abc123...",
      "outputs_hash": "sha256:def456...",
      "decision": "ALLOW",
      "policy_id": "tiriti_invariants.v1",
      "notes": "All 7 CRITICAL invariants passed"
    }
  ]
}
```

**Receipt Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 timestamp |
| `job_id` | string | Job identifier |
| `stage` | string | Job stage (`LOAD`, `NORMALIZE`, etc.) |
| `action` | string | Action type |
| `inputs_hash` | string | SHA-256 hash of inputs (nullable) |
| `outputs_hash` | string | SHA-256 hash of outputs (nullable) |
| `decision` | string | Governance decision (`ALLOW`/`DENY`/`TRANSFORM`, nullable) |
| `policy_id` | string | Policy identifier (nullable) |
| `notes` | string | Additional notes (nullable) |

**Example (curl):**
```bash
curl http://localhost:3000/v1/jobs/tiriti-audit-2024-01-15T10-30-00-000Z-a1b2c3d4/receipts
```

---

## Governance Details

### CIF (Context Integrity Firewall)

**Ingress Protection:**
- **Rate Limiting:** 100 requests per minute per client IP (token bucket)
- **Input Sanitization:** XSS, SQL injection patterns removed
- **Size Limits:** 1MB max request size
- **PII Detection:** Email, SSN, credit card patterns flagged

**Egress Protection:**
- **PII Scrubbing:** Sensitive data redacted from responses
- **Secret Detection:** API keys, private keys blocked
- **Size Limits:** 1MB max response size
- **Audit Logging:** All egress events logged

### CDI (Conscience Decision Interface)

**Action Evaluation:**
- **Consent Tracking:** "stop" signals prevent all actions from that source
- **Anti-Hive:** Detects and blocks identity fusion attempts
- **Non-Personhood:** Blocks claims of sentience, consciousness, suffering
- **Fail-Closed:** Uncertainty defaults to DENY

**Verdicts:**
- `allow` — Action permitted
- `transform` — Action permitted with modifications
- `deny` — Action blocked
- `uncertain` — Treated as deny (fail-closed)

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_FIELDS` | 400 | Required request fields missing |
| `UNKNOWN_JOB_TYPE` | 400 | Unrecognized job type |
| `JOB_ALREADY_COMPLETED` | 400 | Cannot resume completed job |
| `JOB_FAILED_PERMANENT` | 400 | Cannot resume permanently failed job |
| `JOB_NOT_FOUND` | 404 | Job ID does not exist |
| `CIF_INGRESS_DENIED` | 403 | CIF ingress check failed |
| `CDI_ACTION_DENIED` | 403 | CDI action check failed |
| `CDI_OUTPUT_DENIED` | 403 | CDI output check failed |
| `CIF_EGRESS_DENIED` | 403 | CIF egress check failed |
| `GOVERNANCE_NOT_READY` | 503 | Governance components not initialized |
| `CIF_INGRESS_ERROR` | 503 | CIF ingress error occurred |
| `CDI_ACTION_ERROR` | 503 | CDI action check error occurred |
| `EGRESS_ERROR` | 503 | Egress check error occurred |
| `JOB_EXECUTION_FAILED` | 500 | Job execution error |
| `STATUS_FETCH_FAILED` | 500 | Error fetching job status |
| `RESUME_FAILED` | 500 | Error resuming job |
| `RECEIPTS_FETCH_FAILED` | 500 | Error fetching receipts |

---

## Rate Limiting

**Default Configuration:**
- **Window:** 60 seconds
- **Max Requests:** 100 per client IP
- **Algorithm:** Token bucket with refill

**Rate Limited Response (403):**
```json
{
  "error": "Forbidden",
  "message": "CIF ingress denied",
  "violations": ["rate_limit_exceeded"],
  "code": "CIF_INGRESS_DENIED"
}
```

---

## Job Types

### tiriti-audit

Validate a governance treaty document against policy invariants.

**Stages:**
1. `LOAD` — Read treaty file
2. `NORMALIZE` — Clean and parse content
3. `GOVERNANCE_CHECK` — Validate against policy
4. `RENDER` — Generate output files
5. `VERIFY` — Hash-based idempotency checks
6. `DONE` — Completion

**Inputs:**
- `in`: Path to treaty markdown file
- `outdir`: Directory for output artifacts
- `policy`: Policy JSON file (optional)

**Outputs:**
- Checkpoint file in `.mathison/checkpoints/`
- Event log entries in `.mathison/eventlog.jsonl`
- Rendered artifacts in `outdir/`

---

## Starting the Server

```bash
# Development mode (with hot reload)
pnpm --filter mathison-server dev

# Production mode
pnpm --filter mathison-server start

# Custom port
PORT=8080 pnpm --filter mathison-server start
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `HOST` | 127.0.0.1 | Bind address |

---

## See Also

- [docs/architecture.md](./architecture.md) — System architecture and governance flow
- [docs/tiriti.md](./tiriti.md) — Governance treaty
- [docs/cdi-spec.md](./cdi-spec.md) — CDI specification
- [docs/cif-spec.md](./cif-spec.md) — CIF specification
