# Runtime Login

The login page is public, but its visible methods and decorative UI contributions are resolved at runtime from Auth DB. Auth Worker remains the only authority for password, session, OAuth and passkey handling.

## Public config

`GET /public/auth/login-config?workspaceId=...` returns only public-safe data:

- enabled and public-visible methods;
- public provider IDs and titles;
- display order;
- published declarative UI contributions for login slots;
- feature availability such as passkey support.

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

Normal Marketplace plugins cannot provide arbitrary auth code. Future auth extensions must be privileged/trusted and gated by explicit capabilities:

- `auth.ui.contribute`
- `auth.method.social.configure`
- `auth.method.passkey.configure`
- `auth.policy.admin`

Publishing login contributions or auth methods must be approval and audit backed once RBAC and the persistent approval engine are in place.
