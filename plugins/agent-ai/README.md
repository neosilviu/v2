# Agent AI plugin

`agent-ai` owns the interactive assistant feature and all of its UI/server/storage resources. It is not part of the generic platform host.

## Implemented boundary

- `server/worker.ts` is the only deployable router; `server/app.ts` remains a compatibility export.
- Browser calls require a Better Auth session resolved through the private `AUTH` service binding; service calls may use the private `agent.internal` binding path.
- CORS is limited to configured application origins and never uses wildcard credentials.
- Provider operations pass connection identifiers to `PROVIDER_RUNTIME`; provider implementations and credentials are not imported or transported by Agent AI.
- D1 migration `migrations/0001_initial.sql` matches the Agent AI schema foundation.

## Knowledge and page context

The plugin exposes controlled `/knowledge/search` and `/knowledge/page-context` forwarding routes. They accept limited validated request data and execute only when optional runtime bindings exist. Knowledge results must be supplied by a configured knowledge service; page context must be supplied by explicit feature-plugin context providers such as Website Studio, never by unrestricted DOM capture.

## Owned data

Agent AI owns channels, messages, provider selections, runs, tool calls, knowledge sources and resource-binding metadata. Provider token values must not be stored in this database; only server-side connection references may be persisted.

## Remaining work

- configure D1/KV/R2/Vectorize deployment resource bindings;
- mount the runtime-loaded assistant UI after the generic sandbox asset endpoint exists;
- implement chat generation/streaming and approved tool execution loop;
- connect configured Cloudflare AI Search/Vectorize and page-context services.
