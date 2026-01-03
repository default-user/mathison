# Jobs API

**Mathison Jobs API** — Production-grade job execution with checkpointing, resumption, and streaming status.

---

## Overview

All job endpoints enforce:
- **Governed execution** — CIF + CDI pipeline for all operations
- **Checkpointing** — Deterministic resume from crash/restart
- **Timeouts** — Bounded resource usage (default: 30s)
- **Receipts** — All side effects produce receipts with genome metadata
- **Idempotency** — Safe retries with explicit job IDs

---

## Endpoints

### POST /jobs/run

Execute a job (create new or resume existing).

**Request Body:**
```json
{
  "jobType": "data_transform",
  "inputs": { "source": "file.csv" },
  "policyId": "policy-001",
  "jobId": "optional-explicit-job-id"
}
```

**Fields:**
- `jobType` (required, string) — Type of job to execute
- `inputs` (optional, object) — Job inputs
- `policyId` (optional, string) — Governance policy override
- `jobId` (optional, string) — Explicit job ID for resumption

**Response (200):**
```json
{
  "job_id": "job-abc123",
  "status": "completed",
  "resumable": false,
  "outputs": { "result": "success" },
  "decision": "ALLOWED",
  "genome_id": "f4e3...",
  "genome_version": "1.0.0"
}
```

**Response (400):** Missing required fields
**Response (403):** CDI action denied
**Response (408):** Job timeout

---

### GET /jobs/status

Get job status (single job or list all jobs).

**Query Parameters:**
- `job_id` (optional) — Specific job ID to query
- `limit` (optional) — Max results for list (default: 10, max: 100)

**Example:** `/jobs/status?job_id=job-abc123`

**Response (200) — Single job:**
```json
{
  "job_id": "job-abc123",
  "job_type": "data_transform",
  "status": "completed",
  "current_stage": "finalize",
  "completed_stages": ["init", "process", "finalize"],
  "inputs": { "source": "file.csv" },
  "outputs": { "result": "success" },
  "timestamps": {
    "created": "2025-12-31T12:00:00Z",
    "started": "2025-12-31T12:00:01Z",
    "completed": "2025-12-31T12:00:05Z"
  }
}
```

**Response (200) — List all:**
```json
{
  "jobs": [
    {
      "job_id": "job-abc123",
      "job_type": "data_transform",
      "status": "completed"
    },
    {
      "job_id": "job-def456",
      "job_type": "analysis",
      "status": "running"
    }
  ],
  "total": 2
}
```

**Response (404):** Job not found

---

### POST /jobs/resume

Resume a paused or failed job.

**Request Body:**
```json
{
  "job_id": "job-abc123"
}
```

**Response (200):**
```json
{
  "job_id": "job-abc123",
  "status": "completed",
  "resumable": false,
  "outputs": { "result": "success" },
  "genome_id": "f4e3...",
  "genome_version": "1.0.0"
}
```

**Response (400):** Missing job_id
**Response (404):** Job not found
**Response (409):** Job not resumable (already completed or error state)

---

### GET /jobs/logs

Get job receipts/events (all or by job_id).

**Query Parameters:**
- `job_id` (optional) — Specific job ID
- `limit` (optional) — Max results (default: 100)

**Example:** `/jobs/logs?job_id=job-abc123&limit=10`

**Response (200):**
```json
{
  "job_id": "job-abc123",
  "receipts": [
    {
      "receipt_id": "receipt-001",
      "action": "job_checkpoint_created",
      "timestamp": 1704067200000,
      "genome_id": "f4e3...",
      "genome_version": "1.0.0",
      "content_hash": "sha256:...",
      "reason": "ALLOWED"
    },
    {
      "receipt_id": "receipt-002",
      "action": "job_stage_completed",
      "timestamp": 1704067203000,
      "genome_id": "f4e3...",
      "genome_version": "1.0.0",
      "content_hash": "sha256:...",
      "reason": "ALLOWED"
    }
  ],
  "total": 2
}
```

