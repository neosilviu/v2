# Agent AI plugin

`agent-ai` owns the interactive assistant feature and all of its native UI, server and storage resources. It is not part of the generic platform host.

## Implemented boundary

- `server/worker.ts` is the deployable router; `server/app.ts` remains a compatibility export.
- Browser calls require a Better Auth session resolved through the private `AUTH` service binding; internal service calls use private worker bindings.
- CORS is limited to configured application origins and never uses wildcard credentials.
- Provider bindings persist only `connectionId` references owned by `ai-providers`; provider configuration values are not transported or stored by Agent AI.
- Runs invoke the selected provider connection through `PROVIDER_RUNTIME`, store assistant responses and persist completed/failed status.
- Runs can extract a model-produced JSON tool-call request, persist it with run/channel context, submit it only to Core's generic `/tools/execute` endpoint and resume with Core approval IDs. Agent AI never records an approval decision itself.
- Completed tool results are added back to the conversation as tool messages and sent to the selected model so it can produce the final assistant response.
- `ui/AgentSurface.tsx` is a first-party native surface using `@v2/ui-kit`, discovered by the trusted Web registry. It is not rendered in an iframe.
- The current native tool-call form remains as a controlled manual development trigger for the shared approval path; normal runs can now also create model-produced tool calls.

## Native UI configuration

The bundled surface calls the Agent AI Worker directly with browser session credentials. Configure `VITE_AGENT_AI_API_URL` for the Web build to the deployed Agent AI Worker URL; local development falls back to `http://localhost:8791`. Core does not proxy feature API calls or import plugin server logic.

## Knowledge and page context

The plugin exposes controlled `/knowledge/search` and `/knowledge/page-context` forwarding routes. They accept limited validated request data and execute only when optional runtime bindings exist. Page context must be supplied by explicit feature-plugin context providers, never by unrestricted DOM capture.

## Database ownership and migrations

`server/db/schema.ts` is the structural source of truth. Generate schema migrations using `pnpm --filter @v2/plugin-agent-ai db:generate`. Agent AI currently uses a Drizzle-generated baseline migration with metadata so future changes can be generated incrementally.

## Remaining work

- configure D1/KV/R2/Vectorize deployment bindings and a production `VITE_AGENT_AI_API_URL`;
- add provider-connection administration UI in `ai-providers`;
- harden model-specific structured tool call adapters and add streaming output;
- connect configured Cloudflare AI Search/Vectorize and page-context services.
