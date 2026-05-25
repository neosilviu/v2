# Auth security

- The signing value is configured server-side and must contain at least 32 characters.
- `DEPLOYMENT_ENV=production` activates strict production validation.
- In production, authentication URL and trusted origins must be HTTPS and non-local.
- CORS returns only configured trusted origins and permits credentials only for authentication routes.
- Secure cookies are enabled for production.
- GitHub OAuth is enabled only when both required server-side values exist.
- Auth DB is isolated from Core and all feature-plugin databases.
