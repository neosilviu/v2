# Auth Security

Auth Worker keeps identity and sessions isolated from Core and plugins. It does not write to Core or feature-plugin databases.

## Configuration

`AUTH_DB`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` are required before auth endpoints will run. In production, `BETTER_AUTH_SECRET` must be at least 32 characters and trusted origins must use HTTPS.

Secrets must be configured server-side with Cloudflare secrets, not committed to source, migrations, KV settings or client payloads.

## CORS And Cookies

Authenticated endpoints use explicit trusted origins with credentials enabled. Wildcard CORS is not used for `/api/auth/*`.

Secure Better Auth cookies are forced for production HTTPS deployments. Local development can use localhost origins.

## Account Behavior

Email/password authentication is explicit through Better Auth. The worker does not add automatic account creation, silent login or legacy WordPress migration behavior.

## Abuse Protection Boundary

Better Auth's safe endpoint behavior is preserved. Additional IP/user rate limiting is not implemented in this batch because no owned shared rate-limit package exists yet; it should be added at the edge or in Auth Worker with a dedicated storage binding.
