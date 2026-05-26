# Plugin Marketplace

Core stores Marketplace identity records in its own D1 database, in `plugin_catalog`. Installable runtime artifacts are stored separately as catalog releases in `plugin_catalog_releases` and point at validated ZIP bundles in R2.

New workspaces are platform-only by default. They get workspace foundation data such as the workspace row, platform layout and platform settings, but no feature plugin is installed or activated automatically.

Official plugin manifests live with their plugin packages. For local development, seed their catalog identity records into the Core D1 catalog with:

```bash
pnpm marketplace:sync
```

The sync applies Core D1 migrations locally, then upserts official plugin manifests into `plugin_catalog`. It is only a seed/dev helper. It does not publish runtime releases, upload ZIP bundles, write to `installed_plugins`, write to `workspace_plugins` or touch plugin-owned databases.

## Runtime releases

A Marketplace plugin is installable only after an administrator publishes a release ZIP:

```text
POST /marketplace/plugins/:pluginId/releases
```

The publish endpoint:

1. validates the ZIP through `@v2/plugin-installer`;
2. stores the archive in `PLUGIN_PACKAGES` R2;
3. upserts the plugin identity in `plugin_catalog`;
4. writes a release row in `plugin_catalog_releases`;
5. does not install or activate the plugin in any workspace.

Installing a Marketplace plugin is explicit:

1. Web loads `GET /marketplace/plugins?workspaceId=...`.
2. The user installs a plugin from Marketplace.
3. Core selects the latest `published` release for that plugin.
4. Core reconstructs the `PluginBundle` from release metadata and runs the same `assessPluginBundle` path used by direct uploads.
5. If the bundle requires approval, Core creates a persistent `approval_requests` row and returns `approval-required` with an `approvalId`. Browser booleans such as `approved: true` are ignored and are not authorization.
6. After an administrator approves the request, install resumes with the approved `approvalId`. Core atomically consumes the approval and installs the release/package identity persisted in the approval payload, not a replacement bundle from the browser.
7. Capability grants remain explicit. Sensitive or dangerous capabilities are never granted automatically during install or activation.
8. Plugin-owned functional or demo data remains plugin-owned and is installed only through plugin/demo flows.

Public catalog reads may omit `workspaceId` and return catalog entries without workspace installed/active status. Any request that includes workspace installation or activation state requires an authenticated browser session or internal service identity.

Demo content is not workspace foundation. Demo packs should be exposed as Marketplace/plugin actions and installed manually.
