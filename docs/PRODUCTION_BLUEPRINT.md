# Production Blueprint

This blueprint records the production administration closure needed before v2 moves from runtime foundation to operational plugins.

## Administration Closure

The platform is production-ready only when the Web shell can administer Core, Auth, Marketplace, public delivery and runtime UI composition without feature-specific pages for standard plugins.

Required administration surfaces:

- Settings as the primary runtime-composed administration hub.
- Runtime tab registry for platform and plugin tabs.
- Auth and account security controls backed by Auth Worker APIs.
- Domain trust controls backed by verified Core domain metadata and consumed by Auth server-side only.
- Marketplace lifecycle controls backed by Core catalog releases, R2 package metadata and persistent approvals.
- Interface controls backed by shell zones, placements and theme token persistence.

## Settings Tabs

The built-in platform tabs are runtime contributions:

- `platform.settings.general`
- `platform.settings.security`
- `platform.settings.domains`
- `platform.settings.marketplace`
- `platform.settings.interface`

Plugin tabs follow the same contract and appear only after install, activation and permission filtering. Deactivation or uninstall removes them from the active Settings registry.

## Runtime UI Rule

Settings panels use declarative templates from `@v2/ui-schema` and render through `TemplateRenderer` and `@v2/ui-kit`. D1 stores only validated schema, metadata, policy, activation and publication state.

Web may keep trusted built-in React components as temporary platform optimizations, but Marketplace runtime plugins must not require a Web rebuild.

## Auth Boundary

Auth Worker remains the only authority for identity, sessions, password, passkeys and OAuth. Public Login is runtime-driven, but Auth configuration is protected and audit-bound. OAuth secrets, passkey server settings and trusted-origin decisions remain server-side.

## Domain Boundary

Core owns workspace domain metadata and verification state. Auth must trust only verified and active domains delivered through a server-side boundary, never browser-supplied origins or public metadata alone.

## Current Implementation Status

- Built-in Settings tabs are seeded by Core as runtime contributions and resolved through authenticated Core APIs.
- Plugin Settings tabs and panels are contract-supported through `@v2/ui-schema`, `@v2/plugin-contracts` and `@v2/plugin-sdk`.
- Web Settings uses a runtime tab registry and generic `TemplateRenderer`; standard plugin Settings tabs do not require Web rebuilds.
- Auth administration has protected APIs for methods, policy, login UI contribution publication, security summary and sessions summary.
- Login is public and runtime-driven; passkey/social/signup visibility follows Auth DB publication and policy.
- Marketplace and Interface are integrated as platform Settings tabs while their trusted React components remain platform-owned optimizations.

Not yet complete:

- Production domain verification and trusted-origin replication.
- Full workspace RBAC.
- Auth-owned persistent audit table for admin changes.
- Dynamic Marketplace Worker execution via Dispatch Namespace or Workers for Platforms.
