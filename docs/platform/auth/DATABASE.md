# Auth Database

Auth uses Drizzle `src/db/schema.ts` as the logical schema definition and versioned D1 SQL migrations under `migrations/`.

## Tables

- `user`: Better Auth users with email verification state and profile fields.
- `session`: Better Auth session tokens and expiry metadata.
- `account`: credential and optional OAuth account links, including hashed password storage for email/password.
- `verification`: Better Auth verification records.

## Migration Strategy

Apply migrations with Wrangler D1 migration tooling for the `AUTH_DB` binding. Runtime table creation is not used. Better Auth programmatic migrations are intentionally not used because the official documentation limits them to the built-in Kysely adapter, while this worker uses Drizzle.

Schema changes should start in `src/db/schema.ts`, followed by a matching SQL migration.
