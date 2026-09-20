# Creazzy Universal AI — Cloudflare Full-Stack Worker

This directory is the Cloudflare deployment layer for Creazzy Universal AI.

## What changed

The previous dashboard upload contained only the UI asset directory, so Cloudflare deployed an assets-only Worker. The repository now contains a real Worker entry point plus a Workers Static Assets binding.

- Worker entry point: `cloudflare/worker.mjs`
- Wrangler config: `wrangler.jsonc`
- Static UI assets: `orchestrator/web/ui/`
- API routes: `/healthz`, `/v1/models`, `/v1/chat/completions`, `/connections`, `/providers/:provider/sync`
- Provider runtime reuses the existing Creazzy model registry, capability router, ProviderRuntime, OpenAI-compatible adapters, and account failover logic.
- Up to 10 secret-backed accounts per configured provider are discovered using numbered secret names.
- Optional `CREAZZY_API_TOKEN` protects provider sync, chat completions, and connection mutation endpoints.

Cloudflare Workers Static Assets supports a full-stack Worker by combining a `main` entry point with an `assets.binding` and serving assets through `env.ASSETS.fetch()`.

## Cloudflare secrets

Do not put provider keys in `wrangler.jsonc` or Git.

Use Worker Secrets in the dashboard or Wrangler. Supported secret names are:

- `DEEPSEEK_API_KEY` through `DEEPSEEK_API_KEY_10`
- `OPENAI_API_KEY` through `OPENAI_API_KEY_10`
- `NVIDIA_API_KEY` through `NVIDIA_API_KEY_10`
- `XAI_API_KEY` through `XAI_API_KEY_10`
- `GOOGLE_API_KEY` through `GOOGLE_API_KEY_10`

Optional:

- `CREAZZY_API_TOKEN` — when present, write/AI routes require `Authorization: Bearer <token>`.
- `APP_MASTER_KEY` — enables the existing encrypted ConnectionManager for request-scoped connection operations.

The Worker deliberately does not declare provider secrets as required in Wrangler because Creazzy can boot and serve its UI/health endpoint before provider credentials are configured.

## Deploy

From the repository root:

```bash
npx wrangler@latest deploy
```

The deployment contains both Worker code and `orchestrator/web/ui/` assets. This is different from the old assets-only upload.

For local development:

```bash
npx wrangler@latest dev
```

Then open the local Worker URL.

## Important state note

Cloudflare Worker isolates are not a durable database. Environment-bound provider secrets are durable Cloudflare configuration, but accounts added through `/connections/deepseek/complete` are request-scoped unless a persistent storage binding is added. The existing 100-account/10-provider runtime limits remain part of the core project, while durable multi-account administration is a separate storage layer.

## Verification

```bash
node --check cloudflare/worker.mjs
npm --prefix cloudflare test
npx wrangler@latest deploy --dry-run
```

The GitHub workflow `.github/workflows/cloudflare-worker-verify.yml` runs the syntax/smoke checks and a Wrangler dry-run on pushes and pull requests.
