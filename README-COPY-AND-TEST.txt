V2 optimization delivery
========================

Base received from user: full source archive containing d364fec6 fixes already applied.

Modified complete files:
- apps/web/src/api.ts: 559 -> 365 lines (-194)
- apps/web/src/SettingsPage.tsx: 110 -> 92 lines (-18)
- apps/web/src/App.tsx: 557 -> 557 lines (+0)
- apps/core-worker/src/index.ts: 1569 -> 1558 lines (-11)
- apps/core-worker/src/repository.ts: 2187 -> 2228 lines (+41)

Total changed-file LOC: 4982 -> 4800 (-182)

Implemented:
- Removed obsolete Web API wrappers no longer consumed after schema-driven Settings.
- Reduced manual Web API surface accordingly.
- Simplified SettingsPage duplicated platform/plugin tab loading branch.
- Removed technical Settings header clutter while retaining Reload behavior.
- Removed redundant Security Authentication member/role DB loading.
- Removed unused platform settings override data source.
- Replaced member permission/list N+1 queries with fixed-query aggregation.
- Replaced role permissions N+1 loading with two-query aggregation.
- Prevented inactive workspace members from receiving effective access via allow overrides.
- Prevented impersonation of inactive workspace members.

Validation performed in this environment:
- TypeScript syntax transpile validation for all five changed files: passed.
- node --experimental-strip-types scripts/test-generated.mjs: passed (0 failures).

Not runnable in this environment:
- pnpm typecheck / build / e2e / perf, because the uploaded archive does not contain pnpm and all external workspace dependencies required to execute the full install-free build.

Copy into your checkout:
  cd /home/admin/v2
  unzip -o /path/to/v2-optimization-complete-files.zip

Then run:
  pnpm typecheck
  pnpm --filter @v2/web build
  pnpm test:generated -- --check-migrations
  pnpm guard:architecture
  pnpm test:e2e
  pnpm perf:local
