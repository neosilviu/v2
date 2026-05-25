# Auth Worker

Auth Worker owns v2 identity and sessions. It uses Better Auth with a Drizzle/D1 SQLite schema and is isolated from Core and feature plugins.

## Bindings And Variables

- `AUTH_DB`: Cloudflare D1 database for Better Auth tables.
- `BETTER_AUTH_URL`: public base URL for Auth Worker.
- `BETTER_AUTH_SECRET`: server-side secret set with Cloudflare secrets.
- `APP_ORIGIN`: comma-separated application origins allowed to call authenticated endpoints.
- `TRUSTED_ORIGINS`: optional comma-separated additional trusted origins.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: optional; GitHub OAuth is enabled only when both exist.

## Routes

- `GET /health`: returns service health and whether required configuration is present. It does not expose secret values.
- `GET|POST /api/auth/*`: Better Auth handler for email/password auth and optional GitHub OAuth.

## Better Auth Configuration

The worker enables email/password authentication and uses the Drizzle adapter with SQLite provider against `AUTH_DB`. GitHub OAuth is conditional on both server-side credentials being present. Secure cookies are forced for production HTTPS origins.
