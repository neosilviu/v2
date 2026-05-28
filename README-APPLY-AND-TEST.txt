V2 PUBLIC-SAFE COMPACT STARTUP BOOTSTRAP
======================================

Apply over the current state after the earlier session/bootstrap and no-repeat session packages.

Architecture implemented:
- The app starts through one endpoint: `GET /bootstrap`.
- For anonymous visitors it returns only `{ "authenticated": false }`.
- For authenticated users it returns the compact shell bootstrap.
- It does NOT include Settings tab panels; Settings remains lazy.
- `GET /session` stays available as a cheap helper for other flows, but is not used for app startup.
- No sessionStorage auth hint is used or trusted.

Why this is better:
- No `/session` + `/bootstrap` waterfall on refresh.
- No fake `Checking session` page at startup.
- No hidden full bootstrap inside `/session`.
- The real startup route is now measured by `perf:local`.
- Anonymous startup privacy is verified by E2E.

Files replaced:
- apps/core-worker/src/index.ts: 1555 -> 1563 lines (+8)
- apps/web/src/platform-contracts.ts: 143 -> 146 lines (+3)
- apps/web/src/api.ts: 392 -> 390 lines (-2)
- apps/web/src/RootEntry.tsx: 63 -> 5 lines (-58)
- apps/web/src/App.tsx: 574 -> 579 lines (+5)
- scripts/perf-local.mjs: 115 -> 116 lines (+1)
- tests/e2e/platform-shell.spec.ts: 114 -> 117 lines (+3)

Validation performed here:
- TypeScript syntax validation passed for 6 files.
- node --check scripts/perf-local.mjs: passed

Copy:
  cd /home/admin/v2
  unzip -o /path/to/v2-public-safe-compact-bootstrap-complete-files.zip

Run:
  pnpm typecheck
  pnpm --filter @v2/web build
  pnpm test:generated -- --check-migrations
  pnpm guard:architecture
  pnpm test:e2e
  pnpm perf:local

Expected requests:
- Anonymous app load: one `GET /bootstrap`; response exactly `{ authenticated: false }`.
- Authenticated refresh: one `GET /bootstrap?workspaceId=...` (or `/bootstrap` when no explicit workspace).
- No startup `GET /session`.
- Opening Settings then loads tab navigation/panel lazily.

Expected perf output:
- `app startup bootstrap` is now measured and must stay within the p95 budget.
