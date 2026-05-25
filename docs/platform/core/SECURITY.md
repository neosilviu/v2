# Core security

Core is a privileged control plane. It no longer permits wildcard browser CORS for administrative operations. Browser access is restricted to configured application origins and authenticated sessions resolved through the private Auth service binding.

## Authorization

- Public access is limited to the health endpoint.
- Runtime reads accept authenticated browser sessions or private service-binding calls from plugin runtimes.
- Plugin upload/install, activation/deactivation, capability grants, settings writes and layout writes require a platform administrator session.
- The initial administrator mechanism is the server-side `PLATFORM_ADMIN_EMAILS` configuration. This must be replaced by workspace RBAC when the authorization model is expanded.
- A sensitive tool cannot be approved solely because an arbitrary client sends `approved: true`; while a persisted approval workflow is pending, only a platform administrator may provide that approval signal.

## Plugin package safety

ZIP descriptors are processed through the shared plugin contract and installer packages. Core stores validated manifest/package metadata and archive bytes in R2; it does not execute uploaded plugin JavaScript in the control-plane request path. The `sandbox-frame` UI model remains subject to approval and a validated runtime asset-serving route.

## Internal service access

Internal read access is designed for Cloudflare service bindings using `core.internal` service URLs without browser origins. Before any runtime endpoint is exposed through a public gateway, add scoped service identity/authentication rather than relying only on service-binding routing.

## Errors and data exposure

Core returns shared structured errors through `@v2/feedback-runtime`. Responses must not expose stack traces, database statements, package archive internals, provider credentials or binding configuration values.
