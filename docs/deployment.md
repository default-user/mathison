# Mathison Server - Deployment Guide

## Overview

Mathison Server supports two memory backend configurations:

1. **In-Memory** (default) — Ephemeral storage, no persistence
2. **PostgreSQL** — Persistent storage with full hypergraph support

## Environment Variables

### Core Server Configuration

```bash
# Server binding
PORT=3000                    # Default: 3000
HOST=0.0.0.0                # Default: 0.0.0.0

# Storage layer (for checkpoints/receipts)
MATHISON_STORE_BACKEND=FILE  # FILE or MEMORY
MATHISON_STORE_PATH=./data   # Path for FILE backend
```

### Memory Backend Configuration

```bash
# Memory backend selection
MATHISON_MEMORY_BACKEND=postgres  # "memory" (default) or "postgres"

# PostgreSQL connection (when MATHISON_MEMORY_BACKEND=postgres)
PGHOST=localhost
PGPORT=5432
PGDATABASE=mathison
PGUSER=mathison
PGPASSWORD=your_password_here

# Or use connection string
DATABASE_URL=postgresql://mathison:password@localhost:5432/mathison
```

### Governance Configuration

```bash
# CDI settings
MATHISON_CDI_STRICT_MODE=true    # Default: true

# CIF settings
MATHISON_CIF_MAX_REQUEST_SIZE=1048576   # 1MB default
MATHISON_CIF_MAX_RESPONSE_SIZE=1048576  # 1MB default
```

## Deployment Scenarios

### 1. Development (In-Memory)

Fastest startup, no persistence:

```bash
export MATHISON_STORE_BACKEND=MEMORY
export MATHISON_MEMORY_BACKEND=memory

npm run dev
```

Health check:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "memory": {
    "backend": "memory",
    "persistent": false,
    "healthy": true
  }
}
```

### 2. Development (PostgreSQL)

With persistent storage:

```bash
# Start PostgreSQL
docker compose up -d

# Configure environment
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data
export MATHISON_MEMORY_BACKEND=postgres
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mathison
export PGUSER=mathison
export PGPASSWORD=mathison_dev

# Build and start
npm run build
npm start
```

Migrations run automatically on server startup.

Health check:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "memory": {
    "backend": "postgres",
    "persistent": true,
    "healthy": true
  }
}
```

### 3. Production (Docker Compose)

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mathison
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: mathison
    volumes:
      - mathison_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mathison"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  mathison-server:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PORT: 3000
      HOST: 0.0.0.0
      MATHISON_STORE_BACKEND: FILE
      MATHISON_STORE_PATH: /data
      MATHISON_MEMORY_BACKEND: postgres
      PGHOST: postgres
      PGPORT: 5432
      PGDATABASE: mathison
      PGUSER: mathison
      PGPASSWORD: ${POSTGRES_PASSWORD}
      MATHISON_CDI_STRICT_MODE: "true"
    volumes:
      - mathison_data:/data
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  mathison_pgdata:
  mathison_data:
```

Deploy:
```bash
export POSTGRES_PASSWORD=your_secure_password
docker compose -f docker-compose.prod.yml up -d
```

### 4. Production (Kubernetes)

Create ConfigMap:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mathison-config
data:
  PORT: "3000"
  HOST: "0.0.0.0"
  MATHISON_STORE_BACKEND: "FILE"
  MATHISON_STORE_PATH: "/data"
  MATHISON_MEMORY_BACKEND: "postgres"
  PGHOST: "postgres-service"
  PGPORT: "5432"
  PGDATABASE: "mathison"
  PGUSER: "mathison"
```

Create Secret:
```bash
kubectl create secret generic mathison-secrets \
  --from-literal=PGPASSWORD=your_secure_password
```

Deployment:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mathison-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mathison-server
  template:
    metadata:
      labels:
        app: mathison-server
    spec:
      containers:
      - name: mathison
        image: mathison-server:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: mathison-config
        - secretRef:
            name: mathison-secrets
        volumeMounts:
        - name: data
          mountPath: /data
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: mathison-pvc
```

## Database Migrations

### Automatic (Recommended)

Migrations run automatically on server startup when `MATHISON_MEMORY_BACKEND=postgres`.

Server boot sequence:
1. Load environment configuration
2. Initialize governance layer
3. Run database migrations (if PostgreSQL)
4. Initialize memory backend
5. Start HTTP server

### Manual

Run migrations separately:

```bash
cd packages/mathison-memory

# Set database credentials
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mathison
export PGUSER=mathison
export PGPASSWORD=your_password

