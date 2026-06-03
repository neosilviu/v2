# AI Providers plugin

`ai-providers` contributes provider definitions and an independent runtime for model discovery and connection checks. It is not the chat UI and does not depend on Agent AI.

## Ownership

The catalog identifies available provider types. Configured connections and discovered-model snapshots are plugin-owned metadata in `server/db/schema.ts` and `migrations/0001_initial.sql`. Agent AI passes a `connectionId`; it never treats a provider type as a configured connection.

## Security

The D1 schema stores only metadata and optional server-side binding references, never token/API-key values. External credentials must later be resolved through Cloudflare server-side secret bindings. Model discovery and test failures use shared safe error responses.

## Status

Implemented: provider catalog, adapters, independent Worker service, metadata schema/migration, connection lookup and discovered-model snapshot writes. Remaining: deployment binding for the provider D1 resource once created, connection-management settings UI, secret-backed resolver and streaming invocation API.
