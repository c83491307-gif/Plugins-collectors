# CEPX — Continuous Execution & Project Context Engine

CEPX externalizes project continuity; it does not bypass ChatGPT's platform context limits. It stores durable project state, compresses structured handoffs, tracks idempotent tasks and dependencies, checkpoints/recovery, and executes ordered tool fallbacks.

## Five layers
1. Project memory: atomic JSON persistence with mode 0600.
2. Context compression: deterministic prioritized summary, deduplication, budget and checksum.
3. Execution ledger: idempotent task creation, dependency-aware transitions, attempt/evidence history.
4. Recovery: checksummed checkpoints, inspection and explicit restore.
5. Tool fallback: priority, bounded retries, timeout and circuit cooldown.

State file: CEPX_STATE_FILE (default ./data/cepx/projects.json). Do not store secrets. JSON store serializes writes within one Node process; use transactional DB/Redis for multi-process deployments.

## API
The engine is exported from orchestrator/cepx/index.mjs. Methods: ensureProject, list, get, enqueue, transition, compress, checkpoint, inspect, restore, registerTool, execute, handoff.

## Verification
Run npm run cepx and npm run verify:all. GitHub workflow matrix validates Node 20 and 22. Full workflow must pass before merge or deployment.

## Dashboard
Open `/ui/cepx.html` while the orchestrator server is running. The dashboard uses the CEPX API, supports project creation, task transitions, checkpoint inspection and restore, and handoff generation. If CEPX_API_TOKEN is configured, enter it in the dashboard. The token is stored in browser localStorage; use this only on a trusted device and clear it after use.

## API security
When CEPX_API_TOKEN is configured, all CEPX API requests require a matching Bearer token. Without a token, only loopback requests are allowed. Do not expose the server directly to an untrusted network without a token and TLS/reverse-proxy controls. Request bodies are JSON; do not place credentials or secrets in project notes, task descriptions, handoffs, or evidence.

## Verification detail
`npm run cepx` runs both the engine unit/concurrency suite and authenticated HTTP API integration suite. CI runs this command in the Node 20/22 matrix after the existing syntax, targeted, provider, smoke and stress suites.

## Distributed JSON backend (local shared filesystem)
The JSON backend now coordinates transactions across Node processes using an exclusive lock directory adjacent to the state file. A transaction acquires the lock, reads the latest state, applies its mutation, writes a unique mode-0600 temporary file, fsyncs it, atomically renames it over the state file, and releases only the lock token it owns. A heartbeat refreshes the lease. Stale locks are reclaimed after the lease expires; a live owner on the same host is not reclaimed merely because its lease appears old.

This provides cross-process serialization only when all participating processes access the same state path on a filesystem that reliably supports atomic directory creation and rename semantics. It is not a distributed consensus protocol and is not a safe multi-region/network-filesystem guarantee. For independent hosts or cloud-scale deployments, use a transactional shared database (for example PostgreSQL with row/advisory locks) or a Redis-backed coordination/state adapter; that adapter is not implemented in this stage. Set the same absolute CEPX_STATE_FILE path for every local worker. Monitor lock timeouts and disk capacity, and keep backups outside the live state path.

## Distributed verification
`npm run cepx` also launches four independent Node worker processes against one shared state file. The suite checks 80 distinct concurrent task writes, cross-process idempotency for a shared task, checkpoint creation, and recovery from an expired dead-owner lock. The same suite runs in the Node 20 and Node 22 CI matrix.

## Performance work
The JSON writer now emits compact JSON to reduce serialization and disk I/O overhead. `enqueueMany(projectId, items)` adds a set of tasks in one locked read-modify-write transaction, preserving fingerprint idempotency and dependency validation while avoiding one full state rewrite per task. The existing single-task `enqueue` API remains unchanged.

## Performance benchmark and guardrails
Run `npm run cepx` to execute the performance benchmark after the engine, API, and multiprocess suites. The benchmark creates a temporary state directory, compares sequential single-task ingestion with atomic batch ingestion, samples p50/p95/max latency for reads and context compression, records checkpoint latency, state-file size, heap use and event-loop delay, validates resulting task counts, and removes its temporary data. CI executes it under both Node 20 and Node 22. Benchmark output is diagnostic evidence, not a cross-machine performance SLA; absolute timing varies by runner and filesystem. The only hard timing guard in this test is a generous 30-second single-enqueue ceiling to catch pathological stalls.

## Scale, memory and restart recovery
The CEPX CI suite also runs a 10,000-task bulk-ingestion scenario on Node 20 and Node 22. It records bulk duration, throughput, committed JSON size and observed heap delta; validates unique fingerprints and exact task count; creates and inspects a checksummed checkpoint; restarts the engine against the same committed file; restores the checkpoint; and verifies replayed bulk input is fully deduplicated. The test also leaves an intentionally incomplete orphan temporary file before the transaction and verifies that only the atomically renamed state is read. These measurements are runner diagnostics, not memory or throughput SLAs.

