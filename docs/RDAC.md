# RDAC Roadmap

RDAC is the official roadmap for v2 platform development. It keeps platform hardening ahead of new feature work and preserves the runtime-first boundary between Core, Auth, Web and feature plugins.

## Operating rule

Faza 0 must remain green before new platform or plugin features are accepted. Contributors must not move feature logic into Core, weaken capability approval, rewrite D1 migration history or bypass runtime contracts for convenience.

## Faza 0 - Immediate Correction Gate

- Close anonymous access to internal workspace data. Installed plugins, active plugins, runtime tools, runtime providers, workspace settings and workspace layout require an authenticated browser session or an internal service identity.
- Make the Marketplace runtime real: installable releases are backed by validated ZIP bundles stored in R2, not by catalog manifest copies alone.
- Route Marketplace installation through `@v2/plugin-installer` and the existing approval flow.
- Remove automatic grants for sensitive or dangerous capabilities. Installation and activation must not imply capability grants.
- Preserve D1 migration history incrementally. Add new generated migrations; do not rewrite prior migrations or change assigned D1 identifiers.
- Keep CI strict and keep PR #1 updated with the real HEAD, validation status and remaining Faza 0 risk.

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
- Add `create:plugin` scaffolding for manifests, UI registry, worker, migrations and docs.
- Run strict CI with `pnpm typecheck`, web build, build analysis and architecture guard.