**Response (200) — All logs:**
```json
{
  "receipts": [
    { "receipt_id": "receipt-001", "job_id": "job-abc123", "action": "job_checkpoint_created", "timestamp": 1704067200000 },
    { "receipt_id": "receipt-002", "job_id": "job-def456", "action": "job_checkpoint_created", "timestamp": 1704067205000 }
  ],
  "total": 2
}
```

**Response (200) — No logs:**
```json
{
  "receipts": [],
  "total": 0
}
```

---

## Checkpoint/Resume Semantics

### Checkpointing

Jobs are checkpointed at stage boundaries:
- **Init** — Job created, inputs validated
- **Process** — Main execution
- **Finalize** — Cleanup and output generation

Checkpoints include:
- `job_id`, `job_type`, `status`, `current_stage`, `completed_stages`
- `inputs`, `outputs`, `timestamps`

### Resumption

Jobs can be resumed after crash/restart if:
- Status is `running` or `paused`
- Not yet `completed` or in `error` state

Resume behavior:
- Loads checkpoint from storage
- Skips completed stages
- Continues from `current_stage`

### Determinism

Resume is deterministic:
- Same inputs + same completed stages → same outputs
- Side effects replay via ActionGate (idempotent)
- No duplicate receipts (idempotency tracking)

---

## Timeouts and Resource Limits

### Job Timeout
- **Default:** 30 seconds
- **Max:** Configurable via server config
- **Behavior:** Job fails with `timeout` status if exceeded

### Concurrent Jobs
- **Default:** 100 max concurrent jobs
- **Behavior:** New jobs denied with `429 Too Many Requests` if limit exceeded

### Bounded Resources
- Memory: Jobs should not exceed server memory limits (monitored externally)
- CPU: No CPU limits enforced (relies on timeout)

---

## Governance

### CIF Ingress
- Request payloads sanitized
- Job inputs validated for size/structure

### CDI Action Check
- Action: `job_run`, `job_resume`
- Requires consent (treaty active)
- Rate limited per client

### Receipts
All job operations produce receipts:
- Job creation → `job_checkpoint_created` receipt
- Stage completion → `job_stage_completed` receipt
- Job completion → `job_completed` receipt

Receipts always include:
- `genome_id`, `genome_version`
- `action`, `timestamp`
- `content_hash` (checkpoint state hash)
- `reason` (CDI verdict)

---

## Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_REQUEST` | 400 | Missing/invalid required fields |
| `CDI_ACTION_DENIED` | 403 | CDI denied action |
| `JOB_NOT_FOUND` | 404 | Job ID not found |
| `JOB_TIMEOUT` | 408 | Job exceeded timeout |
| `JOB_NOT_RESUMABLE` | 409 | Job cannot be resumed (completed/error) |
| `TOO_MANY_JOBS` | 429 | Concurrent job limit exceeded |
| `GOVERNANCE_INIT_FAILED` | 503 | ActionGate not initialized |

---

## Examples

### Run a job
```bash
curl -X POST http://localhost:3000/jobs/run \
  -H "Content-Type: application/json" \
  -d '{
    "jobType": "data_analysis",
    "inputs": { "dataset": "sales-2025" }
  }'
```

### Check job status
```bash
curl http://localhost:3000/jobs/status?job_id=job-abc123
```

### Resume a failed job
```bash
curl -X POST http://localhost:3000/jobs/resume \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job-abc123"
  }'
```

### Get job logs
```bash
curl http://localhost:3000/jobs/logs?job_id=job-abc123
```

---

## Crash/Restart Scenario

**Before crash:**
1. Job `job-abc123` starts
2. Completes stages: `init`, `process`
3. Server crashes during `finalize`

**After restart:**
4. POST /jobs/resume `{"job_id": "job-abc123"}`
5. Job loads checkpoint: `current_stage=finalize`, `completed_stages=[init, process]`
6. Job resumes from `finalize` (skips `init`, `process`)
7. Job completes successfully

**Idempotency:**
- Side effects from `init` and `process` are not re-executed
- Only `finalize` side effects are executed
- Receipts from previous run are preserved

---

## See Also

- [Memory API](./MEMORY_API.md)
- [CDI Specification](./cdi-spec.md)
- [ActionGate Documentation](./action-gate.md)
