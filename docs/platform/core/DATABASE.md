# Core database

`apps/core-worker/src/db/schema.ts` is the Drizzle source-of-truth and `apps/core-worker/migrations/0001_core_foundation.sql` is the versioned Cloudflare D1 migration.

## Owned records

Core stores only generic platform control-plane data:

- workspaces;
- installed plugin manifest state;
- Marketplace catalog identity records and installable release metadata for validated ZIP/R2 bundles;
- historical plugin ZIP package metadata, keyed by plugin, version and digest for audit and future rollback;
- declared capabilities and per-workspace grants;
- plugin activation state;
- generic scoped settings and configurable shell layouts;
- audit events.

Core does not store Auth sessions or feature-domain records such as Agent AI messages, website pages, products or orders. Feature plugins own their own storage and migrations under `plugins/*`.
