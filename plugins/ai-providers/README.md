# AI Providers plugin

`ai-providers` contributes provider definitions and an independent runtime for model discovery and provider connection checks. It is not the chat UI and does not depend on Agent AI.

## Responsibilities

- provider definitions displayed through runtime settings;
- adapters for Cloudflare Workers AI, OpenAI, Gemini, Groq and GitHub Models;
- model detection and connection tests;
- server-side ownership of provider connection resolution;
- reusable provider service for Agent AI, Help AI, Website Studio or later plugins.

## Layout

```text
plugins/ai-providers/
  src/index.ts
  server/
    app.ts
    adapters/runtime.ts
  wrangler.jsonc
```

The plugin publishes provider metadata through its manifest and owns its Worker under `plugins/ai-providers`, not under `apps/`.

## Dependency direction

Correct direction:

```text
agent-ai -> runtime/service binding -> ai-providers
help-ai  -> runtime/service binding -> ai-providers
```

Incorrect direction:

```text
ai-providers -> agent-ai
core/web -> ai-providers implementation code
```

The runtime boundary permits additional provider plugins without changing Agent AI.

## Provider security

- Provider credentials must remain server-side.
- Agent AI must transmit only connection identifiers and operation parameters, never credential values.
- External provider values are intended to use Cloudflare secret-backed bindings when connection management is implemented.
- Error responses and notifications must never expose tokens or upstream response secrets.

## Current status

Implemented:

- provider manifest metadata;
- reusable v1-style adapter foundation for provider detection/testing;
- independent Hono runtime service;
- deployable Cloudflare Worker entrypoint with Workers AI binding foundation.

Remaining:

- persisted provider connections and safe secret binding resolution;
- settings UI surface;
- complete runtime invocation/streaming API;
- connection audit and notification integration;
- deployment documentation for provider-specific server bindings.
