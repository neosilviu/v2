# Database schema and D1 migrations

Every deployable service or plugin with D1 owns its database schema and migrations:

- `apps/core-worker/src/db/schema.ts`
- `apps/auth-worker/src/db/schema.ts`
- `plugins/agent-ai/server/db/schema.ts`
- `plugins/ai-providers/server/db/schema.ts`
- `plugins/website-studio/server/db/schema.ts`
- `plugins/commerce/server/db/schema.ts`

## Source of truth

`schema.ts` is the structural source of truth. Use `pnpm --filter <package> db:generate` to produce SQL migrations with Drizzle Kit, review generated SQL, then apply it using the D1 migration workflow for the relevant deployment environment.

Do not maintain new table or index definitions manually in both TypeScript and SQL.

## Manual data migrations

A reviewed SQL migration remains appropriate when transforming existing records, backfilling values or removing legacy semantics. Keep those migrations narrow and document why generation alone was not sufficient.

## Ownership

Core and Auth own independent D1 databases. Feature plugins with dedicated storage own their schema and migrations. Plugin schemas must not be merged into the Core database merely for convenience.
