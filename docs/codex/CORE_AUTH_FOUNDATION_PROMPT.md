# Codex task: finish v2 Core + Auth foundation in parallel

You are working in repository `neosilviu/v2` on branch `codex/core-auth-foundation`.

## Start here

1. Read `AGENTS.md` completely before changing code.
2. Inspect the current branch and run `pnpm install --no-frozen-lockfile`, `pnpm typecheck`, `pnpm --filter @v2/web build`, and `pnpm build:analyze` before coding.
3. Do not merge, rebase, or modify `foundation/runtime-platform`; commit only to `codex/core-auth-foundation`.
4. Keep changes small, typed, Cloudflare Workers compatible, and commit logical batches.

## Parallel-work boundary: mandatory

Another agent is actively developing feature plugins, web feedback UI and plugin documentation. Avoid conflicts.

### You MAY modify

- `apps/core-worker/**`
- `apps/auth-worker/**`
- `packages/db-runtime/**` if you create it for shared D1/Drizzle migration utilities only
- `docs/platform/core/**`
- `docs/platform/auth/**`
- tests colocated inside the two owned apps or new db-runtime package
- root dependency/catalog files only when strictly required for your owned packages; keep edits minimal

### You MUST NOT modify

- `plugins/**`
- `apps/web/**`
- `apps/runtime-bridge/**`
- `packages/ui-kit/**`
- `packages/ui-runtime/**`
- `packages/feedback-runtime/**`
- `packages/agent-contracts/**`
- `packages/provider-contracts/**`
- `packages/plugin-contracts/**`
- `packages/plugin-sdk/**`
- `packages/rpc-contracts/**`
- `AGENTS.md`
- `.github/workflows/**` unless an unavoidable existing failure is proven and documented first

If your implementation appears to need a forbidden file, stop that part and document the required contract change in `docs/platform/core/OPEN_CONTRACT_REQUESTS.md`; do not edit the forbidden package.

## Architectural invariants

The platform must run with **zero feature plugins installed**.

`apps/` contains only platform deployables:

```text
apps/
  web/
  core-worker/
  auth-worker/
  runtime-bridge/
```

Feature plugin workers, routers, repositories, schemas, storage resources and UI belong inside their plugin directory, never in `apps/`.

Core must not import any concrete feature plugin package, manifest, UI, server implementation, provider adapter or schema. Core consumes only stored manifest data and generic runtime/contracts already present in the repository.

Auth owns identity and sessions only. Core owns workspaces, plugin installation/activation, grants, settings/layout state and audit events. Auth and Core must use separate databases and neither may write into feature-plugin databases.

## Database decision

Use **Drizzle `schema.ts` as source-of-truth** and keep versioned generated SQL migrations for Cloudflare D1 deployment.

Required ownership:

```text
apps/core-worker/
  src/db/schema.ts
  migrations/*.sql

apps/auth-worker/
  src/db/schema.ts
  migrations/*.sql
```

Do not replace D1 migrations with runtime table creation. `CREATE TABLE IF NOT EXISTS` in application request paths is not an acceptable final persistence strategy.

## Objective A: Core Worker foundation

Finish a safe generic Core control plane. Preserve existing API semantics unless improving a bug without changing external contracts.

Core domain must cover:

- workspaces;
- installed plugin manifest records and package metadata;
- workspace plugin activation/deactivation state;
- declared/granted capabilities;
- generic scoped settings and configurable shell layout persistence;
- immutable-style audit event entries;
- plugin package installation metadata required by the existing ZIP installer flow.

Implement or improve:

1. `src/db/schema.ts` for Core-owned tables using Drizzle SQLite/D1 types.
2. Initial SQL migration(s) matching the schema.
3. A typed repository layer using D1 safely and consistently.
4. Request-scoped runtime hydration: avoid leaking registered plugin state across workspaces or requests in a module-global mutable registry. A worker isolate may handle requests from multiple workspaces.
5. Generic plugin activation/deactivation endpoints only if already representable by current contracts; otherwise document a needed contract request rather than editing shared contracts.
6. Audit logging for install, activation, grants, settings/layout changes and tool approval/execution paths that already exist.
7. Consistent HTTP status behavior and JSON responses; do not introduce raw stack traces or secret values in responses.

Core must not:

- import `@v2/plugin-agent-ai`, `@v2/plugin-ai-providers`, `@v2/plugin-theme-studio`, `website-studio` or `commerce`;
- create built-in plugin lists in TypeScript host code;
- access auth DB or feature-plugin DBs;
- execute arbitrary uploaded JavaScript from a ZIP package in the control plane.

## Objective B: Auth Worker foundation with Better Auth

Use Better Auth as selected for v2. Keep authentication isolated from Core and plugins.

Implement or improve:

1. `src/db/schema.ts` and generated D1 migration(s) for the Better Auth SQLite/D1 storage model required by the enabled features.
2. A secure worker handler around Better Auth.
3. Environment parsing/validation for required auth configuration; fail closed on missing production values.
4. Trusted origin and CORS policy appropriate for the configured application origin; never use wildcard CORS on authenticated endpoints.
5. Secure cookie/session behavior appropriate for production HTTPS; do not expose secrets in responses or logs.
6. Email/password sign-in foundation and optional GitHub OAuth only when both server-side client values exist.
7. Health endpoint that exposes no sensitive configuration.
8. Documentation for binding `AUTH_DB` and setting authentication values server-side in Cloudflare deployment.

Security requirements:

- Login/register responses must not reveal whether an account exists beyond Better Auth's safe behavior.
- Rate-limiting/abuse protection boundary must be documented; implement only if possible without modifying forbidden packages.
- Do not put credentials in source, migrations, KV plain settings, client payloads or example values that look real.
- Do not add automatic account creation or silent login behavior from older WordPress experiments; v2 authentication must be explicit and secure.

Before coding against Better Auth or Cloudflare APIs, check the current official documentation and implement only supported APIs for the installed versions. Do not invent configuration fields.

## Objective C: Documentation for your owned areas

Create GitHub-linked Markdown documentation under:

```text
docs/platform/core/
  README.md
  DATABASE.md
  SECURITY.md

docs/platform/auth/
  README.md
  DATABASE.md
  SECURITY.md
  DEPLOYMENT.md
```

Documentation must describe:

- ownership boundaries;
- routes currently implemented, with request/response intent but no secrets;
- schema/migration strategy;
- D1/service bindings;
- security model and unresolved work;
- how plugin systems integrate through manifest/runtime data without Core importing plugin code.

## Objective D: Verification and delivery

Run after each meaningful batch and before final response:

```bash
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm --filter @v2/web build
pnpm build:analyze
```

Review the build-analysis output. Core/Auth must not introduce platform-to-feature-plugin dependency findings.

Commit changes to `codex/core-auth-foundation` only. Provide a concise final summary containing:

- commits created;
- files changed;
- schema/migration choices;
- security controls implemented;
- tests/checks run and their results;
- any required contract changes documented rather than made;
- a statement confirming that no `plugins/**`, web UI, runtime bridge, feedback runtime or shared plugin/provider contracts were modified.

## Definition of done

The task is complete only when:

- Core and Auth compile;
- D1 schemas and migrations exist and agree with their repositories;
- Core remains generic and operational without feature plugins;
- Auth is isolated and production-oriented with Better Auth;
- platform documentation is added;
- CI-equivalent commands pass;
- no prohibited parallel-work paths have been modified.
