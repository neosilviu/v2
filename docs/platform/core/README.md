# Core Worker

Core is the generic v2 control plane. It owns workspaces, installed plugin manifest records, package metadata, activation, capability grants, settings, shell layout and audit events. It does not import concrete feature-plugin implementations.

## Routes and access

- `GET /health` is public and reveals no configuration.
- Runtime reads require either an authenticated session or a private service-binding request from a runtime service.
- Plugin installation, activation, grants, settings writes and layout writes require a platform administrator session.
- Tool execution requires an active owning plugin and granted capabilities; sensitive approvals are accepted only from an administrator until persistent approval workflows are implemented.

## Runtime model

Installed manifests are read from D1 and validated against `@v2/plugin-contracts`. A new `RuntimeKernel` is hydrated per request; Core does not keep a mutable feature registry across worker requests or workspaces.

## Bindings

- `CORE_DB`: Core-owned Cloudflare D1 database.
- `PLUGIN_PACKAGES`: R2 storage for validated ZIP archives.
- `AUTH`: service binding to the Auth Worker for session resolution.
- `APP_ORIGIN`, `TRUSTED_ORIGINS`: permitted credentialed browser origins.
- `PLATFORM_ADMIN_EMAILS`: bootstrap administrator list configured server-side.

The existing Core D1 identifier is intentionally retained in `wrangler.jsonc` at project-owner request.
