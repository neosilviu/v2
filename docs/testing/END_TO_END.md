# End-to-End Local Test Guide

This guide describes the current v2 vertical slice. It separates real runtime behavior from development-only mocks.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @v2/web build
pnpm build:analyze
pnpm test:generated -- --check-migrations
pnpm guard:architecture
```

Apply only local migrations before smoke testing:

```bash
pnpm --dir apps/core-worker exec wrangler d1 migrations apply v2-core --local
pnpm --dir apps/auth-worker exec wrangler d1 migrations apply v2-auth --local
```

Do not apply remote migrations from this guide.

## Optional Local Node Mock

```bash
node plugins/local-node/server/mock-runner.mjs
```

This is a development-only health endpoint. It does not print, read Gmail or pair WhatsApp.

## Runtime Smoke

1. Start the app with `pnpm dev`.
2. Open `/login`; public login config should load from Auth Worker.
3. Password sign-in is visible by default.
4. Sign-up remains hidden until Security policy sets registration mode to `open`.
5. Passkey and social methods remain hidden until explicitly published in Auth runtime configuration.
6. Open `/settings` after an authenticated admin session.
7. Confirm runtime platform tabs: General, Security, Domains, Marketplace and Interface.
8. General loads and saves workspace metadata through Core runtime data/actions.
9. Security loads Auth policy, methods, sessions/passkey counts and RBAC summary through protected APIs.
10. Domains can create a draft domain, then manually verify, activate or disable it.
11. Marketplace lists runtime catalog entries and keeps install approvals persistent.
12. Activating a plugin with a settings surface exposes a Settings tab from Core runtime composition.
13. Local Node can be installed/activated as an official/dev plugin and exposes its Settings tab and Local Production surface.

The repeatable local smoke runner covers the same platform path through HTTP with a real Better Auth cookie:

```bash
pnpm marketplace:sync
pnpm smoke:local -- --prepare-auth-db
```

`--prepare-auth-db` opens registration only in the local Auth D1 database so the smoke runner can create/sign in a test user. It does not touch remote D1. Use `V2_SMOKE_EMAIL` and `V2_SMOKE_PASSWORD` to override the default local account. To exercise protected Auth admin publication endpoints in the smoke runner, copy `apps/auth-worker/.dev.vars.example` to `.dev.vars` and set `PLATFORM_ADMIN_EMAILS` to the same smoke email before running `pnpm dev`.

The smoke runner checks:

- `/login`, Core health and public login config.
- anonymous Settings access is rejected.
- email sign-up/sign-in creates a real Better Auth session.
- Core accepts the real session cookie and returns runtime Settings tabs.
- Auth passkey publication remains stable across repeated public login config reads when the smoke user is an Auth admin.
- every seeded Marketplace plugin can request approval if needed, be approved, installed, deactivated and reactivated through Core APIs.

## Real Versus Mock

Real in this slice:

- Auth public login configuration and admin policy/method APIs.
- Core RBAC membership/role/permission tables and permission checks for administration.
- Core workspace domain metadata and manual verification/activation state.
- Persistent Marketplace install approvals.
- Runtime Settings tab/panel composition from D1 and plugin manifests.
- Local Node typed contracts and declarative UI boundary.

Development-only or not configured:

- Local Node runner health can use the mock runner.
- Gmail, WhatsApp and real printing require external credentials, pairing and hardware.
- Commerce checkout/payment is not implemented.
- Dynamic arbitrary third-party Worker deployment still requires Dispatch Namespace or Workers for Platforms.