For a larger local stress run, set `CEPX_SCALE_TASKS=100000` before `npm run cepx`. The scale test is bounded to 100,000 synthetic tasks and cleans its temporary directory after completion. This validates single-host JSON scale/restart behavior; it does not establish multi-host consensus or replace a transactional database backend.

## PostgreSQL backend
The original atomic JSON backend remains the default and requires no database. An optional PostgreSQL store is available through `orchestrator/cepx/postgres-store.mjs`. It persists the same CEPX state document as JSONB, partitioned by a configurable namespace, so existing domain operations and checkpoint formats remain compatible.

The PostgreSQL adapter uses versioned migrations recorded in `cepx_schema_migrations` with SHA-256 checksums. Writes run in SQL transactions, acquire a transaction-scoped PostgreSQL advisory lock, lock the namespace row with `SELECT ... FOR UPDATE`, and commit the updated state atomically. Separate Node processes and hosts using the same database and namespace serialize through PostgreSQL rather than filesystem locks. Failed mutations roll back without persisting partial state.

Install dependencies with `npm install`. To create a PostgreSQL runtime, set `CEPX_DATABASE_URL` and call `createRuntimeAsync()`, or pass `{cepx:{backend:"postgres",databaseUrl:"...",namespace:"..."}}`. The synchronous `createRuntime()` remains compatible with existing JSON deployments; it also accepts an already-created `pg.Pool` as `{cepx:{backend:"postgres",pool,namespace}}`. Use a distinct namespace for each independent CEPX installation sharing one database. Call `runtime.close()` for runtimes created by `createRuntimeAsync()`.

CI provisions PostgreSQL 16 and runs the adapter integration suite in both Node 20 and Node 22. It validates migrations and checksum tracking, namespace isolation, independent connection pools, concurrent writes and global idempotency, transaction rollback, checkpoint restore, async runtime construction, and continued JSON backend operation. PostgreSQL availability is required for this integration suite; local `npm run cepx` reports a clear skip when `CEPX_TEST_DATABASE_URL` is unset.


## Safe JSON → PostgreSQL migration

Use `node orchestrator/cepx/migrate-json-to-postgres.mjs --file ./data/cepx/projects.json --namespace production` to preview a migration. Preview is the default and never writes to PostgreSQL. Supply `--database-url` or set `CEPX_DATABASE_URL`; the CLI does not fall back to a generic `DATABASE_URL`.

Apply only after reviewing the preview by adding `--apply`. The tool validates the CEPX schema and project/task identities, computes a canonical SHA-256 checksum, and refuses to overwrite a destination namespace that is neither empty nor already byte-semantically equivalent. The first apply creates an exclusive byte-identical backup beside the source (or at `--backup <path>`), imports the full state in one PostgreSQL transaction, reads it back, and compares canonical checksums. It then re-reads the source to detect concurrent edits. The original JSON file is never modified or deleted.

An interrupted run is safe to retry: an already equivalent destination is reported as migrated and verified without re-importing or replacing the backup. A conflicting destination fails closed. The tool intentionally does not automatically switch runtime traffic or remove the JSON file; cutover and retention are separate operator decisions.

Example:

```sh
cd orchestrator
node cepx/migrate-json-to-postgres.mjs --file ./data/cepx/projects.json --namespace main
node cepx/migrate-json-to-postgres.mjs --file ./data/cepx/projects.json --namespace main --apply
```

The PostgreSQL integration suite verifies preview non-mutation, exact backup/source preservation, source/target checksum equality, idempotent retries, and refusal to overwrite a populated conflicting namespace under Node 20 and Node 22.


## Enterprise isolation and operations (schema v2)

The CEPX enterprise extension is in `orchestrator/cepx/enterprise.mjs` and is attached as `runtime.cepx.enterprise`. `CEPX.ready()` applies the idempotent v1→v2 state migration for both JSON and PostgreSQL stores. It preserves existing projects and adds tenant membership, event, quota, archive, lease, DLQ, encryption-key and plugin-contract metadata.

