# Auth security

- The signing value is configured server-side and must contain at least 32 characters.
- `DEPLOYMENT_ENV=production` activates strict production validation.
- In production, authentication URL and trusted origins must be HTTPS and non-local.
- CORS returns only configured trusted origins and permits credentials only for authentication routes.
- Secure cookies are enabled for production.
- GitHub OAuth is enabled only when both required server-side values exist. Runtime login config may expose the public provider ID, but never client secrets or configuration references.
- Passkey support is enabled server-side through Better Auth. Passkey registration requires an authenticated session; passkey-first onboarding is not enabled by default and needs an explicit product and security decision.
- Auth DB is isolated from Core and all feature-plugin databases.
- The only public Auth configuration endpoint is `GET /public/auth/login-config`. It returns enabled public methods, display labels/order, safe provider IDs, published declarative UI contributions and feature availability.
- Admin Auth configuration routes are protected by temporary bootstrap admin access until RBAC lands. They must move to RBAC/policy checks and audit events before normal operation.
- Ordinary Marketplace plugins cannot inject code into login, session, OAuth or passkey handling. Future auth extensions require privileged capabilities and explicit approval.
- Email verification and forgot/reset password require a real server-side email provider. Do not add ad hoc email sending or expose reset tokens in logs or public payloads.
