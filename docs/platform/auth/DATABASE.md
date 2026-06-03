# Auth database

`apps/auth-worker/src/db/schema.ts` defines the Better Auth SQLite/D1 foundation tables and Auth runtime tables:

- `user`
- `session`
- `account`
- `verification`
- `passkey`
- `auth_methods`
- `auth_ui_contributions`
- `auth_policies`
- `impersonation_sessions`

The committed D1 migrations under `apps/auth-worker/migrations/` are the matching deployment history.

Before production rollout, verify generated schema requirements against the installed Better Auth configuration and current Better Auth CLI workflow, then apply the versioned D1 migration.
