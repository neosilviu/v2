# Website Studio plugin

`website-studio` owns website page composition, sections, media references and controlled page context for Agent AI.

## Ownership

All UI, worker routes, D1 schema and migrations belong in this plugin. Core stores only generic installation/activation/grant metadata and must not import Website Studio implementation code.

## Storage

`server/db/schema.ts` and `migrations/0001_initial.sql` define plugin-owned D1 tables for pages, sections, assets and approved context shares. `WEBSITE_DB`, optional `WEBSITE_KV` and `WEBSITE_ASSETS` are deployment bindings to configure server-side before deployment.

## Security

Editing and publishing require manifest-declared capabilities. AI context is opt-in through `website_context_shares`; it contains only explicitly readable fields and allowed tool identifiers, never arbitrary DOM or private site data.

## Seed lifecycle

Website Studio follows the v2 RDAC seed split:

- Workspace creation does not install this plugin and does not write Website Studio rows.
- Marketplace/plugin install materializes the manifest and declarative contributions for the target workspace.
- `POST /workspaces/:workspaceId/seed/defaults` installs non-demo operational defaults for an installed workspace.
- `POST /workspaces/:workspaceId/demo/install` installs sample pages explicitly for development or Marketplace demo flows.
- Demo rows are plugin-owned data in `WEBSITE_DB`; Core stores only generic install, activation, publication and approval metadata.

## Status

Implemented: package, manifest, D1 schema/migration, declarative editor/settings surfaces, public route candidates, page/section worker routes, operational seed and explicit demo install. Remaining: authenticated service boundary for plugin worker calls, Core runtime dispatch to plugin data/actions, asset upload and Agent AI context dispatch.
