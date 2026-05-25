# v2 repository working conventions

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
- Use `pnpm guard:architecture` as the strict platform/plugin dependency check after existing foundation violations are refactored.

## Planned plugins

`agent-ai`, `ai-providers`, `theme-studio`, `website-studio` and `commerce` are feature plugins. The plugin manager remains native platform functionality.
