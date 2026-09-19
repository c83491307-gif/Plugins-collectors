# Competitive Engagement Suite

This branch extends the Universal Orchestrator with a provider-agnostic engagement layer designed to cover the core capabilities commonly found in paid WhatsApp/customer-engagement platforms while keeping policy and authorization boundaries explicit.

## Implemented in this phase

- Audience/contact engine with reusable segments and tag filtering.
- Opt-in/opt-out compliance gate and blocked-contact protection.
- Approved-template registry with variable rendering.
- Campaign lifecycle, idempotent enqueueing, delivery results and campaign status.
- No-code-style automation flow runtime with action handlers.
- Omnichannel adapter router for pluggable channels.
- Engagement analytics with delivery/read/reply rates.
- Audit log.
- Delivery governor with rate limits and quiet hours.
- Deterministic A/B experiment assignment.
- Lead scoring and ranking.
- Idempotency store.
- Event bus for campaign/automation events.
- Runtime integration and automated coverage.

## Competitive expansion backlog

### Customer engagement
- Unified inbox with assignment, mentions, internal notes and SLA timers.
- Conversation labels, custom fields and saved views.
- Customer timeline and full interaction history.
- AI-assisted replies, summarization and next-action suggestions.
- Human handoff with context preservation.
- Business-hours and escalation routing.

### Campaign intelligence
- Visual campaign builder.
- A/B/n experiments for copy, media, CTA and send windows.
- Smart send-time optimization from historical engagement.
- Frequency caps per contact/category.
- Revenue attribution and cohort analysis.
- Campaign cloning, approvals and scheduled publishing.
- Template quality and variable validation before launch.

### Automation
- Visual trigger -> condition -> action graph.
- Webhook/event triggers.
- Cart/order/payment/status triggers through connectors.
- Wait nodes, branching, retries and compensation steps.
- Reusable automation components.
- Dry-run/simulation mode before activation.

### AI layer
- AI campaign writer with brand voice.
- Lead qualification agent.
- Intent detection and routing.
- RAG knowledge base.
- Tool/MCP action calling with permissions.
- Conversation memory with retention policies.
- Model routing by quality, latency and cost.

### Data and integrations
- Import/export CSV/JSON.
- CRM connectors.
- E-commerce connectors.
- Webhook gateway with signing and replay protection.
- REST/OpenAI-compatible API.
- Multi-tenant isolation.
- RBAC and workspace permissions.

### Reliability and enterprise controls
- Durable job queue.
- Retry policy with exponential backoff and jitter.
- Dead-letter queue.
- Provider health scoring.
- Circuit breakers and adaptive routing.
- Idempotency keys.
- Audit trails.
- Secret rotation.
- Encryption boundaries.
- Backup/restore.
- Usage and cost budgets.

## WhatsApp-specific boundary

The platform should support official WhatsApp Business Platform/Cloud API integrations, approved templates, Flows and webhooks where available. Outbound campaigns must enforce documented opt-in/opt-out and provider policy constraints. It must not discover private group memberships or message groups/users without authorization.

## Product direction

The goal is not to clone one vendor. The architecture should expose a modular capability layer so providers, channels and integrations can be swapped without rewriting campaigns, automation, analytics or compliance logic.
