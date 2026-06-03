# Cloudflare Pages

`apps/web` is a static React/Vite SPA deployed separately from Core and Auth.

- Build command: `pnpm --filter @v2/web build`
- Output directory from the repository root: `apps/web/dist`
- Local public variables: copy `.env.example` to `.env.local` when running Vite directly.
- Preview and production variables must be configured in the Cloudflare Pages Build Environment:
  - `VITE_CORE_API_URL`
  - `VITE_AUTH_API_URL`

For deployment, route browser API traffic to Core/Auth through explicit platform hostnames or a Pages-level proxy that preserves credentials:

- Core reads: `VITE_CORE_API_URL=https://<core-admin-domain>`
- Auth browser routes: `VITE_AUTH_API_URL=https://<auth-domain>`

Do not expose Core/Auth by origin wildcard. Core/Auth still validate active workspace domain trust and return credentialed CORS headers only for trusted origins. Same-origin proxying is acceptable when the proxy forwards cookies and does not turn anonymous browser access into workspace access.

SPA fallback is provided by `public/_redirects` for `/login`, `/setup/owner`, `/settings`, `/public/*` and any other client route. The frontend stays schema-driven: plugin UI comes from Core runtime schemas and installing a plugin must not require a Web rebuild.
