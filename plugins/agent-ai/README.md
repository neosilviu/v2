# Agent AI plugin

`agent-ai` owns the interactive assistant feature. It is not part of the platform host and can be installed, activated or replaced as a feature plugin.

## Responsibilities

- chat surface and channel-based conversation UI;
- channels, messages, runs and tool-call state;
- execution orchestration through generic runtime tools;
- provider selection through the provider runtime service;
- approved help/site knowledge orchestration;
- plugin-owned persistence and Cloudflare bindings.

## Layout

```text
plugins/agent-ai/
  manifest.ts
  ui/AgentSurface.tsx
  server/
    worker.ts
    app.ts
    env.ts
    repository.ts
    provider-routes.ts
    db/schema.ts
  wrangler.jsonc
```

`server/worker.ts` is the deployable HTTP entrypoint. `server/app.ts` remains a compatibility export to the worker entrypoint, not a second router implementation.

## Runtime dependencies

Agent AI does not import provider implementation code. It uses:

- `CORE` service binding to verify provider contributions and platform/runtime state;
- `PROVIDER_RUNTIME` service binding to request provider operations by connection identifier;
- planned `KNOWLEDGE_RUNTIME` and `PAGE_CONTEXT` bindings for controlled help and surface context.

This allows `ai-providers` or future provider plugins to be changed independently of Agent AI.

## Data and storage

The plugin declares dedicated resource ownership in its manifest. `server/db/schema.ts` defines D1-owned records for:

- channels and messages;
- provider bindings selected by the assistant;
- runs and tool calls;
- knowledge sources;
- resource bindings.

The schema is the logical source-of-truth. Versioned SQL migrations for D1 must be generated and committed before deployment. Provider secret values must not be stored in this database; only safe references/connection identifiers may be stored.

## Provider security

Agent AI sends only connection/model selection data to provider runtime. Provider credentials stay within the server-side provider owner and must be backed by Cloudflare secret bindings/Secrets Store when implemented. No API key, token or credential value belongs in chat payloads, frontend state, notifications or error responses.

## Knowledge and page context

Planned knowledge capabilities include Cloudflare AI Search and/or Vectorize-backed queries. Page context must be contributed by feature plugins as explicit readable fields plus permitted tools; it must not scrape arbitrary DOM or expose private data to the assistant.

## Feedback and errors

User-visible feedback uses the shared `@v2/rpc-contracts` notification/error shapes. Agent tools requiring sensitive permissions must go through runtime grant/approval checks.

## Current status

Implemented:

- manifest and assistant surface declaration;
- plugin-owned D1 schema foundation;
- repository and Worker entrypoint;
- provider operations routed through generic provider runtime;
- initial `AgentSurface` UI component.

Remaining:

- runtime UI module loader/mounting for the assistant surface;
- server-side connection persistence and secret-backed provider configuration;
- model discovery persistence;
- knowledge/page-context endpoints and tool execution loop;
- versioned SQL migrations and deployment resource configuration.
