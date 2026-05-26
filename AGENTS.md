# v2 repository working conventions

## RDAC gate

- Follow the official roadmap in `docs/RDAC.md`.
- Faza 0 — Immediate Correction Gate must stay green before new platform or plugin features are added.
- Runtime-first is mandatory: platform apps must not hardcode feature plugin IDs, feature routes, official Marketplace lists, plugin-specific public delivery paths or plugin-specific security exceptions.
- Core is private-by-default. Public access must come only from explicit workspace publications and policies for contributions declared by plugin manifests.
- Auth technical endpoints remain Auth-owned. Core public endpoints are limited to generic health/session status, non-personalized catalog reads and generic public delivery.
- Do not expose installed plugins, active plugins, runtime tools, runtime providers, workspace settings or workspace layout to anonymous browser requests just because the request origin is CORS-allowed.
- Marketplace installation must use validated runtime releases backed by ZIP/R2 package metadata and `@v2/plugin-installer`; do not install by copying a catalog manifest alone.
- `plugin_catalog` may be seeded by local helper scripts during development, but runtime publish/install must be driven by Core endpoints and release metadata.
- Do not automatically grant sensitive or dangerous capabilities during install, activation or marketplace flows.
- Declarative UI schema rendered by Web is the standard Marketplace UI mechanism. Trusted React registries are deploy-time optimizations for included first-party plugins only.
- The frontend standard is template-driven and runtime-rendered. Web may contain the shell, route guards, generic renderer and a small reusable template catalog, but not plugin-specific pages or route switches.
- Standard plugins contribute surfaces, pages, routes, data sources and actions declaratively through manifests/packages so Marketplace installs can appear without rebuilding Web.
- Persist declarative UI, workspace activations, publications, policies, login config and theme tokens in owner D1 databases as validated contracts and metadata only.
- Do not persist React components, executable JavaScript, ZIP/assets, OAuth secrets, API keys or provider tokens in D1 UI schema or public metadata. ZIP/assets belong in R2; secrets resolve server-side through configuration refs.
- Private/public routing is resolved from workspace activation, publications and policies. Public-candidate declarations are not public until explicitly published.
- Core D1 owns plugin UI contributions, workspace UI activations, workspace publications, public access policies and theme tokens. Auth D1 owns auth methods, login UI contributions and Better Auth passkey storage.
- `sandbox-frame` is only for external arbitrary UI that needs isolation.
- Dynamic Worker execution for Marketplace code must be modeled separately, for example through Cloudflare Workers for Platforms / Dispatch Namespace; do not add per-plugin service bindings for runtime-installed plugins.
- Auth Worker is a privileged service boundary. Do not treat login, session, OAuth, password or passkey handling as ordinary plugin code.
- Login UI must be runtime-driven from Auth DB methods and declarative UI contributions. Do not hardcode provider buttons in Web, expose secrets in public config, or let normal Marketplace plugins inject executable login code.
- Auth extension capabilities are privileged and never auto-granted: `auth.ui.contribute`, `auth.method.social.configure`, `auth.method.passkey.configure`, `auth.policy.admin`.
- Never authorize plugin install/update from browser booleans. Use persistent one-shot approval requests tied to workspace, plugin/release/package identity, version, SHA and sensitive capability summary.
- Public delivery route patterns must be validated declarative patterns with static or `:paramName` segments. Do not use arbitrary regexes or feature-specific route code in the host.
- Template data/action execution must go through generic Core runtime endpoints. Core validates activation/publication/policy and must return denied, approval-required or unavailable instead of pretending unsupported plugin worker logic succeeded.
- Auth public login methods must come from Auth DB publication state and policy. Server-side support for passkey or OAuth does not make the method public.
- Keep D1 migrations incremental. Do not rewrite existing migration history, apply remote migrations from local work, or change assigned D1 identifiers.
- Keep PR descriptions current with the real HEAD, validation status and remaining Faza 0 work.

## Architecture

- The platform must work with no optional plugins installed.
- Platform applications are `apps/core-worker`, `apps/auth-worker`, `apps/runtime-bridge` and `apps/web`.
- Platform applications depend on shared contracts and runtime abstractions, not concrete feature plugin packages.
- Plugins contribute features through manifests, runtime registries, surfaces, tools and provider definitions.

## Ownership

- Core owns workspaces, plugin installation and activation, grants, generic settings/layout APIs and audit events.
- Auth owns identity and sessions.
- The web application owns only the generic shell and platform administration UI.
- Plugin packages own feature logic and plugin domain UI/data.

## Data

- Use Drizzle `schema.ts` as the logical database definition and version generated D1 SQL migrations.
- Keep data in its owner domain and avoid cross-domain writes.
- UI contribution metadata belongs in plugin/runtime contracts, not in database schemas.

## Verification

- Use `pnpm typecheck` for code validation.
- Use `pnpm build:analyze` to report bundle size, worker size, source metrics and dependency boundaries.
- Use `pnpm guard:architecture` as the strict platform/plugin dependency and migration drift check.
- For Faza 0 work, also run `pnpm --filter @v2/web build` after each commit-sized change.

## Planned plugins

`agent-ai`, `ai-providers`, `theme-studio`, `website-studio` and `commerce` are feature plugins. The plugin manager remains native platform functionality.
