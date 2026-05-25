# Auth database

`apps/auth-worker/src/db/schema.ts` defines the Better Auth SQLite/D1 foundation tables: `user`, `session`, `account` and `verification`. `migrations/0001_better_auth_foundation.sql` is the matching deployment migration.

Before production rollout, verify generated schema requirements against the installed Better Auth configuration and current Better Auth CLI workflow, then apply the versioned D1 migration.
