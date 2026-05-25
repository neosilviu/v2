# Core Worker

Core Worker is the v2 control plane for platform-owned state. It owns workspaces, plugin installation records, workspace activation state, capability grants, generic settings, shell layouts and audit events.

Core must remain operational with zero feature plugins installed. It stores and reads plugin manifest/runtime metadata, but it does not import feature plugin packages, plugin UI modules, plugin workers, provider adapters or feature schemas.

## Bindings

- `CORE_DB`: Cloudflare D1 database for Core-owned tables.
- `PLUGIN_PACKAGES`: Cloudflare R2 bucket for uploaded plugin ZIP packages.

## Routes

- `GET /health`: returns service health only.
- `GET /runtime/plugins`: lists installed plugin manifests.
- `GET /runtime/tools?workspaceId=...`: lists tools contributed by plugins active in the workspace.
- `GET /runtime/providers?workspaceId=...`: lists providers contributed by plugins active in the workspace.
- `GET /plugins/installed`: lists installed plugin manifests.
- `GET /workspaces/:workspaceId/plugins`: lists active plugin IDs for a workspace.
- `POST /plugins/upload`: accepts a ZIP with root `plugin.json`, stores the package in R2, and installs only when approval is not required.
- `POST /plugins/install`: installs a supplied bundle and activates it for the requested workspace when approved.
- `POST /plugins/activate`: activates an installed plugin in a workspace.
- `POST /plugins/deactivate`: deactivates an installed plugin in a workspace.
- `POST /plugins/grants`: replaces granted capabilities for a plugin in a workspace.
- `POST /tools/execute`: applies active-plugin and capability policy before emitting an accepted execution result.
- `GET /workspaces/:workspaceId/settings/:scope`: reads generic scoped settings.
- `PUT /settings`: writes a generic scoped setting.
- `GET /workspaces/:workspaceId/layout`: reads the persisted shell layout.
- `PUT /layouts`: writes the persisted shell layout.

## Runtime Hydration

Each request creates a fresh `RuntimeKernel` and hydrates it from installed manifest rows. This avoids leaking registered plugin state across workspaces or requests in a Worker isolate.

## Plugin Integration

Plugins integrate through stored manifest data and runtime contribution metadata. Core validates package metadata, persists manifests, activates/deactivates plugins per workspace and checks declared capabilities before granting them. Feature code, feature databases and feature UI stay inside plugin packages.
