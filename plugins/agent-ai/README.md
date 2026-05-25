# Agent AI plugin

`agent-ai` owns the interactive assistant feature and all of its native UI, server and storage resources. It is not part of the generic platform host.

## Implemented boundary

- `server/worker.ts` is the deployable router; `server/app.ts` remains a compatibility export.
- Browser calls require a Better Auth session resolved through the private `AUTH` service binding; internal service calls use private worker bindings.
- CORS is limited to configured application origins and never uses wildcard credentials.
- Provider bindings persist only `connectionId` references owned by `ai-providers`; provider configuration values are not transported or stored by Agent AI.
- Runs invoke the selected provider connection through `PROVIDER_RUNTIME`, store the assistant response and persist completed/failed status.
- Tool calls are stored in Agent AI with their run/channel context, submitted only to Core's generic `/tools/execute` endpoint and resumed with Core approval IDs. Agent AI never records an approval decision itself.
- `ui/AgentSurface.tsx` is a first-party native surface using `@v2/ui-kit`, discovered by the trusted Web registry. It is not rendered in an iframe.

## Native UI configuration

The bundled surface calls the Agent AI Worker directly with browser session credentials. Configure `VITE_AGENT_AI_API_URL` for the Web build to the deployed Agent AI Worker URL; local development falls back to `http://localhost:8791`. Core does not proxy feature API calls or import plugin server logic.

## Knowledge and page context

The plugin exposes controlled `/knowledge/search` and `/knowledge/page-context` forwarding routes. They accept limited validated request data and execute only when optional runtime bindings exist. Page context must be supplied by explicit feature-plugin context providers, never by unrestricted DOM capture.

## Database ownership and migrations

`server/db/schema.ts` is the structural source of truth. Generate future schema migrations using `pnpm --filter @v2/plugin-agent-ai db:generate`. The existing `0002_provider_connections.sql` is an intentional reviewed data transition from legacy provider-binding rows to connection references.

`0003_tool_call_approvals.sql` updates the pre-existing `agent_tool_calls` table for the Core approval flow. Drizzle generation was attempted for this schema change, but the current migration folder does not contain Drizzle metadata for the existing hand-written `0001`/`0002` history, so Drizzle emitted a new full baseline instead of an incremental migration. The reviewed SQL migration rebuilds only `agent_tool_calls` and carries forward prior `approval_status`/`output_json` values.

## Remaining work

- configure D1/KV/R2/Vectorize deployment bindings and a production `VITE_AGENT_AI_API_URL`;
- add provider-connection administration UI in `ai-providers`;
- add streaming output and model-produced tool-call extraction;
- connect configured Cloudflare AI Search/Vectorize and page-context services.
