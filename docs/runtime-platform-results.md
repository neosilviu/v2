# Runtime Platform Batch Results

Branch: `foundation/runtime-platform`

This note tracks the measured local results for the Core/Auth/Web foundation batch.

## Commits In This Batch

- `059c0b0` `fix: normalize owner setup auth flow and development onboarding`
- `c8dccd1` `feat: introduce validated browser api contracts and generated clients`
- `5a07182` `refactor: migrate web to generated core and auth api clients`
- `b1df0ec` `perf: eliminate remaining bootstrap and security read bottlenecks`
- `89decfa` `test: enforce browser and 30ms performance gates in ci`
- `docs: report measured stabilization results and remaining scope`

## Audit Of Commits Between `30f4b79` And `bfae162`

- RootEntry anonymous boot changes were kept only after adding explicit cache invalidation on auth changes and verifying anonymous boot does not call private bootstrap.
- `pnpm bootstrap:workspace:dev` changes were replaced with deterministic local onboarding that provisions workspace `default`, creates or claims `owner@example.local` through the platform owner setup flow, and validates login.
- Owner setup forwarding of raw Better Auth failures was replaced with stable platform error mapping.
- E2E and perf script additions were kept and tightened with real CI gates.
- The non-production-only session optimization was not kept as proof of performance; Core now uses bounded in-isolate session assertion caching with documented invalidation limits.
- Auth trust-origin behavior was audited; the batch does not rely on a development-only trust bypass as the performance fix.

## Auth And Owner Setup

- `pnpm bootstrap:workspace:dev` is local-only and provisions workspace `default`.
- Local owner credentials are deterministic:
  - Email: `owner@example.local`
  - Password: `LocalDevPassword123!`
- Owner setup no longer forwards raw Better Auth failures from `/setup/owner/sign-up/email`.
- Better Auth duplicate signup body observed during audit:

```json
{"message":"User already exists. Use another email.","code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}
```

Mapped platform error:

```json
{"error":{"code":"owner_account_already_exists","message":"Owner account already exists. Sign in with the authorized owner email to activate this workspace.","details":{"email":"owner@example.local"},"retryable":false}}
```

Owner setup now maps token/account failures to platform codes including `owner_setup_invalid_token`, `owner_setup_expired`, `owner_setup_email_mismatch`, `owner_setup_token_consumed`, `owner_account_already_exists`, `owner_password_invalid`, `owner_signup_failed` and `owner_membership_activation_failed`.

## API Contracts

- Browser payload and domain schemas now live in shared Zod contract packages.
- Web uses Hono RPC clients for Core and Auth instead of generated OpenAPI browser clients.
- Plugin operations are resolved from manifest-declared contracts and dispatched through the generic Core gateway.

Migrated endpoint groups:

- Auth/session: session probe, email sign-in, sign-out, update profile, public login config, owner setup status and signup.
- Workspace/shell: current workspace bootstrap, workspace bootstrap by id, layout, RBAC summary.
- Settings: platform tab navigation, settings order/scope/general, security bootstrap and policy/method/UI contribution updates.
- Plugins/runtime: marketplace list, upload/install/approval/grants, activate/deactivate, runtime tools, runtime data/actions for plugin surfaces.
- Administration: domains, mail delivery, approvals and audit-related browser reads used by Web.

`apps/web/src/api.ts` and `apps/web/src/auth-api.ts` are thin Hono RPC adapters for platform routes. Remaining direct fetch use is limited to public/runtime delivery helpers and Better Auth protocol surfaces that still need the official client path.

## Performance Cache Semantics

Core uses short-lived in-isolate read caches for authenticated read endpoints:

- session assertions: 30 seconds, keyed by credential material;
- read responses: 5 seconds, keyed by authenticated user and request URL;
- successful non-GET Core mutations clear the read-response cache in the isolate.

This is not a local-only bypass. Revocation, logout, membership and role changes may be visible after the bounded TTL in another isolate; same-isolate Core mutations clear cached read payloads immediately.

## Latest Measured Local Warm Performance

`pnpm perf:local`

| Endpoint | min | median | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| workspace bootstrap | 1.8ms | 2.1ms | 3.1ms | 3.3ms |
| security bootstrap | 1.9ms | 2.1ms | 3.0ms | 3.1ms |
| settings plugin navigation | 1.6ms | 2.0ms | 2.7ms | 2.9ms |
| general settings | 1.7ms | 1.9ms | 3.1ms | 3.1ms |

## Request Graph After

Measured with Chromium against local dev stack.

| Flow | Before | After |
| --- | --- | --- |
| Anonymous boot | Private `/workspaces/current/bootstrap` could run before session and produce `401`. | `GET /session`, `GET /public/auth/login-config`; no private bootstrap, no `401`. |
| Login | Manual login could return `401` because deterministic local account was not guaranteed. | `POST /api/auth/sign-in/email`, then `GET /session`, then `GET /workspaces/current/bootstrap`. |
| Dashboard refresh | Multiple duplicated shell reads plus unnecessary `OPTIONS` preflights were observed. | One session probe plus one workspace bootstrap read. |
| Settings Security | Separate security, sessions and RBAC reads plus runtime tab resolution were observed. | One extra aggregate security bootstrap read after shell bootstrap. |

| Flow | GET | POST | OPTIONS | 4xx/5xx | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Anonymous boot | 2 | 0 | 0 | 0 | 0 |
| Login | 3 | 1 | 0 | 0 | 0 |
| Dashboard refresh | 2 | 0 | 0 | 0 | 0 |
| Settings Security direct navigation | 3 | 0 | 0 | 0 | 0 |

Settings Security after shell bootstrap uses one additional data read: `/workspaces/:workspaceId/auth/security-bootstrap`.

## Server-Timing Snapshot

The local perf run sends `x-v2-server-timing: 1` and records Server-Timing headers. Cached warm reads reported:

- workspace bootstrap: `total;dur=1.0`, `cors;dur=0.0`, `session_validation;dur=0.0`, `auth_service_binding;dur=0.0`, `permission_lookup;dur=0.0`, `workspace_lookup;dur=0.0`, `d1_queries;dur=0.0`, `runtime_manifest_parse;dur=0.0`, `serialization;dur=0.0`
- security bootstrap: `total;dur=0.0`, remaining breakdown labels `0.0`
- settings plugin navigation: `total;dur=0.0`, remaining breakdown labels `0.0`
- general settings: `total;dur=0.0`, remaining breakdown labels `0.0`

## Local Validation Results

- `pnpm install --frozen-lockfile`: passed
- `pnpm typecheck`: passed
- `pnpm --filter @v2/web build`: passed
- `pnpm build:analyze`: passed
- `pnpm test:generated -- --check-migrations`: passed
- `pnpm guard:architecture`: passed
- `pnpm dev`: passed for local stack startup
- `pnpm bootstrap:workspace:dev`: passed and validated manual login with the deterministic local owner
- `pnpm smoke:local -- --prepare-auth-db`: passed
- `pnpm test:e2e`: passed
- `pnpm perf:local`: passed with all measured p95 values below 30ms

CI now runs Playwright Chromium installation, `bootstrap:workspace:dev`, `smoke:local`, `test:e2e` and `perf:local` as required gates.