# Run migrations
npm run migrate
```

### Migration Files

Located in `packages/mathison-memory/migrations/`:

```
001_initial_schema.sql  — Nodes, edges, hyperedges tables + indexes
```

## Monitoring & Health Checks

### Health Endpoint

```bash
curl http://localhost:3000/health
```

Response fields:

| Field | Description |
|-------|-------------|
| `status` | `healthy` or `degraded` (database unreachable) |
| `bootStatus` | `booting`, `ready`, or `failed` |
| `governance.treaty.version` | Active treaty version |
| `memory.backend` | `memory` or `postgres` |
| `memory.persistent` | `true` if PostgreSQL, `false` if in-memory |
| `memory.healthy` | Database connectivity status |
| `memory.error` | Error message if unhealthy |

### Database Connection Issues

If health check shows `memory.healthy: false`:

1. **Check PostgreSQL availability**:
   ```bash
   psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -c 'SELECT NOW()'
   ```

2. **Check connection pool**:
   - Default pool size: 20 connections
   - Increase if needed: Add `max` to `postgresConfig` in server code

3. **Check migration status**:
   ```bash
   psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -c 'SELECT * FROM schema_migrations ORDER BY version'
   ```

4. **Restart server** (migrations will retry):
   ```bash
   npm restart
   ```

## Performance Tuning

### PostgreSQL Configuration

For production workloads, tune PostgreSQL:

```sql
-- Connection pooling
max_connections = 100

-- Memory
shared_buffers = 256MB
effective_cache_size = 1GB

-- Query planner
random_page_cost = 1.1  -- For SSD storage

-- Autovacuum (for JSONB tables)
autovacuum = on
autovacuum_analyze_scale_factor = 0.05
```

### Indexes

Pre-created indexes (from migration 001):

- GIN index on `nodes.data` (JSONB path ops)
- GIN index for full-text search on node names/descriptions
- B-tree indexes on all foreign keys
- Composite index on `edges(source, target)`

### Connection Pool

Default: 20 connections per server instance.

Increase for high-concurrency:

```typescript
const backend = new PostgreSQLBackend({
  host: 'localhost',
  port: 5432,
  database: 'mathison',
  user: 'mathison',
  password: 'password',
  max: 50  // Increase pool size
});
```

## Backup & Recovery

### PostgreSQL Backup

```bash
pg_dump -h $PGHOST -U $PGUSER -d $PGDATABASE -F c -b -v -f mathison_backup.dump
```

### Restore

```bash
pg_restore -h $PGHOST -U $PGUSER -d $PGDATABASE -v mathison_backup.dump
```

### Continuous Backup (WAL Archiving)

Configure in `postgresql.conf`:

```
wal_level = replica
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'
```

## Security Hardening

### 1. Database Credentials

Never commit credentials to version control.

Use secrets management:
- **Docker**: Docker Secrets
- **Kubernetes**: Sealed Secrets or External Secrets Operator
- **Cloud**: AWS Secrets Manager, GCP Secret Manager, Azure Key Vault

### 2. Network Isolation

Restrict PostgreSQL access:

```yaml
# docker-compose.yml
services:
  postgres:
    networks:
      - backend  # Not exposed to public

  mathison-server:
    networks:
      - backend
      - frontend

networks:
  backend:
    internal: true
  frontend:
```

### 3. SSL/TLS for PostgreSQL

Enable SSL in PostgreSQL:

```
ssl = on
ssl_cert_file = '/path/to/server.crt'
ssl_key_file = '/path/to/server.key'
```

Update connection:
```bash
export DATABASE_URL="postgresql://user:pass@host:5432/mathison?sslmode=require"
```

### 4. Audit Logging

Audit logs written to `logs/audit.jsonl`.

Mount as persistent volume in production:

```yaml
volumes:
  - ./logs:/app/logs
```

Rotate logs with logrotate or external log aggregation (Loki, Elasticsearch).

## Troubleshooting

### Server won't start (MIGRATION_FAILED)

**Cause**: Database unreachable or migration file missing.

**Fix**:
1. Verify database is running: `docker compose ps`
2. Check credentials: `psql -h $PGHOST -U $PGUSER -d $PGDATABASE`
3. Verify migration files exist: `ls packages/mathison-memory/migrations/`

### Health check returns "degraded"

**Cause**: Database connection pool exhausted or PostgreSQL down.

**Fix**:
1. Check PostgreSQL status: `docker compose logs postgres`
2. Increase connection pool: `max: 50` in PostgreSQLBackend config
3. Restart server to reset pool

### Memory API returns empty results

**Cause**: Using sync API (getNode, search) with PostgreSQL backend.

**Fix**: Use async API instead:

```typescript
// Bad (sync API with PostgreSQL)
const node = memoryGraph.getNode('id');  // Always returns undefined

// Good (async API)
const node = await memoryGraph.getNodeAsync('id');
```

### Data not persisting

**Cause**: `MATHISON_MEMORY_BACKEND` not set to `postgres`.

**Fix**:
```bash
export MATHISON_MEMORY_BACKEND=postgres
npm restart
```

Verify:
```bash
curl http://localhost:3000/health | jq '.memory.backend'
# Should return: "postgres"
```

## Scaling

### Horizontal Scaling

Multiple server instances share PostgreSQL:

```yaml
version: '3.8'
services:
  mathison-server:
    image: mathison-server:latest
    deploy:
      replicas: 5  # 5 instances
    environment:
      MATHISON_MEMORY_BACKEND: postgres
      PGHOST: postgres
```

Each instance gets its own connection pool (20 connections × 5 = 100 total).

### Read Replicas

For read-heavy workloads, use PostgreSQL replicas:

1. Configure primary-replica replication
2. Point read-only queries to replica
3. Keep writes on primary

(Future: MemoryBackend interface could support separate read/write backends)

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/mathison/issues
- Documentation: `/docs`

---

**Version:** 0.1.0 (Phase 3-A)
