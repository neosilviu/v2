# Website Studio plugin

`website-studio` owns website page composition, sections, media references and controlled page context for Agent AI.

## Ownership

All UI, worker routes, D1 schema and migrations belong in this plugin. Core stores only generic installation/activation/grant metadata and must not import Website Studio implementation code.

## Storage

`server/db/schema.ts` and `migrations/0001_initial.sql` define plugin-owned D1 tables for pages, sections, assets and approved context shares. `WEBSITE_DB`, optional `WEBSITE_KV` and `WEBSITE_ASSETS` are deployment bindings to configure server-side before deployment.

## Security

Editing and publishing require manifest-declared capabilities. AI context is opt-in through `website_context_shares`; it contains only explicitly readable fields and allowed tool identifiers, never arbitrary DOM or private site data.

## Status

Implemented: package, manifest, D1 schema/migration and minimal worker. Remaining: runtime-loaded editor surface, repositories, publishing flow, asset upload and Agent AI context dispatch.
