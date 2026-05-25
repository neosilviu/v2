# v2 feature plugins

Feature functionality belongs in `plugins/*`; platform deployables belong in `apps/*`.

## Ownership rule

A plugin that needs UI, server routes, storage or a Cloudflare Worker owns those resources inside its own folder:

```text
plugins/<plugin-id>/
  manifest.ts
  ui/
  server/
    worker.ts
    db/schema.ts
  migrations/
  wrangler.jsonc
  README.md
```

The generic platform applications remain:

```text
apps/web
apps/core-worker
apps/auth-worker
apps/runtime-bridge
```

No feature plugin may duplicate its router, repository, schema or Worker implementation inside `apps/`. The web shell does not statically import feature UI. Core does not statically import feature server code or manifests.

## Runtime integration

- Core stores installed manifest data, activation state, grants, settings/layout state and audit records.
- UI contributions are loaded through the runtime/shell contribution model.
- Tools and provider capabilities are declared in manifests and invoked through runtime dispatch with capability checks.
- Feature databases and storage bindings belong to their plugin owner.
- Drizzle `schema.ts` is the logical schema source; generated/versioned D1 SQL migrations remain deployable artifacts.

## Errors and notifications

All plugins must use shared error and notification contracts from `@v2/rpc-contracts` and reusable primitives from `@v2/feedback-runtime` where appropriate. Plugins must not invent incompatible user-visible error payloads, expose stack traces, or send secret data in errors/notifications.

## Security constraints

- Credentials and provider secrets stay server-side.
- Sensitive tools require grants and, where appropriate, approval.
- Page context for Agent AI must be contributed through explicit controlled contracts, never unrestricted DOM/data capture.
- Plugin ZIP installation stores and validates package metadata; it must not execute arbitrary uploaded code inside the platform control plane.

## Current plugins

- [`agent-ai`](./agent-ai/README.md): assistant UI, channels, runs, tools and knowledge orchestration.
- [`ai-providers`](./ai-providers/README.md): provider registry and independent provider runtime.
- [`theme-studio`](./theme-studio/README.md): lightweight appearance/settings contribution.
- `website-studio`: planned content/page editing plugin with owned storage and runtime tools.
- `commerce`: planned commerce plugin with owned storage and runtime tools.
