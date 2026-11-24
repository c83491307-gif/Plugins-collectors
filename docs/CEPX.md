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
