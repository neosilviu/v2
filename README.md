# v2

AI-native runtime platform built around a minimal core, isolated authentication, configurable shell zones, and extensible plugins.

## Architecture principles

- **Runtime-first**: features register contributions rather than hardcoding application pages.
- **Minimal core**: core owns workspaces, settings, layouts, theme state, plugin installation and permission control.
- **Isolated auth**: Better Auth runs behind a dedicated auth worker and database boundary.
- **Extensible UI**: the web shell hosts runtime zones, settings contributions and plugin surfaces using a shared UI kit.
- **AI-native**: `agent-ai` supports channels, providers, tools and approvals.
- **Plugin packages**: built-in and ZIP-installed plugins can contribute UI and logic with explicit capabilities.

## Planned workspace structure

```text
apps/
  core-worker/    Platform control plane and native plugin manager
  auth-worker/    Better Auth service boundary
  web/            Compact configurable shell UI
packages/
  plugin-contracts/
  plugin-sdk/
  rpc-contracts/
  shared/
  ui-kit/
  ui-runtime/
plugins/
  agent-ai/
  theme-studio/
```

## Storage ownership

- Core owns workspace/platform data and native plugin metadata.
- Auth owns identity/session/account data.
- Lightweight plugins can use platform or namespaced storage through controlled APIs.
- Large plugins can request dedicated bindings/resources.

## Status

Foundation bootstrap in progress.
