# Auth security

- The signing value is configured server-side and must contain at least 32 characters.
- `DEPLOYMENT_ENV=production` activates strict production validation.
- In production, authentication URL and trusted origins must be HTTPS and non-local.
- CORS returns only configured trusted origins and permits credentials only for authentication routes.
- Secure cookies are enabled for production.
- GitHub OAuth is enabled only when both required server-side values exist. Runtime login config may expose the public provider ID, but never client secrets or configuration references.
- GitHub OAuth server-side availability does not make the GitHub login method public. Social methods must be explicitly enabled and public-visible in Auth DB.
- Passkey support is enabled server-side through Better Auth. Passkey registration requires an authenticated session; passkey-first onboarding is not enabled by default and needs an explicit product and security decision.
- Passkey login is hidden until the Auth method is published and `auth_policies.allow_passkey_signin` is enabled.
- Password registration is controlled by `auth_policies.registration_mode`; email sign-up is rejected unless registration is `open`.
- Auth DB is isolated from Core and all feature-plugin databases.
- The only public Auth configuration endpoint is `GET /public/auth/login-config`. It returns enabled public methods, display labels/order, safe provider IDs, published declarative UI contributions and feature availability.
- Admin Auth configuration routes are protected by temporary bootstrap admin access until RBAC lands. They must move to RBAC/policy checks and audit events before normal operation.
- Ordinary Marketplace plugins cannot inject code into login, session, OAuth or passkey handling. Future auth extensions require privileged capabilities and explicit approval.
- Email verification and forgot/reset password require a real server-side email provider. Do not add ad hoc email sending or expose reset tokens in logs or public payloads.
## Auth Production Security Status

Auth Worker remains the only authority for identity, sessions, password, passkeys and OAuth.

Current production closure:

- Runtime login method publication is separate from server-side provider availability.
- Passkey and social providers are not public by default.
- Registration is disabled by default unless Auth runtime policy is changed by an administrator.
- Email verification and password reset remain unavailable until a server-side mail delivery adapter exists.
- Enabling `requireEmailVerification` is blocked without that adapter.
- Admin Auth APIs are protected by the existing bootstrap admin check and must move to workspace RBAC in Faza 1.
- Public login config does not expose secrets or configuration refs.

Domain trust rule:

Only verified and active domains from Core-controlled metadata may become Auth trusted-origin candidates through a server-side boundary. Browser-provided origins are never trusted automatically.