- **Tenant boundary / project RBAC:** projects carry a tenant ID; project reads, task listing/writes, checkpoints and archive operations verify tenant ownership and roles. Tenant roles are owner, admin, editor and viewer; per-project grants can override tenant defaults using `grantProject` / `revokeProject`, with project owners able to delegate. The CEPX HTTP API resolves identities from `CEPX_API_PRINCIPALS` (JSON map keyed by bearer token, each value containing `tenantId` and `userId`). The legacy single `CEPX_API_TOKEN` remains a compatibility owner for the default tenant; do not reuse that shared token across tenants.
- **Schema versioning:** state has `schemaVersion`; v1→v2 is repeatable and refuses future versions.
- **Encryption and rotation:** AES-256-GCM envelopes are tenant-bound and carry key versions. Rotation retains prior key versions for decrypting existing records. Set a stable `CEPX_MASTER_KEY` (or `APP_MASTER_KEY`) before production use; an ephemeral fallback key is not suitable for restart-safe production encryption.
- **Signed recovery points:** Ed25519 signatures cover canonical checkpoint content. Verification failure marks the checkpoint invalid; signed restore verifies before applying.
- **Retention/archive:** archive records contain checksums and retention deadlines. Retention evaluation marks eligible archives but deliberately preserves evidence; deletion is not automatic. Periodic backup scheduling and automated purge are not enabled by this layer.
- **Event sequencing:** tenant-scoped sequence numbers, correlation/causation IDs and a SHA-256 hash chain support gap/tamper checks.
- **DLQ and retries:** failed task envelopes retain attempt count, error and capped exponential-backoff schedule; replay is explicit and status-tracked. Automatic interception of every worker failure and an autonomous retry dispatcher remain worker-integration work.
- **Worker leases:** lease tokens and expiry prevent concurrent claims for the same tenant/project/task; priority is recorded on leases. Scheduler stop rejects new claims and reports whether active leases have drained. A continuously running worker-pool loop is not started automatically.
- **Observability:** runtime health and operation/latency samples are exposed by the enterprise service; this is an in-process baseline, not an external OpenTelemetry exporter or distributed tracing collector.
- **Pagination / quotas:** tenant-scoped cursor pagination supports task status/search and project search/sort. Per-tenant task quotas and rolling one-minute request limits reject excess use.
- **Backup/restore:** tenant-scoped snapshots include a checksum and restore refuses cross-tenant project collisions. Backup drill verifies the restore path; persist backup artifacts outside the primary store for disaster recovery. Scheduled off-host backup orchestration is not yet automatic.
- **Property/chaos verification:** deterministic generated event sequences check chain invariants; injected transaction failure verifies rollback. This is a deterministic property/chaos smoke suite, not a broad randomized fault-injection campaign.
- **Plugin contracts:** version/API metadata and required capabilities must negotiate successfully before a contract can be enabled.

The CEPX API now uses tenant-aware service methods for project creation/list/read, task create/list/transition, signed checkpoints/recovery, and handoff. Configure multiple principals using a JSON object such as:

```json
{
  "token-for-tenant-a": {"tenantId":"tenant-a","userId":"alice"},
  "token-for-tenant-b": {"tenantId":"tenant-b","userId":"bob"}
}
```

Tenant memberships must be provisioned before those principals can access projects. Do not put real bearer tokens in source control. Run `npm run cepx` to include the enterprise isolation and chaos/property suite in both Node 20 and Node 22 CI jobs.


## Integrated main application workspace

The main application at `/ui/` now includes a **CEPX Workspace** navigation entry in addition to Chat, Providers, Models, Scanner Hub and Runtime. The workspace connects to the same authenticated `/api/cepx/*` service and the active CEPX storage backend; it does not create a second database or silently migrate data.

Workspace tools include tenant-scoped project listing/creation, task creation and state transitions, signed checkpoint creation and restore, handoff generation, event-chain verification and recent event inspection, runtime health, and tenant backup export with the server-generated checksum. The new `GET /api/cepx/events?limit=N` endpoint returns only the authenticated tenant's recent events (maximum 100) and requires read permission. The separate `/ui/cepx.html` control center remains available for compatibility.

The dashboard reads the existing browser `creazzy.token` value (or legacy `cepx-token`) for CEPX API authentication. Configure `CEPX_API_TOKEN` and, for multi-tenant use, `CEPX_API_PRINCIPALS` on the server. The browser never receives database credentials. Backup export downloads a tenant-scoped JSON snapshot; operators must store it in a protected external location. This UI does not schedule off-host backups or expose plugin enablement until tenant-scoped plugin administration endpoints are implemented.

The CEPX API integration test verifies the main UI entry point, dashboard asset, tenant-scoped event list, health and backup endpoints in addition to existing project/task/checkpoint behavior.


## Tenant-scoped plugin contract registry

The main CEPX workspace includes a contract registry. `GET /api/cepx/plugins` lists only contracts owned by the authenticated tenant; `POST /api/cepx/plugins` registers a contract with an ID, version, API version, advertised capabilities and required host capabilities. `POST /api/cepx/plugins/:id/enable` negotiates required capabilities against the server allow-list in `CEPX_HOST_CAPABILITIES` (JSON string array); `POST /api/cepx/plugins/:id/disable` disables the tenant's contract. Registration and enable/disable require the `plugins` permission (owner/admin by default); viewers cannot mutate registry entries. IDs are tenant-keyed to avoid cross-tenant collisions. Registry operations append tenant events.

This is a metadata/contract registry only. It does not download, install, load, sandbox, or execute plugin code, and advertised capabilities do not grant operating-system permissions. A future execution runtime must separately implement signed artifact verification, capability enforcement, sandbox isolation, resource limits, and audit trails before third-party code can run.

The API integration suite covers contract registration, capability-gated enabling, tenant isolation, and viewer write denial. Configure `CEPX_HOST_CAPABILITIES` on the server as a JSON array of capabilities intentionally supported by that host; keep it minimal.
