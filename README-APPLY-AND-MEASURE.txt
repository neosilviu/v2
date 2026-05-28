V2 SESSION/BOOTSTRAP REGRESSION FIX
===================================

Apply over the current files after the previous delivered packages.

Root cause:
- `/session?includeBootstrap=true` was introduced as a startup optimization.
- Core executed `workspaceBootstrap()` inside `/session`, so Wrangler correctly reported
  750–905ms for GET /session even though this was actually session + bootstrap.
- `pnpm perf:local` did not measure the browser entry session route, so its ~3ms figures did
  not prove startup latency.

Fix:
- `/session` is again a cheap authentication probe only.
- Web no longer requests `includeBootstrap=true`.
- Bootstrap is loaded after authentication via the existing memoized `loadShellBootstrap()`.
- Settings remains lazy and is not resolved in normal Dashboard bootstrap.
- `perf:local` now includes `entry session gate` so `/session` regressions fail the performance gate.
- E2E now rejects the return of `includeBootstrap=true`.

Modified files:
- apps/core-worker/src/index.ts: 1559 -> 1555 lines (-4)
- apps/web/src/api.ts: 377 -> 372 lines (-5)
- apps/web/src/platform-contracts.ts: 145 -> 143 lines (-2)
- scripts/perf-local.mjs: 114 -> 115 lines (+1)
- tests/e2e/platform-shell.spec.ts: 109 -> 113 lines (+4)

Copy:
  cd /home/admin/v2
  unzip -o /path/to/v2-session-bootstrap-regression-fix-complete-files.zip

Run:
  pnpm typecheck
  pnpm --filter @v2/web build
  pnpm test:generated -- --check-migrations
  pnpm guard:architecture
  pnpm test:e2e
  pnpm perf:local

Expected startup traffic:
- Anonymous: GET /session only, then login.
- Authenticated: GET /session followed by one memoized GET /workspaces/<id-or-current>/bootstrap.
- No request containing `includeBootstrap=true`.

Expected performance output:
- It must now include `entry session gate`.
- If plain GET /session is still hundreds of milliseconds after this fix, the remaining
  bottleneck is Auth/Better Auth session lookup, not bootstrap hidden inside session.
