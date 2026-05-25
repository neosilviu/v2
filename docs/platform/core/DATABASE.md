# Core Database

Core uses Drizzle `src/db/schema.ts` as the logical schema definition and versioned D1 SQL migrations under `migrations/`.

## Tables

- `workspaces`: platform workspace records.
- `installed_plugins`: installed manifest JSON and package/runtime metadata.
- `plugin_packages`: R2 object key, SHA-256 digest, size and package format for ZIP installs.
- `plugin_capabilities`: capabilities declared by installed manifests.
- `workspace_plugins`: workspace activation/deactivation state.
- `workspace_capability_grants`: granted capabilities per workspace/plugin.
- `workspace_settings`: generic scoped settings keyed by workspace, scope and key.
- `workspace_layouts`: configurable shell layout JSON per workspace.
- `audit_events`: immutable-style audit records for control-plane changes and tool policy paths.

## Migration Strategy

Apply migrations with Wrangler D1 migration tooling for the `CORE_DB` binding. Do not create tables from request handlers. New schema changes should update `src/db/schema.ts` first, then add a versioned SQL migration matching that schema.

## Ownership

Core data stays in `CORE_DB`. Auth data and feature-plugin domain data must not be written from Core.
