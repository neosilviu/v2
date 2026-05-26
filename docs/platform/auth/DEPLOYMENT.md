# Auth deployment

The assigned `AUTH_DB` D1 identifier remains in `wrangler.jsonc` by project-owner decision. The committed initial migration targets that binding.

Set authentication and optional OAuth values through Cloudflare server-side configuration before production deployment. For production also configure `DEPLOYMENT_ENV=production`, an HTTPS application authentication URL, and HTTPS trusted application origins. Development defaults in `wrangler.jsonc` are not valid production settings and production validation fails closed if they remain local or HTTP.

The Worker enables the `nodejs_als` compatibility flag required for its Better Auth runtime integration on Cloudflare Workers.

Passkeys use the Better Auth passkey plugin. `BETTER_AUTH_URL` determines the runtime origin and relying-party host; production must use the public HTTPS Auth origin. Local development maps loopback origins to a localhost relying-party ID.

Runtime login configuration is stored in Auth DB tables:

- `auth_methods` for password, passkey and server-supported social methods.
- `auth_ui_contributions` for safe declarative login slot content.

`RECOVERY_ADMIN_ENABLED` and `RECOVERY_ADMIN_EMAILS` are break-glass recovery settings for Auth admin configuration endpoints. Keep them disabled in normal operation. `PLATFORM_ADMIN_EMAILS` is legacy compatibility only.

Email verification and forgot/reset password require Core Mail Runtime with an active transactional provider. SMTP is the implemented production baseline; local mock delivery is development-only.
## Auth Deployment Status

Production Auth deployment requires:

- explicit Better Auth `baseURL`;
- verified `trustedOrigins`;
- HTTPS and secure cookies;
- stable passkey RP ID/origin mapping;
- OAuth callback URLs that match verified domains;
- Core Mail Runtime before email verification or reset password is enabled.

The current foundation exposes protected admin APIs and safe public login config, but does not yet implement the complete domain verification to Auth trusted-origin replication workflow.
