# RDAC Roadmap

RDAC is the official roadmap for v2 platform development. It keeps platform hardening ahead of new feature work and preserves the runtime-first boundary between Core, Auth, Web and feature plugins.

## Operating rule

Faza 0 must remain green before new platform or plugin features are accepted. Contributors must not move feature logic into Core, weaken capability approval, rewrite D1 migration history or bypass runtime contracts for convenience.

Runtime-first is a hard platform rule:

- Do not hardcode feature plugin identities, special plugin IDs, public feature routes, official Marketplace lists or plugin-specific security exceptions in platform applications.
- Core is private-by-default. CORS and the trusted Web origin are never authentication.
- Public access is available only for plugin-declared contributions that are explicitly published in a workspace and allowed by policy.
- The public delivery router is generic. It resolves published routes, surfaces and tool candidates from Core persistence and plugin manifests.
- Declarative UI schema contributions are the standard runtime UI path for Marketplace plugins. The Web shell must render them generically with `@v2/ui-kit` without a rebuild.
- Trusted React UI discovered at build time is only a deployment optimization for included first-party plugins, not the runtime Marketplace standard.
- `sandbox-frame` is reserved for external plugins that ship arbitrary unknown UI and therefore need browser isolation.
- Dynamic plugin Worker logic must use a separate execution model compatible with Cloudflare Workers for Platforms / Dispatch Namespace. Hardcoded service bindings remain appropriate only for services known at deploy time, such as Core, Auth and official deployed services.

## Faza 0 - Immediate Correction Gate

- Close anonymous access to internal workspace data. Installed plugins, active plugins, runtime tools, runtime providers, workspace settings and workspace layout require an authenticated browser session or an internal service identity.
- Keep public delivery separate from workspace internals. Auth technical endpoints remain Auth-owned; Core may expose only generic auth status, non-personalized catalog reads and explicitly published public contributions.
- Make the Marketplace runtime real: installable releases are backed by validated ZIP bundles stored in R2, not by catalog manifest copies alone.
- Route Marketplace installation through `@v2/plugin-installer` and the existing approval flow.
- Remove automatic grants for sensitive or dangerous capabilities. Installation and activation must not imply capability grants.
- Preserve D1 migration history incrementally. Add new generated migrations; do not rewrite prior migrations or change assigned D1 identifiers.
- Keep CI strict and keep PR #1 updated with the real HEAD, validation status and remaining Faza 0 risk.
- Add generic public publication persistence before feature-specific public pages such as website, commerce or AI chat are added.
- Add the declarative plugin UI renderer foundation before relying on build-time trusted UI as the Marketplace mechanism.

## Faza 1 - Workspace RBAC

Core will replace normal bootstrap administrator authorization with workspace-scoped RBAC.

Required tables:

- `workspace_members`
- `workspace_roles`
- `workspace_role_permissions`
- `workspace_invitations`
- `service_identities`

Required permissions:

- `workspace.read`
- `workspace.admin`
- `workspace.invite`
- `marketplace.read`
- `marketplace.publish`
- `plugin.install`
- `plugin.upload`
- `plugin.activate`
- `plugin.update`
- `plugin.uninstall`
- `plugin.grantCapability`
- `tool.execute`
- `tool.approve`
- `approval.read`
- `audit.read`
- `layout.write`
- `settings.write`

`PLATFORM_ADMIN_EMAILS` remains only a temporary bootstrap and recovery mechanism. It must not be the normal authorization model after RBAC lands.

## Faza 2 - Persistent Approval Engine

- Define approval policies by risk, capability, plugin and actor role.
- Support approval states: `pending`, `approved`, `denied`, `expired`, `consumed` and `revoked`.
- Add TTL handling for approvals, especially sensitive and dangerous tool requests.
- Make approval UI auditable, including actor, target, input summary, decision, timestamp and resulting audit event.

## Faza 3 - Plugin Runtime and Marketplace Lifecycle

- Support `publish`, `install`, `activate`, `deactivate`, `update`, `rollback`, `migrate` and `uninstall`.
- Classify plugins as `built-in`, `official`, `private uploaded` or `external sandboxed`.
- Show permission and capability diffs before plugin update.
- Keep plugin-owned data and migrations in plugin domains. Core owns only generic control-plane state.

Official plugin lists in local scripts are development seed helpers only. Runtime Marketplace publish/install must be possible through Core endpoints and release metadata.

## Faza 3.5 - Public Delivery Foundation

- Extend plugin contracts with generic public route, public surface and public tool candidate contributions.
- Persist explicit workspace publications in Core through `workspace_publications`.
- Persist public access policies in Core through `public_access_policies`.
- Require publication before any plugin-declared route, surface or tool candidate becomes public.
- Audit publish, update and unpublish operations.
- Keep public delivery generic; do not add platform routes such as `/website`, `/commerce` or `/ai-chat` for specific feature plugins.

## Faza 3.6 - Declarative Runtime UI

- Extend plugin contracts and SDK helpers with a minimal declarative UI schema for surfaces.
- Render declarative surfaces generically in Web with `@v2/ui-kit`.
- Keep the visual identity consistent for all declarative plugin UI.
- Allow first-party trusted React surfaces only as an optimization when the plugin is included in the deployment.
- Keep sandbox iframe rendering only for arbitrary external UI.

## Faza 4 - Typed iframe bridge

- Add `@v2/ui-bridge-contracts`.
- Support typed messages: `surface.ready`, `settings.read`, `settings.write`, `tool.request`, `notification.emit` and `navigation.request`.
- Validate and authorize every message against workspace, installed plugin, active surface and granted capability.
- Do not allow unrestricted `postMessage` command execution.

## Faza 5 - Agent AI Orchestrator

- Add provider-native tool calls.
- Support multiple tool calls per turn.
- Stream runtime events for model output, tool calls, approval waits, tool results and final responses.
- Standardize result envelopes for text, JSON, resource references and errors.
- Keep Core approvals mandatory. Agent AI orchestrates, but Core remains the policy, approval and audit authority.

## Faza 6 - DX and Guardrails

- Add and enforce `pnpm guard:architecture`.
- Add contract and policy tests for manifests, installs, capability grants, approvals, service identity and RBAC decisions.
- Prefer generated tests derived from manifests, contracts, schemas and declarative scenario files. Keep repetitive auth, marketplace, publication and architecture cases data-driven.
- Add `create:plugin` scaffolding for manifests, UI registry, worker, migrations and docs.
- Run strict CI with `pnpm typecheck`, web build, build analysis and architecture guard.
