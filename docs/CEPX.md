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
