# Plugin Marketplace

Core stores the runtime Marketplace catalog in its own D1 database, in `plugin_catalog`.

New workspaces are platform-only by default. They get workspace foundation data such as the workspace row, platform layout and platform settings, but no feature plugin is installed or activated automatically.

Official plugin manifests live with their plugin packages. For local development, sync them into the Core D1 catalog with:

```bash
pnpm marketplace:sync
```

The sync applies Core D1 migrations locally, then upserts the official plugin manifests into `plugin_catalog`. It does not write to `installed_plugins`, `workspace_plugins` or plugin-owned databases.

Installing a Marketplace plugin is explicit:

1. Web loads `GET /marketplace/plugins?workspaceId=...`.
2. The user installs a plugin from Marketplace.
3. Core copies that catalog manifest into `installed_plugins`.
4. Core links the plugin to the workspace through `workspace_plugins`.
5. Plugin-owned functional or demo data remains plugin-owned and is installed only through plugin/demo flows.

Demo content is not workspace foundation. Demo packs should be exposed as Marketplace/plugin actions and installed manually.
