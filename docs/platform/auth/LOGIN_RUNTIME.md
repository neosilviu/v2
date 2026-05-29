# Runtime Login

The login page is public, but its visible methods and declarative UI contributions are resolved at runtime from Auth DB. Auth Worker remains the only authority for password, session, OAuth and passkey handling.

## Public config

`GET /public/auth/login-config?workspaceId=...` returns only public-safe data:

- enabled and public-visible methods;
- published declarative UI contributions for login slots;
- feature availability such as password, passkey and social support;
- policy flags for registration and verification.

It must not return OAuth secrets, secret refs, internal bindings, draft/disabled methods or administrative configuration.

## Slots

Supported slots are:

- `login.header`
- `login.branding`
- `login.beforeMethods`
- `login.password`
- `login.socialMethods`
- `login.passkey`
- `login.afterMethods`
- `login.footer`
- `login.legal`

Slot renderers use the safe declarative UI schema shared through contracts. They do not execute JavaScript and do not use iframes.

## Method handling

Password and passkey actions call Better Auth through the Web auth client. Social methods call `signIn.social({ provider })` using the runtime provider ID returned by Auth Worker.

Server-side availability does not publish a method. Passkey and social methods remain draft/hidden until an Auth admin publishes the method in Auth DB. Password sign-in may bootstrap as public, but password registration is controlled separately by `auth_policies.registration_mode`; the Login UI shows account creation only when the public policy is `open`, and Auth blocks email sign-up when registration is not open.

Normal Marketplace plugins cannot provide arbitrary auth code. Future auth extensions must be privileged/trusted and gated by explicit capabilities:

- `auth.ui.contribute`
- `auth.method.social.configure`
- `auth.method.passkey.configure`
- `auth.policy.admin`

Publishing login contributions or auth methods must be approval and audit backed once RBAC and the persistent approval engine are in place.

Current behavior:

- Password signin can bootstrap as public.
- Signup appears only when runtime registration policy is `open`.
- Invitation-only mode shows a placeholder instead of opening registration.
- Passkey appears only when the passkey method is published and policy allows passkey signin.
- Social methods appear only when the social method is explicitly published, even if server-side provider env vars exist.
- Redirects are restricted to local relative paths and public delivery paths are not accepted as login redirects.

Admin configuration is normally reached through Core Settings, which checks workspace RBAC and then calls Auth internally. Direct Auth `/admin/auth/*` access is recovery-only and requires `RECOVERY_ADMIN_ENABLED=true` plus a matching recovery admin email.
