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
- The frontend standard is template-driven. Web owns only the shell, route guards, the generic renderer and a small catalog of reusable templates; standard plugins provide pages, surfaces, routes, data sources and actions declaratively at runtime.
- Declarative UI, activations, publications, policies and theme tokens are persisted in D1 as validated contracts and metadata. D1 must never store React components, executable JavaScript, ZIP payloads, OAuth secrets, API keys or provider tokens.
- Trusted React UI discovered at build time is only a deployment optimization for included first-party plugins, not the runtime Marketplace standard.
- `sandbox-frame` is reserved for external plugins that ship arbitrary unknown UI and therefore need browser isolation.
- Dynamic plugin Worker logic must use a separate execution model compatible with Cloudflare Workers for Platforms / Dispatch Namespace. Hardcoded service bindings remain appropriate only for services known at deploy time, such as Core, Auth and official deployed services.
- Auth Worker is a privileged platform service, not a normal Marketplace plugin. Login, session, OAuth and passkey handling are Auth-owned; ordinary plugins cannot inject executable code into them.
- Login UI is public but runtime-driven from Auth DB methods and declarative UI contributions. Public login config may expose enabled method labels, public provider IDs, order and safe renderer JSON only.
- Auth method configuration is admin/RBAC protected and audit-bound. Provider secrets and configuration references stay server-side and never appear in manifests, browser payloads or Core generic metadata.
- Future auth extensions require privileged capabilities such as `auth.ui.contribute`, `auth.method.social.configure`, `auth.method.passkey.configure` and `auth.policy.admin`, with explicit approval.
- Plugin install/update approval is persistent and one-shot. Browser booleans such as `approved: true` are not authorization; Core must store the exact release/package identity, SHA, workspace and sensitive capability list before an admin decision.
- New workspaces start with platform seed only. Core/Web/Auth/Settings data required for workspace operation may be seeded when the workspace is created, but feature plugins must remain uninstalled and inactive until an explicit Marketplace/install action.
- Plugin seed belongs to the plugin lifecycle. Some plugins may need idempotent default metadata, schemas, settings, internal records or operational fixtures; those are applied by the plugin install/update path for the target workspace, not by generic workspace creation.
- Demo data is opt-in. Development fixtures and demo content may be available for local testing or Marketplace demo installs, but they must not be installed automatically with a new workspace or hidden inside platform bootstrap.
- Public delivery routes may be exact or parameterized (`/:slug`, `/products/:id`) through validated route patterns only. Regexes, code and feature-specific host routes are not allowed.
- Declarative templates may request data sources and actions only through generic Core endpoints. Core validates activation/publication/policy and blocks execution unless a declared runtime worker dispatch boundary exists.
- Auth method server support is not public UI publication. Password signin can bootstrap as public; passkey, social and signup require explicit runtime Auth DB policy/publication.

## Faza 0 - Immediate Correction Gate

- Close anonymous access to internal workspace data. Installed plugins, active plugins, runtime tools, runtime providers, workspace settings and workspace layout require an authenticated browser session or an internal service identity.
- Keep public delivery separate from workspace internals. Auth technical endpoints remain Auth-owned; Core may expose only generic auth status, non-personalized catalog reads and explicitly published public contributions.
- Make the Marketplace runtime real: installable releases are backed by validated ZIP bundles stored in R2, not by catalog manifest copies alone.
- Route Marketplace installation through `@v2/plugin-installer` and the existing approval flow.
- Use persistent approval requests for plugin install/update. Approval requests are claimed atomically and consumed once; replayed or mismatched approvals must be audited and denied.
- Remove automatic grants for sensitive or dangerous capabilities. Installation and activation must not imply capability grants.
- Preserve D1 migration history incrementally. Add new generated migrations; do not rewrite prior migrations or change assigned D1 identifiers.
- Keep CI strict and keep PR #1 updated with the real HEAD, validation status and remaining Faza 0 risk.
- Add generic public publication persistence before feature-specific public pages such as website, commerce or AI chat are added.
- Resolve exact and parameterized public routes from `workspace_publications` with deterministic precedence and active-plugin/policy checks.
- Add the declarative plugin UI renderer foundation before relying on build-time trusted UI as the Marketplace mechanism.
- Add the policy-aware data/action dispatcher boundary for templates, but do not fake plugin worker execution before a real Dispatch Namespace or equivalent runtime model exists.

## Production Administration Closure

The platform is not considered production-usable until the administration shell is runtime-composed and can configure the platform without adding plugin-specific React pages to Web.

Production closure requires:

- Settings is a complete runtime hub backed by Core D1 contributions, activations, policies and audit.
- Auth, account security and trusted domain settings are configurable from protected administration UI.
- Login is fully runtime-driven from Auth DB methods, policy and declarative UI contributions.
- Marketplace install, upload, publish and approval status are reachable through the Settings hub.
- Every active plugin can contribute its own Settings tab through validated declarative contracts.
- Sensitive changes are permission, approval and audit aware.
- No Settings contribution requires rebuilding Web.

Platform Settings tabs are:

- General
- Security
- Domains
- Marketplace
- Interface

Plugin settings tabs are runtime contributions registered from installed and active plugin releases. Web must not hardcode plugin tabs.

