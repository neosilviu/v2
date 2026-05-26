# Cloudflare Pages

`apps/web` is a static React/Vite SPA deployed separately from Core and Auth.

- Build command: `pnpm --filter @v2/web build`
- Output directory from the repository root: `apps/web/dist`
- Local public variables: copy `.env.example` to `.env.local` when running Vite directly.
- Preview and production variables must be configured in the Cloudflare Pages Build Environment:
  - `VITE_CORE_API_URL`
  - `VITE_AUTH_API_URL`

SPA fallback is provided by `public/_redirects` for `/login`, `/setup/owner`, `/settings`, `/public/*` and any other client route. The frontend stays schema-driven: plugin UI comes from Core runtime schemas and installing a plugin must not require a Web rebuild.