General owns workspace display metadata, locale, timezone, currency, business identity metadata, notification sender status and service status. Security owns Auth policy publication, methods, login contribution publication, sessions/passkeys overview and bootstrap-admin warnings. Domains owns verified workspace domains, public delivery mappings and the safe boundary for Auth trusted origins. Marketplace owns runtime catalog/releases/install approval status. Interface owns shell zones, placements, theme tokens and enabled surfaces.

### Closure status

Current foundation status:

- Core exposes authenticated runtime Settings composition endpoints for tab registry, tab panel resolution, ordering and settings-scoped runtime data/actions.
- Core seeds the five built-in platform Settings tabs as runtime contributions in the existing D1 contribution/activation model.
- Core now has minimal workspace RBAC tables and permission checks for production administration routes.
- General, Security and Domains Settings have real runtime-backed panels for workspace metadata, Auth policy/method publication and workspace domain lifecycle.
- Plugin manifests can declare Settings tab and panel contributions through shared Zod contracts.
- Plugin Settings surfaces are also promoted into runtime Settings tabs after install/activation so existing declarative settings surfaces become visible without Web changes.
- Local Node has a vertical slice with typed contracts, runtime Settings contribution, Local Production surface and a mock-development-only runner health endpoint.
- Web renders `/settings?tab=<tabId>` from the Core Settings registry and treats `/marketplace` as the Marketplace tab alias.
- Marketplace and Interface administration are reachable through platform Settings tabs while their underlying platform components are still trusted built-in optimizations.
- Auth Worker exposes protected admin APIs for methods, policy, login UI contributions, security summary and sessions summary.
- Login uses public Auth runtime configuration, hides unpublished passkey/social methods and uses safe local redirects.
- Generated tests validate Settings contribution contracts and runtime Settings boundary presence.

Remaining before operational plugins:

- Full RBAC must replace bootstrap admin checks.
- Domain verification/activation persistence and Auth trusted-origin replication need the complete production workflow.
- Auth audit events should move from boundary documentation to persistent Auth-owned audit storage.
- Local Node, Agent AI operational streaming, Commerce and Website business logic remain out of scope until this closure stays green.

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

Auth configuration uses the same bootstrap rule until RBAC is available: temporary platform admins may publish login methods and login UI contributions, but this is recovery scaffolding rather than normal authorization.

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

Seed lifecycle is explicit:

- Workspace creation seeds only platform-owned operational contracts: workspace row, RBAC roles, built-in Settings tabs, shell/layout defaults, Auth/login policy defaults and other Core/Web/Auth metadata needed for an empty workspace to function.
- Marketplace catalog/release seed is a development convenience and makes plugins available for install, not installed. Catalog rows, ZIP/R2 release metadata and package availability must not create `workspace_plugins` rows or activate plugin UI.
- Plugin install/update applies plugin-owned seed for that plugin and workspace after release validation and approval checks. This can include required default settings, declarative UI contributions, plugin-owned schema/bootstrap records and non-demo operational defaults.
- Demo/sample data is a separate Marketplace action or explicit dev script. It can depend on an installed plugin, but must remain manually requested and auditable.
- Development helpers may seed richer local data, following the v1 split between `bootstrap:workspace:dev` and `provision:workspace:prod`; production provisioning stays minimal, idempotent and non-destructive.
- Generated/local plugin registries may synthesize catalog entries during development, but install and activation state remain workspace-scoped and materialized only by Marketplace or plugin install/update flows.

## Faza 3.5 - Public Delivery Foundation

- Extend plugin contracts with generic public route, public surface and public tool candidate contributions.
- Persist explicit workspace publications in Core through `workspace_publications`.
- Persist public access policies in Core through `public_access_policies`.
- Require publication before any plugin-declared route, surface or tool candidate becomes public.
- Audit publish, update and unpublish operations.
- Keep public delivery generic; do not add platform routes such as `/website`, `/commerce` or `/ai-chat` for specific feature plugins.

## Faza 3.6 - Declarative Runtime UI

- Extend plugin contracts and SDK helpers with declarative UI schemas for surfaces, pages, templates, data sources, actions, fields, columns and slots.
- Render declarative surfaces and pages generically in Web with `@v2/ui-kit`.
- Use reusable templates such as admin dashboard, table, detail, form, settings, approvals, chat, auth login and public content/product/cart/checkout/chat views.
- Keep the visual identity consistent for all declarative plugin UI.
- Resolve private and public routing from manifests, workspace activation, publications and policies. A `public-candidate` route is never public until explicitly published for a workspace.
- Persist declarative contributions in Core D1 through `plugin_ui_contributions`, `workspace_ui_activations`, `workspace_publications`, `public_access_policies` and `workspace_theme_tokens`.
- Auth-owned runtime login configuration is persisted separately in Auth D1 through `auth_methods` and `auth_ui_contributions`; Auth passkey data remains in Auth D1 through the Better Auth passkey schema.
- Plugin installation stores validated declarative contributions. Workspace activation enables private surfaces. Public publication is a separate permission-gated operation and never happens automatically.
- Allow first-party trusted React surfaces only as an optimization when the plugin is included in the deployment.
- Keep sandbox iframe rendering only for arbitrary external UI.

Login contributions use the same declarative renderer boundary. They may decorate approved login slots, but they must not replace Auth Worker forms with plugin-owned JavaScript or iframes.

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
